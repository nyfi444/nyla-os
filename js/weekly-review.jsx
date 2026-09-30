/* ── Weekly Review (Home > Weekly Review) ──────────────────────────────
   One calm page that shows the week (Monday to Sunday), helps her close it
   out, and sets up the next one.

   Reads (never writes)
     nylaos_tasks            done + completedDate (a YYYY-MM-DD day) = finished;
                             calendarDate = the day it is due; source 'calendar'
                             marks a schedule block, which counts as an event
     nylaos_habits           [{ id, name, color, days? }], days = weekday numbers
     nylaos_habit_log        { `${habitId}_${YYYY-MM-DD}`: true }
     nylaos_focus_sessions   [{ id, date, minutes }]
     nylaos_events           [{ id, date, text, time }]
     nylaos_nb_pages         created / updated (id is the fallback for created)
     nylaos_ideas            created (id is the fallback)
     nylaos_top3_YYYY-MM-DD  [{ text, done }] x 3, the Daily planner's own
     nylaos_periods          only to decide whether a cycle phase can be shown

   Writes
     nylaos_weekly_reviews   { [mondayKey]: { wins, hard, learned, mood,
                               next:[a,b,c], ai, updated } }
                             mood is one of the five emoji in WR_MOODS. A week
                             with nothing written is removed, not kept empty.
     nylaos_tasks            Carry over only: calendarDate becomes a Monday, or
                             null for "No date", the same way the Tasks page
                             does it. Then fires 'nyla-tasks-changed'.
     nylaos_top3_<monday>    "Set as Monday's Top 3", in the Daily planner's shape

   "Monday" for Carry over and for the Top 3 is the Monday after the week on
   screen, unless that day has already passed, in which case it is the next
   Monday from today. So reviewing last week on a Monday morning plans today.

   Carry over lists open tasks due on or before the week's Sunday, and never
   later than today: a task due this Friday is not "carried over" on a Tuesday.

   Loads before the main app script: the top level must not touch app globals.
   Every top-level name here is prefixed wr_ / Wr / WR_, except WeeklyReview. */

