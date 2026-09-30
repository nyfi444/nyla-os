/* ── Cosmic > Timing ───────────────────────────────────────────────────
   What the sky is doing next, and the kindest days for what matters.

   The sky ahead   The next 60 days in her local time: moons, eclipses, planets
                   turning retrograde or direct, planets changing sign, transits
                   to her chart with the moment each is exact, and the Human
                   Design gate the Sun is lighting up. Every row can go on her
                   calendar (nylaos_events, in the calendar's own shape, plus a
                   skyId so the same event is never added twice).
   Best days for   The next 45 days scored for one of eight purposes, with the
                   reasons in plain words, a month view she can tap, the five
                   best days and the two to skip.

   The sums live in js/cosmic-timing-core.js (window.nylaSky) and every date
   comes from astronomy-engine, loaded with the app's own loadAstronomy(). Her
   placements are read from NATAL, never retyped. The work runs after first
   paint in short slices, and the result is kept for the day.

   Storage (device-local, so none of it syncs)
     nyla_sky_cache     { v, day, tz, natal, timeline, retro, nextEclipse, facts }
     nyla_sky_tab       'ahead' | 'best'
     nyla_sky_purpose   one of the purpose keys
     nyla_sky_filter    the timeline filter
   Reads nylaos_periods through the app's own cycle helpers, only to score days.
   Nothing on this page is sent anywhere.

   Loads before the main app script: top level must not touch app globals.
   Every top-level name here is prefixed ct_ / Ct, except CosmicTiming. */

const ct_CACHE_KEY = 'nyla_sky_cache';
const ct_CACHE_VERSION = 1;
const ct_DAYS_AHEAD = 60;
const ct_DAYS_SCORED = 45;
const ct_DAY_MS = 86400000;

const ct_lsGet = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
const ct_lsSet = (key, val) => { try { localStorage.setItem(key, val); return true; } catch (e) { return false; } };
const ct_dk = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ct_keyDate = k => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d); };
const ct_dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ct_daysBetween = (a, b) => Math.round((ct_dayStart(b) - ct_dayStart(a)) / ct_DAY_MS);
const ct_lower = s => { const t = String(s || ''); return t.charAt(0).toLowerCase() + t.slice(1); };
const ct_ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

const ct_time = d => { try { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
const ct_date = d => { try { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) { return ct_dk(d); } };
const ct_dateLong = d => { try { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) { return ct_dk(d); } };
const ct_dateShort = d => { try { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) { return ct_dk(d); } };
const ct_zone = () => { try { return new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop(); } catch (e) { return ''; } };
const ct_rel = (d, now) => {
  const n = ct_daysBetween(now, d);
  if (n === 0) return d < now ? 'earlier today' : 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
};

// Her placements, from the app's own chart.
const ct_natal = () => {
  try {
    const p = name => { const x = NATAL.planets.find(q => q.name === name); return x && isFinite(x.lon) ? x.lon : null; };
    return { Sun: p('Sun'), Moon: p('Moon'), ASC: isFinite(NATAL.asc) ? NATAL.asc : null, Mercury: p('Mercury'), Venus: p('Venus'), Mars: p('Mars'), MC: isFinite(NATAL.mc) ? NATAL.mc : null };
  } catch (e) { return null; }
};
const ct_natalSig = natal => natal ? Object.keys(natal).map(k => k + ':' + natal[k]).join('|') : 'none';

// Keeps only the rows that are whole: a saved result with an odd row loses that row, never the page.
const ct_clean = c => {
  const str = v => typeof v === 'string' && v.length > 0;
  return {
    ...c,
    timeline: (Array.isArray(c.timeline) ? c.timeline : []).filter(e => e && str(e.id) && str(e.kind) && str(e.title) && str(e.emoji) && str(e.when) && isFinite(Date.parse(e.when))),
    retro: (Array.isArray(c.retro) ? c.retro : []).filter(r => r && str(r.planet)),
    facts: (Array.isArray(c.facts) ? c.facts : []).filter(f => f && /^\d{4}-\d{2}-\d{2}$/.test(f.key) && f.facts && typeof f.facts === 'object' && isFinite(f.facts.phase)),
    nextEclipse: c.nextEclipse && str(c.nextEclipse.title) && str(c.nextEclipse.when) ? c.nextEclipse : null,
  };
};
const ct_readCache = (day, sig) => {
  try {
    const c = JSON.parse(ct_lsGet(ct_CACHE_KEY) || 'null');
    if (!c || typeof c !== 'object' || c.v !== ct_CACHE_VERSION || c.day !== day || c.tz !== new Date().getTimezoneOffset() || c.natal !== sig) return null;
    const clean = ct_clean(c);
    return clean.facts.length ? clean : null;
  } catch (e) { return null; }
};

/* The sums, a slice at a time. Each job is small; between slices the page gets
   to paint and answer taps. alive() goes false when she leaves the page. */
const ct_compute = (A, natal, onStep, alive) => new Promise((resolve, reject) => {
  const sky = window.nylaSky;
  const now = new Date(), start = ct_dayStart(now);
  const out = { v: ct_CACHE_VERSION, day: ct_dk(now), tz: now.getTimezoneOffset(), natal: ct_natalSig(natal), made: now.toISOString(), timeline: [], retro: [], nextEclipse: null, facts: [] };
  const jobs = [];
  const add = (label, fn) => jobs.push({ label, fn });
  add('the Moon', () => out.timeline.push(...sky.moonEvents(A, start, ct_DAYS_AHEAD)));
  add('eclipses', () => { out.timeline.push(...sky.eclipses(A, start, ct_DAYS_AHEAD)); out.nextEclipse = sky.nextEclipse(A, start); });
  sky.STATION_BODIES.forEach(b => add(b, () => out.timeline.push(...sky.stationsFor(A, start, ct_DAYS_AHEAD, b))));
  sky.RETRO_BODIES.forEach(b => add(b, () => out.retro.push(sky.retrogradeFor(A, now, b))));
  sky.INGRESS_BODIES.forEach(b => add(b === 'Sun' ? 'the Sun' : b, () => out.timeline.push(...sky.ingressesFor(A, start, ct_DAYS_AHEAD, b))));
  sky.TRANSIT_BODIES.forEach(b => add('your chart', () => out.timeline.push(...sky.transitsFor(A, start, ct_DAYS_AHEAD, natal, b))));
  add('your gates', () => out.timeline.push(...sky.sunGates(A, start, ct_DAYS_AHEAD)));
  for (let i = 0; i < ct_DAYS_SCORED; i++) add('your best days', () => {
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const e = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i + 1);
    out.facts.push({ key: ct_dk(s), facts: sky.dayFacts(A, s, e, natal) });
  });
  let i = 0;
  const clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const run = () => {
    if (!alive()) return;
    const t0 = clock();
    try { while (i < jobs.length && clock() - t0 < 10) { jobs[i].fn(); i++; } }
    catch (e) { reject(e); return; }
    if (i < jobs.length) { onStep(i / jobs.length, jobs[i].label); setTimeout(run, 0); return; }
    out.timeline.sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0));
    out.timeline.filter(e => e.kind === 'eclipse').forEach(e => {
      const hit = out.facts.find(f => f.key === ct_dk(new Date(e.when)));
      if (hit) hit.facts.eclipse = e.of;
    });
    resolve(ct_clean(out));
  };
  setTimeout(run, 40);
});

