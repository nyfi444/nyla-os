// Patterns: the sums behind Reflect > Patterns, run on a fixed dataset.
// The sums live in js/patterns.jsx between the pat-core markers, written
// without JSX or app globals, so this cuts that block out and runs it here.
// run: node --test tests/patterns.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'patterns.jsx'), 'utf8');
const a = src.indexOf('// <pat-core>'), b = src.indexOf('// </pat-core>');
assert.ok(a >= 0 && b > a, 'the pat-core markers are in patterns.jsx');
const block = src.slice(a, b);
const core = new Function(block + '\nreturn pat_core;')();

const TODAY = '2026-09-27'; // a Sunday
const day = n => core.addDays(TODAY, -n);
const task = (completedDate, extra = {}) => ({ id: Math.random(), text: 'SECRET TITLE', done: true, completedDate, ...extra });
const many = (n, completedDate, extra) => Array.from({ length: n }, () => task(completedDate, extra));

test('the core block stands alone: no JSX and no app globals', () => {
  assert.ok(!/<\/?[A-Z][A-Za-z]*[\s>/]/.test(block), 'no JSX tags');
  [/\blocalStorage\b/, /\bwindow\.\w/, /\bdocument\.\w/, /\btoDateKey\b/, /\bgetCycleForDate\b/, /\bgetMoonForDate\b/, /\bcallClaude\b/, /\bReact\b/, /\btoast\(/].forEach(w => assert.ok(!w.test(block), `core does not touch ${w}`));
});

test('days: real days only, and moments keep their local day', () => {
  assert.equal(core.keyDate(TODAY).getDay(), 0);
  assert.equal(core.isKey('2026-02-28'), true);
  assert.equal(core.isKey('2026-02-31'), false);
  assert.equal(core.isKey('2026-13-01'), false);
  assert.equal(core.isKey('26-01-01'), false);
  assert.equal(core.isKey(20260101), false);
  assert.equal(core.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(core.diffDays('2026-09-01', '2026-09-27'), 26);
  // Across a clock change the count of days is still whole.
  assert.equal(core.diffDays('2026-03-01', '2026-03-31'), 30);
  const noon = new Date(2026, 8, 20, 12, 15);
  assert.equal(core.dayOf(noon.getTime()), '2026-09-20');
  assert.equal(core.dayOf(noon.toISOString()), '2026-09-20');
  assert.equal(core.dayOf('2026-09-20'), '2026-09-20');
  assert.equal(core.momentOf('2026-09-20'), null, 'a bare day has no time of day');
  [null, undefined, '', 'soon', 12, {}, [], true, '2026-02-31'].forEach(v => assert.equal(core.dayOf(v), null));
  assert.equal(core.eachDay('2026-09-25', TODAY).length, 3);
  assert.deepEqual(core.eachDay(TODAY, '2026-09-01'), []);
});

test('the window: 30, 90, a year, everything', () => {
  assert.deepEqual(core.range('30', TODAY, null), { id: '30', label: '30 days', from: '2026-08-29', to: TODAY, days: 30 });
  assert.equal(core.range('90', TODAY, null).days, 90);
  assert.equal(core.range('365', TODAY, null).days, 365);
  const all = core.range('all', TODAY, '2026-05-01');
  assert.equal(all.from, '2026-05-01');
  assert.equal(all.days, core.diffDays('2026-05-01', TODAY) + 1);
  assert.equal(core.range('all', TODAY, '2015-01-01').days, core.MAX_DAYS, 'everything is capped');
  assert.equal(core.range('all', TODAY, null).days, 30, 'nothing logged yet falls back to a month');
  assert.equal(core.range('nonsense', TODAY, null).id, '90');
});

test('earliest finds the first day she logged anything', () => {
  assert.equal(core.earliest({}), null);
  assert.equal(core.earliest({
    tasks: [task('2026-06-10'), task('2026-01-01', { done: false }), task('2025-01-01', { source: 'calendar' })],
    habitLog: { '3_2026-05-02': true, '3_2026-01-02': false, junk: true },
    sessions: [{ id: 1, date: '2026-07-01', minutes: 25 }],
    periods: [{ start: '2026-04-20' }, { start: 'bad' }],
    closes: { '2026-08-01': { mood: 3 } }, cycleDays: { nope: {} }, top3: { '2026-09-01': [] },
  }), '2026-04-20');
});

test('finished tasks: odd records are skipped, never a crash', () => {
  const at = new Date(2026, 8, 20, 9, 40);
  const tasks = [
    task('2026-09-20', { calendarDate: '2026-09-21' }),
    task(at.toISOString()),                                  // a finish that carries a time
    task('2026-09-19', { doneAt: new Date(2026, 8, 19, 14, 5).toISOString() }),
    task('2026-09-20', { done: false }),                     // not finished
    task('2026-09-20', { source: 'calendar' }),              // an event, not a task
    task(null), task(''), task('yesterday'), task('2026-02-31'), task({}), task(42),
    task('2026-08-01'),                                      // before the window
    task('2026-10-05'),                                      // after today
    task('2026-09-18', { calendarDate: 'next week' }),       // odd due date: counted, undated
    null, undefined, 'a string', 7, [], [task('2026-09-20')],
  ];
  const fin = core.finished(tasks, '2026-08-29', TODAY);
  assert.equal(fin.length, 4);
  assert.deepEqual(fin.map(f => f.day).sort(), ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-20']);
  assert.equal(fin.filter(f => f.due).length, 1);
  assert.deepEqual(fin.map(f => f.hour).filter(h => h != null).sort((x, y) => x - y), [9, 14]);
  assert.deepEqual(core.finished(null, '2026-08-29', TODAY), []);
  assert.deepEqual(core.finished({ not: 'a list' }, '2026-08-29', TODAY), []);
});

test('weekday counts: Tuesdays win, per time the weekday came around', () => {
  const tasks = [];
  ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'].forEach(d => tasks.push(...many(4, d))); // Tuesdays
  ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'].forEach(d => tasks.push(...many(1, d))); // Mondays
  const fin = core.finished(tasks, '2026-08-29', TODAY);
  const w = core.weekdays(fin, '2026-08-29', TODAY);
  assert.deepEqual(w.counts, [0, 4, 16, 0, 0, 0, 0]);
  assert.deepEqual(w.occurrences, [4, 4, 4, 4, 4, 4, 4], 'counted from her first finished task, not the empty days before');
  assert.equal(w.total, 20);
  assert.equal(w.bestName, 'Tuesday');
  assert.equal(w.perDay[2], 4);
  assert.equal(w.perDay[1], 1);
  assert.equal(w.lift, 2300);
  assert.equal(w.flat, false);
});

test('a lift in words: a percent when small, times as much when large', () => {
  assert.equal(core.moreThan(40), 'about 40% more');
  assert.equal(core.moreThan(40, 'on your other days'), 'about 40% more than on your other days');
  assert.equal(core.moreThan(99), 'about 99% more');
  assert.equal(core.moreThan(133, 'on your other days'), 'about 2.3 times as much as on your other days');
  assert.equal(core.moreThan(200), 'about 3 times as much');
  const tasks = [];
  core.eachDay(day(27), TODAY).forEach(d => tasks.push(...many(core.keyDate(d).getDay() === 2 ? 14 : 10, d)));
  const rep = core.report({ tasks }, core.range('30', TODAY, null), {});
  assert.equal(rep.cards.find(c => c.id === 'weekday').sentence, 'Tuesdays are your power day. You finish about 40% more than on your other days.');
});

test('weekday counts: an even week is called steady', () => {
  const fin = core.finished(core.eachDay(day(27), TODAY).map(d => task(d)), day(27), TODAY);
  const w = core.weekdays(fin, day(27), TODAY);
  assert.deepEqual(w.counts, [4, 4, 4, 4, 4, 4, 4]);
  assert.equal(w.lift, 0);
  assert.equal(w.flat, true);
  const none = core.weekdays([], day(27), TODAY);
  assert.equal(none.total, 0);
  assert.equal(none.lift, null);
});

test('phase rates are per day, so a long phase is not favored', () => {
  const map = {}, counts = {};
  core.eachDay(day(29), day(20)).forEach(d => { map[d] = 'Follicular'; counts[d] = 2; });  // 10 days, 20 done
  core.eachDay(day(19), TODAY).forEach(d => { map[d] = 'Luteal'; counts[d] = 1; });         // 20 days, 20 done
  map['not-a-day'] = 'Luteal'; map[day(40)] = 'Made up';
  counts[day(40)] = 50;
  const r = core.rates(counts, map, core.PHASES);
  const get = id => r.groups.find(g => g.id === id);
  assert.deepEqual([get('Follicular').days, get('Follicular').done, get('Follicular').rate], [10, 20, 2]);
  assert.deepEqual([get('Luteal').days, get('Luteal').done, get('Luteal').rate], [20, 20, 1]);
  assert.equal(get('Menstrual').days, 0);
  assert.equal(r.days, 30);
  assert.equal(r.done, 40);
  assert.equal(r.best, 'Follicular', 'the same total over fewer days is the fuller phase');
  assert.equal(r.low, 'Luteal');
  assert.equal(r.lift, 100);
  assert.equal(r.flat, false);
});

test('phase rates: a group with too few days cannot be the best', () => {
  const map = {}, counts = {};
  [0, 1].forEach(n => { map[day(n)] = 'Ovulation'; counts[day(n)] = 9; });
  core.eachDay(day(12), day(3)).forEach(d => { map[d] = 'Luteal'; counts[d] = 1; });
  const r = core.rates(counts, map, core.PHASES);
  assert.equal(r.best, 'Luteal');
  const empty = core.rates({}, {}, core.PHASES);
  assert.equal(empty.best, null);
  assert.equal(empty.days, 0);
});

test('moon: eight faces fold into four, and new and full claim their neighbors', () => {
  const idx = {
    '2026-09-08': 7, '2026-09-09': 7, '2026-09-10': 0, '2026-09-11': 1, '2026-09-12': 1,
    '2026-09-17': 2, '2026-09-20': 3, '2026-09-24': 3, '2026-09-25': 4, '2026-09-26': 5, '2026-09-27': 6,
    junk: 0, '2026-09-01': 12, '2026-09-02': 'full',
  };
  const g = core.moonGroups(idx);
  assert.equal(g['2026-09-08'], 'waning');
  assert.equal(g['2026-09-09'], 'new');
  assert.equal(g['2026-09-10'], 'new');
  assert.equal(g['2026-09-11'], 'new');
  assert.equal(g['2026-09-12'], 'waxing');
  assert.equal(g['2026-09-17'], 'waxing');
  assert.equal(g['2026-09-24'], 'full');
  assert.equal(g['2026-09-25'], 'full');
  assert.equal(g['2026-09-26'], 'full');
  assert.equal(g['2026-09-27'], 'waning');
  assert.equal(Object.keys(g).length, 11, 'odd entries are left out');
});

test('full cycles: only real gaps between period starts count', () => {
  assert.equal(core.fullCycles([]).cycles, 0);
  assert.equal(core.fullCycles([{ start: '2026-09-01' }]).cycles, 0);
  const c = core.fullCycles([{ start: '2026-08-30' }, { start: '2026-07-05' }, { start: '2026-08-02' }, { start: '2026-08-02' }, { start: 'oops' }, null, { end: '2026-01-01' }]);
  assert.equal(c.cycles, 2);
  assert.equal(c.first, '2026-07-05');
  assert.equal(c.last, '2026-08-30');
  assert.equal(core.fullCycles([{ start: '2026-01-01' }, { start: '2026-06-01' }, { start: '2026-06-29' }]).cycles, 1, 'a five month gap is a missed log, not a cycle');
});

test('habit streaks, weekday schedules and the one that needs love', () => {
  const log = {};
  ['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21', '2026-09-23'].forEach(d => { log['7_' + d] = true; });   // Mon Wed Fri, then Friday the 25th missed
  ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', TODAY].forEach(d => { log['8_' + d] = true; });
  ['2026-09-24', '2026-09-25', '2026-09-26'].forEach(d => { log['9_' + d] = true; });                               // today still open
  log['7_2026-09-19'] = false; log['7_someday'] = true; log['77_2026-09-25'] = true; log['7_2026-10-30'] = true;
  const list = [
    { id: 7, name: '🧘 Meditate', days: [1, 3, 5], color: '#9080d8' },
    { id: 8, name: '📖 Read' },
    { id: 9, name: '💧 Water', days: [] },
    null, 'Journal', { name: 'No id' }, { id: 5 }, { id: 6, name: '   ' },
  ];
  const h = core.habits(list, log, TODAY);
  assert.equal(h.items.length, 3);
  const [med, read, water] = h.items;

  assert.equal(med.best, 5, 'days it is not due never break the streak');
  assert.equal(med.current, 0, 'the missed Friday ended it');
  assert.equal(med.trackedDays, 14);
  assert.deepEqual(med.weeks.map(w => [w.due, w.hit]), [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [3, 3], [3, 2]]);
  assert.equal(med.weeks[0].rate, null, 'weeks before she began are not counted against her');
  assert.equal(med.weeks[7].to, TODAY);
  assert.equal(med.weeks[7].from, '2026-09-21');
  assert.equal(med.color, '#9080d8');

  assert.equal(read.best, 5);
  assert.equal(read.current, 1);
  assert.deepEqual([read.due28, read.hit28], [27, 6]);

  assert.equal(water.best, 3);
  assert.equal(water.current, 3, 'today still open does not break a streak');

  assert.equal(h.needsLove, 8);
  assert.equal(h.star, 7);
  assert.equal(h.longest, 7);
  assert.equal(h.hits8, 5 + 6 + 3);

  const none = core.habits([{ id: 1, name: 'Stretch' }], {}, TODAY);
  assert.equal(none.items[0].best, 0);
  assert.equal(none.items[0].trackedDays, 0);
  assert.equal(none.needsLove, null);
  assert.deepEqual(core.habits(null, null, TODAY).items, []);
});

test('a habit made with a timestamp id starts counting the day it was made', () => {
  const born = new Date(2026, 8, 20, 8, 0).getTime();
  const h = core.habits([{ id: born, name: 'Walk' }], { [`${born}_2026-09-26`]: true }, TODAY).items[0];
  assert.equal(h.trackedDays, 8);
  assert.deepEqual([h.weeks[6].due, h.weeks[6].hit], [1, 0]);
  assert.deepEqual([h.weeks[7].due, h.weeks[7].hit], [7, 1]);
});

test('on time share, and how late the late ones run', () => {
  const tasks = [
    ...many(6, '2026-09-10', { calendarDate: '2026-09-10' }),  // on the day
    ...many(2, '2026-09-10', { calendarDate: '2026-09-14' }),  // early
    task('2026-09-11', { calendarDate: '2026-09-10' }),        // 1 day late
    task('2026-09-13', { calendarDate: '2026-09-10' }),        // 3 days late
    task('2026-09-15', { calendarDate: '2026-09-10' }),        // 5 days late
    task('2026-09-25', { calendarDate: '2026-09-05' }),        // 20 days late
    ...many(5, '2026-09-12'),                                  // no date: left out of the share
  ];
  const o = core.onTime(core.finished(tasks, '2026-08-29', TODAY));
  assert.equal(o.dated, 12);
  assert.equal(o.onTime, 8);
  assert.equal(o.early, 2);
  assert.equal(o.late, 4);
  assert.equal(o.share, 67);
  assert.equal(o.medianLate, 4);
  assert.equal(o.maxLate, 20);
  assert.deepEqual(o.buckets.map(x => x.n), [1, 1, 1, 1]);
  const clean = core.onTime([]);
  assert.deepEqual([clean.dated, clean.share, clean.medianLate], [0, 0, 0]);
});

test('top 3: how often it gets done', () => {
  const t = core.top3({
    '2026-09-25': [{ text: 'One', done: true }, { text: 'Two', done: true }, { text: 'Three', done: true }],
    '2026-09-26': [{ text: 'One', done: true }, { text: 'Two', done: false }, { text: '', done: true }],
    '2026-09-27': [{ text: '  ', done: false }, { text: '', done: false }, { text: '', done: false }],   // never set
    '2026-09-24': 'oops', '2026-09-23': null, '2026-09-22': [null, 5, { done: true }, { text: 'Real', done: 'yes' }],
    '2026-01-01': [{ text: 'Old', done: true }], 'someday': [{ text: 'x', done: true }],
  }, '2026-08-29', TODAY);
  assert.equal(t.days, 3);
  assert.equal(t.items, 6);
  assert.equal(t.done, 4);
  assert.equal(t.fullDays, 1);
  assert.equal(t.rate, 67);
  assert.equal(t.recent.length, 14);
  assert.deepEqual(t.recent[t.recent.length - 2], { day: '2026-09-26', set: 2, done: 1 });
  assert.equal(core.top3(null, '2026-08-29', TODAY).days, 0);
});

test('focus: minutes per week, the usual session, odd sessions skipped', () => {
  const end = (d, h, m) => { const [y, mo, dd] = d.split('-').map(Number); return new Date(y, mo - 1, dd, h, m).getTime(); };
  const sessions = [
    { id: end('2026-09-22', 10, 30), date: '2026-09-22', minutes: 25 },
    { id: end('2026-09-23', 10, 10), date: '2026-09-23', minutes: 25 },
    { id: end('2026-09-24', 15, 0), date: '2026-09-24', minutes: 50 },
    { id: end('2026-09-15', 9, 45), date: '2026-09-15', minutes: 25 },
    { id: 3, date: '2026-08-04', minutes: '45' },
    { id: 4, date: '2026-09-20', minutes: 'a while' }, { id: 5, date: '2026-09-20', minutes: -5 }, { id: 6, date: '2026-09-20', minutes: 5000 },
    { id: 7, date: 'whenever', minutes: 25 }, { id: 8, minutes: 25 }, { id: 9, date: '2026-10-09', minutes: 25 }, { id: 10, date: '2026-09-20' },
    null, 'x', 12,
  ];
  const f = core.focus(sessions, TODAY);
  assert.equal(f.weeks.length, 8);
  assert.deepEqual(f.weeks.map(w => w.minutes), [45, 0, 0, 0, 0, 0, 25, 100]);
  assert.equal(f.weeks[0].from, '2026-08-03');
  assert.equal(f.count, 5);
  assert.equal(f.minutes, 170);
  assert.equal(f.usual, 25);
  assert.equal(f.bestWeek, 7);
  assert.equal(f.trend, 'up');
  assert.equal(f.activeWeeks, 3);

  const h = core.hours([], sessions, '2026-08-29', TODAY);
  assert.equal(h.total, 4, 'only sessions in the window that remember their time');
  assert.equal(h.focus[10], 1, '10:30 less 25 minutes began at 10:05');
  assert.equal(h.focus[9], 2, '10:10 less 25 minutes began at 9:45, and 9:45 less 25 at 9:20');
  assert.equal(h.focus[14], 1);
  assert.equal(h.peakStart, 8);
  assert.equal(h.peakShare, 75);
  assert.equal(core.hourLabel(h.peakStart + 1), '9am');
  assert.equal(core.hourLabel(12), 'noon');
  assert.equal(core.hourLabel(15), '3pm');
  assert.equal(core.minutesLabel(170), '2h 50m');
  assert.equal(core.minutesLabel(25), '25 min');
});

test('mood: the day close wins, mood words fill in, odd values are skipped', () => {
  const m = core.mood(
    { '2026-09-20': { mood: 'Sad' }, '2026-09-21': { mood: 'Happy' }, '2026-09-23': { mood: 'Bogus' }, '2026-09-24': { energy: 3 }, junk: { mood: 'Calm' }, '2026-09-25': null, '2026-01-01': { mood: 'Calm' } },
    { '2026-09-20': { mood: 4 }, '2026-09-21': { mood: 9 }, '2026-09-22': { mood: '3' }, '2026-09-26': { mood: 2.5 }, '2026-09-27': 'fine', '2026-09-19': { mood: null } },
    '2026-08-29', TODAY);
  assert.deepEqual(m.points, [
    { day: '2026-09-20', score: 4, source: 'close' },
    { day: '2026-09-21', score: 5, source: 'log' },
    { day: '2026-09-22', score: 3, source: 'close' },
  ]);
  assert.equal(m.average, 4);
  assert.equal(m.trend, 'steady', 'too few points to call a direction');
  assert.deepEqual(m.topWords, [{ word: 'Happy', n: 1 }, { word: 'Sad', n: 1 }]);

  const closes = {};
  core.eachDay(day(19), day(10)).forEach(d => { closes[d] = { mood: 2 }; });
  core.eachDay(day(9), TODAY).forEach(d => { closes[d] = { mood: 4 }; });
  const lift = core.mood({}, closes, day(29), TODAY);
  assert.equal(lift.count, 20);
  assert.equal(lift.trend, 'lifting');
  assert.equal(lift.drift, 2);

  const map = {};
  core.eachDay(day(19), day(10)).forEach(d => { map[d] = 'Luteal'; });
  core.eachDay(day(9), TODAY).forEach(d => { map[d] = 'Follicular'; });
  const by = core.moodBy(lift.points, map, core.PHASES);
  assert.equal(by.best, 'Follicular');
  assert.equal(by.groups.find(g => g.id === 'Luteal').average, 2);
  assert.equal(by.count, 20);

  const counts = {};
  core.eachDay(day(9), TODAY).forEach(d => { counts[d] = 3; });
  counts[day(15)] = 5;
  const md = core.moodAndDone(lift.points, counts);
  assert.deepEqual(md, { brightDays: 10, heavyDays: 10, brightAvg: 3, heavyAvg: 0.5 });
});

test('a long stretch of moods becomes one point a week', () => {
  const closes = {};
  core.eachDay(day(69), TODAY).forEach(d => { closes[d] = { mood: 3 }; });
  const m = core.mood({}, closes, day(69), TODAY);
  assert.equal(m.count, 70);
  assert.equal(m.weekly, true);
  assert.equal(m.series.length, 10);
  assert.ok(m.series.every(p => p.score === 3));
});

test('momentum: days in a row with something finished', () => {
  const counts = {};
  ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-20', '2026-09-25', '2026-09-26'].forEach(d => { counts[d] = 1; });
  const m = core.momentum(counts, '2026-08-29', TODAY);
  assert.equal(m.longest, 4);
  assert.equal(m.current, 2, 'today still open keeps the run alive');
  assert.equal(m.activeDays, 7);
  assert.equal(m.days, 18);
  assert.deepEqual(core.momentum({}, '2026-08-29', TODAY), { longest: 0, current: 0, activeDays: 0, days: 0 });
});

test('the thresholds: hidden, an early read, then solid', () => {
  const N = core.NEED;
  assert.deepEqual([N.tasks.days, N.tasks.count, N.cycle.cycles], [14, 10, 2]);
  const g = (days, count) => core.grade([{ have: days, need: 14, solid: 28, label: 'days' }, { have: count, need: 10, solid: 30, label: 'finished tasks' }]);
  assert.equal(g(13, 50).show, false);
  assert.equal(g(60, 9).show, false);
  assert.deepEqual(g(60, 9).missing, ['10 finished tasks (9 so far)']);
  assert.equal(g(60, 9).progress, 0.9);
  assert.deepEqual([g(14, 10).show, g(14, 10).early], [true, true]);
  assert.deepEqual([g(28, 29).show, g(28, 29).early], [true, true]);
  assert.deepEqual([g(28, 30).show, g(28, 30).early], [true, false]);
  assert.equal(core.grade([]).show, false);
  assert.equal(core.grade(null).show, false);
});

// ── the whole report ──
const phaseOf = (d, starts) => {
  const past = starts.filter(s => s <= d);
  if (!past.length) return null;
  const n = (core.diffDays(past[past.length - 1], d) % 28) + 1;
  return n <= 5 ? 'Menstrual' : n <= 12 ? 'Follicular' : n <= 15 ? 'Ovulation' : 'Luteal';
};
const richData = () => {
  const r = core.range('90', TODAY, null);
  const starts = [day(84), day(56), day(28), TODAY];
  const tasks = [], phaseByDay = {}, moonIdxByDay = {};
  core.eachDay(day(59), TODAY).forEach(d => {
    const p = phaseOf(d, starts);
    const n = (core.keyDate(d).getDay() === 2 ? 3 : 1) + (p === 'Follicular' ? 2 : 0);
    tasks.push(...many(n, d, { calendarDate: d }));
  });
  core.eachDay(r.from, TODAY).forEach((d, i) => {
    const p = phaseOf(d, starts); if (p) phaseByDay[d] = p;
    const m = i % 29; moonIdxByDay[d] = m === 0 ? 0 : m === 15 ? 4 : m < 15 ? 2 : 6;
  });
  const raw = {
    tasks, periods: starts.map((s, i) => ({ id: i, start: s })),
    habits: [{ id: 7, name: 'PRIVATE HABIT NAME', days: [1, 3, 5] }], habitLog: {},
    sessions: [], cycleDays: { [day(3)]: { mood: 'Calm', note: 'PRIVATE NOTE' } }, closes: { [day(2)]: { mood: 4, sentence: 'PRIVATE SENTENCE', gratitude: ['PRIVATE THANKS'] } },
    top3: { [day(1)]: [{ text: 'PRIVATE TOP', done: true }] },
  };
  core.eachDay(day(27), TODAY).forEach(d => { if ([1, 3, 5].includes(core.keyDate(d).getDay())) raw.habitLog['7_' + d] = true; });
  return { raw, r, maps: { phaseByDay, moonIdxByDay } };
};

test('report: when every finished task lands in one phase, the card says so instead of steady', () => {
  const r = core.range('90', TODAY, null);
  const starts = [day(84), day(56), day(28), TODAY];
  const tasks = [], phaseByDay = {}, moonIdxByDay = {};
  core.eachDay(day(69), TODAY).forEach(d => {
    const p = phaseOf(d, starts); if (p) phaseByDay[d] = p;
    moonIdxByDay[d] = p === 'Follicular' ? 4 : 2;
    if (p === 'Follicular') tasks.push(...many(2, d, { calendarDate: d }));
  });
  assert.ok(tasks.length >= 10, 'enough finished tasks for the cards to show');
  const rep = core.report({ tasks, periods: starts.map((s, i) => ({ id: i, start: s })) }, r, { phaseByDay, moonIdxByDay });
  const card = id => rep.cards.find(c => c.id === id);
  assert.equal(card('cycle').show, true);
  assert.equal(card('cycle').data.lift, null);
  assert.equal(card('cycle').sentence, 'Nearly everything you finish lands in your follicular phase.');
  assert.deepEqual(card('cycle').chip, { big: 'Follicular', small: 'your fullest phase' });
  assert.equal(card('moon').show, true);
  assert.equal(card('moon').data.lift, null);
  assert.equal(card('moon').sentence, 'Nearly everything you finish lands around the full moon.');
  assert.deepEqual(card('moon').chip, { big: 'Full moon', small: 'your busiest moon' });
});

test('report: cards show only with enough behind them', () => {
  const { raw, r, maps } = richData();
  const rep = core.report(raw, r, maps);
  const card = id => rep.cards.find(c => c.id === id);
  assert.equal(rep.cards.length, 11);

  assert.equal(card('weekday').show, true);
  assert.equal(card('weekday').early, false);
  assert.equal(card('weekday').data.bestName, 'Tuesday');
  assert.match(card('weekday').sentence, /^Tuesdays are your power day\. You finish about [\d.]+ times as much as on your other days\.$/);

  assert.equal(card('cycle').show, true);
  assert.equal(card('cycle').early, true, 'three full cycles is still an early read');
  assert.equal(card('cycle').data.best, 'Follicular');
  assert.match(card('cycle').sentence, /^You finish about [\d.]+ times as much in your follicular phase\.$/);

  assert.equal(card('moon').show, true);
  assert.equal(card('onTime').show, true);
  assert.equal(card('onTime').data.share, 100);
  assert.equal(card('momentum').data.longest, 60);

  assert.equal(card('habits').show, true);
  assert.equal(card('habits').data.items[0].best, 12);
  assert.match(card('habits').sentence, /PRIVATE HABIT NAME holds your best streak at 12 days/);

  ['mood', 'hours', 'focus', 'top3', 'moodDone'].forEach(id => {
    assert.equal(card(id).show, false, id + ' stays quiet');
    assert.equal(card(id).sentence, undefined);
    assert.ok(card(id).missing.length > 0);
    assert.ok(card(id).go && card(id).goLabel);
  });
  assert.deepEqual(card('mood').missing, ['7 days with a mood logged (2 so far)']);
  assert.equal(rep.shown, 6);
  assert.equal(rep.gathering.length, 5);
});

test('report: cycle cards need two full cycles, whatever else she has', () => {
  const { raw, r, maps } = richData();
  raw.periods = [{ id: 1, start: day(28) }, { id: 2, start: TODAY }];
  const one = core.report(raw, r, maps).cards.find(c => c.id === 'cycle');
  assert.equal(one.show, false);
  assert.ok(one.missing.some(m => /^2 full cycles logged \(1 so far\)$/.test(m)));
  raw.periods = [];
  const none = core.report(raw, r, { ...maps, phaseByDay: {} }).cards.find(c => c.id === 'cycle');
  assert.equal(none.show, false);
});

test('report: 14 days and 10 finished tasks is the line', () => {
  const r = core.range('30', TODAY, null);
  const build = (span, n) => core.report({ tasks: [task(day(span - 1)), ...many(n - 1, TODAY)] }, r, {});
  const card = rep => rep.cards.find(c => c.id === 'weekday');
  assert.equal(card(build(13, 10)).show, false);
  assert.equal(card(build(14, 9)).show, false);
  assert.equal(card(build(14, 10)).show, true);
  assert.equal(card(build(14, 10)).early, true);
  assert.equal(card(build(28, 30)).early, false);
});

test('report: too little for anything, and nothing breaks on empty or odd data', () => {
  const r = core.range('30', TODAY, null);
  const thin = core.report({ tasks: many(5, day(2)) }, r, {});
  assert.equal(thin.shown, 0);
  assert.equal(thin.totals.finished, 5);
  assert.equal(thin.gathering.length, thin.cards.length);
  [undefined, null, {}, { tasks: 'x', habits: 5, habitLog: [], sessions: {}, periods: 'no', cycleDays: [], closes: 3, top3: 'y' }].forEach(raw => {
    const rep = core.report(raw, r, null);
    assert.equal(rep.shown, 0);
    assert.equal(rep.totals.finished, 0);
  });
});

test('what goes to the AI: numbers only, no titles, notes or habit names', () => {
  const { raw, r, maps } = richData();
  const rep = core.report(raw, r, maps);
  const { facts, names } = core.summary(rep);
  const sent = JSON.stringify(facts);
  ['SECRET TITLE', 'PRIVATE', 'Meditate'].forEach(w => assert.ok(!sent.includes(w), `${w} never leaves the device`));
  assert.equal(facts.weekday.strongest, 'Tuesday');
  assert.equal(facts.cycle.earlyRead, true);
  assert.equal(facts.cycle.fullestPhase, 'Follicular');
  assert.equal(facts.habits.habits[0].label, '[habit 1]');
  assert.equal(facts.habits.habits[0].bestStreakDays, 12);
  assert.equal(facts.mood, undefined, 'a card that is not shown sends nothing');
  assert.equal(facts.weekday.data, undefined);
  assert.deepEqual(names, { '[habit 1]': 'PRIVATE HABIT NAME' });
});

test('the reply: three ideas, habit names put back here, dashes smoothed', () => {
  const names = { '[habit 1]': 'Meditate', '[habit 2]': 'Read' };
  const json = 'Here you go:\n[{"title":"Guard your Tuesdays","text":"Put the big thing on Tuesday \u2014 it is your power day."},{"title":"Love for [Habit 2]","text":"Pair [habit 2] with [habit 1]."},{"title":"Three","text":"Keep going."},{"title":"Four","text":"Too many."},{"title":"No text"}]';
  const items = core.parseAdvice(json, names);
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], { title: 'Guard your Tuesdays', text: 'Put the big thing on Tuesday, it is your power day.' });
  assert.deepEqual(items[1], { title: 'Love for Read', text: 'Pair Read with Meditate.' });
  const lines = core.parseAdvice('1. Put your biggest task on Tuesday.\n2) Give [habit 9] five minutes.\n- Keep sessions at 25 minutes.\nok', names);
  assert.deepEqual(lines.map(l => l.text), ['Put your biggest task on Tuesday.', 'Give that habit five minutes.', 'Keep sessions at 25 minutes.']);
  assert.deepEqual(core.parseAdvice('[{"title": broken', names), []);
  assert.deepEqual(core.parseAdvice('', names), []);
  assert.deepEqual(core.parseAdvice(null, null), []);
});

test('copy: no em dashes and no banned words in anything she reads', () => {
  const { raw, r, maps } = richData();
  const rep = core.report(raw, r, maps);
  const words = rep.cards.map(c => [c.title, c.sentence, c.detail, c.goLabel, ...(c.missing || []), c.chip ? c.chip.big + c.chip.small : ''].join(' ')).join(' ');
  assert.ok(!/[\u2014\u2013]/.test(words));
  assert.ok(!/[\u2014\u2013]/.test(src.replace(/\\u201[34]/g, '')), 'no dash characters anywhere in the file');
  assert.ok(!/wizard/i.test(src));
  assert.ok(!/https?:\/\//.test(src), 'no addresses in the module');
});
