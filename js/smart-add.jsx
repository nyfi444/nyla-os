/* ── Smart add (top of the quick add menu) ─────────────────────────────
   One line, read as she types: "dinner with mom fri 7pm" becomes an event on
   Friday at 7, "submit essay tomorrow" a task due tomorrow, "buy milk" a
   shopping item. The reading is done by window.nylaSmartParse (js/smart-parse.js,
   loaded in <head>); this file is the box, the chips and the saving.

   SmartAddBox({ onDone })   rendered by QuickAdd above its list of choices.
                             onDone closes the menu. It is called after an event,
                             note or idea. Tasks and shopping items keep the box
                             open and clear it, so she can add several.
                             While the box holds text, the menu's list of choices
                             is hidden with one CSS rule (sa_CSS); nothing in
                             QuickAdd itself is touched.

   What it writes (the same records QuickAdd.submit writes, same keys and fields)
     nylaos_tasks          { id, text, done:false, calendarDate, created }
                           plus time, endTime and repeat when the line had them
                           (repeat is the task's own field: daily | weekdays | weekly | monthly)
     nylaos_events         { id, date, text, time, color:'rose' } plus endTime when given.
                           A repeating event is saved the way the Event editor saves one:
                           a run of dated copies that share a recurringGroupId.
     nylaos_shopping_list  { id, text, done:false, created }
     nylaos_ideas          { id, title, content:'', category:'personal', created }   (newest first)
     nylaos_nb_pages       { id, name, folderId:1, content, created, updated }, then
                           nylaos_nb_open_request and a jump to the Notebook

   After a save it fires 'nyla-tasks-changed' (Home and the brief listen), and,
   when the open page shows the list that changed, 'nyla:data-changed' so that
   page reloads it instead of saving an old copy back over the new item.

   Loads before the main app script: top level must not touch app globals.
   Every top-level name here is prefixed sa_ / Sa, except SmartAddBox itself. */

const sa_KINDS = [
  { key:'task',  icon:'✓',  label:'Task' },
  { key:'event', icon:'📅', label:'Event' },
  { key:'shop',  icon:'🛒', label:'Shop' },
  { key:'idea',  icon:'💡', label:'Idea' },
  { key:'note',  icon:'📝', label:'Note' },
];
// Which pages hold a copy of each list while they are open.
const sa_VIEWS = {
  nylaos_tasks: ['tasks', 'calendar', 'goals', 'home'],
  nylaos_events: ['calendar', 'home'],
  nylaos_shopping_list: ['lists'],
  nylaos_ideas: ['ideas'],
};
const sa_state = { lastId: 0 };
// While she is typing, the menu's list of choices (the buttons that follow the box)
// steps aside, so on a phone the box and its reading fit above the keyboard.
// Clearing the line brings the list back.
const sa_CSS = '.sa-box.sa-typing ~ button { display: none !important; }';

const sa_parse = (text, kind) => {
  try { return typeof window.nylaSmartParse === 'function' ? window.nylaSmartParse(text, new Date(), kind ? { kind } : undefined) : null; }
  catch (e) { console.warn('Smart add could not read that line', e); return null; }
};
// Without the parser (or if it ever throws) the line is still saved, as a plain task.
const sa_fallback = (text, kind) => {
  const t = String(text || '').trim();
  return t ? { kind: kind || 'task', text: t, date: null, time: null, endTime: null, repeat: null, until: null, understood: [] } : null;
};
// The stored list, [] when nothing is there yet, null when what is there cannot be read
// (so a damaged list is never replaced by a one-item list).
const sa_list = key => {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch (e) { return null; }
  if (raw == null || raw === '') return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : null; } catch (e) { return null; }
};
const sa_write = (key, value) => {
  try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); return true; }
  catch (e) { return false; }
};
const sa_newId = (count = 1) => {
  const id = Math.max(Date.now(), sa_state.lastId + 1);
  sa_state.lastId = id + Math.max(1, count) - 1;
  return id;
};
const sa_openView = () => { try { return JSON.parse(localStorage.getItem('nyla_last_view') || 'null') || {}; } catch (e) { return {}; } };

