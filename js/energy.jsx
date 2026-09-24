/* ── Energy tags + cycle-synced ordering ──────────────────────────────
   Every task can carry the kind of energy it takes (t.energy). Untagged
   tasks get a best guess from their wording. The Period section already
   says what each phase is good for (PHASE_TIPS), and PHASE_ENERGY is that
   advice in a form Tasks and the Morning Brief can sort by.

   t.energy is one of the ENERGY_TYPES keys (her choice), 'none' (she said
   "don't tag": no chip, no guess, never counts as a fit), or unset/null
   (show the guess from the wording).

   Load order: this file runs BEFORE the main app script, so nothing at the
   top level may touch the app's globals (C, toast, getCycleForDate…). Only
   function bodies can, because they run after the app has loaded. Hooks are
   used as React.useX here for the same reason. */
const ENERGY_TYPES = [
  { key:'create',  label:'Create',  hint:'Start, brainstorm, draft' },
  { key:'connect', label:'Connect', hint:'Pitch, call, film, present' },
  { key:'focus',   label:'Focus',   hint:'Deep work, edit, finish' },
  { key:'admin',   label:'Admin',   hint:'Errands, bills, bookings' },
  { key:'rest',    label:'Rest',    hint:'Reflect, plan, recover' },
];
// First entry is the phase's best fit, second is a good fit.
const PHASE_ENERGY = {
  Menstrual:  ['rest', 'admin'],
  Follicular: ['create', 'connect'],
  Ovulation:  ['connect', 'create'],
  Luteal:     ['focus', 'admin'],
};

/* Words behind the guess. Each entry is a regex fragment matched as a whole
   word plus a plain ending (s, es, ed, d, ing), so "calls", "filmed" and
   "negotiating" all count. Irregular forms (writing, studied) are listed. */
