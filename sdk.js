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
        var request = require('supertest');
        var restify = require('restify');
        var app = restify.createServer();
        var v1 = rewire('./lib/v1');
        var db = v1.__get__('db');

        app.use(restify.queryParser());
        app.get(/.*/, v1.get);
        app.put(/.*/, v1.put);
        app.del(/.*/, v1.del);

        return {
            get db(){ return db.store },
            set db(_db){ db.store = _db },
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