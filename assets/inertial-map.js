/**
 * inertial-map.js — Lane A zero-deps arcball quaternion 3D for dumbmodel.com UI
 * SSOT: vector-hub/index.html loadDomainPoints v9 real-first Float32Array(N*3)
 * PWA v67 #080A0F void dark CORE20 offline 13k LOD4000/8000
 * same-link-same-stars ?daily=20260813&n=1/3/5 LCG glibc 189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524]
 * zero-deps stdlib only, no Three.js, DPR1 only canvas.width=W fillStyle '#080A0F' fillRect(0,0,W,H)
 */
'use strict';
(function(){
  // === quaternion core per spec ===
  function quatFromEuler(rx, ry){
    // spec: [cy*cx, sx*cy, sy*cx, -sy*sx]
    var cx=Math.cos(rx/2), sx=Math.sin(rx/2);
    var cy=Math.cos(ry/2), sy=Math.sin(ry/2);
    return [cy*cx, sx*cy, sy*cx, -sy*sx];
  }
  function quatMul(a,b){
    // 4D [w,x,y,z]
    return [
      a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3],
      a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],
      a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1],
      a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]
    ];
  }
  function rotateVecByQuat(v,q){
    // qv mul conj — v=[x,y,z]
    var qv=[0,v[0],v[1],v[2]];
    var qConj=[q[0],-q[1],-q[2],-q[3]];
    var t=quatMul(q,qv);
    var r=quatMul(t,qConj);
    return [r[1],r[2],r[3]];
  }

  // === drag state per spec ===
  var state={
    rotX: -0.22,
    rotY: 0.34,
    scale: 1.0,
    autoSpinning: false,
    dragging: false,
    lastX: 0,
    lastY: 0,
    velX: 0,
    velY: 0,
    hoverIdx: -1,
    lastActiveDot: null,
    rafId: 0
  };

  // === LCG triple same-link-same-stars preserved ===
  var LCG_A=1103515245, LCG_C=12345;
  function hubLcg(s){
    return (typeof Math.imul==='function'?(Math.imul(s,LCG_A)+LCG_C>>>0):(s*LCG_A+LCG_C))&0x7fffffff;
  }
  function hubDailySeed(d){ var dt=d instanceof Date?d:new Date(); return dt.getUTCFullYear()*10000+(dt.getUTCMonth()+1)*100+dt.getUTCDate(); }
  function sameLinkStars(today, curDomainIdx){
    // today+curDomainIdx*100 LCG → idxs 6 triple same-link-same-stars open→drag→Jordan→copy-link equal stars DAU3/WAU3 TLPG dedup
    var s=today+curDomainIdx*100;
    s=hubLcg(s);
    var idxs=[];
    for(var i=0;i<6;i++){ s=hubLcg(s); idxs.push(s); }
    var triple=[idxs[0]%20719, idxs[1]%20719, idxs[2]%20719];
    var five=[idxs[0]%20719, idxs[1]%20719, idxs[2]%20719, idxs[3]%20719, idxs[4]%20719];
    // same-link-same-stars invariant: open→drag-map→Jordan→copy-link equal stars via glibc LCG same seed chain
    return { seed: s, idxs: idxs, triple: triple, five: five };
  }

  function setTooltipSelected(n){
    var hov=document.getElementById('hovLab');
    if(hov) hov.textContent='#'+n+' selected \u2022 single-select clears prev';
  }

  function singleSelectClearPrev(n){
    // lastActiveDot null→N, querySelectorAll #popList button .on toggle, vibrate(10)
    var prev=state.lastActiveDot;
    if(window._POINT_META && window.gameData && window.gameData.modern){
      if(prev!=null){ window.gameData.modern.forEach(function(p){ if(p.n===prev) p.isCurrent=false; }); }
      window.gameData.modern.forEach(function(p){ p.isCurrent=(p.n===n); });
    } else if(window.gameData && window.gameData.modern){
      window.gameData.modern.forEach(function(p){ p.isCurrent=(p.n===n); });
    }
    state.lastActiveDot=n;
    try{ window.lastActiveDot=n; }catch{}
    var btns=document.querySelectorAll('#popList button');
    btns.forEach(function(b){ b.classList.toggle('on', Number(b.dataset.n)===n); });
    setTooltipSelected(n);
    try{ if(navigator.vibrate) navigator.vibrate(10); }catch{}
  }

  // === DPR1 canvas void hit ===
  function ensureCanvasDPR1(){
    var c=document.getElementById('c'); if(!c) return null;
    var rect=c.getBoundingClientRect();
    var W=Math.max(1, Math.round(rect.width));
    var H=Math.max(1, Math.round(rect.height));
    // DPR1 only — no devicePixelRatio
    if(c.width!==W) c.width=W;
    if(c.height!==H) c.height=H;
    var ctx=c.getContext('2d');
    // PWA v67 HIT — fillStyle '#080A0F' fillRect(0,0,W,H)
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle='#080A0F';
    ctx.fillRect(0,0,W,H);
    return {c:c, ctx:ctx, W:W, H:H};
  }

  function renderInertial(full){
    var info=ensureCanvasDPR1();
    if(!info) return;
    var c=info.c, ctx=info.ctx, W=info.W, H=info.H;
    var pts=window._POINTS_3D;
    if(!pts){
      ctx.fillStyle='#fffcf2';
      ctx.font='600 12px ui-monospace';
      ctx.fillText('Loading 3D…',14,22);
      return;
    }
    var q=quatFromEuler(state.rotX, state.rotY);
    var cx=W*0.5, cy=H*0.48;
    var sc=Math.min(W,H)*0.38*state.scale;
    var N=pts.length/3;
    var rotated=new Float32Array(N*3);
    var order=new Array(N);
    for(var i=0;i<N;i++){
      var v=[pts[i*3],pts[i*3+1],pts[i*3+2]];
      var r=rotateVecByQuat(v,q);
      rotated[i*3]=r[0]; rotated[i*3+1]=r[1]; rotated[i*3+2]=r[2];
      order[i]=i;
    }
    order.sort(function(a,b){ return rotated[a*3+2]-rotated[b*3+2]; });

    var POV=window.CURRENT_POV||'owner';
    var lastActive=state.lastActiveDot!=null?state.lastActiveDot:(window.lastActiveDot!=null?window.lastActiveDot:-1);
    var hoverIdx=state.hoverIdx;
    for(var k=0;k<order.length;k++){
      var i=order[k];
      var x=rotated[i*3], y=rotated[i*3+1], z=rotated[i*3+2];
      var px=cx + x*sc;
      var py=cy - y*sc;
      var depth=(z+1)*0.5;
      var alpha=0.42 + depth*0.5;
      if(POV!=='all'){
        var edge=((i*9301+93)%100)/100;
        if(POV==='owner') alpha*=(0.55+edge*0.5);
        if(POV==='player') alpha*=(edge>0.62?1.0:0.38);
        if(POV==='brand') alpha*=(0.48+edge*0.62);
        if(POV==='dfs') alpha*=(edge>0.71?1.02:0.34);
        alpha=Math.max(0.12,Math.min(0.95,alpha));
      }
      var isCur = (lastActive===i);
      var isHover = (hoverIdx===i);
      var size = isCur?3.4:2.4;
      if(isHover) size*=1.8; // hover lens 1.8× magnify
      var col='#8FB89F';
      var curDom=window.CURRENT_DOMAIN||'unified';
      if(curDom==='hoops') col='#8FB89F';
      else if(curDom==='gridiron') col='#E93118';
      else if(curDom==='pitch') col='#9ebebf';
      else if(curDom==='equities') col='#7391bf';
      else if(curDom==='unified') col='#f1b650';
      if(isCur){
        ctx.globalAlpha=0.92;
        ctx.beginPath();
        ctx.fillStyle='#ff5b04';
        ctx.arc(px,py,size+5.6,0,Math.PI*2);
        ctx.fill();
        ctx.globalAlpha=1;
      }
      ctx.globalAlpha=alpha;
      ctx.fillStyle=col;
      ctx.beginPath();
      ctx.arc(px,py,size,0,Math.PI*2);
      ctx.fill();
      ctx.globalAlpha=1;
    }
    if(lastActive>=0 && lastActive<N){
      var lr=[pts[lastActive*3],pts[lastActive*3+1],pts[lastActive*3+2]];
      var rr=rotateVecByQuat(lr,q);
      var pxh=cx+rr[0]*sc, pyh=cy-rr[1]*sc;
      ctx.strokeStyle='#E4FF7C';
      ctx.lineWidth=1.2;
      ctx.beginPath();
      ctx.arc(pxh,pyh,12,0,Math.PI*2);
      ctx.stroke();
    }
  }

  // === momentum decay 0.94 per frame RAF 60fps, spring pin k=120 b=0.18 ===
  function tick(){
    if(!state.dragging){
      // momentum decay
      state.rotY += state.velX * 0.016;
      state.rotX += state.velY * 0.016;
      state.velX *= 0.94;
      state.velY *= 0.94;

      // spring return to rest when low velocity and not autoSpinning
      if(!state.autoSpinning){
        var restX=-0.22, restY=0.34;
        var dx=restX - state.rotX;
        var dy=restY - state.rotY;
        // F = -k*x - b*v simplified — k=120 b=0.18 per spec but scaled for 60fps dt=1/60
        var k=120, b=0.18;
        var dt=1/60;
        // avoid instability from huge k: clamp effective
        var ax = (k*0.0015)*dx - b*state.velY;
        var ay = (k*0.0015)*dy - b*state.velX;
        if(Math.abs(state.velX)<0.005 && Math.abs(state.velY)<0.005 && Math.abs(dx)<0.0008 && Math.abs(dy)<0.0008){
          state.rotX=restX;
          state.rotY=restY;
          state.velX=0; state.velY=0;
        } else if(Math.abs(state.velX)<0.12 && Math.abs(state.velY)<0.12){
          state.velX += ay*dt*60;
          state.velY += ax*dt*60;
        }
      }
      if(Math.abs(state.velX)>0.0001 || Math.abs(state.velY)>0.0001 || !state.autoSpinning){
        // trigger render if page helper exists
        if(window._POINTS_3D) renderInertial(false);
      }
    }
    state.rafId=requestAnimationFrame(tick);
  }

  function bindDrag(){
    var c=document.getElementById('c'); if(!c) return;
    c.addEventListener('pointerdown', function(e){
      state.dragging=true;
      state.lastX=e.clientX; state.lastY=e.clientY;
      try{ c.setPointerCapture(e.pointerId); }catch{}
      c.classList.add('grabbing');
    });
    c.addEventListener('pointermove', function(e){
      var rect=c.getBoundingClientRect();
      if(!state.dragging){
        // hover lens detection
        var pts=window._POINTS_3D; if(!pts) return;
        var q=quatFromEuler(state.rotX,state.rotY);
        var cx=rect.width*0.5, cy=rect.height*0.48;
        var sc=Math.min(rect.width,rect.height)*0.38*state.scale;
        var mx=e.clientX-rect.left, my=e.clientY-rect.top;
        var best=-1, bd=1e9;
        var N=pts.length/3;
        var step=Math.max(1, Math.floor(N/4000)); // LOD sample for hover perf
        for(var i=0;i<N;i+=step){ var r=rotateVecByQuat([pts[i*3],pts[i*3+1],pts[i*3+2]],q); var px=cx+r[0]*sc, py=cy-r[1]*sc; var d=(px-mx)*(px-mx)+(py-my)*(py-my); if(d<bd){bd=d; best=i;} }
        if(best>=0 && bd< 26*26){ if(state.hoverIdx!==best){ state.hoverIdx=best; renderInertial(false);} } else { if(state.hoverIdx!==-1){ state.hoverIdx=-1; renderInertial(false);} }
        return;
      }
      var dx=e.clientX-state.lastX, dy=e.clientY-state.lastY;
      state.rotY += dx*0.008;
      state.rotX += dy*0.008;
      state.rotX=Math.max(-1.2,Math.min(1.2,state.rotX));
      state.velX=dx*0.12;
      state.velY=dy*0.12;
      state.lastX=e.clientX; state.lastY=e.clientY;
      renderInertial(false);
      var hov=document.getElementById('hovLab');
      if(hov) hov.textContent='rotX '+state.rotX.toFixed(2)+' rotY '+state.rotY.toFixed(2)+' scale '+state.scale.toFixed(2)+' \u2022 drag lens 1.8\u00d7';
    });
    c.addEventListener('pointerup', function(){
      state.dragging=false;
      c.classList.remove('grabbing');
    });
    c.addEventListener('click', function(e){
      if(Math.abs(state.velX)>0.2 || Math.abs(state.velY)>0.2) return;
      var pts=window._POINTS_3D; if(!pts) return;
      var rect=c.getBoundingClientRect();
      var mx=e.clientX-rect.left, my=e.clientY-rect.top;
      var q=quatFromEuler(state.rotX,state.rotY);
      var cx=rect.width*0.5, cy=rect.height*0.48;
      var sc=Math.min(rect.width,rect.height)*0.38*state.scale;
      var best=-1,bd=1e9;
      var N=pts.length/3;
      for(var i=0;i<N;i++){ var r=rotateVecByQuat([pts[i*3],pts[i*3+1],pts[i*3+2]],q); var px=cx+r[0]*sc, py=cy-r[1]*sc; var d=(px-mx)*(px-mx)+(py-my)*(py-my); if(d<bd){bd=d; best=i;} }
      if(best>=0 && bd< 24*24){
        singleSelectClearPrev(best);
        if(window.selectDot) try{ window.selectDot(best);}catch{}
        renderInertial(false);
      }
    });
    c.addEventListener('wheel', function(e){
      e.preventDefault();
      var d=Math.sign(e.deltaY);
      state.scale=Math.max(0.42, Math.min(2.2, state.scale*(d>0?0.92:1.08)));
      renderInertial(false);
    }, {passive:false});
  }

  // expose API
  window.InertialMap={
    quatFromEuler: quatFromEuler,
    quatMul: quatMul,
    rotateVecByQuat: rotateVecByQuat,
    state: state,
    sameLinkStars: sameLinkStars,
    hubLcg: hubLcg,
    hubDailySeed: hubDailySeed,
    render: renderInertial,
    select: singleSelectClearPrev,
    ensureCanvasDPR1: ensureCanvasDPR1
  };
  window.quatFromEuler=quatFromEuler;
  window.quatMul=quatMul;
  window.rotateVecByQuat=rotateVecByQuat;

  // patch global renderMap to use inertial when available
  var origRender=null;
  function tryPatch(){
    if(window.renderMap && !window.renderMap._inertialPatched){
      origRender=window.renderMap;
      var patched=function(full){
        // keep existing gameData.modern re-seed per domain intact — just delegate to inertial canvas
        try{ renderInertial(full); }catch(e){ try{ origRender(full);}catch{} }
      };
      patched._inertialPatched=true;
      patched._orig=origRender;
      window.renderMap=patched;
      window.renderMapInertial=renderInertial;
    }
    // also patch selectDot if present to preserve single-select clears prev invariant
    if(window.selectDot && !window.selectDot._inertialPatched){
      var origSel=window.selectDot;
      var patchedSel=function(n){
        try{ singleSelectClearPrev(n); }catch{}
        try{ origSel(n); }catch{}
      };
      patchedSel._inertialPatched=true;
      window.selectDot=patchedSel;
    }
  }

  function init(){
    tryPatch();
    bindDrag();
    ensureCanvasDPR1();
    // tick loop momentum decay 0.94 RAF 60fps
    if(!state.rafId) state.rafId=requestAnimationFrame(tick);

    // seed LCG debug preserve
    var today=window.DAILY_SEED||hubDailySeed(new Date());
    var curIdx=0;
    try{
      var dom=window.CURRENT_DOMAIN||'unified';
      var domains=['unified','hoops','gridiron','pitch','equities'];
      curIdx=Math.max(0, domains.indexOf(dom));
    }catch{}
    var trip=sameLinkStars(today, curIdx);
    // DAU3/WAU3 TLPG dedup note preserved
    window.INERTIAL_LCG=trip;
    try{ console.log('[inertial-map] LCG same-link-same-stars today '+today+' curIdx '+curIdx+' triple',trip.triple,' five',trip.five,' open→drag→Jordan→copy-link equal stars DAU3/WAU3 TLPG dedup'); }catch{}
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // also re-try patch after window load (index.html defines renderMap in inline script)
  window.addEventListener('load', function(){ setTimeout(function(){ tryPatch(); init(); }, 120); });
})();
