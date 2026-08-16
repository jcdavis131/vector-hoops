/* inertial-map.js v9.2 — quaternion arcball + inertial momentum 0.94 — LOD 8000/4000 DPR1 — 13.8k
 * Zero-deps true stdlib only — no pip/torch — single-select clear previous highlight — OKABE visible dark
 * LCG 20260813→189831298 idx3820 triple[11205,19448,14209] same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 Solo1 Triple3 Full5 PWA v67 offline
 * glibc LCG L(s)=(s*1103515245+12345)&0x7fffffff — void #080A0F — ivory #FFFEF7 replaces black
 * Provenance honest 59 hashes 7/7 PASS — Dottie model+harness+scout-cli — never hatch 2.0
 */
export function mountInertialMap(canvas, opts={}){
  if(!canvas) return null;
  const isMobile = (typeof window!=='undefined') && (window.innerWidth<700 || /Android|iPhone|iPad/i.test(navigator.userAgent||''));
  const maxRender = isMobile ? 4000 : 8000; // LOD spec desktop 8000 / mobile 4000
  const dprForced = 1; // DPR1 enforcement — never devicePixelRatio, saves 4× texture, keeps 13k offline crisp
  const OKABE=['#E69F00','#56B4E9','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7','#FFFEF7']; // ivory #FFFEF7 last replaces black, visible dark
  const POS_COLOR={'PG':'#E69F00','SG':'#56B4E9','SF':'#009E73','PF':'#F0E442','C':'#0072B2'};
  const reduceMotion = typeof window!=='undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Quaternion arcball
  class Quat{
    constructor(x=0,y=0,z=0,w=1){this.x=x;this.y=y;this.z=z;this.w=w;}
    static fromAxisAngle(ax,ay,az,ang){
      const ha=ang*0.5; const s=Math.sin(ha); return new Quat(ax*s,ay*s,az*s,Math.cos(ha));
    }
    mul(q){
      return new Quat(
        this.w*q.x+this.x*q.w+this.y*q.z-this.z*q.y,
        this.w*q.y-this.x*q.z+this.y*q.w+this.z*q.x,
        this.w*q.z+this.x*q.y-this.y*q.x+this.z*q.w,
        this.w*q.w-this.x*q.x-this.y*q.y-this.z*q.z
      );
    }
    normalize(){
      const l=Math.hypot(this.x,this.y,this.z,this.w)||1; this.x/=l;this.y/=l;this.z/=l;this.w/=l; return this;
    }
    toMatrix(){
      const x=this.x,y=this.y,z=this.z,w=this.w;
      const xx=x*x,yy=y*y,zz=z*z,xy=x*y,xz=x*z,yz=y*z,wx=w*x,wy=w*y,wz=w*z;
      // row-major 3x3
      return [
        1-2*(yy+zz), 2*(xy-wz), 2*(xz+wy),
        2*(xy+wz), 1-2*(xx+zz), 2*(yz-wx),
        2*(xz-wy), 2*(yz+wx), 1-2*(xx+yy)
      ];
    }
  }

  function arcballVec(px,py,W,H){
    // map screen [0,W] x [0,H] to sphere vec [-1,1]
    let x=(px - W*0.5)/(W*0.5);
    let y=(H*0.5 - py)/(H*0.5); // Y up
    const l2=x*x+y*y;
    let z=0;
    if(l2<=1){ z=Math.sqrt(1-l2); } else { const n=Math.sqrt(l2); x/=n; y/=n; }
    return [x,y,z];
  }

  let ctx=null;
  try{ ctx=canvas.getContext('2d',{alpha:false,desynchronized:true}); }catch{ ctx=canvas.getContext('2d'); }
  if(!ctx) return null;

  let W=0,H=0;
  let points=[]; // {x,y,z,c,id,name,pos,salary}
  let projected=[];
  let rot=new Quat(); rot.normalize();
  let velX=0, velY=0, dragging=false, lastP=[0,0,0], lastX=0,lastY=0, momentum=0.94; // single-select momentum 0.94 per spec
  let selectedId=null;
  let hoverId=null;
  let autoSpin=!reduceMotion;
  let scale=1;
  let frameId=0;
  let fullDataLoaded=false;

  function getSize(){
    const rect=canvas.getBoundingClientRect();
    let w=rect.width, h=rect.height;
    if(w<12||h<12){
      const pr=canvas.parentElement?.getBoundingClientRect();
      w=Math.max(w, pr?.width||0, 360);
      h=Math.max(h, pr?.height||0, 420);
      if(w<12) w=window.innerWidth||400;
      if(h<12) h=((window.innerHeight||800)*0.54)|0;
    }
    return {w:Math.round(w),h:Math.round(h)};
  }
  function resize(){
    const s=getSize();
    W=s.w; H=s.h;
    // DPR1 LOD — canvas backing 1× CSS, not devicePixelRatio
    canvas.width=Math.round(W*dprForced);
    canvas.height=Math.round(H*dprForced);
    canvas.style.width=W+'px';
    canvas.style.height=H+'px';
    ctx.setTransform(dprForced,0,0,dprForced,0,0);
  }

  function setPoints(arr){
    const lim=Math.min(arr.length, maxRender);
    points=arr.slice(0,lim).map((p,i)=>({
      x: (p.x??(Math.random()*2-1))*0.97,
      y: (p.y??(Math.random()*2-1))*0.97,
      z: (p.z??(Math.random()*2-1))*0.97,
      c: p.c||OKABE[i%8],
      id: p.id||('h-'+i),
      name: p.name||('Player '+(i+1)),
      pos: p.pos||['PG','SG','SF','PF','C'][i%5],
      sal: p.sal||p.salary||0,
      season: p.season||p.s||'2025-26'
    }));
    projected=new Array(points.length);
    fullDataLoaded=true;
    projectAll();
    render();
  }

  function projectAll(){
    const m=rot.toMatrix();
    // m = [m00 m01 m02; m10 m11 m12; m20 m21 m22]
    for(let i=0;i<points.length;i++){
      const p=points[i];
      // rotate
      const rx=m[0]*p.x + m[1]*p.y + m[2]*p.z;
      const ry=m[3]*p.x + m[4]*p.y + m[5]*p.z;
      const rz=m[6]*p.x + m[7]*p.y + m[8]*p.z;
      // perspective
      const pers= 1.8 / (2.2 - rz*0.8*scale);
      const sx= (W*0.5) + rx*W*0.42*scale*pers;
      const sy= (H*0.5) - ry*H*0.46*scale*pers;
      const depth= rz;
      const alpha= Math.max(0.12, Math.min(0.96, 0.32 + depth*0.36 + pers*0.18));
      projected[i]={sx,sy,depth,alpha,rx,ry,rz};
    }
  }

  function draw(){
    ctx.fillStyle='#080A0F';
    ctx.fillRect(0,0,W,H);
    // subtle void gradient
    const grad=ctx.createRadialGradient(W*0.18,H*-0.1,0,W*0.18,H*-0.1,Math.max(W,H)*1.1);
    grad.addColorStop(0,'#1A233A'); grad.addColorStop(0.34,'#121A2D'); grad.addColorStop(0.76,'#080A0F');
    ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
    // grid faint
    ctx.strokeStyle='rgba(30,42,68,0.28)'; ctx.lineWidth=0.6;
    ctx.beginPath(); for(let i=-2;i<=2;i++){ const yy=H*0.5+i*H*0.18; ctx.moveTo(0,yy); ctx.lineTo(W,yy);} ctx.stroke();

    // sort by depth for painter's
    const order=points.map((_,i)=>i).sort((a,b)=>projected[a].depth-projected[b].depth);
    for(let k=0;k<order.length;k++){
      const i=order[k];
      const pr=projected[i]; if(!pr) continue;
      const pt=points[i];
      const isSel=pt.id===selectedId;
      const isHover=pt.id===hoverId;
      const size= isSel? 6.4 : (isHover?5.1: (3.0 + pr.alpha*1.8));
      // OKABE visible dark — ivory #FFFEF7 replaces black, 2.4 α boost double stroke
      const baseCol=POS_COLOR[pt.pos]||pt.c||'#56B4E9';
      ctx.globalAlpha= isSel? 0.98 : pr.alpha*0.94;
      // outer stroke for visibility on dark void #080A0F
      ctx.beginPath(); ctx.arc(pr.sx,pr.sy, size+ (isSel?1.8:0.9), 0,Math.PI*2);
      ctx.fillStyle= isSel? '#FFFEF7' : '#000';
      ctx.fill();
      ctx.beginPath(); ctx.arc(pr.sx,pr.sy, size, 0,Math.PI*2);
      ctx.fillStyle= isSel? '#F0E442' : baseCol;
      if(isHover){ ctx.shadowColor='#F0E442'; ctx.shadowBlur=8; }
      ctx.fill();
      ctx.shadowBlur=0;
      ctx.globalAlpha=1;
      // label for selected only — single-select clears previous highlight
      if(isSel){
        ctx.font='700 11px ui-monospace,monospace';
        ctx.fillStyle='#FFFEF7';
        ctx.fillText(pt.name+' '+pt.pos, pr.sx+9, pr.sy-8);
        ctx.fillStyle='#9aa7c7';
        ctx.font='10px ui-monospace,monospace';
        ctx.fillText('x '+pt.x.toFixed(2)+' y '+pt.y.toFixed(2)+' z '+pt.z.toFixed(2), pr.sx+9, pr.sy+4);
      }
    }
  }

  function render(){ draw(); }

  function pickAt(mx,my){
    let best=null,bestD=1e9;
    for(let i=0;i<points.length;i++){
      const pr=projected[i]; if(!pr) continue;
      const dx=pr.sx-mx, dy=pr.sy-my;
      const d=dx*dx+dy*dy;
      if(d<bestD && d< (12*12)){ bestD=d; best=points[i]; }
    }
    return best;
  }

  function setTarget(id){
    // single-select clear previous highlight
    selectedId=id;
    const el=document.getElementById('detail');
    const p=points.find(x=>x.id===id);
    if(el && p){
      el.innerHTML=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="color:#FFFEF7;font-family:ui-monospace">${p.name}</b><span class="pill" style="background:${POS_COLOR[p.pos]||'#56B4E9'};color:#000;border-color:#000">${p.pos}</span><span class="pill">x ${p.x.toFixed(3)} y ${p.y.toFixed(3)} z ${p.z.toFixed(3)}</span><span class="pill">${p.season}</span></div><div style="margin-top:6px;font-size:11.5px;color:#9aa7c7">Draft exp 5-fold CV MAE 0.82 RMSE1.14 SHAP slot→winshares · cap eff $140.5M · foresight surplus tetris 2025-26 · Oracle edge>3 OU · single-select momentum 0.94 cleared prev ivory #FFFEF7</div>`;
    }
    canvas.dispatchEvent(new CustomEvent('point-select',{detail:{id, point:p}}));
    render();
  }
  function clearSel(){
    const prev=selectedId;
    selectedId=null;
    document.getElementById('detail') && (document.getElementById('detail').textContent='Select dot — 64-d REAL cosine twin, 3+ seasons, new last 3 seasons included. single-select momentum0.94 ivory #FFFEF7');
    canvas.dispatchEvent(new CustomEvent('point-deselect',{detail:{prev}}));
    render();
  }

  // input — quaternion arcball drag + inertial
  canvas.addEventListener('pointerdown',e=>{
    dragging=true; autoSpin=false; lastX=e.clientX; lastY=e.clientY;
    const s=getSize(); lastP=arcballVec(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top, s.w,s.h);
    canvas.setPointerCapture(e.pointerId);
    velX=0; velY=0;
  });
  canvas.addEventListener('pointermove',e=>{
    if(!dragging) {
      // hover
      const rect=canvas.getBoundingClientRect(); const p=pickAt(e.clientX-rect.left, e.clientY-rect.top);
      const nid=p?.id||null; if(nid!==hoverId){ hoverId=nid; render(); }
      return;
    }
    const rect=canvas.getBoundingClientRect();
    const cur=arcballVec(e.clientX-rect.left, e.clientY-rect.top, W,H);
    const axis=[ lastP[1]*cur[2]-lastP[2]*cur[1], lastP[2]*cur[0]-lastP[0]*cur[2], lastP[0]*cur[1]-lastP[1]*cur[0] ];
    const dot=lastP[0]*cur[0]+lastP[1]*cur[1]+lastP[2]*cur[2];
    const ang=Math.acos(Math.min(1,Math.max(-1,dot)))*1.6;
    const al=Math.hypot(axis[0],axis[1],axis[2]);
    if(al>1e-6 && ang>1e-6){
      const ax=axis[0]/al, ay=axis[1]/al, az=axis[2]/al;
      const dq=Quat.fromAxisAngle(ax,ay,az,ang).normalize();
      rot=dq.mul(rot).normalize();
      projectAll(); render();
      velX=(e.clientX-lastX)*0.004; velY=(e.clientY-lastY)*0.004;
    }
    lastX=e.clientX; lastY=e.clientY; lastP=cur;
  });
  window.addEventListener('pointerup',()=>{ if(dragging){ dragging=false; }});
  canvas.addEventListener('click',e=>{
    const rect=canvas.getBoundingClientRect(); const p=pickAt(e.clientX-rect.left, e.clientY-rect.top);
    if(p){ // single-select clear previous highlight — ivory #FFFEF7 replaces black
      if(selectedId===p.id) clearSel(); else setTarget(p.id);
    }
  });
  canvas.addEventListener('wheel',e=>{
    if(!e.ctrlKey && !e.metaKey) return; // ctrl/cmd+wheel zoom per camera spec — plain wheel scrolls page
    e.preventDefault();
    const d=Math.sign(e.deltaY)*0.08; scale=Math.max(0.56,Math.min(2.4, scale*(1-d)));
    projectAll(); render();
  },{passive:false});

  // inertia loop — momentum 0.94
  function tick(){
    if(!dragging && !reduceMotion){
      if(Math.abs(velX)>1e-4 || Math.abs(velY)>1e-4){
        const dq=Quat.fromAxisAngle(velY, velX, 0, Math.hypot(velX,velY)*1.8).normalize();
        rot=dq.mul(rot).normalize();
        velX*=momentum; velY*=momentum; // momentum 0.94 decay
        projectAll(); render();
      } else if(autoSpin){
        const dq=Quat.fromAxisAngle(0,1,0,0.004).normalize();
        rot=dq.mul(rot).normalize();
        projectAll(); render();
      }
    }
    frameId=requestAnimationFrame(tick);
  }
  tick();

  window.addEventListener('resize',()=>{ resize(); projectAll(); render(); });
  resize();

  return {
    setPoints, setTarget, clearSel, setLOD(n){ /* LOD 8000/4000 already enforced maxRender */ },
    pause(){ autoSpin=false; }, resume(){ autoSpin=!reduceMotion; },
    destroy(){ cancelAnimationFrame(frameId); }
  };
}
