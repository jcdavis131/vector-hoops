/* shared-map.js — zero-deps quaternion arcball + LOD + single-select
   Part of vector-tokens family — npm-less, stdlib only
   REAL maps: Float32Array N*3 from assets/data/*.json x/y/z/c [-1,1] OKABE-8 #080A0F
   LOD 8000 desktop / 4000 mobile cap, DPR1 canvas.width=W no devicePixelRatio
   momentum 0.94, spring stiffness 120, damping 0.18, hover lens 1.8x, inertia decay
   OKABE visible on #080A0F, orthographic fallback, vibrate(10), window._POINT_META tooltip
   PWA v67 offline 13.6k CORE20
*/
(function(global){
  'use strict';

  const OKABE = [
    '#E69F00', // 0 amber
    '#56B4E9', // 1 sky
    '#009E73', // 2 teal
    '#F0E442', // 3 yellow
    '#0072B2', // 4 blue
    '#D55E00', // 5 vermillion
    '#CC79A7', // 6 purple
    '#FFFEF7'  // 7 repl ivory for dark
  ];
  const VOID = '#080A0F';
  const VOID2 = '#0f141e';

  // quaternion helpers
  function quatIdentity(){ return [0,0,0,1]; }
  function quatNorm(q){ const l=Math.hypot(q[0],q[1],q[2],q[3])||1; return [q[0]/l,q[1]/l,q[2]/l,q[3]/l]; }
  function quatMul(a,b){ return [
    a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
    a[3]*b[1]-a[1]*b[3]+a[2]*b[0]+a[0]*b[2],
    a[3]*b[2]+a[2]*b[3]-a[0]*b[1]+a[1]*b[0],
    a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
  ];}
  function quatFromAxisAngle(ax,ay,az,ang){
    const s=Math.sin(ang*0.5); return [ax*s,ay*s,az*s,Math.cos(ang*0.5)];
  }
  // arcball: map screen to sphere
  function arcballMap(x,y,w,h){
    const nx = (2*x - w)/w;
    const ny = (h - 2*y)/h;
    const len2 = nx*nx + ny*ny;
    if(len2>1){ const inv=Math.sqrt(len2); return [nx/inv, ny/inv, 0]; }
    return [nx, ny, Math.sqrt(1-len2)];
  }

  function lcg(seed){
    // glibc L(s)=(s*1103515245+12345)&0x7fffffff
    let s=seed>>>0;
    return function(){ s = (Math.imul(s,1103515245)+12345)>>>0 & 0x7fffffff; return s/0x7fffffff; }
  }

  // Float32Array builder from real points, no Math.random unless 404
  function toFloat32(points){
    // points: array of {x,y,z,c?,id?}
    const N = points.length|0;
    const buf = new Float32Array(N*3);
    for(let i=0;i<N;i++){
      const p=points[i];
      buf[i*3]=p.x; buf[i*3+1]=p.y; buf[i*3+2]=p.z;
    }
    return buf;
  }

  function createMap(opts){
    opts = opts||{};
    const canvas = opts.canvas; // required
    if(!canvas) throw new Error('shared-map: canvas required');
    const dataUrl = opts.dataUrl || 'assets/data/hoops.json';
    const onSelect = opts.onSelect || function(){};
    const capDesktop = opts.lodDesktop||8000;
    const capMobile = opts.lodMobile||4000;
    const isMobile = (typeof window!=='undefined' && window.innerWidth<640);
    const lodCap = isMobile?capMobile:capDesktop;

    // DPR1 — critical: canvas.width=W no devicePixelRatio
    function resizeDPR1(){
      const rect = canvas.getBoundingClientRect();
      const W = Math.round(rect.width);
      const H = Math.round(rect.height);
      if(canvas.width!==W) canvas.width=W;
      if(canvas.height!==H) canvas.height=H;
      return {W,H,rect};
    }

    let W=0,H=0;
    let pts=null; // Float32Array N*3
    let meta=null; // array parallel to pts
    let N=0;
    let colors=null; // Uint8 indexed OKABE lookup? we derive from c

    let quat = quatIdentity();
    let vel = [0,0,0]; // axis * angular velocity
    let dragging=false;
    let lastPos=null;
    let hoverIdx=-1;
    let selectedIdx=-1;
    let hoverLens=1.8;
    let momentum=0.94;
    let stiffness=120;
    let damping=0.18;
    let inertiaDecay=0.94;

    // spring state for smooth zoom/rotation (stiffness 120 damping 0.18)
    let scale=1;
    let targetScale=1;
    let scaleVel=0;

    // 2D projected cache
    let projX=null, projY=null, projZ=null;

    const ctx = canvas.getContext('2d',{alpha:false});
    let tooltipEl=null;

    function ensureTooltip(){
      if(tooltipEl) return tooltipEl;
      tooltipEl=document.createElement('div');
      tooltipEl.className='tooltip-void';
      tooltipEl.style.display='none';
      tooltipEl.style.position='absolute';
      tooltipEl.style.zIndex='60';
      tooltipEl.style.pointerEvents='none';
      document.body.appendChild(tooltipEl);
      return tooltipEl;
    }

    function loadReal(){
      return fetch(dataUrl,{cache:'force-cache'}).then(r=>{
        if(!r.ok) throw new Error('404 '+dataUrl);
        return r.json();
      }).then(json=>{
        // json can be array or {points:[]}
        let arr = Array.isArray(json)?json: (json.points||json.data||[]);
        // normalize: expect x,y,z,c
        // clamp lod
        if(arr.length>lodCap) arr = arr.slice(0,lodCap);
        N = arr.length;
        pts = toFloat32(arr);
        meta = arr;
        // expose globally for tooltip shell
        try{ window._POINT_META = meta; }catch(e){}
        projX = new Float32Array(N);
        projY = new Float32Array(N);
        projZ = new Float32Array(N);
        return {N};
      }).catch(err=>{
        // fallback ONLY if 404 — synthetic tiny var no random? use deterministic LCG seeded today to avoid Math.random
        if(!(''+err).includes('404')) throw err;
        const today = new Date();
        const seedStr = ''+ (today.getFullYear()*10000 + (today.getMonth()+1)*100 + today.getDate());
        const seed = parseInt(seedStr,10)>>>0;
        const rand = lcg(seed);
        const syntheticN = Math.min(lodCap, 400);
        const arr=[];
        for(let i=0;i<syntheticN;i++){
          // tiny variance around sphere, deterministic
          const a=rand()*Math.PI*2; const b=rand()*Math.PI - Math.PI/2;
          arr.push({x:Math.cos(b)*Math.cos(a)*0.7, y:Math.cos(b)*Math.sin(a)*0.7, z:Math.sin(b)*0.7, c:i%8, display_name:'point '+i});
        }
        N=syntheticN; pts=toFloat32(arr); meta=arr;
        try{ window._POINT_META = meta; }catch(e){}
        projX=new Float32Array(N); projY=new Float32Array(N); projZ=new Float32Array(N);
        return {N, synthetic:true};
      });
    }

    function rotatePoint(ix,q){
      // rotate point ix by quaternion q, returns [rx,ry,rz]
      const x=pts[ix*3], y=pts[ix*3+1], z=pts[ix*3+2];
      // q * p * q^-1, p quaternion [x,y,z,0]
      const qx=q[0], qy=q[1], qz=q[2], qw=q[3];
      // q * p
      const tx = qw*x + qy*z - qz*y;
      const ty = qw*y + qz*x - qx*z;
      const tz = qw*z + qx*y - qy*x;
      const tw = -qx*x - qy*y - qz*z;
      // (q*p) * q^-1  q^-1 = [-qx,-qy,-qz,qw]
      const rx = tx*qw - tw*(-qx) - ty*(-qz) + tz*(-qy);
      const ry = ty*qw - tw*(-qy) - tz*(-qx) + tx*(-qz);
      const rz = tz*qw - tw*(-qz) - tx*(-qy) + ty*(-qx);
      return [rx,ry,rz];
    }

    function projectAll(){
      // orthographic fallback + perspective-ish
      // uses current quat
      for(let i=0;i<N;i++){
        const r = rotatePoint(i, quat);
        const x=r[0], y=r[1], z=r[2];
        // simple perspective: scale by (1+z*0.2) orthographic fallback if need
        let s = 1 + z*0.25;
        if(!isFinite(s)||s<0.1) s=0.1; // orthographic fallback clamp
        projX[i]= x*s*scale;
        projY[i]= y*s*scale;
        projZ[i]= z; // for depth sort / visibility
      }
    }

    function colorFor(idx){
      const m=meta[idx];
      let ci = 0;
      if(m && typeof m.c==='number') ci = (m.c|0)%8;
      else if(m && typeof m.cluster==='number') ci = (m.cluster|0)%8;
      else ci = idx%8;
      if(ci<0) ci=0;
      // ensure visibility on #080A0F — okabe-7 black replaced with ivory #FFFEF7
      if(ci===7) return OKABE[7];
      return OKABE[ci];
    }

    function draw(){
      if(!pts) return;
      // void fill DPR1 fillRect
      // canvas.width=W already DPR1
      const r = canvas.getBoundingClientRect && canvas.getBoundingClientRect() || {width:W,height:H};
      ctx.fillStyle = VOID;
      ctx.fillRect(0,0,canvas.width,canvas.height);

      const cx = canvas.width*0.5;
      const cy = canvas.height*0.5;
      const scalePix = Math.min(canvas.width,canvas.height)*0.38;

      // depth sort indices by projZ ascending (painter's algorithm) for subtle overlap
      // but for perf at N=8000 we avoid full sort each frame; we do bucket-ish coarse
      // Instead: we iterate and slight alpha by depth.

      for(let i=0;i<N;i++){
        const px = cx + projX[i]*scalePix;
        const py = cy - projY[i]*scalePix;
        const depth = projZ[i]; // -1..1
        const isHover = (i===hoverIdx);
        const isSel = (i===selectedIdx);
        const baseR = isSel?5.5 : isHover?4.2*hoverLens : 2.6;
        const rsize = baseR * (isHover?hoverLens:1) * (1+depth*0.15); // lens 1.8x magnify
        const a = 0.65 + depth*0.32; // visibility cue
        if(px<-20||px>canvas.width+20||py<-20||py>canvas.height+20) continue;
        ctx.globalAlpha = isSel?1: Math.max(0.35, Math.min(1,a));
        ctx.fillStyle = colorFor(i);
        if(isSel){
          // single-select clears prev highlight — draw halo
          ctx.beginPath();
          ctx.arc(px,py,rsize+3,0,Math.PI*2);
          ctx.fillStyle = '#FFFFFF';
          ctx.globalAlpha=0.22;
          ctx.fill();
          ctx.globalAlpha=1;
          ctx.fillStyle = colorFor(i);
        }
        ctx.beginPath();
        ctx.arc(px,py,rsize,0,Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha=1;
    }

    let raf=0;
    let lastT=0;
    function tick(t){
      raf=requestAnimationFrame(tick);
      const dt = lastT? Math.min(0.033,(t-lastT)/1000):0.016;
      lastT=t;
      // momentum inertia decay
      if(!dragging){
        const av = Math.hypot(vel[0],vel[1],vel[2]);
        if(av>1e-5){
          const axis = [vel[0]/av,vel[1]/av,vel[2]/av];
          const ang = av*dt;
          const dq = quatFromAxisAngle(axis[0],axis[1],axis[2],ang);
          quat = quatNorm(quatMul(dq,quat));
          // decay
          vel[0]*=inertiaDecay; vel[1]*=inertiaDecay; vel[2]*=inertiaDecay;
        }
      }
      // spring scale
      const f = stiffness*(targetScale-scale) - damping*scaleVel; // stiffness 120 damping 0.18, but damping scaled for spring
      // Note: damping param 0.18 used as viscous; we map to physical: c = 2*sqrt(k)*damping ~ for critical
      const dt2 = dt;
      scaleVel += f*dt2;
      scale += scaleVel*dt2;
      // momentum global 0.94 applied to scale vel too
      scaleVel *= momentum;

      projectAll();
      draw();
    }

    function hitTest(mx,my){
      // mx,my in canvas pixels (DPR1 => CSS px == canvas px because width=W)
      let best=-1; let bestD=Infinity;
      const cx=canvas.width*0.5, cy=canvas.height*0.5;
      const scalePix=Math.min(canvas.width,canvas.height)*0.38;
      for(let i=0;i<N;i++){
        const px=cx+projX[i]*scalePix;
        const py=cy-projY[i]*scalePix;
        const dx=mx-px, dy=my-py;
        const d2=dx*dx+dy*dy;
        const thr = (i===hoverIdx? 18*18 : 12*12); // hover lens larger
        if(d2<thr && d2<bestD){ bestD=d2; best=i; }
      }
      return best;
    }

    function bind(){
      let startQuat=null;
      canvas.addEventListener('pointerdown',e=>{
        dragging=true;
        canvas.setPointerCapture(e.pointerId);
        const rect=canvas.getBoundingClientRect();
        const x=e.clientX-rect.left, y=e.clientY-rect.top;
        // map to canvas DPR1: rect.width == canvas.width generally, but still ratio
        const sx = x * (canvas.width/rect.width);
        const sy = y * (canvas.height/rect.height);
        lastPos = {x:sx,y:sy, vec:arcballMap(sx,sy,canvas.width,canvas.height)};
        startQuat = quat.slice();
        vel=[0,0,0];
      });
      canvas.addEventListener('pointermove',e=>{
        const rect=canvas.getBoundingClientRect();
        const x=e.clientX-rect.left, y=e.clientY-rect.top;
        const sx=x*(canvas.width/rect.width), sy=y*(canvas.height/rect.height);
        if(dragging && lastPos){
          const curVec=arcballMap(sx,sy,canvas.width,canvas.height);
          const prevVec=lastPos.vec;
          // rotation axis = cross(prev,cur), angle = acos(dot)
          const dot = Math.max(-1,Math.min(1, prevVec[0]*curVec[0]+prevVec[1]*curVec[1]+prevVec[2]*curVec[2]));
          let ang = Math.acos(dot)*1.2;
          const cross=[prevVec[1]*curVec[2]-prevVec[2]*curVec[1], prevVec[2]*curVec[0]-prevVec[0]*curVec[2], prevVec[0]*curVec[1]-prevVec[1]*curVec[0]];
          const cl=Math.hypot(cross[0],cross[1],cross[2]);
          if(cl>1e-6 && ang>1e-6){
            const ax=cross[0]/cl, ay=cross[1]/cl, az=cross[2]/cl;
            const dq=quatFromAxisAngle(ax,ay,az,ang);
            quat=quatNorm(quatMul(dq,quat));
            vel=[ax*ang*6, ay*ang*6, az*ang*6]; // for inertia decay
          }
          lastPos.vec=curVec;
          projectAll();
        }else{
          // hover
          const idx=hitTest(sx,sy);
          if(idx!==hoverIdx){
            hoverIdx=idx;
            if(idx>=0){
              const el=ensureTooltip();
              const m=meta[idx];
              const name = (m && (m.display_name||m.name||m.ticker||m.pid||'')) + '';
              const sec = m && (m.sector||m.pos||m.position||'') + '';
              const disp = name + (sec?' · '+sec:'') + ' ['+ (m && m.x!==undefined?Number(m.x).toFixed(2):'') + ']';
              el.textContent = disp||('idx '+idx);
              el.style.left=(e.clientX+14)+'px';
              el.style.top=(e.clientY+8)+'px';
              el.style.display='block';
            }else{
              if(tooltipEl) tooltipEl.style.display='none';
            }
          }else if(hoverIdx>=0){
            const el=tooltipEl; if(el){ el.style.left=(e.clientX+14)+'px'; el.style.top=(e.clientY+8)+'px'; }
          }
        }
      });
      canvas.addEventListener('pointerup',e=>{
        dragging=false;
        // selection on click up if low movement
        const rect=canvas.getBoundingClientRect();
        const x=e.clientX-rect.left, y=e.clientY-rect.top;
        const sx=x*(canvas.width/rect.width), sy=y*(canvas.height/rect.height);
        const idx=hitTest(sx,sy);
        if(idx>=0){
          // single-select clears prev highlight
          selectedIdx=idx;
          try{ if(navigator.vibrate) navigator.vibrate(10); }catch(_){}
          const m=meta[idx];
          onSelect({idx, meta:m, point:[pts[idx*3],pts[idx*3+1],pts[idx*3+2]]});
        }
      });
      canvas.addEventListener('wheel',e=>{
        e.preventDefault();
        const delta = -e.deltaY*0.001;
        targetScale = Math.max(0.5, Math.min(2.6, targetScale*(1+delta)));
      },{passive:false});

      window.addEventListener('resize',()=>{
        const r=resizeDPR1(); W=r.W; H=r.H;
      });
    }

    function init(){
      const r=resizeDPR1(); W=r.W; H=r.H;
      bind();
      loadReal().then(()=>{
        projectAll(); draw();
        cancelAnimationFrame(raf); lastT=0; raf=requestAnimationFrame(tick);
      });
    }

    // public API
    return {
      init,
      getSelected:()=>selectedIdx,
      clearSelect:()=>{ selectedIdx=-1; },
      setMomentum(v){ momentum=v; },
      setLOD(cap){ /* realtime cap not resizing array */ },
      _internals:{quat:()=>quat, OKABE, VOID}
    };
  }

  // expose
  global.VectorMap = { create: createMap, createMap, OKABE, VOID, toFloat32, quatNorm, quatMul, lcg };
  if(typeof module!=='undefined' && module.exports) module.exports = global.VectorMap;

})(typeof window!=='undefined'?window:this);
