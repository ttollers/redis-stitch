"use strict";

var hl = require("highland");
var R = require("ramda");
var escape = require('js-string-escape');

var hydrateString = R.curry((db, local, string) => {
    const splits = R.flatten(splitStringByRef(string)
        .map(createReferenceObject(local, 0)));

    const refs = splits.filter(R.is(Object));

    if (R.isEmpty(local)) {
        local.globalDefault = refs[0].def;
    }

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
                                else if (!R.isNil(local.globalDefault)) {
                                    push({
                                        "type": "DefaultAsKeyNotFound",
                                        "message": local.globalDefault
                                    });
                                }
                                else {
                                    push({
                                        "type": "KeyNotFound",
                                        "message": obj.key + ' not available'
                                    });
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
        .map(obj => {
            const value = R.is(String, obj.value) ? obj.value : JSON.stringify(obj.value);
            if (obj.key === value) return "${" + value + "}";
            local[obj.key] = value;
            return value;
        })
        .reduce(splits, populateArrayWithValues)
        .flatMap(function (x) {
            return hydrateString(db, local, x.join(""));
        });
});

// if the reference contained "props" (i.e. ${ref,prop1,prop2} fill these values
function hydrateProps(obj) {
    if (obj.props.length) {
        const getJsonValue = x => R.path(obj.props, JSON.parse(x));
        var value = R.tryCatch(getJsonValue, R.always(obj.value))(obj.value);
        if(R.isNil(value)) {
            throw {
                "type": "KeyPropNotFound",
                "message": [obj.key].concat(obj.props).reverse().join(' of ') + ' not available'
            };
        }
        else {
            const retValue = R.is(String, value) ? escape(value) : value;
            return R.assoc("value", retValue, obj);
        }
    }
    else {
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
        throw {
            "type": "CycleDetected",
            "message": "Cycle Detected in " + obj.key
        };
    }
    else if (R.has(obj.key, local)) {
        // recursive function
        return splitStringByRef(local[obj.key])
            .map(createReferenceObject(local, i + 1));
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

module.exports = hydrateString;