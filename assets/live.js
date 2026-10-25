
const SB='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const SUM=id=>`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`;
let games=[], cur=null, timer=null, lastUpd=null;
// ---- Respectful polling: 30s while a game is live, 5m when idle,
// exponential backoff on consecutive failures (30s -> 60s -> 120s -> 300s cap).
// Never hammer ESPN: at most one in-flight request, no retries on 429.
let pollTimer=null, failStreak=0, lastOkAt=null;
const POLL_LIVE=30000, POLL_IDLE=300000, POLL_MAX=300000;
function pollDelayMs(){
  if(failStreak>0) return Math.min(POLL_MAX, POLL_LIVE*Math.pow(2,Math.min(failStreak,3)));
  return games.some(g=>g.state==='in')?POLL_LIVE:POLL_IDLE;
}
function schedulePoll(){
  clearTimeout(pollTimer);
  const g=cur?games.find(x=>x.id===String(cur))||games.find(x=>x.id===cur):null;
  if(g&&g.state==='post')return; // final: no polling, no live chrome (C2.6)
  pollTimer=setTimeout(loadGame,pollDelayMs());
}

// ---- Day navigation (ESPN days run on America/New_York) ----
let sbDay=null, sbExplicit=false; // sbDay: 'YYYYMMDD' being viewed; null = today
function etToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/-/g,'');}
function shiftDay(yyyymmdd,n){const t=new Date(Date.UTC(+yyyymmdd.slice(0,4),+yyyymmdd.slice(4,6)-1,+yyyymmdd.slice(6,8))+n*864e5);return String(t.getUTCFullYear())+String(t.getUTCMonth()+1).padStart(2,'0')+String(t.getUTCDate()).padStart(2,'0');}
function dayLabel(yyyymmdd){const t=new Date(Date.UTC(+yyyymmdd.slice(0,4),+yyyymmdd.slice(4,6)-1,+yyyymmdd.slice(6,8)));const s=t.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});return (yyyymmdd===etToday()?'Today — ':'')+s;}
function renderDayNav(){const cur2=sbDay||etToday();const lbl=$('dayLbl');if(lbl)lbl.textContent=dayLabel(cur2);const b=$('dayToday');if(b)b.hidden=cur2===etToday();}
function resetView(){cur=null;clearInterval(timer);const m=$('main');if(m)m.hidden=false;const og=$('offgame');if(og)og.hidden=true;const ln=$('live-loading');if(ln)ln.hidden=false;}
function gotoDay(n){sbExplicit=true;resetView();loadGames(shiftDay(sbDay||etToday(),n));}

const $=id=>document.getElementById(id);
const LROOT=()=>document.querySelector('.live-root');
function showErr(m){const e=$('err');e.hidden=false;e.textContent=m;}
function hideErr(){$('err').hidden=true;}

/* Wave 2.4: chart inks are the page's tokens, read when a chart draws, so the
   charts follow light/dark with the rest of the page. */
function tok(name,fb){try{const v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();return v||fb||'';}catch(e){return fb||'';}}
function chartFont(){return '11px '+tok('--font-code');}
/* Team colours from the summary's own boxscore.teams (ESPN), keyed by team id.
   assets/scoreboard.js gives the away team the home colour (its documented quirk),
   so the scoreboard row is not used for colour. '' when ESPN sends none. */
function teamColors(d){
  const out={a:'',h:''};
  try{
    const byId={};((d.boxscore&&d.boxscore.teams)||[]).forEach(t=>{if(t.team&&t.team.id&&/^[0-9a-f]{6}$/i.test(String(t.team.color||'')))byId[String(t.team.id)]='#'+t.team.color;});
    d.header.competitions[0].competitors.forEach(c=>{const k=c.homeAway==='home'?'h':'a';out[k]=byId[String(c.team&&c.team.id)]||'';});
  }catch(e){}
  return out;
}
/* gamePhase:begin (tests/live_phase.test.mjs evaluates this block)
   ESPN marks postponed, cancelled and suspended games state 'post' too: a final is
   'post' AND completed AND not one of those. Anything else 'post' is 'off', shown
   with ESPN's own description and neutral copy. */
function gamePhase(t){
  t=t||{};
  const st=t.state||'',nm=String(t.name||'').toUpperCase();
  if(st!=='post')return {phase:st,label:''};
  if(t.completed===true&&!/POSTPONED|CANCELED|CANCELLED|SUSPENDED/.test(nm))return {phase:'post',label:'Final'};
  return {phase:'off',label:String(t.description||t.shortDetail||'Not played')};
}
/* gamePhase:end */
function phaseOf(d){try{return gamePhase(d.header.competitions[0].status.type);}catch(e){return {phase:'',label:''};}}
async function jget(u){const r=await fetch(u);if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}

/* C2.1: estimated final-whistle ms for the 24h guard. Callers only ever know
   tip time, so final ~= tip + 2.5h; GameRoute's estimation margin absorbs it. */
function estFinalMs(g){
  if(!g||!g.date)return null;
  const t=Date.parse(g.date);
  return isNaN(t)?null:t+2.5*3600e3;
}
/* Resolve a ?game= id to {state, gameTimeMs, game} — from the day's board if
   present, else one summary fetch (shared links never rot). */
async function resolveGameInfo(id){
  const g=games.find(x=>String(x.id)===String(id));
  if(g)return{state:g.state,gameTimeMs:estFinalMs(g),game:g};
  try{
    const d=await jget(SUM(id));
    const h=d.header.competitions[0],ts=h.competitors;
    const hm=ts.find(t=>t.homeAway==='home'),am=ts.find(t=>t.homeAway==='away');
    const gg={id:String(id),date:h.date,state:h.status.type.state,detail:h.status.type.shortDetail,
      h:{abbr:hm.team.abbreviation,name:hm.team.displayName,score:hm.score,color:hm.team.color?'#'+hm.team.color:'',rec:''},
      a:{abbr:am.team.abbreviation,name:am.team.displayName,score:am.score,color:am.team.color?'#'+am.team.color:'',rec:''}};
    return{state:gg.state,gameTimeMs:estFinalMs(gg),game:gg};
  }catch(e){return null;}
}
async function loadGames(day){
  sbDay=day||null;
  renderDayNav();
  try{
    const d=await jget(sbDay?SB+'?dates='+sbDay:SB);
    games=window.Scoreboard?window.Scoreboard.parseEvents(d):(d.events||[]).map(e=>{
      const c=e.competitions[0],ts=c.competitors;
      const h=ts.find(t=>t.homeAway==='home'),a=ts.find(t=>t.homeAway==='away');
      return {id:e.id,date:e.date,state:e.status.type.state,detail:e.status.type.shortDetail,
        clock:c.status.displayClock,period:c.status.period,
        h:{abbr:h.team.abbreviation,name:h.team.displayName,score:h.score,color:h.team.color?'#'+h.team.color:'',rec:h.records&&h.records[0]?h.records[0].summary:''},
        a:{abbr:a.team.abbreviation,name:a.team.displayName,score:a.score,color:a.team.color?'#'+a.team.color:'',rec:a.records&&a.records[0]?a.records[0].summary:''}};
    });
    renderGames();
    // ?game= deep link (a shared moment) wins; otherwise only auto-select a
    // LIVE game. No live game -> the off-day shell: schedule strip, one
    // last-game replay entry, day arrows. Plate init is skipped entirely.
    // (The old opening-night opener special-case is retired: ?game= covers it.)
    let qg=null;
    try{ qg=new URLSearchParams(location.search).get('game'); }catch(e){}
    // C2.1: the 24h guard — a ?game= older than 24h belongs on /replay.
    // A redirect stops here; otherwise the game renders even off-board.
    if(qg&&window.GameRoute){
      const info=await resolveGameInfo(qg);
      if(info&&window.GameRoute.guard('live',()=>({state:info.state,gameTimeMs:info.gameTimeMs})))return;
      if(info&&info.game&&!games.find(x=>String(x.id)===String(qg))){games.unshift(info.game);renderGames();}
    }
    if(window.GameRoute)window.GameRoute.notice('routeNotice');
    const qmatch=qg?games.find(x=>String(x.id)===String(qg)):null;
    const live=games.find(g=>g.state==='in');
    if(qmatch) selectGame(qmatch.id);
    else if(live) selectGame(live.id);
    else offGame();
  }catch(e){showErr('Could not load scoreboard: '+e.message);showFeedCard('Could not load scoreboard: '+e.message);}
}

