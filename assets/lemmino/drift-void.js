/* drift-void.js v30 — LEAD UX REDO: court story, 1 of 15, fun + AAA readable */
export async function mountDriftVoid(canvas){
  if(!canvas) return;
  const isMobile = window.innerWidth < 760;
  const dpr = Math.min(window.devicePixelRatio||1, 1.8);

  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#111111'];
  const ARCH=[
    { i:0, label:'Glass+Rim', full:'Off Glass + Rim Protection', off:32, def:92, x:-2, y:11, role:'Rim Anchor', desc:'Crash glass, own paint', emoji:'🛡️', color:OKABE[0]},
    { i:1, label:'LowVol Glass', full:'Off Glass Low Vol', off:22, def:88, x:-4, y:13, role:'Energy Big', desc:'Putbacks + hustle', emoji:'🔋', color:OKABE[1]},
    { i:2, label:'Low Impact', full:'Low Impact', off:24, def:28, x:6, y:19, role:'Deep Reserve', desc:'End of bench', emoji:'🪑', color:OKABE[2]},
    { i:3, label:'Def Glass FT', full:'Def Glass + FT Pressure', off:46, def:71, x:-1, y:14, role:'Two-Way Big', desc:'Draws FTs, cleans glass', emoji:'⚖️', color:OKABE[3]},
    { i:4, label:'Vol+3P', full:'Shot Vol + 3P Vol', off:88, def:34, x:16, y:24, role:'Volume Scorer', desc:'High usage creator', emoji:'🔥', color:OKABE[4]},
    { i:5, label:'3P Acc+Vol', full:'3P Accuracy + Volume', off:84, def:38, x:19, y:21, role:'Floor Spacer', desc:'Gravity beyond arc', emoji:'🎯', color:OKABE[5]},
    { i:6, label:'Playmaking', full:'Playmaking + Ball Pressure', off:76, def:66, x:-8, y:28, role:'Lead Playmaker', desc:'QB + pickpocket', emoji:'🧠', color:OKABE[6]},
    { i:7, label:'Scoring Vol', full:'Scoring Volume', off:91, def:40, x:8, y:26, role:'Bucket Getter', desc:'Buckets anywhere', emoji:'🪣', color:OKABE[7]},
  ];
  const POS_LABELS=['PG','SG','SF','PF','C'];
  const POS_ICON={PG:'●',SG:'▲',SF:'◆',PF:'■',C:'✚'};
  const POS_OFF={PG:{x:-7,y:6},SG:{x:7,y:5},SF:{x:10,y:2},PF:{x:2,y:-2},C:{x:0,y:-4}};

  const CACHE='vector-hoops-v30-uxredo-20260721';
  async function cachedFetchJSON(url){
    try{ if('caches' in window){ const c=await caches.open(CACHE); const hit=await c.match(url); if(hit) return await hit.json(); } }catch{}
    const r=await fetch(url,{cache:'default'});
    try{ if('caches' in window){ const c=await caches.open(CACHE); c.put(url, r.clone()).catch(()=>{}); } }catch{}
    return r.json();
  }

  let timeData, liteData, vecData, teamData;
  try{
    const [tData, lPos, vData, tmData] = await Promise.all([
      cachedFetchJSON('assets/archetypes_time.json?v=30'),
      cachedFetchJSON('assets/vectors_search_lite_pos.json?v=30').catch(()=>cachedFetchJSON('assets/vectors_search_lite.json?v=30')),
      cachedFetchJSON('assets/vectors.json?v=30').catch(()=>null),
      cachedFetchJSON('assets/player_team_season.json?v=30').catch(()=>null)
    ]);
    timeData=tData; liteData=lPos; vecData=vData; teamData=tmData;
  }catch(e){ console.warn('court v30 fetch fail',e); return; }

  const seasons=timeData?.prevalence||[];
  const seasonIdx=new Map(seasons.map((s,i)=>[s.season,i]));
  const tmpPlayers=liteData?.players||liteData||[];
  const byName=new Map(); const playerSeasonLookup=new Map();
  for(const p of tmpPlayers){
    if(!byName.has(p.n)) byName.set(p.n,[]);
    byName.get(p.n).push(p);
    playerSeasonLookup.set(`${p.n}|${p.s}`, p);
  }
  for(const arr of byName.values()) arr.sort((a,b)=> (a.s||'').localeCompare(b.s||''));

  const minutesMap=new Map();
  if(vecData?.players){ for(const p of vecData.players) minutesMap.set(`${p.name}|${p.season}`, {gp:p.gp||0, mpg:p.mpg||0}); }

  const teamMap=teamData||{};
  const teamSeasonRoster=new Map();
  for(const key of Object.keys(teamMap)){
    const sep=key.lastIndexOf('|'); if(sep<0) continue;
    const name=key.slice(0,sep); const season=key.slice(sep+1); const team=teamMap[key];
    if(!team) continue;
    const tsKey=`${team}|${season}`;
    if(!teamSeasonRoster.has(tsKey)) teamSeasonRoster.set(tsKey,[]);
    const entry=playerSeasonLookup.get(key);
    const min=minutesMap.get(key);
    teamSeasonRoster.get(tsKey).push({name,season,team,c:entry?.c??2,p:entry?.p??2,pl:entry?.pl||POS_LABELS[entry?.p]||'SF',mpg:min?.mpg||0,gp:min?.gp||0});
  }
  for(const arr of teamSeasonRoster.values()) arr.sort((a,b)=> b.mpg-a.mpg||b.gp-a.gp);

  const allNames=[...byName.keys()].sort((a,b)=> byName.get(b).length - byName.get(a).length);
  const CURATED=["LeBron James","Stephen Curry","Kevin Durant","Giannis Antetokounmpo","Nikola Jokic","Kobe Bryant","Michael Jordan","Shaquille O'Neal","Tim Duncan","Dirk Nowitzki","James Harden","Russell Westbrook","Chris Paul","Kevin Garnett","Steve Nash","Dwyane Wade","Allen Iverson","Victor Wembanyama","Anthony Edwards","Luka Doncic","Jayson Tatum","Joel Embiid"];
  let pool=CURATED.filter(n=>byName.has(n)); for(const nm of allNames){ if(pool.length>=120) break; if(!pool.includes(nm)&&(byName.get(nm)?.length||0)>=4) pool.push(nm); }

  // DOM
  const root=document.getElementById('lemmino-drift');
  if(root){
    root.style.background='#FFFEF7';
    root.style.borderTop='3px solid #1A150F';
    root.style.borderBottom='3px solid #1A150F';
    root.style.display='flex';
    root.style.flexDirection='column';
  }
  let header=document.getElementById('drift-header-v26');
  if(!header){ header=document.createElement('div'); header.id='drift-header-v26'; root.prepend(header); }
  header.innerHTML=`
    <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;padding:16px 18px;background:#FFFEF7;border-bottom:3px solid #1A150F">
      <div style="display:flex;flex-direction:column;gap:4px">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:900;letter-spacing:.08em;background:#1A150F;color:#FFFEF7;border-radius:999px;padding:8px 14px">Career Floor • 1 of 5 on court • 1 of 15 roster</span>
          <span style="font-family:ui-monospace,monospace;font-size:11px;opacity:.6">raw Canvas • half-court story • offense/defense evolution</span>
        </div>
        <div style="font-family:ui-sans-serif,system-ui;font-weight:800;font-size:13px;line-height:1.3;color:#1A150F;opacity:.75">Every player is 1 of 15. See where they fit in the 5-man unit, how their spacing moved from paint to arc, and how O/D evolved.</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;position:relative">
        <div style="position:relative">
          <input id="drift-player-search" placeholder="Search 2,293 players…" autocomplete="off" style="min-width:${isMobile?'56vw':'360px'};width:${isMobile?'56vw':'400px'};max-width:82vw;height:52px;border:3px solid #1A150F;border-radius:14px;padding:0 16px 0 42px;font-family:ui-monospace,monospace;font-weight:800;font-size:15px;background:#fff;box-shadow:4px 4px 0 #1A150F;outline:none"/>
          <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:18px">🔍</span>
          <div id="drift-search-results" style="position:absolute;left:0;top:58px;width:100%;max-height:380px;overflow:auto;background:#FFFEF7;border:3px solid #1A150F;border-radius:16px;box-shadow:8px 8px 0 #1A150F;display:none;z-index:30"></div>
        </div>
        <button id="drift-random" type="button" style="min-height:52px;padding:0 18px;border:3px solid #1A150F;border-radius:14px;background:#F0E442;font-family:ui-monospace,monospace;font-weight:900;font-size:14px;box-shadow:4px 4px 0 #1A150F;cursor:pointer">🎲 Random</button>
      </div>
    </div>`;

  const existingCanvas=document.getElementById('lemmino-drift-canvas');
  let wrap=document.getElementById('drift-canvas-wrap-v26');
  if(!wrap){ wrap=document.createElement('div'); wrap.id='drift-canvas-wrap-v26'; wrap.style.cssText='position:relative;width:100%;background:#FFFEF7;display:flex;flex-direction:column'; existingCanvas.parentNode.insertBefore(wrap, existingCanvas); wrap.appendChild(existingCanvas); }
  // make canvas card
  existingCanvas.style.width='100%';
  existingCanvas.style.height=isMobile?'72vh':'84vh';
  existingCanvas.style.minHeight=isMobile?'620px':'820px';
  existingCanvas.style.display='block';
  existingCanvas.style.background='#FFFEF7';
  existingCanvas.style.borderBottom='3px solid #1A150F';

  // overlays
  let focusWrap=document.getElementById('drift-focus-v26');
  if(!focusWrap){ focusWrap=document.createElement('div'); focusWrap.id='drift-focus-v26'; focusWrap.style.cssText='padding:14px 18px;background:#FFFEF7;border-bottom:3px solid #1A150F;display:flex;flex-direction:column;gap:10px'; wrap.prepend(focusWrap); }
  focusWrap.innerHTML=`<div id="lemmino-drift-focus"></div><div id="lemmino-drift-meta"></div>`;
  const focusEl=document.getElementById('lemmino-drift-focus');
  const metaEl=document.getElementById('lemmino-drift-meta');

  let controls=document.getElementById('drift-controls-v26');
  if(!controls){ controls=document.createElement('div'); controls.id='drift-controls-v26'; wrap.appendChild(controls); }
  controls.style.cssText='display:flex;gap:10px;align-items:center;padding:14px 18px;background:#FFFEF7;border-bottom:3px solid #1A150F;flex-wrap:wrap';
  controls.innerHTML=`
    <button id="drift-prev" aria-label="Prev shift" style="min-width:56px;min-height:52px;border:3px solid #1A150F;border-radius:999px;background:#fff;font-family:ui-monospace,monospace;font-weight:900;font-size:14px;cursor:pointer;box-shadow:3px 3px 0 #1A150F">⟵</button>
    <button id="drift-play" style="min-width:112px;min-height:52px;border:3px solid #1A150F;border-radius:999px;background:#1A150F;color:#FFFEF7;font-family:ui-monospace,monospace;font-weight:900;font-size:14px;cursor:pointer;box-shadow:3px 3px 0 #1A150F">▶ Play story</button>
    <button id="drift-next" aria-label="Next shift" style="min-width:56px;min-height:52px;border:3px solid #1A150F;border-radius:999px;background:#fff;font-family:ui-monospace,monospace;font-weight:900;font-size:14px;cursor:pointer;box-shadow:3px 3px 0 #1A150F">⟶</button>
    <div id="drift-scrub" style="flex:1 1 220px;min-width:180px;height:28px;background:#fff;border:3px solid #1A150F;border-radius:999px;position:relative;overflow:hidden;cursor:pointer;box-shadow:2px 2px 0 #1A150F"><div id="drift-scrub-fill" style="position:absolute;left:0;top:0;bottom:0;width:0%;background:#1A150F;border-radius:999px"></div><div id="drift-scrub-thumb" style="position:absolute;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:999px;background:#F0E442;border:2.5px solid #1A150F;left:0"></div></div>
    <span style="font-family:ui-monospace,monospace;font-size:12px;opacity:.6">drag slider or tap players on court</span>
  `;
  const scrub=document.getElementById('drift-scrub');
  const scrubFill=document.getElementById('drift-scrub-fill');
  const scrubThumb=document.getElementById('drift-scrub-thumb');
  const btnPlay=document.getElementById('drift-play');
  const btnNext=document.getElementById('drift-next');
  const btnPrev=document.getElementById('drift-prev');
  const searchInput=document.getElementById('drift-player-search');
  const searchResults=document.getElementById('drift-search-results');
  const randomBtn=document.getElementById('drift-random');

  let timelineH=document.getElementById('drift-timeline');
  if(!timelineH){ timelineH=document.createElement('div'); timelineH.id='drift-timeline'; root.appendChild(timelineH); }
  timelineH.style.cssText=`display:flex;gap:10px;overflow-x:auto;padding:16px 18px;background:#FFFEF7;border-bottom:3px solid #1A150F;scrollbar-width:thin`;

  let quadEl=document.getElementById('drift-quad');
  if(!quadEl){ quadEl=document.createElement('div'); quadEl.id='drift-quad'; root.appendChild(quadEl); }
  quadEl.style.cssText=`background:#FFFEF7;padding:18px;display:flex;flex-direction:column;gap:18px`;

  const styleEl=document.getElementById('drift-v21-style')||document.createElement('style'); styleEl.id='drift-v21-style';
  styleEl.textContent=`
    #drift-timeline::-webkit-scrollbar{height:8px} #drift-timeline::-webkit-scrollbar-thumb{background:#1A150F;border-radius:99px}
    .drift-tm-chip{border-radius:999px;padding:12px 16px;font-family:ui-monospace,monospace;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;border:3px solid #1A150F;flex:0 0 auto;transition:transform .12s}
    .drift-tm-chip.filled{background:#1A150F;color:#FFFEF7;box-shadow:4px 4px 0 #1A150F;transform:translateY(-2px)}
    .drift-tm-chip.outline-past{background:#fff;color:#1A150F;box-shadow:2px 2px 0 #1A150F}
    .drift-tm-chip.outline-future{background:#ECE7DB;color:#6B6760;border-style:dashed}
    .drift-sresult{padding:14px 16px;cursor:pointer;border-bottom:1.5px solid rgba(26,21,15,.08);display:flex;justify-content:space-between;gap:12px;font-family:ui-monospace,monospace;font-size:14px}
    .drift-sresult:hover{background:#1A150F;color:#FFFEF7}
    .ux-card{border:3px solid #1A150F;border-radius:18px;background:#fff;box-shadow:6px 6px 0 #1A150F;padding:16px}
    .ux-title{font-family:ui-sans-serif,system-ui;font-weight:900;font-size:18px;line-height:1.2;letter-spacing:-.02em;color:#1A150F}
    .ux-mono{font-family:ui-monospace,monospace;font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:800;opacity:.7}
    .roster-chip{border:2.5px solid #1A150F;border-radius:999px;padding:8px 12px;font-family:ui-monospace,monospace;font-size:12px;font-weight:800;display:inline-flex;align-items:center;gap:6px;background:#fff;box-shadow:2px 2px 0 #1A150F;cursor:default}
    .roster-chip.is-focal{background:#1A150F;color:#FFFEF7;box-shadow:3px 3px 0 #1A150F;transform:translateY(-1px)}
    .pill{border-radius:999px;padding:8px 14px;font-family:ui-monospace,monospace;font-size:12px;font-weight:900;border:2.5px solid #1A150F;display:inline-flex;align-items:center;gap:6px;background:#fff}
    .pill-dark{background:#1A150F;color:#FFFEF7}
    .pill-yellow{background:#F0E442;color:#1A150F}
  `;
  document.head.appendChild(styleEl);

  const ctx=canvas.getContext('2d', {alpha:false});
  function resize(){
    const rect=canvas.getBoundingClientRect();
    const w=Math.max(320, Math.floor(rect.width));
    const h=Math.max(480, Math.floor(rect.height));
    const pw=Math.floor(w*dpr), ph=Math.floor(h*dpr);
    if(canvas.width!==pw||canvas.height!==ph){ canvas.width=pw; canvas.height=ph; }
    // work in CSS pixels via transform
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {cssW:w, cssH:h, rect};
  }

  function getCourtPos(archeIdx, posLabel, jitterSeed=0){
    const base=ARCH[archeIdx%8];
    const off=POS_OFF[posLabel]||POS_OFF['SF'];
    const jx=((jitterSeed*0.618033)%1 -0.5)*1.2;
    const jy=((jitterSeed*0.314159)%1 -0.5)*1.0;
    return {x:base.x+off.x+jx, y:base.y+off.y+jy, meta:base};
  }

  function buildArc(name){
    const entries=byName.get(name)||[];
    if(entries.length<2) return null;
    const meta=[];
    for(const e of entries){
      const si=seasonIdx.get(e.s); if(si===undefined) continue;
      const key=`${e.n}|${e.s}`;
      const min=minutesMap.get(key);
      const team=teamMap[key]||'—';
      const posLabel=e.pl||POS_LABELS[e.p]||'SF';
      const cp=getCourtPos(e.c, posLabel, si);
      meta.push({season:e.s, si, archeIdx:e.c, archLabel:ARCH[e.c]?.label||`A${e.c}`, team, pl:posLabel, p:e.p, mpg:min?.mpg||0, gp:min?.gp||0, x:cp.x, y:cp.y, off:ARCH[e.c]?.off||50, def:ARCH[e.c]?.def||50, role:ARCH[e.c]?.role||'', desc:ARCH[e.c]?.desc||'', emoji:ARCH[e.c]?.emoji||'', color:ARCH[e.c]?.color||'#1A150F'});
    }
    meta.sort((a,b)=> a.season.localeCompare(b.season));
    const changes=[]; for(let i=1;i<meta.length;i++) if(meta[i].archeIdx!==meta[i-1].archeIdx) changes.push({idx:i, from:meta[i-1], to:meta[i]});
    return {name, meta, changes};
  }

  function careerStage(idx,total){
    const r=idx/Math.max(1,total-1);
    if(r<0.18) return 'Rookie'; if(r<0.35) return 'Breakout'; if(r<0.62) return 'Prime'; if(r<0.84) return 'Veteran'; return 'Late';
  }

  let current=null, tProg=0, paused=true, embedPaused=true, used=new Set(), autoPauseUntil=0, lastChangeIdx=-1, layoutCache=null;

  function ftToScreen(ftX, ftY, L){
    // ftX -25..25, ftY 0..47
    return {x: L.cx + ftX*L.scale, y: L.baseY - ftY*L.scale};
  }

  function drawCourtBg(cssW, cssH, teamAbbr){
    ctx.fillStyle='#FFF6D5'; // light hardwood base
    ctx.fillRect(0,0,cssW,cssH);
    // planks
    ctx.strokeStyle='rgba(26,21,15,0.05)'; ctx.lineWidth=1;
    const plankH=20;
    for(let y=0;y<cssH;y+=plankH){ ctx.beginPath(); ctx.moveTo(0,y+0.5); ctx.lineTo(cssW,y+0.5); ctx.stroke(); }
    // faint team watermark
    if(teamAbbr && teamAbbr!=='—'){
      ctx.save(); ctx.globalAlpha=0.06; ctx.font=`900 ${Math.floor(cssW*0.28)}px ui-sans-serif,system-ui`; ctx.textAlign='center'; ctx.fillStyle='#1A150F';
      ctx.fillText(teamAbbr, cssW/2, cssH*0.32); ctx.restore();
    }
  }

  function makeLayout(cssW, cssH){
    const pad=18;
    const courtH = cssH*0.82;
    const courtW = cssW - pad*2;
    const scaleH = courtH / 49; // 47 ft + margin
    const scaleW = courtW / 52;
    const scale = Math.min(scaleH, scaleW);
    const cx = cssW/2;
    const baseY = cssH*0.90;
    return {cx, baseY, scale, cssW, cssH, pad};
  }

  function drawHalfCourt(L){
    const {cx, baseY, scale, cssW, cssH} = L;
    const bl=ftToScreen(-25,0,L), br=ftToScreen(25,0,L), tr=ftToScreen(25,47,L), tl=ftToScreen(-25,47,L);
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=3; ctx.lineJoin='round';
    ctx.strokeRect(tl.x, tl.y, tr.x-tl.x, bl.y-tl.y);
    // half line
    ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.stroke();
    // paint
    const pL=ftToScreen(-8,0,L), pR=ftToScreen(8,0,L), pT=ftToScreen(8,19,L);
    ctx.fillStyle='rgba(26,21,15,0.07)'; ctx.fillRect(pL.x, pT.y, pR.x-pL.x, pL.y-pT.y);
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.2; ctx.strokeRect(pL.x, pT.y, pR.x-pL.x, pL.y-pT.y);
    // FT circle
    const ftC=ftToScreen(0,19,L); const r6=6*scale;
    ctx.beginPath(); ctx.arc(ftC.x, ftC.y, r6, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([6,6]); ctx.strokeStyle='rgba(26,21,15,0.5)'; ctx.beginPath(); ctx.arc(ftC.x, ftC.y, r6, 0, Math.PI); ctx.stroke(); ctx.setLineDash([]);
    // basket
    const basket=ftToScreen(0,5.25,L);
    const back1=ftToScreen(-3,4,L), back2=ftToScreen(3,4,L);
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(back1.x, back1.y); ctx.lineTo(back2.x, back2.y); ctx.stroke();
    ctx.strokeStyle='#E03A3E'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(basket.x, basket.y, 0.9*scale, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=2;
    // 3pt
    const leftCorner=ftToScreen(-22,0,L), leftElb=ftToScreen(-22,14,L), rightElb=ftToScreen(22,14,L), rightCorner=ftToScreen(22,0,L);
    const r=23.75*scale;
    ctx.beginPath(); ctx.moveTo(leftCorner.x, leftCorner.y); ctx.lineTo(leftElb.x, leftElb.y);
    const angL=Math.atan2(leftElb.y-basket.y, leftElb.x-basket.x), angR=Math.atan2(rightElb.y-basket.y, rightElb.x-basket.x);
    ctx.arc(basket.x, basket.y, r, angL, angR, false);
    ctx.lineTo(rightCorner.x, rightCorner.y); ctx.stroke();
    // restricted
    ctx.beginPath(); ctx.arc(basket.x, basket.y, 4*scale, 0, Math.PI); ctx.stroke();
    // labels
    ctx.fillStyle='#1A150F'; ctx.font=`800 11px ui-monospace,monospace`; ctx.textAlign='center'; ctx.globalAlpha=0.7;
    ctx.fillText('BASELINE • 1 of 15 ROSTER', cx, baseY+14);
    ctx.fillText('HALF-COURT • SHOWS 1 of 5 ON FLOOR', cx, tl.y-10);
    ctx.globalAlpha=1;
  }

  // rendering pipeline
  function requestDraw(){ if(requestDraw._raf) return; requestDraw._raf=requestAnimationFrame(()=>{ requestDraw._raf=null; draw(); }); }

  function draw(){
    if(!current) return;
    const {cssW, cssH}=resize();
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const cur=current.meta[idx];
    drawCourtBg(cssW, cssH, cur.team);
    const L=makeLayout(cssW, cssH);
    layoutCache=L;
    drawHalfCourt(L);

    const allScreen=current.meta.map(m=> ftToScreen(m.x, m.y, L));

    // trail future dashed
    ctx.strokeStyle='rgba(26,21,15,0.18)'; ctx.lineWidth=2; ctx.setLineDash([8,8]);
    ctx.beginPath(); allScreen.forEach((p,i)=>{ if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }); ctx.stroke(); ctx.setLineDash([]);

    // past solid with yellow glow
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=4; ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.beginPath(); for(let i=0;i<=idx;i++){ const p=allScreen[i]; if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); } ctx.stroke();
    ctx.strokeStyle='#F0E442'; ctx.lineWidth=8; ctx.globalAlpha=0.4; ctx.beginPath(); for(let i=0;i<=idx;i++){ const p=allScreen[i]; if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); } ctx.stroke(); ctx.globalAlpha=1;

    // teammates floor unit (top 5)
    const teamKey=`${cur.team}|${cur.season}`;
    const roster=teamSeasonRoster.get(teamKey)||[];
    const top5=roster.slice(0,5);
    let floorUnit=top5;
    const focalInTop=top5.some(r=> r.name===current.name);
    if(!focalInTop && roster.length){
      const focalR=roster.find(r=> r.name===current.name);
      if(focalR) floorUnit=[...top5.slice(0,4), focalR];
    }
    for(const tm of floorUnit){
      if(tm.name===current.name) continue;
      const pos=getCourtPos(tm.c, tm.pl, cur.si+tm.name.length*0.13);
      const s=ftToScreen(pos.x, pos.y, L);
      ctx.fillStyle=ARCH[tm.c%8]?.color||'#fff'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.2;
      ctx.beginPath(); ctx.arc(s.x,s.y, isMobile?16:18,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#1A150F'; ctx.font=`800 ${isMobile?10:11}px ui-monospace,monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(tm.pl, s.x, s.y+1);
      // tiny name
      ctx.font=`700 10px ui-sans-serif,system-ui`; ctx.fillText(tm.name.split(' ').pop().slice(0,6), s.x, s.y+22);
    }

    // nodes
    for(let i=0;i<current.meta.length;i++){
      const p=allScreen[i]; const m=current.meta[i];
      const isCur=i===idx; const isChange=i>0 && m.archeIdx!==current.meta[i-1].archeIdx;
      const rad=isCur?18: isChange?7:4.5;
      if(!isCur){
        ctx.fillStyle=m.color; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(p.x,p.y,rad,0,Math.PI*2); ctx.fill(); ctx.stroke();
        if(isChange){ ctx.strokeStyle='#F0E442'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(p.x,p.y,rad+4,0,Math.PI*2); ctx.stroke(); }
        if(current.meta.length<14 || i%2===0){ ctx.fillStyle='#1A150F'; ctx.font=`700 10px ui-monospace,monospace`; ctx.textAlign='center'; ctx.fillText(m.season.slice(2), p.x, p.y-14); }
      }
    }

    // focal big with pulse
    const curP=allScreen[idx];
    const pulse=1+Math.sin(performance.now()*0.004)*0.06;
    ctx.globalAlpha=0.18; ctx.fillStyle=cur.color; ctx.beginPath(); ctx.arc(curP.x,curP.y,30*pulse,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle='#1A150F'; ctx.beginPath(); ctx.arc(curP.x,curP.y,20,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=cur.color; ctx.beginPath(); ctx.arc(curP.x,curP.y,16,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.5; ctx.stroke();
    ctx.fillStyle='#FFFEF7'; ctx.font=`900 12px ui-monospace,monospace`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(cur.pl, curP.x, curP.y);
    // ball
    ctx.fillStyle='#FF8C00'; ctx.beginPath(); ctx.arc(curP.x+18, curP.y-18,5,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#1A150F'; ctx.lineWidth=1.5; ctx.stroke();

    // shift badge
    const change=current.changes.find(c=> c.idx===idx);
    if(change){
      const txt=`${change.from.archLabel} → ${change.to.archLabel}`;
      ctx.font=`900 13px ui-monospace,monospace`; const tw=ctx.measureText(txt).width; const bw=tw+28, bh=28;
      const bx=curP.x-bw/2, by=curP.y-58;
      ctx.fillStyle='#F0E442'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.5;
      ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(bx,by,bw,bh,12); else { ctx.rect(bx,by,bw,bh); } ctx.fill(); ctx.stroke();
      ctx.fillStyle='#1A150F'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt, curP.x, by+bh/2);
    }

    renderFocus();
  }

  function sparkline(values, w=220, h=38, color='#1A150F'){
    if(!values.length) return '';
    const min=Math.min(...values), max=Math.max(...values), rng=Math.max(0.001, max-min);
    const pts=values.map((v,i)=>{ const x=(i/(values.length-1))*w; const y=h-((v-min)/rng)*h; return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block"><polyline fill="none" stroke="${color}" stroke-width="2.6" points="${pts}" stroke-linejoin="round" stroke-linecap="round"/><polygon fill="${color}" opacity="0.14" points="0,${h} ${pts} ${w},${h}"/></svg>`;
  }

  function renderFocus(){
    if(!current) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const m=current.meta[idx];
    if(renderFocus._lastIdx!==idx){ renderFocus._lastIdx=idx; renderTimeline(); }
    const teamKey=`${m.team}|${m.season}`;
    const roster=teamSeasonRoster.get(teamKey)||[];
    const rankIdx=roster.findIndex(r=> r.name===current.name);
    const rank=rankIdx>=0? rankIdx+1:null;
    const total=roster.length||15;
    const isStarter=rank!==null && rank<=5;
    const stage=careerStage(idx, current.meta.length);
    const change=current.changes.find(c=> c.idx===idx);

    // headline
    focusEl.innerHTML=`
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <div class="ux-card" style="padding:10px 14px;display:flex;gap:10px;align-items:center">
          <div style="width:44px;height:44px;border-radius:999px;background:${m.color};border:3px solid #1A150F;display:flex;align-items:center;justify-content:center;font-weight:900;font-family:ui-monospace,monospace;color:${m.color==='#111111'?'#FFFEF7':'#1A150F'}">${m.pl}</div>
          <div>
            <div class="ux-title">${current.name} • ${m.team} ${m.season} • ${stage}</div>
            <div class="ux-mono">${m.archLabel} ${m.emoji} • ${m.role} • ${m.gp} GP • ${m.mpg.toFixed(1)} MPG</div>
          </div>
        </div>
        <span class="pill ${isStarter?'pill-yellow':'pill-dark'}" style="font-size:13px;padding:10px 16px">${isStarter?`1 of 5 on floor — starter #${rank}`:`1 of 15 — bench #${rank||'?'} of ${total} (1 of 5 when in)`}</span>
        <span class="pill" style="background:${m.color};color:#1A150F">O ${m.off} • D ${m.def}</span>
        ${change? `<span class="pill pill-yellow">SHIFT ${change.from.archLabel} → ${change.to.archLabel}</span>`:''}
      </div>
    `;
    metaEl.innerHTML=`
      <div style="background:#ECE7DB;border:3px solid #1A150F;border-radius:14px;padding:12px 14px;font-family:ui-sans-serif,system-ui;font-size:15px;line-height:1.5;font-weight:600;color:#1A150F">
        <span style="font-weight:900">Court = fit.</span> You’re plotted where a <b>${m.archLabel}</b> ${m.pl} lives (${m.desc}). Teammates on floor show your 5-man spacing — bench list shows 1-of-15. Offense ${m.off} ${m.off>=70?'↗ high':'↘ low'} / Defense ${m.def} ${m.def>=70?'↗ anchor':''}. Tap any teammate dot or season chip to move. No one plays alone.
      </div>
    `;

    // main cards
    const offVals=current.meta.map(x=> x.off), defVals=current.meta.map(x=> x.def), mpgVals=current.meta.map(x=> x.mpg);
    const offDelta=offVals.length? offVals[offVals.length-1]-offVals[0]:0;
    const defDelta=defVals.length? defVals[defVals.length-1]-defVals[0]:0;
    const sortedRoster=[...roster].slice(0,15);

    quadEl.innerHTML=`
      <div style="display:grid;grid-template-columns:${isMobile?'1fr':'1.2fr .8fr'};gap:16px">
        <div class="ux-card">
          <div class="ux-mono" style="margin-bottom:8px">${m.team} ${m.season} — full roster ${total} sorted by MPG — you #${rank||'?'} • 1 of 15</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${sortedRoster.map(r=> `<span class="roster-chip ${r.name===current.name?'is-focal':''}" title="${r.name} ${r.pl} ${r.mpg.toFixed(1)} MPG"><span style="width:10px;height:10px;border-radius:999px;background:${ARCH[r.c%8]?.color};border:1.5px solid #1A150F;display:inline-block"></span> ${r.name.split(' ').pop()} ${r.pl} ${(r.mpg||0).toFixed(0)}</span>`).join('') || '<span style="font-size:13px;opacity:.6">No roster for this season — showing league avg.</span>'}
          </div>
          <div class="ux-mono" style="margin-top:10px">Big circles on court = current 5-man unit (by MPG). Tap court circles = see fit. Small pills = bench, 1 of 15.</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="ux-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span class="ux-mono">Offense evolution</span><span class="pill" style="font-size:11px">${offVals[0]} → ${offVals[offVals.length-1]} ${offDelta>=0?`+${offDelta}`:offDelta}</span></div>
            ${sparkline(offVals, isMobile? 300:320, 52, '#D55E00')}
            <div class="ux-mono" style="margin-top:6px">higher = more perimeter shot volume + usage. Your ${m.archLabel} = ${m.off}</div>
          </div>
          <div class="ux-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span class="ux-mono">Defense evolution</span><span class="pill" style="font-size:11px">${defVals[0]} → ${defVals[defVals.length-1]} ${defDelta>=0?`+${defDelta}`:defDelta}</span></div>
            ${sparkline(defVals, isMobile? 300:320, 52, '#0072B2')}
            <div class="ux-mono" style="margin-top:6px">rim + glass impact. Your ${m.archLabel} = ${m.def}</div>
          </div>
          <div class="ux-card" style="background:#1A150F;color:#FFFEF7">
            <div class="ux-mono" style="color:#F0E442;opacity:1">Story • 1 of 5 / 1 of 15</div>
            <div style="font-family:ui-sans-serif,system-ui;font-size:14px;line-height:1.6;margin-top:6px;font-weight:600">${current.name} ${current.meta[0].season} → ${current.meta[current.meta.length-1].season}: ${current.meta[0].archLabel} → ${current.meta[current.meta.length-1].archLabel}. ${offDelta>10?'Moved out to arc over time.': offDelta<-10?'Grinded inside later.':'Kept similar offensive shape.'} ${isStarter?`Started as ${m.role}, logged ${m.mpg.toFixed(1)} MPG as 1 of 5.`:`Played as #${rank} of ${total}, ${m.mpg.toFixed(1)} MPG — rotation glue, 1 of 15.`} Never solo — 5-on-5 fit.</div>
          </div>
        </div>
      </div>
    `;

    if(scrubFill){ scrubFill.style.width=`${(tProg*100).toFixed(1)}%`; }
    if(scrubThumb){ scrubThumb.style.left=`${(tProg*100).toFixed(1)}%`; }
  }
  renderFocus._lastIdx=-1;

  function renderTimeline(){
    if(!current) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    timelineH.innerHTML='';
    current.meta.forEach((m,i)=>{
      const chip=document.createElement('div');
      chip.className='drift-tm-chip '+(i===idx?'filled': i<idx?'outline-past':'outline-future');
      chip.innerHTML=`<span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${m.color};border:1.5px solid #1A150F;margin-right:6px;vertical-align:middle"></span>${m.season} ${m.team} ${m.archLabel} ${m.pl} • ${m.mpg.toFixed(0)} MPG`;
      chip.onclick=()=>{ tProg=i/current.meta.length; embedPaused=false; paused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; requestDraw(); };
      timelineH.appendChild(chip);
    });
    const cur=timelineH.children[idx]; if(cur) cur.scrollIntoView({block:'nearest', inline:'center', behavior:'smooth'});
  }

  function buildArcWrapper(name){
    const arc=buildArc(name);
    if(!arc){ const fb=pool[0]||allNames[0]; if(fb && fb!==name) return buildArcWrapper(fb); return null; }
    return arc;
  }

  function show(name){
    const arc=buildArcWrapper(name);
    if(!arc) return;
    current=arc; tProg=0; lastChangeIdx=-1; used.add(name);
    if(searchInput) searchInput.value=name;
    renderTimeline(); requestDraw();
  }

  // search
  function renderSearchResults(q){
    if(!q||q.length<1){ searchResults.style.display='none'; return; }
    const lower=q.toLowerCase();
    const matches=allNames.filter(n=> n.toLowerCase().includes(lower)).slice(0,30).map(n=>({n, len:byName.get(n)?.length||0})).sort((a,b)=>{ const ap=a.n.toLowerCase().startsWith(lower), bp=b.n.toLowerCase().startsWith(lower); if(ap!==bp) return bp-ap; return b.len-a.len; }).slice(0,12);
    if(!matches.length){ searchResults.innerHTML=`<div class="drift-sresult" style="opacity:.6">No match</div>`; searchResults.style.display='block'; return; }
    searchResults.innerHTML=matches.map(m=> `<div class="drift-sresult" data-name="${m.n.replace(/"/g,'&quot;')}"><span>${m.n}</span><small>${m.len} seasons</small></div>`).join('');
    searchResults.style.display='block';
    [...searchResults.querySelectorAll('.drift-sresult')].forEach(el=> el.addEventListener('click',()=>{ const nm=el.getAttribute('data-name'); searchResults.style.display='none'; if(nm) show(nm); }));
  }
  if(searchInput){
    searchInput.addEventListener('input', e=> renderSearchResults(e.target.value.trim()));
    searchInput.addEventListener('focus', e=> renderSearchResults(e.target.value.trim()));
    searchInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const q=e.target.value.trim(); const exact=allNames.find(n=> n.toLowerCase()===q.toLowerCase())||allNames.find(n=> n.toLowerCase().includes(q.toLowerCase())); if(exact){ searchResults.style.display='none'; show(exact);} } if(e.key==='Escape') searchResults.style.display='none'; });
    document.addEventListener('click', e=>{ if(!searchInput.contains(e.target)&&!searchResults.contains(e.target)) searchResults.style.display='none'; });
  }
  if(randomBtn) randomBtn.addEventListener('click',()=>{ let cands=allNames.filter(n=> !used.has(n)&&(byName.get(n)?.length||0)>=3); if(cands.length<30){ used.clear(); cands=allNames.filter(n=> (byName.get(n)?.length||0)>=3); } const pick=cands[Math.floor(Math.random()*cands.length)]||pool[Math.floor(Math.random()*pool.length)]; show(pick); });

  canvas.addEventListener('click', (e)=>{
    if(!current||!layoutCache) return;
    const rect=canvas.getBoundingClientRect();
    const x=(e.clientX-rect.left), y=(e.clientY-rect.top);
    const pts=current.meta.map(m=> ftToScreen(m.x,m.y, layoutCache));
    let best=-1, bestD=Infinity;
    pts.forEach((p,i)=>{ const d=(p.x-x)**2+(p.y-y)**2; if(d<bestD){ bestD=d; best=i; } });
    if(best>=0 && bestD< (40*40)){ tProg=best/current.meta.length; requestDraw(); }
  });

  if(scrub){
    let dragging=false;
    const setFromX=xx=>{ const r=scrub.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(xx-r.left)/r.width)); tProg=p; requestDraw(); };
    scrub.addEventListener('pointerdown',e=>{ dragging=true; try{scrub.setPointerCapture(e.pointerId);}catch{} setFromX(e.clientX); paused=true; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; });
    scrub.addEventListener('pointermove', e=>{ if(dragging) setFromX(e.clientX); });
    scrub.addEventListener('pointerup',()=>{ dragging=false; });
    scrub.addEventListener('click', e=> setFromX(e.clientX));
  }
  if(btnPlay) btnPlay.addEventListener('click',()=>{ if(paused||embedPaused){ paused=false; embedPaused=false; btnPlay.textContent='❚❚ Pause'; } else { paused=true; embedPaused=true; btnPlay.textContent='▶ Play story'; } });
  if(btnNext) btnNext.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx+1;j<current.meta.length;j++) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; requestDraw(); return; } tProg=1; requestDraw(); });
  if(btnPrev) btnPrev.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx-1;j>=1;j--) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; requestDraw(); return; } tProg=0; requestDraw(); });

  window.addEventListener('vh:pause-maps',()=>{ embedPaused=true; paused=true; if(btnPlay) btnPlay.textContent='▶ Play story'; });

  const ro=new ResizeObserver(()=> requestDraw()); ro.observe(canvas);
  let visible=true; const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; if(visible) requestDraw(); },{threshold:0.02}); io.observe(canvas);

  function tick(){
    requestAnimationFrame(tick);
    if(embedPaused) return;
    if(!visible) return;
    const now=performance.now();
    if(!paused && now>autoPauseUntil){ tProg+=0.00028; if(tProg>1) tProg=0; requestDraw(); }
  }
  tick();

  const initial=pool.find(n=> allNames.includes(n))||'LeBron James';
  show(allNames.includes(initial)? initial: pool[0]||allNames[0]);

  return {show, dispose:()=>{ ro.disconnect(); io.disconnect(); }};
}
