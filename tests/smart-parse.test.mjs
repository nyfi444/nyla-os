// Smart add parser. Every case runs against a fixed "now", so none of them depend on today's date.
// Run: node --test tests/smart-parse.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const win = {};
new Function('window', readFileSync(join(here, '..', 'js', 'smart-parse.js'), 'utf8'))(win);
const parse = win.nylaSmartParse;

// Tuesday, September 29, 2026 at 10:00 in the morning, local time.
const NOW = new Date(2026, 8, 29, 10, 0, 0);
// Sunday, September 27, 2026 at 10:00.
const SUNDAY = new Date(2026, 8, 27, 10, 0, 0);
const p = (text, now = NOW, opts) => parse(text, now, opts);

// Checks only the fields named in `want`.
const check = (text, want, now = NOW, opts) => {
  const got = p(text, now, opts);
  assert.ok(got, `"${text}" gave nothing back`);
  for (const k of Object.keys(want)) assert.deepEqual(got[k], want[k], `"${text}" → ${k}`);
  return got;
};

test('the only global is nylaSmartParse', () => {
  assert.deepEqual(Object.keys(win), ['nylaSmartParse']);
  assert.equal(typeof parse, 'function');
});

test('empty input gives null', () => {
  assert.equal(p(''), null);
  assert.equal(p('    '), null);
  assert.equal(p(null), null);
  assert.equal(p(undefined), null);
});

test('the result always has the same shape', () => {
  const r = p('call mom');
  assert.deepEqual(Object.keys(r).sort(), ['date', 'endTime', 'kind', 'repeat', 'text', 'time', 'understood', 'until']);
});

// ── The two examples from the brief ─────────────────────────────────
test('dinner with mom friday 7pm is an event', () => {
  check('dinner with mom friday 7pm', { kind: 'event', text: 'dinner with mom', date: '2026-10-02', time: '19:00', endTime: null, repeat: null,
    understood: ['Event', 'Fri, Oct 2', '7:00 PM'] });
});
test('submit essay tomorrow is a task due tomorrow', () => {
  check('submit essay tomorrow', { kind: 'task', text: 'submit essay', date: '2026-09-30', time: null, understood: ['Task', 'Tomorrow'] });
});

// ── Traps ───────────────────────────────────────────────────────────
test('read chapter 7 keeps its number', () => {
  check('read chapter 7', { kind: 'task', text: 'read chapter 7', date: null, time: null });
});
test('top 10 list for friday has a date and no time', () => {
  check('top 10 list for friday', { kind: 'task', text: 'top 10 list', date: '2026-10-02', time: null });
});
test('5 things to do stays whole', () => {
  check('5 things to do', { kind: 'task', text: '5 things to do', date: null, time: null });
});
test('call mom is a plain task with no date', () => {
  check('call mom', { kind: 'task', text: 'call mom', date: null, time: null, repeat: null, understood: ['Task'] });
});
test('buy milk goes to the shopping list', () => {
  check('buy milk', { kind: 'shop', text: 'milk', date: null, time: null, understood: ['Shopping'] });
});
test('buy tickets friday 8pm is an event and keeps the word buy', () => {
  check('buy tickets friday 8pm', { kind: 'event', text: 'buy tickets', date: '2026-10-02', time: '20:00' });
});
test('buy with a date only is a task and keeps the word buy', () => {
  check('buy milk tomorrow', { kind: 'task', text: 'buy milk', date: '2026-09-30', time: null });
});
test('lunch with Sam 12/25 is month/day and keeps her capital letter', () => {
  check('lunch with Sam 12/25', { kind: 'event', text: 'lunch with Sam', date: '2026-12-25', time: null });
});
test('dec 31 party 9pm typed on Dec 31 is today, not next year', () => {
  check('dec 31 party 9pm', { kind: 'event', text: 'party', date: '2026-12-31', time: '21:00', understood: ['Event', 'Today', '9:00 PM'] }, new Date(2026, 11, 31, 8, 0));
  check('dec 31 party 9pm', { date: '2026-12-31' }, new Date(2026, 11, 31, 23, 30));
});
test('on a Sunday, monday is tomorrow', () => {
  check('gym monday', { text: 'gym', date: '2026-09-28' }, SUNDAY);
});
test('on a Sunday, next monday is the one after', () => {
  check('gym next monday', { text: 'gym', date: '2026-10-05' }, SUNDAY);
});
test('on a Sunday, next sunday is a week away', () => {
  check('brunch next sunday', { date: '2026-10-04' }, SUNDAY);
});
test('at 12 means noon', () => {
  check('at 12', { kind: 'event', text: 'at 12', date: '2026-09-29', time: '12:00' });
  check('lunch at 12', { text: 'lunch', time: '12:00' });
});
test('fractions, ratios and verses are not dates or times', () => {
  check('buy 1/2 gallon milk', { kind: 'shop', text: '1/2 gallon milk', date: null });
  check('watch 24/7 news', { kind: 'task', date: null, time: null, text: 'watch 24/7 news' });
  check('read John 3:16', { kind: 'task', date: null, time: null, text: 'read John 3:16' });
  check('pages 10-12', { kind: 'task', date: null, time: null, text: 'pages 10-12' });
});
test('words that only look like days stay in the title', () => {
  check('SAT prep friday', { text: 'SAT prep', date: '2026-10-02' });
  check('the sun is out', { text: 'the sun is out', date: null });
  check("friday's homework", { text: "friday's homework", date: null });
});
test('sun, sat, mon and wed count as days only with proof', () => {
  // No proof: the word stays, nothing is dated.
  check('buy sun hat', { kind: 'shop', text: 'sun hat', date: null });
  check('sun tan lotion', { kind: 'task', text: 'sun tan lotion', date: null });
  check('mon and dad dinner', { text: 'mon and dad dinner', date: null });
  check('wed shoes for the trip', { text: 'wed shoes for the trip', date: null });
  // Proof: closing the line, a word in front, a clock time on the line, a part of the day after it.
  check('gym sat', { text: 'gym', date: '2026-10-03' });
  check('lunch on sat with Kay', { kind: 'event', text: 'lunch with Kay', date: '2026-10-03' });
  check('sat brunch 11am', { kind: 'event', text: 'brunch', date: '2026-10-03', time: '11:00' });
  check('mon morning run', { text: 'run', date: '2026-10-05', time: '09:00' });
});

