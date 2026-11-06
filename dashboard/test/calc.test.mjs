// Run: node test/calc.test.mjs   (from dashboard/). Throws on the first failed assertion.
import assert from 'node:assert/strict';
import { CALC0, press, fmt, convert, parseExpiry, withExpiry, daysLeft, fridgeItem, fridgeRows } from '../calc.js';

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
// fridge estimates, counted from the purchase date
const nov6 = new Date(2026, 10, 6, 12);
assert.deepEqual(fridgeItem({ name: 'BROCCOLI BIO', purchase_date: '2026-11-04' }, nov6), { label: 'Broccoli', section: 'Fruit & veg', age: 2, left: 3 });
assert.equal(fridgeItem({ name: 'LACHSFORELLENFI.', purchase_date: '2026-10-26' }, nov6).left, -9, 'past the estimate');
assert.equal(fridgeItem({ name: 'NUTELLA 450G', purchase_date: '2026-10-26' }, nov6).left, null, 'keeps: no estimate');
assert.equal(fridgeItem({ name: 'WEIHENST. BUTTER', purchase_date: '2026-10-21' }, nov6).section, 'Dairy & eggs');
assert.deepEqual(fridgeItem({ name: 'MADS FRUITS', purchase_date: '2026-11-06' }, nov6), { label: 'Mads Fruits', section: 'Other', age: 0, left: null }, 'unknown item: title case, no guess');
const lots = fridgeRows([
  { id: 'a', name: 'KAROTTE BIO', qty: 1, purchase_date: '2026-11-04' },
  { id: 'b', name: 'KAROTTE BIO', qty: 2, purchase_date: '2026-10-27' },
  { id: 'c', name: 'KAROTTE BIO', qty: 1, purchase_date: '2026-10-21' },
  { id: 'd', name: 'MANGO', qty: 1, purchase_date: '2026-11-04' },
  { id: 'e', name: 'MANGO 7ER', qty: 1, purchase_date: '2026-11-04' },
  { id: 'f', name: 'BROCCOLI BIO', qty: 1, purchase_date: '2026-11-04' }
], nov6);
assert.deepEqual(lots.map(r => [r.label, r.state, r.qty, r.ids.join('')]), [
  ['Broccoli', 'soon', 1, 'f'], ['Karotten', 'past', 1, 'c'], ['Karotten', '', 3, 'ab'], ['Mango', '', 2, 'de']
], 'same food merges, freshness splits, soon sorts first');
assert.deepEqual([lots[2].newest, lots[2].age, lots[2].left], [2, 10, 4], 'the oldest pack drives the estimate');
console.log('calc ok');
