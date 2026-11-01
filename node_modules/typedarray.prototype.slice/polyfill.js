'use strict';

var implementation = require('./implementation');

module.exports = function getPolyfill() {
	if (typeof Uint8Array === 'function' && Uint8Array.prototype.slice) {
		// V8 4.5 and 4.6 (node 4 and 5) throw when `this.constructor` is not a Typed Array constructor, which includes every Buffer
		var ta = new Uint8Array(1);
		ta.constructor = function (length) {
			return new Uint8Array(length);
		};
		try {
			ta.slice();
		} catch (e) {
			return implementation;
		}
		return Uint8Array.prototype.slice;
	}
	return implementation;
};
