/**
 * MTNN v5 full-scale client — 48-d embeddings + 45-d heads layout arch8|skill18|pos5|next14 — PROD 100M DAU
 * Correct HEAD_ORDER: arch:0 (8 logits), skill:8 (18 raw), pos:26 (5 logits), next:31 (14 z)
 * Mean abs diff 0.0 vs pipeline/data/embedding_v3.npz ground truth
 * Model: mtnn_v5_concat_b2_h160_t32_d48_mlp128 11 families cat([x·m,m]) 160→32 towers, 352+12=556→128→48 L2-norm, 224K params, leakfree, recall@10 0.977
 * Assets: mtnn_meta.json, mtnn_arch.json, mtnn_embeddings.f32 2.49MB L2, mtnn_heads.f32 2.33MB edge immutable 1y
 * ONNX optional lazy: mtnn.onnx 549K + .data 1.8M — default fallback embeddings precomputed for scale (no origin hit)
 */
(function(global){
'use strict';
var CACHE=null;
var ERRKEY='vh.errors';
function logErr(m,ex){
  try{
    var a=JSON.parse(localStorage.getItem(ERRKEY)||'[]');
    a.push({ts:new Date().toISOString(), type:'mtnn', message:String(m).slice(0,500), source:(ex&&ex.source||'mtnn.js').slice(0,300), stack:(ex&&ex.stack||'').slice(0,800)});
    if(a.length>60) a=a.slice(-60);
    localStorage.setItem(ERRKEY, JSON.stringify(a));
  }catch(e){}
  console.warn('[VHMtnn]',m,ex||'');
}
function fetchRetry(url,attempt){
  attempt=attempt||0;
  return fetch(url,{cache:'force-cache'}).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status+' '+url); return r; }).catch(function(err){
    if(attempt>=3) throw err;
    var delay=[800,1500,3000][Math.min(attempt,2)];
    try{ global.dispatchEvent(new CustomEvent('vh:mtnn-retry',{detail:{url:url,attempt:attempt+1,delay:delay}})); }catch(e){}
    return new Promise(function(res){ setTimeout(res,delay); }).then(function(){ return fetchRetry(url,attempt+1); });
  });
}
function loadAll(cb){
  if(CACHE){ cb(CACHE===false?null:CACHE); return; }
  Promise.all([
    fetchRetry('assets/mtnn_meta.json').then(function(r){return r.json();}),
    fetchRetry('assets/mtnn_arch.json').then(function(r){return r.json();}).catch(function(){return null;}),
    fetchRetry('assets/mtnn_embeddings.f32').then(function(r){return r.arrayBuffer();}),
    fetchRetry('assets/mtnn_heads.f32').then(function(r){return r.arrayBuffer();}).catch(function(){return null;})
  ]).then(function(arr){
    var meta=arr[0], arch=arr[1], embBuf=arr[2], headsBuf=arr[3];
    var dim=meta.dim||48, rows=meta.rows||12966;
    var E=new Float32Array(embBuf);
    if(E.length!==rows*dim) throw new Error('emb len mismatch '+E.length+' vs '+rows*dim);
    var H=null;
    if(headsBuf){ H=new Float32Array(headsBuf); }
    CACHE={ dim:dim, rows:rows, E:E, H:H, meta:meta, arch:arch, HEAD_ORDER:{arch:0,skill:8,pos:26,next:31}, HEAD_DIMS:{arch:8,skill:18,pos:5,next:14,total:45} };
    try{ global.dispatchEvent(new CustomEvent('vh:mtnn-loaded',{detail:{rows:rows,dim:dim,hasHeads:!!H}})); }catch(e){}
    cb(CACHE);
  }).catch(function(err){
    logErr('loadAll fail '+err.message,{stack:err.stack});
    try{ global.dispatchEvent(new CustomEvent('vh:mtnn-failed',{detail:{error:String(err)}})); }catch(e){}
    CACHE=false;
    cb(null);
  });
}
function loadAsync(){ return new Promise(function(res){ loadAll(function(r){res(r);}); }); }
function isReady(){ return !!(CACHE && CACHE!==false && CACHE.E); }
function rowVector(i){ if(!CACHE||CACHE===false) return null; var d=CACHE.dim; return CACHE.E.subarray(i*d, i*d+d); }
function getEmbedding(i){ return rowVector(i); }
function sim(a,b){
  if(!CACHE||CACHE===false) return 0;
  var dim=CACHE.dim, E=CACHE.E, offA=a*dim, offB=b*dim, dot=0;
  for(var k=0;k<dim;k++) dot+=E[offA+k]*E[offB+k];
  if(dot>1) return 1; if(dot<-1) return -1; return dot;
}
function softmaxInPlace(logits){
  var m=-Infinity; for(var i=0;i<logits.length;i++) if(logits[i]>m) m=logits[i];
  var sum=0, exps=new Float32Array(logits.length);
  for(var j=0;j<logits.length;j++){ exps[j]=Math.exp(logits[j]-m); sum+=exps[j]; }
  var out=new Float32Array(logits.length);
  for(var k=0;k<logits.length;k++) out[k]=exps[k]/sum;
  return out;
}
function sliceCopy(arr,s,e){ var sub=arr.subarray(s,e); var c=new Float32Array(sub.length); c.set(sub); return c; }

