// People: the sums and the storage rules. Every date case passes its own "today",
// so nothing here depends on the clock or the time zone.
// Run: node --test tests/people.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'js', 'people.jsx'), 'utf8');
// Everything above "Small pieces" is plain JavaScript (no JSX), so it runs as it is.
const cut = source.indexOf('// ── Small pieces');
assert.ok(cut > 0, 'the "Small pieces" marker is still in people.jsx');
const names = ['ppl_parseBday', 'ppl_makeBday', 'ppl_nextBday', 'ppl_ago', 'ppl_span', 'ppl_inDays', 'ppl_clean', 'ppl_load', 'ppl_update', 'ppl_patch', 'ppl_add',
  'ppl_addLog', 'ppl_editLog', 'ppl_removeLog', 'ppl_rhythm', 'ppl_dueList', 'ppl_dueLine', 'ppl_birthdaysSoon', 'ppl_sunSign', 'ppl_herChart', 'ppl_chemistry',
  'ppl_addToCalendar', 'ppl_onCalendar', 'people_searchItems', 'ppl_first', 'ppl_initial', 'ppl_isKey', 'ppl_addDays', 'ppl_diff'];

const store = new Map();
const toasts = [];
const fired = [];
const nav = [];
const localStorage = {
  getItem: k => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
};
const window = { dispatchEvent: e => fired.push(e.type), _navigateTo: (a, b) => nav.push([a, b]) };
class CustomEvent { constructor(type) { this.type = type; } }
const NATAL = { asc: 125.5, planets: [{ name: 'Sun', lon: 242.02 }, { name: 'Moon', lon: 155.23 }, { name: 'Mercury', lon: 243 }] };
const P = new Function('localStorage', 'window', 'CustomEvent', 'toast', 'NATAL',
  `${source.slice(0, cut)}\nreturn { ${names.join(', ')} };`)(localStorage, window, CustomEvent, (...a) => toasts.push(a), NATAL);

const reset = () => { store.clear(); toasts.length = 0; fired.length = 0; nav.length = 0; };
const saved = () => JSON.parse(store.get('nylaos_people') || '[]');

test('birthdays: both written forms are read, nonsense is not', () => {
  assert.deepEqual(P.ppl_parseBday('1998-03-07'), { y: 1998, m: 3, d: 7 });
  assert.deepEqual(P.ppl_parseBday('--03-07'), { y: null, m: 3, d: 7 });
  assert.deepEqual(P.ppl_parseBday('--02-29'), { y: null, m: 2, d: 29 });
  assert.deepEqual(P.ppl_parseBday('2000-02-29'), { y: 2000, m: 2, d: 29 });
  for (const bad of ['', null, undefined, 42, '03-07', '--13-01', '--04-31', '--00-10', '2001-02-29', '1998-3-7', 'soon']) assert.equal(P.ppl_parseBday(bad), null, String(bad));
  assert.equal(P.ppl_makeBday(3, 7, null), '--03-07');
  assert.equal(P.ppl_makeBday(3, 7, 1998), '1998-03-07');
  assert.equal(P.ppl_makeBday(2, 30, null), null);
});

test('next birthday: days to go and the age they are turning', () => {
  assert.deepEqual(P.ppl_nextBday('1998-10-11', '2026-09-29'), { key: '2026-10-11', year: 2026, days: 12, turning: 28, shifted: false });
  // already passed this year → next year
  const n = P.ppl_nextBday('1998-03-07', '2026-09-29');
  assert.equal(n.key, '2027-03-07'); assert.equal(n.turning, 29); assert.equal(n.days, 159);
  // today counts as today, not a year away
  assert.equal(P.ppl_nextBday('--09-29', '2026-09-29').days, 0);
  assert.equal(P.ppl_nextBday('--09-29', '2026-09-29').turning, null);
  assert.equal(P.ppl_nextBday('--09-28', '2026-09-29').key, '2027-09-28');
  // across New Year
  assert.equal(P.ppl_nextBday('--01-02', '2026-12-30').days, 3);
  assert.equal(P.ppl_nextBday('nope', '2026-09-29'), null);
  // a birth year in the future gives no age
  assert.equal(P.ppl_nextBday('2027-01-01', '2026-09-29').turning, null);
});

