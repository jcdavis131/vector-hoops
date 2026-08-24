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
    if(!deferredPrompt && !('standalone' in navigator || window.matchMedia('(display-mode: standalone)').matches)) {
      // on iOS, show manual add to home screen
      var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if(isIOS) showIOS();
      return;
    }
    showBanner();
  }

  function showBanner(){
    var banner = document.createElement('div');
    banner.id='pwa-install-banner';
    banner.style.cssText='position:fixed; left:50%; bottom:calc(14px + env(safe-area-inset-bottom)); transform:translateX(-50%); z-index:75; background:#FFFEF7; color:#111; border:2px solid #111; border-radius:16px; box-shadow:6px 6px 0 #111; padding:12px 14px; display:flex; gap:12px; align-items:center; max-width:min(92vw, 420px); width:92vw; box-sizing:border-box; font-family:ui-monospace, monospace;';
    banner.innerHTML='<div style="flex:0 0 40px; height:40px; background:#111; color:#F0E442; border-radius:10px; display:grid; place-items:center; font-weight:950; font-size:18px;">VH</div><div style="flex:1; min-width:0;"><div style="font-weight:900; font-size:13px; line-height:1.2;">Add to Home Screen</div><div style="font-size:11px; opacity:.8; line-height:1.35; margin-top:2px;">Offline, instant, no app store. 114KB lite map cached.</div></div><div style="display:flex; flex-direction:column; gap:6px;"><button id="pwa-install-go" style="min-height:36px; border:2px solid #111; background:#F0E442; border-radius:999px; font-weight:900; font-size:12px; padding:0 14px; cursor:pointer; box-shadow:2px 2px 0 #111;">Install</button><button id="pwa-install-no" style="min-height:28px; border:1px solid #111; background:transparent; border-radius:999px; font-size:10px; padding:0 10px; cursor:pointer;">Not now</button></div>';
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

  function init(){
    setTimeout(maybeShow, 3500);
    window.addEventListener('vh:favorite-team', function(){ setTimeout(maybeShow, 1200); });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
