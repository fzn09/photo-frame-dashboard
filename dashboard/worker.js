// Cloudflare Worker — API proxy for home dashboard
// Routes: /api/weather, /api/calendar, /api/shopping (Bring!: GET list, POST write), /api/fridge (REWE receipts in KV: GET list, POST used up), /api/ingest (the REWE job pushes here: bearer key, no cookie), /api/chores (TickTick), /api/config (visible views), /api/transit, /api/photos (Unsplash stock stream), /api/meals + /api/meals/recipe + /api/meals/img (Cookidoo week plan, cookidoo.js)
// All other paths go to Cloudflare Assets (run_worker_first in wrangler.jsonc, so the gate below covers them).
//
// Access gate: the whole site (page, assets and /api/*) needs the `hq` cookie, which holds DASH_TOKEN.
// Open https://<worker>/?key=<DASH_TOKEN> once on the frame to set it (one year). The page JS carries the
// token too, so gating only /api would protect nothing: anyone with the URL would get the token.

import { parseViews } from './views.js';
import { handleMeals, handleMealRecipe, handleMealImage } from './cookidoo.js';
import { mapIngest, applyUsed } from './rewe-map.js';

// Same-origin only: no Access-Control-Allow-Origin, so other sites can't read the family's data.
const JSON_CORS = { 'Content-Type': 'application/json' };
const COOKIE_AGE = 365 * 24 * 3600;
// Browsers fetch the web-app manifest without cookies, so these must pass the gate or Firefox can't
// install the dashboard as a full-screen app. They hold only the app name and icons, no family data.
const PUBLIC = new Set(['/manifest.webmanifest', '/icon-192.png', '/icon-512.png']);

