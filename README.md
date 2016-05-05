# README #

The presentation service is a thin wrapper around redis for doing joins via in place string replacement on request.

## How does it work? ##

The presentation service is a node web-server that requires a redis instance as a backing database (or that runs off process memory for testing purposes). It also come bundles with a node js based javascript sdk for making requests to a presentation service instance.

## How do I use it? ##
#### The web-server ####

The server is started from `server.js`. There is an example configuration of the web-server in config/default.js, which is imported using [node-config](https://www.npmjs.com/package/config).

**Running the web-server locally**

First, build the presentation service docker image using

```
docker build .
```

which will output the `#presentationServiceDockerHash`

In order to actually run the presentation service a redis instance must already be running. To run a local instance of redis in a docker container that will work with the example config, run the following commands to set up a redis container linked to a presentation service instance:

```
docker run --name redis -d redis
docker run --name presentation-service --link redis:redis -d #presentationServiceDockerHash
```

#### The sdk ####

After installing with `npm install -s presentation-service`, use
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

To query a range of items from a list, append the url with `[<min>|<max>]^<limit>`. For example `/v1/nationals-live/6679834[1|2]^1`
All parameters are optional.


#Contributors
[Dayo Adeyemi](https://www.npmjs.com/~dayoadeyemi)


# Deploying to presentation service
 publish latest version to npm
 docker build -t trinitymirror/presentation-service:version .
 docker push trinitymirror/presentation-service:version
 update the presentation version in /live-centre/live-centre-launcher/config/default.json
 deploy the live-centre env bitbucket trigger

 All these steps are now done automatically by Jenkins
