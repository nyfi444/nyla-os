/* ── Close the Day ─────────────────────────────────────────────────────
   The other half of the Morning Brief: a gentle few minutes in the evening
   that put the day down and set up tomorrow. Its "day in a sentence"
   becomes a line-a-day journal over time.

   CloseDayCard   Home, under the morning brief. Shows from 6 pm until 3 am
                  while that day has not been closed. "Not tonight" hides it
                  until tomorrow. After closing it is one quiet line.
   CloseDayPage   Reflect > Close the Day. Tonight's close, then the
                  keepsake: streak, eight weeks tinted by mood, the journal
                  with a month filter and a PDF.

   The day being closed: before 3 am it is still yesterday. cd_day() is the
   one helper that decides this; everything else asks it.

   Storage
     nylaos_day_closes            { 'YYYY-MM-DD': { mood 1-5 | null, energy 1-3 | null,
                                    sentence, gratitude: [up to 3], closedAt (ISO),
                                    doneCount, movedCount } }   (Patterns reads this)
     nylaos_gratitude_<toDateString>   the same words Home and the Daily planner show
     nylaos_top3_YYYY-MM-DD       [{ text, done }] x 3, the Daily planner's own key
     nylaos_tasks                 only a task's calendarDate or done fields are touched
     nyla_closeday_skip           'YYYY-MM-DD' she said "Not tonight" (this device only)
     nyla_closeday_draft          a half-finished close, so nothing typed is lost (this device only)
   Events fired on window: 'nyla-tasks-changed' after a task write,
   'nyla-closeday-changed' after a close is saved, skipped or edited,
   'nyla-gratitude-changed' after gratitude is written.
   Test hook: localStorage.setItem('nyla_closeday_force','1') shows the Home
   card at any hour.

   Loads before the main app script: top level must not touch app globals.
   Every top-level name here is prefixed cd_ / CD_ / Cd. Everything above the
   "components" marker is plain JS with no JSX, so tests can run it alone. */

// ── Storage ────────────────────────────────────────────────────────────
const cd_raw = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
const cd_read = (key, fallback) => {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch (e) { return fallback; }
};
const cd_write = (key, value) => {
  try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); return true; }
  catch (e) { try { toast('Could not save that. Storage may be full.', 'error', 4000); } catch (e2) {} return false; }
};
const cd_remove = key => { try { localStorage.removeItem(key); } catch (e) {} };
const cd_emit = name => { try { window.dispatchEvent(new CustomEvent(name)); } catch (e) {} };

// ── Days ───────────────────────────────────────────────────────────────
const CD_OPENS = 18;    // the Home card appears at 6 pm
const CD_ROLLOVER = 3;  // until 3 am, the night still belongs to the day before
const cd_key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cd_isKey = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
const cd_date = k => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d, 12); };
const cd_shift = (k, n) => { const d = cd_date(k); d.setDate(d.getDate() + n); return cd_key(d); };
// THE helper: which day is being closed right now.
const cd_day = (now = new Date()) => {
  const d = new Date(now);
  if (d.getHours() < CD_ROLLOVER) d.setDate(d.getDate() - 1);
  return cd_key(d);
};
const cd_isEvening = (now = new Date()) => now.getHours() >= CD_OPENS || now.getHours() < CD_ROLLOVER;
const cd_longDate = k => cd_date(k).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const cd_weekday = k => cd_date(k).toLocaleDateString('en-US', { weekday: 'long' });
const cd_monthLabel = ym => { const [y, m] = String(ym).split('-').map(Number); return new Date(y, m - 1, 1, 12).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); };
// Same calendar day n months back, clamped to that month's last day.
const cd_monthsBack = (k, n) => {
  const d = cd_date(k); const y = d.getFullYear(), m = d.getMonth() - n;
  const last = new Date(y, m + 1, 0).getDate();
  return cd_key(new Date(y, m, Math.min(d.getDate(), last), 12));
};

