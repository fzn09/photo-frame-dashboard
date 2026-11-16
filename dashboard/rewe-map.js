// REWE job payload -> what the Worker stores (no KV, no DOM). Used by worker.js, checked by test/rewe-map.test.mjs.

const MAX_ITEMS = 200, MAX_STR = 80;
const str = s => typeof s === 'string' ? s.trim().slice(0, MAX_STR) : '';

// FNV-1a, base 36. Only has to tell a few hundred purchases apart.
function hash(s) {
  let h = 0x811c9dc5;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return (h >>> 0).toString(36);
}

// {status, message, updated_at, items[]} -> {status, message, updatedAt, items}, or null if it isn't one.
// id = hash of date|name|n, n counting repeats in the payload: the same purchase keeps its id across runs,
// which the "used up" flag relies on. Lines without a name or an ISO date are dropped: the view needs both.
export function mapIngest(p) {
  if (!p || typeof p !== 'object' || (p.status !== 'ok' && p.status !== 'error')) return null;
  if (p.status === 'ok' && !Array.isArray(p.items)) return null;
  const repeats = new Map(), items = [];
  for (const i of (Array.isArray(p.items) ? p.items : []).slice(0, MAX_ITEMS)) {
    const name = str(i && i.name), date = i && typeof i.purchase_date === 'string' ? i.purchase_date : '';
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const key = date + '|' + name, n = repeats.get(key) || 0;
    repeats.set(key, n + 1);
    items.push({
      id: hash(key + '|' + n), name, date,
      qty: typeof i.qty === 'number' && i.qty > 0 && isFinite(i.qty) ? i.qty : 1,
      total: typeof i.total_price === 'number' && isFinite(i.total_price) ? i.total_price : null
    });
  }
  const at = str(p.updated_at);
  return { status: p.status, message: str(p.message), updatedAt: Date.parse(at) ? at : null, items };
}

export function applyUsed(items, usedIds) {
  const used = new Set(usedIds);
  return items.map(i => ({ ...i, used: used.has(i.id) }));
}

// ---- Phone receipt uploads (POST /api/receipt/commit, KV manual:items) ----------------------------------

const MAX_MANUAL = 300, KEEP_DAYS = 30;

// Reviewed upload {purchase_date, items:[{name, qty, total_price}]} -> stored items, or null if it isn't one.
// Same shape as mapIngest plus src. Names are upper-cased because calc.js matches foods on receipt-style
// names. The 'm' prefix keeps these ids apart from the job's, and a repeat of the same upload maps to the same
// ids, so a double tap on Confirm stores nothing new.
export function mapManual(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.items) || !p.items.length) return null;
  const date = typeof p.purchase_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.purchase_date) ? p.purchase_date : '';
  if (!date) return null;
  const repeats = new Map(), items = [];
  for (const i of p.items.slice(0, MAX_ITEMS)) {
    const name = str(i && i.name).toLocaleUpperCase('de-DE');
    if (!name) continue;
    const key = date + '|' + name, n = repeats.get(key) || 0;
    repeats.set(key, n + 1);
    items.push({
      id: 'm' + hash(key + '|' + n), name, date,
      qty: typeof i.qty === 'number' && i.qty > 0 && i.qty < 1000 && isFinite(i.qty) ? i.qty : 1,
      total: typeof i.total_price === 'number' && isFinite(i.total_price) && i.total_price >= 0 ? i.total_price : null,
      src: 'manual'
    });
  }
  return items.length ? items : null;
}

// Stored + new -> what to store: new ids replace old ones, purchases older than KEEP_DAYS drop out, newest first.
export function mergeManual(existing, incoming, today) {
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const cutoff = new Date(t - KEEP_DAYS * 864e5);
  const pad = x => String(x).padStart(2, '0');
  const min = cutoff.getFullYear() + '-' + pad(cutoff.getMonth() + 1) + '-' + pad(cutoff.getDate());
  const byId = new Map((Array.isArray(existing) ? existing : []).map(i => [i.id, i]));
  incoming.forEach(i => byId.set(i.id, i));
  return [...byId.values()].filter(i => i.date >= min).sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_MANUAL);
}
