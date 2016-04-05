"use strict";

var R = require('ramda');
var hl = require('highland');
var redis = require('redis');
var logger = require('winston');
hl.streamifyAll(redis.RedisClient.prototype);
hl.streamifyAll(redis.Multi.prototype);

module.exports = {
    store: {},
    connect: function() {
        delete module.exports.store;
        module.exports.getKey = function getKey(key) {
            return client.getStream(key);
        };
        module.exports.setKey = function setKey(key, value) {
            return client.setStream(key, value)
        };
        module.exports.delKey = function delKey(key) {
            return client.delStream(key)
        };
        module.exports.listKey = function listKey(key, before, after, limit) {
            if (limit == Infinity) {
                return client.zrangebyscoreStream(key, after, before);
            }
            return client.zrangebyscoreStream(key, after, before, 'LIMIT', 0, limit);
        };
        module.exports.getMultiple = function (keys) {
            return client.mgetStream(keys);
        };
        module.exports.addToKey = function addToKey(key, score, value) {
            return client.zaddStream(key, score, value)
        };
        module.exports.delFromKey = function delFromKey(key, value) {
            return client.zremStream(key, value)
        };
        module.exports.delFromKeyByScore = function (key, score) {
            return client.zremrangebyscoreStream(key, score, score);
        };

        const config = require('config');
        const PORT = config.redis.port;
        const HOST = config.redis.host;
        const client = redis.createClient(PORT, HOST);
        logger.verbose('connected to redis at %s:%s', HOST, PORT, {});
    },
    getKey: function(key) {
        
        if (this.store[key] === void 0) return hl([null]);
        else if (R.is(String, this.store[key])) return hl([this.store[key]]);
        else {
            let e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
            e.code = 'WRONGTYPE';
            return hl(function(push) {
                push(e);
            })
        }
    },
    listKey: function(key, before, after, limit) {
        if (this.store[key] == void 0) return hl([]);
        else if (!R.is(String, this.store[key])) {
            return hl.pairs(this.store[key])
                .filter(x => x[1] >= after && x[1] <= before)
                .sortBy(function (a, b) {
                    return a[1] - b[1];
                })
                .take(limit)
                .pluck(0)
                .collect();
        } else {
            let e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
            e.code = 'WRONGTYPE';
            return hl(function(push) {
                push(e);
            })
        }
    },
    getMultiple: function(keys) {
        const store = this.store;
        const k = keys.map(function (key) {
            return R.is(String, store[key]) ? store[key] : null;
        });
        return hl(k).collect();
    },
    setKey: function(key, value) {
        this.store[key] = value;
        return hl(["OK"]);
    },
    delKey: function(key) {
        const output = R.has(key, this.store) ? 1 : 0;
        delete this.store[key];
        return hl([output]);
    },
    addToKey: function(key, score, value) {
        if (this.store[key] === void 0) this.store[key] = {};
        if (!R.is(String, this.store[key])) {
            this.store[key][value] = score;
            return hl(["OK"]);
        } else {
            let e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
            e.code = 'WRONGTYPE';
            return hl(function (push) {
                push(e);
            })
        }
    },
    delFromKey: function(key, value) {
        if (this.store[key] == void 0) return hl([0]);
        else if (!R.is(String, this.store[key])) {
            if (R.isNil(this.store[key][value])) {
                return hl([0]);
            } else {
                delete this.store[key][value];
                return hl([1]);
            }
        } else {
            let e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
            e.code = 'WRONGTYPE';
            return hl(function (push) {
                push(e);
            })
        }
    },
    delFromKeyByScore: function(key, score) {
        if (this.store[key] == void 0) return hl([]);
        else if (!R.is(String, this.store[key])) {
            this.store[key] = R.pipe(R.toPairs, R.reject(x => x[1] === score), R.fromPairs)(this.store[key]);
            return hl([1]);

        } else {
            let e = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
            e.code = 'WRONGTYPE';
            return hl(function (push) {
                push(e);
            })
        }

    }
};