/* vector-hoops PWA v66 — PWA shell-only, CORE immutable stale-while-revalidate, large JSON_ONNX deny-cached
   - CORE only shell (~14 files), no large JSON/models/CDN
   - network-first for js/css/img assets with 1MB cache cap
   - JSON is deliberately never SW-cached (network only, browser HTTP cache still applies)
     => offline mode is shell-only; data pages need a connection
   - stale-while-revalidate for immutable CORE
*/

const CACHE_NAME = 'vector-hoops-v66-dedupe-slot-label';

const CORE = [
  '/',
  '/play',
  '/manifest.json',
  '/offline.html',
  '/assets/shell.css',
  '/assets/responsive.css',
  '/assets/final-qa.css',
  '/assets/unified.css',
  '/assets/motion.css',
  '/assets/player-profile-v28.css',
  '/assets/trading-card.css',
  '/assets/site-nav.js',
  '/assets/error-boundary.js',
  '/assets/keyboard-a11y.js',
  '/assets/pwa-install.js',
  '/assets/og-embed.png',
  '/assets/og-1200x630.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/data/hoops.json',
  '/assets/data/cap_rules.json',
  '/assets/data/front_office.json',
  '/assets/play-core.css'
];

const DENY_CACHE = [
  '/assets/vectors.json',
  '/assets/mtnn.onnx',
  '/assets/mtnn.onnx.data',
  '/assets/mtnn_heads.f32',
  '/assets/mtnn_embeddings.f32',
  '/assets/playoff_paths.json'
];

// kept for reference / isImmutable checks history, NOT precached in v51-light
const FULL_MTNN = [
  '/assets/mtnn_embeddings.f32',
  '/assets/mtnn_heads.f32',
  '/assets/mtnn_arch.json',
  '/assets/mtnn_meta.json',
  '/assets/mtnn_map.json',
  '/assets/mtnn-full.js',
  '/assets/mtnn-worker.js',
  '/assets/mtnn-onnx.js',
  '/assets/vectors_lite.json',
  '/assets/archetype_lite.json',
  '/assets/vectors.json',
  '/assets/skills.json',
  '/assets/archetype_assignments.json',
  '/assets/playoffs.json',
  '/assets/pedigree.json'
];

function isDenied(p) {
  return DENY_CACHE.some(x => p.includes(x));
}

function isImmutable(url) {
  // v66-light: only CORE is immutable (stale-while-revalidate)
  // url is URL object
  return CORE.includes(url.pathname);
}

function isAsset(url) {
  const p = url.pathname;
  if (!p.startsWith('/assets/')) return false;
  return (
    p.endsWith('.js') ||
    p.endsWith('.css') ||
    p.endsWith('.png') ||
    p.endsWith('.svg') ||
    p.endsWith('.webp')
  );
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Use allSettled to avoid failing whole install if one CORE asset 404s
    // cache:reload ensures fresh shell on install
    const results = await Promise.allSettled(
      CORE.map((u) => cache.add(new Request(u, { cache: 'reload' })))
    );
    // Optional logging for debugging (non-blocking)
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length) {
      console.warn('[sw v51-light] CORE precache partial failures:', failed.length);
    }
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    if ('navigationPreload' in self.registration) {
      try {
        await self.registration.navigationPreload.enable();
      } catch {}
    }
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== location.origin) return;

  // 1. Denied large assets -> network only, never cache
  if (isDenied(url.pathname)) {
    e.respondWith(
      fetch(req).catch(() => new Response('', { status: 504, statusText: 'Denied asset offline' }))
    );
    return;
  }

  // 2. Navigate -> network first, fallback to cache / offline.html
  const isNavigate = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isNavigate) {
    e.respondWith((async () => {
      try {
        const preload = await e.preloadResponse;
        if (preload) {
          const c = await caches.open(CACHE_NAME);
          c.put(req, preload.clone()).catch(() => {});
          return preload;
        }
        const net = await fetch(req);
        if (net && net.ok) {
          const c = await caches.open(CACHE_NAME);
          c.put(req, net.clone()).catch(() => {});
        }
        return net;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        const off = await caches.match('/offline.html');
        if (off) return off;
        return caches.match('/') || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // 3. Immutable CORE -> stale-while-revalidate (instant cache, update bg)
  if (isImmutable(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req)
        .then((r) => {
          if (r && r.ok) cache.put(req, r.clone()).catch(() => {});
          return r;
        })
        .catch(() => null);
      if (cached) {
        e.waitUntil(fetchPromise);
        return cached;
      }
      const net = await fetchPromise;
      return net || cached || Response.error();
    })());
    return;
  }

  // 4. Asset (js/css/png/svg/webp) -> network-first, cache only if <1MB
  if (isAsset(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const net = await fetch(req);
        if (net && net.ok) {
          // cache only when size is unknown or <1MB
          const size = parseInt(net.headers.get('content-length') || '0', 10);
          if (size < 1_000_000) cache.put(req, net.clone()).catch(() => {});
        }
        return net;
      } catch {
        const cached = await cache.match(req);
        if (cached) return cached;
        return new Response('', { status: 504, statusText: 'Asset offline' });
      }
    })());
    return;
  }

  // 5. Everything else (e.g. /assets/*.json not in CORE) -> try cache then network
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch {
      // non-navigate request: fail with a real error status, never offline.html
      // (callers expect JSON/binary; an HTML 200 would poison r.ok/r.json())
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});

// Push notification handlers — kept from v49
self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {}
  const title = d.title || 'Vector Hoops';
  const body = d.body || 'Daily Past→Modern rotating 3D map live — guess twin 🔥';
  e.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png',
      tag: 'vector-hoops-daily',
      data: { url: d.url || '/play?utm_source=push' }
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  let url = (e.notification.data && e.notification.data.url) || '/play?utm_source=push_click';
  // only allow same-origin paths — never open an arbitrary URL from a push payload
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) url = '/play?utm_source=push_click';
  e.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.includes(self.location.origin)) {
        await w.focus();
        if ('navigate' in w) {
          try {
            await w.navigate(url);
          } catch {
            w.location = url;
          }
        } else {
          w.location = url;
        }
        return;
      }
    }
    return clients.openWindow(url);
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
