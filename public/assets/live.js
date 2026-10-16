
const SB='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const SUM=id=>`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`;
let games=[], cur=null, timer=null, lastUpd=null;

// ---- Day navigation (ESPN days run on America/New_York) ----
let sbDay=null, sbExplicit=false; // sbDay: 'YYYYMMDD' being viewed; null = today
function etToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/-/g,'');}
function shiftDay(yyyymmdd,n){const t=new Date(Date.UTC(+yyyymmdd.slice(0,4),+yyyymmdd.slice(4,6)-1,+yyyymmdd.slice(6,8))+n*864e5);return String(t.getUTCFullYear())+String(t.getUTCMonth()+1).padStart(2,'0')+String(t.getUTCDate()).padStart(2,'0');}
function dayLabel(yyyymmdd){const t=new Date(Date.UTC(+yyyymmdd.slice(0,4),+yyyymmdd.slice(4,6)-1,+yyyymmdd.slice(6,8)));const s=t.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});return (yyyymmdd===etToday()?'Today — ':'')+s;}
function renderDayNav(){const cur2=sbDay||etToday();const lbl=$('dayLbl');if(lbl)lbl.textContent=dayLabel(cur2);const b=$('dayToday');if(b)b.hidden=cur2===etToday();}
function resetView(){cur=null;clearInterval(timer);const m=$('main');if(m)m.style.display='block';const ln=$('live-loading');if(ln)ln.style.display='block';}
function gotoDay(n){sbExplicit=true;resetView();loadGames(shiftDay(sbDay||etToday(),n));}

const $=id=>document.getElementById(id);
const LROOT=()=>document.querySelector('.live-root');
function showErr(m){const e=$('err');e.style.display='block';e.textContent=m;}
function hideErr(){$('err').style.display='none';}

async function jget(u){const r=await fetch(u);if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}

async function loadGames(day){
  sbDay=day||null;
  renderDayNav();
  try{
    const d=await jget(sbDay?SB+'?dates='+sbDay:SB);
    games=(d.events||[]).map(e=>{
      const c=e.competitions[0],ts=c.competitors;
      const h=ts.find(t=>t.homeAway==='home'),a=ts.find(t=>t.homeAway==='away');
      return {id:e.id,state:e.status.type.state,detail:e.status.type.shortDetail,
        clock:c.status.displayClock,period:c.status.period,
        h:{abbr:h.team.abbreviation,name:h.team.displayName,score:h.score,color:'#'+(h.team.color||'1c1a15'),rec:h.records&&h.records[0]?h.records[0].summary:''},
        a:{abbr:a.team.abbreviation,name:a.team.displayName,score:a.score,color:'#'+(a.team.color||'6b675c'),rec:a.records&&a.records[0]?a.records[0].summary:''}};
    });
    renderGames();
    const live=games.find(g=>g.state==='in');
    if(live) selectGame(live.id);
    else if(games.length) selectGame(games[0].id);
  }catch(e){showErr('Could not load scoreboard: '+e.message);}
}

function renderGames(){
  const el=$('games');el.innerHTML='';
  games.forEach(g=>{
    const b=document.createElement('button');
    b.className='gbtn'+(g.state==='in'?' live':'')+(cur===g.id?' sel':'');
    b.innerHTML=`<div class="ms">${g.a.abbr} @ ${g.h.abbr}</div>
      ${g.state!=='pre'?`<div class="sc">${g.a.score} – ${g.h.score}</div>`:''}
      <div class="st">${g.state==='in'?'● LIVE — '+g.detail:g.state==='post'?'Final':g.detail}</div>`;
    b.onclick=()=>selectGame(g.id);
    el.appendChild(b);
  });
  if(!games.length)el.innerHTML='<span style="font-size:13px">No NBA games — '+dayLabel(sbDay||etToday())+'.</span>';
}

