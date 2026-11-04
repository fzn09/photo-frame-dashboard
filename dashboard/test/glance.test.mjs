// Run: node test/glance.test.mjs   (from dashboard/). Throws on the first failed assertion.
import assert from 'node:assert/strict';
import { chips, mmss } from '../glance.js';

const at = (h, m = 0) => new Date(2026, 10, 4, h, m);
const base = { now: at(8), timers: [], title: '', time: '', leaveMin: null, dep: null, meal: '' };

assert.equal(mmss(61000), '1:01');
assert.equal(mmss(-5), '0:00');
assert.deepEqual(chips(base), [], 'calm: nothing to say');

const t = chips({ ...base, timers: [{ end: +base.now + 90000 }, { end: +base.now + 30000 }] });
assert.deepEqual(t, [{ kind: 'timer', text: '0:30', urgent: true }], 'soonest timer, urgent under a minute');

const ev = chips({ ...base, title: 'Dentist', time: '9:30', leaveMin: 8 });
assert.equal(ev[0].text, 'Leave in 8 min · Dentist');
assert.equal(ev[0].urgent, true);
assert.equal(chips({ ...base, title: 'Dentist', time: '9:30', leaveMin: 0 })[0].text, 'Leave now · Dentist');
assert.equal(chips({ ...base, title: 'Yoga', time: '18:00', leaveMin: 200 })[0].text, 'Yoga · 18:00', 'far away: just the time');

const dep = { line: 'U2', direction: 'Pankow', when: new Date(+base.now + 4 * 60000) };
assert.equal(chips({ ...base, title: 'A', time: 'x', leaveMin: 15, dep }).length, 2, 'departure inside leave window');
assert.equal(chips({ ...base, title: 'A', time: 'x', leaveMin: 40, dep }).length, 1, 'departure hidden outside it');

assert.equal(chips({ ...base, now: at(17), meal: 'Pasta' })[0].text, 'Tonight: Pasta');
assert.equal(chips({ ...base, now: at(12), meal: 'Pasta' }).length, 0, 'meal only in the evening');

const eve = at(17), depEve = { ...dep, when: new Date(+eve + 4 * 60000) };
const all = chips({ ...base, now: eve, timers: [{ end: +eve + 9e5 }], title: 'A', time: 'x', leaveMin: 5, dep: depEve, meal: 'P' });
assert.deepEqual(all.map(x => x.kind), ['timer', 'event', 'transit'], 'capped at 3, ranked');
console.log('glance ok');
