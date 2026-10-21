/* --- extracted from teams.html (inline block) (pure move; no behavior change) --- */
/* Lazy team videos: load + autoplay when visible, pause when off-screen. */
(function(){
  'use strict';
  var vids = Array.prototype.slice.call(document.querySelectorAll('.team-card__video'));
  function enable(v){
    if(!v.getAttribute('src')) v.src = v.getAttribute('data-src');
    var p = v.play(); if(p && p.catch) p.catch(function(){});
  }
  function disable(v){ v.pause(); }
  if(!('IntersectionObserver' in window)){
    vids.forEach(enable); return;
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting) enable(e.target); else disable(e.target);
    });
  }, {rootMargin:'240px 0px'});
  vids.forEach(function(v){ io.observe(v); });
})();

/* --- extracted from teams.html (inline block) (pure move; no behavior change) --- */
if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}