// ── Words ──────────────────────────────────────────────────────────────
const ct_SIGN_THEME = {
  Aries: 'courage and fresh starts', Taurus: 'comfort, money and your body', Gemini: 'words, learning and curiosity',
  Cancer: 'home, family and feeling safe', Leo: 'joy, romance and being seen', Virgo: 'health, habits and the details',
  Libra: 'relationships, beauty and balance', Scorpio: 'intimacy, trust and deep change', Sagittarius: 'travel, truth and big plans',
  Capricorn: 'career, discipline and long goals', Aquarius: 'friends, community and the future', Pisces: 'rest, dreams and your spirit',
};
const ct_STATION_WORDS = {
  retrograde: {
    Mercury: 'Reread, back up and confirm plans. Good for revisiting, not for signing or launching.',
    Venus: 'Review love, money and your look. Hold off on big beauty changes and big purchases.',
    Mars: 'Energy turns inward. Rework the plan before you push.',
    Jupiter: 'Growth turns inward. Good for study and rethinking what you believe.',
    Saturn: 'Review your commitments. Good for fixing structure, not adding more.',
  },
  direct: {
    Mercury: 'Messages and plans start moving again. Give it a few days, then sign and launch.',
    Venus: 'Clarity returns in love and money. Good for beauty changes and treats again.',
    Mars: 'Drive returns. Good for acting on the plan you reworked.',
    Jupiter: 'Luck moves forward again. Good for saying yes to bigger things.',
    Saturn: 'Steady progress returns. Good for building and long commitments.',
  },
};
const ct_INGRESS_WORDS = {
  Sun: t => `A new season for about a month. The focus turns to ${t}.`,
  Mercury: t => `Thoughts and conversations turn to ${t}.`,
  Venus: t => `Love, money and taste lean toward ${t}.`,
  Mars: t => `Drive and effort go into ${t}.`,
};
const ct_TONE_WORDS = { easy: 'Good for saying yes.', hard: 'Go slowly and be kind to yourself.', blend: 'A fresh chapter opens here.' };

// Which house of her chart a point in the sky falls in, and any natal point it sits on.
const ct_personal = ev => {
  const bits = [];
  try {
    if (isFinite(ev.lon) && typeof houseOf === 'function') {
      const h = houseOf(ev.lon);
      if (HOUSE_MEANING[h]) bits.push(`It lands in your ${ct_ordinal(h)} house of ${ct_lower(HOUSE_MEANING[h]).replace(/ & /g, ' and ')}.`);
      const natal = ct_natal() || {};
      const hit = Object.keys(natal).find(k => natal[k] != null && Math.abs(((ev.lon - natal[k] + 540) % 360) - 180) <= 3);
      if (hit) bits.push(`It sits right on your natal ${window.nylaSky.POINT_LABEL[hit]}, so this one is personal.`);
    }
  } catch (e) {}
  return bits.join(' ');
};

// Her gates, and the gate that would complete a channel with one she carries.
const ct_gateInfo = gate => {
  const info = { name: '', mine: false, channel: null };
  try {
    info.name = HD_GATE_NAMES[gate] || '';
    info.mine = HD.all.has(gate);
    if (!info.mine) {
      const ch = HD_CHANNELS.find(([a, b]) => (a === gate && HD.all.has(b)) || (b === gate && HD.all.has(a)));
      if (ch) info.channel = { partner: ch[0] === gate ? ch[1] : ch[0], name: ch[2] };
    }
  } catch (e) {}
  return info;
};