/* C2.6/T2.4: graduation marking — a recent final shows when it moves to Replay. */
function finalLabel(g){
  const ms=estFinalMs(g);
  if(ms==null)return 'Final';
  const hrs=(ms-Date.now())/3600e3;
  if(hrs<=0)return 'Final';
  return 'Final · moves to Replay in '+Math.max(1,Math.round(hrs))+'h';
}
function renderGames(){
  const el=$('games');el.innerHTML='';
  games.forEach(g=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='gbtn'+(g.state==='in'?' live':'');
    b.setAttribute('aria-pressed',cur===g.id?'true':'false');
    const line=(cls,txt)=>{const s=document.createElement('span');s.className=cls;s.textContent=txt;b.appendChild(s);};
    line('ms',g.a.abbr+' @ '+g.h.abbr);
    if(g.state!=='pre')line('sc',g.a.score+' \u2013 '+g.h.score);
    line('st',g.state==='in'?'\u25cf LIVE \u2014 '+g.detail:(g.state==='post'&&/^final/i.test(g.detail||''))?finalLabel(g):g.detail);
    b.onclick=()=>selectGame(g.id);
    el.appendChild(b);
  });
  if(!games.length){const p=document.createElement('p');p.className='caption';p.textContent='No NBA games \u2014 '+dayLabel(sbDay||etToday())+'.';el.appendChild(p);}
  el.classList.toggle('one',games.length===1); // one game: the board above already is its scoreboard
}

// ---- Timeline scrubber state ----
const TL={n:0,view:-1,live:true,gameId:null,newCount:0};
// ---- Tabs (game-center redesign): the plates live in four tab panels.
// A panel's plates paint only while its tab is active (the old band fold's
// perf contract, carried over): opening a tab replays the full render at
// real widths, so canvas charts are never painted into a hidden panel.
function panelOpen(panel){const p=$('panel-'+panel);return !!(p&&!p.hidden);}
function renderTab(tab){
  const d=window._lastD,g=window._lastG;
  if(!d)return;
  const idx=TL.live?TL.n-1:TL.view;
  if(tab==='summary'){renderWP(d,g,idx);renderMomentum(d,g,idx);renderShotChart(d,g,idx);renderGcSummary(d,g,idx);}
  else if(tab==='plays'){renderMoments(d,g,idx);renderRuns(d,g,idx);renderMiles(d);renderGcFeed(d,idx);}
  else if(tab==='boxscore'){renderLeaders(d,g,idx);renderGcBox(d);}
  else if(tab==='insights'){renderGhosts(d);renderArche(d,g);syncAtlas(d,g);}
  try{window.dispatchEvent(new Event('resize'));}catch(e){}
}
function resetTabs(){try{window.dispatchEvent(new CustomEvent('gamecenter:tab',{detail:{tab:'summary'}}));}catch(e){}}
// G2/T2.3: no live game -> schedule strip + last-game replay + day arrows.
// The 13 plates never render; ESPN fetch-driven init is skipped.
function offGame(){
  cur=null;clearInterval(timer);clearTimeout(pollTimer);
  const m=$('main');if(m)m.hidden=true;
  const ln=$('live-loading');if(ln)ln.hidden=true;
  setPhase('');
  const og=$('offgame');
  if(og){
    og.hidden=false;
    const finals=games.filter(x=>x.state==='post'&&/^final/i.test(x.detail||''));
    const last=finals.length?finals[finals.length-1]:null;
    const a=$('offgame-replay');
    if(a){
      if(last){a.href='/replay?game='+encodeURIComponent(last.id);a.textContent='Rewatch '+last.a.abbr+' @ '+last.h.abbr+' ('+last.a.score+'\u2013'+last.h.score+') in Pixel Replay \u2192';}
      else{a.href='/replay';a.textContent='Rewatch a game in Pixel Replay \u2192';}
    }
    const meta=$('offgame-meta');
    if(meta)meta.textContent=games.length?games.length+' on the board \u00b7 none live':'no games on the board';
  }
  try{document.title='Courtside Live \u2014 Vector Hoops';}catch(e){}
}
function syncAtlas(d,g){
  if(!window.LiveAtlas)return;
  const f=fireNow(d,TL.live?TL.n-1:TL.view);
  window.LiveAtlas.onGame(d,g,f&&JAM?f.name:null);
}
function selectGame(id){
  cur=id;clearInterval(timer);clearTimeout(pollTimer);renderGames();
  const m=$('main');if(m)m.hidden=false;
  const og=$('offgame');if(og)og.hidden=true;
  resetTabs();
  const ln2=$('live-loading');if(ln2)ln2.hidden=true;
  TL.gameId=null;TL.n=0;TL.view=-1;TL.live=true;TL.newCount=0;wpDrawnFor=null;
  window._seenMom=new Set();window._lastPlayId=0;
  LROOT().classList.remove('rewound');
  loadGame(); // loadGame schedules the next poll when it finishes
}
/* C2.6: the morning-after card — FINAL badge header via plates, an anchor to the
   embedded replay viewer (V5: NO cross-surface CTA within 24h), and the
   graduation notice. Refresh timers are already off for finals (schedulePoll). */
function renderMorning(d,g,isPost){
  const mo=$('morning');if(!mo)return;
  if(!isPost){mo.hidden=true;return;}
  mo.hidden=false;
  const ms=estFinalMs(g);
  const hrs=ms!=null?Math.max(1,Math.round((ms-Date.now())/3600e3)):null;
  const head=window.Plate?window.Plate.html('FINAL','THE MORNING AFTER','final · complete')
    :'<div class="plate"><span class="pno">FINAL</span><h2>THE MORNING AFTER</h2><span class="prule"></span></div>';
  mo.innerHTML=head+
    '<div class="mg-row"><a href="#rpPlate">\u2193 Jump to the replay viewer</a>'+
    (hrs!=null?'<span>Moves to Pixel Replay in '+hrs+'h</span>':'')+'</div>';
}
/* Audit #18: one phase for the page. 'in' lights the live chrome; 'post' says Final
   and switches every plate's empty copy to past tense; nothing pretends to be live. */
