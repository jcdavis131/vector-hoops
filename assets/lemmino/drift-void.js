/* drift-void.js v6 — story clarity + zoomed out for recent years
   User feedback: bones ok but hard to follow narrative + can't see most current years (too zoomed in)
   Fix:
   - Zoom out: cam 15.5->24, FOV 34->44, SPAN 32->38, lookAt recent 70% biased, ground 180->260
   - Story: single current label following traveller, not 6 floating pills; head/tail only permanent
   - Role changes: big chapter card pausing 1.8s with league pp explanation, white ring + toast
   - Recent years visible: tick labels every 2 seasons (was 3), last 6 seasons always labeled bold, tail at end visible
   - Declutter: league cloud 0.62->0.32, ribbons 0.26->0.12, tube thicker 0.105->0.14, nodes smaller
   - Narrative panel: focus + meta combined, shows progress 3/11 and next shift hint
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
  scene.fog=new THREE.FogExp2(0x080A0F, 0.012);

  const camera=new THREE.PerspectiveCamera(44, 1, 0.1, 280);
  camera.position.set(0,3.8,24);

  scene.add(new THREE.AmbientLight(0xFFFFFF,0.75));
  const key=new THREE.DirectionalLight(0xFFE8C8,0.95); key.position.set(6,9,5); scene.add(key);
  const fill=new THREE.DirectionalLight(0xA8C4FF,0.35); fill.position.set(-5,3,-3); scene.add(fill);

  const ground=new THREE.Mesh(new THREE.PlaneGeometry(260,260), new THREE.MeshStandardMaterial({ color:0x0C0E14, roughness:0.96 }));
  ground.rotation.x=-Math.PI/2; ground.position.y=-2.9; scene.add(ground);

  let timeData=null, liteData=null;
  try{
    const [tR,lR]=await Promise.all([
      fetch('assets/archetypes_time.json?v=13',{cache:'no-store'}),
      fetch('assets/vectors_search_lite.json?v=13',{cache:'no-store'})
    ]);
    timeData=await tR.json(); liteData=await lR.json();
  }catch(e){ console.warn('drift v6 fetch',e); return; }

  const seasons=timeData?.prevalence||[];
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#FFFEF7'];
  const shortNames=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const SEASON_SPAN=38; // was 32, more breathing room for recent years
  const getZ=(idx)=>(idx/Math.max(1,seasons.length-1))*SEASON_SPAN - SEASON_SPAN/2;
  const seasonIdx=new Map(seasons.map((s,i)=>[s.season,i]));

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
    const col=new THREE.Color(OKABE[p.c%8]); col.lerp(new THREE.Color(0x151821),0.56);
    colors[i*3]=col.r; colors[i*3+1]=col.g; colors[i*3+2]=col.b;
  }
  const leagueGeo=new THREE.BufferGeometry();
  leagueGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  leagueGeo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const leagueMat=new THREE.PointsMaterial({ size:isLowEnd?0.055:0.082, vertexColors:true, transparent:true, opacity:0.32, sizeAttenuation:true, depthWrite:false });
  leagueGroup.add(new THREE.Points(leagueGeo, leagueMat));

  const ribbonGroup=new THREE.Group(); scene.add(ribbonGroup);
  for(let a=0;a<8;a++){
    const pts=[]; for(let s=0;s<seasons.length;s++) pts.push(new THREE.Vector3((a-3.5)*1.20, -2.1+(seasons[s].shares[a]||0)*5.6, getZ(s)));
    const curve=new THREE.CatmullRomCurve3(pts);
    const geo=new THREE.TubeGeometry(curve, seasons.length*2, isLowEnd?0.028:0.038, 6, false);
    const col=new THREE.Color(OKABE[a]); col.lerp(new THREE.Color(0x12141A),0.62);
    ribbonGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.12, depthWrite:false })));
  }
  function makeTickLabel(text,x,z,bold=false){
    const c=document.createElement('canvas'); c.width=200; c.height=42;
    const ctx=c.getContext('2d');
    ctx.fillStyle= bold? 'rgba(255,254,247,0.98)' : 'rgba(255,254,247,0.88)';
    ctx.beginPath(); ctx.roundRect(2,4,196,34,8); ctx.fill();
    ctx.fillStyle= bold? '#1A150F' : '#2A241E';
    ctx.font= bold? '900 13px ui-monospace,monospace' : '700 12px ui-monospace,monospace';
    ctx.textAlign='center'; ctx.fillText(text,100,25);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:false });
    const s=new THREE.Sprite(mat); s.scale.set(bold?1.05:0.85, bold?0.22:0.17,1); s.position.set(x,-2.75,z); return s;
  }
  const tickGroup=new THREE.Group(); scene.add(tickGroup);
  const recentThreshold = seasons.length - 8;
  seasons.forEach((s,i)=>{
    const isRecent = i>=recentThreshold;
    const every = isRecent? 1 : 2; // recent years every season, older every 2
    if(i%every===0){
      const t=makeTickLabel(s.season,-5.8,getZ(i), isRecent);
      tickGroup.add(t);
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4.9,-2.55,getZ(i)), new THREE.Vector3(5.4,-2.55,getZ(i))]), new THREE.LineBasicMaterial({ color:0xFFFFFF, transparent:true, opacity: isRecent?0.10:0.05 }));
      tickGroup.add(line);
    }
  });

  const byName=new Map();
  for(const p of liteData.players){ if(!byName.has(p.n)) byName.set(p.n,[]); byName.get(p.n).push(p); }
  for(const arr of byName.values()) arr.sort((a,b)=> (a.s||'').localeCompare(b.s||''));
  const CURATED=["LeBron James","Stephen Curry","Kevin Durant","Giannis Antetokounmpo","Nikola Jokic","James Harden","Russell Westbrook","Chris Paul","Kawhi Leonard","Damian Lillard","Luka Doncic","Jayson Tatum","Joel Embiid","Kobe Bryant","Tim Duncan","Dirk Nowitzki","Shaquille O'Neal","Kevin Garnett","Steve Nash","Dwyane Wade","Vince Carter","Chris Bosh","Paul Pierce","Anthony Edwards","Victor Wembanyama","Bo Outlaw"];
  let pool=CURATED.filter(n=>byName.has(n)&&byName.get(n).length>=4);
  while(pool.length<36){ for(const [nm,arr] of byName.entries()) if(arr.length>=10&&!pool.includes(nm)) pool.push(nm); if(pool.length>=50) break; }

  const playerGroup=new THREE.Group(); scene.add(playerGroup);

  function makePill(text,bg,fg,w=520,h=52,scale=2.2){
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const ctx=c.getContext('2d'); ctx.clearRect(0,0,w,h);
    ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(4,4,w-8,h-8,10); ctx.fill();
    ctx.fillStyle=fg; ctx.font='800 13px ui-monospace,monospace'; ctx.textAlign='left'; ctx.textBaseline='middle';
    let txt=text; if(txt.length>68) txt=txt.slice(0,66)+'…';
    ctx.fillText(txt,12,h/2+1);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:false });
    const s=new THREE.Sprite(mat); s.scale.set(scale, scale*0.12,1); return s;
  }

  function buildArc(name){
    const entries=byName.get(name)||[];
    const pts=[], meta=[];
    for(const e of entries){
      const si=seasonIdx.get(e.s); if(si===undefined) continue;
      const share=seasons[si]?.shares[e.c]||0;
      pts.push(new THREE.Vector3((e.c-3.5)*1.20, -2.1+share*5.6+1.05, getZ(si)));
      meta.push({ season:e.s, archeIdx:e.c, arche:shortNames[e.c], share, si, total:seasons[si]?.total||0 });
    }
    if(pts.length<3) return null;
    const curve=new THREE.CatmullRomCurve3(pts);
    const tube=new THREE.TubeGeometry(curve, Math.max(pts.length*8,100), 0.14, 12, false);
    const mid = meta[Math.floor(meta.length/2)];
    const baseColor=new THREE.Color(OKABE[mid.archeIdx%8]); baseColor.lerp(new THREE.Color(0xFFFFFF),0.08);
    const mesh=new THREE.Mesh(tube, new THREE.MeshStandardMaterial({ color:baseColor, emissive:baseColor, emissiveIntensity:0.32, roughness:0.34, transparent:true, opacity:0.96 }));

    const nodes=new THREE.Group();
    for(let i=0;i<pts.length;i++){
      const isChange=i>0&&meta[i].archeIdx!==meta[i-1].archeIdx;
      const g=new THREE.SphereGeometry(isChange?0.16:0.07,12,12);
      const m=new THREE.MeshStandardMaterial({ color:isChange?0xFFFFFF:baseColor, emissive:baseColor, emissiveIntensity:isChange?0.85:0.28, transparent:true, opacity:isChange?1:0.75 });
      const sph=new THREE.Mesh(g,m); sph.position.copy(pts[i]); nodes.add(sph);
      if(isChange){
        const ring=new THREE.Mesh(new THREE.RingGeometry(0.20,0.26,20), new THREE.MeshBasicMaterial({ color:0xFFFFFF, transparent:true, opacity:0.92, side:THREE.DoubleSide }));
        ring.position.copy(pts[i]); ring.position.y+=0.012; ring.rotation.x=Math.PI/2; nodes.add(ring);
      }
    }

    // only head and tail permanent, plus one current label that follows traveller
    const head=makePill(`${name} — ${entries[0]?.s} → ${entries[entries.length-1]?.s} • ${entries.length} seasons`, '#1A150F','#FFFEF7', isMobile? 440: 640, 56, isMobile? 2.0: 2.9);
    if(pts.length) head.position.set(pts[0].x-0.2, pts[0].y+1.25, pts[0].z-0.3);

    const tail=makePill(`${name.split(' ').pop()} now: ${meta[meta.length-1].arche} • LEAGUE ${(meta[meta.length-1].share*100).toFixed(1)}%`, baseColor.getStyle(), '#081018', isMobile? 360: 500, 52, isMobile? 1.7: 2.35);
    if(pts.length) tail.position.set(pts[pts.length-1].x+0.7, pts[pts.length-1].y+0.95, pts[pts.length-1].z+0.4);

    const currentLabel=makePill(`${meta[0].season}: ${meta[0].arche}`, 'rgba(255,254,247,0.98)','#1A150F', 420, 48, 1.9);

    const traveller=new THREE.Mesh(new THREE.SphereGeometry(0.22,16,16), new THREE.MeshStandardMaterial({ color:0xFFFFFF, emissive:baseColor, emissiveIntensity:1.0 }));
    const travellerHalo=new THREE.Mesh(new THREE.SphereGeometry(0.38,12,12), new THREE.MeshBasicMaterial({ color:baseColor, transparent:true, opacity:0.18 }));
    const travellerGroup=new THREE.Group(); travellerGroup.add(traveller); travellerGroup.add(travellerHalo); travellerGroup.add(currentLabel);
    currentLabel.position.set(0,0.85,0);

    // precompute changes for chaptering
    const changes=[];
    for(let i=1;i<meta.length;i++) if(meta[i].archeIdx!==meta[i-1].archeIdx) changes.push({ idx:i, from:meta[i-1], to:meta[i] });

    return { name, entries, pts, meta, curve, mesh, nodes, head, tail, currentLabel, traveller, travellerGroup, baseColor, changes };
  }

  function clear(g){ while(g.children.length){ const c=g.children[0]; g.remove(c); if(c.geometry) c.geometry.dispose(); if(c.material){ if(c.material.map) c.material.map.dispose(); c.material.dispose(); } } }

  let current=null, tProg=0, paused=false, used=new Set(), lastSwitch=performance.now(), autoPauseUntil=0, lastChangeIdx=-1;
  function pickRandom(ex){ let cands=pool.filter(n=>n!==ex&&!used.has(n)); if(cands.length<5){ used.clear(); cands=pool.filter(n=>n!==ex); } return cands[Math.floor(Math.random()*cands.length)]; }

  const focusEl=document.getElementById('lemmino-drift-focus');
  const metaEl=document.getElementById('lemmino-drift-meta');
  const scrub=document.getElementById('drift-scrub');
  const scrubFill=document.getElementById('drift-scrub-fill');
  const btnPlay=document.getElementById('drift-play');
  const btnNext=document.getElementById('drift-next');
  const btnPrev=document.getElementById('drift-prev');

  function renderFocus(){
    if(!current||!focusEl) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const m=current.meta[idx]; const first=current.meta[0]; const last=current.meta[current.meta.length-1];
    const delta=((m.share-first.share)*100).toFixed(1); const sign=parseFloat(delta)>=0?'+':'';
    const change = current.changes.find(c=>c.idx===idx);
    const progress = `${idx+1}/${current.meta.length}`;
    const nextChange = current.changes.find(c=>c.idx>idx);
    const nextHint = nextChange? ` → next shift ${nextChange.to.season} ${nextChange.to.arche}` : ` → final ${last.season}`;

    if(change && lastChangeIdx!==idx){
      lastChangeIdx=idx;
      autoPauseUntil=performance.now()+1800;
      // chapter flash
      focusEl.innerHTML = `<span style="background:#F0E442;border:1.5px solid #1A150F;padding:1px 6px;border-radius:6px;margin-right:6px">SHIFT</span> ${current.name} — ${change.from.arche} → <b>${change.to.arche}</b> in ${change.to.season} — LEAGUE ${(change.to.share*100).toFixed(1)}% (${sign}${((change.to.share-change.from.share)*100).toFixed(1)}pp)`;
      if(metaEl) metaEl.textContent = `${change.to.arche.toUpperCase()} became more common — that role grew from ${(change.from.share*100).toFixed(1)}% to ${(change.to.share*100).toFixed(1)}% league-wide`;
    } else if(!change){
      focusEl.textContent=`● ${current.name} — ${m.season} [${progress}] — ${m.arche.toUpperCase()} — LEAGUE ${(m.share*100).toFixed(1)}% (${sign}${delta}pp vs ${first.season})${nextHint}`;
      if(metaEl){
        const totalStr = `${current.entries.length} seasons • ${current.changes.length} role shifts • ${m.total||''} players in ${m.season} • white ring = shift`;
        metaEl.textContent = totalStr;
      }
    }

    // current label near traveller
    if(current.currentLabel){
      const labelText = change? `${m.season}: → ${m.arche}` : `${m.season}: ${m.arche}`;
      // update texture if changed
      if(current.currentLabel.userData.lastText!==labelText){
        const c=document.createElement('canvas'); c.width=420; c.height=48;
        const ctx=c.getContext('2d'); ctx.fillStyle='rgba(255,254,247,0.98)'; ctx.beginPath(); ctx.roundRect(4,4,412,40,10); ctx.fill();
        ctx.fillStyle='#1A150F'; ctx.font='800 13px ui-monospace,monospace'; ctx.fillText(labelText,12,27);
        const tex=new THREE.CanvasTexture(c); current.currentLabel.material.map.dispose(); current.currentLabel.material.map=tex; current.currentLabel.userData.lastText=labelText;
      }
    }

    if(scrubFill) scrubFill.style.width=`${(tProg*100).toFixed(1)}%`;
  }

  function show(name){
    clear(playerGroup);
    const arc=buildArc(name);
    if(!arc){ const n=pickRandom(name); if(n) return show(n); return; }
    playerGroup.add(arc.mesh); playerGroup.add(arc.nodes); playerGroup.add(arc.head); playerGroup.add(arc.tail); playerGroup.add(arc.travellerGroup);
    current=arc; tProg=0; lastSwitch=performance.now(); lastChangeIdx=-1; used.add(name);
    renderFocus();
  }

  show(pool[Math.floor(Math.random()*pool.length)]||'Bo Outlaw');

  if(scrub){
    let dragging=false;
    function setFromX(clientX){
      const rect=scrub.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
      tProg=p; renderFocus(); if(current){ const pt=current.curve.getPointAt(Math.max(0.0001,Math.min(0.999,tProg))); if(pt){ current.travellerGroup.position.copy(pt); current.travellerGroup.position.y+=0.05; } }
    }
    scrub.addEventListener('pointerdown',e=>{ dragging=true; try{scrub.setPointerCapture(e.pointerId);}catch{} setFromX(e.clientX); paused=true; if(btnPlay) btnPlay.textContent='▶'; });
    scrub.addEventListener('pointermove',e=>{ if(dragging) setFromX(e.clientX); });
    scrub.addEventListener('pointerup',()=>{ dragging=false; });
    scrub.addEventListener('click',e=> setFromX(e.clientX));
  }
  if(btnPlay) btnPlay.addEventListener('click',()=>{ paused=!paused; btnPlay.textContent=paused?'▶':'❚❚'; });
  if(btnNext) btnNext.addEventListener('click',()=>{ if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx+1;j<current.meta.length;j++) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; renderFocus(); return; } tProg=1; renderFocus(); });
  if(btnPrev) btnPrev.addEventListener('click',()=>{ if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx-1;j>=1;j--) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; renderFocus(); return; } tProg=0; renderFocus(); });

  function onResize(){ const w=canvas.clientWidth,h=canvas.clientHeight; if(w<10||h<10) return; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
  const ro=new ResizeObserver(onResize); ro.observe(canvas); onResize();
  let visible=true; const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; },{threshold:0.02}); io.observe(canvas);

  function tick(){
    requestAnimationFrame(tick);
    if(!visible) return;
    const now=performance.now();
    if(!paused && now>autoPauseUntil){
      tProg+=0.00036; if(tProg>1) tProg=0;
    }
    if(current){
      const pt=current.curve.getPointAt(Math.max(0.0001,Math.min(0.999,tProg)));
      if(pt){ current.travellerGroup.position.copy(pt); current.travellerGroup.position.y+=0.06; }
    }
    // zoomed out follow — bias toward recent years but always show full
    const t = current? tProg : 0;
    const lookZ = current? current.curve.getPointAt(t).z * 0.65 + (SEASON_SPAN*0.18) : 0; // bias to recent
    camera.position.x=Math.sin(now*0.00010)*1.4;
    camera.position.y=3.9+Math.sin(now*0.00008)*0.22;
    camera.position.z=24 + Math.sin(now*0.00007)*0.6; // farther than 15.5
    camera.lookAt(0, -0.2, lookZ);
    renderFocus();
    if(now-lastSwitch>26000&&!paused){ const nxt=pickRandom(current?.name); if(nxt) show(nxt); lastSwitch=now; }
    renderer.render(scene,camera);
  }
  tick();

  return { getFocused(){ if(!current) return null; const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1); return current.meta[idx]; }, show, dispose:()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); } };
}