// One line on what each moment is good for.
const ct_goodFor = ev => {
  try {
    const theme = ct_SIGN_THEME[ev.sign] || 'what matters to you';
    if (ev.kind === 'moon') {
      const line = ev.phase === 'new' ? `Plant a seed. Set one intention around ${theme}.`
        : ev.phase === 'full' ? `Something ripens. Celebrate or release what has built up around ${theme}.`
        : ev.phase === 'first' ? 'A push point. Take one brave step on what you began at the new Moon.'
        : 'Edit and tidy. Let one thing go before the next new Moon.';
      const mine = (ev.phase === 'new' || ev.phase === 'full') ? ct_personal(ev) : '';
      return mine ? `${line} ${mine}` : line;
    }
    if (ev.kind === 'eclipse') {
      const line = ev.of === 'solar'
        ? `A new Moon with extra force. A door opens around ${theme}. Let it come to you.`
        : `A full Moon with extra force. Something ends or comes to light around ${theme}. Rest more than usual.`;
      const mine = ct_personal(ev);
      return mine ? `${line} ${mine}` : line;
    }
    if (ev.kind === 'station') return (ct_STATION_WORDS[ev.turns] || {})[ev.planet] || 'A turning point. Slow down and notice what shifts.';
    if (ev.kind === 'ingress') {
      const line = (ct_INGRESS_WORDS[ev.planet] || (t => `The focus turns to ${t}.`))(theme);
      return ev.backwards ? `A second look. ${line}` : line;
    }
    if (ev.kind === 'transit') {
      const parts = [];
      if (typeof TRANSIT_PLANET_THEME !== 'undefined' && TRANSIT_PLANET_THEME[ev.planet] && ASPECT_VERB[ev.aspect] && NATAL_POINT_THEME[ev.point])
        parts.push(`${ev.planet} brings ${TRANSIT_PLANET_THEME[ev.planet]} and ${ASPECT_VERB[ev.aspect]} ${NATAL_POINT_THEME[ev.point]}.`);
      parts.push(ct_TONE_WORDS[ev.tone] || '');
      if (ev.retrograde) parts.push('The planet is retrograde, so an older theme may come back around.');
      return parts.filter(Boolean).join(' ');
    }
    if (ev.kind === 'gate') {
      const g = ct_gateInfo(ev.gate);
      if (g.mine) return 'You carry this gate in your own design, so these six days feel like home.';
      if (g.channel) return `It meets your Gate ${g.channel.partner} and completes the channel of ${g.channel.name} for about six days.`;
      return 'A theme in the air for everyone, for about six days.';
    }
  } catch (e) {}
  return '';
};
const ct_gateTitle = ev => { const g = ct_gateInfo(ev.gate); return g.name ? `${ev.title}, ${g.name}` : ev.title; };
const ct_title = ev => (ev.kind === 'gate' ? ct_gateTitle(ev) : ev.title);

// ── Her calendar ───────────────────────────────────────────────────────
const ct_EVENT_COLOR = { moon: 'lavender', eclipse: 'berry', station: 'gold', ingress: 'sky', transit: 'rose', gate: 'sage', best: 'rose' };
// What is already on the calendar from this page: [{ skyId, at }].
const ct_readAdded = () => {
  try {
    const list = JSON.parse(ct_lsGet('nylaos_events') || '[]');
    if (!Array.isArray(list)) return [];
    return list.filter(e => e && e.skyId).map(e => ({ skyId: String(e.skyId), at: Date.parse(e.skyWhen || '') || (e.date ? ct_keyDate(e.date).getTime() : 0) }));
  } catch (e) { return []; }
};
const ct_isAdded = (added, skyId, whenMs, hours = 36) => added.some(a => a.skyId === skyId && Math.abs(a.at - whenMs) < hours * 3600000);
// Adds one event, keeping everything that is already there. Never writes over a list it could not read.
const ct_addEvent = ({ skyId, when, allDay, text, notes, color }) => {
  let list;
  try { list = JSON.parse(localStorage.getItem('nylaos_events') || '[]'); } catch (e) { list = null; }
  if (!Array.isArray(list)) { toast('Your calendar could not be read just now, so nothing was added.', 'error', 4000); return false; }
  const d = new Date(when);
  const event = {
    id: Date.now(), date: ct_dk(d), text,
    time: allDay ? null : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    endTime: null, location: '', color: color || 'rose', notes: notes || '', skyId, skyWhen: d.toISOString(),
  };
  try { localStorage.setItem('nylaos_events', JSON.stringify([...list, event])); }
  catch (e) { toast('Could not save that. Storage may be full.', 'error', 4000); return false; }
  toast(`On your calendar for ${ct_date(d)} ✨`, 'success', 2200);
  return true;
};
const ct_openCalendar = dateKey => { try { window._calendarFocus = dateKey; window._navigateTo('calendar', 'Monthly'); } catch (e) {} };

// ── Her cycle, for the scorer ──────────────────────────────────────────
const ct_cycles = keys => {
  const map = {};
  try {
    const periods = loadPeriods();
    if (!Array.isArray(periods) || !periods.length) return { has: false, map };
    const stats = cycleStats(periods), today = ct_dk(new Date());
    keys.forEach(k => {
      const c = getCycleForDate(ct_keyDate(k), periods, stats);
      if (!c || c.stale || !c.name) return;
      map[k] = { phase: c.name, day: c.day, estimate: k > today || !!c.predicted };
    });
    return { has: Object.keys(map).length > 0, map };
  } catch (e) { return { has: false, map: {} }; }
};

const ct_feel = score => score >= 4 ? { word: 'Glowing', stars: 5 } : score >= 3 ? { word: 'Bright', stars: 4 } : score >= 1.5 ? { word: 'Warm', stars: 3 }
  : score >= 0 ? { word: 'Gentle', stars: 2 } : score > -2 ? { word: 'Cloudy', stars: 1 } : { word: 'Stormy', stars: 0 };

// Which planets are retrograde at this moment, from the day's saved result.
const ct_retroNow = (data, now) => {
  const nowIso = now.toISOString(), out = [];
  (data.retro || []).forEach(r => { if (r && r.retrograde && (!r.until || r.until > nowIso)) out.push({ planet: r.planet, until: r.until }); });
  (data.timeline || []).forEach((e, i) => {
    if (e.kind !== 'station' || e.when > nowIso) return;
    const at = out.findIndex(r => r.planet === e.planet);
    if (e.turns === 'direct') { if (at >= 0) out.splice(at, 1); return; }
    if (at >= 0) return;
    const back = data.timeline.slice(i + 1).find(x => x.kind === 'station' && x.planet === e.planet && x.turns === 'direct');
    out.push({ planet: e.planet, until: back ? back.when : null });
  });
  return out;
};

// ── Pieces ─────────────────────────────────────────────────────────────
class CtBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e) { console.warn('Cosmic Timing failed to render', e); }
  render() { return this.state.failed ? (this.props.fallback || null) : this.props.children; }
}

