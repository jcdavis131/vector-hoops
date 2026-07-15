/* viral-share.js — share cards for team universe & chimera
 * Solo personal project, no connection to employer, built with public/free-tier only
 * Zero deps, canvas-based for 10M DAU virality: generates 1080x1080 team card + Web Share API files.
 */
(function(){
  'use strict';
  function getTeamMeta(abbr){
    try{
      // try to read from window teams? fallback
      var teamsRaw = localStorage.getItem('vectorHoops.teamsCache');
      if(teamsRaw){ var arr=JSON.parse(teamsRaw); var f=arr.find(function(t){return t.abbr===abbr;}); if(f) return f; }
    }catch(e){}
    return {abbr:abbr, primary:'#E03A3E', secondary:'#fff', city:abbr};
  }

  function drawTeamCard(abbr, titleLine, metaLine){
    var W=1080, H=1080;
    var canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H;
    var ctx=canvas.getContext('2d');
    // paper
    ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H);
    // ink border 8px
    ctx.strokeStyle='#1A150F'; ctx.lineWidth=16; ctx.strokeRect(8,8,W-16,H-16);
    // shadow offset 12
    ctx.fillStyle='#1A150F'; ctx.fillRect(20+W-16-12, 20, 12, H-16); ctx.fillRect(20, 20+H-16-12, W-16, 12);
    // accent top bar team color
    var teamColor='#E03A3E';
    try{
      var select=document.getElementById('landing-favorite-select');
      if(select){ /* leave */ }
    }catch(e){}
    // Try to get from page pill active
    try{
      var active=document.querySelector('.city-pill.is-active');
      if(active && active.dataset && active.dataset.color) teamColor=active.dataset.color;
    }catch(e){}

    // header yellow pill
    ctx.fillStyle='#F0E442'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=6;
    var pillX=48, pillY=52, pillW=520, pillH=56, r=28;
    // rounded rect
    ctx.beginPath(); ctx.moveTo(pillX+r, pillY); ctx.arcTo(pillX+pillW, pillY, pillX+pillW, pillY+pillH, r); ctx.arcTo(pillX+pillW, pillY+pillH, pillX, pillY+pillH, r); ctx.arcTo(pillX, pillY+pillH, pillX, pillY, r); ctx.arcTo(pillX, pillY, pillX+pillW, pillY, r); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#111'; ctx.font='900 28px ui-monospace, monospace'; ctx.fillText('LIVE UNIVERSE · 12,966 seasons', pillX+22, pillY+36);

    ctx.fillStyle='#111';
    ctx.font='950 78px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
    var line1 = (abbr||'CHI')+' UNIVERSE';
    ctx.fillText(line1, 48, 200);
    ctx.font='900 42px ui-sans-serif, system-ui';
    ctx.fillStyle='#D55E00';
    var line2 = titleLine || 'Scoring Vol Focus';
    ctx.fillText(line2.slice(0,48), 48, 260);

    ctx.fillStyle='#111';
    ctx.font='700 28px ui-monospace, monospace';
    ctx.fillText(metaLine || '1,234 of 12,966 in focus · 9% sky', 48, 310);

    // big dot cloud mock
    ctx.fillStyle='#E8E8E8'; ctx.fillRect(48, 360, W-96, 380);
    ctx.fillStyle='#0072B2'; for(var i=0;i<180;i++){ var x=48+Math.random()*(W-96), y=360+Math.random()*380; ctx.beginPath(); ctx.arc(x,y,3+Math.random()*3,0,Math.PI*2); ctx.fill(); }
    // highlight focus color
    ctx.fillStyle=teamColor; for(var j=0;j<50;j++){ var x2=48+W/2+ (Math.random()-0.5)*260, y2=360+190+(Math.random()-0.5)*160; ctx.beginPath(); ctx.arc(x2,y2,5,0,Math.PI*2); ctx.fill(); }

    ctx.fillStyle='#111'; ctx.font='900 34px ui-sans-serif'; ctx.fillText('Lock your team → universe lights up', 48, 820);
    ctx.font='700 26px ui-monospace'; ctx.fillStyle='#666'; ctx.fillText('hoops.dumbmodel.com/?team='+ (abbr||'CHI'), 48, 860);
    ctx.fillStyle='#111'; ctx.font='900 22px ui-monospace'; ctx.fillText('Free · No account · No ads · 8 archetypes', 48, 900);
    ctx.fillStyle='#000'; ctx.font='900 18px ui-monospace'; ctx.fillText('Vector Hoops — 12,966 seasons as sky', 48, 980);

    // QR-ish placeholder
    ctx.strokeStyle='#111'; ctx.lineWidth=4; ctx.strokeRect(W-220, H-260, 160,160);
    ctx.font='900 16px ui-monospace'; ctx.fillStyle='#111'; ctx.fillText('SCAN TO PLAY', W-216, H-280);

    return canvas;
  }

  async function shareUniverse(abbr, text, url, copiedEl){
    try{
      var titleEl=document.getElementById('team-universe-title');
      var metaEl=document.getElementById('team-universe-meta');
      var titleLine=titleEl?titleEl.textContent:abbr+' universe';
      var metaLine=metaEl?metaEl.textContent.replace(/\s+/g,' ').trim().slice(0,80):'';
      var canvas=drawTeamCard(abbr, titleLine, metaLine);
      var blob=await new Promise(function(res){ canvas.toBlob(function(b){res(b);}, 'image/png'); });
      var file=new File([blob], 'vector-hoops-'+abbr+'.png', {type:'image/png'});
      var shareText=text+'\n'+url;
      if(navigator.canShare && navigator.canShare({files:[file]})){
        await navigator.share({title:'Vector Hoops — '+abbr+' Universe', text:shareText, files:[file]});
        if(copiedEl){ copiedEl.style.display='block'; copiedEl.textContent='Shared!'; setTimeout(function(){copiedEl.style.display='none';},2500); }
        return;
      }
      if(navigator.share){
        try{ await navigator.share({title:'Vector Hoops', text:shareText, url:url}); if(copiedEl){copiedEl.style.display='block'; setTimeout(function(){copiedEl.style.display='none';},2500);} return; }catch(e){}
      }
      if(navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(shareText);
        if(copiedEl){ copiedEl.style.display='block'; copiedEl.textContent='Link copied! Challenge friends.'; setTimeout(function(){copiedEl.style.display='none';},2500); }
      }
    }catch(e){
      console.warn('shareUniverse fail',e);
      if(copiedEl){ copiedEl.style.display='block'; copiedEl.textContent='Copy: '+url; }
    }
  }

  window.VHShare={shareUniverse:shareUniverse, drawTeamCard:drawTeamCard};
})();
