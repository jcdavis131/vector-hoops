/* past-modern-game.js — Past All-Star -> Guess Modern Twin | 100M DAU prod
   Loads: vectors_search_lite.json (12966 xyz), honors.json (asg), mtnn_embeddings via VHMtnn
   Game: daily past all-star (asg=1, season<2024) -> closest modern (2024-25/2025-26) by 48-d cosine
*/
(function(){
  const HONORS_URL = 'assets/honors.json';
  const SEARCH_LITE_URL = 'assets/vectors_search_lite.json';
  const MODERN_CUTOFF = 2023; // modern starts 2024-25
  const PAST_MAX = 2023;

  const OKABE = ['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const ARCH_NAMES=["Glass+Rim","LowVol Glass","Low Impact 3P Vol","Def Glass+Rim FT","Vol+3P Vol","3P Acc+Vol","Playmaking+Steals","Scoring Vol"];

  let state = {
    searchLite: null, // {count, players: [{i,n,s,x,y,z,c}]}
    honors: null, // bySeason map
    pastPool: [], // filtered all-stars past
    modernPool: [], // unique modern names latest idx
    modernByName: new Map(),
    modernListSorted: [], // per puzzle sorted by sim
    target: null, // past entry
    targetIdx: null,
    targetEmbeddingReady: false,
    closestModern: null,
    guesses: [],
    dayKey: null
  };

  function parseYear(seasonStr){
    // "1996-97" -> 1996, "2024-25" -> 2024
    let y = parseInt((seasonStr||'').slice(0,4),10);
    return isNaN(y)?0:y;
  }

  async function fetchJSON(url){
    const r = await fetch(url, {cache:'force-cache'});
    if(!r.ok) throw new Error('fetch '+url+' '+r.status);
    return r.json();
  }

  async function ensureMtnn(){
    // load mtnn.js if needed
    if(window.VHMtnn && window.VHMtnn.loadAsync){
      await window.VHMtnn.loadAsync();
      return;
    }
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='assets/mtnn.js'; s.async=true; s.onload=res; s.onerror=rej;
      document.head.appendChild(s);
    });
    if(window.VHMtnn && window.VHMtnn.loadAsync) await window.VHMtnn.loadAsync();
  }

  async function init(){
    const [lite, hon] = await Promise.all([fetchJSON(SEARCH_LITE_URL), fetchJSON(HONORS_URL)]);
    state.searchLite = lite;
    state.honors = hon.bySeason || hon;

    // Build pastPool: asg==1 and year <= PAST_MAX and year >=1996
    const past=[];
    for(const p of lite.players){
      const yr = parseYear(p.s);
      if(yr>PAST_MAX) continue;
      if(yr<1996) continue;
      const key = `${p.n}|${p.s}`;
      const h = state.honors[key];
      if(!h) continue;
      if(h.asg===1){ past.push(p); }
    }
    // sort past by year desc then name? Keep as is but dedupe same player same season already unique
    // To make game interesting, prioritize high allNbaVote or known names? Sort by allNbaTeam desc + vote
    past.sort((a,b)=>{
      const ha=state.honors[`${a.n}|${a.s}`]||{}, hb=state.honors[`${b.n}|${b.s}`]||{};
      const va=(hb.allNbaTeam||0)*1000 + (hb.allNbaVotePts||0) - ((ha.allNbaTeam||0)*1000 + (ha.allNbaVotePts||0));
      if(va!==0) return va;
      return b.s.localeCompare(a.s);
    });
    state.pastPool = past;

    // Build modernPool: seasons 2024-25 and 2025-26 unique by name latest
    const modernCandidates = lite.players.filter(p=>{
      const yr=parseYear(p.s);
      return yr>=2024; // 2024 and 2025
    });
    const byName = new Map();
    for(const p of modernCandidates){
      const yr=parseYear(p.s);
      const existing = byName.get(p.n);
      if(!existing || parseYear(existing.s) < yr || (parseYear(existing.s)===yr && p.s>existing.s)){
        byName.set(p.n, p);
      }
    }
    const modern = Array.from(byName.values());
    // sort alpha for autocomplete
    modern.sort((a,b)=>a.n.localeCompare(b.n));
    state.modernPool = modern;
    state.modernByName = byName;
    // also map name lowercase -> entry
    state.modernByLower = new Map(modern.map(m=>[m.n.toLowerCase(), m]));

    await ensureMtnn();

    // pick daily — supports ?day=YYYY-MM-DD for challenge links, ?r=pastIdx for random challenges, ?mode=random
    let urlDay=null, urlRandomId=null, modeParam=null;
    try{
      const sp=new URLSearchParams(location.search);
      const d=sp.get('day')||sp.get('d');
      if(d && /^\d{4}-\d{2}-\d{2}$/.test(d)) urlDay=d;
      const r=sp.get('r')||sp.get('past');
      if(r!=null){
        const n=parseInt(r,10);
        if(!Number.isNaN(n)) urlRandomId=n;
      }
      modeParam = sp.get('mode')||sp.get('m');
    }catch{}
    const today = new Date();
    const todayKey = today.toISOString().slice(0,10);
    const dayKey = urlDay || todayKey;
    state.dayKey = dayKey;
    state.todayKey = todayKey;
    state.urlDay = urlDay;
    state.urlRandomId = urlRandomId;
    state.modeParam = modeParam;
    state.isRandom = !!(urlRandomId!=null || (modeParam && modeParam.toLowerCase()==='random'));
    state.isChallenge = !!urlDay && urlDay!==todayKey;
    state.isDaily = !state.isRandom && !state.isChallenge;
    // puzzle num from dayKey 2026-07-01 epoch
    const dayObj = new Date(dayKey+'T12:00:00Z');
    const puzzleNum = Math.floor((dayObj - new Date('2026-07-01T00:00:00Z'))/86400000)+1;
    state.puzzleNum = puzzleNum>0? puzzleNum : 1;

    let targetPicked=null;
    if(urlRandomId!=null){
      // find by i == urlRandomId in pastPool otherwise fallback to lite index
      targetPicked = past.find(p=>p.i===urlRandomId) || null;
      if(!targetPicked){
        // try search lite directly then validate it is all-star
        const liteFound = lite.players.find(p=>p.i===urlRandomId);
        if(liteFound){
          const key = `${liteFound.n}|${liteFound.s}`;
          if(state.honors[key] && state.honors[key].asg===1) targetPicked=liteFound;
        }
      }
    }
    if(!targetPicked && modeParam && modeParam.toLowerCase()==='random'){
      // true random spin
      const idx = Math.floor(Math.random()*past.length);
      targetPicked = past[idx];
    }
    if(!targetPicked){
      // deterministic daily pick by dayKey
      let hash=0; for(let i=0;i<dayKey.length;i++) hash=(hash*31 + dayKey.charCodeAt(i))>>>0;
      const pastIdx = past.length? (hash % past.length) : 0;
      targetPicked = past[pastIdx] || null;
    }
    state.target = targetPicked;
    state.targetIdx = state.target? state.target.i : null;

    if(state.targetIdx!=null){
      // compute closest modern once embeddings ready
      try{ computeClosest(); }catch(e){ console.warn('computeClosest fail', e); }
    }
    return state;
  }

  function computeClosest(){
    if(state.target==null || !state.modernPool.length) return null;
    if(!window.VHMtnn || !window.VHMtnn.sim) throw new Error('VHMtnn not ready');
    let best=null, bestSim=-1;
    const sims=[];
    for(const m of state.modernPool){
      let sim=0;
      try{ sim = window.VHMtnn.sim(state.target.i, m.i); }catch(e){ sim = -1; }
      sims.push({m, sim});
      if(sim>bestSim){ bestSim=sim; best=m; }
    }
    sims.sort((a,b)=>b.sim-a.sim);
    state.modernListSorted = sims; // sorted descending
    state.closestModern = best ? {entry: best, sim: bestSim} : null;
    return state.closestModern;
  }

  function rankOfModernName(name){
    // name case-insensitive
    const low=name.toLowerCase();
    const entry = state.modernByLower.get(low);
    if(!entry) return null;
    // find in sorted
    for(let i=0;i<state.modernListSorted.length;i++){
      if(state.modernListSorted[i].m.n.toLowerCase()===low) return {rank:i, sim:state.modernListSorted[i].sim, entry: entry};
    }
    return null;
  }

  function guessModern(name){
    const r = rankOfModernName(name);
    if(!r) return {ok:false, reason:'Not a current 2024-26 player'};
    const already = state.guesses.find(g=>g.name.toLowerCase()===name.toLowerCase());
    if(already) return {ok:false, reason:'Already guessed'};
    const g = {name: r.entry.n, season: r.entry.s, idx: r.entry.i, sim: r.sim, rank: r.rank, x:r.entry.x, y:r.entry.y, z:r.entry.z, c:r.entry.c};
    state.guesses.push(g);
    return {ok:true, guess:g, isWin: r.rank===0, rank:r.rank};
  }

  function warmCold(){
    if(state.guesses.length<2) return null;
    const last = state.guesses[state.guesses.length-1];
    const prev = state.guesses[state.guesses.length-2];
    if(last.rank < prev.rank) return 'warmer 🔥';
    if(last.rank > prev.rank) return 'colder ❄️';
    return 'same';
  }

  // ---- streak v2 ----
  const STREAK_KEY='vh.streak.v2';
  const BEST_KEY='vh.best.streak.v2';
  function loadStreakRaw(){
    try{
      const raw=localStorage.getItem(STREAK_KEY);
      if(!raw) return {streak:0, lastPlayedDay:null, best:0, lastWin:false};
      const j=JSON.parse(raw);
      return {streak:j.streak||0, lastPlayedDay:j.lastPlayedDay||null, best:j.best||j.streak||0, lastWin:!!j.lastWin};
    }catch{ return {streak:0,lastPlayedDay:null,best:0,lastWin:false}; }
  }
  function saveStreakRaw(obj){
    try{ localStorage.setItem(STREAK_KEY, JSON.stringify(obj)); }catch{}
  }
  function getStreak(){ return loadStreakRaw(); }
  function onDailyWin(dayKey){
    if(!dayKey) return 0;
    const cur=getStreak();
    if(cur.lastPlayedDay===dayKey) return cur.streak; // already counted
    let nxtStreak=1;
    if(cur.lastPlayedDay){
      const d1=new Date(cur.lastPlayedDay+'T00:00:00Z');
      const d2=new Date(dayKey+'T00:00:00Z');
      const diff=Math.round((d2-d1)/86400000);
      if(diff===1) nxtStreak=cur.streak+1;
      else if(diff===0) nxtStreak=cur.streak;
      else nxtStreak=1;
    }
    const best=Math.max(cur.best||0, nxtStreak);
    const updated={streak:nxtStreak, lastPlayedDay:dayKey, best:best, lastWin:true};
    saveStreakRaw(updated);
    try{ localStorage.setItem('vh.streak', JSON.stringify({streak:nxtStreak})); }catch{}
    return nxtStreak;
  }
  function onDailyLoss(dayKey){
    // break streak but keep lastPlayedDay
    const cur=getStreak();
    const updated={streak:0, lastPlayedDay:dayKey, best:cur.best||cur.streak||0, lastWin:false};
    saveStreakRaw(updated);
    try{ localStorage.setItem('vh.streak', JSON.stringify({streak:0})); }catch{}
    return 0;
  }
  function msToNextDaily(){
    const now=new Date();
    const tomorrow=new Date(now); tomorrow.setDate(tomorrow.getDate()+1); tomorrow.setHours(0,0,0,0);
    return tomorrow-now;
  }
  function fmtHMS(ms){
    const s=Math.floor(ms/1000); const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); const sec=s%60;
    if(h>0) return `${h}h ${m}m`;
    if(m>0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  function resetDaily(){
    state.guesses=[];
  }

  function pickRandomPast(){
    if(!state.pastPool.length) return null;
    const idx = Math.floor(Math.random()*state.pastPool.length);
    state.target = state.pastPool[idx];
    state.targetIdx = state.target.i;
    state.guesses=[];
    state.isRandom=true;
    state.isDaily=false;
    state.isChallenge=false;
    computeClosest();
    return state.target;
  }

  window.VHPastModern = {
    init,
    state: ()=>state,
    computeClosest,
    guessModern,
    rankOfModernName,
    warmCold,
    pickRandomPast,
    getStreak,
    onDailyWin,
    onDailyLoss,
    msToNextDaily,
    fmtHMS,
    OKABE,
    ARCH_NAMES,
    parseYear
  };
})();
