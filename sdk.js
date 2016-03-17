"use strict";

var R = require('ramda');
var hl = require('highland');
var stringify = require("./lib/stringify");

module.exports = function (presentationServiceUrl) {
    var request;
    var getAndSetDb = {};

    if (R.isNil(presentationServiceUrl)) { // Test code
        presentationServiceUrl = "";
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
            get: function () {
                return db.store;
            },
            set: function (_db) {
                db.store = _db;
            }
        };
    }
    else { // Live code
        request = require('superagent');
    }

    var returnObj = {
        put: put(request, presentationServiceUrl),
        putObject: putObject(request, presentationServiceUrl),
        del: hl.wrapCallback(function (key, cb) {
            request
                .del(presentationServiceUrl + key)
                .end(catchRestErr(cb));
        }),
        add: hl.wrapCallback(function (key, score, value, cb) {
            request
                .put(presentationServiceUrl + key)
                .query({score: score})
                .send(value)
                .end(catchRestErr(cb));
        }),
        rem: hl.wrapCallback(function (key, value, cb) {
            request
                .del(presentationServiceUrl + key)
                .query({value: value})
                .end(catchRestErr(cb));
        }),
        get: hl.wrapCallback(function (key, cb) {
            request
                .get(presentationServiceUrl + key)
                .end(catchRestErr(cb));
        })
    };
    return Object.defineProperty(returnObj, "db", getAndSetDb);
};

var put = function (request, psUrl) {
    return hl.wrapCallback(function (key, value, cb) {
        request
            .put(psUrl + key)
            .send(value)
            .end(catchRestErr(cb));
    });
};

var putObject = R.curry(function (request, psUrl, key, value) {
    return put(request, psUrl)(key, stringify(value));
});

var catchRestErr = function (cb) {
    return function (err, res) {
        var output;
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
    };
};