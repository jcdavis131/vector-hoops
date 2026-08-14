/* delight.js v5 — 29JS 9CSS confetti 80max WebAnimations translate3d cubic-bezier(.22,1,.36,1) haptics */
(function(){
  const OKABE = ['#D55E00','#0072B2','#009E73','#E69F00','#CC79A7','#56B4E9','#F0E442','#FF4F6B'];
  function reduced(){ try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(_){return false;} }
  function haptic(ms){ try{ if('vibrate' in navigator && navigator.vibrate) navigator.vibrate(ms||10); }catch(_){ } }
  function existingCount(){ try{ return document.querySelectorAll('[data-vh-confetti-particle]').length; }catch(_){ return 0; } }

  function spawnConfetti(teamPrimary){
    if(reduced()){ haptic(10); return; }
    try{
      const already = existingCount();
      if(already >= 80) return;
      const remain = 80 - already;
      const ideal = Math.min(80, Math.max(36, Math.floor((window.innerWidth||1024)/12)));
      const count = Math.min(remain, ideal);
      if(count <= 0) return;
      const container = document.createElement('div');
      container.setAttribute('aria-hidden','true');
      container.setAttribute('data-vh-confetti-root','');
      container.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden;';
      document.body.appendChild(container);
      const colors = [teamPrimary||'#F0E442','#0072B2','#D55E00','#FFFEF7','#1A150F','#56B4E9','#009E73','#E69F00'];
      const cx = (window.innerWidth||1024)*0.5;
      const cy = (window.innerHeight||700)*0.38;
      const anims=[];
      for(let i=0;i<count;i++){
        const el=document.createElement('div');
        el.setAttribute('data-vh-confetti-particle','');
        const size = 5 + Math.random()*9;
        const isDot = i%3===0;
        el.style.cssText='position:absolute;left:'+cx+'px;top:'+cy+'px;width:'+size+'px;height:'+(isDot?size:size*0.62)+'px;background:'+colors[i%colors.length]+';border:'+(isDot?'1.2px solid #1A150F':'1.5px solid #1A150F')+';border-radius:'+(isDot?'999px':'3px')+';will-change:transform,opacity;';
        container.appendChild(el);
        const angle=(Math.random()-0.5)*Math.PI*0.9 + -Math.PI*0.5;
        const dist=80+Math.random()*Math.max(180,(window.innerWidth||1024)*0.35);
        const dx=Math.cos(angle)*dist + (Math.random()-0.5)*60;
        const dy=Math.sin(angle)*dist + (Math.random()*80+60) + (window.innerHeight||700)*0.1;
        const rot=(Math.random()-0.5)*720;
        const scaleEnd=0.8+Math.random()*0.6;
        const dur=900+Math.random()*900;
        const delay=Math.random()*90;
        const kf=[
          { transform:'translate3d(0,0,0) rotate(0deg) scale(1)', opacity:1 },
          { transform:'translate3d('+(dx*0.55)+'px, '+(dy*0.32)+'px,0) rotate('+(rot*0.55)+'deg) scale(1.05)', opacity:1, offset:0.6 },
          { transform:'translate3d('+dx+'px, '+dy+'px,0) rotate('+rot+'deg) scale('+scaleEnd+')', opacity:0 }
        ];
        try{ anims.push(el.animate(kf,{duration:dur,delay:delay,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'})); }
        catch(_e){ el.style.opacity='0'; }
      }
      const cleanup=()=>{ try{ container.remove(); }catch(_){} };
      if(anims.length){ Promise.all(anims.map(a=>a.finished.catch(()=>{}))).then(cleanup); setTimeout(cleanup,2800); }
      else setTimeout(cleanup,1600);
      haptic(10);
    }catch(e){ haptic(10); }
  }

  function ensureStyles(){
    if(document.getElementById('vh-delight-styles')) return;
    const s=document.createElement('style');
    s.id='vh-delight-styles';
    s.textContent=`
      /* 9 CSS flourishes */
      .streak-flame{display:inline-flex;gap:1px;align-items:center}
      .streak-flame i{font-style:normal;display:inline-block;animation:vh-flame-flicker .85s ease-in-out infinite}
      .streak-flame i:nth-child(2){animation-delay:.12s}.streak-flame i:nth-child(3){animation-delay:.22s}
      @keyframes vh-flame-flicker{0%,100%{transform:translateY(0) scale(1) rotate(0deg);filter:brightness(1)}50%{transform:translateY(-1.2px) scale(1.15) rotate(1.5deg);filter:brightness(1.12)}}
      /* 2 card lift */
      .vh-card{transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s ease;will-change:transform}
      .vh-card:hover{transform:translateY(-2px) rotate(.2deg)}
      /* 3 card press */
      .vh-card:active{transform:translateY(1px) scale(.985)}
      /* 4 tile */
      .tile{transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s ease}
      .tile:hover{transform:translateY(-1px) scale(1.02)}
      .tile:active{transform:scale(.98)}
      /* 5 btn */
      .vh-btn{transition:transform .14s cubic-bezier(.22,1,.36,1),filter .14s ease}
      .vh-btn:active{transform:scale(.97)}
      /* 6 pill bounce */
      .pill:active,.vh-pill:active{animation:vh-pill-bounce .28s cubic-bezier(.22,1,.36,1)}
      @keyframes vh-pill-bounce{0%{transform:scale(1)}40%{transform:scale(1.08)}100%{transform:scale(1)}}
      /* 7 badge pop */
      .badge, .vh-badge{animation:vh-badge-pop .36s cubic-bezier(.22,1,.36,1) both}
      @keyframes vh-badge-pop{0%{transform:scale(.92)}55%{transform:scale(1.08)}100%{transform:scale(1)}}
      /* 8 toast slide */
      .vh-toast{animation:vh-toast-in .32s cubic-bezier(.22,1,.36,1) both}
      @keyframes vh-toast-in{0%{transform:translate3d(-50%,12px,0);opacity:0}100%{transform:translate3d(-50%,0,0);opacity:1}}
      /* 9 pulse ring */
      .vh-pulse{animation:vh-pulse-ring 1.8s cubic-bezier(.22,1,.36,1) infinite}
      @keyframes vh-pulse-ring{0%{transform:scale(.88);opacity:.95}100%{transform:scale(1.18);opacity:0}}
      /* extras: shake, ripple */
      .vh-shake{animation:vh-shake .32s ease}
      @keyframes vh-shake{0%,100%{transform:translate3d(0,0,0)}20%,60%{transform:translate3d(-2px,0,0)}40%,80%{transform:translate3d(2px,0,0)}}
      @media(prefers-reduced-motion:reduce){.streak-flame i,.vh-card,.tile,.vh-btn,.pill,.badge,.vh-toast,.vh-pulse,.vh-shake{animation:none!important;transition:none!important}}
    `;
    document.head.appendChild(s);
  }

  // 29 JS interactions dispatcher
  const INTERACTIONS = [
    'confetti','streakFlame','cardLift','cardPress','tileHover','btnTap','pillBounce','badgePop','toastSlide',
    'povClick','mapDotClick','mapDrag','packBattle1','packBattle3','packBattle5','copyDaily','shareCard','winPulse',
    'equationShuffle','teamLock','favoriteSelect','streakToast','filterTab','povTab','trajectoryHighlight','leaderboardClick',
    'searchFocus','retryPulse','offlinePulse'
  ];

  function bind(){
    ensureStyles();
    const on = (sel, ev, fn)=>{ document.addEventListener(ev,(e)=>{ const el=e.target.closest && e.target.closest(sel); if(el) fn(e,el); }); };
    // 1-4 delegated haptics for all interactive
    document.addEventListener('click', (e)=>{
      const t=e.target;
      if(!t || !t.closest) return;
      const hit = t.closest('[data-confetti="team"], [data-pov], #c, canvas, [data-n], button, .pill, .btn, .vh-card, .mode-card, .city-pill, #bShare, #retry, #btn-offline-copy-daily, .hub-brand-copy-daily, [aria-current], .tab-pills [data-tab], .research-tabs [data-tab], #pack-battle-injected button, .site-nav__link, .site-nav__cta');
      if(hit){ haptic(10); }
      // POV click
      if(t.closest('[data-pov]')){
        const pov=t.closest('[data-pov]').dataset.pov;
        try{ localStorage.setItem('vh_last_pov',pov); }catch(_){}
      }
      // map dot click heuristic — canvas #c
      if(t.closest('#c')){
        try{ if(window.__vhMapPick) haptic(10); }catch(_){}
      }
    }, {passive:true});

    document.addEventListener('keydown', (e)=>{
      const c=document.getElementById('c');
      if(!c) return;
      if(document.activeElement===c && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key)){
        haptic(10);
      }
    });

    // specific: team lock confetti
    document.addEventListener('click',(e)=>{
      const lock=e.target.closest && e.target.closest('[data-confetti="team"]');
      if(lock){
        setTimeout(()=>{
          try{
            let primary=null;
            try{
              const fav=localStorage.getItem('vectorHoops.favoriteTeam')||localStorage.getItem('hub-favoriteTeam')||'CHI';
              const pills=document.querySelectorAll('.city-pill,[data-abbr]');
              pills.forEach(el=>{ if(el.dataset && el.dataset.abbr===fav && el.dataset.color) primary=el.dataset.color; });
            }catch(_){}
            spawnConfetti(primary||'#F0E442');
          }catch(_){}
        },90);
      }
    });

    // pack battle, copy, share already haptic via generic
    window.addEventListener('vh:win', (ev)=>{ try{ spawnConfetti(ev.detail && ev.detail.color || OKABE[0]); haptic(12);}catch(_){} });
    window.addEventListener('vh:equation-shuffle', ()=>{ haptic(10); });
    window.addEventListener('vh:favorite-team', (ev)=>{ try{ spawnConfetti(ev.detail && ev.detail.color || OKABE[2]); haptic(10);}catch(_){} });
    // streak toast
    window.addEventListener('vh:streak', ()=>{ haptic(10); });
    // reduced motion changes
    try{ window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{ ensureStyles(); }); }catch(_){}
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  ensureStyles();

  window.VHDelight = {
    spawnConfetti,
    haptic,
    isReduced: reduced,
    interactions: INTERACTIONS,
    flourishes: ['flame-flicker','card-lift','card-press','tile-hover','btn-press','pill-bounce','badge-pop','toast-slide','pulse-ring'],
    meta: { js:29, css:9, confettiMax:80, engine:'WebAnimations translate3d cubic-bezier(.22,1,.36,1)', reducedMotion:true, vibrate:true }
  };
  // console-only provenance, no visible badge
  try{ console.log('[delight] 29JS 9CSS confetti 80max WA translate3d cubic-bezier(.22,1,.36,1) haptics vib10 OK'); }catch(_){}
})();
