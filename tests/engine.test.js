// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine/engine.js');
const { holidays } = require('../data/holidays.json');

const cal = (place, pattern = 'mon-fri', rule = 'next-working') =>
  E.buildCalendar({ year: 2027, place, pattern, holidays, rule });
const type = (c, d) => c.days.get(d).type;

test('Selangor Mon-Fri: CNY on Sat and Sun gives in-lieu Mon 8 and Tue 9 Feb', () => {
  const c = cal('MY-SGR');
  assert.strictEqual(type(c, '2027-02-08'), 'sub');
  assert.strictEqual(type(c, '2027-02-09'), 'sub');
});

test('Awal Muharram (Sun 6 Jun) skips Agong\'s Birthday (Mon 7 Jun) to Tue 8 Jun', () => {
  const c = cal('MY-SGR');
  assert.strictEqual(type(c, '2027-06-07'), 'ph');
  assert.strictEqual(type(c, '2027-06-08'), 'sub');
});

test('Federal Territory Day applies to Kuala Lumpur only', () => {
  assert.strictEqual(type(cal('MY-KUL'), '2027-02-01'), 'ph');
  assert.strictEqual(type(cal('MY-SGR'), '2027-02-01'), 'work');
});

test('Sultan of Selangor\'s Birthday (Sat 11 Dec) gives Selangor in-lieu Mon 13 Dec', () => {
  assert.strictEqual(type(cal('MY-SGR'), '2027-12-13'), 'sub');
  assert.strictEqual(type(cal('MY-KUL'), '2027-12-13'), 'work');
});

test('Sun-Thu pattern: Friday New Year is a rest day, in lieu lands on Sunday 3 Jan', () => {
  const c = cal('SG', 'sun-thu');
  assert.strictEqual(type(c, '2027-01-01'), 'ph');
  assert.strictEqual(type(c, '2027-01-03'), 'sub');
});

test('Sunday-only rule: Saturday holiday gets no day in lieu', () => {
  const c = cal('SG', 'mon-fri', 'sunday');
  assert.strictEqual(type(c, '2027-05-03'), 'work'); // Labour Day is Sat 1 May
  assert.strictEqual(type(c, '2027-02-08'), 'sub');  // CNY day 2 is Sun 7 Feb
});

test('Leave cost: Thu 21 to Sun 24 Jan in Selangor costs 1 day for 4 days off', () => {
  const r = E.rangeStats(cal('MY-SGR'), '2027-01-21', '2027-01-24');
  assert.deepStrictEqual([r.al, r.total, r.ph, r.rest], [1, 4, 1, 2]);
});

test('Closure that uses leave never charges leave on a holiday', () => {
  const h = holidays.concat([{ date: '2027-12-25', name: 'Office closure', places: ['MY-SGR'], kind: 'closure', alCost: 1 },
                             { date: '2027-12-28', name: 'Office closure', places: ['MY-SGR'], kind: 'closure', alCost: 1 }]);
  const c = E.buildCalendar({ year: 2027, place: 'MY-SGR', pattern: 'mon-fri', holidays: h });
  assert.strictEqual(c.days.get('2027-12-25').cost, 0);
  assert.strictEqual(c.days.get('2027-12-28').cost, 1);
});

test('Best breaks never overlap and the plan stays within budget', () => {
  const c = cal('MY-SGR');
  const b = E.findBreaks(c, 3);
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++)
    assert.ok(b[i].end < b[j].start || b[j].end < b[i].start);
  const p = E.planYear(b, 8);
  assert.ok(p.used <= 8);
});
