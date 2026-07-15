/* keyboard-a11y.js — keyboard shortcuts + focus management for AAA
 * n/p next/prev, l lock, / focus search, Esc unlock, ? nux
 * Solo personal project
 */
(function(){
  function isTyping(){
    var ae = document.activeElement;
    if(!ae) return false;
    var tag = ae.tagName ? ae.tagName.toLowerCase() : '';
    return tag==='input' || tag==='textarea' || tag==='select' || ae.isContentEditable;
  }

  function init(){
    var pills = document.getElementById('city-intro-pills');
    var next = document.getElementById('city-intro-next');
    var prev = document.getElementById('city-intro-prev');
    var lock = document.getElementById('city-intro-lock');
    var search = document.getElementById('landing-guess-input') || document.getElementById('chimera-input');

    document.addEventListener('keydown', function(e){
      if(e.key==='/' && !isTyping()){
        e.preventDefault();
        if(search){ search.focus(); search.select(); }
        return;
      }
      if(e.key==='Escape'){
        // unlock if locked
        if(lock && lock.classList.contains('is-locked')){
          lock.click();
        }
        // close any banners
        var b = document.getElementById('pwa-install-banner');
        if(b) b.remove();
        var pb = document.getElementById('push-retention-banner');
        if(pb) pb.remove();
        return;
      }
      if(isTyping()) return;
      if(e.key==='n' || e.key==='ArrowRight'){
        e.preventDefault(); next && next.click();
      } else if(e.key==='p' || e.key==='ArrowLeft'){
        e.preventDefault(); prev && prev.click();
      } else if(e.key==='l'){
        e.preventDefault(); lock && lock.click();
      } else if(e.key==='?'){
        e.preventDefault();
        if(window.VHNux) window.VHNux.show({force:true});
      }
    });

    // focus ring improvement
    var style = document.createElement('style');
    style.textContent = ':focus-visible{outline:2px solid #F0E442; outline-offset:2px; box-shadow:0 0 0 4px rgba(240,228,66,.3);} .city-pill:focus-visible{outline:2px solid #111; box-shadow:0 0 0 4px #F0E442;}';
    document.head.appendChild(style);

    // a11y labels for pills scroll
    if(pills){
      pills.setAttribute('role','tablist');
      pills.setAttribute('aria-label','Team filter — 30 NBA teams');
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
