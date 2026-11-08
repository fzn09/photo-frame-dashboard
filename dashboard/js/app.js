// Core shell: router, demo clock, idle/ambient, toasts, sheets, helpers.
(function () {
  'use strict';
  var D = window.DATA;
  var App = window.App = { state: D, views: {}, current: null, mode: 'day', calMode: 'normal' };
  var $ = App.$ = function (s, r) { return (r || document).querySelector(s); };
  App.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // Demo UI (clock long-press panel, keyboard shortcuts, startup tip) is off in kiosk mode.
  // ?demo turns it on (remembered), ?demo=0 off, same pattern as ?diag.
  App.demo = (function () {
    var q = location.search.match(/[?&]demo(=([^&]*))?/);
    try {
      if (q) localStorage.setItem('hq-demo', q[2] === '0' ? '0' : '1');
      return localStorage.getItem('hq-demo') === '1';
    } catch (e) { return !!q && q[2] !== '0'; }
  })();

  // ------------------------------------------------------------ events
  var handlers = {};
  App.on = function (e, fn) { (handlers[e] = handlers[e] || []).push(fn); };
  App.emit = function (e, a) { (handlers[e] || []).forEach(function (fn) { fn(a); }); };

  // ------------------------------------------------------------ time (demo clock)
  var offset = 0;
  App.now = function () { return new Date(Date.now() + offset); };
  App.setTime = function (h, m) {
    if (h == null) offset = 0;
    else { var d = new Date(); d.setHours(h, m, 0, 0); offset = d - Date.now(); }
    lastMin = -1;
    App.emit('time');
    App.rerender();
  };
  App.dayStart = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  App.addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  App.sameDay = function (a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
  App.isNight = function () { var h = App.now().getHours(); return h >= 22 || h < 6; };

  // Light by day (Silver & Walnut), dark from sunset to 07:00 (Walnut Evening). Sunset comes from the weather feed;
  // 18:00 until it has loaded. ?theme=midnight pins the original all-dark palette. Sets html[data-theme]; runs at boot and every minute.
  App.applyTheme = function () {
    var n = App.now(), h = n.getHours() + n.getMinutes() / 60, sun = D.weather && D.weather.sun && D.weather.sun.split(':');
    var dusk = sun ? +sun[0] + sun[1] / 60 : 18;
    if (isNaN(dusk)) dusk = 18;
    var t = /[?&]theme=midnight/.test(location.search) ? 'midnight' : h >= dusk || h < 7 ? 'dark' : 'light';
    if (document.documentElement.dataset.theme !== t) document.documentElement.dataset.theme = t;
  };

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  App.fmt = {
    // 24-hour clock, as in Berlin: "07:05", "16:30". The old second argument (AM/PM switch) is ignored.
    time: function (d) {
      var h = d.getHours(), m = d.getMinutes();
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    },
    hour: function (d) { return App.fmt.time(d); },
    range: function (a, b) { return App.fmt.time(a) + ' – ' + App.fmt.time(b); },
    day: function (d) { return DAYS[d.getDay()]; },
    dayShort: function (d) { return DAYS[d.getDay()].slice(0, 3); },
    month: function (d) { return MONTHS[d.getMonth()]; },
    monthShort: function (d) { return MON_SHORT[d.getMonth()]; },
    mins: function (m) {
      m = Math.max(0, Math.round(m));
      if (m < 60) return m + ' min';
      var h = Math.floor(m / 60), r = m % 60;
      return h + ' hr' + (r ? ' ' + r + ' min' : '');
    },
    rel: function (d) {
      var t = App.dayStart(App.now()), x = App.dayStart(d), diff = Math.round((x - t) / 864e5);
      if (diff === 0) return 'Today';
      if (diff === 1) return 'Tomorrow';
      if (diff === -1) return 'Yesterday';
      return DAYS[d.getDay()];
    }
  };
  App.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // ------------------------------------------------------------ icons + people
  App.icon = function (name, size, cls) {
    size = size || 24;
    return '<svg class="i ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (window.ICONS[name] || '') + '</svg>';
  };
  App.person = function (id) {
    if (id === 'family' || id === 'any') return D.family;
    for (var i = 0; i < D.people.length; i++) if (D.people[i].id === id) return D.people[i];
    return D.family;
  };
  App.pstyle = function (p) {
    if (typeof p === 'string') p = App.person(p);
    return '--c:' + p.color + ';--c-rgb:' + p.rgb + ';--c-ink:' + p.ink;
  };
  App.avatar = function (p, size, cls) {
    if (typeof p === 'string') p = App.person(p);
    size = size || 48;
    // the 16 px type floor holds for initials too
    return '<span class="avatar ' + (cls || '') + '" style="' + App.pstyle(p) + ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.max(16, Math.round(size * 0.46)) + 'px">' + (p.id === 'family' ? '★' : p.name[0]) + '</span>';
  };
  App.dots = function (ids, size) {
    return '<span class="dots">' + ids.map(function (id) { return '<i style="' + App.pstyle(id) + (size ? ';width:' + size + 'px;height:' + size + 'px' : '') + '"></i>'; }).join('') + '</span>';
  };

  // ------------------------------------------------------------ calendar helpers
  App.events = function () {
    var list = D.events.slice();
    var today = App.dayStart(App.now());
    if (App.calMode === 'busy') list = list.concat(D.busyExtras);
    if (App.calMode === 'empty') list = list.filter(function (e) { return e.allDay || !App.sameDay(e.start, today); });
    return list;
  };
  App.isFamily = function (e) { return e.people.length >= D.people.length; };
  App.evColor = function (e) { return App.isFamily(e) ? D.family : App.person(e.people[0]); };
  App.timedOn = function (day, pid) {
    var s = App.dayStart(day), e = App.addDays(s, 1);
    return App.events().filter(function (ev) {
      return !ev.allDay && ev.start < e && ev.end > s && (!pid || ev.people.indexOf(pid) > -1);
    }).sort(function (a, b) { return a.start - b.start || b.end - a.end; });
  };
  App.allDayOn = function (day, pid) {
    var s = App.dayStart(day), e = App.addDays(s, 1);
    return App.events().filter(function (ev) {
      return ev.allDay && ev.start < e && ev.end > s && (!pid || ev.people.indexOf(pid) > -1);
    });
  };
  App.leaveBy = function (e) { return e.travel ? new Date(+e.start - e.travel * 60000) : e.start; };
  // The next thing someone needs to act on: earliest upcoming "leave by" today.
  App.nextEvent = function () {
    var now = App.now();
    var list = App.timedOn(now).filter(function (e) { return e.start > now; });
    list.sort(function (a, b) { return App.leaveBy(a) - App.leaveBy(b); });
    return list[0] || null;
  };
  App.findEvent = function (id) {
    return App.events().filter(function (e) { return e.id === id; })[0];
  };

  // ------------------------------------------------------------ weather helpers
  App.weatherNow = function () {
    var W = D.weather, h = App.now().getHours();
    var rainAt = -1;
    for (var i = h; i < 24; i++) if (W.p[i] >= 50) { rainAt = i; break; }
    // The line is about rain only: the sky is the condition label beside it, so "Clear" here once sat next to "Overcast".
    // The hourly feed covers today to 23:00, hence "today" and "midnight" rather than "all day".
    var summary, advice;
    if (rainAt === h) {
      var stop = h; while (stop < 24 && W.p[stop] >= 50) stop++;
      summary = 'Rain until ' + (stop === 24 ? 'midnight' : App.fmt.hour(new Date(2000, 0, 1, stop)));
      advice = 'Umbrella weather';
    } else if (rainAt > -1) {
      summary = 'Rain from ' + App.fmt.hour(new Date(2000, 0, 1, rainAt));
      advice = 'Grab a rain jacket';
    } else {
      summary = 'No rain today';
      advice = W.t[h] < 12 ? 'Jacket weather' : 'Light layers';
    }
    var labels = { sun: 'Sunny', moon: 'Clear', partly: 'Partly cloudy', cloud: 'Overcast', rain: 'Rain' };
    return { temp: W.t[h], cond: W.c[h], label: labels[W.c[h]], hi: W.hi, lo: W.lo, summary: summary, advice: advice, wet: rainAt > -1, hour: h };
  };
  App.hourly = function (count) {
    var W = D.weather, h = App.now().getHours(), out = [];
    // Hours past midnight come from tomorrow (indexes 24-47). Never wrap to index 0: that is this morning, not tomorrow's.
    // A feed with only today's 24 hours shows fewer columns late in the evening instead of wrong ones.
    for (var i = 0; i < count && h + i < W.t.length; i++) {
      var x = h + i, hh = x % 24;
      // The hour alone, 24 h ("09", "13", "00"): ":00" on every column was a wall of digits in a 64 px column
      out.push({ h: hh, t: W.t[x], c: W.c[x], p: W.p[x], label: i === 0 ? 'Now' : (hh < 10 ? '0' : '') + hh });
    }
    return out;
  };

  // ------------------------------------------------------------ router
  App.register = function (name, view) { App.views[name] = view; };
  // Views are built once and kept laid out (hidden with content-visibility), so switching tabs
  // only has to paint. A view is rebuilt when its data changed ('data'/'time' events) or, for
  // time-sensitive views (minutely: true), when the minute has rolled over since it was built.
  function minuteKey() { return Math.floor(App.now().getTime() / 60000); }
  function build(name, opts) {
    var view = App.views[name];
    view.show($('#view-' + name), opts || {});
    view._built = true; view._dirty = false; view._min = minuteKey();
  }
  // Which views are shown: D.views (default in data.js, overridden by the cached list and by the Worker's
  // /api/config). Disabled views are not built.
  App.enabled = function (name) { return D.views.indexOf(name) > -1; };
  App.setViews = function (list) {
    if (!Array.isArray(list)) return;
    list = list.filter(function (n) { return n !== 'home' && $('#view-' + n); });
    D.views = ['home'].concat(list);
    App.$$('.rail-item').forEach(function (b) { b.hidden = !App.enabled(b.dataset.go); });
    // CSS hook: Today hides the cards of views that are off (.stage[data-off~="tasks"] .h-photo)
    $('#stage').dataset.off = App.$$('.view[data-view]').map(function (v) { return v.dataset.view; })
      .filter(function (n) { return !App.enabled(n); }).join(' ');
    try { localStorage.setItem('hq-views', D.views.join(',')); } catch (e) { /* private mode: just not cached */ }
    if (App.current && !App.enabled(App.current)) App.go('home');
    App.emit('views');
  };

  App.go = function (name, opts) {
    opts = opts || {};
    if (!App.views[name] || !App.enabled(name)) name = 'home';
    if (App.current && App.current !== name && App.views[App.current].hide) App.views[App.current].hide();
    App.$$('.view').forEach(function (v) { v.classList.toggle('is-active', v.dataset.view === name); });
    App.$$('.rail-item').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.go === name);
      if (b.dataset.go === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    App.current = name;
    var view = App.views[name];
    if (!view._built || view._dirty || opts.rerender || (view.minutely && view._min !== minuteKey())) build(name, opts);
    else if (view.resume) view.resume($('#view-' + name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  };
  function markStale() {
    Object.keys(App.views).forEach(function (k) { if (k !== App.current) App.views[k]._dirty = true; });
  }
  App.on('data', markStale);
  App.on('time', markStale);
  App.rerender = function () {
    if (App.current) App.views[App.current].show($('#view-' + App.current), { rerender: true });
  };

  // ------------------------------------------------------------ toasts (single, with undo or one action)
  // opts.undo = fn (an Undo button), or opts.action = { label: html, fn }
  var toastTimer;
  App.toast = function (html, opts) {
    opts = opts || {};
    var box = $('#toasts');
    box.innerHTML = '';
    clearTimeout(toastTimer);
    var ms = opts.ms || 5000;
    var act = opts.action || (opts.undo && { label: App.icon('undo', 22) + 'Undo', fn: opts.undo });
    var t = document.createElement('div');
    t.className = 'toast' + (opts.tone ? ' toast--' + opts.tone : '');
    t.style.setProperty('--ms', ms + 'ms');
    t.innerHTML = (opts.icon ? App.icon(opts.icon, 26) : '') + '<span class="toast-msg">' + html + '</span>' +
      (act ? '<button class="toast-undo">' + act.label + '</button>' : '');
    box.appendChild(t);
    t.classList.add('is-in');
    function kill() { t.remove(); }
    toastTimer = setTimeout(kill, ms);
    if (act) t.querySelector('.toast-undo').addEventListener('click', function () { clearTimeout(toastTimer); act.fn(); kill(); });
  };

  // ------------------------------------------------------------ sheets (modal cards)
  App.sheet = function (html, opts) {
    opts = opts || {};
    var layer = $('#sheetLayer');
    layer.innerHTML = '<div class="sheet-scrim"></div><div class="sheet ' + (opts.cls || '') + '">' +
      '<button class="sheet-x" data-close aria-label="Close">' + App.icon('x', 28) + '</button>' + html + '</div>';
    layer.classList.add('is-open');
    var box = layer.querySelector('.sheet'), h = box.querySelector('h1, h2');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    if (h) box.setAttribute('aria-label', h.textContent); // About sets aria-labelledby itself, which wins
    layer.querySelector('.sheet-x').focus({ preventScroll: true }); // screen readers start inside the sheet
    function close() {
      if (!layer.classList.contains('is-open')) return;
      layer.classList.remove('is-open');
      if (opts.onClose) opts.onClose();
      layer.innerHTML = '';
    }
    App.closeSheet = close;
    layer.querySelector('.sheet-scrim').addEventListener('click', close);
    App.$$('[data-close]', layer).forEach(function (b) { b.addEventListener('click', close); });
    if (opts.onMount) opts.onMount(layer.querySelector('.sheet'), close);
    return close;
  };
  App.closeSheet = function () {};

  // Stage-local coordinates for an element's center (stage may be scaled on desktop)
  App.centerOf = function (el) {
    var stage = $('#stage').getBoundingClientRect(), r = el.getBoundingClientRect(), k = stage.height / 800;
    return { x: (r.left + r.width / 2 - stage.left) / k, y: (r.top + r.height / 2 - stage.top) / k };
  };

  // ------------------------------------------------------------ press-and-hold
  App.hold = function (el, ms, cb) {
    var t = null;
    el.style.setProperty('--hold', ms + 'ms');
    el.addEventListener('pointerdown', function () {
      if (cb.enabled && !cb.enabled()) return;
      el.classList.add('is-holding');
      t = setTimeout(function () { t = null; el.classList.remove('is-holding'); eatRelease(); cb.done(); }, ms);
    });
    // done() runs with the finger still down. Its release would land as a click on whatever done() opened (the
    // About sheet's scrim) and close it at once, so the click that follows this press is swallowed.
    function eatRelease() {
      function eat(e) { e.stopPropagation(); e.preventDefault(); }
      // If neither pointerup nor pointercancel ever arrives, every tap would be eaten until the 3 a.m. reload:
      // give up after 5 s whatever happens (a finger still down by then loses the protection, nothing worse).
      var guard = setTimeout(end, 5000);
      function end() {
        clearTimeout(guard);
        document.removeEventListener('pointerup', end, true);
        document.removeEventListener('pointercancel', end, true);
        setTimeout(function () { document.removeEventListener('click', eat, true); }, 400); // a long press may send no click
      }
      document.addEventListener('click', eat, true);
      document.addEventListener('pointerup', end, true);
      document.addEventListener('pointercancel', end, true);
    }
    function cancel(e) {
      if (!t) return;
      clearTimeout(t); t = null;
      el.classList.remove('is-holding');
      if (cb.cancel && e.type === 'pointerup') cb.cancel();
    }
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
  };

  // ------------------------------------------------------------ modes: day / ambient / night
  App.setMode = function (m) {
    var stage = $('#stage');
    App.mode = m;
    stage.dataset.mode = m;
    App.emit('mode', m);
  };

  // ------------------------------------------------------------ idle
  App.idle = { home: 300, ambient: 600 };
  var idleSec = 0;
  function onIdleTick() {
    idleSec++;
    var blocked = $('#takeover').classList.contains('is-open');
    if (App.mode !== 'day' || blocked) return;
    if (idleSec === App.idle.home && App.current !== 'home') { App.closeSheet(); App.go('home'); }
    if (idleSec >= App.idle.ambient) {
      App.closeSheet();
      App.go('home');
      App.setMode(App.isNight() ? 'night' : 'ambient');
    }
  }
  App.resetIdle = function () { idleSec = 0; };
  // Idle only ever enters night (above); nothing left it until a touch. Follow the clock both ways untouched.
  App.on('minute', function () {
    if (App.mode === 'night' && !App.isNight()) App.setMode('ambient');
    else if (App.mode === 'ambient' && App.isNight()) App.setMode('night');
  });

  // ------------------------------------------------------------ stage scaling
  // Designed at 1280×800. Screens wider than 16:10 (e.g. 1920×1080 frames) widen the stage to their
  // aspect instead of pillarboxing; narrower screens letterbox as before.
  var STAGE_H = 800, STAGE_MIN_W = 1280;
  function fit() {
    var stage = $('#stage');
    var w = Math.max(STAGE_MIN_W, Math.round(STAGE_H * window.innerWidth / window.innerHeight));
    stage.style.setProperty('--stage-w', w + 'px');
    var s = Math.min(window.innerWidth / w, window.innerHeight / STAGE_H);
    stage.style.transform = Math.abs(s - 1) < 0.01 ? '' : 'scale(' + s + ')';
  }

  // ------------------------------------------------------------ clock tick
  var lastMin = -1;
  function tick() {
    var n = App.now();
    App.emit('second', n);
    if (n.getMinutes() !== lastMin) {
      lastMin = n.getMinutes();
      $('#railClock').innerHTML = '<b>' + App.fmt.time(n) + '</b>';
      App.emit('minute', n);
    }
    onIdleTick();
  }

  // Reload once a day in the 3 a.m. hour to clear slow leaks on the 1 GB frame. The uptime check stops a
  // reload loop within that hour. Real time, not App.now(), which demo mode can shift.
  var bootAt = Date.now();
  App.on('minute', App.applyTheme);
  App.on('data', App.applyTheme); // sunset arrives with the weather feed
  App.on('time', App.applyTheme); // demo clock jumps
  App.on('minute', function () {
    if (new Date().getHours() === 3 && Date.now() - bootAt > 3600000) location.reload();
  });

  // ------------------------------------------------------------ boot
  App.start = function () {
    App.applyTheme(); // before the first paint of any view
    fit(); // clock is live (offset 0); with ?demo, long-press the rail clock for demo times
    window.addEventListener('resize', fit);
    var cached = null;
    // dev server has no /api/config to correct a stale cache, so it uses data.js's default
    try { if (!import.meta.env.DEV) cached = localStorage.getItem('hq-views'); } catch (e) { /* default list */ }
    App.setViews(cached ? cached.split(',') : D.views.slice(1)); // before the first App.go: no flash of hidden views
    // Switch tabs the instant a finger lands (pointerdown), not on release. Keyboard "clicks"
    // (detail === 0) still work.
    $('#rail').addEventListener('pointerdown', function (e) {
      var b = e.target.closest('[data-go]');
      if (b && e.button === 0) App.go(b.dataset.go);
    });
    $('#rail').addEventListener('click', function (e) {
      var b = e.target.closest('[data-go]');
      if (b && e.detail === 0) App.go(b.dataset.go);
    });
    document.addEventListener('pointerdown', App.resetIdle, true);
    // Keyboard modality for the focus ring (base.css .kbd): on with a navigation key, off with any touch or click
    document.addEventListener('keydown', function (e) { if (/^(Tab|Enter| |Arrow)/.test(e.key)) document.documentElement.classList.add('kbd'); }, true);
    document.addEventListener('pointerdown', function () { document.documentElement.classList.remove('kbd'); }, true);
    window.addEventListener('hashchange', function () { App.go(location.hash.slice(1)); });
    App.go(location.hash.slice(1) || 'home');
    tick();
    setInterval(tick, 1000);
    App.emit('ready');
    if (App.demo) setTimeout(function () { App.toast('Tip: press and hold the <b>clock</b> in the sidebar for demo controls', { ms: 6000, icon: 'bolt' }); }, 1200);
  };
  document.addEventListener('DOMContentLoaded', function () { App.start(); });
})();
