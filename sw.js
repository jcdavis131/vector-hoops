/* hoops sw v9.2 — PWA v67.2 pro business-ready — void #080A0F — offline13k CORE20 — 40px sticky nav z40 — LOD 8000/4000 DPR1 fillRect quaternion arcball momentum0.94 — single-select clear prev ivory #FFFEF7 — provenance 7/7/0 59 hashes LCG 20260813→189831298 idx3820 triple[11205,19448,14209] same-link-same-stars */
const C = 'hoops-v9-2-pro-67-2';
const SHELL = [
  '/', '/index.html',
  '/lab.html', '/model.html', '/players.html', '/play.html', '/dfs.html', '/owner.html',
  '/manifest.json',
  '/assets/tokens.css','/assets/fonts.css','/assets/inertial-map.js','/assets/shared-map.js',
  '/assets/data/hoops.json',
  '/offline.html',
  '/report-card.html','/everyday.html','/oracle.html','/doppelganger.html','/cap-tetris.html','/trade-machine.html',
  '/report-card-paper.html','/report-card-terminal.html','/everyday-paper.html','/everyday-terminal.html','/oracle-paper.html','/oracle-terminal.html','/doppelganger-paper.html','/doppelganger-terminal.html','/cap-tetris-paper.html','/cap-tetris-terminal.html','/trade-machine-paper.html','/trade-machine-terminal.html',
  '/report-card-japandi.html','/everyday-japandi.html','/oracle-japandi.html','/doppelganger-japandi.html','/cap-tetris-japandi.html','/trade-machine-japandi.html'
];
const FALLBACK = ['/offline.html','/index.html','/'];
const DENY_RE = /\.(f32|bin|wasm|onnx|npz|pt)$|(^|\/)assets\/(vectors|mtnn_embeddings|data\/.*\.(json))/; // DENY vectors heavy — network only, browser cache still applies — CORE20 20×5888B deny9 pattern
const CORE_RE = /core|offline13k/i;
const API_RE = /\/api\//;

// CORE20 offline13k — 20×5888B packs — same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 Solo1 Triple3 Full5
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(C).then(c =>
      Promise.allSettled(SHELL.map(u =>
        c.add(new Request(u, { cache: 'reload' })).catch(err => console.warn('[hoops v9.2 sw] skip', u, err && err.message))
      ))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil((async()=>{
    if('navigationPreload' in self.registration){ try{ await self.registration.navigationPreload.enable(); }catch(_){} }
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req=e.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;
  if(API_RE.test(url.pathname) || DENY_RE.test(url.pathname)) return; // network only, no sw intercept for heavy vectors — preserves offline13k lightness

  if(req.mode==='navigate' || (req.headers.get('accept')||'').includes('text/html')){
    e.respondWith((async()=>{
      try{
        const preload=await e.preloadResponse;
        if(preload) return preload;
        const fresh=await fetch(req);
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
          const f=await cache.match(p)||await caches.match(p);
          if(f) return f;
        }
        const off=await cache.match('/offline.html');
        if(off) return off;
        throw _;
      }
    })());
    return;
  }

  const isCore=SHELL.includes(url.pathname) || SHELL.includes(url.pathname.replace(/\.html$/,''));
  if(isCore || CORE_RE.test(url.pathname)){
    e.respondWith((async()=>{
      const cache=await caches.open(C);
      const cached=await cache.match(req);
      const fetchP=fetch(req).then(r=>{ if(r && r.ok) cache.put(req,r.clone()); return r; }).catch(()=>null);
      return cached || await fetchP || new Response('',{status:504});
    })());
    return;
  }

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

// LCG 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524] same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 Solo1 Triple3 Full5 glibc L(s)=(s*1103515245+12345)&0x7fffffff DAU3/WAU3 TLPG dedup everydayTip humanized badge — zero-deps true stdlib only — PWA v67 offline13k CORE20 LOD 8000/4000 DPR1 quaternion arcball momentum0.94 single-select ivory #FFFEF7 — provenance 7/7/0 59 hashes