let PHASE='';
let PHASE_LABEL='';
function setPhase(ph,label){
  PHASE=ph;PHASE_LABEL=label||'';
  const r=LROOT();if(r){r.classList.toggle('is-live',ph==='in');r.classList.toggle('final',ph==='post');}
  const st=$('liveState');if(st)st.textContent=ph==='in'?'Live now':ph==='post'?'Final':ph==='pre'?'Before tip':ph==='off'?PHASE_LABEL:'Courtside';
  const le=$('liveLede');if(le)le.textContent=ph==='post'
    ?'This game is over: every plate below is the final record, and the timeline rewinds it.'
    :ph==='off'?'ESPN lists this game as '+PHASE_LABEL.toLowerCase()+'. The plates show whatever was played.'
    :'The second screen for NBA games: no video, just the numbers.';
  const no=$('liveNote');if(no)no.textContent=ph==='post'
    ?'Final: the feed is no longer polled for this game. Use the day arrows for other days and the timeline to rewind.'
    :ph==='off'?'This game is not in progress, so the feed is not polled for it. Use the day arrows for other days.'
    :'Scores and plays refresh every 30 s while a game is live and every 5 minutes otherwise; if the feed stalls you see the last-known score with its time. Use the day arrows for other days and the timeline to rewind.';
}
/* Empty-plate copy by phase: a final never says 'yet' or 'waiting'. */
function emptyMsg(live,fin){return '<p class="caption">'+(PHASE==='post'?fin:PHASE==='off'?'Nothing here: ESPN lists this game as '+esc(PHASE_LABEL.toLowerCase())+'.':live)+'</p>';}
function renderAll(d,g){
  if(g&&g.a&&g.h){try{document.title='Courtside — '+g.a.abbr+' @ '+g.h.abbr;}catch(e){}}
  const gp=phaseOf(d),st=gp.phase;
  const isPre=st==='pre',isPost=st==='post';
  setPhase(st,gp.label);
  const tc=teamColors(d),root=LROOT();
  if(root){root.style.setProperty('--team-a',tc.a||'');root.style.setProperty('--team-h',tc.h||'');}
  // C2.4: panels follow game state — a pre-game selection renders ONLY the
  // pre-game module (HOU@SA regression: zero data plates, zero waiting walls).
  const pg=$('pregame');if(pg&&!isPre){pg.hidden=true;pg.dataset.gid='';}
  // Summary's data cards hide pre-tip; the pre-game card stays. Plays shows
  // its honest empty state pre-tip (see renderGcFeed), so its tab stays.
  document.querySelectorAll('#panel-summary > .card').forEach(c=>{if(c.id!=='pregame')c.hidden=isPre;});
  renderMorning(d,g,isPost);
  const idx=TL.live?TL.n-1:TL.view;
  renderHeader(d,g,idx);
  if(panelOpen('summary')){renderWP(d,g,idx);renderMomentum(d,g,idx);renderShotChart(d,g,idx);renderGcSummary(d,g,idx);}
  if(panelOpen('plays')){renderMoments(d,g,idx);renderRuns(d,g,idx);renderMiles(d);renderGcFeed(d,idx);}
  if(panelOpen('boxscore')){renderLeaders(d,g,idx);renderGcBox(d);}
  if(panelOpen('insights')){renderGhosts(d);renderArche(d,g);}
  renderGcPulse(d,g,idx);
  updateTlUI(d);
  // the Pixel Replay plate (assets/replay-live.js) follows the same data and timeline
  try{window.dispatchEvent(new CustomEvent('courtside:render',{detail:{d:d,g:g,idx:idx,live:TL.live}}));}catch(e){}
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
    if(panelOpen('insights')) syncAtlas(d,g);
    window._lastD=d;window._lastG=g;
    lastUpd=new Date();lastOkAt=lastUpd;failStreak=0;
    hideFeedCard();
    renderPregame(d,g);
    $('upd').textContent='updated '+lastUpd.toLocaleTimeString();
    schedulePoll();
  }catch(e){
    failStreak++;
    showFeedCard('Refresh failed: '+e.message);
    schedulePoll();
  }
}
function updateTlUI(d){
  const bar=$('tlbar'),n=TL.n,show=n>1;
  bar.hidden=!show;
  if(!show){LROOT().classList.remove('rewound');$('liveBtn').classList.remove('show');return;}
  const sc=$('scrub');
  sc.max=n-1;
  if(document.activeElement!==sc)sc.value=TL.view;
  const plays=d.plays||[];
  const p=plays[TL.view];
  const qs=[];let pq=null;
  plays.forEach((pl,i)=>{if(pl.period.number!==pq){qs.push({q:pl.period.number,i:i});pq=pl.period.number;}});
  $('tlticks').innerHTML=qs.map(o=>'<span style="left:'+(o.i/Math.max(1,n-1)*100).toFixed(1)+'%">Q'+o.q+'</span>').join('');
  const tlc=$('tlclock');
  tlc.textContent=TL.live?(PHASE==='post'?'FINAL':PHASE==='off'?PHASE_LABEL.toUpperCase():'\u25cf LIVE'):(p?('Q'+p.period.number+' '+p.clock.displayValue):'');
  tlc.classList.toggle('is-live',TL.live&&PHASE==='in');
  LROOT().classList.toggle('rewound',!TL.live);
  $('liveBtn').classList.toggle('show',!TL.live);
  $('liveLbl').textContent=PHASE==='in'?'LIVE':'END';
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
    $('scrub').focus(); // the button hides once live; keep keyboard focus on the timeline (the board is sticky, no scroll needed)
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
  // C2.2: one game header, identical markup both surfaces.
  try{
    if(window.GameHeader){
      const gh=$('ghMount');
      if(gh)window.GameHeader.render(gh,{a:{abbr:am.team.abbreviation},h:{abbr:hm.team.abbreviation},
        venue:(h.venue&&h.venue.fullName)||'',
        when:h.date?new Date(h.date).toLocaleString('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'numeric',minute:'2-digit'})+' CT':'',
        state:st.state});
    }
  }catch(e){}
}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
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
  let h=String(hex||'').trim().replace('#','');
  if(h.length===3)h=h.split('').map(c=>c+c).join('');
  if(!/^[0-9a-f]{6}$/i.test(h))return String(hex||'');  /* a non-hex token value: drawn as is */
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
  s.font=chartFont();s.textAlign='left';
  const grid=tok('--line-2'),ink2=tok('--fg-2');
  pts.forEach((p,i)=>{
    if(p.period.number!==prev){
      const x=X(i);
      s.strokeStyle=grid;s.setLineDash([3,3]);s.lineWidth=1;
      s.beginPath();s.moveTo(x,padT-6);s.lineTo(x,H-padB);s.stroke();s.setLineDash([]);
      s.fillStyle=ink2;s.fillText('Q'+p.period.number,x+4,padT-4);
      prev=p.period.number;
    }
  });
}

