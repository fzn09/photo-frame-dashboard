// Photos: full-bleed editorial slideshow with layout modes.
(function () {
  'use strict';
  var D = window.DATA;
  var V = { el: null, show: null, layout: 'auto', loud: false, mode: 'photos', region: null, cam: null, timer: null };
  var LAYOUTS = [['auto', 'Auto'], ['cover', 'Cover'], ['pair', 'Pair'], ['collage', 'Collage'], ['polaroid', 'Polaroid']];

  function heart() {
    var s = V.show && V.show.current, on = s && s.photos[0].fav;
    var b = V.el.querySelector('[data-fav]');
    b.classList.toggle('is-on', !!on);
    b.querySelector('span').textContent = on ? 'Favourite' : 'Favourite';
  }

  // ---- Live city cams: one feed at a time (the frame is a 1 GB Allwinner A33), torn down on leave/switch
  function regions() { return D.webcams.map(function (c) { return c.region; }).filter(function (r, i, a) { return a.indexOf(r) === i; }); }
  function camsIn(r) { return D.webcams.filter(function (c) { return c.region === r; }); }

  function stopCam() {
    clearInterval(V.timer);
    if (V.el) V.el.querySelector('.ph-live-view').innerHTML = ''; // drops img/video/iframe so nothing keeps streaming
  }
  function liveNav() {
    var regs = regions(), cams = camsIn(V.region);
    V.el.querySelector('.ph-live-nav').innerHTML =
      (regs.length > 1 ? '<div class="seg seg--glass">' + regs.map(function (r) {
        return '<button data-region="' + App.esc(r) + '" class="' + (r === V.region ? 'is-on' : '') + '">' + App.esc(r) + '</button>';
      }).join('') + '</div>' : '') +
      (cams.length > 1 ? '<div class="seg seg--glass">' + cams.map(function (c) {
        return '<button data-cam="' + c.id + '" class="' + (c === V.cam ? 'is-on' : '') + '">' + App.esc(c.name) + '</button>';
      }).join('') + '</div>' : '');
  }
  function loadCam(c) {
    stopCam();
    var view = V.el.querySelector('.ph-live-view'), cap = V.el.querySelector('.ph-live-cap');
    if (!c) { cap.innerHTML = '<b>No cams configured</b>'; return; }
    V.cam = c; V.region = c.region;
    cap.innerHTML = '<b>' + App.esc(c.name) + '</b><span>' + App.esc(c.region) + ' · ' + App.esc(c.credit || '') + ' · <i class="ph-live-upd"></i></span>';
    liveNav();
    var upd = cap.querySelector('.ph-live-upd');
    if (c.type === 'yt') {
      view.innerHTML = '<iframe allow="autoplay" src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(c.src) + '?autoplay=1&mute=1&controls=0&playsinline=1"></iframe>';
      upd.textContent = 'live';
    } else if (c.type === 'hls') {
      // ponytail: native HLS only (Android WebView plays it, desktop Chrome doesn't); add hls.js lazily if a cam needs it
      var v = document.createElement('video');
      v.muted = true; v.autoplay = true; v.setAttribute('playsinline', '');
      if (!v.canPlayType('application/vnd.apple.mpegurl')) { upd.textContent = 'HLS not supported here'; return; }
      v.src = c.src; view.appendChild(v); upd.textContent = 'live';
    } else {
      var img = document.createElement('img');
      img.onload = function () { upd.textContent = 'updated ' + App.fmt.time(App.now()); };
      img.onerror = function () { upd.textContent = 'offline · retrying'; };
      view.appendChild(img);
      var load = function () { img.src = c.src + (c.src.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(); };
      load();
      V.timer = setInterval(load, (c.every || 60) * 1000);
    }
  }
  function setMode(m) {
    V.mode = m;
    V.el.querySelector('.photos').classList.toggle('is-live', m === 'live');
    App.$$('[data-mode]', V.el).forEach(function (b) { b.classList.toggle('is-on', b.dataset.mode === m); });
    if (m === 'live') { V.show.stop(); loadCam(V.cam || D.webcams[0]); }
    else { stopCam(); V.show.start(); }
  }

  App.register('photos', {
    show: function (el) {
      if (!V.el) {
        V.el = el;
        el.innerHTML = '<div class="photos">' +
          '<div class="ph-stage"></div>' +
          '<button class="ph-zone ph-zone--l" data-prev aria-label="Previous"></button>' +
          '<button class="ph-zone ph-zone--c" data-loud aria-label="Show details"></button>' +
          '<button class="ph-zone ph-zone--r" data-next aria-label="Next"></button>' +
          '<div class="ph-top"><div class="seg seg--glass"><button data-mode="photos" class="is-on">Photos</button><button data-mode="live">Live</button></div>' +
          '<div class="seg seg--glass ph-layouts">' + LAYOUTS.map(function (l) {
            return '<button data-layout="' + l[0] + '" class="' + (l[0] === V.layout ? 'is-on' : '') + '">' + l[1] + '</button>';
          }).join('') + '</div></div>' +
          '<div class="ph-live"><div class="ph-live-view"></div><div class="ph-live-bar"><div class="ph-live-cap"></div><div class="ph-live-nav"></div></div></div>' +
          '<div class="ph-bottom">' +
          '  <button class="ph-btn" data-prev>' + App.icon('left', 30) + '</button>' +
          '  <button class="ph-btn ph-btn--fav" data-fav>' + App.icon('heart', 30) + '<span>Favourite</span></button>' +
          '  <button class="ph-btn" data-next>' + App.icon('right', 30) + '</button>' +
          '</div></div>';
        V.show = new App.Slideshow(el.querySelector('.ph-stage'), { layout: V.layout, interval: 15000, onChange: function () { setTimeout(heart); } });
        el.addEventListener('click', function (e) {
          var t = e.target.closest('button');
          if (!t) return;
          if (t.dataset.mode) return setMode(t.dataset.mode);
          if (t.dataset.region) return loadCam(camsIn(t.dataset.region)[0]);
          if (t.dataset.cam) return loadCam(D.webcams.filter(function (c) { return c.id === t.dataset.cam; })[0]);
          if (t.hasAttribute('data-next')) V.show.next();
          if (t.hasAttribute('data-prev')) V.show.prev();
          if (t.hasAttribute('data-loud')) { V.loud = !V.loud; el.querySelector('.photos').classList.toggle('is-loud', V.loud); }
          if (t.dataset.layout) {
            V.layout = t.dataset.layout;
            App.$$('[data-layout]', el).forEach(function (b) { b.classList.toggle('is-on', b === t); });
            V.show.setLayout(V.layout);
          }
          if (t.hasAttribute('data-fav')) {
            var p = V.show.current && V.show.current.photos[0];
            if (!p) return;
            p.fav = !p.fav;
            heart();
            App.toast(p.fav ? 'Added to favourites · it’ll show up more often' : 'Removed from favourites', { icon: 'heart', ms: 2500 });
          }
        });
      }
      if (V.mode === 'live') loadCam(V.cam); else V.show.start();
    },
    resume: function () { if (V.mode === 'live') loadCam(V.cam); else V.show.start(); },
    hide: function () { if (V.show) V.show.stop(); stopCam(); }
  });
})();
