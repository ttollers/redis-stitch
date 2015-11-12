var rewire = require('rewire');
var chai = require('chai');
var assert = chai.assert;
var v1 = rewire('../lib/v1');
var R = require('ramda');
var hl = require('highland');
var request = require('supertest');
var restify = require('restify');

var db = {};
v1.__set__('db',{
    getKey(key){
        if (db[key] === void 0) return hl([null]);
        else if (R.is(String, db[key])) return hl([db[key]]);
        else {
            e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
            e.code = 'WRONGTYPE';
            return hl(push =>  push(e))
        }
    },
    listKey(key){
        if (R.is(Array, db[key])) return hl([R.pluck(1, db[key])]);
        else {
            e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
            e.code = 'WRONGTYPE';
            return hl(push =>  push(e))
        }
    },
    setKey(key, value){
        db[key] = value;
        return hl(["OK"]);
    },
    delKey(key){
        var output = R.has(key, db) ? 1 : 0;
        delete db[key];
        return hl([output]);
    },
    addToKey(key, score, value){
        try {
            db[key] = db[key] || [];
            db[key].push([score, value]);
            db[key] = R.sortBy(R.prop(0), db[key]);
            return hl(["OK"]);
        } catch (e) {
            e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
            e.code = 'WRONGTYPE';
            return hl(push =>  push(e))
        }
    },
    delFromKey(key, value){
        if (db[key] == void 0) return 0;
        else if (R.is(Array, db[key])) {
            var l = db[key].length;
            db[key] = R.reject(xs => xs[1] === value, db[key]);
            return hl([l - db[key].length]);
        } else {
            e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
            e.code = 'WRONGTYPE';
            return hl(push =>  push(e))
        }
    },
});

describe('unit tests', () => {
    beforeEach(() => db = {});
    describe('hydrateKey', () => {
        var hydrateKey = v1.__get__('hydrateKey');

        it('should pluck values which are plain string', (done) => {
            db = { key: 'value' };
            hydrateKey({}, 'key')
                .map(value => assert.equal(value, 'value'))
                .pull(done)
        });

        it('should pluck values which are list values ', (done) => {
            db = { key: [
                [0, 'value1'],
                [1, 'value2']] };
            hydrateKey({}, 'key')
                .map(value => assert.equal(value, '[value1,value2]'))
                .pull(done)
        });

        it('should pull from local if it can', (done) => {
            db = { key: 'value' };
            hydrateKey({ key: 'local' }, 'key')
                .map(value => assert.equal(value, 'local'))
                .pull(done)
        });

        it('should error when there is no data', (done) => {
            db = {};
            hydrateKey({}, 'key')
                .pull((err, data) => {
                    assert.notOk(data);
                    assert.ok(err, 'there is an error');
                    assert.ok(err.body, err);
                    assert.equal(err.statusCode, 404, 'it is a 404');
                    done()
                })
        });

        it('should hydrate values which contain ${ref}', (done) => {
            db = {
                key: 'hello ${area}',
                area: 'world'
            };
            hydrateKey({}, 'key')
                .map(value => assert.equal(value, 'hello world'))
                .pull(done)
        });

        it('should deep hydrate values which contain ${ref}', (done) => {
            db = {
                key: 'welcome to ${area}',
                area: 'my ${place}',
                place: 'world'
            };
            hydrateKey({}, 'key')
                .map(value => assert.equal(value, 'welcome to my world'))
                .pull(done)
        });

        it('should hydrate multiple values which contain ${ref}', (done) => {
            db = {
                key: 'hello ${area}, it is such a ${compliment} ${timePeriod}',
                area: 'world',
                compliment: 'great',
                timePeriod: 'day'
            };
            hydrateKey({}, 'key')
                .map(value => assert.equal(value, 'hello world, it is such a great day'))
                .pull(done)
        });

        it('should error when there is cycle', (done) => {
            db = { key: '${key}' };
            hydrateKey({}, 'key')
                .pull((err, data) => {
                    assert.notOk(data);
                    assert.ok(err, 'there is an error');
                    assert.ok(err.body, 'it is a HttpError');
                    assert.equal(err.statusCode, 500, 'it is a 500');
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
                db = { '/v1/hello/world': 'my value' };
                request(app)
                    .get('/v1/hello/world')
                    .expect(200, 'my value')
                    .end(done);
            });

            it('should get list data saved in redis', (done) => {
                db = {
                    '/v1/hello/world': 'my value',
                    '/v1/hello/world2': 'my value2',
                    '/v1/hello/world3': 'my value3',
                    '/v1/list': [
                        [0,'${/v1/hello/world}'],
                        [1,'${/v1/hello/world2}'],
                        [2,'${/v1/hello/world3}']
                    ]
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
                    .expect(() => assert.equal(db['/v1/hello/world'], 'my value'))
                    .end(done);
            });

            it('should put a value into a list the db', (done) => {
                request(app)
                    .put('/v1/hello/world')
                    .query({ score: 0 })
                    .send('my value')
                    .expect(204)
                    .expect(() => assert.deepEqual(db['/v1/hello/world'], [[0,'my value']]))
                    .end(done);
            });
        });

        describe('del', () => {
            it('should delete values from the db', (done) => {
                db = { '/v1/hello/world': 'my value' };
                request(app)
                    .del('/v1/hello/world')
                    .expect(204)
                    .expect(() => assert.notOk(db['/v1/hello/world']))
                    .end(done);
            });

            it('should delete values from a list in the db', (done) => {
                db = {
                    '/v1/hello/world': 'my value',
                    '/v1/hello/world2': 'my value2',
                    '/v1/hello/world3': 'my value3',
                    '/v1/list': [
                        [0,'${/v1/hello/world}'],
                        [1,'${/v1/hello/world2}'],
                        [2,'${/v1/hello/world3}']
                    ]
                };
                request(app)
                    .del('/v1/list')
                    .expect(204)
                    .query({ value: '${/v1/hello/world2}' })
                    .expect(() => assert.deepEqual(db, {
                        '/v1/hello/world': 'my value',
                        '/v1/hello/world2': 'my value2',
                        '/v1/hello/world3': 'my value3',
                        '/v1/list': [
                            [0,'${/v1/hello/world}'],
                            [2,'${/v1/hello/world3}']
                        ]
                    }))
                    .end(done);
            });
        });
    })
});