const ENERGY_WORDS = {
  connect: ['call', 'phone', 'facetime', 'zoom', 'e-?mail', 'text', 'text back', 'dm', 'message', 'reply', 'respond',
    'pitch', 'meet', 'meeting', 'interview', 'present', 'presentation', 'film', 'record', 'shoot', 'post', 'tiktok',
    'reel', 'vlog', 'youtube', 'instagram', 'livestream', 'go live', 'podcast', 'reach out', 'follow[- ]up', 'check in',
    'catch up', 'network', 'negotiat(?:e|ion|ing)', 'ask', 'invite', 'sync', 'collab', 'collaborat(?:e|ion|ing)',
    'partner', 'outreach', 'contact', 'thank', 'share', 'announce', 'promote', '(?:coffee|lunch|dinner|drinks) with',
    'return (?:the |a |her |his |their |my )?calls?', 'make (?:a |the )?(?:phone |quick )?call'],
  // "book" as a verb only: "Book club" and "Book report" are not bookings.
  admin: ['pay', 'bill', 'book(?! (?:club|report|review))', 'schedule', 'reschedule', 'renew', 'file', 'submit', 'order', 'buy', 'purchase',
    'pick up', 'drop off', 'return', 'cancel', 'refund', 'clean', 'clean ?up', 'tidy', 'declutter', 'laundry', 'dish', 'vacuum',
    'errand', 'grocer(?:y|ies)', 'shopping', 'appointment', 'appt', 'dentist', 'doctor', 'dr', 'vet', 'pharmacy',
    'prescription', 'refill', 'blood test', 'register', 'sign up', 'sign', 'fill out', 'form', 'update', 'fix',
    'set up', 'setup', 'install', 'organi[sz]e', 'sort', 'invoice', 'receipt', 'tax', 'budget', 'bank', 'insurance',
    'rent', 'mail', 'post office', 'ship', 'package', 'print', 'scan', 'upload', 'download', 'back up', 'backup',
    'password', 'unsubscribe', 'confirm', 'rsvp', 'dmv', 'passport', 'license', 'oil change', 'meal prep', 'cook',
    'transfer', 'deposit', 'apply', 'application', 'trash', 'garbage', 'recycling', 'wash', 'chore',
    // Longer than "make" (Create) at the same spot, so "Make dentist appointment" is Admin.
    // (’ is the apostrophe an iPhone keyboard types.)
    "make (?:an? |the |my )?(?:[\\w'’]+ ){0,2}(?:appointment|appt|reservation|payment|budget)"],
  focus: ['finish', 'edit', 'review', 'revise', 'revision', 'rewrite', 'rewriting', 'write up', 'study', 'studied',
    'research', 'analy[sz]e', 'analysis', 'build', 'code', 'coding', 'debug', 'refactor', 'implement', 'deep work',
    'proofread', 'wrap up', 'complete', 'polish', 'read', 'homework', 'hw', 'assignment', 'essay', 'paper', 'report',
    'lab', 'thesis', 'exam', 'midterm', 'final', 'quiz', 'test', 'practice', 'problem set', 'pset', 'memori[sz]e',
    'flashcard', 'notes', 'lecture', 'chapter', 'lesson', 'learn', 'prep', 'prepare', 'translate', 'transcribe',
    'calculate', 'spreadsheet', 'reconcile', 'audit', 'optimi[sz]e', 'finali[sz]e', 'bug',
    'fix (?:\\w+ ){0,2}bugs?'],
  create: ['brainstorm', 'outline', 'draft', 'design', 'start', 'sketch', 'plan', 'planning', 'plan out', 'create',
    'idea', 'ideate', 'concept', 'launch', 'explore', 'write', 'writing', 'make', 'blog', 'script', 'storyboard',
    'mood ?board', 'vision board', 'logo', 'brand', 'name', 'compose', 'paint', 'draw', 'prototype', 'mock ?up',
    'wireframe', 'invent', 'new', 'content', 'caption', 'recipe', 'develop', 'experiment', 'pitch deck'],
  rest: ['rest', 'journal', 'reflect', 'meditat(?:e|ion|ing)', 'nap', 'sleep', 'walk', 'self[- ]?care', 'bath',
    'stretch', 'yoga', 'therapy', 'massage', 'skincare', 'spa', 'breath(?:e|work)', 'unplug', 'day off', 'recharge',
    'reset', 'relax', 'tarot', 'pray', 'prayer', 'ritual', 'gratitude', 'affirmation', 'manifest', 'new moon',
    'full moon', 'read for fun', 'weekly (?:review|reset|plan)', 'monthly (?:review|reset)',
    "plan (?:my |the |next |this )?(?:week|month|day|semester|quarter|year)(?!['’]s)"],
};
// [key, regex] in tie-break order. Kept under its original name for anything that reads it.
const ENERGY_GUESSES = ['connect', 'admin', 'focus', 'create', 'rest'].map(k =>
  [k, new RegExp('\\b(?:' + ENERGY_WORDS[k].join('|') + ')(?:s|es|ed|d|ing)?\\b', 'i')]);
// The earliest matching word wins, because a task usually leads with its verb
// ("Write blog post" is writing, not posting). A longer match at the same spot
// wins next ("plan next week" over "plan"), then the order above.
const guessEnergy = text => {
  const s = String(text || '');
  let best = null;
  for (const [key, re] of ENERGY_GUESSES) {
    const m = re.exec(s);
    if (!m) continue;
    if (!best || m.index < best.at || (m.index === best.at && m[0].length > best.len)) best = { key, at:m.index, len:m[0].length };
  }
  return best ? best.key : null;
};
// What a task's tag is and where it came from. key is null when there is nothing to show.
const energyInfo = t => {
  const e = t && t.energy;
  if (e === 'none') return { key:null, guessed:false, none:true };
  if (e && ENERGY_TYPES.some(x => x.key === e)) return { key:e, guessed:false, none:false };
  return { key:guessEnergy(t && t.text), guessed:true, none:false };
};
// She has decided this one (a type or "don't tag"); anything else is still open to a guess.
const energyHasTag = t => !!t && (t.energy === 'none' || ENERGY_TYPES.some(x => x.key === t.energy));
// The tag she chose wins; otherwise the guess. Returns a key or null ('none' counts as no energy).
const taskEnergy = t => energyInfo(t).key;
// 2 = the phase's best fit, 1 = a good fit, 0 = neither (or no phase known).
const energyFit = (t, phaseName) => {
  const fits = PHASE_ENERGY[phaseName] || [];
  const e = taskEnergy(t);
  return !e ? 0 : e === fits[0] ? 2 : e === fits[1] ? 1 : 0;
};
const phaseSortOn = () => { try { return localStorage.getItem('nylaos_phase_sort') !== 'off'; } catch (e) { return true; } };
// Stable: tasks that fit the current phase move up, the rest keep their order.
const sortForPhase = (list, cycle) => {
  if (!phaseSortOn()) return list;
  const c = cycle !== undefined ? cycle : (typeof getCycleForDate === 'function' ? getCycleForDate(new Date()) : null);
  if (!c || !c.name) return list;
  return list.map((t, i) => [t, i]).sort((a, b) => (energyFit(b[0], c.name) - energyFit(a[0], c.name)) || (a[1] - b[1])).map(x => x[0]);
};

