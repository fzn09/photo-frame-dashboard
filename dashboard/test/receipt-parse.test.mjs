// Run: node test/receipt-parse.test.mjs   (from dashboard/). Throws on the first failed assertion.
// OCR text -> draft items. Fixtures are typed-out receipts, never photos or real card data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseReceipt } from '../receipt-parse.js';

const fx = name => readFileSync(new URL('fixtures/' + name, import.meta.url), 'utf8');

const rewe = parseReceipt(fx('receipt-rewe.txt'));
assert.equal(rewe.store, 'REWE');
assert.equal(rewe.purchase_date, '2026-11-14');
assert.deepEqual(rewe.items, [
  { name: 'BIO BANANE', qty: 1, total_price: 1.49 },
  { name: 'MILCH 3,5% 1L', qty: 2, total_price: 2.38 },
  { name: 'TOMATEN RISPE', qty: 1, total_price: 1.53 },
  { name: 'GOUDA JUNG', qty: 1, total_price: 2.29 }
], 'quantity line joins the item above, Pfand, Rabatt, bag and everything after SUMME are skipped');

const lidl = parseReceipt(fx('receipt-lidl.txt'));
assert.equal(lidl.store, 'LIDL');
assert.equal(lidl.purchase_date, '2026-11-03', 'two-digit year');
assert.deepEqual(lidl.items.map(i => [i.name, i.total_price]), [
  ['Frische Vollmilch', 1.19], ['Bananen', 1.49], ['Butter', 1.99], ['Lauchzwiebeln', 0.79]
], 'dot or comma decimals, stops at "zu zahlen"');

// OCR noise
const noisy = parseReceipt('EDEKA\n|| KAESE ~ 3, 49 B\n12 34\n.. 0,99\nX 1,00\n31.02.2026');
assert.equal(noisy.store, 'EDEKA');
assert.deepEqual(noisy.items, [{ name: 'KAESE', qty: 1, total_price: 3.49 }], 'needs a name with letters; stray symbols are dropped');
assert.equal(noisy.purchase_date, '', 'an impossible date is not a date');

for (const bad of [undefined, null, '', 42]) {
  assert.deepEqual(parseReceipt(bad), { store: '', purchase_date: '', items: [] });
}

console.log('receipt-parse ok');
