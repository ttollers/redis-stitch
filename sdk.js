/**
 * Created by DayoAdeyemi on 20/11/2015.
 */
var R = require('ramda');
var hl = require('highland');

module.exports = function(presentationServiceUrl){
    var request;
    var catchRestErr = function(cb){
        return function(err, res){
            var output, e;
            if(err) return cb(err);
            else if (res.statusCode===200) {
                try {
                    output = JSON.parse(res.text);
                } catch (e) {
                    output = res.text;
                }
                return cb(null, output);
            } else if (res.statusCode===204) {
                return cb(null, 'done');
            } else {
                var e = new Error(res.body.message);
                e.code = res.body.code;
                return cb(e);
            }
        }
    };
    if (R.isNil(presentationServiceUrl)){
        var rewire = require('rewire');
        var db = {};
        var v1 = rewire('./lib/v1');
        var request = require('supertest');
        var restify = require('restify');
        var app = restify.createServer();
        v1.__set__('db',{
            getKey: function(key){
                if (db[key] === void 0) return hl([null]);
                else if (R.is(String, db[key])) return hl([db[key]]);
                else {
                    var e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
                    e.code = 'WRONGTYPE';
                    return hl(function(push){ push(e); push(null, hl.nil) })
                }
            },
            listKey: function(key){
                if (db[key] == void 0) return hl([]);
                else if (!R.is(String, db[key])){
                    return hl.pairs(db[key])
                        .sortBy(function(a, b){
                            return a[1] - b[1];
                        })
                        .pluck(0)
                        .collect();
                } else {
                    var e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
                    e.code = 'WRONGTYPE';
                    return hl(function(push){ push(e); push(null, hl.nil) })
                }
            },
            setKey: function(key, value){
                db[key] = value;
                return hl(["OK"]);
            },
            delKey: function(key){
                var output = R.has(key, db) ? 1 : 0;
                delete db[key];
                return hl([output]);
            },
            addToKey: function(key, score, value){
                if (db[key] === void 0) db[key] = {};
                if (!R.is(String, db[key])){
                    db[key][value] = score;
                    return hl(["OK"]);
                } else{
                    var e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
                    e.code = 'WRONGTYPE';
                    return hl(function(push){
                        push(e);
                        push(null, hl.nil);
                    })
                }
            },
            delFromKey: function(key, value){
                if (db[key] == void 0) return hl([0]);
                else if (!R.is(String, db[key])){
                    if (R.isNil(db[key][value])){
                        return hl([0]);
                    } else {
                        delete db[key][value];
                        return hl([1]);
                    }
                } else {
                    var e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
                    e.code = 'WRONGTYPE';
                    return hl(function(push){
                        push(e);
                        push(null, hl.nil);
                    })
                }
            }
        });

        app.use(restify.queryParser());
        app.get(/.*/, v1.get);
        app.put(/.*/, v1.put);
        app.del(/.*/, v1.del);

        return {
            get db(){ return db },
            set db(_db){ db = _db },
            put: hl.wrapCallback(function(key, value, cb){
                request(app)
                    .put(key)
                    .send(value)
                    .end(catchRestErr(cb))
            }),
            del: hl.wrapCallback(function(key, cb){
                request(app)
                    .del(key)
                    .end(catchRestErr(cb))
            }),
            add: hl.wrapCallback(function(key, score, value, cb){
                request(app)
                    .put(key)
                    .query({ score: score })
                    .send(value)
                    .end(catchRestErr(cb))
            }),
            rem: hl.wrapCallback(function(key, value, cb){
                request(app)
                    .del(key)
                    .query({ value: value })
                    .end(catchRestErr(cb))
            }),
            get: hl.wrapCallback(function(key, cb){
                request(app)
                    .get(key)
                    .end(catchRestErr(cb))
            })
        };
    }
    else {
        request = require('superagent');
        return {
            put: hl.wrapCallback(function(key, value, cb){
                request
                    .put(presentationServiceUrl + key)
                    .send(value)
                    .end(catchRestErr(cb))
            }),
            del: hl.wrapCallback(function(key, cb){
                request
                    .del(presentationServiceUrl + key)
                    .end(catchRestErr(cb))
            }),
            add: hl.wrapCallback(function(key, score, value, cb){
                request
                    .put(presentationServiceUrl + key)
                    .query({ score: score })
                    .send(value)
                    .end(catchRestErr(cb))
            }),
            rem: hl.wrapCallback(function(key, value, cb){
                request
                    .del(presentationServiceUrl + key)
                    .query({ value: value })
                    .end(catchRestErr(cb))
            }),
            get: hl.wrapCallback(function(key, cb){
                request
                    .get(presentationServiceUrl + key)
                    .end(catchRestErr(cb))
            })
        };
    }
};