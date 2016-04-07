#!/bin/sh

#get version
export SERVER_VERSION=$(cat package.json | jq -r '.version')

#build & push docker image
docker build -t trinitymirror/presentation-service:$SERVER_VERSION .
docker push trinitymirror/presentation-service:$SERVER_VERSION

#publish latest version to npm
npm publish