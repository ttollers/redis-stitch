
"use strict";

var R = require("ramda");

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