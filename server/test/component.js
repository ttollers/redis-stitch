"use strict";

var rewire = require('rewire');
var chai = require('chai');
var assert = chai.assert;
var restify = require('restify');
var logger = require('winston').loggers.get('elasticsearch');
var hl = require('highland');
logger.transports.console.silent = true;

var config = {
    "redis": {"host": "127.0.0.1", "port": 6379},
    "server": {"port": 8080},
    "allowedMethods": ["GET", "PUT", "DELETE"],
    "database": process.env.USE_REDIS === 'true' ? "redis" : "fakeRedis"
};

var server = rewire("../server.js");
server(config);
var app = server.__get__('server');
var request = require('supertest')(app);

var set = hl.wrapCallback((key, value, cb) => {
    request.del(key).end(() => request.put(key).send(value).end(cb));
});

var add = hl.wrapCallback((key, score, value, cb) => {
    request
        .put(key)
        .query({score: score})
        .send(value)
        .end(cb);
});

var del = hl.wrapCallback((key, cb) => {
    request.del(key).end(cb);
});

describe('v1 api', () => {
    describe('get', () => {
        it('should 404 when there is no data', (done) => {
            del('/v1/hello/world')
                .pull(() => {
                    request
                        .get('/v1/hello/world')
                        .expect(404)
                        .end(done);
                })
        });

        it('should get string data saved in redis', (done) => {
            set("/v1/hello/world", "my value").pull(() => {
                request
                    .get('/v1/hello/world')
                    .expect(200, 'my value')
                    .end(done);
            });
        });

        it('should get list data saved in redis', (done) => {
            set("/v1/hello/world", "my value")
                .flatMap(set("/v1/hello/world2", "my value2"))
                .flatMap(set("/v1/hello/world3", "my value3"))
                .flatMap(add("/v1/list", 0, "${/v1/hello/world}"))
                .flatMap(add("/v1/list", 2, "${/v1/hello/world2}"))
                .flatMap(add("/v1/list", 3, "${/v1/hello/world3}"))
                .pull(() => {
                    request
                        .get("/v1/list")
                        .expect(200, '[my value,my value2,my value3]')
                        .end(done);
                })
        });
    });

    describe('put value', () => {
        it('should put a value into the db', (done) => {
            del("/v1/hello/world")
                .pull(() => {
                    request
                        .put('/v1/hello/world')
                        .send('my value')
                        .expect(204)
                        .end(done);
                });
        });
    });

    describe('del', () => {
        it('should delete values from the db', (done) => {
            set("/v1/hello/world", "my value")
                .pull(() => {
                    request
                        .del('/v1/hello/world')
                        .expect(204)
                        .end(() => {
                            request
                                .get('/v1/hello/world')
                                .expect(404)
                                .end(done);
                        });
                })
        });

        it('should delete values from a list in the db', (done) => {
            set("/v1/hello/world", "my value")
                .flatMap(set("/v1/hello/world2", "my value2"))
                .flatMap(set("/v1/hello/world3", "my value3"))
                .flatMap(add("/v1/list", 0, "${/v1/hello/world}"))
                .flatMap(add("/v1/list", 2, "${/v1/hello/world2}"))
                .flatMap(add("/v1/list", 3, "${/v1/hello/world3}"))
                .pull(() => {
                    request
                        .del('/v1/list')
                        .expect(204)
                        .query({value: '${/v1/hello/world2}'})
                        .end(() => {
                            request
                                .get("/v1/list")
                                .expect(200, "[my value,my value3]")
                                .end(done);
                        });
                });
        });

        it('should delete values from a list by score', (done) => {
            set("/v1/hello/world", "my value")
                .flatMap(set("/v1/hello/world2", "my value2"))
                .flatMap(set("/v1/hello/world3", "my value3"))
                .flatMap(add("/v1/list", 0, "${/v1/hello/world}"))
                .flatMap(add("/v1/list", 2, "${/v1/hello/world2}"))
                .flatMap(add("/v1/list", 3, "${/v1/hello/world3}"))
                .pull(() => {
                    request
                        .del('/v1/list')
                        .expect(204)
                        .query({value: 2})
                        .end(() => {
                            request
                                .get("/v1/list")
                                .expect(200, "[my value,my value3]")
                                .end(done);
                        });
                });
        });
    });

    it("should not crash on nested 404s", () => {
        del("no-ref")
            .flatMap(set("/v1/hello/world", "${no-ref}"))
            .pull(() => {
                request
                    .get('/v1/hello/world')
                    .expect(404)
                    .end(done);
            });
    });
});