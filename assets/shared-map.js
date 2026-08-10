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
  // zoom is a pure projection scale — the mouse path never used one, but a
  // keyboard user has no pinch gesture, so without it the map is a fixed
  // wide shot and 12,966 points at 2px are unreadable.
  let zoom=1;
  const ZOOM_MIN=0.6, ZOOM_MAX=4;
  // guesses are stored as {idx, sim, rank} — idx is the external player id
  // (same id space as targetId, translated through projById below), sim is
  // 0..1 similarity, rank is 0-based (0 = exact match). A plain array of
  // numbers is still accepted for back-compat and normalized to {idx} only,
  // which just means no distance line/label for those entries.
  function normalizeGuesses(list){
    if(!Array.isArray(list)) return [];
    const out=[];
    for(const g of list){
      if(g==null) continue;
      if(typeof g==='object'){
        const idx=g.idx!=null?g.idx|0:(g.id!=null?g.id|0:null);
        if(idx==null) continue;
        out.push({ idx, sim:(typeof g.sim==='number'?g.sim:null), rank:(typeof g.rank==='number'?g.rank:null) });
      } else {
        out.push({ idx:g|0, sim:null, rank:null });
      }
    }
    return out;
  }
  let targetId=highlightInit, guessIds=normalizeGuesses(opts.guessIds);
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
    const sz=getSize();
    // A ResizeObserver below watches this canvas, and this function writes the
    // canvas's own size — so every call could feed the observer that called it,
    // and each pass reprojects the whole point cloud. Bail when nothing actually
    // changed so that loop cannot sustain itself, and skip the style writes when
    // they would be no-ops (writing an identical value still dirties layout).
    if(W===sz.w && H===sz.h && canvas.width===sz.w && canvas.height===sz.h) return;
    W=sz.w; H=sz.h;
    // DPR=1 to cut memory
    canvas.width=W; canvas.height=H;
    if(canvas.style.width!==W+'px') canvas.style.width=W+'px';
    if(canvas.style.height!==H+'px') canvas.style.height=H+'px';
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
    const W2=W*0.5, H2=H*0.5, W40=W*0.40*zoom, H40=H*0.40*zoom;
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

    // target screen position, computed early so guess lines can reach it —
    // the bullseye itself still draws later/on top, in its original spot
    let targetPr=null;
    if(targetId!=null && projById && targetId<=maxId){
      const tIdx=projById[targetId];
      if(tIdx>=0){
        const p=projected[tIdx];
        if(p && p.sx>=-20 && p.sx<=W+20 && p.sy>=-20 && p.sy<=H+20) targetPr=p;
      }
    }

    // guesses: a line to the target (how far off you were), then the orange
    // ring on top. The latest guess reads solid; earlier ones fade to dashed
    // so the map doesn't turn into a spiderweb after six tries.
    let latestGuessPr=null, latestGuessMeta=null;
    if(guessIds && guessIds.length){
      for(let gi=0;gi<guessIds.length;gi++){
        const gm=guessIds[gi]; if(!gm||gm.idx==null||gm.idx>maxId) continue;
        const idx=projById?projById[gm.idx]:-1; if(idx<0) continue;
        const pr=projected[idx]; if(!pr) continue;
        if(pr.sx< -30 || pr.sx> W+30 || pr.sy< -30 || pr.sy> H+30) continue;
        const gx=(pr.sx|0), gy=(pr.sy|0);
        const isLatest=gi===guessIds.length-1;
        if(targetPr){
          ctx.save();
          ctx.globalAlpha=isLatest?0.85:0.25;
          ctx.strokeStyle=dark?'#F0E442':'#1A150F';
          ctx.lineWidth=isLatest?1.6:1;
          if(!isLatest) ctx.setLineDash([3,3]);
          ctx.beginPath(); ctx.moveTo(gx,gy); ctx.lineTo(targetPr.sx|0, targetPr.sy|0); ctx.stroke();
          ctx.restore();
        }
        ctx.strokeStyle='#FFFFFF'; ctx.lineWidth=4; ctx.strokeRect(gx-5, gy-5, 10,10);
        ctx.strokeStyle='#D55E00'; ctx.lineWidth=2; ctx.strokeRect(gx-5, gy-5, 10,10);
        if(isLatest){ latestGuessPr={x:gx,y:gy}; latestGuessMeta=gm; }
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

    // latest-guess readout — the one number that answers "how close?",
    // drawn on top of everything else so it's never hidden behind a point
    if(latestGuessPr && latestGuessMeta && (latestGuessMeta.sim!=null || latestGuessMeta.rank!=null)){
      const g=latestGuessMeta;
      const label = g.rank===0 ? '★ #1 WIN'
        : (g.sim!=null ? Math.round(g.sim*100)+'% match':'') + (g.rank!=null ? ' · #'+(g.rank+1) : '');
      ctx.font='800 10px ui-monospace,monospace';
      const tw=ctx.measureText(label).width+10;
      let lx=latestGuessPr.x - tw/2, ly=latestGuessPr.y-26;
      lx=Math.max(4, Math.min(W-tw-4, lx));
      ly=Math.max(4, ly);
      ctx.fillStyle=dark?'rgba(8,10,15,.88)':'rgba(255,254,247,.92)';
      ctx.fillRect(lx, ly, tw, 16);
      ctx.strokeStyle=dark?'#F0E442':'#1A150F'; ctx.lineWidth=1; ctx.strokeRect(lx,ly,tw,16);
      ctx.fillStyle=dark?'#F0E442':'#1A150F';
      ctx.fillText(label, lx+5, ly+11);
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

  // ── point description, shared by the mouse tooltip and the keyboard/AT path ──
  // The tooltip used to be built inline inside onMove, which meant the only way
  // to learn what a point was required a pointer. Both readouts derive from here.
  function pointFacts(i){
    if(i==null||i<0||i>=N) return null;
    const hitId = baseI?baseI[i]:null;
    return {
      name: baseN[i]||'',
      season: baseS[i]||'',
      arch: ARCH[(baseC[i]||0)%8]||'',
      pos: baseP[i]>=0?(POS[(baseP[i]|0)%5]||''):'',
      guess: hitId!=null?guessIds.find(g=>g.idx===hitId)||null:null,
      isTarget: hitId!=null && targetId!=null && hitId===targetId
    };
  }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function guessBits(g){
    const bits=[];
    if(!g) return bits;
    if(g.sim!=null) bits.push(Math.round(g.sim*100)+'% match');
    if(g.rank!=null) bits.push(g.rank===0?'✅ #1 WIN':'#'+(g.rank+1));
    return bits;
  }
  function showTip(i){
    if(!hoverEl) return;
    const f=pointFacts(i); const pr=projected[i];
    if(!f||!pr){ hoverEl.style.display='none'; return; }
    hoverEl.style.display='block';
    hoverEl.style.left=pr.sx+'px';
    hoverEl.style.top=(pr.sy-42)+'px';
    const bits=guessBits(f.guess);
    const extra = bits.length
      ? `<br><span style="font-family:ui-monospace,monospace;font-size:9px;color:#D55E00;font-weight:800">YOUR GUESS · ${esc(bits.join(' · '))}</span>`
      : (f.isTarget ? `<br><span style="font-family:ui-monospace,monospace;font-size:9px;color:#1A150F;font-weight:800">★ TARGET</span>` : '');
    hoverEl.innerHTML=`<b>${esc(f.name)}</b> ${esc(f.season)}<br><span style="font-family:ui-monospace,monospace;font-size:9px;opacity:.8">${esc(f.pos?f.pos+' • ':'')}${esc(f.arch)}</span>${extra}`;
  }
  function pointSentence(i){
    const f=pointFacts(i);
    if(!f) return '';
    const parts=[[f.name,f.season].filter(Boolean).join(' ')];
    if(f.pos) parts.push(f.pos);
    if(f.arch) parts.push(f.arch+' archetype');
    if(f.isTarget) parts.push('this is the target');
    const bits=guessBits(f.guess).map(b=>b.replace('✅ ','').replace('#','number '));
    if(bits.length) parts.push('your guess, '+bits.join(', '));
    return parts.filter(Boolean).join(', ');
  }

  // ── screen-reader mirror ─────────────────────────────────────────────────
  // The canvas carries a static aria-label describing the *concept* of the map.
  // It never said what was actually on it, so a non-visual player got no game
  // feedback at all. This live region reports every state change in words.
  let liveEl=null;
  function ensureLive(){
    if(liveEl||typeof document==='undefined') return liveEl;
    try{
      liveEl=document.createElement('div');
      liveEl.className='vh-map-live';
      liveEl.setAttribute('aria-live','polite');
      liveEl.setAttribute('aria-atomic','true');
      liveEl.style.cssText='position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0';
      (canvas.parentElement||document.body).appendChild(liveEl);
    }catch{ liveEl=null; }
    return liveEl;
  }
  let lastSpoken='';
  function say(msg){
    if(!msg) return;
    const el=ensureLive();
    if(!el) return;
    // an identical textContent is not a mutation, so AT would stay silent on a
    // repeated action (pressing ArrowLeft twice). Clear first to force the change.
    if(msg===lastSpoken) el.textContent='';
    lastSpoken=msg;
    el.textContent=msg;
  }
  function stateSentence(){
    const out=[];
    if(targetId!=null && projById && targetId>=0 && targetId<=maxId && projById[targetId]>=0){
      const s=pointSentence(projById[targetId]);
      if(s) out.push('Target: '+s.replace(', this is the target',''));
    }
    const n=guessIds?guessIds.length:0;
    if(n){
      const last=guessIds[n-1];
      const li=(projById&&last&&last.idx!=null&&last.idx>=0&&last.idx<=maxId)?projById[last.idx]:-1;
      const nm=li>=0?(baseN[li]||'a player'):'a player';
      out.push(n+(n===1?' guess placed. Latest: ':' guesses placed. Latest: ')+nm+(guessBits(last).length?', '+guessBits(last).join(', ').replace('✅ ',''):''));
    } else {
      out.push('No guesses placed yet.');
    }
    out.push('Zoom '+zoom.toFixed(1)+'x.');
    return out.join(' ');
  }

  // ── keyboard control ─────────────────────────────────────────────────────
  // Orbit, zoom and point inspection were all pointer-only. These are the same
  // operations bound to keys, with each one announced through the live region.
  let kbIdx=-1;          // index into the point-of-interest ring, -1 = none
  function poiList(){
    const out=[];
    if(targetId!=null && projById && targetId>=0 && targetId<=maxId && projById[targetId]>=0) out.push(projById[targetId]);
    for(const g of (guessIds||[])){
      if(!g||g.idx==null||g.idx<0||g.idx>maxId||!projById) continue;
      const i=projById[g.idx];
      if(i>=0 && out.indexOf(i)<0) out.push(i);
    }
    return out;
  }
  // standalone so the map's own Target button, the T key and the public API all
  // recentre through one path instead of three
  function focusOnTarget(){
    // targetId>maxId would read past the Int32Array end: idx=undefined -> atan2(undefined)=NaN -> map collapses
    if(targetId==null||!projById||targetId<0||targetId>maxId) return false;
    const idx=projById[targetId]; if(idx==null||idx<0) return false;
    const ox=baseOx[idx], oy=baseOy[idx], oz=baseOz[idx];
    const ry=-Math.atan2(ox,oz); const r=Math.sqrt(ox*ox+oz*oz)||1; const rx=-Math.atan2(oy,r)*0.85;
    if(isFinite(ry)&&isFinite(rx)){ rotY=ry; rotX=rx; }
    projectFrame(); draw();
    return true;
  }
  function kick(){
    idleMs=0;
    if(auto){ embedPaused=false; lastT=0; scheduleLoop(); }
    else { projectFrame(); draw(); }
  }
  function setZoom(z){
    const nz=Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    if(nz===zoom) return false;
    zoom=nz; projectFrame(); draw();
    return true;
  }
  function onKey(ev){
    if(ev.altKey||ev.ctrlKey||ev.metaKey) return;
    const k=ev.key;
    const fast=ev.shiftKey?3:1;
    const STEP_Y=0.12*fast, STEP_X=0.09*fast;
    let handled=true;
    switch(k){
      case 'ArrowLeft':  rotY-=STEP_Y; kick(); say('Rotated left.'); break;
      case 'ArrowRight': rotY+=STEP_Y; kick(); say('Rotated right.'); break;
      case 'ArrowUp':    rotX=Math.max(-0.92, rotX-STEP_X); kick(); say('Tilted up.'); break;
      case 'ArrowDown':  rotX=Math.min(0.92, rotX+STEP_X); kick(); say('Tilted down.'); break;
      case '+': case '=': say(setZoom(zoom*1.35)?('Zoom '+zoom.toFixed(1)+'x.'):'Maximum zoom.'); break;
      case '-': case '_': say(setZoom(zoom/1.35)?('Zoom '+zoom.toFixed(1)+'x.'):'Minimum zoom.'); break;
      case '0':
        rotY=Math.PI*0.18; rotX=0.22; zoom=1; kbIdx=-1;
        if(hoverEl) hoverEl.style.display='none';
        projectFrame(); draw(); say('View reset. '+stateSentence());
        break;
      case 't': case 'T':
        if(targetId==null){ say('No target on the map yet.'); break; }
        focusOnTarget();
        kbIdx=poiList().length?0:-1;
        if(kbIdx===0) showTip(poiList()[0]);
        say('Centred on target. '+stateSentence());
        break;
      case 'g': case 'G': {
        const poi=poiList();
        if(!poi.length){ say('Nothing to inspect yet.'); break; }
        kbIdx=(kbIdx+1)%poi.length;
        const i=poi[kbIdx];
        showTip(i);
        projectFrame(); draw();
        say((kbIdx+1)+' of '+poi.length+'. '+pointSentence(i));
        break;
      }
      case ' ': case 'Spacebar':
        auto=!auto && !reduceMotion;
        embedPaused=!auto;
        if(auto){ lastT=0; scheduleLoop(); }
        { const bp=document.getElementById('btn-pause'); if(bp) bp.textContent=auto?'Pause':'Resume'; }
        say(auto?'Auto-rotate on.':'Auto-rotate paused.');
        break;
      case 'Escape':
        if(hoverEl) hoverEl.style.display='none';
        kbIdx=-1; say('Inspection cleared.');
        break;
      case '?': case 'h': case 'H':
        say('Map keys: arrow keys orbit, shift plus arrows orbits faster, plus and minus zoom, T centres the target, G steps through the target and your guesses, space toggles auto-rotate, zero resets. '+stateSentence());
        break;
      default: handled=false;
    }
    if(handled){ ev.preventDefault(); ev.stopPropagation(); }
  }
  function setupA11y(){
    try{
      if(!canvas.hasAttribute('tabindex')) canvas.tabIndex=0;
      canvas.setAttribute('role','application');
      canvas.setAttribute('aria-roledescription','interactive 3D embedding map');
      canvas.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight ArrowUp ArrowDown + - 0 T G Space');
      if(!canvas.getAttribute('aria-label')) canvas.setAttribute('aria-label','Player-season embedding map');
      canvas.addEventListener('keydown', onKey);
      canvas.addEventListener('focus',()=>{ say('Embedding map focused. Press H for map keys. '+stateSentence()); });
      if(typeof document!=='undefined' && !document.getElementById('vh-map-a11y-css')){
        const st=document.createElement('style');
        st.id='vh-map-a11y-css';
        // The canvas had no focus affordance at all — a keyboard user could not
        // tell they had reached it. Inset so it is not clipped by overflow:hidden.
        st.textContent='canvas[role="application"]:focus{outline:none}'
          +'canvas[role="application"]:focus-visible{outline:3px solid #0072B2;outline-offset:-4px}';
        document.head.appendChild(st);
      }
    }catch(e){ console.warn('map a11y setup fail',e); }
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
    // one description path for pointer and keyboard alike — see showTip()
    if(best!=null) showTip(best);
    else hoverEl.style.display='none';
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
  // focusOnTarget() existed in the API from the start but nothing visible called
  // it — a pointer user who orbited away from the bullseye had no way back.
  const centerBtn=document.getElementById('btn-center-target');
  if(centerBtn){
    centerBtn.addEventListener('click',()=>{
      if(!focusOnTarget()){ say('No target on the map yet.'); return; }
      idleMs=0;
      say('Centred on target. '+stateSentence());
    });
  }
  const resetBtn=document.getElementById('btn-reset');
  if(resetBtn){
    resetBtn.addEventListener('click',()=>{ rotY=Math.PI*0.18; rotX=0.22; zoom=1; kbIdx=-1; auto=!reduceMotion; embedPaused=false; idleMs=0; lastT=0; if(pauseBtn) pauseBtn.textContent=auto?'Pause':'Resume'; if(hoverEl) hoverEl.style.display='none'; resize(); projectFrame(); draw(); scheduleLoop(); });
  }

  // load and start
  setupA11y();
  resize();
  // Coalesce observer callbacks through one frame. Submitting a guess mutates
  // the DOM around the map (guess rows, result panel), which can fire this
  // repeatedly in a single layout pass; without the rAF gate each notification
  // ran a full reproject on the main thread.
  let ro=null, roPending=false;
  try{
    const onResizeObserved=()=>{
      if(roPending) return;
      roPending=true;
      requestAnimationFrame(()=>{ roPending=false; resize(); });
    };
    ro=new ResizeObserver(onResizeObserved);
    ro.observe(canvas);
    if(canvas.parentElement) ro.observe(canvas.parentElement);
  }catch{}
  const ok=await loadLite();
  if(ok){ projectFrame(); draw(); scheduleLoop(); loadNamesLazy().then(()=>{ projectFrame(); draw(); }); }
  else { ctx.fillStyle='#FFFEF7'; ctx.fillText('Map failed to load',14,22); }

  // named so the keyboard handler can call focusOnTarget() without duplicating it
  const api = {
    setTarget(id){
      const prev=targetId;
      targetId=id==null?null:id|0;
      kbIdx=-1;
      draw();
      if(targetId!=null && targetId!==prev) say('New target on the map. '+stateSentence());
    },
    setGuesses(ids){
      const before=guessIds?guessIds.length:0;
      guessIds=normalizeGuesses(ids);
      draw();
      if(guessIds.length>before) say(stateSentence());
    },
    // exposed so a page can push its own wording into the map's live region
    announce: say,
    describe: stateSentence,
    setZoom, getZoom(){ return zoom; },
    focusOnTarget,
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
    dispose(){ try{ro&&ro.disconnect();}catch{} try{liveEl&&liveEl.remove();}catch{} }
  };
  return api;
}
