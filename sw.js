/* sw.js — Vector Hoops PWA for 10M DAU
 * Cache-first for immutable assets, network-first for pages
 * Solo personal project, no connection to employer
 */
const CACHE_NAME = 'vector-hoops-v2-20260715';
const IMMUTABLE = [
  '/manifest.json',
  '/assets/vectors_lite.json',
  '/assets/teams.json',
  '/assets/players_lite.json',
  '/assets/og-embed.png',
  '/assets/city-intro.css',
  '/assets/shell.css',
  '/assets/responsive.css',
  '/assets/embedding-nebula.js',
  '/assets/city-intro.js',
  '/assets/landing-play.js',
  '/assets/viral-share.js'
];

self.addEventListener('install', (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=> cache.addAll(IMMUTABLE.map(u=> new Request(u, {cache:'reload'}))).catch(()=>{})).then(()=> self.skipWaiting())
  );
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys().then(keys=> Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=> caches.delete(k)))).then(()=> self.clients.claim())
  );
});

function isAssetRequest(url){
  return url.pathname.startsWith('/assets/') && (url.pathname.endsWith('.json') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.png') || url.pathname.endsWith('.webp'));
}

self.addEventListener('fetch', (event)=>{
  const url = new URL(event.request.url);
  if(url.origin !== location.origin) return;
  // Don't cache POST or chrome-extension
  if(event.request.method !== 'GET') return;
  if(isAssetRequest(url)){
    // cache-first
    event.respondWith(
      caches.match(event.request).then(cached=>{
        if(cached) return cached;
        return fetch(event.request).then(resp=>{
          if(resp && resp.ok){
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c=> c.put(event.request, clone));
          }
          return resp;
        });
      })
    );
  } else if(url.pathname === '/' || url.pathname === '/play' || url.pathname === '/play.html' || url.pathname.endsWith('.html')){
    // network-first for HTML
    event.respondWith(
      fetch(event.request).then(resp=>{
        if(resp && resp.ok){
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c=> c.put(event.request, clone));
        }
        return resp;
      }).catch(()=> caches.match(event.request).then(c=> c || caches.match('/')))
    );
  }
});
