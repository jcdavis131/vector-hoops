  (function(){
    /* Guarded 3D mount: the page is complete without it (placeholder stays). */
    var el = document.getElementById('hero-3d'); if(!el) return;
    function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    /* Tap-to-identify caption (Panel B4): taps name the player and link the game. */
    var cap = document.createElement('p');
    cap.className = 'hero-map__pick caption'; cap.hidden = true;
    el.parentNode.insertBefore(cap, el.nextSibling);
    var handle = null;
    function onPick(id){
      if(!handle || typeof handle.info !== 'function') return;
      var info = handle.info(id);
      if(!info){ cap.hidden = true; return; }
      cap.innerHTML = 'Selected: <b>' + esc(info.name) + '</b> &middot; ' + esc(info.season) +
        (info.team ? ' &middot; ' + esc(info.team) : '') +
        ' &mdash; <a href="/map-guess">hunt today&rsquo;s mystery star &rarr;</a>';
      cap.hidden = false;
    }
    function mount(proj){
      if(!(window.Embed3D && typeof window.Embed3D.mount === 'function')) return false;
      try{
        handle = window.Embed3D.mount(el, {variant: 'home', projection: proj, height: el.clientHeight || 440, onSelect: onPick});
        var ph = el.querySelector('.embed3d-placeholder'); if(ph) ph.style.display = 'none';
        return true;
      }catch(e){ return false; }
    }
    if(!mount('pca')) return;
  })();
