// Run: node test/views.test.mjs   (from dashboard/). Throws on the first failed assertion.
import assert from 'node:assert/strict';
import { parseViews, DEFAULT, NAMES } from '../views.js';

assert.deepEqual(parseViews('home,calendar,shopping,photos'), ['home', 'calendar', 'shopping', 'photos']);
assert.deepEqual(parseViews('agents'), ['home', 'agents'], 'home is forced on');
assert.deepEqual(parseViews(' Photos , HOME,photos,xx ,'), ['home', 'photos'], 'trim, case, dedupe, unknown dropped');
assert.deepEqual(parseViews('shopping,calendar'), ['home', 'calendar', 'shopping'], 'rail order, not input order');
assert.deepEqual(parseViews('home'), ['home'], 'home alone is valid');
for (const bad of [undefined, null, '', ' , ', 'nope,xx', 42]) assert.deepEqual(parseViews(bad), DEFAULT, 'fallback for ' + JSON.stringify(bad));
assert.deepEqual(parseViews(NAMES.join(',')), NAMES);
assert.notEqual(parseViews(''), DEFAULT, 'returns a copy, not the shared default');
console.log('views ok');
