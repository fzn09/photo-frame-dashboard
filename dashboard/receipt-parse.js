// OCR text of a paper receipt -> draft line items for the upload page's review table (no DOM, no network).
// Used by js/upload.js on the phone, checked by test/receipt-parse.test.mjs. The output is a draft: OCR
// misreads names, so the user corrects it before /api/receipt/commit stores anything.

const STORES = ['REWE', 'LIDL', 'ALDI', 'EDEKA', 'PENNY', 'NETTO', 'KAUFLAND', 'NORMA', 'DM', 'ROSSMANN', 'BIOCOMPANY', 'DENNS'];
// Lines that carry a price but are not groceries. Matched on the upper-cased line.
const SKIP = /SUMME|ZWISCHENSUMME|TOTAL|PFAND|LEERGUT|RABATT|COUPON|GUTSCHEIN|TRAGETASCHE|TASCHE|TUETE|TÜTE|EC-CASH|EC CASH|KARTE|BAR\b|GEGEBEN|RUECKGELD|RÜCKGELD|MWST|NETTO\s+\d|BRUTTO|STEUER|PAYBACK|BONUS|ZAHLUNG|BETRAG/;
const END = /^(SUMME|ZU ZAHLEN|TOTAL|GESAMT)\b/;
const PRICE = /(-?\d{1,4})\s?[.,]\s?(\d{2})(?:\s*[A-Z*]){0,3}\s*$/;        // "1,49 B", "1.49", "-0,30 A *"
const QTY = /^(\d{1,3})\s*(?:STK|ST)?\.?\s*[X×*]\s*(\d{1,4})[.,](\d{2})/;    // "2 Stk x 0,99"
const WEIGHT = /^(\d{1,3})[.,](\d{1,3})\s*KG\s*[X×*]/;                        // "0,512 kg x 2,99 EUR/kg"
const DATE = /\b(\d{2})[.\/](\d{2})[.\/](\d{2}|\d{4})\b/;

const cents = (a, b) => (a.startsWith('-') ? -1 : 1) * (Math.abs(Number(a)) + Number(b) / 100);
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
  const items = [];
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

    const p = PRICE.exec(up);
    if (!p || SKIP.test(up)) return;
    const price = cents(p[1], p[2]);
    const name = clean(raw.slice(0, p.index));
    if (price <= 0 || name.length < 2 || !/\p{L}{2}/u.test(name)) return;
    items.push({ name, qty: 1, total_price: Math.round(price * 100) / 100 });
  });
  return { store, purchase_date: date, items };
}
