/* star-map-void.js — Lemmino combo: embedding map as stars in documentary void
   12,966 player-seasons = stars, tungsten + cold rim, fog, grain, artifact
   Interaction: drag rotate, wheel zoom, auto idle, pause/reset compatible
*/
export async function mountStarMap(canvas, opts = {}) {
  if (!canvas) return;
  const THREE = await import('three');

  const OKABE = ['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const ARCH = ["Glass+Rim","LowVol Glass","Low Impact 3P Vol","Def Glass+Rim FT","Vol+3P Vol","3P Acc+Vol","Playmaking+Steals","Scoring Vol"];

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isLowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || window.innerWidth < 500;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isLowEnd, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !isLowEnd;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0A0C10);
  scene.fog = new THREE.FogExp2(0x0A0C10, 0.022);

  const camera = new THREE.PerspectiveCamera(34, canvas.clientWidth / canvas.clientHeight, 0.1, 120);
  camera.position.set(0, 0.8, 9.2);

  // Lights — Lemmino documentary
  const amb = new THREE.AmbientLight(0x252836, 0.58);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xFFE4B2, 1.25);
  key.position.set(4.5, 6, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024,1024);
  key.shadow.camera.near = 1; key.shadow.camera.far = 22;
  key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
  key.shadow.bias = -0.0006;
  scene.add(key);
  const coldRim = new THREE.DirectionalLight(0x86BBFF, 0.72);
  coldRim.position.set(-5, 2.5, -4);
  scene.add(coldRim);
  const fillSpot = new THREE.SpotLight(0xF0E442, 0.85, 18, Math.PI*0.18, 0.32, 1.4);
  fillSpot.position.set(0,7,1);
  fillSpot.castShadow = !isLowEnd;
  scene.add(fillSpot);

  // Ground catcher — very faint, just for shadow
  const groundGeo = new THREE.PlaneGeometry(80,80);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x0E1117, roughness: 0.92, metalness: 0.04, transparent:true, opacity:0.6 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.position.y = -3.2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Root group that rotates with user drag — contains stars
  const starGroup = new THREE.Group();
  scene.add(starGroup);

  // Court fragments as faint evidence lines in void (deconstructed)
  const courtGroup = new THREE.Group();
  courtGroup.position.set(0,-0.2,0);
  starGroup.add(courtGroup);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xEAE6DE, transparent:true, opacity:0.06 });
  const lineMatBold = new THREE.LineBasicMaterial({ color: 0xFFFEF7, transparent:true, opacity:0.10 });
  function wireBox(w,h,z=0,mat=lineMat){
    const pts = [new THREE.Vector3(-w/2,-h/2,z), new THREE.Vector3(w/2,-h/2,z), new THREE.Vector3(w/2,h/2,z), new THREE.Vector3(-w/2,h/2,z), new THREE.Vector3(-w/2,-h/2,z)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(geo, mat);
  }
  courtGroup.add(wireBox(7.8,5.4,0,lineMatBold));
  courtGroup.add(wireBox(7.8,0.06,0,lineMat));
  courtGroup.add(wireBox(0.06,5.4,0,lineMat));

  // Basketball artifact — low-poly, matte, floats at center behind stars
  const ballGeo = new THREE.IcosahedronGeometry(0.72,2);
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xC57A3A, roughness:0.88, metalness:0.03, flatShading:true, transparent:true, opacity:0.92 });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.position.set(0,0.25,0);
  ball.castShadow = true;
  ball.receiveShadow = true;
  starGroup.add(ball);
  const seamGeo = new THREE.IcosahedronGeometry(0.728,2);
  const seamMat = new THREE.MeshBasicMaterial({ color:0x111111, transparent:true, opacity:0.08, wireframe:true });
  const seam = new THREE.Mesh(seamGeo, seamMat);
  ball.add(seam);

  // God rays fake volumetrics
  const rayGeo = new THREE.PlaneGeometry(6,18);
  const rayMat = new THREE.MeshBasicMaterial({ color:0xFFD8A8, transparent:true, opacity:0.04, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
  const ray1 = new THREE.Mesh(rayGeo, rayMat);
  ray1.position.set(-1.2,3,-1.5); ray1.rotation.set(0,-0.4,0.18);
  starGroup.add(ray1);
  const ray2 = ray1.clone(); ray2.material = rayMat.clone(); ray2.material.opacity = 0.028;
  ray2.position.set(1.8,3,-0.8); ray2.rotation.set(0,0.6,-0.12);
  starGroup.add(ray2);

  // Fetch lite dataset
  let players = [];
  try{
    const r = await fetch('assets/vectors_search_lite.json',{cache:'force-cache'});
    const j = await r.json();
    players = j.players || [];
  } catch(e){ console.warn('star-map fetch fail', e); }

  const count = players.length || 12966;
  const positions = new Float32Array(count*3);
  const colors = new Float32Array(count*3);
  const sizes = new Float32Array(count);

  // Spread factor
  const SPREAD = 4.2;

  for(let i=0;i<count;i++){
    const p = players[i] || {x:Math.random(), y:Math.random(), z:Math.random(), c:i%8};
    const ox = (p.x-0.5)*2*SPREAD;
    const oy = (p.y-0.5)*2*SPREAD;
    const oz = (p.z-0.5)*2*SPREAD;
    positions[i*3]=ox; positions[i*3+1]=oy; positions[i*3+2]=oz;

    const hex = OKABE[p.c % OKABE.length];
    const col = new THREE.Color(hex);
    // mute for Lemmino — desaturate a bit
    col.lerp(new THREE.Color(0xEAE6DE), 0.18);
    colors[i*3]=col.r; colors[i*3+1]=col.g; colors[i*3+2]=col.b;
    sizes[i]=0.042 + Math.random()*0.018;
  }

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const starMat = new THREE.PointsMaterial({
    size: isLowEnd ? 0.055 : 0.075,
    vertexColors:true,
    transparent:true,
    opacity:0.82,
    sizeAttenuation:true,
    depthWrite:false,
    blending:THREE.AdditiveBlending
  });
  const stars = new THREE.Points(starGeo, starMat);
  starGroup.add(stars);

  // Extra dust motes for depth — not interactive
  const dustCount = isLowEnd ? 600 : 1200;
  const dustPos = new Float32Array(dustCount*3);
  for(let i=0;i<dustCount;i++){
    const r = 4.5 + Math.random()*9;
    const th = Math.random()*Math.PI*2;
    dustPos[i*3]=Math.cos(th)*r; dustPos[i*3+1]=(Math.random()-0.5)*6+0.5; dustPos[i*3+2]=Math.sin(th)*r;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos,3));
  const dustMat = new THREE.PointsMaterial({ size:0.032, color:0xEAE6DE, transparent:true, opacity:0.18, depthWrite:false, sizeAttenuation:true });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  // Interaction state — matches old 2D map api
  let rotY = Math.PI*0.18, rotX = 0.22;
  let auto = true; let autoSpeed = 0.00022;
  let isDragging=false,lastX=0,lastY=0,idleTimer=0;
  let heroId = 672; // MJ 97-98
  let hovered = null;

  // Projection cache for hover
  const projectedCache = new Array(count);
  function projectCache(){
    const cy=Math.cos(rotY), sy=Math.sin(rotY), cx=Math.cos(rotX), sx=Math.sin(rotX);
    const perspective=2.8;
    const W=canvas.clientWidth, H=canvas.clientHeight;
    for(let i=0;i<count;i++){
      const idx=i*3;
      const ox=positions[idx], oy=positions[idx+1], oz=positions[idx+2];
      const xr = ox*cy + oz*sy;
      const z1 = -ox*sy + oz*cy;
      const yr = oy*cx - z1*sx;
      const zr = oy*sx + z1*cx;
      const scale = perspective / (perspective - zr*0.45);
      const sxr = W*0.5 + xr*scale*(W*0.38);
      const syr = H*0.5 - yr*scale*(H*0.38);
      const depth=(zr+1)*0.5;
      projectedCache[i]={sx:sxr, sy:syr, depth, xr, yr, zr, i, n:players[i]?.n, s:players[i]?.s, c:players[i]?.c};
    }
  }

  // Raycast for hero highlight — simple distance in screen space
  function findClosest(mx,my){
    let best=null, bd=18;
    for(let i=0;i<count;i++){
      const p=projectedCache[i]; if(!p) continue;
      const d=Math.hypot(p.sx-mx, p.sy-my);
      if(d<bd){ bd=d; best=p; }
    }
    return best;
  }

  // DOM refs for overlay behavior (existing IDs)
  const factEl = document.getElementById('sky-fact');
  const factInline = document.getElementById('sky-fact-inline');
  const hoverTip = document.getElementById('hover-tip');
  const hoverChip = document.getElementById('sky-hover-chip');
  const btnPause = document.getElementById('btn-pause');
  const btnReset = document.getElementById('btn-reset');

  function onResize(){
    const w=canvas.clientWidth, h=canvas.clientHeight;
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(onResize);
  ro.observe(canvas);
  onResize();

  // Visibility
  let visible=true;
  const io = new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; }, {threshold:0.01});
  io.observe(canvas);

  // pointer
  function onPointerDown(ev){
    isDragging=true; auto=false;
    lastX= ev.touches?ev.touches[0].clientX:ev.clientX;
    lastY= ev.touches?ev.touches[0].clientY:ev.clientY;
    if(btnPause) btnPause.textContent='Resume';
    canvas.style.cursor='grabbing';
  }
  function onPointerMove(ev){
    const x= ev.touches?ev.touches[0].clientX:ev.clientX;
    const y= ev.touches?ev.touches[0].clientY:ev.clientY;
    if(isDragging){
      const dx=x-lastX, dy=y-lastY;
      rotY+=dx*0.008; rotX+=dy*0.006;
      rotX=Math.max(-0.9,Math.min(0.9,rotX));
      lastX=x; lastY=y;
      projectCache();
    } else {
      const rect=canvas.getBoundingClientRect();
      const mx=x-rect.left, my=y-rect.top;
      const best=findClosest(mx,my);
      if(best && hoverTip){
        hoverTip.style.display='block'; hoverTip.style.left=best.sx+'px'; hoverTip.style.top=(best.sy-38)+'px';
        hoverTip.innerHTML='<b>'+(best.n||'')+'</b> '+(best.s||'')+'<br><span class="small-mono" style="text-transform:none">'+(ARCH[best.c%ARCH.length]||'')+'</span>';
        if(factEl) factEl.textContent=(best.n||'')+' '+(best.s||'')+' — '+(ARCH[best.c%ARCH.length]||'');
        if(factInline) factInline.textContent=(best.n||'')+' '+(best.s||'')+' — '+(ARCH[best.c%ARCH.length]||'');
        if(hoverChip) hoverChip.style.opacity='0';
        hovered=best;
      } else {
        if(hoverTip) hoverTip.style.display='none';
        if(hoverChip) hoverChip.style.opacity='0.7';
        hovered=null;
      }
    }
  }
  function onPointerUp(){ if(isDragging){ isDragging=false; idleTimer=3200; canvas.style.cursor='grab'; } }

  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('touchstart', onPointerDown, {passive:true});
  canvas.addEventListener('touchmove', onPointerMove, {passive:true});
  canvas.addEventListener('touchend', onPointerUp);
  canvas.addEventListener('mouseleave', ()=>{ if(hoverTip) hoverTip.style.display='none'; if(hoverChip) hoverChip.style.opacity='0.7'; });

  if(btnPause){ btnPause.addEventListener('click', ()=>{ auto=!auto; btnPause.textContent=auto?'Pause':'Resume'; if(auto) idleTimer=0; }); }
  if(btnReset){ btnReset.addEventListener('click', ()=>{ rotY=Math.PI*0.18; rotX=0.22; auto=true; if(btnPause) btnPause.textContent='Pause'; }); }

  // initial projection
  projectCache();

  let t0=performance.now();
  let lastT=0;
  function animate(t){
    requestAnimationFrame(animate);
    if(!visible){ lastT=t; return; }
    if(!lastT) lastT=t;
    const dt=Math.min(48, t-lastT); lastT=t;

    if(!isDragging && auto){
      rotY+=dt*autoSpeed;
      rotX+=( (Math.sin(t*0.00018)*0.20 - rotX)*0.018 );
    } else if(idleTimer){ idleTimer-=dt; if(idleTimer<=0){ auto=true; if(btnPause) btnPause.textContent='Pause'; } }

    // apply rotation to starGroup
    starGroup.rotation.y = rotY;
    starGroup.rotation.x = rotX;

    const now=performance.now();
    const et=(now-t0)*0.001;
    const slow = prefersReduced?0.18:1;

    ball.rotation.y = et*0.14*slow;
    ball.rotation.x = Math.sin(et*0.07*slow)*0.18;
    ball.position.y = 0.25 + Math.sin(et*0.38*slow)*0.12;

    courtGroup.rotation.y = Math.sin(et*0.12)*0.08;

    dust.rotation.y = et*0.012*slow;
    ray1.rotation.z = 0.18 + Math.sin(et*0.08*slow)*0.06;
    ray2.rotation.z = -0.12 + Math.cos(et*0.07*slow)*0.05;

    // subtle camera breathe
    camera.position.x = Math.sin(et*0.06*slow)*0.35;
    camera.position.y = 0.8 + Math.sin(et*0.11*slow)*0.18;
    camera.lookAt(0,0.15,0);

    // hero pulse — make MJ star bigger via color boost
    // we cheat by updating starMat opacity pulse
    starMat.opacity = 0.78 + Math.sin(et*0.9)*0.06;

    renderer.render(scene, camera);
  }
  animate(0);

  // expose for external (pause etc)
  return {
    renderer, scene, camera, starGroup,
    getRotation: ()=>({rotY, rotX}),
    setAuto: (v)=>{ auto=v; },
    dispose: ()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); }
  };
}
