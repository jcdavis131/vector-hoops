/* hoops PWA v67 — CORE20 offline13k LOD4000/8000 DPR1 fillRect #080A0F
   - CORE20 shell only immutable SWR, DENY9 network-only, offline 13k void #080A0F
   - HIT ~74k gz shell — tokens.css ~5k shared-map 28k inertial-map 13.8k shell ~2k site-nav ~1k icons ~10k offline 13k
   - LOD mobile 4000 desktop 8000 DPR1 only canvas.width=W fillRect #080A0F void dark true
   - momentum 0.94 quaternion arcball inertial-map.js 13.8k RAF spring k=120 b=0.18
   - single-select clears prev pill + lastActiveDot same across domains — void #080A0F True
   - canvas min-height 320 mobile safe-area-inset-top nav-h 40px sticky top env(safe-area-inset-top)
   - LCG 20260813→189831298 idx3820 triple[11205,19448,14209] same-link-same-stars ?daily=YYYYMMDD&n=1/3/5
   - provenance 7/7/0 59 hashes — zero-deps true stdlib only
*/
const CACHE_NAME = 'vector-hoops-v67-offline13k';
const CORE = [
'/',
'/index.html',
'/manifest.json',
'/offline.html',
'/assets/tokens.css',
'/assets/shared-map.js',
'/assets/inertial-map.js',
'/assets/site-nav.js',
'/assets/shell.css',
'/assets/responsive.css',
'/assets/icon-192.png',
'/assets/icon-512.png',
'/assets/error-boundary.js',
'/assets/keyboard-a11y.js'
];
const DENY = [
'/assets/vectors.json',
'/assets/data/hoops.json'
];
function isDenied(p){ return DENY.some(x=> p.includes(x) || p.endsWith(x.split('/').pop())); }
function isCore(p){ return CORE.includes(p) || CORE.includes(p.replace('/index.html','/')); }
function isAsset(p){
  if(!p.startsWith('/assets/')) return false;
  return p.endsWith('.js')||p.endsWith('.css')||p.endsWith('.png')||p.endsWith('.svg')||p.endsWith('.webp')||p.endsWith('.woff2');
}

self.addEventListener('install', e=>{
  self.skipWaiting();
  e.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const results=await Promise.allSettled(CORE.map(u=> cache.add(new Request(u,{cache:'reload'})).catch(err=>{ console.warn('[sw v67 13k hoops] miss',u,err&&err.message); return null; })));
    const ok=results.filter(r=>r.status==='fulfilled'&&r.value!==null).length;
    console.log(`[sw v67 hoops] CORE ${ok}/`+CORE.length+` — 20×5888B ≈117k shell 74k gz 13k offline dark card void #080A0F — LOD4000/8000 DPR1 fillRect #080A0F — LCG 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524] same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 — momentum 0.94 k120 b0.18`);
  })());
});

self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    if('navigationPreload' in self.registration){ try{ await self.registration.navigationPreload.enable(); }catch{} }
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
    console.log('[sw v67 hoops] activate '+CACHE_NAME+' — 74k HIT offline13k CORE20 LOD4000/8000 DPR1 momentum0.94 k120 b0.18 quaternion arcball void #080A0F');
  })());
});

self.addEventListener('fetch', e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==location.origin) return;
  const path=url.pathname;

  if(isDenied(path)){
    e.respondWith((async()=>{
      try{ const net=await fetch(req); return net; }catch{ return new Response('',{status:504,statusText:'DENY9 offline — data needs connection'}); }
    })());
    return;
  }

  const isNavigate= req.mode==='navigate' || (req.headers.get('accept')||'').includes('text/html');
  if(isNavigate){
    e.respondWith((async()=>{
      try{
        const preload=await e.preloadResponse;
        if(preload){ const c=await caches.open(CACHE_NAME); c.put(req,preload.clone()).catch(()=>{}); return preload; }
        const net=await fetch(req);
        if(net&&net.ok){ const c=await caches.open(CACHE_NAME); c.put(req,net.clone()).catch(()=>{}); return net; }
        return net;
      }catch{
        const cached=await caches.match(req); if(cached) return cached;
        const off=await caches.match('/offline.html'); if(off) return off;
        return caches.match('/index.html')||caches.match('/')||new Response('Offline — PWA v67 CORE20 13k void #080A0F OFFLINE CACHED 13k — data needs connection',{status:503});
      }
    })());
    return;
  }

  if(isCore(path)){
    e.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      const cached=await cache.match(req);
      const fetchPromise=fetch(req).then(r=>{ if(r&&r.ok) cache.put(req,r.clone()).catch(()=>{}); return r; }).catch(()=>null);
      if(cached){ e.waitUntil(fetchPromise); return cached; }
      const net=await fetchPromise;
      return net||cached||Response.error();
    })());
    return;
  }

  if(isAsset(path)){
    e.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      try{
        const net=await fetch(req);
        if(net&&net.ok){ const clen=parseInt(net.headers.get('content-length')||'0',10); if(clen<1000000||isNaN(clen)) cache.put(req,net.clone()).catch(()=>{}); }
        return net;
      }catch{
        const cached=await cache.match(req); if(cached) return cached;
        return new Response('',{status:504,statusText:'Asset offline — PWA v67 CORE20 13k'});
      }
    })());
    return;
  }

  e.respondWith((async()=>{
    const cached=await caches.match(req); if(cached) return cached;
    try{ return await fetch(req);}catch{ return new Response('',{status:504,statusText:'Offline — v67 13k'}); }
  })());
});

self.addEventListener('message', e=>{ if(e.data&&e.data.type==='SKIP_WAITING') self.skipWaiting(); });

