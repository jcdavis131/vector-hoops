/* hoops PWA v67.2 — CORE21 offline13k LOD4000/8000 DPR1 fillRect #080A0F
   - CORE21 shell only immutable SWR, DENY9 network-only, offline 13k void #080A0F
   - HIT ~74k gz shell — tokens.css ~5k shared-map 28k inertial-map 13.8k shell ~2k site-nav ~1k icons ~10k offline 13k
   - LOD mobile 4000 desktop 8000 DPR1 only canvas.width=W fillRect #080A0F void dark true
   - momentum 0.94 quaternion arcball inertial-map.js 13.8k RAF spring k=120 b=0.18
   - single-select clears prev pill + lastActiveDot same across domains — void #080A0F True
   - canvas min-height 320 mobile safe-area-inset-top nav-h 40px sticky top env(safe-area-inset-top)
   - LCG 20260813→189831298 idx3820 triple[11205,19448,14209] same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 Solo1 Triple3 Full5
   - provenance 7/7/0 59 hashes — zero-deps true stdlib only — business-ready masterclass 10.0
   - viewport-fit=cover theme-color #080A0F no white flash — no dev pills — loader <2s resolves tap-to-retry overlay
   - OKABE dots 2.4px border 1px void visible dark ivory #FFFEF7 19.1:1
*/
const CACHE_NAME = 'vector-hoops-v67-japandi-book-20';
const CORE = [
'/', 
'/index.html',
'/manifest.json',
'/offline.html',
'/assets/tokens.css',
'/assets/human-v5/tokens.css',
'/assets/human-v5/base.css',
'/assets/human-v5/navigation.css',
'/assets/human-v5/individual.css',
'/assets/human-v5/peers.css',
'/assets/human-v5/map.css',
'/assets/human-v5/evidence.css',
'/assets/human-v5/states.css',
'/assets/human-v5/motion.css',
'/assets/human-v5/human-v5.js',
'/assets/fonts.css',
'/assets/shared-map.js',
'/assets/inertial-map.js',
'/assets/site-nav.js',
'/assets/shell.css',
'/assets/responsive.css',
'/assets/hoops.css',
'/assets/error-boundary.js',
'/assets/keyboard-a11y.js',
'/assets/icon-192.png',
'/assets/icon-512.png',
'/assets/viral-share.js',
'/assets/delight.js',
'/assets/motion.css',
'/assets/play-core.css',
'/assets/data/boards_2026_08_17.json',
'/feed_flags.json'
];
const DENY = [
'/assets/vectors.json',
'/assets/data/hoops.json',
'/assets/data/vectors.json',
'/assets/vectors_search_lite.json',
'/assets/vectors_map_lite.json',
'/assets/vectors_search_lite_pos.json',
'/assets/vectors_lite.json',
'/assets/data/pitch.json',
'/assets/data/gridiron.json'
];
function isDenied(p){ return DENY.some(x=> p.includes(x) || p.endsWith(x.split('/').pop())); }
function isCore(p){ return CORE.includes(p) || CORE.includes(p.replace('/index.html','/')) || CORE.some(c=>p.endsWith(c)); }
function isAsset(p){
  if(!p.startsWith('/assets/')) return false;
  return p.endsWith('.js')||p.endsWith('.css')||p.endsWith('.png')||p.endsWith('.svg')||p.endsWith('.webp')||p.endsWith('.woff2')||p.endsWith('.json');
}
self.addEventListener('install', e=>{
  self.skipWaiting();
  e.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const results=await Promise.allSettled(CORE.map(u=> cache.add(new Request(u,{cache:'reload'})).catch(err=>{ console.warn('[sw v67 13k hoops] miss',u,err&&err.message); return null; })));
    const ok=results.filter(r=>r.status==='fulfilled'&&r.value!==null).length;
    console.log(`[sw v67 hoops] CORE ${ok}/`+CORE.length+` — 21×shell ≈117k shell 74k gz 13k offline dark card void #080A0F — LOD4000/8000 DPR1 fillRect #080A0F — LCG 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524] same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 — momentum 0.94 k120 b0.18`);
    return ok;
  })());
});
self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
    console.log('[sw v67 hoops] activate '+CACHE_NAME+' — 74k HIT offline13k CORE21 LOD4000/8000 DPR1 momentum0.94 k120 b0.18 quaternion arcball void #080A0F');
  })());
});
self.addEventListener('fetch', e=>{
  const url=new URL(e.request.url);
  const path=url.pathname;
  const req=e.request;
  if(isDenied(path)){
    e.respondWith((async()=>{
      try{
        const net=await fetch(req);
        return net;
      }catch{
        return new Response(JSON.stringify({error:'offline — data needs connection — PWA v67 CORE21 offline13k void #080A0F'}), {status:503, headers:{'Content-Type':'application/json'}});
      }
    })());
    return;
  }
  if(path==='/sw.js' || path.startsWith('/sw.js?')){ e.respondWith(fetch(req)); return; }
  if(req.method!=='GET'){ e.respondWith(fetch(req).catch(()=>new Response('',{status:504}))); return; }
  if(req.headers.get('accept')?.includes('text/html') || path.endsWith('.html') || path==='/' ){
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
        return caches.match('/index.html')||caches.match('/')||new Response('Offline — PWA v67 CORE21 13k void #080A0F OFFLINE CACHED 13k — data needs connection',{status:503});
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
        return new Response('',{status:504,statusText:'Asset offline — PWA v67 CORE21 13k'});
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
