/* --- extracted from twenty-questions.html (the whole game): moved out of the page because the site's CSP is script-src 'self' --- */
/* Twenty Questions — native game. No build step, no dependencies.
 * The tree and the row->career join ship as JSON (see scripts/build_twenty_questions.py).
 * The map is the shared Embed3D engine (variant 'game'): ruled-out careers fade
 * with setDim(ids to keep). twenty-questions-map.json's `career[i]` is the career
 * index of vectors.json row i, which is Embed3D point i (checked over all
 * 12,966 rows when the file is built). */
(function(){
'use strict';
var TREE_URL='assets/twenty-questions-tree.json';
var MAP_URL='assets/twenty-questions-map.json';
var POSITIONS=['PG','SG','SF','PF','C'];
var CLUSTERS=['Offensive glass + rim protection','Offensive glass, low shot volume','Three-point volume, quiet elsewhere','Defensive glass + rim pressure','Shot volume + three-point volume','Three-point accuracy + volume','Playmaking + steals','Scoring volume + shot volume'];
var MAXQ=20;

var $=function(id){return document.getElementById(id);};

var T=null;                      // tree doc
var CAREER=null;                 // Int32Array: career index per map point (row)
var ROWS_OF=null;                // career index -> [rows]
var MAP=null;                    // Embed3D handle
var node=0, prefix='', answers=[], history=[], tieElim=new Set(), tieOrder=null, tiePos=0;
var aliveFlag=null;              // Uint8Array per career: 1 = still possible
var aliveCount=0;
var lastPi=-1;                   // career of the last reveal (share card)
var revealed=false;              // the reveal card is showing

function toast(msg){
  try{if(window.VHToast)window.VHToast.show(msg);}catch(e){}
}
function fmt(n){return n.toLocaleString('en-US');}
/* colours and faces come from the page's tokens (atlas.css), read when used */
function tok(n,fb){var v='';try{v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();}catch(e){}return v||fb;}

function candidates(){
  // players whose answer-path starts with prefix, minus tie eliminations
  var out=[], paths=T.paths;
  for(var i=0;i<paths.length;i++){
    if(tieElim.has(i))continue;
    if(paths[i].slice(0,prefix.length)===prefix)out.push(i);
  }
  return out;
}
function refreshAlive(){
  aliveFlag=new Uint8Array(T.players.length);
  var c=candidates();
  for(var k=0;k<c.length;k++)aliveFlag[c[k]]=1;
  aliveCount=c.length;
  $('pill-left').textContent=fmt(c.length)+(c.length===1?' career':' careers');
  return c.length;
}

/* ---------- map ---------- */
function syncMap(){
  if(!MAP||!CAREER||!aliveFlag)return;
  try{
    if(revealed&&lastPi>=0){
      var mine=ROWS_OF[lastPi]||[];
      MAP.setHighlight(mine);MAP.setDim(mine);
      return;
    }
    MAP.setHighlight([]);
    if(aliveCount>=T.players.length){MAP.setDim(null);return;}
    var keep=[];
    for(var i=0;i<CAREER.length;i++)if(aliveFlag[CAREER[i]])keep.push(i);
    MAP.setDim(keep);
  }catch(e){console.warn('twenty-questions: map sync failed',e);}
}
/* a tapped dot says who it is and whether it is still in play */
function onPick(i){
  if(!MAP||!CAREER)return;
  var info=MAP.info(i);if(!info)return;
  var ci=CAREER[i], still=aliveFlag&&aliveFlag[ci];
  toast(info.name+' · '+info.season+(revealed?'':(still?' · still possible':' · ruled out')));
}
function mountMap(){
  var host=$('tq-map');
  if(!host)return;
  if(!window.Embed3D||typeof window.Embed3D.mount!=='function'){
    toast('The map didn’t load — the questions still work.');return;
  }
  try{MAP=window.Embed3D.mount(host,{variant:'game',height:360,onSelect:onPick});}
  catch(e){MAP=null;console.warn('twenty-questions: map mount failed',e);}
}
function setCareers(arr){
  var n=arr.length, c=new Int32Array(n), rows={};
  for(var i=0;i<n;i++){
    var ci=arr[i]|0;c[i]=ci;
    (rows[ci]||(rows[ci]=[])).push(i);
  }
  CAREER=c;ROWS_OF=rows;
}

/* ---------- game flow ---------- */
function snapshot(){return {node:node,prefix:prefix,answers:answers.slice(),tieElim:new Set(tieElim),tieOrder:tieOrder,tiePos:tiePos};}
function restore(s){node=s.node;prefix=s.prefix;answers=s.answers;tieElim=s.tieElim;tieOrder=s.tieOrder;tiePos=s.tiePos;}
function setQuestionUI(){
  var nd=T.tree[node];
  revealed=false;
  $('q-card').hidden=false;$('tie-card').hidden=true;$('reveal-card').hidden=true;
  $('q-card').setAttribute('aria-busy','false');
  $('q-count').textContent='Question '+(answers.length+1)+' of '+MAXQ;
  $('q-text').textContent=nd.t;
  $('pill-q').textContent='Q '+(answers.length+1)+'/'+MAXQ;
  var on=answers.length<MAXQ;
  $('btn-yes').disabled=!on;$('btn-no').disabled=!on;$('btn-unsure').disabled=!on;
  $('btn-undo').disabled=history.length===0;
  renderLog();
}
function renderLog(){
  var el=$('answer-log');el.innerHTML='';
  answers.forEach(function(a){
    var s=document.createElement('span');s.className='progress-dot '+(a[1]==='y'?'is-yes':(a[1]==='n'?'is-no':'is-unsure'));s.textContent=a[1]==='y'?'Y':(a[1]==='n'?'N':'?');el.appendChild(s);
  });
}
function answer(dir){ // dir: 'y' | 'n' | 'u'
  if(answers.length>=MAXQ)return;
  history.push(snapshot());
  var nd=T.tree[node], go=dir;
  if(dir==='u'){
    // not sure: follow the bigger half (count by path prefix)
    var yc=0,nc=0,pf=prefix,paths=T.paths;
    for(var i=0;i<paths.length;i++){
      if(tieElim.has(i))continue;
      var pth=paths[i];
      if(pth.slice(0,pf.length)!==pf)continue;
      if(pth[pf.length]==='y')yc++;else if(pth[pf.length]==='n')nc++;
    }
    go=yc>=nc?'y':'n';dir='u';
  }
  answers.push([nd.q,dir]);
  prefix+=go;node=go==='y'?nd.y:nd.n;
  step();
}
function step(){
  revealed=false;
  refreshAlive();
  var nd=T.tree[node];
  if(nd.p!==undefined){reveal(nd.p);return;}
  syncMap();
  if(nd.tie!==undefined){startTie(nd.tie);return;}
  setQuestionUI();
}
function startTie(order){
  tieOrder=order.filter(function(i){return !tieElim.has(i);});
  tiePos=0;
  $('q-card').hidden=true;$('reveal-card').hidden=true;$('tie-card').hidden=false;
  $('btn-undo').disabled=history.length===0;
  askTie();
}
function askTie(){
  if(tiePos>=tieOrder.length-1){reveal(tieOrder[tieOrder.length-1]);return;}
  var p=T.players[tieOrder[tiePos]];
  $('tie-text').textContent='Is your player '+p[8]+'?';
  $('pill-q').textContent='Q '+(answers.length+1)+'/'+MAXQ;
}
function tieAnswer(yes){
  history.push(snapshot());
  var cur=tieOrder[tiePos];
  if(yes){reveal(cur);return;}
  answers.push(['tie','n']);tieElim.add(cur);tiePos++;
  refreshAlive();syncMap();askTie();
  $('btn-undo').disabled=history.length===0;renderLog();
}
function careerLine(p){
  var pos=p[3]==null?'position unknown':POSITIONS[p[3]];
  var clu=p[4]==null?'style unknown':CLUSTERS[p[4]];
  return pos+' · '+p[1]+'–'+p[2]+' · '+clu;
}
function reveal(pi){
  lastPi=pi;revealed=true;
  var p=T.players[pi];
  $('q-card').hidden=true;$('tie-card').hidden=true;$('reveal-card').hidden=false;
  $('reveal-kicker').textContent='Solved in '+answers.length+' question'+(answers.length===1?'':'s');
  $('reveal-name').textContent=p[0];
  $('reveal-career').textContent=careerLine(p);
  var b=$('reveal-badges');b.innerHTML='';
  if(p[6]){var s=document.createElement('span');s.className='pill pill-yellow';s.textContent='★ All-Star';b.appendChild(s);}
  if(p[7]){var a=document.createElement('span');a.className='pill pill-yellow';a.textContent='◈ All-NBA';b.appendChild(a);}
  $('pill-q').textContent='Q '+answers.length+'/'+MAXQ;
  $('btn-undo').disabled=history.length===0;
  refreshAlive();syncMap();
  $('btn-again').focus();
}
function reset(){
  node=0;prefix='';answers=[];history=[];tieElim=new Set();tieOrder=null;tiePos=0;revealed=false;
  step();
}

/* ---------- share ---------- */
function shareText(){
  var p=T.players[lastPi];
  var log=answers.map(function(a){return a[1]==='y'?'Y':(a[1]==='n'?'N':'?');}).join('');
  return '🎯 Twenty Questions — Vector Hoops\nSolved in '+answers.length+' questions: '+p[8]+'\n'+log+'\nPlay: https://hoops.dumbmodel.com/twenty-questions';
}
/* The card is drawn in the page's own tokens, so it follows the visitor's theme. */
function shareCard(){
  var W=1080,H=1350,c=document.createElement('canvas');c.width=W;c.height=H;
  var x=c.getContext('2d');
  var bg=tok('--bg','white'), fg=tok('--fg','black'), fg2=tok('--fg-2','dimgray'), fg3=tok('--fg-3','gray');
  var accent=tok('--accent','firebrick'), ok=tok('--ok','seagreen'), line=tok('--line','lightgray');
  var face=getComputedStyle(document.body).fontFamily, mono=tok('--font-code',face), disp=tok('--font-display',face);
  x.fillStyle=bg;x.fillRect(0,0,W,H);
  x.strokeStyle=fg;x.lineWidth=18;x.strokeRect(10,10,W-20,H-20);
  x.fillStyle=fg;x.fillRect(0,0,W,110);
  x.fillStyle=bg;x.font='700 30px '+mono;
  x.fillText('VECTOR HOOPS · TWENTY QUESTIONS',36,48);
  x.font='700 22px '+mono;x.globalAlpha=.75;
  x.fillText(fmt(T.players.length)+' careers · up to 20 questions · every answer dims the map',36,84);
  x.globalAlpha=1;
  var p=T.players[lastPi];
  x.fillStyle=accent;x.font='800 44px '+disp;
  x.fillText('Solved in '+answers.length+' questions',48,220);
  x.fillStyle=fg;x.font='900 84px '+disp;
  var nm=p[0];if(nm.length>18)nm=nm.slice(0,17)+'…';
  x.fillText(nm,48,330);
  x.font='700 30px '+mono;x.fillStyle=fg2;
  x.fillText(careerLine(p),48,380);
  x.font='700 26px '+mono;x.fillStyle=fg;
  var log=answers.map(function(a){return a[1]==='y'?'Y':(a[1]==='n'?'N':'?');});
  x.fillText('Answers:',48,470);
  log.forEach(function(ch,i){
    x.fillStyle=ch==='Y'?ok:(ch==='N'?accent:line);
    var yy=490+Math.floor(i/14)*64;
    x.fillRect(48+(i%14)*66,yy,52,52);
    x.fillStyle=ch==='?'?fg:bg;x.font='800 28px '+mono;
    x.fillText(ch,48+(i%14)*66+16,yy+38);
  });
  var ly=490+Math.ceil(log.length/14)*64+60;
  x.fillStyle=fg2;x.font='700 26px '+mono;
  x.fillText('Every answer dimmed the map live.',48,ly);
  x.fillStyle=fg;x.font='700 30px '+mono;
  x.fillText('hoops.dumbmodel.com/twenty-questions',48,H-90);
  x.font='700 22px '+mono;x.fillStyle=fg3;
  x.fillText('Free · No account · No ads · Real data only',48,H-52);
  return c;
}
$('btn-share').addEventListener('click',function(){
  try{
    var c=shareCard(),a=document.createElement('a');
    a.download='twenty-questions-result.png';a.href=c.toDataURL('image/png');a.click();
    toast('Share card downloaded');
  }catch(e){toast('Could not make the card — use Copy text');}
});
$('btn-copy').addEventListener('click',function(){
  var t=shareText();
  function done(){toast('Result copied — paste it anywhere');}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){fallback();});}
  else fallback();
  function fallback(){var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done();}catch(e){toast('Copy failed — sorry');}ta.remove();}
});

