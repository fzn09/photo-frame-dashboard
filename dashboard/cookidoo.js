// Cookidoo (Thermomix) week plan and recipes for the Meals view. Read-only.
// Port of the calls in miaucl/cookidoo-api (unofficial, reverse-engineered): OIDC refresh-token grant against
// the Vorwerk CIAM, then the planning service's "my-week" endpoint on the country domain.
// Login is not done here. Seed the refresh token once into KV (see SETUP.md, section Cookidoo).

const CIAM = 'https://ciam.prod.cookidoo.vorwerk-digital.com/.well-known/openid-configuration';
const CLIENT_ID = 'mobile-android'; // public client, PKCE, no secret (library docs/oauth-client.md)
const EXPIRY_MARGIN_S = 300;
const KV_KEY = 'tokens';
const IMG_HOST = 'assets.tmecosys.com';
const THUMB = 't_web_shared_recipe_221x240';
const PHOTO = 't_web_rdp_recipe_584x480_1_5x';
const ID = /^[\w.-]{1,64}$/;
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

// Only pictures the image route will serve. Your own recipes can hold other hosts: those show the placeholder.
function picture(images, transformation, imgRoute) {
  const raw = images?.square || images?.portrait || images?.landscape || (typeof images === 'string' ? images : '');
  if (!raw.startsWith(`https://${IMG_HOST}/`)) return '';
  return imgRoute + encodeURIComponent(raw.replace('{transformation}', transformation));
}

// Seconds as a number, or a duration like PT1H30M (your own recipes).
function seconds(v) {
  const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?/.exec(String(v));
  return iso ? (+iso[1] || 0) * 3600 + (+iso[2] || 0) * 60 : +v || 0;
}

// Pure mapping, tested in test/cookidoo.test.mjs. totalTime arrives as seconds in a string ("1500.0").
// The week lists your own recipes as ids only: customs holds the ones handleMeals loaded, keyed by id.
export function mapWeek(body, imgRoute = '/api/meals/img?u=', customs = {}) {
  const days = (body?.myDays || []).map(d => ({
    date: d.id,
    recipes: (d.recipes || []).map(r => {
      const im = r.assets?.images;
      return {
        id: r.id,
        name: r.title,
        min: Math.round(seconds(r.totalTime) / 60),
        img: picture(im, THUMB, imgRoute),
        photo: picture(im, PHOTO, imgRoute)
      };
    }).concat((d.customerRecipeIds || []).map(id => customs[id] || { id, name: 'Your recipe', min: 0, img: '', photo: '', custom: true }))
  })).sort((a, b) => (a.date < b.date ? -1 : 1));
  return { days };
}

function customImage(c) { return c?.image || c?.descriptiveAssets?.[0]; }

export function mapCustomMeal(body, imgRoute = '/api/meals/img?u=') {
  const c = body?.recipeContent || {};
  return {
    id: body.recipeId,
    name: body.title || c.name || 'Your recipe',
    min: Math.round(seconds(c.totalTime) / 60),
    img: picture(customImage(c), THUMB, imgRoute),
    photo: picture(customImage(c), PHOTO, imgRoute),
    custom: true
  };
}

