/* Vector Hoops — game.js vNext simplified 2-loop pivot
 * Daily — Guess + Insight: 1 mystery per day, 6 guesses, 64-d cosine, era-z skill delta, archetype bridge, cross-era neighbors
 * Lab — Fusion A+B=C chimera: blend skill DNA, archetype, next profile, position fit
 * Data: 12966 seasons, grades per season, embeddings
 */
(function(){
  'use strict';
  if(window.VHGame) return;
  const LS_DAILY='vh.daily.v2';
  const LS_STREAK='vh.streak';
  let DATA=null, PLAYERS=[], TARGET_IDX=null, GUESSES=[];

  function puzzleNum(){ return InsightEngine ? InsightEngine.puzzleNumber() : 1; }

  async function ensureData(){
    if(!window.InsightEngine) throw new Error('InsightEngine not loaded — include insight-engine.js before game.js');
    await InsightEngine.init();
    DATA=InsightEngine;
    PLAYERS=InsightEngine.listPlayers();
    await new Promise(r=>{ if(window.VHMtnn) VHMtnn.load(()=>r()); else r(); });
    TARGET_IDX=InsightEngine.dailyIndex();
    return { data:DATA, players:PLAYERS, target:TARGET_IDX };
  }

  function whyClose(targetIdx, guessIdx){
    const sim = window.VHMtnn ? VHMtnn.sim(targetIdx, guessIdx) : 0;
    const pcT = PLAYERS[targetIdx]; const pcG = PLAYERS[guessIdx];
    const dx = pcG ? (pcG.x - pcT.x).toFixed(2) : '?'; const dy = pcG ? (pcG.y - pcT.y).toFixed(2) : '?'; const dz = pcG ? (pcG.z - pcT.z).toFixed(2) : '?';
    const skillD = InsightEngine.skillDeltas(targetIdx, guessIdx);
    const archT = InsightEngine.archetypeStory(targetIdx);
    const archG = InsightEngine.archetypeStory(guessIdx);
    const eraT = InsightEngine.eraContext(targetIdx);
    const eraG = InsightEngine.eraContext(guessIdx);
    return {
      sim: sim,
      simPct: (sim*100).toFixed(1),
      dx, dy, dz,
      skillTop: skillD ? skillD.top3 : [],
      skillSummary: skillD ? skillD.summary : '',
      archT, archG,
      eraT, eraG,
      bullets: [
        `64-d cosine ${(sim*100).toFixed(1)}% — PC1 paint→perim Δ${dx}, PC2 scoring load Δ${dy}, PC3 ball-in-hand Δ${dz}`,
        skillD ? `Skill delta: ${skillD.top3.slice(0,2).map(d=>`${d.skill} ${d.from}→${d.to} (${d.delta>0?'+':''}${d.delta})`).join(', ')} — ${skillD.closeness.score}% close` : 'Skill delta n/a',
        archT && archG ? `Archetype bridge: ${archG.gameClusterName} / ${archG.mtnnGlobalName} → ${archT.gameClusterName} / ${archT.mtnnGlobalName} — ${archT.mtnnGlobal===archG.mtnnGlobal?'same global archetype':'cross-archetype bridge'}` : 'Archetype n/a'
      ]
    };
  }

  function crossEra(targetIdx, k){
    if(!DATA) return [];
    const refSeason=DATA._data.players[targetIdx].season;
    return InsightEngine.findCrossEraComps(targetIdx, {k:k||5, crossEraOnly:true, refSeason});
  }

  function fuseInsights(aIdx,bIdx){
    if(!DATA) throw new Error('init first');
    const fuse = InsightEngine.fuseAndSearch(aIdx,bIdx,6);
    const pa = PLAYERS[aIdx], pb=PLAYERS[bIdx];
    const best = fuse.nearest[0];
    const insight = {
      equation: `${pa.name} ${pa.season} + ${pb.name} ${pb.season} = ${best ? best.sim_pct+'% '+best.name+' '+best.season : 'fusing'}`,
      pc1: `PC1 paint→perimeter — paint vs perimeter axis, low=shooting/gravity high=offensive glass/rim. A x=${pa.x.toFixed(2)} B x=${pb.x.toFixed(2)} fused x=${fuse.xyz.x.toFixed(2)}`,
      pc2: `PC2 scoring load — glue vs volume. A y=${pa.y.toFixed(2)} B y=${pb.y.toFixed(2)} fused y=${fuse.xyz.y.toFixed(2)}`,
      pc3: `PC3 ball-in-hand — off-ball vs playmaking/steals. A z=${pa.z.toFixed(2)} B z=${pb.z.toFixed(2)} fused z=${fuse.xyz.z.toFixed(2)}`,
      nearest: fuse.nearest,
      skillBlend: fuse.skillBlend,
      skillLabels: DATA._data.skillsList,
      archA: InsightEngine.archetypeStory(aIdx),
      archB: InsightEngine.archetypeStory(bIdx),
      archBest: best ? InsightEngine.archetypeStory(best.idx) : null,
      xyz: fuse.xyz
    };
    return insight;
  }

  function predictNextProfile(idx){ // simple heuristic from skill grades + archetype
    const grades = DATA._data.grades[idx];
    const skills = DATA._data.skillsList;
    const arch = InsightEngine.archetypeStory(idx);
    // map skills to position fit
    // scoring high = 2/3, playmaking high = 1, rebounding/def = 4/5
    const scoring = grades[skills.indexOf('scoring')]||50;
    const shooting = grades[skills.indexOf('shooting')]||50;
    const playmaking = grades[skills.indexOf('playmaking')]||50;
    const rebounding = grades[skills.indexOf('rebounding')]||50;
    const defense = grades[skills.indexOf('defense')]||50;
    let fit=[];
    if(playmaking>65) fit.push('PG primary creator');
    if(scoring>70 && shooting>60) fit.push('SG/SF volume scorer');
    if(rebounding>65 && defense>60) fit.push('C rim protector/glass');
    if(shooting>70 && rebounding<60) fit.push('wing spacer 3&D');
    if(!fit.length) fit.push('glue role');
    return { grades:grades, archName: arch ? arch.mtnnGlobalName : '?', fits:fit, summary:`${arch?arch.mtnnGlobalName:''} → ${fit.join(', ')}` };
  }

  // expose API for new play.html and future Lab
  window.VHGame = {
    ensureData,
    whyClose,
    crossEra,
    fuseInsights,
    predictNextProfile,
    puzzleNum,
    explainPlacement: (idx)=> InsightEngine ? InsightEngine.explainPlacement(idx) : null,
    eraContext: (idx)=> InsightEngine ? InsightEngine.eraContext(idx) : null
  };

  // auto-wire if old DOM exists? we support new 2-tab page only — legacy modes no-op
  void 0 /*log removed*/; //('[VHGame vNext] 2-loop pivot loaded — Daily Guess+Insight + Lab Fusion');
})();
