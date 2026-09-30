/* ── Patterns (Reflect > Patterns) ─────────────────────────────────────
   Turns what Nyla OS already holds into things she did not know about
   herself. Everything is worked out on this device from her own logs.
   Nothing is sent anywhere unless she taps "What should I do with this?",
   and then only the summary numbers go (no task names, no notes, and
   habits travel as "[habit 1]" and get their names back on this device).

   Reads (never writes any of these)
     nylaos_tasks            done + completedDate (a YYYY-MM-DD day) = finished;
                             calendarDate = the date it was due; source 'calendar'
                             rows are events, not tasks. doneAt (a time) is read
                             when a task has one.
     nylaos_habits           [{ id, name, color, days? }], days = weekday numbers
     nylaos_habit_log        { `${habitId}_${YYYY-MM-DD}`: true }
     nylaos_focus_sessions   [{ id (the moment it finished), date, minutes }]
     nylaos_periods          [{ id, start, end }]
     nylaos_cycle_days       { 'YYYY-MM-DD': { mood (a word), energy, symptoms, note, flow } }
                             only the mood word is read here
     nylaos_day_closes       { 'YYYY-MM-DD': { mood 1 to 5, ... } }, only mood is read
     nylaos_top3_YYYY-MM-DD  [{ text, done }] x 3
   Writes
     nylaos_patterns_ai      { at, range, items:[{ title, text }] } the last three ideas
     nyla_patterns_range     the window she last picked (this device only)

   Honesty rules live in pat_core.NEED: a card shows only with enough behind
   it, a thin one says "An early read", and cycle cards count only days inside
   cycles she logged. No card makes a claim or gives advice about her body.

   Loads before the main app script: top level must not touch app globals.
   Every top-level name here is prefixed pat_ / Pat. The sums sit between the
   pat-core markers, with no JSX and no app globals, so the test can cut that
   block out and run it in Node. */

