// Cosmic > Timing: the sums, checked against the real astronomy library (the same
// version the app loads). Every case uses fixed dates, so none depend on today.
// Run: node --test tests/cosmic-timing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const TOOLS = '/private/tmp/claude-501/-Users-nylabrown-claude/d3909289-f083-422d-b80d-d42bb09e0983/scratchpad/tools/';
const A = createRequire(TOOLS)('astronomy-engine');

const win = {};
new Function('window', readFileSync(join(here, '..', 'js', 'cosmic-timing-core.js'), 'utf8'))(win);
const sky = win.nylaSky;

// Her chart, read from the app itself so the numbers are never retyped.
const html = readFileSync(join(here, '..', 'nyla-os.html'), 'utf8');
const NATAL = JSON.parse(html.match(/^const NATAL = (\{.*\});\s*$/m)[1]);
const planet = name => NATAL.planets.find(p => p.name === name).lon;
const natal = { Sun: planet('Sun'), Moon: planet('Moon'), ASC: NATAL.asc, Mercury: planet('Mercury'), Venus: planet('Venus'), Mars: planet('Mars'), MC: NATAL.mc };

const DAY = 86400000, HOUR = 3600000, MINUTE = 60000;
const utc = (y, m, d, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min));
const t = iso => new Date(iso).getTime();
const near = (iso, date, tolMs, what) => assert.ok(Math.abs(t(iso) - date.getTime()) <= tolMs, `${what}: got ${iso}, wanted about ${date.toISOString()}`);
// The library's own longitude, worked out here without the code under test.
const libLonSeen = new Map();
const libLon = (body, ms) => {
  const k = body + ms;
  if (!libLonSeen.has(k)) {
    const time = A.MakeTime(new Date(ms));
    libLonSeen.set(k, A.SphereFromVector(A.RotateVector(A.Rotation_EQJ_ECT(time), A.GeoVector(A.Body[body], time, true))).lon);
  }
  return libLonSeen.get(k);
};
const wrap = x => { const v = ((x % 360) + 360) % 360; return v > 180 ? v - 360 : v; };
const factsFor = (y, m, d) => sky.dayFacts(A, utc(y, m, d), utc(y, m, d + 1), natal);

test('the only global is nylaSky, and nothing in it needs the page', () => {
  assert.deepEqual(Object.keys(win), ['nylaSky']);
  for (const name of ['lon', 'moonEvents', 'eclipses', 'stations', 'retrogradeNow', 'ingresses', 'transits', 'sunGates', 'skyAhead', 'dayFacts', 'scoreDay', 'rankDays'])
    assert.equal(typeof sky[name], 'function', name);
  assert.equal(sky.PURPOSES.length, 8);
});