// ---- Our win-probability heuristic (stated, experimental, never a bare number) ----
// p(home wins) = sigmoid( (homeLead + 3.0*f) / (13.5 * sqrt(f)) )
// f = fractionOfGameLeft = secondsLeft / 2880. The 3.0 is a home-court edge in
// points that DECAYS with time left (3.0*f): full weight at tipoff, ~0 at the
// buzzer, so a home team down 2 with 1s left is not shown at 98%. 13.5 is a
// per-game scoring-volatility scale. NOT fitted to data.
// Uncertainty band: +/- 10pp * sqrt(f) — wide early, tight late. The band
// is the point of the number: it says how much this crude model doesn't know.
function ourWP(marginHome, secsLeft){
  const f=Math.max(secsLeft,1)/2880;
  const z=(marginHome+3.0*f)/(13.5*Math.sqrt(f));
  const p=1/(1+Math.exp(-z));
  const half=0.10*Math.sqrt(f);
  return {p:p, lo:Math.max(0,p-half), hi:Math.min(1,p+half)};
}
function secsLeftOf(pl){
  const q=pl&&pl.period?pl.period.number:1;
  const clk=pl&&pl.clock?pl.clock.displayValue:'0:00';
  const m=/(\d+):(\d+)/.exec(clk||''); const s=m?(+m[1])*60+(+m[2]):0;
  if(q<=4) return s+(4-q)*720;
  return s; // OT periods are 5:00
}

let wpDrawnFor=null;
function renderWP(d,g,idx){
  const wp=d.winprobability||[],plays=d.plays||[];
  const habbr=g?g.h.abbr:'HOME',aabbr=g?g.a.abbr:'AWAY';
  // Our model's series, one point per play with a score.
  const ser=[];
  plays.forEach((p,i)=>{
    if(p.awayScore==null||p.homeScore==null)return;
    const w=ourWP((+p.homeScore)-(+p.awayScore),secsLeftOf(p));
    ser.push({i:i,p:w.p,lo:w.lo,hi:w.hi,id:p.id});
  });
  const byId={};wp.forEach(w=>{byId[w.playId]=w.homeWinPercentage;});
  const espn=plays.map((p,i)=>({i:i,v:byId[p.id]})).filter(x=>x.v!==undefined);
  if(!ser.length){$('wpBig').textContent='\u2013';const wb=$('wpBand');if(wb)wb.textContent='';
    // No plays yet (pre-game select): wipe any prior game's chart and re-label
    // the axes for THIS game, so a stale chart can never persist across selections.
    const wc=$('wpchart');if(wc){wc.getContext('2d').clearRect(0,0,wc.width,wc.height);}
    $('lgA').textContent='Tip \u2192 '+aabbr;$('lgH').textContent=habbr+' \u2192 now';return;}
  const n=ser.length;
  let vp=0;
  for(let k=0;k<n;k++){if(ser[k].i<=idx)vp=k;else break;}
  const cur2=ser[vp],hpct=Math.round(cur2.p*100);
  tickNum($('wpBig'),hpct,function(v){return Math.round(v)+'% '+habbr;});
  const wb=$('wpBand');
  if(wb)wb.textContent='range '+Math.round(cur2.lo*100)+'\u2013'+Math.round(cur2.hi*100)+'% \u00b7 '+aabbr+' '+(100-hpct)+'%';
  $('wpLbl').textContent=PHASE==='post'&&TL.live?'at the final buzzer \u00b7 thin grey line = ESPN\u2019s model':(TL.live?'our estimate \u00b7 thin grey line = ESPN\u2019s model':'at this moment \u00b7 our estimate vs ESPN (thin grey)');
  $('lgA').textContent='Tip \u2192 '+aabbr;$('lgH').textContent=habbr+' \u2192 now';
  // chart: band + our line + ESPN reference
  const {ctx,W,H}=prepCanvas('wpchart',170);
  const INK=tok('--fg'),INK2=tok('--fg-2'),RULE=tok('--line-2'),HAIR=tok('--line'),MARK=tok('--accent');
  const padL=38,padR=10,padT=18,padB=8;
  const X=k=>padL+(W-padL-padR)*(k/Math.max(n-1,1));
  const Y=v=>padT+(H-padT-padB)*(1-v);
  [0,0.25,0.5,0.75,1].forEach(f=>{
    const y=Y(f);
    ctx.strokeStyle=f===0.5?RULE:HAIR;
    ctx.setLineDash(f===0.5?[5,4]:[]);ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-padR,y);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=INK2;ctx.font=chartFont();ctx.textAlign='right';
    ctx.fillText(Math.round(f*100)+'%',padL-4,y+4);
  });
  qDividers(ctx,ser.map(x=>plays[x.i]),X,padT,H,padB);
  // interval band
  ctx.beginPath();ctx.moveTo(X(0),Y(ser[0].hi));
  for(let k=1;k<n;k++)ctx.lineTo(X(k),Y(ser[k].hi));
  for(let k=n-1;k>=0;k--)ctx.lineTo(X(k),Y(ser[k].lo));
  ctx.closePath();ctx.fillStyle=hexA(INK,.12);ctx.fill();
  // ESPN reference (thin gray, dashed) — their black box, for comparison only
  if(espn.length>1){
    const eX=new Map();espn.forEach(x=>eX.set(x.i,x.v));
    ctx.beginPath();let started=false;
    ser.forEach((x,k)=>{const v=eX.get(x.i);if(v===undefined)return;
      if(!started){ctx.moveTo(X(k),Y(v));started=true;}else ctx.lineTo(X(k),Y(v));});
    ctx.strokeStyle=tok('--fg-3');ctx.lineWidth=1;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
  }
  // our line
  ctx.beginPath();ctx.moveTo(X(0),Y(ser[0].p));
  for(let k=1;k<n;k++)ctx.lineTo(X(k),Y(ser[k].p));
  ctx.strokeStyle=INK;ctx.lineWidth=2.2;ctx.lineJoin='round';ctx.stroke();
  // viewed-moment marker
  const xd=X(vp);
  if(vp<n-1){
    ctx.strokeStyle=MARK;ctx.lineWidth=1.5;ctx.setLineDash([4,3]);
    ctx.beginPath();ctx.moveTo(xd,padT);ctx.lineTo(xd,H-padB);ctx.stroke();ctx.setLineDash([]);
  }
  ctx.beginPath();ctx.arc(X(vp),Y(cur2.p),4,0,7);ctx.fillStyle=MARK;ctx.fill();
  wpDrawnFor=cur+'wp'+n;
}

function renderMomentum(d,g,idx){
  const plays=d.plays||[];
  // No plays yet (pre-game select): wipe any prior game's chart so nothing stale persists.
  if(!plays.length){const mc=$('momchart');if(mc){mc.getContext('2d').clearRect(0,0,mc.width,mc.height);}return;}
  const habbr=g?g.h.abbr:'HOME',aabbr=g?g.a.abbr:'AWAY';
  const tc=teamColors(d),INK=tok('--fg'),INK2=tok('--fg-2'),MARK=tok('--accent');
  const hcol=tc.h||INK,acol=tc.a||tok('--fg-3');
  const {ctx,W,H}=prepCanvas('momchart',150);
  const diffs=plays.map(p=>(+p.homeScore)-(+p.awayScore));
  const n=diffs.length;
  const vi=Math.max(0,Math.min(idx,n-1));
  const mx=Math.max(8,...diffs.map(v=>Math.abs(v)));
  const padL=38,padR=10,padT=16,padB=8;
  const X=i=>padL+(W-padL-padR)*(i/Math.max(n-1,1));
  const Y=v=>padT+(H-padT-padB)*(1-(v+mx)/(2*mx));
  // quarter dividers
  qDividers(ctx,plays,X,padT,H,padB);
  // zero line
  ctx.strokeStyle=tok('--line-2');ctx.lineWidth=1.2;
  ctx.beginPath();ctx.moveTo(padL,Y(0));ctx.lineTo(W-padR,Y(0));ctx.stroke();
  ctx.fillStyle=INK2;ctx.font=chartFont();ctx.textAlign='right';
  ctx.fillText('0',padL-4,Y(0)+4);
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
  ctx.strokeStyle=INK;ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();
  // rewind: dim future + marker
  if(vi<n-1){
    ctx.fillStyle=hexA(tok('--surface'),.62);
    ctx.fillRect(X(vi),padT,W-padR-X(vi),H-padT-padB);
    ctx.strokeStyle=MARK;ctx.lineWidth=1.5;ctx.setLineDash([4,3]);
    ctx.beginPath();ctx.moveTo(X(vi),padT);ctx.lineTo(X(vi),H-padB);ctx.stroke();ctx.setLineDash([]);
  }
  ctx.beginPath();ctx.arc(X(vi),Y(diffs[vi]),4,0,7);ctx.fillStyle=MARK;ctx.fill();
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
    `<div class="qb qb--a" title="${esc(aabbr)} Q${b.q}: ${b.a}" style="height:${Math.max(3,Math.round(b.a/mxq*60))}px"></div>`+
    `<div class="qb qb--h" title="${esc(habbr)} Q${b.q}: ${b.h}" style="height:${Math.max(3,Math.round(b.h/mxq*60))}px"></div>`+
    `</div><div class="qv num">${b.a}–${b.h}</div><div class="ql">Q${b.q}</div></div>`
  ).join('');
  if(bars.length)grownOnce($('qbars'));
}

