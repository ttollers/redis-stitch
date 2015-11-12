/**
 * Created by DayoAdeyemi on 11/11/2015.
 */
var R = require('ramda');
var hl = highland = require('highland');
var restify = require('restify');
var qs = require('restify');
var db = require('./db');

function hydrateString(local, string){
    var m, init, key, tail;
    if (m = string.match(/\${(.*?)}/)) {
        init = string.slice(0, m.index);
        key = m[1];
        tail = string.slice(m.index + m[0].length);
        return hydrateKey(local, key).flatMap(
                hydrated => hydrateString(local, tail).map(
                    hydratedTail => init + hydrated + hydratedTail
            )
        )
    } else return hl([string]);
}
function hydrateKey(local, key){
    if (local[key] === null) {
        throw new restify.InternalServerError('cycle detected in ' + key);
    } else if (R.has(key, local)) {
        return hl([local[key]]);
    } else {
        local[key] = null;
        return db.getKey(key)
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
            .flatMap(value => hydrateString(local, value)
                .errors((err, push) => push(new restify.ResourceNotFoundError(err, key + ' not available as '+ err.message))))
            .tap(function (value){
                local[key] = value;
            })
    }
}

module.exports = {
    get(req, res, next) {
        var key = req.path();
        hydrateKey({}, key)
            .errors(e => next(e))
            .each(output => {
                res.write(output);
                res.end();
                next();
            })
    },
    put(req, res, next) {
        var key = req.path();
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
        var key = req.path();
        (req.query.value == null ? db.delKey(key) : db.delFromKey(key, req.query.value))
            .done(() => {
                res.writeHead(204);
                res.end();
                return  next();
            })
    }
};