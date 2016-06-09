"use strict";

var rewire = require('rewire');
var sinon = require('sinon');
var hl = require('highland');
var R = require('ramda');
var should = require('should');
require('should-sinon');

var db = {
    get: sinon.stub(),
    rem: sinon.stub()
};
var restifyMock = {
    req: {
        path: sinon.stub(),
        id: sinon.stub()
    },
    res: {
        write: sinon.spy(),
        end: sinon.spy()
    },
    next: sinon.stub()
};

var v1 = rewire('../lib/v1');
v1.__set__('restify', {ResourceNotFoundError: sinon.spy(), ConflictError: sinon.spy()});
var restify = v1.__get__('restify');

describe('Unit test', () => {

    describe('v1 api', () => {
    
        describe('get method', () => {
            
            it('should return error message when error type is DefaultAsKeyNotFound', () => {
                restifyMock.req.path.returns('/v1/hello/world');
    
                db.get.returns(hl([1]).map(function () {
                    var err = new Error('test');
                    err.type = 'DefaultAsKeyNotFound';
                    throw err;
                }));
    
    
                v1(db).get(restifyMock.req, restifyMock.res, restifyMock.next);
                restifyMock.res.end.should.be.called();
                restifyMock.res.write.should.be.calledWith('test');
            });
            
            it('should return next method with restify ResourceNotFoundError error when error type is KeyPropNotFound', () => {
                restifyMock.req.path.returns('/v1/hello/world');
                var err;
                db.get.returns(hl([1]).map(function () {
                    err = new Error('test2');
                    err.type = 'KeyPropNotFound';
                    throw err;
                }));

                v1(db).get(restifyMock.req, restifyMock.res, restifyMock.next);

                restify.ResourceNotFoundError.should.be.calledWith(err);
                restifyMock.next.should.be.called();
            });

            it('should return next method with restify ConflictError error when error type is CycleDetected', () => {
                restifyMock.req.path.returns('/v1/hello/world');
                var err;
                db.get.returns(hl([1]).map(function () {
                    err = new Error('test3');
                    err.type = 'CycleDetected';
                    throw err;
                }));

                v1(db).get(restifyMock.req, restifyMock.res, restifyMock.next);

                restify.ConflictError.should.be.calledWith(err);
                restifyMock.next.should.be.called();
            });

            it('should return next method with error when error type is non-specific', () => {
                restifyMock.req.path.returns('/v1/hello/world');
                var err;
                db.get.returns(hl([1]).map(function () {
                    err = new Error('test3');
                    err.type = 'SegmentationFault';
                    throw err;
                }));

                v1(db).get(restifyMock.req, restifyMock.res, restifyMock.next);

                restifyMock.next.should.be.calledWith(err);
            });
    
        });
    
    });
    
});