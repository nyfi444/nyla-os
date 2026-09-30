/* ── Backup & Restore: room, earlier copies, kept versions ─────────
   Loads before the main app script: top level must not touch app globals.
   Everything here is prefixed sf_ / Sf, except the one component the
   Backup & Restore page renders: SafetyPanel.

   Room on this device   how full the app's small storage is, and what
                         is taking the space.
   Earlier copies        how everything stood the first time the app was
                         opened each day (14 days), from js/safety.js.
   Kept from sync        when two devices changed the very same thing,
                         the version that did not win. Bring back, copy,
                         or clear.
   Nothing here uploads anything; restoring writes through the app's own
   storage, so sync carries it to the other devices like any edit. */
const sf_NAMES = { nylaos_nb_pages:'Notebook pages', nylaos_nb_folders:'Notebook folders', nylaos_ideas:'Ideas', nylaos_tasks:'Tasks', nylaos_events:'Calendar events', nylaos_goals:'Goals', nylaos_habits:'Habits', nylaos_trash:'Recently Deleted', nylaos_chat_history:'AI chats', nylaos_moodboard:'Moodboard pins', nylaos_auto_bak:'Old automatic backup', nylaos_people:'People', nylaos_shopping_list:'Shopping list', nylaos_periods:'Cycle history', nylaos_cycle_days:'Cycle daily log' };
const sf_name = k => sf_NAMES[k] || (String(k).startsWith('nylaos_') ? String(k).slice(7).replace(/_/g,' ') : `${k} (another app)`);
const sf_size = n => n >= 1048576 ? `${(n/1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n/1024))} KB`;
const sf_when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }); };
const sf_text = html => { try { return new DOMParser().parseFromString(String(html), 'text/html').body.textContent || ''; } catch (e) { return String(html); } };
// A few plain words saying what a kept version is.
const sf_preview = entry => {
  const v = entry.value;
  if (v && typeof v === 'object') {
    const title = v.name || v.title || v.text || '';
    const body = v.content || v.description || v.notes || '';
    return { title: String(title || 'Untitled').slice(0, 80), body: sf_text(body).trim().slice(0, 160) };
  }
  return { title: sf_name(entry.key), body: sf_text(String(v == null ? '' : v)).trim().slice(0, 160) };
};

class SfBoundary extends React.Component {
  constructor(p) { super(p); this.state = { bad: false }; }
  static getDerivedStateFromError() { return { bad: true }; }
  componentDidCatch(e) { console.error('[safety panel]', e); }
  render() { return this.state.bad ? null : this.props.children; }
}

