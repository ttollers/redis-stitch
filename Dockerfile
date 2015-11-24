FROM node:4.1.2

COPY package.json /src/package.json
WORKDIR /src

RUN npm install

COPY . /src

EXPOSE 8080

CMD npm start