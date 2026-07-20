/* drift-void.js v27 — left→right timeline, Y=role, Z=load distribution — fixed legibility */
export async function mountDriftVoid(canvas){
  if(!canvas) return;
  let THREE;
  try{ THREE = await import('three'); }catch{ THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js'); }
  const isLowEnd=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||window.innerWidth<560;
  const isMobile=window.innerWidth<760;

  const renderer=new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, isLowEnd?1.25:1.6));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(0xFFFEF7,1);
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xFFFEF7);

  const CAM_Z_DEFAULT=15.2, CAM_Z_MIN=5, CAM_Z_MAX=38;
  const camera=new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  camera.position.set(0, 5.0, CAM_Z_DEFAULT);
  let camBaseZ=CAM_Z_DEFAULT;
  const clampZ=z=>Math.max(CAM_Z_MIN, Math.min(CAM_Z_MAX, z));
  const setZ=z=>{ camBaseZ=clampZ(z); };

  scene.add(new THREE.AmbientLight(0xFFFFFF,1.0));
  const key=new THREE.DirectionalLight(0xFFFFFF,0.72); key.position.set(6,10,8); scene.add(key);

  const grid=new THREE.GridHelper(42, 21, 0xDAD5CA, 0xEDE8DC); grid.position.y=-3.55; scene.add(grid);
  { const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-18.8,-3.53,0), new THREE.Vector3(18.8,-3.53,0)]); scene.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:0x1A150F}))); }
  { const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-18.8,-3.53,0), new THREE.Vector3(-18.8,9.2,0)]); scene.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:0x1A150F, transparent:true, opacity:0.22}))); }
  { const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-18.8,-3.53,-3), new THREE.Vector3(-18.8,-3.53,3.6)]); scene.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:0x1A150F, transparent:true, opacity:0.18}))); }

  const CACHE_NAME='vector-hoops-v27-20260720-ltr-search-fix2';
  async function cachedFetchJSON(url){
    try{ if('caches' in window){ const c=await caches.open(CACHE_NAME); const hit=await c.match(url); if(hit) return await hit.json(); } }catch{}
    const r=await fetch(url,{cache:'default'});
    try{ if('caches' in window){ const c=await caches.open(CACHE_NAME); c.put(url, r.clone()).catch(()=>{}); } }catch{}
    return r.json();
  }

  let timeData=null, liteData=null, vecData=null, skillsData=null, teamData=null;
  try{
    const [tData, lPos, vData, sData, tmData] = await Promise.all([
      cachedFetchJSON('assets/archetypes_time.json?v=27'),
      cachedFetchJSON('assets/vectors_search_lite_pos.json?v=27').catch(()=>cachedFetchJSON('assets/vectors_search_lite.json?v=27')),
      cachedFetchJSON('assets/vectors.json?v=27').catch(()=>null),
      cachedFetchJSON('assets/skills_wide.json?v=27').catch(()=>null),
      cachedFetchJSON('assets/player_team_season.json?v=27').catch(()=>null)
    ]);
    timeData=tData; liteData=lPos; vecData=vData; skillsData=sData; teamData=tmData;
  }catch(e){ console.warn('drift v27 fetch fail',e); return; }

  const seasons=timeData?.prevalence||[];
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#111111'];
  const shortNames=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const longDesc=["Rim protection + glass","Low volume, high rebounding","Minimal box footprint","Def glass + FT rate","High vol 3P + creation","Efficient 3P spacer","Primary playmaking","High usage scoring"];
  const POS_LABELS=['PG','SG','SF','PF','C'];
  const POS_ICON={ PG:'●', SG:'▲', SF:'◆', PF:'■', C:'✚' };
  const seasonIdx=new Map(seasons.map((s,i)=>[s.season,i]));
  const getX = idx=> (idx/Math.max(1,seasons.length-1))*35 - 17.5;

  const minutesMap=new Map();
  if(vecData?.players){ for(const p of vecData.players) minutesMap.set(`${p.name}|${p.season}`, { gp:p.gp||0, mpg:p.mpg||0, total_min:p.total_min||0 }); }
  const skillsMap=skillsData?.grades||null;
  const teamMap=teamData||{};
  const getTeam=(name,season)=> teamMap[`${name}|${season}`]||'—';

  const seasonPlayersMap=new Map();
  for(const s of seasons) seasonPlayersMap.set(s.season,[]);
  const tmpPlayers=liteData?.players||liteData||[];
  for(const p of tmpPlayers){ if(!seasonPlayersMap.has(p.s)) seasonPlayersMap.set(p.s,[]); seasonPlayersMap.get(p.s).push(p); }

  let allMpgs=[]; for(const v of minutesMap.values()) if(v.mpg>0) allMpgs.push(v.mpg);
  allMpgs.sort((a,b)=>a-b);
  const mpgP5=allMpgs[Math.floor(allMpgs.length*0.05)]||10, mpgP95=allMpgs[Math.floor(allMpgs.length*0.95)]||52;
  const mpgMin=Math.max(0, mpgP5-1), mpgMax=mpgP95+1.5;
  const normZ=mpg=>{ const t=(mpg-mpgMin)/Math.max(0.001, mpgMax-mpgMin); return (t*5 - 2.3); };

  const peerGroup=new THREE.Group(); scene.add(peerGroup);
  {
    const count=tmpPlayers.length;
    const pos=new Float32Array(count*3), col=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      const p=tmpPlayers[i]; const si=seasonIdx.get(p.s); if(si===undefined) continue;
      const m=minutesMap.get(`${p.n}|${p.s}`); const load=m?.mpg|| (14+Math.random()*24);
      const x=getX(si)+(Math.random()-0.5)*0.34;
      const y=(p.c-3.5)*1.92 + (Math.random()-0.5)*0.42;
      const z=normZ(load)+(Math.random()-0.5)*0.26;
      pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
      const c=new THREE.Color(OKABE[p.c%8]||'#777'); if(c.getHex()===0x111111) c.setHex(0x8A8E99);
      col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
    }
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos,3)); geo.setAttribute('color', new THREE.BufferAttribute(col,3));
    peerGroup.add(new THREE.Points(geo, new THREE.PointsMaterial({ size:isLowEnd?0.14:0.18, vertexColors:true, transparent:false, opacity:0.96, sizeAttenuation:true })));
    peerGroup.add(new THREE.Points(geo.clone(), new THREE.PointsMaterial({ size:isLowEnd?0.22:0.30, vertexColors:true, transparent:true, opacity:0.14, sizeAttenuation:true, depthWrite:false })));
  }

  const byName=new Map(); for(const p of tmpPlayers){ if(!byName.has(p.n)) byName.set(p.n,[]); byName.get(p.n).push(p); } for(const arr of byName.values()) arr.sort((a,b)=> (a.s||'').localeCompare(b.s||''));
  const allNames=[...byName.keys()].sort((a,b)=> byName.get(b).length - byName.get(a).length);
  const CURATED=["LeBron James","Stephen Curry","Kevin Durant","Giannis Antetokounmpo","Nikola Jokic","James Harden","Russell Westbrook","Chris Paul","Kawhi Leonard","Damian Lillard","Luka Doncic","Jayson Tatum","Joel Embiid","Kobe Bryant","Tim Duncan","Dirk Nowitzki","Shaquille O'Neal","Kevin Garnett","Steve Nash","Dwyane Wade","Vince Carter","Anthony Edwards","Victor Wembanyama","Bo Outlaw","Anthony Davis","Devin Booker","Ja Morant","Donovan Mitchell","Gary Payton","Allen Iverson","Robert Covington"];
  let pool=CURATED.filter(n=>byName.has(n)); for(const nm of allNames){ if(pool.length>=140) break; if(!pool.includes(nm)&&byName.get(nm).length>=4) pool.push(nm); }

  const root=document.getElementById('lemmino-drift');
  if(root){
    root.style.background='#FFFEF7';
    root.style.borderTop='2.2px solid #1A150F';
    root.style.borderBottom='2.2px solid #1A150F';
    root.style.display='flex'; root.style.flexDirection='column';
  }
  let header=document.getElementById('drift-header-v26');
  if(!header){ header=document.createElement('div'); header.id='drift-header-v26'; root.prepend(header); }
  header.innerHTML=`
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:12px 14px;background:#FFFEF7;border-bottom:2px solid #1A150F">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span style="font-family:ui-monospace,monospace;font-size:10px;font-weight:900;letter-spacing:.08em;background:#1A150F;color:#FFFEF7;border-radius:999px;padding:7px 11px">Career Arc v27 — X=time left→right • Y=role • Z=load</span>
        <span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.7">peer dots = distribution per season in Y/Z • drag to rotate • pinch/wheel zoom</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;position:relative">
        <div style="position:relative">
          <input id="drift-player-search" placeholder="Search any player — 2 293 names" autocomplete="off" style="min-width:${isMobile?'58vw':'340px'};width:${isMobile?'58vw':'380px'};max-width:80vw;height:46px;border:2.2px solid #1A150F;border-radius:12px;padding:0 14px 0 38px;font-family:ui-monospace,monospace;font-weight:800;font-size:13px;background:#fff;box-shadow:3px 3px 0 #1A150F;outline:none"/>
          <span style="position:absolute;left:13px;top:50%;transform:translateY(-50%)">🔍</span>
          <div id="drift-search-results" style="position:absolute;left:0;top:52px;width:100%;max-height:360px;overflow:auto;background:#FFFEF7;border:2.2px solid #1A150F;border-radius:14px;box-shadow:6px 6px 0 #1A150F;display:none;z-index:30"></div>
        </div>
        <button id="drift-random" type="button" style="min-height:46px;padding:0 16px;border:2.2px solid #1A150F;border-radius:12px;background:#F0E442;font-family:ui-monospace,monospace;font-weight:900;box-shadow:3px 3px 0 #1A150F;cursor:pointer">🎲 Random</button>
      </div>
    </div>`;

  const existingCanvas=document.getElementById('lemmino-drift-canvas');
  let wrap=document.getElementById('drift-canvas-wrap-v26');
  if(!wrap){ wrap=document.createElement('div'); wrap.id='drift-canvas-wrap-v26'; wrap.style.cssText='position:relative;width:100%;background:#FFFEF7;'; existingCanvas.parentNode.insertBefore(wrap, existingCanvas); wrap.appendChild(existingCanvas); }
  existingCanvas.style.width='100%'; existingCanvas.style.height=isMobile?'62vh':'60vh'; existingCanvas.style.minHeight='420px'; existingCanvas.style.display='block'; existingCanvas.style.touchAction='none'; existingCanvas.style.cursor='grab';

  let focusWrap=document.getElementById('drift-focus-v26');
  if(!focusWrap){ focusWrap=document.createElement('div'); focusWrap.id='drift-focus-v26'; focusWrap.style.cssText='position:absolute;left:12px;right:12px;top:10px;z-index:5;pointer-events:none;display:flex;flex-direction:column;gap:6px;max-width:920px'; wrap.appendChild(focusWrap); }
  focusWrap.innerHTML=`<div id="lemmino-drift-focus" style="pointer-events:auto"></div><div id="lemmino-drift-meta" style="pointer-events:auto"></div>`;
  const focusEl=document.getElementById('lemmino-drift-focus');
  const metaEl=document.getElementById('lemmino-drift-meta');

  let controls=document.getElementById('drift-controls-v26');
  if(!controls){ controls=document.createElement('div'); controls.id='drift-controls-v26'; controls.style.cssText='display:flex;gap:8px;align-items:center;padding:10px 14px;background:#FFFEF7;border-top:1.8px solid #1A150F;flex-wrap:wrap'; wrap.appendChild(controls); }
  controls.innerHTML=`
    <button id="drift-prev" style="appearance:none;min-width:52px;min-height:42px;border:2px solid #1A150F;border-radius:999px;background:#fff;font-family:ui-monospace,monospace;font-weight:900;cursor:pointer;box-shadow:2px 2px 0 #1A150F">⟵ Prev</button>
    <button id="drift-play" style="appearance:none;min-width:92px;min-height:42px;border:2.2px solid #1A150F;border-radius:999px;background:#1A150F;color:#FFFEF7;font-family:ui-monospace,monospace;font-weight:900;cursor:pointer;box-shadow:2px 2px 0 #1A150F">▶ Play left→right</button>
    <button id="drift-next" style="appearance:none;min-width:52px;min-height:42px;border:2px solid #1A150F;border-radius:999px;background:#fff;font-family:ui-monospace,monospace;font-weight:900;cursor:pointer;box-shadow:2px 2px 0 #1A150F">Next ⟶</button>
    <div id="drift-scrub" style="flex:1 1 180px;min-width:160px;height:18px;background:#ECE7DB;border-radius:999px;position:relative;overflow:hidden;cursor:pointer;border:2px solid #1A150F"><div id="drift-scrub-fill" style="position:absolute;left:0;top:0;bottom:0;width:0%;background:#1A150F;border-radius:999px"></div></div>
    <span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.6">outline= past • filled= current • Y stacked by archetype • Z depth by load</span>
  `;
  const scrub=document.getElementById('drift-scrub');
  const scrubFill=document.getElementById('drift-scrub-fill');
  const btnPlay=document.getElementById('drift-play');
  const btnNext=document.getElementById('drift-next');
  const btnPrev=document.getElementById('drift-prev');
  const searchInput=document.getElementById('drift-player-search');
  const searchResults=document.getElementById('drift-search-results');
  const randomBtn=document.getElementById('drift-random');

  let timelineH=document.getElementById('drift-timeline');
  if(!timelineH){ timelineH=document.createElement('div'); timelineH.id='drift-timeline'; root.appendChild(timelineH); }
  timelineH.style.cssText=`display:flex;gap:7px;overflow-x:auto;overflow-y:hidden;padding:12px 14px;background:#FFFEF7;border-top:1.8px solid #1A150F;border-bottom:1.8px solid #1A150F;scrollbar-width:thin`;

  let quadEl=document.getElementById('drift-quad');
  if(!quadEl){ quadEl=document.createElement('div'); quadEl.id='drift-quad'; root.appendChild(quadEl); }
  quadEl.style.cssText=`position:relative;right:auto;top:auto;width:100%;max-width:100%;overflow:visible;z-index:2;background:#12100C;border-top:2.2px solid #1A150F;padding:16px;display:flex;flex-direction:column;gap:14px`;

  const styleEl=document.getElementById('drift-v21-style')||document.createElement('style'); styleEl.id='drift-v21-style';
  styleEl.textContent=`
    #drift-timeline::-webkit-scrollbar{height:6px} #drift-timeline::-webkit-scrollbar-thumb{background:#1A150F;border-radius:99px}
    .drift-tm-chip{border-radius:999px;padding:8px 13px;font-family:ui-monospace,monospace;font-size:11.5px;font-weight:800;cursor:pointer;transition:all .12s;white-space:nowrap;line-height:1.1;flex:0 0 auto;border:2px solid #1A150F}
    .drift-tm-chip.filled{background:#1A150F;color:#FFFEF7;box-shadow:3px 3px 0 #1A150F;transform:translateY(-1px)}
    .drift-tm-chip.outline-past{background:#fff;color:#1A150F;border-style:dashed;opacity:.9;box-shadow:1.5px 1.5px 0 #1A150F}
    .drift-tm-chip.outline-future{background:transparent;color:#8A847B;border-style:dashed;border-color:rgba(26,21,15,.32);opacity:.55}
    .dq-kicker{font-family:ui-monospace,monospace;font-weight:900;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#9AA0AC;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .dq-title{font-family:ui-sans-serif,system-ui;font-weight:900;font-size:${isMobile? '16px':'19px'};line-height:1.15;letter-spacing:-.02em;color:#FFFEF7;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    .dq-dot{width:10px;height:10px;border-radius:999px;border:1.5px solid #1A150F;display:inline-block;flex-shrink:0}
    .dq-subtitle{font-family:ui-monospace,monospace;font-size:11px;line-height:1.45;color:#C2C6D0}
    .dq-bigrow{display:flex;gap:12px;align-items:stretch;flex-wrap:wrap}
    .dq-pct{font-family:ui-sans-serif,system-ui;font-weight:900;font-size:32px;line-height:.95;letter-spacing:-.03em;padding:10px 14px;border-radius:14px;border:2.2px solid #1A150F;min-width:96px;text-align:center;display:flex;flex-direction:column;justify-content:center}
    .dq-pct.good{background:#B8E6C8;color:#0A1A0F} .dq-pct.bad{background:#FFC8B8;color:#2A0F0A} .dq-pct.mid{background:#FFE8A0;color:#1A150F}
    .dq-pill{border-radius:999px;padding:6px 12px;font-family:ui-monospace,monospace;font-size:11px;font-weight:800;border:1.5px solid #1A150F;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
    .dq-pill.white{background:#FFFEF7;color:#1A150F} .dq-pill.dark{background:#1A150F;color:#FFFEF7;border-color:#FFFEF7} .dq-pill.mid{background:#FFE8A0;color:#1A150F} .dq-pill.good{background:#B8E6C8;color:#0A1A0F} .dq-pill.bad{background:#FFC8B8;color:#2A0F0A}
    .dq-grid2{display:grid;grid-template-columns:${isMobile? '1fr':'1fr 1fr'};gap:10px}
    .dq-section{border:1.5px solid #232018;border-radius:12px;padding:12px;background:rgba(255,254,247,.05);display:flex;flex-direction:column;gap:8px}
    .dq-label{font-family:ui-monospace,monospace;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#E8E0D0;display:flex;justify-content:space-between;gap:8px}
    .dq-track{height:16px;background:rgba(255,254,247,.12);border-radius:999px;position:relative;border:1px solid rgba(255,254,247,.08)}
    .dq-avg{position:absolute;top:-6px;bottom:-6px;width:0;display:flex;flex-direction:column;align-items:center;pointer-events:none}
    .dq-avg-line{width:2px;height:100%;background:#F0E442;box-shadow:0 0 0 1px #000}
    .dq-avg-lbl{font-family:ui-monospace,monospace;font-size:9px;font-weight:900;color:#F0E442;background:#1A150F;padding:1px 4px;border-radius:4px;margin-top:2px}
    .dq-cur{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:999px;background:#FFFEF7;border:2.2px solid #1A150F;box-shadow:0 0 0 2px rgba(255,254,247,.22)}
    .dq-hist{height:48px;display:flex;gap:3px;align-items:end}
    .dq-hist-bar{flex:1;border-radius:4px 4px 2px 2px;min-width:3px}
    .dq-hist-bar.is-cur{outline:2px solid #FFFEF7;box-shadow:0 0 0 1.5px #1A150F,0 0 12px rgba(255,254,247,.5);z-index:1}
    .dq-sentence{font-family:ui-sans-serif,system-ui;font-size:${isMobile?'14px':'15px'};line-height:1.55;font-weight:600;color:#FFFEF7;background:rgba(255,254,247,.07);border-radius:12px;padding:12px 14px;border:1px solid rgba(255,254,247,.1)}
    .dq-peers{font-family:ui-monospace,monospace;font-size:11px;line-height:1.5;color:#C2C6D0;background:rgba(18,16,12,.6);border-radius:10px;padding:10px 12px;border:1px dashed #2A241E}
    .drift-sresult{padding:10px 12px;cursor:pointer;border-bottom:1px solid rgba(26,21,15,.08);display:flex;justify-content:space-between;gap:8px;font-family:ui-monospace,monospace;font-size:12.5px}
    .drift-sresult:hover{background:#1A150F;color:#FFFEF7}
  `;
  document.head.appendChild(styleEl);

  function computeQuadStats(metaItem, currentName){
    const seasonStr=metaItem.season;
    const peers=seasonPlayersMap.get(seasonStr)||[];
    const archeIdx=metaItem.archeIdx;
    const pIdx=metaItem.p; const posLabel=metaItem.pl;
    const curKey=`${currentName}|${seasonStr}`;
    const curMin=minutesMap.get(curKey);
    let sameQuad=peers.filter(p=>{ const sameArch=p.c===archeIdx; const samePos=pIdx>=0&&p.p!==undefined? p.p===pIdx : (posLabel? p.pl===posLabel : true); return sameArch&&samePos; });
    if(sameQuad.length<6) sameQuad=peers.filter(p=>p.c===archeIdx);
    const vals=[];
    for(const p of sameQuad){ const km=minutesMap.get(`${p.n}|${seasonStr}`); if(km&&km.mpg) vals.push({ name:p.n, mpg:km.mpg, gp:km.gp, total_min:km.total_min }); }
    vals.sort((a,b)=>a.mpg-b.mpg);
    let avgMpg=0, avgGp=0, rank=-1;
    if(vals.length){ avgMpg=vals.reduce((s,v)=>s+v.mpg,0)/vals.length; avgGp=vals.reduce((s,v)=>s+v.gp,0)/vals.length; rank=vals.findIndex(v=>v.name===currentName); }
    const pct=rank>=0&&vals.length>1? (rank/(vals.length-1))*100 : 0;
    return { sameQuad, vals, n:vals.length, rank, pct, avgMpg, avgGp, curMin };
  }

  const playerGroup=new THREE.Group(); scene.add(playerGroup);
  const trailGroup=new THREE.Group(); scene.add(trailGroup);
  const ghostGroup=new THREE.Group(); scene.add(ghostGroup);
  const labelGroup=new THREE.Group(); scene.add(labelGroup);

  function clearGroup(g){ while(g.children.length){ const c=g.children[0]; g.remove(c); if(c.geometry) c.geometry.dispose(); if(c.material){ if(c.material.map) c.material.map.dispose?.(); c.material.dispose(); } } }

  function makeTextSprite(text, opts={}){
    const c=document.createElement('canvas'); const ctx=c.getContext('2d');
    const fontSize=opts.fontSize||46; const pad=16;
    ctx.font=`900 ${fontSize}px ui-monospace,monospace`; const w=ctx.measureText(text).width;
    c.width=w+pad*2; c.height=fontSize+pad*1.4;
    ctx.font=`900 ${fontSize}px ui-monospace,monospace`;
    const r=12;
    ctx.fillStyle=opts.bg||'#FFFEF7'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=5;
    ctx.beginPath(); ctx.roundRect(0,0,c.width,c.height,r); ctx.fill(); ctx.stroke();
    ctx.fillStyle=opts.color||'#1A150F'; ctx.fillText(text, pad, fontSize+pad*0.3);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:false });
    const sprite=new THREE.Sprite(mat); sprite.scale.set((c.width/(fontSize*1.5))* (opts.scale||1), 0.58*(opts.scale||1),1);
    return sprite;
  }

  function buildArc(name){
    const entries=byName.get(name)||[];
    const pts=[], meta=[];
    for(const e of entries){
      const si=seasonIdx.get(e.s); if(si===undefined) continue;
      const km=minutesMap.get(`${e.n}|${e.s}`); const load=km?.mpg|| (mpgMin+(mpgMax-mpgMin)*0.5);
      pts.push(new THREE.Vector3(getX(si), (e.c-3.5)*1.92, normZ(load)));
      meta.push({ season:e.s, archeIdx:e.c, arche:shortNames[e.c], desc:longDesc[e.c], share:seasons[si]?.shares[e.c]||0, si, total:seasons[si]?.total||0, p:e.p!==undefined? e.p : (POS_LABELS.indexOf(e.pl||'')>=0? POS_LABELS.indexOf(e.pl): -1), pl:e.pl||POS_LABELS[e.p]||'', name:e.n, team:getTeam(e.n,e.s), mpg:load });
    }
    if(pts.length<2) return null;
    const curve=new THREE.CatmullRomCurve3(pts);
    const baseColor=new THREE.Color(OKABE[meta[Math.floor(meta.length/2)].archeIdx%8]);
    if(baseColor.getHex()===0x111111) baseColor.setHex(0x1A150F);
    const nodes=new THREE.Group(); const nodeMeshes=[];
    for(let i=0;i<pts.length;i++){
      const isChange=i>0&&meta[i].archeIdx!==meta[i-1].archeIdx;
      const outer=new THREE.Mesh(new THREE.SphereGeometry(isChange?0.24:0.16,18,18), new THREE.MeshBasicMaterial({ color:0x1A150F }));
      outer.position.copy(pts[i]);
      const inner=new THREE.Mesh(new THREE.SphereGeometry(isChange?0.17:0.10,18,18), new THREE.MeshBasicMaterial({ color:baseColor }));
      inner.position.copy(pts[i]); inner.position.z+=0.001;
      const g=new THREE.Group(); g.add(outer); g.add(inner); g.userData.isChange=isChange; g.userData.seasonIdx=i;
      nodes.add(g); nodeMeshes.push(g);
    }
    const changes=[]; for(let i=1;i<meta.length;i++) if(meta[i].archeIdx!==meta[i-1].archeIdx) changes.push({ idx:i, from:meta[i-1], to:meta[i] });
    const ghostGeo=new THREE.BufferGeometry().setFromPoints(pts);
    const ghostLine=new THREE.Line(ghostGeo, new THREE.LineBasicMaterial({ color:0x1A150F, transparent:true, opacity:0.18 }));
    const shell=new THREE.Mesh(new THREE.SphereGeometry(0.36,22,22), new THREE.MeshBasicMaterial({ color:0x1A150F }));
    const core=new THREE.Mesh(new THREE.SphereGeometry(0.24,22,22), new THREE.MeshBasicMaterial({ color:baseColor }));
    const halo=new THREE.Mesh(new THREE.SphereGeometry(0.58,16,16), new THREE.MeshBasicMaterial({ color:baseColor, transparent:true, opacity:0.18 }));
    const travellerGroup=new THREE.Group(); travellerGroup.add(shell); travellerGroup.add(core); travellerGroup.add(halo);
    return { name, pts, meta, curve, nodes, nodeMeshes, travellerGroup, baseColor, changes, ghostLine, shell, core };
  }

  function buildLabelsOnce(){
    clearGroup(labelGroup);
    for(let s=0;s<seasons.length;s++){
      if(s%2!==0 && seasons.length>20) continue;
      const sp=makeTextSprite(seasons[s].season, { fontSize:30, scale:0.82, bg:'#FFFEF7' });
      sp.position.set(getX(s), -3.55-0.7, 0);
      labelGroup.add(sp);
    }
    for(let a=0;a<8;a++){
      const bg= OKABE[a]==='#111111' ? '#1A150F' : '#FFFEF7';
      const col= OKABE[a]==='#111111' ? '#FFFEF7' : OKABE[a];
      const sp=makeTextSprite(`${a} ${shortNames[a]}`, { fontSize:26, scale:0.62, bg, color:col });
      sp.position.set(-18.9, (a-3.5)*1.92, 0.1);
      labelGroup.add(sp);
    }
    const zLabel=makeTextSprite(`Z load ${mpgMin.toFixed(0)}→${mpgMax.toFixed(0)}`, { fontSize:28, scale:0.72, bg:'#1A150F', color:'#FFFEF7' });
    zLabel.position.set(-18.0, -2.8, 2.9);
    labelGroup.add(zLabel);
  }
  buildLabelsOnce();

  let current=null, tProg=0, paused=true, embedPaused=true, used=new Set(), lastSwitch=performance.now(), lastChangeIdx=-1, autoPauseUntil=0;
  window.addEventListener('vh:pause-maps',()=>{ embedPaused=true; paused=true; if(btnPlay) btnPlay.textContent='▶ Play left→right'; });

  function careerStage(idx,total){ const r=idx/Math.max(1,total-1); if(r<0.18) return 'Rookie'; if(r<0.35) return 'Breakout'; if(r<0.62) return 'Prime'; if(r<0.84) return 'Veteran'; return 'Late'; }

  function renderTimelineH(){
    if(!current) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    timelineH.innerHTML='';
    current.meta.forEach((m,i)=>{
      const chip=document.createElement('div');
      chip.className='drift-tm-chip ' + (i===idx? 'filled' : (i<idx? 'outline-past' : 'outline-future'));
      chip.textContent=`${m.season} ${m.team} ${m.arche}${m.pl? ' '+m.pl:''}`;
      chip.onclick=()=>{ tProg=i/current.meta.length; embedPaused=false; paused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; };
      timelineH.appendChild(chip);
    });
    const curEl=timelineH.children[idx]; if(curEl) curEl.scrollIntoView({ block:'nearest', inline:'center', behavior:'smooth' });
  }

  function renderQuad(m, quad){
    const n=quad.n||0; const vals=quad.vals||[]; const curMpg=quad.curMin?.mpg||m.mpg||0; const curGp=quad.curMin?.gp||0; const avgMpg=quad.avgMpg||0; const avgGp=quad.avgGp||0; const pct=Math.round(quad.pct||0);
    const pctState = pct>=67? 'good' : pct<=33? 'bad' : 'mid';
    const mpgs=vals.map(v=>v.mpg).filter(v=>v>0); const minMpg= mpgs.length? Math.min(...mpgs) : avgMpg*0.7; const maxMpg= mpgs.length? Math.max(...mpgs) : avgMpg*1.3;
    const minGp= vals.map(v=>v.gp).filter(v=>v>0); const gMin=Math.min(...(minGp.length? minGp:[0])), gMax=Math.max(...(minGp.length? minGp:[82]));
    const rMinMpg=minMpg- (maxMpg-minMpg)*0.06 -0.2, rMaxMpg=maxMpg+ (maxMpg-minMpg)*0.06 +0.2; const rMinGp=Math.max(0,gMin-2), rMaxGp=gMax+2;
    const bins=12; const hist=Array(bins).fill(0); mpgs.forEach(v=>{ const b=Math.min(bins-1, Math.max(0, Math.floor(((v-rMinMpg)/Math.max(0.001,rMaxMpg-rMinMpg))*bins))); hist[b]++; }); const maxBin=Math.max(...hist,1);
    const curBin=Math.min(bins-1, Math.max(0, Math.floor(((curMpg-rMinMpg)/Math.max(0.001,rMaxMpg-rMinMpg))*bins)));
    const avgPosPct=((avgMpg-rMinMpg)/Math.max(0.001,rMaxMpg-rMinMpg))*100; const curPosPct=((curMpg-rMinMpg)/Math.max(0.001,rMaxMpg-rMinMpg))*100;
    const closest = [...vals].filter(v=>v.name!==m.name).sort((a,b)=> Math.abs(a.mpg-curMpg)-Math.abs(b.mpg-curMpg)).slice(0,3);
    let sentence='';
    if(n<3) sentence=`${m.name} is one of few ${m.pl} ${m.arche} in ${m.season} — only ${n} peers. Y=role shifts show archetype distribution, Z=load shows minutes distribution.`;
    else if(pct>=80) sentence=`${m.name} heavy load — more than ${pct}% of ${m.pl} ${m.arche} peers. X left→right = time; Y up/down = role distribution; Z depth = load distribution.`;
    else sentence=`${m.name} ${curGp} GP vs ${avgGp.toFixed(0)} avg — P${pct} among ${n} ${m.pl} ${m.arche} peers in ${m.season}. Y=role, Z=load distributions visible as peer clouds behind each X slice.`;
    const archColor=OKABE[m.archeIdx%8]||'#1A150F';
    function bar(min,max,curAvg,curVal){
      const curP=Math.max(2,Math.min(98, ((curVal-min)/Math.max(0.001,max-min))*100 )); const avgP=Math.max(2,Math.min(98, ((curAvg-min)/Math.max(0.001,max-min))*100 ));
      return `<div class="dq-track"><div class="dq-avg" style="left:${avgP}%"><div class="dq-avg-line"></div><div class="dq-avg-lbl">▲ avg</div></div><div class="dq-cur" style="left:${curP}%"></div></div>`;
    }
    const xPct=Math.round(((getX(m.si)+17.5)/35)*100);
    quadEl.innerHTML=`
      <div class="dq-kicker"><span class="dq-dot" style="background:${archColor}"></span> ${m.season} • ${m.team} • ${m.pl} ${m.arche} — X ${xPct}% left→right • ${n} peers in quad</div>
      <div class="dq-title"><span>${POS_ICON[m.pl]||'●'}</span> ${m.pl} × <span style="display:inline-flex;align-items:center;gap:6px"><span class="dq-dot" style="background:${archColor}"></span> ${m.arche}</span> <span class="dq-pill white">X time</span> <span class="dq-pill dark">Y role</span> <span class="dq-pill mid">Z load</span></div>
      <div class="dq-subtitle">Left→right = seasons. Y (up/down) = 8 archetypes distribution — your line jumps when role changes. Z (depth) = MIN load distribution — peer clouds per season spread in depth. Background dots = league distribution.</div>
      <div class="dq-bigrow">
        <div class="dq-pct ${pctState}"><div>▲ P${pct}</div><small>${pct>=67? 'above avg': pct<=33? 'below':'mid'} • X ${xPct}%</small></div>
        <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="dq-pill white">● ${curGp} GP vs ${avgGp.toFixed(0)} avg</span>
            <span class="dq-pill ${pctState}">■ ${curMpg.toFixed(1)} load vs ${avgMpg.toFixed(1)} avg</span>
            <span class="dq-pill dark">Z ${(normZ(curMpg)).toFixed(2)}</span>
          </div>
          <span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.75">MIN load inflated (52=4264/82) — percentile accurate. Y=role, Z=load axes in void.</span>
        </div>
      </div>
      <div class="dq-grid2">
        <div class="dq-section"><div class="dq-label"><span>Games — distribution</span><span>${rMinGp.toFixed(0)}→${rMaxGp.toFixed(0)}</span></div><div style="font-family:ui-sans-serif;font-weight:800;color:#FFFEF7">${curGp} vs ${avgGp.toFixed(0)} avg</div>${bar(rMinGp,rMaxGp,avgGp,curGp)}</div>
        <div class="dq-section"><div class="dq-label"><span>Load distribution — Z axis = depth</span><span>${rMinMpg.toFixed(1)}→${rMaxMpg.toFixed(1)}</span></div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div class="dq-hist">${hist.map((h,i)=>{ const isCur=i===curBin; const base=isCur? '#FFFEF7' : i===Math.floor(avgPosPct/100*bins)? '#F0E442' : '#3A3E4A'; const hPct=10+(h/maxBin)*40; return `<div class="dq-hist-bar ${isCur?'is-cur':''}" style="height:${hPct}px;background:${base};opacity:${isCur?1:0.6}"></div>`; }).join('')}</div>
            <div style="position:relative;height:14px;background:rgba(255,254,247,.08);border-radius:999px"><div class="dq-avg" style="left:${avgPosPct}%"><div class="dq-avg-line" style="height:14px"></div></div><div class="dq-cur" style="left:${curPosPct}%"></div></div>
          </div>
        </div>
      </div>
      ${closest.length? `<div class="dq-peers"><b style="color:#E8E0D0">Closest peers same X slice</b><br>${closest.map(p=>`● ${p.name} — ${p.mpg.toFixed(1)} load, ${p.gp} GP`).join('<br>')}</div>`:''}
      <div class="dq-sentence">${sentence}<br><span style="opacity:.8;font-weight:400;font-size:12.5px">${m.desc}. Outline chips = past seasons left of current, filled = current ${m.season}. Peer clouds per season show Y/Z distributions. Drag canvas to rotate, wheel to zoom.</span></div>
    `;
  }

  function updateTrails(){
    if(!current) return;
    clearGroup(trailGroup); clearGroup(ghostGroup);
    ghostGroup.add(current.ghostLine);
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    current.nodeMeshes.forEach((g,i)=>{
      const s=i===idx? 1.25: i<idx? 1.0:0.85;
      g.scale.set(s,s,s);
    });
    if(idx>0){
      const pastPts=current.pts.slice(0, idx+1);
      if(pastPts.length>=2){
        const c=new THREE.CatmullRomCurve3(pastPts);
        const tube=new THREE.TubeGeometry(c, Math.max(pastPts.length*8,40), 0.10, 8, false);
        trailGroup.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color:0x1A150F, transparent:true, opacity:0.72 })));
      }
    }
    if(idx < current.meta.length-1){
      const fut=current.pts.slice(idx);
      if(fut.length>=2){
        const fGeo=new THREE.BufferGeometry().setFromPoints(fut);
        const fMat=new THREE.LineDashedMaterial({ color:current.baseColor, transparent:true, opacity:0.32, dashSize:0.22, gapSize:0.18 });
        const l=new THREE.Line(fGeo,fMat); l.computeLineDistances(); trailGroup.add(l);
      }
    }
  }

  function renderFocus(){
    if(!current) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const m=current.meta[idx];
    if(renderFocus._lastIdx!==idx){ renderFocus._lastIdx=idx; updateTrails(); renderTimelineH(); }
    const quad=computeQuadStats(m, current.name);
    const xPct=Math.round(((getX(m.si)+17.5)/35)*100);
    const stage=careerStage(idx,current.meta.length);
    const change=current.changes.find(c=>c.idx===idx);
    if(change && lastChangeIdx!==idx){ lastChangeIdx=idx; autoPauseUntil=performance.now()+2000; }
    focusEl.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:6px"><span style="background:#1A150F;color:#FFFEF7;border:2px solid #1A150F;padding:6px 12px;border-radius:999px;font-weight:900;font-family:ui-monospace,monospace;font-size:12px;box-shadow:3px 3px 0 #1A150F">${current.name} [${idx+1}/${current.meta.length} ${stage}] X ${xPct}%</span><span style="background:#FFFEF7;border:2px solid #1A150F;padding:6px 12px;border-radius:999px;font-weight:800;font-family:ui-monospace,monospace;font-size:12px;box-shadow:2px 2px 0 #1A150F">${m.season} ${m.team} ${m.arche} ${m.pl} • Y role • Z P${Math.round(quad.pct)}</span>${change? `<span style="background:#F0E442;border:2px solid #1A150F;padding:6px 10px;border-radius:999px;font-weight:900;font-size:11px">SHIFT ${change.from.arche}→${change.to.arche}</span>`:''}</div>`;
    metaEl.innerHTML=`<span style="font-family:ui-monospace,monospace;font-size:11px;background:#1A150F;color:#FFFEF7;border-radius:8px;padding:6px 10px;box-shadow:2px 2px 0 #1A150F;display:inline-block;max-width:100%">X left→right time • Y up/down = 8 archetypes distribution • Z depth = load distribution • ${quad.curMin?.gp||'—'} GP vs ${quad.avgGp.toFixed(0)} avg • ${m.desc}</span>`;
    renderQuad(m, quad);
    if(scrubFill) scrubFill.style.width=`${(tProg*100).toFixed(1)}%`;
  }
  renderFocus._lastIdx=-1;

  function show(name){
    clearGroup(playerGroup); clearGroup(trailGroup); clearGroup(ghostGroup);
    renderFocus._lastIdx=-1;
    const arc=buildArc(name); if(!arc){ const n=pool.find(x=>x!==name)||allNames[0]; if(n) return show(n); return; }
    playerGroup.add(arc.nodes); playerGroup.add(arc.travellerGroup); ghostGroup.add(arc.ghostLine);
    current=arc; tProg=0; lastChangeIdx=-1; used.add(name);
    if(searchInput) searchInput.value=name;
    updateTrails(); renderTimelineH(); renderFocus();
  }

  function renderSearchResults(q){
    if(!q||q.length<1){ searchResults.style.display='none'; return; }
    const lower=q.toLowerCase();
    const matches=allNames.filter(n=> n.toLowerCase().includes(lower)).slice(0,24).map(n=>({ n, len:byName.get(n)?.length||0 })).sort((a,b)=>{ const ap=a.n.toLowerCase().startsWith(lower), bp=b.n.toLowerCase().startsWith(lower); if(ap!==bp) return bp-ap; return b.len-a.len; }).slice(0,12);
    if(!matches.length){ searchResults.innerHTML=`<div class="drift-sresult" style="opacity:.6">No match</div>`; searchResults.style.display='block'; return; }
    searchResults.innerHTML=matches.map(m=>`<div class="drift-sresult" data-name="${m.n.replace(/"/g,'&quot;')}"><span>${m.n}</span><small>${m.len} seasons</small></div>`).join('');
    searchResults.style.display='block';
    [...searchResults.querySelectorAll('.drift-sresult')].forEach(el=> el.addEventListener('click',()=>{ const name=el.getAttribute('data-name'); searchResults.style.display='none'; if(name) show(name); }));
  }
  if(searchInput){
    searchInput.addEventListener('input', e=> renderSearchResults(e.target.value.trim()));
    searchInput.addEventListener('focus', e=> renderSearchResults(e.target.value.trim()));
    searchInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const q=e.target.value.trim(); const exact= allNames.find(n=> n.toLowerCase()===q.toLowerCase()) || allNames.find(n=> n.toLowerCase().includes(q.toLowerCase())); if(exact){ searchResults.style.display='none'; show(exact); } } if(e.key==='Escape') searchResults.style.display='none'; });
    document.addEventListener('click', e=>{ if(!searchInput.contains(e.target)&&!searchResults.contains(e.target)) searchResults.style.display='none'; });
  }
  if(randomBtn) randomBtn.addEventListener('click',()=>{ let cands=allNames.filter(n=> !used.has(n) && (byName.get(n)?.length||0)>=3); if(cands.length<30){ used.clear(); cands=allNames.filter(n=> (byName.get(n)?.length||0)>=3); } const pick=cands[Math.floor(Math.random()*cands.length)]||pool[Math.floor(Math.random()*pool.length)]; show(pick); });

  const initial = (pool.find(n=> allNames.includes(n)) || 'Robert Covington');
  show(allNames.includes(initial)? initial : pool[0]||allNames[0]);

  if(scrub){
    let dragging=false; const setFromX=x=>{ const r=scrub.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(x-r.left)/r.width)); tProg=p; renderFocus(); if(current){ const pt=current.curve.getPointAt(Math.max(0.0001,Math.min(0.999,tProg))); if(pt){ current.travellerGroup.position.copy(pt); current.travellerGroup.position.y+=0.08; } } };
    scrub.addEventListener('pointerdown',e=>{ dragging=true; try{scrub.setPointerCapture(e.pointerId);}catch{} setFromX(e.clientX); paused=true; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; });
    scrub.addEventListener('pointermove',e=>{ if(dragging) setFromX(e.clientX); });
    scrub.addEventListener('pointerup',()=>{ dragging=false; });
    scrub.addEventListener('click',e=> setFromX(e.clientX));
  }
  if(btnPlay) btnPlay.addEventListener('click',()=>{ if(paused||embedPaused){ paused=false; embedPaused=false; btnPlay.textContent='❚❚ Pause'; } else { paused=true; embedPaused=true; btnPlay.textContent='▶ Play left→right'; } });
  if(btnNext) btnNext.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx+1;j<current.meta.length;j++) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; renderFocus(); const pt=current.curve.getPointAt(tProg); if(pt) current.travellerGroup.position.copy(pt); return; } tProg=1; renderFocus(); });
  if(btnPrev) btnPrev.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx-1;j>=1;j--) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; renderFocus(); const pt=current.curve.getPointAt(tProg); if(pt) current.travellerGroup.position.copy(pt); return; } tProg=0; renderFocus(); });

  function onWheel(e){ e.preventDefault(); setZ(camBaseZ + Math.sign(e.deltaY)*0.55 + e.deltaY*0.003); } canvas.addEventListener('wheel', onWheel, {passive:false});
  let pinchStartDist=0, pinchStartZ=CAM_Z_DEFAULT; const distTouches=t=>{ const a=t[0],b=t[1]; return Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY); };
  canvas.addEventListener('touchstart', e=>{ if(e.touches?.length===2){ pinchStartDist=distTouches(e.touches); pinchStartZ=camBaseZ; } }, {passive:true});
  canvas.addEventListener('touchmove', e=>{ if(e.touches?.length===2){ e.preventDefault(); const d=distTouches(e.touches); const ratio=pinchStartDist/(d||1); setZ(pinchStartZ * ratio); } }, {passive:false});
  let dragStartX=0, isDrag=false;
  canvas.addEventListener('pointerdown', e=>{ if(e.pointerType==='mouse' && e.button===0){ isDrag=true; dragStartX=e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor='grabbing'; } });
  canvas.addEventListener('pointermove', e=>{ if(isDrag){ const dx=(e.clientX-dragStartX)*0.02; camera.position.x+=dx*0.1; dragStartX=e.clientX; } });
  canvas.addEventListener('pointerup', e=>{ isDrag=false; canvas.style.cursor='grab'; try{canvas.releasePointerCapture(e.pointerId);}catch{} });

  function onResize(){ const w=canvas.clientWidth,h=canvas.clientHeight; if(w<10||h<10) return; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); } const ro=new ResizeObserver(onResize); ro.observe(canvas); onResize();
  let visible=true; const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; },{threshold:0.02}); io.observe(canvas);

  function tick(){
    requestAnimationFrame(tick); if(embedPaused) return; if(!visible) return;
    const now=performance.now();
    if(!paused && now>autoPauseUntil){ tProg+=0.00022; if(tProg>1) tProg=0; }
    if(current){ const pt=current.curve.getPointAt(Math.max(0.0001,Math.min(0.999,tProg))); if(pt){ current.travellerGroup.position.copy(pt); current.travellerGroup.position.y+=0.09; } }
    const t=current? tProg:0; const lookX=current? current.curve.getPointAt(t).x*0.58 : 0;
    camera.position.x = isDrag? camera.position.x : lookX*0.35;
    camera.position.y = 5.2 + Math.sin(now*0.00005)*0.22;
    camera.position.z = camBaseZ;
    camera.lookAt(lookX*0.65, 0.2, 0.4);
    renderFocus();
    renderer.render(scene,camera);
  }
  tick();
  return { show, dispose:()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); } };
}
