// Serves the built dashboard and proxies Unsplash so the API key stays server-side.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/photos') return env.ASSETS.fetch(request);

    const cache = caches.default;
    const hit = await cache.match(request);
    if (hit) return hit;

    const q = env.PHOTO_QUERY;
    const api = q
      ? 'https://api.unsplash.com/search/photos?per_page=30&query=' + encodeURIComponent(q)
      : 'https://api.unsplash.com/photos?per_page=30';
    const r = await fetch(api, { headers: { Authorization: 'Client-ID ' + (env.UNSPLASH_KEY || '') } });
    if (!r.ok) return new Response('upstream ' + r.status, { status: 502 });

    const body = await r.json();
    const out = (body.results || body).map((p) => ({
      id: p.id,
      o: p.height > p.width ? 'p' : 'l',
      url: p.urls.raw,
      photographer: p.user.name,
      alt: p.alt_description || '',
    }));
    const res = new Response(JSON.stringify(out), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
    });
    ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  },
};