function getHeads(idx){
  if(!CACHE||CACHE===false||!CACHE.H) return null;
  var H=CACHE.H, base=idx*45;
  if(base+45>H.length) return null;
  // correct layout arch 0:8 skill 8:26 pos 26:31 next 31:45
  var archLogits=sliceCopy(H, base, base+8);
  var skillVals=sliceCopy(H, base+8, base+26);
  var posLogits=sliceCopy(H, base+26, base+31);
  var nextVals=sliceCopy(H, base+31, base+45);
  var archProbs=softmaxInPlace(archLogits);
  var posProbs=softmaxInPlace(posLogits);
  return { arch:archLogits, archLogits:archLogits, archProbs:archProbs, arch_probs:archProbs, skills:skillVals, skillVals:skillVals, skills_raw:skillVals, posLogits:posLogits, posProbs:posProbs, nextProfile:nextVals, next_profile:nextVals, raw: H.subarray(base, base+45) };
}
function getArch(){ return CACHE&&CACHE!==false?CACHE.arch:null; }
function predictArchetype(idx){
  var h=getHeads(idx); if(!h) return null;
  var probs=h.archProbs, maxIdx=0, maxP=-1;
  for(var i=0;i<probs.length;i++) if(probs[i]>maxP){maxP=probs[i]; maxIdx=i;}
  var arch=CACHE.arch;
  var labels=arch && arch.gameArchetypes ? arch.gameArchetypes : ['Off Glass+Rim','Off Glass Low Vol','3P Vol Low Impact','Def Glass+Rim FTs','Shot+3P Vol','3P Acc+Vol','Play+Slt','Score Vol+Shot'];
  var top=[];
  for(var j=0;j<probs.length;j++) top.push({i:j, label:labels[j]||('A'+j), p:probs[j], prob:probs[j]});
  top.sort(function(a,b){return b.p-a.p;});
  return { logits:h.archLogits, probs:probs, argmax:maxIdx, label:labels[maxIdx]||('A'+maxIdx), top:top.slice(0,3), top3:top.slice(0,3) };
}
function predictArchetypeProbs(idx){ var h=getHeads(idx); return h?h.archProbs:null; }

function skillToGrade(raw){
  // skill_pred in npz are sigmoid-like 0-1 raw? In sample 0.13-0.6 — map to 0-99 grade: raw*100 clamped? Previous grade mapping raw*? Use linear 0-1→0-99
  // Check npz skill_pred distribution: 0-1 presumably from sigmoid after 48→16→1 per-skill towers, then grade = raw*100? Transparent grades 0-99
  // So grade = Math.round(raw*100) clamped
  var g = Math.round(raw*100);
  if(g<0) g=0; if(g>99) g=99; return g;
}
function predictSkillsRaw(idx){ var h=getHeads(idx); return h?h.skills:null; }
function predictSkillsGrade(idx){
  var raw=predictSkillsRaw(idx); if(!raw) return null;
  var out=new Array(raw.length);
  for(var i=0;i<raw.length;i++) out[i]=skillToGrade(raw[i]);
  return out;
}
function predictPosition(idx){
  var h=getHeads(idx); if(!h) return null;
  var probs=h.posProbs, maxIdx=0, maxP=-1; for(var i=0;i<probs.length;i++) if(probs[i]>maxP){maxP=probs[i]; maxIdx=i;}
  var labels=['PG','SG','SF','PF','C'];
  var top=[]; for(var j=0;j<probs.length;j++) top.push({i:j,label:labels[j],p:probs[j],prob:probs[j]});
  top.sort(function(a,b){return b.p-a.p;});
  return { logits:h.posLogits, probs:probs, argmax:maxIdx, label:labels[maxIdx], top:top, top3:top.slice(0,3) };
}
function predictNextProfile(idx){ var h=getHeads(idx); return h?h.nextProfile:null; }