// ── Dates ───────────────────────────────────────────────────────────
test('today, tonight, tomorrow, tmrw', () => {
  check('laundry today', { kind: 'task', text: 'laundry', date: '2026-09-29', time: null });
  check('movie tonight', { kind: 'event', text: 'movie', date: '2026-09-29', time: '19:00' });
  check('movie tonight 9pm', { text: 'movie', date: '2026-09-29', time: '21:00' });
  check('gym tmrw', { text: 'gym', date: '2026-09-30' });
});
test('weekday names and short forms mean the next one coming', () => {
  check('essay thursday', { date: '2026-10-01' });
  check('essay thu', { date: '2026-10-01' });
  check('essay mon', { date: '2026-10-05' });
  check('essay Saturday', { date: '2026-10-03' });
  check('essay on wed', { text: 'essay', date: '2026-09-30' });
});
test("today's own name is today, or next week once the time has passed", () => {
  check('essay tuesday', { date: '2026-09-29' });
  check('dentist tuesday 3pm', { date: '2026-09-29', time: '15:00' });
  check('dentist tuesday 9am', { date: '2026-10-06', time: '09:00' });
});
test('next friday is the Friday of next week', () => {
  check('party next friday', { text: 'party', date: '2026-10-09' });
  check('party this friday', { text: 'party', date: '2026-10-02' });
  check('party next monday', { date: '2026-10-05' });
});
test('in 3 days, in 2 weeks, next week', () => {
  check('send invoice in 3 days', { text: 'send invoice', date: '2026-10-02' });
  check('renew passport in 2 weeks', { text: 'renew passport', date: '2026-10-13' });
  check('plan trip next week', { text: 'plan trip', date: '2026-10-05' });
  check('plan trip next week', { date: '2026-09-28' }, SUNDAY);
});
test('month and day, in words and in numbers', () => {
  check('flight oct 12', { kind: 'event', text: 'flight', date: '2026-10-12' });
  check('dentist appointment october 12th', { kind: 'event', text: 'dentist appointment', date: '2026-10-12' });
  check('pay rent 10/12', { kind: 'task', text: 'pay rent', date: '2026-10-12' });
  check('pay rent 10/12/2026', { text: 'pay rent', date: '2026-10-12' });
  check('taxes jan 5 2027', { text: 'taxes', date: '2027-01-05' });
});
test('a month and day that already passed means next year', () => {
  check('renew lease sep 1', { text: 'renew lease', date: '2027-09-01', understood: ['Task', 'Wed, Sep 1, 2027'] });
  check('renew lease 3/15', { date: '2027-03-15' });
  check('renew lease sep 29', { date: '2026-09-29' });
});
test('dates are local days, even late at night', () => {
  check('essay tomorrow', { date: '2026-09-30' }, new Date(2026, 8, 29, 23, 59));
  check('essay today', { date: '2026-09-29' }, new Date(2026, 8, 29, 0, 1));
  check('essay tomorrow', { date: '2027-01-01' }, new Date(2026, 11, 31, 22, 0));
});

