#!/bin/sh
set -e

#presentation-service-server upload
cd server

#get version
export SERVER_VERSION=$(cat package.json | jq -r '.version')

#build & push docker image
docker build -t trinitymirror/presentation-service:$SERVER_VERSION .
docker push trinitymirror/presentation-service:$SERVER_VERSION

#publish latest version to npm
npm publish


#presentation-service-server upload
cd ../js-sdk

#publish latest version to npm
npm publish