// No text under --fs-min (16px = 2.5 mm on the 160 PPI panel). Plain node:assert, like the other tests.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../css/', import.meta.url);
const files = ['base.css', ...readdirSync(new URL('views/', dir)).map(f => 'views/' + f)];
const bad = [];
for (const f of files) {
  readFileSync(new URL(f, dir), 'utf8').split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      if (parseFloat(m[1]) < 16) bad.push(`${f}:${i + 1} ${m[0]}`);
    }
  });
}
assert.deepEqual(bad, [], 'font-size below 16px:\n' + bad.join('\n'));
console.log('type-floor ok');