test('longitudes match the app’s own sum', () => {
  const when = utc(2026, 9, 29, 17);
  for (const body of ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'])
    assert.equal(sky.lon(A, body, when), libLon(body, when.getTime()), body);
});

test('the full moon of October 2026 is on Oct 26 at 04:12 UTC, in Taurus', () => {
  const moons = sky.moonEvents(A, utc(2026, 10, 1), 31);
  const full = moons.filter(m => m.phase === 'full');
  assert.equal(full.length, 1);
  assert.equal(full[0].when.slice(0, 16), '2026-10-26T04:12');
  assert.equal(full[0].title, 'Full Moon in Taurus');
  assert.equal(full[0].emoji, '🌕');
  // The Sun sits opposite, in Scorpio.
  assert.equal(sky.util.signName(libLon('Sun', t(full[0].when))), 'Scorpio');
});

test('every new and full moon in a 60 day window is found once, in order', () => {
  const start = utc(2026, 9, 29), days = 60;
  const moons = sky.moonEvents(A, start, days);
  const mine = moons.filter(m => m.phase === 'new' || m.phase === 'full').map(m => m.phase + ' ' + m.when.slice(0, 16));
  // The library's own search, one phase at a time.
  const want = [];
  for (const [deg, name] of [[0, 'new'], [180, 'full']]) {
    let from = start;
    for (;;) {
      const hit = A.SearchMoonPhase(deg, from, 40);
      if (!hit || hit.date.getTime() > start.getTime() + days * DAY) break;
      want.push({ name, at: hit.date });
      from = new Date(hit.date.getTime() + DAY);
    }
  }
  want.sort((a, b) => a.at - b.at);
  assert.deepEqual(mine, want.map(w => w.name + ' ' + w.at.toISOString().slice(0, 16)));
  assert.equal(new Set(mine).size, mine.length, 'no moon twice');
  assert.equal(mine.length, 4);
  // All four phases, in time order, a quarter turn apart.
  const whens = moons.map(m => m.when);
  assert.deepEqual(whens, whens.slice().sort());
  const order = ['new', 'first', 'full', 'last'];
  moons.forEach((m, i) => { if (i) assert.equal(order.indexOf(m.phase), (order.indexOf(moons[i - 1].phase) + 1) % 4); });
  // Each one names the sign the Moon is really in.
  moons.forEach(m => assert.equal(m.sign, sky.SIGNS[Math.floor(libLon('Moon', t(m.when)) / 30)]));
});

test('eclipses: none in autumn 2026, and the next one is found', () => {
  assert.deepEqual(sky.eclipses(A, utc(2026, 9, 29), 60), []);
  const next = sky.nextEclipse(A, utc(2026, 9, 29));
  assert.equal(next.when.slice(0, 10), A.SearchGlobalSolarEclipse(utc(2026, 9, 29)).peak.date.toISOString().slice(0, 10));
  assert.equal(next.of, 'solar');
  // A window that does hold eclipses finds both kinds, in order.
  const aug = sky.eclipses(A, utc(2026, 8, 1), 31);
  assert.deepEqual(aug.map(e => e.of), ['solar', 'lunar']);
  assert.equal(aug[0].when, A.SearchGlobalSolarEclipse(utc(2026, 8, 1)).peak.date.toISOString());
  assert.equal(aug[1].when, A.SearchLunarEclipse(utc(2026, 8, 1)).peak.date.toISOString());
  assert.match(aug[0].title, /^Total Solar Eclipse in Leo$/);
});

test('Mercury’s stations for 2026 fall within a day of the library’s own longitude reversal', () => {
  const start = utc(2026, 1, 1), days = 365;
  const mine = sky.stations(A, start, days, ['Mercury']);
  // Brute force: walk the year an hour at a time and note where the longitude turns.
  const turns = [];
  let prev = libLon('Mercury', start.getTime()), dir = 0;
  for (let h = 1; h <= days * 24; h++) {
    const ms = start.getTime() + h * HOUR, cur = libLon('Mercury', ms), d = Math.sign(wrap(cur - prev));
    if (dir && d && d !== dir) turns.push({ at: ms - HOUR, turns: d < 0 ? 'retrograde' : 'direct' });
    if (d) dir = d;
    prev = cur;
  }
  assert.equal(turns.length, 6, 'three retrogrades in 2026');
  assert.equal(mine.length, turns.length);
  mine.forEach((s, i) => {
    assert.equal(s.turns, turns[i].turns);
    near(s.when, new Date(turns[i].at), DAY, 'station ' + i);
    near(s.when, new Date(turns[i].at), 2 * HOUR, 'station ' + i + ' to the hour');
    assert.equal(s.title, `Mercury turns ${turns[i].turns} in ${sky.SIGNS[Math.floor(libLon('Mercury', t(s.when)) / 30)]}`);
  });
  assert.deepEqual(mine.map(s => s.turns), ['retrograde', 'direct', 'retrograde', 'direct', 'retrograde', 'direct']);
});

test('retrograde right now: says until when, and agrees with the stations', () => {
  const mid = utc(2026, 11, 1);
  const st = sky.stations(A, utc(2026, 10, 1), 60, ['Mercury']);
  assert.equal(st.length, 2);
  const r = sky.retrogradeNow(A, mid, ['Mercury'])[0];
  assert.equal(r.retrograde, true);
  near(r.since, new Date(st[0].when), 5 * MINUTE, 'since');
  near(r.until, new Date(st[1].when), 5 * MINUTE, 'until');
  assert.equal(sky.retrogradeNow(A, utc(2026, 9, 1), ['Mercury'])[0].retrograde, false);
  // Every planet answers, and a retrograde one always has an end.
  sky.retrogradeNow(A, utc(2026, 9, 29)).forEach(p => {
    assert.equal(p.retrograde, libLon(p.planet, utc(2026, 9, 29, 3).getTime()) < libLon(p.planet, utc(2026, 9, 28, 21).getTime()) ? true : false, p.planet);
    if (p.retrograde) { assert.ok(p.until > '2026-09-29'); assert.ok(p.since < '2026-09-29'); }
  });
});

test('ingress: the Sun enters Scorpio and Sagittarius, to the minute', () => {
  const got = sky.ingresses(A, utc(2026, 9, 29), 60, ['Sun']);
  assert.deepEqual(got.map(g => g.title), ['The Sun enters Scorpio', 'The Sun enters Sagittarius']);
  // The library's own search for the Sun reaching 210 and 240 degrees.
  near(got[0].when, A.SearchSunLongitude(210, utc(2026, 10, 1), 60).date, MINUTE, 'Scorpio');
  near(got[1].when, A.SearchSunLongitude(240, utc(2026, 11, 1), 60).date, MINUTE, 'Sagittarius');
  assert.equal(got[0].when.slice(0, 10), '2026-10-23');
  // Just before it is still the old sign, just after it is the new one.
  for (const g of sky.ingresses(A, utc(2026, 9, 29), 60)) {
    const at = t(g.when);
    assert.equal(sky.SIGNS[Math.floor(libLon(g.planet, at - 5 * MINUTE) / 30)], g.from, g.title);
    assert.equal(sky.SIGNS[Math.floor(libLon(g.planet, at + 5 * MINUTE) / 30)], g.sign, g.title);
  }
});

test('ingress: a retrograde planet slipping back a sign is named that way', () => {
  const all = sky.ingresses(A, utc(2026, 1, 1), 365, ['Mercury', 'Venus']);
  const back = all.filter(g => g.backwards);
  back.forEach(g => {
    assert.match(g.title, /slips back into/);
    assert.ok(wrap(libLon(g.planet, t(g.when) + HOUR) - libLon(g.planet, t(g.when) - HOUR)) < 0, g.title + ' is moving backwards');
  });
  all.filter(g => !g.backwards).forEach(g => assert.match(g.title, / enters /));
});

test('transits: each one is exact at the moment given', () => {
  const start = utc(2026, 9, 29), days = 60;
  const got = sky.transits(A, start, days, natal);
  assert.ok(got.length > 0, 'something touches her chart in 60 days');
  const angle = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 };
  for (const x of got) {
    const at = t(x.when);
    assert.ok(at >= start.getTime() && at <= start.getTime() + days * DAY, x.title + ' is inside the window');
    const sep = Math.abs(wrap(libLon(x.planet, at) - natal[x.point]));
    assert.ok(Math.abs(sep - angle[x.aspect]) < 0.001, `${x.title}: ${sep.toFixed(4)} degrees apart at ${x.when}`);
    // A day either side it is further from exact.
    const off = ms => Math.abs(Math.abs(wrap(libLon(x.planet, ms) - natal[x.point])) - angle[x.aspect]);
    assert.ok(off(at - DAY) > off(at) && off(at + DAY) > off(at), x.title + ' is closest at its moment');
    assert.ok(sky.TRANSIT_BODIES.includes(x.planet) && sky.TRANSIT_POINTS.includes(x.point));
    assert.equal(x.title, `${x.planet} ${sky.ASPECT_WORD[x.aspect]} your ${sky.POINT_LABEL[x.point]}`);
  }
  const whens = got.map(x => x.when);
  assert.deepEqual(whens, whens.slice().sort());
  assert.equal(new Set(got.map(x => x.id + x.when)).size, got.length, 'none listed twice');
});

