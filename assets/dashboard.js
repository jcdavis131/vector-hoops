// dashboard.js — dumbmodel Lab
// Solo personal project, no connection to employer, built with public/free-tier only
(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>[...r.querySelectorAll(s)];

  // level toggle novice/expert
  let level = 'novice';
  function setLevel(l){
    level = l;
    $$('.toggle-btn[data-level]').forEach(b=>b.classList.toggle('is-active', b.dataset.level===l));
    $$('[data-novice]').forEach(el=>el.style.display = l==='novice' ? '' : '');
    $$('[data-expert]').forEach(el=>el.style.display = l==='expert' ? '' : 'none');
    localStorage.setItem('dash-level', l);
  }
  $$('.toggle-btn[data-level]').forEach(b=>b.addEventListener('click',()=>setLevel(b.dataset.level)));
  setLevel(localStorage.getItem('dash-level')||'novice');

  // sport toggle
  let sport = 'hoops';
  function setSport(s){
    sport = s;
    $$('.toggle-btn[data-sport]').forEach(b=>b.classList.toggle('is-active', b.dataset.sport===s));
    localStorage.setItem('dash-sport', s);
    // could filter metrics per sport
  }
  $$('.toggle-btn[data-sport]').forEach(b=>b.addEventListener('click',()=>setSport(b.dataset.sport)));
  setSport(localStorage.getItem('dash-sport')||'hoops');

  // copy buttons
  $$('.copy').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const code = btn.closest('.code-panel')?.querySelector('code')?.textContent||'';
      navigator.clipboard.writeText(code).then(()=>{ btn.textContent='copied'; setTimeout(()=>btn.textContent='copy',1200); });
    });
  });

  // simple canvas charts — no deps
  function drawEra(){
    const c = $('#eraChart'); if(!c) return;
    const ctx = c.getContext('2d');
    const W=c.width, H=c.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#FFFBF0'; ctx.fillRect(0,0,W,H);
    // before drift (orange)
    ctx.strokeStyle='#E69F00'; ctx.lineWidth=2.5;
    ctx.beginPath();
    for(let i=0;i<W;i++){ const x=i/W; const y= H*0.3 + Math.sin(x*6.28*2)*20 + x*40; if(i===0) ctx.moveTo(i,y); else ctx.lineTo(i,y); } ctx.stroke();
    // after align green
    ctx.strokeStyle='#009E73'; ctx.beginPath();
    for(let i=0;i<W;i++){ const x=i/W; const y= H*0.5 + Math.sin(x*6.28*0.5)*6; if(i===0) ctx.moveTo(i,y); else ctx.lineTo(i,y); } ctx.stroke();
    ctx.fillStyle='#111'; ctx.font='11px sans-serif'; ctx.fillText('drift ↓18% after Procrustes RᵀR=I', 10, H-8);
  }
  function drawLoss(){
    const c=$('#lossChart'); if(!c) return; const ctx=c.getContext('2d'); const W=c.width, H=c.height;
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='#0072B2'; ctx.lineWidth=2;
    ctx.beginPath();
    for(let i=0;i<W;i++){ const t=i/W; const y= H*0.8 - Math.exp(-t*3)*H*0.5; if(i===0) ctx.moveTo(i,y); else ctx.lineTo(i,y);} ctx.stroke();
    // WSM flat
    ctx.setLineDash([4,4]); ctx.strokeStyle='#D55E00'; ctx.beginPath(); ctx.moveTo(0,H*0.35); ctx.lineTo(W,H*0.33); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawMtnn(){
    const c=$('#mtnnChart'); if(!c) return; const ctx=c.getContext('2d'); const W=c.width, H=c.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#F0E442'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#111'; ctx.font='bold 12px sans-serif'; ctx.fillText('MAE 4.268 → 3.8', 10, 20);
    ctx.fillStyle='#0072B2'; ctx.fillRect(20,40,W-40,18);
    ctx.fillStyle='#fff'; ctx.font='11px sans-serif'; ctx.fillText('555→128→48 L2 527K params', 30, 52);
  }
  function drawEval(){
    const c=$('#evalChart'); if(!c) return; const ctx=c.getContext('2d'); const W=c.width, H=c.height;
    ctx.clearRect(0,0,W,H);
    // 9/11 bars
    const passes = [1,0,1,1,1,1,1,0,1,1,1]; // 9/11
    const barW = W/passes.length - 4;
    passes.forEach((p,i)=>{ const x=i*(barW+4)+2; const h=p? H*0.8 : H*0.35; ctx.fillStyle=p?'#009E73':'#D55E00'; ctx.fillRect(x, H-h, barW, h); });
  }
  drawEra(); drawLoss(); drawMtnn(); drawEval();
  window.addEventListener('resize', ()=>{ drawEra(); drawLoss(); drawMtnn(); drawEval(); });

  // pipeline step click scroll
  $$('.pipe-step').forEach(el=>el.addEventListener('click',()=>{ const id=el.dataset.step; document.getElementById(id)?.scrollIntoView({behavior:'smooth', block:'start'}); }));
})();
