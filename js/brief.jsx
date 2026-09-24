/* ── Morning Brief ─────────────────────────────────────────────────────
   One block under the Home greeting that answers "what matters today":
   today's schedule, the three tasks most worth doing, the cycle phase,
   the moon and transits to her chart, and one old idea brought back.
   Everything comes from local data, so it is instant and works offline.
   "Plan my day" is the only part that asks Claude.

   Storage
     nylaos_brief_seen  {ideaId: 'YYYY-MM-DD'}  last day an idea was brought back
     nylaos_brief_skip  {date, ids}             ideas passed on today
     nylaos_brief_plan  {date, text}            today's plan from Claude
     nyla_brief_hidden  'YYYY-MM-DD'            day she hid the brief (this device only)
   After it changes nylaos_tasks it fires a 'nyla-tasks-changed' window
   event, and it re-reads tasks when anything else fires one.

   Loads before the main app script: top level must not touch app globals.
   Every top-level name here is prefixed brief_ / Brief. */

const brief_raw = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
const brief_parse = (raw, fallback) => {
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch (e) { return fallback; }
};
const brief_read = (key, fallback) => brief_parse(brief_raw(key), fallback);
const brief_save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { toast('Could not save that. Storage may be full.', 'error', 4000); return false; }
};
const brief_tasksChanged = () => { try { window.dispatchEvent(new CustomEvent('nyla-tasks-changed')); } catch (e) {} };

// '14:30' -> '2:30 PM'. Anything that is not a clock time is shown as written.
const brief_time = t => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  if (!m) return t ? String(t) : '';
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};
const brief_minutes = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? (+m[1]) * 60 + (+m[2]) : -1; };

// Idea titles and content can hold HTML: the idea editor is a contentEditable that
// writes a <div> or <p> per line. Line breaks and block edges become line ends before
// parsing, so lines don't run together. DOMParser reads the HTML without running
// scripts or loading images. Returns the non-empty lines as plain text.
const brief_lines = s => {
  const str = String(s == null ? '' : s);
  let text = str;
  if (/[<&]/.test(str)) {
    const marked = str.replace(/<br\b[^>]*>/gi, '\n').replace(/<\/?(p|div|li|ul|ol|h[1-6]|blockquote|pre|tr)\b[^>]*>/gi, '\n$&');
    try {
      const body = new DOMParser().parseFromString(marked, 'text/html').body;
      body.querySelectorAll('script,style').forEach(n => n.remove());
      text = body.textContent || '';
    } catch (e) { text = marked.replace(/<[^>]*>/g, ' '); }
  }
  return text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
};
const brief_plain = s => brief_lines(s).join(' ');
// Task and event text is plain text; the rest of the app shows it as written (React escapes it).
const brief_text = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const brief_clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

const brief_hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/* Today's schedule: calendar events plus calendar-sourced items, untimed first. */
const brief_schedule = (events, tasks, today) => [
  ...events.filter(e => e && e.date === today).map(e => ({ id: 'e' + e.id, text: brief_text(e.text), time: e.time || '', done: false })),
  ...tasks.filter(t => t && t.source === 'calendar' && t.calendarDate === today).map(t => ({ id: 'c' + t.id, text: brief_text(t.text), time: t.time || '', done: !!t.done })),
].sort((a, b) => brief_minutes(a.time) - brief_minutes(b.time));

/* Scores every open task that is due, overdue or undated (tasks scheduled for a
   later day wait for that day). Tasks in keepIds stay in the list after she
   checks them off here, so the row doesn't vanish and can be unchecked.
   Due today outweighs overdue: most of her dated tasks are weeks overdue, and
   if age kept adding points the same stale tasks would fill the list every day
   ("Sort out N overdue" handles that backlog). Overdue gets +3, +1 once it is a
   week late; due today gets +5 and wins ties.
   Returns [{t, score, fit, why, dueToday}] best first. */
