/* sw.js — Vector Hoops PWA for 10M DAU
 * Cache-first for immutable assets, network-first for pages
 * Solo personal project, no connection to employer
 */
const CACHE_NAME = 'vector-hoops-v5-20260715';
const IMMUTABLE = [
  '/manifest.json',
  '/assets/vectors_lite.json',
  '/assets/teams.json',
  '/assets/players_lite.json',
  '/assets/og-embed.png',
  '/assets/city-intro.css',
  '/assets/shell.css',
  '/assets/hoops.css',
  '/assets/responsive.css',
  '/assets/embedding-nebula.js',
  '/assets/city-intro.js',
  '/assets/hero-perf.js',
  '/assets/landing-play.js',
  '/assets/landing-equation.js',
  '/assets/search-enhance.js',
  '/assets/viral-share.js',
  '/assets/team-leaderboard.js',
  '/assets/push-retention.js',
  '/assets/pwa-install.js',
  '/assets/keyboard-a11y.js',
  '/assets/seo-dynamic.js'
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

self.addEventListener('push', function(event){
  var data = {};
  try{ data = event.data ? event.data.json() : {}; }catch(e){ data = {title:'Vector Hoops', body:'Daily puzzle live — keep your streak 🔥'}; }
  var title = data.title || 'Vector Hoops — puzzle live';
  var body = data.body || 'Daily Chimera reset midnight CT. Your streak at risk 🔥';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/assets/og-embed.png',
      badge: '/assets/og-embed.png',
      tag: 'vector-hoops-daily',
      renotify: false,
      data: {url: '/play?utm_source=push&utm_medium=retention'}
    })
  );
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/play?utm_source=push_click';
  event.waitUntil(clients.matchAll({type:'window'}).then(function(wins){
    for(var i=0;i<wins.length;i++){
      var w = wins[i];
      if(w.url.indexOf(url.split('?')[0])!==-1 || w.url.indexOf('hoops.dumbmodel.com')!==-1){
        return w.focus().then(function(){ return w.navigate ? w.navigate(url) : (w.location = url); });
      }
    }
    return clients.openWindow(url);
  }));
});