// Home > Focus Mode keeps its own copy of the tasks and sets the tab title to the
// countdown while a session runs; a reload then would reset that timer.
const sa_focusRunning = () => { try { return /^\d\d:\d\d · (?:Focus|Break)$/.test(document.title); } catch (e) { return false; } };

// Tells the open page its list changed. A reload would drop a half-typed entry
// on that page, so it waits (up to 2 minutes) while she is typing somewhere else.
// A function declaration, because it calls itself.
function sa_announce(key, tries = 0) {
  const view = sa_openView();
  const navs = sa_VIEWS[key] || [];
  if (!navs.includes(view.nav)) return;
  if (view.nav === 'home') {
    // Overview and Focus Mode hold a copy of the tasks; the other Home pages do not.
    if (view.sub !== 'Overview' && view.sub !== 'Focus Mode') return;
    if (view.sub === 'Focus Mode' && sa_focusRunning()) return;
  }
  const a = document.activeElement;
  const typing = !!a && !(a.dataset && a.dataset.smartAdd) && (a.isContentEditable || ((a.tagName === 'TEXTAREA' ||
    (a.tagName === 'INPUT' && /^(?:text|search|email|url|tel|number|password)?$/i.test(a.getAttribute('type') || ''))) && !!String(a.value || '').trim()));
  if (typing) { if (tries < 60) setTimeout(() => sa_announce(key, tries + 1), 2000); return; }
  try { window.dispatchEvent(new CustomEvent('nyla:data-changed', { detail:{ keys:[key], source:'smart-add' } })); } catch (e) {}
}

// Saves what was read. Returns { ok, stay } or { ok:false } with a toast already shown.
const sa_save = (p, putOnToday) => {
  const fail = msg => { toast(msg, 'error', 4000); return { ok:false }; };
  const unreadable = 'Could not read your saved list, so nothing was changed.';
  const full = 'Could not save that. Storage may be full.';
  const text = String(p.text || '').trim();
  if (!text) return { ok:false };
  const nowIso = new Date().toISOString();

  if (p.kind === 'task') {
    const list = sa_list('nylaos_tasks'); if (!list) return fail(unreadable);
    const date = p.date || (putOnToday ? toDateKey() : null);
    const task = { id:sa_newId(), text, done:false, calendarDate:date, created:nowIso };
    if (p.time) task.time = p.time;
    if (p.time && p.endTime) task.endTime = p.endTime;
    if (p.repeat) task.repeat = p.repeat;
    if (!sa_write('nylaos_tasks', [...list, task])) return fail(full);
    const label = date ? (prettyDue(date)?.label || date) : '';
    const repeats = p.repeat ? `, repeats ${String(window.nylaSmartParse?.REPEAT_LABEL?.[p.repeat] || p.repeat).toLowerCase()}` : '';
    toast((date === toDateKey() ? 'Added to today ☀' : date ? `Task added for ${label}` : 'Task added') + repeats, 'success', p.repeat ? 2000 : 1400);
    try { window.dispatchEvent(new CustomEvent('nyla-tasks-changed')); } catch (e) {}
    sa_announce('nylaos_tasks');
    return { ok:true, stay:true };
  }

  if (p.kind === 'event') {
    const list = sa_list('nylaos_events'); if (!list) return fail(unreadable);
    const date = p.date || toDateKey();
    const base = { text, time:p.time || null, color:'rose' };
    if (p.time && p.endTime) base.endTime = p.endTime;
    const days = p.repeat && p.until && window.nylaSmartParse?.seriesDates ? window.nylaSmartParse.seriesDates(date, p.repeat, p.until) : [date];
    if (days.length > 1) {
      const groupId = sa_newId(days.length);
      const out = days.map((k, i) => ({ id:groupId + i, date:k, ...base, recurringGroupId:groupId }));
      if (!sa_write('nylaos_events', [...list, ...out])) return fail(full);
      toast(`${out.length} events added`, 'success', 1800);
    } else {
      if (!sa_write('nylaos_events', [...list, { id:sa_newId(), date, ...base }])) return fail(full);
      toast(`Added to ${prettyDue(date)?.label || date}`, 'success', 1400);
    }
    sa_announce('nylaos_events');
    return { ok:true, stay:false };
  }

  if (p.kind === 'shop') {
    const list = sa_list('nylaos_shopping_list'); if (!list) return fail(unreadable);
    if (!sa_write('nylaos_shopping_list', [...list, { id:sa_newId(), text, done:false, created:nowIso }])) return fail(full);
    toast('Added to shopping list', 'success', 1400);
    sa_announce('nylaos_shopping_list');
    return { ok:true, stay:true };
  }

  if (p.kind === 'idea') {
    const list = sa_list('nylaos_ideas'); if (!list) return fail(unreadable);
    if (!sa_write('nylaos_ideas', [{ id:sa_newId(), title:text, content:'', category:'personal', created:nowIso }, ...list])) return fail(full);
    toast('Idea saved 💡', 'success', 1400);
    sa_announce('nylaos_ideas');
    return { ok:true, stay:false };
  }

  if (p.kind === 'note') {
    const pages = sa_list('nylaos_nb_pages'); if (!pages) return fail(unreadable);
    const id = sa_newId();
    if (!sa_write('nylaos_nb_pages', [...pages, { id, name:text, folderId:1, content:'<p><br></p>', created:nowIso, updated:nowIso }])) return fail(full);
    sa_write('nylaos_nb_open_request', String(id));
    // The Notebook reads that request, and its page list, only when it opens. While it
    // is already open the new page shows on her next visit, so say so instead of "opening it".
    if (sa_openView().nav === 'notebook') { toast('Note saved. It opens when you leave the Notebook and come back.', 'success', 3000); return { ok:true, stay:false }; }
    toast('Note created, opening it', 'success', 1400);
    return { ok:true, stay:false, openNotebook:true };
  }
  return { ok:false };
};

