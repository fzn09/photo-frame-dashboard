// Run: node test/rewe-map.test.mjs   (from dashboard/). Throws on the first failed assertion.
import assert from 'node:assert/strict';
import { mapIngest, applyUsed } from '../rewe-map.js';

const line = (name, date = '2026-11-02', extra = {}) => ({ name, qty: 2.0, total_price: 3.18, purchase_date: date, ...extra });
const ok = items => ({ status: 'ok', message: '', updated_at: '2026-11-02T11:30:00+00:00', items });

const a = mapIngest(ok([line('KAROTTE BIO')]));
assert.equal(a.status, 'ok');
assert.equal(a.updatedAt, '2026-11-02T11:30:00+00:00');
assert.deepEqual(Object.keys(a.items[0]), ['id', 'name', 'date', 'qty', 'total']);
assert.deepEqual([a.items[0].name, a.items[0].date, a.items[0].qty, a.items[0].total], ['KAROTTE BIO', '2026-11-02', 2, 3.18]);
assert.match(a.items[0].id, /^\w{1,16}$/, 'the Worker accepts it back, and a view row can join ids with spaces');

const err = mapIngest({ status: 'error', message: 'login failed', updated_at: '2026-11-02T11:30:00+00:00', items: [] });
assert.deepEqual([err.status, err.message, err.items], ['error', 'login failed', []]);
assert.equal(mapIngest({ status: 'error' }).status, 'error', 'an error needs no items');

for (const bad of [null, 'x', 7, [], {}, { status: 'nope', items: [] }, { status: 'ok' }, { status: 'ok', items: 'x' }]) {
  assert.equal(mapIngest(bad), null, 'rejects ' + JSON.stringify(bad));
}

const big = mapIngest({ ...ok(Array.from({ length: 500 }, (_, i) => line('ITEM ' + i))), message: 'x'.repeat(500) });
assert.equal(big.items.length, 200, 'item cap');
assert.equal(big.message.length, 80, 'string cap');
assert.equal(mapIngest(ok([line('N'.repeat(500))])).items[0].name.length, 80);

// one purchase keeps its id across runs; repeats on one date stay apart
const twice = mapIngest(ok([line('HA-UNTERSCHENKEL'), line('HA-UNTERSCHENKEL'), line('HA-UNTERSCHENKEL', '2026-11-03')]));
assert.equal(new Set(twice.items.map(i => i.id)).size, 3);
assert.deepEqual(mapIngest(ok([line('HA-UNTERSCHENKEL'), line('HA-UNTERSCHENKEL'), line('HA-UNTERSCHENKEL', '2026-11-03')])).items, twice.items, 'stable');
assert.equal(mapIngest(ok([line('KAKI'), line('HA-UNTERSCHENKEL')])).items[1].id, twice.items[0].id, 'other lines do not move it');

// bad types: unusable lines go, usable ones get safe defaults. calc.js needs a name and an ISO date.
const odd = mapIngest({ status: 'ok', updated_at: 12, items: [
  null, 5, {}, { name: 7, purchase_date: '2026-11-02' }, { name: 'NO DATE' }, { name: 'NULL DATE', purchase_date: null },
  { name: 'GERMAN DATE', purchase_date: '02.11.2026' }, { name: 'KEPT', qty: 'x', total_price: '1,99', purchase_date: '2026-11-02' },
  { name: '__proto__', qty: -1, total_price: Infinity, purchase_date: '2026-11-02' }
] });
assert.deepEqual(odd.items.map(i => [i.name, i.qty, i.total]), [['KEPT', 1, null], ['__proto__', 1, null]]);
assert.deepEqual([odd.updatedAt, odd.message], [null, '']);

const [x, y] = applyUsed([{ id: 'a' }, { id: 'b' }], ['b', 'gone']);
assert.deepEqual([x.used, y.used], [false, true]);
console.log('rewe-map ok');
