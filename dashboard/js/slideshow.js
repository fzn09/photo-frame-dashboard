// Photo slideshow used by the Photos view, ambient mode and the home tile.
(function () {
  'use strict';
  var D = window.DATA;

  // w = the pixel width the slide is shown at (DPR 1, so no 2x). The frame decodes every image at full size:
  // a 1600 px photo in a 257 px tile cost ~7 MB of RAM per slide. JPEG, not auto=format: that serves AVIF, slow to decode.
  function src(p, w) {
    w = w || 640;
    if (p.url) return p.url + '&fm=jpg&fit=max&q=80&w=' + w; // stock photo from /api/photos
    return App.img(p.seed, w, Math.round(w * (p.o === 'p' ? 1.5 : .625)));
  }
  App.photoSrc = src;

  function parseDate(p) { var a = p.date.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
  App.photoMeta = function (p) {
    if (p.url) return { date: p.photographer, monthYear: p.photographer, kicker: 'Unsplash', onThisDay: false, place: p.alt || '', from: null };
    var d = parseDate(p), now = App.now();
    var years = now.getFullYear() - d.getFullYear();
    var onThisDay = d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    var kicker = onThisDay ? years + (years === 1 ? ' year' : ' years') + ' ago today' : (years > 0 ? years + (years === 1 ? ' year ago' : ' years ago') : 'This year');
    return {
      date: App.fmt.month(d) + ' ' + d.getDate() + ', ' + d.getFullYear(),
      monthYear: App.fmt.month(d) + ' ' + d.getFullYear(),
      kicker: kicker, onThisDay: onThisDay, place: p.place, from: App.person(p.from)
    };
  };

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function caption(p) {
    var m = App.photoMeta(p);
    return '<div class="cap">' +
      '<div class="cap-kicker">' + (m.onThisDay ? '<b>On this day</b> · ' : '') + m.kicker + ' · ' + App.esc(m.place) + '</div>' +
      '<div class="cap-date serif">' + m.date + '</div>' +
      '</div>';
  }
  // One layout: the photo fills the slide (a portrait is shown whole, centred). The pair/collage/polaroid
  // layouts, the hidden blur-fill image and the Ken Burns offsets were never used by any slideshow and are gone.
  function slideHTML(p, o) {
    var img = p.o === 'p' // a portrait is shown full height, so about 0.42 of the slide's width (800 x 2/3 of 1280)
      ? '<img class="fitimg" src="' + src(p, Math.round(o.w * .42)) + '" alt="">'
      : '<div class="kb"><img src="' + src(p, o.w) + '" alt=""></div>';
    return '<div class="slide ' + (p.o === 'p' ? 'slide--fit' : 'slide--cover') + '">' + img + (o.captions ? caption(p) : '') + '</div>';
  }

  // Slideshows wait for the first /api/photos attempt (see loadPhotos) so none of them fills its queue
  // from the demo list and then keeps showing it after the stream has arrived.
  var live = [], settled = false;

  App.Slideshow = function (el, opts) {
    this.el = el;
    this.o = Object.assign({ interval: 15000, captions: true, w: 1280 }, opts || {}); // w: shown width, px
    this.queue = [];
    this.history = [];
    this.timer = null;
    this.current = null;
    this.want = false;
    live.push(this);
  };
  var S = App.Slideshow.prototype;

  S.refill = function () {
    var q = [];
    // Landscape only, so photos fill the frame instead of sitting letterboxed; portraits are the fallback if that's all there is.
    var land = D.photos.filter(function (p) { return p.o !== 'p'; });
    (land.length ? land : D.photos).forEach(function (p) { q.push(p); if (p.fav) q.push(p); });
    // On-this-day photos always come first in a fresh cycle
    shuffle(q).sort(function (a, b) { return (App.photoMeta(b).onThisDay ? 1 : 0) - (App.photoMeta(a).onThisDay ? 1 : 0); });
    this.queue = q;
  };
  // A slide is { photos: [photo] }: callers (Home caption, Photos favourite) read slide.photos[0].
  S.pick = function () {
    if (!this.queue.length) this.refill();
    var p = this.queue.shift();
    return p ? { photos: [p] } : null;
  };

  S.render = function (slide) {
    var self = this;
    this.current = slide;
    var wrap = document.createElement('div');
    wrap.innerHTML = slideHTML(slide.photos[0], this.o);
    var node = wrap.firstChild;
    node.style.opacity = '0';
    // Fallback look if images can't load (offline)
    Array.prototype.forEach.call(node.querySelectorAll('img'), function (im) {
      im.addEventListener('error', function () { im.classList.add('is-broken'); });
    });
    var old = Array.prototype.slice.call(this.el.children);
    this.el.appendChild(node);
    var first = node.querySelector('img');
    var shown = false;
    function show() {
      if (shown) return; shown = true;
      node.classList.add('is-in');
      node.style.opacity = '';
      old.forEach(function (o) { o.remove(); });
    }
    if (first && !first.complete) { first.addEventListener('load', show); first.addEventListener('error', show); setTimeout(show, 2500); }
    else show();
    if (this.o.onChange) this.o.onChange(slide);
  };

  S.next = function () {
    var s = this.pick();
    if (!s) return;
    if (this.current && this.history.push(this.current) > 20) this.history.shift(); // Back needs a few steps, not a day's worth
    this.render(s);
    this.restart();
  };
  S.prev = function () {
    if (!this.history.length) return;
    this.render(this.history.pop());
    this.restart();
  };
  S.restart = function () {
    var self = this;
    clearInterval(this.timer);
    this.timer = setInterval(function () { self.next(); }, this.o.interval);
  };
  S.start = function () {
    this.want = true;
    if (!settled) return; // started for real by settle()
    if (!this.current) this.next(); else this.restart();
  };
  S.stop = function () { this.want = false; clearInterval(this.timer); this.timer = null; };

  function settle() {
    if (settled) return;
    settled = true;
    live.forEach(function (s) { if (s.want) s.start(); });
  }

  // Stream stock photos from the Worker; on failure keep the demo list and retry with backoff
  // (Wi-Fi often comes up after the page loads), then go back to hourly refreshes.
  var RETRY = [5000, 15000, 60000, 300000], failures = 0, retryTimer = null;

  // Favourite stock photos, kept in localStorage so they outlive the hourly refresh and the 3 a.m. reload.
  // Sample photos (no url) aren't stored: they come back from data.js anyway.
  var FAVS = 'hq-favs';
  function favs() { // only an array counts: a damaged value must not stop the photo stream
    try { var v = JSON.parse(localStorage.getItem(FAVS)); return Array.isArray(v) ? v.filter(function (p) { return p && p.id && p.url; }) : []; } catch (e) { return []; }
  }
  App.saveFav = function (p) {
    if (!p.url) return;
    var list = favs().filter(function (x) { return x.id !== p.id; });
    if (p.fav) list.unshift({ id: p.id, o: p.o, url: p.url, photographer: p.photographer, alt: p.alt });
    try { localStorage.setItem(FAVS, JSON.stringify(list.slice(0, 50))); } catch (e) { /* private mode: this session only */ }
  };
  App.loadPhotos = function () {
    clearTimeout(retryTimer);
    fetch('/api/photos').then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).then(function (list) {
      if (!Array.isArray(list) || !list.length) return Promise.reject('empty');
      failures = 0;
      // Each call is a new random set, so favourites ride along: flagged if they came back, appended if not.
      var keep = {};
      favs().forEach(function (f) { keep[f.id] = f; });
      list.forEach(function (p) { if (keep[p.id]) { p.fav = true; delete keep[p.id]; } });
      Object.keys(keep).forEach(function (id) { keep[id].fav = true; list.push(keep[id]); });
      D.photos = list;
      // Drop queues built from the demo list so the stream takes over at the next slide.
      live.forEach(function (s) { s.queue = []; });
      App.emit('data');
    }).catch(function () {
      retryTimer = setTimeout(App.loadPhotos, RETRY[Math.min(failures++, RETRY.length - 1)]);
    }).then(settle);
  };
  App.loadPhotos();
  setTimeout(settle, 4000); // a hung request must not leave the tile blank: fall back to the demo list
  setInterval(App.loadPhotos, 3600000);
})();
