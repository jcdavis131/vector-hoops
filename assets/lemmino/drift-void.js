/* drift-void.js v24 — AAA readable quad panel
   - Left timeline outline past / filled current / faint future
   - Right quad card: Pxx big badge, GP + MIN load bars with ▲ avg ● you, 12-bin histogram, plain English, closest peers
   - Team from player_team_season.json, minutes inflated → label MIN load with tooltip, percentile stays accurate
   - Keep zoom-out 38, pinch/wheel, seasonCloud, ghost trail
*/
export async function mountDriftVoid(canvas){
  if(!canvas) return;
  let THREE;
  try{ THREE = await import('three'); }catch{ THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js'); }
  const isLowEnd=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||window.innerWidth<560;
  const isMobile=window.innerWidth<720;

  const renderer=new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, isLowEnd?1.15:1.45));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(0x080A0F,1);
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x080A0F);
  scene.fog=new THREE.FogExp2(0x080A0F, 0.012);

  const CAM_Z_DEFAULT=38, CAM_Z_MIN=14, CAM_Z_MAX=72;
  const camera=new THREE.PerspectiveCamera(44, 1, 0.1, 340);
  camera.position.set(0,4.6,CAM_Z_DEFAULT);
  let camBaseZ=CAM_Z_DEFAULT;
  const clampZ=z=>Math.max(CAM_Z_MIN, Math.min(CAM_Z_MAX, z));
  const setZ=z=>{ camBaseZ=clampZ(z); };

  scene.add(new THREE.AmbientLight(0xFFFFFF,0.82));
  const key=new THREE.DirectionalLight(0xFFE8C8,0.95); key.position.set(6,9,5); scene.add(key);
  const fill=new THREE.DirectionalLight(0xA8C4FF,0.35); fill.position.set(-5,3,-3); scene.add(fill);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(300,300), new THREE.MeshStandardMaterial({ color:0x0C0E14, roughness:0.96 }));
  ground.rotation.x=-Math.PI/2; ground.position.y=-3.0; scene.add(ground);

  const CACHE_NAME='vector-hoops-v24-20260720-quad';
  async function cachedFetchJSON(url){
    try{ if('caches' in window){ const c=await caches.open(CACHE_NAME); const hit=await c.match(url); if(hit) return await hit.json(); } }catch{}
    const r=await fetch(url,{cache:'default'});
    try{ if('caches' in window){ const c=await caches.open(CACHE_NAME); c.put(url, r.clone()).catch(()=>{}); } }catch{}
    return r.json();
  }

  let timeData=null, liteData=null, vecData=null, skillsData=null, teamData=null;
  try{
    const [tData, lPos, vData, sData, tmData] = await Promise.all([
      cachedFetchJSON('assets/archetypes_time.json?v=24'),
      cachedFetchJSON('assets/vectors_search_lite_pos.json?v=24').catch(()=>cachedFetchJSON('assets/vectors_search_lite.json?v=24')),
      cachedFetchJSON('assets/vectors.json?v=24').catch(()=>null),
      cachedFetchJSON('assets/skills_wide.json?v=24').catch(()=>null),
      cachedFetchJSON('assets/player_team_season.json?v=24').catch(()=>null)
    ]);
    timeData=tData; liteData=lPos; vecData=vData; skillsData=sData; teamData=tmData;
  }catch(e){ console.warn('drift v24 fetch fail',e); return; }

  const seasons=timeData?.prevalence||[];
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#FFFEF7'];
  const shortNames=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const longDesc=["Rim protection + glass","Low volume, high rebounding","Minimal box footprint","Def glass + FT rate","High vol 3P + creation","Efficient 3P spacer","Primary playmaking","High usage scoring"];
  const POS_LABELS=['PG','SG','SF','PF','C'];
  const POS_ICON={ PG:'⬤', SG:'▲', SF:'⬥', PF:'■', C:'✚' };
  const getZ=idx=>(idx/Math.max(1,seasons.length-1))*44 - 22;
  const seasonIdx=new Map(seasons.map((s,i)=>[s.season,i]));

  const minutesMap=new Map();
  if(vecData?.players){ for(const p of vecData.players) minutesMap.set(`${p.name}|${p.season}`, { gp:p.gp||0, mpg:p.mpg||0, total_min:p.total_min||0 }); }
  const skillsMap=skillsData?.grades||null;
  const teamMap=teamData||{};
  const getTeam=(name,season)=> teamMap[`${name}|${season}`]||'—';

  const seasonPlayersMap=new Map();
  for(const s of seasons) seasonPlayersMap.set(s.season,[]);
  const tmpPlayers=liteData?.players||liteData||[];
  for(const p of tmpPlayers){ if(!seasonPlayersMap.has(p.s)) seasonPlayersMap.set(p.s,[]); seasonPlayersMap.get(p.s).push(p); }

  // league faint background
  const leagueGroup=new THREE.Group(); scene.add(leagueGroup);
  {
    const count=tmpPlayers.length;
    const pos=new Float32Array(count*3), col=new Float32Array(count*3);
    for(let i=0;i<count;i++){ const p=tmpPlayers[i]; const si=seasonIdx.get(p.s); if(si===undefined) continue; const share=seasons[si]?.shares[p.c]||0; pos[i*3]=(p.c-3.5)*1.20 + (Math.random()-0.5)*0.44; pos[i*3+1]=-2.1+share*5.6 + Math.random()*0.5; pos[i*3+2]=getZ(si)+(Math.random()-0.5)*0.22; const c=new THREE.Color(OKABE[p.c%8]); c.lerp(new THREE.Color(0x151821),0.72); col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b; }
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos,3)); geo.setAttribute('color', new THREE.BufferAttribute(col,3));
    leagueGroup.add(new THREE.Points(geo, new THREE.PointsMaterial({ size:isLowEnd?0.05:0.07, vertexColors:true, transparent:true, opacity:0.14, sizeAttenuation:true, depthWrite:false })));
  }

  const seasonCloudGroup=new THREE.Group(); scene.add(seasonCloudGroup);
  let seasonCloudGeo=new THREE.BufferGeometry();
  const seasonCloudMat=new THREE.PointsMaterial({ size: isMobile?0.18:0.22, vertexColors:true, transparent:true, opacity:0.92, sizeAttenuation:true, depthWrite:false });
  seasonCloudGroup.add(new THREE.Points(seasonCloudGeo, seasonCloudMat));
  function updateSeasonCloud(seasonStr, highlightName){
    const list=(seasonPlayersMap.get(seasonStr)||[]).filter(p=>p.n!==highlightName);
    const pos=new Float32Array(list.length*3), col=new Float32Array(list.length*3);
    for(let i=0;i<list.length;i++){ const p=list[i]; const si=seasonIdx.get(p.s); if(si===undefined) continue; const share=seasons[si]?.shares[p.c]||0; pos[i*3]=(p.c-3.5)*1.20 + (Math.random()-0.5)*0.12; pos[i*3+1]=-2.1+share*5.6 + Math.random()*0.18; pos[i*3+2]=getZ(si)+(Math.random()-0.5)*0.08; const c=new THREE.Color(OKABE[p.c%8]); c.lerp(new THREE.Color(0xFFFFFF),0.15); col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b; }
    seasonCloudGeo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    seasonCloudGeo.setAttribute('color', new THREE.BufferAttribute(col,3));
    seasonCloudGeo.computeBoundingSphere();
  }

  // ribbons
  const ribbonGroup=new THREE.Group(); scene.add(ribbonGroup);
  for(let a=0;a<8;a++){ const pts=[]; for(let s=0;s<seasons.length;s++) pts.push(new THREE.Vector3((a-3.5)*1.20, -2.1+(seasons[s].shares[a]||0)*5.6, getZ(s))); const curve=new THREE.CatmullRomCurve3(pts); const geo=new THREE.TubeGeometry(curve, seasons.length*2, isLowEnd?0.022:0.03, 6, false); const col=new THREE.Color(OKABE[a]); col.lerp(new THREE.Color(0x12141A),0.74); ribbonGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.075, depthWrite:false }))); }

  const byName=new Map(); for(const p of tmpPlayers){ if(!byName.has(p.n)) byName.set(p.n,[]); byName.get(p.n).push(p); } for(const arr of byName.values()) arr.sort((a,b)=> (a.s||'').localeCompare(b.s||''));
  const CURATED=["LeBron James","Stephen Curry","Kevin Durant","Giannis Antetokounmpo","Nikola Jokic","James Harden","Russell Westbrook","Chris Paul","Kawhi Leonard","Damian Lillard","Luka Doncic","Jayson Tatum","Joel Embiid","Kobe Bryant","Tim Duncan","Dirk Nowitzki","Shaquille O'Neal","Kevin Garnett","Steve Nash","Dwyane Wade","Vince Carter","Anthony Edwards","Victor Wembanyama","Bo Outlaw","Anthony Davis","Devin Booker","Ja Morant","Donovan Mitchell","Gary Payton","Allen Iverson","Tracy McGrady"];
  let pool=CURATED.filter(n=>byName.has(n)&&byName.get(n).length>=3); while(pool.length<45){ for(const [nm,arr] of byName.entries()) if(arr.length>=8&&!pool.includes(nm)) pool.push(nm); if(pool.length>=60) break; }

  const playerGroup=new THREE.Group(); scene.add(playerGroup);
  const trailPastGroup=new THREE.Group(); scene.add(trailPastGroup);
  const trailFutureGroup=new THREE.Group(); scene.add(trailFutureGroup);
  const ghostGroup=new THREE.Group(); scene.add(ghostGroup);

  function clearGroup(g){ while(g.children.length){ const c=g.children[0]; g.remove(c); if(c.geometry) c.geometry.dispose(); if(c.material){ if(c.material.map) c.material.map.dispose?.(); c.material.dispose(); } } }

  function buildArc(name){
    const entries=byName.get(name)||[];
    const pts=[], meta=[];
    for(const e of entries){
      const si=seasonIdx.get(e.s); if(si===undefined) continue;
      const share=seasons[si]?.shares[e.c]||0;
      const pIdx=e.p!==undefined? e.p : (POS_LABELS.indexOf(e.pl||'')>=0? POS_LABELS.indexOf(e.pl): -1);
      pts.push(new THREE.Vector3((e.c-3.5)*1.20, -2.1+share*5.6+1.05, getZ(si)));
      meta.push({ season:e.s, archeIdx:e.c, arche:shortNames[e.c], desc:longDesc[e.c], share, si, total:seasons[si]?.total||0, p:pIdx, pl:e.pl||POS_LABELS[pIdx]||'', name:e.n, team:getTeam(e.n,e.s) });
    }
    if(pts.length<2) return null;
    const curve=new THREE.CatmullRomCurve3(pts);
    const baseColor=new THREE.Color(OKABE[meta[Math.floor(meta.length/2)].archeIdx%8]);
    const nodes=new THREE.Group(); const nodeMeshes=[];
    for(let i=0;i<pts.length;i++){
      const isChange=i>0&&meta[i].archeIdx!==meta[i-1].archeIdx;
      const g=new THREE.SphereGeometry(isChange?0.19:0.11,16,16);
      const m=new THREE.MeshStandardMaterial({ color:isChange?0xFFFFFF:baseColor, emissive:baseColor, emissiveIntensity:isChange?0.95:0.32, transparent:true, opacity:0.9 });
      const sph=new THREE.Mesh(g,m); sph.position.copy(pts[i]); sph.userData.seasonIdx=i; sph.userData.isChange=isChange; nodes.add(sph); nodeMeshes.push(sph);
    }
    const changes=[]; for(let i=1;i<meta.length;i++) if(meta[i].archeIdx!==meta[i-1].archeIdx) changes.push({ idx:i, from:meta[i-1], to:meta[i] });
    const ghostGeo=new THREE.BufferGeometry().setFromPoints(pts);
    const ghostLine=new THREE.Line(ghostGeo, new THREE.LineBasicMaterial({ color:0xFFFFFF, transparent:true, opacity:0.06 }));
    const traveller=new THREE.Mesh(new THREE.SphereGeometry(0.28,20,20), new THREE.MeshStandardMaterial({ color:0xFFFFFF, emissive:baseColor, emissiveIntensity:1.2 }));
    const halo=new THREE.Mesh(new THREE.SphereGeometry(0.48,16,16), new THREE.MeshBasicMaterial({ color:baseColor, transparent:true, opacity:0.20 }));
    const travellerGroup=new THREE.Group(); travellerGroup.add(traveller); travellerGroup.add(halo);
    return { name, pts, meta, curve, nodes, nodeMeshes, traveller, travellerGroup, baseColor, changes, ghostLine };
  }

  // DOM panels
  const root=document.getElementById('lemmino-drift');
  const focusEl=document.getElementById('lemmino-drift-focus');
  const metaEl=document.getElementById('lemmino-drift-meta');
  const scrub=document.getElementById('drift-scrub');
  const scrubFill=document.getElementById('drift-scrub-fill');
  const btnPlay=document.getElementById('drift-play');
  const btnNext=document.getElementById('drift-next');
  const btnPrev=document.getElementById('drift-prev');

  let timelineEl=document.getElementById('drift-timeline');
  if(!timelineEl){ timelineEl=document.createElement('div'); timelineEl.id='drift-timeline'; root.appendChild(timelineEl); }
  timelineEl.style.cssText=`position:absolute;left:10px;top:84px;bottom:88px;width:${isMobile? '112px':'168px'};z-index:6;display:flex;flex-direction:column;gap:6px;overflow-y:auto;overflow-x:hidden;padding:6px 4px 10px 0;scrollbar-width:thin;`;

  let quadEl=document.getElementById('drift-quad');
  if(!quadEl){ quadEl=document.createElement('div'); quadEl.id='drift-quad'; root.appendChild(quadEl); }
  quadEl.style.cssText=`position:absolute;right:${isMobile? '10px':'14px'};top:84px;width:${isMobile? 'calc(100vw - 132px)':'380px'};max-width:${isMobile? '62vw':'400px'};max-height:${isMobile? '62vh':'72vh'};overflow-y:auto;overflow-x:hidden;z-index:6;background:#12100C;border:2px solid #1A150F;border-radius:16px;padding:14px 14px 12px;box-shadow:6px 6px 0 #1A150F;display:flex;flex-direction:column;gap:12px;`;

  const styleEl=document.getElementById('drift-v21-style')||document.createElement('style');
  styleEl.id='drift-v21-style';
  styleEl.textContent=`
    #drift-timeline::-webkit-scrollbar{width:4px} #drift-timeline::-webkit-scrollbar-thumb{background:#2A241E;border-radius:99px}
    .drift-tm-chip{border-radius:999px;padding:6px 10px;font-family:ui-monospace,monospace;font-size:${isMobile? '10px':'11.5px'};font-weight:800;letter-spacing:-0.01em;cursor:pointer;transition:all .14s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.1}
    .drift-tm-chip.filled{background:#FFFEF7;color:#1A150F;border:2px solid #1A150F;box-shadow:2px 2px 0 #1A150F;transform:scale(1.04)}
    .drift-tm-chip.outline-past{background:rgba(12,14,20,0.78);color:#9AA0AC;border:2px dashed #4A4E58;opacity:.92}
    .drift-tm-chip.outline-future{background:transparent;color:#5A5E6A;border:1.5px dashed rgba(90,94,106,0.45);opacity:.48}
    #lemmino-drift-focus{font-family:ui-sans-serif,system-ui;font-weight:900;font-size:${isMobile? '13px':'15px'};line-height:1.22;letter-spacing:-0.01em}
    #lemmino-drift-meta{font-family:ui-monospace,monospace;font-size:10.5px;line-height:1.45}
    /* v24 quad AAA */
    #drift-quad::-webkit-scrollbar{width:5px} #drift-quad::-webkit-scrollbar-thumb{background:#2A241E;border-radius:99px}
    .dq-kicker{font-family:ui-monospace,monospace;font-weight:900;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#9AA0AC;display:flex;align-items:center;gap:6px}
    .dq-title{font-family:ui-sans-serif,system-ui;font-weight:900;font-size:${isMobile? '15px':'18px'};line-height:1.15;letter-spacing:-0.02em;color:#FFFEF7;display:flex;flex-wrap:wrap;align-items:center;gap:6px}
    .dq-dot{width:10px;height:10px;border-radius:999px;border:1.5px solid #1A150F;display:inline-block;flex-shrink:0}
    .dq-subtitle{font-family:ui-monospace,monospace;font-size:11px;line-height:1.4;color:#C2C6D0}
    .dq-bigrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .dq-pct{font-family:ui-sans-serif,system-ui;font-weight:900;font-size:32px;line-height:0.95;letter-spacing:-0.03em;padding:8px 12px;border-radius:12px;border:2px solid #1A150F;min-width:86px;text-align:center}
    .dq-pct.good{background:#B8E6C8;color:#0A1A0F} .dq-pct.bad{background:#FFC8B8;color:#2A0F0A} .dq-pct.mid{background:#FFE8A0;color:#1A150F}
    .dq-pct small{display:block;font-family:ui-monospace,monospace;font-size:10px;font-weight:800;letter-spacing:0.06em;margin-top:2px}
    .dq-pill{border-radius:999px;padding:5px 10px;font-family:ui-monospace,monospace;font-size:11px;font-weight:800;border:1.5px solid #1A150F;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
    .dq-pill.white{background:#FFFEF7;color:#1A150F} .dq-pill.dark{background:#1A150F;color:#FFFEF7;border-color:#FFFEF7}
    .dq-pill.mid{background:#FFE8A0;color:#1A150F} .dq-pill.good{background:#B8E6C8;color:#0A1A0F} .dq-pill.bad{background:#FFC8B8;color:#2A0F0A}
    .dq-section{border:1.5px solid #232018;border-radius:12px;padding:10px 10px 8px;background:rgba(255,254,247,0.04);display:flex;flex-direction:column;gap:6px}
    .dq-label{font-family:ui-monospace,monospace;font-size:10px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;color:#E8E0D0;display:flex;justify-content:space-between;align-items:center}
    .dq-numbers{font-family:ui-sans-serif,system-ui;font-weight:800;font-size:13px;color:#FFFEF7;display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}
    .dq-numbers b{font-size:15px}
    .dq-track{height:12px;background:rgba(255,254,247,0.10);border-radius:999px;position:relative;overflow:visible;border:1px solid rgba(255,254,247,0.08)}
    .dq-avg{position:absolute;top:-4px;bottom:-4px;width:0;display:flex;flex-direction:column;align-items:center;pointer-events:none}
    .dq-avg-line{width:2px;height:100%;background:#F0E442;box-shadow:0 0 0 1px rgba(0,0,0,0.6)}
    .dq-avg-lbl{font-family:ui-monospace,monospace;font-size:8px;font-weight:900;color:#F0E442;margin-top:1px;white-space:nowrap;background:#1A150F;padding:0 3px;border-radius:4px}
    .dq-cur{position:absolute;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:999px;background:#FFFEF7;border:2px solid #1A150F;box-shadow:0 0 0 2px rgba(255,254,247,0.22), 0 1px 4px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center}
    .dq-hist-wrap{display:flex;flex-direction:column;gap:4px}
    .dq-hist{display:flex;gap:2px;align-items:end;height:36px}
    .dq-hist-bar{flex:1;border-radius:3px 3px 2px 2px;min-width:2px;transition:all .18s;position:relative}
    .dq-hist-bar.is-cur{background:#FFFEF7 !important;box-shadow:0 0 0 1px #1A150F, 0 0 8px rgba(255,254,247,0.45);outline:1.5px solid #1A150F;z-index:1}
    .dq-hist-axis{display:flex;justify-content:space-between;font-family:ui-monospace,monospace;font-size:9px;color:#8A8E9A}
    .dq-sentence{font-family:ui-sans-serif,system-ui;font-size:${isMobile? '13px':'14.5px'};line-height:1.55;font-weight:600;color:#FFFEF7;background:rgba(255,254,247,0.07);border-radius:10px;padding:10px 11px;border:1px solid rgba(255,254,247,0.10)}
    .dq-peers{font-family:ui-monospace,monospace;font-size:10.5px;line-height:1.45;color:#C2C6D0;background:rgba(18,16,12,0.6);border-radius:8px;padding:7px 9px;border:1px dashed #2A241E}
    .dq-icon{font-size:12px;line-height:1}
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

  let current=null, tProg=0, paused=true, embedPaused=true, used=new Set(), lastSwitch=performance.now(), lastChangeIdx=-1, lastSeasonIdx=-1, autoPauseUntil=0;
  window.addEventListener('vh:pause-maps',()=>{ embedPaused=true; paused=true; if(btnPlay) btnPlay.textContent='▶'; });
  document.addEventListener('focusin',e=>{ if(e.target&&e.target.id==='guess-input'){ embedPaused=true; paused=true; if(btnPlay) btnPlay.textContent='▶'; } });

  function pickRandom(ex){ let cands=pool.filter(n=>n!==ex&&!used.has(n)); if(cands.length<5){ used.clear(); cands=pool.filter(n=>n!==ex); } return cands[Math.floor(Math.random()*cands.length)]; }
  function careerStage(idx,total){ const r=idx/Math.max(1,total-1); if(r<0.18) return 'Rookie'; if(r<0.35) return 'Breakout'; if(r<0.62) return 'Prime'; if(r<0.84) return 'Veteran'; return 'Late'; }

  function renderTimeline(){
    if(!current) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    timelineEl.innerHTML='';
    current.meta.forEach((m,i)=>{
      const chip=document.createElement('div');
      chip.className='drift-tm-chip ' + (i===idx? 'filled' : (i<idx? 'outline-past' : 'outline-future'));
      chip.textContent=`${m.season} ${m.team} ${m.arche}${m.pl? ' '+m.pl:''}`;
      chip.title=`${m.season} ${m.team} ${m.arche} • click to jump`;
      chip.onclick=()=>{ tProg=i/current.meta.length; embedPaused=false; paused=false; if(btnPlay) btnPlay.textContent='❚❚'; };
      timelineEl.appendChild(chip);
    });
    const curEl=timelineEl.children[idx]; if(curEl) curEl.scrollIntoView({ block:'nearest', behavior:'smooth' });
  }

  function renderQuad(m, quad){
    if(!quadEl) return;
    const n=quad.n||0;
    const vals=quad.vals||[];
    const curMpg=quad.curMin?.mpg||0;
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

    // ranges
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

    // histogram 12 bins for MIN load
    const bins=12;
    const hist=Array(bins).fill(0);
    mpgs.forEach(v=>{ const b=Math.min(bins-1, Math.max(0, Math.floor(((v-rMinMpg)/Math.max(0.0001,rMaxMpg-rMinMpg))*bins))); hist[b]++; });
    const maxBin=Math.max(...hist,1);
    const curBin=Math.min(bins-1, Math.max(0, Math.floor(((curMpg-rMinMpg)/Math.max(0.0001,rMaxMpg-rMinMpg))*bins)));
    const avgBin=Math.min(bins-1, Math.max(0, Math.floor(((avgMpg-rMinMpg)/Math.max(0.0001,rMaxMpg-rMinMpg))*bins)));
    const avgPosPct=((avgMpg-rMinMpg)/Math.max(0.0001,rMaxMpg-rMinMpg))*100;
    const curPosPct=((curMpg-rMinMpg)/Math.max(0.0001,rMaxMpg-rMinMpg))*100;

    // closest peers
    const closest = [...vals].filter(v=>v.name!==m.name).sort((a,b)=> Math.abs(a.mpg-curMpg)-Math.abs(b.mpg-curMpg)).slice(0,2);

    // plain english
    const posLabel=m.pl||'POS';
    const archLabel=m.arche||'archetype';
    let sentence='';
    if(n<3){
      sentence=`${m.name} is one of few ${posLabel} ${archLabel} in ${m.season} — only ${n} peers that year.`;
    } else if(pct>=80){
      sentence=`${m.name} played ${curGp} games vs ${avgGp.toFixed(0)} avg and carried heavy load — more than ${pct}% of ${posLabel} ${archLabel} peers. That is ${better? 'above':'below'} average by ${Math.abs(deltaMpg).toFixed(1)} load.`;
    } else if(pct<=20){
      sentence=`${m.name} played ${curGp} vs ${avgGp.toFixed(0)} avg GP, ${verb} minutes than ${100-pct}% of ${posLabel} ${archLabel} peers (P${pct} — ${Math.abs(deltaMpg).toFixed(1)} vs avg).`;
    } else {
      sentence=`${m.name} played ${curGp} vs ${avgGp.toFixed(0)} avg GP, ${verb} load than average — P${pct} among ${n} ${posLabel} ${archLabel} peers in ${m.season}. Δ ${deltaMpg>=0? '+':''}${deltaMpg.toFixed(1)} vs avg.`;
    }

    const archColor=OKABE[m.archeIdx%8]||'#FFFEF7';
    const posIcon=POS_ICON[posLabel]||'⬤';

    function barHTML(min,max,curAvg,curVal,pctState){
      const curP=Math.max(2,Math.min(98, ((curVal-min)/Math.max(0.0001,max-min))*100 ));
      const avgP=Math.max(2,Math.min(98, ((curAvg-min)/Math.max(0.0001,max-min))*100 ));
      return `
        <div class="dq-track">
          <div class="dq-avg" style="left:${avgP}%"><div class="dq-avg-line"></div><div class="dq-avg-lbl">▲ avg</div></div>
          <div class="dq-cur" style="left:${curP}%" title="you: ${curVal.toFixed(1)} vs avg ${curAvg.toFixed(1)}"></div>
        </div>`;
    }

    quadEl.innerHTML=`
      <div class="dq-kicker"><span class="dq-dot" style="background:${archColor}"></span> Quad ${m.season} • Team ${m.team} • ${posLabel} ${archLabel} <span style="margin-left:auto;opacity:.7">${n} peers</span></div>
      <div class="dq-title"><span class="dq-icon">${posIcon}</span> ${posLabel} <span style="opacity:.55">×</span> <span style="display:inline-flex;align-items:center;gap:6px"><span class="dq-dot" style="background:${archColor}"></span> ${archLabel}</span></div>
      <div class="dq-subtitle">vs <b style="color:#FFFEF7">${n} peers</b> in same quadrant of embedding map that season. Background dots = full ${m.season} pool.</div>

      <div class="dq-bigrow">
        <div class="dq-pct ${pctState}" title="Percentile vs quad">
          <div style="display:flex;align-items:center;justify-content:center;gap:4px">${arrow} P${pct}</div>
          <small>${pct>=67? '▲ better': pct<=33? '▼ worse':'— mid'}</small>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex:1;min-width:140px">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="dq-pill white" title="Games played">● ${curGp} GP <span style="opacity:.6">vs ${avgGp.toFixed(0)} avg ${deltaGp>=0? '+'+deltaGp.toFixed(0):deltaGp.toFixed(0)}</span></span>
            <span class="dq-pill ${pctState}" title="MIN load — inflated scale but percentile accurate">■ ${curMpg.toFixed(1)} load <span style="opacity:.8">vs ${avgMpg.toFixed(1)} avg ${deltaMpg>=0? '+'+deltaMpg.toFixed(1):deltaMpg.toFixed(1)}</span></span>
          </div>
          <div class="dq-subtitle" style="font-size:10px;opacity:.8">MIN load is inflated (52 = 4264/82) — use as relative, not real MPG. Pxx accurate.</div>
        </div>
      </div>

      <div class="dq-section">
        <div class="dq-label"><span>Games played</span><span style="opacity:.7">${minGp.toFixed(0)} → ${maxGp.toFixed(0)} range</span></div>
        <div class="dq-numbers"><b>${curGp}</b> you <span style="opacity:.6">vs</span> <b>${avgGp.toFixed(0)}</b> avg</div>
        ${barHTML(rMinGp,rMaxGp,avgGp,curGp,pctState)}
        <div class="dq-label" style="margin-top:2px"><span>▲ avg ${avgGp.toFixed(0)}</span><span>● you ${curGp}</span></div>
      </div>

      <div class="dq-section">
        <div class="dq-label">
          <span>Minutes load distribution (quad) — triple: color + shape + text</span>
          <span style="opacity:.7" title="inflated scale">${rMinMpg.toFixed(1)} → ${rMaxMpg.toFixed(1)}</span>
        </div>
        <div class="dq-hist-wrap">
          <div class="dq-hist" title="12-bin histogram, white=you, yellow=avg">
            ${hist.map((h,i)=>{
              const isCur=i===curBin;
              const isAvg=i===avgBin;
              const base= isCur? '#FFFEF7' : isAvg? '#F0E442' : '#3A3E4A';
              const hPct= 8 + (h/maxBin)*28;
              return `<div class="dq-hist-bar ${isCur? 'is-cur':''}" style="height:${hPct}px;background:${base};opacity:${isCur?1: isAvg?0.9:0.55}" title="bin ${i}: ${h} peers"></div>`;
            }).join('')}
          </div>
          <div style="position:relative;height:12px;margin-top:2px;background:rgba(255,254,247,0.06);border-radius:999px;border:1px solid rgba(255,254,247,0.06)">
            <div class="dq-avg" style="left:${avgPosPct}%"><div class="dq-avg-line" style="height:12px"></div></div>
            <div class="dq-cur" style="left:${curPosPct}%"></div>
          </div>
          <div class="dq-hist-axis"><span>▲ avg ${avgMpg.toFixed(1)}</span><span style="opacity:.7">12 bins • ${n} peers</span><span>● you ${curMpg.toFixed(1)}</span></div>
        </div>
      </div>

      ${closest.length? `<div class="dq-peers"><div style="font-weight:900;color:#E8E0D0;margin-bottom:2px">Closest peers in load ▲●■</div>${closest.map(p=>`⬤ ${p.name} — ${p.mpg.toFixed(1)} load, ${p.gp} GP (Δ ${(p.mpg-curMpg).toFixed(1)})`).join('<br>')}</div>`:''}

      <div class="dq-sentence">${sentence}<br><span style="opacity:.75;font-weight:400;font-size:12px">${m.desc}. Outline chips = past, filled = current ${m.season}. White trail = full career ghost.</span></div>
    `;
  }

  function updateTrails(){
    if(!current) return;
    clearGroup(trailPastGroup); clearGroup(trailFutureGroup); clearGroup(ghostGroup);
    ghostGroup.add(current.ghostLine);
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    for(let i=0;i<current.nodeMeshes.length;i++){
      const mesh=current.nodeMeshes[i]; const mat=mesh.material;
      if(i===idx){ mat.wireframe=false; mat.color.set(current.baseColor); mat.emissive.set(current.baseColor); mat.emissiveIntensity=1.0; mat.opacity=1; mesh.scale.set(1.85,1.85,1.85); }
      else if(i<idx){ mat.wireframe=true; mat.color.set(0x9AA0AC); mat.emissive.set(0x000000); mat.opacity= i===idx-1? 0.45:0.28; mesh.scale.set(1.0,1.0,1.0); }
      else { mat.wireframe=true; mat.color.set(0x3A3E4A); mat.opacity=0.12; mesh.scale.set(0.75,0.75,0.75); }
    }
    if(idx>0){
      const pastPts=current.pts.slice(0, idx+1);
      if(pastPts.length>=2){
        const pastCurve=new THREE.CatmullRomCurve3(pastPts);
        const tube=new THREE.TubeGeometry(pastCurve, Math.max(pastPts.length*7,40), 0.105, 8, false);
        trailPastGroup.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color:0xC2C6D0, transparent:true, opacity:0.20, wireframe:true })));
        const lineGeo=new THREE.BufferGeometry().setFromPoints(pastPts);
        const lineMat=new THREE.LineDashedMaterial({ color:0x8A8E9A, transparent:true, opacity:0.24, dashSize:0.20, gapSize:0.18 });
        const line=new THREE.Line(lineGeo, lineMat); line.computeLineDistances(); trailPastGroup.add(line);
      }
    }
    if(idx < current.meta.length-1){
      const futPts=current.pts.slice(idx);
      if(futPts.length>=2){
        const fGeo=new THREE.BufferGeometry().setFromPoints(futPts);
        const fMat=new THREE.LineDashedMaterial({ color:current.baseColor, transparent:true, opacity:0.10, dashSize:0.12, gapSize:0.20 });
        const l=new THREE.Line(fGeo, fMat); l.computeLineDistances(); trailFutureGroup.add(l);
      }
    }
  }

  function renderFocus(){
    if(!current||!focusEl) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const m=current.meta[idx];
    const first=current.meta[0], last=current.meta[current.meta.length-1], total=current.meta.length;
    const stage=careerStage(idx,total);

    if(lastSeasonIdx!==m.si){ lastSeasonIdx=m.si; updateSeasonCloud(m.season, current.name); }
    if(renderFocus._lastIdx!==idx){ renderFocus._lastIdx=idx; updateTrails(); renderTimeline(); }

    const delta=((m.share-first.share)*100).toFixed(1); const sign=parseFloat(delta)>=0?'+':'';
    const change=current.changes.find(c=>c.idx===idx);
    const progress=`${idx+1}/${total}`;
    const quad=computeQuadStats(m, current.name);
    const nextChange=current.changes.find(c=>c.idx>idx);
    const nextHint=nextChange? `→ next ${nextChange.to.season} ${nextChange.to.arche}` : `→ final ${last.season}`;

    if(change && lastChangeIdx!==idx){
      lastChangeIdx=idx; autoPauseUntil=performance.now()+2400;
      focusEl.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span style="background:#F0E442;border:2px solid #1A150F;padding:4px 10px;border-radius:999px;font-weight:900">SHIFT ${progress} ${stage}</span><span style="background:#FFFEF7;border:2px solid #1A150F;padding:4px 10px;border-radius:999px;font-weight:800;color:#1A150F">${current.name} • ${m.team} ${m.season}</span><span style="background:#1A150F;color:#FFFEF7;border:2px solid #FFFEF7;padding:4px 10px;border-radius:999px">${m.arche} ${m.pl? '• '+m.pl:''}</span></div><div style="margin-top:6px;font-size:${isMobile? '11px':'12px'};font-family:ui-monospace,monospace;color:#1A150F;background:rgba(255,254,247,0.92);border:2px solid #1A150F;border-radius:10px;padding:6px 10px;display:inline-block">LEAGUE ${ (m.share*100).toFixed(1)}% (${sign}${delta}pp) — ${m.team} ${m.season}: ${quad.curMin?.mpg?.toFixed(1)||'—'} load vs ${quad.avgMpg.toFixed(1)} avg, P${Math.round(quad.pct)} in quad • ${nextHint}</div>`;
    } else {
      focusEl.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span style="background:#FFFEF7;border:2px solid #1A150F;padding:5px 12px;border-radius:999px;font-weight:900;color:#1A150F">${current.name} [${progress} ${stage}]</span><span style="background:#1A150F;color:#FFFEF7;border:2px solid #FFFEF7;padding:5px 12px;border-radius:999px">${m.season} ${m.team} • ${m.arche} ${m.pl? '• '+m.pl:''}</span></div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><span class="dq-pill white">LEAGUE ${(m.share*100).toFixed(1)}% (${sign}${delta}pp)</span><span class="dq-pill ${quad.pct>=67? 'good':quad.pct<=33? 'bad':'mid'}">${quad.curMin?.mpg?.toFixed(1)||'—'} load P${Math.round(quad.pct)} vs ${quad.avgMpg.toFixed(1)} avg • ${quad.n} peers</span><span class="dq-pill dark">→ ${nextHint}</span></div>`;
    }

    if(metaEl){
      const lastShift=current.changes.length? `last shift ${current.changes[current.changes.length-1].to.season} ${current.changes[current.changes.length-1].from.arche}→${current.changes[current.changes.length-1].to.arche}` : 'no shift';
      let skillTxt=''; if(skillsMap){ const sk=skillsMap[`${current.name}|${m.season}`]; if(sk){ const top=Object.entries(sk).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([k,v])=>`${k} ${v}`).join(' • '); skillTxt=` • skills ${top}`; } }
      metaEl.innerHTML=`<span style="font-family:ui-monospace,monospace;font-size:11px;background:rgba(18,16,12,0.88);color:#FFFEF7;border:1.5px solid #1A150F;padding:6px 10px;border-radius:10px;display:inline-block;max-width:88vw">TEAM ${m.team} • ${total} seasons • ${current.changes.length} shifts • ${lastShift} • ${quad.curMin?.gp||'—'} GP vs ${quad.avgGp.toFixed(0)} avg • ${m.desc}${skillTxt} • <span style="opacity:.75">Outline chips = past, solid = current ${m.season}. White dots = ${seasonPlayersMap.get(m.season)?.length||0} peers in ${m.season}. Pinch/wheel to zoom.</span></span>`;
    }

    renderQuad(m, quad);
    if(scrubFill) scrubFill.style.width=`${(tProg*100).toFixed(1)}%`;
  }
  renderFocus._lastIdx=-1;

  function show(name){
    clearGroup(playerGroup); clearGroup(trailPastGroup); clearGroup(trailFutureGroup); clearGroup(ghostGroup);
    renderFocus._lastIdx=-1; lastSeasonIdx=-1;
    const arc=buildArc(name); if(!arc){ const n=pickRandom(name); if(n) return show(n); return; }
    playerGroup.add(arc.nodes); playerGroup.add(arc.travellerGroup); ghostGroup.add(arc.ghostLine);
    current=arc; tProg=0; lastSwitch=performance.now(); lastChangeIdx=-1; used.add(name);
    updateSeasonCloud(arc.meta[0].season, arc.name);
    updateTrails(); renderTimeline(); renderFocus();
  }

  show(pool[Math.floor(Math.random()*pool.length)]||'Gary Payton');
  setTimeout(()=>{ try{ renderer.render(scene,camera);}catch{} },180);
  setTimeout(()=>{ try{ renderer.render(scene,camera);}catch{} },600);

  if(scrub){ let dragging=false; const setFromX=x=>{ const r=scrub.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(x-r.left)/r.width)); tProg=p; renderFocus(); if(current){ const pt=current.curve.getPointAt(Math.max(0.0001,Math.min(0.999,tProg))); if(pt){ current.travellerGroup.position.copy(pt); current.travellerGroup.position.y+=0.06; } } }; scrub.addEventListener('pointerdown',e=>{ dragging=true; try{scrub.setPointerCapture(e.pointerId);}catch{} setFromX(e.clientX); paused=true; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚'; }); scrub.addEventListener('pointermove',e=>{ if(dragging) setFromX(e.clientX); }); scrub.addEventListener('pointerup',()=>{ dragging=false; }); scrub.addEventListener('click',e=> setFromX(e.clientX)); }
  if(btnPlay){ btnPlay.textContent='▶ Play — pinch/wheel zoom'; btnPlay.addEventListener('click',()=>{ if(paused||embedPaused){ paused=false; embedPaused=false; btnPlay.textContent='❚❚ Pause'; } else { paused=true; embedPaused=true; btnPlay.textContent='▶ Play — pinch/wheel zoom'; } }); }
  if(btnNext) btnNext.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx+1;j<current.meta.length;j++) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; renderFocus(); const pt=current.curve.getPointAt(tProg); if(pt) current.travellerGroup.position.copy(pt); return; } tProg=1; renderFocus(); });
  if(btnPrev) btnPrev.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx-1;j>=1;j--) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; renderFocus(); const pt=current.curve.getPointAt(tProg); if(pt) current.travellerGroup.position.copy(pt); return; } tProg=0; renderFocus(); });

  function onWheel(e){ e.preventDefault(); setZ(camBaseZ + Math.sign(e.deltaY)*0.7 + e.deltaY*0.004); } canvas.addEventListener('wheel', onWheel, {passive:false});
  let pinchStartDist=0, pinchStartZ=CAM_Z_DEFAULT; const distTouches=t=>{ const a=t[0],b=t[1]; return Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY); };
  canvas.addEventListener('touchstart', e=>{ if(e.touches?.length===2){ pinchStartDist=distTouches(e.touches); pinchStartZ=camBaseZ; } }, {passive:true});
  canvas.addEventListener('touchmove', e=>{ if(e.touches?.length===2){ e.preventDefault(); const d=distTouches(e.touches); const ratio=pinchStartDist/(d||1); setZ(pinchStartZ * ratio); } }, {passive:false});

  function onResize(){ const w=canvas.clientWidth,h=canvas.clientHeight; if(w<10||h<10) return; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); } const ro=new ResizeObserver(onResize); ro.observe(canvas); onResize();
  let visible=true; const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; },{threshold:0.02}); io.observe(canvas);

  function tick(){
    requestAnimationFrame(tick); if(embedPaused) return; if(!visible) return;
    const now=performance.now();
    if(!paused && now>autoPauseUntil){ tProg+=0.00032; if(tProg>1) tProg=0; }
    if(current){ const pt=current.curve.getPointAt(Math.max(0.0001,Math.min(0.999,tProg))); if(pt){ current.travellerGroup.position.copy(pt); current.travellerGroup.position.y+=0.07; } }
    const t=current? tProg:0; const lookZ=current? current.curve.getPointAt(t).z*0.62+6.2:0;
    camera.position.x=Math.sin(now*0.00010)*1.1; camera.position.y=4.2+Math.sin(now*0.00008)*0.24; camera.position.z=camBaseZ + Math.sin(now*0.00007)*0.7; camera.lookAt(0,-0.2,lookZ);
    renderFocus();
    if(now-lastSwitch>34000&&!paused){ const nxt=pickRandom(current?.name); if(nxt) show(nxt); lastSwitch=now; }
    renderer.render(scene,camera);
  }
  tick();
  return { getFocused(){ if(!current) return null; const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1); return current.meta[idx]; }, show, dispose:()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); } };
}