// <pat-core>
const pat_core = (() => {
  const DAY = 86400000;
  const MAX_DAYS = 1100; // "Everything" looks back three years at most
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const PHASES = ['Menstrual', 'Follicular', 'Ovulation', 'Luteal'];
  const MOONS = ['new', 'waxing', 'full', 'waning'];
  const MOON_LABEL = { new: 'New moon', waxing: 'Waxing', full: 'Full moon', waning: 'Waning' };
  const MOON_SAY = { new: 'around the new moon', waxing: 'under a waxing moon', full: 'around the full moon', waning: 'under a waning moon' };
  // The mood words the Period log offers, placed on the same 1 to 5 line the day close uses.
  const MOOD_SCORE = { Happy: 5, Loving: 5, Calm: 4, Meh: 3, Tired: 2, Irritable: 2, Anxious: 2, Sad: 1 };
  const RANGES = [
    { id: '30', label: '30 days', days: 30 },
    { id: '90', label: '90 days', days: 90 },
    { id: '365', label: 'A year', days: 365 },
    { id: 'all', label: 'Everything', days: null },
  ];
  // What a card needs before it shows (need) and before it stops being "An early read" (solid).
  const NEED = {
    tasks:   { days: 14, solidDays: 28, count: 10, solidCount: 30 },
    hours:   { count: 10, solidCount: 30 },
    cycle:   { cycles: 2, solidCycles: 4, days: 14, solidDays: 56, count: 10, solidCount: 30 },
    moon:    { days: 30, solidDays: 90, count: 10, solidCount: 30 },
    mood:    { count: 7, solidCount: 21 },
    habits:  { days: 14, solidDays: 28, count: 5, solidCount: 20 },
    focus:   { count: 3, solidCount: 10 },
    onTime:  { count: 10, solidCount: 30 },
    top3:    { days: 5, solidDays: 14 },
    moodDone:{ days: 4, solidDays: 10 },
  };

  // ── small tools ──
  const pad = n => String(n).padStart(2, '0');
  const dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const keyDate = k => { const p = String(k).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12); };
  const isKey = k => {
    if (typeof k !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
    const y = Number(k.slice(0, 4));
    if (y < 2000 || y > 2100) return false;
    return dk(keyDate(k)) === k; // 2026-02-31 is not a day
  };
  const addDays = (k, n) => { const d = keyDate(k); d.setDate(d.getDate() + n); return dk(d); };
  const diffDays = (a, b) => Math.round((keyDate(b) - keyDate(a)) / DAY);
  const eachDay = (from, to) => {
    const out = [];
    if (!isKey(from) || !isKey(to) || from > to) return out;
    for (let k = from, i = 0; k <= to && i < MAX_DAYS + 30; k = addDays(k, 1), i++) out.push(k);
    return out;
  };
  // A stored moment that carries a time of day: an ISO string or a Date.now() number. A bare day has none.
  const momentOf = v => {
    if (v == null || v === '' || typeof v === 'boolean' || typeof v === 'object') return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const n = typeof v === 'number' ? v : /^\d{12,}$/.test(String(v)) ? Number(v) : Date.parse(String(v));
    if (!isFinite(n) || n < 946684800000 || n > 4102444800000) return null;
    return n;
  };
  const dayOf = v => {
    if (isKey(v)) return v;
    const n = momentOf(v);
    return n == null ? null : dk(new Date(n));
  };
  const list = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : []);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const sum = a => a.reduce((x, y) => x + y, 0);
  const mean = a => (a.length ? sum(a) / a.length : 0);
  const median = a => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const round1 = n => Math.round(n * 10) / 10;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const plural = (n, word, many) => `${n} ${n === 1 ? word : (many || word + 's')}`;
  const hourLabel = h => { const x = ((h % 24) + 24) % 24; return x === 0 ? 'midnight' : x === 12 ? 'noon' : x < 12 ? `${x}am` : `${x - 12}pm`; };
  const minutesLabel = m => {
    const n = Math.round(m);
    if (n < 60) return `${n} min`;
    const h = Math.floor(n / 60), r = n % 60;
    return r ? `${h}h ${r}m` : `${h}h`;
  };
  // A lift in words: a small one as a percent, a big one as "times as much".
  const moreThan = (lift, tail) => (lift >= 100 ? `about ${round1(lift / 100 + 1)} times as much${tail ? ' as ' + tail : ''}` : `about ${lift}% more${tail ? ' than ' + tail : ''}`);
  const moodWord = s => (s >= 4.3 ? 'bright' : s >= 3.6 ? 'good' : s >= 2.8 ? 'in the middle' : s >= 2 ? 'low' : 'heavy');

  // ── the window ──
  const range = (id, today, earliest) => {
    const r = RANGES.find(x => x.id === String(id)) || RANGES[1];
    const t = isKey(today) ? today : dk(new Date());
    let from;
    if (r.days) from = addDays(t, -(r.days - 1));
    else {
      from = isKey(earliest) && earliest <= t ? earliest : addDays(t, -29);
      if (diffDays(from, t) > MAX_DAYS - 1) from = addDays(t, -(MAX_DAYS - 1));
    }
    return { id: r.id, label: r.label, from, to: t, days: diffDays(from, t) + 1 };
  };
  // The first day she has anything at all, so "Everything" knows where to begin.
  const earliest = raw => {
    const r = obj(raw), days = [];
    list(r.tasks).forEach(t => { if (t.done && t.source !== 'calendar') { const d = dayOf(t.completedDate); if (d) days.push(d); } });
    Object.keys(obj(r.habitLog)).forEach(k => { const d = String(k).slice(-10); if (r.habitLog[k] && isKey(d)) days.push(d); });
    list(r.sessions).forEach(s => { const d = dayOf(s.date); if (d) days.push(d); });
    list(r.periods).forEach(p => { if (isKey(p.start)) days.push(p.start); });
    [r.cycleDays, r.closes, r.top3].forEach(m => Object.keys(obj(m)).forEach(k => { if (isKey(k)) days.push(k); }));
    return days.length ? days.reduce((a, b) => (b < a ? b : a)) : null;
  };

  // ── tasks ──
  // Finished tasks in the window, as plain { day, due, hour }. Anything odd is skipped.
  const finished = (tasks, from, to) => {
    const out = [];
    list(tasks).forEach(t => {
      if (!t.done || t.source === 'calendar') return;
      const day = dayOf(t.completedDate);
      if (!day || day < from || day > to) return;
      const at = momentOf(t.doneAt) != null ? momentOf(t.doneAt) : momentOf(t.completedDate);
      out.push({ day, due: isKey(t.calendarDate) ? t.calendarDate : null, hour: at == null ? null : new Date(at).getHours() });
    });
    return out;
  };
  const countsByDay = fin => { const m = {}; fin.forEach(f => { m[f.day] = (m[f.day] || 0) + 1; }); return m; };
  const firstDay = fin => (fin.length ? fin.reduce((a, f) => (f.day < a ? f.day : a), fin[0].day) : null);

  // Tasks finished by weekday, per time that weekday came around (so a window
  // that holds five Mondays and four Sundays does not favor Monday).
  const weekdays = (fin, from, to) => {
    const counts = Array(7).fill(0), occurrences = Array(7).fill(0);
    fin.forEach(f => { counts[keyDate(f.day).getDay()]++; });
    eachDay(firstDay(fin) || from, to).forEach(k => { occurrences[keyDate(k).getDay()]++; });
    const perDay = counts.map((c, i) => (occurrences[i] ? c / occurrences[i] : 0));
    const total = sum(counts);
    let best = 0, quiet = 0;
    perDay.forEach((v, i) => {
      if (v > perDay[best] || (v === perDay[best] && counts[i] > counts[best])) best = i;
      if (v < perDay[quiet]) quiet = i;
    });
    const others = mean(perDay.filter((_, i) => i !== best));
    const lift = total && others > 0 ? Math.round((perDay[best] / others - 1) * 100) : null;
    return { counts, occurrences, perDay, total, best, bestName: WEEKDAYS[best], quiet, quietName: WEEKDAYS[quiet], lift, flat: lift != null && lift < 15 };
  };

  // Finished things per day inside each group (a cycle phase, a moon phase).
  // Per day, so a long phase is not favored. groupByDay is { 'YYYY-MM-DD': groupId }.
  const rates = (dayCounts, groupByDay, order, minDays) => {
    const min = minDays == null ? 3 : minDays;
    const g = {}, map = obj(groupByDay), counts = obj(dayCounts);
    order.forEach(id => { g[id] = { id, days: 0, done: 0, rate: 0 }; });
    Object.keys(map).forEach(day => {
      const id = map[day];
      if (!isKey(day) || !Object.prototype.hasOwnProperty.call(g, id)) return;
      g[id].days++; g[id].done += Number(counts[day]) || 0;
    });
    const groups = order.map(id => ({ ...g[id], rate: g[id].days ? g[id].done / g[id].days : 0 }));
    const days = sum(groups.map(x => x.days)), done = sum(groups.map(x => x.done));
    const seen = groups.filter(x => x.days >= min);
    let best = null, low = null;
    seen.forEach(x => { if (!best || x.rate > best.rate) best = x; if (!low || x.rate < low.rate) low = x; });
    let lift = null;
    if (best && done > 0 && days > best.days) {
      const rest = (done - best.done) / (days - best.days);
      lift = rest > 0 ? Math.round((best.rate / rest - 1) * 100) : null;
    }
    return { groups, days, done, overall: days ? done / days : 0, best: best && done > 0 ? best.id : null, low: low && done > 0 ? low.id : null, lift, flat: lift != null && lift < 15, seen: seen.length };
  };

  // The moon's eight faces folded into four, with the day before and after a
  // new or full moon counted as part of it (one day a month is too few to read).
  const moonGroups = idxByDay => {
    const m = obj(idxByDay), out = {};
    const ok = day => isKey(day) && Number.isInteger(m[day]) && m[day] >= 0 && m[day] <= 7;
    Object.keys(m).forEach(day => { if (ok(day)) { const i = m[day]; out[day] = i === 0 ? 'new' : i === 4 ? 'full' : i < 4 ? 'waxing' : 'waning'; } });
    Object.keys(m).forEach(day => {
      if (!ok(day) || (m[day] !== 0 && m[day] !== 4)) return;
      [-1, 1].forEach(n => { const k = addDays(day, n); if (out[k]) out[k] = m[day] === 0 ? 'new' : 'full'; });
    });
    return out;
  };

  // How many whole cycles her period history holds (start to next start, 15 to 60 days apart).
  const fullCycles = periods => {
    const starts = [...new Set(list(periods).map(p => p.start).filter(isKey))].sort();
    let cycles = 0;
    for (let i = 1; i < starts.length; i++) { const g = diffDays(starts[i - 1], starts[i]); if (g >= 15 && g <= 60) cycles++; }
    return { cycles, starts, first: starts[0] || null, last: starts[starts.length - 1] || null };
  };

  const onTime = fin => {
    const dated = fin.filter(f => f.due);
    const lateBy = dated.filter(f => f.day > f.due).map(f => diffDays(f.due, f.day));
    const buckets = [
      { id: 'one', label: '1 day', n: lateBy.filter(d => d === 1).length },
      { id: 'few', label: '2 to 3 days', n: lateBy.filter(d => d >= 2 && d <= 3).length },
      { id: 'week', label: '4 to 7 days', n: lateBy.filter(d => d >= 4 && d <= 7).length },
      { id: 'more', label: 'Over a week', n: lateBy.filter(d => d > 7).length },
    ];
    return {
      dated: dated.length, onTime: dated.length - lateBy.length, early: dated.filter(f => f.day < f.due).length,
      late: lateBy.length, share: pct(dated.length - lateBy.length, dated.length),
      medianLate: lateBy.length ? Math.round(median(lateBy)) : 0, maxLate: lateBy.length ? Math.max(...lateBy) : 0, buckets,
    };
  };

  // Days in a row with at least one thing finished.
  const momentum = (dayCounts, from, to) => {
    const counts = obj(dayCounts);
    const active = Object.keys(counts).filter(k => isKey(k) && k >= from && k <= to && counts[k] > 0).sort();
    if (!active.length) return { longest: 0, current: 0, activeDays: 0, days: 0 };
    let longest = 0, run = 0;
    const days = eachDay(active[0], to);
    days.forEach(k => { if (counts[k] > 0) { run++; longest = Math.max(longest, run); } else if (k !== to) run = 0; });
    return { longest, current: run, activeDays: active.length, days: days.length };
  };

  // ── habits ──
  const habitDays = h => (Array.isArray(h.days) ? h.days.filter(n => Number.isInteger(n) && n >= 0 && n <= 6) : []);
  const habitDue = (h, key) => { const d = habitDays(h); return !d.length || d.includes(keyDate(key).getDay()); };
  const habitOne = (h, log, to) => {
    const done = k => !!log[`${h.id}_${k}`];
    const prefix = `${h.id}_`;
    const logged = Object.keys(log).filter(k => k.indexOf(prefix) === 0 && log[k] && k.length === prefix.length + 10 && isKey(k.slice(prefix.length)) && k.slice(prefix.length) <= to).map(k => k.slice(prefix.length)).sort();
    // A habit starts counting the day it was made, or its first tick if that came earlier.
    const born = dayOf(h.created) || (typeof h.id === 'number' && h.id > 946684800000 ? dayOf(h.id) : null);
    const start = [born, logged[0]].filter(d => d && d <= to).sort()[0] || null;
    const weeks = [];
    for (let w = 7; w >= 0; w--) {
      const end = addDays(to, -7 * w), begin = addDays(end, -6);
      let due = 0, hit = 0;
      if (start) eachDay(begin, end).forEach(k => { if (k < start || !habitDue(h, k)) return; due++; if (done(k)) hit++; });
      weeks.push({ from: begin, to: end, due, hit, rate: due ? hit / due : null });
    }
    let best = 0, run = 0;
    if (start) {
      const begin = diffDays(start, to) > 729 ? addDays(to, -729) : start;
      eachDay(begin, to).forEach(k => {
        if (!habitDue(h, k)) return; // a day it is not due never breaks a streak
        if (done(k)) { run++; best = Math.max(best, run); }
        else if (k !== to) run = 0; // today still open does not break it either
      });
    }
    const last4 = weeks.slice(4), due28 = sum(last4.map(w => w.due)), hit28 = sum(last4.map(w => w.hit));
    return {
      id: h.id, name: String(h.name).trim(), color: typeof h.color === 'string' && /^#[0-9a-f]{6}$/i.test(h.color) ? h.color : null,
      weeks, best, current: run, due28, hit28, rate28: due28 ? hit28 / due28 : null,
      hits8: sum(weeks.map(w => w.hit)), trackedDays: start ? diffDays(start, to) + 1 : 0,
    };
  };
  const habits = (habitList, log, to) => {
    const l = obj(log);
    const items = list(habitList).filter(h => (typeof h.id === 'number' || typeof h.id === 'string') && h.id !== '' && typeof h.name === 'string' && h.name.trim()).map(h => habitOne(h, l, to));
    const ready = items.filter(h => h.trackedDays >= 14 && h.due28 >= 4);
    let love = null, star = null, longest = null;
    ready.forEach(h => { if (h.rate28 < 0.8 && (!love || h.rate28 < love.rate28)) love = h; });
    ready.forEach(h => { if (h.rate28 >= 0.5 && (!love || h.id !== love.id) && (!star || h.rate28 > star.rate28)) star = h; });
    items.forEach(h => { if (h.best > 0 && (!longest || h.best > longest.best)) longest = h; });
    return {
      items, needsLove: love ? love.id : null, star: star ? star.id : null, longest: longest ? longest.id : null,
      trackedDays: items.length ? Math.max(...items.map(h => h.trackedDays)) : 0, hits8: sum(items.map(h => h.hits8)),
    };
  };

  // ── focus ──
  const sessionsClean = (sessions, to) => list(sessions).map(s => {
    const day = dayOf(s.date), minutes = Number(s.minutes);
    if (!day || day > to || typeof s.minutes === 'boolean' || s.minutes == null || s.minutes === '' || !isFinite(minutes) || minutes <= 0 || minutes > 600) return null;
    const end = momentOf(s.id);
    // The id is the moment it finished, so the session began that many minutes earlier.
    return { day, minutes, hour: end == null || dk(new Date(end)) !== day ? null : new Date(end - minutes * 60000).getHours() };
  }).filter(Boolean);
  const focus = (sessions, to) => {
    const all = sessionsClean(sessions, to);
    const weeks = [];
    for (let w = 7; w >= 0; w--) {
      const end = addDays(to, -7 * w), begin = addDays(end, -6);
      const mine = all.filter(s => s.day >= begin && s.day <= end);
      weeks.push({ from: begin, to: end, minutes: sum(mine.map(s => s.minutes)), count: mine.length });
    }
    const recent = all.filter(s => s.day >= weeks[0].from);
    const minutes = sum(weeks.map(w => w.minutes));
    let bestWeek = -1;
    weeks.forEach((w, i) => { if (w.minutes > 0 && (bestWeek < 0 || w.minutes > weeks[bestWeek].minutes)) bestWeek = i; });
    const early = sum(weeks.slice(0, 4).map(w => w.minutes)), late = sum(weeks.slice(4).map(w => w.minutes));
    return { weeks, count: recent.length, everCount: all.length, minutes, usual: Math.round(median(recent.map(s => s.minutes))), bestWeek, trend: late > early * 1.2 ? 'up' : late < early * 0.8 ? 'down' : 'steady', activeWeeks: weeks.filter(w => w.count).length };
  };

  // ── hours ──
  const hours = (fin, sessions, from, to) => {
    const tasks = Array(24).fill(0), focusAt = Array(24).fill(0);
    fin.forEach(f => { if (f.hour != null) tasks[f.hour]++; });
    sessionsClean(sessions, to).forEach(s => { if (s.hour != null && s.day >= from) focusAt[s.hour]++; });
    const both = tasks.map((n, h) => n + focusAt[h]);
    const total = sum(both);
    let peakStart = 0, peak = -1;
    for (let h = 0; h <= 21; h++) { const n = both[h] + both[h + 1] + both[h + 2]; if (n > peak) { peak = n; peakStart = h; } }
    return { tasks, focus: focusAt, both, total, timedTasks: sum(tasks), timedFocus: sum(focusAt), peakStart, peakEnd: peakStart + 3, peakShare: pct(Math.max(peak, 0), total) };
  };

  // ── top 3 ──
  const top3 = (byDay, from, to) => {
    const m = obj(byDay);
    let days = 0, items = 0, done = 0, fullDays = 0;
    const seen = {};
    Object.keys(m).forEach(day => {
      if (!isKey(day) || day < from || day > to || !Array.isArray(m[day])) return;
      const set = m[day].filter(x => x && typeof x === 'object' && typeof x.text === 'string' && x.text.trim()).slice(0, 3);
      if (!set.length) return;
      const n = set.filter(x => x.done === true).length;
      days++; items += set.length; done += n; if (n === set.length) fullDays++;
      seen[day] = { set: set.length, done: n };
    });
    const recent = eachDay(addDays(to, -13) < from ? from : addDays(to, -13), to).map(day => ({ day, set: seen[day] ? seen[day].set : 0, done: seen[day] ? seen[day].done : 0 }));
    return { days, items, done, fullDays, rate: pct(done, items), recent };
  };

  // ── mood ──
  // One point a day: the day close's 1 to 5 when she closed the day, else the Period log's mood word.
  const mood = (cycleDays, closes, from, to) => {
    const logs = obj(cycleDays), cl = obj(closes), words = {};
    const points = [];
    [...new Set([...Object.keys(logs), ...Object.keys(cl)])].filter(k => isKey(k) && k >= from && k <= to).sort().forEach(day => {
      const c = obj(cl[day]), l = obj(logs[day]);
      const n = typeof c.mood === 'number' || (typeof c.mood === 'string' && c.mood.trim() !== '') ? Number(c.mood) : NaN;
      const word = typeof l.mood === 'string' && Object.prototype.hasOwnProperty.call(MOOD_SCORE, l.mood) ? l.mood : null;
      if (word) words[word] = (words[word] || 0) + 1;
      if (Number.isInteger(n) && n >= 1 && n <= 5) points.push({ day, score: n, source: 'close' });
      else if (word) points.push({ day, score: MOOD_SCORE[word], source: 'log' });
    });
    const half = Math.floor(points.length / 2);
    const before = mean(points.slice(0, half).map(p => p.score)), after = mean(points.slice(points.length - half).map(p => p.score));
    const drift = half >= 3 ? after - before : 0;
    let series = points.map(p => ({ day: p.day, score: p.score }));
    if (points.length > 45) {
      const b = {};
      points.forEach(p => { const i = Math.floor(diffDays(from, p.day) / 7); (b[i] = b[i] || []).push(p.score); });
      series = Object.keys(b).map(Number).sort((x, y) => x - y).map(i => ({ day: addDays(from, i * 7), score: round1(mean(b[i])) }));
    }
    const topWords = Object.keys(words).sort((a, b) => words[b] - words[a] || a.localeCompare(b)).slice(0, 3).map(w => ({ word: w, n: words[w] }));
    return { points, series, weekly: points.length > 45, count: points.length, average: round1(mean(points.map(p => p.score))), drift: round1(drift), trend: drift >= 0.4 ? 'lifting' : drift <= -0.4 ? 'heavier' : 'steady', topWords };
  };
  const moodBy = (points, groupByDay, order) => {
    const map = obj(groupByDay), g = {};
    order.forEach(id => { g[id] = []; });
    points.forEach(p => { const id = map[p.day]; if (g[id]) g[id].push(p.score); });
    const groups = order.map(id => ({ id, n: g[id].length, average: g[id].length ? round1(mean(g[id])) : null }));
    let best = null;
    groups.forEach(x => { if (x.n >= 3 && (!best || x.average > best.average)) best = x; });
    const seen = groups.filter(x => x.n >= 3);
    const spread = seen.length > 1 ? Math.max(...seen.map(x => x.average)) - Math.min(...seen.map(x => x.average)) : 0;
    return { groups, count: sum(groups.map(x => x.n)), best: best && spread >= 0.3 ? best.id : null, seen: seen.length };
  };
  const moodAndDone = (points, dayCounts) => {
    const counts = obj(dayCounts);
    const bright = points.filter(p => p.score >= 4).map(p => counts[p.day] || 0);
    const heavy = points.filter(p => p.score <= 2).map(p => counts[p.day] || 0);
    return { brightDays: bright.length, heavyDays: heavy.length, brightAvg: round1(mean(bright)), heavyAvg: round1(mean(heavy)) };
  };

  // ── honesty ──
  // checks: [{ have, need, solid, label }]. Shows only when every need is met;
  // an early read until every solid mark is met too.
  const grade = checks => {
    const c = (checks || []).filter(Boolean);
    const show = c.length > 0 && c.every(x => x.have >= x.need);
    const early = show && c.some(x => x.solid != null && x.have < x.solid);
    const progress = c.length ? Math.min(...c.map(x => (x.need ? Math.min(1, x.have / x.need) : 1))) : 0;
    const missing = c.filter(x => x.have < x.need).map(x => `${x.need} ${x.label} (${x.have} so far)`);
    return { show, early, progress, missing };
  };

  // ── everything, as cards ──
  // raw  { tasks, habits, habitLog, sessions, periods, cycleDays, closes, top3 }
  // maps { phaseByDay: { day: 'Follicular' }, moonIdxByDay: { day: 0..7 } } built by the page
  const report = (raw, r, maps) => {
    const d = obj(raw), mp = obj(maps);
    const from = r.from, to = r.to;
    const fin = finished(d.tasks, from, to);
    const dayCounts = countsByDay(fin);
    const first = firstDay(fin);
    const span = first ? diffDays(first, to) + 1 : 0;
    const cards = [];
    const add = (card, checks, build) => {
      const g = grade(checks);
      cards.push({ ...card, ...g, ...(g.show ? build() : {}) });
    };
    const N = NEED;

    // Your strongest days
    const wd = weekdays(fin, from, to);
    add({ id: 'weekday', emoji: '📅', title: 'Your strongest days', go: ['tasks', 'Today'], goLabel: 'Finish a few tasks' },
      [{ have: span, need: N.tasks.days, solid: N.tasks.solidDays, label: 'days since your first finished task' }, { have: fin.length, need: N.tasks.count, solid: N.tasks.solidCount, label: 'finished tasks' }],
      () => ({
        sentence: wd.flat ? 'Your week runs steady. No single day carries it, and that is its own kind of strength.'
          : wd.lift == null ? `${wd.bestName}s are your power day. Nearly everything you finish lands there.`
          : `${wd.bestName}s are your power day. You finish ${moreThan(wd.lift, 'on your other days')}.`,
        detail: `${plural(wd.total, 'thing')} finished in this window. ${wd.flat ? '' : `${wd.quietName}s are your quietest, and every week needs one of those.`}`.trim(),
        chip: wd.flat ? null : { big: `${wd.bestName}s`, small: 'your power day' },
        facts: { finishedByWeekday: WEEKDAYS.reduce((o, n, i) => { o[n] = wd.counts[i]; return o; }, {}), strongest: wd.bestName, quietest: wd.quietName, percentMoreThanOtherDays: wd.lift, steady: wd.flat },
        data: wd,
      }));

    // Your best hours
    const hr = hours(fin, d.sessions, from, to);
    add({ id: 'hours', emoji: '⏰', title: 'Your best hours', go: ['home', 'Focus Mode'], goLabel: 'Run a focus session' },
      [{ have: hr.total, need: N.hours.count, solid: N.hours.solidCount, label: 'focus sessions or timed tasks' }],
      () => ({
        sentence: `Your brightest stretch is ${hourLabel(hr.peakStart)} to ${hourLabel(hr.peakEnd)}. ${hr.peakShare}% of what you timed begins there.`,
        detail: hr.timedTasks ? 'Focus sessions and finished tasks that carry a time.' : 'Read from when your focus sessions began. Finished tasks only remember their day.',
        chip: { big: `${hourLabel(hr.peakStart)} to ${hourLabel(hr.peakEnd)}`, small: 'your brightest hours' },
        facts: { brightestWindow: `${hourLabel(hr.peakStart)} to ${hourLabel(hr.peakEnd)}`, percentInThatWindow: hr.peakShare, timedMoments: hr.total },
        data: hr,
      }));

    // Your cycle and your energy
    const cyc = fullCycles(d.periods);
    const phaseMap = obj(mp.phaseByDay);
    const ph = rates(dayCounts, phaseMap, PHASES);
    add({ id: 'cycle', emoji: '🌸', title: 'Your cycle and your energy', go: ['period', 'Cycle Overview'], goLabel: 'Log your period' },
      [{ have: cyc.cycles, need: N.cycle.cycles, solid: N.cycle.solidCycles, label: 'full cycles logged' }, { have: ph.days, need: N.cycle.days, solid: N.cycle.solidDays, label: 'days inside cycles you logged' }, { have: ph.done, need: N.cycle.count, solid: N.cycle.solidCount, label: 'tasks finished on those days' }],
      () => ({
        sentence: !ph.best || ph.flat ? 'Your pace holds steady across your whole cycle.'
          : ph.lift == null ? `Nearly everything you finish lands in your ${ph.best.toLowerCase()} phase.`
          : `You finish ${moreThan(ph.lift)} in your ${ph.best.toLowerCase()} phase.`,
        detail: 'Counted per day, so a longer phase gets no head start. Only days inside cycles you logged are counted.',
        chip: ph.best && !ph.flat ? { big: ph.best, small: 'your fullest phase' } : null,
        facts: { finishedPerDayByPhase: ph.groups.reduce((o, x) => { o[x.id] = round1(x.rate); return o; }, {}), fullestPhase: ph.flat ? null : ph.best, percentMoreThanOtherPhases: ph.lift, steady: ph.flat, fullCyclesLogged: cyc.cycles },
        data: ph,
      }));

    // You and the moon
    const moonMap = moonGroups(mp.moonIdxByDay);
    const moonFrom = first || from;
    const moonIn = {};
    Object.keys(moonMap).forEach(k => { if (k >= moonFrom && k <= to) moonIn[k] = moonMap[k]; });
    const mo = rates(dayCounts, moonIn, MOONS);
    add({ id: 'moon', emoji: '🌙', title: 'You and the moon', go: ['tasks', 'Today'], goLabel: 'Finish a few tasks' },
      [{ have: mo.days, need: N.moon.days, solid: N.moon.solidDays, label: 'days since your first finished task' }, { have: mo.done, need: N.moon.count, solid: N.moon.solidCount, label: 'finished tasks' }],
      () => ({
        sentence: !mo.best || mo.flat ? 'The moon does not move your pace much. You are steady through all of it.'
          : mo.lift == null ? `Nearly everything you finish lands ${MOON_SAY[mo.best]}.`
          : `You get the most done ${MOON_SAY[mo.best]}, ${moreThan(mo.lift)} per day.`,
        detail: 'Per day in each phase. New and full include the day before and the day after.',
        chip: mo.best && !mo.flat ? { big: MOON_LABEL[mo.best], small: 'your busiest moon' } : null,
        facts: { finishedPerDayByMoon: mo.groups.reduce((o, x) => { o[x.id] = round1(x.rate); return o; }, {}), busiest: mo.flat ? null : mo.best, percentMoreThanOtherPhases: mo.lift, steady: mo.flat },
        data: mo,
      }));

    // How you have been feeling
    const md = mood(d.cycleDays, d.closes, from, to);
    const mdPhase = moodBy(md.points, phaseMap, PHASES);
    const phaseOk = cyc.cycles >= N.cycle.cycles && mdPhase.count >= 10 && mdPhase.seen >= 2;
    add({ id: 'mood', emoji: '💗', title: 'How you have been feeling', go: ['reflect', 'Close the Day'], goLabel: 'Close your day' },
      [{ have: md.count, need: N.mood.count, solid: N.mood.solidCount, label: 'days with a mood logged' }],
      () => ({
        sentence: md.trend === 'lifting' ? 'Your days have been feeling lighter lately.'
          : md.trend === 'heavier' ? 'This last stretch has felt heavier than the one before it. You still showed up to write it down.'
          : `Your mood has held steady, mostly ${moodWord(md.average)}.`,
        detail: phaseOk && mdPhase.best ? `Your logs read brightest in your ${mdPhase.best.toLowerCase()} phase.` : `${plural(md.count, 'day')} with a mood in this window.`,
        chip: md.trend === 'lifting' ? { big: 'Lifting', small: 'how you have felt' } : null,
        facts: { daysWithMood: md.count, averageOutOf5: md.average, trend: md.trend, averageByPhase: phaseOk ? mdPhase.groups.reduce((o, x) => { o[x.id] = x.average; return o; }, {}) : undefined },
        data: { ...md, byPhase: phaseOk ? mdPhase : null },
      }));

    // Habits
    const hb = habits(d.habits, d.habitLog, to);
    const byId = id => hb.items.find(h => h.id === id) || null;
    add({ id: 'habits', emoji: '🌱', title: 'Your habits', go: ['lists', 'Habits'], goLabel: 'Tick a habit' },
      [{ have: hb.trackedDays, need: N.habits.days, solid: N.habits.solidDays, label: 'days since your first habit tick' }, { have: hb.hits8, need: N.habits.count, solid: N.habits.solidCount, label: 'habit ticks in 8 weeks' }],
      () => {
        const long = byId(hb.longest), love = byId(hb.needsLove);
        const names = {};
        hb.items.forEach((h, i) => { names[`[habit ${i + 1}]`] = h.name; });
        const lead = long ? `${long.name} holds your best streak at ${plural(long.best, 'day')}.` : 'Your streaks are just beginning.';
        return {
          sentence: love ? `${lead} ${love.name} is the one that needs a little love.` : `${lead} Every habit is being looked after.`,
          detail: 'Each square is one week, oldest on the left. Days a habit is not due never count against it.',
          chip: long ? { big: plural(long.best, 'day'), small: 'your best streak' } : null,
          facts: { habits: hb.items.map((h, i) => ({ label: `[habit ${i + 1}]`, bestStreakDays: h.best, currentStreakDays: h.current, percentDoneLast4Weeks: h.rate28 == null ? null : Math.round(h.rate28 * 100), needsLove: h.id === hb.needsLove })) },
          names, data: hb,
        };
      });

    // Focus
    const fc = focus(d.sessions, to);
    add({ id: 'focus', emoji: '🎧', title: 'Your focus', go: ['home', 'Focus Mode'], goLabel: 'Run a focus session' },
      [{ have: fc.count, need: N.focus.count, solid: N.focus.solidCount, label: 'focus sessions in 8 weeks' }],
      () => ({
        sentence: `A usual focus session for you is ${minutesLabel(fc.usual)}. You gave ${minutesLabel(fc.minutes)} to deep work in these 8 weeks.`,
        detail: fc.trend === 'up' ? 'The last four weeks hold more focus than the four before.' : fc.trend === 'down' ? 'The last four weeks were lighter than the four before. Seasons shift.' : `${plural(fc.count, 'session')} across ${plural(fc.activeWeeks, 'week')}.`,
        chip: { big: minutesLabel(fc.usual), small: 'your usual session' },
        facts: { usualSessionMinutes: fc.usual, minutesPerWeekOldestFirst: fc.weeks.map(w => w.minutes), sessionsIn8Weeks: fc.count, trend: fc.trend },
        data: fc,
      }));

    // On time or late
    const ot = onTime(fin);
    add({ id: 'onTime', emoji: '🎯', title: 'On time or late', go: ['tasks', 'Upcoming'], goLabel: 'Give a task a date' },
      [{ have: ot.dated, need: N.onTime.count, solid: N.onTime.solidCount, label: 'finished tasks that had a date' }],
      () => ({
        sentence: ot.late === 0 ? 'Every dated task in this window was finished by its date.'
          : `You finish ${ot.share}% of your dated tasks by their date. The late ones usually land ${plural(ot.medianLate, 'day')} after.`,
        detail: ot.early ? `${plural(ot.early, 'task')} finished ahead of ${ot.early === 1 ? 'its' : 'their'} date.` : `${plural(ot.dated, 'dated task')} finished in this window.`,
        chip: { big: `${ot.share}%`, small: 'finished by the date' },
        facts: { percentOnTime: ot.share, datedTasksFinished: ot.dated, finishedEarly: ot.early, usualDaysLate: ot.medianLate, lateByBucket: ot.buckets.reduce((o, b) => { o[b.label] = b.n; return o; }, {}) },
        data: ot,
      }));

    // Top 3
    const t3 = top3(d.top3, from, to);
    add({ id: 'top3', emoji: '✨', title: 'Your Top 3', go: ['calendar', 'Daily'], goLabel: 'Set a Top 3' },
      [{ have: t3.days, need: N.top3.days, solid: N.top3.solidDays, label: 'days with a Top 3 set' }],
      () => ({
        sentence: `Your Top 3 gets done ${t3.rate}% of the time.`,
        detail: t3.fullDays ? `On ${plural(t3.fullDays, 'day')} you cleared every one you set.` : `${plural(t3.days, 'day')} with a Top 3 in this window.`,
        chip: { big: `${t3.rate}%`, small: 'of your Top 3 done' },
        facts: { percentDone: t3.rate, daysWithTop3: t3.days, daysAllDone: t3.fullDays },
        data: t3,
      }));

    // Feeling and finishing
    const mdn = moodAndDone(md.points, dayCounts);
    add({ id: 'moodDone', emoji: '🫧', title: 'Feeling and finishing', go: ['reflect', 'Close the Day'], goLabel: 'Close your day' },
      [{ have: mdn.brightDays, need: N.moodDone.days, solid: N.moodDone.solidDays, label: 'brighter days logged' }, { have: mdn.heavyDays, need: N.moodDone.days, solid: N.moodDone.solidDays, label: 'heavier days logged' }, { have: fin.length, need: N.tasks.count, solid: N.tasks.solidCount, label: 'finished tasks' }],
      () => ({
        sentence: Math.abs(mdn.brightAvg - mdn.heavyAvg) < 0.3 ? `You finish about ${mdn.brightAvg} things a day whether the day feels bright or heavy.`
          : `On your brighter days you finish about ${mdn.brightAvg} things. On heavier days, ${mdn.heavyAvg}.`,
        detail: 'Neither number is a grade. It only shows how the two move together.',
        chip: null,
        facts: { finishedPerBrightDay: mdn.brightAvg, finishedPerHeavyDay: mdn.heavyAvg, brightDays: mdn.brightDays, heavyDays: mdn.heavyDays },
        data: mdn,
      }));

    // Showing up
    const mom = momentum(dayCounts, from, to);
    add({ id: 'momentum', emoji: '🔥', title: 'Showing up', go: ['tasks', 'Today'], goLabel: 'Finish a few tasks' },
      [{ have: span, need: N.tasks.days, solid: N.tasks.solidDays, label: 'days since your first finished task' }, { have: fin.length, need: N.tasks.count, solid: N.tasks.solidCount, label: 'finished tasks' }],
      () => ({
        sentence: `Your longest run was ${plural(mom.longest, 'day')} in a row with something finished.`,
        detail: `You finished something on ${mom.activeDays} of ${plural(mom.days, 'day')}.${mom.current > 1 ? ` You are ${mom.current} days into a run right now.` : ''}`,
        chip: mom.longest >= 3 ? { big: plural(mom.longest, 'day'), small: 'your longest run' } : null,
        facts: { longestRunDays: mom.longest, currentRunDays: mom.current, daysWithSomethingFinished: mom.activeDays, daysCounted: mom.days },
        data: mom,
      }));

    const shown = cards.filter(c => c.show);
    return {
      range: r, cards, shown: shown.length, gathering: cards.filter(c => !c.show),
      totals: { finished: fin.length, habitTicks: hb.hits8, sessions: fc.count, moods: md.count, cycles: cyc.cycles, top3Days: t3.days },
    };
  };

  // Only numbers and fixed words leave the device. No task text, no notes, no habit names.
  const summary = rep => {
    const facts = { window: rep.range.label, daysInWindow: rep.range.days, finishedTasks: rep.totals.finished };
    let names = {};
    rep.cards.filter(c => c.show && c.facts).forEach(c => {
      facts[c.id] = { earlyRead: !!c.early, ...c.facts };
      if (c.names) names = { ...names, ...c.names };
    });
    return { facts: JSON.parse(JSON.stringify(facts)), names };
  };

  // The reply, as up to three { title, text }. Habit labels get their names back here.
  const parseAdvice = (text, names) => {
    const n = obj(names);
    const tidy = s => String(s == null ? '' : s).replace(/\s*\u2014\s*/g, ', ').replace(/\s+\u2013\s+/g, ', ').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
    const swap = s => tidy(s).replace(/\[habit (\d+)\]/gi, (_, i) => n[`[habit ${i}]`] || 'that habit');
    const raw = String(text == null ? '' : text);
    let items = [];
    const m = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (m) {
      try {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr)) items = arr.filter(x => x && typeof x === 'object' && typeof x.text === 'string' && x.text.trim()).map(x => ({ title: swap(typeof x.title === 'string' ? x.title : ''), text: swap(x.text) }));
      } catch (e) { items = []; }
    }
    if (!items.length && !m) {
      items = raw.split(/\n+/).map(l => l.replace(/^\s*(?:\d+[.)]|[-*•✦])\s*/, '').trim()).filter(l => l.length > 12 && !/^[\[{]/.test(l)).map(l => ({ title: '', text: swap(l) }));
    }
    return items.slice(0, 3);
  };

  return {
    NEED, RANGES, WEEKDAYS, PHASES, MOONS, MOON_LABEL, MOOD_SCORE, MAX_DAYS,
    dk, keyDate, isKey, addDays, diffDays, eachDay, dayOf, momentOf, hourLabel, minutesLabel, plural, moreThan,
    range, earliest, finished, countsByDay, weekdays, rates, moonGroups, fullCycles, onTime, momentum,
    habits, focus, hours, top3, mood, moodBy, moodAndDone, grade, report, summary, parseAdvice,
  };
})();
// </pat-core>

