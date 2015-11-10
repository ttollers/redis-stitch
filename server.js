/**
 * Created by DayoAdeyemi on 06/11/2015.
 */
var R = require('ramda');
var hl = highland = require('highland');
var restify = require('restify');
var server = restify.createServer();
var redis = require('redis');
hl.streamifyAll(redis.RedisClient.prototype);
hl.streamifyAll(redis.Multi.prototype);
var client = redis.createClient(process.env.REDIS_PORT || 6379, process.env.REDIS_HOST || '127.0.0.1');

function getKey(key){
    return client.getStream(key)
        .reject(R.isNil).tap(_ => typeof _)
        .otherwise(hl(['{"$null_ref":"' +key+ '"}']))
}

function setKey(key, value){
    return client.setStream(key, value)
}

function hydrateString(local, string){
    var r = /\${(.*?)}/g;
    return hl(push => {
        var m, i = 0;
        while (m = r.exec(string)) {
            push(null, hl([string.slice(i, m.index)]));
            push(null,  hydrateKey(local, m[1]));
            i = m.index+m[0].length;
        }
        push(null, hl([string.slice(i)]));
        push(null, hl.nil);
    })
    .sequence()
    .reduce1(R.add);
}
function hydrateKey(local, key){
    if (R.has(key, local)) {
        return hl([local[key]]);
    } else {
        local[key] = '{"$circlular_ref":"' +key+ '"}';
        return getKey(key)
        .flatMap(R.partial(hydrateString, [local]))
        .tap(function (value){
            local[key] = value;
        })
    }
}

server.get(/.*/, function (req, res, next) {
    var key = req.path();
    hydrateKey({}, key)
    .otherwise(hl([new restify.NotFoundError(key + ' not found')]))
    .pipe(res)
    return next();
})

server.put(/.*/, function (req, res, next) {
    var key = req.path()
    hl(req)
    .scan('', R.add)
    .flatMap(_ => setKey(key, _))
    .done(_ => {
        res.writeHead(204);
        res.end();
        return  next();
    })
});

server.on('uncaughtException', (req, res, route, err) => console.log(err.stack));

client.on('ready',() => server.listen(process.env.PORT || 80, function () {
    console.log('%s listening at %s', server.name, server.url);
}))
