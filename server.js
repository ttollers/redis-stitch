/**
 * Created by DayoAdeyemi on 06/11/2015.
 */
var restify = require('restify');
var db = require('./lib/db');

function useAPI(prefix, server){
    var api = require('./lib/' + prefix)
    for (var method in api) {
        if (api.hasOwnProperty(method)) {
            server[method](new RegExp('\/' + prefix + '\/.+'), api[method]);
        }
    }
}

var server = restify.createServer();

server.use(function crossOrigin(req,res,next){
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    return next();
});

server.use(restify.queryParser());

//activate API verions here
useAPI('v1', server);

server.on('uncaughtException', function (req, res, route, err) {
    console.error(err.stack);
    res.send(new restify.InternalServerError());
    res.end();
});


db.connect();
server.listen(process.env.PORT || 8080, function () {
    console.log('%s listening at %s', server.name, server.url);
});
