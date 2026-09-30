// Close the Day (js/close-day.jsx). Every case runs against a fixed clock.
// Run: node --test tests/close-day.test.mjs
// The first half runs the plain-JS helpers alone. The second half draws the
// components with a tiny stand-in for React; it needs @babel/standalone, found
// through NYLA_TOOLS (a folder holding node_modules) or the repo's own
// node_modules, and is skipped when that is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const source = readFileSync(join(root, 'js', 'close-day.jsx'), 'utf8');
const html = readFileSync(join(root, 'nyla-os.html'), 'utf8');
const MARK = '// ── cd:components ──';
assert.ok(source.includes(MARK), 'the components marker is in the file');
const helperSource = source.slice(0, source.indexOf(MARK));

// The app's own task toggle, lifted from the page so the test follows the real thing.
const grab = re => { const m = re.exec(html); assert.ok(m, 'found ' + re); return m[0]; };
const appTaskCode = [
  grab(/const toDateKey = .*\n/),
  grab(/const nextRepeatDate = [\s\S]*?\n};\n/),
  grab(/const toggleTaskIn = [\s\S]*?\n};\n/),
].join('\n');

// ── A small world to run in ────────────────────────────────────────────
let NOW = new Date(2026, 8, 29, 21, 0, 0).getTime(); // Tuesday, September 29, 2026, 9 pm
const at = (y, m, d, h, min = 0) => { NOW = new Date(y, m - 1, d, h, min, 0).getTime(); };
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
}
const makeWorld = () => {
  const store = new Map();
  const events = [];
  const toasts = [];
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
  const window = { dispatchEvent: e => { events.push(e.type); return true; }, addEventListener() {}, removeEventListener() {}, _navigateTo() {} };
  const document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {}, body: { style: {} } };
  class CustomEvent { constructor(type) { this.type = type; } }
  const toast = (m, type) => toasts.push([m, type]);
  const app = new Function('Date', appTaskCode + '\nreturn { toDateKey, toggleTaskIn };')(FakeDate);
  return { store, events, toasts, localStorage, window, document, CustomEvent, toast, ...app,
    DEFAULT_HABITS: ['💧 Water', '📖 Read'], habitDue: (h, d) => !h.days || !h.days.length || h.days.includes(d.getDay()),
    put: (k, v) => store.set(k, typeof v === 'string' ? v : JSON.stringify(v)),
    get: k => (store.has(k) ? JSON.parse(store.get(k)) : null) };
};
const HELPERS = ['cd_day', 'cd_isEvening', 'cd_key', 'cd_shift', 'cd_monthsBack', 'cd_clean', 'cd_closes', 'cd_entries', 'cd_streak', 'cd_longest', 'cd_weeks', 'cd_lookbacks',
  'cd_saveClose', 'cd_gratKey', 'cd_gratSplit', 'cd_gratJoin', 'cd_top3Key', 'cd_top3Read', 'cd_tasks', 'cd_doneOn', 'cd_leftOn', 'cd_dueOn', 'cd_redate', 'cd_changeTasks',
  'cd_toggleDone', 'cd_habits', 'cd_eventsOn', 'cd_clock', 'cd_draft', 'cd_journalHtml', 'cd_offerLines', 'cd_esc', 'cd_plural', 'CD_MOODS', 'CD_ENERGY', 'CD_STEPS', 'CD_MOON_LINES'];
const WORLD_NAMES = ['Date', 'localStorage', 'window', 'document', 'CustomEvent', 'toast', 'toDateKey', 'toggleTaskIn', 'DEFAULT_HABITS', 'habitDue'];
const loadHelpers = (w = makeWorld()) => {
  const fn = new Function(...WORLD_NAMES, helperSource + `\nreturn { ${HELPERS.join(', ')} };`);
  return { w, h: fn(FakeDate, w.localStorage, w.window, w.document, w.CustomEvent, w.toast, w.toDateKey, w.toggleTaskIn, w.DEFAULT_HABITS, w.habitDue) };
};

// ── Helpers ────────────────────────────────────────────────────────────
test('the helper half of the file holds no JSX and runs on its own', () => {
  const { h } = loadHelpers();
  HELPERS.forEach(n => assert.notEqual(h[n], undefined, n));
});

