/* trading-card-void.js v35 — collectible trading card for career arc + skills */
export async function mountTradingCardVoid(root){
  if(!root) return;
  const CACHE='vector-hoops-v35-20260721-trading-card';
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#FFFEF7'];
  const ARCH_LABELS=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];

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
        <p class="tc-sub">Every season is a card. 12,966 charted. Search any name — see their arc from rookie to last dance, plus era-normalized 0–99 skills.</p>
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
      <div class="tc-detail" id="tc-detail"><div style="font-family:ui-monospace;font-size:12px;color:#666">Pick a player — arc + skills load here.</div></div>
    </div>
  `;

  let SEARCH=null, SKILLS=null, ARCH_TIME=null, ASSIGN=null;
  let byName={}, ORDER=[];
  let curName='LeBron James';
  let curSeasonIdx=0;
  let archNames=[];

  function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
  function slugName(n){ return n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
  function initials(n){ return n.split(/[\s\-]+/).slice(0,2).map(w=>w[0]).join('').toUpperCase().slice(0,2); }
  function seasonShort(s){ return s.slice(2,4)+'-'+s.slice(7,9); }
  function gradeTier(g){
    if(g>=97) return {pill:'background:#1A150F;color:#fff;border-color:#1A150F', fill:'#1A150F', label:'ELITE'};
    if(g>=90) return {pill:'background:#0072B2;color:#fff;border-color:#0072B2', fill:'#0072B2', label:'ELITE'};
    if(g>=75) return {pill:'background:#009E73;color:#fff;border-color:#009E73', fill:'#009E73', label:'STRONG'};
    if(g>=60) return {pill:'background:#fff;color:#1A150F', fill:'#6B665E', label:'AVG'};
    return {pill:'background:#EEE8D9;color:#5A5248', fill:'#C9C2B4', label:'LOW'};
  }

  try{
    const [searchPos, skills, archTime] = await Promise.all([
      cachedFetchJSON('assets/vectors_search_lite_pos.json?v=35'),
      cachedFetchJSON('assets/skills.json?v=35').catch(()=>null),
      cachedFetchJSON('assets/archetypes_time.json?v=35').catch(()=>null)
    ]);
    SEARCH=searchPos;
    SKILLS=skills;
    ARCH_TIME=archTime;
    archNames = (ARCH_TIME && ARCH_TIME.globalArchetypes) ? ARCH_TIME.globalArchetypes : ARCH_LABELS;
    // try assignments optional
    try{ ASSIGN = await cachedFetchJSON('assets/archetype_assignments.json?v=35'); }catch{ ASSIGN=null; }

    // build byName
    for(let i=0;i<SEARCH.players.length;i++){
      const p=SEARCH.players[i];
      const name=p.n;
      if(!byName[name]) byName[name]={name, rows:[]};
      byName[name].rows.push({season:p.s, c:p.c, p:p.p, i:p.i, x:p.x, y:p.y, z:p.z, pl:p.pl});
    }
    for(const k in byName){ byName[k].rows.sort((a,b)=> a.season < b.season ? -1 : 1); }
    ORDER=Object.keys(byName).sort((a,b)=> a.localeCompare(b));

    // pick initial
    if(!byName[curName]) curName=ORDER[Math.floor(Math.random()*ORDER.length)];
    curSeasonIdx = byName[curName].rows.length-1;

    bindEvents();
    render();
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
      let hits=[];
      // simple prefix + contains
      for(let k=0;k<ORDER.length && hits.length<8;k++){
        if(ORDER[k].toLowerCase().includes(q)) hits.push(ORDER[k]);
      }
      suggest.innerHTML=hits.map(name=>{
        const rec=byName[name];
        const span=rec.rows.length>1 ? rec.rows[0].season.slice(0,4)+'→'+rec.rows[rec.rows.length-1].season.slice(0,4) : rec.rows[0].season;
        return `<li><button type="button" data-name="${esc(name)}"><span><b>${esc(name)}</b><br><span style="font-family:ui-monospace;font-size:10px;color:#666">${esc(span)} · ${rec.rows.length} seasons</span></span><span>→</span></button></li>`;
      }).join('');
    });
    suggest.addEventListener('click', (ev)=>{
      const btn=ev.target.closest('button[data-name]');
      if(!btn) return;
      curName=btn.getAttribute('data-name');
      curSeasonIdx=byName[curName].rows.length-1;
      search.value=curName;
      suggest.innerHTML='';
      render();
    });
    rand.addEventListener('click', ()=>{
      const name=ORDER[Math.floor(Math.random()*ORDER.length)];
      curName=name;
      curSeasonIdx=byName[name].rows.length-1;
      search.value=name;
      suggest.innerHTML='';
      render();
      const card=document.getElementById('tc-card');
      if(card) card.animate([{transform:'rotate(-1.2deg) scale(.97)'},{transform:'rotate(-0.4deg) scale(1)'}],{duration:220, easing:'cubic-bezier(.2,.8,.2,1)'});
    });
  }

  function render(){
    const rec=byName[curName];
    if(!rec) return;
    if(curSeasonIdx<0) curSeasonIdx=0;
    if(curSeasonIdx>=rec.rows.length) curSeasonIdx=rec.rows.length-1;
    const curRow=rec.rows[curSeasonIdx];
    const latest=rec.rows[rec.rows.length-1];
    const earliest=rec.rows[0];
    // grades
    let grades=null, count99=0, count90=0, avg=0;
    if(SKILLS && SKILLS.grades && SKILLS.grades[curRow.i]){
      grades=SKILLS.grades[curRow.i];
      let sum=0;
      for(let g of grades){ sum+=g; if(g>=99) count99++; if(g>=90) count90++; }
      avg=Math.round(sum/grades.length);
    }

    // card HTML
    const curArchName = archNames[curRow.c] || ARCH_LABELS[curRow.c] || 'Unknown';
    const curColor = OKABE[curRow.c % OKABE.length];
    const chipClass = (cIdx)=> cIdx===curSeasonIdx ? 'tc-chip is-active' : 'tc-chip tc-chip--past';
    const foilClass = `tc-foil tc-foil--c${curRow.c % 8}`;

    const cardEl=document.getElementById('tc-card');
    if(cardEl){
      cardEl.setAttribute('data-rarity', count99>=3 ? 'gold' : count99>=1 ? 'gold' : 'base');
      cardEl.innerHTML=`
        <div class="${foilClass}"></div>
        <div class="tc-head">
          <h3 class="tc-name">${esc(curName)}</h3>
          <span class="tc-mega"><b>${count99 || count90 || avg || '—'}</b>${count99?'×99':count90?'×90+':''}</span>
        </div>
        <div class="tc-meta">
          <span class="tc-pill"><span class="tc-dot" style="background:${curColor}"></span>${esc(curRow.season)}</span>
          <span class="tc-pill">${esc(curRow.pl||'?')}</span>
          <span class="tc-pill tc-pill--arch"><span class="tc-dot" style="background:${curColor}"></span>${esc(curArchName.length>22?curArchName.slice(0,22)+'…':curArchName)}</span>
          <span class="tc-pill">${rec.rows.length} seasons</span>
        </div>
        <div class="tc-art" id="tc-art">
          <div class="tc-art-initials">${esc(initials(curName))}</div>
          <canvas id="tc-arc-canvas" width="360" height="168" aria-label="career arc"></canvas>
        </div>
        <div class="tc-rarity ${count99?'tc-rarity--gold':'tc-rarity--blue'}">
          <span><b>${count99?count99+'×99':count90?count90+'×90+':'AVG '+avg}</b> — ${count99>=3?'Collector — top 0.3% seasons':count99?'Top 1% that year — elite signature':count90?'Two-way star': 'Role specialist'}</span>
          <span style="margin-left:auto;opacity:.7">${esc(earliest.season.slice(0,4))}→${esc(latest.season.slice(0,4))} · ${rec.rows.length} yrs</span>
        </div>
        <div class="tc-tabs" role="tablist">
          <button type="button" data-tab="arc" class="is-active">ARC</button>
          <button type="button" data-tab="skills">SKILLS</button>
          <button type="button" data-tab="story">STORY</button>
        </div>
        <div class="tc-body" id="tc-body-arc">
          <div class="tc-section-head">Career arc — tap a season</div>
          <div class="tc-arc-row" id="tc-arc-row">
            ${rec.rows.map((r,idx)=>`<button class="${chipClass(idx)}" data-idx="${idx}" style="${idx===curSeasonIdx?`background:#1A150F;color:#fff;--dot:${OKABE[r.c%8]}`:`background:#fff`}"><span class="tc-dot" style="background:${OKABE[r.c%8]}"></span> ${seasonShort(r.season)}</button>`).join('')}
          </div>
          <div class="tc-spark"><canvas id="tc-share-canvas" width="340" height="56"></canvas><div class="tc-footnote">X: time rookie→now · dot = archetype · color = OKABE · share = league % that year</div></div>
        </div>
        <div class="tc-body" id="tc-body-skills" hidden>
          <div class="tc-section-head">Elite badges — 90+ era-normalized</div>
          <div class="tc-badges" id="tc-badges"></div>
          <div class="tc-section-head" style="margin-top:8px">Skill grades — 0-99 vs league that year</div>
          <ul class="tc-skills" id="tc-skills"></ul>
        </div>
        <div class="tc-body" id="tc-body-story" hidden>
          <div class="tc-section-head">Chimera story — auto-generated</div>
          <p class="tc-story" id="tc-story"></p>
          <div class="tc-actions">
            <a class="tc-btn" href="/players?p=${encodeURIComponent(slugName(curName))}&s=${encodeURIComponent(curRow.season)}#profile">Open full dossier →</a>
            <button class="tc-btn tc-btn--yellow" id="tc-share">Share card</button>
          </div>
          <div class="tc-footnote" id="tc-footnote"></div>
        </div>
      `;
      // bind chips
      const arcRow=cardEl.querySelector('#tc-arc-row');
      if(arcRow){
        arcRow.addEventListener('click', (ev)=>{
          const b=ev.target.closest('button[data-idx]');
          if(!b) return;
          curSeasonIdx=parseInt(b.getAttribute('data-idx'),10);
          render();
        });
      }
      const tabs=cardEl.querySelectorAll('.tc-tabs button');
      tabs.forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const tab=btn.getAttribute('data-tab');
          cardEl.querySelectorAll('.tc-body').forEach(b=> b.hidden=true);
          const target=cardEl.querySelector('#tc-body-'+tab);
          if(target) target.hidden=false;
          tabs.forEach(t=> t.classList.remove('is-active'));
          btn.classList.add('is-active');
        });
      });
      // canvases
      requestAnimationFrame(()=>{ drawArcCanvas(rec, curSeasonIdx); drawShareCanvas(rec); renderSkillsIntoCard(rec, curSeasonIdx); renderStoryIntoCard(rec, curSeasonIdx); });
      // share
      const shareBtn=cardEl.querySelector('#tc-share');
      if(shareBtn){
        shareBtn.addEventListener('click', async ()=>{
          const url = location.origin + '/players?p='+encodeURIComponent(slugName(curName))+'&s='+encodeURIComponent(curRow.season)+'#profile';
          try{
            if(navigator.clipboard) await navigator.clipboard.writeText(url);
            shareBtn.textContent='Copied!';
            setTimeout(()=> shareBtn.textContent='Share card', 1200);
          }catch{}
        });
      }
    }

    // detail panel
    const detail=document.getElementById('tc-detail');
    if(detail){
      detail.innerHTML=`
        <div class="tc-detail-head"><h3>${esc(curName)} — ${esc(curRow.season)}</h3><span class="tc-pill" style="background:#1A150F;color:#fff">${count99?count99+'×99':count90?count90+'×90+':'avg '+avg}</span></div>
        <div class="tc-arc-row">${rec.rows.map((r,idx)=>`<span class="tc-pill" style="${idx===curSeasonIdx?'background:#1A150F;color:#fff':''}"><span class="tc-dot" style="background:${OKABE[r.c%8]}"></span>${esc(r.season)}: ${esc((archNames[r.c]||ARCH_LABELS[r.c]||r.c).slice(0,18))}</span>`).join('')}</div>
        <div class="tc-spark"><canvas id="tc-detail-arc" width="520" height="120"></canvas></div>
        <p class="tc-story"><b>Arc:</b> ${esc(earliest.season)} → ${esc(latest.season)} — ${rec.rows.length} seasons, ${(() => {
          let shifts=0; let last=rec.rows[0].c;
          for(let rr of rec.rows){ if(rr.c!==last){ shifts++; last=rr.c; } }
          return shifts;
        })()} archetype shifts, peak ${count99?count99+'×99':count90?count90+'×90+':'avg '+avg}. <b>Now:</b> ${esc(curArchName)}.</p>
        <div class="tc-actions"><a class="tc-btn tc-btn--yellow" href="/players?p=${encodeURIComponent(slugName(curName))}#profile">Open dossier</a><a class="tc-btn" href="/trends">See trends →</a></div>
        <div class="tc-footnote">Era-normalized 0–99 vs league that year. Tracking 2015-16+ only. Data from stats.nba.com via 12,966 player-seasons MTNN v5 48-d.</div>
      `;
      requestAnimationFrame(()=> drawDetailArc(rec, curSeasonIdx));
    }
  }

  function drawArcCanvas(rec, curIdx){
    const canvas=document.getElementById('tc-arc-canvas');
    if(!canvas) return;
    const dpr=Math.min(devicePixelRatio||1, 1.5);
    const rect=canvas.getBoundingClientRect();
    canvas.width=rect.width*dpr;
    canvas.height=rect.height*dpr;
    const ctx=canvas.getContext('2d');
    ctx.scale(dpr,dpr);
    const W=rect.width, H=rect.height;
    ctx.clearRect(0,0,W,H);
    // background grid faint
    ctx.strokeStyle='rgba(255,254,247,.08)';
    ctx.lineWidth=1;
    for(let i=1;i<4;i++){ ctx.beginPath(); ctx.moveTo(0,H*i/4); ctx.lineTo(W,H*i/4); ctx.stroke(); }
    // path
    const n=rec.rows.length;
    if(n<2) return;
    const pts=rec.rows.map((r,i)=>{
      const x= 16 + (W-32)* (i/(n-1));
      // y based on archetype to spread visually + slight league share wiggle
      const y = H*0.5 + (r.c-3.5)*10 + Math.sin(i*0.9)*6;
      return {x,y,c:r.c};
    });
    // glow line
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for(let i=1;i<pts.length;i++){
      const p0=pts[i-1], p1=pts[i];
      const mx=(p0.x+p1.x)/2;
      ctx.quadraticCurveTo(p0.x, p0.y, mx, (p0.y+p1.y)/2);
      if(i===pts.length-1) ctx.lineTo(p1.x,p1.y);
    }
    ctx.strokeStyle='rgba(255,254,247,.28)';
    ctx.lineWidth=3.5;
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.stroke();
    // colored segments
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1], b=pts[i];
      ctx.beginPath();
      ctx.moveTo(a.x,a.y);
      ctx.lineTo(b.x,b.y);
      ctx.strokeStyle=OKABE[a.c % 8];
      ctx.lineWidth=2.2;
      ctx.stroke();
    }
    // dots
    pts.forEach((pt,idx)=>{
      const isCur=idx===curIdx;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isCur?7:4.5, 0, Math.PI*2);
      ctx.fillStyle=OKABE[pt.c % 8];
      ctx.fill();
      ctx.lineWidth=isCur?2.5:1.5;
      ctx.strokeStyle= isCur? '#FFFEF7' : 'rgba(18,16,12,.9)';
      ctx.stroke();
      if(idx===0 || idx===n-1 || isCur){
        ctx.fillStyle='#FFFEF7';
        ctx.font='800 10px ui-monospace,monospace';
        ctx.textAlign='center';
        ctx.fillText(seasonShort(rec.rows[idx].season), pt.x, pt.y - (isCur?14:10));
      }
    });
  }

  function drawShareCanvas(rec){
    const canvas=document.getElementById('tc-share-canvas');
    if(!canvas || !ARCH_TIME) return;
    const dpr=Math.min(devicePixelRatio||1,1.5);
    const rect=canvas.getBoundingClientRect();
    canvas.width=rect.width*dpr; canvas.height=rect.height*dpr;
    const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
    const W=rect.width, H=rect.height;
    ctx.clearRect(0,0,W,H);
    // get prevalence for each archetype along rec timeline
    const seasons=ARCH_TIME.prevalence; // array {season, shares[]}
    const seasonMap={}; seasons.forEach((s,i)=> seasonMap[s.season]=s.shares);
    const sharesSeries=rec.rows.map(r=> {
      const sh=seasonMap[r.season];
      return sh ? (sh[r.c]||0)*100 : 4; // %
    });
    // draw area
    const maxShare=Math.max(...sharesSeries, 10);
    ctx.beginPath();
    sharesSeries.forEach((v,i)=>{
      const x= (i/(Math.max(1,sharesSeries.length-1)))*(W-8)+4;
      const y= H-6 - (v/maxShare)*(H-18);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    // to baseline
    const lastX= (W-8)+4;
    ctx.lineTo(lastX, H-6);
    ctx.lineTo(4, H-6);
    ctx.closePath();
    ctx.fillStyle='rgba(0,114,178,.18)';
    ctx.fill();
    ctx.strokeStyle='#0072B2';
    ctx.lineWidth=1.6;
    ctx.beginPath();
    sharesSeries.forEach((v,i)=>{
      const x= (i/(Math.max(1,sharesSeries.length-1)))*(W-8)+4;
      const y= H-6 - (v/maxShare)*(H-18);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    // dots
    sharesSeries.forEach((v,i)=>{
      if(i===curSeasonIdx || i===0 || i===sharesSeries.length-1){
        const x= (i/(Math.max(1,sharesSeries.length-1)))*(W-8)+4;
        const y= H-6 - (v/maxShare)*(H-18);
        ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fillStyle='#1A150F'; ctx.fill();
        ctx.fillStyle='#1A150F'; ctx.font='700 9px ui-monospace'; ctx.fillText(v.toFixed(1)+'%', x+5, y+2);
      }
    });
  }

  function drawDetailArc(rec, curIdx){
    const canvas=document.getElementById('tc-detail-arc');
    if(!canvas) return;
    const dpr=Math.min(devicePixelRatio||1,1.5);
    const rect=canvas.getBoundingClientRect();
    canvas.width=rect.width*dpr; canvas.height=rect.height*dpr;
    const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
    const W=rect.width, H=rect.height;
    ctx.clearRect(0,0,W,H);
    // axes labels
    const n=rec.rows.length;
    const pts=rec.rows.map((r,i)=>({x: 12 + (W-24)*(i/(Math.max(1,n-1))), y: H*0.55 + (r.c-3.5)*12, c:r.c}));
    // league faint
    if(ARCH_TIME){
      const seasons=ARCH_TIME.prevalence;
      const sMap={}; seasons.forEach(s=> sMap[s.season]=s.shares);
      ctx.strokeStyle='rgba(26,21,15,.08)'; ctx.lineWidth=1;
      for(let c=0;c<8;c++){
        ctx.beginPath();
        let started=false;
        rec.rows.forEach((r,i)=>{
          const sh=sMap[r.season]; if(!sh) return;
          const v=sh[c]*100;
          const x=pts[i].x; const y=H-10 - v*0.6;
          if(!started){ ctx.moveTo(x,y); started=true; } else ctx.lineTo(x,y);
        });
        if(c===rec.rows[curIdx].c){} else { ctx.stroke(); }
      }
    }
    // career path
    ctx.beginPath(); pts.forEach((pt,i)=>{ if(i===0) ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y); });
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.4; ctx.stroke();
    pts.forEach((pt,idx)=>{
      ctx.beginPath(); ctx.arc(pt.x,pt.y, idx===curIdx?6:4,0,Math.PI*2); ctx.fillStyle=OKABE[pt.c%8]; ctx.fill(); ctx.strokeStyle='#1A150F'; ctx.lineWidth=1.5; ctx.stroke();
    });
  }

  function renderSkillsIntoCard(rec, curIdx){
    const row=rec.rows[curIdx];
    const badgesEl=document.getElementById('tc-badges');
    const skillsEl=document.getElementById('tc-skills');
    if(!badgesEl || !skillsEl || !SKILLS || !SKILLS.grades[row.i]) return;
    const grades=SKILLS.grades[row.i];
    const skills=SKILLS.skills;
    const badgeGrade=SKILLS.badgeGrade||90;
    let badges=[];
    skills.forEach((sk,j)=>{ if(grades[j]>=badgeGrade) badges.push({label:sk.badge, grade:grades[j], key:sk.key, j}); });
    badges.sort((a,b)=> b.grade-a.grade);
    badgesEl.innerHTML = badges.length ? badges.slice(0,8).map(b=>{
      const tier=gradeTier(b.grade);
      const col=b.grade>=97?'#1A150F':b.grade>=90?'#0072B2':'#009E73';
      return `<div class="tc-badge"><div class="tc-badge__top"><span class="tc-badge__name">${esc(b.label)}</span><span class="tc-badge__grade" style="${tier.pill}">${b.grade}</span></div><div class="tc-badge__bar"><div class="tc-badge__fill" style="width:${Math.max(b.grade,6)}%;background:${col}"></div></div></div>`;
    }).join('') : `<div class="tc-badge" style="border-style:dashed;opacity:.6"><div class="tc-badge__top"><span class="tc-badge__name">No 90+ badges this season</span></div></div>`;

    skillsEl.innerHTML = skills.map((sk,j)=>{
      const g=grades[j];
      const tier=gradeTier(g);
      const col=g>=97?'#1A150F':g>=90?'#0072B2':g>=75?'#009E73':'#6B665E';
      return `<li class="tc-skill"><div class="tc-skill__head"><span class="tc-skill__label">${esc(sk.label)}</span><span class="tc-skill__grade" style="${tier.pill}">${g}</span></div><div class="tc-skill__track"><div class="tc-skill__fill" style="width:${Math.max(g,4)}%;background:${col}"></div></div><div class="tc-skill__foot"><span>${esc(sk.badge)}</span><span>${tier.label}</span></div></li>`;
    }).join('');
  }

  function renderStoryIntoCard(rec, curIdx){
    const row=rec.rows[curIdx];
    const storyEl=document.getElementById('tc-story');
    const footEl=document.getElementById('tc-footnote');
    if(!storyEl) return;
    // compute shifts
    let shifts=[];
    let lastC=rec.rows[0].c;
    for(let i=1;i<rec.rows.length;i++){
      if(rec.rows[i].c!==lastC){
        shifts.push({from:lastC, to:rec.rows[i].c, season:rec.rows[i].season});
        lastC=rec.rows[i].c;
      }
    }
    const curArch=archNames[row.c]||ARCH_LABELS[row.c];
    const first=rec.rows[0];
    const last=rec.rows[rec.rows.length-1];
    let txt=`<b>${esc(curName)}</b> — ${rec.rows.length} seasons, ${esc(first.season)} → ${esc(last.season)}. Draft arc: started as <b>${esc(archNames[first.c]||first.c)}</b>, now <b>${esc(curArch)}</b>. `;
    if(shifts.length){
      txt+=`${shifts.length} role shift${shifts.length>1?'s':''}: ${shifts.map(s=> `${esc(seasonShort(s.season))}: ${(archNames[s.from]||s.from).split(' ')[0]}→${(archNames[s.to]||s.to).split(' ')[0]}`).join(', ')}. `;
    } else {
      txt+=`Stable archetype — single role specialist. `;
    }
    if(SKILLS && SKILLS.grades[row.i]){
      const g=SKILLS.grades[row.i];
      let c99=g.filter(x=>x>=99).length, c90=g.filter(x=>x>=90).length;
      const avg=Math.round(g.reduce((a,b)=>a+b,0)/g.length);
      txt+=`In <b>${esc(row.season)}</b>: ${c99?c99+'×99':''} ${c90?c90+'×90+':''} avg ${avg}. `;
    }
    txt+=`League prevalence for this archetype tells you how rare the role was that year.`;
    storyEl.innerHTML=txt;
    if(footEl){
      footEl.textContent=`Shape=position ${row.pl||''} · Color=archetype · Data: 12,966 seasons — Era-normalized grades.`;
    }
  }
}