test('transits: nothing close is missed', () => {
  // Walk the window in six hour steps; wherever a planet crosses an exact angle, the list must hold it.
  const start = utc(2026, 9, 29), days = 60;
  const got = sky.transits(A, start, days, natal);
  let found = 0;
  for (const body of sky.TRANSIT_BODIES) for (const point of sky.TRANSIT_POINTS) for (const target of [0, 60, -60, 90, -90, 120, -120, 180]) {
    const f = ms => wrap(libLon(body, ms) - natal[point] - target);
    for (let ms = start.getTime(); ms < start.getTime() + days * DAY; ms += 6 * HOUR) {
      const a = f(ms), b = f(ms + 6 * HOUR);
      if (Math.abs(a) > 30 || Math.abs(b) > 30 || (a < 0) === (b < 0)) continue;
      // A planet that touches the angle and turns straight back within a day is too fine for the daily pass; skip those.
      const d0 = f(Math.floor((ms - start.getTime()) / DAY) * DAY + start.getTime()), d1 = f(Math.floor((ms - start.getTime()) / DAY) * DAY + start.getTime() + DAY);
      if ((d0 < 0) === (d1 < 0)) continue;
      found++;
      assert.ok(got.some(x => x.planet === body && x.point === point && Math.abs(t(x.when) - ms) <= 12 * HOUR), `${body} to ${point} (${target}) near ${new Date(ms).toISOString()}`);
    }
  }
  assert.equal(found, got.length);
});

