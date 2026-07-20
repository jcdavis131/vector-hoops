/* star-map-void.js v4.1 — Force first frames + fallback resize (black void fix)
   - Full-bleed 100vw mobile, 78vh, 56px safe-area, 44px touch
   - Guarantees first render even if IO says not visible, handles w<h 10 fallback via parent rect
   - vivid Okabe 0.145/0.09 lowEnd, fog 0.0038, glass 0.022
*/
export async function mountStarMap(canvas){
  if(!canvas) return;
  const THREE = await import('three');
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const ARCH=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const isLowEnd=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||window.innerWidth<520;

  const renderer=new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, isLowEnd?1.2:1.7));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(0x080A0F,1);

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x080A0F);
  scene.fog=new THREE.FogExp2(0x080A0F, 0.0038);

  const camera=new THREE.PerspectiveCamera(32, 1, 0.1, 120);
  camera.position.set(0,0.55,8.6);

  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.92));
  const dl=new THREE.DirectionalLight(0xFFFFFF,0.42); dl.position.set(3,5,4); scene.add(dl);

  const starGroup=new THREE.Group(); scene.add(starGroup);
  const SPREAD=4.2, WALL=3.9, PLATE=8.6;

  function makeGlass(size,color,op){
    const geo=new THREE.PlaneGeometry(size,size);
    const mat=new THREE.MeshStandardMaterial({ color:new THREE.Color(color), transparent:true, opacity:op, roughness:0.92, metalness:0.04, side:THREE.DoubleSide, depthWrite:false });
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
  const xy=makeGlass(PLATE,0xFFFFFF,0.022); xy.position.set(0,0,-WALL); walls.add(xy);
  walls.add(Object.assign(makeGrid(PLATE,12,0xFFFFFF,0.05),{position:xy.position.clone()}));
  const xyE=makeEdge(PLATE,0xFFFFFF,0.07); xyE.position.copy(xy.position); walls.add(xyE);
  const xz=makeGlass(PLATE,0xA8C4FF,0.02); xz.rotation.x=Math.PI/2; xz.position.set(0,-WALL,0); walls.add(xz);
  const xzG=makeGrid(PLATE,12,0xA8C4FF,0.055); xzG.rotation.x=Math.PI/2; xzG.position.copy(xz.position); walls.add(xzG);
  const xzE=makeEdge(PLATE,0xA8C4FF,0.08); xzE.rotation.x=Math.PI/2; xzE.position.copy(xz.position); walls.add(xzE);
  const yz=makeGlass(PLATE,0xF0E442,0.018); yz.rotation.y=Math.PI/2; yz.position.set(-WALL,0,0); walls.add(yz);
  const yzG=makeGrid(PLATE,12,0xF0E442,0.055); yzG.rotation.y=Math.PI/2; yzG.position.copy(yz.position); walls.add(yzG);
  const yzE=makeEdge(PLATE,0xF0E442,0.08); yzE.rotation.y=Math.PI/2; yzE.position.copy(yz.position); walls.add(yzE);

  const axes=new THREE.Group(); starGroup.add(axes);
  function axle(dir,color){ return new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), dir.clone().multiplyScalar(WALL*0.95)]), new THREE.LineBasicMaterial({ color:new THREE.Color(color), transparent:true, opacity:0.42 })); }
  axes.add(axle(new THREE.Vector3(1,0,0),0x56B4E9));
  axes.add(axle(new THREE.Vector3(0,1,0),0xF0E442));
  axes.add(axle(new THREE.Vector3(0,0,1),0xD55E00));
  const xl=makeLabel('X: PAINT ↔ PERIM','#56B4E9','#081018',360,46,1.85); xl.position.set(WALL+0.22,0,0); axes.add(xl);
  const yl=makeLabel('Y: ROLE → SCORE','#F0E442','#1A150F',360,46,1.85); yl.position.set(0,WALL+0.22,0); axes.add(yl);
  const zl=makeLabel('Z: DEF ↔ OFF','#D55E00','#FFFEF7',340,46,1.75); zl.position.set(0,0,WALL+0.26); axes.add(zl);

  let players=[];
  try{
    const r=await fetch('assets/vectors_search_lite.json',{cache:'force-cache'});
    const j=await r.json(); players=j.players||[];
  }catch(e){ console.warn('lite',e); }

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
  const mat=new THREE.PointsMaterial({ size:isLowEnd?0.09:0.145, vertexColors:true, transparent:false, opacity:1, sizeAttenuation:true, depthWrite:false });
  const points=new THREE.Points(geo,mat);
  starGroup.add(points);

  let rotY=Math.PI*0.24, rotX=0.17, auto=true, autoSpeed=0.00018, dragging=false, lx=0, ly=0, idle=0;
  const proj=new Array(count);
  function updProj(W,H){
    W=W||canvas.clientWidth||canvas.parentElement?.clientWidth||640;
    H=H||canvas.clientHeight||520;
    const cy=Math.cos(rotY), sy=Math.sin(rotY), cx=Math.cos(rotX), sx=Math.sin(rotX);
    const persp=2.7;
    for(let i=0;i<count;i++){
      const ox=positions[i*3], oy=positions[i*3+1], oz=positions[i*3+2];
      const xr=ox*cy+oz*sy, z1=-ox*sy+oz*cy, yr=oy*cx - z1*sx, zr=oy*sx + z1*cx;
      const sc=persp/(persp - zr*0.42);
      proj[i]={ sx:W*0.5+xr*sc*(W*0.38), sy:H*0.5-yr*sc*(H*0.38), n:players[i]?.n, s:players[i]?.s, c:players[i]?.c };
    }
  }
  const hoverTip=document.getElementById('hover-tip');

  function getSize(){
    let w=canvas.clientWidth, h=canvas.clientHeight;
    if(w<10||h<10){
      const r=canvas.parentElement?.getBoundingClientRect();
      w=Math.max(w, r?.width||640); h=Math.max(h, r?.height||520);
    }
    return {w:Math.max(10,w), h:Math.max(10,h)};
  }
  function onResize(){
    const {w,h}=getSize();
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
    updProj(w,h);
  }
  const ro=new ResizeObserver(onResize); ro.observe(canvas);
  onResize();

  let visible=true; let firstFrames=60;
  try{
    const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; },{threshold:0.01});
    io.observe(canvas);
  }catch{}

  function ptr(e){ return e.touches? e.touches[0] : e; }
  function down(e){ dragging=true; auto=false; const p=ptr(e); lx=p.clientX; ly=p.clientY; canvas.style.cursor='grabbing'; const b=document.getElementById('btn-pause'); if(b) b.textContent='Resume'; }
  function move(e){
    const p=ptr(e); const x=p.clientX, y=p.clientY;
    if(dragging){ const dx=x-lx, dy=y-ly; rotY+=dx*0.0072; rotX+=dy*0.005; rotX=Math.max(-0.92,Math.min(0.92,rotX)); lx=x; ly=y; const s=getSize(); updProj(s.w,s.h); }
    else{
      const rect=canvas.getBoundingClientRect(); const mx=x-rect.left, my=y-rect.top;
      let best=null,bd=isLowEnd?28:22;
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
  if(btnReset) btnReset.addEventListener('click',()=>{ rotY=Math.PI*0.24; rotX=0.17; auto=true; if(btnPause) btnPause.textContent='Pause'; });

  updProj(); renderer.render(scene,camera);

  let last=0, t0=performance.now();
  function loop(t){
    requestAnimationFrame(loop);
    if(!visible && firstFrames<=0){ last=t; return; }
    if(firstFrames>0) firstFrames--;
    if(!last) last=t;
    const dt=Math.min(50,t-last); last=t;
    if(!dragging&&auto) rotY+=dt*autoSpeed; else if(idle){ idle-=dt; if(idle<=0){ auto=true; if(btnPause) btnPause.textContent='Pause'; } }
    starGroup.rotation.y=rotY; starGroup.rotation.x=rotX;
    const et=(performance.now()-t0)*0.001;
    camera.position.x=Math.sin(et*0.045)*0.12; camera.position.y=0.55+Math.sin(et*0.06)*0.07;
    camera.lookAt(0,0.06,0);
    renderer.render(scene,camera);
  }
  loop(0);
  return { dispose:()=>{ try{ro.disconnect();}catch{} renderer.dispose(); } };
}
