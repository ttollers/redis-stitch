"use strict";

var server = require("./server");

module.exports = server({
    "redis": {"host": "127.0.0.1", "port": 6379},
    "server": {"port": 8080},
    "allowedMethods": ["GET", "PUT", "DELETE"],
    "database": "redis"
});
