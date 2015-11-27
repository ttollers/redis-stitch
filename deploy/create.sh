#!/bin/bash

if [ $S3_CONFIG_BUCKET ]; then aws s3 cp s3://$S3_CONFIG_BUCKET/$S3_CONFIG_KEY development.js; fi
export NODE_CONFIG=$(cat development.js | tr -d '\n ' | sed -e 's/"/\\\\\"/g' | sed "s/module.exports=//g")

#Point to the consul which matches the prefix, and set NODE_CONFIG with json from the s3 bucket

sed "s/ChronosConsul-dev/ChronosConsul-$ENVIRONMENT_SUFFIX/g" Dockerrun.aws.orig | \
sed "s/{}/$NODE_CONFIG/g" > Dockerrun.aws.json
cat Dockerrun.aws.json

eb init
eb create chronos-pres-$ENVIRONMENT_SUFFIX --cname "chronos-pres-$ENVIRONMENT_SUFFIX" --single -k generator