// ---- Timeline scrubber state ----
const TL={n:0,view:-1,live:true,gameId:null,newCount:0};
// ---- Wave 5 fold state ----
// The six lower plates live inside #more-plates (display:none until opened).
// Painting them on every load/refresh/scrub was pure main-thread cost for
// pixels nobody could see — and on a loaded browser it stacked up at initial
// load. renderAll paints them only while the fold is open; opening the fold
// replays the full render + atlas sync against the latest data.
let foldOpen=false;
function syncAtlas(d,g){
  if(!window.LiveAtlas)return;
  const f=fireNow(d,TL.live?TL.n-1:TL.view);
  window.LiveAtlas.onGame(d,g,f&&JAM?f.name:null);
}
function selectGame(id){
  cur=id;clearInterval(timer);renderGames();$('main').style.display='block';const ln2=$('live-loading');if(ln2)ln2.style.display='none';
  TL.gameId=null;TL.n=0;TL.view=-1;TL.live=true;TL.newCount=0;wpDrawnFor=null;
  window._seenMom=new Set();window._lastPlayId=0;
  LROOT().classList.remove('rewound');
  loadGame();timer=setInterval(loadGame,30000);
}
function renderAll(d,g){
  if(g&&g.a&&g.h){try{document.title='Courtside — '+g.a.abbr+' @ '+g.h.abbr;}catch(e){}}
  const idx=TL.live?TL.n-1:TL.view;
  renderHeader(d,g,idx);renderWP(d,g,idx);
  renderGhosts(d);renderMoments(d,g,idx);
  if(foldOpen){
    renderMomentum(d,g,idx);
    renderPlays(d,idx);renderLeaders(d,g,idx);
    renderMiles(d);renderShotChart(d,g,idx);
  }
  updateTlUI(d);
}
async function loadGame(){
  const myId=cur;
  hideErr();
  try{
    const d=await jget(SUM(myId));
    if(myId!==cur)return;
    const g=games.find(x=>x.id===String(cur))||games.find(x=>x.id===cur);
    const n=(d.plays||[]).length;
    const first=TL.gameId!==String(cur);
    if(first){
      TL.gameId=String(cur);TL.n=n;TL.view=Math.max(0,n-1);TL.live=true;TL.newCount=0;
    }else if(n>TL.n){
      if(TL.live)TL.view=n-1;else TL.newCount+=n-TL.n;
      TL.n=n;
    }
    renderAll(d,g);
    if(foldOpen) syncAtlas(d,g);
    window._lastD=d;window._lastG=g;
    lastUpd=new Date();
    $('upd').textContent='updated '+lastUpd.toLocaleTimeString();
  }catch(e){showErr('Refresh failed: '+e.message+' — will retry.');}
}
function updateTlUI(d){
  const bar=$('tlbar'),n=TL.n,show=n>1;
  bar.style.display=show?'block':'none';
  if(!show){LROOT().classList.remove('rewound');$('liveBtn').classList.remove('show');return;}
  const sc=$('scrub');
  sc.max=n-1;
  if(document.activeElement!==sc)sc.value=TL.view;
  const plays=d.plays||[];
  const p=plays[TL.view];
  const qs=[];let pq=null;
  plays.forEach((pl,i)=>{if(pl.period.number!==pq){qs.push({q:pl.period.number,i:i});pq=pl.period.number;}});
  $('tlticks').innerHTML=qs.map(o=>'<span style="left:'+(o.i/Math.max(1,n-1)*100).toFixed(1)+'%">Q'+o.q+'</span>').join('');
  $('tlclock').textContent=TL.live?'● LIVE':(p?('Q'+p.period.number+' '+p.clock.displayValue):'');
  $('tlclock').style.color=TL.live?'#c2401f':'#5b5545';
  LROOT().classList.toggle('rewound',!TL.live);
  $('liveBtn').classList.toggle('show',!TL.live);
  $('liveNew').textContent=TL.newCount?(' +'+TL.newCount):'';
}
(function(){
  const sc=$('scrub');
  let scrubT=0;
  sc.addEventListener('input',()=>{
    TL.view=+sc.value;
    TL.live=TL.view>=TL.n-1;
    if(TL.live)TL.newCount=0;
    const now=performance.now();
    if(now-scrubT>90&&window._lastD){scrubT=now;renderAll(window._lastD,window._lastG);}
  });
  sc.addEventListener('change',()=>{if(window._lastD)renderAll(window._lastD,window._lastG);});
  let rszT=null,rszW=window.innerWidth;
  window.addEventListener('resize',()=>{
    // Height-only resizes (scrollbar/URL-bar churn) change nothing the fixed-
    // height canvases draw; re-rendering all plates on them can feed a
    // resize<->layout loop. Only a width change earns a full re-render.
    if(window.innerWidth===rszW)return;
    rszW=window.innerWidth;
    clearTimeout(rszT);
    rszT=setTimeout(()=>{if(window._lastD)renderAll(window._lastD,window._lastG);},220);
  });
  $('liveBtn').onclick=()=>{
    TL.live=true;TL.view=TL.n-1;TL.newCount=0;
    if(window._lastD)renderAll(window._lastD,window._lastG);
    window.scrollTo({top:0,behavior:'smooth'});
  };
})();

function renderHeader(d,g,idx){
  const h=d.header.competitions[0],ts=h.competitors;
  const hm=ts.find(t=>t.homeAway==='home'),am=ts.find(t=>t.homeAway==='away');
  $('aAbbr').textContent=am.team.abbreviation;$('hAbbr').textContent=hm.team.abbreviation;
  const pl=(d.plays||[])[idx];
  /* Pre-tip games carry no score from ESPN — show an en dash, never NaN. */
  const numOrNull=s=>(s==null||s==='')?null:+s;
  setScore($('aScore'), pl?+pl.awayScore:numOrNull(am.score));
  setScore($('hScore'), pl?+pl.homeScore:numOrNull(hm.score));
  $('aRec').textContent=am.records&&am.records[0]?am.records[0].summary:'';
  $('hRec').textContent=hm.records&&hm.records[0]?hm.records[0].summary:'';
  const st=h.status.type;
  const liveNow=TL.live&&st.state==='in';
  $('clock').textContent=liveNow
    ? (h.status.displayClock+' — '+ordinal(h.status.period)+' quarter')
    : (pl?('Q'+pl.period.number+' '+pl.clock.displayValue+' · '+st.shortDetail):st.shortDetail);
  $('clock').style.color=liveNow?'#c2401f':'#5b5545';
  LROOT().classList.toggle('final',st.state==='post');
}
function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function ordinal(n){return n+(['th','st','nd','rd'][n]||'th');}

// ---- animation + canvas helpers ----
function setScore(el,v){
  if(v==null||isNaN(v)){ el.textContent='\u2013'; el.dataset.v=''; return; }
  tickNum(el,v);
}
function tickNum(el,to,fmt){
  fmt=fmt||(v=>String(Math.round(v)));
  const from=parseFloat(el.dataset.v),f=isNaN(from)?to:from;
  el.dataset.v=to;
  if(f===to){el.textContent=fmt(to);return;}
  const t0=performance.now(),dur=650;
  (function fr(t){
    const k=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-k,3);
    el.textContent=fmt(f+(to-f)*e);
    if(k<1)requestAnimationFrame(fr);else el.textContent=fmt(to);
  })(t0);
}
function hexA(hex,a){
  const h=String(hex||'#1b1913').replace('#','');
  const r=parseInt(h.substr(0,2),16),g=parseInt(h.substr(2,2),16),b=parseInt(h.substr(4,2),16);
  return `rgba(${r},${g},${b},${a})`;
}
function prepCanvas(id,hCss){
  const cv=$(id),dpr=Math.min(2,window.devicePixelRatio||1);
  const wCss=cv.clientWidth||600;
  cv.width=Math.round(wCss*dpr);cv.height=Math.round(hCss*dpr);
  cv.style.height=hCss+'px';
  const ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,wCss,hCss);
  return {ctx:ctx,W:wCss,H:hCss};
}
function qDividers(s,pts,X,padT,H,padB){
  let prev=null;
  s.font='8px ui-monospace,monospace';s.textAlign='left';
  pts.forEach((p,i)=>{
    if(p.period.number!==prev){
      const x=X(i);
      s.strokeStyle='rgba(27,25,19,.22)';s.setLineDash([3,3]);s.lineWidth=1;
      s.beginPath();s.moveTo(x,padT-6);s.lineTo(x,H-padB);s.stroke();s.setLineDash([]);
      s.fillStyle='#5b5545';s.fillText('Q'+p.period.number,x+4,padT-8);
      prev=p.period.number;
    }
  });
}

