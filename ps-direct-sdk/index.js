"use strict";

var database = require("./db.js");
var hydrateString = require("./lib/hydrateString");
var stringify = require("./lib/stringify");
var R = require("ramda");
var hl = require("highland");


module.exports = function (config) {
    var db = database(config);
    return {
        put: (key, value) => {
            if(!R.is(String, value)) return hl(push => push("WrongType"))
            else return db.setKey(key, value);
        },
        putObject: (key, value) => {
          return db.setKey(key, stringify(value))  
        },
        del: db.delKey,
        add: db.addToKey,
        rem: function (key, value) {
            return R.isNil(value) ? db.delKey(key)
                : isNaN(value) ? db.delFromKey(key, value)
                : db.delFromKeyByScore(key, Number(value));
        },
        get: key => hydrateString(db, {}, "${" + key + "}").map(x => {
            return R.tryCatch(JSON.parse, () => x)(x);
        })
    }
};


