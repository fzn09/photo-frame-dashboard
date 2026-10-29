// Pure helpers for the Kitchen and Fridge views (no DOM): pocket calculator, kitchen conversions,
// fridge expiry notes. Imported by js/views/kitchen.js + fridge.js, checked by test/calc.test.mjs.

// ---- calculator: immediate-execution state machine, like a pocket calculator (no eval)
export const CALC0 = { display: '0', acc: null, op: null, fresh: true };

// 0.1 + 0.2 -> "0.3"; ÷0 / overflow -> "Error"
export function fmt(x) { return isFinite(x) ? String(+x.toPrecision(12)) : 'Error'; }

function apply(a, op, b) {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  return a / b; // '/', b = 0 -> Infinity -> "Error"
}

// key: '0'-'9' '.' '+' '-' '*' '/' '=' '%' 'C' 'back'. Returns a new state.
export function press(s, key) {
  if (key === 'C' || (s.display === 'Error' && !/^[0-9.]$/.test(key))) return { ...CALC0 };
  if (s.display === 'Error') s = CALC0;
  if (/^[0-9]$/.test(key)) {
    if (s.fresh || s.display === '0') return { ...s, display: key, fresh: false };
    return s.display.replace(/[-.]/g, '').length >= 12 ? s : { ...s, display: s.display + key };
  }
  if (key === '.') {
    if (s.fresh) return { ...s, display: '0.', fresh: false };
    return s.display.indexOf('.') > -1 ? s : { ...s, display: s.display + '.' };
  }
  if (key === 'back') {
    if (s.fresh) return s;
    const d = s.display.slice(0, -1);
    return { ...s, display: d === '' || d === '-' ? '0' : d };
  }
  if (key === '%') { // 200 + 10% = 220; otherwise just /100
    const x = +s.display, pct = s.acc !== null && (s.op === '+' || s.op === '-') ? s.acc * x / 100 : x / 100;
    return { ...s, display: fmt(pct), fresh: false };
  }
  if (key === '=') {
    if (s.op === null || s.acc === null) return { ...s, fresh: true };
    return { display: fmt(apply(s.acc, s.op, +s.display)), acc: null, op: null, fresh: true };
  }
  // operator: chain the pending one first (5 + 3 × -> 8 ×); a second operator in a row just replaces it
  if (s.acc !== null && s.op !== null && !s.fresh) {
    const r = fmt(apply(s.acc, s.op, +s.display));
    return r === 'Error' ? { ...CALC0, display: r } : { display: r, acc: +r, op: key, fresh: true };
  }
  return { ...s, acc: +s.display, op: key, fresh: true };
}

// ---- kitchen conversions: [label, fn, from unit, to unit]. No g<->cups: that depends on the ingredient.
const r2 = x => Math.round(x * 100) / 100;
export const CONV = {
  'ml-cup':  ['ml → cup', x => x / 236.588, 'ml', 'cup'],
  'cup-ml':  ['cup → ml', x => x * 236.588, 'cup', 'ml'],
  'ml-tbsp': ['ml → tbsp', x => x / 14.787, 'ml', 'tbsp'],
  'tbsp-ml': ['tbsp → ml', x => x * 14.787, 'tbsp', 'ml'],
  'tsp-ml':  ['tsp → ml', x => x * 4.929, 'tsp', 'ml'],
  'g-oz':    ['g → oz', x => x / 28.3495, 'g', 'oz'],
  'oz-g':    ['oz → g', x => x * 28.3495, 'oz', 'g'],
  'c-f':     ['°C → °F', x => x * 9 / 5 + 32, '°C', '°F'],
  'f-c':     ['°F → °C', x => (x - 32) * 5 / 9, '°F', '°C'],
  'x0.5':    ['× ½', x => x / 2, '', ''],
  'x1.5':    ['× 1.5', x => x * 1.5, '', ''],
  'x2':      ['× 2', x => x * 2, '', '']
};
export function convert(id, x) { return r2(CONV[id][1](x)); }

// ---- fridge expiry, kept in the Bring! item note as "bis 3.11." (readable in the Bring! app)
const EXP = /\s*bis (\d{1,2})\.(\d{1,2})\.?/;

// Date (local midnight) or null. A day/month more than ~6 months back means next year (Dec -> Jan).
export function parseExpiry(note, today) {
  const m = EXP.exec(note || '');
  if (!m) return null;
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const d = new Date(t.getFullYear(), +m[2] - 1, +m[1]);
  if (d < t - 180 * 864e5) d.setFullYear(d.getFullYear() + 1);
  return d;
}
// Note with its expiry replaced (date = null removes it)
export function withExpiry(note, date) {
  const rest = (note || '').replace(EXP, '').trim();
  return date ? (rest ? rest + ' ' : '') + 'bis ' + date.getDate() + '.' + (date.getMonth() + 1) + '.' : rest;
}
// Whole days from today to the expiry (negative = past), or null
export function daysLeft(note, today) {
  const d = parseExpiry(note, today);
  if (!d) return null;
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 864e5);
}
