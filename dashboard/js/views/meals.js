// Meals: Cookidoo week plan. Week strip on top, the chosen day's recipes below; a tap opens the recipe sheet,
// which Today and Calendar reuse. The plan has no meal slot or time, so nothing here implies one.
(function () {
  'use strict';
  var D = window.DATA, V = { el: null, day: null, today: null }, cache = {};
  var DAYS = [0, 1, 2, 3, 4, 5, 6], RETRY = [3000, 10000];

  function key(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function monday() { var d = App.dayStart(App.now()); return App.addDays(d, -((d.getDay() + 6) % 7)); }
  function find(id) {
    var hit = null;
    D.meals.days.forEach(function (d) { d.recipes.forEach(function (r) { if (r.id === id) hit = r; }); });
    return hit || { id: id, name: '', min: 0, img: '', photo: '' };
  }
  function mins(m) { return m >= 60 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + m % 60 + ' min' : '') : m + ' min'; }
  function pic(src) { return src ? '<img src="' + App.esc(src) + '" alt="">' : '<div class="m-noimg">' + App.icon('utensils', 28) + '</div>'; }

  App.mealsOn = function (day) {
    if (!App.enabled('meals')) return [];
    var k = key(day), m = D.meals.days.filter(function (d) { return d.date === k; })[0];
    return m ? m.recipes : [];
  };
  App.mealThumb = function (r) { return r.img ? '<img src="' + App.esc(r.img) + '" alt="">' : '<span class="m-noimg">' + App.icon('utensils', 20) + '</span>'; };

  // The week feed has no ingredients, so cards and the sheet load the recipe once. Sample meals come from data.js.
  function load(m, tries) {
    tries = tries || 0;
    if (cache[m.id]) return Promise.resolve(cache[m.id]);
    if (D.recipes[m.id]) return Promise.resolve(D.recipes[m.id]);
    return fetch('/api/meals/recipe?id=' + encodeURIComponent(m.id) + (m.custom ? '&custom=1' : ''))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (r) { cache[m.id] = r; return r; })
      .catch(function (err) {
        if (tries >= RETRY.length) throw err;
        return new Promise(function (ok) { setTimeout(ok, RETRY[tries]); }).then(function () { return load(m, tries + 1); });
      });
  }

  // The kiosk does not retry images: give a picture two more chances, then its tinted box stays.
  document.addEventListener('error', function (e) {
    var im = e.target, n = im.tagName === 'IMG' ? +im.dataset.tries || 0 : 2;
    if (n > 1 || im.src.indexOf('/api/meals/img') < 0) return;
    im.dataset.tries = n + 1;
    setTimeout(function () { im.src = im.src; }, 8000 * (n + 1));
  }, true);

  // ---- recipe sheet
  function fact(label, value) { return value ? [label, value] : null; }
  function recipeBody(r) {
    var f = [fact('Total', r.total && mins(r.total)), fact('Active', r.active && mins(r.active)), fact('Level', r.level),
      fact('Per ' + (r.per || 'portion'), r.kcal && r.kcal + ' kcal')].filter(Boolean);
    return '<div class="r-top">' + pic(r.img) + '<div><h2 class="r-title">' + App.esc(r.name) + '</h2>' +
      '<dl class="r-facts">' + f.map(function (x) { return '<div><dt>' + App.esc(x[0]) + '</dt><dd>' + App.esc(x[1]) + '</dd></div>'; }).join('') + '</dl>' +
      '<p class="r-note">' + App.esc([r.serves, r.tm].filter(Boolean).join(' · ')) + '</p></div></div>' +
      '<div class="r-cols"><div class="r-col"><h3>Ingredients</h3><ul class="r-ing">' + r.ingredients.map(ingredient).join('') + '</ul></div>' +
      '<div class="r-col"><h3>Steps</h3><ol class="r-steps">' + r.steps.map(step).join('') + '</ol></div></div>';
  }
  function ingredient(i) { return '<li><b>' + App.esc(i.q) + '</b><span>' + App.esc(i.name) + (i.note ? ', ' + App.esc(i.note) : '') + '</span></li>'; }
  // A step is [text, settings, text, ...]: odd parts are the Thermomix settings
  function step(parts) { return '<li><span>' + parts.map(function (p, i) { return i % 2 ? '<b class="r-tts">' + App.esc(p) + '</b>' : App.esc(p); }).join('') + '</span></li>'; }

  App.recipeSheet = function (id) {
    var m = find(id);
    App.sheet('<div class="sheet-pad"><div class="r"><div class="r-wait serif">' + (m.name ? App.esc(m.name) : 'Recipe') + '<br><i>Loading recipe…</i></div></div></div>', {
      cls: 'sheet--recipe',
      onMount: function (s) {
        var box = s.querySelector('.r');
        function fill() {
          load(m).then(function (r) { box.innerHTML = recipeBody(r); }).catch(function (err) {
            var hint = err instanceof TypeError ? 'Check the Wi-Fi, then try again.' : 'Cookidoo didn’t answer. Try again in a minute.'; // fetch rejects with TypeError when offline
            box.innerHTML = '<div class="r-wait serif">Couldn’t load this recipe.<br><i>' + hint + '</i><button class="btn" data-retry>Try again</button></div>';
          });
        }
        s.addEventListener('click', function (e) { if (e.target.closest('[data-retry]')) fill(); });
        fill();
      }
    });
  };

  // ---- view
  function head() {
    var n = 0, age = App.feedAge ? App.feedAge('meals') : 0;
    DAYS.forEach(function (i) { n += App.mealsOn(App.addDays(monday(), i)).length; });
    return '<h1 class="serif">Meals</h1><small>' + (n ? n + (n === 1 ? ' recipe' : ' recipes') + ' this week' : 'Nothing planned this week') + '</small>' +
      '<span class="m-age"' + (age ? '>Updated ' + (age < 90 ? age + ' min' : Math.round(age / 60) + ' h') + ' ago' : ' hidden>') + '</span>' +
      (D.meals.device ? '<div class="m-device">' + App.icon('jug', 24) + '<span><b>Thermomix ' + App.esc(D.meals.device) + '</b> · paired</span></div>' : '');
  }
  function strip() {
    var now = App.dayStart(App.now());
    return DAYS.map(function (i) {
      var d = App.addDays(monday(), i), k = key(d);
      return '<button class="mc-day' + (+d === +now ? ' is-today' : '') + (d < now ? ' is-past' : '') + (k === V.day ? ' is-on' : '') + '" data-day="' + k + '">' +
        '<span><b>' + App.fmt.dayShort(d) + '</b><span class="num">' + d.getDate() + '</span></span>' +
        '<span class="mc-th">' + App.mealsOn(d).slice(0, 3).map(App.mealThumb).join('') + '</span></button>';
    }).join('');
  }
  function card(r) {
    return '<button class="mc-card card' + (r.photo ? '' : ' mc-card--plain') + '" data-meal="' + App.esc(r.id) + '">' + (r.photo ? pic(r.photo) : '') + '<div class="mc-in"><h2 class="mc-t">' + App.esc(r.name) + '</h2>' +
      '<div class="mc-meta">' + (r.min ? '<b class="num">' + mins(r.min) + '</b>' : '') + '<span data-serves></span></div><ul class="r-ing" data-ing><li class="mc-note">Loading ingredients…</li></ul><span class="mc-more" data-more>Open recipe</span></div></button>';
  }
  function cardRow(i) { return '<li><b>' + App.esc(i.q) + '</b><span>' + App.esc(i.name) + '</span></li>'; } // notes stay in the sheet

  // Ingredients arrive after the card. Rows wrap, so only the rendered card knows how many fit: drop rows from the
  // end until nothing overflows, and name what was left out.
  function fillCard(r, max) {
    function slot(sel) { var c = V.el.querySelector('[data-meal="' + App.esc(r.id) + '"]'); return c && c.querySelector(sel); }
    load(r).then(function (full) {
      var ing = slot('[data-ing]'), rows, card, rest;
      if (!ing) return;
      ing.innerHTML = full.ingredients.slice(0, max).map(cardRow).join('');
      slot('[data-serves]').textContent = full.serves || '';
      rows = ing.children;
      card = ing.parentNode.parentNode;
      while (rows.length > 1 && card.scrollHeight > card.clientHeight) ing.removeChild(rows[rows.length - 1]);
      rest = full.ingredients.length - rows.length;
      if (rest > 0) slot('[data-more]').textContent = 'Open recipe · ' + rest + ' more ingredient' + (rest > 1 ? 's' : '');
    }).catch(function () {
      var ing = slot('[data-ing]');
      if (ing) ing.innerHTML = '<li class="mc-note">Ingredients didn’t load</li>';
    });
  }
  function paintMain() {
    var d = new Date(V.day + 'T12:00:00'), list = App.mealsOn(d);
    var main = V.el.querySelector('.mc-main'), n = list.length;
    main.dataset.n = Math.min(n, 3);
    main.innerHTML = n ? list.map(card).join('') :
      '<div class="m-empty serif"><span>Nothing planned for ' + App.fmt.day(d) + '.<br><i>Plan it in Cookidoo and it shows up here.</i></span></div>';
    list.forEach(function (r) { fillCard(r, n === 1 ? 12 : n === 2 ? 10 : 5); });
  }
  function paintHead() {
    var h = head();
    if (h !== V.head) V.el.querySelector('.m-head').innerHTML = V.head = h; // the minute tick rarely changes it
  }
  function paint() {
    paintHead();
    V.el.querySelector('.mc-strip').innerHTML = strip();
    paintMain();
  }
  function today() { V.today = key(App.now()); V.day = V.today; }

  App.on('meals', function () { if (App.current === 'meals') paint(); });
  App.on('minute', function () {
    if (App.current !== 'meals') return;
    if (key(App.now()) !== V.today) { today(); paint(); return; } // midnight: move on to the new day
    paintHead();
  });

  App.register('meals', {
    show: function (el) {
      if (!V.el) {
        V.el = el;
        el.innerHTML = '<div class="m"><div class="m-head"></div><div class="mc-strip"></div><div class="mc-main"></div></div>';
        el.addEventListener('click', function (e) {
          var t = e.target.closest('[data-day]');
          if (t) {
            V.day = t.dataset.day;
            App.$$('.mc-day', el).forEach(function (b) { b.classList.toggle('is-on', b === t); });
            return paintMain();
          }
          if ((t = e.target.closest('[data-meal]'))) App.recipeSheet(t.dataset.meal);
        });
      }
      today();
      paint();
    }
  });
})();
