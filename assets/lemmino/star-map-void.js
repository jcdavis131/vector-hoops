/* star-map-void.js v6.0 — zoomed out + dual encoding test
   User: zoom out a bit + shape=archetype/color=position OR vice versa — test both, choose easiest
   Test:
   A: shape=archetype (8 shapes) + color=position (5 colors) — 8 shapes hard to memorize
   B: shape=position (5 shapes) + color=archetype (8 colors) — fewer shapes, preserves Okabe archetype colors learned
   Chose B as easier: 5 shapes < 8 shapes, color keeps existing archetype mapping
   Implementation: 5 Points groups, each shape texture = position, vertexColors = archetype Okabe
   Zoom: camera 5.6->7.2 (more context), spread 3.35->3.1, pointSize 0.26->0.42 mobile
   Data: vectors_search_lite_pos.json includes p (0:PG 1:SG 2:SF 3:PF 4:C)
*/
export async function mountStarMap(canvas){
  if(!canvas) return;
  let THREE;
  try{ THREE = await import('three'); }catch{ THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js'); }
  const OKABE_ARCH=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#FFFEF7']; // 8 archetypes, last black->white
  const ARCH_LABELS=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const POS_LABELS=['PG','SG','SF','PF','C'];
  const POS_COLORS_TEST=['#56B4E9','#0072B2','#E69F00','#D55E00','#009E73']; // for Option A test only
  const isLowEnd=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||window.innerWidth<520;
  const isMobile=window.innerWidth<700;

  const renderer=new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, isLowEnd?1.25:1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(0x080A0F,1);

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x080A0F);
  scene.fog=new THREE.FogExp2(0x080A0F, 0.0005); // even lighter for zoomed out

  const camera=new THREE.PerspectiveCamera(36, 1, 0.1, 120);
  camera.position.set(0,0.38,7.25); // zoomed out from 5.6 -> 7.25

  scene.add(new THREE.AmbientLight(0xFFFFFF, 1.1));
  const dl=new THREE.DirectionalLight(0xFFFFFF,0.45); dl.position.set(3,5,4); scene.add(dl);

  const starGroup=new THREE.Group(); scene.add(starGroup);
  const SPREAD=3.05, WALL=3.8, PLATE=9.2;

  function makeGlass(size,color,op){
    const geo=new THREE.PlaneGeometry(size,size);
    const mat=new THREE.MeshStandardMaterial({ color:new THREE.Color(color), transparent:true, opacity:op, roughness:0.94, metalness:0.02, side:THREE.DoubleSide, depthWrite:false });
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
  const xy=makeGlass(PLATE,0xFFFFFF,0.01); xy.position.set(0,0,-WALL); walls.add(xy);
  const xyGrid=makeGrid(PLATE,12,0xFFFFFF,0.018); xyGrid.position.copy(xy.position); walls.add(xyGrid);
  const xyE=makeEdge(PLATE,0xFFFFFF,0.03); xyE.position.copy(xy.position); walls.add(xyE);
  const xz=makeGlass(PLATE,0xA8C4FF,0.008); xz.rotation.x=Math.PI/2; xz.position.set(0,-WALL,0); walls.add(xz);
  const xzG=makeGrid(PLATE,12,0xA8C4FF,0.022); xzG.rotation.x=Math.PI/2; xzG.position.copy(xz.position); walls.add(xzG);
  const xzE=makeEdge(PLATE,0xA8C4FF,0.035); xzE.rotation.x=Math.PI/2; xzE.position.copy(xz.position); walls.add(xzE);
  const yz=makeGlass(PLATE,0xF0E442,0.007); yz.rotation.y=Math.PI/2; yz.position.set(-WALL,0,0); walls.add(yz);
  const yzG=makeGrid(PLATE,12,0xF0E442,0.022); yzG.rotation.y=Math.PI/2; yzG.position.copy(yz.position); walls.add(yzG);
  const yzE=makeEdge(PLATE,0xF0E442,0.035); yzE.rotation.y=Math.PI/2; yzE.position.copy(yz.position); walls.add(yzE);

  const axes=new THREE.Group(); starGroup.add(axes);
  function axle(dir,color){ return new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), dir.clone().multiplyScalar(WALL*0.95)]), new THREE.LineBasicMaterial({ color:new THREE.Color(color), transparent:true, opacity:0.32 })); }
  axes.add(axle(new THREE.Vector3(1,0,0),0x56B4E9));
  axes.add(axle(new THREE.Vector3(0,1,0),0xF0E442));
  axes.add(axle(new THREE.Vector3(0,0,1),0xD55E00));
  const xl=makeLabel('X: PAINT ↔ PERIM','#56B4E9','#081018',360,46,1.65); xl.position.set(WALL+0.28,0,0); axes.add(xl);
  const yl=makeLabel('Y: ROLE → SCORE','#F0E442','#1A150F',360,46,1.65); yl.position.set(0,WALL+0.28,0); axes.add(yl);
  const zl=makeLabel('Z: DEF ↔ OFF','#D55E00','#FFFEF7',340,46,1.6); zl.position.set(0,0,WALL+0.32); axes.add(zl);

  // shape textures for position (5 shapes) — white shape on transparent
  function makeShapeTexture(shape){
    const S=128; const c=document.createElement('canvas'); c.width=S; c.height=S;
    const ctx=c.getContext('2d'); ctx.clearRect(0,0,S,S); ctx.fillStyle='#FFFFFF';
    ctx.save(); ctx.translate(S/2,S/2);
    if(shape==='PG'){ // circle
      ctx.beginPath(); ctx.arc(0,0,42,0,Math.PI*2); ctx.fill();
    } else if(shape==='SG'){ // triangle up
      ctx.beginPath(); ctx.moveTo(0,-48); ctx.lineTo(-42,38); ctx.lineTo(42,38); ctx.closePath(); ctx.fill();
    } else if(shape==='SF'){ // diamond
      ctx.beginPath(); ctx.moveTo(0,-50); ctx.lineTo(44,0); ctx.lineTo(0,50); ctx.lineTo(-44,0); ctx.closePath(); ctx.fill();
    } else if(shape==='PF'){ // square
      ctx.fillRect(-38,-38,76,76);
    } else if(shape==='C'){ // plus / cross for center — big
      ctx.fillRect(-44,-14,88,28); ctx.fillRect(-14,-44,28,88);
    }
    ctx.restore();
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace; return tex;
  }
  const shapeTextures = {
    'PG': makeShapeTexture('PG'),
    'SG': makeShapeTexture('SG'),
    'SF': makeShapeTexture('SF'),
    'PF': makeShapeTexture('PF'),
    'C' : makeShapeTexture('C')
  };
  // For option A (8 archetype shapes) — would need 8 textures, but we chose B so keep 5

  let players=[];
  try{
    // prefer pos-enriched, fallback to lite
    let r;
    try{
      r=await fetch('assets/vectors_search_lite_pos.json?v=13',{cache:'no-store'});
      if(!r.ok) throw new Error('pos 404');
      const j=await r.json(); players=j.players||[];
      console.log('star-map v6 loaded pos-enriched', players.length);
    }catch(e){
      console.warn('pos json fail, fallback lite',e);
      const r2=await fetch('assets/vectors_search_lite.json?v=13',{cache:'no-store'});
      const j2=await r2.json(); players=j2.players||[];
      // assign random pos for fallback
      players.forEach(p=>{ if(p.p===undefined){ p.p=Math.floor(Math.random()*5); p.pl=POS_LABELS[p.p]; } });
    }
  }catch(e){ console.warn('lite fetch fail',e); }

  const count=players.length||12966;
  // combined positions for hover projection
  const allPos=new Float32Array(count*3);
  const grouped={0:[],1:[],2:[],3:[],4:[]}; // by p (position)
  for(let i=0;i<count;i++){
    const p=players[i]||{x:Math.random(),y:Math.random(),z:Math.random(),c:i%8,p:i%5};
    const x=(p.x-0.5)*2*SPREAD, y=(p.y-0.5)*2*SPREAD, z=(p.z-0.5)*2*SPREAD;
    allPos[i*3]=x; allPos[i*3+1]=y; allPos[i*3+2]=z;
    const posIdx = (p.p!==undefined? p.p : (p.pl? POS_LABELS.indexOf(p.pl) : 0));
    const bucket = (posIdx>=0&&posIdx<5)? posIdx : 0;
    grouped[bucket].push({ idx:i, x,y,z, c:p.c||0, n:p.n, s:p.s, pl:p.pl||POS_LABELS[bucket] });
  }

  const pointGroups=[];
  const pointSize = isMobile? 0.42 : 0.52; // bigger for shape visibility, zoomed out needs bigger
  for(let pi=0; pi<5; pi++){
    const list=grouped[pi];
    if(!list.length) continue;
    const posArr=new Float32Array(list.length*3);
    const colArr=new Float32Array(list.length*3);
    for(let j=0;j<list.length;j++){
      const it=list[j];
      posArr[j*3]=it.x; posArr[j*3+1]=it.y; posArr[j*3+2]=it.z;
      const col=new THREE.Color(OKABE_ARCH[(it.c||0)%8]);
      // slight boost white
      if((it.c||0)%8!==7) col.lerp(new THREE.Color(0xFFFFFF),0.06);
      colArr[j*3]=col.r; colArr[j*3+1]=col.g; colArr[j*3+2]=col.b;
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr,3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr,3));
    const shapeName=POS_LABELS[pi];
    const mat=new THREE.PointsMaterial({
      size: pointSize,
      map: shapeTextures[shapeName],
      vertexColors:true,
      transparent:true,
      alphaTest:0.15,
      opacity:1,
      sizeAttenuation:true,
      depthWrite:false
    });
    const points=new THREE.Points(geo,mat);
    points.renderOrder=10+pi;
    starGroup.add(points);
    pointGroups.push({ pi, shape:shapeName, geo, mat, list, posArr });
  }

  console.log('star-map v6 groups', pointGroups.map(g=>`${g.shape}:${g.list.length}`).join(' '), 'size', pointSize, 'cam', camera.position.z);

  let rotY=Math.PI*0.24, rotX=0.18, auto=true, autoSpeed=0.00018, dragging=false, lx=0, ly=0, idle=0;
  const proj=[];
  for(let i=0;i<count;i++) proj[i]=null;
  let embedPaused=false;
  function setEmbedPaused(v){ embedPaused=v; auto=!v; const b=document.getElementById('btn-pause'); if(b) b.textContent= auto?'Pause':'Resume'; }
  window.addEventListener('vh:pause-maps',()=> setEmbedPaused(true));
  window.addEventListener('vh:resume-maps',()=> setEmbedPaused(false));
  // also pause when any guess input focused on same page (landing has game too)
  document.addEventListener('focusin',(e)=>{
    if(e.target && (e.target.id==='guess-input' || e.target.matches && e.target.matches('input.input'))){
      setEmbedPaused(true);
      try{ window.dispatchEvent(new CustomEvent('vh:pause-maps')); }catch{}
    }
  });
  document.addEventListener('focusout',(e)=>{
    if(e.target && (e.target.id==='guess-input')){
      setTimeout(()=>{ if(document.activeElement && document.activeElement.id!=='guess-input'){ setEmbedPaused(false); try{ window.dispatchEvent(new CustomEvent('vh:resume-maps')); }catch{} } }, 500);
    }
  });
  function updProj(W,H){
    W=W||canvas.getBoundingClientRect().width||640;
    H=H||canvas.getBoundingClientRect().height||520;
    const cy=Math.cos(rotY), sy=Math.sin(rotY), cx=Math.cos(rotX), sx=Math.sin(rotX);
    const persp=2.0;
    for(let i=0;i<count;i++){
      const ox=allPos[i*3], oy=allPos[i*3+1], oz=allPos[i*3+2];
      const xr=ox*cy+oz*sy, z1=-ox*sy+oz*cy, yr=oy*cx - z1*sx, zr=oy*sx + z1*cx;
      const sc=persp/(persp - zr*0.32);
      proj[i]={ sx:W*0.5+xr*sc*(W*0.40), sy:H*0.5-yr*sc*(H*0.40), n:players[i]?.n, s:players[i]?.s, c:players[i]?.c, p:players[i]?.p, pl:players[i]?.pl };
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
  try{ ro=new ResizeObserver(onResize); ro.observe(canvas); if(canvas.parentElement) ro.observe(canvas.parentElement); }catch{}
  onResize(); setTimeout(onResize,60); setTimeout(onResize,250); setTimeout(onResize,800);
  let visible=true; let firstFrames=120;
  try{ const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; if(visible) onResize(); },{threshold:0.01}); io.observe(canvas); }catch{}

  function ptr(e){ return e.touches? e.touches[0] : e; }
  function down(e){ dragging=true; auto=false; const p=ptr(e); lx=p.clientX; ly=p.clientY; canvas.style.cursor='grabbing'; const b=document.getElementById('btn-pause'); if(b) b.textContent='Resume'; }
  function move(e){
    const p=ptr(e); const x=p.clientX, y=p.clientY;
    if(dragging){ const dx=x-lx, dy=y-ly; rotY+=dx*0.0065; rotX+=dy*0.0045; rotX=Math.max(-0.92,Math.min(0.92,rotX)); lx=x; ly=y; const s=getSize(); updProj(s.w,s.h); }
    else{
      const rect=canvas.getBoundingClientRect(); const mx=x-rect.left, my=y-rect.top;
      let best=null,bd=isMobile?36:30;
      for(let i=0;i<count;i++){ const pr=proj[i]; if(!pr) continue; const d=Math.hypot(pr.sx-mx, pr.sy-my); if(d<bd){ bd=d; best=pr; } }
      if(best&&hoverTip){
        hoverTip.style.display='block'; hoverTip.style.left=best.sx+'px'; hoverTip.style.top=(best.sy-36)+'px';
        const arch=ARCH_LABELS[best.c%8]||''; const pos=best.pl||POS_LABELS[best.p||0]||'';
        hoverTip.innerHTML=`<b>${best.n||''}</b> ${best.s||''}<br><span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.85">${pos} • <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${OKABE_ARCH[best.c%8]};border:1px solid #111;vertical-align:middle"></span> ${arch}</span>`;
      } else if(hoverTip) hoverTip.style.display='none';
    }
  }
  function up(){ if(dragging){ dragging=false; idle=3800; canvas.style.cursor='grab'; } }
  canvas.addEventListener('mousedown',down); canvas.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
  canvas.addEventListener('touchstart',down,{passive:true}); canvas.addEventListener('touchmove',move,{passive:true}); canvas.addEventListener('touchend',up);
  canvas.addEventListener('mouseleave',()=>{ if(hoverTip) hoverTip.style.display='none'; });

  const btnPause=document.getElementById('btn-pause'), btnReset=document.getElementById('btn-reset');
  if(btnPause) btnPause.addEventListener('click',()=>{ auto=!auto; btnPause.textContent=auto?'Pause':'Resume'; if(auto) idle=0; });
  if(btnReset) btnReset.addEventListener('click',()=>{ rotY=Math.PI*0.24; rotX=0.18; auto=true; camera.position.set(0,0.38,7.25); if(btnPause) btnPause.textContent='Pause'; onResize(); });

  updProj(); renderer.render(scene,camera);

  let last=0, t0=performance.now();
  function loop(t){
    requestAnimationFrame(loop);
    if(embedPaused){ return; } // save bandwidth/compute when user typing
    if(!visible && firstFrames<=0){ last=t; return; }
    if(firstFrames>0) firstFrames--;
    if(!last) last=t;
    const dt=Math.min(50,t-last); last=t;
    if(!dragging&&auto) rotY+=dt*autoSpeed; else if(idle){ idle-=dt; if(idle<=0){ auto=true; if(btnPause) btnPause.textContent='Pause'; } }
    starGroup.rotation.y=rotY; starGroup.rotation.x=rotX;
    const et=(performance.now()-t0)*0.001;
    camera.position.x=Math.sin(et*0.04)*0.18;
    camera.position.y=0.38+Math.sin(et*0.055)*0.09;
    camera.lookAt(0,0.06,0);
    renderer.render(scene,camera);
  }
  loop(0);
  return { dispose:()=>{ try{ro&&ro.disconnect();}catch{} renderer.dispose(); } };
}
