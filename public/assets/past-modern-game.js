/* past-modern-game.js — Past All-Star -> Guess Modern Twin | 100M DAU prod
   Loads: vectors_search_lite.json (12966 xyz), honors.json (asg), scoring_lite.f32 (~410KB subset)
   Game: daily past all-star (asg=1, season<2024) -> closest modern (2025-26) by 64-d cosine
   Daily Court = 5 deterministic puzzles per day, broader meta game
   (Pack Battle was retired, Oct 2026 — its ?pack= links show a retirement note.)
*/
(function(){
  const HONORS_URL = 'assets/honors.json';
  const SEARCH_LITE_URL = 'assets/vectors_search_lite.json';
  const MODERN_CUTOFF = 2023;
  const PAST_MAX = 2023;
  const OKABE = ['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const ARCH_NAMES=["Glass+Rim","LowVol Glass","Low Impact 3P Vol","Def Glass+Rim FT","Vol+3P Vol","3P Acc+Vol","Playmaking+Steals","Scoring Vol"];

  function parseYear(seasonStr){
    let y = parseInt((seasonStr||'').slice(0,4),10);
    return isNaN(y)?0:y;
  }
  async function fetchJSON(url){
    try{
      const r = await fetch(url, {cache:'force-cache'});
      if(!r.ok) throw new Error('fetch '+url+' '+r.status);
      return await r.json();
    }catch(e){
      try{
        const r2=await fetch(url, {cache:'no-store'});
        if(!r2.ok) throw e;
        return await r2.json();
      }catch(e2){ throw e; }
    }
  }
  // v54 lite scoring core: subset of mtnn_embeddings.f32 (past all-stars + 2024+ seasons,
  // ~300KB) built by pipeline/build_scoring_lite.py. Same L2-normalized rows, so sims are
  // bit-identical to the full matrix. Loaded eagerly — small enough for any device.
  let LITE=null, _liteP=null;
  function loadScoringLite(){
    if(_liteP) return _liteP;
    _liteP=(async ()=>{
      const idx=await fetchJSON('assets/scoring_lite_index.json?v=56');
      // freshness canary: warn (never block) if the lite core lags the full export
      fetch('assets/mtnn_meta.json?v=a87f2861').then(r=>r.ok?r.json():null).then(m=>{
        if(m&&m.built&&idx.built&&m.built!==idx.built)
          console.warn('scoring_lite stale: built '+idx.built+' vs mtnn '+m.built+' — rerun pipeline/build_scoring_lite.py');
      }).catch(()=>{});
      const r=await fetch('assets/scoring_lite.f32?v=ce28462d',{cache:'force-cache'});
      if(!r.ok) throw new Error('scoring_lite f32 '+r.status);
      const E=new Float32Array(await r.arrayBuffer());
      if(E.length!==idx.rows*idx.dim) throw new Error('scoring_lite length mismatch');
      const map=new Map();
      for(let k=0;k<idx.ids.length;k++) map.set(idx.ids[k],k);
      LITE={dim:idx.dim, E, map};
      return LITE;
    })().catch(e=>{ _liteP=null; throw e; });
    return _liteP;
  }
  // cosine sim by global row id from the lite scoring core; null when the
  // pair is not covered (the lite subset covers every legal target +
  // candidate, so this only happens before the lite load completes)
  function simById(a,b){
    if(LITE){
      const ka=LITE.map.get(a), kb=LITE.map.get(b);
      if(ka!=null && kb!=null){
        const d=LITE.dim, E=LITE.E, oa=ka*d, ob=kb*d; let dot=0;
        for(let k=0;k<d;k++) dot+=E[oa+k]*E[ob+k];
        return dot>1?1:(dot<-1?-1:dot);
      }
    }
    return null;
  }
  // lite only: the lite subset covers every legal Daily Court target (past
  // all-stars) and every modern candidate by construction, so the full
  // 3.3 MB matrix never needs to reach the client. On lite failure the game
  // keeps the honest "Loading scoring…" pending state — guessModern refuses
  // to score against the alphabetical fallback ranking.
  function ensureScoring(){
    return loadScoringLite()
      .then(()=>{ try{ computeClosest(); }catch{} });
  }
  function hashStr(s){
    let h=0; for(let i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))>>>0; } return h;
  }
  function buildDailyPool(dayKey, past, count, seedTag){
    count = count || 5; seedTag = seedTag || 'daily-court-v2';
    const pool=[]; const usedNames=new Set(); const archCount={};
    for(let slot=0; slot<count; slot++){
      let h = hashStr(dayKey + '|' + seedTag + '|' + slot);
      let idx = h % past.length;
      let guard=0;
      /* Panel v3 G5: variety cap — at most 2 targets per day may share one
         archetype (cluster id .c). Same-day puzzle sets were landing 4-of-5
         in a single archetype, which makes the day feel samey. */
      const archOk=(p)=> (archCount[p.c|0]||0) < 2;
      while((usedNames.has(past[idx].n) || pool.some(p=>p.i===past[idx].i) || !archOk(past[idx])) && guard<400){
        h = (h*33 + 7 + guard)>>>0;
        idx = h % past.length;
        guard++;
      }
      pool.push(past[idx]);
      usedNames.add(past[idx].n);
      archCount[past[idx].c|0]=(archCount[past[idx].c|0]||0)+1;
    }
    return pool;
  }
  function getDailySlotFromIp(ip, dayKey){
    if(!ip) return null;
    return hashStr(ip + '|'+dayKey+'|court') % 5;
  }

  // ---------- helpers ----------
  function shuffleArray(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const tmp=a[i]; a[i]=a[j]; a[j]=tmp; } return a; }

  // DAILY COURT helpers
  /* Slot keys are owned by the ledger — this is a read-only alias kept so
   * old call sites don't scatter the key format. */
  function slotKey(dayKey, i){ try{ if(window.VHLedger) return VHLedger.slotKey(dayKey, i, state.isTriple?'triple':'court'); }catch{} return (state.isTriple ? 'vh.triple.v1.' : 'vh.daily.v2.') + dayKey + '.slot' + i; }
  function getDailyState(){
    if(!state.dailyPool||!state.dailyPool.length) return {isDailyCourt:false};
    const dayKey=state.dayKey;
    const pool=state.dailyPool;
    const mode=state.isTriple?'triple':'court';
    let ledger=null;
    try{ ledger = window.VHLedger ? VHLedger.read(dayKey, mode, pool.length) : null; }catch{ ledger=null; }
    let solved=0, totalGuesses=0, slotResults=[];
    for(let i=0;i<pool.length;i++){
      let rec=null;
      if(ledger && ledger.slots[i]) rec=ledger.slots[i];
      if(rec){
        const won=rec.won, count=rec.count;
        if(won) solved++;
        totalGuesses+=count;
        slotResults[i]={won, count, guesses:rec.guesses||[]};
      } else {
        slotResults[i]=null;
      }
    }
    const tiers={
      one: solved>=1,
      three: solved>=3,
      five: solved>=5,
      streakEligible: solved>=1,
    };
    return {
      isDailyCourt:true,
      dayKey,
      pool,
      slot: state.dailySlot||0,
      total:pool.length,
      solved,
      totalGuesses,
      slotResults,
      tiers,
      assignedSlot: state.dailyAssignedSlot,
      ip: state.ip,
    };
  }
  async function fetchIp(){
    /* Privacy-first: no third-party IP lookup (removed api.ipify.org call).
       Daily slot assignment uses a persistent random client ID stored locally
       instead of the visitor's IP address. Same distribution, zero leakage. */
    try{
      var k='vh.dailyCourt.clientId', id=localStorage.getItem(k);
      if(!id){
        id='c'+Math.random().toString(36).slice(2)+Date.now().toString(36);
        try{ localStorage.setItem(k,id); }catch(e){}
      }
      return id;
    }catch(e){ return null; }
  }

  let state={
    searchLite:null, honors:null, pastPool:[], modernPool:[], modernByName:new Map(), modernByLower:new Map(), modernListSorted:[], target:null, targetIdx:null, closestModern:null, guesses:[],
    dayKey:null, todayKey:null, urlDay:null, urlRandomId:null, modeParam:null,
    isRandom:false,isChallenge:false,isDaily:false,isTriple:false,packRetired:false,
    dailyPool:[],dailySlot:0,dailyTotal:5,dailyIsPractice:false,dailyAssignedSlot:null,ip:null,
    puzzleNum:1
  };

  async function init(){
    const [lite, hon] = await Promise.all([fetchJSON(SEARCH_LITE_URL), fetchJSON(HONORS_URL)]);
    state.searchLite=lite; state.honors=hon.bySeason||hon;

    const past=[];
    for(const p of lite.players){
      const yr=parseYear(p.s); if(yr>PAST_MAX||yr<1996) continue;
      const key=`${p.n}|${p.s}`; const h=state.honors[key]; if(!h||h.asg!==1) continue;
      past.push(p);
    }
    past.sort((a,b)=>{
      const ha=state.honors[`${a.n}|${a.s}`]||{}, hb=state.honors[`${b.n}|${b.s}`]||{};
      const va=(hb.allNbaTeam||0)*1000 + (hb.allNbaVotePts||0) - ((ha.allNbaTeam||0)*1000 + (ha.allNbaVotePts||0));
      if(va!==0) return va; return b.s.localeCompare(a.s);
    });
    state.pastPool=past;

    const modernCandidates=lite.players.filter(p=>parseYear(p.s)>=2025);
    // latest season per PERSON (identity fix 2026-10-01): key on pid, not the
    // display name — two persons can share one (e.g. Reggie Williams).
    const byPid=new Map();
    for(const p of modernCandidates){
      const k=p.pid||p.n;
      const yr=parseYear(p.s); const ex=byPid.get(k);
      if(!ex || parseYear(ex.s)<yr || (parseYear(ex.s)===yr && p.s>ex.s)) byPid.set(k,p);
    }
    const modern=Array.from(byPid.values()).sort((a,b)=>a.n.localeCompare(b.n));
    state.modernPool=modern; state.modernByName=byPid; state.modernByLower=new Map(modern.map(m=>[m.n.toLowerCase(),m]));

    let urlDay=null,urlRandomId=null,modeParam=null,packParam=null,slotParam=null;
    try{
      const sp=new URLSearchParams(location.search);
      const d=sp.get('day')||sp.get('d'); if(d && /^\d{4}-\d{2}-\d{2}$/.test(d)) urlDay=d;
      const r=sp.get('r')||sp.get('past'); if(r!=null){ const n=parseInt(r,10); if(!Number.isNaN(n)) urlRandomId=n; }
      modeParam=sp.get('mode')||sp.get('m');
      packParam=sp.get('pack')||sp.get('p')||sp.get('packCode');
      const sParam=sp.get('slot')||sp.get('dailySlot')||sp.get('court'); if(sParam!=null){ const sn=parseInt(sParam,10); if(!Number.isNaN(sn)&&sn>=0&&sn<5) slotParam=sn; }
    }catch{}

    const today=new Date(); const todayKey=today.toISOString().slice(0,10); const dayKey=urlDay||todayKey;
    state.dayKey=dayKey; state.todayKey=todayKey; state.urlDay=urlDay; state.urlRandomId=urlRandomId; state.modeParam=modeParam;
    state.isRandom=!!(urlRandomId!=null || (modeParam && modeParam.toLowerCase()==='random'));
    state.isTriple=!!(modeParam && modeParam.toLowerCase()==='triple') && !state.isRandom;
    state.isChallenge=!!urlDay && urlDay!==todayKey;
    state.isDaily=!state.isRandom && !state.isChallenge;
    // Pack Battle was retired (subtraction pass, Oct 2026): old ?pack= links
    // and ?mode=pack get the retirement note instead of pack mode.
    state.packRetired=!!(packParam || (modeParam && modeParam.toLowerCase()==='pack'));

    // daily court pool
    const dailyPool=state.isTriple ? buildDailyPool(dayKey, past, 3, 'triple-v1') : buildDailyPool(dayKey, past);
    state.dailyPool=dailyPool; state.dailyTotal=dailyPool.length;

    let assignedSlot=null;
    let effectiveSlot=0;
    if(typeof localStorage!=='undefined'){
      try{
        const cached=localStorage.getItem('vh.dailyCourt.assign.'+dayKey);
        if(cached){ const cj=JSON.parse(cached); if(typeof cj.assignedSlot==='number') assignedSlot=cj.assignedSlot; }
      }catch{}
    }
    if(slotParam!=null) effectiveSlot=slotParam;
    else {
      let firstUnsolved=0; let found=false;
      try{
        const mode=state.isTriple?'triple':'court';
        for(let i=0;i<dailyPool.length;i++){
          let rec=null;
          try{ rec = window.VHLedger ? VHLedger.readSlot(dayKey, i, mode) : null; }catch{}
          if(!rec){ firstUnsolved=i; found=true; break; }
          if(!rec.won && !rec.over){ firstUnsolved=i; found=true; break; }
        }
        if(!found){ firstUnsolved=0; }
      }catch{ firstUnsolved=0; }
      effectiveSlot=firstUnsolved;
    }

    if(!state.isTriple) fetchIp().then(ip=>{
      if(!ip) return;
      state.ip=ip;
      const ipSlot=getDailySlotFromIp(ip, dayKey);
      state.dailyAssignedSlot=ipSlot;
      try{ localStorage.setItem('vh.dailyCourt.assign.'+dayKey, JSON.stringify({ip, assignedSlot:ipSlot, ts:Date.now()})); }catch{}
      try{ window.dispatchEvent(new CustomEvent('vh-daily-ip', {detail:{ip, ipSlot}})); }catch{}
    }).catch(()=>{});

    state.dailySlot=effectiveSlot;
    if(assignedSlot!=null) state.dailyAssignedSlot=assignedSlot;

    const dayObj=new Date(dayKey+'T12:00:00Z'); const baseNum=Math.floor((dayObj - new Date('2026-07-01T00:00:00Z'))/86400000);
    state.puzzleNum = state.isTriple ? baseNum*3 + effectiveSlot +1 : baseNum*5 + effectiveSlot +1;

    let targetPicked=null;
    if(urlRandomId!=null){
      targetPicked=past.find(p=>p.i===urlRandomId)||null;
      if(!targetPicked){ const lf=lite.players.find(p=>p.i===urlRandomId); if(lf){ const key=`${lf.n}|${lf.s}`; if(state.honors[key]&&state.honors[key].asg===1) targetPicked=lf; } }
    }
    if(!targetPicked && state.isRandom){
      const idx=Math.floor(Math.random()*past.length); targetPicked=past[idx];
    }
    if(!targetPicked){
      if(state.isDaily || state.isChallenge){
        targetPicked = dailyPool[effectiveSlot] || dailyPool[0];
      } else {
        let h=0; for(let i=0;i<dayKey.length;i++) h=(h*31 + dayKey.charCodeAt(i))>>>0;
        const pastIdx=past.length? (h % past.length):0; targetPicked=past[pastIdx]||null;
      }
    }
    state.target=targetPicked; state.targetIdx=state.target?state.target.i:null;
    if(state.targetIdx!=null){ try{ computeClosest(); }catch(e){ console.warn(e); } }

    // v54: eager lite scoring core (~300KB, safe on any device); no deferral needed
    try{ ensureScoring().catch(()=>{}); }catch{}
    try{ window.addEventListener('vh:defer-mtnn', ()=>{ try{ ensureScoring().catch(()=>{}); }catch{} }); }catch{}
    return state;
  }

  function computeClosest(){
    if(!state.target||!state.modernPool.length) return null;
    // probe: can any source score this target? (lite covers all modern rows by construction)
    const probe=simById(state.target.i, state.modernPool[0].i);
    if(probe==null){
      console.warn('no embedding source yet, fallback 0-sim');
      // alphabetical placeholder ranking — NOT valid for scoring; guessModern refuses until rankingReady
      state.rankingReady=false;
      const fallbackSims = state.modernPool.map(m=>({m, sim:0}));
      try{ fallbackSims.sort((a,b)=>(a.m.n||'').localeCompare(b.m.n||'')); }catch{}
      state.modernListSorted=fallbackSims;
      state.closestModern=fallbackSims[0]?{entry:fallbackSims[0].m, sim:0}:null;
      return state.closestModern;
    }
    const targetNameLower=(state.target.n||'').toLowerCase().trim();
    let best=null,bestSim=-1; const sims=[];
    for(const m of state.modernPool){
      if(!m||!m.n) continue;
      if(m.n && targetNameLower && m.n.toLowerCase().trim()===targetNameLower) continue;
      let sim=simById(state.target.i, m.i); if(typeof sim!=='number'||isNaN(sim)) sim=0;
      sims.push({m,sim}); if(sim>bestSim){ bestSim=sim; best=m; }
    }
    try{ sims.sort((a,b)=> (b.sim||0)-(a.sim||0)); }catch{ }
    state.modernListSorted=sims; state.closestModern=best?{entry:best, sim:bestSim}: (sims[0]?{entry:sims[0].m, sim:sims[0].sim}:null);
    const wasReady=state.rankingReady===true;
    state.rankingReady=true;
    if(!wasReady){ try{ window.dispatchEvent(new CustomEvent('vh:ranking-ready')); }catch{} }
    return state.closestModern;
  }
  function rankOfModernName(name){
    try{
      const raw=(name||'').trim(); if(!raw) return null;
      if(!state || !state.modernByLower) return null;
      let low=raw.toLowerCase(); let entry=state.modernByLower.get(low);
      if(!entry){ const m=raw.match(/^(.+?)\s+\d{4}-\d{2}$/); if(m){ low=m[1].trim().toLowerCase(); entry=state.modernByLower.get(low); } }
      if(!entry) return null;
      const list = state.modernListSorted||[];
      if(!list.length){
        // list empty but entry exists — placeholder rank only, never 0 (0 means win)
        return {rank:999, sim:0, entry};
      }
      for(let i=0;i<list.length;i++){ 
        try{
          const mm = list[i] && list[i].m;
          if(!mm || !mm.n) continue;
          if(mm.n.toLowerCase()===low) return {rank:i, sim:(typeof list[i].sim==='number'?list[i].sim:0), entry}; 
        }catch{}
      }
      return null;
    }catch(e){ console.warn('rankOfModernName fail', e); return null; }
  }
  function guessModern(name){
    try{
      const trimmed=(name||'').trim(); if(!trimmed) return {ok:false, reason:'Empty guess'};
      if(trimmed.length<2) return {ok:false, reason:'Type at least 2 letters'};
      if(!state || !state.modernPool || !state.modernPool.length){
        return {ok:false, reason:'Still loading players… try again in a sec'};
      }
      if(!state.target){
        return {ok:false, reason:'Still loading court…'};
      }
      // v53: refuse to score against the alphabetical fallback ranking — rank there is
      // list position, so e.g. the alphabetically-first player would register a false win.
      if(!state.rankingReady){
        try{ ensureScoring().catch(()=>{}); }catch{}
        // pending:true lets the UI queue this guess and auto-submit on vh:ranking-ready
        return {ok:false, pending:true, reason:'Loading scoring…'};
      }
      let low=trimmed.toLowerCase(); let m=trimmed.match(/^(.+?)\s+\d{4}-\d{2}$/); if(m) low=m[1].trim().toLowerCase();
      if(state.target && state.target.n && low===state.target.n.toLowerCase().trim()) return {ok:false, reason:'Target self excluded'};
      const r=rankOfModernName(trimmed); if(!r) return {ok:false, reason:'Not guessable — only players with a qualifying 2025-26 season (12+ games, 450+ minutes)'};
      const guesses = state.guesses||[];
      const already=guesses.find(g=> {
        try{
          return g.idx===r.entry.i || (g.name&&g.name.toLowerCase().trim()===r.entry.n.toLowerCase().trim());
        }catch{return false;}
      });
      if(already) return {ok:false, reason:'Already guessed'};
      const g={name:r.entry.n, season:r.entry.s, idx:r.entry.i, sim:(typeof r.sim==='number'?r.sim:0), rank:(typeof r.rank==='number'?r.rank:999), x:r.entry.x,y:r.entry.y,z:r.entry.z,c:r.entry.c};
      return {ok:true, guess:g, isWin:r.rank===0, rank:r.rank};
    }catch(e){
      console.warn('guessModern fail', e);
      return {ok:false, reason:'Guess failed — try another'};
    }
  }
  /* Warmer/colder in twin-band vocabulary (Ive/Diaconis/Dye): the resting
   * state is a discrete band word — strong / lean / distant — from the
   * guess's embedding similarity, never color alone: ▲ warmer, ▼ colder.
   * Motion (the guess-row bar) may stay smooth; truth is discrete. */
  function warmCold(){
    try{
      const gs=state.guesses||[];
      if(!gs.length) return null;
      const last=gs[gs.length-1];
      const sim=(last&&typeof last.sim==='number'&&isFinite(last.sim))?last.sim:0;
      const band=(window.VHLedger&&VHLedger.bandForSim)?VHLedger.bandForSim(sim):'twin';
      if(gs.length<2) return band;
      const prev=gs[gs.length-2];
      const prevSim=(prev&&typeof prev.sim==='number'&&isFinite(prev.sim))?prev.sim:sim;
      const arrow=sim>prevSim?' \u25B2':sim<prevSim?' \u25BC':'';
      return band+arrow;
    }catch{ return null; }
  }

  /* Streak state is owned by the ledger (assets/daily-ledger.js). These are
   * thin delegates — there is no second copy of the streak anywhere. If the
   * ledger failed to load, reads return the safe default and writes no-op
   * rather than inventing parallel state. */
  function getStreak(){ try{ return window.VHLedger ? VHLedger.getStreak() : {streak:0,lastPlayedDay:null,best:0,lastWin:false}; }catch{ return {streak:0,lastPlayedDay:null,best:0,lastWin:false}; } }
  // streak_day analytics (v4 systems): does a protected streak bring the
  // player back tomorrow (day-2 return by streak state)?
  function trackStreakDay(dayKey, streak, result){
    try{ if(window.VHAnalytics) VHAnalytics.track('streak_day',{dayKey:dayKey, streak:streak, result:result}); }catch(_e){}
  }
  function onDailyWin(dayKey){
    try{ if(window.VHLedger){ const s=VHLedger.recordDayOutcome(dayKey,'win').streak||0; trackStreakDay(dayKey,s,'won'); return s; } }catch{}
    return 0;
  }
  function onDailyLoss(dayKey){
    try{ if(window.VHLedger){ VHLedger.recordDayOutcome(dayKey,'loss'); trackStreakDay(dayKey,0,'lost'); } }catch{}
    return 0;
  }
  function msToNextDaily(){ const now=new Date(); const tomorrow=new Date(now); tomorrow.setDate(tomorrow.getDate()+1); tomorrow.setHours(0,0,0,0); return tomorrow-now; }
  function fmtHMS(ms){ const s=Math.floor(ms/1000); const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); const sec=s%60; if(h>0) return `${h}h ${m}m`; if(m>0) return `${m}m ${sec}s`; return `${sec}s`; }

  function pickRandomPast(){ if(!state.pastPool.length) return null; const idx=Math.floor(Math.random()*state.pastPool.length); state.target=state.pastPool[idx]; state.targetIdx=state.target.i; state.guesses=[]; state.isRandom=true; state.isDaily=false; state.isChallenge=false; computeClosest(); return state.target; }
  function switchDailySlot(slot){
    if(slot<0||slot>=5) return null; if(!state.dailyPool||!state.dailyPool.length) return null;
    state.dailySlot=slot; state.target=state.dailyPool[slot]; state.targetIdx=state.target.i; state.guesses=[];
    try{ computeClosest(); }catch{} return state.target;
  }

  window.VHPastModern={
    init, state:()=>state, computeClosest, guessModern, rankOfModernName, warmCold, pickRandomPast, getStreak, onDailyWin, onDailyLoss, msToNextDaily, fmtHMS,
    OKABE, ARCH_NAMES, parseYear,
    getDailyState, switchDailySlot, buildDailyPool, hashStr, fetchIp
  };
  // node QA hook (browser-ignored)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildDailyPool: buildDailyPool, hashStr: hashStr };
  }
})();
