// Ranked "glance" chips for the idle (ambient) screen. Pure, shared by the page and tests.
// c: { now: Date, timers: [{end: ms}], title, time, leaveMin (null without travel), dep: {line, direction, when: Date}, meal }
// Returns at most 3 chips, most urgent first: {kind, text, urgent}. Text is plain; the caller escapes it.
export function mmss(ms) {
  var s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}

export function chips(c) {
  var out = [], now = +c.now, h = c.now.getHours();
  var t = (c.timers || []).slice().sort(function (a, b) { return a.end - b.end; })[0];
  if (t) out.push({ kind: 'timer', text: mmss(t.end - now), urgent: t.end - now < 60000 });
  if (c.title) {
    var l = c.leaveMin;
    out.push(l != null && l <= 90
      ? { kind: 'event', text: (l <= 0 ? 'Leave now' : 'Leave in ' + Math.ceil(l) + ' min') + ' · ' + c.title, urgent: l <= 10 }
      : { kind: 'event', text: c.title + ' · ' + c.time, urgent: false });
  }
  // Departures matter only when you are about to leave.
  if (c.dep && c.leaveMin != null && c.leaveMin <= 20) {
    var m = Math.round((c.dep.when - now) / 60000);
    if (m >= 0) out.push({ kind: 'transit', text: c.dep.line + ' ' + c.dep.direction + ' · ' + (m < 1 ? 'now' : m + ' min'), urgent: false });
  }
  if (c.meal && h >= 16 && h < 20) out.push({ kind: 'meal', text: 'Tonight: ' + c.meal, urgent: false });
  return out.slice(0, 3);
}
