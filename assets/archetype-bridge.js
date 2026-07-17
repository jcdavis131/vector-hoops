/* Archetype Bridge — MTNN v5 8 archetypes visual proof
 * Real: mtnn_arch.json gameArchetypes 8, mtnn_meta.json centroids 8x48, archetype_assignments.json 12966, mtnn_heads.f32 8-logit distribution
 */
(function(global){
  'use strict';
  const PAL = ['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const ARCH_DEFS = {
    'Offensive Glass + Rim Protection':'Elite second-chance + paint deterrence. High OREB, BLK, low 3PA. Era evolves from Mutombo 1998 to Wemby 2024 same PC1 tip.',
    'Offensive Glass (Low Shot Volume)':'Garbage man, putbacks, screen-setter. Low USG, high OREB%, low TS load.',
    'Three-Point Volume (Low On-Court Impact)':'Shooter role, spacing but low PLUS_MINUS. Floor stretcher before gravity mattered.',
    'Defensive Glass + Rim Pressure (Fts)':'Def rebound + drawing fouls. High DREB, FTA, traditional big to mobility_big shift.',
    'Shot Volume + Three-Point Volume':'Modern volume scorer, high FGA+3PA, shot creation.',
    'Three-Point Accuracy + Three-Point Volume':'Sniper archetype 97+ grade, Catch-Shoot, high EFG.',
    'Playmaking + Steals':'Primary creator + ball pressure, high AST, STL, front-court touches, ball-in-hand PC3 high.',
    'Scoring Volume + Shot Volume':'Bucket getter, high PTS per 100, USG%, low assist.',
  };
  let CACHE={arch:null,assign:null,meta:null};

  async function fetchJSON(u){ try{ const r=await fetch(u,{cache:'force-cache'}); if(!r.ok) throw 0; return await r.json();}catch{return null;} }

  async function ensure(){
    if(!CACHE.arch) CACHE.arch = await fetchJSON('assets/mtnn_arch.json');
    if(!CACHE.assign) CACHE.assign = await fetchJSON('assets/archetype_assignments.json');
    if(!CACHE.meta) CACHE.meta = await fetchJSON('assets/mtnn_meta.json');
    return CACHE;
  }

  async function loadHeadDist(idx){
    try{
      const resp=await fetch('assets/mtnn_heads.f32',{cache:'force-cache'});
      if(!resp.ok) return null;
      const buf=await resp.arrayBuffer();
      const arr=new Float32Array(buf);
      const ROW=45, off=idx*ROW;
      const logits=arr.slice(off,off+8);
      const max=Math.max(...logits);
      const exps=[...logits].map(v=>Math.exp(v-max));
      const sum=exps.reduce((a,b)=>a+b,0);
      const probs=exps.map(v=>v/sum);
      return {logits:[...logits], probs};
    }catch(e){ return null; }
  }

  function chipHTML(name, idx, active, count){
    const color=PAL[idx%PAL.length];
    const def=ARCH_DEFS[name]||'';
    return `<div class="ab-chip ${active?'is-active':''}" data-arch="${idx}" style="cursor:pointer;min-height:44px;display:flex;flex-direction:column;gap:2px;padding:8px 10px;border:2.2px solid ${active?'#1A150F':color};border-radius:12px;background:${active?'#1A150F':'#fff'};color:${active?'#fff':color};box-shadow:${active?'4px 4px 0 #F0E442':'2px 2px 0 #1A150F'};transition:all .15s">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-family:ui-monospace,monospace;font-size:11px;line-height:1.2">${name}</b><span style="font-family:ui-monospace,monospace;font-size:10px;padding:2px 5px;border-radius:999px;background:${active?'#F0E442':color};color:${active?'#1A150F':'#FFFEF7'}">${count?count+' seasons':''}</span></div>
      <span style="font-size:10.5px;line-height:1.3;opacity:.8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${def.split('.')[0]+'.'}</span>
    </div>`;
  }

  async function renderArchetypeChips(containerEl, assignment){
    await ensure();
    const arch=CACHE.arch;
    const names=arch? arch.gameArchetypes : Object.keys(ARCH_DEFS);
    const assignData=CACHE.assign;
    // count per archetype
    const counts=new Array(names.length).fill(0);
    if(assignData && assignData.assignments){
      assignData.assignments.forEach(a=>{ if(a.mtnnGlobal>=0 && a.mtnnGlobal<counts.length) counts[a.mtnnGlobal]++; });
    }
    containerEl.innerHTML='';
    containerEl.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px';
    const activeIdx = assignment ? assignment.mtnnGlobal : -1;
    names.forEach((n,i)=>{
      const active = i===activeIdx;
      const div=document.createElement('div');
      div.innerHTML=chipHTML(n,i,active,counts[i]);
      div.firstElementChild.addEventListener('click',()=>{ if(window.InsightEngine) { /* could filter */ }} );
      containerEl.appendChild(div.firstElementChild);
    });
  }

  async function renderBridgeStory(containerEl, aIdx, bIdx, fusedData){
    await ensure();
    if(!aIdx && aIdx!==0) { containerEl.innerHTML='<div class="small-mono">Select A+B to see bridge</div>'; return; }
    const archData=CACHE.assign;
    const meta=CACHE.meta;
    const names=CACHE.arch? CACHE.arch.gameArchetypes: [];
    function getAssign(i){ return archData && archData.assignments ? archData.assignments[i] : null; }
    const aAss=getAssign(aIdx), bAss=getAssign(bIdx);
    const aHead=await loadHeadDist(aIdx);
    const bHead=await loadHeadDist(bIdx);
    // fused if available via fusedData nearest? use average probs
    let fusedProbs=null;
    if(aHead && bHead){
      fusedProbs=aHead.probs.map((p,i)=> (p+bHead.probs[i])/2);
    }
    const topA = aHead? aHead.probs.map((p,i)=>({i,p,name:names[i]})).sort((x,y)=>y.p-x.p)[0]: null;
    const topB = bHead? bHead.probs.map((p,i)=>({i,p,name:names[i]})).sort((x,y)=>y.p-x.p)[0]: null;
    const topF = fusedProbs? fusedProbs.map((p,i)=>({i,p,name:names[i]})).sort((x,y)=>y.p-x.p).slice(0,3): [];

    containerEl.innerHTML='';
    containerEl.style.cssText='display:flex;flex-direction:column;gap:10px;padding:12px;border:2.2px solid #1A150F;border-radius:12px;background:#FFFEF7;box-shadow:3px 3px 0 #1A150F';

    const aLine = aAss? `${aAss.mtnnGlobalName} (${aAss.gameClusterName}) · era ${aAss.era}: ${aAss.eraNativeName}` : '—';
    const bLine = bAss? `${bAss.mtnnGlobalName} (${bAss.gameClusterName}) · era ${bAss.era}: ${bAss.eraNativeName}` : '—';

    let html=`
      <div style="font-family:ui-monospace,monospace;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.7">Archetype Bridge — full MTNN v5 8-way head</div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:start">
        <div style="padding:8px;border:1.6px solid #1A150F;border-radius:10px;background:#fff"><b style="font-size:13px">${topA?topA.name:'A'}</b><div style="font-size:11px;margin-top:4px">${aLine}</div><div style="margin-top:6px;font-size:10px">${topA? (topA.p*100).toFixed(0)+'% '+topA.name : ''}</div></div>
        <div style="font-size:22px;font-weight:900;padding-top:18px">+</div>
        <div style="padding:8px;border:1.6px solid #D55E00;border-radius:10px;background:#fff;color:#D55E00"><b style="font-size:13px">${topB?topB.name:'B'}</b><div style="font-size:11px;margin-top:4px">${bLine}</div><div style="margin-top:6px;font-size:10px">${topB? (topB.p*100).toFixed(0)+'% '+topB.name : ''}</div></div>
      </div>
    `;
    if(topF.length){
      html+=`<div style="margin-top:2px;padding:10px;border:2.2px dashed #1A150F;border-radius:10px;background:#fff"><div style="font-family:ui-monospace,monospace;font-size:11px;font-weight:900">= Fused predicts: ${topF.map(f=> `${(f.p*100).toFixed(0)}% ${f.name}`).join(' + ')}</div>
      <div style="display:flex;gap:4px;margin-top:6px">${topF.map(f=> `<span style="flex:${f.p};height:8px;border-radius:999px;background:${PAL[f.i%PAL.length]}" title="${f.name} ${(f.p*100).toFixed(0)}%"></span>`).join('')}</div>
      <div style="font-size:11px;line-height:1.45;margin-top:8px">Why bridge matters: <b>Archetype centroids 8×48</b> in mtnn_meta.json are L2 means of real seasons. Fusion <i>(embA+embB)/2 normalized</i> lives between A and B centroids — nearest real season reveals latent type that pure box score misses. Example: 68% Playmaking+Steals +22% Shot Volume = crafty volume shooter (Haliburton-type).</div></div>`;
    }
    if(fusedData && fusedData.nearest && fusedData.nearest[0]){
      html+=`<div style="font-size:11px;font-family:ui-monospace,monospace">Nearest real after fuse: <b>${fusedData.nearest[0].name} ${fusedData.nearest[0].season}</b> ${fusedData.nearest[0].sim_pct}% cosine · PC ${fusedData.xyz.x.toFixed(2)},${fusedData.xyz.y.toFixed(2)},${fusedData.xyz.z.toFixed(2)} = island where A+B chemistry lands.</div>`;
    }
    containerEl.innerHTML=html;
  }

  async function renderGlobalChips(containerEl, playerIdx){
    await ensure();
    const assign = CACHE.assign && CACHE.assign.assignments ? CACHE.assign.assignments[playerIdx] : null;
    if(!assign){ containerEl.innerHTML='<span class="small-mono">no archetype</span>'; return; }
    // triple story chips
    containerEl.innerHTML='';
    containerEl.style.cssText='display:flex;flex-wrap:wrap;gap:6px';
    [
      {label:`Global: ${assign.mtnnGlobalName}`, color:PAL[assign.mtnnGlobal%PAL.length], title:'mtnn_meta centroid 48-d mean'},
      {label:`Game: ${assign.gameClusterName}`, color:'#1A150F'},
      {label:`Era ${assign.era}: ${assign.eraNativeName}`, color:'#6B6256'},
      ...(assign.eraTags||[]).map(t=>({label:t, color:'#0072B2'}))
    ].forEach(ch=>{
      const el=document.createElement('span');
      el.textContent=ch.label;
      el.style.cssText=`min-height:32px;display:inline-flex;align-items:center;padding:4px 10px;border:1.6px solid ${ch.color};border-radius:999px;background:#fff;font-family:ui-monospace,monospace;font-size:10.5px;font-weight:800;box-shadow:1.5px 1.5px 0 #1A150F`;
      el.title=ch.title||ch.label;
      containerEl.appendChild(el);
    });
  }

  global.ArchetypeBridge = { renderArchetypeChips, renderBridgeStory, renderGlobalChips, ensure, loadHeadDist };
})(window);