const SfInner = () => {
  const [copies, setCopies] = useState(null);
  const [kept, setKept] = useState(null);
  const [msg, setMsg] = useState('');
  const [showAll, setShowAll] = useState(false);
  const use = window.nylaSafety ? window.nylaSafety.usage() : null;
  const load = () => {
    if (!window.nylaSafety) { setCopies([]); setKept([]); return; }
    window.nylaSafety.listSnapshots().then(setCopies).catch(()=>setCopies([]));
    window.nylaSafety.listKept().then(setKept).catch(()=>setKept([]));
  };
  useEffect(load, []);
  if (!window.nylaSafety) return null;

  const restoreCopy = async c => {
    if (!window.confirm(`Go back to how everything was on ${sf_when(c.at)}? How things are right now is saved as a copy first, so you can return to it.`)) return;
    const full = await window.nylaSafety.getSnapshot(c.id);
    if (!full || !full.data) { setMsg('That copy could not be read.'); return; }
    await window.nylaSafety.snapshot(null, 'before going back', 'before-restore');
    Object.entries(full.data).forEach(([k, v]) => { if (k.startsWith('nylaos_') && k !== 'nylaos_auto_bak' && typeof v === 'string') localStorage.setItem(k, v); });
    toast('Restored ✦ reloading', 'success', 1500);
    setTimeout(() => window.location.reload(), 900);
  };
  const downloadCopy = async c => {
    const full = await window.nylaSafety.getSnapshot(c.id);
    if (!full || !full.data) { setMsg('That copy could not be read.'); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(full.data, null, 2)], { type:'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `nyla-os-copy-${String(c.at).slice(0,10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const bringBack = async e => {
    try {
      if (e.recordId != null && e.value && typeof e.value === 'object') {
        const list = JSON.parse(localStorage.getItem(e.key) || '[]');
        if (!Array.isArray(list)) throw new Error('not a list');
        const at = list.findIndex(x => x && String(x.id) === String(e.recordId));
        // The version on screen now is kept in its place, so bringing one back never loses the other.
        if (at >= 0) await window.nylaSafety.keep([{ key:e.key, recordId:e.recordId, from:'this device', value:list[at] }], 'swapped');
        const next = at >= 0 ? list.map((x, i) => i === at ? e.value : x) : [e.value, ...list];
        localStorage.setItem(e.key, JSON.stringify(next));
      } else {
        const now = localStorage.getItem(e.key);
        if (now !== null) await window.nylaSafety.keep([{ key:e.key, recordId:null, from:'this device', value:now }], 'swapped');
        localStorage.setItem(e.key, typeof e.value === 'string' ? e.value : JSON.stringify(e.value));
      }
      await window.nylaSafety.removeKept(e.id);
      toast('Brought back ✦ reloading', 'success', 1500);
      setTimeout(() => window.location.reload(), 900);
    } catch (err) { setMsg('That version could not be brought back. Copy its text instead.'); }
  };
  const copyText = e => {
    const v = e.value, text = v && typeof v === 'object' ? [v.name || v.title || v.text || '', sf_text(v.content || v.description || v.notes || '')].filter(Boolean).join('\n\n') : sf_text(String(v == null ? '' : v));
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Copied', 'success', 1400)).catch(() => setMsg('Copying is blocked here.'));
  };
  const clear = async e => { await window.nylaSafety.removeKept(e.id); load(); };

  const pct = Math.min(100, Math.round(use.share * 100));
  const tone = pct >= 85 ? '#E07050' : pct >= 65 ? '#F4A261' : C.rose;
  const btn = { padding:'6px 12px', borderRadius:10, background:'transparent', color:C.accent, border:`1px solid ${C.border}`, fontSize:12, cursor:'pointer', fontFamily:'inherit' };
  const days = (copies || []).filter(c => showAll || /^day-/.test(c.id) || c.id === 'before-restore' || c.id === 'old-auto-backup');
  return (
    <>
      <Card style={{ marginBottom:14 }}>
        <SectionHeading>Room on this device</SectionHeading>
        <div style={{ height:10, borderRadius:999, background:`${C.pink}70`, overflow:'hidden', margin:'4px 0 8px' }}>
          <div style={{ width:`${Math.max(pct, 2)}%`, height:'100%', borderRadius:999, background:tone, transition:'width .4s' }}/>
        </div>
        <div style={{ fontSize:13, color:C.textLight, lineHeight:1.6 }}>
          <strong>{sf_size(use.chars)}</strong> of about 5 MB used ({pct}%). {pct >= 85 ? 'Nearly full. Clearing Recently Deleted or old AI chats makes room fastest.' : pct >= 65 ? 'Getting full. Worth a tidy soon.' : 'Plenty of room.'}
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:10 }}>
          {use.biggest.filter(b => b.chars > 2048).slice(0, 6).map(b => (
            <span key={b.key} style={{ fontSize:11.5, padding:'4px 10px', borderRadius:999, background:C.lavLight, color:C.textLight, border:`0.5px solid ${C.border}` }}>{sf_name(b.key)} · {sf_size(b.chars)}</span>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom:14, background:C.lavLight }}>
        <SectionHeading>Earlier copies</SectionHeading>
        <div style={{ fontSize:13, color:C.textLight, lineHeight:1.7, marginBottom:10 }}>
          Nyla OS keeps a copy of everything from the first time you open it each day, for 14 days, on this device. A bad afternoon can never replace a good morning.
        </div>
        {copies === null ? <div style={{ fontSize:12.5, color:C.textMuted }}>Looking…</div>
          : !days.length ? <div style={{ fontSize:12.5, color:C.textMuted }}>The first copy is made the next time the app opens.</div>
          : days.map(c => (
            <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', padding:'8px 0', borderTop:`0.5px solid ${C.border}` }}>
              <div style={{ flex:'1 1 150px', minWidth:0 }}>
                <div style={{ fontSize:13, color:C.text, fontWeight:500 }}>{sf_when(c.at)}</div>
                <div style={{ fontSize:11.5, color:C.textMuted }}>{c.id === 'before-restore' ? 'Saved before you went back' : c.id === 'old-auto-backup' ? 'The last backup of the old kind' : c.id === 'session' ? 'This session' : 'Start of the day'} · {sf_size(c.chars || 0)}</div>
              </div>
              <button style={btn} onClick={() => restoreCopy(c)}>↩ Go back to this</button>
              <button style={btn} onClick={() => downloadCopy(c)}>⬇ Download</button>
            </div>
          ))}
        {copies && copies.length > days.length && <button style={{ ...btn, marginTop:8 }} onClick={() => setShowAll(true)}>Show this session too</button>}
      </Card>

      {kept && kept.length > 0 && (
        <Card style={{ marginBottom:14 }}>
          <SectionHeading>Kept from sync</SectionHeading>
          <div style={{ fontSize:13, color:C.textLight, lineHeight:1.7, marginBottom:10 }}>
            When two of your devices changed the very same thing, the newer one won and the other was kept here, for 90 days. Nothing was thrown away.
          </div>
          {kept.slice(0, 40).map(e => { const p = sf_preview(e); return (
            <div key={e.id} style={{ padding:'10px 0', borderTop:`0.5px solid ${C.border}` }}>
              <div style={{ fontSize:13, color:C.text, fontWeight:500, overflowWrap:'anywhere' }}>{p.title}</div>
              {p.body && <div style={{ fontSize:12, color:C.textLight, lineHeight:1.5, margin:'2px 0 4px', overflowWrap:'anywhere' }}>{p.body}{p.body.length >= 160 ? '…' : ''}</div>}
              <div style={{ fontSize:11.5, color:C.textMuted, marginBottom:6 }}>{sf_name(e.key)} · from {e.from} · {sf_when(e.at)}</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button style={btn} onClick={() => bringBack(e)}>↩ Bring back</button>
                <button style={btn} onClick={() => copyText(e)}>Copy text</button>
                <button style={{ ...btn, color:C.textMuted }} onClick={() => clear(e)}>Clear</button>
              </div>
            </div>
          ); })}
        </Card>
      )}
      {msg && <div style={{ margin:'0 0 14px', fontSize:13, color:'#E07050', padding:'10px 14px', borderRadius:10, background:'#E0705015', border:'0.5px solid #E07050' }}>{msg}</div>}
    </>
  );
};
const SafetyPanel = () => <SfBoundary><SfInner/></SfBoundary>;
