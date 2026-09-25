/* ── Daily page (Calendar → Daily) ─────────────────────────────────────
   A planner page for one day instead of a single column of hours: the
   schedule down the side, and beside it everything else the day needs —
   top three, to-dos (with anything overdue carried over when it's today),
   habits due that day, the intention, notes and gratitude.

   Storage (all nylaos_, so they sync)
     nylaos_top3_YYYY-MM-DD       [{ text, done }] × 3
     nylaos_daynote_YYYY-MM-DD    free notes for the day
     nylaos_intention_<toDateString>, nylaos_gratitude_<toDateString>
                                  the same keys Home uses, so both show the same words
     nylaos_habit_log             `${habitId}_${YYYY-MM-DD}`, as Habits keeps it
   Tasks and events come from the calendar's own data (useCalendarData),
   so ticking something here ticks it on the schedule too.

   Loads before the main app script: top level must not touch app globals.
   Every top-level name here is prefixed daily_ / Daily. */

const daily_read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } };
const daily_readText = key => { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } };
const daily_write = (key, value) => {
  try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); return true; }
  catch (e) { toast('Could not save that. Storage may be full.', 'error', 4000); return false; }
};
const daily_tasksChanged = () => { try { window.dispatchEvent(new CustomEvent('nyla-tasks-changed')); } catch (e) {} };

// A text box that saves as she types (after a short pause) and when she leaves it.
const DailyField = ({ storageKey, placeholder, rows = 3, big }) => {
  const [v, setV] = React.useState(() => daily_readText(storageKey));
  const timer = React.useRef(null);
  React.useEffect(() => { setV(daily_readText(storageKey)); }, [storageKey]);
  const save = val => { clearTimeout(timer.current); daily_write(storageKey, val); };
  return (
    <textarea value={v} rows={rows} placeholder={placeholder}
      onChange={e => { const val = e.target.value; setV(val); clearTimeout(timer.current); timer.current = setTimeout(() => save(val), 600); }}
      onBlur={e => save(e.target.value)}
      style={{ width:'100%', boxSizing:'border-box', resize:'vertical', border:`0.5px solid ${C.border}`, borderRadius:12, padding:'10px 12px',
        background:C.pinkLight, color:C.text, fontFamily: big ? "'DM Serif Display',serif" : 'inherit', fontSize: big ? 16 : 13.5, lineHeight:1.6, outline:'none' }}/>
  );
};

const DailyTop3 = ({ dateKey }) => {
  const key = 'nylaos_top3_' + dateKey;
  const blank = () => [0, 1, 2].map(() => ({ text:'', done:false }));
  const [items, setItems] = React.useState(() => daily_read(key, blank()));
  React.useEffect(() => { setItems(daily_read(key, blank())); }, [key]);
  const save = next => { setItems(next); daily_write(key, next); };
  return (
    <Card>
      <SectionHeading>✨ Top 3</SectionHeading>
      {items.map((it, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom: i < 2 ? `0.5px solid ${C.border}` : 'none' }}>
          <span style={{ fontFamily:"'DM Serif Display',serif", fontSize:18, color:C.accent, width:16, textAlign:'center' }}>{i + 1}</span>
          <input value={it.text} placeholder={['The one thing that matters most', 'Then this', 'And this'][i]}
            onChange={e => save(items.map((x, j) => j === i ? { ...x, text:e.target.value } : x))}
            style={{ flex:1, minWidth:0, border:'none', background:'transparent', color:C.text, fontSize:14, fontFamily:'inherit', outline:'none',
              textDecoration: it.done ? 'line-through' : 'none', opacity: it.done ? .55 : 1 }}/>
          {it.text.trim() && <Checkbox size={18} checked={it.done} onChange={() => save(items.map((x, j) => j === i ? { ...x, done:!x.done } : x))}/>}
        </div>
      ))}
    </Card>
  );
};

