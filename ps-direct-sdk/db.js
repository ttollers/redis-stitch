"use strict";

var hl = require('highland');
var logger = require('winston');
var R = require("ramda");

const logKey = (msg, key) => () => logger.info(msg, { key });

const logKeyScore = (msg, key, score) => () => logger.info(msg, { score, key });

module.exports = function (config) {
    var client = R.isNil(config) ? initFakeRedis() : initRealRedis(config);
    logger.verbose('Initialised connection to database');

    return {
        getKey: (key) => {
            logger.info('Retrieving key', { key });
            return client.getStream(key).tap(logKey('Key retrieved', key));
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
            logger.info('Setting key', { key });
            return client.setStream(key, value).tap(logKey('Key set', key));
        },
        delKey: function delKey(key) {
            logger.info('Deleting key', { key });
            return client.delStream(key).tap(logKey('Key deleted', key));
        },
        addToKey: function addToKey(key, score, value) {
            logger.info('Appending to list', { score, key });
            return client.zaddStream(key, score, value).tap(logKeyScore('Appended to list', key, score));
        },
        delFromKey: function delFromKey(key, value) {
            return client.zremStream(key, value);
        },
        delFromKeyByScore: function (key, score) {
            logger.info('Removing from list', { score, key });
            return client.zremrangebyscoreStream(key, score, score).tap(logKeyScore('Removed from list', key, score));
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