test('Feb 29 lands on Feb 28 in ordinary years and on Feb 29 in leap years', () => {
  const plain = P.ppl_nextBday('2000-02-29', '2026-09-29');
  assert.equal(plain.key, '2027-02-28'); assert.equal(plain.shifted, true); assert.equal(plain.turning, 27);
  const leap = P.ppl_nextBday('2000-02-29', '2027-03-01');
  assert.equal(leap.key, '2028-02-29'); assert.equal(leap.shifted, false); assert.equal(leap.turning, 28);
  assert.equal(P.ppl_nextBday('--02-29', '2027-02-28').days, 0);
  assert.equal(P.ppl_nextBday('--02-29', '2028-02-28').days, 1);
});

test('every next birthday falls inside the coming twelve months', () => {
  for (let m = 1; m <= 12; m++) for (const d of [1, 15, 28]) {
    const n = P.ppl_nextBday(P.ppl_makeBday(m, d, null), '2026-09-29');
    assert.ok(n.days >= 0 && n.days <= 365, `${m}/${d} → ${n.days}`);
  }
});

test('words for time', () => {
  assert.equal(P.ppl_ago(0), 'today'); assert.equal(P.ppl_ago(1), 'yesterday'); assert.equal(P.ppl_ago(3), '3 days ago');
  assert.equal(P.ppl_ago(7), 'a week ago'); assert.equal(P.ppl_ago(21), '3 weeks ago'); assert.equal(P.ppl_ago(95), '3 months ago'); assert.equal(P.ppl_ago(400), 'over a year ago');
  assert.equal(P.ppl_span(21), '3 weeks'); assert.equal(P.ppl_span(45), 'a month'); assert.equal(P.ppl_span(800), '2 years');
  assert.equal(P.ppl_inDays(0), 'today'); assert.equal(P.ppl_inDays(1), 'tomorrow'); assert.equal(P.ppl_inDays(12), 'in 12 days');
});

test('odd records are skipped, and odd fields are tidied, never a crash', () => {
  for (const bad of [null, 7, 'x', [], {}, { id: 1 }, { id: 1, name: '   ' }, { name: 'No id' }, { id: 2, name: 99 }]) assert.equal(P.ppl_clean(bad), null);
  const p = P.ppl_clean({ id: 5, name: '  Maya  ', circle: 'Bestie', birthday: '31 March', rhythm: '14', lastContact: 'yesterday', snoozeUntil: 12,
    log: [null, { date: 'x' }, { date: '2026-09-01', kind: 'fax', text: 5 }, { id: 9, date: '2026-09-02', kind: 'call', text: 'hi' }], notes: null, gifts: 'socks' });
  assert.equal(p.name, 'Maya'); assert.equal(p.circle, 'Other'); assert.equal(p.birthday, null); assert.equal(p.rhythm, 14);
  assert.equal(p.lastContact, null); assert.equal(p.snoozeUntil, null); assert.equal(p.notes, ''); assert.deepEqual(p.gifts, []);
  assert.equal(p.log.length, 2); assert.equal(p.log[0].kind, 'note'); assert.equal(p.log[0].text, ''); assert.equal(p.log[1].kind, 'call');
});

test('adding, logging and editing keep the stored shape', () => {
  reset();
  const maya = P.ppl_add({ name: ' Maya Lopez ', circle: 'Friends', birthday: '--10-11', rhythm: 14 });
  assert.deepEqual(Object.keys(maya), ['id', 'name', 'circle', 'birthday', 'rhythm', 'lastContact', 'snoozeUntil', 'log', 'notes', 'gifts', 'created', 'updated']);
  assert.equal(maya.name, 'Maya Lopez'); assert.equal(maya.lastContact, null);
  const mum = P.ppl_add({ name: 'Mum' });
  assert.notEqual(mum.id, maya.id); assert.equal(mum.circle, 'Friends'); assert.equal(mum.rhythm, null); assert.equal(mum.birthday, null);
  assert.equal(saved().length, 2);
  assert.ok(fired.includes('nyla-people-changed'));

  P.ppl_patch(maya.id, { snoozeUntil: '2026-10-06' });
  const a = P.ppl_addLog(maya.id, { date: '2026-09-20', kind: 'call', text: ' caught up ' });
  const b = P.ppl_addLog(maya.id, { date: '2026-09-10', kind: 'text', text: '' });
  const c = P.ppl_addLog(maya.id, { date: '2026-09-25', kind: 'note', text: 'loves peonies' });
  let m = P.ppl_load().find(p => p.id === maya.id);
  assert.equal(m.log.length, 3); assert.equal(new Set(m.log.map(l => l.id)).size, 3);
  assert.equal(m.log[0].text, 'caught up');
  assert.equal(m.lastContact, '2026-09-20', 'an older chat and a note do not move the last contact');
  assert.equal(m.snoozeUntil, null, 'talking clears a snooze');
  assert.deepEqual(Object.keys(m.log[0]), ['id', 'date', 'kind', 'text']);

  P.ppl_editLog(maya.id, b, { kind: 'in person' });
  P.ppl_removeLog(maya.id, a);
  m = P.ppl_load().find(p => p.id === maya.id);
  assert.equal(m.log.length, 2); assert.equal(m.lastContact, '2026-09-10'); assert.equal(m.log.find(l => l.id === b).kind, 'in person');
  P.ppl_removeLog(maya.id, b);
  assert.equal(P.ppl_load().find(p => p.id === maya.id).lastContact, null);
  assert.equal(P.ppl_load().find(p => p.id === maya.id).log[0].id, c);
});

