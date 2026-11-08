/* Financial astrology for Nyla, personally. Not a template.

   One global: window.moneySky. Nothing here touches the page. Every function
   that needs the sky takes the astronomy library (astronomy-engine 2.1.19) as
   its first argument, so the same file runs in Node for the tests and in all
   three dashboards: Nyla OS, the Semester HQ Business OS and Company HQ.

   THE SOURCE OF TRUTH IS nyla-os js/money-sky-core.js. The two Business OS
   copies are made by `node tools/sync-money-sky.mjs` in the Nyla OS repo;
   never edit a copy. The copy check in each repo's tests fails on drift.

   Her chart (PROFILE) is the Swiss Ephemeris NATAL blob from nyla-os.html,
   copied as numbers; tests/money-sky.test.mjs fails if the two ever differ.
   Tropical zodiac, Placidus houses, geocentric apparent longitudes on the
   ecliptic of date, the same sum the Cosmic pages use.

   Moments go out as epoch milliseconds. The view turns them into local time.
   This is for timing and reflection; her real numbers always come first. */
(function () {
  'use strict';

  var DAY = 86400000, HOUR = 3600000, MINUTE = 60000;
  var SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  var SIGN_GLYPH = ['♈︎', '♉︎', '♊︎', '♋︎', '♌︎', '♍︎', '♎︎', '♏︎', '♐︎', '♑︎', '♒︎', '♓︎'];
  var ELEMENT = ['Fire', 'Earth', 'Air', 'Water'];
  var GLYPH = { Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂', Jupiter: '♃', Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇', 'North Node': '☊' };
  var BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];

  // ── Her chart ────────────────────────────────────────────────────────
  var PROFILE = {
    name: 'Nyla Iman Brown',
    born: { y: 2005, m: 11, d: 23, local: 'November 23, 2005, 9:18 PM PST', place: 'Los Angeles' },
    utc: '2005-11-24T05:18:00Z',
    asc: 125.5311, mc: 26.441,
    cusps: [125.5311, 147.9445, 174.5657, 206.441, 241.511, 275.3467, 305.5311, 327.9445, 354.5657, 26.441, 61.511, 95.3467],
    planets: { Sun: 242.0235, Moon: 155.2324, Mercury: 243.056, Venus: 287.1609, Mars: 39.9744, Jupiter: 216.2251, Saturn: 131.308, Uranus: 336.8716, Neptune: 315.0429, Pluto: 263.4944, 'North Node': 12.3691 },
    rx: { Mercury: true, Mars: true, Saturn: true },
    hd: { type: 'Manifesting Generator', authority: 'Sacral', profile: '3/5' }
  };

  // ── Small helpers ────────────────────────────────────────────────────
  function norm360(x) { return ((x % 360) + 360) % 360; }
  function norm180(x) { var v = norm360(x); return v > 180 ? v - 360 : v; }
  function signIndex(l) { return Math.floor(norm360(l) / 30) % 12; }
  function signName(l) { return SIGNS[signIndex(l)]; }
  function degIn(l) { return norm360(l) % 30; }
  function fmtPos(l) { var d = degIn(l), whole = Math.floor(d), min = Math.floor((d - whole) * 60); return SIGNS[signIndex(l)] + ' ' + whole + '°' + (min < 10 ? '0' : '') + min + '′'; }
  function ms(v) { return v instanceof Date ? v.getTime() : typeof v === 'number' ? v : new Date(v).getTime(); }
  function round1(x) { return Math.round(x * 10) / 10; }
  function houseOf(l, cusps) {
    for (var i = 0; i < 12; i++) { var a = cusps[i], b = cusps[(i + 1) % 12]; if (norm360(l - a) < norm360(b - a)) return i + 1; }
    return 1;
  }
  function bisectFlip(test, a, b, tol) { var ta = test(a); while (b - a > tol) { var m = (a + b) / 2; if (test(m) === ta) a = m; else b = m; } return b; }
  function ordinal(n) { return n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'); }
  function dateKey(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ── Where things are ─────────────────────────────────────────────────
  function lon(A, body, when) {
    var time = A.MakeTime(new Date(ms(when)));
    var v = A.RotateVector(A.Rotation_EQJ_ECT(time), A.GeoVector(A.Body[body], time, true));
    return A.SphereFromVector(v).lon;
  }
  function speed(A, body, when) { var t = ms(when), h = DAY / 8; return norm180(lon(A, body, t + h) - lon(A, body, t - h)) / 0.25; }
  function moonPhase(A, when) { return A.MoonPhase(A.MakeTime(new Date(ms(when)))); }
  var PHASES = [[12, 'New Moon', '🌑'], [80, 'Waxing Crescent', '🌒'], [100, 'First Quarter', '🌓'], [168, 'Waxing Gibbous', '🌔'], [192, 'Full Moon', '🌕'], [260, 'Waning Gibbous', '🌖'], [280, 'Last Quarter', '🌗'], [336, 'Waning Crescent', '🌘'], [361, 'Dark Moon', '🌑']];
  function phaseInfo(angle) { for (var i = 0; i < PHASES.length; i++) if (angle < PHASES[i][0]) return { name: PHASES[i][1], emoji: PHASES[i][2], angle: round1(angle), illumination: Math.round((1 - Math.cos(angle * Math.PI / 180)) / 2 * 100), waxing: angle < 180 }; }

  // ── Words ────────────────────────────────────────────────────────────
  var RULER = { Aries: 'Mars', Taurus: 'Venus', Gemini: 'Mercury', Cancer: 'Moon', Leo: 'Sun', Virgo: 'Mercury', Libra: 'Venus', Scorpio: 'Mars', Sagittarius: 'Jupiter', Capricorn: 'Saturn', Aquarius: 'Saturn', Pisces: 'Jupiter' };
  var MODERN = { Scorpio: 'Pluto', Aquarius: 'Uranus', Pisces: 'Neptune' };
  var HOUSE_NAME = { 1: 'Self', 2: 'Income', 3: 'Marketing', 4: 'Foundations', 5: 'Creative ventures', 6: 'Daily work', 7: 'Partners', 8: 'Shared money', 9: 'Education and vision', 10: 'Career', 11: 'Community', 12: 'Behind the scenes' };
  var HOUSE_THEME = {
    1: 'you, your image and fresh starts', 2: 'your own income, your prices and what you value', 3: 'marketing, writing and local networks',
    4: 'your home base, foundations and what you own', 5: 'creative ventures, risk, and students and young people', 6: 'daily work, systems, service and health',
    7: 'clients and partners one to one, and contracts', 8: "other people's money: investors, loans, payouts and taxes", 9: 'education, publishing, travel and the big vision',
    10: 'career, reputation and the public face of the business', 11: 'community, networks and income from groups', 12: 'behind the scenes: rest, endings and hidden costs'
  };
  var MONEY_HOUSES = [2, 6, 8, 10];
  var SIGN_MONEY = {
    Aries: 'fast, bold and self-started: money from leading and going first', Taurus: 'slow, steady and tangible: money from quality and things that last',
    Gemini: 'many streams and lots of talk: money from words, ideas and connecting people', Cancer: 'protective and caring: money from looking after people',
    Leo: 'visible and generous: money from being seen, your name and your creative work', Virgo: 'careful and useful: money from fixing problems, systems and service done well',
    Libra: 'partnered and polished: money from beauty, fairness and the right collaborations', Scorpio: 'deep and strategic: money from research, shared resources and transformation',
    Sagittarius: 'big-picture and expansive: money from teaching, publishing and vision', Capricorn: 'patient and structured: money from long-term plans and reputation',
    Aquarius: 'inventive and networked: money from tech, communities and new ideas', Pisces: 'intuitive and flowing: money from imagination and care, with leaks to watch'
  };
  var PLANET_MOVE = {
    Sun: 'attention and energy', Moon: 'mood and short-term focus', Mercury: 'deals, paperwork and messages', Venus: 'money, pricing and attraction',
    Mars: 'drive, push and spending urges', Jupiter: 'growth, luck and bigger numbers', Saturn: 'structure, tests and slow results that last',
    Uranus: 'sudden changes and tech breaks', Neptune: 'inspiration, and fog to check facts through', Pluto: 'deep restructuring and power'
  };
  var ASPECTS = [{ name: 'conjunction', word: 'conjunct', angle: 0, tone: 'blend' }, { name: 'sextile', word: 'sextile', angle: 60, tone: 'easy' }, { name: 'square', word: 'square', angle: 90, tone: 'hard' }, { name: 'trine', word: 'trine', angle: 120, tone: 'easy' }, { name: 'opposition', word: 'opposite', angle: 180, tone: 'hard' }];

  // ── Her money map (natal, fixed) ─────────────────────────────────────
  function moneyPoints(P) {
    var p = P.planets, night = houseOf(p.Sun, P.cusps) <= 6;
    var pof = norm360(night ? P.asc + p.Sun - p.Moon : P.asc + p.Moon - p.Sun);   // day: ASC + Moon - Sun; night: ASC + Sun - Moon
    return { Sun: p.Sun, Moon: p.Moon, Venus: p.Venus, Jupiter: p.Jupiter, MC: P.mc, PoF: pof, C2: P.cusps[1], C8: P.cusps[7] };
  }
  var POINT_LABEL = { Sun: 'Sun', Moon: 'Moon', Venus: 'Venus', Jupiter: 'Jupiter', MC: 'Midheaven', PoF: 'Part of Fortune', C2: 'income house', C8: 'shared-money house' };
  var POINT_THEME = { Sun: 'your visibility and drive', Moon: 'your sense of money safety', Venus: 'what you earn and how you price', Jupiter: 'your growth and luck', MC: 'your career and reputation', PoF: 'your luck point', C2: 'your income', C8: "other people's money" };

  function placement(P, name) { var l = name === 'ASC' ? P.asc : name === 'MC' ? P.mc : P.planets[name]; return { name: name, lon: l, pos: fmtPos(l), sign: signName(l), house: houseOf(l, P.cusps), rx: !!P.rx[name] }; }

  /* Things worth saying about her money, each tied to a placement. Each one
     checks its own placement first and stays silent if the chart ever says
     something else, so the words can never drift from the numbers. */
  var HIGHLIGHTS = [
    { id: 'venus', emoji: '♀', title: 'Your money planet works like a system', when: function (m) { return m.Venus.sign === 'Capricorn' && m.Venus.house === 6; },
      text: function (m) { return 'Venus, the planet of money and value, sits at ' + m.Venus.pos + ' in your 6th house of daily work. Money grows through steady systems, useful products and service done well. It rewards patience over hype: price for quality and long-term value, and let routines do the earning.'; } },
    { id: 'moon2', emoji: '☽', title: 'Organized money feels safe to you', when: function (m) { return m.Moon.house === 2 && m.Moon.sign === 'Virgo'; },
      text: function (m) { return 'Your Moon is in your 2nd house of income, at ' + m.Moon.pos + '. Your income and your emotional security move together. You feel calm about money when it is tracked, tidy and steady, so the books are a form of self-care. Virgo income comes from fixing problems and making things work better.'; } },
    { id: 'income-ruler', emoji: '☉', title: 'Your income ruler lives in teaching and youth', when: function (m) { return m.incomeRuler === 'Sun' && m.Sun.house === 5 && m.Sun.sign === 'Sagittarius'; },
      text: function (m) { return 'Your 2nd house starts in ' + m.houses[2].sign + ', so the Sun rules your income. Your Sun is in Sagittarius in the 5th house: education, students, creative ventures and big ideas. Income follows work aimed at young people and learning. Mercury is there too, retrograde: you earn by explaining things in your own way, and by revising until it lands.'; } },
    { id: 'jupiter', emoji: '♃', title: 'Luck comes from what you own', when: function (m) { return m.Jupiter.sign === 'Scorpio' && m.Jupiter.house === 4 && m.pofHouse === 4; },
      text: function (m) { return 'Jupiter, growth and luck, is at ' + m.Jupiter.pos + ' in your 4th house of foundations, ' + round1(Math.abs(norm180(m.points.Jupiter - m.points.PoF))) + '° from your Part of Fortune (' + fmtPos(m.points.PoF) + '). Your luckiest money comes from things you own outright, such as your platform, your products and your ideas, more than from trading hours for pay. Scorpio adds depth: research and strategy pay.'; } },
    { id: 'mc', emoji: '♂', title: 'A reputation built slowly, on your terms', when: function (m) { return m.houses[10].sign === 'Aries' && m.Mars.sign === 'Taurus' && m.Mars.house === 10 && m.Mars.rx; },
      text: function (m) { return 'Your Midheaven, the career point, is at ' + fmtPos(m.points.MC) + ': you are meant to lead and start your own thing. Its ruler Mars is in Taurus in the 10th house and retrograde. You build reputation by refining and redoing until it is solid. Persistence wins for you, not speed.'; } },
    { id: 'eighth', emoji: '♅', title: "Other people's money arrives in jumps", when: function (m) { return m.Uranus.house === 8; },
      text: function (m) { return 'Uranus sits in your 8th house of shared money, at ' + m.Uranus.pos + '. Investors, platforms, payouts and partnerships tend to arrive suddenly and through tech, not on a smooth schedule. Keep a cushion and be ready to move when an opening appears.'; } },
    { id: 'node', emoji: '☊', title: 'Education is your growth direction', when: function (m) { return m['North Node'].house === 9; },
      text: function (m) { return 'Your North Node is at ' + m['North Node'].pos + ' in the 9th house of education, publishing and the big vision. Building for learning is not a side road for you; it is the direction your chart points.'; } }
  ];

  function moneyMap(P) {
    P = P || PROFILE;
    var m = { points: moneyPoints(P), houses: {} };
    ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'North Node'].forEach(function (n) { m[n] = placement(P, n); });
    for (var h = 1; h <= 12; h++) {
      var c = P.cusps[h - 1], sign = signName(c), ruler = RULER[sign], modern = MODERN[sign] || null;
      var inside = Object.keys(P.planets).filter(function (n) { return houseOf(P.planets[n], P.cusps) === h; });
      m.houses[h] = { house: h, name: HOUSE_NAME[h], theme: HOUSE_THEME[h], cusp: c, pos: fmtPos(c), sign: sign, style: SIGN_MONEY[sign], ruler: ruler, modern: modern,
        rulerAt: placement(P, ruler), modernAt: modern ? placement(P, modern) : null, inside: inside.map(function (n) { return placement(P, n); }) };
    }
    m.incomeRuler = m.houses[2].ruler;
    m.pofHouse = houseOf(m.points.PoF, P.cusps);
    m.night = houseOf(P.planets.Sun, P.cusps) <= 6;
    m.highlights = HIGHLIGHTS.filter(function (x) { return x.when(m); }).map(function (x) { return { id: x.id, emoji: x.emoji, title: x.title, text: x.text(m) }; });
    m.moneyHouses = MONEY_HOUSES.map(function (h) { return m.houses[h]; });
    return m;
  }

  // ── Numerology (same sums as Nyla OS > Cosmic > Numerology) ──────────
  function reduceNum(n) { var s = parseInt(n, 10); while (s > 9 && s !== 11 && s !== 22 && s !== 33) s = String(s).split('').reduce(function (a, d) { return a + parseInt(d, 10); }, 0); return s; }
  function digitSum(n) { return String(n).split('').reduce(function (a, d) { return a + parseInt(d, 10); }, 0); }
  function lifePath(P) { var b = (P || PROFILE).born; return reduceNum(reduceNum(b.m) + reduceNum(b.d) + reduceNum(digitSum(b.y))); }
  function personalYear(P, y) { var b = (P || PROFILE).born; return reduceNum(reduceNum(b.m) + reduceNum(b.d) + reduceNum(digitSum(y))); }
  function personalMonth(P, y, mo) { return reduceNum(personalYear(P, y) + mo); }
  function personalDay(P, y, mo, d) { return reduceNum(personalMonth(P, y, mo) + reduceNum(d)); }
  var PYTH = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9, S: 1, T: 2, U: 3, V: 4, W: 5, X: 6, Y: 7, Z: 8 };
  function nameNumber(s) { var t = String(s || '').toUpperCase().split('').reduce(function (a, ch) { return a + (PYTH[ch] || 0); }, 0); return t ? reduceNum(t) : null; }
  var NUM_MONEY = {
    1: { name: 'Start', year: 'Plant money seeds: new offers, new streams, your own name on things.', day: 'Start something: launch, pitch, open the new account.' },
    2: { name: 'Partner', year: 'Money through partnerships and patience. Slow, quiet groundwork.', day: 'Partner up, negotiate gently, follow up.' },
    3: { name: 'Express', year: 'Marketing, content and visibility bring the money.', day: 'Post, write, promote. Be seen.' },
    4: { name: 'Build', year: 'Systems, budgets and foundations. Unglamorous work that compounds.', day: 'Do the books, fix systems, plan.' },
    5: { name: 'Change', year: 'Shifts, pivots and new markets. Stay flexible with money.', day: 'Try something new; avoid locking in long terms.' },
    6: { name: 'Care', year: 'Service, customers and responsibility. Take care of who pays you.', day: 'Look after customers; fair prices; fix what is owed.' },
    7: { name: 'Study', year: 'Research, strategy and inner work before big money moves.', day: 'Analyze and research; hold big spending.' },
    8: { name: 'Harvest', year: 'The money and power year of the nine-year cycle. Ask for more, sign bigger, own your authority.', day: 'Ask, sell, sign, raise prices. A money day.' },
    9: { name: 'Release', year: 'Finish, clear out and let go of what does not pay. Make room.', day: 'Close loops, cancel what drains, collect what is owed.' },
    11: { name: 'Vision', year: 'Inspiration and influence. Lead with the bigger vision.', day: 'Trust your intuition on money; share the vision.' },
    22: { name: 'Master build', year: 'Build something big and lasting. Large scale, real structure.', day: 'Make a big, practical move toward the long-term build.' },
    33: { name: 'Master teacher', year: 'Teaching and service on a large scale.', day: 'Teach, give, serve; it comes back.' }
  };
  var LIFE_PATH_MONEY = {
    5: 'Life Path 5 earns through freedom, variety and change. You do best with several income streams, work that lets you move, and products that spread on their own. Routine for its own sake drains you; systems that free your time pay you.'
  };
  function numbers(P, when, names) {
    P = P || PROFILE; var d = new Date(ms(when || Date.now())), y = d.getFullYear(), mo = d.getMonth() + 1, dd = d.getDate();
    var lp = lifePath(P), py = personalYear(P, y), pm = personalMonth(P, y, mo), pd = personalDay(P, y, mo, dd);
    function monthDays(yy, mm) { var n = new Date(yy, mm, 0).getDate(), out = []; for (var i = 1; i <= n; i++) out.push({ y: yy, m: mm, d: i, key: yy + '-' + String(mm).padStart(2, '0') + '-' + String(i).padStart(2, '0'), pd: personalDay(P, yy, mm, i) }); return out; }
    var next = mo === 12 ? [y + 1, 1] : [y, mo + 1];
    return {
      lifePath: lp, lifePathText: LIFE_PATH_MONEY[lp] || null,
      personalYear: py, personalMonth: pm, personalDay: pd, nextYear: personalYear(P, y + 1), year: y,
      meaning: NUM_MONEY, thisMonth: monthDays(y, mo), nextMonth: monthDays(next[0], next[1]),
      names: (names || []).filter(function (n) { return n && n.name; }).map(function (n) { var v = nameNumber(n.name); return { label: n.label || n.name, name: n.name, number: v, meaning: NUM_MONEY[v] || null }; })
    };
  }

  // ── Matrix of Destiny money channel (Ladini, as in Nyla OS) ──────────
  function reduce22(n) { var x = n; while (x > 22) x = digitSum(x); return x; }
  var ARCANA = { 1: 'The Magician', 2: 'The High Priestess', 3: 'The Empress', 4: 'The Emperor', 5: 'The Hierophant', 6: 'The Lovers', 7: 'The Chariot', 8: 'Justice', 9: 'The Hermit', 10: 'Wheel of Fortune', 11: 'Strength', 12: 'The Hanged Man', 13: 'Death', 14: 'Temperance', 15: 'The Devil', 16: 'The Tower', 17: 'The Star', 18: 'The Moon', 19: 'The Sun', 20: 'Judgement', 21: 'The World', 22: 'The Fool' };
  var ARCANA_MONEY = {
    1: 'Money through initiative, skill and selling your own ideas.', 2: 'Money through knowledge, research and quiet expertise.', 3: 'Money through beauty, creativity and making things grow.',
    4: 'Money through leading, structure and owning the business.', 5: 'Money through teaching, mentoring and trusted tradition.', 6: 'Money through work you love and the right partnerships.',
    7: 'Money through movement, drive and goals you chase hard.', 8: 'Money through fairness, contracts and doing things properly.', 9: 'Money through deep expertise; depth over volume.',
    10: 'Money that comes in cycles and flows when you trust the timing.', 11: 'Money through stamina and courage; watch for burnout.', 12: 'Money through service and seeing what others miss.',
    13: 'Money through reinvention; endings clear the way for bigger income.', 14: 'Money through balance and steady, healing work.', 15: 'Money through magnetism, influence and big material goals.',
    16: 'Money through building fresh after things fall apart.', 17: 'Money through talent, visibility and inspiring people.', 18: 'Money through imagination and intuition; check the facts.',
    19: 'Money through joy, warmth and being in the spotlight.', 20: 'Money through family, legacy and helping people begin again.', 21: 'Money through scale, travel and a wide reach.',
    22: 'Money through freedom, play and doing it your own way. It flows when you are not forcing it and stalls when you play small.'
  };
  function matrix(P) {
    var b = (P || PROFILE).born;
    var A = reduce22(b.d), B = reduce22(b.m), C = reduce22(digitSum(b.y)), D = reduce22(A + B + C), E = reduce22(A + B + C + D);
    var C1 = reduce22(C + E), D1 = reduce22(D + E), K = reduce22(D1 + C1), money = reduce22(C1 + K), midC = reduce22(C + C1);
    var pt = function (key, label, n, what) { return { key: key, label: label, number: n, arcana: ARCANA[n], money: ARCANA_MONEY[n], what: what }; };
    return { center: E, channel: [
      pt('C', 'Material point', C, 'How money enters your life: the year of your birth.'),
      pt('midC', 'Money channel', midC, 'The path between the outer and inner money points.'),
      pt('C1', 'Inner money point', C1, 'What makes money feel right to you.'),
      pt('money', 'Money point', money, 'Where your money karma resolves; the main money energy.'),
      pt('balance', 'Love and money balance', K, 'Where love and money meet; keep both in balance.')
    ] };
  }

  // ── Human Design ─────────────────────────────────────────────────────
  function humanDesign(P) {
    var hd = (P || PROFILE).hd;
    if (hd.type !== 'Manifesting Generator') return { type: hd.type, authority: hd.authority, notes: [] };
    return { type: hd.type, authority: hd.authority, profile: hd.profile, notes: [
      'Respond, then inform. As a Manifesting Generator, the best money opportunities come as something to respond to: an inquiry, a request, an offer. Before you act, tell the people it affects.',
      'Decide money moves with your gut (Sacral authority). Ask yourself yes-or-no questions out loud and listen for the "uh-huh" or "unh-unh". A no from the gut is a no, however good the numbers look.',
      'Skipping steps is allowed. You move fast and find shortcuts; just go back and fill the step you skipped when it matters (contracts, taxes).',
      'Profile ' + hd.profile + ': you learn by trial and error (3) and people project expectations onto you (5). Test offers small, then put your name on what worked.'
    ] };
  }

  // ── The sky now ──────────────────────────────────────────────────────
  var MOVERS = [{ planet: 'Venus', orb: 2 }, { planet: 'Mars', orb: 2 }, { planet: 'Jupiter', orb: 2 }, { planet: 'Saturn', orb: 2 }, { planet: 'Uranus', orb: 1.5 }, { planet: 'Neptune', orb: 1.5 }, { planet: 'Pluto', orb: 1.5 }];
  function transitsAt(A, P, t, movers) {
    var pts = moneyPoints(P), out = [];
    (movers || MOVERS).forEach(function (m) {
      var l = lon(A, m.planet, t), l2 = lon(A, m.planet, t + DAY);
      Object.keys(pts).forEach(function (k) {
        var d = Math.abs(norm180(l - pts[k])), d2 = Math.abs(norm180(l2 - pts[k]));
        ASPECTS.forEach(function (asp) {
          var orb = Math.abs(d - asp.angle);
          if (orb > m.orb) return;
          var orb2 = Math.abs(d2 - asp.angle), applying = orb2 < orb, rate = Math.abs(orb - orb2);
          var tone = asp.tone === 'blend' ? ((m.planet === 'Saturn' || m.planet === 'Mars' || m.planet === 'Pluto') ? 'hard' : (m.planet === 'Venus' || m.planet === 'Jupiter') ? 'easy' : 'blend') : asp.tone;
          var verb = tone === 'easy' ? 'opens a door for' : tone === 'hard' ? 'puts pressure on' : 'shakes up';
          out.push({ planet: m.planet, point: k, aspect: asp.name, orb: round1(orb), applying: applying, exactInDays: applying && rate > 0.01 ? Math.round(orb / rate) : null, tone: tone,
            title: m.planet + ' ' + asp.word + ' your ' + POINT_LABEL[k],
            text: m.planet + ' brings ' + PLANET_MOVE[m.planet] + ' and ' + verb + ' ' + POINT_THEME[k] + '.' });
        });
      });
    });
    return out.sort(function (a, b) { return a.orb - b.orb; });
  }

  function skyNow(A, P, when) {
    P = P || PROFILE; var t = ms(when || Date.now());
    var planets = BODIES.map(function (n) { var l = lon(A, n, t), h = houseOf(l, P.cusps); return { name: n, glyph: GLYPH[n], lon: l, pos: fmtPos(l), sign: signName(l), house: h, houseName: HOUSE_NAME[h], money: MONEY_HOUSES.indexOf(h) >= 0, rx: n !== 'Sun' && n !== 'Moon' && speed(A, n, t) < 0 }; });
    var moon = planets[1], ph = phaseInfo(moonPhase(A, t));
    return { at: t, planets: planets, moon: { pos: moon.pos, sign: moon.sign, house: moon.house, houseName: moon.houseName, theme: HOUSE_THEME[moon.house], phase: ph }, transits: transitsAt(A, P, t) };
  }

  // ── Void-of-course Moon ──────────────────────────────────────────────
  var VOC_BODIES = ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  var VOC_ANGLES = [0, 60, 90, 120, 180, 240, 270, 300];
  function moonIngresses(A, t0, t1) {
    var out = [], step = 2 * HOUR, prev = signIndex(lon(A, 'Moon', t0));
    for (var t = t0 + step; t <= t1 + step; t += step) {
      var s = signIndex(lon(A, 'Moon', t));
      if (s !== prev) { var at = bisectFlip(function (x) { return signIndex(lon(A, 'Moon', x)) === prev; }, t - step, t, MINUTE); out.push({ at: at, sign: SIGNS[s] }); prev = s; }
    }
    return out;
  }
  function lastAspectBefore(A, T, floor) {
    var elong = function (x, b) { return norm360(lon(A, 'Moon', x) - lon(A, b, x)); };
    var t = T, cur = VOC_BODIES.map(function (b) { return elong(t, b); });
    while (t > floor) {
      var u = Math.max(t - HOUR, floor), prev = VOC_BODIES.map(function (b) { return elong(u, b); }), best = null;
      for (var i = 0; i < VOC_BODIES.length; i++) for (var j = 0; j < VOC_ANGLES.length; j++) {
        var a = VOC_ANGLES[j], d0 = norm180(prev[i] - a), d1 = norm180(cur[i] - a);
        if (d0 < 0 && d1 >= 0 && d1 - d0 < 30) {
          var body = VOC_BODIES[i];
          var hit = bisectFlip(function (x) { return norm180(elong(x, body) - a) < 0; }, u, t, MINUTE);
          if (best == null || hit > best) best = hit;
        }
      }
      if (best != null) return best;
      t = u; cur = prev;
    }
    return null;
  }
  function vocWindows(A, t0, t1) {
    var ing = moonIngresses(A, ms(t0) - 3 * DAY, ms(t1) + 3 * DAY), out = [];
    for (var i = 1; i < ing.length; i++) {
      var T = ing[i].at, floor = ing[i - 1].at, start = lastAspectBefore(A, T, floor);
      var w = { start: start == null ? floor : start, end: T, into: ing[i].sign };
      if (w.end > ms(t0) && w.start < ms(t1)) out.push(w);
    }
    return out;
  }

  // ── Retrogrades, eclipses, moons, house changes ──────────────────────
  var RETRO_LOOK = { Mercury: [1, 30], Venus: [1, 50], Mars: [2, 85], Jupiter: [3, 130], Saturn: [3, 150] };
  function stationsBetween(A, body, t0, t1) {
    var step = RETRO_LOOK[body][0] * DAY, out = [], prev = speed(A, body, t0) < 0;
    for (var t = t0 + step; t <= t1; t += step) {
      var r = speed(A, body, t) < 0;
      if (r !== prev) { var p0 = prev; var at = bisectFlip(function (x) { return (speed(A, body, x) < 0) === p0; }, t - step, t, 10 * MINUTE); out.push({ at: at, retro: r }); prev = r; }
    }
    return out;
  }
  var RETRO_TEXT = {
    Mercury: 'Review, re-sign, re-price. Back up data, double-check invoices and contracts, and avoid launching new tech or signing new deals if you can wait.',
    Venus: 'Rethink prices and what you value. Not the time for big purchases or rebrands; good for reconnecting with old clients.',
    Mars: 'Energy turns inward. Rework existing plans rather than pushing new ones; avoid aggressive spending.',
    Jupiter: 'Growth slows to consolidate. Review what expanded; tighten before the next push.',
    Saturn: 'Audit structures, debts and long-term commitments. Fix the foundation.'
  };
  function retroPeriods(A, start, days, bodies) {
    var t0 = ms(start), t1 = t0 + days * DAY, out = [];
    (bodies || ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']).forEach(function (b) {
      var look = RETRO_LOOK[b][1] * DAY, st = stationsBetween(A, b, t0 - look, t1 + look), rxAtStart = speed(A, b, t0 - look) < 0, open = rxAtStart ? null : undefined;
      st.forEach(function (s) {
        if (s.retro) open = s.at;
        else if (open !== undefined) { out.push({ planet: b, start: open, end: s.at }); open = undefined; }
      });
      if (open !== undefined) out.push({ planet: b, start: open, end: null });
    });
    return out.filter(function (p) { return (p.end == null || p.end > t0) && (p.start == null || p.start < t1); })
      .map(function (p) { p.text = RETRO_TEXT[p.planet]; p.glyph = GLYPH[p.planet]; return p; })
      .sort(function (a, b) { return (a.start || 0) - (b.start || 0); });
  }
  function eclipses(A, start, days, P) {
    P = P || PROFILE; var t0 = ms(start), t1 = t0 + days * DAY, out = [], g = 0;
    var le = A.SearchLunarEclipse(A.MakeTime(new Date(t0)));
    while (le && le.peak.date.getTime() <= t1 && g++ < 20) { var t = le.peak.date.getTime(), l = lon(A, 'Moon', t); out.push({ at: t, of: 'lunar', type: le.kind, lon: l, sign: signName(l), house: houseOf(l, P.cusps), emoji: '🌖' }); le = A.NextLunarEclipse(le.peak); }
    var se = A.SearchGlobalSolarEclipse(A.MakeTime(new Date(t0))); g = 0;
    while (se && se.peak.date.getTime() <= t1 && g++ < 20) { var t2 = se.peak.date.getTime(), l2 = lon(A, 'Sun', t2); out.push({ at: t2, of: 'solar', type: se.kind, lon: l2, sign: signName(l2), house: houseOf(l2, P.cusps), emoji: '🌒' }); se = A.NextGlobalSolarEclipse(se.peak); }
    return out.sort(function (a, b) { return a.at - b.at; });
  }
  function lunations(A, start, days, P) {
    P = P || PROFILE; var t0 = ms(start), t1 = t0 + days * DAY, out = [], g = 0;
    var q = A.SearchMoonQuarter(A.MakeTime(new Date(t0)));
    while (q && q.time.date.getTime() <= t1 && g++ < 200) {
      if (q.quarter === 0 || q.quarter === 2) { var t = q.time.date.getTime(), l = lon(A, 'Moon', t), h = houseOf(l, P.cusps); out.push({ at: t, kind: q.quarter === 0 ? 'new' : 'full', lon: l, sign: signName(l), house: h, houseName: HOUSE_NAME[h], theme: HOUSE_THEME[h], money: MONEY_HOUSES.indexOf(h) >= 0 }); }
      q = A.NextMoonQuarter(q);
    }
    return out;
  }
  var HOUSE_STEP = { Sun: 1, Mercury: 1, Venus: 1, Mars: 1, Jupiter: 3, Saturn: 4 };
  function houseChanges(A, P, body, t0, t1, step) {
    P = P || PROFILE; var s = (step || HOUSE_STEP[body] || 1) * DAY, out = [], prev = houseOf(lon(A, body, t0), P.cusps);
    for (var t = t0 + s; t <= t1; t += s) {
      var h = houseOf(lon(A, body, t), P.cusps);
      if (h !== prev) { var p0 = prev; var at = bisectFlip(function (x) { return houseOf(lon(A, body, x), P.cusps) === p0; }, t - s, t, 30 * MINUTE); out.push({ planet: body, at: at, from: p0, house: h, houseName: HOUSE_NAME[h], theme: HOUSE_THEME[h], money: MONEY_HOUSES.indexOf(h) >= 0, rx: speed(A, body, at) < 0 }); prev = h; }
    }
    return out;
  }
  function houseSince(A, P, body, t, maxDays) {
    var h = houseOf(lon(A, body, t), P.cusps), s = (HOUSE_STEP[body] || 1) * DAY;
    for (var x = t - s; x >= t - maxDays * DAY; x -= s) {
      if (houseOf(lon(A, body, x), P.cusps) !== h) return bisectFlip(function (y) { return houseOf(lon(A, body, y), P.cusps) === h; }, x, x + s, 30 * MINUTE);
    }
    return null;
  }
  function keyDates(A, P, start, days) {
    P = P || PROFILE; var t0 = ms(start), t1 = t0 + days * DAY, out = [];
    retroPeriods(A, t0, days).forEach(function (r) {
      if (r.start != null && r.start >= t0) out.push({ at: r.start, kind: 'retro', emoji: '↺', title: r.planet + ' turns retrograde', text: r.text, money: r.planet === 'Mercury' || r.planet === 'Venus' });
      if (r.end != null && r.end <= t1) out.push({ at: r.end, kind: 'direct', emoji: '→', title: r.planet + ' turns direct', text: 'Forward motion returns for ' + PLANET_MOVE[r.planet] + '. Give it a few days before big moves.', money: r.planet === 'Mercury' || r.planet === 'Venus' });
    });
    eclipses(A, t0, days, P).forEach(function (e) { out.push({ at: e.at, kind: 'eclipse', emoji: e.emoji, title: (e.type.charAt(0).toUpperCase() + e.type.slice(1)) + ' ' + e.of + ' eclipse in ' + e.sign, text: 'Lands in your ' + ordinal(e.house) + ' house (' + HOUSE_NAME[e.house] + '): ' + HOUSE_THEME[e.house] + '. Avoid signing or launching within a day of it; let news settle.', money: true }); });
    lunations(A, t0, days, P).forEach(function (l) { out.push({ at: l.at, kind: l.kind, emoji: l.kind === 'new' ? '🌑' : '🌕', title: (l.kind === 'new' ? 'New Moon' : 'Full Moon') + ' in ' + l.sign, text: (l.kind === 'new' ? 'Set money intentions for ' : 'Harvest and review ') + HOUSE_THEME[l.house] + ' (your ' + ordinal(l.house) + ' house).', money: l.money }); });
    ['Sun', 'Venus', 'Mars', 'Jupiter', 'Saturn'].forEach(function (b) {
      houseChanges(A, P, b, t0, t1).forEach(function (c) {
        if (!c.money && b !== 'Jupiter' && b !== 'Saturn') return;
        out.push({ at: c.at, kind: 'house', emoji: GLYPH[b], title: b + ' enters your ' + ordinal(c.house) + ' house (' + c.houseName + ')' + (c.rx ? ', moving back' : ''), text: PLANET_MOVE[b].charAt(0).toUpperCase() + PLANET_MOVE[b].slice(1) + ' for ' + c.theme + '.', money: c.money });
      });
    });
    return out.sort(function (a, b) { return a.at - b.at; });
  }
  var CYCLE_TEXT = {
    Jupiter: { 2: 'Jupiter in your income house is the classic money-growth year: raise prices, add streams, ask for more.', 10: 'Jupiter at the top of your chart: career peak, recognition, the business gets seen.', 8: 'Jupiter in shared money: investors, partnerships, payouts and credit open up.', 6: 'Jupiter in daily work: more clients and more work; hire help and build systems.' },
    Saturn: { 2: 'Saturn in your income house: tighten budgets, build savings, earn slowly and keep it.', 10: 'Saturn at the top: hard-earned authority. What you build now carries your name for years.', 8: 'Saturn in shared money: pay down debt, sort taxes and contracts.', 6: 'Saturn in daily work: heavy workload, fix your systems and health habits.' }
  };
  function bigCycles(A, P, when, years) {
    P = P || PROFILE; var t = ms(when || Date.now());
    return ['Jupiter', 'Saturn'].map(function (b) {
      var h = houseOf(lon(A, b, t), P.cusps), changes = houseChanges(A, P, b, t, t + (years || (b === 'Jupiter' ? 13 : 15)) * 365.25 * DAY);
      var next = {}; changes.forEach(function (c) { if (!next[c.house] && c.house !== h && !c.rx) next[c.house] = c.at; });
      return { planet: b, glyph: GLYPH[b], house: h, houseName: HOUSE_NAME[h], theme: HOUSE_THEME[h], since: houseSince(A, P, b, t, b === 'Jupiter' ? 500 : 1100), now: CYCLE_TEXT[b][h] || null,
        upcoming: changes.slice(0, 4), nextMoney: MONEY_HOUSES.map(function (mh) { return { house: mh, houseName: HOUSE_NAME[mh], at: mh === h ? null : next[mh] || null, now: mh === h, text: CYCLE_TEXT[b][mh] }; }) };
    });
  }

  // ── Planetary hours ──────────────────────────────────────────────────
  var CHALDEAN = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'];
  var DAY_RULER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  var HOUR_USE = { Jupiter: 'Pitches, asking for more, growth moves', Venus: 'Sales, pricing, offers, client care', Mercury: 'Contracts, emails, negotiating', Sun: 'Visibility, posting, leadership', Saturn: 'Books, budgets, hard decisions', Mars: 'Pushing through tasks; avoid impulse buys', Moon: 'Customer feelings, small tasks' };
  function planetaryHours(A, lat, lng, dayStart) {
    var obs = new A.Observer(lat, lng, 0), t = ms(dayStart);
    var rise = A.SearchRiseSet(A.Body.Sun, obs, +1, A.MakeTime(new Date(t)), 1.5); if (!rise) return null;
    var set = A.SearchRiseSet(A.Body.Sun, obs, -1, rise, 1); if (!set) return null;
    var rise2 = A.SearchRiseSet(A.Body.Sun, obs, +1, set, 1); if (!rise2) return null;
    var r = rise.date.getTime(), s = set.date.getTime(), r2 = rise2.date.getTime();
    var ruler = DAY_RULER[new Date(r).getDay()], i0 = CHALDEAN.indexOf(ruler), hours = [];
    for (var k = 0; k < 24; k++) {
      var dayPart = k < 12, len = dayPart ? (s - r) / 12 : (r2 - s) / 12, st = dayPart ? r + k * len : s + (k - 12) * len, pl = CHALDEAN[(i0 + k) % 7];
      hours.push({ n: k, start: st, end: st + len, ruler: pl, glyph: GLYPH[pl], day: dayPart, use: HOUR_USE[pl] });
    }
    return { sunrise: r, sunset: s, dayRuler: ruler, hours: hours };
  }

  // ── Scoring days for money moves ─────────────────────────────────────
  var PURPOSES = [
    { key: 'launch', label: 'Launch or announce', emoji: '🚀', hint: 'a new offer, a campaign, a price change' },
    { key: 'ask', label: 'Sell and ask', emoji: '💬', hint: 'sales calls, pitches, asking for money, invoices' },
    { key: 'sign', label: 'Sign a deal', emoji: '🖋️', hint: 'contracts, partnerships, agreements' },
    { key: 'spend', label: 'Spend or invest', emoji: '🛒', hint: 'big purchases, hiring, new tools' },
    { key: 'review', label: 'Books and cuts', emoji: '📒', hint: 'budget, cancel what drains, collect, taxes' }
  ];
  var PHASE_PTS = {
    launch: { 'new': 1.5, wax1: 2, wax2: 1.5, full: 0, wane1: -1, wane2: -1.5, dark: -2 },
    ask:    { 'new': 0.5, wax1: 1.5, wax2: 2, full: 1.5, wane1: 0, wane2: -0.5, dark: -1 },
    sign:   { 'new': 1, wax1: 1.5, wax2: 1, full: 0, wane1: -0.5, wane2: -1, dark: -1.5 },
    spend:  { 'new': 0.5, wax1: 1, wax2: 0.5, full: -0.5, wane1: 0, wane2: 0, dark: -1 },
    review: { 'new': 0, wax1: -0.5, wax2: -0.5, full: 0.5, wane1: 1.5, wane2: 2, dark: 1.5 }
  };
  var BAND_NAME = { 'new': 'New Moon', wax1: 'waxing Moon', wax2: 'waxing Moon, nearly full', full: 'Full Moon', wane1: 'waning Moon', wane2: 'waning Moon', dark: 'dark Moon' };
  var BAND_WHY = { launch: { up: 'new things get carried forward', down: 'better for finishing than starting' }, ask: { up: 'people say yes more easily while the light builds', down: 'asks land softer as the light fades' }, sign: { up: 'good for new agreements', down: 'weak for new agreements' }, spend: { up: 'good for investing in growth', down: 'a poor time to buy big' }, review: { up: 'good for cutting, clearing and collecting', down: 'better for building than cutting' } };
  var ELEMENT_PTS = { Fire: { launch: 1, ask: 0.5 }, Earth: { sign: 1, spend: 1, review: 1, ask: 0.5 }, Air: { ask: 1, sign: 0.5 }, Water: { review: 0.5 } };
  var ELEMENT_WHY = { Fire: 'bold and visible', Earth: 'practical and money-minded', Air: 'talkative and social', Water: 'inward and intuitive' };
  var RETRO_PTS = { Mercury: { sign: -2.5, launch: -1.5, spend: -1, review: 1 }, Venus: { spend: -1.5, launch: -1, ask: -0.5, review: 0.5 }, Mars: { launch: -0.5 } };
  var VOC_PTS = { sign: -2, launch: -1.5, spend: -1, ask: -0.5 };
  var ECLIPSE_PTS = { sign: -2, launch: -2, spend: -1, ask: -0.5 };
  var NUM_PTS = { 1: { launch: 1 }, 2: { sign: 0.5 }, 3: { launch: 0.5, ask: 0.5 }, 4: { review: 1, sign: 0.5 }, 5: { sign: -0.5, launch: 0.5 }, 6: { ask: 0.5, spend: 0.5 }, 7: { ask: -0.5, review: 0.5 }, 8: { ask: 1, sign: 1, spend: 0.5 }, 9: { review: 1, launch: -0.5 }, 11: { launch: 0.5 }, 22: { launch: 1, sign: 0.5 }, 33: { ask: 0.5 } };
  var WEEKDAY_PTS = { 3: { sign: 0.5 }, 4: { launch: 0.5, ask: 0.5 }, 5: { ask: 0.5, spend: 0.5 }, 6: { review: 0.5, launch: -0.5 } };
  var WEEKDAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday (Jupiter’s day)', 'Friday (Venus’s day)', 'Saturday (Saturn’s day)'];
  var EASY_MOVERS = [{ planet: 'Venus', orb: 2 }, { planet: 'Jupiter', orb: 1.5 }];
  var HARD_MOVERS = [{ planet: 'Saturn', orb: 1.5 }, { planet: 'Mars', orb: 2 }, { planet: 'Pluto', orb: 1 }];

  function band(p0, p1, pm) {
    if (p1 < p0) return 'new';
    if (p0 < 180 && p1 >= 180) return 'full';
    if (pm >= 336) return 'dark';
    if (pm < 90) return 'wax1'; if (pm < 180) return 'wax2'; if (pm < 270) return 'wane1'; return 'wane2';
  }
  function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

  /* One local day. ctx carries the windows worked out once for the whole
     range: { vocs: [...], eclipses: [...] }. */
  function dayFacts(A, P, dayStart, dayEnd, ctx) {
    P = P || PROFILE; ctx = ctx || {};
    var s = ms(dayStart), e = ms(dayEnd), mid = s + (e - s) / 2, w0 = s + 9 * HOUR, w1 = s + 17 * HOUR;
    var p0 = moonPhase(A, s), p1 = moonPhase(A, e), pm = moonPhase(A, mid), ml = lon(A, 'Moon', mid);
    var vocMs = 0, vocs = (ctx.vocs || []).filter(function (v) { return v.end > s && v.start < e; });
    vocs.forEach(function (v) { vocMs += overlap(w0, w1, v.start, v.end); });
    var rx = {}; ['Mercury', 'Venus', 'Mars'].forEach(function (b) { rx[b] = speed(A, b, mid) < 0; });
    var stations = ['Mercury', 'Venus'].filter(function (b) { return (speed(A, b, s) < 0) !== (speed(A, b, e) < 0); });
    var ecl = (ctx.eclipses || []).filter(function (x) { return x.at >= s - DAY && x.at < e + DAY; });
    var d = new Date(mid);
    return {
      key: dateKey(mid), start: s, end: e, weekday: d.getDay(), phase: round1(pm), band: band(p0, p1, pm),
      moonSign: signName(ml), moonElement: ELEMENT[signIndex(ml) % 4], moonHouse: houseOf(ml, P.cusps),
      vocShare: round1(vocMs / (8 * HOUR)), vocs: vocs, rx: rx, stations: stations, eclipse: ecl.length ? ecl[0] : null,
      easy: transitsAt(A, P, mid, EASY_MOVERS).filter(function (x) { return x.tone === 'easy'; }),
      hard: transitsAt(A, P, mid, HARD_MOVERS).filter(function (x) { return x.tone === 'hard'; }),
      pd: personalDay(P, d.getFullYear(), d.getMonth() + 1, d.getDate())
    };
  }

  function scoreDay(f, purpose) {
    var key = purpose && purpose.key || purpose, score = 0, reasons = [];
    function add(delta, text, kind) { if (!delta) return; score += delta; reasons.push({ delta: delta, text: text, kind: kind }); }
    var bp = PHASE_PTS[key][f.band];
    add(bp, (f.band === 'new' || f.band === 'full' ? 'The ' : 'A ') + BAND_NAME[f.band] + ': ' + BAND_WHY[key][bp > 0 ? 'up' : 'down'] + '.', 'moon');
    var ep = (ELEMENT_PTS[f.moonElement] || {})[key];
    if (ep) add(ep, 'Moon in ' + f.moonSign + ' (' + f.moonElement.toLowerCase() + '): ' + ELEMENT_WHY[f.moonElement] + ' energy.', 'moon');
    if (f.moonHouse === 2 || f.moonHouse === 10) { if (key === 'ask' || key === 'launch') add(0.5, 'The Moon is in your ' + ordinal(f.moonHouse) + ' house (' + HOUSE_NAME[f.moonHouse] + '): money is on your mind and on others’.', 'moon'); }
    if (f.vocShare > 0 && VOC_PTS[key]) add(round1(VOC_PTS[key] * Math.min(1, f.vocShare * 1.25)), 'The Moon is void of course for ' + Math.round(f.vocShare * 100) + '% of the working day: things started then tend to go nowhere.', 'voc');
    Object.keys(RETRO_PTS).forEach(function (b) { if (f.rx[b] && RETRO_PTS[b][key]) add(RETRO_PTS[b][key], b + ' is retrograde: ' + (RETRO_PTS[b][key] > 0 ? 'good for redoing and reviewing.' : 'expect delays and do-overs.'), 'retro'); });
    if (f.stations.length && (key === 'sign' || key === 'launch')) add(-1, f.stations.join(' and ') + ' changes direction today: hold big commitments.', 'retro');
    if (f.eclipse && ECLIPSE_PTS[key]) add(ECLIPSE_PTS[key], 'Within a day of the ' + f.eclipse.of + ' eclipse: let the dust settle.', 'eclipse');
    var easy = 0; f.easy.forEach(function (a) { if (easy >= 2 || key === 'review') return; easy += 1; add(1, a.title + ' (within ' + a.orb + '°): ' + a.text, 'transit'); });
    var hard = 0; f.hard.forEach(function (a) { if (hard <= -2 || (key !== 'spend' && key !== 'launch' && key !== 'sign')) return; hard -= 1; add(-1, a.title + ' (within ' + a.orb + '°): ' + a.text, 'transit'); });
    var np = (NUM_PTS[f.pd] || {})[key];
    if (np) add(np, 'Personal day ' + f.pd + ' (' + NUM_MONEY[f.pd].name.toLowerCase() + '): ' + NUM_MONEY[f.pd].day, 'number');
    var wp = (WEEKDAY_PTS[f.weekday] || {})[key];
    if (wp) add(wp, WEEKDAY_NAME[f.weekday] + '.', 'weekday');
    reasons.sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    score = round1(score);
    return { score: score, grade: score >= 3 ? 'Strong' : score >= 1.5 ? 'Good' : score > -1 ? 'Neutral' : 'Wait', reasons: reasons };
  }

  function scoreAll(f) {
    var scores = {}; PURPOSES.forEach(function (p) { scores[p.key] = scoreDay(f, p.key); });
    var best = PURPOSES.slice().sort(function (a, b) { return scores[b.key].score - scores[a.key].score; })[0];
    return { scores: scores, best: best.key };
  }

  function localDays(start, n) {
    var d0 = new Date(ms(start)); d0.setHours(0, 0, 0, 0); var out = [];
    for (var i = 0; i < n; i++) { var a = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i), b = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i + 1); out.push({ start: a.getTime(), end: b.getTime() }); }
    return out;
  }
  function rangeContext(A, P, t0, t1) { return { vocs: vocWindows(A, t0, t1), eclipses: eclipses(A, t0 - 2 * DAY, (t1 - t0) / DAY + 4, P) }; }
  function calendar(A, P, start, n) {
    var days = localDays(start, n), ctx = rangeContext(A, P, days[0].start, days[n - 1].end);
    return days.map(function (d) { var f = dayFacts(A, P, d.start, d.end, ctx); var s = scoreAll(f); f.scores = s.scores; f.best = s.best; return f; });
  }
  function rankFor(days, purpose, nBest, nAvoid) {
    var key = purpose && purpose.key || purpose;
    var list = days.map(function (d) { return { day: d, s: d.scores[key] }; });
    var best = list.slice().sort(function (a, b) { return (b.s.score - a.s.score) || (a.day.start - b.day.start); }).slice(0, nBest || 5);
    var taken = {}; best.forEach(function (x) { taken[x.day.key] = 1; });
    var avoid = list.filter(function (x) { return !taken[x.day.key] && x.s.score < 0; }).sort(function (a, b) { return (a.s.score - b.s.score) || (a.day.start - b.day.start); }).slice(0, nAvoid || 3);
    return { best: best, avoid: avoid };
  }

  var RULES = [
    { emoji: '🌙', title: 'The Moon’s phase', text: 'A growing Moon lifts launches, deals and asks; a waning Moon lifts the books, cutting costs and collecting. The dark Moon before a new one is for planning, not starting.' },
    { emoji: '♉︎', title: 'The Moon’s sign', text: 'Earth signs (Taurus, Virgo, Capricorn) lift money, deals and anything meant to last. Fire lifts launches; air lifts selling and talking.' },
    { emoji: '⏸', title: 'Void-of-course Moon', text: 'From the Moon’s last major aspect until it changes sign. Things started then tend to go nowhere, so it counts against signing and launching during 9 to 5.' },
    { emoji: '↺', title: 'Retrogrades', text: 'Mercury retrograde counts hard against signing and launching, and lifts reviewing. Venus retrograde counts against big spending and price changes.' },
    { emoji: '🍀', title: 'Venus and Jupiter', text: 'A conjunction, sextile or trine to your Sun, Moon, Venus, Jupiter, Midheaven, Part of Fortune or your 2nd or 8th house cusp lifts asks, launches and deals.' },
    { emoji: '🪐', title: 'Saturn, Mars and Pluto', text: 'Hard angles to those same points count against spending, launching and signing.' },
    { emoji: '🌒', title: 'Eclipses', text: 'Within a day of an eclipse counts against signing and launching.' },
    { emoji: '8', title: 'Your personal day', text: 'Numerology: an 8 day is a money day (ask, sign), a 1 day starts things, a 4 day is for the books, a 9 day clears out.' },
    { emoji: '📅', title: 'Weekday rulers', text: 'Thursday is Jupiter’s day, Friday is Venus’s, Wednesday is Mercury’s, Saturday is Saturn’s.' }
  ];

  var api = {
    version: 1, PROFILE: PROFILE, SIGNS: SIGNS, SIGN_GLYPH: SIGN_GLYPH, GLYPH: GLYPH, PURPOSES: PURPOSES, RULES: RULES, HOUSE_NAME: HOUSE_NAME, HOUSE_THEME: HOUSE_THEME, MONEY_HOUSES: MONEY_HOUSES, NUM_MONEY: NUM_MONEY,
    util: { norm360: norm360, norm180: norm180, signName: signName, fmtPos: fmtPos, houseOf: houseOf, ordinal: ordinal, dateKey: dateKey, reduceNum: reduceNum, localDays: localDays },
    lon: lon, speed: speed, phaseInfo: phaseInfo,
    moneyMap: moneyMap, moneyPoints: moneyPoints, numbers: numbers, lifePath: lifePath, personalYear: personalYear, personalMonth: personalMonth, personalDay: personalDay, nameNumber: nameNumber,
    matrix: matrix, humanDesign: humanDesign,
    skyNow: skyNow, transitsAt: transitsAt, vocWindows: vocWindows, moonIngresses: moonIngresses,
    retroPeriods: retroPeriods, eclipses: eclipses, lunations: lunations, houseChanges: houseChanges, keyDates: keyDates, bigCycles: bigCycles,
    planetaryHours: planetaryHours, dayFacts: dayFacts, scoreDay: scoreDay, scoreAll: scoreAll, rangeContext: rangeContext, calendar: calendar, rankFor: rankFor
  };
  if (typeof window !== 'undefined') window.moneySky = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
