/* The sums behind Cosmic > Timing.

   One global: window.nylaSky. Nothing here touches the page or the app. Every
   function that works something out takes the astronomy library as its first
   argument (A) and plain values after it, so the same file runs in Node for the
   tests (tests/cosmic-timing.test.mjs) and in the browser for the page.

   Every moment comes from astronomy-engine. Longitudes are geocentric, apparent,
   on the ecliptic of date: the same sum the app's skyAt() does, so this page and
   the morning brief always agree.

   Moments go out as ISO strings (UTC). The page turns them into her local time.

   Events share one shape:
     { id, kind, when, emoji, title, ... }
     kind: 'moon' | 'eclipse' | 'station' | 'ingress' | 'transit' | 'gate'
   id is a description without the time ("transit-Jupiter-trine-MC"), so the
   same event found on two different days is still recognisably the same one. */
(function () {
  'use strict';

  var DAY = 86400000;
  var MINUTE = 60000;
  var SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  var ELEMENTS = ['Fire', 'Earth', 'Air', 'Water'];
  var STATION_BODIES = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  var RETRO_BODIES = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  var INGRESS_BODIES = ['Sun', 'Mercury', 'Venus', 'Mars'];
  var TRANSIT_BODIES = ['Pluto', 'Neptune', 'Uranus', 'Saturn', 'Jupiter', 'Mars'];
  var TRANSIT_POINTS = ['Sun', 'Moon', 'ASC', 'Mercury', 'Venus', 'Mars', 'MC'];
  var TRANSIT_ASPECTS = [
    { name: 'conjunction', angle: 0, tone: 'blend' },
    { name: 'sextile', angle: 60, tone: 'easy' },
    { name: 'square', angle: 90, tone: 'hard' },
    { name: 'trine', angle: 120, tone: 'easy' },
    { name: 'opposition', angle: 180, tone: 'hard' }
  ];
  var ASPECT_WORD = { conjunction: 'conjunct', sextile: 'sextile', square: 'square', trine: 'trine', opposition: 'opposite' };
  var POINT_LABEL = { Sun: 'Sun', Moon: 'Moon', ASC: 'rising sign', Mercury: 'Mercury', Venus: 'Venus', Mars: 'Mars', MC: 'Midheaven' };
  // How far apart the samples can be when looking for the day a planet turns.
  var SCAN_STEP = { Mercury: 1, Venus: 1, Mars: 1, Jupiter: 2, Saturn: 2, Uranus: 4, Neptune: 4, Pluto: 4 };

  /* The Human Design wheel: 64 gates of 5.625 degrees each, starting with
     Gate 41 at 2 degrees of Aquarius. The test checks this order against every
     placement in her own chart. */
  var GATE_START = 302;
  var GATE_SIZE = 5.625;
  var GATE_WHEEL = [41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56,
    31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60];

  // ── Small number helpers (no library needed) ─────────────────────────
  function norm360(x) { return ((x % 360) + 360) % 360; }
  function norm180(x) { var v = norm360(x); return v > 180 ? v - 360 : v; }
  function signIndex(lon) { return Math.floor(norm360(lon) / 30) % 12; }
  function signName(lon) { return SIGNS[signIndex(lon)]; }
  function elementOfSign(idx) { return ELEMENTS[((idx % 4) + 4) % 4]; }
  function ms(v) { return v instanceof Date ? v.getTime() : typeof v === 'number' ? v : new Date(v).getTime(); }
  function iso(t) { return new Date(t).toISOString(); }
  function round1(x) { return Math.round(x * 10) / 10; }
  function gateOf(lon) {
    var off = norm360(lon - GATE_START) / GATE_SIZE;
    var idx = Math.floor(off) % 64;
    return { gate: GATE_WHEEL[idx], line: Math.min(6, Math.floor((off - Math.floor(off)) * 6) + 1), index: idx };
  }

  // Finds where f changes sign between a and b (it must differ at the two ends).
  function bisect(f, a, b, tol) {
    var fa = f(a);
    while (b - a > tol) {
      var m = (a + b) / 2, fm = f(m);
      if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else { b = m; }
    }
    return (a + b) / 2;
  }
  // Finds where a true/false test flips between a and b.
  function bisectFlip(test, a, b, tol) {
    var ta = test(a);
    while (b - a > tol) {
      var m = (a + b) / 2;
      if (test(m) === ta) a = m; else b = m;
    }
    return b;
  }

  // ── Where things are ─────────────────────────────────────────────────
  function lon(A, body, when) {
    var time = A.MakeTime(new Date(ms(when)));
    var v = A.RotateVector(A.Rotation_EQJ_ECT(time), A.GeoVector(A.Body[body], time, true));
    return A.SphereFromVector(v).lon;
  }
  // Degrees a day, measured across six hours. Below zero means retrograde.
  function speed(A, body, when) {
    var t = ms(when), h = DAY / 8;
    return norm180(lon(A, body, t + h) - lon(A, body, t - h)) / 0.25;
  }
  function moonPhase(A, when) { return A.MoonPhase(A.MakeTime(new Date(ms(when)))); }

  // ── Moons ────────────────────────────────────────────────────────────
  var QUARTERS = [
    { key: 'new', name: 'New Moon', emoji: '🌑' },
    { key: 'first', name: 'First Quarter Moon', emoji: '🌓' },
    { key: 'full', name: 'Full Moon', emoji: '🌕' },
    { key: 'last', name: 'Last Quarter Moon', emoji: '🌗' }
  ];
  function moonEvents(A, start, days) {
    var t0 = ms(start), t1 = t0 + days * DAY, out = [];
    var q = A.SearchMoonQuarter(A.MakeTime(new Date(t0)));
    var guard = 0;
    while (q && q.time.date.getTime() <= t1 && guard++ < 400) {
      var t = q.time.date.getTime(), info = QUARTERS[q.quarter], mLon = lon(A, 'Moon', t);
      out.push({
        id: 'moon-' + info.key, kind: 'moon', phase: info.key, when: iso(t), emoji: info.emoji,
        title: info.name + ' in ' + signName(mLon), sign: signName(mLon), signIndex: signIndex(mLon), lon: mLon
      });
      q = A.NextMoonQuarter(q);
    }
    return out;
  }

  // ── Eclipses ─────────────────────────────────────────────────────────
  function lunarEclipseEvent(A, e) {
    var t = e.peak.date.getTime(), mLon = lon(A, 'Moon', t);
    var word = e.kind === 'total' ? 'Total' : e.kind === 'partial' ? 'Partial' : 'Penumbral';
    return { id: 'eclipse-lunar', kind: 'eclipse', of: 'lunar', type: e.kind, when: iso(t), emoji: '🌖',
      title: word + ' Lunar Eclipse in ' + signName(mLon), sign: signName(mLon), signIndex: signIndex(mLon), lon: mLon };
  }
  function solarEclipseEvent(A, e) {
    var t = e.peak.date.getTime(), sLon = lon(A, 'Sun', t);
    var word = e.kind === 'total' ? 'Total' : e.kind === 'annular' ? 'Annular' : 'Partial';
    return { id: 'eclipse-solar', kind: 'eclipse', of: 'solar', type: e.kind, when: iso(t), emoji: '🌒',
      title: word + ' Solar Eclipse in ' + signName(sLon), sign: signName(sLon), signIndex: signIndex(sLon), lon: sLon };
  }
  function eclipses(A, start, days) {
    var t0 = ms(start), t1 = t0 + days * DAY, out = [], guard = 0;
    var le = A.SearchLunarEclipse(A.MakeTime(new Date(t0)));
    while (le && le.peak.date.getTime() <= t1 && guard++ < 20) { out.push(lunarEclipseEvent(A, le)); le = A.NextLunarEclipse(le.peak); }
    guard = 0;
    var se = A.SearchGlobalSolarEclipse(A.MakeTime(new Date(t0)));
    while (se && se.peak.date.getTime() <= t1 && guard++ < 20) { out.push(solarEclipseEvent(A, se)); se = A.NextGlobalSolarEclipse(se.peak); }
    return out.sort(byWhen);
  }
  // The first eclipse of either kind after a moment, however far away it is.
  function nextEclipse(A, start) {
    var time = A.MakeTime(new Date(ms(start)));
    var l = lunarEclipseEvent(A, A.SearchLunarEclipse(time)), s = solarEclipseEvent(A, A.SearchGlobalSolarEclipse(time));
    return l.when < s.when ? l : s;
  }

  // ── Stations: the moment a planet stops and turns ────────────────────
  function stationEvent(A, body, t, turnsRetro) {
    var l = lon(A, body, t);
    return {
      id: 'station-' + body + '-' + (turnsRetro ? 'retrograde' : 'direct'), kind: 'station', planet: body,
      turns: turnsRetro ? 'retrograde' : 'direct', when: iso(t), emoji: turnsRetro ? '🔄' : '➡️',
      title: body + ' turns ' + (turnsRetro ? 'retrograde' : 'direct') + ' in ' + signName(l), sign: signName(l), signIndex: signIndex(l)
    };
  }
  function stationsFor(A, start, days, body) {
    var t0 = ms(start), t1 = t0 + days * DAY, step = DAY * (SCAN_STEP[body] || 1), out = [];
    var f = function (t) { return speed(A, body, t); };
    var prevT = t0, prev = f(t0);
    for (var t = t0 + step; prevT < t1; t += step) {
      var cur = f(t);
      if ((cur < 0) !== (prev < 0)) {
        var at = bisect(f, prevT, t, MINUTE);
        if (at <= t1) out.push(stationEvent(A, body, at, prev >= 0));
      }
      prevT = t; prev = cur;
    }
    return out;
  }
  function stations(A, start, days, bodies) {
    var out = [];
    (bodies || STATION_BODIES).forEach(function (b) { out = out.concat(stationsFor(A, start, days, b)); });
    return out.sort(byWhen);
  }
  // Is this planet retrograde at this moment, since when, and until when?
  function retrogradeFor(A, when, body) {
    var t0 = ms(when), now = speed(A, body, t0);
    if (now >= 0) return { planet: body, retrograde: false };
    var step = DAY * (SCAN_STEP[body] || 1), f = function (t) { return speed(A, body, t); };
    var until = null, since = null, a = t0, i;
    for (i = 0; i < 260 && !until; i++) { var b = a + step; if (f(b) >= 0) until = bisect(f, a, b, MINUTE); a = b; }
    a = t0;
    for (i = 0; i < 260 && !since; i++) { var c = a - step; if (f(c) >= 0) since = bisect(f, c, a, MINUTE); a = c; }
    return { planet: body, retrograde: true, since: since ? iso(since) : null, until: until ? iso(until) : null, sign: signName(lon(A, body, t0)) };
  }
  function retrogradeNow(A, when, bodies) {
    return (bodies || RETRO_BODIES).map(function (b) { return retrogradeFor(A, when, b); });
  }

  // ── Ingresses: a planet crossing into a new sign ─────────────────────
  var INGRESS_EMOJI = { Sun: '☀️', Mercury: '💬', Venus: '💗', Mars: '🔥' };
  function ingressesFor(A, start, days, body) {
    var t0 = ms(start), t1 = t0 + days * DAY, out = [];
    var sign = function (t) { return signIndex(lon(A, body, t)); };
    var prevT = t0, prev = sign(t0);
    for (var t = t0 + DAY; prevT < t1; t += DAY) {
      var cur = sign(t);
      if (cur !== prev) {
        var from = prev, at = bisectFlip(function (x) { return sign(x) === from; }, prevT, t, MINUTE);
        var backwards = ((cur - from + 12) % 12) === 11;
        if (at <= t1) out.push({
          id: 'ingress-' + body + '-' + SIGNS[cur], kind: 'ingress', planet: body, when: iso(at), emoji: INGRESS_EMOJI[body] || '✨',
          title: (body === 'Sun' ? 'The Sun' : body) + (backwards ? ' slips back into ' : ' enters ') + SIGNS[cur],
          sign: SIGNS[cur], signIndex: cur, from: SIGNS[from], backwards: backwards
        });
      }
      prevT = t; prev = cur;
    }
    return out;
  }
  function ingresses(A, start, days, bodies) {
    var out = [];
    (bodies || INGRESS_BODIES).forEach(function (b) { out = out.concat(ingressesFor(A, start, days, b)); });
    return out.sort(byWhen);
  }

  // ── Transits to her chart, with the moment each is exact ─────────────
  var TRANSIT_EMOJI = { Mars: '🔥', Jupiter: '🍀', Saturn: '🪐', Uranus: '⚡', Neptune: '🌊', Pluto: '🦋' };
  function transitsFor(A, start, days, natal, body) {
    var t0 = ms(start), n = Math.ceil(days), t1 = t0 + days * DAY, L = [], out = [], i;
    if (!natal) return out;
    for (i = 0; i <= n; i++) L.push(lon(A, body, t0 + i * DAY));
    TRANSIT_POINTS.forEach(function (point) {
      var nl = Number(natal[point]);
      if (natal[point] == null || !isFinite(nl)) return;
      TRANSIT_ASPECTS.forEach(function (asp) {
        var offsets = (asp.angle === 0 || asp.angle === 180) ? [asp.angle] : [asp.angle, -asp.angle];
        offsets.forEach(function (off) {
          var target = norm360(nl + off);
          var f = function (t) { return norm180(lon(A, body, t) - target); };
          for (var k = 0; k < n; k++) {
            var a = norm180(L[k] - target), b = norm180(L[k + 1] - target);
            if (Math.abs(a) > 30 || Math.abs(b) > 30 || (a < 0) === (b < 0)) continue;
            var at = bisect(f, t0 + k * DAY, t0 + (k + 1) * DAY, MINUTE);
            if (at > t1) continue;
            var rx = speed(A, body, at) < 0;
            out.push({
              id: 'transit-' + body + '-' + asp.name + '-' + point, kind: 'transit', planet: body, point: point, aspect: asp.name,
              tone: asp.tone, retrograde: rx, when: iso(at), emoji: TRANSIT_EMOJI[body] || '✨',
              title: body + ' ' + ASPECT_WORD[asp.name] + ' your ' + POINT_LABEL[point], sign: signName(lon(A, body, at))
            });
          }
        });
      });
    });
    return out.sort(byWhen);
  }
  function transits(A, start, days, natal, bodies) {
    var out = [];
    (bodies || TRANSIT_BODIES).forEach(function (b) { out = out.concat(transitsFor(A, start, days, natal, b)); });
    return out.sort(byWhen);
  }

  // ── Human Design: the gate the Sun is lighting up ────────────────────
  function sunGates(A, start, days) {
    var t0 = ms(start), t1 = t0 + days * DAY, out = [];
    var idx = function (t) { return gateOf(lon(A, 'Sun', t)).index; };
    var prevT = t0, prev = idx(t0);
    for (var t = t0 + DAY; prevT < t1; t += DAY) {
      var cur = idx(t);
      if (cur !== prev) {
        var from = prev, at = bisectFlip(function (x) { return idx(x) === from; }, prevT, t, MINUTE);
        if (at <= t1) out.push({ id: 'gate-Sun-' + GATE_WHEEL[cur], kind: 'gate', planet: 'Sun', gate: GATE_WHEEL[cur], when: iso(at), emoji: '🔆',
          title: 'The Sun enters Gate ' + GATE_WHEEL[cur] });
      }
      prevT = t; prev = cur;
    }
    return out;
  }

  function byWhen(a, b) { return a.when < b.when ? -1 : a.when > b.when ? 1 : 0; }

  // Everything at once. The page asks for the parts one at a time instead, so it never freezes.
  function skyAhead(A, start, days, natal) {
    return moonEvents(A, start, days)
      .concat(eclipses(A, start, days), stations(A, start, days), ingresses(A, start, days), transits(A, start, days, natal), sunGates(A, start, days))
      .sort(byWhen);
  }

  // ── What one day holds, for the scorer ───────────────────────────────
  var EASY = [{ planet: 'Venus', orb: 2 }, { planet: 'Jupiter', orb: 1.5 }];
  var EASY_POINTS = ['Sun', 'Venus', 'MC'];
  var EASY_ASPECTS = [{ name: 'conjunction', angle: 0 }, { name: 'sextile', angle: 60 }, { name: 'trine', angle: 120 }];
  var HARD = [{ planet: 'Mars', orb: 2 }, { planet: 'Saturn', orb: 1.5 }];
  var HARD_POINTS = ['Sun', 'Moon', 'Mercury'];
  var HARD_ASPECTS = [{ name: 'square', angle: 90 }, { name: 'opposition', angle: 180 }];

  function aspectsAt(A, t, natal, movers, points, aspects) {
    var out = [];
    if (!natal) return out;
    movers.forEach(function (m) {
      var l = lon(A, m.planet, t);
      points.forEach(function (point) {
        var nl = Number(natal[point]);
        if (natal[point] == null || !isFinite(nl)) return;
        var d = Math.abs(norm180(l - nl));
        aspects.forEach(function (asp) {
          var orb = Math.abs(d - asp.angle);
          if (orb <= m.orb) out.push({ planet: m.planet, point: point, aspect: asp.name, orb: round1(orb) });
        });
      });
    });
    return out.sort(function (a, b) { return a.orb - b.orb; });
  }

  function phaseBand(f) {
    if (f.newMoon) return 'new';
    if (f.fullMoon) return 'full';
    if (f.phase >= 336) return 'dark';
    if (f.phase < 90) return 'waxing1';
    if (f.phase < 180) return 'waxing2';
    if (f.phase < 270) return 'waning1';
    return 'waning2';
  }
  var BAND_NAME = { 'new': 'New Moon', waxing1: 'Waxing Crescent', waxing2: 'Waxing Gibbous', full: 'Full Moon', waning1: 'Waning Gibbous', waning2: 'Waning Crescent', dark: 'Dark Moon' };
  var BAND_EMOJI = { 'new': '🌑', waxing1: '🌒', waxing2: '🌔', full: '🌕', waning1: '🌖', waning2: '🌘', dark: '🌑' };

  /* dayStart and dayEnd are the two ends of her local day. natal is a plain
     object of longitudes: { Sun, Moon, ASC, Mercury, Venus, Mars, MC }. */
  function dayFacts(A, dayStart, dayEnd, natal) {
    var s = ms(dayStart), e = ms(dayEnd), mid = (s + e) / 2;
    var p0 = moonPhase(A, s), p1 = moonPhase(A, e), pm = moonPhase(A, mid);
    var moonSign = function (t) { return signIndex(lon(A, 'Moon', t)); };
    var s0 = moonSign(s), s1 = moonSign(e), sm = moonSign(mid);
    var f = {
      phase: round1(pm),
      illumination: Math.round((1 - Math.cos(pm * Math.PI / 180)) / 2 * 100),
      newMoon: p1 < p0,
      fullMoon: p0 < 180 && p1 >= 180,
      firstQuarter: p0 < 90 && p1 >= 90,
      lastQuarter: p0 < 270 && p1 >= 270,
      moonSign: sm, moonSignStart: s0, moonSignEnd: s1,
      moonChangeAt: s0 !== s1 ? iso(bisectFlip(function (t) { return moonSign(t) === s0; }, s, e, MINUTE)) : null
    };
    f.waxing = pm < 180;
    f.band = phaseBand(f);
    f.phaseName = f.firstQuarter ? 'First Quarter' : f.lastQuarter ? 'Last Quarter' : BAND_NAME[f.band];
    f.phaseEmoji = f.firstQuarter ? '🌓' : f.lastQuarter ? '🌗' : BAND_EMOJI[f.band];
    var m0 = speed(A, 'Mercury', s), m1 = speed(A, 'Mercury', e), mm = speed(A, 'Mercury', mid);
    f.mercuryStation = (m0 < 0) !== (m1 < 0);
    f.mercuryRx = mm < 0 || f.mercuryStation;
    f.venusRx = speed(A, 'Venus', mid) < 0;
    f.easy = aspectsAt(A, mid, natal, EASY, EASY_POINTS, EASY_ASPECTS);
    f.hard = aspectsAt(A, mid, natal, HARD, HARD_POINTS, HARD_ASPECTS);
    f.natalMatch = null;
    if (natal) {
      [['Sun', 'Sun sign'], ['Moon', 'Moon sign'], ['ASC', 'rising sign']].forEach(function (pair) {
        var v = natal[pair[0]];
        if (f.natalMatch == null && v != null && isFinite(Number(v)) && signIndex(Number(v)) === sm) f.natalMatch = pair[1];
      });
    }
    f.eclipse = null; // the page fills this in from the timeline when an eclipse lands on the day
    return f;
  }

  // ── The scorer: rules she can read ───────────────────────────────────
  var PURPOSES = [
    { key: 'launch', label: 'Launch something', emoji: '🚀' },
    { key: 'talk', label: 'A hard conversation', emoji: '💬' },
    { key: 'rest', label: 'Rest and reset', emoji: '🛁' },
    { key: 'creative', label: 'Creative work', emoji: '🎨' },
    { key: 'money', label: 'Money moves', emoji: '💸' },
    { key: 'beauty', label: 'Beauty and self-care', emoji: '💅' },
    { key: 'travel', label: 'Travel', emoji: '✈️' },
    { key: 'sign', label: 'Signing something', emoji: '🖋️' }
  ];
  var PHASE_POINTS = {
    launch:   { 'new': 1,   waxing1: 2,   waxing2: 1.5, full: 0.5,  waning1: -1,  waning2: -1.5, dark: -2 },
    talk:     { 'new': 0,   waxing1: 0,   waxing2: 0,   full: -1,   waning1: 1.5, waning2: 1,    dark: -0.5 },
    rest:     { 'new': 1,   waxing1: 0,   waxing2: -0.5, full: -0.5, waning1: 0.5, waning2: 1,   dark: 2.5 },
    creative: { 'new': 0.5, waxing1: 1.5, waxing2: 1.5, full: 1,    waning1: 0,   waning2: 0,    dark: -0.5 },
    money:    { 'new': 0.5, waxing1: 1.5, waxing2: 1.5, full: 0,    waning1: -0.5, waning2: -1,  dark: -1.5 },
    beauty:   { 'new': 0,   waxing1: 1,   waxing2: 1,   full: 1,    waning1: 0.5, waning2: 0,    dark: -0.5 },
    travel:   { 'new': 0,   waxing1: 1,   waxing2: 1,   full: 0,    waning1: 0,   waning2: -0.5, dark: -1 },
    sign:     { 'new': 0.5, waxing1: 2,   waxing2: 1.5, full: 0,    waning1: -1,  waning2: -1.5, dark: -2 }
  };
  var PHASE_WORDS = {
    'new': 'New Moon today: a fresh page.',
    waxing1: 'Waxing crescent Moon: momentum is building.',
    waxing2: 'Waxing gibbous Moon: things are gathering strength.',
    full: 'Full Moon today: everything is lit up and feelings run high.',
    waning1: 'Waning gibbous Moon: a time for sharing and letting go.',
    waning2: 'Waning crescent Moon: a time for finishing and clearing out.',
    dark: 'Dark Moon: the quiet days before the new Moon, made for rest.'
  };
  var ELEMENT_POINTS = {
    launch:   { Fire: 1.5, Earth: 1,   Air: 0.5, Water: 0 },
    talk:     { Fire: -1,  Earth: 1,   Air: 1.5, Water: 0.5 },
    rest:     { Fire: -0.5, Earth: 1,  Air: 0,   Water: 1.5 },
    creative: { Fire: 1,   Earth: 0,   Air: 1,   Water: 1.5 },
    money:    { Fire: 0.5, Earth: 1.5, Air: 0.5, Water: 0 },
    beauty:   { Fire: 0.5, Earth: 1,   Air: 1,   Water: 1 },
    travel:   { Fire: 1.5, Earth: 0,   Air: 1,   Water: -0.5 },
    sign:     { Fire: 0,   Earth: 1.5, Air: 1,   Water: 0 }
  };
  var PHASE_WORDS_QUARTER = {
    first: 'First quarter Moon today: time to push through the first snag and commit.',
    last: 'Last quarter Moon today: time to edit, tidy and let one thing go.'
  };
  // When the Moon's sign counts against the day, the same element in its harder mood.
  var ELEMENT_WORDS_HARD = { Fire: 'fiery and impatient', Earth: 'slow to move', Air: 'restless and in its head', Water: 'sensitive and easily swayed' };
  var ELEMENT_WORDS = { Fire: 'bold and quick', Earth: 'steady and practical', Air: 'talkative and clear headed', Water: 'tender and intuitive' };
  var VENUS_SIGN_POINTS = { beauty: 1, money: 0.5 };
  var NATAL_LIFT = 1;
  var MERCURY_RX_POINTS = { launch: -2, sign: -3, travel: -2 };
  var VENUS_RX_POINTS = { beauty: -1.5, money: -1 };
  var EASY_POINTS_FOR = { money: 2, beauty: 2, launch: 2 };
  var HARD_POINTS_FOR = { talk: -2 };
  var CYCLE_POINTS = {
    Follicular: { launch: 1.5, talk: 1.5, creative: 1.5 },
    Ovulation: { launch: 1.5, talk: 1.5, creative: 1.5 },
    Menstrual: { rest: 2 }
  };
  var CYCLE_WORDS = {
    Follicular: 'energy and optimism are rising',
    Ovulation: 'you are at your most magnetic and articulate',
    Menstrual: 'your body is asking for rest'
  };
  var ECLIPSE_POINTS = { launch: -2, sign: -2, rest: 1 };
  var EASY_POINT_WORDS = { Sun: 'confidence and being seen', Venus: 'charm, money and taste', MC: 'career and reputation' };
  var HARD_WORDS = { Mars: 'words can come out sharper than you mean', Saturn: 'things can feel heavier than they are' };
  var ASPECT_CAP = 4;

  var RULES = [
    { emoji: '🌙', title: 'The Moon’s phase', text: 'A growing Moon lifts beginnings: launching, signing, money, creative work and travel. A shrinking Moon lifts letting go and honest talks. The dark Moon, the last two days before a new Moon, is for rest.' },
    { emoji: '♉️', title: 'The Moon’s sign', text: 'Fire signs lift launches and travel. Earth signs lift money, signing and anything meant to last. Air signs lift conversations. Water signs lift rest and creative work. Taurus and Libra, the Venus signs, add a little for beauty and money.' },
    { emoji: '💗', title: 'Your own signs', text: 'When the Moon is in your Sun sign, Moon sign or rising sign, every kind of day gets a lift. You feel like yourself.' },
    { emoji: '🔄', title: 'Mercury retrograde', text: 'Counts against launching, signing and travel. It counts the most against signing.' },
    { emoji: '🌹', title: 'Venus retrograde', text: 'Counts against beauty changes and money moves.' },
    { emoji: '🍀', title: 'Venus and Jupiter', text: 'When either one makes a conjunction, sextile or trine to your natal Sun, Venus or Midheaven, money, beauty and launches get a lift.' },
    { emoji: '🔥', title: 'Mars and Saturn', text: 'When either one squares or opposes your natal Sun, Moon or Mercury, it counts against hard conversations.' },
    { emoji: '🌸', title: 'Your cycle', text: 'Only when you have period history. Follicular and ovulation days lift launches, conversations and creative work. Menstrual days lift rest.' },
    { emoji: '🌒', title: 'Eclipses', text: 'An eclipse day counts against launching and signing, and adds a little for rest.' }
  ];

  function purposeKey(p) { return (p && p.key) || p; }

  /* cycle is a plain value or null: { phase: 'Follicular', day: 9, estimate: true }.
     Gives back { score, reasons: [{ code, delta, text, at }] }, biggest reasons first. */
  function scoreDay(A, facts, purpose, cycle) {
    var key = purposeKey(purpose), reasons = [], score = 0;
    if (!facts || !PHASE_POINTS[key]) return { score: 0, reasons: [] };
    function add(code, delta, text, extra) {
      if (!delta) return;
      score += delta;
      var r = { code: code, delta: delta, text: text };
      if (extra) for (var k in extra) r[k] = extra[k];
      reasons.push(r);
    }

    var band = facts.band || phaseBand(facts);
    add('phase', PHASE_POINTS[key][band], facts.firstQuarter ? PHASE_WORDS_QUARTER.first : facts.lastQuarter ? PHASE_WORDS_QUARTER.last : PHASE_WORDS[band]);

    if (facts.moonSign != null && SIGNS[facts.moonSign]) {
      var sign = SIGNS[facts.moonSign], el = elementOfSign(facts.moonSign);
      var moved = facts.moonChangeAt && facts.moonSignStart !== facts.moonSignEnd;
      var lead = moved
        ? 'Moon moves from ' + SIGNS[facts.moonSignStart] + ' into ' + SIGNS[facts.moonSignEnd] + ' (mostly ' + sign + ', ' + el.toLowerCase() + ')'
        : 'Moon in ' + sign + ' (' + el.toLowerCase() + ')';
      add('sign', ELEMENT_POINTS[key][el], lead + ': ' + (ELEMENT_POINTS[key][el] < 0 ? ELEMENT_WORDS_HARD : ELEMENT_WORDS)[el] + '.', moved ? { at: facts.moonChangeAt } : null);
      if ((sign === 'Taurus' || sign === 'Libra') && VENUS_SIGN_POINTS[key]) add('venusSign', VENUS_SIGN_POINTS[key], sign + ' is a Venus sign: beauty and comfort come easily.');
      if (facts.natalMatch) add('natal', NATAL_LIFT, 'The Moon is in ' + sign + ', your ' + facts.natalMatch + ': you feel like yourself.');
    }

    if (facts.mercuryRx && MERCURY_RX_POINTS[key]) {
      add('mercuryRx', MERCURY_RX_POINTS[key], facts.mercuryStation
        ? 'Mercury turns around today: double check every detail.'
        : 'Mercury is retrograde: reread, back up, and allow extra time.');
    }
    if (facts.venusRx && VENUS_RX_POINTS[key]) add('venusRx', VENUS_RX_POINTS[key], 'Venus is retrograde: hold off on big changes to your look and big purchases.');

    var total = 0;
    if (EASY_POINTS_FOR[key]) (facts.easy || []).forEach(function (a) {
      if (total >= ASPECT_CAP) return;
      total += EASY_POINTS_FOR[key];
      add('easy', EASY_POINTS_FOR[key], a.planet + ' ' + ASPECT_WORD[a.aspect] + ' your ' + POINT_LABEL[a.point] + ' (within ' + a.orb + '°): a lift for ' + EASY_POINT_WORDS[a.point] + '.');
    });
    total = 0;
    if (HARD_POINTS_FOR[key]) (facts.hard || []).forEach(function (a) {
      if (total <= -ASPECT_CAP) return;
      total += HARD_POINTS_FOR[key];
      add('hard', HARD_POINTS_FOR[key], a.planet + ' ' + ASPECT_WORD[a.aspect] + ' your ' + POINT_LABEL[a.point] + ' (within ' + a.orb + '°): ' + HARD_WORDS[a.planet] + '.');
    });

    if (cycle && cycle.phase && CYCLE_POINTS[cycle.phase] && CYCLE_POINTS[cycle.phase][key]) {
      var dayText = cycle.day ? 'Day ' + cycle.day + ' of your cycle' : 'Your cycle';
      add('cycle', CYCLE_POINTS[cycle.phase][key],
        dayText + ' (' + cycle.phase.toLowerCase() + (cycle.estimate ? ', an estimate' : '') + '): ' + CYCLE_WORDS[cycle.phase] + '.');
    }
    if (facts.eclipse && ECLIPSE_POINTS[key]) add('eclipse', ECLIPSE_POINTS[key], 'Eclipse today: big feelings and surprise turns. Let things settle first.');

    reasons.sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    return { score: Math.round(score * 10) / 10, reasons: reasons };
  }

  /* days: [{ key: 'YYYY-MM-DD', facts, cycle }]. Gives back every day scored, the
     five best and the two to avoid. On a tie the day with fewer cautions wins,
     then the sooner day. */
  function rankDays(A, days, purpose, counts) {
    var nBest = (counts && counts.best) || 5, nAvoid = (counts && counts.avoid) || 2;
    var all = (days || []).filter(function (d) { return d && d.key && d.facts; }).map(function (d) {
      var r = scoreDay(A, d.facts, purpose, d.cycle);
      var cautions = r.reasons.filter(function (x) { return x.delta < 0; }).length;
      return { key: d.key, score: r.score, reasons: r.reasons, cautions: cautions, facts: d.facts, cycle: d.cycle || null };
    });
    var sooner = function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; };
    var best = all.slice().sort(function (a, b) { return (b.score - a.score) || (a.cautions - b.cautions) || sooner(a, b); }).slice(0, nBest);
    var taken = {}; best.forEach(function (d) { taken[d.key] = true; });
    var avoid = all.filter(function (d) { return !taken[d.key]; })
      .sort(function (a, b) { return (a.score - b.score) || (b.cautions - a.cautions) || sooner(a, b); }).slice(0, nAvoid);
    return { all: all, best: best, avoid: avoid };
  }

  window.nylaSky = {
    version: 1,
    SIGNS: SIGNS, ELEMENTS: ELEMENTS, PURPOSES: PURPOSES, RULES: RULES, GATE_WHEEL: GATE_WHEEL, POINT_LABEL: POINT_LABEL, ASPECT_WORD: ASPECT_WORD,
    STATION_BODIES: STATION_BODIES, RETRO_BODIES: RETRO_BODIES, INGRESS_BODIES: INGRESS_BODIES, TRANSIT_BODIES: TRANSIT_BODIES, TRANSIT_POINTS: TRANSIT_POINTS,
    util: { norm360: norm360, norm180: norm180, signIndex: signIndex, signName: signName, elementOfSign: elementOfSign, gateOf: gateOf },
    lon: lon, speed: speed, moonPhase: moonPhase,
    moonEvents: moonEvents, eclipses: eclipses, nextEclipse: nextEclipse,
    stations: stations, stationsFor: stationsFor, retrogradeNow: retrogradeNow, retrogradeFor: retrogradeFor,
    ingresses: ingresses, ingressesFor: ingressesFor,
    transits: transits, transitsFor: transitsFor,
    sunGates: sunGates, skyAhead: skyAhead,
    dayFacts: dayFacts, scoreDay: scoreDay, rankDays: rankDays
  };
})();
