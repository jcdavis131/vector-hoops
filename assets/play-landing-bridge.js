/* play-landing-bridge.js — instant-play: pick up guess from landing page + streak celebration */
(function(){
  function getGuessFromURL(){
    try{
      var p = new URLSearchParams(location.search);
      var g = p.get('guess');
      if(g) return g;
    }catch(e){}
    return null;
  }
  function getPending(){
    try{ return localStorage.getItem('vectorHoops.pendingLandingGuess'); }catch(e){ return null; }
  }
  function clearPending(){
    try{ localStorage.removeItem('vectorHoops.pendingLandingGuess'); }catch(e){}
  }
  function getStreak(){
    try{
      var raw = localStorage.getItem('vectorHoops.v5');
      if(!raw) return 0;
      var s = JSON.parse(raw);
      return s.streak||0;
    }catch(e){ return 0; }
  }
  function showStreakToast(){
    var streak = getStreak();
    if(streak<1) return;
    var toast = document.createElement('div');
    toast.className='vh-toast is-visible';
    toast.style.cssText='position:fixed; left:50%; top:calc(12px + env(safe-area-inset-top)); transform:translateX(-50%); background:#111; color:#fff; border:2px solid #F0E442; border-radius:999px; padding:8px 14px; font-family:var(--mono); font-size:11px; font-weight:900; z-index:90; box-shadow:4px 4px 0 #111; display:flex; gap:8px; align-items:center;';
    toast.innerHTML='<span style="background:#F0E442; color:#111; border-radius:999px; padding:2px 7px;">🔥 '+streak+'</span> <span>'+streak+' day streak — keep it?</span>';
    document.body.appendChild(toast);
    setTimeout(function(){ toast.style.opacity='0'; setTimeout(function(){ toast.remove(); }, 400); }, 3500);
  }
  function tryAutofill(){
    var guess = getGuessFromURL() || getPending();
    if(!guess){
      setTimeout(showStreakToast, 900);
      return;
    }
    var attempts=0;
    var iv = setInterval(function(){
      attempts++;
      var input = document.getElementById('chimera-input');
      if(!input){
        if(attempts>60){ clearInterval(iv); clearPending(); }
        return;
      }
      if(input.disabled && attempts<40){
        return;
      }
      input.value = guess;
      input.focus();
      try{
        input.dispatchEvent(new Event('input', {bubbles:true}));
        input.dispatchEvent(new KeyboardEvent('keydown', {key:'a', bubbles:true}));
      }catch(e){}
      setTimeout(function(){
        var sug = document.getElementById('chimera-suggestions');
        if(sug){
          var first = sug.querySelector('li, button');
          if(first && first.textContent && first.textContent.toLowerCase().indexOf(guess.toLowerCase())!==-1){
            first.click();
          }
        }
      }, 400);
      clearInterval(iv);
      setTimeout(function(){ clearPending(); showStreakToast(); }, 2000);
    }, 120);
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(tryAutofill, 600); });
  } else {
    setTimeout(tryAutofill, 600);
  }
  window.addEventListener('load', function(){ setTimeout(tryAutofill, 1000); });
})();