let wpDrawnFor=null;
function renderWP(d,g,idx){
  const wp=d.winprobability||[],plays=d.plays||[];
  const habbr=g?g.h.abbr:'HOME',aabbr=g?g.a.abbr:'AWAY';
  const hcol=g?g.h.color:'#1b1913',acol=g?g.a.color:'#5b5545';
  if(!wp.length){$('wpBig').textContent='\u2013';return;}
  const byId={};wp.forEach(w=>byId[w.playId]=w.homeWinPercentage);
  const pts=[];
  plays.forEach((p,i)=>{if(byId[p.id]!==undefined)pts.push({p:p,i:i});});
  const n=pts.length;if(!n)return;
  const {ctx,W,H}=prepCanvas('wpchart',170);
  const padL=30,padR=10,padT=16,padB=8;
  const X=i=>padL+(W-padL-padR)*(i/Math.max(n-1,1));
  const Y=v=>padT+(H-padT-padB)*(1-v);
  const vals=pts.map(x=>byId[x.p.id]);
  let vp=n-1;
  for(let k=0;k<n;k++){if(pts[k].i<=idx)vp=k;else break;}
  vp=Math.max(0,vp);
  const sc=document.createElement('canvas');sc.width=ctx.canvas.width;sc.height=ctx.canvas.height;
  const s=sc.getContext('2d');s.setTransform(ctx.getTransform());
  [0,0.25,0.5,0.75,1].forEach(f=>{
    const y=Y(f);
    s.strokeStyle=f===0.5?'rgba(27,25,19,.45)':'rgba(27,25,19,.1)';
    s.setLineDash(f===0.5?[5,4]:[]);s.lineWidth=1;
    s.beginPath();s.moveTo(padL,y);s.lineTo(W-padR,y);s.stroke();s.setLineDash([]);
    s.fillStyle='#5b5545';s.font='8px ui-monospace,monospace';s.textAlign='right';
    s.fillText(Math.round(f*100)+'%',padL-4,y+3);
  });
  qDividers(s,pts.map(x=>x.p),X,padT,H,padB);
  let iMax=0,iMin=0;
  vals.forEach((v,i)=>{if(v>vals[iMax])iMax=i;if(v<vals[iMin])iMin=i;});
  s.font='8px ui-monospace,monospace';s.textAlign='center';
  s.fillStyle=hcol;s.fillText('peak '+Math.round(vals[iMax]*100)+'%',X(iMax),Y(vals[iMax])-7);
  s.fillStyle=acol;s.fillText('low '+Math.round(vals[iMin]*100)+'%',X(iMin),Y(vals[iMin])+11);
  const key=cur+'wp',animate=wpDrawnFor!==key;
  const t0=performance.now(),dur=animate?1100:1;
  function frame(t){
    const prog=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-prog,3);
    const upto=animate?Math.max(2,Math.ceil(n*e)):n;
    ctx.clearRect(0,0,W,H);
    ctx.drawImage(sc,0,0,W,H);
    for(let i=1;i<upto;i++){
      const x0=X(i-1),x1=X(i),v0=vals[i-1],v1=vals[i];
      ctx.fillStyle=hexA(((v0+v1)/2)>=0.5?hcol:acol,0.16);
      ctx.beginPath();
      ctx.moveTo(x0,Y(v0));ctx.lineTo(x1,Y(v1));
      ctx.lineTo(x1,Y(0.5));ctx.lineTo(x0,Y(0.5));ctx.closePath();ctx.fill();
    }
    ctx.beginPath();ctx.moveTo(X(0),Y(vals[0]));
    for(let i=1;i<upto;i++)ctx.lineTo(X(i),Y(vals[i]));
    ctx.strokeStyle='#1b1913';ctx.lineWidth=2.2;ctx.lineJoin='round';ctx.stroke();
    if(prog>=1){
      [[iMax,hcol],[iMin,acol]].forEach(function(pair){
        const ii=pair[0],c=pair[1];
        ctx.beginPath();ctx.arc(X(ii),Y(vals[ii]),3.5,0,7);ctx.fillStyle=c;ctx.fill();
        ctx.beginPath();ctx.arc(X(ii),Y(vals[ii]),6,0,7);ctx.strokeStyle=hexA(c,.4);ctx.lineWidth=1.5;ctx.stroke();
      });
      const xd=X(vp);
      if(vp<n-1){
        ctx.fillStyle='rgba(244,239,226,.62)';
        ctx.fillRect(xd,padT,W-padR-xd,H-padT-padB);
        ctx.strokeStyle='#c2401f';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);
        ctx.beginPath();ctx.moveTo(xd,padT);ctx.lineTo(xd,H-padB);ctx.stroke();ctx.setLineDash([]);
      }
      const lx=X(vp),ly=Y(vals[vp]);
      ctx.beginPath();ctx.arc(lx,ly,8,0,7);ctx.strokeStyle=hexA('#c2401f',.5);ctx.lineWidth=2;ctx.stroke();
      ctx.beginPath();ctx.arc(lx,ly,4,0,7);ctx.fillStyle='#c2401f';ctx.fill();
      wpDrawnFor=key;
    }
    if(prog<1)requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const lv=vals[vp],hpct=Math.round(lv*100);
  tickNum($('wpBig'),hpct,function(v){return Math.round(v)+'% '+habbr;});
  $('wpBig').style.color=lv>=0.5?'#1b1913':'#5b5545';
  $('wpLbl').textContent=TL.live?(aabbr+' '+(100-hpct)+'% \u00b7 live, via ESPN model'):'at this moment \u00b7 via ESPN model';
  $('lgA').textContent='Tip \u2192 '+aabbr;$('lgH').textContent=habbr+' \u2192 now';
}

