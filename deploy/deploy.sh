#!/bin/bash

#Point to the consul which matches the prefix
sed -i.bak "s/ChronosConsul-dev/ChronosConsul-$ENVIRONMENT_SUFFIX/g" Dockerrun.aws.json

eb init
eb deploy presentation-service-$ENVIRONMENT_SUFFIX