/* CORE13 shell-only no JSON cached — v7.1 */
const C='hoops-v7-1'; const SHELL=['/','/index.html','/offline.html','/manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))) )});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url); if(u.pathname.includes('/api/')||u.pathname.endsWith('.json'))return; e.respondWith(fetch(e.request).catch(()=>caches.match(e.request).then(r=>r||caches.match('/offline.html'))))});