// ── Storage ────────────────────────────────────────────────────────────
const wr_read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } };
// The app's own setItem swallows a storage-full error (it toasts and returns without storing),
// so a write only counts once reading the key back gives the same string.
const wr_write = (key, value) => {
  try {
    const s = JSON.stringify(value);
    localStorage.setItem(key, s);
    return localStorage.getItem(key) === s;
  }
  catch (e) { try { toast('Could not save that. Storage may be full.', 'error', 4000); } catch (e2) {} return false; }
};
const wr_list = key => { const v = wr_read(key, []); return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; };
const wr_obj = key => { const v = wr_read(key, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
const wr_tasksChanged = () => { try { window.dispatchEvent(new CustomEvent('nyla-tasks-changed')); } catch (e) {} };
const wr_say = (message, type, ms) => { try { toast(message, type || 'success', ms || 2200); } catch (e) {} };

// ── Days and weeks ─────────────────────────────────────────────────────
const wr_dk = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const wr_date = k => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d, 12); };
const wr_isKey = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && wr_dk(wr_date(k)) === k;
const wr_addDays = (k, n) => { const d = wr_date(k); d.setDate(d.getDate() + n); return wr_dk(d); };
// Monday of the week a day sits in (the same rule as the app's weekStartKey).
const wr_monday = k => { const d = wr_date(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return wr_dk(d); };
const wr_today = () => wr_dk(new Date());
// Local day of a stored moment: a bare day key, an ISO string, or a Date.now() id.
const wr_dayOf = v => {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return wr_isKey(v) ? v : null;
  const n = typeof v === 'number' ? v : /^\d{12,}$/.test(String(v)) ? Number(v) : Date.parse(v);
  if (!isFinite(n) || n < 946684800000) return null; // before 2000: not a real timestamp
  return wr_dk(new Date(n));
};
const wr_fmt = (k, opts) => { try { return wr_date(k).toLocaleDateString('en-US', opts); } catch (e) { return String(k); } };
const wr_short = k => wr_fmt(k, wr_date(k).getFullYear() === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
const wr_weekTitle = monday => `Week of ${wr_short(monday)}`;
const wr_rangeLabel = monday => {
  const sunday = wr_addDays(monday, 6);
  return `${wr_fmt(monday, { month: 'short', day: 'numeric' })} to ${wr_fmt(sunday, { month: 'short', day: 'numeric', year: 'numeric' })}`;
};
// The Monday that Carry over and the Top 3 point at (see the header comment).
const wr_targetMonday = monday => {
  const after = wr_addDays(monday, 7), today = wr_today();
  return after >= today ? after : wr_addDays(wr_monday(today), 7);
};

// ── Text ───────────────────────────────────────────────────────────────
const wr_text = (v, max) => {
  if (v == null || typeof v === 'object') return '';
  let s = String(v).replace(/\s+/g, ' ').trim();
  if (max && s.length > max) s = s.slice(0, max - 1).replace(/[\s,.;:]+$/, '') + '…';
  return s;
};
const wr_esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const wr_plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
const wr_mins = m => {
  const n = Math.round(Number(m) || 0);
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60), r = n % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
};

// ── Reflection records ─────────────────────────────────────────────────
const WR_REVIEWS_KEY = 'nylaos_weekly_reviews';
const WR_MOODS = [['😔', 'Heavy'], ['😕', 'Bumpy'], ['😌', 'Steady'], ['😊', 'Good'], ['🥰', 'Glowing']];
const wr_blankReview = () => ({ wins: '', hard: '', learned: '', mood: '', next: ['', '', ''], ai: '' });
const wr_str = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
// Whatever is stored, hand back the shape the page expects.
const wr_cleanReview = raw => {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  let mood = r.mood;
  if (typeof mood === 'number' && WR_MOODS[mood - 1]) mood = WR_MOODS[mood - 1][0]; // an older 1 to 5
  if (!WR_MOODS.some(m => m[0] === mood)) mood = '';
  const next = Array.isArray(r.next) ? r.next : [];
  return { wins: wr_str(r.wins), hard: wr_str(r.hard), learned: wr_str(r.learned), mood, next: [0, 1, 2].map(i => wr_str(next[i])), ai: wr_str(r.ai) };
};
const wr_reviewEmpty = r => !(r.wins.trim() || r.hard.trim() || r.learned.trim() || r.mood || r.ai.trim() || r.next.some(x => x.trim()));
const wr_loadReview = monday => wr_cleanReview(wr_obj(WR_REVIEWS_KEY)[monday]);
const wr_saveReview = (monday, rec) => {
  const all = wr_obj(WR_REVIEWS_KEY);
  const clean = wr_cleanReview(rec);
  if (wr_reviewEmpty(clean)) {
    if (!Object.prototype.hasOwnProperty.call(all, monday)) return true;
    delete all[monday];
  } else {
    const before = all[monday] && typeof all[monday] === 'object' && !Array.isArray(all[monday]) ? all[monday] : {};
    all[monday] = { ...before, ...clean, updated: new Date().toISOString() };
  }
  return wr_write(WR_REVIEWS_KEY, all);
};
// Earlier weeks with something written, newest first.
const wr_pastReviews = () => {
  const all = wr_obj(WR_REVIEWS_KEY), today = wr_today(), out = [], seen = new Set();
  Object.keys(all).forEach(k => {
    if (!wr_isKey(k) || k > today) return;
    const monday = wr_monday(k);
    if (seen.has(monday)) return;
    const r = wr_cleanReview(all[k]);
    if (wr_reviewEmpty(r)) return;
    seen.add(monday);
    const snippet = wr_text(r.wins, 110) || wr_text(r.learned, 110) || wr_text(r.hard, 110) || wr_text(r.ai, 110) || wr_text(r.next.filter(x => x.trim()).join(' · '), 110);
    out.push({ monday, mood: r.mood, snippet });
  });
  return out.sort((a, b) => (a.monday < b.monday ? 1 : -1));
};

// ── The week's numbers ─────────────────────────────────────────────────
// Every section is read on its own, so one odd record costs that section only.
const wr_weekData = monday => {
  const today = wr_today();
  const days = Array.from({ length: 7 }, (_, i) => wr_addDays(monday, i));
  const sunday = days[6];
  const per = {};
  days.forEach(k => { per[k] = { key: k, future: k > today, isToday: k === today, done: [], habitsDue: 0, habitsHit: 0, focus: 0, sessions: 0, events: [], notesNew: 0, notesEdited: 0, ideas: 0, top3Set: 0, top3Done: 0 }; });
  const day = k => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(per, k) ? per[k] : null);
  const safe = fn => { try { fn(); } catch (e) { console.warn('Weekly Review skipped a section', e); } };

  let tasks = [];
  safe(() => { tasks = wr_list('nylaos_tasks'); });

  // Tasks finished (schedule blocks are not tasks)
  safe(() => tasks.forEach(t => {
    if (t.source === 'calendar' || !t.done) return;
    const d = day(wr_dayOf(t.completedDate)), text = wr_text(t.text, 140);
    if (d && text) d.done.push(text);
  }));

  // Events: calendar events, plus the schedule blocks that sit beside them
  safe(() => {
    wr_list('nylaos_events').forEach(e => {
      const d = day(e.date), text = wr_text(e.text, 100);
      if (d && text) d.events.push({ text, time: typeof e.time === 'string' ? e.time : '' });
    });
    tasks.forEach(t => {
      if (t.source !== 'calendar') return;
      const d = day(t.calendarDate), text = wr_text(t.text, 100);
      if (d && text) d.events.push({ text, time: typeof t.time === 'string' ? t.time : '' });
    });
    days.forEach(k => per[k].events.sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1));
  });

  // Habits kept, out of the days each one was due (never counting days still to come,
  // or days before a habit existed)
  let habitCount = 0;
  safe(() => {
    const raw = wr_read('nylaos_habits', null);
    const habits = Array.isArray(raw) ? raw.filter(h => h && typeof h === 'object' && h.id != null)
      : (typeof DEFAULT_HABITS !== 'undefined' && Array.isArray(DEFAULT_HABITS) ? DEFAULT_HABITS.map((h, i) => ({ id: i + 1, name: h })) : []);
    const log = wr_obj('nylaos_habit_log');
    habitCount = habits.length;
    habits.forEach(h => {
      const sched = Array.isArray(h.days) ? h.days.map(Number).filter(n => n >= 0 && n <= 6) : [];
      const born = wr_dayOf(h.id);
      days.forEach(k => {
        if (k > today) return;
        const hit = !!log[`${h.id}_${k}`];
        const due = !sched.length || sched.includes(wr_date(k).getDay());
        if (hit) { per[k].habitsHit++; per[k].habitsDue++; return; }
        if (due && !(born && k < born)) per[k].habitsDue++;
      });
    });
  });

  // Focus time
  safe(() => wr_list('nylaos_focus_sessions').forEach(s => {
    const d = day(s.date), m = Number(s.minutes);
    if (d && isFinite(m) && m > 0) { d.focus += m; d.sessions++; }
  }));

  // Notes written or edited (a page counts once)
  safe(() => wr_list('nylaos_nb_pages').forEach(p => {
    const made = day(wr_dayOf(p.created) || wr_dayOf(p.id));
    if (made) { made.notesNew++; return; }
    const edited = day(wr_dayOf(p.updated));
    if (edited) edited.notesEdited++;
  }));

  // Ideas captured
  safe(() => wr_list('nylaos_ideas').forEach(i => {
    const d = day(wr_dayOf(i.created) || wr_dayOf(i.id));
    if (d) d.ideas++;
  }));

  // Daily Top 3
  safe(() => days.forEach(k => {
    if (k > today) return; // a Top 3 written ahead for later this week is not "kept" or "missed" yet
    const items = wr_read('nylaos_top3_' + k, null);
    if (!Array.isArray(items)) return;
    items.slice(0, 3).forEach(it => {
      if (!it || typeof it !== 'object' || !wr_text(it.text)) return;
      per[k].top3Set++;
      if (it.done) per[k].top3Done++;
    });
  }));

  // Cycle phase, only when she has logged a period, and never for days before the first one
  let cycle = null;
  safe(() => {
    const starts = wr_list('nylaos_periods').map(p => p.start).filter(wr_isKey).sort();
    if (!starts.length || typeof getCycleForDate !== 'function') return;
    const runs = [];
    days.forEach(k => {
      if (k < starts[0]) return;
      const c = getCycleForDate(wr_date(k));
      if (!c || c.stale || !c.name) return;
      const last = runs[runs.length - 1];
      if (last && last.name === c.name) last.to = c.day;
      else runs.push({ name: String(c.name), color: typeof c.color === 'string' ? c.color : '', from: c.day, to: c.day });
    });
    if (runs.length) cycle = runs;
  });

  // Carry over
  let carry = [];
  safe(() => {
    const cutoff = sunday < today ? sunday : today;
    carry = tasks.filter(t => !t.done && t.source !== 'calendar' && t.id != null && wr_isKey(t.calendarDate) && t.calendarDate <= cutoff && wr_text(t.text))
      .map(t => ({ id: String(t.id), text: wr_text(t.text, 160), due: t.calendarDate }))
      .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  });

  const list = days.map(k => per[k]);
  const sum = f => list.reduce((a, d) => a + f(d), 0);
  const totals = {
    done: sum(d => d.done.length), habitsDue: sum(d => d.habitsDue), habitsHit: sum(d => d.habitsHit),
    focus: sum(d => d.focus), sessions: sum(d => d.sessions), events: sum(d => d.events.length),
    notesNew: sum(d => d.notesNew), notesEdited: sum(d => d.notesEdited), ideas: sum(d => d.ideas),
    top3Set: sum(d => d.top3Set), top3Done: sum(d => d.top3Done),
  };
  const bestDay = list.filter(d => d.done.length).sort((a, b) => b.done.length - a.done.length)[0] || null;
  return { monday, sunday, today, isCurrent: monday === wr_monday(today), days: list, totals, habitCount, cycle, carry, bestDay,
    doneTitles: list.reduce((a, d) => a.concat(d.done), []) };
};

