// Cloudflare Worker — API proxy for home dashboard
// Routes: /api/weather, /api/calendar, /api/shopping + /api/fridge (Bring! lists: GET list, POST write), /api/home (HA bridge), /api/config (visible views), /api/transit, /api/photos (Unsplash stock stream)
// All other paths go to Cloudflare Assets (run_worker_first in wrangler.jsonc, so the gate below covers them).
//
// Access gate: the whole site (page, assets and /api/*) needs the `hq` cookie, which holds DASH_TOKEN.
// Open https://<worker>/?key=<DASH_TOKEN> once on the frame to set it (one year). The page JS carries the
// token too, so gating only /api would protect nothing: anyone with the URL would get the token.

import { mapHome, toService } from './ha-map.js';
import { parseViews } from './views.js';

// Same-origin only: no Access-Control-Allow-Origin, so other sites can't read the family's data.
const JSON_CORS = { 'Content-Type': 'application/json' };
const COOKIE_AGE = 365 * 24 * 3600;

function gate(request, env, url) {
  if (!env.DASH_TOKEN) return new Response('DASH_TOKEN is not set', { status: 503 });
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
    const denied = gate(request, env, url);
    if (denied) return denied;
    try {
      // await: the handlers are async, and only an awaited rejection reaches the catch below
      if (pathname === '/api/weather')  return await handleWeather(env);
      if (pathname === '/api/calendar') return await handleCalendar(env);
      if (pathname === '/api/shopping' || pathname === '/api/fridge') {
        const which = pathname.slice(5);
        return await (request.method === 'POST' ? bringWrite(request, env, which) : bringRead(env, which));
      }
      if (pathname === '/api/config')   return handleConfig(env);
      if (pathname === '/api/home')     return await (request.method === 'POST' ? homeWrite(request, env) : handleHome(env));
      if (pathname === '/api/transit')  return await handleTransit(env);
      if (pathname === '/api/photos')   return await handlePhotos(env);
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

  // Open-Meteo returns 48 hourly entries (2 days). Slice the first 24 = today.
  // All times are in the requested timezone, so index 0 = midnight today local time.
  const t = data.hourly.temperature_2m.slice(0, 24).map(Math.round);
  const p = (data.hourly.precipitation_probability || new Array(24).fill(0)).slice(0, 24);
  const c = data.hourly.weathercode.slice(0, 24).map((code, h) => mapWMO(code, h));

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

// Login + headers + target list (which: 'shopping' | 'fridge'). Throws on auth failure; list is null if not found.
async function bringSession(env, which) {
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
  // Shopping: list named BRING_LIST (default "home", like shoplister), else the first list.
  // Fridge: list named BRING_FRIDGE_LIST (default "fridge"), no fallback, so it never writes to the shopping list.
  const { lists } = await (await fetch(`${BRING}bringusers/${auth.uuid}/lists`, { headers: H })).json();
  const fridge = which === 'fridge';
  const want = (fridge ? env.BRING_FRIDGE_LIST || 'fridge' : env.BRING_LIST || 'home').toLowerCase();
  const list = (lists || []).find(l => (l.name || '').trim().toLowerCase() === want) || (fridge ? null : (lists || [])[0]) || null;
  return { H, list };
  // ponytail: re-authenticates on every request; use Workers KV to cache the token if Bring! rate-limits
}

async function bringRead(env, which) {
  if (!env.BRING_EMAIL || !env.BRING_PASSWORD) {
    return new Response('[]', { status: 503, headers: JSON_CORS });
  }
  const { H, list } = await bringSession(env, which);
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
async function bringWrite(request, env, which) {
  const denied = guard(request, env);
  if (denied) return denied;
  const { op, name, qty = 1, note = '' } = await request.json();
  if (!BRING_OPS[op] || !name) return new Response('{"error":"bad request"}', { status: 400, headers: JSON_CORS });
  const { H, list } = await bringSession(env, which);
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

// ---- Home Assistant bridge (Google Home devices reach the dashboard through HA) ---------------
// GET /api/home -> mapped devices/rooms/climate/media. POST /api/home {id, patch} -> HA service call.
// Secrets: HA_URL (e.g. https://xxxx.ui.nabu.casa), HA_TOKEN (long-lived access token).

const haFetch = (env, path, init = {}) =>
  fetch(env.HA_URL.replace(/\/$/, '') + path, {
    ...init, headers: { Authorization: `Bearer ${env.HA_TOKEN}`, 'Content-Type': 'application/json' }
  });

async function handleHome(env) {
  if (!env.HA_URL || !env.HA_TOKEN) return new Response('{}', { status: 503, headers: JSON_CORS });
  const res = await haFetch(env, '/api/states');
  if (!res.ok) throw new Error('Home Assistant answered ' + res.status);
  const states = await res.json();

  // Areas (rooms) aren't in /api/states: ask HA's template engine once. Rooms fall back to "Home" if this fails.
  let areas = {};
  try {
    const ids = states.map(s => s.entity_id).filter(id => /^(light|lock|cover)\./.test(id));
    const tpl = `{% set r = {} %}{% for i in ${JSON.stringify(ids)} %}{% set r = dict(r, **{i: area_name(i) or ''}) %}{% endfor %}{{ r | tojson }}`;
    const t = await haFetch(env, '/api/template', { method: 'POST', body: JSON.stringify({ template: tpl }) });
    if (t.ok) areas = Object.fromEntries(Object.entries(JSON.parse(await t.text())).filter(([, v]) => v));
  } catch (e) { /* ponytail: areas are cosmetic, never fail the whole call over them */ }

  return new Response(JSON.stringify(mapHome(states, areas)), { headers: { ...JSON_CORS, 'Cache-Control': 'no-store' } });
}

async function homeWrite(request, env) {
  const denied = guard(request, env);
  if (denied) return denied;
  if (!env.HA_URL || !env.HA_TOKEN) return new Response('{"error":"HA not configured"}', { status: 503, headers: JSON_CORS });
  const { id, patch } = await request.json();
  const call = typeof id === 'string' && patch ? toService(id, patch) : null;
  if (!call) return new Response('{"error":"bad request"}', { status: 400, headers: JSON_CORS });
  const res = await haFetch(env, `/api/services/${call.domain}/${call.service}`, { method: 'POST', body: JSON.stringify(call.data) });
  if (!res.ok) throw new Error('Home Assistant answered ' + res.status);
  return new Response('{"ok":true}', { headers: JSON_CORS });
}

// ---- BVG transit departures ------------------------------------------------

async function handleTransit(env) {
  const stopId = env.BVG_STOP_ID;
  if (!stopId) return new Response(JSON.stringify({ stop: '', departures: [] }), { status: 503, headers: JSON_CORS });

  const res  = await fetch(`https://v6.bvg.transport.rest/stops/${stopId}/departures?results=6&duration=45`);
  const data = await res.json();

  const departures = (data.departures || []).map(d => ({
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
  const q = env.PHOTO_QUERY;
  const api = q
    ? 'https://api.unsplash.com/search/photos?per_page=30&query=' + encodeURIComponent(q)
    : 'https://api.unsplash.com/photos?per_page=30';
  const r = await fetch(api, { headers: { Authorization: 'Client-ID ' + (env.UNSPLASH_KEY || '') } });
  if (!r.ok) throw new Error('Unsplash ' + r.status);
  const body = await r.json();
  const out = (body.results || body).map(p => ({
    id: p.id,
    o: p.height > p.width ? 'p' : 'l',
    url: p.urls.raw,
    photographer: p.user.name,
    alt: p.alt_description || ''
  }));
  return new Response(JSON.stringify(out), { headers: { ...JSON_CORS, 'Cache-Control': 'max-age=3600' } });
}