const brief_rankTasks = (tasks, today, phaseName, keepIds) => {
  const keep = keepIds || new Set();
  const out = [];
  (tasks || []).forEach(t => {
    if (!t || t.source === 'calendar' || !t.text) return;
    if (t.done && !keep.has(t.id)) return;
    const due = t.calendarDate || null;
    if (due && due > today) return;
    let score = 0;
    const dueWhy = [], rest = [];
    if (due && due < today) {
      const late = dayDiff(due, today);
      score += 3 + (late >= 7 ? 1 : 0);
      dueWhy.push(`${late} day${late === 1 ? '' : 's'} overdue`);
    } else if (due === today) { score += 5; dueWhy.push('due today'); }
    if (t.priority === 'high') { score += 2; rest.push([0, 'high priority']); }
    else if (t.priority === 'medium') { score += 1; rest.push([5, 'medium priority']); }
    const fit = phaseName ? energyFit(t, phaseName) : 0;
    if (fit) { score += fit; rest.push([1, `${fit === 2 ? 'fits' : 'suits'} ${phaseName}`]); }
    if (t.status === 'progress') { score += 1; rest.push([2, 'in progress']); }
    if (t.goalId) { score += 1; rest.push([3, 'for a goal']); }
    if (score <= 0) return;
    const why = [...dueWhy, ...rest.sort((a, b) => a[0] - b[0]).map(x => x[1])].slice(0, 3);
    out.push({ t, score, fit, why, dueToday: due === today });
  });
  return out.sort((a, b) => (b.score - a.score)
    || (b.dueToday - a.dueToday)
    || (a.t.calendarDate || '9999').localeCompare(b.t.calendarDate || '9999')
    || String(a.t.created || '').localeCompare(String(b.t.created || '')));
};
/* The top three, with one row kept for today's work: if nothing due today made
   the cut but something is due, the best of those takes the third row. */
const brief_topThree = ranked => {
  const top = ranked.slice(0, 3);
  if (top.length === 3 && !top.some(x => x.dueToday)) {
    const today1 = ranked.find(x => x.dueToday);
    if (today1) top[2] = today1;
  }
  return top;
};

/* Ideas: when one was made (created, else the Date.now id), its title and label. */
const brief_ideaTime = i => {
  const t = Date.parse((i && i.created) || '');
  if (!isNaN(t)) return t;
  const n = Number(i && i.id);
  return n > 1e12 && n < 4e12 ? n : null;
};
/* Title and snippet. With no title of its own, the first line of the content is the
   title and the rest is the snippet. */
const brief_ideaParts = i => {
  const own = brief_plain(i.title || i.text || '');
  const lines = brief_lines(i.content || i.description || '');
  if (!own) return { title: brief_clip(lines[0] || '', 160), snippet: brief_clip(lines.slice(1).join(' '), 180) };
  const body = lines.join(' ');
  return { title: brief_clip(own, 160), snippet: body && body !== own && !own.startsWith(body) ? brief_clip(body, 180) : '' };
};
// Cheap check that some text survives once tags are gone (runs on every idea).
const brief_hasText = s => /\S/.test(String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' '));
const brief_ideaLabel = i => {
  const cats = brief_read('nylaos_idea_categories', null) || (typeof DEFAULT_IDEA_CATS !== 'undefined' ? DEFAULT_IDEA_CATS : []);
  const c = Array.isArray(cats) ? cats.find(x => x && x.key === i.category) : null;
  return [c ? c.label : i.category, i.venture].filter(Boolean).join(' · ');
};
const brief_ago = ms => {
  const d = Math.floor((Date.now() - ms) / 864e5);
  if (d < 30) return `${Math.max(2, Math.floor(d / 7))} weeks ago`;
  const m = Math.round(d / 30.44);
  if (d < 365 && m < 12) return m <= 1 ? 'a month ago' : `${m} months ago`;
  const y = Math.floor(d / 365.25);
  return y <= 1 ? 'a year ago' : `${y} years ago`;
};

/* Candidates are ideas made more than 14 days ago that were not brought back in
   the last 45 days (today's own pick stays a candidate) and weren't passed on
   today. The one already shown today keeps its place; otherwise the day picks. */
