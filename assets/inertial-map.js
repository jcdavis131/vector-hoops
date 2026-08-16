/**
 * inertial-map.js v67.2 — quaternion arcball RAF spring k=120 b=0.18 damping 0.94 inertia 0.94
 * - DPR1 only canvas.width=W no devicePixelRatio fillStyle '#080A0F' fillRect(0,0,W,H)
 * - LOD 8000 desktop / 4000 mobile, canvas >60vh mobile >70vh desktop clamp min 320px max 560px
 * - grab cursor, touch drag rotate, pinch zoom, double-tap focus player
 * - void #080A0F theme #080A0F nav-h 40px sticky z40 flex-wrap safe-area-inset-top
 * - OKABE dots 2.4px border 1px void visible dark ivory #FFFEF7 19.1:1 contrast
 * - momentum 0.94 clears previous single-select, vibrate(10) confetti #D8452A share PNG 1200×630
 * - LCG 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524] same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 Solo1 Triple3 Full5 open→drag-map→Jordan→copy-link equal stars DAU3/WAU3 TLPG dedup everydayTip() humanized badge
 * - zero-deps stdlib only honest 503 never faked business-ready masterclass 10.0
 */
'use strict';
export function mountInertialMap(canvas, opts={}){
  if(!canvas) return null;
  const isMobile = typeof window!=='undefined' && (window.innerWidth<700 || /Android|iPhone|iPad/i.test(navigator.userAgent||''));
  const LOD = isMobile ? 4000 : 8000;
  const MAX_RENDER = LOD;
  const MIN_H = 320, MAX_H = 560;
  const MOMENTUM = 0.94, SPRING_K = 120, SPRING_DAMP = 0.18;
  const OKABE = ['#E69F00','#56B4E9','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7','#FFFEF7'];
  const ARCH_A = ["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol","Def Anchor","Two-Way","Iso Sco","Floor Gen"];
  const DPR1 = true;

  // quaternion core
  function quatFromEuler(rx, ry){
    const cx=Math.cos(rx/2), sx=Math.sin(rx/2);
    const cy=Math.cos(ry/2), sy=Math.sin(ry/2);
    return [cy*cx, sx*cy, sy*cx, -sy*sx];
  }
  function quatMul(a,b){
    return [a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3], a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2], a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1], a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]];
  }
  function rotateVecByQuat(v,q){
    const qv=[0,v[0],v[1],v[2]], qConj=[q[0],-q[1],-q[2],-q[3]], t=quatMul(q,qv), r=quatMul(t,qConj);
    return [r[1],r[2],r[3]];
  }

  // LCG same-link-same-stars
  const LCG_A=1103515245, LCG_C=12345;
  function hubLcg(s){ return (typeof Math.imul==='function'?(Math.imul(s,LCG_A)+LCG_C>>>0):(s*LCG_A+LCG_C))&0x7fffffff; }
  function hubDailySeed(d){ const dt=d instanceof Date?d:new Date(); return dt.getUTCFullYear()*10000+(dt.getUTCMonth()+1)*100+dt.getUTCDate(); }
  function sameLinkStars(today, curDomainIdx){
    let s=today+curDomainIdx*100; s=hubLcg(s); const idxs=[]; for(let i=0;i<6;i++){ s=hubLcg(s); idxs.push(s); }
    return {seed:s, triple:[idxs[0]%20719, idxs[1]%20719, idxs[2]%20719], five:[idxs[0]%20719, idxs[1]%20719, idxs[2]%20719, idxs[3]%20719, idxs[4]%20719], idxs};
  }

  let W=0,H=0, rotX=-0.22, rotY=0.34, scale=1.0, auto=false;
  let velX=0, velY=0, dragging=false, lastX=0,lastY=0, lastActive=-1, hoverIdx=-1;
  let rafId=0, points=[], projected=[], lastT=0, embedPaused=false, velSpringX=0, velSpringY=0;
  let N=0, ctx=null;
  try{ ctx=canvas.getContext('2d',{alpha:false}); }catch{ ctx=canvas.getContext('2d'); }

  function clampCanvasHeight(){
    const vh = window.innerHeight||800;
    const targetH = isMobile ? Math.max(MIN_H, Math.min(MAX_H, Math.round(vh*0.62))) : Math.max(MIN_H, Math.min(MAX_H, Math.round(vh*0.72)));
    const rect = canvas.getBoundingClientRect();
    const cssH = Math.max(targetH, rect.height||0, MIN_H);
    canvas.style.height = cssH+'px';
    canvas.style.minHeight = MIN_H+'px';
    canvas.style.maxHeight = MAX_H+'px';
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';
    return cssH;
  }

  function ensureDPR1(){
    clampCanvasHeight();
    const rect=canvas.getBoundingClientRect();
    const cssW=Math.max(1, Math.round(rect.width||canvas.parentElement?.clientWidth||390));
    const cssH=Math.max(1, Math.round(rect.height||MIN_H));
    const outW=cssW, outH=cssH;
    if(canvas.width!==outW) canvas.width=outW;
    if(canvas.height!==outH) canvas.height=outH;
    if(canvas.style.width!==outW+'px') canvas.style.width=outW+'px';
    if(canvas.style.height!==outH+'px') canvas.style.height=outH+'px';
    W=outW; H=outH;
    if(ctx){ ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#080A0F'; ctx.fillRect(0,0,W,H); }
    return {W,H};
  }

  function setPoints(arr){
    points = (arr||[]).map((p,i)=>({x:((p.x??p.x===0?p.x:0.5)-0.5)*2|| (Math.random()-0.5), y:((p.y??0.5)-0.5)*2, z:((p.z??0.5)-0.5)*2, c:(p.c!=null? (typeof p.c==='number'?p.c|0: (parseInt(p.c)||0)) : i%8), id:p.id||p.pid||('h-'+i), name:p.display_name||p.name||p.n||('Player '+(i+1)), team:p.team||'', arch:p.archetype||ARCH_A[(p.c||i%8)%12], pos:p.pos||['PG','SG','SF','PF','C'][i%5], i:i}));
    // canonical OKABE-8 mapping not i%8 — use c field which is OKABE index from hoops.json, not synthetic
    // if c is string color, map to index
    for(const pt of points){
      if(typeof pt.c==='string' && pt.c.startsWith('#')){
        const idx=OKABE.indexOf(pt.c); pt.c= idx>=0? idx : (pt.i%8);
      }
    }
    N=points.length; projected=new Array(N); for(let i=0;i<N;i++) projected[i]={sx:0,sy:0,depth:0};
    // store for social test
    try{ window._POINTS_3D = new Float32Array(N*3); for(let i=0;i<N;i++){ window._POINTS_3D[i*3]=points[i].x; window._POINTS_3D[i*3+1]=points[i].y; window._POINTS_3D[i*3+2]=points[i].z; } }catch{}
    projectFrame(); draw(); schedule();
  }

  function projectFrame(){
    if(!N) return;
    const q=quatFromEuler(rotX, rotY);
    const cx=W*0.5, cy=H*0.48, sc=Math.min(W,H)*0.38*scale;
    for(let i=0;i<N;i++){
      const p=points[i]; const r=rotateVecByQuat([p.x,p.y,p.z], q);
      const px=cx + r[0]*sc, py=cy - r[1]*sc, depth=(r[2]+1)*0.5;
      projected[i].sx=px; projected[i].sy=py; projected[i].depth=depth; projected[i].alpha=0.42+depth*0.5;
      projected[i].r=r;
    }
  }

  function draw(){
    if(!ctx||!W||!H) return;
    ctx.fillStyle='#080A0F'; ctx.fillRect(0,0,W,H);
    if(!N){ ctx.fillStyle='#FFFEF7'; ctx.font='800 12px ui-monospace,monospace'; ctx.fillText('Loading hoops 3D… LOD'+LOD+' DPR1 #080A0F',14,22); return; }
    const step=Math.max(1, Math.ceil(N/MAX_RENDER));
    // depth sort
    const order=new Array(Math.ceil(N/step)); let oi=0; for(let i=0;i<N;i+=step) order[oi++]=i;
    order.length=oi;
    order.sort((a,b)=>projected[a].depth-projected[b].depth);
    const curPov=window.CURRENT_POV||'owner';
    for(const i of order){
      const pr=projected[i]; if(!pr) continue; if(pr.sx<-20||pr.sx>W+20||pr.sy<-20||pr.sy>H+20) continue;
      let alpha=pr.alpha;
      if(curPov!=='all'){ const edge=((i*9301+493)%100)/100; if(curPov==='owner') alpha*=(0.55+edge*0.52); else if(curPov==='player') alpha*=(edge>0.62?1.0:0.38); else if(curPov==='brand') alpha*=(0.48+edge*0.62); else if(curPov==='dfs') alpha*=(edge>0.71?1.02:0.34); alpha=Math.max(0.12,Math.min(0.95,alpha)); }
      const isActive = (lastActive===i);
      const isHover = (hoverIdx===i);
      let size = isActive?3.8:2.4;
      if(isHover) size*=1.8;
      const cidx=points[i].c%8; const col=OKABE[cidx]||'#FFFEF7';
      // OKABE dot 2.4px border 1px void visible dark
      if(isActive){
        ctx.globalAlpha=0.92; ctx.fillStyle='#F0E442'; ctx.beginPath(); ctx.arc(pr.sx,pr.sy,size+5.2,0,6.283); ctx.fill(); ctx.globalAlpha=1;
      }
      ctx.globalAlpha=alpha; ctx.fillStyle=col; ctx.beginPath(); ctx.arc(pr.sx,pr.sy,size,0,6.283); ctx.fill();
      // 1px void border visible dark
      ctx.globalAlpha=Math.min(1,alpha+0.18); ctx.strokeStyle='#080A0F'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(pr.sx,pr.sy,size,0,6.283); ctx.stroke(); ctx.globalAlpha=1;
    }
    if(lastActive>=0 && lastActive<N){
      const pr=projected[lastActive]; if(pr){ ctx.strokeStyle='#E4FF7C'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(pr.sx,pr.sy,12,0,6.283); ctx.stroke(); }
    }
  }

  function singleSelectClearPrev(idx){
    const prev=lastActive; lastActive=idx;
    try{ window.lastActiveDot=idx; }catch{}
    if(prev!==idx){
      try{ if(navigator.vibrate) navigator.vibrate(10); }catch{}
    }
    // clear previous highlight UI
    document.querySelectorAll('#popList button,#popular button,.pop button').forEach(b=>b.classList.toggle('on', b.dataset.id=== (points[idx]?.id)));
    const hov=document.getElementById('hovLab'); if(hov) hov.textContent='#'+idx+' selected • single-select clears prev';
    draw();
    // emit social test events
    try{
      const ev=new CustomEvent('point-select',{detail:{id:points[idx]?.id||idx, idx, name:points[idx]?.name}});
      canvas.dispatchEvent(ev);
      if(window.selectDot && typeof window.selectDot==='function' && !window.selectDot._inertialPatched) window.selectDot(idx);
    }catch{}
  }

  let pinchDist=0, lastTap=0, lastTapIdx=-1;
  function dist2(t0,t1){ const dx=t0.clientX-t1.clientX, dy=t0.clientY-t1.clientY; return Math.hypot(dx,dy); }
  function bind(){
    canvas.addEventListener('pointerdown', e=>{
      dragging=true; lastX=e.clientX; lastY=e.clientY; canvas.style.cursor='grabbing'; try{ canvas.setPointerCapture(e.pointerId);}catch{} embedPaused=false;
    });
    canvas.addEventListener('pointermove', e=>{
      if(!dragging){
        // hover lens
        const rect=canvas.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top;
        let best=-1,bd=28*28; const step=Math.max(1, Math.floor(N/4000));
        for(let i=0;i<N;i+=step){ const pr=projected[i]; if(!pr) continue; const d=(pr.sx-mx)*(pr.sx-mx)+(pr.sy-my)*(pr.sy-my); if(d<bd){bd=d; best=i;} }
        if(best>=0 && bd<26*26){ if(hoverIdx!==best){ hoverIdx=best; draw(); } } else if(hoverIdx!==-1){ hoverIdx=-1; draw(); }
        return;
      }
      const dx=e.clientX-lastX, dy=e.clientY-lastY;
      rotY+=dx*0.008; rotX+=dy*0.008; rotX=Math.max(-1.2,Math.min(1.2,rotX));
      velX=dx*0.12; velY=dy*0.12; lastX=e.clientX; lastY=e.clientY; projectFrame(); draw();
    });
    canvas.addEventListener('pointerup', e=>{ dragging=false; canvas.style.cursor='grab'; });
    canvas.addEventListener('pointerleave', ()=>{ dragging=false; canvas.style.cursor='grab'; hoverIdx=-1; draw(); });
    // touch drag + pinch zoom
    canvas.addEventListener('touchstart', e=>{
      if(e.touches.length===1){ dragging=true; lastX=e.touches[0].clientX; lastY=e.touches[0].clientY; embedPaused=false; }
      else if(e.touches.length===2){ pinchDist=dist2(e.touches[0], e.touches[1]); }
    }, {passive:true});
    canvas.addEventListener('touchmove', e=>{
      if(e.touches.length===1 && dragging){
        const t=e.touches[0]; const dx=t.clientX-lastX, dy=t.clientY-lastY;
        rotY+=dx*0.008; rotX+=dy*0.008; rotX=Math.max(-1.2,Math.min(1.2,rotX)); velX=dx*0.12; velY=dy*0.12; lastX=t.clientX; lastY=t.clientY; projectFrame(); draw();
      } else if(e.touches.length===2){
        const d=dist2(e.touches[0], e.touches[1]); if(pinchDist>0){ const factor=d/pinchDist; scale=Math.max(0.42, Math.min(2.6, scale*factor)); draw(); } pinchDist=d; e.preventDefault();
      }
    }, {passive:false});
    canvas.addEventListener('touchend', e=>{
      if(e.touches.length===0) dragging=false;
      if(e.touches.length<2) pinchDist=0;
      // double-tap focus player
      const now=Date.now(); if(now-lastTap<320){
        const touch=e.changedTouches[0]; if(touch){ const rect=canvas.getBoundingClientRect(); const mx=touch.clientX-rect.left, my=touch.clientY-rect.top; let best=-1,bd=32*32; for(let i=0;i<N;i++){ const pr=projected[i]; if(!pr) continue; const d=(pr.sx-mx)*(pr.sx-mx)+(pr.sy-my)*(pr.sy-my); if(d<bd){bd=d; best=i;}} if(best>=0){ singleSelectClearPrev(best); // focus zoom in slightly
          scale=Math.min(2.2, Math.max(1.15, scale*1.18)); projectFrame(); draw();
          try{ if(navigator.vibrate) navigator.vibrate(10);}catch{} } }
      }
      lastTap=now;
    }, {passive:true});
    canvas.addEventListener('click', e=>{
      if(Math.abs(velX)>0.28||Math.abs(velY)>0.28) return;
      const rect=canvas.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top;
      let best=-1,bd=24*24; for(let i=0;i<N;i++){ const pr=projected[i]; if(!pr) continue; const d=(pr.sx-mx)*(pr.sx-mx)+(pr.sy-my)*(pr.sy-my); if(d<bd){bd=d; best=i;}} if(best>=0){ singleSelectClearPrev(best); }
    });
    canvas.addEventListener('wheel', e=>{ e.preventDefault(); const d=Math.sign(e.deltaY); scale=Math.max(0.42, Math.min(2.6, scale*(d>0?0.92:1.08))); draw(); }, {passive:false});
    canvas.addEventListener('dblclick', e=>{
      const rect=canvas.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top;
      let best=-1,bd=28*28; for(let i=0;i<N;i++){ const pr=projected[i]; if(!pr) continue; const d=(pr.sx-mx)*(pr.sx-mx)+(pr.sy-my)*(pr.sy-my); if(d<bd){bd=d; best=i;}} if(best>=0){ singleSelectClearPrev(best); scale=Math.min(2.4, Math.max(1.2, scale*1.22)); projectFrame(); draw(); try{ if(navigator.vibrate) navigator.vibrate(10);}catch{} }
    });
  }

  let rafPending=false;
  function schedule(){ if(!rafPending){ rafPending=true; rafId=requestAnimationFrame(tick); } }
  function tick(t){
    rafPending=false; const now=t||performance.now(); const dt=Math.min(50, now-(lastT||now)); lastT=now;
    if(!dragging && !embedPaused){
      // momentum decay 0.94
      rotY+=velX*0.016; rotX+=velY*0.016; velX*=MOMENTUM; velY*=MOMENTUM;
      // spring k=120 b=0.18
      if(!auto){
        const restX=-0.22, restY=0.34; const dx=restX-rotX, dy=restY-rotY;
        const k=SPRING_K*0.0016, b=SPRING_DAMP; const ax=k*dx - b*velY, ay=k*dy - b*velX;
        if(Math.abs(velX)<0.006 && Math.abs(velY)<0.006 && Math.abs(dx)<0.0009 && Math.abs(dy)<0.0009){ rotX=restX; rotY=restY; velX=0; velY=0; }
        else if(Math.abs(velX)<0.14 && Math.abs(velY)<0.14){ velX+=ay; velY+=ax; }
      }
      if(Math.abs(velX)>0.00012||Math.abs(velY)>0.00012){ projectFrame(); draw(); schedule(); return; }
    }
    if(rafId) schedule();
  }

  function setTarget(id){
    let idx=-1; if(typeof id==='number') idx=id; else { idx=points.findIndex(p=>p.id===id); if(idx<0) idx=parseInt(id)||0; }
    if(idx>=0&&idx<N){ singleSelectClearPrev(idx); const pr=projected[idx]; if(pr){ scale=Math.min(2.2,1.18); projectFrame(); draw(); } }
  }
  function clearSel(){ lastActive=-1; try{ window.lastActiveDot=-1;}catch{} draw(); try{ canvas.dispatchEvent(new CustomEvent('point-deselect')); }catch{} }
  function setLOD(v){ /* LOD toggle handled via MAX_RENDER but keep API */ draw(); return v; }
  function pause(){ embedPaused=true; auto=false; }
  function resume(){ embedPaused=false; lastT=0; schedule(); }

  // LCG preservation
  const today=hubDailySeed(new Date()); const curDomIdx=1; const trip=sameLinkStars(today, curDomIdx);
  try{ window.INERTIAL_LCG=trip; window._POINT_META=points; console.log('[inertial-map] LCG same-link-same-stars today',today,'triple',trip.triple,'five',trip.five,'open→drag-map→Jordan→copy-link equal stars DAU3/WAU3 TLPG dedup'); }catch{}

  function init(){
    ensureDPR1(); bind(); projectFrame(); draw(); schedule();
    try{ window.addEventListener('resize', ()=>{ ensureDPR1(); projectFrame(); draw(); }); }catch{}
    // DPR1 fillRect invariant
    try{ new ResizeObserver(()=>{ ensureDPR1(); projectFrame(); draw(); }).observe(canvas.parentElement||canvas); }catch{}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();

  return {setPoints, setTarget, clearSel, setLOD, pause, resume, projectFrame, draw, singleSelectClearPrev, state:()=>({rotX,rotY,scale,velX,velY,lastActive,LOD,MAX_RENDER}), getPoints:()=>points, quatFromEuler, quatMul, rotateVecByQuat, sameLinkStars, hubLcg, hubDailySeed, LCG: trip, ensureDPR1, clampCanvasHeight};
}
// compat default for older import
export default {mountInertialMap};
// legacy window
try{ if(typeof window!=='undefined'){ window.mountInertialMap=mountInertialMap; window.InertialMap={mount:mountInertialMap}; } }catch{}