const energyLabel = key => (ENERGY_TYPES.find(x => x.key === key) || {}).label || '';
const energyCycleNow = () => { try { return typeof getCycleForDate === 'function' ? getCycleForDate(new Date()) : null; } catch (e) { return null; } };
// "Create and Connect" for a phase.
const energyPhaseNames = phase => (PHASE_ENERGY[phase] || []).map(energyLabel).join(' and ');

/* ── Tagging with Claude ───────────────────────────────────────────── */
// Open tasks she hasn't tagged (calendar items are not tasks).
const energyUntagged = () => {
  let tasks = [];
  try { tasks = JSON.parse(localStorage.getItem('nylaos_tasks') || '[]'); } catch (e) {}
  return (Array.isArray(tasks) ? tasks : []).filter(t => t && !t.done && t.source !== 'calendar' && !energyHasTag(t) && String(t.text || '').trim());
};
// Claude's reply → { "<id>": key }. Ignores ids it wasn't asked about and values that aren't a type.
const energyParseTags = (raw, asked) => {
  const ids = new Set((asked || []).map(t => String(t.id)));
  const keys = ENERGY_TYPES.map(x => x.key);
  const out = {};
  const put = (id, v) => {
    const k = String(v == null ? '' : v).trim().toLowerCase();
    if (ids.has(String(id).trim()) && keys.includes(k)) out[String(id).trim()] = k;
  };
  const s = String(raw || '').replace(/```(?:json)?/gi, '').trim();
  let parsed = null;
  const a = s.search(/[\[{]/), b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (a >= 0 && b > a) { try { parsed = JSON.parse(s.slice(a, b + 1)); } catch (e) {} }
  if (Array.isArray(parsed)) parsed.forEach(x => x && put(x.id, x.energy || x.tag || x.type));
  else if (parsed && typeof parsed === 'object') Object.entries(parsed).forEach(([id, v]) => put(id, v));
  else {
    // Not valid JSON: pick out "id": "type" pairs one by one.
    const re = /"?([\w.-]+)"?\s*:\s*"([a-zA-Z]+)"/g; let m;
    while ((m = re.exec(s))) put(m[1], m[2]);
  }
  return out;
};
// Tags every open, untagged task. Resolves to how many were tagged (0 only when
// everything it asked about was tagged, finished or removed meanwhile); throws a
// readable Error. The caller refreshes whatever view holds the task list.
const energyTagTasks = async () => {
  const asked = energyUntagged().slice(0, 200);
  if (!asked.length) return 0;
  const system = `You sort someone's to-do items by the kind of energy each one takes. The five kinds:
- create: starting or making something new: brainstorming, outlining, drafting, designing, writing, planning a project.
- connect: anything with or in front of other people: calls, emails, messages, pitching, meetings, interviews, filming, recording, posting.
- focus: heads-down work: studying, homework, research, editing, revising, coding, finishing or polishing.
- admin: errands and upkeep: bills, bookings, appointments, forms, orders, cleaning, setup, fixes.
- rest: reflection and recovery: journaling, rest, self-care, reviewing or planning the week.
Reply with only a JSON object that maps every task id to one of: create, connect, focus, admin, rest. No other text.`;
  const content = JSON.stringify(asked.map(t => ({ id:String(t.id), text:String(t.text).slice(0, 300) })));
  const raw = await callClaude({ system, messages:[{ role:'user', content }], maxTokens:4000, effort:'low' });
  const tags = energyParseTags(raw, asked);
  // Nothing usable came back (prose, an apology, a cut-off reply): say so rather than "nothing to tag".
  if (!Object.keys(tags).length) throw new Error("Couldn't read Claude's reply. Try again.");
  // Read again: she may have changed something while Claude was working. Never overwrite her own tag.
  let fresh = [];
  try { fresh = JSON.parse(localStorage.getItem('nylaos_tasks') || '[]'); } catch (e) { return 0; }
  let n = 0;
  const next = fresh.map(t => {
    const k = t && tags[String(t.id)];
    if (!k || t.done || t.source === 'calendar' || energyHasTag(t)) return t;
    n++; return { ...t, energy:k };
  });
  if (n) localStorage.setItem('nylaos_tasks', JSON.stringify(next));
  return n;
};

// Tells the App that nylaos_tasks changed under whatever view is open. The App
// remounts the open view on 'nyla:data-changed' (the same event agent edits and
// phone captures send), so a view that loaded the list before the tags were
// written can't save its old copy back over them. A remount would drop a
// half-typed entry, so it waits (up to 2 minutes) while she is typing.
// A function declaration: Babel renames a const arrow that calls itself (_energyAnnounce).
function energyAnnounce(tries = 0) {
  const a = document.activeElement;
  const typing = !!a && (a.isContentEditable || ((a.tagName === 'TEXTAREA' ||
    (a.tagName === 'INPUT' && /^(?:text|search|email|url|tel|number|password)?$/i.test(a.getAttribute('type') || ''))) && !!String(a.value || '').trim()));
  if (typing) { if (tries < 60) setTimeout(() => energyAnnounce(tries + 1), 2000); return; }
  try { window.dispatchEvent(new CustomEvent('nyla:data-changed', { detail:{ keys:['nylaos_tasks'], source:'energy' } })); } catch (e) {}
}

/* ── Picker ────────────────────────────────────────────────────────── */
// Rendered into <body> so no card or column can clip it. Closes on an outside
// tap/click, Escape, or a pick.
const EnergyPicker = ({ anchor, info, phase, mobile, onPick, onClose }) => {
  const boxRef = React.useRef(null);
  const [pos, setPos] = React.useState(null);
  const place = React.useCallback(() => {
    if (!anchor || !boxRef.current) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(264, vw - 16), h = boxRef.current.offsetHeight;
    const left = Math.max(8, Math.min(r.left, vw - w - 8));
    let top = r.bottom + 6;
    if (top + h > vh - 8) top = r.top - h - 6 >= 8 ? r.top - h - 6 : Math.max(8, vh - h - 8);
    setPos({ left, top, w });
  }, [anchor]);
  React.useLayoutEffect(() => { place(); }, [place]);
  React.useEffect(() => {
    const away = e => {
      if (boxRef.current && boxRef.current.contains(e.target)) return;
      if (anchor && anchor.contains(e.target)) return; // the chip toggles itself
      // The tap that closes the picker shouldn't also land on whatever is under it
      // (e.g. start editing another task), so swallow the click from this same
      // gesture, and only that one. A scroll or swipe ends in pointercancel and
      // never clicks, and the next pointerdown is a new gesture, so either ends
      // the swallowing at once. A phone can send the click a moment after the
      // finger lifts, so it waits a little after pointerup. The long timer is only
      // a backstop (a press held down, or a pointerup that never comes).
      let timer = null;
      const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); done(); };
      const later = () => { clearTimeout(timer); timer = setTimeout(done, 400); };
      const done = () => {
        clearTimeout(timer);
        document.removeEventListener('click', swallow, true);
        document.removeEventListener('pointerup', later, true);
        document.removeEventListener('pointercancel', done, true);
        document.removeEventListener('pointerdown', done, true);
      };
      document.addEventListener('click', swallow, true);
      document.addEventListener('pointerup', later, true);
      document.addEventListener('pointercancel', done, true);
      // Added while this pointerdown is being delivered, so it only hears the next one.
      document.addEventListener('pointerdown', done, true);
      timer = setTimeout(done, 3000);
      onClose();
    };
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(true); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = boxRef.current ? [...boxRef.current.querySelectorAll('button')] : [];
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      const n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      items[n].focus();
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const first = boxRef.current && (boxRef.current.querySelector('[aria-checked="true"]') || boxRef.current.querySelector('button'));
    if (first) { try { first.focus({ preventScroll:true }); } catch (e) {} }
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, onClose, place]);

  const fits = PHASE_ENERGY[phase] || [];
  const guess = info.guessed ? info.key : null;
  const rowStyle = on => ({
    display:'flex', alignItems:'center', gap:8, width:'100%', minHeight: mobile ? 40 : 32, padding:'6px 10px',
    borderRadius:9, border:'none', background: on ? (_dk ? `${C.rose}30` : `${C.pink}55`) : 'transparent', color:C.text,
    fontFamily:'inherit', fontSize:12.5, textAlign:'left', cursor:'pointer',
  });
  const hover = on => ({
    onMouseEnter: e => { if (!on) e.currentTarget.style.background = _dk ? `${C.rose}1a` : `${C.pink}30`; },
    onMouseLeave: e => { if (!on) e.currentTarget.style.background = 'transparent'; },
  });
  const tick = on => <span aria-hidden="true" style={{ width:12, flexShrink:0, color:C.rose, fontSize:12 }}>{on ? '✓' : ''}</span>;
  const guessOn = !info.none && info.guessed;
  return ReactDOM.createPortal(
    <div ref={boxRef} role="menu" aria-label="Energy this task takes" onClick={e => e.stopPropagation()}
      style={{ position:'fixed', left: pos ? pos.left : -9999, top: pos ? pos.top : 0, width: pos ? pos.w : 264, zIndex:9000,
        background:C.card, border:`0.5px solid ${C.border}`, borderRadius:14, padding:6,
        boxShadow: _dk ? '0 10px 30px rgba(0,0,0,.5)' : '0 10px 30px rgba(64,24,40,.16)' }}>
      <div style={{ fontSize:11, color:C.textMuted, fontWeight:600, letterSpacing:.8, textTransform:'uppercase', padding:'4px 10px 6px' }}>Energy this takes</div>
      {ENERGY_TYPES.map(x => {
        const on = !info.guessed && info.key === x.key;
        return (
          <button key={x.key} type="button" role="menuitemradio" aria-checked={on} onClick={() => onPick(x.key)} style={rowStyle(on)} {...hover(on)}>
            {tick(on)}
            <span style={{ flex:1, minWidth:0 }}>
              <span style={{ fontWeight: on ? 600 : 500 }}>{x.label}</span>
              <span style={{ color:C.textLight, fontSize:11 }}> · {x.hint}</span>
            </span>
            {fits.includes(x.key) && <span style={{ fontSize:11, color:C.rose, flexShrink:0 }}>{fits[0] === x.key ? 'best now' : 'good now'}</span>}
          </button>
        );
      })}
      <div style={{ height:0.5, background:C.border, margin:'5px 8px' }} />
      <button type="button" role="menuitemradio" aria-checked={guessOn} onClick={() => onPick(null)} style={rowStyle(guessOn)} {...hover(guessOn)}>
        {tick(guessOn)}
        <span style={{ flex:1, minWidth:0 }}>
          <span style={{ fontWeight:500 }}>Guess from wording</span>
          <span style={{ color:C.textLight, fontSize:11 }}> · {guessOn ? (guess ? energyLabel(guess) : 'no guess') : 'clear my tag'}</span>
        </span>
      </button>
      <button type="button" role="menuitemradio" aria-checked={info.none} onClick={() => onPick('none')} style={rowStyle(info.none)} {...hover(info.none)}>
        {tick(info.none)}
        <span style={{ flex:1, minWidth:0 }}>
          <span style={{ fontWeight:500 }}>Don't tag</span>
          <span style={{ color:C.textLight, fontSize:11 }}> · hide the tag on this task</span>
        </span>
      </button>
    </div>,
    document.body
  );
};

/* ── Chip on each open task ────────────────────────────────────────── */
// always: also render when she chose "Don't tag", so there is a way back
// (meant for the task's details panel).
const EnergyChip = ({ t, onUpdate, always = false }) => {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const mobile = useIsMobile();
  const close = React.useCallback(refocus => {
    setOpen(false);
    if (refocus === true && btnRef.current) { try { btnRef.current.focus({ preventScroll:true }); } catch (e) {} }
  }, []);
  if (!t) return null;
  const info = energyInfo(t);
  if (info.none && !always) return null;
  const cycle = energyCycleNow();
  const phase = cycle && cycle.name;
  const fit = info.key && phase ? energyFit(t, phase) : 0;
  const pick = v => {
    setOpen(false);
    if (typeof onUpdate === 'function') onUpdate({ energy:v });
  };
  const label = info.key ? energyLabel(info.key) : info.none ? 'No tag' : '+ Energy';
  const fitText = fit === 2 ? `Fits your ${phase} phase` : fit === 1 ? `Also suits your ${phase} phase` : '';
  const title = [fitText,
    info.none ? 'Not tagged — tap to set' : !info.guessed ? `Energy: ${label} — tap to change` : info.key ? 'Guessed from the wording — tap to set' : 'Tag the energy this takes'
  ].filter(Boolean).join(' · ');
  const borderColor = fit === 2 ? C.rose : fit === 1 ? `${C.rose}88` : info.guessed || info.none ? C.textMuted : C.border;
  const chip = {
    display:'inline-block', fontSize:11, lineHeight:'15px', padding:'2px 8px', borderRadius:10, whiteSpace:'nowrap',
    border:`${fit ? 1 : info.guessed || info.none ? 1 : 0.5}px ${info.guessed || info.none ? 'dotted' : 'solid'} ${borderColor}`,
    background: info.guessed || info.none ? 'transparent' : `${C.lavender}55`,
    color: info.guessed || info.none ? C.textLight : C.text, fontWeight: info.guessed ? 400 : 500,
  };
  return (
    <>
      <button ref={btnRef} type="button" title={title} aria-label={info.key ? `Energy: ${label}. ${title}` : title} aria-haspopup="menu" aria-expanded={open}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', color:'inherit', display:'inline-flex', alignItems:'center',
          // Phones: a 38px-tall hit area around a small chip, without changing the row's height.
          padding: mobile ? '6px 4px 12px' : 0, margin: mobile ? '-6px -4px -12px' : 0 }}>
        <span style={chip}>{always && info.key ? `Energy: ${label}` : label}</span>
      </button>
      {open && btnRef.current && (
        <EnergyPicker anchor={btnRef.current} info={info} phase={phase} mobile={mobile} onPick={pick} onClose={close} />
      )}
    </>
  );
};

/* ── Banner at the top of Tasks > Today ────────────────────────────── */
const PhaseSortBanner = ({ onChange }) => {
  const mobile = useIsMobile();
  const [sortOn, setSortOn] = React.useState(phaseSortOn);
  const [busy, setBusy] = React.useState(false);
  const [hintGone, setHintGone] = React.useState(() => { try { return localStorage.getItem('nyla_phase_hint_dismissed') === '1'; } catch (e) { return false; } });
  // Tagging takes a few seconds; she may leave Tasks > Today before it finishes.
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const cycle = energyCycleNow();
  const go = () => { if (typeof window._navigateTo === 'function') window._navigateTo('period', 'Cycle Overview'); };
  const tapH = mobile ? 36 : 28;
  const linkBtn = { background:'none', border:'none', padding:'0 2px', minHeight:tapH, color:C.rose, fontSize:12.5, fontFamily:'inherit', cursor:'pointer' };
  // A text link inside a sentence: on phones pad the hit area to ~36px without moving the text.
  const inlineLink = { ...linkBtn, minHeight:0, display:'inline-block', lineHeight:1.5, padding: mobile ? '9px 2px' : 0, margin: mobile ? '-9px -2px' : 0 };

  if (!cycle || !cycle.name) {
    if (hintGone) return null;
    const hide = () => { setHintGone(true); try { localStorage.setItem('nyla_phase_hint_dismissed', '1'); } catch (e) {} };
    return (
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14, fontSize:12.5, color:C.textLight }}>
        <div style={{ flex:1, minWidth:0, lineHeight:1.5 }}>
          <button type="button" onClick={go} style={inlineLink}>Log a period</button> to sort today's tasks by your cycle phase.
        </div>
        <button type="button" onClick={hide} aria-label="Hide this hint" title="Hide"
          style={{ width:tapH, height:tapH, flexShrink:0, borderRadius:10, border:'none', background:'transparent', color:C.textMuted, fontSize:13, cursor:'pointer' }}>✕</button>
      </div>
    );
  }

  const phase = cycle.name;
  const tips = (typeof PHASE_TIPS !== 'undefined' && PHASE_TIPS[phase]) || {};
  const names = energyPhaseNames(phase);
  const untagged = energyUntagged().length;
  let sinceLogged = null;
  if (cycle.stale) { try { const p = loadPeriods(); if (p.length) sinceLogged = dayDiff(p[p.length - 1].start, toDateKey()); } catch (e) {} }

  const toggle = () => {
    const v = !sortOn;
    setSortOn(v);
    try { localStorage.setItem('nylaos_phase_sort', v ? 'on' : 'off'); } catch (e) {}
    if (typeof onChange === 'function') onChange();
  };
  const tagAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const n = await energyTagTasks();
      toast(n ? `Tagged ${n} task${n === 1 ? '' : 's'}` : 'Nothing new to tag', n ? 'success' : 'info', 2200);
      if (n) {
        // Still on Today: the Tasks panel reloads its list from storage (its onChange),
        // which keeps anything half-typed in its add box. Moved on: whatever view is
        // open now loaded the list before the tags existed, so ask the App to remount it.
        if (alive.current) { if (typeof onChange === 'function') onChange(); }
        else energyAnnounce();
      }
    } catch (e) {
      toast((e && e.message) || 'Could not tag your tasks', 'error', 5000);
    } finally { setBusy(false); }
  };

  return (
    <Card style={{ padding:'12px 14px', marginBottom:16 }}>
      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
        <span aria-hidden="true" style={{ width:8, height:8, borderRadius:'50%', background:cycle.color || C.rose, marginTop:6, flexShrink:0 }} />
        <div style={{ flex:1, minWidth:0, fontSize:13, lineHeight:1.5, color:C.text }}>
          <span style={{ fontWeight:600 }}>{phase}{cycle.stale ? ' (estimate)' : ''} · day {cycle.day}</span>
          {cycle.late ? <span style={{ color:C.text }}> · period {cycle.late === 1 ? '1 day' : `${cycle.late} days`} late</span> : null}
          <span style={{ color:C.textLight }}>
            {' — '}{tips.vibe ? `${tips.vibe}. ` : ''}
            {names ? (sortOn ? `${names} tasks come first today.` : `${names} tasks suit today. Sorted by date.`) : ''}
          </span>
          {cycle.stale && (
            <div style={{ fontSize:12, color:C.textLight, marginTop:2 }}>
              {sinceLogged != null ? `Last period logged ${sinceLogged} days ago, so this phase is a guess. ` : 'Your period log is out of date, so this phase is a guess. '}
              <button type="button" onClick={go} style={{ ...inlineLink, fontSize:12 }}>Update it</button>
            </div>
          )}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginTop:8, paddingLeft:14 }}>
        <button type="button" role="switch" aria-checked={sortOn} onClick={toggle}
          style={{ display:'inline-flex', alignItems:'center', gap:8, minHeight:tapH, padding:'0 4px', background:'none', border:'none', cursor:'pointer', color:C.text, fontSize:12, fontFamily:'inherit' }}>
          <span aria-hidden="true" style={{ position:'relative', width:30, height:18, borderRadius:9, flexShrink:0, background: sortOn ? C.rose : `${C.textMuted}88`, transition:'background .15s' }}>
            <span style={{ position:'absolute', top:2, left: sortOn ? 14 : 2, width:14, height:14, borderRadius:'50%', background:'#fff', transition:'left .15s', boxShadow:'0 1px 2px rgba(0,0,0,.2)' }} />
          </span>
          Sort by my phase
        </button>
        {untagged > 0 && (
          <button type="button" onClick={tagAll} disabled={busy}
            title={`Ask Claude to tag the energy of ${untagged} untagged task${untagged === 1 ? '' : 's'}`}
            style={{ minHeight:tapH, padding:'0 12px', borderRadius:20, border:`0.5px solid ${C.border}`, background:'transparent', color:C.rose, fontSize:12, fontFamily:'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1 }}>
            {busy ? 'Tagging…' : 'Tag my tasks'}
          </button>
        )}
      </div>
    </Card>
  );
};
