// Run: node test/travel.test.mjs   (from dashboard/). The Worker's default travel time for calendar events.
import assert from 'node:assert/strict';
import { travelFor, pickJourney } from '../worker.js';
import { chips } from '../glance.js';

const timed = { start: { dateTime: '2026-11-09T12:00:00+01:00' }, location: 'Bright Smiles Dental' };
assert.equal(travelFor(timed, '20'), 20, 'timed event with a place gets the default');
assert.equal(travelFor({ ...timed, location: '' }, '20'), null, 'no place: no travel');
assert.equal(travelFor({ start: { date: '2026-11-09' }, location: 'Montréal' }, '20'), null, 'all-day: no travel');
assert.equal(travelFor(timed, ''), null, 'setting empty: off');
assert.equal(travelFor(timed, '0'), null, 'setting 0: off');
assert.equal(travelFor({ ...timed, location: 'https://zoom.us/j/123' }, '20'), null, 'online meeting: no travel');

// Live route: the latest journey that still arrives by the deadline wins; walking-only gives no via
const walk = (d, a) => ({ walking: true, departure: d, arrival: a });
const ride = (d, a, line, delay = 0) => ({ departure: d, arrival: a, line: { name: line }, direction: 'Pankow', origin: { name: 'U Eberswalder Str.' }, departureDelay: delay * 60 });
const T = h => '2026-11-10T' + h + ':00+01:00';
const js = [
  { legs: [walk(T('08:30'), T('08:34')), ride(T('08:34'), T('08:52'), 'S42')] },
  { legs: [walk(T('08:37'), T('08:41')), ride(T('08:41'), T('08:53'), 'U2', 2)] },
  { legs: [walk(T('08:40'), T('08:44')), ride(T('08:44'), T('08:57'), 'M10')] } // late after delays: past the 08:55 deadline
];
const r = pickJourney(js, T('09:00'), T('08:55'));
assert.equal(r.travel, 23, 'leave 08:37 for 09:00');
assert.deepEqual([r.via.line, r.via.stop, r.via.delay], ['U2', 'U Eberswalder Str.', 2]);
assert.equal(pickJourney([js[2]], T('09:00'), T('08:55')).travel, 20, 'all late: best effort, not nothing');
assert.equal(pickJourney([{ legs: [walk(T('08:45'), T('08:55'))] }], T('09:00'), T('08:55')).via, null, 'walk only');
assert.equal(pickJourney([], T('09:00'), T('08:55')), null, 'no journeys: keep the default');

// A live-shaped event (travel from the Worker) reaches the Ambient chip as a leave-by
const now = new Date(2026, 10, 9, 11, 30), start = new Date(2026, 10, 9, 12, 0);
const leaveMin = (+start - travelFor(timed, '20') * 60000 - now) / 60000;
assert.equal(chips({ now, timers: [], title: 'Dentist', time: '12:00', leaveMin, dep: null, meal: '' })[0].text, 'Leave in 10 min · Dentist');
console.log('travel ok');