let shotTeam='H';

/* ---- Game-center shared renders (assets/game-center.js) ---- */
let gcFeedFilter='all';
function gcRows(d,idx){
  if(!window.GameCenter)return [];
  return (d.plays||[]).slice(0,Math.max(0,idx+1)).map((p,i)=>window.GameCenter.normalizePlay(p,i));
}
function renderGcFeed(d,idx){
  if(!window.GameCenter)return;
  const rows=gcRows(d,idx);
  if(!rows.length){const el=$('gcFeed');if(el)el.innerHTML='<li class="gc-muted">Waiting for tip&hellip; No plays on record for this game.</li>';return;}
  window.GameCenter.renderFeed($('gcFeed'),rows,gcFeedFilter);
}
function renderGcSummary(d,g,idx){
  if(!window.GameCenter)return;
  const rows=gcRows(d,idx),ph=phaseOf(d).phase;
  const last=rows.length?rows[rows.length-1]:null;
  const elapsed=(last&&last.timeout&&last.wallMs)?Date.now()-last.wallMs:null;
  const hero=window.GameCenter.stateHero(ph,last,elapsed);
  const he=$('gcHero');
  if(he){he.hidden=false;he.classList.toggle('gc-hero--timeout',hero.kind==='timeout');
    he.innerHTML='<h2>'+esc(hero.title)+'</h2><p>'+esc(hero.detail)+'</p>';}
  window.GameCenter.renderCatchUp($('gcCatchUp'),rows);
}
function renderGcBox(d){
  if(!window.GameCenter)return;
  window.GameCenter.renderBoxScore($('gcBox'),d.boxscore,['MIN','PTS','REB','AST','STL']);
}
function renderGcPulse(d,g,idx){
  if(!window.GameCenter)return;
  const rows=gcRows(d,idx),ph=phaseOf(d).phase;
  let wp=null,note=null;
  if(ph==='in'&&rows.length){
    const last=rows[rows.length-1],margin=last.home-last.away;
    const pl=(d.plays||[])[idx];
    const secs=pl?secsLeftOf(pl):2880;
    const w=ourWP(margin,secs);
    const homeP=w.p>=0.5;
    wp=homeP?w.p*100:(1-w.p)*100;
    const team=homeP?(g?g.h.abbr:'Home'):(g?g.a.abbr:'Away');
    window.GameCenter.renderPulse($('gcPulseBody'),window.GameCenter.pulse(rows,wp,team));
    return;
  }
  if(ph==='pre')note='Win probability appears once the game tips.';
  window.GameCenter.renderPulse($('gcPulseBody'),window.GameCenter.pulse(rows,null,'',note));
}
(function(){
  const bar=document.querySelector('.gc-feed-filter');
  if(!bar)return;
  bar.addEventListener('click',e=>{
    const b=e.target&&e.target.closest?e.target.closest('[data-gc-feed-filter]'):null;
    if(!b)return;
    gcFeedFilter=b.dataset.gcFeedFilter;
    bar.querySelectorAll('[data-gc-feed-filter]').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on?'true':'false');});
    if(window._lastD)renderGcFeed(window._lastD,TL.live?TL.n-1:TL.view);
  });
})();

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
    el.innerHTML=`<h3>${esc(t.team.abbreviation)}</h3>`+athletes.map(a=>{
      const s=a.stats;
      const hot=fire&&fire.name===a.athlete.displayName?' 🔥':'';
      return `<div class="pl"><span>${esc(a.athlete.displayName)}${hot}</span><span>${esc(s[1])} PTS · ${esc(s[5])} REB · ${esc(s[6])} AST</span></div>`;
    }).join('');
  };
  mk('a');mk('h');
}





