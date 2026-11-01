'use strict';

var inspect = require('object-inspect');
// var IsDetachedBuffer = require('es-abstract/2023/IsDetachedBuffer');

var forEach = require('for-each');
var isTypedArray = require('is-typed-array');
var availableTypedArrays = require('available-typed-arrays')();
var v = require('es-value-fixtures');

module.exports = function runTests(slice, t) {
	forEach(v.primitives.concat(v.objects), function (nonTA) {
		t['throws'](
			function () { slice(nonTA); },
			TypeError,
			inspect(nonTA) + ' is not a Typed Array'
		);
	});

	t.test('Typed Arrays', { skip: availableTypedArrays.length === 0 }, function (st) {
		forEach(availableTypedArrays, function (name) {
			st.test(name, function (s2t) {
				var TA = global[name];
				var isBigInt = name.slice(0, 3) === 'Big';

				var ta = new TA(isBigInt ? [BigInt(1), BigInt(2), BigInt(3)] : [1, 2, 3]);

				var copy = slice(ta);
				s2t.notEqual(copy, ta, 'returns a new instance when sliced with no args');
				s2t.ok(copy instanceof TA, 'returns an instance of the same type when sliced with no args');
				s2t.deepEqual(copy, ta, 'returns a new instance with the same values when sliced with no args');
				s2t.notEqual(copy.buffer, ta.buffer, 'the new instance has a different buffer than the original when sliced with no args');

				var subset = slice(ta, 1);
				s2t.notEqual(subset, ta, 'returns a new instance when sliced with a start index');
				s2t.ok(copy instanceof TA, 'returns an instance of the same type when sliced with a start index');
				s2t.deepEqual(
					subset,
					new TA(isBigInt ? [BigInt(2), BigInt(3)] : [2, 3]),
					'returns a new instance with the expected subset of values when sliced with a start index'
				);
				s2t.notEqual(copy.buffer, ta.buffer, 'the new instance has a different buffer than the original when sliced with a start index');

				var withConstructor = new TA(isBigInt ? [BigInt(1), BigInt(2), BigInt(3)] : [1, 2, 3]);
				withConstructor.constructor = function () {
					throw new EvalError('a `constructor` without `Symbol.species` should not be called');
				};
				var fromDefault = slice(withConstructor);
				s2t.ok(fromDefault instanceof TA, 'a `constructor` without `Symbol.species` uses the default constructor');
				s2t.deepEqual(fromDefault, ta, 'a `constructor` without `Symbol.species` keeps the values');

				s2t.end();
			});
		});

		return st.end();
	});

	var buffer = typeof Buffer === 'function' && (Buffer.from ? Buffer.from([1, 2, 3]) : new Buffer([1, 2, 3]));
	t.test('Buffer', { skip: !isTypedArray(buffer) }, function (st) {

		var copy = slice(buffer);
		st.notEqual(copy, buffer, 'returns a new instance');
		st.deepEqual(Array.prototype.slice.call(copy), [1, 2, 3], 'returns a new instance with the same values');

		st.end();
	});
};
