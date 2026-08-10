/* shared-map.js v4-filtered — 3+ seasons OR rookie last 3
   - Fast lite 4322 first paint
   - Full progressive filtered: only players with 3+ player-seasons, plus any player whose max season is in last 3 seasons window (rookies)
   - Cache API + session reuse, pending focus queue, injection always works even if filtered out
*/
export async function mountSharedMap(canvas, opts={}){
  if(!canvas) return null;
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#FFFEF7'];
  const ARCH=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const POS=['PG','SG','SF','PF','C'];
  const highlightInit = opts.highlightId ?? null;
  const dark = !!opts.dark;
  const isMobile = (typeof window!=='undefined') && (window.innerWidth<700 || /Android|iPhone|iPad/i.test(navigator.userAgent||''));
  const maxRender = isMobile ? 4000 : 8000;
  const frameBudget = isMobile ? 42 : 33;
  const reduceMotion = (typeof window!=='undefined') && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let N=0, baseOx=null, baseOy=null, baseOz=null, baseC=null, baseI=null, baseN=[], baseS=[], baseP=[];
  let projected=[], projById=null, maxId=0;
  let W=0,H=0, rotY=Math.PI*0.18, rotX=0.22, auto=!reduceMotion, lastT=0, isDragging=false, lastX=0,lastY=0, idleMs=0;
  let embedPaused=false, lastRender=0;
  let fullLoaded=false, fullLoading=false, pendingFocus=null;
  let totalRaw=12966, filteredCount=0;

  function seasonEndYear(s){
    if(!s) return null;
    // captures "97-98" "03-04" "1997-98" "2023-24" "23-24"
    const m = String(s).match(/(\d{2,4})\s*-\s*(\d{2,4})/);
    if(!m) {
      // maybe single year like "2024"
      const y = parseInt(String(s).slice(-4),10);
      return y? (y<100 ? (y>=50?1900+y:2000+y) : y) : null;
    }
    let y2 = parseInt(m[2],10);
    if(y2<100) y2 += (y2>=50 ? 1900 : 2000);
    return y2;
  }

  function buildSeasonFilter(arr){
    // 1) compute max year in dataset
    let maxYear=0;
    for(const p of arr){ const y=seasonEndYear(p.s); if(y && y>maxYear) maxYear=y; }
    if(!maxYear) maxYear = (new Date()).getFullYear(); // fallback
    const recentMin = maxYear - 2; // last 3 seasons inclusive
    // unique person key = pid if present (name+dob proxy) else name
    // fixes Gary Payton (pid 56, 1996-07 11 seasons) vs Gary Payton II (pid 1627780, 2017-26 7 seasons)
    // previously counted together as 18 seasons → kept incorrectly; now separate.
    const byPerson=new Map();
    for(const p of arr){
      const pid = p.pid!=null ? String(p.pid) : (p.player_id!=null ? String(p.player_id) : '');
      const rawName=(p.n||'').trim();
      if(!rawName && !pid) continue;
      const key = pid ? ('pid:'+pid) : ('name:'+rawName.toLowerCase());
      let rec=byPerson.get(key);
      if(!rec){ rec={count:0, maxY:0, minY:9999, years:[], displayName: rawName, pid}; byPerson.set(key,rec); }
      rec.count++;
      const y=seasonEndYear(p.s)||0;
      if(y){ if(y>rec.maxY) rec.maxY=y; if(y<rec.minY) rec.minY=y; rec.years.push(y); }
    }
    const keepKeys=new Set();
    for(const [k, rec] of byPerson){
      if(rec.count>=3) keepKeys.add(k);
      else if(rec.maxY && rec.maxY>=recentMin) keepKeys.add(k); // rookie / new last 3 seasons
    }
    // stats for log
    let kept=0; for(const p of arr){
      const pid = p.pid!=null ? String(p.pid) : (p.player_id!=null ? String(p.player_id) : '');
      const key = pid ? ('pid:'+pid) : ('name:'+(p.n||'').trim().toLowerCase());
      if(keepKeys.has(key)) kept++;
    }
    console.log('season filter v5 pid-aware: maxYear',maxYear,'recentMin',recentMin,'keptPersons',keepKeys.size,'keptPts',kept,'/',arr.length);
    return {keepKeys, maxYear, recentMin, kept, raw:arr.length};
  }

  function normalizeGuesses(list){
    if(!Array.isArray(list)) return [];
    const out=[];
    for(const g of list){
      if(g==null) continue;
      if(typeof g==='object'){
        const idx=g.idx!=null?g.idx|0:(g.id!=null?g.id|0:(g.i!=null?g.i|0:null));
        if(idx==null) continue;
        out.push({ idx, sim:(typeof g.sim==='number'?g.sim:null), rank:(typeof g.rank==='number'?g.rank:null), x:(typeof g.x==='number'?g.x:null), y:(typeof g.y==='number'?g.y:null), z:(typeof g.z==='number'?g.z:null), c:(typeof g.c==='number'?g.c:null), n:g.name||g.n||null, s:g.season||g.s||null, p:(typeof g.p==='number'?g.p:null) });
      } else out.push({ idx:g|0, sim:null, rank:null, x:null, y:null, z:null, c:null, n:null, s:null, p:null });
    }
    return out;
  }

  function _injectPoint(p){
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
      projectFrame(); return true;
    }catch(e){ console.warn('_injectPoint fail',e); return false; }
  }

  let targetId=highlightInit, guessIds=normalizeGuesses(opts.guessIds);
  let hoverEl=null; try{hoverEl=document.getElementById('hover-tip');}catch{}
  let ctx=null; try{ ctx=canvas.getContext('2d',{alpha:false}); }catch{ ctx=canvas.getContext('2d'); }

  function getSize(){
    const rect=canvas.getBoundingClientRect();
    let w=rect.width, h=rect.height;
    if(w<10||h<10){ const pr=canvas.parentElement?.getBoundingClientRect(); w=Math.max(w, pr?.width||0, 320); h=Math.max(h, pr?.height||0, 380); if(w<10) w=window.innerWidth||390; if(h<10) h=Math.round((window.innerHeight||800)*0.5); }
    return {w:Math.max(10,Math.round(w)), h:Math.max(10,Math.round(h))};
  }
  function resize(){
    if(!canvas) return;
    const sz=getSize();
    if(W===sz.w && H===sz.h && canvas.width===sz.w && canvas.height===sz.h) return;
    W=sz.w; H=sz.h; canvas.width=W; canvas.height=H;
    if(canvas.style.width!==W+'px') canvas.style.width=W+'px';
    if(canvas.style.height!==H+'px') canvas.style.height=H+'px';
    if(ctx) ctx.setTransform(1,0,0,1,0,0);
    projectFrame(); draw();
  }
  function ensureArrays(len){
    if(!baseOx || baseOx.length!==len){
      baseOx=new Float32Array(len); baseOy=new Float32Array(len); baseOz=new Float32Array(len);
      baseC=new Uint8Array(len); baseI=new Int32Array(len);
      projected=new Array(len); for(let i=0;i<len;i++) projected[i]={sx:0,sy:0,depth:0,alpha:0.6};
    }
  }

  async function fetchWithCache(url){
    if(window.__mapFullCache && window.__mapFullCache[url]) return window.__mapFullCache[url];
    try{
      if('caches' in window){
        const cache=await caches.open('vector-maps-v4');
        const hit=await cache.match(url);
        if(hit){ const j=await hit.json(); window.__mapFullCache=window.__mapFullCache||{}; window.__mapFullCache[url]=j; return j; }
        const res=await fetch(url,{cache:'default'});
        if(res.ok){ cache.put(url, res.clone()); const j=await res.json(); window.__mapFullCache=window.__mapFullCache||{}; window.__mapFullCache[url]=j; return j; }
      }
    }catch{}
    const r=await fetch(url,{cache:'force-cache'});
    if(!r.ok) throw new Error('fetch failed '+url);
    const j=await r.json();
    window.__mapFullCache=window.__mapFullCache||{}; window.__mapFullCache[url]=j;
    return j;
  }

  async function loadLite(){
    const urls=['assets/vectors_map_lite.json','assets/vectors_lite.json','assets/vectors_search_lite.json'];
    for(const u of urls){
      try{
        const j=await fetchWithCache(u);
        const arr=j.players||j;
        if(!Array.isArray(arr)||!arr.length) continue;
        N=arr.length; ensureArrays(N);
        let localMax=0;
        for(let i=0;i<N;i++){ const p=arr[i]||{}; baseOx[i]=((p.x??0.5)-0.5)*2; baseOy[i]=((p.y??0.5)-0.5)*2; baseOz[i]=((p.z??0.5)-0.5)*2; baseC[i]=(p.c|0)&7; baseI[i]=p.i!=null? (p.i|0) : i; baseN[i]=p.n||''; baseS[i]=p.s||''; baseP[i]=p.p??-1; projected[i].c=baseC[i]; if(baseI[i]>localMax) localMax=baseI[i]; }
        maxId=localMax; projById=new Int32Array(maxId+1); projById.fill(-1); for(let i=0;i<N;i++){ const id=baseI[i]; if(id>=0&&id<=maxId) projById[id]=i; }
        console.log('shared-map v4 lite loaded',N,u); return true;
      }catch(e){ console.warn('lite load fail',u,e); }
    }
    return false;
  }

  async function loadFullProgressive(){
    if(fullLoaded||fullLoading) return;
    fullLoading=true;
    try{
      const url='assets/vectors_search_lite_pos.json?v=58';
      let j=null;
      try{ j=await fetchWithCache(url); }catch{ j=await fetchWithCache('assets/vectors_search_lite.json'); }
      const arr=j.players||j;
      if(!Array.isArray(arr)||arr.length<1000){ fullLoading=false; return; }
      totalRaw=arr.length;
      // build filter (pid-aware keeps Gary Payton 11 and Gary Payton II 7 separate)
      const {keepKeys, maxYear, recentMin, kept, raw} = buildSeasonFilter(arr);
      filteredCount=kept;
      // actually filter array
      const filtered = arr.filter(p=>{
        const pid = p.pid!=null ? String(p.pid) : (p.player_id!=null ? String(p.player_id) : '');
        const key = pid ? ('pid:'+pid) : ('name:'+(p.n||'').trim().toLowerCase());
        return keepKeys.has(key);
      });
      // If filtering would be too aggressive (keeps <2000), fall back to full
      const useArr = (filtered.length>=1500)? filtered : arr;
      if(useArr!==filtered) console.warn('filter too aggressive, using full',arr.length);
      const fullN=useArr.length;
      const newOx=new Float32Array(fullN), newOy=new Float32Array(fullN), newOz=new Float32Array(fullN);
      const newC=new Uint8Array(fullN), newI=new Int32Array(fullN);
      const newNArr=new Array(fullN), newSArr=new Array(fullN), newPArr=new Array(fullN);
      const newProj=new Array(fullN);
      let newMax=0;
      for(let i=0;i<fullN;i++){
        const p=useArr[i]||{}; newOx[i]=((p.x??0.5)-0.5)*2; newOy[i]=((p.y??0.5)-0.5)*2; newOz[i]=((p.z??0.5)-0.5)*2;
        newC[i]=(p.c|0)&7; newI[i]=p.i!=null? (p.i|0): i;
        newNArr[i]=p.n||''; newSArr[i]=p.s||''; newPArr[i]=p.p??-1;
        newProj[i]={sx:0,sy:0,depth:0,alpha:0.6,c:newC[i]};
        if(newI[i]>newMax) newMax=newI[i];
      }
      // preserve any injected extras not in filtered but needed (e.g., target)
      if(N>0 && projById){
        const keepIds=new Set(useArr.map(a=>a.i));
        const extra=[];
        for(let i=0;i<N;i++){ const id=baseI[i]; if(!keepIds.has(id)){ // maybe it was lite but not passing filter — keep if it's a pending target?
          if(targetId!=null && id===targetId) extra.push({i:id,x:baseOx[i]/2+0.5,y:baseOy[i]/2+0.5,z:baseOz[i]/2+0.5,c:baseC[i],n:baseN[i],s:baseS[i],p:baseP[i]});
        } }
        if(extra.length){
          const comboN=fullN+extra.length;
          const cOx=new Float32Array(comboN), cOy=new Float32Array(comboN), cOz=new Float32Array(comboN), cC=new Uint8Array(comboN), cI=new Int32Array(comboN);
          cOx.set(newOx); cOy.set(newOy); cOz.set(newOz); cC.set(newC); cI.set(newI);
          const cN=[...newNArr], cS=[...newSArr], cP=[...newPArr], cProj=[...newProj];
          for(let k=0;k<extra.length;k++){ const p=extra[k]; const idx=fullN+k; cOx[idx]=((p.x??0.5)-0.5)*2; cOy[idx]=((p.y??0.5)-0.5)*2; cOz[idx]=((p.z??0.5)-0.5)*2; cC[idx]=p.c&7; cI[idx]=p.i; cN[idx]=p.n; cS[idx]=p.s; cP[idx]=p.p; cProj[idx]={sx:0,sy:0,depth:0,alpha:0.6,c:cC[idx]}; if(p.i>newMax) newMax=p.i; }
          baseOx=cOx; baseOy=cOy; baseOz=cOz; baseC=cC; baseI=cI; baseN=cN; baseS=cS; baseP=cP; projected=cProj; N=comboN;
        } else { baseOx=newOx; baseOy=newOy; baseOz=newOz; baseC=newC; baseI=newI; baseN=newNArr; baseS=newSArr; baseP=newPArr; projected=newProj; N=fullN; }
      } else { baseOx=newOx; baseOy=newOy; baseOz=newOz; baseC=newC; baseI=newI; baseN=newNArr; baseS=newSArr; baseP=newPArr; projected=newProj; N=fullN; }
      maxId=newMax; projById=new Int32Array(maxId+1); projById.fill(-1); for(let i=0;i<N;i++){ const id=baseI[i]; if(id>=0&&id<=maxId) projById[id]=i; }
      fullLoaded=true; console.log('shared-map v4 filtered merged',N,'from raw',raw,'maxYear',maxYear,'recentMin',recentMin);
      projectFrame(); draw();
      if(pendingFocus){ const {id,label}=pendingFocus; pendingFocus=null; if(projById[id]>=0){ targetId=id; projectFrame(); draw(); focusOnTargetInternal(); if(label&&document.getElementById('popular-current')) document.getElementById('popular-current').textContent='Showing '+label+' — ★ on map · '+N+' filtered stars'; } else {
        // target was filtered out? inject anyway
        try{
          const row=useArr.find(a=>a.i===id) || arr.find(a=>a.i===id);
          if(row) _injectPoint(row); else _injectPoint({i:id,x:0.5,y:0.5,z:0.5,c:7});
          targetId=id; projectFrame(); draw(); focusOnTargetInternal();
        }catch{}
      } }
    }catch(e){ console.warn('full progressive fail',e); }
    fullLoading=false;
  }

  function mergeNames(arr){
    const map=new Map(); for(const p of arr){ if(p.i!=null) map.set(p.i,{n:p.n,s:p.s,p:p.p}); }
    for(let i=0;i<N;i++){ const id=baseI[i]; const hit=map.get(id); if(hit){ baseN[i]=hit.n; baseS[i]=hit.s; baseP[i]=hit.p??baseP[i]; } }
    return map.size;
  }
  function gameSearchLite(timeoutMs){
    if(!(window.VHPastModern&&VHPastModern.state)) return Promise.resolve(null);
    return new Promise(res=>{ const t0=Date.now(); (function poll(){ try{ const sl=VHPastModern.state().searchLite; const arr=sl&&(sl.players||sl); if(Array.isArray(arr)&&arr.length) return res(arr); }catch{} if(Date.now()-t0>timeoutMs) return res(null); setTimeout(poll,250); })(); });
  }
  async function loadNamesLazy(){
    if(baseN[0] && baseN[0].length) return;
    try{ const game=await gameSearchLite(6000); if(game){ console.log('shared-map v4 names merged from game state', mergeNames(game)); return; } }catch{}
    if(fullLoaded) return;
  }

  function projectFrame(){
    if(!baseOx||!N) return;
    if(!isFinite(rotY)||!isFinite(rotX)){ rotY=Math.PI*0.18; rotX=0.22; }
    const cy=Math.cos(rotY), sy=Math.sin(rotY), cx=Math.cos(rotX), sx=Math.sin(rotX);
    const persp=2.8, W2=W*0.5, H2=H*0.5, W40=W*0.40, H40=H*0.40;
    for(let i=0;i<N;i++){ const ox=baseOx[i], oy=baseOy[i], oz=baseOz[i]; const xr=ox*cy+oz*sy; const z1=-ox*sy+oz*cy; const yr=oy*cx - z1*sx; const zr=oy*sx + z1*cx; const sc=persp/(persp - zr*0.55); const pr=projected[i]; pr.sx=W2 + xr*sc*W40; pr.sy=H2 - yr*sc*H40; pr.depth=(zr+1)*0.5; pr.alpha=0.22+pr.depth*0.78; }
  }
  function draw(){
    if(!ctx||!W||!H) return;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle=dark?'#080A0F':'#FFFEF7'; ctx.fillRect(0,0,W,H);
    if(!N){ ctx.fillStyle=dark?'#FFFEF7':'#1A150F'; ctx.font='800 12px ui-monospace,monospace'; ctx.fillText(fullLoading? 'Loading filtered set… '+N : 'Loading map…',14,22); return; }
    const step=Math.max(1, Math.ceil(N / maxRender));
    const dotSize = W<600?2:2;
    for(let c=0;c<8;c++){
      ctx.fillStyle=OKABE[c];
      for(let i=0;i<N;i+=step){
        if(baseC[i]!==c) continue; const pr=projected[i]; if(!pr) continue; if(pr.sx<-20||pr.sx>W+20||pr.sy<-20||pr.sy>H+20) continue;
        ctx.fillRect(pr.sx|0, pr.sy|0, dotSize, dotSize);
      }
    }
    if(targetId!=null && projById && targetId<=maxId){
      const tIdx=projById[targetId];
      if(tIdx>=0){
        const pr=projected[tIdx];
        if(pr && pr.sx>=-20 && pr.sx<=W+20 && pr.sy>=-20 && pr.sy<=H+20 && (tIdx%step!==0)){
          ctx.fillStyle=OKABE[baseC[tIdx]%8]||'#FFFEF7'; ctx.fillRect(pr.sx|0, pr.sy|0, dotSize, dotSize);
        }
      }
    }
    let targetPr=null;
    if(targetId!=null && projById && targetId<=maxId){ const tIdx=projById[targetId]; if(tIdx>=0){ const p=projected[tIdx]; if(p && p.sx>=-20 && p.sx<=W+20 && p.sy>=-20 && p.sy<=H+20) targetPr=p; } }
    let latestGuessPr=null, latestGuessMeta=null;
    if(guessIds && guessIds.length){
      for(let gi=0;gi<guessIds.length;gi++){
        const gm=guessIds[gi]; if(!gm||gm.idx==null||gm.idx>maxId) continue; const idx=projById?projById[gm.idx]:-1; if(idx<0) continue; const pr=projected[idx]; if(!pr) continue; if(pr.sx<-30||pr.sx>W+30||pr.sy<-30||pr.sy>H+30) continue;
        const gx=(pr.sx|0), gy=(pr.sy|0); const isLatest=gi===guessIds.length-1;
        if(targetPr){ ctx.save(); ctx.globalAlpha=isLatest?0.85:0.28; ctx.strokeStyle=dark?'#F0E442':'#1A150F'; ctx.lineWidth=isLatest?1.6:1; if(!isLatest) ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(gx,gy); ctx.lineTo(targetPr.sx|0, targetPr.sy|0); ctx.stroke(); ctx.restore(); }
        ctx.strokeStyle='#FFFFFF'; ctx.lineWidth=4; ctx.strokeRect(gx-5, gy-5, 10,10); ctx.strokeStyle='#D55E00'; ctx.lineWidth=2; ctx.strokeRect(gx-5, gy-5, 10,10);
        const num=(gi+1).toString(); ctx.font='800 9px ui-monospace,monospace'; const tw=ctx.measureText(num).width+6; let bx=gx+7, by=gy-10; if(bx+tw>W-2) bx=gx-tw-7; if(by<2) by=gy+7; ctx.fillStyle='#1A150F'; ctx.fillRect(bx, by, tw, 11); ctx.fillStyle='#FFFEF7'; ctx.fillText(num, bx+3, by+8); if(isLatest){ latestGuessPr={x:gx,y:gy}; latestGuessMeta=gm; }
      }
    }
    if(targetId!=null && projById && targetId<=maxId){
      const idx=projById[targetId]; if(idx>=0){ const pr=projected[idx]; if(pr && pr.sx>=-20 && pr.sx<=W+20 && pr.sy>=-20 && pr.sy<=H+20){ const x=pr.sx|0, y=pr.sy|0; ctx.lineWidth=3; ctx.strokeStyle='#FFFFFF'; ctx.beginPath(); ctx.arc(x,y,11,0,Math.PI*2); ctx.stroke(); ctx.lineWidth=2.4; ctx.strokeStyle='#1A150F'; ctx.beginPath(); ctx.arc(x,y,7.5,0,Math.PI*2); ctx.stroke(); ctx.fillStyle='#F0E442'; ctx.beginPath(); ctx.arc(x,y,3.4,0,Math.PI*2); ctx.fill(); ctx.lineWidth=1.2; ctx.strokeStyle='#1A150F'; ctx.beginPath(); ctx.arc(x,y,3.4,0,Math.PI*2); ctx.stroke(); ctx.lineWidth=2; ctx.strokeStyle='#1A150F'; ctx.beginPath(); ctx.moveTo(x-17,y); ctx.lineTo(x-11,y); ctx.moveTo(x+11,y); ctx.lineTo(x+17,y); ctx.moveTo(x,y-17); ctx.lineTo(x,y-11); ctx.moveTo(x,y+11); ctx.lineTo(x,y+17); ctx.stroke(); } }
    }
    if(latestGuessPr && latestGuessMeta && (latestGuessMeta.sim!=null || latestGuessMeta.rank!=null)){
      const g=latestGuessMeta; const label = g.rank===0 ? '★ #1 WIN' : (g.sim!=null ? Math.round(g.sim*100)+'% match':'') + (g.rank!=null ? ' · #'+(g.rank+1) : '');
      ctx.font='800 10px ui-monospace,monospace'; const tw=ctx.measureText(label).width+10; let lx=latestGuessPr.x - tw/2, ly=latestGuessPr.y-26; lx=Math.max(4, Math.min(W-tw-4, lx)); ly=Math.max(4, ly); ctx.fillStyle=dark?'rgba(8,10,15,.88)':'rgba(255,254,247,.92)'; ctx.fillRect(lx, ly, tw, 16); ctx.strokeStyle=dark?'#F0E442':'#1A150F'; ctx.lineWidth=1; ctx.strokeRect(lx,ly,tw,16); ctx.fillStyle=dark?'#F0E442':'#1A150F'; ctx.fillText(label, lx+5, ly+11);
    }
    if(!fullLoaded && !fullLoading){ ctx.fillStyle=dark?'rgba(255,254,247,.65)':'rgba(26,21,15,.6)'; ctx.font='700 10px ui-monospace,monospace'; ctx.fillText((N||0)+'/'+(totalRaw||12966)+' · 3yr+ & rookies filter', 12, H-10); }
  }

  let rafPending=false;
  function scheduleLoop(){ if(!rafPending){ rafPending=true; requestAnimationFrame(loop); } }
  function loop(t){
    rafPending=false; if(embedPaused) return;
    const now=t||performance.now(); if(now-lastRender < frameBudget){ scheduleLoop(); return; } lastRender=now;
    if(!lastT) lastT=now; const dt=Math.min(50, now-lastT); lastT=now;
    if(!isDragging && auto){ rotY+=dt*0.00022; idleMs+=dt; if(idleMs>8000){ auto=false; embedPaused=true; console.log('map idle pause'); return; } }
    else if(!isDragging && !auto){ projectFrame(); try{ draw(); }catch(e){ console.warn('draw fail',e); } return; } else idleMs=0;
    projectFrame(); try{ draw(); }catch(e){ console.warn('draw fail',e); } scheduleLoop();
  }

  function onDown(ev){ const pt=ev.touches? ev.touches[0]:ev; isDragging=true; auto=false; idleMs=0; lastX=pt.clientX; lastY=pt.clientY; canvas.style.cursor='grabbing'; embedPaused=false; lastT=0; scheduleLoop(); const bp=document.getElementById('btn-pause'); if(bp) bp.textContent='Pause'; }
  function onMove(ev){
    const pt=ev.touches? ev.touches[0]:ev; const x=pt.clientX, y=pt.clientY;
    if(isDragging){ const dx=x-lastX, dy=y-lastY; rotY+=dx*0.0065; rotX+=dy*0.0045; rotX=Math.max(-0.92, Math.min(0.92, rotX)); lastX=x; lastY=y; return; }
    if(!hoverEl) return; const rect=canvas.getBoundingClientRect(); const mx=x-rect.left, my=y-rect.top; let best=null,bd=isMobile?28:22; const step=Math.max(1, Math.ceil(N/maxRender)); for(let i=0;i<N;i+=step){ const pr=projected[i]; if(!pr) continue; const d=Math.hypot(pr.sx-mx, pr.sy-my); if(d<bd){ bd=d; best=i; } }
    if(best!=null){ hoverEl.style.display='block'; hoverEl.style.left=projected[best].sx+'px'; hoverEl.style.top=(projected[best].sy-42)+'px'; const n=baseN[best]||''; const s=baseS[best]||''; const c=baseC[best]; const arch=ARCH[c%8]||''; const pos=baseP[best]>=0?(POS[(baseP[best]|0)%5]||'') :''; const hitId=baseI?baseI[best]:null; const guessHit=hitId!=null?guessIds.find(g=>g.idx===hitId):null; let extra=''; if(guessHit){ const bits=[]; if(guessHit.sim!=null) bits.push(Math.round(guessHit.sim*100)+'% match'); if(guessHit.rank!=null) bits.push(guessHit.rank===0?'✅ #1 WIN':'#'+(guessHit.rank+1)); if(bits.length) extra=`<br><span style="font-family:ui-monospace,monospace;font-size:9px;color:#D55E00;font-weight:800">YOUR GUESS · ${bits.join(' · ')}</span>`; } hoverEl.innerHTML=`<b>${(n||'').replace(/</g,'&lt;')}</b> ${(s||'').replace(/</g,'&lt;')}<br><span style="font-family:ui-monospace,monospace;font-size:9px;opacity:.8">${pos?pos+' • ':''}${arch}</span>${extra}`; } else hoverEl.style.display='none';
  }
  function onUp(){ if(isDragging){ isDragging=false; canvas.style.cursor='grab'; lastT=0; } }

  try{ window.addEventListener('vh:pause-maps',()=>{ embedPaused=true; auto=false; }); window.addEventListener('vh:resume-maps',()=>{ embedPaused=false; auto=!reduceMotion; lastT=0; idleMs=0; scheduleLoop(); }); document.addEventListener('focusin',(e)=>{ if(e.target && (e.target.id==='guess-input' || e.target.matches&&e.target.matches('input.input'))){ embedPaused=true; auto=false; } }); document.addEventListener('visibilitychange',()=>{ if(document.hidden){ embedPaused=true; } else { embedPaused=false; lastT=0; scheduleLoop(); } }); }catch{}

  canvas.addEventListener('mousedown', onDown); canvas.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, {passive:true}); canvas.addEventListener('touchmove', onMove, {passive:true}); canvas.addEventListener('touchend', onUp);
  canvas.addEventListener('mouseleave',()=>{ if(hoverEl) hoverEl.style.display='none'; });
  const pauseBtn=document.getElementById('btn-pause'); if(pauseBtn) pauseBtn.addEventListener('click',()=>{ auto=!auto; embedPaused=!auto; pauseBtn.textContent=auto?'Pause':'Resume'; lastT=0; idleMs=0; if(auto) scheduleLoop(); });
  const resetBtn=document.getElementById('btn-reset'); if(resetBtn) resetBtn.addEventListener('click',()=>{ rotY=Math.PI*0.18; rotX=0.22; auto=!reduceMotion; embedPaused=false; idleMs=0; lastT=0; if(pauseBtn) pauseBtn.textContent=auto?'Pause':'Resume'; resize(); scheduleLoop(); });

  resize();
  let ro=null, roPending=false;
  try{ const onResizeObserved=()=>{ if(roPending) return; roPending=true; requestAnimationFrame(()=>{ roPending=false; resize(); }); }; ro=new ResizeObserver(onResizeObserved); ro.observe(canvas); if(canvas.parentElement) ro.observe(canvas.parentElement); }catch{}
  const ok=await loadLite();
  if(ok){ projectFrame(); draw(); scheduleLoop(); loadNamesLazy().then(()=>{ projectFrame(); draw(); }); setTimeout(()=>{ loadFullProgressive(); }, 120); }
  else { ctx.fillStyle='#FFFEF7'; ctx.fillText('Map failed to load',14,22); }

  function ensureFullThenFocus(id,label){
    if(!fullLoaded && !fullLoading){ loadFullProgressive(); }
    if(fullLoaded && projById && id>=0 && id<=maxId && projById[id]>=0){ targetId=id|0; if(label&&document.getElementById('popular-current')) document.getElementById('popular-current').textContent='Showing '+label+' — ★ on map · '+N+' stars'; projectFrame(); draw(); focusOnTargetInternal(); return true; }
    if(!fullLoaded){
      pendingFocus={id:id|0,label:label||''};
      if(document.getElementById('popular-current')) document.getElementById('popular-current').textContent='Loading filtered set for '+(label||id)+' … '+N+'/'+(totalRaw||12966);
      return false;
    }
    if(!projById||projById[id]<0){ _injectPoint({i:id,x:0.5,y:0.5,z:0.5,c:7}); }
    targetId=id|0; projectFrame(); draw(); focusOnTargetInternal(); return true;
  }
  function focusOnTargetInternal(){
    if(targetId==null||!projById||targetId<0||targetId>maxId) return;
    const idx=projById[targetId]; if(idx==null||idx<0) return;
    const ox=baseOx[idx], oy=baseOy[idx], oz=baseOz[idx]; const ry=-Math.atan2(ox,oz); const r=Math.sqrt(ox*ox+oz*oz)||1; const rx=-Math.atan2(oy,r)*0.85;
    if(isFinite(ry)&&isFinite(rx)){ rotY=ry; rotX=rx; } projectFrame(); draw();
  }

  return {
    setTarget(id){ if(!ensureFullThenFocus(id,null)){ targetId=id==null?null:id|0; draw(); return; } targetId=id==null?null:id|0; draw(); },
    setGuesses(ids){ guessIds=normalizeGuesses(ids); try{ for(const gm of guessIds){ if(!gm||gm.idx==null) continue; if(projById && gm.idx>=0 && gm.idx<=maxId && projById[gm.idx]>=0) continue; if(gm.x!=null && gm.y!=null && gm.z!=null){ _injectPoint({i:gm.idx, x:gm.x, y:gm.y, z:gm.z, c:gm.c??0, n:gm.n||'', s:gm.s||'', p:gm.p??-1}); } else if(window.VHPastModern && VHPastModern.state){ try{ const sl=VHPastModern.state().searchLite; const arr=sl&&(sl.players||sl); const row=Array.isArray(arr)&&arr.find(p=>p&&p.i===gm.idx); if(row) _injectPoint(row); }catch{} } } }catch(e){ console.warn('setGuesses inject fail',e); } draw(); },
    focusOnTarget(){ if(!ensureFullThenFocus(targetId,'')) { focusOnTargetInternal(); } else focusOnTargetInternal(); },
    hasPoint(id){ if(!projById) return false; return id>=0&&id<=maxId&&projById[id]>=0; },
    addPoint(p){ const ok=_injectPoint(p); if(ok){ draw(); } return ok; },
    ensureFull: loadFullProgressive,
    getProgress(){ return {loaded:N, total:totalRaw, filtered:filteredCount, full:fullLoaded, maxId}; },
    resize, getCount(){return N;}, dispose(){ try{ro&&ro.disconnect();}catch{} }
  };
}
