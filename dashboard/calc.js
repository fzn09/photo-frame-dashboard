// Pure helpers for the Kitchen and Fridge views (no DOM): pocket calculator, kitchen conversions,
// fridge shelf-life estimates. Imported by js/views/kitchen.js, fridge.js + home.js, checked by test/calc.test.mjs.

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

// ---- fridge sections + estimated shelf life. Receipts carry no expiry date, so `days` is a guess from the
// item type, counted from the purchase date: the view labels it as an estimate. null = keeps, no tag.
// First match wins. [receipt pattern, section, days, readable name (default: title-cased receipt name)]
export const SECTIONS = ['Fruit & veg', 'Meat & fish', 'Dairy & eggs', 'Bread', 'Frozen', 'Pantry', 'Snacks', 'Drinks', 'Household', 'Other'];
const VEG = 'Fruit & veg', MEAT = 'Meat & fish', DAIRY = 'Dairy & eggs', PANTRY = 'Pantry', SNACK = 'Snacks';
const FOODS = [
  [/^MANGO/, VEG, 6, 'Mango'], [/^KAKI/, VEG, 7, 'Kaki'], [/^BANANE/, VEG, 5, 'Bananen'],
  [/^BROCCOLI/, VEG, 5, 'Broccoli'], [/^KAROTTE/, VEG, 14, 'Karotten'], [/^CHAMP/, VEG, 5, 'Champignons'],
  [/^BABY SPINAT/, VEG, 3, 'Babyspinat'], [/^KARTOFFELN/, VEG, 30, 'Kartoffeln'], [/^LAUCHZWIEBELN/, VEG, 7, 'Lauchzwiebeln'],
  [/^GURKE/, VEG, 7, 'Gurke'], [/^BUSCHBOHNE/, VEG, 5, 'Buschbohnen'], [/^PRINZESSBOHNEN/, VEG, 5, 'Prinzessbohnen'],
  [/^KUERBIS/, VEG, 30, 'Hokkaido-Kürbis'], [/^BASILIKUM/, VEG, 5, 'Basilikum'], [/^ZWIEB\.GEMUESE/, VEG, 14, 'Zwiebelgemüse'],
  [/^GEFL\.WUERSTCHEN/, MEAT, 14, 'Geflügelwürstchen'], [/^SCHINKEN NUGGETZ/, MEAT, 14, 'Schinken Nuggetz'],
  [/^JB-GULASCH/, MEAT, 2, 'Gulasch'], [/^HA-UNTERSCHENKEL/, MEAT, 2, 'Hähnchenschenkel'], [/^LACHSFORELLEN/, MEAT, 2, 'Lachsforellenfilet'],
  [/^EIER\b/, DAIRY, 28, 'Eier'], [/BUTTER$/, DAIRY, 60, 'Butter'], [/^EMMENTALER/, DAIRY, 30, 'Emmentaler gerieben'],
  [/^GOUDA GERIEBEN/, DAIRY, 30, 'Gouda gerieben'], [/^PARMIGIANO/, DAIRY, 60, 'Parmigiano Reggiano'], [/^RICOTTA/, DAIRY, 7, 'Ricotta'],
  [/SCHLAGSAHNE/, DAIRY, 7, 'Schlagsahne'],
  [/^KOERNER BALANCE/, 'Bread', 5, 'Körner Balance'],
  [/^CURLY POMMES/, 'Frozen', null, 'Curly Pommes'],
  [/^EIERSPAETZLE/, PANTRY, null, 'Eierspätzle'], [/^GOLDMAIS/, PANTRY, null, 'Goldmais'], [/^ERBSEN MOEHRCHEN/, PANTRY, null, 'Erbsen & Möhrchen'],
  [/^BEANZ/, PANTRY, null, 'Beanz Classic'], [/^ORZO/, PANTRY, null, 'Orzo'], [/^WEIZEN TYPE/, PANTRY, null, 'Weizenmehl Type 55'],
  [/^INSTANTMEHL/, PANTRY, null, 'Instantmehl'], [/MAYONNAISE/, PANTRY, null, 'Mayonnaise'], [/^MIRACEL WHIP/, PANTRY, null, 'Miracel Whip'],
  [/^KONDENSMILCH/, PANTRY, null, 'Kondensmilch'], [/^GEMUESE FOND/, PANTRY, null, 'Gemüsefond'], [/^GEFLUEGEL FOND/, PANTRY, null, 'Geflügelfond'], [/^FRITTIEROEL/, PANTRY, null, 'Frittieröl'],
  [/^NUTELLA/, PANTRY, null, 'Nutella'], [/BROTAUFSTRICH/, PANTRY, null, 'Brotaufstrich'],
  [/BUENO|JELLY|MALTESERS|MELODY POP|PRETZEL|SNACK/, SNACK, null],
  // Keyword rows for products not listed above. Order matters: GARNELEN CHIPS before GARNELEN, ROESTZWIEBELN before ZWIEBEL.
  [/MINERALWASSER|HAFERDRINK/, 'Drinks', null],
  [/ZEWA|TOILETTENPAPIER|K(UE|Ü)CHENT(UE|Ü)CHER/, 'Household', null],
  [/GARNELEN CHIPS|CRUNCHIPS|GEBAECKSTANGEN|KEKSE|SPEKULATIUS|MADS FRUITS/, SNACK, null],
  [/AUBERGINE|ZUCCHINI|RISPENTOMATE|STAUDENSEL|GRUENE BOHNEN|KOCHBANANEN/, VEG, 7],
  [/SALAT/, VEG, 3], [/APFEL|KNOBLAUCH|SKARTOFFELN|^ZWIEBEL/, VEG, 30], [/INGWER/, VEG, 14],
  [/LACHSFILET|GESCHNETZELTE|HAEHNCHENFLUEGEL/, MEAT, 2], [/HACKFLEISCH|SUSHI/, MEAT, 1],
  [/CHICKEN NUGGETS|CRISPY CHICK|GARNELEN|SCHLEFI/, 'Frozen', null],
  [/PHILADELPHIA|SPRUEHSAHNE/, DAIRY, 14], [/JOGH/, DAIRY, 10],
  [/SANDWICH/, 'Bread', 3], [/KLOSSTEIG/, 'Bread', 5],
  [/MAFALDINE|SPAGHETTINI|PASTA|SARDINE|ERDNUSS|BACKKAKAO|MANDELN|PFEFFER|VANILLE|ROESTZWIEBELN|SOTO AYAM|PANDAN|TRIX|OSTMANN|GARTEN ERBSEN|MOEHRCH/, PANTRY, null]
];
const title = s => s.toLowerCase().replace(/(^|[\s.-])(\S)/g, (m, a, b) => a + b.toUpperCase());

