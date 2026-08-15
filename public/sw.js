/* hoops sw v7-19 — PWA v67 — Lighthouse PWA 100: skipWaiting, clients.claim, navigate network-first offline fallback, CORE immutable SWR, DENY vectors heavy, no fake weights — must include everyday.html + oracle.html + cap-tetris.html */
const C = 'hoops-v7-19';
const SHELL = ['/', '/index.html', '/report-card', '/report-card.html', '/everyday', '/everyday.html', '/oracle', '/oracle.html', '/doppelganger', '/doppelganger.html', '/cap-tetris', '/cap-tetris.html', '/offline', '/offline.html', '/manifest.json'];
const FALLBACK = ['/offline', '/offline.html', '/'];
const DENY_RE = /\.(json|f32|bin|wasm|onnx)$|(^|\/)assets\/(vectors|data)\//;
const API_RE = /\/api\//;

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(C).then(c =>
      Promise.allSettled(SHELL.map(u =>
        c.add(new Request(u, { cache: 'reload' })).catch(err => console.warn('[hoops sw] skip', u, err && err.message))
      ))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    (async () => {
      if('navigationPreload' in self.registration){
        try{ await self.registration.navigationPreload.enable(); }catch(_){}
      }
      const keys = await caches.keys();
      await Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method!=='GET') return;
  const url = new URL(req.url);
  if(url.origin!==self.location.origin) return;
  if(API_RE.test(url.pathname) || DENY_RE.test(url.pathname)) return; // network only, browser HTTP cache still applies

  // navigate: network-first fallback to offline.html
  if(req.mode==='navigate' || (req.headers.get('accept')||'').includes('text/html')){
    e.respondWith((async()=>{
      try{
        const preload = await e.preloadResponse;
        if(preload) return preload;
        const fresh = await fetch(req);
        // cache only shell basics, not heavy
        if(fresh && fresh.ok && fresh.status===200 && fresh.type==='basic' && !fresh.redirected){
          const copy=fresh.clone();
          caches.open(C).then(c=>c.put(req,copy)).catch(()=>{});
        }
        return fresh;
      }catch(_){
        const cache=await caches.open(C);
        const hit=await cache.match(req);
        if(hit) return hit;
        for(const p of FALLBACK){
          const f=await cache.match(p) || await caches.match(p);
          if(f) return f;
        }
        // final offline fallback
        const off = await cache.match('/offline.html');
        if(off) return off;
        throw _;
      }
    })());
    return;
  }

  // CORE immutable SWR — instant cache + background update
  const isCore = SHELL.includes(url.pathname) || SHELL.includes(url.pathname.replace(/\.html$/,''));
  if(isCore){
    e.respondWith((async()=>{
      const cache=await caches.open(C);
      const cached=await cache.match(req);
      const fetchP=fetch(req).then(r=>{
        if(r && r.ok) cache.put(req,r.clone());
        return r;
      }).catch(()=>null);
      return cached || await fetchP || new Response('',{status:504});
    })());
    return;
  }

  // other assets: network-first, cache fallback (preserves visited pages)
  e.respondWith((async()=>{
    try{
      const res=await fetch(req);
      if(res && res.status===200 && res.type==='basic' && !res.redirected){
        const copy=res.clone();
        caches.open(C).then(c=>c.put(req,copy)).catch(()=>{});
      }
      return res;
    }catch(_){
      const hit=await caches.match(req);
      if(hit) return hit;
      return new Response('',{status:504,statusText:'Offline asset'});
    }
  })());
});

self.addEventListener('message', e=>{
  if(e.data==='SKIP_WAITING' || (e.data && e.data.type==='SKIP_WAITING')) self.skipWaiting();
});
