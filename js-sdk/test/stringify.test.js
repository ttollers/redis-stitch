/**
 * Created by tomtollinton on 16/03/2016.
 */

var assert = require("chai").assert;
var stringify = require("../lib/stringify");

describe('.stringify', () => {
    it('should exist', () => {
        assert.ok(stringify);
    });

    it("stringifies a basic object", () => {
        assert.equal(stringify({
            "foo" : "foo"
        }), '{\"foo\": \"foo"}');
    });

    it("does not add empty values", () =>{
        assert.equal(stringify({
            "foo" : "foo",
            "bar" : void 0,
            "gee" : ""
        }), '{\"foo\": \"foo", \"gee\": \"\"}');
    });

    it("handles arrays", () => {
        assert.equal(stringify(
            [
                {
                    type: 'paragraph',
                    text: "left as is"
                }
            ]
        ), '[{\"type\": \"paragraph\", \"text\": \"left as is\"}]');
    });


    it("handles objects with the $ref prop differently", () => {
        assert.equal(stringify({
            "$ref" : "ref_with_dollar_sign",
            "foo" : "bar"
        }), "ref_with_dollar_sign");
    });

    it("returns 'null' if second value is null", () => {
        assert.equal(stringify(null), "null");
    });

    it("returns a stringified version if not object or array", () => {
        assert.equal(stringify(10), "10");
        assert.equal(stringify("abc"), '"abc"');
    });

    it('altogether', () => {
        assert.equal(stringify({
            some: "property",
            nothing: null,
            foo: "bar",
            content: [
                {
                    type: 'paragraph',
                    text: "left as is"
                }
            ]
        }), '{'
            + '\"some\": \"property\",'
            + ' \"foo\": \"bar\",'
            + ' \"content\": ['
            + '{'
            + '\"type\": \"paragraph\",'
            + ' \"text\": \"left as is\"'
            + '}'
            + ']'
            + '}');
    });
});