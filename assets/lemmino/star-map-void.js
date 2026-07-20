/* star-map-void.js — CLEAN READABLE v3.1 — fixed, no leading-space color bug */
export async function mountStarMap(canvas){
  if(!canvas) return;
  const THREE = await import('three');
  const OKABE = ['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const ARCH = ["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const isLowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency<=4) || window.innerWidth<500;

  let renderer;
  try{
    renderer = new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:false, powerPreference:'high-performance' });
  } catch(e){
    console.error('renderer fail', e);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x080A0F, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080A0F);
  scene.fog = new THREE.FogExp2(0x080A0F, 0.004);

  const camera = new THREE.PerspectiveCamera(34, canvas.clientWidth/canvas.clientHeight, 0.1, 100);
  camera.position.set(0,0.6,8.2);

  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.85));
  const d1 = new THREE.DirectionalLight(0xFFFFFF, 0.5); d1.position.set(4,6,3); scene.add(d1);

  const starGroup = new THREE.Group(); scene.add(starGroup);

  const SPREAD=4.0, WALL=3.8, PLATE_SIZE=8.2;

  function makeGlass(size,color,op){
    const geo=new THREE.PlaneGeometry(size,size);
    const mat=new THREE.MeshStandardMaterial({ color:new THREE.Color(color), transparent:true, opacity:op, roughness:0.86, metalness:0.05, side:THREE.DoubleSide, depthWrite:false });
    return new THREE.Mesh(geo,mat);
  }
  function makeGrid(size,div,color,op){
    const g=new THREE.Group();
    const mat=new THREE.LineBasicMaterial({ color:new THREE.Color(color), transparent:true, opacity:op });
    const step=size/div, half=size/2;
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
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color:new THREE.Color(color), transparent:true, opacity:op }));
  }
  function makeLabel(text, bg, fg){
    const c=document.createElement('canvas'); c.width=380; c.height=48;
    const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(2,2,c.width-4,c.height-4,8); ctx.fill();
    ctx.fillStyle=fg; ctx.font='900 13px ui-monospace,monospace'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(text,12,c.height/2+1);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:false });
    const s=new THREE.Sprite(mat); s.scale.set(1.9,0.24,1); return s;
  }

  // Walls
  const walls=new THREE.Group(); starGroup.add(walls);
  const xy=makeGlass(PLATE_SIZE,0xFFFFFF,0.032); xy.position.set(0,0,-WALL); walls.add(xy);
  const xyG=makeGrid(PLATE_SIZE,10,0xFFFFFF,0.06); xyG.position.copy(xy.position); walls.add(xyG);
  const xyE=makeEdge(PLATE_SIZE,0xFFFFFF,0.09); xyE.position.copy(xy.position); walls.add(xyE);

  const xz=makeGlass(PLATE_SIZE,0xA8C4FF,0.028); xz.rotation.x=Math.PI/2; xz.position.set(0,-WALL,0); walls.add(xz);
  const xzG=makeGrid(PLATE_SIZE,10,0xA8C4FF,0.07); xzG.rotation.x=Math.PI/2; xzG.position.copy(xz.position); walls.add(xzG);
  const xzE=makeEdge(PLATE_SIZE,0xA8C4FF,0.10); xzE.rotation.x=Math.PI/2; xzE.position.copy(xz.position); walls.add(xzE);

  const yz=makeGlass(PLATE_SIZE,0xF0E442,0.026); yz.rotation.y=Math.PI/2; yz.position.set(-WALL,0,0); walls.add(yz);
  const yzG=makeGrid(PLATE_SIZE,10,0xF0E442,0.07); yzG.rotation.y=Math.PI/2; yzG.position.copy(yz.position); walls.add(yzG);
  const yzE=makeEdge(PLATE_SIZE,0xF0E442,0.10); yzE.rotation.y=Math.PI/2; yzE.position.copy(yz.position); walls.add(yzE);

  // axes
  function axle(dir,color){ return new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), dir.clone().multiplyScalar(WALL*0.9)]), new THREE.LineBasicMaterial({ color:new THREE.Color(color), transparent:true, opacity:0.5 })); }
  const axes=new THREE.Group(); starGroup.add(axes);
  axes.add(axle(new THREE.Vector3(1,0,0),0x56B4E9));
  axes.add(axle(new THREE.Vector3(0,1,0),0xF0E442));
  axes.add(axle(new THREE.Vector3(0,0,1),0xD55E00));
  const xl=makeLabel('X: PAINT <-> PERIM','#56B4E9','#081018'); xl.position.set(WALL+0.18,0,0); axes.add(xl);
  const yl=makeLabel('Y: ROLE -> SCORE','#F0E442','#1A150F'); yl.position.set(0,WALL+0.18,0); axes.add(yl);
  const zl=makeLabel('Z: DEF <-> OFF','#D55E00','#FFFEF7'); zl.position.set(0,0,WALL+0.22); axes.add(zl);

  starGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.04,8,8), new THREE.MeshBasicMaterial({ color:0xFFFFFF, transparent:true, opacity:0.3 })) );

  // Load data
  let players=[];
  try{
    const r=await fetch('assets/vectors_search_lite.json',{cache:'force-cache'});
    const j=await r.json();
    players=j.players||[];
  }catch(e){ console.warn('lite fetch fail', e); players=[]; }

  const count=players.length||12966;
  const positions=new Float32Array(count*3);
  const colors=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const p=players[i]||{x:Math.random(), y:Math.random(), z:Math.random(), c:i%8};
    positions[i*3]=(p.x-0.5)*2*SPREAD;
    positions[i*3+1]=(p.y-0.5)*2*SPREAD;
    positions[i*3+2]=(p.z-0.5)*2*SPREAD;
    const col=new THREE.Color(OKABE[(p.c||0)%8]);
    colors[i*3]=col.r; colors[i*3+1]=col.g; colors[i*3+2]=col.b;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const pmat=new THREE.PointsMaterial({ size:isLowEnd?0.09:0.14, vertexColors:true, transparent:false, opacity:1.0, sizeAttenuation:true, depthWrite:false, blending:THREE.NormalBlending });
  const points=new THREE.Points(geo,pmat);
  starGroup.add(points);

  // interaction
  let rotY=Math.PI*0.22, rotX=0.18, auto=true, autoSpeed=0.00016, dragging=false, lx=0, ly=0, idle=0;
  const proj=new Array(count);
  function updProj(){
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
    let best=null,bd=22;
    for(let i=0;i<count;i++){ const p=proj[i]; if(!p) continue; const d=Math.hypot(p.sx-mx,p.sy-my); if(d<bd){ bd=d; best=p; } }
    return best;
  }
  const hoverTip=document.getElementById('hover-tip');

  function resize(){
    const w=canvas.clientWidth, h=canvas.clientHeight;
    if(w<10||h<10) return;
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
  }
  const ro=new ResizeObserver(resize); ro.observe(canvas); resize();
  let visible=true; const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; },{threshold:0.01}); io.observe(canvas);

  function down(e){ dragging=true; auto=false; lx=e.touches?e.touches[0].clientX:e.clientX; ly=e.touches?e.touches[0].clientY:e.clientY; canvas.style.cursor='grabbing'; const b=document.getElementById('btn-pause'); if(b) b.textContent='Resume'; }
  function move(e){
    const x=e.touches?e.touches[0].clientX:e.clientX, y=e.touches?e.touches[0].clientY:e.clientY;
    if(dragging){ const dx=x-lx, dy=y-ly; rotY+=dx*0.007; rotX+=dy*0.005; rotX=Math.max(-0.9,Math.min(0.9,rotX)); lx=x; ly=y; updProj(); }
    else { const rect=canvas.getBoundingClientRect(); const mx=x-rect.left, my=y-rect.top; const b=closest(mx,my); if(b&&hoverTip){ hoverTip.style.display='block'; hoverTip.style.left=b.sx+'px'; hoverTip.style.top=(b.sy-28)+'px'; hoverTip.innerHTML='<b>'+(b.n||'')+'</b> '+(b.s||'')+'<br><span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.7">'+(ARCH[b.c%8]||'')+'</span>'; } else if(hoverTip) hoverTip.style.display='none'; }
  }
  function up(){ if(dragging){ dragging=false; idle=3600; canvas.style.cursor='grab'; } }
  canvas.addEventListener('mousedown',down); canvas.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
  canvas.addEventListener('touchstart',down,{passive:true}); canvas.addEventListener('touchmove',move,{passive:true}); canvas.addEventListener('touchend',up);
  canvas.addEventListener('mouseleave',()=>{ if(hoverTip) hoverTip.style.display='none'; });

  const btnPause=document.getElementById('btn-pause'), btnReset=document.getElementById('btn-reset');
  if(btnPause) btnPause.addEventListener('click',()=>{ auto=!auto; btnPause.textContent=auto?'Pause':'Resume'; if(auto) idle=0; });
  if(btnReset) btnReset.addEventListener('click',()=>{ rotY=Math.PI*0.22; rotX=0.18; auto=true; if(btnPause) btnPause.textContent='Pause'; });

  updProj();
  let last=0, t0=performance.now();
  function loop(t){
    requestAnimationFrame(loop);
    if(!visible){ last=t; return; }
    if(!last) last=t;
    const dt=Math.min(48,t-last); last=t;
    if(!dragging&&auto) rotY+=dt*autoSpeed; else if(idle){ idle-=dt; if(idle<=0){ auto=true; if(btnPause) btnPause.textContent='Pause'; } }
    starGroup.rotation.y=rotY; starGroup.rotation.x=rotX;
    const et=(performance.now()-t0)*0.001; camera.position.x=Math.sin(et*0.05)*0.10; camera.position.y=0.6+Math.sin(et*0.08)*0.06; camera.lookAt(0,0.06,0);
    renderer.render(scene,camera);
  }
  loop(0);
  return { renderer, scene, camera, dispose:()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); } };
}