// The seven tiles. A tile with nothing to show carries a kind line instead of a number.
const wr_tiles = data => {
  const t = data.totals, now = data.isCurrent;
  const pct = t.habitsDue ? Math.round(t.habitsHit / t.habitsDue * 100) : 0;
  return [
    { id: 'tasks', icon: '✅', label: 'Tasks finished', value: t.done ? String(t.done) : '',
      sub: data.bestDay ? `Most on ${wr_fmt(data.bestDay.key, { weekday: 'long' })}` : '',
      empty: now ? 'Nothing checked off yet. The week is still yours.' : 'No tasks were checked off this week.' },
    { id: 'habits', icon: '🌿', label: 'Habits kept', value: t.habitsDue ? `${t.habitsHit} of ${t.habitsDue}` : '',
      sub: t.habitsDue ? `${pct}% of the times they were due` : '',
      empty: data.habitCount ? 'No habits were due on these days.' : 'No habits set up yet.' },
    { id: 'focus', icon: '⏱', label: 'Focus time', value: t.focus ? wr_mins(t.focus) : '',
      sub: t.sessions ? wr_plural(t.sessions, 'session') : '',
      empty: now ? 'No focus sessions yet this week.' : 'No focus sessions this week.' },
    { id: 'events', icon: '🗓', label: 'Events', value: t.events ? String(t.events) : '',
      sub: t.events ? 'on your calendar' : '', empty: 'A clear calendar. Room to breathe.' },
    { id: 'notes', icon: '📝', label: 'Notes', value: (t.notesNew + t.notesEdited) ? String(t.notesNew + t.notesEdited) : '',
      sub: [t.notesNew ? `${t.notesNew} written` : '', t.notesEdited ? `${t.notesEdited} edited` : ''].filter(Boolean).join(', '),
      empty: 'No pages written or edited.' },
    { id: 'ideas', icon: '💡', label: 'Ideas captured', value: t.ideas ? String(t.ideas) : '',
      sub: t.ideas ? 'saved to your Idea Bank' : '', empty: now ? 'No new ideas yet. They will come.' : 'No new ideas this week.' },
    { id: 'top3', icon: '✨', label: 'Top 3 kept', value: t.top3Set ? `${t.top3Done} of ${t.top3Set}` : '',
      sub: t.top3Set ? 'of the ones you set' : '', empty: 'No Top 3 was set this week.' },
  ];
};
const wr_tileLine = tile => (tile.value ? `${tile.label}: ${tile.value}${tile.sub ? ` (${tile.sub})` : ''}` : `${tile.label}: ${tile.empty}`);
const wr_cycleLine = cycle => (cycle && cycle.length ? cycle.map(c => c.name).join(', then ') : '');
const wr_hasAnything = data => { const t = data.totals; return !!(t.done || t.habitsHit || t.focus || t.events || t.notesNew || t.notesEdited || t.ideas || t.top3Set); };

// ── Carry over writes ──────────────────────────────────────────────────
// Returns what each task's date was before (for Undo), or null when nothing could be saved.
const wr_moveTasks = (ids, dateKey) => {
  const want = new Set(ids.map(String));
  const all = wr_read('nylaos_tasks', null);
  if (!Array.isArray(all)) return null;
  const before = [];
  const next = all.map(t => {
    if (!t || typeof t !== 'object' || t.id == null || t.done || t.source === 'calendar' || !want.has(String(t.id))) return t;
    before.push({ id: String(t.id), from: t.calendarDate == null ? null : t.calendarDate, to: dateKey });
    return { ...t, calendarDate: dateKey };
  });
  if (!before.length) return [];
  if (!wr_write('nylaos_tasks', next)) return null;
  wr_tasksChanged();
  return before;
};
// Puts dates back, but only on tasks that still sit where the move left them.
const wr_undoMove = before => {
  const map = new Map(before.map(b => [b.id, b]));
  const all = wr_read('nylaos_tasks', null);
  if (!Array.isArray(all)) return false;
  let n = 0;
  const next = all.map(t => {
    if (!t || typeof t !== 'object' || t.id == null || t.source === 'calendar') return t;
    const b = map.get(String(t.id));
    if (!b || (t.calendarDate == null ? null : t.calendarDate) !== b.to) return t;
    n++; return { ...t, calendarDate: b.from };
  });
  if (!n) return false;
  if (!wr_write('nylaos_tasks', next)) return false;
  wr_tasksChanged();
  return true;
};

// ── Monday's Top 3 ─────────────────────────────────────────────────────
const wr_top3Existing = dateKey => {
  const v = wr_read('nylaos_top3_' + dateKey, null);
  return Array.isArray(v) ? v.filter(x => x && typeof x === 'object').map(x => ({ text: wr_str(x.text).trim(), done: !!x.done })).filter(x => x.text) : [];
};
const wr_top3Write = (dateKey, texts) => {
  const had = wr_top3Existing(dateKey);
  const items = [0, 1, 2].map(i => {
    const text = texts[i] || '';
    const same = text && had.find(x => x.text === text);
    return { text, done: !!(same && same.done) };
  });
  return wr_write('nylaos_top3_' + dateKey, items);
};

