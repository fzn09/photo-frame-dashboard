// Run: node test/gate.test.mjs   (from dashboard/). Throws on the first failed assertion.
// The Worker's access gate: nothing (page, assets, /api) without the key cookie, and no data in errors.
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import worker from '../worker.js';

// Workers has this, Node doesn't
crypto.subtle.timingSafeEqual = (a, b) => timingSafeEqual(new Uint8Array(a), new Uint8Array(b));

const TOKEN = 'test-token';
const env = { DASH_TOKEN: TOKEN, WEATHER_LAT: '1', WEATHER_LON: '2', ASSETS: { fetch: () => new Response('page') } };
const get = (path, cookie, e = env) =>
  worker.fetch(new Request('https://hq.example' + path, { headers: cookie ? { Cookie: cookie } : {} }), e);

assert.equal((await get('/')).status, 401, 'page needs the cookie');
assert.equal((await get('/api/config')).status, 401, 'api needs the cookie');
assert.equal((await get('/', 'hq=wrong')).status, 401, 'wrong cookie');
assert.equal((await get('/?key=wrong')).status, 401, 'wrong key');
assert.equal(await (await get('/manifest.webmanifest')).text(), 'page', 'manifest is public: fetched without cookies');
assert.equal((await get('/icon-192.png')).status, 200, 'manifest icons are public');
assert.equal((await get('/index.html')).status, 401, 'other assets stay gated');
assert.equal((await get('/api/fridge')).status, 401, 'the fridge feed stays gated');
assert.equal((await get('/api/ingest')).status, 401, 'only POST skips the gate');
const post = path => worker.fetch(new Request('https://hq.example' + path, { method: 'POST' }), env);
assert.equal((await post('/api/ingest')).status, 503, 'ingest answers itself, without a cookie');
assert.equal((await post('/api/fridge')).status, 401, 'other POSTs stay gated');
assert.equal((await post('/api/ingest/x')).status, 401, 'exact path only');

const set = await get('/?key=' + TOKEN);
assert.equal(set.status, 302);
assert.equal(set.headers.get('Location'), '/');
assert.match(set.headers.get('Set-Cookie'), /^hq=test-token; .*HttpOnly/);

const ok = 'theme=dark; hq=' + TOKEN;
assert.equal(await (await get('/', ok)).text(), 'page', 'assets served with the cookie');
const cfg = await get('/api/config', ok);
assert.equal(cfg.status, 200);
assert.equal(cfg.headers.get('Access-Control-Allow-Origin'), null, 'no CORS *');
assert.equal((await get('/api/nope', ok)).status, 404);
assert.equal((await get('/', ok, { ...env, DASH_TOKEN: '' })).status, 503, 'fails closed without DASH_TOKEN');

// webOS TV route: X-TV-Token, GET only, CORS only for TV_ORIGINS ("null" = file://)
const tvEnv = { ...env, TV_TOKEN: 'tv-secret' };
const tv = (path, headers, method = 'GET', e = tvEnv) => worker.fetch(new Request('https://hq.example' + path, { method, headers }), e);
const tvOk = await tv('/api/config', { 'X-TV-Token': 'tv-secret', Origin: 'null' });
assert.equal(tvOk.status, 200, 'TV token reads the API without a cookie');
assert.equal(tvOk.headers.get('Access-Control-Allow-Origin'), 'null', 'CORS for file://');
assert.equal((await tv('/api/config', { 'X-TV-Token': 'tv-secret', Origin: 'https://evil.example' })).headers.get('Access-Control-Allow-Origin'), null, 'no CORS for other origins');
assert.equal((await tv('/api/config', { 'X-TV-Token': 'wrong', Origin: 'null' })).status, 401, 'wrong TV token');
assert.equal((await tv('/api/config', { 'X-TV-Token': TOKEN, Origin: 'null' })).status, 401, 'DASH_TOKEN is not a TV token');
assert.equal((await tv('/api/fridge', { 'X-TV-Token': 'tv-secret', Origin: 'null' }, 'POST')).status, 401, 'TV token is read-only');
assert.equal((await tv('/', { 'X-TV-Token': 'tv-secret' })).status, 401, 'TV token opens no page or assets');
assert.equal((await tv('/api/config', { 'X-TV-Token': 'tv-secret', Origin: 'null' }, 'GET', env)).status, 401, 'route off without TV_TOKEN');
const pre = await tv('/api/fridge', { Origin: 'null', 'Access-Control-Request-Headers': 'x-tv-token' }, 'OPTIONS');
assert.equal(pre.status, 204, 'preflight');
assert.equal(pre.headers.get('Access-Control-Allow-Methods'), 'GET');
assert.equal((await tv('/api/fridge', { Origin: 'https://evil.example' }, 'OPTIONS')).status, 403, 'no preflight for other origins');
assert.equal((await tv('/api/config', { 'X-TV-Token': 'tv-secret', Origin: 'http://localhost:8080' }, 'GET', { ...tvEnv, TV_ORIGINS: 'null http://localhost:8080' })).headers.get('Access-Control-Allow-Origin'), 'http://localhost:8080', 'TV_ORIGINS list');

globalThis.fetch = () => Promise.reject(new Error('secret upstream detail'));
console.error = () => {}; // the Worker logs the real error; keep test output clean
const fail = await get('/api/weather', ok);
assert.equal(fail.status, 502, 'async upstream failure is caught');
assert.doesNotMatch(await fail.text(), /secret/, 'error detail stays out of the response');
console.log('gate ok');
