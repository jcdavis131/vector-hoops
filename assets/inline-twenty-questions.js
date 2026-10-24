/* --- extracted from twenty-questions.html (the whole game): moved out of the page because the site's CSP is script-src 'self' --- */
/* Twenty Questions — native game. No build step, no dependencies.
 * Tree + map ship as JSON (see scripts/build_twenty_questions.py). */
(function(){
'use strict';
var TREE_URL='assets/twenty-questions-tree.json';
var MAP_URL='assets/twenty-questions-map.json';
var POSITIONS=['PG','SG','SF','PF','C'];
var CLUSTERS=['Offensive glass + rim protection','Offensive glass, low shot volume','Three-point volume, quiet elsewhere','Defensive glass + rim pressure','Shot volume + three-point volume','Three-point accuracy + volume','Playmaking + steals','Scoring volume + shot volume'];
var MAXQ=20;

var $=function(id){return document.getElementById(id);};
var canvas=$('tq-canvas'), ctx=canvas.getContext('2d');
var reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

var T=null, PTS=null;            // tree doc, map points
var node=0, prefix='', answers=[], history=[], tieElim=new Set(), tieOrder=null, tiePos=0;
var aliveFlag=null;              // Uint8Array per player: 1 = still possible
var lastPi=-1;                   // player index of the current reveal
function dpr(){return Math.min(2,window.devicePixelRatio||1);}

function toast(msg){
  try{if(window.VHToast)window.VHToast.show(msg);}catch(e){}
}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fmt(n){return n.toLocaleString('en-US');}

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
  $('pill-left').textContent=fmt(c.length)+(c.length===1?' career':' careers');
  return c.length;
}

/* ---------- map ---------- */
var cssCache=null;
function cssVar(n){if(!cssCache)cssCache=getComputedStyle(document.documentElement);return cssCache.getPropertyValue(n).trim();}
function sizeCanvas(){
  var r=$('map-wrap').getBoundingClientRect(), d=dpr();
  canvas.width=Math.max(1,Math.round(r.width*d));canvas.height=Math.max(1,Math.round(r.height*d));
}
function drawMap(){
  if(!PTS)return;
  var W=canvas.width,H=canvas.height,pad=8*dpr();
  ctx.clearRect(0,0,W,H);
  var s=Math.min(W,H)-2*pad, ox=(W-s)/2, oy=(H-s)/2;
  var live=cssVar('--accent')||'#E0483B', faint=cssVar('--fg-3')||'#6E6E66';
  var n=PTS.length, i, x, y;
  ctx.fillStyle=faint;ctx.globalAlpha=0.16;
  for(i=0;i<n;i++){var p=PTS[i];if(aliveFlag[p[2]])continue;x=ox+p[0]*s;y=oy+(1-p[1])*s;ctx.fillRect(x,y,2,2);}
  ctx.globalAlpha=0.9;ctx.fillStyle=live;
  for(i=0;i<n;i++){var q=PTS[i];if(!aliveFlag[q[2]])continue;x=ox+q[0]*s;y=oy+(1-q[1])*s;ctx.fillRect(x,y,2,2);}
  ctx.globalAlpha=1;
}
var rsT=null;
window.addEventListener('resize',function(){clearTimeout(rsT);rsT=setTimeout(function(){sizeCanvas();drawMap();},150);});

/* ---------- game flow ---------- */
function snapshot(){return {node:node,prefix:prefix,answers:answers.slice(),tieElim:new Set(tieElim),tieOrder:tieOrder,tiePos:tiePos};}
function restore(s){node=s.node;prefix=s.prefix;answers=s.answers;tieElim=s.tieElim;tieOrder=s.tieOrder;tiePos=s.tiePos;}
function setQuestionUI(){
  var nd=T.tree[node];
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
  var n=refreshAlive();drawMap();
  var nd=T.tree[node];
  if(nd.p!==undefined){reveal(nd.p);return;}
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
  refreshAlive();drawMap();askTie();
  $('btn-undo').disabled=history.length===0;renderLog();
}
function careerLine(p){
  var pos=p[3]==null?'position unknown':POSITIONS[p[3]];
  var clu=p[4]==null?'style unknown':CLUSTERS[p[4]];
  return pos+' \u00B7 '+p[1]+'\u2013'+p[2]+' \u00B7 '+clu;
}
function reveal(pi){
  lastPi=pi;
  var p=T.players[pi];
  $('q-card').hidden=true;$('tie-card').hidden=true;$('reveal-card').hidden=false;
  $('reveal-kicker').textContent='Solved in '+answers.length+' question'+(answers.length===1?'':'s');
  $('reveal-name').textContent=p[0];
  $('reveal-career').textContent=careerLine(p);
  var b=$('reveal-badges');b.innerHTML='';
  if(p[6]){var s=document.createElement('span');s.className='pill pill-yellow';s.textContent='\u2605 All-Star';b.appendChild(s);}
  if(p[7]){var a=document.createElement('span');a.className='pill pill-yellow';a.textContent='\u25C8 All-NBA';b.appendChild(a);}
  $('pill-q').textContent='Q '+answers.length+'/'+MAXQ;
  refreshAlive();drawMap();
  $('btn-again').focus();
}
function reset(){
  node=0;prefix='';answers=[];history=[];tieElim=new Set();tieOrder=null;tiePos=0;
  refreshAlive();drawMap();step();
}

/* ---------- share ---------- */
function shareText(){
  var p=T.players[lastPi];
  var log=answers.map(function(a){return a[1]==='y'?'Y':(a[1]==='n'?'N':'?');}).join('');
  return '\uD83C\uDFAF Twenty Questions \u2014 Vector Hoops\nSolved in '+answers.length+' questions: '+p[8]+'\n'+log+'\nPlay: https://hoops.dumbmodel.com/twenty-questions';
}
function shareCard(){
  var W=1080,H=1350,c=document.createElement('canvas');c.width=W;c.height=H;
  var x=c.getContext('2d');
  x.fillStyle='#FCFBF7';x.fillRect(0,0,W,H);
  x.strokeStyle='#232323';x.lineWidth=18;x.strokeRect(10,10,W-20,H-20);
  x.fillStyle='#232323';x.fillRect(0,0,W,110);
  x.fillStyle='#FCFBF7';x.font='700 30px ui-monospace,monospace';
  x.fillText('VECTOR HOOPS \u00B7 TWENTY QUESTIONS',36,48);
  x.font='700 22px ui-monospace,monospace';x.fillStyle='#E7E4DA';
  x.fillText('2,426 careers \u00B7 up to 20 questions \u00B7 every answer dims the map',36,84);
  var p=T.players[lastPi];
  x.fillStyle='#E0483B';x.font='800 44px ui-sans-serif,system-ui';
  x.fillText('Solved in '+answers.length+' questions',48,220);
  x.fillStyle='#232323';x.font='900 84px ui-sans-serif,system-ui';
  var nm=p[0];if(nm.length>18)nm=nm.slice(0,17)+'\u2026';
  x.fillText(nm,48,330);
  x.font='700 30px ui-monospace,monospace';x.fillStyle='#57574F';
  x.fillText(careerLine(p),48,380);
  x.font='700 26px ui-monospace,monospace';x.fillStyle='#232323';
  var log=answers.map(function(a){return a[1]==='y'?'Y':(a[1]==='n'?'N':'?');});
  x.fillText('Answers:',48,470);
  var bx=48;
  log.forEach(function(ch,i){
    if(bx>W-120){bx=48;}
    x.fillStyle=ch==='Y'?'#8A9A8B':(ch==='N'?'#E0483B':'#E7E4DA');
    var yy=490+Math.floor(i/14)*64;
    x.fillRect(48+(i%14)*66,yy,52,52);
    x.fillStyle='#FCFBF7';x.font='800 28px ui-monospace,monospace';
    x.fillText(ch,48+(i%14)*66+16,yy+38);
  });
  var ly=490+Math.ceil(log.length/14)*64+60;
  x.fillStyle='#57574F';x.font='700 26px ui-monospace,monospace';
  x.fillText('Every answer dimmed the map live.',48,ly);
  x.fillStyle='#232323';x.font='700 30px ui-monospace,monospace';
  x.fillText('hoops.dumbmodel.com/twenty-questions',48,H-90);
  x.font='700 22px ui-monospace,monospace';x.fillStyle='#6E6E66';
  x.fillText('Free \u00B7 No account \u00B7 No ads \u00B7 Real data only',48,H-52);
  return c;
}
$('btn-share').addEventListener('click',function(){
  try{
    var c=shareCard(),a=document.createElement('a');
    a.download='twenty-questions-result.png';a.href=c.toDataURL('image/png');a.click();
    toast('Share card downloaded');
  }catch(e){toast('Could not make the card \u2014 use Copy text');}
});
$('btn-copy').addEventListener('click',function(){
  var t=shareText();
  function done(){toast('Result copied \u2014 paste it anywhere');}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){fallback();});}
  else fallback();
  function fallback(){var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done();}catch(e){toast('Copy failed \u2014 sorry');}ta.remove();}
});

