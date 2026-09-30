/* ── Safety: the things that make losing work very hard ────────────
   Kept in IndexedDB on this device ("nylaos_safety"), which has far more
   room than the small storage the app's data lives in, and is never
   uploaded:

   base       What this device and the cloud last agreed on. Sync needs it
              to tell "she deleted this here" from "she added that there".
   snapshots  How everything stood the first time the app was opened each
              day, for the last 14 days, plus the start of this session.
              The old automatic backup was a second full copy inside the
              app's own small storage, which halved the room; it moves here.
   kept       When two devices changed the very same thing, the version
              that did not win. Shown under Settings > Backup & Restore.

   Also here: squeezing the sync upload (gzip) so notebooks can keep
   growing past the cloud's size limit, and a reading of how full this
   device's storage is.

   Plain script, one global: nylaSafety. Every function settles; a
   database that can't be opened means "no safety copy", never a stuck app.
──────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var DB_NAME = 'nylaos_safety', VERSION = 1;
  var KEEP_DAYS = 14, KEEP_VERSIONS = 300, VERSION_DAYS = 90;
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      var timer = setTimeout(function () { resolve(null); }, 3000);
      try {
        var req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
          if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('kept')) db.createObjectStore('kept', { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = function () { clearTimeout(timer); resolve(req.result); };
        req.onerror = req.onblocked = function () { clearTimeout(timer); resolve(null); };
      } catch (e) { clearTimeout(timer); resolve(null); }
    });
    return dbPromise;
  }
  // One request against one store; resolves to `fallback` on any failure.
  function run(store, mode, work, fallback) {
    return open().then(function (db) {
      if (!db) return mode === 'readwrite' ? false : fallback;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(store, mode), out;
          var req = work(tx.objectStore(store));
          if (req) req.onsuccess = function () { out = req.result; };
          // A write answers true when it landed and false when it did not, so a caller
          // can act on "the copy is safely stored" and mean it.
          var wrote = mode === 'readwrite';
          tx.oncomplete = function () { resolve(out !== undefined ? out : (wrote ? true : fallback)); };
          tx.onerror = tx.onabort = function () { resolve(wrote ? false : fallback); };
        } catch (e) { resolve(mode === 'readwrite' ? false : fallback); }
      });
    });
  }
  function dayKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function sizeOf(map) { var n = 0; Object.keys(map).forEach(function (k) { n += k.length + String(map[k] == null ? '' : map[k]).length; }); return n; }

  /* ── base ── */
  function getBase() { return run('meta', 'readonly', function (s) { return s.get('base'); }, null).then(function (v) { return v && typeof v === 'object' ? v : null; }); }
  function setBase(map) { return run('meta', 'readwrite', function (s) { s.put(map, 'base'); }, false); }

  /* ── snapshots ── */
  // Everything the app holds on this device, minus what is only a copy.
  function collect() {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('nylaos_') === 0 && k !== 'nylaos_auto_bak') out[k] = localStorage.getItem(k);
    }
    return out;
  }
  // The first open of a day becomes that day's copy and is never written
  // over, so a bad afternoon can't replace a good morning. "session" is
  // always the latest open.
  function snapshot(map, label, id) {
    map = map || collect();
    if (!Object.keys(map).length) return Promise.resolve(false);
    var now = new Date(), today = 'day-' + dayKey(now);
    var rec = function (id) { return { id: id, at: now.toISOString(), label: label || 'open', keys: Object.keys(map).length, chars: sizeOf(map), data: map }; };
    // A named copy (before a restore, or the last backup of the old kind) is kept as its own row.
    if (id) return run('snapshots', 'readwrite', function (s) { s.put(rec(id)); }, false);
    return run('snapshots', 'readonly', function (s) { return s.getAllKeys(); }, []).then(function (ids) {
      return run('snapshots', 'readwrite', function (s) {
        if (ids.indexOf(today) < 0) s.put(rec(today));
        s.put(rec('session'));
        var cutoff = 'day-' + dayKey(new Date(now.getTime() - KEEP_DAYS * 86400000));
        ids.forEach(function (id) { if (/^day-/.test(id) && id < cutoff) s.delete(id); });
      }, false);
    });
  }
  function listSnapshots() {
    return run('snapshots', 'readonly', function (s) { return s.getAll(); }, []).then(function (rows) {
      return (rows || []).map(function (r) { return { id: r.id, at: r.at, label: r.label, keys: r.keys, chars: r.chars }; })
        .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    });
  }
  function getSnapshot(id) { return run('snapshots', 'readonly', function (s) { return s.get(id); }, null); }

  /* ── kept versions ── */
  function keep(entries, why) {
    if (!entries || !entries.length) return Promise.resolve(0);
    var at = new Date().toISOString();
    return run('kept', 'readwrite', function (s) {
      entries.forEach(function (e) { s.add({ at: at, why: why || 'sync', key: e.key, recordId: e.recordId == null ? null : String(e.recordId), from: e.from, value: e.value }); });
    }, 0).then(prune).then(function () { return entries.length; });
  }
  function prune() {
    return run('kept', 'readonly', function (s) { return s.getAll(); }, []).then(function (rows) {
      rows = rows || [];
      var cutoff = new Date(Date.now() - VERSION_DAYS * 86400000).toISOString();
      var drop = rows.filter(function (r) { return r.at < cutoff; }).map(function (r) { return r.id; });
      var live = rows.filter(function (r) { return r.at >= cutoff; });
      if (live.length > KEEP_VERSIONS) live.slice(0, live.length - KEEP_VERSIONS).forEach(function (r) { drop.push(r.id); });
      if (!drop.length) return;
      return run('kept', 'readwrite', function (s) { drop.forEach(function (id) { s.delete(id); }); }, null);
    });
  }
  function listKept() { return run('kept', 'readonly', function (s) { return s.getAll(); }, []).then(function (rows) { return (rows || []).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }); }); }
  function removeKept(id) { return run('kept', 'readwrite', function (s) { s.delete(id); }, null); }

  /* ── squeeze ── */
  function canGzip() { return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Response === 'function'; }
  function toBase64(bytes) {
    var out = '', CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(out);
  }
  function fromBase64(b64) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function gzip(text) {
    var stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(stream).arrayBuffer().then(function (buf) { return toBase64(new Uint8Array(buf)); });
  }
  function gunzip(b64) {
    var stream = new Blob([fromBase64(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  /* ── how full is this device ── */
  // Browsers give a page about 5 million characters of this kind of storage.
  var ROOM = 5 * 1024 * 1024;
  function usage() {
    var total = 0, rows = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i), n = k.length + (localStorage.getItem(k) || '').length;
      total += n; rows.push({ key: k, chars: n });
    }
    rows.sort(function (a, b) { return b.chars - a.chars; });
    return { chars: total, room: ROOM, share: total / ROOM, biggest: rows.slice(0, 8) };
  }

  window.nylaSafety = {
    getBase: getBase, setBase: setBase,
    collect: collect, snapshot: snapshot, listSnapshots: listSnapshots, getSnapshot: getSnapshot,
    keep: keep, listKept: listKept, removeKept: removeKept,
    canGzip: canGzip, gzip: gzip, gunzip: gunzip,
    usage: usage,
  };
})();
