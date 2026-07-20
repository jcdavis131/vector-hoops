/* star-map-void.js v5.0 — embedding map #1 fix: visible on Android, no black void
   - root cause: PointsMaterial 0.09 world units invisible on mobile + OKABE[7]=#000000 on #080A0F background + fog 0.0022 + camera far 8.6 + SW stale cache
   - fix: bigger stars 0.26/0.36, black->white, fog 0.0006, camera 5.4, spread 3.4, walls 0.012 opacity, no-store fetch + sw v11
   - full-bleed 100vw/78vh, safe-area 56px, 44px touch, guaranteed resize
*/
export async function mountStarMap(canvas){
  if(!canvas) return;
  let THREE;
  try{ THREE = await import('three'); }catch{ THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js'); }
  const OKABE_RAW=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const OKABE_VISIBLE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#FFFEF7']; // last black->white for dark bg
  const ARCH=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const isLowEnd=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||window.innerWidth<520;
  const isMobile = window.innerWidth<700;

  const renderer=new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, isLowEnd?1.25:1.6));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(0x080A0F,1);

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x080A0F);
  scene.fog=new THREE.FogExp2(0x080A0F, 0.0007);

  const camera=new THREE.PerspectiveCamera(34, 1, 0.1, 90);
  camera.position.set(0,0.42,5.6);

  scene.add(new THREE.AmbientLight(0xFFFFFF, 1.15));
  const dl=new THREE.DirectionalLight(0xFFFFFF,0.55); dl.position.set(3,5,4); scene.add(dl);
  const dl2=new THREE.DirectionalLight(0xA8C4FF,0.28); dl2.position.set(-3,2,-4); scene.add(dl2);

  const starGroup=new THREE.Group(); scene.add(starGroup);
  const SPREAD=3.35, WALL=3.6, PLATE=8.8;

  function makeGlass(size,color,op){
    const geo=new THREE.PlaneGeometry(size,size);
    const mat=new THREE.MeshStandardMaterial({ color:new THREE.Color(color), transparent:true, opacity:op, roughness:0.94, metalness:0.03, side:THREE.DoubleSide, depthWrite:false });
    return new THREE.Mesh(geo,mat);
  }
  function makeGrid(size,div,color,op){
    const g=new THREE.Group();
    const mat=new THREE.LineBasicMaterial({ color:new THREE.Color(color), transparent:true, opacity:op });
    const half=size/2, step=size/div;
    for(let i=-div/2;i<=div/2;i++){
      const p=i*step;
      const a=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p,-half,0), new THREE.Vector3(p,half,0)]);
      g.add(new THREE.Line(a,mat));
      const b=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-half,p,0), new THREE.Vector3(half,p,0)]);
      g.add(new THREE.Line(b,mat));
    }
    return g;
  }
  function makeEdge(size,color,op){
    const s=size/2;
    const pts=[new THREE.Vector3(-s,-s,0),new THREE.Vector3(s,-s,0),new THREE.Vector3(s,s,0),new THREE.Vector3(-s,s,0),new THREE.Vector3(-s,-s,0)];
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color:new THREE.Color(color), transparent:true, opacity:op }));
  }
  function makeLabel(text,bg,fg,w=420,h=52,scale=2.0){
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const ctx=c.getContext('2d'); ctx.clearRect(0,0,w,h);
    ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(4,4,w-8,h-8,10); ctx.fill();
    ctx.fillStyle=fg; ctx.font='900 13px ui-monospace,monospace'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(text,14,h/2+1);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:false });
    const s=new THREE.Sprite(mat); s.scale.set(scale, scale*0.125, 1); return s;
  }

  const walls=new THREE.Group(); starGroup.add(walls);
  const xy=makeGlass(PLATE,0xFFFFFF,0.012); xy.position.set(0,0,-WALL); walls.add(xy);
  const xyGrid=makeGrid(PLATE,12,0xFFFFFF,0.022); xyGrid.position.copy(xy.position); walls.add(xyGrid);
  const xyE=makeEdge(PLATE,0xFFFFFF,0.035); xyE.position.copy(xy.position); walls.add(xyE);
  const xz=makeGlass(PLATE,0xA8C4FF,0.01); xz.rotation.x=Math.PI/2; xz.position.set(0,-WALL,0); walls.add(xz);
  const xzG=makeGrid(PLATE,12,0xA8C4FF,0.028); xzG.rotation.x=Math.PI/2; xzG.position.copy(xz.position); walls.add(xzG);
  const xzE=makeEdge(PLATE,0xA8C4FF,0.04); xzE.rotation.x=Math.PI/2; xzE.position.copy(xz.position); walls.add(xzE);
  const yz=makeGlass(PLATE,0xF0E442,0.009); yz.rotation.y=Math.PI/2; yz.position.set(-WALL,0,0); walls.add(yz);
  const yzG=makeGrid(PLATE,12,0xF0E442,0.028); yzG.rotation.y=Math.PI/2; yzG.position.copy(yz.position); walls.add(yzG);
  const yzE=makeEdge(PLATE,0xF0E442,0.04); yzE.rotation.y=Math.PI/2; yzE.position.copy(yz.position); walls.add(yzE);

  const axes=new THREE.Group(); starGroup.add(axes);
  function axle(dir,color){ return new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), dir.clone().multiplyScalar(WALL*0.95)]), new THREE.LineBasicMaterial({ color:new THREE.Color(color), transparent:true, opacity:0.38 })); }
  axes.add(axle(new THREE.Vector3(1,0,0),0x56B4E9));
  axes.add(axle(new THREE.Vector3(0,1,0),0xF0E442));
  axes.add(axle(new THREE.Vector3(0,0,1),0xD55E00));
  const xl=makeLabel('X: PAINT ↔ PERIM','#56B4E9','#081018',360,46,1.85); xl.position.set(WALL+0.26,0,0); axes.add(xl);
  const yl=makeLabel('Y: ROLE → SCORE','#F0E442','#1A150F',360,46,1.85); yl.position.set(0,WALL+0.26,0); axes.add(yl);
  const zl=makeLabel('Z: DEF ↔ OFF','#D55E00','#FFFEF7',340,46,1.75); zl.position.set(0,0,WALL+0.32); axes.add(zl);

  let players=[];
  try{
    // bust SW cache v10 -> v11, use no-store
    const r=await fetch('assets/vectors_search_lite.json?v=11',{cache:'no-store'});
    const j=await r.json(); players=j.players||[];
    console.log('star-map v5 loaded players', players.length);
  }catch(e){ console.warn('lite fetch fail, random fallback',e); }

  const count=players.length||12966;
  const positions=new Float32Array(count*3);
  const colors=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const p=players[i]||{x:Math.random(), y:Math.random(), z:Math.random(), c:i%8};
    positions[i*3]=(p.x-0.5)*2*SPREAD;
    positions[i*3+1]=(p.y-0.5)*2*SPREAD;
    positions[i*3+2]=(p.z-0.5)*2*SPREAD;
    const col=new THREE.Color(OKABE_VISIBLE[(p.c||0)%8]);
    // boost low-end colors a bit so they pop on black
    if((p.c||0)%8===7) { /* white star boost */ }
    else col.lerp(new THREE.Color(0xFFFFFF),0.05);
    colors[i*3]=col.r; colors[i*3+1]=col.g; colors[i*3+2]=col.b;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const pointSize = isMobile ? 0.26 : 0.34; // was 0.09 invisible
  const mat=new THREE.PointsMaterial({ 
    size: pointSize,
    vertexColors:true, 
    transparent:true, 
    opacity:1, 
    sizeAttenuation:true, 
    depthWrite:false,
    blending: THREE.NormalBlending
  });
  const points=new THREE.Points(geo,mat);
  points.renderOrder=10;
  starGroup.add(points);

  // fallback bright core for MJ placeholder if needed
  if(players.length===0){
    console.warn('star-map v5: players empty, showing random cloud');
  }

  let rotY=Math.PI*0.24, rotX=0.18, auto=true, autoSpeed=0.00020, dragging=false, lx=0, ly=0, idle=0;
  const proj=new Array(count);
  function updProj(W,H){
    W=W||canvas.getBoundingClientRect().width||canvas.parentElement?.getBoundingClientRect().width||640;
    H=H||canvas.getBoundingClientRect().height||520;
    const cy=Math.cos(rotY), sy=Math.sin(rotY), cx=Math.cos(rotX), sx=Math.sin(rotX);
    const persp=2.2;
    for(let i=0;i<count;i++){
      const ox=positions[i*3], oy=positions[i*3+1], oz=positions[i*3+2];
      const xr=ox*cy+oz*sy, z1=-ox*sy+oz*cy, yr=oy*cx - z1*sx, zr=oy*sx + z1*cx;
      const sc=persp/(persp - zr*0.38);
      proj[i]={ sx:W*0.5+xr*sc*(W*0.42), sy:H*0.5-yr*sc*(H*0.42), n:players[i]?.n, s:players[i]?.s, c:players[i]?.c };
    }
  }
  const hoverTip=document.getElementById('hover-tip');

  function getSize(){
    const rect=canvas.getBoundingClientRect();
    let w=rect.width, h=rect.height;
    if(w<10||h<10){
      const pr=canvas.parentElement?.getBoundingClientRect();
      w=Math.max(w, pr?.width||0, 320); h=Math.max(h, pr?.height||0, 520);
      if(w<10) w= window.innerWidth || 390;
      if(h<10) h= Math.round((window.innerHeight||800)*0.78);
    }
    return {w:Math.max(10,Math.round(w)), h:Math.max(10,Math.round(h))};
  }
  function onResize(){
    const {w,h}=getSize();
    canvas.style.width=w+'px'; canvas.style.height=h+'px';
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
    updProj(w,h);
    renderer.render(scene,camera);
  }
  let ro;
  try{
    ro=new ResizeObserver(onResize); ro.observe(canvas); 
    if(canvas.parentElement) ro.observe(canvas.parentElement);
  }catch{}
  onResize();
  // android quirks double-call
  setTimeout(onResize, 60);
  setTimeout(onResize, 250);
  setTimeout(onResize, 800);

  let visible=true; let firstFrames=120;
  try{
    const io=new IntersectionObserver(es=>{ 
      visible=es[0]?.isIntersecting??true; 
      if(visible) onResize(); 
    },{threshold:0.01});
    io.observe(canvas);
  }catch{}

  function ptr(e){ return e.touches? e.touches[0] : e; }
  function down(e){ dragging=true; auto=false; const p=ptr(e); lx=p.clientX; ly=p.clientY; canvas.style.cursor='grabbing'; const b=document.getElementById('btn-pause'); if(b) b.textContent='Resume'; }
  function move(e){
    const p=ptr(e); const x=p.clientX, y=p.clientY;
    if(dragging){ const dx=x-lx, dy=y-ly; rotY+=dx*0.0072; rotX+=dy*0.005; rotX=Math.max(-0.92,Math.min(0.92,rotX)); lx=x; ly=y; const s=getSize(); updProj(s.w,s.h); }
    else{
      const rect=canvas.getBoundingClientRect(); const mx=x-rect.left, my=y-rect.top;
      let best=null,bd=isMobile?34:28;
      for(let i=0;i<count;i++){ const pr=proj[i]; if(!pr) continue; const d=Math.hypot(pr.sx-mx, pr.sy-my); if(d<bd){ bd=d; best=pr; } }
      if(best&&hoverTip){ hoverTip.style.display='block'; hoverTip.style.left=best.sx+'px'; hoverTip.style.top=(best.sy-30)+'px'; hoverTip.innerHTML=`<b>${best.n||''}</b> ${best.s||''}<br><span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.68">${ARCH[best.c%8]||''}</span>`; }
      else if(hoverTip) hoverTip.style.display='none';
    }
  }
  function up(){ if(dragging){ dragging=false; idle=4200; canvas.style.cursor='grab'; } }
  canvas.addEventListener('mousedown',down); canvas.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
  canvas.addEventListener('touchstart',down,{passive:true}); canvas.addEventListener('touchmove',move,{passive:true}); canvas.addEventListener('touchend',up);
  canvas.addEventListener('mouseleave',()=>{ if(hoverTip) hoverTip.style.display='none'; });

  const btnPause=document.getElementById('btn-pause'), btnReset=document.getElementById('btn-reset');
  if(btnPause) btnPause.addEventListener('click',()=>{ auto=!auto; btnPause.textContent=auto?'Pause':'Resume'; if(auto) idle=0; });
  if(btnReset) btnReset.addEventListener('click',()=>{ rotY=Math.PI*0.24; rotX=0.18; auto=true; if(btnPause) btnPause.textContent='Pause'; });

  updProj(); renderer.render(scene,camera);
  console.log('star-map v5 mounted, count',count,'size',pointSize);

  let last=0, t0=performance.now();
  function loop(t){
    requestAnimationFrame(loop);
    if(!visible && firstFrames<=0){ last=t; return; }
    if(firstFrames>0){ firstFrames--; }
    if(!last) last=t;
    const dt=Math.min(50,t-last); last=t;
    if(!dragging&&auto) rotY+=dt*autoSpeed; else if(idle){ idle-=dt; if(idle<=0){ auto=true; if(btnPause) btnPause.textContent='Pause'; } }
    starGroup.rotation.y=rotY; starGroup.rotation.x=rotX;
    const et=(performance.now()-t0)*0.001;
    camera.position.x=Math.sin(et*0.045)*0.16; 
    camera.position.y=0.42+Math.sin(et*0.06)*0.08;
    camera.lookAt(0,0.06,0);
    renderer.render(scene,camera);
  }
  loop(0);
  return { dispose:()=>{ try{ro&&ro.disconnect();}catch{} renderer.dispose(); } };
}