function gate(request, env, url) {
  if (!env.DASH_TOKEN) return new Response('DASH_TOKEN is not set', { status: 503 });
  if (PUBLIC.has(url.pathname)) return null;
  const key = url.searchParams.get('key');
  if (key !== null) {
    if (key !== env.DASH_TOKEN) return new Response('Wrong key', { status: 401 });
    return new Response(null, { status: 302, headers: {
      Location: '/',
      'Set-Cookie': 'hq=' + encodeURIComponent(env.DASH_TOKEN) + '; Max-Age=' + COOKIE_AGE + '; Path=/; Secure; HttpOnly; SameSite=Lax'
    } });
  }
  const cookie = (request.headers.get('Cookie') || '').split(/;\s*/).find(c => c.startsWith('hq='));
  if (cookie && decodeURIComponent(cookie.slice(3)) === env.DASH_TOKEN) return null;
  return new Response('Open this dashboard with its key link.', { status: 401 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    try {
      // Before the gate: the REWE job has no cookie. Its bearer check is the only control on this route.
      if (pathname === '/api/ingest' && request.method === 'POST') return await handleIngest(request, env);
      const denied = gate(request, env, url);
      if (denied) return denied;
      // await: the handlers are async, and only an awaited rejection reaches the catch below
      if (pathname === '/api/weather')  return await handleWeather(env);
      if (pathname === '/api/calendar') return await handleCalendar(env);
      if (pathname === '/api/shopping') return await (request.method === 'POST' ? bringWrite(request, env) : bringRead(env));
      if (pathname === '/api/fridge')   return await (request.method === 'POST' ? fridgeWrite(request, env) : fridgeRead(env));
      if (pathname === '/api/chores')   return await (request.method === 'POST' ? choresWrite(request, env) : choresRead(env));
      if (pathname === '/api/config')   return handleConfig(env);
      if (pathname === '/api/transit')  return await handleTransit(env);
      if (pathname === '/api/photos')   return await handlePhotos(env);
      if (pathname === '/api/meals')    return await handleMeals(env);
      if (pathname === '/api/meals/recipe') return await handleMealRecipe(env, url);
      if (pathname === '/api/meals/img') return await handleMealImage(url);
    } catch (err) {
      console.error(pathname, err); // details stay in the Worker logs (wrangler tail), not in the response
      return new Response('{"error":"upstream failed"}', { status: 502, headers: JSON_CORS });
    }
    if (pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  }
};

// ---- Which views the frame shows (VIEWS var in wrangler.jsonc; no secrets in this response) ---------

function handleConfig(env) {
  return new Response(JSON.stringify({ views: parseViews(env.VIEWS) }), {
    headers: { ...JSON_CORS, 'Cache-Control': 'max-age=60' }
  });
}

// ---- Open-Meteo (free, no API key) ----------------------------------------
// https://open-meteo.com — WMO weather interpretation codes → app condition strings

function mapWMO(code, hour) {
  const isDay = hour >= 6 && hour < 21;
  if (code === 0) return isDay ? 'sun' : 'moon';
  if (code <= 2)  return 'partly';
  if (code <= 48) return 'cloud';  // 3=overcast, 45/48=fog
  return 'rain';                   // 51–99: drizzle, rain, snow, thunderstorm
}

async function handleWeather(env) {
  const lat = env.WEATHER_LAT;
  const lon = env.WEATHER_LON;
  const tz  = env.WEATHER_TZ || 'auto';
  if (!lat || !lon) return new Response('{}', { status: 503, headers: JSON_CORS });

  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,precipitation_probability,weathercode` +
    `&daily=temperature_2m_max,temperature_2m_min,sunset` +
    `&timezone=${encodeURIComponent(tz)}` +
    `&forecast_days=2`;
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${lat}&longitude=${lon}&current=european_aqi&timezone=${encodeURIComponent(tz)}`;

  // air quality is a nice-to-have: never let it fail the weather response
  const [res, aq] = await Promise.all([fetch(url), fetch(aqUrl).then(r => r.json()).catch(() => ({}))]);
  const data = await res.json();

  // Open-Meteo returns 48 hourly entries (2 days); keep both. Index 0 = midnight today local time, 24 = midnight
  // tomorrow. The page reads 0-23 as "today" and uses 24+ only so the evening hour strip doesn't wrap to this morning.
  const t = data.hourly.temperature_2m.slice(0, 48).map(Math.round);
  const p = (data.hourly.precipitation_probability || new Array(48).fill(0)).slice(0, 48);
  const c = data.hourly.weathercode.slice(0, 48).map((code, h) => mapWMO(code, h % 24));

  const hi = Math.round(data.daily.temperature_2m_max[0]);
  const lo = Math.round(data.daily.temperature_2m_min[0]);

  const sun = (data.daily.sunset?.[0] || '').slice(11, 16); // "HH:MM" local, tz was requested above
  const aqi = aq.current?.european_aqi ?? null;

  return new Response(JSON.stringify({ hi, lo, t, c, p, sun, aqi }), {
    headers: { ...JSON_CORS, 'Cache-Control': 'max-age=1800, s-maxage=1800' }
  });
}

// ---- Google Calendar (service account) ------------------------------------

async function getGoogleToken(env) {
  const now = Math.floor(Date.now() / 1000);
  function b64url(str) {
    return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
  const hdr = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const pay = b64url(JSON.stringify({
    iss:   env.GOOGLE_SERVICE_EMAIL,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now
  }));
  const toSign = `${hdr}.${pay}`;

  // also strip literal "\n" — the JSON key pasted into .dev.vars / wrangler secret keeps them escaped
  const pem = env.GOOGLE_SERVICE_KEY.replace(/-----[A-Z ]+-----/g, '').replace(/\\n|\s/g, '');
  const der = Uint8Array.from(atob(pem), ch => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(toSign));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${toSign}.${sigB64}`
  });
  const { access_token } = await res.json();
  return access_token;
}

async function fetchCalEvents(calId, personId, token, timeMin, timeMax) {
  const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${q}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || []).map(ev => {
    const allDay = !!ev.start.date;
    return {
      iCalUID: ev.iCalUID,
      id:      ev.id,
      title:   ev.summary || '(No title)',
      start:   allDay ? ev.start.date + 'T00:00:00Z' : ev.start.dateTime,
      end:     allDay ? ev.end.date   + 'T00:00:00Z' : ev.end.dateTime,
      allDay,
      people:  [personId],
      loc:     ev.location  || null,
      notes:   ev.description || null
    };
  });
}

async function handleCalendar(env) {
  if (!env.GOOGLE_SERVICE_EMAIL || !env.GOOGLE_SERVICE_KEY) {
    return new Response('[]', { status: 503, headers: JSON_CORS });
  }
  const token   = await getGoogleToken(env);
  const timeMin = new Date(Date.now() - 86400000).toISOString(); // yesterday → catches today regardless of TZ
  const timeMax = new Date(Date.now() + 14 * 86400000).toISOString();

  const calMap = { alex: env.CAL_ALEX, jordan: env.CAL_JORDAN }; // Fauzan, Amanda
  const fetches = Object.entries(calMap)
    .filter(([, id]) => id)
    .map(([person, id]) => fetchCalEvents(id, person, token, timeMin, timeMax));
  const all = (await Promise.all(fetches)).flat();

  // Merge events that appear in multiple calendars (shared invites) by iCalUID
  const seen = {};
  all.forEach(ev => {
    if (!seen[ev.iCalUID]) {
      seen[ev.iCalUID] = ev;
    } else {
      seen[ev.iCalUID].people = [...new Set(seen[ev.iCalUID].people.concat(ev.people))];
    }
  });

  return new Response(JSON.stringify(Object.values(seen)), {
    headers: { ...JSON_CORS, 'Cache-Control': 'max-age=300, s-maxage=300' }
  });
}

// ---- Bring! shopping list --------------------------------------------------

// Flow mirrors the python bring_api package used by D:\Projects\shoplister
const BRING = 'https://api.getbring.com/rest/';

// Login + headers + target list. Throws on auth failure; list is null if the account has none.
async function bringSession(env) {
  const authRes = await fetch(BRING + 'v2/bringauth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: env.BRING_EMAIL, password: env.BRING_PASSWORD })
  });
  if (!authRes.ok) throw new Error('Bring! login failed: ' + authRes.status);
  const auth = await authRes.json();
  const H = {
    'Authorization': `${auth.token_type} ${auth.access_token}`,
    'X-BRING-API-KEY': 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp', // public key shipped in bring_api
    'X-BRING-CLIENT': 'android',
    'X-BRING-APPLICATION': 'bring',
    'X-BRING-COUNTRY': 'DE',
    'X-BRING-USER-UUID': auth.uuid,
    'X-BRING-PUBLIC-USER-UUID': auth.publicUuid
  };
  // List named BRING_LIST (default "home", like shoplister), else the first list.
  const { lists } = await (await fetch(`${BRING}bringusers/${auth.uuid}/lists`, { headers: H })).json();
  const want = (env.BRING_LIST || 'home').toLowerCase();
  const list = (lists || []).find(l => (l.name || '').trim().toLowerCase() === want) || (lists || [])[0] || null;
  return { H, list };
  // ponytail: re-authenticates on every request; use Workers KV to cache the token if Bring! rate-limits
}

async function bringRead(env) {
  if (!env.BRING_EMAIL || !env.BRING_PASSWORD) {
    return new Response('[]', { status: 503, headers: JSON_CORS });
  }
  const { H, list } = await bringSession(env);
  if (!list) return new Response('{"error":"no Bring! list"}', { status: 404, headers: JSON_CORS });

  const data = await (await fetch(`${BRING}v2/bringlists/${list.listUuid}`, { headers: H })).json();
  // itemId is Bring!'s (German) catalog key or the free-text name typed. Quantity lives in the
  // specification as a leading "2× " (written by bringWrite) because Bring! has no quantity field.
  const items = (data.items?.purchase || []).map(item => {
    const m = /^(\d+)×\s*/.exec(item.specification || '');
    return { name: item.itemId, note: (item.specification || '').replace(/^\d+×\s*/, ''), qty: m ? +m[1] : 1 };
  });
  return new Response(JSON.stringify(items), { headers: { ...JSON_CORS, 'Cache-Control': 'no-store' } });
}

// Write calls need the X-Dash-Token header to match the DASH_TOKEN secret, on top of the site gate.
function guard(request, env) {
  if (!env.DASH_TOKEN) return new Response('{"error":"writes disabled: DASH_TOKEN not set"}', { status: 503, headers: JSON_CORS });
  if (request.headers.get('X-Dash-Token') !== env.DASH_TOKEN) return new Response('{"error":"bad token"}', { status: 401, headers: JSON_CORS });
  return null;
}

const BRING_OPS = { add: 'TO_PURCHASE', done: 'TO_RECENTLY', remove: 'REMOVE' };

// POST {op:'add'|'done'|'remove', name, qty?, note?}. 'add' also covers qty/note change and "add back".
async function bringWrite(request, env) {
  const denied = guard(request, env);
  if (denied) return denied;
  const { op, name, qty = 1, note = '' } = await request.json();
  if (!BRING_OPS[op] || !name) return new Response('{"error":"bad request"}', { status: 400, headers: JSON_CORS });
  const { H, list } = await bringSession(env);
  if (!list) return new Response('{"error":"no Bring! list"}', { status: 404, headers: JSON_CORS });
  const res = await fetch(`${BRING}v2/bringlists/${list.listUuid}/items`, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      changes: [{
        accuracy: '0.0', altitude: '0.0', latitude: '0.0', longitude: '0.0',
        itemId: name,
        spec: op === 'remove' ? '' : (qty > 1 ? qty + '× ' : '') + note,
        operation: BRING_OPS[op]
      }],
      sender: ''
    })
  });
  if (!res.ok) throw new Error('Bring! write failed: ' + res.status);
  return new Response('{"ok":true}', { headers: JSON_CORS });
}

// ---- REWE fridge feed: the job pushes receipts here, the page reads them (KV: rewe:latest, rewe:used) -----

const MAX_INGEST = 256 * 1024;
const jsonError = (msg, status) => new Response(JSON.stringify({ error: msg }), { status, headers: JSON_CORS });

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}

// status "ok" replaces the items. "error" keeps the last good items and records what went wrong.
async function handleIngest(request, env) {
  if (!env.INGEST_KEY || !env.FRIDGE_KV) return jsonError('ingest not configured', 503);
  if (!await sameSecret(request.headers.get('Authorization') || '', 'Bearer ' + env.INGEST_KEY)) return jsonError('bad key', 401);
  const raw = await request.arrayBuffer();
  if (raw.byteLength > MAX_INGEST) return jsonError('too large', 413);
  let feed;
  try { feed = mapIngest(JSON.parse(new TextDecoder().decode(raw))); } catch { feed = null; }
  if (!feed) return jsonError('bad payload', 400);

  const kv = env.FRIDGE_KV;
  if (feed.status === 'error') {
    const last = await kv.get('rewe:latest', 'json');
    await kv.put('rewe:latest', JSON.stringify({ items: [], updatedAt: null, ...last, status: 'error', message: feed.message, failedAt: new Date().toISOString() }));
    return new Response('{"ok":true}', { headers: JSON_CORS });
  }
  await kv.put('rewe:latest', JSON.stringify(feed));
  const ids = new Set(feed.items.map(i => i.id));
  const used = (await kv.get('rewe:used', 'json')) || [];
  const kept = used.filter(id => ids.has(id));
  if (kept.length !== used.length) await kv.put('rewe:used', JSON.stringify(kept));
  return new Response('{"ok":true}', { headers: JSON_CORS });
}

// 503 until the first ingest, so the page keeps its sample data.
async function fridgeRead(env) {
  const latest = env.FRIDGE_KV && await env.FRIDGE_KV.get('rewe:latest', 'json');
  if (!latest) return new Response('', { status: 503 });
  const used = (await env.FRIDGE_KV.get('rewe:used', 'json')) || [];
  return new Response(JSON.stringify({ ...latest, items: applyUsed(latest.items, used) }), {
    headers: { ...JSON_CORS, 'Cache-Control': 'no-store' }
  });
}

// POST {op:'use'|'unuse', ids:[...]}. Several ids in one write: a view row can hold several purchases, and KV
// takes one write per second per key. Read-modify-write is fine for one household (fetch.js sends in sequence).
async function fridgeWrite(request, env) {
  const denied = guard(request, env);
  if (denied) return denied;
  if (!env.FRIDGE_KV) return new Response('{}', { status: 503, headers: JSON_CORS });
  const { op, ids } = (await request.json().catch(() => null)) || {};
  const good = Array.isArray(ids) && ids.length && ids.length <= 200 && ids.every(id => typeof id === 'string' && /^\w{1,16}$/.test(id));
  if ((op !== 'use' && op !== 'unuse') || !good) return jsonError('bad request', 400);
  const used = new Set((await env.FRIDGE_KV.get('rewe:used', 'json')) || []);
  ids.forEach(id => { if (op === 'use') used.add(id); else used.delete(id); });
  await env.FRIDGE_KV.put('rewe:used', JSON.stringify([...used]));
  return new Response('{"ok":true}', { headers: JSON_CORS });
}

// ---- TickTick chores (free Open API, OAuth token from SETUP.md) -------------

const TICK = 'https://api.ticktick.com/open/v1/';

// The list named TICKTICK_PROJECT (default "Chores", a leading emoji in the name is ignored), or null.
async function tickProject(env, H) {
  const res = await fetch(TICK + 'project', { headers: H });
  if (!res.ok) throw new Error('TickTick projects: ' + res.status); // 401 = token expired, redo the SETUP.md step
  const want = (env.TICKTICK_PROJECT || 'chores').toLowerCase();
  return (await res.json()).find(p => (p.name || '').replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase() === want) || null;
}
const NO_LIST = () => new Response('{"error":"no TickTick list"}', { status: 404, headers: JSON_CORS });

// Open tasks of the chores list. Filtering to today and mapping to people happens in the page.
async function choresRead(env) {
  if (!env.TICKTICK_TOKEN) return new Response('[]', { status: 503, headers: JSON_CORS });
  const H = { Authorization: 'Bearer ' + env.TICKTICK_TOKEN };
  const p = await tickProject(env, H);
  if (!p) return NO_LIST();

  const r = await fetch(`${TICK}project/${p.id}/data`, { headers: H });
  if (!r.ok) throw new Error('TickTick data: ' + r.status); // 502, so the page keeps the last good chores
  const data = await r.json();
  // dueDate looks like "2026-11-03T22:00:00.000+0000"; add the colon so any Date parser takes it
  const tasks = (data.tasks || []).filter(t => t.status === 0).map(t => ({
    id: t.id,
    projectId: t.projectId,
    title: t.title || '',
    due: t.dueDate ? new Date(t.dueDate.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')).toISOString() : null,
    allDay: !!t.isAllDay,
    tags: t.tags || []
  }));
  return new Response(JSON.stringify(tasks), { headers: { ...JSON_CORS, 'Cache-Control': 'no-store' } });
}

// POST {id, projectId}: complete the task. Recurring tasks move on to their next date, like in the app.
// POST {op:'add', title, tag?}: new undated task in the chores list, tagged with the person's name.
async function choresWrite(request, env) {
  const denied = guard(request, env);
  if (denied) return denied;
  if (!env.TICKTICK_TOKEN) return new Response('{}', { status: 503, headers: JSON_CORS });
  const H = { Authorization: 'Bearer ' + env.TICKTICK_TOKEN };
  const { op, id, projectId, title, tag } = await request.json();
  if (op === 'add') {
    if (!title || title.length > 200) return new Response('{"error":"bad request"}', { status: 400, headers: JSON_CORS });
    const p = await tickProject(env, H);
    if (!p) return NO_LIST();
    const res = await fetch(TICK + 'task', {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: p.id, title, tags: tag ? [tag] : [] })
    });
    if (!res.ok) throw new Error('TickTick add failed: ' + res.status);
    return new Response('{"ok":true}', { headers: JSON_CORS });
  }
  if (!/^\w+$/.test(id || '') || !/^\w+$/.test(projectId || '')) return new Response('{"error":"bad request"}', { status: 400, headers: JSON_CORS });
  const res = await fetch(`${TICK}project/${projectId}/task/${id}/complete`, {
    method: 'POST', headers: H
  });
  if (!res.ok) throw new Error('TickTick complete failed: ' + res.status);
  return new Response('{"ok":true}', { headers: JSON_CORS });
}

// ---- BVG transit departures ------------------------------------------------

async function handleTransit(env) {
  const stopId = env.BVG_STOP_ID;
  if (!stopId) return new Response(JSON.stringify({ stop: '', departures: [] }), { status: 503, headers: JSON_CORS });

  // Skip departures that leave before you could walk to the stop
  const when = new Date(Date.now() + (+env.BVG_WALK_MIN || 0) * 60e3).toISOString();
  const res  = await fetch(`https://v6.bvg.transport.rest/stops/${stopId}/departures?results=6&duration=45&when=${when}`);
  const data = await res.json();

  const departures = (data.departures || []).slice(0, 6).map(d => ({
    line:      d.line?.name      || '?',
    direction: d.direction       || '?',
    when:      d.when,
    delay:     Math.round((d.delay || 0) / 60),
    product:   d.line?.product   || 'bus',
    platform:  d.platform        || null
  }));

  return new Response(JSON.stringify({ stop: env.BVG_STOP_NAME || stopId, departures }), {
    headers: { ...JSON_CORS, 'Cache-Control': 'max-age=60, s-maxage=60' }
  });
}

// ---- Unsplash stock photos for the slideshow (key stays here) --------------

async function handlePhotos(env) {
  // /photos/random returns a new set on every call. Search and the editorial feed return the same
  // top 30 each time, so the slideshow never saw new photos. Orientation is not filtered here:
  // the frame prefers landscape (it fills the screen) and shows a portrait whole only when nothing else is left.
  const q = env.PHOTO_QUERY;
  const api = 'https://api.unsplash.com/photos/random?count=30' + (q ? '&query=' + encodeURIComponent(q) : '');
  const r = await fetch(api, { headers: { Authorization: 'Client-ID ' + (env.UNSPLASH_KEY || '') } });
  if (!r.ok) throw new Error('Unsplash ' + r.status);
  const body = await r.json();
  const out = (Array.isArray(body) ? body : [body]).map(p => ({
    id: p.id,
    o: p.height > p.width ? 'p' : 'l',
    url: p.urls.raw,
    photographer: p.user.name,
    alt: p.alt_description || ''
  }));
  // Short cache: the frame refetches hourly and a 3600 s cache could serve it the previous set.
  return new Response(JSON.stringify(out), { headers: { ...JSON_CORS, 'Cache-Control': 'max-age=600' } });
}
