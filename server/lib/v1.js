"use strict";

var R = require('ramda');
var hl = require('highland');
var restify = require('restify');
var logger = require('winston').loggers.get('elasticsearch');

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

module.exports = function (db) {
    return {
        get(req, res, next) {
            const key = decodeURIComponent(req.path());
            db.get(key)
                .errors(logStreamExceptions(req))
                .stopOnError(e => {
                    switch(e.type) {
                        case "DefaultAsKeyNotFound":
                            res.write(e.message);
                            res.end();
                            break;
                        case "KeyNotFound":
                            next(new restify.ResourceNotFoundError(e));
                            break;
                        case "KeyPropNotFound":
                            next(new restify.ResourceNotFoundError(e));
                            break;
                        case "CycleDetected":
                            next(new restify.ConflictError(e));
                            break;
                        default:
                            next(e);
                    }
                })
                .each(output => {
                    console.log(typeof output);
                    
                    res.send(output);
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
                        return db.put(key, value);
                    } else if (!isNaN(score)) {
                        return db.add(key, score, value);
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
            db.rem(key, req.query.value)
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