/* ---------- wiring ---------- */
$('btn-yes').addEventListener('click',function(){answer('y');});
$('btn-no').addEventListener('click',function(){answer('n');});
$('btn-unsure').addEventListener('click',function(){answer('u');});
$('btn-tie-yes').addEventListener('click',function(){tieAnswer(true);});
$('btn-tie-no').addEventListener('click',function(){tieAnswer(false);});
$('btn-undo').addEventListener('click',function(){
  var s=history.pop();if(!s)return;restore(s);refreshAlive();drawMap();
  var nd=T.tree[node];
  if(nd.p!==undefined||nd.tie!==undefined){/* reveal/tie: re-step */step();}else setQuestionUI();
});
$('btn-restart').addEventListener('click',reset);
$('btn-again').addEventListener('click',reset);
$('btn-retry').addEventListener('click',function(){$('err-card').hidden=true;boot();});
document.addEventListener('keydown',function(e){
  if($('reveal-card').hidden===false||$('err-card').hidden===false)return;
  var tag=(e.target&&e.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select'||e.target.isContentEditable)return;
  if($('tie-card').hidden===false){
    if(e.key==='y'||e.key==='Y'){tieAnswer(true);}else if(e.key==='n'||e.key==='N'){tieAnswer(false);}
    return;
  }
  if($('q-card').hidden)return;
  if(e.key==='y'||e.key==='Y'){$('btn-yes').click();}
  else if(e.key==='n'||e.key==='N'){$('btn-no').click();}
  else if(e.key==='u'||e.key==='U'){$('btn-unsure').click();}
});

function boot(){
  sizeCanvas();
  // Stream: the question UI goes live the moment the tree (298K) lands.
  // The map points (238K) follow and start drawing whenever they arrive —
  // drawMap() already no-ops until PTS is set.
  fetch(TREE_URL).then(function(r){if(!r.ok)throw new Error('tree '+r.status);return r.json();})
  .then(function(t){
    T=t;
    if(!T.tree||!T.paths){throw new Error('bad payload');}
    reset();
  }).catch(function(){
    $('q-card').hidden=true;$('err-card').hidden=false;
  });
  fetch(MAP_URL).then(function(r){if(!r.ok)throw new Error('map '+r.status);return r.json();})
  .then(function(m){
    if(!m.points){throw new Error('bad payload');}
    PTS=m.points;drawMap();
  }).catch(function(){
    // The game is fully playable without the map; say so once.
    toast('The map view didn\u2019t load \u2014 the questions still work.');
  });
}
boot();
})();