// formattedText is HTML. <nobr> wraps the Thermomix settings: split on it so odd parts are settings, and drop
// every other tag. The page escapes all of this again when it paints.
function plain(s) {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
export function stepParts(html) { return String(html || '').split(/<\/?nobr>/i).map(plain); }

function amount(i) {
  const q = i.quantity || {}, n = q.value || (q.from && q.to ? q.from + '–' + q.to : '');
  return [n, n && i.unitNotation].filter(Boolean).join(' ');
}

const LEVEL = { easy: 'Easy', medium: 'Medium', advanced: 'Advanced' };

export function mapRecipe(r, imgRoute = '/api/meals/img?u=') {
  const time = t => Math.round(seconds((r.times || []).find(x => x.type === t)?.quantity?.value) / 60);
  const per = r.nutritionGroups?.[0]?.recipeNutritions?.[0];
  const kcal = per?.nutritions?.find(n => n.type === 'kcal')?.number;
  const size = r.servingSize;
  return {
    id: r.id,
    name: r.title,
    img: picture(r.descriptiveAssets?.[0], PHOTO, imgRoute),
    total: time('totalTime'),
    active: time('activeTime'),
    level: LEVEL[r.difficulty] || r.difficulty || '',
    serves: size?.quantity?.value ? size.quantity.value + ' ' + (size.unitNotation || '') : '',
    kcal: kcal ? Math.round(kcal) : 0,
    per: per?.unitNotation || '',
    tm: (r.thermomixVersions || []).join(', '),
    ingredients: (r.recipeIngredientGroups || []).flatMap(g => g.recipeIngredients || [])
      .map(i => ({ q: amount(i), name: i.ingredientNotation, note: i.preparation || '' })),
    steps: (r.recipeStepGroups || []).flatMap(g => g.recipeSteps || []).map(s => stepParts(s.formattedText))
  };
}

export function mapCustomRecipe(body, imgRoute = '/api/meals/img?u=') {
  const c = body?.recipeContent || {}, text = x => (typeof x === 'string' ? x : x?.text || '');
  const y = c.recipeYield || c.yield;
  return {
    id: body.recipeId,
    name: body.title || c.name || 'Your recipe',
    img: picture(customImage(c), PHOTO, imgRoute),
    total: Math.round(seconds(c.totalTime) / 60),
    active: Math.round(seconds(c.prepTime) / 60),
    level: '', kcal: 0, per: '', tm: '',
    serves: y?.value ? y.value + ' ' + (y.unitText || '') : '',
    ingredients: (c.recipeIngredient || c.ingredients || []).map(i => ({ q: '', name: text(i), note: '' })),
    steps: (c.recipeInstructions || c.instructions || []).map(s => [text(s)])
  };
}

function api(env, token, path) {
  const { host } = cfg(env);
  return fetch(`https://${host}/${path}`, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'User-Agent': UA } });
}

// Best effort: a lookup that fails leaves the meal as "Your recipe", and an unknown device hides the pill.
async function customMeals(env, token, ids) {
  const { lang } = cfg(env);
  const found = await Promise.all([...new Set(ids)].map(async id => {
    try {
      const r = await api(env, token, `created-recipes/${lang}/${encodeURIComponent(id)}`);
      return r.ok ? [id, mapCustomMeal(await r.json())] : null;
    } catch (e) { console.error('cookidoo custom recipe', e); return null; }
  }));
  return Object.fromEntries(found.filter(Boolean));
}

async function devices(env, token) {
  try {
    const r = await api(env, token, 'customer-devices/api/my-devices/versions');
    return r.ok ? (await r.json()).join(', ') : '';
  } catch (e) { console.error('cookidoo devices', e); return ''; }
}

export async function handleMeals(env) {
  if (!env.COOKIDOO_KV) return new Response('{"days":[],"error":"not configured"}', { status: 503, headers: JSON_H });
  const day = today(env.WEATHER_TZ), token = await cookidooToken(env);
  const res = await fetch(await weekUrl(env, day), {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'User-Agent': UA }
  });
  if (!res.ok) throw new Error('Cookidoo week ' + res.status);
  const body = await res.json();
  const ids = (body?.myDays || []).flatMap(d => d.customerRecipeIds || []);
  const [customs, device] = await Promise.all([customMeals(env, token, ids), devices(env, token)]);
  return new Response(JSON.stringify({ ...mapWeek(body, undefined, customs), device }), {
    headers: { ...JSON_H, 'Cache-Control': 'max-age=300' }
  });
}

export async function handleMealRecipe(env, url) {
  if (!env.COOKIDOO_KV) return new Response('{"error":"not configured"}', { status: 503, headers: JSON_H });
  const id = url.searchParams.get('id') || '', custom = url.searchParams.has('custom');
  if (!ID.test(id)) return new Response('{"error":"bad id"}', { status: 400, headers: JSON_H });
  const { lang } = cfg(env);
  const res = await api(env, await cookidooToken(env), (custom ? 'created-recipes/' : 'recipes/recipe/') + lang + '/' + id);
  if (!res.ok) throw new Error('Cookidoo recipe ' + res.status);
  const body = await res.json();
  return new Response(JSON.stringify(custom ? mapCustomRecipe(body) : mapRecipe(body)), {
    headers: { ...JSON_H, 'Cache-Control': 'max-age=3600' }
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
