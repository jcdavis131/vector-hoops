/* player-court-skill-story.js v32 — centered hero top of skill profile • beautiful career story + skills change over time */
export async function mountPlayerCourtStory(rootEl, playerName, opts = {}) {
  if (!rootEl || !playerName) return;
  const isMobile = window.innerWidth < 760;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.8);
  const OKABE = ['#0072B2', '#D55E00', '#009E73', '#F0E442', '#56B4E9', '#CC79A7', '#E69F00', '#111111'];
  const ARCH = [
    { i:0, label:'Glass+Rim', off:32, def:92, color:OKABE[0], role:'Rim Anchor', desc:'Paint + glass' },
    { i:1, label:'LowVol Glass', off:22, def:88, color:OKABE[1], role:'Energy Big' },
    { i:2, label:'Low Impact', off:24, def:28, color:OKABE[2], role:'Deep Reserve' },
    { i:3, label:'Def Glass FT', off:46, def:71, color:OKABE[3], role:'Two-Way Big' },
    { i:4, label:'Vol+3P', off:88, def:34, color:OKABE[4], role:'Volume Scorer' },
    { i:5, label:'3P Acc+Vol', off:84, def:38, color:OKABE[5], role:'Floor Spacer' },
    { i:6, label:'Playmaking', off:76, def:66, color:OKABE[6], role:'Lead Playmaker' },
    { i:7, label:'Scoring Vol', off:91, def:40, color:OKABE[7], role:'Bucket Getter' },
  ];
  const POS_LABELS=['PG','SG','SF','PF','C'];
  const POS_OFF={PG:{x:-7,y:6},SG:{x:7,y:5},SF:{x:10,y:2},PF:{x:2,y:-2},C:{x:0,y:-4}};
  const CACHE='vector-hoops-v32-player-top-20260721';
  async function cachedFetchJSON(url){
    try{ if('caches' in window){ const c=await caches.open(CACHE); const h=await c.match(url); if(h) return await h.json(); } }catch{}
    const r=await fetch(url,{cache:'default'});
    try{ if('caches' in window){ const c=await caches.open(CACHE); c.put(url,r.clone()).catch(()=>{});} }catch{}
    return r.json();
  }

  // centered hero wrapper — max-width 980 centered
  rootEl.style.cssText='width:100%;max-width:1180px;margin:0 auto;display:flex;justify-content:center';
  rootEl.innerHTML=`
    <div id="pp-court-hero" style="width:100%;border:3.5px solid #1A150F;border-radius:24px;overflow:hidden;background:#FFFEF7;box-shadow:10px 10px 0 #1A150F;display:flex;flex-direction:column">
      <div style="padding:18px 20px;background:#1A150F;color:#FFFEF7;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <span style="background:#F0E442;color:#1A150F;border-radius:999px;padding:8px 14px;font-family:ui-monospace,monospace;font-weight:900;font-size:12px;border:2.5px solid #FFFEF7">HERO VIZ • TOP OF SKILL PROFILE</span>
          <span style="font-family:ui-monospace,monospace;font-size:12px;opacity:.8">big focal court • skills over time • 1 of 15 → 1 of 5</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="pp-court-play" style="min-height:48px;padding:0 18px;border:3px solid #FFFEF7;border-radius:999px;background:#F0E442;color:#1A150F;font-weight:900;font-family:ui-monospace,monospace;cursor:pointer">▶ Play career</button>
          <button id="pp-court-prev" style="min-height:48px;min-width:48px;border:2.5px solid #FFFEF7;border-radius:999px;background:transparent;color:#FFFEF7;font-weight:900;cursor:pointer">⟵</button>
          <button id="pp-court-next" style="min-height:48px;min-width:48px;border:2.5px solid #FFFEF7;border-radius:999px;background:transparent;color:#FFFEF7;font-weight:900;cursor:pointer">⟶</button>
        </div>
      </div>
      <div id="pp-court-main" style="display:flex;flex-direction:column;align-items:center;background:#FFF6D5">
        <div id="pp-court-focus" style="width:100%;padding:16px 20px;background:#FFFEF7;border-bottom:3px solid #1A150F;display:flex;flex-direction:column;gap:10px"></div>
        <canvas id="pp-court-canvas" style="width:100%;height:${isMobile?'76vh':'72vh'};min-height:${isMobile?'620px':'760px'};display:block;background:#FFF6D5"></canvas>
      </div>
      <div style="display:flex;gap:10px;align-items:center;padding:14px 18px;background:#1A150F">
        <div id="pp-court-scrub" style="flex:1;height:30px;background:rgba(255,254,247,.14);border:2.5px solid #FFFEF7;border-radius:999px;position:relative;cursor:pointer"><div id="pp-court-fill" style="position:absolute;left:0;top:0;bottom:0;width:0%;background:#F0E442;border-radius:999px"></div><div id="pp-court-thumb" style="position:absolute;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:999px;background:#FFFEF7;border:3px solid #1A150F;left:0"></div></div>
      </div>
      <div id="pp-court-season-chips" style="display:flex;gap:10px;overflow-x:auto;padding:16px 20px;background:#FFFEF7;border-top:3px solid #1A150F;scrollbar-width:thin"></div>
      <div id="pp-court-narrative" style="padding:18px 20px;background:#ECE7DB;border-top:3px solid #1A150F"></div>
      <div id="pp-court-skills" style="padding:18px 20px;background:#FFFEF7;border-top:3px solid #1A150F;display:grid;grid-template-columns:${isMobile?'1fr 1fr':'repeat(3,1fr)'};gap:12px"></div>
      <div id="pp-court-roster" style="padding:18px 20px;background:#fff;border-top:3px solid #1A150F"></div>
    </div>
  `;

  const canvas=rootEl.querySelector('#pp-court-canvas');
  const ctx=canvas.getContext('2d',{alpha:false});
  const focusEl=rootEl.querySelector('#pp-court-focus');
  const seasonChips=rootEl.querySelector('#pp-court-season-chips');
  const skillsEl=rootEl.querySelector('#pp-court-skills');
  const rosterEl=rootEl.querySelector('#pp-court-roster');
  const narrativeEl=rootEl.querySelector('#pp-court-narrative');
  const scrub=rootEl.querySelector('#pp-court-scrub');
  const scrubFill=rootEl.querySelector('#pp-court-fill');
  const scrubThumb=rootEl.querySelector('#pp-court-thumb');
  const btnPlay=rootEl.querySelector('#pp-court-play');
  const btnPrev=rootEl.querySelector('#pp-court-prev');
  const btnNext=rootEl.querySelector('#pp-court-next');

  function resize(){ const rect=canvas.getBoundingClientRect(); const w=Math.max(340,Math.floor(rect.width)); const h=Math.max(520,Math.floor(rect.height)); const pw=Math.floor(w*dpr), ph=Math.floor(h*dpr); if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw; canvas.height=ph;} ctx.setTransform(dpr,0,0,dpr,0,0); return {cssW:w, cssH:h}; }

  let timeData,liteData,vecData,teamData,skillsData;
  try{
    const [tData,lPos,vData,tmData,sData]=await Promise.all([
      cachedFetchJSON('assets/archetypes_time.json?v=32'),
      cachedFetchJSON('assets/vectors_search_lite_pos.json?v=32').catch(()=>cachedFetchJSON('assets/vectors_search_lite.json?v=32')),
      cachedFetchJSON('assets/vectors.json?v=32').catch(()=>null),
      cachedFetchJSON('assets/player_team_season.json?v=32').catch(()=>null),
      cachedFetchJSON('assets/skills.json?v=32').catch(()=>null),
    ]);
    timeData=tData; liteData=lPos; vecData=vData; teamData=tmData; skillsData=sData;
  }catch(e){ rootEl.innerHTML='<div style="padding:20px">Failed loading</div>'; return; }

  const seasonIdx=new Map((timeData?.prevalence||[]).map((s,i)=>[s.season,i]));
  const tmpPlayers=liteData?.players||liteData||[];
  const byName=new Map(); const playerSeasonLookup=new Map();
  for(const p of tmpPlayers){ if(!byName.has(p.n)) byName.set(p.n,[]); byName.get(p.n).push(p); playerSeasonLookup.set(`${p.n}|${p.s}`,p); }
  for(const arr of byName.values()) arr.sort((a,b)=> (a.s||'').localeCompare(b.s||''));

  const minutesMap=new Map(); if(vecData?.players){ for(const p of vecData.players) minutesMap.set(`${p.name}|${p.season}`,{gp:p.gp||0, mpg:p.mpg||0}); }
  let skillsByKey=new Map(); if(skillsData && vecData){ for(let i=0;i<vecData.players.length;i++){ const pl=vecData.players[i]; skillsByKey.set(`${pl.name}|${pl.season}`, skillsData.grades[i]); } }
  const teamMap=teamData||{};
  const teamSeasonRoster=new Map();
  for(const key of Object.keys(teamMap)){
    const sep=key.lastIndexOf('|'); if(sep<0) continue;
    const name=key.slice(0,sep), season=key.slice(sep+1), team=teamMap[key];
    const tsKey=`${team}|${season}`; if(!teamSeasonRoster.has(tsKey)) teamSeasonRoster.set(tsKey,[]);
    const entry=playerSeasonLookup.get(key); const min=minutesMap.get(key);
    teamSeasonRoster.get(tsKey).push({name,season,team,c:entry?.c??2,p:entry?.p??2,pl:entry?.pl||POS_LABELS[entry?.p]||'SF',mpg:min?.mpg||0,gp:min?.gp||0});
  }
  for(const arr of teamSeasonRoster.values()) arr.sort((a,b)=> b.mpg-a.mpg||b.gp-a.gp);

  function getCourtPos(a,pos,seed=0){ const base=ARCH[a%8]; const off=POS_OFF[pos]||POS_OFF['SF']; const jx=((seed*0.618)%1-0.5)*1.2; const jy=((seed*0.314)%1-0.5)*1.0; return {x:base.x+off.x+jx, y:base.y+off.y+jy, meta:base}; }
  function buildArc(name){
    const entries=byName.get(name)||[]; if(!entries.length) return null;
    const meta=[]; for(const e of entries){ const si=seasonIdx.get(e.s); if(si===undefined) continue; const key=`${e.n}|${e.s}`; const min=minutesMap.get(key); const team=teamMap[key]||'—'; const posLabel=e.pl||POS_LABELS[e.p]||'SF'; const cp=getCourtPos(e.c,posLabel,si); const sg=skillsByKey.get(key)||null; meta.push({season:e.s, si, archeIdx:e.c, archLabel:ARCH[e.c]?.label||`A${e.c}`, team, pl:posLabel, mpg:min?.mpg||0, gp:min?.gp||0, x:cp.x, y:cp.y, off:ARCH[e.c]?.off||50, def:ARCH[e.c]?.def||50, role:ARCH[e.c]?.role||'', color:ARCH[e.c]?.color||'#1A150F', skillGrades:sg}); }
    meta.sort((a,b)=> a.season.localeCompare(b.season)); const changes=[]; for(let i=1;i<meta.length;i++) if(meta[i].archeIdx!==meta[i-1].archeIdx) changes.push({idx:i, from:meta[i-1], to:meta[i]}); return {name, meta, changes};
  }

  let current=buildArc(playerName); if(!current){ rootEl.innerHTML=`<div style="padding:16px">No data for ${playerName}</div>`; return; }
  let tProg=0, paused=true, layoutCache=null, used=new Set();

  function ftToScreen(ftX,ftY,L){ return {x:L.cx+ftX*L.scale, y:L.baseY-ftY*L.scale}; }
  function makeLayout(cssW,cssH){ const pad=24; const courtH=cssH*0.86; const courtW=cssW-pad*2; const scale=Math.min(courtH/50, courtW/54); return {cx:cssW/2, baseY:cssH*0.90, scale, cssW, cssH}; }
  function drawBg(cssW,cssH,teamAbbr){ ctx.fillStyle='#FFF6D5'; ctx.fillRect(0,0,cssW,cssH); ctx.strokeStyle='rgba(26,21,15,0.05)'; ctx.lineWidth=1; for(let y=0;y<cssH;y+=20){ ctx.beginPath(); ctx.moveTo(0,y+0.5); ctx.lineTo(cssW,y+0.5); ctx.stroke(); } if(teamAbbr && teamAbbr!=='—'){ ctx.save(); ctx.globalAlpha=0.07; ctx.font=`900 ${Math.floor(cssW*0.28)}px ui-sans-serif,system-ui`; ctx.textAlign='center'; ctx.fillStyle='#1A150F'; ctx.fillText(teamAbbr, cssW/2, cssH*0.32); ctx.restore(); } }
  function drawCourt(L){ const {cx,baseY,scale}=L; const tl=ftToScreen(-25,47,L), tr=ftToScreen(25,47,L), bl=ftToScreen(-25,0,L); ctx.strokeStyle='#1A150F'; ctx.lineWidth=3.4; ctx.strokeRect(tl.x, tl.y, tr.x-tl.x, bl.y-tl.y); ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.stroke(); const pL=ftToScreen(-8,0,L), pR=ftToScreen(8,0,L), pT=ftToScreen(8,19,L); ctx.fillStyle='rgba(26,21,15,0.07)'; ctx.fillRect(pL.x,pT.y,pR.x-pL.x,pL.y-pT.y); ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.4; ctx.strokeRect(pL.x,pT.y,pR.x-pL.x,pL.y-pT.y); const ftC=ftToScreen(0,19,L); const r6=6*scale; ctx.beginPath(); ctx.arc(ftC.x,ftC.y,r6,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([7,7]); ctx.strokeStyle='rgba(26,21,15,0.45)'; ctx.beginPath(); ctx.arc(ftC.x,ftC.y,r6,0,Math.PI); ctx.stroke(); ctx.setLineDash([]); const basket=ftToScreen(0,5.25,L), b1=ftToScreen(-3,4,L), b2=ftToScreen(3,4,L); ctx.strokeStyle='#1A150F'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(b1.x,b1.y); ctx.lineTo(b2.x,b2.y); ctx.stroke(); ctx.strokeStyle='#E03A3E'; ctx.lineWidth=2.6; ctx.beginPath(); ctx.arc(basket.x,basket.y,0.9*scale,0,Math.PI*2); ctx.stroke(); const lc=ftToScreen(-22,0,L), le=ftToScreen(-22,14,L), re=ftToScreen(22,14,L), rc=ftToScreen(22,0,L); const r=23.75*scale; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.4; ctx.beginPath(); ctx.moveTo(lc.x,lc.y); ctx.lineTo(le.x,le.y); const aL=Math.atan2(le.y-basket.y,le.x-basket.x), aR=Math.atan2(re.y-basket.y,re.x-basket.x); ctx.arc(basket.x,basket.y,r,aL,aR,false); ctx.lineTo(rc.x,rc.y); ctx.stroke(); ctx.beginPath(); ctx.arc(basket.x,basket.y,4*scale,0,Math.PI); ctx.stroke(); ctx.fillStyle='#1A150F'; ctx.globalAlpha=0.6; ctx.font='800 11px ui-monospace,monospace'; ctx.textAlign='center'; ctx.fillText('BASELINE — 15 ROSTER → 1 OF 5 ON FLOOR', L.cx, L.baseY+18); ctx.globalAlpha=1; }
  function sparkline(vals,w=160,h=36,c='#1A150F'){ if(!vals.length) return ''; const mn=Math.min(...vals), mx=Math.max(...vals), rng=Math.max(0.001,mx-mn); const pts=vals.map((v,i)=>{ const x=(i/(vals.length-1))*w; const y=h-((v-mn)/rng)*h; return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' '); return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block"><polyline fill="none" stroke="${c}" stroke-width="2.8" points="${pts}" stroke-linejoin="round"/><polygon fill="${c}" opacity="0.14" points="0,${h} ${pts} ${w},${h}"/></svg>`; }

  function buildNarrative(){ const first=current.meta[0], last=current.meta[current.meta.length-1]; const teams=[...new Set(current.meta.map(m=>m.team))].filter(t=>t!=='—'); const offDelta=last.off-first.off, defDelta=last.def-first.def; let bestGrow=''; if(first.skillGrades && last.skillGrades && skillsData){ let bi=-1,bd=-999; for(let j=0;j<last.skillGrades.length;j++){ const d=last.skillGrades[j]-first.skillGrades[j]; if(d>bd){bd=d; bi=j;}} if(bi>=0 && bd>5){ bestGrow=` Biggest jump: ${skillsData.skills[bi].label} ${first.skillGrades[bi]}→${last.skillGrades[bi]} (+${bd}).`; }} return `${current.name} — ${current.meta.length} seasons ${first.season}→${last.season} • ${teams.length} teams: ${teams.slice(0,4).join(', ')} • Entered as ${first.archLabel} (${first.team} ${first.season}, O${first.off} D${first.def}) → became ${last.archLabel} (${last.team} ${last.season}, O${last.off} D${last.def}). Off ${offDelta>=0?'+':''}${offDelta}, Def ${defDelta>=0?'+':''}${defDelta}.${bestGrow} Always 1 of 15, earned 1 of 5 minutes: ${first.mpg.toFixed(1)}→${last.mpg.toFixed(1)} MPG.`; }

  function draw(){
    const {cssW,cssH}=resize();
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const cur=current.meta[idx];
    drawBg(cssW,cssH,cur.team);
    const L=makeLayout(cssW,cssH); layoutCache=L; drawCourt(L);
    const allScreen=current.meta.map(m=> ftToScreen(m.x,m.y,L));

    ctx.strokeStyle='rgba(26,21,15,0.16)'; ctx.lineWidth=2; ctx.setLineDash([9,9]); ctx.beginPath(); allScreen.forEach((p,i)=>{ if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=4.8; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath(); for(let i=0;i<=idx;i++){ const p=allScreen[i]; if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); } ctx.stroke();
    ctx.strokeStyle='#F0E442'; ctx.lineWidth=10; ctx.globalAlpha=0.42; ctx.beginPath(); for(let i=0;i<=idx;i++){ const p=allScreen[i]; if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); } ctx.stroke(); ctx.globalAlpha=1;

    const teamKey=`${cur.team}|${cur.season}`; const roster=(teamSeasonRoster.get(teamKey)||[]); const top5=roster.slice(0,5); let floorUnit=top5; if(!top5.some(r=> r.name===current.name) && roster.length){ const focal=roster.find(r=> r.name===current.name); if(focal) floorUnit=[...top5.slice(0,4), focal]; }
    for(const tm of floorUnit){ if(tm.name===current.name) continue; const pos=getCourtPos(tm.c,tm.pl,cur.si+tm.name.length*0.13); const s=ftToScreen(pos.x,pos.y,L); ctx.fillStyle=ARCH[tm.c%8]?.color||'#fff'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.4; ctx.beginPath(); ctx.arc(s.x,s.y,20,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle='#1A150F'; ctx.font='800 12px ui-monospace,monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(tm.pl, s.x, s.y+1); }
    for(let i=0;i<current.meta.length;i++){ const p=allScreen[i]; const m=current.meta[i]; if(i===idx) continue; const isChange=i>0 && m.archeIdx!==current.meta[i-1].archeIdx; ctx.fillStyle=m.color; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(p.x,p.y,isChange?8:5,0,Math.PI*2); ctx.fill(); ctx.stroke(); if(isChange){ ctx.strokeStyle='#F0E442'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(p.x,p.y,13,0,Math.PI*2); ctx.stroke(); } }

    const curP=allScreen[idx];
    ctx.globalAlpha=0.20; ctx.fillStyle=cur.color; ctx.beginPath(); ctx.arc(curP.x,curP.y,38,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle='#1A150F'; ctx.beginPath(); ctx.arc(curP.x,curP.y,24,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=cur.color; ctx.beginPath(); ctx.arc(curP.x,curP.y,19,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#1A150F'; ctx.lineWidth=3; ctx.stroke();
    ctx.fillStyle='#FFFEF7'; ctx.font='900 14px ui-monospace,monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(cur.pl, curP.x, curP.y);

    const change=current.changes.find(c=> c.idx===idx);
    if(change){ const txt=`${change.from.archLabel} → ${change.to.archLabel}`; ctx.font='900 14px ui-monospace,monospace'; const tw=ctx.measureText(txt).width; const bw=tw+32, bh=34; const bx=curP.x-bw/2, by=curP.y-72; ctx.fillStyle='#F0E442'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.6; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(bx,by,bw,bh,14); else ctx.rect(bx,by,bw,bh); ctx.fill(); ctx.stroke(); ctx.fillStyle='#1A150F'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt, curP.x, by+bh/2); }

    renderUI();
  }

  function renderUI(){
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const cur=current.meta[idx];
    const roster=teamSeasonRoster.get(`${cur.team}|${cur.season}`)||[];
    const rankIdx=roster.findIndex(r=> r.name===current.name); const rank=rankIdx>=0? rankIdx+1:null; const total=roster.length||15; const isStarter=rank!==null && rank<=5;
    const stage=(()=>{ const r=idx/Math.max(1,current.meta.length-1); if(r<0.18) return 'Rookie'; if(r<0.35) return 'Breakout'; if(r<0.62) return 'Prime'; if(r<0.84) return 'Veteran'; return 'Late'; })();

    focusEl.innerHTML=`
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <div style="display:flex;gap:12px;align-items:center;border:3px solid #1A150F;border-radius:16px;padding:10px 14px;background:#fff;box-shadow:4px 4px 0 #1A150F">
          <div style="width:52px;height:52px;border-radius:999px;background:${cur.color};border:3px solid #1A150F;display:flex;align-items:center;justify-content:center;font-weight:900;font-family:ui-monospace,monospace;font-size:16px">${cur.pl}</div>
          <div><div style="font-weight:900;font-size:20px;line-height:1.1">${current.name} • ${cur.team} ${cur.season} • ${stage}</div><div style="font-family:ui-monospace,monospace;font-size:12px;opacity:.7">${cur.archLabel} • ${cur.role} • ${cur.gp} GP • ${cur.mpg.toFixed(1)} MPG • O${cur.off} D${cur.def}</div></div>
        </div>
        <span style="border-radius:999px;padding:10px 16px;border:3px solid #1A150F;background:${isStarter?'#F0E442':'#1A150F'};color:${isStarter?'#1A150F':'#FFFEF7'};font-family:ui-monospace,monospace;font-weight:900;font-size:13px;box-shadow:3px 3px 0 #1A150F">${isStarter?`1 of 5 starter #${rank}`:`1 of 15 #${rank} (1 of 5 when in)`}</span>
        ${current.changes.find(c=>c.idx===idx)? `<span style="border-radius:999px;padding:10px 16px;border:3px solid #1A150F;background:#F0E442;font-family:ui-monospace,monospace;font-weight:900;font-size:12px">SHIFT ${current.changes.find(c=>c.idx===idx).from.archLabel}→${current.changes.find(c=>c.idx===idx).to.archLabel}</span>`:''}
      </div>`;

    seasonChips.innerHTML=''; current.meta.forEach((m,i)=>{ const b=document.createElement('button'); b.style.cssText=`border-radius:999px;padding:12px 16px;font-family:ui-monospace,monospace;font-size:13px;font-weight:800;border:3px solid #1A150F;flex:0 0 auto;cursor:pointer;${i===idx?'background:#1A150F;color:#FFFEF7;box-shadow:4px 4px 0 #1A150F;transform:translateY(-2px)': i<idx?'background:#fff;color:#1A150F;box-shadow:2px 2px 0 #1A150F':'background:#ECE7DB;color:#6B6760;border-style:dashed'}`; b.innerHTML=`<span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${m.color};border:1.5px solid #1A150F;margin-right:6px"></span>${m.season} ${m.team} ${m.archLabel} • ${m.mpg.toFixed(0)} MPG`; b.onclick=()=>{ tProg=i/current.meta.length; paused=false; btnPlay.textContent='❚❚ Pause'; draw(); }; seasonChips.appendChild(b); });

    // narrative + skills
    if(narrativeEl) narrativeEl.innerHTML=`<div style="border:3px solid #1A150F;border-radius:16px;background:#1A150F;color:#FFFEF7;padding:14px 16px;font-family:ui-sans-serif,system-ui;font-size:14px;line-height:1.55;font-weight:600">${buildNarrative()}</div>`;

    if(skillsData && cur.skillGrades){
      const first=cur.skillGrades? current.meta[0].skillGrades:null;
      const sLabs=skillsData.skills;
      skillsEl.innerHTML=sLabs.map((sk,j)=>{ const v=cur.skillGrades[j]; const v0=first? first[j]:null; const d=v0!=null? v-v0:0; const vals=current.meta.map(mm=> mm.skillGrades? mm.skillGrades[j]:null).filter(x=> x!=null); const firstV=vals[0], lastV=vals[vals.length-1]; const delta=lastV-firstV; return `<div style="border:2.5px solid #1A150F;border-radius:14px;padding:12px;background:#fff;box-shadow:3px 3px 0 #1A150F"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-family:ui-monospace,monospace;font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase">${sk.label}</span><span style="font-family:ui-monospace,monospace;font-size:12px;font-weight:900">${v0!=null?`${firstV}→`:''}${v} <span style="color:${delta>=0?'#009E73':'#D55E00'}">${delta>=0?'+':''}${delta}</span></span></div><div style="margin-top:8px">${sparkline(vals, isMobile?140:180, 38, j%2? '#0072B2':'#D55E00')}</div><div style="height:8px;background:#ECE7DB;border-radius:999px;margin-top:6px;overflow:hidden;border:1.5px solid #1A150F"><div style="width:${Math.max(4,v)}%;height:100%;background:${v>=90?'#0072B2': v>=75?'#009E73':'#1A150F'}"></div></div></div>`; }).join('');
    }

    const sorted=roster.slice(0,15);
    rosterEl.innerHTML=`<div style="font-family:ui-monospace,monospace;font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">${cur.team} ${cur.season} • ${total} players sorted by MPG • you #${rank||'?'} • 1 of 15 always, fight to be 1 of 5</div><div style="display:flex;flex-wrap:wrap;gap:8px">${sorted.map(r=> `<span style="border:2.5px solid #1A150F;border-radius:999px;padding:8px 12px;font-family:ui-monospace,monospace;font-size:12px;font-weight:800;background:${r.name===current.name?'#1A150F':'#fff'};color:${r.name===current.name?'#FFFEF7':'#1A150F'};box-shadow:2px 2px 0 #1A150F"><span style="width:10px;height:10px;border-radius:999px;background:${ARCH[r.c%8]?.color};display:inline-block;border:1.5px solid #1A150F"></span> ${r.name.split(' ').pop()} ${r.pl} ${r.mpg.toFixed(0)}</span>`).join('')}</div>`;

    if(scrubFill) scrubFill.style.width=`${(tProg*100).toFixed(1)}%`;
    if(scrubThumb) scrubThumb.style.left=`${(tProg*100).toFixed(1)}%`;
  }

  canvas.addEventListener('click', (e)=>{ if(!layoutCache) return; const rect=canvas.getBoundingClientRect(); const x=e.clientX-rect.left, y=e.clientY-rect.top; const pts=current.meta.map(m=> ftToScreen(m.x,m.y,layoutCache)); let best=-1,bd=Infinity; pts.forEach((p,i)=>{ const d=(p.x-x)**2+(p.y-y)**2; if(d<bd){bd=d; best=i;}}); if(best>=0 && bd< 2000){ tProg=best/current.meta.length; draw(); } });
  if(scrub){ let dragging=false; const setFromX=xx=>{ const r=scrub.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(xx-r.left)/r.width)); tProg=p; draw(); }; scrub.addEventListener('pointerdown',e=>{ dragging=true; try{scrub.setPointerCapture(e.pointerId);}catch{} setFromX(e.clientX); paused=true; btnPlay.textContent='▶ Play career'; }); scrub.addEventListener('pointermove',e=>{ if(dragging) setFromX(e.clientX); }); scrub.addEventListener('pointerup',()=>{ dragging=false; }); scrub.addEventListener('click',e=> setFromX(e.clientX)); }
  if(btnPlay) btnPlay.addEventListener('click',()=>{ if(paused){ paused=false; btnPlay.textContent='❚❚ Pause'; } else { paused=true; btnPlay.textContent='▶ Play career'; } });
  if(btnNext) btnNext.addEventListener('click',()=>{ paused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; const idx=Math.floor(tProg*current.meta.length); for(let j=idx+1;j<current.meta.length;j++) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; draw(); return; } tProg=1; draw(); });
  if(btnPrev) btnPrev.addEventListener('click',()=>{ paused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; const idx=Math.floor(tProg*current.meta.length); for(let j=idx-1;j>=1;j--) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; draw(); return; } tProg=0; draw(); });

  function tick(){ requestAnimationFrame(tick); if(paused) return; tProg+=0.00032; if(tProg>1) tProg=0; draw(); } tick();
  const ro=new ResizeObserver(()=> draw()); ro.observe(canvas);
  draw();

  // keep global reference for players-skills.js to know defs
  if(skillsData) window._skillsDefs=skillsData.skills;

  return { show:(name)=>{ const arc=buildArc(name); if(arc){ current=arc; tProg=0; draw(); } } };
}

// helper mount used by players-skills.js wrapper
export async function mountCourtFor(name){
  const root=document.getElementById('pp-court-skill-root');
  if(!root) return;
  await mountPlayerCourtStory(root, name);
}
