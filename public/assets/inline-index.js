/* --- extracted from index.html (inline block) (pure move; no behavior change) --- */
if('serviceWorker' in navigator){ window.addEventListener('load', function(){ navigator.serviceWorker.register('/sw.js').catch(function(){}); }); }

/* --- extracted from index.html (inline block) (pure move; no behavior change) --- */
/* Today strip: read the one unified streak record (vh.streak.v2, written by
   Daily Court + Daily Triple via past-modern-game.js). Legacy fallback to the
   retired Everyday game's vh_weekStreak until Play migrates it on next visit. */
(function(){ try{
  var wEl=document.getElementById('today-world');
  if(wEl){ var iso=new Date().toISOString().slice(0,10); wEl.textContent=parseInt(iso.slice(5,7),10)+'-'+iso.slice(8,10); }
  var el=document.getElementById('today-streak'); if(!el) return;
  var rec=null;
  try{ rec=JSON.parse(localStorage.getItem('vh.streak.v2')||'null'); }catch(e){}
  if(!rec){ try{ var w=JSON.parse(localStorage.getItem('vh_weekStreak')||'null'); if(w&&w.streak) rec={streak:w.streak,lastPlayedDay:w.last||null}; }catch(e){} }
  if(rec&&rec.streak>0&&rec.lastPlayedDay){
    var today=new Date().toISOString().slice(0,10);
    var d=Math.round((new Date(today+'T00:00:00Z')-new Date(rec.lastPlayedDay+'T00:00:00Z'))/86400000);
    if(d===0) el.textContent='Your streak: '+rec.streak+(rec.streak===1?' day':' days')+' — solve 1 to keep it alive.';
    else if(d===1) el.textContent='Your streak: '+rec.streak+(rec.streak===1?' day':' days')+' — play today to extend it.';
  }
}catch(e){} })();
