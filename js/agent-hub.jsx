/* ── Agent Hub ─────────────────────────────────────────────────────────
   The AI Agents page as a workstation: a list of agents on the left and the
   picked agent's workspace on the right, with four tabs:
     Chat         the desk chat (approval preview for add AND edit actions,
                  undo, photos and files, chat history) plus quick prompts
     Workstation  "Ask <agent> to write one": a full report saved as a page
                  in the Notebook folder "Agent Reports", and every report
                  that agent has written
     Prompt       its system prompt (edit, save, reset to the original) and
                  a read-only view of everything else it receives
     Settings     the agent form (also used for "+ New agent")
   On a phone the list comes first and a tap opens the workspace full screen.

   One chat per agent, shared by the Hub and the Office desk popup
   (AgentCard in the main script): the conversation lives in agentHub_chats,
   outside React, so switching agents, tabs or views never loses it or its
   Undo, and a reply that arrives after she moved on still lands.
   useAgentChat(agent) subscribes a component to that agent's chat;
   AgentChatPanel draws it (embedded in the Hub, or as the Office popup).

   Storage
     nylaos_agents                    the agents (AgentsPanel owns the list)
     nylaos_nb_folders / _nb_pages    reports: folder "Agent Reports", pages
                                      carry agentId and agentName
     nylaos_chat_history              chats, as before (saveChatSession)
     nyla_agent_hub_agent / _tab      picked agent and tab (this device only)

   Loads before the main app script: the top level must not touch app
   globals (C, toast, callClaude...). Only function bodies can. Every
   top-level name is agentHub_ / AgentHub / AGENT_HUB_, plus AgentChatPanel,
   useAgentChat and AgentSettingsForm. */

/* ── Quick prompts (Chat) and suggested topics (Workstation) ── */
// Keyed by the default agents' ids (DEFAULT_AGENTS in the main script), so a
// renamed default keeps its prompts. Custom agents get the generic ones.
const AGENT_HUB_PROMPTS = {
  1:  ["What should I focus on this week?", "Which venture needs me most right now?", "What's slipping across my tasks and goals?", "Plan my week around my cycle phase"],
  2:  ["Plan my day from my tasks and calendar", "Turn today's Morning Brief into a plan", "Add a task to call the pharmacy tomorrow", "Give me a gentle evening reset checklist"],
  3:  ["What does my week look like?", "Find time for three deep-work blocks this week", "Add a weekly Semester HQ planning session on Mondays", "What's coming up in the next two weeks?"],
  4:  ["Move everything overdue to next week except Semester HQ", "What are my top 3 tasks today?", "Break my biggest task into small steps", "Which tasks can I drop or push back?"],
  7:  ["Research the market for an herbal pharmacy", "What's trending in student productivity apps?", "Compare three competitors for Lunar Love", "What should I know before launching a new product?"],
  8:  ["Plan this week's content across my brands", "Give me content pillars for my personal brand", "Turn one idea into five posts", "What content fits my current cycle phase?"],
  9:  ["Write three TikTok hooks for Semester HQ", "Draft an Instagram caption for Lunar Love", "Build me a posting schedule for this week", "Which platform should I focus on right now?"],
  10: ["What's the next milestone for Semester HQ?", "Help me rank my ventures for this quarter", "Turn the herbal pharmacy idea into a launch plan", "What should I stop doing so I can grow faster?"],
  11: ["Help me set a monthly budget", "What will my business costs look like each month?", "How should I price a new product?", "Plan how to save up for a big goal"],
  12: ["Sum up each of my brands' voices in one line", "Is my personal brand consistent across platforms?", "Give me a mood board direction for Lunar Love", "How should Semester HQ sound on social?"],
  13: ["Which idea in my Idea Bank is most worth pursuing?", "Turn my newest idea into a plan", "Stress-test an idea for me", "Combine two of my ideas into one offer"],
  14: ["Draft a one-page overview of Semester HQ", "Write up meeting notes from what I tell you", "Turn my brain dump into a clean note", "Save a checklist to my Notebook"],
  15: ["Plan a relaxing weekend getaway", "Make a packing list for a 5-day trip", "Plan a work trip around my cycle", "Add my trip dates to the calendar"],
  16: ["What should I read next?", "Pull the key lessons from what I'm reading:", "Make me a reading plan for this month", "How can I use what I'm reading in my businesses?"],
  17: ["How are my habits trending?", "Which habit should I focus on this week?", "Adjust my habits for my cycle phase", "Design a morning routine I'll actually keep"],
  18: ["What's the status of my projects?", "Break my next project into milestones", "What's blocking my projects right now?", "Plan the next two weeks of Semester HQ work"],
  19: ["Give me content ideas for this moon phase", "Plan a new crystal collection drop", "How can Lunar Love grow on Instagram?", "Write descriptions for three crystals"],
  20: ["Plan Halo House's next community event", "How do I grow the Halo House community?", "Give me creative brand ideas for Halo House", "Draft an event announcement"],
  21: ["Give me compliant marketing ideas for Love Sativa", "How should Love Sativa be positioned?", "Plan Love Sativa's first product line", "Which compliance rules should I keep in mind?"],
  22: ["Plan a seasonal collection", "How should I price home & living products?", "Which products should lead the storefront?", "Write a collection description"],
  23: ["Outline a hybrid Montessori curriculum", "How would I find the first families?", "What would a weekly program look like?", "What do I need in place before launching?"],
  24: ["What products should the Mommy & Me Market start with?", "How do I build a community of moms?", "Plan the Mommy & Me Market launch", "Where could I source products?"],
  25: ["Design a 6-week Mommy & Me Fitness program", "How do I keep members coming back?", "What instructors would I need?", "Plan a free intro class"],
  26: ["What should I post on my personal brand this week?", "Find partnerships that fit me", "Plan a YouTube series about building my ventures", "How do I grow my personal brand?"],
  27: ["Who should I follow up with this week?", "Remind me to check in with someone", "Help me write a thoughtful follow-up message", "Log someone I just met"],
  28: ["Here's my brain dump, sort it for me:", "Turn these thoughts into tasks:", "What in my head is actually urgent?", "Sort this into tasks, events and ideas:"],
};
const AGENT_HUB_TOPICS = {
  1:  ["Weekly priorities brief across every venture", "Monthly review: what moved, what stalled, what's next", "Cycle-synced plan for the next four weeks"],
  2:  ["My ideal weekly routine, synced to my cycle", "Life admin checklist for this month"],
  3:  ["Next month's calendar plan with focus blocks and rest days", "Time-blocking template for my ventures and school"],
  4:  ["Task triage: what to do, move, hand off or drop", "This week's task plan by venture"],
  7:  ["Market research brief for the herbal pharmacy idea", "Competitor landscape for Semester HQ", "Trends that matter to my ventures this year"],
  8:  ["30-day content plan across my brands", "Content pillars and repeatable formats for every venture"],
  9:  ["Two-week posting calendar with hooks and captions", "Platform playbook for TikTok, Instagram, YouTube and Pinterest"],
  10: ["Quarterly plan across all my ventures", "Launch plan for the herbal pharmacy", "Semester HQ growth plan for the next 90 days"],
  11: ["Personal and business budget for next month", "Pricing and cost breakdown for a new product"],
  12: ["Brand voice guide across all my ventures", "Brand refresh brief for my personal brand"],
  13: ["From idea to plan: the strongest idea in my Idea Bank", "Idea scoring: which ideas to pursue, park or drop"],
  14: ["One-page overview of Semester HQ", "My weekly planning routine, written as a step-by-step guide"],
  15: ["Itinerary for my next trip", "Travel prep and packing checklist"],
  16: ["Reading plan for the next three months", "Lessons from what I'm reading, applied to my life and work"],
  17: ["Habit review: what's working and what to change", "Cycle-synced habit plan for the month"],
  18: ["Project plan with milestones and deadlines", "Status report across all my projects"],
  19: ["Lunar Love growth plan for next quarter", "New moon product drop plan"],
  20: ["Community event plan for Halo House", "Halo House brand and community strategy"],
  21: ["Love Sativa positioning and compliant marketing plan", "Love Sativa launch roadmap"],
  22: ["Seasonal collection plan", "Storefront merchandising plan"],
  23: ["Montessori Hybrid Academy program design", "Plan for finding the first families"],
  24: ["Mommy & Me Market launch plan", "Product sourcing and assortment plan"],
  25: ["Mommy & Me Fitness class program", "Member growth and retention plan"],
  26: ["Personal brand growth plan", "Partnership and brand deal pitch kit"],
  27: ["Relationship follow-up plan for this month", "Networking plan for my ventures"],
  28: ["Weekly brain dump review", "Clearing my mental load: a reset plan"],
};
const AGENT_HUB_GENERIC_PROMPTS = ["What can you help me with?", "What should I focus on today?", "Give me three quick wins for this week"];
const AGENT_HUB_GENERIC_TOPICS = ["A status report on my current work", "A plan for the next two weeks"];

// Added to a Workstation report's system prompt (the Prompt tab shows it too).
const AGENT_HUB_WRITING_STANDARD = `

WRITING STANDARD (this reply becomes a page in Nyla's Notebook, folder "Agent Reports")
- Write the finished document, not an outline and not a reply about it. No preamble ("Sure, here's..."), no sign-off.
- Don't repeat the title as a heading: the page already has it.
- Open with two to four plain sentences that give the answer or recommendation up front.
- Organize with ## headings and ### subheadings. Short paragraphs. Bullet lists for sets, numbered lists for steps.
- Make it hers: use her tasks, goals, ventures, calendar, habits and cycle phase from the context above wherever they matter, and put real dates on plans.
- Plain, warm, direct language. No filler and no hype. Bold only the few phrases a skimmer must catch.
- Where you don't have a figure or fact, say so and how to find it. Never invent numbers, quotes, customers or results.
- End with a short "Next steps" section of concrete actions.
- Markdown only: headings, paragraphs, **bold**, *italics*, lists and links. No tables, no HTML, and don't wrap the document in a code block.
- Aim for 800 to 2,000 words unless the topic is genuinely small.`;

