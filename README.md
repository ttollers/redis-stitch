# README #

The presentation service is a thin wrapper around redis for doing joins via in place string replacement on request.

### How does it work? ###

The presentation service is a node web-server that requires a redis instance as a backing database (or that runs off process memory for testing purposes). It also come bundles with a node js based javascript sdk for making requests to a presentation service instance.

### How do I use it? ###
**The web-server**
 set the redis setting and port setting in the config file, the is an example in config/default.js, this is imported using [node-config](https://www.npmjs.com/package/config).

**The sdk**
After installing with `npm install presentation-service`, use
```javascript
var ps = require('presentation-service')('<web-server-url>');
```
where `<web-server-url>` is the url of a hosted presentation-service, this will expose a number of functions
`put: (key, value, cb) => void`
TODO
`del: (key, cb) => void`
TODO
`add: (key, score, value, cb) => void`
TODO
`del: (key, cb) => void`
TODO
`rem: (key, value, cb) => void`
TODO
`get: (key, cb) => void`
TODO

**keys**
the keys of that are used in the presentation-service must be prefixed by an api-version else as that determines what code is used to process it e.g. `/v1/cat` it processes with api version 1


#Contributors
[Dayo Adeyemi](https://www.npmjs.com/~dayoadeyemi) 