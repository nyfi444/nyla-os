/* ── Phone capture inbox ───────────────────────────────────────────────
   "Save to Nyla OS Ideas" and "Save to Nyla OS Tasks" are iOS Shortcuts on
   her share sheet. They post the shared text or link to /capture on her AI
   Worker (nyla-ai-proxy), which keeps it in a small KV inbox. A Shortcut
   cannot write into the app itself: it runs in Safari, whose storage is
   separate from the installed app's, and the cloud sync replaces the whole
   saved blob, so anything written there would be lost.

   This file collects what is waiting. startCaptureInbox() runs on every
   sign-in. It pulls when the app opens, when it comes back into view, and
   every 5 minutes while it is on screen, one pull at a time (and one window
   at a time, through a Web Lock). Each new item becomes a task (no date) or
   an idea under #inbox. Items are remembered by captureId on the item, and
   in nylaos_capture_seen once acked, so an item that comes back is cleared
   again instead of added twice.

   The inbox copy is the only other copy, so it is deleted (/inbox/ack) only
   once the import has reached the cloud: after a cloud save that started
   after the import. Before importing, it also asks Firestore whether another
   device saved since this one last synced (a phone waking up hears about
   that a second or two late). If so it imports nothing yet: the sync is
   about to load that copy and reload, and an import now would turn it into
   a false "Sync conflict".

   Open panels hold their own copy of tasks and ideas and save the whole list
   back on the next tick, which would erase an import made under them. So an
   import announces itself with the window event 'nyla:data-changed', the App
   remounts the open view on it, and nothing is imported until the App says
   it listens (window._remountOnDataChange). Other windows of the app hear
   about it through a storage event and remount too. Imports wait while any
   text box holds text, so the remount never throws away something typed.

   Safety: the shared text is untrusted. Parts of the app turn idea text into
   HTML (search, the Obsidian vault, Save to Notebook, Print/PDF), so idea
   content is stored HTML-escaped with its links as <a> tags, and < and > in
   anything captured are swapped for ‹ and › so no later step can turn the
   text back into a tag.

   Load order: this file runs BEFORE the main app script, so nothing at the
   top level may touch the app's globals (C, toast, _fbUser, AI_PROXY…). Only
   function bodies can, because they run after the app has loaded. */

const CAPTURE_POLL_MS = 5 * 60 * 1000;
const CAPTURE_SEEN_KEY = 'nylaos_capture_seen';   // synced, so two devices agree on what is in
const CAPTURE_SEEN_MAX = 500;
const CAPTURE_IDEA_CATEGORY = { key:'inbox', label:'#inbox', color:'#607d8f' };
// How long to wait for the cloud save that carries an import before giving up
// on acking this round (the next pull clears it once the save has happened).
const CAPTURE_CLOUD_WAIT_MS = 60 * 1000;
// Device-only (not nylaos_, so it never syncs): written after an import so the
// app's other open windows hear a storage event and refresh their open view.
const CAPTURE_IMPORTED_KEY = 'nyla_capture_imported';
const CAPTURE_LOCK_NAME = 'nyla-capture-pull';
// Input types that hold typed text. A checkbox's "on" or a date is not typing.
const CAPTURE_TEXT_INPUT_TYPES = ['text', 'search', 'url', 'email', 'tel'];

const capture_state = {
  started: false,
  busy: false,            // a pull is in flight; never start a second one
  timer: null,            // the one scheduled pull
  nextIn: 0,              // set by a pull that wants the next one sooner than 5 minutes
  lastPullAt: 0,
  lastInputAt: 0,         // last time she typed anywhere in the app
  failures: 0,
  retryAt: 0,             // backoff: no pulls before this
  waitingForSync: false,  // a pull is held until the cloud sync settles
  refreshPending: false,  // another window imported; refresh this one when no box holds text
  refreshTimer: null,
  warned: {},             // console.warn each distinct problem once
};

