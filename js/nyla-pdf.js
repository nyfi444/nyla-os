/* ── Nyla OS PDFs ─────────────────────────────────────────────────────
   Every "PDF" button in Nyla OS used to open a print window holding the
   page as plain text in Georgia: the headings, lists, tables and colour
   all flattened into words on paper, with the browser's own URL and date
   printed around it. This draws a real PDF file instead, in the Nyla OS
   look: DM Serif Display titles, DM Sans text, the rose-to-lavender
   stripe, rose bullets, soft tables, checklists, pictures and page
   numbers. No print dialog, so nothing of the browser ends up on it.

   window.nylaPdf.save({ title, eyebrow, meta, content })         one document
   window.nylaPdf.save({ title, eyebrow, meta, parts: [{ title, meta, content }] })
                                                                  a cover, contents, then each part
   content may be HTML (notebook pages, agent reports) or plain text /
   markdown (the Cosmic reports). It is only ever read with DOMParser, never
   put into the page, so nothing in it can run.

   A plain script (not babel): everything sits inside this function, and the
   only global it adds is window.nylaPdf. jsPDF and the fonts load the first
   time a PDF is made; without the fonts it falls back to Times/Helvetica. */
(function () {
  const JSPDF_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/3.0.1/jspdf.umd.min.js';
  const JSPDF_SRI = 'sha384-ytX5osgYad9GPnagB0k+CxKTir/bsE7AfpzvCnQ7owfeWuDd+2l2y0PSIqRK+z/2';
  const FONT_BASE = 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/';
  const FONTS = [
    ['NSans', 'normal', 'dm-sans@0.4.2/400Regular/DMSans_400Regular.ttf'],
    ['NSans', 'italic', 'dm-sans@0.4.2/400Regular_Italic/DMSans_400Regular_Italic.ttf'],
    ['NSans', 'bold', 'dm-sans@0.4.2/700Bold/DMSans_700Bold.ttf'],
    ['NSansMed', 'normal', 'dm-sans@0.4.2/500Medium/DMSans_500Medium.ttf'],
    ['NSerif', 'normal', 'dm-serif-display@0.4.2/400Regular/DMSerifDisplay_400Regular.ttf'],
    ['NSerif', 'italic', 'dm-serif-display@0.4.2/400Regular_Italic/DMSerifDisplay_400Regular_Italic.ttf'],
  ];

  // The Nyla OS palette, as RGB.
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const INK = hex('#2a1a24'), SOFT = hex('#5a3a4c'), MUTED = hex('#a08494'), ROSE = hex('#c4607a'),
    ROSE_DEEP = hex('#a8475f'), PINK = hex('#d8a0c0'), LAV = hex('#9070c8'), HAIR = hex('#eed9e2'),
    BLUSH = hex('#fcf5f8'), LAV_BG = hex('#f6f1fc'), WHITE = [255, 255, 255];

  /* ── Loading ─────────────────────────────────────────────────────── */
  let _lib = null;
  const loadJsPdf = () => {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!_lib) _lib = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = JSPDF_SRC; s.integrity = JSPDF_SRI; s.crossOrigin = 'anonymous';
      s.onload = () => res(window.jspdf.jsPDF);
      s.onerror = () => { _lib = null; rej(new Error('The PDF maker didn’t load. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return _lib;
  };
  let _fonts = null;
  const toBase64 = buf => {
    const bytes = new Uint8Array(buf); let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const loadFonts = () => {
    if (!_fonts) _fonts = Promise.all(FONTS.map(([fam, style, path]) =>
      fetch(FONT_BASE + path).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(buf => ({ fam, style, file: path.split('/').pop(), b64: toBase64(buf) }))))
      .catch(() => { _fonts = null; return null; });
    return _fonts;
  };

  /* ── Reading the content into blocks ─────────────────────────────── */
  // Emoji and other pictures-as-text have no glyph in either font.
  const clean = s => String(s == null ? '' : s)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
    .replace(/ /g, ' ');

  const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const mdInline = s => escHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  // Plain text and markdown become simple HTML, so there is one reader.
  const mdToHtml = md => {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    const out = []; let list = null; let para = [];
    // Plain-text reports (the Cosmic ones) use a short line as a section
    // title and "Label: value" lines; give those a heading and a bold label.
    const isTitleLine = l => l.length <= 44 && !/[.:!?,;)]$/.test(l) && !/:\s/.test(l) && !/[*_`[]/.test(l);
    const labelled = l => { const m = /^([^:*_`]{1,40}):\s+(.+)$/.exec(l); return m ? `<b>${escHtml(m[1])}:</b> ${mdInline(m[2])}` : mdInline(l); };
    const flushPara = () => {
      if (!para.length) return;
      if (para.length === 1 && /^[A-Z0-9 '&—-]{3,44}$/.test(para[0]) && /[A-Z]{2}/.test(para[0])) out.push(`<h3>${mdInline(para[0])}</h3>`);
      else {
        if (para.length > 1 && isTitleLine(para[0])) out.push(`<h3>${mdInline(para.shift())}</h3>`);
        out.push('<p>' + para.map(labelled).join('<br>') + '</p>');
      }
      para = [];
    };
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]; const t = line.trim();
      let m;
      if (!t) { flushPara(); closeList(); continue; }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(t))) { flushPara(); closeList(); out.push(`<h${m[1].length}>${mdInline(m[2])}</h${m[1].length}>`); continue; }
      if (/^(-{3,}|\*{3,}|_{3,}|[═━─]{3,})$/.test(t)) { flushPara(); closeList(); out.push('<hr>'); continue; }
      if (t.startsWith('>')) { flushPara(); closeList(); out.push(`<blockquote>${mdInline(t.replace(/^>\s?/, ''))}</blockquote>`); continue; }
      if (t.startsWith('|') && lines[i + 1] && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        flushPara(); closeList();
        const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => mdInline(c.trim()));
        const rows = [`<tr>${cells(t).map(c => `<th>${c}</th>`).join('')}</tr>`];
        i += 2;
        while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(`<tr>${cells(lines[i]).map(c => `<td>${c}</td>`).join('')}</tr>`); i++; }
        i--; out.push(`<table>${rows.join('')}</table>`); continue;
      }
      if ((m = /^([-*•·]|\d+[.)])\s+(.*)$/.exec(t))) {
        flushPara();
        const kind = /\d/.test(m[1]) ? 'ol' : 'ul';
        if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
        out.push(`<li>${mdInline(m[2])}</li>`); continue;
      }
      closeList(); para.push(t);
    }
    flushPara(); closeList();
    return out.join('');
  };
  const looksLikeHtml = s => /<(p|div|h[1-6]|ul|ol|li|br|table|blockquote|b|strong|em|i|span|img|pre|hr)\b[^>]*>/i.test(s);

  const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'HR', 'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY', 'DL', 'DT', 'DD']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'BUTTON', 'SELECT', 'TEXTAREA', 'HEAD', 'TITLE', 'META', 'LINK']);

  // Inline content of a node as styled runs: { t, b, i, code, link, box }.
  const runsOf = (node, st = {}, out = []) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { const t = clean(n.nodeValue).replace(/\s+/g, ' '); if (t) out.push({ ...st, t }); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (SKIP.has(tag) || tag === 'UL' || tag === 'OL' || tag === 'TABLE') continue;
      if (tag === 'BR') { out.push({ ...st, t: '\n' }); continue; }
      if (tag === 'IMG') continue;
      if (tag === 'INPUT') { if ((n.getAttribute('type') || '').toLowerCase() === 'checkbox') out.push({ box: n.hasAttribute('checked') }); continue; }
      const next = { ...st };
      const fw = (n.getAttribute('style') || '').match(/font-weight\s*:\s*(\d+|bold)/i);
      if (tag === 'B' || tag === 'STRONG' || (fw && (fw[1] === 'bold' || +fw[1] >= 600))) next.b = true;
      if (tag === 'I' || tag === 'EM' || /font-style\s*:\s*italic/i.test(n.getAttribute('style') || '')) next.i = true;
      if (tag === 'CODE' || tag === 'KBD') next.code = true;
      if (tag === 'A' && /^(https?:|mailto:)/i.test(n.getAttribute('href') || '')) next.link = n.getAttribute('href');
      runsOf(n, next, out);
      if (BLOCK.has(tag)) out.push({ ...st, t: '\n' });
    }
    return out;
  };
  // Tidy runs: trim the ends, drop empty ones, and turn a leading
  // "[ ]", "[x]", "☐" or "☑" into a drawn checkbox.
  const tidy = runs => {
    const r = runs.filter(x => x.box !== undefined || x.t);
    while (r.length && r[0].t && !r[0].t.trim()) r.shift();
    while (r.length && r[r.length - 1].t && !r[r.length - 1].t.trim()) r.pop();
    if (r.length && r[0].t) r[0] = { ...r[0], t: r[0].t.replace(/^\s+/, '') };
    if (r.length && r[r.length - 1].t) r[r.length - 1] = { ...r[r.length - 1], t: r[r.length - 1].t.replace(/\s+$/, '') };
    let box;
    if (r.length && r[0].box !== undefined) { box = r[0].box; r.shift(); if (r[0]?.t) r[0] = { ...r[0], t: r[0].t.replace(/^\s+/, '') }; }
    else if (r.length && r[0].t) {
      const m = /^(\[( |x|X)\]|☐|☑|✓|✔)\s*/.exec(r[0].t);
      if (m) { box = !/^\[ \]|☐/.test(m[0]); r[0] = { ...r[0], t: r[0].t.slice(m[0].length) }; }
    }
    return { runs: r.filter(x => x.box !== undefined || x.t), box };
  };
  const hasText = runs => runs.some(x => x.t && x.t.trim());
  const runsText = runs => runs.map(x => x.t || '').join('').trim().toLowerCase();
  // Pages often open with their own name as a heading; the title block already says it.
  const dropRepeatedTitle = (blocks, title) => {
    const first = blocks[0];
    if (first && /^h[12]$/.test(first.type) && runsText(first.runs) === clean(title || '').trim().toLowerCase()) blocks.shift();
    return blocks;
  };

  const readBlocks = html => {
    const docu = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
    const blocks = [];
    let pending = [];
    const flush = () => { const { runs, box } = tidy(pending); pending = []; if (hasText(runs)) blocks.push(box === undefined ? { type: 'p', runs } : { type: 'li', depth: 0, box, runs }); };
    const walk = (node, depth = 0) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { const t = clean(n.nodeValue).replace(/\s+/g, ' '); if (t.trim() || pending.length) pending.push({ t }); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName;
        if (SKIP.has(tag)) continue;
        if (n.hasAttribute && n.hasAttribute('data-pdf-key')) { flush(); blocks.push({ type: 'note', runs: [{ t: `Attached PDF: ${clean(n.getAttribute('data-pdf-name') || 'file')}` }] }); continue; }
        if (!BLOCK.has(tag) && tag !== 'IMG' && tag !== 'BR') { pending.push(...runsOf({ childNodes: [n] })); continue; }
        if (tag === 'BR') { pending.push({ t: '\n' }); continue; }
        flush();
        if (tag === 'IMG') { const src = n.getAttribute('src') || ''; if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(src)) blocks.push({ type: 'img', src }); continue; }
        if (/^H[1-6]$/.test(tag)) { const { runs } = tidy(runsOf(n)); if (hasText(runs)) blocks.push({ type: 'h' + Math.min(4, +tag[1]), runs: runs.map(x => ({ ...x, b: false })) }); continue; }
        if (tag === 'HR') { blocks.push({ type: 'hr' }); continue; }
        if (tag === 'PRE') { const t = clean(n.textContent || '').replace(/\s+$/, ''); if (t) blocks.push({ type: 'code', text: t }); continue; }
        if (tag === 'BLOCKQUOTE') { const { runs } = tidy(runsOf(n)); if (hasText(runs)) blocks.push({ type: 'quote', runs }); continue; }
        if (tag === 'UL' || tag === 'OL') {
          let idx = Number(n.getAttribute('start')) || 1;
          for (const li of n.children) {
            if (li.tagName !== 'LI') continue;
            const { runs, box } = tidy(runsOf(li));
            const cb = li.querySelector(':scope > input[type=checkbox]');
            const checked = cb ? cb.hasAttribute('checked') : (li.getAttribute('data-checked') === 'true' || /\bchecked\b/.test(li.className || '') ? true : box);
            if (hasText(runs)) blocks.push({ type: 'li', ordered: tag === 'OL', n: idx, depth, box: checked, runs });
            idx++;
            for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') walk({ childNodes: [sub] }, depth + 1);
            for (const img of li.querySelectorAll('img')) { const src = img.getAttribute('src') || ''; if (/^data:image\//i.test(src)) blocks.push({ type: 'img', src }); }
          }
          continue;
        }
        if (tag === 'TABLE') {
          const rows = [];
          for (const tr of n.querySelectorAll('tr')) {
            const cells = [...tr.children].filter(c => c.tagName === 'TD' || c.tagName === 'TH');
            if (!cells.length) continue;
            rows.push({ head: cells.every(c => c.tagName === 'TH') || tr.parentElement?.tagName === 'THEAD', cells: cells.map(c => tidy(runsOf(c)).runs) });
          }
          if (rows.length) blocks.push({ type: 'table', rows });
          continue;
        }
        // A container: its own blocks, or one paragraph if it holds only text.
        const hasBlocks = [...n.children].some(c => BLOCK.has(c.tagName) || c.tagName === 'IMG');
        if (hasBlocks) walk(n, depth);
        else { pending.push(...runsOf(n)); flush(); }
      }
    };
    walk(docu.body);
    flush();
    return blocks;
  };

  const imageSize = src => new Promise(res => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight, im });
    im.onerror = () => res(null);
    im.src = src;
  });
  // jsPDF takes PNG and JPEG; anything else is redrawn as a JPEG first.
  const pdfImage = async src => {
    const size = await imageSize(src);
    if (!size || !size.w) return null;
    if (/^data:image\/(png|jpe?g);/i.test(src)) return { ...size, src, fmt: /png/i.test(src.slice(0, 20)) ? 'PNG' : 'JPEG' };
    const c = document.createElement('canvas'); c.width = size.w; c.height = size.h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(size.im, 0, 0);
    return { ...size, src: c.toDataURL('image/jpeg', 0.9), fmt: 'JPEG' };
  };

  /* ── Drawing ─────────────────────────────────────────────────────── */
  async function build(opts) {
    const JsPDF = await loadJsPdf();
    const fonts = await loadFonts();
    const doc = new JsPDF({ unit: 'pt', format: 'letter', compress: true });
    let SANS = 'helvetica', SANS_MED = 'helvetica', SERIF = 'times', SERIF_IT = 'italic', MED_STYLE = 'bold';
    if (fonts) {
      for (const f of fonts) { doc.addFileToVFS(f.file, f.b64); doc.addFont(f.file, f.fam, f.style); }
      SANS = 'NSans'; SANS_MED = 'NSansMed'; SERIF = 'NSerif'; SERIF_IT = 'italic'; MED_STYLE = 'normal';
    }
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const ML = 68, MR = 68, TOP = 76, BOTTOM = H - 74, maxW = W - ML - MR;
    const color = c => doc.setTextColor(c[0], c[1], c[2]);
    const fill = c => doc.setFillColor(c[0], c[1], c[2]);
    const stroke = c => doc.setDrawColor(c[0], c[1], c[2]);
    const font = (fam, style, size) => { doc.setFont(fam, style); doc.setFontSize(size); };
    // Unkerned widths: words are placed one at a time and drawn without
    // kerning, so a kerned measurement lets a word run into the next space.
    const tw = t => doc.getStringUnitWidth(t, { kerning: {} }) * doc.getFontSize() / doc.internal.scaleFactor;
    const safe = s => fonts ? s : s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x00-\xFF]/g, '');

    // Rose to pink to lavender, as thin strips.
    const stripe = (y, h) => {
      const stops = [ROSE, PINK, LAV], n = 90;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), seg = t < 0.55 ? 0 : 1, lt = seg === 0 ? t / 0.55 : (t - 0.55) / 0.45;
        const a = stops[seg], b = stops[seg + 1];
        fill(a.map((v, k) => Math.round(v + (b[k] - v) * lt)));
        doc.rect((W / n) * i, y, W / n + 0.6, h, 'F');
      }
    };

    let y = TOP;
    let runningTitle = opts.title || '';
    const pageStarts = [];
    // A continuation page carries the title small at the top; a page that
    // opens with its own title block doesn't need it.
    const newPage = (opening = false) => {
      doc.addPage();
      stripe(0, 3);
      if (!opening) { font(SANS_MED, MED_STYLE, 7); color(MUTED); doc.text(safe(clean(runningTitle)).toUpperCase().slice(0, 80), ML, 44, { charSpace: 1.4 }); }
      y = TOP;
    };
    const ensure = h => { if (y + h > BOTTOM) newPage(); };

    // Words with their style, measured, then broken into lines.
    const styleOf = (r, base) => {
      if (r.code) return { fam: 'courier', style: 'normal', size: base.size - 1, col: ROSE_DEEP };
      const fam = base.fam;
      let style = base.style || 'normal';
      if (fam === SANS) style = r.b ? 'bold' : r.i ? 'italic' : 'normal';
      if (fam === SERIF) style = r.i || base.style === 'italic' ? SERIF_IT : 'normal';
      if (!fonts && fam === SANS) style = r.b && r.i ? 'bolditalic' : r.b ? 'bold' : r.i ? 'italic' : 'normal';
      if (!fonts && fam === SERIF) style = r.b && (r.i || base.style === 'italic') ? 'bolditalic' : r.b ? 'bold' : (r.i || base.style === 'italic') ? 'italic' : 'normal';
      return { fam, style, size: base.size, col: r.link ? ROSE_DEEP : (r.b && fam === SANS ? INK : base.col), link: r.link };
    };
    const layout = (runs, base, width) => {
      const lines = [[]]; let lineW = 0;
      const push = (tok) => {
        font(tok.st.fam, tok.st.style, tok.st.size);
        const w = tw(tok.t);
        const trimmedW = tw(tok.t.replace(/\s+$/, ''));
        if (lineW + trimmedW > width && lines[lines.length - 1].length) {
          lines.push([]); lineW = 0;
          if (!tok.t.trim()) return;
          tok = { ...tok, t: tok.t.replace(/^\s+/, '') };
        }
        // One word wider than the line (a long link): split it.
        if (trimmedW > width) {
          let chunk = '';
          for (const ch of tok.t) {
            if (tw(chunk + ch) > width && chunk) { lines[lines.length - 1].push({ ...tok, t: chunk, w: tw(chunk) }); lines.push([]); chunk = ''; }
            chunk += ch;
          }
          tok = { ...tok, t: chunk }; lineW = 0;
        }
        const ww = tw(tok.t);
        lines[lines.length - 1].push({ ...tok, w: ww, x: lineW });
        lineW += ww;
        void w;
      };
      for (const r of runs) {
        if (r.box !== undefined) continue;
        const st = styleOf(r, base);
        const parts = safe(r.t).split('\n');
        parts.forEach((p, pi) => {
          if (pi > 0) { lines.push([]); lineW = 0; }
          for (const m of p.match(/\S+\s*|\s+/g) || []) push({ t: m, st });
        });
      }
      // Recompute x positions after any leading-space trims.
      for (const l of lines) { let x = 0; for (const t of l) { t.x = x; x += t.w; } }
      while (lines.length > 1 && !lines[lines.length - 1].length) lines.pop();
      return lines;
    };
    const drawLine = (line, x, yy) => {
      for (const t of line) {
        font(t.st.fam, t.st.style, t.st.size); color(t.st.col);
        const text = t.t.replace(/\s+$/, '');
        if (!text) continue;
        doc.text(text, x + t.x, yy);
        if (t.st.link) {
          stroke(PINK); doc.setLineWidth(0.4);
          doc.line(x + t.x, yy + 1.8, x + t.x + tw(text), yy + 1.8);
          doc.link(x + t.x, yy - t.st.size, tw(text), t.st.size + 3, { url: t.st.link });
        }
      }
    };
    const paragraph = (runs, base, lead, x = ML, width = maxW, before) => {
      const lines = layout(runs, base, width);
      lines.forEach((l, i) => { ensure(lead); if (before) before(i, y); drawLine(l, x, y); y += lead; });
      return lines.length;
    };

    const BODY = { fam: SANS, style: 'normal', size: 10.5, col: INK };
    const checkbox = (x, yy, on) => {
      doc.setLineWidth(0.8); stroke(ROSE);
      if (on) { fill(ROSE); doc.roundedRect(x, yy - 7.6, 8.6, 8.6, 2, 2, 'FD'); stroke(WHITE); doc.setLineWidth(1.1); doc.lines([[2, 2.2], [3.6, -4.6]], x + 2, yy - 3.4); }
      else doc.roundedRect(x, yy - 7.6, 8.6, 8.6, 2, 2, 'S');
    };

    const drawBlocks = async blocks => {
      let prev = null;
      for (const b of blocks) {
        if (prev && prev.type === 'li' && b.type !== 'li') y += 6;
        if (b.type === 'h1') {
          y += prev ? 16 : 2; ensure(46);
          paragraph(b.runs, { fam: SERIF, style: 'normal', size: 20, col: INK }, 25);
          stroke(HAIR); doc.setLineWidth(0.6); doc.line(ML, y - 12, ML + maxW, y - 12); y += 2;
        } else if (b.type === 'h2') {
          y += prev ? 12 : 0; ensure(40);
          paragraph(b.runs, { fam: SERIF, style: 'normal', size: 15.5, col: hex('#3a1828') }, 20); y += 2;
        } else if (b.type === 'h3') {
          y += prev ? 10 : 0; ensure(34);
          const runs = b.runs.map(r => ({ ...r, t: r.t.toUpperCase() }));
          font(SANS_MED, MED_STYLE, 8);
          const lines = layout(runs, { fam: SANS_MED, style: MED_STYLE, size: 8, col: ROSE }, maxW);
          lines.forEach(l => { ensure(14); color(ROSE); font(SANS_MED, MED_STYLE, 8); doc.text(l.map(t => t.t).join('').trim(), ML, y, { charSpace: 1.5 }); y += 14; });
          y += 1;
        } else if (b.type === 'h4') {
          y += prev ? 6 : 0; ensure(30);
          paragraph(b.runs.map(r => ({ ...r, b: true })), BODY, 16);
        } else if (b.type === 'p') {
          paragraph(b.runs, BODY, 16.5); y += 7;
        } else if (b.type === 'note') {
          ensure(26); fill(LAV_BG); doc.roundedRect(ML, y - 12, maxW, 20, 5, 5, 'F');
          paragraph(b.runs, { ...BODY, size: 9, col: SOFT }, 12, ML + 10); y += 10;
        } else if (b.type === 'li') {
          const indent = 16 + b.depth * 16;
          const x = ML + indent, width = maxW - indent;
          const marker = (i, yy) => {
            if (i) return;
            if (b.box !== undefined) checkbox(ML + indent - 15, yy, b.box);
            else if (b.ordered) { font(SANS_MED, MED_STYLE, 9.5); color(ROSE); doc.text(`${b.n}.`, ML + indent - 5, yy, { align: 'right' }); }
            else { fill(b.depth ? PINK : ROSE); doc.circle(ML + indent - 9, yy - 3.4, b.depth ? 1.5 : 1.9, 'F'); }
          };
          const done = b.box === true;
          paragraph(done ? b.runs.map(r => ({ ...r })) : b.runs, done ? { ...BODY, col: MUTED } : BODY, 16, x + (b.box !== undefined ? 1 : 0), width, marker);
          y += 3;
        } else if (b.type === 'quote') {
          y += 10;
          const x = ML + 16;
          const n = paragraph(b.runs, { fam: SERIF, style: SERIF_IT, size: 13, col: SOFT }, 19, x, maxW - 16, (i, yy) => { fill(LAV); doc.rect(ML + 1, yy - 13, 2, 19, 'F'); });
          void n; y += 8;
        } else if (b.type === 'code') {
          const lines = b.text.split('\n').flatMap(l => { font('courier', 'normal', 9); return doc.splitTextToSize(safe(l) || ' ', maxW - 20); });
          y += 2;
          for (const l of lines) { ensure(13); fill(BLUSH); doc.rect(ML, y - 10, maxW, 13, 'F'); font('courier', 'normal', 9); color(SOFT); doc.text(l, ML + 10, y); y += 13; }
          y += 9;
        } else if (b.type === 'hr') {
          y += 6; ensure(20);
          const cx = W / 2;
          stroke(HAIR); doc.setLineWidth(0.6); doc.line(cx - 90, y - 3, cx - 12, y - 3); doc.line(cx + 12, y - 3, cx + 90, y - 3);
          fill(ROSE); doc.circle(cx - 5, y - 3, 1.3, 'F'); fill(PINK); doc.circle(cx, y - 3, 1.3, 'F'); fill(LAV); doc.circle(cx + 5, y - 3, 1.3, 'F');
          y += 14;
        } else if (b.type === 'img') {
          const im = await pdfImage(b.src);
          if (im) {
            let w = Math.min(maxW, im.w * 0.75), h = w * im.h / im.w;
            if (h > 380) { h = 380; w = h * im.w / im.h; }
            if (y + h > BOTTOM) newPage();
            try { doc.addImage(im.src, im.fmt, ML + (maxW - w) / 2, y - 6, w, h, undefined, 'FAST'); y += h + 10; } catch (e) { /* unreadable picture: leave it out */ }
          }
        } else if (b.type === 'table') {
          await drawTable(b.rows);
        }
        prev = b;
      }
    };

    const drawTable = async rows => {
      const cols = Math.max(...rows.map(r => r.cells.length));
      const PAD = 7, SIZE = 9.2, LEAD = 12.5;
      const cellText = runs => runs.map(r => r.t || '').join('');
      // Natural widths, then shared out across the line.
      const natural = Array.from({ length: cols }, (_, c) => Math.max(40, ...rows.map(r => { font(SANS, 'normal', SIZE); return tw(safe(cellText(r.cells[c] || []))) + PAD * 2; })));
      const total = natural.reduce((a, b) => a + b, 0);
      const widths = total <= maxW ? natural.map(w => w * maxW / total) : (() => {
        const fair = maxW / cols; const small = natural.filter(w => w < fair);
        const spare = maxW - small.reduce((a, b) => a + b, 0); const bigTotal = natural.filter(w => w >= fair).reduce((a, b) => a + b, 0);
        return natural.map(w => (w < fair ? w : w / bigTotal * spare));
      })();
      const head = rows[0].head ? rows[0] : null;
      const drawRow = (row, isHead, zebra) => {
        const base = isHead ? { fam: SANS_MED, style: MED_STYLE, size: 7.4, col: MUTED } : { fam: SANS, style: 'normal', size: SIZE, col: INK };
        const laid = widths.map((w, c) => layout((row.cells[c] || []).map(r => isHead ? { ...r, t: (r.t || '').toUpperCase(), b: false } : r), base, w - PAD * 2));
        const lead = isHead ? 11 : LEAD;
        const h = Math.max(...laid.map(l => l.length)) * lead + PAD * 2 - 3;
        if (y - 10 + h > BOTTOM) { newPage(); if (!isHead && head) drawRow(head, true, false); }
        const top = y - 10;
        if (zebra) { fill(BLUSH); doc.rect(ML, top, maxW, h, 'F'); }
        let x = ML;
        laid.forEach((lines, c) => {
          lines.forEach((l, i) => {
            if (isHead) { font(SANS_MED, MED_STYLE, 7.4); color(MUTED); doc.text(l.map(t => t.t).join('').trim(), x + PAD, top + PAD + 7 + i * lead, { charSpace: 0.9 }); }
            else drawLine(l, x + PAD, top + PAD + 8 + i * lead);
          });
          x += widths[c];
        });
        stroke(isHead ? PINK : HAIR); doc.setLineWidth(isHead ? 0.8 : 0.5); doc.line(ML, top + h, ML + maxW, top + h);
        y = top + h + 10;
      };
      y += 4;
      let z = false;
      rows.forEach(r => { const isHead = r === head; drawRow(r, isHead, !isHead && z); if (!isHead) z = !z; });
      y += 8;
    };

    // The title block at the top of a document (or a part of one).
    const titleBlock = ({ eyebrow, title, meta }) => {
      if (eyebrow) { font(SANS_MED, MED_STYLE, 7.6); color(ROSE); doc.text(safe(clean(eyebrow)).toUpperCase(), ML, y, { charSpace: 2.2 }); y += 32; }
      font(SERIF, 'normal', 30);
      const lines = doc.splitTextToSize(safe(clean(title || 'Untitled')), maxW);
      lines.slice(0, 4).forEach(l => { color(INK); font(SERIF, 'normal', 30); doc.text(l, ML, y); y += 34; });
      y -= 12;
      if (meta) { y += 12; font(SANS, 'normal', 9); color(MUTED); doc.text(safe(clean(meta)).slice(0, 140), ML, y); }
      y += 18;
      fill(ROSE); doc.rect(ML, y, 34, 1.4, 'F'); fill(LAV); doc.rect(ML + 34, y, 14, 1.4, 'F');
      y += 34;
    };

    const toHtml = c => (looksLikeHtml(String(c || '')) ? String(c || '') : mdToHtml(c));
    const parts = opts.parts && opts.parts.length ? opts.parts : null;

    // Page one.
    stripe(0, 5);
    if (!parts || parts.length === 1) {
      const p = parts ? parts[0] : opts;
      runningTitle = p.title || opts.title;
      y = TOP + 8;
      titleBlock({ eyebrow: opts.eyebrow || 'nyla os', title: p.title || opts.title, meta: p.meta ?? opts.meta });
      const blocks = dropRepeatedTitle(readBlocks(toHtml(p.content)), p.title || opts.title);
      if (!blocks.length) { font(SERIF, SERIF_IT, 13); color(MUTED); doc.text('Nothing written here yet.', ML, y); }
      await drawBlocks(blocks);
    } else {
      // A cover with the contents; page numbers are filled in at the end.
      y = 250;
      font(SANS_MED, MED_STYLE, 8); color(ROSE); doc.text(safe(clean(opts.eyebrow || 'nyla os')).toUpperCase(), ML, y, { charSpace: 2.6 }); y += 40;
      font(SERIF, 'normal', 44);
      doc.splitTextToSize(safe(clean(opts.title || 'Notebook')), maxW).slice(0, 3).forEach(l => { color(INK); font(SERIF, 'normal', 44); doc.text(l, ML, y); y += 48; });
      y += 4; font(SANS, 'normal', 10); color(MUTED); doc.text(safe(clean(opts.meta || '')), ML, y); y += 22;
      fill(ROSE); doc.rect(ML, y, 40, 1.6, 'F'); fill(LAV); doc.rect(ML + 40, y, 16, 1.6, 'F');
      const contentsTop = y + 50;
      for (const p of parts) {
        runningTitle = p.title; newPage(true);
        doc.setPage(doc.getNumberOfPages());
        pageStarts.push(doc.getNumberOfPages());
        y = TOP + 8;
        titleBlock({ eyebrow: opts.title, title: p.title, meta: p.meta });
        const blocks = dropRepeatedTitle(readBlocks(toHtml(p.content)), p.title);
        if (!blocks.length) { font(SERIF, SERIF_IT, 13); color(MUTED); doc.text('Nothing written here yet.', ML, y); }
        await drawBlocks(blocks);
      }
      // Contents, on the cover (as many as fit).
      doc.setPage(1);
      let cy = contentsTop;
      font(SANS_MED, MED_STYLE, 7.4); color(MUTED); doc.text('CONTENTS', ML, cy, { charSpace: 2 }); cy += 22;
      parts.forEach((p, i) => {
        if (cy > BOTTOM - 10) return;
        font(SERIF, 'normal', 12.5); color(INK);
        const name = doc.splitTextToSize(safe(clean(p.title || 'Untitled')), maxW - 60)[0];
        doc.text(name, ML, cy);
        const nameW = tw(name);
        font(SANS, 'normal', 9.5); color(ROSE); doc.text(String(pageStarts[i]), ML + maxW, cy, { align: 'right' });
        stroke(HAIR); doc.setLineWidth(0.5); doc.setLineDashPattern([1, 3], 0); doc.line(ML + nameW + 8, cy - 2, ML + maxW - 18, cy - 2); doc.setLineDashPattern([], 0);
        doc.link(ML, cy - 12, maxW, 16, { pageNumber: pageStarts[i] });
        cy += 22;
      });
    }

    // Footer on every page.
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      stroke(HAIR); doc.setLineWidth(0.5); doc.line(ML, H - 50, W - MR, H - 50);
      font(SERIF, SERIF_IT, 10); color(ROSE); doc.text('nyla os', ML, H - 34);
      font(SANS, 'normal', 7.8); color(MUTED);
      doc.text(`${p} / ${pages}`, W - MR, H - 34, { align: 'right' });
      if (opts.footer) doc.text(safe(clean(opts.footer)).slice(0, 70), W / 2, H - 34, { align: 'center' });
    }
    doc.setProperties({ title: clean(opts.title || 'Nyla OS'), author: 'Nyla OS', creator: 'Nyla OS' });
    return doc.output('blob');
  }

  // Hands the file over. On a phone or iPad the share sheet is the only way
  // into Files (a download link lands inside whatever app wraps the page).
  async function deliver(blob, filename) {
    const file = new File([blob], filename, { type: 'application/pdf' });
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename.replace(/\.pdf$/, '') }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'downloaded';
  }

  const fileName = t => (clean(t || 'Nyla OS').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Nyla OS') + '.pdf';
  // The app's toast is a top-level const in the main script (not on window;
  // window.toast is agent-uploads.js's console stand-in), found at call time.
  const say = (m, kind) => { try { if (typeof toast === 'function') toast(m, kind); } catch (e) {} };

  window.nylaPdf = {
    build,
    async save(opts) {
      say('Making your PDF…', 'info');
      try {
        const blob = await build(opts || {});
        const how = await deliver(blob, fileName(opts && opts.title));
        if (how === 'downloaded') say('PDF saved ✓', 'success');
        return how;
      } catch (e) {
        say(e && e.message ? e.message : 'Couldn’t make the PDF.', 'error');
        return 'failed';
      }
    },
    _readBlocks: readBlocks, _mdToHtml: mdToHtml,
  };
})();
