/* glassbox-charts.js — standalone delightful explainer components for vector-hoops
   vanilla JS, zero-deps, no torch, inline-friendly
   exports: renderShapBar, renderPD, renderScatterCap via window.GlassboxCharts
   usage: <script src="assets/js/glassbox-charts.js"></script> then GlassboxCharts.renderShapBar(...)
   also supports ESM import if loaded as module

   — design: cute ink + paper, mustard accent, responsive SVG
   — SHAP bar: sorted, axes, mean|SHAP| 1245/399, hover everyday tooltip
   — PD curves: line + area fill, scrub dot follows mouse, x draft/cap%/year
   — Cap vs Wins scatter: dots tier-colored, champion gold ring, hover plain English
*/
(function(global){
  const COLORS = {
    ink: '#1A150F',
    paper: '#FFFEF7',
    mustard: '#F0E442',
    orange: '#D55E00',
    blue: '#0072B2',
    green: '#009E73',
    gray: '#E5E2D8',
    dim: '#6B665E',
  };

  function qs(id){ return document.getElementById(id); }
  function makeSVG(w,h){
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns,'svg');
    svg.setAttribute('width','100%');
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('role','img');
    svg.style.display='block';
    svg.style.maxWidth='100%';
    return svg;
  }
  function elNS(tag, attrs){
    const ns='http://www.w3.org/2000/svg';
    const e=document.createElementNS(ns,tag);
    for(const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function niceMax(v){
    if(v<=0) return 1;
    // round up to nice number
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    let ceil = 1;
    if(n<=1) ceil=1; else if(n<=2) ceil=2; else if(n<=5) ceil=5; else ceil=10;
    return ceil*pow;
  }
  function formatNum(n){
    if(n>=1000) return Math.round(n).toLocaleString();
    if(Math.abs(n)>=10) return Number(n).toFixed(1);
    return Number(n).toFixed(2);
  }

  // tooltip singleton
  let tip = null;
  function ensureTip(){
    if(tip) return tip;
    tip = document.createElement('div');
    tip.id='glassbox-tip';
    tip.setAttribute('role','status');
    tip.setAttribute('aria-live','polite');
    tip.style.cssText = [
      'position:fixed','left:0','top:0','pointer-events:none',
      'background:#1A150F','color:#FFFEF7','border:2px solid #1A150F',
      'border-radius:12px','padding:10px 12px','font-family:ui-monospace,monospace',
      'font-size:12px','line-height:1.45','max-width:min(320px,88vw)',
      'box-shadow:4px 4px 0 #1A150F','z-index:99999','opacity:0',
      'transform:translate3d(0,6px,0)','transition:opacity .14s ease, transform .14s ease',
      'white-space:pre-wrap'
    ].join(';');
    document.body.appendChild(tip);
    return tip;
  }
  function showTip(html, x, y){
    const t = ensureTip();
    t.innerHTML = html;
    t.style.opacity='1';
    t.style.transform='translate3d(0,0,0)';
    // position: try to the right/below cursor, clamp to viewport
    const pad=14;
    const rect = t.getBoundingClientRect();
    let lx = x + pad, ly = y + pad;
    if(lx + rect.width + 8 > window.innerWidth) lx = x - rect.width - pad;
    if(ly + rect.height + 8 > window.innerHeight) ly = y - rect.height - pad;
    t.style.left = Math.max(6, lx) + 'px';
    t.style.top  = Math.max(6, ly) + 'px';
  }
  function hideTip(){
    if(!tip) return;
    tip.style.opacity='0';
    tip.style.transform='translate3d(0,6px,0)';
  }

  /* SHAP BAR — sorted horizontal bars */
  function renderShapBar(containerId, data){
    const host = qs(containerId);
    if(!host){ console.warn('[glassbox] no container', containerId); return; }
    host.innerHTML='';
    host.style.position='relative';

    // normalize input: [{feature, shap, raw}]
    let rows = Array.isArray(data) ? data.slice() : [];
    if(rows.length===0){
      // demo fallback matching spec 1245/399
      rows = [
        {feature:'overall', shap:1245, note:'overall pick matters 3x cap%'},
        {feature:'log_contract_age', shap:399, note:'timing sweet spot 2-3yr'},
        {feature:'rd_surplus', shap:210, note:'late found money'},
        {feature:'opp_bias_proxy', shap:165, note:'no future leak guard'},
        {feature:'inv_payroll', shap:95, note:'payroll vs wins? meh'},
        {feature:'mkt_r', shap:42, note:'market proof'},
      ];
    }
    // allow {mean_abs_shap:,...}
    rows = rows.map(r=>{
      if(r.mean_abs_shap!=null) return {feature:r.feature||r.name||'feat', shap: r.mean_abs_shap, raw:r.raw, note:r.note};
      return {feature:r.feature||r.name||r.key||'feat', shap: Number(r.shap||r.value||0), raw:r.raw, note:r.note};
    }).sort((a,b)=>Math.abs(b.shap)-Math.abs(a.shap));

    const W = Math.max(320, host.clientWidth||520);
    const H = Math.max(200, Math.min(420, 36*rows.length + 88));
    const m = {top:18, right:24, bottom:36, left:132};
    const innerW = W - m.left - m.right;
    const innerH = H - m.top - m.bottom;

    const maxShap = niceMax(Math.max(...rows.map(r=>Math.abs(r.shap)), 1));
    const barH = Math.max(10, Math.min(22, (innerH - 12)/rows.length - 4));

    const svg = makeSVG(W, H);
    host.appendChild(svg);

    // bg paper
    svg.appendChild(elNS('rect',{x:0,y:0,width:W,height:H,rx:14,fill:'#fff',stroke:COLORS.ink,'stroke-width':2.2}));

    // title
    const title = elNS('text',{x:16,y:18,'font-family':'ui-monospace,monospace','font-size':11,'font-weight':800,'letter-spacing':'0.04em','fill':COLORS.ink});
    title.textContent = 'WHAT DROVE IT — mean|SHAP|';
    svg.appendChild(title);

    const g = elNS('g',{transform:`translate(${m.left},${m.top+6})`});
    svg.appendChild(g);

    // x axis
    g.appendChild(elNS('line',{x1:0,y1:innerH,x2:innerW,y2:innerH,stroke:COLORS.gray,'stroke-width':1.4}));
    // tick
    [0, maxShap/2, maxShap].forEach(v=>{
      const x = (v/maxShap)*innerW;
      g.appendChild(elNS('line',{x1:x,y1:innerH,x2:x,y2:innerH+4,stroke:COLORS.ink,'stroke-width':1}));
      const t = elNS('text',{x:x,y:innerH+16,'text-anchor':'middle','font-family':'ui-monospace,monospace','font-size':10,fill:COLORS.dim});
      t.textContent = Math.round(v);
      g.appendChild(t);
    });

    rows.forEach((r,i)=>{
      const y = i*(barH+10);
      const w = Math.max(2, (Math.abs(r.shap)/maxShap)*innerW);

      // row bg
      const bg = elNS('rect',{x:-8,y:y-2,width:innerW+16,height:barH+6,rx:8,fill: i===0 ? '#FFF9D6' : 'transparent', opacity: i===0?'0.9':'0'});
      g.appendChild(bg);

      // label
      const lbl = elNS('text',{x:-12,y:y+barH*0.62,'text-anchor':'end','font-family':'ui-monospace,monospace','font-size':11,'font-weight': i===0?900:700, fill:COLORS.ink});
      lbl.textContent = r.feature.length>18 ? r.feature.slice(0,16)+'…' : r.feature;
      g.appendChild(lbl);

      // bar
      const color = i===0?COLORS.mustard : i===1?COLORS.orange : COLORS.ink;
      const rect = elNS('rect',{x:0,y:y,width:w,height:barH,rx:Math.min(6,barH/2), fill: color, stroke:COLORS.ink,'stroke-width':1.6});
      rect.style.cursor='pointer';
      g.appendChild(rect);

      // value
      const val = elNS('text',{x:w+8,y:y+barH*0.68,'font-family':'ui-monospace,monospace','font-size':11,'font-weight':800,fill:COLORS.ink});
      val.textContent = formatNum(r.shap);
      g.appendChild(val);

      // interactivity
      const hit = elNS('rect',{x:0,y:y-2,width:innerW,height:barH+6,fill:'transparent'});
      hit.style.cursor='help';
      hit.addEventListener('mouseenter', (ev)=>{
        const msg = (()=>{
          if(r.note) return `<b style="color:#F0E442">${escapeHtml(r.feature)}</b> — ${escapeHtml(r.note)}<br><span style="opacity:.75">mean|SHAP| ${formatNum(r.shap)} — ${i===0?'top driver': i===1?'2nd':'others'}</span>`;
          // default everyday
          let everyday='overall pick matters 3x cap%';
          if(r.feature.includes('overall')) everyday='overall pick matters 3x cap%';
          else if(r.feature.includes('log')) everyday='lock in value early = aging well';
          else if(r.feature.includes('rd')) everyday='2nd-round steals found late';
          else if(r.feature.includes('inv')) everyday='payroll alone doesn’t win';
          else everyday='small but real pull';
          return `<b style="color:#F0E442">${escapeHtml(r.feature)}</b> <span style="opacity:.8">${escapeHtml(String(r.raw!=null?r.raw:''))}</span><br>${escapeHtml(everyday)}<br><span style="opacity:.6">mean|SHAP| ${formatNum(r.shap)}</span>`;
        })();
        showTip(msg, ev.clientX, ev.clientY);
      });
      hit.addEventListener('mousemove',(ev)=>{ if(tip && tip.style.opacity==='1') showTip(tip.innerHTML, ev.clientX, ev.clientY);});
      hit.addEventListener('mouseleave', hideTip);
      g.appendChild(hit);
    });
  }

  /* PD CURVES — line + area fill, scrub dot */
  function renderPD(containerId, pdPoints){
    const host = qs(containerId);
    if(!host){ console.warn('[glassbox] no container', containerId); return; }
    host.innerHTML='';

    let curves = [];
    if(Array.isArray(pdPoints) && pdPoints.length && Array.isArray(pdPoints[0]?.points)){
      curves = pdPoints; // [{label, xField, points:[{x,y}]}…]
    } else if(Array.isArray(pdPoints) && pdPoints.length && pdPoints[0]?.x!=null){
      curves = [{label:'expected value', xField:'x', points:pdPoints}];
    } else {
      // demo generation matching spec: draft slot, cap%, year
      const mk = (fn, xs, label, xField)=>{
        return {label, xField, points: xs.map(x=>({x, y: fn(x)}))};
      };
      curves=[
        mk((slot)=>{ const z=Math.max(0,1-slot/60); return 120 + 920*Math.pow(z,0.85) - slot*0.6; }, range(1,60,2), 'Overall → Surplus (lottery steep)','draft_slot'),
        mk((capPct)=>{ // plateau then tax penalty
          const pct=capPct; // 0.3-1.2
          let v= 40 + 55*(1-Math.exp(-(pct-0.3)*3.5));
          if(pct>0.85) v -= (pct-0.85)*180;
          return v+5;
        }, linspace(0.3,1.25,40), 'Cap% → Score (plateau then tax)','cap_pct'),
        mk((yr)=>{
          const base=0.92+0.12*Math.max(0,Math.min(1,(yr-2010)/14));
          let spike = yr===2016?0.07:0;
          return base+spike;
        }, range(1996,2026,1), 'Era growth 0.92→1.19 2016 spike','year'),
      ];
    }

    curves.forEach((curve, ci)=>{
      const wrap=document.createElement('div');
      wrap.style.cssText='margin:10px 0 16px; border:2.2px solid #1A150F; border-radius:14px; background:#fff; box-shadow:3px 3px 0 #1A150F; overflow:hidden';
      host.appendChild(wrap);

      const head=document.createElement('div');
      head.style.cssText='display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:10px 12px;border-bottom:1.5px solid #E5E2D8;background:#FFFEF7';
      head.innerHTML=`<span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:900;text-transform:uppercase;border:1.6px solid #1A150F;border-radius:999px;padding:4px 10px;background:#1A150F;color:#fff">${escapeHtml(curve.label)} · ${escapeHtml(curve.xField||'x')}</span><span style="font-family:ui-monospace,monospace;font-size:10px;opacity:.6">scrub → dot · hover for HH</span>`;
      wrap.appendChild(head);

      const svgHost=document.createElement('div');
      svgHost.style.cssText='padding:8px 8px 2px';
      wrap.appendChild(svgHost);

      const W = Math.max(320, host.clientWidth||560)-36;
      const H = 180;
      const m = {top:12,right:18,bottom:28,left:42};
      const iw=W-m.left-m.right, ih=H-m.top-m.bottom;
      const svg=makeSVG(W,H);
      svgHost.appendChild(svg);
      svg.style.background='#fff';
      svg.setAttribute('viewBox',`0 0 ${W} ${H}`);

      const pts = curve.points||[];
      const xs = pts.map(p=>Number(p.x)), ys = pts.map(p=>Number(p.y));
      const xMin=Math.min(...xs), xMax=Math.max(...xs);
      const yMin=Math.min(...ys), yMax=Math.max(...ys);
      const yPad=(yMax-yMin)*0.14||1;
      const y0=yMin-yPad, y1=yMax+yPad;

      function sx(v){ return m.left + ((v-xMin)/(xMax-xMin||1))*iw; }
      function sy(v){ return m.top + (1-(v-y0)/(y1-y0||1))*ih; }

      // area
      let areaD=`M ${sx(xs[0])} ${sy(ys[0])} `;
      pts.forEach(p=>{ areaD+=`L ${sx(p.x)} ${sy(p.y)} `;});
      areaD+=`L ${sx(xs[xs.length-1])} ${sy(y0)} L ${sx(xs[0])} ${sy(y0)} Z`;
      const area=elNS('path',{d:areaD,fill: ci===0?'#FFF8C2':ci===1?'#E8F4FF':'#E7F6EA',opacity:0.85,stroke:'none'});
      svg.appendChild(area);

      // line
      let lineD=`M ${sx(xs[0])} ${sy(ys[0])}`;
      for(let i=1;i<pts.length;i++) lineD+=` L ${sx(pts[i].x)} ${sy(pts[i].y)}`;
      const line=elNS('path',{d:lineD,fill:'none',stroke:COLORS.ink,'stroke-width':2.2,'stroke-linecap':'round','stroke-linejoin':'round'});
      svg.appendChild(line);

      // grid
      [0,0.5,1].forEach(t=>{
        const yv = y0 + t*(y1-y0);
        const ly = sy(yv);
        svg.appendChild(elNS('line',{x1:m.left,y1:ly,x2:m.left+iw,y2:ly,stroke:'#EFE9D8','stroke-width':1,'stroke-dasharray':'4 4'}));
      });

      // axes labels
      const xl=elNS('text',{x:m.left,y:H-4,'font-family':'ui-monospace,monospace','font-size':10,fill:COLORS.dim});
      xl.textContent=`${formatNum(xMin)} → ${formatNum(xMax)} ${curve.xField||''}`;
      svg.appendChild(xl);
      const yl=elNS('text',{x:8,y:m.top+10,'font-family':'ui-monospace,monospace','font-size':10,fill:COLORS.dim,transform:`rotate(-90 8 ${m.top+10})`});
      yl.textContent=`exp val ${formatNum(yMin)}→${formatNum(yMax)}`;
      svg.appendChild(yl);

      // scrub dot
      const dot = elNS('circle',{cx:sx(xs[0]),cy:sy(ys[0]),r:5,fill:COLORS.mustard,stroke:COLORS.ink,'stroke-width':1.8});
      dot.style.pointerEvents='none';
      svg.appendChild(dot);

      const vline = elNS('line',{x1:sx(xs[0]),y1:m.top,x2:sx(xs[0]),y2:m.top+ih,stroke:COLORS.ink,'stroke-width':1,'stroke-dasharray':'3 3',opacity:0.35});
      svg.appendChild(vline);

      // invisible hit rect for mouse
      const hit = elNS('rect',{x:m.left,y:m.top,width:iw,height:ih,fill:'transparent'});
      hit.style.cursor='crosshair';
      svg.appendChild(hit);

      function nearestAt(clientX){
        const r = svg.getBoundingClientRect();
        const px = clientX - r.left;
        const scale = W / r.width;
        const scaledX = px*scale;
        const dataX = xMin + ((scaledX - m.left)/iw)*(xMax-xMin);
        // clamp
        const clamped = Math.max(xMin, Math.min(xMax, dataX));
        // nearest index by x
        let best=0, bestD=Infinity;
        for(let i=0;i<xs.length;i++){ const d=Math.abs(xs[i]-clamped); if(d<bestD){bestD=d; best=i;}}
        return {idx:best, x:xs[best], y:ys[best], px: sx(xs[best]), py: sy(ys[best])};
      }

      hit.addEventListener('mousemove',(ev)=>{
        const n = nearestAt(ev.clientX);
        dot.setAttribute('cx', String(n.px));
        dot.setAttribute('cy', String(n.py));
        vline.setAttribute('x1', String(n.px)); vline.setAttribute('x2', String(n.px));
        const everyday = (()=>{
          if(curve.xField==='draft_slot'||curve.label.includes('Overall')){
            if(n.x<=3) return `Lottery #${Math.round(n.x)} — steep value ★`;
            if(n.x<=14) return `Lottery protected #${Math.round(n.x)} — still +`;
            return `Late 1st #${Math.round(n.x)} — floor 100 guard`;
          }
          if((curve.xField||'').includes('cap')){
            if(n.x>0.9) return `Over cap ${(n.x*100|0)}% — tax penalty`;
            if(n.x<0.55) return `Under 55% — flexible +`;
            return `Sweet 60-85% — market beat`;
          }
          if(curve.xField==='year'){
            if(n.x===2016) return `2016 spike — TV money +75%`;
            return `${n.x|0} era mult ×${n.y.toFixed(2)}`;
          }
          return `expected ${formatNum(n.y)}`;
        })();
        showTip(`<b>${escapeHtml(curve.xField||'x')}</b> ${escapeHtml(String(formatNum(n.x)))}<br><b>y</b> ${escapeHtml(String(formatNum(n.y)))}<br><span style="opacity:.75">${escapeHtml(everyday)}</span>`, ev.clientX, ev.clientY);
      });
      hit.addEventListener('mouseleave', ()=>{ hideTip(); });
    });
  }

  /* Cap vs Wins scatter */
  function renderScatterCap(containerId, teams){
    const host = qs(containerId);
    if(!host){ console.warn('[glassbox] no container', containerId); return; }
    host.innerHTML='';

    let pts = Array.isArray(teams) ? teams : [];
    if(pts.length===0){
      // fallback demo 30T-ish from spec
      pts = range(1,30,1).map(i=>({
        abbr: ['GSW','BOS','MIL','DEN','NYK','OKC','SAS','LAL','MIA','PHI','DAL','PHX','LAC','MIN','CLE','IND','SAC','NOP','MEM','ATL','CHI','DET','HOU','TOR','UTA','POR','ORL','CHA','BKN','WAS'][i-1],
        payroll_m: 55+ Math.random()*105,
        wins: 12+ Math.random()*52,
        tier: i<8?'A': i<18?'B':'C',
        champ: i===5,
        for_score: 40+Math.random()*60,
      }));
    }

    const W = Math.max(340, host.clientWidth||620);
    const H = 380;
    const m={top:16,right:18,bottom:38,left:46};
    const iw=W-m.left-m.right, ih=H-m.top-m.bottom;
    const svg=makeSVG(W,H);
    host.appendChild(svg);

    svg.appendChild(elNS('rect',{x:0,y:0,width:W,height:H,rx:14,fill:'#fff',stroke:COLORS.ink,'stroke-width':2.2}));

    const pays = pts.map(p=>Number(p.payroll_m||p.pay||0));
    const wins = pts.map(p=>Number(p.wins||0));
    const xMin=Math.min(...pays)*0.92, xMax=Math.max(...pays)*1.06;
    const yMin=Math.max(0,Math.min(...wins)-4), yMax=Math.max(...wins)+4;
    function sx(v){ return m.left + ((v-xMin)/(xMax-xMin||1))*iw; }
    function sy(v){ return m.top + (1-(v-yMin)/(yMax-yMin||1))*ih; }

    // grid
    for(let k=0;k<=4;k++){
      const yv = yMin + (k/4)*(yMax-yMin);
      svg.appendChild(elNS('line',{x1:m.left,y1:sy(yv),x2:m.left+iw,y2:sy(yv),stroke:'#EFEAD8','stroke-width':1,'stroke-dasharray':'4 5'}));
      const lbl=elNS('text',{x:m.left-8,y:sy(yv)+3,'text-anchor':'end','font-family':'ui-monospace,monospace','font-size':10,fill:COLORS.dim});
      lbl.textContent=String(Math.round(yv));
      svg.appendChild(lbl);
    }
    for(let k=0;k<=4;k++){
      const xv=xMin+(k/4)*(xMax-xMin);
      svg.appendChild(elNS('line',{x1:sx(xv),y1:m.top,x2:sx(xv),y2:m.top+ih,stroke:'#EFEAD8','stroke-width':1,'stroke-dasharray':'4 5'}));
      const lbl=elNS('text',{x:sx(xv),y:H-10,'text-anchor':'middle','font-family':'ui-monospace,monospace','font-size':10,fill:COLORS.dim});
      lbl.textContent='$'+Math.round(xv)+'M';
      svg.appendChild(lbl);
    }

    // axes titles
    const xt=elNS('text',{x:m.left+iw/2,y:H-2,'text-anchor':'middle','font-family':'ui-monospace,monospace','font-size':11,'font-weight':800,fill:COLORS.ink});
    xt.textContent='payroll $M →';
    svg.appendChild(xt);
    const yt=elNS('text',{x:10,y:m.top+ih/2,'text-anchor':'middle','font-family':'ui-monospace,monospace','font-size':11,'font-weight':800,fill:COLORS.ink,transform:`rotate(-90 10 ${m.top+ih/2})`});
    yt.textContent='wins →';
    svg.appendChild(yt);

    // best-fit line (simple linreg) to show soft overpay not win
    const lr = linreg(pays,wins);
    if(lr){
      const x1p=sx(xMin), y1p=sy(lr.m*xMin+lr.b), x2p=sx(xMax), y2p=sy(lr.m*xMax+lr.b);
      svg.appendChild(elNS('line',{x1:x1p,y1:y1p,x2:x2p,y2:y2p,stroke:COLORS.blue,'stroke-width':1.4,'stroke-dasharray':'6 5',opacity:0.55}));
    }

    pts.forEach(p=>{
      const x = sx(Number(p.payroll_m||0));
      const y = sy(Number(p.wins||0));
      const tier = (p.tier||'').toUpperCase();
      let fill = COLORS.ink;
      if(tier.startsWith('A')) fill=COLORS.green;
      else if(tier.startsWith('B')) fill='#FFC65C';
      else fill='#D8D0BF';

      const isChamp = !!(p.champ||p.is_champion);
      // ring for champ
      if(isChamp){
        svg.appendChild(elNS('circle',{cx:x,cy:y,r:14,fill:'#FFD700',stroke:COLORS.ink,'stroke-width':2}));
        svg.appendChild(elNS('circle',{cx:x,cy:y,r:9,fill:fill,stroke:COLORS.ink,'stroke-width':1.6}));
      } else {
        svg.appendChild(elNS('circle',{cx:x,cy:y,r:7,fill:fill,stroke:COLORS.ink,'stroke-width':1.6}));
      }

      // label tiny
      const lab=elNS('text',{x:x+10,y:y-8,'font-family':'ui-monospace,monospace','font-size':9,'font-weight':800,fill:COLORS.ink,opacity:0.9});
      lab.textContent= p.abbr||p.team||'';
      svg.appendChild(lab);

      // hit area
      const hit=elNS('circle',{cx:x,cy:y,r:16,fill:'transparent'});
      hit.style.cursor='pointer';
      hit.addEventListener('mouseenter',(ev)=>{
        const plain = (()=>{
          const ab = p.abbr||p.name||'Team';
          const wpm = p.w_per_m!=null? ` • ${p.w_per_m} W/$M`:'';
          const grade = p.for_grade||p.grade||'';
          const cap = p.cap_pct!=null? ` cap ${(p.cap_pct*100|0)}%`:'';
          let everyday = '';
          if(isChamp) everyday = `👑 CHAMP — ring>seed ethos. ${p.wins}W regular but playoff DNA. ${grade?`FOR ${grade}`:''}`;
          else if((p.wins||0)>50 && (p.payroll_m||0)>170) everyday = `${ab} bought wins — $ ${Math.round(p.payroll_m)}M for ${p.wins}W — expensive flex`;
          else if((p.wins||0)>45 && (p.payroll_m||0)<130) everyday = `${ab} efficient — $${Math.round(p.payroll_m)}M → ${p.wins}W smart`;
          else if((p.wins||0)<25) everyday = `${ab} rebuilding — cheap but needs picks`;
          else everyday = `${ab} ${p.wins}W on $${Math.round(p.payroll_m)}M${wpm}${cap} — ${grade?`grade ${grade}`:'market beat'}`;
          return {ab, everyday, wpm, grade};
        })();
        showTip(`<b style="color:#F0E442">${escapeHtml(plain.ab)}${plain.grade?` · ${escapeHtml(String(plain.grade))}`:''}</b><br>${escapeHtml(plain.everyday)}<br><span style="opacity:.6">pay $${escapeHtml(String(Math.round(p.payroll_m||0)))}M · ${escapeHtml(String(p.wins||0))}W · ${escapeHtml(String(isChamp?'CHAMP':plain.wpm))}</span>`, ev.clientX, ev.clientY);
      });
      hit.addEventListener('mousemove',(ev)=>{ if(tip) showTip(tip.innerHTML, ev.clientX, ev.clientY); });
      hit.addEventListener('mouseleave', hideTip);
      svg.appendChild(hit);
    });
  }

  function range(a,b,step){ const r=[]; for(let i=a;i<=b;i+=step) r.push(i); return r; }
  function linspace(a,b,n){ const r=[]; for(let i=0;i<n;i++) r.push(a+(b-a)*i/(n-1)); return r; }
  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function linreg(xs,ys){
    const n=xs.length; if(n<2) return null;
    let sx=0,sy=0,sxx=0,sxy=0;
    for(let i=0;i<n;i++){ sx+=xs[i]; sy+=ys[i]; sxx+=xs[i]*xs[i]; sxy+=xs[i]*ys[i]; }
    const denom = n*sxx - sx*sx;
    if(Math.abs(denom)<1e-9) return null;
    const m = (n*sxy - sx*sy)/denom;
    const b = (sy - m*sx)/n;
    return {m,b};
  }

  const api = { renderShapBar, renderPD, renderScatterCap, _escape:escapeHtml };

  // expose globally for inline-friendly <script src="">
  global.GlassboxCharts = api;
  // also for module-ish envs
  if(typeof globalThis!=='undefined') globalThis.GlassboxCharts = api;
  try{ if(typeof module!=='undefined' && module.exports) module.exports = api; }catch(e){}
})(typeof window!=='undefined'?window:this);

// helper: auto-init if data-shap containers exist — polite delight
document.addEventListener('DOMContentLoaded', ()=>{
  try{
    // try to hydrate if known containers present and no explicit data — no-op safe
    const shapHost=document.getElementById('glassbox-shap');
    if(shapHost && !shapHost.dataset.rendered){
      // if a page injected window.__SHAP__ data use it, else demo
      const demo = window.__SHAP__ || null;
      if(demo || shapHost.dataset.auto!=='false'){
        window.GlassboxCharts.renderShapBar('glassbox-shap', demo);
        shapHost.dataset.rendered='1';
      }
    }
    const pdHost=document.getElementById('glassbox-pd');
    if(pdHost && !pdHost.dataset.rendered){
      const pd = window.__PD__ || null;
      if(pd || pdHost.dataset.auto!=='false'){
        window.GlassboxCharts.renderPD('glassbox-pd', pd);
        pdHost.dataset.rendered='1';
      }
    }
    const capHost=document.getElementById('glassbox-scatter');
    if(capHost && !capHost.dataset.rendered){
      const teams = window.__TEAMS__ || null;
      if(teams || capHost.dataset.auto!=='false'){
        window.GlassboxCharts.renderScatterCap('glassbox-scatter', teams);
        capHost.dataset.rendered='1';
      }
    }
  }catch(e){ console.warn('[glassbox] auto-init failed', e); }
});
