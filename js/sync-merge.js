/* ── Sync merge: two devices, nothing lost ─────────────────────────
   Sync used to be all or nothing. The whole of Nyla OS went up as one
   block, and when two devices had both changed something, one device had
   to be chosen and the other's changes were thrown away.

   This merges instead. Every stored key is compared three ways: this
   device (local), the other device (remote), and the last state both
   agreed on (base).

     - Only one side changed a key: that side's value is taken.
     - Both changed a list of records (tasks, notebook pages, ideas,
       events...): merged record by record, by id. A page written on the
       phone and a task ticked on the laptop both survive.
     - Both changed the same record: merged field by field. Where both
       changed the same field, the more recently edited record wins and
       the other version is handed back in `kept`, which the app stores
       under Backup & Restore so it can always be brought back.
     - Text that can't be split (one long note edited in two places):
       the newer one wins, the other goes to `kept`.

   With no base (the first merge on a device) it can't tell "deleted
   here" from "added there", so it keeps everything found on either
   side, except records sitting in Recently Deleted, and prefers the
   other device when a record differs and carries no edit time, because
   the other device is the one that saved last.

   Pure: plain values in, plain values out. No storage, no network, no
   DOM. The only global is nylaSync.
──────────────────────────────────────────────────────────────── */
(function (root) {
  'use strict';

  // Keys that belong to one device and are never merged or uploaded.
  var LOCAL_ONLY = { nylaos_cloud_ts: 1, nylaos_dirty_flag: 1, nylaos_auto_bak: 1, nylaos_moodboard: 1 };
  var STAMP_FIELDS = ['updated', 'updatedAt', 'modified', 'modifiedAt', 'editedAt', 'completedAt', 'doneAt', 'deletedAt', 'created', 'createdAt'];
  var MAX_DEPTH = 6;

  function parse(s) {
    if (typeof s !== 'string') return undefined;
    try { return JSON.parse(s); } catch (e) { return undefined; }
  }
  function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isRecordList(v) {
    if (!Array.isArray(v)) return false;
    for (var i = 0; i < v.length; i++) if (!isMap(v[i]) || v[i].id == null) return false;
    return true; // an empty list counts: it merges cleanly with a list of records
  }
  // Key order is ignored, so a record rewritten with its fields in another
  // order still counts as unchanged.
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (isMap(v)) return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  function same(a, b) { return a === b || canon(a) === canon(b); }
  function idOf(rec) { return String(rec.id); }
  function index(list) { var m = new Map(); list.forEach(function (r) { m.set(idOf(r), r); }); return m; }

  // The latest moment a record says it was touched, or 0.
  function stampOf(rec) {
    var best = 0;
    if (!isMap(rec)) return 0;
    STAMP_FIELDS.forEach(function (f) {
      var v = rec[f], n = 0;
      if (typeof v === 'number') n = v;
      else if (typeof v === 'string' && v) n = /^\d{12,}$/.test(v) ? Number(v) : Date.parse(v);
      if (isFinite(n) && n > 946684800000 && n > best) best = n;
    });
    return best;
  }

  /* ctx: { hasBase, localTime, remoteTime, tombs, kept, key, stats } */
  function pickSide(ctx, l, r) {
    var ls = stampOf(l), rs = stampOf(r);
    if (ls !== rs) return ls > rs ? 'local' : 'remote';
    if (ctx.localTime !== ctx.remoteTime) return ctx.localTime > ctx.remoteTime ? 'local' : 'remote';
    return ctx.hasBase ? 'local' : 'remote';
  }
  function keep(ctx, side, value, recordId) {
    ctx.stats.clashes++;
    ctx.kept.push({ key: ctx.key, recordId: recordId == null ? null : String(recordId), from: side === 'local' ? 'this device' : 'other device', value: value });
  }

  function mergeValue(l, r, b, ctx, depth, recordId) {
    if (same(l, r)) return l;
    if (ctx.hasBase && b !== undefined) {
      if (same(l, b)) return r;
      if (same(r, b)) return l;
    }
    if (depth < MAX_DEPTH) {
      if (isRecordList(l) && isRecordList(r)) return mergeLists(l, r, isRecordList(b) ? b : null, ctx, depth + 1);
      if (isMap(l) && isMap(r)) return mergeMaps(l, r, isMap(b) ? b : null, ctx, depth + 1, recordId);
    }
    return undefined; // a real clash: the caller decides
  }

  function mergeMaps(l, r, b, ctx, depth, recordId) {
    var out = {}, clash = false, winner = null;
    var keys = Object.keys(l);
    Object.keys(r).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(l, k)) keys.push(k); });
    keys.forEach(function (k) {
      var lv = l[k], rv = r[k], bv = b ? b[k] : undefined;
      var inL = Object.prototype.hasOwnProperty.call(l, k), inR = Object.prototype.hasOwnProperty.call(r, k);
      var v;
      if (inL && inR) {
        v = mergeValue(lv, rv, bv, ctx, depth, recordId);
        if (v === undefined && !same(lv, rv)) {
          if (!winner) winner = pickSide(ctx, l, r);
          clash = true;
          v = winner === 'local' ? lv : rv;
        }
      } else if (inL) {
        // missing on the other device: removed there only if we never touched it
        if (b && Object.prototype.hasOwnProperty.call(b, k) && same(lv, bv)) return;
        v = lv;
      } else {
        if (b && Object.prototype.hasOwnProperty.call(b, k) && same(rv, bv)) return;
        v = rv;
      }
      out[k] = v;
    });
    if (clash) keep(ctx, winner === 'local' ? 'remote' : 'local', winner === 'local' ? r : l, recordId != null ? recordId : (l.id != null ? l.id : null));
    return out;
  }

  function mergeLists(l, r, b, ctx, depth) {
    var rm = index(r), bm = b ? index(b) : null, out = [], seen = new Set();
    l.forEach(function (rec) {
      var id = idOf(rec); if (seen.has(id)) return; seen.add(id);
      var other = rm.get(id), base = bm ? bm.get(id) : undefined;
      if (!other) {
        if (bm) { if (base && same(base, rec)) { ctx.stats.removed++; return; } }   // deleted on the other device, untouched here
        else if (buried(ctx, id, rec)) { ctx.stats.removed++; return; }
        out.push(rec); return;
      }
      if (same(rec, other)) { out.push(rec); return; }
      out.push(mergeMaps(rec, other, base || null, withBase(ctx, !!base), depth, rec.id));
      ctx.stats.recordsMerged++;
    });
    r.forEach(function (rec, i) {
      var id = idOf(rec); if (seen.has(id)) return; seen.add(id);
      var base = bm ? bm.get(id) : undefined;
      if (bm) { if (base && same(base, rec)) { ctx.stats.removed++; return; } }     // deleted here, untouched there
      else if (buried(ctx, id, rec)) { ctx.stats.removed++; return; }
      // Put it where the other device had it: right after its neighbour there.
      var at = -1;
      for (var j = i - 1; j >= 0 && at < 0; j--) { var pid = idOf(r[j]); at = out.findIndex(function (x) { return idOf(x) === pid; }); }
      if (at >= 0) out.splice(at + 1, 0, rec); else if (i === 0) out.unshift(rec); else out.push(rec);
      ctx.stats.added++;
    });
    return out;
  }
  // A record inside a list is compared against its own base copy; whether
  // the list as a whole had a base doesn't decide a clash inside it.
  function withBase(ctx, has) {
    if (ctx.hasBase === has) return ctx;
    var c = {}; Object.keys(ctx).forEach(function (k) { c[k] = ctx[k]; }); c.hasBase = has; return c;
  }
  // In Recently Deleted on either device, and not edited since it went there.
  function buried(ctx, id, rec) {
    var at = ctx.tombs.get(ctx.key + '\n' + id);
    return at != null && stampOf(rec) <= at;
  }
  function tombstones(local, remote) {
    var m = new Map();
    [local, remote].forEach(function (snap) {
      var t = parse(snap && snap.nylaos_trash);
      if (!Array.isArray(t)) return;
      t.forEach(function (x) {
        if (!isMap(x) || !x.storageKey || !isMap(x.data) || x.data.id == null) return;
        var k = x.storageKey + '\n' + String(x.data.id), at = Date.parse(x.deletedAt) || 0;
        if (!m.has(k) || m.get(k) < at) m.set(k, at);
      });
    });
    return m;
  }

  /* merge(local, remote, base, opts)
       local, remote   { key: string value }   what each device holds
       base            the same, from the last sync both agreed on, or null
       opts.localTimes / opts.remoteTimes   { key: ms } when each key last changed
     returns { merged, toLocal, toRemote, kept, stats }
       toLocal    keys whose value on this device must change (value undefined = remove)
       toRemote   true when the cloud copy differs from merged and must be pushed  */
  function merge(local, remote, base, opts) {
    opts = opts || {};
    local = local || {}; remote = remote || {};
    var hasBase = !!base, lt = opts.localTimes || {}, rt = opts.remoteTimes || {};
    var kept = [], stats = { keys: 0, fromOther: 0, fromHere: 0, recordsMerged: 0, added: 0, removed: 0, clashes: 0 };
    var tombs = hasBase ? new Map() : tombstones(local, remote);
    var merged = {}, names = {};
    [local, remote, base || {}].forEach(function (s) { Object.keys(s).forEach(function (k) { names[k] = 1; }); });

    Object.keys(names).forEach(function (k) {
      if (LOCAL_ONLY[k] || k.indexOf('nylaos_') !== 0) return;
      var L = local[k], R = remote[k], B = hasBase ? base[k] : undefined, out;
      stats.keys++;
      if (L === R) out = L;
      else if (hasBase && L === B) { out = R; stats.fromOther++; }
      else if (hasBase && R === B) { out = L; stats.fromHere++; }
      else if (L === undefined) { out = R; stats.fromOther++; }        // changed there, gone or never here: keep what exists
      else if (R === undefined) { out = L; stats.fromHere++; }
      else {
        var ctx = { hasBase: hasBase, key: k, kept: kept, stats: stats, tombs: tombs, localTime: Number(lt[k]) || 0, remoteTime: Number(rt[k]) || 0 };
        var l = parse(L), r = parse(R), b = parse(B), v;
        if (l !== undefined && r !== undefined && (isRecordList(l) || isMap(l)) && (isRecordList(r) || isMap(r)) && Array.isArray(l) === Array.isArray(r)) {
          v = Array.isArray(l) ? mergeLists(l, r, isRecordList(b) ? b : null, ctx, 1) : mergeMaps(l, r, isMap(b) ? b : null, ctx, 1, null);
          out = JSON.stringify(v);
        } else {
          // Text, or two shapes that don't match: the newer whole value wins.
          var side = ctx.localTime !== ctx.remoteTime ? (ctx.localTime > ctx.remoteTime ? 'local' : 'remote') : (hasBase ? 'local' : 'remote');
          out = side === 'local' ? L : R;
          keep(ctx, side === 'local' ? 'remote' : 'local', side === 'local' ? R : L, null);
        }
      }
      if (out !== undefined) merged[k] = out;
    });

    var toLocal = {}, toRemote = false;
    Object.keys(names).forEach(function (k) {
      if (LOCAL_ONLY[k] || k.indexOf('nylaos_') !== 0) return;
      if (merged[k] !== local[k]) toLocal[k] = merged[k];
      if (merged[k] !== remote[k]) toRemote = true;
    });
    return { merged: merged, toLocal: toLocal, toRemote: toRemote, kept: kept, stats: stats };
  }

  var api = { merge: merge, LOCAL_ONLY: LOCAL_ONLY, _same: same, _stampOf: stampOf };
  root.nylaSync = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