function renderMomentum(d,g,idx){
  const plays=d.plays||[];
  if(!plays.length)return;
  const habbr=g?g.h.abbr:'HOME',aabbr=g?g.a.abbr:'AWAY';
  const hcol=g?g.h.color:'#1b1913',acol=g?g.a.color:'#5b5545';
  const {ctx,W,H}=prepCanvas('momchart',150);
  const diffs=plays.map(p=>(+p.homeScore)-(+p.awayScore));
  const n=diffs.length;
  const vi=Math.max(0,Math.min(idx,n-1));
  const mx=Math.max(8,...diffs.map(v=>Math.abs(v)));
  const padL=30,padR=10,padT=12,padB=8;
  const X=i=>padL+(W-padL-padR)*(i/Math.max(n-1,1));
  const Y=v=>padT+(H-padT-padB)*(1-(v+mx)/(2*mx));
  // quarter dividers
  qDividers(ctx,plays,X,padT,H,padB);
  // zero line
  ctx.strokeStyle='rgba(27,25,19,.5)';ctx.lineWidth=1.2;
  ctx.beginPath();ctx.moveTo(padL,Y(0));ctx.lineTo(W-padR,Y(0));ctx.stroke();
  ctx.fillStyle='#5b5545';ctx.font='8px ui-monospace,monospace';ctx.textAlign='right';
  ctx.fillText('0',padL-4,Y(0)+3);
  ctx.fillText('+'+mx,padL-4,Y(mx)+3);ctx.fillText('−'+mx,padL-4,Y(-mx)+3);
  // split fill
  function areaPath(){
    ctx.beginPath();ctx.moveTo(X(0),Y(diffs[0]));
    for(let i=1;i<n;i++)ctx.lineTo(X(i),Y(diffs[i]));
    ctx.lineTo(X(n-1),Y(0));ctx.lineTo(X(0),Y(0));ctx.closePath();
  }
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,Y(0));ctx.clip();
  areaPath();ctx.fillStyle=hexA(hcol,.28);ctx.fill();ctx.restore();
  ctx.save();ctx.beginPath();ctx.rect(0,Y(0),W,H-Y(0));ctx.clip();
  areaPath();ctx.fillStyle=hexA(acol,.28);ctx.fill();ctx.restore();
  ctx.beginPath();ctx.moveTo(X(0),Y(diffs[0]));
  for(let i=1;i<n;i++)ctx.lineTo(X(i),Y(diffs[i]));
  ctx.strokeStyle='#1b1913';ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();
  // rewind: dim future + marker
  if(vi<n-1){
    ctx.fillStyle='rgba(244,239,226,.62)';
    ctx.fillRect(X(vi),padT,W-padR-X(vi),H-padT-padB);
    ctx.strokeStyle='#c2401f';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);
    ctx.beginPath();ctx.moveTo(X(vi),padT);ctx.lineTo(X(vi),H-padB);ctx.stroke();ctx.setLineDash([]);
  }
  ctx.beginPath();ctx.arc(X(vi),Y(diffs[vi]),4,0,7);ctx.fillStyle='#c2401f';ctx.fill();
  // margin at viewed moment
  const cur=diffs[vi];
  tickNum($('diffBig'),cur,v=>{const r=Math.round(v);return r===0?'TIED':(r>0?'+':'')+r;});
  $('diffLbl').textContent=cur===0?'dead even':(cur>0?habbr+' by '+cur:aabbr+' by '+Math.abs(cur));
  // quarter bars
  const qs={};
  plays.forEach(p=>{qs[p.period.number]={a:+p.awayScore,h:+p.homeScore};});
  let pa=0,ph=0;const bars=[];
  Object.keys(qs).sort((a,b)=>a-b).forEach(q=>{
    bars.push({q:q,a:qs[q].a-pa,h:qs[q].h-ph});pa=qs[q].a;ph=qs[q].h;
  });
  const mxq=Math.max(1,...bars.flatMap(b=>[b.a,b.h]));
  $('qbars').innerHTML=bars.map(b=>
    `<div class="qbar"><div class="qbwrap">`+
    `<div class="qb" title="${aabbr} Q${b.q}: ${b.a}" style="height:${Math.max(3,Math.round(b.a/mxq*60))}px;background:${hexA(acol,.85)}"></div>`+
    `<div class="qb" title="${habbr} Q${b.q}: ${b.h}" style="height:${Math.max(3,Math.round(b.h/mxq*60))}px;background:${hexA(hcol,.85)}"></div>`+
    `</div><div class="qv num">${b.a}–${b.h}</div><div class="ql">Q${b.q}</div></div>`
  ).join('');
}

let shotTeam='H';
function renderPlays(d,idx){
  const all=(d.plays||[]).slice(0,Math.max(0,idx+1));
  const maxId=all.reduce((m,p)=>Math.max(m,+p.id||0),0);
  const plays=all.slice().reverse().slice(0,14);
  const ul=$('plays');ul.innerHTML='';
  plays.forEach(p=>{
    const li=document.createElement('li');
    if(p.scoringPlay)li.className='score';
    if(TL.live&&maxId&&+p.id>(+window._lastPlayId||0))li.className+=(li.className?' ':'')+'fresh';
    const clk=(p.period?p.period.number+'Q ':'')+(p.clock?p.clock.displayValue:'');
    li.innerHTML=`<span class="pc">${clk}</span><span>${p.scoringPlay?'<b>'+esc(p.text)+'</b>':esc(p.text)}</span><span class="sc">${p.awayScore}–${p.homeScore}</span>`;
    ul.appendChild(li);
  });
  if(maxId)window._lastPlayId=maxId;
}

