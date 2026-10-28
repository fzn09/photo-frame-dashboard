// Run: node test/ha-map.test.mjs   (from dashboard/). Throws on the first failed assertion.
import assert from 'node:assert/strict';
import { mapHome, toService } from '../ha-map.js';

const states = [
  { entity_id: 'light.pendants', state: 'on', attributes: { friendly_name: 'Pendants', brightness: 128 } },
  { entity_id: 'light.island', state: 'off', attributes: { friendly_name: 'Island' } },
  { entity_id: 'light.dead', state: 'unavailable', attributes: {} },
  { entity_id: 'lock.front', state: 'locked', attributes: { friendly_name: 'Front Door' } },
  { entity_id: 'cover.garage', state: 'closed', attributes: { friendly_name: 'Garage', device_class: 'garage' } },
  { entity_id: 'cover.blind', state: 'open', attributes: { friendly_name: 'Blind', current_position: 60 } },
  { entity_id: 'climate.main', state: 'heat_cool', attributes: { current_temperature: 20.5, temperature: 21.5, current_humidity: 42 } },
  { entity_id: 'media_player.kitchen', state: 'idle', attributes: { friendly_name: 'Kitchen' } },
  { entity_id: 'media_player.living', state: 'playing', attributes: { media_title: 'Song', media_artist: 'Band', volume_level: 0.35 } },
  { entity_id: 'switch.ignored', state: 'on', attributes: {} },
  { entity_id: 'sensor.ignored', state: '3', attributes: {} }
];
const m = mapHome(states, { 'light.pendants': 'Kitchen', 'light.island': 'Kitchen', 'lock.front': 'Entry' });

assert.equal(m.devices.length, 5, 'only light/lock/cover, unavailable dropped');
assert.deepEqual(m.devices[0], { id: 'light.pendants', room: 'kitchen', type: 'light', name: 'Pendants', on: true, level: 50 });
assert.equal(m.devices[1].on, false);
assert.equal(m.devices.find(d => d.id === 'cover.garage').type, 'garage');
assert.equal(m.devices.find(d => d.id === 'cover.blind').pos, 60);
assert.deepEqual(m.rooms.map(r => r.name), ['Entry', 'Home', 'Kitchen']);
assert.deepEqual(m.climate, { id: 'climate.main', current: 20.5, set: 21.5, mode: 'auto', humidity: 42 });
assert.equal(m.media.id, 'media_player.living', 'the playing player wins');
assert.equal(m.media.volume, 35);

assert.deepEqual(toService('light.a', { on: false }), { domain: 'light', service: 'turn_off', data: { entity_id: 'light.a' } });
assert.equal(toService('light.a', { on: true, level: 40 }).data.brightness_pct, 40);
assert.equal(toService('lock.a', { locked: false }).service, 'unlock');
assert.equal(toService('cover.a', { pos: 30 }).service, 'set_cover_position');
assert.equal(toService('cover.g', { state: 'open' }).service, 'open_cover');
assert.equal(toService('climate.a', { mode: 'auto' }).data.hvac_mode, 'heat_cool');
assert.equal(toService('media_player.a', { playing: false }).service, 'media_pause');
assert.equal(toService('script.burn_house', { on: true }), null, 'non-allowlisted domain refused');
assert.equal(toService('lock.a', {}), null, 'empty patch refused');
console.log('ha-map ok');