test('transits: a chart with a missing or odd placement is skipped, never a crash', () => {
  const got = sky.transits(A, utc(2026, 9, 29), 30, { Sun: natal.Sun, Moon: 'soon', Venus: null });
  assert.ok(got.every(x => x.point === 'Sun'));
  assert.deepEqual(sky.transits(A, utc(2026, 9, 29), 30, null), []);
});

test('Human Design: the wheel matches every placement in her chart', () => {
  assert.deepEqual(sky.GATE_WHEEL.slice().sort((a, b) => a - b), Array.from({ length: 64 }, (_, i) => i + 1));
  const P = NATAL.hd.personality;
  for (const body of ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'North Node']) {
    const g = sky.util.gateOf(planet(body));
    assert.deepEqual([g.gate, g.line], P[body], body);
  }
  // Earth sits opposite the Sun, the South Node opposite the North, in both halves of the chart.
  const opposite = gate => sky.GATE_WHEEL[(sky.GATE_WHEEL.indexOf(gate) + 32) % 64];
  for (const half of [NATAL.hd.personality, NATAL.hd.design]) {
    assert.equal(opposite(half.Sun[0]), half.Earth[0]);
    assert.equal(opposite(half['North Node'][0]), half['South Node'][0]);
  }
  // Her design Sun, 88 degrees of the Sun before birth, lands in the gate the chart says.
  const dSun = sky.util.gateOf(libLon('Sun', new Date(NATAL.hd.designUtc).getTime()));
  assert.deepEqual([dSun.gate, dSun.line], NATAL.hd.design.Sun);
});

test('Human Design: the Sun changes gate about every six days', () => {
  const gates = sky.sunGates(A, utc(2026, 9, 29), 60);
  assert.ok(gates.length >= 10 && gates.length <= 11, String(gates.length));
  gates.forEach((g, i) => {
    assert.equal(sky.util.gateOf(libLon('Sun', t(g.when) + 5 * MINUTE)).gate, g.gate);
    assert.notEqual(sky.util.gateOf(libLon('Sun', t(g.when) - 5 * MINUTE)).gate, g.gate);
    if (i) { const gap = (t(g.when) - t(gates[i - 1].when)) / DAY; assert.ok(gap > 5 && gap < 6.2, String(gap)); }
  });
});

