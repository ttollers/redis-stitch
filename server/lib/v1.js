"use strict";

const R = require('ramda');
const hl = require('highland');
var restify = require('restify');
const BeneLogger = require('bene-logger');

const logger = new BeneLogger();

const logStreamExceptions = R.curry((req, err, push) => {
    logger.error('endpoint', {
        request_id: req.id(),
        err: err
    });
    push(err);
});

module.exports = function (db) {
    return {
        get(req, res, next) {
            logger.time('GET completed');
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
                    res.write(output);
                    res.end();
                    logger.timeEnd('GET completed', {
                        status: res.statusCode,
                        method: req.method,
                        request_id: req.id(),
                        key: key
                    });
                    next();
                });
        },
        put(req, res, next) {
            logger.time('PUT completed');
            const key = decodeURIComponent(req.path());
            const score = req.query.score && parseInt(req.query.score);
            hl(req)
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
                .errors(logStreamExceptions(req))
                .stopOnError(next)
                .done(() => {
                    res.setHeader('Location', req.url);
                    res.send(204);
                    logger.timeEnd('PUT completed', {
                        status: res.statusCode,
                        method: req.method,
                        request_id: req.id(),
                        key: key,
                        score: score
                    });
                    return next();
                });
        },
        del(req, res, next) {
            logger.time('DELETE completed');
            const key = decodeURIComponent(req.path());
            db.rem(key, req.query.value)
                .errors(logStreamExceptions(req))
                .stopOnError(next)
                .done(() => {
                    res.writeHead(204);
                    res.end();
                    logger.timeEnd('DELETE completed', {
                        status: res.statusCode,
                        method: req.method,
                        request_id: req.id(),
                        key: key
                    });
                    return next();
                });
        }
    };
};