// ── Words ──────────────────────────────────────────────────────────────
const CD_MOODS = [
  { v: 1, face: '😔', label: 'Heavy',   tint: '#8e9fd6' },
  { v: 2, face: '😕', label: 'Off',     tint: '#b4a2e2' },
  { v: 3, face: '😌', label: 'Okay',    tint: '#e6c79c' },
  { v: 4, face: '🙂', label: 'Good',    tint: '#f0a0b8' },
  { v: 5, face: '🥰', label: 'Glowing', tint: '#d65f86' },
];
const CD_ENERGY = [
  { v: 1, icon: '🕯', label: 'Low' },
  { v: 2, icon: '🌤', label: 'Steady' },
  { v: 3, icon: '⚡', label: 'Bright' },
];
const cd_mood = v => CD_MOODS.find(m => m.v === v) || null;
const cd_energy = v => CD_ENERGY.find(m => m.v === v) || null;
const CD_STEPS = [
  { moon: '🌑', name: 'What got done' },
  { moon: '🌒', name: 'What is left' },
  { moon: '🌓', name: 'How it felt' },
  { moon: '🌔', name: 'Gratitude' },
  { moon: '🌕', name: 'Top 3' },
];
const CD_STARTERS = ['Today was the day that ', 'The part I want to keep is ', 'Today taught me ', 'I am proud that ', 'Tonight I feel '];
const CD_GRAT_HINTS = ['Something small that went right', 'Someone who made today softer', 'Something about you'];
const CD_MOON_LINES = [
  'A new moon and a dark, quiet sky. Tomorrow is a blank page.',
  'A thin new crescent tonight. Small beginnings count.',
  'Half the moon is lit tonight. Partway there is a fine place to rest.',
  'The moon is filling up. So are you.',
  'A full moon tonight. Let it hold what you are done carrying.',
  'The moon is starting to let go. You can too.',
  'A half moon, easing off. Rest is part of the work.',
  'The last sliver before the dark. Nothing left to do but sleep.',
];
const CD_MOOD_LINES = {
  1: 'Heavy days end too. You got through this one.',
  2: 'Not every day has to be a good one. This one is done.',
  3: 'An ordinary day is still a day you showed up for.',
  4: 'A good day, kept.',
  5: 'Keep this one close. It was a bright one.',
};
const cd_plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const cd_clip = (s, max) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};
const cd_esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Closes ─────────────────────────────────────────────────────────────
const cd_closes = () => { const v = cd_read('nylaos_day_closes', {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
const cd_int = (v, lo, hi) => { const n = Math.round(Number(v)); return v != null && v !== '' && isFinite(n) && n >= lo && n <= hi ? n : null; };
// One stored close, tidied for display. Anything odd becomes empty; a record that is not an object is null.
const cd_clean = rec => {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null;
  return {
    mood: cd_int(rec.mood, 1, 5),
    energy: cd_int(rec.energy, 1, 3),
    sentence: typeof rec.sentence === 'string' ? rec.sentence.trim() : '',
    gratitude: Array.isArray(rec.gratitude) ? rec.gratitude.filter(g => typeof g === 'string' && g.trim()).map(g => g.trim()).slice(0, 3) : [],
    closedAt: typeof rec.closedAt === 'string' ? rec.closedAt : '',
    doneCount: Math.max(0, Math.round(Number(rec.doneCount)) || 0),
    movedCount: Math.max(0, Math.round(Number(rec.movedCount)) || 0),
  };
};
// Newest first.
const cd_entries = closes => Object.keys(closes || {}).filter(cd_isKey)
  .map(k => { const c = cd_clean(closes[k]); return c ? { day: k, ...c } : null; })
  .filter(Boolean).sort((a, b) => (a.day < b.day ? 1 : -1));
// Nights in a row. Tonight not being closed yet does not break a streak.
const cd_streak = (closes, day) => {
  let k = cd_clean(closes[day]) ? day : cd_shift(day, -1), n = 0;
  while (cd_clean(closes[k]) && n < 5000) { n++; k = cd_shift(k, -1); }
  return n;
};
const cd_longest = closes => {
  const days = cd_entries(closes).map(e => e.day).reverse();
  let best = 0, run = 0, prev = null;
  days.forEach(k => { run = prev && cd_shift(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; });
  return best;
};
// The last `weeks` weeks as rows of seven days, Sunday first; the last row holds `day`.
const cd_weeks = (day, weeks = 8) => {
  const end = cd_date(day); end.setDate(end.getDate() + (6 - end.getDay()));
  const first = cd_shift(cd_key(end), -(weeks * 7 - 1));
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => cd_shift(first, w * 7 + i)));
};
// Lines she wrote on this same night before: a week, a month, three, six months, then each year back.
const cd_lookbacks = (closes, day) => {
  const spots = [[cd_shift(day, -7), 'A week ago'], [cd_monthsBack(day, 1), 'A month ago'], [cd_monthsBack(day, 3), 'Three months ago'], [cd_monthsBack(day, 6), 'Six months ago']];
  for (let y = 1; y <= 5; y++) spots.push([cd_monthsBack(day, 12 * y), y === 1 ? 'A year ago' : `${y} years ago`]);
  const seen = new Set();
  return spots.map(([k, label]) => {
    if (seen.has(k) || k === day) return null; seen.add(k);
    const c = cd_clean(closes[k]);
    return c && c.sentence ? { day: k, label, ...c } : null;
  }).filter(Boolean);
};
const cd_saveClose = (day, fields) => {
  const closes = cd_closes();
  const prev = closes[day] && typeof closes[day] === 'object' && !Array.isArray(closes[day]) ? closes[day] : {};
  closes[day] = { ...prev, ...fields };
  if (!cd_write('nylaos_day_closes', closes)) return false;
  cd_emit('nyla-closeday-changed');
  return true;
};

// ── Gratitude: one text on Home and in the planner, three lines here ────
const cd_gratKey = day => 'nylaos_gratitude_' + cd_date(day).toDateString();
// First three lines become the three boxes (a leading "1." or bullet is dropped);
// anything past the third line is kept as it is and written back untouched.
const cd_gratSplit = text => {
  const all = String(text == null ? '' : text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const bare = l => l.replace(/^(\d{1,2}[.)]|[-*•·])\s+/, '');
  return { lines: [0, 1, 2].map(i => (all[i] ? bare(all[i]) : '')), rest: all.slice(3) };
};
const cd_gratJoin = (lines, rest) => [...(lines || []).map(l => String(l || '').trim()).filter(Boolean), ...(rest || [])].join('\n');

// ── Tomorrow's Top 3 (the Daily planner's key and shape) ───────────────
const cd_top3Key = day => 'nylaos_top3_' + day;
const cd_top3Read = day => {
  const v = cd_read(cd_top3Key(day), null);
  return [0, 1, 2].map(i => {
    const x = Array.isArray(v) ? v[i] : null;
    return { text: x && typeof x.text === 'string' ? x.text : '', done: !!(x && x.done) };
  });
};

// ── Tasks ──────────────────────────────────────────────────────────────
const cd_hasText = t => t && typeof t === 'object' && t.id != null && typeof t.text === 'string' && t.text.trim() !== '';
const cd_tasks = () => { const v = cd_read('nylaos_tasks', []); return Array.isArray(v) ? v.filter(cd_hasText) : []; };
// A timed block on the schedule is not a to-do (the Daily planner draws the same line).
const cd_isTodo = t => !(t.source === 'calendar' && t.time);
const cd_doneOn = (tasks, day) => tasks.filter(t => t.done && t.completedDate === day);
const cd_leftOn = (tasks, day) => tasks.filter(t => !t.done && cd_isKey(t.calendarDate) && t.calendarDate <= day && cd_isTodo(t))
  .sort((a, b) => (a.calendarDate < b.calendarDate ? 1 : a.calendarDate > b.calendarDate ? -1 : 0));
const cd_dueOn = (tasks, day) => tasks.filter(t => !t.done && t.calendarDate === day && cd_isTodo(t));
const cd_redate = (list, ids, date) => { const set = new Set(ids); return list.map(x => (x && set.has(x.id) ? { ...x, calendarDate: date } : x)); };
// Reads the stored list fresh, changes it, writes it back the way the app does.
const cd_changeTasks = change => {
  try {
    const raw = cd_read('nylaos_tasks', []);
    if (!Array.isArray(raw)) return false;
    const next = change(raw);
    if (!Array.isArray(next) || !cd_write('nylaos_tasks', next)) return false;
    cd_emit('nyla-tasks-changed');
    return true;
  } catch (e) {
    try { toast('Could not update that task. Nothing was changed.', 'error', 3500); } catch (e2) {}
    return false;
  }
};
// "Done after all": the app's own toggle. After midnight the finished day is the one being closed.
const cd_toggleDone = (id, day) => cd_changeTasks(raw => {
  const out = toggleTaskIn(raw, id);
  if (!out || !Array.isArray(out.list)) return null;
  return out.nowDone ? out.list.map(x => (x && x.id === id && x.done ? { ...x, completedDate: day } : x)) : out.list;
});

// ── The rest of the day's data ─────────────────────────────────────────
const cd_habits = day => {
  try {
    const d = cd_date(day);
    let habits = cd_read('nylaos_habits', null);
    if (!Array.isArray(habits)) habits = typeof DEFAULT_HABITS !== 'undefined' ? DEFAULT_HABITS.map((h, i) => ({ id: i + 1, name: h })) : [];
    const log = cd_read('nylaos_habit_log', {}) || {};
    const due = habits.filter(h => h && typeof h === 'object' && h.id != null && h.name && (typeof habitDue === 'function' ? habitDue(h, d) : true));
    return { due, kept: due.filter(h => log[`${h.id}_${day}`]) };
  } catch (e) { return { due: [], kept: [] }; }
};
const cd_eventsOn = day => {
  const v = cd_read('nylaos_events', []);
  return (Array.isArray(v) ? v : []).filter(e => e && e.date === day && typeof e.text === 'string' && e.text.trim())
    .sort((a, b) => String(a.time || '99').localeCompare(String(b.time || '99')));
};
const cd_clock = t => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  if (!m) return '';
  const h = +m[1];
  return `${h % 12 || 12}${m[2] === '00' ? '' : ':' + m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};
const cd_draft = day => { const d = cd_read('nyla_closeday_draft', null); return d && typeof d === 'object' && d.day === day ? d : null; };

// ── The journal as a document ──────────────────────────────────────────
const cd_journalHtml = entries => {
  const out = []; let month = '';
  entries.forEach(e => {
    const ym = e.day.slice(0, 7);
    if (ym !== month) { month = ym; out.push(`<h2>${cd_esc(cd_monthLabel(ym))}</h2>`); }
    const d = cd_date(e.day);
    const when = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const m = cd_mood(e.mood), en = cd_energy(e.energy);
    const feel = [m && m.label, en && `${en.label} energy`].filter(Boolean).join(', ');
    out.push(`<h4>${cd_esc(when)}${feel ? ' · ' + cd_esc(feel) : ''}</h4>`);
    out.push(`<p>${cd_esc(e.sentence || 'A quiet night, no line.')}</p>`);
    if (e.gratitude.length) out.push(`<p><i>Grateful for: ${e.gratitude.map(cd_esc).join('; ')}</i></p>`);
  });
  return out.join('');
};
// Lines offered by Claude, tidied: no bullets, no quote marks, three at most.
const cd_offerLines = text => String(text || '').split(/\r?\n/)
  .map(l => l.replace(/^\s*(\d{1,2}[.)]|[-*•·])\s*/, '').replace(/^["“'‘]+|["”'’]+$/g, '').replace(/\u2014/g, ',').trim())
  .filter(l => l && l.length <= 220).slice(0, 3);
const CD_LINE_SYSTEM = 'You help a woman write a one-line journal entry about her day. You are given what she finished, and how she felt. Offer exactly three different first-person sentences she could use, each under 22 words, plain and warm, specific to what she did, never preachy. No dashes, no emoji, no quote marks, no numbering. One sentence per line and nothing else.';

// ── cd:components ── (everything below uses JSX and app globals inside function bodies)

class CdBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e) { console.warn((this.props.name || 'Close the Day') + ' failed to render', e); }
  render() { return this.state.failed ? (this.props.fallback || null) : this.props.children; }
}

const CD_CSS = `
@keyframes cdTwinkle { 0%,100% { opacity:.25; transform:scale(.8); } 50% { opacity:1; transform:scale(1.1); } }
@keyframes cdFloat { 0% { opacity:0; transform:translateY(8px) scale(.6) rotate(0deg); } 30% { opacity:1; } 100% { opacity:0; transform:translateY(-26px) scale(1.1) rotate(40deg); } }
@keyframes cdStepIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
@keyframes cdSheetIn { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:none; } }
@keyframes cdMoonGlow { 0%,100% { filter:drop-shadow(0 0 10px rgba(232,208,245,.35)); } 50% { filter:drop-shadow(0 0 24px rgba(232,208,245,.75)); } }
@keyframes cdPop { 0% { transform:scale(.6); opacity:0; } 60% { transform:scale(1.12); opacity:1; } 100% { transform:scale(1); opacity:1; } }
.cd-star { animation: cdTwinkle 3.2s ease-in-out infinite; }
.cd-spark { animation: cdFloat 2.6s ease-out infinite; }
.cd-step { animation: cdStepIn .28s ease; }
.cd-sheet { animation: cdSheetIn .26s ease; }
.cd-moon { animation: cdMoonGlow 4s ease-in-out infinite; }
.cd-pop { animation: cdPop .4s ease both; }
.cd-tap { transition: transform .12s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease; -webkit-tap-highlight-color: transparent; }
.cd-tap:active { transform: scale(.96); }
.cd-input::placeholder { color: inherit; opacity: .42; }
.cd-input:focus { box-shadow: 0 0 0 3px rgba(196,96,122,.16); }
@media (prefers-reduced-motion: reduce) {
  .cd-star, .cd-spark, .cd-step, .cd-sheet, .cd-moon, .cd-pop { animation: none !important; }
  .cd-spark, .cd-star { opacity: .7; }
  .cd-tap:active { transform: none; }
}
`;
const CdStyles = () => <style>{CD_CSS}</style>;

const CD_STARS = [[6, 20, 9], [19, 66, 7], [33, 12, 6], [52, 28, 8], [66, 74, 6], [79, 14, 10], [91, 52, 7], [44, 84, 6], [12, 44, 5], [86, 82, 8]];
const CdStars = ({ count = 8 }) => CD_STARS.slice(0, count).map(([l, t, s], i) => (
  <span key={i} aria-hidden="true" className="cd-star" style={{ position: 'absolute', left: l + '%', top: t + '%', fontSize: s, color: '#f3dcff', animationDelay: (i * 0.45) + 's', pointerEvents: 'none', lineHeight: 1 }}>✦</span>
));
// Little sparks that drift up around a celebration. CSS only.
const CdSparkles = () => [[-46, 4, 0], [-28, -10, .5], [30, -12, .9], [48, 6, 1.4], [-8, -20, 1.8], [12, 10, 2.2]].map(([x, y, delay], i) => (
  <span key={i} aria-hidden="true" className="cd-spark" style={{ position: 'absolute', left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, fontSize: i % 2 ? 11 : 14, color: i % 2 ? C.accent : C.rose, animationDelay: delay + 's', pointerEvents: 'none', lineHeight: 1 }}>{i % 3 === 0 ? '✧' : '✦'}</span>
));

// Shared looks, read from C when called (never at load).
const cd_primary = extra => ({ minHeight: 44, padding: '0 22px', borderRadius: 22, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, color: '#fff', background: `linear-gradient(135deg, ${C.rose}, ${C.accent})`, boxShadow: `0 6px 18px ${C.rose}40`, ...extra });
const cd_soft = extra => ({ minHeight: 40, padding: '0 16px', borderRadius: 20, border: `0.5px solid ${C.border}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: C.rose, background: `${C.pink}50`, ...extra });
const cd_quiet = extra => ({ minHeight: 40, padding: '0 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: C.textLight, background: 'transparent', ...extra });
const cd_field = extra => ({ width: '100%', boxSizing: 'border-box', border: `0.5px solid ${C.border}`, borderRadius: 14, padding: '11px 13px', background: C.pinkLight, color: C.text, fontFamily: 'inherit', fontSize: 16, lineHeight: 1.5, outline: 'none', minWidth: 0, ...extra });
const cd_serif = (size, extra) => ({ fontFamily: "'DM Serif Display',serif", fontSize: size, color: C.rose, lineHeight: 1.2, ...extra });

const CdStepHead = ({ title, sub }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={cd_serif(24)}>{title}</div>
    {sub && <div style={{ fontSize: 13.5, color: C.textLight, marginTop: 6, lineHeight: 1.55 }}>{sub}</div>}
  </div>
);
const CdSoftNote = ({ icon, children }) => (
  <div style={{ textAlign: 'center', padding: '26px 18px', borderRadius: 18, border: `1px dashed ${C.border}`, background: `${C.pinkLight}80` }}>
    <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
    <div style={{ fontSize: 13.5, color: C.textLight, lineHeight: 1.65, maxWidth: 340, margin: '0 auto' }}>{children}</div>
  </div>
);

// ── Step 1: what got done ──────────────────────────────────────────────
const CdStepDone = ({ day, dayWord }) => {
  const [all, setAll] = React.useState(false);
  const done = cd_doneOn(cd_tasks(), day);
  const { due, kept } = cd_habits(day);
  const shown = all ? done : done.slice(0, 7);
  return (
    <div>
      <CdStepHead title="What got done" sub={`Before anything else, look at what ${dayWord} held.`}/>
      {done.length > 0 ? (
        <div>
          <div style={{ position: 'relative', textAlign: 'center', padding: '18px 0 20px' }}>
            <CdSparkles/>
            <div className="cd-pop" style={cd_serif(46, { lineHeight: 1 })}>{done.length}</div>
            <div style={{ fontSize: 13, color: C.textLight, marginTop: 6 }}>{done.length === 1 ? 'thing finished ✨' : 'things finished ✨'}</div>
          </div>
          <div style={{ borderRadius: 16, border: `0.5px solid ${C.border}`, background: C.card, padding: '4px 14px' }}>
            {shown.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: i < shown.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
                <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1, display: 'grid', placeItems: 'center', fontSize: 11, color: '#fff', background: `linear-gradient(135deg, ${C.rose}, ${C.accent})` }}>✓</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: C.text, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{t.text}</span>
              </div>
            ))}
          </div>
          {done.length > shown.length && <button className="cd-tap" onClick={() => setAll(true)} style={cd_quiet({ marginTop: 6 })}>Show all {done.length}</button>}
        </div>
      ) : (
        <CdSoftNote icon="🕊">Nothing was ticked off {dayWord}, and that is allowed. Rest counts. Thinking counts. Getting through it counts.</CdSoftNote>
      )}
      {due.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13.5, color: C.text, marginBottom: 10 }}>
            🌿 {kept.length === due.length ? `All ${cd_plural(due.length, 'habit', 'habits')} kept. Look at you.` : kept.length ? `${kept.length} of ${cd_plural(due.length, 'habit', 'habits')} kept` : 'No habits ticked, and tomorrow is a fresh row.'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {due.map(h => { const on = kept.includes(h); const col = h.color || C.rose; return (
              <span key={h.id} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12.5, border: `0.5px solid ${on ? col : C.border}`, background: on ? `${col}22` : 'transparent', color: on ? C.text : C.textMuted, maxWidth: '100%', overflowWrap: 'anywhere' }}>{on ? '✓ ' : ''}{h.name}</span>
            ); })}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Step 2: what is left ───────────────────────────────────────────────
