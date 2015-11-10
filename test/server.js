var rewire = require('rewire')
var server = rewire('../server.js');
var R = rewire('ramda');
var db = {};
server.__set__('client',{
    getStream(key){
        return hl([db[key]|| null]);
    },
    setStream(key, value){
        db[key] = value;
        return hl(["OK"]);
    }
});