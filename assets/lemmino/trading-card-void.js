/* trading-card-void.js v38 — cleaned for Sunni AAA readability */
export async function mountTradingCardVoid(root){
  if(!root) return;
  const CACHE='vector-hoops-v38-20260722-clean';
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#111111'];
  const ARCH_LABELS=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const FULL_LABELS=["Offensive Glass + Rim Protection","Offensive Glass (Low Shot Volume)","Three-Point Volume (Low On-Court Impact)","Defensive Glass + Rim Pressure (Fts)","Shot Volume + Three-Point Volume","Three-Point Accuracy + Three-Point Volume","Playmaking + Steals","Scoring Volume + Shot Volume"];

  async function cachedFetchJSON(url){
    try{
      if('caches' in window){
        const c=await caches.open(CACHE);
        const hit=await c.match(url);
        if(hit) return await hit.json();
      }
    }catch{}
    const r=await fetch(url,{cache:'default'});
    if(!r.ok) throw new Error('fetch '+url+' '+r.status);
    try{ if('caches' in window){ const c=await caches.open(CACHE); c.put(url, r.clone()).catch(()=>{}); } }catch{}
    return r.json();
  }

  root.innerHTML=`
    <div class="tc-header">
      <div>
        <h2 class="tc-title">Where you <span class="accent">stood</span>, how you grew.</h2>
        <p class="tc-sub">Every season is a card. 12,966 charted. Search any name — see their arc from rookie to now. Light, high-contrast, tap-friendly.</p>
      </div>
      <div class="tc-search-wrap">
        <div class="tc-search-row">
          <input id="tc-search" type="text" placeholder="Search — Curry, Jokic, Wemby, LeBron…" autocomplete="off" spellcheck="false" />
          <button class="tc-btn tc-btn--yellow" id="tc-random" type="button">🎲 Random</button>
        </div>
        <ul class="tc-suggest" id="tc-suggest"></ul>
      </div>
    </div>
    <div class="tc-stage" id="tc-stage">
      <div class="tc-card" id="tc-card"><div style="padding:22px;font-family:ui-monospace;font-size:13px">Loading 12,966 cards…</div></div>
      <div class="tc-detail" id="tc-detail"><div style="font-family:ui-monospace;font-size:13px;line-height:1.6;color:#2E2A23">Pick a player to see a clean, readable arc. No jargon.</div></div>
    </div>
  `;

  let SEARCH=null, SKILLS=null, ARCH_TIME=null;
  let byName={}, ORDER=[];
  let curName='LeBron James';
  let curSeasonIdx=0;
  let archNames=FULL_LABELS;

  function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
  function slugName(n){ return n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
  function seasonShort(s){ return s; } // keep full YYYY-YY for readability

  function gradeTier(g){
    if(g>=97) return {pill:'background:#1A150F;color:#fff;border-color:#1A150F', fill:'#1A150F', label:'ELITE'};
    if(g>=90) return {pill:'background:#0072B2;color:#fff;border-color:#0072B2', fill:'#0072B2', label:'ELITE'};
    if(g>=75) return {pill:'background:#009E73;color:#fff;border-color:#009E73', fill:'#009E73', label:'STRONG'};
    if(g>=60) return {pill:'background:#fff;color:#1A150F', fill:'#6B665E', label:'AVG'};
    return {pill:'background:#EEE8D9;color:#5A5248', fill:'#C9C2B4', label:'LOW'};
  }

  try{
    const [searchPos, skills, archTime, vectors] = await Promise.all([
      cachedFetchJSON('assets/vectors_search_lite_pos.json?v=39'),
      cachedFetchJSON('assets/skills.json?v=39').catch(()=>null),
      cachedFetchJSON('assets/archetypes_time.json?v=39').catch(()=>null),
      cachedFetchJSON('assets/vectors.json?v=39').catch(()=>null)
    ]);
    SEARCH=searchPos; SKILLS=skills; ARCH_TIME=archTime;
    if(vectors && vectors.clusters && vectors.clusters.length) archNames=vectors.clusters;
    else if(archTime && archTime.gameGlobalArchetypes) archNames=archTime.gameGlobalArchetypes;
    else archNames=FULL_LABELS;

    for(let i=0;i<SEARCH.players.length;i++){
      const p=SEARCH.players[i];
      const name=p.n;
      if(!byName[name]) byName[name]={name, rows:[]};
      byName[name].rows.push({season:p.s, c:p.c, p:p.p, i:p.i, x:p.x, y:p.y, z:p.z, pl:p.pl});
    }
    for(const k in byName){ byName[k].rows.sort((a,b)=> a.season < b.season ? -1 : 1); }
    ORDER=Object.keys(byName).sort((a,b)=> a.localeCompare(b));
    if(!byName[curName]) curName=ORDER[Math.floor(Math.random()*ORDER.length)];
    curSeasonIdx=byName[curName].rows.length-1;
    bindEvents(); render();
  }catch(e){
    console.warn('trading card load fail', e);
    const card=document.getElementById('tc-card');
    if(card) card.innerHTML=`<div style="padding:18px;font-family:ui-monospace">Load failed: ${esc(e.message||'err')}</div>`;
    return;
  }

  function bindEvents(){
    const search=document.getElementById('tc-search');
    const suggest=document.getElementById('tc-suggest');
    const rand=document.getElementById('tc-random');
    if(!search) return;
    search.addEventListener('input', ()=>{
      const q=search.value.trim().toLowerCase();
      if(q.length<2){ suggest.innerHTML=''; return; }
      let hits=[]; for(let k=0;k<ORDER.length && hits.length<8;k++){ if(ORDER[k].toLowerCase().includes(q)) hits.push(ORDER[k]); }
      suggest.innerHTML=hits.map(name=>{
        const rec=byName[name];
        const span=rec.rows.length>1 ? rec.rows[0].season.slice(0,4)+'→'+rec.rows[rec.rows.length-1].season.slice(0,4) : rec.rows[0].season;
        return `<li><button type="button" data-name="${esc(name)}"><span><b>${esc(name)}</b><br><span style="font-family:ui-monospace;font-size:11px;color:#444">${esc(span)} · ${rec.rows.length} seasons</span></span><span>→</span></button></li>`;
      }).join('');
    });
    suggest.addEventListener('click', (ev)=>{
      const btn=ev.target.closest('button[data-name]'); if(!btn) return;
      curName=btn.getAttribute('data-name'); curSeasonIdx=byName[curName].rows.length-1;
      search.value=curName; suggest.innerHTML=''; render();
    });
    rand.addEventListener('click', ()=>{
      const name=ORDER[Math.floor(Math.random()*ORDER.length)];
      curName=name; curSeasonIdx=byName[name].rows.length-1;
      search.value=name; suggest.innerHTML=''; render();
      const card=document.getElementById('tc-card');
      if(card) card.animate([{transform:'rotate(-1.2deg) scale(.97)'},{transform:'rotate(-0.4deg) scale(1)'}],{duration:220, easing:'cubic-bezier(.2,.8,.2,1)'});
    });
  }

  function groupsFor(rec){
    if(!rec.rows.length) return [];
    let grps=[]; let cur={c:rec.rows[0].c, seasons:[rec.rows[0]], start:0};
    for(let i=1;i<rec.rows.length;i++){
      const r=rec.rows[i];
      if(r.c===cur.c) cur.seasons.push(r);
      else { grps.push(cur); cur={c:r.c, seasons:[r], start:i}; }
    }
    grps.push(cur); return grps;
  }

  function render(){
    const rec=byName[curName]; if(!rec) return;
    if(curSeasonIdx<0) curSeasonIdx=0; if(curSeasonIdx>=rec.rows.length) curSeasonIdx=rec.rows.length-1;
    const curRow=rec.rows[curSeasonIdx];
    const latest=rec.rows[rec.rows.length-1]; const earliest=rec.rows[0];
    let grades=null, count99=0, count90=0, avg=0;
    if(SKILLS && SKILLS.grades && SKILLS.grades[curRow.i]){
      grades=SKILLS.grades[curRow.i];
      let sum=0; for(let g of grades){ sum+=g; if(g>=99) count99++; if(g>=90) count90++; } avg=Math.round(sum/grades.length);
    }
    const curArchName = archNames[curRow.c] || FULL_LABELS[curRow.c] || 'Unknown';
    const curColor = OKABE[curRow.c % OKABE.length];
    const foilClass = `tc-foil tc-foil--c${curRow.c % 8}`;
    const grps = groupsFor(rec);
    const shifts = grps.length-1;

    const cardEl=document.getElementById('tc-card');
    if(cardEl){
      cardEl.setAttribute('data-rarity', count99>=3 ? 'gold' : 'base');
      cardEl.innerHTML=`
        <div class="${foilClass}"></div>
        <div class="tc-head">
          <h3 class="tc-name">${esc(curName)}</h3>
          <span class="tc-mega"><b>${count99 || count90 || avg || '—'}</b>${count99?'×99':count90?'×90+':''}</span>
        </div>
        <div class="tc-meta">
          <span class="tc-pill"><span class="tc-dot" style="background:${curColor}"></span>${esc(curRow.season)}</span>
          <span class="tc-pill">${esc(curRow.pl||'?')}</span>
          <span class="tc-pill tc-pill--arch" title="${esc(curArchName)}"><span class="tc-dot" style="background:${curColor}"></span>${esc((curArchName.split('+')[0]||curArchName).trim())}</span>
          <span class="tc-pill">${rec.rows.length} seasons</span>
        </div>
        <div class="tc-art tc-art--light" id="tc-art">
          <canvas id="tc-arc-canvas" width="360" height="184" aria-label="career arc from rookie to now"></canvas>
          <div class="tc-art-axis tc-art-axis--x">ROOKIE → NOW • ${esc(earliest.season)} → ${esc(latest.season)}</div>
          <div class="tc-art-axis tc-art-axis--y">COURT ROLE</div>
        </div>
        <div class="tc-rarity ${count99?'tc-rarity--gold':'tc-rarity--blue'}">
          <span><b>${count99?count99+'×99':count90?count90+'×90+':'AVG '+avg}</b> — ${count99>=3?'Top 0.3% seasons':count99?'Top 1% that year':count90?'Two-way star':'Role specialist'}</span>
          <span style="margin-left:auto;opacity:.7">${esc(earliest.season.slice(0,4))}→${esc(latest.season.slice(0,4))} · ${rec.rows.length} yrs · ${shifts} shifts</span>
        </div>
        <div class="tc-tabs" role="tablist">
          <button type="button" data-tab="arc" class="is-active">ARC</button>
          <button type="button" data-tab="skills">SKILLS</button>
          <button type="button" data-tab="story">STORY</button>
        </div>
        <div class="tc-body" id="tc-body-arc">
          <div class="tc-section-head">Career path — tap a season to jump</div>
          <div class="tc-arc-row" id="tc-arc-row">
            ${rec.rows.map((r,idx)=>`<button class="tc-chip ${idx===curSeasonIdx?'is-active':''}" data-idx="${idx}" aria-label="Season ${r.season}" style="${idx===curSeasonIdx?`background:#1A150F;color:#fff;--dot:${OKABE[r.c%8]}`:`background:#fff`}"><span class="tc-dot" style="background:${OKABE[r.c%8]};width:10px;height:10px"></span> ${esc(r.season)}</button>`).join('')}
          </div>
          <div class="tc-spark tc-spark--tall"><canvas id="tc-share-canvas" width="360" height="96" aria-label="how common this playing style was"></canvas><div class="tc-footnote tc-footnote--clear">How common this style was · Left = rookie year, right = now · Line up = more players played this way that season · Dot = selected season</div></div>
        </div>
        <div class="tc-body" id="tc-body-skills" hidden>
          <div class="tc-section-head">Elite badges — 90+ compared to league that year</div>
          <div class="tc-badges" id="tc-badges"></div>
          <div class="tc-section-head" style="margin-top:10px">All skills 0–99 — higher = better than more of league</div>
          <ul class="tc-skills" id="tc-skills"></ul>
        </div>
        <div class="tc-body" id="tc-body-story" hidden>
          <div class="tc-section-head">Plain-English story</div>
          <p class="tc-story" id="tc-story"></p>
          <div class="tc-actions">
            <a class="tc-btn" href="/players?p=${encodeURIComponent(slugName(curName))}&s=${encodeURIComponent(curRow.season)}#profile">Open full dossier →</a>
            <button class="tc-btn tc-btn--yellow" id="tc-share">Share card</button>
          </div>
          <div class="tc-footnote" id="tc-footnote"></div>
        </div>
      `;
      const arcRow=cardEl.querySelector('#tc-arc-row');
      if(arcRow){ arcRow.addEventListener('click', (ev)=>{ const b=ev.target.closest('button[data-idx]'); if(!b) return; curSeasonIdx=parseInt(b.getAttribute('data-idx'),10); render(); }); }
      const tabs=cardEl.querySelectorAll('.tc-tabs button');
      tabs.forEach(btn=>{ btn.addEventListener('click', ()=>{ const tab=btn.getAttribute('data-tab'); cardEl.querySelectorAll('.tc-body').forEach(b=> b.hidden=true); const target=cardEl.querySelector('#tc-body-'+tab); if(target) target.hidden=false; tabs.forEach(t=> t.classList.remove('is-active')); btn.classList.add('is-active'); }); });
      requestAnimationFrame(()=>{ drawArcCanvas(rec, curSeasonIdx); drawShareCanvas(rec, curSeasonIdx); renderSkillsIntoCard(rec, curSeasonIdx); renderStoryIntoCard(rec, curSeasonIdx); });
      const shareBtn=cardEl.querySelector('#tc-share');
      if(shareBtn){ shareBtn.addEventListener('click', async ()=>{ const url = location.origin + '/players?p='+encodeURIComponent(slugName(curName))+'&s='+encodeURIComponent(curRow.season)+'#profile'; try{ if(navigator.clipboard) await navigator.clipboard.writeText(url); shareBtn.textContent='Copied!'; setTimeout(()=> shareBtn.textContent='Share card', 1200); }catch{} }); }
    }

    const detail=document.getElementById('tc-detail');
    if(detail){
      // clean timeline — one bar per archetype run, not 8 identical pills
      let timelineHTML='';
      if(grps.length===1){
        const g=grps[0]; const name=archNames[g.c]||FULL_LABELS[g.c]||''; const col=OKABE[g.c%8];
        timelineHTML=`
          <div class="tc-timeline-clean">
            <div class="tc-timeline-stable" style="--col:${col};border-color:#1A150F">
              <div class="tc-timeline-stable__icon" style="background:${col}"><span class="tc-dot" style="background:#fff;width:8px;height:8px"></span></div>
              <div class="tc-timeline-stable__text">
                <b>${esc(name)}</b><br><span style="font-weight:600;color:#5A544D">${g.seasons.length} seasons straight — no shifts. From ${esc(g.seasons[0].season)} to ${esc(g.seasons[g.seasons.length-1].season)}</span>
              </div>
            </div>
            <div class="tc-timeline-years"><span>${esc(earliest.season)}</span><div class="tc-timeline-years__line"><span class="tc-timeline-years__dot is-active" style="background:${col};border-color:#1A150F"></span></div><span>${esc(latest.season)}</span></div>
          </div>`;
      } else {
        timelineHTML=`<div class="tc-timeline-clean"><div class="tc-timeline-bar">`+
          grps.map(g=>{ const name=archNames[g.c]||''; const col=OKABE[g.c%8]; const w=(g.seasons.length/rec.rows.length*100).toFixed(1); return `<div class="tc-timeline-seg" style="--col:${col};flex:${g.seasons.length}" title="${esc(name)} ${g.seasons[0].season}→${g.seasons[g.seasons.length-1].season}"><div class="seg-color" style="background:${col}"></div><span class="seg-label">${esc((name.split(' ')[0]||name).slice(0,14))} · ${g.seasons.length}yrs</span><span class="seg-years">${esc(g.seasons[0].season.slice(2,4))}→${esc(g.seasons[g.seasons.length-1].season.slice(2,4))}</span></div>`; }).join('')+
          `</div><div class="tc-timeline-foot">Each block = time spent as that playing style. Tap a season below to see details.</div></div>`;
      }

      const detailArcHeight = rec.rows.length>14 ? 140 : 120;

      detail.innerHTML=`
        <div class="tc-detail-head"><h3 style="font-size:22px;line-height:1.15;margin:0;font-family:'Architects Daughter',monospace">${esc(curName)} — ${esc(curRow.season)}</h3><span class="tc-pill" style="background:#1A150F;color:#fff;min-height:32px">${count99?count99+'×99':count90?count90+'×90+':'avg '+avg}</span></div>
        ${timelineHTML}
        <div class="tc-detail-dots" id="tc-detail-dots">
          ${rec.rows.map((r,idx)=>`<button class="tc-season-dot ${idx===curSeasonIdx?'is-active':''}" data-idx="${idx}" style="--col:${OKABE[r.c%8]}" aria-label="${r.season}"><span class="dot" style="background:${OKABE[r.c%8]}"></span><span class="yr">${esc(r.season.slice(2,7))}</span></button>`).join('')}
        </div>
        <div class="tc-spark tc-spark--tall"><canvas id="tc-detail-arc" width="520" height="${detailArcHeight}" aria-label="career timeline"></canvas><div class="tc-footnote tc-footnote--clear">Dot = season · Color = playing style · Rookie left, veteran right</div></div>
        <p class="tc-story" style="font-size:15px;line-height:1.65"><b>Arc:</b> ${esc(earliest.season)} → ${esc(latest.season)} — ${rec.rows.length} seasons, ${shifts} position shifts, peak ${count99?count99+'×99':count90?count90+'×90+':'avg '+avg}. <b>Now:</b> ${esc(curArchName)}. ${shifts===0? 'Same style his whole career — rare consistency.' : shifts+' shifts show how his role changed over time.'}</p>
        <div class="tc-actions"><a class="tc-btn tc-btn--yellow" href="/players?p=${encodeURIComponent(slugName(curName))}#profile" style="min-height:44px">Open dossier</a><a class="tc-btn" href="/trends" style="min-height:44px">See league trends →</a></div>
        <div class="tc-footnote">Grades are 0–99 compared to other players that same season. Tracking stats from 2015-16 on.</div>
      `;
      requestAnimationFrame(()=> drawDetailArc(rec, curSeasonIdx));
      detail.querySelectorAll('[data-idx]').forEach(b=> b.addEventListener('click', ()=>{ curSeasonIdx=parseInt(b.getAttribute('data-idx'),10); render(); }));
    }
  }

  function drawArcCanvas(rec, curIdx){
    const canvas=document.getElementById('tc-arc-canvas'); if(!canvas) return;
    const dpr=Math.min(devicePixelRatio||1, 1.5);
    const rect=canvas.getBoundingClientRect();
    canvas.width=rect.width*dpr; canvas.height=rect.height*dpr;
    const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    const W=rect.width, H=rect.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H);
    // grid
    ctx.strokeStyle='rgba(26,21,15,0.07)'; ctx.lineWidth=1;
    for(let i=1;i<4;i++){ ctx.beginPath(); ctx.moveTo(16, H*0.16 + (H*0.62*i/4.5)); ctx.lineTo(W-16, H*0.16 + (H*0.62*i/4.5)); ctx.stroke(); }
    // axis baseline
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(16, H*0.78); ctx.lineTo(W-16, H*0.78); ctx.stroke();
    const n=rec.rows.length; if(n<1) return;
    const padX=18; const useW=W-padX*2;
    const pts=rec.rows.map((r,i)=>{
      const x= padX + useW * (i/(Math.max(1,n-1)));
      const y = H*0.22 + (H*0.52) * (1 - (r.c/7.5)); // spread by archetype for visual separation but stable
      // add small wave for readability when stable
      const wob = Math.sin(i*0.75)*5;
      return {x, y: y + wob, c:r.c};
    });
    // line
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for(let i=1;i<pts.length;i++){ const mx=(pts[i-1].x+pts[i].x)/2; ctx.quadraticCurveTo(pts[i-1].x, pts[i-1].y, mx, (pts[i-1].y+pts[i].y)/2); if(i===pts.length-1) ctx.lineTo(pts[i].x, pts[i].y); }
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.4; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke();
    // dots — 6px per spec, 8.5 active
    pts.forEach((pt,idx)=>{
      const isCur=idx===curIdx;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, isCur?8.5:6, 0, Math.PI*2);
      ctx.fillStyle=OKABE[pt.c % 8]; ctx.fill();
      ctx.lineWidth=isCur?2.4:1.8; ctx.strokeStyle='#1A150F'; ctx.stroke();
      // year label for first/last/active
      if(idx===0 || idx===n-1 || isCur){
        ctx.fillStyle='#1A150F'; ctx.font='800 11px ui-monospace,monospace'; ctx.textAlign='center';
        ctx.fillText(rec.rows[idx].season.slice(2,7), pt.x, pt.y - (isCur?16:12));
      }
    });
  }

  function drawShareCanvas(rec, curIdx){
    const canvas=document.getElementById('tc-share-canvas'); if(!canvas || !ARCH_TIME) return;
    const dpr=Math.min(devicePixelRatio||1,1.5);
    const rect=canvas.getBoundingClientRect();
    canvas.width=rect.width*dpr; canvas.height=rect.height*dpr;
    const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    const W=rect.width, H=rect.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H);
    const seasons=ARCH_TIME.prevalence; const seasonMap={}; seasons.forEach(s=> seasonMap[s.season]=s.shares);
    const shares=rec.rows.map(r=>{ const sh=seasonMap[r.season]; return sh? (sh[r.c]||0)*100 : 4; });
    const maxShare=Math.max(...shares, 12);
    const pad=10; const chartH=H-28; const chartW=W-pad*2;
    // area
    ctx.beginPath();
    shares.forEach((v,i)=>{ const x= pad + (i/Math.max(1,shares.length-1))*chartW; const y= chartH - (v/maxShare)* (chartH-14) +8; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
    ctx.lineTo(pad+chartW, pad+chartH-6); ctx.lineTo(pad, pad+chartH-6); ctx.closePath();
    ctx.fillStyle='rgba(0,114,178,0.16)'; ctx.fill();
    // line
    ctx.beginPath();
    shares.forEach((v,i)=>{ const x= pad + (i/Math.max(1,shares.length-1))*chartW; const y= chartH - (v/maxShare)* (chartH-14) +8; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
    ctx.strokeStyle='#0072B2'; ctx.lineWidth=2.6; ctx.lineCap='round'; ctx.stroke();
    // dots — highlight only cur, first, last to reduce clutter
    shares.forEach((v,i)=>{
      if(i===curIdx || i===0 || i===shares.length-1){
        const x= pad + (i/Math.max(1,shares.length-1))*chartW; const y= chartH - (v/maxShare)* (chartH-14) +8;
        ctx.beginPath(); ctx.arc(x,y,4.2,0,Math.PI*2); ctx.fillStyle='#1A150F'; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
        if(i===curIdx){ ctx.fillStyle='#1A150F'; ctx.font='700 11px ui-monospace,monospace'; ctx.textAlign='left'; ctx.fillText(v.toFixed(1)+'% of league', x+7, y+4); }
      }
    });
    // axis labels
    ctx.fillStyle='#5A544D'; ctx.font='700 10px ui-monospace,monospace'; ctx.textAlign='left'; ctx.fillText(rec.rows[0].season, pad, H-4);
    ctx.textAlign='right'; ctx.fillText(rec.rows[rec.rows.length-1].season, pad+chartW, H-4);
  }

  function drawDetailArc(rec, curIdx){
    const canvas=document.getElementById('tc-detail-arc'); if(!canvas) return;
    const dpr=Math.min(devicePixelRatio||1,1.5);
    const rect=canvas.getBoundingClientRect();
    canvas.width=rect.width*dpr; canvas.height=rect.height*dpr;
    const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    const W=rect.width, H=rect.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H);
    const n=rec.rows.length;
    const pad=12; const useW=W-pad*2;
    const pts=rec.rows.map((r,i)=>({x: pad + useW*(i/(Math.max(1,n-1))), y: H*0.5, c:r.c, season:r.season}));
    // faint baseline
    ctx.strokeStyle='rgba(26,21,15,0.12)'; ctx.lineWidth=6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(p=> ctx.lineTo(p.x,p.y)); ctx.stroke();
    // colored segments for groups
    const grps=groupsFor(rec);
    let cursor=0;
    grps.forEach(g=>{
      const start=pts[cursor]; const end=pts[cursor+g.seasons.length-1];
      ctx.strokeStyle=OKABE[g.c%8]; ctx.lineWidth=4.5; ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      cursor+=g.seasons.length;
    });
    // dots
    pts.forEach((pt,idx)=>{
      const isCur=idx===curIdx;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, isCur?8:6,0,Math.PI*2); ctx.fillStyle=OKABE[pt.c%8]; ctx.fill(); ctx.lineWidth=isCur?2.6:1.8; ctx.strokeStyle='#1A150F'; ctx.stroke();
      if(n<=12 || idx===0 || idx===n-1 || isCur || idx%Math.ceil(n/6)===0){
        ctx.fillStyle='#1A150F'; ctx.font='700 10px ui-monospace,monospace'; ctx.textAlign='center'; ctx.fillText(pt.season.slice(2,4), pt.x, pt.y+20);
      }
    });
  }

  function renderSkillsIntoCard(rec, curIdx){
    const row=rec.rows[curIdx];
    const badgesEl=document.getElementById('tc-badges'); const skillsEl=document.getElementById('tc-skills');
    if(!badgesEl || !skillsEl || !SKILLS || !SKILLS.grades[row.i]) return;
    const grades=SKILLS.grades[row.i]; const skills=SKILLS.skills; const badgeGrade=SKILLS.badgeGrade||90;
    let badges=[]; skills.forEach((sk,j)=>{ if(grades[j]>=badgeGrade) badges.push({label:sk.badge, grade:grades[j], j}); }); badges.sort((a,b)=> b.grade-a.grade);
    badgesEl.innerHTML = badges.length ? badges.slice(0,8).map(b=>{
      const tier=gradeTier(b.grade); const col=b.grade>=97?'#1A150F':b.grade>=90?'#0072B2':'#009E73';
      return `<div class="tc-badge"><div class="tc-badge__top"><span class="tc-badge__name">${esc(b.label)}</span><span class="tc-badge__grade" style="${tier.pill}">${b.grade}</span></div><div class="tc-badge__bar"><div class="tc-badge__fill" style="width:${Math.max(b.grade,6)}%;background:${col}"></div></div></div>`;
    }).join('') : `<div class="tc-badge" style="border-style:dashed;opacity:.7"><div class="tc-badge__top"><span class="tc-badge__name">No 90+ badges this season</span></div></div>`;
    skillsEl.innerHTML = skills.map((sk,j)=>{
      const g=grades[j]; const tier=gradeTier(g); const col=g>=97?'#1A150F':g>=90?'#0072B2':g>=75?'#009E73':'#6B665E';
      return `<li class="tc-skill"><div class="tc-skill__head"><span class="tc-skill__label">${esc(sk.label)}</span><span class="tc-skill__grade" style="${tier.pill}">${g}</span></div><div class="tc-skill__track"><div class="tc-skill__fill" style="width:${Math.max(g,4)}%;background:${col}"></div></div><div class="tc-skill__foot"><span>${esc(sk.badge)}</span><span>${tier.label}</span></div></li>`;
    }).join('');
  }

  function renderStoryIntoCard(rec, curIdx){
    const row=rec.rows[curIdx]; const storyEl=document.getElementById('tc-story'); const footEl=document.getElementById('tc-footnote'); if(!storyEl) return;
    let shifts=[]; let lastC=rec.rows[0].c; for(let i=1;i<rec.rows.length;i++){ if(rec.rows[i].c!==lastC){ shifts.push({from:lastC, to:rec.rows[i].c, season:rec.rows[i].season}); lastC=rec.rows[i].c; } }
    const curArch=archNames[row.c]||ARCH_LABELS[row.c]; const first=rec.rows[0]; const last=rec.rows[rec.rows.length-1];
    let txt=`<b>${esc(rec.name||curName)}</b> played ${rec.rows.length} seasons, ${esc(first.season)} to ${esc(last.season)}. He started as <b>${esc(archNames[first.c]||first.c)}</b> and now plays as <b>${esc(curArch)}</b>. `;
    if(shifts.length){ txt+=`His style changed ${shifts.length} time${shifts.length>1?'s':''}. `; } else { txt+=`Same playing style every year — very consistent. `; }
    if(SKILLS && SKILLS.grades[row.i]){ const g=SKILLS.grades[row.i]; let c99=g.filter(x=>x>=99).length, c90=g.filter(x=>x>=90).length; const avg=Math.round(g.reduce((a,b)=>a+b,0)/g.length); txt+=`In ${esc(row.season)} he averaged grade ${avg}, with ${c90} skills at 90 or above${c99? ` (${c99} at 99)`:''}. `; }
    txt+=`The blue hill below shows how many other players had this same style that year — higher means more common.`;
    storyEl.innerHTML=txt;
    if(footEl){ footEl.textContent=`Color = playing style · Shape = position ${row.pl||''} · 0–99 compared to league that same season.`; }
  }
}
