// About sheet (hold the rail clock) + stale-bundle check against /version.json.
// __BUILD__ is injected by vite.config.js from git at build time.
(function () {
  'use strict';
  var B = typeof __BUILD__ !== 'undefined' ? __BUILD__ : null;
  var stale = false, checks = 0, fmtDate, bootAt = Date.now();

  function checkVersion(done) {
    if (!B) return done && done();
    fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) { if (v && v.id) stale = v.id !== B.id; })
      .catch(function () { /* offline or dev server: keep the last answer */ })
      .then(function () { if (done) done(); });
  }

  function when(iso) {
    fmtDate = fmtDate || new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    return fmtDate.format(new Date(iso));
  }

  function html() {
    if (!B) return '<div class="sheet-pad"><h2 class="serif sheet-h">Home HQ</h2><p class="sheet-p">No build info in this page.</p></div>';
    var ver = B.tag ? B.tag + (B.since ? ' +' : '') : (B.sha || B.id);
    return '<div class="sheet-pad about">' +
      '<div class="label">Home HQ</div>' +
      '<h2 class="serif sheet-h">' + App.esc(ver) + '</h2>' +
      '<p class="about-meta">' + App.esc(B.branch) + ' · ' + App.esc(B.sha) + (B.dirty ? ' · uncommitted changes' : '') + '<br>Deployed ' + when(B.built) + '</p>' +
      '<p class="about-stale"' + (stale ? '' : ' hidden') + '>A newer version is online. It loads when the frame is idle.</p>' +
      '<div class="label">' + (B.since ? 'Since ' + App.esc(B.since) : 'What’s new') + '</div>' +
      '<ul class="about-log">' + (B.log.length ? B.log.map(function (l) { return '<li>' + App.esc(l) + '</li>'; }).join('') : '<li>No changes recorded.</li>') + '</ul>' +
      '</div>';
  }

  App.openAbout = function () {
    App.sheet(html(), {});
    checkVersion(function () { // the sheet may still be open when the answer arrives
      var el = document.querySelector('.about-stale');
      if (el) el.hidden = !stale;
    });
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
