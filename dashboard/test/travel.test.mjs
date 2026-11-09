// Run: node test/travel.test.mjs   (from dashboard/). The Worker's default travel time for calendar events.
import assert from 'node:assert/strict';
import { travelFor } from '../worker.js';
import { chips } from '../glance.js';

const timed = { start: { dateTime: '2026-11-09T12:00:00+01:00' }, location: 'Bright Smiles Dental' };
assert.equal(travelFor(timed, '20'), 20, 'timed event with a place gets the default');
assert.equal(travelFor({ ...timed, location: '' }, '20'), null, 'no place: no travel');
assert.equal(travelFor({ start: { date: '2026-11-09' }, location: 'Montréal' }, '20'), null, 'all-day: no travel');
assert.equal(travelFor(timed, ''), null, 'setting empty: off');
assert.equal(travelFor(timed, '0'), null, 'setting 0: off');

// A live-shaped event (travel from the Worker) reaches the Ambient chip as a leave-by
const now = new Date(2026, 10, 9, 11, 30), start = new Date(2026, 10, 9, 12, 0);
const leaveMin = (+start - travelFor(timed, '20') * 60000 - now) / 60000;
assert.equal(chips({ now, timers: [], title: 'Dentist', time: '12:00', leaveMin, dep: null, meal: '' })[0].text, 'Leave in 10 min · Dentist');
console.log('travel ok');