function renderLeaders(d,g,idx){
  const bp=d.boxscore&&d.boxscore.players;
  if(!bp)return;
  const fire=JAM?fireNow(d,idx===undefined?(d.plays||[]).length-1:idx):null;
  const mk=side=>{
    const t=bp.find(x=>x.team.abbreviation===(side==='h'?(g?g.h.abbr:''):(g?g.a.abbr:'')));
    const el=side==='h'?$('leadH'):$('leadA');
    if(!t||!t.statistics||!t.statistics[0]){el.innerHTML='';return;}
    const athletes=(t.statistics[0].athletes||[]).slice().sort((a,b)=>(+b.stats[1]||0)-(+a.stats[1]||0)).slice(0,3);
    // stats order: MIN,PTS,FG,3PT,FT,REB,AST,TO,STL,BLK,OREB,DREB,PF,+/-
    el.innerHTML=`<h3>${t.team.abbreviation}</h3>`+athletes.map(a=>{
      const s=a.stats;
      const hot=fire&&fire.name===a.athlete.displayName?' 🔥':'';
      return `<div class="pl"><span>${esc(a.athlete.displayName)}${hot}</span><span>${s[1]} PTS · ${s[5]} REB · ${s[6]} AST</span></div>`;
    }).join('');
  };
  mk('a');mk('h');
}





function renderShotChart(d,g,idx){
  const svg=$('shotSvg');if(!svg)return;
  const plays=d.plays||[];
  const habbr=g?g.h.abbr:'HOME',aabbr=g?g.a.abbr:'AWAY';
  const hcol=g?g.h.color:'#1b1913',acol=g?g.a.color:'#5b5545';
  // toggle labels
  const btns=document.querySelectorAll('#shotToggle button');
  btns.forEach(b=>{
    const t=b.dataset.t;
    b.textContent=t==='A'?aabbr:(t==='H'?habbr:'BOTH');
    if(!b.onclick)b.onclick=()=>{
      shotTeam=t;
      btns.forEach(x=>x.classList.toggle('picked',x===b));
      if(window._lastD)renderShotChart(window._lastD,window._lastG,TL.live?TL.n-1:TL.view);
    };
  });
  // name -> team
  const tmap={};
  (d.boxscore&&d.boxscore.players||[]).forEach(side=>{
    (side.statistics[0].athletes||[]).forEach(a=>{tmap[a.athlete.displayName]=side.team.abbreviation;});
  });
  const teamOf=text=>{
    if(!text)return null;
    for(const nm in tmap)if(text.indexOf(nm)===0)return tmap[nm];
    return null;
  };
  const shots=[];
  plays.forEach((p,pi)=>{
    if(!(p.shootingPlay&&p.coordinate&&Math.abs(p.coordinate.x)<=55&&p.coordinate.y>=-6&&p.coordinate.y<=80))return;
    if(pi>idx)return;
    shots.push({x:p.coordinate.x,y:p.coordinate.y,make:!!p.scoringPlay,t:teamOf(p.text||'')});
  });
  const show=shotTeam==='B'?shots:shots.filter(s=>s.t===(shotTeam==='H'?habbr:aabbr));
  const INK='#1b1913';
  let s=`<rect x="0.5" y="0.5" width="49" height="47" fill="none" stroke="${INK}" stroke-width="0.7"/>`;
  s+=`<rect x="17" y="0" width="16" height="19" fill="rgba(27,25,19,.045)" stroke="${INK}" stroke-width="0.5"/>`;
  s+=`<circle cx="25" cy="19" r="6" fill="none" stroke="${INK}" stroke-width="0.5" stroke-dasharray="1.6,1.3"/>`;
  s+=`<circle cx="25" cy="5.25" r="0.9" fill="none" stroke="${INK}" stroke-width="0.5"/>`;
  s+=`<line x1="22" y1="4" x2="28" y2="4" stroke="${INK}" stroke-width="0.7"/>`;
  s+=`<path d="M3,14 A23.75,23.75 0 0 1 47,14" fill="none" stroke="${INK}" stroke-width="0.6"/>`;
  s+=`<line x1="3" y1="0" x2="3" y2="14" stroke="${INK}" stroke-width="0.6"/>`;
  s+=`<line x1="47" y1="0" x2="47" y2="14" stroke="${INK}" stroke-width="0.6"/>`;
  s+=`<path d="M21,5.25 A4,4 0 0 1 29,5.25" fill="none" stroke="${INK}" stroke-width="0.4" stroke-dasharray="1,1"/>`;
  s+=`<line x1="0.5" y1="47" x2="49.5" y2="47" stroke="${INK}" stroke-width="0.7"/>`;
  s+=`<text x="25" y="52.5" text-anchor="middle" font-size="2.6" font-family="ui-monospace,monospace" fill="#5b5545">HALF COURT · MAKES ● / MISSES ○</text>`;
  show.forEach((sh,i)=>{
    const col=sh.t===habbr?hcol:(sh.t===aabbr?acol:'#8a8574');
    const dl=Math.min(i*7,1400);
    if(sh.make)s+=`<circle cx="${sh.x.toFixed(1)}" cy="${sh.y.toFixed(1)}" r="1.2" fill="${col}" style="animation:pop .35s ${dl}ms both"/>`;
    else s+=`<circle cx="${sh.x.toFixed(1)}" cy="${sh.y.toFixed(1)}" r="1.2" fill="none" stroke="${col}" stroke-width="0.55" style="animation:pop .35s ${dl}ms both"/>`;
  });
  svg.innerHTML=s;
  // zone FG%
  const zone={rim:[0,0],mid:[0,0],three:[0,0]};
  show.forEach(sh=>{
    const dd=Math.hypot(sh.x-25,sh.y-5.25);
    const z=(dd>23.75||(sh.y<14&&(sh.x<3.5||sh.x>46.5)))?'three':(dd<=8?'rim':'mid');
    zone[z][1]++;if(sh.make)zone[z][0]++;
  });
  const zh=(k,l)=>{const m=zone[k][0],a=zone[k][1],pc=a?Math.round(m/a*100):0;
    return `<div class="zone"><div class="zl">${l}</div><div class="zv num">${a?pc+'%':'–'}</div><div class="zs num">${m}/${a}</div></div>`;};
  $('zoneStats').innerHTML=zh('rim','RIM')+zh('mid','MIDRANGE')+zh('three','THREE');
}

let GHOST_DB=null;

