"use strict";

var R = require('ramda');
var hl = require('highland');
var restify = require('restify');
var logger = require('winston').loggers.get('elasticsearch');
var hydrateString = require("./hydrateString");

logger.transports.console.timestamp = true;

var logOutput = R.curry((msg, direction, req, data) => {
    logger.info(msg, {
        request_id: req.id(),
        method: req.method,
        url: req.url,
        direction: direction
    });
    return data;
});

var logStreamExceptions = R.curry((req, err, push) => {
    //error message for elasticsearch, with a correlation id
    logger.error('endpoint', {
        request_id: req.id(),
        err_message: err.message
    });
    //output stack for cloudformation only
    console.log(err.stack);
    push(err, null);
});

module.exports = function (config, db) {
    return {
        get(req, res, next) {
            const key = decodeURIComponent(req.path());
            hydrateString(db, {}, "${" + key + "}")
                .errors(logStreamExceptions(req))
                .stopOnError(next)
                .each(output => {
                    res.write(output);
                    res.end();
                    next();
                });
        },
        put(req, res, next) {
            const key = decodeURIComponent(req.path());
            const score = req.query.score && parseInt(req.query.score);
            hl(req)
                .tap(logOutput("endpoint", "incoming", req))
                .invoke('toString', ['utf8'])
                .reduce1(R.concat)
                .flatMap(value => {
                    if (R.isNil(score)) {
                        return db.setKey(key, value);
                    } else if (!isNaN(score)) {
                        return db.addToKey(key, score, value);
                    } else {
                        throw new restify.BadRequestError('score must be a number');
                    }
                })
                .tap(logOutput("endpoint", "outgoing", req))
                .errors(logStreamExceptions(req))
                .stopOnError(next)
                .done(() => {
                    res.setHeader('Location', req.url);
                    res.send(204);
                    return next();
                });
        },
        del(req, res, next) {
            const key = decodeURIComponent(req.path());

            const stream = req.query.value == null ? db.delKey(key)
                : isNaN(req.query.value) ? db.delFromKey(key, req.query.value)
                : db.delFromKeyByScore(key, Number(req.query.value));

            stream
                .errors(logStreamExceptions(req))
                .stopOnError(next)
                .done(() => {
                    res.writeHead(204);
                    res.end();
                    return next();
                });
        }
    };
};