/* drift-void.js v2 — Combined: Archetype shift + Player career arcs
   Goal: show game shifted (8 ribbons) + player arcs (4 iconic careers) without busy
   Clean, readable, documentary
   Data: archetypes_time.json + vectors_search_lite.json
*/
export async function mountDriftVoid(canvas) {
  if (!canvas) return;
  const THREE = await import('three');

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isLowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency<=4) || window.innerWidth<560;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0A0C10);
  scene.fog = new THREE.FogExp2(0x0A0C10, 0.030);

  const camera = new THREE.PerspectiveCamera(36, canvas.clientWidth/canvas.clientHeight, 0.1, 120);
  camera.position.set(0, 2.2, 12);

  const amb = new THREE.AmbientLight(0x1E2330, 0.58);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xFFE9C7, 0.96);
  key.position.set(6,8,4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8AB4FF, 0.52);
  rim.position.set(-6,3,-6);
  scene.add(rim);
  const spot = new THREE.SpotLight(0xF0E442, 1.35, 28, Math.PI*0.24, 0.28, 1.2);
  spot.position.set(0,6,8);
  spot.target.position.set(0,0,-8);
  scene.add(spot); scene.add(spot.target);

  const groundGeo = new THREE.PlaneGeometry(120,120);
  const groundMat = new THREE.MeshStandardMaterial({ color:0x0C0E14, roughness:0.94, metalness:0.06, transparent:true, opacity:0.88 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI/2; ground.position.y = -2.2;
  scene.add(ground);

  let timeData = null, liteData = null;
  try{
    const [tR, lR] = await Promise.all([
      fetch('assets/archetypes_time.json',{cache:'force-cache'}),
      fetch('assets/vectors_search_lite.json',{cache:'force-cache'})
    ]);
    timeData = await tR.json();
    liteData = await lR.json();
  } catch(e){ console.warn('drift combined fetch fail', e); }

  const seasons = timeData?.prevalence || [];
  const OKABE = ['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const shortNames = ["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const fullNames = timeData?.globalArchetypes || shortNames;

  const SEASON_SPAN = 28;
  const getZ = (idx) => (idx / Math.max(1,seasons.length-1))*SEASON_SPAN - SEASON_SPAN/2;
  const seasonIndexByName = new Map(seasons.map((s,i)=>[s.season,i]));

  // 1) ARCHETYPE RIBBONS — background, subtle
  const ribbonGroup = new THREE.Group();
  scene.add(ribbonGroup);
  ribbonGroup.position.y = -0.05;

  for(let a=0;a<8;a++){
    const pts = [];
    for(let s=0;s<seasons.length;s++){
      const share = seasons[s].shares[a] || 0;
      const z = getZ(s);
      const x = (a-3.5)*1.18;
      const y = -1.8 + share*5.4;
      pts.push(new THREE.Vector3(x,y,z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    curve.tension = 0.28;
    const geo = new THREE.TubeGeometry(curve, seasons.length*2, 0.055, isLowEnd?5:7, false);
    const col = new THREE.Color(OKABE[a % OKABE.length]);
    col.lerp(new THREE.Color(0x2A2D33), 0.62);
    const mat = new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.84,
      metalness: 0.08,
      transparent:true,
      opacity: 0.30,
      depthWrite:false
    });
    const mesh = new THREE.Mesh(geo, mat);
    ribbonGroup.add(mesh);
    const lineMat = new THREE.LineBasicMaterial({ color: OKABE[a], transparent:true, opacity:0.09 });
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    ribbonGroup.add(new THREE.Line(lineGeo, lineMat));
  }

  // 2) PLAYER ARCS — foreground
  const ICONIC = [
    { name:"LeBron James", color:"#56B4E9", offset:0 },
    { name:"Stephen Curry", color:"#F0E442", offset:1 },
    { name:"Giannis Antetokounmpo", color:"#009E73", offset:2 },
    { name:"Nikola Jokic", color:"#CC79A7", offset:3 }
  ];

  const litePlayers = liteData?.players || [];
  const byName = new Map();
  for(const p of litePlayers){
    if(!byName.has(p.n)) byName.set(p.n, []);
    byName.get(p.n).push(p);
  }
  for(const arr of byName.values()) arr.sort((a,b)=> (a.s||'').localeCompare(b.s||''));

  const playerGroup = new THREE.Group();
  scene.add(playerGroup);

  function makeTextSprite(text, color='#FFFEF7', bg='rgba(10,12,16,0.72)'){
    const c=document.createElement('canvas'); c.width=420; c.height=56;
    const ctx=c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(4,4,c.width-8,c.height-8,10); ctx.fill();
    ctx.strokeStyle='rgba(234,230,222,0.18)'; ctx.lineWidth=1.2; ctx.stroke();
    ctx.fillStyle=color; ctx.font=`900 16px ui-monospace,monospace`; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(text, 18, c.height/2+1);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false });
    const spr=new THREE.Sprite(mat); spr.scale.set(2.4,0.32,1);
    return spr;
  }

  const playerCurves = [];

  ICONIC.forEach((icon, pi)=>{
    const entries = byName.get(icon.name) || [];
    if(entries.length < 4) return;
    const pts = [];
    for(const e of entries){
      const si = seasonIndexByName.get(e.s);
      if(si===undefined) continue;
      const share = (seasons[si]?.shares[e.c]||0);
      const z = getZ(si);
      const baseX = (e.c - 3.5)*1.18;
      const x = baseX + (pi-1.5)*0.12;
      const y = -1.8 + share*5.4 + 0.58 + pi*0.14 + Math.sin(si*0.18 + pi)*0.04;
      pts.push(new THREE.Vector3(x,y,z));
    }
    if(pts.length < 3) return;
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, Math.max(pts.length*2, 32), 0.075, 8, false);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(icon.color),
      emissive: new THREE.Color(icon.color),
      emissiveIntensity: 0.28,
      roughness:0.52,
      metalness:0.12,
      transparent:true,
      opacity:0.92
    });
    const mesh = new THREE.Mesh(tubeGeo, mat);
    playerGroup.add(mesh);

    const sphereGeo = new THREE.SphereGeometry(0.095, 10,10);
    for(let i=0;i<pts.length;i+= isLowEnd?3:2){
      const sphMat = new THREE.MeshStandardMaterial({ color: icon.color, emissive: icon.color, emissiveIntensity:0.35, transparent:true, opacity:0.9 });
      const sph = new THREE.Mesh(sphereGeo, sphMat);
      sph.position.copy(pts[i]);
      playerGroup.add(sph);
    }

    const last = pts[pts.length-1];
    const spr = makeTextSprite(`${icon.name}  ${entries[entries.length-1].s}`, icon.color, 'rgba(26,21,15,0.86)');
    spr.position.set(last.x+0.45, last.y+0.22, last.z);
    playerGroup.add(spr);

    playerCurves.push({ name:icon.name, curve, mesh, pts, color:icon.color });
  });

  const labelGroup = new THREE.Group();
  scene.add(labelGroup);
  function makeSeasonLabel(text){
    const c=document.createElement('canvas'); c.width=256; c.height=44;
    const ctx=c.getContext('2d'); ctx.clearRect(0,0,256,44);
    ctx.fillStyle='rgba(234,230,222,0.62)'; ctx.font='900 16px ui-monospace,monospace'; ctx.textAlign='center';
    ctx.fillText(text,128,26);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, opacity:0.66 });
    const spr=new THREE.Sprite(mat); spr.scale.set(2.8,0.48,1); return spr;
  }
  for(let s=0;s<seasons.length;s+= isLowEnd?6:4){
    const spr = makeSeasonLabel(seasons[s].season);
    spr.position.set(4.9, -2.05, getZ(s));
    labelGroup.add(spr);
  }

  const legendGroup = new THREE.Group();
  scene.add(legendGroup);
  shortNames.forEach((nm,a)=>{
    const c=document.createElement('canvas'); c.width=380; c.height=36;
    const ctx=c.getContext('2d');
    ctx.clearRect(0,0,380,36);
    ctx.fillStyle=OKABE[a]; ctx.fillRect(4,10,14,14);
    ctx.fillStyle='rgba(234,230,222,0.72)'; ctx.font='800 13px ui-monospace,monospace'; ctx.textAlign='left';
    ctx.fillText(nm.toUpperCase(), 26, 20);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, opacity:0.58 });
    const spr=new THREE.Sprite(mat);
    spr.position.set(-4.9, -1.2 + (a*0.34), SEASON_SPAN/2+1.2);
    spr.scale.set(2.2,0.26,1);
    legendGroup.add(spr);
  });

  const moteCount = isLowEnd?180:320;
  const motePos = new Float32Array(moteCount*3);
  for(let i=0;i<moteCount;i++){ motePos[i*3]=(Math.random()-0.5)*14; motePos[i*3+1]=Math.random()*4; motePos[i*3+2]=(Math.random()-0.5)*SEASON_SPAN*1.1; }
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos,3));
  const moteMat = new THREE.PointsMaterial({ size:0.038, color:0xEAE6DE, transparent:true, opacity:0.14, depthWrite:false, sizeAttenuation:true });
  const motes = new THREE.Points(moteGeo, moteMat);
  scene.add(motes);

  function onResize(){
    const w=canvas.clientWidth, h=canvas.clientHeight;
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(onResize); ro.observe(canvas); onResize();

  let visible=true;
  const io = new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; },{threshold:0.01}); io.observe(canvas);

  let t0=performance.now();
  function animate(){
    requestAnimationFrame(animate);
    if(!visible) return;
    const t=(performance.now()-t0)*0.001;
    const slow = prefersReduced?0.22:1;

    const flight = Math.sin(t*0.10*slow)*(SEASON_SPAN*0.36);
    camera.position.z = 11.5 + flight*0.12;
    camera.position.x = Math.sin(t*0.06*slow)*0.9;
    camera.position.y = 2.35 + Math.sin(t*0.045*slow)*0.22;
    const lookZ = -flight*0.30;
    camera.lookAt(0.15, 0.15, lookZ);

    spot.target.position.set(0.2, -0.2, lookZ);
    spot.position.set(spot.target.position.x, 5.2, spot.target.position.z+6.5);

    motes.rotation.y = t*0.012*slow;

    playerCurves.forEach((pc,i)=>{
      pc.mesh.material.emissiveIntensity = 0.22 + Math.sin(t*0.7 + i)*0.08;
    });

    renderer.render(scene,camera);
  }
  animate();

  function getFocused(){
    const t=(performance.now()-t0)*0.001;
    const seasonIdx = Math.floor( ((Math.sin(t*0.10)+1)/2) * (seasons.length-1) );
    const s = seasons[Math.min(seasonIdx, seasons.length-1)];
    if(!s) return { label:'Glass+Rim', season:'1996-97', share:0 };
    let maxA=0, maxV=0; for(let a=0;a<8;a++){ if(s.shares[a]>maxV){ maxV=s.shares[a]; maxA=a; } }
    return { label: shortNames[maxA], name: fullNames[maxA], season: s.season, share: maxV, idx:maxA, player: playerCurves[ Math.floor(t*0.14)%playerCurves.length ]?.name || '—' };
  }

  return { renderer, scene, camera, getFocused, dispose:()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); } };
}