// ---- Ghost matching: live line -> nearest historic game ----
let GV=null;
function ghostInit(){
  if(GV||!GHOST_DB)return;
  const g=GHOST_DB.g;
  let m=0;for(let i=0;i<g.length;i++)m+=g[i][14];m/=g.length;
  let v=0;for(let i=0;i<g.length;i++)v+=(g[i][14]-m)*(g[i][14]-m);v=Math.sqrt(v/g.length)||1;
  const vecs=new Array(g.length);
  for(let i=0;i<g.length;i++){
    const r=g[i],mp=r[4]||1;
    const raw=[r[5]/mp*36,r[6]/mp*36,r[7]/mp*36,r[8]/mp*36,r[9]/mp*36,r[10]/mp*36,r[11]/mp*36];
    vecs[i]=raw.map((x,j)=>(x-GHOST_DB.means[j])/GHOST_DB.stds[j]);
  }
  GV={vecs:vecs,mgs:m,sgs:v};
}
function ghostFor(mp,pts,reb,ast,stl,blk,tov,fga){
  const raw=[pts/mp*36,reb/mp*36,ast/mp*36,stl/mp*36,blk/mp*36,tov/mp*36,fga/mp*36];
  const vv=raw.map((x,j)=>(x-GHOST_DB.means[j])/GHOST_DB.stds[j]);
  const G=GHOST_DB.g;
  let bi=-1,bb=1e9;
  for(let i=0;i<G.length;i++){
    const w=GV.vecs[i];
    let d2=0;
    for(let j=0;j<7;j++){const dd=vv[j]-w[j];d2+=dd*dd;}
    const blend=Math.sqrt(d2)-0.25*((G[i][14]-GV.mgs)/GV.sgs);
    if(blend<bb){bb=blend;bi=i;}
  }
  const r=G[bi];
  return {name:GHOST_DB.names[r[0]],date:r[1],team:GHOST_DB.teams[r[2]],opp:GHOST_DB.teams[r[3]],
    gmp:r[4],gpts:r[5],greb:r[6],gast:r[7],blend:bb,
    gp36:r[5]/(r[4]||1)*36};
}
function fmtDate(iso){
  const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const p=iso.split('-');return M[+p[1]-1]+' '+(+p[2])+', '+p[0];
}
function renderGhosts(d){
  const el=$('ghosts');if(!el)return;
  ghostInit();
  window._ghostPasses=[];
  if(!GV){el.innerHTML='<span style="font-size:12px;color:#6b675c">'+(GHOST_DB?'Ghost library failed to load.':'Loading ghost library&hellip;')+'</span>';return;}
  const bp=d.boxscore&&d.boxscore.players;
  if(!bp){el.innerHTML='';return;}
  let html='';
  bp.forEach(side=>{
    const aths=(side.statistics[0].athletes||[]).map(a=>{
      const s=a.stats;
      if(!s||s.length<14)return null;
      const mstr=s[0];
      const mp=mstr.indexOf(':')>=0?(+mstr.split(':')[0])+(+mstr.split(':')[1])/60:+mstr||0;
      if(!(mp>=10))return null;
      const fga=(String(s[2]).indexOf('-')>=0)?+String(s[2]).split('-')[1]:0;
      return {nm:a.athlete.displayName,mp:mp,pts:+s[1]||0,reb:+s[5]||0,ast:+s[6]||0,
        tov:+s[7]||0,stl:+s[8]||0,blk:+s[9]||0,fga:fga};
    }).filter(Boolean).sort((a,b)=>b.pts-a.pts).slice(0,2);
    aths.forEach(p=>{
      const gh=ghostFor(p.mp,p.pts,p.reb,p.ast,p.stl,p.blk,p.tov,p.fga);
      const lp36=p.pts/p.mp*36, delta=lp36-gh.gp36;
      const tier=gh.blend<0.9?'strong match':(gh.blend<1.4?'decent match':'faint match');
      const dCls=delta>=0?'up':'dn', dTxt=(delta>=0?'+':'')+delta.toFixed(1)+' pts/36';
      const mx=Math.max(lp36,gh.gp36,1);
      const lw=Math.round(lp36/mx*100), gw=Math.round(gh.gp36/mx*100);
      const last1=s=>esc(s.split(' ').slice(-1)[0]);
      html+=`<div class="ghost">
        <div class="g-top"><b>${esc(p.nm)}</b> <span class="live">${p.pts}p ${p.reb}r ${p.ast}a · ${Math.round(p.mp)} min</span></div>
        <div class="g-mid">is channeling <b>${esc(gh.name)}</b> <span class="when">${fmtDate(gh.date)} · ${gh.team} vs ${gh.opp} — ${gh.gpts}p ${gh.greb}r ${gh.gast}a</span></div>
        <div class="race">
          <div class="rrow"><span class="who">${last1(p.nm)}</span><div class="bar"><div class="fill" style="width:${lw}%;background:#1c1a15"></div></div><span class="val">${lp36.toFixed(1)}/36</span></div>
          <div class="rrow"><span class="who">👻 ${last1(gh.name)}</span><div class="bar"><div class="fill" style="width:${gw}%;background:#c8401f"></div></div><span class="val">${gh.gp36.toFixed(1)}/36</span></div>
        </div>
        <div class="g-pace">pace: <b class="${dCls}">${dTxt}</b> vs ghost<span class="tier">${tier}</span></div>
      </div>`;
      if(delta>=2)window._ghostPasses.push({seq:1e9,clk:'now',
        text:`<b>🔥 ${esc(p.nm)} blew past ${esc(gh.name)}'s ghost pace</b>`});
    });
  });
  el.innerHTML=html||'<span style="font-size:12px;color:#6b675c">Not enough minutes yet for ghost matches.</span>';
}

let FORM_DB=null;