test('records this page cannot show are kept in storage untouched', () => {
  reset();
  const odd = { id: 77, nickname: 'from a newer version' };
  store.set('nylaos_people', JSON.stringify([odd, { id: 1, name: 'Jo', futureField: { keep: true } }]));
  assert.equal(P.ppl_load().length, 1);
  P.ppl_patch(1, { notes: 'tea, not coffee' });
  const after = saved();
  assert.equal(after.length, 2);
  assert.deepEqual(after.find(x => x.id === 77), odd);
  assert.deepEqual(after.find(x => x.id === 1).futureField, { keep: true });
  assert.equal(after.find(x => x.id === 1).notes, 'tea, not coffee');
});

test('editing one person never trims another record stored in an odd shape', () => {
  reset();
  const alice = { id: 1, name: 'Alice', birthday: '1999-2-3', rhythm: 21, log: [{ date: 'Feb 3', kind: 'call', text: 'hi' }], gifts: [{ text: '' }] };
  store.set('nylaos_people', JSON.stringify([alice, { id: 2, name: 'Bob', notes: '' }]));
  assert.equal(P.ppl_load().find(p => p.id === 1).birthday, null, 'the page shows Alice cleaned');
  assert.equal(P.ppl_patch(2, { notes: 'likes tea' }), true);
  const after = saved();
  assert.equal(after.length, 2);
  assert.deepEqual(after[0], alice, 'Alice goes back to storage exactly as she was');
  assert.equal(after[1].notes, 'likes tea');
  P.ppl_add({ name: 'Cara' });
  assert.deepEqual(saved()[0], alice, 'adding someone leaves Alice alone too');
  assert.equal(saved().length, 3);
});

test('a damaged list is left alone', () => {
  reset();
  for (const damaged of ['{not json', '{"a":1}', '"people"']) {
    store.set('nylaos_people', damaged);
    assert.deepEqual(P.ppl_load(), []);
    assert.equal(P.ppl_add({ name: 'Maya' }), null);
    assert.equal(store.get('nylaos_people'), damaged);
  }
  assert.equal(toasts.length, 3);
  assert.equal(toasts[0][1], 'error');
});

test('check-in rhythm: due, soon, snoozed, and never for people without one', () => {
  const base = { id: 1, name: 'Maya', circle: 'Friends', rhythm: 14, lastContact: '2026-09-08', snoozeUntil: null, created: new Date(2026, 0, 1, 12).toISOString(), log: [], gifts: [], notes: '' };
  assert.equal(P.ppl_rhythm({ ...base, rhythm: null }, '2026-09-29'), null);
  assert.deepEqual(P.ppl_rhythm(base, '2026-09-29'), { since: 21, over: 7, never: false, state: 'due' });
  assert.equal(P.ppl_rhythm(base, '2026-09-22').state, 'due', 'due on the very day');
  assert.equal(P.ppl_rhythm(base, '2026-09-21').state, 'soon');
  assert.equal(P.ppl_rhythm(base, '2026-09-12').state, 'fine');
  assert.equal(P.ppl_rhythm({ ...base, snoozeUntil: '2026-10-06' }, '2026-09-29').state, 'snoozed');
  assert.equal(P.ppl_rhythm({ ...base, snoozeUntil: '2026-09-29' }, '2026-09-29').state, 'due', 'a snooze ends on its day');
  // nothing logged yet: counted from the day she added them, so a new person is not due at once
  const fresh = { ...base, lastContact: null, created: new Date(2026, 8, 29, 21, 30).toISOString() };
  assert.equal(P.ppl_rhythm(fresh, '2026-09-29').state, 'fine');
  assert.equal(P.ppl_rhythm(fresh, '2026-10-13').state, 'due');
  assert.equal(P.ppl_rhythm(fresh, '2026-10-13').never, true);

  const list = [base, { ...base, id: 2, name: 'Jo Park', lastContact: '2026-06-01', rhythm: 30 }, { ...base, id: 3, name: 'Ana', lastContact: '2026-09-28' }, { ...base, id: 4, name: 'Dad', rhythm: null }];
  assert.deepEqual(P.ppl_dueList(list, '2026-09-29').map(x => x.p.name), ['Jo Park', 'Maya'], 'most overdue first');
  assert.equal(P.ppl_dueLine(base, P.ppl_rhythm(base, '2026-09-29')), 'It has been 3 weeks since you and Maya talked.');
  assert.match(P.ppl_dueLine(fresh, P.ppl_rhythm(fresh, '2026-10-13')), /^You have not logged a chat with Maya yet/);
});

