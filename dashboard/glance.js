// Ranked "glance" chips for the idle (ambient) screen. Pure, shared by the page and tests.
// c: { now: Date, timers: [{end: ms}], title, time, who, leaveMin (null without travel), dep: {line, direction, when: Date, delay},
//      meal, mealMore, familyEvening, tonight: [titles of all-day items today] }
// Returns at most 3 chips, most urgent first: {kind, text, level}. level: 'now' (alert: leave now, timer done or under a
// minute), 'soon' (copper: leave within 15 min, timer running), '' (plain). The first chip is the hero line.
export function mmss(ms) {
  var s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}

export function chips(c) {
  var out = [], now = +c.now, h = c.now.getHours();
  var t = (c.timers || []).slice().sort(function (a, b) { return a.end - b.end; })[0];
  if (t) out.push({ kind: 'timer', text: mmss(t.end - now), level: t.end - now < 60000 ? 'now' : 'soon' });
  if (c.title) {
    var l = c.leaveMin, who = c.who ? ' · ' + c.who : '';
    out.push(l != null && l <= 90
      ? { kind: 'event', text: (l <= 0 ? 'Leave now' : 'Leave in ' + Math.ceil(l) + ' min') + ' · ' + c.title + who, level: l <= 0 ? 'now' : l <= 15 ? 'soon' : '' }
      : { kind: 'event', text: c.title + ' · ' + c.time + who, level: '' });
  }
  // Departures matter only when you are about to leave, and only within the hour
  if (c.dep && c.leaveMin != null && c.leaveMin <= 20) {
    var m = Math.round((c.dep.when - now) / 60000);
    if (m >= 0 && m <= 60) out.push({ kind: 'transit', text: c.dep.line + ' ' + c.dep.direction + ' · ' + (m < 1 ? 'now' : m + ' min') + (c.dep.delay > 0 ? ' (+' + c.dep.delay + ')' : ''), level: '' });
  }
  // Evening: all-day items for today ("Bin night", someone away)
  if (c.tonight && c.tonight.length && h >= 17) out.push({ kind: 'tonight', text: 'Tonight: ' + c.tonight[0] + (c.tonight.length > 1 ? ' +' + (c.tonight.length - 1) : ''), level: '' });
  // The plan has no meal time (PRODUCT.md): "Today", during the day, not when the family is out for the evening
  if (c.meal && h >= 10 && h < 19 && !c.familyEvening) out.push({ kind: 'meal', text: 'Today: ' + c.meal + (c.mealMore ? ' +' + c.mealMore : ''), level: '' });
  return out.slice(0, 3);
}
