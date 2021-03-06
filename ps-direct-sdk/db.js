"use strict";

const hl = require('highland');
const R = require("ramda");

const BeneLogger = require('bene-logger');
const logger = new BeneLogger();


module.exports = function (config) {
    var client = R.isNil(config) ? initFakeRedis() : initRealRedis(config);
    logger.info('Initialised connection to database');

    return {
        getKey: (key) => {
            return client.getStream(key);
        },
        listKey: function listKey(key, before, after, limit) {
            if (limit === Infinity) {
                return client.zrangebyscoreStream(key, after, before);
            }
            return client.zrangebyscoreStream(key, after, before, 'LIMIT', 0, limit);
        },
        getMultiple: function (keys) {
            return client.mgetStream(keys);
        },
        setKey: function (key, value) {
            return client.setStream(key, value);
        },
        delKey: function delKey(key) {
            return client.delStream(key);
        },
        addToKey: function addToKey(key, score, value) {
            return client.zaddStream(key, score, value);
        },
        delFromKey: function delFromKey(key, value) {
            return client.zremStream(key, value);
        },
        delFromKeyByScore: function (key, score) {
            return client.zremrangebyscoreStream(key, score, score);
        }
    };
};

function initFakeRedis() {
    var fakeRedis = require("fakeredis");
    fakeRedis.fast = true;
    hl.streamifyAll(fakeRedis.RedisClient.prototype);
    return fakeRedis.createClient();
}

function initRealRedis(config) {
    var redis = require('redis');
    hl.streamifyAll(redis.RedisClient.prototype);
    hl.streamifyAll(redis.Multi.prototype);
    const PORT = config.port;
    const HOST = config.host;
    logger.verbose('connected to redis at %s:%s', HOST, PORT, {});
    return redis.createClient(PORT, HOST);
}