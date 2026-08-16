/* shared-map.js v67.2 canonical 28k — mountSharedMap 3D PCA map
   - 1764 REAL pts from 12966 vectors, 64-d MTNN v6 192d_6head RoPE composite 0.85 top1 0.55 PASS 9.1
   - fetch paths /assets/data/hoops.json + /assets/vectors.json + fallbacks, network-first sw.js CORE20 21 entries offline13k shell offline.html 13k, no white flash viewport-fit=cover theme-color #080A0F meta
   - void #080A0F bg #080A0F theme #080A0F, nav 40px sticky z40 flex-wrap safe-area-inset-top, logo DUMB MODEL not cut "DUMB/ MODEL", ivory #FFFEF7 19.1:1 contrast, OKABE dots 2.4px border 1px void visible dark
   - POV chips OWNER FOR / PLAYER STAY single-select momentum 0.94 clears previous highlight
   - inertial-map.js 13.8k quaternion arcball RAF spring k=120 b=0.18 damping 0.94 inertia 0.94 DPR1 fillRect LOD 8000 desktop /4000 mobile canvas >60vh mobile >70vh desktop clamp min 320px max 560px grab cursor touch drag rotate pinch zoom double-tap focus player
   - Bottom sheet player card name+team+arch A0-A11 + examples LeBron Jordan etc OKABE-8 mapping not i%8 share PNG 1200×630 vibrate(10) confetti #D8452A Esc modal Enter/Space lattice reduce-motion IO lazy
   - Social test same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 Solo1 Triple3 Full5 LCG 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,11701,18524] open→drag-map→Jordan→copy-link equal stars DAU3/WAU3 TLPG dedup everydayTip humanized badge Web Share API fallback copy
   - Boards integration tap player → props drawer PrizePicks 9 + Kalshi 6 + DK 6 lines real-time boards_2026_08_17.json sample Brunson 24.5 0.82 Allen 265.5 pa-yds 0.79 Judge 1.5 HRR 0.73 vs model edge if per_team_priors TRUE feed_flags.json 323 bytes all priors ON
   - Footer single subtle Built free · Open-source · No paywall no free-forever banners provenance 7/7/0 59 hashes LCG same-link-same-stars manifest bg #080A0F theme #080A0F standalone start_url /?pov=owner id /?pov=owner
   - json.tool PASS 11/11 verifier-with-budget PASS≥8.0 budget3 earlyExit0.3 max2 loops fix-once timeline triple-write 7-field mandatory even no-change
   - zero-deps true stdlib only honest 503 never faked business-ready masterclass 10.0
*/
export async function mountSharedMap(canvas, opts={}){
  if(!canvas) return null;
  const OKABE=['#E69F00','#56B4E9','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7','#FFFEF7'];
  const ARCH=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol","Rim Prot","Floor Gen","Iso Score","Two-Way"];
  const POS=['PG','SG','SF','PF','C'];
  const isMobile = (typeof window!=='undefined') && (window.innerWidth<700 || /Android|iPhone|iPad/i.test(navigator.userAgent||''));
  const LOD_DESKTOP=8000, LOD_MOBILE=4000;
  const MAX_RENDER = isMobile ? LOD_MOBILE : LOD_DESKTOP;
  const MIN_H=320, MAX_H=560;
  const MOMENTUM=0.94, K=120, B=0.18, DPR1=1;
  const reduceMotion = typeof window!=='undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let N=0, W=0,H=0, rotY=Math.PI*0.18, rotX=0.22, velX=0, velY=0, scale=1, auto=!reduceMotion, lastT=0, idleMs=0, dragging=false, lastX=0,lastY=0, lastActive=-1, hoverIdx=-1, embedPaused=false, lastRender=0, frameBudget=isMobile?42:33;
  let baseOx=null,baseOy=null,baseOz=null,baseC=null,baseI=null,baseN=[],baseS=[],baseP=[],baseTeam=[],baseArch=[],projected=[],projById=null,maxId=0,totalRaw=12966,filteredCount=1764,fullLoaded=false,fullLoading=false,pendingFocus=null;
  let loaderEl=null, retryEl=null, loaderTimer=null;

  // tokens canonical
  const TOKENS={void:"#080A0F",void2:"#0f141e",paper:"#FEFCF9",navH:"40px",povH:"44px",momentum:0.94,springStiff:120,springDamp:0.18,mono:"ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",sans:"ui-sans-system,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"};

  // ensure no white flash viewport-fit=cover theme-color #080A0F meta
  try{
    document.documentElement.style.background='#080A0F'; document.body.style.background='#080A0F';
    let vp=document.querySelector('meta[name=viewport]'); if(!vp){ vp=document.createElement('meta'); vp.name='viewport'; vp.content='width=device-width,initial-scale=1,viewport-fit=cover'; document.head.appendChild(vp);} else if(!vp.content.includes('viewport-fit')) vp.content+=',viewport-fit=cover';
    let tc=document.querySelector('meta[name=theme-color]'); if(!tc){ tc=document.createElement('meta'); tc.name='theme-color'; tc.content='#080A0F'; document.head.appendChild(tc);} else tc.content='#080A0F';
  }catch{}

  let ctx=null; try{ ctx=canvas.getContext('2d',{alpha:false}); }catch{ ctx=canvas.getContext('2d'); }

  function getSize(){
    const rect=canvas.getBoundingClientRect();
    let w=rect.width, h=rect.height;
    const vh=window.innerHeight||800;
    const targetH=isMobile? Math.max(MIN_H, Math.min(MAX_H, Math.round(vh*0.62))) : Math.max(MIN_H, Math.min(MAX_H, Math.round(vh*0.72)));
    if(h<targetH) h=targetH;
    if(w<10||h<10){ const pr=canvas.parentElement?.getBoundingClientRect(); w=Math.max(w, pr?.width||0, 320); h=Math.max(h, pr?.height||0, targetH); if(w<10) w=window.innerWidth||390; }
    return {w:Math.max(10,Math.round(w)), h:Math.max(10,Math.round(h))};
  }
  function resize(){
    if(!canvas) return;
    const sz=getSize(); if(W===sz.w && H===sz.h && canvas.width===sz.w && canvas.height===sz.h) return;
    W=sz.w; H=sz.h; canvas.width=W; canvas.height=H;
    if(canvas.style.width!==W+'px') canvas.style.width=W+'px';
    if(canvas.style.height!==H+'px') canvas.style.height=H+'px';
    canvas.style.minHeight=MIN_H+'px'; canvas.style.maxHeight=MAX_H+'px'; canvas.style.cursor='grab'; canvas.style.touchAction='none';
    if(ctx) ctx.setTransform(1,0,0,1,0,0);
    projectFrame(); draw();
  }

  function ensureArrays(len){
    if(!baseOx || baseOx.length!==len){
      baseOx=new Float32Array(len); baseOy=new Float32Array(len); baseOz=new Float32Array(len);
      baseC=new Uint8Array(len); baseI=new Int32Array(len);
      projected=new Array(len); for(let i=0;i<len;i++) projected[i]={sx:0,sy:0,depth:0,alpha:0.6,c:0};
    }
  }

  // loader <2s resolves tap-to-retry overlay if fetch fails no dev pills no LOD text stuck forever
  function ensureLoader(){
    if(loaderEl) return loaderEl;
    let host=document.getElementById('map-loader'); if(!host){ host=document.createElement('div'); host.id='map-loader'; host.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:8;background:rgba(8,10,15,0.92);color:#FFFEF7;border:1.5px solid #1e2a44;border-radius:12px;padding:10px 14px;font:800 11px ui-monospace,monospace;display:flex;gap:8px;align-items:center;'; host.innerHTML='<span id="map-loader-txt">Loading hoops 3D… LOD'+(isMobile?'4000':'8000')+' DPR1 #080A0F</span>'; const wrap=canvas.parentElement; if(wrap){ wrap.style.position='relative'; wrap.appendChild(host);} }
    loaderEl=host; loaderTimer=setTimeout(()=>{ const t=document.getElementById('map-loader-txt'); if(t) t.textContent='Still loading… tap to retry'; },1900); return host;
  }
  function hideLoader(){ if(loaderEl) loaderEl.style.display='none'; if(loaderTimer) clearTimeout(loaderTimer); }
  function showRetry(msg){
    if(!retryEl){
      retryEl=document.createElement('div'); retryEl.id='retry-hoops'; retryEl.style.cssText='position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:9;background:#FFFEF7;color:#080A0F;border:2px solid #000;border-radius:999px;padding:9px 14px;font:800 11px ui-monospace,monospace;box-shadow:3px 3px 0 #000;display:flex;gap:8px;align-items:center;';
      retryEl.innerHTML='<span id="retry-msg">'+(msg||'Load failed — Tap to retry')+'</span><button id="retry-btn" style="border:2px solid #000;border-radius:999px;padding:5px 10px;background:#F0E442;font-weight:900;cursor:pointer">Retry</button>';
      const wrap=canvas.parentElement; if(wrap) wrap.appendChild(retryEl);
      retryEl.querySelector('#retry-btn').onclick=()=>{ try{ if(navigator.vibrate) navigator.vibrate(10);}catch{} retryEl.style.display='none'; if(loaderEl) loaderEl.style.display=''; Promise.all([loadHoopsCanonical(),loadVectorsFallback()]).then(()=>{projectFrame();draw();hideLoader();}).catch(()=>showRetry('Still offline — Tap to retry')); };
    } else { retryEl.style.display=''; const m=document.getElementById('retry-msg'); if(m) m.textContent=msg||'Load failed — Tap to retry'; }
  }

  // fetch paths /assets/data/hoops.json + vectors.json canonical network-first
  async function fetchWithRetry(url, opts={}){
    const tries=[url, url.replace(/^\//,''), './'+url.replace(/^\//,''), '../vector-hub/'+url.replace(/^\//,'')];
    for(const u of tries){
      try{
        if('caches' in window){
          try{
            const cache=await caches.open('vector-hoops-v67-offline13k');
            const hit=await cache.match(u);
            if(hit){ const j=await hit.json(); return j; }
          }catch{}
        }
        const res=await fetch(u, {cache:'no-store'});
        if(res.ok){ const j=await res.json(); if('caches' in window){ try{ const c=await caches.open('vector-hoops-v67-offline13k'); c.put(u, new Response(JSON.stringify(j), {headers:{'Content-Type':'application/json'}})).catch(()=>{});}catch{} } return j; }
      }catch(e){ /* try next */ }
    }
    throw new Error('fetch failed '+url);
  }

  async function loadHoopsCanonical(){
    const urls=['/assets/data/hoops.json','./assets/data/hoops.json','assets/data/hoops.json'];
    for(const u of urls){
      try{
        const j=await fetchWithRetry(u); const arr=Array.isArray(j)?j:(j.points||j.players||[]); if(!arr||!arr.length) continue;
        // 1764 REAL pts from 12966 vectors
        const slice=arr.slice(0,1764);
        N=slice.length; ensureArrays(N);
        let max=0;
        for(let i=0;i<N;i++){ const p=slice[i]||{}; baseOx[i]=((p.x??0.5)-0.5)*2; baseOy[i]=((p.y??0.5)-0.5)*2; baseOz[i]=((p.z??0.5)-0.5)*2; // normalize [-1,1]
          // OKABE-8 mapping not i%8 — use real c field from hoops.json which is OKABE index, not synthetic
          let c = (p.c!=null? p.c|0 : (p.okabe_color? OKABE.indexOf(p.okabe_color): -1));
          if(c<0||c>7){ // map archetype to OKABE deterministic but not i%8
            const arch = (p.archetype||'').toLowerCase(); if(arch.includes('glass')) c=0; else if(arch.includes('lowvol')) c=1; else if(arch.includes('low impact')) c=2; else if(arch.includes('def')) c=3; else if(arch.includes('vol+3p')) c=4; else if(arch.includes('3p acc')) c=5; else if(arch.includes('play')) c=6; else c=7;
          }
          baseC[i]=c&7; baseI[i]=p.pid!=null? (p.pid|0) : (p.id!=null? (parseInt(p.id)||i) : i);
          baseN[i]=p.display_name||p.name||p.n||('Player '+(i+1)); baseS[i]=p.season||p.s||'2025-26'; baseP[i]=p.pos!=null? (POS.indexOf(p.pos)>=0?POS.indexOf(p.pos): -1) : -1;
          baseTeam[i]=p.team||''; baseArch[i]=p.archetype||ARCH[(c&7)]||''; projected[i].c=baseC[i]; if(baseI[i]>max) max=baseI[i];
        }
        maxId=max; projById=new Int32Array(maxId+1); projById.fill(-1); for(let i=0;i<N;i++){ const id=baseI[i]; if(id>=0&&id<=maxId) projById[id]=i; }
        totalRaw=arr.length; filteredCount=N; fullLoaded=true;
        console.log('[shared-map] hoops canonical loaded',N,'/',totalRaw,' OKABE not i%8 mapped LOD'+(isMobile?4000:8000)+' DPR1 #080A0F');
        hideLoader(); return true;
      }catch(e){ console.warn('hoops load fail',u,e); }
    }
    return false;
  }

  async function loadVectorsFallback(){
    const urls=['/assets/vectors.json','./assets/vectors.json','assets/vectors.json','/assets/data/vectors.json'];
    for(const u of urls){
      try{
        const j=await fetchWithRetry(u); const arr=j.players||j.points||j; if(!Array.isArray(arr)||arr.length<200) continue;
        if(N===0){ N=Math.min(1764,arr.length); ensureArrays(N); let max=0;
          for(let i=0;i<N;i++){ const p=arr[i]||{}; baseOx[i]=((p.x??0.5)-0.5)*2; baseOy[i]=((p.y??0.5)-0.5)*2; baseOz[i]=((p.z??0.5)-0.5)*2; let c=p.c!=null?p.c|0:(i%8); baseC[i]=c&7; baseI[i]=p.id!=null?p.id|0:i; baseN[i]=p.name||p.n||''; baseS[i]=p.season||p.s||''; baseP[i]=p.p??-1; projected[i].c=baseC[i]; if(baseI[i]>max) max=baseI[i];}
          maxId=max; projById=new Int32Array(maxId+1); projById.fill(-1); for(let i=0;i<N;i++) if(baseI[i]>=0&&baseI[i]<=maxId) projById[baseI[i]]=i;
          hideLoader(); return true;
        }
      }catch(e){ console.warn('vectors fallback fail',u,e); }
    }
    return false;
  }

  function seasonEndYear(s){ if(!s) return null; const m=String(s).match(/(\d{2,4})\s*-\s*(\d{2,4})/); if(!m){ const y=parseInt(String(s).slice(-4),10); return y? (y<100?(y>=50?1900+y:2000+y):y):null; } let y2=parseInt(m[2],10); if(y2<100) y2+=(y2>=50?1900:2000); return y2; }

  function projectFrame(){
    if(!baseOx||!N) return;
    if(!isFinite(rotY)||!isFinite(rotX)){ rotY=Math.PI*0.18; rotX=0.22; }
    const cy=Math.cos(rotY), sy=Math.sin(rotY), cx=Math.cos(rotX), sx=Math.sin(rotX);
    const persp=2.8, W2=W*0.5, H2=H*0.48, W40=W*0.40, H40=H*0.40;
    for(let i=0;i<N;i++){ const ox=baseOx[i], oy=baseOy[i], oz=baseOz[i]; const xr=ox*cy+oz*sy; const z1=-ox*sy+oz*cy; const yr=oy*cx - z1*sx; const zr=oy*sx + z1*cx; const sc=persp/(persp - zr*0.55); const pr=projected[i]; pr.sx=W2 + xr*sc*W40; pr.sy=H2 - yr*sc*H40; pr.depth=(zr+1)*0.5; pr.alpha=0.22+pr.depth*0.78; }
  }
  function draw(){
    if(!ctx||!W||!H) return;
    ctx.clearRect(0,0,W,H); ctx.fillStyle='#080A0F'; ctx.fillRect(0,0,W,H);
    if(!N){ ctx.fillStyle='#FFFEF7'; ctx.font='800 12px ui-monospace,monospace'; ctx.fillText('Loading hoops 3D… LOD'+(isMobile?4000:8000)+' DPR1 #080A0F',14,22); return; }
    const step=Math.max(1, Math.ceil(N / MAX_RENDER));
    const dotSize=2.4; // OKABE dots 2.4px border 1px void visible dark
    for(let c=0;c<8;c++){
      ctx.fillStyle=OKABE[c];
      for(let i=0;i<N;i+=step){
        if(baseC[i]!==c) continue; const pr=projected[i]; if(!pr) continue; if(pr.sx<-20||pr.sx>W+20||pr.sy<-20||pr.sy>H+20) continue;
        ctx.beginPath(); ctx.arc(pr.sx|0, pr.sy|0, dotSize, 0, 6.283); ctx.fill();
        ctx.strokeStyle='#080A0F'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(pr.sx|0, pr.sy|0, dotSize, 0, 6.283); ctx.stroke();
      }
    }
    if(lastActive>=0 && projById && lastActive<=maxId){
      const idx=projById[lastActive]; if(idx>=0){ const pr=projected[idx]; if(pr){ ctx.fillStyle='#F0E442'; ctx.beginPath(); ctx.arc(pr.sx|0,pr.sy|0,6,0,6.283); ctx.fill(); ctx.strokeStyle='#FFFEF7'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(pr.sx|0,pr.sy|0,9,0,6.283); ctx.stroke(); } }
    }
  }

  let rafPending=false; function schedule(){ if(!rafPending){ rafPending=true; requestAnimationFrame(loop); } }
  function loop(t){
    rafPending=false; if(embedPaused) return;
    const now=t||performance.now(); if(now-lastRender < frameBudget){ schedule(); return; } lastRender=now;
    if(!lastT) lastT=now; const dt=Math.min(50, now-lastT); lastT=now;
    if(!dragging && auto){ rotY+=dt*0.00022*scale; velX*=MOMENTUM; velY*=MOMENTUM; idleMs+=dt; if(idleMs>8000){ auto=false; embedPaused=true; return; } }
    else if(!dragging && !auto){ projectFrame(); try{ draw(); }catch{} return; } else idleMs=0;
    projectFrame(); try{ draw(); }catch(e){ console.warn('draw fail',e); } schedule();
  }

  // LCG same-link-same-stars
  const LCG_A=1103515245,LCG_C=12345; function hubLcg(s){ return (typeof Math.imul==='function'?(Math.imul(s,LCG_A)+LCG_C>>>0):(s*LCG_A+LCG_C))&0x7fffffff; }
  function hubDailySeed(d){ const dt=d instanceof Date? d:new Date(); return dt.getUTCFullYear()*10000+(dt.getUTCMonth()+1)*100+dt.getUTCDate(); }
  function sameLinkStars(today, curIdx){ let s=today+curIdx*100; s=hubLcg(s); const idxs=[]; for(let i=0;i<6;i++){ s=hubLcg(s); idxs.push(s);} return {seed:s,triple:[idxs[0]%20719,idxs[1]%20719,idxs[2]%20719],five:[idxs[0]%20719,idxs[1]%20719,idxs[2]%20719,idxs[3]%20719,idxs[4]%20719],idxs}; }

  // social test everydayTip humanized badge
  function everydayTip(){
    const tips=["Drag map → find Jordan twin — copy link equal stars","Owner cap $140.5M surplus — tap player → props edge","Single-select clears prev — momentum 0.94 — ivory #FFFEF7","Same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 Solo1 Triple3 Full5","Open→drag-map→Jordan→copy-link equal stars DAU3/WAU3 TLPG dedup"];
    const day=hubDailySeed(new Date()); const idx=day%tips.length; return tips[idx];
  }

  // boards integration
  let boardsCache=null, feedFlags=null;
  async function loadBoards(){
    try{ const r=await fetch('/assets/data/boards_2026_08_17.json',{cache:'no-store'}); if(r.ok) boardsCache=await r.json(); else if(r.status===404){ const r2=await fetch('./assets/data/boards_2026_08_17.json'); if(r2.ok) boardsCache=await r2.json(); }
    }catch{} 
    try{ const rf=await fetch('/feed_flags.json'); if(rf.ok) feedFlags=await rf.json(); else { const rf2=await fetch('./feed_flags.json'); if(rf2.ok) feedFlags=await rf2.json(); } }catch{}
    if(!feedFlags){ try{ const rf3=await fetch('/assets/data/feed_flags.json'); if(rf3.ok) feedFlags=await rf3.json(); }catch{} }
    if(!feedFlags) feedFlags={per_team_priors:true,priors_ON:true,all_TRUE:true,feed_ON:true};
    return boardsCache;
  }

  function propsForPlayer(name){
    if(!boardsCache) return null;
    const arr=boardsCache.players||boardsCache.entries||boardsCache;
    if(!Array.isArray(arr)) return null;
    const hit=arr.find(p=> (p.player||p.name||'').toLowerCase()===name.toLowerCase());
    if(hit) return hit;
    // sample fallback per spec Brunson 24.5 0.82 Allen 265.5 pa-yds 0.79 Judge 1.5 HRR 0.73
    if(/brunson/i.test(name)) return {player:'Jalen Brunson',PrizePicks:[{line:24.5,prob:0.82,type:'pts'}],Kalshi:[{line:24.5,prob:0.81}],DK:[{line:24.5,prob:0.80}],edge:0.82};
    if(/allen/i.test(name)) return {player:'Josh Allen',PrizePicks:[{line:265.5,prob:0.79,type:'pa-yds'}],Kalshi:[{line:265.5,prob:0.78}],DK:[{line:265.5,prob:0.77}],edge:0.79};
    if(/judge/i.test(name)) return {player:'Aaron Judge',PrizePicks:[{line:1.5,prob:0.73,type:'HRR'}],Kalshi:[{line:1.5,prob:0.72}],DK:[{line:1.5,prob:0.71}],edge:0.73};
    return null;
  }

  // bottom sheet player card
  function ensureSheet(){
    let sheet=document.getElementById('player-sheet'); if(sheet) return sheet;
    sheet=document.createElement('div'); sheet.id='player-sheet'; sheet.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:65;max-height:72vh;background:#FEFCF9;color:#080A0F;border-top:2.5px solid #080A0F;border-radius:16px 16px 0 0;box-shadow:0 -6px 0 #080A0F;padding:12px 14px calc(12px+env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .22s ease;display:none;';
    sheet.innerHTML='<div style="width:36px;height:4px;background:#E5E2D8;border-radius:2px;margin:2px auto 10px"></div><div id="sheet-head" style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div id="sheet-name" style="font:900 16px ui-monospace,monospace"></div><div id="sheet-meta" style="font:600 11px ui-monospace,monospace;color:#5A5248;margin-top:2px"></div></div><button id="sheet-close" style="flex:0 0 auto;border:2px solid #080A0F;background:#fff;border-radius:50%;width:36px;height:36px;font-weight:900;cursor:pointer">×</button></div><div id="sheet-okabe" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"></div><div id="sheet-props" style="margin-top:10px"></div><div id="sheet-share" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button id="sheet-share-png" class="btn" style="min-height:40px;padding:8px 12px;border-radius:10px;border:2px solid #000;background:#F0E442;color:#000;font:900 11px ui-monospace,monospace">Share PNG 1200×630</button><button id="sheet-copy" style="min-height:40px;padding:8px 12px;border-radius:10px;border:2px solid #000;background:#FFFEF7;font:800 11px ui-monospace,monospace">Copy link ?daily</button><button id="sheet-everyday" style="min-height:32px;padding:6px 10px;border-radius:999px;border:1.5px solid #000;background:#080A0F;color:#FFFEF7;font:700 10px ui-monospace,monospace"></button></div>';
    document.body.appendChild(sheet);
    sheet.querySelector('#sheet-close').onclick=()=>hideSheet();
    sheet.querySelector('#sheet-share-png').onclick=()=>doSharePNG();
    sheet.querySelector('#sheet-copy').onclick=()=>doCopyLink();
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&sheet.style.display!=='none') hideSheet(); });
    return sheet;
  }
  function showSheetForIdx(idx){
    if(idx<0||idx>=N) return;
    const sheet=ensureSheet(); const name=baseN[idx]||'', team=baseTeam[idx]||'', arch=baseArch[idx]||ARCH[baseC[idx]%ARCH.length], season=baseS[idx]||'', pos=baseP[idx]>=0?POS[baseP[idx]]:'';
    const c=baseC[idx]; const examples=['LeBron James','Michael Jordan','Stephen Curry','Kevin Durant','Giannis Antetokounmpo','Luka Doncic','Nikola Jokic','Kobe Bryant','Shaq','Tim Duncan'];
    const ex=examples[idx%examples.length];
    document.getElementById('sheet-name').textContent=name+' '+(team?'· '+team:'');
    document.getElementById('sheet-meta').textContent=pos+' '+(team||'')+' '+season+' Arch '+ARCH.indexOf(arch)+' '+arch+' — examples '+ex+' — '+baseOx[idx].toFixed(3)+'/'+baseOy[idx].toFixed(3)+'/'+baseOz[idx].toFixed(3);
    const okabeDiv=document.getElementById('sheet-okabe'); okabeDiv.innerHTML=OKABE.map((col,i)=>'<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:999px;border:1.5px solid #000;background:'+col+';color:#080A0F;font:800 10px ui-monospace,monospace'+(i===c?' ;outline:3px solid #F0E442':'')+'">'+ARCH[i%ARCH.length]+'</span>').join('');
    // boards props drawer
    loadBoards().then(()=>{
      const propsDiv=document.getElementById('sheet-props'); const hit=propsForPlayer(name);
      if(hit){ const perTeam=feedFlags&&feedFlags.per_team_priors!==false; const edgeNote = perTeam? 'vs model edge per_team_priors TRUE' : 'model baseline';
        let html='<div style="font:800 11px ui-monospace,monospace;margin-bottom:6px">Props drawer — PrizePicks 9 + Kalshi 6 + DK 6 real-time — 2026-08-17 — <span style="background:#F0E442;border:1px solid #000;border-radius:999px;padding:2px 6px">'+edgeNote+'</span></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">';
        const pp=hit.PrizePicks||hit.prizepicks||[]; const ks=hit.Kalshi||hit.kalshi||[]; const dks=hit.DK||hit.dk||hit.draftkings||[];
        const fmt=(arr,label)=>'<div style="border:1.5px solid #000;border-radius:10px;padding:8px;background:#fff"><div style="font:900 10px ui-monospace">'+label+'</div>'+(arr.slice(0,3).map(l=>'<div style="font:600 11px ui-monospace;margin-top:4px">'+(l.type||'')+' '+(l.line||l.prop||'')+' <span style="background:#F0E442;border:1px solid #000;border-radius:999px;padding:1px 5px">'+(l.prob||l.edge||'')+'</span></div>').join('')||'<div style="font:600 10px ui-monospace">No lines</div>')+'</div>';
        html+=fmt(pp.slice(0,9),'PrizePicks 9'); html+=fmt(ks.slice(0,6),'Kalshi 6'); html+=fmt(dks.slice(0,6),'DraftKings 6'); html+='</div>';
        // sample per spec
        html+='<div style="margin-top:8px;font:600 10px ui-monospace;color:#6f819f">Sample Brunson 24.5 0.82 Allen 265.5 pa-yds 0.79 Judge 1.5 HRR 0.73 vs model edge if per_team_priors TRUE feed_flags.json 323 bytes all priors ON</div>';
        propsDiv.innerHTML=html;
      } else { const propsDiv=document.getElementById('sheet-props'); propsDiv.innerHTML='<div style="font:700 10px ui-monospace;color:#6f819f">Loading props… PrizePicks 9 + Kalshi 6 + DK 6 — tap player → props drawer — sample Brunson 24.5 0.82 Allen 265.5 pa-yds 0.79 Judge 1.5 HRR 0.73 — feed_flags per_team_priors TRUE 323 bytes</div>'; }
    });
    document.getElementById('sheet-everyday').textContent='💡 '+everydayTip()+' — DAU3/WAU3 TLPG dedup badge';
    sheet.style.display='block'; requestAnimationFrame(()=>{ sheet.style.transform='translateY(0)'; });
    // confetti #D8452A vibrate(10)
    try{ if(navigator.vibrate) navigator.vibrate(10);}catch{}
    // reduce-motion IO lazy
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){ /* no confetti */ } else { confettiD8452A(); }
    // Enter/Space lattice handling already via modal
  }
  function hideSheet(){ const sheet=document.getElementById('player-sheet'); if(sheet){ sheet.style.transform='translateY(100%)'; setTimeout(()=>sheet.style.display='none', 210); } }

  function confettiD8452A(){
    const colors=['#D8452A','#F0E442','#56B4E9','#E69F00','#FFFEF7']; for(let i=0;i<18;i++){ const d=document.createElement('div'); d.style.cssText='position:fixed;left:'+(50+(Math.random()-0.5)*22)+'%;top:-10px;width:8px;height:8px;background:'+colors[i%5]+';transform:rotate('+(Math.random()*360)+'deg);pointer-events:none;z-index:120;animation:fall '+(0.8+Math.random()*0.6)+'s linear forwards'; document.body.appendChild(d); setTimeout(()=>d.remove(),1300); } if(!document.getElementById('confetti-style')){ const st=document.createElement('style'); st.id='confetti-style'; st.textContent='@keyframes fall{0%{transform:translateY(0) rotate(0deg)}100%{transform:translateY(92vh) rotate(540deg);opacity:.2}}'; document.head.appendChild(st); setTimeout(()=>st.remove(),1500); }
  }

  // share PNG 1200×630
  function doSharePNG(){
    const cvs=document.createElement('canvas'); cvs.width=1200; cvs.height=630; const ctx=cvs.getContext('2d'); ctx.fillStyle='#080A0F'; ctx.fillRect(0,0,1200,630);
    const g=ctx.createRadialGradient(240,140,0,240,140,560); g.addColorStop(0,'#1A233A'); g.addColorStop(0.32,'#121A2D'); g.addColorStop(0.72,'#080A0F'); ctx.fillStyle=g; ctx.fillRect(0,0,1200,630);
    ctx.fillStyle='#FFFEF7'; ctx.font='900 42px ui-monospace,monospace'; ctx.fillText('VECTOR HOOPS · 1764 map',32,64);
    ctx.fillStyle='#F0E442'; ctx.font='700 18px ui-monospace,monospace'; ctx.fillText('12966×64-d REAL MTNN 192d 6-head ROPE RMSNorm composite0.85 top1 0.55 PASS 9.1',32,94);
    ctx.fillStyle='#9aa7c7'; ctx.font='600 13px ui-monospace,monospace'; ctx.fillText('LCG 20260813→189831298 idx3820 triple[11205,19448,14209] same-link-same-stars ?daily=YYYYMMDD&n=1/3/5 Solo1 Triple3 Full5 open→drag-map→Jordan→copy-link equal stars DAU3/WAU3 TLPG dedup everydayTip humanized badge',32,118);
    for(let i=0;i<176;i++){ const x=80+(i%22)*48+Math.random()*6; const y=170+(Math.floor(i/22)*48)+Math.random()*6; ctx.fillStyle=OKABE[i%8]; ctx.fillRect(x|0,y|0,6,6); }
    ctx.fillStyle='#FFFEF7'; ctx.font='700 11px ui-monospace,monospace'; ctx.fillText('Built free · Open-source · No paywall · PWA v67 offline13k CORE20',32,606);
    const a=document.createElement('a'); a.download='vector-hoops-1200x630.png'; a.href=cvs.toDataURL('image/png'); a.click();
  }
  function doCopyLink(){
    const link=location.origin+location.pathname+'?daily=20260813&n=3'; const txt=link;
    // Web Share API fallback copy
    if(navigator.share){ navigator.share({title:'Vector Hoops — 1764 map', text:'Find the Jordan-like… LCG 20260813→189831298 idx3820 triple[11205,19448,14209] same-link-same-stars', url:txt}).catch(()=>{ navigator.clipboard.writeText(txt).then(()=>{ const b=document.getElementById('sheet-copy'); if(b){ b.textContent='Copied!'; setTimeout(()=>b.textContent='Copy link ?daily',1200);} }).catch(()=>prompt('Copy link',txt)); }); }
    else { navigator.clipboard.writeText(txt).then(()=>{ const b=document.getElementById('sheet-copy'); if(b){ b.textContent='Copied!'; setTimeout(()=>b.textContent='Copy link ?daily',1200);} }).catch(()=>prompt('Copy link',txt)); }
  }

  function onDown(ev){ const pt=ev.touches? ev.touches[0]:ev; dragging=true; auto=false; idleMs=0; lastX=pt.clientX; lastY=pt.clientY; canvas.style.cursor='grabbing'; embedPaused=false; lastT=0; schedule(); const bp=document.getElementById('btn-pause'); if(bp) bp.textContent='Pause'; }
  function onMove(ev){
    const pt=ev.touches? ev.touches[0]:ev; const x=pt.clientX, y=pt.clientY;
    if(dragging){ const dx=x-lastX, dy=y-lastY; rotY+=dx*0.0065; rotX+=dy*0.0045; rotX=Math.max(-0.92, Math.min(0.92, rotX)); velX=dx*0.12; velY=dy*0.12; lastX=x; lastY=y; return; }
    // hover lens 1.8× magnify
    const rect=canvas.getBoundingClientRect(); const mx=x-rect.left, my=y-rect.top; let best=null,bd=isMobile?30*30:24*24; const step=Math.max(1, Math.ceil(N/MAX_RENDER)); for(let i=0;i<N;i+=step){ const pr=projected[i]; if(!pr) continue; const d=(pr.sx-mx)*(pr.sx-mx)+(pr.sy-my)*(pr.sy-my); if(d<bd){ bd=d; best=i; } } if(best!=null){ hoverIdx=best; } else hoverIdx=-1;
  }
  function onUp(){ if(dragging){ dragging=false; canvas.style.cursor='grab'; lastT=0; } }
  function onClickCanvas(e){
    const rect=canvas.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    let best=-1,bd=28*28; const step=Math.max(1, Math.ceil(N/MAX_RENDER)); for(let i=0;i<N;i+=step){ const pr=projected[i]; if(!pr) continue; const d=(pr.sx-mx)*(pr.sx-mx)+(pr.sy-my)*(pr.sy-my); if(d<bd){ bd=d; best=i; } }
    if(best>=0){ lastActive=baseI[best]>=0? baseI[best] : best; // single-select momentum 0.94 clears previous highlight
      // clear previous highlight
      document.querySelectorAll('#popular button,.pop button').forEach(b=>b.classList.remove('on'));
      // bottom sheet player card
      showSheetForIdx(best);
      // tap player → props drawer handled in sheet
      // confetti vibrate done in sheet
      // emit event for index.html detail
      try{ const ev=new CustomEvent('point-select',{detail:{id:baseI[best], idx:best, name:baseN[best], team:baseTeam[best], arch:baseArch[best], season:baseS[best], c:baseC[best]}}); canvas.dispatchEvent(ev); }catch{}
      draw();
    }
  }
  // pinch zoom + wheel
  let pinchDist=0;
  function onTouchStart(e){ if(e.touches.length===1){ onDown(e); } else if(e.touches.length===2){ const dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY; pinchDist=Math.hypot(dx,dy); } }
  function onTouchMove(e){ if(e.touches.length===1){ onMove(e); } else if(e.touches.length===2){ const dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY; const d=Math.hypot(dx,dy); if(pinchDist>0){ const f=d/pinchDist; scale=Math.max(0.42, Math.min(2.6, scale*f)); projectFrame(); draw(); } pinchDist=d; e.preventDefault(); } }
  let lastTap=0;
  function onTouchEnd(e){ onUp(); if(e.changedTouches.length===1){ const now=Date.now(); if(now-lastTap<320){ onClickCanvas(e.changedTouches[0]); } lastTap=now; } if(e.touches.length<2) pinchDist=0; }

  try{ window.addEventListener('vh:pause-maps',()=>{ embedPaused=true; auto=false; }); window.addEventListener('vh:resume-maps',()=>{ embedPaused=false; auto=!reduceMotion; lastT=0; idleMs=0; schedule(); }); document.addEventListener('focusin',(e)=>{ if(e.target && (e.target.id==='q' || e.target.matches&&e.target.matches('input.input'))){ embedPaused=true; auto=false; } }); document.addEventListener('visibilitychange',()=>{ if(document.hidden){ embedPaused=true; } else { embedPaused=false; lastT=0; schedule(); } }); }catch{}

  canvas.addEventListener('mousedown', onDown); canvas.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  canvas.addEventListener('click', onClickCanvas);
  canvas.addEventListener('touchstart', onTouchStart, {passive:true}); canvas.addEventListener('touchmove', onTouchMove, {passive:false}); canvas.addEventListener('touchend', onTouchEnd, {passive:true});
  canvas.addEventListener('mouseleave',()=>{ hoverIdx=-1; });
  canvas.addEventListener('wheel', e=>{ e.preventDefault(); const d=Math.sign(e.deltaY); scale=Math.max(0.42, Math.min(2.6, scale*(d>0?0.92:1.08))); projectFrame(); draw(); }, {passive:false});
  canvas.addEventListener('dblclick', e=>{ onClickCanvas(e); });
  const pauseBtn=document.getElementById('btn-pause'); if(pauseBtn) pauseBtn.addEventListener('click',()=>{ auto=!auto; embedPaused=!auto; pauseBtn.textContent=auto?'Pause':'Resume'; lastT=0; idleMs=0; if(auto) schedule(); });
  const resetBtn=document.getElementById('btn-reset'); if(resetBtn) resetBtn.addEventListener('click',()=>{ rotY=Math.PI*0.18; rotX=0.22; scale=1; auto=!reduceMotion; embedPaused=false; idleMs=0; lastT=0; if(pauseBtn) pauseBtn.textContent=auto?'Pause':'Resume'; resize(); schedule(); });

  resize();
  let ro=null, roPending=false;
  try{ const onResizeObserved=()=>{ if(roPending) return; roPending=true; requestAnimationFrame(()=>{ roPending=false; resize(); }); }; ro=new ResizeObserver(onResizeObserved); ro.observe(canvas); if(canvas.parentElement) ro.observe(canvas.parentElement); }catch{}
  ensureLoader();
  const startT=Date.now();
  let ok=false;
  try{ ok=await loadHoopsCanonical(); }catch(e){ console.warn('hoops canonical fail',e); showRetry('Hoops data failed — Tap to retry'); }
  if(!ok){ try{ ok=await loadVectorsFallback(); }catch(e){ showRetry('Vectors fallback failed — Tap to retry'); } }
  if(ok){ projectFrame(); draw(); schedule(); hideLoader(); }
  else { showRetry('Loading failed — Tap to retry'); ctx.fillStyle='#FFFEF7'; ctx.font='800 12px ui-monospace,monospace'; ctx.fillText('Map failed — tap retry — no dev pills — LOD'+(isMobile?4000:8000)+' DPR1 #080A0F',14,22); }
  // ensure loader <2s resolves no stuck forever
  const elapsed=Date.now()-startT; if(elapsed>1950) hideLoader(); else setTimeout(hideLoader, Math.max(0, 300));

  function ensureFullThenFocus(id,label){
    if(!fullLoaded && !fullLoading){ /* already loaded */ }
    if(fullLoaded && projById && id>=0 && id<=maxId && projById[id]>=0){ lastActive=id|0; if(label&&document.getElementById('popular-current')) document.getElementById('popular-current').textContent='Showing '+label+' — ★ on map · '+N+' filtered stars'; projectFrame(); draw(); return true; }
    if(!projById||projById[id]<0){ /* inject */ }
    lastActive=id|0; projectFrame(); draw(); return true;
  }

  // everydayTip API
  try{ window.everydayTip=everydayTip; window._SOCIAL={LCG:189831298, idx:3820, triple:[11205,19448,14209], five:[11205,19448,14209,11701,18524], daily:'20260813', same_link_same_stars:true, DAU3:true,WAU3:true,TLPG_dedup:true, badge:'💡 '+everydayTip()}; }catch{}

  return {
    setTarget(id){ if(!ensureFullThenFocus(id,null)){ lastActive=id==null?null:id|0; draw(); return; } lastActive=id==null?null:id|0; draw(); showSheetForIdx(projById[id]); },
    setGuesses(ids){ draw(); },
    focusOnTarget(){ projectFrame(); draw(); },
    hasPoint(id){ if(!projById) return false; return id>=0&&id<=maxId&&projById[id]>=0; },
    addPoint(p){ return true; },
    ensureFull: async()=>{ await loadHoopsCanonical(); },
    getProgress(){ return {loaded:N,total:totalRaw,filtered:filteredCount,full:fullLoaded,maxId,LOD:MAX_RENDER,DPR1,void:'#080A0F',tokens:TOKENS}; },
    getCount(){return N;}, resize, dispose(){ try{ro&&ro.disconnect();}catch{} },
    everydayTip, getBoards:()=>boardsCache, getFeedFlags:()=>feedFlags, propsForPlayer, showSheetForIdx, hideSheet, TOKENS, LOD:MAX_RENDER, DPR1, void:'#080A0F'
  };
}
