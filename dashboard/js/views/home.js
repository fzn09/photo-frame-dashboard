// Home / Today: the glanceable overview. Never scrolls.
import { fridgeRows } from '../../calc.js';

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
    return '<div class="h-time num">' + App.fmt.time(n) + '</div>' +
      '<div class="h-date"><b>' + App.fmt.day(n) + '</b> ' + App.fmt.month(n) + ' ' + n.getDate() + '</div>';
  }

  function weather() {
    var w = App.weatherNow();
    var hours = App.hourly(7);
    // Side column: sunrise, sunset, air behind a hairline. The advice gets a full-width line under the top row.
    var side = airSun();
    return ageTag('weather') + '<div class="h-wx-top">' +
      '<span class="h-wx-icon">' + App.icon(w.cond, 60) + '</span>' +
      '<span class="h-wx-temp num">' + w.temp + '°</span>' +
      '<span class="h-wx-meta"><b>' + w.label + '</b>' +
      (w.feels != null ? '<span>Feels like <b>' + w.feels + '°</b></span>' : '') +
      '<span>H ' + w.hi + '°  L ' + w.lo + '°</span></span>' +
      (side ? '<div class="h-wx-side">' + side + '</div>' : '') +
      '</div><div class="h-wx-say' + (w.wet ? ' is-wet' : '') + '"><b>' + w.summary + '.</b> ' + w.advice + '.</div>' +
      '<div class="h-wx-hours">' + hours.map(function (h) {
        return '<div class="h-hr' + (h.p >= 50 ? ' is-wet' : '') + (h.p >= 40 ? ' is-rain' : '') + '"><span class="h-hr-l">' + h.label + '</span>' +
          '<span class="h-hr-i">' + App.icon(h.c, 22) + '</span><b>' + h.t + '°</b>' +
          '<span class="h-hr-rb" aria-label="Rain ' + (h.p || 0) + '%"><i style="width:' + Math.min(100, h.p || 0) + '%"></i></span></div>';
      }).join('') + '</div>';
  }

  // EAQI bands (Open-Meteo / EEA): 0-20 good ... 100+ extremely poor
  var AQ = [[20, 'Good'], [40, 'Fair'], [60, 'Moderate'], [80, 'Poor'], [100, 'Very poor'], [1e9, 'Extremely poor']];

  function airSun() {
    var W = D.weather, bits = [];
    // Label/value rows, one per line of the meta column beside them: Sunrise 07:13 / Sunset 16:22 / Air Fair
    if (W && W.rise) bits.push('<div><span>Sunrise</span><b>' + App.fmt.time(new Date('1970-01-01T' + W.rise)) + '</b></div>');
    if (W && W.sun) bits.push('<div><span>Sunset</span><b>' + App.fmt.time(new Date('1970-01-01T' + W.sun)) + '</b></div>');
    if (W && W.aqi != null) bits.push('<div><span>Air</span><b>' + AQ.filter(function (b) { return W.aqi < b[0]; })[0][1] + '</b></div>');
    return bits.length ? '<div class="h-air">' + bits.join('') + '</div>' : '';
  }

  function hero() {
    var e = App.nextEvent(), now = App.now();
    if (!e) {
      var tomorrow = App.timedOn(App.addDays(now, 1))[0];
      // Nothing left today: the card looks ahead to tomorrow's first event (the people card already says who is free)
      if (tomorrow) {
        var tw = App.isFamily(tomorrow) ? 'Everyone' : tomorrow.people.map(function (id) { return App.person(id).name; }).join(' + ');
        return '<button class="h-hero h-hero--empty h-hero--next" style="' + App.pstyle(App.evColor(tomorrow)) + '" data-ev="' + tomorrow.id + '">' + ageTag('calendar') +
          '<div class="h-hero-main"><div class="label">Tomorrow · ' + App.esc(tw) + '</div>' +
          '<div class="h-hero-title serif">' + App.esc(tomorrow.title) + '</div>' +
          (tomorrow.loc ? '<div class="h-hero-meta">' + App.esc(tomorrow.loc) + '</div>' : '') + '</div>' +
          '<div class="h-hero-count num"><em>at</em>' + App.fmt.time(tomorrow.start) + '</div></button>';
      }
      return '<div class="h-hero h-hero--empty" data-go="calendar">' + ageTag('calendar') +
        '<div class="label">Rest of today</div>' +
        '<div class="h-hero-title serif">Nothing else scheduled.<br><i>Enjoy the quiet.</i></div></div>';
    }
    var p = App.evColor(e);
    var mins = Math.round((e.start - now) / 60000);
    var leave = Math.round((App.leaveBy(e) - now) / 60000);
    var who = e.people.map(function (id) { return App.person(id).name; });
    var whoText = App.isFamily(e) ? 'Everyone' : who.join(' + ');
    // The biggest figure is the decision, not the start time (which the meta line already says): with a travel time
    // it is when to leave. Under an hour it counts down; further out it is a clock time, like the transit board.
    var big, untilOnly = false, ref = e.travel ? leave : mins;
    if (e.travel && leave <= 0) big = '<em>Leave</em>now' + (leave < 0 ? '<small>' + (-leave) + ' min late</small>' : '');
    else if (e.travel) big = leave < 60 ? '<em>Leave in</em>' + leave + '<small>min</small>' : '<em>Leave</em>' + App.fmt.time(App.leaveBy(e));
    else if (mins < 60) big = '<em>in</em>' + mins + '<small>min</small>';
    else { big = '<em>at</em>' + App.fmt.time(e.start); untilOnly = true; }
    // Calm at rest (person-coloured edge), copper inside 15 minutes, alert red-orange once it is time to go
    var state = e.travel && leave <= 0 ? ' is-now' : ref <= 15 ? ' is-soon' : '';
    var meta = (untilOnly ? 'Until ' + App.fmt.time(e.end) : App.fmt.range(e.start, e.end)) + (e.loc ? ' · ' + App.esc(e.loc) : '');
    return '<button class="h-hero' + state + '" style="' + App.pstyle(p) + '" data-ev="' + e.id + '">' + ageTag('calendar') +
      '<div class="h-hero-main">' +
      '  <div class="label">Next up · ' + App.esc(whoText) + '</div>' +
      '  <div class="h-hero-title serif">' + App.esc(e.title) + '</div>' +
      '  <div class="h-hero-meta">' + meta + '</div>' +
      (e.people.length > 1 ? '  <div class="h-hero-foot">' + App.dots(e.people, 22) + '</div>' : '') +
      '</div><div class="h-hero-count num">' + big + '</div></button>';
  }

  // Events everyone is in show once, above the columns (two dots); each column keeps only that person's own.
  // The event in "Next up" is left out here: the card beside it shows the rest of the day, not the same thing twice.
  function lanes() {
    var now = App.now(), hero = App.nextEvent();
    var live = function (pid) { return App.timedOn(now, pid).filter(function (e) { return e.end > now && e !== hero; }); };
    var row = function (e, shared) {
      var cur = e.start <= now;
      return '<button class="h-ev' + (cur ? ' is-now' : '') + '" data-ev="' + e.id + '">' +
        '<span class="h-ev-t">' + (cur ? 'Now' : App.fmt.time(e.start, false)) + '</span>' +
        '<span class="h-ev-n">' + App.esc(e.title) + '</span>' + (shared ? App.dots(e.people, 12) : '') + '</button>';
    };
    // A meal is shared, so today's plan sits above the columns too. It costs one row of events.
    var meals = App.mealsOn(now), band = meals.length > 0;
    var all = live().filter(App.isFamily), together = all.slice(0, band ? 1 : 2), cap = together.length ? 1 : band ? 2 : 3;
    // Shared events that didn't fit are counted once, beside the shared row. In the lanes they were counted in
    // every column, so a lane read "+1 more" over "Nothing else".
    var famMore = all.length - together.length;
    var shared = together.map(function (e, i) {
      return i < together.length - 1 || !famMore ? row(e, true)
        : '<div class="h-tg-last">' + row(e, true) + '<button class="h-more" data-go="calendar">+' + famMore + ' more</button></div>';
    }).join('');
    return ageTag('calendar') +
      (band ? '<div class="h-mband"><span class="label h-mband-l">Cooking</span>' + meals.slice(0, 3).map(function (r) {
        return '<button class="h-meal" data-meal="' + App.esc(r.id) + '">' + App.mealThumb(r) + '<b>' + App.esc(r.name) + '</b></button>';
      }).join('') + '</div>' : '') +
      (together.length ? '<div class="h-together">' + shared + '</div>' : '') +
      // Nobody has anything left: one line across both columns, not "Free" twice beside an empty Next up
      (!together.length && !hero && D.people.every(function (p) { return !live(p.id).length; })
        ? '<div class="h-free h-free--all serif"><i>Everyone</i> is free for the rest of the day</div>' :
      D.people.map(function (p) {
        var list = live(p.id).filter(function (e) { return !App.isFamily(e); });
        var shown = list.slice(0, cap), more = list.length - shown.length;
        // "Free" only when the day really is: not when their next thing is the one shown in Next up
        var busy = together.length || (hero && hero.people.indexOf(p.id) > -1);
        return '<div class="h-lane" style="' + App.pstyle(p) + '">' +
          // "+N more" rides in the name row: a row of its own pushed it out of the card under a meal band
          '<div class="h-lane-head">' + App.avatar(p, 30) + '<b>' + p.name + '</b>' +
          (more > 0 ? '<button class="h-more" data-go="calendar">+' + more + ' more</button>' : '') + '</div>' +
          (shown.length ? shown.map(function (e) { return row(e); }).join('') :
            '<div class="h-free serif">' + (busy ? '<i>Nothing</i> else' : '<i>Free</i> the rest of the day') + '</div>') +
          '</div>';
      }).join(''));
  }

  function ring(done, total, size) {
    var r = size / 2 - 5, c = 2 * Math.PI * r, f = total ? done / total : 0;
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-fg" stroke-dasharray="' + (c * f) + ' ' + c + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
  }
  App.ring = ring;

  // Bottom-row card head: icon disc, then the label text (cut with an ellipsis, never wrapped)
  function head(icon, text) {
    return '<div class="label h-tile-h"><span class="h-ico">' + App.icon(icon, 20) + '</span><span class="h-tile-t">' + text + '</span></div>';
  }

  // Something expires today: the Fridge card turns alert (PRODUCT.md: alert is for "expiring"). "Tomorrow" is copper.
  // In the evening the card stays glass with an alert edge (css): a full fill was the brightest thing in a dim kitchen.
  function fridgeHot() {
    return fridgeRows(D.fridge, App.now()).some(function (r) { return r.state === 'soon' && r.left === 0; });
  }
  function paintFridge(card) {
    card.classList.toggle('is-alert', fridgeHot());
    name(card, fridge());
  }

  function shopping() {
    var open = D.groceries.filter(function (g) { return !g.done; });
    var recent = open.slice(-3).reverse();
    if (!open.length) return ageTag('shopping') + head('cart', 'Shopping') + calm('All stocked up.', 'Nothing left to buy.');
    return ageTag('shopping') + head('cart', 'Shopping') +
      '<div class="h-stat"><span class="num">' + open.length + '</span><small>items to get</small></div>' +
      '<ul class="h-recent">' + recent.map(function (g) {
        return '<li><i></i><span class="h-name">' + App.esc(g.name) + '</span></li>';
      }).join('') + '</ul>';
  }

  // Bottom-row cards share one anatomy: label, one stat line, list. An empty card puts its phrase in the stat
  // line (same height as a count), so lists and rules line up across the row whatever each card holds.
  function calm(word, note) {
    return '<div class="h-stat"><span class="h-word serif">' + word + '</span></div>' + (note ? '<p class="h-note">' + note + '</p>' : '');
  }

  // Open chores in the Chores view's order (App.choreSort: late, due soon, timed, untimed). Dot = whose chore.
  function chores() {
    var open = D.chores.filter(function (c) { return !c.done; }).sort(App.choreSort);
    return ageTag('chores') + head('tasks', 'Chores') +
      '<div class="h-stat"><span class="num">' + open.length + '</span><small>' + (open.length ? 'to do today' : 'all done today') + '</small></div>' +
      '<ul class="h-recent">' + open.slice(0, 3).map(function (c) {
        return '<li style="' + App.pstyle(c.who) + '"><i class="h-who"></i><span class="h-name">' + App.esc(c.title) + '</span>' +
          (App.choreWhen(c) ? '<span class="h-exp' + (App.choreState(c) === 'late' ? ' is-over' : App.choreState(c) === 'soon' ? ' is-due' : '') + '">' + App.esc(App.choreWhen(c)) + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
  }

  function fridge() {
    var inside = fridgeRows(D.fridge, App.now());
    if (!inside.length) return ageTag('fridge') + head('fridge', 'Fridge') + calm(D.fridge.length ? 'All used up.' : 'No receipts yet.', D.fridge.length ? '' : 'The next REWE shop lands here.');
    var soon = inside.filter(function (r) { return r.state === 'soon'; });
    var newest = inside.slice().sort(function (a, b) { return a.newest - b.newest; }); // nothing urgent: the latest shop
    var last = newest[0].newest;
    // The label stays "Fridge" (a phrase there truncated); the stat line says what to eat, else when we shopped
    var shopped = 'shopped ' + (last <= 0 ? 'today' : last === 1 ? 'yesterday' : last + ' days ago');
    return ageTag('fridge') + head('fridge', 'Fridge') +
      '<div class="h-stat"><span class="num">' + inside.length + '</span><small>' + (inside.length === 1 ? 'item' : 'items') +
      (soon.length ? ' · <b class="h-due">' + soon.length + ' to use soon</b>' : ' · ' + shopped) + '</small></div>' +
      '<ul class="h-recent">' + (soon.length ? soon : newest).slice(0, 3).map(function (r) {
        return '<li><i></i><span class="h-name">' + App.esc(r.label) + '</span>' + (r.state !== 'soon' ? '' : '<span class="h-exp' + (r.left <= 1 ? ' is-due' : '') + '">' +
          (r.left === 0 ? 'Today' : r.left === 1 ? 'Tomorrow' : '~' + r.left + ' days') + '</span>') + '</li>';
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
    // One format per list: minutes ("12 min") while every train is within the hour, otherwise all clock times,
    // so "37m" never sits above "15:22"
    var clockTimes = deps.some(function (d) { return d.when - now >= 3600000; });
    return '<div class="label">Transit · ' + App.esc(tr.stop) + '</div>' +
      '<div class="h-dep-list">' + deps.map(function (d) {
        var mins = Math.round((d.when - now) / 60000);
        return '<div class="h-dep">' +
          '<span class="h-dep-line h-dep-line--' + d.product + '"' + lineStyle(d.line) + '>' + App.esc(d.line) + '</span>' +
          '<span class="h-dep-dir">' + App.esc(d.direction) + '</span>' +
          '<b class="num h-dep-min">' + (clockTimes ? App.fmt.time(d.when) : mins <= 0 ? 'now' : mins + '<small> min</small>') + '</b>' +
          '</div>';
      }).join('') + '</div>' + ageLine;
  }

  // Fill a whole-card button and give it a short accessible name ("Fridge · shopped yesterday, 15 items"),
  // so a screen reader doesn't read every row as the button's name
  function name(card, html) {
    card.innerHTML = html;
    var l = card.querySelector('.label'), s = card.querySelector('.h-stat');
    card.setAttribute('aria-label', (l ? l.textContent : '') + (s ? ', ' + [].map.call(s.children, function (c) { return c.textContent; }).join(' ') : ''));
  }

  // Both lists empty: shop + fridge shrink and the photo takes twice their width (CSS: .home[data-lean]).
  function lean() {
    V.el.firstChild.toggleAttribute('data-lean', !D.groceries.some(function (g) { return !g.done; }) && !D.fridge.some(function (f) { return !f.used; }));
  }

  function paint() {
    var el = V.el;
    lean();
    el.querySelector('.h-clock').innerHTML = clock();
    el.querySelector('.h-weather').innerHTML = weather();
    el.querySelector('.h-hero-slot').innerHTML = hero();
    el.querySelector('.h-lanes').innerHTML = lanes();
    if (App.enabled('shopping')) name(el.querySelector('.h-shop'), shopping());
    el.querySelector('.h-transit').innerHTML = transit();
    if (App.enabled('fridge')) paintFridge(el.querySelector('.h-fridge'));
    if (App.enabled('tasks')) name(el.querySelector('.h-chores'), chores());
  }

  function photoCaption(s) {
    var m = App.photoMeta(s.photos[0]);
    // Place, then when: one line each. The kicker already says "… years ago today", so no "On this day ·" prefix;
    // on the day itself it takes the photo orange instead.
    V.el.querySelector('.h-photo-cap').innerHTML = '<span>' + App.esc(m.place) + '</span><b' + (m.onThisDay ? ' class="is-day"' : '') + '>' + m.kicker + '</b>';
  }

  App.register('home', {
    show: function (el) {
      V.el = el;
      if (!el.firstChild) {
        el.innerHTML = '<div class="home">' +
          // no aria-label: it would replace the time and date as the name, so a screen reader never said the time
          '<div class="h-clock" data-go="calendar" role="button" tabindex="0"></div>' +
          '<div class="h-weather card"></div>' +
          '<div class="h-transit card"></div>' +
          '<div class="h-hero-slot"></div>' +
          '<div class="h-lanes card" style="grid-template-columns:repeat(' + D.people.length + ',1fr)"></div>' +
          '<div class="h-row">' +
          // whole cards open their view; role + tabindex so a screen reader or keyboard can reach them too
          '<div class="h-shop card" data-go="shopping" role="button" tabindex="0"></div>' +
          '<div class="h-fridge card" data-go="fridge" role="button" tabindex="0"></div>' +
          '<div class="h-chores card" data-go="tasks" role="button" tabindex="0"></div>' +
          '<button class="h-photo" data-go="photos"><div class="h-photo-stage"></div><div class="h-photo-cap"></div></button>' +
          '</div></div>';
        el.addEventListener('keydown', function (e) {
          if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute('role') === 'button') { e.preventDefault(); e.target.click(); }
        });
        el.addEventListener('click', function (e) {
          var m = e.target.closest('[data-meal]');
          if (m) { App.recipeSheet(m.dataset.meal); return; }
          var ev = e.target.closest('[data-ev]');
          if (ev) { App.eventSheet(App.findEvent(ev.dataset.ev)); return; }
          var g = e.target.closest('[data-go]');
          if (g) App.go(g.dataset.go);
        });
        // w 640: the tile is ~257 px wide, ~540 px when the lists are empty (data-lean)
        V.slides = new App.Slideshow(el.querySelector('.h-photo-stage'), { captions: false, interval: 12000, w: 640, onChange: photoCaption });
      }
      paint();
      slides();
    },
    resume: slides,
    hide: function () { if (V.slides) V.slides.stop(); }
  });
  // The tile only cycles while it can be seen: Home on screen, photos on, day mode. Ambient and Night cover it
  // (and Ambient runs its own slideshow), so it used to keep loading a photo every 12 s all night for no one.
  function slides() {
    if (!V.slides) return;
    if (App.current === 'home' && App.enabled('photos') && App.mode === 'day') V.slides.start(); else V.slides.stop();
  }
  App.on('mode', slides);
  // Every minute: just the clock and next-up countdown (cheap, even while hidden). Weather on the hour.
  App.on('minute', function (n) {
    if (!V.el || !V.el.firstChild) return;
    V.el.querySelector('.h-clock').innerHTML = clock();
    V.el.querySelector('.h-hero-slot').innerHTML = hero();
    V.el.querySelector('.h-transit').innerHTML = transit();
    if (App.enabled('tasks')) name(V.el.querySelector('.h-chores'), chores()); // "18:00" becomes "Late · 18:00" on time
    if (n.getMinutes() === 0) { V.el.querySelector('.h-weather').innerHTML = weather(); V.el.querySelector('.h-lanes').innerHTML = lanes(); }
    ages();
  });
  App.on('data', function () { if (App.current === 'home') paint(); });
  App.on('fridge', function () { if (App.current === 'home' && App.enabled('fridge')) { lean(); paintFridge(V.el.querySelector('.h-fridge')); } });
  App.on('chores', function () { if (App.current === 'home' && App.enabled('tasks')) name(V.el.querySelector('.h-chores'), chores()); });
  App.on('views', function () {
    if (!V.el || !V.el.firstChild) return;
    paint();
    slides();
  });
})();
