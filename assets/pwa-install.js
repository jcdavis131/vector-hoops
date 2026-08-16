/* pwa-install.js — custom install prompt for 10M DAU, AAA, 44px touch, paper/ink
 * Shows after 2 visits or after team lock, respects beforeinstallprompt
 */
(function(){
  var LS_KEY = 'vectorHoops.installPromptDismissedAt';
  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    maybeShow();
  });

  function shouldShow(){
    try{
      var dismissed = localStorage.getItem(LS_KEY);
      if(dismissed && (Date.now() - parseInt(dismissed,10) < 14*86400000)) return false;
      var visitsRaw = localStorage.getItem('vectorHoops.visits');
      var visits = visitsRaw ? JSON.parse(visitsRaw) : [];
      var hasLocked = false;
      try{ hasLocked = !!localStorage.getItem('vectorHoops.favoriteTeam'); }catch(e){}
      return visits.length>=2 || hasLocked;
    }catch(e){ return false; }
  }

  function maybeShow(){
    if(!shouldShow()) return;
    if(document.getElementById('pwa-install-banner')) return;

    /* This read `'standalone' in navigator`, which is a feature test, as though
       it were an is-installed test. On iOS Safari the property always exists,
       so the condition was false there and every iOS visitor with two visits
       fell through to showBanner() — the banner with an Install button — while
       showIOS(), the branch actually written for them, was unreachable.

       Measured with navigator.standalone defined the way Safari defines it:
       banner true, install button true, and pressing it returns "banner
       removed, nothing installed". iOS has no beforeinstallprompt at all, so
       there was never anything for that button to do. It is the same defect as
       the dead Find fit button removed from /player-fit, on the platform where
       a custom prompt is the only prompt there is.

       navigator.standalone === true is the is-installed test. */
    var installed = navigator.standalone === true ||
                    window.matchMedia('(display-mode: standalone)').matches;
    if(installed) return;                 /* nothing to offer someone who has it */

    if(!deferredPrompt){
      /* no prompt to defer means no Install button can work */
      if(/iphone|ipad|ipod/i.test(navigator.userAgent)) showIOS();
      return;
    }
    showBanner();
  }

  function showBanner(){
    var banner = document.createElement('div');
    banner.id='pwa-install-banner';
    banner.style.cssText='position:fixed; left:50%; bottom:calc(14px + env(safe-area-inset-bottom)); transform:translateX(-50%); z-index:75; background:#FFFEF7; color:#111; border:2px solid #111; border-radius:16px; box-shadow:6px 6px 0 #111; padding:12px 14px; display:flex; gap:12px; align-items:center; max-width:min(92vw, 420px); width:92vw; box-sizing:border-box; font-family:ui-monospace, monospace;';
    banner.innerHTML='<div style="flex:0 0 40px; height:40px; background:#111; color:#F0E442; border-radius:10px; display:grid; place-items:center; font-weight:950; font-size:18px;">VH</div><div style="flex:1; min-width:0;"><div style="font-weight:900; font-size:13px; line-height:1.2;">Add to Home Screen</div><div style="font-size:11px; opacity:.8; line-height:1.35; margin-top:2px;">Offline, instant, no app store.</div></div><div style="display:flex; flex-direction:column; gap:6px;"><button id="pwa-install-go" style="min-height:36px; border:2px solid #111; background:#F0E442; border-radius:999px; font-weight:900; font-size:12px; padding:0 14px; cursor:pointer; box-shadow:2px 2px 0 #111;">Install</button><button id="pwa-install-no" style="min-height:28px; border:1px solid #111; background:transparent; border-radius:999px; font-size:10px; padding:0 10px; cursor:pointer;">Not now</button></div>';
    document.body.appendChild(banner);
    document.getElementById('pwa-install-go').addEventListener('click', function(){
      if(deferredPrompt){
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function(choice){
          try{ localStorage.setItem(LS_KEY, String(Date.now())); }catch(e){}
          banner.remove();
          deferredPrompt=null;
        });
      } else {
        /* unreachable: showBanner only runs with a deferredPrompt in hand. It
           used to be how the Install button "worked" on iOS. */
        banner.remove();
      }
    });
    document.getElementById('pwa-install-no').addEventListener('click', function(){
      try{ localStorage.setItem(LS_KEY, String(Date.now())); }catch(e){}
      banner.remove();
    });
  }

  function showIOS(){
    if(document.getElementById('pwa-install-banner')) return;
    var banner = document.createElement('div');
    banner.id='pwa-install-banner';
    banner.style.cssText='position:fixed; left:50%; bottom:calc(14px + env(safe-area-inset-bottom)); transform:translateX(-50%); z-index:75; background:#FFFEF7; color:#111; border:2px solid #111; border-radius:16px; box-shadow:6px 6px 0 #111; padding:12px 14px; display:flex; gap:12px; align-items:center; max-width:min(92vw, 420px); width:92vw; box-sizing:border-box; font-family:ui-monospace, monospace;';
    banner.innerHTML='<div style="flex:0 0 40px; height:40px; background:#0072B2; color:#fff; border-radius:10px; display:grid; place-items:center; font-weight:950;">⬆</div><div style="flex:1;"><div style="font-weight:900; font-size:13px;">Add to Home Screen</div><div style="font-size:11px; opacity:.8; line-height:1.35; margin-top:2px;">Tap Share → Add to Home Screen for offline instant play.</div></div><button id="pwa-install-no" style="min-height:32px; border:1.5px solid #111; background:#fff; border-radius:999px; font-size:11px; padding:0 12px; cursor:pointer;">Got it</button>';
    document.body.appendChild(banner);
    document.getElementById('pwa-install-no').addEventListener('click', function(){
      try{ localStorage.setItem(LS_KEY, String(Date.now())); }catch(e){}
      banner.remove();
    });
  }

  /* Nothing was counting. shouldShow() waits for two visits or a locked team,
     and measured: `vectorHoops.visits` is written only by push-retention.js and
     `vectorHoops.favoriteTeam` only by favorite-team.js, and **neither file is
     loaded by any page** — 0 of 18, while this one is loaded by 16. So
     shouldShow() has always returned false and this banner has never appeared
     to anyone. The dead Install button fixed above was real, and no one had met
     it yet.

     Rather than wire in two more scripts that nothing else references, the file
     that is loaded counts its own visits. Same key and same shape as
     push-retention.js — an array of Date.now() capped at 30 — so if that one is
     ever wired the two agree instead of fighting.

     Once per six hours, because opening a second link is not coming back. */
  function recordVisit(){
    try{
      var raw = localStorage.getItem('vectorHoops.visits');
      var visits = raw ? JSON.parse(raw) : [];
      var now = Date.now();
      var last = visits.length ? +visits[visits.length - 1] : 0;
      if(now - last < 6 * 3600000) return;
      visits.push(now);
      if(visits.length > 30) visits = visits.slice(-30);
      localStorage.setItem('vectorHoops.visits', JSON.stringify(visits));
    }catch(e){}
  }

  function init(){
    recordVisit();
    setTimeout(maybeShow, 3500);
    window.addEventListener('vh:favorite-team', function(){ setTimeout(maybeShow, 1200); });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
