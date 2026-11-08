// Run: node test/news.test.mjs   (from dashboard/). Throws on the first failed assertion.
import assert from 'node:assert/strict';
import { parseFeedList, parseFeed, mergeItems } from '../news.js';

// feed list
assert.deepEqual(parseFeedList('rbb24|https://a.example/rss, DW | https://b.example/x'),
  [{ name: 'rbb24', url: 'https://a.example/rss' }, { name: 'DW', url: 'https://b.example/x' }]);
assert.deepEqual(parseFeedList('noname,|https://x.example,Plain|http://insecure.example,,'), [], 'needs a name and https');
for (const bad of [undefined, null, '', 42]) assert.deepEqual(parseFeedList(bad), []);

// RSS 2.0 with CDATA, entities and escaped HTML in the description
const rss = `<?xml version="1.0"?><rss><channel><title>Channel title</title>
<item><title><![CDATA[Bahn &amp; BVG: Streik am Montag]]></title><link>https://x/1</link>
<pubDate>Sun, 08 Nov 2026 09:30:00 +0100</pubDate>
<description>&lt;p&gt;Erster &lt;b&gt;Absatz&lt;/b&gt;&lt;/p&gt; &#8211; mehr</description></item>
<item><title>Zweite Meldung</title><pubDate>not a date</pubDate></item>
<item><title>   </title></item>
</channel></rss>`;
const r = parseFeed(rss, 'rbb24');
assert.equal(r.length, 2, 'items without a title are dropped; the channel title is not an item');
assert.equal(r[0].title, 'Bahn & BVG: Streik am Montag');
assert.equal(r[0].desc, 'Erster Absatz – mehr');
assert.equal(r[0].at, Date.parse('2026-11-08T08:30:00Z'));
assert.equal(r[0].src, 'rbb24');
assert.equal(r[1].at, 0, 'unreadable date -> 0');

// Atom and RDF (dc:date)
const atom = `<feed><entry><title type="html">Atom &lt;em&gt;Titel&lt;/em&gt;</title><updated>2026-11-08T10:00:00Z</updated>
<summary>Kurz</summary><link href="https://x/2"/></entry></feed>`;
assert.deepEqual(parseFeed(atom, 'heise'), [{ title: 'Atom Titel', src: 'heise', at: Date.parse('2026-11-08T10:00:00Z'), desc: 'Kurz' }]);
const rdf = `<rdf:RDF><item rdf:about="https://x/3"><title>RDF item</title><dc:date>2026-11-08T07:00:00Z</dc:date></item></rdf:RDF>`;
assert.equal(parseFeed(rdf, 'DW')[0].at, Date.parse('2026-11-08T07:00:00Z'));
assert.deepEqual(parseFeed('', 'x'), []);
assert.deepEqual(parseFeed('<html>error page</html>', 'x'), []);

// long description is cut at a word
const long = parseFeed('<item><title>T</title><description>' + 'wort '.repeat(200) + '</description></item>', 'x')[0].desc;
assert.ok(long.length <= 400 && long.endsWith('…'));

// merge: newest first, duplicates dropped, at most 4 per source, 12 in all
const mk = (src, n, base) => Array.from({ length: n }, (_, i) => ({ title: src + ' ' + i, src, at: base - i * 1000, desc: '' }));
const m = mergeItems([mk('A', 10, 10e6), mk('B', 10, 9e6), mk('C', 10, 8e6), mk('D', 10, 7e6)]);
assert.equal(m.length, 12);
assert.deepEqual(m.slice(0, 5).map(x => x.title), ['A 0', 'A 1', 'A 2', 'A 3', 'B 0']);
const d = mergeItems([[{ title: 'Same', src: 'A', at: 2, desc: '' }], [{ title: 'same', src: 'B', at: 1, desc: '' }]]);
assert.deepEqual(d.map(x => x.src), ['A'], 'duplicate titles across feeds keep the newest');
assert.deepEqual(mergeItems([[], []]), []);
console.log('news ok');
