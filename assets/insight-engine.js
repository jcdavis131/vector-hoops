/* Vector Hoops — Insight Engine
 * Full MTNN: 12,966 seasons, 48-d L2, heads for archetype, position, next, skills
 * Assets are immutable edge-cached
 */
(function (global) {
  'use strict';
  const DATA = {
    players: null, features: null, featureLabels: null,
    skillsList: null, grades: null, assignments: null, seasonNorms: null,
    mtnnMap: null, mtnnArch: null, skillProbe: null,
    N:0, DIM:48, loaded:false, criticalLoaded:false,
    searchLite:null
  };
  const EPOCH = new Date('2026-07-01T00:00:00Z');
  const PC_DESCS = {
    x: 'PC1: paint vs perimeter — low = shooting/gravity, high = offensive glass/rim',
    y: 'PC2: scoring load — low = glue/role, high = volume scoring',
    z: 'PC3: ball-in-hand — low = off-ball/finisher, high = playmaking/steals'
  };
  async function fetchJSON(url){ const r=await fetch(url,{cache:'force-cache'}); if(!r.ok) throw new Error('fetch '+url+' '+r.status); return r.json(); }

  function dispatchFail(type, detail){
    try{ global.dispatchEvent(new CustomEvent(type, {detail: detail||{}})); }catch(e){}
  }
  function logLocal(key, obj){
    try{
      var raw=localStorage.getItem(key);
      var arr= raw ? JSON.parse(raw):[];
      arr.push(obj);
      if(arr.length>50) arr=arr.slice(-50);
      localStorage.setItem(key, JSON.stringify(arr));
    }catch(e){}
  }

  function ensureMtnnLoaded() {
    return new Promise(function(resolve){
      if (global.VHMtnn && global.VHMtnn.isReady && global.VHMtnn.isReady()){
        resolve(global.VHMtnn);
        return;
      }
      if (!global.VHMtnn || !global.VHMtnn.load) { resolve(null); return; }
      global.VHMtnn.load(function(cache){ 
        if(!cache){
          dispatchFail('vh:mtnn-failed',{error:'cache null after load'});
        }
        resolve(cache ? global.VHMtnn : null); 
      });
    });
  }

  async function initCritical(){
    if(DATA.criticalLoaded) return DATA;
    try{
      const [searchLite, norms, arch, probe] = await Promise.all([
        fetchJSON('assets/vectors_search_lite.json').catch(function(e){ dispatchFail('vh:vectors-failed',{url:'vectors_search_lite', error:String(e)}); return null; }),
        fetchJSON('assets/season_norms.json').catch(()=>({})),
        fetchJSON('assets/mtnn_arch.json').catch(()=>null),
        fetchJSON('assets/skill_probe.json').catch(()=>null)
      ]);
      if(searchLite){
        DATA.searchLite=searchLite;
        DATA.players=searchLite.players.map(function(p){ return {
          id:p.i, name:p.n, season:p.s, x:p.x, y:p.y, z:p.z, c:p.c,
          gp:0, mpg:0, total_min:0, v:null, label:p.n+' '+p.s
        };});
        DATA.N=DATA.players.length;
      } else {
        dispatchFail('vh:vectors-failed',{url:'vectors_search_lite.json null'});
        throw new Error('vectors_search_lite.json failed');
      }
      DATA.seasonNorms=norms.seasons || norms;
      DATA.features=['PTS','FGA','FG_PCT','FG3A','FG3_PCT','FTA','FT_PCT','OREB','DREB','AST','TOV','STL','BLK','PLUS_MINUS'];
      DATA.featureLabels={PTS:'Scoring',FGA:'Shot Attempt',FG_PCT:'FG%',FG3A:'3PA',FG3_PCT:'3P%',FTA:'FTA',FT_PCT:'FT%',OREB:'Off Glass',DREB:'Def Glass',AST:'Playmaking',TOV:'Turnover',STL:'Steals',BLK:'Blocks',PLUS_MINUS:'PlusMinus'};
      DATA.mtnnArch=arch;
      DATA.skillProbe=probe;
      // Ensure full MTNN 48-d embeddings + 45-d heads loaded (real trained model)
      await ensureMtnnLoaded();
      DATA.criticalLoaded=true;
      return DATA;
    }catch(err){
      logLocal('vh.errors',{ts:new Date().toISOString(), type:'insight', message:'initCritical fail '+err.message, stack:err.stack||''});
      dispatchFail('vh:insight-failed',{error:String(err), message:err.message});
      throw err;
    }
  }

  async function initFull(){
    if(DATA.loaded) return DATA;
    try{
      await initCritical();
      const [vectors, skillsData, assign, mtnnMap] = await Promise.all([
        fetchJSON('assets/vectors.json').catch(()=>null),
        fetchJSON('assets/skills.json').catch(()=>({})),
        fetchJSON('assets/archetype_assignments.json').catch(function(){ return fetchJSON('assets/archetype_lite.json').catch(function(){return null;}); }),
        fetchJSON('assets/mtnn_map.json').catch(function(){return null;})
      ]);
    if(vectors && vectors.players){
      // merge v if searchLite missing v
      if(DATA.players && vectors.players.length===DATA.players.length){
        for(var i=0;i<DATA.players.length;i++){
          var full=vectors.players[i];
          var p=DATA.players[i];
          p.v=full.v; p.gp=full.gp; p.mpg=full.mpg; p.total_min=full.total_min; p.sal=full.sal;
          if(!p.name) p.name=full.name;
          if(!p.season) p.season=full.season;
          p.label=p.name+' '+p.season;
        }
      } else if(!DATA.players){
        DATA.players=vectors.players;
        DATA.N=DATA.players.length;
      }
      DATA.features=vectors.features || DATA.features;
      DATA.featureLabels=vectors.featureLabels || DATA.featureLabels;
    }
    if(skillsData){
      if(Array.isArray(skillsData.skills)) DATA.skillsList=skillsData.skills.map(function(s){ return typeof s==='string'? s : s.key||s.label||'skill'; });
      else DATA.skillsList=skillsData.skills||[];
      DATA.grades=skillsData.grades || null;
    }
    DATA.assignments=assign ? (assign.assignments||assign) : null;
    DATA.mtnnMap=mtnnMap;
    DATA.loaded=true;
    return DATA;
    }catch(err){
      logLocal('vh.errors',{ts:new Date().toISOString(), type:'insight', message:'initFull fail '+err.message, stack:err.stack||''});
      dispatchFail('vh:insight-failed',{error:String(err), message:err.message});
      throw err;
    }
  }

  async function init(opts){
    if(opts && opts.lite) return initCritical();
    return initFull();
  }

  function getPlayer(idx){
    if(!DATA.players) throw new Error('not init');
    var p=DATA.players[idx];
    if(!p) return null;
    var grades=DATA.grades? DATA.grades[idx]:null;
    var arch=DATA.assignments? DATA.assignments[idx]:null;
    var mtnnHeads = (global.VHMtnn && global.VHMtnn.getHeads) ? global.VHMtnn.getHeads(idx) : null;
    return { idx: idx, id:p.id||idx, name:p.name, season:p.season, gp:p.gp||0, mpg:p.mpg||0, v:p.v, x:p.x, y:p.y, z:p.z, c:p.c, grades:grades, arch:arch, mtnnHeads:mtnnHeads, label:p.label||p.name+' '+p.season };
  }
  function listPlayers(){
    if(!DATA.players) return [];
    return DATA.players.map(function(p,i){ return { idx:i, id:p.id||i, name:p.name, season:p.season, label:p.label||p.name+' '+p.season, c:p.c, x:p.x, y:p.y, z:p.z }; });
  }
  function eraContext(idx){
    if(!DATA.players) throw new Error('init first');
    var pl=DATA.players[idx];
    if(!pl) return null;
    var season=pl.season;
    var norms=DATA.seasonNorms ? DATA.seasonNorms[season] : null;
    if(!norms){
      return { idx:idx, name:pl.name, season:season, summary:pl.name+' '+season+' — era-honest 1996→2026 z-scored', mostDistinct:{label:'Scoring',sigmaText:'n/a'}, mostDistinctList:[], topOver:[], topUnder:[], perFeature:[], learnings:['Era '+season] };
    }
    var feats=DATA.features;
    var v=pl.v;
    if(!v){
      return { idx:idx, name:pl.name, season:season, summary:pl.name+' '+season+' — era-z fair comparison (full per-100 loading)', mostDistinct:{label:'Scoring',sigmaText:'n/a'}, mostDistinctList:[], topOver:[], topUnder:[], perFeature:[], learnings:['Era '+season+' μ PTS '+ (norms.features && norms.features.PTS ? norms.features.PTS.mu.toFixed(1) : '?')] };
    }
    var perFeature=feats.map(function(f,i){
      var stat=norms.features[f];
      var mu=stat?stat.mu:0; var sd=stat?stat.sd:1; var z=v[i];
      return { feature:f, label:DATA.featureLabels[f]||f, z:z, mu:mu, sd:sd, per100_est: mu+z*sd, sigmaText: z>0? '+'+z.toFixed(2)+'σ above '+season+' avg' : z.toFixed(2)+'σ below '+season+' avg' };
    });
    var sorted=perFeature.slice().sort(function(a,b){return Math.abs(b.z)-Math.abs(a.z);});
    var topOver=perFeature.filter(function(p){return p.z>0;}).sort(function(a,b){return b.z-a.z;}).slice(0,3);
    var topUnder=perFeature.filter(function(p){return p.z<0;}).sort(function(a,b){return a.z-b.z;}).slice(0,3);
    var firstSeason='1996-97', lastSeason='2025-26';
    var firstNorm=DATA.seasonNorms[firstSeason], lastNorm=DATA.seasonNorms[lastSeason];
    var fg3aEvolution=null; if(firstNorm&&lastNorm&&firstNorm.features&&lastNorm.features){ fg3aEvolution={thenMu:firstNorm.features.FG3A.mu, nowMu:lastNorm.features.FG3A.mu}; }
    var overStr=topOver.map(function(p){return p.label+' '+p.sigmaText;}).join(', ');
    var underStr=topUnder.map(function(p){return p.label+' '+p.sigmaText;}).join(', ');
    return { idx:idx, name:pl.name, season:season, perFeature:perFeature, topOver:topOver, topUnder:topUnder, mostDistinct:sorted[0], mostDistinctList:sorted.slice(0,5), fg3aEvolution:fg3aEvolution, summary: pl.name+' in '+season+': '+(overStr? 'elite '+overStr:'')+(underStr? '; notably '+underStr+' below avg':'' )+'. Era-z ensures fair cross-era.', learnings:[
      'In '+season+', PTS per-100 μ '+(norms.features.PTS?norms.features.PTS.mu.toFixed(1):'?')+' ±'+(norms.features.PTS?norms.features.PTS.sd.toFixed(1):'?')+' — full MTNN uses '+sorted[0].label+' '+sorted[0].sigmaText+'.',
      '3PA context: '+firstSeason+' μ '+(fg3aEvolution?fg3aEvolution.thenMu.toFixed(1):'?')+' → '+lastSeason+' μ '+(fg3aEvolution?fg3aEvolution.nowMu.toFixed(1):'?')+' — era-honest z makes cross-decade fair.',
      'Most defining: '+sorted[0].label+' '+sorted[0].sigmaText
    ]};
  }

  function skillDeltas(aIdx,bIdx){
    // Prefer real MTNN heads (48→16→1 skill towers) if available, fallback to transparent 0-99 grades
    if (global.VHMtnn && global.VHMtnn.getHeads) {
      var ha = global.VHMtnn.getHeads(aIdx);
      var hb = global.VHMtnn.getHeads(bIdx);
      if (ha && hb) {
        var keys = DATA.mtnnArch ? DATA.mtnnArch.skillKeys : ['scoring','shooting','finishing','ft','playmaking','security','oreb','dreb','hands','rim','efficiency','impact','post','transition','motor','shooting_gravity','rim_gravity','disruption_gravity'];
        var diffs = [];
        for (var i=0;i<Math.min(ha.skills.length, hb.skills.length, keys.length); i++) {
          var from = ha.skills[i];
          var to = hb.skills[i];
          diffs.push({skill:keys[i], from: from.toFixed(2), to: to.toFixed(2), delta: to-from, absDelta: Math.abs(to-from), rawFrom: from, rawTo: to});
        }
        diffs.sort(function(a,b){return b.absDelta-a.absDelta;});
        return { aIdx:aIdx,bIdx:bIdx, diffs:diffs, top3:diffs.slice(0,3), summary:diffs.slice(0,3).map(function(d){return d.skill+ ' '+d.from+'→'+d.to+' ('+(d.delta>0?'+':'')+d.delta.toFixed(2)+')';}).join(', '), closeness:{avgAbs:(diffs.reduce(function(s,d){return s+d.absDelta;},0)/diffs.length).toFixed(2)}, source:'mtnn_heads 48→16→1 towers'};
      }
    }
    if(!DATA.grades) return { top3:[], summary:'skills loading', closeness:{score:'?'}, source:'transparent' };
    var ga=DATA.grades[aIdx], gb=DATA.grades[bIdx]; if(!ga||!gb) return null;
    var skills=DATA.skillsList; var diffs2=skills.map(function(sk,i){return {skill:typeof sk==='string'?sk:(sk.key||'S'+i), from:ga[i], to:gb[i], delta:gb[i]-ga[i], absDelta:Math.abs(gb[i]-ga[i])};}); diffs2.sort(function(a,b){return b.absDelta-a.absDelta;});
    return { aIdx:aIdx,bIdx:bIdx, diffs:diffs2, top3:diffs2.slice(0,3), summary:diffs2.slice(0,3).map(function(d){return d.skill+' '+d.from+'→'+d.to+' ('+(d.delta>0?'+':'')+d.delta+')';}).join(', '), closeness:{ avgAbs:(diffs2.reduce(function(s,d){return s+d.absDelta;},0)/diffs2.length).toFixed(1), score:(Math.max(0,100-diffs2.reduce(function(s,d){return s+d.absDelta;},0)/diffs2.length)).toFixed(0) }, source:'transparent_grades' };
  }

  function archetypeStory(idx){
    var ass=DATA.assignments?DATA.assignments[idx]:null;
    var pl=DATA.players?DATA.players[idx]:null;
    // Prefer real head probs
    if (global.VHMtnn && global.VHMtnn.predictArchetypeProbs) {
      var probs = global.VHMtnn.predictArchetypeProbs(idx);
      if (probs) {
        var archNames = DATA.mtnnArch ? DATA.mtnnArch.gameArchetypes : ['A0','A1','A2','A3','A4','A5','A6','A7'];
        var sorted = [];
        for (var i=0;i<probs.length;i++) sorted.push({i:i, p:probs[i], name:archNames[i]||('Archetype '+i)});
        sorted.sort(function(a,b){return b.p-a.p;});
        var top = sorted[0];
        return { idx:idx, name:pl?pl.name:null, season:pl?pl.season:null,
          mtnnGlobal: top.i, mtnnGlobalName: top.name, prob: top.p,
          gameCluster: ass ? (ass.gameCluster||ass.gc) : null, gameClusterName: ass ? (ass.gameClusterName||ass.gcn) : top.name,
          era: ass ? ass.era : null, eraNativeName: ass ? (ass.eraNativeName||ass.enn) : null, eraTags: ass ? (ass.eraTags||[]) : [],
          probs: sorted,
          story: (pl?pl.name+' '+pl.season+': ':'')+'MTNN heads predict '+top.name+' '+(top.p*100).toFixed(1)+'%',
          tripleStory: sorted.slice(0,3).map(function(s){return s.name+' '+(s.p*100).toFixed(0)+'%';}),
          source:'mtnn_heads 8-logits softmax'
        };
      }
    }
    if(!ass) return { mtnnGlobalName:'loading', gameClusterName:'loading', eraNativeName:'loading', story:'Archetype loading…', tripleStory:['loading'] };
    var mgn=ass.mtnnGlobalName||ass.mgn||('MG'+(ass.mtnnGlobal||ass.mg)); var gcn=ass.gameClusterName||ass.gcn||('GC'+(ass.gameCluster||ass.gc)); var enn=ass.eraNativeName||ass.enn||'era-native';
    return { idx:idx, name:pl?pl.name:null, season:pl?pl.season:null, mtnnGlobal:ass.mtnnGlobal||ass.mg, mtnnGlobalName:mgn, gameCluster:ass.gameCluster||ass.gc, gameClusterName:gcn, era:ass.era, eraNativeName:enn, eraTags:ass.eraTags||ass.et||[], story: (pl?pl.name+' '+pl.season+': ':'')+'In '+(ass.era||'era')+', "'+enn+'" → Global '+mgn+' / Game '+gcn, tripleStory:['Game: '+gcn,'Global: '+mgn,'Era '+(ass.era||'')+': '+enn], source:'assignments' };
  }

  function getEmbedding(idx){
    if (global.VHMtnn && global.VHMtnn.rowVector) {
      var v = global.VHMtnn.rowVector(idx);
      if (v) return v;
    }
    return null;
  }

  function cosineSim(a,b){
    var dim=a.length, dot=0,i;
    for(i=0;i<dim;i++) dot+=a[i]*b[i];
    return dot; // assumes L2-normed
  }

  function findCrossEraComps(query, opts){
    opts=opts||{}; var k=opts.k||5; var exclude=new Set(opts.excludeIdxs||[]); var requireCrossEra=opts.crossEraOnly||false; var refSeason=opts.refSeason||null;
    var mtnn = global.VHMtnn;
    if(!mtnn || !mtnn.isReady || !mtnn.isReady()){
      // fallback old scan if not ready
      return [];
    }
    var qVec, qIdx=null, qNameLower='';
    if(typeof query==='number'){ qIdx=query; qVec=mtnn.rowVector(qIdx); exclude.add(qIdx); if(DATA.players && DATA.players[qIdx]) qNameLower=DATA.players[qIdx].name.toLowerCase(); }
    else if(query instanceof Float32Array){ qVec=query; }
    else throw new Error('query idx or Float32Array');
    if(!qVec) return [];

    var filterFn = null;
    if(requireCrossEra && refSeason && DATA.players){
      var refYr=parseInt(refSeason.split('-')[0],10);
      filterFn = function(i){
        if(exclude.has(i)) return false;
        var pl=DATA.players[i]; if(!pl) return false;
        if(qNameLower && pl.name.toLowerCase()===qNameLower) return false; // never self across seasons
        var yr=parseInt(pl.season.split('-')[0],10);
        return Math.abs(yr-refYr)>=5;
      };
    } else {
      filterFn = function(i){ 
        if(exclude.has(i)) return false;
        if(qNameLower){
          var pl2=DATA.players[i]; if(pl2 && pl2.name.toLowerCase()===qNameLower) return false;
        }
        return true; 
      };
    }

    var raw;
    if (typeof query === 'number') {
      raw = mtnn.topK(query, k*4, filterFn);
    } else {
      var exMap={}; exclude.forEach(function(id){exMap[id]=true;});
      raw = mtnn.topKForVector(qVec, k*4, exMap);
      if(filterFn){
        raw = raw.filter(function(r){return filterFn(r.id);});
      }
    }
    var out=[];
    for(var i=0;i<raw.length && out.length<k;i++){
      var r=raw[i];
      var pl=DATA.players?DATA.players[r.id]:null;
      if(!pl) continue;
      if(qNameLower && pl.name.toLowerCase()===qNameLower) continue;
      if(requireCrossEra && refSeason){
        var yr=parseInt(pl.season.split('-')[0],10);
        var refY=parseInt(refSeason.split('-')[0],10);
        if(Math.abs(yr-refY)<5) continue;
      }
      out.push({ idx:r.id, name:pl.name, season:pl.season, dist:Math.sqrt(Math.max(0,2-2*r.sim)), sim:r.sim, sim_pct:(r.sim*100).toFixed(1), x:pl.x, y:pl.y, z:pl.z, c:pl.c, player:pl });
    }
    return out;
  }

  function explainPlacement(idx){
    var pl=DATA.players[idx]; if(!pl) return null;
    var axes=DATA.mtnnMap?DATA.mtnnMap.axes:[{pc:'PC1',name:'paint vs perimeter',lo:'shooting',hi:'off reb + rim'},{pc:'PC2',name:'scoring load',lo:'role/glue',hi:'volume scorer'},{pc:'PC3',name:'ball-in-hand',lo:'off-ball',hi:'playmaking'}];
    var x=pl.x,y=pl.y,z=pl.z;
    var xDesc=x<0.33?axes[0].lo:x>0.66?axes[0].hi:'balanced '+axes[0].name;
    var yDesc=y<0.33?axes[1].lo:y>0.66?axes[1].hi:'balanced '+axes[1].name;
    var zDesc=z<0.33?axes[2].lo:z>0.66?axes[2].hi:'balanced '+axes[2].name;
    var jacobian = null;
    if (global.VHMtnn && global.VHMtnn.getHeads) {
      jacobian = DATA.mtnnMap ? DATA.mtnnMap.populationInfluence : null;
    }
    return { idx:idx, name:pl.name, season:pl.season, x:x,y:y,z:z, axes:axes, contributions:[{axis:'X/PC1',value:x,desc:xDesc,pcDesc:PC_DESCS.x},{axis:'Y/PC2',value:y,desc:yDesc,pcDesc:PC_DESCS.y},{axis:'Z/PC3',value:z,desc:zDesc,pcDesc:PC_DESCS.z}], story:pl.name+' '+pl.season+' x='+x.toFixed(2)+' ('+xDesc+'), y='+y.toFixed(2)+' ('+yDesc+'), z='+z.toFixed(2)+' ('+zDesc+').', jacobianInfluence: jacobian };
  }

  function fuseAndSearch(aIdx,bIdx,k){
    k=k||6;
    var mtnn = global.VHMtnn;
    if(!mtnn || !mtnn.isReady || !mtnn.isReady()){
      return { nearest:[], skillBlend:null, xyz:{x:0,y:0,z:0}, summary:'MTNN loading — full 48-d embeddings' };
    }
    var aEmb=mtnn.rowVector(aIdx), bEmb=mtnn.rowVector(bIdx);
    if(!aEmb||!bEmb) throw new Error('bad idx '+aIdx+','+bIdx);
    var fused=mtnn.blend(aEmb,bEmb,0.5);
    var ex={}; ex[aIdx]=true; ex[bIdx]=true;
    var nearestRaw=mtnn.topKForVector(fused,k*3,ex);
    var comps=[];
    var nameA = DATA.players && DATA.players[aIdx] ? DATA.players[aIdx].name.toLowerCase() : '';
    var nameB = DATA.players && DATA.players[bIdx] ? DATA.players[bIdx].name.toLowerCase() : '';
    for(var i=0;i<nearestRaw.length && comps.length<k;i++){
      var r=nearestRaw[i];
      var pl=DATA.players?DATA.players[r.id]:null;
      if(!pl) continue;
      // never allow same player from another season as closest in fusion either (prevents trivial self chimera)
      if(pl.name && (pl.name.toLowerCase()===nameA || pl.name.toLowerCase()===nameB)) continue;
      comps.push({ idx:r.id, name:pl.name, season:pl.season, sim:r.sim, sim_pct:(r.sim*100).toFixed(1), dist:Math.sqrt(Math.max(0,2-2*r.sim)), x:pl.x,y:pl.y,z:pl.z,c:pl.c, player:pl });
    }
    var skillBlend=null, fuseHeads=null;
    if(mtnn.fuseHeads) fuseHeads=mtnn.fuseHeads(aIdx,bIdx,0.5);
    if(fuseHeads){
      skillBlend = Array.from(fuseHeads.skills).map(function(v){return Math.round(v*15+50);}); // approx to 0-99 for legacy UI, real raw available
    } else if(DATA.grades){
      var ga=DATA.grades[aIdx], gb=DATA.grades[bIdx];
      if(ga&&gb) skillBlend=ga.map(function(v,i){return Math.round((v+gb[i])/2);});
    }
    var pa=DATA.players[aIdx], pb=DATA.players[bIdx];
    var fusedXYZ={x:(pa.x+pb.x)/2,y:(pa.y+pb.y)/2,z:(pa.z+pb.z)/2};
    var top=comps[0];
    var archExplain=null;
    if(fuseHeads && DATA.mtnnArch){
      var probs = (function(logits){ var m=-Infinity; for(var j=0;j<logits.length;j++) if(logits[j]>m) m=logits[j]; var sum=0, out=new Float32Array(logits.length); for(var j=0;j<logits.length;j++){ out[j]=Math.exp(logits[j]-m); sum+=out[j]; } for(var j=0;j<logits.length;j++) out[j]/=sum; return out; })(fuseHeads.archetype_logits);
      var names=DATA.mtnnArch.gameArchetypes;
      var sorted=[];
      for(var j=0;j<probs.length;j++) sorted.push({name:names[j]||('A'+j), p:probs[j]});
      sorted.sort(function(a,b){return b.p-a.p;});
      archExplain=sorted.slice(0,3);
    }
    return { aIdx:aIdx,bIdx:bIdx,fused:fused,xyz:fusedXYZ,nearest:comps,skillBlend:skillBlend, fuseHeads:fuseHeads, archetypeBlend:archExplain, summary: (pa.name+' + '+pb.name+' → closest: '+(top?top.name+' '+top.season:'?')+' '+(top?top.sim_pct:'?')+'%'), source:'full MTNN 48-d L2 + 45-d heads' };
  }

  function dailyIndex(){
    var now=new Date(); var diff=Math.floor((now-EPOCH)/86400000); if(!DATA.N) return 0; return (diff*9113823)%DATA.N;
  }
  function puzzleNumber(){ return Math.floor((new Date()-EPOCH)/86400000)+1; }

  var InsightEngine={ init:init, initCritical:initCritical, initFull:initFull, getPlayer:getPlayer, listPlayers:listPlayers, eraContext:eraContext, skillDeltas:skillDeltas, archetypeStory:archetypeStory, findCrossEraComps:findCrossEraComps, explainPlacement:explainPlacement, fuseAndSearch:fuseAndSearch, dailyIndex:dailyIndex, puzzleNumber:puzzleNumber, _data:DATA, _getEmbedding:function(i){ return getEmbedding(i); } };
  function getEmbedding(idx){
    if (global.VHMtnn && global.VHMtnn.rowVector) {
      var v = global.VHMtnn.rowVector(idx);
      if (v) return v;
    }
    return null;
  }
  global.InsightEngine=InsightEngine; if(typeof window!=='undefined') window.InsightEngine=InsightEngine; globalThis.InsightEngine=InsightEngine;
})(typeof window!=='undefined'?window:globalThis);
