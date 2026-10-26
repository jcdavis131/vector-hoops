/* Vector Hoops — game-mechanics.js (Slice B)
 * Lifelines, scoring stars, twin-set collection, question suits.
 * IIFE, zero deps, real data only. First-visit teaching is the How to play
 * sheet (play-engine.js, vh.onboardSeenV3); its styles live in game.css.
 * Spec: specs/map-projections-game-mechanics-SPEC.md §2 + §5 Slice B.
 */
(function(){
  'use strict';
  if(window.VHGameMechanics) return;

  var $=function(s){ try{ return document.querySelector(s); }catch(e){ return null; } };
  function lsGet(k,d){ try{ var r=localStorage.getItem(k); return r==null?d:JSON.parse(r); }catch(e){ return d; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function fetchJSON(p){ return fetch(p,{cache:'default'}).then(function(r){ if(!r.ok) throw new Error('fetch '+p+' '+r.status); return r.json(); }); }

  /* ---------- 1. scoring ---------- */
  // Generic: 3 stars <=40% of budget, 2 stars <=60%, else 1.
  // budget 20 -> 8/12/20 (spec); budget 6 -> 3/4/6.
  function starsFor(used, budget){
    var u=Math.max(0, +used||0), b=Math.max(1, +budget||20);
    if(u<=Math.ceil(b*0.4)) return 3;
    if(u<=Math.ceil(b*0.6)) return 2;
    return 1;
  }
  function starsHTML(n){ n=Math.max(1,Math.min(3,n|0)); return '★'.repeat(n)+'☆'.repeat(3-n); }

  /* ---------- 2. lazy real data ---------- */
  var _vec=null, _hon=null, _archById=null, _rareClusters=null, _roles=null, _eratwins=null;
  function ensureVectors(){ if(_vec) return Promise.resolve(_vec); return fetchJSON('assets/vectors.json').then(function(j){ _vec=j.players||j; return _vec; }); }
  function ensureEraTwins(){ if(_eratwins) return Promise.resolve(_eratwins); return fetchJSON('assets/eratwins.json').then(function(j){ _eratwins=j.players||[]; return _eratwins; }); }

  var _suitsReady=false, _suitCbs=[];
  function preloadSuits(){
    Promise.all([fetchJSON('assets/honors.json'), fetchJSON('assets/archetype_assignments.json'), fetchJSON('assets/roles.json')])
      .then(function(all){
        _hon=(all[0]&&all[0].bySeason)||{};
        var asg=all[1]&&all[1].assignments||[];
        _archById={};
        var counts={};
        asg.forEach(function(a){
          if(!a||a.id==null) return;
          _archById[a.id]=a.gameCluster; // id aligns with vectors.json index (== game target p.i)
          counts[a.gameCluster]=(counts[a.gameCluster]||0)+1;
        });
        var sorted=Object.keys(counts).sort(function(x,y){ return counts[x]-counts[y]; });
        _rareClusters={}; sorted.slice(0,2).forEach(function(c){ _rareClusters[c]=true; });
        _roles=(all[2]&&all[2].tiers)||{};
        _suitsReady=true;
        _suitCbs.forEach(function(cb){ try{cb();}catch(e){} }); _suitCbs=[];
      })
      .catch(function(e){ console.warn('[mechanics] suit preload fail', e); });
  }
  // Suit rule (documented, deterministic, data-grounded):
  // Honors: any honors flag that season. Style: gameCluster in the two rarest
  // clusters. Team: roles tier 'leader'/'key contributor'. Era: fallback.
  // id = game target index (aligns with archetype_assignments[].id).
  function suitFor(name, season, id){
    if(!_suitsReady) return null;
    var key=name+'|'+season, h=_hon[key];
    if(h&&(h.asg||h.allNbaTeam||h.finalsMvp)) return 'Honors';
    var gc=(id!=null&&_archById)?_archById[id]:null;
    if(gc!=null&&_rareClusters[gc]) return 'Style';
    var t=_roles[key];
    if(t==='leader'||t==='key contributor') return 'Team';
    return 'Era';
  }
  function suitTagHTML(name, season, id){
    var s=suitFor(name,season,id);
    if(!s) return '';
    return '<span class="suit-tag suit-'+s.toLowerCase()+'">'+s+'</span>';
  }
  function onSuitsReady(cb){ if(_suitsReady){ try{cb();}catch(e){} } else _suitCbs.push(cb); }

  /* ---------- 3. lifelines ---------- */
  var HAS_COURT_LAB=false; // Court Lab page doesn't exist yet — hook ready, button hidden.
  function slotScope(){
    try{ var st=window.VHPastModern&&VHPastModern.state(); return {day:(st&&st.dayKey)||'nodate', slot:(st&&st.dailySlot)||0}; }
    catch(e){ return {day:'nodate', slot:0}; }
  }
  function eraLocksUsed(){ var s=slotScope(); return lsGet('vh.eralock.'+s.day+'.'+s.slot, 0)|0; }
  function twinUsed(){ var s=slotScope(); return !!lsGet('vh.twinreveal.'+s.day+'.'+s.slot, false); }
  function decadeOf(season){ var m=/(\d{4})/.exec(season||''); if(!m) return null; var y=+m[1]; return Math.floor(y/10)*10+'s'; }
  function lifelineStatus(msg){
    var el=$('#lifeline-status'); if(!el){ var bar=$('#lifelines-bar'); if(!bar) return; el=document.createElement('div'); el.id='lifeline-status'; el.className='small-mono lifeline-status'; bar.appendChild(el); }
    el.textContent=msg;
  }
  function gameOver(){
    try{
      var st=window.VHPastModern.state();
      var locks=eraLocksUsed();
      var guesses=(st&&st.guesses)||[];
      return guesses.some(function(g){return g&&g.rank===0;}) || guesses.length>=(6-locks);
    }catch(e){ return false; }
  }
  function renderLifelines(){
    var bar=$('#lifelines-bar'); if(!bar) return;
    var used=twinUsed(), locks=eraLocksUsed(), over=gameOver();
    var html='<div class="lifeline-row" role="group" aria-label="Lifelines">'
      +'<button class="btn btn-lifeline" id="ll-twin" type="button"'+(used||over?' disabled':'')+' title="Spotlight the mystery star\u2019s 3 nearest twins on the map">🔭 Twin Reveal'+(used?' ✓':'')+'</button>'
      +'<button class="btn btn-lifeline" id="ll-era" type="button"'+(locks>=1||over?' disabled':'')+'>🕰 Era Lock <span class="ll-cost">−1 guess</span></button>';
    if(HAS_COURT_LAB) html+='<button class="btn btn-lifeline" id="ll-court" type="button"'+(over?' disabled':'')+'>📋 Court Check</button>';
    html+='</div><div class="small-mono lifeline-status" id="lifeline-status"></div>';
    bar.innerHTML=html;
    var t=$('#ll-twin'); if(t) t.addEventListener('click', twinReveal);
    var e=$('#ll-era'); if(e) e.addEventListener('click', eraLock);
    var c=$('#ll-court'); if(c) c.addEventListener('click', function(){ openCourtCheck(null); });
  }
  function lastGuess(){
    try{ var g=(window.VHPastModern.state().guesses)||[]; return g.length?g[g.length-1]:null; }catch(e){ return null; }
  }
  function cosSim(a,b){ var d=0,na=0,nb=0; for(var i=0;i<a.length;i++){ d+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; } return (na&&nb)?d/(Math.sqrt(na)*Math.sqrt(nb)):0; }
  function twinReveal(){
    if(gameOver()){ lifelineStatus('Game over — lifelines closed.'); return; }
    if(twinUsed()){ lifelineStatus('Twin Reveal already used this slot.'); return; }
    /* Panel v3 G5: the reveal spotlights the TARGET's twins, not the last
       guess's. Twins of your guess tell you where you already are; twins of
       the mystery star point at where you need to go. */
    var st=null; try{ st=window.VHPastModern.state(); }catch(e){}
    var t=st&&st.target;
    if(!t||t.i==null){ lifelineStatus('No active puzzle for Twin Reveal.'); return; }
    lifelineStatus('Finding twins…');
    ensureVectors().then(function(v){
      var q=v[t.i]; if(!q||!q.v){ lifelineStatus('No vector for the mystery star.'); return; }
      /* No self-twins: a player's own other seasons are the nearest rows in
         embedding space, so excluding only the exact row fills the whole
         reveal with the mystery star himself (e.g. Curry 2016-17 revealed
         Curry 2014-15 / 2015-16 / 2017-18). Identity is person_id, not name:
         distinct players share names (two Dee Browns, two Reggie Williams),
         and person_id keeps them apart. Fall back to name only where a row
         carries no person_id. */
      var isSelf = function (row) {
        if (!row) return false;
        if (q.person_id && row.person_id) return row.person_id === q.person_id;
        return row.name === q.name;
      };
      var scored=[];
      for(var i=0;i<v.length;i++){ if(i===t.i||isSelf(v[i])||!v[i].v) continue; scored.push([cosSim(q.v,v[i].v), i]); }
      scored.sort(function(a,b){ return b[0]-a[0]; });
      var top=scored.slice(0,3).map(function(s){ return s[1]; });
      var names=top.map(function(i){ return v[i].name+' '+v[i].season; });
      var map=window.VHPlayMap; // the Embed3D handle play-engine.js mounts
      if(map){
        try{
          map.setHighlight(top);
          map.setDim(top.concat([t.i])); // setDim takes the ids to keep lit
        }catch(e){ console.warn('twin reveal map fail', e); }
      }
      var s=slotScope(); lsSet('vh.twinreveal.'+s.day+'.'+s.slot, true);
      /* renderLifelines() rebuilds #lifelines-bar (wiping #lifeline-status),
         so flip the button state FIRST, then write the reveal text. */
      renderLifelines();
      lifelineStatus('🔭 Twins of the mystery star: '+names.join(' • '));
    }).catch(function(e){ lifelineStatus('Twin data still loading — try again in a moment.'); });
  }
  function eraLock(){
    if(gameOver()){ lifelineStatus('Game over — lifelines closed.'); return; }
    if(eraLocksUsed()>=1){ lifelineStatus('Era Lock already used this slot.'); return; }
    var st=null; try{ st=window.VHPastModern.state(); }catch(e){}
    var t=st&&st.target;
    if(!t||!t.s){ lifelineStatus('No active puzzle for Era Lock.'); return; }
    var dec=decadeOf(t.s); if(!dec){ lifelineStatus('Could not read target decade.'); return; }
    var s=slotScope(); lsSet('vh.eralock.'+s.day+'.'+s.slot, 1);
    ensureVectors().then(function(v){
      try{
        var map=window.VHPlayMap;
        if(map){
          var keep=[]; // vectors.json row i == the map's point id i
          for(var i=0;i<v.length;i++){ if(v[i]&&decadeOf(v[i].season)===dec) keep.push(i); }
          map.setDim(keep);
        }
      }catch(e){ console.warn('era lock dim fail', e); }
    }).catch(function(){});
    // consume a turn: the status bar + finish() read eraLocksUsed(), so the cost is visible
    try{ if(window.updateStatusBar) window.updateStatusBar(); }catch(e){}
    /* renderLifelines() rebuilds #lifelines-bar (wiping #lifeline-status),
       so flip the button state FIRST, then write the status text. */
    renderLifelines();
    lifelineStatus('🕰 Era Lock: the mystery player is from the '+dec+' (−1 guess). Other decades dimmed.');
  }
  function openCourtCheck(playerId){
    // Hook for the Court Lab page (spec §2.2). Hidden until the page exists.
    if(!HAS_COURT_LAB){ console.warn('[VHGameMechanics] openCourtCheck: Court Lab not built yet — would open court.html?player='+playerId); return false; }
    location.href='court.html?player='+encodeURIComponent(playerId==null?'':playerId);
    return true;
  }

  /* ---------- 4. twin-set collection (Daily Court meta-goal) ---------- */
  var TWIN_SETS=[
    {id:'pillars90', name:'90s Pillars', need:5, match:function(p){ return p.decade==='1990s'; }},
    {id:'icons00', name:'2000s Icons', need:5, match:function(p){ return p.decade==='2000s'; }},
    {id:'stars10', name:'2010s Stars', need:5, match:function(p){ return p.decade==='2010s'; }},
    {id:'modern20', name:'Modern Era', need:5, match:function(p){ return p.decade==='2020s'; }},
    {id:'glass', name:'Glass Cleaners', need:4, match:function(p){ return /glass/i.test(p.archetype||''); }},
    {id:'sharp', name:'Sharpshooters', need:4, match:function(p){ return /three-point/i.test(p.archetype||''); }}
  ];
  var COLLECT_KEY='vh.twinsets.collected';
  function collectedSet(){ var a=lsGet(COLLECT_KEY,[]); return new Set(Array.isArray(a)?a:[]); }
  // Call on a Daily Court win with the target's name+season. Real data: eratwins.json.
  function collectTwin(name, season){
    return ensureEraTwins().then(function(players){
      var hit=players.find(function(p){ return p.name===name&&p.season===season; });
      if(!hit) return null;
      var set=collectedSet(), key=name+'|'+season;
      if(!set.has(key)){ set.add(key); lsSet(COLLECT_KEY, Array.from(set)); }
      return twinSetProgress();
    }).catch(function(){ return null; });
  }
  function twinSetProgress(){
    var set=collectedSet();
    return TWIN_SETS.map(function(def){
      var n=0;
      (_eratwins||[]).forEach(function(p){ if(def.match(p)&&set.has(p.name+'|'+p.season)) n++; });
      return {id:def.id, name:def.name, have:Math.min(n,def.need), need:def.need, done:n>=def.need};
    });
  }
  function renderTwinSets(mountEl){
    var el=typeof mountEl==='string'?$(mountEl):mountEl; if(!el) return;
    function draw(){
      var prog=twinSetProgress();
      el.innerHTML='<div class="twinsets">'+prog.map(function(s){
        var pct=Math.round(100*s.have/s.need);
        return '<div class="twinset'+(s.done?' is-done':'')+'"><div class="twinset-head"><span class="twinset-name">'+s.name+(s.done?' ✓':'')+'</span><span class="small-mono">'+s.have+'/'+s.need+'</span></div>'
          +'<div class="twinset-bar"><div class="twinset-fill" style="width:'+pct+'%"></div></div></div>';
      }).join('')+'</div>'
      +'<p class="caption twinsets-note">Solve Daily Court puzzles — each era-twin you reveal joins its set. Same device, no account.</p>';
    }
    if(_eratwins){ draw(); }
    else { el.innerHTML='<div class="small-mono">Loading twin sets…</div>'; ensureEraTwins().then(draw).catch(function(){ el.innerHTML='<div class="small-mono">Twin sets unavailable offline.</div>'; }); }
  }

  /* ---------- init ---------- */
  function init(){
    if($('#lifelines-bar')){ renderLifelines(); preloadSuits();
      // re-render lifelines when the slot changes (delegated, light)
      var grid=$('#court-grid');
      if(grid) grid.addEventListener('click', function(){ setTimeout(renderLifelines, 400); });
    }
    onSuitsReady(function(){ try{ if(window.renderDailyCourt) window.renderDailyCourt(); }catch(e){} });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.VHGameMechanics={
    starsFor:starsFor, starsHTML:starsHTML,
    renderLifelines:renderLifelines, twinReveal:twinReveal, eraLock:eraLock,
    eraLocksUsed:eraLocksUsed, openCourtCheck:openCourtCheck, HAS_COURT_LAB:HAS_COURT_LAB,
    suitFor:suitFor, suitTagHTML:suitTagHTML, onSuitsReady:onSuitsReady,
    collectTwin:collectTwin, twinSetProgress:twinSetProgress, renderTwinSets:renderTwinSets,
    decadeOf:decadeOf
  };
})();