const brief_ideaCandidates = (ideas, seen, skipIds, today) => {
  const madeBefore = addDaysKey(-14), since = addDaysKey(-45);
  return (ideas || []).filter(i => {
    if (!i || i.id == null || i.status === 'archived' || i.status === 'done') return false;
    if (![i.title, i.text, i.content, i.description].some(brief_hasText)) return false;
    if (skipIds.includes(String(i.id))) return false;
    const born = brief_ideaTime(i);
    if (born == null || toDateKey(new Date(born)) >= madeBefore) return false;
    const s = seen[i.id];
    return !(s && s < today && s >= since);
  }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
};
const brief_pickIdea = (ideas, seen, skipIds, today) => {
  const c = brief_ideaCandidates(ideas, seen, skipIds, today);
  if (!c.length) return null;
  return c.find(i => seen[i.id] === today) || c[brief_hash(today) % c.length];
};
const brief_markSeen = (id, today) => {
  const seen = brief_read('nylaos_brief_seen', {});
  if (seen[id] === today) return;
  const keepFrom = addDaysKey(-46), next = {};
  Object.keys(seen).forEach(k => { if (typeof seen[k] === 'string' && seen[k] >= keepFrom) next[k] = seen[k]; });
  next[id] = today;
  // Runs just from showing an idea, so a failed write stays quiet.
  try { localStorage.setItem('nylaos_brief_seen', JSON.stringify(next)); } catch (e) {}
};

/* Sky: computed once per day and kept in memory, so re-renders and revisits
   reuse it. A failed load (offline) is retried on the next visit only. */
let brief_skyMemo = null;
/* Two lines, one planet each. transitAspects lists the slow outer planets first,
   and they stay in orb for weeks, so the second line is the tightest aspect from a
   fast mover: that is the part that changes from day to day. */
const brief_FAST_MOVERS = ['Moon', 'Sun', 'Mercury', 'Venus', 'Mars'];
const brief_pickTransits = all => {
  if (!all.length) return [];
  const first = all[0];
  const others = all.filter(x => x.t.name !== first.t.name);
  const fast = others.filter(x => brief_FAST_MOVERS.includes(x.t.name)).sort((a, b) => a.orb - b.orb)[0];
  const second = fast || others[0];
  return second ? [first, second] : [first];
};
const brief_loadSky = today => {
  if (brief_skyMemo && brief_skyMemo.date === today && brief_skyMemo.status !== 'fail') return brief_skyMemo;
  const entry = { date: today, status: 'loading', transits: [], moonSign: null, promise: null };
  entry.promise = loadAstronomy().then(A => {
    const sky = skyAt(A, new Date());
    entry.transits = brief_pickTransits(transitAspects(sky));
    const moon = sky.find(p => p.name === 'Moon');
    entry.moonSign = moon ? SIGNS[signIdx(moon.lon)] : null;
    entry.status = 'ok';
  }).catch(() => { entry.status = 'fail'; });
  brief_skyMemo = entry;
  return entry;
};

const brief_planSystem = `You help Nyla plan her day. From the summary she sends, write a practical plan for the rest of today in 4 to 6 sentences of plain prose: what to do first and roughly when, how the tasks fit around her schedule, and what can wait. Bring in her cycle phase or the sky only where it changes what she should do. Speak to her as "you". No emoji, no affirmations, no pep talk, no headings, no lists, no preamble.`;

const brief_planInput = ({ schedule, top, overdueCount, cycle, phase, moonText, transits }) => {
  const now = new Date();
  const lines = [
    `It is ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`,
    'Schedule: ' + (schedule.length ? schedule.map(e => `${e.time ? brief_time(e.time) : 'all day'} ${e.text}${e.done ? ' (done)' : ''}`).join('; ') : 'nothing on the calendar') + '.',
    'Tasks most worth doing: ' + (top.length ? top.map((x, i) => `${i + 1}) ${brief_text(x.t.text)} (${x.why.join(', ')})`).join(' ') : 'none stand out') + '.',
    `Overdue tasks in total: ${overdueCount}.`,
  ];
  if (phase) {
    const tip = PHASE_TIPS[phase] || {};
    lines.push(`Cycle: ${phase}, day ${cycle.day}${cycle.late ? ' (period is late)' : ''}. Phase advice for work: ${tip.work || ''} Energy: ${tip.energy || ''}`);
  }
  lines.push(`Moon: ${moonText}.`);
  if (transits && transits.length) lines.push('Transits to her chart: ' + transits.map(transitSentence).join(' '));
  return lines.join('\n') + '\n\nWrite her plan for today.';
};

/* ── Pieces ── */
const BriefLink = ({ children, onClick, mobile, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{
    fontSize: 12, color: C.rose, background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'inherit', padding: mobile ? '0 6px' : '2px 4px', minHeight: mobile ? 36 : 24, opacity: disabled ? 0.6 : 1,
  }}>{children}</button>
);
const BriefSection = ({ label, action, first, children }) => (
  <div style={{ marginTop: first ? 0 : 18 }}>
    <HomeLabel action={action}><span style={{ fontSize: 11 }}>{label}</span></HomeLabel>
    {children}
  </div>
);
const brief_pillBtn = (mobile, primary) => ({
  minHeight: mobile ? 36 : 30, padding: '0 13px', borderRadius: primary ? 10 : 20, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer',
  border: primary ? 'none' : `0.5px solid ${C.border}`, background: primary ? C.rose : 'transparent', color: primary ? '#fff' : C.rose,
});

/* Home has no error boundary of its own, so a bug in the brief would blank the
   whole page. This keeps a failure contained to the brief. (React is a library
   global loaded in <head>, so using it at the top level here is safe.) */
class BriefBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e) { console.warn('Morning brief failed to render', e); }
  render() { return this.state.failed ? null : this.props.children; }
}
const MorningBrief = () => <BriefBoundary><BriefBody /></BriefBoundary>;

