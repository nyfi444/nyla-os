/* ── Energy tags + cycle-synced ordering ──────────────────────────────
   Every task can carry the kind of energy it takes (t.energy). Untagged
   tasks get a best guess from their wording. The Period section already
   says what each phase is good for (PHASE_TIPS), and PHASE_ENERGY is that
   advice in a form Tasks and the Morning Brief can sort by.

   Load order: this file runs BEFORE the main app script, so nothing at the
   top level may touch the app's globals (C, toast, getCycleForDate…). Only
   function bodies can, because they run after the app has loaded. */
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
const ENERGY_GUESSES = [
  ['connect', /\b(call|email|e-mail|text|dm|message|pitch|meet|meeting|interview|present|film|record|post|reach out|follow up|network|negotiat|ask|invite|sync)\b/i],
  ['admin',   /\b(pay|bill|book|schedule|renew|file|submit|order|buy|pick up|return|cancel|clean|laundry|errand|appointment|dentist|doctor|register|update|fix|set up|organi[sz]e)\b/i],
  ['focus',   /\b(finish|edit|review|revise|write up|study|research|analy[sz]e|build|code|deep|proofread|wrap up|complete|polish|read)\b/i],
  ['create',  /\b(brainstorm|outline|draft|design|start|sketch|plan out|create|idea|concept|launch|explore|write|make)\b/i],
  ['rest',    /\b(rest|journal|reflect|meditate|nap|walk|self[- ]care|bath|stretch|yoga)\b/i],
];
const guessEnergy = text => {
  const s = String(text || '');
  for (const [key, re] of ENERGY_GUESSES) if (re.test(s)) return key;
  return null;
};
// The tag she chose wins; otherwise the guess. Returns a key or null.
const taskEnergy = t => (t && t.energy) || guessEnergy(t && t.text);
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

// UI pieces, built out by the cycle-synced planning work.
const EnergyChip = ({ t, onUpdate }) => null;
const PhaseSortBanner = ({ onChange }) => null;
