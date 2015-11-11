/**
 * Created by DayoAdeyemi on 11/11/2015.
 */
var hl = highland = require('highland');
var redis = require('redis');
hl.streamifyAll(redis.RedisClient.prototype);
hl.streamifyAll(redis.Multi.prototype);
var PORT = process.env.REDIS_PORT || 6379;
var HOST = process.env.REDIS_HOST || '127.0.0.1';
var client;

function connect(){
    client = redis.createClient(PORT, HOST);
    console.log('connected to redis at %s:%s', HOST, PORT);
}

function getKey(key){
    return client.getStream(key)
}

function setKey(key, value){
    return client.setStream(key, value)
}

function delKey(key) {
    return client.delStream(key)
}

module.exports = { getKey, setKey, delKey, connect };