// Run: node test/ingest.test.mjs   (from dashboard/). Throws on the first failed assertion.
// The REWE feed through the real Worker entry point, with a fake KV. No network.
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';

// Workers has this, Node doesn't (wrangler dev runs the real one, PLAN step 3.7)
crypto.subtle.timingSafeEqual = (a, b) => timingSafeEqual(new Uint8Array(a), new Uint8Array(b));

const kv = () => {
  const m = new Map();
  return { m, writes: [],
    async get(k, type) { const v = m.get(k) ?? null; return v && type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { this.writes.push(k); m.set(k, v); } };
};
const TOKEN = 'dash', KEY = 'ingest-key', COOKIE = 'hq=' + TOKEN;
const fresh = () => ({ DASH_TOKEN: TOKEN, INGEST_KEY: KEY, FRIDGE_KV: kv(), ASSETS: { fetch: () => new Response('page') } });
const call = (env, path, init = {}) => worker.fetch(new Request('https://hq.example' + path, init), env);
const ingest = (env, body, key = KEY) => call(env, '/api/ingest', {
  method: 'POST', headers: key ? { Authorization: 'Bearer ' + key } : {}, body: typeof body === 'string' ? body : JSON.stringify(body)
});
const fridge = async env => (await call(env, '/api/fridge', { headers: { Cookie: COOKIE } })).json();
const write = (env, body, token = TOKEN) => call(env, '/api/fridge', {
  method: 'POST', headers: { Cookie: COOKIE, 'X-Dash-Token': token }, body: typeof body === 'string' ? body : JSON.stringify(body)
});

const payload = JSON.parse(readFileSync(new URL('fixtures/ingest-ok.json', import.meta.url)));
const errorPayload = { status: 'error', message: 'login failed', updated_at: '2026-11-03T11:30:00+00:00', items: [] };

// auth and limits
let env = fresh();
assert.equal((await ingest({ ...env, INGEST_KEY: '' }, payload)).status, 503, 'no key configured');
assert.equal((await ingest({ ...env, FRIDGE_KV: undefined }, payload)).status, 503, 'no KV binding');
assert.equal((await ingest(env, payload, null)).status, 401, 'no bearer');
assert.equal((await ingest(env, payload, 'wrong')).status, 401, 'wrong bearer');
assert.equal((await ingest(env, 'x'.repeat(256 * 1024 + 1))).status, 413, 'too large');
assert.equal((await ingest(env, '{nope')).status, 400, 'bad JSON');
assert.equal((await ingest(env, { status: 'ok' })).status, 400, 'no items: must not wipe the fridge');
assert.equal(env.FRIDGE_KV.writes.length, 0, 'nothing stored by a rejected call');
const small = { ...fresh(), DASH_TOKEN: '' };
assert.equal((await ingest(small, payload)).status, 200, 'ingest has its own control, not the site gate');

// before the first ingest the page keeps its sample data
assert.equal((await call(env, '/api/fridge', { headers: { Cookie: COOKIE } })).status, 503, 'no entry yet');
assert.equal((await call({ ...env, FRIDGE_KV: undefined }, '/api/fridge', { headers: { Cookie: COOKIE } })).status, 503, 'no KV');

// ok replaces, used up survives a rerun, error keeps the items
assert.equal((await ingest(env, payload)).status, 200);
let got = await fridge(env);
assert.deepEqual(Object.keys(got).sort(), ['items', 'message', 'status', 'updatedAt']);
assert.equal(got.items.length, payload.items.length);
assert.equal(got.items[0].used, false);
const [a, b, c] = got.items.map(i => i.id);

assert.equal((await write(env, { op: 'use', ids: [a, b] })).status, 200);
assert.deepEqual(env.FRIDGE_KV.writes.filter(k => k === 'rewe:used').length, 1, 'a row of two is one KV write');
await ingest(env, payload);
got = await fridge(env);
assert.deepEqual(got.items.filter(i => i.used).map(i => i.id), [a, b], 'the same purchase stays used up across runs');
assert.equal((await write(env, { op: 'unuse', ids: [b] })).status, 200);
assert.deepEqual((await fridge(env)).items.filter(i => i.used).map(i => i.id), [a]);

await ingest(env, errorPayload);
got = await fridge(env);
assert.deepEqual([got.status, got.message, got.items.length, got.updatedAt], ['error', 'login failed', payload.items.length, payload.updated_at], 'error keeps items and their age');
assert.ok(got.failedAt, 'and records when');
assert.deepEqual(got.items.filter(i => i.used).map(i => i.id), [a], 'an error prunes nothing');

// a new receipt window prunes used ids that left it, and clears the error
await ingest(env, { ...payload, items: payload.items.filter(i => i.name !== payload.items[0].name) });
got = await fridge(env);
assert.equal(got.status, 'ok');
assert.equal(got.message, '');
assert.equal(got.items.some(i => i.id === a), false);
assert.deepEqual(JSON.parse(env.FRIDGE_KV.m.get('rewe:used')), [], 'pruned');
const before = env.FRIDGE_KV.writes.length;
await ingest(env, payload);
assert.equal(env.FRIDGE_KV.writes.length, before + 1, 'nothing to prune: no second write');

// first run ever fails: an empty fridge with the reason, not a crash
const first = fresh();
await ingest(first, errorPayload);
got = await fridge(first);
assert.deepEqual([got.items, got.updatedAt, got.status], [[], null, 'error']);

// writes
assert.equal((await write(env, { op: 'use', ids: [c] }, 'wrong')).status, 401, 'needs the token');
assert.equal((await call(env, '/api/fridge', { method: 'POST', body: '{}' })).status, 401, 'needs the cookie');
for (const bad of [{ op: 'eat', ids: [c] }, { op: 'use' }, { op: 'use', ids: [] }, { op: 'use', ids: [1] }, { op: 'use', ids: ['a b'] }, { op: 'use', ids: Array(201).fill('a') }, '{nope']) {
  assert.equal((await write(env, bad)).status, 400, 'rejects ' + JSON.stringify(bad));
}
assert.equal((await write({ ...env, FRIDGE_KV: undefined }, { op: 'use', ids: [c] })).status, 503, 'mock mode stays silent');

// KV down: a generic 502, no detail
console.error = () => {};
const down = { ...fresh(), FRIDGE_KV: { get() { throw new Error('secret kv detail'); } } };
const res = await ingest(down, errorPayload);
assert.equal(res.status, 502);
assert.doesNotMatch(await res.text(), /secret/);
console.log('ingest ok');