const startCaptureInbox = () => {
  const s = capture_state;
  if (!s.started) {
    s.started = true;
    document.addEventListener('visibilitychange', capture_onVisibility);
    document.addEventListener('input', capture_onInput, true);
    window.addEventListener('online', capture_onOnline);
    window.addEventListener('storage', capture_onStorage);
    // The sync reports every state change here. The first pull after a sign-in
    // waits for it, so a cloud copy that lands a moment later cannot overwrite
    // what was just imported (or flag the device as having a conflict).
    if (typeof _syncSubs !== 'undefined' && _syncSubs && _syncSubs.add) _syncSubs.add(capture_onSyncState);
  }
  // A fresh sign-in is a fresh start: forget any backoff from the last account state.
  s.failures = 0; s.retryAt = 0;
  capture_pull('start');
};

const capture_onVisibility = () => {
  const s = capture_state;
  if (document.visibilityState === 'hidden') {
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    return;
  }
  // Coming back after a moment away does not need a second pull.
  const since = Date.now() - s.lastPullAt;
  if (since < 15000) capture_schedule(CAPTURE_POLL_MS - since);
  else capture_pull('visible');
};

const capture_onInput = () => { capture_state.lastInputAt = Date.now(); };

const capture_onOnline = () => {
  capture_state.retryAt = 0;
  capture_pull('online');
};

const capture_onSyncState = st => {
  const s = capture_state;
  if (!s.waitingForSync || !st) return;
  if (st.status !== 'synced' && st.status !== 'error') return;
  s.waitingForSync = false;
  // Next tick: when a cloud copy is applied, the sync says "synced" just
  // before it reloads the page, and this lets that reload win.
  setTimeout(() => capture_pull('sync'), 0);
};

const capture_schedule = ms => {
  const s = capture_state;
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => { s.timer = null; capture_pull('timer'); }, Math.max(1000, ms));
};

// She is typing, or some box holds text: an import now would remount the open
// view (see the App's nyla:data-changed listener) and lose it. Any box counts,
// focused or not, because a field she tapped away from (or that iOS blurred
// while she switched apps) still holds unsaved text. Views that show text in a
// box by default (Settings > Profile, the Books reading goal, the Notebook and
// Quick Notes once they hold text) just make the import wait until she moves on.
const capture_isTyping = () => {
  if (Date.now() - capture_state.lastInputAt < 20000) return true;
  const fields = document.querySelectorAll('textarea, input, [contenteditable]');
  for (let i = 0; i < fields.length; i++) {
    const el = fields[i];
    if (el.disabled || el.readOnly) continue;
    let text;
    if (el.tagName === 'TEXTAREA') text = el.value;
    else if (el.tagName === 'INPUT') {
      if (!CAPTURE_TEXT_INPUT_TYPES.includes(String(el.type || 'text').toLowerCase())) continue;
      text = el.value;
    } else if (el.isContentEditable) text = el.textContent;
    if (String(text || '').trim()) return true;
  }
  return false;
};

/* ── Other windows ──────────────────────────────────────────────────────
   An import in one window leaves the app's other open windows holding the
   old lists, and their next save would erase it. The importing window writes
   CAPTURE_IMPORTED_KEY; the others hear it here and refresh their open view,
   waiting while a box of theirs holds text. */
const capture_onStorage = e => {
  if (!e || e.key !== CAPTURE_IMPORTED_KEY || !e.newValue) return;
  capture_state.refreshPending = true;
  capture_refreshView();
};

const capture_refreshView = () => {
  const s = capture_state;
  if (s.refreshTimer) { clearTimeout(s.refreshTimer); s.refreshTimer = null; }
  if (!s.refreshPending) return;
  if (capture_isTyping()) { s.refreshTimer = setTimeout(capture_refreshView, 3000); return; }
  s.refreshPending = false;
  try { window.dispatchEvent(new CustomEvent('nyla:data-changed', { detail: { keys: ['nylaos_tasks', 'nylaos_ideas'], source: 'capture-other-window' } })); } catch (e) {}
};

/* ── Cloud checks ───────────────────────────────────────────────────── */

