// Fridge: what's in it (left, soonest expiry first) + quick add (right). Backed by a second Bring!
// list through /api/fridge; reuses the Shopping view's layout classes (css/views/shopping.css).
import { withExpiry, daysLeft } from '../../calc.js';

(function () {
  'use strict';
  var D = window.DATA;
  var V = { el: null, query: '', qtyTimer: {} };
  var EXPIRY = [['Today', 0], ['+2 days', 2], ['+3 days', 3], ['+1 week', 7], ['+2 weeks', 14], ['No date', null]];

  // Bring! write-through (no-op in a bare build where fetch.js hasn't defined it)
  function sync(op, f) { if (App.fridgeSync) App.fridgeSync(op, f); }
  function byId(id) { return D.fridge.filter(function (f) { return f.id === id; })[0]; }
  function find(name) { return D.fridge.filter(function (f) { return f.name.toLowerCase() === name.toLowerCase(); })[0]; }
  function left(f) { return daysLeft(f.note, App.now()); }
  function soon(f) { var d = left(f); return d !== null && d <= 2; }
  function expLabel(d) { return d < 0 ? 'Expired' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : 'In ' + d + ' days'; }

  function row(f) {
    var d = left(f), rest = withExpiry(f.note, null);
    return '<div class="s-row" data-id="' + f.id + '">' +
      '<button class="s-hit" data-open="' + f.id + '">' +
      '<span class="s-name"><b>' + App.esc(f.name) + '</b>' +
      (d !== null || rest ? '<small>' + (d !== null ? '<span class="f-exp' + (d <= 1 ? ' is-due' : '') + '">' + expLabel(d) + '</span>' : '') + App.esc(rest) + '</small>' : '') +
      '</span></button>' +
      '<div class="s-qty"><button data-qty="-1" data-id="' + f.id + '" aria-label="Less">' + App.icon('minus', 22) + '</button><span class="num">' + f.qty + '</span><button data-qty="1" data-id="' + f.id + '" aria-label="More">' + App.icon('plus', 22) + '</button></div>' +
      '</div>';
  }

  function listHTML() {
    if (!D.fridge.length) return '<div class="s-empty serif">Fridge is empty.<br><i>Tap what’s in it on the right.</i></div>';
    var order = ['Use soon'].concat(D.catOrder.all, ['Other']);
    var key = function (f) { var d = left(f); return d === null ? 999 : d; };
    return order.map(function (cat) {
      var items = D.fridge.filter(function (f) { return (soon(f) ? 'Use soon' : f.cat) === cat; })
        .sort(function (a, b) { return key(a) - key(b); });
      return items.length ? '<div class="s-cat"><div class="s-cat-h"><span class="label">' + cat + '</span><span class="label">' + items.length + '</span></div>' + items.map(row).join('') + '</div>' : '';
    }).join('');
  }

  function tile(name) {
    var on = find(name);
    return '<button class="s-tile' + (on ? ' is-on' : '') + '" data-add="' + App.esc(name) + '">' +
      '<b>' + App.esc(name) + '</b><span>' + (on ? App.icon('check', 16) + 'In fridge' + (on.qty > 1 ? ' ×' + on.qty : '') : App.categorize(name)) + '</span></button>';
  }
  function suggestHTML() {
    var q = V.query.trim().toLowerCase();
    if (!q) return '<div class="label">Usuals · tap to add</div><div class="s-usuals">' + D.fridgeUsuals.map(tile).join('') + '</div>';
    var matches = D.catalog.filter(function (c) { return c[0].toLowerCase().indexOf(q) > -1; }).slice(0, 5);
    var exact = matches.some(function (m) { return m[0].toLowerCase() === q; });
    return '<div class="label">Suggestions</div><div class="s-ac">' + matches.map(function (m) {
      var on = find(m[0]);
      return '<button class="s-ac-row" data-add="' + App.esc(m[0]) + '"><b>' + App.esc(m[0]) + '</b><span class="label">' + (on ? 'In fridge · ×' + on.qty : m[1]) + '</span>' + App.icon('plus', 26) + '</button>';
    }).join('') + (exact ? '' : '<button class="s-ac-row s-ac-row--new" data-add="' + App.esc(V.query.trim()) + '"><b>Add “' + App.esc(V.query.trim()) + '”</b>' + App.icon('plus', 26) + '</button>') + '</div>';
  }

  function paintList() { var l = V.el.querySelector('.s-list'); var st = l.scrollTop; l.innerHTML = listHTML(); l.scrollTop = st; paintHead(); }
  function paintSuggest() { V.el.querySelector('.s-suggest').innerHTML = suggestHTML(); }
  function paintHead() {
    var n = D.fridge.filter(soon).length;
    V.el.querySelector('.s-count').innerHTML = '<span class="num">' + D.fridge.length + '</span> items' + (n ? ' · <span class="num">' + n + '</span> to use soon' : '');
  }
  function render() {
    V.el.innerHTML = '<div class="shop">' +
      '<header class="s-head"><div><div class="label">Shared list</div><h1 class="serif">Fridge</h1></div><div class="s-count"></div></header>' +
      '<div class="s-list"></div>' +
      '<aside class="s-side">' +
      '  <div class="s-add">' +
      '    <label class="s-input-wrap">' + App.icon('plus', 30) + '<input class="s-input" placeholder="Put something in…" autocomplete="off" enterkeyhint="done"></label>' +
      '  </div>' +
      '  <div class="s-suggest"></div>' +
      '</aside></div>';
    var input = V.el.querySelector('.s-input');
    input.value = V.query;
    input.addEventListener('input', function () { V.query = input.value; paintSuggest(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && input.value.trim()) add(input.value); });
    paintList(); paintSuggest();
  }
  function repaint() { paintList(); paintSuggest(); App.emit('data'); }

  function add(name) {
    name = name.trim();
    var f = find(name), msg;
    if (f) {
      f.qty++;
      msg = 'Already in the fridge · now <b>×' + f.qty + '</b> ' + App.esc(f.name);
    } else {
      var cat = D.catalog.filter(function (c) { return c[0].toLowerCase() === name.toLowerCase(); })[0];
      f = { id: D._gid(), name: cat ? cat[0] : name.charAt(0).toUpperCase() + name.slice(1), note: '', qty: 1, cat: App.categorize(name) };
      D.fridge.push(f);
      msg = 'Put <b>' + App.esc(f.name) + '</b> in the fridge';
    }
    sync('add', f);
    V.query = '';
    V.el.querySelector('.s-input').value = '';
    repaint();
    App.toast(msg, { icon: 'fridge', ms: 3000 });
  }

  function addToShopping(name) {
    var g = D.groceries.filter(function (x) { return !x.done && x.name.toLowerCase() === name.toLowerCase(); })[0];
    if (g) return App.toast('<b>' + App.esc(name) + '</b> is already on the shopping list', { icon: 'cart', ms: 2500 });
    g = { id: D._gid(), name: name, cat: App.categorize(name), qty: 1, store: 'grocer', done: false, note: '' };
    D.groceries.push(g);
    if (App.shopSync) App.shopSync('add', g);
    App.emit('data');
    App.emit('shopping');
    App.toast('Added <b>' + App.esc(name) + '</b> to the shopping list', { icon: 'cart', ms: 2500 });
  }

  function usedUp(f) {
    D.fridge = D.fridge.filter(function (x) { return x !== f; });
    clearTimeout(V.qtyTimer[f.id]);
    sync('remove', f);
    repaint();
    App.toast('<b>' + App.esc(f.name) + '</b> used up', {
      icon: 'check', ms: 6000,
      action: { label: App.icon('cart', 22) + 'Add to list', fn: function () { addToShopping(f.name); } }
    });
  }

  function openItem(f) {
    App.sheet('<div class="sheet-pad"><div class="label">In the fridge · ×' + f.qty + '</div><h2 class="serif sheet-h">' + App.esc(f.name) + '</h2>' +
      '<p class="sheet-p">Good until…</p>' +
      '<div class="f-chips">' + EXPIRY.map(function (x, i) { return '<button class="btn" data-exp="' + i + '">' + x[0] + '</button>'; }).join('') + '</div>' +
      '<div class="sheet-actions"><button class="btn btn--solid" data-used>' + App.icon('check', 22) + ' Used up</button></div></div>', {
      onMount: function (s, close) {
        s.addEventListener('click', function (e) {
          var fresh = byId(f.id) || f, b;
          if ((b = e.target.closest('[data-exp]'))) {
            var days = EXPIRY[+b.dataset.exp][1];
            fresh.note = withExpiry(fresh.note, days === null ? null : App.addDays(App.dayStart(App.now()), days));
            sync('add', fresh);
            close();
            repaint();
          } else if (e.target.closest('[data-used]')) {
            close();
            usedUp(fresh);
          }
        });
      }
    });
  }

  function onClick(e) {
    var t;
    if ((t = e.target.closest('[data-qty]'))) {
      var f = byId(t.dataset.id);
      if (!f) return;
      if (f.qty + +t.dataset.qty < 1) return usedUp(f);
      f.qty += +t.dataset.qty;
      t.parentNode.querySelector('.num').textContent = f.qty;
      clearTimeout(V.qtyTimer[f.id]); // debounce: one write after the last tap
      V.qtyTimer[f.id] = setTimeout(function () { sync('add', f); }, 700);
      return;
    }
    if ((t = e.target.closest('[data-open]'))) { var o = byId(t.dataset.open); if (o) openItem(o); return; }
    if ((t = e.target.closest('[data-add]'))) add(t.dataset.add);
  }

  // Fresh list from Bring!: repaint if we're on screen (other views are rebuilt lazily)
  App.on('fridge', function () {
    if (App.current !== 'fridge' || !V.el || !V.el.firstChild) return;
    paintList(); paintSuggest();
  });

  App.register('fridge', {
    show: function (el) {
      if (!V.el) { V.el = el; el.addEventListener('click', onClick); }
      render();
    }
  });
})();
