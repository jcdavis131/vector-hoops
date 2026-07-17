/* viral-share.js — share cards for team universe & chimera
 * Zero deps, canvas-based for 10M DAU virality
 */
(function(){
  'use strict';
  function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function drawTeamCard(abbr,titleLine,metaLine){
    var W=1080,H=1080; var canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H; var ctx=canvas.getContext('2d');
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H); ctx.strokeStyle='#1A150F'; ctx.lineWidth=16; ctx.strokeRect(8,8,W-16,H-16);
    ctx.fillStyle='#1A150F'; ctx.fillRect(W-12,20,12,H-20); ctx.fillRect(20,H-12,W-20,12);
    var teamColor='#E03A3E'; try{var a=document.querySelector('.city-pill.is-active'); if(a&&a.dataset&&a.dataset.color) teamColor=a.dataset.color;}catch(e){}
    ctx.fillStyle='#F0E442'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=6; var px=48,py=52,pw=520,ph=56,rr=28; roundedRect(ctx,px,py,pw,ph,rr); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#111'; ctx.font='900 28px ui-monospace,monospace'; ctx.fillText('LIVE UNIVERSE \u00B7 12,966 seasons',px+22,py+36);
    ctx.fillStyle='#111'; ctx.font='950 78px ui-sans-serif,system-ui'; ctx.fillText((abbr||'CHI')+' UNIVERSE',48,200);
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
  function drawChimeraCard(puzzleNum,emojiRows,scoreText){
    var W=1080,H=1350; var c=document.createElement('canvas'); c.width=W; c.height=H; var ctx=c.getContext('2d');
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H); ctx.strokeStyle='#1A150F'; ctx.lineWidth=18; ctx.strokeRect(10,10,W-20,H-20);
    ctx.fillStyle='#1A150F'; ctx.fillRect(0,0,W,86); ctx.fillStyle='#fff'; ctx.font='900 32px ui-monospace,monospace'; ctx.fillText('VECTOR HOOPS - CHIMERA #'+(puzzleNum||'?'),28,54);
    ctx.fillStyle='#111'; ctx.font='950 64px ui-sans-serif'; ctx.fillText(scoreText||'Solved in 4',36,170);
    ctx.font='700 44px ui-monospace'; ctx.fillStyle='#111'; var lines=(emojiRows||'[]').split('\n'); for(var i=0;i<lines.length;i++){ctx.fillText(lines[i],36,230+i*58);}
    function tile(x,y,t){roundedRect(ctx,x,y,160,200,18); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=6; ctx.stroke(); ctx.fillStyle=t==='?'?'#111':(t==='A'?'#0072B2':'#D55E00'); ctx.font='950 64px ui-sans-serif'; ctx.fillText(t,x+56,y+122);}
    tile(36,500,'?'); ctx.fillStyle='#111'; ctx.font='900 48px ui-sans-serif'; ctx.fillText('+',220,620); tile(280,500,'?'); ctx.fillText('=',480,620); tile(540,500,'?');
    ctx.fillStyle='#111'; ctx.font='700 26px ui-monospace'; ctx.fillText('2023 JoKi\u010D + 1996 Rodman -> Wemby? 84.5%',36,780);
    ctx.font='700 24px ui-monospace'; ctx.fillStyle='#666'; ctx.fillText('12,966 seasons \u00B7 8 archetypes \u00B7 leakfree 0.977',36,820);
    ctx.fillStyle='#F0E442'; ctx.strokeStyle='#111'; ctx.lineWidth=4; roundedRect(ctx,36,860,W-72,72,18); ctx.fill(); ctx.stroke(); ctx.fillStyle='#111'; ctx.font='900 30px ui-sans-serif'; ctx.fillText('Play today: hoops.dumbmodel.com/play',56,906);
    return c;
  }
  async function shareUniverse(abbr,text,url,copiedEl){
    function showToast(msg){
      try{
        var t=document.getElementById('vh-toast');
        if(!t){ t=document.createElement('div'); t.id='vh-toast'; t.className='vh-toast'; document.body.appendChild(t); }
        t.textContent=msg; t.classList.add('is-visible');
        setTimeout(function(){ t.classList.remove('is-visible'); }, 2600);
      }catch(e){}
    }
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
  function drawPastModernCard(opts){
    var W=1080, H=1350;
    var c=document.createElement('canvas'); c.width=W; c.height=H;
    var ctx=c.getContext('2d');
    // paper
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H);
    // border
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=18; ctx.strokeRect(10,10,W-20,H-20);
    ctx.fillStyle='#1A150F'; ctx.fillRect(0,0,W,96);
    // title
    ctx.fillStyle='#fff'; ctx.font='900 28px ui-monospace,monospace';
    ctx.fillText('VECTOR HOOPS · PAST→MODERN',28,36);
    ctx.font='700 20px ui-monospace,monospace'; ctx.fillStyle='#F0E442';
    ctx.fillText('P#'+(opts.puzzleNum||'?')+' · '+opts.dayKey+' · 12,966 AS 3D MAP',28,68);
    // past hero
    ctx.fillStyle='#111'; ctx.font='950 54px ui-sans-serif'; ctx.fillText((opts.pastName||'?')+' '+(opts.pastSeason||''),36,170);
    ctx.font='800 22px ui-monospace'; ctx.fillStyle='#555'; ctx.fillText('Past All-Star → Modern Twin?',36,205);
    // guess grid rows
    var y=250;
    ctx.font='800 20px ui-monospace';
    (opts.guesses||[]).forEach(function(g,i){
      var simPct=Math.round(g.sim*100);
      var rankLabel = g.rank===0?'🎯':'#'+(g.rank+1);
      var barW = Math.max(18, simPct*5.2);
      // row bg
      ctx.fillStyle = g.rank===0 ? '#e8f5e9' : (simPct>80 ? '#FFFEF7' : '#fafaf8');
      roundedRect(ctx,36,y,W-72,64,14); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=3; ctx.stroke();
      // emoji status
      ctx.fillStyle='#111'; ctx.font='700 22px ui-monospace';
      var status = g.rank===0?'🟩': g.rank<=3?'🟨': g.rank<=10?'🟧':'⬜';
      ctx.fillText((i+1)+'. '+status+' '+g.name.slice(0,18)+' '+g.season,48,y+24);
      ctx.fillStyle = g.rank===0 ? '#009E73' : '#0072B2';
      ctx.fillRect(48,y+32,barW,10);
      ctx.fillStyle='#111'; ctx.font='700 16px ui-monospace'; ctx.fillText(simPct+'% '+rankLabel, 48+barW+12, y+40);
      y+=78;
    });
    if(y<520) y=520;
    // answer
    ctx.fillStyle='#111'; ctx.font='900 26px ui-sans-serif';
    if(opts.won){
      ctx.fillText('Solved '+opts.guesses.length+'/6 → '+opts.answerName,36,y+30);
    }else if(opts.revealed){
      ctx.fillText('Answer: '+opts.answerName+' '+(opts.answerSim? Math.round(opts.answerSim*100)+'%':'') ,36,y+30);
    }else{
      ctx.fillText('Can you find the modern twin?',36,y+30);
    }
    // insight line
    ctx.font='600 16px ui-monospace'; ctx.fillStyle='#666';
    var insight = '48-d MTNN recall@10 0.977 · PC1 paint→perim PC2 load PC3 ball · '+ (opts.streak?'streak '+opts.streak+' · ':'') +'hoops.dumbmodel.com/play';
    ctx.fillText(insight.slice(0,92),36,y+60);
    // CTA
    ctx.fillStyle='#F0E442'; ctx.strokeStyle='#111'; ctx.lineWidth=4; roundedRect(ctx,36,H-140,W-72,76,18); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#111'; ctx.font='900 28px ui-sans-serif'; ctx.fillText('Play today: hoops.dumbmodel.com/play →',56,H-92);
    // small
    ctx.font='700 14px ui-monospace'; ctx.fillStyle='#444'; ctx.fillText('12,966 seasons as rotating 3D map · trends · lab · methods',36,H-28);
    return c;
  }
  function drawPackCard(opts){
    var W=1080, H=1350;
    var c=document.createElement('canvas'); c.width=W; c.height=H; var ctx=c.getContext('2d');
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=18; ctx.strokeRect(10,10,W-20,H-20);
    ctx.fillStyle='#1A150F'; ctx.fillRect(0,0,W,110);
    ctx.fillStyle='#fff'; ctx.font='900 30px ui-monospace,monospace';
    ctx.fillText('VECTOR HOOPS · PACK CHALLENGE',28,42);
    ctx.font='700 20px ui-monospace,monospace'; ctx.fillStyle='#F0E442';
    var code = (opts.packCode|| (opts.ids?opts.ids.join('-'):'')).slice(0,36);
    ctx.fillText((opts.size||opts.packEntries.length||'?')+'-PACK · '+code+' · 12,966 MAP',28,76);
    // summary
    ctx.fillStyle='#111'; ctx.font='950 48px ui-sans-serif';
    var solved = opts.solved!=null? opts.solved : (opts.results? opts.results.filter(function(r){return r&&r.won;}).length : 0);
    var total = opts.totalGuesses!=null? opts.totalGuesses : (opts.results? opts.results.reduce(function(a,r){return a+(r?r.count:0);},0):0);
    var avg = opts.avg || (opts.size? (total/opts.size).toFixed(1) : '0');
    ctx.fillText(solved+'/'+(opts.size||'?')+' solved · '+total+' guesses · avg '+avg,36,170);
    // emoji grid
    ctx.font='700 24px ui-monospace'; ctx.fillStyle='#111';
    var entries = opts.packEntries||[];
    var results = opts.results||[];
    var y=220;
    entries.forEach(function(e,i){
      var r=results[i];
      var status = !r ? '⏳' : r.won ? '✅' : '❌';
      var count = r ? r.count+'/6' : '—';
      var barW = r ? Math.max(12, (r.won? 100 - r.count*12 : 60)) : 12;
      // row bg
      ctx.fillStyle = r && r.won ? '#e8f5e9' : r ? '#fef4e8' : '#fafaf8';
      roundedRect(ctx,36,y,W-72,68,14); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=3; ctx.stroke();
      ctx.fillStyle='#111'; ctx.font='800 22px ui-sans-serif';
      ctx.fillText(status+' '+(e.n+' '+e.s).slice(0,28),48,y+28);
      // bar
      ctx.fillStyle = r && r.won ? '#009E73' : '#D55E00';
      ctx.fillRect(48,y+36,barW*4,10);
      ctx.fillStyle='#111'; ctx.font='700 16px ui-monospace';
      ctx.fillText(count, 48+barW*4+12, y+44);
      // modern answer if exists? we only have past here, but add arch label via c maybe
      ctx.fillStyle='#666'; ctx.font='600 13px ui-monospace';
      ctx.fillText((e.s||'')+' · try modern twin', 48, y+60);
      y+=84;
      if(y>980) return;
    });
    // footer insight
    ctx.fillStyle='#111'; ctx.font='700 18px ui-monospace';
    var footerY = H-180;
    ctx.fillText('Can you beat this pack? Same All-Stars, share link challenge.',36,footerY);
    ctx.font='600 15px ui-monospace'; ctx.fillStyle='#444';
    ctx.fillText('12,966 as rotating map · past→modern · streak-safe packs',36,footerY+28);
    // CTA
    ctx.fillStyle='#F0E442'; ctx.strokeStyle='#111'; ctx.lineWidth=4; roundedRect(ctx,36,H-110,W-72,70,18); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#111'; ctx.font='900 26px ui-sans-serif'; ctx.fillText('Play pack: hoops.dumbmodel.com/play?pack='+code.slice(0,22),56,H-64);
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
  async function sharePack(opts){
    try{
      var canvas=drawPackCard(opts);
      var blob=await new Promise(function(r){canvas.toBlob(function(b){r(b);},'image/png');});
      var file=new File([blob],'pack-'+(opts.size||3)+'-'+(opts.packCode||'').slice(0,12)+'.png',{type:'image/png'});
      var ids = opts.ids || (opts.packEntries? opts.packEntries.map(function(e){return e.i;}) : []);
      var scores = (opts.results||[]).map(function(r){ return r ? (r.won? r.count:0) : 0; });
      var url = (location.origin||'https://hoops.dumbmodel.com') + '/play?pack=' + ids.join('-') + (scores.length? '&s='+scores.join('-'):'');
      var solved = opts.solved!=null? opts.solved : (opts.results? opts.results.filter(function(r){return r&&r.won;}).length : 0);
      var total = opts.totalGuesses!=null? opts.totalGuesses : (opts.results? opts.results.reduce(function(a,r){return a+(r?r.count:0);},0):0);
      var avg = opts.avg || (opts.size? (total/opts.size).toFixed(1) : '0');
      var gridEmoji = (opts.results||[]).map(function(r){ if(!r) return '⬜'; if(!r.won) return '❌'; if(r.count<=2) return '🟩🔥'; if(r.count<=4) return '🟩'; return '🟨'; }).join('');
      var lines = (opts.packEntries||[]).map(function(e,i){ var r=opts.results&&opts.results[i]; return (r&&r.won?'✅':'❌')+' '+e.n+' '+e.s+' '+(r?r.count+'/6':'—'); }).join('\n');
      var text='Vector Hoops Pack ('+(opts.size||'?')+') — '+solved+'/'+(opts.size||'?')+' in '+total+' guesses avg '+avg+' '+gridEmoji+'\n'+lines+'\nChallenge: '+url;
      if(navigator.canShare && navigator.canShare({files:[file]})){
        await navigator.share({title:'Vector Hoops Pack '+(opts.size||'?'), text:text, files:[file]});
        return true;
      }
      if(navigator.share){
        try{ await navigator.share({title:'Pack '+(opts.size||'3'), text:text, url:url}); return true; }catch(e){}
      }
      if(navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(text);
        return 'copied';
      }
    }catch(e){console.warn('sharePack fail',e);} return false;
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
  window.VHShare={shareUniverse:shareUniverse,shareChimera:shareChimera,sharePastModern:sharePastModern,drawTeamCard:drawTeamCard,drawChimeraCard:drawChimeraCard,drawPastModernCard:drawPastModernCard,drawPackCard:drawPackCard,sharePack:sharePack};
})();
