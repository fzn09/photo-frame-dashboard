// Run: node test/gate.test.mjs   (from dashboard/). Throws on the first failed assertion.
// The Worker's access gate: nothing (page, assets, /api) without the key cookie, and no data in errors.
import assert from 'node:assert/strict';
import worker from '../worker.js';

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

globalThis.fetch = () => Promise.reject(new Error('secret upstream detail'));
console.error = () => {}; // the Worker logs the real error; keep test output clean
const fail = await get('/api/weather', ok);
assert.equal(fail.status, 502, 'async upstream failure is caught');
assert.doesNotMatch(await fail.text(), /secret/, 'error detail stays out of the response');
console.log('gate ok');