const CdStepLeft = ({ day, next, nextWord, ids, resolved, onAct, onUndo, onMoveRest }) => {
  const [all, setAll] = React.useState(false);
  const byId = new Map(cd_tasks().map(t => [t.id, t]));
  const rows = ids.map(id => byId.get(id)).filter(Boolean);
  const open = rows.filter(t => !resolved[t.id]);
  const shown = all ? rows : rows.slice(0, 8);
  const label = k => { try { const p = prettyDue(k); return (p && p.label) || ''; } catch (e) { return ''; } };
  const said = r => r.kind === 'done' ? 'Done after all ✓' : r.kind === 'letgo' ? 'Let go. It can come back when it matters.' : r.kind === 'next' ? `Moved to ${nextWord}` : `Moved to ${label(r.to) || r.to}`;
  return (
    <div>
      <CdStepHead title="What is left" sub={rows.length ? 'Nothing here is a failure. Give each one a home, then put it down.' : null}/>
      {!rows.length && <CdSoftNote icon="🌸">Nothing is left hanging. A clean slate tonight.</CdSoftNote>}
      {shown.map(t => {
        const r = resolved[t.id];
        return (
          <div key={t.id} style={{ borderRadius: 16, border: `0.5px solid ${C.border}`, background: r ? `${C.lavender}30` : C.card, padding: '12px 14px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 180px', minWidth: 0, fontSize: 14, color: C.text, lineHeight: 1.45, overflowWrap: 'anywhere', textDecoration: r && r.kind === 'done' ? 'line-through' : 'none', opacity: r ? .6 : 1 }}>{t.text}</span>
              {!r && t.calendarDate < day && <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: `${C.lavender}70`, color: C.textLight, whiteSpace: 'nowrap' }}>from {label(t.calendarDate) || t.calendarDate}</span>}
            </div>
            {r ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                <span style={{ fontSize: 12.5, color: C.textLight }}>{said(r)}</span>
                <button className="cd-tap" onClick={() => onUndo(t)} style={cd_quiet({ color: C.rose, textDecoration: 'underline' })}>Undo</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button className="cd-tap" onClick={() => onAct(t, 'next', next)} style={cd_soft({ textTransform: 'none' })}>→ {nextWord.charAt(0).toUpperCase() + nextWord.slice(1)}</button>
                <label className="cd-tap" style={cd_soft({ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5 })}>
                  📅 Pick a date
                  <input type="date" aria-label={`Pick a date for ${t.text}`} onChange={e => { if (cd_isKey(e.target.value)) onAct(t, 'date', e.target.value); }}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}/>
                </label>
                <button className="cd-tap" onClick={() => onAct(t, 'letgo', null)} style={cd_soft({ background: 'transparent', color: C.textLight })}>🍃 Let it go</button>
                <button className="cd-tap" onClick={() => onAct(t, 'done')} style={cd_soft({ background: 'transparent' })}>✓ Done after all</button>
              </div>
            )}
          </div>
        );
      })}
      {rows.length > shown.length && <button className="cd-tap" onClick={() => setAll(true)} style={cd_quiet()}>Show {rows.length - shown.length} more</button>}
      {open.length > 1 && (
        <div style={{ marginTop: 6, textAlign: 'center' }}>
          <button className="cd-tap" onClick={() => onMoveRest(open)} style={cd_quiet({ color: C.rose })}>Move all {open.length} to {nextWord}</button>
        </div>
      )}
    </div>
  );
};

