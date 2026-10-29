// Run: node test/calc.test.mjs   (from dashboard/). Throws on the first failed assertion.
import assert from 'node:assert/strict';
import { CALC0, press, fmt, convert, parseExpiry, withExpiry, daysLeft } from '../calc.js';

const run = keys => keys.split(' ').reduce(press, CALC0).display;

assert.equal(run('0 . 1 + 0 . 2 ='), '0.3', 'float noise hidden');
assert.equal(run('5 + 3 * 2 ='), '16', 'immediate execution, like a pocket calculator');
assert.equal(run('5 + * 2 ='), '10', 'second operator replaces the first');
assert.equal(run('1 / 0 ='), 'Error');
assert.equal(run('1 / 0 = 7'), '7', 'digit after Error starts over');
assert.equal(run('1 / 0 = +'), '0', 'operator after Error resets');
assert.equal(run('2 0 0 + 1 0 %'), '20', '% of the running total');
assert.equal(run('2 0 0 + 1 0 % ='), '220');
assert.equal(run('5 0 %'), '0.5');
assert.equal(run('1 2 3 back back'), '1');
assert.equal(run('7 back'), '0');
assert.equal(run('1 . . 5'), '1.5', 'one decimal point only');
assert.equal(run('9 = 3'), '3', 'typing after = starts a new number');
assert.equal(run('1 2 3 4 5 6 7 8 9 0 1 2 3'), '123456789012', '12 digit cap');
assert.equal(fmt(1 / 3), '0.333333333333');

assert.equal(convert('c-f', 180), 356);
assert.equal(convert('f-c', 356), 180);
assert.equal(convert('cup-ml', 1), 236.59);
assert.equal(convert('x0.5', 250), 125);

const today = new Date(2026, 9, 29, 15, 30); // 29 Oct 2026, afternoon
assert.equal(parseExpiry('', today), null);
assert.equal(parseExpiry('2 Packungen', today), null);
assert.equal(daysLeft('bis 29.10.', today), 0);
assert.equal(daysLeft('bis 3.11.', today), 5);
assert.equal(daysLeft('bis 20.10.', today), -9, 'recent past stays this year');
assert.equal(parseExpiry('bis 5.1.', new Date(2026, 11, 30)).getFullYear(), 2027, 'Jan expiry seen in Dec is next year');
assert.equal(withExpiry('', new Date(2026, 10, 3)), 'bis 3.11.');
assert.equal(withExpiry('Bio bis 1.11.', new Date(2026, 10, 3)), 'Bio bis 3.11.', 'replaces, keeps the rest');
assert.equal(withExpiry('Bio bis 1.11.', null), 'Bio');
console.log('calc ok');