const CtButton = ({ children, onClick, solid, quiet, disabled, style = {}, title }) => (
  <button onClick={onClick} disabled={disabled} title={title} style={{
    minHeight: 40, padding: '8px 16px', borderRadius: 20, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500,
    background: solid ? `linear-gradient(135deg, ${C.rose}, ${C.accent})` : quiet ? 'transparent' : `${C.pink}60`,
    color: solid ? '#fff' : C.rose, border: solid ? 'none' : `0.5px solid ${quiet ? 'transparent' : C.border}`,
    boxShadow: solid ? `0 4px 12px ${C.rose}35` : 'none', opacity: disabled ? .6 : 1, transition: 'all 0.15s', whiteSpace: 'normal', textAlign: 'center', ...style,
  }}>{children}</button>
);

const CtLabel = ({ children, style = {} }) => (
  <div style={{ fontSize: 10.5, color: C.textMuted, textTransform: 'uppercase', letterSpacing: .8, fontWeight: 700, ...style }}>{children}</div>
);

const CtShimmerBar = ({ w = '100%', h = 14, r = 8, style = {} }) => (
  <div style={{ width: w, height: h, borderRadius: r, maxWidth: '100%', background: `linear-gradient(90deg, ${C.pinkLight} 25%, ${C.lavLight} 50%, ${C.pinkLight} 75%)`, backgroundSize: '200% 100%', animation: 'shimmer 1.6s linear infinite', ...style }} />
);