// ── Step 3: how it felt ────────────────────────────────────────────────
const CdStepFelt = ({ day, dayWord, mood, setMood, energy, setEnergy, sentence, setSentence }) => {
  const isMobile = useIsMobile();
  const [offers, setOffers] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const box = React.useRef(null);
  const starter = CD_STARTERS[cd_date(day).getDate() % CD_STARTERS.length];
  const startWith = s => { setSentence(s); setTimeout(() => { const el = box.current; if (el) { el.focus(); try { el.setSelectionRange(s.length, s.length); } catch (e) {} } }, 0); };
  const offer = async () => {
    if (busy) return;
    setBusy(true); setNote(''); setOffers([]);
    try {
      const done = cd_doneOn(cd_tasks(), day).slice(0, 8).map(t => cd_clip(t.text, 80));
      const m = cd_mood(mood), en = cd_energy(energy);
      const content = [`Finished: ${done.length ? done.join('; ') : 'nothing ticked off'}`, m ? `Mood: ${m.label}` : '', en ? `Energy: ${en.label}` : ''].filter(Boolean).join('\n');
      const lines = cd_offerLines(await callClaude({ system: CD_LINE_SYSTEM, messages: [{ role: 'user', content }], maxTokens: 1500, effort: 'low' }));
      if (!lines.length) throw new Error('empty');
      setOffers(lines);
    } catch (e) {
      const signIn = /^sign in/i.test(String((e && e.message) || ''));
      setNote(signIn ? 'Sign in (top right) and I can offer a line. Your own words are lovely too.' : 'I could not reach Claude just now. Your own words are the best ones anyway.');
    } finally { setBusy(false); }
  };
  return (
    <div>
      <CdStepHead title={`How ${dayWord} felt`} sub="No right answers. Just notice."/>
      <div role="radiogroup" aria-label="Mood" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: isMobile ? 6 : 10 }}>
        {CD_MOODS.map(m => { const on = mood === m.v; return (
          <button key={m.v} role="radio" aria-checked={on} aria-label={m.label} className="cd-tap" onClick={() => setMood(on ? null : m.v)}
            style={{ minHeight: 72, padding: '8px 2px', borderRadius: 18, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? m.tint : C.border}`, background: on ? `${m.tint}38` : C.card, boxShadow: on ? `0 6px 16px ${m.tint}50` : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: on ? 30 : 26, lineHeight: 1, transition: 'font-size .15s', filter: mood && !on ? 'grayscale(.6)' : 'none', opacity: mood && !on ? .6 : 1 }}>{m.face}</span>
            <span style={{ fontSize: 11, color: on ? C.text : C.textLight }}>{m.label}</span>
          </button>
        ); })}
      </div>
      <div style={{ fontSize: 12, color: C.textLight, textTransform: 'uppercase', letterSpacing: .8, margin: '20px 0 8px' }}>Energy</div>
      <div role="radiogroup" aria-label="Energy" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {CD_ENERGY.map(en => { const on = energy === en.v; return (
          <button key={en.v} role="radio" aria-checked={on} className="cd-tap" onClick={() => setEnergy(on ? null : en.v)}
            style={cd_soft({ flex: '1 1 90px', minHeight: 44, background: on ? C.rose : `${C.pink}50`, color: on ? '#fff' : C.rose, borderColor: on ? C.rose : C.border, boxShadow: on ? `0 4px 12px ${C.rose}35` : 'none' })}>{en.icon} {en.label}</button>
        ); })}
      </div>
      <div style={{ ...cd_serif(18), margin: '24px 0 8px' }}>{dayWord === 'today' ? 'Today' : cd_weekday(day)} in a sentence</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <textarea ref={box} className="cd-input" value={sentence} rows={3} maxLength={240} placeholder={starter + '…'} aria-label="The day in a sentence"
          onChange={e => setSentence(e.target.value)} style={cd_field({ resize: 'none', fontFamily: "'DM Serif Display',serif", fontSize: 17, flex: 1 })}/>
        {typeof VoiceButton === 'function' && <div style={{ flexShrink: 0, paddingTop: 4 }}><VoiceButton size={40} onText={t => setSentence(((sentence || '').trim() + ' ' + String(t || '').trim()).trim().slice(0, 240))}/></div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: C.textMuted, marginTop: 5 }}>
        <span>One line is plenty. It becomes your line-a-day journal.</span>
        <span style={{ flexShrink: 0 }}>{sentence.length > 180 ? `${240 - sentence.length} left` : ''}</span>
      </div>
      {!sentence.trim() && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: C.textLight, marginBottom: 8 }}>Need a way in?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CD_STARTERS.map(s => <button key={s} className="cd-tap" onClick={() => startWith(s)} style={cd_soft({ fontSize: 12.5, background: `${C.lavender}50`, color: C.text })}>{s.trim()}…</button>)}
            <button className="cd-tap" onClick={offer} disabled={busy} title="Sends the titles of what you finished, and your mood, to Claude" style={cd_soft({ fontSize: 12.5, opacity: busy ? .6 : 1 })}>{busy ? 'Thinking…' : '✨ Offer me a line'}</button>
          </div>
        </div>
      )}
      {note && <div style={{ fontSize: 12.5, color: C.textLight, marginTop: 10, lineHeight: 1.55 }}>{note}</div>}
      {offers.length > 0 && !sentence.trim() && (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: C.textLight }}>Tap one to start from it, then make it yours.</div>
          {offers.map((o, i) => <button key={i} className="cd-tap" onClick={() => startWith(o.slice(0, 240))} style={{ textAlign: 'left', padding: '11px 14px', borderRadius: 14, border: `0.5px solid ${C.border}`, background: C.card, color: C.text, fontFamily: "'DM Serif Display',serif", fontSize: 15, lineHeight: 1.45, cursor: 'pointer', minHeight: 44, overflowWrap: 'anywhere' }}>{o}</button>)}
        </div>
      )}
    </div>
  );
};

// ── Step 4: gratitude ──────────────────────────────────────────────────
const CdStepGratitude = ({ lines, hadWords, onChange }) => (
  <div>
    <CdStepHead title="Three good things" sub={hadWords ? 'You wrote these earlier. Add to them or change anything.' : 'Small ones count the most. The same words show on Home and in your planner.'}/>
    {[0, 1, 2].map(i => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span aria-hidden="true" style={cd_serif(20, { color: C.accent, width: 18, textAlign: 'center', flexShrink: 0 })}>{i + 1}</span>
        <input className="cd-input" value={lines[i] || ''} maxLength={200} placeholder={CD_GRAT_HINTS[i]} aria-label={`Gratitude ${i + 1}`}
          onChange={e => onChange(i, e.target.value)} style={cd_field({ flex: 1, minHeight: 46 })}/>
      </div>
    ))}
    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, lineHeight: 1.55 }}>🙏 Even on a hard day, one is enough.</div>
  </div>
);

// ── Step 5: tomorrow's top 3 ───────────────────────────────────────────
const CdStepTop3 = ({ next, nextWord, items, onChange, onPick }) => {
  const taken = new Set(items.map(x => x.text.trim().toLowerCase()).filter(Boolean));
  const ideas = cd_dueOn(cd_tasks(), next).filter(t => !taken.has(t.text.trim().toLowerCase())).slice(0, 6);
  const events = cd_eventsOn(next);
  const first = events.find(e => e.time) || events[0];
  const title = nextWord === 'tomorrow' ? 'Tomorrow’s Top 3' : `${cd_weekday(next)}’s Top 3`;
  return (
    <div>
      <CdStepHead title={title} sub="Decide now, so the morning does not have to. They will be waiting in your Daily planner."/>
      {events.length > 0 && first && (
        <div style={{ fontSize: 12.5, color: C.textLight, padding: '9px 13px', borderRadius: 14, background: `${C.lavender}40`, marginBottom: 14, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          🗓 {cd_plural(events.length, 'thing', 'things')} on the schedule{first.time ? `, starting with ${cd_clip(first.text, 50)} at ${cd_clock(first.time)}` : `, including ${cd_clip(first.text, 50)}`}.
        </div>
      )}
      {[0, 1, 2].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span aria-hidden="true" style={cd_serif(20, { color: C.accent, width: 18, textAlign: 'center', flexShrink: 0 })}>{i + 1}</span>
          <input className="cd-input" value={items[i].text} maxLength={200} aria-label={`Top 3, number ${i + 1}`}
            placeholder={['The one thing that matters most', 'Then this', 'And this'][i]}
            onChange={e => onChange(i, e.target.value)} style={cd_field({ flex: 1, minHeight: 46 })}/>
          {items[i].text.trim() !== '' && <button className="cd-tap" aria-label={`Clear number ${i + 1}`} onClick={() => onChange(i, '')} style={cd_quiet({ width: 40, padding: 0, flexShrink: 0, fontSize: 15 })}>✕</button>}
        </div>
      ))}
      {ideas.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: C.textLight, marginBottom: 8 }}>Already waiting for {nextWord}. Tap to add:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ideas.map(t => <button key={t.id} className="cd-tap" onClick={() => onPick(t.text.trim())} style={cd_soft({ fontSize: 12.5, maxWidth: '100%', textAlign: 'left', padding: '8px 14px', lineHeight: 1.35, overflowWrap: 'anywhere', background: `${C.lavender}50`, color: C.text })}>＋ {cd_clip(t.text, 70)}</button>)}
          </div>
        </div>
      ) : !taken.size && (
        <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 8, lineHeight: 1.55 }}>Nothing is dated for {nextWord} yet. Name what matters and let the rest wait.</div>
      )}
    </div>
  );
};

// ── The ending ─────────────────────────────────────────────────────────
const CdEnding = ({ day, mood, sentence, streak, onDone }) => {
  let moon = { idx: 0, emoji: '🌙', label: 'Tonight’s moon' };
  try { const m = getMoonForDate(new Date()); if (m && m.emoji) moon = m; } catch (e) {}
  const line = CD_MOON_LINES[moon.idx] || CD_MOON_LINES[0];
  return (
    <div className="cd-step" style={{ position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto', background: C.gradNight, color: '#E8D0F5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'calc(36px + env(safe-area-inset-top,0px)) 26px calc(36px + env(safe-area-inset-bottom,0px))' }}>
      <CdStars count={10}/>
      <div className="cd-moon" style={{ fontSize: 76, lineHeight: 1, marginBottom: 14 }}>{moon.emoji}</div>
      <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: '#b495d6', fontWeight: 600 }}>{moon.label}</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, margin: '14px 0 10px', color: '#f6e6ff' }}>The day is closed</div>
      <div style={{ fontSize: 14.5, lineHeight: 1.7, color: '#d9c2ec', maxWidth: 360 }}>{line}</div>
      {mood && CD_MOOD_LINES[mood] && <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#cdb3e3', maxWidth: 360, marginTop: 6 }}>{CD_MOOD_LINES[mood]}</div>}
      {sentence && <div style={{ fontFamily: "'DM Serif Display',serif", fontStyle: 'italic', fontSize: 16, lineHeight: 1.55, color: '#f6e6ff', maxWidth: 380, marginTop: 22, padding: '14px 18px', borderRadius: 18, background: 'rgba(255,255,255,.07)', border: '0.5px solid rgba(255,255,255,.14)', overflowWrap: 'anywhere' }}>“{sentence}”</div>}
      {streak > 1 && <div style={{ fontSize: 12.5, color: '#b495d6', marginTop: 18 }}>🌙 {streak} nights in a row</div>}
      {streak === 1 && <div style={{ fontSize: 12.5, color: '#b495d6', marginTop: 18 }}>Night one. A lovely place to start.</div>}
      <button className="cd-tap" onClick={onDone} style={{ marginTop: 28, minHeight: 46, padding: '0 34px', borderRadius: 24, border: '0.5px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.14)', color: '#fff', fontFamily: 'inherit', fontSize: 14.5, cursor: 'pointer' }}>Done. Sleep well</button>
    </div>
  );
};

// ── The ritual ─────────────────────────────────────────────────────────
const CdRitual = ({ day, onClose, startStep = 0 }) => {
  const isMobile = useIsMobile();
  const next = cd_shift(day, 1);
  const late = cd_key(new Date()) !== day;          // past midnight: "today" would be the wrong word
  const dayWord = late ? cd_weekday(day) : 'today';
  const nextWord = late ? 'later today' : 'tomorrow';
  const [init] = React.useState(() => {
    const draft = cd_draft(day), saved = cd_clean(cd_closes()[day]);
    const has = k => draft && draft[k] !== undefined;
    const grat = cd_gratSplit(cd_raw(cd_gratKey(day)));
    return {
      mood: has('mood') ? cd_int(draft.mood, 1, 5) : saved ? saved.mood : null,
      energy: has('energy') ? cd_int(draft.energy, 1, 3) : saved ? saved.energy : null,
      sentence: has('sentence') && typeof draft.sentence === 'string' ? draft.sentence : saved ? saved.sentence : '',
      moved: draft && Array.isArray(draft.moved) ? draft.moved : [],
      grat, hadWords: grat.lines.some(Boolean),
      top3: cd_top3Read(next),
      ids: cd_leftOn(cd_tasks(), day).map(t => t.id),
      wasClosed: !!saved,
    };
  });
  const [step, setStep] = React.useState(Math.min(Math.max(0, startStep), 5));
  const [mood, setMood] = React.useState(init.mood);
  const [energy, setEnergy] = React.useState(init.energy);
  const [sentence, setSentence] = React.useState(init.sentence);
  const [lines, setLines] = React.useState(init.grat.lines);
  const [top3, setTop3] = React.useState(init.top3);
  const [resolved, setResolved] = React.useState({});
  const [moved, setMoved] = React.useState(init.moved);
  const [streak, setStreak] = React.useState(0);
  const dirty = React.useRef({ grat: false, top3: false, draft: false });
  const closed = React.useRef(false);
  const live = React.useRef(null);
  live.current = { mood, energy, sentence, lines, top3, moved };
  const scroller = React.useRef(null);

  // Writes whatever she has typed. Gratitude and Top 3 are only written once she has changed them here.
  const flush = () => {
    const s = live.current; if (!s) return;
    if (dirty.current.grat) { dirty.current.grat = false; if (cd_write(cd_gratKey(day), cd_gratJoin(s.lines, init.grat.rest))) cd_emit('nyla-gratitude-changed'); }
    if (dirty.current.top3) { dirty.current.top3 = false; cd_write(cd_top3Key(next), s.top3.map(x => ({ text: x.text, done: !!x.done }))); }
    if (dirty.current.draft && !closed.current) { dirty.current.draft = false; cd_write('nyla_closeday_draft', { day, mood: s.mood, energy: s.energy, sentence: s.sentence, moved: s.moved }); }
  };
  React.useEffect(() => { const t = setTimeout(flush, 700); return () => clearTimeout(t); }, [mood, energy, sentence, lines, top3, moved]);
  React.useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    const key = e => { if (e.key === 'Escape') leave(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', flush);
    window.addEventListener('keydown', key);
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      flush();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('keydown', key);
      document.body.style.overflow = was;
    };
  }, []);
  React.useEffect(() => { const el = scroller.current; if (el) el.scrollTop = 0; }, [step]);

  const touch = (what, set) => v => { dirty.current[what] = true; set(v); };
  const setMoodD = touch('draft', setMood), setEnergyD = touch('draft', setEnergy), setSentenceD = touch('draft', setSentence);
  const setLine = (i, v) => { dirty.current.grat = true; setLines(ls => ls.map((x, j) => (j === i ? v : x))); };
  const setTop = (i, v) => { dirty.current.top3 = true; setTop3(ts => ts.map((x, j) => (j === i ? { text: v, done: v.trim() ? x.done : false } : x))); };
  const pickTop = text => {
    const i = top3.findIndex(x => !x.text.trim());
    if (i < 0) { toast('Your three are full. Clear one to swap this in.', 'info', 2600); return; }
    setTop(i, text);
  };
  const noteMoved = (ids, on) => { dirty.current.draft = true; setMoved(m => (on ? [...new Set([...m, ...ids])] : m.filter(x => !ids.includes(x)))); };

  const act = (t, kind, to) => {
    if (kind === 'done') {
      if (!cd_toggleDone(t.id, day)) return;
      setResolved(r => ({ ...r, [t.id]: { kind, prev: t.calendarDate } }));
      return;
    }
    if (!cd_changeTasks(raw => cd_redate(raw, [t.id], to))) return;
    setResolved(r => ({ ...r, [t.id]: { kind, to, prev: t.calendarDate } }));
    if (kind !== 'letgo') noteMoved([t.id], true);
  };
  const undo = t => {
    const r = resolved[t.id]; if (!r) return;
    const ok = r.kind === 'done' ? cd_toggleDone(t.id, day) : cd_changeTasks(raw => cd_redate(raw, [t.id], r.prev));
    if (!ok) return;
    setResolved(x => { const n = { ...x }; delete n[t.id]; return n; });
    noteMoved([t.id], false);
  };
  const moveRest = open => {
    const ids = open.map(t => t.id);
    if (!cd_changeTasks(raw => cd_redate(raw, ids, next))) return;
    setResolved(r => { const n = { ...r }; open.forEach(t => { n[t.id] = { kind: 'next', to: next, prev: t.calendarDate }; }); return n; });
    noteMoved(ids, true);
  };

  const go = n => { flush(); setStep(Math.min(Math.max(0, n), 4)); };
  // Writes the close itself. The first closing time is kept when she opens a closed night again.
  const record = () => {
    const s = live.current;
    flush();
    const prev = cd_clean(cd_closes()[day]);
    const ok = cd_saveClose(day, {
      mood: s.mood, energy: s.energy, sentence: s.sentence.trim(),
      gratitude: s.lines.map(l => l.trim()).filter(Boolean).slice(0, 3),
      closedAt: (prev && prev.closedAt) || new Date().toISOString(),
      doneCount: cd_doneOn(cd_tasks(), day).length,
      movedCount: (prev ? prev.movedCount : 0) + s.moved.length,
    });
    if (!ok) return false;
    closed.current = true;
    dirty.current.draft = false;
    cd_remove('nyla_closeday_draft');
    live.current = { ...s, moved: [] };
    setMoved([]);
    return true;
  };
  const finish = () => {
    if (!record()) return;
    setStreak(cd_streak(cd_closes(), day));
    setStep(5);
  };
  // Leaving part way: an open night keeps a draft; a night that was already closed keeps the changes.
  const leave = () => {
    const s = live.current || {};
    const anything = !closed.current && (dirty.current.draft || dirty.current.grat || dirty.current.top3 || (s.moved || []).length > 0);
    if (anything && init.wasClosed) { if (record()) { try { toast('Changes saved ✓', 'success', 1800); } catch (e) {} } }
    else {
      flush();
      if (anything) { try { toast('Kept for later. Pick it back up any time tonight.', 'success', 2600); } catch (e) {} }
    }
    onClose();
  };

  const body = step === 0 ? <CdStepDone day={day} dayWord={dayWord}/>
    : step === 1 ? <CdStepLeft day={day} next={next} nextWord={nextWord} ids={init.ids} resolved={resolved} onAct={act} onUndo={undo} onMoveRest={moveRest}/>
    : step === 2 ? <CdStepFelt day={day} dayWord={dayWord} mood={mood} setMood={setMoodD} energy={energy} setEnergy={setEnergyD} sentence={sentence} setSentence={setSentenceD}/>
    : step === 3 ? <CdStepGratitude lines={lines} hadWords={init.hadWords} onChange={setLine}/>
    : <CdStepTop3 next={next} nextWord={nextWord} items={top3} onChange={setTop} onPick={pickTop}/>;

  const sheet = (
    <div className="cd-sheet" role="dialog" aria-modal="true" aria-label="Close the day" onClick={e => e.stopPropagation()}
      style={isMobile
        ? { position: 'absolute', inset: 0, background: C.cream, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
        : { width: 'min(580px, calc(100vw - 48px))', height: 'min(720px, calc(100vh - 64px))', background: C.cream, borderRadius: 26, border: `0.5px solid ${C.border}`, boxShadow: '0 30px 80px rgba(30,10,40,.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {step === 5 ? <CdEnding day={day} mood={mood} sentence={sentence.trim()} streak={streak} onDone={onClose}/> : (
        <React.Fragment>
          <div style={{ padding: `calc(${isMobile ? 12 : 16}px + env(safe-area-inset-top,0px)) ${isMobile ? 12 : 20}px 8px`, borderBottom: `0.5px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: C.textMuted, fontWeight: 600 }}>Close the day</div>
                <div style={{ fontSize: 12.5, color: C.textLight, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cd_longDate(day)}</div>
              </div>
              <button className="cd-tap" aria-label="Close and keep for later" onClick={leave} style={cd_quiet({ width: 44, minHeight: 44, padding: 0, fontSize: 17 })}>✕</button>
            </div>
            <div role="tablist" aria-label="Steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 4, marginTop: 4 }}>
              {CD_STEPS.map((s, i) => (
                <button key={i} role="tab" aria-selected={i === step} aria-label={`Step ${i + 1}: ${s.name}`} className="cd-tap" onClick={() => go(i)}
                  style={{ minHeight: 44, padding: '2px 0 4px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: i === step ? 19 : 15, lineHeight: '22px', opacity: i <= step ? 1 : .32, transition: 'all .2s' }}>{s.moon}</span>
                  <span style={{ width: '100%', height: 3, borderRadius: 3, background: i <= step ? `linear-gradient(90deg, ${C.rose}, ${C.accent})` : `${C.pink}70`, opacity: i < step ? .55 : 1 }}/>
                </button>
              ))}
            </div>
          </div>
          <div ref={scroller} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', padding: isMobile ? '20px 16px 24px' : '26px 30px 28px' }}>
            <div key={step} className="cd-step">{body}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0, borderTop: `0.5px solid ${C.border}`, background: C.card, padding: `10px ${isMobile ? 12 : 20}px calc(10px + env(safe-area-inset-bottom,0px))` }}>
            {step > 0 ? <button className="cd-tap" onClick={() => go(step - 1)} style={cd_quiet({ minHeight: 44 })}>← Back</button> : <span style={{ fontSize: 12, color: C.textMuted, paddingLeft: 6 }}>About three minutes</span>}
            <span style={{ flex: 1 }}/>
            {step < 4 && <button className="cd-tap" onClick={() => go(step + 1)} style={cd_quiet({ minHeight: 44 })}>Skip</button>}
            {step < 4
              ? <button className="cd-tap" onClick={() => go(step + 1)} style={cd_primary()}>Next</button>
              : <button className="cd-tap" onClick={finish} style={cd_primary()}>Close the day 🌙</button>}
          </div>
        </React.Fragment>
      )}
    </div>
  );
  const layer = (
    <div onClick={e => { e.stopPropagation(); if (!isMobile) leave(); }} style={{ position: 'fixed', inset: 0, zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isMobile ? C.cream : 'rgba(26,10,38,.5)', backdropFilter: isMobile ? 'none' : 'blur(6px)', WebkitBackdropFilter: isMobile ? 'none' : 'blur(6px)', color: C.text, fontFamily: "'DM Sans',sans-serif" }}>
      <CdStyles/>
      {sheet}
    </div>
  );
  return typeof ReactDOM !== 'undefined' && ReactDOM.createPortal && typeof document !== 'undefined' && document.body ? ReactDOM.createPortal(layer, document.body) : layer;
};

