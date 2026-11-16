// OCR text of a paper receipt -> draft line items for the upload page's review table (no DOM, no network).
// Used by js/upload.js on the phone, checked by test/receipt-parse.test.mjs. The output is a draft: OCR
// misreads names, so the user corrects it before /api/receipt/commit stores anything.

const STORES = ['REWE', 'LIDL', 'ALDI', 'EDEKA', 'PENNY', 'NETTO', 'KAUFLAND', 'NORMA', 'DM', 'ROSSMANN', 'BIOCOMPANY', 'DENNS'];
// Lines that carry a price but are not groceries. Matched on the upper-cased line.
const SKIP = /SUMME|ZWISCHENSUMME|TOTAL|PFAND|LEERGUT|RABATT|COUPON|GUTSCHEIN|TRAGETASCHE|TASCHE|TUETE|TÜTE|EC-CASH|EC CASH|KARTE|BAR\b|GEGEBEN|RUECKGELD|RÜCKGELD|MWST|NETTO\s+\d|BRUTTO|STEUER|PAYBACK|BONUS|ZAHLUNG|BETRAG|TEL\b|TELEFON|UST|STEUERNR|KASSE|BON-NR|BELEG/;
const END = /^(SUMME|ZU ZAHLEN|TOTAL|GESAMT)\b/;
// Price at the line end: "1,49 B", "1.49", "-0,30 A *", "1,49 €", "1,49 EUR". OCR confusions O/o→0, l/I→1, S→5 are
// allowed in the digits (at least one real digit is required). "1 49" (comma lost) is a second, stricter pattern.
const PRICE = /(?:^|(?<=[\s:])|(?<=\p{L})(?=-?\d))(-?[\dOolIS]{1,4})\s?[.,]\s?([\dOolIS]{2})\s*(?:EUR|€)?(?:\s*[\p{L}*]){0,2}\s*$/u;
const PRICE_SPACE = /\s(\d{1,2})\s(\d{2})\s*(?:EUR|€)?(?:\s*[A-Z*]){0,2}\s*$/;
const PRICE_ONLY = /^-?[\dOolIS]{1,4}\s?[.,]\s?[\dOolIS]{2}\s*(?:EUR|€)?(?:\s*[A-Za-z*]){0,2}$/;
const QTY = /^(\d{1,3})\s*(?:STK|ST)?\.?\s*[X×*]\s*(\d{1,4})[.,](\d{2})/;    // "2 Stk x 0,99"
const WEIGHT = /^(\d{1,3})[.,](\d{1,3})\s*KG\s*[X×*]/;                        // "0,512 kg x 2,99 EUR/kg"
const DATE = /\b(\d{2})[.\/](\d{2})[.\/](\d{2}|\d{4})\b/;

const digits = t => t.replace(/[Oo]/g, '0').replace(/[lI]/g, '1').replace(/S/g, '5');
const cents = (a, b) => (a.startsWith('-') ? -1 : 1) * (Math.abs(Number(digits(a))) + Number(digits(b)) / 100);
const hasDigit = (a, b) => /\d/.test(a + b);
const clean = s => s.replace(/[^\p{L}\p{N}%.,&+\-/ ]/gu, ' ').replace(/\s+/g, ' ').trim();

// 'dd.mm.yy(yy)' -> 'yyyy-mm-dd', or '' when it is not a real date
function isoDate(d, m, y) {
  if (y.length === 2) y = '20' + y;
  const t = new Date(Date.UTC(+y, +m - 1, +d));
  return t.getUTCDate() === +d && t.getUTCMonth() === +m - 1 ? y + '-' + m + '-' + d : '';
}

// text -> {store, purchase_date, items: [{name, qty, total_price}]}. purchase_date is '' when none was found.
export function parseReceipt(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let store = '', date = '', ended = false;
  const items = [], names = [], prices = [];
  lines.forEach((raw, n) => {
    const up = raw.toUpperCase();
    if (!store && n < 8) store = STORES.find(s => new RegExp('\\b' + s + '\\b').test(up.replace(/\s+/g, ' '))) || '';
    if (!date) { const d = DATE.exec(raw); if (d) date = isoDate(d[1], d[2], d[3]); }
    if (ended) return;
    if (END.test(up)) { ended = true; return; }

    // quantity and weight lines belong to the item above them
    const last = items[items.length - 1];
    const q = QTY.exec(up);
    if (q) { if (last) last.qty = Number(q[1]) || 1; return; }
    if (WEIGHT.test(up)) return; // weight goods count as one; the price line already holds the total
    if (SKIP.test(up)) return;

    // kept for the split-column fallback below
    if (PRICE_ONLY.test(raw)) { const m = /(-?[\dOolIS]{1,4})\s?[.,]\s?([\dOolIS]{2})/.exec(raw); if (hasDigit(m[1], m[2])) prices.push(cents(m[1], m[2])); return; }

    let p = PRICE.exec(raw), price = 0, at = 0;
    if (p && hasDigit(p[1], p[2])) { price = cents(p[1], p[2]); at = p.index; }
    else if ((p = PRICE_SPACE.exec(up))) { price = Number(p[1]) + Number(p[2]) / 100; at = p.index; }
    const name = clean(raw.slice(0, p ? at : raw.length));
    if (!p) { if (/\p{L}{3}/u.test(name)) names.push(name); return; }
    if (price <= 0 || price > 500 || name.length < 2 || !/\p{L}{2}/u.test(name)) return;
    items.push({ name, qty: 1, total_price: Math.round(price * 100) / 100 });
  });

  // OCR sometimes reads the receipt as two blocks: all names, then all prices. Pair them in order,
  // using the names right before the prices. A draft only: the user checks every line.
  if (!items.length && prices.length && names.length) {
    const take = Math.min(names.length, prices.length);
    names.slice(-take).forEach((name, i) => {
      const price = prices[i];
      if (price > 0 && price <= 500) items.push({ name, qty: 1, total_price: Math.round(price * 100) / 100 });
    });
  }
  return { store, purchase_date: date, items };
}
