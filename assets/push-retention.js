/* push-retention.js — streak flame + notification prompt after 2 days
 */
(function(){
  var LS_LAST_VISIT = 'vectorHoops.lastVisit';
  var LS_VISITS = 'vectorHoops.visits';
  var LS_NOTIFY_PROMPTED = 'vectorHoops.notifyPromptedAt';

  function trackVisit(){
    try{
      var now = Date.now();
      var visitsRaw = localStorage.getItem(LS_VISITS);
      var visits = visitsRaw ? JSON.parse(visitsRaw) : [];
      visits.push(now);
      // keep last 30
      if(visits.length>30) visits = visits.slice(-30);
      localStorage.setItem(LS_VISITS, JSON.stringify(visits));
      localStorage.setItem(LS_LAST_VISIT, String(now));
      return visits;
    }catch(e){ return []; }
  }

  function shouldPromptPush(){
    try{
      var visitsRaw = localStorage.getItem(LS_VISITS);
      if(!visitsRaw) return false;
      var visits = JSON.parse(visitsRaw);
      if(visits.length < 2) return false;
      var first = visits[0];
      var days = (Date.now() - first) / 86400000;
      if(days < 2) return false;
      var prompted = localStorage.getItem(LS_NOTIFY_PROMPTED);
      if(prompted && (Date.now() - parseInt(prompted,10) < 7*86400000)) return false;
      if(('Notification' in window) && Notification.permission === 'granted') return false;
      if(('Notification' in window) && Notification.permission === 'denied') return false;
      // has streak?
      var streak = 0;
      try{
        var raw = localStorage.getItem('vectorHoops.v5');
        if(raw){ var s = JSON.parse(raw); if(s && typeof s.streak==='number') streak=s.streak; }
      }catch(e){}
      return streak >=1 || visits.length>=3;
    }catch(e){ return false; }
  }

  function showPushBanner(){
    if(document.getElementById('push-retention-banner')) return;
    var banner = document.createElement('div');
    banner.id='push-retention-banner';
    banner.style.cssText='position:fixed; left:12px; right:12px; bottom:calc(88px + env(safe-area-inset-bottom)); z-index:70; background:#111; color:#fff; border:2px solid #111; border-radius:14px; box-shadow:6px 6px 0 #F0E442; padding:12px; display:flex; gap:10px; align-items:center; max-width:480px; margin-inline:auto; font-family:ui-monospace,monospace;';
    banner.innerHTML='<div style="flex:0 0 auto; width:36px; height:36px; background:#F0E442; border:2px solid #fff; border-radius:10px; display:grid; place-items:center; font-weight:900; color:#111;">🔔</div><div style="flex:1; min-width:0;"><div style="font-weight:900; font-size:13px;">Keep your 🔥 streak?</div><div style="font-size:11px; opacity:.8; line-height:1.3; margin-top:2px;">Daily at midnight CT. Get a nudge if you forget. No spam.</div></div><div style="display:flex; flex-direction:column; gap:6px;"><button id="push-allow" style="min-height:32px; padding:0 12px; background:#F0E442; color:#111; border:1.5px solid #fff; border-radius:999px; font-weight:900; font-size:11px; cursor:pointer;">Allow</button><button id="push-dismiss" style="min-height:28px; background:transparent; color:#fff; border:1px solid rgba(255,255,255,.3); border-radius:999px; font-size:10px; cursor:pointer;">Not now</button></div>';
    document.body.appendChild(banner);
    document.getElementById('push-allow').addEventListener('click', function(){
      if('Notification' in window){
        Notification.requestPermission().then(function(perm){
          if(perm==='granted'){
            // optional: register push? For now just show granted
            try{ localStorage.setItem(LS_NOTIFY_PROMPTED, String(Date.now())); }catch(e){}
            banner.innerHTML='<div style="padding:8px; text-align:center; width:100%; font-size:12px;">✅ You’re set — we’ll remind you tomorrow if streak at risk.</div>';
            setTimeout(function(){ banner.remove(); }, 2500);
            if(navigator.serviceWorker && navigator.serviceWorker.ready){
              navigator.serviceWorker.ready.then(function(reg){
                try{ reg.showNotification('Vector Hoops 🔥 streak saved', {body:'Your '+ (function(){ try{ var r=localStorage.getItem(\"vectorHoops.v5\"); var s=JSON.parse(r); return s.streak||1; }catch(e){return 1;}})() +' day streak — puzzle resets midnight CT', icon:'/assets/og-embed.png', badge:'/assets/og-embed.png'}); }catch(e){}
              });
            }
          } else {
            try{ localStorage.setItem(LS_NOTIFY_PROMPTED, String(Date.now())); }catch(e){}
            banner.remove();
          }
        });
      } else {
        banner.remove();
      }
    });
    document.getElementById('push-dismiss').addEventListener('click', function(){
      try{ localStorage.setItem(LS_NOTIFY_PROMPTED, String(Date.now())); }catch(e){}
      banner.remove();
    });
  }

  // service worker push listener is in sw.js — we need to handle push event there

  function init(){
    var visits = trackVisit();
    if(shouldPromptPush()){
      setTimeout(showPushBanner, 2500);
    }
    // streak flame pulsing if high streak
    try{
      var raw = localStorage.getItem('vectorHoops.v5');
      if(raw){
        var s = JSON.parse(raw);
        if(s && s.streak>=3){
          var style=document.createElement('style');
          style.textContent='@keyframes flamepulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.25) drop-shadow(0 0 6px #F0E442)}} .streak-flame{animation:flamepulse 1.4s infinite;}';
          document.head.appendChild(style);
        }
      }
    }catch(e){}
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
