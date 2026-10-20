/* viral-share.js — share cards (Daily Court, past-modern, chimera, universe) */
(function(){
  'use strict';
  /* Shared confirmation toast for every share gesture (Lane A: the share
   * loop must visibly land — SHARE taps here get a visible response in
   * <=1s. NOTE: showToast's visible styling lives in play.html's <style>
   * (.vh-toast); without it the element exists but is invisible. */
  function showToast(msg){
    try{
      var t=document.getElementById('vh-toast');
      if(!t){ t=document.createElement('div'); t.id='vh-toast'; t.className='vh-toast'; t.setAttribute('role','status'); document.body.appendChild(t); }
      t.textContent=msg; t.classList.add('is-visible');
      clearTimeout(showToast._t);
      showToast._t=setTimeout(function(){ t.classList.remove('is-visible'); }, 2600);
    }catch(e){}
  }
  function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function drawTeamCard(abbr,titleLine,metaLine){
    var W=1080,H=1080; var canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H; var ctx=canvas.getContext('2d');
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H); ctx.strokeStyle='#1A150F'; ctx.lineWidth=16; ctx.strokeRect(8,8,W-16,H-16);
    ctx.fillStyle='#1A150F'; ctx.fillRect(W-12,20,12,H-20); ctx.fillRect(20,H-12,W-20,12);
    var teamColor='#E03A3E'; try{var a=document.querySelector('.city-pill.is-active'); if(a&&a.dataset&&a.dataset.color) teamColor=a.dataset.color;}catch(e){}
    ctx.fillStyle='#F0E442'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=6; var px=48,py=52,pw=520,ph=56,rr=28; roundedRect(ctx,px,py,pw,ph,rr); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#111'; ctx.font='900 28px ui-monospace,monospace'; ctx.fillText('LIVE UNIVERSE \u00B7 12,966 seasons',px+22,py+36);
    ctx.fillStyle='#111'; ctx.font='950 78px ui-sans-serif'; ctx.fillText((abbr||'CHI')+' UNIVERSE',48,200);
    ctx.font='900 42px ui-sans-serif'; ctx.fillStyle='#D55E00'; ctx.fillText((titleLine||'Scoring Vol Focus').slice(0,48),48,260);
    ctx.fillStyle='#111'; ctx.font='700 28px ui-monospace,monospace'; ctx.fillText(metaLine||'1,234 of 12,966 in focus',48,310);
    ctx.fillStyle='#E8E8E8'; ctx.fillRect(48,360,W-96,380);
    ctx.fillStyle='#0072B2'; for(var i=0;i<180;i++){var x=48+Math.random()*(W-96),y=360+Math.random()*380; ctx.beginPath();ctx.arc(x,y,3+Math.random()*3,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle=teamColor; for(var j=0;j<50;j++){var x2=48+W/2+(Math.random()-0.5)*260,y2=360+190+(Math.random()-0.5)*160; ctx.beginPath();ctx.arc(x2,y2,5,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#111'; ctx.font='900 34px ui-sans-serif'; ctx.fillText('Lock your team \u2192 universe lights up',48,820);
    ctx.font='700 26px ui-monospace'; ctx.fillStyle='#666'; ctx.fillText('hoops.dumbmodel.com/?team='+(abbr||'CHI'),48,860);
    ctx.fillStyle='#111'; ctx.font='900 22px ui-monospace'; ctx.fillText('Free \u00B7 No account \u00B7 No ads \u00B7 8 archetypes',48,900);
    ctx.strokeStyle='#111'; ctx.lineWidth=4; ctx.strokeRect(W-220,H-260,160,160); ctx.font='900 16px ui-monospace'; ctx.fillStyle='#111'; ctx.fillText('SCAN TO PLAY',W-216,H-280);
    return canvas;
  }
  function drawPastModernCard(opts){
    var W=1080, H=1350;
    var c=document.createElement('canvas'); c.width=W; c.height=H;
    var ctx=c.getContext('2d');
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=18; ctx.strokeRect(10,10,W-20,H-20);
    ctx.fillStyle='#1A150F'; ctx.fillRect(0,0,W,96);
    ctx.fillStyle='#fff'; ctx.font='900 28px ui-monospace,monospace';
    ctx.fillText('VECTOR HOOPS \u00B7 PAST\u2192MODERN',28,36);
    ctx.font='700 20px ui-monospace,monospace'; ctx.fillStyle='#F0E442';
    ctx.fillText('P#'+(opts.puzzleNum||'?')+' \u00B7 '+opts.dayKey+' \u00B7 12,966 AS 3D MAP',28,68);
    ctx.fillStyle='#111'; ctx.font='950 54px ui-sans-serif'; ctx.fillText((opts.pastName||'?')+' '+(opts.pastSeason||''),36,170);
    ctx.font='800 22px ui-monospace'; ctx.fillStyle='#555'; ctx.fillText('Past All-Star \u2192 Modern Twin?',36,205);
    var y=250;
    ctx.font='800 20px ui-monospace';
    (opts.guesses||[]).forEach(function(g){
      var simPct=Math.round(g.sim*100);
      var barW = Math.max(18, simPct*5.2);
      ctx.fillStyle = g.rank===0 ? '#e8f5e9' : (simPct>80 ? '#FFFEF7' : '#fafaf8');
      roundedRect(ctx,36,y,W-72,64,14); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=3; ctx.stroke();
      ctx.fillStyle='#111'; ctx.font='700 22px ui-monospace';
      var status = g.rank===0?'🟩': g.rank<=3?'🟨': g.rank<=10?'🟧':'⬜';
      ctx.fillText((opts.guesses.indexOf(g)+1)+'. '+status+' '+g.name.slice(0,18)+' '+g.season,48,y+24);
      ctx.fillStyle = g.rank===0 ? '#009E73' : '#0072B2';
      ctx.fillRect(48,y+32,barW,10);
      ctx.fillStyle='#111'; ctx.font='700 16px ui-monospace'; ctx.fillText(simPct+'% #'+(g.rank+1), 48+barW+12, y+40);
      y+=78;
    });
    if(y<520) y=520;
    ctx.fillStyle='#111'; ctx.font='900 26px ui-sans-serif';
    if(opts.won){
      ctx.fillText('Solved '+opts.guesses.length+'/6 \u2192 '+opts.answerName,36,y+30);
    }else if(opts.revealed){
      ctx.fillText('Answer: '+opts.answerName+' '+(opts.answerSim? Math.round(opts.answerSim*100)+'%':'') ,36,y+30);
    }else{
      ctx.fillText('Can you find the modern twin?',36,y+30);
    }
    ctx.font='600 16px ui-monospace'; ctx.fillStyle='#666';
    var insight = '64-d MTNN recall@10 0.846 \u00B7 PC1 paint\u2192perim PC2 load PC3 ball \u00B7 '+ (opts.streak?'streak '+opts.streak+' \u00B7 ':'') +'hoops.dumbmodel.com/play';
    ctx.fillText(insight.slice(0,92),36,y+60);
    ctx.fillStyle='#F0E442'; ctx.strokeStyle='#111'; ctx.lineWidth=4; roundedRect(ctx,36,H-140,W-72,76,18); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#111'; ctx.font='900 28px ui-sans-serif'; ctx.fillText('Play today: hoops.dumbmodel.com/play \u2192',56,H-92);
    ctx.font='700 14px ui-monospace'; ctx.fillStyle='#444'; ctx.fillText('12,966 seasons as rotating 3D map \u00B7 trends \u00B7 lab \u00B7 methods',36,H-28);
    return c;
  }


  async function sharePastModern(opts){
    try{
      var canvas=drawPastModernCard(opts);
      var blob=await new Promise(function(r){canvas.toBlob(function(b){r(b);},'image/png');});
      var file=new File([blob],'pastmodern-P'+opts.puzzleNum+'.png',{type:'image/png'});
      var grid=(opts.guesses||[]).map(function(g){ if(g.rank===0) return '🟩'; if(g.rank<=3) return '🟨'; if(g.rank<=10) return '🟧'; return '⬜'; }).join('');
      var score = opts.won ? opts.guesses.length+'/6' : 'X/6';
      var text='Vector Hoops Past→Modern P#'+opts.puzzleNum+' '+score+' '+grid+'\nPast '+opts.pastName+' '+opts.pastSeason+' → '+(opts.won? opts.guesses.slice(-1)[0].name+' 🎯' : 'modern twin?')+'\n'+(opts.streak?'🔥 streak '+opts.streak+' · ':'')+'12,966 as 3D map \nhoops.dumbmodel.com/play?day='+opts.dayKey;
      if(navigator.canShare && navigator.canShare({files:[file]})){
        await navigator.share({title:'Vector Hoops P#'+opts.puzzleNum,text:text,files:[file]});
        return true;
      }
      if(navigator.share){
        try{ await navigator.share({title:'Past→Modern P#'+opts.puzzleNum,text:text,url:opts.url}); return true; }catch(e){}
      }
      if(navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(text+'\n'+opts.url);
        return 'copied';
      }
    }catch(e){console.warn('sharePastModern fail',e);} return false;
  }
  async function shareUniverse(abbr,text,url,copiedEl){
    /* showToast is the module-scope toast now (exported on VHShare below) —
       calls inside this function resolve to it. */
    try{
      var titleEl=document.getElementById('team-universe-title'); var metaEl=document.getElementById('team-universe-meta');
      var titleLine=titleEl?titleEl.textContent:abbr+' universe'; var metaLine=metaEl?metaEl.textContent.replace(/\s+/g,' ').trim().slice(0,80):'';
      var canvas=drawTeamCard(abbr,titleLine,metaLine); var blob=await new Promise(function(res){canvas.toBlob(function(b){res(b);},'image/png');});
      var file=new File([blob],'vector-hoops-'+abbr+'.png',{type:'image/png'}); var shareText=text+'\n'+url;
      if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({title:'Vector Hoops — '+abbr+' Universe',text:shareText,files:[file]}); if(copiedEl){copiedEl.style.display='block'; copiedEl.textContent='Shared!'; setTimeout(function(){copiedEl.style.display='none';},2500);} showToast('🌌 '+abbr+' universe shared'); return;}
      if(navigator.share){try{await navigator.share({title:'Vector Hoops',text:shareText,url:url}); if(copiedEl){copiedEl.style.display='block'; setTimeout(function(){copiedEl.style.display='none';},2500);} showToast('Link shared — challenge friends'); return;}catch(e){}}
      if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(shareText); if(copiedEl){copiedEl.style.display='block'; copiedEl.textContent='Link copied! Challenge friends.'; setTimeout(function(){copiedEl.style.display='none';},2500);} showToast('Copied — '+abbr+' vs world → '+url); }
    }catch(e){console.warn('shareUniverse fail',e); if(copiedEl){copiedEl.style.display='block'; copiedEl.textContent='Copy: '+url;}}
  }
  function drawChimeraCard(puzzleNum,emojiRows,scoreText){
    var W=1080,H=1350; var c=document.createElement('canvas'); c.width=W; c.height=H; var ctx=c.getContext('2d');
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H); ctx.strokeStyle='#1A150F'; ctx.lineWidth=18; ctx.strokeRect(10,10,W-20,H-20);
    ctx.fillStyle='#1A150F'; ctx.fillRect(0,0,W,86); ctx.fillStyle='#fff'; ctx.font='900 32px ui-monospace,monospace'; ctx.fillText('VECTOR HOOPS - CHIMERA #'+(puzzleNum||'?'),28,54);
    ctx.fillStyle='#111'; ctx.font='950 64px ui-sans-serif'; ctx.fillText(scoreText||'Solved in 4',36,170);
    ctx.font='700 44px ui-monospace'; ctx.fillStyle='#111'; var lines=(emojiRows||'[]').split('\n'); for(var i=0;i<lines.length;i++){ctx.fillText(lines[i],36,230+i*58);}
    function tile(x,y,t){roundedRect(ctx,x,y,160,200,18); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=6; ctx.stroke(); ctx.fillStyle=t==='?'?'#111':(t==='A'?'#0072B2':'#D55E00'); ctx.font='950 64px ui-sans-serif'; ctx.fillText(t,x+56,y+122);}
    tile(36,500,'?'); ctx.fillStyle='#111'; ctx.font='900 48px ui-sans-serif'; ctx.fillText('+',220,620); tile(280,500,'?'); ctx.fillText('=',480,620); tile(540,500,'?');
    ctx.fillStyle='#111'; ctx.font='700 26px ui-monospace'; ctx.fillText('2023 JoKi\u010D + 1996 Rodman -> Wemby? 84.5%',36,780);
    ctx.font='700 24px ui-monospace'; ctx.fillStyle='#666'; ctx.fillText('12,966 seasons \u00B7 8 archetypes \u00B7 recall@10 0.846',36,820);
    ctx.fillStyle='#F0E442'; ctx.strokeStyle='#111'; ctx.lineWidth=4; roundedRect(ctx,36,860,W-72,72,18); ctx.fill(); ctx.stroke(); ctx.fillStyle='#111'; ctx.font='900 30px ui-sans-serif'; ctx.fillText('Play today: hoops.dumbmodel.com/play',56,906);
    return c;
  }
  async function shareChimera(puzzleNum,emojiRows,scoreText,url){
    try{
      var canvas=drawChimeraCard(puzzleNum,emojiRows,scoreText); var blob=await new Promise(function(r){canvas.toBlob(function(b){r(b);},'image/png');});
      var file=new File([blob],'chimera-'+puzzleNum+'.png',{type:'image/png'}); var text='Vector Hoops Chimera #'+puzzleNum+' — '+scoreText+'\n'+emojiRows+'\nhoops.dumbmodel.com/play';
      if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({title:'Vector Hoops #'+puzzleNum,text:text,files:[file]}); return true;}
      if(navigator.share){try{await navigator.share({title:'Chimera #'+puzzleNum,text:text,url:url}); return true;}catch(e){}}
      if(navigator.clipboard){await navigator.clipboard.writeText(text+'\n'+url); return true;}
    }catch(e){console.warn('shareChimera fail',e);} return false;
  }
  /* Wordle-style Daily Court result card: compact emoji grid, spoiler-free
     (no twin answers), streak hooked in. Web Share API with image when
     available, text share, clipboard, then legacy execCommand fallback. */
  async function shareDailyCourt(opts){
    opts=opts||{};
    var mode=opts.mode==='triple'?'triple':'court';
    var total=opts.total||(opts.pool?opts.pool.length:0)||(mode==='triple'?3:5);
    var label=mode==='triple'?'Daily Triple':'Daily Court';
    var solved=opts.solved||0;
    var guesses=opts.totalGuesses||0;
    var dayKey=opts.dayKey||'';
    var streak=(opts.streak!=null)?opts.streak:0;
    function slotEmoji(r){
      if(!r) return '⬜';
      var n=(r.count!=null?r.count:r.cnt);
      if(r.won) return n<=2?'🟩': n<=4?'🟨':'🟧';
      return '❌';
    }
    var grid=(opts.slotResults||[]).map(slotEmoji).join(' ');
    var head='🏀 Vector Hoops '+label+' — '+dayKey;
    var scoreLine=solved+'/'+total+' in '+guesses+' guess'+(guesses===1?'':'es');
    var streakLine=streak>0?('🔥 '+streak+'-day streak'):'';
    var url=opts.url||('https://hoops.dumbmodel.com/play?day='+dayKey+(mode==='triple'?'&mode=triple':'')+'&ref=share');
    /* Lane A: the Daily Court card text is built by the ledger (the ONLY
       scorer) when the caller passes it; the inline builder below stays as
       the fallback. Either way every shared URL carries ref=share so
       inbound plays are visible. */
    var text=opts.text||(head+'\n'+scoreLine+'\n'+grid+(streakLine?'\n'+streakLine:'')+'\nPlay the same '+(mode==='triple'?'triple':'court')+': '+url);
    var title=label+' '+dayKey;
    function legacyCopy(t){
      try{
        var ta=document.createElement('textarea'); ta.value=t; ta.setAttribute('readonly','');
        ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select();
        var ok=document.execCommand('copy'); ta.remove(); return ok;
      }catch(e){ return false; }
    }
    async function copyText(t){
      if(navigator.clipboard&&navigator.clipboard.writeText){
        try{ await navigator.clipboard.writeText(t); return 'copied'; }catch(e){}
      }
      if(legacyCopy(t)) return 'copied';
      try{ window.prompt('Copy your result:', t); return 'prompted'; }catch(e){}
      return false;
    }
    try{
      // canvas card (spoiler-free: slot numbers + status, no twin answers)
      var W=1080,H=1350; var c=document.createElement('canvas'); c.width=W; c.height=H; var ctx=c.getContext('2d');
      function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
      ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle='#1A150F'; ctx.lineWidth=18; ctx.strokeRect(10,10,W-20,H-20);
      ctx.fillStyle='#1A150F'; ctx.fillRect(0,0,W,110);
      ctx.fillStyle='#fff'; ctx.font='900 30px ui-monospace,monospace'; ctx.fillText('VECTOR HOOPS \u00B7 '+label.toUpperCase()+' '+total+'\u00D7',28,42);
      ctx.font='700 18px ui-monospace'; ctx.fillStyle='#F0E442'; ctx.fillText(dayKey+' \u00B7 SAME FOR EVERYONE \u00B7 '+solved+'/'+total+' \u00B7 '+guesses+' guesses',28,76);
      var y=150; ctx.fillStyle='#111'; ctx.font='900 36px ui-sans-serif';
      var crown=(solved>=total&&total>0)?' \u{1F3C6}':'';
      ctx.fillText(label+' — '+solved+'/'+total+crown,36,y); y+=46;
      ctx.font='700 16px ui-monospace'; ctx.fillStyle='#555'; ctx.fillText(total+' past All-Stars \u2192 '+total+' modern twins \u00B7 refresh can\'t reroll',36,y); y+=30;
      ctx.font='700 28px ui-monospace'; ctx.fillStyle='#111'; ctx.fillText(grid,36,y+20); y+=56;
      if(streak>0){ ctx.font='900 30px ui-sans-serif'; ctx.fillStyle='#D55E00'; ctx.fillText('\u{1F525} '+streak+'-day streak',36,y+34); y+=52; }
      (opts.pool||[]).forEach(function(p,i){
        var sd=(opts.slotResults||[])[i];
        var cnt=sd?(sd.count!=null?sd.count:sd.cnt):null;
        var status=!sd? '\u2B1C' : sd.won? '\u2705 '+cnt+'/6' : '\u274C '+cnt+'/6';
        y+=8;
        ctx.fillStyle = sd&&sd.won ? '#e8f5e9' : (!sd? '#fff' : '#fef4e8');
        rr(ctx,36,y,W-72,56,14); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=3; ctx.stroke();
        ctx.fillStyle='#111'; ctx.font='800 20px ui-sans-serif'; ctx.fillText((i+1)+'. '+status+' '+p.n+' '+p.s,48,y+34);
        y+=64;
        if(y>1050) return;
      });
      ctx.fillStyle='#F0E442'; ctx.strokeStyle='#111'; ctx.lineWidth=4; rr(ctx,36,H-110,W-72,70,18); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#111'; ctx.font='900 24px ui-sans-serif'; ctx.fillText('Play same '+(mode==='triple'?'triple':'court')+': '+String(url).replace(/^https?:\/\//,''),56,H-64);
      var blob=await new Promise(function(r){c.toBlob(function(b){r(b);},'image/png');});
      if(blob){
        var file=new File([blob],'daily-'+mode+'-'+dayKey+'.png',{type:'image/png'});
        if(navigator.canShare&&navigator.canShare({files:[file]})){
          await navigator.share({title:title,text:text,files:[file]}); return true;
        }
      }
    }catch(e){ console.warn('shareDailyCourt card fail',e); }
    try{
      if(navigator.share){ try{ await navigator.share({title:title,text:text,url:url}); return true; }catch(e){} }
      return await copyText(text);
    }catch(e){ console.warn('shareDailyCourt fail',e); }
    return false;
  }
  /* ---------- Map Hunt / Twin Hunt share card (opening-night overhaul) --------
   * opts: {mode ('MAP HUNT'|'TWIN HUNT'), dayKey, stars (0-3), taps, pct,
   *   name, season, twinName, twinSeason, twinSim (0-1|null), url}
   * Copy earns the share: score (stars+taps) + one surprising stat
   * (closeness percentile + the era twin across decades).
   */
  function mapHuntText(o){
    var twinBit = o.twinName ? ' Era twin: '+o.twinName+' ('+(o.twinSim*100).toFixed(0)+'% style match).' : '';
    return '\u{1F5FA}\uFE0F Vector Hoops '+o.mode+' '+o.dayKey+': '+'\u2605'.repeat(o.stars)+'\u2606'.repeat(3-o.stars)+
      ' \u2014 found '+o.name+' ('+o.season+') in '+o.taps+' taps on the 3D embedding map, closer than '+(+o.pct).toFixed(1)+
      '% of all 12,966 player-seasons.'+twinBit+' Play the same map: '+o.url;
  }
  function drawMapHuntCard(o){
    var W=1080,H=1350; var c=document.createElement('canvas'); c.width=W; c.height=H;
    var ctx=c.getContext('2d');
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=18; ctx.strokeRect(10,10,W-20,H-20);
    ctx.fillStyle='#1A150F'; ctx.fillRect(0,0,W,110);
    ctx.fillStyle='#fff'; ctx.font='900 30px ui-monospace,monospace';
    ctx.fillText('VECTOR HOOPS \u00B7 '+String(o.mode||'MAP HUNT'),28,44);
    ctx.font='700 18px ui-monospace,monospace'; ctx.fillStyle='#F0E442';
    ctx.fillText(String(o.dayKey||'')+' \u00B7 SAME MAP FOR EVERYONE \u00B7 12,966 SEASONS',28,78);
    var y=190;
    ctx.fillStyle='#111'; ctx.font='950 64px ui-sans-serif';
    ctx.fillText(String(o.name||'?'),36,y); y+=58;
    ctx.font='800 26px ui-monospace'; ctx.fillStyle='#555';
    ctx.fillText(String(o.season||''),36,y); y+=70;
    ctx.font='900 44px ui-sans-serif'; ctx.fillStyle='#111';
    ctx.fillText('\u2605'.repeat(o.stars||0)+'\u2606'.repeat(3-(o.stars||0)),36,y); y+=14;
    ctx.font='700 26px ui-monospace'; ctx.fillStyle='#D55E00';
    ctx.fillText('found in '+o.taps+' tap'+(o.taps===1?'':'s'),36,y+34); y+=76;
    /* percentile bar */
    ctx.fillStyle='#E8E8E8'; roundedRect(ctx,36,y,W-72,44,22); ctx.fill();
    var pw=Math.max(8,Math.min(1,(+o.pct||0)/100))*(W-72);
    ctx.fillStyle='#0072B2'; roundedRect(ctx,36,y,pw,44,22); ctx.fill();
    ctx.fillStyle='#111'; ctx.font='800 24px ui-monospace';
    ctx.fillText('closer than '+(+o.pct).toFixed(1)+'% of all player-seasons',36,y+76); y+=120;
    if(o.twinName){
      ctx.fillStyle='#111'; ctx.font='700 26px ui-monospace';
      var twin='Era twin: '+o.twinName+' ('+(o.twinSim*100).toFixed(0)+'% style match)';
      ctx.fillText(twin.slice(0,52),36,y); y+=44;
      ctx.fillStyle='#555'; ctx.font='700 22px ui-monospace';
      ctx.fillText('Same playing style, different decade.',36,y); y+=64;
    }
    ctx.fillStyle='#F0E442'; ctx.strokeStyle='#111'; ctx.lineWidth=4;
    roundedRect(ctx,36,H-150,W-72,92,20); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#111'; ctx.font='900 24px ui-monospace';
    ctx.fillText('Play the same map:',56,H-104);
    ctx.font='700 22px ui-monospace';
    ctx.fillText(String(o.url||'').replace(/^https?:\/\//,''),56,H-72);
    return c;
  }
  async function shareMapHunt(o){
    var title='Vector Hoops '+String(o.mode||'Map Hunt');
    var text=mapHuntText(o); var url=o.url;
    try{
      var canvas=drawMapHuntCard(o);
      var blob=await new Promise(function(r){c2b(canvas,r);});
      function c2b(cv,cb){ try{cv.toBlob(function(b){cb(b);},'image/png');}catch(e){cb(null);} }
      if(blob){
        var file=new File([blob],'map-hunt-'+o.dayKey+'.png',{type:'image/png'});
        if(navigator.canShare&&navigator.canShare({files:[file]})){
          await navigator.share({title:title,text:text,files:[file]}); return true;
        }
      }
    }catch(e){ console.warn('shareMapHunt card fail',e); }
    try{
      if(navigator.share){ try{ await navigator.share({title:title,text:text,url:url}); return true; }catch(e){} }
      return await copyTextFallback(text);
    }catch(e){ console.warn('shareMapHunt fail',e); }
    return false;
  }
  function copyTextFallback(text){
    return new Promise(function(resolve){
      try{
        if(navigator.clipboard&&navigator.clipboard.writeText){
          navigator.clipboard.writeText(text).then(function(){showToast('Result copied.');resolve(true);},function(){resolve(false);}); return;
        }
        var ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta);
        ta.select(); var ok=false; try{ok=document.execCommand('copy');}catch(e){}
        document.body.removeChild(ta); showToast(ok?'Result copied.':'Copy failed.'); resolve(ok);
      }catch(e){ resolve(false); }
    });
  }
  window.VHShare={showToast:showToast,shareUniverse:shareUniverse,shareChimera:shareChimera,sharePastModern:sharePastModern,drawTeamCard:drawTeamCard,drawChimeraCard:drawChimeraCard,drawPastModernCard:drawPastModernCard,shareDailyCourt:shareDailyCourt,shareMapHunt:shareMapHunt,drawMapHuntCard:drawMapHuntCard,mapHuntText:mapHuntText};
})();
