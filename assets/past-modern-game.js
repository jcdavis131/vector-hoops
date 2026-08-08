/* past-modern-game.js — Past All-Star -> Guess Modern Twin | 100M DAU prod
   Loads: vectors_search_lite.json (12966 xyz), honors.json (asg), mtnn_embeddings via VHMtnn
   Game: daily past all-star (asg=1, season<2024) -> closest modern (2024-25/2025-26) by 48-d cosine
   Daily Court = 5 deterministic puzzles per day, broader meta game
   Pack Battle v2 — production-grade: progress, persistence, battle vs challenger, share with scores
*/
(function(){
  const HONORS_URL = 'assets/honors.json';
  const SEARCH_LITE_URL = 'assets/vectors_search_lite.json';
  const MODERN_CUTOFF = 2023;
  const PAST_MAX = 2023;
  const OKABE = ['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#FFFEF7'];
  const ARCH_NAMES=["Glass+Rim","LowVol Glass","Low Impact 3P Vol","Def Glass+Rim FT","Vol+3P Vol","3P Acc+Vol","Playmaking+Steals","Scoring Vol"];
  const PACK_PREFIX = 'vh.pack.';
  const PACK_CURRENT_KEY = 'vh.pack.current';
  const PACK_MAX = 5;

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
  let _mtnnP=null;
  async function ensureMtnn(){
    // memoized: all callers share one in-flight load; cleared on failure so a later call retries
    if(_mtnnP) return _mtnnP;
    _mtnnP=(async ()=>{
      if(window.VHMtnn && window.VHMtnn.loadAsync){
        await window.VHMtnn.loadAsync(); return;
      }
      await new Promise((res,rej)=>{
        const s=document.createElement('script'); s.src='assets/mtnn.js'; s.async=true; s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
      if(window.VHMtnn && window.VHMtnn.loadAsync) await window.VHMtnn.loadAsync();
    })().catch(e=>{ _mtnnP=null; throw e; });
    return _mtnnP;
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
      fetch('assets/mtnn_meta.json').then(r=>r.ok?r.json():null).then(m=>{
        if(m&&m.built&&idx.built&&m.built!==idx.built)
          console.warn('scoring_lite stale: built '+idx.built+' vs mtnn '+m.built+' — rerun pipeline/build_scoring_lite.py');
      }).catch(()=>{});
      const r=await fetch('assets/scoring_lite.f32?v=56',{cache:'force-cache'});
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
  // cosine sim by global row id from whichever source is available; null if neither covers the pair
  function simById(a,b){
    if(window.VHMtnn && window.VHMtnn.isReady && window.VHMtnn.isReady()){
      try{ const s=window.VHMtnn.sim(a,b); if(typeof s==='number'&&!isNaN(s)) return s; }catch{}
    }
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
  // lite first; full matrix only if the current target sits outside the lite subset
  function ensureScoring(){
    return loadScoringLite()
      .then(()=>{ try{ computeClosest(); }catch{} if(!state.rankingReady) return ensureMtnn().then(()=>{ try{ computeClosest(); }catch{} }); })
      .catch(()=> ensureMtnn().then(()=>{ try{ computeClosest(); }catch{} }));
  }
  function hashStr(s){
    let h=0; for(let i=0;i<s.length;i++){ h=(h*31 + s.charCodeAt(i))>>>0; } return h;
  }
  function buildDailyPool(dayKey, past){
    const pool=[]; const usedNames=new Set();
    for(let slot=0; slot<5; slot++){
      let h = hashStr(dayKey + '|daily-court-v2|' + slot);
      let idx = h % past.length;
      let guard=0;
      while((usedNames.has(past[idx].n) || pool.some(p=>p.i===past[idx].i)) && guard<120){
        h = (h*33 + 7 + guard)>>>0;
        idx = h % past.length;
        guard++;
      }
      pool.push(past[idx]);
      usedNames.add(past[idx].n);
    }
    return pool;
  }
  function getDailySlotFromIp(ip, dayKey){
    if(!ip) return null;
    return hashStr(ip + '|'+dayKey+'|court') % 5;
  }

  // ---------- pack helpers v2 ----------
  function shuffleArray(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const tmp=a[i]; a[i]=a[j]; a[j]=tmp; } return a; }
  function parseIdList(raw){
    if(!raw) return [];
    return raw.split(/[-,_\s]+/).map(s=>s.trim()).filter(Boolean).map(s=>parseInt(s,10)).filter(n=>!Number.isNaN(n)&&n>=0);
  }
  function parseScores(raw){
    // scores: 0=fail, 1-6 = win in N. Also allow 7 as fail alias
    if(!raw) return [];
    return raw.split(/[-,_\s]+/).map(s=>s.trim()).filter(Boolean).map(s=>{
      const n=parseInt(s,10);
      if(Number.isNaN(n)) return 0;
      if(n<0) return 0;
      if(n===0) return 0;
      if(n>6) return 0; // 7+ => fail
      return n;
    });
  }
  function packStorageKey(code){ return PACK_PREFIX + code; }
  function savePackState(){
    try{
      if(!state.isPack || !state.packCode) return;
      const data = {
        v:3,
        ids: state.packIds,
        results: state.packResults,
        index: state.packIndex,
        size: state.packSize,
        challenger: state.packChallengerScores,
        code: state.packCode,
        currentGuesses: (state.guesses||[]).slice(),
        ts: Date.now()
      };
      localStorage.setItem(packStorageKey(state.packCode), JSON.stringify(data));
      localStorage.setItem(PACK_CURRENT_KEY, state.packCode);
    }catch{}
  }
  function loadPackState(code){
    try{
      if(!code) return null;
      const raw = localStorage.getItem(packStorageKey(code));
      if(!raw) return null;
      const j = JSON.parse(raw);
      if(!j || !Array.isArray(j.ids)) return null;
      return j;
    }catch{return null;}
  }
  function clearPackState(code){
    try{
      if(code) localStorage.removeItem(packStorageKey(code));
      const cur = localStorage.getItem(PACK_CURRENT_KEY);
      if(cur===code) localStorage.removeItem(PACK_CURRENT_KEY);
    }catch{}
  }
  function lookupPastById(id, past, lite, honorsMap){
    let found = past.find(p=>p.i===id); if(found) return found;
    const lf = lite.players.find(p=>p.i===id); if(!lf) return null;
    if(honorsMap){ const key=`${lf.n}|${lf.s}`; const h=honorsMap[key]; if(!h || h.asg!==1){ const yr=parseYear(lf.s); if(yr>PAST_MAX || yr<1996) return null; } }
    return lf;
  }
  function generateRandomPack(n){
    const size=Math.max(1,Math.min(PACK_MAX,n||3));
    if(!state.pastPool || !state.pastPool.length) return [];
    const byName=new Map();
    for(const p of state.pastPool){ if(!byName.has(p.n)) byName.set(p.n,p); }
    let unique=Array.from(byName.values());
    if(unique.length<size) unique=state.pastPool.slice();
    const shuffled=shuffleArray(unique);
    return shuffled.slice(0,size);
  }
  function startPackFromIds(ids, options){
    options = options || {};
    if(!ids||!ids.length) return null;
    const limited = ids.slice(0, PACK_MAX);
    const entries=[];
    for(const id of limited){
      const ent=lookupPastById(id, state.pastPool, state.searchLite, state.honors);
      if(ent) entries.push(ent);
    }
    if(!entries.length) return null;
    // dedup by id AND by name (keep first occurrence in order)
    const seenId=new Set();
    const seenName=new Set();
    const deduped=[];
    for(const e of entries){
      if(seenId.has(e.i)) continue;
      if(seenName.has(e.n)) continue;
      seenId.add(e.i);
      seenName.add(e.n);
      deduped.push(e);
    }
    if(!deduped.length) return null;
    state.packEntries=deduped;
    state.packIds=deduped.map(e=>e.i);
    state.packSize=deduped.length;
    state.packCode=state.packIds.join('-');
    state.isPack=true;
    state.isPackComplete=false;

    // try restore from storage unless forceFresh
    let restored = null;
    if(!options.forceFresh){
      const saved = loadPackState(state.packCode);
      if(saved && Array.isArray(saved.ids) && saved.ids.join('-')===state.packCode && Array.isArray(saved.results)){
        restored = saved;
      }
    }

    if(restored){
      // normalize results length
      let results = restored.results;
      if(results.length !== state.packSize){
        // pad/truncate
        const newRes = new Array(state.packSize).fill(null);
        for(let i=0;i<Math.min(results.length, state.packSize);i++) newRes[i]=results[i];
        results = newRes;
      }
      state.packResults = results;
      // determine next index
      let idx = restored.index;
      if(typeof idx !== 'number' || idx<0 || idx>=state.packSize) idx = 0;
      // if results[idx] exists and there is later null, jump to first null
      const firstNull = results.findIndex(r=>!r);
      if(firstNull!==-1){
        // if saved index points to completed slot and next is null, go to null
        if(results[idx] && firstNull!==idx){
          // find first incomplete from idx onward, else first incomplete overall
          let next = -1;
          for(let i=idx;i<state.packSize;i++){ if(!results[i]){ next=i; break; } }
          if(next===-1) next = firstNull;
          idx = next;
        }
      } else {
        // all done
        state.isPackComplete = true;
        idx = state.packSize-1;
      }
      state.packIndex = idx;
      // if all results filled, mark complete
      if(results.every(r=>!!r)) state.isPackComplete = true;

      // restore current in-progress guesses if any and we are not complete
      if(!state.isPackComplete && Array.isArray(restored.currentGuesses) && restored.currentGuesses.length && idx===restored.index){
        state.guesses = restored.currentGuesses.slice();
      }
    } else {
      state.packIndex=0;
      state.packResults=new Array(deduped.length).fill(null);
    }

    // keep challenger scores from URL if provided, else from restored
    if(options.challengerScores && options.challengerScores.length){
      state.packChallengerScores = options.challengerScores.slice(0, state.packSize);
    } else if(restored && restored.challenger){
      // if URL didn't have challenger but saved did, keep saved UNLESS URL had explicit empty (meaning no battle)
      if(!state.packChallengerScores || !state.packChallengerScores.length){
        state.packChallengerScores = restored.challenger;
      }
    }

    state.target=state.packEntries[state.packIndex];
    state.targetIdx=state.target ? state.target.i : null;
    state.guesses = [];
    state.isPack = true;
    try{ computeClosest(); }catch(e){ console.warn('computeClosest pack fail', e); }
    savePackState();
    return state.target;
  }
  function advancePack(resultObj){
    if(!state.isPack) return null;
    const idx=state.packIndex;
    if(!state.packResults) state.packResults=new Array(state.packSize).fill(null);
    // resultObj optional, otherwise build from state.guesses
    let result = resultObj;
    if(!result){
      const guesses=state.guesses||[];
      const won=guesses.some(g=>g.rank===0);
      result={guesses:guesses.slice(), won:won, count:guesses.length, solved:won, ts:Date.now()};
    }
    state.packResults[idx]=result;
    savePackState();

    if(idx+1<state.packSize){
      state.packIndex=idx+1;
      state.target=state.packEntries[state.packIndex];
      state.targetIdx=state.target.i;
      state.guesses=[];
      try{ computeClosest(); }catch(e){ console.warn(e); }
      savePackState();
      return state.target;
    } else {
      state.isPackComplete=true;
      savePackState();
      return null;
    }
  }
  function resetCurrentPack(){
    if(!state.isPack) return null;
    state.packIndex=0;
    state.packResults=new Array(state.packSize).fill(null);
    state.isPackComplete=false;
    state.target=state.packEntries[0];
    state.targetIdx=state.target.i;
    state.guesses=[];
    try{ computeClosest(); }catch{}
    savePackState();
    return state.target;
  }
  function abandonPack(){
    if(state.packCode) clearPackState(state.packCode);
    state.isPack=false;
    state.isPackComplete=false;
    state.packEntries=[];
    state.packIds=[];
    state.packSize=0;
    state.packIndex=0;
    state.packResults=[];
    state.packCode='';
    state.packChallengerScores=null;
    state.guesses=[];
  }
  function getPackState(){
    if(!state.isPack) return {isPack:false};
    let solved=0,totalGuesses=0, failed=0;
    const results=state.packResults||[];
    for(const r of results){ if(r){ if(r.won) { solved++; totalGuesses+=r.count||0; } else { failed++; totalGuesses+=r.count||6; } } }
    const completedCount = results.filter(Boolean).length;
    const avg = completedCount ? (totalGuesses / completedCount) : 0;
    const avgWin = solved ? (results.filter(r=>r&&r.won).reduce((a,r)=>a+(r.count||0),0)/solved) : 0;
    return {isPack:true,size:state.packSize,index:state.packIndex,entries:state.packEntries,ids:state.packIds,results:state.packResults,code:state.packCode,complete:!!state.isPackComplete,solved,failed,totalGuesses,avg,avgWin,challengerScores:state.packChallengerScores||null, total:state.packSize, progress: completedCount};
  }
  function getPackBattleSummary(){
    const ps = getPackState();
    if(!ps.isPack) return null;
    const self = ps;
    const challScores = ps.challengerScores||[];
    let challSolved=0, challTotal=0;
    for(let i=0;i<ps.size;i++){
      const sc = challScores[i];
      if(typeof sc==='number' && sc>=1 && sc<=6){ challSolved++; challTotal+=sc; }
      else if(typeof sc==='number' && sc===0){ challTotal+=7; } else if(sc!=null){ challTotal+=7; }
    }
    const selfScoreForUrl = (ps.results||[]).map(r=> r ? (r.won ? r.count : 0) : 0);
    const battle = {
      hasChallenger: challScores.length>0,
      selfSolved: self.solved,
      selfTotal: self.totalGuesses,
      selfAvg: self.avg,
      selfAvgWin: self.avgWin,
      challSolved,
      challTotal,
      challAvg: challScores.length ? (challTotal / ps.size) : 0,
      selfWins: false,
      isTie: false,
      results: ps.results,
      challengerScores: challScores,
      selfScores: selfScoreForUrl
    };
    if(battle.hasChallenger){
      if(self.solved > challSolved) battle.selfWins = true;
      else if(self.solved < challSolved) battle.selfWins = false;
      else {
        // same solved, fewer guesses wins
        if(self.totalGuesses < challTotal) battle.selfWins = true;
        else if(self.totalGuesses > challTotal) battle.selfWins = false;
        else battle.isTie = true;
      }
    }
    return battle;
  }
  function packShareUrl(ids, scores){
    const origin=(typeof location!=='undefined'&&location.origin)?location.origin:'';
    const list=Array.isArray(ids)?ids:state.packIds||[];
    if(!list.length) return origin+'/play';
    let url=origin+'/play?pack='+list.join('-');
    if(scores&&scores.length){
      const s = scores.map(v=> (typeof v==='number'? v : 0)).join('-');
      url+='&s='+s;
    } else if(state.packResults && state.packResults.length){
      // auto-include self scores when sharing after completion
      const selfScores = state.packResults.map(r=> r ? (r.won ? r.count : 0) : 0);
      if(selfScores.some(v=>v>0)){
        url+='&s='+selfScores.join('-');
      }
    }
    return url;
  }
  function packChallengeUrl(ids){
    // URL for friends to play same pack, WITHOUT scores (so they become challenger)
    const origin=(typeof location!=='undefined'&&location.origin)?location.origin:'';
    const list=Array.isArray(ids)?ids:state.packIds||[];
    if(!list.length) return origin+'/play';
    return origin+'/play?pack='+list.join('-');
  }

  // DAILY COURT helpers
  function getDailyState(){
    if(!state.dailyPool||!state.dailyPool.length) return {isDailyCourt:false};
    const dayKey=state.dayKey;
    const pool=state.dailyPool;
    let solved=0, totalGuesses=0, slotResults=[];
    for(let i=0;i<pool.length;i++){
      try{
        const raw=localStorage.getItem('vh.daily.v2.'+dayKey+'.slot'+i);
        if(raw){
          const j=JSON.parse(raw);
          const won = (j.guesses||[]).some(g=>g.rank===0);
          const count = (j.guesses||[]).length;
          if(won) solved++;
          totalGuesses+=count;
          slotResults[i]={won, count, guesses:j.guesses||[]};
        } else {
          slotResults[i]=null;
        }
      }catch{ slotResults[i]=null; }
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
    try{
      const r=await fetch('/api/ip', {cache:'no-store'});
      if(r.ok){ const j=await r.json(); if(j.ip) return j.ip; }
    }catch{}
    try{
      const r=await fetch('https://api.ipify.org?format=json', {cache:'no-store'});
      if(r.ok){ const j=await r.json(); return j.ip||null; }
    }catch{}
    return null;
  }

  let state={
    searchLite:null, honors:null, pastPool:[], modernPool:[], modernByName:new Map(), modernByLower:new Map(), modernListSorted:[], target:null, targetIdx:null, closestModern:null, guesses:[],
    dayKey:null, todayKey:null, urlDay:null, urlRandomId:null, modeParam:null,
    isRandom:false,isChallenge:false,isDaily:false,isPack:false,
    packEntries:[],packIds:[],packSize:0,packIndex:0,packResults:[],packCode:'',isPackComplete:false,packChallengerScores:null,
    dailyPool:[],dailySlot:0,dailyTotal:5,dailyIsPractice:false,dailyAssignedSlot:null,ip:null,
    puzzleNum:1,
    _rawPackParam:null, _rawScoresParam:null
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
    const byName=new Map();
    for(const p of modernCandidates){
      const yr=parseYear(p.s); const ex=byName.get(p.n);
      if(!ex || parseYear(ex.s)<yr || (parseYear(ex.s)===yr && p.s>ex.s)) byName.set(p.n,p);
    }
    const modern=Array.from(byName.values()).sort((a,b)=>a.n.localeCompare(b.n));
    state.modernPool=modern; state.modernByName=byName; state.modernByLower=new Map(modern.map(m=>[m.n.toLowerCase(),m]));

    let urlDay=null,urlRandomId=null,modeParam=null,packParam=null,packSizeParam=null,scoresParam=null,slotParam=null;
    try{
      const sp=new URLSearchParams(location.search);
      const d=sp.get('day')||sp.get('d'); if(d && /^\d{4}-\d{2}-\d{2}$/.test(d)) urlDay=d;
      const r=sp.get('r')||sp.get('past'); if(r!=null){ const n=parseInt(r,10); if(!Number.isNaN(n)) urlRandomId=n; }
      modeParam=sp.get('mode')||sp.get('m');
      packParam=sp.get('pack')||sp.get('p')||sp.get('packCode');
      packSizeParam=sp.get('n')||sp.get('size')||sp.get('packSize');
      scoresParam=sp.get('s')||sp.get('scores')||sp.get('score');
      const sParam=sp.get('slot')||sp.get('dailySlot')||sp.get('court'); if(sParam!=null){ const sn=parseInt(sParam,10); if(!Number.isNaN(sn)&&sn>=0&&sn<5) slotParam=sn; }
      state._rawPackParam=packParam; state._rawScoresParam=scoresParam;
    }catch{}

    const today=new Date(); const todayKey=today.toISOString().slice(0,10); const dayKey=urlDay||todayKey;
    state.dayKey=dayKey; state.todayKey=todayKey; state.urlDay=urlDay; state.urlRandomId=urlRandomId; state.modeParam=modeParam;
    state.isRandom=!!(urlRandomId!=null || (modeParam && modeParam.toLowerCase()==='random'));
    state.isChallenge=!!urlDay && urlDay!==todayKey;
    state.isDaily=!state.isRandom && !state.isChallenge;
    state.isPack=false;
    state.packChallengerScores=scoresParam?parseScores(scoresParam):null;

    // pack priority - production handling
    let packHandled=false;
    let packStartIds=null;
    if(packParam){
      if(typeof packParam==='string' && packParam.toLowerCase()==='random'){
        let n=parseInt(packSizeParam||'3',10); if(!n||isNaN(n)) n=3; n=Math.max(1,Math.min(PACK_MAX,n));
        const entries=generateRandomPack(n);
        packStartIds=entries.map(e=>e.i);
        packHandled=packStartIds.length>0;
      } else {
        const ids=parseIdList(packParam);
        if(ids.length){ packStartIds=ids; }
      }
    }
    if(!packHandled && modeParam && modeParam.toLowerCase()==='pack'){
      let n=parseInt(packSizeParam||'3',10); if(isNaN(n)||!n) n=3; n=Math.max(1,Math.min(PACK_MAX,n));
      const entries=generateRandomPack(n);
      packStartIds=entries.map(e=>e.i);
      packHandled=packStartIds.length>0;
    }

    if(packHandled && packStartIds){
      const t=startPackFromIds(packStartIds, {challengerScores: state.packChallengerScores});
      if(t){
        state.isPack=true; state.isDaily=false; state.isChallenge=false; state.isRandom=false; state.puzzleNum=1;
        if(state.targetIdx!=null){ try{ computeClosest(); }catch{} }
        // v42: stabilize random pack URL — replace ?pack=random with actual IDs so refresh keeps same pack
        try{
          if(packParam && typeof packParam==='string' && packParam.toLowerCase()==='random'){
            const realCode = (state.packIds||[]).join('-');
            if(realCode){
              const url=new URL(location.href);
              url.searchParams.set('pack', realCode);
              url.searchParams.delete('n'); // optional: keep n? keep but set pack already implies size
              // keep n for UX but not needed
              history.replaceState(null,'',url.toString());
            }
          }
        }catch(e){ console.warn('pack random url replace fail', e); }
        // pack path returns early — kick scoring here too
        try{ ensureScoring().catch(()=>{}); }catch{}
        return state;
      } else {
        // invalid pack
        state.packInvalid = true;
        state.packInvalidRaw = packParam;
        // fall through to daily but mark invalid so UI can show error
        state.isPack=false;
        state.isPackComplete=false;
      }
    }

    // daily court pool
    const dailyPool=buildDailyPool(dayKey, past);
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
        for(let i=0;i<5;i++){
          const raw=localStorage.getItem('vh.daily.v2.'+dayKey+'.slot'+i);
          if(!raw){ firstUnsolved=i; found=true; break; }
          const j=JSON.parse(raw); const won=(j.guesses||[]).some(g=>g.rank===0); const over=(j.guesses||[]).length>=6;
          if(!won && !over){ firstUnsolved=i; found=true; break; }
        }
        if(!found){ firstUnsolved=0; }
      }catch{ firstUnsolved=0; }
      effectiveSlot=firstUnsolved;
    }

    fetchIp().then(ip=>{
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
    state.puzzleNum = baseNum*5 + effectiveSlot +1;

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
      const r=rankOfModernName(trimmed); if(!r) return {ok:false, reason:'Not a current 2024-26 player'};
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
  function warmCold(){
    try{
      const gs=state.guesses||[];
      if(gs.length<2) return null;
      const last=gs[gs.length-1]; const prev=gs[gs.length-2];
      if(!last||!prev||typeof last.rank!=='number'||typeof prev.rank!=='number') return null;
      if(last.rank<prev.rank) return 'warmer 🔥'; if(last.rank>prev.rank) return 'colder ❄️'; return 'same';
    }catch{ return null; }
  }

  const STREAK_KEY='vh.streak.v2';
  function loadStreakRaw(){ try{ const raw=localStorage.getItem(STREAK_KEY); if(!raw) return {streak:0,lastPlayedDay:null,best:0,lastWin:false}; const j=JSON.parse(raw); return {streak:j.streak||0,lastPlayedDay:j.lastPlayedDay||null,best:j.best||j.streak||0,lastWin:!!j.lastWin}; }catch{ return {streak:0,lastPlayedDay:null,best:0,lastWin:false}; } }
  function saveStreakRaw(obj){ try{ localStorage.setItem(STREAK_KEY, JSON.stringify(obj)); }catch{} }
  function getStreak(){ return loadStreakRaw(); }
  function onDailyWin(dayKey){
    if(!dayKey) return 0; const cur=getStreak(); if(cur.lastPlayedDay===dayKey) return cur.streak;
    let nxt=1; if(cur.lastPlayedDay){ const d1=new Date(cur.lastPlayedDay+'T00:00:00Z'); const d2=new Date(dayKey+'T00:00:00Z'); const diff=Math.round((d2-d1)/86400000); if(diff===1) nxt=cur.streak+1; else if(diff===0) nxt=cur.streak; else nxt=1; }
    const best=Math.max(cur.best||0,nxt); const updated={streak:nxt,lastPlayedDay:dayKey,best:best,lastWin:true}; saveStreakRaw(updated); try{ localStorage.setItem('vh.streak', JSON.stringify({streak:nxt})); }catch{} return nxt;
  }
  function onDailyLoss(dayKey){ const cur=getStreak(); const updated={streak:0,lastPlayedDay:dayKey,best:cur.best||cur.streak||0,lastWin:false}; saveStreakRaw(updated); try{ localStorage.setItem('vh.streak', JSON.stringify({streak:0})); }catch{} return 0; }
  function msToNextDaily(){ const now=new Date(); const tomorrow=new Date(now); tomorrow.setDate(tomorrow.getDate()+1); tomorrow.setHours(0,0,0,0); return tomorrow-now; }
  function fmtHMS(ms){ const s=Math.floor(ms/1000); const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); const sec=s%60; if(h>0) return `${h}h ${m}m`; if(m>0) return `${m}m ${sec}s`; return `${sec}s`; }

  function pickRandomPast(){ if(!state.pastPool.length) return null; const idx=Math.floor(Math.random()*state.pastPool.length); state.target=state.pastPool[idx]; state.targetIdx=state.target.i; state.guesses=[]; state.isRandom=true; state.isDaily=false; state.isChallenge=false; state.isPack=false; computeClosest(); return state.target; }
  function switchDailySlot(slot){
    if(slot<0||slot>=5) return null; if(!state.dailyPool||!state.dailyPool.length) return null;
    state.dailySlot=slot; state.target=state.dailyPool[slot]; state.targetIdx=state.target.i; state.guesses=[];
    try{ computeClosest(); }catch{} return state.target;
  }

  window.VHPastModern={
    init, state:()=>state, computeClosest, guessModern, rankOfModernName, warmCold, pickRandomPast, getStreak, onDailyWin, onDailyLoss, msToNextDaily, fmtHMS,
    OKABE, ARCH_NAMES, parseYear,
    generateRandomPack, startPackFromIds, advancePack, getPackState, packShareUrl, parseIdList, parseScores, getPackBattleSummary, resetCurrentPack, abandonPack, packChallengeUrl, savePackState, loadPackState, clearPackState,
    getDailyState, switchDailySlot, buildDailyPool, hashStr, fetchIp, PACK_MAX
  };
})();