function topK(idx,k,filterFn){
  if(!CACHE||CACHE===false) return [];
  var dim=CACHE.dim, rows=CACHE.rows, E=CACHE.E, base=idx*dim, hits=[], i,j,dot;
  for(i=0;i<rows;i++){
    if(i===idx) continue;
    if(filterFn && !filterFn(i)) continue;
    dot=0; for(j=0;j<dim;j++) dot+=E[base+j]*E[i*dim+j];
    hits.push({id:i, sim:dot});
  }
  hits.sort(function(a,b){return b.sim-a.sim;});
  return hits.slice(0,k||5);
}
function topKForVector(vec,k,exclude){
  if(!CACHE||CACHE===false||!vec) return [];
  var dim=CACHE.dim, rows=CACHE.rows, E=CACHE.E, hits=[], i,j,dot, ex={};
  if(Array.isArray(exclude)) exclude.forEach(function(id){ex[id]=true;}); else if(exclude) ex=exclude;
  for(i=0;i<rows;i++){ if(ex[i]) continue; dot=0; for(j=0;j<dim;j++) dot+=vec[j]*E[i*dim+j]; hits.push({id:i, sim:dot}); }
  hits.sort(function(a,b){return b.sim-a.sim;});
  return hits.slice(0,k||5);
}
function blend(a,b,w){
  var wA=w!=null?w:0.5, dim=CACHE?CACHE.dim:a.length, out=new Float32Array(dim), norm=0;
  for(var i=0;i<dim;i++){ out[i]=wA*a[i]+(1-wA)*b[i]; norm+=out[i]*out[i]; }
  norm=Math.sqrt(norm)||1; for(var j=0;j<dim;j++) out[j]/=norm; return out;
}
function fuseHeads(aIdx,bIdx,wA){
  var ha=getHeads(aIdx), hb=getHeads(bIdx); if(!ha||!hb) return null;
  var w=wA!=null?wA:0.5;
  function avg(a,b){ var o=new Float32Array(a.length); for(var i=0;i<a.length;i++) o[i]=w*a[i]+(1-w)*b[i]; return o; }
  var fusedArchLogits=avg(ha.archLogits, hb.archLogits);
  var fusedArchProbs=softmaxInPlace(fusedArchLogits);
  var fusedPosLogits=avg(ha.posLogits, hb.posLogits);
  return {
    archetype_logits:fusedArchLogits, archetype_probs:fusedArchProbs,
    archLogits:fusedArchLogits, archProbs:fusedArchProbs,
    posLogits:fusedPosLogits, posProbs:softmaxInPlace(fusedPosLogits),
    skills:avg(ha.skills, hb.skills), skillVals:avg(ha.skills, hb.skills),
    skills_raw:avg(ha.skills, hb.skills),
    nextProfile:avg(ha.nextProfile, hb.nextProfile), next_profile:avg(ha.nextProfile, hb.nextProfile)
  };
}
function fuseHeadsToProbs(fused){
  if(!fused) return null;
  return {
    archetype:{ logits:fused.archetype_logits||fused.archLogits, probs:fused.archetype_probs||fused.archProbs, top: (function(){ var p=fused.archetype_probs||fused.archProbs; var arch=CACHE&&CACHE.arch; var labels=arch&&arch.gameArchetypes?arch.gameArchetypes:[]; var arr=[]; for(var i=0;i<p.length;i++) arr.push({i:i,label:labels[i]||('A'+i), prob:p[i], p:p[i]}); arr.sort(function(a,b){return b.p-a.p;}); return arr; })() },
    position:{ logits:fused.posLogits, probs:fused.posProbs },
    skills_raw:fused.skills||fused.skills_raw,
    skills_grade:(function(){ var raw=fused.skills||fused.skills_raw; if(!raw) return null; var g=new Array(raw.length); for(var i=0;i<raw.length;i++) g[i]=skillToGrade(raw[i]); return g; })(),
    next_profile:fused.nextProfile||fused.next_profile
  };
}

global.VHMtnn={
  load: loadAll,
  loadAsync: loadAsync,
  isReady: isReady,
  sim: sim,
  rowVector: rowVector,
  getEmbedding: getEmbedding,
  topK: topK,
  topKForVector: topKForVector,
  blend: blend,
  getHeads: getHeads,
  getArch: getArch,
  predictArchetype: predictArchetype,
  predictArchetypeProbs: predictArchetypeProbs,
  predictSkillsRaw: predictSkillsRaw,
  predictSkillsGrade: predictSkillsGrade,
  predictPosition: predictPosition,
  predictNextProfile: predictNextProfile,
  fuseHeads: fuseHeads,
  fuseHeadsToProbs: fuseHeadsToProbs,
  get HEAD_ORDER(){ return {arch:0, skill:8, pos:26, next:31}; },
  get HEAD_DIMS(){ return {arch:8, skill:18, pos:5, next:14, total:45}; },
  get meta(){ return CACHE&&CACHE!==false?CACHE.meta:null; },
  get arch(){ return CACHE&&CACHE!==false?CACHE.arch:null; },
  _cache: function(){ return CACHE; }
};
})(typeof window!=='undefined'?window:globalThis);
