// Run: node test/buildinfo.test.mjs   (from dashboard/)
import assert from 'node:assert/strict';
import { cleanSubject, buildInfo } from '../build-info.js';

assert.equal(cleanSubject('feat(fridge): add REWE feed'), 'Add REWE feed');
assert.equal(cleanSubject('fix!: stale cache'), 'Stale cache');
assert.equal(cleanSubject('Implement REWE fridge feed'), 'Implement REWE fridge feed');
const b = buildInfo();
assert.ok(b.id && b.built && Array.isArray(b.log) && b.log.length <= 8);
