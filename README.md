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

 - `put: (key, value, cb) => void` - Sets value at key
 - `del: (key, cb) => void` - deletes the value at key
 - `add: (key, score, value, cb) => void` - adds value to the list at key
 - `del: (key, cb) => void` - deletes the value at key
 - `rem: (key, value, cb) => void` - removes the value from the list at key
 - `get: (key, cb) => void` - gets the value at key, hydating any placeholders. If the value is a list it will return it in the form `[<val1>,<val1>,..]` where `<val1>` etc are the hydrated values in the list.

**keys**

The keys of that are used in the presentation-service must be prefixed by an api-version else as that determines what code is used to process it e.g. `/v1/cat` it processes with api version `v1`.

The general format of a place-holder is `${<resource>}` where `<resource>` is normally just the key for the value, however a resource can have the following format
```<key>[,<prop_1>,<prop_2>..][;<default>]```
Here square brackets denote optional parameters and angle brackets denote parameters.
A resource of this form will output the value of the `<key>[,<prop_1>,<prop_2>..]` if it is successfully retrieved otherwise it returns `<default>` if it is given or an error message. Furthermore if the value at `<key>` is JSON then what is returned is the value found when you pick the `prop_1` field from that json and the `prop_2` from that and so on.
for example given that `{ foo: { bar: "hoot" } }` is saved at '/v1/key', then `/v1/key,foo,bar` will return `"hoot"` and `/v1/key,foo,car;woot` will return `"woot"`


#Contributors
[Dayo Adeyemi](https://www.npmjs.com/~dayoadeyemi) 