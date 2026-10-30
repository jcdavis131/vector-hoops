/* --- extracted from players.html (arc-ridge v1 priors block; pure move) --- */
// 2026-27 model projections in the skill profile (arc-ridge v1 priors)
(function(){
  function currentName(){
    var el = document.getElementById('pp-name');
    return (el && el.textContent || '').trim();
  }
  var lastRenderedName = null;
  function update(){
    var slot = document.getElementById('pp-forecast-slot');
    var zoneSlot = document.getElementById('pp-shotzone-slot');
    if(!slot || !window.ArcProjections) return;
    var name = currentName();
    /* The observer below watches the whole #skills-profile subtree — which
       contains #pp-forecast-slot itself. renderInto() writes into that slot,
       so an unguarded update() re-triggers the observer, whose callback calls
       update() again: an unbounded MutationObserver/promise microtask loop
       that never yields to the main thread and freezes the renderer (the
       /players hang). Render only when the displayed player actually changed;
       the mutation our own render causes then settles instead of looping. */
    if(name === lastRenderedName) return;
    lastRenderedName = name;
    if(!name || name.length < 2){ slot.innerHTML=''; if(zoneSlot) zoneSlot.innerHTML=''; return; }
    window.ArcProjections.renderInto(slot, name);
    /* 2026-27 shot-zone map (arm1 v5a); same render guard, its own slot */
    if(zoneSlot && window.ShotZones) window.ShotZones.renderInto(zoneSlot, name);
  }
  function wire(){
    var profile = document.getElementById('skills-profile');
    if(profile){
      var obs = new MutationObserver(function(){ update(); });
      obs.observe(profile, {childList:true, subtree:true});
    }
    setTimeout(update, 1200);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire); else setTimeout(wire, 800);
})();

