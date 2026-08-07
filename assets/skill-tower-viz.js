/* Skill Tower Viz — MTNN v5 concat b2_h160_t32_d48 full-scale visual proof
 * Surfaces real trained model: skill_probe.json W 12x14, mtnn_jacobian populationInfluence 11 towers, skills.json 12 DNA 0-99
 */
(function(global){
  'use strict';
  const OK = {
    blue:'#0072B2', verm:'#D55E00', green:'#009E73', yellow:'#F0E442',
    sky:'#56B4E9', magenta:'#CC79A7', orange:'#E69F00', black:'#000000',
    paper:'#FFFEF7', ink:'#1A150F'
  };
  const PAL = [OK.blue, OK.verm, OK.green, OK.yellow, OK.sky, OK.magenta, OK.orange, OK.black,
               '#332288','#88CCEE','#44AA99','#117733','#999933','#DDCC77','#CC6677','#882255'];
  // skill -> group for coloring (based on tower semantics)
  const SKILL_GROUPS = {
    scoring:'volume', shooting:'shotmix', finishing:'efficiency', ft:'efficiency',
    playmaking:'playmaking', security:'playmaking',
    oreb:'rebounding', dreb:'rebounding',
    hands:'defense', rim:'defense',
    efficiency:'efficiency', impact:'efficiency',
    post:'volume', transition:'tracking', motor:'tracking',
    shooting_gravity:'shotmix', rim_gravity:'volume', disruption_gravity:'defense'
  };
  const TOWER_COLOR = {
    volume: OK.verm, playmaking: OK.blue, rebounding: OK.green, defense: OK.black,
    efficiency: OK.magenta, shotmix: OK.orange, bio: OK.yellow, tracking: OK.sky,
    market: '#999933', career:'#CC6677', honors:'#332288'
  };
  let CACHE = { probe:null, arch:null, jacobian:null, jacobianF32:null, headsMeta:null };

  async function fetchJSON(u){
    try{ const r=await fetch(u,{cache:'force-cache'}); if(!r.ok) throw new Error(r.status); return await r.json(); }
    catch(e){ console.warn('STV fetch fail',u,e); return null; }
  }

  async function ensureData(){
    if(!CACHE.probe) CACHE.probe = await fetchJSON('assets/skill_probe.json');
    if(!CACHE.arch) CACHE.arch = await fetchJSON('assets/mtnn_arch.json');
    if(!CACHE.jacobian) CACHE.jacobian = await fetchJSON('assets/mtnn_jacobian.json');
    // heads distribution on-demand via f32 not JSON, we can lazy
    return CACHE;
  }

  function createEl(tag, cls, html){
    const el=document.createElement(tag);
    if(cls) el.className=cls;
    if(html!==undefined) el.innerHTML=html;
    return el;
  }

  function sparklineSVG(values, color){
    // values array length N, draw tiny bars 0..1
    if(!values || !values.length) return '';
    const w=84, h=22, pad=2;
    const max=Math.max(...values.map(v=>Math.abs(v)))||1;
    const barW=(w-pad*2)/values.length;
    let rects='';
    values.forEach((v,i)=>{
      const norm = Math.abs(v)/max;
      const bh = Math.max(2, norm*(h-4));
      const x = pad + i*barW;
      const y = h - bh -1;
      const fill = v>=0 ? color : OK.verm;
      const opacity = 0.35 + norm*0.65;
      rects+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1,barW-1).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="${fill}" fill-opacity="${opacity}"/>`;
    });
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${rects}</svg>`;
  }

  function renderSkillBar(skillName, grade, wRow, features, color, tooltipExtra){
    const pct = Math.max(0, Math.min(100, grade));
    const row = createEl('div','st-skill');
    row.style.cssText='display:flex;flex-direction:column;gap:4px;padding:8px 9px;border:1.6px solid var(--ink,#1A150F);border-radius:10px;background:#fff;box-shadow:1.8px 1.8px 0 var(--ink,#1A150F);min-height:88px;';
    const group = SKILL_GROUPS[skillName] || 'efficiency';
    const tColor = TOWER_COLOR[group] || color;
    row.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <span style="font-family:ui-monospace,monospace;font-size:10.5px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;color:${tColor};border:1.5px solid ${tColor};border-radius:999px;padding:2px 6px;background:#fff">${group}</span>
        <span style="font-family:ui-monospace,monospace;font-size:10px;font-weight:800;opacity:.7">${skillName}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <b style="font-family:ui-monospace,monospace;font-size:18px;letter-spacing:-.02em;line-height:1">${pct}</b>
        <span style="font-size:10px;font-family:ui-monospace,monospace;opacity:.6">${tooltipExtra||''}</span>
      </div>
      <div style="height:8px;border:1.6px solid #1A150F;border-radius:999px;overflow:hidden;background:#FFFEF7"><i style="display:block;height:100%;width:${pct}%;background:${color};transition:width .6s cubic-bezier(.2,.8,.2,1)"></i></div>
      <div class="st-spark" style="margin-top:2px">${wRow? sparklineSVG(wRow, color): ''}</div>
      <div style="font-size:9px;line-height:1.25;font-family:ui-monospace,monospace;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${wRow && features? features.map((f,i)=> f+':'+wRow[i].toFixed(2)).join(' · ') : ''}">${wRow&&features? 'W driver: '+features.reduce((best,_,i)=> Math.abs(wRow[i])>Math.abs(wRow[best])?i:best,0) + ' '+features[features.reduce((b,_,i)=> Math.abs(wRow[i])>Math.abs(wRow[b])?i:b,0)] : ''}</div>
    `;
    row.title=`${skillName} ${grade} — tower family ${group}\nW drivers: ${(wRow&&features)? features.map((f,i)=> f+':'+wRow[i].toFixed(2)).join(', ') : 'loading'}\n${tooltipExtra||''}`;
    return row;
  }

  async function renderSkillGrid(containerEl, grades, options){
    await ensureData();
    const opts=options||{};
    if(!containerEl) return;
    const probe=CACHE.probe;
    const skillsList = probe ? probe.skills : (probe?.labels || ['scoring','shooting','finishing','ft','playmaking','security','oreb','dreb','hands','rim','efficiency','impact']);
    const features = probe ? probe.features : ['PTS','AST','OREB','DREB','STL','BLK','TOV','FG3A','FGA','FTA','FG3_PCT','FG_PCT','FT_PCT','PLUS_MINUS'];
    const W = probe ? probe.W : null; // 12x14
    const N = grades ? grades.length : skillsList.length;
    containerEl.innerHTML='';
    containerEl.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(138px,1fr));gap:8px;';
    for(let i=0;i<N;i++){
      const name = skillsList[i] || ('skill_'+i);
      const g = grades ? grades[i] : 50;
      const wRow = W && W[i] ? W[i] : null;
      const color = PAL[i % PAL.length];
      const towerInfo = SKILL_GROUPS[name]||'';
      const el = renderSkillBar(name, g, wRow, features, color, towerInfo);
      // interactive 44px touch
      el.style.minHeight='88px';
      el.tabIndex=0;
      el.setAttribute('role','button');
      el.setAttribute('aria-label',`${name} grade ${g}`);
      containerEl.appendChild(el);
    }
    // legend footer
    const legend = createEl('div','','');
    legend.style.cssText='grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;margin-top:4px';
    legend.innerHTML = `<span style="font-family:ui-monospace,monospace;font-size:10px;font-weight:800;opacity:.7">W matrix sparkline = 14 era-z features weights driving each skill (positive blue/green, negative verm). Source skill_probe.json 14x12 · Real MTNN v5 concat b2_h160_t32_d48. Hover for drivers.</span>`;
    containerEl.appendChild(legend);
  }

  async function renderTowerInfluence(containerEl, target){
    await ensureData();
    const jac=CACHE.jacobian;
    if(!jac || !jac.populationInfluenceNorm){ containerEl.innerHTML='<div class="small-mono">jacobian missing</div>'; return; }
    const tgt = target || 'skills';
    const infl = jac.populationInfluenceNorm[tgt] || jac.populationInfluenceNorm.embedding;
    const families = jac.towerFamilies;
    containerEl.innerHTML='';
    containerEl.style.cssText='display:flex;flex-direction:column;gap:6px;';
    const max=1;
    families.forEach(fam=>{
      const v = infl[fam] || 0;
      const pct = Math.round(v*100);
      const color = TOWER_COLOR[fam] || OK.blue;
      const row = createEl('div','',`
        <div style="display:flex;justify-content:space-between;font-family:ui-monospace,monospace;font-size:11px;font-weight:800"><span style="color:${color}">${fam}</span><span>${(v).toFixed(3)} · ${pct}%</span></div>
        <div style="height:7px;border:1.6px solid #1A150F;border-radius:999px;background:#FFFEF7;overflow:hidden"><i style="display:block;height:100%;width:${pct}%;background:${color}"></i></div>
      `);
      row.style.cssText='padding:6px 8px;border:1.5px solid #1A150F;border-radius:8px;background:#fff;box-shadow:1.5px 1.5px 0 #1A150F';
      containerEl.appendChild(row);
    });
    const foot = createEl('div','',`<span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.7">Frobenius ||d(${tgt})/d(tower)|| per row mean. ${jac.method? jac.method.slice(0,160):''} — full MTNN towers 11×2 blocks 160→32.</span>`);
    foot.style.marginTop='4px';
    containerEl.appendChild(foot);
  }

  async function renderBlendGrid(containerEl, skillBlend, meta){
    await ensureData();
    // skillBlend array length 12 or 18
    const probe=CACHE.probe;
    const skillsList = probe ? probe.skills : ['scoring','shooting','finishing','ft','playmaking','security','oreb','dreb','hands','rim','efficiency','impact'];
    containerEl.innerHTML='';
    containerEl.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(142px,1fr));gap:8px;';
    const W = probe ? probe.W : null;
    const features = probe ? probe.features : [];
    skillBlend.forEach((g,i)=>{
      const name = skillsList[i]||('s'+i);
      const wRow = W && W[i] ? W[i] : null;
      const color = PAL[i%PAL.length];
      const el = renderSkillBar(name, g, wRow, features, color, meta?meta.source: (meta && meta.blend? 'A+B avg':'' ));
      containerEl.appendChild(el);
    });
  }

  // Load archetype distribution from mtnn_heads.f32
  async function loadHeadsDistribution(idx){
    try{
      const resp = await fetch('assets/mtnn_heads.f32',{cache:'force-cache'});
      if(!resp.ok) return null;
      const buf = await resp.arrayBuffer();
      const arr = new Float32Array(buf);
      const ROW = 45;
      const off = idx*ROW;
      if(off+8>arr.length) return null;
      const logits = arr.slice(off, off+8);
      // softmax
      const max = Math.max(...logits);
      const exps = logits.map(v=>Math.exp(v-max));
      const sum = exps.reduce((a,b)=>a+b,0);
      const probs = exps.map(v=>v/sum);
      return {logits, probs};
    }catch(e){ console.warn('heads load fail',e); return null; }
  }

  async function renderDistribution(containerEl, idx){
    await ensureData();
    const arch=CACHE.arch;
    const names = arch? arch.gameArchetypes : ['A0','A1','A2','A3','A4','A5','A6','A7'];
    const dist = await loadHeadsDistribution(idx);
    if(!dist){ containerEl.innerHTML='<span class="small-mono">distribution unavailable offline</span>'; return; }
    containerEl.innerHTML='';
    containerEl.style.cssText='display:flex;flex-direction:column;gap:6px';
    dist.probs.forEach((p,i)=>{
      const pct = Math.round(p*100);
      const color = PAL[i%PAL.length];
      const row = createEl('div','',`
        <div style="display:flex;justify-content:space-between;font-family:ui-monospace,monospace;font-size:11px;font-weight:700"><span>${names[i]||('Arch '+i)}</span><span>${pct}%</span></div>
        <div style="height:6px;border-radius:999px;background:${color};width:${pct}%;transition:width .5s"></div>
      `);
      row.style.cssText='padding:4px 0';
      containerEl.appendChild(row);
    });
    const foot = createEl('div','','<span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.6">Archetype head softmax 8-way from mtnn_heads.f32 logits — real trained MTNN 64-d v5.</span>');
    containerEl.appendChild(foot);
  }

  global.SkillTowerViz = {
    renderSkillGrid,
    renderTowerInfluence,
    renderBlendGrid,
    renderDistribution,
    ensureData,
    OK
  };
})(window);

