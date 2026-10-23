/* --- extracted from play/era-crossed.html (the whole quiz): moved out of the page because the site's CSP is script-src 'self' --- */
/* Era Crossed — pick the true closest modern twin. The quiz ships as per-game
 * JSON subsets (see scripts/build_era_crossed.py): one ~3.5KB game file per
 * visit instead of the whole 459KB pool. 10 rounds dealt per game. */
(function(){
'use strict';
var GAME_COUNT=131; /* pre-dealt game files; build_era_crossed.py --check keeps this in sync */
var ROUNDS_PER_GAME=10, STREAK_BAR=7, LS_KEY='vh-era-crossed';
var curGame=0;
function gameURL(n){return '/assets/era-crossed-games/g'+('00'+n).slice(-3)+'.json';}
var $=function(id){return document.getElementById(id);};

var Q=null, order=[], ri=0, score=0, answered=false;
var store={streak:0,best:0,games:0};
try{var s=JSON.parse(localStorage.getItem(LS_KEY)||'null');if(s)store=s;}catch(e){}

function toast(msg){
  var t=$('vh-toast');
  if(!t){t=document.createElement('div');t.id='vh-toast';t.className='vh-toast';t.setAttribute('role','status');document.body.appendChild(t);}
  t.textContent=msg;t.classList.add('is-visible');
  clearTimeout(toast._t);toast._t=setTimeout(function(){t.classList.remove('is-visible');},2600);
}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t;}return a;}

function saveStore(){try{localStorage.setItem(LS_KEY,JSON.stringify(store));}catch(e){}}
function paintStatus(){
  $('pill-round').textContent='Round '+Math.min(ri+1,ROUNDS_PER_GAME)+'/'+ROUNDS_PER_GAME;
  $('pill-score').textContent='Score '+score;
  $('pill-streak').textContent='Streak '+store.streak;
}
function paintDots(){
  var el=$('round-dots');el.innerHTML='';
  for(var i=0;i<order.length;i++){
    var d=document.createElement('span');d.className='d'+(order[i].hit===true?' hit':order[i].hit===false?' miss':'');
    d.textContent=i+1;el.appendChild(d);
  }
}

function deal(){
  order=shuffle(Q.rounds.slice()).slice(0,ROUNDS_PER_GAME);
  ri=0;score=0;answered=false;
  $('done-card').hidden=true;$('round-card').hidden=false;
  paintDots();round();
}
function round(){
  answered=false;
  var r=order[ri];
  $('anchor-name').textContent=r.a;
  $('anchor-meta').textContent=(r.d||'???')+' \u00B7 signature season '+r.s+(r.arc?' \u00B7 '+r.arc:'');
  var box=$('opts');box.innerHTML='';
  r.o.forEach(function(o,i){
    var b=document.createElement('button');
    b.type='button';b.className='opt';b.dataset.i=i;
    b.innerHTML='<span class="nm">'+esc(o.n)+'</span><span class="ss">'+esc(o.s)+' \u00B7 <kbd>'+(i+1)+'</kbd></span>';
    b.addEventListener('click',function(){pick(i);});
    box.appendChild(b);
  });
  $('reveal-note').hidden=true;$('btn-next').hidden=true;
  paintStatus();
  var first=box.querySelector('.opt');if(first)first.focus();
}
function pick(i){
  if(answered)return;answered=true;
  var r=order[ri], hit=r.o[i].correct;
  order[ri].hit=hit;if(hit)score++;
  if(window.VHSound)VHSound.sfx(hit?'right':'wrong');
  var btns=$('opts').querySelectorAll('.opt');
  btns.forEach(function(b,bi){
    b.disabled=true;
    var o=r.o[bi];
    if(o.correct)b.classList.add('is-correct');
    else if(bi===i)b.classList.add('is-wrong');
    var sim=document.createElement('span');sim.className='sim';
    sim.textContent='style similarity '+Math.round(o.sim*100);
    var bar=document.createElement('span');bar.className='bar';
    var fill=document.createElement('i');fill.style.width=Math.max(2,Math.round(o.sim*100))+'%';
    bar.appendChild(fill);
    b.appendChild(sim);b.appendChild(bar);
  });
  var truth=r.o.filter(function(o){return o.correct;})[0];
  var note=$('reveal-note');note.hidden=false;
  note.textContent=(hit?'\u2713 Correct. ':'\u2717 Not quite. ')+truth.n+' ('+truth.s+') is the closest twin at similarity '+Math.round(truth.sim*100)+' \u2014 embedding cosine \u00D7 100.';
  $('btn-next').hidden=false;
  paintStatus();paintDots();
  $('btn-next').focus();
}
function finish(){
  $('round-card').hidden=true;$('done-card').hidden=false;
  store.games++;
  var madeBar=score>=STREAK_BAR;
  store.streak=madeBar?store.streak+1:0;
  store.best=Math.max(store.best,score);
  saveStore();paintStatus();
  $('done-kicker').textContent='Game over \u00B7 '+store.games+' played';
  $('done-title').textContent=score+'/'+ROUNDS_PER_GAME;
  $('done-line').textContent=(madeBar?'Streak kept alive at '+store.streak+'. ':'Streak reset \u2014 '+STREAK_BAR+'+ keeps it alive. ')+'Best: '+store.best+'/'+ROUNDS_PER_GAME+'.';
  $('btn-again').focus();
}

