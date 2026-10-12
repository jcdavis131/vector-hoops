/* drift-void.js v32 — centered hero, beautiful career + skills story • top nav preserved */
export async function mountDriftVoid(canvas){
  if(!canvas) return;
  const isMobile = window.innerWidth < 760;
  const dpr = Math.min(window.devicePixelRatio||1, 1.8);

  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#111111'];
  const ARCH=[
    { i:0, label:'Glass+Rim', off:32, def:92, x:-2, y:11, role:'Rim Anchor', desc:'Crash glass, own paint', emoji:'🛡️', color:OKABE[0]},
    { i:1, label:'LowVol Glass', off:22, def:88, x:-4, y:13, role:'Energy Big', desc:'Putbacks + hustle', emoji:'🔋', color:OKABE[1]},
    { i:2, label:'Low Impact', off:24, def:28, x:6, y:19, role:'Deep Reserve', desc:'End of bench', emoji:'🪑', color:OKABE[2]},
    { i:3, label:'Def Glass FT', off:46, def:71, x:-1, y:14, role:'Two-Way Big', desc:'Draws FTs', emoji:'⚖️', color:OKABE[3]},
    { i:4, label:'Vol+3P', off:88, def:34, x:16, y:24, role:'Volume Scorer', desc:'High usage creator', emoji:'🔥', color:OKABE[4]},
    { i:5, label:'3P Acc+Vol', off:84, def:38, x:19, y:21, role:'Floor Spacer', desc:'Gravity beyond arc', emoji:'🎯', color:OKABE[5]},
    { i:6, label:'Playmaking', off:76, def:66, x:-8, y:28, role:'Lead Playmaker', desc:'QB + pickpocket', emoji:'🧠', color:OKABE[6]},
    { i:7, label:'Scoring Vol', off:91, def:40, x:8, y:26, role:'Bucket Getter', desc:'Buckets anywhere', emoji:'🪣', color:OKABE[7]},
  ];
  const POS_LABELS=['PG','SG','SF','PF','C'];
  const POS_OFF={PG:{x:-7,y:6},SG:{x:7,y:5},SF:{x:10,y:2},PF:{x:2,y:-2},C:{x:0,y:-4}};
  const CACHE='vector-hoops-v34-20260721-drift-clean';
  async function cachedFetchJSON(url){
    try{ if('caches' in window){ const c=await caches.open(CACHE); const hit=await c.match(url); if(hit) return await hit.json(); } }catch{}
    const r=await fetch(url,{cache:'default'});
    try{ if('caches' in window){ const c=await caches.open(CACHE); c.put(url, r.clone()).catch(()=>{}); } }catch{}
    return r.json();
  }
  let timeData, liteData, vecData, teamData, skillsData;
  try{
    const [tData, lPos, vData, tmData, sData] = await Promise.all([
      cachedFetchJSON('assets/archetypes_time.json?v=34'),
      cachedFetchJSON('assets/vectors_search_lite_pos.json?v=34').catch(()=>cachedFetchJSON('assets/vectors_search_lite.json?v=34')),
      cachedFetchJSON('assets/vectors.json?v=34').catch(()=>null),
      cachedFetchJSON('assets/player_team_season.json?v=34').catch(()=>null),
      cachedFetchJSON('assets/skills.json?v=34').catch(()=>null),
    ]);
    timeData=tData; liteData=lPos; vecData=vData; teamData=tmData; skillsData=sData;
  }catch(e){ console.warn('court v32 fail',e); return; }

  const seasons=timeData?.prevalence||[];
  const seasonIdx=new Map(seasons.map((s,i)=>[s.season,i]));
  const tmpPlayers=liteData?.players||liteData||[];
  const byName=new Map(); const playerSeasonLookup=new Map();
  for(const p of tmpPlayers){ if(!byName.has(p.n)) byName.set(p.n,[]); byName.get(p.n).push(p); playerSeasonLookup.set(`${p.n}|${p.s}`, p); }
  for(const arr of byName.values()) arr.sort((a,b)=> (a.s||'').localeCompare(b.s||''));
  const minutesMap=new Map();
  if(vecData?.players){ for(const p of vecData.players) minutesMap.set(`${p.name}|${p.season}`, {gp:p.gp||0, mpg:p.mpg||0}); }
  let skillsByKey=new Map();
  if(skillsData && vecData){ for(let i=0;i<vecData.players.length;i++){ const pl=vecData.players[i]; skillsByKey.set(`${pl.name}|${pl.season}`, skillsData.grades[i]); } }
  const teamMap=teamData||{};
  const teamSeasonRoster=new Map();
  for(const key of Object.keys(teamMap)){
    const sep=key.lastIndexOf('|'); if(sep<0) continue;
    const name=key.slice(0,sep); const season=key.slice(sep+1); const team=teamMap[key];
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

  const root=document.getElementById('lemmino-drift');
  if(root){
    // v33 FIX: remove legacy index.html chrome that was causing the overlap in screenshot
    try{
      const legacyStack = root.querySelector('#drift-info-stack');
      if(legacyStack) legacyStack.remove();
      const legacyScrubWrap = root.querySelector('#drift-scrub-wrap');
      if(legacyScrubWrap) legacyScrubWrap.remove();
      // also kill any stray old controls directly under root (id drift-scrub, etc) before we create new ones
      root.querySelectorAll(':scope > #drift-scrub, :scope > #lemmino-drift-focus, :scope > #lemmino-drift-meta, :scope > #drift-info-stack, :scope > .drift-scrub').forEach(el=>el.remove());
      // hide any remaining old meta lingering via CSS selector
      document.querySelectorAll('#lemmino-drift-focus, #lemmino-drift-meta').forEach(el=>{
        if(el.closest('#drift-info-stack')) return;
        if(el.id==='lemmino-drift-focus' && el.parentElement && el.parentElement.id==='drift-info-stack') return;
        // if it's inside new wrapper keep, else remove
        if(!el.closest('#drift-canvas-wrap-v26') && !el.closest('#drift-header-v26')) el.remove();
      });
    }catch(e){ console.warn('legacy cleanup',e); }

    root.style.background='#ECE7DB';
    root.style.display='flex';
    root.style.flexDirection='column';
    root.style.alignItems='center';
    root.style.padding='24px 0 36px';
    root.style.borderTop='3px solid #1A150F';
    root.style.borderBottom='3px solid #1A150F';
  }
  let header=document.getElementById('drift-header-v26');
  if(!header){ header=document.createElement('div'); header.id='drift-header-v26'; root.prepend(header); }
  header.style.cssText='width:100%;max-width:1180px;margin:0 auto 18px;padding:0 18px;display:flex;flex-direction:column;gap:14px';
  header.innerHTML=`
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;justify-content:space-between">
      <div style="max-width:640px">
        <div style="display:inline-flex;gap:8px;align-items:center;background:#1A150F;color:#FFFEF7;border-radius:999px;padding:8px 14px;font-family:ui-monospace,monospace;font-size:11px;font-weight:900;letter-spacing:.1em"><span style="width:8px;height:8px;border-radius:999px;background:#F0E442;display:inline-block"></span> #2 CAREER FLOOR • CENTERED HERO • 1 OF 5 / 1 OF 15</div>
        <h2 style="font-family:'Architects Daughter',ui-monospace,monospace;font-size:clamp(30px,4.8vw,48px);line-height:.95;letter-spacing:-.03em;margin:12px 0 8px;color:#1A150F">Where you stood,<br>how you grew.</h2>
        <p style="font-family:ui-sans-serif,system-ui;font-size:15px;line-height:1.55;color:#3A332A;margin:0">Paint → arc = offensive evolution. Skills sparklines = real 0-99 grades era-normalized. Roster = real MPG sort. This is now the hero viz on every player card.</p>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;position:relative">
        <div style="position:relative">
          <input id="drift-player-search" placeholder="Search 2,293 players…" autocomplete="off" style="min-width:300px;width:380px;max-width:84vw;height:56px;border:3px solid #1A150F;border-radius:16px;padding:0 16px 0 44px;font-family:ui-monospace,monospace;font-weight:800;font-size:15px;background:#fff;box-shadow:5px 5px 0 #1A150F;outline:none"/>
          <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:20px">🔍</span>
          <div id="drift-search-results" style="position:absolute;left:0;top:62px;width:100%;max-height:400px;overflow:auto;background:#FFFEF7;border:3px solid #1A150F;border-radius:16px;box-shadow:8px 8px 0 #1A150F;display:none;z-index:30"></div>
        </div>
        <button id="drift-random" type="button" style="min-height:56px;padding:0 20px;border:3px solid #1A150F;border-radius:16px;background:#F0E442;font-family:ui-monospace,monospace;font-weight:900;font-size:14px;box-shadow:5px 5px 0 #1A150F;cursor:pointer">🎲 Random</button>
      </div>
    </div>`;

  const existingCanvas=document.getElementById('lemmino-drift-canvas');
  let wrap=document.getElementById('drift-canvas-wrap-v26');
  if(!wrap){ wrap=document.createElement('div'); wrap.id='drift-canvas-wrap-v26'; existingCanvas.parentNode.insertBefore(wrap, existingCanvas); wrap.appendChild(existingCanvas); }
  wrap.style.cssText='position:relative;width:100%;max-width:1180px;margin:0 auto;background:#FFFEF7;display:flex;flex-direction:column;border:3px solid #1A150F;border-radius:22px;overflow:hidden;box-shadow:10px 10px 0 #1A150F';
  existingCanvas.style.width='100%';
  existingCanvas.style.height=isMobile?'78vh':'88vh';
  existingCanvas.style.minHeight=isMobile?'640px':'860px';
  existingCanvas.style.display='block';
  existingCanvas.style.background='#FFFEF7';

  let focusWrap=document.getElementById('drift-focus-v26');
  if(!focusWrap){ focusWrap=document.createElement('div'); focusWrap.id='drift-focus-v26'; wrap.prepend(focusWrap); }
  focusWrap.style.cssText='padding:18px 20px;background:#FFFEF7;border-bottom:3px solid #1A150F;display:flex;flex-direction:column;gap:12px';

  let controls=document.getElementById('drift-controls-v26');
  if(!controls){ controls=document.createElement('div'); controls.id='drift-controls-v26'; wrap.appendChild(controls); }
  controls.style.cssText='display:flex;gap:10px;align-items:center;padding:14px 18px;background:#1A150F;flex-wrap:wrap';
  controls.innerHTML=`
    <button id="drift-prev" style="min-width:56px;min-height:52px;border:3px solid #FFFEF7;border-radius:999px;background:#FFFEF7;font-weight:900;font-family:ui-monospace,monospace;cursor:pointer">⟵</button>
    <button id="drift-play" style="min-width:130px;min-height:52px;border:3px solid #FFFEF7;border-radius:999px;background:#F0E442;font-weight:900;font-family:ui-monospace,monospace;cursor:pointer">▶ Play career</button>
    <button id="drift-next" style="min-width:56px;min-height:52px;border:3px solid #FFFEF7;border-radius:999px;background:#FFFEF7;font-weight:900;font-family:ui-monospace,monospace;cursor:pointer">⟶</button>
    <div id="drift-scrub" style="flex:1;min-width:180px;height:30px;background:rgba(255,254,247,.14);border:2.5px solid #FFFEF7;border-radius:999px;position:relative;cursor:pointer"><div id="drift-scrub-fill" style="position:absolute;left:0;top:0;bottom:0;width:0%;background:#F0E442;border-radius:999px"></div><div id="drift-scrub-thumb" style="position:absolute;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:999px;background:#FFFEF7;border:3px solid #1A150F;left:0"></div></div>
    <span style="font-family:ui-monospace,monospace;font-size:11px;color:#FFFEF7;opacity:.7">tap court • drag • centered hero</span>
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
  timelineH.style.cssText=`display:flex;gap:10px;overflow-x:auto;padding:16px 18px;background:#FFFEF7;border:3px solid #1A150F;border-radius:16px;box-shadow:6px 6px 0 #1A150F;width:100%;max-width:1180px;margin:18px auto 0`;

  let quadEl=document.getElementById('drift-quad');
  if(!quadEl){ quadEl=document.createElement('div'); quadEl.id='drift-quad'; root.appendChild(quadEl); }
  quadEl.style.cssText=`background:transparent;padding:0;width:100%;max-width:1180px;margin:18px auto 0;display:flex;flex-direction:column;gap:18px`;

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
    .roster-chip{border:2.5px solid #1A150F;border-radius:999px;padding:8px 12px;font-family:ui-monospace,monospace;font-size:12px;font-weight:800;display:inline-flex;align-items:center;gap:6px;background:#fff;box-shadow:2px 2px 0 #1A150F}
    .roster-chip.is-focal{background:#1A150F;color:#FFFEF7;box-shadow:3px 3px 0 #1A150F}
    .pill{border-radius:999px;padding:8px 14px;font-family:ui-monospace,monospace;font-size:12px;font-weight:900;border:2.5px solid #1A150F;display:inline-flex;align-items:center;gap:6px;background:#fff}
    .pill-dark{background:#1A150F;color:#FFFEF7}
    .pill-yellow{background:#F0E442;color:#1A150F}
  `;
  document.head.appendChild(styleEl);

  const ctx=canvas.getContext('2d',{alpha:false});
  function resize(){ const rect=canvas.getBoundingClientRect(); const w=Math.max(360,Math.floor(rect.width)); const h=Math.max(520,Math.floor(rect.height)); const pw=Math.floor(w*dpr), ph=Math.floor(h*dpr); if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw; canvas.height=ph;} ctx.setTransform(dpr,0,0,dpr,0,0); return {cssW:w, cssH:h}; }
  function getCourtPos(a,pos,seed=0){ const base=ARCH[a%8]; const off=POS_OFF[pos]||POS_OFF['SF']; const jx=((seed*0.618033)%1-0.5)*1.2; const jy=((seed*0.314159)%1-0.5)*1.0; return {x:base.x+off.x+jx, y:base.y+off.y+jy, meta:base}; }
  function buildArc(name){
    const entries=byName.get(name)||[]; if(entries.length<2) return null;
    const meta=[]; for(const e of entries){ const si=seasonIdx.get(e.s); if(si===undefined) continue; const key=`${e.n}|${e.s}`; const min=minutesMap.get(key); const team=teamMap[key]||'—'; const posLabel=e.pl||POS_LABELS[e.p]||'SF'; const cp=getCourtPos(e.c,posLabel,si); const skillGrades=skillsByKey.get(key)||null; meta.push({season:e.s, si, archeIdx:e.c, archLabel:ARCH[e.c]?.label||`A${e.c}`, team, pl:posLabel, mpg:min?.mpg||0, gp:min?.gp||0, x:cp.x, y:cp.y, off:ARCH[e.c]?.off||50, def:ARCH[e.c]?.def||50, role:ARCH[e.c]?.role||'', desc:ARCH[e.c]?.desc||'', emoji:ARCH[e.c]?.emoji||'', color:ARCH[e.c]?.color||'#1A150F', skillGrades}); }
    meta.sort((a,b)=> a.season.localeCompare(b.season)); const changes=[]; for(let i=1;i<meta.length;i++) if(meta[i].archeIdx!==meta[i-1].archeIdx) changes.push({idx:i, from:meta[i-1], to:meta[i]}); return {name, meta, changes};
  }
  function careerStage(idx,total){ const r=idx/Math.max(1,total-1); if(r<0.18) return 'Rookie'; if(r<0.35) return 'Breakout'; if(r<0.62) return 'Prime'; if(r<0.84) return 'Veteran'; return 'Late'; }
  let current=null, tProg=0, paused=true, embedPaused=true, used=new Set(), layoutCache=null;
  function ftToScreen(ftX,ftY,L){ return {x:L.cx+ftX*L.scale, y:L.baseY-ftY*L.scale}; }
  function drawCourtBg(cssW,cssH,teamAbbr){ ctx.fillStyle='#FFF6D5'; ctx.fillRect(0,0,cssW,cssH); ctx.strokeStyle='rgba(26,21,15,0.05)'; ctx.lineWidth=1; for(let y=0;y<cssH;y+=20){ ctx.beginPath(); ctx.moveTo(0,y+0.5); ctx.lineTo(cssW,y+0.5); ctx.stroke(); } if(teamAbbr && teamAbbr!=='—'){ ctx.save(); ctx.globalAlpha=0.06; ctx.font=`900 ${Math.floor(cssW*0.26)}px ui-sans-serif,system-ui`; ctx.textAlign='center'; ctx.fillStyle='#1A150F'; ctx.fillText(teamAbbr, cssW/2, cssH*0.30); ctx.restore(); } }
  function makeLayout(cssW,cssH){ const pad=22; const courtH=cssH*0.86; const courtW=cssW-pad*2; const scale=Math.min(courtH/50, courtW/54); const cx=cssW/2; const baseY=cssH*0.90; return {cx,baseY,scale,cssW,cssH}; }
  function drawHalfCourt(L){ const {cx,baseY,scale}=L; const bl=ftToScreen(-25,0,L), tr=ftToScreen(25,47,L), tl=ftToScreen(-25,47,L); ctx.strokeStyle='#1A150F'; ctx.lineWidth=3.2; ctx.strokeRect(tl.x, tl.y, tr.x-tl.x, bl.y-tl.y); ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.stroke(); const pL=ftToScreen(-8,0,L), pR=ftToScreen(8,0,L), pT=ftToScreen(8,19,L); ctx.fillStyle='rgba(26,21,15,0.07)'; ctx.fillRect(pL.x, pT.y, pR.x-pL.x, pL.y-pT.y); ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.4; ctx.strokeRect(pL.x, pT.y, pR.x-pL.x, pL.y-pT.y); const ftC=ftToScreen(0,19,L); const r6=6*scale; ctx.beginPath(); ctx.arc(ftC.x, ftC.y, r6,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([7,7]); ctx.strokeStyle='rgba(26,21,15,0.45)'; ctx.beginPath(); ctx.arc(ftC.x, ftC.y, r6,0,Math.PI); ctx.stroke(); ctx.setLineDash([]); const basket=ftToScreen(0,5.25,L); const back1=ftToScreen(-3,4,L), back2=ftToScreen(3,4,L); ctx.strokeStyle='#1A150F'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(back1.x, back1.y); ctx.lineTo(back2.x, back2.y); ctx.stroke(); ctx.strokeStyle='#E03A3E'; ctx.lineWidth=2.6; ctx.beginPath(); ctx.arc(basket.x, basket.y, 0.9*scale,0,Math.PI*2); ctx.stroke(); const leftCorner=ftToScreen(-22,0,L), leftElb=ftToScreen(-22,14,L), rightElb=ftToScreen(22,14,L), rightCorner=ftToScreen(22,0,L); const r=23.75*scale; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.2; ctx.beginPath(); ctx.moveTo(leftCorner.x, leftCorner.y); ctx.lineTo(leftElb.x, leftElb.y); const angL=Math.atan2(leftElb.y-basket.y, leftElb.x-basket.x), angR=Math.atan2(rightElb.y-basket.y, rightElb.x-basket.x); ctx.arc(basket.x, basket.y, r, angL, angR, false); ctx.lineTo(rightCorner.x, rightCorner.y); ctx.stroke(); ctx.beginPath(); ctx.arc(basket.x, basket.y, 4*scale,0,Math.PI); ctx.stroke(); ctx.fillStyle='#1A150F'; ctx.globalAlpha=0.65; ctx.font=`800 11px ui-monospace,monospace`; ctx.textAlign='center'; ctx.fillText('BASELINE — 15 ROSTER', cx, baseY+16); ctx.fillText('HALF-COURT — 5 ON FLOOR', cx, tl.y-12); ctx.globalAlpha=1; }
  function requestDraw(){ if(requestDraw._raf) return; requestDraw._raf=requestAnimationFrame(()=>{ requestDraw._raf=null; draw(); }); }
  function sparkline(values,w=260,h=44,color='#1A150F'){ if(!values.length) return ''; const min=Math.min(...values), max=Math.max(...values), rng=Math.max(0.001,max-min); const pts=values.map((v,i)=>{ const x=(i/(values.length-1))*w; const y=h-((v-min)/rng)*h; return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' '); return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block"><polyline fill="none" stroke="${color}" stroke-width="2.8" points="${pts}" stroke-linejoin="round" stroke-linecap="round"/><polygon fill="${color}" opacity="0.14" points="0,${h} ${pts} ${w},${h}"/></svg>`; }
  function buildNarrative(){ if(!current) return ''; const first=current.meta[0], last=current.meta[current.meta.length-1]; const teams=[...new Set(current.meta.map(m=> m.team))].filter(t=> t!=='—'); const offVals=current.meta.map(x=> x.off), defVals=current.meta.map(x=> x.def); const offDelta=offVals[offVals.length-1]-offVals[0], defDelta=defVals[defVals.length-1]-defVals[0]; let skillGrowth=''; if(first.skillGrades && last.skillGrades){ let bestIdx=-1, bestD=-999; for(let j=0;j<last.skillGrades.length;j++){ const d=last.skillGrades[j]-first.skillGrades[j]; if(d>bestD){bestD=d; bestIdx=j;}} if(bestIdx>=0 && bestD>6){ const labels=skillsData?.skills||[]; skillGrowth+=` Added ${labels[bestIdx]?.label||'skill'} ${first.skillGrades[bestIdx]}→${last.skillGrades[bestIdx]} (+${bestD}).`; } } const teamTxt=teams.length<=3? teams.join(', ') : `${teams.slice(0,3).join(', ')} +${teams.length-3} more`; return `${current.name} — ${current.meta.length} seasons (${first.season}–${last.season}) • ${teams.length} teams: ${teamTxt}. Entered as ${first.archLabel} (${first.team} ${first.season}) → ${last.archLabel} (${last.team} ${last.season}). Off ${first.off}→${last.off} (${offDelta>=0?'+':''}${offDelta}) ${offDelta>10?'→ arc':'<— paint'}, Def ${first.def}→${last.def} (${defDelta>=0?'+':''}${defDelta}).${skillGrowth} Always 1 of 15, fighting to be 1 of 5.`; }
  function draw(){
    if(!current) return;
    const {cssW,cssH}=resize();
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const cur=current.meta[idx];
    drawCourtBg(cssW,cssH,cur.team);
    const L=makeLayout(cssW,cssH); layoutCache=L; drawHalfCourt(L);
    const allScreen=current.meta.map(m=> ftToScreen(m.x,m.y,L));
    ctx.strokeStyle='rgba(26,21,15,0.18)'; ctx.lineWidth=2; ctx.setLineDash([9,9]); ctx.beginPath(); allScreen.forEach((p,i)=>{ if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=4.5; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath(); for(let i=0;i<=idx;i++){ const p=allScreen[i]; if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); } ctx.stroke();
    ctx.strokeStyle='#F0E442'; ctx.lineWidth=9; ctx.globalAlpha=0.42; ctx.beginPath(); for(let i=0;i<=idx;i++){ const p=allScreen[i]; if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); } ctx.stroke(); ctx.globalAlpha=1;
    const teamKey=`${cur.team}|${cur.season}`; const roster=teamSeasonRoster.get(teamKey)||[]; const top5=roster.slice(0,5); let floorUnit=top5; if(!top5.some(r=> r.name===current.name) && roster.length){ const focalR=roster.find(r=> r.name===current.name); if(focalR) floorUnit=[...top5.slice(0,4), focalR]; }
    for(const tm of floorUnit){ if(tm.name===current.name) continue; const pos=getCourtPos(tm.c,tm.pl,cur.si+tm.name.length*0.13); const s=ftToScreen(pos.x,pos.y,L); ctx.fillStyle=ARCH[tm.c%8]?.color||'#fff'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.4; ctx.beginPath(); ctx.arc(s.x,s.y,isMobile?18:20,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle='#1A150F'; ctx.font=`800 12px ui-monospace,monospace`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(tm.pl, s.x, s.y+1); }
    for(let i=0;i<current.meta.length;i++){ const p=allScreen[i]; const m=current.meta[i]; const isCur=i===idx; if(isCur) continue; const isChange=i>0 && m.archeIdx!==current.meta[i-1].archeIdx; const rad=isChange?8:5; ctx.fillStyle=m.color; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(p.x,p.y,rad,0,Math.PI*2); ctx.fill(); ctx.stroke(); if(isChange){ ctx.strokeStyle='#F0E442'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(p.x,p.y,rad+5,0,Math.PI*2); ctx.stroke(); } }
    const curP=allScreen[idx]; const pulse=1+Math.sin(performance.now()*0.004)*0.05; ctx.globalAlpha=0.20; ctx.fillStyle=cur.color; ctx.beginPath(); ctx.arc(curP.x,curP.y,34*pulse,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; ctx.fillStyle='#1A150F'; ctx.beginPath(); ctx.arc(curP.x,curP.y,22,0,Math.PI*2); ctx.fill(); ctx.fillStyle=cur.color; ctx.beginPath(); ctx.arc(curP.x,curP.y,18,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.8; ctx.stroke(); ctx.fillStyle='#FFFEF7'; ctx.font=`900 13px ui-monospace,monospace`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(cur.pl, curP.x, curP.y);
    const change=current.changes.find(c=> c.idx===idx); if(change){ const txt=`${change.from.archLabel} → ${change.to.archLabel}`; ctx.font=`900 14px ui-monospace,monospace`; const tw=ctx.measureText(txt).width; const bw=tw+30, bh=32; const bx=curP.x-bw/2, by=curP.y-68; ctx.fillStyle='#F0E442'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.6; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(bx,by,bw,bh,14); else ctx.rect(bx,by,bw,bh); ctx.fill(); ctx.stroke(); ctx.fillStyle='#1A150F'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt, curP.x, by+bh/2); }
    renderFocus();
  }
  function renderFocus(){
    if(!current) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const m=current.meta[idx];
    if(renderFocus._lastIdx!==idx){ renderFocus._lastIdx=idx; renderTimeline(); }
    const teamKey=`${m.team}|${m.season}`; const roster=teamSeasonRoster.get(teamKey)||[]; const rankIdx=roster.findIndex(r=> r.name===current.name); const rank=rankIdx>=0? rankIdx+1:null; const total=roster.length||15; const isStarter=rank!==null && rank<=5; const stage=careerStage(idx, current.meta.length); const change=current.changes.find(c=> c.idx===idx);
    const fw=document.getElementById('drift-focus-v26');
    fw.innerHTML=`
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <div style="display:flex;gap:12px;align-items:center;border:3px solid #1A150F;border-radius:16px;padding:10px 14px;background:#fff;box-shadow:4px 4px 0 #1A150F">
          <div style="width:48px;height:48px;border-radius:999px;background:${m.color};border:3px solid #1A150F;display:flex;align-items:center;justify-content:center;font-weight:900;font-family:ui-monospace,monospace">${m.pl}</div>
          <div><div style="font-weight:900;font-size:19px;line-height:1.15">${current.name} • ${m.team} ${m.season} • ${stage}</div><div style="font-family:ui-monospace,monospace;font-size:12px;opacity:.7">${m.archLabel} ${m.emoji} • ${m.role} • ${m.gp} GP • ${m.mpg.toFixed(1)} MPG</div></div>
        </div>
        <span class="pill ${isStarter?'pill-yellow':'pill-dark'}">${isStarter?`1 of 5 starter #${rank}`:`1 of 15 bench #${rank} (1 of 5 when in)`}</span>
        <span class="pill" style="background:${m.color}">O ${m.off} D ${m.def}</span>
        ${change? `<span class="pill pill-yellow">SHIFT ${change.from.archLabel}→${change.to.archLabel}</span>`:''}
      </div>
      <div style="background:#1A150F;color:#FFFEF7;border:3px solid #1A150F;border-radius:14px;padding:12px 14px;font-family:ui-sans-serif,system-ui;font-size:14px;line-height:1.5;font-weight:600">${buildNarrative()}</div>
    `;
    const offVals=current.meta.map(x=> x.off), defVals=current.meta.map(x=> x.def), mpgVals=current.meta.map(x=> x.mpg);
    const offDelta=offVals[offVals.length-1]-offVals[0], defDelta=defVals[defVals.length-1]-defVals[0];
    const sortedRoster=[...roster].slice(0,15);
    let skillMatrixHtml=''; if(skillsData && current.meta[0].skillGrades){ const sLabels=skillsData.skills; skillMatrixHtml=`<div style="display:grid;grid-template-columns:repeat(${isMobile?2:3},1fr);gap:10px;margin-top:8px">${sLabels.map((sk,j)=>{ const vals=current.meta.map(mm=> mm.skillGrades? mm.skillGrades[j]:null).filter(v=> v!=null); if(!vals.length) return ''; const firstV=vals[0], lastV=vals[vals.length-1], delta=lastV-firstV; return `<div class="ux-card" style="padding:10px 12px"><div style="display:flex;justify-content:space-between;align-items:center"><span class="ux-mono" style="font-size:10px">${sk.label}</span><span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:900">${firstV}→${lastV} <span style="color:${delta>=0?'#009E73':'#D55E00'}">${delta>=0?'+':''}${delta}</span></span></div>${sparkline(vals, isMobile?140:160,36, j%2? '#0072B2':'#D55E00')}</div>`; }).join('')}</div>`; }
    quadEl.innerHTML=`
      <div style="display:grid;grid-template-columns:${isMobile?'1fr':'1.25fr .75fr'};gap:16px">
        <div class="ux-card"><div class="ux-mono" style="margin-bottom:10px">${m.team} ${m.season} — roster ${total} • you #${rank||'?'} • 1 of 15</div><div style="display:flex;flex-wrap:wrap;gap:8px">${sortedRoster.map(r=> `<span class="roster-chip ${r.name===current.name?'is-focal':''}"><span style="width:10px;height:10px;border-radius:999px;background:${ARCH[r.c%8]?.color};border:1.5px solid #1A150F;display:inline-block"></span> ${r.name.split(' ').pop()} ${r.pl} ${r.mpg.toFixed(0)}</span>`).join('')}</div><div class="ux-mono" style="margin-top:12px">5 circles on floor = current 5-man unit. Tap to see fit.</div><div style="margin-top:18px"><div class="ux-title">Skills change over time</div><div class="ux-mono">Each mini = one skill across career</div>${skillMatrixHtml}</div></div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="ux-card"><div style="display:flex;justify-content:space-between"><span class="ux-mono">Offense evolution</span><span class="pill" style="font-size:11px">${offVals[0]}→${offVals[offVals.length-1]} ${offDelta>=0?'+':''}${offDelta}</span></div>${sparkline(offVals, isMobile?320:340,56,'#D55E00')}</div>
          <div class="ux-card"><div style="display:flex;justify-content:space-between"><span class="ux-mono">Defense evolution</span><span class="pill" style="font-size:11px">${defVals[0]}→${defVals[defVals.length-1]} ${defDelta>=0?'+':''}${defDelta}</span></div>${sparkline(defVals, isMobile?320:340,56,'#0072B2')}</div>
          <div class="ux-card" style="background:#1A150F;color:#FFFEF7"><div class="ux-mono" style="color:#F0E442;opacity:1">Story</div><div style="font-size:14px;line-height:1.6;margin-top:8px;font-weight:600">${current.name} ${current.meta[0].season}→${current.meta[0+current.meta.length-1>0?current.meta.length-1:0].season}: paint→arc story with real skills. This viz also lives at top of every player card in skill profile, centered.</div></div>
        </div>
      </div>
    `;
    if(scrubFill) scrubFill.style.width=`${(tProg*100).toFixed(1)}%`;
    if(scrubThumb) scrubThumb.style.left=`${(tProg*100).toFixed(1)}%`;
  }
  renderFocus._lastIdx=-1;
  function renderTimeline(){ if(!current) return; const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1); timelineH.innerHTML=''; current.meta.forEach((m,i)=>{ const chip=document.createElement('div'); chip.className='drift-tm-chip '+(i===idx?'filled': i<idx?'outline-past':'outline-future'); chip.innerHTML=`<span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${m.color};border:1.5px solid #1A150F;margin-right:6px"></span>${m.season} ${m.team} ${m.archLabel} • ${m.mpg.toFixed(0)} MPG`; chip.onclick=()=>{ tProg=i/current.meta.length; embedPaused=false; paused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; requestDraw(); }; timelineH.appendChild(chip); }); const cur=timelineH.children[idx]; if(cur) cur.scrollIntoView({block:'nearest', inline:'center', behavior:'smooth'}); }
  function buildArcWrapper(name){ const arc=buildArc(name); if(!arc){ const fb=pool[0]||allNames[0]; if(fb && fb!==name) return buildArcWrapper(fb); return null; } return arc; }
  function show(name){ const arc=buildArcWrapper(name); if(!arc) return; current=arc; tProg=0; used.add(name); const input=document.getElementById('drift-player-search'); if(input) input.value=name; renderTimeline(); requestDraw(); }
  function renderSearchResults(q){ if(!q||q.length<1){ searchResults.style.display='none'; return; } const lower=q.toLowerCase(); const matches=allNames.filter(n=> n.toLowerCase().includes(lower)).slice(0,30).map(n=>({n, len:byName.get(n)?.length||0})).sort((a,b)=>{ const ap=a.n.toLowerCase().startsWith(lower), bp=b.n.toLowerCase().startsWith(lower); if(ap!==bp) return bp-ap; return b.len-a.len; }).slice(0,12); if(!matches.length){ searchResults.innerHTML=`<div class="drift-sresult" style="opacity:.6">No match</div>`; searchResults.style.display='block'; return; } searchResults.innerHTML=matches.map(m=> `<div class="drift-sresult" data-name="${m.n.replace(/"/g,'&quot;')}"><span>${m.n}</span><small>${m.len} seasons</small></div>`).join(''); searchResults.style.display='block'; [...searchResults.querySelectorAll('.drift-sresult')].forEach(el=> el.addEventListener('click',()=>{ const nm=el.getAttribute('data-name'); searchResults.style.display='none'; if(nm) show(nm); })); }
  if(searchInput){ searchInput.addEventListener('input', e=> renderSearchResults(e.target.value.trim())); searchInput.addEventListener('focus', e=> renderSearchResults(e.target.value.trim())); searchInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const q=e.target.value.trim(); const exact=allNames.find(n=> n.toLowerCase()===q.toLowerCase())||allNames.find(n=> n.toLowerCase().includes(q.toLowerCase())); if(exact){ searchResults.style.display='none'; show(exact);} } if(e.key==='Escape') searchResults.style.display='none'; }); document.addEventListener('click', e=>{ if(!searchInput.contains(e.target)&&!searchResults.contains(e.target)) searchResults.style.display='none'; }); }
  if(randomBtn) randomBtn.addEventListener('click',()=>{ let cands=allNames.filter(n=> !used.has(n)&&(byName.get(n)?.length||0)>=3); if(cands.length<30){ used.clear(); cands=allNames.filter(n=> (byName.get(n)?.length||0)>=3); } const pick=cands[Math.floor(Math.random()*cands.length)]||pool[Math.floor(Math.random()*pool.length)]; show(pick); });
  canvas.addEventListener('click', (e)=>{ if(!current||!layoutCache) return; const rect=canvas.getBoundingClientRect(); const x=(e.clientX-rect.left), y=(e.clientY-rect.top); const pts=current.meta.map(m=> ftToScreen(m.x,m.y, layoutCache)); let best=-1, bestD=Infinity; pts.forEach((p,i)=>{ const d=(p.x-x)**2+(p.y-y)**2; if(d<bestD){ bestD=d; best=i; } }); if(best>=0 && bestD< (44*44)){ tProg=best/current.meta.length; requestDraw(); } });
  if(scrub){ let dragging=false; const setFromX=xx=>{ const r=scrub.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(xx-r.left)/r.width)); tProg=p; requestDraw(); }; scrub.addEventListener('pointerdown',e=>{ dragging=true; try{scrub.setPointerCapture(e.pointerId);}catch{} setFromX(e.clientX); paused=true; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; }); scrub.addEventListener('pointermove', e=>{ if(dragging) setFromX(e.clientX); }); scrub.addEventListener('pointerup',()=>{ dragging=false; }); scrub.addEventListener('click', e=> setFromX(e.clientX)); }
  if(btnPlay) btnPlay.addEventListener('click',()=>{ if(paused||embedPaused){ paused=false; embedPaused=false; btnPlay.textContent='❚❚ Pause'; } else { paused=true; embedPaused=true; btnPlay.textContent='▶ Play career'; } });
  if(btnNext) btnNext.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx+1;j<current.meta.length;j++) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; requestDraw(); return; } tProg=1; requestDraw(); });
  if(btnPrev) btnPrev.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx-1;j>=1;j--) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; requestDraw(); return; } tProg=0; requestDraw(); });
  window.addEventListener('vh:pause-maps',()=>{ embedPaused=true; paused=true; if(btnPlay) btnPlay.textContent='▶ Play career'; });
  const ro=new ResizeObserver(()=> requestDraw()); ro.observe(canvas);
  let visible=true; const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; if(visible) requestDraw(); },{threshold:0.02}); io.observe(canvas);
  function tick(){ requestAnimationFrame(tick); if(embedPaused) return; if(!visible) return; if(!paused){ tProg+=0.00030; if(tProg>1) tProg=0; requestDraw(); } } tick();
  const initial=pool.find(n=> allNames.includes(n))||'LeBron James'; show(allNames.includes(initial)? initial: pool[0]||allNames[0]);
  return {show, dispose:()=>{ ro.disconnect(); io.disconnect(); }};
}
