"use strict";

var rewire = require('rewire');
var chai = require('chai');
var assert = chai.assert;
var R = require('ramda');
var hl = require('highland');
var request = require('supertest');
var restify = require('restify');

var assertEquals = function (obj1) {
    return function (obj2) {
        assert(R.equals(obj1,obj2));
    }
}

describe('unit tests', () => {
    describe('sdk', () => {
        var presentationService = require('../sdk');
        var ps = presentationService();

        it('exists', () => assert.ok(ps));

        it('has a put method', () => assert(R.has('put', ps)));

        it('has a get method', () => assert(R.has('get', ps)));

        it('has a del method', () => assert(R.has('del', ps)));

        it('has a putObject method', () => assert(R.has('putObject', ps)));

        it('has a add method', () => assert(R.has('add', ps)));

        it('has a rem method', () => assert(R.has('rem', ps)));

        it('puts strings and returns the strings on a get', (done) => {
            ps.put('/v1/stringAddGet', 'this is just some data')
                .tap(assert.ok)
                .flatMap(() => ps.get('/v1/stringAddGet'))
                .tap(assert.ok)
                .tap(assertEquals('this is just some data'))
                .pull(done);
        });

        it('puts a new string and returns the new string on a get', (done) => {
            ps.put('/v1/stringAddGet2', '"this is just some data"')
                .tap(assert.ok)
                .flatMap(() => ps.put('/v1/stringAddGet2', 'this is just some data 2'))
                .tap(assert.ok)
                .flatMap(() => ps.get('/v1/stringAddGet2'))
                .tap(assert.ok)
                .tap(assertEquals('this is just some data 2'))
                .pull(done);
        });

        it('on deleted data returns a 404 on a get', (done) => {
            ps.del('/v1/404test')
                .flatMap(() => ps.get('/v1/404test'))
                .errors(e => {
                    assert(R.is(Error, e), 'throws an err');
                    assertEquals(e.message, '/v1/404test not available');
                })
                .pull(done);
        });

        it('can put and get an object using the putObject method', (done)=> {
            var obj = {"data":{"type": "un-stringified data"}};
            ps.putObject('/v1/putObjectTest', obj)
                .flatMap(() => ps.get('/v1/putObjectTest'))
                .tap(assert.ok)
                .tap(assertEquals(obj))
                .pull(done)
        });

        it('can add and then get some data', (done) => {
            ps.del('/v1/dataListTest')
                .flatMap(() => ps.add('/v1/dataListTest', 0, 'some data 0'))
                .flatMap(() => ps.add('/v1/dataListTest', 1, 'some data 1'))
                .flatMap(() => ps.get('/v1/dataListTest'))
                .tap(assert.ok)
                .tap(assertEquals('[some data 0,some data 1]'))
                .pull(done)
        });

        it('returns json after adding json to a list', (done) => {
            ps.del('/v1/objectListTest')
                .flatMap(() => ps.add('/v1/objectListTest', 0, '"some data 0"'))
                .flatMap(() => ps.add('/v1/objectListTest', 1, '{"data": "some data 1"}'))
                .flatMap(() => ps.get('/v1/objectListTest'))
                .tap(assert.ok)
                .tap(assertEquals(['some data 0',{data:'some data 1'}]))
                .pull(done)
        });

        it('removes data from a list', (done) => {
            ps.del('/v1/remTest')
                .flatMap(() => ps.add('/v1/remTest', 0, 'some data 0'))
                .flatMap(() => ps.add('/v1/remTest', 1, 'some data 1'))
                .flatMap(() => ps.rem('/v1/remTest', 'some data 1'))
                .tap(assert.ok)
                .flatMap(() => ps.get('/v1/remTest'))
                .tap(assert.ok)
                .tap(assertEquals('[some data 0]'))
                .pull(done)
        });

        it('resolves references on a get', (done) => {
            ps.put('/v1/simpleReferenceTest/main', '${/v1/simpleReferenceTest/linked}')
                .flatMap(() => ps.putObject('/v1/simpleReferenceTest/linked', {"data":"this is just some data"}))
                .flatMap(() => ps.get('/v1/simpleReferenceTest/main'))
                .tap(assert.ok)
                .tap(assertEquals({"data":"this is just some data"}))
                .pull(done)
        });

        it('resolves reference objects passed to putObject', (done) => {
            ps.putObject('/v1/objectReferenceTest/main', {"data":"data", "innerData": {$ref:'${/v1/objectReferenceTest/linked}'}})
                .flatMap(() => ps.putObject('/v1/objectReferenceTest/linked', {"data":"data"}))
                .flatMap(() => ps.get('/v1/objectReferenceTest/main'))
                .tap(assert.ok)
                .tap(assertEquals({"data":"data", "innerData": {"data":"data"}}))
                .pull(done)
        });

        it('resolves references on lists', (done) => {
            hl.merge([
                    ps.del('/v1/referenceList'),
                    ps.add('/v1/referenceList', 3, '${/v1/referenceList/3}'),
                    ps.add('/v1/referenceList', 1, '${/v1/referenceList/1}'),
                    ps.add('/v1/referenceList', 2, '${/v1/referenceList/2}'),
                    ps.add('/v1/referenceList', 0, '${/v1/referenceList/0}'),
                    ps.putObject('/v1/referenceList/0', { "data": "this is just some data0" }),
                    ps.putObject('/v1/referenceList/1', { "data": "this is just some data1" }),
                    ps.put('/v1/referenceList/2', '{ "data": "this is just some data2" }'),
                    ps.put('/v1/referenceList/3', '{ "data": "this is just some data3" }')
                ])
                .collect()
                .flatMap(() => ps.get('/v1/referenceList'))
                .tap(assertEquals([
                        {"data": "this is just some data0"},
                        {"data": "this is just some data1"},
                        {"data": "this is just some data2"},
                        {"data": "this is just some data3"}
                    ]))
                .pull(done)
        });

        it('resolves nested references', (done) => {
            hl.merge([
                    ps.put('/v1/nestedTest/1', 'a${/v1/nestedTest/2}'),
                    ps.put('/v1/nestedTest/2', 'b${/v1/nestedTest/3}'),
                    ps.put('/v1/nestedTest/3', 'c${/v1/nestedTest/4}'),
                    ps.put('/v1/nestedTest/4', 'd')
                ])
                .collect()
                .flatMap(() => ps.get('/v1/nestedTest/1'))
                .tap(assertEquals('abcd'))
                .pull(done);
        });

        it('filters', (done) => {
            hl.merge([
                    ps.del('/v1/filterTest'),
                    ps.add('/v1/filterTest', 0, '${/v1/filterTest/0}'),
                    ps.add('/v1/filterTest', 1, '${/v1/filterTest/1}'),
                    ps.add('/v1/filterTest', 2, '${/v1/filterTest/2}'),
                    ps.add('/v1/filterTest', 3, '${/v1/filterTest/3}'),
                    ps.put('/v1/filterTest/0', '0'),
                    ps.put('/v1/filterTest/1', '1'),
                    ps.put('/v1/filterTest/2', '2'),
                    ps.put('/v1/filterTest/3', '3')
                ])
                .flatMap(() => ps.get('/v1/filterTest[1|2]'))
                .tap(assertEquals([1,2]))
                .flatMap(() => ps.get('/v1/filterTest[|2]'))
                .tap(assertEquals([0,1,2]))
                .flatMap(() => ps.get('/v1/filterTest[1|]'))
                .tap(assertEquals([1,2,3]))
                .flatMap(() => ps.get('/v1/filterTest^2'))
                .tap(assertEquals([0,1]))
                .flatMap(() => ps.get('/v1/filterTest[1|]^2'))
                .tap(assertEquals([1,2]))
                .pull(done)
        });

        it('rejects non-string values passed to put', (done) => {
            ps.put('/v1/NonStringPutTest', {'data':'data'})
                .stopOnError(err => {})
                .tap(() => assert.fail('Should have failed'))
                .pull(done);
        });
    });
});