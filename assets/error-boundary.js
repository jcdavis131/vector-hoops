/* error-boundary.js — graceful offline + retry + AAA empty states
 * Shows inline retry when vectors_lite fails, toast for offline
 * Solo personal project
 */
(function(){
  function showOfflineToast(){
    if(document.getElementById('vh-offline-toast')) return;
    var t = document.createElement('div');
    t.id='vh-offline-toast';
    t.className='vh-toast is-visible';
    t.style.cssText='position:fixed; top:calc(12px + env(safe-area-inset-top)); left:50%; transform:translateX(-50%); background:#111; color:#fff; border:2px solid #F0E442; border-radius:999px; padding:8px 14px; font-family:var(--mono); font-size:11px; z-index:90; box-shadow:4px 4px 0 #111;';
    t.textContent='Offline — cached 12,966 seasons still playable. Reconnect for live rivalry.';
    document.body.appendChild(t);
    setTimeout(function(){ t.style.opacity='0'; setTimeout(function(){ t.remove(); }, 400); }, 4000);
  }

  function showVectorsError(){
    var hero = document.getElementById('city-intro');
    if(!hero) return;
    if(document.getElementById('vectors-error')) return;
    var div = document.createElement('div');
    div.id='vectors-error';
    div.style.cssText='position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); z-index:5; background:#FFFEF7; color:#111; border:2px solid #111; border-radius:14px; box-shadow:6px 6px 0 #111; padding:14px; max-width:86%; text-align:center; font-family:var(--mono);';
    div.innerHTML='<div style="font-weight:900; font-size:13px;">Sky took longer to load</div><div style="font-size:11px; opacity:.8; margin-top:4px; line-height:1.4;">12,966 seasons map is 114KB gz lite-first. Check connection.</div><button id="vectors-retry" style="margin-top:10px; min-height:36px; border:2px solid #111; background:#F0E442; border-radius:999px; font-weight:900; padding:0 14px; cursor:pointer; box-shadow:2px 2px 0 #111;">Retry</button>';
    hero.appendChild(div);
    document.getElementById('vectors-retry').addEventListener('click', function(){
      div.remove();
      // force reload embedding
      try{ localStorage.removeItem('vectorHoops.vectorsFailedAt'); }catch(e){}
      location.reload();
    });
  }

  function init(){
    window.addEventListener('offline', showOfflineToast);
    window.addEventListener('online', function(){
      var t = document.getElementById('vh-offline-toast');
      if(t) t.remove();
      // hide error if present
      var e = document.getElementById('vectors-error');
      if(e) e.remove();
    });
    window.addEventListener('vh:vectors-failed', showVectorsError);

    // global error handler for vectors_lite fetch fail
    var orig = window.fetch;
    // we already patched in hero-perf, but add catch for embedding-nebula
    window.addEventListener('error', function(ev){
      if(ev.message && ev.message.indexOf('vectors')!==-1){
        setTimeout(showVectorsError, 800);
      }
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