// compatibility alias for 100M DAU wiring — expose VHSkillTowerViz for new play.html lab wiring (18 skill towers)
(function(g){
  if(!g.SkillTowerViz) return;
  function gradeFromRaw(v){ var gg=Math.round(50+v*18); if(gg<0) gg=0; if(gg>99) gg=99; return gg; }
  function render18(container, skills, keys, opts){
    opts=opts||{};
    if(!container) return;
    var arr = skills ? Array.from(skills) : [];
    var skKeys = keys || (g.VHMtnn && g.VHMtnn.arch && g.VHMtnn.arch.skillKeys) || g.SkillTowerViz.OK && Object.keys(g.SkillTowerViz.OK) || [];
    if(!skKeys.length) skKeys = ['scoring','shooting','finishing','ft','playmaking','security','oreb','dreb','hands','rim','efficiency','impact','post','transition','motor','shooting_gravity','rim_gravity','disruption_gravity'];
    // map to grades for grid
    var grades = arr.map(gradeFromRaw);
    // reuse renderSkillGrid if available but adapt to 18
    // if 18, render via simple custom (since SkillTowerViz expects 12 maybe)
    container.innerHTML='';
    container.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(138px,1fr));gap:8px;';
    var PAL = ['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000','#332288','#88CCEE','#44AA99','#117733','#999933','#DDCC77','#CC6677','#882255','#661100','#888'];
    arr.forEach(function(raw,i){
      var k=skKeys[i]||('s'+i);
      var grade=gradeFromRaw(raw);
      var color=PAL[i%PAL.length];
      var div=document.createElement('div');
      div.style.cssText='display:flex;flex-direction:column;gap:4px;padding:8px 9px;border:1.6px solid #1A150F;border-radius:10px;background:#fff;box-shadow:1.8px 1.8px 0 #1A150F;min-height:88px;';
      div.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;"><span style="font-family:ui-monospace,monospace;font-size:10px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;border:1.5px solid '+color+';border-radius:999px;padding:2px 6px;background:#fff;color:'+color+'">'+k+'</span><span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.6">'+(raw>=0?'+':'')+raw.toFixed(2)+'</span></div><div style="display:flex;justify-content:space-between;align-items:baseline;"><b style="font-family:ui-monospace,monospace;font-size:18px;line-height:1">'+grade+'</b><span style="font-size:10px;opacity:.7">raw</span></div><div style="height:8px;border:1.6px solid #1A150F;border-radius:999px;overflow:hidden;background:#FFFEF7"><i style="display:block;height:100%;width:'+grade+'%;background:'+color+'"></i></div>';
      container.appendChild(div);
    });
    var foot=document.createElement('div');
    foot.style.cssText='grid-column:1/-1;font-family:ui-monospace,monospace;font-size:10px;opacity:.7';
    foot.textContent=(opts.title||'Skill DNA 18 towers 48→16→1 — real mtnn_heads.f32')+' · top '+(grades.slice().sort(function(a,b){return b-a;}).slice(0,3).join(', '));
    container.appendChild(foot);
  }
  g.VHSkillTowerViz = {
    render: function(container, skills, keys, opts){ return render18(container, skills, keys, opts); },
    renderComparison: function(a,b,fused,keys,containers){
      try{
        if(containers && containers.fused) render18(containers.fused, fused, keys, {title:'Fused skill DNA — (A+B)/2 normalized 64-d → 18 towers'});
      }catch(e){}
    },
    gradeFromRaw: gradeFromRaw
  };
  // auto-wire fusion-done
  g.addEventListener('vh:fusion-done', function(ev){
    try{
      var d=ev.detail; if(!d) return;
      var mtnn=g.VHMtnn; if(!mtnn) return;
      var ha=mtnn.getHeads?mtnn.getHeads(d.a):null;
      var hb=mtnn.getHeads?mtnn.getHeads(d.b):null;
      var fused=mtnn.fuseHeads?mtnn.fuseHeads(d.a,d.b,0.5):null;
      var contF=document.getElementById('lab-skills-viz');
      if(fused && contF){
        var cache=mtnn._cache?mtnn._cache():null;
        var arch=cache?cache.arch:null;
        var keys=arch?arch.skillKeys:null;
        render18(contF, fused.skills, keys, {title:'Skill DNA blend — real 48→16→1 towers + grade 0-99'});
      }
    }catch(e){}
  });
})(window);
