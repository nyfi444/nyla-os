/* ── Smart add: reads one typed line into a task, event, shopping item, idea or note ──
   window.nylaSmartParse(text, now, opts) returns
     { kind, text, date, time, endTime, repeat, until, understood }
   or null when the line is empty.

     kind        'task' | 'event' | 'shop' | 'idea' | 'note'
     text        the title: what she typed with the understood words taken out
     date        'YYYY-MM-DD' in local time, or null
     time        'HH:MM' 24-hour, or null
     endTime     'HH:MM' 24-hour, or null
     repeat      tasks:  'daily' | 'weekdays' | 'weekly' | 'monthly'   (the task's own repeat field)
                 events: the same four plus 'biweekly'                 (the Event editor's choices)
                 The app keeps no repeat field on an event: a repeating event is saved as a
                 run of dated copies that share a recurringGroupId. nylaSmartParse.seriesDates
                 gives those dates, the same way the Event editor walks them.
     until       events that repeat only: the last day of the run ('YYYY-MM-DD'), either the
                 one she typed ("until dec 15") or a sensible default
     understood  short labels for the chips, e.g. ['Event', 'Fri, Oct 2', '7:00 PM']

   opts.kind forces the kind (the box uses it when she taps a different kind).

   Choices worth knowing
     - A weekday name means the next one coming. Today's own name means today,
       unless a clock time was given and has already passed (then it is next week).
     - Weeks run Monday to Sunday. "next friday" is the Friday of next week.
       On a Sunday the week about to start counts as this one, so "next monday"
       typed on a Sunday is eight days away, not tomorrow.
     - A bare number is never a time or a date. It needs "at", am/pm or a colon.
     - "by 5pm" and "due friday 5pm" are deadlines, so they stay tasks (with the time kept).
     - "daily", "weekly" and "monthly" only count as a repeat at the end of the
       line or right beside a date or time, so "weekly review friday" keeps its name.

   Plain script, no DOM, no app globals. Its only global is nylaSmartParse. */