const BriefBody = () => {
  const isMobile = useIsMobile();
  const today = toDateKey();
  const [, setRev] = useState(0);
  const bump = () => setRev(r => r + 1);
  const [kept, setKept] = useState(() => new Set());
  const [hiddenDay, setHiddenDay] = useState(() => brief_raw('nyla_brief_hidden'));
  const [planning, setPlanning] = useState(false);
  // Two columns only when the card itself has room: the sidebars can leave a
  // narrow Home on a laptop-sized window, so the window width alone misleads.
  const gridRef = React.useRef(null);
  const [wide, setWide] = useState(() => !isMobile);
  const isHidden = hiddenDay === today;
  React.useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => setWide(el.getBoundingClientRect().width >= 560);
    measure();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isHidden]);

  // Other parts of the app (and this one) announce task changes; re-read then.
  useEffect(() => {
    const f = () => setRev(r => r + 1);
    window.addEventListener('nyla-tasks-changed', f);
    return () => window.removeEventListener('nyla-tasks-changed', f);
  }, []);

  // The sky loads in the background; the rest of the brief doesn't wait for it.
  useEffect(() => {
    let alive = true;
    const e = brief_loadSky(today);
    if (e.status === 'loading') e.promise.then(() => { if (alive) setRev(r => r + 1); });
    return () => { alive = false; };
  }, [today]);

  // Read on every render (Home re-renders when its own Today card changes a task).
  const tasksRaw = brief_raw('nylaos_tasks'), eventsRaw = brief_raw('nylaos_events'), ideasRaw = brief_raw('nylaos_ideas');
  const seenRaw = brief_raw('nylaos_brief_seen'), skipRaw = brief_raw('nylaos_brief_skip'), planRaw = brief_raw('nylaos_brief_plan');

  const cycle = (() => { try { return getCycleForDate(new Date()); } catch (e) { return null; } })();
  const phase = cycle && cycle.name && PHASE_ENERGY[cycle.name] ? cycle.name : null;

  const tasks = React.useMemo(() => { const v = brief_parse(tasksRaw, []); return Array.isArray(v) ? v : []; }, [tasksRaw]);
  const ranked = React.useMemo(() => brief_rankTasks(tasks, today, phase, kept), [tasks, today, phase, kept]);
  const top = brief_topThree(ranked);
  const openMine = tasks.filter(t => t && t.source !== 'calendar' && !t.done);
  const overdueCount = openMine.filter(t => t.calendarDate && t.calendarDate < today).length;
  const fitCount = phase ? openMine.filter(t => energyFit(t, phase) > 0).length : 0;
  const schedule = React.useMemo(() => { const ev = brief_parse(eventsRaw, []); return brief_schedule(Array.isArray(ev) ? ev : [], tasks, today); }, [eventsRaw, tasks, today]);

  const idea = React.useMemo(() => {
    const ideas = brief_parse(ideasRaw, []);
    const seen = brief_parse(seenRaw, {});
    const skip = brief_parse(skipRaw, null);
    const skipIds = skip && skip.date === today && Array.isArray(skip.ids) ? skip.ids.map(String) : [];
    return brief_pickIdea(Array.isArray(ideas) ? ideas : [], seen && typeof seen === 'object' ? seen : {}, skipIds, today);
  }, [ideasRaw, seenRaw, skipRaw, today]);
  const ideaId = idea ? idea.id : null;
  useEffect(() => { if (ideaId != null) brief_markSeen(ideaId, today); }, [ideaId, today]);

  const plan = brief_parse(planRaw, null);
  const planText = plan && plan.date === today && typeof plan.text === 'string' ? plan.text : '';

  const moon = getMoonForDate(new Date());
  const sky = brief_skyMemo && brief_skyMemo.date === today ? brief_skyMemo : null;
  const skyLoading = !sky || sky.status === 'loading';
  const moonText = moon.label + (sky && sky.moonSign ? ` in ${sky.moonSign}` : '');
  const go = (nav, sub) => window._navigateTo && window._navigateTo(nav, sub);

  /* Actions */
  const toggle = id => {
    const all = brief_read('nylaos_tasks', []);
    const { list, nowDone } = toggleTaskIn(all, id);
    if (!brief_save('nylaos_tasks', list)) return;
    setKept(k => { const n = new Set(k); n.add(id); return n; });
    brief_tasksChanged();
    bump();
    if (nowDone) toast('Done', 'success', 1100);
  };
  const passIdea = i => {
    const s = brief_read('nylaos_brief_skip', null);
    const ids = s && s.date === today && Array.isArray(s.ids) ? s.ids.map(String) : [];
    brief_markSeen(i.id, today);
    brief_save('nylaos_brief_skip', { date: today, ids: [...ids, String(i.id)] });
    bump();
  };
  const ideaToTask = i => {
    const all = brief_read('nylaos_tasks', []);
    const list = Array.isArray(all) ? all : [];
    list.push({ id: Date.now(), text: 'Next step: ' + brief_ideaParts(i).title, done: false, calendarDate: today, created: new Date().toISOString(), energy: 'create' });
    if (!brief_save('nylaos_tasks', list)) return;
    brief_tasksChanged();
    toast('Added to today', 'success', 1400);
    passIdea(i);
  };
  // "Make it a task" and "Not now" swap in the next idea at once, in the same
  // buttons, so a quick double tap would act on an idea she never saw. Ignore
  // idea taps for a moment after one lands.
  const ideaBusyUntil = React.useRef(0);
  const ideaAct = (fn, i) => () => {
    const now = Date.now();
    if (now < ideaBusyUntil.current) return;
    ideaBusyUntil.current = now + 700;
    fn(i);
  };
  const openIdea = i => {
    // The Idea Bank opens this idea full screen when it mounts.
    try { localStorage.setItem('nylaos_idea_open_request', String(i.id)); } catch (e) {}
    go('ideas');
  };
  const makePlan = async () => {
    if (planning) return;
    setPlanning(true);
    try {
      const text = await callClaude({
        system: brief_planSystem,
        messages: [{ role: 'user', content: brief_planInput({ schedule, top: top.filter(x => !x.t.done), overdueCount, cycle, phase, moonText, transits: sky && sky.status === 'ok' ? sky.transits : [] }) }],
        maxTokens: 2000, effort: 'low',
      });
      const clean = String(text || '').trim();
      if (!clean || clean === '(no reply)') throw new Error('No plan came back. Try again.');
      brief_save('nylaos_brief_plan', { date: today, text: clean });
    } catch (e) {
      toast((e && e.message) || 'Could not plan the day.', 'error', 5000);
    } finally {
      setPlanning(false);
    }
  };
  const hide = () => { try { localStorage.setItem('nyla_brief_hidden', today); } catch (e) {} setHiddenDay(today); };
  const show = () => { try { localStorage.removeItem('nyla_brief_hidden'); } catch (e) {} setHiddenDay(null); };

  /* Hidden: one line that opens it again. */
  if (isHidden) {
    const chips = [
      top.filter(x => !x.t.done).length ? `${top.filter(x => !x.t.done).length} worth doing` : null,
      schedule.length ? `${schedule.length} on the calendar` : 'Clear calendar',
      overdueCount ? `${overdueCount} overdue` : null,
      phase ? `${phase} · day ${cycle.day}` : null,
      moon.label,
    ].filter(Boolean);
    return (
      <button onClick={show} aria-expanded="false" style={{
        width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 16,
        padding: '6px 10px', minHeight: 44, borderRadius: 14, border: `0.5px solid ${C.border}`, background: C.card,
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
      }}>
        <span style={{ fontSize: 12.5, color: C.rose, fontWeight: 600, padding: '0 4px' }}>Today's brief</span>
        {chips.map(c => <span key={c} style={{ fontSize: 11.5, color: C.textLight, padding: '3px 10px', borderRadius: 20, background: C.pinkLight, border: `0.5px solid ${C.border}` }}>{c}</span>)}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.rose, padding: '0 4px' }}>Show</span>
      </button>
    );
  }

  const muted = { fontSize: 11.5, color: C.textLight, lineHeight: 1.45 };
  const clamp = n => ({ display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' });

  const worth = (
    <BriefSection first label="Worth doing" action={overdueCount > 3 ? <BriefLink mobile={isMobile} onClick={() => go('tasks', 'Today')}>Sort out {overdueCount} overdue →</BriefLink> : null}>
      {top.length === 0
        ? <div style={{ fontSize: 13, color: C.textLight }}>{openMine.length ? 'Nothing pressing today.' : 'No open tasks.'}</div>
        : top.map(({ t, why }) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, padding: '2px 0' }}>
            <button onClick={() => toggle(t.id)} role="checkbox" aria-checked={!!t.done} aria-label={t.done ? 'Mark not done' : 'Mark done'}
              style={{ width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'none', border: 'none', padding: 0, margin: '-4px 0 -4px -8px', cursor: 'pointer' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', boxSizing: 'border-box', border: `1.5px solid ${t.done ? C.rose : C.accent}`, background: t.done ? C.rose : 'transparent', color: '#fff', fontSize: 11, lineHeight: '15px', textAlign: 'center' }}>{t.done ? '✓' : ''}</span>
            </button>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.4, color: t.done ? C.textMuted : C.text, textDecoration: t.done ? 'line-through' : 'none', ...clamp(2) }}>{brief_text(t.text)}</div>
              <div style={muted}>{why.join(' · ')}</div>
            </div>
          </div>
        ))}
    </BriefSection>
  );

  const shownSchedule = schedule.slice(0, 6);
  const agenda = (
    <BriefSection label="Schedule" action={<BriefLink mobile={isMobile} onClick={() => { window._calendarFocus = today; go('calendar', 'Daily'); }}>Calendar →</BriefLink>}>
      {schedule.length === 0
        ? <div style={{ fontSize: 13, color: C.textLight }}>Nothing on the calendar</div>
        : shownSchedule.map(e => (
          <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '4px 0' }}>
            <span style={{ fontSize: 11.5, color: C.accent, minWidth: 62, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{e.time ? brief_time(e.time) : 'All day'}</span>
            <span style={{ fontSize: 13, color: e.done ? C.textMuted : C.text, textDecoration: e.done ? 'line-through' : 'none', minWidth: 0, wordBreak: 'break-word' }}>{e.text}</span>
          </div>
        ))}
      {schedule.length > shownSchedule.length && <div style={{ ...muted, marginTop: 2 }}>+{schedule.length - shownSchedule.length} more</div>}
    </BriefSection>
  );

  const favors = phase ? PHASE_ENERGY[phase].map(k => (ENERGY_TYPES.find(x => x.key === k) || { label: k }).label) : [];
  const phaseRow = phase && (
    <BriefSection first={wide} label="Your phase" action={<BriefLink mobile={isMobile} onClick={() => go('period', 'Cycle Overview')}>Cycle →</BriefLink>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: C.text, fontWeight: 500 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cycle.color || C.rose, flexShrink: 0 }} />
        <span>{phase} · day {cycle.day}{cycle.late ? ' · period is late' : (cycle.stale || cycle.predicted) ? ' · estimate' : ''}</span>
      </div>
      {PHASE_TIPS[phase] && <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, marginTop: 4 }}>{PHASE_TIPS[phase].work}</div>}
      <div style={{ ...muted, marginTop: 3 }}>Favors {favors.join(' and ')} tasks{fitCount ? ` · ${fitCount} open task${fitCount === 1 ? '' : 's'} fit` : ''}</div>
    </BriefSection>
  );

  const skyRow = (
    <BriefSection first={wide && !phase} label="Sky" action={<BriefLink mobile={isMobile} onClick={() => go('cosmic', 'Astrology')}>Transits →</BriefLink>}>
      <div style={{ fontSize: 13.5, color: C.text }}>{moonText}</div>
      {skyLoading && <div style={{ ...muted, marginTop: 4 }}>Reading the sky…</div>}
      {sky && sky.status === 'ok' && sky.transits.length === 0 && <div style={{ ...muted, marginTop: 4 }}>No close transits to your chart today.</div>}
      {sky && sky.status === 'ok' && sky.transits.map((x, i) => (
        <div key={i} style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>{transitSentence(x)}</div>
          <div style={muted}>{x.t.name}{x.t.rx ? ' ℞' : ''} <span style={{ color: ASPECT_TONE_COLOR[x.asp.tone] || C.textLight }}>{x.asp.name}</span> your {x.n.name} · {x.orb.toFixed(1)}°</div>
        </div>
      ))}
    </BriefSection>
  );

  const ideaRow = idea && (() => {
    const { title, snippet } = brief_ideaParts(idea);
    const born = brief_ideaTime(idea);
    const label = brief_ideaLabel(idea);
    return (
      <BriefSection label="Brought back">
        <div style={{ fontSize: 13.5, color: C.text, fontWeight: 500, lineHeight: 1.4, ...clamp(2) }}>{title}</div>
        <div style={{ ...muted, marginTop: 2 }}>{[label, born ? `from ${brief_ago(born)}` : null].filter(Boolean).join(' · ')}</div>
        {snippet && <div style={{ fontSize: 12, color: C.textLight, lineHeight: 1.5, marginTop: 4, ...clamp(2) }}>{snippet}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          <button onClick={ideaAct(openIdea, idea)} style={brief_pillBtn(isMobile)}>Open</button>
          <button onClick={ideaAct(ideaToTask, idea)} style={brief_pillBtn(isMobile)}>Make it a task</button>
          <button onClick={ideaAct(passIdea, idea)} style={{ ...brief_pillBtn(isMobile), color: C.textLight }}>Not now</button>
        </div>
      </BriefSection>
    );
  })();

  const pad = isMobile ? { padding: 'calc(16px * var(--nyla-space, 1))' } : {};
  return (
    <Card style={{ marginBottom: 16, ...pad }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: isMobile ? 19 : 21, color: C.rose, lineHeight: 1.2 }}>Today's brief</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {!planText && <button onClick={makePlan} disabled={planning} style={{ ...brief_pillBtn(isMobile, true), opacity: planning ? 0.7 : 1, cursor: planning ? 'default' : 'pointer' }}>{planning ? 'Planning…' : 'Plan my day'}</button>}
          <BriefLink mobile={isMobile} onClick={hide}>Hide for today</BriefLink>
        </div>
      </div>

      {planText && (
        <div style={{ background: C.lavLight, borderRadius: 12, padding: '10px 14px 12px', marginBottom: 16 }}>
          <HomeLabel action={<BriefLink mobile={isMobile} disabled={planning} onClick={makePlan}>{planning ? 'Redoing…' : 'Redo'}</BriefLink>}><span style={{ fontSize: 11 }}>Plan for today</span></HomeLabel>
          <div style={{ fontSize: 13, lineHeight: 1.65, color: C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{planText}</div>
        </div>
      )}

      <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: wide ? 'minmax(0,1.2fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: wide ? 24 : 0 }}>
        <div>{worth}{agenda}</div>
        <div style={wide ? { borderLeft: `0.5px solid ${C.border}`, paddingLeft: 24 } : {}}>
          {phaseRow}{skyRow}{ideaRow}
        </div>
      </div>
    </Card>
  );
};
