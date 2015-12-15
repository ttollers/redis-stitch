/**
 * Created by DayoAdeyemi on 11/11/2015.
 */
var R = require('ramda');
var hl = highland = require('highland');
var restify = require('restify');
var qs = require('restify');
var db = require('./db');

/**
 * recursively hydrates all the placeholders in a string
 *
 * splits the string into multiple evaluated string and replaceHolders
 * then evaluates all placehoders and concatenates the string
 * @param {Object} local
 * @param {String} string
 * @returns {Stream<String>}
 */
function hydrateString(local, string){
    var m;
    //var orig=string;
    var list = [];
    while (m = string.match(/\${(.*?)}/)){
        list.push(hl([string.slice(0, m.index)]));
        list.push(hl([m[1]])
            .flatMap(R.partial(hydrateKey, [local])));
        string = string.slice(m.index + m[0].length);
    }
    list.push(hl([string]));
    return hl(list).sequence().reduce1(R.add);
        //.tap(x => console.log(orig,'->', x, '\n')) //log transformation results;
}

/**
 * recursively hydrates a particlular resource
 * @param {Object} local
 * @param {String} input
 * @returns {*}
 */
function hydrateKey(local, input){
    var $temp = input.split(';'), resource = $temp[0], def = $temp[1];
    var xs = resource.split(','), key = R.head(xs), props = R.tail(xs);
    var stream;
    if (local[key] === null) {
        throw new restify.InternalServerError('cycle detected in ' + key);
    } else if (R.has(key, local)) {
        stream = hl([local[key]])
    } else {
        local[key] = null;
        stream = db.getKey(key)
            .consume((err, x, push, next) => {
                if (err) {
                    if (err.code === 'WRONGTYPE'){
                        db.listKey(key)
                            .pull((err, list) => {
                                if (err) push (err);
                                else push(null, '[' + list.toString()+']')
                                next();
                            })
                    } else {
                        push(err)
                        next()
                    }
                } else if (x === hl.nil){
                    push(null, hl.nil);
                } else {
                    push(null, x);
                    next();
                }
            })
            .map(_ => {
                if (_ === null) throw new restify.ResourceNotFoundError(key + ' not available');
                else return _;
            })
            .flatMap(value =>
                hydrateString(local, value)
                    .map(value => {
                        try {
                            return JSON.parse(value);
                        } catch (e){
                            return value;
                        }
                    })
                    .errors((err, push) => push(new restify.ResourceNotFoundError(err, key + ' not available as '+ err.message))))
            .tap(value => {
                local[key] = value;
            })
    }
    return stream
        .map(R.path(props)).map(_ => {
            if (_ === void 0) throw new restify.ResourceNotFoundError( [key].concat(props).reverse().join(' of ') + ' not available');
            else return R.is(String, _) ? _ : JSON.stringify(_);
        })
        .errors((err, push) => (def === void 0) ? push (err) : push (null, def));
}

module.exports = {
    get(req, res, next) {
        var key = decodeURIComponent(req.path());
        hydrateKey({}, key, [])
            .errors(e => next(e))
            .each(output => {
                res.write(output);
                res.end();
                next();
            })
    },
    put(req, res, next) {
        var key = decodeURIComponent(req.path());
        var score = req.query.score && parseInt(req.query.score);
        hl(req)
            .reduce('', R.add)
            .flatMap(value => {
                if (R.isNil(score)) {
                    return db.setKey(key, value);
                } else if (!isNaN(score)){
                    return db.addToKey(key, score, value)
                } else {
                    throw new restify.BadRequestError('score must be a number');
                }
            })
            .done(() => {
                res.writeHead(204);
                res.end();
                return  next();
            })
    },
    del(req, res, next) {
        var key = decodeURIComponent(req.path());
        var stream = (req.query.value == null ? db.delKey(key) : db.delFromKey(key, req.query.value));
        stream
            .done(() => {
                res.writeHead(204);
                res.end();
                return  next();
            })
    }
};