// A cloud copy is being applied, a conflict waits for her, or she signed out.
const capture_blocked = () =>
  (typeof _fbUser === 'undefined' || !_fbUser) ||
  (typeof _reloadPending !== 'undefined' && _reloadPending) ||
  (typeof _pendingConflict !== 'undefined' && !!_pendingConflict);

// The sync is between states (signing in, saving): wait for it to settle.
const capture_syncBusy = () => {
  if (capture_blocked()) return true;
  const st = (typeof _syncState !== 'undefined' && _syncState) ? _syncState.status : 'synced';
  return st !== 'synced' && st !== 'error';
};

// This device's data is all in the cloud: the last save worked and nothing
// changed since. The dirty flag in storage is read too, because another
// window of the app sets that one (this window's _dirty only knows its own).
const capture_localIsSaved = () => {
  if (capture_blocked()) return false;
  if (typeof _syncState === 'undefined' || !_syncState || _syncState.status !== 'synced') return false;
  if (typeof _dirty !== 'undefined' && _dirty) return false;
  try { if (localStorage.getItem('nylaos_dirty_flag') === 'true') return false; } catch (e) { return false; }
  return true;
};

// Resolves true once a cloud save that STARTED after this call has finished
// with nothing left unsaved, false on a conflict, a cloud copy being applied,
// sign-out, or the timeout. A save that was already on its way when the
// import happened does not count: it was built before the import.
const capture_waitForCloud = ms => new Promise(resolve => {
  if (typeof _syncSubs === 'undefined' || !_syncSubs || !_syncSubs.add) { resolve(false); return; }
  let sawSave = false, done = false, timer = null;
  const finish = ok => {
    if (done) return;
    done = true;
    _syncSubs.delete(watch);
    if (timer) clearTimeout(timer);
    resolve(ok);
  };
  const watch = st => {
    if (!st || capture_blocked() || st.status === 'conflict' || st.status === 'idle') { finish(false); return; }
    if (st.status === 'syncing') { sawSave = true; return; }
    if (st.status === 'synced' && sawSave && capture_localIsSaved()) finish(true);
  };
  _syncSubs.add(watch);
  timer = setTimeout(() => finish(false), ms);
});

// True when the cloud holds a save newer than the one this device last had
// (another device saved while this one was asleep or offline). The sync
// listener is about to apply it; importing first would make this device look
// edited and turn that copy into a false sync conflict. One Firestore read,
// and only on pulls that have something new to import.
const capture_cloudIsNewer = async () => {
  if (typeof _fbDb === 'undefined' || !_fbDb || typeof _fbUser === 'undefined' || !_fbUser) throw new Error('cloud sync is not ready');
  const doc = await _fbDb.collection('nylaos').doc(_fbUser.uid).get({ source: 'server' });
  if (!doc || !doc.exists) return false;
  const savedAt = Number((doc.data() || {}).savedAt) || 0;
  const localTs = parseInt(localStorage.getItem('nylaos_cloud_ts') || '0', 10) || 0;
  return savedAt > localTs;
};

// One pull at a time across all of the app's windows; a window that finds the
// lock taken skips this round. Browsers without Web Locks just run it.
const capture_withLock = fn => {
  const locks = typeof navigator !== 'undefined' && navigator.locks;
  if (!locks || typeof locks.request !== 'function') return fn();
  return locks.request(CAPTURE_LOCK_NAME, { ifAvailable: true }, lock => (lock ? fn() : null));
};

// console.info once per distinct reason.
const capture_note = (key, msg) => {
  const s = capture_state;
  if (s.warned[key]) return;
  s.warned[key] = true;
  console.info('Capture inbox:', msg);
};

const capture_inboxUrl = path => {
  try { return new URL(AI_PROXY).origin + path; } catch (e) { return null; }
};