/* ---------- share ---------- */
function shareText(){
  return '\ud83d\udd00 Era Crossed \u2014 Vector Hoops\n'+score+'/'+ROUNDS_PER_GAME+' twins spotted (streak '+store.streak+')\nPlay: https://hoops.dumbmodel.com/play/era-crossed.html';
}
function shareCard(){
  var W=1080,H=1350,c=document.createElement('canvas');c.width=W;c.height=H;
  var x=c.getContext('2d');
  x.fillStyle='#FCFBF7';x.fillRect(0,0,W,H);
  x.strokeStyle='#232323';x.lineWidth=18;x.strokeRect(10,10,W-20,H-20);
  x.fillStyle='#232323';x.fillRect(0,0,W,110);
  x.fillStyle='#FCFBF7';x.font='700 30px ui-monospace,monospace';
  x.fillText('VECTOR HOOPS \u00B7 ERA CROSSED',36,48);
  x.font='700 22px ui-monospace,monospace';x.fillStyle='#E7E4DA';
  x.fillText('past star \u2192 closest modern twin \u00B7 64-d embedding',36,84);
  x.fillStyle='#E0483B';x.font='800 44px ui-sans-serif,system-ui';
  x.fillText(score+'/'+ROUNDS_PER_GAME+' twins spotted',48,220);
  x.fillStyle='#232323';x.font='700 30px ui-monospace,monospace';
  var y=320;
  order.forEach(function(r,i){
    var mark=r.hit?'\u2713':'\u2717';
    x.fillStyle=r.hit?'#8A9A8B':'#E0483B';
    x.fillText(mark,48,y);
    x.fillStyle='#232323';
    var label=(i+1)+'. '+r.a+' \u2192 '+(r.o.filter(function(o){return o.correct;})[0]||{}).n;
    if(label.length>44)label=label.slice(0,43)+'\u2026';
    x.fillText(label,110,y);
    y+=62;
  });
  x.fillStyle='#57574F';x.font='700 26px ui-monospace,monospace';
  x.fillText('Streak '+store.streak+' \u00B7 best '+store.best+'/'+ROUNDS_PER_GAME,48,y+20);
  x.fillStyle='#232323';x.font='700 30px ui-monospace,monospace';
  x.fillText('hoops.dumbmodel.com/play/era-crossed.html',48,H-90);
  x.font='700 22px ui-monospace,monospace';x.fillStyle='#6E6E66';
  x.fillText('Free \u00B7 No account \u00B7 No ads \u00B7 Real data only',48,H-52);
  return c;
}
$('btn-share').addEventListener('click',function(){
  try{
    var c=shareCard(),a=document.createElement('a');
    a.download='era-crossed-score.png';a.href=c.toDataURL('image/png');a.click();
    toast('Share card downloaded');
  }catch(e){toast('Could not make the card \u2014 use Copy text');}
});
$('btn-copy').addEventListener('click',function(){
  var t=shareText();
  function done(){toast('Score copied \u2014 paste it anywhere');}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){fallback();});}
  else fallback();
  function fallback(){var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done();}catch(e){toast('Copy failed \u2014 sorry');}ta.remove();}
});

/* ---------- wiring ---------- */
$('btn-next').addEventListener('click',function(){
  ri++;
  if(ri>=order.length){finish();return;}
  round();
});
$('btn-again').addEventListener('click',newGame);
$('btn-retry').addEventListener('click',function(){$('err-card').hidden=true;boot(curGame||1);});
document.addEventListener('keydown',function(e){
  if($('done-card').hidden===false||$('err-card').hidden===false||$('round-card').hidden)return;
  var tag=(e.target&&e.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select'||e.target.isContentEditable)return;
  var n=parseInt(e.key,10);
  if(n>=1&&n<=4){
    var b=$('opts').querySelectorAll('.opt')[n-1];
    if(b&&!b.disabled)b.click();
  }
});
function boot(n){
  curGame=n;
  fetch(gameURL(n)).then(function(r){if(!r.ok)throw new Error('quiz '+r.status);return r.json();})
  .then(function(doc){
    if(!doc.rounds||!doc.rounds.length)throw new Error('empty quiz');
    Q=doc;deal();
  }).catch(function(){
    $('round-card').hidden=true;$('err-card').hidden=false;
  });
}
function newGame(){
  var n;do{n=1+Math.floor(Math.random()*GAME_COUNT);}while(n===curGame&&GAME_COUNT>1);
  $('err-card').hidden=true;$('done-card').hidden=true;boot(n);
}
boot(1+Math.floor(Math.random()*GAME_COUNT));
})();