// ── Reading her data ───────────────────────────────────────────────────
const pat_read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } };
const pat_write = (key, value) => { try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); return true; } catch (e) { return false; } };
const pat_readText = key => { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } };

const pat_loadRaw = () => {
  const top3 = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('nylaos_top3_') === 0) top3[k.slice(12)] = pat_read(k, null);
    }
  } catch (e) {}
  let habits = pat_read('nylaos_habits', null);
  if (!Array.isArray(habits)) habits = typeof DEFAULT_HABITS !== 'undefined' && Array.isArray(DEFAULT_HABITS) ? DEFAULT_HABITS.map((h, i) => ({ id: i + 1, name: h })) : [];
  return {
    tasks: pat_read('nylaos_tasks', []), habits, habitLog: pat_read('nylaos_habit_log', {}),
    sessions: pat_read('nylaos_focus_sessions', []), periods: pat_read('nylaos_periods', []),
    cycleDays: pat_read('nylaos_cycle_days', {}), closes: pat_read('nylaos_day_closes', {}), top3,
  };
};

// Cycle phase and moon face for every day in the window, from the app's own functions.
// Cycle days count only inside cycles she logged: nothing guessed forward or backward.
const pat_maps = (r, raw) => {
  const phaseByDay = {}, moonIdxByDay = {}, phaseColors = {};
  const periods = (Array.isArray(raw.periods) ? raw.periods : []).filter(p => p && typeof p === 'object' && pat_core.isKey(p.start)).sort((a, b) => a.start.localeCompare(b.start));
  if (periods.length && typeof getCycleForDate === 'function') {
    let stats;
    try { stats = typeof cycleStats === 'function' ? cycleStats(periods) : undefined; } catch (e) { stats = undefined; }
    const begin = periods[0].start > r.from ? periods[0].start : r.from;
    pat_core.eachDay(begin, r.to).forEach(k => {
      try {
        const c = getCycleForDate(pat_core.keyDate(k), periods, stats);
        if (!c || !c.name || c.stale || c.predicted || c.late) return;
        phaseByDay[k] = c.name;
        if (c.color) phaseColors[c.name] = c.color;
      } catch (e) {}
    });
  }
  if (typeof getMoonForDate === 'function') {
    // One day wider on each side, so a new or full moon at the edge still claims its neighbors.
    pat_core.eachDay(pat_core.addDays(r.from, -1), pat_core.addDays(r.to, 1)).forEach(k => {
      try { const m = getMoonForDate(pat_core.keyDate(k)); if (m && Number.isInteger(m.idx)) moonIdxByDay[k] = m.idx; } catch (e) {}
    });
  }
  return { phaseByDay, moonIdxByDay, phaseColors };
};

