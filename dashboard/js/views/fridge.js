// Fridge: what the REWE receipts say we bought, by section. Tap marks a purchase used up (Undo, or put it
// back from the Used list). Use-by dates are estimates from the purchase date (calc.js): receipts have none,
// so the tags say "~" and "Past est."
import { fridgeRows, SECTIONS } from '../../calc.js';

(function () {
  'use strict';
  var D = window.DATA;
  var V = { el: null, showUsed: false, cat: 'all' }; // cat: 'soon', 'past', 'all' or a section name
  var EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  var OVERDUE = 18 * 36e5; // the longest gap between job runs is about 15 h

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
    return '<button class="f-row" data-rm="' + r.ids.join(' ') + '" aria-label="' + (V.showUsed ? 'Put back ' : 'Used up ') + App.esc(r.label) + '">' +
      '<span class="f-name"><b>' + App.esc(r.label) + '</b><small>' + (r.qty > 1 ? '<em>×' + r.qty + '</em>' : '') + '<span>' + bought(r) + '</span>' + (r.total ? '<span class="f-eur">' + EUR.format(r.total) + '</span>' : '') + '</small></span>' +
      (V.showUsed ? '' : tag(r)) + '<span class="f-x">' + App.icon(V.showUsed ? 'plus' : 'x', 22) + '</span></button>';
  }
  function group(name, list) {
    return list.length ? '<section class="f-sec"><h2 class="f-h"><span class="serif">' + name + '</span><span class="f-n">' + list.length + '</span></h2>' + list.map(row).join('') + '</section>' : '';
  }
  function sections(list) {
    return '<div class="f-cols">' + SECTIONS.map(function (s) { return group(s, list.filter(function (r) { return r.section === s; })); }).join('') + '</div>';
  }
  function byState(rows, state) { return rows.filter(function (r) { return r.state === state; }); }

  // Category rail: Use soon and Check these first (the reasons to open the fridge), then All and each section
  function cat(id, label, n, cls) {
    return '<button class="cat' + (cls ? ' ' + cls : '') + (V.cat === id ? ' is-on' : '') + '" data-cat="' + App.esc(id) + '" aria-pressed="' + (V.cat === id) + '"><span>' + label + '</span><b>' + n + '</b></button>';
  }
  function railHTML(all) {
    var soon = byState(all, 'soon').length, past = byState(all, 'past').length;
    return (soon ? cat('soon', 'Use soon', soon, 'cat--soon') : '') + (past ? cat('past', 'Check these', past) : '') +
      cat('all', 'All', all.length) + '<div class="cats-sep"></div>' +
      SECTIONS.map(function (sec) { var n = all.filter(function (r) { return r.section === sec; }).length; return n ? cat(sec, App.esc(sec), n) : ''; }).join('');
  }
  function listFor(all) {
    if (V.cat === 'soon') return group('Use soon · estimate', byState(all, 'soon'));
    if (V.cat === 'past') return group('Past the estimate · still there?', byState(all, 'past'));
    return sections(V.cat === 'all' ? all : all.filter(function (r) { return r.section === V.cat; }));
  }
  // A category that emptied (last item used up) falls back to All
  function validCat(all) {
    var ok = V.cat === 'all' || all.some(function (r) { return V.cat === 'soon' || V.cat === 'past' ? r.state === V.cat : r.section === V.cat; });
    if (!ok) V.cat = 'all';
  }

  function checked() {
    var m = D.fridgeMeta, d = m && m.updatedAt && new Date(m.updatedAt);
    if (m && m.status === 'error') return m.message || 'Last receipt check failed';
    if (!d) return '';
    var t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return 'Receipts checked ' + (App.dayStart(d).getTime() === App.dayStart(App.now()).getTime() ? t : d.getDate() + '.' + (d.getMonth() + 1) + '. ' + t);
  }

  function overdue() {
    var d = D.fridgeMeta && D.fridgeMeta.updatedAt;
    return !!d && App.now() - new Date(d) > OVERDUE;
  }

  function paint() {
    var now = App.now(), all = fridgeRows(D.fridge, now), used = fridgeRows(D.fridge, now, true), soon = byState(all, 'soon');
    var total = all.reduce(function (sum, r) { return sum + r.total; }, 0);
    var list = V.el.querySelector('.f-list'), rail = V.el.querySelector('.f-rail'), btn = V.el.querySelector('.f-used'), st = list.scrollTop;
    if (!used.length) V.showUsed = false;
    V.el.querySelector('.s-count').innerHTML = '<span class="num">' + all.length + '</span> ' + (all.length === 1 ? 'item' : 'items') +
      (soon.length ? ' · <span class="num">' + soon.length + '</span> to use soon' : '') + (total ? ' · ' + EUR.format(total) : '');
    V.el.querySelector('.f-checked').textContent = checked();
    V.el.querySelector('.f-over').hidden = !overdue();
    btn.hidden = !used.length;
    btn.textContent = 'Used ' + used.length;
    btn.classList.toggle('is-on', V.showUsed);
    btn.setAttribute('aria-pressed', V.showUsed);
    validCat(all);
    rail.innerHTML = V.showUsed || !all.length ? '' : railHTML(all);
    list.innerHTML = V.showUsed ? sections(used) : all.length ? (V.cat === 'soon' || V.cat === 'past' ? '<div class="f-cols f-one">' + listFor(all) + '</div>' : listFor(all))
      : '<div class="s-empty serif">' + (used.length ? 'All used up.' : 'No receipts yet.') + '<br><i>The next REWE shop lands here.</i></div>';
    list.scrollTop = st;
  }

  function render() {
    // Opens on what needs eating: Use soon when there is any, otherwise everything
    V.cat = byState(fridgeRows(D.fridge, App.now()), 'soon').length ? 'soon' : 'all';
    V.el.innerHTML = '<div class="fridge">' +
      '<header class="s-head"><h1 class="serif">Fridge</h1><div class="s-count"></div><div class="f-checked"></div><span class="f-tag f-over" hidden>Overdue</span><button class="f-used" data-used hidden></button></header>' +
      '<nav class="f-rail cats glass" aria-label="Sections"></nav><div class="f-list panel glass glass--dense"></div></div>';
    paint();
  }

  // A row can hold several purchases: tapping it means "we're out of this", so they all go.
  function mark(ids, used) {
    D.fridge.forEach(function (f) { if (ids.indexOf(f.id) > -1) f.used = used; });
    App.fridgeUse(ids, used);
    paint();
    App.emit('data');
  }
  function tap(ids, label) {
    var used = !V.showUsed;
    mark(ids, used);
    App.toast('<b>' + App.esc(label) + '</b> ' + (used ? 'used up' : 'put back'), {
      icon: 'check', ms: 6000,
      undo: function () { mark(ids, !used); }
    });
  }

  App.on('fridge', function () { if (App.current === 'fridge' && V.el && V.el.firstChild) paint(); });

  App.register('fridge', {
    show: function (el) {
      if (!V.el) {
        V.el = el;
        el.addEventListener('click', function (e) {
          var t = e.target.closest('[data-rm]');
          if (t) tap(t.dataset.rm.split(' '), t.querySelector('b').textContent);
          else if (e.target.closest('[data-used]')) { V.showUsed = !V.showUsed; paint(); }
          else if ((t = e.target.closest('[data-cat]'))) { V.cat = t.dataset.cat; paint(); V.el.querySelector('.f-list').scrollTop = 0; }
        });
      }
      render();
    }
  });
})();
