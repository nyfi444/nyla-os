// Cosmic > Financial Astrology (js/money-sky-core.js): the sums, checked against
// her chart in nyla-os.html, Nyla OS's own numerology and matrix code, and
// published 2026 sky events. Every case uses fixed dates.
// Run: node --test tests/money-sky.test.mjs
process.env.TZ = 'America/New_York';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const A = require('./vendor/astronomy-engine-2.1.19.min.js');
const coreSrc = readFileSync(join(here, '..', 'js', 'money-sky-core.js'), 'utf8');
const win = {};
new Function('window', coreSrc)(win);
const S = win.moneySky;
const html = readFileSync(join(here, '..', 'nyla-os.html'), 'utf8');
const NATAL = JSON.parse(html.match(/const NATAL = (\{.*\});/)[1]);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const DAY = 86400000;

test('her chart is the NATAL blob from nyla-os.html, number for number', () => {
  const P = S.PROFILE;
  assert.equal(P.asc, NATAL.asc); assert.equal(P.mc, NATAL.mc); assert.deepEqual(P.cusps, NATAL.cusps); assert.equal(P.utc, NATAL.utc);
  NATAL.planets.filter(p => p.name !== 'Lilith').forEach(p => {
    assert.equal(P.planets[p.name], p.lon, p.name);
    assert.equal(!!P.rx[p.name], p.rx, p.name + ' retrograde');
  });
});

test('Part of Fortune uses the night formula (she was born after sunset)', () => {
  const m = S.moneyMap();
  assert.equal(m.night, true);
  const p = S.PROFILE.planets;
  close(m.points.PoF, ((S.PROFILE.asc + p.Sun - p.Moon) % 360 + 360) % 360, 1e-9, 'ASC + Sun - Moon');
  assert.equal(S.util.fmtPos(m.points.PoF), 'Scorpio 2°19′');
  assert.equal(m.pofHouse, 4);
});

test('money map: houses, rulers and every written highlight match the chart', () => {
  const m = S.moneyMap();
  assert.equal(m.houses[2].sign, 'Leo'); assert.equal(m.incomeRuler, 'Sun');
  assert.deepEqual(m.houses[2].inside.map(x => x.name), ['Moon']);
  assert.deepEqual(m.houses[6].inside.map(x => x.name), ['Venus']);
  assert.deepEqual(m.houses[8].inside.map(x => x.name), ['Uranus']);
  assert.deepEqual(m.houses[10].inside.map(x => x.name), ['Mars']);
  // Each highlight is guarded by its own placement check; all seven must fire for her chart.
  assert.deepEqual(m.highlights.map(h => h.id), ['venus', 'moon2', 'income-ruler', 'jupiter', 'mc', 'eighth', 'node']);
});

test('numerology agrees with Nyla OS > Numerology', () => {
  assert.equal(S.lifePath(), 5);
  assert.equal(S.personalYear(null, 2026), 8);
  assert.equal(S.personalYear(null, 2027), 9);
  assert.equal(S.personalMonth(null, 2026, 11), 1);
  assert.equal(S.personalDay(null, 2026, 11, 7), 8);
  // Nyla OS's own functions, lifted from the page and run on the same dates.
  const reduceSrc = html.match(/const reduceNum = n => \{[\s\S]*?\n\};\n/)[0];
  const lines = ['getPersonalYear', 'getPersonalMonth', 'getPersonalDay'].map(n => html.match(new RegExp(`const ${n} = .*\\n`))[0]).join('');
  const os = new Function(`${reduceSrc}const BIRTH_MONTH=11, BIRTH_DAY=23, BIRTH_YEAR=2005;\n${lines}return { getPersonalYear, getPersonalMonth, getPersonalDay };`)();
  for (const [y, m, d] of [[2026, 11, 7], [2026, 12, 25], [2027, 1, 1], [2027, 11, 29]]) {
    assert.equal(S.personalYear(null, y), os.getPersonalYear(y));
    assert.equal(S.personalMonth(null, y, m), os.getPersonalMonth(y, m));
    assert.equal(S.personalDay(null, y, m, d), os.getPersonalDay(y, m, d), `${y}-${m}-${d}`);
  }
  assert.equal(S.nameNumber('Semester HQ'), 3);
  assert.equal(S.nameNumber('Business OS'), 7);
});

test('matrix money channel agrees with Nyla OS > Matrix of Destiny', () => {
  const src = html.match(/const reduce22 = [\s\S]*?\n/)[0] + html.match(/const computeMatrix = [\s\S]*?\n};\n/)[0];
  const M = new Function(src + 'return computeMatrix(23, 11, 2005);')();
  const mx = S.matrix(), by = k => mx.channel.find(c => c.key === k).number;
  assert.equal(mx.center, M.E);
  assert.equal(by('C'), M.C); assert.equal(by('C1'), M.inner.C); assert.equal(by('midC'), M.mid.C);
  assert.equal(by('money'), M.money); assert.equal(by('balance'), M.balance);
  assert.equal(by('money'), 22);
});

