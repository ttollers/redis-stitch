#!/bin/bash

#Point to the consul which matches the prefix
sed -i.bak "s/ChronosConsul-dev/ChronosConsul-$ENVIRONMENT_SUFFIX/g" Dockerrun.aws.json

eb init
eb create presentation-service-$ENVIRONMENT_SUFFIX --cname "presentation-service-$ENVIRONMENT_SUFFIX" --single -k generator