/* inertial-map.js v9.2 — quaternion arcball · void #080A0F · LOD 8000/4000 DPR1 fillRect · momentum 0.94 single-select clears prev */
export function mountInertialMap(canvas, opts={}){
  if(!canvas) return null;
  const dark = opts.dark ?? true;
  const isMobile = (typeof window!=='undefined') && (window.innerWidth<700 || /Android|iPhone|iPad/i.test(navigator.userAgent||''));
  const LOD = isMobile ? 4000 : 8000; // LOD 8000 desktop / 4000 mobile
  const DPR = 1; // DPR1 fillRect — no devicePixelRatio for consistent business screenshots
  const MOMENTUM = 0.94; // --momentum 0.94
  const VOID = '#080A0F'; // bg #080A0F
  const IVORY = '#FFFEF7';
  const OKABE = ['#E69F00','#56B4E9','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7','#FFFEF7'];

  let W=0,H=0, rotY=Math.PI*0.18, rotX=0.22;
  let velY=0, velX=0, auto=true, lastT=0;
  let isDragging=false, lastX=0, lastY=0;
  let points=[], byId=new Map(), projected=[];
  let selectedId=null, hoverId=null;
  let animId=0, paused=false;

  // Quaternion arcball helpers
  function quatFromAxisAngle(ax,ay,az,ang){
    const s=Math.sin(ang*0.5); const c=Math.cos(ang*0.5);
    const len=Math.hypot(ax,ay,az)||1; return [ax/len*s, ay/len*s, az/len*s, c];
  }
  function quatMul(a,b){ // Hamilton
    return [
      a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
      a[3]*b[1]-a[1]*b[3]+a[2]*b[0]+a[0]*b[2],
      a[3]*b[2]+a[2]*b[3]-a[0]*b[1]+a[1]*b[0],
      a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
    ];
  }
  function rotatePoint(px,py,pz){
    // yaw rotY quaternion [0,1,0]
    let qy=quatFromAxisAngle(0,1,0,rotY);
    let qx=quatFromAxisAngle(1,0,0,rotX);
    let q=quatMul(qy,qx);
    // rotate point by q
    // v' = q * v * q^-1  (simplified)
    const x=px,y=py,z=pz;
    const qx_=q[0],qy_=q[1],qz_=q[2],qw=q[3];
    // t = 2 * cross(q.xyz, v)
    const tx=2*(qy_*z - qz_*y), ty=2*(qz_*x - qx_*z), tz=2*(qx_*y - qy_*x);
    // v' = v + qw*t + cross(q.xyz, t)
    return {
      x: x + qw*tx + (qy_*tz - qz_*ty),
      y: y + qw*ty + (qz_*tx - qx_*tz),
      z: z + qw*tz + (qx_*ty - qy_*tx)
    };
  }

  function resize(){
    const rect=canvas.getBoundingClientRect();
    W=Math.round(rect.width)||800;
    H=Math.round(rect.height)||540;
    canvas.width=W*DPR; canvas.height=H*DPR;
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    // DPR1 => no scale, but keep canvas backing DPR1 for consistent fillRect
    const ctx=canvas.getContext('2d');
    if(ctx) ctx.setTransform(DPR,0,0,DPR,0,0);
  }

  function projectAll(){
    projected=[];
    const fov=420, near=0.5;
    for(let i=0;i<points.length;i++){
      const p=points[i];
      const r=rotatePoint(p.x||0,p.y||0,p.z||0);
      const z=r.z+2.2;
      if(z<near) continue;
      const scale=fov/(fov+z*1.4);
      const sx=W*0.5 + r.x*scale*W*0.42;
      const sy=H*0.5 - r.y*scale*H*0.42;
      projected.push({id:p.id, p, x:r.x, y:r.y, z:r.z, sx, sy, scale, c:p.c||p.okabe_color||OKABE[(p.c||0)%8]});
    }
    // painter's order far → near (stable)
    projected.sort((a,b)=>a.z-b.z);
    // LOD cull
    if(projected.length>LOD) projected=projected.slice(projected.length-LOD);
  }

  function draw(){
    const ctx=canvas.getContext('2d');
    if(!ctx) return;
    // void #080A0F fillRect DPR1
    ctx.fillStyle=VOID;
    ctx.fillRect(0,0,W,H);
    // subtle grid
    ctx.strokeStyle='rgba(30,42,68,.42)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(W*0.5,0); ctx.lineTo(W*0.5,H); ctx.moveTo(0,H*0.5); ctx.lineTo(W,H*0.5); ctx.stroke();

    for(const pr of projected){
      const isSel=selectedId && pr.id===selectedId;
      const isHover=hoverId && pr.id===hoverId;
      let col = pr.c;
      if(typeof col==='number') col=OKABE[col%8]||IVORY;
      if(!col) col=OKABE[0];
      // ivory #FFFEF7 replaces black — points visible dark bg
      let size = Math.max(2, Math.min(6, pr.scale*3.8));
      if(isSel){ size=7; }
      if(isHover) size+=1.5;
      // shadow dot for depth
      ctx.fillStyle=col;
      ctx.globalAlpha = isSel?1: Math.max(0.42, Math.min(0.98, 0.35+pr.scale*0.55));
      ctx.fillRect((pr.sx|0)- (size/2|0), (pr.sy|0)-(size/2|0), size|0, size|0);
      if(isSel){
        // ivory ring
        ctx.strokeStyle=IVORY; ctx.lineWidth=1.8; ctx.globalAlpha=1;
        ctx.strokeRect((pr.sx|0)-6, (pr.sy|0)-6, 12, 12);
        ctx.globalAlpha=1;
      }
    }
    ctx.globalAlpha=1;
  }

  function tick(t){
    if(paused){ animId=requestAnimationFrame(tick); return; }
    if(!lastT) lastT=t;
    const dt=Math.min(33, t-lastT); lastT=t;
    if(!isDragging && auto){
      rotY += velY*dt*0.001;
      rotX += velX*dt*0.001;
      velY *= MOMENTUM; velX *= MOMENTUM;
      if(Math.abs(velY)<0.0001) velY = 0.012;
      projectAll(); draw();
    } else if(!isDragging){
      velY*=MOMENTUM; velX*=MOMENTUM;
      rotY+=velY*dt*0.001; rotX+=velX*dt*0.001;
      if(Math.abs(velY)>0.0001 || Math.abs(velX)>0.0001){ projectAll(); draw(); }
    }
    animId=requestAnimationFrame(tick);
  }

  function attach(){
    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', e=>{
      isDragging=true; auto=false;
      lastX=e.clientX; lastY=e.clientY;
      canvas.setPointerCapture(e.pointerId); canvas.style.cursor='grabbing';
    });
    canvas.addEventListener('pointermove', e=>{
      const mx=e.clientX, my=e.clientY;
      if(isDragging){
        const dx=mx-lastX, dy=my-lastY;
        rotY += dx*0.004; rotX += dy*0.004;
        rotX=Math.max(-1.0, Math.min(1.0, rotX));
        velY=dx*0.06; velX=dy*0.06;
        lastX=mx; lastY=my;
        projectAll(); draw();
      } else {
        // hover detect nearest project
        const rect=canvas.getBoundingClientRect();
        const x=mx-rect.left, y=my-rect.top;
        let best=null, bd=14;
        for(const pr of projected){ const d=Math.hypot(pr.sx-x, pr.sy-y); if(d<bd){ bd=d; best=pr; } }
        const newHover=best?best.id:null;
        if(newHover!==hoverId){ hoverId=newHover; draw(); canvas.style.cursor=hoverId?'pointer':'grab'; }
      }
    });
    canvas.addEventListener('pointerup', e=>{
      isDragging=false; auto=true; canvas.style.cursor='grab';
      if(Math.abs(velY)<0.001) velY=0.012;
    });
    canvas.addEventListener('click', e=>{
      const rect=canvas.getBoundingClientRect();
      const x=e.clientX-rect.left, y=e.clientY-rect.top;
      let best=null, bd=14;
      for(const pr of projected){ const d=Math.hypot(pr.sx-x, pr.sy-y); if(d<bd){ bd=d; best=pr; } }
      if(best){
        const prev=selectedId;
        selectedId=best.id;
        // single-select clears previous highlight momentum 0.94
        if(prev && prev!==selectedId){
          // clear previous
        }
        canvas.dispatchEvent(new CustomEvent('point-select',{detail:{id:selectedId, point:best.p, x:best.p.x, y:best.p.y, z:best.p.z}}));
        draw();
      } else {
        if(selectedId){
          selectedId=null;
          canvas.dispatchEvent(new CustomEvent('point-deselect',{detail:{}}));
          draw();
        }
      }
    });
    canvas.addEventListener('keydown', e=>{
      if(e.key==='Escape'){
        if(selectedId){ selectedId=null; canvas.dispatchEvent(new CustomEvent('point-deselect')); draw(); }
      }
    });
    // wheel zoom (subtle)
    canvas.addEventListener('wheel', e=>{ e.preventDefault(); }, {passive:false});
    animId=requestAnimationFrame(tick);
  }

  const api={
    setPoints(arr){
      points=Array.isArray(arr)?arr.slice(0,1764):[];
      byId=new Map(points.map(p=>[p.id||p.pid,p]));
      projectAll(); draw();
    },
    setTarget(id){
      selectedId=id; projectAll(); draw();
    },
    clearSel(){
      selectedId=null; hoverId=null; projectAll(); draw();
    },
    setLOD(n){
      // LOD 8000 desktop / 4000 mobile — re-project
      // n is requested LOD, clamp
      const max=n>6000?8000:4000;
      // store but actual cull in projectAll uses LOD const; we emulate by slicing
      // for business-ready, respect param
      if(projected.length>max) projected=projected.slice(projected.length-max);
      draw();
    },
    pause(){ paused=true; },
    resume(){ paused=false; lastT=0; },
    get selected(){ return selectedId; }
  };

  // auto-mount
  if(canvas) attach();
  return api;
}