const AGENT_HUB_TABS = [
  { key:'chat',        label:'Chat',        icon:'💬' },
  { key:'workstation', label:'Workstation', icon:'🛠️' },
  { key:'prompt',      label:'Prompt',      icon:'📜' },
  { key:'settings',    label:'Settings',    icon:'⚙️' },
];
const AGENT_HUB_FOLDER = 'Agent Reports';
const AGENT_HUB_COLORS = ['#F2C4CE', '#E8E0F5', '#D4EED8', '#CBE8F5', '#FFF9C4', '#FFE0B2'];

/* ── Small helpers ── */
const agentHub_lsGet = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
const agentHub_lsSet = (key, value) => { try { localStorage.setItem(key, value); } catch (e) {} };
const agentHub_readList = key => {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
};
const agentHub_readObj = (key, fallback) => {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (e) { return fallback; }
};
/* The DEFAULT_AGENTS entry this agent came from, or null for her own agents.
   Not by id alone: before Jul 30 the defaults had other ids (1 Personal Assistant,
   2 Task Manager, 3 Lunar Love Strategist, ...), and an old saved list would otherwise
   get another agent's chips and topics, an "edited" badge, and a Reset that swaps in
   the wrong prompt. The id counts only while the agent still looks like that default
   (same name, prompt, role or emoji); otherwise a default with the same name. */
const agentHub_defaultFor = agent => {
  if (!agent || typeof DEFAULT_AGENTS === 'undefined' || !Array.isArray(DEFAULT_AGENTS)) return null;
  const byId = DEFAULT_AGENTS.find(d => d && d.id === agent.id);
  if (byId && (byId.name === agent.name || byId.systemPrompt === agent.systemPrompt || byId.role === agent.role || byId.emoji === agent.emoji)) return byId;
  return DEFAULT_AGENTS.find(d => d && d.name && d.name === agent.name) || null;
};
const agentHub_isDefault = agent => !!agentHub_defaultFor(agent);
/* Role prompts. When js/agent-prompts.jsx is loaded, a default agent's role prompt
   is its persona there and her own version is saved as agent.promptOverride, and the
   full system prompt is nylaAgentSystemPrompt(agent) (persona + team principles +
   profile facts). Without it, the role prompt is agent.systemPrompt, as before. */
const agentHub_layered = () => typeof nylaAgentPersona === 'function' && typeof nylaAgentSystemPrompt === 'function';
// The prompt this default agent shipped with, or null for a custom agent.
const agentHub_original = agent => {
  const d = agentHub_defaultFor(agent);
  if (!d) return null;
  if (agentHub_layered() && typeof NYLA_AGENT_ROLES !== 'undefined' && NYLA_AGENT_ROLES[d.id] && NYLA_AGENT_ROLES[d.id].persona) return NYLA_AGENT_ROLES[d.id].persona;
  return d.systemPrompt || null;
};
// What the agent is told about its role right now (what the Prompt tab edits).
const agentHub_rolePrompt = agent => String((agentHub_layered() ? nylaAgentPersona(agent) : agent.systemPrompt) || '');
// The agent with a new role prompt, stored where the prompt code reads it.
const agentHub_withRolePrompt = (agent, text) => {
  if (!agentHub_layered()) return { ...agent, systemPrompt:text };
  const o = agentHub_original(agent);
  if (o == null) return { ...agent, systemPrompt:text, promptOverride:undefined };
  const next = { ...agent };
  if (String(text).trim() === String(o).trim()) delete next.promptOverride; else next.promptOverride = text;
  return next;
};
// Everything before the live context: the role prompt, plus the shared layers when they exist.
const agentHub_systemBase = agent => agentHub_layered() ? nylaAgentSystemPrompt(agent) : String(agent.systemPrompt || '');
const agentHub_isEdited = agent => {
  const o = agentHub_original(agent);
  return o != null && agentHub_rolePrompt(agent).trim() !== String(o).trim();
};
const agentHub_prompts = agent => { const d = agentHub_defaultFor(agent); return (d && AGENT_HUB_PROMPTS[d.id]) || AGENT_HUB_GENERIC_PROMPTS; };
const agentHub_topics = agent => { const d = agentHub_defaultFor(agent); return (d && AGENT_HUB_TOPICS[d.id]) || AGENT_HUB_GENERIC_TOPICS; };
const agentHub_words = s => (String(s || '').trim().match(/\S+/g) || []).length;
const agentHub_day = key => new Date(key + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });

/* ── What agents get beyond buildAgentContext ─────────────────────────
   Her cycle phase, the next two weeks of calendar, habits, newest ideas and
   today's Morning Brief plan, so the quick prompts ("plan my week around my
   cycle", "how are my habits trending?") have something to work from. */
const agentHub_moreContext = () => {
  const out = [];
  let today = '';
  try { today = toDateKey(); } catch (e) { return ''; }
  try {
    const c = typeof getCycleForDate === 'function' ? getCycleForDate(new Date()) : null;
    if (c && c.name) {
      const fit = typeof energyPhaseNames === 'function' ? energyPhaseNames(c.name) : '';
      out.push(`Cycle today: ${c.name} phase, day ${c.day} of about ${c.cycleLength}` +
        (c.late ? ` (period ${c.late} day${c.late === 1 ? '' : 's'} late)` : '') +
        (c.stale ? ' (an estimate: her period log is out of date)' : '') + '.' +
        (fit ? ` Work that fits this phase: ${fit}.` : ''));
    }
  } catch (e) {}
  try {
    const end = toDateKey(new Date(Date.now() + 14 * 86400000));
    const inRange = d => typeof d === 'string' && d >= today && d <= end;
    const items = [
      ...agentHub_readList('nylaos_events').filter(e => e && inRange(e.date)).map(e => ({ date:e.date, time:e.time || '', text:e.text })),
      ...agentHub_readList('nylaos_tasks').filter(t => t && t.source === 'calendar' && inRange(t.calendarDate)).map(t => ({ date:t.calendarDate, time:'', text:t.text })),
    ].filter(x => String(x.text || '').trim())
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 30);
    out.push(items.length
      ? `Calendar, next 14 days:\n${items.map(x => `- ${agentHub_day(x.date)}${x.time ? ' ' + x.time : ''}: ${String(x.text).slice(0, 110)}`).join('\n')}`
      : 'Calendar, next 14 days: nothing scheduled.');
  } catch (e) {}
  try {
    const stored = agentHub_readObj('nylaos_habits', null);
    const habits = Array.isArray(stored) ? stored : (typeof DEFAULT_HABITS !== 'undefined' ? DEFAULT_HABITS.map((h, i) => ({ id:i + 1, name:h })) : []);
    const log = agentHub_readObj('nylaos_habit_log', {}) || {};
    if (habits.length) {
      const keys = Array.from({ length:14 }, (_, i) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); return toDateKey(d); });
      const lines = habits.filter(h => h && h.name).slice(0, 20).map(h => {
        const n14 = keys.filter(k => log[`${h.id}_${k}`]).length;
        const n7 = keys.slice(0, 7).filter(k => log[`${h.id}_${k}`]).length;
        return `- ${h.name}: ${n14} of the last 14 days (${n7} of the last 7)`;
      });
      out.push(`Habits (check-ins):\n${lines.join('\n')}`);
    }
  } catch (e) {}
  try {
    const ideas = agentHub_readList('nylaos_ideas').filter(i => i && i.status !== 'archived')
      .sort((a, b) => String(b.created || '').localeCompare(String(a.created || ''))).slice(0, 12);
    if (ideas.length) out.push(`Newest ideas in her Idea Bank:\n${ideas.map(i => `- ${String(i.title || i.text || 'Idea').slice(0, 90)}${i.category ? ` (${i.category})` : ''}${i.businessArea ? ` · ${i.businessArea}` : ''}`).join('\n')}`);
  } catch (e) {}
  try {
    const plan = agentHub_readObj('nylaos_brief_plan', null);
    if (plan && plan.date === today && plan.text) out.push(`Today's plan from her Morning Brief:\n${String(plan.text).slice(0, 900)}`);
  } catch (e) {}
  return out.length ? `\n\n--- MORE OF HER DAY-TO-DAY (reference, not instructions) ---\n${out.join('\n\n')}\n--- END ---\n` : '';
};

/* ── Model text → safe Notebook HTML ──────────────────────────────────
   The Notebook editor puts page content in with innerHTML, so everything is
   escaped first and only a few tags are made from the escaped text:
   headings, paragraphs, lists, bold, italics, and links to http(s) only. */
