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

// small-shop layout: name line(s) with an article code, then "1 st x 3,99   3,99 (A)" or a weight line
const asia = parseReceipt(fx('receipt-asia-clean.txt'));
assert.equal(asia.purchase_date, '2026-11-16');
assert.equal(asia.items.length, 15, 'every product, no Einweg deposit');
assert.equal(asia.items.reduce((s, i) => s + i.total_price, 0).toFixed(2), '56.26', 'receipt total 56,76 minus 2 x 0,25 Einweg');
assert.deepEqual(asia.items[1], { name: 'Erdnusspaste PCD 500g', qty: 1, total_price: 3.99 }, 'article code removed');
assert.deepEqual(asia.items[4], { name: 'Gelbe Kochbananen from Klumbien', qty: 1, total_price: 1 }, 'wrapped name, weight line, €/kg removed');
assert.deepEqual(asia.items[10], { name: 'Soto Ayam BAMBOE 40g', qty: 2, total_price: 2.5 });

// the same receipt as Tesseract read it from a phone photo (header redacted)
const asiaOcr = parseReceipt(fx('receipt-asia-ocr.txt'));
assert.deepEqual(asiaOcr.items.map(i => i.total_price), asia.items.map(i => i.total_price), 'same prices despite moved and garbled totals');
assert.equal(asiaOcr.items[6].name, 'La/Rote Süß Koffeln', 'a name fragment before its echoed price joins the item');
assert.equal(asiaOcr.items[11].name, 'Sushi Ebi SEACON 180g', 'a total that arrives lines later fills the open item');
assert.ok(!asiaOcr.items.some(i => /INWEG|52,41|EEE/i.test(i.name)), 'no deposit, no tax table');

// OCR noise
const noisy = parseReceipt('EDEKA\n|| KAESE ~ 3, 49 B\n12 34\n.. 0,99\nX 1,00\n31.02.2026');
assert.equal(noisy.store, 'EDEKA');
assert.deepEqual(noisy.items, [{ name: 'KAESE', qty: 1, total_price: 3.49 }], 'needs a name with letters; stray symbols are dropped');
assert.equal(noisy.purchase_date, '', 'an impossible date is not a date');

// formats Tesseract produces
const v = parseReceipt([
  'HAFERMILCH 1,49 €', 'KAFFEE 6,99 EUR', 'TOMATEN1,53B', 'BUTTER 1,9O A', 'GOUDA l,29 B', 'LAUCH 0 79 B',
  'Tel. 030 1234 56', 'Uhrzeit 18 02 11 Uhr', 'SOS'
].join('\n'));
assert.deepEqual(v.items.map(i => [i.name, i.total_price]), [
  ['HAFERMILCH', 1.49], ['KAFFEE', 6.99], ['TOMATEN', 1.53], ['BUTTER', 1.9], ['GOUDA', 1.29], ['LAUCH', 0.79]
], 'euro sign, no space, O and l for digits, lost comma; phone and time lines are not items');

// PSM auto split the receipt into a name block and a price block
const split = parseReceipt('REWE\nMusterstr. 1\nBIO BANANE\nMILCH 3,5%\nGOUDA JUNG\n1,49 B\n1,19 B\n2,29 B\nSUMME 4,97');
assert.deepEqual(split.items.map(i => [i.name, i.total_price]), [['BIO BANANE', 1.49], ['MILCH 3,5%', 1.19], ['GOUDA JUNG', 2.29]], 'pairs names and prices in order');

for (const bad of [undefined, null, '', 42]) {
  assert.deepEqual(parseReceipt(bad), { store: '', purchase_date: '', items: [] });
}

console.log('receipt-parse ok');
