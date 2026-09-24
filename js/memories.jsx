/* ── On this day + Year in Review ──────────────────────────────────────
   Loads before the main app script: top level must not touch app globals
   (C, Card, toast, NATAL…). Only function bodies use them, because those
   run after the app has loaded. Every helper here is prefixed mem_ / Mem.

   OnThisDay      End of Home. Looks back one year, then six, three and one
                  month (same calendar day; the 31st falls back to a shorter
                  month's last day) and shows the first lookback that has
                  anything: ideas captured, notebook pages written or edited,
                  tasks finished, goals set. Renders nothing when none does.

   WrappedBanner  Under the Home hero from Dec 1 through Jan 7 (the January
                  days point at the year that just ended), and only when that
                  year has data. Dismissed per year: nyla_wrapped_dismissed_<year>.
                  Test hook: localStorage.setItem('nyla_wrapped_force','1')
                  shows it on any date (a dismissal still hides it; remove
                  nyla_wrapped_dismissed_<year> to bring it back).

   YearInReview   Home > Year in Review. Works year-to-date any time. A
                  tap-through story on phone (with a one-page option) and a
                  scrolling page on desktop. Reads no period or cycle data.

   Each of the three is wrapped in MemBoundary, so a render error stays inside
   the feature instead of blanking the app. Task text, titles and names are
   shown as typed (mem_text); only notebook pages, and idea content that holds
   real markup, go through the HTML-to-text path (mem_plain). */

// ── Shared helpers ─────────────────────────────────────────────────────
const mem_load = (key, fallback) => {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; }
  catch (e) { return fallback; }
};
const mem_lsGet = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
const mem_lsSet = (key, val) => { try { localStorage.setItem(key, val); } catch (e) {} };
const mem_list = key => { const v = mem_load(key, []); return Array.isArray(v) ? v.filter(Boolean) : []; };
const mem_dk = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mem_keyDate = k => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d, 12); };
// Local day key of a stored moment: a bare 'YYYY-MM-DD', an ISO string, or a Date.now() id.
const mem_dayOf = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const n = typeof v === 'number' ? v : /^\d{12,}$/.test(String(v)) ? Number(v) : Date.parse(v);
  if (!isFinite(n) || n < 946684800000) return null; // before 2000: not a real timestamp
  return mem_dk(new Date(n));
};
const mem_ideaDay = i => mem_dayOf(i.created) || mem_dayOf(i.id);
const mem_pageDay = p => mem_dayOf(p.created) || mem_dayOf(p.id);
const mem_goalYear = g => {
  const pv = String(g.periodValue || '');
  if (/^\d{4}/.test(pv)) return pv.slice(0, 4);
  if (/^\d{4}/.test(g.targetDate || '')) return g.targetDate.slice(0, 4);
  return (mem_dayOf(g.created) || mem_dayOf(g.id) || '').slice(0, 4) || String(new Date().getFullYear());
};
// Collapse whitespace, and shorten to max characters on a word boundary.
const mem_clip = (v, max) => {
  let s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (max && s.length > max) {
    const cut = s.slice(0, max - 1);
    const soft = cut.replace(/\s+\S*$/, '');
    s = (soft.length > max * 0.6 ? soft : cut).replace(/[\s,.;:]+$/, '') + '…';
  }
  return s;
};
// Fields the app stores as plain text (task text, titles, names, authors):
// shown exactly as typed, so "Fix <select> on phone" keeps its <select>.
const mem_text = (v, max) => mem_clip(v, max);
// Plain text from stored HTML (notebook pages). DOMParser never runs scripts or loads images.
const mem_plain = (html, max) => {
  let s = String(html == null ? '' : html);
  if (/[<&]/.test(s)) {
    try { s = new DOMParser().parseFromString(s.replace(/<(br|\/p|\/div|\/li|\/h\d)\b[^>]*>/gi, ' $&'), 'text/html').body.textContent || ''; }
    catch (e) { s = s.replace(/<[^>]+>/g, ' '); }
  }
  return mem_clip(s, max);
};
// Idea content is usually typed into a plain textarea; treat it as HTML only
// when it holds real markup (a closing tag, <br> or <img>), not a stray "<select>".
const MEM_HTML_TAG = /<\/(p|div|span|b|i|u|strong|em|h[1-6]|li|ul|ol|a|blockquote)\s*>|<(br|img|hr)\b[^>]*>/i;
// Captured ideas are stored HTML-escaped even when they hold no tags ("Tom &amp; Jerry"),
// so entities are decoded for display. The < is escaped first, so a stray "<select>"
// stays text; the result is only ever shown as text, never as HTML.
const mem_decode = s => {
  const str = String(s == null ? '' : s);
  if (!/&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(str)) return str;
  try { return new DOMParser().parseFromString(str.replace(/</g, '&lt;'), 'text/html').body.textContent || ''; }
  catch (e) { return str; }
};
const mem_maybeHtml = (v, max) => (MEM_HTML_TAG.test(String(v == null ? '' : v)) ? mem_plain(v, max) : mem_text(mem_decode(v), max));
const mem_fmtDay = (k, withYear) => mem_keyDate(k).toLocaleDateString('en-US', withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
const mem_ord = n => n + (['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const mem_plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : (many || one + 's')}`;
const MEM_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MEM_NB_FOLDERS = [{ id: 1, name: 'All Notes' }, { id: 2, name: 'Journal' }, { id: 3, name: 'Ideas' }, { id: 4, name: 'Bookmarks' }];
const mem_nav = (nav, sub) => { if (window._navigateTo) window._navigateTo(nav, sub); };

/* The app has no error boundary at its root, so a render error in any of these
   would blank the whole app, and Year in Review is restored on launch through
   nyla_last_view. This keeps a failure inside the feature. It renders
   `fallback` (null by default) instead. React is a library global loaded in
   <head>, so extending it at the top level here is safe. */
class MemBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e) { console.warn((this.props.name || 'Memories') + ' failed to render', e); }
  render() { return this.state.failed ? (this.props.fallback || null) : this.props.children; }
}

// ── On this day ────────────────────────────────────────────────────────
const MEM_LOOKBACKS = [[12, 'One year ago today'], [6, 'Six months ago today'], [3, 'Three months ago today'], [1, 'A month ago today']];
// Same calendar day n months back, clamped to that month's last day.
const mem_monthsBack = (date, n) => {
  const y = date.getFullYear(), m = date.getMonth() - n;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(date.getDate(), last), 12);
};