const pat_build = (rangeId, today) => {
  const raw = pat_loadRaw();
  const r = pat_core.range(rangeId, today, pat_core.earliest(raw));
  const maps = pat_maps(r, raw);
  const rep = pat_core.report(raw, r, maps);
  rep.phaseColors = maps.phaseColors;
  return rep;
};

const pat_go = (nav, sub) => { try { if (typeof window._navigateTo === 'function') window._navigateTo(nav, sub); } catch (e) {} };
const pat_shortDate = k => { try { return pat_core.keyDate(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) { return k; } };
const pat_slashDate = k => { try { const d = pat_core.keyDate(k); return `${d.getMonth() + 1}/${d.getDate()}`; } catch (e) { return ''; } };
const pat_aiProblem = e => {
  const m = String((e && e.message) || e || '');
  if (/sign[\s-]?in|signed in|not allowed/i.test(m)) return 'Sign in at the top right, then I can think this through with you.';
  if (/rate limit/i.test(m)) return 'The AI is catching its breath. Try again in a few seconds.';
  if (/failed to fetch|network|load failed|offline/i.test(m)) return 'I could not reach the AI. Check your connection and try again.';
  return 'I could not put ideas together just now. Try again in a minute.';
};
const PAT_AI_SYSTEM = [
  'You are the quiet, warm voice inside Nyla\'s personal planner. She is looking at patterns worked out from her own logs and asks what she could do with them.',
  'Using only the numbers she gives you, offer exactly three gentle, specific suggestions about how she plans her time, tasks, habits and focus. Each one names the number it rests on.',
  'Never give medical or health advice, and never advise her about her body, cycle, hormones, food, sleep or symptoms. You may suggest when to schedule kinds of work around rhythms her own numbers show.',
  'A pattern marked earlyRead is tentative: say so lightly. Never invent a number. Never scold. Rest counts.',
  'Habits are given as labels like [habit 1]. Refer to them only by that exact label, brackets included.',
  'No em dashes, no markdown. Reply with JSON only, in this shape: [{"title":"two to five words","text":"one or two warm sentences"}]',
].join(' ');

const PAT_PHASE_COLORS = { Menstrual: '#E57373', Follicular: '#9C6FD6', Ovulation: '#F48FB1', Luteal: '#64B5F6' };
const PAT_MOON_EMOJI = { new: '🌑', waxing: '🌓', full: '🌕', waning: '🌗' };
const PAT_GREETINGS = [
  'The quiet shape of your days, read back to you.',
  'Things your days have been trying to tell you.',
  'You, in numbers, held gently.',
  'A little mirror made from your own logs.',
];

// ── Keeps a render error inside the page ───────────────────────────────
class PatBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e) { console.warn((this.props.name || 'Patterns') + ' failed to render', e); }
  render() { return this.state.failed ? (this.props.fallback || null) : this.props.children; }
}

