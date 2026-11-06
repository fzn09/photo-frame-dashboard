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