// Re-reads the clock each minute and whenever a close changes, so the card
// appears at 6 pm and the page rolls over at 3 am without a reload.
const cd_useNow = () => {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const tick = () => setNow(new Date());
    const seen = () => { if (document.visibilityState === 'visible') tick(); };
    const id = setInterval(tick, 60000);
    window.addEventListener('nyla-closeday-changed', tick);
    window.addEventListener('nyla-tasks-changed', tick);
    document.addEventListener('visibilitychange', seen);
    return () => { clearInterval(id); window.removeEventListener('nyla-closeday-changed', tick); window.removeEventListener('nyla-tasks-changed', tick); document.removeEventListener('visibilitychange', seen); };
  }, []);
  return now;
};

// ── Home card ──────────────────────────────────────────────────────────
const CdCardBody = () => {
  const isMobile = useIsMobile();
  const now = cd_useNow();
  const [openDay, setOpenDay] = React.useState(null);
  const day = cd_day(now);
  const closes = cd_closes();
  const isClosed = !!cd_clean(closes[day]);
  const evening = cd_isEvening(now) || cd_raw('nyla_closeday_force') === '1';
  const skipped = cd_raw('nyla_closeday_skip') === day;
  const late = cd_key(now) !== day;
  let body = null;
  if (evening && isClosed) {
    body = (
      <button className="cd-tap" onClick={() => window._navigateTo && window._navigateTo('reflect', 'Close the Day')} title="Open Close the Day"
        style={{ display: 'block', width: '100%', minHeight: 40, margin: '0 0 16px', padding: '6px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: C.textLight, textAlign: 'center' }}>
        Day closed ✓ Sleep well
      </button>
    );
  } else if (evening && !skipped) {
    const tasks = cd_tasks();
    const done = cd_doneOn(tasks, day).length, left = cd_leftOn(tasks, day).length;
    const streak = cd_streak(closes, day);
    const bits = [done ? `${cd_plural(done, 'thing', 'things')} finished` : '', left ? `${left} to put down` : '', streak ? `${cd_plural(streak, 'night', 'nights')} in a row so far` : ''].filter(Boolean);
    let moon = '🌙'; try { moon = getMoonForDate(now).emoji || moon; } catch (e) {}
    body = (
      <Card style={{ position: 'relative', overflow: 'hidden', marginBottom: 16, background: C.gradNight, border: 'none', padding: isMobile ? '18px 16px' : '22px 24px' }}>
        <CdStars count={isMobile ? 6 : 9}/>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 18, flexWrap: 'wrap' }}>
          <div className="cd-moon" aria-hidden="true" style={{ fontSize: isMobile ? 34 : 42, lineHeight: 1 }}>{moon}</div>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: isMobile ? 19 : 22, color: '#f6e6ff', lineHeight: 1.25 }}>Ready to close the day? 🌙</div>
            <div style={{ fontSize: 12.5, color: '#cdb3e3', marginTop: 5, lineHeight: 1.55 }}>
              {late ? `It is past midnight. Put ${cd_weekday(day)} to bed in a few gentle minutes.` : 'A few gentle minutes to put today down and set up tomorrow.'}
            </div>
            {bits.length > 0 && <div style={{ fontSize: 11.5, color: '#b495d6', marginTop: 6 }}>{bits.join(' · ')}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button className="cd-tap" onClick={() => setOpenDay(day)} style={{ minHeight: 44, padding: '0 24px', borderRadius: 22, border: '0.5px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.16)', color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>{cd_draft(day) ? 'Pick it back up' : 'Begin'}</button>
            <button className="cd-tap" onClick={() => { cd_write('nyla_closeday_skip', day); cd_emit('nyla-closeday-changed'); toast('No close tonight. Rest well 🌙', 'success', 2200); }}
              style={{ minHeight: 44, padding: '0 12px', borderRadius: 22, border: 'none', background: 'transparent', color: '#b495d6', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer' }}>Not tonight</button>
          </div>
        </div>
      </Card>
    );
  }
  if (!body && !openDay) return null;
  return (
    <React.Fragment>
      <CdStyles/>
      <React.Fragment key="body">{body}</React.Fragment>
      {openDay && <CdBoundary key="ritual" name="Close the Day ritual"><CdRitual day={openDay} onClose={() => setOpenDay(null)}/></CdBoundary>}
    </React.Fragment>
  );
};
const CloseDayCard = () => <CdBoundary name="Close the Day card"><CdCardBody/></CdBoundary>;

// ── Reflect > Close the Day ────────────────────────────────────────────
const CdTonight = ({ day, now, entry, onStart }) => {
  const isMobile = useIsMobile();
  const late = cd_key(now) !== day;
  const tasks = cd_tasks();
  const done = cd_doneOn(tasks, day).length, left = cd_leftOn(tasks, day).length;
  const { due, kept } = cd_habits(day);
  let moon = { emoji: '🌙', label: '' }; try { moon = getMoonForDate(now) || moon; } catch (e) {}
  const early = !entry && !cd_isEvening(now);
  const m = entry && cd_mood(entry.mood), en = entry && cd_energy(entry.energy);
  const top3 = cd_top3Read(cd_shift(day, 1)).filter(x => x.text.trim());
  const chip = (children, key) => <span key={key} className="glass-chip" style={{ maxWidth: '100%' }}>{children}</span>;
  return (
    <Card style={{ background: C.gradA, position: 'relative', overflow: 'hidden', padding: isMobile ? '20px 16px' : '26px 28px' }}>
      <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: C.textLight, fontWeight: 600 }}>{late ? 'Last night, still open' : 'Tonight'}</div>
      <div style={cd_serif(isMobile ? 23 : 28, { margin: '6px 0 12px' })}>{cd_longDate(day)}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {chip(`${moon.emoji} ${moon.label}`, 'moon')}
        {chip(done ? `✓ ${done} finished` : 'Nothing ticked yet', 'done')}
        {left > 0 && chip(`${left} still open`, 'left')}
        {due.length > 0 && chip(`🌿 ${kept.length}/${due.length} habits`, 'habits')}
      </div>
      {entry ? (
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', padding: '14px 16px', borderRadius: 16, background: C.card, border: `0.5px solid ${C.border}` }}>
            {m && <div style={{ textAlign: 'center', flexShrink: 0 }}><div style={{ fontSize: 30, lineHeight: 1 }}>{m.face}</div><div style={{ fontSize: 10.5, color: C.textLight, marginTop: 4 }}>{m.label}</div></div>}
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17, color: C.text, lineHeight: 1.5, overflowWrap: 'anywhere', fontStyle: entry.sentence ? 'normal' : 'italic', opacity: entry.sentence ? 1 : .6 }}>{entry.sentence ? `“${entry.sentence}”` : 'Closed without a line. You can still add one.'}</div>
              <div style={{ fontSize: 12, color: C.textLight, marginTop: 6, lineHeight: 1.6 }}>
                {[en && `${en.icon} ${en.label} energy`, entry.doneCount ? `${entry.doneCount} done` : '', entry.movedCount ? `${entry.movedCount} moved on` : ''].filter(Boolean).join(' · ')}
              </div>
              {entry.gratitude.length > 0 && <div style={{ fontSize: 12.5, color: C.textLight, marginTop: 6, lineHeight: 1.6, overflowWrap: 'anywhere' }}>🙏 {entry.gratitude.join(' · ')}</div>}
              {top3.length > 0 && <div style={{ fontSize: 12.5, color: C.textLight, marginTop: 4, lineHeight: 1.6, overflowWrap: 'anywhere' }}>✨ Next up: {top3.map(x => x.text.trim()).join(' · ')}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <span style={{ fontSize: 13, color: C.textLight }}>Day closed ✓ Sleep well</span>
            <span style={{ flex: 1 }}/>
            <button className="cd-tap" onClick={() => onStart(2)} style={cd_soft({ minHeight: 44 })}>Open tonight’s close again</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button className="cd-tap" onClick={() => onStart(0)} style={cd_primary({ minHeight: 46, padding: '0 28px' })}>{cd_draft(day) ? 'Pick it back up 🌙' : 'Start tonight’s close 🌙'}</button>
          <span style={{ flex: '1 1 180px', minWidth: 0, fontSize: 12.5, color: C.textLight, lineHeight: 1.55 }}>
            {early ? 'It is still early. You can close whenever the day feels finished.' : 'Five gentle steps, each one skippable. About three minutes.'}
          </span>
        </div>
      )}
    </Card>
  );
};