const capture_post = async (path, body) => {
  const url = capture_inboxUrl(path);
  if (!url) throw new Error('no AI Worker address');
  const idToken = await _fbUser.getIdToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
    body: JSON.stringify(body || {}),
    cache: 'no-store',
  });
  if (!res.ok) {
    const e = new Error(`${path} answered ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
};

const capture_pull = async (reason) => {
  const s = capture_state;
  if (s.busy) return;
  if (typeof _fbUser === 'undefined' || !_fbUser) return;
  if (document.visibilityState === 'hidden') return;
  const now = Date.now();
  if (now < s.retryAt) { capture_schedule(s.retryAt - now); return; }
  if (capture_syncBusy()) { s.waitingForSync = true; capture_schedule(CAPTURE_POLL_MS); return; }
  if (capture_isTyping()) { capture_schedule(60000); return; }
  // Panels keep their own copy of tasks and ideas and save the whole list
  // back, so an import under an open panel is lost at her next tick. The App
  // remounts the open view on nyla:data-changed and sets this flag when it
  // listens; until it does, captures stay safe in the inbox.
  if (!window._remountOnDataChange) {
    capture_note('remount', 'waiting for the app to refresh open views on nyla:data-changed; captures stay in the inbox until then.');
    capture_schedule(CAPTURE_POLL_MS);
    return;
  }

  s.busy = true;
  s.nextIn = 0;
  try {
    await capture_withLock(capture_pullOnce);
    s.failures = 0; s.retryAt = 0;
  } catch (e) {
    s.failures++;
    // Auth, a missing route (the Worker not deployed yet) or a server problem
    // will not fix itself in a minute; a dropped connection might.
    const slow = e && (e.status === 401 || e.status === 403 || e.status === 404 || e.status >= 500);
    const wait = slow ? 30 * 60000 : Math.min(60 * 60000, 60000 * Math.pow(2, Math.min(s.failures - 1, 6)));
    s.retryAt = Date.now() + wait;
    const msg = (e && e.message) || String(e);
    if (!s.warned[msg]) { s.warned[msg] = true; console.warn('Capture inbox:', msg, `(retrying in ${Math.round(wait / 60000)} min)`); }
  } finally {
    s.busy = false;
    s.lastPullAt = Date.now();
    capture_schedule(Math.max(s.nextIn || CAPTURE_POLL_MS, s.retryAt - Date.now()));
  }
};

// One pull, run under the cross-window lock. Throws on network, auth and
// storage problems (capture_pull backs off); returns quietly when it chose
// to leave the inbox alone for now.
const capture_pullOnce = async () => {
  const s = capture_state;
  const data = await capture_post('/inbox/list');
  const items = (Array.isArray(data && data.items) ? data.items : []).filter(capture_validItem);
  if (!items.length) return;
  const known = capture_seenNow();
  if (!known) throw new Error('tasks or ideas could not be read; left the inbox as it is');
  // Items not imported yet. The rest were imported on an earlier pull whose
  // ack failed or was held back, or KV still lists them a moment after an ack.
  const fresh = items.filter(it => !known.seen.has(capture_seenKey(it.id)));

  let wrote = false;
  if (fresh.length) {
    // Signed out, or a cloud copy arrived while the list was on its way.
    if (capture_blocked()) { s.waitingForSync = true; return; }
    if (await capture_cloudIsNewer()) {
      // The sync listener will load that copy (and reload the page), or show
      // a conflict if she has unsaved edits; the pull runs again once it settles.
      s.waitingForSync = true;
      capture_note('cloud-newer', 'another device saved since this one last synced; importing after the sync catches up.');
      return;
    }
    // Re-checked after the two network calls: she may have started typing,
    // put the app away, or the sync may have moved on.
    if (capture_syncBusy() || capture_isTyping() || document.visibilityState === 'hidden') { s.nextIn = 60000; return; }

    const result = capture_import(fresh);
    wrote = result.keys.length > 0;
    if (result.added.idea + result.added.task > 0) {
      try { window.dispatchEvent(new CustomEvent('nyla:data-changed', { detail: { keys: result.keys, source: 'capture' } })); } catch (e) {}
      try { localStorage.setItem(CAPTURE_IMPORTED_KEY, JSON.stringify({ at: Date.now(), keys: result.keys })); } catch (e) {}
      capture_toast(result.added);
    }
  }

  // The inbox copy is deleted only once this device's copy, imports included,
  // is in the cloud: after a fresh import, a save that started after it; for
  // items imported earlier, no unsaved changes right now. If this device loses
  // its copy first (she picks "Use cloud" in a conflict), the items are still
  // in the inbox and come back on the next pull.
  const saved = wrote ? await capture_waitForCloud(CAPTURE_CLOUD_WAIT_MS) : capture_localIsSaved();
  // Checked again after the wait: a cloud copy applied at the last moment
  // says "synced" just before it reloads the page.
  if (!saved || capture_blocked()) {
    capture_note(wrote ? 'ack-wait' : 'ack-held', 'imported items stay in the inbox until this device has saved them to the cloud.');
    if (wrote) s.nextIn = 60000;
    return;
  }
  // Only now are they "seen": remembered even if she deletes the task or idea,
  // so KV listing them again cannot bring them back. Marked any earlier, a
  // conflict resolved with "Use cloud" could keep the seen list (a cloud copy
  // only replaces the keys it has) while losing the items themselves.
  const ids = items.map(it => it.id);
  capture_markSeen(ids);
  await capture_post('/inbox/ack', { ids });
};

/* ── Import ─────────────────────────────────────────────────────────── */

// null when the stored value is there but unreadable: better to leave the
// inbox alone than to replace a damaged list with one holding only captures.
const capture_readList = key => {
  const raw = localStorage.getItem(key);
  if (raw == null || raw === '') return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : null; } catch (e) { return null; }
};

// The random tail of an inbox id ("inbox:<time>:<16 hex>"), which is what the seen list keeps.
const capture_seenKey = id => String(id).slice(-16);

const capture_validItem = it => !!it && typeof it.id === 'string' && !!it.id && it.id.length <= 200;

// The current lists plus every capture they already hold, or null when a
// list is unreadable.
const capture_seenNow = () => {
  const tasks = capture_readList('nylaos_tasks');
  const ideas = capture_readList('nylaos_ideas');
  if (!tasks || !ideas) return null;
  const seenList = capture_readList(CAPTURE_SEEN_KEY) || [];
  const seen = new Set(seenList.map(String));
  tasks.forEach(t => { if (t && t.captureId) seen.add(capture_seenKey(t.captureId)); });
  ideas.forEach(i => { if (i && i.captureId) seen.add(capture_seenKey(i.captureId)); });
  return { tasks, ideas, seenList, seen };
};

const capture_import = (items) => {
  const known = capture_seenNow();
  if (!known) throw new Error('tasks or ideas could not be read; left the inbox as it is');
  const { tasks, ideas, seen } = known;

  const taskIds = new Set(tasks.map(t => t && t.id));
  const ideaIds = new Set(ideas.map(i => i && i.id));
  let next = Date.now();
  const freshId = used => { while (used.has(next)) next++; used.add(next); return next++; };

  const newTasks = [], newIdeas = [];
  items.forEach(it => {
    if (!capture_validItem(it)) return;
    const sk = capture_seenKey(it.id);
    if (seen.has(sk)) return;
    seen.add(sk);
    let text = capture_cleanText(it.text);
    const url = capture_httpUrl(it.url);
    if (url && !text.includes(url)) text = text ? `${text}\n${url}` : url;
    if (!text) return;
    const created = capture_createdAt(it.at);
    if (it.kind === 'task') {
      const first = capture_firstLine(text);
      const title = first.length > 300 ? first.slice(0, 299) + '…' : first;
      const task = { id: freshId(taskIds), text: title, done: false, calendarDate: null, created, captureId: it.id };
      if (title !== text) task.notes = text;
      newTasks.push(task);
    } else {
      const title = capture_ideaTitle(text);
      // The body is whatever the title does not already say: nothing for a
      // short line, the other lines when the title is the whole first line,
      // and all of it when the title had to be shortened (or is a tidied link).
      const lines = text.split('\n');
      const firstIdx = lines.findIndex(l => l.trim());
      const rest = lines.slice(firstIdx + 1).join('\n').trim();
      const body = title === capture_firstLine(text) ? rest : text;
      const content = body ? capture_toHtml(body) : '';
      newIdeas.push({ id: freshId(ideaIds), title, content, category: CAPTURE_IDEA_CATEGORY.key, status: 'new', created, captureId: it.id });
    }
  });

  const keys = [];
  if (newIdeas.length) {
    capture_ensureCategory();
    // Newest at the top, like a quick-added idea.
    localStorage.setItem('nylaos_ideas', JSON.stringify([...newIdeas.reverse(), ...ideas]));
    keys.push('nylaos_ideas');
  }
  if (newTasks.length) {
    localStorage.setItem('nylaos_tasks', JSON.stringify([...tasks, ...newTasks]));
    keys.push('nylaos_tasks');
  }
  // Read back: nothing is acked unless it really saved.
  const savedIdeas = capture_readList('nylaos_ideas') || [];
  const savedTasks = capture_readList('nylaos_tasks') || [];
  const missing = [...newIdeas.filter(n => !savedIdeas.some(i => i && i.captureId === n.captureId)),
                   ...newTasks.filter(n => !savedTasks.some(t => t && t.captureId === n.captureId))];
  if (missing.length) throw new Error(`${missing.length} capture(s) did not save; left them in the inbox`);

  return { keys, added: { idea: newIdeas.length, task: newTasks.length } };
};

// Adds inbox ids to the seen list (the last CAPTURE_SEEN_MAX are kept).
// Called only once the items are in the cloud, just before the ack.
const capture_markSeen = ids => {
  const list = capture_readList(CAPTURE_SEEN_KEY) || [];
  const have = new Set(list.map(String));
  const add = [];
  ids.forEach(id => { const k = capture_seenKey(id); if (!have.has(k)) { have.add(k); add.push(k); } });
  if (!add.length) return;
  localStorage.setItem(CAPTURE_SEEN_KEY, JSON.stringify([...list, ...add].slice(-CAPTURE_SEEN_MAX)));
};

const capture_ensureCategory = () => {
  let cats;
  try { cats = JSON.parse(localStorage.getItem('nylaos_idea_categories') || 'null'); } catch (e) { return; }
  if (cats == null) cats = (typeof DEFAULT_IDEA_CATS !== 'undefined') ? DEFAULT_IDEA_CATS : [];
  if (!Array.isArray(cats) || cats.some(c => c && c.key === CAPTURE_IDEA_CATEGORY.key)) return;
  localStorage.setItem('nylaos_idea_categories', JSON.stringify([...cats, { ...CAPTURE_IDEA_CATEGORY }]));
};

const capture_toast = added => {
  if (typeof toast !== 'function') return;
  const n = added.idea + added.task;
  const where = [added.idea && `${added.idea} to Ideas (#inbox)`, added.task && `${added.task} to Tasks`].filter(Boolean);
  const msg = n === 1
    ? `1 capture from your phone added to ${added.idea ? 'Ideas (#inbox)' : 'Tasks'}`
    : `${n} captures from your phone added: ${where.join(', ')}`;
  toast(msg, 'info', 4500);
};

/* ── Text helpers ───────────────────────────────────────────────────── */

// Unix newlines, no control characters, and ‹ › in place of < > (see the top).
const capture_cleanText = s => String(typeof s === 'string' ? s : '')
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .replace(/</g, '‹').replace(/>/g, '›')
  .trim();

const capture_firstLine = text => (String(text).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).find(Boolean) || '');

const capture_createdAt = at => {
  const t = Date.parse(at);
  return (isFinite(t) && t <= Date.now() + 60000) ? new Date(t).toISOString() : new Date().toISOString();
};

const capture_httpUrl = s => {
  const v = String(s || '').trim();
  if (!v || v.length > 2048) return '';
  try { const u = new URL(v); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : ''; } catch (e) { return ''; }
};

const CAPTURE_URL_RE = /\bhttps?:\/\/[^\s<>"'‹›]+/gi;

// A URL match minus trailing punctuation that belongs to the sentence
// ("see https://x.com/a." or "(https://x.com/a)").
const capture_trimUrl = u => {
  let url = u;
  for (;;) {
    const last = url.slice(-1);
    if (/[.,;:!?'"*]/.test(last)) { url = url.slice(0, -1); continue; }
    if (last === ')' && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) { url = url.slice(0, -1); continue; }
    if (last === ']' && (url.match(/\[/g) || []).length < (url.match(/\]/g) || []).length) { url = url.slice(0, -1); continue; }
    return url;
  }
};

// The first line without its links; for a line that is only a link, the
// link's address without https:// and www. The link itself goes in the body.
const capture_ideaTitle = text => {
  const first = capture_firstLine(text);
  let title = first.replace(CAPTURE_URL_RE, ' ').replace(/\s+/g, ' ').trim();
  if (!title) {
    title = first;
    CAPTURE_URL_RE.lastIndex = 0;
    const m = CAPTURE_URL_RE.exec(first);
    const href = m && capture_httpUrl(capture_trimUrl(m[0]));
    if (href) {
      const u = new URL(href);
      title = (u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname) + u.search).replace(/\/$/, '');
    }
  }
  return title.length > 90 ? title.slice(0, 89) + '…' : title;
};

const capture_escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Escaped text with each http(s) address as a link. Newlines stay as \n: the
// Idea Bank shows content with pre-wrap and Save to Notebook splits on them.
const capture_toHtml = text => {
  let out = '', at = 0;
  CAPTURE_URL_RE.lastIndex = 0;
  let m;
  while ((m = CAPTURE_URL_RE.exec(text))) {
    const url = capture_trimUrl(m[0]);
    const href = capture_httpUrl(url);
    if (!href) continue;
    out += capture_escape(text.slice(at, m.index));
    out += `<a href="${capture_escape(href)}" rel="noopener noreferrer" target="_blank">${capture_escape(url)}</a>`;
    at = m.index + url.length;
    CAPTURE_URL_RE.lastIndex = at;
  }
  return out + capture_escape(text.slice(at));
};

/* ── Showing a captured idea ────────────────────────────────────────────
   The Idea Bank prints idea.content as plain text, which would show a
   captured idea's link tags. CaptureIdeaText reads the stored HTML in an
   inert document (DOMParser: nothing in it loads or runs) and keeps only
   text and http(s) links. */
const capture_htmlToParts = html => {
  const out = [];
  let doc;
  try { doc = new DOMParser().parseFromString(`<!DOCTYPE html><body>${String(html || '')}</body>`, 'text/html'); } catch (e) { return [{ text: String(html || '') }]; }
  const walk = node => node.childNodes.forEach(n => {
    if (n.nodeType === 3) out.push({ text: n.textContent });
    else if (n.nodeType === 1) {
      const tag = n.tagName;
      if (tag === 'A') { const href = capture_httpUrl(n.getAttribute('href')); out.push(href ? { text: n.textContent || href, href } : { text: n.textContent }); }
      else if (tag === 'BR') out.push({ text: '\n' });
      else if (tag !== 'SCRIPT' && tag !== 'STYLE') walk(n);
    }
  });
  walk(doc.body);
  return out;
};

// A captured idea's content as plain text, for the places that show or keep
// plain text: a task's notes, a project description, the agent hand-off and
// the idea editors' text boxes. Never for a place that writes HTML. After an
// edit, capture_toHtml turns the text back into the stored (escaped) form.
const capture_ideaPlain = html => capture_htmlToParts(html).map(p => p.text).join('');

const CaptureIdeaText = ({ html }) => {
  const parts = React.useMemo(() => capture_htmlToParts(html), [html]);
  return (
    <span style={{ overflowWrap:'anywhere' }}>
      {parts.map((p, i) => p.href
        ? <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            style={{ color:C.rose, textDecoration:'underline', overflowWrap:'anywhere', wordBreak:'break-word' }}>{p.text}</a>
        : <React.Fragment key={i}>{p.text}</React.Fragment>)}
    </span>
  );
};
