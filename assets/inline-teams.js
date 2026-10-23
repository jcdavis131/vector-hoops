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

/* --- per-card share (T4.2): Web Share API with the card's poster image + deep
   link; falls back to copying the per-team anchor link. Lazy video pattern
   above is untouched. --- */
(function(){
  'use strict';
  function slugOf(card){
    var v = card.querySelector('.team-card__video');
    var m = v && /team-intros\/([\w-]+)-loop-phone\.mp4/.exec(v.getAttribute('data-src') || '');
    return m ? m[1] : null;
  }
  function teamName(card){
    var h = card.querySelector('.team-card__head h2');
    return h ? h.textContent.replace(/#\s*$/, '').trim() : 'Team intro';
  }
  function feedback(btn, msg, label){
    btn.textContent = msg;
    setTimeout(function(){ btn.textContent = label; }, 1600);
  }
  function copyLink(url, btn, label){
    function done(msg){ feedback(btn, msg, label); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function(){ done('Link copied'); }, function(){ done('Copy failed'); });
    } else { done('Copy unavailable'); }
  }
  async function share(card, btn){
    var label = btn.textContent;
    var slug = slugOf(card), name = teamName(card);
    var url = 'https://hoops.dumbmodel.com/teams#team-' + slug;
    var title = name + ' — Vector Hoops team intro';
    var text = name + ': seamless 8-second intro loop — 2026\u201327 roster inside the embedding atlas';
    try {
      if (slug && navigator.canShare) {
        var res = await fetch('assets/team-intros/' + slug + '-loop-poster.jpg');
        if (res.ok) {
          var blob = await res.blob();
          var file = new File([blob], slug + '-team-intro.jpg', { type: blob.type || 'image/jpeg' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: title, text: text, url: url });
            return;
          }
        }
      }
    } catch (e) { /* fall through to link share */ }
    try {
      if (navigator.share) { await navigator.share({ title: title, text: text, url: url }); return; }
    } catch (e) { /* dismissed — fall through */ }
    copyLink(url, btn, label);
  }
  function init(){
    var cards = document.querySelectorAll('.team-card');
    cards.forEach(function(card){
      var head = card.querySelector('.team-card__head');
      if (!head || head.querySelector('.team-card__share')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'team-card__share';
      btn.textContent = 'Share';
      btn.setAttribute('aria-label', 'Share the ' + teamName(card) + ' intro');
      btn.addEventListener('click', function(){ share(card, btn); });
      head.appendChild(btn);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
