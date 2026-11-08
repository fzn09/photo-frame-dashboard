// News headlines for the Today card. Read-only, no keys. Feeds come from the NEWS_FEEDS var as
// "Name|https://feed,Name|https://feed". RSS 2.0, RSS 1.0 (RDF) and Atom are parsed with regexes:
// the Worker has no DOM parser, and only title, date and summary are needed.

const MAX_ITEMS = 12;
const PER_SOURCE = 4;   // newest overall, but no source fills the whole card
const TIMEOUT_MS = 8000;
const CACHE_S = 900;

// "rbb24|https://a, DW|https://b" -> [{ name, url }]. Entries without a name or an https URL are dropped.
export function parseFeedList(str) {
  return String(str || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const i = s.indexOf('|');
    return i > 0 ? { name: s.slice(0, i).trim(), url: s.slice(i + 1).trim() } : null;
  }).filter(f => f && f.name && /^https:\/\/[^\s]+$/.test(f.url));
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

// Inner text of the first <tag>: CDATA unwrapped, entities decoded, HTML tags stripped, whitespace collapsed.
// Feeds often escape HTML inside <description>, so tags are stripped again after decoding.
function text(block, tags) {
  for (const tag of tags) {
    const m = block.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i'));
    if (!m) continue;
    let s = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    s = decode(s.replace(/<[^>]*>/g, ' ')).replace(/<[^>]*>/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    if (s) return s;
  }
  return '';
}

// One feed's XML -> [{ title, src, at, desc }]. at = epoch ms (0 when the date is missing or unreadable).
export function parseFeed(xml, src) {
  const blocks = String(xml || '').match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];
  return blocks.map(b => {
    const title = text(b, ['title']);
    const at = Date.parse(text(b, ['pubDate', 'dc:date', 'published', 'updated'])) || 0;
    let desc = text(b, ['description', 'summary', 'content:encoded', 'content']);
    if (desc.length > 400) desc = desc.slice(0, 397).replace(/\s+\S*$/, '') + '…';
    return { title, src, at, desc };
  }).filter(it => it.title);
}

// Merge all feeds: newest first, duplicate titles dropped, at most PER_SOURCE per source, MAX_ITEMS in all.
export function mergeItems(lists) {
  const seen = new Set(), count = {}, out = [];
  lists.flat().sort((a, b) => b.at - a.at).forEach(it => {
    const key = it.title.toLowerCase();
    if (out.length >= MAX_ITEMS || seen.has(key) || (count[it.src] || 0) >= PER_SOURCE) return;
    seen.add(key);
    count[it.src] = (count[it.src] || 0) + 1;
    out.push(it);
  });
  return out;
}

export async function handleNews(env, json) {
  const feeds = parseFeedList(env.NEWS_FEEDS);
  if (!feeds.length) return new Response('[]', { status: 503, headers: json });
  // One slow or broken feed must not cost the others: each is fetched and parsed on its own.
  const lists = await Promise.all(feeds.map(f =>
    fetch(f.url, { signal: AbortSignal.timeout(TIMEOUT_MS), cf: { cacheTtl: CACHE_S, cacheEverything: true } })
      .then(r => r.ok ? r.text() : Promise.reject(r.status))
      .then(xml => parseFeed(xml, f.name))
      .catch(err => { console.warn('[news] ' + f.name + ' failed:', err); return []; })
  ));
  const items = mergeItems(lists);
  if (!items.length) return new Response('[]', { status: 502, headers: json });
  return new Response(JSON.stringify(items), {
    headers: { ...json, 'Cache-Control': 'max-age=' + CACHE_S + ', s-maxage=' + CACHE_S }
  });
}