test('the day being closed: before 3 am it is still yesterday', () => {
  const { h } = loadHelpers();
  const day = (hh, mm = 0) => h.cd_day(new Date(2026, 8, 29, hh, mm));
  assert.equal(day(21), '2026-09-29');
  assert.equal(day(23, 59), '2026-09-29');
  assert.equal(day(0, 0), '2026-09-28');
  assert.equal(day(2, 59), '2026-09-28');
  assert.equal(day(3, 0), '2026-09-29');
  assert.equal(h.cd_day(new Date(2026, 0, 1, 1, 0)), '2025-12-31', 'across a year');
  assert.equal(h.cd_day(new Date(2026, 2, 1, 0, 30)), '2026-02-28', 'across a month');
  at(2026, 9, 30, 1, 30);
  assert.equal(h.cd_day(), '2026-09-29', 'with no argument it reads the clock');
});

test('the card hours: 6 pm until 3 am', () => {
  const { h } = loadHelpers();
  const ev = hh => h.cd_isEvening(new Date(2026, 8, 29, hh, 0));
  assert.deepEqual([17, 18, 23, 0, 2, 3, 9].map(ev), [false, true, true, true, true, false, false]);
});

test('shifting days and months back', () => {
  const { h } = loadHelpers();
  assert.equal(h.cd_shift('2026-09-30', 1), '2026-10-01');
  assert.equal(h.cd_shift('2026-03-01', -1), '2026-02-28');
  assert.equal(h.cd_shift('2026-11-01', 1), '2026-11-02', 'across the clock change');
  assert.equal(h.cd_monthsBack('2026-03-31', 1), '2026-02-28');
  assert.equal(h.cd_monthsBack('2026-09-29', 12), '2025-09-29');
});

test('a stored close is tidied, and odd records never crash', () => {
  const { h } = loadHelpers();
  assert.equal(h.cd_clean(null), null);
  assert.equal(h.cd_clean('hello'), null);
  assert.equal(h.cd_clean([1, 2]), null);
  assert.deepEqual(h.cd_clean({}), { mood: null, energy: null, sentence: '', gratitude: [], closedAt: '', doneCount: 0, movedCount: 0 });
  assert.deepEqual(h.cd_clean({ mood: 9, energy: '2', sentence: '  hi  ', gratitude: ['a', 4, '', ' b ', 'c', 'd'], closedAt: 5, doneCount: -3, movedCount: '2' }),
    { mood: null, energy: 2, sentence: 'hi', gratitude: ['a', 'b', 'c'], closedAt: '', doneCount: 0, movedCount: 2 });
});

test('closes that are not an object read as empty', () => {
  const { h, w } = loadHelpers();
  w.put('nylaos_day_closes', '[1,2,3]'); assert.deepEqual(h.cd_closes(), {});
  w.put('nylaos_day_closes', '{not json'); assert.deepEqual(h.cd_closes(), {});
  w.put('nylaos_day_closes', { '2026-09-28': { mood: 4 }, junk: 5, '2026-09-27': 'nope' });
  assert.deepEqual(h.cd_entries(h.cd_closes()).map(e => e.day), ['2026-09-28']);
});

test('streaks: tonight still open does not break one; a gap does', () => {
  const { h } = loadHelpers();
  const c = { '2026-09-28': {}, '2026-09-27': {}, '2026-09-26': {}, '2026-09-24': {}, '2026-09-23': {}, '2026-09-22': {}, '2026-09-21': {} };
  assert.equal(h.cd_streak(c, '2026-09-29'), 3);
  assert.equal(h.cd_streak({ ...c, '2026-09-29': {} }, '2026-09-29'), 4);
  assert.equal(h.cd_streak(c, '2026-09-30'), 0);
  assert.equal(h.cd_streak({}, '2026-09-29'), 0);
  assert.equal(h.cd_longest(c), 4);
  assert.equal(h.cd_longest({}), 0);
});

test('eight weeks: 56 days, Sunday first, the last row holds the day', () => {
  const { h } = loadHelpers();
  const weeks = h.cd_weeks('2026-09-29', 8);
  assert.equal(weeks.length, 8);
  assert.ok(weeks.every(r => r.length === 7));
  assert.equal(new Set(weeks.flat()).size, 56);
  assert.ok(weeks[7].includes('2026-09-29'));
  assert.equal(weeks[7][0], '2026-09-27');
  assert.equal(weeks[0][0], '2026-08-09');
});

test('this night, before: only nights that hold a line', () => {
  const { h } = loadHelpers();
  const c = { '2026-09-22': { sentence: 'a week back' }, '2026-08-29': { sentence: '' }, '2025-09-29': { sentence: 'a year back', mood: 5 } };
  assert.deepEqual(h.cd_lookbacks(c, '2026-09-29').map(x => [x.label, x.sentence]), [['A week ago', 'a week back'], ['A year ago', 'a year back']]);
});

