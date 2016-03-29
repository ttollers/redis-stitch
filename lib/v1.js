"use strict";

var R = require('ramda');
var hl = require('highland');
var restify = require('restify');
var db = require('./db');
var nil = {}; // used to flag queried nonexistent keys in local cache
/**
 * recursively hydrates all the placeholders in a string
 *
 * splits the string into multiple evaluated string and replaceHolders
 * then evaluates all placehoders and concatenates the string
 * @param {Object} local
 * @param {String} string
 * @returns {Stream<String>}
 */
function hydrateString(local, string) {
    // we could potentially speed this up by evaluating the streams
    // in parallel at (2) and replacing local with R.clone(local)
    // in (1) - so that we don't get false positives on the cycle
    // detection.
    // this could however be less effecient as 1 ->  many -> 1*
    // relations (as is likely in live events) would result in many
    // queries to the 1* item instead of the one query that would
    // be cached.
    // A possibly more efficient implementation might be letting
    // the local store be a map Key -> Promise<Maybe<value>> then
    // after spiting the string for any Key that doesn't already
    // exist in local add it in and then return the result string
    // on resolution of all the relevant Promises.
    // Good look implementing that.

    return hl(splitStringByRef(string))
        .map(x => {
            if(x.charAt(0) === "$") {
                return hydrateKey(local, removeRefTag(x));
            } else {
                return hl([x]);
            }
        }).sequence().reduce1(R.add);
}

function splitStringByRef(string) {
    var newstringreplaced = string.split(/(?=[$])/)
        .map(inner => {
            if (inner.charAt(0) === "$") {
                var parentheseAt = inner.indexOf('}') + 1;
                return R.pair(inner.substr(0, parentheseAt), inner.substr(parentheseAt));
            }
            return inner;
        });
    return R.flatten(newstringreplaced);
}

/**
 * recursively hydrates a particlular resource
 * @param {Object} local
 * @param {String} input
 * @returns {*}
 */
function hydrateKey(local, input) {

    var obj = sanitizeKey(input);
    var stream;
    if (local[obj.key] === nil) {
        // if the key has ben tested previously and doesn't exist don't test again
        if (R.isNil(obj.def)) throw new restify.ResourceNotFoundError(obj.key + ' not available');
        return hl([obj.def]);
    }
    if (local[obj.key] === null) {
        // if the key is currently being tested there is a cycle in it so throw an error
        throw new restify.InternalServerError('cycle detected in ' + obj.key);
    } else if (R.has(obj.key, local)) {
        // if the key has alread been tested
        stream = hl([local[obj.key]])
    } else {
        // flag the key as currently being tested
        local[obj.key] = null;
        // get the value at key from the db
        stream = db.getKey(obj.key)
            .consume(getValueFromRedis(obj))
            .map(_ => {
                if (_ === null) {
                    // if there is no value at the key flag this in the local cache and throw a NotFoundError
                    local[obj.key] = nil;
                    throw new restify.ResourceNotFoundError(obj.key + ' not available');
                }
                return _;
            })
            .flatMap(value => {
                // if there a value it must be fully hydrated
                return hydrateString(local, value)
                    .map(value => {
                        // parse the value if it is JSON
                        try {
                            return JSON.parse(value);
                        } catch (e) {
                            return value;
                        }
                    })
                    .errors((err, push) => push(new restify.ResourceNotFoundError(err, obj.key + ' not available as ' + err.message)))
            })
            .tap(value => {
                local[obj.key] = value;
            })
    }
    // stream contains the hydrated value at key if it exists, we must then pull the value at props to return
    return stream
        .map(R.path(obj.props)).map(_ => {
            if (_ === void 0) throw new restify.ResourceNotFoundError([obj.key].concat(obj.props).reverse().join(' of ') + ' not available');
            else return R.is(String, _) ? _ : JSON.stringify(_);
        })
        .errors((err, push) => (obj.def === void 0) ? push(err) : push(null, obj.def));
}

var getValueFromRedis = R.curry((obj, err, x, push, next) => {
    if (err && err.code === 'WRONGTYPE') {
        // if there is a WRONGTYPE the key must really hold a list
        db.listKey(obj.key, obj.before, obj.after, obj.limit)
            .errors(push)
            .each((list) => {
                var hydratedList = list
                    .map(removeRefTag);

                var stringifiedList = '[' + list.toString() + ']';

                if (R.all(x => x !== void 0)(hydratedList)) { // if every single item is just a reference
                    
                    var sanitizedList = hydratedList.map(sanitizeKey).map(R.prop("key"));
                    db.getMultiple(sanitizedList)
                        .toArray((item) => {
                            if (R.all(x => x !== void 0)(item)) {
                                push(null, '[' + item.toString() + ']');
                            } else {
                                push(null, stringifiedList);
                            }
                            next()
                        })
                } else {
                    push(null, stringifiedList)
                }
            });
    } else {
        push(err, x);
        if (x !== hl.nil) next();
    }
});

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

    var ret = {
        "key": key,
        "def": def,
        "props": props,
        "after": after,
        "before": before,
        "limit": limit
    };

    if (limit === Infinity && before === Infinity && after === -Infinity) {
        return R.assoc("type", "get", ret);
    } else {
        return R.assoc("type", "range", ret);
    }
}

function removeRefTag(input) {
    var m = input.match(/\${(.*?)}/)
    if (m) {
        return m[1];
    }
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