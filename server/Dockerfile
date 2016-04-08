FROM mhart/alpine-node:5.9.0

COPY package.json /src/package.json
WORKDIR /src

RUN npm install --production

COPY . /src

EXPOSE 8080

CMD npm start