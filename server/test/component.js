"use strict";

var rewire = require('rewire');
var chai = require('chai');
var assert = chai.assert;
var request = require('supertest');
var restify = require('restify');
var logger = require('winston').loggers.get('elasticsearch');
logger.transports.console.silent = true;

var config = {
    "redis": {"host": "127.0.0.1", "port": 6379},
    "server": {"port": 8080},
    "allowedMethods": ["GET", "PUT", "DELETE"],
    "database": process.env.USE_REDIS ? "fakeRedis" : "redis"
};

var v1Module = rewire('../lib/v1');
var v1 = v1Module(config);
var db = v1Module.__get__("db");

function deleteAndSetDb(type, values) {
    return db.delKey(values[0])
        .flatMap(db[type].apply(db, values));
}

describe("should not crash on 404s - REDIS ONLY", () => {
    //this test creates a proper node server. Mocha kills all processes at the end of the test

    // as a real server is created, this test must have a redis instance and
    // port 8080 open. If process.env.USE_REDIS is set to false, this test is skipped
    if (process.env.USE_REDIS) {
        var sa = require("superagent");
        before(done => {
            require("../server.js")(config);
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
                });
        });
    } else {
        it("skips this test as it requires redis", done => done());
    }
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