const DailyTodos = ({ dateKey, data }) => {
  const [text, setText] = React.useState('');
  const todayKey = toDateKey();
  const isToday = dateKey === todayKey;
  const mine = data.tasks.filter(t => t.calendarDate === dateKey && !(t.source === 'calendar' && t.time));
  const open = mine.filter(t => !t.done), done = mine.filter(t => t.done);
  const overdue = isToday ? data.tasks.filter(t => !t.done && t.calendarDate && t.calendarDate < todayKey).sort((a, b) => a.calendarDate < b.calendarDate ? 1 : -1) : [];
  const toggle = t => {
    const { list, nowDone } = toggleTaskIn(data.tasks, t.id);
    data.saveTasks(list); daily_tasksChanged();
    if (nowDone) toast('Done ✓', 'success', 1100);
  };
  const add = () => {
    if (!text.trim()) return;
    data.saveTasks([...data.tasks, { id:Date.now(), text:text.trim(), done:false, calendarDate:dateKey, created:new Date().toISOString() }]);
    daily_tasksChanged(); setText('');
  };
  const moveHere = t => { data.saveTasks(data.tasks.map(x => x.id === t.id ? { ...x, calendarDate:dateKey } : x)); daily_tasksChanged(); };
  const row = (t, extra) => (
    <div key={t.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 2px', borderBottom:`0.5px solid ${C.border}` }}>
      <Checkbox size={18} checked={!!t.done} onChange={() => toggle(t)}/>
      <span style={{ flex:1, minWidth:0, fontSize:13.5, color:C.text, textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? .5 : 1 }}>{t.text}</span>
      {t.repeat && <span title="Repeats" style={{ fontSize:11, color:C.textMuted }}>↻</span>}
      {t.venture && <span style={{ fontSize:10.5, padding:'2px 8px', borderRadius:20, background:`${C.lavender}70`, color:C.textLight }}>{t.venture}</span>}
      {extra}
    </div>
  );
  const total = mine.length, pct = total ? Math.round(done.length / total * 100) : 0;
  return (
    <Card>
      <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
        <SectionHeading style={{ marginBottom:10 }}>☑️ To do</SectionHeading>
        <span style={{ marginLeft:'auto', fontSize:11.5, color:C.textMuted }}>{total ? `${done.length} of ${total} done` : ''}</span>
      </div>
      {total > 0 && <div style={{ height:5, borderRadius:5, background:`${C.pink}60`, marginBottom:10, overflow:'hidden' }}><div style={{ width:`${pct}%`, height:'100%', background:`linear-gradient(90deg, ${C.rose}, ${C.accent})`, transition:'width .3s' }}/></div>}
      {open.map(t => row(t))}
      <div style={{ display:'flex', gap:8, alignItems:'center', padding:'10px 2px 4px' }}>
        <span style={{ width:18, height:18, borderRadius:'50%', border:`1.5px dashed ${C.border}`, flexShrink:0 }}/>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder={isToday ? 'Add a to-do for today…' : 'Add a to-do for this day…'}
          style={{ flex:1, minWidth:0, border:'none', background:'transparent', color:C.text, fontSize:13.5, fontFamily:'inherit', outline:'none' }}/>
        {text.trim() && <button onClick={add} style={{ padding:'4px 12px', borderRadius:10, background:C.rose, color:'#fff', border:'none', fontSize:12, cursor:'pointer' }}>Add</button>}
      </div>
      {!total && !overdue.length && <div style={{ fontSize:12.5, color:C.textMuted, fontStyle:'italic', padding:'2px 2px 0' }}>Nothing on the list yet.</div>}
      {done.length > 0 && <div style={{ marginTop:8 }}>{done.map(t => row(t))}</div>}
      {overdue.length > 0 && (
        <div style={{ marginTop:16, padding:'10px 12px', borderRadius:14, background:'#e5737310', border:'0.5px solid #e5737330' }}>
          <div style={{ fontSize:11, color:'#d05a5a', textTransform:'uppercase', letterSpacing:.8, marginBottom:4 }}>Carried over · {overdue.length}</div>
          {overdue.slice(0, 6).map(t => row(t, (
            <span style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
              <span style={{ fontSize:10.5, color:'#d05a5a' }}>{prettyDue(t.calendarDate)?.label}</span>
              <button onClick={() => moveHere(t)} title="Move to today" style={{ fontSize:11, padding:'2px 8px', borderRadius:10, border:`0.5px solid ${C.border}`, background:C.card, color:C.rose, cursor:'pointer' }}>→ Today</button>
            </span>
          )))}
          {overdue.length > 6 && <div style={{ fontSize:11.5, color:C.textMuted, paddingTop:6 }}>+ {overdue.length - 6} more in Tasks</div>}
        </div>
      )}
    </Card>
  );
};

const DailyHabits = ({ dateKey }) => {
  const d = keyToDate(dateKey);
  const habits = daily_read('nylaos_habits', null) || DEFAULT_HABITS.map((h, i) => ({ id:i + 1, name:h }));
  const [log, setLog] = React.useState(() => daily_read('nylaos_habit_log', {}));
  const due = habits.filter(h => habitDue(h, d));
  const toggle = h => {
    const k = `${h.id}_${dateKey}`; const next = { ...daily_read('nylaos_habit_log', {}), [k]: !log[k] };
    if (!next[k]) delete next[k];
    setLog(next); daily_write('nylaos_habit_log', next);
  };
  const hit = due.filter(h => log[`${h.id}_${dateKey}`]).length;
  return (
    <Card>
      <div style={{ display:'flex', alignItems:'baseline' }}>
        <SectionHeading style={{ marginBottom:10 }}>🌿 Habits</SectionHeading>
        <span style={{ marginLeft:'auto', fontSize:11.5, color:C.textMuted }}>{due.length ? `${hit}/${due.length}` : ''}</span>
      </div>
      {!due.length && <div style={{ fontSize:12.5, color:C.textMuted, fontStyle:'italic' }}>No habits due this day.</div>}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        {due.map(h => { const on = !!log[`${h.id}_${dateKey}`]; const col = h.color || C.rose; return (
          <button key={h.id} onClick={() => toggle(h)} style={{ padding:'7px 13px', borderRadius:20, cursor:'pointer', fontSize:12.5, fontFamily:'inherit',
            border:`0.5px solid ${on ? col : C.border}`, background: on ? `${col}22` : 'transparent', color:C.text, display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:14, height:14, borderRadius:'50%', border:`1.5px solid ${col}`, background: on ? col : 'transparent', display:'grid', placeItems:'center', color:'#fff', fontSize:9 }}>{on ? '✓' : ''}</span>
            {h.name}
          </button>
        ); })}
      </div>
    </Card>
  );
};

// The day as a column of hours. Events and timed items sit on it; the
// untimed ones sit above it.
const DailySchedule = ({ dateKey, data, onOpen, onAdd, tall }) => {
  const HOUR_H = 44, START = 6, END = 24;
  const items = data.byDay[dateKey] || [];
  const untimed = items.filter(it => !it.time && it.kind === 'event'); // untimed to-dos live in the To do card
  const timed = items.filter(it => it.time && timeToMin(it.time) >= START * 60);
  const early = items.filter(it => it.time && timeToMin(it.time) < START * 60);
  const isToday = dateKey === toDateKey();
  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
  const lanes = (() => { const out = []; const ends = []; timed.forEach(it => { const s = timeToMin(it.time); const e = Math.max(s + 30, timeToMin(it.endTime) ?? s + 60); let lane = ends.findIndex(x => x <= s); if (lane < 0) { lane = ends.length; ends.push(e); } else ends[lane] = e; out.push({ it, s, e, lane }); }); return { out, n:Math.max(1, ends.length) }; })();
  const scroller = React.useRef(null);
  React.useEffect(() => {
    const el = scroller.current; if (!el) return;
    const first = timed.length ? Math.min(...timed.map(it => timeToMin(it.time))) : 8 * 60;
    const target = isToday ? Math.min(nowMin, first) : first;
    el.scrollTop = Math.max(0, (target - START * 60) / 60 * HOUR_H - HOUR_H);
  }, [dateKey]);
  return (
    <Card style={{ padding:0, overflow:'hidden', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'16px 16px 10px', borderBottom:`0.5px solid ${C.border}` }}>
        <SectionHeading style={{ marginBottom: (untimed.length || early.length) ? 10 : 0 }}>🗓 Schedule</SectionHeading>
        {[...untimed, ...early].map(it => <CalItemChip key={it.kind + it.id} item={it} onOpen={onOpen} onToggle={data.toggle}/>)}
      </div>
      <div ref={scroller} style={{ position:'relative', overflowY:'auto', maxHeight: tall ? '72vh' : 520 }}>
        <div style={{ position:'relative', display:'grid', gridTemplateColumns:'50px minmax(0,1fr)' }}>
          <div>{Array.from({ length:END - START }, (_, h) => <div key={h} style={{ height:HOUR_H, fontSize:10, color:C.textMuted, textAlign:'right', paddingRight:8, transform:'translateY(-6px)' }}>{h === 0 ? '' : fmtTime(`${START + h}:00`)}</div>)}</div>
          <div style={{ position:'relative', borderLeft:`0.5px solid ${C.border}`, height:(END - START) * HOUR_H }}>
            {Array.from({ length:END - START }, (_, h) => <div key={h} onClick={() => onAdd({ date:dateKey, time:`${String(START + h).padStart(2, '0')}:00` })} title="Add something at this hour" style={{ height:HOUR_H, borderTop:`0.5px solid ${C.border}70`, cursor:'copy' }}/>)}
            {isToday && nowMin >= START * 60 && <div style={{ position:'absolute', left:0, right:0, top:(nowMin - START * 60) / 60 * HOUR_H, height:2, background:C.rose, zIndex:2, pointerEvents:'none' }}><span style={{ position:'absolute', left:-4, top:-3, width:8, height:8, borderRadius:'50%', background:C.rose }}/></div>}
            {lanes.out.map(({ it, s, e, lane }) => (
              <div key={it.kind + it.id} onClick={() => onOpen(it)} title={it.text}
                style={{ position:'absolute', top:(s - START * 60) / 60 * HOUR_H + 1, height:Math.max(22, (e - s) / 60 * HOUR_H - 2), left:`calc(${lane / lanes.n * 100}% + 4px)`, width:`calc(${100 / lanes.n}% - 8px)`,
                  borderRadius:10, padding:'4px 8px', background:`${it.color}26`, borderLeft:`3px solid ${it.color}`, color:C.text, fontSize:11.5, overflow:'hidden', cursor:'pointer', zIndex:1 }}>
                <div style={{ fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', textDecoration: it.done ? 'line-through' : 'none' }}>{it.text}</div>
                <div style={{ color:C.textMuted, fontSize:10.5 }}>{fmtTime(it.time)}{it.endTime ? ` – ${fmtTime(it.endTime)}` : ''}{it.location ? ` · ${it.location}` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding:'8px 16px', fontSize:11, color:C.textMuted, borderTop:`0.5px solid ${C.border}` }}>Tap an empty hour to add something there.</div>
    </Card>
  );
};

const DailyPlanner = ({ dateKey, data, onOpen, onAdd }) => {
  const isMobile = useIsMobile();
  const wide = useMinWidth(1100);  // schedule beside the rest (the window includes the sidebar)
  const pairs = useMinWidth(1380); // two cards side by side in the right column
  const d = keyToDate(dateKey);
  const dayStr = d.toDateString();
  const moon = getMoonForDate(d);
  const cycle = getCycleForDate(d);
  const items = data.byDay[dateKey] || [];
  const events = items.filter(it => it.kind !== 'task').length;
  const todos = data.tasks.filter(t => t.calendarDate === dateKey && !(t.source === 'calendar' && t.time));
  const chip = (children, bg) => <span style={{ fontSize:12, padding:'4px 11px', borderRadius:20, background:bg || `${C.lavender}70`, color:C.text, whiteSpace:'nowrap' }}>{children}</span>;
  const schedule = <DailySchedule dateKey={dateKey} data={data} onOpen={onOpen} onAdd={onAdd} tall={wide}/>;
  const intention = (
    <Card>
      <SectionHeading>🌙 Intention</SectionHeading>
      <DailyField storageKey={'nylaos_intention_' + dayStr} placeholder="What are you calling in today?" rows={2} big/>
    </Card>
  );
  const notes = (
    <Card>
      <SectionHeading>📝 Notes</SectionHeading>
      <DailyField storageKey={'nylaos_daynote_' + dateKey} placeholder="Anything for today: ideas, reminders, how it went…" rows={5}/>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:14, color:C.rose, margin:'16px 0 8px' }}>🙏 Gratitude</div>
      <DailyField storageKey={'nylaos_gratitude_' + dayStr} placeholder="Three things I’m grateful for…" rows={3}/>
    </Card>
  );
  return (
    <div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        {chip(`${moon.emoji} ${moon.label}`)}
        {cycle && chip(<><span style={{ color:cycle.color }}>●</span> {cycle.name} · day {cycle.day}</>, `${cycle.color}22`)}
        {chip(`🗓 ${events} on the schedule`, `${C.pink}60`)}
        {chip(`☑️ ${todos.filter(t => t.done).length}/${todos.length} to-dos`, `${C.pink}60`)}
      </div>
      {wide ? (
        <div style={{ display:'grid', gridTemplateColumns:'minmax(300px, 360px) minmax(0,1fr)', gap:16, alignItems:'start' }}>
          <div style={{ position:'sticky', top:12 }}>{schedule}</div>
          <div style={{ display:'grid', gap:16 }}>
            <div style={{ display:'grid', gridTemplateColumns: pairs ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr', gap:16, alignItems:'start' }}>
              <DailyTop3 dateKey={dateKey}/>
              {intention}
            </div>
            <DailyTodos dateKey={dateKey} data={data}/>
            <div style={{ display:'grid', gridTemplateColumns: pairs ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr', gap:16, alignItems:'start' }}>
              <DailyHabits dateKey={dateKey}/>
              {notes}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display:'grid', gap: isMobile ? 12 : 16 }}>
          <DailyTop3 dateKey={dateKey}/>
          <DailyTodos dateKey={dateKey} data={data}/>
          {schedule}
          <DailyHabits dateKey={dateKey}/>
          {intention}
          {notes}
        </div>
      )}
    </div>
  );
};
