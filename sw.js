/* Network-first, with the pages you have visited kept for when the link dies — v7.13

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
   at the previous tokens. Bumping C makes activate purge it.

   v7.4: /play.html prints "offline capable" on the Daily Q card, so the plug was
   pulled — with the server stopped rather than with CDP network emulation, which
   is per-target and leaves the worker's own fetch() online. What a visitor got:

     title    'Vector Hoops — Offline'
     question NO #q

   The shell was three entries and /play was not one of them, so the one page
   that advertised offline play served the offline notice instead.

   Listing more paths in SHELL would not fix it honestly: every page loads four
   ?v=-stamped scripts and a stamped stylesheet, and stamp_assets.py re-hashes
   those on any asset change, so a hardcoded list rots at the next deploy. So the
   fill happens at runtime instead: a same-origin GET that comes back 200 is
   copied into the cache under its exact stamped URL. New tokens miss and go to
   the network, which is what they are for, and activate purges the lot on a
   version bump.

   Documents and code, not data. .json keeps its exemption — a stale model asset
   must never be served — and .f32/.bin join it: those are immutable and large
   (mtnn_embeddings.f32 alone is 3.2 MB), and the HTTP cache already holds them
   for a year, so there is nothing to gain by holding a second copy here.

   v7.5: 188 internal hrefs dropped their .html. cleanUrls 308s the old form, and
   this cache is keyed on the request URL — so a visitor who had /model cached
   still got the offline notice from a link written /model.html. The stamped
   error-boundary.js changed with them, so every page's ?v= moved. Bumping C
   purges the cache that was filled under the old URLs.

   v7.6: /player read `V.vectors` from a file whose key is `players`, so four
   reads were undefined behind `||` fallbacks and the fix moved the page to
   embedding_map_points_limited.json — a new stamped token on a shell page.

   v7.7: cam.fit stopped framing the cloud's widest reach and started framing its
   middle; assets/map-camera.js is loaded by '/', which is in the shell.

   v7.8: loadFull() now re-fits after swapping 1,764 points for 12,966. It had
   been keeping the zoom chosen for the smaller cloud, which put 22 dots off the
   canvas against 1 for the limited one. index.html *is* '/'.

   Three bumps went unrecorded here and the line above still said v7.4 while the
   constant read v7-8 — a version history that stops being written is worse than
   none, because it reads as complete.

   v7.9: keyboard-a11y.js now puts the focus ring into open shadow roots, so
   its token moved on 17 pages.

   v7.10: index.html changed — four hub cards had their headline glued to
   their label, three button treatments across four equal lanes, and a card
   stretched to 90px of empty white. '/' is in SHELL. */
const C = 'hoops-v7-13';
const SHELL = ['/', '/offline', '/manifest.json'];
const FALLBACK = ['/offline', '/'];
const DATA = /\.(json|f32|bin)$/;

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

/* Network first: the network answer always wins while there is one, so nothing
   here can serve a visitor something older than what the site is publishing.
   Cross-origin requests are skipped: on a flaky link the old handler could
   answer a font or script request with the offline HTML page. */
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin !== self.location.origin) return;
  if (u.pathname.includes('/api/') || DATA.test(u.pathname)) return;

  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      /* Only a plain 200 from this origin. A redirect cannot be put into a cache
         at all, and an opaque response has nothing readable in it. */
      if (res && res.status === 200 && res.type === 'basic' && !res.redirected) {
        const copy = res.clone();
        caches.open(C).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      /* This used to read `r || caches.match('/offline') || caches.match('/')`,
         which looks like three tiers and is two: caches.match returns a Promise
         and a Promise is always truthy, so the last tier could never be reached
         and a miss on the first resolved to undefined — respondWith(undefined)
         is the browser's network error page, not a fallback. */
      for (const p of FALLBACK) {
        const f = await caches.match(p);
        if (f) return f;
      }
      throw err;
    }
  })());
});