// Everything from one day, interleaved by kind so three rows show variety.
const mem_itemsOn = day => {
  const ideas = mem_list('nylaos_ideas').filter(i => mem_ideaDay(i) === day).map(i => {
    const title = mem_text(i.title || i.text, 90);
    return {
      key: 'i' + i.id, tag: 'Idea', title: title || mem_maybeHtml(i.content, 90) || 'Untitled idea',
      body: title ? mem_maybeHtml(i.content || i.description, 140) : '',
      go: () => { mem_lsSet('nylaos_idea_open_request', String(i.id)); mem_nav('ideas'); },
    };
  });
  const folders = mem_load('nylaos_nb_folders', null) || MEM_NB_FOLDERS;
  const pages = mem_list('nylaos_nb_pages').filter(p => mem_pageDay(p) === day || mem_dayOf(p.updated) === day).map(p => {
    const folder = (Array.isArray(folders) ? folders : MEM_NB_FOLDERS).find(f => f && f.id === p.folderId);
    return {
      key: 'p' + p.id, tag: (mem_pageDay(p) === day ? 'Note written' : 'Note edited') + (folder && folder.name ? ` · ${folder.name}` : ''),
      title: mem_text(p.name, 90) || 'Untitled page', body: mem_plain(p.content, 140),
      go: () => { mem_lsSet('nylaos_nb_open_request', String(p.id)); mem_nav('notebook', folder && folder.name ? folder.name : undefined); },
    };
  });
  const tasks = mem_list('nylaos_tasks').filter(t => t.source !== 'calendar' && t.done && t.completedDate === day).map(t => ({
    key: 't' + t.id, tag: 'Task done', title: mem_text(t.text, 120) || 'Task', body: '',
    go: () => mem_nav('tasks', 'Completed'),
  }));
  const goals = mem_list('nylaos_goals').filter(g => (mem_dayOf(g.created) || mem_dayOf(g.id)) === day).map(g => ({
    key: 'g' + g.id, tag: 'Goal set', title: mem_text(g.title, 120) || 'Goal', body: mem_text(g.description, 140),
    go: () => mem_nav('goals', g.periodType === 'quarterly' ? 'Quarterly' : g.periodType === 'monthly' ? 'Monthly' : 'Yearly'),
  }));
  const kinds = [ideas, pages, tasks, goals], out = [];
  for (let i = 0; kinds.some(k => k.length > i); i++) kinds.forEach(k => { if (k[i]) out.push(k[i]); });
  return out;
};
// The first lookback with anything in it, or null.
const mem_onThisDay = (now = new Date()) => {
  for (const [months, label] of MEM_LOOKBACKS) {
    const date = mem_monthsBack(now, months);
    const items = mem_itemsOn(mem_dk(date));
    if (items.length) return { label, date, items };
  }
  return null;
};

const MemMemoryRow = ({ it, first }) => (
  <button onClick={it.go} style={{
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48, textAlign: 'left',
    padding: '10px 0', background: 'none', border: 'none', borderTop: first ? 'none' : `0.5px solid ${C.border}`,
    cursor: 'pointer', fontFamily: 'inherit', color: C.text,
  }}>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.rose, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>{it.tag}</span>
      <span style={{ display: 'block', fontSize: 14, lineHeight: 1.4, wordBreak: 'break-word' }}>{it.title}</span>
      {it.body && <span style={{ display: 'block', fontSize: 12.5, color: C.textLight, lineHeight: 1.5, marginTop: 2, wordBreak: 'break-word' }}>{it.body}</span>}
    </span>
    <span aria-hidden="true" style={{ color: C.textLight, fontSize: 18, flexShrink: 0 }}>›</span>
  </button>
);