const CtLoading = ({ progress, label }) => (
  <div aria-busy="true" aria-live="polite">
    <Card style={{ background: C.gradNight, border: 'none', marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: '#b495d6', fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', marginBottom: 8 }}>Reading the sky</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: '#E8D0F5', marginBottom: 6 }}>🔭 Looking at {label || 'the Moon'}…</div>
      <div style={{ fontSize: 12.5, color: '#cdb3e3', lineHeight: 1.6, marginBottom: 12 }}>Working out the next 60 days for your chart. This takes a moment, once a day.</div>
      <div style={{ height: 6, borderRadius: 6, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(6, Math.round((progress || 0) * 100))}%`, height: '100%', borderRadius: 6, background: 'linear-gradient(90deg,#d8a8e8,#f4b8cc)', transition: 'width .25s ease' }} />
      </div>
    </Card>
    {[0, 1, 2, 3].map(i => (
      <Card key={i} style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <CtShimmerBar w={44} h={44} r={14} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <CtShimmerBar w={`${70 - i * 8}%`} h={15} />
            <CtShimmerBar w={`${45 + i * 6}%`} h={11} style={{ marginTop: 8 }} />
          </div>
        </div>
      </Card>
    ))}
  </div>
);

const ct_STARS = [[8, 14], [22, 62], [37, 28], [55, 76], [68, 18], [81, 52], [93, 30], [47, 8]];

const CtHero = ({ data, now, isMobile, cycles, onPickPurpose }) => {
  const sky = window.nylaSky;
  const today = data.facts.find(f => f.key === ct_dk(now)) || data.facts[0];
  const f = today && today.facts;
  const moonSign = f ? sky.SIGNS[(f.moonChangeAt && now.toISOString() >= f.moonChangeAt) ? f.moonSignEnd : f.moonSignStart] : null;
  const retro = ct_retroNow(data, now);
  const nowIso = now.toISOString();
  const next = data.timeline.find(e => e.when > nowIso && e.kind !== 'gate');
  const lean = React.useMemo(() => {
    if (!f) return null;
    const scored = sky.PURPOSES.map(p => ({ p, score: sky.scoreDay(null, f, p.key, cycles.map[today.key] || null).score })).sort((a, b) => b.score - a.score);
    return scored[0];
  }, [today && today.key, cycles]);
  const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 20, fontSize: 12, color: '#f0e0f8', background: 'rgba(255,255,255,.1)', border: '0.5px solid rgba(255,255,255,.2)', maxWidth: '100%', boxSizing: 'border-box', textAlign: 'left', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' };
  return (
    <Card style={{ background: C.gradNight, border: 'none', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
      {ct_STARS.map(([x, y], i) => (
        <span key={i} aria-hidden="true" style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: 3, height: 3, borderRadius: '50%', background: '#fff', opacity: .4, animation: `acTwinkle ${3 + (i % 4)}s ease-in-out ${i * .4}s infinite`, pointerEvents: 'none' }} />
      ))}
      <div style={{ position: 'relative' }}>
        <div style={{ fontSize: 10, color: '#b495d6', fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', marginBottom: 8 }}>Right now</div>
        {f && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 44, lineHeight: 1 }} aria-hidden="true">{f.phaseEmoji}</div>
            <div style={{ minWidth: 0, flex: '1 1 200px' }}>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: isMobile ? 21 : 24, color: '#E8D0F5', lineHeight: 1.2 }}>{/Moon$/.test(f.phaseName) ? f.phaseName : `${f.phaseName} Moon`} in {moonSign}</div>
              <div style={{ fontSize: 12.5, color: '#cdb3e3', marginTop: 4, lineHeight: 1.5 }}>
                {f.illumination}% lit
                {f.moonChangeAt && now.toISOString() < f.moonChangeAt ? ` · moves into ${sky.SIGNS[f.moonSignEnd]} at ${ct_time(new Date(f.moonChangeAt))}` : ''}
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {retro.length === 0 && <span style={chip}>✨ Every planet is moving forward</span>}
          {retro.map(r => (
            <span key={r.planet} style={chip}>
              <span style={{ fontWeight: 600 }}>{r.planet} ℞</span>
              <span style={{ color: '#cdb3e3' }}>{r.until ? `until ${ct_dateShort(new Date(r.until))}` : 'for a while yet'}</span>
            </span>
          ))}
        </div>
        {(next || (lean && lean.score > 0)) && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '0.5px solid rgba(255,255,255,.14)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            {next && (
              <div style={{ fontSize: 12.5, color: '#e6d3f3', lineHeight: 1.5, minWidth: 0, flex: '1 1 220px' }}>
                <span style={{ color: '#b495d6' }}>Next up · </span>{next.emoji} {ct_title(next)}, {ct_rel(new Date(next.when), now)} at {ct_time(new Date(next.when))}
              </div>
            )}
            {lean && (
              <button onClick={() => onPickPurpose(lean.p.key)} style={{ ...chip, minHeight: 40, cursor: 'pointer', fontFamily: 'inherit', background: 'rgba(244,184,204,.18)' }}>
                {lean.score > 0 ? <span>Today is kind to {lean.p.emoji} {ct_lower(lean.p.label)}</span> : <span>🫧 Today is a soft one. Be easy on yourself.</span>}
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

const ct_FILTERS = [
  { key: 'all', label: '✦ Everything' },
  { key: 'moon', label: '🌙 Moon' },
  { key: 'planets', label: '🪐 Planets' },
  { key: 'chart', label: '💗 Your chart' },
  { key: 'hd', label: '🔆 Human Design' },
];
const ct_inFilter = (ev, key) => {
  if (key === 'moon') return ev.kind === 'moon' || ev.kind === 'eclipse';
  if (key === 'planets') return ev.kind === 'station' || ev.kind === 'ingress';
  if (key === 'chart') return ev.kind === 'transit';
  if (key === 'hd') return ev.kind === 'gate';
  if (ev.kind !== 'gate') return true;
  const g = ct_gateInfo(ev.gate);
  return g.mine || !!g.channel; // in Everything, only the gates that touch her own design
};
const ct_KIND_TINT = ev => ev.kind === 'moon' || ev.kind === 'eclipse' ? C.lavender : ev.kind === 'transit' ? C.pink : ev.kind === 'gate' ? C.lavLight : C.pinkLight;

const CtAddButton = ({ isOn, onAdd, onOpen, label = 'Add to calendar' }) => (
  isOn
    ? <CtButton quiet onClick={onOpen} title="Open your calendar" style={{ color: C.accent }}>On your calendar ✓</CtButton>
    : <CtButton onClick={onAdd}>＋ {label}</CtButton>
);

const CtRow = ({ ev, now, isMobile, isOn, onAdd, last }) => {
  const d = new Date(ev.when), past = d < now;
  const note = ct_goodFor(ev);
  const tone = ev.kind === 'transit' && typeof ASPECT_TONE_COLOR !== 'undefined' ? ASPECT_TONE_COLOR[ev.tone] : null;
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 0', borderBottom: last ? 'none' : `0.5px solid ${C.border}70`, opacity: past ? .62 : 1, flexWrap: 'wrap' }}>
      <div aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0, background: `${ct_KIND_TINT(ev)}55`, border: `0.5px solid ${C.border}` }}>{ev.emoji}</div>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16.5, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>
          {ct_title(ev)}{tone && <span aria-hidden="true" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: tone, marginLeft: 8, verticalAlign: 'middle' }} />}
        </div>
        <div style={{ fontSize: 12, color: C.accent, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
          {ct_date(d)} · {ct_time(d)} <span style={{ color: C.textMuted }}>· {ct_rel(d, now)}</span>
        </div>
        {note && <div style={{ fontSize: 12.5, color: C.textLight, lineHeight: 1.6, marginTop: 5 }}>{note}</div>}
      </div>
      <div style={{ flex: isMobile ? '1 1 100%' : '0 0 auto', display: 'flex', justifyContent: isMobile ? 'flex-start' : 'flex-end', paddingLeft: isMobile ? 56 : 0 }}>
        <CtAddButton isOn={isOn} onOpen={() => ct_openCalendar(ct_dk(d))} onAdd={() => onAdd({
          skyId: ev.id, when: ev.when, text: `${ev.emoji} ${ct_title(ev)}`, notes: note, color: ct_EVENT_COLOR[ev.kind],
        })} />
      </div>
    </div>
  );
};

const ct_weekLabel = (d, now) => {
  const start = ct_dayStart(now); start.setDate(start.getDate() - start.getDay());
  const w = Math.floor(ct_daysBetween(start, d) / 7);
  if (w <= 0) return 'This week';
  if (w === 1) return 'Next week';
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7);
  return `Week of ${ct_dateShort(s)}`;
};

const CtTimeline = ({ data, now, isMobile, added, onAdd }) => {
  const [filter, setFilter] = React.useState(() => { const v = ct_lsGet('nyla_sky_filter'); return ct_FILTERS.some(f => f.key === v) ? v : 'all'; });
  const pick = key => { setFilter(key); ct_lsSet('nyla_sky_filter', key); };
  const rows = React.useMemo(() => data.timeline.filter(ev => ev && ev.when && ev.title && ct_inFilter(ev, filter)), [data, filter]);
  const groups = React.useMemo(() => {
    const out = [];
    rows.forEach(ev => {
      const label = ct_weekLabel(new Date(ev.when), now);
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(ev); else out.push({ label, rows: [ev] });
    });
    return out;
  }, [rows]);
  const zone = ct_zone();
  const ecl = data.nextEclipse;
  const eclipseInWindow = data.timeline.some(e => e.kind === 'eclipse');
  const emptyWords = {
    moon: ['🌙', 'No moons to show', 'That is odd. Try reading the sky again.'],
    planets: ['🪐', 'A steady stretch', 'No planet changes sign or direction in the next 60 days.'],
    chart: ['💗', 'A quiet stretch for your chart', 'No slow planet makes an exact aspect to your Sun, Moon, rising, Mercury, Venus, Mars or Midheaven in the next 60 days. Enjoy the calm.'],
    hd: ['🔆', 'No gate changes to show', 'That is odd. Try reading the sky again.'],
    all: ['✨', 'A quiet sky', 'Nothing to show for the next 60 days.'],
  }[filter];
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {ct_FILTERS.map(f => <Pill key={f.key} active={filter === f.key} onClick={() => pick(f.key)} style={{ minHeight: 40 }}>{f.label}</Pill>)}
      </div>
      <div style={{ fontSize: 12, color: C.textLight, marginBottom: 12, lineHeight: 1.6 }}>
        The next {ct_DAYS_AHEAD} days, in your time{zone ? ` (${zone})` : ''}. {rows.length} moment{rows.length === 1 ? '' : 's'}.
        {filter === 'all' && ' Sun gates show here only when they touch your own design.'}
      </div>
      {rows.length === 0 && <EmptyState icon={emptyWords[0]} title={emptyWords[1]} text={emptyWords[2]} />}
      {groups.map(g => (
        <Card key={g.label} style={{ marginBottom: 12, paddingTop: 14, paddingBottom: 4 }}>
          <CtLabel>{g.label}</CtLabel>
          {g.rows.map((ev, i) => (
            <CtRow key={ev.id + ev.when} ev={ev} now={now} isMobile={isMobile} last={i === g.rows.length - 1}
              isOn={ct_isAdded(added, ev.id, Date.parse(ev.when))} onAdd={onAdd} />
          ))}
        </Card>
      ))}
      {(filter === 'all' || filter === 'moon') && !eclipseInWindow && ecl && (
        <div style={{ fontSize: 12.5, color: C.textLight, textAlign: 'center', lineHeight: 1.6, padding: '6px 12px 0' }}>
          🌒 No eclipses in the next {ct_DAYS_AHEAD} days. The next one is a {ct_lower(ecl.title)} on {ct_dateLong(new Date(ecl.when))}.
        </div>
      )}
    </div>
  );
};

const CtReasons = ({ reasons }) => (
  <div>
    {reasons.length === 0 && <div style={{ fontSize: 12.5, color: C.textLight, lineHeight: 1.6 }}>Nothing in the sky leans either way. A blank page of a day.</div>}
    {reasons.map((r, i) => {
      const good = r.delta > 0;
      const text = r.at ? r.text.replace(/: /, ` at ${ct_time(new Date(r.at))}: `) : r.text;
      return (
        <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '4px 0' }}>
          <span title={`${good ? '+' : ''}${r.delta}`} style={{ flexShrink: 0, minWidth: 34, textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '2px 0', borderRadius: 10, marginTop: 1, fontVariantNumeric: 'tabular-nums',
            color: good ? ((typeof _dk !== 'undefined' && _dk) ? '#7cc4b2' : '#3d8574') : C.rose, background: good ? '#4f9d8a22' : `${C.rose}1c` }}>{good ? '+' : '−'}{Math.abs(r.delta)}</span>
          <span style={{ fontSize: 12.5, color: C.text, lineHeight: 1.55, minWidth: 0, wordBreak: 'break-word' }}>{text}</span>
        </div>
      );
    })}
  </div>
);

const CtStars = ({ n }) => (
  <span aria-hidden="true" style={{ letterSpacing: 2, fontSize: 12, color: C.accent, whiteSpace: 'nowrap' }}>
    {'✦'.repeat(n)}<span style={{ opacity: .25 }}>{'✦'.repeat(5 - n)}</span>
  </span>
);

const CtDayCard = ({ day, rank, avoid, purpose, now, isMobile, isOn, onAdd, highlight }) => {
  const d = ct_keyDate(day.key), feel = ct_feel(day.score);
  const f = day.facts || {};
  return (
    <Card style={{ marginBottom: 10, ...(highlight ? { border: `1px solid ${C.rose}` } : {}), ...(avoid ? { background: C.secondaryBg } : {}) }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', flexShrink: 0, fontFamily: "'DM Serif Display',serif", fontSize: avoid ? 20 : 19,
          color: avoid ? C.textLight : '#fff', background: avoid ? C.lavLight : `linear-gradient(135deg, ${C.rose}, ${C.accent})` }}>{avoid ? '☁️' : rank || '✦'}</div>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17, color: C.text, lineHeight: 1.25 }}>{ct_dateLong(d)}</div>
          <div style={{ fontSize: 12, color: C.textLight, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{ct_rel(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59), now)}</span>
            <span>·</span><span>{f.phaseEmoji} {f.illumination}%</span>
            <span>·</span><span style={{ color: avoid ? C.textLight : C.rose, fontWeight: 500 }}>{feel.word}</span>
            <CtStars n={feel.stars} />
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10, paddingLeft: isMobile ? 0 : 56 }}>
        <CtReasons reasons={day.reasons} />
        {!avoid && (
          <div style={{ marginTop: 10 }}>
            <CtAddButton isOn={isOn} label="Hold this day" onOpen={() => ct_openCalendar(day.key)} onAdd={() => onAdd({
              skyId: 'best-' + purpose.key, when: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString(), allDay: true,
              text: `${purpose.emoji} Good day for: ${ct_lower(purpose.label)}`, color: ct_EVENT_COLOR.best,
              notes: day.reasons.map(r => `${r.delta > 0 ? '+' : '-'} ${r.text}`).join('\n'),
            })} />
          </div>
        )}
      </div>
    </Card>
  );
};

const CtMonthGrid = ({ ranked, selected, onSelect, now }) => {
  const byKey = {}; ranked.all.forEach(d => { byKey[d.key] = d; });
  const bestKeys = ranked.best.map(d => d.key), avoidKeys = ranked.avoid.map(d => d.key);
  const top = Math.max(1, ...ranked.all.map(d => d.score));
  const first = ct_dayStart(now), lead = first.getDay();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  ranked.all.forEach(d => cells.push(d));
  let lastMonth = -1;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginBottom: 4 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10, color: C.textMuted, fontWeight: 600 }}>{w}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={'b' + i} />;
          const date = ct_keyDate(d.key), isBest = bestKeys.includes(d.key), isAvoid = avoidKeys.includes(d.key), on = selected === d.key;
          const strength = d.score > 0 ? Math.min(1, d.score / top) : 0;
          const alpha = Math.round(20 + strength * 150).toString(16).padStart(2, '0');
          const newMonth = date.getMonth() !== lastMonth; lastMonth = date.getMonth();
          const f = d.facts || {};
          return (
            <button key={d.key} onClick={() => onSelect(d.key)} aria-pressed={on}
              aria-label={`${ct_dateLong(date)}, ${ct_feel(d.score).word}${isBest ? ', one of the best days' : ''}${isAvoid ? ', one to skip' : ''}`}
              style={{ minHeight: 46, padding: '3px 0 2px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', position: 'relative', minWidth: 0,
                background: d.score > 0 ? `${C.rose}${alpha}` : d.score < 0 ? C.lavLight : 'transparent',
                border: on ? `1.5px solid ${C.rose}` : `0.5px solid ${C.border}`, boxShadow: on ? `0 4px 12px ${C.rose}35` : 'none',
                color: strength > .62 ? '#fff' : C.text, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <span style={{ fontSize: 8.5, lineHeight: 1, height: 9, textTransform: 'uppercase', letterSpacing: .4, opacity: .8 }}>{newMonth ? date.toLocaleDateString('en-US', { month: 'short' }) : ''}</span>
              <span style={{ fontSize: 13, fontWeight: isBest ? 700 : 400, lineHeight: 1.1 }}>{date.getDate()}</span>
              <span style={{ fontSize: 9, lineHeight: 1, height: 10 }}>{isBest ? '✦' : isAvoid ? '☁️' : f.newMoon ? '🌑' : f.fullMoon ? '🌕' : ''}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 11, color: C.textLight, alignItems: 'center' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: `${C.rose}aa`, verticalAlign: 'middle', marginRight: 5 }} />deeper rose is kinder</span>
        <span>✦ five best</span><span>☁️ two to skip</span><span>🌑 🌕 new and full Moon</span>
      </div>
    </div>
  );
};

const CtRules = ({ hasCycle }) => {
  const [open, setOpen] = React.useState(false);
  const rules = window.nylaSky.RULES;
  return (
    <Card style={{ marginTop: 14, background: `linear-gradient(135deg,${C.lavender}40,${C.pink}25)` }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ width: '100%', minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: C.rose }}>📖 How the days are scored</span>
        <span style={{ fontSize: 12, color: C.accent, flexShrink: 0 }}>{open ? 'Hide' : 'Show the rules'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12.5, color: C.textLight, lineHeight: 1.6, marginBottom: 8 }}>Every day starts at zero. Each rule adds or takes away a little, and the number beside each reason is exactly how much.</div>
          {rules.map(r => (
            <div key={r.title} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: `0.5px solid ${C.border}70` }}>
              <span aria-hidden="true" style={{ fontSize: 16, flexShrink: 0, width: 22, textAlign: 'center' }}>{r.emoji}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{r.title}{r.title === 'Your cycle' && !hasCycle ? ' (not counted yet)' : ''}</div>
                <div style={{ fontSize: 12.5, color: C.textLight, lineHeight: 1.6 }}>{r.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

const CtBestDays = ({ data, now, isMobile, added, onAdd, purposeKey, setPurposeKey, cycles }) => {
  const sky = window.nylaSky;
  const purpose = sky.PURPOSES.find(p => p.key === purposeKey) || sky.PURPOSES[0];
  const ranked = React.useMemo(() => sky.rankDays(null, data.facts.map(f => ({ key: f.key, facts: f.facts, cycle: cycles.map[f.key] || null })), purpose.key), [data, purpose.key, cycles]);
  const [selected, setSelected] = React.useState(null);
  React.useEffect(() => { setSelected(null); }, [purpose.key]);
  const picked = selected && ranked.all.find(d => d.key === selected);
  const isHeld = day => { const d = ct_keyDate(day.key); return ct_isAdded(added, 'best-' + purpose.key, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime(), 6); };
  const calm = ranked.avoid.length > 0 && ranked.avoid.every(d => d.score >= 0);
  const flat = ranked.best.length > 0 && ranked.best[0].score <= 0;
  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <SectionHeading style={{ marginBottom: 10 }}>What are you choosing a day for?</SectionHeading>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {sky.PURPOSES.map(p => <Pill key={p.key} active={p.key === purpose.key} onClick={() => setPurposeKey(p.key)} style={{ minHeight: 40 }}>{p.emoji} {p.label}</Pill>)}
        </div>
        <div style={{ fontSize: 12, color: C.textLight, marginTop: 12, lineHeight: 1.6 }}>
          {cycles.has
            ? '🌸 Your cycle is counted in, from your period history.'
            : <span>🌸 Your cycle is not counted yet. <button onClick={() => { try { window._navigateTo('period', 'Cycle Overview'); } catch (e) {} }} style={{ background: 'none', border: 'none', padding: '10px 0', color: C.rose, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, textDecoration: 'underline' }}>Log a period</button> and it joins the scoring.</span>}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 340px) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <Card>
            <SectionHeading style={{ marginBottom: 10 }}>{purpose.emoji} The next {ct_DAYS_SCORED} days</SectionHeading>
            <CtMonthGrid ranked={ranked} selected={selected} onSelect={k => setSelected(s => (s === k ? null : k))} now={now} />
            <div style={{ fontSize: 12, color: C.textLight, marginTop: 10, lineHeight: 1.6 }}>Already have a date in mind? Tap it to see how it looks.</div>
          </Card>
          {picked && (
            <div style={{ marginTop: 12 }}>
              <CtLabel style={{ marginBottom: 8 }}>The day you tapped</CtLabel>
              <CtDayCard day={picked} purpose={purpose} now={now} isMobile={true} highlight isOn={isHeld(picked)} onAdd={onAdd}
                rank={ranked.best.findIndex(d => d.key === picked.key) + 1 || null} />
            </div>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <CtLabel style={{ marginBottom: 8 }}>Five best days</CtLabel>
          {flat && <div style={{ fontSize: 12.5, color: C.textLight, lineHeight: 1.6, marginBottom: 10 }}>No day stands out for this one in the next {ct_DAYS_SCORED} days. These are simply the calmest.</div>}
          {ranked.best.map((d, i) => <CtDayCard key={d.key} day={d} rank={i + 1} purpose={purpose} now={now} isMobile={isMobile} isOn={isHeld(d)} onAdd={onAdd} />)}
          <CtLabel style={{ margin: '16px 0 8px' }}>{calm ? 'Two quieter days' : 'Two to skip'}</CtLabel>
          {calm && <div style={{ fontSize: 12.5, color: C.textLight, lineHeight: 1.6, marginBottom: 10 }}>Nothing in this stretch is truly rough. These two are simply the quietest.</div>}
          {ranked.avoid.map(d => <CtDayCard key={d.key} day={d} avoid purpose={purpose} now={now} isMobile={isMobile} onAdd={onAdd} />)}
        </div>
      </div>

      <div style={{ textAlign: 'center', fontFamily: "'DM Serif Display',serif", fontStyle: 'italic', fontSize: 15, color: C.textLight, margin: '22px 12px 4px', lineHeight: 1.5 }}>
        The sky is a weather report. You decide.
      </div>
      <CtRules hasCycle={cycles.has} />
    </div>
  );
};

const CtPage = () => {
  const isMobile = useIsMobile();
  const sky = window.nylaSky;
  const ready = !!(sky && typeof sky.dayFacts === 'function' && typeof sky.rankDays === 'function');
  const natal = React.useMemo(ct_natal, []);
  const [data, setData] = React.useState(() => (ready ? ct_readCache(ct_dk(new Date()), ct_natalSig(natal)) : null));
  const [state, setState] = React.useState(() => (data ? 'ok' : ready ? 'loading' : 'broken')); // loading | ok | offline | broken
  const [progress, setProgress] = React.useState({ n: 0, label: '' });
  const [attempt, setAttempt] = React.useState(0);
  const [tab, setTabState] = React.useState(() => (ct_lsGet('nyla_sky_tab') === 'best' ? 'best' : 'ahead'));
  const [purposeKey, setPurposeState] = React.useState(() => ct_lsGet('nyla_sky_purpose') || 'launch');
  const [added, setAdded] = React.useState(ct_readAdded);
  const [now, setNow] = React.useState(() => new Date());
  const dayRef = React.useRef(data ? data.day : null);
  dayRef.current = data ? data.day : null;
  const setTab = t => { setTabState(t); ct_lsSet('nyla_sky_tab', t); };
  const setPurposeKey = k => { setPurposeState(k); ct_lsSet('nyla_sky_purpose', k); };

  React.useEffect(() => {
    if (state !== 'loading') return;
    let alive = true;
    loadAstronomy()
      .then(A => ct_compute(A, natal, (n, label) => { if (alive) setProgress({ n, label }); }, () => alive))
      .then(out => {
        if (!alive) return;
        ct_lsSet(ct_CACHE_KEY, JSON.stringify(out));
        setNow(new Date()); setData(out); setState('ok');
      })
      .catch(e => {
        if (!alive) return;
        console.warn('Cosmic Timing could not read the sky', e);
        setState(e && e.message === 'offline' ? 'offline' : 'broken');
      });
    return () => { alive = false; };
  }, [state, attempt]);

  // Keep "right now" honest while the page stays open, and notice a new day.
  React.useEffect(() => {
    const tick = setInterval(() => {
      const n = new Date();
      setNow(n);
      if (dayRef.current && dayRef.current !== ct_dk(n)) { setData(null); setProgress({ n: 0, label: '' }); setState('loading'); }
    }, 60000);
    return () => clearInterval(tick);
  }, []);

  const keys = React.useMemo(() => (data ? data.facts.map(f => f.key) : []), [data]);
  const cycles = React.useMemo(() => ct_cycles(keys), [keys]);
  const onAdd = ev => { if (ct_addEvent(ev)) setAdded(ct_readAdded()); };
  const reread = () => { try { localStorage.removeItem(ct_CACHE_KEY); } catch (e) {} setData(null); setProgress({ n: 0, label: '' }); setAttempt(a => a + 1); setState('loading'); };

  return (
    <div style={{ maxWidth: 980, minWidth: 0 }}>
      <PageTitle subtitle="What the sky is doing next, and the kindest days for what matters."
        right={state === 'ok' && <CtButton quiet onClick={reread} title="Work the sky out again">↻ Read the sky again</CtButton>}>
        Timing
      </PageTitle>

      {state === 'loading' && <CtLoading progress={progress.n} label={progress.label} />}

      {state === 'offline' && (
        <EmptyState icon="🌙" title="The sky map did not load"
          text="It needs a connection the first time each day. Check your signal, then try again. Your calendar and everything else are fine."
          action={<CtButton solid onClick={reread}>Try again</CtButton>} />
      )}
      {state === 'broken' && (
        <EmptyState icon="🔭" title="The sums hit a snag"
          text="Something went wrong while working out the sky. Trying again usually clears it."
          action={<CtButton solid onClick={reread}>Try again</CtButton>} />
      )}

      {state === 'ok' && data && (
        <div>
          <CtHero data={data} now={now} isMobile={isMobile} cycles={cycles} onPickPurpose={k => { setPurposeKey(k); setTab('best'); }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <Pill active={tab === 'ahead'} onClick={() => setTab('ahead')} style={{ minHeight: 42, padding: '8px 18px', fontSize: 13.5 }}>🔭 The sky ahead</Pill>
            <Pill active={tab === 'best'} onClick={() => setTab('best')} style={{ minHeight: 42, padding: '8px 18px', fontSize: 13.5 }}>💫 Best days for…</Pill>
          </div>
          {tab === 'ahead'
            ? <CtTimeline data={data} now={now} isMobile={isMobile} added={added} onAdd={onAdd} />
            : <CtBestDays data={data} now={now} isMobile={isMobile} added={added} onAdd={onAdd} purposeKey={purposeKey} setPurposeKey={setPurposeKey} cycles={cycles} />}
        </div>
      )}
    </div>
  );
};

const CosmicTiming = () => (
  <CtBoundary fallback={<EmptyState icon="🌙" title="Timing is resting" text="This page hit a snag. Everything else is fine. Open it again in a moment." />}>
    <CtPage />
  </CtBoundary>
);