const sa_buttonLabel = (p, count) =>
  p.kind === 'event' ? (count > 1 ? `Add ${count} events` : 'Add event')
  : p.kind === 'shop' ? 'Add to shopping list'
  : p.kind === 'idea' ? 'Save idea'
  : p.kind === 'note' ? 'Create note'
  : 'Add task';

/* Keeps a render error inside the box, so the rest of the quick add menu still
   works. (React is a library global loaded in <head>, so extending it at the
   top level here is safe.) */
class SaBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e) { console.warn('Smart add failed to render', e); }
  render() { return this.state.failed ? null : this.props.children; }
}

const SaChip = ({ icon, children, onClick, active, dashed, title }) => {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} title={title} aria-pressed={onClick ? !!active : undefined}
      style={{ display:'inline-flex', alignItems:'center', gap:4, maxWidth:'100%', boxSizing:'border-box', padding:'4px 9px', borderRadius:999,
        border:`0.5px ${dashed ? 'dashed' : 'solid'} ${active ? C.rose : C.border}`,
        background: active ? C.rose : dashed ? 'transparent' : `linear-gradient(135deg, ${C.pink}55, ${C.lavender}55)`,
        color: active ? '#fff' : dashed ? C.textLight : C.text, fontSize:11, lineHeight:1.3, fontFamily:'inherit', fontWeight: active ? 500 : 400,
        cursor: onClick ? 'pointer' : 'default', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', transition:'all .15s' }}>
      {icon && <span aria-hidden="true" style={{ fontSize:10.5, flexShrink:0 }}>{icon}</span>}
      <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{children}</span>
    </Tag>
  );
};