// ── AI reflection ──────────────────────────────────────────────────────
const WR_AI_SYSTEM = [
  'You are the quiet, warm voice inside Nyla\'s personal planner. She is closing out her week.',
  'Using only the facts she gives you, write a short reflection for her: 3 to 5 sentences, in second person, warm and specific, naming one or two real things she finished.',
  'Be honest and kind about a light week. Rest counts. End with one gentle thought for the week ahead.',
  'Plain text only: no headings, no lists, no markdown, no em dashes. At most one emoji, and only at the very end.',
  'Never invent anything that is not in the facts.',
].join(' ');
const wr_aiInput = (data, rec) => {
  const lines = [`${wr_weekTitle(data.monday)} (${wr_rangeLabel(data.monday)})${data.isCurrent ? ', still in progress' : ''}`, '', 'The numbers:'];
  wr_tiles(data).forEach(t => lines.push('- ' + wr_tileLine(t)));
  if (data.cycle) lines.push('- Cycle phase this week: ' + wr_cycleLine(data.cycle));
  if (data.carry.length) lines.push(`- Still open from this week or earlier: ${data.carry.length}`);
  if (data.doneTitles.length) {
    lines.push('', 'Tasks she finished:');
    data.doneTitles.slice(0, 40).forEach(t => lines.push('- ' + t));
    if (data.doneTitles.length > 40) lines.push(`- and ${data.doneTitles.length - 40} more`);
  }
  const own = [['Her wins, in her words', rec.wins], ['What was hard', rec.hard], ['What she learned', rec.learned]].filter(x => x[1].trim());
  if (own.length) { lines.push(''); own.forEach(([l, v]) => lines.push(`${l}: ${wr_text(v, 600)}`)); }
  const mood = WR_MOODS.find(m => m[0] === rec.mood);
  if (mood) lines.push(`How the week felt: ${mood[1]}`);
  const next = rec.next.map(x => x.trim()).filter(Boolean);
  if (next.length) lines.push(`Next week's top 3: ${next.join('; ')}`);
  return lines.join('\n');
};
// One kind line for anything that goes wrong. The real error only goes to the console.
const wr_aiProblem = e => {
  const m = String((e && e.message) || e || '');
  if (/sign[\s-]?in|signed in|not allowed/i.test(m)) return 'Sign in at the top right, then I can write this for you.';
  if (/rate limit/i.test(m)) return 'The AI is catching its breath. Try again in a few seconds.';
  if (/failed to fetch|network|load failed|offline/i.test(m)) return 'I could not reach the AI. Check your connection and try again.';
  return 'I could not write it just now. Try again in a minute.';
};
const wr_aiTidy = s => String(s || '').replace(/\s*\u2014\s*/g, ', ').replace(/\s+\u2013\s+/g, ', ').replace(/^[ \t]*[#>*]+[ \t]*/gm, '').replace(/\*\*/g, '').replace(/\n{3,}/g, '\n\n').trim();

// ── PDF ────────────────────────────────────────────────────────────────
// Built from escaped text only. No emoji: the PDF fonts have no glyphs for them.
const wr_paras = v => String(v || '').split(/\n+/).map(s => s.trim()).filter(Boolean).map(s => `<p>${wr_esc(s)}</p>`).join('');
const wr_pdfHtml = (data, rec) => {
  const out = ['<h2>Your week at a glance</h2><ul>'];
  wr_tiles(data).forEach(t => out.push(`<li>${wr_esc(wr_tileLine(t))}</li>`));
  if (data.cycle) out.push(`<li>${wr_esc('Cycle phase: ' + wr_cycleLine(data.cycle))}</li>`);
  out.push('</ul><h2>Day by day</h2>');
  data.days.forEach(d => {
    out.push(`<h3>${wr_esc(wr_fmt(d.key, { weekday: 'long', month: 'short', day: 'numeric' }))}</h3>`);
    const bits = wr_dayBits(d).map(b => b.plain);
    if (d.future && !d.events.length) { out.push('<p>Still to come.</p>'); return; }
    if (!d.done.length && !bits.length) { out.push('<p>A quiet day.</p>'); return; }
    if (d.done.length) out.push('<ul>' + d.done.map(t => `<li>${wr_esc(t)}</li>`).join('') + '</ul>');
    if (bits.length) out.push(`<p>${wr_esc(bits.join(' · '))}</p>`);
  });
  if (data.carry.length) {
    out.push('<h2>Still open</h2><ul>');
    data.carry.forEach(t => out.push(`<li>${wr_esc(t.text)} (due ${wr_esc(wr_short(t.due))})</li>`));
    out.push('</ul>');
  }
  const mood = WR_MOODS.find(m => m[0] === rec.mood);
  const next = rec.next.map(x => x.trim()).filter(Boolean);
  if (!wr_reviewEmpty(rec)) {
    out.push('<h2>Reflection</h2>');
    if (rec.wins.trim()) out.push('<h3>Wins</h3>' + wr_paras(rec.wins));
    if (rec.hard.trim()) out.push('<h3>What was hard</h3>' + wr_paras(rec.hard));
    if (rec.learned.trim()) out.push('<h3>What I learned</h3>' + wr_paras(rec.learned));
    if (mood) out.push(`<h3>How the week felt</h3><p>${wr_esc(mood[1])}</p>`);
    if (next.length) out.push('<h3>Next week\'s top 3</h3><ol>' + next.map(t => `<li>${wr_esc(t)}</li>`).join('') + '</ol>');
    if (rec.ai.trim()) out.push('<h3>A note on the week</h3>' + wr_paras(rec.ai));
  }
  return out.join('');
};

// The small facts under a day: what shows as chips on the page and as one line in the PDF.
const wr_dayBits = d => {
  const bits = [];
  if (d.habitsDue) bits.push({ icon: '🌿', plain: `Habits ${d.habitsHit} of ${d.habitsDue}`, text: `${d.habitsHit}/${d.habitsDue} habits` });
  if (d.focus) bits.push({ icon: '⏱', plain: `Focus ${wr_mins(d.focus)}`, text: wr_mins(d.focus) });
  if (d.events.length) bits.push({ icon: '🗓', plain: wr_plural(d.events.length, 'event'), text: wr_plural(d.events.length, 'event'), title: d.events.map(e => e.text).join(', ') });
  if (d.notesNew + d.notesEdited) bits.push({ icon: '📝', plain: wr_plural(d.notesNew + d.notesEdited, 'note'), text: wr_plural(d.notesNew + d.notesEdited, 'note') });
  if (d.ideas) bits.push({ icon: '💡', plain: wr_plural(d.ideas, 'idea'), text: wr_plural(d.ideas, 'idea') });
  if (d.top3Set) bits.push({ icon: '✨', plain: `Top 3: ${d.top3Done} of ${d.top3Set}`, text: `Top 3 ${d.top3Done}/${d.top3Set}` });
  return bits;
};

// ── Styles (functions, so C is only read while rendering) ──────────────
const wr_btn = (mobile, primary, quiet) => ({
  minHeight: mobile ? 38 : 32, padding: '0 14px', borderRadius: 20, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  border: primary ? `0.5px solid ${C.rose}` : `0.5px solid ${C.border}`,
  background: primary ? C.rose : quiet ? 'transparent' : `${C.pink}60`,
  color: primary ? '#fff' : quiet ? C.textLight : C.rose,
  boxShadow: primary ? `0 4px 12px ${C.rose}35` : 'none', transition: 'all .15s',
});
const wr_fieldStyle = mobile => ({
  width: '100%', boxSizing: 'border-box', resize: 'vertical', border: `0.5px solid ${C.border}`, borderRadius: 12, padding: '10px 12px',
  background: C.pinkLight, color: C.text, fontFamily: 'inherit', fontSize: mobile ? 16 : 13.5, lineHeight: 1.6, outline: 'none', display: 'block',
});
const wr_labelStyle = () => ({ fontFamily: "'DM Serif Display',serif", fontSize: 14.5, color: C.rose, margin: '0 0 8px' });

// ── Error boundary ─────────────────────────────────────────────────────
/* The app has no error boundary at its root, and the page she was last on is
   restored at launch, so a render error here would blank the app every time
   it opens. This keeps a failure inside the page. (React is a library global
   loaded in <head>, so extending it at the top level is safe.) */
class WrBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e) { console.warn((this.props.name || 'Weekly Review') + ' failed to render', e); }
  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback === undefined ? null : this.props.fallback;
  }
}
const WrFailed = ({ small }) => (
  <div style={{ maxWidth: small ? undefined : 980 }}>
    <div style={{ textAlign: 'center', padding: small ? '18px 16px' : '36px 20px', borderRadius: 18, border: `1px dashed ${C.border}`, background: `${C.pinkLight}80` }}>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: small ? 15 : 17, color: C.rose, marginBottom: 4 }}>
        {small ? 'This part could not load' : 'Your Weekly Review could not open'}
      </div>
      <div style={{ fontSize: 12.5, color: C.textLight, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
        Nothing was lost. Everything you wrote is still saved. Reload the page and it should come back.
      </div>
    </div>
  </div>
);

// ── Pieces ─────────────────────────────────────────────────────────────
const WrTile = ({ tile, mobile, wide }) => (
  <Card style={{ padding: mobile ? '12px 13px' : '14px 16px', position: 'relative', overflow: 'hidden', minWidth: 0, gridColumn: wide ? '1 / -1' : undefined }}>
    <div style={{ position: 'absolute', right: -18, top: -18, width: 70, height: 70, borderRadius: '50%', background: `${tile.value ? C.rose : C.lavender}14` }}/>
    <div style={{ fontSize: 10.5, color: C.textMuted, textTransform: 'uppercase', letterSpacing: .7, fontWeight: 600, position: 'relative' }}>{tile.icon} {tile.label}</div>
    {tile.value
      ? <>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: mobile ? 23 : 26, color: C.rose, lineHeight: 1.2, marginTop: 4, overflowWrap: 'anywhere', position: 'relative' }}>{tile.value}</div>
          {tile.sub && <div style={{ fontSize: 11.5, color: C.textLight, marginTop: 2 }}>{tile.sub}</div>}
        </>
      : <div style={{ fontSize: 12.5, color: C.textLight, fontStyle: 'italic', lineHeight: 1.5, marginTop: 8, position: 'relative' }}>{tile.empty}</div>}
  </Card>
);

