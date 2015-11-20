/**
 * Created by DayoAdeyemi on 20/11/2015.
 */
var R = require('ramda');
var hl = require('highland');

module.exports = function(presentationServiceUrl){
    if (R.isNil(presentationServiceUrl)){
        var rewire = require('rewire');
        var db = {};
        var v1 = rewire('./lib/v1');
        var supertest = require('supertest');
        var restify = require('restify');
        var app = restify.createServer();
        var catchErr = function(res){
            if (res.statusCode>=200 && res.statusCode<300) return res.body;
            else throw new Error(res.body);
        };
        v1.__set__('db',{
            getKey(key){
                if (db[key] === void 0) return hl([null]);
                else if (R.is(String, db[key])) return hl([db[key]]);
                else {
                    var e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
                    e.code = 'WRONGTYPE';
                    return hl(push =>  push(e))
                }
            },
            listKey(key){
                if (R.is(Array, db[key])) return hl([R.pluck(1, db[key])]);
                else {
                    var e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
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
                    var e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
                    e.code = 'WRONGTYPE';
                    return hl(push =>  push(e))
                }
            }
        });

        app.use(restify.queryParser());
        app.get(/.*/, v1.get);
        app.put(/.*/, v1.put);
        app.del(/.*/, v1.del);

        return {
            db: {
                get(){ return db; },
                set(_db){ db = _db; }
            },
            put: function(key, value){
                return hl.wrapCallback(function(done){
                    supertest(app)
                        .put(key)
                        .send(value)
                        .end(done);
                })
                .map(catchErr);
            },
            del: function(key){
                return hl.wrapCallback(function(done){
                    supertest(app)
                        .del(key)
                        .end(done);
                })
                .map(catchErr);
            },
            add: function(key, score, value){
                return hl.wrapCallback(function(done){
                    supertest(app)
                        .put(key)
                        .query({ score: score })
                        .send(value)
                        .end(done);
                })
                .map(catchErr);
            },
            rem: function(key, value){
                return hl.wrapCallback(function(done){
                    supertest(app)
                        .del(key)
                        .query({ value: value })
                        .end(done);
                })
                .map(catchErr);
            },
            get: function(key){
                return hl.wrapCallback(function(done){
                    supertest(app)
                        .get(key)
                        .end(done);
                })
                .map(catchErr);
            }
        };
    }
    else {
        var request = function (options){
            return hl.wrapCallback(require('request'))(options)
                .map(catchErr);
        };
        return {
            put: function(key, value){
                return request({
                    url: presentationServiceUrl + key,
                    method: 'PUT',
                    body: value
                })
            },
            del: function(key){
                return request({
                    url: presentationServiceUrl + key,
                    method: 'DELETE'
                })
            },
            add: function(key, score, value){
                return request({
                    url: presentationServiceUrl + key + (score == null?'':'?score='+score),
                    method: 'PUT',
                    body: value
                })
            },
            rem: function(key, value){
                return request({
                    url: presentationServiceUrl + key + "?value=" + value,
                    method: 'DELETE'
                })
            },
            get: function(key){
                return request({
                    url: presentationServiceUrl + key,
                    method: 'GET'
                })
            }
        };
    }
};