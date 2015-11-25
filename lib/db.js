/**
 * Created by DayoAdeyemi on 11/11/2015.
 */
var hl = highland = require('highland');
var redis = require('redis');
var config = require('config');
hl.streamifyAll(redis.RedisClient.prototype);
hl.streamifyAll(redis.Multi.prototype);
var PORT = config.redis.port;
var HOST = config.redis.host;
var client;

function connect() {
    client = redis.createClient(PORT, HOST);
    console.log('connected to redis at %s:%s', HOST, PORT);
}

function getKey(key) {
    return client.getStream(key);
}


function listKey(key) {
    return client.zrangeStream(key, 0, -1);
}

function setKey(key, value) {
    return client.setStream(key, value)
}

function delKey(key) {
    return client.delStream(key)
}

function addToKey(key, score, value) {
    return client.zaddStream(key, score, value)
}

function delFromKey(key, value) {
    return client.zremStream(key, value)
}

module.exports = {
    getKey, setKey, delKey, listKey, addToKey, delFromKey, connect
};