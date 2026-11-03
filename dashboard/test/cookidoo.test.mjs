// Run: node test/cookidoo.test.mjs   (from dashboard/). Throws on the first failed assertion.
// Mocked fetch and KV: no network. Sample body is from the library's docs/raw-api-requests/get-recipes-for-calendar-week.txt.
import assert from 'node:assert/strict';
import { cookidooToken, mapWeek, mapRecipe, mapCustomRecipe, stepParts, handleMeals, handleMealRecipe, handleMealImage } from '../cookidoo.js';

// Shapes from the library's docs/raw-api-requests/get-recipe.txt
const RECIPE = {
  id: 'r1', title: 'Kokos Pralinen', difficulty: 'easy', thermomixVersions: ['TM5', 'TM6'],
  times: [{ type: 'activeTime', comment: '', quantity: { value: 2700 } }, { type: 'totalTime', comment: '', quantity: { value: 32400 } }],
  servingSize: { quantity: { value: 50 }, unitNotation: 'Stück' },
  descriptiveAssets: [{ square: 'https://assets.tmecosys.com/image/upload/{transformation}/img/r' }],
  recipeIngredientGroups: [{ recipeIngredients: [
    { quantity: { value: 40 }, unitNotation: 'g', preparation: 'in Stücken', ingredientNotation: 'Butter' },
    { quantity: { from: 1, to: 2 }, unitNotation: 'EL', ingredientNotation: 'Honig' },
    { quantity: null, unitNotation: null, ingredientNotation: 'Salz' }
  ] }],
  recipeStepGroups: [{ recipeSteps: [{ title: '1', formattedText: 'Milch in den <b>Mixtopf</b> geben und <nobr>6 Min./100°C/Stufe 2</nobr> kochen.' }] }],
  nutritionGroups: [{ name: '', recipeNutritions: [{ quantity: 1, unitNotation: 'Stück', nutritions: [{ number: 275, type: 'kJ' }, { number: 65.7, type: 'kcal' }] }] }]
};

const kv = (init) => {
  let v = init;
  return { get: async () => v, put: async (_k, s) => { v = JSON.parse(s); }, peek: () => v };
};
const calls = [];
const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push({ url, init });
  if (url.includes('openid-configuration')) return json({ token_endpoint: 'https://ciam.example/token' });
  if (url === 'https://ciam.example/token') return json({ access_token: 'A2', expires_in: 43200 }); // no new refresh token
  if (url.endsWith('/planning/.well-known/home')) return json({ _links: { 'planning:api-my-week-from-date': { href: 'https://cookidoo.de/planning/{lang}/api/my-week/{dayKey}{?x}' } } });
  if (url.includes('/planning/de-DE/api/my-week/')) return json({ myDays: [
    { id: '2025-03-05', recipes: [{ id: 'r2', title: 'Tea', totalTime: '1500.0', assets: { images: { square: 'https://assets.tmecosys.com/image/upload/{transformation}/img/x' } } }], customerRecipeIds: ['c1'] },
    { id: '2025-03-04', recipes: [{ id: 'r1', title: 'Waffles', totalTime: '1500.0', assets: null }], customerRecipeIds: [] }
  ] });
  if (url.endsWith('/customer-devices/api/my-devices/versions')) return json(['TM6']);
  if (url.endsWith('/created-recipes/de-DE/c1')) return json({ recipeId: 'c1', title: 'Omas Gulasch', recipeContent: { totalTime: 'PT2H', image: 'https://other.example/a.jpg', recipeIngredient: ['800 g Rind', { text: 'Salz' }], recipeInstructions: [{ text: 'Schmoren' }] } });
  if (url.endsWith('/recipes/recipe/de-DE/r1')) return json(RECIPE);
  if (url.startsWith('https://assets.tmecosys.com/')) return new Response('img', { headers: { 'Content-Type': 'image/png' } });
  throw new Error('unexpected ' + url);
};

// token: refresh when missing, keep old refresh token when the response omits one, reuse while valid
const store = kv({ refresh: 'R1' });
const env = { COOKIDOO_KV: store, COOKIDOO_HOST: 'cookidoo.de', COOKIDOO_LANG: 'de-DE' };
assert.equal(await cookidooToken(env, 1000), 'A2');
assert.deepEqual(store.peek(), { access: 'A2', exp: 1000 + 43200, refresh: 'R1' });
const n = calls.length;
assert.equal(await cookidooToken(env, 2000), 'A2');
assert.equal(calls.length, n, 'valid token: no network');
await assert.rejects(cookidooToken({ COOKIDOO_KV: kv({}) }), /no Cookidoo refresh token/);

