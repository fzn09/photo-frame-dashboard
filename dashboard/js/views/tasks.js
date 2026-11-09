// Chores: one list on a glass panel (open first, done today at the bottom); the usual chores for a person are added
// from a sheet behind "Add chore", the same pattern as Shopping.
(function () {
  'use strict';
  var D = window.DATA;
  var V = { el: null, sheet: null, who: 'any', pending: {}, sync: {}, hold: {}, order: null };
  var cid = 0;

  function open() { return D.chores.filter(function (c) { return !c.done; }); }
  // Same order and states as the Home card. While a finished chore's Undo toast is up, rows keep their places, so a
  // second tap lands where the finger aimed instead of on the row that slid up.
  function sorted() {
    var list = D.chores.slice().sort(App.choreSort);
    if (!V.order || !Object.keys(V.hold).length) return list;
    var at = function (c) { var i = V.order.indexOf(c.id); return i < 0 ? 1e4 : i; };
    return list.sort(function (a, b) { return at(a) - at(b); });
  }
  function onList(title, who) {
    return open().filter(function (c) { return c.who === who && c.title.toLowerCase() === title.toLowerCase(); })[0];
  }

  function row(c) {
    var p = App.person(c.who);
    var st = App.choreState(c);
    var meta = c.done ? (c.doneBy ? 'Done by ' + App.person(c.doneBy).name : 'Done')
      : st === 'late' ? '<span class="c-late">' + App.esc(App.choreWhen(c)) + '</span>'
      : st === 'soon' ? '<span class="c-soon">Today · ' + App.esc(c.time) + '</span>' : c.time ? 'Today · ' + App.esc(c.time) : '';
    return '<button class="c-row' + (c.done ? ' is-done' : '') + (V.pending[c.id] ? ' is-checking' : '') + '" data-ch="' + c.id + '" style="' + App.pstyle(p) + '">' +
      '<span class="c-box">' + App.icon('check', 22) + '</span>' +
      '<span class="c-name"><b>' + App.esc(c.title) + '</b>' + (meta ? '<small>' + meta + '</small>' : '') + '</span>' +
      '<span class="c-who">' + (c.who === 'any' ? 'Anyone' : p.name) + App.avatar(p, 34) + '</span>' +
      '</button>';
  }

  function listHTML() {
    var all = sorted();
    if (!open().length) {
      return '<div class="c-empty serif">All done.<br><i>Nothing left today.</i></div>' +
        (all.length ? '<div class="c-rows">' + all.map(row).join('') + '</div>' : '');
    }
    return '<div class="c-rows' + (all.length <= 8 ? ' c-rows--one' : '') + '">' + all.map(row).join('') + '</div>';
  }

  function tile(title) {
    var on = onList(title, V.who);
    return '<button class="s-tile' + (on ? ' is-on' : '') + '" data-add="' + App.esc(title) + '">' +
      '<b>' + App.esc(title) + '</b><span>' + (on ? App.icon('check', 16) + 'On list' : App.icon('plus', 16) + 'Add') + '</span></button>';
  }
  function whoBtn(id) {
    var p = App.person(id);
    return '<button class="' + (V.who === id ? 'is-on' : '') + '" aria-pressed="' + (V.who === id) + '" data-who="' + id + '">' + App.avatar(p, 28) + (id === 'any' ? 'Anyone' : p.name) + '</button>';
  }

  function paintList() { var l = V.el.querySelector('.c-list'); var st = l.scrollTop; l.innerHTML = listHTML(); l.scrollTop = st; paintHead(); }
  function paintAdd() {
    if (!V.sheet) return;
    V.sheet.querySelector('.c-pick').innerHTML = D.people.map(function (p) { return whoBtn(p.id); }).join('') + whoBtn('any');
    V.sheet.querySelector('.c-usuals').innerHTML = D.choreUsuals.map(tile).join('');
  }
  function addSheet() {
    App.sheet('<div class="sheet-pad c-addsheet"><h2 class="sheet-h serif">Add a chore</h2>' +
      '<div class="c-add-h"><span class="label">For</span><div class="seg c-pick"></div></div><div class="c-usuals"></div></div>', {
      cls: 'c-sheet',
      onMount: function (box) { V.sheet = box; box.addEventListener('click', onClick); paintAdd(); },
      onClose: function () { V.sheet = null; }
    });
  }
  function paintHead() {
    var n = open().length, done = sorted().length - n;
    V.el.querySelector('.c-count').innerHTML = '<span class="num' + (n ? ' is-due' : '') + '">' + n + '</span> to do' + (done ? ' · ' + done + ' done' : '');
  }
  function render() {
    V.el.innerHTML = '<div class="chores">' +
      '<header class="c-head"><h1 class="serif">Chores</h1><div class="c-count"></div>' +
      '<button class="btn btn--solid" data-addsheet>' + App.icon('plus', 24) + 'Add chore</button></header>' +
      '<div class="c-list panel glass glass--dense"></div></div>';
    paintList(); paintAdd();
  }

  // TickTick write once the Undo toast is gone (TickTick has no "uncomplete" for repeating tasks)
  function schedule(c, ms) {
    if (!c.projectId || !App.choreSync) return;
    V.sync[c.id] = setTimeout(function () { delete V.sync[c.id]; App.choreSync(c); }, ms);
  }
  function unschedule(c) { clearTimeout(V.sync[c.id]); delete V.sync[c.id]; }

  function complete(c, btn) {
    if (!Object.keys(V.hold).length) V.order = sorted().map(function (x) { return x.id; });
    clearTimeout(V.hold[c.id]);
    V.hold[c.id] = setTimeout(function () {
      delete V.hold[c.id];
      if (!Object.keys(V.hold).length) { V.order = null; if (V.el && V.el.firstChild) paintList(); }
    }, 8000);
    V.pending[c.id] = true;
    btn.classList.add('is-checking');
    setTimeout(function () {
      delete V.pending[c.id];
      c.done = true;
      c.doneAt = Date.now();
      paintList();
      App.emit('data');
      var last = !open().length;
      schedule(c, 5000); // after the Undo window, the last chore included (it has Undo now too)
      App.toast(last ? '<b>All chores done.</b> ' + App.esc(c.title) + ' was the last one.' : '<b>' + App.esc(c.title) + '</b> done', {
        icon: last ? 'star' : 'check',
        undo: function () { unschedule(c); c.done = false; delete c.doneAt; paintList(); App.emit('data'); }
      });
    }, 350);
  }

  function add(title) {
    var p = App.person(V.who);
    if (onList(title, V.who)) return App.toast('<b>' + App.esc(title) + '</b> is already on ' + (V.who === 'any' ? 'the list' : p.name + '’s list'), { icon: 'check', ms: 2500 });
    var c = { id: 'new' + (++cid), who: V.who, title: title, done: false };
    D.chores.push(c);
    if (App.choreAdd) App.choreAdd(c);
    paintList(); paintAdd();
    App.emit('data');
    App.toast('Added <b>' + App.esc(title) + '</b> for ' + (V.who === 'any' ? 'anyone' : p.name), { icon: 'plus', ms: 2500 });
  }

  function onClick(e) {
    var t;
    if ((t = e.target.closest('[data-addsheet]'))) return addSheet();
    if ((t = e.target.closest('[data-who]'))) { V.who = t.dataset.who; return paintAdd(); }
    if ((t = e.target.closest('[data-add]'))) return add(t.dataset.add);
    if ((t = e.target.closest('[data-ch]'))) {
      var c = D.chores.filter(function (x) { return x.id === t.dataset.ch; })[0];
      if (!c || V.pending[c.id]) return;
      if (c.done) {
        // ponytail: un-ticking only reverts a TickTick chore inside the 5 s window; after that it's local only
        unschedule(c);
        c.done = false;
        delete c.doneAt;
        paintList();
        App.emit('data');
        return;
      }
      complete(c, t);
    }
  }

  App.register('tasks', {
    minutely: true, // late / due-soon states follow the clock
    show: function (el) {
      if (!V.el) { V.el = el; el.addEventListener('click', onClick); }
      render();
    }
  });
  // Fresh list from TickTick: repaint if on screen and not mid check-off
  App.on('chores', function () {
    if (App.current === 'tasks' && V.el && V.el.firstChild && !Object.keys(V.pending).length) { paintList(); paintAdd(); }
  });
})();
