// Run: node test/glance.test.mjs   (from dashboard/). Throws on the first failed assertion.
import assert from 'node:assert/strict';
import { chips, mmss } from '../glance.js';

const at = (h, m = 0) => new Date(2026, 10, 4, h, m);
const base = { now: at(8), timers: [], title: '', time: '', leaveMin: null, dep: null, meal: '' };

assert.equal(mmss(61000), '1:01');
assert.equal(mmss(-5), '0:00');
assert.deepEqual(chips(base), [], 'calm: nothing to say');

const t = chips({ ...base, timers: [{ end: +base.now + 90000 }, { end: +base.now + 30000 }] });
assert.deepEqual(t, [{ kind: 'timer', text: '0:30', level: 'now' }], 'soonest timer, alert under a minute');

const ev = chips({ ...base, title: 'Dentist', time: '9:30', leaveMin: 8 });
assert.equal(ev[0].text, 'Leave in 8 min · Dentist');
assert.equal(ev[0].level, 'soon', 'leave within 15 min: copper');
assert.equal(chips({ ...base, title: 'Dentist', time: '9:30', leaveMin: 0 })[0].text, 'Leave now · Dentist');
assert.equal(chips({ ...base, title: 'Dentist', time: '9:30', leaveMin: 0 })[0].level, 'now', 'leave now: alert');
assert.equal(chips({ ...base, title: 'Dentist', time: '9:30', who: 'Amanda' })[0].text, 'Dentist · 9:30 · Amanda', 'whose event, in words');
assert.equal(chips({ ...base, title: 'Yoga', time: '18:00', leaveMin: 200 })[0].text, 'Yoga · 18:00', 'far away: just the time');

const dep = { line: 'U2', direction: 'Pankow', when: new Date(+base.now + 4 * 60000) };
assert.equal(chips({ ...base, title: 'A', time: 'x', leaveMin: 15, dep }).length, 2, 'departure inside leave window');
assert.equal(chips({ ...base, title: 'A', time: 'x', leaveMin: 40, dep }).length, 1, 'departure hidden outside it');

assert.equal(chips({ ...base, now: at(12), meal: 'Pasta', mealMore: 1 })[0].text, 'Today: Pasta +1', 'meal: no implied time');
assert.equal(chips({ ...base, now: at(20), meal: 'Pasta' }).length, 0, 'meal gone after 19:00');
assert.equal(chips({ ...base, now: at(12), meal: 'Pasta', familyEvening: true }).length, 0, 'family out tonight: no meal');
assert.equal(chips({ ...base, now: at(18), tonight: ['Bin night', 'Fauzan away'] })[0].text, 'Tonight: Bin night +1', 'all-day tonight');
assert.equal(chips({ ...base, now: at(12), tonight: ['Bin night'] }).length, 0, 'all-day only from 17:00');
assert.equal(chips({ ...base, title: 'A', time: 'x', leaveMin: 15, dep: { ...dep, when: new Date(+base.now + 90 * 60000) } }).length, 1, 'departure over an hour out: hidden');
assert.equal(chips({ ...base, title: 'A', time: 'x', leaveMin: 15, dep: { ...dep, delay: 3 } })[1].text, 'U2 Pankow · 4 min (+3)', 'delay shown');

const eve = at(17), depEve = { ...dep, when: new Date(+eve + 4 * 60000) };
const all = chips({ ...base, now: eve, timers: [{ end: +eve + 9e5 }], title: 'A', time: 'x', leaveMin: 5, dep: depEve, meal: 'P', tonight: ['Bins'] });
assert.deepEqual(all.map(x => x.kind), ['timer', 'event', 'transit'], 'capped at 3, ranked');
console.log('glance ok');