// ── Small charts, all in the app's own colors ──────────────────────────
// Upright bars. items: [{ key, label, value, top, color, best, title }]
const PatBars = ({ items, height = 96, label }) => {
  const max = Math.max(...items.map(i => i.value), 0);
  return (
    <div role="img" aria-label={label} style={{ display:'flex', alignItems:'flex-end', gap: items.length > 12 ? 2 : 6, width:'100%', minWidth:0 }}>
      {items.map(i => {
        const h = max > 0 ? Math.max(i.value > 0 ? 6 : 3, Math.round((i.value / max) * height)) : 3;
        const col = i.color || C.rose;
        return (
          <div key={i.key} title={i.title} style={{ flex:'1 1 0', minWidth:0, textAlign:'center' }}>
            <div style={{ fontSize:10.5, color: i.best ? C.rose : C.textMuted, fontWeight: i.best ? 700 : 400, height:15, lineHeight:'15px', overflow:'hidden', whiteSpace:'nowrap' }}>{i.top == null ? '' : i.top}</div>
            <div style={{ height, display:'flex', alignItems:'flex-end' }}>
              <div style={{ width:'100%', height:h, borderRadius: items.length > 12 ? 4 : 9, transition:'height .35s ease',
                background: i.value > 0 ? (i.best ? `linear-gradient(180deg, ${col}, ${col}b0)` : `${col}55`) : `${C.border}70`,
                boxShadow: i.best ? `0 4px 12px ${col}40` : 'none' }}/>
            </div>
            <div style={{ fontSize:10.5, marginTop:5, color: i.best ? C.rose : C.textLight, fontWeight: i.best ? 700 : 400, minHeight:14, overflow:'hidden', whiteSpace:'nowrap' }}>{i.label}</div>
            {i.sub != null && <div style={{ fontSize:9.5, color:C.textMuted, overflow:'hidden', whiteSpace:'nowrap' }}>{i.sub}</div>}
          </div>
        );
      })}
    </div>
  );
};

// Mood over time: a soft line with a wash under it. Scales as one piece, so nothing stretches.
const PatMoodLine = ({ series, label }) => {
  const W = 320, H = 110, px = 10, top = 10, bottom = 12;
  const n = series.length;
  const x = i => (n === 1 ? W / 2 : px + (i * (W - px * 2)) / (n - 1));
  const y = s => top + ((5 - s) / 4) * (H - top - bottom);
  const pts = series.map((p, i) => [x(i), y(p.score)]);
  let path = '';
  pts.forEach((p, i) => {
    if (!i) { path = `M${p[0].toFixed(1)},${p[1].toFixed(1)}`; return; }
    const q = pts[i - 1], mx = (q[0] + p[0]) / 2;
    path += ` C${mx.toFixed(1)},${q[1].toFixed(1)} ${mx.toFixed(1)},${p[1].toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  });
  const area = n > 1 ? `${path} L${pts[n - 1][0].toFixed(1)},${H - bottom} L${pts[0][0].toFixed(1)},${H - bottom} Z` : '';
  const gid = React.useMemo(() => 'patMood' + Math.random().toString(36).slice(2, 8), []);
  return (
    <div style={{ display:'flex', gap:8, alignItems:'stretch', minWidth:0 }}>
      <div style={{ display:'flex', flexDirection:'column', justifyContent:'space-between', fontSize:13, padding:'2px 0 6px' }} aria-hidden="true">
        <span>🥰</span><span>😐</span><span>😢</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'auto', display:'block', overflow:'visible' }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.rose} stopOpacity=".28"/>
              <stop offset="100%" stopColor={C.lavender} stopOpacity=".04"/>
            </linearGradient>
          </defs>
          {[1, 2, 3, 4, 5].map(s => <line key={s} x1={px} x2={W - px} y1={y(s)} y2={y(s)} stroke={C.border} strokeWidth=".6" strokeDasharray={s === 3 ? '0' : '2 4'}/>)}
          {area && <path d={area} fill={`url(#${gid})`}/>}
          {n > 1 && <path d={path} fill="none" stroke={C.rose} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>}
          {pts.map((p, i) => (n <= 45 || i === n - 1) && <circle key={i} cx={p[0]} cy={p[1]} r={i === n - 1 ? 4 : 2.4} fill={i === n - 1 ? C.rose : C.card} stroke={C.rose} strokeWidth="1.4"/>)}
        </svg>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10.5, color:C.textMuted, marginTop:4 }}>
          <span>{pat_shortDate(series[0].day)}</span><span>{n > 1 ? pat_shortDate(series[n - 1].day) : ''}</span>
        </div>
      </div>
    </div>
  );
};

