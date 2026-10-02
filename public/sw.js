/* Vector Hoops service worker.
   - HTML: network first, falling back to the cached copy, then /offline.html.
   - CORE shell (styles, nav, icons, offline page): stale-while-revalidate.
   - Large data files (DENY): network only, never cached.
   Bump CACHE_NAME whenever shipped assets change so clients drop the old shell. */
const CACHE_NAME = 'vector-hoops-atlas-v9';
const CORE = [
'/',
'/index.html',
'/offline.html',
'/404.html',
'/manifest.json',
'/assets/atlas.css',
'/assets/site-nav.js',
'/assets/atlas-map.js',
'/assets/career-trails.js',
'/assets/twin-explainer.js',
'/assets/insights.js',
'/assets/insights.json',
'/assets/favicon.svg',
'/assets/apple-touch-icon.png',
'/assets/icon-192.png',
'/assets/icon-512.png',
'/assets/shell.css',
'/assets/responsive.css',
'/assets/unified.css',
'/assets/motion.css',
'/assets/error-boundary.js',
'/assets/keyboard-a11y.js',
'/assets/arc-projections.js'
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
'/assets/data/gridiron.json',
'/assets/arc_priors_2026-27.json'
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
    const results=await Promise.allSettled(CORE.map(u=> cache.add(new Request(u,{cache:'reload'})).catch(err=>{ return null; })));
    const ok=results.filter(r=>r.status==='fulfilled'&&r.value!==null).length;
    return ok;
  })());
});
self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
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
        return new Response(JSON.stringify({error:'offline: this data file needs a connection'}), {status:503, headers:{'Content-Type':'application/json'}});
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
        return caches.match('/index.html')||caches.match('/')||new Response('Offline',{status:503});
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
        return new Response('',{status:504,statusText:'Asset offline'});
      }
    })());
    return;
  }
  e.respondWith((async()=>{
    const cached=await caches.match(req); if(cached) return cached;
    try{ return await fetch(req);}catch{ return new Response('',{status:504,statusText:'Offline'}); }
  })());
});
self.addEventListener('message', e=>{ if(e.data&&e.data.type==='SKIP_WAITING') self.skipWaiting(); });
