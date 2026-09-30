/* ── Boot: open the app without re-translating it every time ───────
   Nyla OS is written in JSX, which a browser can't run as it is. Babel
   used to translate the whole app on every single open: download and
   start Babel (3 MB), then about 1.8 s of translating on a laptop and
   several seconds on a phone, before anything showed.

   Now the translated code is kept on the device (IndexedDB), and each
   piece is stored with a fingerprint of the source it came from. On a
   normal open every fingerprint matches, so the saved code runs at once
   and Babel is never even downloaded. After an update only the pieces
   that changed are translated again, once, and saved.

   The app's scripts are marked type="text/nyla-jsx" so the browser
   leaves them alone until this file runs them, in page order, as
   ordinary scripts: exactly what Babel did, so top-level names are
   still shared between them.

   If the saved copy can't be read (private window, storage blocked,
   anything unexpected) it falls back to translating, the old way.
   Nothing here touches her data: the database "nylaos_boot" holds
   translated code only, never leaves the device, and can be deleted at
   any time (the next open rebuilds it).

   One feature file that can't be fetched or translated is skipped and
   the rest of the app still opens; only the main script is essential.

   window.__boot records what happened, for checking load speed:
   { ms, reused, translated, babelLoaded, skipped, error }.
──────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var BABEL_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.4/babel.min.js';
  var BABEL_SRI = 'sha384-x/ilTFv/u/eu6YSmkFDZl5V5Mm/pkxxcVv2cVJOrr1J0rvILhMvRBCy6yA75wYBj';
  // Part of every fingerprint: change it when the Babel version or the
  // settings below change, so nothing translated the old way is reused.
  var RECIPE = 'babel-7.26.4|react|flow-strip-types|1'; // change BABEL_SRC and BABEL_SRI with it
  var DB_NAME = 'nylaos_boot', STORE = 'compiled';
  var t0 = performance.now();
  var report = window.__boot = { ms: null, reused: 0, translated: 0, babelLoaded: false, skipped: [], error: '' };

  var tags = Array.prototype.slice.call(document.querySelectorAll('script[type="text/nyla-jsx"]'));
  if (!tags.length) return;

  // cyrb53: fast, well spread, and plenty for telling two versions of a
  // file apart. The length is stored beside it as a second check.
  function fingerprint(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + str.length + ':' + RECIPE;
  }

  // ── The saved copies ──────────────────────────────────────────────
  // Every call settles: a database that never answers must not leave the
  // app waiting behind it.
  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(fallback); } }, ms);
      promise.then(function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
                   function () { if (!done) { done = true; clearTimeout(timer); resolve(fallback); } });
    });
  }
  function openDb() {
    return withTimeout(new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('no indexedDB')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'name' }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('blocked')); };
    }), 2500, null);
  }
  function readAll(db) {
    if (!db) return Promise.resolve({});
    return withTimeout(new Promise(function (resolve, reject) {
      var out = {};
      var req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = function () { (req.result || []).forEach(function (r) { out[r.name] = r; }); resolve(out); };
      req.onerror = function () { reject(req.error); };
    }), 2500, {});
  }
  // Saves what was translated and forgets files the page no longer has.
  function writeAll(db, fresh, keep) {
    if (!db) return;
    try {
      var tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
      fresh.forEach(function (r) { store.put(r); });
      var all = store.getAllKeys();
      all.onsuccess = function () { (all.result || []).forEach(function (name) { if (keep.indexOf(name) < 0) store.delete(name); }); };
    } catch (e) { /* a full or locked store only means translating again next time */ }
  }

  // ── The source of each script ─────────────────────────────────────
  function sourceOf(tag, i) {
    var src = tag.getAttribute('src');
    if (!src) return Promise.resolve({ name: 'nyla-os.html#' + i, code: tag.textContent });
    return fetch(src, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error(src + ' answered ' + res.status);
      return res.text();
    }).then(function (code) { return { name: src, code: code }; },
            function (err) { skip(src, err); return { name: src, code: null }; });
  }
  function skip(name, err) {
    report.skipped.push(name);
    console.error('[boot] left out ' + name + ':', err);
  }

  // ── Babel, only when something has to be translated ───────────────
  var babelReady = null;
  function loadBabel() {
    if (window.Babel) return Promise.resolve();
    if (babelReady) return babelReady;
    babelReady = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = BABEL_SRC;
      // The browser refuses the file unless it is byte for byte this one. What Babel writes is
      // kept and reused for a long time, so a tampered copy must never get to write it.
      s.integrity = BABEL_SRI;
      s.crossOrigin = 'anonymous';
      s.onload = function () { report.babelLoaded = true; resolve(); };
      s.onerror = function () { reject(new Error('Babel could not be loaded')); };
      document.head.appendChild(s);
    });
    return babelReady;
  }
  function translate(unit) {
    // The same settings the page's babel tags used: JSX becomes plain calls,
    // everything else stays modern JavaScript. No source map: it tripled the
    // size of what had to be produced and kept.
    return window.Babel.transform(unit.code, {
      filename: unit.name,
      presets: ['react'],
      plugins: ['transform-flow-strip-types'],
      compact: unit.code.length > 500000,
      comments: false,
    }).code;
  }

  // Runs code the way a <script> in the page runs: at the top level, in
  // order, sharing names with the scripts before and after it.
  function run(code, name) {
    var s = document.createElement('script');
    s.setAttribute('data-boot', name);
    s.text = code + '\n//# sourceURL=' + location.origin + '/boot/' + name.replace(/[^\w./#-]/g, '_');
    document.head.appendChild(s);
  }

  function showFailure(err) {
    report.error = String(err && err.message || err);
    console.error('[boot]', err);
    var root = document.getElementById('root');
    if (!root || root.textContent.trim()) return;
    var box = document.createElement('div');
    box.style.cssText = 'max-width:420px;margin:18vh auto 0;padding:24px;text-align:center;font-family:"DM Sans",system-ui,sans-serif;color:#6b4a55;line-height:1.6;';
    var title = document.createElement('div');
    title.style.cssText = 'font-family:"DM Serif Display",Georgia,serif;font-size:24px;color:#b5637a;margin-bottom:8px;';
    title.textContent = 'Nyla OS couldn’t finish opening ✦';
    var text = document.createElement('div');
    text.style.cssText = 'font-size:14px;margin-bottom:16px;';
    text.textContent = 'This usually means the connection dropped while it was loading. Your notes and tasks are safe on this device.';
    var btn = document.createElement('button');
    btn.textContent = 'Try again';
    btn.style.cssText = 'padding:10px 22px;border-radius:999px;border:none;background:#b5637a;color:#fff;font:inherit;font-size:14px;cursor:pointer;';
    btn.onclick = function () { location.reload(); };
    box.appendChild(title); box.appendChild(text); box.appendChild(btn);
    root.appendChild(box);
  }

  var dbRef = null;
  Promise.all([
    openDb().then(function (db) { dbRef = db; return readAll(db); }),
    Promise.all(tags.map(sourceOf)),
  ]).then(function (both) {
    var saved = both[0], units = both[1].filter(function (u) { return u.code != null; });
    if (!units.some(function (u) { return u.name.indexOf('nyla-os.html#') === 0; })) throw new Error('the main script is missing');
    units.forEach(function (u) {
      u.key = fingerprint(u.code);
      var hit = saved[u.name];
      if (hit && hit.key === u.key && typeof hit.code === 'string') u.out = hit.code;
    });
    var stale = units.filter(function (u) { return u.out == null; });
    if (!stale.length) return units;
    return loadBabel().then(function () {
      var fresh = [];
      stale.forEach(function (u) {
        try { u.out = translate(u); fresh.push({ name: u.name, key: u.key, code: u.out }); }
        catch (err) { if (u.name.indexOf('nyla-os.html#') === 0) throw err; skip(u.name, err); }
      });
      report.translated = fresh.length;
      writeAll(dbRef, fresh, units.map(function (u) { return u.name; }));
      return units.filter(function (u) { return u.out != null; });
    });
  }).then(function (units) {
    report.reused = units.length - report.translated;
    units.forEach(function (u) { run(u.out, u.name); });
    report.ms = Math.round(performance.now() - t0);
  }).catch(showFailure);
})();