const PatLegend = ({ items }) => (
  <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:10, fontSize:11, color:C.textLight }}>
    {items.map(([col, text]) => (
      <span key={text} style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
        <span style={{ width:9, height:9, borderRadius:3, background:col, display:'inline-block' }}/>{text}
      </span>
    ))}
  </div>
);

// ── One card per finding ───────────────────────────────────────────────
const PatEarly = () => (
  <span title="There is enough here to look, and not yet enough to be sure." style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:500,
    color:C.textLight, background:`${C.lavLight}`, border:`0.5px solid ${C.border}`, whiteSpace:'nowrap' }}>🌱 An early read</span>
);

const PatCard = ({ card, children, wide }) => (
  <Card className="fade-in" style={{ minWidth:0, gridColumn: wide ? '1 / -1' : 'auto', display:'flex', flexDirection:'column' }}>
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap', marginBottom:10 }}>
      <div style={{ fontSize:10.5, color:C.textMuted, textTransform:'uppercase', letterSpacing:.8, fontWeight:600 }}>{card.emoji} {card.title}</div>
      {card.early && <PatEarly/>}
    </div>
    <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:19, lineHeight:1.35, color:C.text, marginBottom:16, overflowWrap:'anywhere' }}>{card.sentence}</div>
    <div style={{ minWidth:0 }}>{children}</div>
    {card.detail && <div style={{ fontSize:11.5, color:C.textLight, lineHeight:1.6, marginTop:14 }}>{card.detail}</div>}
  </Card>
);

const PatWeekdayChart = ({ card }) => {
  const d = card.data;
  const order = [1, 2, 3, 4, 5, 6, 0];
  return <PatBars label={`Tasks finished by weekday. ${card.sentence}`} items={order.map(i => ({
    key: i, label: pat_core.WEEKDAYS[i].slice(0, 3), value: d.perDay[i], top: d.counts[i], best: !d.flat && i === d.best && d.total > 0,
    title: `${pat_core.WEEKDAYS[i]}: ${d.counts[i]} finished over ${pat_core.plural(d.occurrences[i], pat_core.WEEKDAYS[i])}`,
  }))}/>;
};

const PatHoursChart = ({ card }) => {
  const d = card.data;
  // Show the waking stretch, widened to hold anything that happened outside it.
  let a = 6, b = 22;
  d.both.forEach((n, h) => { if (n > 0) { a = Math.min(a, h); b = Math.max(b, h); } });
  const hoursShown = []; for (let h = a; h <= b; h++) hoursShown.push(h);
  const max = Math.max(...d.both, 1), height = 84;
  return (
    <div>
      <div role="img" aria-label={`Finished tasks and focus sessions by hour. ${card.sentence}`} style={{ display:'flex', alignItems:'flex-end', gap:2, height, minWidth:0 }}>
        {hoursShown.map(h => {
          const inPeak = h >= d.peakStart && h < d.peakEnd;
          const f = Math.round((d.focus[h] / max) * height), t = Math.round((d.tasks[h] / max) * height);
          return (
            <div key={h} title={`${pat_core.hourLabel(h)}: ${pat_core.plural(d.focus[h], 'focus session')}${d.timedTasks ? `, ${pat_core.plural(d.tasks[h], 'task')}` : ''}`}
              style={{ flex:'1 1 0', minWidth:0, height:'100%', display:'flex', flexDirection:'column', justifyContent:'flex-end', borderRadius:5, background: inPeak ? `${C.pink}45` : 'transparent' }}>
              {t > 0 && <div style={{ height:Math.max(t, 3), background:C.rose, borderRadius:'4px 4px 0 0', opacity: inPeak ? 1 : .6 }}/>}
              {f > 0 && <div style={{ height:Math.max(f, 3), background:C.lavender, borderRadius: t > 0 ? 0 : '4px 4px 0 0', opacity: inPeak ? 1 : .7 }}/>}
              {!t && !f && <div style={{ height:3, background:`${C.border}80`, borderRadius:2 }}/>}
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', gap:2, marginTop:5 }}>
        {hoursShown.map(h => <div key={h} style={{ flex:'1 1 0', minWidth:0, fontSize:9.5, color:C.textMuted, textAlign:'center', whiteSpace:'nowrap', overflow:'visible' }}>{(h - a) % 3 === 0 ? pat_core.hourLabel(h).replace('noon', '12pm').replace('midnight', '12am') : ''}</div>)}
      </div>
      <PatLegend items={d.timedTasks ? [[C.lavender, 'Focus sessions'], [C.rose, 'Finished tasks']] : [[C.lavender, 'Focus sessions']]}/>
    </div>
  );
};

const PatPhaseChart = ({ card, colors }) => {
  const d = card.data;
  return <PatBars label={`Tasks finished per day in each cycle phase. ${card.sentence}`} items={d.groups.map(g => ({
    key: g.id, label: g.id, value: g.rate, top: g.days ? g.rate.toFixed(1) : '', sub: g.days ? `${g.days}d` : 'no days yet',
    color: (colors && colors[g.id]) || PAT_PHASE_COLORS[g.id], best: !d.flat && g.id === d.best,
    title: `${g.id}: ${g.done} finished over ${pat_core.plural(g.days, 'day')}`,
  }))}/>;
};

const PatMoonChart = ({ card }) => {
  const d = card.data;
  return <PatBars label={`Tasks finished per day by moon phase. ${card.sentence}`} items={d.groups.map(g => ({
    key: g.id, label: `${PAT_MOON_EMOJI[g.id]} ${pat_core.MOON_LABEL[g.id].replace(' moon', '')}`, value: g.rate, top: g.days ? g.rate.toFixed(1) : '', sub: g.days ? `${g.days}d` : '',
    color: C.lavender, best: !d.flat && g.id === d.best, title: `${pat_core.MOON_LABEL[g.id]}: ${g.done} finished over ${pat_core.plural(g.days, 'day')}`,
  }))}/>;
};

const pat_face = s => (s >= 4.5 ? '🥰' : s >= 3.5 ? '😊' : s >= 2.5 ? '😐' : s >= 1.5 ? '😔' : '😢');
const PatMoodChart = ({ card, colors }) => {
  const d = card.data;
  return (
    <div>
      <PatMoodLine series={d.series} label={`Mood over time, ${d.weekly ? 'one point a week' : 'one point a day'}. ${card.sentence}`}/>
      {d.weekly && <div style={{ fontSize:10.5, color:C.textMuted, marginTop:4 }}>One point a week, so the line can breathe.</div>}
      {d.byPhase && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:14 }}>
          {d.byPhase.groups.filter(g => g.n >= 3).map(g => {
            const col = (colors && colors[g.id]) || PAT_PHASE_COLORS[g.id];
            return (
              <span key={g.id} title={`${g.id}: ${g.average} of 5 across ${pat_core.plural(g.n, 'day')}`} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 11px', borderRadius:20, fontSize:11.5,
                color:C.text, background:`${col}1c`, border:`0.5px solid ${col}66` }}>
                <span aria-hidden="true">{pat_face(g.average)}</span>{g.id}<b style={{ color:C.textLight, fontWeight:600 }}>{g.average}</b>
              </span>
            );
          })}
        </div>
      )}
      {d.topWords.length > 0 && (
        <div style={{ fontSize:11.5, color:C.textLight, marginTop:12 }}>Words you reach for most: {d.topWords.map(w => `${w.word} (${w.n})`).join(', ')}</div>
      )}
    </div>
  );
};

