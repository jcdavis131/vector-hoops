/* Shell-only, no JSON cached — v7.3

   v7.1 never installed. Its SHELL was ['/','/index.html','/offline.html',
   '/manifest.json'] and cache.addAll() is atomic: one bad entry rejects the
   whole promise, install fails, and the seven pages that register this worker
   get no service worker at all. Measured against the live site:

     /               200
     /index.html     308   (cleanUrls redirects .html to the clean path)
     /offline.html   308
     /manifest.json  404   (it was missing from public/, which is what deploys)

   Three of four failed. So offline support and PWA install have never worked.

   Two fixes. The paths are the ones the site actually serves — no .html, so
   nothing redirects. And each entry is added individually with its own catch,
   so a single missing file degrades the shell instead of destroying the
   worker. Cache name bumped, which makes activate purge the v7.1 cache.

   v7.3: two asset files changed and stamp_assets.py re-hashed the ?v= tokens on
   21 pages. Nothing here caches JS — the shell is three entries and fetch is
   network-first — but '/' IS in the shell, and a cached '/' would keep pointing
   at the previous tokens. Bumping C makes activate purge it. */
const C = 'hoops-v7-3';
const SHELL = ['/', '/offline', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(C).then(c =>
      Promise.all(SHELL.map(u =>
        c.add(u).catch(err => console.warn('sw: skipped', u, err && err.message))
      ))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
  );
});

/* Network first, cache only as the offline fallback. JSON and /api/ are left
   alone so a stale model asset can never be served from cache. Cross-origin
   requests are skipped too: on a flaky network the old handler could answer a
   font or script request with the offline HTML page. */
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin) return;
  if (u.pathname.includes('/api/') || u.pathname.endsWith('.json')) return;
  e.respondWith(
    fetch(e.request).catch(() =>
      caches.match(e.request).then(r => r || caches.match('/offline') || caches.match('/'))
    )
  );
});
