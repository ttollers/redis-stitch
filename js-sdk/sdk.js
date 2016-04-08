"use strict";

var R = require('ramda');
var hl = require('highland');
var stringify = require("./lib/stringify");

module.exports = function (presentationServiceUrl) {
    var request = require('superagent');

    if (R.isNil(presentationServiceUrl)) { // Test code

        var config = {
            "redis": {"host": "127.0.0.1", "port": 6379},
            "server": {"port": 8080},
            "allowedMethods": ["GET", "PUT", "DELETE"],
            "database": process.env.USE_REDIS ? "fakeRedis" : "redis"
        };

        require('presentation-service-server')(config);
        presentationServiceUrl = 'http://localhost:8080';
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
    return returnObj;
};

var put = function (request, psUrl) {
    return hl.wrapCallback(function (key, value, cb) {
        if(R.type(value) !== 'String') {
            cb('Non-string value passed to put method');
            return;
        }
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
        if (res.statusCode === 200) {
            try {
                output = JSON.parse(res.text);
            } catch (e) {
                output = res.text;
            }
            return cb(null, output);
        } else if (res.statusCode === 204) {
            return cb(null, res.header.Location);
        } else {
            if(err) res = err.response;
            var e = new Error(res.body.message);
            e.code = res.body.code;
            return cb(e);
        }
    };
};