const WrDayCard = ({ d, mobile }) => {
  const [all, setAll] = React.useState(false);
  const bits = wr_dayBits(d);
  const LIMIT = 4;
  const shown = all ? d.done : d.done.slice(0, LIMIT);
  const quiet = !d.done.length && !bits.length;
  return (
    <Card style={{ padding: mobile ? '12px 14px' : '14px 15px', minWidth: 0, opacity: d.future ? .72 : 1,
      border: `0.5px solid ${d.isToday ? C.rose + '70' : C.border}`, background: d.isToday ? C.pinkLight : C.card }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: quiet ? 4 : 8 }}>
        <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 15.5, color: C.rose }}>{wr_fmt(d.key, { weekday: mobile ? 'long' : 'short' })}</span>
        <span style={{ fontSize: 11.5, color: C.textMuted }}>{wr_fmt(d.key, { month: 'short', day: 'numeric' })}</span>
        {d.isToday && <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 20, background: `${C.rose}18`, color: C.rose, marginLeft: 'auto' }}>Today</span>}
        {!d.isToday && d.done.length > 0 && <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>{d.done.length} done</span>}
      </div>
      {shown.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12.5, color: C.text, lineHeight: 1.45, padding: '2px 0', minWidth: 0 }}>
          <span style={{ color: C.accent, flexShrink: 0 }}>✓</span>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{t}</span>
        </div>
      ))}
      {d.done.length > LIMIT && (
        <button onClick={() => setAll(a => !a)} style={{ background: 'none', border: 'none', padding: '4px 0', minHeight: mobile ? 34 : 24, color: C.rose, fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer' }}>
          {all ? 'Show fewer' : `and ${d.done.length - LIMIT} more`}
        </button>
      )}
      {bits.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: d.done.length ? 8 : 0 }}>
          {bits.map((b, i) => (
            <span key={i} title={b.title || ''} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: `${C.lavender}55`, color: C.text, whiteSpace: 'nowrap' }}>{b.icon} {b.text}</span>
          ))}
        </div>
      )}
      {quiet && <div style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>{d.future ? 'Still to come' : d.isToday ? 'Just getting started' : 'A quiet day'}</div>}
    </Card>
  );
};