function renderShotChart(d,g,idx){
  const svg=$('shotSvg');if(!svg)return;
  const plays=d.plays||[];
  const habbr=g?g.h.abbr:'HOME',aabbr=g?g.a.abbr:'AWAY';
  const tc=teamColors(d),hcol=tc.h||tok('--fg'),acol=tc.a||tok('--fg-3');
  // toggle labels
  const btns=document.querySelectorAll('#shotToggle button');
  btns.forEach(b=>{
    const t=b.dataset.t;
    b.textContent=t==='A'?aabbr:(t==='H'?habbr:'BOTH');
    if(!b.onclick)b.onclick=()=>{
      shotTeam=t;
      btns.forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));
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
  const INK='currentColor';
  let s=`<rect x="0.5" y="0.5" width="49" height="47" fill="none" stroke="${INK}" stroke-width="0.7"/>`;
  s+=`<rect class="court-paint" x="17" y="0" width="16" height="19" stroke="${INK}" stroke-width="0.5"/>`;
  s+=`<circle cx="25" cy="19" r="6" fill="none" stroke="${INK}" stroke-width="0.5" stroke-dasharray="1.6,1.3"/>`;
  s+=`<circle cx="25" cy="5.25" r="0.9" fill="none" stroke="${INK}" stroke-width="0.5"/>`;
  s+=`<line x1="22" y1="4" x2="28" y2="4" stroke="${INK}" stroke-width="0.7"/>`;
  s+=`<path d="M1.25,5.25 A23.75,23.75 0 0 0 48.75,5.25" fill="none" stroke="${INK}" stroke-width="0.6"/>`;
  s+=`<line x1="3" y1="0" x2="3" y2="14" stroke="${INK}" stroke-width="0.6"/>`;
  s+=`<line x1="47" y1="0" x2="47" y2="14" stroke="${INK}" stroke-width="0.6"/>`;
  s+=`<path d="M21,5.25 A4,4 0 0 0 29,5.25" fill="none" stroke="${INK}" stroke-width="0.4" stroke-dasharray="1,1"/>`;
  s+=`<line x1="0.5" y1="47" x2="49.5" y2="47" stroke="${INK}" stroke-width="0.7"/>`;
  s+=`<text class="annot" x="25" y="52.5" text-anchor="middle" font-size="2.6">HALF COURT · MAKES ● / MISSES ○</text>`;
  show.forEach((sh,i)=>{
    const col=sh.t===habbr?hcol:(sh.t===aabbr?acol:tok('--fg-3'));
    // ESPN shot coords put the rim at (25,0); the drawn court puts it at (25,5.25),
    // so shift shots +5.25 in y to land on the drawing. Verified vs 136 ESPN
    // "N-foot" shot descriptions (mean err 0.69ft at (25,0) vs 2.71ft at (25,5.25)).
    if(sh.make)s+=`<circle cx="${sh.x.toFixed(1)}" cy="${(sh.y+5.25).toFixed(1)}" r="1.2" fill="${col}" class="shot-dot"/>`;
    else s+=`<circle cx="${sh.x.toFixed(1)}" cy="${(sh.y+5.25).toFixed(1)}" r="1.2" fill="none" stroke="${col}" stroke-width="0.55" class="shot-dot"/>`;
  });
  svg.innerHTML=s;
  // zone FG%
  const zone={rim:[0,0],mid:[0,0],three:[0,0]};
  show.forEach(sh=>{
    const dd=Math.hypot(sh.x-25,sh.y); // rim at ESPN (25,0); corner 3s: |x-25|>22 and inside the arc break (y<9)
    const z=(dd>23.75||(sh.y<9&&(sh.x<3||sh.x>47)))?'three':(dd<=8?'rim':'mid');
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
  if(!GV){el.innerHTML='<p class="caption">'+(GHOST_DB?'Ghost library failed to load.':'Loading ghost library&hellip;')+'</p>';return;}
  const bp=d.boxscore&&d.boxscore.players;
  if(!bp){el.innerHTML='';return;}
  let html='';
  bp.forEach(side=>{
    const aths=(side.statistics[0].athletes||[]).map(a=>{
      const s=a.stats;
      if(!s||s.length<14)return null;
      const mstr=s[0];
      const mp=mstr.indexOf(':')>=0?(+mstr.split(':')[0])+(+mstr.split(':')[1])/60:+mstr||0;
      if(!(mp>=15))return null; // 15-min floor: per-36 at 10 min is wild extrapolation (Panel N2)
      const fga=(String(s[2]).indexOf('-')>=0)?+String(s[2]).split('-')[1]:0;
      return {nm:a.athlete.displayName,mp:mp,pts:+s[1]||0,reb:+s[5]||0,ast:+s[6]||0,
        tov:+s[7]||0,stl:+s[8]||0,blk:+s[9]||0,fga:fga};
    }).filter(Boolean).sort((a,b)=>b.pts-a.pts).slice(0,2);
    aths.forEach(p=>{
      const gh=ghostFor(p.mp,p.pts,p.reb,p.ast,p.stl,p.blk,p.tov,p.fga);
      const lp36=p.pts/p.mp*36, delta=lp36-gh.gp36;
      const tier=gh.blend<0.9?'closest ghost':(gh.blend<1.4?'nearby ghost':'distant ghost'); // soft words: cutoffs uncalibrated (Panel N2)
      const dCls=delta>=0?'up':'dn', dTxt=(delta>=0?'+':'')+delta.toFixed(1)+' pts/36';
      const mx=Math.max(lp36,gh.gp36,1);
      const lw=Math.round(lp36/mx*100), gw=Math.round(gh.gp36/mx*100);
      const last1=s=>esc(s.split(' ').slice(-1)[0]);
      html+=`<div class="ghost">
        <div class="g-top"><b>${esc(p.nm)}</b> <span class="live">${p.pts}p ${p.reb}r ${p.ast}a · ${Math.round(p.mp)} min</span></div>
        <div class="g-mid">is channeling <b>${esc(gh.name)}</b> <span class="when">${fmtDate(gh.date)} · ${esc(gh.team)} vs ${esc(gh.opp)} — ${gh.gpts}p ${gh.greb}r ${gh.gast}a</span></div>
        <div class="race">
          <div class="rrow"><span class="who">${last1(p.nm)}</span><div class="bar"><div class="fill fill--live" style="width:${lw}%"></div></div><span class="val">${lp36.toFixed(1)}/36</span></div>
          <div class="rrow"><span class="who">👻 ${last1(gh.name)}</span><div class="bar"><div class="fill fill--ghost" style="width:${gw}%"></div></div><span class="val">${gh.gp36.toFixed(1)}/36</span></div>
        </div>
        <div class="g-pace">pace: <b class="${dCls}">${dTxt}</b> vs ghost<span class="tier">${tier}</span></div>
      </div>`;
      if(delta>=5)window._ghostPasses.push({seq:1e9,clk:'now',
        text:`<b>🔥 ${esc(p.nm)} well ahead of ${esc(gh.name)}'s ghost pace</b> <span class="when">early, noisy</span>`});
    });
  });
  el.innerHTML=html||emptyMsg('Not enough minutes yet for ghost matches.','No player reached the 15 minutes a ghost match needs.');
  if(html)grownOnce(el);
}
// bars grow in on a game's first paint only (live.css [data-grown]); refreshes and the scrub redraw in place
function grownOnce(el){if(!el)return;const g=String(TL.gameId);if(el.dataset.growFor===g)return;el.dataset.growFor=g;delete el.dataset.grown;clearTimeout(el._growT);el._growT=setTimeout(()=>{el.dataset.grown='1';},800);}

let FORM_DB=null;

// ---- Milestone watch ----
function renderMiles(d){
  const el=$('miles');if(!el)return;
  if(!FORM_DB){el.innerHTML='';return;}
  const bp=d.boxscore&&d.boxscore.players;
  if(!bp){el.innerHTML=emptyMsg('Waiting for tip\u2026','No box score for this game.');return;}
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
  el.innerHTML=html||emptyMsg('No milestones brewing yet.','No milestones in this game.');
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
  if(!plays.length){el.innerHTML=emptyMsg('Waiting for tip\u2026','No plays on record for this game.');return;}
  const moms=[];
  const clkOf=p=>'Q'+(p.period?p.period.number:'?')+' '+(p.clock?p.clock.displayValue:'');
  const habbr=esc(g?g.h.abbr:'HOME'),aabbr=esc(g?g.a.abbr:'AWAY');
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
    if(sc){if(sc===rt)rn+=pts;else{if(rn>=8&&rt)moms.push({seq:i,clk:clkOf(p),text:`<b>🔥 ${rt==='H'?habbr:aabbr} ${rn}-0 run</b>`});rt=sc;rn=pts;}}
    cA=a;cH=h;
  });
  if(rn>=8&&rt)moms.push({seq:plays.length-1,clk:clkOf(plays[plays.length-1]),text:`<b>🔥 ${rt==='H'?habbr:aabbr} ${rn}-0 run</b>`});
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
    return `<div class="ms-item${fresh?' fresh':''}"><span class="mc">${esc(m.clk)}</span><span class="mt">${m.text}</span><button type="button" class="btn ms-share" data-seq="${m.seq}">Share</button></div>`;
  }).join('')||emptyMsg('Waiting for the first big moment\u2026','No big moments in this game.');
  window._lastMoms=vmoms.slice(0,8);
}

