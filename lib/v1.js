"use strict";

var R = require('ramda');
var hl = require('highland');
var restify = require('restify');
var db = require('./db');
var nil = {}; // used to flag queried nonexistent keys in local cache

/**
 * entry point for urls - add the reference tags so it can be hydrated like any other reference
 * @param {Object} local
 * @param {String} input
 * @returns {*}
 */
function hydrateKey(local, input) {
    return hydrateString(local, "${" + input + "}")
}

/**
 * the workhorse for the hydration process. singularly recursive
 * @param {Object} local
 * @param {String} string
 * @returns {Stream<String>}
 */
function hydrateString(local, string) {

    var splits = splitStringByRef(string)
        .map(createReferenceObject(local));

    var refs = splits.filter(R.is(Object));

    if (refs.length === 0) { // contains no references - fully hydrated. Finish of cycle
        return hl([splits.join("")]);
    }

    return db.getMultiple(refs.map(R.prop("key")))
        .flatMap(values => {
            return values.map((val, i) => {
                var obj = refs[i];
                local[obj.key] = null;
                if (R.isNil(val)) {
                    return db.listKey(obj.key, obj.before, obj.after, obj.limit)
                        .consume((err, list, push) => {
                            if(R.isEmpty(list)) {
                                if(!R.isNil(obj.def)) push(null, R.assoc("value", obj.def, obj));
                                else {
                                    push(err, R.assoc("value", null, obj));
                                }
                            }
                            else push(null, R.assoc("value", '[' + list.toString() + ']', obj));
                            push(null, hl.nil);
                        })
                } else {
                    return hl([R.assoc("value", val, obj)]);
                }
            });
        })
        .sequence()
        // throw 404 if value was not found
        .tap(obj => {
            if (obj.value === null) {
                local[obj.key] = nil;
                throw new restify.ResourceNotFoundError(obj.key + ' not available');
            }
        })
        .map(hydrateProps)
        .map(errorOnUndefined)
        .tap(obj => {
            local[obj.key] = obj.value;
        })
        .reduce(splits, populateArrayWithvalues)
        .flatMap(function (x) {
            return hydrateString(local, x.join(""));
        })
}

// if the reference contained "props" (i.e. ${ref,prop1,prop2} fill these values
function hydrateProps (obj) {
    if(obj.props.length) {
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
function populateArrayWithvalues (acc, x) {
    var index = R.findIndex(R.is(Object))(acc);
    acc[index] = x;
    return acc;
}

// if the value doesnt exist, throw. Otherwise make sure is stringified
function errorOnUndefined(obj) {
    if (obj.value === void 0) throw new restify.ResourceNotFoundError([obj.key].concat(obj.props).reverse().join(' of ') + ' not available');
    else return R.is(String, obj.value) ? obj.value : JSON.stringify(obj.value);
}

// for each reference, replaces it with an object that can be used in the refs array
const createReferenceObject = R.curry((local, x) => {
    if(R.test(/\$\{/, x)) {
        return R.pipe(removeRefTag, sanitizeKey, checkLocalStorage(local))(x);
    }
    return x;
});

// check that the value hasn't already been used in the hydration process
var checkLocalStorage = R.curry((local, obj) => {
    if (local[obj.key] === nil) {
        // if the key has ben tested previously and doesn't exist don't test again
        if (R.isNil(obj.def)) throw new restify.ResourceNotFoundError(obj.key + ' not available');
        return obj.def;
    }
    if (local[obj.key] === null) {
        // if the key is currently being tested there is a cycle in it so throw an error
        throw new restify.InternalServerError('cycle detected in ' + obj.key);
    } else if (R.has(obj.key, local)) {
        // if the key has alread been tested
        return local[obj.key];
    } else {
        return obj;
    }
});

// splits a string into a array that splits references from the string.
// The list remains in order. i.e: string === splitStringByRef(string).join("");
function splitStringByRef(string) {
    var newstringreplaced = string.split(/(?=[$])/)
        .map(inner => {
            if (inner.charAt(0) === "$" && inner.charAt(1) === "{") {
                var parentheseAt = inner.indexOf('}') + 1;
                return R.pair(inner.substr(0, parentheseAt), inner.substr(parentheseAt));
            }
            return inner;
        });
    return R.flatten(newstringreplaced);
}

function sanitizeKey(input) {
    var $temp = input.split(';'),
        resource = $temp[0],
        def = $temp[1]; // the default value to output if the resource doesnt exist
    var xs = resource.split(','),
        key = R.head(xs), // the db key to get the value from
        props = R.tail(xs); // (assuming the data at key parses as a JSON object) the path to get the value from
    var beforeAfterMatch = key.match(/\[(-?\d*)\|(-?\d*)\]/), before = NaN, after = NaN;
    if (beforeAfterMatch) {
        key = key.replace(beforeAfterMatch[0], '');
        after = parseInt(beforeAfterMatch[1]);
        before = parseInt(beforeAfterMatch[2]);
    }
    var limitMatch = key.match(/\^(\d+)/), limit = Infinity;
    if (limitMatch) {
        key = key.replace(limitMatch[0], '');
        limit = parseInt(limitMatch[1]);
    }
    if (Number.isNaN(before) || R.isNil(before)) before = Infinity;
    if (Number.isNaN(after) || R.isNil(before)) after = -Infinity;

    return {
        "key": key,
        "def": def,
        "props": props,
        "after": after,
        "before": before,
        "limit": limit
    };
}

function removeRefTag(input) {
    var m = input.match(/\${(.*?)}/)
    if (m) {
        return m[1];
    } else return input;
}

module.exports = {
    get(req, res, next) {
        var key = decodeURIComponent(req.path());
        hydrateKey({}, key, [])
            .errors(e => next(e))
            .each(output => {
                res.write(output);
                res.end();
                next();
            })
    },
    put(req, res, next) {
        var key = decodeURIComponent(req.path());
        var score = req.query.score && parseInt(req.query.score);
        hl(req)
            .reduce('', R.add)
            .flatMap(value => {
                if (R.isNil(score)) {
                    return db.setKey(key, value);
                } else if (!isNaN(score)) {
                    return db.addToKey(key, score, value)
                } else {
                    throw new restify.BadRequestError('score must be a number');
                }
            })
            .done(() => {
                res.writeHead(204);
                res.end();
                return next();
            })
    },
    del(req, res, next) {
        var key = decodeURIComponent(req.path());

        var stream = req.query.value == null ? db.delKey(key)
            : isNaN(req.query.value) ? db.delFromKey(key, req.query.value)
            : db.delFromKeyByScore(key, Number(req.query.value));

        stream
            .done(() => {
                res.writeHead(204);
                res.end();
                return next();
            })
    }
};