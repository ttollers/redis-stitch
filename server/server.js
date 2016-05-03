"use strict";

var server;

module.exports = function (config) {
    var R = require('ramda');
    var restify = require('restify');
    var logger = require('winston').loggers.get('elasticsearch');
    logger.transports.console.timestamp = true;
    var morgan = require('morgan');
    logger.info('Config', config);

    function translateAPIMethodName(APIname) {
        return APIname.toUpperCase() === 'DEL' ? 'DELETE' : APIname.toUpperCase();
    }

    var redisClient = require('./lib/db')(config);

    function useAPI(prefix, server) {
        var api = require('./lib/' + prefix)(redisClient);
        for (var method in api) {
            if (api.hasOwnProperty(method) && R.contains(translateAPIMethodName(method), config.allowedMethods)) {
                server[method](new RegExp('\/' + prefix + '\/.+'), api[method]);
                logger.info('Adding method ' + translateAPIMethodName(method) + ' on endpoint /' + prefix + '/');
            }
        }
    }

    server = restify.createServer();
    server.use(morgan(':date[iso] - info: endpoint method=:method, url=:url, status=:status, response-time=:response-time'));

    server.use(function crossOrigin(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "X-Requested-With");
        return next();
    });

    server.use(restify.queryParser());

    //activate API verions here
    useAPI('v1', server);

    server.on('uncaughtException', function (req, res, route, err) {
        logger.error('ERROR', {}, err.stack);
        res.send(new restify.InternalServerError());
        res.end();
    });

    server.listen(config.server.port, function () {
        logger.info('server listening', {
            server_name: server.name,
            server_url: server.url
        });
    });

};


if (require.main === module) {
    module.exports(require('config'));
}