// G4/T4.3: "share this moment" — one share affordance per storyline, score
// state baked into the text, ?game= deep link.
function shareMoment(btn,seq){
  const d=window._lastD,g=window._lastG;
  const moms=window._lastMoms||[];
  const m=moms.find(x=>x.seq===seq);
  const done=msg=>{const old=btn.textContent;btn.textContent=msg;setTimeout(()=>{btn.textContent=old;},1800);};
  if(!d||!g||!m){done('No moment');return;}
  const plays=d.plays||[];
  const p=plays[Math.max(0,Math.min(plays.length-1,seq))]||{};
  const plain=String(m.text||'').replace(/<[^>]*>/g,'');
  const score=g.a.abbr+' '+(p.awayScore||0)+' \u2013 '+(p.homeScore||0)+' '+g.h.abbr;
  const url=location.origin+'/live?game='+encodeURIComponent(g.id);
  const full='Courtside Live: '+plain+' \u2014 '+score+' ('+m.clk+')\n'+url;
  const ok=()=>done('Copied \u2713'),no=()=>done('Copy failed');
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(full).then(ok,no);}
    else no();
  }catch(e){no();}
}

// ---- Feed-down 503 card: last-known score + as-of + retry, never invented numbers ----
function showFeedCard(msg){
  const el=$('feedcard');if(!el)return;
  el.hidden=false;
  let scoreLine='No score on record yet.';
  const d=window._lastD,g=window._lastG;
  if(d&&g){
    const plays=d.plays||[],last=plays[plays.length-1];
    if(last)scoreLine='Last known: '+g.a.abbr+' '+(+last.awayScore)+' \u2013 '+(+last.homeScore)+' '+g.h.abbr;
  }
  const asof=lastOkAt?(' as of '+lastOkAt.toLocaleTimeString()+'.'):'';
  const retry=' Retrying in ~'+Math.round(pollDelayMs()/1000)+'s \u2014 resumes automatically.';
  el.innerHTML='<b>FEED UNREACHABLE</b><span>'+esc(msg)+'</span><span class="fc-score">'+scoreLine+asof+'</span><span class="fc-retry">'+retry+'</span>';
}
function hideFeedCard(){const el=$('feedcard');if(el)el.hidden=true;}

// ---- Key runs: unanswered 8-0+ bursts with Q/clock timestamps ----
function renderRuns(d,g,idx){
  const el=$('runs');if(!el)return;
  const plays=d.plays||[];
  if(!plays.length){el.innerHTML=emptyMsg('Waiting for tip\u2026','No plays on record for this game.');return;}
  const habbr=esc(g?g.h.abbr:'HOME'),aabbr=esc(g?g.a.abbr:'AWAY');
  const live=d.header&&d.header.competitions[0].status.type.state==='in';
  const clkOf=p=>'Q'+(p.period?p.period.number:'?')+' '+(p.clock?p.clock.displayValue:'');
  const runs=[];let rt=null,rn=0,rs=null,re=null,cA=0,cH=0;
  plays.forEach((p,i)=>{
    if(i>idx||!p.scoringPlay)return;
    const a=+p.awayScore,h=+p.homeScore;
    let sc=null,pts=0;
    if(a>cA&&h===cH){sc='A';pts=a-cA;}else if(h>cH&&a===cA){sc='H';pts=h-cH;}
    if(sc){
      if(sc===rt){rn+=pts;re=p;}
      else{
        if(rn>=8&&rt)runs.push({t:rt,pts:rn,s:rs,e:re});
        rt=sc;rn=pts;rs=p;re=p;
      }
    }
    cA=a;cH=h;
  });
  const openRun=(rn>=8&&rt)?{t:rt,pts:rn,s:rs,e:re||plays[Math.min(idx,plays.length-1)],ongoing:live}:null;
  const all=openRun?[openRun].concat(runs):runs;
  all.sort((a,b)=>b.pts-a.pts);
  if(!all.length){el.innerHTML=emptyMsg('No 8\u20130 runs yet.','No 8\u20130 runs in this game.');return;}
  el.innerHTML=all.slice(0,6).map(r=>{
    const tabbr=r.t==='H'?habbr:aabbr;
    return '<div class="run"><b>'+tabbr+' '+r.pts+'\u20130</b><span class="rc">'+clkOf(r.s)+' \u2192 '+clkOf(r.e)+'</span>'+(r.ongoing?'<span class="ongoing">ongoing</span>':'')+'</div>';
  }).join('');
}

// ---- Archetype efficiency: tonight's points by archetype vs minute share ----
// (A within-game efficiency snapshot, not momentum — no time dimension.)
// archetype = mtnnGlobal (K=8 k-means cluster of player-season representations),
// assets/archetype_assignments.json built 2026-10-11; live players mapped by
// display name to their latest player-season <= 2025-26 (assets/live_opening.json).
// delta = points share minus minutes share, in percentage points.
function renderArche(d,g){
  const el=$('arche');if(!el)return;
  const map=window.OPEN_ARCH;
  if(!map){el.innerHTML='<p class="caption">Loading the style groups\u2026</p>';return;}
  const bp=d.boxscore&&d.boxscore.players;
  if(!bp){el.innerHTML=emptyMsg('Box score not up yet.','No box score for this game.');return;}
  const agg={};let totPts=0,totMin=0,unmapped=0;
  bp.forEach(side=>{(side.statistics[0].athletes||[]).forEach(a=>{
    const s=a.stats;if(!s||s.length<2)return;
    const mstr=s[0];
    const mp=mstr.indexOf(':')>=0?(+mstr.split(':')[0])+(+mstr.split(':')[1])/60:(+mstr||0);
    if(!(mp>0))return;
    const hit=map[a.athlete.displayName];
    if(!hit){unmapped++;return;}
    const c=agg[hit.name]||(agg[hit.name]={pts:0,min:0});
    c.pts+=(+s[1]||0);c.min+=mp;totPts+=(+s[1]||0);totMin+=mp;
  });});
  if(totMin<30||!totPts){el.innerHTML=emptyMsg('Not enough mapped minutes yet: the groups light up as rotations settle.','Too few mapped minutes in this game to split the scoring by style.');return;}
  const rows=Object.keys(agg).map(k=>{
    const c=agg[k],ps=c.pts/totPts*100,ms=c.min/totMin*100;
    return {name:k,pts:c.pts,ps:ps,ms:ms,d:ps-ms};
  }).sort((a,b)=>b.d-a.d);
  const max=Math.max.apply(null,rows.map(r=>r.ps));
  el.innerHTML=rows.map(r=>{
    const dc=r.d>=0?'up':'dn',dt=(r.d>=0?'+':'')+r.d.toFixed(0)+'pp';
    return '<div class="arow"><div class="ahead"><b>'+esc(r.name)+'</b><span>'+Math.round(r.pts)+' pts \u00b7 '+r.ps.toFixed(0)+'% of scoring</span></div>'+
      '<div class="abar"><div class="afill" style="width:'+Math.max(4,Math.round(r.ps/max*100))+'%"></div></div>'+
      '<div class="adelta '+dc+'">'+dt+' vs minute share</div></div>';
  }).join('')+'<p class="method">Each player is placed in one of eight playing-style groups from their past seasons. The change is that group\u2019s share of the points minus its share of the minutes. '+(unmapped?unmapped+' player(s) unmatched (rookies / name variants) and excluded.':'')+'</p>';
}