const WrCarryOver = ({ data, target, mobile, onChanged }) => {
  const [undo, setUndo] = React.useState(null);
  const [showAll, setShowAll] = React.useState(false);
  React.useEffect(() => { setUndo(null); setShowAll(false); }, [data.monday]);
  const LIMIT = 8;
  const items = showAll ? data.carry : data.carry.slice(0, LIMIT);
  const mondayLabel = wr_fmt(target, { weekday: 'short', month: 'short', day: 'numeric' });
  const move = (ids, to, doneText) => {
    const before = wr_moveTasks(ids, to);
    if (before === null) { wr_say('That did not save. Try again in a moment.', 'error', 3000); return; }
    if (!before.length) { onChanged(); return; }
    setUndo({ before, text: doneText(before.length) });
    wr_say(doneText(before.length), 'success', 1800);
    onChanged();
  };
  const takeBack = () => {
    if (!undo) return;
    if (wr_undoMove(undo.before)) wr_say('Put back where it was', 'success', 1600);
    setUndo(null); onChanged();
  };
  const dueLine = k => {
    if (k === data.today) return 'Due today';
    let label = '';
    try { const p = prettyDue(k); if (p && p.label) label = p.label; } catch (e) {}
    if (!label) label = wr_short(k);
    if (label === 'Yesterday' || label === 'Today' || label === 'Tomorrow') label = label.toLowerCase();
    return `Was due ${label}`;
  };
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <SectionHeading style={{ marginBottom: 0 }}>🧺 Carry over</SectionHeading>
        {data.carry.length > 1 && (
          <button onClick={() => move(data.carry.map(t => t.id), target, n => `Moved ${n} to ${mondayLabel}`)} style={{ ...wr_btn(mobile, true), marginLeft: 'auto' }}>
            Move all {data.carry.length} to Monday
          </button>
        )}
      </div>
      {data.carry.length > 0 && (
        <div style={{ fontSize: 12, color: C.textLight, marginBottom: 10, lineHeight: 1.5 }}>
          Still open from this week or before. Monday is {mondayLabel}. No guilt, just pick where each one goes.
        </div>
      )}
      {undo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: C.text, background: `${C.lavender}45`, borderRadius: 12, padding: '6px 12px', marginBottom: 10 }}>
          <span style={{ minWidth: 0 }}>{undo.text}</span>
          <button onClick={takeBack} style={{ background: 'none', border: 'none', color: C.rose, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', minHeight: mobile ? 36 : 26, padding: '0 4px', textDecoration: 'underline' }}>Undo</button>
        </div>
      )}
      {!data.carry.length && (
        <div style={{ fontSize: 13, color: C.textLight, fontStyle: 'italic', padding: '4px 0 2px' }}>Nothing left hanging. Everything that was due is done or already moved ✨</div>
      )}
      {items.map((t, i) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '9px 0', borderTop: i ? `0.5px solid ${C.border}` : 'none' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{t.text}</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{dueLine(t.due)}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => move([t.id], target, () => `Moved to ${mondayLabel}`)} style={wr_btn(mobile)}>Move to Monday</button>
            <button onClick={() => move([t.id], null, () => 'Date removed. It is still in your tasks.')} style={wr_btn(mobile, false, true)}>No date</button>
          </div>
        </div>
      ))}
      {data.carry.length > LIMIT && (
        <button onClick={() => setShowAll(s => !s)} style={{ ...wr_btn(mobile, false, true), marginTop: 8 }}>
          {showAll ? 'Show fewer' : `Show all ${data.carry.length}`}
        </button>
      )}
    </Card>
  );
};

// A text box that saves as she types. The parent owns the value and the saving.
const WrArea = ({ label, value, placeholder, onChange, onBlur, mobile, rows }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={wr_labelStyle()}>{label}</div>
    <textarea value={value} rows={rows || 3} placeholder={placeholder} aria-label={label}
      onChange={e => onChange(e.target.value)} onBlur={onBlur} style={wr_fieldStyle(mobile)}/>
  </div>
);

