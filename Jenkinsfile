def runTests() {
    sh '''#!/bin/bash -l
    n 4.2.6
    set -e
    for npmfolder in */ ;
    do if [ -a "$npmfolder/package.json" ]
    then
        cd $npmfolder;
        pwd;
        npm prune;
        npm install --no-optional;
        npm test;
        cd ../
    fi
    done
    '''
}

node("docker-slave-n") {
    stage "Checkout Presentation Service"
        checkout scm
    stage "Presentation Service Tests"
        runTests()

    stage "Check that version has changed"
        sh '''#!/bin/bash -l
           PACKAGE_VERSION=$(cat ./server/package.json | jq -r ".version")
           echo "CURRENT_VERSION=\${PACKAGE_VERSION}" > ./launcher.properties
        '''

        sh '''#!/bin/bash -l
            LATEST_VERSION=$(npm show presentation-service-server version)
            echo "LATEST_VERSION=\${LATEST_VERSION}" >> ./launcher.properties
       '''

       sh "cat ./launcher.properties"

       sh '''#!/bin/bash -l
            vercomp () {
                if [[ $1 == $2 ]]
                then
                    return 0
                fi
                local IFS=.
                local i ver1=($1) ver2=($2)
                # fill empty fields in ver1 with zeros
                for ((i=${#ver1[@]}; i<${#ver2[@]}; i++))
                do
                    ver1[i]=0
                done
                for ((i=0; i<${#ver1[@]}; i++))
                do
                    if [[ -z ${ver2[i]} ]]
                    then
                        # fill empty fields in ver2 with zeros
                        ver2[i]=0
                    fi
                    if ((10#${ver1[i]} > 10#${ver2[i]}))
                    then
                        return 1
                    fi
                    if ((10#${ver1[i]} < 10#${ver2[i]}))
                    then
                        return 2
                    fi
                done
                return 0
            }
            set -a
            source ./launcher.properties
            vercomp $LATEST_VERSION $CURRENT_VERSION
            case $? in
                0) op='0';;
                1) op='1';;
                2) op='2';;
            esac

            echo $op

            if [[ $op != '2' ]]
            then
                echo "FAILED as version has not been updated"
                exit 1
            else
                echo "VERSION UPDATE. Continue to build docker image"
                exit 0
            fi
       '''

    stage "Docker: Build"

        sh '''#!/bin/bash -l
           source ./launcher.properties
           cd server
           docker build -t trinitymirror/presentation-service:"$PACKAGE_VERSION" .
        '''

    stage "Docker: Push"
        sh '''#!/bin/bash -l
            source ./launcher.properties
            cd server
            docker push trinitymirror/presentation-service:"$PACKAGE_VERSION"
        '''

    stage "Publish to NPM"
        sh '''
            cd server
            npm publish
        '''
}