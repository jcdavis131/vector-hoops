/* Vector Hoops — MTNN Full — embeddings + heads + jacobian + arch
 * 12,966 seasons, residual towers, 48-d L2
 * Assets: embeddings, heads, inputs aggregated, jacobian
 * Edge cache immutable
 */
(function(global){
  'use strict';
  const SKILL_KEYS_18 = ['scoring','shooting','finishing','ft','playmaking','security','oreb','dreb','hands','rim','efficiency','impact','post','transition','motor','shooting_gravity','rim_gravity','disruption_gravity'];
  const POS_LABELS = ['PG','SG','SF','PF','C'];
  let jacobian=null;
  let jacobianMeta=null;
  let arch=null;
  let seasonNorms=null;

  async function fetchJSON(p){ const r=await fetch(p, {cache:'force-cache'}); if(!r.ok) throw new Error(p+' '+r.status); return r.json(); }
  async function fetchF32(p){ const r=await fetch(p, {cache:'force-cache'}); if(!r.ok) throw new Error(p+' '+r.status); const b=await r.arrayBuffer(); return new Float32Array(b); }

  async function init(){
    const tasks=[];
    if(!arch) tasks.push(fetchJSON('assets/mtnn_arch.json').then(j=>{ arch=j; }).catch(()=>{}));
    if(!jacobian) tasks.push(Promise.all([fetchJSON('assets/mtnn_jacobian.json').catch(()=>null), fetchF32('assets/mtnn_jacobian.f32').catch(()=>null)]).then(function(arr){ jacobianMeta=arr[0]; jacobian=arr[1]; }).catch(function(){}));
    if(!seasonNorms) tasks.push(fetchJSON('assets/season_norms.json').then(function(j){ seasonNorms=j.seasons||j; }).catch(function(){}));
    await Promise.all(tasks);
    if(!global.VHMtnn || !global.VHMtnn.isReady()){
      await new Promise(function(res){ global.VHMtnn.load(function(){ res(); }); });
    }
    return { arch: arch, jacobianMeta: jacobianMeta, seasonNorms: seasonNorms };
  }

  function getSkillKeys18(){ const a = (global.VHMtnn && global.VHMtnn.getArch && global.VHMtnn.getArch()) ? global.VHMtnn.getArch().skillKeys : null; return a || SKILL_KEYS_18; }
  function getArchetypeLabels(){ const a = (global.VHMtnn && global.VHMtnn.getArch && global.VHMtnn.getArch()) ? global.VHMtnn.getArch().gameArchetypes : null; return a || ['Off Glass+Rim','Off Glass Low Vol','3P Vol Low Impact','Def Glass+Rim FTs','Shot+3P Vol','3P Acc+Vol','Play+Slt','Score Vol+Shot']; }

  function softmax(arr){
    var m=-Infinity; for(var i=0;i<arr.length;i++) if(arr[i]>m) m=arr[i];
    var sum=0, out=new Float32Array(arr.length);
    for(var i=0;i<arr.length;i++){ out[i]=Math.exp(arr[i]-m); sum+=out[i]; }
    for(var i=0;i<arr.length;i++) out[i]/=sum||1;
    return out;
  }

  function towerInfluence(idx, target){
    target = target || 'embedding';
    if(!jacobian || !jacobianMeta) return null;
    var towers = jacobianMeta.towerFamilies || ['bio','career','defense','efficiency','honors','market','playmaking','rebounding','shotmix','tracking','volume'];
    var targets = jacobianMeta.targets || ['embedding','archetype','position','skills','next_profile'];
    var tIdx = targets.indexOf(target);
    if(tIdx<0) return null;
    var base = idx*11*5;
    var vals=[];
    for(var ti=0;ti<11;ti++){
      var v = jacobian[base + ti*5 + tIdx];
      vals.push({ tower:towers[ti], value:v });
    }
    vals.sort(function(a,b){ return b.value-a.value; });
    return vals;
  }
  function explainPCViaJacobian(idx){
    var embInfluence = towerInfluence(idx,'embedding');
    var skillInfluence = towerInfluence(idx,'skills');
    return {
      embInfluence: embInfluence ? embInfluence.slice(0,3) : [],
      skillInfluence: skillInfluence ? skillInfluence.slice(0,3) : [],
      summary: embInfluence ? 'Top tower for embedding: '+embInfluence[0].tower+' ('+embInfluence[0].value.toFixed(3)+')' : 'Jacobian loading…'
    };
  }

  function predictArchetypeFull(idx){
    if(!global.VHMtnn) return null;
    var pred = global.VHMtnn.predictArchetype(idx);
    if(!pred) return null;
    var infl = towerInfluence(idx,'archetype');
    return { logits: pred.logits, probs: pred.probs, argmax: pred.argmax, label: pred.label, top: pred.top, influence: infl };
  }
  function predictSkillsFull(idx){
    if(!global.VHMtnn) return null;
    var raw = global.VHMtnn.predictSkillsRaw(idx);
    var grade = global.VHMtnn.predictSkillsGrade(idx);
    if(!raw) return null;
    var keys = getSkillKeys18();
    var items=[];
    for(var i=0;i<raw.length;i++) items.push({ key:keys[i]||('skill'+i), label:keys[i], raw:raw[i], grade:grade[i], pct:grade[i] });
    var top = items.slice().sort(function(a,b){ return b.grade-a.grade; }).slice(0,3);
    return { raw: raw, grade: grade, items: items, top: top, influence: towerInfluence(idx,'skills') };
  }
  function predictPositionFull(idx){
    var pred = global.VHMtnn ? global.VHMtnn.predictPosition(idx) : null;
    if(!pred) return null;
    return { logits: pred.logits, probs: pred.probs, argmax: pred.argmax, label: pred.label, influence: towerInfluence(idx,'position') };
  }
  function predictNextProfileFull(idx){
    var raw = global.VHMtnn ? global.VHMtnn.predictNextProfile(idx) : null;
    if(!raw) return null;
    var archNow = arch || (global.VHMtnn && global.VHMtnn.getArch && global.VHMtnn.getArch());
    var keys = (archNow && archNow.gameFeatureKeys) ? archNow.gameFeatureKeys : ['PTS','AST','OREB','DREB','STL','BLK','TOV','FG3A','FGA','FTA','FG3_PCT','FG_PCT','FT_PCT','PLUS_MINUS'];
    var items=[];
    for(var i=0;i<raw.length && i<keys.length;i++) items.push({ key:keys[i], z:raw[i], label:keys[i] });
    var sortedPos = items.filter(function(x){ return x.z>0; }).sort(function(a,b){ return b.z-a.z; }).slice(0,3);
    var sortedNeg = items.filter(function(x){ return x.z<0; }).sort(function(a,b){ return a.z-b.z; }).slice(0,3);
    return { raw: raw, items: items, topOver: sortedPos, topUnder: sortedNeg, influence: towerInfluence(idx,'next_profile') };
  }

  function fuseAndDecode(aIdx,bIdx,wA){
    if(!global.VHMtnn || !global.VHMtnn.isReady()) return null;
    var w = wA==null?0.5:wA;
    var fusedHeads = global.VHMtnn.fuseHeads(aIdx,bIdx,w);
    if(!fusedHeads) return null;
    var decoded = global.VHMtnn.fuseHeadsToProbs(fusedHeads);
    var embA = global.VHMtnn.getEmbedding(aIdx);
    var embB = global.VHMtnn.getEmbedding(bIdx);
    if(!embA||!embB) return decoded;
    var fusedEmb = global.VHMtnn.blend(embA, embB, w);
    var nearest = global.VHMtnn.topKForVector(fusedEmb, 6, (function(){ var o={}; o[aIdx]=true; o[bIdx]=true; return o; })());
    return { fusedHeads: fusedHeads, archetype: decoded.archetype, position: decoded.position, skills_raw: decoded.skills_raw, skills_grade: decoded.skills_grade, next_profile: decoded.next_profile, fusedEmb: fusedEmb, nearest: nearest, weightA: w };
  }

  function whyCloseWithFull(targetIdx, guessIdx){
    if(!global.VHMtnn || !global.VHMtnn.isReady()) return null;
    var cos = global.VHMtnn.sim(targetIdx, guessIdx);
    var archT = predictArchetypeFull(targetIdx);
    var archG = predictArchetypeFull(guessIdx);
    var skillsT = predictSkillsFull(targetIdx);
    var skillsG = predictSkillsFull(guessIdx);
    var skillDelta=null;
    if(skillsT && skillsG){
      var keys=getSkillKeys18();
      var diffs=[];
      for(var i=0;i<keys.length;i++){
        var from=skillsG.grade[i], to=skillsT.grade[i];
        var d=to-from;
        diffs.push({ skill:keys[i], from:from, to:to, delta:d, absDelta:Math.abs(d) });
      }
      diffs.sort(function(a,b){ return b.absDelta-a.absDelta; });
      skillDelta={ diffs:diffs, top3:diffs.slice(0,3), closeness: (100 - diffs.reduce(function(s,d){ return s+d.absDelta; },0)/diffs.length).toFixed(0) };
    }
    var posT = predictPositionFull(targetIdx);
    var posG = predictPositionFull(guessIdx);
    return {
      targetIdx: targetIdx, guessIdx: guessIdx,
      cosine: cos,
      sim_pct: (cos*100).toFixed(1),
      archT: archT, archG: archG,
      sameArchetype: archT && archG ? archT.argmax===archG.argmax : false,
      archBridge: archT && archG ? archG.label+' → '+archT.label : '',
      skillDelta: skillDelta,
      posT: posT, posG: posG,
      bullets: [
        '48-d cosine '+(cos*100).toFixed(1)+'% — '+(cos>0.9?'same island':cos>0.8?'nearby cluster':'distant craft')+'. Full MTNN 48-d L2, not map xyz.',
        skillDelta ? 'Tower skills Δ (48→16→1 per-skill MLP): '+skillDelta.top3.map(function(d){ return d.skill+' '+d.from.toFixed(0)+'→'+d.to.toFixed(0)+' ('+(d.delta>0?'+':'')+d.delta.toFixed(0)+')'; }).join(', ')+' — '+skillDelta.closeness+'% closeness' : 'Skill towers loading…',
        archT && archG ? 'Archetype: '+archG.label+' '+(archT.argmax===archG.argmax?'same global':'→ '+archT.label)+' — prob '+(archG.probs ? (archG.probs[archG.argmax]*100).toFixed(0) : '?')+'% vs '+(archT.probs ? (archT.probs[archT.argmax]*100).toFixed(0) : '?')+'% (8-way MLP 48→64→8).' : 'Archetype loading…'
      ]
    };
  }

  global.VHMtnnFull = {
    init: init,
    getSkillKeys18: getSkillKeys18,
    getArchetypeLabels: getArchetypeLabels,
    predictArchetypeFull: predictArchetypeFull,
    predictSkillsFull: predictSkillsFull,
    predictPositionFull: predictPositionFull,
    predictNextProfileFull: predictNextProfileFull,
    fuseAndDecode: fuseAndDecode,
    whyCloseWithFull: whyCloseWithFull,
    towerInfluence: towerInfluence,
    explainPCViaJacobian: explainPCViaJacobian
  };
})(typeof window!=='undefined'?window:globalThis);
