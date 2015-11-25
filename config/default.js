module.exports = {
    "redis": {
        "host": process.env.REDIS_HOST || '127.0.0.1',
        "port": process.env.REDIS_PORT || 6379
    },
    "server": {
        "port": process.env.PORT || 8080
    }
}