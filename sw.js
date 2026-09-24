/* ── Nyla OS service worker ────────────────────────────────────────
   What makes it installable, and what keeps it working with no signal.
   The app itself is network-first: online you always get the newest
   version, offline you get the last one that loaded. The libraries and
   fonts it pulls from other sites are served from cache and refreshed
   in the background. Firebase sync calls are never cached.

   Bump VERSION when you change the app, so old caches are cleared.
──────────────────────────────────────────────────────────────── */
const VERSION = 'nyla-os-2026-09-23-1';
const APP_SHELL = [
  './nyla-os.html', './agent-uploads.js', './manifest.webmanifest', './pwa.js',
  './js/energy.jsx', './js/brief.jsx', './js/memories.jsx', './js/agent-edit.jsx', './js/capture.jsx',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'unpkg.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'www.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then(cache => Promise.all(
    APP_SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => {}))
  )).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { event.respondWith(networkFirst(req)); return; }
  if (CDN_HOSTS.includes(url.hostname)) event.respondWith(staleWhileRevalidate(req));
  // Everything else (Firestore, Auth): straight to the network.
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetchWithTimeout(req, 6000);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./nyla-os.html');
      if (shell) return shell;
    }
    return new Response('You’re offline and this page hasn’t been saved yet.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req);
  const refresh = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
  return cached || (await refresh) || new Response('', { status: 504 });
}
function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(r => { clearTimeout(timer); resolve(r); }, e => { clearTimeout(timer); reject(e); });
  });
}
