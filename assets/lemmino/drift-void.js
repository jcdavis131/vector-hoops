/* drift-void.js v3 — Random all-star career arcs through game shift
   One fresh all-star every ~14s, loop forever. Background ribbons = archetype prevalence.
   Shows how game shifted + how one career rode it. Always feels fresh.
*/
export async function mountDriftVoid(canvas){
  if(!canvas) return;
  const THREE = await import('three');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isLowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency<=4) || window.innerWidth<560;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x080A0F,1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080A0F);
  scene.fog = new THREE.FogExp2(0x080A0F,0.028);

  const camera = new THREE.PerspectiveCamera(36, canvas.clientWidth/canvas.clientHeight, 0.1,120);
  camera.position.set(0,2.0,11.5);

  scene.add(new THREE.AmbientLight(0xFFFFFF,0.62));
  const key=new THREE.DirectionalLight(0xFFE7C2,0.88); key.position.set(6,8,4); scene.add(key);
  const rim=new THREE.DirectionalLight(0x8AB4FF,0.42); rim.position.set(-6,3,-6); scene.add(rim);

  const ground=new THREE.Mesh(new THREE.PlaneGeometry(120,120), new THREE.MeshStandardMaterial({ color:0x0C0E14, roughness:0.94, metalness:0.06 }));
  ground.rotation.x=-Math.PI/2; ground.position.y=-2.2; scene.add(ground);

  let timeData=null, liteData=null;
  try{
    const [tR,lR]=await Promise.all([
      fetch('assets/archetypes_time.json',{cache:'force-cache'}),
      fetch('assets/vectors_search_lite.json',{cache:'force-cache'})
    ]);
    timeData=await tR.json(); liteData=await lR.json();
  }catch(e){ console.warn('drift v3 fetch',e); }

  const seasons=timeData?.prevalence||[];
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const shortNames=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const SEASON_SPAN=28;
  const getZ=(idx)=>(idx/Math.max(1,seasons.length-1))*SEASON_SPAN - SEASON_SPAN/2;
  const seasonIdxByName=new Map(seasons.map((s,i)=>[s.season,i]));

  // Background ribbons - very faint
  const ribbonGroup=new THREE.Group(); scene.add(ribbonGroup);
  for(let a=0;a<8;a++){
    const pts=[];
    for(let s=0;s<seasons.length;s++){
      const share=seasons[s].shares[a]||0;
      pts.push(new THREE.Vector3((a-3.5)*1.18, -1.8+share*5.2, getZ(s)));
    }
    const curve=new THREE.CatmullRomCurve3(pts); curve.tension=0.28;
    const geo=new THREE.TubeGeometry(curve, seasons.length*2, 0.045, isLowEnd?5:6, false);
    const col=new THREE.Color(OKABE[a]); col.lerp(new THREE.Color(0x2A2E36),0.72);
    const mat=new THREE.MeshStandardMaterial({ color:col, transparent:true, opacity:0.20, depthWrite:false, roughness:0.9 });
    ribbonGroup.add(new THREE.Mesh(geo,mat));
  }

  // Build all-star pool
  const litePlayers=liteData?.players||[];
  const byName=new Map();
  for(const p of litePlayers){ if(!byName.has(p.n)) byName.set(p.n,[]); byName.get(p.n).push(p); }
  for(const arr of byName.values()) arr.sort((a,b)=>(a.s||'').localeCompare(b.s||''));

  const CURATED=[
    "LeBron James","Stephen Curry","Kevin Durant","Giannis Antetokounmpo","Nikola Jokic","James Harden","Russell Westbrook","Chris Paul","Anthony Davis","Kawhi Leonard","Damian Lillard","Luka Doncic","Jayson Tatum","Joel Embiid","Jimmy Butler","Paul George","Kobe Bryant","Tim Duncan","Dirk Nowitzki","Shaquille O'Neal","Kevin Garnett","Allen Iverson","Steve Nash","Dwyane Wade","Carmelo Anthony","Vince Carter","Tracy McGrady","Dwight Howard","Chris Bosh","Ray Allen","Paul Pierce","Manu Ginobili","Tony Parker","Kyrie Irving","Klay Thompson","Karl-Anthony Towns","Donovan Mitchell","Devin Booker","Anthony Edwards","Victor Wembanyama","LaMelo Ball","Ja Morant","Zion Williamson","DeMar DeRozan","Khris Middleton","Rudy Gobert"
  ];
  let pool=CURATED.filter(n=>byName.has(n) && byName.get(n).length>=4);
  // fill with long-career players if curated too small
  if(pool.length<20){
    for(const [name,arr] of byName.entries()){
      if(arr.length>=8 && !pool.includes(name)) pool.push(name);
      if(pool.length>80) break;
    }
  }

  const playerGroup=new THREE.Group(); scene.add(playerGroup);

  function makeSprite(text, color='#FFFEF7', bg='rgba(10,12,16,0.88)'){
    const c=document.createElement('canvas'); c.width=560; c.height=64;
    const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(4,4,c.width-8,c.height-8,12); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.14)'; ctx.lineWidth=1.2; ctx.stroke();
    ctx.fillStyle=color; ctx.font='900 18px ui-monospace,monospace'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(text,18,c.height/2+1);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:false });
    const s=new THREE.Sprite(mat); s.scale.set(3.2,0.36,1); return s;
  }

  function buildArc(name, color){
    const entries=byName.get(name)||[];
    const pts=[]; const seasonsForLabel=[];
    for(const e of entries){
      const si=seasonIdxByName.get(e.s); if(si===undefined) continue;
      const share=seasons[si]?.shares[e.c]||0;
      const z=getZ(si);
      const x=(e.c-3.5)*1.18 + (Math.random()-0.5)*0.06; // slight jitter
      const y=-1.8+share*5.2 + 0.72 + Math.sin(si*0.22)*0.05;
      pts.push(new THREE.Vector3(x,y,z));
      seasonsForLabel.push({ s:e.s, c:e.c, si });
    }
    if(pts.length<3) return null;
    const curve=new THREE.CatmullRomCurve3(pts);
    const tube=new THREE.TubeGeometry(curve, Math.max(pts.length*3, 48), 0.092, 10, false);
    const mat=new THREE.MeshStandardMaterial({
      color:new THREE.Color(color), emissive:new THREE.Color(color), emissiveIntensity:0.32,
      roughness:0.45, metalness:0.12, transparent:true, opacity:0.96
    });
    const mesh=new THREE.Mesh(tube,mat);

    const nodes=new THREE.Group();
    const sphGeo=new THREE.SphereGeometry(0.11,12,12);
    for(let i=0;i<pts.length;i++){
      const m=new THREE.MeshStandardMaterial({ color, emissive:color, emissiveIntensity:0.35, transparent:true, opacity:0.92 });
      const sph=new THREE.Mesh(sphGeo,m); sph.position.copy(pts[i]); nodes.add(sph);
    }

    const headSpr=makeSprite(`${name} — ${entries[0]?.s} → ${entries[entries.length-1]?.s}  •  ${pts.length} seasons`, color, 'rgba(26,21,15,0.92)');
    const tailSpr=makeSprite(`${name}`, color, 'rgba(255,254,247,0.96)');
    if(pts.length){
      headSpr.position.set(pts[0].x-0.2, pts[0].y+0.55, pts[0].z);
      tailSpr.position.set(pts[pts.length-1].x+0.45, pts[pts.length-1].y+0.35, pts[pts.length-1].z);
    }

    // traversal dot
    const traveller=new THREE.Mesh(new THREE.SphereGeometry(0.18,14,14), new THREE.MeshStandardMaterial({ color:0xFFFFFF, emissive:color, emissiveIntensity:0.8 }));
    
    return { name, entries, pts, curve, mesh, nodes, headSpr, tailSpr, traveller, color, seasonsForLabel };
  }

  function clearGroup(g){
    while(g.children.length>0){ const c=g.children[0]; g.remove(c); if(c.geometry) c.geometry.dispose(); if(c.material){ if(Array.isArray(c.material)) c.material.forEach(m=>m.dispose&&m.dispose()); else c.material.dispose(); } }
  }

  let current=null;
  let tProgress=0;
  let lastPick=0;
  let used=new Set();

  function pickRandom(exclude){
    let candidates=pool.filter(n=>n!==exclude && !used.has(n));
    if(candidates.length<6) { used.clear(); candidates=pool.filter(n=>n!==exclude); }
    return candidates[Math.floor(Math.random()*candidates.length)];
  }

  function showPlayer(name){
    clearGroup(playerGroup);
    const color=OKABE[Math.floor(Math.random()*OKABE.length)];
    const arc=buildArc(name, color);
    if(!arc){ const alt=pickRandom(name); if(alt) return showPlayer(alt); return; }
    playerGroup.add(arc.mesh); playerGroup.add(arc.nodes); playerGroup.add(arc.headSpr); playerGroup.add(arc.tailSpr); playerGroup.add(arc.traveller);
    current=arc; tProgress=0; lastPick=performance.now();
    const focusEl=document.getElementById('lemmino-drift-focus');
    if(focusEl) focusEl.textContent=`● ${arc.name} — ${arc.entries[0]?.s} → ${arc.entries[arc.entries.length-1]?.s} — ${arc.entries.length} seasons — career through archetype shift`;
    used.add(name);
    return arc;
  }

  // initial
  const first=pool[Math.floor(Math.random()*pool.length)] || "LeBron James";
  showPlayer(first);

  function onResize(){
    const w=canvas.clientWidth, h=canvas.clientHeight;
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
  }
  const ro=new ResizeObserver(onResize); ro.observe(canvas); onResize();
  let visible=true; const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; },{threshold:0.01}); io.observe(canvas);

  let t0=performance.now();
  function animate(){
    requestAnimationFrame(animate);
    if(!visible) return;
    const now=performance.now();
    const t=(now-t0)*0.001;
    const dt=Math.min(0.05, (now-lastPick)/1000);

    // camera slow dolly following overall time
    const flight=Math.sin(t*0.08)*(SEASON_SPAN*0.32);
    camera.position.z=11.2+flight*0.10;
    camera.position.x=Math.sin(t*0.05)*0.8 + (current? current.pts[Math.floor(current.pts.length/2)].x*0.12 : 0);
    camera.position.y=2.2+Math.sin(t*0.04)*0.18;
    const lookZ=-flight*0.28;
    camera.lookAt((current? current.pts[Math.floor(tProgress*current.pts.length)]?.x||0 : 0)*0.4, 0.15, lookZ);

    // move traveller along curve
    if(current){
      tProgress += 0.00042 * (prefersReduced?0.25:1); // slow loop along career
      if(tProgress>1) tProgress=0;
      const pt=current.curve.getPointAt(tProgress);
      const tan=current.curve.getTangentAt(tProgress);
      if(pt){ current.traveller.position.copy(pt); current.traveller.position.y+=0.02; }
      if(tan) current.traveller.lookAt(pt.clone().add(tan));
      current.mesh.material.emissiveIntensity=0.28 + Math.sin(t*1.2)*0.07;
    }

    // auto switch every 14s
    if(now-lastPick>14000){
      const next=pickRandom(current?.name);
      if(next) showPlayer(next);
    }

    renderer.render(scene,camera);
  }
  animate();

  function getFocused(){
    if(!current) return { label: shortNames[0], season:'1996-97', share:0, player:'—' };
    const idx=Math.floor(tProgress*current.seasonsForLabel.length);
    const info=current.seasonsForLabel[Math.min(idx, current.seasonsForLabel.length-1)];
    const s=seasons[info?.si||0];
    const share=s? s.shares[info.c] : 0;
    return { label: shortNames[info?.c||0], season: info?.s||'—', share, player: current.name, arche: shortNames[info?.c||0] };
  }

  return { renderer, scene, camera, getFocused, showPlayer, dispose:()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); } };
}