const PatHabitsChart = ({ card, isMobile }) => {
  const d = card.data;
  return (
    <div style={{ display:'grid', gap:12 }}>
      {d.items.map(h => {
        const col = h.color || C.rose, love = h.id === d.needsLove, star = h.id === d.longest;
        return (
          <div key={h.id} style={{ display:'flex', alignItems:'center', gap: isMobile ? 6 : 12, flexWrap:'wrap', minWidth:0 }}>
            <div style={{ flex: isMobile ? '1 1 100%' : '0 0 150px', minWidth:0, fontSize:13, color:C.text, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {h.name}{love && <span title="The one that needs a little love" style={{ marginLeft:6 }}>💗</span>}
            </div>
            <div role="img" aria-label={`${h.name}, last 8 weeks: ${h.weeks.map(w => (w.rate == null ? 'not tracked' : Math.round(w.rate * 100) + '%')).join(', ')}`} style={{ flex:'1 1 160px', minWidth:0, display:'flex', gap:4 }}>
              {h.weeks.map(w => (
                <div key={w.to} title={`Week of ${pat_shortDate(w.from)}: ${w.due ? `${w.hit} of ${w.due}` : 'not tracked yet'}`}
                  style={{ flex:'1 1 0', minWidth:0, height:24, borderRadius:7, border:`0.5px solid ${w.rate ? 'transparent' : C.border}`,
                    background: w.rate == null ? 'transparent' : w.rate === 0 ? `${col}14` : `${col}${Math.round(60 + w.rate * 195).toString(16).padStart(2, '0')}` }}/>
              ))}
            </div>
            <div style={{ flex:'0 0 auto', fontSize:11.5, color:C.textLight, whiteSpace:'nowrap' }}>
              {star ? '🏆' : '🔥'} <b style={{ color:C.text }}>{h.best}</b> best{h.current > 1 ? <span style={{ color:C.textMuted }}> · {h.current} now</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const PatFocusChart = ({ card }) => {
  const d = card.data;
  return <PatBars label={`Focus minutes per week for 8 weeks. ${card.sentence}`} height={84} items={d.weeks.map((w, i) => ({
    key: w.to, label: pat_slashDate(w.from),
    value: w.minutes, top: w.minutes ? (w.minutes < 60 ? `${Math.round(w.minutes)}m` : `${Math.round(w.minutes / 6) / 10}h`) : '', color: C.lavender, best: i === d.bestWeek,
    title: `Week of ${pat_shortDate(w.from)}: ${pat_core.minutesLabel(w.minutes)} in ${pat_core.plural(w.count, 'session')}`,
  }))}/>;
};

const PatOnTimeChart = ({ card }) => {
  const d = card.data, max = Math.max(...d.buckets.map(b => b.n), 1);
  return (
    <div>
      <div role="img" aria-label={`${d.onTime} on time, ${d.late} late`} style={{ display:'flex', height:26, borderRadius:13, overflow:'hidden', background:`${C.border}60` }}>
        <div style={{ width:`${d.share}%`, background:`linear-gradient(90deg, ${C.rose}, ${C.accent})`, transition:'width .4s ease' }}/>
        <div style={{ flex:1, background:`${C.lavender}70` }}/>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', gap:8, flexWrap:'wrap', fontSize:11.5, color:C.textLight, marginTop:6 }}>
        <span><b style={{ color:C.rose }}>{d.onTime}</b> by the date</span><span><b style={{ color:C.text }}>{d.late}</b> after it</span>
      </div>
      {d.late > 0 && (
        <div style={{ marginTop:14, display:'grid', gap:7 }}>
          <div style={{ fontSize:10.5, color:C.textMuted, textTransform:'uppercase', letterSpacing:.7, fontWeight:600 }}>How late the late ones run</div>
          {d.buckets.map(b => (
            <div key={b.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11.5, color:C.textLight }}>
              <span style={{ flex:'0 0 84px' }}>{b.label}</span>
              <span style={{ flex:1, minWidth:0, height:9, borderRadius:5, background:`${C.border}50`, overflow:'hidden' }}>
                <span style={{ display:'block', height:'100%', width:`${(b.n / max) * 100}%`, borderRadius:5, background:C.lavender }}/>
              </span>
              <span style={{ flex:'0 0 22px', textAlign:'right', color:C.text }}>{b.n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PatTop3Chart = ({ card }) => {
  const d = card.data;
  return (
    <div>
      <div role="img" aria-label={`Top 3 over the last ${d.recent.length} days`} style={{ display:'flex', gap:3, minWidth:0 }}>
        {d.recent.map(r => (
          <div key={r.day} title={`${pat_shortDate(r.day)}: ${r.set ? `${r.done} of ${r.set} done` : 'no Top 3 set'}`} style={{ flex:'1 1 0', minWidth:0, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{ width:'100%', maxWidth:16, aspectRatio:'1 / 1', borderRadius:'50%', boxSizing:'border-box',
                background: i < r.done ? `linear-gradient(135deg, ${C.rose}, ${C.accent})` : 'transparent',
                border: i < r.done ? 'none' : `1.2px ${i < r.set ? 'solid' : 'dashed'} ${i < r.set ? C.accent : C.border}`, opacity: i < r.set ? 1 : .55 }}/>
            ))}
            <span style={{ fontSize:9, color:C.textMuted }}>{pat_core.WEEKDAYS[pat_core.keyDate(r.day).getDay()].slice(0, 1)}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize:10.5, color:C.textMuted, marginTop:6 }}>The last {pat_core.plural(d.recent.length, 'day')}. A filled dot is one you did.</div>
    </div>
  );
};

const PatPair = ({ a, b }) => {
  const max = Math.max(a.value, b.value, 0.1);
  return (
    <div style={{ display:'grid', gap:10 }}>
      {[a, b].map(x => (
        <div key={x.label} style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
          <span style={{ fontSize:18 }} aria-hidden="true">{x.emoji}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:8, fontSize:11.5, color:C.textLight, marginBottom:4 }}><span>{x.label}</span><b style={{ color:C.text }}>{x.value}</b></div>
            <div style={{ height:10, borderRadius:5, background:`${C.border}50`, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(x.value / max) * 100}%`, borderRadius:5, background:x.color, transition:'width .4s ease' }}/>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const PatMomentumChart = ({ card }) => {
  const d = card.data, share = d.days ? Math.round((d.activeDays / d.days) * 100) : 0;
  return (
    <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
      {[[`${d.longest}`, 'longest run, in days'], [`${d.current}`, 'in a row right now'], [`${share}%`, 'of days with something done']].map(([big, small]) => (
        <div key={small} style={{ flex:'1 1 96px', minWidth:0, padding:'10px 12px', borderRadius:14, background:C.pinkLight, border:`0.5px solid ${C.border}` }}>
          <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:C.rose, lineHeight:1.1 }}>{big}</div>
          <div style={{ fontSize:10.5, color:C.textLight, marginTop:3, lineHeight:1.35 }}>{small}</div>
        </div>
      ))}
    </div>
  );
};

const PatChart = ({ card, colors, isMobile }) => {
  switch (card.id) {
    case 'weekday':  return <PatWeekdayChart card={card}/>;
    case 'hours':    return <PatHoursChart card={card}/>;
    case 'cycle':    return <PatPhaseChart card={card} colors={colors}/>;
    case 'moon':     return <PatMoonChart card={card}/>;
    case 'mood':     return <PatMoodChart card={card} colors={colors}/>;
    case 'habits':   return <PatHabitsChart card={card} isMobile={isMobile}/>;
    case 'focus':    return <PatFocusChart card={card}/>;
    case 'onTime':   return <PatOnTimeChart card={card}/>;
    case 'top3':     return <PatTop3Chart card={card}/>;
    case 'moodDone': return <PatPair a={{ emoji:'🌤️', label:'Finished on a brighter day', value:card.data.brightAvg, color:C.rose }} b={{ emoji:'🌧️', label:'Finished on a heavier day', value:card.data.heavyAvg, color:C.lavender }}/>;
    case 'momentum': return <PatMomentumChart card={card}/>;
    default:         return null;
  }
};
// One card's chart failing must not take the rest of the page with it.
const PatSafeCard = ({ card, colors, isMobile }) => (
  <PatBoundary name={`Patterns card ${card.id}`}>
    <PatCard card={card} wide={card.id === 'habits' && !isMobile}>
      <PatChart card={card} colors={colors} isMobile={isMobile}/>
    </PatCard>
  </PatBoundary>
);

// ── The short version ──────────────────────────────────────────────────
const PatHero = ({ rep, isMobile }) => {
  const chips = rep.cards.filter(c => c.show && c.chip).sort((a, b) => Number(a.early) - Number(b.early)).slice(0, isMobile ? 3 : 4);
  if (!chips.length) return null;
  return (
    <Card className="fade-in" style={{ background:C.gradA, border:'none', marginBottom:16, position:'relative', overflow:'hidden' }}>
      <span aria-hidden="true" style={{ position:'absolute', right:18, top:14, color:C.rose, fontSize:16, animation:'acTwinkle 3.2s ease-in-out infinite' }}>✦</span>
      <span aria-hidden="true" style={{ position:'absolute', right:44, top:34, color:C.accent, fontSize:10, animation:'acTwinkle 4.1s ease-in-out infinite .8s' }}>✦</span>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:17, color:C.rose, marginBottom:12 }}>The short version</div>
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${isMobile ? 1 : chips.length}, minmax(0, 1fr))`, gap:10 }}>
        {chips.map(c => (
          <div key={c.id} style={{ minWidth:0, padding:'12px 14px', borderRadius:16, background:`${C.card}b8`, border:`0.5px solid ${C.border}`, backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)',
            display:'flex', alignItems: isMobile ? 'center' : 'flex-start', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? 12 : 4 }}>
            <span style={{ fontSize:18 }} aria-hidden="true">{c.emoji}</span>
            <div style={{ minWidth:0 }}>
              <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:C.text, lineHeight:1.2, overflowWrap:'anywhere' }}>{c.chip.big}</div>
              <div style={{ fontSize:11.5, color:C.textLight, marginTop:2 }}>{c.chip.small}{c.early ? ', so far' : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

// ── Still gathering ────────────────────────────────────────────────────
const PatGathering = ({ cards, title, note }) => {
  if (!cards.length) return null;
  return (
    <Card style={{ marginTop:16 }}>
      <SectionHeading style={{ marginBottom:4 }}>{title}</SectionHeading>
      <div style={{ fontSize:12, color:C.textLight, lineHeight:1.6, marginBottom:14 }}>{note}</div>
      <div style={{ display:'grid', gap:12 }}>
        {cards.map(c => (
          <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', minWidth:0 }}>
            <div style={{ flex:'1 1 220px', minWidth:0 }}>
              <div style={{ fontSize:13, color:C.text, fontWeight:500 }}>{c.emoji} {c.title}</div>
              <div style={{ height:6, borderRadius:3, background:`${C.border}60`, overflow:'hidden', margin:'6px 0 5px' }}>
                <div style={{ height:'100%', width:`${Math.max(4, Math.round(c.progress * 100))}%`, borderRadius:3, background:`linear-gradient(90deg, ${C.accent}, ${C.rose})` }}/>
              </div>
              <div style={{ fontSize:11.5, color:C.textLight, lineHeight:1.5 }}>Needs {c.missing.join(', and ')}.</div>
            </div>
            {c.go && (
              <button type="button" onClick={() => pat_go(c.go[0], c.go[1])} style={{ flex:'0 0 auto', minHeight:40, padding:'0 14px', borderRadius:20, cursor:'pointer', fontSize:12, fontFamily:'inherit',
                color:C.rose, background:`${C.pink}60`, border:`0.5px solid ${C.border}` }}>{c.goLabel} →</button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

// ── What should I do with this? ────────────────────────────────────────
const PatAdvice = ({ rep }) => {
  const [saved, setSaved] = React.useState(() => {
    const v = pat_read('nylaos_patterns_ai', null);
    return v && typeof v === 'object' && Array.isArray(v.items) && v.items.length ? v : null;
  });
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const ask = async () => {
    if (busy) return;
    setNote('');
    if (typeof callClaude !== 'function') { setNote(pat_aiProblem('')); return; }
    setBusy(true);
    try {
      const { facts, names } = pat_core.summary(rep);
      const text = await callClaude({
        system: PAT_AI_SYSTEM,
        messages: [{ role: 'user', content: 'These are my numbers. What could I do with them?\n\n' + JSON.stringify(facts) }],
        maxTokens: 1500, effort: 'low',
      });
      if (!alive.current) return;
      const items = pat_core.parseAdvice(text, names);
      if (!items.length) { setNote(pat_aiProblem('')); return; }
      const next = { at: new Date().toISOString(), range: rep.range.id, items };
      setSaved(next); pat_write('nylaos_patterns_ai', next);
    } catch (e) {
      console.warn('Patterns ideas failed', e);
      if (alive.current) setNote(pat_aiProblem(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const items = saved ? saved.items.filter(i => i && typeof i.text === 'string').slice(0, 3) : [];
  const when = saved && pat_core.dayOf(saved.at);
  const rangeLabel = saved && (pat_core.RANGES.find(r => r.id === saved.range) || {}).label;
  return (
    <Card style={{ marginTop:16, background:C.gradA, border:'none' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div style={{ flex:'1 1 240px', minWidth:0 }}>
          <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:19, color:C.rose }}>What should I do with this? ✦</div>
          <div style={{ fontSize:12, color:C.textLight, lineHeight:1.6, marginTop:4 }}>Three gentle ideas, drawn from the numbers on this page. Only the numbers are sent. No task names, no notes, no habit names.</div>
        </div>
        <button type="button" onClick={ask} disabled={busy} style={{ flex:'0 0 auto', minHeight:44, padding:'0 20px', borderRadius:22, border:'none', cursor: busy ? 'default' : 'pointer', fontFamily:'inherit', fontSize:13.5, fontWeight:500,
          color:'#fff', background:`linear-gradient(135deg, ${C.rose}, ${C.accent})`, boxShadow:`0 6px 16px ${C.rose}35`, opacity: busy ? .7 : 1 }}>
          {busy ? 'Thinking it through…' : items.length ? 'Ask again ✦' : 'Show me ✦'}
        </button>
      </div>
      {note && <div role="status" style={{ marginTop:12, padding:'10px 14px', borderRadius:12, fontSize:12.5, color:C.text, background:`${C.card}c0`, border:`0.5px solid ${C.border}` }}>{note}</div>}
      {items.length > 0 && (
        <div style={{ marginTop:16, display:'grid', gap:10, gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 230px), 1fr))' }}>
          {items.map((it, i) => (
            <div key={i} className="fade-in" style={{ minWidth:0, padding:'14px 16px', borderRadius:16, background:`${C.card}d0`, border:`0.5px solid ${C.border}` }}>
              <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:6 }}>
                <span style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:C.accent }}>{i + 1}</span>
                {it.title ? <span style={{ fontFamily:"'DM Serif Display',serif", fontSize:15.5, color:C.rose, overflowWrap:'anywhere' }}>{it.title}</span> : null}
              </div>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.65, overflowWrap:'anywhere' }}>{it.text}</div>
            </div>
          ))}
        </div>
      )}
      {items.length > 0 && when && (
        <div style={{ fontSize:11, color:C.textMuted, marginTop:10 }}>Written {pat_shortDate(when)}{rangeLabel ? `, looking at ${rangeLabel.toLowerCase()}` : ''}. Ideas to try on, never rules.</div>
      )}
    </Card>
  );
};

// ── Still getting to know you ──────────────────────────────────────────
const PatEmpty = ({ rep, onEverything }) => {
  const t = rep.totals, N = pat_core.NEED;
  const ask = (emoji, name, have, need, unit, nav, sub) => [emoji, name, `${Math.min(have, need)} of ${need} ${unit}`, nav, sub, need ? have / need : 0];
  const asks = [
    ask('✅', 'Finish tasks', t.finished, N.tasks.count, 'in this window', 'tasks', 'Today'),
    ask('🌱', 'Tick your habits', t.habitTicks, N.habits.count, 'ticks', 'lists', 'Habits'),
    ask('🌙', 'Close your day', t.moods, N.mood.count, 'days with a mood', 'reflect', 'Close the Day'),
    ask('🎧', 'Run a focus session', t.sessions, N.focus.count, 'sessions', 'home', 'Focus Mode'),
    ask('✨', 'Set a Top 3', t.top3Days, N.top3.days, 'days', 'calendar', 'Daily'),
    ask('🌸', 'Log your period', t.cycles, N.cycle.cycles, 'full cycles', 'period', 'Cycle Overview'),
  ];
  return (
    <div className="fade-in">
      <EmptyState icon="🔮" title="Still getting to know you"
        text="There is not enough here to say anything true about you yet, and I would rather wait than guess. Keep living your days in here and this page will fill itself in."
        action={rep.range.id !== 'all' ? <Pill onClick={onEverything} style={{ minHeight:40 }}>Look at everything instead</Pill> : null}/>
      <Card style={{ marginTop:16 }}>
        <SectionHeading style={{ marginBottom:4 }}>What helps me see you</SectionHeading>
        <div style={{ fontSize:12, color:C.textLight, lineHeight:1.6, marginBottom:14 }}>Any one of these is enough to begin. None of them is homework.</div>
        <div style={{ display:'grid', gap:10, gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 250px), 1fr))' }}>
          {asks.map(([emoji, name, have, nav, sub, p]) => (
            <button key={name} type="button" onClick={() => pat_go(nav, sub)} style={{ minWidth:0, minHeight:64, textAlign:'left', cursor:'pointer', fontFamily:'inherit', padding:'12px 14px', borderRadius:16,
              background:C.pinkLight, border:`0.5px solid ${C.border}`, color:C.text, display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:20 }} aria-hidden="true">{emoji}</span>
              <span style={{ flex:1, minWidth:0 }}>
                <span style={{ display:'block', fontSize:13.5, fontWeight:500 }}>{name}</span>
                <span style={{ display:'block', height:5, borderRadius:3, background:`${C.border}70`, overflow:'hidden', margin:'6px 0 4px' }}>
                  <span style={{ display:'block', height:'100%', width:`${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`, borderRadius:3, background:`linear-gradient(90deg, ${C.accent}, ${C.rose})` }}/>
                </span>
                <span style={{ display:'block', fontSize:11, color:C.textLight }}>{have}</span>
              </span>
              <span style={{ color:C.textMuted }} aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
};

// ── The page ───────────────────────────────────────────────────────────
const PatPageBody = () => {
  const isMobile = useIsMobile();
  const [rangeId, setRangeId] = React.useState(() => {
    const v = pat_readText('nyla_patterns_range');
    return pat_core.RANGES.some(r => r.id === v) ? v : '90';
  });
  const [tick, setTick] = React.useState(0);
  const greeting = React.useMemo(() => PAT_GREETINGS[Math.floor(Math.random() * PAT_GREETINGS.length)], []);

  // Fresh numbers when something changes elsewhere, and when she comes back to the app.
  React.useEffect(() => {
    const bump = () => setTick(n => n + 1);
    const vis = () => { if (document.visibilityState === 'visible') bump(); };
    window.addEventListener('nyla-tasks-changed', bump);
    window.addEventListener('storage', bump);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('nyla-tasks-changed', bump);
      window.removeEventListener('storage', bump);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  const today = toDateKey();
  const rep = React.useMemo(() => {
    try { return pat_build(rangeId, today); }
    catch (e) { console.warn('Patterns could not read the data', e); return null; }
  }, [rangeId, today, tick]);

  const pick = id => { setRangeId(id); pat_write('nyla_patterns_range', id); };
  const picker = (
    <div role="group" aria-label="How far back to look" style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
      {pat_core.RANGES.map(r => <Pill key={r.id} active={rangeId === r.id} onClick={() => pick(r.id)} style={{ minHeight:40 }}>{r.label}</Pill>)}
    </div>
  );

  if (!rep) {
    return (
      <div className="fade-in" style={{ maxWidth:980 }}>
        <PageTitle subtitle={greeting} right={picker}>Patterns</PageTitle>
        <PatFailed/>
      </div>
    );
  }

  const shown = rep.cards.filter(c => c.show);
  const earlyCount = shown.filter(c => c.early).length;
  return (
    <div className="fade-in" style={{ maxWidth:980, minWidth:0 }}>
      <PageTitle subtitle={greeting} right={picker}>Patterns</PageTitle>
      {shown.length === 0 ? <PatEmpty rep={rep} onEverything={() => pick('all')}/> : (
        <>
          <div style={{ fontSize:12, color:C.textLight, margin:'-8px 0 14px', lineHeight:1.6 }}>
            Looking at {pat_shortDate(rep.range.from)} to {pat_shortDate(rep.range.to)}, {pat_core.plural(rep.range.days, 'day')} in all.
            {earlyCount ? ` ${earlyCount === shown.length ? 'These are all early reads' : `${pat_core.plural(earlyCount, 'card is an early read', 'cards are early reads')}`}, and they will sharpen as you go.` : ''}
          </div>
          <PatHero rep={rep} isMobile={isMobile}/>
          <div style={{ display:'grid', gap:16, gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', alignItems:'stretch' }}>
            {shown.map(c => <PatSafeCard key={c.id} card={c} colors={rep.phaseColors} isMobile={isMobile}/>)}
          </div>
          <PatGathering cards={rep.gathering} title="Still gathering 🫧" note="These stay quiet until there is enough behind them to say something true."/>
          <PatAdvice rep={rep}/>
        </>
      )}
      <div style={{ textAlign:'center', fontSize:11, color:C.textMuted, margin:'18px 0 6px', lineHeight:1.6 }}>
        🔒 Worked out on this device, from your own logs. These are observations, never advice about your body.
      </div>
    </div>
  );
};

const PatFailed = () => (
  <EmptyState icon="🌷" title="Patterns could not open just now"
    text="Nothing of yours was changed or lost. Close this page and open it again, and it should come back."/>
);

const PatternsPage = () => <PatBoundary name="Patterns" fallback={<PatFailed/>}><PatPageBody/></PatBoundary>;