(function () {
  'use strict';

  var REMOVED = '\u0001';   // understood and taken out of the title
  var KEPT = '\u0002';      // left in the title, hidden from the rest of the parsing

  var WD = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday|thurs|tues|weds|thur|sun|mon|tue|wed|thu|fri|sat';
  var WD_NUM = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };
  var WEAK_WD = { sun: 1, sat: 1, wed: 1, mon: 1 };   // also everyday words, so they need more proof
  var MON = 'january|february|march|april|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
  var MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var MON_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  var MER = '(a\\.?m\\.?|p\\.?m\\.?)';
  var KIND_LABEL = { task: 'Task', event: 'Event', shop: 'Shopping', idea: 'Idea', note: 'Note' };
  var REPEAT_LABEL = { daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month' };
  var TASK_REPEATS = { daily: 1, weekdays: 1, weekly: 1, monthly: 1 };
  var EVENT_REPEATS = { daily: 1, weekdays: 1, weekly: 1, biweekly: 1, monthly: 1 };
  var PART_TIME = { morning: '09:00', afternoon: '14:00', evening: '18:00', night: '20:00', tonight: '19:00' };

  var EVENT_WORDS = /\b(dinner|lunch|brunch|breakfast|meeting|appointment|appt|call with|class|flight|party|birthday|bday|interview|date with|concert|wedding|reservation|coffee with|drinks with)\b/i;
  // A line that opens with one of these is something to do, even when it names an event.
  var TASK_LEAD = /^(buy|get|book|plan|prep|prepare|schedule|reschedule|order|send|email|finish|submit|study|pay|make|write|pick|clean|cancel|confirm|rsvp|pack|wrap|research|find|organize|register|renew|return|read|review|draft|print|bring|bake|cook|shop)\b/i;
  // "1/2 cup" is an amount, not January 2nd.
  var AMOUNT_AFTER = /^\s*(cups?|tsp|tbsp|teaspoons?|tablespoons?|lbs?|pounds?|oz|ounces?|gallons?|inch|inches|of|off|miles?|price|hours?|hrs?|pages?|full|empty|size|scale)\b/i;
  // The little word in front of a date: "on friday", "by friday", "until dec 15", "for friday".
  var LEAD_BEFORE = /(?:^|[\s\u0001\u0002,;])((?:due\s+)?(?:on|by|before)|due|starting(?:\s+on)?|from|until|till|through|thru|for)\s+$/i;
  // A clock time somewhere on the line, checked before the times are read.
  var HAS_TIME = /\d\s?(?:a\.?m|p\.?m)\b|\bat\s+\d|\d:\d\d|\b(?:noon|midnight)\b/i;

  // ── Small date helpers (local time, built at noon so a clock change cannot move the day) ──
  function pad(n) { return String(n).padStart(2, '0'); }
  function noon(y, m, d) { return new Date(y, m, d, 12, 0, 0, 0); }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromKey(k) { var p = String(k).split('-').map(Number); return noon(p[0], p[1] - 1, p[2]); }
  function addDays(d, n) { var x = noon(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function addMonths(d, n) {
    var y = d.getFullYear(), m = d.getMonth() + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return noon(y, m, Math.min(d.getDate(), daysIn(y, m)));
  }
  function toDate(now) {
    var d;
    if (now == null) d = new Date();
    else if (typeof now.getTime === 'function') d = new Date(now.getTime());
    else d = new Date(now);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  function hhmm(h, m) { return pad(h) + ':' + pad(m || 0); }
  function minutesOf(t) { var p = t.split(':').map(Number); return p[0] * 60 + p[1]; }
  function mask(s, a, b, ch) { return s.slice(0, a) + ch.repeat(b - a) + s.slice(b); }

  function formatTime(t) {
    if (!t) return '';
    var p = String(t).split(':').map(Number);
    return (p[0] % 12 || 12) + ':' + pad(p[1] || 0) + ' ' + (p[0] >= 12 ? 'PM' : 'AM');
  }
  function formatDate(key, now) {
    if (!key) return '';
    var today = toDate(now), d = fromKey(key);
    var todayKey = keyOf(today);
    if (key === todayKey) return 'Today';
    if (key === keyOf(addDays(today, 1))) return 'Tomorrow';
    return DOW_LABEL[d.getDay()] + ', ' + MON_LABEL[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== today.getFullYear() ? ', ' + d.getFullYear() : '');
  }

  // ── Clock times ─────────────────────────────────────────────────────
  function merOf(s) { return s ? s.charAt(0).toLowerCase() : null; }
  function to24(h, mer) { return mer === 'p' ? (h % 12) + 12 : h % 12; }
  // A clock hour with no am/pm: 1 to 7 is the evening, 8 to 11 the morning, 12 is noon.
  // 0, 13 and up, or a leading zero ("07:30") are already 24-hour.
  function bareHour(raw) {
    var h = Number(raw);
    if (h > 23) return null;
    if (h === 0 || h >= 13 || (raw.length === 2 && raw.charAt(0) === '0')) return { h: h, open: false };
    if (h === 12) return { h: 12, open: false };
    return { h: h <= 7 ? h + 12 : h, open: true };
  }
  function flip(mer) { return mer === 'p' ? 'a' : 'p'; }

  function findTimes(state) {
    var m, re, prev, res = { time: null, endTime: null, open: false };
    var badBefore = function (idx) { prev = state.work.charAt(idx - 1); return !!prev && /[\w/.:$#]/.test(prev); };

    // 1. Ranges: "2-3pm", "2pm to 4pm", "from 9 to 10:30am"
    re = new RegExp('(?:\\b(?:at|from|between)\\s+|@\\s*)?\\b(\\d{1,2})(?::([0-5]\\d))?\\s?' + MER + '?\\s*(?:-|–|—|\\s(?:to|until|till|and)\\s)\\s*(\\d{1,2})(?::([0-5]\\d))?\\s?' + MER + '?(?![a-z0-9:/])', 'gi');
    while ((m = re.exec(state.work))) {
      if (badBefore(m.index)) continue;
      var mer1 = merOf(m[3]), mer2 = merOf(m[6]);
      if (!mer1 && !mer2 && m[2] == null && m[5] == null) continue;      // "10-12": just numbers
      var h1 = Number(m[1]), h2 = Number(m[4]), a, b;
      if (mer1 || mer2) {
        if (h1 < 1 || h1 > 12 || h2 < 1 || h2 > 12) continue;
        if (mer1 && mer2) { a = to24(h1, mer1); b = to24(h2, mer2); }
        else if (mer2) { b = to24(h2, mer2); a = to24(h1, mer2); if (a * 60 + Number(m[2] || 0) >= b * 60 + Number(m[5] || 0)) a = to24(h1, flip(mer2)); }
        else { a = to24(h1, mer1); b = to24(h2, mer1); if (b * 60 + Number(m[5] || 0) <= a * 60 + Number(m[2] || 0)) b = to24(h2, flip(mer1)); }
      } else {
        var s1 = bareHour(m[1]), s2 = bareHour(m[4]);
        if (!s1 || !s2) continue;
        a = s1.h; b = s2.h;
        if (b * 60 + Number(m[5] || 0) <= a * 60 + Number(m[2] || 0) && b < 12) b += 12;
      }
      res.time = hhmm(a, Number(m[2] || 0)); res.endTime = hhmm(b, Number(m[5] || 0));
      res.deadline = /^by\b/i.test(m[0]);
      state.take(m.index, m.index + m[0].length, 'time');
      return res;
    }

    // 2. With am or pm: "7pm", "7:30 pm", "at 7 a.m."
    re = new RegExp('(?:\\b(?:at|by|around|until|till)\\s+|@\\s*)?\\b(\\d{1,2})(?::([0-5]\\d))?\\s?' + MER + '(?![a-z0-9])', 'gi');
    while ((m = re.exec(state.work))) {
      if (badBefore(m.index)) continue;
      var h = Number(m[1]);
      if (h < 1 || h > 12) continue;
      res.time = hhmm(to24(h, merOf(m[3])), Number(m[2] || 0));
      res.deadline = /^by\b/i.test(m[0]);
      state.take(m.index, m.index + m[0].length, 'time');
      return res;
    }

    // 3. With a colon: "19:30", "at 7:45"
    re = /(?:\b(at|by|around|until|till)\s+|(@)\s*)?\b(\d{1,2}):([0-5]\d)\b(?![:\d/])/gi;
    while ((m = re.exec(state.work))) {
      if (badBefore(m.index)) continue;
      var bh = bareHour(m[3]);
      if (!bh) continue;
      // "John 3:16" is not a time. Without "at", an everyday clock time lands on a five-minute mark.
      if (!m[1] && !m[2] && bh.open && Number(m[4]) % 5 !== 0) continue;
      res.time = hhmm(bh.h, Number(m[4])); res.open = bh.open; res.rawHour = Number(m[3]);
      res.deadline = /^by\b/i.test(m[0]);
      state.take(m.index, m.index + m[0].length, 'time');
      return res;
    }

    // 4. "at 7", "at 12"
    re = /(?:\bat\s+|@\s*)(\d{1,2})\b(?![:/.\-]\d|\s*(?:%|percent\b))/gi;
    while ((m = re.exec(state.work))) {
      if (badBefore(m.index)) continue;
      if (Number(m[1]) === 0) continue;
      var ah = bareHour(m[1]);
      if (!ah) continue;
      res.time = hhmm(ah.h, 0); res.open = ah.open; res.rawHour = Number(m[1]);
      res.deadline = /^by\b/i.test(m[0]);
      state.take(m.index, m.index + m[0].length, 'time');
      return res;
    }

    // 5. noon, midnight
    re = /(?:\b(?:at|by|around|until|till)\s+|@\s*)?\b(noon|midnight)\b/gi;
    if ((m = re.exec(state.work))) {
      res.time = m[1].toLowerCase() === 'noon' ? '12:00' : '00:00';
      res.deadline = /^by\b/i.test(m[0]);
      state.take(m.index, m.index + m[0].length, 'time');
      return res;
    }
    return res;
  }

  // morning / afternoon / evening / night only count beside a date ("tomorrow morning",
  // "friday evening") or with "this" / "in the" in front, so "morning run" keeps its name.
  function findPartOfDay(state) {
    var re = /\b(?:(in\s+the|this)\s+)?(morning|afternoon|evening|night)\b(?!['’]s)/gi, m;
    while ((m = re.exec(state.work))) {
      var lead = !!m[1];
      var afterDate = new RegExp(REMOVED + '\\s*$').test(state.work.slice(0, m.index)) && state.spanEndingNear(m.index, 'date');
      if (!lead && !afterDate) continue;
      var word = m[2].toLowerCase();
      state.take(m.index, m.index + m[0].length, 'part');
      return { word: word, today: lead && m[1].toLowerCase() === 'this' };
    }
    return null;
  }

  // ── Dates ───────────────────────────────────────────────────────────
  function validMonthDay(mo, d, y) {
    if (mo < 1 || mo > 12 || d < 1) return false;
    return d <= (y ? daysIn(y, mo - 1) : (mo === 2 ? 29 : daysIn(2024, mo - 1)));
  }
  function monthNum(name) { return MON3.indexOf(name.toLowerCase().slice(0, 3)) + 1; }
  function goodYear(y) { return y >= 2000 && y <= 2100; }

  function findDates(work, body) {
    var out = [], m, re;
    var push = function (a, b, desc, weak) { out.push({ a: a, b: b, desc: desc, weak: !!weak }); };

    re = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
    while ((m = re.exec(work))) {
      if (goodYear(+m[1]) && validMonthDay(+m[2], +m[3], +m[1])) push(m.index, m.index + m[0].length, { t: 'abs', y: +m[1], m: +m[2], d: +m[3] });
    }

    re = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])/g;
    while ((m = re.exec(work))) {
      var prev = work.charAt(m.index - 1);
      if (prev && /[\w/.$#]/.test(prev)) continue;
      var y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
      if (y != null && !goodYear(y)) continue;
      if (!validMonthDay(+m[1], +m[2], y)) continue;
      if (!y && AMOUNT_AFTER.test(work.slice(m.index + m[0].length))) continue;
      push(m.index, m.index + m[0].length, { t: 'abs', y: y, m: +m[1], d: +m[2] });
    }

    re = new RegExp('\\b(' + MON + ')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(,?\\s+(\\d{4})\\b)?', 'gi');
    while ((m = re.exec(work))) {
      var end = m.index + m[0].length, yr = m[4] ? Number(m[4]) : null;
      if (yr != null && !goodYear(yr)) { end -= m[3].length; yr = null; re.lastIndex = end; }
      if (/^(?:\s?(?:a\.?m|p\.?m)\b|:\d)/i.test(work.slice(end))) continue;      // "may 5 pm"
      var mo = monthNum(m[1]);
      if (!validMonthDay(mo, +m[2], yr)) continue;
      push(m.index, end, { t: 'abs', y: yr, m: mo, d: +m[2] });
    }

    re = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)\\s+(?:of\\s+)?(' + MON + ')\\b\\.?(,?\\s+(\\d{4})\\b)?', 'gi');
    while ((m = re.exec(work))) {
      var end2 = m.index + m[0].length, yr2 = m[4] ? Number(m[4]) : null;
      if (yr2 != null && !goodYear(yr2)) { end2 -= m[3].length; yr2 = null; re.lastIndex = end2; }
      var mo2 = monthNum(m[2]);
      if (!validMonthDay(mo2, +m[1], yr2)) continue;
      push(m.index, end2, { t: 'abs', y: yr2, m: mo2, d: +m[1] });
    }

    re = /\b(today|tonight|tomorrow|tommorrow|tommorow|tomorow|tmrw|tmr|tmw)\b(?!['’]s)/gi;
    while ((m = re.exec(work))) {
      var w = m[1].toLowerCase();
      push(m.index, m.index + m[0].length, w === 'today' ? { t: 'rel', days: 0 } : w === 'tonight' ? { t: 'rel', days: 0, tonight: true } : { t: 'rel', days: 1 });
    }

    re = /\bin\s+(\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?|wks?|months?)\b/gi;
    while ((m = re.exec(work))) {
      var n = /^\d/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1].toLowerCase()];
      var unit = m[2].toLowerCase().charAt(0);
      if (n > 0) push(m.index, m.index + m[0].length, { t: 'in', n: n, unit: unit === 'd' ? 'day' : unit === 'w' ? 'week' : 'month' });
    }

    re = /\bnext\s+week\b/gi;
    while ((m = re.exec(work))) push(m.index, m.index + m[0].length, { t: 'nextweek' });

    re = new RegExp('\\b(?:(next|this)\\s+)?(' + WD + ')\\b(?![\'’]s)', 'gi');
    while ((m = re.exec(work))) {
      var name = m[2].toLowerCase(), typed = body.slice(m.index + m[0].length - m[2].length, m.index + m[0].length);
      var weak = !m[1] && !!WEAK_WD[name];
      if (weak) {
        // "SAT prep" is the exam, "the sun" is the sun.
        if (typed === typed.toUpperCase() && body !== body.toUpperCase()) continue;
        if (/\bthe\s+$/i.test(work.slice(0, m.index))) continue;
        // These need proof before they count as a day: a word in front ("on sat"), a clock
        // time on the line ("gym sat 3pm"), or closing the line ("gym sat"). Otherwise
        // "sun hat", "tan lotion" and "mon and dad" keep their words.
        var rest = work.slice(m.index + m[0].length);
        var closes = /^[\s\u0001\u0002,.;!?]*$/.test(rest) || /^\s*(?:morning|afternoon|evening|night)\b/i.test(rest);
        if (!closes && !HAS_TIME.test(work) && !LEAD_BEFORE.test(work.slice(0, m.index))) continue;
      }
      push(m.index, m.index + m[0].length, { t: 'wd', dow: WD_NUM[name.slice(0, 2)], mod: m[1] ? m[1].toLowerCase() : null }, weak);
    }

    out.sort(function (p, q) { return p.a - q.a || (q.b - q.a) - (p.b - p.a); });
    var clean = [], lastEnd = -1;
    out.forEach(function (c) { if (c.a >= lastEnd) { clean.push(c); lastEnd = c.b; } });

    // The little word in front: "on friday", "by friday", "until dec 15", "for friday".
    clean.forEach(function (c) {
      var pm = LEAD_BEFORE.exec(work.slice(0, c.a));
      c.a0 = c.a; c.lead = null;
      if (pm) {
        c.lead = pm[1].toLowerCase().replace(/\s+/g, ' ');
        c.a0 = c.a - (pm[0].length - pm[0].search(/\S/));
        if (/^[,;]/.test(work.slice(c.a0))) c.a0 += 1;
        while (/\s/.test(work.charAt(c.a0))) c.a0 += 1;
        if (c.lead) c.weak = false;
      }
      c.until = /^(until|till|through|thru)$/.test(c.lead || '');
    });
    return clean;
  }

  function daysToNextMonday(today) { return ((8 - today.getDay()) % 7) || 7; }

  function resolveDate(desc, today, time, nowMin) {
    if (desc.t === 'rel') return addDays(today, desc.days);
    if (desc.t === 'in') return desc.unit === 'day' ? addDays(today, desc.n) : desc.unit === 'week' ? addDays(today, desc.n * 7) : addMonths(today, desc.n);
    if (desc.t === 'nextweek') return addDays(today, daysToNextMonday(today));
    if (desc.t === 'wd') {
      if (desc.mod === 'next') {
        var delta = daysToNextMonday(today) + ((desc.dow + 6) % 7);
        if (today.getDay() === 0 && desc.dow !== 0) delta += 7;
        return addDays(today, delta);
      }
      var d = (desc.dow - today.getDay() + 7) % 7;
      if (d === 0 && time && minutesOf(time) <= nowMin) d = 7;
      return addDays(today, d);
    }
    // A month and a day
    if (desc.y) return noon(desc.y, desc.m - 1, desc.d);
    var y = today.getFullYear(), tries = 0;
    while (tries < 8) {
      if (validMonthDay(desc.m, desc.d, y)) {
        var cand = noon(y, desc.m - 1, desc.d);
        if (keyOf(cand) >= keyOf(today)) return cand;
      }
      y += 1; tries += 1;
    }
    return null;
  }

  // ── Repeats ─────────────────────────────────────────────────────────
  function findRepeat(state) {
    var m, found = null;
    var re = new RegExp('\\b(?:every|each)\\s+(' + WD + ')\\b(?![\'’]s)', 'i');
    if ((m = re.exec(state.work))) {
      var rest = state.work.slice(m.index + m[0].length);
      var more = new RegExp('^(?:\\s*(?:,|&|/|\\band\\b|\\bor\\b)\\s*(?:' + WD + ')\\b)+', 'i').exec(rest);
      if (more) state.keep(m.index, m.index + m[0].length + more[0].length);      // two days a week: the app cannot hold that
      else found = { value: 'weekly', dow: WD_NUM[m[1].toLowerCase().slice(0, 2)], span: state.take(m.index, m.index + m[0].length, 'repeat') };
    }
    if (!found && (m = /\b(?:every|each)\s+(day|weekday|week|month|other\s+week|2\s+weeks|two\s+weeks)\b/i.exec(state.work))) {
      var u = m[1].toLowerCase().replace(/\s+/g, ' ');
      var value = u === 'day' ? 'daily' : u === 'weekday' ? 'weekdays' : u === 'week' ? 'weekly' : u === 'month' ? 'monthly' : 'biweekly';
      found = { value: value, span: state.take(m.index, m.index + m[0].length, 'repeat') };
    }
    if (!found && (m = /\beveryday\b/i.exec(state.work))) found = { value: 'daily', span: state.take(m.index, m.index + m[0].length, 'repeat') };
    if (!found && (m = /\b(?:on\s+)?weekdays\b/i.exec(state.work))) found = { value: 'weekdays', span: state.take(m.index, m.index + m[0].length, 'repeat') };
    // Anything else that starts with "every" stays in the title, untouched: "every 3 days", "every other day".
    var gen = /\b(?:every|each)\s+(?:other\s+|single\s+|\d+\s+)?[a-z]+\b/gi;
    while ((m = gen.exec(state.work))) state.keep(m.index, m.index + m[0].length);
    return found;
  }

  function findRepeatWord(state) {
    var re = /\b(daily|weekly|monthly|biweekly|bi-weekly)\b/gi, m;
    while ((m = re.exec(state.work))) {
      var before = state.work.slice(0, m.index), after = state.work.slice(m.index + m[0].length);
      var atEnd = new RegExp('^[\\s' + REMOVED + ',.;!]*$').test(after);
      var beside = new RegExp('^\\s*' + REMOVED).test(after) || new RegExp(REMOVED + '\\s*$').test(before);
      if (!atEnd && !beside) continue;
      if (!before.replace(new RegExp('[\\s' + REMOVED + ']', 'g'), '') && !after.replace(new RegExp('[\\s' + REMOVED + ']', 'g'), '')) continue;   // nothing else on the line
      var w = m[1].toLowerCase();
      return { value: w === 'daily' ? 'daily' : w === 'weekly' ? 'weekly' : w === 'monthly' ? 'monthly' : 'biweekly', span: state.take(m.index, m.index + m[0].length, 'repeat') };
    }
    return null;
  }

  // The days a repeating event lands on, walked the way the Event editor walks them
  // (except monthly, which stays on her day of the month instead of drifting after February).
  function seriesDates(date, repeat, until) {
    if (!date) return [];
    if (!repeat || !EVENT_REPEATS[repeat] || !until || until <= date) return [date];
    var out = [], start = fromKey(date), d = start, i = 0;
    while (keyOf(d) <= until && i < 400) {
      if (repeat !== 'weekdays' || (d.getDay() > 0 && d.getDay() < 6)) out.push(keyOf(d));
      i++;
      if (repeat === 'daily' || repeat === 'weekdays') d = addDays(d, 1);
      else if (repeat === 'weekly') d = addDays(d, 7);
      else if (repeat === 'biweekly') d = addDays(d, 14);
      // Monthly counts from the first day each time, clamped to the month's last day, so a
      // run started on the 30th gives Feb 28 and then Mar 30 (stepping would drift to Mar 2).
      else d = addMonths(start, i);
    }
    return out.length ? out : [date];
  }
  // When she gives no end: four weeks of daily, three months of weekly, a year of monthly.
  function defaultUntil(date, repeat) {
    if (!date || !repeat) return null;
    var d = fromKey(date);
    if (repeat === 'daily' || repeat === 'weekdays') return keyOf(addDays(d, 27));
    if (repeat === 'weekly' || repeat === 'biweekly') return keyOf(addDays(d, 7 * 12));
    return keyOf(addMonths(d, 11));
  }

  // ── Title ───────────────────────────────────────────────────────────
  function tidy(s) {
    return s.replace(/[\u0001\u0002]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
      .replace(/^[\s,;:.\-–—]+/, '')
      .replace(/[\s,;:\-–—@]+$/, '')
      .trim();
  }

  function plain(kind, text) {
    return { kind: kind, text: text, date: null, time: null, endTime: null, repeat: null, until: null, understood: [KIND_LABEL[kind]] };
  }

  function parse(input, now, opts) {
    if (input == null) return null;
    var raw = String(input).replace(/[\u0001\u0002]/g, '').replace(/\s+/g, ' ').trim();
    if (!raw) return null;
    var nowD = toDate(now);
    var today = noon(nowD.getFullYear(), nowD.getMonth(), nowD.getDate());
    var nowMin = nowD.getHours() * 60 + nowD.getMinutes();

    // A word and a colon up front picks the kind: "task:", "todo:", "event:", "idea:", "note:"
    var body = raw, forced = null;
    var pm = /^(task|todo|to-do|to do|event|idea|note)\s*:\s*/i.exec(raw);
    if (pm && raw.slice(pm[0].length).trim()) {
      var p = pm[1].toLowerCase();
      forced = p === 'event' ? 'event' : p === 'idea' ? 'idea' : p === 'note' ? 'note' : 'task';
      body = raw.slice(pm[0].length).trim();
    }
    if (opts && opts.kind && KIND_LABEL[opts.kind]) forced = opts.kind;

    var buy = /^buy\s+(\S.*)$/i.exec(body);
    if (forced === 'idea' || forced === 'note') return plain(forced, body);
    if (forced === 'shop') return plain('shop', buy ? buy[1].trim() : body);

    var spans = [];
    var state = {
      work: body,
      take: function (a, b, type) { var sp = { a: a, b: b, type: type, remove: true }; spans.push(sp); state.work = mask(state.work, a, b, REMOVED); return sp; },
      keep: function (a, b) { state.work = mask(state.work, a, b, KEPT); },
      spanEndingNear: function (idx, type) {
        var j = idx; while (j > 0 && /\s/.test(state.work.charAt(j - 1))) j--;
        return spans.some(function (sp) { return sp.type === type && sp.b === j; });
      },
    };

    // 1. Repeats that start with "every"
    var rep = findRepeat(state);

    // 2. Dates
    var cands = findDates(state.work, body);
    var untilC = null, dateC = null;
    cands.forEach(function (c) { if (c.until) { if (!untilC) untilC = c; } });
    var strong = cands.filter(function (c) { return !c.until && !c.weak; });
    var weak = cands.filter(function (c) { return !c.until && c.weak; });
    dateC = strong[0] || weak[0] || null;
    var dateSpan = null, untilSpan = null;
    if (dateC) { dateSpan = state.take(dateC.a0, dateC.b, 'date'); dateSpan.lead = dateC.lead; dateSpan.coreA = dateC.a; }
    if (untilC) { untilSpan = state.take(untilC.a0, untilC.b, 'until'); }

    // 3. Times
    var t = findTimes(state);
    var part = findPartOfDay(state);
    var tonight = !!(dateC && dateC.desc.tonight);
    var hint = part ? part.word : tonight ? 'tonight' : null;
    var time = t.time, endTime = t.endTime;
    if (time && t.open && hint && !endTime) {
      // "tomorrow morning at 7" is 7 in the morning
      var hh = t.rawHour % 12, mm = minutesOf(time) % 60;
      time = hhmm(hint === 'morning' ? hh : hh + 12, mm);
    }
    if (!time && hint) time = PART_TIME[hint];

    // 4. daily / weekly / monthly as a word of their own
    if (!rep) rep = findRepeatWord(state);

    // 5. What kind of thing is it
    var hasDateWords = !!(dateC || (part && part.today) || (rep && rep.dow != null) || untilC);
    // "by 5pm" and "due friday 5pm" are deadlines: a task with a time, not an event.
    var deadline = !!time && !endTime && (!!t.deadline || (!!dateC && /^(?:due|by|before|due on|due by)$/.test(dateC.lead || '')));
    var kind;
    if (forced) kind = forced;
    else if (time && !deadline) kind = 'event';
    else if ((hasDateWords || rep) && EVENT_WORDS.test(body) && !TASK_LEAD.test(body)) kind = 'event';
    else if (buy && !hasDateWords && !rep) kind = 'shop';
    else kind = 'task';

    if (kind === 'shop') return plain('shop', buy[1].trim());

    // 6. Can the app hold this repeat for this kind
    var repeat = null;
    if (rep) {
      if ((kind === 'task' ? TASK_REPEATS : EVENT_REPEATS)[rep.value]) repeat = rep.value;
      else rep.span.remove = false;
    }

    // 7. The day
    var date = dateC ? resolveDate(dateC.desc, today, time, nowMin) : null;
    if (dateC && !date) { dateSpan.remove = false; }
    var until = null;
    if (untilC) {
      var ud = resolveDate(untilC.desc, today, null, nowMin);
      if (repeat && kind === 'event' && ud) until = keyOf(ud);
      else if (!repeat && !date && ud) date = ud;          // "hold the package until friday"
      else untilSpan.remove = false;
    }
    if (!date && part && part.today) date = today;
    if (repeat) {
      var base = date || today;
      if (rep.dow != null) base = addDays(base, (rep.dow - base.getDay() + 7) % 7);
      if (repeat === 'weekdays') { while (base.getDay() === 0 || base.getDay() === 6) base = addDays(base, 1); }
      date = base;
    }
    if ((kind === 'event' || time) && !date) date = today;
    var dateKey = date ? keyOf(date) : null;
    if (until && dateKey && until <= dateKey) until = null;
    if (repeat && kind === 'event' && !until) until = defaultUntil(dateKey, repeat);

    // 8. The title. "for friday" comes out only when it closes the line.
    if (dateSpan && dateSpan.remove && dateSpan.lead === 'for') {
      var tail = state.work.slice(dateSpan.b);
      var closes = new RegExp('^[\\s' + REMOVED + ',.;!?]*$').test(tail) &&
        !spans.some(function (sp) { return sp.a >= dateSpan.b && !sp.remove; });
      if (!closes) dateSpan.remove = false;
    }
    var title = '', at = 0;
    spans.slice().sort(function (p1, p2) { return p1.a - p2.a; }).forEach(function (sp) {
      if (!sp.remove || sp.a < at) return;
      title += body.slice(at, sp.a) + ' ';
      at = sp.b;
    });
    title = tidy(title + body.slice(at));
    if (!title) title = body;

    // 9. Chips
    var understood = [KIND_LABEL[kind]];
    if (dateKey) understood.push(formatDate(dateKey, nowD));
    if (time) understood.push(endTime ? formatTime(time) + ' to ' + formatTime(endTime) : formatTime(time));
    if (repeat) understood.push(REPEAT_LABEL[repeat]);
    if (until) understood.push('Until ' + formatDate(until, nowD));

    return { kind: kind, text: title, date: dateKey, time: time || null, endTime: endTime || null, repeat: repeat, until: until, understood: understood };
  }

  parse.seriesDates = seriesDates;
  parse.defaultUntil = defaultUntil;
  parse.formatDate = formatDate;
  parse.formatTime = formatTime;
  parse.KINDS = ['task', 'event', 'shop', 'idea', 'note'];
  parse.KIND_LABEL = KIND_LABEL;
  parse.REPEAT_LABEL = REPEAT_LABEL;

  var root = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
  if (root) root.nylaSmartParse = parse;
})();
