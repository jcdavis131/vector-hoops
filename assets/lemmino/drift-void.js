/* drift-void.js v7 — zoomed-out start + pinch zoom + season-context + history trail
   #1: zoom out to 38, allow wheel + pinch zoom (12-60) into specific seasons/archetypes
   #2: story readability fixes:
     - show all dots for players that season (seasonCloud) = league snapshot for that year
     - greyed historical trail for past + faint future + bright current
     - show current team placeholder (wiring from roster_context when available)
     - show role changes with from→to highlight, greyed trail, white ring markers
     - season context: team role, league %, career stage, shift reason
     - bigger labels, less clutter
*/
export async function mountDriftVoid(canvas){
  if(!canvas) return;
  let THREE;
  try{ THREE = await import('three'); }catch{ THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js'); }
  const isLowEnd=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||window.innerWidth<560;
  const isMobile=window.innerWidth<700;

  const renderer=new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, isLowEnd?1.15:1.6));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(0x080A0F,1);

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x080A0F);
  scene.fog=new THREE.FogExp2(0x080A0F, 0.0095);

  const CAM_Z_DEFAULT=38, CAM_Z_MIN=12, CAM_Z_MAX=68;
  const camera=new THREE.PerspectiveCamera(46, 1, 0.1, 320);
  camera.position.set(0,4.2,CAM_Z_DEFAULT);
  let camBaseZ=CAM_Z_DEFAULT;
  function clampZ(z){ return Math.max(CAM_Z_MIN, Math.min(CAM_Z_MAX, z)); }
  function setZ(z){ camBaseZ=clampZ(z); }

  scene.add(new THREE.AmbientLight(0xFFFFFF,0.78));
  const key=new THREE.DirectionalLight(0xFFE8C8,0.95); key.position.set(6,9,5); scene.add(key);
  const fill=new THREE.DirectionalLight(0xA8C4FF,0.35); fill.position.set(-5,3,-3); scene.add(fill);

  const ground=new THREE.Mesh(new THREE.PlaneGeometry(300,300), new THREE.MeshStandardMaterial({ color:0x0C0E14, roughness:0.96 }));
  ground.rotation.x=-Math.PI/2; ground.position.y=-2.9; scene.add(ground);

  let timeData=null, liteData=null;
  async function cachedFetchJSON(url){
    const CACHE_NAME='vector-hoops-v17.1-20260720-outline';
    try{
      if('caches' in window){
        const cache=await caches.open(CACHE_NAME);
        const hit=await cache.match(url);
        if(hit) return await hit.json();
      }
    }catch{}
    const r=await fetch(url,{cache:'default'});
    try{
      if('caches' in window){
        const cache=await caches.open(CACHE_NAME);
        cache.put(url, r.clone()).catch(()=>{});
      }
    }catch{}
    return r.json();
  }
  try{
    const [tData,lData]=await Promise.all([
      cachedFetchJSON('assets/archetypes_time.json?v=17'),
      cachedFetchJSON('assets/vectors_search_lite.json?v=17')
    ]);
    timeData=tData; liteData=lData;
  }catch(e){ console.warn('drift v7 fetch fail',e); return; }

  const seasons=timeData?.prevalence||[];
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#FFFEF7'];
  const shortNames=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const longDesc=[
    "Rim protection + glass, low perimeter creation",
    "Low volume, high rebounding efficiency",
    "Minimal box-score footprint that season, end-of-bench",
    "Defensive glass + FT rate, low usage",
    "High volume 3P + moderate creation",
    "Efficient 3P accuracy + volume spacer",
    "Primary playmaking, creation engine",
    "High usage scoring volume"
  ];
  const SEASON_SPAN=44;
  const getZ=(idx)=>(idx/Math.max(1,seasons.length-1))*SEASON_SPAN - SEASON_SPAN/2;
  const seasonIdx=new Map(seasons.map((s,i)=>[s.season,i]));

  // precompute per-season player positions for seasonCloud
  const seasonPlayersMap=new Map(); // season -> {list, positions}
  for(const s of seasons) seasonPlayersMap.set(s.season, []);
  for(const p of (liteData.players||[])){
    if(!seasonPlayersMap.has(p.s)) seasonPlayersMap.set(p.s, []);
    seasonPlayersMap.get(p.s).push(p);
  }

  const leagueGroup=new THREE.Group(); scene.add(leagueGroup);
  const count=liteData?.players?.length||0;
  const positions=new Float32Array(count*3);
  const colors=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const p=liteData.players[i];
    const si=seasonIdx.get(p.s); if(si===undefined) continue;
    const share=seasons[si]?.shares[p.c]||0;
    const x=(p.c-3.5)*1.20 + (Math.random()-0.5)*0.44;
    const y=-2.1+share*5.6 + Math.random()*0.5;
    const z=getZ(si)+(Math.random()-0.5)*0.22;
    positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
    const col=new THREE.Color(OKABE[p.c%8]); col.lerp(new THREE.Color(0x151821),0.68);
    colors[i*3]=col.r; colors[i*3+1]=col.g; colors[i*3+2]=col.b;
  }
  const leagueGeo=new THREE.BufferGeometry();
  leagueGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  leagueGeo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const leagueMat=new THREE.PointsMaterial({ size:isLowEnd?0.05:0.072, vertexColors:true, transparent:true, opacity:0.18, sizeAttenuation:true, depthWrite:false });
  leagueGroup.add(new THREE.Points(leagueGeo, leagueMat));

  // season snapshot cloud — updated per season, bright peers
  const seasonCloudGroup=new THREE.Group(); scene.add(seasonCloudGroup);
  let seasonCloudPoints=null;
  let seasonCloudGeo=new THREE.BufferGeometry();
  let seasonCloudMat=new THREE.PointsMaterial({ size: isMobile?0.16:0.20, vertexColors:true, transparent:true, opacity:0.92, sizeAttenuation:true, depthWrite:false });
  seasonCloudPoints=new THREE.Points(seasonCloudGeo, seasonCloudMat);
  seasonCloudGroup.add(seasonCloudPoints);

  function updateSeasonCloud(seasonStr, highlightName=null){
    const list=seasonPlayersMap.get(seasonStr)||[];
    if(!list.length) return;
    // exclude highlighted player to avoid z-fighting (we render traveller)
    const filtered=highlightName? list.filter(p=>p.n!==highlightName) : list;
    const posArr=new Float32Array(filtered.length*3);
    const colArr=new Float32Array(filtered.length*3);
    for(let i=0;i<filtered.length;i++){
      const p=filtered[i];
      const si=seasonIdx.get(p.s); if(si===undefined) continue;
      const share=seasons[si]?.shares[p.c]||0;
      const x=(p.c-3.5)*1.20 + (Math.random()-0.5)*0.16;
      const y=-2.1+share*5.6 + Math.random()*0.22;
      const z=getZ(si)+(Math.random()-0.5)*0.10;
      posArr[i*3]=x; posArr[i*3+1]=y; posArr[i*3+2]=z;
      const col=new THREE.Color(OKABE[p.c%8]); col.lerp(new THREE.Color(0xFFFFFF),0.12);
      colArr[i*3]=col.r; colArr[i*3+1]=col.g; colArr[i*3+2]=col.b;
    }
    seasonCloudGeo.setAttribute('position', new THREE.BufferAttribute(posArr,3));
    seasonCloudGeo.setAttribute('color', new THREE.BufferAttribute(colArr,3));
    seasonCloudGeo.computeBoundingSphere();
  }

  const ribbonGroup=new THREE.Group(); scene.add(ribbonGroup);
  for(let a=0;a<8;a++){
    const pts=[]; for(let s=0;s<seasons.length;s++) pts.push(new THREE.Vector3((a-3.5)*1.20, -2.1+(seasons[s].shares[a]||0)*5.6, getZ(s)));
    const curve=new THREE.CatmullRomCurve3(pts);
    const geo=new THREE.TubeGeometry(curve, seasons.length*2, isLowEnd?0.024:0.034, 6, false);
    const col=new THREE.Color(OKABE[a]); col.lerp(new THREE.Color(0x12141A),0.70);
    ribbonGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.10, depthWrite:false })));
  }

  function makeTickLabel(text,x,z,bold=false){
    const c=document.createElement('canvas'); c.width=220; c.height=44;
    const ctx=c.getContext('2d');
    ctx.fillStyle= bold? 'rgba(255,254,247,0.98)' : 'rgba(255,254,247,0.88)';
    ctx.beginPath(); ctx.roundRect(2,4,216,36,9); ctx.fill();
    ctx.fillStyle= bold? '#1A150F' : '#2A241E';
    ctx.font= bold? '900 13px ui-monospace,monospace' : '700 12px ui-monospace,monospace';
    ctx.textAlign='center'; ctx.fillText(text,110,26);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:false });
    const s=new THREE.Sprite(mat); s.scale.set(bold?1.12:0.92, bold?0.23:0.18,1); s.position.set(x,-2.75,z); return s;
  }
  const tickGroup=new THREE.Group(); scene.add(tickGroup);
  const recentThreshold = seasons.length - 8;
  seasons.forEach((s,i)=>{
    const isRecent = i>=recentThreshold;
    const every = isRecent? 1 : 2;
    if(i%every===0 || i===seasons.length-1){
      const t=makeTickLabel(s.season,-6.2,getZ(i), isRecent);
      tickGroup.add(t);
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-5.2,-2.55,getZ(i)), new THREE.Vector3(5.7,-2.55,getZ(i))]), new THREE.LineBasicMaterial({ color:0xFFFFFF, transparent:true, opacity: isRecent?0.11:0.05 }));
      tickGroup.add(line);
    }
  });

  const byName=new Map();
  for(const p of liteData.players){ if(!byName.has(p.n)) byName.set(p.n,[]); byName.get(p.n).push(p); }
  for(const arr of byName.values()) arr.sort((a,b)=> (a.s||'').localeCompare(b.s||''));
  const CURATED=["LeBron James","Stephen Curry","Kevin Durant","Giannis Antetokounmpo","Nikola Jokic","James Harden","Russell Westbrook","Chris Paul","Kawhi Leonard","Damian Lillard","Luka Doncic","Jayson Tatum","Joel Embiid","Kobe Bryant","Tim Duncan","Dirk Nowitzki","Shaquille O'Neal","Kevin Garnett","Steve Nash","Dwyane Wade","Vince Carter","Chris Bosh","Paul Pierce","Anthony Edwards","Victor Wembanyama","Bo Outlaw","Anthony Davis","Devin Booker","Ja Morant"];
  let pool=CURATED.filter(n=>byName.has(n)&&byName.get(n).length>=4);
  while(pool.length<40){ for(const [nm,arr] of byName.entries()) if(arr.length>=10&&!pool.includes(nm)) pool.push(nm); if(pool.length>=55) break; }

  const playerGroup=new THREE.Group(); scene.add(playerGroup);
  const trailPastGroup=new THREE.Group(); scene.add(trailPastGroup);
  const trailFutureGroup=new THREE.Group(); scene.add(trailFutureGroup);
  const ghostLineGroup=new THREE.Group(); scene.add(ghostLineGroup);

  function makePill(text,bg,fg,w=540,h=56,scale=2.3){
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const ctx=c.getContext('2d'); ctx.clearRect(0,0,w,h);
    ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(4,4,w-8,h-8,11); ctx.fill();
    ctx.fillStyle=fg; ctx.font='800 13px ui-monospace,monospace'; ctx.textAlign='left'; ctx.textBaseline='middle';
    let txt=text; if(txt.length>74) txt=txt.slice(0,72)+'…';
    ctx.fillText(txt,14,h/2+1);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:false });
    const s=new THREE.Sprite(mat); s.scale.set(scale, scale*0.125,1); return s;
  }

  function clear(g){
    while(g.children.length){
      const child=g.children[0]; g.remove(child);
      if(child.geometry) child.geometry.dispose();
      if(child.material){
        if(child.material.map) child.material.map.dispose?.();
        child.material.dispose();
      }
      // recurse
      if(child.isGroup && child.children) clear(child);
    }
  }

  function buildArc(name){
    const entries=byName.get(name)||[];
    const pts=[], meta=[];
    for(const e of entries){
      const si=seasonIdx.get(e.s); if(si===undefined) continue;
      const share=seasons[si]?.shares[e.c]||0;
      pts.push(new THREE.Vector3((e.c-3.5)*1.20, -2.1+share*5.6+1.05, getZ(si)));
      meta.push({ season:e.s, archeIdx:e.c, arche:shortNames[e.c], desc:longDesc[e.c], share, si, total:seasons[si]?.total||0 });
    }
    if(pts.length<3) return null;
    const curve=new THREE.CatmullRomCurve3(pts);
    const baseColor=new THREE.Color(OKABE[meta[Math.floor(meta.length/2)].archeIdx%8]); baseColor.lerp(new THREE.Color(0xFFFFFF),0.08);

    const nodes=new THREE.Group();
    const nodeMeshes=[]; // keep refs for outline vs filled toggle
    for(let i=0;i<pts.length;i++){
      const isChange=i>0&&meta[i].archeIdx!==meta[i-1].archeIdx;
      const g=new THREE.SphereGeometry(isChange?0.18:0.10,14,14);
      const m=new THREE.MeshStandardMaterial({ color:isChange?0xFFFFFF:baseColor, emissive:baseColor, emissiveIntensity:isChange?0.90:0.30, transparent:true, opacity:isChange?1:0.78, wireframe:false });
      const sph=new THREE.Mesh(g,m); sph.position.copy(pts[i]); sph.userData.isChange=isChange; sph.userData.seasonIdx=i; nodes.add(sph); nodeMeshes.push(sph);
      // ring for change stays, but opacity will be adjusted later
      if(isChange){
        const ring=new THREE.Mesh(new THREE.RingGeometry(0.22,0.29,22), new THREE.MeshBasicMaterial({ color:0xFFFFFF, transparent:true, opacity:0.88, side:THREE.DoubleSide }));
        ring.position.copy(pts[i]); ring.position.y+=0.012; ring.rotation.x=Math.PI/2; ring.userData.isRing=true; ring.userData.seasonIdx=i;
        nodes.add(ring);
      }
    }

    const head=makePill(`${name} — ${entries[0]?.s} → ${entries[entries.length-1]?.s} • ${entries.length} seasons`, '#1A150F','#FFFEF7', isMobile? 460: 680, 58, isMobile? 2.1: 3.0);
    if(pts.length) head.position.set(pts[0].x-0.2, pts[0].y+1.35, pts[0].z-0.35);

    const tail=makePill(`${name.split(' ').pop()} now: ${meta[meta.length-1].arche} • LEAGUE ${(meta[meta.length-1].share*100).toFixed(1)}%`, baseColor.getStyle(), '#081018', isMobile? 380: 540, 54, isMobile? 1.8: 2.45);
    if(pts.length) tail.position.set(pts[pts.length-1].x+0.7, pts[pts.length-1].y+1.05, pts[pts.length-1].z+0.45);

    const currentLabel=makePill(`${meta[0].season}: ${meta[0].arche}`, 'rgba(255,254,247,0.98)','#1A150F', 460, 50, 2.0);

    const traveller=new THREE.Mesh(new THREE.SphereGeometry(0.26,18,18), new THREE.MeshStandardMaterial({ color:0xFFFFFF, emissive:baseColor, emissiveIntensity:1.15 }));
    const travellerHalo=new THREE.Mesh(new THREE.SphereGeometry(0.44,14,14), new THREE.MeshBasicMaterial({ color:baseColor, transparent:true, opacity:0.22 }));
    const travellerGroup=new THREE.Group(); travellerGroup.add(traveller); travellerGroup.add(travellerHalo); travellerGroup.add(currentLabel);
    currentLabel.position.set(0,0.92,0);

    const changes=[];
    for(let i=1;i<meta.length;i++) if(meta[i].archeIdx!==meta[i-1].archeIdx) changes.push({ idx:i, from:meta[i-1], to:meta[i] });

    // full ghost line faint
    const ghostGeo=new THREE.BufferGeometry().setFromPoints(pts);
    const ghostMat=new THREE.LineBasicMaterial({ color:0xFFFFFF, transparent:true, opacity:0.07 });
    const ghostLine=new THREE.Line(ghostGeo, ghostMat);

    return { name, entries, pts, meta, curve, nodes, nodeMeshes, head, tail, currentLabel, traveller, travellerGroup, baseColor, changes, ghostLine };
  }

  let current=null, tProg=0, paused=true, used=new Set(), lastSwitch=performance.now(), autoPauseUntil=0, lastChangeIdx=-1, lastSeasonIdx=-1;
  let embedPaused=true;
  window.addEventListener('vh:pause-maps',()=>{ embedPaused=true; paused=true; if(btnPlay) btnPlay.textContent='▶ Play drift'; });
  document.addEventListener('focusin',(e)=>{
    if(e.target && e.target.id==='guess-input'){
      embedPaused=true; paused=true; if(btnPlay) btnPlay.textContent='▶ Play drift';
    }
  });

  function pickRandom(ex){ let cands=pool.filter(n=>n!==ex&&!used.has(n)); if(cands.length<5){ used.clear(); cands=pool.filter(n=>n!==ex); } return cands[Math.floor(Math.random()*cands.length)]; }

  const focusEl=document.getElementById('lemmino-drift-focus');
  const metaEl=document.getElementById('lemmino-drift-meta');
  const scrub=document.getElementById('drift-scrub');
  const scrubFill=document.getElementById('drift-scrub-fill');
  const btnPlay=document.getElementById('drift-play');
  const btnNext=document.getElementById('drift-next');
  const btnPrev=document.getElementById('drift-prev');

  function careerStage(idx,total){
    const r=idx/Math.max(1,total-1);
    if(r<0.18) return 'Rookie';
    if(r<0.35) return 'Breakout';
    if(r<0.62) return 'Prime';
    if(r<0.84) return 'Veteran';
    return 'Late';
  }

  function updateTrails(){
    if(!current) return;
    // clear past/future trails
    clear(trailPastGroup); clear(trailFutureGroup); clear(ghostLineGroup);
    ghostLineGroup.add(current.ghostLine);
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);

    // nodes: prior = outlines only, current = filled solid, future = faint outline
    if(current.nodeMeshes){
      for(let i=0;i<current.nodeMeshes.length;i++){
        const mesh=current.nodeMeshes[i];
        const mat=mesh.material;
        if(i===idx){
          // current season — filled solid
          mat.wireframe=false;
          mat.color.set(current.baseColor);
          mat.emissive.set(current.baseColor);
          mat.emissiveIntensity=0.95;
          mat.opacity=1.0;
          mesh.scale.set(1.6,1.6,1.6);
        } else if(i<idx){
          // prior seasons — outlines only
          mat.wireframe=true;
          mat.color.set(0x9AA0AC);
          mat.emissive.set(0x000000);
          mat.emissiveIntensity=0;
          mat.opacity= i===idx-1 ? 0.42 : 0.26; // most recent prior a bit stronger
          mesh.scale.set(1.0,1.0,1.0);
        } else {
          // future seasons — very faint outline
          mat.wireframe=true;
          mat.color.set(0x4A4E58);
          mat.emissive.set(0x000000);
          mat.opacity=0.10;
          mesh.scale.set(0.8,0.8,0.8);
        }
      }
      // also dim rings for prior/future but keep current transition rings bright
      for(const child of current.nodes.children){
        if(child.userData.isRing){
          const ri=child.userData.seasonIdx;
          if(ri===idx || ri===idx+1) { child.visible=true; child.material.opacity=ri===idx?0.92:0.55; }
          else if(ri<idx) { child.visible=true; child.material.opacity=0.18; }
          else { child.visible=false; }
        }
      }
    }

    if(idx>0){
      const pastPts=current.pts.slice(0, idx+1);
      if(pastPts.length>=2){
        // outline trail: wireframe tube = looks like outlined path
        const pastCurve=new THREE.CatmullRomCurve3(pastPts);
        const pastTube=new THREE.TubeGeometry(pastCurve, Math.max(pastPts.length*7, 40), 0.095, 8, false);
        const mat=new THREE.MeshBasicMaterial({ color:0xC2C6D0, transparent:true, opacity:0.22, wireframe:true });
        const mesh=new THREE.Mesh(pastTube, mat);
        trailPastGroup.add(mesh);
        // thin dashed line center for readability
        const lineGeo=new THREE.BufferGeometry().setFromPoints(pastPts);
        const lineMat=new THREE.LineDashedMaterial({ color:0x9AA0AC, transparent:true, opacity:0.22, dashSize:0.22, gapSize:0.20, linewidth:1 });
        const line=new THREE.Line(lineGeo, lineMat); line.computeLineDistances(); trailPastGroup.add(line);
      }
    }
    if(idx < current.meta.length-1){
      const futPts=current.pts.slice(idx);
      if(futPts.length>=2){
        const futCurve=new THREE.CatmullRomCurve3(futPts);
        // future = even fainter outline dashed
        const fLineGeo=new THREE.BufferGeometry().setFromPoints(futPts);
        const fLineMat=new THREE.LineDashedMaterial({ color:current.baseColor, transparent:true, opacity:0.12, dashSize:0.14, gapSize:0.22 });
        const fLine=new THREE.Line(fLineGeo, fLineMat); fLine.computeLineDistances(); trailFutureGroup.add(fLine);
      }
    }
  }

  function renderFocus(){
    if(!current||!focusEl) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const m=current.meta[idx];
    const first=current.meta[0];
    const last=current.meta[current.meta.length-1];
    const total=current.meta.length;
    const stage=careerStage(idx,total);

    // season cloud update
    if(lastSeasonIdx!==m.si){
      lastSeasonIdx=m.si;
      updateSeasonCloud(m.season, current.name);
    }

    // trail update only when idx changes
    if(renderFocus._lastIdx!==idx){
      renderFocus._lastIdx=idx;
      updateTrails();
    }

    const delta=((m.share-first.share)*100).toFixed(1);
    const sign=parseFloat(delta)>=0?'+':'';
    const change = current.changes.find(c=>c.idx===idx);
    const progress = `${idx+1}/${total}`;
    const nextChange = current.changes.find(c=>c.idx>idx);
    const nextHint = nextChange? `→ next ${nextChange.to.season} ${nextChange.to.arche}` : `→ final ${last.season}`;
    const leagueTotal = m.total || 450;

    if(change && lastChangeIdx!==idx){
      lastChangeIdx=idx;
      autoPauseUntil=performance.now()+2100;
      const fromPct=(change.from.share*100).toFixed(1), toPct=(change.to.share*100).toFixed(1);
      const dpp=((change.to.share-change.from.share)*100).toFixed(1);
      focusEl.innerHTML = `<span style="background:#F0E442;border:1.5px solid #1A150F;padding:1px 6px;border-radius:6px;margin-right:6px">SHIFT ${progress}</span> ${current.name} • ${stage.toUpperCase()} • ${change.from.season} ${change.from.arche} → <b>${change.to.season} ${change.to.arche}</b> — LEAGUE ${fromPct}%→${toPct}% (${dpp}pp) — ${change.to.desc}`;
      if(metaEl) metaEl.textContent = `ROLE TRANSITION: was asked to play ${change.from.arche.toLowerCase()}, now ${change.to.arche.toLowerCase()}. Historical trail greyed behind shows where he came from; white dots = ${leagueTotal} peers in ${m.season}. Team: — (wiring roster_context, role model gives archetype).`;
    } else {
      const teamPlaceholder='—';
      focusEl.textContent=`● ${current.name} [${progress} ${stage}] — ${m.season} — ${m.arche.toUpperCase()} — Team ${teamPlaceholder} — LEAGUE ${(m.share*100).toFixed(1)}% (${sign}${delta}pp vs ${first.season}) ${nextHint} — PEERS ${leagueTotal} dots`;
      if(metaEl){
        const shiftCount=current.changes.length;
        const lastShift=current.changes.length? `last shift ${current.changes[current.changes.length-1].to.season} ${current.changes[current.changes.length-1].from.arche}→${current.changes[current.changes.length-1].to.arche}` : 'no archetype shift';
        metaEl.textContent = `${total} seasons • ${shiftCount} role shifts • ${lastShift} • ${m.desc} • Grey trail = history, white rings = transition, colored dots = ${m.season} peers, faint background = all ${seasons.length} seasons. Pinch to zoom, drag scrub below.`;
      }
    }

    if(current.currentLabel){
      const labelText = change? `${m.season}: → ${m.arche} [${stage}]` : `${m.season}: ${m.arche} • ${stage} • ${leagueTotal} peers`;
      if(current.currentLabel.userData.lastText!==labelText){
        const c=document.createElement('canvas'); c.width=520; c.height=52;
        const ctx=c.getContext('2d'); ctx.fillStyle=change? '#F0E442' : 'rgba(255,254,247,0.98)'; ctx.beginPath(); ctx.roundRect(4,4,512,44,11); ctx.fill();
        ctx.fillStyle='#1A150F'; ctx.font='800 12px ui-monospace,monospace'; ctx.fillText(labelText,12,29);
        const tex=new THREE.CanvasTexture(c); current.currentLabel.material.map.dispose(); current.currentLabel.material.map=tex; current.currentLabel.userData.lastText=labelText;
      }
    }
    if(scrubFill) scrubFill.style.width=`${(tProg*100).toFixed(1)}%`;
  }
  renderFocus._lastIdx=-1;

  function show(name){
    clear(playerGroup); clear(trailPastGroup); clear(trailFutureGroup); clear(ghostLineGroup);
    renderFocus._lastIdx=-1; lastSeasonIdx=-1;
    const arc=buildArc(name);
    if(!arc){ const n=pickRandom(name); if(n) return show(n); return; }
    playerGroup.add(arc.nodes); playerGroup.add(arc.head); playerGroup.add(arc.tail); playerGroup.add(arc.travellerGroup);
    // add ghost line initial
    ghostLineGroup.add(arc.ghostLine);
    current=arc; tProg=0; lastSwitch=performance.now(); lastChangeIdx=-1;
    used.add(name);
    updateSeasonCloud(arc.meta[0].season, arc.name);
    updateTrails();
    renderFocus();
  }

  show(pool[Math.floor(Math.random()*pool.length)]||'Bo Outlaw');
  setTimeout(()=>{ try{ renderer.render(scene,camera); }catch{} }, 200);
  setTimeout(()=>{ try{ renderer.render(scene,camera); }catch{} }, 650);

  if(scrub){
    let dragging=false;
    function setFromX(clientX){
      const rect=scrub.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
      tProg=p; renderFocus();
      if(current){ const pt=current.curve.getPointAt(Math.max(0.0001,Math.min(0.999,tProg))); if(pt){ current.travellerGroup.position.copy(pt); current.travellerGroup.position.y+=0.05; } }
    }
    scrub.addEventListener('pointerdown',e=>{ dragging=true; try{scrub.setPointerCapture(e.pointerId);}catch{} setFromX(e.clientX); paused=true; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; });
    scrub.addEventListener('pointermove',e=>{ if(dragging) setFromX(e.clientX); });
    scrub.addEventListener('pointerup',()=>{ dragging=false; });
    scrub.addEventListener('click',e=> setFromX(e.clientX));
  }
  if(btnPlay){
    btnPlay.textContent='▶ Play drift (pinch zoom)';
    btnPlay.addEventListener('click',()=>{
      if(paused||embedPaused){ paused=false; embedPaused=false; btnPlay.textContent='❚❚ Pause — pinch/drag to explore'; }
      else{ paused=true; embedPaused=true; btnPlay.textContent='▶ Play drift'; }
    });
  }
  if(btnNext) btnNext.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx+1;j<current.meta.length;j++) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; renderFocus(); const pt=current.curve.getPointAt(tProg); if(pt) current.travellerGroup.position.copy(pt); return; } tProg=1; renderFocus(); });
  if(btnPrev) btnPrev.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx-1;j>=1;j--) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; renderFocus(); const pt=current.curve.getPointAt(tProg); if(pt) current.travellerGroup.position.copy(pt); return; } tProg=0; renderFocus(); });

  // zoom handling
  function onWheel(e){
    e.preventDefault();
    const delta=Math.sign(e.deltaY)*0.55 + e.deltaY*0.0032;
    setZ(camBaseZ + delta);
  }
  canvas.addEventListener('wheel', onWheel, {passive:false});
  let pinchStartDist=0, pinchStartZ=CAM_Z_DEFAULT;
  function distTouches(touches){ const a=touches[0], b=touches[1]; return Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY); }
  canvas.addEventListener('touchstart', (e)=>{
    if(e.touches && e.touches.length===2){
      pinchStartDist=distTouches(e.touches); pinchStartZ=camBaseZ;
    }
  }, {passive:true});
  canvas.addEventListener('touchmove', (e)=>{
    if(e.touches && e.touches.length===2){
      e.preventDefault();
      const d=distTouches(e.touches);
      const ratio=pinchStartDist/(d||1);
      setZ(pinchStartZ * ratio);
    }
  }, {passive:false});

  function onResize(){ const w=canvas.clientWidth,h=canvas.clientHeight; if(w<10||h<10) return; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
  const ro=new ResizeObserver(onResize); ro.observe(canvas); onResize();
  let visible=true; const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; },{threshold:0.02}); io.observe(canvas);

  function tick(){
    requestAnimationFrame(tick);
    if(embedPaused){ return; }
    if(!visible) return;
    const now=performance.now();
    if(!paused && now>autoPauseUntil){
      tProg+=0.00032; if(tProg>1) tProg=0;
    }
    if(current){
      const pt=current.curve.getPointAt(Math.max(0.0001,Math.min(0.999,tProg)));
      if(pt){ current.travellerGroup.position.copy(pt); current.travellerGroup.position.y+=0.06; }
    }
    const t = current? tProg : 0;
    const lookZ = current? current.curve.getPointAt(t).z * 0.62 + (SEASON_SPAN*0.14) : 0;
    const wobbleX=Math.sin(now*0.00010)*1.2;
    const wobbleY=4.0+Math.sin(now*0.00008)*0.26;
    camera.position.x=wobbleX;
    camera.position.y=wobbleY;
    camera.position.z=camBaseZ + Math.sin(now*0.00007)*0.8;
    camera.lookAt(0, -0.2, lookZ);
    renderFocus();
    if(now-lastSwitch>30000&&!paused){ const nxt=pickRandom(current?.name); if(nxt) show(nxt); lastSwitch=now; }
    renderer.render(scene,camera);
  }
  tick();

  return { getFocused(){ if(!current) return null; const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1); return current.meta[idx]; }, show, dispose:()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); } };
}
