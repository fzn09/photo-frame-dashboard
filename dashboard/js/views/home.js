// Home / Today: the glanceable overview. Never scrolls.
import { daysLeft } from '../../calc.js';

(function () {
  'use strict';
  var D = window.DATA, V = {};

  // "Updated 3 h ago" badge for a card whose feed is overdue (App.feedAge, fetch.js). Hidden while fresh or on sample data.
  function ageTag(feed) {
    var m = App.feedAge ? App.feedAge(feed) : 0;
    return '<span class="h-age" data-feed="' + feed + '"' + (m ? '>' + ageText(m) : ' hidden>') + '</span>';
  }
  function ageText(m) { return 'Updated ' + (m < 90 ? m + ' min' : Math.round(m / 60) + ' h') + ' ago'; }
  function ages() {
    Array.prototype.forEach.call(V.el.querySelectorAll('.h-age'), function (el) {
      var m = App.feedAge ? App.feedAge(el.dataset.feed) : 0;
      el.hidden = !m;
      if (m) el.textContent = ageText(m);
    });
  }

  function clock() {
    var n = App.now();
    return '<div class="h-time num">' + App.fmt.time(n, false) + '<span class="h-ampm">' + App.fmt.ampm(n) + '</span></div>' +
      '<div class="h-date"><b>' + App.fmt.day(n) + '</b> ' + App.fmt.month(n) + ' ' + n.getDate() + '</div>';
  }

  function weather() {
    var w = App.weatherNow();
    var hours = App.hourly(7);
    // Side column: sunset + air as two short rows. The advice gets a full-width line under the top row.
    var side = airSun();
    return ageTag('weather') + '<div class="h-wx-top">' +
      '<span class="h-wx-icon">' + App.icon(w.cond, 60) + '</span>' +
      '<span class="h-wx-temp num">' + w.temp + '°</span>' +
      '<span class="h-wx-meta"><b>' + w.label + '</b><span>H ' + w.hi + '°  L ' + w.lo + '°</span></span>' +
      (side ? '<div class="h-wx-side">' + side + '</div>' : '') +
      '</div><div class="h-wx-say"><b>' + w.summary + '.</b> ' + w.advice + '.</div>' +
      '<div class="h-wx-hours">' + hours.map(function (h) {
        return '<div class="h-hr' + (h.p >= 50 ? ' is-wet' : '') + '"><span class="h-hr-l">' + h.label + '</span>' +
          '<span class="h-hr-i">' + App.icon(h.c, 22) + '</span><b>' + h.t + '°</b></div>';
      }).join('') + '</div>';
  }

  // EAQI bands (Open-Meteo / EEA): 0-20 good ... 100+ extremely poor
  var AQ = [[20, 'Good'], [40, 'Fair'], [60, 'Moderate'], [80, 'Poor'], [100, 'Very poor'], [1e9, 'Extremely poor']];

  function airSun() {
    var W = D.weather, bits = [];
    if (W && W.sun) bits.push('<div><span>Sunset</span><b>' + App.fmt.time(new Date('1970-01-01T' + W.sun), false) + '</b></div>');
    if (W && W.aqi != null) bits.push('<div><span>Air</span><b>' + AQ.filter(function (b) { return W.aqi < b[0]; })[0][1] + '</b></div>');
    return bits.length ? '<div class="h-air">' + bits.join('') + '</div>' : '';
  }

  function hero() {
    var e = App.nextEvent(), now = App.now();
    if (!e) {
      var tomorrow = App.timedOn(App.addDays(now, 1))[0];
      return '<div class="h-hero h-hero--empty" data-go="calendar">' + ageTag('calendar') +
        '<div class="label label--light">Rest of today</div>' +
        '<div class="h-hero-title serif">Nothing else scheduled.<br><i>Enjoy the quiet.</i></div>' +
        (tomorrow ? '<div class="h-hero-meta">Tomorrow starts with <b>' + App.esc(tomorrow.title) + '</b> at ' + App.fmt.time(tomorrow.start) + '</div>' : '') +
        '</div>';
    }
    var p = App.evColor(e);
    var mins = (e.start - now) / 60000;
    var leave = (App.leaveBy(e) - now) / 60000;
    var who = e.people.map(function (id) { return App.person(id).name; });
    var whoText = App.isFamily(e) ? 'Everyone' : who.join(' + ');
    var big = mins < 100
      ? '<div class="h-hero-count num"><em>in</em>' + Math.round(mins) + '<small>min</small></div>'
      : '<div class="h-hero-count num"><em>at</em>' + App.fmt.time(e.start, false) + '<small>' + App.fmt.ampm(e.start) + '</small></div>';
    var leavePill = '';
    if (e.travel) {
      leavePill = leave <= 0
        ? '<span class="pill pill--alert"><i class="pulse"></i>Leave now</span>'
        : '<span class="pill' + (leave <= 15 ? ' pill--soon' : '') + '">' + App.icon('car', 20) + 'Leave in ' + App.fmt.mins(leave) + '</span>';
    }
    return '<button class="h-hero" style="' + App.pstyle(p) + '" data-ev="' + e.id + '">' + ageTag('calendar') +
      '<div class="h-hero-main">' +
      '  <div class="label label--on">Next up · ' + App.esc(whoText) + '</div>' +
      '  <div class="h-hero-title serif">' + App.esc(e.title) + '</div>' +
      '  <div class="h-hero-meta">' + App.fmt.range(e.start, e.end) + (e.loc ? ' · ' + App.esc(e.loc) : '') + '</div>' +
      '  <div class="h-hero-foot">' + (e.people.length > 1 ? App.dots(e.people, 22) : '') + leavePill + '</div>' +
      '</div>' + big + '</button>';
  }

  // Events everyone is in show once, above the columns (two dots); each column keeps only that person's own.
  function lanes() {
    var now = App.now();
    var live = function (pid) { return App.timedOn(now, pid).filter(function (e) { return e.end > now; }); };
    var row = function (e, shared) {
      var cur = e.start <= now;
      return '<button class="h-ev' + (cur ? ' is-now' : '') + '" data-ev="' + e.id + '">' +
        '<span class="h-ev-t">' + (cur ? 'Now' : App.fmt.time(e.start, false)) + '</span>' +
        '<span class="h-ev-n">' + App.esc(e.title) + '</span>' + (shared ? App.dots(e.people, 12) : '') + '</button>';
    };
    var all = live().filter(App.isFamily), together = all.slice(0, 2), cap = together.length ? 1 : 3;
    return ageTag('calendar') +
      (together.length ? '<div class="h-together">' + together.map(function (e) { return row(e, true); }).join('') + '</div>' : '') +
      D.people.map(function (p) {
        var list = live(p.id).filter(function (e) { return !App.isFamily(e); });
        var shown = list.slice(0, cap), more = list.length - shown.length + all.length - together.length;
        return '<div class="h-lane" style="' + App.pstyle(p) + '">' +
          '<div class="h-lane-head">' + App.avatar(p, 30) + '<b>' + p.name + '</b></div>' +
          (shown.length ? shown.map(function (e) { return row(e); }).join('') :
            '<div class="h-free serif">' + (together.length ? '<i>Nothing</i> else' : '<i>Free</i> the rest of the day') + '</div>') +
          (more > 0 ? '<button class="h-more" data-go="calendar">+' + more + ' more</button>' : '') +
          '</div>';
      }).join('');
  }

  function ring(done, total, size) {
    var r = size / 2 - 5, c = 2 * Math.PI * r, f = total ? done / total : 0;
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-fg" stroke-dasharray="' + (c * f) + ' ' + c + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
  }
  App.ring = ring;

  function shopping() {
    var open = D.groceries.filter(function (g) { return !g.done; });
    var recent = open.slice(-3).reverse();
    if (!open.length) return ageTag('shopping') + '<div class="label">Shopping</div><div class="h-calm serif"><i>All stocked up.</i> Nothing left to buy.</div>';
    return ageTag('shopping') + '<div class="label">Shopping</div>' +
      '<div class="h-stat"><span class="num">' + open.length + '</span><small>items to get</small></div>' +
      '<ul class="h-recent">' + recent.map(function (g) {
        return '<li><i></i>' + App.esc(g.name) + '</li>';
      }).join('') + '</ul>';
  }

  // Open chores, overdue first then timed (same order as the Chores view). Dot = whose chore.
  function chores() {
    var open = D.chores.filter(function (c) { return !c.done; }).sort(function (a, b) {
      return ((b.overdue ? 1 : 0) - (a.overdue ? 1 : 0)) || ((a.time ? 0 : 1) - (b.time ? 0 : 1));
    });
    return '<div class="label">Chores</div>' +
      '<div class="h-stat"><span class="num">' + open.length + '</span><small>' + (open.length ? 'to do today' : 'all done today') + '</small></div>' +
      '<ul class="h-recent">' + open.slice(0, 3).map(function (c) {
        return '<li style="' + App.pstyle(c.who) + '"><i class="h-who"></i>' + App.esc(c.title) +
          (c.overdue ? '<span class="h-exp is-due">Overdue</span>' : c.time ? '<span class="h-exp">' + App.esc(c.time) + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
  }

  function fridge() {
    var key = function (f) { var d = daysLeft(f.note, App.now()); return d === null ? 999 : d; };
    var next = D.fridge.slice().sort(function (a, b) { return key(a) - key(b); }).slice(0, 3);
    if (!D.fridge.length) return ageTag('fridge') + '<div class="label">Fridge</div><div class="h-calm serif"><i>Fridge is empty.</i> Tap to add what’s inside.</div>';
    return ageTag('fridge') + '<div class="label">Fridge</div>' +
      '<div class="h-stat"><span class="num">' + D.fridge.length + '</span><small>items inside</small></div>' +
      '<ul class="h-recent">' + next.map(function (f) {
        var d = key(f);
        return '<li><i></i>' + App.esc(f.name) + (d === 999 ? '' : '<span class="h-exp' + (d <= 1 ? ' is-due' : '') + '">' +
          (d < 0 ? 'Expired' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d + ' days') + '</span>') + '</li>';
      }).join('') + '</ul>';
  }

  // BVG line colours; lines not listed fall back to the per-product CSS colour.
  var LINE_COLOR = {
    U1: '#7DAD4C', U2: '#DA421E', U3: '#16683D', U4: '#F0D722', U5: '#7E5330', U55: '#7E5330',
    U6: '#8C6DAB', U7: '#009BD5', U8: '#224F86', U9: '#F3791D',
    S1: '#DA6BA2', S2: '#007734', S25: '#007734', S26: '#007734', S3: '#0066AD', S41: '#AD5937',
    S45: '#CD9C53', S46: '#CD9C53', S47: '#CD9C53', S5: '#EB7405', S7: '#816DA6', S75: '#816DA6',
    S8: '#66AA22', S85: '#66AA22', S9: '#992746'
  };
  function lineStyle(name) {
    var c = LINE_COLOR[String(name).replace(/\s+/g, '').toUpperCase()];
    if (!c) return '';
    // WCAG relative luminance: dark text when it contrasts better with the badge than white does
    var L = [1, 3, 5].map(function (i) { var v = parseInt(c.substr(i, 2), 16) / 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    var lum = .2126 * L[0] + .7152 * L[1] + .0722 * L[2];
    return ' style="background:' + c + (1.05 / (lum + .05) < (lum + .05) / .06 ? ';color:#111' : '') + '"';
  }

  function transit() {
    var tr = D.transit;
    if (!tr || !tr.departures || !tr.departures.length) {
      return '<div class="label">Transit</div><div class="h-dep-empty serif"><i>Departures</i> unavailable</div>';
    }
    var now = App.now();
    // feed older than 3 polls: say so, and never read a dead feed as "nothing coming up"
    var age = tr.at && Date.now() - tr.at > 180000 ? Math.round((Date.now() - tr.at) / 60000) : 0;
    var ageLine = age ? '<div class="h-dep-age">Updated ' + age + ' min ago</div>' : '';
    var deps = tr.departures.filter(function (d) { return (d.when - now) > -60000; }).slice(0, 3);
    if (!deps.length) {
      return '<div class="label">Transit · ' + App.esc(tr.stop) + '</div>' +
        (age ? '<div class="h-dep-empty serif"><i>Departures</i> unavailable</div>' : '<div class="h-dep-empty serif"><i>Nothing</i> coming up</div>') + ageLine;
    }
    return '<div class="label">Transit · ' + App.esc(tr.stop) + '</div>' +
      '<div class="h-dep-list">' + deps.map(function (d) {
        var mins = Math.round((d.when - now) / 60000);
        return '<div class="h-dep">' +
          '<span class="h-dep-line h-dep-line--' + d.product + '"' + lineStyle(d.line) + '>' + App.esc(d.line) + '</span>' +
          '<span class="h-dep-dir">' + App.esc(d.direction) + '</span>' +
          '<b class="num h-dep-min">' + (mins <= 0 ? 'now' : mins < 60 ? mins + 'm' : App.fmt.time(d.when, false)) + '</b>' +
          '</div>';
      }).join('') + '</div>' + ageLine;
  }

  // Both lists empty: shop + fridge shrink and the photo takes twice their width (CSS: .home[data-lean]).
  function lean() {
    V.el.firstChild.toggleAttribute('data-lean', !D.groceries.some(function (g) { return !g.done; }) && !D.fridge.length);
  }

  function paint() {
    var el = V.el;
    lean();
    el.querySelector('.h-clock').innerHTML = clock();
    el.querySelector('.h-weather').innerHTML = weather();
    el.querySelector('.h-hero-slot').innerHTML = hero();
    el.querySelector('.h-lanes').innerHTML = lanes();
    if (App.enabled('shopping')) el.querySelector('.h-shop').innerHTML = shopping();
    el.querySelector('.h-transit').innerHTML = transit();
    if (App.enabled('fridge')) el.querySelector('.h-fridge').innerHTML = fridge();
    if (App.enabled('tasks')) el.querySelector('.h-chores').innerHTML = chores();
  }

  function photoCaption(s) {
    var m = App.photoMeta(s.photos[0]);
    V.el.querySelector('.h-photo-cap').innerHTML = '<b>' + (m.onThisDay ? 'On this day · ' : '') + m.kicker + '</b><span>' + App.esc(m.place) + '</span>';
  }

  App.register('home', {
    show: function (el) {
      V.el = el;
      if (!el.firstChild) {
        el.innerHTML = '<div class="home">' +
          '<div class="h-clock" data-go="calendar"></div>' +
          '<div class="h-weather card"></div>' +
          '<div class="h-transit card"></div>' +
          '<div class="h-hero-slot"></div>' +
          '<div class="h-lanes card" style="grid-template-columns:repeat(' + D.people.length + ',1fr)"></div>' +
          '<div class="h-row">' +
          '<div class="h-shop card" data-go="shopping"></div>' +
          '<div class="h-fridge card" data-go="fridge"></div>' +
          '<div class="h-chores card" data-go="tasks"></div>' +
          '<button class="h-photo" data-go="photos"><div class="h-photo-stage"></div><div class="h-photo-cap"></div></button>' +
          '</div></div>';
        el.addEventListener('click', function (e) {
          var ev = e.target.closest('[data-ev]');
          if (ev) { App.eventSheet(App.findEvent(ev.dataset.ev)); return; }
          var g = e.target.closest('[data-go]');
          if (g) App.go(g.dataset.go);
        });
        V.slides = new App.Slideshow(el.querySelector('.h-photo-stage'), { layout: 'cover', captions: false, interval: 12000, onChange: photoCaption });
      }
      paint();
      if (App.enabled('photos')) V.slides.start();
    },
    resume: function () { if (App.enabled('photos')) V.slides.start(); },
    hide: function () { if (V.slides) V.slides.stop(); }
  });
  // Every minute: just the clock and next-up countdown (cheap, even while hidden). Weather on the hour.
  App.on('minute', function (n) {
    if (!V.el || !V.el.firstChild) return;
    V.el.querySelector('.h-clock').innerHTML = clock();
    V.el.querySelector('.h-hero-slot').innerHTML = hero();
    V.el.querySelector('.h-transit').innerHTML = transit();
    if (n.getMinutes() === 0) { V.el.querySelector('.h-weather').innerHTML = weather(); V.el.querySelector('.h-lanes').innerHTML = lanes(); }
    ages();
  });
  App.on('data', function () { if (App.current === 'home') paint(); });
  App.on('fridge', function () { if (App.current === 'home' && App.enabled('fridge')) { lean(); V.el.querySelector('.h-fridge').innerHTML = fridge(); } });
  App.on('chores', function () { if (App.current === 'home' && App.enabled('tasks')) V.el.querySelector('.h-chores').innerHTML = chores(); });
  App.on('views', function () {
    if (!V.el || !V.el.firstChild) return;
    paint();
    if (!V.slides) return;
    if (App.enabled('photos') && App.current === 'home') V.slides.start(); else V.slides.stop();
  });
})();
