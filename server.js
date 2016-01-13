/**
 * Created by DayoAdeyemi on 06/11/2015.
 */
var restify = require('restify');
var db = require('./lib/db');
var config = require('config');
var winston = require('winston');
var logger = winston;

logger.info('Config : %j', config, {});

function useAPI(prefix, server) {
    var api = require('./lib/' + prefix);
    for (var method in api) {
        if (api.hasOwnProperty(method)) {
            server[method](new RegExp('\/' + prefix + '\/.+'), api[method]);
        }
    }
}

var server = restify.createServer();

server.use(function crossOrigin(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    return next();
});

server.use(restify.queryParser());

//activate API verions here
useAPI('v1', server);

server.on('uncaughtException', function(req, res, route, err) {
    logger.error(err.stack);
    res.send(new restify.InternalServerError());
    res.end();
});


db.connect();
server.listen(config.server.port, function() {
    logger.info('%s listening at %s', server.name, server.url, {});
});