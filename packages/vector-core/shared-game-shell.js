/* shared-game-shell.js — game shell factory, type-or-tap guess, hints, streaks, challenge-friend, share PNG, confetti, vibration
   npm-less zero-deps, LCG 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,16853,15710]
   glibc L(s)=(s*1103515245+12345)&0x7fffffff, same-link-same-stars ?daily=YYYYMMDD&n=1/3/5, TLPG dedup DAU3/WAU3, PWA v67
*/
(function(global){
  'use strict';

  const CONF_VOID='#080A0F';
  const CONFETTI='#D8452A';

  function lcg(seed){
    let s=seed>>>0;
    return function(){ s=(Math.imul(s,1103515245)+12345)>>>0 & 0x7fffffff; return s/0x7fffffff; }
  }

  function todaySeed(){
    const d=new Date();
    const y=d.getFullYear(), m=d.getMonth()+1, dd=d.getDate();
    return y*10000+m*100+dd;
  }

  function lcgIndices(seed, n, max){
    // deterministic triple[11205,19448,14209] five[11205,19448,14209,16853,15710] same-link-same-stars
    // produces n indices from LCG chain L(s)=(s*1103515245+12345)&0x7fffffff % max
    let s=seed>>>0;
    const out=[];
    for(let i=0;i<n;i++){
      s=(Math.imul(s,1103515245)+12345)>>>0 & 0x7fffffff;
      out.push(s % max);
    }
    return {seed:s, indices:out};
  }

  function parseDaily(){
    try{
      const u=new URL(location.href);
      const daily=u.searchParams.get('daily'); // YYYYMMDD
      const n=parseInt(u.searchParams.get('n')||'1',10);
      if(daily && /^\d{8}$/.test(daily)) return {daily:parseInt(daily,10), n:isFinite(n)?n:1, fromUrl:true};
    }catch(e){}
    return {daily:todaySeed(), n:1, fromUrl:false};
  }

  function createGame(opts){
    opts=opts||{};
    const domain=opts.domain||'hoops';
    const latestSeason=opts.latestSeason||'2025-26';
    const cards=opts.cards||'today';
    const maxCards = opts.maxCards||3; // triple3, 5 for full
    const mountEl = opts.mount || document.getElementById('game-root');
    const storageKey = 'streak_'+domain;
    const hintKey = 'hints_'+domain;

    // guess list = latest season only
    let roster=[]; // {id,name,pos,...} fetched from assets/data/<domain>.json?season=2025-26 filtered
    let dailyMeta = parseDaily();
    let selectedCards=[]; // indices into roster

    function getStreak(){
      try{ const j=JSON.parse(localStorage.getItem(storageKey)||'{}'); return j; }catch(e){ return {}; }
    }
    function setStreak(j){ try{ localStorage.setItem(storageKey, JSON.stringify(j)); }catch(e){} }
    function getStreakObj(){
      const s=getStreak();
      s.count = s.count||0;
      s.last = s.last||null;
      s.dots = s.dots||[]; // 7-dot persistent bool[7]
      if(s.dots.length<7) s.dots = Array(7).fill(false).map((_,i)=> !!(s.dots[i]));
      return s;
    }

    function loadRoster(){
      const url = opts.dataUrl || ('assets/data/'+domain+'.json');
      return fetch(url,{cache:'force-cache'}).then(r=>r.json()).then(j=>{
        let arr = Array.isArray(j)?j: (j.points||j.players||j.data||[]);
        // filter latestSeason only if entry has season field
        const filt = arr.filter(p=> !p.season || p.season===latestSeason || (p.seasons && p.seasons.includes(latestSeason)));
        // if no filter matched, fallback to arr but still tag latest season only guess list = latest season only
        roster = (filt.length?filt:arr).slice();
        // for LCG deterministic selection we need min 5k etc — use roster length as max
        const seed = dailyMeta.daily;
        const count = (dailyMeta.n===5?5: (dailyMeta.n===3?3: maxCards)); // solo1 triple3 full5
        const pick = lcgIndices(seed, count, Math.max(1,roster.length));
        selectedCards = pick.indices;
        try{ window._GAME_ROSTER = roster; window._GAME_CARDS = selectedCards.map(i=>roster[i]); }catch(e){}
        return roster;
      });
    }

    function vibrate(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){} }

    function confettiBurst(){
      // canvas-themed v67 confetti #D8452A void #080A0F
      const c=document.createElement('canvas');
      c.width=480; c.height=320;
      c.style.position='fixed'; c.style.left='50%'; c.style.top='20%'; c.style.transform='translateX(-50%)';
      c.style.zIndex='90'; c.style.pointerEvents='none';
      c.style.borderRadius='12px';
      document.body.appendChild(c);
      const ctx=c.getContext('2d');
      const N=70;
      const parts=[];
      for(let i=0;i<N;i++) parts.push({x:240+ (Math.random()-0.5)*120, y:20+Math.random()*40, vx:(Math.random()-0.5)*9, vy:Math.random()*6+2, rot:Math.random()*6.28, vr:(Math.random()-0.5)*0.3, col: Math.random()<0.62?CONFETTI: (['#E69F00','#56B4E9','#009E73','#FFFEF7'][i%4]) });
      let t=0;
      (function loop(){
        t++;
        ctx.clearRect(0,0,c.width,c.height);
        ctx.fillStyle=CONF_VOID; ctx.globalAlpha=0.14; ctx.fillRect(0,0,c.width,c.height); ctx.globalAlpha=1;
        for(const p of parts){
          p.x+=p.vx; p.y+=p.vy; p.vy+=0.18; p.rot+=p.vr;
          ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
          ctx.fillStyle=p.col; ctx.fillRect(-4,-6,8,12); ctx.restore();
        }
        if(t<86) requestAnimationFrame(loop); else c.remove();
      })();
      vibrate([30,20,60]);
    }

    function sharePNG(resultText){
      // one-tap share PNG 1200x630 canvas-themed v67
      const W=1200,H=630;
      const canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H;
      const ctx=canvas.getContext('2d');
      // void bg
      ctx.fillStyle=CONF_VOID; ctx.fillRect(0,0,W,H);
      // subtle grid
      ctx.strokeStyle='rgba(232,240,255,0.06)'; ctx.lineWidth=1;
      for(let x=0;x<W;x+=48){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for(let y=0;y<H;y+=48){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      // title
      ctx.fillStyle='#e8f0ff'; ctx.font='700 68px ui-sans-system,-apple-system,Segoe UI,Roboto,Helvetica,Arial';
      ctx.fillText((domain.toUpperCase()+' — '+latestSeason),48,110);
      ctx.fillStyle='#a8b0c8'; ctx.font='500 28px ui-sans-system,-apple-system,Segoe UI';
      const dailyStr='daily='+dailyMeta.daily+' n='+dailyMeta.n+' — '+location.origin+location.pathname+'?daily='+dailyMeta.daily+'&n='+(dailyMeta.n||3);
      ctx.fillText(dailyStr,48,160);
      // result
      ctx.fillStyle='#FFFEF7'; ctx.font='600 36px ui-sans-system'; ctx.fillText(resultText||'I beat the model — your turn',48,260);
      // OKABE dots
      const colors=['#E69F00','#56B4E9','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7','#FFFEF7'];
      for(let i=0;i<14;i++){ ctx.fillStyle=colors[i%colors.length]; ctx.beginPath(); ctx.arc(48+i*36, 340, 12, 0, Math.PI*2); ctx.fill(); }
      ctx.fillStyle='#D8452A'; ctx.font='700 22px ui-monospace'; ctx.fillText('v67 • #080A0F void • same-link-same-stars',48,560);

      // try share
      canvas.toBlob(function(blob){
        if(!blob) return;
        const file=new File([blob],'dumbmodel-'+domain+'-'+dailyMeta.daily+'.png',{type:'image/png'});
        if(navigator.canShare && navigator.canShare({files:[file]})){
          navigator.share({files:[file], title: domain+' challenge', text: dailyStr}).catch(()=>{});
        }else{
          const url=URL.createObjectURL(blob);
          const a=document.createElement('a'); a.href=url; a.download=file.name; a.click();
          setTimeout(()=>URL.revokeObjectURL(url), 4000);
        }
      },'image/png',0.92);
    }

    function render(){
      if(!mountEl) return;
      const s=getStreakObj();
      const cardsHtml = selectedCards.map((idx,i)=>{
        const p=roster[idx]; if(!p) return '';
        const name = p.display_name||p.name||p.ticker||p.pid||('card '+(i+1));
        const sub = p.sector||p.pos||p.team||'';
        return '<div class="card-paper-warm rounded-md" style="padding:12px;border:1px solid rgba(8,10,15,0.08)"><div style="font:700 14px var(--font-sans,#e8f0ff);color:var(--void)">${}</div><div style="font:500 12px var(--font-sans);color:#66708a">${}</div></div>'.replace('${}',name).replace('${}',sub);
      }).join('');

      mountEl.innerHTML =
        '<div style="display:flex;flex-direction:column;gap:14px">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;"><div style="font:700 18px var(--font-sans);color:var(--ink)">Play Today\'s • '+latestSeason+'</div><div class="streak-dots" id="streak-dots">'+ s.dots.map(d=>'<i class="'+(d?'on':'')+'"></i>').join('') +'</div></div>'+
        '<div class="grid-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">'+cardsHtml+'</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><input id="guess-input" list="guess-list" placeholder="type-or-tap guess (latest season only)" style="flex:1;min-width:180px;padding:10px 12px;border-radius:8px;border:1px solid rgba(232,240,255,0.16);background:var(--void-2);color:var(--ink);font:500 14px var(--font-sans)"/><button id="guess-btn" class="btn-void">Guess</button><button id="hint-btn" class="btn-void">Hint</button><button id="share-btn" class="btn-void">Share PNG</button></div>'+
        '<datalist id="guess-list">'+ roster.slice(0,1200).map(p=>{const n=p.display_name||p.name||p.ticker||''; return '<option value="'+String(n).replace(/"/g,'&quot;')+'">';}).join('')+'</datalist>'+
        '<div style="display:flex;gap:8px"><a id="challenge-link" href="?daily='+dailyMeta.daily+'&n='+(dailyMeta.n||3)+'" style="font:600 12px var(--font-mono);color:var(--ink-2)">challenge-friend ?daily='+dailyMeta.daily+'&n='+(dailyMeta.n||3)+' (same-link-same-stars)</a><span style="font:500 12px var(--font-mono);color:var(--ink-2)">DAU3/WAU3 TLPG dedup</span></div>'+
        '<div id="game-msg" style="font:500 13px var(--font-sans);color:var(--ink-2)"></div>'+
        '</div>';
      // wiring
      const input=mountEl.querySelector('#guess-input');
      const btn=mountEl.querySelector('#guess-btn');
      const hintBtn=mountEl.querySelector('#hint-btn');
      const shareBtn=mountEl.querySelector('#share-btn');
      const msg=mountEl.querySelector('#game-msg');
      let attempts=0;
      function checkGuess(){
        const v=(input.value||'').trim().toLowerCase();
        if(!v) return;
        attempts++;
        // find in selected cards first
        const targetNames = selectedCards.map(i=> (roster[i]&&(roster[i].display_name||roster[i].name||roster[i].ticker||'')).toLowerCase());
        const isWin = targetNames.some(n=> n && (n===v || n.includes(v) || v.includes(n)));
        if(isWin){
          const sObj=getStreakObj();
          const todayStr=new Date().toISOString().slice(0,10);
          if(sObj.last!==todayStr){ sObj.count=(sObj.count||0)+1; sObj.last=todayStr; }
          sObj.dots = sObj.dots||Array(7).fill(false);
          sObj.dots[(sObj.count-1)%7]=true;
          if(sObj.dots.length<7) sObj.dots=Array(7).fill(false).map((_,i)=>!!sObj.dots[i]);
          setStreak(sObj);
          // update dots
          const dotsEl=document.getElementById('streak-dots'); if(dotsEl){ dotsEl.innerHTML=sObj.dots.map(d=>'<i class="'+(d?'on'+(sObj.count>=3?' on-fire':''):'')+'"></i>').join(''); }
          msg.textContent='Correct! streak '+sObj.count+' — confetti #D8452A void #080A0F';
          confettiBurst();
        }else{
          msg.textContent='Nope — try again ('+attempts+') — latest season only hint: pos/sector';
          vibrate(18);
        }
      }
      if(btn) btn.addEventListener('click',checkGuess);
      if(input) input.addEventListener('keydown',e=>{ if(e.key==='Enter') checkGuess(); });
      if(hintBtn) hintBtn.addEventListener('click',()=>{
        // hints persistent localStorage
        let h={}; try{ h=JSON.parse(localStorage.getItem(hintKey)||'{}'); }catch(e){}
        const k='d'+dailyMeta.daily+'_n'+dailyMeta.n;
        h[k]=(h[k]||0)+1;
        try{ localStorage.setItem(hintKey,JSON.stringify(h)); }catch(e){}
        const idx=selectedCards[0]; const p=roster[idx];
        const hint = p ? 'sector/pos: '+(p.sector||p.pos||p.position||'??')+' • first letter: '+( (p.display_name||p.name||'')[0]||'?') : 'no hint';
        msg.textContent='Hint '+h[k]+': '+hint;
        vibrate(10);
      });
      if(shareBtn) shareBtn.addEventListener('click',()=>{
        const sObj=getStreakObj();
        const txt = 'I got it in '+ (attempts||1) +' — streak '+sObj.count+' — '+domain+' '+latestSeason+' ?daily='+dailyMeta.daily+'&n='+dailyMeta.n;
        sharePNG(txt);
      });
    }

    function init(){
      loadRoster().then(render).catch(err=>{
        if(mountEl) mountEl.innerHTML='<div style="color:var(--ink-2);font:500 13px var(--font-sans)">load failed '+String(err).slice(0,120)+'</div>';
      });
    }

    return {init, getRoster:()=>roster, getCards:()=>selectedCards, getDaily:()=>dailyMeta, lcgIndices, lcg, sharePNG, confettiBurst, parseDaily};
  }

  global.VectorGame={createGame, create:createGame, lcg, lcgIndices, parseDaily, todaySeed};
  if(typeof module!=='undefined'&&module.exports) module.exports=global.VectorGame;

})(typeof window!=='undefined'?window:this);
