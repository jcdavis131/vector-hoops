/* star-map-void.js — Lemmino combo v2: CLEAN
   Remove sphere, add XYZ glass plate orientation aids, easier to read
   12,966 player-seasons as stars in documentary void
*/
export async function mountStarMap(canvas, opts = {}) {
  if (!canvas) return;
  const THREE = await import('three');

  const OKABE = ['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const ARCH = ["Glass+Rim","LowVol Glass","Low Impact","Def Glass+Rim FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const AXIS_LABELS = [
    { key:'X', label:'Paint ←→ Perim', short:'X: Paint ↔ Perim' },
    { key:'Y', label:'Role → Score', short:'Y: Role → Score' },
    { key:'Z', label:'Off ←→ On', short:'Z: Off ↔ On' }
  ];

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isLowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || window.innerWidth < 500;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isLowEnd, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0A0C10);
  scene.fog = new THREE.FogExp2(0x0A0C10, 0.022);

  const camera = new THREE.PerspectiveCamera(34, canvas.clientWidth / canvas.clientHeight, 0.1, 120);
  camera.position.set(0, 0.8, 8.6);

  // Lights — documentary, softer now
  const amb = new THREE.AmbientLight(0x252836, 0.62);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xFFE4B2, 0.85);
  key.position.set(4.5, 6, 3.2);
  scene.add(key);
  const coldRim = new THREE.DirectionalLight(0x86BBFF, 0.48);
  coldRim.position.set(-5, 2.5, -4);
  scene.add(coldRim);

  // Root group that rotates with user drag — contains stars + glass plates
  const starGroup = new THREE.Group();
  scene.add(starGroup);

  // --- GLASS PLATE ORIENTATION AIDS ---
  const SPREAD = 4.2;
  const WALL = SPREAD*1.05;
  const PLATE_SIZE = WALL*2.2;

  function makeGlassPlate(size, color, opacity=0.045){
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity,
      roughness: 0.92,
      metalness: 0.02,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    return new THREE.Mesh(geo, mat);
  }
  function makeGridLine(size, divisions, color, opacity=0.09){
    const group = new THREE.Group();
    const step = size / divisions;
    const half = size/2;
    const lineMat = new THREE.LineBasicMaterial({ color, transparent:true, opacity });
    for(let i=-divisions/2;i<=divisions/2;i++){
      const p = i*step;
      // vertical
      const pts1 = [new THREE.Vector3(p,-half,0), new THREE.Vector3(p,half,0)];
      const g1 = new THREE.BufferGeometry().setFromPoints(pts1);
      group.add(new THREE.Line(g1, lineMat));
      // horizontal
      const pts2 = [new THREE.Vector3(-half,p,0), new THREE.Vector3(half,p,0)];
      const g2 = new THREE.BufferGeometry().setFromPoints(pts2);
      group.add(new THREE.Line(g2, lineMat));
    }
    return group;
  }
  function makeLabelSprite(text, fontSize=18, bg='rgba(10,12,16,0.72)'){
    const c=document.createElement('canvas'); c.width=420; c.height=56;
    const ctx=c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(4,4,c.width-8,c.height-8,10); ctx.fill();
    ctx.strokeStyle='rgba(234,230,222,0.18)'; ctx.lineWidth=1.2; ctx.stroke();
    ctx.fillStyle='#EAE6DE'; ctx.font=`900 ${fontSize}px ui-monospace,monospace`; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(text, 18, c.height/2+1);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false });
    const spr=new THREE.Sprite(mat); spr.scale.set(2.6,0.34,1);
    return spr;
  }

  const orientationWalls = new THREE.Group();
  starGroup.add(orientationWalls);

  // XY back wall — at z = -WALL
  const xyPlate = makeGlassPlate(PLATE_SIZE, 0xEAE6DE, 0.038);
  xyPlate.position.set(0,0,-WALL);
  orientationWalls.add(xyPlate);
  const xyGrid = makeGridLine(PLATE_SIZE, isLowEnd?8:12, 0xEAE6DE, 0.07);
  xyGrid.position.copy(xyPlate.position);
  orientationWalls.add(xyGrid);

  // XZ floor — at y = -WALL
  const xzPlate = makeGlassPlate(PLATE_SIZE, 0x86BBFF, 0.035);
  xzPlate.rotation.x = Math.PI/2;
  xzPlate.position.set(0,-WALL,0);
  orientationWalls.add(xzPlate);
  const xzGrid = makeGridLine(PLATE_SIZE, isLowEnd?8:12, 0x86BBFF, 0.06);
  xzGrid.rotation.x = Math.PI/2;
  xzGrid.position.copy(xzPlate.position);
  orientationWalls.add(xzGrid);

  // YZ side wall — at x = -WALL
  const yzPlate = makeGlassPlate(PLATE_SIZE, 0xF0E442, 0.032);
  yzPlate.rotation.y = Math.PI/2;
  yzPlate.position.set(-WALL,0,0);
  orientationWalls.add(yzPlate);
  const yzGrid = makeGridLine(PLATE_SIZE, isLowEnd?8:12, 0xF0E442, 0.055);
  yzGrid.rotation.y = Math.PI/2;
  yzGrid.position.copy(yzPlate.position);
  orientationWalls.add(yzGrid);

  // Edge lines for glass plates — crisp 2px ink border style
  function addPlateEdges(plate){
    const s=PLATE_SIZE/2;
    const pts=[new THREE.Vector3(-s,-s,0), new THREE.Vector3(s,-s,0), new THREE.Vector3(s,s,0), new THREE.Vector3(-s,s,0), new THREE.Vector3(-s,-s,0)];
    const geo=new THREE.BufferGeometry().setFromPoints(pts);
    const mat=new THREE.LineBasicMaterial({ color:0xEAE6DE, transparent:true, opacity:0.12 });
    const line=new THREE.Line(geo, mat);
    line.position.copy(plate.position);
    line.rotation.copy(plate.rotation);
    orientationWalls.add(line);
  }
  addPlateEdges(xyPlate); addPlateEdges(xzPlate); addPlateEdges(yzPlate);

  // Axis indicator — small RGB-style lines from center with labels
  const axisLines = new THREE.Group();
  starGroup.add(axisLines);
  function axisLine(dir, color){
    const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), dir.clone().multiplyScalar(WALL*0.92)]);
    const mat=new THREE.LineBasicMaterial({ color, transparent:true, opacity:0.42, linewidth:1.5 });
    return new THREE.Line(geo, mat);
  }
  const xLine = axisLine(new THREE.Vector3(1,0,0), 0x56B4E9);
  const yLine = axisLine(new THREE.Vector3(0,1,0), 0xF0E442);
  const zLine = axisLine(new THREE.Vector3(0,0,1), 0xD55E00);
  axisLines.add(xLine,yLine,zLine);

  // Axis label sprites — placed at end of each axis
  const xLab = makeLabelSprite('X: Paint ← → Perim   ',16,'rgba(86,180,233,0.18)');
  xLab.position.set(WALL*1.02,0,0); axisLines.add(xLab);
  const yLab = makeLabelSprite('Y: Role → Score   ',16,'rgba(240,228,66,0.18)');
  yLab.position.set(0,WALL*1.02,0); axisLines.add(yLab);
  const zLab = makeLabelSprite('Z: Off ← → On   ',16,'rgba(213,94,0,0.18)');
  zLab.position.set(0,0,WALL*1.02); axisLines.add(zLab);

  // Center origin dot
  const originGeo = new THREE.SphereGeometry(0.045, 8,8);
  const originMat = new THREE.MeshBasicMaterial({ color:0xEAE6DE, transparent:true, opacity:0.22 });
  const originDot = new THREE.Mesh(originGeo, originMat);
  starGroup.add(originDot);

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

  const SPREAD_SCALE = 4.2;
  for(let i=0;i<count;i++){
    const p = players[i] || {x:Math.random(), y:Math.random(), z:Math.random(), c:i%8};
    positions[i*3]=(p.x-0.5)*2*SPREAD_SCALE;
    positions[i*3+1]=(p.y-0.5)*2*SPREAD_SCALE;
    positions[i*3+2]=(p.z-0.5)*2*SPREAD_SCALE;
    const hex = OKABE[p.c % OKABE.length];
    const col = new THREE.Color(hex);
    col.lerp(new THREE.Color(0xEAE6DE), 0.28); // more muted for readability
    colors[i*3]=col.r; colors[i*3+1]=col.g; colors[i*3+2]=col.b;
  }

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const starMat = new THREE.PointsMaterial({
    size: isLowEnd ? 0.062 : 0.082,
    vertexColors:true,
    transparent:true,
    opacity:0.76,
    sizeAttenuation:true,
    depthWrite:false,
    blending:THREE.AdditiveBlending
  });
  const stars = new THREE.Points(starGeo, starMat);
  starGroup.add(stars);

  // Reduced dust for cleanliness
  const dustCount = isLowEnd ? 220 : 380;
  const dustPos = new Float32Array(dustCount*3);
  for(let i=0;i<dustCount;i++){
    const r = 4.5 + Math.random()*6.5;
    const th = Math.random()*Math.PI*2;
    dustPos[i*3]=Math.cos(th)*r;
    dustPos[i*3+1]=(Math.random()-0.5)*4.2;
    dustPos[i*3+2]=Math.sin(th)*r;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos,3));
  const dustMat = new THREE.PointsMaterial({ size:0.028, color:0xEAE6DE, transparent:true, opacity:0.10, depthWrite:false, sizeAttenuation:true });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  // Interaction
  let rotY = Math.PI*0.18, rotX = 0.22;
  let auto = true; let autoSpeed = 0.00016;
  let isDragging=false,lastX=0,lastY=0,idleTimer=0;

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
      projectedCache[i]={sx:sxr, sy:syr, depth:(zr+1)*0.5, i, n:players[i]?.n, s:players[i]?.s, c:players[i]?.c};
    }
  }
  function findClosest(mx,my){
    let best=null, bd=18;
    for(let i=0;i<count;i++){
      const p=projectedCache[i]; if(!p) continue;
      const d=Math.hypot(p.sx-mx, p.sy-my);
      if(d<bd){ bd=d; best=p; }
    }
    return best;
  }

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

  let visible=true;
  const io = new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; }, {threshold:0.01});
  io.observe(canvas);

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
      rotY+=dx*0.007; rotX+=dy*0.005;
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
      } else {
        if(hoverTip) hoverTip.style.display='none';
        if(hoverChip) hoverChip.style.opacity='0.68';
      }
    }
  }
  function onPointerUp(){ if(isDragging){ isDragging=false; idleTimer=4200; canvas.style.cursor='grab'; } }

  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('touchstart', onPointerDown, {passive:true});
  canvas.addEventListener('touchmove', onPointerMove, {passive:true});
  canvas.addEventListener('touchend', onPointerUp);
  canvas.addEventListener('mouseleave', ()=>{ if(hoverTip) hoverTip.style.display='none'; if(hoverChip) hoverChip.style.opacity='0.68'; });

  if(btnPause){ btnPause.addEventListener('click', ()=>{ auto=!auto; btnPause.textContent=auto?'Pause':'Resume'; if(auto) idleTimer=0; }); }
  if(btnReset){ btnReset.addEventListener('click', ()=>{ rotY=Math.PI*0.18; rotX=0.22; auto=true; if(btnPause) btnPause.textContent='Pause'; }); }

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
      rotX+=( (Math.sin(t*0.00018)*0.16 - rotX)*0.014 );
    } else if(idleTimer){ idleTimer-=dt; if(idleTimer<=0){ auto=true; if(btnPause) btnPause.textContent='Pause'; } }

    starGroup.rotation.y = rotY;
    starGroup.rotation.x = rotX;

    const et=(performance.now()-t0)*0.001;
    const slow = prefersReduced?0.18:1;

    // subtle breathe, easier to read
    dust.rotation.y = et*0.008*slow;
    camera.position.x = Math.sin(et*0.05*slow)*0.22;
    camera.position.y = 0.8 + Math.sin(et*0.09*slow)*0.12;
    camera.lookAt(0,0.1,0);

    starMat.opacity = 0.74 + Math.sin(et*0.6)*0.04;

    renderer.render(scene, camera);
  }
  animate(0);

  return {
    renderer, scene, camera, starGroup,
    getRotation: ()=>({rotY, rotX}),
    setAuto: (v)=>{ auto=v; },
    dispose: ()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); }
  };
}
