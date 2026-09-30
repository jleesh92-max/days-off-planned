// Checks the holiday data before anything is published.
const test = require('node:test');
const assert = require('node:assert');
const { holidays } = require('../data/holidays.json');
const settings = require('../data/settings.json');
const codes = new Set(settings.places.map(p => p.code));

test('every row is well formed', () => {
  const ids = new Set();
  for (const h of holidays) {
    const where = `${h.id || '(no id)'}`;
    assert.ok(h.id && !ids.has(h.id), `duplicate or missing id: ${where}`); ids.add(h.id);
    assert.match(h.date, /^\d{4}-\d{2}-\d{2}$/, `bad date: ${where}`);
    const [y, m, dd] = h.date.split('-').map(Number);
    assert.strictEqual(new Date(Date.UTC(y, m - 1, dd)).toISOString().slice(0, 10), h.date, `impossible date: ${where}`);
    assert.ok(h.name && h.name.trim(), `missing name: ${where}`);
    assert.ok(Array.isArray(h.places) && h.places.length, `no places: ${where}`);
    for (const p of h.places) assert.ok(codes.has(p), `unknown place ${p}: ${where}`);
    assert.ok(['public', 'closure'].includes(h.kind), `bad kind: ${where}`);
    assert.ok(['confirmed', 'projected'].includes(h.status), `bad status: ${where}`);
  }
});

test('settings rules name a known rule', () => {
  for (const r of Object.values(settings.rules)) assert.ok(['next-working', 'sunday', 'none'].includes(r));
  if (settings.applyUrl) assert.match(settings.applyUrl, /^https:\/\//);
});
