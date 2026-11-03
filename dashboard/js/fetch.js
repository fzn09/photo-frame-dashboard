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

  function updateMeals(data) {
    D.meals = { days: data.days || [], device: data.device || '' };
    App.emit('data');
    App.emit('meals');
  }

  // Write-through to Bring! via the Worker. op: 'add' (also qty/note change, add back) | 'done' | 'remove'.
  // The Worker answers 503 when writes or Bring! aren't configured: that's mock mode, stay silent.
  var TOKEN = import.meta.env.VITE_DASH_TOKEN || '';
  function post(endpoint, body, label, after) {
    fetch('/api/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dash-Token': TOKEN },
      body: JSON.stringify(body)
    })
      .then(function (r) { if (!r.ok && r.status !== 503) return Promise.reject(r.status); return true; })
      .catch(function (err) {
        console.warn('[fetch] ' + endpoint + ' write failed:', err);
        App.toast('Couldn’t sync <b>' + App.esc(label) + '</b>', { tone: 'error', icon: 'bolt' });
        return false;
      })
      .then(after);
  }
  function bringPost(endpoint, op, g, after) {
    post(endpoint, { op: op, name: g.name, qty: g.qty, note: g.note || '' }, g.name, after);
  }
  var choreWrites = 0, pullChores;
  App.choreSync = function (c) {
    choreWrites++;
    post('chores', { id: c.id, projectId: c.projectId }, c.title, function (ok) {
      if (!ok) { c.done = false; delete c.doneAt; } // still open in TickTick: un-tick so it can be tried again
      if (--choreWrites === 0 && pullChores) pullChores();
    });
  };
  // New chore from the quick-add tiles. The next pull swaps the local copy for TickTick's task.
  App.choreAdd = function (c) {
    choreWrites++;
    var p = App.person(c.who);
    post('chores', { op: 'add', title: c.title, tag: c.who === 'any' ? '' : p.name }, c.title, function () {
      if (--choreWrites === 0 && pullChores) pullChores();
    });
  };

  // TickTick tasks -> chores: open tasks due today or earlier, plus undated ones. Who = a tag matching a
  // person's name ("Fauzan"), else Anyone. Done this session stays visible (done) until midnight.
  function updateChores(tasks) {
    var today = new Date(App.now()); today.setHours(0, 0, 0, 0);
    var end = today.getTime() + 86400000, old = {}, open = {};
    D.chores.forEach(function (c) { old[c.id] = c; });
    var list = tasks.filter(function (t) { return !t.due || new Date(t.due).getTime() < end; }).map(function (t) {
      var due = t.due ? new Date(t.due) : null, o = old[t.id];
      var tags = t.tags.map(function (s) { return s.toLowerCase(); });
      var p = D.people.filter(function (p) { return tags.indexOf(p.name.toLowerCase()) > -1 || tags.indexOf(p.id) > -1; })[0];
      open[t.id] = true;
      return {
        id: t.id, projectId: t.projectId, due: t.due,
        title: t.title, who: p ? p.id : 'any',
        time: due && !t.allDay ? App.fmt.time(due) : '', overdue: !!due && due < today,
        done: !!(o && o.done && o.due === t.due), doneAt: o && o.doneAt // ticked here, write still in flight
      };
    });
    var keepDone = D.chores.filter(function (c) { return c.done && c.projectId && !open[c.id] && c.doneAt >= today.getTime(); });
    D.chores = list.concat(keepDone);
    App.emit('data');
    App.emit('chores');
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
      at: Date.now(),
      stop: data.stop || '',
      departures: (data.departures || []).map(function (d) {
        return Object.assign({}, d, { when: new Date(d.when) });
      })
    };
    App.emit('data');
  }

  // After a failure, retry at 5 s, 15 s and 1 min (Wi-Fi comes up after the page loads), then fall back to
  // the normal interval. 503 = the Worker has no credentials for it: the mock data is intended, stop asking.
  // feeds[endpoint].ok = time of the last good response (0 = still showing mock data), read by railStale().
  var RETRY = [5000, 15000, 60000], feeds = {};
  function poll(endpoint, handler, intervalMin, busy) {
    var f = feeds[endpoint] = { every: intervalMin * 60000, ok: 0, off: false }, fails = 0, timer;
    function run() {
      clearTimeout(timer); // a write's refresh calls run() early; keep a single timer
      if (busy && busy()) { timer = setTimeout(run, f.every); return; } // a write is in flight: its own refresh follows
      var wait = f.every;
      fetch('/api/' + endpoint)
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) { fails = 0; f.ok = Date.now(); f.mono = performance.now(); handler(data); })
        .catch(function (err) {
          if (err === 503) { f.off = true; return; }
          console.warn('[fetch] ' + endpoint + ' failed:', err);
          if (fails < RETRY.length) wait = RETRY[fails++];
        })
        .then(function () { if (!f.off) timer = setTimeout(run, wait); railStale(); });
    }
    run();
    return run;
  }

  // Minutes a feed is overdue (last good response more than two intervals ago), else 0. Cards show it as a badge.
  // Measured on the monotonic clock: the frame's wall clock can jump when NTP syncs after boot.
  App.feedAge = function (k) {
    var f = feeds[k], ms = f && f.ok && !f.off ? performance.now() - f.mono : 0;
    return f && ms > 2 * f.every ? Math.round(ms / 60000) : 0;
  };

  // Under the rail clock: "Sample data" while a feed has never loaded, "Updated N min ago" once the
  // oldest feed is more than two intervals behind, nothing when all is fresh. Off and idle feeds don't count.
  var shown = null;
  function railStale() {
    var now = Date.now(), never = false, oldest = now;
    Object.keys(feeds).forEach(function (k) {
      var f = feeds[k];
      if (f.off || k === 'config' || (k === 'fridge' && !App.enabled('fridge')) || (k === 'chores' && !App.enabled('tasks')) || (k === 'meals' && !App.enabled('meals'))) return;
      if (!f.ok) never = true;
      else if (now - f.ok > 2 * f.every) oldest = Math.min(oldest, f.ok);
    });
    var html = never ? '<b>Sample</b><span>data</span>'
      : oldest < now ? '<b>Updated</b><span>' + Math.round((now - oldest) / 60000) + ' min ago</span>' : '';
    if (html === shown) return;
    shown = html;
    var el = document.getElementById('railStale');
    el.innerHTML = html;
    el.hidden = !html;
  }
  App.on('minute', railStale);

  function updateConfig(data) { if (data && Array.isArray(data.views)) App.setViews(data.views.filter(function (n) { return n !== 'home'; })); }

  App.on('ready', function () {
    poll('config',   updateConfig,    5);
    poll('weather',  updateWeather,  30);
    poll('calendar', updateCalendar,  5);
    pullShopping = poll('shopping', updateShopping, 2, function () { return writes > 0; });
    // Each Bring! call logs in again, so the fridge list is only polled while its view is on
    pullFridge = poll('fridge', updateFridge, 5, function () { return fridgeWrites > 0 || !App.enabled('fridge'); });
    pullChores = poll('chores', updateChores, 5, function () { return choreWrites > 0 || !App.enabled('tasks'); });
    poll('transit',  updateTransit,   1);
    poll('meals',    updateMeals,    30, function () { return !App.enabled('meals'); });
  });
})();
