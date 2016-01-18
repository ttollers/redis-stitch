/**
 * Created by DayoAdeyemi on 11/11/2015.
 */
var R = require('ramda');
var hl = highland = require('highland');
var restify = require('restify');
var db = require('./db');
var nil = {}; // used to flag queried nonexistent keys in local cache
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
    // we could potentially speed this up by evaluating the streams
    // in parallel at (2) and replacing local with R.clone(local)
    // in (1) - so that we don't get false positives on the cycle
    // detection.
    // this could however be less effecient as 1 ->  many -> 1*
    // relations (as is likely in live events) would result in many
    // queries to the 1* item instead of the one query that would
    // be cached.
    // A possibly more efficient implementation might be letting
    // the local store be a map Key -> Promise<Maybe<value>> then
    // after spiting the string for any Key that doesn't already
    // exist in local add it in and then return the result string
    // on resolution of all the relevant Promises.
    // Good look implementing that.
    var m;
    //var orig=string;
    var list = [];
    // extract the placeholders from the string
    while (m = string.match(/\${(.*?)}/)){
        list.push(hl([string.slice(0, m.index)]));
        list.push(hl([m[1]])
            .flatMap(R.partial(hydrateKey, [local]))); // (1)
        string = string.slice(m.index + m[0].length);
    }
    list.push(hl([string]));
    return hl(list).sequence().reduce1(R.add); // (2)
        //.tap(x => console.log(orig,'->', x, '\n')) //log transformation results;
}

/**
 * recursively hydrates a particlular resource
 * @param {Object} local
 * @param {String} input
 * @returns {*}
 */
function hydrateKey(local, input){
    var $temp = input.split(';'),
        resource = $temp[0],
        def = $temp[1]; // the default value to output if the resource doesnt exist
    var xs = resource.split(','),
        key = R.head(xs), // the db key to get the value from
        props = R.tail(xs); // (assuming the data at key parses as a JSON object) the path to get the value from
    var beforeAfterMatch = key.match(/\[(-?\d*)\|(-?\d*)\]/), before = NaN, after = NaN;
    if (beforeAfterMatch) {
        key = key.replace(beforeAfterMatch[0],'');
        after = parseInt(beforeAfterMatch[1]);
        before = parseInt(beforeAfterMatch[2]);
    }
    var limitMatch = key.match(/\^(\d+)/), limit = Infinity;
    if(limitMatch){
        key = key.replace(limitMatch[0],'');
        limit = parseInt(limitMatch[1]);
    }
    if(Number.isNaN(before) || R.isNil(before)) before = Infinity;
    if(Number.isNaN(after) || R.isNil(before)) after = -Infinity;
    var stream;
    if (local[key] === nil) {
        // if the key has ben tested previously and doesn't exist don't test again
        if (R.isNil(def)) throw new restify.ResourceNotFoundError(key + ' not available');
        return hl([def]);
    }
    if (local[key] === null) {
        // if the key is currently being tested there is a cycle in it so throw an error
        throw new restify.InternalServerError('cycle detected in ' + key);
    } else if (R.has(key, local)) {
        // if the key has alread been tested
        stream = hl([local[key]])
    } else {
        // flag the key as currently being tested
        local[key] = null;
        // get the value at key from the db
        stream = db.getKey(key)
            .consume((err, x, push, next) => {
                if (err) {
                    if (err.code === 'WRONGTYPE'){
                        // if there is a WRONGTYPE the key must really hold a list
                        db.listKey(key, before, after, limit)
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
                if (_ === null) {
                    // if there is no value at the key flag this in the local cache and throw a NotFoundError
                    local[key] = nil;
                    throw new restify.ResourceNotFoundError(key + ' not available');
                }
                return _;
            })
            .flatMap(value =>
                // if there a value it must be fully hydrated
                hydrateString(local, value)
                    .map(value => {
                        // parse the value if it is JSON
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
    // stream contains the hydrated value at key if it exists, we must then pull the value at props to return
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
            .errors(e => {
                next(e);
            })
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