test('the whole sky ahead comes back sorted, with every kind of event well formed', () => {
  const all = sky.skyAhead(A, utc(2026, 9, 29), 60, natal);
  const whens = all.map(e => e.when);
  assert.deepEqual(whens, whens.slice().sort());
  for (const e of all) {
    assert.ok(e.id && e.kind && e.emoji && e.title, JSON.stringify(e));
    assert.ok(!/[—–]/.test(e.title), 'no dashes in ' + e.title);
    assert.match(e.when, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  }
  for (const kind of ['moon', 'station', 'ingress', 'transit', 'gate']) assert.ok(all.some(e => e.kind === kind), kind);
  // It survives the trip through the day's cache.
  assert.deepEqual(JSON.parse(JSON.stringify(all)), all);
});

test('day facts: phase, sign and retrogrades for fixed days', () => {
  const full = factsFor(2026, 10, 26);
  assert.equal(full.fullMoon, true);
  assert.equal(full.phaseName, 'Full Moon');
  assert.equal(sky.SIGNS[full.moonSign], 'Taurus');
  assert.equal(full.mercuryRx, true);
  const crescent = factsFor(2026, 10, 14);
  assert.equal(crescent.waxing, true);
  assert.equal(crescent.band, 'waxing1');
  assert.equal(crescent.mercuryRx, false);
  assert.equal(crescent.newMoon, false);
  assert.equal(factsFor(2026, 10, 10).newMoon, true);
  assert.equal(factsFor(2026, 10, 9).band, 'dark');
  // A day the Moon changes sign says when, and the moment is right.
  let seen = 0;
  for (let d = 1; d <= 10; d++) {
    const f = factsFor(2026, 10, d);
    if (!f.moonChangeAt) { assert.equal(f.moonSignStart, f.moonSignEnd); continue; }
    seen++;
    const at = t(f.moonChangeAt);
    assert.equal(Math.floor(libLon('Moon', at - 5 * MINUTE) / 30), f.moonSignStart);
    assert.equal(Math.floor(libLon('Moon', at + 5 * MINUTE) / 30), f.moonSignEnd);
  }
  assert.ok(seen >= 3);
  // The station day itself counts as retrograde.
  const st = sky.stations(A, utc(2026, 10, 1), 60, ['Mercury'])[1];
  const d = new Date(st.when);
  const f = factsFor(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  assert.equal(f.mercuryStation, true);
  assert.equal(f.mercuryRx, true);
  assert.deepEqual(JSON.parse(JSON.stringify(full)), full);
});

test('day facts: the aspects it reports are really within orb', () => {
  const angle = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 };
  let easy = 0, hard = 0;
  for (let i = 0; i < 120; i++) {
    const s = utc(2026, 9, 29).getTime() + i * DAY, f = sky.dayFacts(A, s, s + DAY, natal);
    for (const a of f.easy.concat(f.hard)) {
      const sep = Math.abs(wrap(libLon(a.planet, s + DAY / 2) - natal[a.point]));
      assert.ok(Math.abs(sep - angle[a.aspect]) <= (a.planet === 'Venus' || a.planet === 'Mars' ? 2 : 1.5) + 1e-9, JSON.stringify(a));
    }
    f.easy.forEach(a => { assert.ok(['Venus', 'Jupiter'].includes(a.planet) && ['Sun', 'Venus', 'MC'].includes(a.point) && ['conjunction', 'sextile', 'trine'].includes(a.aspect)); easy++; });
    f.hard.forEach(a => { assert.ok(['Mars', 'Saturn'].includes(a.planet) && ['Sun', 'Moon', 'Mercury'].includes(a.point) && ['square', 'opposition'].includes(a.aspect)); hard++; });
  }
  assert.ok(easy > 0 && hard > 0, `easy ${easy}, hard ${hard}`);
});

test('scorer: a waxing moon day ranks above a Mercury retrograde day for Signing something', () => {
  const waxing = factsFor(2026, 10, 14), retro = factsFor(2026, 11, 1), waxingRetro = factsFor(2026, 11, 12);
  assert.equal(waxing.waxing && !waxing.mercuryRx, true);
  assert.equal(retro.mercuryRx, true);
  assert.equal(waxingRetro.waxing && waxingRetro.mercuryRx, true);
  const a = sky.scoreDay(A, waxing, 'sign'), b = sky.scoreDay(A, retro, 'sign'), c = sky.scoreDay(A, waxingRetro, 'sign');
  assert.ok(a.score > b.score, `${a.score} > ${b.score}`);
  assert.ok(a.score > c.score, `${a.score} > ${c.score}`);
  assert.ok(b.reasons.some(r => r.code === 'mercuryRx' && r.delta < 0));
  assert.ok(a.reasons.some(r => r.code === 'phase' && r.delta > 0));
  assert.ok(!a.reasons.some(r => r.code === 'mercuryRx'));
  const ranked = sky.rankDays(A, [
    { key: '2026-11-01', facts: retro }, { key: '2026-10-14', facts: waxing }, { key: '2026-11-12', facts: waxingRetro },
  ], sky.PURPOSES.find(p => p.key === 'sign'), { best: 1, avoid: 1 });
  assert.equal(ranked.best[0].key, '2026-10-14');
  assert.notEqual(ranked.avoid[0].key, '2026-10-14');
});

test('scorer: each rule moves the purposes it says, and only those', () => {
  const base = { phase: 60, band: 'waxing1', moonSign: 1, moonSignStart: 1, moonSignEnd: 1, moonChangeAt: null, easy: [], hard: [], mercuryRx: false, venusRx: false };
  const score = (facts, key, cycle) => sky.scoreDay(A, facts, key, cycle).score;
  const moved = (change, cycle) => sky.PURPOSES.map(p => p.key).filter(k => score({ ...base, ...change }, k, cycle) !== score(base, k)).sort();
  const down = (change, key) => assert.ok(score({ ...base, ...change }, key) < score(base, key), key);
  const up = (change, key, cycle) => assert.ok(score({ ...base, ...change }, key, cycle) > score(base, key), key);

  assert.deepEqual(moved({ mercuryRx: true }), ['launch', 'sign', 'travel']);
  ['launch', 'sign', 'travel'].forEach(k => down({ mercuryRx: true }, k));
  assert.deepEqual(moved({ venusRx: true }), ['beauty', 'money']);
  const lucky = { easy: [{ planet: 'Jupiter', point: 'MC', aspect: 'trine', orb: 0.4 }] };
  assert.deepEqual(moved(lucky), ['beauty', 'launch', 'money']);
  ['beauty', 'launch', 'money'].forEach(k => up(lucky, k));
  const sharp = { hard: [{ planet: 'Mars', point: 'Mercury', aspect: 'square', orb: 1.2 }] };
  assert.deepEqual(moved(sharp), ['talk']);
  down(sharp, 'talk');
  assert.deepEqual(moved({}, { phase: 'Follicular', day: 9 }), ['creative', 'launch', 'talk']);
  assert.deepEqual(moved({}, { phase: 'Ovulation', day: 14 }), ['creative', 'launch', 'talk']);
  assert.deepEqual(moved({}, { phase: 'Menstrual', day: 2 }), ['rest']);
  assert.deepEqual(moved({}, { phase: 'Luteal', day: 22 }), []);
  assert.deepEqual(moved({}, null), []);
  // Her own signs lift every kind of day.
  assert.equal(moved({ natalMatch: 'rising sign' }).length, 8);
  // The dark moon is the best phase for rest, and the worst for launching and signing.
  const bands = ['new', 'waxing1', 'waxing2', 'full', 'waning1', 'waning2', 'dark'];
  const byBand = key => bands.map(b => score({ ...base, band: b }, key));
  assert.equal(Math.max(...byBand('rest')), byBand('rest')[6]);
  assert.equal(Math.min(...byBand('launch')), byBand('launch')[6]);
  assert.equal(Math.min(...byBand('sign')), byBand('sign')[6]);
  // Waxing beats waning for beginnings; waning beats waxing for a hard conversation.
  for (const k of ['launch', 'sign', 'money', 'creative', 'travel']) assert.ok(byBand(k)[1] > byBand(k)[5], k);
  assert.ok(byBand('talk')[4] > byBand('talk')[1]);
});

test('scorer: reasons are plain words, and odd input is skipped, never a crash', () => {
  for (let i = 0; i < 45; i++) {
    const s = utc(2026, 9, 29).getTime() + i * DAY, f = sky.dayFacts(A, s, s + DAY, natal);
    for (const p of sky.PURPOSES) {
      const r = sky.scoreDay(A, f, p.key, { phase: ['Menstrual', 'Follicular', 'Ovulation', 'Luteal'][i % 4], day: i % 28 + 1, estimate: i > 20 });
      assert.ok(Number.isFinite(r.score));
      const sum = r.reasons.reduce((n, x) => n + x.delta, 0);
      assert.ok(Math.abs(sum - r.score) < 1e-9, 'the reasons add up to the score');
      for (const x of r.reasons) {
        assert.ok(x.text && x.delta !== 0);
        assert.ok(!/[—–]|undefined|NaN|wizard/i.test(x.text), x.text);
      }
    }
  }
  for (const rule of sky.RULES) assert.ok(!/[—–]|wizard/i.test(rule.title + rule.text));
  assert.deepEqual(sky.scoreDay(A, null, 'sign'), { score: 0, reasons: [] });
  assert.deepEqual(sky.scoreDay(A, {}, 'not a purpose'), { score: 0, reasons: [] });
  assert.ok(Number.isFinite(sky.scoreDay(A, { phase: 10 }, 'rest', { phase: 'Something else' }).score));
  const ranked = sky.rankDays(A, [null, { key: '2026-10-01' }, { key: '2026-10-02', facts: factsFor(2026, 10, 2) }], 'rest');
  assert.equal(ranked.all.length, 1);
  assert.deepEqual(sky.rankDays(A, undefined, 'rest'), { all: [], best: [], avoid: [] });
});

test('ranking: five best and two to avoid out of 45 days, no day in both, ties to the calmer then sooner day', () => {
  const days = [];
  for (let i = 0; i < 45; i++) {
    const s = utc(2026, 9, 29).getTime() + i * DAY;
    days.push({ key: new Date(s).toISOString().slice(0, 10), facts: sky.dayFacts(A, s, s + DAY, natal) });
  }
  for (const p of sky.PURPOSES) {
    const r = sky.rankDays(A, days, p);
    assert.equal(r.all.length, 45);
    assert.equal(r.best.length, 5);
    assert.equal(r.avoid.length, 2);
    assert.ok(r.best.every(b => !r.avoid.some(a => a.key === b.key)));
    r.best.forEach((b, i) => {
      if (!i) return;
      const a = r.best[i - 1];
      assert.ok(a.score > b.score || (a.score === b.score && (a.cautions < b.cautions || (a.cautions === b.cautions && a.key < b.key))), `${a.key} before ${b.key}`);
    });
    const others = r.all.filter(d => !r.best.includes(d) && !r.best.some(b => b.key === d.key));
    assert.ok(others.every(d => d.score <= r.best[4].score));
    assert.ok(others.every(d => d.score >= r.avoid[0].score));
    assert.ok(r.best[0].score > r.avoid[0].score, p.label);
  }
});