test('gratitude: the same key Home uses; three lines; the rest is kept', () => {
  const { h } = loadHelpers();
  assert.equal(h.cd_gratKey('2026-09-29'), 'nylaos_gratitude_' + new Date(2026, 8, 29).toDateString());
  assert.deepEqual(h.cd_gratSplit('1. coffee\n- the sun\n\n• mom\nfourth\nfifth'), { lines: ['coffee', 'the sun', 'mom'], rest: ['fourth', 'fifth'] });
  assert.deepEqual(h.cd_gratSplit(null), { lines: ['', '', ''], rest: [] });
  assert.deepEqual(h.cd_gratSplit('coffee, the sun, mom').lines, ['coffee, the sun, mom', '', '']);
  assert.equal(h.cd_gratJoin(['a', '', ' c '], ['fourth']), 'a\nc\nfourth');
  assert.equal(h.cd_gratJoin(['', '', ''], []), '');
});

test('top 3: the planner key and shape, whatever is stored', () => {
  const { h, w } = loadHelpers();
  assert.equal(h.cd_top3Key('2026-09-30'), 'nylaos_top3_2026-09-30');
  const blank = [{ text: '', done: false }, { text: '', done: false }, { text: '', done: false }];
  assert.deepEqual(h.cd_top3Read('2026-09-30'), blank);
  w.put('nylaos_top3_2026-09-30', [{ text: 'Essay', done: true }, null, { text: 7 }]);
  assert.deepEqual(h.cd_top3Read('2026-09-30'), [{ text: 'Essay', done: true }, { text: '', done: false }, { text: '', done: false }]);
  w.put('nylaos_top3_2026-09-30', '"oops"');
  assert.deepEqual(h.cd_top3Read('2026-09-30'), blank);
});

const TASKS = () => [
  { id: 1, text: 'Finished today', done: true, completedDate: '2026-09-29', calendarDate: '2026-09-29' },
  { id: 2, text: 'Finished yesterday', done: true, completedDate: '2026-09-28' },
  { id: 3, text: 'Due today', done: false, calendarDate: '2026-09-29', venture: 'School', notes: 'keep me' },
  { id: 4, text: 'Overdue', done: false, calendarDate: '2026-09-20' },
  { id: 5, text: 'Due tomorrow', done: false, calendarDate: '2026-09-30' },
  { id: 6, text: 'No date', done: false },
  { id: 7, text: 'A class', done: false, calendarDate: '2026-09-29', source: 'calendar', time: '09:00' },
  { id: 8, text: 'Every day', done: false, calendarDate: '2026-09-29', repeat: 'daily' },
  null, 'junk', { id: 9 }, { text: 'no id' },
];

