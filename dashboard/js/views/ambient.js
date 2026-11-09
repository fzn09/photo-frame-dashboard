// Ambient (idle photo frame) and Night (dim red clock) overlays.
import { chips, mmss } from '../../glance.js';

(function () {
  'use strict';
  var D = window.DATA, $ = App.$;
  var amb = { show: null }, shiftTimer = null;

  // Ranked chips (timer, leave-by, departure, tonight's meal); see glance.js.
  function glance() {
    var n = App.now(), next = App.nextEvent(), d = D.transit && D.transit.departures;
    var key = n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2);
    var day = D.meals && D.meals.days && D.meals.days.filter(function (x) { return x.date === key; })[0];
    var rec = App.enabled('meals') && day ? day.recipes : [];
    var eveStart = new Date(n); eveStart.setHours(17, 0, 0, 0);
    var familyEvening = App.timedOn(n).some(function (e) { return App.isFamily(e) && e.end > eveStart; });
    return chips({
      now: n, timers: App.timers ? App.timers() : [],
      title: next ? next.title : '', time: next ? App.fmt.time(next.start) : '',
      who: next ? (App.isFamily(next) ? 'Everyone' : next.people.map(function (id) { return App.person(id).name; }).join(' + ')) : '',
      leaveMin: next && next.travel ? (App.leaveBy(next) - n) / 60000 : null,
      dep: d && d[0], meal: rec[0] ? rec[0].name : '', mealMore: Math.max(0, rec.length - 1), familyEvening: familyEvening,
      tonight: App.allDayOn(n).map(function (e) { return e.title; })
    });
  }
  var ICON = { timer: 'clock', meal: 'utensils', transit: 'car', tonight: 'calendar' };
  // The first chip is the hero line (34 px); the rest are 26 px. Copper when soon, alert when it is the moment.
  function chipHTML(c, next, i) {
    var ic = ICON[c.kind] ? App.icon(ICON[c.kind], i ? 26 : 32) : '';
    var st = c.kind === 'event' && next ? ' style="' + App.pstyle(App.evColor(next)) + '"' : '';
    // The timer text is rewritten every second by the 'second' handler below. A tap on it opens Kitchen.
    return '<div class="amb-next' + (i ? '' : ' amb-hero') + (c.level ? ' is-' + c.level : '') + '"' + st +
      (c.kind === 'timer' ? ' data-tmr data-open="kitchen"' : '') + '>' +
      ic + (c.kind === 'event' ? '<i></i>' : '') + '<span>' + App.esc(c.text) + '</span></div>';
  }
  function ambientInfo() {
    var n = App.now(), w = App.weatherNow(), next = App.nextEvent();
    return '<div class="amb-clock"><div class="amb-time num">' + App.fmt.time(n, false) + '</div>' +
      '<div class="amb-date">' + App.fmt.day(n) + ', ' + App.fmt.month(n) + ' ' + n.getDate() + '</div></div>' +
      '<div class="amb-right">' +
      '<div class="amb-wx">' + App.icon(w.cond, 44) + '<span class="num">' + w.temp + '°</span><small' + (w.wet ? ' class="is-wet"' : '') + '>' + w.summary + '</small></div>' +
      glance().map(function (c, i) { return chipHTML(c, next, i); }).join('') +
      '</div>';
  }
  function nightInfo() {
    var n = App.now(), tomorrow = App.addDays(n, n.getHours() < 6 ? 0 : 1);
    var first = App.timedOn(tomorrow)[0], w = App.weatherNow();
    var t = glance().filter(function (c) { return c.kind === 'timer'; })[0];
    return '<div class="nt-time num">' + App.fmt.time(n, false) + '</div>' +
      '<div class="nt-wx">' + App.icon(w.cond, 26) + '<span>' + w.temp + '°</span></div>' +
      '<div class="nt-line">' + (first ? 'First up ' + App.fmt.rel(first.start).toLowerCase() + ': <b>' + App.esc(first.title) + '</b>' : 'Nothing early tomorrow') + '</div>' +
      (first ? '<div class="nt-sub">' + App.fmt.time(first.start) + ' · ' + App.esc(App.person(first.people[0]).name) + '</div>' : '') +
      (App.timerDone && App.timerDone() ? '<div class="nt-lock nt-done" data-open="kitchen">' + App.icon('bell', 26) + '<span>Timer done · tap to clear</span></div>'
        : t ? '<div class="nt-lock" data-tmr>' + App.icon('clock', 26) + '<span>' + t.text + '</span></div>' : '');
  }

  function paint() {
    if (App.mode === 'ambient') $('#ambient .amb-info').innerHTML = ambientInfo();
    if (App.mode === 'night') $('#night .nt-inner').innerHTML = nightInfo();
  }

  // Nudge static content a few px every minute so nothing sits still for hours (image retention)
  function pixelShift() {
    var x = Math.round(Math.random() * 8 - 4), y = Math.round(Math.random() * 8 - 4);
    App.$$('.amb-info, .nt-inner').forEach(function (el) { el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; });
  }

  App.on('ready', function () {
    $('#ambient').innerHTML = '<div class="amb-stage"></div><div class="amb-scrim"></div><div class="amb-info"></div>';
    $('#night').innerHTML = '<div class="nt-inner"></div>';
    amb.show = new App.Slideshow($('#ambient .amb-stage'), { captions: false, interval: 14000 });
    $('#ambient').addEventListener('click', function (e) {
      var o = e.target.closest('[data-open]'); // the timer chip opens Kitchen, anywhere else opens Home
      App.setMode('day'); App.go(o ? o.dataset.open : 'home');
    });
    $('#night').addEventListener('click', function (e) {
      var o = e.target.closest('[data-open]');
      App.setMode('day'); App.go(o ? o.dataset.open : 'home');
    });
  });

  App.on('mode', function (m) {
    clearInterval(shiftTimer);
    if (m === 'ambient') { if (App.enabled('photos')) amb.show.start(); paint(); shiftTimer = setInterval(pixelShift, 60000); }
    else amb.show.stop();
    if (m === 'night') { paint(); shiftTimer = setInterval(pixelShift, 60000); }
    App.resetIdle();
  });
  App.on('minute', paint);
  // Only the timer text changes between minutes, so don't rebuild the markup.
  App.on('second', function () {
    if (App.mode === 'day' || !App.timers) return;
    // Scope to the visible overlay: the other one keeps stale markup.
    var t = App.timers().sort(function (a, b) { return a.end - b.end; })[0], el = $((App.mode === 'night' ? '#night' : '#ambient') + ' [data-tmr] span');
    if (!t || !el) return;
    el.textContent = mmss(t.end - Date.now());
    var now = t.end - Date.now() < 60000;
    el.parentNode.classList.toggle('is-now', now);
    el.parentNode.classList.toggle('is-soon', !now);
  });
})();
