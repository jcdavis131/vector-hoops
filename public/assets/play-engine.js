(function(){
  const $=s=>document.querySelector(s);
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const ARCH=["Glass+Rim","LowVol Glass","Low Impact 3P Vol","Def Glass+Rim FT","Vol+3P Vol","3P Acc+Vol","Playmaking+Steals","Scoring Vol"];
  let G={guesses:[]};
  // --- court readiness: guess controls stay disabled until a target is on
  // the floor; a failed load surfaces a fallback with a reload action
  // instead of an endless 'Loading court...' spinner.
  let courtReady=false, courtFailed=false;
  function markCourtReady(){
    courtReady=true; courtFailed=false;
    try{ const f=document.getElementById('court-load-fallback'); if(f) f.hidden=true; }catch{}
    try{ const i=document.getElementById('guess-input'); if(i) i.disabled=false; const b=document.getElementById('guess-btn'); if(b) b.disabled=false; }catch{}
  }
  function markCourtFailed(){
    if(courtReady) return;
    courtFailed=true;
    try{ const lbl=document.getElementById('game-phase-label'); if(lbl) lbl.textContent='Court failed to load'; }catch{}
    try{ const f=document.getElementById('court-load-fallback'); if(f) f.hidden=false; }catch{}
  }
  try{ const rb=document.getElementById('btn-reload-court'); if(rb) rb.addEventListener('click', ()=>location.reload()); }catch{}
  // team logo map — HOME-only free-tier
  let _teamMap=null, _teamMapLoading=false;
  async function loadTeamMap(){
    if(_teamMap || _teamMapLoading) return;
    _teamMapLoading=true;
    try{
      const r=await fetch('assets/player_team_season.json?v=0c472066',{cache:'default'});
      if(r.ok){ _teamMap=await r.json();}
    }catch{}
    _teamMapLoading=false;
  }
  setTimeout(loadTeamMap, 20);
  function getTeamAbbr(name, season){
    try{
      if(!_teamMap) return null;
      if(!name||!season) return null;
      return _teamMap[`${name}|${season}`]||null;
    }catch{ return null; }
  }
    // --- shared map v1 — unified simple 2D canvas, replaces old inline engine ---
  let sharedMapApi = null;
  let isTyping = false;
  let _targetIdCached = -1;
  let auto = true;
  let mapPaused = false;
  let W=0,H=0;
  let projected = [];
  let baseOx=null, baseOy=null, baseOz=null, baseC=null, baseI=null, baseN=null, baseS=null, projById=null, maxId=0;
  let modernPoolLower = [];

  function resize(){ try{ sharedMapApi && sharedMapApi.resize(); }catch{} }
  function projectFrame(){}
  let _lastGuessKey=null;
  function draw(){
    // pushes guesses to the map only when they changed — keeps the 900ms sync + the
    // projectFrame();draw() idiom from forcing a full canvas redraw while idle-paused
    try{
      if(!sharedMapApi) return;
      const guesses=(G&&G.guesses)?G.guesses:[];
      // key on ids only — sim/rank never change for a guess once it exists,
      // so identity of the id list is enough to detect "something changed"
      const key=guesses.map(g=>g.idx).join(',');
      // force if any guess missing from lite sample (modern 2024-26 often outside 4322-pt map)
      let needsForce=false;
      if(key===_lastGuessKey){
        try{
          for(const g of guesses){
            if(g&&g.idx!=null && sharedMapApi.hasPoint && !sharedMapApi.hasPoint(g.idx)){ needsForce=true; break; }
          }
        }catch{}
        if(!needsForce) return;
      }
      _lastGuessKey=key;
      sharedMapApi.setGuesses(guesses);
    }catch{}
  }
  function focusOnTarget(){ try{ sharedMapApi && sharedMapApi.focusOnTarget && sharedMapApi.focusOnTarget(); }catch{} }
  function ensureModernLower(){
    try{
      const st = (window.VHPastModern && VHPastModern.state) ? VHPastModern.state() : null;
      if(!st || !st.modernPool || !st.modernPool.length) return;
      if(modernPoolLower.length !== st.modernPool.length){
        modernPoolLower = st.modernPool.map(m=>(m.n||'').toLowerCase());
      }
    }catch{}
  }
  async function mountGameMap(){
    try{
      const mod = await import('./shared-map.js?v=59');
      const canvasEl = document.querySelector('#sky-canvas');
      if(!canvasEl) return;
      const st = (window.VHPastModern && VHPastModern.state) ? VHPastModern.state() : null;
      let tid = _targetIdCached;
      if(st && st.target && typeof st.target.i==='number'){ tid = st.target.i; _targetIdCached = tid; }
      // pass full guess objects (idx/sim/rank), not just ids, so a resumed
      // in-progress slot still shows the distance line + label immediately
      sharedMapApi = await mod.mountSharedMap(canvasEl, { highlightId: tid>=0?tid:null, guessIds: (G.guesses||[]).slice(), dark:true });
      window._sharedMapApi = sharedMapApi;
      mountLensBar();
    }catch(e){ console.warn('mountGameMap fail',e); }
  }
  // Map lenses: layout switcher bar above the game map. Builds the
  // external-id -> person_id join from the game's searchLite pool, then
  // attaches VHMapLenses. Degrades gracefully (bar hidden) if data never arrives.
  function mountLensBar(){
    try{
      if(!window.VHMapLenses || !window._sharedMapApi) return;
      var mountEl = document.getElementById('lens-bar');
      if(!mountEl || mountEl.dataset.done) return;
      mountEl.dataset.done = '1';
      var t0 = Date.now();
      (function poll(){
        var map = new Map();
        try{
          var st = (window.VHPastModern && VHPastModern.state) ? VHPastModern.state() : null;
          var sl = st && st.searchLite;
          var arr = sl && (sl.players || sl);
          if(arr) for(var k=0;k<arr.length;k++){
            var p=arr[k];
            if(p && p.i!=null && p.pid) map.set(p.i|0, p.pid);
          }
        }catch(e){}
        if(map.size || Date.now()-t0 > 8000){
          try{
            var h = window.VHMapLenses.attach(window._sharedMapApi, {mountEl: mountEl, idToPid: map});
            window._mapLensHandle = h || null;
          }catch(e){ console.warn('lens attach fail', e); }
          return;
        }
        setTimeout(poll, 250);
      })();
    }catch(e){}
  }
  setTimeout(mountGameMap, 80);
  let _mapAddFailedId=null;
  function syncMapFromState(){
    try{
      const st=(window.VHPastModern && VHPastModern.state)?VHPastModern.state():null;
      if(!st) return;
      let tid=null;
      if(st.target && typeof st.target.i==='number') tid=st.target.i;
      if(tid!=null && sharedMapApi){
        const firstSee = tid!==_targetIdCached;
        _targetIdCached=tid;
        let added=false;
        // the lite map is a sample — inject the target row from searchLite so the bullseye always exists
        if(tid!==_mapAddFailedId && sharedMapApi.hasPoint && !sharedMapApi.hasPoint(tid)){
          try{
            const sl=st.searchLite && st.searchLite.players;
            const row=sl && sl.find(p=>p && p.i===tid);
            if(row && sharedMapApi.addPoint) added=sharedMapApi.addPoint(row);
            if(!added) _mapAddFailedId=tid;
          }catch{ _mapAddFailedId=tid; }
        }
        if(firstSee||added){ sharedMapApi.setTarget(tid); sharedMapApi.focusOnTarget(); }
      }
      // guesses: modern 2024-26 players are often outside the 4322-pt lite map —
      // inject any missing so orange rings show up as you type
      try{
        if(sharedMapApi && G && G.guesses && G.guesses.length){
          const sl=st.searchLite && st.searchLite.players;
          for(const gm of G.guesses){
            if(!gm||gm.idx==null) continue;
            if(sharedMapApi.hasPoint && sharedMapApi.hasPoint(gm.idx)) continue;
            let row=null;
            if(gm.x!=null && gm.y!=null && gm.z!=null){
              row={i:gm.idx, x:gm.x, y:gm.y, z:gm.z, c:gm.c??0, n:gm.name||'', s:gm.season||''};
            } else if(sl){
              row=sl.find(p=>p&&p.i===gm.idx);
            }
            if(row) sharedMapApi.addPoint(row);
          }
        }
      }catch(e){ console.warn('sync guesses inject fail',e); }
      draw();
    }catch(e){ console.warn('syncMapFromState fail',e); }
  }
  // periodically sync in case target changes via pack/daily
  setInterval(syncMapFromState, 900);
  window.addEventListener('vh:game-state-changed', syncMapFromState);


  // --- helpers ---
  let searchWorker=null, workerReady=false, workerSeq=0, lastWorkerId=0;
  function initSearchWorker(){
    return null; // disabled — main thread 8-item scan is plenty and avoids structured-clone jank on mobile
  }

  // ── Typeahead v2 ──────────────────────────────────────────────────────
  // Replaces the old per-keystroke scan. The old filteredModern() called
  // .toLowerCase() on every one of ~491 players on EVERY keystroke, even
  // though state.modernByLower already existed precomputed and unused. The
  // old suggestion list also destroyed and recreated up to 8 <li> elements
  // from scratch on every debounce tick. On a memory-constrained phone
  // running many tabs, that steady allocation + GC churn was one more thing
  // competing for a main thread already under pressure — consistent with
  // reports of the input freezing while typing.
  //
  // What changes:
  //   - the lowercase index is built ONCE, lazily, not per keystroke
  //   - the 8 suggestion rows are DOM nodes created ONCE and reused —
  //     updated in place via textContent/hidden, never recreated
  //   - painting is batched through one requestAnimationFrame per tick,
  //     so a burst of keystrokes coalesces into a single layout pass
  //   - a monotonic token discards a stale result if a newer keystroke
  //     already superseded it (defensive: matching semantics are preserved
  //     — substring match, so "james" still finds "LeBron James" — this is
  //     a performance and allocation rewrite, not a behavior change)
  let _searchIndex=null;
  function buildSearchIndex(){
    const st=(window.VHPastModern && VHPastModern.state) ? VHPastModern.state() : null;
    const pool=st && st.modernPool;
    if(!pool || !pool.length) return null;
    _searchIndex=[];
    for(let i=0;i<pool.length;i++){ const m=pool[i]; if(m&&m.n) _searchIndex.push({ref:m, lower:m.n.toLowerCase()}); }
    return _searchIndex;
  }
  function filteredModern(q){
    q=(q||'').toLowerCase().trim();
    if(q.length<2) return [];
    try{
      const idx=_searchIndex || buildSearchIndex();
      if(!idx) return [];
      const out=[];
      for(let i=0;i<idx.length && out.length<8;i++){ if(idx[i].lower.indexOf(q)!==-1) out.push(idx[i].ref); }
      return out;
    }catch(e){ return []; }
  }
  function attachSuggest(){
    const input=document.getElementById('guess-input'), ul=document.getElementById('guess-suggest');
    if(!input||!ul) return;
    let active=-1, last=[], debounceTimer=null, renderScheduled=false, searchToken=0;

    // Fixed pool of row nodes, created once. A production autocomplete
    // should not allocate DOM per keystroke.
    const ROWS=8, rowEls=[];
    for(let i=0;i<ROWS;i++){
      const li=document.createElement('li');
      li.dataset.i=String(i); li.hidden=true;
      ul.appendChild(li); rowEls.push(li);
    }

    function paint(){
      renderScheduled=false;
      if(!last.length){ ul.style.display='none'; for(const li of rowEls) li.hidden=true; return; }
      for(let i=0;i<ROWS;i++){
        const li=rowEls[i], m=last[i];
        if(!m){ li.hidden=true; continue; }
        li.hidden=false;
        li.textContent=m.n+' '+(m.s||'');
        li.classList.toggle('is-active', i===active);
      }
      ul.style.display='block';
    }
    function render(list){
      last=Array.isArray(list)?list:[];
      if(!renderScheduled){ renderScheduled=true; requestAnimationFrame(paint); }
    }
    function searchAndRender(q){
      const t=(q||'').trim(); active=-1;
      const myToken=++searchToken;
      if(!t||t.length<2){ render([]); return; }
      const list=filteredModern(t);
      if(myToken!==searchToken) return; // a newer keystroke already landed
      render(list);
    }
    input.addEventListener('input', function(){
      const v=this.value; clearTimeout(debounceTimer); debounceTimer=setTimeout(()=>searchAndRender(v),120);
    });
    input.addEventListener('keydown',function(e){
      if(e.key==='ArrowDown'){ if(!last.length) return; e.preventDefault(); active=Math.min(active+1,last.length-1); render(last); }
      else if(e.key==='ArrowUp'){ if(!last.length) return; e.preventDefault(); active=Math.max(active-1,0); render(last); }
      else if(e.key==='Enter'){
        const hasActive = active>=0 && last[active];
        if(hasActive){ e.preventDefault(); input.value=last[active].n; ul.style.display='none'; active=-1; doGuess(); return; }
        if((input.value||'').trim().length>=2){ e.preventDefault(); ul.style.display='none'; doGuess(); }
      } else if(e.key==='Escape'){ ul.style.display='none'; active=-1; }
    });
    ul.addEventListener('click',function(e){ const li=e.target.closest('li'); if(!li||li.hidden) return; const i=parseInt(li.dataset.i,10); if(!isNaN(i)&&last[i]){ input.value=last[i].n; ul.style.display='none'; active=-1; doGuess(); } });
    document.addEventListener('click',function(e){ if(!ul.contains(e.target)&&e.target!==input) ul.style.display='none'; });
  }
  function dailyKey(){ try{ return VHPastModern.state().dayKey; }catch{ return new Date().toISOString().slice(0,10); } }
  function dailySlotKey(dayKey,slot){ try{ if(VHPastModern.state().isTriple) return `vh.triple.v1.${dayKey}.slot${slot}`; }catch{} return `vh.daily.v2.${dayKey}.slot${slot}`; }
  function loadGuesses(){
    try{
      const st=VHPastModern.state();
      if(st.isDaily||st.isChallenge){
        const k=dailySlotKey(st.dayKey, st.dailySlot||0);
        const raw=localStorage.getItem(k);
        if(!raw) return [];
        const j=JSON.parse(raw);
        const seen={}; const out=[]; for(const g of (j.guesses||[])){ const key=(g.name||'').toLowerCase(); if(!key||seen[key]) continue; seen[key]=true; out.push(g); }
        return out;
      } else {
        const raw=localStorage.getItem('vh.pastmodern.v10'); if(!raw) return []; const obj=JSON.parse(raw); if(obj.day!==VHPastModern.state().dayKey) return []; const seen={}; const out=[]; for(const g of obj.guesses||[]){ const key=(g.name||'').toLowerCase(); if(!key||seen[key]) continue; seen[key]=true; out.push(g); } return out;
      }
    }catch{ return []; }
  }
  function saveGuesses(){
    try{
      const st=VHPastModern.state();
      if(st.isDaily||st.isChallenge){
        const k=dailySlotKey(st.dayKey, st.dailySlot||0);
        localStorage.setItem(k, JSON.stringify({day:st.dayKey, slot:st.dailySlot, guesses:G.guesses}));
      } else {
        localStorage.setItem('vh.pastmodern.v10', JSON.stringify({day:st.dayKey, guesses:G.guesses}));
      }
    }catch{}
  }
  // sound toggle — persisted mute, reflects state on the button
  function initSoundToggle(){
    try{
      const btn=$('#btn-sound'); if(!btn||!window.VHAudio) return;
      const paint=()=>{ btn.textContent = VHAudio.isMuted() ? '🔇' : '🔊'; };
      paint();
      btn.addEventListener('click',()=>{ VHAudio.unlock(); VHAudio.toggleMuted(); paint(); if(!VHAudio.isMuted()) VHAudio.play('click'); });
    }catch{}
  }
  function confettiBurst(){
    try{ if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; }catch{}
    const cv=$('#confetti-canvas'); if(!cv) return; cv.style.display='block'; const ctx=cv.getContext('2d'); cv.width=innerWidth; cv.height=innerHeight; const parts=[]; for(let i=0;i<140;i++){ parts.push({x:Math.random()*cv.width, y:-20-Math.random()*100, vx:(Math.random()-0.5)*6, vy:Math.random()*4+2.5, r:Math.random()*6+3, c:OKABE[i%OKABE.length], a:1}); }
    const t0=performance.now(); function frame(t){ const dt=t-t0; ctx.clearRect(0,0,cv.width,cv.height); let alive=false; for(let i=0;i<parts.length;i++){ const p=parts[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.09; p.vx*=0.99; p.a-=0.005; if(p.a>0){ alive=true; ctx.globalAlpha=p.a; ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); } } ctx.globalAlpha=1; if(alive&&dt<4500) requestAnimationFrame(frame); else cv.style.display='none'; } requestAnimationFrame(frame);
  }
  // staged win: arpeggio first, haptic on its peak, confetti last —
  // a sequence that lands, not everything firing at once
  function celebrateWin(){
    try{
      if(window.VHAudio) VHAudio.play('win');
      setTimeout(()=>{ try{ if(navigator.vibrate) navigator.vibrate(60); }catch(e){} }, 220);
      setTimeout(()=>{ try{ confettiBurst(); }catch(e){} }, 480);
    }catch(e){ try{ confettiBurst(); }catch(e2){} }
  }

  // --- DAILY COURT ---
  function renderDailyCourt(){
    const grid=$('#court-grid'), label=$('#court-day-label'), solvedEl=$('#court-solved'), guessesEl=$('#court-guesses'), lineupBar=$('#lineup-bar'), ipBadge=$('#court-ip-badge');
    const st=VHPastModern.state(); if(!st.dailyPool||!st.dailyPool.length){ $('#daily-court').style.display='none'; return; }
    $('#daily-court').style.display='block';
    if(label) label.textContent=st.dayKey;
    if(ipBadge) ipBadge.textContent = st.ip ? `Slot ${st.dailyAssignedSlot!=null?st.dailyAssignedSlot+1:'?'} • same for everyone` : 'Same for everyone • refresh-proof';
    const dayKey=st.dayKey;
    let totalSolved=0, totalGuesses=0;
    const slotData=[];
    for(let i=0;i<st.dailyPool.length;i++){
      try{
        const raw=localStorage.getItem(dailySlotKey(dayKey,i));
        if(raw){ const j=JSON.parse(raw); const won=(j.guesses||[]).some(g=>g.rank===0); const cnt=(j.guesses||[]).length; totalGuesses+=cnt; if(won) totalSolved++; slotData[i]={won, cnt, guesses:j.guesses||[]}; }
        else slotData[i]=null;
      }catch{ slotData[i]=null; }
    }
    if(solvedEl) solvedEl.textContent=totalSolved;
    const totalEl=$('#court-total'); if(totalEl) totalEl.textContent='/'+st.dailyPool.length;
    const modeNameEl=$('#court-mode-name'); if(modeNameEl) modeNameEl.textContent=st.isTriple?'Daily Triple':'Daily Court';
    updateStreakPills();
    const r5El=$('#reward-5'); if(r5El) r5El.style.display=st.isTriple?'none':'';
    if(guessesEl) guessesEl.textContent=totalGuesses;
    const guessesWordEl=$('#court-guesses-word'); if(guessesWordEl) guessesWordEl.textContent=totalGuesses===1?'guess':'guesses';
    const r1=$('#reward-1'), r3=$('#reward-3'), r5=$('#reward-5');
    if(r1){ r1.classList.toggle('is-unlocked', totalSolved>=1); }
    if(r3){ r3.classList.toggle('is-unlocked', totalSolved>=3); if(totalSolved>=3) r3.classList.add('gold'); }
    if(r5){ r5.classList.toggle('is-unlocked', totalSolved>=5); if(totalSolved>=5) r5.classList.add('gold'); }

    if(grid){
      grid.innerHTML = st.dailyPool.map((p,i)=>{
        const sd=slotData[i];
        const isActive = i===st.dailySlot;
        const isSolved = sd&&sd.won;
        const isFailed = sd&&!sd.won&&sd.cnt>=6;
        const cls = `court-card ${isActive?'is-active':''} ${isSolved?'is-solved':''} ${isFailed?'is-failed':''}`;
        const badge = isSolved? '✅': isFailed? '❌' : sd? `${sd.cnt}/6` : '▶';
        const arch = ARCH[p.c%ARCH.length];
        return `<div class="${cls}" data-slot="${i}"><div class="court-slot">Slot ${i+1} • ${arch} ${window.VHGameMechanics?VHGameMechanics.suitTagHTML(p.n,p.s,p.i):''} ${isActive? '• NOW':''}</div><div class="court-name">${p.n} ${p.s}</div><div class="court-meta">${sd? (isSolved? `Won in ${sd.cnt}/6` : `${sd.cnt}/6 tries`): 'Not started'}</div><span class="court-badge pill ${isSolved?'pill-green':''}">${badge}</span></div>`;
      }).join('');
      grid.querySelectorAll('.court-card').forEach(el=>{
        el.addEventListener('click',()=>{
          const slot=parseInt(el.dataset.slot,10);
          if(isNaN(slot)) return;
          const target = VHPastModern.switchDailySlot(slot);
          if(target){
            try{ if(window.VHAudio) VHAudio.play('click'); }catch{}
            const url=new URL(location.href); url.searchParams.set('slot', slot); url.searchParams.delete('pack'); url.searchParams.delete('s'); history.replaceState(null,'',url);
            G.guesses = loadGuesses();
            try{ VHPastModern.state().guesses=G.guesses.slice(); }catch{}
            renderPast(); renderGuesses(); renderDailyCourt(); updateStatusBar(); projectFrame(); draw();
            window.scrollTo({top: $('#past-card').offsetTop-20, behavior:'smooth'});
          }
        });
      });
    }
    if(lineupBar){
      const chips=[];
      for(let i=0;i<5;i++){
        const sd=slotData[i];
        if(sd&&sd.won){
          const winGuess = sd.guesses.find(g=>g.rank===0);
          if(winGuess) chips.push(`<span class="lineup-chip">Slot ${i+1}: ${winGuess.name} ← ${st.dailyPool[i].n}</span>`);
          else chips.push(`<span class="lineup-chip">Slot ${i+1}: solved</span>`);
        } else {
          chips.push(`<span class="lineup-chip" style="opacity:.5">Slot ${i+1}: —</span>`);
        }
      }
      lineupBar.innerHTML = chips.join('') + `<span class="small-mono" style="opacity:.6">Modern 5 • ${totalSolved}/5 collected. Solve 3 for Sharpshooter, 5 for Full Court perfect.</span>`;
    }
  }

  // --- PACK BATTLE RETIRED ---
  // Pack Battle was retired (subtraction pass, Oct 2026). Old ?pack= links
  // land here instead of launching pack mode — an honest note, not a 404.
  function renderPackRetired(){
    const el=$('#pack-retired'); const st=VHPastModern.state();
    if(!st.packRetired){ el.style.display='none'; return; }
    el.style.display='block';
    el.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div><div class="small-mono" style="opacity:.6">Retired surface</div><h3 class="hd" style="margin:6px 0">Pack Battle is gone</h3><div style="font-size:13px;line-height:1.5">One daily ritual, one map behind it. Daily Court — five past All-Stars, the same five for everyone — is the game now.</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-primary" href="/play">Play Daily Court</a></div>
    </div>`;
  }

  function updateStatusBar(){
    const st=VHPastModern.state(); if(!st||!st.target){ const turnText=$('#turn-text'); if(turnText) turnText.textContent='Loading court…'; return; }
    const triesPill=$('#tries-pill'), phase=$('#game-phase-label'), dots=$('#guess-dots'), turnCount=$('#turn-count'), slotWrap=$('#slot-label-wrap');
    const count=G.guesses.length;
    const locks=(window.VHGameMechanics&&VHGameMechanics.eraLocksUsed)?VHGameMechanics.eraLocksUsed():0;
    if(triesPill) triesPill.textContent=(count+locks)+'/6';
    if(turnCount) turnCount.textContent=(count+locks+1<=6?count+locks+1:6);
    // was: also wrote slotLabel.textContent here first, then immediately
    // overwrote the same node via slotWrap.innerHTML below — every call threw
    // away that write and rebuilt a brand-new #slot-label node from scratch,
    // which is what put the same id in the source twice with no purpose.
    // slotWrap.innerHTML already sets the number correctly (and it's the only
    // place that can also swap the "slot"/"pack" prefix word), so the
    // textContent branch was pure redundant DOM churn on every guess.
    if(slotWrap){
      slotWrap.innerHTML=`slot <span id="slot-label">${st.dailySlot!=null?st.dailySlot+1:1}</span>/5`;
    }
    if(dots){
      dots.innerHTML='';
      for(let i=0;i<6;i++){
        const d=document.createElement('span');
        d.className='progress-dot'+(i<count?' is-done':'')+(i===count?' is-current':'');
        d.textContent=i<count?'✓':i+1;
        dots.appendChild(d);
      }
    }
    const won=G.guesses.some(g=>g.rank===0); const over=won||count>=6;
    const safeSlotDaily = (st.dailySlot!=null ? st.dailySlot+1 : 1);
    if(phase){
      if(st.isDaily) phase.textContent= over? (won? `Slot ${safeSlotDaily} won in ${count}/6`:`Slot ${safeSlotDaily} failed`) : `Slot ${safeSlotDaily}/5 • ${count}/6 • same 5 for everyone today`;
      else if(over) phase.textContent=won? `Won in ${count}/6`:'Game over';
      else phase.textContent = count===0? 'See model lens' : `Playing — ${count}/6 used`;
    }
    // subset map stays visible — was ready-banner
    /* syncSubsetFromState removed — it was defined nowhere (its partner subset-map.js is deleted); the calls threw a swallowed ReferenceError */
    const turnText=$('#turn-text'); if(turnText){
      if(over) turnText.textContent=won? `Won in ${count} — switch slot for next` : `Failed — answer was ${st.closestModern?st.closestModern.entry.n:'?'}`;
      else if(count===0) turnText.textContent=`Model lens: ${st.target?st.target.n:'…'} archetype • team logo shows ${(()=>{try{return st.target? (getTeamAbbr(st.target.n,st.target.s)||'team'):'team'}catch{return 'team'}})()} • picks left`;
      else turnText.textContent=`Guess ${count}/6 used — ${6-count} left`;
    }
  }

  function renderPast(){
    const st=VHPastModern.state(); const past=st.target; if(!past) return;
    const slotNum = (st.dailySlot!=null ? st.dailySlot+1 : 1);
    const totalSlots = 5;
    const archLabel = ARCH[past.c%ARCH.length];
    const modeLabel = `Slot ${slotNum}/${totalSlots}`;
    $('#past-name').textContent=past.n+' '+past.s;
    try{ markCourtReady(); }catch{}
    const hon=st.honors[past.n+'|'+past.s]||{}; const allNba=hon.allNbaTeam? 'All-NBA '+hon.allNbaTeam : '';
    let teamAbbr=null; try{ teamAbbr=getTeamAbbr(past.n, past.s); }catch{}
    if(teamAbbr){
      $('#past-meta').innerHTML=(hon.asg?'All-Star ':'')+(allNba? allNba+' • ' : '')+archLabel+` • ${past.s} • `+modeLabel+` • <span style="display:inline-flex;align-items:center;gap:6px"><span class="pill" style="background:var(--accent);color:var(--on-accent)">${teamAbbr}</span> finished with</span>`;
    } else {
      $('#past-meta').innerHTML=(hon.asg?'All-Star ':'')+(allNba? allNba+' • ' : '')+archLabel+' • '+past.s+' • '+modeLabel;
    }
    // new pills
    const archPill=$('#past-arch-pill'); if(archPill) archPill.textContent=archLabel;
    const slotPill=$('#past-slot-pill'); if(slotPill) slotPill.textContent=modeLabel;
    const xyz=$('#past-xyz'); if(xyz){ xyz.textContent=''; xyz.style.display='none'; }
    // TEAM LOGO pixel art – team they finished season with
    try{
      const avEl=$('#past-avatar');
      if(avEl){
        if(teamAbbr && window.VHTeamLogo){
          VHTeamLogo.mountLogo(avEl, teamAbbr, 64);
        } else if(window.VHTeamLogo){
          VHTeamLogo.mountLogo(avEl, 'NBA', 64);
          if(!_teamMap) loadTeamMap().then(()=>{ try{ const ab=getTeamAbbr(past.n,past.s); if(ab) VHTeamLogo.mountLogo(avEl, ab, 64);}catch{} });
        } else if(window.VHPixel){
          VHPixel.mountAvatar(avEl, past.n, past.c, 64);
        }
      }
    }catch(e){}
    try{ focusOnTarget(); projectFrame(); draw(); }catch{}
    $('#puzzle-pill').textContent= st.isDaily? `COURT ${slotNum}/5` : 'P#'+st.puzzleNum;
    $('#mode-badge').textContent= st.isDaily? 'DAILY 5' : st.isRandom? 'RANDOM' : 'DAILY';
    $('#header-mode-label').textContent='DAILY COURT • 5× PAST → MODERN';
    updateStreakPills();
    $('#puzzle-day-label').textContent= st.isDaily? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(st.dayKey.slice(5,7),10)-1]} ${parseInt(st.dayKey.slice(8,10),10)} · Daily Court · 5 puzzles` : st.dayKey;
    updateStatusBar(); projectFrame(); draw();
  }
  function renderGuesses(){
    const cont=$('#guesses'); cont.innerHTML='';
    G.guesses.forEach((g,idx)=>{
      try{
        const simVal = (typeof g.sim === 'number' && !isNaN(g.sim)) ? g.sim : 0;
        const simPct=(simVal*100).toFixed(1);
        const rankNum = (typeof g.rank === 'number' ? g.rank : 999);
        const rankLabel=rankNum===0? '✅ #1 WIN': '#'+(rankNum+1);
        let warm='first';
        if(idx>0){
          /* Warmer/colder compares the similarity the player actually sees —
             never the rank. Rank and similarity share one ordering, but rank
             can go stale through old saves while sim is always recomputed,
             and a tag that contradicts the visible % reads as a bug. */
          const prevSim=(function(){ var p=G.guesses[idx-1]; return (p&&typeof p.sim==='number'&&!isNaN(p.sim))?p.sim:simVal; })();
          warm = simVal > prevSim ? '🔥 warmer' : simVal < prevSim ? '❄️ colder' : 'same';
        }
        const isWin=rankNum===0;
        const archName = (typeof g.c==='number' && ARCH[g.c%ARCH.length]) ? ARCH[g.c%ARCH.length] : '—';
        const safeName = (g.name||'').replace(/</g,'&lt;');
        const safeSeason = (g.season||'').replace(/</g,'&lt;');
        // only the just-submitted row animates in — re-renders (load, slot
        // switch) must not replay the entrance on every row
        const isNew = !!G._animateNew && idx===(G.guesses.length-1);
        const targetW = Math.max(4,Math.min(100,parseFloat(simPct)||0));
        const div=document.createElement('div'); div.className='guess-row'+(isWin?' win':'')+(isNew?' is-new':'');
        // pixel avatar for each guess resembling player
        const avatarId = `guess-av-${idx}-${Date.now()}`;
        div.innerHTML=`<div style="display:flex;gap:10px;align-items:center"><div id="${avatarId}" style="width:36px;height:36px;flex:0 0 36px;background:#FFF6D5;border:1px solid var(--line-2);border-radius:8px;overflow:hidden;image-rendering:pixelated"></div><div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${idx+1}. ${safeName} ${safeSeason}</b><span class="pill" style="${isWin?'background:var(--green);color:#fff':''}">${simPct}% • ${rankLabel}</span></div><div class="small-mono" style="text-transform:none;margin-top:4px;color:var(--fg-2)">${warm} • ${archName}</div><div class="bar" style="margin-top:6px"><i style="width:${isNew?0:targetW}%;background:${isWin?'#009E73':'#0072B2'}"></i></div></div></div>`;
        cont.appendChild(div);
        if(isNew){
          const bar=div.querySelector('.bar>i');
          requestAnimationFrame(()=>requestAnimationFrame(()=>{ try{ if(bar) bar.style.width=targetW+'%'; }catch{} }));
        }
        // mount avatar after append
        try{
          const avEl=document.getElementById(avatarId);
          if(avEl && window.VHPixel){
            VHPixel.mountAvatar(avEl, g.name, g.c, 36);
          }
        }catch(e){}
      }catch(e){ console.warn('renderGuesses item fail', e, g); }
    });
    G._animateNew=false;
    syncGuessInput();
    updateStatusBar();
  }

  // opts.celebrate=true only for a genuinely new winning guess — a reload of an
  // already-solved slot must not replay the fanfare or touch the streak
  function finish(opts){
    opts=opts||{}; const celebrateNew=opts.celebrate===true;
    const won=G.guesses.some(g=>g.rank===0); const locksUsed=(window.VHGameMechanics&&VHGameMechanics.eraLocksUsed)?VHGameMechanics.eraLocksUsed():0; const over=won||G.guesses.length>=(6-locksUsed); const resEl=$('#result'); let st=VHPastModern.state();
    if(!over){ resEl.innerHTML=''; resEl.style.display='none'; updateStatusBar(); renderDailyCourt(); return; }
    resEl.style.display='block';
    // harden: embeddings may still be loading → closest null would crash (repro for "breaks when i guess")
    // If ranking isn't ready, the fallback (alphabetical, 0% sim) is NOT valid — wait for real data.
    let closest=st.closestModern;
    let list=st.modernListSorted||[];
    if(!st.rankingReady){
      try{ if(window.VHMtnn && VHMtnn.isReady && VHMtnn.isReady()){ VHPastModern.computeClosest(); st=VHPastModern.state(); closest=st.closestModern; list=st.modernListSorted||[]; } }catch(e){ console.warn('computeClosest retry fail', e); }
    }
    if(!st.rankingReady || !closest || !closest.entry){
      resEl.innerHTML=`<div class="card"><h3 class="hd">⏳ Loading twin…</h3><div style="font-size:13px;line-height:1.5">Embeddings still loading (3.3MB). Your guess is saved (${G.guesses.length}/6).<br>Top: ${(list||[]).slice(0,3).map(o=>o.m && o.m.n || '').join(' • ')||'warming up'}<br><div style="margin-top:8px;display:flex;gap:8px"><button class="btn btn-primary" onclick="try{VHPastModern.computeClosest();}catch(e){} location.reload()">Retry</button><button class="btn" onclick="document.getElementById('result').style.display='none'">Keep playing</button></div></div></div>`;
      return;
    }
    // v42 hardened: safe mapping for top 5, handles missing m/sim
    const sortedTop=(list||[]).slice(0,5).map((o,i)=>{
      try{
        const name = o && o.m && o.m.n ? o.m.n : '—';
        const sim = (o && typeof o.sim==='number') ? o.sim : 0;
        return `${i+1}. ${name} ${(sim*100).toFixed(0)}%`;
      }catch{ return `${i+1}. —`; }
    }).join(' • ');

    /* Gap 10 fix: the reveal is a dead end no more. Deep links for the twin:
       dossier via the players directory search (?q=), atlas via the ?id=
       P-index deep link the atlas already reads on load (search-lite order). */
    function twinLinks(){
      try{
        var tn=(closest.entry.n||'').replace(/</g,'&lt;');
        var links='<a href="/players?q='+encodeURIComponent(closest.entry.n||'')+'">Open '+tn+' dossier \u2192</a>';
        var pidx=-1;
        try{
          var sl=VHPastModern.state().searchLite, arr=sl&&(sl.players||sl);
          if(arr) for(var k=0;k<arr.length;k++){ if(arr[k]&&arr[k].i===closest.entry.i){ pidx=k; break; } }
        }catch(e){}
        if(pidx>=0) links+='<a href="/?id='+pidx+'#atlas">See '+(closest.entry.s||'').replace(/</g,'&lt;')+' on the atlas \u2192</a>';
        return '<div style="margin-top:10px;display:flex;gap:16px;flex-wrap:wrap;font-size:13px">'+links+'</div>';
      }catch(e){ return ''; }
    }
    var twinLinksHtml=twinLinks();

      if(won){
        // Random and Challenge wins never touch the streak — Daily Court only,
        // as the mode tabs promise
        if(st.isDaily){
          try{
            const dailyState=VHPastModern.getDailyState();
            if(dailyState.solved>=1 || G.guesses.some(g=>g.rank===0)) { VHPastModern.onDailyWin(st.dayKey); }
          }catch{}
          try{ if(window.VHGameMechanics&&VHGameMechanics.collectTwin&&st.target) VHGameMechanics.collectTwin(st.target.n, st.target.s); }catch{}
        }
        // pill reads the honest v2 streak — the old loadStreak()+1 inflated it
        // on every render, including plain reloads of already-solved slots
        const sNow=v2Streak();
        const pill=$('#streak-pill');
        if(pill){
          const prev=parseInt((pill.textContent||'').replace(/\D/g,''),10)||0;
          pill.textContent='streak '+sNow;
          pill.title='Best: '+v2StreakBest()+' days — Daily Court + Daily Triple share one streak';
          if(sNow>prev){ pill.classList.remove('tick'); void pill.offsetWidth; pill.classList.add('tick'); }
        }
        if(celebrateNew){
          // streak chime lands after the win arpeggio — a cascade, not a pile
          try{ if(window.VHAudio) setTimeout(()=>VHAudio.play('streak'), 950); }catch{}
        }
        resEl.innerHTML=`<div class="card" style="border-color:var(--green)"><h3 class="hd">✅ Solved in ${G.guesses.length}/6 — ${st.target.n} → ${closest.entry.n}</h3>${window.VHGameMechanics?`<div class="result-stars" aria-label="${VHGameMechanics.starsFor(G.guesses.length,6)} of 3 stars">${VHGameMechanics.starsHTML(VHGameMechanics.starsFor(G.guesses.length,6))}</div>`:''}<div style="font-size:13px">Answer: ${closest.entry.n} ${closest.entry.s} ${(closest.sim*100).toFixed(1)}%<br>Top 5: ${sortedTop}</div>${twinLinksHtml}<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" id="btn-next-slot">Next slot →</button><button class="btn" id="btn-view-court">View court</button></div></div>`;
        if(celebrateNew) celebrateWin();
      } else {
        try{ if(window.VHAudio) VHAudio.play('reveal'); }catch{}
        // "solve 1 to save streak": a fully-resolved day with zero solves breaks it
        if(st.isDaily && st.dayKey===st.todayKey){
          try{
            const ds=VHPastModern.getDailyState();
            const slots=ds.slotResults||[];
            const allResolved=slots.length===(st.dailyTotal||5) && slots.every(sr=>sr&&(((sr.guesses||[]).some(g=>g.rank===0))||((sr.guesses||[]).length>=6)));
            if(allResolved && (ds.solved||0)===0){
              VHPastModern.onDailyLoss(st.dayKey);
              updateStreakPills();
            }
          }catch{}
        }
        resEl.innerHTML=`<div class="card" style="border-color:var(--verm)"><h3 class="hd">❌ Revealed — ${st.target.n} → ${closest.entry.n}</h3><div style="font-size:13px">Closest: ${closest.entry.n} ${(closest.sim*100).toFixed(1)}%<br>Top 5: ${sortedTop}</div>${twinLinksHtml}<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" id="btn-next-slot">Next slot →</button><button class="btn" id="btn-view-court">View court</button></div></div>`;
      }
      const nextSlotBtn=document.getElementById('btn-next-slot');
      if(nextSlotBtn){ nextSlotBtn.addEventListener('click',()=>{
        const st=VHPastModern.state(); const courtN=st.dailyTotal||5; let next=(st.dailySlot+1)%courtN;
        for(let i=0;i<courtN;i++){ const cand=(st.dailySlot+1+i)%courtN; try{ const raw=localStorage.getItem(dailySlotKey(st.dayKey,cand)); if(!raw){ next=cand; break; } const j=JSON.parse(raw); const won=(j.guesses||[]).some(g=>g.rank===0); const over=(j.guesses||[]).length>=6; if(!won&&!over){ next=cand; break; } }catch{} }
        const url=new URL(location.href); url.searchParams.set('slot', next); url.searchParams.delete('pack'); url.searchParams.delete('s'); location.href=url.toString();
      }); }
      const viewCourtBtn=document.getElementById('btn-view-court'); if(viewCourtBtn){ viewCourtBtn.addEventListener('click',()=>{ 
        const el=document.getElementById('daily-court')||document.getElementById('game-header');
        if(!el) return;
        try{ if(el.style.display==='none'){ el.style.display='block'; renderDailyCourt(); } }catch{}
        const y=el.getBoundingClientRect().top + window.pageYOffset - 10;
        window.scrollTo({top:y, behavior:'smooth'});
        // fallback
        setTimeout(()=>{ try{ el.scrollIntoView({behavior:'smooth', block:'start'}); }catch{} }, 50);
      }); }
    const hintEl=$('#past-closest-hint'); if(hintEl&&closest){ hintEl.style.display='block'; hintEl.textContent=`Answer: ${closest.entry.n} ${(closest.sim*100).toFixed(0)}% — ${won?'won':'over'}`; hintEl.style.background='#fff'; hintEl.style.border='1.4px dashed var(--ink)'; hintEl.style.borderRadius='8px'; hintEl.style.padding='6px 8px'; }
    projectFrame(); draw(); updateStatusBar(); renderDailyCourt();
    try{ if(window.VHTwinExplainer && VHTwinExplainer.onReveal) VHTwinExplainer.onReveal(); }catch(e){}
  }

  // inline, non-blocking guess feedback — alert() on mobile reads as "the game broke"
  let pendingGuess=null;

  /* Crash breadcrumbs.
     The Aw-Snap on guess is a renderer crash, so nothing in memory survives it
     and the try/catch in doGuess never sees it — the process is simply gone.
     localStorage does survive. Stamping the step we are about to attempt means
     the next load can say which one died, which is the one thing we have not
     been able to learn from the outside. Cleared on a clean finish, so a
     leftover crumb always means "this step did not return". */
  const VH_CRUMB='vh:guess-crumb';
  function crumb(step, extra){
    try{ localStorage.setItem(VH_CRUMB, JSON.stringify({
      step, extra: extra===undefined?null:extra,
      guesses: (G&&G.guesses)?G.guesses.length:0,
      w: window.innerWidth, h: window.innerHeight,
      dpr: window.devicePixelRatio||1,
      mem: (navigator.deviceMemory||null),
      at: new Date().toISOString()
    })); }catch{}
  }
  function crumbClear(){ try{ localStorage.removeItem(VH_CRUMB); }catch{} }
  function crumbReport(){
    try{
      const raw=localStorage.getItem(VH_CRUMB); if(!raw) return;
      localStorage.removeItem(VH_CRUMB);
      const c=JSON.parse(raw);
      console.warn('[vh] previous guess did not finish — died at step:', c.step, c);
      try{ if(window.VHErrorBoundary) VHErrorBoundary.log({type:'crash-crumb',
        message:'guess died at step '+c.step, stack:JSON.stringify(c)}); }catch{}

      /* A banner, not the status line. This is the only channel that survives
         the crash, it has to be read on a phone, and the status line sits
         behind the intro sheet on a fresh load. Fixed, top, and it stays up
         until it is dismissed. */
      const bar=document.createElement('div');
      bar.setAttribute('role','status');
      bar.style.cssText='position:fixed;left:0;right:0;top:0;z-index:99999;'+
        'background:#1A150F;color:#FFFEF7;font:700 13px/1.45 ui-monospace,monospace;'+
        'padding:10px 44px 10px 12px;border-bottom:3px solid #D55E00;'+
        'box-shadow:0 3px 0 rgba(0,0,0,.35);word-break:break-word';
      bar.textContent='Last guess stopped at: '+c.step+
        '  ·  '+(c.w||'?')+'x'+(c.h||'?')+' dpr'+(c.dpr||'?')+
        (c.mem?(' · '+c.mem+'GB'):'')+' · after '+(c.guesses||0)+' guesses';
      const x=document.createElement('button');
      x.textContent='x';
      x.setAttribute('aria-label','Dismiss');
      x.style.cssText='position:absolute;right:8px;top:6px;width:30px;height:30px;'+
        'background:transparent;color:#FFFEF7;border:2px solid #FFFEF7;border-radius:6px;'+
        'font:700 13px ui-monospace,monospace;cursor:pointer';
      x.addEventListener('click',()=>bar.remove());
      bar.appendChild(x);
      const mount=()=>document.body && document.body.appendChild(bar);
      if(document.body) mount(); else document.addEventListener('DOMContentLoaded',mount);
    }catch{}
  }

  function setGuessStatus(msg, tone){
    try{
      let el=document.getElementById('guess-status');
      if(!el){
        const anchor=document.querySelector('.suggest'); if(!anchor) return;
        el=document.createElement('div');
        el.id='guess-status'; el.className='small-mono';
        el.setAttribute('role','status'); el.setAttribute('aria-live','polite');
        el.style.cssText='margin-top:6px;font-size:11px;font-weight:800;text-transform:none;display:none';
        anchor.insertAdjacentElement('afterend', el);
      }
      clearTimeout(el._t);
      if(!msg){ el.style.display='none'; el.textContent=''; return; }
      el.textContent=msg;
      el.style.color = tone==='warn' ? '#D55E00' : '#1A150F';
      el.style.display='block';
      if(tone!=='sticky') el._t=setTimeout(()=>{ el.style.display='none'; }, 4000);
    }catch{}
  }
  // tiny shake on the guess input for rejected guesses — felt, not read
  function nudgeInput(){
    try{
      const input=$('#guess-input'); if(!input||input.disabled) return;
      input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
    }catch{}
  }
  // single source of truth for whether the guess box is live: locked once the
  // slot is won or the 6 tries are spent; the ready banner hides after guess 1
  function syncGuessInput(){
    try{
      const input=$('#guess-input'), btn=$('#guess-btn');
      const st0=(window.VHPastModern && VHPastModern.state)?VHPastModern.state():null;
      const won=(G.guesses||[]).some(g=>g.rank===0);
      const over=won||(G.guesses||[]).length>=6;
      if(input){
        input.disabled=over;
        input.placeholder=over?(won?'Solved — pick another slot':'Answer revealed below'):'Type modern — e.g., Wembanyama, SGA, Ant';
      }
      if(btn){ btn.disabled=over; }
      const rb=$('#ready-banner'); if(rb) rb.style.display=(G.guesses||[]).length?'none':'';
    }catch{}
  }
  function v2Streak(){ try{ return VHPastModern.getStreak().streak||0; }catch{ return 0; } }
  function v2StreakBest(){ try{ const g=VHPastModern.getStreak(); return g.best||g.streak||0; }catch{ return 0; } }
  /* Streak display only — reads vh.streak.v2, never writes it. */
  function updateStreakPills(){
    const cur=v2Streak(), best=v2StreakBest();
    const pill=$('#streak-pill');
    if(pill){ pill.textContent='streak '+cur; pill.title='Best: '+best+' days — Daily Court + Daily Triple share one streak'; }
    const court=$('#court-streak-pill');
    if(court){ court.textContent='🔥 streak '+cur; court.title='Best: '+best+' days — Daily Court + Daily Triple share one streak'; }
  }
  // --- multi-choice grid (replaces the typeahead; removes the RESULT_CODE_HUNG path) ---
  let _gridCandidates=null, _gridTargetKey=null;
  function _seededShuffle(arr, seed){
    const a=arr.slice(); let s=(seed>>>0)||1;
    const rnd=()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; };
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; }
    return a;
  }
  function buildGridCandidates(){
    try{
      const st=VHPastModern.state(); const list=st&&st.modernListSorted||[];
      if(list.length<6) return null;
      const seed=(st.target&&st.target.i)||1;
      const twin=list[0];                       // rank 0 = the correct modern twin
      const contenders=list.slice(1,4);         // 3 close decoys (same neighborhood)
      const fillerPool=_seededShuffle(list.slice(18), seed);  // far-away, clearly different
      const used=new Set([twin.m.i, ...contenders.map(c=>c.m.i)]);
      const filler=[];
      for(const f of fillerPool){ if(filler.length>=5) break; if(f&&f.m&&!used.has(f.m.i)){ filler.push(f); used.add(f.m.i); } }
      return _seededShuffle([twin, ...contenders, ...filler].filter(Boolean), seed^0x5bd1e995).map(x=>x.m);
    }catch(e){ console.warn('buildGridCandidates fail', e); return null; }
  }
  function renderGuessGrid(){
    const grid=$('#guess-grid'); if(!grid) return;
    try{
      const st=VHPastModern.state();
      if(!st||!st.rankingReady){ grid.innerHTML='<div class="grid-loading">Loading players…</div>'; return; }
      const key=st.targetIdx;
      if(!_gridCandidates||_gridTargetKey!==key){ _gridCandidates=buildGridCandidates(); _gridTargetKey=key; }
      if(!_gridCandidates){ grid.innerHTML='<div class="grid-loading">Loading players…</div>'; return; }
      const byId=new Map((G.guesses||[]).map(g=>[g.idx,g]));
      const won=(G.guesses||[]).some(g=>g.rank===0);
      const over=won||(G.guesses||[]).length>=6;
      grid.textContent='';
      const frag=document.createDocumentFragment();
      for(const m of _gridCandidates){
        const g=byId.get(m.i);
        const btn=document.createElement('button'); btn.type='button'; btn.className='guess-tile';
        const c=(typeof m.c==='number')?m.c:0;
        if(g){ btn.classList.add('is-picked'); if(g.rank===0) btn.classList.add('is-twin'); }
        if(over||g) btn.disabled=true;
        const dot=document.createElement('span'); dot.className='tile-dot'; dot.style.background=OKABE[c%8];
        const nm=document.createElement('span'); nm.className='tile-name'; nm.textContent=m.n||'';
        btn.appendChild(dot); btn.appendChild(nm);
        if(g){ const rk=document.createElement('span'); rk.className='tile-rank'; rk.textContent=(g.rank===0)?'✓ twin':('#'+(g.rank+1)+' close'); btn.appendChild(rk); }
        if(!g&&!over){ btn.addEventListener('click', ()=>{ if(btn.disabled) return; btn.disabled=true; doGuess(m.n); }); }
        frag.appendChild(btn);
      }
      grid.appendChild(frag);
    }catch(e){ console.warn('renderGuessGrid fail', e); }
  }

  function doGuess(nameArg){
    try{
      const input=$('#guess-input');
      const st0=(window.VHPastModern && VHPastModern.state)?VHPastModern.state():null;
      // the slot is decided — no more guesses after a win or 6 tries
      const _gWon=(G.guesses||[]).some(g=>g.rank===0);
      if(_gWon || (G.guesses||[]).length>=6){
        setGuessStatus(_gWon?'Already solved — pick another slot':'No guesses left — answer revealed below','warn');
        nudgeInput();
        return;
      }
      const fromInput = nameArg==null;
      const name=((fromInput ? (input&&input.value) : nameArg)||'').trim(); if(!name) return;
      if(name.length<2){ setGuessStatus('Type at least 2 letters','warn'); nudgeInput(); return; }
      const low=name.toLowerCase(); const mm=name.match(/^(.+?)\s+\d{4}-\d{2}$/); const low2=mm? mm[1].trim().toLowerCase(): low;
      if(G.guesses.some(g=>{ try{return (g.name||'').toLowerCase().trim()===low2;}catch{return false;}})){ setGuessStatus('Already guessed','warn'); nudgeInput(); if(fromInput&&input) input.value=''; return; }
      // scoring runs against the whole pool, so it is stamped too
      crumb('score', name);
      const r=VHPastModern.guessModern(name);
      if(!r.ok){
        crumbClear();
        if(r.pending){
          pendingGuess=name;
          setGuessStatus('Scoring "'+name+'" as soon as the model finishes loading…','sticky');
          return;
        }
        setGuessStatus(r.reason||'Guess failed — try another','warn'); nudgeInput(); return;
      }
      if(G.guesses.some(g=>{ try{return g.idx===r.guess.idx|| (g.name||'').toLowerCase().trim()===r.guess.name.toLowerCase().trim();}catch{return false;}})){ crumbClear(); setGuessStatus('Already guessed','warn'); nudgeInput(); if(fromInput&&input) input.value=''; return; }
      setGuessStatus('');
      G.guesses.push(r.guess); try{ VHPastModern.state().guesses=G.guesses.slice(); }catch{} saveGuesses(); if(fromInput&&input) input.value='';
      G._animateNew=true;
      const warmEl=$('#warm-label'); let wc=null; try{ wc=VHPastModern.warmCold(); }catch{}
      if(wc&&G.guesses.length>1){ if(warmEl){ warmEl.style.display='inline-flex'; if(warmEl.textContent!==wc){ warmEl.textContent=wc; warmEl.classList.remove('pop'); void warmEl.offsetWidth; warmEl.classList.add('pop'); } }} else { if(warmEl) warmEl.style.display='none'; }
      // Each step is stamped before it runs; whichever stamp survives a crash
      // is the step that killed the renderer.
      crumb('renderGuesses');  renderGuesses();
      crumb('finish');         finish({celebrate: !!r.isWin});
      crumb('draw');           projectFrame(); draw();
      // game feel: guess blip + pulse the guessed dot, ease the camera to it
      // (the win arpeggio is staged in finish() so the two never overlap)
      try{ if(window.VHAudio) VHAudio.play('guess'); }catch{}
      try{ if(sharedMapApi && sharedMapApi.pulseGuess && r.guess) sharedMapApi.pulseGuess(r.guess.idx); }catch{}
      crumb('packProgress');   renderPackProgress();
      crumb('guessGrid');      renderGuessGrid();
      crumbClear();
    }catch(e){
      // a caught exception is not the crash we are chasing, so drop the crumb
      crumbClear();
      console.warn('doGuess fail', e);
      try{ if(window.VHErrorBoundary) VHErrorBoundary.log({type:'js', message:'doGuess '+e.message, stack:e.stack}); }catch{}
      setGuessStatus('Guess failed — try another (error logged)','warn');
    }
  }
  // a guess made before scoring was ready auto-submits the moment it is
  window.addEventListener('vh:ranking-ready', ()=>{
    try{
      renderGuessGrid();
      // If a completed slot's reveal is showing the loading state, re-render with real data
      try{ if(typeof finish==='function') finish(); }catch(e){}
      if(pendingGuess){ const n=pendingGuess; pendingGuess=null; setGuessStatus(''); doGuess(n); }
      else { projectFrame(); draw(); }
    }catch(e){ console.warn('ranking-ready flush fail', e); }
  });

  async function main(){
    // if the last guess never finished, say which step it was on
    crumbReport();
    // shared-map handles resize/drag/hover/pause internally — legacy listeners removed
    window.addEventListener('resize',()=>{ try{ resize(); }catch{} },{passive:true});


    // load watchdog: if the court is not usable within 12s, say so and offer
    // a reload. (The v47 watchdog relabelled a dead court 'Ready', which hid
    // a total init failure behind a playable-looking screen.)
    let loadingWatchdog = setTimeout(()=>{ try{ if(!courtReady) markCourtFailed(); }catch{} }, 12000);

    let st=null;
    let initOk=false;
    try{
      // race init with 6s timeout so court never blocks forever
      const initP = VHPastModern.init();
      const timeoutP = new Promise((_,rej)=>setTimeout(()=>rej(new Error('init timeout 6s')),6000));
      await Promise.race([initP, timeoutP]);
      initOk=true;
    }catch(e){ console.warn('init fallback v47', e); }
    try{ st=VHPastModern.state(); }catch(e){ st={searchLite:{players:[]}}; }
    try{ ensureModernLower(); }catch(e){ console.warn('modern pool seed fail', e); }
    try{ clearTimeout(loadingWatchdog); }catch{} 
    // focus camera on target before first projection so star starts centered
    try{ focusOnTarget(); }catch{}
    try{ projectFrame(); }catch(e){ console.warn(e); }
    try{ draw(); }catch(e){ console.warn(e); }
    try{ if(!initOk || !st || !(st.dailyPool && st.dailyPool.length)) markCourtFailed(); }catch{}

    // v47 hardened continuation — even if earlier failed, force UI to usable state
    try{
      // v42: if MTNN was fallback, recompute when real embeddings load
      window.addEventListener('vh:mtnn-loaded', ()=>{
        try{
          if(window.VHMtnn && VHMtnn.isReady && VHMtnn.isReady()){
            VHPastModern.computeClosest();
            // re-render closest hint if already finished
            try{ finish(); }catch{}
            projectFrame(); draw();
          }
        }catch(e){ console.warn('mtnn-loaded recompute fail', e); }
      });
    }catch{}

    // v16 worker + cache embed: offload search
    try{
      searchWorker=initSearchWorker();
      if(searchWorker && st.modernPool){
        searchWorker.postMessage({type:'init', payload:{pool: st.modernPool}});
      }
    }catch{}
    try{ attachSuggest(); }catch(e){ console.warn('attachSuggest fail', e); }
    try{ initSoundToggle(); }catch(e){ console.warn('sound toggle fail', e); }

    let mode='daily'; if(st.isRandom) mode='random'; else if(st.isTriple) mode='triple';
    if(mode==='triple'){ const md=$('#mode-desc'); if(md) md.textContent='Daily Triple: 3 fixed puzzles per day — the lighter court (the retired Everyday game, folded in). It shares the Daily Court streak: solve 1 to keep your streak alive.'; }
    document.querySelectorAll('.mode-tab').forEach(btn=>{ const m=btn.dataset.mode; if(m===mode) btn.classList.add('is-active'); else btn.classList.remove('is-active'); });
    document.querySelectorAll('.mode-tab').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const m=btn.dataset.mode;
        if(m==='random'){ const p=VHPastModern.pickRandomPast(); location.href='/play?mode=random&r='+p.i; return; }
        if(m==='daily'){ location.href='/play'; return; }
        if(m==='triple'){ location.href='/play?mode=triple'; return; }
      });
    });

    renderDailyCourt();
    renderPackRetired();
    window.addEventListener('vh-daily-ip',()=>{ renderDailyCourt(); });

    const saved=loadGuesses();
    if(saved.length){ G.guesses=saved.slice(); try{ VHPastModern.state().guesses=saved.slice(); }catch{} }
    else { G.guesses=[]; }

    renderPast(); renderGuesses(); finish(); renderDailyCourt();

    /* (Removed: wirePlayForecast — it returned immediately because
       window.HoopsForecast is defined nowhere; the forecast exhibit
       lives on Methods, wired as a real module import.) */

    const onboardSeen=localStorage.getItem('vh.onboardSeenV3');
    const backdrop=$('#onboarding-backdrop');
    function openOnboard(){ if(backdrop){ backdrop.hidden=false; document.body.style.overflow='hidden'; } }
    function closeOnboard(){ if(backdrop){ backdrop.hidden=true; document.body.style.overflow=''; } try{ localStorage.setItem('vh.onboardSeenV3','1'); }catch{} }
    if(!onboardSeen){ setTimeout(openOnboard, 700); }
    $('#btn-howto')?.addEventListener('click', openOnboard);
    $('#btn-onboard-close')?.addEventListener('click', closeOnboard);
    $('#btn-onboard-play')?.addEventListener('click', ()=>{ closeOnboard(); $('#guess-input')?.focus(); });
    $('#btn-onboard-random')?.addEventListener('click', ()=>{ closeOnboard(); const p=VHPastModern.pickRandomPast(); location.href='/play?mode=random&r='+p.i; });
    backdrop?.addEventListener('click', e=>{ if(e.target===backdrop) closeOnboard(); });

    $('#btn-focus-guess')?.addEventListener('click', ()=>{ $('#guess-input')?.focus(); window.scrollTo({top: $('#guess-card').offsetTop-20, behavior:'smooth'}); });
    $('#guess-btn')?.addEventListener('click', ()=>{ if(typeof doGuess==='function') doGuess(); });
    $('#guess-input')?.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); if(typeof doGuess==='function') doGuess(); } });
    // grid mode: tiles call doGuess(name) directly
    $('#btn-random').addEventListener('click', ()=>{ const p=VHPastModern.pickRandomPast(); location.href='/play?mode=random&r='+p.i; });
    $('#btn-new').addEventListener('click', ()=>{ location.href='/play'; });
    $('#btn-copy-court')?.addEventListener('click', async ()=>{
      const s=VHPastModern.state(); const url=location.origin+'/play?day='+s.dayKey; const court=s.dailyPool.map((p,i)=>`${i+1}. ${p.n} ${p.s}`).join('\n'); const text=`Daily Court ${s.dayKey} — 5 puzzles\n${court}\n${url}`; try{ await navigator.clipboard.writeText(text); const b=$('#btn-copy-court'); b.textContent='Copied!'; setTimeout(()=>b.textContent='📋 Copy court',1200); }catch{ prompt('Copy', text); }
    });
    $('#share-btn').addEventListener('click', async ()=>{
      const s=VHPastModern.state();
      if(s.isDaily){
        const dailyState=VHPastModern.getDailyState(); const opts={dayKey:s.dayKey, pool:s.dailyPool, slotResults:dailyState.slotResults, solved:dailyState.solved, total:dailyState.total||s.dailyPool.length, totalGuesses:dailyState.totalGuesses, streak:v2Streak(), mode:s.isTriple?'triple':'court', url:location.origin+'/play?day='+s.dayKey+(s.isTriple?'&mode=triple':'')};
        if(window.VHShare&&VHShare.shareDailyCourt){ await VHShare.shareDailyCourt(opts); return; }
      }
      const won=G.guesses.some(g=>g.rank===0);
      const opts={puzzleNum:s.puzzleNum, dayKey:s.dayKey, pastName:s.target.n, pastSeason:s.target.s, guesses:G.guesses, answerName:s.closestModern? s.closestModern.entry.n: '', answerSim:s.closestModern? s.closestModern.sim:0, won:won, streak:v2Streak(), url:location.origin+'/play?day='+s.dayKey+'&slot='+s.dailySlot};
      if(window.VHShare&&window.VHShare.sharePastModern) await window.VHShare.sharePastModern(opts);
    });
    $('#share-text-btn').addEventListener('click', ()=>{
      const s=VHPastModern.state();
      const won=G.guesses.some(g=>g.rank===0);
      if(s.isDaily){
        const dailyState=VHPastModern.getDailyState(); const lines=s.dailyPool.map((p,i)=>{ const sd=dailyState.slotResults[i]; const status=sd? (sd.won? `✅ ${sd.cnt}/6` : `❌ ${sd.cnt}/6`): '⬜'; return `${status} Slot ${i+1}: ${p.n}`; }).join('\n');
        const text=`${s.isTriple?'Daily Triple':'Daily Court'} ${s.dayKey} — ${dailyState.solved}/${dailyState.total} in ${dailyState.totalGuesses} guesses${v2Streak()>0?`\n🔥 ${v2Streak()}-day streak`:''}\n${lines}\n${location.origin}/play?day=${s.dayKey}${s.isTriple?'&mode=triple':''}`; navigator.clipboard.writeText(text).then(()=>{ const b=$('#share-text-btn'); b.textContent='Copied'; setTimeout(()=>b.textContent='Copy Grid',1200); });
        return;
      }
      const grid=G.guesses.map(g=> g.rank===0?'🟩': g.rank<=3?'🟨':'⬜').join(''); const lines=G.guesses.map((g,i)=>`${i+1}. ${g.name} ${(g.sim*100).toFixed(0)}% #${g.rank+1}`).join('\n'); const text=`Vector Hoops P#${s.puzzleNum} ${s.dayKey} ${won?G.guesses.length+'/6':'X/6'} ${grid}\nPast ${s.target.n} → ${won?G.guesses.slice(-1)[0].name:'?'}\n${lines}\n${location.origin}/play?day=${s.dayKey}&slot=${s.dailySlot}`; navigator.clipboard.writeText(text).then(()=>{ const b=$('#share-text-btn'); b.textContent='Copied'; setTimeout(()=>b.textContent='Copy Grid',1200); });
    });
    $('#btn-challenge').addEventListener('click', async function(){
      const s=VHPastModern.state();
      const url=location.origin+'/play?day='+s.dayKey+(s.isDaily? `&slot=${s.dailySlot}`:''); const txt=`Can you beat my Daily Court ${s.dayKey}? Slot ${s.dailySlot+1} ${s.target.n} — ${url}`; try{ await navigator.clipboard.writeText(txt); this.textContent='Copied'; setTimeout(()=>this.textContent='Challenge',1200); }catch{ alert(url); }
    });
  }
  main().catch(e=>{ console.error(e); const inv=$('#boot-error'); if(inv){ inv.style.display='block'; inv.innerHTML=`<div class="small-mono" style="color:var(--verm)">Error</div><h3>${e.message}</h3><pre style="white-space:pre-wrap;font-size:11px">${e.stack||''}</pre>`; } });
})();