test('birthdays within the week, soonest first', () => {
  const mk = (id, name, birthday) => ({ id, name, birthday });
  const got = P.ppl_birthdaysSoon([mk(1, 'A', '--10-06'), mk(2, 'B', '--10-07'), mk(3, 'C', '--09-29'), mk(4, 'D', null), mk(5, 'E', '1990-10-01')], '2026-09-29', 7);
  assert.deepEqual(got.map(x => x.p.name), ['C', 'E', 'A']);
});

test('sun signs', () => {
  const sign = b => P.ppl_sunSign(b).name;
  assert.equal(sign('2005-11-23'), 'Sagittarius');
  assert.equal(sign('1998-03-07'), 'Pisces');
  assert.equal(sign('1990-08-10'), 'Leo');
  assert.equal(sign('--08-10'), 'Leo');
  assert.equal(sign('--01-05'), 'Capricorn');
  assert.equal(sign('--12-28'), 'Capricorn');
  assert.equal(sign('--04-05'), 'Aries');
  assert.equal(sign('--02-29'), 'Pisces');
  assert.equal(sign('2000-06-10'), 'Gemini');
  assert.equal(P.ppl_sunSign('--08-10').cusp, null);
  assert.equal(P.ppl_sunSign('--08-10').el, 'Fire');
  assert.equal(P.ppl_sunSign('--08-10').mode, 'Fixed');
  assert.ok(P.ppl_sunSign('--08-10').emoji);
  // a day on the border says so, and names the neighbour
  const edge = P.ppl_sunSign('--03-20');
  assert.ok(['Pisces', 'Aries'].includes(edge.name));
  assert.ok(['Pisces', 'Aries'].includes(edge.cusp) && edge.cusp !== edge.name);
  assert.equal(P.ppl_sunSign(null), null);
  // all twelve, mid-sign
  const mids = ['--04-05', '--05-05', '--06-05', '--07-05', '--08-05', '--09-05', '--10-05', '--11-05', '--12-05', '--01-05', '--02-05', '--03-05'];
  assert.deepEqual(mids.map(sign), ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']);
});

test('cosmic chemistry reads her chart from NATAL and needs a birthday', () => {
  assert.deepEqual(P.ppl_herChart(), { sun: 8, moon: 5, rising: 4 });
  assert.equal(P.ppl_chemistry('Maya', null, P.ppl_herChart()), null, 'no birthday, no card');
  assert.equal(P.ppl_chemistry('Maya', '--08-10', null), null, 'no chart, no card');
  assert.equal(P.ppl_chemistry('Maya', '--08-10', { sun: 8, moon: 'x', rising: 4 }), null);
  const c = P.ppl_chemistry('Maya Lopez', '--08-10', P.ppl_herChart());
  assert.equal(c.sign.name, 'Leo');
  assert.equal(c.lines.length, 3);
  assert.deepEqual(c.lines.map(l => l.label), ['Your Sagittarius Sun', 'Your Virgo Moon', 'Your Leo rising']);
  assert.match(c.lines[0].text, /^Fire meets fire/);
  assert.match(c.lines[1].text, /Maya/);
  assert.match(c.modeLine, /^Maya holds steady, you go with the flow/);
  assert.ok(c.vibe);
});

test('chemistry has warm words for every sign against every chart, with no em dashes', () => {
  const days = ['--04-05', '--05-05', '--06-05', '--07-05', '--08-05', '--09-05', '--10-05', '--11-05', '--12-05', '--01-05', '--02-05', '--03-05'];
  for (const bday of days) for (let sun = 0; sun < 12; sun++) for (const moon of [0, 1, 2, 3]) for (const rising of [4, 5, 6, 7]) {
    const c = P.ppl_chemistry('Jo', bday, { sun, moon, rising });
    const all = [c.vibe, c.modeLine, ...c.lines.map(l => l.text), ...c.lines.map(l => l.label)];
    for (const t of all) { assert.equal(typeof t, 'string'); assert.ok(t.length > 8, t); assert.ok(!/undefined|null|NaN|—/.test(t), t); }
  }
  assert.match(P.ppl_chemistry('Jo', '--12-05', { sun: 8, moon: 0, rising: 0 }).lines[0].text, /^Sun twins/);
  assert.match(P.ppl_chemistry('Jo', '--06-05', { sun: 8, moon: 0, rising: 0 }).lines[0].text, /opposite each other/);
});

test('add to calendar writes one event in the calendar editor\'s shape, once', () => {
  reset();
  store.set('nylaos_events', JSON.stringify([{ id: 1, date: '2026-01-01', text: 'old', time: null, color: 'rose' }]));
  const maya = { id: 5, name: 'Maya', birthday: '1998-10-11' };
  const next = P.ppl_nextBday(maya.birthday, '2026-09-29');
  assert.equal(P.ppl_addToCalendar(maya, next), true);
  let ev = JSON.parse(store.get('nylaos_events'));
  assert.equal(ev.length, 2);
  assert.deepEqual(Object.keys(ev[1]), ['id', 'date', 'text', 'time', 'endTime', 'location', 'color', 'notes']);
  assert.equal(ev[1].date, '2026-10-11'); assert.equal(ev[1].text, '🎂 Maya\'s birthday'); assert.equal(ev[1].time, null); assert.equal(ev[1].color, 'rose');
  assert.equal(ev[1].notes, 'Turning 28.'); assert.equal(typeof ev[1].id, 'number'); assert.notEqual(ev[1].id, 1);
  assert.equal(ev[1].repeat, undefined, 'events have no yearly repeat, so none is claimed');
  assert.equal(P.ppl_onCalendar(ev, maya, next), true);
  assert.equal(P.ppl_addToCalendar(maya, next), true);
  assert.equal(JSON.parse(store.get('nylaos_events')).length, 2, 'a second tap adds nothing');
  store.set('nylaos_events', '{broken');
  assert.equal(P.ppl_addToCalendar(maya, next), false);
  assert.equal(store.get('nylaos_events'), '{broken');
});

test('search gives one item per person, shaped like the app\'s other items', () => {
  reset();
  store.set('nylaos_people', JSON.stringify([
    { id: 1, name: 'Maya Lopez', circle: 'Friends', birthday: '--10-11', notes: 'oat flat white', gifts: [{ id: 1, text: 'film camera', given: false }], log: [{ id: 1, date: '2026-09-01', kind: 'call', text: 'new job news' }] },
    { id: 2, name: 'Dad' }, { id: 3 }, 'junk',
  ]));
  const items = P.people_searchItems();
  assert.equal(items.length, 2);
  assert.deepEqual(Object.keys(items[0]), ['kind', 'icon', 'title', 'sub', 'body', 'go']);
  assert.equal(items[0].kind, 'Person'); assert.equal(items[0].icon, '💞'); assert.equal(items[0].title, 'Maya Lopez');
  assert.match(items[0].sub, /^Friends · 🎂 Oct 11/);
  for (const word of ['oat flat white', 'film camera', 'new job news']) assert.ok(items[0].body.includes(word));
  assert.equal(items[1].sub, 'Other'); assert.equal(items[1].body, '');
  items[0].go();
  assert.deepEqual(nav, [['people', 'Everyone']]);
  assert.equal(window._pplOpenRequest.id, 1);
  store.set('nylaos_people', '{broken');
  assert.deepEqual(P.people_searchItems(), []);
});

test('names', () => {
  assert.equal(P.ppl_first('  Maya  Lopez '), 'Maya'); assert.equal(P.ppl_first(''), 'them');
  assert.equal(P.ppl_initial('émile'), 'É'); assert.equal(P.ppl_initial('🌸 Rose'), '🌸'); assert.equal(P.ppl_initial(''), '♡');
});

test('copy rules: no em dashes and no banned words anywhere in the file', () => {
  const lines = source.split('\n').filter(l => !l.includes('.replace('));
  assert.equal(lines.filter(l => l.includes('—')).length, 0);
  assert.equal(/wizard/i.test(source), false);
  assert.equal(/https?:/.test(source), false, 'no addresses in the code');
});
