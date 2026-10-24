(function(){
  const $=s=>document.querySelector(s);
  /* confetti colours come from the atlas tokens, read at burst time (no hex in the engine) */
  const CONFETTI_TOKENS=['--accent','--ok','--coin-1','--blue','--data-terra','--pipe'];
  const ARCH=["Glass+Rim","LowVol Glass","Low Impact 3P Vol","Def Glass+Rim FT","Vol+3P Vol","3P Acc+Vol","Playmaking+Steals","Scoring Vol"];
  let G={guesses:[]};
  // player names and seasons are data: escape them before they meet innerHTML
  const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  /* One focus contract for every sheet on /play (How to play, share, copy-blocked):
     the page behind goes inert, Tab and Shift+Tab wrap inside the sheet, Escape
     closes it, and focus goes back to whatever opened it. Returns release(). The
     backdrop is marked data-sheet-managed so keyboard-a11y.js leaves it alone. */
  function sheetFocus(backdrop, onEscape){
    const opener=document.activeElement;
    const sheet=backdrop.querySelector('.sheet')||backdrop;
    backdrop.setAttribute('data-sheet-managed','');
    const inerted=[];
    Array.from(document.body.children).forEach(el=>{
      if(el===backdrop||el.contains(backdrop)||el.tagName==='SCRIPT'||el.classList.contains('toast')||el.inert) return;
      el.inert=true; inerted.push(el);
    });
    document.body.classList.add('is-sheet-open');
    const focusables=()=>Array.from(sheet.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea,select,[tabindex]:not([tabindex="-1"])')).filter(n=>!n.closest('[hidden]'));
    function onKey(e){
      if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); onEscape(); return; }
      if(e.key!=='Tab') return;
      const f=focusables(); if(!f.length){ e.preventDefault(); return; }
      const first=f[0], last=f[f.length-1], inside=sheet.contains(document.activeElement);
      if(e.shiftKey && (!inside || document.activeElement===first)){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && (!inside || document.activeElement===last)){ e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    try{ (sheet.querySelector('.sheet__close')||focusables()[0])?.focus(); }catch{}
    let released=false;
    return function release(){
      if(released) return; released=true;
      document.removeEventListener('keydown', onKey, true);
      inerted.forEach(el=>{ el.inert=false; });
      document.body.classList.remove('is-sheet-open');
      try{ if(opener && opener.focus && document.contains(opener)) opener.focus(); }catch{}
    };
  }
  window.VHSheetFocus=sheetFocus;
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
  // --- the map: the one atlas component (Embed3D, variant 'game') ---
  // Ids line up end to end: embed3d.json row i == vectors.json row i == the
  // game's target.i / guess.idx, so rings and the target need no mapping and
  // every one of the 12,966 player-seasons is on the map (no lite sample).
  let playMap=null;
  let _mapKey=null, _mapTarget=null;
  // guess rings: the same warmer/colder rule renderGuesses() prints, so the
  // list and the map never disagree; the winning guess is the 'exact' ring,
  // and a first guess or a same-similarity guess is the neutral 'guess' ring
  function ringsFor(guesses){
    const out=[];
    (guesses||[]).forEach((g,idx)=>{
      if(!g||g.idx==null) return;
      if(g.rank===0){ out.push({id:g.idx, kind:'exact'}); return; }
      const sim=(typeof g.sim==='number'&&!isNaN(g.sim))?g.sim:0;
      const p=idx>0?guesses[idx-1]:null;
      const prev=(p&&typeof p.sim==='number'&&!isNaN(p.sim))?p.sim:sim;
      out.push({id:g.idx, kind:idx===0?'guess':sim>prev?'warm':sim<prev?'cold':'guess'});
    });
    return out;
  }
  // push the target (selection) and the guess rings to the map; cheap and
  // idempotent, so every render path can call it
  function syncMap(){
    try{
      if(!playMap) return;
      const st=(window.VHPastModern && VHPastModern.state)?VHPastModern.state():null;
      const tid=(st&&st.target&&typeof st.target.i==='number')?st.target.i:null;
      const rings=ringsFor(G&&G.guesses);
      const key=tid+'|'+rings.map(r=>r.id+':'+r.kind).join(',');
      if(key===_mapKey) return;
      _mapKey=key;
      if(tid!==_mapTarget){
        // a new slot: lifeline spotlights (Twin Reveal, Era Lock) belong to the old one
        _mapTarget=tid;
        playMap.setHighlight([]); playMap.setDim(null);
      }
      playMap.setSelected(tid);
      playMap.overlay(rings);
    }catch(e){ console.warn('syncMap fail', e); }
  }
  // tap a dot: an eligible modern player fills the guess box (never auto-submits)
  function pickFromMap(id){
    try{
      const inf=playMap&&playMap.info(id); if(!inf) return;
      const st=VHPastModern.state();
      const over=(G.guesses||[]).some(g=>g.rank===0)||(G.guesses||[]).length>=6;
      const modern=(st&&st.modernPool||[]).find(m=>m&&m.i===id);
      const input=$('#guess-input');
      if(modern && !over && input && !input.disabled){
        input.value=modern.n; input.focus();
        setGuessStatus('Picked '+modern.n+' on the map. Press Guess to lock it in.');
        return;
      }
      setGuessStatus(inf.name+' '+inf.season+(modern?'':' is not one of this season’s eligible players'));
    }catch(e){}
  }
  function mountGameMap(waited){
    try{
      const host=document.getElementById('play-map'); if(!host) return;
      if(!window.Embed3D){
        if((waited||0)<8000) setTimeout(()=>mountGameMap((waited||0)+100), 100);
        return;
      }
      playMap=window.Embed3D.mount(host,{variant:'game', height:380, onSelect:pickFromMap, selectedLabel:'Past All-Star'});
      window.VHPlayMap=playMap; // game-mechanics.js lifelines spotlight through it
      _mapKey=null; _mapTarget=null; syncMap();
    }catch(e){ console.warn('mountGameMap fail',e); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', ()=>mountGameMap(0));
  else mountGameMap(0);
  window.addEventListener('vh:game-state-changed', syncMap);


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
  let _searchIndex=null, _ineligibleIndex=null;
  function buildSearchIndex(){
    const st=(window.VHPastModern && VHPastModern.state) ? VHPastModern.state() : null;
    const pool=st && st.modernPool;
    if(!pool || !pool.length) return null;
    _searchIndex=[];
    const eligibleNames=new Set();
    for(let i=0;i<pool.length;i++){ const m=pool[i]; if(m&&m.n){ _searchIndex.push({ref:m, lower:m.n.toLowerCase()}); eligibleNames.add(m.n.toLowerCase()); } }
    // v4 manners: also index recognizable INELIGIBLE names (search-lite rows
    // with no 2025-26 season) so the picker can show them grayed with the
    // reason inline, instead of letting the user attempt them blind.
    // Full picker rebuild is out of scope; this is the honest interim.
    _ineligibleIndex=[];
    try{
      const sl=st.searchLite && st.searchLite.players;
      if(sl && sl.length){
        const latest=new Map(); // lower name -> row with latest season
        for(let i=0;i<sl.length;i++){
          const p=sl[i]; if(!p||!p.n) continue;
          const low=p.n.toLowerCase();
          if(eligibleNames.has(low)) continue;
          const ex=latest.get(low);
          if(!ex || String(p.s||'')>String(ex.s||'')) latest.set(low,p);
        }
        latest.forEach(function(p,low){ _ineligibleIndex.push({ref:p, lower:low}); });
      }
    }catch(e){ /* ineligible index is best-effort */ }
    return _searchIndex;
  }
  function filteredModern(q){
    q=(q||'').toLowerCase().trim();
    if(q.length<2) return [];
    try{
      const idx=_searchIndex || buildSearchIndex();
      if(!idx) return [];
      const out=[];
      for(let i=0;i<idx.length && out.length<8;i++){ if(idx[i].lower.indexOf(q)!==-1) out.push({m:idx[i].ref, eligible:true}); }
      // fill remaining rows with ineligible-but-recognizable names, grayed
      if(_ineligibleIndex && out.length<8){
        for(let i=0;i<_ineligibleIndex.length && out.length<8;i++){
          if(_ineligibleIndex[i].lower.indexOf(q)!==-1) out.push({m:_ineligibleIndex[i].ref, eligible:false, reason:'not a 2025-26 season'});
        }
      }
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
      // P1: zero silent dropdown failures — an empty result is a stated
      // state ("No matches"), never a dropdown that just doesn't open.
      if(!last.length){
        if(searchToken > 0 && input.value.trim().length >= 2){
          ul.innerHTML='<li class="no-results" aria-disabled="true">No matches — check the spelling, or try a last name</li>';
          ul.hidden=false;
        } else {
          ul.hidden=true;
        }
        for(const li of rowEls) li.hidden=true;
        return;
      }
      // restore the reusable rows (a no-results message may have replaced them)
      if(!ul.contains(rowEls[0])){ ul.innerHTML=''; for(const li of rowEls) ul.appendChild(li); }
      for(let i=0;i<ROWS;i++){
        const li=rowEls[i], e=last[i];
        if(!e){ li.hidden=true; continue; }
        const m=e.m||{};
        li.hidden=false;
        li.classList.toggle('is-active', i===active);
        li.classList.toggle('is-ineligible', !e.eligible);
        if(e.eligible){
          li.textContent=m.n+' '+(m.s||'');
          li.removeAttribute('aria-disabled');
        }else{
          // ineligible: grayed, inline reason, never attemptable
          li.textContent='';
          const nm=document.createElement('span'); nm.textContent=m.n+' '+(m.s||'');
          const why=document.createElement('span'); why.className='why'; why.textContent=' — '+(e.reason||'not guessable');
          li.appendChild(nm); li.appendChild(why);
          li.setAttribute('aria-disabled','true');
        }
      }
      ul.hidden=false;
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
    function nextEligible(from, dir){
      // arrow keys skip ineligible rows — they can never be attempted
      let i=from;
      for(let k=0;k<last.length;k++){ i+=dir; if(i<0||i>=last.length) return from; if(last[i]&&last[i].eligible) return i; }
      return from;
    }
    input.addEventListener('keydown',function(e){
      if(e.key==='ArrowDown'){ if(!last.length) return; e.preventDefault(); active=nextEligible(active,1); render(last); }
      else if(e.key==='ArrowUp'){ if(!last.length) return; e.preventDefault(); active=nextEligible(active,-1); render(last); }
      else if(e.key==='Enter'){
        const hasActive = active>=0 && last[active] && last[active].eligible;
        if(hasActive){ e.preventDefault(); input.value=last[active].m.n; ul.hidden=true; active=-1; doGuess(); return; }
        if((input.value||'').trim().length>=2){ e.preventDefault(); ul.hidden=true; doGuess(); }
      } else if(e.key==='Escape'){ ul.hidden=true; active=-1; }
    });
    ul.addEventListener('click',function(e){ const li=e.target.closest('li'); if(!li||li.hidden) return; const i=parseInt(li.dataset.i,10); const en=(!isNaN(i)&&last[i])?last[i]:null; if(en&&en.eligible){ input.value=en.m.n; ul.hidden=true; active=-1; doGuess(); } /* ineligible: no-op, never attempted */ });
    document.addEventListener('click',function(e){ if(!ul.contains(e.target)&&e.target!==input) ul.hidden=true; });
  }
  function dailyKey(){ try{ return VHPastModern.state().dayKey; }catch{ return new Date().toISOString().slice(0,10); } }
  function dailySlotKey(dayKey,slot){ try{ if(VHPastModern.state().isTriple) return `vh.triple.v1.${dayKey}.slot${slot}`; }catch{} return `vh.daily.v2.${dayKey}.slot${slot}`; }
  // --- append-only daily ledger (panel v3 G1): a recorded guess is never
  // removed or altered by a later write; concurrent writers merge by union.
  var VH_SID=(function(){ try{ return window.DailyLedger?DailyLedger.newSessionId():'s0'; }catch(e){ return 's0'; } })();
  var __ledger=null;
  function dailyLedger(){
    if(__ledger) return __ledger;
    try{ if(window.DailyLedger && window.localStorage) __ledger=DailyLedger.createLedger(window.localStorage); }catch(e){}
    return __ledger;
  }
  function loadGuesses(){
    try{
      const st=VHPastModern.state();
      if(st.isDaily||st.isChallenge){
        /* The ledger is the ONLY writer of Daily Court slot state (Lane A).
           Reads go through VHLedger.readSlot — mid-game reloads restore the
           guess history verbatim from the same store the ledger scored. */
        try{
          const mode=st.isTriple?'triple':'court';
          if(window.VHLedger){
            const rec=VHLedger.readSlot(st.dayKey, st.dailySlot||0, mode);
            if(rec&&rec.guesses) return rec.guesses.slice();
            return [];
          }
        }catch{ return []; }
        // degraded fallback (ledger script missing): same key format, direct read
        const k=dailySlotKey(st.dayKey, st.dailySlot||0);
        const L=dailyLedger();
        if(L){ return L.load(k, st.dayKey, st.dailySlot||0).guesses; }
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
        /* The ledger is the ONLY writer of Daily Court slot state (Lane A).
           On write failure the ledger reports ok:false and queues for retry —
           the streak pill shows "unsynced", never a stale number. */
        try{
          const mode=st.isTriple?'triple':'court';
          if(window.VHLedger){
            VHLedger.flush(); // retry any earlier queued write first
            const r=VHLedger.record(st.dayKey, st.dailySlot||0, {guesses:G.guesses}, mode);
            if(!r.ok && window.VHShare && VHShare.showToast) VHShare.showToast('\u26a0\uFE0F Couldn\u2019t sync \u2014 streak shows unsynced, retrying');
            updateStreakPills();
            return;
          }
        }catch{}
        // degraded fallback (ledger script missing): same key format, direct write
        const k=dailySlotKey(st.dayKey, st.dailySlot||0);
        const L=dailyLedger();
        if(L){ G.guesses=L.save(k, st.dayKey, st.dailySlot||0, G.guesses, VH_SID); }
        else localStorage.setItem(k, JSON.stringify({day:st.dayKey, slot:st.dailySlot, guesses:G.guesses}));
      } else {
        const L2=dailyLedger();
        if(L2){ G.guesses=L2.save('vh.pastmodern.v10', st.dayKey, null, G.guesses, VH_SID); }
        else localStorage.setItem('vh.pastmodern.v10', JSON.stringify({day:st.dayKey, guesses:G.guesses}));
      }
    }catch{}
  }
  function confettiBurst(){
    try{ if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; }catch{}
    const cv=$('#confetti-canvas'); if(!cv) return; const cs=getComputedStyle(document.documentElement); const pal=CONFETTI_TOKENS.map(t=>cs.getPropertyValue(t).trim()).filter(Boolean); if(!pal.length) return; cv.hidden=false; const ctx=cv.getContext('2d'); cv.width=innerWidth; cv.height=innerHeight; const parts=[]; for(let i=0;i<140;i++){ parts.push({x:Math.random()*cv.width, y:-20-Math.random()*100, vx:(Math.random()-0.5)*6, vy:Math.random()*4+2.5, r:Math.random()*6+3, c:pal[i%pal.length], a:1}); }
    const t0=performance.now(); function frame(t){ const dt=t-t0; ctx.clearRect(0,0,cv.width,cv.height); let alive=false; for(let i=0;i<parts.length;i++){ const p=parts[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.09; p.vx*=0.99; p.a-=0.005; if(p.a>0){ alive=true; ctx.globalAlpha=p.a; ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); } } ctx.globalAlpha=1; if(alive&&dt<4500) requestAnimationFrame(frame); else cv.hidden=true; } requestAnimationFrame(frame);
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
    const grid=$('#court-grid'), label=$('#court-day-label'), solvedEl=$('#court-solved'), guessesEl=$('#court-guesses'), lineupBar=$('#lineup-bar');
    const st=VHPastModern.state(); if(!st.dailyPool||!st.dailyPool.length){ $('#daily-court').hidden=true; return; }
    $('#daily-court').hidden=false;
    const dayKey=st.dayKey;
    if(label) label.textContent=dayKey + (st.todayKey && dayKey!==st.todayKey ? ' \u00B7 yesterday' : '');
    /* Lane A: the court board renders from VHLedger.read — the same records
       the ledger card, streak pill and share card render from. No parallel
       state, so the screen cannot disagree with the ledger. */
    const mode=st.isTriple?'triple':'court';
    let ledger=null;
    try{ ledger = window.VHLedger ? VHLedger.read(dayKey, mode, st.dailyPool.length) : null; }catch{ ledger=null; }
    const fmtLedger = (guesses)=>{
      try{ if(window.VHLedger) return VHLedger.fmtSlotScore({guesses:guesses||[]}, dayKey); }catch{}
      return null;
    };
    let totalSolved=0, totalGuesses=0;
    const slotData=[];
    for(let i=0;i<st.dailyPool.length;i++){
      try{
        const rec=ledger&&ledger.slots?ledger.slots[i]:null;
        if(rec){
          const won=rec.won, cnt=rec.count;
          totalGuesses+=cnt; if(won) totalSolved++;
          slotData[i]={won, cnt, lost:rec.state==='lost', guesses:rec.guesses||[], ledgerLine:fmtLedger(rec.guesses)};
        }
        else slotData[i]=null;
      }catch{ slotData[i]=null; }
    }
    if(solvedEl) solvedEl.textContent=totalSolved;
    const totalEl=$('#court-total'); if(totalEl) totalEl.textContent='/'+st.dailyPool.length;
    const modeNameEl=$('#court-mode-name'); if(modeNameEl) modeNameEl.textContent=st.isTriple?'Daily Triple':'Daily Court';
    updateStreakPills();
    const r5El=$('#reward-5'); if(r5El) r5El.hidden=!!st.isTriple;
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
        const isFailed = sd&&sd.lost;
        const cls = `court-card ${isActive?'is-active':''} ${isSolved?'is-solved':''} ${isFailed?'is-failed':''}`;
        const badge = isSolved? '✅': isFailed? '❌' : sd? `${sd.cnt}/6` : '▶';
        const arch = ARCH[p.c%ARCH.length];
        const suit=window.VHGameMechanics?VHGameMechanics.suitTagHTML(p.n,p.s,p.i):'';
        const badgeLabel = isSolved? 'Solved' : isFailed? 'Missed' : sd? `${sd.cnt} of 6 used` : 'Not started';
        /* The score string comes from the ledger (fmtSlotScore): "Won in
           N/6 · {date}" / "Missed · {date}" / "N/6 tries" — the same string
           the ledger card and share card use. A loss is "Missed", never "Won". */
        const meta = sd ? (sd.ledgerLine || (isSolved? `Won in ${sd.cnt}/6` : `${sd.cnt}/6 tries`)) : 'Not started';
        return `<div class="${cls}" data-slot="${i}"><div class="court-card__head"><div class="court-slot">Slot ${i+1} • ${arch}${isActive? ' • Now':''}</div><span class="court-badge pill${isSolved?' pill-green':''}" aria-label="${badgeLabel}">${badge}</span></div>${suit?`<div class="court-card__suit">${suit}</div>`:''}<div class="court-name">${esc(p.n)} ${esc(p.s)}</div><div class="court-meta">${meta}</div></div>`;
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
            renderPast(); renderGuesses(); renderDailyCourt(); updateStatusBar(); syncMap();
            window.scrollTo({top: $('#past-card').offsetTop-20, behavior:(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth')});
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
          if(winGuess) chips.push(`<span class="lineup-chip">Slot ${i+1}: ${esc(winGuess.name)} ← ${esc(st.dailyPool[i].n)}</span>`);
          else chips.push(`<span class="lineup-chip">Slot ${i+1}: solved</span>`);
        } else {
          chips.push(`<span class="lineup-chip is-empty">Slot ${i+1}: —</span>`);
        }
      }
      lineupBar.innerHTML = chips.join('') + `<span class="caption lineup-note">${totalSolved}/5 collected.</span>`;
    }
  }

  // --- PACK BATTLE RETIRED ---
  // Pack Battle was retired (subtraction pass, Oct 2026). Old ?pack= links
  // land here instead of launching pack mode — an honest note, not a 404.
  function renderPackRetired(){
    const el=$('#pack-retired'); const st=VHPastModern.state();
    if(!st.packRetired){ el.hidden=true; return; }
    el.hidden=false;
    el.innerHTML=`<div class="pack-retired__row">
      <div><div class="label">Retired</div><h3 class="hd pack-retired__title">Pack Battle is gone</h3><p class="caption">One daily ritual, one map behind it: Daily Court is the game now.</p></div>
      <div class="btn-row"><a class="btn btn-primary" href="/play">Play Daily Court</a></div>
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
      if(st.isDaily) phase.textContent= over? (won? `Slot ${safeSlotDaily} won in ${count}/6`:`Slot ${safeSlotDaily} failed`) : `Slot ${safeSlotDaily}/5 • ${count}/6`;
      else if(over) phase.textContent=won? `Won in ${count}/6`:'Game over';
      else phase.textContent = count===0? 'Make your first guess' : `Playing — ${count}/6 used`;
    }
    // subset map stays visible — was ready-banner
    /* syncSubsetFromState removed — it was defined nowhere (its partner subset-map.js is deleted); the calls threw a swallowed ReferenceError */
    const turnText=$('#turn-text'); if(turnText){
      if(over) turnText.textContent=won? `Won in ${count} — switch slot for next` : `Failed — answer was ${st.closestModern?st.closestModern.entry.n:'?'}`;
      else if(count===0) turnText.textContent='6 guesses to find the modern twin';
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
    const hon=st.honors[past.n+'|'+past.s]||{}; const allNba=hon.allNbaTeam? 'All-NBA '+({3:'1st',2:'2nd',1:'3rd'}[hon.allNbaTeam]||hon.allNbaTeam) : '';
    let teamAbbr=null; try{ teamAbbr=getTeamAbbr(past.n, past.s); }catch{}
    if(teamAbbr){
      $('#past-meta').innerHTML=(hon.asg?'All-Star ':'')+(allNba? allNba+' • ' : '')+archLabel+` • ${esc(past.s)} • `+modeLabel+` • <span class="pill past-meta__team" title="Team they finished the season with">${esc(teamAbbr)}</span>`;
    } else {
      $('#past-meta').innerHTML=(hon.asg?'All-Star ':'')+(allNba? allNba+' • ' : '')+archLabel+' • '+esc(past.s)+' • '+modeLabel;
    }
    // new pills
    const archPill=$('#past-arch-pill'); if(archPill) archPill.textContent=archLabel;
    const slotPill=$('#past-slot-pill'); if(slotPill) slotPill.textContent=modeLabel;
    const xyz=$('#past-xyz'); if(xyz){ xyz.textContent=''; xyz.hidden=true; }
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
    try{ syncMap(); }catch{}
    $('#puzzle-pill').textContent= st.isDaily? `Court ${slotNum}/5` : st.isRandom? 'Random' : (st.puzzleNum!=null? 'Puzzle '+st.puzzleNum : 'Puzzle');
    $('#mode-badge').textContent= st.isDaily? 'DAILY 5' : st.isRandom? 'RANDOM' : 'DAILY';
    $('#header-mode-label').textContent='DAILY COURT • 5× PAST → MODERN';
    updateStreakPills();
    $('#puzzle-day-label').textContent= st.isDaily? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(st.dayKey.slice(5,7),10)-1]} ${parseInt(st.dayKey.slice(8,10),10)} · Daily Court · 5 puzzles` : st.dayKey;
    updateStatusBar(); syncMap();
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
          /* Lane A (Ive/Kubrick): never color-alone — the guess-row warmth tag
             carries an explicit ▲/▼ channel alongside the word. The smooth
             motion (the row bar) stays; the resting label is discrete. */
          warm = simVal > prevSim ? '▲ warmer' : simVal < prevSim ? '▼ colder' : 'same';
        }
        const isWin=rankNum===0;
        const archName = (typeof g.c==='number' && ARCH[g.c%ARCH.length]) ? ARCH[g.c%ARCH.length] : '—';
        const safeName = esc(g.name);
        const safeSeason = esc(g.season);
        // only the just-submitted row animates in — re-renders (load, slot
        // switch) must not replay the entrance on every row
        const isNew = !!G._animateNew && idx===(G.guesses.length-1);
        const targetW = Math.max(4,Math.min(100,parseFloat(simPct)||0));
        const div=document.createElement('div'); div.className='guess-row'+(isWin?' win':'')+(isNew?' is-new':'');
        // pixel avatar for each guess resembling player
        const avatarId = `guess-av-${idx}-${Date.now()}`;
        div.innerHTML=`<div class="guess-row__inner"><div id="${avatarId}" class="guess-row__avatar"></div><div class="guess-row__body"><div class="guess-row__head"><b>${idx+1}. ${safeName} ${safeSeason}</b><span class="pill${isWin?' pill-green':''}">${simPct}% • ${rankLabel}</span></div><div class="guess-row__meta">${warm} • ${archName}</div><div class="bar"><i style="width:${isNew?0:targetW}%"></i></div></div></div>`;
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
    const won=G.guesses.some(g=>g.rank===0); const locksUsed=(window.VHGameMechanics&&VHGameMechanics.eraLocksUsed)?VHGameMechanics.eraLocksUsed():0; const over=won||G.guesses.length>=(6-locksUsed); const resEl=$('#result'); let st=VHPastModern.state(); const isPack=!!st.isPack;
    if(!over){ resEl.innerHTML=''; resEl.hidden=true; updateStatusBar(); renderDailyCourt(); return; } // the Pack Battle summary call that used to sit here threw on every boot after D3 retired it
    // game_completed — Owner Q: is difficulty in the productive zone — do solve
    // rates by slot justify 6 guesses? Dedupe: finish() re-renders on reload of
    // finished slots; track once per slot via localStorage.
    try{
      if(window.VHAnalytics){
        var _gmode=st.isPack?'pack':(st.isDaily?'daily':(st.isRandom?'random':'other'));
        var _gkey=(st.dayKey||'nodate')+':'+(st.dailySlot==null?'x':st.dailySlot)+':'+_gmode;
        var _gseen={}; try{ _gseen=JSON.parse(localStorage.getItem('vh.analytics.done')||'{}'); }catch(_e){}
        if(!_gseen[_gkey]){
          _gseen[_gkey]=1;
          var _gkeys=Object.keys(_gseen); if(_gkeys.length>500){ _gkeys.slice(0,_gkeys.length-500).forEach(function(k){ delete _gseen[k]; }); }
          try{ localStorage.setItem('vh.analytics.done', JSON.stringify(_gseen)); }catch(_e){}
          VHAnalytics.track('game_completed',{won:won, guesses:G.guesses.length, slot:(st.dailySlot==null?null:st.dailySlot), mode:_gmode, dayKey:st.dayKey||null});
        }
      }
    }catch(_e){}
    resEl.hidden=false;
    // harden: embeddings may still be loading → closest null would crash (repro for "breaks when i guess")
    // If ranking isn't ready, the fallback (alphabetical, 0% sim) is NOT valid — wait for real data.
    let closest=st.closestModern;
    let list=st.modernListSorted||[];
    if(!st.rankingReady){
      try{ if(window.VHMtnn && VHMtnn.isReady && VHMtnn.isReady()){ VHPastModern.computeClosest(); st=VHPastModern.state(); closest=st.closestModern; list=st.modernListSorted||[]; } }catch(e){ console.warn('computeClosest retry fail', e); }
    }
    if(!st.rankingReady || !closest || !closest.entry){
      resEl.innerHTML=`<div class="card"><h3 class="hd">⏳ Loading twin…</h3><p class="result__detail">Scoring data still loading. Your guess is saved (${G.guesses.length}/6).</p><div class="btn-row"><button class="btn btn-primary" type="button" id="btn-result-retry">Retry</button><button class="btn" type="button" id="btn-result-keep">Keep playing</button></div></div>`;
      $('#btn-result-retry')?.addEventListener('click',()=>{ try{ VHPastModern.computeClosest(); }catch(e){} location.reload(); });
      $('#btn-result-keep')?.addEventListener('click',()=>{ resEl.hidden=true; });
      return;
    }
    // v42 hardened: safe mapping for top 5, handles missing m/sim
    const sortedTop=(list||[]).slice(0,5).map((o,i)=>{
      try{
        const name = o && o.m && o.m.n ? o.m.n : '—';
        const sim = (o && typeof o.sim==='number') ? o.sim : 0;
        return `${i+1}. ${esc(name)} ${(sim*100).toFixed(0)}%`;
      }catch{ return `${i+1}. —`; }
    }).join(' • ');

    /* Gap 10 fix: the reveal is a dead end no more. Deep links for the twin:
       dossier via /players?dossier=<slug> (opens the dossier modal directly —
       Panel v3 G4: the link must land on a dossier, not a search page),
       atlas via the ?id= P-index deep link the atlas already reads on load. */
    function twinLinks(){
      try{
        var tn=(closest.entry.n||'').replace(/</g,'&lt;');
        var dslug=''; try{ dslug=(window.VHDossier&&window.VHDossier.playerSlug)?window.VHDossier.playerSlug(closest.entry.n||''):''; }catch(e){}
        var dlink=dslug?'/players?dossier='+encodeURIComponent(dslug):'/players?q='+encodeURIComponent(closest.entry.n||'');
        var links='<a href="'+dlink+'">Open '+tn+' dossier \u2192</a>';
        var pidx=-1;
        try{
          var sl=VHPastModern.state().searchLite, arr=sl&&(sl.players||sl);
          if(arr) for(var k=0;k<arr.length;k++){ if(arr[k]&&arr[k].i===closest.entry.i){ pidx=k; break; } }
        }catch(e){}
        if(pidx>=0) links+='<a href="/?id='+pidx+'#atlas">See '+(closest.entry.s||'').replace(/</g,'&lt;')+' on the atlas \u2192</a>';
        return '<div class="result__links">'+links+'</div>';
      }catch(e){ return ''; }
    }
    var twinLinksHtml=twinLinks();

      if(won){
        // Random and Challenge wins never touch the streak — Daily Court only,
        // as the mode tabs promise
        let streakN=0;
        if(st.isDaily){
          try{
            const dailyState=VHPastModern.getDailyState();
            if(dailyState.solved>=1 || G.guesses.some(g=>g.rank===0)) { streakN=VHPastModern.onDailyWin(st.dayKey)||0; }
          }catch{}
          try{ if(window.VHGameMechanics&&VHGameMechanics.collectTwin&&st.target) VHGameMechanics.collectTwin(st.target.n, st.target.s); }catch{}
        }
        // pill renders through the honest gate (hidden unless the ledger's
        // self-check passed; "unsynced" on write failure) — then ticks.
        updateStreakPills();
        const pill=$('#streak-pill');
        if(pill){
          const prev=parseInt((pill.textContent||'').replace(/\D/g,''),10)||0;
          if(streakN>prev){ pill.classList.remove('tick'); void pill.offsetWidth; pill.classList.add('tick'); }
        }
        if(celebrateNew){
          // streak chime lands after the win arpeggio — a cascade, not a pile
          try{ if(window.VHAudio) setTimeout(()=>VHAudio.play('streak'), 950); }catch{}
        }
        /* Lane A (panel Tier 0 #1 + Tier 2 #13): the win rule stated once,
           beside the score; the streak as an explicit goal (Locke) with
           Diaconis's labeled base-rate parenthetical, not a bare number. */
        const winRuleHtml=(st.isDaily&&window.VHLedger&&VHLedger.WIN_RULE)?`<p class="caption">Win rule: ${VHLedger.WIN_RULE}</p>`:'';
        const streakGoalHtml=(st.isDaily&&streakN>0&&window.VHLedger&&VHLedger.streakOddsText)?`<p class="result__detail result__streak">\uD83D\uDD25 ${streakN}-day streak \u2014 protect it: play tomorrow to keep it.</p><p class="caption">${VHLedger.streakOddsText(streakN)}</p>`:'';
        resEl.innerHTML=`<div class="card result"><h3 class="hd">✅ Solved in ${G.guesses.length}/6 — ${esc(st.target.n)} → ${esc(closest.entry.n)}</h3>${winRuleHtml}${window.VHGameMechanics?`<div class="result-stars" aria-label="${VHGameMechanics.starsFor(G.guesses.length,6)} of 3 stars">${VHGameMechanics.starsHTML(VHGameMechanics.starsFor(G.guesses.length,6))}</div>`:''}<p class="result__detail">Answer: ${esc(closest.entry.n)} ${esc(closest.entry.s)} ${(closest.sim*100).toFixed(1)}%<br>Top 5: ${sortedTop}</p>${streakGoalHtml}${twinLinksHtml}<div class="btn-row"><button class="btn btn-primary" type="button" id="btn-next-slot">Next slot →</button><button class="btn" type="button" id="btn-view-court">View court</button></div></div>`;
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
        /* Kubrick's state matrix: a loss is "Missed · {date}" — never "Won" —
           and the win rule beside the score, same as the win card. */
        const missedHtml=(st.isDaily&&window.VHLedger)?`<p class="caption">Missed \u00B7 ${st.dayKey} \u2014 ${VHLedger.WIN_RULE}</p>`:'';
        resEl.innerHTML=`<div class="card result result--lost"><h3 class="hd">❌ Revealed — ${esc(st.target.n)} → ${esc(closest.entry.n)}</h3>${missedHtml}<p class="result__detail">Closest: ${esc(closest.entry.n)} ${(closest.sim*100).toFixed(1)}%<br>Top 5: ${sortedTop}</p>${twinLinksHtml}<div class="btn-row"><button class="btn btn-primary" type="button" id="btn-next-slot">Next slot →</button><button class="btn" type="button" id="btn-view-court">View court</button></div></div>`;
      }
      const nextSlotBtn=document.getElementById('btn-next-slot');
      if(nextSlotBtn){ nextSlotBtn.addEventListener('click',()=>{
        const st=VHPastModern.state(); const courtN=st.dailyTotal||5; let next=(st.dailySlot+1)%courtN;
        const _mode=st.isTriple?'triple':'court';
        for(let i=0;i<courtN;i++){ const cand=(st.dailySlot+1+i)%courtN; try{ const rec=window.VHLedger?VHLedger.readSlot(st.dayKey,cand,_mode):null; if(!rec){ next=cand; break; } if(!rec.won&&!rec.over){ next=cand; break; } }catch{} }
        const url=new URL(location.href); url.searchParams.set('slot', next); url.searchParams.delete('pack'); url.searchParams.delete('s'); location.href=url.toString();
      }); }
      const viewCourtBtn=document.getElementById('btn-view-court'); if(viewCourtBtn){ viewCourtBtn.addEventListener('click',()=>{ 
        const el=document.getElementById('daily-court')||document.getElementById('game-header');
        if(!el) return;
        try{ if(el.hidden){ el.hidden=false; renderDailyCourt(); } }catch{}
        const y=el.getBoundingClientRect().top + window.pageYOffset - 10;
        window.scrollTo({top:y, behavior:(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth')});
        // fallback
        setTimeout(()=>{ try{ el.scrollIntoView({behavior:(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'), block:'start'}); }catch{} }, 50);
      }); }
    const hintEl=$('#past-closest-hint'); if(hintEl&&closest){ hintEl.hidden=false; hintEl.textContent=`Answer: ${closest.entry.n} ${(closest.sim*100).toFixed(0)}% — ${won?'won':'over'}`; }
    syncMap(); updateStatusBar(); renderDailyCourt();
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
      bar.className='crash-crumb';
      bar.textContent='Last guess stopped at: '+c.step+
        '  ·  '+(c.w||'?')+'x'+(c.h||'?')+' dpr'+(c.dpr||'?')+
        (c.mem?(' · '+c.mem+'GB'):'')+' · after '+(c.guesses||0)+' guesses';
      const x=document.createElement('button');
      x.type='button'; x.className='btn btn--icon crash-crumb__close';
      x.textContent='\u2715';
      x.setAttribute('aria-label','Dismiss');
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
        el.id='guess-status'; el.className='guess-status'; el.hidden=true;
        el.setAttribute('role','status'); el.setAttribute('aria-live','polite');
        anchor.insertAdjacentElement('afterend', el);
      }
      clearTimeout(el._t);
      if(!msg){ el.hidden=true; el.textContent=''; return; }
      el.textContent=msg;
      el.classList.toggle('is-warn', tone==='warn');
      el.hidden=false;
      if(tone!=='sticky') el._t=setTimeout(()=>{ el.hidden=true; }, 4000);
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
      const rb=$('#ready-banner'); if(rb) rb.hidden=!!(G.guesses||[]).length;
    }catch{}
  }
  function v2Streak(){ try{ return VHPastModern.getStreak().streak||0; }catch{ return 0; } }
  function v2StreakBest(){ try{ const g=VHPastModern.getStreak(); return g.best||g.streak||0; }catch{ return 0; } }
  /* Streak display only — reads vh.streak.v2, never writes it.
     Lane A honesty contract (Dye/Dean/Diaconis):
       - hidden unless VHLedger.honest (the runtime self-check passed AND the
         CI fuzz suite is green) — a wrong streak is worse than no streak.
       - "unsynced" (never a stale number) when a ledger write failed.
       - the title carries the Diaconis base-rate parenthetical with the
         EXPLICITLY LABELED assumed daily win rate (0.6) — illustrative,
         not measured. */
  function updateStreakPills(){
    const led=window.VHLedger||null;
    const honest=!!(led&&led.honest);
    const unsynced=!!(led&&led.unsynced&&led.unsynced());
    const cur=v2Streak(), best=v2StreakBest();
    const odds=(led&&led.streakOddsText)?led.streakOddsText(cur):'';
    const pill=$('#streak-pill');
    if(pill){
      if(!honest){ pill.hidden=true; }
      else{
        pill.hidden=false;
        if(unsynced){ pill.textContent='unsynced'; pill.title='A ledger write failed \u2014 retrying; showing nothing rather than a stale number.'; }
        else{ pill.textContent='streak '+cur; pill.title='Best: '+best+' days \u2014 Daily Court + Daily Triple share one streak. '+odds; }
      }
    }
    const court=$('#court-streak-pill');
    if(court){
      if(!honest){ court.hidden=true; }
      else{
        court.hidden=false;
        if(unsynced){ court.textContent='\u26a0\uFE0F unsynced'; court.title='A ledger write failed \u2014 retrying; showing nothing rather than a stale number.'; }
        else{ court.textContent='\uD83D\uDD25 streak '+cur; court.title='Best: '+best+' days \u2014 Daily Court + Daily Triple share one streak. '+odds; }
      }
    }
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
      try{ if(window.DailyLedger) DailyLedger.stampGuess(r.guess, st0.dayKey, (st0.isDaily||st0.isChallenge)?(st0.dailySlot||0):null, VH_SID); }catch{}
      G.guesses.push(r.guess); try{ VHPastModern.state().guesses=G.guesses.slice(); }catch{} saveGuesses(); try{ VHPastModern.state().guesses=G.guesses.slice(); }catch{} if(fromInput&&input) input.value='';
      G._animateNew=true;
      const warmEl=$('#warm-label'); let wc=null; try{ wc=VHPastModern.warmCold(); }catch{}
      if(wc&&G.guesses.length>1){ if(warmEl){ warmEl.hidden=false; if(warmEl.textContent!==wc){ warmEl.textContent=wc; warmEl.classList.remove('pop'); void warmEl.offsetWidth; warmEl.classList.add('pop'); } }} else { if(warmEl) warmEl.hidden=true; }
      // Each step is stamped before it runs; whichever stamp survives a crash
      // is the step that killed the renderer.
      crumb('renderGuesses');  renderGuesses();
      crumb('finish');         finish({celebrate: !!r.isWin});
      crumb('draw');           syncMap();
      // game feel: the guess blip (the ring lands on the map through syncMap)
      // (the win arpeggio is staged in finish() so the two never overlap)
      try{ if(window.VHAudio) VHAudio.play('guess'); }catch{}
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
      // If a completed slot's reveal is showing the loading state, re-render with real data
      try{ if(typeof finish==='function') finish(); }catch(e){}
      if(pendingGuess){ const n=pendingGuess; pendingGuess=null; setGuessStatus(''); doGuess(n); }
      else { syncMap(); }
    }catch(e){ console.warn('ranking-ready flush fail', e); }
  });
  // cross-tab convergence (panel v3 G1): another tab's write re-merges here
  // instead of being silently clobbered by this tab's next save.
  window.addEventListener('storage', function(ev){
    try{
      if(!ev||!ev.key) return;
      if(ev.key.indexOf('vh.daily.v2.')!==0 && ev.key.indexOf('vh.triple.v1.')!==0 && ev.key!=='vh.pastmodern.v10') return;
      const st=(window.VHPastModern&&VHPastModern.state)?VHPastModern.state():null;
      if(!st||st.isPack||(!st.isDaily&&!st.isChallenge)) return;
      const cur=loadGuesses(), before=(G.guesses||[]).length;
      G.guesses=cur;
      try{ VHPastModern.state().guesses=G.guesses.slice(); }catch(_){}
      if(cur.length!==before){
        try{ if(typeof renderGuesses==='function') renderGuesses(); }catch(_){}
        try{ if(typeof renderDailyCourt==='function') renderDailyCourt(); }catch(_){}
        try{ syncMap(); }catch(_){}
      }
    }catch(_){}
  });

  async function main(){
    // if the last guess never finished, say which step it was on
    crumbReport();
    // T3.1: most page scripts are deferred now; the game boot (this file) stays
    // blocking, so wait for the deferred game-data layer before touching it.
    try{
      const t0=Date.now();
      while(!window.VHPastModern){ if(Date.now()-t0>8000) throw new Error('VHPastModern never loaded'); await new Promise(r=>setTimeout(r,50)); }
    }catch(e){ console.warn('boot wait', e); }


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
    try{ clearTimeout(loadingWatchdog); }catch{} 
    try{ syncMap(); }catch(e){ console.warn(e); }
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
            syncMap();
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

    let mode='daily'; if(st.isRandom) mode='random'; else if(st.isTriple) mode='triple';
    if(mode==='triple'){ const md=$('#mode-desc'); if(md) md.innerHTML='Daily Triple: 3 fixed puzzles per day — the lighter court (the retired Everyday game, folded in). It shares the Daily Court streak.'; }
    document.querySelectorAll('#mode-tabs [data-mode]').forEach(btn=>{ const m=btn.dataset.mode; if(m===mode) btn.classList.add('is-active'); else btn.classList.remove('is-active'); });
    document.querySelectorAll('#mode-tabs [data-mode]').forEach(btn=>{
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
    let releaseOnboard=null;
    function openOnboard(){
      if(!backdrop || !backdrop.hidden) return;
      backdrop.hidden=false;
      releaseOnboard=sheetFocus(backdrop, closeOnboard);
    }
    function closeOnboard(){
      if(backdrop && !backdrop.hidden){
        backdrop.hidden=true;
        if(releaseOnboard){ releaseOnboard(); releaseOnboard=null; }
      }
      try{ localStorage.setItem('vh.onboardSeenV3','1'); }catch{}
    }
    if(!onboardSeen){ setTimeout(openOnboard, 700); }
    $('#btn-howto')?.addEventListener('click', openOnboard);
    $('#btn-onboard-close')?.addEventListener('click', closeOnboard);
    $('#btn-onboard-play')?.addEventListener('click', ()=>{ closeOnboard(); $('#guess-input')?.focus(); });
    $('#btn-onboard-random')?.addEventListener('click', ()=>{ closeOnboard(); const p=VHPastModern.pickRandomPast(); location.href='/play?mode=random&r='+p.i; });
    backdrop?.addEventListener('click', e=>{ if(e.target===backdrop) closeOnboard(); });
    /* Panel v3 G6: Escape dismisses the info sheet (sheetFocus owns the key while it is open). */

    $('#btn-focus-guess')?.addEventListener('click', ()=>{ $('#guess-input')?.focus(); window.scrollTo({top: $('#guess-card').offsetTop-20, behavior:(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth')}); });
    $('#guess-btn')?.addEventListener('click', ()=>{ if(typeof doGuess==='function') doGuess(); });
    $('#guess-input')?.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); if(typeof doGuess==='function') doGuess(); } });
    // grid mode: tiles call doGuess(name) directly
    $('#btn-random').addEventListener('click', ()=>{ const p=VHPastModern.pickRandomPast(); location.href='/play?mode=random&r='+p.i; });
    $('#btn-new').addEventListener('click', ()=>{ location.href='/play'; });
    $('#btn-copy-court')?.addEventListener('click', async ()=>{
      const s=VHPastModern.state(); const url=location.origin+'/play?day='+s.dayKey; const court=s.dailyPool.map((p,i)=>`${i+1}. ${p.n} ${p.s}`).join('\n'); const text=`Daily Court ${s.dayKey} — 5 puzzles\n${court}\n${url}`; const ok=await copyTextVerified(text); confirmShare($('#btn-copy-court'), ok?'copied':false, '📋 Copy court'); if(!ok) toastMsg('Copy failed \u2014 try again');
    });
    // One confirmation pattern for every share control (panel v3 G2): the share
    // call's result drives the button label, so a share is never silent.
    // res: true = OS share sheet completed, 'copied' = clipboard, 'prompted' =
    // manual-copy prompt shown, anything else = failed.
    function confirmShare(btn, res, idle){
      try{
        if(!btn) return;
        const orig=idle||btn.textContent;
        if(res==='copied') btn.textContent='Copied!';
        else if(res===true) btn.textContent='Shared ✓';
        else if(res==='prompted') btn.textContent='Copy the text above';
        else btn.textContent='Share failed — try Copy Grid';
        setTimeout(()=>{ btn.textContent=orig; },1600);
      }catch{}
    }
    /* ── Lane A share loop (panel Tier 0 #3, Harada goal 2) ──
       SHARE tap → the card rises into a preview sheet with a destination row;
       the toast lands immediately (<=1s visible response) and "Copied ✓"
       fires only after the clipboard write is VERIFIED — never an animated
       lie. Every shared URL carries ref=share so inbound plays are visible. */
    async function copyTextVerified(t){
      try{ if(navigator.clipboard&&navigator.clipboard.writeText){ await navigator.clipboard.writeText(t); return true; } }catch(e){}
      try{
        const ta=document.createElement('textarea'); ta.value=t; ta.setAttribute('readonly','');
        ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select();
        const ok=document.execCommand('copy'); ta.remove(); if(ok) return true;
      }catch(e){}
      return false;
    }
    function toastMsg(m){ try{ if(window.VHToast) VHToast.show(m); else if(window.VHShare&&VHShare.showToast) VHShare.showToast(m); }catch(e){} }
    function dailyShareContext(){
      const s=VHPastModern.state();
      const mode=s.isTriple?'triple':'court';
      let ledger=null, text='', url=location.origin+'/play?day='+s.dayKey+(s.isTriple?'&mode=triple':'')+'&ref=share';
      try{
        if(window.VHLedger){
          ledger=VHLedger.read(s.dayKey, mode, s.dailyPool.length);
          url=location.origin+VHLedger.shareUrl(s.dayKey, mode);
          text=VHLedger.shareText(ledger, s.dailyPool, v2Streak());
        }
      }catch(e){}
      if(!text){
        // degraded: hand-built card from the ledger-backed daily state
        const ds=VHPastModern.getDailyState();
        text=(s.isTriple?'Daily Triple':'Daily Court')+' '+s.dayKey+' \u2014 '+(ds.solved||0)+'/'+(ds.total||s.dailyPool.length)+' in '+(ds.totalGuesses||0)+' guesses\n'+url;
      }
      return {s, mode, ledger, text, url, title:(s.isTriple?'Daily Triple':'Daily Court')+' '+s.dayKey};
    }
    let releaseShare=null;
    function closeDailyShareSheet(){ const sh=$('#vh-share-sheet'); if(sh) sh.remove(); if(releaseShare){ releaseShare(); releaseShare=null; } }
    function openDailyShareSheet(){
      const ctx=dailyShareContext();
      toastMsg('Opening share\u2026'); // <=1s visible response to the tap
      closeDailyShareSheet();
      const sh=document.createElement('div'); sh.id='vh-share-sheet'; sh.className='sheet__backdrop';
      sh.innerHTML='<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="vh-share-title"><div class="sheet__handle"></div><div class="sheet__head"><h2 class="sheet__title" id="vh-share-title">Share your card</h2><button class="sheet__close" id="vh-share-close" type="button" aria-label="Close">\u2715</button></div><pre class="vh-share-preview"></pre><div class="share-bar"><button class="btn btn-primary" id="vh-share-copy-card" type="button">\uD83D\uDCCB Copy card</button><button class="btn" id="vh-share-copy-link" type="button">\uD83D\uDD17 Copy link</button><button class="btn" id="vh-share-native" type="button">\u2197\uFE0F More\u2026</button></div><div class="vh-share-fine">The card text above is exactly what gets copied \u2014 no spoilers, every link carries ref=share.</div></div>';
      sh.querySelector('.vh-share-preview').textContent=ctx.text;
      document.body.appendChild(sh);
      const close=()=>closeDailyShareSheet();
      releaseShare=sheetFocus(sh, close);
      sh.addEventListener('click',(e)=>{ if(e.target===sh) close(); });
      sh.querySelector('#vh-share-close').addEventListener('click',close);
      sh.querySelector('#vh-share-copy-card').addEventListener('click',async()=>{
        const ok=await copyTextVerified(ctx.text);
        toastMsg(ok?'Copied \u2713':'Copy failed \u2014 long-press the preview to copy'); if(ok) close();
      });
      sh.querySelector('#vh-share-copy-link').addEventListener('click',async()=>{
        const ok=await copyTextVerified(ctx.url);
        toastMsg(ok?'Link copied \u2713':'Copy failed \u2014 long-press the preview to copy'); if(ok) close();
      });
      sh.querySelector('#vh-share-native').addEventListener('click',async()=>{
        try{
          if(navigator.share){ await navigator.share({title:ctx.title, text:ctx.text, url:ctx.url}); toastMsg('Shared \u2713'); close(); return; }
        }catch(e){ /* user dismissed the native sheet — stay open, no false confirmation */ }
        const ok=await copyTextVerified(ctx.text);
        toastMsg(ok?'Copied \u2713':'Copy failed \u2014 long-press the preview to copy'); if(ok) close();
      });
    }
    $('#share-btn').addEventListener('click', async ()=>{
      const s=VHPastModern.state();
      if(s.isDaily){
        openDailyShareSheet(); return;
      }
      const won=G.guesses.some(g=>g.rank===0);
      const opts={puzzleNum:s.puzzleNum, dayKey:s.dayKey, pastName:s.target.n, pastSeason:s.target.s, guesses:G.guesses, answerName:s.closestModern? s.closestModern.entry.n: '', answerSim:s.closestModern? s.closestModern.sim:0, won:won, streak:v2Streak(), url:location.origin+'/play?day='+s.dayKey+'&slot='+s.dailySlot};
      if(window.VHShare&&window.VHShare.sharePastModern){ const res=await window.VHShare.sharePastModern(opts); confirmShare($('#share-btn'), res, 'Share'); }
    });
    $('#share-text-btn').addEventListener('click', async ()=>{
      const s=VHPastModern.state();
      const won=G.guesses.some(g=>g.rank===0);
      if(s.isDaily){
        /* Lane A: the card text is built by the ledger (the ONLY scorer) —
           this is the "undefined/6" regression the fuzz suite quotes. The
           copy is verified before "Copied ✓" ever shows. */
        const ctx=dailyShareContext();
        const ok=await copyTextVerified(ctx.text);
        toastMsg(ok?'Copied \u2713':'Copy failed \u2014 try again');
        const b=$('#share-text-btn'); b.textContent=ok?'Copied':'Copy Grid'; setTimeout(()=>b.textContent='Copy Grid',1200);
        return;
      }
      const grid=G.guesses.map(g=> g.rank===0?'🟩': g.rank<=3?'🟨':'⬜').join(''); const lines=G.guesses.map((g,i)=>`${i+1}. ${g.name} ${(g.sim*100).toFixed(0)}% #${g.rank+1}`).join('\n'); const text=`Vector Hoops P#${s.puzzleNum} ${s.dayKey} ${won?G.guesses.length+'/6':'X/6'} ${grid}\nPast ${s.target.n} → ${won?G.guesses.slice(-1)[0].name:'?'}\n${lines}\n${location.origin}/play?day=${s.dayKey}&slot=${s.dailySlot}`; navigator.clipboard.writeText(text).then(()=>confirmShare($('#share-text-btn'),'copied','Copy Grid'), ()=>confirmShare($('#share-text-btn'),false,'Copy Grid'));
    });
    $('#btn-challenge').addEventListener('click', async function(){
      const s=VHPastModern.state();
      const url=location.origin+'/play?day='+s.dayKey+(s.isDaily? `&slot=${s.dailySlot}`:''); const txt=`Can you beat my Daily Court ${s.dayKey}? Slot ${s.dailySlot+1} ${s.target.n} — ${url}`; const btn=this; const ok=await copyTextVerified(txt); toastMsg(ok?'Challenge link copied \u2713':'Copy failed \u2014 try again'); if(ok){ btn.textContent='Copied'; setTimeout(()=>btn.textContent='Challenge',1200); }
    });
  }
  main().catch(e=>{ console.error(e); const inv=$('#boot-error'); if(inv){ inv.hidden=false; inv.innerHTML='<div class="state state--error" role="alert"><p class="state__title">The game hit an error</p><p class="boot-error__msg"></p><button class="btn btn-primary" type="button" id="btn-boot-reload">Reload</button></div>'; inv.querySelector('.boot-error__msg').textContent=String(e&&e.message||e); inv.querySelector('#btn-boot-reload').addEventListener('click',()=>location.reload()); } });
})();
