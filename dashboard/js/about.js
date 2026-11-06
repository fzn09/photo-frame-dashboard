// About sheet (hold the rail clock) + stale-bundle check against /version.json.
// __BUILD__ is injected by vite.config.js from git at build time.
(function () {
  'use strict';
  var B = typeof __BUILD__ !== 'undefined' ? __BUILD__ : null;
  var stale = false, checks = 0, fmtDate, fmtTime, bootAt = Date.now();
  var seen = { ok: null, at: 0 }; // last version check: ok = true/false, null = not asked yet
  var DISMISS_MS = 60000;         // an unattended frame must not sit on this sheet for hours

  function checkVersion(done) {
    if (!B) return done && done();
    fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (v) { if (v && v.id) { stale = v.id !== B.id; seen = { ok: true, at: Date.now() }; } else seen.ok = false; })
      .catch(function () { seen.ok = false; }) // offline or dev server: keep the last stale answer, but say we could not ask
      .then(function () { if (done) done(); });
  }

  function when(iso) {
    fmtDate = fmtDate || new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    return fmtDate.format(new Date(iso));
  }
  function clock(ms) {
    fmtTime = fmtTime || new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    return fmtTime.format(new Date(ms));
  }

  function statusText() {
    if (stale) return 'Update ready · refreshes when the frame is idle';
    if (seen.ok) return 'Up to date · checked ' + clock(seen.at);
    if (seen.ok === false) return 'Couldn’t check (offline)' + (seen.at ? ' · last checked ' + clock(seen.at) : '');
    return 'Checking…';
  }
  function paintStatus() {
    var el = document.querySelector('.about-status');
    if (!el) return;
    el.textContent = statusText();
    el.classList.toggle('is-stale', stale);
  }

  function html() {
    if (!B) return '<div class="sheet-pad about"><h2 class="serif sheet-h" id="aboutTitle">Development page</h2><p class="about-ver">Version info is added when the app is built.</p></div>';
    var log = (B.log || []).slice(0, 5);
    var ver = (B.tag ? B.tag + (B.since ? ' and newer changes' : '') : (B.sha || B.id)) + (B.dirty ? ' · Test build' : '');
    var foot = [B.branch, B.sha].filter(Boolean).join(' · ');
    return '<div class="sheet-pad about">' +
      '<h2 class="serif sheet-h" id="aboutTitle">Updated ' + when(B.built) + '</h2>' +
      '<p class="about-status" role="status">' + statusText() + '</p>' +
      '<p class="about-ver">' + App.esc(ver) + '</p>' +
      (log.length ? '<div class="label">' + (B.since ? 'Since ' + App.esc(B.since) : 'What’s new') + '</div>' +
        '<ul class="about-log">' + log.map(function (l) { return '<li>' + App.esc(l) + '</li>'; }).join('') + '</ul>' : '') +
      (foot ? '<p class="about-foot">' + App.esc(foot) + '</p>' : '') +
      '</div>';
  }

  App.openAbout = function () {
    var timer;
    App.sheet(html(), {
      onMount: function (sheet, close) {
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-labelledby', 'aboutTitle');
        timer = setTimeout(function () { if (App.closeSheet === close) close(); }, DISMISS_MS); // never close a sheet that replaced this one
      },
      onClose: function () { clearTimeout(timer); }
    });
    checkVersion(paintStatus); // the sheet may still be open when the answer arrives
  };

  App.on('ready', function () {
    // Demo mode keeps the clock hold for its own panel (see the About button there).
    if (!App.demo) App.hold(App.$('#railClock'), 700, { done: App.openAbout });
    checkVersion();
  });

  // Every 30 min: ask again; once a newer build exists, reload as soon as the frame is not in day mode.
  App.on('minute', function () {
    if (!B) return;
    if (++checks % 30 === 0) checkVersion();
    if (stale && App.mode !== 'day' && Date.now() - bootAt > 300000) location.reload(); // 5 min: no reload loop if the page is served stale
  });
})();
