// Kitchen: pocket calculator (left), conversions of the number on screen + countdown timers (right).
// Works offline: no fetches. Timers tick off App's 'second' event and live here, so they keep running
// on other views; a finished one wakes the screen, jumps here and beeps every 5 s for a minute.
import { CALC0, press, fmt, CONV, convert } from '../../calc.js';

(function () {
  'use strict';
  var V = { el: null, line: '' };
  var S = CALC0;
  var T = [], tid = 0, MAX = 3;
  var PRESETS = [1, 3, 5, 10, 15];
  var OPS = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  var KEYS = [['C', 'C'], ['back', '⌫'], ['%', '%'], ['/', '÷'], ['7'], ['8'], ['9'], ['*', '×'],
    ['4'], ['5'], ['6'], ['-', '−'], ['1'], ['2'], ['3'], ['+', '+'], ['0'], ['.'], ['=', '=']];

  // ---- calculator
  function paintCalc() {
    V.el.querySelector('.k-display').textContent = S.display;
    V.el.querySelector('.k-line').textContent = S.op ? fmt(S.acc) + ' ' + OPS[S.op] : V.line;
    App.$$('[data-key]', V.el).forEach(function (b) { b.classList.toggle('is-op', S.fresh && S.op === b.dataset.key); });
  }
  function conv(id) {
    var x = +S.display, c = CONV[id];
    if (S.display === 'Error') return;
    var y = convert(id, x);
    S = { display: fmt(y), acc: null, op: null, fresh: true };
    V.line = c[2] ? fmt(x) + ' ' + c[2] + ' = ' + fmt(y) + ' ' + c[3] : fmt(x) + ' ' + c[0] + ' = ' + fmt(y);
  }

  // ---- timers
  var ctx;
  function audio() { // only a tap may start WebView audio, so the context is made on one
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!ctx && AC) ctx = new AC();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  function beep() {
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    [0, 0.25, 0.5].forEach(function (d) {
      var o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + d;
      o.frequency.value = 880;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.4, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
      o.start(t0); o.stop(t0 + 0.2);
    });
  }
  function mmss(t) {
    var s = Math.max(0, Math.ceil((t.end - Date.now()) / 1000)), m = Math.floor(s / 60);
    return m + ':' + ('0' + (s % 60)).slice(-2);
  }
  function label(t) { return t.mins < 1 ? Math.round(t.mins * 60) + ' s' : fmt(t.mins) + ' min'; }
  function start(mins) {
    if (!(mins > 0) || mins > 600) return App.toast('Timers run from a few seconds up to 600 min', { icon: 'clock', ms: 3000 });
    if (T.length >= MAX) return App.toast(MAX + ' timers at most · clear one first', { icon: 'clock', ms: 3000 });
    T.push({ id: ++tid, mins: mins, end: Date.now() + mins * 60000, done: false });
    paintTimers();
  }
  function timerHTML(t) {
    if (t.done) return '<button class="k-timer is-done" data-tx="' + t.id + '">' + App.icon('bell', 34) + '<b class="k-t-time">Done</b><span class="label">' + label(t) + ' · tap to clear</span></button>';
    return '<div class="k-timer" data-t="' + t.id + '"><b class="k-t-time num">' + mmss(t) + '</b><span class="label">' + label(t) + '</span>' +
      '<button class="btn" data-tplus="' + t.id + '">+1 min</button>' +
      '<button class="k-t-x" data-tx="' + t.id + '" aria-label="Cancel">' + App.icon('x', 26) + '</button></div>';
  }
  function paintTimers() {
    var box = V.el && V.el.querySelector('.k-timers');
    if (box) box.innerHTML = T.length ? T.map(timerHTML).join('') : '<div class="k-none">No timers running</div>';
  }
  function ring(t) {
    if (App.mode !== 'day') App.setMode('day');
    App.resetIdle();
    App.closeSheet();
    App.go('kitchen');
    App.toast('<b>' + label(t) + '</b> timer is done', { tone: 'error', icon: 'bell', ms: 10000 });
  }
  App.on('second', function () {
    if (!T.length) return;
    var now = Date.now(), changed = false;
    T.forEach(function (t) {
      if (!t.done && now >= t.end) { t.done = true; t.doneAt = t.nextBeep = now; changed = true; ring(t); }
      // beep every 5 s for a minute; time-based so a skipped tick on the slow A33 doesn't drop one.
      // Holding off idle meanwhile keeps the Done card on screen.
      if (t.done && now - t.doneAt < 60000) {
        App.resetIdle();
        if (now >= t.nextBeep) { beep(); t.nextBeep += 5000; }
      }
    });
    if (changed) return paintTimers();
    if (V.el) App.$$('.k-timer[data-t]', V.el).forEach(function (el) {
      var t = T.filter(function (x) { return x.id === +el.dataset.t; })[0];
      if (t) el.querySelector('.k-t-time').textContent = mmss(t);
    });
  });

  function render() {
    V.el.innerHTML = '<div class="kitchen">' +
      '<section class="k-calc">' +
      '  <div class="k-screen"><div class="k-line"></div><div class="k-display num"></div></div>' +
      '  <div class="k-keys">' + KEYS.map(function (k) {
        return '<button class="k-key' + (OPS[k[0]] || k[0] === 'C' || k[0] === 'back' || k[0] === '%' ? ' k-key--fn' : '') + (k[0] === '=' ? ' k-key--eq' : '') + (k[0] === '0' ? ' k-key--wide' : '') +
          '" data-key="' + k[0] + '">' + (k[1] || k[0]) + '</button>';
      }).join('') + '</div>' +
      '</section>' +
      '<section class="k-side">' +
      '  <div class="label">Convert the number on screen</div>' +
      '  <div class="k-conv">' + Object.keys(CONV).map(function (id) { return '<button class="k-chip" data-conv="' + id + '">' + CONV[id][0] + '</button>'; }).join('') + '</div>' +
      '  <div class="label">Timers</div>' +
      '  <div class="k-presets">' + PRESETS.map(function (m) { return '<button class="k-chip" data-preset="' + m + '">' + m + ' min</button>'; }).join('') +
      '    <button class="k-chip k-chip--screen" data-preset="screen">' + App.icon('clock', 20) + ' Screen min</button></div>' +
      '  <div class="k-timers"></div>' +
      '</section></div>';
    paintCalc();
    paintTimers();
  }

  function onClick(e) {
    var t;
    audio();
    if ((t = e.target.closest('[data-key]'))) { S = press(S, t.dataset.key); V.line = ''; return paintCalc(); }
    if ((t = e.target.closest('[data-conv]'))) { conv(t.dataset.conv); return paintCalc(); }
    if ((t = e.target.closest('[data-preset]'))) return start(t.dataset.preset === 'screen' ? +S.display : +t.dataset.preset);
    if ((t = e.target.closest('[data-tplus]'))) {
      var p = T.filter(function (x) { return x.id === +t.dataset.tplus; })[0];
      if (p) { p.end += 60000; p.mins += 1; paintTimers(); }
      return;
    }
    if ((t = e.target.closest('[data-tx]'))) {
      T = T.filter(function (x) { return x.id !== +t.dataset.tx; });
      paintTimers();
    }
  }

  App.register('kitchen', {
    show: function (el) {
      if (!V.el) { V.el = el; el.addEventListener('click', onClick); }
      render();
    }
  });
})();