const OnThisDay = () => <MemBoundary name="On this day"><MemOnThisDayBody /></MemBoundary>;
const MemOnThisDayBody = () => {
  const today = mem_dk(new Date());
  const [all, setAll] = React.useState(false);
  const found = React.useMemo(() => { try { return mem_onThisDay(new Date()); } catch (e) { console.warn('On this day', e); return null; } }, [today]);
  if (!found) return null;
  const { label, date, items } = found;
  const shown = all ? items.slice(0, 12) : items.slice(0, 3);
  const more = items.length > 3 && (
    <button onClick={() => setAll(a => !a)} style={{ minHeight: 36, padding: '0 2px', fontSize: 12, color: C.rose, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
      {all ? 'Show fewer' : `All ${Math.min(items.length, 12)}`}
    </button>
  );
  return (
    <Card style={{ marginTop: 16 }}>
      <HomeLabel action={more}>{label}</HomeLabel>
      <div style={{ fontSize: 12, color: C.textLight, marginTop: more ? -6 : -4, marginBottom: 4 }}>
        {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
      {shown.map((it, i) => <MemMemoryRow key={it.key} it={it} first={i === 0} />)}
    </Card>
  );
};

// ── Which year, and which years have anything ──────────────────────────
// Jan 1-7 still belongs to the year that just ended.
const mem_defaultYear = (d = new Date()) => (d.getMonth() === 0 && d.getDate() <= 7 ? d.getFullYear() - 1 : d.getFullYear());
const mem_wrappedSeason = (d = new Date()) => d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() <= 7);
const mem_yearsWithData = () => {
  const ys = new Set();
  const add = k => { if (k && /^\d{4}/.test(k)) ys.add(Number(String(k).slice(0, 4))); };
  mem_list('nylaos_tasks').filter(t => t.source !== 'calendar').forEach(t => { if (t.done) add(t.completedDate); add(mem_dayOf(t.created)); });
  mem_list('nylaos_ideas').forEach(i => add(mem_ideaDay(i)));
  mem_list('nylaos_nb_pages').forEach(p => { add(mem_pageDay(p)); add(mem_dayOf(p.updated)); });
  const log = mem_load('nylaos_habit_log', {}) || {};
  Object.keys(log).forEach(k => { if (log[k]) add(k.slice(k.lastIndexOf('_') + 1)); });
  mem_list('nylaos_goals').forEach(g => add(mem_goalYear(g)));
  mem_list('nylaos_focus_sessions').forEach(s => add(s.date));
  mem_list('nylaos_books').forEach(b => { if (b.status === 'finished') add(b.finishedDate || b.updated); });
  const cur = new Date().getFullYear();
  return [...ys].filter(y => y >= 2000 && y <= cur).sort((a, b) => b - a);
};

// ── Wrapped banner ─────────────────────────────────────────────────────
const WrappedBanner = () => <MemBoundary name="Wrapped banner"><MemWrappedBannerBody /></MemBoundary>;
const MemWrappedBannerBody = () => {
  const year = mem_defaultYear();
  const dismissKey = 'nyla_wrapped_dismissed_' + year;
  const [hidden, setHidden] = React.useState(() => mem_lsGet(dismissKey) === '1');
  const inSeason = mem_wrappedSeason() || mem_lsGet('nyla_wrapped_force') === '1';
  // Only read the data when the banner could show at all.
  const hasData = React.useMemo(() => { try { return inSeason && mem_yearsWithData().includes(year); } catch (e) { return false; } }, [inSeason, year]);
  if (hidden || !inSeason || !hasData) return null;
  const dismiss = () => { mem_lsSet(dismissKey, '1'); setHidden(true); };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, padding: '2px 4px 2px 16px', borderRadius: 14, background: C.card, border: `0.5px solid ${C.border}` }}>
      <button onClick={() => mem_nav('home', 'Year in Review')} style={{ flex: 1, minWidth: 0, minHeight: 42, display: 'flex', alignItems: 'center', gap: 8, padding: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: C.text, fontSize: 13.5 }}>
        <span aria-hidden="true" style={{ color: C.rose }}>✦</span>
        <span style={{ flex: 1, minWidth: 0 }}>Your {year} in review is ready</span>
        <span style={{ color: C.rose, fontWeight: 600, fontSize: 12.5, flexShrink: 0 }}>Open ›</span>
      </button>
      <button onClick={dismiss} aria-label={`Hide the ${year} review banner`} title="Hide" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 10, background: 'none', border: 'none', color: C.textLight, fontSize: 18, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
    </div>
  );
};

// ── Year in Review: numbers ────────────────────────────────────────────
const mem_eachDay = (year, endKey, fn) => {
  for (let d = new Date(year, 0, 1, 12); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    const k = mem_dk(d);
    if (k > endKey) break;
    fn(k, d);
  }
};
// Longest run of hit days. Days that are not due are skipped: they neither break nor extend it.
const mem_longestRun = (year, endKey, hit, due) => {
  let best = { len: 0, from: null, to: null }, run = 0, from = null;
  mem_eachDay(year, endKey, (k, d) => {
    if (due && !due(d)) return;
    if (hit(k)) { if (!run) from = k; run++; if (run > best.len) best = { len: run, from, to: k }; }
    else run = 0;
  });
  return best;
};

