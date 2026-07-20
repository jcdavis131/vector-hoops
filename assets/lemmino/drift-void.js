/* drift-void.js v4 — Context-rich all-star career through archetype drift
   - League background: 12k seasons as faint points in archetype-time space (X=archetype, Y=prevalence+jitter, Z=time)
   - 8 faint ribbons = archetype prevalence baseline
   - One random all-star career filament, high-contrast, with archetype-change annotations + traveller
   - Context overlay: how player's archetype move relates to league (prevalence % + league avg)
   - Auto-switch random all-star every 18s, fresh pool
*/
export async function mountDriftVoid(canvas){
  if(!canvas) return;
  const THREE = await import('three');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isLowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency<=4) || window.innerWidth<560;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:false });
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x080A0F,1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080A0F);
  scene.fog = new THREE.FogExp2(0x080A0F,0.026);

  const camera = new THREE.PerspectiveCamera(36, canvas.clientWidth/canvas.clientHeight, 0.1,140);
  camera.position.set(0,1.8,12);

  scene.add(new THREE.AmbientLight(0xFFFFFF,0.64));
  const key=new THREE.DirectionalLight(0xFFE8C8,0.86); key.position.set(6,8,4); scene.add(key);

  const ground=new THREE.Mesh(new THREE.PlaneGeometry(160,160), new THREE.MeshStandardMaterial({ color:0x0C0E14, roughness:0.95 }));
  ground.rotation.x=-Math.PI/2; ground.position.y=-2.4; scene.add(ground);

  let timeData=null, liteData=null;
  try{
    const [tR,lR]=await Promise.all([
      fetch('assets/archetypes_time.json',{cache:'force-cache'}),
      fetch('assets/vectors_search_lite.json',{cache:'force-cache'})
    ]);
    timeData=await tR.json(); liteData=await lR.json();
  }catch(e){ console.warn('drift v4 fetch',e); }

  const seasons=timeData?.prevalence||[];
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const shortNames=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const SEASON_SPAN=30;
  const getZ=(idx)=>(idx/Math.max(1,seasons.length-1))*SEASON_SPAN - SEASON_SPAN/2;
  const seasonIdxByName=new Map(seasons.map((s,i)=>[s.season,i]));

  // League cloud — all 12,966 seasons mapped to X=archetype, Y=prevalence+jitter, Z=time
  const ribbonGroup=new THREE.Group(); scene.add(ribbonGroup);
  const leaguePoints=[];
  const leaguePos=new Float32Array(liteData?.players?.length ? liteData.players.length*3 : 0);
  const leagueCol=new Float32Array(liteData?.players?.length ? liteData.players.length*3 : 0);
  if(liteData?.players){
    for(let i=0;i<liteData.players.length;i++){
      const p=liteData.players[i];
      const si=seasonIdxByName.get(p.s);
      if(si===undefined) continue;
      const share=seasons[si]?.shares[p.c]||0;
      const x=(p.c-3.5)*1.18 + (Math.random()-0.5)*0.42; // spread within archetype column
      const y=-1.8+share*5.2 + Math.random()*0.55;
      const z=getZ(si) + (Math.random()-0.5)*0.22;
      leaguePos[i*3]=x; leaguePos[i*3+1]=y; leaguePos[i*3+2]=z;
      const col=new THREE.Color(OKABE[p.c%8]); col.lerp(new THREE.Color(0x1A1E26),0.42);
      leagueCol[i*3]=col.r; leagueCol[i*3+1]=col.g; leagueCol[i*3+2]=col.b;
    }
  }
  const leagueGeo=new THREE.BufferGeometry();
  leagueGeo.setAttribute('position', new THREE.BufferAttribute(leaguePos,3));
  leagueGeo.setAttribute('color', new THREE.BufferAttribute(leagueCol,3));
  const leagueMat=new THREE.PointsMaterial({ size:isLowEnd?0.06:0.088, vertexColors:true, transparent:true, opacity:0.72, sizeAttenuation:true, depthWrite:false });
  const leagueCloud=new THREE.Points(leagueGeo, leagueMat);
  scene.add(leagueCloud);

  // faint ribbons
  for(let a=0;a<8;a++){
    const pts=[];
    for(let s=0;s<seasons.length;s++){ pts.push(new THREE.Vector3((a-3.5)*1.18, -1.8+(seasons[s].shares[a]||0)*5.2, getZ(s))); }
    const curve=new THREE.CatmullRomCurve3(pts);
    const geo=new THREE.TubeGeometry(curve, seasons.length*2, 0.048, 5, false);
    const col=new THREE.Color(OKABE[a]); col.lerp(new THREE.Color(0x1A1E26),0.62);
    ribbonGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.32, depthWrite:false })));
  }

  // All-star pool
  const byName=new Map();
  for(const p of (liteData?.players||[])){ if(!byName.has(p.n)) byName.set(p.n,[]); byName.get(p.n).push(p); }
  for(const arr of byName.values()) arr.sort((a,b)=>(a.s||'').localeCompare(b.s||''));
  const CURATED=["LeBron James","Stephen Curry","Kevin Durant","Giannis Antetokounmpo","Nikola Jokic","James Harden","Russell Westbrook","Chris Paul","Anthony Davis","Kawhi Leonard","Damian Lillard","Luka Doncic","Jayson Tatum","Joel Embiid","Jimmy Butler","Paul George","Kobe Bryant","Tim Duncan","Dirk Nowitzki","Shaquille O'Neal","Kevin Garnett","Allen Iverson","Steve Nash","Dwyane Wade","Carmelo Anthony","Vince Carter","Tracy McGrady","Ray Allen","Paul Pierce","Manu Ginobili","Tony Parker","Kyrie Irving","Klay Thompson","Donovan Mitchell","Devin Booker","Anthony Edwards","Ja Morant","Zion Williamson","Victor Wembanyama"];
  let pool=CURATED.filter(n=>byName.has(n) && byName.get(n).length>=4);
  if(pool.length<20){ for(const [name,arr] of byName.entries()) if(arr.length>=9 && !pool.includes(name)) pool.push(name); }

  const playerGroup=new THREE.Group(); scene.add(playerGroup);

  function makeSprite(text, bg, fg, w=520, h=56, scale=3.0){
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const ctx=c.getContext('2d'); ctx.clearRect(0,0,w,h);
    ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(4,4,w-8,h-8,10); ctx.fill();
    ctx.fillStyle=fg; ctx.font='900 15px ui-monospace,monospace'; ctx.textAlign='left'; ctx.textBaseline='middle';
    // wrap if long
    const maxLen=54; let txt=text; if(txt.length>maxLen) txt=txt.slice(0,maxLen-2)+'…';
    ctx.fillText(txt,14,h/2+1);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:false });
    const s=new THREE.Sprite(mat); s.scale.set(scale,0.34*scale/3.0*0.9,1); return s;
  }

  function buildArc(name){
    const entries=byName.get(name)||[];
    const pts=[]; const meta=[];
    for(const e of entries){
      const si=seasonIdxByName.get(e.s); if(si===undefined) continue;
      const share=seasons[si]?.shares[e.c]||0;
      const x=(e.c-3.5)*1.18;
      const y=-1.8+share*5.2+0.85;
      const z=getZ(si);
      pts.push(new THREE.Vector3(x,y,z));
      meta.push({ season:e.s, archeIdx:e.c, arche:shortNames[e.c], share, si });
    }
    if(pts.length<3) return null;
    const curve=new THREE.CatmullRomCurve3(pts);
    const tube=new THREE.TubeGeometry(curve, Math.max(pts.length*4,64), 0.095, 10, false);
    const baseColor=new THREE.Color(OKABE[meta[Math.floor(meta.length/2)].archeIdx %8]);
    baseColor.lerp(new THREE.Color(0xFFFFFF),0.12);
    const mat=new THREE.MeshStandardMaterial({ color:baseColor, emissive:baseColor, emissiveIntensity:0.26, roughness:0.42, transparent:true, opacity:0.96 });
    const mesh=new THREE.Mesh(tube,mat);

    const nodes=new THREE.Group();
    const sphGeo=new THREE.SphereGeometry(0.10,10,10);
    for(let i=0;i<pts.length;i++){
      const isChange=i===0 || meta[i].archeIdx!==meta[i-1]?.archeIdx;
      const sz=isChange?0.14:0.08;
      const g=new THREE.SphereGeometry(sz,10,10);
      const m=new THREE.MeshStandardMaterial({ color:isChange?0xFFFFFF:baseColor, emissive:isChange?baseColor:baseColor, emissiveIntensity:isChange?0.6:0.25, transparent:true, opacity:isChange?0.95:0.72 });
      const sph=new THREE.Mesh(g,m); sph.position.copy(pts[i]); nodes.add(sph);
    }

    const traveller=new THREE.Mesh(new THREE.SphereGeometry(0.18,14,14), new THREE.MeshStandardMaterial({ color:0xFFFFFF, emissive:baseColor, emissiveIntensity:0.9 }));

    // change labels
    const labels=new THREE.Group();
    for(let i=1;i<meta.length;i++){
      if(meta[i].archeIdx!==meta[i-1].archeIdx){
        const lab=makeSprite(`${meta[i].season}: → ${meta[i].arche} (league ${(meta[i].share*100).toFixed(1)}%)`, 'rgba(255,254,247,0.96)', '#1A150F', 460, 44, 1.9);
        lab.position.set(pts[i].x+0.55, pts[i].y+0.32, pts[i].z);
        labels.add(lab);
      }
    }
    const head=makeSprite(`${name} — ${entries[0]?.s} → ${entries[entries.length-1]?.s} — ${entries.length} seasons`, '#1A150F', '#FFFEF7', 560, 56, 2.9);
    if(pts.length) head.position.set(pts[0].x-0.2, pts[0].y+0.70, pts[0].z);
    const tail=makeSprite(`${name} now: ${meta[meta.length-1].arche}`, baseColor.getStyle(), '#1A150F', 380, 48, 2.2);
    if(pts.length) tail.position.set(pts[pts.length-1].x+0.5, pts[pts.length-1].y+0.45, pts[pts.length-1].z);

    return { name, entries, pts, curve, mesh, nodes, labels, head, tail, traveller, meta, baseColor };
  }

  function clearGroup(g){ while(g.children.length){ const c=g.children[0]; g.remove(c); if(c.geometry) c.geometry.dispose(); } }

  let current=null, tProg=0, lastSwitch=performance.now(), used=new Set();
  function pickRandom(exclude){
    let cands=pool.filter(n=>n!==exclude && !used.has(n));
    if(cands.length<5){ used.clear(); cands=pool.filter(n=>n!==exclude); }
    return cands[Math.floor(Math.random()*cands.length)];
  }
  function show(name){
    clearGroup(playerGroup);
    const arc=buildArc(name);
    if(!arc){ const n=pickRandom(name); if(n) return show(n); return; }
    playerGroup.add(arc.mesh); playerGroup.add(arc.nodes); playerGroup.add(arc.labels); playerGroup.add(arc.head); playerGroup.add(arc.tail); playerGroup.add(arc.traveller);
    current=arc; tProg=0; lastSwitch=performance.now(); used.add(name);
    const focusEl=document.getElementById('lemmino-drift-focus');
    if(focusEl) focusEl.textContent=`● ${arc.name} — ${arc.entries[0]?.s} → ${arc.entries[arc.entries.length-1]?.s} — archetype path vs league`;
    const metaEl=document.getElementById('lemmino-drift-meta');
    if(metaEl){
      const changes=arc.meta.filter((m,i)=>i>0 && m.archeIdx!==arc.meta[i-1].archeIdx).length;
      metaEl.textContent=`${arc.name} changed archetype ${changes}x — dots = rest of league that season — white rim = archetype change — auto-loop 18s`;
    }
  }

  show(pool[Math.floor(Math.random()*pool.length)]||"LeBron James");

  function onResize(){ const w=canvas.clientWidth,h=canvas.clientHeight; if(w<10||h<10) return; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
  const ro=new ResizeObserver(onResize); ro.observe(canvas); onResize();
  let visible=true; const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; },{threshold:0.01}); io.observe(canvas);

  let t0=performance.now();
  function animate(){
    requestAnimationFrame(animate);
    if(!visible) return;
    const now=performance.now(), t=(now-t0)*0.001;
    const flight=Math.sin(t*0.06)*(SEASON_SPAN*0.28);
    camera.position.z=11.8+flight*0.08;
    camera.position.x=Math.sin(t*0.04)*0.9;
    camera.position.y=1.9+Math.sin(t*0.03)*0.16;
    const lookZ=-flight*0.22;
    camera.lookAt((current? current.pts[Math.floor(current.pts.length/2)]?.x||0 : 0)*0.22, 0.1, lookZ);

    if(current){
      tProg+=0.00038; if(tProg>1) tProg=0;
      const pt=current.curve.getPointAt(tProg);
      if(pt){ current.traveller.position.copy(pt); current.traveller.position.y+=0.04; }
      current.mesh.material.emissiveIntensity=0.24+Math.sin(t*1.1)*0.06;
      // subtle league cloud rotation
      leagueCloud.rotation.y=Math.sin(t*0.02)*0.04;
    }
    if(now-lastSwitch>18000){ const nxt=pickRandom(current?.name); if(nxt) show(nxt); }
    renderer.render(scene,camera);
  }
  animate();

  function getFocused(){
    if(!current) return { player:'—', season:'—', label:'—', share:0 };
    const idx=Math.floor(tProg*current.meta.length);
    const m=current.meta[Math.min(idx,current.meta.length-1)];
    return { player:current.name, season:m.season, label:m.arche, arche:m.arche, share:m.share, idx:m.archeIdx };
  }

  return { renderer, scene, camera, getFocused, show, dispose:()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); } };
}
