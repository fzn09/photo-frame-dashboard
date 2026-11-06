// Fridge: what the REWE receipts say we bought, by section. View and remove only. Use-by dates are
// estimates from the purchase date (calc.js): receipts have none, so the tags say "~" and "Past est."
import { fridgeRows, SECTIONS } from '../../calc.js';

(function () {
  'use strict';
  var D = window.DATA;
  var V = { el: null };

  function tag(r) {
    if (r.state === 'past') return '<span class="f-tag">Past est.</span>';
    if (r.state !== 'soon') return '';
    return '<span class="f-tag is-soon">' + (r.left === 0 ? 'Today' : r.left === 1 ? 'Tomorrow' : '~' + r.left + ' days') + '</span>';
  }
  function bought(r) {
    if (r.newest !== r.age) return r.newest + '–' + r.age + ' days ago';
    return r.age <= 0 ? 'Today' : r.age === 1 ? 'Yesterday' : r.age + ' days ago';
  }
  function row(r) {
    return '<button class="f-row" data-rm="' + r.ids.join(' ') + '" aria-label="Remove ' + App.esc(r.label) + '">' +
      '<span class="f-name"><b>' + App.esc(r.label) + '</b><small>' + (r.qty > 1 ? '×' + r.qty + ' · ' : '') + bought(r) + '</small></span>' +
      tag(r) + '<span class="f-x">' + App.icon('x', 22) + '</span></button>';
  }
  function group(name, list) {
    return list.length ? '<section class="f-sec"><div class="s-cat-h"><span class="label">' + name + '</span><span class="label">' + list.length + '</span></div>' + list.map(row).join('') + '</section>' : '';
  }
  function sections(list) {
    return '<div class="f-cols">' + SECTIONS.map(function (s) { return group(s, list.filter(function (r) { return r.section === s; })); }).join('') + '</div>';
  }
  function byState(rows, state) { return rows.filter(function (r) { return r.state === state; }); }

  function checked() {
    var m = D.fridgeMeta, d = m && m.updatedAt && new Date(m.updatedAt);
    if (m && m.status === 'error') return m.message || 'Last receipt check failed';
    if (!d) return '';
    var t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return 'Receipts checked ' + (App.dayStart(d).getTime() === App.dayStart(App.now()).getTime() ? t : d.getDate() + '.' + (d.getMonth() + 1) + '. ' + t);
  }

  function paint() {
    var all = fridgeRows(D.fridge, App.now()), soon = byState(all, 'soon');
    var list = V.el.querySelector('.f-list'), rail = V.el.querySelector('.f-rail'), st = list.scrollTop;
    V.el.querySelector('.s-count').innerHTML = '<span class="num">' + all.length + '</span> ' + (all.length === 1 ? 'item' : 'items') +
      (soon.length ? ' · <span class="num">' + soon.length + '</span> to use soon' : '');
    V.el.querySelector('.f-checked').textContent = checked();
    rail.innerHTML = group('Use soon · estimate', soon) + group('Check these', byState(all, 'past'));
    list.innerHTML = all.length ? sections(byState(all, '')) : '<div class="s-empty serif">No receipts yet.<br><i>The next REWE shop lands here.</i></div>';
    list.scrollTop = st;
  }

  function render() {
    V.el.innerHTML = '<div class="fridge">' +
      '<header class="s-head"><h1 class="serif">Fridge</h1><div class="s-count"></div><div class="f-checked"></div></header>' +
      '<aside class="f-rail"></aside><div class="f-list"></div></div>';
    paint();
  }

  // A row can hold several purchases: removing it means "we're out of this", so they all go.
  function remove(ids, label) {
    var gone = D.fridge.filter(function (f) { return ids.indexOf(f.id) > -1; });
    D.fridge = D.fridge.filter(function (f) { return ids.indexOf(f.id) < 0; });
    if (App.fridgeUse) ids.forEach(function (id) { App.fridgeUse(id, true); });
    paint();
    App.emit('data');
    App.toast('<b>' + App.esc(label) + '</b> removed', {
      icon: 'check', ms: 6000,
      undo: function () {
        D.fridge = D.fridge.concat(gone);
        if (App.fridgeUse) ids.forEach(function (id) { App.fridgeUse(id, false); });
        paint();
        App.emit('data');
      }
    });
  }

  App.on('fridge', function () { if (App.current === 'fridge' && V.el && V.el.firstChild) paint(); });

  App.register('fridge', {
    show: function (el) {
      if (!V.el) {
        V.el = el;
        el.addEventListener('click', function (e) {
          var t = e.target.closest('[data-rm]');
          if (t) remove(t.dataset.rm.split(' '), t.querySelector('b').textContent);
        });
      }
      render();
    }
  });
})();