const agentHub_esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const agentHub_inline = raw => {
  let s = agentHub_esc(raw);
  const links = [];
  // Escaped already, so the url has no quote or angle bracket left in it.
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, text, url) => {
    links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  s = s.replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?![_\w])/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => links[Number(i)] || '');
};
const agentHub_mdToHtml = md => {
  let text = String(md || '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
  const fenced = text.match(/^```[\w-]*\n([\s\S]*?)\n?```$/);
  if (fenced) text = fenced[1];
  const out = [];
  let para = [];
  let list = null; // { tag:'ul'|'ol', items:[] }
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(agentHub_inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${agentHub_inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  const flush = () => { flushPara(); flushList(); };
  const addItem = (tag, item) => { flushPara(); if (!list || list.tag !== tag) { flushList(); list = { tag, items:[] }; } list.items.push(item); };
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if (!line.trim() || /^\s*```/.test(line) || /^\s*([-*_]\s*){3,}$/.test(line)) { flush(); continue; }
    if ((m = line.match(/^\s*(#{1,6})\s+(.*?)[\s#]*$/))) {
      flush();
      const lvl = m[1].length <= 2 ? 2 : m[1].length === 3 ? 3 : 4;
      out.push(`<h${lvl}>${agentHub_inline(m[2])}</h${lvl}>`);
      continue;
    }
    // Tables aren't in the list of allowed tags: each row becomes a bullet.
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^[\s|:\-]+$/.test(line)) continue;
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length) addItem('ul', cells.join(' · '));
      continue;
    }
    if ((m = line.match(/^\s*[-*+•]\s+(.*)$/))) { addItem('ul', m[1]); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { addItem('ol', m[1]); continue; }
    // An indented line under a list item carries on that item.
    if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
    flushList();
    para.push(line.replace(/^\s*>\s?/, '').trim());
  }
  flush();
  return out.join('') || '<p><br></p>';
};

/* ── Reports saved to the Notebook ── */
const agentHub_reportsFolder = () => {
  // agentEditLoadFolders keeps the Notebook's four default folders when none are saved yet.
  const folders = typeof agentEditLoadFolders === 'function' ? agentEditLoadFolders() : agentHub_readList('nylaos_nb_folders');
  let folder = folders.find(f => f && f.name === AGENT_HUB_FOLDER);
  if (!folder) {
    folder = { id:Date.now(), name:AGENT_HUB_FOLDER, icon:'🤖', parentId:null };
    localStorage.setItem('nylaos_nb_folders', JSON.stringify([...folders, folder]));
  }
  return folder;
};
const agentHub_saveReport = (agent, title, reply) => {
  const folder = agentHub_reportsFolder();
  const now = new Date();
  const byline = `<p><em>Written by ${agentHub_esc(agent.name)} · ${agentHub_esc(now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }))}</em></p>`;
  const id = Date.now() + Math.floor(Math.random() * 1000);
  const page = {
    id, name:String(title).slice(0, 140), folderId:folder.id, content:byline + agentHub_mdToHtml(reply),
    created:now.toISOString(), updated:now.toISOString(), agentId:agent.id, agentName:agent.name,
  };
  localStorage.setItem('nylaos_nb_pages', JSON.stringify([page, ...agentHub_readList('nylaos_nb_pages')]));
  if (!agentHub_readList('nylaos_nb_pages').some(p => p && p.id === id)) throw new Error('The report was written but could not be saved. Storage may be full.');
  return page;
};
const agentHub_reportsFor = agent => agentHub_readList('nylaos_nb_pages')
  .filter(p => p && p.agentId != null && String(p.agentId) === String(agent.id))
  .sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
const agentHub_openPage = page => {
  localStorage.setItem('nylaos_nb_open_request', String(page.id));
  if (window._navigateTo) window._navigateTo('notebook', AGENT_HUB_FOLDER);
};

/* ── One chat per agent, kept outside React ── */
const agentHub_chats = {};
const agentHub_greeting = agent => ({ role:'assistant', text:`Hi Nyla! I'm your ${agent.name}. How can I help you today? ✦` });
const agentHub_entry = agent => {
  const k = String(agent && agent.id);
  if (!agentHub_chats[k]) agentHub_chats[k] = {
    msgs:[agentHub_greeting(agent)], pendingPlan:null, undone:[], sessionId:null, gen:0, draft:'',
    loading:false, errorState:false, justCompleted:false, doneTimer:null, report:null, subs:new Set(),
  };
  return agentHub_chats[k];
};
const agentHub_patch = (entry, patch) => {
  Object.assign(entry, patch);
  entry.subs.forEach(fn => { try { fn(); } catch (e) {} });
};
// The same states the desk tiles always showed, plus "working" while a report is written.
const agentHub_status = e => e.errorState ? 'error'
  : e.loading ? 'thinking'
  : e.pendingPlan ? (e.pendingPlan.steps.some(s => s.status === 'needs_info') ? 'needs_information' : 'waiting_approval')
  : e.report ? 'working'
  : e.justCompleted ? 'completed'
  : 'available';
const useAgentChat = agent => {
  const entry = agentHub_entry(agent);
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick(n => n + 1);
    entry.subs.add(fn);
    return () => { entry.subs.delete(fn); };
  }, [entry]);
  return entry;
};
// Undo closures and whole plan steps don't belong in saved history (and can't be restored from it).
const agentHub_forHistory = msgs => msgs.map(m => {
  if (!m || !m.batchResults) return m;
  const { batchResults, ...rest } = m;
  return rest;
});
// Starts a send and reports straight away whether it did, so the caller can clear the box.
const agentHub_send = (agent, text, att) => {
  const entry = agentHub_entry(agent);
  const userText = String(text || '').trim();
  const hasFiles = !!(att && att.items && att.items.length);
  if ((!userText && !hasFiles) || entry.loading) return false;
  if (!_fbUser) { toast('Sign in (top right) to use AI', 'error'); return false; }
  if (!entry.sessionId) entry.sessionId = Date.now();
  const sent = hasFiles ? att.take() : [];
  const history = [...entry.msgs, { role:'user', text:userText, photos:sent.length ? sent : undefined }];
  const gen = entry.gen;
  agentHub_patch(entry, { msgs:history, loading:true, errorState:false, justCompleted:false });
  (async () => {
    try {
      const system = agentHub_systemBase(agent) + buildAgentContext(agent.name) + agentHub_moreContext() + AGENT_ACTION_DOCS;
      const reply = await callClaude({ system, messages:await messagesWithPhotos(history), maxTokens:16000, effort:'medium' });
      if (entry.gen !== gen) return;
      const updated = [...entry.msgs, { role:'assistant', text:reply }];
      const rawCmds = parseAgentActions(reply);
      agentHub_patch(entry, { msgs:updated, pendingPlan:rawCmds.length ? { msgIndex:updated.length - 1, steps:buildActionPlan(rawCmds, agent) } : entry.pendingPlan });
      saveChatSession(entry.sessionId, agent.name, 'agent', agentHub_forHistory(updated));
    } catch (e) {
      if (entry.gen !== gen) return;
      agentHub_patch(entry, { errorState:true, msgs:[...entry.msgs, { role:'assistant', text:`⚠️ ${(e && e.message) || 'Something went wrong'}` }] });
    } finally {
      if (entry.gen === gen) agentHub_patch(entry, { loading:false });
    }
  })();
  return true;
};
const agentHub_approve = (agent, approvedSteps, allSteps) => {
  const entry = agentHub_entry(agent);
  if (!entry.pendingPlan) return; // one Approve per plan, even on a double click
  entry.pendingPlan = null;
  const all = allSteps || approvedSteps;
  const results = executeActionPlan(approvedSteps, agent);
  const done = results.filter(r => r.execStatus === 'done');
  const failed = results.filter(r => r.execStatus !== 'done');
  const skipped = all.filter(s => s.status !== 'ready'); // shown as can't-run in the preview
  let summary = done.length ? `✅ Done:\n${done.map(r => '· ' + r.previewLine).join('\n')}` : '';
  if (failed.length) summary += `${summary ? '\n\n' : ''}⚠️ Needs attention:\n${failed.map(r => '· ' + r.previewLine + ' — ' + r.reason).join('\n')}`;
  if (skipped.length) summary += `${summary ? '\n\n' : ''}Skipped:\n${skipped.map(s => '· ' + s.previewLine + (s.note ? ' — ' + s.note : '')).join('\n')}`;
  const msgs = [...entry.msgs, { role:'assistant', text:summary || 'Nothing to do.', batchResults:done.length ? results : null }];
  if (failed.length && !done.length) { agentHub_patch(entry, { msgs, pendingPlan:null, errorState:true }); return; }
  clearTimeout(entry.doneTimer);
  agentHub_patch(entry, { msgs, pendingPlan:null, justCompleted:true, doneTimer:setTimeout(() => agentHub_patch(entry, { justCompleted:false }), 6000) });
};
const agentHub_undo = (agent, msgIdx, results) => {
  const entry = agentHub_entry(agent);
  if (entry.undone.includes(msgIdx)) return;
  entry.undone = [...entry.undone, msgIdx];
  undoActionBatch(results);
  agentHub_patch(entry, { msgs:[...entry.msgs, { role:'assistant', text:agentEditUndoText(results) }] });
};
const agentHub_newChat = agent => {
  const e = agentHub_entry(agent);
  if (e.loading) return;
  agentHub_patch(e, { msgs:[agentHub_greeting(agent)], pendingPlan:null, undone:[], sessionId:null, errorState:false, justCompleted:false, gen:e.gen + 1 });
};
const agentHub_pastChats = agent => agentHub_readList('nylaos_chat_history')
  .filter(s => s && s.type === 'agent' && s.label === agent.name && Array.isArray(s.msgs) && s.msgs.some(m => m && m.role === 'user'))
  .slice(0, 25);
const agentHub_openPast = (agent, sess) => {
  const e = agentHub_entry(agent);
  if (e.loading) return;
  agentHub_patch(e, { msgs:agentHub_forHistory(sess.msgs.filter(m => m && typeof m.text === 'string')), pendingPlan:null, undone:[], sessionId:sess.id, errorState:false, justCompleted:false, gen:e.gen + 1 });
};

/* ── An idea sent over from the Idea Bank ("pick an agent to continue") ── */
const agentHub_peekIdea = () => {
  const c = agentHub_readObj('nylaos_agent_pending_context', null);
  return c && c.source === 'idea' ? c : null;
};
const agentHub_takeIdea = agent => {
  const ctx = agentHub_peekIdea();
  if (!ctx) return false;
  try { localStorage.removeItem('nylaos_agent_pending_context'); } catch (e) {}
  const e = agentHub_entry(agent);
  const body = String(ctx.content || '').trim().slice(0, 1500);
  agentHub_patch(e, { msgs:[...e.msgs, { role:'assistant', text:`I see you shared "${ctx.title}" from your Idea Bank.${body ? `\n\n${body}\n\n` : ' '}What would you like me to do with it — turn it into a task, a notebook page, or something else?` }] });
  return true;
};

/* ── Shared bits of UI ── */
const AgentHubAvatar = ({ agent, size = 36, status }) => {
  const meta = status && status !== 'available' && typeof AGENT_STATUS_META !== 'undefined' ? AGENT_STATUS_META[status] : null;
  return (
    <div style={{ position:'relative', flexShrink:0 }}>
      <div className={status === 'thinking' || status === 'working' ? 'agent-pulse' : ''}
        style={{ '--pulse-color':meta ? `${meta.color}80` : 'transparent', width:size, height:size, borderRadius:Math.round(size * 0.3), background:agent.color || C.lavender,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:Math.round(size * 0.5) }}>{agent.emoji || '🤖'}</div>
      {meta && <div title={meta.label} style={{ position:'absolute', bottom:-2, right:-2, width:Math.max(10, size * 0.3), height:Math.max(10, size * 0.3), borderRadius:'50%', background:meta.color, border:`2px solid ${C.card}` }}/>}
    </div>
  );
};
const AgentHubBadge = ({ children, tone = 'accent', title }) => (
  <span title={title} style={{ fontSize:9.5, fontWeight:600, padding:'1px 7px', borderRadius:8, whiteSpace:'nowrap', letterSpacing:.2,
    background:tone === 'rose' ? `${C.rose}18` : `${C.accent}22`, color:tone === 'rose' ? C.rose : C.accent }}>{children}</span>
);
// The app's dark theme (_dk, set in the main script). Rose text on a pink tint over a
// dark card is nearly unreadable, so soft buttons switch to the card colour there.
const agentHub_dark = () => typeof _dk !== 'undefined' && !!_dk;
const agentHub_softBg = tint => agentHub_dark() ? C.card : tint;
const agentHub_softFg = () => agentHub_dark() ? C.text : C.rose;
const agentHub_btn = (primary, extra = {}) => ({
  padding:'8px 16px', minHeight:36, borderRadius:10, fontSize:13, cursor:'pointer', fontFamily:'inherit',
  background:primary ? C.rose : agentHub_softBg(`${C.pink}60`), color:primary ? '#fff' : agentHub_softFg(), border:primary ? 'none' : `0.5px solid ${C.border}`, ...extra,
});
// A function, not an object: C doesn't exist yet when this file loads.
const agentHub_label = () => ({ fontSize:11, fontWeight:600, color:C.textMuted, textTransform:'uppercase', letterSpacing:.8, marginBottom:8 });

/* ── The chat: embedded in the Hub, or the Office desk popup ── */
// phone: the Hub is in its one-column layout (a phone, or a narrow window).
const AgentChatPanel = ({ agent, embedded = false, onClose, phone = false }) => {
  const entry = useAgentChat(agent);
  const [input, setInputRaw] = useState(() => entry.draft || '');
  const setInput = v => { entry.draft = v; setInputRaw(v); };
  const att = useAttachments();
  const isMobile = useIsMobile() || phone;
  const [full, setFull] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const boxRef = useRef(null);
  // Scroll the message list itself: scrollIntoView would also scroll the page around it.
  useEffect(() => { const b = boxRef.current; if (b) { b.scrollTop = b.scrollHeight; } }, [entry.msgs, entry.loading, entry.pendingPlan, full]);
  const sendInput = () => { if (agentHub_send(agent, input, att)) setInput(''); };
  // Escape closes the full-screen views (the Office desk popup, or fullscreen in the Hub).
  useEffect(() => {
    if (embedded && !full) return;
    const onKey = e => { if (e.key === 'Escape') { if (full) setFull(false); else if (onClose) onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embedded, full, onClose]);

  const msgsView = (<>
    {entry.msgs.map((m, i) => (<React.Fragment key={i}>
      <Bubble m={m}>{m.role === 'assistant' ? <RichReply text={stripAgentCmd(m.text)}/> : null}</Bubble>
      {m.batchResults && !entry.undone.includes(i) && (
        <div style={{ display:'flex', justifyContent:'flex-start' }}>
          <button onClick={() => agentHub_undo(agent, i, m.batchResults)} style={{ marginTop:2, padding:'4px 12px', minHeight:36, borderRadius:8, background:'transparent', border:`0.5px solid ${C.border}`, color:C.textMuted, fontSize:11, cursor:'pointer' }}>↩ Undo this batch</button>
        </div>
      )}
      {entry.pendingPlan && entry.pendingPlan.msgIndex === i && (
        <ActionPreviewPanel plan={entry.pendingPlan.steps} onApprove={(approved, all) => agentHub_approve(agent, approved, all)}
          onCancel={() => agentHub_patch(entry, { pendingPlan:null })}
          onStepsChange={steps => { if (entry.pendingPlan) agentHub_patch(entry, { pendingPlan:{ ...entry.pendingPlan, steps } }); }} />
      )}
    </React.Fragment>))}
    {entry.loading && <TypingDots label={`${agent.name} is thinking`}/>}
  </>);
  const header = close => (
    <div style={{ padding:'12px 18px', borderBottom:`0.5px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, background:C.sidebarBg, flexShrink:0 }}>
      <div style={{ width:34, height:34, borderRadius:10, background:agent.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{agent.emoji}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:500, color:C.rose }}>{agent.name}</div>
        <div style={{ fontSize:11.5, color:C.textLight }}>{agent.role}</div>
      </div>
      <button onClick={close} aria-label="Close" style={{ background:'none', border:'none', fontSize:20, color:C.textMuted, cursor:'pointer', lineHeight:1 }}>✕</button>
    </div>
  );
  const messages = (
    <div ref={boxRef} style={{ flex:1, minHeight:0, overflowY:'auto', padding:'16px 18px', display:'flex', flexDirection:'column', gap:10, background:C.lavLight }}>
      <div style={{ maxWidth:820, width:'100%', margin:'0 auto', display:'flex', flexDirection:'column', gap:10 }}>{msgsView}</div>
    </div>
  );

  // The Office desk popup, as it has always looked.
  if (!embedded) return (
    <div role="dialog" aria-modal="true" aria-label={`Chat with ${agent.name}`} style={{ position:'fixed', inset:0, zIndex:9998, background:C.cream, display:'flex', flexDirection:'column' }}>
      {header(onClose)}
      {messages}
      <ChatComposer value={input} onChange={setInput} onSend={sendInput} loading={entry.loading} att={att} placeholder={`Message ${agent.name}…`}/>
    </div>
  );

  const past = showPast ? agentHub_pastChats(agent) : [];
  const small = { padding:'5px 12px', minHeight:32, borderRadius:16, border:`0.5px solid ${C.border}`, background:'transparent', color:C.textLight, fontSize:12, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' };
  return (
    <div style={full ? { position:'fixed', inset:0, zIndex:9998, background:C.cream, display:'flex', flexDirection:'column' }
      : { flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
      {full && header(() => setFull(false))}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderBottom:`0.5px solid ${C.border}`, background:C.card, flexShrink:0, flexWrap:'wrap' }}>
        <button onClick={() => setShowPast(s => !s)} aria-expanded={showPast} style={{ ...small, background:showPast ? `${C.accent}20` : 'transparent', color:showPast ? C.accent : C.textLight }}>🕘 Past chats</button>
        <button onClick={() => { agentHub_newChat(agent); setShowPast(false); }} disabled={entry.loading} style={{ ...small, opacity:entry.loading ? .5 : 1 }}>＋ New chat</button>
        <span style={{ flex:1 }}/>
        {!isMobile && <span style={{ fontSize:11, color:C.textMuted }}>Nothing runs until you approve it</span>}
      </div>
      {showPast && (
        <div style={{ maxHeight:220, overflowY:'auto', padding:'8px 14px', borderBottom:`0.5px solid ${C.border}`, background:C.card, flexShrink:0 }}>
          {past.length === 0 && <div style={{ fontSize:12, color:C.textMuted, fontStyle:'italic', padding:'4px 0' }}>No saved chats with {agent.name} yet. Chats save once you send a message.</div>}
          {past.map(s => {
            const first = (s.msgs.find(m => m && m.role === 'user') || {}).text || '';
            const current = s.id === entry.sessionId;
            return (
              <button key={s.id} onClick={() => { agentHub_openPast(agent, s); setShowPast(false); }} disabled={entry.loading}
                style={{ display:'flex', gap:10, alignItems:'baseline', width:'100%', textAlign:'left', padding:'7px 8px', borderRadius:9, border:'none', cursor:'pointer', fontFamily:'inherit',
                  background:current ? `${C.pink}45` : 'transparent', color:C.text }}>
                <span style={{ fontSize:11, color:C.textMuted, flexShrink:0, width:62 }}>{new Date(s.date).toLocaleDateString('en-US', { month:'short', day:'numeric' })}</span>
                <span style={{ fontSize:12.5, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{first || 'Photo or file'}</span>
                {current && <AgentHubBadge tone="rose">open</AgentHubBadge>}
              </button>
            );
          })}
        </div>
      )}
      {messages}
      <div style={{ display:'flex', gap:6, padding:'9px 12px 7px', borderTop:`0.5px solid ${C.border}`, background:C.cream, flexShrink:0,
        flexWrap:isMobile ? 'nowrap' : 'wrap', overflowX:isMobile ? 'auto' : 'visible', WebkitOverflowScrolling:'touch' }}>
        {agentHub_prompts(agent).map(p => (
          <button key={p} onClick={() => { if (/:$/.test(p)) setInput(p + ' '); else agentHub_send(agent, p, att); }} disabled={entry.loading}
            style={{ flexShrink:0, padding:'6px 12px', borderRadius:16, border:`0.5px solid ${C.border}`, background:agentHub_softBg(`${C.pink}45`), color:agentHub_softFg(), fontSize:12, lineHeight:1.3,
              cursor:entry.loading ? 'default' : 'pointer', opacity:entry.loading ? .55 : 1, whiteSpace:'nowrap', fontFamily:'inherit' }}>✦ {p}</button>
        ))}
      </div>
      <div className="agent-hub-composer">
        <ChatComposer value={input} onChange={setInput} onSend={sendInput} loading={entry.loading} att={att} placeholder={`Message ${agent.name}…`}
          extra={!full && !isMobile && <button onClick={() => setFull(true)} title="Fullscreen" aria-label="Fullscreen" style={{ width:36, height:36, borderRadius:'50%', background:'transparent', border:`0.5px solid ${C.border}`, color:C.textMuted, fontSize:13, cursor:'pointer', flexShrink:0 }}>⤢</button>}/>
      </div>
    </div>
  );
};

/* ── The agent form: New agent, and the Settings tab ── */
const agentHub_blankForm = () => ({ name:'', role:'', emoji:'🤖', color:'#E8E0F5', systemPrompt:'', businessAssignment:'', folderAccess:[], autoApprove:false, permissions:{ canCreate:true, canEdit:true, canDelete:true } });
const agentHub_formFrom = a => {
  const blank = agentHub_blankForm();
  if (!a) return blank;
  return { ...blank, name:a.name || '', role:a.role || '', emoji:a.emoji || '🤖', color:a.color || blank.color, systemPrompt:a.systemPrompt || '',
    businessAssignment:a.businessAssignment || '', folderAccess:Array.isArray(a.folderAccess) ? a.folderAccess : [], autoApprove:!!a.autoApprove,
    permissions:a.permissions || blank.permissions };
};
// showPrompt: include the system prompt (new agents); the Hub edits it in the Prompt tab instead.
const AgentSettingsForm = ({ initial, showPrompt = false, submitLabel = 'Save', onSubmit, onCancel, cancelLabel = 'Cancel' }) => {
  const [form, setForm] = useState(() => agentHub_formFrom(initial));
  const notebookFolders = agentHub_readList('nylaos_nb_folders');
  const ventures = typeof VENTURES !== 'undefined' ? VENTURES : [];
  const toggleFormFolder = name => setForm(f => ({ ...f, folderAccess:f.folderAccess.includes(name) ? f.folderAccess.filter(x => x !== name) : [...f.folderAccess, name] }));
  const submit = () => {
    if (!form.name.trim()) { toast('Give the agent a name first', 'error'); return; }
    const out = { ...form, name:form.name.trim(), role:form.role.trim() };
    if (!showPrompt) delete out.systemPrompt;
    onSubmit(out);
  };
  const lbl = { display:'flex', alignItems:'center', gap:6, fontSize:12, color:C.textLight, cursor:'pointer', minHeight:32 };
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        <InlineInput value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji:e.target.value }))} placeholder="Emoji" aria-label="Emoji" style={{ width:64, minWidth:0, textAlign:'center' }}/>
        <InlineInput value={form.name} onChange={e => setForm(f => ({ ...f, name:e.target.value }))} placeholder="Agent name" aria-label="Agent name" style={{ flex:'1 1 150px', minWidth:0 }}/>
        <InlineInput value={form.role} onChange={e => setForm(f => ({ ...f, role:e.target.value }))} placeholder="Role description" aria-label="Role description" style={{ flex:'2 1 200px', minWidth:0 }}/>
      </div>
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:12, color:C.textLight }}>Color:</span>
        {AGENT_HUB_COLORS.map(col => (
          <button key={col} type="button" onClick={() => setForm(f => ({ ...f, color:col }))} aria-label={`Color ${col}`} style={{ width:26, height:26, borderRadius:'50%', background:col, border:`2.5px solid ${form.color === col ? C.rose : 'transparent'}`, cursor:'pointer' }}/>
        ))}
        <span style={{ display:'flex', alignItems:'center', gap:6, marginLeft:6 }}>
          <span style={{ width:30, height:30, borderRadius:9, background:form.color, display:'grid', placeItems:'center', fontSize:15 }}>{form.emoji || '🤖'}</span>
          <span style={{ fontSize:11, color:C.textMuted }}>preview</span>
        </span>
      </div>
      {showPrompt && <TextArea value={form.systemPrompt} height={110} placeholder="System prompt — who is this agent and how should it behave?"
        onChange={e => setForm(f => ({ ...f, systemPrompt:e.target.value }))}/>}

      <div style={{ borderTop:`0.5px solid ${C.border}`, paddingTop:10, marginTop:2 }}>
        <div style={{ fontSize:11, fontWeight:600, color:C.rose, marginBottom:8, letterSpacing:0.3, textTransform:'uppercase' }}>Permissions & Assignment</div>
        <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:C.textLight }}>Business desk:</span>
          <select value={form.businessAssignment} onChange={e => setForm(f => ({ ...f, businessAssignment:e.target.value }))}
            style={{ padding:'5px 8px', minHeight:32, borderRadius:8, border:`0.5px solid ${C.border}`, background:C.card, color:C.text, fontSize:12, maxWidth:'100%' }}>
            <option value="">None (your team / cross-business)</option>
            {ventures.map(v => <option key={v} value={v}>{v}</option>)}
            {form.businessAssignment && !ventures.includes(form.businessAssignment) && <option value={form.businessAssignment}>{form.businessAssignment}</option>}
          </select>
          <label style={lbl}>
            <input type="checkbox" checked={form.autoApprove} onChange={e => setForm(f => ({ ...f, autoApprove:e.target.checked }))}/>
            Auto-approve single-item actions
          </label>
        </div>
        <div style={{ display:'flex', gap:12, marginBottom:8, flexWrap:'wrap' }}>
          <label style={lbl}>
            <input type="checkbox" checked={!!form.permissions.canCreate} onChange={e => setForm(f => ({ ...f, permissions:{ ...f.permissions, canCreate:e.target.checked } }))}/> Can create
          </label>
          <label style={lbl}>
            <input type="checkbox" checked={!!form.permissions.canEdit} onChange={e => setForm(f => ({ ...f, permissions:{ ...f.permissions, canEdit:e.target.checked } }))}/> Can edit
          </label>
          <label style={lbl} title="Lets this agent move tasks to Recently Deleted after you approve. Agents never delete anything permanently.">
            <input type="checkbox" checked={!!form.permissions.canDelete} onChange={e => setForm(f => ({ ...f, permissions:{ ...f.permissions, canDelete:e.target.checked } }))}/> Can delete <span style={{ fontSize:11 }}>(to Recently Deleted)</span>
          </label>
        </div>
        {notebookFolders.length > 0 && (<>
          <div style={{ fontSize:11, color:C.textLight, marginBottom:5 }}>Notebook folder access (none checked = all folders):</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {notebookFolders.filter(f => f && f.name).map(f => (
              <button key={f.id} onClick={() => toggleFormFolder(f.name)} type="button" style={{ padding:'3px 9px', minHeight:28, borderRadius:7, fontSize:10.5, cursor:'pointer',
                background:form.folderAccess.includes(f.name) ? `${C.accent}30` : 'transparent', border:`0.5px solid ${form.folderAccess.includes(f.name) ? C.accent : C.border}`, color:form.folderAccess.includes(f.name) ? C.accent : C.textMuted }}>{f.icon} {f.name}</button>
            ))}
          </div>
        </>)}
      </div>

      <div style={{ display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap' }}>
        {onCancel && <button onClick={onCancel} style={agentHub_btn(false)}>{cancelLabel}</button>}
        <button onClick={submit} style={agentHub_btn(true, { padding:'8px 20px' })}>{submitLabel}</button>
      </div>
    </div>
  );
};

/* ── Workstation tab ── */
const AgentHubWorkstation = ({ agent }) => {
  const entry = useAgentChat(agent); // re-renders while a report is being written
  const topics = agentHub_topics(agent);
  const [topic, setTopic] = useState('');
  const [, setRev] = useState(0);
  const [, setClock] = useState(0);
  const job = entry.report;
  useEffect(() => {
    if (!job) return undefined;
    const id = setInterval(() => setClock(n => n + 1), 1000);
    return () => { clearInterval(id); };
  }, [job]);
  const docs = agentHub_reportsFor(agent);

  const generate = async () => {
    const t = (topic.trim() || topics[0] || '').trim();
    if (!t || entry.report) return;
    if (!_fbUser) { toast('Sign in (top right) to use AI', 'error'); return; }
    agentHub_patch(entry, { report:{ topic:t, startedAt:Date.now() }, unsavedReport:null });
    let reply = null;
    try {
      const system = agentHub_systemBase(agent) + buildAgentContext(agent.name) + agentHub_moreContext() + AGENT_HUB_WRITING_STANDARD;
      reply = await callClaude({ system, messages:[{ role:'user', content:`Write the document: "${t}"` }], maxTokens:12000, effort:'medium' });
      agentHub_saveReport(agent, t, reply);
      setTopic(''); setRev(r => r + 1);
      toast(`${agent.name} saved “${t}” to ${AGENT_HUB_FOLDER} ✓`, 'success', 3200);
    } catch (e) {
      // Written but not saved (storage full, say): keep the text so minutes of writing aren't lost.
      if (reply != null && String(reply).trim()) {
        agentHub_patch(entry, { unsavedReport:{ topic:t, text:String(reply) } });
        toast('The report was written but could not be saved to the Notebook. Download it below.', 'error', 6000);
      } else {
        toast((e && e.message) || 'Could not write that report. Try again.', 'error', 5000);
      }
    } finally {
      agentHub_patch(entry, { report:null });
    }
  };
  const secs = job ? Math.max(0, Math.floor((Date.now() - job.startedAt) / 1000)) : 0;
  const small = { padding:'5px 10px', minHeight:32, borderRadius:9, background:agentHub_softBg(`${C.lavender}60`), border:`0.5px solid ${C.border}`, color:agentHub_softFg(), fontSize:11, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0 };
  return (
    <div>
      <style>{`@keyframes agentHubSlide{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}`}</style>
      <div style={agentHub_label()}>Write a report</div>
      <div style={{ padding:'18px', borderRadius:18, border:`0.5px solid ${C.border}`, background:`linear-gradient(135deg, ${C.lavender}35, ${C.pink}28)`, marginBottom:22 }}>
        <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:18, color:C.rose, marginBottom:4 }}>✦ Ask {agent.name} to write one</div>
        <div style={{ fontSize:12.5, color:C.textLight, lineHeight:1.55, marginBottom:12 }}>
          Pick a topic or write your own. {agent.name} writes the whole thing in one go, using your tasks, goals, calendar and cycle, and saves it to your Notebook in “{AGENT_HUB_FOLDER}”.
        </div>
        <InlineInput value={topic} onChange={e => setTopic(e.target.value)} disabled={!!job} aria-label="Report topic"
          onKeyDown={e => { if (e.key === 'Enter') generate(); }}
          placeholder={`e.g. ${topics[0] || 'A plan for the next two weeks'}`} style={{ width:'100%', boxSizing:'border-box', background:C.card }}/>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', margin:'10px 0 14px' }}>
          {topics.map(t => (
            <button key={t} onClick={() => setTopic(t)} disabled={!!job}
              style={{ padding:'5px 11px', borderRadius:14, border:`0.5px solid ${topic === t ? C.rose : C.border}`, background:topic === t ? `${C.rose}14` : C.card, color:topic === t ? C.rose : C.textLight, fontSize:11.5, cursor:job ? 'default' : 'pointer', fontFamily:'inherit', textAlign:'left' }}>{t}</button>
          ))}
        </div>
        <button onClick={generate} disabled={!!job} style={agentHub_btn(true, { padding:'9px 20px', opacity:job ? .6 : 1, cursor:job ? 'default' : 'pointer', boxShadow:job ? 'none' : `0 4px 12px ${C.rose}35` })}>
          {job ? 'Writing…' : '✦ Write it'}
        </button>
        {job && (
          <div style={{ marginTop:14 }} aria-live="polite">
            <div style={{ fontSize:12.5, color:C.text, marginBottom:7 }}>✍️ {agent.name} is writing “{job.topic}” · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</div>
            <div style={{ height:6, borderRadius:4, background:`${C.rose}18`, overflow:'hidden' }}>
              <div style={{ width:'40%', height:'100%', borderRadius:4, background:`linear-gradient(90deg, ${C.rose}, ${C.accent})`, animation:'agentHubSlide 1.4s ease-in-out infinite' }}/>
            </div>
            <div style={{ fontSize:11, color:C.textMuted, marginTop:6 }}>A full report usually takes one to three minutes. You can keep working; it saves itself when it's done.</div>
          </div>
        )}
        {!job && entry.unsavedReport && (() => {
          const u = entry.unsavedReport;
          const retry = () => {
            try { agentHub_saveReport(agent, u.topic, u.text); agentHub_patch(entry, { unsavedReport:null }); setRev(r => r + 1); toast(`Saved “${u.topic}” to ${AGENT_HUB_FOLDER} ✓`, 'success', 3200); }
            catch (e) { toast((e && e.message) || 'Still could not save it. Download it instead.', 'error', 5000); }
          };
          return (
            <div role="alert" style={{ marginTop:14, padding:'12px 14px', borderRadius:14, background:C.card, border:`0.5px solid #d05a5a60` }}>
              <div style={{ fontSize:12.5, color:C.text, lineHeight:1.5, marginBottom:10 }}>⚠️ “{u.topic}” was written but couldn't be saved to your Notebook (storage may be full). Download it so it isn't lost.</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button onClick={() => downloadTextFile(`${sanitize(u.topic) || 'report'}.md`, `# ${u.topic}\n\n${u.text}`, 'text/markdown')} style={agentHub_btn(true, { padding:'7px 14px' })}>⬇ Download .md</button>
                <button onClick={retry} style={agentHub_btn(false, { padding:'7px 14px' })}>Try saving again</button>
                <button onClick={() => { if (window.confirm('Throw this report away? It is not saved anywhere.')) agentHub_patch(entry, { unsavedReport:null }); }} style={agentHub_btn(false, { padding:'7px 14px', background:'transparent' })}>Dismiss</button>
              </div>
            </div>
          );
        })()}
      </div>

      <div style={agentHub_label()}>{agent.name}'s documents{docs.length ? ` · ${docs.length}` : ''}</div>
      {docs.length === 0 && <EmptyState icon="📄" title="No reports yet" text={`Reports ${agent.name} writes show up here and in your Notebook under “${AGENT_HUB_FOLDER}”.`}/>}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {docs.map(p => {
          const when = p.created ? new Date(p.created).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '';
          const words = agentHub_words(typeof _htmlToText === 'function' ? _htmlToText(p.content || '') : '');
          return (
            <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:14, background:C.card, border:`0.5px solid ${C.border}` }}>
              <button onClick={() => agentHub_openPage(p)} title="Open in the Notebook"
                style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:10, background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left', fontFamily:'inherit' }}>
                <span style={{ width:34, height:34, borderRadius:10, background:agent.color, display:'grid', placeItems:'center', fontSize:16, flexShrink:0 }}>📄</span>
                <span style={{ minWidth:0 }}>
                  <span style={{ display:'block', fontSize:13, fontWeight:500, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name || 'Untitled report'}</span>
                  <span style={{ display:'block', fontSize:11, color:C.textMuted }}>{when}{words ? ` · ${words.toLocaleString()} words` : ''} · Open →</span>
                </span>
              </button>
              <button onClick={() => downloadAsMarkdown(p.name || 'Report', p.content || '')} title="Download as Markdown" style={small}>⬇ .md</button>
              <button onClick={() => printAsPdf(p.name || 'Report', p.content || '', `${p.agentName || agent.name}${when ? ' · ' + when : ''}`)} title="Download as a PDF" style={small}>📄 PDF</button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ── Prompt tab ── */
const agentHub_promptDrafts = {}; // unsaved edits survive a tab or agent switch
const AgentHubPrompt = ({ agent, onSave }) => {
  const k = String(agent.id);
  const saved = agentHub_rolePrompt(agent);
  const [draft, setDraftRaw] = useState(() => agentHub_promptDrafts[k] != null ? agentHub_promptDrafts[k] : saved);
  const setDraft = v => { agentHub_promptDrafts[k] = v; setDraftRaw(v); };
  const [showMore, setShowMore] = useState(false);
  const taRef = useRef(null);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    const sc = ta.closest('[data-hub-scroll]');
    const top = sc ? sc.scrollTop : 0;
    ta.style.height = 'auto';
    ta.style.height = Math.max(200, ta.scrollHeight + 2) + 'px';
    if (sc) { sc.scrollTop = top; }
  }, [draft]);
  const original = agentHub_original(agent);
  const edited = agentHub_isEdited(agent);
  const dirty = draft !== saved;
  const save = () => {
    const v = draft.trim();
    if (!v) { toast('The prompt can’t be empty', 'error'); return; }
    onSave(agentHub_withRolePrompt(agent, v));
    delete agentHub_promptDrafts[k];
    setDraftRaw(v);
    toast('Prompt saved ✓', 'success', 1800);
  };
  const discard = () => { delete agentHub_promptDrafts[k]; setDraftRaw(saved); };
  const reset = () => {
    if (original == null || !window.confirm(`Reset ${agent.name}'s prompt to the original?`)) return;
    onSave(agentHub_withRolePrompt(agent, original));
    delete agentHub_promptDrafts[k];
    setDraftRaw(original);
    toast('Back to the original prompt', 'success', 1800);
  };
  const layers = showMore ? [
    ...(agentHub_layered() ? [['What the whole team shares', 'The same for every agent: how the team works and what is known about you.', agentHub_systemBase(agent).slice(agentHub_rolePrompt(agent).length)]] : []),
    ['Your live context', 'Rebuilt before every message: today, open tasks, goals, recent chats, pinned Second Brain notes.', buildAgentContext(agent.name) + agentHub_moreContext()],
    ['What it can do in your dashboard', 'How it proposes adds and task changes. Nothing runs until you approve the preview.', AGENT_ACTION_DOCS],
    ['When it writes a report', 'Added only for Workstation reports.', AGENT_HUB_WRITING_STANDARD],
  ] : [];
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:8 }}>
        <div style={{ ...agentHub_label(), marginBottom:0 }}>What {agent.name} is told</div>
        {edited ? <AgentHubBadge title="Different from the prompt it came with">edited</AgentHubBadge>
          : original != null ? <AgentHubBadge tone="rose">original</AgentHubBadge> : <AgentHubBadge>your agent</AgentHubBadge>}
        {dirty && <AgentHubBadge tone="rose">unsaved</AgentHubBadge>}
        <span style={{ marginLeft:'auto', fontSize:11, color:C.textMuted }}>{agentHub_words(draft)} words</span>
      </div>
      <textarea ref={taRef} value={draft} onChange={e => setDraft(e.target.value)} aria-label={`${agent.name} system prompt`}
        placeholder="Who is this agent, and how should it behave?"
        style={{ width:'100%', boxSizing:'border-box', resize:'vertical', minHeight:200, overflow:'hidden', border:`0.5px solid ${C.border}`, borderRadius:14,
          padding:'14px 16px', fontSize:14, lineHeight:1.75, color:C.text, background:C.lavLight, fontFamily:'inherit' }}/>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginTop:10 }}>
        <button onClick={save} disabled={!dirty} style={agentHub_btn(true, { opacity:dirty ? 1 : .5, cursor:dirty ? 'pointer' : 'default' })}>Save prompt</button>
        {dirty && <button onClick={discard} style={agentHub_btn(false)}>Discard changes</button>}
        {original != null && saved.trim() !== String(original).trim() && <button onClick={reset} style={agentHub_btn(false)}>↺ Reset to original</button>}
      </div>
      <div style={{ fontSize:11.5, color:C.textMuted, marginTop:8, lineHeight:1.5 }}>Changes apply to {agent.name}'s next chat message and next report, here and in the Office.</div>

      <button onClick={() => setShowMore(s => !s)} aria-expanded={showMore}
        style={{ marginTop:20, fontSize:12.5, color:C.textLight, background:'none', border:`0.5px dashed ${C.border}`, borderRadius:20, padding:'8px 14px', minHeight:36, cursor:'pointer', fontFamily:'inherit' }}>
        {showMore ? '▾' : '▸'} What else {agent.name} sees
      </button>
      {showMore && (
        <div style={{ display:'flex', flexDirection:'column', gap:14, marginTop:14 }}>
          <div style={{ fontSize:12, color:C.textLight, lineHeight:1.55 }}>Read-only. After the prompt above, every message to {agent.name} carries these, in this order.</div>
          {layers.map(([title, sub, body], i) => (
            <div key={title}>
              <div style={{ fontSize:12.5, fontWeight:600, color:C.rose }}>{i + 1}. {title}</div>
              <div style={{ fontSize:11, color:C.textMuted, margin:'2px 0 6px' }}>{sub}</div>
              <pre style={{ margin:0, maxHeight:340, overflow:'auto', whiteSpace:'pre-wrap', wordBreak:'break-word', fontFamily:'inherit', fontSize:12, lineHeight:1.6,
                color:C.text, background:`${C.lavender}22`, border:`0.5px solid ${C.border}`, borderRadius:12, padding:'12px 14px' }}>{String(body || '').trim() || '(nothing yet)'}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Settings tab ── */
const AgentHubSettings = ({ agent, onSave, onDelete }) => {
  const [formKey, setFormKey] = useState(0);
  // Built-in ids stay undeletable even when the agent no longer looks like its default.
  const builtInId = typeof agent.id === 'number' && agent.id >= 1 && agent.id <= 28;
  const custom = !agentHub_isDefault(agent) && !builtInId;
  return (
    <div>
      <div style={agentHub_label()}>Settings</div>
      <AgentSettingsForm key={`${agent.id}-${formKey}`} initial={agent} submitLabel="Save changes"
        onCancel={() => setFormKey(n => n + 1)} cancelLabel="Discard"
        onSubmit={f => { onSave({ ...agent, ...f }); toast('Saved ✓', 'success', 1500); }}/>
      <div style={{ marginTop:22, paddingTop:14, borderTop:`0.5px solid ${C.border}` }}>
        {custom ? (
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <span style={{ fontSize:12, color:C.textLight, flex:'1 1 200px' }}>Deleting removes {agent.name} from your team. Its saved chats and reports stay.</span>
            <button onClick={() => { if (window.confirm(`Delete ${agent.name}? Its chats and reports stay in Chat History and the Notebook.`)) onDelete(agent); }}
              style={agentHub_btn(false, { color:'#d05a5a', background:'transparent' })}>Delete agent</button>
          </div>
        ) : (
          <div style={{ fontSize:12, color:C.textMuted, lineHeight:1.5 }}>{agent.name} is one of your built-in agents, so it can't be deleted. You can change its prompt, or reset it, in the Prompt tab.</div>
        )}
      </div>
    </div>
  );
};

/* ── The Hub ── */
const AgentHubRow = ({ agent, active, onPick }) => {
  const entry = useAgentChat(agent);
  const status = agentHub_status(entry);
  const edited = agentHub_isEdited(agent);
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onPick} aria-current={active ? 'true' : undefined} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'8px 10px', minHeight:54, borderRadius:14, cursor:'pointer', textAlign:'left', fontFamily:'inherit',
        border:`0.5px solid ${active ? `${C.rose}55` : 'transparent'}`,
        background:active ? `linear-gradient(135deg, ${C.pink}60, ${C.lavender}50)` : hover ? `${C.pink}28` : 'transparent', transition:'background 0.15s' }}>
      <AgentHubAvatar agent={agent} size={36} status={status}/>
      <span style={{ flex:1, minWidth:0 }}>
        <span style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:13, fontWeight:500, color:active ? C.rose : C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{agent.name || 'Untitled agent'}</span>
          {edited && <AgentHubBadge title="Its prompt is different from the original">edited</AgentHubBadge>}
        </span>
        <span style={{ display:'block', fontSize:11, color:C.textLight, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:1 }}>{agent.role}</span>
      </span>
    </button>
  );
};

const AgentHubWorkspace = ({ agent, tab, setTab, onSave, onDelete, onBack, isMobile }) => {
  const entry = useAgentChat(agent);
  const status = agentHub_status(entry);
  const meta = (typeof AGENT_STATUS_META !== 'undefined' && AGENT_STATUS_META[status]) || null;
  const edited = agentHub_isEdited(agent);
  const log = agentHub_readList('nylaos_agent_activity_log');
  const recent = log.find(e => e && e.agent === agent.name);
  return (
    <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:isMobile ? '12px 14px' : '16px 20px 14px', borderBottom:`0.5px solid ${C.border}`,
        background:`linear-gradient(135deg, ${C.lavender}30, ${C.pink}25)`, flexShrink:0 }}>
        {onBack && <button onClick={onBack} aria-label="Back to all agents" style={{ width:36, height:36, borderRadius:'50%', border:`0.5px solid ${C.border}`, background:C.card, color:C.rose, fontSize:18, cursor:'pointer', flexShrink:0, lineHeight:1 }}>‹</button>}
        <AgentHubAvatar agent={agent} size={isMobile ? 40 : 48} status={status}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:isMobile ? 18 : 22, lineHeight:1.15, color:C.rose, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{agent.name}</div>
          <div style={{ fontSize:12, color:C.textLight, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:isMobile ? 'nowrap' : 'normal' }}>{agent.role}</div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:5, flexWrap:'wrap' }}>
            {meta && <span style={{ fontSize:10, color:meta.color, fontWeight:600 }}>{meta.icon} {meta.label}</span>}
            {agent.businessAssignment && <span style={{ fontSize:9.5, padding:'1px 7px', borderRadius:8, background:`${C.accent}18`, color:C.accent }}>💼 {agent.businessAssignment}</span>}
            {edited && <AgentHubBadge title="Its prompt is different from the original">edited</AgentHubBadge>}
          </div>
          {recent && !isMobile && recent.actions && recent.actions[0] && (
            <div style={{ fontSize:10.5, color:C.textMuted, marginTop:5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              Recent: {recent.actions[0].preview} <span style={{ opacity:0.7 }}>· {new Date(recent.ts).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>
      <div role="tablist" aria-label={`${agent.name} workspace`} style={{ display:'flex', gap:6, padding:isMobile ? '10px 12px' : '10px 16px', borderBottom:`0.5px solid ${C.border}`, background:C.card, flexShrink:0 }}>
        {AGENT_HUB_TABS.map(t => {
          const on = tab === t.key;
          return (
            <button key={t.key} role="tab" aria-selected={on} onClick={() => setTab(t.key)}
              style={{ flex:isMobile ? '1 1 0' : '0 0 auto', minWidth:0, padding:isMobile ? '7px 4px' : '6px 14px', minHeight:34, borderRadius:20, cursor:'pointer', fontFamily:'inherit',
                background:on ? C.rose : agentHub_softBg(`${C.pink}60`), color:on ? '#fff' : agentHub_softFg(), border:`0.5px solid ${on ? C.rose : C.border}`,
                boxShadow:on ? `0 4px 12px ${C.rose}35` : 'none', fontSize:isMobile ? 12 : 12.5, fontWeight:on ? 500 : 400, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', transition:'all 0.15s' }}>
              {isMobile ? t.label : `${t.icon} ${t.label}`}
            </button>
          );
        })}
      </div>
      {tab === 'chat'
        ? <AgentChatPanel key={agent.id} agent={agent} embedded phone={isMobile}/>
        : (
          <div data-hub-scroll="1" style={{ flex:1, minHeight:0, overflowY:'auto', padding:isMobile ? '16px 14px 28px' : '20px 22px 28px' }}>
            {tab === 'workstation' && <AgentHubWorkstation key={agent.id} agent={agent}/>}
            {tab === 'prompt' && <AgentHubPrompt key={agent.id} agent={agent} onSave={onSave}/>}
            {tab === 'settings' && <AgentHubSettings key={agent.id} agent={agent} onSave={onSave} onDelete={onDelete}/>}
          </div>
        )}
    </div>
  );
};

// agents / onSave(list) come from AgentsPanel, which owns nylaos_agents.
const AgentHub = ({ agents, onSave }) => {
  // Phone layout (list, then the workspace full screen) on a phone, and also when
  // the page area itself is too narrow for two columns (sidebars open, small window).
  const phone = useIsMobile();
  const boxRef = useRef(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => { setNarrow(el.clientWidth > 0 && el.clientWidth < 640); });
    ro.observe(el);
    return () => { ro.disconnect(); };
  }, []);
  const isMobile = phone || narrow;
  const list = Array.isArray(agents) ? agents.filter(a => a && a.id != null) : [];
  const [selId, setSelIdRaw] = useState(() => agentHub_lsGet('nyla_agent_hub_agent'));
  const [tab, setTabRaw] = useState(() => { const t = agentHub_lsGet('nyla_agent_hub_tab'); return AGENT_HUB_TABS.some(x => x.key === t) ? t : 'chat'; });
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Back to two columns (tablet rotated, sidebar toggled): close the full-screen workspace,
  // so it doesn't pop open by itself the next time the page gets narrow.
  useEffect(() => { if (!isMobile) setMobileOpen(false); }, [isMobile]);
  const [idea, setIdea] = useState(() => agentHub_peekIdea());
  const selected = list.find(a => String(a.id) === String(selId)) || list[0] || null;
  const [showBiz, setShowBiz] = useState(() => !!(selected && selected.businessAssignment));
  const setSelId = id => { setSelIdRaw(String(id)); agentHub_lsSet('nyla_agent_hub_agent', String(id)); };
  const setTab = t => { setTabRaw(t); agentHub_lsSet('nyla_agent_hub_tab', t); };

  const pick = a => {
    setSelId(a.id); setCreating(false);
    if (idea && agentHub_takeIdea(a)) { setIdea(null); setTab('chat'); }
    if (isMobile) setMobileOpen(true);
  };
  const saveAgent = updated => onSave(list.map(a => a.id === updated.id ? updated : a));
  const deleteAgent = a => {
    const rest = list.filter(x => x.id !== a.id);
    onSave(rest);
    delete agentHub_chats[String(a.id)];
    if (rest[0]) setSelId(rest[0].id);
    setMobileOpen(false);
    toast(`${a.name} deleted`, 'success', 1600);
  };
  const createAgent = f => {
    const a = { id:Date.now(), ...f };
    onSave([...list, a]);
    setSelId(a.id); setCreating(false); setTab('chat');
    toast(`${a.name} joined your team ✦`, 'success', 2000);
  };
  const startCreate = () => { setCreating(true); if (isMobile) setMobileOpen(true); };

  const needle = q.trim().toLowerCase();
  const shown = list.filter(a => !needle || `${a.name} ${a.role} ${a.businessAssignment || ''}`.toLowerCase().includes(needle));
  const team = shown.filter(a => !a.businessAssignment);
  const desks = {};
  shown.filter(a => a.businessAssignment).forEach(a => { (desks[a.businessAssignment] = desks[a.businessAssignment] || []).push(a); });
  const deskNames = Object.keys(desks).sort();
  const deskCount = deskNames.reduce((n, g) => n + desks[g].length, 0);
  const bizOpen = showBiz || !!needle;
  const groupLabel = { fontSize:11, fontWeight:600, color:C.textMuted, textTransform:'uppercase', letterSpacing:.8, margin:'12px 4px 6px' };
  const rows = arr => arr.map(a => <AgentHubRow key={a.id} agent={a} active={!creating && selected && a.id === selected.id} onPick={() => pick(a)}/>);

  const listPane = (
    <>
      <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
        <InlineInput value={q} onChange={e => setQ(e.target.value)} placeholder="Find an agent…" aria-label="Find an agent" type="search"
          style={{ flex:1, minWidth:0, borderRadius:20, fontSize:12.5, padding:'8px 14px' }}/>
        <button onClick={startCreate} style={{ padding:'8px 12px', minHeight:36, borderRadius:12, background:C.rose, color:'#fff', border:'none', fontSize:12.5, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit' }}>+ New agent</button>
      </div>
      {idea && (
        <div style={{ marginTop:10, padding:'10px 12px', borderRadius:14, background:`${C.accent}16`, border:`0.5px solid ${C.accent}55`, fontSize:12, color:C.text, lineHeight:1.5 }}>
          💡 “{idea.title}” from your Idea Bank is waiting. Pick an agent to hand it to.
          <div style={{ display:'flex', gap:6, marginTop:7, flexWrap:'wrap' }}>
            {selected && !isMobile && <button onClick={() => pick(selected)} style={{ padding:'4px 10px', minHeight:30, borderRadius:9, border:'none', background:C.rose, color:'#fff', fontSize:11.5, cursor:'pointer', fontFamily:'inherit' }}>Give it to {selected.name}</button>}
            <button onClick={() => { try { localStorage.removeItem('nylaos_agent_pending_context'); } catch (e) {} setIdea(null); }} style={{ padding:'4px 10px', minHeight:30, borderRadius:9, border:`0.5px solid ${C.border}`, background:'transparent', color:C.textMuted, fontSize:11.5, cursor:'pointer', fontFamily:'inherit' }}>Dismiss</button>
          </div>
        </div>
      )}
      <div style={{ flex:isMobile ? 'none' : 1, minHeight:0, overflowY:isMobile ? 'visible' : 'auto', margin:'4px -4px 0', padding:'0 4px' }}>
        {team.length > 0 && <div style={groupLabel}>✦ Your team</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>{rows(team)}</div>
        {deskCount > 0 && (
          <>
            <button onClick={() => setShowBiz(v => !v)} aria-expanded={bizOpen} disabled={!!needle}
              style={{ width:'100%', textAlign:'left', fontSize:12.5, color:C.textLight, background:'none', border:`0.5px dashed ${C.border}`, borderRadius:20, padding:'8px 14px', minHeight:36, cursor:needle ? 'default' : 'pointer', margin:'14px 0 4px', fontFamily:'inherit' }}>
              {bizOpen ? '▾' : '▸'} 💼 Business desks ({deskCount})
            </button>
            {bizOpen && deskNames.map(g => (
              <React.Fragment key={g}>
                <div style={groupLabel}>{g}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>{rows(desks[g])}</div>
              </React.Fragment>
            ))}
          </>
        )}
        {shown.length === 0 && <div style={{ fontSize:12.5, color:C.textMuted, fontStyle:'italic', padding:'14px 6px' }}>{list.length ? 'No agents match. Try another search.' : 'No agents yet.'}</div>}
      </div>
    </>
  );

  const createPane = (
    <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:isMobile ? '12px 14px' : '16px 20px 14px', borderBottom:`0.5px solid ${C.border}`, background:`linear-gradient(135deg, ${C.lavender}30, ${C.pink}25)`, flexShrink:0 }}>
        {isMobile && <button onClick={() => { setCreating(false); setMobileOpen(false); }} aria-label="Back to all agents" style={{ width:36, height:36, borderRadius:'50%', border:`0.5px solid ${C.border}`, background:C.card, color:C.rose, fontSize:18, cursor:'pointer', flexShrink:0, lineHeight:1 }}>‹</button>}
        <div style={{ width:isMobile ? 40 : 48, height:isMobile ? 40 : 48, borderRadius:14, background:C.gradA, display:'grid', placeItems:'center', fontSize:22, flexShrink:0 }}>✦</div>
        <div>
          <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:isMobile ? 18 : 22, color:C.rose }}>New agent</div>
          <div style={{ fontSize:12, color:C.textLight, marginTop:2 }}>Give it a name, a role and a prompt. You can change any of it later.</div>
        </div>
      </div>
      <div data-hub-scroll="1" style={{ flex:1, minHeight:0, overflowY:'auto', padding:isMobile ? '16px 14px 28px' : '20px 22px 28px' }}>
        <AgentSettingsForm showPrompt submitLabel="Create" onSubmit={createAgent} onCancel={() => { setCreating(false); setMobileOpen(false); }}/>
      </div>
    </div>
  );
  const workspace = creating ? createPane
    : selected ? <AgentHubWorkspace agent={selected} tab={tab} setTab={setTab} onSave={saveAgent} onDelete={deleteAgent} isMobile={isMobile}
        onBack={isMobile ? () => setMobileOpen(false) : null}/>
    : <div style={{ padding:24 }}><EmptyState icon="🤖" title="No agents yet" text="Create one to get started." action={<button onClick={startCreate} style={agentHub_btn(true)}>+ New agent</button>}/></div>;

  const composerCss = <style>{`.agent-hub-composer > div { border-top: none !important; padding-top: 6px !important; }`}</style>;
  // One outer box in both layouts, so the width watcher never loses its element.
  return (
    <div ref={boxRef}>
      {composerCss}
      {isMobile ? (<>
        <Card style={{ padding:12 }}>{listPane}</Card>
        {mobileOpen && (
          <div style={{ position:'fixed', inset:0, zIndex:9990, background:C.cream, display:'flex', flexDirection:'column' }}>{workspace}</div>
        )}
      </>) : (
        <div style={{ display:'grid', gridTemplateColumns:'minmax(230px, 290px) minmax(0, 1fr)', gap:16, height:'calc(100vh - 196px)', minHeight:540 }}>
          <Card style={{ padding:12, display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden' }}>{listPane}</Card>
          <Card style={{ padding:0, display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden' }}>{workspace}</Card>
        </div>
      )}
    </div>
  );
};
