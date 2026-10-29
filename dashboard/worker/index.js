// Serves the built dashboard and proxies Pexels so the API key stays server-side.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/photos') return env.ASSETS.fetch(request);

    const cache = caches.default;
    const hit = await cache.match(request);
    if (hit) return hit;

    const q = env.PHOTO_QUERY;
    const api = q
      ? 'https://api.pexels.com/v1/search?per_page=40&query=' + encodeURIComponent(q)
      : 'https://api.pexels.com/v1/curated?per_page=40';
    const r = await fetch(api, { headers: { Authorization: env.PEXELS_KEY || '' } });
    if (!r.ok) return new Response('upstream ' + r.status, { status: 502 });

    const { photos = [] } = await r.json();
    const out = photos.map((p) => ({
      id: p.id,
      o: p.height > p.width ? 'p' : 'l',
      url: p.src.original,
      photographer: p.photographer,
      alt: p.alt || '',
    }));
    const res = new Response(JSON.stringify(out), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
    });
    ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  },
};
