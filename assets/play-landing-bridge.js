/* play-landing-bridge.js — instant-play: pick up guess from landing page */
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
  function tryAutofill(){
    var guess = getGuessFromURL() || getPending();
    if(!guess) return;
    // wait for chimera-input to exist and be enabled
    var attempts=0;
    var iv = setInterval(function(){
      attempts++;
      var input = document.getElementById('chimera-input');
      if(!input){
        if(attempts>60){ clearInterval(iv); clearPending(); }
        return;
      }
      if(input.disabled && attempts<40){
        // wait for game.js to enable
        return;
      }
      // fill
      input.value = guess;
      input.focus();
      // dispatch input to trigger autocomplete
      try{
        input.dispatchEvent(new Event('input', {bubbles:true}));
        input.dispatchEvent(new KeyboardEvent('keydown', {key:'a', bubbles:true}));
      }catch(e){}
      // if suggestion list has exact match, auto-click first after delay
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
      // keep url guess but clear LS after short
      setTimeout(clearPending, 2000);
    }, 120);
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(tryAutofill, 600); });
  } else {
    setTimeout(tryAutofill, 600);
  }
  // also re-try on game ready event?
  window.addEventListener('load', function(){ setTimeout(tryAutofill, 1000); });
})();