const SaBody = ({ onDone }) => {
  const isMobile = useIsMobile();
  const [val, setVal] = useState('');
  const [picked, setPicked] = useState(null);        // a kind she tapped, or null to let the line decide
  const [onToday, setOnToday] = useState(false);
  const [added, setAdded] = useState(0);
  const inputRef = useRef(null);

  const parsed = React.useMemo(() => {
    if (!val.trim()) return null;
    return sa_parse(val, picked) || sa_fallback(val, picked);
  }, [val, picked]);

  const count = parsed && parsed.kind === 'event' && parsed.repeat && parsed.until && window.nylaSmartParse?.seriesDates
    ? window.nylaSmartParse.seriesDates(parsed.date, parsed.repeat, parsed.until).length : 1;

  const chips = [];
  if (parsed) {
    const labels = (parsed.understood || []).slice(1);
    const icons = [parsed.date && '📅', parsed.time && '🕐', parsed.repeat && '↻', parsed.until && '⏳'].filter(Boolean);
    labels.forEach((label, i) => chips.push({ icon: icons[i] || '✦', label }));
  }
  const showTitle = !!parsed && parsed.text !== val.trim();
  const canToday = !!parsed && parsed.kind === 'task' && !parsed.date;

  const submit = () => {
    if (!parsed || !String(parsed.text || '').trim()) return;
    const res = sa_save(parsed, canToday && onToday);
    if (!res.ok) return;
    setVal('');
    if (res.openNotebook) { onDone && onDone(); window._navigateTo && window._navigateTo('notebook'); return; }
    if (res.stay) { setAdded(n => n + 1); try { inputRef.current && inputRef.current.focus(); } catch (e) {} return; }
    setPicked(null);
    onDone && onDone();
  };

  return (
    <div className={`sa-box${parsed ? ' sa-typing' : ''}`}
      style={{ padding: parsed ? 6 : '6px 6px 10px', marginBottom: parsed ? 0 : 6, borderBottom: parsed ? 'none' : `0.5px solid ${C.border}`, minWidth:0 }}>
      <style>{sa_CSS}</style>
      <div style={{ display:'flex', gap:6, alignItems:'center', minWidth:0 }}>
        <input ref={inputRef} data-smart-add="1" autoFocus={!isMobile} value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !(e.nativeEvent && e.nativeEvent.isComposing)) { e.preventDefault(); submit(); } }}
          placeholder="Type anything: dinner with mom fri 7pm" aria-label="Smart add"
          enterKeyHint="done" autoComplete="off"
          style={{ flex:1, minWidth:0, width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:12, border:`0.5px solid ${C.border}`,
            background:C.pinkLight, color:C.text, fontSize: isMobile ? 16 : 13, fontFamily:'inherit', outline:'none' }}/>
        <VoiceButton size={36} onText={t => setVal(v => (v ? v + ' ' : '') + t)}/>
      </div>

      {parsed && (
        <div className="fade-in" style={{ marginTop:8, minWidth:0 }}>
          {showTitle && (
            <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:7, minWidth:0 }}>
              <span aria-hidden="true" style={{ fontSize:10, color:C.accent, flexShrink:0 }}>✦</span>
              <span style={{ fontFamily:"'DM Serif Display',serif", fontSize:14.5, color:C.text, lineHeight:1.3, minWidth:0, overflowWrap:'anywhere' }}>{parsed.text}</span>
            </div>
          )}
          {(chips.length > 0 || canToday) && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8, minWidth:0 }}>
              {chips.map((c, i) => <SaChip key={i} icon={c.icon}>{c.label}</SaChip>)}
              {canToday && <SaChip icon="☀" dashed={!onToday} active={onToday} onClick={() => setOnToday(v => !v)}
                title={onToday ? 'Tap to leave it without a date' : 'Tap to put it on today'}>{onToday ? 'Today' : 'Put it on today'}</SaChip>}
            </div>
          )}
          <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:4, minWidth:0 }}>
            {sa_KINDS.map(k => (
              <SaChip key={k.key} icon={k.icon} active={parsed.kind === k.key} onClick={() => setPicked(k.key)} title={`Save it as: ${k.label}`}>{k.label}</SaChip>
            ))}
            {picked && <button type="button" onClick={() => setPicked(null)} title="Let the words decide again"
              style={{ border:'none', background:'none', padding:'4px 4px', fontSize:10.5, color:C.textMuted, cursor:'pointer', fontFamily:'inherit', textDecoration:'underline' }}>auto</button>}
          </div>
          <button type="button" onClick={submit}
            style={{ width:'100%', marginTop:10, padding:'9px', borderRadius:12, border:'none', background:`linear-gradient(135deg, ${C.rose}, ${C.roseDark})`,
              color:'#fff', fontSize:13, fontFamily:'inherit', cursor:'pointer', boxShadow:`0 6px 16px ${C.rose}30` }}>{sa_buttonLabel(parsed, count)}</button>
        </div>
      )}
      {!parsed && added > 0 && (
        <div style={{ fontSize:10.5, color:C.textMuted, textAlign:'center', marginTop:7 }}>Added {added}. Keep going, or tap away when you are done.</div>
      )}
    </div>
  );
};

const SmartAddBox = ({ onDone }) => <SaBoundary><SaBody onDone={onDone}/></SaBoundary>;
