"use strict";

var R = require('ramda');
var hl = require('highland');
var restify = require('restify');
var logger = require('winston').loggers.get('elasticsearch');
logger.transports.console.timestamp = true;
var db;

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

module.exports = function (config) {
    db = require('./db')(config);

    return {
        get(req, res, next) {
            const key = decodeURIComponent(req.path());
            hydrateString({}, "${" + key + "}")
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


function hydrateString(local, string) {
    const splits = R.flatten(splitStringByRef(string)
        .map(createReferenceObject(local, 0)));

    const refs = splits.filter(R.is(Object));

    if (refs.length === 0) return hl([splits.join("")]);

    return db.getMultiple(refs.map(R.prop("key")))
        .flatMap(values => {
            return values.map((val, i) => {
                const obj = refs[i];
                if (R.isNil(val)) {
                    return db.listKey(obj.key, obj.before, obj.after, obj.limit)
                        .consume((err, list, push) => {
                            if (err) {
                                if (err.code === 'WRONGTYPE') push(null, R.assoc("value", obj.key, obj));
                                else push(err);
                            }
                            else if (R.isEmpty(list)) {
                                if (!R.isNil(obj.def)) push(null, R.assoc("value", obj.def, obj));
                                else {
                                    push(null, R.assoc("value", null, obj));
                                }
                            }
                            else push(null, R.assoc("value", '[' + list.toString() + ']', obj));
                            push(null, hl.nil);
                        });
                } else {
                    return hl([R.assoc("value", val, obj)]);
                }
            });
        })
        .sequence()
        .map(hydrateProps)
        // if the value doesnt exist, throw. Otherwise make sure is stringified
        .map(obj => {
            if (R.isNil(obj.value)) throw new restify.ResourceNotFoundError([obj.key].concat(obj.props).reverse().join(' of ') + ' not available');
            else {
                const value = R.is(String, obj.value) ? obj.value : JSON.stringify(obj.value);
                if (obj.key === value) return "${" + value + "}";
                local[obj.key] = value;
                return value;
            }
        })
        .reduce(splits, populateArrayWithValues)
        .flatMap(function (x) {
            return hydrateString(local, x.join(""));
        });
}

// if the reference contained "props" (i.e. ${ref,prop1,prop2} fill these values
function hydrateProps(obj) {
    if (obj.props.length) {
        try {
            return R.assoc("value", R.path(obj.props, JSON.parse(obj.value)), obj);
        } catch (e) {
            return obj;
        }
    } else {
        return obj;
    }
}

// stitch back the string array, replacing the references with the hydrated values
function populateArrayWithValues(acc, x) {
    const index = R.findIndex(R.is(Object))(acc);
    acc[index] = x;
    return acc;
}

// for each reference, replaces it with an object that can be used in the refs array
const createReferenceObject = R.curry((local, i, x) => {
    if (R.test(/\$\{/, x)) {
        return R.pipe(removeRefTag, sanitizeKey, checkLocalStorage(local, i))(x);
    }
    return x;
});

// check that the value hasn't already been used in the hydration process
const checkLocalStorage = R.curry((local, i, obj) => {
    if (i > 25) {
        throw new restify.InternalServerError('cycle detected');
    }
    else if (R.has(obj.key, local)) {
        // recursive function
        return splitStringByRef(local[obj.key])
            .map(createReferenceObject(local, i + 1));
    }
    else if (local[obj.key] === {}) {
        // if the key has ben tested previously and doesn't exist don't test again
        if (R.isNil(obj.def)) throw new restify.ResourceNotFoundError(obj.key + ' not available');
        return obj.def;
    }
    else {
        return obj;
    }
});

// splits a string into a array that splits references from the string.
// The list remains in order. i.e: string === splitStringByRef(string).join("");
function splitStringByRef(string) {
    const newStringReplaced = string.split(/(?=[$])/)
        .map(inner => {
            if (inner.charAt(0) === "$" && inner.charAt(1) === "{") {
                const parentheseAt = inner.indexOf('}') + 1;
                return R.pair(inner.substr(0, parentheseAt), inner.substr(parentheseAt));
            }
            return inner;
        });
    return R.flatten(newStringReplaced);
}

function sanitizeKey(input) {
    const $temp = input.split(';');
    const xs = $temp[0].split(',');
    var key = R.head(xs); // the db key to get the value from
    var before = NaN;
    var after = NaN;
    var limit = Infinity;
    const beforeAfterMatch = key.match(/\[(-?\d*)\|(-?\d*)\]/);
    if (beforeAfterMatch) {
        key = key.replace(beforeAfterMatch[0], '');
        after = parseInt(beforeAfterMatch[1]);
        before = parseInt(beforeAfterMatch[2]);
    }
    const limitMatch = key.match(/\^(\d+)/);
    if (limitMatch) {
        key = key.replace(limitMatch[0], '');
        limit = parseInt(limitMatch[1]);
    }
    if (Number.isNaN(before) || R.isNil(before)) before = Infinity;
    if (Number.isNaN(after) || R.isNil(before)) after = -Infinity;

    return {
        "key": key,
        "def": $temp[1],
        "props": R.tail(xs),
        "after": after,
        "before": before,
        "limit": limit
    };
}

function removeRefTag(input) {
    const m = input.match(/\${(.*?)}/);
    return m ? m[1] : input;
}
