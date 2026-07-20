/* star-map-void.js v7.0 — zoomed out start + pinch-to-zoom + better focus
   #1: Start zoomed out (cam 11.2 vs 7.25), allow wheel + pinch zoom into sections
   - wheel: deltaY -> camZ
   - pinch: two-finger distance ratio -> camZ
   - double-tap / double-click: zoom into cluster around tapped point (tween)
   - Reset returns to zoomed-out 11.2
   Also: retain v16 caching, click-to-play, pause-on-type, low-end LOD 6k, DPR 1.25
*/
export async function mountStarMap(canvas){
  if(!canvas) return;
  let THREE;
  try{ THREE = await import('three'); }catch{ THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js'); }
  const OKABE_ARCH=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#FFFEF7'];
  const ARCH_LABELS=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const POS_LABELS=['PG','SG','SF','PF','C'];
  const isLowEnd=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||window.innerWidth<520;
  const isMobile=window.innerWidth<700;

  const renderer=new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, isLowEnd?1.25:1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(0x080A0F,1);

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x080A0F);
  scene.fog=new THREE.FogExp2(0x080A0F, 0.0004);

  const CAM_Z_DEFAULT=11.2;
  const CAM_Z_MIN=3.2;
  const CAM_Z_MAX=16.0;
  const camera=new THREE.PerspectiveCamera(38, 1, 0.1, 140);
  camera.position.set(0,0.38,CAM_Z_DEFAULT);
  let camZ=CAM_Z_DEFAULT;

  scene.add(new THREE.AmbientLight(0xFFFFFF, 1.1));
  const dl=new THREE.DirectionalLight(0xFFFFFF,0.45); dl.position.set(3,5,4); scene.add(dl);

  const starGroup=new THREE.Group(); scene.add(starGroup);
  const SPREAD=3.15, WALL=3.8, PLATE=9.8;

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
  // v22: grid borders toned way down — was wildly distracting black cube lines
  const xy=makeGlass(PLATE,0xFFFFFF,0.003); xy.position.set(0,0,-WALL); walls.add(xy);
  const xyGrid=makeGrid(PLATE,6,0xFFFFFF,0.006); xyGrid.position.copy(xy.position); walls.add(xyGrid);
  const xyE=makeEdge(PLATE,0xFFFFFF,0.008); xyE.position.copy(xy.position); walls.add(xyE);
  const xz=makeGlass(PLATE,0xA8C4FF,0.0025); xz.rotation.x=Math.PI/2; xz.position.set(0,-WALL,0); walls.add(xz);
  const xzG=makeGrid(PLATE,6,0xA8C4FF,0.005); xzG.rotation.x=Math.PI/2; xzG.position.copy(xz.position); walls.add(xzG);
  const xzE=makeEdge(PLATE,0xA8C4FF,0.008); xzE.rotation.x=Math.PI/2; xzE.position.copy(xz.position); walls.add(xzE);
  const yz=makeGlass(PLATE,0xF0E442,0.002); yz.rotation.y=Math.PI/2; yz.position.set(-WALL,0,0); walls.add(yz);
  const yzG=makeGrid(PLATE,6,0xF0E442,0.005); yzG.rotation.y=Math.PI/2; yzG.position.copy(yz.position); walls.add(yzG);
  const yzE=makeEdge(PLATE,0xF0E442,0.008); yzE.rotation.y=Math.PI/2; yzE.position.copy(yz.position); walls.add(yzE);

  const axes=new THREE.Group(); starGroup.add(axes);
  function axle(dir,color){ return new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), dir.clone().multiplyScalar(WALL*0.90)]), new THREE.LineBasicMaterial({ color:new THREE.Color(color), transparent:true, opacity:0.12 })); }
  axes.add(axle(new THREE.Vector3(1,0,0),0x56B4E9));
  axes.add(axle(new THREE.Vector3(0,1,0),0xF0E442));
  axes.add(axle(new THREE.Vector3(0,0,1),0xD55E00));
  const xl=makeLabel('X: PAINT ↔ PERIM','#56B4E9','#081018',360,46,1.35); xl.position.set(WALL+0.28,0,0); axes.add(xl);
  const yl=makeLabel('Y: ROLE → SCORE','#F0E442','#1A150F',360,46,1.35); yl.position.set(0,WALL+0.28,0); axes.add(yl);
  const zl=makeLabel('Z: DEF ↔ OFF','#D55E00','#FFFEF7',340,46,1.3); zl.position.set(0,0,WALL+0.32); axes.add(zl);

  function makeShapeTexture(shape, filled=true){
    const S=128; const c=document.createElement('canvas'); c.width=S; c.height=S;
    const ctx=c.getContext('2d'); ctx.clearRect(0,0,S,S);
    ctx.save(); ctx.translate(S/2,S/2);
    if(filled){
      ctx.fillStyle='#FFFFFF';
      if(shape==='PG'){ ctx.beginPath(); ctx.arc(0,0,42,0,Math.PI*2); ctx.fill(); }
      else if(shape==='SG'){ ctx.beginPath(); ctx.moveTo(0,-48); ctx.lineTo(-42,38); ctx.lineTo(42,38); ctx.closePath(); ctx.fill(); }
      else if(shape==='SF'){ ctx.beginPath(); ctx.moveTo(0,-50); ctx.lineTo(44,0); ctx.lineTo(0,50); ctx.lineTo(-44,0); ctx.closePath(); ctx.fill(); }
      else if(shape==='PF'){ ctx.fillRect(-38,-38,76,76); }
      else if(shape==='C'){ ctx.fillRect(-44,-14,88,28); ctx.fillRect(-14,-44,28,88); }
    }else{
      // outline only — colored outline behavior
      ctx.strokeStyle='#FFFFFF'; ctx.lineWidth=6; ctx.lineJoin='round'; ctx.lineCap='round';
      if(shape==='PG'){ ctx.beginPath(); ctx.arc(0,0,36,0,Math.PI*2); ctx.stroke(); }
      else if(shape==='SG'){ ctx.beginPath(); ctx.moveTo(0,-44); ctx.lineTo(-38,34); ctx.lineTo(38,34); ctx.closePath(); ctx.stroke(); }
      else if(shape==='SF'){ ctx.beginPath(); ctx.moveTo(0,-46); ctx.lineTo(40,0); ctx.lineTo(0,46); ctx.lineTo(-40,0); ctx.closePath(); ctx.stroke(); }
      else if(shape==='PF'){ ctx.strokeRect(-34,-34,68,68); }
      else if(shape==='C'){ ctx.beginPath(); ctx.moveTo(-40,0); ctx.lineTo(40,0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,-40); ctx.lineTo(0,40); ctx.stroke(); }
    }
    ctx.restore();
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace; return tex;
  }
  const shapeTexturesFilled = {
    'PG': makeShapeTexture('PG', true),
    'SG': makeShapeTexture('SG', true),
    'SF': makeShapeTexture('SF', true),
    'PF': makeShapeTexture('PF', true),
    'C' : makeShapeTexture('C' , true)
  };
  const shapeTexturesOutline = {
    'PG': makeShapeTexture('PG', false),
    'SG': makeShapeTexture('SG', false),
    'SF': makeShapeTexture('SF', false),
    'PF': makeShapeTexture('PF', false),
    'C' : makeShapeTexture('C' , false)
  };
  const shapeTextures = shapeTexturesFilled; // legacy alias

  async function cachedFetchJSON(url){
    const CACHE_NAME='vector-hoops-v24-20260720-quad';
    try{
      if('caches' in window){
        const cache=await caches.open(CACHE_NAME);
        const hit=await cache.match(url);
        if(hit){ return await hit.json(); }
      }
    }catch{}
    const r=await fetch(url,{cache:'default'});
    try{
      if('caches' in window){
        const cache=await caches.open(CACHE_NAME);
        cache.put(url, r.clone()).catch(()=>{});
      }
    }catch{}
    return r.json();
  }

  let players=[], rawAll=[];
  let teamSeasonMap=null;
  try{
    try{
      const j=await cachedFetchJSON('assets/vectors_search_lite_pos.json?v=24');
      rawAll=j.players||[];
    }catch(e){
      const j2=await cachedFetchJSON('assets/vectors_search_lite.json?v=24');
      rawAll=j2.players||j2||[];
      rawAll.forEach(p=>{ if(p.p===undefined){ p.p=Math.floor(Math.random()*5); p.pl=POS_LABELS[p.p]; } });
    }
  }catch(e){ console.warn('lite fetch fail',e); }

  // v22: ONLY CURRENT PLAYERS + data from current/last season
  // Determine current season logic: offseason July -> last completed 2024-25, if middle of season add current
  // We load player_team_season to know who is active
  try{
    const ts=await cachedFetchJSON('assets/player_team_season.json?v=24').catch(()=>null);
    teamSeasonMap=ts;
  }catch{}
  const ACTIVE_SEASONS = ['2024-25','2025-26']; // last + upcoming; in-season we add current
  const LAST_SEASON='2024-25';
  // If teamSeasonMap exists, active names = those in 2024-25 or 2025-26
  let activeNames=new Set();
  if(teamSeasonMap){
    for(const key of Object.keys(teamSeasonMap)){
      const [nm, sea]=key.split('|');
      if(ACTIVE_SEASONS.includes(sea)) activeNames.add(nm);
    }
  }
  // Fallback if no team map: infer from rawAll max seasons
  if(activeNames.size===0){
    rawAll.forEach(p=>{ if(p.s===LAST_SEASON) activeNames.add(p.n); });
  }
  // Build players = only active names, and only their data from current/last season
  // Keep at most 2 per player (2024-25 + 2025-26) if both exist, else 1
  const byNameActive=new Map();
  for(const p of rawAll){
    if(!activeNames.has(p.n)) continue;
    if(!ACTIVE_SEASONS.includes(p.s)) continue;
    if(!byNameActive.has(p.n)) byNameActive.set(p.n,[]);
    byNameActive.get(p.n).push(p);
  }
  // Prefer latest per player, but allow up to 2 if you want trail; spec says current and/or last — so we pick latest only for clean map (548 points not 1100)
  // If mid-season, you'd have both current+last -> we include both to show movement, capped 2
  const INCLUDE_BOTH=false; // set true to show 2 dots per active player; false = 1 dot = latest
  players=[];
  for(const [nm, arr] of byNameActive.entries()){
    arr.sort((a,b)=> a.s.localeCompare(b.s));
    if(INCLUDE_BOTH){ players.push(...arr.slice(-2)); }
    else { players.push(arr[arr.length-1]); }
  }
  console.log('star-map v23 current-only filter', rawAll.length,'->',players.length,'activeNames',activeNames.size);
  // update eyebrow
  try{
    const pill=document.querySelector('.pill-yellow');
    if(pill){ pill.textContent=`${rawAll.length} OUTLINE • ${players.length} CURRENT FILLED`; pill.title=`${rawAll.length} all-time as colored outlines, ${players.length} current 24-25 as filled`; }
    const sub=document.getElementById('viral-today');
    if(sub){ sub.textContent=`${rawAll.length} seasons as outline • ${players.length} current ${LAST_SEASON} filled • shape=POS color=ARCH`; }
  }catch{}

  // Build positions for ALL (outline) and CURRENT (filled)
  const rawCount=rawAll.length||12966;
  const curCount=players.length||569;
  // all positions for projection / hover — use rawAll for outline context
  const allPos=new Float32Array(rawCount*3);
  const groupedAll={0:[],1:[],2:[],3:[],4:[]};
  for(let i=0;i<rawCount;i++){
    const p=rawAll[i]||{x:0.5,y:0.5,z:0.5,c:i%8,p:i%5};
    const x=(p.x-0.5)*2*SPREAD, y=(p.y-0.5)*2*SPREAD, z=(p.z-0.5)*2*SPREAD;
    allPos[i*3]=x; allPos[i*3+1]=y; allPos[i*3+2]=z;
    const posIdx=(p.p!==undefined? p.p : (p.pl? POS_LABELS.indexOf(p.pl):0));
    const bucket=(posIdx>=0&&posIdx<5)? posIdx:0;
    groupedAll[bucket].push({ idx:i, x,y,z, c:p.c||0, n:p.n, s:p.s, pl:p.pl||POS_LABELS[bucket] });
  }
  const grouped={0:[],1:[],2:[],3:[],4:[]}; // current filled
  for(let i=0;i<curCount;i++){
    const p=players[i]||{x:0.5,y:0.5,z:0.5,c:i%8,p:i%5};
    const x=(p.x-0.5)*2*SPREAD, y=(p.y-0.5)*2*SPREAD, z=(p.z-0.5)*2*SPREAD;
    const posIdx=(p.p!==undefined? p.p : (p.pl? POS_LABELS.indexOf(p.pl):0));
    const bucket=(posIdx>=0&&posIdx<5)? posIdx:0;
    grouped[bucket].push({ idx:i, x,y,z, c:p.c||0, n:p.n, s:p.s, pl:p.pl||POS_LABELS[bucket] });
  }

  const pointGroups=[];
  const pointSizeOutline = isMobile? 0.38 : 0.44;
  const pointSizeFilled = isMobile? 0.58 : 0.72;
  // 1) outline layer — every data point as colored outline
  for(let pi=0; pi<5; pi++){
    const list=groupedAll[pi]; if(!list.length) continue;
    const posArr=new Float32Array(list.length*3);
    const colArr=new Float32Array(list.length*3);
    for(let j=0;j<list.length;j++){
      const it=list[j]; posArr[j*3]=it.x; posArr[j*3+1]=it.y; posArr[j*3+2]=it.z;
      const col=new THREE.Color(OKABE_ARCH[(it.c||0)%8]); col.lerp(new THREE.Color(0xFFFFFF),0.04);
      colArr[j*3]=col.r; colArr[j*3+1]=col.g; colArr[j*3+2]=col.b;
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr,3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr,3));
    const shapeName=POS_LABELS[pi];
    const mat=new THREE.PointsMaterial({
      size: pointSizeOutline,
      map: shapeTexturesOutline[shapeName],
      vertexColors:true,
      transparent:true,
      alphaTest:0.08,
      opacity:0.34,
      sizeAttenuation:true,
      depthWrite:false
    });
    const points=new THREE.Points(geo,mat);
    points.renderOrder=5+pi;
    starGroup.add(points);
    pointGroups.push({ pi, shape:shapeName, layer:'outline', geo, mat, list, posArr });
  }
  // 2) filled layer — only current/latest season outlined + filled
  for(let pi=0; pi<5; pi++){
    const list=grouped[pi]; if(!list.length) continue;
    const posArr=new Float32Array(list.length*3);
    const colArr=new Float32Array(list.length*3);
    for(let j=0;j<list.length;j++){
      const it=list[j]; posArr[j*3]=it.x; posArr[j*3+1]=it.y; posArr[j*3+2]=it.z;
      const col=new THREE.Color(OKABE_ARCH[(it.c||0)%8]);
      colArr[j*3]=col.r; colArr[j*3+1]=col.g; colArr[j*3+2]=col.b;
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr,3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr,3));
    const shapeName=POS_LABELS[pi];
    const mat=new THREE.PointsMaterial({
      size: pointSizeFilled,
      map: shapeTexturesFilled[shapeName],
      vertexColors:true,
      transparent:true,
      alphaTest:0.12,
      opacity:1,
      sizeAttenuation:true,
      depthWrite:false
    });
    const points=new THREE.Points(geo,mat);
    points.renderOrder=20+pi;
    starGroup.add(points);
    pointGroups.push({ pi, shape:shapeName, layer:'filled', geo, mat, list, posArr });
  }

  console.log('star-map v23 groups outline+filled', pointGroups.map(g=>`${g.layer}:${g.shape}:${g.list.length}`).join(' '), 'camZ', camZ);

  let rotY=Math.PI*0.24, rotX=0.18, auto=false, autoSpeed=0.00018, dragging=false, lx=0, ly=0, idle=0;
  const proj=[]; for(let i=0;i<rawCount;i++) proj[i]=null;
  let embedPaused=true;
  let pinchStartDist=0, pinchStartZ=CAM_Z_DEFAULT, isPinching=false;
  function clampZ(z){ return Math.max(CAM_Z_MIN, Math.min(CAM_Z_MAX, z)); }
  function setZ(z, fromUI=false){
    camZ=clampZ(z); camera.position.z=camZ;
    if(fromUI){
      const btn=document.getElementById('btn-pause');
      // keep paused state but update label if needed
    }
  }

  window.addEventListener('vh:pause-maps',()=>{ embedPaused=true; auto=false; });
  document.addEventListener('focusin',(e)=>{
    if(e.target && (e.target.id==='guess-input' || e.target.matches && e.target.matches('input.input'))){
      embedPaused=true;
    }
  });

  function updProj(W,H){
    W=W||canvas.getBoundingClientRect().width||640;
    H=H||canvas.getBoundingClientRect().height||520;
    const cy=Math.cos(rotY), sy=Math.sin(rotY), cx=Math.cos(rotX), sx=Math.sin(rotX);
    const persp=2.0;
    const useCount=rawCount||curCount||12966;
    for(let i=0;i<useCount;i++){
      const ox=allPos[i*3], oy=allPos[i*3+1], oz=allPos[i*3+2];
      const xr=ox*cy+oz*sy, z1=-ox*sy+oz*cy, yr=oy*cx - z1*sx, zr=oy*sx + z1*cx;
      const sc=persp/(persp - zr*0.32);
      proj[i]={ sx:W*0.5+xr*sc*(W*0.40), sy:H*0.5-yr*sc*(H*0.40), n:rawAll[i]?.n, s:rawAll[i]?.s, c:rawAll[i]?.c, p:rawAll[i]?.p, pl:rawAll[i]?.pl };
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

  function distTouches(touches){
    const a=touches[0], b=touches[1];
    return Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY);
  }
  function ptr(e){ return e.touches? e.touches[0] : e; }
  function down(e){
    if(e.touches && e.touches.length===2){
      isPinching=true; dragging=false; pinchStartDist=distTouches(e.touches); pinchStartZ=camZ;
      return;
    }
    dragging=true; auto=false; isPinching=false;
    const p=ptr(e); lx=p.clientX; ly=p.clientY; canvas.style.cursor='grabbing';
    const b=document.getElementById('btn-pause'); if(b && !embedPaused) b.textContent='❚❚ Pause';
  }
  function move(e){
    if(isPinching && e.touches && e.touches.length===2){
      e.preventDefault();
      const d=distTouches(e.touches);
      const ratio=pinchStartDist / (d||1);
      setZ(pinchStartZ * ratio);
      const s=getSize(); updProj(s.w,s.h);
      return;
    }
    const p=ptr(e); const x=p.clientX, y=p.clientY;
    if(dragging){ const dx=x-lx, dy=y-ly; rotY+=dx*0.0065; rotX+=dy*0.0045; rotX=Math.max(-0.92,Math.min(0.92,rotX)); lx=x; ly=y; const s=getSize(); updProj(s.w,s.h); }
    else{
      const rect=canvas.getBoundingClientRect(); const mx=x-rect.left, my=y-rect.top;
      let best=null,bd=isMobile?36:30;
      const searchCount=rawCount||curCount||12966;
      for(let i=0;i<searchCount;i++){ const pr=proj[i]; if(!pr) continue; const d=Math.hypot(pr.sx-mx, pr.sy-my); if(d<bd){ bd=d; best=pr; } }
      if(best&&hoverTip){
        hoverTip.style.display='block'; hoverTip.style.left=best.sx+'px'; hoverTip.style.top=(best.sy-36)+'px';
        const arch=ARCH_LABELS[best.c%8]||''; const pos=best.pl||POS_LABELS[best.p||0]||'';
        const isCurrent=activeNames.has(best.n) && ACTIVE_SEASONS.includes(best.s);
        hoverTip.innerHTML=`<b>${best.n||''}</b> ${best.s||''} ${isCurrent? '<span style="background:#F0E442;color:#111;padding:1px 5px;border-radius:6px;font-size:9px">CURRENT</span>':''}<br><span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.85">${pos} • <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${OKABE_ARCH[best.c%8]};border:1px solid #111;vertical-align:middle"></span> ${arch} • z${camZ.toFixed(1)}</span>`;
      } else if(hoverTip) hoverTip.style.display='none';
    }
  }
  function up(e){
    if(isPinching){ isPinching=false; pinchStartDist=0; }
    if(dragging){ dragging=false; idle=3800; canvas.style.cursor='grab'; }
  }
  canvas.addEventListener('mousedown',down); canvas.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
  canvas.addEventListener('touchstart',down,{passive:false}); canvas.addEventListener('touchmove',move,{passive:false}); canvas.addEventListener('touchend',up);
  canvas.addEventListener('mouseleave',()=>{ if(hoverTip) hoverTip.style.display='none'; });
  canvas.addEventListener('wheel',(e)=>{
    e.preventDefault();
    const delta=Math.sign(e.deltaY)*0.45 + e.deltaY*0.0025;
    setZ(camZ + delta);
    const s=getSize(); updProj(s.w,s.h);
    if(!embedPaused) renderer.render(scene,camera);
  },{passive:false});
  canvas.addEventListener('dblclick',(e)=>{
    // zoom into cluster near click
    const rect=canvas.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    let best=null,bd=40;
    const searchCount=rawCount||curCount||12966;
    for(let i=0;i<searchCount;i++){ const pr=proj[i]; if(!pr) continue; const d=Math.hypot(pr.sx-mx, pr.sy-my); if(d<bd){ bd=d; best=pr; } }
    if(best){
      // tween zoom in + rotate towards point
      const targetZ=Math.max(CAM_Z_MIN, camZ*0.55);
      const startZ=camZ;
      const start=performance.now(), dur=420;
      function animate(now){
        const t=Math.min(1, (now-start)/dur);
        const ease=1-Math.pow(1-t,3);
        setZ(startZ + (targetZ-startZ)*ease);
        if(t<1) requestAnimationFrame(animate);
        else { onResize(); }
      }
      requestAnimationFrame(animate);
      embedPaused=false; auto=false;
      const btn=document.getElementById('btn-pause'); if(btn) btn.textContent='❚❚ Pause';
    } else {
      // double click empty -> zoom out
      if(camZ> CAM_Z_DEFAULT*0.9) setZ(CAM_Z_DEFAULT*0.5); else setZ(CAM_Z_DEFAULT);
    }
  });

  const btnPause=document.getElementById('btn-pause'), btnReset=document.getElementById('btn-reset');
  if(btnPause){
    btnPause.textContent='▶ Play map (pinch to zoom)';
    btnPause.addEventListener('click',()=>{
      if(embedPaused){
        embedPaused=false; auto=true; btnPause.textContent='❚❚ Pause — scroll/pinch to zoom';
        const sz=getSize(); updProj(sz.w,sz.h);
      }else{
        embedPaused=true; auto=false; btnPause.textContent='▶ Play map (zoomed out)';
      }
    });
  }
  if(btnReset) btnReset.addEventListener('click',()=>{
    rotY=Math.PI*0.24; rotX=0.18; embedPaused=false; auto=true; setZ(CAM_Z_DEFAULT);
    if(btnPause) btnPause.textContent='❚❚ Pause — scroll/pinch to zoom';
    onResize();
  });

  updProj(); renderer.render(scene,camera);

  let last=0;
  function loop(t){
    requestAnimationFrame(loop);
    if(embedPaused){ return; }
    if(!visible && firstFrames<=0){ last=t; return; }
    if(firstFrames>0) firstFrames--;
    if(!last) last=t;
    const dt=Math.min(50,t-last); last=t;
    if(!dragging&&auto&&!isPinching) rotY+=dt*autoSpeed; else if(idle){ idle-=dt; if(idle<=0){ auto=true; const b=document.getElementById('btn-pause'); if(b) b.textContent='❚❚ Pause — scroll/pinch to zoom'; } }
    starGroup.rotation.y=rotY; starGroup.rotation.x=rotX;
    const et=t*0.001;
    camera.position.x=Math.sin(et*0.04)*0.18;
    camera.position.y=0.38+Math.sin(et*0.055)*0.09;
    camera.lookAt(0,0.06,0);
    renderer.render(scene,camera);
  }
  loop(0);
  return { dispose:()=>{ try{ro&&ro.disconnect();}catch{} renderer.dispose(); } };
}
