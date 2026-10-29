// Live data fetcher. Polls /api/* Worker endpoints and merges results into
// window.DATA, then fires App.emit('data') so all views repaint automatically.
// Falls back to mock data silently on any fetch failure.
(function () {
  'use strict';
  var D = window.DATA;

  function updateWeather(data) {
    D.weather = data;
    App.emit('data');
  }

  function updateCalendar(events) {
    // ISO date strings from JSON → Date objects
    D.events = events.map(function (e) {
      return Object.assign({}, e, { start: new Date(e.start), end: new Date(e.end) });
    });
    App.emit('data');
  }

  function updateShopping(items) {
    // Bring! is the source of truth for open items (name, note, qty). Keep ids stable per name so the
    // view doesn't churn, and keep items checked off this session (Bring! moves them to "recently").
    var session = {};
    D.groceries.forEach(function (g) { session[g.name.toLowerCase()] = g; });

    var open = items.map(function (item) {
      var s = session[item.name.toLowerCase()];
      return {
        id:    s ? s.id : D._gid(),
        name:  item.name,
        note:  item.note || '',
        cat:   s ? s.cat : App.categorize(item.name),
        qty:   item.qty || 1,
        store: 'grocer',
        done:  false
      };
    });
    var names = open.map(function (g) { return g.name.toLowerCase(); });
    var keepDone = D.groceries.filter(function (g) { return g.done && names.indexOf(g.name.toLowerCase()) < 0; });
    D.groceries = open.concat(keepDone);
    App.emit('data');
    App.emit('shopping'); // the Shopping view repaints itself when it's the one on screen
  }

  // Fridge = a second Bring! list. Same shape as groceries, ids stable per name.
  function updateFridge(items) {
    var old = {};
    D.fridge.forEach(function (f) { old[f.name.toLowerCase()] = f; });
    D.fridge = items.map(function (item) {
      var o = old[item.name.toLowerCase()];
      return { id: o ? o.id : D._gid(), name: item.name, note: item.note || '', qty: item.qty || 1, cat: o ? o.cat : App.categorize(item.name) };
    });
    App.emit('data');
    App.emit('fridge');
  }

  // Write-through to Bring! via the Worker. op: 'add' (also qty/note change, add back) | 'done' | 'remove'.
  // The Worker answers 503 when writes or Bring! aren't configured: that's mock mode, stay silent.
  var TOKEN = import.meta.env.VITE_DASH_TOKEN || '';
  function bringPost(endpoint, op, g, after) {
    fetch('/api/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dash-Token': TOKEN },
      body: JSON.stringify({ op: op, name: g.name, qty: g.qty, note: g.note || '' })
    })
      .then(function (r) { if (!r.ok && r.status !== 503) return Promise.reject(r.status); })
      .catch(function (err) {
        console.warn('[fetch] ' + endpoint + ' write failed:', err);
        App.toast('Couldn’t sync <b>' + App.esc(g.name) + '</b> to Bring!', { tone: 'error', icon: 'bolt' });
      })
      .then(after);
  }
  var writes = 0, pullShopping;
  App.shopSync = function (op, g) {
    writes++;
    bringPost('shopping', op, g, function () { if (--writes === 0 && pullShopping) pullShopping(); });
  };
  var fridgeWrites = 0, pullFridge;
  App.fridgeSync = function (op, g) {
    fridgeWrites++;
    bringPost('fridge', op, g, function () { if (--fridgeWrites === 0 && pullFridge) pullFridge(); });
  };

  function updateTransit(data) {
    D.transit = {
      stop: data.stop || '',
      departures: (data.departures || []).map(function (d) {
        return Object.assign({}, d, { when: new Date(d.when) });
      })
    };
    App.emit('data');
  }

  // Home Assistant -> Home view. Replaces the mock devices/rooms and flips D.live so the views write back.
  // Mock scenes reference mock device ids, so they're dropped once live data is in.
  function updateHome(data) {
    if (!data || !data.devices) return;
    D.live = true;
    D.devices = data.devices;
    D.rooms = data.rooms;
    D.scenes = [];
    if (data.climate) Object.assign(D.climate, data.climate);
    if (data.media) Object.assign(D.media, data.media);
    App.emit('data');
  }

  // ent = a device, D.climate or D.media (each carries its HA entity id); patch uses the dashboard's own keys.
  // done(ok) is optional. 503 = HA/writes not configured, counted as not ok so the optimistic change reverts.
  var homeWrites = 0, pullHome;
  App.homeSync = function (ent, patch, done) {
    homeWrites++;
    fetch('/api/home', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dash-Token': TOKEN },
      body: JSON.stringify({ id: ent.id, patch: patch })
    })
      .then(function (r) { return r.ok; }, function () { return false; })
      .then(function (ok) {
        if (done) done(ok);
        if (--homeWrites === 0 && pullHome) pullHome();
      });
  };

  function poll(endpoint, handler, intervalMin, busy) {
    function run() {
      if (busy && busy()) return; // a write is in flight: its own refresh follows
      fetch('/api/' + endpoint)
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(handler)
        .catch(function (err) { console.warn('[fetch] ' + endpoint + ' failed:', err); });
    }
    run();
    setInterval(run, intervalMin * 60 * 1000);
    return run;
  }

  function updateConfig(data) { if (data && Array.isArray(data.views)) App.setViews(data.views.filter(function (n) { return n !== 'home'; })); }

  App.on('ready', function () {
    poll('config',   updateConfig,    5);
    poll('weather',  updateWeather,  30);
    poll('calendar', updateCalendar,  5);
    pullShopping = poll('shopping', updateShopping, 2, function () { return writes > 0; });
    // Each Bring! call logs in again, so the fridge list is only polled while its view is on
    pullFridge = poll('fridge', updateFridge, 5, function () { return fridgeWrites > 0 || !App.enabled('fridge'); });
    poll('transit',  updateTransit,   1);
    pullHome = poll('home', updateHome, 0.5, function () { return homeWrites > 0; });
  });
})();
