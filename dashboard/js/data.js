// Mock data for the prototype. Everything is relative to "today" so the demo always looks current.
window.DATA = (function () {
  var base = new Date();
  base.setHours(0, 0, 0, 0);

  function at(d, hm) {
    var p = hm.split(':');
    var x = new Date(base);
    x.setDate(x.getDate() + d);
    x.setHours(+p[0], +p[1], 0, 0);
    return x;
  }
  var n = 0;
  function ev(d, s, e, title, people, extra) {
    return Object.assign({ id: 'e' + (++n), start: at(d, s), end: at(d, e), title: title, people: people }, extra || {});
  }
  function allDay(d, days, title, people, extra) {
    return Object.assign({ id: 'e' + (++n), allDay: true, start: at(d, '00:00'), end: at(d + days, '00:00'), title: title, people: people }, extra || {});
  }

  // ids match the Worker's CAL_<ID> secrets: alex = Fauzan (CAL_ALEX), jordan = Amanda (CAL_JORDAN)
  var ALL = ['alex', 'jordan'];

  var people = [
    { id: 'alex', name: 'Fauzan', color: '#2D5BFF', rgb: '45 91 255', ink: '#FFFFFF', home: false, status: 'Driving home', eta: 12 },
    { id: 'jordan', name: 'Amanda', color: '#E4007C', rgb: '228 0 124', ink: '#FFFFFF', home: false, status: 'At the office' }
  ];
  var family = { id: 'family', name: 'Family', color: '#7A6A5D', rgb: '122 106 93', ink: '#FFFFFF' };

  // ---------------------------------------------------------------- calendar
  var events = [
    // Today
    allDay(0, 1, 'Pajama Day at school', ['otto']),
    allDay(0, 1, 'Garbage + recycling night', ALL),
    ev(0, '07:00', '07:45', 'Gym', ['jordan'], { loc: 'Iron Works' }),
    ev(0, '08:15', '08:40', 'School drop-off', ['alex'], { travel: 10, loc: 'Parkdale Elementary' }),
    ev(0, '09:30', '10:30', 'Design review', ['jordan'], { loc: 'Office · Room 4B' }),
    ev(0, '12:00', '12:45', 'Dentist', ['maya', 'jordan'], { travel: 15, loc: 'Bright Smiles Dental' }),
    ev(0, '13:00', '14:00', 'Lunch with Sam', ['alex'], { loc: 'Café Rustica' }),
    ev(0, '15:45', '16:30', 'Piano lesson', ['otto'], { travel: 12, loc: "Ms. Park's Studio", notes: 'Bring the blue theory book.' }),
    ev(0, '16:30', '18:00', 'Soccer practice', ['maya'], { travel: 20, loc: 'Lakeshore Fields', notes: 'Shin guards + water bottle. Rain likely — pack a jacket.' }),
    ev(0, '17:00', '17:30', 'Parent–teacher call', ['alex', 'jordan'], { loc: 'Zoom' }),
    ev(0, '18:30', '19:30', "Dinner at Nonna's", ALL, { travel: 20, loc: "Nonna's", notes: 'Bring the lemon cake.' }),
    ev(0, '20:00', '20:30', 'Bath + books', ['otto']),

    // Tomorrow → +6
    allDay(1, 3, 'Fauzan in Montréal', ['alex'], { loc: 'Hotel William Gray' }),
    ev(1, '07:00', '07:45', 'Gym', ['jordan'], { loc: 'Iron Works' }),
    ev(1, '08:15', '08:40', 'School drop-off', ['jordan'], { travel: 10 }),
    ev(1, '10:30', '11:15', 'Vet — Biscuit', ['jordan'], { travel: 10, loc: 'Riverdale Animal Clinic' }),
    ev(1, '15:30', '16:30', 'Art club', ['maya'], { loc: 'School' }),
    ev(1, '16:00', '18:00', 'Playdate with Leo', ['otto'], { travel: 8, loc: "Leo's house" }),
    ev(1, '19:00', '21:00', 'Book club', ['jordan'], { travel: 10, loc: "Priya's" }),

    ev(2, '09:00', '14:00', 'Science Centre trip', ['otto'], { loc: 'Ontario Science Centre' }),
    ev(2, '13:00', '13:45', 'Haircuts', ['maya', 'otto'], { travel: 10, loc: 'Snip Snip Kids' }),
    ev(2, '16:30', '18:00', 'Soccer practice', ['maya'], { travel: 20, loc: 'Lakeshore Fields' }),
    ev(2, '18:00', '19:30', 'Pizza night', ALL),

    ev(3, '10:00', '10:45', 'Swim lessons', ['otto'], { travel: 12, loc: 'Wellesley Pool' }),
    ev(3, '11:00', '12:00', 'Grocery run', ['jordan']),
    ev(3, '13:00', '15:30', "Zoe's birthday party", ['maya'], { travel: 15, loc: 'Pottery Place' }),
    ev(3, '19:00', '21:00', 'Movie night', ALL),

    ev(4, '10:30', '12:00', 'Sunday brunch', ALL, { travel: 15, loc: 'Lady Marmalade' }),
    ev(4, '17:05', '18:20', 'Flight home · AC 418', ['alex'], { loc: 'YUL → YYZ' }),

    ev(5, '07:00', '07:45', 'Gym', ['jordan']),
    ev(5, '15:45', '16:30', 'Piano lesson', ['otto'], { travel: 12 }),
    ev(5, '16:30', '18:00', 'Soccer practice', ['maya'], { travel: 20 }),
    ev(5, '19:00', '20:00', 'Yoga', ['jordan']),

    allDay(6, 2, 'Grandma visits', ALL),
    ev(6, '09:00', '09:45', 'Dentist', ['otto'], { travel: 15, loc: 'Bright Smiles Dental' }),
    ev(6, '16:30', '18:00', 'Soccer practice', ['maya'], { travel: 20 })
  ];

  // Background recurring events so the month view has texture
  for (var d = -40; d <= 45; d++) {
    if (d >= 0 && d <= 6) continue;
    var dow = new Date(at(d, '00:00')).getDay();
    if (dow === 1) events.push(ev(d, '15:45', '16:30', 'Piano lesson', ['otto']));
    if (dow === 2 || dow === 4) events.push(ev(d, '16:30', '18:00', 'Soccer practice', ['maya']));
    if (dow === 3) events.push(ev(d, '19:00', '20:00', 'Yoga', ['jordan']));
    if (dow === 6) events.push(ev(d, '10:00', '10:45', 'Swim lessons', ['otto']));
    if (dow === 0) events.push(ev(d, '17:30', '19:30', "Dinner at Nonna's", ALL));
    if (dow === 5 && d % 2 === 0) events.push(ev(d, '18:00', '19:30', 'Pizza night', ALL));
    if (d % 9 === 0) events.push(ev(d, '12:00', '13:00', 'Lunch meeting', ['alex']));
    if (d % 11 === 0) events.push(ev(d, '09:00', '10:00', 'Doctor', ['jordan']));
  }
  events.push(allDay(12, 1, 'Birthday 🎂', ALL));
  events.push(allDay(-8, 3, 'Cottage weekend', ALL));

  // Extra events for the "overloaded day" demo
  var busyExtras = [
    ev(0, '10:00', '11:00', 'Plumber window', ['jordan']),
    ev(0, '11:00', '11:30', 'Call with bank', ['alex']),
    ev(0, '14:30', '15:30', 'Library volunteer', ['jordan']),
    ev(0, '15:30', '16:00', 'Snack prep', ['maya']),
    ev(0, '16:00', '16:45', 'Math tutor', ['otto']),
    ev(0, '16:15', '17:00', 'Swim make-up', ['otto'], { travel: 10 }),
    ev(0, '19:45', '20:30', 'Bake sale prep', ['maya', 'jordan']),
    ev(0, '20:30', '21:30', 'Hockey', ['alex'], { travel: 15 })
  ];

  // Only Fauzan and Amanda have calendars/lanes now: drop the kids' mock events, chores and stats.
  function adults(e) { e.people = e.people.filter(function (id) { return ALL.indexOf(id) > -1; }); return e.people.length; }
  events = events.filter(adults);
  busyExtras = busyExtras.filter(adults);

  // ---------------------------------------------------------------- chores
  // One list (sample until TickTick answers /api/chores). who: a person id or 'any'.
  var chores = [
    { id: 'c1', who: 'alex', title: 'Take out recycling', overdue: true, done: false },
    { id: 'c2', who: 'jordan', title: 'Fold laundry', done: false },
    { id: 'c3', who: 'any', title: 'Water the plants', done: false },
    { id: 'c4', who: 'any', title: 'Empty dishwasher', time: '18:00', done: false },
    { id: 'c5', who: 'alex', title: 'Lock up', time: '22:00', done: false },
    { id: 'c6', who: 'jordan', title: 'Run dishwasher', done: false },
    { id: 'c7', who: 'alex', title: 'Call the plumber', done: true, doneAt: Date.now() }
  ];
  // Quick-add tiles at the bottom of the Chores view
  var choreUsuals = ['Take out trash', 'Empty dishwasher', 'Laundry', 'Vacuum', 'Water plants', 'Clean bathroom', 'Change sheets', 'Wipe counters'];

  // ---------------------------------------------------------------- shopping
  var catOrder = {
    all: ['Produce', 'Bakery', 'Meat & Fish', 'Dairy & Eggs', 'Pantry', 'Frozen', 'Snacks', 'Household']
  };
  var gid = 0;
  // No mock list: the Shopping view shows only what Bring! returns (empty until the first /api/shopping answer).
  var groceries = [];
  var catalog = [
    ['Apples', 'Produce'], ['Avocados', 'Produce'], ['Bananas', 'Produce'], ['Baby spinach', 'Produce'], ['Blueberries', 'Produce'],
    ['Broccoli', 'Produce'], ['Carrots', 'Produce'], ['Cucumber', 'Produce'], ['Garlic', 'Produce'], ['Grapes', 'Produce'],
    ['Lemons', 'Produce'], ['Limes', 'Produce'], ['Onions', 'Produce'], ['Potatoes', 'Produce'], ['Strawberries', 'Produce'],
    ['Tomatoes', 'Produce'], ['Bread', 'Bakery'], ['Bagels', 'Bakery'], ['Croissants', 'Bakery'], ['Sourdough loaf', 'Bakery'],
    ['Tortillas', 'Bakery'], ['Hamburger buns', 'Bakery'], ['Bacon', 'Meat & Fish'], ['Chicken breasts', 'Meat & Fish'],
    ['Chicken thighs', 'Meat & Fish'], ['Ground beef', 'Meat & Fish'], ['Salmon fillets', 'Meat & Fish'], ['Shrimp', 'Meat & Fish'],
    ['Butter', 'Dairy & Eggs'], ['Cheddar', 'Dairy & Eggs'], ['Cream cheese', 'Dairy & Eggs'], ['Eggs', 'Dairy & Eggs'],
    ['Greek yogurt', 'Dairy & Eggs'], ['Milk 2%', 'Dairy & Eggs'], ['Oat milk', 'Dairy & Eggs'], ['Parmesan', 'Dairy & Eggs'],
    ['Black beans', 'Pantry'], ['Cereal', 'Pantry'], ['Coffee beans', 'Pantry'], ['Flour', 'Pantry'], ['Honey', 'Pantry'],
    ['Maple syrup', 'Pantry'], ['Olive oil', 'Pantry'], ['Pasta sauce', 'Pantry'], ['Peanut butter', 'Pantry'], ['Rice', 'Pantry'],
    ['Rigatoni', 'Pantry'], ['Spaghetti', 'Pantry'], ['Sugar', 'Pantry'], ['Tea', 'Pantry'], ['Frozen peas', 'Frozen'],
    ['Frozen berries', 'Frozen'], ['Ice cream', 'Frozen'], ['Pizza', 'Frozen'], ['Waffles', 'Frozen'], ['Chips', 'Snacks'],
    ['Crackers', 'Snacks'], ['Dark chocolate', 'Snacks'], ['Goldfish crackers', 'Snacks'], ['Granola bars', 'Snacks'],
    ['Popcorn', 'Snacks'], ['Dish soap', 'Household'], ['Dishwasher pods', 'Household'], ['Garbage bags', 'Household'],
    ['Laundry detergent', 'Household'], ['Paper towels', 'Household'], ['Toilet paper', 'Household'], ['Toothpaste', 'Household']
  ];
  // Fridge: invented REWE-shaped lines, one per purchase, dated from today. /api/fridge replaces them; here for npm run dev.
  var fridge = [
    ['BROCCOLI BIO', 1, 1.79, -2], ['BANANE', 1, 1.49, -1], ['KAROTTE BIO', 2, 3.18, -1], ['EIER M', 1, 3.29, -1],
    ['BUTTER', 1, 2.39, -3], ['GOUDA GERIEBEN', 1, 2.49, -3], ['KOERNER BALANCE', 1, 2.89, -1], ['ORZO', 1, 1.99, -3],
    ['BABY SPINAT', 1, 1.99, -2], ['RICOTTA', 1, 1.69, -5], ['HA-UNTERSCHENKEL', 1, 4.99, -1], ['NUTELLA 450G', 1, 3.99, -6],
    ['BASILIKUM', 1, 1.79, -9], ['CURLY POMMES', 1, 2.79, -6], ['APFELSAFT', 1, 1.59, -1]
  ].map(function (r, i) { return { id: 'r' + i, name: r[0], qty: r[1], total: r[2], date: mealDate(r[3]) }; });
  var fridgeMeta = { updatedAt: new Date(Date.now() - 2 * 36e5).toISOString(), status: 'ok', message: '' };
  var usuals = ['Milk 2%', 'Eggs', 'Bananas', 'Bread', 'Apples', 'Coffee beans', 'Greek yogurt', 'Cheddar', 'Butter', 'Baby spinach', 'Chicken thighs', 'Paper towels'];

  // ---------------------------------------------------------------- live city cams (Photos view -> Live)
  // type: 'img' = JPEG the view re-fetches every `every` s (safest on the frame's A33);
  //       'yt'  = YouTube live, src = video id (iframe; only if the owner allows embedding);
  //       'hls' = .m3u8 played by the WebView's own <video> (no hls.js bundled).
  // Verified on 2026-10-28: the two berlin.de JPEGs. The YouTube Alexanderplatz/Brandenburger Tor streams
  // checked had embedding disabled, and skylinewebcams/wetter.com/feratel give no embed licence, so none are listed.
  var webcams = [
    { id: 'rathaus', region: 'Mitte', name: 'Rotes Rathaus', type: 'img', every: 60, src: 'https://www.berlin.de/webcams/rathaus/webcam.jpg', credit: '© berlin.de · RN/BerlinOnline' },
    { id: 'fsz', region: 'Charlottenburg', name: 'Theodor-Heuss-Platz', type: 'img', every: 60, src: 'https://www.berlin.de/webcams/fsz/webcam.jpg', credit: '© berlin.de · rbb' }
  ];

  // ---------------------------------------------------------------- weather (index = hour of day)
  var weather = {
    hi: 17, lo: 8, feels: -2, humidity: 71, wind: 18,
    t: [9, 9, 8, 8, 8, 8, 9, 10, 11, 12, 13, 15, 16, 17, 16, 15, 14, 13, 12, 12, 11, 10, 10, 9],
    c: ['moon', 'moon', 'moon', 'moon', 'moon', 'moon', 'partly', 'partly', 'sun', 'sun', 'sun', 'partly', 'partly', 'cloud', 'cloud', 'cloud', 'rain', 'rain', 'rain', 'rain', 'cloud', 'cloud', 'moon', 'moon'],
    p: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 10, 20, 25, 40, 80, 90, 70, 55, 20, 10, 0, 0]
  };
  // 48 hours like the Worker (today, then tomorrow); the sample's tomorrow repeats today
  ['t', 'c', 'p'].forEach(function (k) { weather[k] = weather[k].concat(weather[k]); });

  // ---------------------------------------------------------------- photos
  var t = new Date(base);
  var mmdd = ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
  var photos = [
    { seed: 'tofino-surf', o: 'l', date: '2021-' + mmdd, place: 'Tofino, BC', from: 'jordan', tag: 'tofino' },
    { seed: 'cottage-dock', o: 'l', date: '2023-08-12', place: 'Lake of Bays', from: 'alex', tag: 'cottage' },
    { seed: 'maya-kite', o: 'p', date: '2024-05-19', place: 'Humber Bay Park', from: 'jordan', tag: 'spring24' },
    { seed: 'otto-kite', o: 'p', date: '2024-05-19', place: 'Humber Bay Park', from: 'alex', tag: 'spring24' },
    { seed: 'autumn-walk', o: 'l', date: '2022-10-09', place: 'High Park', from: 'alex', tag: 'fall22' },
    { seed: 'birthday-cake', o: 'p', date: '2025-10-12', place: 'Home', from: 'jordan', tag: 'bday25' },
    { seed: 'candles-lit', o: 'p', date: '2025-10-12', place: 'Home', from: 'alex', tag: 'bday25' },
    { seed: 'mountain-lake', o: 'l', date: '2019-' + mmdd, place: 'Banff, AB', from: 'alex', tag: 'banff' },
    { seed: 'snow-day', o: 'l', date: '2024-01-21', place: 'Riverdale Hill', from: 'jordan', tag: 'winter24' },
    { seed: 'beach-dunes', o: 'l', date: '2023-07-02', place: 'Sandbanks', from: 'maya', tag: 'sandbanks' },
    { seed: 'city-night', o: 'l', date: '2022-12-18', place: 'Nathan Phillips Sq.', from: 'jordan', tag: 'xmas22' },
    { seed: 'garden-bloom', o: 'p', date: '2025-06-08', place: 'Backyard', from: 'otto', tag: 'garden' },
    { seed: 'tomato-haul', o: 'p', date: '2025-06-08', place: 'Backyard', from: 'maya', tag: 'garden' },
    { seed: 'road-trip', o: 'l', date: '2024-08-04', place: 'Cabot Trail, NS', from: 'alex', tag: 'ns' },
    { seed: 'campfire', o: 'l', date: '2024-08-06', place: 'Cape Breton', from: 'jordan', tag: 'ns' },
    { seed: 'forest-path', o: 'l', date: '2020-09-26', place: 'Algonquin', from: 'alex', tag: 'algonquin' },
    { seed: 'pancakes', o: 'p', date: '2026-03-14', place: 'Home', from: 'maya', tag: 'pancakes' },
    { seed: 'sugar-shack', o: 'p', date: '2026-03-14', place: 'Sugar Shack', from: 'jordan', tag: 'pancakes' },
    { seed: 'harbour-sail', o: 'l', date: '2025-07-19', place: 'Toronto Harbour', from: 'otto', tag: 'sail' },
    { seed: 'pumpkins', o: 'l', date: '2025-10-25', place: "Chudleigh's", from: 'maya', tag: 'fall25' }
  ];

  // ---------------------------------------------------------------- transit (mock — replaced by /api/transit at runtime)
  var transit = {
    stop: 'Gleisdreieck',
    departures: [
      { line: 'U1', direction: 'Warschauer Str.', when: at(0, '15:22'), delay: 0, product: 'subway' },
      { line: 'U2', direction: 'Pankow',          when: at(0, '15:28'), delay: 2, product: 'subway' },
      { line: 'U7', direction: 'Rudow',            when: at(0, '15:30'), delay: 0, product: 'subway' },
      { line: '187', direction: 'Spichernstr.',    when: at(0, '15:33'), delay: 0, product: 'bus'    }
    ]
  };

  // ---------------------------------------------------------------- meals (mock — replaced by /api/meals at runtime)
  function mealDate(d) { var x = new Date(base); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2); }
  var meal = function (id, name, min) { return { id: id, name: name, min: min, img: '', photo: '' }; };
  var meals = {
    device: 'TM6',
    days: [
      { date: mealDate(0), recipes: [meal('sample-pesto', 'Farfalle al Pesto', 25), meal('sample-curry', 'Gemüse-Curry mit Reis', 45)] },
      { date: mealDate(2), recipes: [meal('sample-suppe', 'Kürbissuppe mit Feta', 35)] }
    ]
  };
  var recipe = function (id, name, total, active, kcal, ing, steps) {
    return { id: id, name: name, img: '', total: total, active: active, level: 'Easy', serves: '4 Portionen', kcal: kcal, per: 'Portion', tm: 'TM5, TM6, TM7',
      ingredients: ing.map(function (i) { return { q: i[0], name: i[1], note: '' }; }), steps: steps };
  };
  var recipes = {
    'sample-pesto': recipe('sample-pesto', 'Farfalle al Pesto', 25, 10, 540,
      [['60 g', 'Parmesan'], ['50 g', 'Basilikum'], ['40 g', 'Pinienkerne'], ['100 g', 'Olivenöl'], ['400 g', 'Farfalle'], ['200 g', 'Kirschtomaten']],
      [['Parmesan zerkleinern. ', '10 Sek./Stufe 10', ''], ['Basilikum, Pinienkerne und Öl zugeben. ', '15 Sek./Stufe 7', ''], ['Farfalle garen und mit dem Pesto mischen.']]),
    'sample-curry': recipe('sample-curry', 'Gemüse-Curry mit Reis', 45, 20, 480,
      [['250 g', 'Basmatireis'], ['150 g', 'Zwiebeln'], ['30 g', 'Currypaste'], ['400 g', 'Kokosmilch'], ['300 g', 'Blumenkohl'], ['200 g', 'Karotten']],
      [['Zwiebeln zerkleinern. ', '5 Sek./Stufe 5', ''], ['Currypaste andünsten. ', '3 Min./120°C/Stufe 1', ''], ['Kokosmilch und Gemüse garen. ', '20 Min./100°C/Stufe 1', '']]),
    'sample-suppe': recipe('sample-suppe', 'Kürbissuppe mit Feta', 35, 12, 310,
      [['1 kg', 'Hokkaido-Kürbis'], ['100 g', 'Zwiebeln'], ['800 g', 'Gemüsebrühe'], ['100 g', 'Sahne'], ['100 g', 'Feta']],
      [['Zwiebeln zerkleinern. ', '5 Sek./Stufe 5', ''], ['Kürbis und Brühe garen. ', '22 Min./100°C/Stufe 1', ''], ['Sahne zugeben und pürieren.']])
  };

  return {
    // views shown on the frame; the Worker's VIEWS var overrides this (same default as views.js)
    views: ['home', 'calendar', 'tasks', 'shopping', 'fridge', 'meals', 'kitchen', 'photos'],
    people: people, family: family, ALL: ALL,
    events: events, busyExtras: busyExtras,
    chores: chores, choreUsuals: choreUsuals,
    catOrder: catOrder, groceries: groceries, catalog: catalog, usuals: usuals, fridge: fridge, fridgeMeta: fridgeMeta,
    weather: weather, webcams: webcams, photos: photos, transit: transit, meals: meals, recipes: recipes,
    _gid: function () { return 'g' + (++gid); }
  };
})();
