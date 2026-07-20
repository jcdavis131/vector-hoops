/* drift-void.js v26 — left→right career timeline + player selector + readable quad
   Goals from user:
   - nuke fingerprint references (done)
   - make #2 viz far more legible: paper background, left→right time, Y=role (archetype), Z=MIN load distribution, peer clouds at each season show distribution
   - allow any player search + random
   - keep plain English + AAA
*/
export async function mountDriftVoid(canvas){
  if(!canvas) return;
  let THREE;
  try{ THREE = await import('three'); }catch{ THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js'); }
  const isLowEnd=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||window.innerWidth<560;
  const isMobile=window.innerWidth<720;

  // --- renderer / scene : paper for AAA legibility ---
  const renderer=new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, isLowEnd?1.15:1.45));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(0xFFFEF7,1);
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xFFFEF7);
  scene.fog=new THREE.FogExp2(0xFFFEF7, 0.018);

  const CAM_Z_DEFAULT=16.5, CAM_Z_MIN=5, CAM_Z_MAX=42;
  const camera=new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  camera.position.set(-2, 7.2, 14.8);
  let camBaseZ=CAM_Z_DEFAULT;
  const clampZ=z=>Math.max(CAM_Z_MIN, Math.min(CAM_Z_MAX, z));
  const setZ=z=>{ camBaseZ=clampZ(z); };

  scene.add(new THREE.AmbientLight(0xFFFFFF,0.92));
  const key=new THREE.DirectionalLight(0xFFFFFF,0.88); key.position.set(8,12,6); scene.add(key);

  // paper grid + axes
  const grid=new THREE.GridHelper(44, 22, 0xD8D0C3, 0xEDE6D7); grid.position.y=-3.6; grid.position.x=0; scene.add(grid);
  // X axis (time) line
  {
    const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-18.5,-3.55,0), new THREE.Vector3(18.5,-3.55,0)]);
    const m=new THREE.LineBasicMaterial({ color:0x1A150F, linewidth:2 }); scene.add(new THREE.Line(g,m));
  }

  const CACHE_NAME='vector-hoops-v26-20260720-ltr-search';
  async function cachedFetchJSON(url){
    try{ if('caches' in window){ const c=await caches.open(CACHE_NAME); const hit=await c.match(url); if(hit) return await hit.json(); } }catch{}
    const r=await fetch(url,{cache:'default'});
    try{ if('caches' in window){ const c=await caches.open(CACHE_NAME); c.put(url, r.clone()).catch(()=>{}); } }catch{}
    return r.json();
  }

  let timeData=null, liteData=null, vecData=null, skillsData=null, teamData=null;
  try{
    const [tData, lPos, vData, sData, tmData] = await Promise.all([
      cachedFetchJSON('assets/archetypes_time.json?v=26'),
      cachedFetchJSON('assets/vectors_search_lite_pos.json?v=26').catch(()=>cachedFetchJSON('assets/vectors_search_lite.json?v=26')),
      cachedFetchJSON('assets/vectors.json?v=26').catch(()=>null),
      cachedFetchJSON('assets/skills_wide.json?v=26').catch(()=>null),
      cachedFetchJSON('assets/player_team_season.json?v=26').catch(()=>null)
    ]);
    timeData=tData; liteData=lPos; vecData=vData; skillsData=sData; teamData=tmData;
  }catch(e){ console.warn('drift v26 fetch fail',e); return; }

  const seasons=timeData?.prevalence||[];
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#111111'];
  const shortNames=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const longDesc=["Rim protection + glass","Low volume, high rebounding","Minimal box footprint","Def glass + FT rate","High vol 3P + creation","Efficient 3P spacer","Primary playmaking","High usage scoring"];
  const POS_LABELS=['PG','SG','SF','PF','C'];
  const POS_ICON={ PG:'●', SG:'▲', SF:'◆', PF:'■', C:'✚' };
  const seasonIdx=new Map(seasons.map((s,i)=>[s.season,i]));
  const getX = idx=> (idx/Math.max(1,seasons.length-1))*34 - 17;

  const minutesMap=new Map();
  if(vecData?.players){ for(const p of vecData.players) minutesMap.set(`${p.name}|${p.season}`, { gp:p.gp||0, mpg:p.mpg||0, total_min:p.total_min||0 }); }
  const skillsMap=skillsData?.grades||null;
  const teamMap=teamData||{};
  const getTeam=(name,season)=> teamMap[`${name}|${season}`]||'—';

  const seasonPlayersMap=new Map();
  for(const s of seasons) seasonPlayersMap.set(s.season,[]);
  const tmpPlayers=liteData?.players||liteData||[];
  for(const p of tmpPlayers){ if(!seasonPlayersMap.has(p.s)) seasonPlayersMap.set(p.s,[]); seasonPlayersMap.get(p.s).push(p); }

  // compute mpg range for Z scaling (the inflated load numbers are 0-60 ish)
  let allMpgs=[]; for(const v of minutesMap.values()) if(v.mpg>0) allMpgs.push(v.mpg);
  allMpgs.sort((a,b)=>a-b);
  const mpgP5=allMpgs[Math.floor(allMpgs.length*0.05)]||10, mpgP95=allMpgs[Math.floor(allMpgs.length*0.95)]||52;
  const mpgMin=Math.max(0, mpgP5-2), mpgMax=mpgP95+2;
  const normZ=mpg=>{ const t=(mpg-mpgMin)/Math.max(0.001, mpgMax-mpgMin); return (t*5.5 - 2.75); };

  // --- peer clouds: show distribution at each season slice in Y (role) and Z (load) ---
  const peerGroup=new THREE.Group(); scene.add(peerGroup);
  {
    // build one big points buffer for all league peers (faint)
    const count=tmpPlayers.length;
    const pos=new Float32Array(count*3), col=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      const p=tmpPlayers[i]; const si=seasonIdx.get(p.s); if(si===undefined) continue;
      const m=minutesMap.get(`${p.n}|${p.s}`); const load=m?.mpg|| (10+Math.random()*20);
      const x=getX(si)+(Math.random()-0.5)*0.28;
      const y=(p.c-3.5)*1.95 + (Math.random()-0.5)*0.38;
      const z=normZ(load)+(Math.random()-0.5)*0.22;
      pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
      const c=new THREE.Color(OKABE[p.c%8]); if(c.getHexString()!=='111111') c.lerp(new THREE.Color(0xFFFEF7),0.65); else c.setHex(0x9AA0AC);
      col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
    }
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos,3)); geo.setAttribute('color', new THREE.BufferAttribute(col,3));
    peerGroup.add(new THREE.Points(geo, new THREE.PointsMaterial({ size:isLowEnd?0.06:0.09, vertexColors:true, transparent:true, opacity:0.22, sizeAttenuation:true, depthWrite:false })));
  }

  // byName for search any player
  const byName=new Map(); for(const p of tmpPlayers){ if(!byName.has(p.n)) byName.set(p.n,[]); byName.get(p.n).push(p); } for(const arr of byName.values()) arr.sort((a,b)=> (a.s||'').localeCompare(b.s||''));
  const allNames=[...byName.keys()].sort((a,b)=> byName.get(b).length - byName.get(a).length);
  const CURATED=["LeBron James","Stephen Curry","Kevin Durant","Giannis Antetokounmpo","Nikola Jokic","James Harden","Russell Westbrook","Chris Paul","Kawhi Leonard","Damian Lillard","Luka Doncic","Jayson Tatum","Joel Embiid","Kobe Bryant","Tim Duncan","Dirk Nowitzki","Shaquille O'Neal","Kevin Garnett","Steve Nash","Dwyane Wade","Vince Carter","Anthony Edwards","Victor Wembanyama","Bo Outlaw","Anthony Davis","Devin Booker","Ja Morant","Donovan Mitchell","Gary Payton","Allen Iverson","Tracy McGrady"];
  let curatedPool=CURATED.filter(n=>byName.has(n)&&byName.get(n).length>=3);
  // fill to ensure random has variety
  let pool=[...curatedPool];
  for(const nm of allNames){ if(pool.length>=120) break; if(!pool.includes(nm)&&byName.get(nm).length>=4) pool.push(nm); }

  // DOM restructure for legibility (no overlapping absolute)
  const root=document.getElementById('lemmino-drift');
  root.style.background='#FFFEF7';
  root.style.borderTop='2.5px solid #1A150F';
  root.style.borderBottom='2.5px solid #1A150F';
  root.style.display='flex';
  root.style.flexDirection='column';
  // create header
  let header=document.getElementById('drift-header-v26');
  if(!header){
    header=document.createElement('div'); header.id='drift-header-v26';
    root.prepend(header);
  }
  header.innerHTML=`
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:12px 14px;">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;flex:1 1 420px">
        <span class="small-mono" style="background:#1A150F;color:#FFFEF7;border:2px solid #1A150F;border-radius:999px;padding:7px 12px;font-weight:900;letter-spacing:.06em">Career Arc · Left → Time</span>
        <span class="small-mono" style="opacity:.65">Y = role (archetype) · Z = minutes load · peer dots = distribution</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="position:relative">
          <input id="drift-player-search" placeholder="Search any player — e.g. LeBron James, Wembanyama" autocomplete="off" style="min-width:${isMobile?'62vw':'320px'};width:${isMobile?'62vw':'360px'};max-width:78vw;height:46px;border:2.2px solid #1A150F;border-radius:12px;padding:0 14px 0 36px;font-family:ui-monospace,monospace;font-weight:800;font-size:13px;background:#fff;box-shadow:2px 2px 0 #1A150F;outline:none"/>
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);opacity:.6">🔍</span>
          <div id="drift-search-results" style="position:absolute;left:0;top:52px;width:100%;max-height:320px;overflow:auto;background:#FFFEF7;border:2px solid #1A150F;border-radius:12px;box-shadow:4px 4px 0 #1A150F;display:none;z-index:20"></div>
        </div>
        <button id="drift-random" class="btn" type="button" style="min-height:46px;background:#F0E442">🎲 Random</button>
      </div>
    </div>
    <div id="drift-axis-legend" style="display:flex;gap:10px;flex-wrap:wrap;padding:0 14px 10px;font-family:ui-monospace,monospace;font-size:10px;font-weight:800;opacity:.8">
      <span>⬩ X → seasons 1996 → 2025 (left to right)</span><span>⬩ Y ↑ 8 archetypes • color = role</span><span>⬩ Z depth = MIN load distribution ( ${mpgMin.toFixed(0)} → ${mpgMax.toFixed(0)} inflated scale )</span><span>⬩ outline = past • filled = current</span>
    </div>
  `;

  // canvas wrap
  const existingCanvas=document.getElementById('lemmino-drift-canvas');
  let wrap=document.getElementById('drift-canvas-wrap-v26');
  if(!wrap){
    wrap=document.createElement('div'); wrap.id='drift-canvas-wrap-v26'; wrap.style.cssText='position:relative;width:100%;background:#FFFEF7;display:flex;flex-direction:column;';
    existingCanvas.parentNode.insertBefore(wrap, existingCanvas);
    wrap.appendChild(existingCanvas);
  }
  existingCanvas.style.width='100%';
  existingCanvas.style.height=isMobile?'66vh':'62vh';
  existingCanvas.style.display='block';
  existingCanvas.style.touchAction='none';

  // focus overlay inside wrap (top)
  let focusWrap=document.getElementById('drift-focus-v26');
  if(!focusWrap){
    focusWrap=document.createElement('div'); focusWrap.id='drift-focus-v26';
    focusWrap.style.cssText='position:absolute;left:12px;right:12px;top:10px;z-index:5;pointer-events:none;display:flex;flex-direction:column;gap:6px;max-width:min(920px,92vw)';
    wrap.appendChild(focusWrap);
  }
  focusWrap.innerHTML=`<div id="lemmino-drift-focus"></div><div id="lemmino-drift-meta"></div>`;
  const focusEl=document.getElementById('lemmino-drift-focus');
  const metaEl=document.getElementById('lemmino-drift-meta');

  // controls
  let controls=document.getElementById('drift-controls-v26');
  if(!controls){
    controls=document.createElement('div'); controls.id='drift-controls-v26';
    controls.style.cssText='display:flex;gap:8px;align-items:center;padding:10px 14px;background:#FFFEF7;border-top:1.5px solid #1A150F;flex-wrap:wrap';
    wrap.appendChild(controls);
  }
  controls.innerHTML=`
    <button class="drift-ctrl" id="drift-prev" style="appearance:none;min-width:48px;min-height:44px;border:2px solid #1A150F;border-radius:999px;background:#fff;font-family:ui-monospace,monospace;font-weight:900;cursor:pointer;box-shadow:2px 2px 0 #1A150F">⟵ Prev shift</button>
    <button class="drift-ctrl" id="drift-play" style="appearance:none;min-width:84px;min-height:44px;border:2.2px solid #1A150F;border-radius:999px;background:#FFFEF7;font-family:ui-monospace,monospace;font-weight:900;cursor:pointer;box-shadow:2px 2px 0 #1A150F">▶ Play</button>
    <button class="drift-ctrl" id="drift-next" style="appearance:none;min-width:48px;min-height:44px;border:2px solid #1A150F;border-radius:999px;background:#fff;font-family:ui-monospace,monospace;font-weight:900;cursor:pointer;box-shadow:2px 2px 0 #1A150F">Next shift ⟶</button>
    <div id="drift-scrub" style="flex:1 1 160px;min-width:160px;height:16px;background:rgba(26,21,15,0.08);border-radius:999px;position:relative;overflow:hidden;cursor:pointer;border:1.5px solid #1A150F"><div id="drift-scrub-fill" style="position:absolute;left:0;top:0;bottom:0;width:0%;background:#1A150F;border-radius:999px;transition:width .08s linear"></div></div>
    <span class="small-mono" id="drift-hint-v26" style="opacity:.6">drag timeline · pinch/wheel zoom · outline = past</span>
  `;
  const scrub=document.getElementById('drift-scrub');
  const scrubFill=document.getElementById('drift-scrub-fill');
  const btnPlay=document.getElementById('drift-play');
  const btnNext=document.getElementById('drift-next');
  const btnPrev=document.getElementById('drift-prev');
  const searchInput=document.getElementById('drift-player-search');
  const searchResults=document.getElementById('drift-search-results');
  const randomBtn=document.getElementById('drift-random');

  // timeline horizontal
  let timelineH=document.getElementById('drift-timeline');
  if(!timelineH){ timelineH=document.createElement('div'); timelineH.id='drift-timeline'; root.appendChild(timelineH); }
  timelineH.style.cssText=`display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;padding:10px 14px;background:#FFFEF7;border-top:1.5px solid #1A150F;border-bottom:1.5px solid #1A150F;scrollbar-width:thin`;

  // quad below timeline (not overlay)
  let quadEl=document.getElementById('drift-quad');
  if(!quadEl){ quadEl=document.createElement('div'); quadEl.id='drift-quad'; root.appendChild(quadEl); }
  quadEl.style.cssText=`position:relative;right:auto;top:auto;width:100%;max-width:100%;max-height:none;overflow:visible;z-index:2;background:#12100C;border-top:2px solid #1A150F;border-radius:0;padding:14px;display:flex;flex-direction:column;gap:12px`;

  const styleEl=document.getElementById('drift-v21-style')||document.createElement('style');
  styleEl.id='drift-v21-style';
  styleEl.textContent=`
    #drift-timeline::-webkit-scrollbar{height:6px} #drift-timeline::-webkit-scrollbar-thumb{background:#1A150F;border-radius:999px}
    .drift-tm-chip{border-radius:999px;padding:7px 12px;font-family:ui-monospace,monospace;font-size:11.5px;font-weight:800;letter-spacing:-0.01em;cursor:pointer;transition:all .14s;white-space:nowrap;line-height:1.1;flex:0 0 auto}
    .drift-tm-chip.filled{background:#1A150F;color:#FFFEF7;border:2.2px solid #1A150F;box-shadow:2px 2px 0 #1A150F;transform:translateY(-1px)}
    .drift-tm-chip.outline-past{background:#FFFEF7;color:#1A150F;border:2px dashed #1A150F;opacity:.88}
    .drift-tm-chip.outline-future{background:transparent;color:#5A544D;border:1.5px dashed rgba(26,21,15,0.28);opacity:.5}
    #lemmino-drift-focus{font-family:ui-sans-serif,system-ui;font-weight:900;font-size:${isMobile? '13px':'15px'};line-height:1.22;letter-spacing:-0.01em}
    #lemmino-drift-meta{font-family:ui-monospace,monospace;font-size:10.5px;line-height:1.45}
    /* quad AAA dark card */
    #drift-quad::-webkit-scrollbar{width:5px} #drift-quad::-webkit-scrollbar-thumb{background:#2A241E;border-radius:99px}
    .dq-kicker{font-family:ui-monospace,monospace;font-weight:900;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#9AA0AC;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .dq-title{font-family:ui-sans-serif,system-ui;font-weight:900;font-size:${isMobile? '16px':'19px'};line-height:1.15;letter-spacing:-0.02em;color:#FFFEF7;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    .dq-dot{width:10px;height:10px;border-radius:999px;border:1.5px solid #1A150F;display:inline-block;flex-shrink:0}
    .dq-subtitle{font-family:ui-monospace,monospace;font-size:11px;line-height:1.45;color:#C2C6D0}
    .dq-bigrow{display:flex;gap:12px;align-items:stretch;flex-wrap:wrap}
    .dq-pct{font-family:ui-sans-serif,system-ui;font-weight:900;font-size:32px;line-height:0.95;letter-spacing:-0.03em;padding:10px 14px;border-radius:14px;border:2.2px solid #1A150F;min-width:92px;text-align:center;display:flex;flex-direction:column;justify-content:center}
    .dq-pct.good{background:#B8E6C8;color:#0A1A0F} .dq-pct.bad{background:#FFC8B8;color:#2A0F0A} .dq-pct.mid{background:#FFE8A0;color:#1A150F}
    .dq-pct small{display:block;font-family:ui-monospace,monospace;font-size:10px;font-weight:800;letter-spacing:0.06em;margin-top:4px}
    .dq-pill{border-radius:999px;padding:6px 12px;font-family:ui-monospace,monospace;font-size:11px;font-weight:800;border:1.5px solid #1A150F;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
    .dq-pill.white{background:#FFFEF7;color:#1A150F} .dq-pill.dark{background:#1A150F;color:#FFFEF7;border-color:#FFFEF7}
    .dq-pill.mid{background:#FFE8A0;color:#1A150F} .dq-pill.good{background:#B8E6C8;color:#0A1A0F} .dq-pill.bad{background:#FFC8B8;color:#2A0F0A}
    .dq-grid2{display:grid;grid-template-columns:${isMobile? '1fr':'1fr 1fr'};gap:10px}
    .dq-section{border:1.5px solid #232018;border-radius:12px;padding:12px 12px 10px;background:rgba(255,254,247,0.05);display:flex;flex-direction:column;gap:8px}
    .dq-label{font-family:ui-monospace,monospace;font-size:10px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;color:#E8E0D0;display:flex;justify-content:space-between;align-items:center;gap:8px}
    .dq-numbers{font-family:ui-sans-serif,system-ui;font-weight:800;font-size:13px;color:#FFFEF7;display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}
    .dq-numbers b{font-size:16px}
    .dq-track{height:14px;background:rgba(255,254,247,0.12);border-radius:999px;position:relative;overflow:visible;border:1px solid rgba(255,254,247,0.08)}
    .dq-avg{position:absolute;top:-5px;bottom:-5px;width:0;display:flex;flex-direction:column;align-items:center;pointer-events:none}
    .dq-avg-line{width:2px;height:100%;background:#F0E442;box-shadow:0 0 0 1px rgba(0,0,0,0.6)}
    .dq-avg-lbl{font-family:ui-monospace,monospace;font-size:8px;font-weight:900;color:#F0E442;margin-top:1px;white-space:nowrap;background:#1A150F;padding:1px 4px;border-radius:4px}
    .dq-cur{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:999px;background:#FFFEF7;border:2px solid #1A150F;box-shadow:0 0 0 2px rgba(255,254,247,0.22),0 1px 6px rgba(0,0,0,0.6)}
    .dq-hist-wrap{display:flex;flex-direction:column;gap:6px}
    .dq-hist{display:flex;gap:3px;align-items:end;height:44px}
    .dq-hist-bar{flex:1;border-radius:4px 4px 2px 2px;min-width:3px;transition:all .18s;position:relative}
    .dq-hist-bar.is-cur{background:#FFFEF7 !important;box-shadow:0 0 0 1px #1A150F, 0 0 10px rgba(255,254,247,0.45);outline:1.5px solid #1A150F;z-index:1}
    .dq-hist-axis{display:flex;justify-content:space-between;font-family:ui-monospace,monospace;font-size:9px;color:#8A8E9A;gap:8px}
    .dq-sentence{font-family:ui-sans-serif,system-ui;font-size:${isMobile? '14px':'15px'};line-height:1.55;font-weight:600;color:#FFFEF7;background:rgba(255,254,247,0.07);border-radius:12px;padding:12px 14px;border:1px solid rgba(255,254,247,0.10)}
    .dq-peers{font-family:ui-monospace,monospace;font-size:10.5px;line-height:1.5;color:#C2C6D0;background:rgba(18,16,12,0.6);border-radius:10px;padding:9px 11px;border:1px dashed #2A241E}
    .drift-sresult{padding:9px 12px;cursor:pointer;border-bottom:1px solid rgba(26,21,15,0.08);display:flex;justify-content:space-between;gap:8px;font-family:ui-monospace,monospace;font-size:12px}
    .drift-sresult:hover{background:#1A150F;color:#FFFEF7}
    .drift-sresult small{opacity:.7}
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
  const trailPastGroup=new THREE.Group(); scene.add(trailPastGroup);
  const trailFutureGroup=new THREE.Group(); scene.add(trailFutureGroup);
  const ghostGroup=new THREE.Group(); scene.add(ghostGroup);
  const seasonLabelsGroup=new THREE.Group(); scene.add(seasonLabelsGroup);

  function clearGroup(g){ while(g.children.length){ const c=g.children[0]; g.remove(c); if(c.geometry) c.geometry.dispose(); if(c.material){ if(c.material.map) c.material.map.dispose?.(); c.material.dispose(); } } }

  function makeTextSprite(text, opts={}){
    const canvasEl=document.createElement('canvas'); const ctx=canvasEl.getContext('2d');
    const fontSize=opts.fontSize||48; const pad=18;
    ctx.font=`900 ${fontSize}px ui-monospace,monospace`; const w=ctx.measureText(text).width;
    canvasEl.width=w+pad*2; canvasEl.height=fontSize+pad*2;
    ctx.font=`900 ${fontSize}px ui-monospace,monospace`;
    ctx.fillStyle=opts.bg||'rgba(255,254,247,0.94)'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=6;
    const r=14; const x=0,y=0,h=canvasEl.height,ww=canvasEl.width;
    ctx.beginPath(); ctx.roundRect(x,y,ww,h,r); ctx.fill(); ctx.stroke();
    ctx.fillStyle=opts.color||'#1A150F'; ctx.fillText(text, pad, fontSize+pad/1.2);
    const tex=new THREE.CanvasTexture(canvasEl); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true });
    const sprite=new THREE.Sprite(mat); sprite.scale.set((ww/(fontSize*1.6))* (opts.scale||1), 0.6*(opts.scale||1),1);
    return sprite;
  }

  function buildArc(name){
    const entries=byName.get(name)||[];
    const pts=[], meta=[];
    for(const e of entries){
      const si=seasonIdx.get(e.s); if(si===undefined) continue;
      const km=minutesMap.get(`${e.n}|${e.s}`); const load=km?.mpg|| (mpgMin+(mpgMax-mpgMin)*0.5);
      const x=getX(si);
      const y=(e.c-3.5)*1.95;
      const z=normZ(load);
      pts.push(new THREE.Vector3(x,y,z));
      meta.push({ season:e.s, archeIdx:e.c, arche:shortNames[e.c], desc:longDesc[e.c], share:seasons[si]?.shares[e.c]||0, si, total:seasons[si]?.total||0, p:e.p!==undefined? e.p : (POS_LABELS.indexOf(e.pl||'')>=0? POS_LABELS.indexOf(e.pl): -1), pl:e.pl||POS_LABELS[e.p]||'', name:e.n, team:getTeam(e.n,e.s), mpg:load });
    }
    if(pts.length<2) return null;
    const curve=new THREE.CatmullRomCurve3(pts);
    const baseColor=new THREE.Color(OKABE[meta[Math.floor(meta.length/2)].archeIdx%8]);
    const nodes=new THREE.Group(); const nodeMeshes=[];
    for(let i=0;i<pts.length;i++){
      const isChange=i>0&&meta[i].archeIdx!==meta[i-1].archeIdx;
      const g=new THREE.SphereGeometry(isChange?0.20:0.12,16,16);
      const m=new THREE.MeshStandardMaterial({ color:isChange?0xFFFFFF:baseColor, emissive:baseColor, emissiveIntensity:isChange?0.95:0.38, transparent:true, opacity:0.95 });
      const sph=new THREE.Mesh(g,m); sph.position.copy(pts[i]); sph.userData.seasonIdx=i; sph.userData.isChange=isChange; nodes.add(sph); nodeMeshes.push(sph);
    }
    const changes=[]; for(let i=1;i<meta.length;i++) if(meta[i].archeIdx!==meta[i-1].archeIdx) changes.push({ idx:i, from:meta[i-1], to:meta[i] });
    const ghostGeo=new THREE.BufferGeometry().setFromPoints(pts);
    const ghostLine=new THREE.Line(ghostGeo, new THREE.LineBasicMaterial({ color:0x1A150F, transparent:true, opacity:0.10 }));
    const traveller=new THREE.Mesh(new THREE.SphereGeometry(0.30,20,20), new THREE.MeshStandardMaterial({ color:0xFFFFFF, emissive:baseColor, emissiveIntensity:1.1 }));
    const halo=new THREE.Mesh(new THREE.SphereGeometry(0.52,16,16), new THREE.MeshBasicMaterial({ color:baseColor, transparent:true, opacity:0.22 }));
    const travellerGroup=new THREE.Group(); travellerGroup.add(traveller); travellerGroup.add(halo);
    return { name, pts, meta, curve, nodes, nodeMeshes, traveller, travellerGroup, baseColor, changes, ghostLine };
  }

  let current=null, tProg=0, paused=true, embedPaused=true, used=new Set(), lastSwitch=performance.now(), lastChangeIdx=-1, lastSeasonIdx=-1, autoPauseUntil=0;
  window.addEventListener('vh:pause-maps',()=>{ embedPaused=true; paused=true; if(btnPlay) btnPlay.textContent='▶ Play — left→right'; });
  document.addEventListener('focusin',e=>{ if(e.target&&e.target.id==='drift-player-search'){ embedPaused=true; paused=true; if(btnPlay) btnPlay.textContent='▶ Play'; } });

  function careerStage(idx,total){ const r=idx/Math.max(1,total-1); if(r<0.18) return 'Rookie'; if(r<0.35) return 'Breakout'; if(r<0.62) return 'Prime'; if(r<0.84) return 'Veteran'; return 'Late'; }

  function renderTimelineH(){
    if(!current) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    timelineH.innerHTML='';
    current.meta.forEach((m,i)=>{
      const chip=document.createElement('div');
      chip.className='drift-tm-chip ' + (i===idx? 'filled' : (i<idx? 'outline-past' : 'outline-future'));
      chip.textContent=`${m.season} ${m.team} ${m.arche}${m.pl? ' '+m.pl:''}`;
      chip.title=`${m.season} ${m.team} ${m.arche} • click to jump — X=time left→right`;
      chip.onclick=()=>{ tProg=i/current.meta.length; embedPaused=false; paused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; };
      timelineH.appendChild(chip);
    });
    const curEl=timelineH.children[idx]; if(curEl) curEl.scrollIntoView({ block:'nearest', inline:'center', behavior:'smooth' });
  }

  function renderQuad(m, quad){
    if(!quadEl) return;
    const n=quad.n||0;
    const vals=quad.vals||[];
    const curMpg=quad.curMin?.mpg||m.mpg||0;
    const curGp=quad.curMin?.gp||0;
    const avgMpg=quad.avgMpg||0;
    const avgGp=quad.avgGp||0;
    const pct=Math.round(quad.pct||0);
    const better=curMpg>=avgMpg;
    const deltaMpg=(curMpg-avgMpg);
    const deltaGp=(curGp-avgGp);
    const pctState = pct>=67? 'good' : pct<=33? 'bad' : 'mid';
    const arrow = better? '▲' : '▼';
    const verb = better? 'more' : 'fewer';

    const mpgs=vals.map(v=>v.mpg).filter(v=>v>0);
    const gps=vals.map(v=>v.gp).filter(v=>v>0);
    const minMpg= mpgs.length? Math.min(...mpgs) : avgMpg*0.7;
    const maxMpg= mpgs.length? Math.max(...mpgs) : avgMpg*1.3;
    const minGp= gps.length? Math.min(...gps) : 0;
    const maxGp= gps.length? Math.max(...gps) : 82;
    const padMpg=(maxMpg-minMpg)*0.06||1;
    const padGp=(maxGp-minGp)*0.08||1;
    const rMinMpg=minMpg-padMpg, rMaxMpg=maxMpg+padMpg;
    const rMinGp=Math.max(0,minGp-padGp), rMaxGp=maxGp+padGp;

    const bins=12;
    const hist=Array(bins).fill(0);
    mpgs.forEach(v=>{ const b=Math.min(bins-1, Math.max(0, Math.floor(((v-rMinMpg)/Math.max(0.0001,rMaxMpg-rMinMpg))*bins))); hist[b]++; });
    const maxBin=Math.max(...hist,1);
    const curBin=Math.min(bins-1, Math.max(0, Math.floor(((curMpg-rMinMpg)/Math.max(0.0001,rMaxMpg-rMinMpg))*bins)));
    const avgBin=Math.min(bins-1, Math.max(0, Math.floor(((avgMpg-rMinMpg)/Math.max(0.0001,rMaxMpg-rMinMpg))*bins)));
    const avgPosPct=((avgMpg-rMinMpg)/Math.max(0.0001,rMaxMpg-rMinMpg))*100;
    const curPosPct=((curMpg-rMinMpg)/Math.max(0.0001,rMaxMpg-rMinMpg))*100;

    const closest = [...vals].filter(v=>v.name!==m.name).sort((a,b)=> Math.abs(a.mpg-curMpg)-Math.abs(b.mpg-curMpg)).slice(0,3);

    let sentence='';
    if(n<3){
      sentence=`${m.name} is one of few ${m.pl||'POS'} ${m.arche} in ${m.season} — only ${n} peers that year. Y=role shifts, Z=load distribution shown in the void above.`;
    } else if(pct>=80){
      sentence=`${m.name} played ${curGp} games vs ${avgGp.toFixed(0)} avg and ${verb} load (Z) than ${pct}% of ${m.pl} ${m.arche} peers. Left→right = time; up/down = archetype drift; depth = load distribution.`;
    } else if(pct<=20){
      sentence=`${m.name} played ${curGp} vs ${avgGp.toFixed(0)} avg GP, ${verb} minutes than ${100-pct}% of ${m.pl} ${m.arche} peers (P${pct}). See peer clouds per season in the 3D band.`;
    } else {
      sentence=`${m.name} played ${curGp} vs ${avgGp.toFixed(0)} avg GP, ${verb} load than avg — P${pct} among ${n} ${m.pl} ${m.arche} peers in ${m.season}. Δ ${deltaMpg>=0? '+':''}${deltaMpg.toFixed(1)} vs avg. Use Y=archetype, Z=load.`;
    }

    const archColor=OKABE[m.archeIdx%8]||'#FFFEF7';

    function barHTML(min,max,curAvg,curVal){
      const curP=Math.max(2,Math.min(98, ((curVal-min)/Math.max(0.0001,max-min))*100 ));
      const avgP=Math.max(2,Math.min(98, ((curAvg-min)/Math.max(0.0001,max-min))*100 ));
      return `<div class="dq-track"><div class="dq-avg" style="left:${avgP}%"><div class="dq-avg-line"></div><div class="dq-avg-lbl">▲ avg</div></div><div class="dq-cur" style="left:${curP}%" title="you: ${curVal.toFixed(1)} vs avg ${curAvg.toFixed(1)}"></div></div>`;
    }

    quadEl.innerHTML=`
      <div class="dq-kicker"><span class="dq-dot" style="background:${archColor}"></span> Quad ${m.season} • Team ${m.team} • ${m.pl} ${m.arche} <span style="margin-left:auto;opacity:.7">${n} peers • X=${m.season} position ${Math.round(((getX(m.si)+17)/34)*100)}% across</span></div>
      <div class="dq-title"><span>${POS_ICON[m.pl]||'●'}</span> ${m.pl} <span style="opacity:.5">×</span> <span style="display:inline-flex;align-items:center;gap:6px"><span class="dq-dot" style="background:${archColor}"></span> ${m.arche}</span> <span class="dq-pill white" style="margin-left:6px">X left→right = time</span> <span class="dq-pill dark">Y = role</span> <span class="dq-pill mid">Z = load</span></div>
      <div class="dq-subtitle">Left→right timeline shows career arc. Y distribution = 8 archetypes stacked — your path jumps when role shifts. Z depth = MIN load distribution — peer clouds behind each season slice. Background faint dots = full ${m.season} league.</div>
      <div class="dq-bigrow">
        <div class="dq-pct ${pctState}" title="Percentile vs quad"> <div style="display:flex;align-items:center;justify-content:center;gap:4px">${arrow} P${pct}</div> <small>${pct>=67? '▲ above': pct<=33? '▼ below':'— mid'}</small> </div>
        <div style="display:flex;flex-direction:column;gap:8px;flex:1;min-width:220px">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="dq-pill white" title="Games played">● ${curGp} GP <span style="opacity:.6">vs ${avgGp.toFixed(0)} avg ${deltaGp>=0? '+'+deltaGp.toFixed(0):deltaGp.toFixed(0)}</span></span>
            <span class="dq-pill ${pctState}" title="MIN load — inflated scale but percentile accurate">■ ${curMpg.toFixed(1)} load <span style="opacity:.8">vs ${avgMpg.toFixed(1)} avg ${deltaMpg>=0? '+'+deltaMpg.toFixed(1):deltaMpg.toFixed(1)}</span></span>
            <span class="dq-pill dark">Z depth = ${(normZ(curMpg)).toFixed(2)} • avg ${(normZ(avgMpg)).toFixed(2)}</span>
          </div>
          <div class="dq-subtitle" style="font-size:10px;opacity:.85">MIN load is inflated (52 = 4264/82) — use as relative, not real MPG. Pxx accurate. Z axis in void = normalized load.</div>
        </div>
      </div>
      <div class="dq-grid2">
        <div class="dq-section"><div class="dq-label"><span>Games played — distribution</span><span style="opacity:.7">${minGp.toFixed(0)} → ${maxGp.toFixed(0)} range</span></div><div class="dq-numbers"><b>${curGp}</b> you <span style="opacity:.6">vs</span> <b>${avgGp.toFixed(0)}</b> avg</div>${barHTML(rMinGp,rMaxGp,avgGp,curGp)}<div class="dq-label" style="margin-top:2px"><span>▲ avg ${avgGp.toFixed(0)}</span><span>● you ${curGp}</span></div></div>
        <div class="dq-section"><div class="dq-label"><span>Minutes load distribution (quad) — Z axis</span><span style="opacity:.7" title="inflated scale">${rMinMpg.toFixed(1)} → ${rMaxMpg.toFixed(1)}</span></div><div class="dq-hist-wrap"><div class="dq-hist" title="12-bin histogram, white=you, yellow=avg">${hist.map((h,i)=>{const isCur=i===curBin; const isAvg=i===avgBin; const base=isCur? '#FFFEF7' : isAvg? '#F0E442' : '#3A3E4A'; const hPct=10+(h/maxBin)*36; return `<div class="dq-hist-bar ${isCur? 'is-cur':''}" style="height:${hPct}px;background:${base};opacity:${isCur?1: isAvg?0.9:0.55}" title="bin ${i}: ${h} peers"></div>`}).join('')}</div><div style="position:relative;height:14px;margin-top:2px;background:rgba(255,254,247,0.08);border-radius:999px;border:1px solid rgba(255,254,247,0.06)"><div class="dq-avg" style="left:${avgPosPct}%"><div class="dq-avg-line" style="height:14px"></div></div><div class="dq-cur" style="left:${curPosPct}%"></div></div><div class="dq-hist-axis"><span>▲ avg ${avgMpg.toFixed(1)}</span><span style="opacity:.7">12 bins • ${n} peers • Z shows same</span><span>● you ${curMpg.toFixed(1)}</span></div></div></div>
      </div>
      ${closest.length? `<div class="dq-peers"><div style="font-weight:900;color:#E8E0D0;margin-bottom:4px">Closest peers in load — same X slice (Z proximity) ▲■</div>${closest.map(p=>`● ${p.name} — ${p.mpg.toFixed(1)} load, ${p.gp} GP (Δ ${(p.mpg-curMpg).toFixed(1)})`).join('<br>')}</div>`:''}
      <div class="dq-sentence">${sentence}<br><span style="opacity:.8;font-weight:400;font-size:12.5px">${m.desc}. Outline chips = past seasons left of current, filled = current season at ${m.season}. White trail = full left→right career line through peer clouds. Drag to rotate, pinch/wheel to zoom. X grows left→right, Y is role, Z is load.</span></div>
    `;
  }

  function updateTrails(){
    if(!current) return;
    clearGroup(trailPastGroup); clearGroup(trailFutureGroup); clearGroup(ghostGroup); clearGroup(seasonLabelsGroup);
    ghostGroup.add(current.ghostLine);
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    for(let i=0;i<current.nodeMeshes.length;i++){
      const mesh=current.nodeMeshes[i]; const mat=mesh.material;
      if(i===idx){ mat.wireframe=false; mat.color.set(current.baseColor); mat.emissive.set(current.baseColor); mat.emissiveIntensity=1.0; mat.opacity=1; mesh.scale.set(2.0,2.0,2.0); }
      else if(i<idx){ mat.wireframe=false; mat.color.set(0x9AA0AC); mat.emissive.set(0x000000); mat.opacity=i===idx-1? 0.65:0.35; mesh.scale.set(1.1,1.1,1.1); }
      else { mat.wireframe=false; mat.color.set(0xB8B8B8); mat.opacity=0.18; mesh.scale.set(0.9,0.9,0.9); }
    }
    if(idx>0){
      const pastPts=current.pts.slice(0, idx+1);
      if(pastPts.length>=2){
        const pastCurve=new THREE.CatmullRomCurve3(pastPts);
        const tube=new THREE.TubeGeometry(pastCurve, Math.max(pastPts.length*8,48), 0.09, 8, false);
        trailPastGroup.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color:0x1A150F, transparent:true, opacity:0.18 })));
      }
    }
    if(idx < current.meta.length-1){
      const futPts=current.pts.slice(idx);
      if(futPts.length>=2){
        const fGeo=new THREE.BufferGeometry().setFromPoints(futPts);
        const fMat=new THREE.LineDashedMaterial({ color:current.baseColor, transparent:true, opacity:0.22, dashSize:0.18, gapSize:0.16 });
        const l=new THREE.Line(fGeo, fMat); l.computeLineDistances(); trailFutureGroup.add(l);
      }
    }
    // season labels along X axis
    for(let s=0;s<seasons.length;s+= s<15?3:2){
      if(s%2!==0 && isMobile) continue;
      const sp=makeTextSprite(seasons[s].season.replace('-','-'), { fontSize:34, scale:0.9, bg:'#FFFEF7' });
      sp.position.set(getX(s), -3.55-0.6, 0);
      seasonLabelsGroup.add(sp);
    }
    // archetype Y labels
    for(let a=0;a<8;a++){
      const sp=makeTextSprite(shortNames[a], { fontSize:28, scale:0.7, bg:'rgba(255,254,247,0.88)', color:OKABE[a] });
      sp.position.set(-18.8, (a-3.5)*1.95, 0);
      seasonLabelsGroup.add(sp);
    }
  }

  function renderFocus(){
    if(!current||!focusEl) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const m=current.meta[idx];
    const first=current.meta[0], last=current.meta[current.meta.length-1], total=current.meta.length;
    const stage=careerStage(idx,total);

    if(renderFocus._lastIdx!==idx){ renderFocus._lastIdx=idx; updateTrails(); renderTimelineH(); }

    const delta=((m.share-first.share)*100).toFixed(1); const sign=parseFloat(delta)>=0?'+':'';
    const change=current.changes.find(c=>c.idx===idx);
    const progress=`${idx+1}/${total}`;
    const quad=computeQuadStats(m, current.name);
    const nextChange=current.changes.find(c=>c.idx>idx);
    const nextHint=nextChange? `→ next ${nextChange.to.season} ${nextChange.to.arche}` : `→ final ${last.season}`;
    const xPct=Math.round(((getX(m.si)+17)/34)*100);

    if(change && lastChangeIdx!==idx){
      lastChangeIdx=idx; autoPauseUntil=performance.now()+2400;
      focusEl.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span style="background:#F0E442;border:2.2px solid #1A150F;padding:5px 12px;border-radius:999px;font-weight:900;color:#1A150F">SHIFT ${progress} ${stage} — left→right X=${xPct}%</span><span style="background:#FFFEF7;border:2px solid #1A150F;padding:5px 12px;border-radius:999px;font-weight:800;color:#1A150F;box-shadow:2px 2px 0 #1A150F">${current.name} • ${m.team} ${m.season} • X time • Y ${m.arche} • Z load P${Math.round(quad.pct)}</span><span style="background:#1A150F;color:#FFFEF7;border:2px solid #FFFEF7;padding:5px 12px;border-radius:999px">Y role → Z depth</span></div><div style="margin-top:6px;font-size:${isMobile? '11px':'12px'};font-family:ui-monospace,monospace;color:#1A150F;background:rgba(255,254,247,0.96);border:2px solid #1A150F;border-radius:10px;padding:6px 10px;display:inline-block;box-shadow:2px 2px 0 #1A150F">LEAGUE ${ (m.share*100).toFixed(1)}% (${sign}${delta}pp) • X=${xPct}% left→right • Y=${m.arche} • ${m.team} ${m.season}: ${quad.curMin?.mpg?.toFixed(1)||'—'} load vs ${quad.avgMpg.toFixed(1)} avg • ${nextHint} • Z distribution shown as depth</div>`;
    } else {
      focusEl.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span style="background:#FFFEF7;border:2.2px solid #1A150F;padding:6px 14px;border-radius:999px;font-weight:900;color:#1A150F;box-shadow:2px 2px 0 #1A150F">${current.name} [${progress} ${stage}] • X ${xPct}% → time</span><span style="background:#1A150F;color:#FFFEF7;border:2px solid #FFFEF7;padding:6px 14px;border-radius:999px"> ${m.season} ${m.team} • Y ${m.arche} • Z load P${Math.round(quad.pct)} • ${m.pl}</span></div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><span class="dq-pill white">LEAGUE ${(m.share*100).toFixed(1)}% (${sign}${delta}pp) • X time left→right</span><span class="dq-pill ${quad.pct>=67? 'good':quad.pct<=33? 'bad':'mid'}">${quad.curMin?.mpg?.toFixed(1)||'—'} load Z vs ${quad.avgMpg.toFixed(1)} avg • Y role</span><span class="dq-pill dark">→ ${nextHint}</span></div>`;
    }

    if(metaEl){
      const lastShift=current.changes.length? `last shift ${current.changes[current.changes.length-1].to.season} ${current.changes[current.changes.length-1].from.arche}→${current.changes[current.changes.length-1].to.arche}` : 'no shift';
      let skillTxt=''; if(skillsMap){ const sk=skillsMap[`${current.name}|${m.season}`]; if(sk){ const top=Object.entries(sk).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([k,v])=>`${k} ${v}`).join(' • '); skillTxt=` • skills ${top}`; } }
      metaEl.innerHTML=`<span style="font-family:ui-monospace,monospace;font-size:11px;background:#1A150F;color:#FFFEF7;border:1.5px solid #1A150F;padding:7px 10px;border-radius:10px;display:inline-block;max-width:88vw;box-shadow:2px 2px 0 #1A150F">X left→right time ${total} seasons • Y role = archetype distribution • Z depth = load distribution • ${lastShift} • ${quad.curMin?.gp||'—'} GP vs ${quad.avgGp.toFixed(0)} avg • ${m.desc}${skillTxt} • peer clouds = distribution per season X slice in Y/Z</span>`;
    }

    renderQuad(m, quad);
    if(scrubFill) scrubFill.style.width=`${(tProg*100).toFixed(1)}%`;
  }
  renderFocus._lastIdx=-1;

  function show(name){
    clearGroup(playerGroup); clearGroup(trailPastGroup); clearGroup(trailFutureGroup); clearGroup(ghostGroup);
    renderFocus._lastIdx=-1; lastSeasonIdx=-1;
    const arc=buildArc(name); if(!arc){ const n=pool.find(x=>x!==name)||allNames[0]; if(n) return show(n); return; }
    playerGroup.add(arc.nodes); playerGroup.add(arc.travellerGroup); ghostGroup.add(arc.ghostLine);
    current=arc; tProg=0; lastSwitch=performance.now(); lastChangeIdx=-1; used.add(name);
    if(searchInput) searchInput.value=name;
    updateTrails(); renderTimelineH(); renderFocus();
    try{ renderer.render(scene,camera);}catch{}
  }

  // search autocomplete
  function renderSearchResults(q){
    if(!q||q.length<1){ searchResults.style.display='none'; return; }
    const lower=q.toLowerCase();
    const matches=allNames.filter(n=> n.toLowerCase().includes(lower)).slice(0,12).map(n=>{
      const len=byName.get(n)?.length||0; return { n, len };
    }).sort((a,b)=>{ const am=a.n.toLowerCase().startsWith(lower)?1:0, bm=b.n.toLowerCase().startsWith(lower)?1:0; if(am!==bm) return bm-am; return b.len-a.len; });
    if(!matches.length){ searchResults.innerHTML=`<div class="drift-sresult" style="opacity:.6">No match for "${q}"</div>`; searchResults.style.display='block'; return; }
    searchResults.innerHTML=matches.map(m=>`<div class="drift-sresult" data-name="${m.n.replace(/"/g,'&quot;')}"><span>${m.n}</span><small>${m.len} seasons</small></div>`).join('');
    searchResults.style.display='block';
    [...searchResults.querySelectorAll('.drift-sresult')].forEach(el=>{
      el.addEventListener('click',()=>{ const name=el.getAttribute('data-name'); searchResults.style.display='none'; if(name) show(name); });
    });
  }
  if(searchInput){
    searchInput.addEventListener('input', e=> renderSearchResults(e.target.value.trim()));
    searchInput.addEventListener('focus', e=> renderSearchResults(e.target.value.trim()));
    searchInput.addEventListener('keydown', e=>{
      if(e.key==='Enter'){
        const q=e.target.value.trim(); if(!q) return;
        const exact= allNames.find(n=> n.toLowerCase()===q.toLowerCase()) || allNames.find(n=> n.toLowerCase().includes(q.toLowerCase()));
        if(exact){ searchResults.style.display='none'; show(exact); }
      }
      if(e.key==='Escape'){ searchResults.style.display='none'; }
    });
    document.addEventListener('click', e=>{ if(!searchInput.contains(e.target)&&!searchResults.contains(e.target)) searchResults.style.display='none'; });
  }

  if(randomBtn){
    randomBtn.addEventListener('click',()=>{
      // pick any with >=3 seasons, not in recent used if possible
      let cands=allNames.filter(n=> !used.has(n) && (byName.get(n)?.length||0)>=3);
      if(cands.length<20){ used.clear(); cands=allNames.filter(n=> (byName.get(n)?.length||0)>=3); }
      const pick=cands[Math.floor(Math.random()*cands.length)]||pool[Math.floor(Math.random()*pool.length)];
      show(pick);
    });
  }

  // initial player: from curated or URL param? Use random curated
  show(pool[Math.floor(Math.random()*pool.length)]||allNames[0]||'Gary Payton');
  setTimeout(()=>{ try{ renderer.render(scene,camera);}catch{} },180);
  setTimeout(()=>{ try{ renderer.render(scene,camera);}catch{} },600);

  if(scrub){
    let dragging=false;
    const setFromX=x=>{ const r=scrub.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(x-r.left)/r.width)); tProg=p; renderFocus(); if(current){ const pt=current.curve.getPointAt(Math.max(0.0001,Math.min(0.999,tProg))); if(pt){ current.travellerGroup.position.copy(pt); current.travellerGroup.position.y+=0.08; } } };
    scrub.addEventListener('pointerdown',e=>{ dragging=true; try{scrub.setPointerCapture(e.pointerId);}catch{} setFromX(e.clientX); paused=true; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; });
    scrub.addEventListener('pointermove',e=>{ if(dragging) setFromX(e.clientX); });
    scrub.addEventListener('pointerup',()=>{ dragging=false; });
    scrub.addEventListener('click',e=> setFromX(e.clientX));
  }
  if(btnPlay){ btnPlay.textContent='▶ Play — left→right'; btnPlay.addEventListener('click',()=>{ if(paused||embedPaused){ paused=false; embedPaused=false; btnPlay.textContent='❚❚ Pause'; } else { paused=true; embedPaused=true; btnPlay.textContent='▶ Play — left→right'; } }); }
  if(btnNext) btnNext.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx+1;j<current.meta.length;j++) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; renderFocus(); const pt=current.curve.getPointAt(tProg); if(pt) current.travellerGroup.position.copy(pt); return; } tProg=1; renderFocus(); });
  if(btnPrev) btnPrev.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx-1;j>=1;j--) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; renderFocus(); const pt=current.curve.getPointAt(tProg); if(pt) current.travellerGroup.position.copy(pt); return; } tProg=0; renderFocus(); });

  function onWheel(e){ e.preventDefault(); setZ(camBaseZ + Math.sign(e.deltaY)*0.7 + e.deltaY*0.004); } canvas.addEventListener('wheel', onWheel, {passive:false});
  let pinchStartDist=0, pinchStartZ=CAM_Z_DEFAULT; const distTouches=t=>{ const a=t[0],b=t[1]; return Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY); };
  canvas.addEventListener('touchstart', e=>{ if(e.touches?.length===2){ pinchStartDist=distTouches(e.touches); pinchStartZ=camBaseZ; } }, {passive:true});
  canvas.addEventListener('touchmove', e=>{ if(e.touches?.length===2){ e.preventDefault(); const d=distTouches(e.touches); const ratio=pinchStartDist/(d||1); setZ(pinchStartZ * ratio); } }, {passive:false});

  function onResize(){ const w=canvas.clientWidth,h=canvas.clientHeight; if(w<10||h<10) return; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); } const ro=new ResizeObserver(onResize); ro.observe(canvas); onResize();
  let visible=true; const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; },{threshold:0.02}); io.observe(canvas);

  // orbiting camera slightly to reveal depth but mostly side view left→right
  function tick(){
    requestAnimationFrame(tick); if(embedPaused) return; if(!visible) return;
    const now=performance.now();
    if(!paused && now>autoPauseUntil){ tProg+=0.00026; if(tProg>1) tProg=0; }
    if(current){ const pt=current.curve.getPointAt(Math.max(0.0001,Math.min(0.999,tProg))); if(pt){ current.travellerGroup.position.copy(pt); current.travellerGroup.position.y+=0.09; } }
    const t=current? tProg:0;
    const lookX=current? current.curve.getPointAt(t).x*0.78 : 0;
    // keep camera looking along X left→right, Y slightly up
    camera.position.x=lookX + Math.sin(now*0.00007)*0.6;
    camera.position.y=7.0 + Math.sin(now*0.00006)*0.28;
    camera.position.z=camBaseZ + Math.cos(now*0.00005)*0.8;
    camera.lookAt(lookX, -0.4, 0.2);
    renderFocus();
    if(now-lastSwitch>48000&&!paused){
      const nxt=allNames.filter(n=>!used.has(n)&& (byName.get(n)?.length||0)>=3)[Math.floor(Math.random()*20)] || pool[Math.floor(Math.random()*pool.length)];
      if(nxt) show(nxt); lastSwitch=now;
    }
    renderer.render(scene,camera);
  }
  tick();
  return { getFocused(){ if(!current) return null; const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1); return current.meta[idx]; }, show, dispose:()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); } };
}
