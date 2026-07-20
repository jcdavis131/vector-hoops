/* star-map-void.js — CLEAN READABLE v3 — no Lemmino text, glass plates for orientation */
export async function mountStarMap(canvas){
  if(!canvas) return;
  const THREE = await import('three');
  const OKABE = ['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const ARCH = ["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const isLowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency<=4) || window.innerWidth<500;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x080A0F, 1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080A0F);
  scene.fog = new THREE.FogExp2(0x080A0F, 0.010);
  const camera = new THREE.PerspectiveCamera(34, canvas.clientWidth/canvas.clientHeight, 0.1, 100);
  camera.position.set(0,0.6,8.2);
  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.82));
  const d1 = new THREE.DirectionalLight(0xFFFFFF, 0.55); d1.position.set(4,6,3); scene.add(d1);
  const starGroup = new THREE.Group(); scene.add(starGroup);

  const SPREAD=4.0, WALL=SPREAD*0.95, PLATE_SIZE=WALL*2.15;
  function makeGlass(size,color,op){
    const geo=new THREE.PlaneGeometry(size,size);
    const mat=new THREE.MeshStandardMaterial({ color:new THREE.Color(color), transparent:true, opacity:op, roughness:0.88, metalness:0.04, side:THREE.DoubleSide, depthWrite:false });
    return new THREE.Mesh(geo,mat);
  }
  function makeGrid(size,div,color,op){
    const g=new THREE.Group();
    const step=size/div, half=size/2;
    const mat=new THREE.LineBasicMaterial({ color, transparent:true, opacity:op });
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
    const pts=[new THREE.Vector3(-s,-s,0), new THREE.Vector3(s,-s,0), new THREE.Vector3(s,s,0), new THREE.Vector3(-s,s,0), new THREE.Vector3(-s,-s,0)];
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({color,transparent:true,opacity:op}));
  }
  function makeLabel(text,bg='#FFFEF7',fg='#1A150F'){
    const c=document.createElement('canvas'); c.width=420; c.height=52;
    const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(2,2,c.width-4,c.height-4,10); ctx.fill();
    ctx.fillStyle=fg; ctx.font='900 14px ui-monospace,monospace'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(text,14,c.height/2+1);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:false });
    const s=new THREE.Sprite(mat); s.scale.set(2.1,0.26,1); return s;
  }

  const walls=new THREE.Group(); starGroup.add(walls);
  const xy=makeGlass(PLATE_SIZE,0xFFFFFF,0.07); xy.position.set(0,0,-WALL); walls.add(xy);
  const xyG=makeGrid(PLATE_SIZE,10,0xFFFFFF,0.13); xyG.position.copy(xy.position); walls.add(xyG);
  walls.add(Object.assign(makeEdge(PLATE_SIZE,0xFFFFFF,0.20),{position:xy.position.clone()}));

  const xz=makeGlass(PLATE_SIZE,0xA8C4FF,0.058); xz.rotation.x=Math.PI/2; xz.position.set(0,-WALL,0); walls.add(xz);
  const xzG=makeGrid(PLATE_SIZE,10,0xA8C4FF,0.16); xzG.rotation.x=Math.PI/2; xzG.position.copy(xz.position); walls.add(xzG);
  const xzE=makeEdge(PLATE_SIZE,0xA8C4FF,0.22); xzE.rotation.copy(xz.rotation); xzE.position.copy(xz.position); walls.add(xzE);

  const yz=makeGlass(PLATE_SIZE,0xF0E442,0.052); yz.rotation.y=Math.PI/2; yz.position.set(-WALL,0,0); walls.add(yz);
  const yzG=makeGrid(PLATE_SIZE,10,0xF0E442,0.15); yzG.rotation.y=Math.PI/2; yzG.position.copy(yz.position); walls.add(yzG);
  const yzE=makeEdge(PLATE_SIZE,0xF0E442,0.22); yzE.rotation.copy(yz.rotation); yzE.position.copy(yz.position); walls.add(yzE);

  function axle(dir,color){ return new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), dir.clone().multiplyScalar(WALL*0.92)]), new THREE.LineBasicMaterial({color,transparent:true,opacity:0.56})); }
  const axes=new THREE.Group(); starGroup.add(axes);
  axes.add(axle(new THREE.Vector3(1,0,0),0x56B4E9));
  axes.add(axle(new THREE.Vector3(0,1,0),0xF0E442));
  axes.add(axle(new THREE.Vector3(0,0,1),0xD55E00));
  const xl=makeLabel('X: PAINT ↔ PERIM',' #56B4E9','#0A0C10'); xl.position.set(WALL+0.22,0,0); axes.add(xl);
  const yl=makeLabel('Y: ROLE → SCORE','#F0E442','#0A0C10'); yl.position.set(0,WALL+0.22,0); axes.add(yl);
  const zl=makeLabel('Z: DEF ↔ OFF','#D55E00','#FFFEF7'); zl.position.set(0,0,WALL+0.26); axes.add(zl);

  const origin=new THREE.Mesh(new THREE.SphereGeometry(0.04,8,8), new THREE.MeshBasicMaterial({color:0xFFFFFF,transparent:true,opacity:0.3}));
  starGroup.add(origin);

  let players=[];
  try{ const r=await fetch('assets/vectors_search_lite.json',{cache:'force-cache'}); const j=await r.json(); players=j.players||[]; }catch(e){ console.warn(e); }

  const count=players.length||12966;
  const positions=new Float32Array(count*3);
  const colors=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const p=players[i]||{x:Math.random(),y:Math.random(),z:Math.random(),c:i%8};
    positions[i*3]=(p.x-0.5)*2*SPREAD;
    positions[i*3+1]=(p.y-0.5)*2*SPREAD;
    positions[i*3+2]=(p.z-0.5)*2*SPREAD;
    const col=new THREE.Color(OKABE[p.c%8]); col.lerp(new THREE.Color(0xFFFFFF),0.10);
    colors[i*3]=col.r; colors[i*3+1]=col.g; colors[i*3+2]=col.b;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions,3));
  g.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const mat=new THREE.PointsMaterial({ size:isLowEnd?0.048:0.062, vertexColors:true, transparent:true, opacity:0.90, sizeAttenuation:true, depthWrite:false, blending:THREE.NormalBlending });
  const points=new THREE.Points(g,mat);
  starGroup.add(points);

  let rotY=Math.PI*0.22, rotX=0.18, auto=true, autoSpeed=0.00018, dragging=false, lx=0, ly=0, idle=0;
  const proj=new Array(count);
  function updateProj(){
    const cy=Math.cos(rotY), sy=Math.sin(rotY), cx=Math.cos(rotX), sx=Math.sin(rotX);
    const persp=2.6, W=canvas.clientWidth, H=canvas.clientHeight;
    for(let i=0;i<count;i++){
      const ox=positions[i*3], oy=positions[i*3+1], oz=positions[i*3+2];
      const xr=ox*cy+oz*sy, z1=-ox*sy+oz*cy, yr=oy*cx - z1*sx, zr=oy*sx + z1*cx;
      const sc=persp/(persp - zr*0.45);
      proj[i]={ sx:W*0.5+xr*sc*(W*0.38), sy:H*0.5-yr*sc*(H*0.38), n:players[i]?.n, s:players[i]?.s, c:players[i]?.c };
    }
  }
  function closest(mx,my){
    let best=null,bd=20;
    for(let i=0;i<count;i++){ const p=proj[i]; if(!p) continue; const d=Math.hypot(p.sx-mx,p.sy-my); if(d<bd){ bd=d; best=p; } }
    return best;
  }
  const hoverTip=document.getElementById('hover-tip');
  function resize(){ const w=canvas.clientWidth,h=canvas.clientHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
  const ro=new ResizeObserver(resize); ro.observe(canvas); resize();
  let visible=true; const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; },{threshold:0.01}); io.observe(canvas);
  function down(e){ dragging=true; auto=false; lx=e.touches?e.touches[0].clientX:e.clientX; ly=e.touches?e.touches[0].clientY:e.clientY; canvas.style.cursor='grabbing'; const b=document.getElementById('btn-pause'); if(b) b.textContent='Resume'; }
  function move(e){
    const x=e.touches?e.touches[0].clientX:e.clientX, y=e.touches?e.touches[0].clientY:e.clientY;
    if(dragging){ const dx=x-lx, dy=y-ly; rotY+=dx*0.007; rotX+=dy*0.005; rotX=Math.max(-0.9,Math.min(0.9,rotX)); lx=x; ly=y; updateProj(); }
    else { const rect=canvas.getBoundingClientRect(); const mx=x-rect.left, my=y-rect.top; const best=closest(mx,my); if(best&&hoverTip){ hoverTip.style.display='block'; hoverTip.style.left=best.sx+'px'; hoverTip.style.top=(best.sy-30)+'px'; hoverTip.innerHTML='<b>'+(best.n||'')+'</b> '+(best.s||'')+'<br><span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.7">'+(ARCH[best.c%8]||'')+'</span>'; } else if(hoverTip) hoverTip.style.display='none'; }
  }
  function up(){ if(dragging){ dragging=false; idle=3800; canvas.style.cursor='grab'; } }
  canvas.addEventListener('mousedown',down); canvas.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
  canvas.addEventListener('touchstart',down,{passive:true}); canvas.addEventListener('touchmove',move,{passive:true}); canvas.addEventListener('touchend',up);
  canvas.addEventListener('mouseleave',()=>{ if(hoverTip) hoverTip.style.display='none'; });
  const btnPause=document.getElementById('btn-pause'), btnReset=document.getElementById('btn-reset');
  if(btnPause) btnPause.addEventListener('click',()=>{ auto=!auto; btnPause.textContent=auto?'Pause':'Resume'; if(auto) idle=0; });
  if(btnReset) btnReset.addEventListener('click',()=>{ rotY=Math.PI*0.22; rotX=0.18; auto=true; if(btnPause) btnPause.textContent='Pause'; });
  updateProj();
  let last=0, t0=performance.now();
  function loop(t){
    requestAnimationFrame(loop); if(!visible){ last=t; return; } if(!last) last=t; const dt=Math.min(48,t-last); last=t;
    if(!dragging&&auto) rotY+=dt*autoSpeed; else if(idle){ idle-=dt; if(idle<=0){ auto=true; if(btnPause) btnPause.textContent='Pause'; } }
    starGroup.rotation.y=rotY; starGroup.rotation.x=rotX;
    const et=(performance.now()-t0)*0.001; camera.position.x=Math.sin(et*0.05)*0.10; camera.position.y=0.6+Math.sin(et*0.08)*0.06; camera.lookAt(0,0.06,0);
    renderer.render(scene,camera);
  }
  loop(0);
  return { renderer, scene, camera, starGroup, dispose:()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); } };
}