// ── Times ───────────────────────────────────────────────────────────
test('clock times', () => {
  check('yoga 7pm', { kind: 'event', text: 'yoga', date: '2026-09-29', time: '19:00' });
  check('yoga 7:30 pm', { text: 'yoga', time: '19:30' });
  check('yoga 7:30am', { text: 'yoga', time: '07:30' });
  check('yoga 19:30', { text: 'yoga', time: '19:30' });
  check('yoga 12am', { time: '00:00' });
  check('yoga 12pm', { time: '12:00' });
});
test('"at 7" is the evening, "at 9" is the morning', () => {
  check('dinner at 7', { text: 'dinner', time: '19:00' });
  check('dinner at 1', { time: '13:00' });
  check('breakfast at 9', { text: 'breakfast', time: '09:00' });
  check('breakfast at 11', { time: '11:00' });
});
test('noon, midnight and parts of the day', () => {
  check('lunch noon', { text: 'lunch', time: '12:00' });
  check('launch at midnight', { text: 'launch', time: '00:00' });
  check('yoga tomorrow morning', { text: 'yoga', date: '2026-09-30', time: '09:00' });
  check('study friday afternoon', { text: 'study', date: '2026-10-02', time: '14:00' });
  check('drinks with Kay friday evening', { text: 'drinks with Kay', date: '2026-10-02', time: '18:00' });
  check('run tomorrow morning at 7', { text: 'run', date: '2026-09-30', time: '07:00' });
  check('Morning run tomorrow', { kind: 'task', text: 'Morning run', date: '2026-09-30', time: null });
});
test('ranges fill the end time', () => {
  check('meeting 2-3pm', { kind: 'event', text: 'meeting', time: '14:00', endTime: '15:00', understood: ['Event', 'Today', '2:00 PM to 3:00 PM'] });
  check('call with Jess 2pm to 4pm thu', { text: 'call with Jess', date: '2026-10-01', time: '14:00', endTime: '16:00' });
  check('study from 9 to 10:30am tomorrow', { text: 'study', date: '2026-09-30', time: '09:00', endTime: '10:30' });
  check('brunch 11-1pm', { text: 'brunch', time: '11:00', endTime: '13:00' });
});
test('"until" before a time goes with the time', () => {
  check('meeting until 3pm', { kind: 'event', text: 'meeting', time: '15:00', endTime: null });
  check('open till 9:30pm', { text: 'open', time: '21:30' });
  check('lunch until noon', { text: 'lunch', time: '12:00' });
});
test('a deadline stays a task and keeps its time', () => {
  check('pick up dry cleaning by 5pm', { kind: 'task', text: 'pick up dry cleaning', date: '2026-09-29', time: '17:00' });
  check('essay due friday 5pm', { kind: 'task', text: 'essay', date: '2026-10-02', time: '17:00' });
});

// ── Kinds ───────────────────────────────────────────────────────────
test('a date with no time is a task unless the words say event', () => {
  check('finish slides friday', { kind: 'task' });
  check('interview friday', { kind: 'event' });
  check('date with Jay saturday', { kind: 'event', text: 'date with Jay' });
  check('birthday party oct 12', { kind: 'event' });
  check('book flight friday', { kind: 'task', text: 'book flight' });
});
test('prefixes force the kind', () => {
  check('task: dinner friday 7pm', { kind: 'task', text: 'dinner', date: '2026-10-02', time: '19:00' });
  check('todo: call bank monday', { kind: 'task', text: 'call bank', date: '2026-10-05' });
  check('event: Launch day', { kind: 'event', text: 'Launch day', date: '2026-09-29', time: null });
  check('idea: app for plants tomorrow', { kind: 'idea', text: 'app for plants tomorrow', date: null, understood: ['Idea'] });
  check('note: friday thoughts', { kind: 'note', text: 'friday thoughts', date: null, understood: ['Note'] });
});
test('the box can force a kind too', () => {
  check('dinner friday 7pm', { kind: 'task', text: 'dinner', date: '2026-10-02', time: '19:00' }, NOW, { kind: 'task' });
  check('call mom', { kind: 'event', text: 'call mom', date: '2026-09-29' }, NOW, { kind: 'event' });
  check('buy milk friday', { kind: 'shop', text: 'milk friday', date: null }, NOW, { kind: 'shop' });
  check('dinner friday 7pm', { kind: 'idea', text: 'dinner friday 7pm', date: null, time: null }, NOW, { kind: 'idea' });
});