// Receipt name -> { label, section, days (estimated shelf life from the purchase date, null = keeps) }.
// The Worker adds these fields to /api/fridge items, so the webOS TV app needs no copy of FOODS.
export function shelf(name) {
  // Phone-upload OCR lines carry the pack size and price: "DE CECCO MAFALDINE 500G 1 B 2,69". Drop that tail.
  name = name.replace(/\s+(\d+[.,]?\d*\s?(G|KG|ML|L)|\d+X\d)\b.*$/i, '').trim();
  const f = FOODS.find(x => x[0].test(name));
  return { label: f && f[3] || title(name), section: f ? f[1] : 'Other', days: f ? f[2] : null };
}

// Receipt line + today -> { label, section, age (days since bought), left (estimated days to use, null = keeps) }
export function fridgeItem(item, today) {
  const { label, section, days } = shelf(item.name);
  const [y, m, d] = item.date.split('-').map(Number);
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const age = Math.round((t - new Date(y, m - 1, d)) / 864e5);
  return { label, section, age, left: days !== null ? days - age : null };
}

// Receipt lines -> one row per food and freshness, so a fresh pack never inherits an old pack's tag.
// state: 'soon' (use within SOON days), 'past' (past the estimate), '' (fine). Sorted soon, past, rest.
// Holds what's still in the fridge; used = true gives the used-up lines instead.
const SOON = 3;
export function fridgeRows(items, today, used = false) {
  const rows = {};
  for (const item of items) {
    if (!!item.used !== used) continue;
    const f = fridgeItem(item, today);
    const state = f.left === null ? '' : f.left < 0 ? 'past' : f.left <= SOON ? 'soon' : '';
    const r = rows[f.label + state] ||= { ...f, state, qty: 0, total: 0, ids: [], newest: f.age };
    r.qty += item.qty; r.total += item.total || 0; r.ids.push(item.id);
    r.newest = Math.min(r.newest, f.age); r.age = Math.max(r.age, f.age);
    if (f.left !== null) r.left = Math.min(r.left, f.left);
  }
  const rank = r => r.state === 'soon' ? r.left : r.state === 'past' ? 100 - r.left : r.left === null ? 9999 : 1000 + r.left;
  return Object.values(rows).sort((a, b) => rank(a) - rank(b));
}