const WrReflection = ({ monday, data, target, mobile, onSaved }) => {
  const [rec, setRec] = React.useState(() => wr_loadReview(monday));
  const [saved, setSaved] = React.useState(false);
  const [confirmTop3, setConfirmTop3] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [writing, setWriting] = React.useState(false);
  const [aiNote, setAiNote] = React.useState('');
  const latest = React.useRef(rec);
  const dirty = React.useRef(false);
  const timer = React.useRef(null);
  const savedTimer = React.useRef(null);
  const alive = React.useRef(true);
  const savedCb = React.useRef(onSaved);
  savedCb.current = onSaved;

  const flush = () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    // Stays dirty when the save fails, so coming back to the app never swaps her words for the stored copy.
    if (!wr_saveReview(monday, latest.current)) return;
    dirty.current = false;
    if (alive.current) {
      setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => { if (alive.current) setSaved(false); }, 1800);
    }
    try { savedCb.current && savedCb.current(); } catch (e) {}
  };
  const change = (patch, now) => {
    const next = { ...latest.current, ...patch };
    latest.current = next; dirty.current = true;
    setRec(next);
    clearTimeout(timer.current);
    if (now) flush(); else timer.current = setTimeout(flush, 600);
  };

  React.useEffect(() => {
    alive.current = true;
    // Leaving the page, or the app going to the background, saves what is pending.
    const hide = () => flush();
    // Coming back picks up anything another device wrote, unless she is mid-sentence.
    const back = () => { if (dirty.current) return; const fresh = wr_loadReview(monday); latest.current = fresh; setRec(fresh); };
    const vis = () => { if (document.visibilityState === 'hidden') hide(); else back(); };
    window.addEventListener('pagehide', hide);
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', vis);
    return () => {
      flush();
      alive.current = false;
      clearTimeout(savedTimer.current);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [monday]);

  const mondayLabel = wr_fmt(target, { weekday: 'short', month: 'short', day: 'numeric' });
  const nextTexts = () => { const t = latest.current.next.map(x => x.trim()).filter(Boolean); return [0, 1, 2].map(i => t[i] || ''); };
  const setTop3 = force => {
    const texts = nextTexts();
    if (!texts.some(Boolean)) { wr_say('Write at least one thing for next week first', 'info', 2400); return; }
    flush();
    const had = wr_top3Existing(target);
    if (!force && had.some(x => !texts.includes(x.text))) { setConfirmTop3(true); return; }
    setConfirmTop3(false);
    if (wr_top3Write(target, texts)) wr_say(`Set as your Top 3 for ${mondayLabel} ✨`, 'success', 2600);
  };

  const write = async () => {
    if (writing) return;
    setAiNote('');
    if (!wr_hasAnything(data) && wr_reviewEmpty({ ...latest.current, ai: '' })) {
      setAiNote('There is not much to reflect on yet. Come back once the week has a little more in it.');
      return;
    }
    if (typeof callClaude !== 'function') { setAiNote(wr_aiProblem('')); return; }
    setWriting(true);
    try {
      const text = wr_aiTidy(await callClaude({
        system: WR_AI_SYSTEM,
        messages: [{ role: 'user', content: wr_aiInput(data, latest.current) }],
        maxTokens: 1500, effort: 'low',
      }));
      if (!alive.current) return;
      if (!text || text === '(no reply)') setAiNote(wr_aiProblem(''));
      else setDraft(text);
    } catch (e) {
      console.warn('Weekly Review reflection failed', e);
      if (alive.current) setAiNote(wr_aiProblem(e));
    } finally {
      if (alive.current) setWriting(false);
    }
  };
  const keep = () => { change({ ai: draft }, true); setDraft(''); wr_say('Kept with this week', 'success', 1600); };
  // Clear on a fresh draft only drops the draft, so a reflection she already kept stays kept.
  const clearAi = () => {
    setAiNote('');
    if (draft) { setDraft(''); return; }
    if (latest.current.ai) change({ ai: '' }, true);
  };

  const aiText = draft || rec.ai;
  const hasNext = rec.next.some(x => x.trim());
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <SectionHeading>🌙 Reflection</SectionHeading>
        <span aria-live="polite" style={{ marginLeft: 'auto', fontSize: 11.5, color: C.textMuted, minHeight: 14 }}>{saved ? 'Saved ✓' : ''}</span>
      </div>

      <WrArea label="Wins ✨" value={rec.wins} mobile={mobile} placeholder="Big or tiny. What are you proud of?"
        onChange={v => change({ wins: v })} onBlur={flush}/>
      <WrArea label="What was hard" value={rec.hard} mobile={mobile} placeholder="What drained you, or did not go the way you hoped?"
        onChange={v => change({ hard: v })} onBlur={flush}/>
      <WrArea label="What I learned" value={rec.learned} mobile={mobile} placeholder="Something to keep, or to do differently next time"
        onChange={v => change({ learned: v })} onBlur={flush}/>

      <div style={{ marginBottom: 18 }}>
        <div style={wr_labelStyle()}>How the week felt</div>
        <div role="radiogroup" aria-label="How the week felt" style={{ display: 'flex', gap: mobile ? 6 : 8, flexWrap: 'wrap' }}>
          {WR_MOODS.map(([emoji, name]) => {
            const on = rec.mood === emoji;
            return (
              <button key={emoji} role="radio" aria-checked={on} aria-label={name} title={name}
                onClick={() => change({ mood: on ? '' : emoji }, true)}
                style={{ flex: mobile ? '1 1 0' : '0 0 auto', minWidth: mobile ? 0 : 64, padding: mobile ? '8px 2px 6px' : '8px 6px 6px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                  border: `0.5px solid ${on ? C.rose : C.border}`, background: on ? `${C.rose}18` : 'transparent', transition: 'all .15s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 22, lineHeight: 1.1, filter: on || !rec.mood ? 'none' : 'grayscale(.6)', opacity: on || !rec.mood ? 1 : .6 }}>{emoji}</span>
                <span style={{ fontSize: 10.5, color: on ? C.rose : C.textMuted }}>{name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 4 }}>
        <div style={wr_labelStyle()}>Next week’s top 3</div>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < 2 ? `0.5px solid ${C.border}` : 'none' }}>
            <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: C.accent, width: 16, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
            <input value={rec.next[i]} aria-label={`Next week, number ${i + 1}`}
              placeholder={['The one thing that would make next week a win', 'Then this', 'And this'][i]}
              onChange={e => change({ next: latest.current.next.map((x, j) => (j === i ? e.target.value : x)) })} onBlur={flush}
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: C.text, fontSize: mobile ? 16 : 14, fontFamily: 'inherit', outline: 'none', padding: '4px 0' }}/>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <button onClick={() => setTop3(false)} disabled={!hasNext} style={{ ...wr_btn(mobile, true), opacity: hasNext ? 1 : .5, cursor: hasNext ? 'pointer' : 'default' }}>Set as Monday’s Top 3</button>
          <span style={{ fontSize: 11.5, color: C.textMuted, minWidth: 0 }}>They will be waiting on your Daily page for {mondayLabel}.</span>
        </div>
        {confirmTop3 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10, fontSize: 12.5, color: C.text, background: `${C.lavender}45`, borderRadius: 12, padding: '8px 12px' }}>
            <span style={{ flex: '1 1 180px', minWidth: 0 }}>{mondayLabel} already has a Top 3. Replace it with these?</span>
            <button onClick={() => setTop3(true)} style={wr_btn(mobile, true)}>Replace</button>
            <button onClick={() => setConfirmTop3(false)} style={wr_btn(mobile, false, true)}>Keep what is there</button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 22, paddingTop: 18, borderTop: `0.5px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ ...wr_labelStyle(), margin: 0 }}>A note on your week</div>
          {!aiText && (
            <button onClick={write} disabled={writing} style={{ ...wr_btn(mobile, true), marginLeft: 'auto', opacity: writing ? .7 : 1, cursor: writing ? 'default' : 'pointer' }}>
              {writing ? 'Writing…' : 'Write my reflection ✦'}
            </button>
          )}
        </div>
        {!aiText && !aiNote && !writing && (
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6, lineHeight: 1.5 }}>A few warm sentences about the week, written from your numbers and what you finished.</div>
        )}
        {aiNote && <div role="status" style={{ fontSize: 12.5, color: C.textLight, marginTop: 10, lineHeight: 1.5, background: `${C.pinkLight}`, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: '9px 12px' }}>{aiNote}</div>}
        {aiText && (
          <div style={{ marginTop: 12 }}>
            <div style={{ background: C.gradA, borderRadius: 14, padding: mobile ? '14px 15px' : '16px 18px', fontFamily: "'DM Serif Display',serif", fontSize: mobile ? 15 : 15.5,
              color: C.text, lineHeight: 1.65, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{aiText}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
              {draft
                ? <button onClick={keep} style={wr_btn(mobile, true)}>Keep this</button>
                : <span style={{ fontSize: 11.5, color: C.textMuted, marginRight: 4 }}>Kept with this week</span>}
              <button onClick={write} disabled={writing} style={{ ...wr_btn(mobile), opacity: writing ? .7 : 1 }}>{writing ? 'Writing…' : 'Write a new one'}</button>
              <button onClick={clearAi} style={wr_btn(mobile, false, true)}>Clear</button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

const WrPastReviews = ({ rows, current, mobile, onOpen }) => {
  const [showAll, setShowAll] = React.useState(false);
  const LIMIT = 6;
  const shown = showAll ? rows : rows.slice(0, LIMIT);
  return (
    <Card>
      <SectionHeading>📚 Past reviews</SectionHeading>
      {!rows.length && (
        <div style={{ fontSize: 13, color: C.textLight, fontStyle: 'italic', lineHeight: 1.6 }}>
          Your reviews will collect here, one for each week you write something. This is the first page of the book.
        </div>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {shown.map(r => {
          const on = r.monday === current;
          return (
            <button key={r.monday} onClick={() => onOpen(r.monday)} aria-current={on ? 'true' : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                border: `0.5px solid ${on ? C.rose + '70' : C.border}`, background: on ? `${C.rose}12` : 'transparent', color: C.text }}>
              <span style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 18, background: C.gradA, flexShrink: 0 }}>{r.mood || '✦'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: "'DM Serif Display',serif", fontSize: 14.5, color: C.rose }}>{wr_weekTitle(r.monday)}{on ? ' · open now' : ''}</span>
                {r.snippet && <span style={{ display: 'block', fontSize: 12, color: C.textLight, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: mobile ? 'normal' : 'nowrap', overflowWrap: 'anywhere' }}>{r.snippet}</span>}
              </span>
              <span aria-hidden="true" style={{ color: C.textMuted, fontSize: 16, flexShrink: 0 }}>›</span>
            </button>
          );
        })}
      </div>
      {rows.length > LIMIT && (
        <button onClick={() => setShowAll(s => !s)} style={{ ...wr_btn(mobile, false, true), marginTop: 10 }}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</button>
      )}
    </Card>
  );
};

// ── The page ───────────────────────────────────────────────────────────
const WrPage = () => {
  const isMobile = useIsMobile();
  const today = wr_today();
  const thisMonday = wr_monday(today);
  const [picked, setPicked] = React.useState(thisMonday);
  const [dataTick, setDataTick] = React.useState(0);
  const [reviewTick, setReviewTick] = React.useState(0);
  // Future weeks are not reachable, whatever asks for them.
  const monday = wr_isKey(picked) && picked <= thisMonday ? wr_monday(picked) : thisMonday;
  const isCurrent = monday === thisMonday;
  const target = wr_targetMonday(monday);

  // Fresh numbers when tasks change elsewhere, and when she comes back to the app.
  React.useEffect(() => {
    const bump = () => setDataTick(n => n + 1);
    const both = () => { setDataTick(n => n + 1); setReviewTick(n => n + 1); };
    const vis = () => { if (document.visibilityState === 'visible') both(); };
    window.addEventListener('nyla-tasks-changed', bump);
    window.addEventListener('focus', both);
    window.addEventListener('storage', both);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('nyla-tasks-changed', bump);
      window.removeEventListener('focus', both);
      window.removeEventListener('storage', both);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  const data = React.useMemo(() => wr_weekData(monday), [monday, dataTick, today]);
  const past = React.useMemo(() => { try { return wr_pastReviews(); } catch (e) { return []; } }, [reviewTick, monday]);
  const tiles = wr_tiles(data);
  const open = k => { setPicked(k); try { window.scrollTo(0, 0); const m = document.querySelector('main'); if (m) m.scrollTop = 0; } catch (e) {} };

  const lastMonday = wr_addDays(thisMonday, -7);
  const earlyInWeek = wr_date(today).getDay() >= 1 && wr_date(today).getDay() <= 2;
  const nudge = isCurrent && earlyInWeek && !past.some(r => r.monday === lastMonday);

  const pdf = () => {
    try {
      const rec = wr_loadReview(monday);
      const r = printAsPdf(`Weekly Review, ${wr_weekTitle(monday)}`, wr_pdfHtml(data, rec), wr_rangeLabel(monday));
      if (r && typeof r.catch === 'function') r.catch(e => console.warn('Weekly Review PDF failed', e));
    } catch (e) {
      console.warn('Weekly Review PDF failed', e);
      wr_say('The PDF could not be made. Reload and try again.', 'error', 3200);
    }
  };

  const arrow = (label, glyph, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label}
      style={{ width: isMobile ? 40 : 34, height: isMobile ? 40 : 34, borderRadius: '50%', border: `0.5px solid ${C.border}`, background: `${C.pink}60`, color: C.rose,
        fontSize: 17, lineHeight: 1, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .35 : 1, fontFamily: 'inherit', display: 'grid', placeItems: 'center', padding: 0 }}>{glyph}</button>
  );

  return (
    <div className="fade-in" data-wr="page" style={{ maxWidth: 980, minWidth: 0 }}>
      <PageTitle subtitle={`${wr_rangeLabel(monday)} · ${isCurrent ? 'a calm look at the week so far' : 'a calm look back'}`}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {arrow('Previous week', '‹', () => open(wr_addDays(monday, -7)), false)}
            <Pill active={isCurrent} onClick={() => open(thisMonday)} style={isMobile ? { minHeight: 38 } : {}}>This week</Pill>
            {arrow(isCurrent ? 'Next week has not happened yet' : 'Next week', '›', () => open(wr_addDays(monday, 7)), isCurrent)}
            <button onClick={pdf} style={wr_btn(isMobile)}>📄 Download PDF</button>
          </div>
        }>{wr_weekTitle(monday)}</PageTitle>

      {nudge && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, padding: '10px 14px', borderRadius: 14, background: C.gradA, fontSize: 13, color: C.text }}>
          <span style={{ flex: '1 1 200px', minWidth: 0 }}>A new week just started. Want to close out last week first?</span>
          <button onClick={() => open(lastMonday)} style={wr_btn(isMobile, true)}>Open last week</button>
        </div>
      )}

      {data.cycle && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 12, padding: '4px 11px', borderRadius: 20, background: `${C.lavender}70`, color: C.text, maxWidth: '100%', overflowWrap: 'anywhere' }}>
            {data.cycle.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: C.textMuted }}>{' → '}</span>}
                <span style={{ color: c.color || C.rose }}>●</span> {c.name}
              </React.Fragment>
            ))}
            <span style={{ color: C.textLight }}>{` · cycle day ${data.cycle[0].from}${data.cycle.length > 1 || data.cycle[0].to !== data.cycle[0].from ? ` to ${data.cycle[data.cycle.length - 1].to}` : ''}`}</span>
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gap: isMobile ? 14 : 18 }}>
        <section aria-label="Your week at a glance">
          <SectionHeading style={{ marginBottom: 10 }}>Your week at a glance</SectionHeading>
          <div style={{ display: 'grid', gap: isMobile ? 8 : 12, gridTemplateColumns: isMobile ? 'minmax(0,1fr) minmax(0,1fr)' : 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            {/* Seven tiles in two columns: the first takes the full row on a phone so none sits alone. */}
            {tiles.map((t, i) => <WrTile key={t.id} tile={t} mobile={isMobile} wide={isMobile && i === 0}/>)}
          </div>
        </section>

        <section aria-label="Day by day">
          <SectionHeading style={{ marginBottom: 10 }}>Day by day</SectionHeading>
          <div style={{ display: 'grid', gap: isMobile ? 8 : 12, alignItems: 'start', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(auto-fill, minmax(210px, 1fr))' }}>
            {data.days.map(d => <WrDayCard key={d.key} d={d} mobile={isMobile}/>)}
          </div>
        </section>

        <WrBoundary name="Weekly Review carry over" fallback={<WrFailed small/>}>
          <WrCarryOver data={data} target={target} mobile={isMobile} onChanged={() => setDataTick(n => n + 1)}/>
        </WrBoundary>

        <WrBoundary key={'r' + monday} name="Weekly Review reflection" fallback={<WrFailed small/>}>
          <WrReflection key={monday} monday={monday} data={data} target={target} mobile={isMobile} onSaved={() => setReviewTick(n => n + 1)}/>
        </WrBoundary>

        <WrBoundary name="Weekly Review past reviews" fallback={<WrFailed small/>}>
          <WrPastReviews rows={past} current={monday} mobile={isMobile} onOpen={open}/>
        </WrBoundary>
      </div>
    </div>
  );
};

const WeeklyReview = () => <WrBoundary name="Weekly Review" fallback={<WrFailed/>}><WrPage/></WrBoundary>;