const CdStrip = ({ day, closes }) => {
  const isMobile = useIsMobile();
  const [picked, setPicked] = React.useState(null);
  const weeks = cd_weeks(day, 8);
  const rows = isMobile ? weeks : [0, 1, 2, 3].map(i => [...weeks[i * 2], ...weeks[i * 2 + 1]]);
  const cols = isMobile ? 7 : 14;
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const pick = picked ? cd_clean(closes[picked]) : null;
  const pm = pick && cd_mood(pick.mood);
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <SectionHeading style={{ marginBottom: 0 }}>🌙 The last 8 weeks</SectionHeading>
        <span style={{ fontSize: 11.5, color: C.textMuted }}>Tap a night to read it</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: isMobile ? 5 : 6 }}>
        {Array.from({ length: cols }, (_, i) => <div key={'h' + i} style={{ textAlign: 'center', fontSize: 10, color: C.textMuted, letterSpacing: .5 }}>{letters[i % 7]}</div>)}
        {rows.flat().map(k => {
          const c = cd_clean(closes[k]); const m = c && cd_mood(c.mood);
          const future = k > day, isDay = k === day, on = picked === k;
          const n = cd_date(k).getDate();
          const label = `${cd_longDate(k)}${c ? (m ? ', ' + m.label : ', closed') : future ? '' : ', not closed'}`;
          return (
            <button key={k} className="cd-tap" aria-label={label} title={label} disabled={future} onClick={() => setPicked(on ? null : k)}
              style={{ height: 40, minWidth: 0, padding: 0, borderRadius: 12, cursor: future ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 11.5,
                color: m ? (m.v === 5 ? '#fff' : '#401828') : c ? C.rose : C.textMuted, opacity: future ? .3 : 1,
                background: m ? m.tint : c ? `${C.pink}70` : 'transparent',
                border: on ? `2px solid ${C.rose}` : isDay ? `1.5px solid ${C.accent}` : m || c ? '1.5px solid transparent' : `1px dashed ${C.border}`,
                boxShadow: on ? `0 4px 12px ${C.rose}35` : 'none' }}>
              {n === 1 ? cd_date(k).toLocaleDateString('en-US', { month: 'short' }) : n}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
        {CD_MOODS.map(m => <span key={m.v} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.textLight }}><span style={{ width: 12, height: 12, borderRadius: 4, background: m.tint }}/>{m.label}</span>)}
      </div>
      {picked && (
        <div className="cd-step" style={{ marginTop: 14, padding: '12px 14px', borderRadius: 14, background: `${C.lavender}35`, border: `0.5px solid ${C.border}` }}>
          <div style={{ fontSize: 11.5, color: C.textLight, marginBottom: 4 }}>{cd_longDate(picked)}{pm ? ` · ${pm.face} ${pm.label}` : ''}</div>
          {pick
            ? <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 15.5, color: C.text, lineHeight: 1.5, overflowWrap: 'anywhere', fontStyle: pick.sentence ? 'normal' : 'italic', opacity: pick.sentence ? 1 : .6 }}>{pick.sentence || 'Closed without a line.'}</div>
            : <div style={{ fontSize: 13, color: C.textLight, lineHeight: 1.55 }}>{picked === day ? 'Tonight is still open.' : 'No close this night. Some nights are just for sleeping.'}</div>}
          {pick && pick.gratitude.length > 0 && <div style={{ fontSize: 12.5, color: C.textLight, marginTop: 6, lineHeight: 1.6, overflowWrap: 'anywhere' }}>🙏 {pick.gratitude.join(' · ')}</div>}
        </div>
      )}
    </Card>
  );
};

