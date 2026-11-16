// OCR text of a paper receipt -> draft line items for the upload page's review table (no DOM, no network).
// Used by js/upload.js on the phone, checked by test/receipt-parse.test.mjs. The output is a draft: OCR
// misreads names, so the user corrects it before /api/receipt/commit stores anything.
//
// Two receipt layouts:
//   inline (REWE, Lidl):  "BUTTER 1,99 B", an optional "2 Stk x 0,99" line under it
//   above (many small shops): "OM 8216 - Soto Ayam BAMBOE 40g" on its own line (maybe wrapped), then
//                         "2 st x 1,25        2,50 (A)" or "0,315 kg x 3,19 €/kg   1,00 (A)"
// Tesseract often moves the right-hand price to a later line, so a quantity line without a total takes
// qty × unit price, or waits for the next price-only line.

const STORES = ['REWE', 'LIDL', 'ALDI', 'EDEKA', 'PENNY', 'NETTO', 'KAUFLAND', 'NORMA', 'DM', 'ROSSMANN', 'BIOCOMPANY', 'DENNS'];
// Not groceries. Matched on the upper-cased line, or on a composed item name.
const SKIP = /SUMME|ZWISCHENSUMME|TOTAL|PFAND|LEERGUT|INWEG|MEHRWEG|RABATT|COUPON|GUTSCHEIN|TRAGETASCHE|TASCHE|TUETE|TÜTE|EC-CASH|EC CASH|KARTE|BAR\b|GEGEBEN|RUECKGELD|RÜCKGELD|MWST|NETTO\s+\d|BRUTTO|STEUER|PAYBACK|BONUS|ZAHLUNG|BETRAG|TEL\b|TEL\.|TELEFON|UST|KASSE|BON-NR|BELEG|RECHNUNGS/;
// Column headers and notes: neither names nor prices
const IGNORE = /HANDEINGABE|GEWICHT|ARTIKELNAME|PREIS\s*\/|^ARTIKEL\s*$/;
// Everything after the total is payment and tax detail
const END = /^(SUMME|ZU ZAHLEN|TOTAL|GESAMT)\b|TAL\s*\/\s*[€E]|NETTO.*BRUTTO|BRUTTO|GESAMTMENGE|^TYP\b|^TYPE\b/;

const NUM = '[\\dOolIS]';                                  // OCR reads 0 as O/o, 1 as l/I, 5 as S
const TAIL = '(?:\\s*(?:\\(+[\\p{L}\\d]?\\)?|[\\p{L}*%)\\u201D\\u2019"\';:]))';  // "B", "(A)", "(8)", "A *"
// Price at the line end: "1,49 B", "1.49", "-0,30 A *", "1,49 €", "4,30 (A)"
const PRICE = new RegExp('(?:^|(?<=[\\s:])|(?<=\\p{L})(?=-?\\d))(-?' + NUM + '{1,4})\\s?[.,]\\s?(' + NUM + '{2})\\s*(?:EUR|€)?' + TAIL + '{0,3}\\s*$', 'u');
const PRICE_SPACE = /\s(\d{1,2})\s(\d{2})\s*(?:EUR|€)?(?:\s*[A-Z*]){0,2}\s*$/;   // "LAUCH 0 79 B": comma lost
const PRICE_ONLY = new RegExp('^[^\\p{L}\\d-]{0,3}-?' + NUM + '{1,4}\\s?[.,]\\s?' + NUM + '{2}\\s*(?:EUR|€)?' + TAIL + '{0,3}\\s*$', 'u');
// "2 Stk x 0,99", "1stx 3,99", "| '1 st x 1175", "Ä 1stx 14,50". Unit price optional.
const QTY = /^[^\p{L}\d]*(?:\p{L}{1,2}\s+)?([\dlI|]{1,3})\s*(?:stk|stck|st)\.?\s*[x×*]\s*[^\d\s]{0,2}\s*(?:(\d{1,3})\s?[.,]\s?(\d{2}))?/iu;
// "0,315 kg x 3,19 €/kg"
const WEIGHT = /(\d{1,3})[.,](\d{1,3})\s*kg\s*[x×*][^\d]{0,3}(?:(\d{1,3})[.,](\d{2}))?/iu;
const DATE = /\b(\d{2})[.\/](\d{2})[.\/](\d{2}|\d{4})\b/;
// An article code before the name: "TM 66460 AE 5151 - Erdnusspaste", "2233-2 - Gelbe Kochbananen"
const CODE = /^.{0,30}?\d.{0,20}?\s[-–]\s+/;

const digits = t => t.replace(/[Oo]/g, '0').replace(/[lI]/g, '1').replace(/S/g, '5');
const cents = (a, b) => (a.startsWith('-') ? -1 : 1) * (Math.abs(Number(digits(a))) + Number(digits(b)) / 100);
const round = x => Math.round(x * 100) / 100;
const clean = s => s.replace(/[^\p{L}\p{N}%.,&+\-/ ]/gu, ' ').replace(/\s+/g, ' ').trim();
const ok = p => p > 0 && p <= 500;

