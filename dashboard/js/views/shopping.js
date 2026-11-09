// Shopping: category rail (left) filters a three-column list (right). Quick-add with usuals lives in a sheet behind
// "Add item"; ticked items move into a collapsed "In the cart" group at the bottom of the list.
(function () {
  'use strict';
  var D = window.DATA;
  var V = { el: null, sheet: null, query: '', drawer: false, pending: {}, flash: null, qtyTimer: {}, cat: 'all' };
  // Suggestions and usuals render in the Add sheet while it is open
  function root() { return V.sheet || V.el; }

  function open() { return D.groceries.filter(function (g) { return !g.done; }); }
  function done() { return D.groceries.filter(function (g) { return g.done; }); }
  // Bring! write-through (no-op in a bare build where fetch.js hasn't defined it)
  function sync(op, g) { if (App.shopSync) App.shopSync(op, g); }

  App.categorize = function (name) { return categorize(name); };
  function categorize(name) {
    var n = name.toLowerCase();
    var hit = D.catalog.filter(function (c) { return c[0].toLowerCase() === n; })[0] ||
      D.catalog.filter(function (c) { var a = c[0].toLowerCase(); return a.indexOf(n) > -1 || n.indexOf(a) > -1; })[0] ||
      D.catalog.filter(function (c) { return n.split(/\s+/).some(function (w) { return w.length > 3 && c[0].toLowerCase().indexOf(w) > -1; }); })[0];
    return hit ? hit[1] : 'Other';
  }
  function find(name, isDone) {
    return D.groceries.filter(function (g) { return !!g.done === isDone && g.name.toLowerCase() === name.toLowerCase(); })[0];
  }

  function row(g) {
    return '<div class="s-row' + (V.pending[g.id] ? ' is-checking' : '') + '" data-id="' + g.id + '">' +
      '<button class="s-hit" data-check="' + g.id + '">' +
      '<span class="s-box">' + App.icon('check', 22) + '</span>' +
      '<span class="s-name"><b>' + App.esc(g.name) + '</b>' + (g.note ? '<small>' + App.esc(g.note) + '</small>' : '') + '</span>' +
      '</button>' +
      '<button class="s-q" data-qsheet="' + g.id + '" aria-label="Quantity ' + g.qty + '">' + (g.qty > 1 ? '×' + g.qty : App.icon('plus', 20)) + '</button>' +
      '</div>';
  }

  function groupsOf(items) {
    return D.catOrder.all.concat(['Other']).map(function (cat) { return { cat: cat, items: items.filter(function (g) { return g.cat === cat; }) }; }).filter(function (x) { return x.items.length; });
  }
  function catsHTML() {
    var items = open(), groups = groupsOf(items);
    if (V.cat !== 'all' && !groups.some(function (gr) { return gr.cat === V.cat; })) V.cat = 'all'; // emptied: back to All
    var btn = function (id, label, n) { return '<button class="cat' + (V.cat === id ? ' is-on' : '') + '" data-filter="' + App.esc(id) + '" aria-pressed="' + (V.cat === id) + '"><span>' + App.esc(label) + '</span><b>' + n + '</b></button>'; };
    return groups.length > 1 ? btn('all', 'All', items.length) + '<div class="cats-sep"></div>' + groups.map(function (gr) { return btn(gr.cat, gr.cat, gr.items.length); }).join('') : '';
  }
  function listHTML() {
    var items = open(), groups = groupsOf(items);
    if (V.cat !== 'all') groups = groups.filter(function (gr) { return gr.cat === V.cat; });
    var d = done();
    return (items.length ? '<div class="s-cols">' + groups.map(function (gr) {
      return '<div class="s-cat" data-cat="' + gr.cat + '"><div class="s-cat-h"><span class="label">' + gr.cat + '</span><span class="label" data-cat-count>' + gr.items.length + '</span></div>' + gr.items.map(row).join('') + '</div>';
    }).join('') + '</div>' : '<div class="s-empty serif">All stocked up.<br><i>Nothing left to buy.</i></div>') +
      (d.length ? '<div class="s-drawer' + (V.drawer ? ' is-open' : '') + '">' +
        '<button class="s-drawer-h" data-drawer><span>' + App.icon('cart', 22) + ' In the cart <b class="num">(' + d.length + ')</b></span><span class="label">' + (V.drawer ? 'Hide' : 'Show') + '</span></button>' +
        (V.drawer ? '<div class="s-drawer-list">' + d.map(function (g) {
          return '<button class="s-got" data-revive="' + g.id + '"><s>' + App.esc(g.name) + '</s><span class="label">Add back</span></button>';
        }).join('') + '<button class="btn btn--ghost s-clear" data-clear>Clear ' + d.length + ' checked items</button></div>' : '') +
        '</div>' : '');
  }

  function suggestHTML() {
    var q = V.query.trim().toLowerCase();
    if (q) {
      var matches = D.catalog.filter(function (c) { return c[0].toLowerCase().indexOf(q) === 0; })
        .concat(D.catalog.filter(function (c) { var i = c[0].toLowerCase().indexOf(q); return i > 0; })).slice(0, 5);
      var exact = matches.some(function (m) { return m[0].toLowerCase() === q; });
      return '<div class="label">Suggestions</div><div class="s-ac">' + matches.map(function (m) {
        var on = find(m[0], false);
        return '<button class="s-ac-row" data-add="' + App.esc(m[0]) + '"><b>' + App.esc(m[0]) + '</b><span class="label">' + (on ? 'On list · ×' + on.qty : m[1]) + '</span>' + App.icon('plus', 26) + '</button>';
      }).join('') + (exact ? '' : '<button class="s-ac-row s-ac-row--new" data-add="' + App.esc(V.query.trim()) + '"><b>Add “' + App.esc(V.query.trim()) + '”</b><span class="label">' + categorize(V.query) + '</span>' + App.icon('plus', 26) + '</button>') + '</div>';
    }
    return '<div class="label">Usuals · tap to add</div><div class="s-usuals">' + D.usuals.map(usualTile).join('') + '</div>';
  }
  function usualTile(name) {
    var on = find(name, false);
    return '<button class="s-tile' + (on ? ' is-on' : '') + '" data-add="' + App.esc(name) + '">' +
      '<b>' + App.esc(name) + '</b><span>' + (on ? App.icon('check', 16) + 'On list' + (on.qty > 1 ? ' ×' + on.qty : '') : categorize(name)) + '</span></button>';
  }

  // ---- granular updates (full list + usuals rebuild costs ~500ms on the wall tablet)
  function swap(old, html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    old.parentNode.replaceChild(tmp.firstChild, old);
  }
  function refreshSuggestFor(g) {
    if (V.query.trim()) return paintSuggest();
    var t = root().querySelector('.s-usuals [data-add="' + App.esc(g.name) + '"]');
    if (t) swap(t, usualTile(g.name));
  }
  function catCount(cat) {
    var c = V.el.querySelector('.s-cat[data-cat="' + cat + '"]');
    if (!c) return;
    var n = c.querySelectorAll('.s-row').length;
    if (!n) c.parentNode.removeChild(c);
    else c.querySelector('[data-cat-count]').textContent = n;
  }
  function paintCats() { var c = V.el.querySelector('.s-rail'); if (c) c.innerHTML = catsHTML(); }
  function insertRow(g) {
    var cat = V.el.querySelector('.s-cat[data-cat="' + g.cat + '"]');
    if (!cat) return paintList();
    var tmp = document.createElement('div');
    tmp.innerHTML = row(g);
    cat.appendChild(tmp.firstChild);
    catCount(g.cat);
    paintHead();
  }
  function removeRow(g) {
    var r = V.el.querySelector('.s-list [data-id="' + g.id + '"]');
    var drawer = V.el.querySelector('.s-drawer');
    if (!r || !drawer || V.drawer || !open().length) return paintList();
    r.parentNode.removeChild(r);
    catCount(g.cat);
    drawer.querySelector('.num').textContent = '(' + done().length + ')';
    paintHead();
  }
  function flash(g) {
    var r = V.el.querySelector('.s-list [data-id="' + g.id + '"]');
    if (!r) return;
    r.classList.add('is-flash');
    if (r.scrollIntoView && !V.sheet) r.scrollIntoView({ block: 'nearest' });
    setTimeout(function () { r.classList.remove('is-flash'); }, 1200);
  }

  function paintList() { var l = V.el.querySelector('.s-list'); var st = l.scrollTop; l.innerHTML = listHTML(); l.scrollTop = st; paintHead(); }
  function paintSuggest() { var s = root().querySelector('.s-suggest'); if (s) s.innerHTML = suggestHTML(); }
  function paintHead() {
    var n = open().length;
    V.el.querySelector('.s-count').innerHTML = '<span class="num' + (n ? ' is-due' : '') + '">' + n + '</span> to get';
    paintCats();
  }
  function render() {
    V.el.innerHTML = '<div class="shop">' +
      '<header class="s-head"><div><div class="label">Shared list</div><h1 class="serif">Shopping</h1></div><div class="s-count"></div>' +
      '<button class="btn btn--solid" data-addsheet>' + App.icon('plus', 24) + 'Add item</button></header>' +
      '<nav class="s-rail cats glass" aria-label="Categories"></nav>' +
      '<div class="s-list panel glass glass--dense"></div></div>';
    paintList();
  }

  // Quick-add: the input, suggestions and usuals in a sheet. It stays open for several adds; each add toasts.
  function addSheet() {
    V.query = '';
    App.sheet('<div class="sheet-pad s-addsheet"><h2 class="sheet-h serif">Add to the list</h2>' +
      '<label class="s-input-wrap">' + App.icon('plus', 30) + '<input class="s-input" placeholder="Add an item…" autocomplete="off" enterkeyhint="done"></label>' +
      '<div class="s-suggest"></div></div>', {
      cls: 's-sheet',
      onMount: function (box) {
        V.sheet = box;
        box.addEventListener('click', onClick);
        var input = box.querySelector('.s-input');
        input.addEventListener('input', function () { V.query = input.value; paintSuggest(); });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && input.value.trim()) { add(input.value); } });
        paintSuggest();
      },
      onClose: function () { V.sheet = null; V.query = ''; }
    });
  }

  // Quantity: rare, so behind the row's pill. One write to Bring! after the last tap (debounced).
  function qtySheet(g) {
    function body() {
      return '<div class="sheet-pad"><h2 class="sheet-h serif">' + App.esc(g.name) + '</h2><div class="s-qty">' +
        '<button data-q="-1" aria-label="Less">' + App.icon('minus', 28) + '</button><span class="num">' + g.qty + '</span>' +
        '<button data-q="1" aria-label="More">' + App.icon('plus', 28) + '</button></div>' +
        '<div class="sheet-actions"><button class="btn btn--solid" data-close>Done</button></div></div>';
    }
    App.sheet(body(), {
      onMount: function (box) {
        box.addEventListener('click', function (e) {
          var b = e.target.closest('[data-q]');
          if (!b) return;
          g.qty = Math.max(1, g.qty + +b.dataset.q);
          box.querySelector('.s-qty .num').textContent = g.qty;
          clearTimeout(V.qtyTimer[g.id]);
          V.qtyTimer[g.id] = setTimeout(function () { sync('add', g); }, 700);
        });
      },
      onClose: function () { paintList(); App.emit('data'); }
    });
  }

  function add(name) {
    name = name.trim();
    var g = find(name, false), msg;
    if (g) {
      g.qty++;
      msg = 'Already on the list · now <b>×' + g.qty + '</b> ' + App.esc(g.name);
      var q = V.el.querySelector('.s-list [data-id="' + g.id + '"] .s-q');
      if (q) q.textContent = '×' + g.qty;
    } else if ((g = find(name, true))) {
      g.done = false; g.qty = 1;
      msg = 'Added back <b>' + App.esc(g.name) + '</b>';
      paintList();
    } else {
      var cat = D.catalog.filter(function (c) { return c[0].toLowerCase() === name.toLowerCase(); })[0];
      g = { id: D._gid(), name: cat ? cat[0] : name.charAt(0).toUpperCase() + name.slice(1), cat: categorize(name), qty: 1, store: 'grocer', done: false, note: '' };
      D.groceries.push(g);
      msg = 'Added <b>' + App.esc(g.name) + '</b> to ' + g.cat;
      insertRow(g);
    }
    sync('add', g);
    var hadQuery = !!V.query.trim();
    V.query = '';
    var input = root().querySelector('.s-input');
    if (input) input.value = '';
    if (hadQuery) paintSuggest(); else refreshSuggestFor(g);
    flash(g);
    App.emit('data');
    App.toast(msg, { icon: 'cart', ms: 3000 });
  }

  function check(g) {
    V.pending[g.id] = true;
    var rowEl = V.el.querySelector('[data-id="' + g.id + '"]');
    rowEl.classList.add('is-checking');
    setTimeout(function () {
      if (!V.pending[g.id]) return;
      delete V.pending[g.id];
      g.done = true;
      removeRow(g);
      refreshSuggestFor(g);
      sync('done', g);
      App.emit('data');
    }, 1200);
    App.toast('<b>' + App.esc(g.name) + '</b> checked off', {
      icon: 'check',
      undo: function () {
        var wasDone = g.done;
        delete V.pending[g.id];
        g.done = false;
        if (wasDone) { paintList(); sync('add', g); }
        else { var r = V.el.querySelector('.s-list [data-id="' + g.id + '"]'); if (r) r.classList.remove('is-checking'); }
        refreshSuggestFor(g);
        App.emit('data');
      }
    });
  }

  function onClick(e) {
    var t;
    if ((t = e.target.closest('[data-check]'))) {
      var g = D.groceries.filter(function (x) { return x.id === t.dataset.check; })[0];
      if (g && !V.pending[g.id]) check(g);
      else if (g) { delete V.pending[g.id]; t.parentNode.classList.remove('is-checking'); }
      return;
    }
    if ((t = e.target.closest('[data-qsheet]'))) return qtySheet(D.groceries.filter(function (x) { return x.id === t.dataset.qsheet; })[0]);
    if ((t = e.target.closest('[data-addsheet]'))) return addSheet();
    if ((t = e.target.closest('[data-filter]'))) { V.cat = t.dataset.filter; paintList(); V.el.querySelector('.s-list').scrollTop = 0; return; }
    if ((t = e.target.closest('[data-add]'))) return add(t.dataset.add);
    if ((t = e.target.closest('[data-drawer]'))) { V.drawer = !V.drawer; return paintList(); }
    if ((t = e.target.closest('[data-revive]'))) {
      var r = D.groceries.filter(function (x) { return x.id === t.dataset.revive; })[0];
      r.done = false; sync('add', r); paintList(); App.emit('data');
      return App.toast('Added back <b>' + App.esc(r.name) + '</b>', { icon: 'cart', ms: 2500 });
    }
    if ((t = e.target.closest('[data-clear]'))) {
      var gone = done();
      D.groceries = D.groceries.filter(function (x) { return gone.indexOf(x) < 0; });
      V.drawer = false;
      paintList();
      App.toast('Cleared ' + gone.length + ' items', {
        icon: 'check', undo: function () { D.groceries = D.groceries.concat(gone); paintList(); }
      });
    }
  }

  // Fresh list from Bring!: repaint if we're on screen (other views are rebuilt lazily). Not mid check-off animation.
  App.on('shopping', function () {
    if (App.current !== 'shopping' || !V.el || !V.el.firstChild || Object.keys(V.pending).length) return;
    paintList(); paintSuggest();
  });

  App.register('shopping', {
    show: function (el) {
      if (!V.el) { V.el = el; el.addEventListener('click', onClick); }
      V.cat = 'all';
      render();
    }
  });
})();