/* ---------- wiring ---------- */
$('btn-yes').addEventListener('click',function(){answer('y');});
$('btn-no').addEventListener('click',function(){answer('n');});
$('btn-unsure').addEventListener('click',function(){answer('u');});
$('btn-tie-yes').addEventListener('click',function(){tieAnswer(true);});
$('btn-tie-no').addEventListener('click',function(){tieAnswer(false);});
$('btn-undo').addEventListener('click',function(){
  var s=history.pop();if(!s)return;restore(s);
  var nd=T.tree[node];
  if(nd.p!==undefined||nd.tie!==undefined){step();return;} // reveal/tie: re-step
  revealed=false;refreshAlive();syncMap();setQuestionUI();
});
$('btn-restart').addEventListener('click',reset);
$('btn-again').addEventListener('click',reset);
$('btn-retry').addEventListener('click',function(){$('err-card').hidden=true;boot();});
document.addEventListener('keydown',function(e){
  if($('reveal-card').hidden===false||$('err-card').hidden===false)return;
  var tag=(e.target&&e.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select'||e.target.isContentEditable)return;
  if(e.target&&e.target.closest&&e.target.closest('.embed3d'))return; // the map owns its keys
  if($('tie-card').hidden===false){
    if(e.key==='y'||e.key==='Y'){tieAnswer(true);}else if(e.key==='n'||e.key==='N'){tieAnswer(false);}
    return;
  }
  if($('q-card').hidden)return;
  if(e.key==='y'||e.key==='Y'){$('btn-yes').click();}
  else if(e.key==='n'||e.key==='N'){$('btn-no').click();}
  else if(e.key==='u'||e.key==='U'){$('btn-unsure').click();}
});

var mapStarted=false;
function boot(){
  // The question UI goes live the moment the tree (298K) lands. The map and
  // the row->career join follow; syncMap() no-ops until both are in.
  fetch(TREE_URL).then(function(r){if(!r.ok)throw new Error('tree '+r.status);return r.json();})
  .then(function(t){
    T=t;
    if(!T.tree||!T.paths){throw new Error('bad payload');}
    reset();
  }).catch(function(){
    $('q-card').hidden=true;$('err-card').hidden=false;
  });
  if(mapStarted)return;
  mapStarted=true;
  mountMap();
  fetch(MAP_URL).then(function(r){if(!r.ok)throw new Error('map '+r.status);return r.json();})
  .then(function(m){
    if(!m.career||!m.career.length){throw new Error('bad payload');}
    setCareers(m.career);syncMap();
  }).catch(function(){
    // The game is fully playable without the map; say so once.
    toast('The map can’t dim right now — the questions still work.');
  });
}
boot();
})();