const CdJournalRow = ({ e, last }) => {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(e.sentence);
  const d = cd_date(e.day); const m = cd_mood(e.mood);
  const save = () => { if (cd_saveClose(e.day, { sentence: text.trim() })) { setEditing(false); toast('Saved', 'success', 1200); } };
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 0', borderBottom: last ? 'none' : `0.5px solid ${C.border}` }}>
      <div style={{ width: 46, flexShrink: 0, textAlign: 'center', padding: '6px 0', borderRadius: 14, background: m ? `${m.tint}38` : `${C.pink}40` }}>
        <div style={{ fontSize: 9.5, letterSpacing: .8, textTransform: 'uppercase', color: C.textLight }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        <div style={cd_serif(20, { lineHeight: 1.15 })}>{d.getDate()}</div>
        <div style={{ fontSize: 9.5, color: C.textLight }}>{d.toLocaleDateString('en-US', { month: 'short' })}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div>
            <textarea className="cd-input" value={text} rows={3} maxLength={240} autoFocus aria-label={`The line for ${cd_longDate(e.day)}`} onChange={ev => setText(ev.target.value)}
              style={cd_field({ resize: 'none', fontFamily: "'DM Serif Display',serif", fontSize: 16 })}/>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button className="cd-tap" onClick={save} style={cd_primary({ minHeight: 40, padding: '0 18px', fontSize: 13 })}>Save</button>
              <button className="cd-tap" onClick={() => { setText(e.sentence); setEditing(false); }} style={cd_quiet()}>Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: C.text, lineHeight: 1.5, overflowWrap: 'anywhere', fontStyle: e.sentence ? 'normal' : 'italic', opacity: e.sentence ? 1 : .55 }}>{e.sentence || 'A quiet night, no line.'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              <span style={{ fontSize: 11.5, color: C.textMuted, overflowWrap: 'anywhere', minWidth: 0 }}>{[m && `${m.face} ${m.label}`, e.gratitude.length ? `🙏 ${e.gratitude.join(' · ')}` : ''].filter(Boolean).join('  ·  ')}</span>
              <button className="cd-tap" onClick={() => { setText(e.sentence); setEditing(true); }} aria-label={`${e.sentence ? 'Edit' : 'Add'} the line for ${cd_longDate(e.day)}`} style={cd_quiet({ fontSize: 12, color: C.rose, marginLeft: 'auto' })}>{e.sentence ? 'Edit' : 'Add a line'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const CdJournal = ({ entries, onStart }) => {
  const [month, setMonth] = React.useState('all');
  const [more, setMore] = React.useState(false);
  const months = [...new Set(entries.map(e => e.day.slice(0, 7)))];
  const active = month !== 'all' && months.includes(month) ? month : 'all';
  const list = active === 'all' ? entries : entries.filter(e => e.day.slice(0, 7) === active);
  const shown = more || active !== 'all' ? list : list.slice(0, 30);
  const written = list.filter(e => e.sentence);
  const short = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1, 12).toLocaleDateString('en-US', { month: 'short', year: y === new Date().getFullYear() ? undefined : '2-digit' }); };
  const pdf = () => {
    if (!written.length) { toast('There are no lines to print here yet.', 'info', 2400); return; }
    try {
      const title = active === 'all' ? 'A line a day' : `A line a day: ${cd_monthLabel(active)}`;
      printAsPdf(title, cd_journalHtml(written), cd_plural(written.length, 'night', 'nights'), 'close the day');
    } catch (e) { toast('The PDF could not be made just now. Try again in a moment.', 'error', 3500); }
  };
  if (!entries.length) {
    return <EmptyState icon="🌙" title="Your line-a-day journal starts tonight" text="Each night you close the day, one sentence lands here. A year from now you can read the whole year in a few minutes."
      action={<button className="cd-tap" onClick={() => onStart(0)} style={cd_primary()}>Write the first line</button>}/>;
  }
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <SectionHeading style={{ marginBottom: 0 }}>📖 A line a day</SectionHeading>
        <span style={{ flex: 1 }}/>
        <button className="cd-tap" onClick={pdf} style={cd_soft()}>⬇ Download PDF</button>
      </div>
      {months.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          <Pill active={active === 'all'} onClick={() => setMonth('all')} style={{ minHeight: 40 }}>All</Pill>
          {months.map(ym => <Pill key={ym} active={active === ym} onClick={() => setMonth(ym)} style={{ minHeight: 40 }}>{short(ym)}</Pill>)}
        </div>
      )}
      {shown.map((e, i) => <CdJournalRow key={e.day} e={e} last={i === shown.length - 1}/>)}
      {list.length > shown.length && <button className="cd-tap" onClick={() => setMore(true)} style={cd_quiet({ color: C.rose })}>Show {list.length - shown.length} older nights</button>}
    </Card>
  );
};

