/* vector-hoops PWA v17-20260720 — zoomout pinch + seasonCloud + grey history trail
   #1: start zoomed out 11.2 + 38, wheel+pinch zoom (3.2-16 and 12-68), dblclick zoom
   #2: drift v7: seasonCloud peers, grey past trail, future faint, ghost full, career stage, richer meta
   v15: pause on type, v16: cache embed */

const CACHE_NAME = 'vector-hoops-v18-20260720-quad';
const CORE = [
  '/',
  '/play',
  '/players',
  '/trends',
  '/model',
  '/methods',
  '/manifest.json',
  '/offline.html',
  '/assets/og-embed.png',
  '/assets/og-1200x630.png',
  '/assets/shell.css',
  '/assets/responsive.css',
  '/assets/final-qa.css',
  '/assets/unified.css',
  '/assets/error-boundary.js',
  '/assets/keyboard-a11y.js',
  '/assets/pwa-install.js',
  '/assets/site-nav.js',
  '/assets/mtnn.js',
  '/assets/viral-share.js',
  '/assets/past-modern-game.js',
  '/assets/vectors_search_lite.json',
  '/assets/vectors_search_lite_pos.json',
  '/assets/archetypes_time.json',
  '/assets/players_lite.json',
  '/assets/teams.json',
  '/assets/season_norms.json',
  '/assets/honors.json',
  '/assets/pedigree.json',
  '/assets/skills.json',
  '/assets/skills_wide.json',
  '/assets/lemmino/star-map-void.js',
  '/assets/lemmino/drift-void.js',
  '/assets/workers/modern-search.worker.js'
];
const DENY_CACHE = [
  '/assets/playoff_paths.json',
  '/assets/next_profile_eval.json',
  '/assets/mtnn.onnx',
  '/assets/mtnn.onnx.data',
  '/assets/mtnn_heads.f32',
  '/assets/mtnn_embeddings.f32',
  '/assets/vectors.json'
];
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
function isDenied(p){ return DENY_CACHE.some(x=> p.includes(x)); }
self.addEventListener('install', e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(cache=>{
    return cache.addAll(CORE.map(u=> new Request(u,{cache:'reload'}))).catch(()=>Promise.allSettled(CORE.map(u=> cache.add(new Request(u,{cache:'reload'})))));
  }).then(async ()=>{
    // also pre-cache Three.js CDN for offline/embed cache perf
    try{
      const c=await caches.open(CACHE_NAME);
      await c.add(new Request('https://unpkg.com/three@0.160.0/build/three.module.js',{mode:'no-cors'})).catch(()=>{});
    }catch{}
  }));
});
self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    if('navigationPreload' in self.registration){ try{ await self.registration.navigationPreload.enable(); }catch{} }
    const keys=await caches.keys(); await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))); await self.clients.claim();
  })());
});
function isImmutable(u){ return CORE.includes(u.pathname) || FULL_MTNN.includes(u.pathname); }
function isAsset(u){ return u.pathname.startsWith('/assets/') && (u.pathname.endsWith('.js')||u.pathname.endsWith('.css')||u.pathname.endsWith('.json')||u.pathname.endsWith('.png')||u.pathname.endsWith('.webp')||u.pathname.endsWith('.svg')||u.pathname.endsWith('.f32')); }
function isThreeCDN(url){ return url.hostname==='unpkg.com' && url.pathname.includes('three'); }
self.addEventListener('fetch', e=>{
  const req=e.request; if(req.method!=='GET') return; const url=new URL(req.url);
  // cache Three.js CDN externally
  if(isThreeCDN(url)){
    e.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      const cached=await cache.match(req);
      if(cached) return cached;
      try{
        const net=await fetch(req);
        if(net&&net.ok) cache.put(req, net.clone()).catch(()=>{});
        return net;
      }catch{
        return cached||Response.error();
      }
    })());
    return;
  }
  if(url.origin!==location.origin){
    return;
  }
  if(isDenied(url.pathname)){ e.respondWith(fetch(req).catch(()=> new Response('',{status:504}))); return; }
  if(req.mode==='navigate' || (req.headers.get('accept')||'').includes('text/html')){
    e.respondWith((async()=>{
      try{
        const preload=await e.preloadResponse; if(preload){ const c=await caches.open(CACHE_NAME); c.put(req,preload.clone()).catch(()=>{}); return preload; }
        const net=await fetch(req); if(net&&net.ok){ const c=await caches.open(CACHE_NAME); c.put(req,net.clone()).catch(()=>{}); } return net;
      }catch{
        const cached=await caches.match(req); if(cached) return cached;
        const off=await caches.match('/offline.html'); if(off) return off; return caches.match('/')||new Response('Offline',{status:503});
      }
    })()); return;
  }
  if(isImmutable(url)){
    e.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME); const cached=await cache.match(req);
      const fp=fetch(req).then(r=>{ if(r&&r.ok) cache.put(req,r.clone()).catch(()=>{}); return r; }).catch(()=>null);
      if(cached){ e.waitUntil(fp); return cached; }
      const net=await fp; return net||cached||Response.error();
    })()); return;
  }
  if(isAsset(url)){
    e.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME); const cached=await cache.match(req);
      const fp=fetch(req).then(r=>{
        if(r&&r.ok){ const cl=r.headers.get('content-length'); if(!cl||parseInt(cl,10)<4000000) cache.put(req,r.clone()).catch(()=>{}); }
        return r;
      }).catch(()=>null);
      if(cached){ e.waitUntil(fp); return cached; }
      const net=await fp; return net||cached||new Response('',{status:504});
    })()); return;
  }
  e.respondWith((async()=>{ const c=await caches.match(req); if(c) return c; try{ return await fetch(req);}catch{ return c||caches.match('/offline.html'); }})());
});
self.addEventListener('push', e=>{
  let d={}; try{ d=e.data?e.data.json():{};}catch{} const t=d.title||'Vector Hoops'; const b=d.body||'Daily Past→Modern rotating 3D map live — guess twin 🔥';
  e.waitUntil(self.registration.showNotification(t,{body:b,icon:'/assets/og-embed.png',badge:'/assets/og-embed.png',tag:'vector-hoops-daily',data:{url:d.url||'/play?utm_source=push'}}));
});
self.addEventListener('notificationclick', e=>{
  e.notification.close(); const url=(e.notification.data&&e.notification.data.url)||'/play?utm_source=push_click';
  e.waitUntil((async()=>{ const wins=await clients.matchAll({type:'window',includeUncontrolled:true}); for(const w of wins){ if(w.url.includes(self.location.origin)){ await w.focus(); if('navigate' in w) try{ await w.navigate(url);}catch{ w.location=url;} else w.location=url; return; } } return clients.openWindow(url); })());
});
self.addEventListener('message', e=>{ if(e.data&&e.data.type==='SKIP_WAITING') self.skipWaiting(); });
