// Cookidoo (Thermomix) week plan for the Meals view. Read-only.
// Port of the calls in miaucl/cookidoo-api (unofficial, reverse-engineered): OIDC refresh-token grant against
// the Vorwerk CIAM, then the planning service's "my-week" endpoint on the country domain.
// Login is not done here. Seed the refresh token once into KV (see SETUP.md, section Cookidoo).

const CIAM = 'https://ciam.prod.cookidoo.vorwerk-digital.com/.well-known/openid-configuration';
const CLIENT_ID = 'mobile-android'; // public client, PKCE, no secret (library docs/oauth-client.md)
const EXPIRY_MARGIN_S = 300;
const KV_KEY = 'tokens';
const IMG_HOST = 'assets.tmecosys.com';
const THUMB = 't_web_shared_recipe_221x240';
// Cloudflare-fronted login and discovery hosts flag clients without a browser User-Agent (upstream issue 230).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const JSON_H = { 'Content-Type': 'application/json' };

let tokenEndpoint = null; // per isolate
let weekPath = null;

function cfg(env) {
  return { host: env.COOKIDOO_HOST || 'cookidoo.de', lang: env.COOKIDOO_LANG || 'de-DE' };
}

async function endpoint() {
  if (tokenEndpoint) return tokenEndpoint;
  const r = await fetch(CIAM, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error('Cookidoo OIDC discovery ' + r.status);
  tokenEndpoint = (await r.json()).token_endpoint;
  return tokenEndpoint;
}

// Stored: {access, exp (epoch s), refresh}. Seeded with {refresh} only.
export async function cookidooToken(env, now = Date.now() / 1000) {
  if (!env.COOKIDOO_KV) throw new Error('COOKIDOO_KV binding missing');
  const read = async () => (await env.COOKIDOO_KV.get(KV_KEY, 'json')) || {};
  let t = await read();
  if (t.access && t.exp - EXPIRY_MARGIN_S > now) return t.access;
  if (!t.refresh) throw new Error('no Cookidoo refresh token in KV');
  const res = await fetch(await endpoint(), {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: CLIENT_ID })
  });
  if (!res.ok) {
    // A parallel request may have rotated the refresh token and stored a fresh pair: use it.
    const again = await read();
    if (again.access && again.exp - EXPIRY_MARGIN_S > now) return again.access;
    throw new Error('Cookidoo token refresh ' + res.status);
  }
  const p = await res.json();
  t = { access: p.access_token, exp: now + (+p.expires_in || 43200), refresh: p.refresh_token || t.refresh };
  await env.COOKIDOO_KV.put(KV_KEY, JSON.stringify(t));
  return t.access;
}

// The live path comes from <host>/planning/.well-known/home (HAL). Fallback is the path the library ships.
async function weekUrl(env, day) {
  const { host, lang } = cfg(env);
  if (!weekPath) {
    weekPath = 'planning/{lang}/api/my-week/{day}';
    try {
      const r = await fetch(`https://${host}/planning/.well-known/home`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.ok) {
        const link = (await r.json())._links?.['planning:api-my-week-from-date'];
        const href = Array.isArray(link) ? link[0]?.href : link?.href;
        if (href) {
          weekPath = href.replace(/^https?:\/\/[^/]+/, '').replace(/\{[?&].*$/, '').replace(/^\//, '')
            .replace(/\{dayKey\}/, '{day}');
        }
      }
    } catch (e) { console.error('cookidoo discovery', e); }
  }
  return `https://${host}/` + weekPath.replace('{lang}', lang).replace('{day}', day);
}

function today(tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Europe/Berlin' }).format(new Date()); // YYYY-MM-DD
}

// Pure mapping, tested in test/cookidoo.test.mjs. totalTime arrives as seconds in a string ("1500.0").
export function mapWeek(body, imgRoute = '/api/meals/img?u=') {
  const days = (body?.myDays || []).map(d => ({
    date: d.id,
    recipes: (d.recipes || []).map(r => {
      const im = r.assets?.images || {};
      const raw = im.square || im.portrait || im.landscape || '';
      return {
        id: r.id,
        name: r.title,
        min: Math.round((+r.totalTime || 0) / 60),
        img: raw ? imgRoute + encodeURIComponent(raw.replace('{transformation}', THUMB)) : ''
      };
    }),
    custom: (d.customerRecipeIds || []).length // ids only: the week endpoint does not return their titles
  })).sort((a, b) => (a.date < b.date ? -1 : 1));
  return { days };
}

export async function handleMeals(env) {
  if (!env.COOKIDOO_KV) return new Response('{"days":[],"error":"not configured"}', { status: 503, headers: JSON_H });
  const day = today(env.WEATHER_TZ);
  const res = await fetch(await weekUrl(env, day), {
    headers: { Authorization: 'Bearer ' + await cookidooToken(env), Accept: 'application/json', 'User-Agent': UA }
  });
  if (!res.ok) throw new Error('Cookidoo week ' + res.status);
  return new Response(JSON.stringify(mapWeek(await res.json())), {
    headers: { ...JSON_H, 'Cache-Control': 'max-age=300' }
  });
}

// Recipe pictures: the frame (Android 6) cannot reach third-party CDNs, so the Worker fetches them.
export async function handleMealImage(url) {
  let u;
  try { u = new URL(url.searchParams.get('u') || ''); } catch { return new Response('Bad image', { status: 400 }); }
  if (u.protocol !== 'https:' || u.hostname !== IMG_HOST) return new Response('Bad image', { status: 400 });
  const r = await fetch(u.toString(), { headers: { 'User-Agent': UA } });
  if (!r.ok) return new Response('Not found', { status: 404 });
  return new Response(r.body, {
    headers: { 'Content-Type': r.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': 'private, max-age=86400' }
  });
}
