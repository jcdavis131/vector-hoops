/* Vector Hoops — game-mechanics.js (Slice B)
 * Lifelines, scoring stars, twin-set collection, 3-mark tutorial,
 * attract mode, question suits. IIFE, zero deps, real data only.
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
    var el=$('#lifeline-status'); if(!el){ var bar=$('#lifelines-bar'); if(!bar) return; el=document.createElement('div'); el.id='lifeline-status'; el.className='small-mono'; bar.appendChild(el); }
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
      +'<button class="btn btn-lifeline" id="ll-twin" type="button"'+(used||over?' disabled':'')+'>🔭 Twin Reveal'+(used?' ✓':'')+'</button>'
      +'<button class="btn btn-lifeline" id="ll-era" type="button"'+(locks>=1||over?' disabled':'')+'>🕰 Era Lock <span class="ll-cost">−1 guess</span></button>';
    if(HAS_COURT_LAB) html+='<button class="btn btn-lifeline" id="ll-court" type="button"'+(over?' disabled':'')+'>📋 Court Check</button>';
    html+='</div><div class="small-mono" id="lifeline-status" style="margin-top:6px;opacity:.75"></div>';
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
    var g=lastGuess();
    if(!g||g.idx==null){ lifelineStatus('Make a guess first — Twin Reveal spotlights its 3 nearest twins.'); return; }
    lifelineStatus('Finding twins…');
    ensureVectors().then(function(v){
      var q=v[g.idx]; if(!q||!q.v){ lifelineStatus('No vector for that guess.'); return; }
      var scored=[];
      for(var i=0;i<v.length;i++){ if(i===g.idx||!v[i].v) continue; scored.push([cosSim(q.v,v[i].v), i]); }
      scored.sort(function(a,b){ return b[0]-a[0]; });
      var top=scored.slice(0,3).map(function(s){ return s[1]; });
      var names=top.map(function(i){ return v[i].name+' '+v[i].season; });
      var api=window._sharedMapApi;
      if(api){
        try{
          var all=api.getRowIds()||[];
          var keep={}; top.forEach(function(i){ keep[i]=true; });
          api.setDimmed(all.filter(function(id){ return !keep[id]; }));
          top.forEach(function(i){ try{ if(api.pulseGuess) api.pulseGuess(i); }catch(e){} });
        }catch(e){ console.warn('twin reveal map fail', e); }
      }
      var s=slotScope(); lsSet('vh.twinreveal.'+s.day+'.'+s.slot, true);
      lifelineStatus('🔭 Twins of '+(q.name||'your guess')+': '+names.join(' • '));
      renderLifelines();
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
        var api=window._sharedMapApi;
        if(api&&api.getRowIds){
          var ids=api.getRowIds()||[];
          var other=ids.filter(function(id){ var p=v[id]; return p&&decadeOf(p.season)!==dec; });
          api.setDimmed(other);
        }
      }catch(e){ console.warn('era lock dim fail', e); }
    }).catch(function(){});
    // consume a turn: the status bar + finish() read eraLocksUsed(), so the cost is visible
    try{ if(window.updateStatusBar) window.updateStatusBar(); }catch(e){}
    lifelineStatus('🕰 Era Lock: the mystery player is from the '+dec+' (−1 guess). Other decades dimmed.');
    renderLifelines();
  }
  function openCourtCheck(playerId){
    // Hook for the Court Lab page (spec §2.2). Hidden until the page exists.
    if(!HAS_COURT_LAB){ console.warn('[VHGameMechanics] openCourtCheck: Court Lab not built yet — would open court.html?player='+playerId); return false; }
    location.href='court.html?player='+encodeURIComponent(playerId==null?'':playerId);
    return true;
  }

  /* ---------- 4. tutorial: exactly 3 coach marks, first play ever ---------- */
  var TUT_KEY='vh.tutorial.done';
  var TUT_STEPS=[
    {sel:'#guess-card', title:'Think of a player.', body:'The game thought of one — a past star. Type a modern player and take your 6 guesses.'},
    {sel:'#map-wrap', title:'Answer — watch the map.', body:'Every guess lands on the map as a ring. Warmer means closer in the embedding.'},
    {sel:'#lens-bar', title:'Switch the lens — new arrangement, same truth.', body:'Map, PCA, t-SNE: three true views of the same players. Free to use, always.'}
  ];
  function runTutorial(){
    if(lsGet(TUT_KEY,false)) return;
    if(!$('#guess-card')) return; // play page only
    var idx=0, root=document.createElement('div'); root.id='coachmark-root';
    document.body.appendChild(root);
    function show(){
      if(idx>=TUT_STEPS.length){ root.remove(); lsSet(TUT_KEY,true); return; }
      var st=TUT_STEPS[idx], anchor=$(st.sel);
      var rect=anchor?anchor.getBoundingClientRect():null;
      root.innerHTML='<div class="coachmark-backdrop"></div><div class="coachmark" role="dialog" aria-label="Tutorial step '+(idx+1)+' of 3">'
        +'<div class="coachmark-step"> '+(idx+1)+' / 3</div>'
        +'<div class="coachmark-title">'+st.title+'</div>'
        +'<div class="coachmark-body">'+st.body+'</div>'
        +'<div class="coachmark-actions"><button class="btn" id="cm-skip" type="button">Skip</button>'
        +(idx<TUT_STEPS.length-1?'<button class="btn btn-primary" id="cm-next" type="button">Next →</button>':'<button class="btn btn-primary" id="cm-done" type="button">Play →</button>')
        +'</div></div>';
      var card=root.querySelector('.coachmark');
      if(rect){
        var top=window.pageYOffset+rect.bottom+8;
        card.style.top=Math.min(top, window.pageYOffset+window.innerHeight-190)+'px';
      }
      var nx=$('#cm-next'), dn=$('#cm-done'), sk=$('#cm-skip');
      if(nx) nx.addEventListener('click', function(){ idx++; show(); });
      if(dn) dn.addEventListener('click', function(){ idx=TUT_STEPS.length; show(); });
      if(sk) sk.addEventListener('click', function(){ idx=TUT_STEPS.length; show(); });
    }
    // wait a beat for the game to settle, then teach
    setTimeout(show, 1200);
  }

  /* ---------- 5. attract mode: 30s idle -> slow auto-rotate; any input wakes ---------- */
  var attractOn=false, idleTimer=null;
  var reduceMotion=(typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function armAttract(){
    if(idleTimer) clearTimeout(idleTimer);
    if(reduceMotion) return;
    idleTimer=setTimeout(function(){
      if(!$('#sky-canvas')) return; // map pages only
      attractOn=true;
      try{ window.dispatchEvent(new Event('vh:resume-maps')); }catch(e){}
    }, 30000);
  }
  ['pointerdown','keydown','wheel','touchstart'].forEach(function(ev){
    window.addEventListener(ev, function(){
      if(attractOn){ attractOn=false; try{ window.dispatchEvent(new Event('vh:pause-maps')); }catch(e){} }
      armAttract();
    }, {passive:true});
  });

  /* ---------- 6. twin-set collection (Daily Court meta-goal) ---------- */
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
      +'<p class="small-mono" style="opacity:.65;margin-top:8px">Solve Daily Court puzzles — each era-twin you reveal joins its set. Same device, no account.</p>';
    }
    if(_eratwins){ draw(); }
    else { el.innerHTML='<div class="small-mono">Loading twin sets…</div>'; ensureEraTwins().then(draw).catch(function(){ el.innerHTML='<div class="small-mono">Twin sets unavailable offline.</div>'; }); }
  }

  /* ---------- styles (kept here so play.html needs no CSS edit) ---------- */
  function injectCSS(){
    if(document.getElementById('vh-mechanics-css')) return;
    var st=document.createElement('style'); st.id='vh-mechanics-css';
    st.textContent=[
      '.lifeline-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
      '.btn-lifeline{font-size:12px;padding:8px 12px;min-height:40px}',
      '.btn-lifeline:disabled{opacity:.45;cursor:default}',
      '.ll-cost{opacity:.65;font-size:11px}',
      '.suit-tag{display:inline-block;font-family:ui-monospace,monospace;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--line-2,#d8d2c4);border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:middle}',
      '.suit-honors{background:#f6e8c8;border-color:#c9a227}',
      '.suit-style{background:#e4ecf9;border-color:#2B6CE5}',
      '.suit-team{background:#e2f0e4;border-color:#4a8f5d}',
      '.suit-era{background:#efece4;border-color:#9A9A94}',
      '.coachmark-backdrop{position:fixed;inset:0;background:rgba(20,18,14,.45);z-index:90}',
      '.coachmark{position:fixed;left:50%;transform:translateX(-50%);max-width:min(92vw,380px);background:var(--surface,#fffdf8);border:1.5px solid var(--ink,#232323);border-radius:12px;padding:14px 16px;z-index:91;box-shadow:0 12px 40px rgba(0,0,0,.25)}',
      '.coachmark-step{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.1em;opacity:.6}',
      '.coachmark-title{font-size:17px;font-weight:800;margin:4px 0}',
      '.coachmark-body{font-size:13px;line-height:1.5;opacity:.85}',
      '.coachmark-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}',
      '.twinsets{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}',
      '.twinset{border:1px solid var(--line,#e5e0d2);border-radius:10px;padding:10px 12px;background:var(--surface,#fffdf8)}',
      '.twinset.is-done{border-color:#4a8f5d}',
      '.twinset-head{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:13px;margin-bottom:6px}',
      '.twinset-bar{height:6px;border-radius:3px;background:#eee9db;overflow:hidden}',
      '.twinset-fill{height:100%;background:var(--accent,#C17C60);border-radius:3px}',
      '.result-stars{font-size:20px;letter-spacing:.15em;margin:2px 0 6px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ---------- init ---------- */
  function init(){
    injectCSS();
    if($('#lifelines-bar')){ renderLifelines(); preloadSuits();
      // re-render lifelines when the slot changes (delegated, light)
      var grid=$('#court-grid');
      if(grid) grid.addEventListener('click', function(){ setTimeout(renderLifelines, 400); });
    }
    if($('#guess-card')) runTutorial();
    armAttract();
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
