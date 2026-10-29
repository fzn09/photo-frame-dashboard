// Which views the frame shows. Pure function: used by worker.js (/api/config), checked by test/views.test.mjs.
// Keep NAMES in sync with the data-go buttons in index.html. js/data.js has the same default for the offline case.

export const NAMES = ['home', 'calendar', 'tasks', 'shopping', 'fridge', 'kitchen', 'photos', 'control', 'agents'];
export const DEFAULT = ['home', 'calendar', 'shopping', 'photos'];

// "Home, photos ,xx,photos" -> ['home','photos']. Unknown names dropped, duplicates dropped, 'home' always
// present and first (it's the landing/fallback view), nothing usable -> DEFAULT.
export function parseViews(str) {
  const want = String(str || '').split(',').map(s => s.trim().toLowerCase()).filter(n => NAMES.includes(n));
  if (!want.length) return [...DEFAULT];
  return NAMES.filter(n => n === 'home' || want.includes(n)); // NAMES order = rail order
}
