/* drift-void.js v29 — Court-Story: team context (1 of 5 / 1 of 15) + offense/defense evolution on half-court */
export async function mountDriftVoid(canvas){
  if(!canvas) return;
  const isMobile = window.innerWidth < 760;
  const dpr = Math.min(window.devicePixelRatio||1, 1.8);

  // --- arch meta (8) with court spots in FT (x:-25..25, y:0..47 half-court) ---
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#111111'];
  const ARCH=[
    { i:0, label:'Glass+Rim', full:'Off Glass + Rim Protection', off:32, def:92, x:-2, y:10, role:'Rim Anchor', desc:'putbacks + paint deterrence', emoji:'🛡️' },
    { i:1, label:'LowVol Glass', full:'Off Glass (Low Volume)', off:22, def:88, x:-4, y:12, role:'Energy Big', desc:'second chances, dirty work', emoji:'🔋' },
    { i:2, label:'Low Impact', full:'Low Impact (End of Bench)', off:24, def:28, x:6, y:18, role:'Deep Reserve', desc:'limited box footprint', emoji:'🪑' },
    { i:3, label:'Def Glass FT', full:'Def Glass + Rim Pressure (FT)', off:46, def:71, x:-1, y:13, role:'Two-Way Big', desc:'draws FTs, owns def glass', emoji:'⚖️' },
    { i:4, label:'Vol+3P', full:'Shot Volume + 3P Volume', off:88, def:34, x:16, y:23, role:'Volume Scorer', desc:'high usage shot creation', emoji:'🔥' },
    { i:5, label:'3P Acc+Vol', full:'Three-Point Accuracy+Volume', off:84, def:38, x:19, y:20, role:'Floor Spacer', desc:'gravity beyond arc', emoji:'🎯' },
    { i:6, label:'Playmaking', full:'Playmaking + Ball Pressure', off:76, def:66, x:-8, y:27, role:'Lead Playmaker', desc:'qb + steals', emoji:'🧠' },
    { i:7, label:'Scoring Vol', full:'Scoring Volume + Shot Volume', off:91, def:40, x:8, y:25, role:'Bucket Getter', desc:'get buckets anywhere', emoji:'🪣' },
  ];
  const POS_LABELS=['PG','SG','SF','PF','C'];
  const POS_ICON={ PG:'●', SG:'▲', SF:'◆', PF:'■', C:'✚' };
  const POS_OFF={ PG:{x:-7,y:6}, SG:{x:7,y:5}, SF:{x:10,y:2}, PF:{x:2,y:-2}, C:{x:0,y:-4} };

  const TEAM_COLORS={
    ATL:'#E03A3E', BOS:'#007A33', BRK:'#000000', CHI:'#CE1141', CHO:'#1D1160', CLE:'#860038',
    DAL:'#00538C', DEN:'#0E2240', DET:'#C8102E', GSW:'#1D428A', HOU:'#CE1141', IND:'#002D62',
    LAC:'#C8102E', LAL:'#552583', MEM:'#12173F', MIA:'#98002E', MIL:'#00471B', MIN:'#0C2340',
    NOP:'#0C2340', NYK:'#006BB6', OKC:'#007AC1', ORL:'#0077C0', PHI:'#006BB6', PHX:'#1D1160',
    POR:'#E03A3E', SAC:'#5A2D81', SAS:'#C4CED4', TOR:'#CE1141', UTA:'#002B5C', WAS:'#002B5C'
  };

  const CACHE_NAME='vector-hoops-v29-courtstory-20260720';
  async function cachedFetchJSON(url){
    try{ if('caches' in window){ const c=await caches.open(CACHE_NAME); const hit=await c.match(url); if(hit) return await hit.json(); } }catch{}
    const r=await fetch(url,{cache:'default'});
    try{ if('caches' in window){ const c=await caches.open(CACHE_NAME); c.put(url, r.clone()).catch(()=>{}); } }catch{}
    return r.json();
  }

  let timeData, liteData, vecData, teamData;
  try{
    const [tData, lPos, vData, tmData] = await Promise.all([
      cachedFetchJSON('assets/archetypes_time.json?v=29'),
      cachedFetchJSON('assets/vectors_search_lite_pos.json?v=29').catch(()=>cachedFetchJSON('assets/vectors_search_lite.json?v=29')),
      cachedFetchJSON('assets/vectors.json?v=29').catch(()=>null),
      cachedFetchJSON('assets/player_team_season.json?v=29').catch(()=>null)
    ]);
    timeData=tData; liteData=lPos; vecData=vData; teamData=tmData;
  }catch(e){ console.warn('court fetch fail',e); return; }

  const seasons = timeData?.prevalence || [];
  const seasonIdx = new Map(seasons.map((s,i)=>[s.season,i]));

  const tmpPlayers = liteData?.players || liteData || [];
  const byName = new Map();
  const playerSeasonLookup = new Map(); // name|season -> entry
  for(const p of tmpPlayers){
    if(!byName.has(p.n)) byName.set(p.n,[]);
    byName.get(p.n).push(p);
    playerSeasonLookup.set(`${p.n}|${p.s}`, p);
  }
  for(const arr of byName.values()) arr.sort((a,b)=> (a.s||'').localeCompare(b.s||''));

  const minutesMap=new Map();
  if(vecData?.players){ for(const p of vecData.players) minutesMap.set(`${p.name}|${p.season}`, { gp:p.gp||0, mpg:p.mpg||0, total_min:p.total_min||0 }); }

  // team reverse: team|season -> roster array of {name, entry, mpg, team}
  const teamSeasonRoster = new Map();
  const teamMap = teamData||{};
  for(const key of Object.keys(teamMap)){
    const sep = key.lastIndexOf('|');
    if(sep<0) continue;
    const name = key.slice(0,sep);
    const season = key.slice(sep+1);
    const team = teamMap[key];
    if(!team) continue;
    const tsKey = `${team}|${season}`;
    if(!teamSeasonRoster.has(tsKey)) teamSeasonRoster.set(tsKey,[]);
    const entry = playerSeasonLookup.get(key);
    const min = minutesMap.get(key);
    teamSeasonRoster.get(tsKey).push({ name, season, team, c: entry?.c ?? 2, p: entry?.p ?? 2, pl: entry?.pl || POS_LABELS[entry?.p] || 'SF', mpg: min?.mpg||0, gp: min?.gp||0 });
  }
  // sort each roster by mpg desc
  for(const [k, arr] of teamSeasonRoster) arr.sort((a,b)=> b.mpg - a.mpg || b.gp - a.gp);

  const allNames=[...byName.keys()].sort((a,b)=> byName.get(b).length - byName.get(a).length);
  const CURATED=["LeBron James","Stephen Curry","Kevin Durant","Giannis Antetokounmpo","Nikola Jokic","James Harden","Russell Westbrook","Chris Paul","Kawhi Leonard","Damian Lillard","Luka Doncic","Jayson Tatum","Joel Embiid","Kobe Bryant","Tim Duncan","Dirk Nowitzki","Shaquille O'Neal","Kevin Garnett","Steve Nash","Dwyane Wade","Vince Carter","Anthony Edwards","Victor Wembanyama","Bo Outlaw","Anthony Davis","Devin Booker","Ja Morant","Donovan Mitchell","Gary Payton","Allen Iverson","Robert Covington"];
  let pool=CURATED.filter(n=>byName.has(n)); for(const nm of allNames){ if(pool.length>=140) break; if(!pool.includes(nm) && (byName.get(nm)?.length||0)>=4) pool.push(nm); }

  // DOM scaffolding (keep header id same for index.html)
  const root=document.getElementById('lemmino-drift');
  if(root){
    root.style.background='#FFFEF7';
    root.style.borderTop='2.2px solid #1A150F';
    root.style.borderBottom='2.2px solid #1A150F';
    root.style.display='flex'; root.style.flexDirection='column';
  }
  let header=document.getElementById('drift-header-v26');
  if(!header){ header=document.createElement('div'); header.id='drift-header-v26'; root.prepend(header); }
  header.innerHTML=`
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:12px 14px;background:#FFFEF7;border-bottom:2px solid #1A150F">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span style="font-family:ui-monospace,monospace;font-size:10px;font-weight:900;letter-spacing:.08em;background:#1A150F;color:#FFFEF7;border-radius:999px;padding:7px 11px">Career Floor v29 — 1 of 5 on floor • 1 of 15 on roster</span>
        <span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.65">raw Canvas • half-court story • offense↗ defense↘ evolution • archetype shape + team context</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;position:relative">
        <div style="position:relative">
          <input id="drift-player-search" placeholder="Search 2 293 names" autocomplete="off" style="min-width:${isMobile?'58vw':'340px'};width:${isMobile?'58vw':'380px'};max-width:80vw;height:46px;border:2.2px solid #1A150F;border-radius:12px;padding:0 14px 0 38px;font-family:ui-monospace,monospace;font-weight:800;font-size:13px;background:#fff;box-shadow:3px 3px 0 #1A150F;outline:none"/>
          <span style="position:absolute;left:13px;top:50%;transform:translateY(-50%)">🔍</span>
          <div id="drift-search-results" style="position:absolute;left:0;top:52px;width:100%;max-height:360px;overflow:auto;background:#FFFEF7;border:2.2px solid #1A150F;border-radius:14px;box-shadow:6px 6px 0 #1A150F;display:none;z-index:30"></div>
        </div>
        <button id="drift-random" type="button" style="min-height:46px;padding:0 16px;border:2.2px solid #1A150F;border-radius:12px;background:#F0E442;font-family:ui-monospace,monospace;font-weight:900;box-shadow:3px 3px 0 #1A150F;cursor:pointer">🎲 Random</button>
      </div>
    </div>`;

  const existingCanvas=document.getElementById('lemmino-drift-canvas');
  let wrap=document.getElementById('drift-canvas-wrap-v26');
  if(!wrap){ wrap=document.createElement('div'); wrap.id='drift-canvas-wrap-v26'; wrap.style.cssText='position:relative;width:100%;background:#FFFEF7;'; existingCanvas.parentNode.insertBefore(wrap, existingCanvas); wrap.appendChild(existingCanvas); }
  existingCanvas.style.width='100%'; existingCanvas.style.height=isMobile?'68vh':'64vh'; existingCanvas.style.minHeight='480px'; existingCanvas.style.display='block'; existingCanvas.style.touchAction='manipulation'; existingCanvas.style.cursor='pointer';

  let focusWrap=document.getElementById('drift-focus-v26');
  if(!focusWrap){ focusWrap=document.createElement('div'); focusWrap.id='drift-focus-v26'; focusWrap.style.cssText='position:absolute;left:12px;right:12px;top:10px;z-index:5;pointer-events:none;display:flex;flex-direction:column;gap:6px;max-width:960px'; wrap.appendChild(focusWrap); }
  focusWrap.innerHTML=`<div id="lemmino-drift-focus" style="pointer-events:auto"></div><div id="lemmino-drift-meta" style="pointer-events:auto"></div>`;
  const focusEl=document.getElementById('lemmino-drift-focus');
  const metaEl=document.getElementById('lemmino-drift-meta');

  let controls=document.getElementById('drift-controls-v26');
  if(!controls){ controls=document.createElement('div'); controls.id='drift-controls-v26'; controls.style.cssText='display:flex;gap:8px;align-items:center;padding:10px 14px;background:#FFFEF7;border-top:1.8px solid #1A150F;flex-wrap:wrap'; wrap.appendChild(controls); }
  controls.innerHTML=`
    <button id="drift-prev" style="appearance:none;min-width:52px;min-height:42px;border:2px solid #1A150F;border-radius:999px;background:#fff;font-family:ui-monospace,monospace;font-weight:900;cursor:pointer;box-shadow:2px 2px 0 #1A150F">⟵ Shift</button>
    <button id="drift-play" style="appearance:none;min-width:92px;min-height:42px;border:2.2px solid #1A150F;border-radius:999px;background:#1A150F;color:#FFFEF7;font-family:ui-monospace,monospace;font-weight:900;cursor:pointer;box-shadow:2px 2px 0 #1A150F">▶ Play</button>
    <button id="drift-next" style="appearance:none;min-width:52px;min-height:42px;border:2px solid #1A150F;border-radius:999px;background:#fff;font-family:ui-monospace,monospace;font-weight:900;cursor:pointer;box-shadow:2px 2px 0 #1A150F">Next ⟶</button>
    <div id="drift-scrub" style="flex:1 1 180px;min-width:160px;height:20px;background:#ECE7DB;border-radius:999px;position:relative;overflow:hidden;cursor:pointer;border:2px solid #1A150F"><div id="drift-scrub-fill" style="position:absolute;left:0;top:0;bottom:0;width:0%;background:#1A150F;border-radius:999px"></div></div>
    <span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.6">tap floor to scrub • shows 1-of-5 + 1-of-15 + off/def</span>
  `;
  const scrub=document.getElementById('drift-scrub');
  const scrubFill=document.getElementById('drift-scrub-fill');
  const btnPlay=document.getElementById('drift-play');
  const btnNext=document.getElementById('drift-next');
  const btnPrev=document.getElementById('drift-prev');
  const searchInput=document.getElementById('drift-player-search');
  const searchResults=document.getElementById('drift-search-results');
  const randomBtn=document.getElementById('drift-random');

  let timelineH=document.getElementById('drift-timeline');
  if(!timelineH){ timelineH=document.createElement('div'); timelineH.id='drift-timeline'; root.appendChild(timelineH); }
  timelineH.style.cssText=`display:flex;gap:7px;overflow-x:auto;overflow-y:hidden;padding:12px 14px;background:#FFFEF7;border-top:1.8px solid #1A150F;border-bottom:1.8px solid #1A150F;scrollbar-width:thin`;

  let quadEl=document.getElementById('drift-quad');
  if(!quadEl){ quadEl=document.createElement('div'); quadEl.id='drift-quad'; root.appendChild(quadEl); }
  quadEl.style.cssText=`position:relative;right:auto;top:auto;width:100%;max-width:100%;overflow:visible;z-index:2;background:#12100C;border-top:2.2px solid #1A150F;padding:16px;display:flex;flex-direction:column;gap:14px`;

  const styleEl=document.getElementById('drift-v21-style')||document.createElement('style'); styleEl.id='drift-v21-style';
  styleEl.textContent=`
    #drift-timeline::-webkit-scrollbar{height:6px} #drift-timeline::-webkit-scrollbar-thumb{background:#1A150F;border-radius:99px}
    .drift-tm-chip{border-radius:999px;padding:8px 13px;font-family:ui-monospace,monospace;font-size:11.5px;font-weight:800;cursor:pointer;transition:all .12s;white-space:nowrap;line-height:1.1;flex:0 0 auto;border:2px solid #1A150F}
    .drift-tm-chip.filled{background:#1A150F;color:#FFFEF7;box-shadow:3px 3px 0 #1A150F;transform:translateY(-1px)}
    .drift-tm-chip.outline-past{background:#fff;color:#1A150F;border-style:dashed;opacity:.9;box-shadow:1.5px 1.5px 0 #1A150F}
    .drift-tm-chip.outline-future{background:transparent;color:#8A847B;border-style:dashed;border-color:rgba(26,21,15,.32);opacity:.55}
    .dq-kicker{font-family:ui-monospace,monospace;font-weight:900;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#9AA0AC;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .dq-title{font-family:ui-sans-serif,system-ui;font-weight:900;font-size:${isMobile? '16px':'19px'};line-height:1.15;letter-spacing:-.02em;color:#FFFEF7;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    .dq-dot{width:10px;height:10px;border-radius:999px;border:1.5px solid #1A150F;display:inline-block;flex-shrink:0}
    .dq-subtitle{font-family:ui-monospace,monospace;font-size:11px;line-height:1.45;color:#C2C6D0}
    .dq-pill{border-radius:999px;padding:6px 12px;font-family:ui-monospace,monospace;font-size:11px;font-weight:800;border:1.5px solid #1A150F;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
    .dq-pill.white{background:#FFFEF7;color:#1A150F} .dq-pill.dark{background:#1A150F;color:#FFFEF7;border-color:#FFFEF7} .dq-pill.mid{background:#FFE8A0;color:#1A150F} .dq-pill.good{background:#B8E6C8;color:#0A1A0F} .dq-pill.bad{background:#FFC8B8;color:#2A0F0A}
    .dq-sentence{font-family:ui-sans-serif,system-ui;font-size:${isMobile?'14px':'15px'};line-height:1.55;font-weight:600;color:#FFFEF7;background:rgba(255,254,247,.07);border-radius:12px;padding:12px 14px;border:1px solid rgba(255,254,247,.1)}
    .drift-sresult{padding:10px 12px;cursor:pointer;border-bottom:1px solid rgba(26,21,15,.08);display:flex;justify-content:space-between;gap:8px;font-family:ui-monospace,monospace;font-size:12.5px}
    .drift-sresult:hover{background:#1A150F;color:#FFFEF7}
    .roster-chip{border:1.5px solid #1A150F;border-radius:999px;padding:5px 9px;font-family:ui-monospace,monospace;font-size:10px;font-weight:800;display:inline-flex;align-items:center;gap:5px;background:#FFFEF7;box-shadow:1.5px 1.5px 0 #1A150F}
    .roster-chip.is-focal{background:#1A150F;color:#FFFEF7;box-shadow:2px 2px 0 #1A150F}
    .roster-chip.is-starter{border-width:2px}
  `;
  document.head.appendChild(styleEl);

  // canvas 2d setup
  const ctx = canvas.getContext('2d', { alpha:false });
  function resizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width * dpr));
    const h = Math.max(420, Math.floor(rect.height * dpr));
    if(canvas.width!==w || canvas.height!==h){ canvas.width=w; canvas.height=h; }
    return { w,h, rect };
  }

  // court helpers
  function drawCourtBackground(w,h){
    // hardwood
    ctx.fillStyle='#E8D5B5';
    ctx.fillRect(0,0,w,h);
    // plank lines subtle
    ctx.strokeStyle='rgba(26,21,15,0.06)';
    ctx.lineWidth=1*dpr;
    const plank = 18*dpr;
    for(let y=0;y<h;y+=plank){ ctx.beginPath(); ctx.moveTo(0,y+0.5); ctx.lineTo(w,y+0.5); ctx.stroke(); }
  }

  function ftToScreen(ftX, ftY, layout){
    // ftX -25..25, ftY 0..47 (0 baseline, 47 half)
    const { centerX, baseY, scale } = layout;
    return { x: centerX + ftX*scale, y: baseY - ftY*scale };
  }

  function drawHalfCourt(w,h, teamAbbr){
    const pad = 14*dpr;
    const usableH = h*0.82; // leave bottom for spare spark zone inside canvas? keep court 82%
    const usableW = w - pad*2;
    const scaleW = usableW / 50; // 50ft width
    const scaleH = usableH / 50; // give extra breathing (47ft -> 50 for margin)
    const scale = Math.min(scaleW, scaleH);
    const centerX = w/2;
    const baseY = h*0.88; // baseline near bottom
    const layout = { centerX, baseY, scale, w, h };

    // faint team watermark
    if(teamAbbr && teamAbbr!=='—'){
      ctx.save();
      ctx.globalAlpha=0.07;
      ctx.font=`900 ${Math.floor(110*dpr)}px ui-sans-serif,system-ui`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=TEAM_COLORS[teamAbbr]||'#1A150F';
      ctx.fillText(teamAbbr, centerX, h*0.28);
      ctx.restore();
    }

    // court outer
    const bl = ftToScreen(-25,0,layout), br = ftToScreen(25,0,layout), tr = ftToScreen(25,47,layout), tl = ftToScreen(-25,47,layout);
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.6*dpr;
    ctx.beginPath(); ctx.moveTo(bl.x,bl.y); ctx.lineTo(br.x,br.y); ctx.lineTo(tr.x,tr.y); ctx.lineTo(tl.x,tl.y); ctx.closePath(); ctx.stroke();

    // half court line (top)
    ctx.beginPath(); ctx.moveTo(tl.x,tl.y); ctx.lineTo(tr.x,tr.y); ctx.stroke();

    // paint
    const p1 = ftToScreen(-8,0,layout), p2 = ftToScreen(8,0,layout), p3 = ftToScreen(8,19,layout), p4 = ftToScreen(-8,19,layout);
    ctx.fillStyle='rgba(26,21,15,0.06)'; ctx.fillRect(p1.x, p4.y, p2.x-p1.x, p1.y-p4.y);
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=2*dpr;
    ctx.strokeRect(p1.x, p4.y, p2.x-p1.x, p1.y-p4.y);

    // free throw circle
    const ftC = ftToScreen(0,19,layout);
    const r6 = 6*scale;
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=1.6*dpr;
    ctx.beginPath(); ctx.arc(ftC.x, ftC.y, r6, 0, Math.PI*2); ctx.stroke();
    // dotted inside paint half
    ctx.setLineDash([4*dpr,4*dpr]); ctx.strokeStyle='rgba(26,21,15,0.55)';
    ctx.beginPath(); ctx.arc(ftC.x, ftC.y, r6, 0, Math.PI, false); ctx.stroke(); ctx.setLineDash([]);

    // restricted area
    const basket = ftToScreen(0,5.25,layout);
    ctx.beginPath(); ctx.arc(basket.x, basket.y, 4*scale, 0, Math.PI); ctx.stroke();

    // backboard
    const bb1 = ftToScreen(-3,4,layout), bb2 = ftToScreen(3,4,layout);
    ctx.lineWidth=3*dpr; ctx.strokeStyle='#1A150F'; ctx.beginPath(); ctx.moveTo(bb1.x,bb1.y); ctx.lineTo(bb2.x,bb2.y); ctx.stroke();

    // hoop
    ctx.beginPath(); ctx.arc(basket.x, basket.y, 0.75*scale, 0, Math.PI*2); ctx.strokeStyle='#E03A3E'; ctx.lineWidth=2.4*dpr; ctx.stroke();

    // 3pt line: straight to arc
    const c3x = basket.x, c3y = basket.y;
    const r = 23.75*scale;
    const cornerX = 22*scale; // 22ft from basket center to corner line? approx
    const straightY = 14*scale; // straight segment up to 14ft
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=2*dpr;
    ctx.beginPath();
    // left side
    const leftCorner = ftToScreen(-22,0,layout);
    const leftElbow = ftToScreen(-22,14,layout);
    ctx.moveTo(leftCorner.x, leftCorner.y);
    ctx.lineTo(leftElbow.x, leftElbow.y);
    // arc
    // compute arc angles from leftElbow to rightElbow around basket
    const angLeft = Math.atan2(leftElbow.y - c3y, leftElbow.x - c3x);
    const rightElbow = ftToScreen(22,14,layout);
    const angRight = Math.atan2(rightElbow.y - c3y, rightElbow.x - c3x);
    // arc should go clockwise across top
    ctx.arc(c3x, c3y, r, angLeft, angRight, false);
    const rightCorner = ftToScreen(22,0,layout);
    ctx.lineTo(rightCorner.x, rightCorner.y);
    ctx.stroke();

    // hash bench area: sideline beyond outer? show bench stripe left/right outside court faint
    ctx.fillStyle='rgba(26,21,15,0.05)';
    const benchH = 6*scale;
    // left bench
    ctx.fillRect(pad, baseY - 2*scale, 18*scale, 4*scale);
    ctx.fillRect(w - pad - 18*scale, baseY - 2*scale, 18*scale, 4*scale);

    // labels small
    ctx.fillStyle='#1A150F'; ctx.font=`700 ${10*dpr}px ui-monospace,monospace`; ctx.textAlign='center';
    ctx.fillText('BASELINE — 1 of 15 roster', centerX, baseY+14*dpr);
    ctx.fillText('HALF — shows 1 of 5 on floor', centerX, tl.y - 8*dpr);

    return layout;
  }

  function getCourtPos(archeIdx, posLabel, seasonIdxJitter=0){
    const base = ARCH[archeIdx % 8];
    const off = POS_OFF[posLabel] || POS_OFF['SF'] || {x:0,y:0};
    // jitter based on seasonIdx to avoid perfect overlap
    const jitter = ((seasonIdxJitter*0.618)%1 -0.5)*1.2; // -0.6..0.6
    const jitterY = ((seasonIdxJitter*0.313)%1 -0.5)*1.0;
    return { x: base.x + off.x + jitter, y: base.y + off.y + jitterY, arch: base };
  }

  function careerStage(idx,total){ const r=idx/Math.max(1,total-1); if(r<0.18) return 'Rookie'; if(r<0.35) return 'Breakout'; if(r<0.62) return 'Prime'; if(r<0.84) return 'Veteran'; return 'Late'; }

  // build arc data with team context
  function buildArc(name){
    const entries = byName.get(name)||[];
    if(entries.length<2) return null;
    const meta=[];
    for(const e of entries){
      const si = seasonIdx.get(e.s);
      if(si===undefined) continue;
      const key = `${e.n}|${e.s}`;
      const min = minutesMap.get(key);
      const team = teamMap[key]||'—';
      const cp = getCourtPos(e.c, e.pl|| POS_LABELS[e.p]||'SF', si);
      meta.push({ season:e.s, si, archeIdx:e.c, archLabel:ARCH[e.c]?.label||`A${e.c}`, team, pl:e.pl||POS_LABELS[e.p]||'SF', p:e.p, posIcon:POS_ICON[e.pl||'']||'●', mpg:min?.mpg||0, gp:min?.gp||0, x:cp.x, y:cp.y, share:seasons[si]?.shares?.[e.c]||0, desc:ARCH[e.c]?.desc||'', role:ARCH[e.c]?.role||'', off:ARCH[e.c]?.off||50, def:ARCH[e.c]?.def||50 });
    }
    if(meta.length<2) return null;
    meta.sort((a,b)=> a.season.localeCompare(b.season));
    // detect changes
    const changes=[]; for(let i=1;i<meta.length;i++) if(meta[i].archeIdx!==meta[i-1].archeIdx) changes.push({ idx:i, from:meta[i-1], to:meta[i] });
    return { name, meta, changes };
  }

  let current=null, tProg=0, paused=true, embedPaused=true, used=new Set(), autoPauseUntil=0, lastChangeIdx=-1;
  window.addEventListener('vh:pause-maps',()=>{ embedPaused=true; paused=true; if(btnPlay) btnPlay.textContent='▶ Play'; });

  function renderTimelineH(){
    if(!current) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    timelineH.innerHTML='';
    current.meta.forEach((m,i)=>{
      const chip=document.createElement('div');
      chip.className='drift-tm-chip ' + (i===idx? 'filled' : (i<idx? 'outline-past' : 'outline-future'));
      chip.textContent=`${m.season} ${m.team} ${m.archLabel} ${m.pl}`;
      chip.onclick=()=>{ tProg=i/current.meta.length; embedPaused=false; paused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; requestDraw(); };
      timelineH.appendChild(chip);
    });
    const curEl=timelineH.children[idx]; if(curEl) curEl.scrollIntoView({ block:'nearest', inline:'center', behavior:'smooth' });
  }

  function sparklineSVG(values, w=160, h=36, color='#FFFEF7', fill=false){
    if(!values.length) return '';
    const min=Math.min(...values), max=Math.max(...values);
    const rng=Math.max(0.001, max-min);
    const pts=values.map((v,i)=>{ const x=(i/(values.length-1))*w; const y=h - ((v-min)/rng)*h; return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
    const fillPath = fill? `M0,${h} L${pts.split(' ').map(p=>p).join(' L')} L${w},${h} Z` : '';
    // we'll use polyline
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block"><polyline fill="none" stroke="${color}" stroke-width="2.2" points="${pts}" stroke-linejoin="round" stroke-linecap="round"/>${fill? `<polygon fill="${color}" opacity="0.18" points="0,${h} ${pts} ${w},${h}"/>`:''}</svg>`;
  }

  function renderQuad(m, currentIdx){
    const teamKey = `${m.team}|${m.season}`;
    const roster = teamSeasonRoster.get(teamKey)||[];
    const sorted = [...roster].sort((a,b)=> b.mpg - a.mpg);
    const rankIdx = sorted.findIndex(r=> r.name===current.name);
    const rank = rankIdx>=0? rankIdx+1 : null;
    const of15 = sorted.length||15;
    const isStarter = rank!==null && rank<=5;
    const of5label = isStarter? `1 of 5 on floor (starter #${rank})` : rank? `1 of 15 — bench #${rank} (of ${of15})` : `1 of 15 roster — ${m.team} ${m.season}`;
    const offVals = current.meta.map(x=> x.off);
    const defVals = current.meta.map(x=> x.def);
    const offDelta = offVals.length? (offVals[offVals.length-1]-offVals[0]) : 0;
    const defDelta = defVals.length? (defVals[defVals.length-1]-defVals[0]) : 0;
    const mpgVals = current.meta.map(x=> x.mpg);

    // story sentence
    const first = current.meta[0], last = current.meta[current.meta.length-1];
    let story='';
    if(current.meta.length>=2){
      const trend = offDelta>10? 'grew from interior to perimeter' : offDelta<-10? 'shifted toward rim/grind' : 'kept consistent offensive shape';
      const roleStory = isStarter? `As a ${m.role.toLowerCase()} you started, logging ${m.mpg.toFixed(1)} MPG — trusted as 1 of 5.` : `You were 1 of 15, #${rank} by minutes (${m.mpg.toFixed(1)} MPG) — rotation glue for ${m.team}, doing ${m.desc}.`;
      story = `${current.name} ${first.season}→${last.season}: ${first.archLabel} (${first.role}) → ${last.archLabel} (${last.role}). Offense ${offDelta>0? '↗ +'+offDelta : '↘ '+offDelta} , defense ${defDelta>0? '↗ +'+defDelta : '↘ '+defDelta}. ${roleStory} Never solo — hoops is 5-on-5, you're 1 of 5 fitting a scheme, 1 of 15 filling a roster.`;
    } else {
      story = `${current.name} — ${m.archLabel} ${m.pl} — 1 of 15 on ${m.team}, 1 of 5 when on floor.`;
    }

    const archColor = OKABE[m.archeIdx%8]||'#1A150F';
    const stage = careerStage(currentIdx, current.meta.length);

    quadEl.innerHTML=`
      <div class="dq-kicker"><span class="dq-dot" style="background:${archColor}"></span> ${m.season} • ${m.team} • ${m.pl} ${m.archLabel} • ${stage} • ${of5label} • ${of15} total</div>
      <div class="dq-title">${POS_ICON[m.pl]||'●'} ${m.pl} × <span style="display:inline-flex;align-items:center;gap:6px"><span class="dq-dot" style="background:${archColor}"></span> ${m.archLabel}</span> <span class="dq-pill white">1 of 5</span> <span class="dq-pill dark">1 of 15</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="dq-pill white">🏀 ${m.gp} GP • ${m.mpg.toFixed(1)} MPG</span>
        <span class="dq-pill ${m.off>=70? 'good': m.off<=35? 'bad':'mid'}">O ${m.off} ${m.off>=80? '↗' : m.off<=35? '↘' : '→'}</span>
        <span class="dq-pill ${m.def>=70? 'good': m.def<=35? 'bad':'mid'}">D ${m.def} ${m.def>=70? '↗' : ''}</span>
        <span class="dq-pill dark">${m.role} ${ARCH[m.archeIdx]?.emoji||''}</span>
      </div>
      <div style="display:grid;grid-template-columns:${isMobile? '1fr':'1.1fr .9fr'};gap:12px">
        <div style="background:rgba(255,254,247,.06);border-radius:12px;padding:10px;border:1px solid rgba(255,254,247,.1)">
          <div style="font-family:ui-monospace,monospace;font-size:10px;font-weight:900;letter-spacing:.08em;color:#E8E0D0;margin-bottom:6px">${m.team} ${m.season} — roster ${of15} (sorted by MPG) — you are #${rank||'?'} — 1 of 15</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;max-height:${isMobile? '96px':'120px'};overflow:auto">
            ${sorted.slice(0,15).map(r=>`<span class="roster-chip ${r.name===current.name? 'is-focal':''} ${r.mpg>20? 'is-starter':''}" title="${r.name} ${r.pl} ${ARCH[r.c]?.label||''} ${r.mpg.toFixed(1)} MPG"><span style="width:8px;height:8px;border-radius:999px;background:${OKABE[r.c%8]};border:1.2px solid #1A150F;display:inline-block"></span> ${r.name.split(' ').pop()} ${r.pl} ${r.mpg.toFixed(0)}</span>`).join('') || '<span style="opacity:.6;font-size:11px">No roster data for this team/season — fallback shows league</span>'}
          </div>
          <div style="margin-top:8px;font-family:ui-monospace,monospace;font-size:10px;color:#9AA0AC">Top 5 = on-floor unit this night (by MPG). You + 4 teammates plotted on court above. Rest = bench, 1 of 15.</div>
        </div>
        <div style="background:rgba(255,254,247,.06);border-radius:12px;padding:10px;border:1px solid rgba(255,254,247,.1);display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-family:ui-monospace,monospace;font-size:10px;font-weight:900;color:#E8E0D0">OFFENSE evolution</span><span style="font-size:10px;font-family:ui-monospace,monospace;color:#9AA0AC">${offVals[0]}→${offVals[offVals.length-1]} Δ ${offDelta>=0? '+':''}${offDelta}</span></div>
          ${sparklineSVG(offVals, isMobile? 260:300, 38, '#F0E442', true)}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px"><span style="font-family:ui-monospace,monospace;font-size:10px;font-weight:900;color:#E8E0D0">DEFENSE evolution</span><span style="font-size:10px;font-family:ui-monospace,monospace;color:#9AA0AC">${defVals[0]}→${defVals[defVals.length-1]} Δ ${defDelta>=0? '+':''}${defDelta}</span></div>
          ${sparklineSVG(defVals, isMobile? 260:300, 38, '#56B4E9', true)}
          <div style="margin-top:2px;font-family:ui-monospace,monospace;font-size:9px;color:#9AA0AC">MPG load: ${sparklineSVG(mpgVals, isMobile? 260:300, 24, '#FFFEF7', false)}</div>
        </div>
      </div>
      <div class="dq-sentence">${story}</div>
    `;
  }

  function renderFocus(){
    if(!current) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const m=current.meta[idx];
    if(renderFocus._lastIdx!==idx){ renderFocus._lastIdx=idx; renderTimelineH(); }
    const teamKey=`${m.team}|${m.season}`;
    const roster=teamSeasonRoster.get(teamKey)||[];
    const rank = roster.findIndex(r=> r.name===current.name)+1;
    const of15 = roster.length||15;
    const isStarter = rank>0 && rank<=5;
    const change=current.changes.find(c=>c.idx===idx);
    if(change && lastChangeIdx!==idx){ lastChangeIdx=idx; autoPauseUntil=performance.now()+1800; }

    focusEl.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:6px">
      <span style="background:#1A150F;color:#FFFEF7;border:2px solid #1A150F;padding:6px 12px;border-radius:999px;font-weight:900;font-family:ui-monospace,monospace;font-size:12px;box-shadow:3px 3px 0 #1A150F">${current.name} [${idx+1}/${current.meta.length} ${careerStage(idx,current.meta.length)}] — ${m.team}</span>
      <span style="background:#FFFEF7;border:2px solid #1A150F;padding:6px 12px;border-radius:999px;font-weight:800;font-family:ui-monospace,monospace;font-size:12px;box-shadow:2px 2px 0 #1A150F">${m.season} ${m.archLabel} ${m.pl} • ${isStarter? `starter #${rank} — 1 of 5 on floor, 1 of ${of15} roster` : `bench #${rank||'?'} — 1 of ${of15} roster (1 of 5 when in)`}</span>
      ${change? `<span style="background:#F0E442;border:2px solid #1A150F;padding:6px 10px;border-radius:999px;font-weight:900;font-size:11px">SHIFT ${change.from.archLabel}→${change.to.archLabel}</span>`:''}
    </div>`;
    metaEl.innerHTML=`<span style="font-family:ui-monospace,monospace;font-size:11px;background:#1A150F;color:#FFFEF7;border-radius:8px;padding:6px 10px;box-shadow:2px 2px 0 #1A150F;display:inline-block;max-width:100%">Court = where you fit in 5-man geometry. Color = archetype ${m.archLabel}. Shape = ${m.pl}. Roster badges below = 1-of-15 context. Off ${m.off} Def ${m.def} • ${m.desc} • tap floor to move.</span>`;
    renderQuad(m, idx);
    if(scrubFill) scrubFill.style.width=`${(tProg*100).toFixed(1)}%`;
  }
  renderFocus._lastIdx=-1;

  let layoutCache=null;
  let rafPending=false;
  function requestDraw(){ if(rafPending) return; rafPending=true; requestAnimationFrame(()=>{ rafPending=false; draw(); }); }

  function draw(){
    if(!current) return;
    const { w,h } = resizeCanvas();
    drawCourtBackground(w,h);
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const m=current.meta[idx];
    const l = drawHalfCourt(w,h,m.team);
    layoutCache=l;

    // draw all seasons positions path
    const allPts = current.meta.map(mm=> ftToScreen(mm.x, mm.y, l));
    // future faint dashed
    ctx.strokeStyle='rgba(26,21,15,0.16)'; ctx.lineWidth=1.4*dpr; ctx.setLineDash([6*dpr,6*dpr]);
    ctx.beginPath(); allPts.forEach((p,i)=>{ if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }); ctx.stroke(); ctx.setLineDash([]);

    // past solid
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=3*dpr; ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.beginPath();
    for(let i=0;i<=idx;i++){ const p=allPts[i]; if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }
    ctx.stroke();
    // glow for past
    ctx.strokeStyle='rgba(240,228,66,0.55)'; ctx.lineWidth=6*dpr; ctx.globalAlpha=0.35;
    ctx.beginPath(); for(let i=0;i<=idx;i++){ const p=allPts[i]; if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); } ctx.stroke(); ctx.globalAlpha=1;

    // teammates on floor for current season (top 5 by MPG)
    const teamKey=`${m.team}|${m.season}`;
    const roster = teamSeasonRoster.get(teamKey)||[];
    const top5 = roster.slice(0,5);
    // ensure focal present in top5 fallback if roster rank >5 we add him
    const focalInTop = top5.some(r=> r.name===current.name);
    let floorUnit = top5;
    if(!focalInTop && roster.length){
      // replace 5th with focal to show 1-of-5 context
      floorUnit = [...top5.slice(0,4), ...roster.filter(r=> r.name===current.name)];
    }
    for(const tm of floorUnit){
      if(tm.name===current.name) continue;
      const tmPos = getCourtPos(tm.c, tm.pl, m.si+tm.name.length*0.1);
      const s = ftToScreen(tmPos.x, tmPos.y, l);
      ctx.fillStyle=OKABE[tm.c%8]||'#777'; if(ctx.fillStyle==='#111111') ctx.fillStyle='#8A8E99';
      ctx.strokeStyle='#1A150F'; ctx.lineWidth=1.6*dpr;
      ctx.beginPath(); ctx.arc(s.x,s.y, 7*dpr,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#1A150F'; ctx.font=`700 ${8*dpr}px ui-monospace,monospace`; ctx.textAlign='center'; ctx.fillText(tm.pl, s.x, s.y+2.5*dpr);
    }

    // nodes for all seasons small
    for(let i=0;i<current.meta.length;i++){
      const p=allPts[i];
      const isCur=i===idx;
      const col=OKABE[current.meta[i].archeIdx%8]; const isChange=i>0 && current.meta[i].archeIdx!==current.meta[i-1].archeIdx;
      const rad = isCur? 12*dpr : isChange? 5*dpr : 3.2*dpr;
      ctx.fillStyle= isCur? '#1A150F' : col;
      if(isCur && col==='#111111') ctx.fillStyle='#1A150F';
      ctx.strokeStyle='#1A150F'; ctx.lineWidth= isCur? 2.5*dpr : 1.6*dpr;
      ctx.beginPath(); ctx.arc(p.x,p.y, rad,0,Math.PI*2); ctx.fill(); ctx.stroke();
      if(isChange && !isCur){
        ctx.strokeStyle='#F0E442'; ctx.lineWidth=2.2*dpr; ctx.beginPath(); ctx.arc(p.x,p.y, rad+3*dpr,0,Math.PI*2); ctx.stroke();
      }
      // season label every other
      if(isCur || (i%2===0 && current.meta.length<20) || current.meta.length<12){
        if(!isCur){
          ctx.fillStyle='rgba(26,21,15,0.72)'; ctx.font=`700 ${9*dpr}px ui-monospace,monospace`; ctx.textAlign='center'; ctx.fillText(current.meta[i].season.slice(2), p.x, p.y - (rad+6*dpr));
        }
      }
    }

    // focal big
    const curPt = allPts[idx];
    const pulse = 1 + Math.sin(performance.now()*0.003)*0.08;
    // halo
    ctx.fillStyle=OKABE[m.archeIdx%8]||'#1A150F'; ctx.globalAlpha=0.18;
    ctx.beginPath(); ctx.arc(curPt.x, curPt.y, 22*dpr*pulse,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    // outer ring 1 of 5 badge
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.8*dpr;
    ctx.beginPath(); ctx.arc(curPt.x, curPt.y, 14*dpr,0,Math.PI*2); ctx.stroke();
    // inner fill arch color
    ctx.fillStyle=OKABE[m.archeIdx%8]||'#1A150F';
    if(ctx.fillStyle==='#111111') ctx.fillStyle='#1A150F';
    ctx.beginPath(); ctx.arc(curPt.x, curPt.y, 11*dpr,0,Math.PI*2); ctx.fill();
    // icon pos shape
    ctx.fillStyle='#FFFEF7'; ctx.font=`900 ${9*dpr}px ui-monospace,monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(m.pl, curPt.x, curPt.y+0.5*dpr);
    // ball icon small near
    ctx.fillStyle='#E85D04'; ctx.beginPath(); ctx.arc(curPt.x+12*dpr, curPt.y-12*dpr, 3*dpr,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#1A150F'; ctx.lineWidth=1*dpr; ctx.stroke();

    // shift label if change
    const change = current.changes.find(c=>c.idx===idx);
    if(change){
      ctx.fillStyle='#F0E442'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=1.8*dpr;
      const txt=`${change.from.archLabel} → ${change.to.archLabel}`;
      ctx.font=`900 ${11*dpr}px ui-monospace,monospace`;
      const tm=ctx.measureText(txt); const bw=tm.width+18*dpr, bh=18*dpr;
      const bx=curPt.x - bw/2, by=curPt.y - 38*dpr;
      ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(bx,by,bw,bh,8*dpr); else ctx.rect(bx,by,bw,bh); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#1A150F'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt, curPt.x, by+bh/2);
    }

    renderFocus();
  }

  function show(name){
    const arc=buildArc(name);
    if(!arc){ const fallback=pool[0]||allNames[0]; if(fallback && fallback!==name) return show(fallback); return; }
    current=arc; tProg=0; lastChangeIdx=-1; used.add(name);
    if(searchInput) searchInput.value=name;
    renderTimelineH(); requestDraw();
  }

  // interactions
  function renderSearchResults(q){
    if(!q||q.length<1){ searchResults.style.display='none'; return; }
    const lower=q.toLowerCase();
    const matches=allNames.filter(n=> n.toLowerCase().includes(lower)).slice(0,24).map(n=>({ n, len:byName.get(n)?.length||0 })).sort((a,b)=>{ const ap=a.n.toLowerCase().startsWith(lower), bp=b.n.toLowerCase().startsWith(lower); if(ap!==bp) return bp-ap; return b.len-a.len; }).slice(0,12);
    if(!matches.length){ searchResults.innerHTML=`<div class="drift-sresult" style="opacity:.6">No match</div>`; searchResults.style.display='block'; return; }
    searchResults.innerHTML=matches.map(m=>`<div class="drift-sresult" data-name="${m.n.replace(/"/g,'&quot;')}"><span>${m.n}</span><small>${m.len} seasons</small></div>`).join('');
    searchResults.style.display='block';
    [...searchResults.querySelectorAll('.drift-sresult')].forEach(el=> el.addEventListener('click',()=>{ const nm=el.getAttribute('data-name'); searchResults.style.display='none'; if(nm) show(nm); }));
  }
  if(searchInput){
    searchInput.addEventListener('input', e=> renderSearchResults(e.target.value.trim()));
    searchInput.addEventListener('focus', e=> renderSearchResults(e.target.value.trim()));
    searchInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const q=e.target.value.trim(); const exact= allNames.find(n=> n.toLowerCase()===q.toLowerCase()) || allNames.find(n=> n.toLowerCase().includes(q.toLowerCase())); if(exact){ searchResults.style.display='none'; show(exact); } } if(e.key==='Escape') searchResults.style.display='none'; });
    document.addEventListener('click', e=>{ if(!searchInput.contains(e.target)&&!searchResults.contains(e.target)) searchResults.style.display='none'; });
  }
  if(randomBtn) randomBtn.addEventListener('click',()=>{ let cands=allNames.filter(n=> !used.has(n) && (byName.get(n)?.length||0)>=3); if(cands.length<30){ used.clear(); cands=allNames.filter(n=> (byName.get(n)?.length||0)>=3); } const pick=cands[Math.floor(Math.random()*cands.length)]||pool[Math.floor(Math.random()*pool.length)]; show(pick); });

  // scrub + tap court to pick season
  canvas.addEventListener('click', (e)=>{
    if(!current||!layoutCache) return;
    const rect=canvas.getBoundingClientRect();
    const x=(e.clientX-rect.left)*dpr, y=(e.clientY-rect.top)*dpr;
    // find nearest season node
    const l=layoutCache;
    const pts=current.meta.map(mm=> ftToScreen(mm.x, mm.y, l));
    let best=-1, bestD=Infinity;
    pts.forEach((p,i)=>{ const d=(p.x-x)**2+(p.y-y)**2; if(d<bestD){ bestD=d; best=i; } });
    if(best>=0){ tProg=best/current.meta.length; requestDraw(); }
  });
  if(scrub){
    let dragging=false;
    const setFromX=xx=>{ const r=scrub.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(xx-r.left)/r.width)); tProg=p; requestDraw(); };
    scrub.addEventListener('pointerdown',e=>{ dragging=true; try{scrub.setPointerCapture(e.pointerId);}catch{} setFromX(e.clientX); paused=true; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; });
    scrub.addEventListener('pointermove',e=>{ if(dragging) setFromX(e.clientX); });
    scrub.addEventListener('pointerup',()=>{ dragging=false; });
    scrub.addEventListener('click',e=> setFromX(e.clientX));
  }
  if(btnPlay) btnPlay.addEventListener('click',()=>{ if(paused||embedPaused){ paused=false; embedPaused=false; btnPlay.textContent='❚❚ Pause'; } else { paused=true; embedPaused=true; btnPlay.textContent='▶ Play'; } });
  if(btnNext) btnNext.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx+1;j<current.meta.length;j++) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; requestDraw(); return; } tProg=1; requestDraw(); });
  if(btnPrev) btnPrev.addEventListener('click',()=>{ paused=false; embedPaused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx-1;j>=1;j--) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; requestDraw(); return; } tProg=0; requestDraw(); });

  const ro=new ResizeObserver(()=> requestDraw()); ro.observe(canvas);
  let visible=true; const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; if(visible) requestDraw(); },{threshold:0.02}); io.observe(canvas);

  function tick(){
    requestAnimationFrame(tick);
    if(embedPaused) return;
    if(!visible) return;
    const now=performance.now();
    if(!paused && now>autoPauseUntil){ tProg+=0.00022; if(tProg>1) tProg=0; requestDraw(); }
  }
  tick();

  // initial
  const initial = pool.find(n=> allNames.includes(n)) || 'LeBron James';
  show(allNames.includes(initial)? initial : pool[0]||allNames[0]);

  return { show, dispose:()=>{ ro.disconnect(); io.disconnect(); } };
}
