/* drift-void.js — Lemmino replacement for monoliths: The Great Migration
   30 seasons as timeline through void, 8 archetype ribbons = prevalence over time
   Camera slow flight through Z, tungsten + cold rim, fog, grain, scanline
   Data: assets/archetypes_time.json shares per season
*/
export async function mountDriftVoid(canvas) {
  if (!canvas) return;
  const THREE = await import('three');

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isLowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency<=4) || window.innerWidth<520;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !isLowEnd;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0A0C10);
  scene.fog = new THREE.FogExp2(0x0A0C10, 0.032);

  const camera = new THREE.PerspectiveCamera(36, canvas.clientWidth/canvas.clientHeight, 0.1, 120);
  camera.position.set(0, 1.8, 12);

  // lights
  const amb = new THREE.AmbientLight(0x1E2330, 0.55);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xFFE9C7, 1.15);
  key.position.set(6,8,4);
  key.castShadow = true;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8AB4FF, 0.62);
  rim.position.set(-6,3,-6);
  scene.add(rim);
  const sweep = new THREE.SpotLight(0xF0E442, 1.8, 30, Math.PI*0.24, 0.28, 1.2);
  sweep.position.set(0,6,8);
  sweep.target.position.set(0,0,-10);
  scene.add(sweep); scene.add(sweep.target);

  const groundGeo = new THREE.PlaneGeometry(120,120);
  const groundMat = new THREE.MeshStandardMaterial({ color:0x0C0E14, roughness:0.94, metalness:0.06, transparent:true, opacity:0.92 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI/2; ground.position.y = -2.2; ground.receiveShadow=true;
  scene.add(ground);

  // Load timeline data
  let timeData = null;
  try{
    const r = await fetch('assets/archetypes_time.json',{cache:'force-cache'});
    timeData = await r.json();
  } catch(e){ console.warn('drift fetch fail', e); }

  const seasons = timeData?.prevalence || [];
  const archNames = timeData?.globalArchetypes || ["Off Glass Rim","LowVol Glass","Low Impact","Def Glass+FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const shortNames = ["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const OKABE = ['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];

  // Create ribbon group
  const ribbonGroup = new THREE.Group();
  scene.add(ribbonGroup);

  // For each archetype, build a tube along time Z
  const ribbons = [];
  const SEASON_SPAN = 28; // Z from -14 to +14
  const getZ = (idx) => (idx / Math.max(1,seasons.length-1))*SEASON_SPAN - SEASON_SPAN/2;

  for(let a=0;a<8;a++){
    const pts = [];
    for(let s=0;s<seasons.length;s++){
      const share = seasons[s].shares[a] || 0;
      const z = getZ(s);
      const x = (a-3.5)*1.15 + Math.sin(s*0.12 + a)*0.15;
      const y = -1.8 + share*7.5 + Math.sin(s*0.3 + a*0.7)*0.08;
      pts.push(new THREE.Vector3(x,y,z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    curve.tension = 0.26;
    const tubular = isLowEnd?6:10;
    const geo = new THREE.TubeGeometry(curve, seasons.length*2, 0.08 + (a===7?0.06:0), tubular, false);
    const matColor = new THREE.Color(OKABE[a % OKABE.length]);
    matColor.lerp(new THREE.Color(0x22242A), 0.35);
    const mat = new THREE.MeshStandardMaterial({
      color: matColor,
      emissive: new THREE.Color(OKABE[a % OKABE.length]),
      emissiveIntensity: 0.16,
      roughness: 0.78,
      metalness: 0.12,
      flatShading:false,
      transparent:true,
      opacity:0.88
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ribbonGroup.add(mesh);

    // nodes at each season — small spheres
    const sphereGeo = new THREE.SphereGeometry(0.11, 10,10);
    const nodeGroup = new THREE.Group();
    for(let s=0;s<seasons.length;s+= isLowEnd?4:2){
      const share = seasons[s].shares[a]||0;
      if(share<0.04) continue;
      const z=getZ(s); const x=(a-3.5)*1.15; const y=-1.8+share*7.5;
      const sph = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ color: OKABE[a], emissive: OKABE[a], emissiveIntensity:0.22 }));
      sph.position.set(x,y,z);
      nodeGroup.add(sph);
    }
    ribbonGroup.add(nodeGroup);
    ribbons.push({ curve, mesh, nodeGroup, a });
  }

  // Season label planes — floating markers
  const labelGroup = new THREE.Group();
  scene.add(labelGroup);
  function makeLabelCanvas(text){
    const c=document.createElement('canvas'); c.width=256; c.height=48;
    const ctx=c.getContext('2d');
    ctx.clearRect(0,0,256,48);
    ctx.fillStyle='rgba(234,230,222,0.72)'; ctx.font='900 18px ui-monospace,monospace'; ctx.textAlign='center';
    ctx.fillText(text,128,30);
    return c;
  }
  for(let s=0;s<seasons.length;s+= isLowEnd?5:3){
    const z=getZ(s);
    const canvasLab = makeLabelCanvas(seasons[s].season);
    const tex = new THREE.CanvasTexture(canvasLab);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map:tex, transparent:true, opacity:0.62 });
    const spr = new THREE.Sprite(mat);
    spr.position.set(0, -2.6, z);
    spr.scale.set(3.2,0.6,1);
    labelGroup.add(spr);
  }

  // Dust motes
  const moteCount = isLowEnd?200:500;
  const motePos = new Float32Array(moteCount*3);
  for(let i=0;i<moteCount;i++){ motePos[i*3]=(Math.random()-0.5)*18; motePos[i*3+1]=Math.random()*5; motePos[i*3+2]=(Math.random()-0.5)*SEASON_SPAN*1.2; }
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos,3));
  const moteMat = new THREE.PointsMaterial({ size:0.04, color:0xEAE6DE, transparent:true, opacity:0.20, depthWrite:false, sizeAttenuation:true });
  const motes = new THREE.Points(moteGeo, moteMat);
  scene.add(motes);

  // Beam wedge
  const beamGeo = new THREE.PlaneGeometry(5,16);
  const beamMat = new THREE.MeshBasicMaterial({ color:0xFFE8B0, transparent:true, opacity:0.05, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  scene.add(beam);

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

    // flight along Z — ping-pong
    const flight = Math.sin(t*0.12*slow)* (SEASON_SPAN*0.38);
    camera.position.z = 12 + flight*0.15;
    camera.position.x = Math.sin(t*0.07*slow)*1.1;
    camera.position.y = 2.1 + Math.sin(t*0.05*slow)*0.25 + Math.cos(flight*0.12)*0.15;
    const lookZ = -flight*0.35;
    camera.lookAt(Math.sin(t*0.04)*0.3, 0.2, lookZ);

    sweep.target.position.set(Math.sin(t*0.08)*1.5, 0, lookZ);
    sweep.position.set(sweep.target.position.x*0.5, 5.5, sweep.target.position.z+7);

    beam.position.copy(sweep.target.position); beam.position.y+=1.6; beam.lookAt(sweep.position);

    ribbons.forEach((r,i)=>{
      const focus = Math.abs(i - ((t*0.18)%8));
      const f = Math.max(0, 1 - focus*0.55);
      r.mesh.material.emissiveIntensity = 0.12 + f*0.22;
      r.mesh.material.opacity = 0.62 + f*0.28;
    });

    motes.rotation.y = t*0.015*slow;

    renderer.render(scene,camera);
  }
  animate();

  function getFocused(){
    const t=(performance.now()-t0)*0.001;
    const seasonIdx = Math.floor( ( (Math.sin(t*0.12)+1)/2 ) * (seasons.length-1) );
    const s = seasons[Math.min(seasonIdx, seasons.length-1)];
    if(!s) return { label: archNames[0], season: '1996-97', share: 0 };
    // find max share in that season
    let maxA=0, maxV=0; for(let a=0;a<8;a++){ if(s.shares[a]>maxV){ maxV=s.shares[a]; maxA=a; } }
    return { label: shortNames[maxA], name: archNames[maxA], season: s.season, share: maxV, idx:maxA };
  }

  return { renderer, scene, camera, getFocused, dispose:()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); } };
}
