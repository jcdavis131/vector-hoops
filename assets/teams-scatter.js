// Fancy Charts v5.4 — Scatter cap% vs wins, enhanced sortable 30T board, crown, pills, w_per_m bar, Vegas beat chip — zero-deps inline
(function(){
 const $=s=>document.getElementById(s);
 // wait for FO loaded by main script
 function whenFO(cb){ let tries=0; let iv=setInterval(()=>{ if(window.FO||document._foReady){clearInterval(iv); cb();} if(++tries>200) clearInterval(iv);},300);}
 // hook into existing FO global — main script uses local FO but attaches? so fetch again for scatter
 async function loadFO(){
  try{
   let r=await fetch('./assets/data/front_office.json',{cache:'no-store'});
   if(!r.ok) r=await fetch('/assets/data/front_office.json?v=1e6f04e5',{cache:'no-store'});
   let fo=await r.json();
   window.FO = window.FO||fo;
   drawScatter(fo);
   enhanceBoard(fo);
  }catch(e){ console.warn('scatter fo load fail',e); if($('scatter-tip')) $('scatter-tip').textContent='scatter load failed '+e; }
 }
 function drawScatter(fo){
  let c=$('cap-scatter'); if(!c) return;
  let tip=$('scatter-tip'); let legend=$('scatter-legend');
  let ctx=c.getContext('2d');
  let teams=fo.teams||[];
  // cap% vs wins
  let pts=teams.map(t=>({abbr:t.abbr,name:t.name,cap:t.cap_pct_2025_26||t.cap_pct||0,wins:t.wins||0,for_score:t.for_score||0,wpm:t.w_per_m||0,capEff:t.cap_efficiency?.score||50,vegas:t.vegas_delta,apron2:t.tax_apron_status_2025_26?.over_apron2||t.tax_apron_status?.over_apron2,apron1:t.tax_apron_status_2025_26?.over_apron1||t.tax_apron_status?.over_apron1,tax:t.tax_apron_status_2025_26?.over_tax||t.tax_apron_status?.over_tax,champ:t.is_champion,primary:t.primary||'#fff'}));
  let W=c.width,H=c.height,pad={l:54,r:24,t:24,b:44};
  let xMin=Math.min(...pts.map(p=>p.cap)), xMax=Math.max(...pts.map(p=>p.cap));
  let yMin=Math.min(...pts.map(p=>p.wins)), yMax=Math.max(...pts.map(p=>p.wins));
  xMin=Math.max(0,xMin*0.92); xMax=xMax*1.06; yMin=Math.max(0,yMin-5); yMax=yMax+5;
  function sx(v){return pad.l + (v-xMin)/(xMax-xMin||1)*(W-pad.l-pad.r);}
  function sy(v){return H-pad.b - (v-yMin)/(yMax-yMin||1)*(H-pad.t-pad.b);}
  function colorFor(p){ if(p.apron2) return '#ff3b30'; if(p.apron1) return '#ff9f0a'; if(p.tax) return '#F0E442'; return '#2ECC71';}
  function drawBase(){
   ctx.fillStyle='#080A0F'; ctx.fillRect(0,0,W,H);
   ctx.strokeStyle='#1F2937'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
   for(let i=0;i<=4;i++){let y=pad.t+i*(H-pad.t-pad.b)/4; ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(W-pad.r,y); ctx.stroke();}
   for(let i=0;i<=5;i++){let x=pad.l+i*(W-pad.l-pad.r)/5; ctx.beginPath(); ctx.moveTo(x,pad.t); ctx.lineTo(x,H-pad.b); ctx.stroke();}
   ctx.setLineDash([]);
   ctx.strokeStyle='#FFFEF7'; ctx.lineWidth=1.2;
   ctx.beginPath(); ctx.moveTo(pad.l,H-pad.b); ctx.lineTo(W-pad.r,H-pad.b); ctx.stroke();
   ctx.beginPath(); ctx.moveTo(pad.l,pad.t); ctx.lineTo(pad.l,H-pad.b); ctx.stroke();
   ctx.fillStyle='#FFFEF7'; ctx.font='11px ui-monospace'; ctx.textAlign='center';
   for(let i=0;i<=5;i++){let v=xMin+i*(xMax-xMin)/5; let x=sx(v); ctx.fillText((v*100).toFixed(0)+'%',x,H-12);}
   ctx.textAlign='right';
   for(let i=0;i<=4;i++){let v=yMin+i*(yMax-yMin)/4; let y=H-pad.b-i*(H-pad.t-pad.b)/4; ctx.fillText(v.toFixed(0)+'W',pad.l-8,y+3);}
   ctx.fillStyle='#F0E442'; ctx.font='700 11px ui-monospace'; ctx.textAlign='center'; ctx.fillText('Cap % payroll/cap (lower = more flex) →',W/2,H-2);
  }
  drawBase();
  // dots
  pts.forEach(p=>{
   let x=sx(p.cap), y=sy(p.wins);
   ctx.fillStyle=colorFor(p); ctx.shadowColor=colorFor(p); ctx.shadowBlur=8;
   ctx.beginPath(); ctx.arc(x,y,p.champ?9:6,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
   ctx.strokeStyle='#080A0F'; ctx.lineWidth=1.5; ctx.stroke();
   if(p.champ){ ctx.fillStyle='#FFD700'; ctx.font='14px ui-sans-serif'; ctx.textAlign='center'; ctx.fillText('👑',x,y-14); }
   ctx.fillStyle='#fff'; ctx.font='700 9px ui-monospace'; ctx.textAlign='center'; ctx.fillText(p.abbr,x,y-10);
  });
  // tooltip
  c._pts=pts; c._sx=sx; c._sy=sy;
  c.onmousemove=(ev)=>{
   let rect=c.getBoundingClientRect();
   let mx=(ev.clientX-rect.left)*(W/rect.width);
   let my=(ev.clientY-rect.top)*(H/rect.height);
   let best=null, bestD=1e9;
   pts.forEach(p=>{let x=sx(p.cap), y=sy(p.wins); let d=Math.hypot(x-mx,y-my); if(d<bestD){bestD=d; best=p;}});
   if(!best||bestD>30) return;
   drawBase();
   pts.forEach(p=>{let x=sx(p.cap), y=sy(p.wins); ctx.fillStyle=colorFor(p); ctx.beginPath(); ctx.arc(x,y,p.abbr===best.abbr?10:(p.champ?9:6),0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#080A0F'; ctx.lineWidth=p.abbr===best.abbr?2.5:1.5; ctx.stroke(); if(p.champ){ctx.fillStyle='#FFD700'; ctx.font='14px ui-sans-serif'; ctx.textAlign='center'; ctx.fillText('👑',x,y-14);} if(p.abbr===best.abbr){ctx.strokeStyle='#fff'; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(pad.l,sy(p.wins)); ctx.lineTo(W-pad.r,sy(p.wins)); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sx(p.cap),pad.t); ctx.lineTo(sx(p.cap),H-pad.b); ctx.stroke(); ctx.setLineDash([]);} });
   if(tip) tip.textContent=`${best.abbr} ${best.name} · cap ${(best.cap*100).toFixed(0)}% · ${best.wins}W · FOR ${best.for_score} · W/$M ${best.wpm} · ${best.apron2?'OVER AP2 hard-cap':best.apron1?'OVER AP1':best.tax?'OVER TAX': 'UNDER TAX'} · ${best.vegas!=null?(best.vegas>0?`+${best.vegas} OU beat`:`${best.vegas} OU miss`):''} — NYK16 SAS7 champ bonus applied — scrub shows real 30T spread`;
   // highlight card row
   document.querySelectorAll('.lr').forEach(r=>r.classList.toggle('is-active',r.dataset.abbr===best.abbr));
  };
  c.onmouseleave=()=>{ if(tip) tip.textContent='Move mouse over dots — same math as board'; drawBase(); pts.forEach(p=>{let x=sx(p.cap), y=sy(p.wins); ctx.fillStyle=colorFor(p); ctx.beginPath(); ctx.arc(x,y,p.champ?9:6,0,Math.PI*2); ctx.fill();}); };
  // legend
  if(legend) legend.innerHTML=`<span class="pill" style="background:#2ECC71;color:#000">UNDER TAX — flex</span><span class="pill" style="background:#F0E442;color:#000">OVER TAX</span><span class="pill ap1">OVER AP1</span><span class="pill ap2">OVER AP2 hard-cap</span><span class="pill pill-yellow">👑 Champion capped at 2025-26 NYK 16 · SAS runner 7</span><span class="pill" style="background:#080A0F;color:#fff">Dark void #080A0F — matching hub</span>`;
 }
 function enhanceBoard(fo){
  // add sortable headers for existing table: FOR, Grade, W, Pay, Pay25-26, W/$M, Draft, Cap, Fore, Flex — make th clickable
  let ths=document.querySelectorAll('#fo-board thead th');
  let keyMap=['#','Team','FOR','G','W','Pay24','Pay25','W/$M','Draft','Cap','Fore','Flex'];
  ths.forEach((th,i)=>{
   th.style.cursor='pointer'; th.title='Click to sort 30T — same math, no fake promo';
   th.onclick=()=>{
    let mode=keyMap[i]?.toLowerCase()||'for';
    // proxy to existing sort buttons where possible
    if(mode.includes('for')) document.getElementById('sort-for')?.click();
    else if(mode.includes('flex')) document.getElementById('sort-flex')?.click();
    else if(mode.includes('draft')) document.getElementById('sort-draft')?.click();
    else if(mode.includes('cap')||mode.includes('pay24')||mode.includes('pay25')) document.getElementById('sort-cap')?.click();
    else{
     // custom sort
     let ts=[...(fo.teams||[])];
     if(mode==='w') ts.sort((a,b)=>b.wins-a.wins);
     else if(mode==='g') ts.sort((a,b)=>a.for_grade?.localeCompare(b.for_grade));
     else ts.sort((a,b)=>b.for_score-a.for_score);
     if(window.board) window.board(ts); else if(window.FO) { /* fallback */ }
    }
   };
  });
  // add w_per_m bar visualization into board meta if not present
  // Enhance existing board() already paints row with vegas chip — ensure vega chip logic stays
  // Add crown already done in board fn above, but re-run after sort changes via MutationObserver
  let boardBody=document.getElementById('board-body');
  if(boardBody){
   let obs=new MutationObserver(()=>{ /* re-highlight champion */ boardBody.querySelectorAll('tr').forEach(tr=>{let ab=tr.dataset.abbr; if(!ab) return; let t=fo.teams_by_abbr?.[ab]||fo.teams?.find(x=>x.abbr===ab); if(t?.is_champion) tr.style.borderLeft='4px solid #FFD700';}); });
   obs.observe(boardBody,{childList:true});
  }
 }
 loadFO();
})();