// 'dd.mm.yy(yy)' -> 'yyyy-mm-dd', or '' when it is not a real date
function isoDate(d, m, y) {
  if (y.length === 2) y = '20' + y;
  const t = new Date(Date.UTC(+y, +m - 1, +d));
  return t.getUTCDate() === +d && t.getUTCMonth() === +m - 1 ? y + '-' + m + '-' + d : '';
}

// Price at the end of s, or null
function endPrice(s) {
  const p = PRICE.exec(s);
  if (p && /\d/.test(p[1] + p[2])) return { value: cents(p[1], p[2]), at: p.index };
  const q = PRICE_SPACE.exec(s.toUpperCase());
  return q ? { value: Number(q[1]) + Number(q[2]) / 100, at: q.index } : null;
}

// Pending name lines -> product name: from the last line with an article code, code and "€/kg" removed
function nameOf(lines) {
  let from = 0;
  lines.forEach((l, i) => { if (CODE.test(l)) from = i; });
  let s = lines.slice(from).join(' ').replace(CODE, '').replace(/[€E]\s*\/\s*kg\b.*$/i, '');
  s = clean(s);
  // leading code tokens without " - " ("FE TM 66460 AE 51 Erdnusspaste"): drop them if one is a number
  const t = s.split(' ');
  let k = 0, num = false;
  while (k < t.length - 1 && /^(?:[A-ZÄÖÜ]{1,3}|[\d'’()\/.-]*\d[\d'’()\/.-]*[A-Z]{0,2})$/.test(t[k])) { if (/\d/.test(t[k])) num = true; k++; }
  return num && k ? t.slice(k).join(' ') : s;
}

// text -> {store, purchase_date, items: [{name, qty, total_price}]}. purchase_date is '' when none was found.
// total_price is null when a quantity line had no readable price; the user fills it in.
export function parseReceipt(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let store = '', date = '', ended = false, above = false;
  const items = [], pending = [], names = [], prices = [];

  const add = (name, qty, price) => {
    if (!name || name.length < 2 || !/\p{L}{2}/u.test(name) || SKIP.test(name.toUpperCase())) return;
    if (price !== null && !ok(price)) return;
    items.push({ name, qty, total_price: price === null ? null : round(price) });
  };
  const takeName = () => { const n = nameOf(pending); pending.length = 0; return n; };

  lines.forEach((raw, n) => {
    const up = raw.toUpperCase();
    if (!store && n < 8) store = STORES.find(s => new RegExp('\\b' + s + '\\b').test(up.replace(/\s+/g, ' '))) || '';
    if (!date) { const d = DATE.exec(raw); if (d) date = isoDate(d[1], d[2], d[3]); }
    if (ended) return;
    if (END.test(up)) { ended = true; return; }
    if (IGNORE.test(up)) return;

    // quantity or weight line
    const q = QTY.exec(raw), w = !q && WEIGHT.exec(raw);
    if (q || w) {
      const qty = q ? Number(q[1].replace(/[lI|]/g, '1')) || 1 : 1;
      const unit = q ? (q[2] ? Number(q[2]) + Number(q[3]) / 100 : null) : (w[3] ? Number(w[3]) + Number(w[4]) / 100 : null);
      const tail = endPrice(raw.slice((q || w).index + (q || w)[0].length));
      if (pending.length) {
        // above layout: the name lines before this line are the product
        above = true;
        const total = tail ? tail.value : unit === null ? null : q ? qty * unit : Number(w[1] + '.' + w[2]) * unit;
        add(takeName(), w ? 1 : qty, total);
      } else if (q && items.length) {
        items[items.length - 1].qty = qty; // inline layout: "2 Stk x 0,99" under the item
      }
      return;
    }
    if (SKIP.test(up)) { pending.length = 0; return; }

    // price-only line: a total Tesseract moved off its quantity line
    if (PRICE_ONLY.test(raw)) {
      const p = endPrice(raw);
      if (!p || !ok(p.value)) return;
      const open = items.find(i => i.total_price === null);
      const echo = items.slice(-3).find(i => i.total_price === round(p.value));
      if (open) { open.total_price = round(p.value); pending.length = 0; }
      else if (echo) { if (pending.length && !CODE.test(pending[0])) echo.name += ' ' + clean(pending.join(' ')); pending.length = 0; }
      else if (above && pending.length) add(takeName(), 1, p.value);
      else prices.push(p.value);
      return;
    }

    const p = endPrice(raw);
    if (p && above && pending.length) { add(takeName(), 1, p.value); return; } // garbled qty line with a price
    if (p) {
      const name = clean(raw.slice(0, p.at));
      if (/\p{L}{2}/u.test(name)) { add(name, 1, p.value); pending.length = 0; }
      return;
    }

    // name line
    if (CODE.test(raw)) pending.length = 0;
    pending.push(raw);
    if (pending.length > 3) pending.shift();
    const name = clean(raw);
    if (/\p{L}{3}/u.test(name)) names.push(name);
  });

  // OCR sometimes reads the receipt as two blocks: all names, then all prices. Pair them in order,
  // using the names right before the prices.
  if (!items.length && prices.length && names.length) {
    const take = Math.min(names.length, prices.length);
    names.slice(-take).forEach((name, i) => add(name, 1, prices[i]));
  }
  return { store, purchase_date: date, items };
}
