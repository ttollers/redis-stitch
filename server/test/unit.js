"use strict";

var rewire = require('rewire');
var chai = require('chai');
var assert = chai.assert;
var v1 = rewire('../lib/v1');
var R = require('ramda');
var hl = require('highland');
var request = require('supertest');
var restify = require('restify');
var logger = require('winston').loggers.get('elasticsearch');
logger.transports.console.silent = true;

function redisOrFaker(redis, db) {
    if (redis === "true") {
        console.log('Using redis for test database.')
        // use a local version of redis listening on port 6379
        db.connect();
        return db;
    } else {
        // use faker
        return db;
    }
}

// Set USE_REDIS to true to use a local version of redis. You may need to do a flushdb
var db = redisOrFaker(process.env.USE_REDIS, v1.__get__('db'));

function deleteAndSetDb(type, values) {
    return db.delKey(values[0])
        .flatMap(db[type].apply(db, values));
}

describe('unit tests', () => {

    describe('hydrateKey', () => {

        var hydrateKey = v1.__get__('hydrateString');
        it('should pluck values which are plain string', (done) => {
            deleteAndSetDb("setKey", ["key", "value"])
                .flatMap(hydrateKey({}, '${key}'))
                .map(value => assert.equal(value, 'value'))
                .pull(done)
        });

        it('should pluck values which are list values', (done) => {
            deleteAndSetDb("addToKey", ["key", 0, "value1"])
                .flatMap(db.addToKey("key", 1, "value2"))
                .flatMap(hydrateKey({}, '${key}'))
                .map(value => assert.equal(value, '[value1,value2]'))
                .pull(done)
        });

        it('should pull from local if it can', (done) => {
            deleteAndSetDb("setKey", ["key", "${value}, ${duplicate}"])
                .flatMap(deleteAndSetDb("setKey", ["value", "${duplicate}"]))
                .flatMap(deleteAndSetDb("setKey", ["duplicate", "duplicates"]))

                .flatMap(hydrateKey({}, '${key}'))
                .map(value => assert.equal(value, 'duplicates, duplicates'))
                .pull(done);
        });

        it('should error when there is no data', (done) => {
            db.delKey("key")
                .flatMap(hydrateKey({}, '${key}'))
                .pull((err, data) => {
                    assert.notOk(data);
                    assert.ok(err, 'there is an error');
                    assert.ok(err.body, err);
                    assert.equal(err.statusCode, 404, 'it is a 404');
                    done()
                })
        });

        it('should hydrate values which contain ${ref}', (done) => {
            deleteAndSetDb("setKey", ["key", "hello ${area}"])
                .flatMap(db.setKey("area", "world"))
                .flatMap(hydrateKey({}, '${key}'))
                .map(value => assert.equal(value, 'hello world'))
                .pull(done)
        });

        it('should return the default value from ${ref|def} if ref doesn\'t exist', (done) => {
            deleteAndSetDb("setKey", ["key", "hello ${area;nothing}"])
                .flatMap(db.delKey("area"))
                .flatMap(hydrateKey({}, '${key}'))
                .map(value => assert.equal(value, 'hello nothing'))
                .pull(done)
        });

        it('should return the default value from ${ref|def} if ref doesn\'t exist even if this is the string "null"', (done) => {
            deleteAndSetDb("setKey", ["key", "hello ${area;null}"])
                .flatMap(db.delKey("area"))
                .flatMap(hydrateKey({}, '${key}'))
                .map(value => assert.equal(value, 'hello null'))
                .pull(done)
        });

        it('should deep hydrate values which contain ${ref}', (done) => {
            deleteAndSetDb("setKey", ["key", "welcome to ${area}"])
                .flatMap(db.setKey("area", "my ${place}"))
                .flatMap(db.setKey("place", "world"))
                .flatMap(hydrateKey({}, '${key}'))
                .map(value => assert.equal(value, 'welcome to my world'))
                .pull(done)
        });

        it('should not blow the stack on long lists', (done) => {

            var streams = [];
            var expected = "[";
            for (var i = 0; i < 150; i++) {
                streams.push(db.addToKey("long-list", i, "${value" + i + "}"))
                streams.push(db.setKey("value" + i, "something" + i))
                expected += "something" + i + ",";
            }

            hl(streams)
                .merge()
                .flatMap(hydrateKey({}, '${long-list}'))
                .tap(value => assert.equal(value, expected.substring(0, expected.length - 1) + "]"))
                .pull(done)
        });

        describe('mimic a live centre post', () => {

            var expected;

            describe("test set up", () => {
                it("sets the database", done => {
                    var streams = [];
                    expected = "[";
                    for (var i = 0; i < 150; i++) {
                        streams.push(db.addToKey("live-centre-list", i, "${layer/1/" + i + "}"));
                        streams.push(db.setKey("layer/1/" + i, "${layer/2/" + i + "} ${layer/3/" + i + "}"));
                        streams.push(db.setKey("layer/2/" + i, "something" + i));
                        streams.push(db.setKey("layer/3/" + i, "else" + i));
                        expected += "something" + i + " " + "else" + i + ",";
                    }

                    hl(streams)
                        .merge()
                        .pull(done);
                });
            });

            describe("runs the test", () => {
                it("runs hydrateKey", done => {
                    hydrateKey({}, '${live-centre-list}')
                        .tap(value => assert.equal(value, expected.substring(0, expected.length - 1) + "]"))
                        .pull(done)
                });
            });
        });

        describe('mimic a section pools', (done) => {

            describe("test set up", () => {
                it("sets the database", done => {
                    var streams = [];
                    for (var i = 0; i < 40; i++) {
                        streams.push(db.addToKey("list", i, "${layer/1/" + i + "}"));
                        streams.push(db.setKey("layer/1/" + i, "${layer/2/" + i + "} ${gallery/" + i + "}"));
                        streams.push(db.setKey("layer/2/" + i, "something" + i + ":"));
                        streams.push(db.setKey("gallery/" + i, "[${image/1/" + i + "}, ${image/2/" + i + "}, ${image/3/" + i + "}, ${image/4/" + i + "}]"));
                        streams.push(db.setKey("image/1/" + i, "image-1-" + i));
                        streams.push(db.setKey("image/2/" + i, "image-2-" + i));
                        streams.push(db.setKey("image/3/" + i, "image-3-" + i));
                        streams.push(db.setKey("image/4/" + i, "image-4-" + i));
                    }
                    hl(streams)
                        .merge()
                        // TODO assertion (a very long string is returned)
                        .pull(done);
                });
            });

            describe("runs the test", () => {
                it("runs hydrateKey", done => {
                    hydrateKey({}, '${list}')
                    //.tap(console.log)
                        .pull(done)
                });
            });
        });

        it('should hydrate part containing ${ref,prop,subprop}', (done) => {
            deleteAndSetDb("setKey", ["key", "step 1: ${steps,one}, step 2: ${steps,two,three}, step 3: Profit"])
                .flatMap(deleteAndSetDb("setKey", ["steps", '{"one": "write a fan-fiction", "two": { "three": "make movie of it"} }']))
                .flatMap(hydrateKey({}, '${key}'))
                .map(value => assert.equal(value, 'step 1: write a fan-fiction, step 2: make movie of it, step 3: Profit'))
                .pull(done)
        });

        it('should error if a prop doesn\'t exist', (done) => {
            deleteAndSetDb("setKey", ["key", "welcome to ${area,one}"])
                .flatMap(deleteAndSetDb("setKey", ["area", "{}"]))
                .flatMap(hydrateKey({}, '${key}'))
                .pull((err, data) => {
                    assert.notOk(data);
                    assert.ok(err, 'there is an error');
                    assert.ok(err.body, err);
                    assert.equal(err.statusCode, 404, 'it is a 404');
                    done()
                })
        });

        it('should hydrate multiple values which contain ${ref}', (done) => {
            deleteAndSetDb("setKey", ["key", "hello ${area}, it is such a ${compliment} ${timePeriod}"])
                .flatMap(deleteAndSetDb("setKey", ["area", "world"]))
                .flatMap(deleteAndSetDb("setKey", ["compliment", "great"]))
                .flatMap(deleteAndSetDb("setKey", ["timePeriod", "day"]))
                .flatMap(hydrateKey({}, '${key}'))
                .map(value => assert.equal(value, 'hello world, it is such a great day'))
                .pull(done)
        });

        it('CRON-280 should no longer happen', (done) => {
            deleteAndSetDb("setKey", ["key", "${foo;null}"])
                .flatMap(deleteAndSetDb("setKey", ["foo", '{"man": "${bar,a;}", "choo": "${bar,b;}" }']))
                .flatMap(hydrateKey({}, '${key}'))
                .map(value => assert.deepEqual(JSON.parse(value), {man: '', choo: ''}))
                .pull(done)
        });

        it("should not error if a dollar sign is used in articles", (done) => {
            deleteAndSetDb("setKey", ["key", "this is some text which has a $sign in it like when talking about $100 bills n stuff"])
                .flatMap(hydrateKey({}, "${key}"))
                .map(value => assert.equal(value, "this is some text which has a $sign in it like when talking about $100 bills n stuff"))
                .pull(done);
        });

        it('should error when there is cycle', (done) => {

            deleteAndSetDb("setKey", ["key", "${key}"])
                .flatMap(hydrateKey({}, '${key}'))
                .pull((err, data) => {
                    assert.notOk(data);
                    assert.ok(err, 'there is an error');
                    assert.ok(err.body, 'it is a HttpError');
                    assert.notEqual(err.statusCode, 200, 'it is an error');
                    done()
                })
        });

        it('should error on nested cycles', (done) => {
            deleteAndSetDb("setKey", ["key", "${value}"])
                .flatMap(deleteAndSetDb("setKey", ["value", "${key}"]))
                .flatMap(hydrateKey({}, '${key}'))
                .pull((err, data) => {
                    assert.notOk(data);
                    assert.ok(err, 'there is an error');
                    assert.ok(err.body, 'it is a HttpError');
                    assert.notEqual(err.statusCode, 200, 'it is an error');
                    done()
                })
        });

        describe("Edge case when string is added to database inbetween getMultiple and listKey", () => {
            var sinon = require("sinon");
            var edgeV1 = rewire('../lib/v1');
            var edgeHydrateString = edgeV1.__get__("hydrateString");

            edgeV1.__set__("db", {
                "getMultiple": sinon.stub(),
                "listKey": sinon.stub()
            });

            edgeV1.__set__("db", {
                "getMultiple": sinon.stub(),
                "listKey": sinon.stub()
            });
            var edgeDb = edgeV1.__get__("db");

            edgeDb.getMultiple.onCall(0).returns(hl([[null]]));
            edgeDb.getMultiple.onCall(1).returns(hl([["data"]]));

            var e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
            e.code = 'WRONGTYPE';

            edgeDb.listKey.returns(hl((push) => push(e)));

            it("should loop back if get a wrongType error", (done) => {
                edgeHydrateString({}, "${key}")
                    .pull((err, res) => {
                        assert.equal(res, "data");
                        done(err);
                    });
            })
        });
    });

    describe('v1 api', () => {
        var restify = require('restify');
        var app = restify.createServer();
        app.use(restify.queryParser());
        app.get(/.*/, v1.get);
        app.put(/.*/, v1.put);
        app.del(/.*/, v1.del);

        describe('get', () => {
            it('should 404 when there is no data', (done) => {
                db.delKey("/v1/hello/world")
                    .pull(() => {
                        request(app)
                            .get('/v1/hello/world')
                            .expect(404)
                            .end(done);
                    })
            });

            it('should get string data saved in redis', (done) => {
                deleteAndSetDb("setKey", ["/v1/hello/world", "my value"])
                    .pull(() => {
                        request(app)
                            .get('/v1/hello/world')
                            .expect(200, 'my value')
                            .end(done);
                    })
            });

            it('should get list data saved in redis', (done) => {
                deleteAndSetDb("setKey", ["/v1/hello/world", "my value"])
                    .flatMap(deleteAndSetDb("setKey", ["/v1/hello/world2", "my value2"]))
                    .flatMap(deleteAndSetDb("setKey", ["/v1/hello/world3", "my value3"]))
                    .flatMap(deleteAndSetDb("addToKey", ["/v1/list", 0, "${/v1/hello/world}"]))
                    .flatMap(db.addToKey("/v1/list", 2, "${/v1/hello/world2}"))
                    .flatMap(db.addToKey("/v1/list", 3, "${/v1/hello/world3}"))
                    .pull(() => {
                        request(app)
                            .get('/v1/list')
                            .expect(200, '[my value,my value2,my value3]')
                            .end(done);
                    })
            });

        });

        describe("should not crash on 404s - REDIS ONLY", () => {
            //this test creates a proper node server. Mocha kills all processes at the end of the test

            // as a real server is created, this test must have a redis instance and
            // port 8080 open. If process.env.USE_REDIS is set to false, this test is skipped
            if(process.env.USE_REDIS) {

                var sa = require("superagent");
                before(done => {
                    require("../server.js");
                    done();
                });

                it('should 404 and not crash on nested resources', (done) => {
                    db.delKey("no-ref")
                        .flatMap(deleteAndSetDb("setKey", ["/v1/hello/world", "${no-ref}"]))
                        .pull(() => {
                            sa.get('http://localhost:8080/v1/hello/world')
                                .end((err) => {
                                    assert.equal(err.status, 404);
                                    done();
                                });
                        })
                });
            } else {
                it("skips this test as it requires redis", done => done());
            }
        });

        describe('put value', () => {
            it('should put a value into the db', (done) => {
                db.delKey("/v1/hello/world")
                    .pull(() => {
                        request(app)
                            .put('/v1/hello/world')
                            .send('my value')
                            .expect(204)
                            .end(() => {
                                db.getKey('/v1/hello/world')
                                    .tap(x => assert.equal(x, 'my value'))
                                    .pull(done);
                            });
                    });
            });
        });

        describe('put list', () => {
            it('should put a value into a list the db', (done) => {
                db.delKey("/v1/hello/world")
                    .pull(() => {
                        request(app)
                            .put('/v1/hello/world')
                            .query({score: 0})
                            .send('my value')
                            .expect(204)
                            .end(() => {
                                db.listKey('/v1/hello/world', Infinity, -Infinity, Infinity)
                                    .tap(x => assert.deepEqual(x, ["my value"]))
                                    .pull(done);
                            });
                    })
            });
        });

        describe('del', () => {
            it('should delete values from the db', (done) => {
                deleteAndSetDb("setKey", ["/v1/hello/world", "my value"])
                    .pull(() => {
                        request(app)
                            .del('/v1/hello/world')
                            .expect(204)
                            .end(() => {
                                db.getKey("/v1/hello/world")
                                    .pull((err, result) => {
                                        assert.isNull(result);
                                        done(err);
                                    })
                            });
                    })
            });

            it('should delete values from a list in the db', (done) => {

                deleteAndSetDb("setKey", ["/v1/hello/world", "my value"])
                    .flatMap(deleteAndSetDb("setKey", ["/v1/hello/world2", "my value2"]))
                    .flatMap(deleteAndSetDb("setKey", ["/v1/hello/world3", "my value3"]))
                    .flatMap(deleteAndSetDb("addToKey", ["/v1/list", 0, "${/v1/hello/world}"]))
                    .flatMap(db.addToKey("/v1/list", 2, "${/v1/hello/world2}"))
                    .flatMap(db.addToKey("/v1/list", 3, "${/v1/hello/world3}"))
                    .pull(() => {
                        request(app)
                            .del('/v1/list')
                            .expect(204)
                            .query({value: '${/v1/hello/world2}'})
                            .end(() => {
                                db.listKey("/v1/list", Infinity, -Infinity, Infinity)
                                    .tap(x => assert.deepEqual(x.length, 2))
                                    .pull(done);
                            });
                    });
            });

            it('should delete values from a list by score', (done) => {
                deleteAndSetDb("setKey", ["/v1/hello/world", "my value"])
                    .flatMap(deleteAndSetDb("setKey", ["/v1/hello/world2", "my value2"]))
                    .flatMap(deleteAndSetDb("setKey", ["/v1/hello/world3", "my value3"]))
                    .flatMap(deleteAndSetDb("addToKey", ["/v1/list", 0, "${/v1/hello/world}"]))
                    .flatMap(db.addToKey("/v1/list", 2, "${/v1/hello/world2}"))
                    .flatMap(db.addToKey("/v1/list", 3, "${/v1/hello/world3}"))
                    .pull(() => {
                        request(app)
                            .del('/v1/list')
                            .expect(204)
                            .query({value: 2})
                            .end(() => {
                                db.listKey("/v1/list", Infinity, -Infinity, Infinity)
                                    .tap(x => assert.deepEqual(x.length, 2))
                                    .pull(done);
                            });
                    })
            });
        });
    });
});