// ---- Milestone watch ----
function renderMiles(d){
  const el=$('miles');if(!el)return;
  if(!FORM_DB){el.innerHTML='';return;}
  const bp=d.boxscore&&d.boxscore.players;
  if(!bp){el.innerHTML='<span style="font-size:12px;color:#6b675c">Waiting for tip…</span>';return;}
  const rows=[];
  bp.forEach(side=>{(side.statistics[0].athletes||[]).forEach(a=>{
    const s=a.stats;if(!s||s.length<14)return;
    const nm=a.athlete.displayName,hi=FORM_DB.highs[nm];if(!hi)return;
    const mstr=s[0],mp=mstr.indexOf(':')>=0?(+mstr.split(':')[0])+(+mstr.split(':')[1])/60:+mstr||0;
    if(!(mp>=8))return;
    rows.push({nm:nm,mp:mp,p:+s[1]||0,r:+s[5]||0,a:+s[6]||0,hi:hi});
  });});
  rows.sort((x,y)=>y.p-x.p);
  let html='';
  rows.slice(0,6).forEach(x=>{
    const bits=[];
    if(x.p>x.hi.p)bits.push(`<b>new best since '23!</b> (previous ${x.hi.p})`);
    else if(x.hi.p-x.p<=12&&x.hi.p-x.p>0)bits.push(`<b>${x.hi.p-x.p} off</b> his best scoring night (${x.hi.p})`);
    if(x.hi.r-x.r<=6&&x.hi.r-x.r>0&&x.r>=6)bits.push(`${x.hi.r-x.r} off rebound best (${x.hi.r})`);
    if(x.hi.a-x.a<=5&&x.hi.a-x.a>0&&x.a>=5)bits.push(`${x.hi.a-x.a} off assist best (${x.hi.a})`);
    const c3=[x.p>=7,x.r>=7,x.a>=7].filter(Boolean).length;
    const n3=[x.p>=5,x.r>=5,x.a>=5].filter(Boolean).length;
    if(c3>=3)bits.push(`<b>triple-double watch 👀</b> (${x.p}p ${x.r}r ${x.a}a)`);
    else if(c3===2&&n3>=3)bits.push(`triple-double brewing (${x.p}p ${x.r}r ${x.a}a)`);
    if(bits.length)html+=`<div class="mile"><div class="mline"><b>${esc(x.nm)}</b> — ${x.p}p ${x.r}r ${x.a}a</div><div class="msub">${bits.join(' · ')}</div></div>`;
  });
  el.innerHTML=html||'<span style="font-size:12px;color:#6b675c">No milestones brewing yet.</span>';
}

// ---- Live moments timeline ----
/* NBA Jam layer — HEATING UP / ON FIRE from consecutive makes, FROM DOWNTOWN
 * from deep threes, BOOMSHAKALAKA from dunks. All DVR-aware: scrub back and
 * the fire goes out. Toggle with the JAM button (persisted). */
