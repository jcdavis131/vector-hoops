/* shared-map.js v2-light — OOM fix for Aw Snap
   - No arc(), use fillRect 2x2 batched by color
   - LOD: mobile 4000 pts, desktop 8000 pts sampled
   - DPR=1, throttle 30fps/24fps, idle pause 8s, pause on hidden/focus
   - Fast first paint: vectors_lite.json (617KB) then lazy names from search_lite_pos
*/
export async function mountSharedMap(canvas, opts={}){
  if(!canvas) return null;
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const ARCH=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const POS=['PG','SG','SF','PF','C'];
  const highlightInit = opts.highlightId ?? null;
  const dark = !!opts.dark;
  const isMobile = (typeof window!=='undefined') && (window.innerWidth<700 || /Android|iPhone|iPad/i.test(navigator.userAgent||''));
  const maxRender = isMobile ? 4000 : 8000;
  const frameBudget = isMobile ? 42 : 33; // 24fps / 30fps
  const reduceMotion = (typeof window!=='undefined') && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // state
  let N=0, baseOx=null, baseOy=null, baseOz=null, baseC=null, baseI=null, baseN=[], baseS=[], baseP=[];
  let projected=[], projById=null, maxId=0;
  let W=0,H=0, rotY=Math.PI*0.18, rotX=0.22, auto=!reduceMotion, lastT=0, isDragging=false, lastX=0,lastY=0, idleMs=0;
  let embedPaused=false, lastRender=0;
  let targetId=highlightInit, guessIds=Array.isArray(opts.guessIds)?opts.guessIds.slice():[];
  let hoverEl=null; try{hoverEl=document.getElementById('hover-tip');}catch{}
  let ctx=null;
  try{ ctx=canvas.getContext('2d',{alpha:false}); }catch{ ctx=canvas.getContext('2d'); }

  function getSize(){
    const rect=canvas.getBoundingClientRect();
    let w=rect.width, h=rect.height;
    if(w<10||h<10){
      const pr=canvas.parentElement?.getBoundingClientRect();
      w=Math.max(w, pr?.width||0, 320);
      h=Math.max(h, pr?.height||0, 380);
      if(w<10) w=window.innerWidth||390;
      if(h<10) h=Math.round((window.innerHeight||800)*0.5);
    }
    return {w:Math.max(10,Math.round(w)), h:Math.max(10,Math.round(h))};
  }

  function resize(){
    if(!canvas) return;
    const sz=getSize(); W=sz.w; H=sz.h;
    // DPR=1 to cut memory
    canvas.width=W; canvas.height=H;
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    if(ctx) ctx.setTransform(1,0,0,1,0,0);
    projectFrame();
    draw();
  }

  function ensureArrays(len){
    if(!baseOx || baseOx.length!==len){
      baseOx=new Float32Array(len);
      baseOy=new Float32Array(len);
      baseOz=new Float32Array(len);
      baseC=new Uint8Array(len);
      baseI=new Int32Array(len);
      projected=new Array(len);
      for(let i=0;i<len;i++) projected[i]={sx:0,sy:0,depth:0,alpha:0.6};
    }
  }

  async function loadLite(){
    const urls=['assets/vectors_map_lite.json','assets/vectors_lite.json','assets/vectors_search_lite.json'];
    for(const u of urls){
      try{
        const r=await fetch(u,{cache:'default'});
        if(!r.ok) continue;
        const j=await r.json();
        const arr=j.players||j;
        if(!Array.isArray(arr)||!arr.length) continue;
        N=arr.length;
        ensureArrays(N);
        let localMax=0;
        for(let i=0;i<N;i++){
          const p=arr[i]||{};
          baseOx[i]=((p.x??0.5)-0.5)*2;
          baseOy[i]=((p.y??0.5)-0.5)*2;
          baseOz[i]=((p.z??0.5)-0.5)*2;
          baseC[i]=(p.c|0)&7;
          baseI[i]=p.i!=null? (p.i|0) : i;
          baseN[i]=p.n||'';
          baseS[i]=p.s||'';
          baseP[i]=p.p??-1;
          projected[i].c=baseC[i];
          if(baseI[i]>localMax) localMax=baseI[i];
        }
        maxId=localMax;
        projById=new Int32Array(maxId+1); projById.fill(-1);
        for(let i=0;i<N;i++){ const id=baseI[i]; if(id>=0&&id<=maxId) projById[id]=i; }
        console.log('shared-map v2 lite loaded',N,u);
        return true;
      }catch(e){ console.warn('lite load fail',u,e); }
    }
    return false;
  }

  function mergeNames(arr){
    const map=new Map();
    for(const p of arr){ if(p.i!=null) map.set(p.i,{n:p.n,s:p.s,p:p.p}); }
    for(let i=0;i<N;i++){ const id=baseI[i]; const hit=map.get(id); if(hit){ baseN[i]=hit.n; baseS[i]=hit.s; baseP[i]=hit.p??baseP[i]; } }
    return map.size;
  }
  function gameSearchLite(timeoutMs){
    // resolves with the game's already-fetched search pool, or null on pages without it
    if(!(window.VHPastModern&&VHPastModern.state)) return Promise.resolve(null);
    return new Promise(res=>{
      const t0=Date.now();
      (function poll(){
        try{
          const sl=VHPastModern.state().searchLite;
          const arr=sl&&(sl.players||sl);
          if(Array.isArray(arr)&&arr.length) return res(arr);
        }catch{}
        if(Date.now()-t0>timeoutMs) return res(null);
        setTimeout(poll,250);
      })();
    });
  }
  async function loadNamesLazy(){
    // if we already have names (from search_lite_pos), skip
    if(baseN[0] && baseN[0].length) return;
    // the game page already holds vectors_search_lite.json in memory — merging
    // from it saves the 1.26MB search_lite_pos fetch (positions stay unknown)
    try{
      const game=await gameSearchLite(6000);
      if(game){ console.log('shared-map v2 names merged from game state', mergeNames(game)); return; }
    }catch{}
    try{
      const r=await fetch('assets/vectors_search_lite_pos.json?v=51',{cache:'default'});
      if(!r.ok) return;
      const j=await r.json();
      const arr=j.players||j;
      if(!Array.isArray(arr)) return;
      console.log('shared-map v2 names lazy merged', mergeNames(arr));
    }catch(e){ console.warn('names lazy fail',e); }
  }

  // projection - only sampled subset for perf, but we need all for target/guess lookup; we project all but render sampled
  function projectFrame(){
    if(!baseOx||!N) return;
    // self-heal: NaN rotation would collapse every dot to (0,0) via |0
    if(!isFinite(rotY)||!isFinite(rotX)){ rotY=Math.PI*0.18; rotX=0.22; }
    const cy=Math.cos(rotY), sy=Math.sin(rotY), cx=Math.cos(rotX), sx=Math.sin(rotX);
    const persp=2.8;
    const W2=W*0.5, H2=H*0.5, W40=W*0.40, H40=H*0.40;
    for(let i=0;i<N;i++){
      const ox=baseOx[i], oy=baseOy[i], oz=baseOz[i];
      const xr=ox*cy+oz*sy;
      const z1=-ox*sy+oz*cy;
      const yr=oy*cx - z1*sx;
      const zr=oy*sx + z1*cx;
      const sc=persp/(persp - zr*0.55);
      const pr=projected[i];
      pr.sx=W2 + xr*sc*W40;
      pr.sy=H2 - yr*sc*H40;
      pr.depth=(zr+1)*0.5;
      pr.alpha=0.22+pr.depth*0.78;
    }
  }

  // draw LOD batched by color using fillRect (no arc)
  function draw(){
    if(!ctx||!W||!H) return;
    ctx.clearRect(0,0,W,H);
    if(dark){
      ctx.fillStyle='#080A0F';
      ctx.fillRect(0,0,W,H);
      // subtle vignette via rects not gradient to save
    } else {
      ctx.fillStyle='#FFFEF7';
      ctx.fillRect(0,0,W,H);
    }
    if(!N){ ctx.fillStyle=dark?'#FFFEF7':'#1A150F'; ctx.font='800 12px ui-monospace,monospace'; ctx.fillText('Loading map…', 14, 22); return; }

    // sampling
    const step=Math.max(1, Math.ceil(N / maxRender));
    // group by color batches: we will iterate colors and inside iterate sampled indices
    const dotSize = W<600?2:2;
    for(let c=0;c<8;c++){
      ctx.fillStyle=OKABE[c];
      // batched draw
      for(let i=0;i<N;i+=step){
        if(baseC[i]!==c) continue;
        const pr=projected[i];
        if(!pr) continue;
        if(pr.sx< -20 || pr.sx> W+20 || pr.sy< -20 || pr.sy> H+20) continue;
        // alpha via globalAlpha cheap but we batch: use opacity 0.75 for all except depth fade approximated
        const x = pr.sx|0, y=pr.sy|0;
        ctx.fillRect(x, y, dotSize, dotSize);
      }
    }

    // guesses: orange rings with white underlay so they read on dark clusters
    if(guessIds && guessIds.length){
      for(let gi=0;gi<guessIds.length;gi++){
        const gid=guessIds[gi]; if(gid==null||gid>maxId) continue;
        const idx=projById?projById[gid]:-1; if(idx<0) continue;
        const pr=projected[idx]; if(!pr) continue;
        if(pr.sx< -30 || pr.sx> W+30 || pr.sy< -30 || pr.sy> H+30) continue;
        const gx=(pr.sx|0), gy=(pr.sy|0);
        ctx.strokeStyle='#FFFFFF'; ctx.lineWidth=4; ctx.strokeRect(gx-5, gy-5, 10,10);
        ctx.strokeStyle='#D55E00'; ctx.lineWidth=2; ctx.strokeRect(gx-5, gy-5, 10,10);
      }
    }

    // target: bullseye + crosshair — a plain yellow dot vanishes inside the yellow
    // archetype cluster, so shape+outline carries the signal, not color.
    // (arc() is fine here: one marker per frame, unlike the 4-8k dots above)
    if(targetId!=null && projById && targetId<=maxId){
      const idx=projById[targetId];
      if(idx>=0){
        const pr=projected[idx];
        if(pr && pr.sx>= -20 && pr.sx<=W+20 && pr.sy>= -20 && pr.sy<=H+20){
          const x=pr.sx|0, y=pr.sy|0;
          ctx.lineWidth=3; ctx.strokeStyle='#FFFFFF';
          ctx.beginPath(); ctx.arc(x,y,11,0,Math.PI*2); ctx.stroke();
          ctx.lineWidth=2.4; ctx.strokeStyle='#1A150F';
          ctx.beginPath(); ctx.arc(x,y,7.5,0,Math.PI*2); ctx.stroke();
          ctx.fillStyle='#F0E442';
          ctx.beginPath(); ctx.arc(x,y,3.4,0,Math.PI*2); ctx.fill();
          ctx.lineWidth=1.2; ctx.strokeStyle='#1A150F';
          ctx.beginPath(); ctx.arc(x,y,3.4,0,Math.PI*2); ctx.stroke();
          ctx.lineWidth=2; ctx.strokeStyle='#1A150F';
          ctx.beginPath();
          ctx.moveTo(x-17,y); ctx.lineTo(x-11,y); ctx.moveTo(x+11,y); ctx.lineTo(x+17,y);
          ctx.moveTo(x,y-17); ctx.lineTo(x,y-11); ctx.moveTo(x,y+11); ctx.lineTo(x,y+17);
          ctx.stroke();
        }
      }
    }
  }

  // single rAF chain that fully stops when paused or static; resume paths call scheduleLoop()
  let rafPending=false;
  function scheduleLoop(){ if(!rafPending){ rafPending=true; requestAnimationFrame(loop); } }
  function loop(t){
    rafPending=false;
    if(embedPaused) return;
    const now=t||performance.now();
    if(now-lastRender < frameBudget){ scheduleLoop(); return; }
    lastRender=now;
    if(!lastT) lastT=now;
    const dt=Math.min(50, now-lastT); lastT=now;
    if(!isDragging && auto){
      rotY+=dt*0.00022;
      idleMs+=dt;
      if(idleMs>8000){ auto=false; embedPaused=true; console.log('map idle pause'); return; }
    } else if(!isDragging && !auto){
      // static scene: render once and stop burning frames
      projectFrame();
      try{ draw(); }catch(e){ console.warn('draw fail',e); }
      return;
    } else {
      idleMs=0;
    }
    projectFrame();
    try{ draw(); }catch(e){ console.warn('draw fail',e); }
    scheduleLoop();
  }

  // interaction
  function onDown(ev){
    const pt=ev.touches? ev.touches[0]:ev;
    isDragging=true; auto=false; idleMs=0; lastX=pt.clientX; lastY=pt.clientY;
    canvas.style.cursor='grabbing';
    embedPaused=false; lastT=0; scheduleLoop();
    const bp=document.getElementById('btn-pause'); if(bp) bp.textContent='Pause';
  }
  function onMove(ev){
    const pt=ev.touches? ev.touches[0]:ev;
    const x=pt.clientX, y=pt.clientY;
    if(isDragging){
      const dx=x-lastX, dy=y-lastY;
      rotY+=dx*0.0065; rotX+=dy*0.0045;
      rotX=Math.max(-0.92, Math.min(0.92, rotX));
      lastX=x; lastY=y;
      return;
    }
    if(!hoverEl) return;
    const rect=canvas.getBoundingClientRect();
    const mx=x-rect.left, my=y-rect.top;
    let best=null,bd=isMobile?28:22;
    const step=Math.max(1, Math.ceil(N/maxRender));
    for(let i=0;i<N;i+=step){
      const pr=projected[i]; if(!pr) continue;
      const d=Math.hypot(pr.sx-mx, pr.sy-my);
      if(d<bd){ bd=d; best=i; }
    }
    if(best!=null){
      hoverEl.style.display='block';
      hoverEl.style.left=projected[best].sx+'px';
      hoverEl.style.top=(projected[best].sy-42)+'px';
      const n=baseN[best]||''; const s=baseS[best]||''; const c=baseC[best];
      const arch=ARCH[c%8]||'';
      const pos=baseP[best]>=0?(POS[(baseP[best]|0)%5]||''):'';
      hoverEl.innerHTML=`<b>${(n||'').replace(/</g,'&lt;')}</b> ${(s||'').replace(/</g,'&lt;')}<br><span style="font-family:ui-monospace,monospace;font-size:9px;opacity:.8">${pos?pos+' • ':''}${arch}</span>`;
    } else {
      hoverEl.style.display='none';
    }
  }
  function onUp(){ if(isDragging){ isDragging=false; canvas.style.cursor='grab'; lastT=0; } }

  try{
    window.addEventListener('vh:pause-maps',()=>{ embedPaused=true; auto=false; });
    window.addEventListener('vh:resume-maps',()=>{ embedPaused=false; auto=!reduceMotion; lastT=0; idleMs=0; scheduleLoop(); });
    document.addEventListener('focusin',(e)=>{ if(e.target && (e.target.id==='guess-input' || e.target.matches&&e.target.matches('input.input'))){ embedPaused=true; auto=false; } });
    document.addEventListener('visibilitychange',()=>{ if(document.hidden){ embedPaused=true; } else { embedPaused=false; lastT=0; scheduleLoop(); } });
  }catch{}

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, {passive:true});
  canvas.addEventListener('touchmove', onMove, {passive:true});
  canvas.addEventListener('touchend', onUp);
  canvas.addEventListener('mouseleave',()=>{ if(hoverEl) hoverEl.style.display='none'; });

  const pauseBtn=document.getElementById('btn-pause');
  if(pauseBtn){
    pauseBtn.addEventListener('click',()=>{ auto=!auto; embedPaused=!auto; pauseBtn.textContent=auto?'Pause':'Resume'; lastT=0; idleMs=0; if(auto) scheduleLoop(); });
  }
  const resetBtn=document.getElementById('btn-reset');
  if(resetBtn){
    resetBtn.addEventListener('click',()=>{ rotY=Math.PI*0.18; rotX=0.22; auto=!reduceMotion; embedPaused=false; idleMs=0; lastT=0; if(pauseBtn) pauseBtn.textContent=auto?'Pause':'Resume'; resize(); scheduleLoop(); });
  }

  // load and start
  resize();
  let ro=null; try{ ro=new ResizeObserver(resize); ro.observe(canvas); if(canvas.parentElement) ro.observe(canvas.parentElement); }catch{}
  const ok=await loadLite();
  if(ok){ projectFrame(); draw(); scheduleLoop(); loadNamesLazy().then(()=>{ projectFrame(); draw(); }); }
  else { ctx.fillStyle='#FFFEF7'; ctx.fillText('Map failed to load',14,22); }

  return {
    setTarget(id){ targetId=id==null?null:id|0; draw(); },
    setGuesses(ids){ guessIds=Array.isArray(ids)?ids.slice():[]; draw(); },
    focusOnTarget(){
      // targetId>maxId would read past the Int32Array end: idx=undefined -> atan2(undefined)=NaN -> map collapses
      if(targetId==null||!projById||targetId<0||targetId>maxId) return;
      const idx=projById[targetId]; if(idx==null||idx<0) return;
      const ox=baseOx[idx], oy=baseOy[idx], oz=baseOz[idx];
      const ry=-Math.atan2(ox,oz); const r=Math.sqrt(ox*ox+oz*oz)||1; const rx=-Math.atan2(oy,r)*0.85;
      if(isFinite(ry)&&isFinite(rx)){ rotY=ry; rotX=rx; }
      projectFrame(); draw();
    },
    hasPoint(id){ return !!(projById && id!=null && id>=0 && id<=maxId && projById[id]>=0); },
    // append one row (e.g. a daily target outside the sampled lite map) so the bullseye always exists
    addPoint(p){
      try{
        if(!p||p.i==null||!baseOx) return false;
        const id=p.i|0;
        if(id>=0 && id<=maxId && projById && projById[id]>=0) return true;
        const n=N+1;
        const nOx=new Float32Array(n), nOy=new Float32Array(n), nOz=new Float32Array(n);
        const nC=new Uint8Array(n), nI=new Int32Array(n);
        nOx.set(baseOx); nOy.set(baseOy); nOz.set(baseOz); nC.set(baseC); nI.set(baseI);
        nOx[N]=((p.x??0.5)-0.5)*2; nOy[N]=((p.y??0.5)-0.5)*2; nOz[N]=((p.z??0.5)-0.5)*2;
        nC[N]=(p.c|0)&7; nI[N]=id;
        baseOx=nOx; baseOy=nOy; baseOz=nOz; baseC=nC; baseI=nI;
        baseN[N]=p.n||''; baseS[N]=p.s||''; baseP[N]=p.p??-1;
        projected.push({sx:0,sy:0,depth:0,alpha:0.6,c:nC[N]});
        N=n;
        if(id>maxId){ const np=new Int32Array(id+1); np.fill(-1); if(projById) np.set(projById); projById=np; maxId=id; }
        projById[id]=N-1;
        projectFrame(); draw();
        return true;
      }catch(e){ console.warn('addPoint fail',e); return false; }
    },
    resize, getCount(){return N;},
    dispose(){ try{ro&&ro.disconnect();}catch{} }
  };
}