const mem_yearStats = year => {
  const Y = String(year);
  const now = new Date();
  const ytd = year === now.getFullYear();
  const endKey = ytd ? mem_dk(now) : `${Y}-12-31`;
  const inYear = k => typeof k === 'string' && k.slice(0, 4) === Y && k <= endKey;

  // Tasks (calendar items are not tasks)
  const allTasks = mem_list('nylaos_tasks');
  const tasks = allTasks.filter(t => t.source !== 'calendar');
  const doneKeys = tasks.filter(t => t.done && inYear(t.completedDate)).map(t => t.completedDate);
  const byMonth = Array(12).fill(0);
  doneKeys.forEach(k => { byMonth[Number(k.slice(5, 7)) - 1]++; });
  let busiest = -1;
  byMonth.forEach((n, m) => { if (n && (busiest < 0 || n > byMonth[busiest])) busiest = m; });
  const doneDays = new Set(doneKeys);
  const taskStreak = mem_longestRun(year, endKey, k => doneDays.has(k));

  // Habits: check-ins per habit, and the best streak on the days each one is due
  const habitsRaw = mem_load('nylaos_habits', null);
  const habits = Array.isArray(habitsRaw) ? habitsRaw.filter(Boolean)
    : (typeof DEFAULT_HABITS !== 'undefined' ? DEFAULT_HABITS.map((h, i) => ({ id: i + 1, name: h })) : []);
  const log = mem_load('nylaos_habit_log', {}) || {};
  const due = typeof habitDue === 'function' ? habitDue : (h, d) => !h.days || !h.days.length || h.days.includes(d.getDay());
  const totals = {};
  Object.keys(log).forEach(k => {
    if (!log[k]) return;
    const i = k.lastIndexOf('_'), id = k.slice(0, i), day = k.slice(i + 1);
    if (inYear(day)) totals[id] = (totals[id] || 0) + 1;
  });
  const habitRows = habits.map(h => ({
    name: String(h.name || 'Habit'),
    total: totals[String(h.id)] || 0,
    best: totals[String(h.id)] ? mem_longestRun(year, endKey, k => !!log[`${h.id}_${k}`], d => due(h, d)).len : 0,
  })).filter(h => h.total > 0).sort((a, b) => b.total - a.total || b.best - a.best);

  // Goals set for this year (their period, else target date, else when they were made)
  const progOf = g => {
    try { if (typeof goalProgress === 'function') return goalProgress(g, allTasks); } catch (e) {}
    return Math.max(0, Math.min(100, Number(g.progress) || 0));
  };
  const goals = mem_list('nylaos_goals').filter(g => mem_goalYear(g) === Y).map(g => ({ title: mem_text(g.title, 90) || 'Goal', pct: progOf(g) }));
  const hit = goals.filter(g => g.pct >= 100);
  const closest = goals.filter(g => g.pct > 0 && g.pct < 100).sort((a, b) => b.pct - a.pct)[0] || null;

  // Ideas and notebook
  const ideas = mem_list('nylaos_ideas').filter(i => inYear(mem_ideaDay(i)));
  const catDefs = mem_load('nylaos_idea_categories', null) || (typeof DEFAULT_IDEA_CATS !== 'undefined' ? DEFAULT_IDEA_CATS : []);
  const catLabel = key => { const c = (Array.isArray(catDefs) ? catDefs : []).find(x => x && x.key === key); return c && c.label ? c.label : '#' + key; };
  const catCounts = {};
  ideas.forEach(i => { const c = String(i.category || '').trim(); if (c) catCounts[c] = (catCounts[c] || 0) + 1; });
  const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, n]) => ({ label: catLabel(key), n }));
  const pages = mem_list('nylaos_nb_pages').filter(p => inYear(mem_pageDay(p))).length;

  // Focus and books
  const sessions = mem_list('nylaos_focus_sessions').filter(s => inYear(s.date));
  const focusMin = sessions.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
  const finishedYear = b => typeof bookFinishedYear === 'function' ? bookFinishedYear(b) : (b.finishedDate || (b.status === 'finished' && b.updated) || '').slice(0, 4);
  const books = mem_list('nylaos_books').filter(b => b.status === 'finished' && finishedYear(b) === Y).map(b => ({ title: mem_text(b.title, 80) || 'Untitled', author: mem_text(b.author, 60) }));

  // Personal year (numerology)
  let pYear = null;
  try { const n = getPersonalYear(year); const info = (typeof NUM_INFO !== 'undefined' && NUM_INFO[n]) || {}; pYear = { n, name: info.name || '', theme: info.theme || '' }; } catch (e) {}

  const endDate = mem_keyDate(endKey);
  return {
    year, ytd, endKey,
    rangeLabel: ytd ? `January 1 to ${endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, so far` : `January 1 to December 31, ${year}`,
    tasks: { done: doneKeys.length, byMonth, busiest, streak: taskStreak, lastMonth: Number(endKey.slice(5, 7)) - 1 },
    habits: { rows: habitRows, total: habitRows.reduce((a, h) => a + h.total, 0) },
    goals: { count: goals.length, hit, closest },
    ideas: { count: ideas.length, topCats }, pages,
    focus: { minutes: focusMin, sessions: sessions.length }, books,
    pYear,
  };
};
const mem_hasAnything = s => !!(s.tasks.done || s.habits.total || s.goals.count || s.ideas.count || s.pages || s.focus.minutes || s.books.length);
const mem_fmtMinutes = m => { const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`; };

// ── Year in Review: the sky ────────────────────────────────────────────
// Same math as skyAt (true ecliptic of date, with aberration) for one body.
const mem_lonOf = (A, body, date) => {
  const time = A.MakeTime(date);
  const v = A.RotateVector(A.Rotation_EQJ_ECT(time), A.GeoVector(A.Body[body], time, true));
  return A.SphereFromVector(v).lon;
};
// Houses a slow planet stood in through the year, with the day it changed (to the
// day) and the signs it crossed while there.
const mem_houseWalk = (A, body, year) => {
  const signOf = lon => (typeof SIGNS !== 'undefined' ? SIGNS[Math.floor((((lon % 360) + 360) % 360) / 30)] : '');
  const at = d => { const lon = mem_lonOf(A, body, d); return { house: houseOf(lon), sign: signOf(lon) }; };
  const addSign = (seg, sign) => { if (sign && seg.signs[seg.signs.length - 1] !== sign) seg.signs.push(sign); };
  const segs = [];
  let prev = null, prevHouse = null;
  for (let d = new Date(year, 0, 1, 12); d.getFullYear() === year; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, 12)) {
    const p = at(d);
    if (prevHouse === null) segs.push({ house: p.house, from: mem_dk(d), signs: [] });
    else if (p.house !== prevHouse) {
      let lo = prev, hi = d; // lo still has the old house, hi the new one
      while ((hi - lo) > 36 * 3600000) {
        const mid = new Date(lo.getFullYear(), lo.getMonth(), lo.getDate() + Math.floor(Math.round((hi - lo) / 86400000) / 2), 12);
        if (at(mid).house === prevHouse) lo = mid; else hi = mid;
      }
      const seg = { house: p.house, from: mem_dk(hi), signs: [] };
      addSign(seg, at(hi).sign);
      segs.push(seg);
    }
    addSign(segs[segs.length - 1], p.sign);
    prev = d; prevHouse = p.house;
  }
  segs.forEach((sg, i) => { sg.to = segs[i + 1] ? mem_dk(new Date(mem_keyDate(segs[i + 1].from).getTime() - 86400000)) : `${year}-12-31`; });
  return segs;
};
const mem_cosmicFor = (A, year) => {
  const start = new Date(year, 0, 1), end = new Date(year + 1, 0, 1);
  const signName = lon => (typeof SIGNS !== 'undefined' ? SIGNS[Math.floor((((lon % 360) + 360) % 360) / 30)] : '');
  let solarReturn = null;
  try {
    const sun = NATAL.planets.find(p => p.name === 'Sun');
    const t = A.SearchSunLongitude(sun.lon, start, 367);
    if (t && t.date < end) solarReturn = t.date;
  } catch (e) { console.warn('Solar return', e); }
  const walks = {};
  ['Jupiter', 'Saturn'].forEach(b => { try { walks[b] = mem_houseWalk(A, b, year); } catch (e) { console.warn(b, e); walks[b] = []; } });
  const eclipses = [];
  const collect = (type, first, next) => {
    try {
      let e = first();
      for (let i = 0; i < 8 && e && e.peak && e.peak.date < end; i++) {
        if (e.peak.date >= start) eclipses.push({ type, kind: String(e.kind || ''), date: e.peak.date });
        e = next(e.peak);
      }
    } catch (err) { console.warn(type + ' eclipses', err); }
  };
  collect('solar', () => A.SearchGlobalSolarEclipse(start), t => A.NextGlobalSolarEclipse(t));
  collect('lunar', () => A.SearchLunarEclipse(start), t => A.NextLunarEclipse(t));
  eclipses.forEach(x => {
    // A solar eclipse falls where the Sun is; a lunar one where the Moon is.
    const lon = mem_lonOf(A, x.type === 'solar' ? 'Sun' : 'Moon', x.date);
    x.lon = lon; x.sign = signName(lon); x.deg = Math.floor((((lon % 360) + 360) % 360) % 30); x.house = houseOf(lon);
  });
  eclipses.sort((a, b) => a.date - b.date);
  return { solarReturn, walks, eclipses };
};
const MEM_COSMIC_CACHE = {};
const useMemCosmic = year => {
  const [st, setSt] = React.useState(() => MEM_COSMIC_CACHE[year] ? { status: 'ready', data: MEM_COSMIC_CACHE[year] } : { status: 'loading' });
  React.useEffect(() => {
    if (MEM_COSMIC_CACHE[year]) { setSt({ status: 'ready', data: MEM_COSMIC_CACHE[year] }); return; }
    let alive = true;
    setSt({ status: 'loading' });
    loadAstronomy().then(A => {
      // Let the page paint before the (short) calculation runs.
      setTimeout(() => {
        if (!alive) return;
        try { MEM_COSMIC_CACHE[year] = mem_cosmicFor(A, year); setSt({ status: 'ready', data: MEM_COSMIC_CACHE[year] }); }
        catch (e) { console.warn('Year in Review sky', e); setSt({ status: 'failed' }); }
      }, 30);
    }).catch(() => { if (alive) setSt({ status: 'offline' }); });
    return () => { alive = false; };
  }, [year]);
  return st;
};
const mem_houseLabel = h => `${mem_ord(h)} house`;
const mem_joinList = xs => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
// Counts different houses, not segments: a retrograde back over a cusp revisits a house.
const mem_walkHeading = (body, walk) => {
  const hs = [...new Set(walk.map(x => x.house))];
  if (hs.length === 1) return `${body} stayed in your ${mem_houseLabel(hs[0])} all year`;
  if (hs.length === walk.length) return `${body} moved through ${hs.length} houses`;
  return `${body} moved between your ${mem_joinList(hs.map(mem_ord))} houses`;
};
const mem_houseMeaning = h => (typeof HOUSE_MEANING !== 'undefined' && HOUSE_MEANING[h]) || '';
const mem_eclipseName = x => `${x.kind ? x.kind[0].toUpperCase() + x.kind.slice(1) + ' ' : ''}${x.type} eclipse`;
const mem_fmtMoment = d => d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// ── Plain-text recap for "Copy summary" ────────────────────────────────
const mem_summaryText = (s, cosmic) => {
  const L = [`My ${s.year}${s.ytd ? ' so far' : ''} (${s.rangeLabel.replace(/, so far$/, '')})`, ''];
  if (s.tasks.done) {
    let t = `Tasks: ${s.tasks.done.toLocaleString('en-US')} done.`;
    if (s.tasks.busiest >= 0) t += ` Busiest month: ${MEM_MONTHS[s.tasks.busiest]} (${s.tasks.byMonth[s.tasks.busiest]}).`;
    if (s.tasks.streak.len > 1) t += ` Longest streak: ${s.tasks.streak.len} days in a row (${mem_fmtDay(s.tasks.streak.from)} to ${mem_fmtDay(s.tasks.streak.to)}).`;
    L.push(t);
  }
  if (s.habits.total) L.push(`Habits: ${mem_plural(s.habits.total, 'check-in')}. ` + s.habits.rows.slice(0, 6).map(h => `${h.name} ${h.total} (best streak ${mem_plural(h.best, 'day')})`).join('; ') + '.');
  if (s.goals.count) {
    let g = `Goals: ${s.goals.hit.length} of ${s.goals.count} hit`;
    if (s.goals.hit.length) g += ` (${s.goals.hit.slice(0, 5).map(x => x.title).join(', ')})`;
    g += '.';
    if (s.goals.closest) g += ` Closest to done: ${s.goals.closest.title} at ${s.goals.closest.pct}%.`;
    L.push(g);
  }
  if (s.ideas.count || s.pages) {
    const parts = [];
    if (s.ideas.count) parts.push(`${mem_plural(s.ideas.count, 'idea')} captured` + (s.ideas.topCats.length ? ` (top: ${s.ideas.topCats.map(c => `${c.label} ${c.n}`).join(', ')})` : ''));
    if (s.pages) parts.push(`${mem_plural(s.pages, 'notebook page')} written`);
    L.push(`Ideas: ${parts.join('; ')}.`);
  }
  if (s.focus.minutes) L.push(`Focus: ${mem_fmtMinutes(s.focus.minutes)} over ${mem_plural(s.focus.sessions, 'session')}.`);
  if (s.books.length) L.push(`Books finished: ${s.books.length} (${s.books.map(b => b.title).join(', ')}).`);
  if (!mem_hasAnything(s)) L.push('Nothing logged this year.');
  const c = [];
  if (s.pYear) c.push(`Personal Year ${s.pYear.n}${s.pYear.name ? `, ${s.pYear.name}` : ''}${s.pYear.theme ? ` (${s.pYear.theme})` : ''}.`);
  if (cosmic && cosmic.status === 'ready') {
    const d = cosmic.data, now = new Date();
    const ahead = when => (when > now ? ' (still ahead)' : '');
    if (d.solarReturn) c.push(`Solar return: ${mem_fmtMoment(d.solarReturn)}${ahead(d.solarReturn)}.`);
    ['Jupiter', 'Saturn'].forEach(b => { const w = d.walks[b] || []; if (w.length) c.push(`${b}: ` + w.map((x, i) => `${mem_houseLabel(x.house)}${i ? ` from ${mem_fmtDay(x.from)}` : ''}`).join(', then ') + '.'); });
    if (d.eclipses.length) c.push('Eclipses: ' + d.eclipses.map(x => `${mem_fmtDay(mem_dk(x.date))} ${mem_eclipseName(x).toLowerCase()} in ${x.sign}, ${mem_houseLabel(x.house)}${ahead(x.date)}`).join('; ') + '.');
  }
  if (c.length) L.push('', 'Cosmic: ' + c.join(' '));
  return L.join('\n');
};
const mem_copy = async text => {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
};

// ── Year in Review: pieces ─────────────────────────────────────────────
const MemBig = ({ n, unit, caption }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 8px' }}>
      <span style={{ fontSize: 46, fontWeight: 600, lineHeight: 1.05, color: C.rose, letterSpacing: -1.2, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      {unit && <span style={{ fontSize: 15, color: C.textLight }}>{unit}</span>}
    </div>
    {caption && <div style={{ fontSize: 13.5, color: C.text, marginTop: 6, lineHeight: 1.5 }}>{caption}</div>}
  </div>
);
const MemFact = ({ label, value, sub }) => (
  <div style={{ padding: '10px 0', borderTop: `0.5px solid ${C.border}` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontSize: 13.5, color: C.text, minWidth: 0, wordBreak: 'break-word' }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.rose, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
    {sub && <div style={{ fontSize: 12, color: C.textLight, marginTop: 2, lineHeight: 1.5 }}>{sub}</div>}
  </div>
);
// Same look as HomeLabel, at 11px (the app's minimum for new text).
const MemLabel = ({ children }) => (
  <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 10 }}>{children}</div>
);
const MemLine = ({ children }) => <div style={{ fontSize: 13, color: C.textLight, lineHeight: 1.6 }}>{children}</div>;

// Tasks finished per month. Drawn at the container's real width so labels stay 11px.
const MemMonthBars = ({ counts, busiest, lastMonth }) => {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(300);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => setW(Math.max(220, Math.min(560, el.clientWidth || 300)));
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 120, base = H - 20, top = 18, slot = w / 12, bw = Math.min(26, slot * 0.62);
  const max = Math.max(1, ...counts);
  const desc = counts.map((n, m) => `${MEM_MONTHS[m]} ${n}`).join(', ');
  return (
    <div ref={ref} style={{ width: '100%', maxWidth: 560, margin: '4px 0 8px' }}>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`Tasks finished by month: ${desc}`} style={{ display: 'block' }}>
        <line x1="0" x2={w} y1={base + 0.5} y2={base + 0.5} stroke={C.border} />
        {counts.map((n, m) => {
          const h = n ? Math.max(3, (n / max) * (base - top)) : 0;
          const x = m * slot + (slot - bw) / 2;
          const on = m === busiest;
          return (
            <g key={m}>
              {n > 0 && <rect x={x} y={base - h} width={bw} height={h} rx="3" fill={on ? C.rose : C.accent} opacity={on ? 1 : 0.45} />}
              {on && <text x={x + bw / 2} y={base - h - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill={C.rose}>{n}</text>}
              <text x={x + bw / 2} y={H - 5} textAnchor="middle" fontSize="11" fill={m > lastMonth ? C.textMuted : C.textLight}>{MEM_MONTHS[m][0]}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const MemTasksSection = ({ s }) => {
  const t = s.tasks;
  return (<>
    <MemLabel>Tasks</MemLabel>
    <MemBig n={t.done.toLocaleString('en-US')} unit={t.done === 1 ? 'task done' : 'tasks done'}
      caption={t.busiest >= 0 ? `${MEM_MONTHS[t.busiest]} was the busiest month, with ${t.byMonth[t.busiest]}.` : null} />
    <MemMonthBars counts={t.byMonth} busiest={t.busiest} lastMonth={t.lastMonth} />
    {t.streak.len > 0 && <MemFact label="Longest streak" value={mem_plural(t.streak.len, 'day')}
      sub={t.streak.len > 1 ? `At least one task done every day, ${mem_fmtDay(t.streak.from)} to ${mem_fmtDay(t.streak.to)}.` : `No two days in a row${s.ytd ? ' yet' : ''}.`} />}
  </>);
};
const MemHabitsSection = ({ s }) => {
  const h = s.habits;
  return (<>
    <MemLabel>Habits</MemLabel>
    <MemBig n={h.total.toLocaleString('en-US')} unit={h.total === 1 ? 'check-in' : 'check-ins'}
      caption={h.rows.length > 1 ? `${h.rows[0].name} came up most, ${mem_plural(h.rows[0].total, 'time')}.` : null} />
    {h.rows.slice(0, 8).map(r => <MemFact key={r.name} label={r.name} value={mem_plural(r.total, 'day')} sub={`Best streak: ${mem_plural(r.best, 'day')} in a row`} />)}
  </>);
};
const MemGoalsSection = ({ s }) => {
  const g = s.goals;
  return (<>
    <MemLabel>Goals</MemLabel>
    <MemBig n={g.hit.length} unit={`of ${mem_plural(g.count, 'goal')} hit`} />
    {g.hit.slice(0, 5).map((x, i) => <MemFact key={'h' + i} label={x.title} value="Done" />)}
    {g.closest && (
      <div style={{ padding: '10px 0', borderTop: `0.5px solid ${C.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Closest to done</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5, color: C.text }}>
          <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{g.closest.title}</span>
          <span style={{ fontWeight: 600, color: C.rose, flexShrink: 0 }}>{g.closest.pct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: C.border, marginTop: 8, overflow: 'hidden' }}>
          <div style={{ width: `${g.closest.pct}%`, height: '100%', background: C.rose, borderRadius: 3 }} />
        </div>
      </div>
    )}
    {!g.hit.length && !g.closest && <MemLine>None of them have progress logged yet.</MemLine>}
  </>);
};
const MemIdeasSection = ({ s }) => (<>
  <MemLabel>Ideas and notes</MemLabel>
  {s.ideas.count > 0
    ? <MemBig n={s.ideas.count.toLocaleString('en-US')} unit={s.ideas.count === 1 ? 'idea captured' : 'ideas captured'} />
    : <MemBig n={s.pages.toLocaleString('en-US')} unit={s.pages === 1 ? 'notebook page written' : 'notebook pages written'} />}
  {s.ideas.topCats.map((c, i) => <MemFact key={c.label} label={`${i === 0 ? 'Top category: ' : ''}${c.label}`} value={c.n} />)}
  {s.ideas.count > 0 && s.pages > 0 && <MemFact label="Notebook pages written" value={s.pages} />}
</>);
const MemFocusSection = ({ s }) => (<>
  <MemLabel>{s.focus.minutes && s.books.length ? 'Focus and books' : s.focus.minutes ? 'Focus' : 'Books'}</MemLabel>
  {s.focus.minutes > 0
    ? <MemBig n={mem_fmtMinutes(s.focus.minutes)} unit="of focus" caption={`Across ${mem_plural(s.focus.sessions, 'session')}, ${mem_plural(s.focus.minutes, 'minute')} in all.`} />
    : <MemBig n={s.books.length} unit={s.books.length === 1 ? 'book finished' : 'books finished'} />}
  {s.focus.minutes > 0 && s.books.length > 0 && <MemFact label="Books finished" value={s.books.length} />}
  {s.books.slice(0, 6).map((b, i) => <MemLine key={i}>{b.title}{b.author ? ` by ${b.author}` : ''}</MemLine>)}
</>);
const MemCosmicSection = ({ s, cosmic }) => {
  const d = cosmic.status === 'ready' ? cosmic.data : null;
  const today = new Date();
  return (<>
    <MemLabel>The year in the sky</MemLabel>
    {s.pYear && <MemBig n={s.pYear.n} unit={`Personal Year${s.pYear.name ? ` · ${s.pYear.name}` : ''}`} caption={s.pYear.theme || null} />}
    {cosmic.status === 'loading' && <MemLine>Working out the sky for {s.year}…</MemLine>}
    {cosmic.status === 'offline' && <MemLine>The rest of this part needs a connection. Open it again when you are online.</MemLine>}
    {cosmic.status === 'failed' && <MemLine>The sky could not be worked out this time.</MemLine>}
    {d && d.solarReturn && <MemFact label="Solar return" value={mem_fmtDay(mem_dk(d.solarReturn))}
      sub={`The Sun back on its birth degree: ${mem_fmtMoment(d.solarReturn)}${d.solarReturn > today ? ' (still ahead)' : ''}.`} />}
    {d && ['Jupiter', 'Saturn'].map(b => (d.walks[b] || []).length > 0 && (
      <div key={b} style={{ padding: '10px 0', borderTop: `0.5px solid ${C.border}` }}>
        <div style={{ fontSize: 13.5, color: C.text, marginBottom: 4 }}>{mem_walkHeading(b, d.walks[b])}</div>
        {d.walks[b].map((x, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12.5, lineHeight: 1.55, color: C.textLight }}>
            <span style={{ flexShrink: 0, width: 92, color: C.text, fontWeight: 500 }}>{mem_houseLabel(x.house)}</span>
            <span style={{ minWidth: 0 }}>{mem_fmtDay(x.from)} to {mem_fmtDay(x.to)}{x.signs && x.signs.length ? ` · ${x.signs.join(', then ')}` : ''}<br />{mem_houseMeaning(x.house)}</span>
          </div>
        ))}
      </div>
    ))}
    {d && d.eclipses.length > 0 && (
      <div style={{ padding: '10px 0', borderTop: `0.5px solid ${C.border}` }}>
        <div style={{ fontSize: 13.5, color: C.text, marginBottom: 4 }}>Eclipses</div>
        {d.eclipses.map((x, i) => (
          <div key={i} style={{ fontSize: 12.5, lineHeight: 1.55, color: C.textLight, marginBottom: 4 }}>
            <span style={{ color: C.text, fontWeight: 500 }}>{mem_fmtDay(mem_dk(x.date))}</span> · {mem_eclipseName(x)} at {x.deg}° {x.sign}, your {mem_houseLabel(x.house)}{x.date > today ? ' (still ahead)' : ''}
            {mem_houseMeaning(x.house) && <><br />{mem_houseMeaning(x.house)}</>}
          </div>
        ))}
      </div>
    )}
  </>);
};

