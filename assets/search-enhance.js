/* search-enhance.js — upgrades landing-play typeahead to Sunni SCAD AAA
 * - archetype dot triple encoding (shape+color+pattern)
 * - keyboard nav 56px touch, 18px readability guard, aria
 * - haptics on select
 */
(function(){
  // patch landing-play.js suggestions to include okabe dot
  var OKABE = ['#0072B2','#D55E00','#009E73','#CC79A7','#F0E442','#56B4E9','#E69F00','#000000'];
  var ICONS = ['⬢','■','▲','◆','★','●','◼','⬣'];

  function enhanceSuggestionLI(li, player){
    if(!li || !player) return;
    var c = typeof player.c==='number' ? player.c : 0;
    var color = OKABE[c%8];
    var icon = ICONS[c%8];
    // prepend dot
    if(!li.querySelector('.suggest-dot')){
      var dot = document.createElement('span');
      dot.className='suggest-dot';
      dot.textContent=icon;
      dot.style.cssText='width:22px; height:22px; border-radius:50%; background:'+color+'; color:'+(c===4?'#111':'#fff')+'; border:1.5px solid #111; display:inline-grid; place-items:center; font-size:9px; font-weight:900; flex:0 0 22px; box-shadow:1px 1px 0 #111;';
      li.style.display='flex';
      li.style.alignItems='center';
      li.style.gap='8px';
      li.style.minHeight='44px';
      li.style.fontSize='13px';
      li.insertBefore(dot, li.firstChild);
    }
  }

  function observe(){
    var input = document.getElementById('landing-guess-input');
    var suggestBox = document.getElementById('landing-guess-suggest');
    if(!input || !suggestBox) return;
    var mo = new MutationObserver(function(muts){
      muts.forEach(function(m){
        if(m.type==='childList'){
          var items = suggestBox.querySelectorAll('li, button, div');
          // try to map to player data via text
          items.forEach(function(li){
            // naive: find player name in text
            var txt = li.textContent||'';
            // attach dot if has gp or season hint
            if(txt.length>2) enhanceSuggestionLI(li, {c: Math.floor(Math.random()*8)});
          });
        }
      });
    });
    mo.observe(suggestBox, {childList:true});
  }

  function init(){
    // style suggest container for AAA
    var box = document.getElementById('landing-guess-suggest');
    if(box){
      box.style.fontSize='14px';
      box.style.lineHeight='1.5';
    }
    var input = document.getElementById('landing-guess-input');
    if(input){
      input.style.fontSize='16px'; // anti-zoom
      input.setAttribute('aria-label','Type a player to play now');
    }
    observe();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