// ── Repeats ─────────────────────────────────────────────────────────
test('task repeats use the task repeat field', () => {
  check('take vitamins every day', { kind: 'task', text: 'take vitamins', repeat: 'daily', date: '2026-09-29', until: null });
  check('take vitamins daily', { text: 'take vitamins', repeat: 'daily' });
  check('water plants every week', { text: 'water plants', repeat: 'weekly' });
  check('water plants weekly', { text: 'water plants', repeat: 'weekly' });
  check('pay rent every month', { text: 'pay rent', repeat: 'monthly' });
  check('pay rent monthly', { text: 'pay rent', repeat: 'monthly' });
  check('journal every weekday', { text: 'journal', repeat: 'weekdays', date: '2026-09-29' });
  check('journal every weekday', { repeat: 'weekdays', date: '2026-09-28' }, SUNDAY);
  check('trash out every monday', { kind: 'task', text: 'trash out', repeat: 'weekly', date: '2026-10-05', understood: ['Task', 'Mon, Oct 5', 'Every week'] });
});
test('event repeats come with the last day of the run', () => {
  const r = check('gym every monday 6pm', { kind: 'event', text: 'gym', repeat: 'weekly', date: '2026-10-05', time: '18:00', until: '2026-12-28' });
  const days = parse.seriesDates(r.date, r.repeat, r.until);
  assert.equal(days.length, 13);
  assert.equal(days[0], '2026-10-05');
  assert.equal(days[1], '2026-10-12');
  assert.equal(days[12], '2026-12-28');
  check('team meeting every week until dec 15 at 3pm', { kind: 'event', text: 'team meeting', repeat: 'weekly', time: '15:00', until: '2026-12-15' });
  check('book club every other week thursday 7pm', { kind: 'event', text: 'book club', repeat: 'biweekly', date: '2026-10-01' });
});
test('a monthly run stays on her day of the month after February', () => {
  const days = parse.seriesDates('2026-09-30', 'monthly', '2027-08-30');
  assert.equal(days.length, 12);
  assert.deepEqual(days.slice(4, 7), ['2027-01-30', '2027-02-28', '2027-03-30']);
  assert.equal(days[11], '2027-08-30');
  assert.deepEqual(parse.seriesDates('2027-01-31', 'monthly', '2027-04-30'), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  const r = check('pay rent every month at 9am', { kind: 'event', repeat: 'monthly', date: '2026-09-30', until: '2027-08-30' }, new Date(2026, 8, 30, 8, 0));
  assert.equal(parse.seriesDates(r.date, r.repeat, r.until).length, 12);
});
test('a weekday run skips the weekend', () => {
  const days = parse.seriesDates('2026-10-02', 'weekdays', '2026-10-06');
  assert.deepEqual(days, ['2026-10-02', '2026-10-05', '2026-10-06']);
  assert.deepEqual(parse.seriesDates('2026-10-02', null, null), ['2026-10-02']);
});
test('repeats the app cannot hold stay in the title', () => {
  check('gym every monday and wednesday', { text: 'gym every monday and wednesday', repeat: null, date: null });
  check('water plants every 3 days', { text: 'water plants every 3 days', repeat: null, date: null });
  check('clean room every other week', { kind: 'task', text: 'clean room every other week', repeat: null });
});
test('weekly review friday keeps its name', () => {
  check('weekly review friday', { text: 'weekly review', repeat: null, date: '2026-10-02' });
  check('daily standup 9am', { text: 'daily standup', repeat: null, time: '09:00' });
});

// ── Titles ──────────────────────────────────────────────────────────
test('titles are tidy and keep her capital letters', () => {
  check('Dinner with Mom on Friday at 7pm', { text: 'Dinner with Mom' });
  check('  call   the   bank   tomorrow  ', { text: 'call the bank' });
  check('Tomorrow: Call Dr. Lee', { text: 'Call Dr. Lee', date: '2026-09-30' });
});
test('a line that is only a date keeps its words as the title', () => {
  check('tomorrow', { text: 'tomorrow', date: '2026-09-30' });
  check('friday 7pm', { text: 'friday 7pm', date: '2026-10-02', time: '19:00' });
});
test('"for friday" in the middle of a title stays put', () => {
  check('gift for friday party', { text: 'gift for friday party', date: '2026-10-02' });
});

test('chip labels', () => {
  assert.equal(parse.formatTime('19:00'), '7:00 PM');
  assert.equal(parse.formatTime('00:05'), '12:05 AM');
  assert.equal(parse.formatDate('2026-09-29', NOW), 'Today');
  assert.equal(parse.formatDate('2026-09-30', NOW), 'Tomorrow');
  assert.equal(parse.formatDate('2026-10-02', NOW), 'Fri, Oct 2');
  assert.equal(parse.formatDate('2027-01-01', NOW), 'Fri, Jan 1, 2027');
});