test('void-of-course Moon, November 2026, matches the published table (UTC)', () => {
  // authorityastrology.com/voc/2026/11: 14 windows; the month opens with a 6.3-hour
  // Cancer to Leo window; the longest runs over 31 hours, Virgo to Libra, Nov 4-5;
  // a 1-hour Taurus to Gemini window on Nov 24.
  const w = S.vocWindows(A, Date.parse('2026-11-01T00:00Z'), Date.parse('2026-12-01T00:00Z'));
  const hrs = x => (x.end - x.start) / 3600000;
  assert.equal(w.length, 14);
  assert.equal(w[0].into, 'Leo'); close(hrs(w[0]), 6.3, 0.1, 'first window');
  const longest = w.reduce((a, b) => (hrs(b) > hrs(a) ? b : a));
  assert.equal(longest.into, 'Libra'); assert.ok(hrs(longest) > 31, 'longest over 31 h');
  assert.equal(new Date(longest.start).toISOString().slice(0, 10), '2026-11-04');
  const gem = w.find(x => x.into === 'Gemini');
  assert.equal(new Date(gem.start).toISOString().slice(0, 10), '2026-11-24'); close(hrs(gem), 1.0, 0.1, 'Gemini window');
});

test('retrogrades and eclipses land on the known 2026-27 dates', () => {
  const r = S.retroPeriods(A, Date.parse('2026-11-07T12:00Z'), 120);
  // Local (Eastern) dates: Venus turns direct at 7:22 PM on Nov 13, which is already Nov 14 in UTC.
  const find = (p, startDay) => r.find(x => x.planet === p && S.util.dateKey(x.start) === startDay);
  const merc = find('Mercury', '2026-10-24'), ven = find('Venus', '2026-10-03');
  assert.ok(merc && ven, 'Mercury from Oct 24, Venus from Oct 3');
  assert.equal(S.util.dateKey(merc.end), '2026-11-13');
  assert.equal(S.util.dateKey(ven.end), '2026-11-13');
  const e = S.eclipses(A, Date.parse('2027-01-01T00:00Z'), 60);
  assert.deepEqual(e.map(x => [x.of, x.type, new Date(x.at).toISOString().slice(0, 10)]), [['solar', 'annular', '2027-02-06'], ['lunar', 'penumbral', '2027-02-20']]);
});

test('planetary hours: Saturday starts with Saturn, then Jupiter, and the 24 hours join up', () => {
  const h = S.planetaryHours(A, 35.7796, -78.6382, new Date(2026, 10, 7).getTime());
  assert.equal(h.dayRuler, 'Saturn');
  assert.deepEqual(h.hours.slice(0, 3).map(x => x.ruler), ['Saturn', 'Jupiter', 'Mars']);
  assert.equal(h.hours.length, 24);
  for (let i = 1; i < 24; i++) close(h.hours[i].start, h.hours[i - 1].end, 1, 'hour ' + i);
  assert.equal(h.hours[12].start, h.sunset);
});

test('scoring: Mercury retrograde, void Moon and eclipses count against signing', () => {
  const base = { key: '2026-12-01', weekday: 2, band: 'wax1', moonSign: 'Taurus', moonElement: 'Earth', moonHouse: 10, vocShare: 0, vocs: [], rx: { Mercury: false, Venus: false, Mars: false }, stations: [], eclipse: null, easy: [], hard: [], pd: 6 };
  const sign = f => S.scoreDay(f, 'sign').score;
  const clean = sign(base);
  assert.ok(sign({ ...base, rx: { ...base.rx, Mercury: true } }) <= clean - 2.5);
  assert.ok(sign({ ...base, vocShare: 1 }) <= clean - 2);
  assert.ok(sign({ ...base, vocShare: 0.4 }) > sign({ ...base, vocShare: 1 }), 'a partial void costs less');
  assert.ok(sign({ ...base, eclipse: { of: 'solar' } }) <= clean - 2);
  assert.ok(S.scoreDay({ ...base, rx: { ...base.rx, Mercury: true } }, 'review').score > S.scoreDay(base, 'review').score, 'retrograde lifts review');
  assert.ok(S.scoreDay({ ...base, pd: 8 }, 'ask').score > S.scoreDay(base, 'ask').score, 'an 8 day lifts asking');
});

test('calendar: nine weeks of local days, and "days to skip" only lists days that count against', () => {
  const cal = S.calendar(A, null, new Date(2026, 10, 7).getTime(), 63);
  assert.equal(cal.length, 63); assert.equal(cal[0].key, '2026-11-07'); assert.equal(cal[62].key, '2027-01-08');
  cal.forEach(d => S.PURPOSES.forEach(p => assert.ok(Number.isFinite(d.scores[p.key].score))));
  S.PURPOSES.forEach(p => S.rankFor(cal, p.key, 6, 3).avoid.forEach(x => assert.ok(x.s.score < 0, p.key)));
  // Nov 7 2026: Mercury and Venus retrograde, dark Moon, void most of the day: no signing.
  assert.equal(cal[0].scores.sign.grade, 'Wait');
});

test('Business OS copies match this source (when the sibling repos are on this Mac)', () => {
  const pairs = [['semester-hq-dashboard/vendor/money-sky', 'Semester HQ Business OS'], ['maison-os/portal/vendor/money-sky', 'Company HQ']];
  for (const [dir, label] of pairs) {
    for (const f of ['money-sky-core.js', 'money-sky-view.js']) {
      const copy = join(here, '..', dir, f);
      if (!existsSync(copy)) continue;
      assert.equal(readFileSync(copy, 'utf8'), readFileSync(join(here, '..', 'js', f), 'utf8'), `${label} ${f} drifted: run node tools/sync-money-sky.mjs`);
    }
  }
});
