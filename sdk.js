"use strict";

var R = require('ramda');
var hl = require('highland');
var stringify = require("./lib/stringify");


module.exports = function (presentationServiceUrl) {
    var request;
    var getAndSetDb;

    if (R.isNil(presentationServiceUrl)) { // Test code
        var url = "";
        var rewire = require('rewire');
        var supertest = require('supertest');
        var restify = require('restify');
        var app = restify.createServer();
        var v1 = rewire('./lib/v1');
        var db = v1.__get__('db');
        request = supertest(app);
        app.use(restify.queryParser());
        app.get(/.*/, v1.get);
        app.put(/.*/, v1.put);
        app.del(/.*/, v1.del);

        getAndSetDb = {
            get: function() {
                return db.store;
            },
            set: function(_db) {
                db.store = _db;
            }
        };
    }
    else { // Live code
        var url = presentationServiceUrl;
        request = require('superagent');
    }

    var returnObj = {
        put: put(request, url),
        putObject: putObject(request, url),
        del: del(request, url),
        add: add(request, url),
        rem: rem(request, url),
        get: get(request, url)
    };

    return Object.defineProperty(returnObj, "db", getAndSetDb || {});
};

var put = (request, presentationServiceUrl) => hl.wrapCallback(function (key, value, cb) {
    request
        .put(presentationServiceUrl + key)
        .send(value)
        .end(catchRestErr(cb))
});

var putObject = R.curry((request, presentationServiceUrl, key, value) => {
    return put(request, presentationServiceUrl)(key, stringify(value));
});

var add = (request, presentationServiceUrl) => hl.wrapCallback(function (key, score, value, cb) {
    request
        .put(presentationServiceUrl + key)
        .query({score: score})
        .send(value)
        .end(catchRestErr(cb))
});

var rem = (request, presentationServiceUrl) => hl.wrapCallback(function (key, value, cb) {
    request
        .del(presentationServiceUrl + key)
        .query({value: value})
        .end(catchRestErr(cb))
});
var get = (request, presentationServiceUrl) => hl.wrapCallback(function (key, cb) {
    request
        .get(presentationServiceUrl + key)
        .end(catchRestErr(cb))
});
var del = (request, presentationServiceUrl) => hl.wrapCallback(function (key, cb) {
    request
        .del(presentationServiceUrl + key)
        .end(catchRestErr(cb))
});

var catchRestErr = function (cb) {
    return function (err, res) {
        var output, e;
        if (err) return cb(err);
        else if (res.statusCode === 200) {
            try {
                output = JSON.parse(res.text);
            } catch (e) {
                output = res.text;
            }
            return cb(null, output);
        } else if (res.statusCode === 204) {
            return cb(null, 'done');
        } else {
            var e = new Error(res.body.message);
            e.code = res.body.code;
            return cb(e);
        }
    }
};