test('tasks: what got done, what is left, what is due', () => {
  const { h, w } = loadHelpers();
  w.put('nylaos_tasks', TASKS());
  const t = h.cd_tasks();
  assert.deepEqual(t.map(x => x.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(h.cd_doneOn(t, '2026-09-29').map(x => x.id), [1]);
  assert.deepEqual(h.cd_leftOn(t, '2026-09-29').map(x => x.id), [3, 8, 4], 'newest due first, no timed schedule blocks');
  assert.deepEqual(h.cd_dueOn(t, '2026-09-30').map(x => x.id), [5]);
  w.put('nylaos_tasks', '{"not":"a list"}');
  assert.deepEqual(h.cd_tasks(), []);
});

test('moving a task touches only its date, and keeps every other record', () => {
  const { h, w } = loadHelpers();
  w.put('nylaos_tasks', TASKS());
  assert.equal(h.cd_changeTasks(raw => h.cd_redate(raw, [3], '2026-09-30')), true);
  const after = w.get('nylaos_tasks');
  assert.equal(after.length, TASKS().length, 'nothing dropped, odd records included');
  assert.deepEqual(after[2], { ...TASKS()[2], calendarDate: '2026-09-30' });
  assert.deepEqual(after.filter((_, i) => i !== 2), TASKS().filter((_, i) => i !== 2));
  assert.deepEqual(w.events, ['nyla-tasks-changed']);
  h.cd_changeTasks(raw => h.cd_redate(raw, [4], null));
  assert.equal(w.get('nylaos_tasks')[3].calendarDate, null, 'let it go clears the date');
});

test('a stored task list that is not a list is never written over', () => {
  const { h, w } = loadHelpers();
  w.put('nylaos_tasks', '{"not":"a list"}');
  assert.equal(h.cd_changeTasks(raw => h.cd_redate(raw, [3], '2026-09-30')), false);
  assert.equal(w.store.get('nylaos_tasks'), '{"not":"a list"}');
  assert.deepEqual(w.events, []);
});

test('done after all uses the app toggle; after midnight it lands on the closed day', () => {
  at(2026, 9, 30, 0, 40); // 12:40 am, closing the 29th
  const { h, w } = loadHelpers();
  w.put('nylaos_tasks', TASKS().filter(t => t && typeof t === 'object' && t.id != null && t.text));
  assert.equal(h.cd_toggleDone(3, h.cd_day()), true);
  let t3 = w.get('nylaos_tasks').find(t => t.id === 3);
  assert.equal(t3.done, true);
  assert.equal(t3.completedDate, '2026-09-29');
  assert.equal(t3.notes, 'keep me');
  // A repeating task makes its next copy, the way the app does, and undo takes it back.
  const before = w.get('nylaos_tasks').length;
  h.cd_toggleDone(8, h.cd_day());
  assert.equal(w.get('nylaos_tasks').length, before + 1);
  h.cd_toggleDone(8, h.cd_day());
  assert.equal(w.get('nylaos_tasks').length, before);
  assert.equal(w.get('nylaos_tasks').find(t => t.id === 8).done, false);
  at(2026, 9, 29, 21);
});

test('a task list with a broken record in it fails kindly', () => {
  const { h, w } = loadHelpers();
  w.put('nylaos_tasks', [null, { id: 3, text: 'x', done: false }]);
  const raw = w.store.get('nylaos_tasks');
  assert.equal(h.cd_toggleDone(3, '2026-09-29'), false);
  assert.equal(w.store.get('nylaos_tasks'), raw);
  assert.equal(w.toasts.length, 1);
  assert.doesNotMatch(w.toasts[0][0], /TypeError|undefined|null/);
});

test('saving a close keeps the shape and leaves other nights alone', () => {
  const { h, w } = loadHelpers();
  w.put('nylaos_day_closes', { '2026-09-28': { mood: 4, energy: 2, sentence: 'before', gratitude: [], closedAt: 'x', doneCount: 1, movedCount: 0 } });
  const rec = { mood: 5, energy: 3, sentence: 'A bright one', gratitude: ['a', 'b'], closedAt: '2026-09-30T01:00:00.000Z', doneCount: 4, movedCount: 2 };
  assert.equal(h.cd_saveClose('2026-09-29', rec), true);
  const c = w.get('nylaos_day_closes');
  assert.deepEqual(c['2026-09-29'], rec);
  assert.deepEqual(Object.keys(c['2026-09-29']).sort(), ['closedAt', 'doneCount', 'energy', 'gratitude', 'mood', 'movedCount', 'sentence']);
  assert.equal(c['2026-09-28'].sentence, 'before');
  assert.deepEqual(w.events, ['nyla-closeday-changed']);
  h.cd_saveClose('2026-09-29', { sentence: 'Edited' });
  assert.deepEqual(w.get('nylaos_day_closes')['2026-09-29'], { ...rec, sentence: 'Edited' });
});

test('habits kept, read the way the planner keeps them', () => {
  const { h, w } = loadHelpers();
  assert.deepEqual(h.cd_habits('2026-09-29').due.map(x => x.name), ['💧 Water', '📖 Read'], 'the default habits');
  w.put('nylaos_habits', [{ id: 'a', name: 'Walk' }, { id: 'b', name: 'Sunday reset', days: [0] }, { id: 'c', name: 'Read' }, null, { name: 'no id' }]);
  w.put('nylaos_habit_log', { 'a_2026-09-29': true, 'c_2026-09-28': true });
  const r = h.cd_habits('2026-09-29'); // a Tuesday
  assert.deepEqual(r.due.map(x => x.id), ['a', 'c']);
  assert.deepEqual(r.kept.map(x => x.id), ['a']);
  w.put('nylaos_habit_log', 'null');
  assert.equal(h.cd_habits('2026-09-29').kept.length, 0);
});

test('events, clock times and drafts', () => {
  const { h, w } = loadHelpers();
  w.put('nylaos_events', [{ id: 1, date: '2026-09-30', text: 'Dinner', time: '19:30' }, { id: 2, date: '2026-09-30', text: 'Class', time: '09:00' }, { id: 3, date: '2026-09-30', text: 'All day' }, { id: 4, date: '2026-10-01', text: 'Other' }, null]);
  assert.deepEqual(h.cd_eventsOn('2026-09-30').map(e => e.text), ['Class', 'Dinner', 'All day']);
  assert.deepEqual(['09:00', '19:30', '00:15', '12:00', '', 'soon'].map(h.cd_clock), ['9 AM', '7:30 PM', '12:15 AM', '12 PM', '', '']);
  w.put('nyla_closeday_draft', { day: '2026-09-28', mood: 2 });
  assert.equal(h.cd_draft('2026-09-29'), null, 'a draft from another night is ignored');
  assert.equal(h.cd_draft('2026-09-28').mood, 2);
});

test('the journal document is escaped', () => {
  const { h } = loadHelpers();
  const entries = h.cd_entries({ '2026-09-29': { mood: 4, energy: 3, sentence: 'Fixed <select> & "slept"', gratitude: ['<b>tea</b>'] }, '2026-08-02': { sentence: '' } });
  const out = h.cd_journalHtml(entries);
  assert.match(out, /<h2>September 2026<\/h2>/);
  assert.match(out, /<h2>August 2026<\/h2>/);
  assert.match(out, /Fixed &lt;select&gt; &amp; &quot;slept&quot;/);
  assert.match(out, /&lt;b&gt;tea&lt;\/b&gt;/);
  assert.match(out, /Tuesday, September 29 · Good, Bright energy/);
  assert.doesNotMatch(out, /<select>|<b>tea/);
});

test('lines offered by Claude are tidied', () => {
  const { h } = loadHelpers();
  assert.deepEqual(h.cd_offerLines('1. "I finished the essay."\n- I rested — and it helped.\n\n• Third one\nFourth'), ['I finished the essay.', 'I rested , and it helped.', 'Third one']);
  assert.deepEqual(h.cd_offerLines(''), []);
});

test('copy: no em dashes and no "wizard" anywhere in the file', () => {
  const code = source.replace(/replace\(\/[^/]*\/g, ','\)/g, '');
  assert.doesNotMatch(code, /—/);
  assert.doesNotMatch(source, /wizard/i);
});

// ── Components, drawn with a stand-in for React ────────────────────────
const findBabel = () => {
  const spots = [process.env.NYLA_TOOLS, root, here].filter(Boolean);
  for (const s of spots) {
    if (!existsSync(join(s, 'node_modules', '@babel', 'standalone'))) continue;
    try { return createRequire(join(s, 'package.json'))('@babel/standalone'); } catch (e) {}
  }
  return null;
};
const Babel = findBabel();
const skip = Babel ? false : 'needs @babel/standalone (set NYLA_TOOLS to a folder that holds it)';

const makeReact = effects => {
  const Fragment = Symbol('Fragment');
  class Component { constructor(props) { this.props = props; } }
  return {
    Fragment, Component,
    createElement: (type, props, ...kids) => ({ type, props: { ...(props || {}), children: kids.length <= 1 ? kids[0] : kids } }),
    useState: init => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: fn => { effects.push(fn); },
    useRef: v => ({ current: v }),
    useMemo: fn => fn(),
    useCallback: fn => fn,
  };
};
// Walks the tree, calling every component, and gathers the words and the buttons.
const draw = (node, out = { text: [], taps: [], inputs: [] }) => {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') { out.text.push(String(node)); return out; }
  if (Array.isArray(node)) {
    // Neighbouring pieces of text are one run of words, the way the page shows them.
    let run = null;
    node.forEach(n => {
      if (typeof n === 'string' || typeof n === 'number') { run = (run == null ? '' : run) + String(n); return; }
      if (run != null) { out.text.push(run); run = null; }
      draw(n, out);
    });
    if (run != null) out.text.push(run);
    return out;
  }
  const { type, props } = node;
  if (typeof type === 'function') {
    if (type.prototype && type.prototype.render) { const inst = new type(props); return draw(inst.render(), out); }
    return draw(type(props), out);
  }
  if (type === 'style') return out;
  const inner = draw(props.children, { text: [], taps: [], inputs: [] });
  if (typeof props.onClick === 'function' && (type === 'button')) out.taps.push({ label: inner.text.join('').trim(), aria: props['aria-label'] || '', onClick: props.onClick, style: props.style || {}, disabled: !!props.disabled });
  if (type === 'input' || type === 'textarea') out.inputs.push(props);
  out.text.push(...inner.text); out.taps.push(...inner.taps); out.inputs.push(...inner.inputs);
  return out;
};

const loadApp = (w, { mobile = false } = {}) => {
  const effects = [];
  const React = makeReact(effects);
  const C = new Proxy({}, { get: (_, k) => (k === 'gradA' || k === 'gradNight' ? 'linear-gradient(#111,#222)' : '#c4607a') });
  const box = name => ({ children }) => React.createElement('div', { 'data-is': name }, children);
  const calls = { pdf: [], claude: [], nav: [] };
  w.window._navigateTo = (...a) => calls.nav.push(a);
  const globals = {
    Date: FakeDate, localStorage: w.localStorage, window: w.window, document: w.document, CustomEvent: w.CustomEvent, toast: w.toast,
    toDateKey: w.toDateKey, toggleTaskIn: w.toggleTaskIn, DEFAULT_HABITS: w.DEFAULT_HABITS, habitDue: w.habitDue,
    React, C, Card: box('Card'), SectionHeading: box('SectionHeading'),
    PageTitle: ({ children, subtitle }) => React.createElement('div', null, children, subtitle),
    Pill: ({ children, onClick }) => React.createElement('button', { onClick }, children),
    EmptyState: ({ title, text, action }) => React.createElement('div', null, title, text, action),
    useIsMobile: () => mobile,
    getMoonForDate: () => ({ idx: 4, emoji: '🌕', label: 'Full Moon' }),
    prettyDue: k => ({ label: 'due ' + k }),
    VoiceButton: () => null,
    callClaude: async a => { calls.claude.push(a); return 'One.\nTwo.\nThree.'; },
    printAsPdf: (...a) => { calls.pdf.push(a); },
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {}, console: { warn() {} },
  };
  const js = Babel.transform(source, { presets: ['react'], filename: 'close-day.jsx' }).code;
  const names = Object.keys(globals);
  const mod = new Function(...names, js + '\nreturn { CloseDayPage, CloseDayCard, CdRitual, CdBoundary };')(...names.map(n => globals[n]));
  const show = (Comp, props) => {
    effects.length = 0;
    const out = draw(React.createElement(Comp, props || {}));
    const cleanups = effects.map(fn => fn()).filter(f => typeof f === 'function');
    cleanups.forEach(f => f());
    out.words = out.text.join(' ').replace(/\s+/g, ' ');
    out.tap = label => { const b = out.taps.find(t => t.label.includes(label) || t.aria.includes(label)); assert.ok(b, `a button that says "${label}" (have: ${out.taps.map(t => t.label || t.aria).join(' | ')})`); return b.onClick({ stopPropagation() {}, target: {} }); };
    return out;
  };
  return { ...mod, show, calls, React };
};

test('Home card: hidden in the day, inviting in the evening, quiet once closed', { skip }, () => {
  const w = makeWorld(); const app = loadApp(w);
  at(2026, 9, 29, 14);
  assert.equal(app.show(app.CloseDayCard).words, '', 'nothing at 2 pm');
  w.put('nyla_closeday_force', '1');
  assert.match(app.show(app.CloseDayCard).words, /Ready to close the day\? 🌙/, 'the test hook shows it at any hour');
  w.store.delete('nyla_closeday_force');
  at(2026, 9, 29, 18);
  w.put('nylaos_tasks', TASKS());
  w.put('nylaos_day_closes', { '2026-09-28': { mood: 3 }, '2026-09-27': { mood: 3 } });
  const card = app.show(app.CloseDayCard);
  assert.match(card.words, /Ready to close the day\? 🌙/);
  assert.match(card.words, /1 thing finished · 3 to put down · 2 nights in a row so far/);
  card.taps.forEach(t => assert.ok(parseInt(t.style.minHeight, 10) >= 40, `"${t.label}" is tall enough to tap`));
  card.tap('Not tonight');
  assert.equal(w.store.get('nyla_closeday_skip'), '2026-09-29');
  assert.equal(app.show(app.CloseDayCard).words, '', 'hidden for the rest of the night');
  at(2026, 9, 30, 1);
  assert.equal(app.show(app.CloseDayCard).words, '', 'still hidden after midnight: it is the same night');
  at(2026, 9, 30, 19);
  assert.match(app.show(app.CloseDayCard).words, /Ready to close the day/, 'back the next evening');
  w.put('nylaos_day_closes', { '2026-09-30': { mood: 4, closedAt: 'x' } });
  assert.equal(app.show(app.CloseDayCard).words, 'Day closed ✓ Sleep well');
  at(2026, 10, 1, 2);
  assert.equal(app.show(app.CloseDayCard).words, 'Day closed ✓ Sleep well', 'after midnight it still means the day that just ended');
  at(2026, 10, 1, 3);
  assert.equal(app.show(app.CloseDayCard).words, '');
  at(2026, 9, 29, 21);
});

test('Home card after midnight speaks about the day that just ended', { skip }, () => {
  const w = makeWorld(); const app = loadApp(w, { mobile: true });
  at(2026, 9, 30, 0, 30);
  assert.match(app.show(app.CloseDayCard).words, /It is past midnight\. Put Tuesday to bed/);
  at(2026, 9, 29, 21);
});

test('every step of the ritual draws, on phone and desktop, with data and with none', { skip }, () => {
  for (const mobile of [true, false]) for (const full of [true, false]) {
    const w = makeWorld(); const app = loadApp(w, { mobile });
    if (full) {
      w.put('nylaos_tasks', TASKS());
      w.put('nylaos_events', [{ id: 1, date: '2026-09-30', text: 'Class', time: '09:00' }]);
      w.put(loadHelpers(w).h.cd_gratKey('2026-09-29'), 'coffee\nthe sun');
    }
    const words = [0, 1, 2, 3, 4, 5].map(step => app.show(app.CdRitual, { day: '2026-09-29', startStep: step, onClose() {} }).words);
    assert.match(words[0], /What got done/);
    assert.match(words[0], full ? /1 thing finished ✨/ : /Nothing was ticked off today, and that is allowed/);
    assert.match(words[1], full ? /Due today[\s\S]*Every day[\s\S]*Overdue/ : /Nothing is left hanging/);
    assert.match(words[2], /How today felt[\s\S]*Heavy[\s\S]*Glowing[\s\S]*Low[\s\S]*Bright[\s\S]*Today in a sentence/);
    assert.match(words[3], full ? /You wrote these earlier/ : /Small ones count the most/);
    assert.match(words[4], /Tomorrow’s Top 3/);
    assert.match(words[4], full ? /1 thing on the schedule, starting with Class at 9 AM[\s\S]*Due tomorrow/ : /Nothing is dated for tomorrow yet/);
    assert.match(words[5], /Full Moon[\s\S]*The day is closed[\s\S]*A full moon tonight/);
    words.forEach(x => { assert.doesNotMatch(x, /undefined|NaN|\[object/); assert.doesNotMatch(x, /—/); });
  }
});

test('ritual, what is left: each choice writes the task the way the app does', { skip }, () => {
  const w = makeWorld(); const app = loadApp(w, { mobile: true });
  w.put('nylaos_tasks', TASKS());
  const step = () => app.show(app.CdRitual, { day: '2026-09-29', startStep: 1, onClose() {} });
  const s = step();
  const labels = s.taps.map(t => t.label);
  ['→ Tomorrow', '🍃 Let it go', '✓ Done after all', 'Move all 3 to tomorrow'].forEach(l => assert.ok(labels.includes(l), l));
  assert.equal(s.inputs.filter(i => i.type === 'date').length, 3, 'a date picker per task');
  s.taps.filter(t => /Tomorrow|Let it go|Done after all/.test(t.label)).forEach(t => assert.ok(parseInt(t.style.minHeight, 10) >= 40));
  s.tap('→ Tomorrow'); // the first row is task 3
  assert.equal(w.get('nylaos_tasks')[2].calendarDate, '2026-09-30');
  s.inputs.filter(i => i.type === 'date')[1].onChange({ target: { value: '2026-10-05' } }); // second row: task 8
  assert.equal(w.get('nylaos_tasks')[7].calendarDate, '2026-10-05');
  s.inputs.filter(i => i.type === 'date')[2].onChange({ target: { value: '' } }); // a cleared picker does nothing
  assert.equal(w.get('nylaos_tasks')[3].calendarDate, '2026-09-20');
  const again = step(); // tasks 3 and 8 have moved on; task 4 is what is left
  again.tap('Let it go');
  assert.equal(w.get('nylaos_tasks')[3].calendarDate, null);
  assert.equal(w.get('nylaos_tasks').length, TASKS().length);
  assert.ok(w.events.every(e => e === 'nyla-tasks-changed'));
});

test('ritual: closing the day writes the record, and only what she changed', { skip }, () => {
  const w = makeWorld(); const app = loadApp(w);
  w.put('nylaos_tasks', TASKS());
  w.put('nyla_closeday_draft', { day: '2026-09-29', mood: 4, energy: 2, sentence: '  The day I finished the essay  ', moved: [3, 5] });
  const gratKey = loadHelpers(w).h.cd_gratKey('2026-09-29');
  w.put(gratKey, '1. coffee\n2. the sun');
  const s = app.show(app.CdRitual, { day: '2026-09-29', startStep: 4, onClose() {} });
  s.tap('Close the day');
  const rec = w.get('nylaos_day_closes')['2026-09-29'];
  assert.deepEqual({ ...rec, closedAt: 'x' }, { mood: 4, energy: 2, sentence: 'The day I finished the essay', gratitude: ['coffee', 'the sun'], closedAt: 'x', doneCount: 1, movedCount: 2 });
  assert.equal(rec.closedAt, new Date(NOW).toISOString());
  assert.equal(w.store.has('nyla_closeday_draft'), false, 'the draft is cleared');
  assert.equal(w.store.get(gratKey), '1. coffee\n2. the sun', 'gratitude she did not touch here is left exactly as it was');
  assert.equal(w.store.has('nylaos_top3_2026-09-30'), false, 'an untouched Top 3 is not written');
  assert.ok(w.events.includes('nyla-closeday-changed'));
});

test('ritual: skipping everything still closes the day, in the right shape', { skip }, () => {
  at(2026, 9, 30, 1, 15);
  const w = makeWorld(); const app = loadApp(w, { mobile: true });
  const day = loadHelpers(w).h.cd_day();
  const s = app.show(app.CdRitual, { day, startStep: 4, onClose() {} });
  assert.match(s.words, /Wednesday’s Top 3/, 'after midnight the next day goes by its name');
  s.tap('Close the day');
  assert.deepEqual({ ...w.get('nylaos_day_closes')['2026-09-29'], closedAt: 'x' }, { mood: null, energy: null, sentence: '', gratitude: [], closedAt: 'x', doneCount: 0, movedCount: 0 });
  at(2026, 9, 29, 21);
});

test('page: a first night, then the keepsake', { skip }, () => {
  const w = makeWorld(); const app = loadApp(w, { mobile: true });
  const empty = app.show(app.CloseDayPage);
  assert.match(empty.words, /Close the Day[\s\S]*Tonight[\s\S]*Tuesday, September 29[\s\S]*Start tonight’s close 🌙/);
  assert.match(empty.words, /Your line-a-day journal starts tonight/);
  at(2026, 9, 29, 10);
  assert.match(app.show(app.CloseDayPage).words, /It is still early/);
  at(2026, 9, 29, 21);
  const closes = { '2026-09-29': { mood: 5, energy: 3, sentence: 'Tonight <3', gratitude: ['tea'], closedAt: 'x', doneCount: 2, movedCount: 1 }, '2026-09-22': { mood: 2, sentence: 'A week back' }, broken: 4, '2026-09-21': 'nope' };
  for (let i = 1; i <= 4; i++) closes['2026-09-' + (29 - i)] = { mood: i, energy: 1, sentence: 'Night ' + i, gratitude: [], closedAt: 'x', doneCount: 0, movedCount: 0 };
  closes['2026-08-03'] = { mood: null, sentence: '' };
  w.put('nylaos_day_closes', closes);
  w.put('nylaos_top3_2026-09-30', [{ text: 'Essay', done: false }, { text: '', done: false }, { text: '', done: false }]);
  const page = app.show(app.CloseDayPage);
  assert.match(page.words, /Day closed ✓ Sleep well[\s\S]*Open tonight’s close again/);
  assert.match(page.words, /“ ?Tonight <3 ?”/);
  assert.match(page.words, /Next up: Essay/);
  assert.match(page.words, /5 nights in a row/);
  assert.match(page.words, /This night, before[\s\S]*A week ago[\s\S]*A week back/);
  assert.match(page.words, /The last 8 weeks/);
  assert.match(page.words, /A line a day[\s\S]*Tonight <3[\s\S]*Night 1[\s\S]*Night 4[\s\S]*A week back[\s\S]*A quiet night, no line/);
  assert.equal(page.taps.filter(t => /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), /.test(t.aria)).length, 56, 'eight weeks of days');
  assert.doesNotMatch(page.words, /undefined|NaN|\[object/);
  ['All', 'Sep', 'Aug'].forEach(l => assert.ok(page.taps.some(t => t.label === l), 'month filter: ' + l));
  page.tap('Download PDF');
  assert.equal(app.calls.pdf.length, 1);
  const [title, content, meta, eyebrow] = app.calls.pdf[0];
  assert.equal(title, 'A line a day');
  assert.equal(meta, '6 nights');
  assert.equal(eyebrow, 'close the day');
  assert.match(content, /Tonight &lt;3/);
  assert.doesNotMatch(content, /Tonight <3/);
});

test('a render error stays inside the feature', { skip }, () => {
  const w = makeWorld(); const app = loadApp(w);
  const b = new app.CdBoundary({ children: 'fine', fallback: 'soft landing' });
  assert.equal(b.render(), 'fine');
  b.state = app.CdBoundary.getDerivedStateFromError(new Error('x'));
  assert.equal(b.render(), 'soft landing');
  assert.equal(new app.CdBoundary({ children: 'fine' }).render(), 'fine');
});
