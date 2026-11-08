/* The Financial Astrology page, drawn the same way in all three dashboards.

   One global: window.moneySkyView. It needs window.moneySky (money-sky-core.js)
   and a way to load astronomy-engine, which each host passes in.

     moneySkyView.mount(el, {
       loadAstronomy: () => Promise<Astronomy>,
       names: [{ label, name }],   // business names for the name numbers
       businesses: ['semesterhq'], // business charts to show (ids in moneySky.BUSINESSES)
       context: 'Semester HQ',     // a word under the title, optional
       showTitle: true
     }) → { destroy }

   Colors come from CSS variables the host sets on el (or any parent):
   --msk-ink, --msk-muted, --msk-line, --msk-card, --msk-soft, --msk-accent,
   --msk-good, --msk-bad, --msk-warn. Every one has a fallback.

   THE SOURCE OF TRUTH IS nyla-os js/money-sky-view.js; the Business OS copies
   are made by tools/sync-money-sky.mjs in the Nyla OS repo. Edit there.

   What it remembers (this browser only, never synced): the tab, the purpose,
   the place used for planetary hours. Keys start with msk_. */
(function () {
  'use strict';
  var CSS = '\
.msk{--_ink:var(--msk-ink,#2a2224);--_mu:var(--msk-muted,#7d7173);--_ln:var(--msk-line,rgba(0,0,0,.1));--_cd:var(--msk-card,#fff);--_sf:var(--msk-soft,rgba(0,0,0,.035));--_ac:var(--msk-accent,#b0577a);--_gd:var(--msk-good,#2f8a4c);--_bd:var(--msk-bad,#c0445f);--_wn:var(--msk-warn,#b7791f);color:var(--_ink);font-size:13.5px;line-height:1.5;min-width:0}\
.msk *{box-sizing:border-box}.msk-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:10px}\
.msk-title{font-size:21px;font-weight:600;letter-spacing:-.01em}.msk-sub{color:var(--_mu);font-size:12.5px}\
.msk-tabs{display:flex;gap:2px;border-bottom:1px solid var(--_ln);margin-bottom:14px;overflow-x:auto;scrollbar-width:none}.msk-tabs::-webkit-scrollbar{display:none}\
.msk-tab{appearance:none;background:none;border:0;border-bottom:2px solid transparent;color:var(--_mu);font:inherit;font-weight:500;padding:8px 12px;cursor:pointer;white-space:nowrap;margin-bottom:-1px}.msk-tab.on{color:var(--_ink);border-bottom-color:var(--_ac)}\
.msk-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:12px}.msk-grid>*{min-width:0}\
.msk-card{background:var(--_cd);border:1px solid var(--_ln);border-radius:12px;padding:14px 16px;min-width:0}.msk-card h3{margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:.01em}.msk-card h3 small{font-weight:400;color:var(--_mu);margin-left:6px}\
.msk-hero{margin-bottom:12px}.msk-mu{color:var(--_mu)}.msk-sm{font-size:12px}.msk-big{font-size:18px;font-weight:600;margin:2px 0 4px}\
.msk-chips{display:flex;flex-wrap:wrap;gap:6px}.msk-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--_ln);border-radius:999px;padding:2px 9px;font-size:12px;background:var(--_sf);white-space:nowrap}\
button.msk-chip{cursor:pointer;font:inherit;font-size:12.5px;color:var(--_ink);padding:4px 11px}button.msk-chip.on{border-color:var(--_ac);background:var(--_ac);color:#fff}\
.msk-tone-easy,.msk-g-Strong{color:var(--_gd)}.msk-tone-hard,.msk-g-Wait{color:var(--_bd)}.msk-g-Good{color:var(--_gd);opacity:.85}.msk-g-Neutral{color:var(--_mu)}\
.msk-row{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--_ln)}.msk-row:first-child{border-top:0}.msk-row>.msk-ic{width:22px;flex:none;text-align:center}.msk-row>.msk-main{flex:1;min-width:0}.msk-row>.msk-side{flex:none;text-align:right;font-size:12px;color:var(--_mu)}\
.msk-bar{height:6px;border-radius:3px;background:var(--_sf);position:relative;overflow:hidden;margin-top:5px}.msk-bar>i{position:absolute;top:0;bottom:0;border-radius:3px}\
.msk-why{margin:6px 0 0;padding:0;list-style:none}.msk-why li{padding:2px 0 2px 34px;position:relative;font-size:12.5px}.msk-why li:before{content:attr(data-d);position:absolute;left:0;top:3px;font-size:11px;font-weight:600;width:30px;font-variant-numeric:tabular-nums}\
.msk-why li.up:before{color:var(--_gd)}.msk-why li.dn:before{color:var(--_bd)}\
.msk-table{width:100%;border-collapse:collapse;font-size:12.5px}.msk-table td,.msk-table th{text-align:left;padding:6px 6px;border-top:1px solid var(--_ln);vertical-align:top}.msk-table th{font-weight:500;color:var(--_mu);border-top:0}\
.msk-wrap{overflow-x:auto}.msk-rx{font-size:10.5px;color:var(--_bd);font-weight:600;margin-left:3px}.msk-money{color:var(--_ac);font-weight:600}\
.msk-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.msk-cal .msk-dow{font-size:11px;color:var(--_mu);text-align:center;padding-bottom:2px}\
.msk-day{appearance:none;border:1px solid var(--_ln);border-radius:8px;background:var(--_cd);color:var(--_ink);font:inherit;padding:5px 4px 4px;min-height:52px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:2px;min-width:0}\
.msk-day b{font-size:12px;font-weight:600}.msk-day span{font-size:10.5px;color:var(--_mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.msk-day.sel{outline:2px solid var(--_ac);outline-offset:-1px}.msk-day.blank{visibility:hidden}\
.msk-day.Strong{background:color-mix(in srgb,var(--_gd) 22%,var(--_cd))}.msk-day.Good{background:color-mix(in srgb,var(--_gd) 10%,var(--_cd))}.msk-day.Wait{background:color-mix(in srgb,var(--_bd) 13%,var(--_cd))}\
.msk-mo{font-size:12px;font-weight:600;margin:10px 0 6px}.msk-num{font-size:28px;font-weight:600;line-height:1.1}.msk-nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:12px}\
.msk-how{margin-top:14px}.msk-how summary{cursor:pointer;color:var(--_mu);font-size:12.5px}.msk-place{font:inherit;font-size:12px;border:1px solid var(--_ln);border-radius:6px;background:var(--_cd);color:var(--_ink);padding:2px 4px;max-width:100%}\
.msk-now{background:var(--_sf);border-radius:6px}.msk-load{padding:28px 0;text-align:center;color:var(--_mu)}.msk-link{appearance:none;background:none;border:0;color:var(--_ac);font:inherit;font-size:12px;cursor:pointer;padding:0}\
@media (max-width:560px){.msk-hide-sm{display:none}.msk-day{min-height:44px}.msk-day span{display:none}}';

  var PLACES = [
    ['raleigh', 'Raleigh, NC', 35.7796, -78.6382], ['charlotte', 'Charlotte, NC', 35.2271, -80.8431], ['atlanta', 'Atlanta, GA', 33.749, -84.388],
    ['newyork', 'New York, NY', 40.7128, -74.006], ['chicago', 'Chicago, IL', 41.8781, -87.6298], ['houston', 'Houston, TX', 29.7604, -95.3698],
    ['losangeles', 'Los Angeles, CA', 34.0522, -118.2437], ['london', 'London, UK', 51.5074, -0.1278]
  ];
  var TABS = [['today', 'Today'], ['calendar', 'Calendar'], ['map', 'Money map'], ['numbers', 'Numbers']];
  var cache = {};   // per day, shared across mounts: the sums only change at midnight

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function get(k, d) { try { var v = localStorage.getItem('msk_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function put(k, v) { try { localStorage.setItem('msk_' + k, JSON.stringify(v)); } catch (e) { /* private mode: fine */ } }
  function tm(t) { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function dy(t, long) { return new Date(t).toLocaleDateString([], long ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' }); }
  function dyY(t) { return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }
  function sameDay(a, b) { var x = new Date(a), y = new Date(b); return x.toDateString() === y.toDateString(); }
  function sgn(d) { return (d > 0 ? '+' : '') + d; }
  function gradeColor(g) { return g === 'Strong' || g === 'Good' ? 'var(--_gd)' : g === 'Wait' ? 'var(--_bd)' : 'var(--_mu)'; }
  function why(reasons, n) { return '<ul class="msk-why">' + reasons.slice(0, n || 99).map(function (r) { return '<li class="' + (r.delta > 0 ? 'up' : 'dn') + '" data-d="' + esc(sgn(r.delta)) + '">' + esc(r.text) + '</li>'; }).join('') + '</ul>'; }
  function bar(score) { var w = Math.min(50, Math.abs(score) * 8); return '<div class="msk-bar"><i style="left:' + (score >= 0 ? 50 : 50 - w) + '%;width:' + w + '%;background:' + (score >= 0 ? 'var(--_gd)' : 'var(--_bd)') + '"></i><i style="left:50%;width:1px;background:var(--_ln)"></i></div>'; }
  function yieldNow() { return new Promise(function (res) { if (typeof MessageChannel === 'undefined') return setTimeout(res, 0); var ch = new MessageChannel(); ch.port1.onmessage = function () { res(); }; ch.port2.postMessage(0); }); }

  function mount(el, opts) {
    opts = opts || {};
    var S = window.moneySky, P = S.PROFILE, A = null, dead = false;
    var BIZ = (opts.businesses || []).map(function (id) { return S.BUSINESSES.filter(function (b) { return b.id === id; })[0]; }).filter(Boolean);
    var tabs = TABS.slice(0, 3).concat(BIZ.length ? [['business', BIZ.length > 1 ? 'Business charts' : 'Business chart']] : [], TABS.slice(3));
    var st = { tab: get('tab', 'today'), biz: get('biz', BIZ.length ? BIZ[0].id : null), purpose: get('purpose', 'ask'), sel: null, moneyOnly: get('moneyOnly', true), place: get('place', 'raleigh') };
    if (!tabs.some(function (t) { return t[0] === st.tab; })) st.tab = 'today';
    if (!document.getElementById('msk-style')) { var s = document.createElement('style'); s.id = 'msk-style'; s.textContent = CSS; document.head.appendChild(s); }
    el.innerHTML = '<div class="msk"><div class="msk-load">Reading the sky…</div></div>';
    var root = el.firstChild;

    function place() {
      if (st.place && typeof st.place === 'object') return st.place;
      var p = PLACES.filter(function (x) { return x[0] === st.place; })[0] || PLACES[0];
      return { id: p[0], name: p[1], lat: p[2], lng: p[3] };
    }

    function data() {
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var key = S.util.dateKey(today.getTime()), c = cache[key] || (cache[key] = {});
      if (!c.map) c.map = S.moneyMap(P);
      if (!c.sky || Date.now() - c.sky.at > 10 * 60000) c.sky = S.skyNow(A, P, Date.now());
      if (!c.today) c.today = S.calendar(A, P, today.getTime(), 1)[0];
      if (!c.retro) c.retro = S.retroPeriods(A, today.getTime(), 120);
      if (!c.keys) c.keys = S.keyDates(A, P, today.getTime(), 120);
      var pl = place(), pk = pl.lat.toFixed(2) + ',' + pl.lng.toFixed(2);
      if (!c.hours || c.hoursKey !== pk) { c.hours = S.planetaryHours(A, pl.lat, pl.lng, today.getTime()); c.hoursKey = pk; }
      if (!c.vocToday) c.vocToday = S.vocWindows(A, today.getTime(), today.getTime() + 86400000);
      c.start = today.getTime(); c.key = key;
      return c;
    }
    function ensureCalendar(c) {
      if (c.cal || c.calPromise) return c.calPromise || Promise.resolve(c.cal);
      c.calPromise = (async function () {
        var days = S.util.localDays(c.start, 63), ctx = S.rangeContext(A, P, days[0].start, days[days.length - 1].end), out = [];
        for (var i = 0; i < days.length; i++) {
          var f = S.dayFacts(A, P, days[i].start, days[i].end, ctx), sc = S.scoreAll(f); f.scores = sc.scores; f.best = sc.best; out.push(f);
          if (i % 7 === 6) await yieldNow();
        }
        c.cal = out; return out;
      })();
      return c.calPromise;
    }
    function ensureCycles(c) { if (!c.cycles) c.cycles = S.bigCycles(A, P, Date.now()); return c.cycles; }

    // ── Today ──
    function purposeOf(k) { return S.PURPOSES.filter(function (p) { return p.key === k; })[0]; }
    function tabToday(c) {
      var d = c.today, sky = c.sky, num = S.numbers(P, Date.now(), opts.names), bp = purposeOf(d.best), bs = d.scores[d.best];
      var html = '<div class="msk-card msk-hero"><div class="msk-chips" style="margin-bottom:6px"><span class="msk-chip">' + esc(dy(Date.now(), true)) + '</span><span class="msk-chip">' + sky.moon.phase.emoji + ' ' + esc(sky.moon.phase.name) + ' in ' + esc(sky.moon.sign) + '</span><span class="msk-chip">Personal day ' + num.personalDay + ' · ' + esc(S.NUM_MONEY[num.personalDay].name) + '</span><span class="msk-chip">Personal year ' + num.personalYear + '</span></div>'
        + '<div class="msk-mu msk-sm">Best use of today</div><div class="msk-big">' + bp.emoji + ' ' + esc(bp.label) + ' <span style="color:' + gradeColor(bs.grade) + ';font-size:14px">' + esc(bs.grade) + '</span></div>' + why(bs.reasons, 4)
        + '<div style="margin-top:10px">' + S.PURPOSES.map(function (p) { var s = d.scores[p.key]; return '<details class="msk-row" style="display:block"><summary style="cursor:pointer;list-style:none;display:flex;gap:10px;align-items:center"><span style="width:22px;text-align:center">' + p.emoji + '</span><span style="flex:1;min-width:0">' + esc(p.label) + ' <span class="msk-mu msk-sm msk-hide-sm">' + esc(p.hint) + '</span>' + bar(s.score) + '</span><span class="msk-sm" style="width:70px;text-align:right;color:' + gradeColor(s.grade) + '">' + esc(s.grade) + ' ' + esc(sgn(s.score)) + '</span></summary>' + why(s.reasons) + '</details>'; }).join('') + '</div></div>';

      var vocs = c.vocToday.filter(function (v) { return sameDay(v.start, c.start) || sameDay(v.end, c.start) || (v.start < c.start && v.end > c.start + 86400000); });
      var moon = '<div class="msk-card"><h3>The Moon</h3><div class="msk-big" style="font-size:16px">' + sky.moon.phase.emoji + ' ' + esc(sky.moon.phase.name) + ' in ' + esc(sky.moon.sign) + '</div>'
        + '<div class="msk-mu msk-sm">' + sky.moon.phase.illumination + '% lit · in your ' + S.util.ordinal(sky.moon.house) + ' house (' + esc(sky.moon.houseName) + '): ' + esc(sky.moon.theme) + '</div>'
        + '<div style="margin-top:8px">' + (vocs.length ? vocs.map(function (v) { return '<div class="msk-row"><span class="msk-ic">⏸</span><div class="msk-main"><b>Void of course</b> ' + esc((sameDay(v.start, c.start) ? tm(v.start) : dy(v.start) + ' ' + tm(v.start)) + ' to ' + (sameDay(v.end, c.start) ? tm(v.end) : dy(v.end) + ' ' + tm(v.end))) + '<div class="msk-mu msk-sm">Then into ' + esc(v.into) + '. Hold signatures and launches; fine for routine work and the books.</div></div></div>'; }).join('') : '<div class="msk-row"><span class="msk-ic">✓</span><div class="msk-main">No void-of-course Moon today.</div></div>') + '</div></div>';

      var h = c.hours, now = Date.now(), pl = place();
      var hoursHtml = '<div class="msk-card"><h3>Money hours today <small>planetary hours</small></h3>';
      if (h) {
        var good = h.hours.filter(function (x) { return (x.ruler === 'Jupiter' || x.ruler === 'Venus' || x.ruler === 'Mercury') && x.end > now - 3600000 && x.start < c.start + 26 * 3600000; });
        hoursHtml += '<div class="msk-mu msk-sm" style="margin-bottom:4px">' + esc(h.dayRuler) + '’s day · sunrise ' + esc(tm(h.sunrise)) + ', sunset ' + esc(tm(h.sunset)) + '</div>'
          + good.map(function (x) { var on = x.start <= now && now < x.end; return '<div class="msk-row' + (on ? ' msk-now' : '') + '"><span class="msk-ic">' + x.glyph + '</span><div class="msk-main"><b>' + esc(x.ruler) + '</b> ' + esc(tm(x.start) + ' to ' + tm(x.end)) + (on ? ' <span class="msk-money">now</span>' : '') + '<div class="msk-mu msk-sm">' + esc(x.use) + '</div></div></div>'; }).join('');
      } else hoursHtml += '<div class="msk-mu">The Sun does not rise and set normally here today.</div>';
      hoursHtml += '<div class="msk-sm msk-mu" style="margin-top:8px">For <select class="msk-place" data-msk-place>' + PLACES.map(function (p) { return '<option value="' + p[0] + '"' + (pl.id === p[0] ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('') + (pl.id === 'here' ? '<option value="here" selected>' + esc(pl.name) + '</option>' : '') + '</select> <button class="msk-link" data-msk-here>Use where I am</button></div></div>';

      var tr = sky.transits.length ? sky.transits.map(function (x) { return '<div class="msk-row"><span class="msk-ic msk-tone-' + x.tone + '">' + (x.tone === 'easy' ? '▲' : x.tone === 'hard' ? '▼' : '◆') + '</span><div class="msk-main"><b>' + esc(x.title) + '</b><div class="msk-mu msk-sm">' + esc(x.text) + '</div></div><div class="msk-side">' + x.orb + '°<br>' + (x.applying ? (x.exactInDays != null ? 'exact in ~' + x.exactInDays + 'd' : 'building') : 'fading') + '</div></div>'; }).join('') : '<div class="msk-mu">No slow planet is touching your money points right now.</div>';
      var trHtml = '<div class="msk-card"><h3>Touching your money points now</h3>' + tr + '</div>';

      var rx = c.retro.filter(function (r) { return r.start != null && r.start <= now && (r.end == null || r.end > now); });
      var nextK = c.keys.filter(function (k) { return k.at > now && k.money; }).slice(0, 4);
      var rxHtml = '<div class="msk-card"><h3>Retrogrades and what is next</h3>' + (rx.length ? rx.map(function (r) { return '<div class="msk-row"><span class="msk-ic">' + r.glyph + '</span><div class="msk-main"><b>' + esc(r.planet) + ' retrograde</b> until ' + esc(r.end ? dy(r.end) : 'later') + '<div class="msk-mu msk-sm">' + esc(r.text) + '</div></div></div>'; }).join('') : '<div class="msk-row"><span class="msk-ic">✓</span><div class="msk-main">Mercury and Venus are both moving forward.</div></div>')
        + nextK.map(function (k) { return '<div class="msk-row"><span class="msk-ic">' + esc(k.emoji) + '</span><div class="msk-main"><b>' + esc(k.title) + '</b><div class="msk-mu msk-sm">' + esc(k.text) + '</div></div><div class="msk-side">' + esc(dy(k.at)) + '</div></div>'; }).join('') + '</div>';

      var plHtml = '<div class="msk-card"><h3>Planets in your houses now</h3><div class="msk-wrap"><table class="msk-table"><tr><th></th><th>Where</th><th>Your house</th></tr>' + sky.planets.map(function (p) { return '<tr><td>' + p.glyph + ' ' + esc(p.name) + '</td><td>' + esc(p.pos) + (p.rx ? '<span class="msk-rx">R</span>' : '') + '</td><td' + (p.money ? ' class="msk-money"' : '') + '>' + S.util.ordinal(p.house) + ' · ' + esc(p.houseName) + '</td></tr>'; }).join('') + '</table></div><div class="msk-sm msk-mu" style="margin-top:6px">Highlighted: your money houses (2nd income, 6th daily work, 8th shared money, 10th career).</div></div>';

      return html + '<div class="msk-grid">' + moon + hoursHtml + trHtml + rxHtml + plHtml + '</div>';
    }

    // ── Calendar ──
    function tabCalendar(c) {
      if (!c.cal) { ensureCalendar(c).then(function () { if (!dead && st.tab === 'calendar') draw(); }); return '<div class="msk-load">Scoring the next nine weeks…</div>'; }
      var cal = c.cal, p = purposeOf(st.purpose) || S.PURPOSES[1], r = S.rankFor(cal, p.key, 6, 3);
      var chips = '<div class="msk-chips" style="margin-bottom:12px">' + S.PURPOSES.map(function (x) { return '<button class="msk-chip' + (x.key === p.key ? ' on' : '') + '" data-msk-purpose="' + x.key + '">' + x.emoji + ' ' + esc(x.label) + '</button>'; }).join('') + '</div>';
      var line = function (x) { return '<div class="msk-row"><span class="msk-ic" style="color:' + gradeColor(x.s.grade) + '">' + (x.s.score >= 0 ? '▲' : '▼') + '</span><div class="msk-main"><button class="msk-link" style="font-size:13px;color:var(--_ink);font-weight:600" data-msk-day="' + x.day.key + '">' + esc(dy(x.day.start)) + '</button>' + why(x.s.reasons, 2) + '</div><div class="msk-side" style="color:' + gradeColor(x.s.grade) + '">' + esc(x.s.grade) + '<br>' + esc(sgn(x.s.score)) + '</div></div>'; };
      var lists = '<div class="msk-grid" style="margin-bottom:12px"><div class="msk-card"><h3>Best days for ' + esc(p.label.toLowerCase()) + ' <small>next 9 weeks</small></h3>' + r.best.map(line).join('') + '</div><div class="msk-card"><h3>Days to skip</h3>' + (r.avoid.length ? r.avoid.map(line).join('') : '<div class="msk-mu">No day in the next nine weeks counts against this.</div>') + '</div></div>';

      var sel = cal.filter(function (d) { return d.key === st.sel; })[0] || cal[0];
      var grid = '', month = -1;
      cal.forEach(function (d, i) {
        var dt = new Date(d.start);
        if (dt.getMonth() !== month) {
          if (month !== -1) grid += '</div>';
          month = dt.getMonth();
          grid += '<div class="msk-mo">' + esc(dt.toLocaleDateString([], { month: 'long', year: 'numeric' })) + '</div><div class="msk-cal">' + ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(function (x) { return '<div class="msk-dow">' + x + '</div>'; }).join('');
          for (var b = 0; b < dt.getDay(); b++) grid += '<div class="msk-day blank"></div>';
        }
        var s = d.scores[p.key];
        grid += '<button class="msk-day ' + s.grade + (d.key === sel.key ? ' sel' : '') + '" data-msk-day="' + d.key + '" title="' + esc(dy(d.start) + ': ' + s.grade) + '"><b>' + dt.getDate() + '</b><span>' + esc(s.grade) + '</span></button>';
        if (i === cal.length - 1) grid += '</div>';
      });
      var detail = '<div class="msk-card"><h3>' + esc(dy(sel.start, true)) + '</h3><div class="msk-mu msk-sm" style="margin-bottom:6px">Moon in ' + esc(sel.moonSign) + ' · personal day ' + sel.pd + (sel.vocs.length ? ' · void of course ' + sel.vocs.map(function (v) { return (sameDay(v.start, sel.start) ? tm(v.start) : 'earlier') + ' to ' + (sameDay(v.end, sel.start) ? tm(v.end) : 'later'); }).join(', ') : '') + '</div>'
        + S.PURPOSES.map(function (x) { var s = sel.scores[x.key]; return '<details class="msk-row" style="display:block"' + (x.key === p.key ? ' open' : '') + '><summary style="cursor:pointer;list-style:none;display:flex;gap:10px"><span style="width:22px;text-align:center">' + x.emoji + '</span><span style="flex:1">' + esc(x.label) + '</span><span class="msk-sm" style="color:' + gradeColor(s.grade) + '">' + esc(s.grade) + ' ' + esc(sgn(s.score)) + '</span></summary>' + why(s.reasons) + '</details>'; }).join('') + '</div>';

      var keys = c.keys.filter(function (k) { return !st.moneyOnly || k.money; });
      var keysHtml = '<div class="msk-card" style="margin-top:12px"><h3>Key dates ahead <small>next 4 months</small> <label class="msk-sm msk-mu" style="float:right;font-weight:400"><input type="checkbox" data-msk-moneyonly' + (st.moneyOnly ? ' checked' : '') + '> money only</label></h3>'
        + keys.map(function (k) { return '<div class="msk-row"><span class="msk-ic">' + esc(k.emoji) + '</span><div class="msk-main"><b>' + esc(k.title) + '</b><div class="msk-mu msk-sm">' + esc(k.text) + '</div></div><div class="msk-side">' + esc(dy(k.at)) + '<br>' + esc(tm(k.at)) + '</div></div>'; }).join('') + '</div>';
      return chips + lists + '<div class="msk-grid"><div class="msk-card">' + grid + '</div>' + detail + '</div>' + keysHtml;
    }

    // ── Money map ──
    function tabMap(c) {
      var m = c.map, cy = ensureCycles(c), hd = S.humanDesign(P);
      var hl = '<div class="msk-grid" style="margin-bottom:12px">' + m.highlights.map(function (h) { return '<div class="msk-card"><h3>' + esc(h.emoji) + ' ' + esc(h.title) + '</h3><div>' + esc(h.text) + '</div></div>'; }).join('') + '</div>';
      var houses = '<div class="msk-card" style="margin-bottom:12px"><h3>Your money houses</h3><div class="msk-wrap"><table class="msk-table"><tr><th>House</th><th>Starts in</th><th>Ruled by</th><th class="msk-hide-sm">Inside</th></tr>'
        + m.moneyHouses.map(function (h) { return '<tr><td><b>' + S.util.ordinal(h.house) + ' · ' + esc(h.name) + '</b><div class="msk-mu msk-sm">' + esc(h.theme) + '</div></td><td>' + esc(h.pos) + '<div class="msk-mu msk-sm">' + esc(h.style) + '</div></td><td>' + esc(h.ruler) + ' in ' + esc(h.rulerAt.pos) + ', ' + S.util.ordinal(h.rulerAt.house) + ' house' + (h.modern ? '<div class="msk-mu msk-sm">Modern ruler ' + esc(h.modern) + ', ' + S.util.ordinal(h.modernAt.house) + ' house</div>' : '') + '</td><td class="msk-hide-sm">' + (h.inside.length ? h.inside.map(function (x) { return esc(x.name) + (x.rx ? '<span class="msk-rx">R</span>' : ''); }).join(', ') : '<span class="msk-mu">empty</span>') + '</td></tr>'; }).join('')
        + '</table></div><div class="msk-sm msk-mu" style="margin-top:6px">Part of Fortune: ' + esc(S.util.fmtPos(m.points.PoF)) + ', your ' + S.util.ordinal(m.pofHouse) + ' house (' + esc(S.HOUSE_NAME[m.pofHouse]) + '). ' + (m.night ? 'Night chart, so it is counted ASC + Sun − Moon.' : '') + '</div></div>';
      var cycles = '<div class="msk-grid" style="margin-bottom:12px">' + cy.map(function (b) {
        return '<div class="msk-card"><h3>' + b.glyph + ' ' + esc(b.planet) + ' cycle</h3><div class="msk-big" style="font-size:15px">Now in your ' + S.util.ordinal(b.house) + ' house · ' + esc(b.houseName) + '</div><div class="msk-mu msk-sm">' + (b.since ? 'Since ' + esc(dyY(b.since)) + '. ' : '') + esc(b.theme.charAt(0).toUpperCase() + b.theme.slice(1)) + '.' + '</div>' + (b.now ? '<div style="margin-top:6px">' + esc(b.now) + '</div>' : '')
          + '<div style="margin-top:8px">' + b.nextMoney.filter(function (x) { return x.now || x.at; }).map(function (x) { return '<div class="msk-row"><span class="msk-ic msk-money">' + x.house + '</span><div class="msk-main"><b>' + esc(x.houseName) + '</b> ' + (x.now ? '<span class="msk-money">now</span>' : 'from ' + esc(dyY(x.at))) + '<div class="msk-mu msk-sm">' + esc(x.text || '') + '</div></div></div>'; }).join('') + '</div></div>';
      }).join('') + '</div>';
      var hdHtml = '<div class="msk-card"><h3>Human Design and money <small>' + esc(hd.type) + ' · ' + esc(hd.authority) + ' authority</small></h3>' + hd.notes.map(function (n) { return '<div class="msk-row"><span class="msk-ic">✦</span><div class="msk-main">' + esc(n) + '</div></div>'; }).join('') + '</div>';
      return hl + houses + cycles + hdHtml + '<div class="msk-sm msk-mu" style="margin-top:8px">Born ' + esc(P.born.local) + ', ' + esc(P.born.place) + '. Tropical zodiac, Placidus houses, Swiss Ephemeris positions (the same chart as Nyla OS).</div>';
    }

    // ── Business charts ──
    function tabBusiness(c) {
      var spec = BIZ.filter(function (b) { return b.id === st.biz; })[0] || BIZ[0];
      c.biz = c.biz || {};
      var r = c.biz[spec.id] || (c.biz[spec.id] = S.businessReading(A, spec, P, Date.now())), M = S.NUM_MONEY;
      var html = BIZ.length > 1 ? '<div class="msk-chips" style="margin-bottom:12px">' + BIZ.map(function (b) { return '<button class="msk-chip' + (b.id === spec.id ? ' on' : '') + '" data-msk-biz="' + b.id + '">' + esc(b.name) + '</button>'; }).join('') + '</div>' : '';
      html += '<div class="msk-card msk-hero"><div class="msk-big">' + esc(spec.name) + (spec.provisional ? ' <span class="msk-chip" style="font-size:11px;font-weight:500">Provisional</span>' : '') + '</div>'
        + '<div class="msk-chips" style="margin:4px 0 8px"><span class="msk-chip">☉ ' + esc(r.big.sun) + ' Sun</span><span class="msk-chip">☽ ' + esc(r.big.moon) + ' Moon</span><span class="msk-chip">↑ ' + esc(r.big.rising) + ' rising</span><span class="msk-chip">Life path ' + r.numbers.lifePath + '</span></div>'
        + '<div class="msk-sm">Born ' + esc(spec.local) + ', ' + esc(spec.place) + '. ' + esc(spec.source) + '</div><div class="msk-mu msk-sm" style="margin-top:4px">Rising ' + esc(r.asc) + ' · Midheaven ' + esc(r.mc) + ' · Placidus houses, the same system as your own chart.</div></div>';
      html += '<div class="msk-grid" style="margin-bottom:12px">' + r.reads.map(function (x) { return '<div class="msk-card"><h3>' + esc(x.emoji) + ' ' + esc(x.title) + '</h3><div>' + esc(x.text) + '</div></div>'; }).join('') + '</div>';
      var row = function (x) { return '<div class="msk-row"><span class="msk-ic msk-tone-' + x.tone + '">' + (x.tone === 'easy' ? '▲' : x.tone === 'hard' ? '▼' : '◆') + '</span><div class="msk-main"><b>' + esc(x.title) + '</b><div class="msk-mu msk-sm">' + esc(x.text) + '</div></div><div class="msk-side">' + x.orb + '°</div></div>'; };
      html += '<div class="msk-grid" style="margin-bottom:12px"><div class="msk-card"><h3>How it fits with you <small>its chart against yours</small></h3>' + (r.withYou.length ? r.withYou.map(row).join('') : '<div class="msk-mu">No close contacts between the two charts.</div>') + '</div>'
        + '<div class="msk-card"><h3>Touching its chart now</h3>' + (r.transits.length ? r.transits.map(function (x) { return row({ tone: x.tone, title: x.title, text: x.text, orb: x.orb + '' }); }).join('') : '<div class="msk-mu">No slow planet is touching its money points right now.</div>') + '</div></div>';
      html += '<div class="msk-grid" style="margin-bottom:12px">' + r.cycles.map(function (b) {
        return '<div class="msk-card"><h3>' + b.glyph + ' ' + esc(b.planet) + ' through its chart</h3><div class="msk-big" style="font-size:15px">Now in its ' + S.util.ordinal(b.house) + ' house · ' + esc(b.houseName) + '</div>' + (b.now ? '<div style="margin-top:6px">' + esc(b.now) + '</div>' : '')
          + '<div style="margin-top:8px">' + b.nextMoney.filter(function (x) { return x.now || x.at; }).map(function (x) { return '<div class="msk-row"><span class="msk-ic msk-money">' + x.house + '</span><div class="msk-main"><b>' + esc(x.houseName) + '</b> ' + (x.now ? '<span class="msk-money">now</span>' : 'from ' + esc(dyY(x.at))) + '<div class="msk-mu msk-sm">' + esc(x.text || '') + '</div></div></div>'; }).join('') + '</div></div>';
      }).join('')
        + '<div class="msk-card"><h3>Its numbers</h3>' + [['Life path', r.numbers.lifePath, 'year'], ['Its ' + r.numbers.year + ' year', r.numbers.personalYear, 'year'], ['Its ' + (r.numbers.year + 1) + ' year', r.numbers.nextYear, 'year'], ['Name number', r.numbers.name, 'year']].map(function (n) { return '<div class="msk-row"><span class="msk-ic msk-money">' + n[1] + '</span><div class="msk-main"><b>' + esc(n[0]) + '</b> · ' + esc(M[n[1]] ? M[n[1]].name : '') + '<div class="msk-mu msk-sm">' + esc(M[n[1]] ? M[n[1]][n[2]] : '') + '</div></div></div>'; }).join('') + '<div class="msk-sm msk-mu" style="margin-top:6px">From its birth date, the same way as yours.</div></div></div>';
      html += '<div class="msk-card"><h3>Its planets</h3><div class="msk-wrap"><table class="msk-table"><tr><th></th><th>Where</th><th>Its house</th></tr>' + r.planets.map(function (p) { return '<tr><td>' + p.glyph + ' ' + esc(p.name) + '</td><td>' + esc(p.pos) + (p.rx ? '<span class="msk-rx">R</span>' : '') + '</td><td>' + S.util.ordinal(p.house) + ' · ' + esc(p.houseName) + '</td></tr>'; }).join('') + '</table></div></div>';
      return html;
    }

    // ── Numbers ──
    function tabNumbers() {
      var n = S.numbers(P, Date.now(), opts.names), M = S.NUM_MONEY, mx = S.matrix(P);
      var big = function (label, v, txt) { return '<div class="msk-card"><div class="msk-mu msk-sm">' + esc(label) + '</div><div class="msk-num">' + v + '</div><div class="msk-sm" style="font-weight:600">' + esc(M[v] ? M[v].name : '') + '</div><div class="msk-sm" style="margin-top:4px">' + esc(txt) + '</div></div>'; };
      var html = '<div class="msk-nums" style="margin-bottom:12px">' + big('Personal year ' + n.year, n.personalYear, M[n.personalYear].year) + big('Personal month', n.personalMonth, M[n.personalMonth].year) + big('Personal day', n.personalDay, M[n.personalDay].day) + big('Next year, ' + (n.year + 1), n.nextYear, M[n.nextYear].year) + '</div>';
      html += '<div class="msk-card" style="margin-bottom:12px"><h3>Life Path ' + n.lifePath + '</h3><div>' + esc(n.lifePathText || M[n.lifePath].year) + '</div></div>';
      var daysOf = function (list, v) { return list.filter(function (d) { return d.pd === v; }); };
      var month = function (list, title) {
        return '<div class="msk-card"><h3>' + esc(title) + '</h3>' + [[8, 'Money days: ask, sell, sign'], [1, 'Start days: launch, open'], [4, 'Build days: books and systems'], [9, 'Clear-out days: cancel, collect']].map(function (r) {
          var ds = daysOf(list, r[0]); return '<div class="msk-row"><span class="msk-ic msk-money">' + r[0] + '</span><div class="msk-main">' + esc(r[1]) + '<div class="msk-chips" style="margin-top:4px">' + ds.map(function (d) { return '<span class="msk-chip">' + esc(new Date(d.y, d.m - 1, d.d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })) + '</span>'; }).join('') + '</div></div></div>';
        }).join('') + '</div>';
      };
      var mname = function (list) { return new Date(list[0].y, list[0].m - 1, 1).toLocaleDateString([], { month: 'long' }); };
      html += '<div class="msk-grid" style="margin-bottom:12px">' + month(n.thisMonth, mname(n.thisMonth)) + month(n.nextMonth, mname(n.nextMonth)) + '</div>';
      if (n.names.length) html += '<div class="msk-card" style="margin-bottom:12px"><h3>Business name numbers</h3>' + n.names.map(function (x) { return '<div class="msk-row"><span class="msk-ic msk-money">' + x.number + '</span><div class="msk-main"><b>' + esc(x.name) + '</b> · ' + esc(x.meaning ? x.meaning.name : '') + '<div class="msk-mu msk-sm">' + esc(x.meaning ? x.meaning.year : '') + '</div></div></div>'; }).join('') + '<div class="msk-sm msk-mu" style="margin-top:6px">Pythagorean letters, added and reduced (11, 22 and 33 kept).</div></div>';
      html += '<div class="msk-card"><h3>Matrix of Destiny: the money channel <small>Ladini method, center ' + mx.center + '</small></h3>' + mx.channel.map(function (p) { return '<div class="msk-row"><span class="msk-ic msk-money">' + p.number + '</span><div class="msk-main"><b>' + esc(p.label) + '</b> · ' + esc(p.arcana) + '<div class="msk-sm">' + esc(p.money) + '</div><div class="msk-mu msk-sm">' + esc(p.what) + '</div></div></div>'; }).join('') + '</div>';
      return html;
    }

    function draw() {
      if (dead) return;
      var c = data(), body;
      try { body = st.tab === 'calendar' ? tabCalendar(c) : st.tab === 'map' ? tabMap(c) : st.tab === 'numbers' ? tabNumbers(c) : st.tab === 'business' && BIZ.length ? tabBusiness(c) : tabToday(c); }
      catch (e) { body = '<div class="msk-card">Something went wrong drawing this tab: ' + esc(e && e.message) + '</div>'; if (window.console) console.error(e); }
      var y = window.scrollY;
      root.innerHTML = (opts.showTitle === false ? '' : '<div class="msk-head"><div><div class="msk-title">Financial Astrology</div><div class="msk-sub">Money timing from your own chart' + (opts.context ? ' · ' + esc(opts.context) : '') + '</div></div></div>')
        + '<div class="msk-tabs" role="tablist">' + tabs.map(function (t) { return '<button class="msk-tab' + (st.tab === t[0] ? ' on' : '') + '" role="tab" data-msk-tab="' + t[0] + '">' + esc(t[1]) + '</button>'; }).join('') + '</div>'
        + body
        + '<details class="msk-how"><summary>How this is worked out</summary><div class="msk-card" style="margin-top:8px">' + S.RULES.map(function (r) { return '<div class="msk-row"><span class="msk-ic">' + esc(r.emoji) + '</span><div class="msk-main"><b>' + esc(r.title) + '</b><div class="msk-sm">' + esc(r.text) + '</div></div></div>'; }).join('') + '<div class="msk-sm msk-mu" style="margin-top:8px">Positions come from astronomy-engine and your Swiss Ephemeris chart. This is for timing and reflection, not financial advice: your real numbers, your contracts and your gut come first.</div></div></details>';
      if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
    }

    function onClick(e) {
      var t = e.target.closest && e.target.closest('[data-msk-tab],[data-msk-purpose],[data-msk-day],[data-msk-here],[data-msk-biz]'); if (!t || !root.contains(t)) return;
      if (t.dataset.mskTab) { st.tab = t.dataset.mskTab; put('tab', st.tab); draw(); }
      else if (t.dataset.mskBiz) { st.biz = t.dataset.mskBiz; put('biz', st.biz); draw(); }
      else if (t.dataset.mskPurpose) { st.purpose = t.dataset.mskPurpose; put('purpose', st.purpose); draw(); }
      else if (t.dataset.mskDay) { st.sel = t.dataset.mskDay; if (st.tab !== 'calendar') { st.tab = 'calendar'; put('tab', 'calendar'); } draw(); }
      else if (t.hasAttribute('data-msk-here')) {
        if (!navigator.geolocation) return;
        t.textContent = 'Finding you…';
        navigator.geolocation.getCurrentPosition(function (pos) { st.place = { id: 'here', name: 'Where I am', lat: Math.round(pos.coords.latitude * 100) / 100, lng: Math.round(pos.coords.longitude * 100) / 100 }; put('place', st.place); draw(); }, function () { t.textContent = 'Location not allowed'; }, { timeout: 10000, maximumAge: 3600000 });
      }
    }
    function onChange(e) {
      var t = e.target;
      if (t.hasAttribute('data-msk-place')) { if (t.value !== 'here') { st.place = t.value; put('place', st.place); draw(); } }
      else if (t.hasAttribute('data-msk-moneyonly')) { st.moneyOnly = t.checked; put('moneyOnly', st.moneyOnly); draw(); }
    }
    root.addEventListener('click', onClick); root.addEventListener('change', onChange);

    Promise.resolve().then(opts.loadAstronomy).then(function (lib) {
      if (dead) return; A = lib; draw();
      var c = data(); setTimeout(function () { if (!dead) ensureCalendar(c); }, 400);
    }).catch(function () { if (!dead) root.innerHTML = '<div class="msk-card">The astronomy library did not load. Check the connection and open this page again.</div>'; });

    return { destroy: function () { dead = true; root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); }, redraw: function () { if (A) draw(); } };
  }

  window.moneySkyView = { mount: mount, version: 1 };
})();
