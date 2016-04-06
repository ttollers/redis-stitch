
"use strict";

var R = require("ramda");

/*
 *
 * rewrites usages of { $ref: '${uri}' } into ${uri} and
 * returns a string for saving into the presentation-service
 * so that earlier code returns correct js objects
 *
 * $ref key is required so the object is valid json. Otherwise
 * this function would pass the whole resolved object in as a string
 *
 */
function stringify(presentation) {
    var strings;
    if (R.is(Array, presentation)) {
        strings = R.map(stringify, presentation);
        return '[' + strings.join(', ') + ']';
    } else if (R.is(Object, presentation)) {
        if (presentation && presentation.$ref) return presentation.$ref;
        strings = R.map(function (pair) {
            if (R.isNil(pair[1])) return null;
            else return pair.map(stringify).join(': ');
        }, R.reject(function (pair) {
            return R.isNil(pair[1]);
        }, R.toPairs(presentation)));
        return '{' + strings.join(', ') + '}';
    } else if (presentation === null) {
        return "null";
    } else return JSON.stringify(presentation);
};

module.exports = stringify;