let JAM = true;
try { JAM = localStorage.getItem('vh_jam') !== 'off'; } catch (e) {}
function idNameMap(d) {
  const m = {};
  ((d.boxscore && d.boxscore.players) || []).forEach(t => {
    const ath = (((t.statistics || [])[0] || {}).athletes) || [];
    ath.forEach(a => { m[a.athlete.id] = a.athlete.displayName; });
  });
  return m;
}
function isFG(p) {
  const t = (p.type && p.type.text) || '';
  return !!p.shootingPlay && !/free throw/i.test(t);
}
function shotDist(p) {
  if (!p.coordinate) return 0;
  const dx = p.coordinate.x - 25, dy = p.coordinate.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function jamEvents(d, idx) {
  const idm = idNameMap(d), plays = d.plays || [], out = [], consec = {};
  const clkOf = p => 'Q' + (p.period ? p.period.number : '?') + ' ' + (p.clock ? p.clock.displayValue : '');
  for (let i = 0; i <= idx && i < plays.length; i++) {
    const p = plays[i];
    if (!isFG(p)) continue;
    const aid = p.participants && p.participants[0] && p.participants[0].athlete && p.participants[0].athlete.id;
    if (!aid) continue;
    const nm = idm[aid] || 'Unknown';
    const txt = p.text || '';
    if (p.scoringPlay) {
      consec[aid] = (consec[aid] || 0) + 1;
      const c = consec[aid];
      if (c === 2) out.push({ seq: i, clk: clkOf(p), text: '<b>' + esc(nm) + ' is HEATING UP…</b> (' + c + ' straight makes)' });
      else if (c === 3) out.push({ seq: i, clk: clkOf(p), text: '<b>🔥 HE\u2019S ON FIRE — ' + esc(nm) + '</b> (' + c + ' straight makes)' });
      else if (c > 3) out.push({ seq: i, clk: clkOf(p), text: '<b>🔥 ' + esc(nm) + ' is still on fire</b> (' + c + ' straight)' });
      if (/three[ -]?point|3-pt/i.test(txt) && shotDist(p) >= 30)
        out.push({ seq: i, clk: clkOf(p), text: '<b>🏙️ FROM DOWNTOWN — ' + esc(nm) + '</b> (' + Math.round(shotDist(p)) + '-footer)' });
      if (/dunk/i.test(txt))
        out.push({ seq: i, clk: clkOf(p), text: '<b>💥 BOOMSHAKALAKA</b> — ' + esc(txt) });
    } else {
      if (consec[aid] >= 3) out.push({ seq: i, clk: clkOf(p), text: '<b>🧊 ' + esc(nm) + ' cools off</b>' });
      consec[aid] = 0;
    }
  }
  return out;
}
function fireNow(d, idx) {
  const idm = idNameMap(d), plays = d.plays || [], consec = {};
  for (let i = 0; i <= idx && i < plays.length; i++) {
    const p = plays[i];
    if (!isFG(p)) continue;
    const aid = p.participants && p.participants[0] && p.participants[0].athlete && p.participants[0].athlete.id;
    if (!aid) continue;
    consec[aid] = p.scoringPlay ? (consec[aid] || 0) + 1 : 0;
  }
  let best = null;
  Object.keys(consec).forEach(id => {
    if (consec[id] >= 3 && (!best || consec[id] > best.makes)) best = { name: idm[id], makes: consec[id] };
  });
  return best;
}
function renderMoments(d,g,idx){
  const el=$('moments');if(!el)return;
  const plays=d.plays||[],wp=d.winprobability||[];
  if(!plays.length){el.innerHTML='<span style="font-size:12px;color:#6b675c">Waiting for tip…</span>';return;}
  const moms=[];
  const clkOf=p=>'Q'+(p.period?p.period.number:'?')+' '+(p.clock?p.clock.displayValue:'');
  const habbr=g?g.h.abbr:'HOME',aabbr=g?g.a.abbr:'AWAY';
  // lead changes
  let leader=null,prevA=0,prevH=0;
  plays.forEach((p,i)=>{
    if(!p.scoringPlay)return;
    const a=+p.awayScore,h=+p.homeScore;
    if(a===prevA&&h===prevH)return;
    const L=a>h?'A':(h>a?'H':null);
    if(L&&leader&&L!==leader&&a>2&&h>2)
      moms.push({seq:i,clk:clkOf(p),text:`<b>Lead change</b> — ${L==='H'?habbr:aabbr} takes it`});
    if(L)leader=L;prevA=a;prevH=h;
  });
  // win-prob swings ≥18% inside a 12-play window
  const byId={};wp.forEach(w=>{byId[w.playId]=w.homeWinPercentage;});
  const wpts=plays.map((p,i)=>({i:i,v:byId[p.id]})).filter(x=>x.v!==undefined);
  let skip=-1;
  for(let k=0;k+12<wpts.length;k++){
    if(k<skip)continue;
    const sw=wpts[k+12].v-wpts[k].v;
    if(Math.abs(sw)>=0.18){
      const from=Math.round(wpts[k].v*100),to=Math.round(wpts[k+12].v*100);
      const who=to>from?habbr:aabbr;
      moms.push({seq:wpts[k+12].i,clk:clkOf(plays[wpts[k+12].i]),
        text:`<b>😱 ${Math.abs(Math.round(sw*100))}pt swing</b> — ${who} ${from}% → ${to}%`});
      skip=k+12;
    }
  }
  // big runs ≥10 (unanswered)
  let cA=0,cH=0,rt=null,rn=0;
  plays.forEach((p,i)=>{
    if(!p.scoringPlay)return;
    const a=+p.awayScore,h=+p.homeScore;
    let sc=null,pts=0;
    if(a>cA&&h===cH){sc='A';pts=a-cA;}else if(h>cH&&a===cA){sc='H';pts=h-cH;}
    if(sc){if(sc===rt)rn+=pts;else{if(rn>=10&&rt)moms.push({seq:i,clk:clkOf(p),text:`<b>🔥 ${rt==='H'?habbr:aabbr} ${rn}-0 run</b>`});rt=sc;rn=pts;}}
    cA=a;cH=h;
  });
  if(rn>=10&&rt)moms.push({seq:plays.length-1,clk:clkOf(plays[plays.length-1]),text:`<b>🔥 ${rt==='H'?habbr:aabbr} ${rn}-0 run</b>`});
  // ghost passes (rebuilt each refresh)
  (window._ghostPasses||[]).forEach(m=>moms.push(m));
  // NBA Jam callouts
  if (JAM) jamEvents(d, idx).forEach(m => moms.push(m));
  const vmoms=moms.filter(m=>m.seq<=idx);
  vmoms.sort((a,b)=>b.seq-a.seq);
  window._seenMom=window._seenMom||new Set();
  if(window._seenMom.size>400){const _a=[...window._seenMom].slice(-200);window._seenMom=new Set(_a);}
  el.innerHTML=vmoms.slice(0,8).map(m=>{
    const k=m.clk+'|'+m.text.replace(/<[^>]*>/g,'');
    const fresh=!window._seenMom.has(k);
    window._seenMom.add(k);
    return `<div class="ms-item${fresh?' fresh':''}"><span class="mc">${m.clk}</span><span class="mt">${m.text}</span></div>`;
  }).join('')||'<span style="font-size:12px;color:#6b675c">Waiting for the first big moment…</span>';
}

$('refreshBtn').onclick=loadGame;
$('dayPrev').onclick=()=>gotoDay(-1);
$('dayNext').onclick=()=>gotoDay(1);
$('dayToday').onclick=()=>{sbExplicit=true;resetView();loadGames(null);};
renderDayNav();
loadGames();
fetch('assets/ghost_db.json?v=9a8f1588').then(r=>r.json()).then(d=>{GHOST_DB=d;GV=null;if(window._lastD)renderGhosts(window._lastD);}).catch(()=>{});
fetch('assets/player_form.json?v=41a74427').then(r=>r.json()).then(d=>{FORM_DB=d;if(window._lastD)renderMiles(window._lastD);}).catch(()=>{});
function setMode(m){
  // The arcade tab was retired in Wave 5 (games live on Play); the companion
  // is the only mode now. Kept as a no-op-safe shim for any saved links.
  $('companion').hidden=false;
  $('tabCompanion').classList.add('picked');
}
$('tabCompanion').onclick=()=>setMode('companion');
window.CourtsideMode=setMode;
(function(){
  const b=document.getElementById('more-plates-btn'), w=document.getElementById('more-plates');
  if(!b||!w) return;
  b.onclick=()=>{
    const open=w.hidden;
    w.hidden=!open;
    foldOpen=open;
    b.setAttribute('aria-expanded', open?'true':'false');
    b.textContent=open?'FEWER PLATES':'MORE PLATES — momentum · atlas twins · shot chart · milestones · leaders · play by play';
    if(open&&window._lastD){
      // First paint of the folded plates: full render + atlas sync at the
      // real (now-visible) widths, then let live-atlas refit its canvas.
      renderAll(window._lastD,window._lastG);
      syncAtlas(window._lastD,window._lastG);
      window.dispatchEvent(new Event('resize'));
    }
  };
})();
(function(){
  const b=document.getElementById('tabJam');if(!b)return;
  const paint=()=>b.classList.toggle('picked',JAM);
  paint();
  b.onclick=()=>{
    JAM=!JAM;
    try{localStorage.setItem('vh_jam',JAM?'on':'off');}catch(e){}
    paint();
    if(window._lastD)renderAll(window._lastD,window._lastG);
  };
})();


