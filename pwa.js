/* ── Install Nyla OS as an app ─────────────────────────────────────
   Registers the service worker (offline + installable), then offers the
   right "add to home screen" for whatever you're on: a real Install
   button on Chrome, Edge and Android; Share → Add to Home Screen on
   iPhone and iPad; File → Add to Dock in Safari on a Mac. It stays out
   of the way once it's installed, and for a month after "Not now".
   Call showInstallHelp() any time to bring the instructions back.
──────────────────────────────────────────────────────────────── */
(function () {
  const APP = { name: 'Nyla OS', accent: '#c4607a', surface: '#ffffff', text: '#2f2a2c', muted: '#7d7276', border: '#efe4e6' };
  const KEY = 'nyla_os_install';
  let installEvent = null;

  const info = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const save = (patch) => { try { localStorage.setItem(KEY, JSON.stringify({ ...info(), ...patch })); } catch {} };
  const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMacSafari = () => /Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(navigator.userAgent);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; maybeShowChip(); });
  window.addEventListener('appinstalled', () => { installEvent = null; save({ installed: Date.now() }); removeChip(); });

  function style(el, css) { Object.assign(el.style, css); }
  function removeChip() { document.getElementById('nyla-install-chip')?.remove(); }

  function maybeShowChip() {
    if (standalone() || document.getElementById('nyla-install-chip')) return;
    const saved = info();
    if (saved.installed) return;
    if (saved.dismissedAt && Date.now() - saved.dismissedAt < 30 * 86400000) return;
    if (!installEvent && !isIOS() && !isMacSafari()) return; // nothing useful to offer

    const chip = document.createElement('div');
    chip.id = 'nyla-install-chip';
    // On a phone the app's own bottom bar is there, so it sits above it and
    // spans the width instead of crowding into the corner.
    const narrow = window.innerWidth < 620;
    style(chip, {
      position: 'fixed', zIndex: 2147483000, right: narrow ? '12px' : '18px', bottom: narrow ? '86px' : '18px',
      left: narrow ? '12px' : 'auto', maxWidth: 'calc(100vw - 24px)',
      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
      background: APP.surface, color: APP.text, border: `1px solid ${APP.border}`, borderRadius: '14px',
      boxShadow: '0 10px 30px rgba(0,0,0,.14)', font: "14px/1.35 'DM Sans', system-ui, sans-serif",
      animation: 'nylaInstallIn .25s ease-out',
    });
    const icon = document.createElement('img');
    icon.src = 'icons/icon-192.png';
    icon.alt = '';
    style(icon, { width: '32px', height: '32px', borderRadius: '8px', flexShrink: '0' });
    const label = document.createElement('div');
    label.innerHTML = `<div style="font-weight:600">Add ${APP.name} to your ${isIOS() ? 'Home Screen' : 'apps'}</div><div style="font-size:12.5px;color:${APP.muted}">Opens on its own, works offline</div>`;
    const go = document.createElement('button');
    go.textContent = installEvent ? 'Install' : 'Show me how';
    style(go, { border: 'none', borderRadius: '9px', padding: '8px 12px', background: APP.accent, color: '#fff', fontWeight: '600', cursor: 'pointer', font: "13px 'DM Sans', system-ui, sans-serif" });
    go.onclick = startInstall;
    const no = document.createElement('button');
    no.textContent = 'Not now';
    no.setAttribute('aria-label', 'Not now');
    style(no, { border: 'none', background: 'transparent', color: APP.muted, cursor: 'pointer', whiteSpace: 'nowrap', font: "13px 'DM Sans', system-ui, sans-serif" });
    no.onclick = () => { save({ dismissedAt: Date.now() }); removeChip(); };
    chip.append(icon, label, go, no);
    document.body.appendChild(chip);
  }

  async function startInstall() {
    if (installEvent) {
      const e = installEvent;
      installEvent = null;
      removeChip();
      try {
        e.prompt();
        const choice = await e.userChoice;
        save(choice?.outcome === 'accepted' ? { installed: Date.now() } : { dismissedAt: Date.now() });
      } catch { showInstallHelp(); }
      return;
    }
    showInstallHelp();
  }

  window.showInstallHelp = function showInstallHelp() {
    document.getElementById('nyla-install-help')?.remove();
    const steps = standalone() ? [`You’re already using ${APP.name} as an app.`]
      : isIOS() ? ['Tap the <b>Share</b> button at the bottom of Safari (top on iPad).', 'Scroll down and tap <b>Add to Home Screen</b>.', 'Tap <b>Add</b>, then open it from your Home Screen from now on.']
      : isMacSafari() ? ['In the menu bar, click <b>File</b>.', 'Click <b>Add to Dock</b>, then <b>Add</b>.', 'It opens in its own window from the Dock.']
      : ['Look for the install icon at the right end of the address bar.', 'Click it, then <b>Install</b>.', 'It opens in its own window, like any other app.'];

    const wrap = document.createElement('div');
    wrap.id = 'nyla-install-help';
    style(wrap, { position: 'fixed', inset: '0', zIndex: 2147483001, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' });
    wrap.onclick = (e) => { if (e.target === wrap) wrap.remove(); };
    const card = document.createElement('div');
    style(card, { background: APP.surface, color: APP.text, borderRadius: '18px', padding: '22px', maxWidth: '380px', width: '100%', font: "14px/1.5 'DM Sans', system-ui, sans-serif", boxShadow: '0 24px 60px rgba(0,0,0,.3)' });
    card.innerHTML = `<div style="font-family:'DM Serif Display',Georgia,serif;font-size:22px;margin-bottom:10px">Add ${APP.name} to your ${isIOS() ? 'Home Screen' : 'apps'}</div>`
      + `<ol style="margin:0 0 16px 18px;padding:0;color:${APP.muted}">${steps.map(s => `<li style="margin-bottom:8px">${s}</li>`).join('')}</ol>`;
    const done = document.createElement('button');
    done.textContent = isIOS() || isMacSafari() ? 'I added it' : 'Got it';
    style(done, { border: 'none', borderRadius: '10px', padding: '10px 14px', background: APP.accent, color: '#fff', fontWeight: '600', cursor: 'pointer', width: '100%', font: "14px 'DM Sans', system-ui, sans-serif" });
    done.onclick = () => { save({ installed: Date.now() }); wrap.remove(); removeChip(); };
    card.appendChild(done);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
  };

  const keyframes = document.createElement('style');
  keyframes.textContent = '@keyframes nylaInstallIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(keyframes);
  // A moment after the app settles, so it never competes with first paint.
  setTimeout(maybeShowChip, 2500);
})();