// ---- Pre-game: matchup card before tip ----
function renderPregame(d,g){
  const el=$('pregame');if(!el)return;
  const h=d.header.competitions[0];
  const st=h.status.type.state;
  if(st!=='pre'){el.hidden=true;el.dataset.gid='';return;}
  el.hidden=false;
  const gid=String(h.id||'');
  if(el.dataset.gid===gid)return; // already rendered for this game
  el.dataset.gid=gid;
  const hasDoc=!!window.OPEN_DOC;
  const doc=hasDoc?window.OPEN_DOC.game:{};
  const isDocGame=String(doc.event_id)===gid;
  const habbr=esc(g?g.h.abbr:''),aabbr=esc(g?g.a.abbr:'');
  // Predictor: ONLY when this game is the documented opening-night matchup.
  // ESPN's summary payload carries no predictor field, so a build-time fetch
  // shown for any other game would be misattributed. (Panel S1)
  const pred=doc.predictor||{};
  const showPred=isDocGame&&pred.home_win_pct!=null;
  const homeP=showPred?+pred.home_win_pct:50;
  const predHtml=showPred?
    '<div class="pg-pred"><div class="pbar"><div class="pfill" style="width:'+homeP+'%"></div></div>'+
    '<div class="plbl"><span>'+aabbr+' '+(100-homeP).toFixed(0)+'%</span><span>'+habbr+' '+homeP.toFixed(0)+'%</span></div>'+
    '<div class="psrc">'+esc(pred.source||'Matchup predictor')+' \u00b7 pre-game fetch, '+esc(doc.label||'')+'</div></div>':'';
  // Tip time: from the doc for the documented game, else from ESPN's date (CT).
  let when='';
  if(isDocGame&&doc.tip_ct){
    try{when=new Date(doc.tip_ct).toLocaleString('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'numeric',minute:'2-digit'})+' CT';}catch(e){when='';}
  }else if(h.date){
    try{when=new Date(h.date).toLocaleString('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'numeric',minute:'2-digit'})+' CT';}catch(e){when='';}
  }
  const ctxLine=isDocGame
    ? esc(doc.label||'Pre-game')+' \u2014 both teams 0\u20130.'
    : 'Pre-game.';
  const comp=(window.OPEN_DOC||{}).team_composition||{};
  const chips=(window.OPEN_DOC||{}).star_twins||{};
  const compHtml=abbr=>{
    const c=comp[abbr];if(!c||!isDocGame)return '';
    const bars=c.clusters.slice(0,4).map(x=>'<div class="cmp"><span>'+esc(x.name)+'</span><b class="num">'+x.n+'</b></div>').join('');
    return '<div class="cmpcol"><h4>'+abbr+' flavor</h4>'+bars+'<div class="cnote">'+c.mapped_n+' of '+c.roster_n+' roster players mapped to archetypes</div></div>';
  };
  const chipHtml=abbr=>{
    if(!isDocGame)return '';
    const cs=chips[abbr]||[];
    if(!cs.length)return '<div class="cnote">No twin-library comps for this roster\u2019s young stars yet (twin pool needs \u22654 charted seasons).</div>';
    return cs.map(c=>'<div class="tchip"><b>'+esc(c.name)+'</b><span>'+esc(c.archetype||'')+'</span><span class="tt">twins '+esc(c.twin)+' \u00b7 '+esc(c.twin_season)+' <i>'+(c.similarity*100).toFixed(0)+'%</i></span></div>').join('');
  };
  const sideHtml=isDocGame?
    '<div class="pg-side"><h3>WHAT THE MODELS SEE</h3><div class="cmpgrid">'+compHtml(aabbr)+compHtml(habbr)+'</div>'+
    '<h3>TWIN COMPS</h3><div class="chips">'+chipHtml(aabbr)+chipHtml(habbr)+'</div></div>':'';
  el.innerHTML=
    '<div class="plate"><span class="pno">PRE-GAME</span><h2>TONIGHT\u2019S MATCHUP</h2><span class="prule"></span><span class="pmeta">'+esc(isDocGame?doc.label:'Pre-game')+'</span></div>'+
    '<div class="pg-grid"><div><div class="pg-teams"><span>'+aabbr+'</span><span class="at">@</span><span>'+habbr+'</span></div>'+
    (when?'<div class="pg-when">'+esc(when)+' \u00b7 '+esc(doc.venue||'')+'</div>':'')+
    predHtml+
    '<div class="pg-ctx">'+ctxLine+'</div></div>'+
    sideHtml+'</div>'+
    '<div id="pgMod"></div>';
  // C2.4: the full pre-game show — scouting for EVERY pre-game, not just the
  // documented opening-night game. Renders into #pgMod after the opening block.
  try{
    const mod=document.getElementById('pgMod');
    if(mod&&window.Pregame&&g&&g.a&&g.h){
      const hc=h.competitors.find(c=>c.home),ac=h.competitors.find(c=>!c.home);
      const rec=c=>{try{return c.records[0].summary;}catch(e){return '';}};
      let venue='';try{venue=(h.venue&&h.venue.fullName)||'';}catch(e){}
      window.Pregame.render(mod,{aAbbr:g.a.abbr,hAbbr:g.h.abbr,aRec:rec(ac),hRec:rec(hc),when:when,venue:venue});
    }
  }catch(e){}
}

// ---- Opening-night data (archetype map + pregame chips) ----
window.OPEN_DOC=null;window.OPEN_ARCH=null;
fetch('assets/live_opening.json?v=cc7d0ec4').then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(doc=>{
  window.OPEN_DOC=doc;window.OPEN_ARCH=doc.archetypes;
  if(window._lastD){renderArche(window._lastD,window._lastG);renderPregame(window._lastD,window._lastG);}
}).catch(()=>{});

// The style map (plate 12) is assets/live-atlas.js: Embed3D's live variant, coloured by team.

$('refreshBtn').onclick=loadGame;
$('dayPrev').onclick=()=>gotoDay(-1);
$('dayNext').onclick=()=>gotoDay(1);
$('dayToday').onclick=()=>{sbExplicit=true;resetView();loadGames(null);};
renderDayNav();
loadGames();
fetch('assets/ghost_db.json?v=3ccf22f9').then(r=>r.json()).then(d=>{GHOST_DB=d;GV=null;if(window._lastD)renderGhosts(window._lastD);}).catch(()=>{});
fetch('assets/player_form.json?v=58db3287').then(r=>r.json()).then(d=>{FORM_DB=d;if(window._lastD)renderMiles(window._lastD);}).catch(()=>{});
try{const mq=window.matchMedia('(prefers-color-scheme: dark)');const rt=()=>{if(window._lastD)renderAll(window._lastD,window._lastG);};if(mq.addEventListener)mq.addEventListener('change',rt);else if(mq.addListener)mq.addListener(rt);}catch(e){}
// Game-center tabs — opening a tab paints its panels at real widths.
document.addEventListener('gamecenter:tab',e=>{if(e&&e.detail)renderTab(e.detail.tab);});
// G4/T4.3: one share affordance per storyline.
(function(){
  const el=$('moments');
  if(!el)return;
  el.addEventListener('click',e=>{
    const b=e.target&&e.target.closest?e.target.closest('.ms-share'):null;
    if(b)shareMoment(b,+b.dataset.seq);
  });
})();
(function(){
  const b=document.getElementById('tabJam');if(!b)return;
  const paint=()=>b.setAttribute('aria-pressed',JAM?'true':'false');
  paint();
  b.onclick=()=>{
    JAM=!JAM;
    try{localStorage.setItem('vh_jam',JAM?'on':'off');}catch(e){}
    paint();
    if(window._lastD)renderAll(window._lastD,window._lastG);
  };
})();