// Headline numbers for the first slide / top of the page.
const MemOverview = ({ s }) => {
  // Only what has something in it, four at most.
  const tiles = [
    ['Tasks done', s.tasks.done, s.tasks.done.toLocaleString('en-US')],
    ['Habit check-ins', s.habits.total, s.habits.total.toLocaleString('en-US')],
    ['Ideas captured', s.ideas.count, s.ideas.count.toLocaleString('en-US')],
    ['Focus', s.focus.minutes, mem_fmtMinutes(s.focus.minutes)],
    ['Notebook pages', s.pages, s.pages.toLocaleString('en-US')],
    ['Books finished', s.books.length, String(s.books.length)],
  ].filter(t => t[1] > 0).slice(0, 4).map(t => [t[0], t[2]]);
  if (!tiles.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
      {tiles.map(([l, v]) => (
        <div key={l} style={{ padding: '12px 14px', borderRadius: 14, background: C.pinkLight, border: `0.5px solid ${C.border}`, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>{l}</div>
          <div style={{ fontSize: 26, fontWeight: 600, color: C.rose, marginTop: 4, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{v}</div>
        </div>
      ))}
    </div>
  );
};

const mem_sections = (s, cosmic) => {
  const out = [];
  if (s.tasks.done) out.push({ key: 'tasks', wide: true, node: <MemTasksSection s={s} /> });
  if (s.habits.total) out.push({ key: 'habits', node: <MemHabitsSection s={s} /> });
  if (s.goals.count) out.push({ key: 'goals', node: <MemGoalsSection s={s} /> });
  if (s.ideas.count || s.pages) out.push({ key: 'ideas', node: <MemIdeasSection s={s} /> });
  if (s.focus.minutes || s.books.length) out.push({ key: 'focus', node: <MemFocusSection s={s} /> });
  out.push({ key: 'cosmic', wide: true, node: <MemCosmicSection s={s} cosmic={cosmic} /> });
  return out;
};

// Phone: one slide at a time. Tap the right side (or swipe left) for next, the left side for back.
const MemStory = ({ slides }) => {
  const [i, setI] = React.useState(0);
  const touch = React.useRef(null);
  const swiped = React.useRef(0);
  const n = slides.length, cur = Math.min(i, n - 1);
  const go = d => setI(x => Math.max(0, Math.min(n - 1, x + d)));
  const onClick = e => {
    if (Date.now() - swiped.current < 500) return;
    if (e.target.closest && e.target.closest('button,a,input,select,textarea')) return;
    const r = e.currentTarget.getBoundingClientRect();
    go(e.clientX - r.left < r.width * 0.33 ? -1 : 1);
  };
  const onTouchStart = e => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = e => {
    const s = touch.current; touch.current = null; if (!s) return;
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped.current = Date.now(); go(dx < 0 ? 1 : -1); }
  };
  const navBtn = { minHeight: 40, minWidth: 88, padding: '0 14px', borderRadius: 12, border: `0.5px solid ${C.border}`, background: C.card, color: C.rose, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' };
  // Controls sit above the card so the app's floating + button never covers them.
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button onClick={() => go(-1)} disabled={cur === 0} style={{ ...navBtn, opacity: cur === 0 ? 0.4 : 1 }}>‹ Back</button>
        <span style={{ fontSize: 12, color: C.textLight }}>{cur + 1} of {n}</span>
        <button onClick={() => go(1)} disabled={cur === n - 1} style={{ ...navBtn, opacity: cur === n - 1 ? 0.4 : 1 }}>Next ›</button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }} aria-hidden="true">
        {slides.map((sl, k) => <div key={sl.key} style={{ flex: 1, height: 3, borderRadius: 2, background: k <= cur ? C.rose : C.border }} />)}
      </div>
      <div onClick={onClick} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} aria-live="polite" style={{ cursor: 'pointer', WebkitUserSelect: 'none', userSelect: 'none', marginBottom: 72 }}>
        <Card key={slides[cur].key} className="fade-in" style={{ minHeight: 'min(440px, 58vh)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div>{slides[cur].node}</div>
        </Card>
      </div>
    </div>
  );
};

// Shown in place of the review when something in it fails to build.
const MemYirFailed = ({ year }) => (
  <Card><div style={{ fontSize: 13.5, color: C.textLight, lineHeight: 1.5 }}>The review{year ? ` for ${year}` : ''} could not be built this time.</div></Card>
);
const YearInReview = () => <MemBoundary name="Year in Review" fallback={<MemYirFailed />}><MemYearInReviewBody /></MemBoundary>;
const MemYearInReviewBody = () => {
  const isMobile = useIsMobile();
  const defYear = mem_defaultYear();
  const years = React.useMemo(() => { try { const ys = mem_yearsWithData(); if (!ys.includes(defYear)) ys.push(defYear); return ys.sort((a, b) => b - a); } catch (e) { return [defYear]; } }, [defYear]);
  const [year, setYear] = React.useState(defYear);
  const [mode, setMode] = React.useState(() => (mem_lsGet('nyla_yir_mode') === 'page' ? 'page' : 'story'));
  // null when the numbers could not be read; the year buttons stay usable.
  const s = React.useMemo(() => { try { return mem_yearStats(year); } catch (e) { console.warn('Year in Review numbers', e); return null; } }, [year]);
  const cosmic = useMemCosmic(year);
  const setModeSaved = m => { setMode(m); mem_lsSet('nyla_yir_mode', m); };
  const copy = async () => {
    let ok = false;
    try { ok = await mem_copy(mem_summaryText(s, cosmic)); } catch (e) { console.warn('Year in Review summary', e); }
    toast(ok ? 'Summary copied' : 'Could not copy on this device', ok ? 'success' : 'error', 1800);
  };
  const story = isMobile && mode === 'story';
  const pillStyle = isMobile ? { minHeight: 36 } : {};

  let body;
  if (!s) body = <MemYirFailed year={year} />;
  else {
    const sections = mem_sections(s, cosmic);
    const any = mem_hasAnything(s);
    const intro = (
      <div>
        <div style={{ fontSize: 13.5, color: C.textLight, marginBottom: 14, lineHeight: 1.5 }}>
          {any ? `${s.ytd ? 'Your year so far' : 'Your year'}, in numbers.` : `Nothing logged in ${year}${s.ytd ? ' yet' : ''}. The sky for the year is ${story ? 'on the next page' : 'below'}.`}
        </div>
        {any && <MemOverview s={s} />}
      </div>
    );
    body = story ? (
      <MemStory key={year} slides={[{ key: 'intro', node: <><MemLabel>{year}{s.ytd ? ' so far' : ''}</MemLabel>{intro}</> }, ...sections]} />
    ) : (<>
      <div style={{ marginBottom: 16 }}>{intro}</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, gridAutoFlow: 'dense' }}>
        {sections.map(sec => (
          <Card key={sec.key} style={{ gridColumn: !isMobile && sec.wide ? '1 / -1' : 'auto', minWidth: 0 }}>{sec.node}</Card>
        ))}
      </div>
    </>);
  }

  return (
    <div className="fade-in" style={{ maxWidth: 980 }}>
      <PageTitle subtitle={s ? s.rangeLabel : null}
        right={s ? <button onClick={copy} style={{ minHeight: 36, padding: '0 14px', borderRadius: 12, border: `0.5px solid ${C.border}`, background: C.card, color: C.rose, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>Copy summary</button> : null}>
        Your {year}
      </PageTitle>

      {(years.length > 1 || isMobile) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {years.length > 1 && years.map(y => <Pill key={y} active={y === year} onClick={() => setYear(y)} style={pillStyle}>{y}</Pill>)}
          </div>
          {isMobile && (
            <div style={{ display: 'flex', gap: 6 }}>
              <Pill active={mode === 'story'} onClick={() => setModeSaved('story')} style={pillStyle}>Story</Pill>
              <Pill active={mode === 'page'} onClick={() => setModeSaved('page')} style={pillStyle}>One page</Pill>
            </div>
          )}
        </div>
      )}

      {/* Keyed by year and layout, so picking another year retries after a failure. */}
      <MemBoundary key={`${year}-${story ? 'story' : 'page'}`} name="Year in Review" fallback={<MemYirFailed year={year} />}>{body}</MemBoundary>
    </div>
  );
};
