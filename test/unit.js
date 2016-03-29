var rewire = require('rewire');
var chai = require('chai');
var assert = chai.assert;
var v1 = rewire('../lib/v1');
var R = require('ramda');
var hl = require('highland');
var request = require('supertest');
var restify = require('restify');

var db = v1.__get__('db');
// TODO: these tests should be modified to not use db.store and should instead use the api to get/set vaules
describe('unit tests', () => {
    beforeEach(() => db.store = {});
    describe('hydrateKey', () => {
        var hydrateKey = v1.__get__('hydrateKey');

        it('should pluck values which are plain string', (done) => {
            db.store = {key: 'value'};
            hydrateKey({}, 'key', [])
                .map(value => assert.equal(value, 'value'))
                .pull(done)
        });

        it('should pluck values which are list values ', (done) => {
            db.store = {key: {value1: 0, 'value2': 1}};
            hydrateKey({}, 'key', [])
                .map(value => assert.equal(value, '[value1,value2]'))
                .pull(done)
        });

        it('should pull from local if it can', (done) => {
            db.store = {key: 'value'};
            hydrateKey({key: 'local'}, 'key', [])
                .map(value => assert.equal(value, 'local'))
                .pull(done)
        });

        it('should error when there is no data', (done) => {
            db.store = {};
            hydrateKey({}, 'key', [])
                .pull((err, data) => {
                    assert.notOk(data);
                    assert.ok(err, 'there is an error');
                    assert.ok(err.body, err);
                    assert.equal(err.statusCode, 404, 'it is a 404');
                    done()
                })
        });

        it('should hydrate values which contain ${ref}', (done) => {
            db.store = {
                key: 'hello ${area}',
                area: 'world'
            };
            hydrateKey({}, 'key', [])
                .map(value => assert.equal(value, 'hello world'))
                .pull(done)
        });

        it('should return the default value from ${ref|def} if ref doesn\'t exist', (done) => {
            db.store = {
                key: 'hello ${area;nothing}'
            };
            hydrateKey({}, 'key', [])
                .map(value => assert.equal(value, 'hello nothing'))
                .pull(done)
        });

        it('should return the default value from ${ref|def} if ref doesn\'t exist even if this is the string "null"', (done) => {
            db.store = {
                key: 'hello ${area;null}'
            };
            hydrateKey({}, 'key', [])
                .map(value => assert.equal(value, 'hello null'))
                .pull(done)
        });

        it('should deep hydrate values which contain ${ref}', (done) => {
            db.store = {
                key: 'welcome to ${area}',
                area: 'my ${place}',
                place: 'world'
            };
            hydrateKey({}, 'key', [])
                .map(value => assert.equal(value, 'welcome to my world'))
                .pull(done)
        });

        it('should not blow the stack on long lists', (done) => {
            db.store = {
                key: '[' + R.repeat('${value}', 150).join(',') + ']',
                value: 'something'
            };
            hydrateKey({}, 'key', [])
                .map(value => assert.equal(value, '[' + R.repeat('something', 150).join(',') + ']'))
                .pull(done)
        });

        it('should hydrate part containing ${ref,prop,subprop}', (done) => {
            db.store = {
                key: 'step 1: ${steps,one}, step 2: ${steps,two,three}, step 3: Profit',
                steps: '{"one": "write a fan-fiction", "two": { "three": "make movie of it"} }'
            };
            hydrateKey({}, 'key', [])
                .map(value => assert.equal(value, 'step 1: write a fan-fiction, step 2: make movie of it, step 3: Profit'))
                .pull(done)
        });

        it('should error if a prop doesn\'t exist', (done) => {
            db.store = {
                key: 'welcome to ${area,one}',
                area: '{}'
            };
            hydrateKey({}, 'key', [])
                .pull((err, data) => {
                    assert.notOk(data);
                    assert.ok(err, 'there is an error');
                    assert.ok(err.body, err);
                    assert.equal(err.statusCode, 404, 'it is a 404');
                    done()
                })
        });

        it('should hydrate multiple values which contain ${ref}', (done) => {
            db.store = {
                key: 'hello ${area}, it is such a ${compliment} ${timePeriod}',
                area: 'world',
                compliment: 'great',
                timePeriod: 'day'
            };
            hydrateKey({}, 'key', [])
                .map(value => assert.equal(value, 'hello world, it is such a great day'))
                .pull(done)
        });


        it('CRON-280 should no longer happen', (done) => {
            db.store = {
                "key": "${foo;null}",
                "foo": '{"man": "${bar,a;}", "choo": "${bar,b;}" }',
            };
            hydrateKey({}, 'key', [])
                .map(value => assert.deepEqual(JSON.parse(value), {man: '', choo: ''}))
                .pull(done)
        });

        it('should error when there is cycle', (done) => {
            db.store = {key: '${key}'};
            hydrateKey({}, 'key', [])
                .pull((err, data) => {
                    assert.notOk(data);
                    assert.ok(err, 'there is an error');
                    assert.ok(err.body, 'it is a HttpError');
                    assert.notEqual(err.statusCode, 200, 'it is an error');
                    done()
                })
        })
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
                request(app)
                    .get('/v1/hello/world')
                    .expect(404)
                    .end(done);
            });

            it('should get string data saved in redis', (done) => {
                db.store = {'/v1/hello/world': 'my value'};
                request(app)
                    .get('/v1/hello/world')
                    .expect(200, 'my value')
                    .end(done);
            });

            it('should get list data saved in redis', (done) => {
                db.store = {
                    '/v1/hello/world': 'my value',
                    '/v1/hello/world2': 'my value2',
                    '/v1/hello/world3': 'my value3',
                    '/v1/list': {
                        '${/v1/hello/world}': 0,
                        '${/v1/hello/world2}': 2,
                        '${/v1/hello/world3}': 3
                    }

                };
                request(app)
                    .get('/v1/list')
                    .expect(200, '[my value,my value2,my value3]')
                    .end(done);
            });

        });

        describe('put', () => {
            it('should put a value into the db', (done) => {
                request(app)
                    .put('/v1/hello/world')
                    .send('my value')
                    .expect(204)
                    .expect(() => assert.equal(db.store['/v1/hello/world'], 'my value'))
                    .end(done);
            });

            it('should put a value into a list the db', (done) => {
                request(app)
                    .put('/v1/hello/world')
                    .query({score: 0})
                    .send('my value')
                    .expect(204)
                    .expect(() => assert.deepEqual(db.store['/v1/hello/world'], {'my value': 0}))
                    .end(done);
            });
        });

        describe('del', () => {
            it('should delete values from the db', (done) => {
                db.store = {'/v1/hello/world': 'my value'};
                request(app)
                    .del('/v1/hello/world')
                    .expect(204)
                    .expect(() => assert.notOk(db['/v1/hello/world']))
                    .end(done);
            });

            it('should delete values from a list in the db', (done) => {
                db.store = {
                    '/v1/hello/world': 'my value',
                    '/v1/hello/world2': 'my value2',
                    '/v1/hello/world3': 'my value3',
                    '/v1/list': {
                        '${/v1/hello/world}': 0,
                        '${/v1/hello/world2}': 2,
                        '${/v1/hello/world3}': 3
                    }
                };
                request(app)
                    .del('/v1/list')
                    .expect(204)
                    .query({value: '${/v1/hello/world2}'})
                    .expect(() => assert.deepEqual(db.store, {
                        '/v1/hello/world': 'my value',
                        '/v1/hello/world2': 'my value2',
                        '/v1/hello/world3': 'my value3',
                        '/v1/list': {
                            '${/v1/hello/world}': 0,
                            '${/v1/hello/world3}': 3
                        }
                    }))
                    .end(done);
            });

            it('should delete values from a list by score', (done) => {
                db.store = {
                    '/v1/hello/world': 'my value',
                    '/v1/hello/world2': 'my value2',
                    '/v1/hello/world3': 'my value3',
                    '/v1/list': {
                        '${/v1/hello/world}': 0,
                        '${/v1/hello/world2}': 2,
                        '${/v1/hello/world3}': 3
                    }
                };
                request(app)
                    .del('/v1/list')
                    .expect(204)
                    .query({value: 2})
                    .expect(() => assert.deepEqual(db.store, {
                        '/v1/hello/world': 'my value',
                        '/v1/hello/world2': 'my value2',
                        '/v1/hello/world3': 'my value3',
                        '/v1/list': {
                            '${/v1/hello/world}': 0,
                            '${/v1/hello/world3}': 3
                        }
                    }))
                    .end(done);
            });
        });
    });

    describe('sdk', () => {
        var presentationService = require('../sdk');
        var ps = presentationService();
        var save = {};

        it('exists', () => assert.ok(ps));

        it('has a put method', (done)=> {
            assert(R.has('put', ps));
            ps.put('/v1/nationals-live/6679834/130', '{ "data": "this is just some data" }')
                .map(() => {
                    assert.ok(ps.db['/v1/nationals-live/6679834/130']);
                    save["put /v1/nationals-live/6679834/130"] = R.clone(ps.db);
                })
                .pull(done)
        });

        it('put is idempotent', (done)=> {
            assert(R.has('put', ps));
            ps.db = save["put /v1/nationals-live/6679834/130"]; //TODO shouldn't be dependent on previous tests
            ps.put('/v1/nationals-live/6679834/130', '{ "data": "this is just some data" }')
                .map(() => {
                    assert.deepEqual(ps.db, save["put /v1/nationals-live/6679834/130"])
                })
                .pull(done)
        });

        it('has a putObject method', (done)=> {
            ps.putObject('/v1/nationals-live/1234567', {
                    "data": {
                        "type": "un-stringified data",
                    },
                    "reference": {
                        $ref: "${/v1/ref-to-something/7654321}"
                    }

                })
                .map(() => {
                    assert.ok(ps.db['/v1/nationals-live/1234567']);
                    assert.equal(ps.db['/v1/nationals-live/1234567'], "{\"data\": {\"type\": \"un-stringified data\"}, \"reference\": ${/v1/ref-to-something/7654321}}")
                })
                .pull(done)
        });

        it('has a get method', (done)=> {
            assert(R.has('get', ps));
            ps.db = save["put /v1/nationals-live/6679834/130"]; //TODO shouldn't be dependent on previous tests
            ps.get('/v1/nationals-live/6679834/130')
                .map(_ => {
                    assert.ok(_);
                    assert.equal(_.data, 'this is just some data')
                })
                .pull(done)
        });

        it('get throws on 404', (done)=> {
            assert(R.has('get', ps));
            ps.get('/v1/nationals-live/6679834/131')
                .pull(err => {
                    assert(R.is(Error, err), 'throws an err');
                    assert.equal(err.message, '/v1/nationals-live/6679834/131 not available');
                    done()
                })
        });

        it('has a del method', (done)=> {
            assert(R.has('del', ps));
            ps.db = save["put /v1/nationals-live/6679834/130"]; //TODO shouldn't be dependent on previous tests
            ps.del('/v1/nationals-live/6679834/130')
                .map(() => {
                    assert.notOk(ps.db['/v1/nationals-live/6679834/130'])
                })
                .pull(done)
        });

        it('has a add method', (done)=> {
            assert(R.has('add', ps));
            ps.add('/v1/nationals-live/6679834', 0, '${/v1/nationals-live/6679834/130}')
                .map(() => {
                    assert(ps.db['/v1/nationals-live/6679834']['${/v1/nationals-live/6679834/130}'] === 0);
                    save["add to /v1/nationals-live/6679834"] = R.clone(ps.db);
                })
                .pull(done)
        });

        it('add is idempotent', (done)=> {
            assert(R.has('add', ps));
            ps.db = save["add to /v1/nationals-live/6679834"]; //TODO shouldn't be dependent on previous tests
            ps.add('/v1/nationals-live/6679834', 0, '${/v1/nationals-live/6679834/130}')
                .map(() => {
                    assert.deepEqual(ps.db, save["add to /v1/nationals-live/6679834"]);
                })
                .pull(done)
        });

        it('has a rem method', (done)=> {
            assert(R.has('rem', ps));
            ps.db = save["add to /v1/nationals-live/6679834"]; //TODO shouldn't be dependent on previous tests
            ps.rem('/v1/nationals-live/6679834', '${/v1/nationals-live/6679834/130}')
                .map(() => {
                    assert.notOk(ps.db['/v1/nationals-live/6679834']['${/v1/nationals-live/6679834/130}']);
                    save["rem on /v1/nationals-live/6679834"] = R.clone(ps.db);
                })
                .pull(done)
        });

        it('rem is idempotent', (done)=> {
            assert(R.has('rem', ps));
            ps.db = save["rem on /v1/nationals-live/6679834"]; //TODO shouldn't be dependent on previous tests
            ps.rem('/v1/nationals-live/6679834', '${/v1/nationals-live/6679834/130}')
                .map(() => {
                    assert.deepEqual(ps.db, save["rem on /v1/nationals-live/6679834"])
                })
                .pull(done)
        });

        it('get works on lists', (done)=> {
            hl.merge([
                    ps.add('/v1/nationals-live/6679834', 3, '${/v1/nationals-live/6679834/133}'),
                    ps.add('/v1/nationals-live/6679834', 1, '${/v1/nationals-live/6679834/131}'),
                    ps.add('/v1/nationals-live/6679834', 2, '${/v1/nationals-live/6679834/132}'),
                    ps.add('/v1/nationals-live/6679834', 0, '${/v1/nationals-live/6679834/130}'),
                    ps.put('/v1/nationals-live/6679834/130', '{ "data": "this is just some data0" }'),
                    ps.put('/v1/nationals-live/6679834/131', '{ "data": "this is just some data1" }'),
                    ps.put('/v1/nationals-live/6679834/132', '{ "data": "this is just some data2" }'),
                    ps.put('/v1/nationals-live/6679834/133', '{ "data": "this is just some data3" }')
                ])
                .collect()
                .flatMap(() => {
                    save['/v1/nationals-live/6679834 has 4 items'] = R.clone(ps.db)
                    return ps.get('/v1/nationals-live/6679834')
                })
                .map(_ => {
                    assert.deepEqual(_, [
                        {"data": "this is just some data0"},
                        {"data": "this is just some data1"},
                        {"data": "this is just some data2"},
                        {"data": "this is just some data3"}
                    ]);
                })
                .pull(done)
        });

        it('it works on lists of nested-references', (done) => {

            db.store = {};
            hl.merge([
                    ps.add('/v1/nationals-live/6679834', 3, '{ "data": "this is just some data3", "image": ${/v1/nationals-live/6679834/133;null} }'),
                    ps.add('/v1/nationals-live/6679834', 1, '{ "data": "this is just some data1", "image": ${/v1/nationals-live/6679834/131;null} }'),
                    ps.add('/v1/nationals-live/6679834', 2, '{ "data": "this is just some data2", "image": ${/v1/nationals-live/6679834/132;null} }'),
                    ps.add('/v1/nationals-live/6679834', 0, '{ "data": "this is just some data0", "image": ${/v1/nationals-live/6679834/130;null} }'),
                    ps.put('/v1/nationals-live/6679834/130', '{ "data": "this is just some image data0" }'),
                    ps.put('/v1/nationals-live/6679834/131', '{ "data": "this is just some image data1" }'),
                    ps.put('/v1/nationals-live/6679834/132', '{ "data": "this is just some image data2" }'),
                    ps.put('/v1/nationals-live/6679834/133', '{ "data": "this is just some image data3" }')
                ])
                .collect()
                .flatMap(() => ps.get('/v1/nationals-live/6679834'))
                .map(list => {
                    console.log(list);
                    assert.equal(list.length, 4);
                    assert.equal(list[0].data, "this is just some data0");
                    assert.equal(list[0].image.data, "this is just some image data0");
                })
                .pull(done)
        });

        it('it works on lists of non-references', (done) => {

            db.store = {};
            hl.merge([
                    ps.add('/v1/nationals-live/6679834', 3, '{ "data": "this is just some data3" }'),
                    ps.add('/v1/nationals-live/6679834', 1, '{ "data": "this is just some data1" }'),
                    ps.add('/v1/nationals-live/6679834', 2, '{ "data": "this is just some data2" }'),
                    ps.add('/v1/nationals-live/6679834', 0, '{ "data": "this is just some data0" }'),
                ])
                .collect()
                .flatMap(() => ps.get('/v1/nationals-live/6679834'))
                .map(_ => {
                    assert.deepEqual(_, [
                        {"data": "this is just some data0"},
                        {"data": "this is just some data1"},
                        {"data": "this is just some data2"},
                        {"data": "this is just some data3"}
                    ]);
                })
                .pull(done)
        });

        it('filters lists', (done)=> {
            ps.db = save["/v1/nationals-live/6679834 has 4 items"]; //TODO shouldn't be dependent on previous tests
            assert(R.has('add', ps));
            hl.merge([
                    ps.get('/v1/nationals-live/6679834[1|2]')
                        .map(_ => {
                            assert.deepEqual(_, [
                                {"data": "this is just some data1"},
                                {"data": "this is just some data2"}
                            ]);
                        }),
                    ps.get('/v1/nationals-live/6679834[-1|2]')
                        .map(_ => {
                            assert.deepEqual(_, [
                                {"data": "this is just some data0"},
                                {"data": "this is just some data1"},
                                {"data": "this is just some data2"}
                            ]);
                        }),
                    ps.get('/v1/nationals-live/6679834[|2]')
                        .map(_ => {
                            assert.deepEqual(_, [
                                {"data": "this is just some data0"},
                                {"data": "this is just some data1"},
                                {"data": "this is just some data2"}
                            ]);
                        }),
                    ps.get('/v1/nationals-live/6679834[1|]')
                        .map(_ => {
                            assert.deepEqual(_, [
                                {"data": "this is just some data1"},
                                {"data": "this is just some data2"},
                                {"data": "this is just some data3"}
                            ]);
                        }),
                    ps.get('/v1/nationals-live/6679834^2')
                        .map(_ => {
                            assert.deepEqual(_, [
                                {"data": "this is just some data0"},
                                {"data": "this is just some data1"}
                            ]);
                        }),
                    ps.get('/v1/nationals-live/6679834[1|]^2')
                        .map(_ => {
                            assert.deepEqual(_, [
                                {"data": "this is just some data1"},
                                {"data": "this is just some data2"}
                            ]);
                        })
                ])
                .collect()
                .pull(done)
        });

    })
});