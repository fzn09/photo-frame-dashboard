// Home Assistant <-> dashboard shapes. Pure functions: used by worker.js, checked by test/ha-map.test.mjs.
// Dashboard shapes are the ones in js/data.js (D.devices / D.rooms / D.climate / D.media).

const DOMAINS = ['light', 'lock', 'cover', 'climate', 'media_player'];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home';
const defined = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

// states: HA GET /api/states. areas: { entity_id: area name } (optional, rooms fall back to "Home").
export function mapHome(states, areas = {}) {
  const devices = [], rooms = {};
  let climate = null, media = null;
  for (const s of states) {
    const domain = s.entity_id.split('.')[0];
    if (!DOMAINS.includes(domain) || s.state === 'unavailable' || s.state === 'unknown') continue;
    const a = s.attributes || {}, id = s.entity_id, name = a.friendly_name || id;
    const area = areas[id] || 'Home', room = slug(area);

    if (domain === 'climate') {
      climate = climate || defined({
        id, current: a.current_temperature, set: a.temperature,
        mode: s.state === 'heat_cool' ? 'auto' : s.state, humidity: a.current_humidity
      });
    } else if (domain === 'media_player') {
      // prefer whichever player is playing right now, else the first one seen
      if (!media || (s.state === 'playing' && !media.playing)) {
        media = { id, room: area, title: a.media_title || '—', artist: a.media_artist || '', playing: s.state === 'playing', volume: Math.round((a.volume_level || 0) * 100) };
      }
    } else {
      rooms[room] = area;
      if (domain === 'light') {
        devices.push({ id, room, type: 'light', name, on: s.state === 'on', level: a.brightness != null ? Math.round(a.brightness / 255 * 100) : 100 });
      } else if (domain === 'lock') {
        devices.push({ id, room, type: 'lock', name, locked: s.state === 'locked' });
      } else if (a.device_class === 'garage') {
        devices.push({ id, room, type: 'garage', name, state: ['open', 'closed', 'opening', 'closing'].includes(s.state) ? s.state : 'closed' });
      } else {
        devices.push({ id, room, type: 'blind', name, pos: a.current_position != null ? a.current_position : (s.state === 'open' ? 100 : 0) });
      }
    }
  }
  return {
    devices,
    rooms: Object.entries(rooms).map(([id, name]) => ({ id, name })).sort((x, y) => x.name.localeCompare(y.name)),
    climate, media
  };
}

// A dashboard change ({on, level} / {locked} / {pos} / {state} / {set} / {mode} / {playing} / {volume}) on one entity
// -> the HA service call. Only these domains are controllable, so a leaked token can't fire scripts or alarms.
export function toService(entityId, patch) {
  const domain = entityId.split('.')[0];
  const entity_id = entityId;
  if (domain === 'light') {
    return patch.on === false ? { domain, service: 'turn_off', data: { entity_id } }
      : { domain, service: 'turn_on', data: patch.level != null ? { entity_id, brightness_pct: patch.level } : { entity_id } };
  }
  if (domain === 'lock' && patch.locked != null) return { domain, service: patch.locked ? 'lock' : 'unlock', data: { entity_id } };
  if (domain === 'cover') {
    if (patch.pos != null) return { domain, service: 'set_cover_position', data: { entity_id, position: patch.pos } };
    if (patch.state === 'open' || patch.state === 'closed') return { domain, service: patch.state === 'open' ? 'open_cover' : 'close_cover', data: { entity_id } };
  }
  if (domain === 'climate') {
    if (patch.set != null) return { domain, service: 'set_temperature', data: { entity_id, temperature: patch.set } };
    if (patch.mode) return { domain, service: 'set_hvac_mode', data: { entity_id, hvac_mode: patch.mode === 'auto' ? 'heat_cool' : patch.mode } };
  }
  if (domain === 'media_player') {
    if (patch.playing != null) return { domain, service: patch.playing ? 'media_play' : 'media_pause', data: { entity_id } };
    if (patch.volume != null) return { domain, service: 'volume_set', data: { entity_id, volume_level: patch.volume / 100 } };
  }
  return null;
}
