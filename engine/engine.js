/*
 * Days off, planned: working-calendar engine.
 * Pure functions, no DOM, no network. Works in the browser (window.DaysOff)
 * and in Node (require('./engine/engine.js')).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DaysOff = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '0.1.0';

  // Rest days per work pattern, as JS weekday numbers (0 = Sunday).
  var PATTERNS = {
    'mon-fri': [0, 6],
    'mon-sat': [0],
    'sun-thu': [5, 6],
    'tue-sat': [0, 1]
  };

  var RULES = {
    'next-working': 'Holiday on any rest day moves to the next working day',
    'sunday': 'Only a Sunday holiday moves to the next working day',
    'none': 'No days in lieu'
  };

  function pad(n) { return String(n).padStart(2, '0'); }
  function ds(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pd(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addD(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  /**
   * Build a day-by-day calendar for one place, year and work pattern.
   * holidays: [{date, name, places[], kind:'public'|'closure', status, alCost}]
   * Covers 1 Dec of the previous year to 28 Feb of the next, so leave that
   * crosses the new year and days in lieu that spill over are handled.
   */
  function buildCalendar(opts) {
    var year = opts.year, place = opts.place;
    var rest = opts.restDays || PATTERNS[opts.pattern || 'mon-fri'];
    var rule = opts.rule || 'next-working';
    var from = new Date(year - 1, 11, 1), to = new Date(year + 1, 1, 28);
    var hol = (opts.holidays || []).filter(function (h) {
      return Array.isArray(h.places) && h.places.indexOf(place) !== -1;
    });
    var byDate = {};
    hol.forEach(function (h) { (byDate[h.date] = byDate[h.date] || []).push(h); });

    var days = new Map();
    for (var d = new Date(from); d <= to; d = addD(d, 1)) {
      var s = ds(d), items = byDate[s] || [];
      days.set(s, {
        date: s, dow: d.getDay(), rest: rest.indexOf(d.getDay()) !== -1,
        ph: items.filter(function (h) { return (h.kind || 'public') === 'public'; }),
        sub: [],
        closure: items.filter(function (h) { return h.kind === 'closure'; })[0] || null
      });
    }

    // Derived days in lieu.
    if (rule !== 'none') {
      var phDates = [];
      days.forEach(function (x) { if (x.ph.length) phDates.push(x.date); });
      phDates.sort();
      phDates.forEach(function (s) {
        var day = days.get(s);
        var triggers = rule === 'next-working' ? day.rest : day.dow === 0;
        if (!triggers) return;
        var n = addD(pd(s), 1);
        for (var guard = 0; guard < 14; guard++, n = addD(n, 1)) {
          var x = days.get(ds(n));
          if (!x) break;
          if (!x.rest && !x.ph.length && !x.sub.length) { x.sub.push({ of: day.ph[0], from: s }); break; }
        }
      });
    }

    // Classify. Holidays and rest days always win over closures, so a
    // closure that uses leave never charges leave on a holiday or rest day.
    days.forEach(function (x) {
      x.type = x.ph.length ? 'ph' : x.sub.length ? 'sub' : x.rest ? 'rest'
        : x.closure ? (x.closure.alCost ? 'closure-al' : 'closure') : 'work';
      x.cost = (x.type === 'work' || x.type === 'closure-al') ? 1 : 0;
      x.projected = x.ph.some(function (h) { return h.status === 'projected'; }) ||
        x.sub.some(function (sb) { return sb.of && sb.of.status === 'projected'; });
    });

    var yearDays = [];
    days.forEach(function (x) { if (x.date.slice(0, 4) === String(year)) yearDays.push(x); });
    return { days: days, yearDays: yearDays, holidays: hol, rule: rule, restDays: rest };
  }

  /** Leave cost and breakdown for an inclusive date range. */
  function rangeStats(cal, a, b) {
    var out = { al: 0, total: 0, ph: 0, sub: 0, rest: 0, closure: 0, missing: 0 };
    for (var d = pd(a); d <= pd(b); d = addD(d, 1)) {
      var x = cal.days.get(ds(d));
      out.total++;
      if (!x) { out.missing++; if (cal.restDays.indexOf(d.getDay()) === -1) out.al++; continue; }
      out.al += x.cost;
      if (x.type === 'ph') out.ph++;
      else if (x.type === 'sub') out.sub++;
      else if (x.type === 'rest') out.rest++;
      else if (x.type === 'closure' || x.type === 'closure-al') out.closure++;
    }
    return out;
  }

  /** Working days between two dates, inclusive. */
  function workingDaysBetween(cal, a, b) {
    var n = 0;
    for (var d = pd(a); d <= pd(b); d = addD(d, 1)) {
      var x = cal.days.get(ds(d));
      if (x && (x.type === 'work' || x.type === 'closure-al')) n++;
    }
    return n;
  }

  /**
   * Rank long breaks: ranges that start and end next to a working day,
   * include at least one holiday or closure, and cost 1..maxLeave days.
   * Returns non-overlapping breaks, best days-off-per-leave-day first.
   */
  function findBreaks(cal, maxLeave, notBefore) {
    var yd = cal.yearDays, n = yd.length, cands = [], seen = {};
    for (var i = 0; i < n; i++) {
      if (i > 0 && yd[i - 1].cost === 0) continue;
      var cost = 0, hasHol = false;
      for (var j = i; j < n && j - i < 24; j++) {
        cost += yd[j].cost;
        if (cost > maxLeave) break;
        var t = yd[j].type;
        if (t === 'ph' || t === 'sub' || t === 'closure') hasHol = true;
        if (cost === 0 || !hasHol) continue;
        if (j < n - 1 && yd[j + 1].cost === 0) continue;
        if (notBefore && yd[i].date < notBefore) continue;
        var k = yd[i].date + '|' + yd[j].date;
        if (seen[k]) continue; seen[k] = true;
        var slice = yd.slice(i, j + 1), names = [];
        slice.forEach(function (x) { x.ph.forEach(function (h) { if (names.indexOf(h.name) === -1) names.push(h.name); }); });
        cands.push({ start: yd[i].date, end: yd[j].date, cost: cost, len: j - i + 1,
          ratio: (j - i + 1) / cost, names: names,
          projected: slice.some(function (x) { return x.projected; }) });
      }
    }
    cands.sort(function (a, b) { return b.ratio - a.ratio || b.len - a.len || a.start.localeCompare(b.start); });
    var picked = [];
    cands.forEach(function (c) {
      if (c.len < 4) return;
      if (picked.some(function (p) { return !(c.end < p.start || c.start > p.end); })) return;
      picked.push(c);
    });
    return picked;
  }

  /** Spend a leave budget on the best breaks, in ranked order. */
  function planYear(breaks, budget) {
    var left = budget, chosen = [];
    breaks.forEach(function (b) { if (b.cost <= left) { chosen.push(b); left -= b.cost; } });
    chosen.sort(function (a, b) { return a.start.localeCompare(b.start); });
    return { chosen: chosen, used: budget - left, days: chosen.reduce(function (s, b) { return s + b.len; }, 0) };
  }

  return {
    VERSION: VERSION, PATTERNS: PATTERNS, RULES: RULES,
    ds: ds, pd: pd, addD: addD,
    buildCalendar: buildCalendar, rangeStats: rangeStats,
    workingDaysBetween: workingDaysBetween, findBreaks: findBreaks, planYear: planYear
  };
});