const CdPageBody = () => {
  const isMobile = useIsMobile();
  const now = cd_useNow();
  const [open, setOpen] = React.useState(null); // { day, step }
  const day = cd_day(now);
  const closes = cd_closes();
  const entries = cd_entries(closes);
  const entry = cd_clean(closes[day]);
  const streak = cd_streak(closes, day), longest = cd_longest(closes);
  const before = cd_lookbacks(closes, day).slice(0, 3);
  const start = step => setOpen({ day, step });
  const streakLine = streak > 1 ? `${streak} nights in a row` : streak === 1 ? (entry ? 'One night down. Come back tomorrow to make it two.' : 'One night so far. Tonight makes it two.') : entries.length ? 'A fresh start tonight. No catching up needed.' : 'Tonight can be night one.';
  const tile = (label, value, sub) => (
    <div style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center', padding: '12px 6px', borderRadius: 16, background: `${C.pinkLight}`, border: `0.5px solid ${C.border}` }}>
      <div style={cd_serif(26)}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.textLight, textTransform: 'uppercase', letterSpacing: .6, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <div>
      <CdStyles/>
      <PageTitle subtitle="A few quiet minutes to put the day down and set up tomorrow.">Close the Day</PageTitle>
      <div style={{ display: 'grid', gap: isMobile ? 12 : 16 }}>
        <CdTonight day={day} now={now} entry={entry} onStart={start}/>
        {entries.length > 0 && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <span aria-hidden="true" style={{ fontSize: 24 }}>{streak > 1 ? '🔥' : '🌙'}</span>
              <div style={cd_serif(streak > 1 ? 22 : 17, { flex: '1 1 200px', minWidth: 0 })}>{streakLine}</div>
            </div>
            <div style={{ display: 'flex', gap: isMobile ? 8 : 12 }}>
              {tile('In a row', streak)}
              {tile('Longest', longest)}
              {tile('Nights kept', entries.length)}
            </div>
          </Card>
        )}
        {before.length > 0 && (
          <Card style={{ background: `linear-gradient(135deg, ${C.lavender}50, ${C.pink}30)` }}>
            <SectionHeading>🕰 This night, before</SectionHeading>
            {before.map((b, i) => { const m = cd_mood(b.mood); return (
              <div key={b.day} style={{ padding: '10px 0', borderTop: i ? `0.5px solid ${C.border}` : 'none' }}>
                <div style={{ fontSize: 11.5, color: C.textLight, marginBottom: 3 }}>{b.label} · {cd_date(b.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{m ? ` · ${m.face}` : ''}</div>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: C.text, lineHeight: 1.5, overflowWrap: 'anywhere' }}>“{b.sentence}”</div>
              </div>
            ); })}
          </Card>
        )}
        {entries.length > 0 && <CdStrip day={day} closes={closes}/>}
        <CdJournal entries={entries} onStart={start}/>
      </div>
      {open && <CdBoundary name="Close the Day ritual"><CdRitual day={open.day} startStep={open.step} onClose={() => setOpen(null)}/></CdBoundary>}
    </div>
  );
};
const cd_pageFallback = () => (
  <div style={{ padding: '30px 16px', textAlign: 'center', fontSize: 13.5, lineHeight: 1.6 }}>Close the Day hit a snag and could not open. Your nights are safe. Reload the page and try again.</div>
);
const CloseDayPage = () => <CdBoundary name="Close the Day page" fallback={cd_pageFallback()}><CdPageBody/></CdBoundary>;