// mapping: sorted by date, minutes from seconds, thumbnail transformation, image through the Worker route
const w = mapWeek((await (await fetch('https://cookidoo.de/planning/de-DE/api/my-week/x')).json()));
assert.deepEqual(w.days.map(d => d.date), ['2025-03-04', '2025-03-05']);
assert.equal(w.days[0].recipes[0].img, '', 'no assets: empty image');
assert.equal(w.days[1].recipes[0].min, 25);
assert.deepEqual(w.days[1].recipes[1], { id: 'c1', name: 'Your recipe', min: 0, img: '', photo: '', custom: true }, 'own recipe that could not be loaded keeps its place');
assert.equal(decodeURIComponent(w.days[1].recipes[0].img.split('u=')[1]), 'https://assets.tmecosys.com/image/upload/t_web_shared_recipe_221x240/img/x');

// handler: bearer header, discovered path with a refreshed token
const res = await handleMeals({ ...env, COOKIDOO_KV: kv({ access: 'A9', exp: Date.now() / 1000 + 9999, refresh: 'R' }) });
assert.equal(res.status, 200);
const meals = await res.json();
assert.equal(meals.days.length, 2);
assert.equal(meals.device, 'TM6');
const own = meals.days[1].recipes[1];
assert.equal(own.name, 'Omas Gulasch');
assert.equal(own.min, 120, 'PT2H');
assert.equal(own.img, '', 'a picture the image route would refuse is dropped');
const weekCall = calls.find(c => /my-week\/\d{4}-/.test(c.url));
assert.equal(weekCall.init.headers.Authorization, 'Bearer A9');
assert.match(weekCall.url, /\/planning\/de-DE\/api\/my-week\/\d{4}-\d{2}-\d{2}$/);
assert.equal((await handleMeals({})).status, 503, 'no KV binding: not configured');

// recipe: units, ranges, no quantity, HTML steps split into text and Thermomix settings
const r = mapRecipe(RECIPE);
assert.deepEqual([r.total, r.active, r.level, r.serves, r.kcal, r.per, r.tm], [540, 45, 'Easy', '50 Stück', 66, 'Stück', 'TM5, TM6']);
assert.deepEqual(r.ingredients, [{ q: '40 g', name: 'Butter', note: 'in Stücken' }, { q: '1–2 EL', name: 'Honig', note: '' }, { q: '', name: 'Salz', note: '' }]);
assert.deepEqual(r.steps, [['Milch in den Mixtopf geben und ', '6 Min./100°C/Stufe 2', ' kochen.']]);
assert.match(decodeURIComponent(r.img), /t_web_rdp_recipe_584x480_1_5x\/img\/r$/);
assert.deepEqual(stepParts('a &amp; b<script>x</script>'), ['a & bx']);
assert.deepEqual(mapCustomRecipe({ recipeId: 'c', recipeContent: { name: 'N', recipeIngredient: ['1 Ei'], recipeInstructions: ['Braten'] } }).steps, [['Braten']]);

const route = (q) => handleMealRecipe({ ...env, COOKIDOO_KV: kv({ access: 'A9', exp: Date.now() / 1000 + 9999 }) }, new URL('https://hq.example/api/meals/recipe' + q));
assert.equal((await (await route('?id=r1')).json()).name, 'Kokos Pralinen');
assert.equal((await (await route('?id=c1&custom=1')).json()).name, 'Omas Gulasch');
assert.equal((await route('?id=../../x')).status, 400, 'id cannot walk the path');
assert.equal((await handleMealRecipe({}, new URL('https://hq.example/?id=r1'))).status, 503);

// image proxy: only https assets.tmecosys.com
const img = (u) => handleMealImage(new URL('https://hq.example/api/meals/img?u=' + encodeURIComponent(u)));
assert.equal((await img('https://assets.tmecosys.com/a.png')).status, 200);
assert.equal((await img('https://evil.example/a.png')).status, 400);
assert.equal((await img('http://assets.tmecosys.com/a.png')).status, 400);
assert.equal((await img('not a url')).status, 400);
console.log('cookidoo ok');
