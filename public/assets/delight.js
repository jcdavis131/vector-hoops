/* delight.js vNext — confetti Web Animations, streak flame, haptics 10
 * 100M DAU polish: 80 particles max, respects prefers-reduced-motion, cleanup
 */
(function(){
  const REDUCED = typeof window!=='undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const OKABE = ['#D55E00','#0072B2','#009E73','#E69F00','#CC79A7','#56B4E9','#F0E442','#FFFEF7'];

  function spawnConfetti(teamPrimary){
    if(REDUCED){
      try{ if(navigator.vibrate) navigator.vibrate(10); }catch{}
      return;
    }
    try{
      const container = document.createElement('div');
      container.setAttribute('aria-hidden','true');
      container.style.cssText='position:fixed; inset:0; pointer-events:none; z-index:200; overflow:hidden;';
      document.body.appendChild(container);
      const colors = [teamPrimary||'#F0E442', '#0072B2','#D55E00','#FFFEF7','#1A150F','#56B4E9','#009E73'];
      const count = Math.min(80, Math.max(36, Math.floor(window.innerWidth/12)));
      const cx = window.innerWidth*0.5;
      const cy = window.innerHeight*0.38;
      const particles=[];
      for(let i=0;i<count;i++){
        const el=document.createElement('div');
        const size = 5 + Math.random()*9;
        const isDot = i%3===0;
        el.style.cssText=`position:absolute; left:${cx}px; top:${cy}px; width:${size}px; height:${isDot?size:size*0.62}px; background:${colors[i%colors.length]}; border:${isDot?'1.2px solid #1A150F':'1.5px solid #1A150F'}; border-radius:${isDot?'999px':'3px'}; will-change:transform,opacity;`;
        container.appendChild(el);
        particles.push(el);
      }
      // Web Animations per particle
      const anims = particles.map((el, i)=>{
        const angle = (Math.random()-0.5)*Math.PI*0.9 + -Math.PI*0.5;
        const dist = 80 + Math.random()* Math.max(180, window.innerWidth*0.35);
        const dx = Math.cos(angle)*dist + (Math.random()-0.5)*60;
        const dy = Math.sin(angle)*dist + (Math.random()*80+60) + window.innerHeight*0.1;
        const rot = (Math.random()-0.5)*720;
        const scaleEnd = 0.8 + Math.random()*0.6;
        const dur = 900 + Math.random()*900;
        const delay = Math.random()*90;
        const keyframes = [
          { transform:`translate3d(0,0,0) rotate(0deg) scale(1)`, opacity:1 },
          { transform:`translate3d(${dx*0.55}px, ${dy*0.32}px,0) rotate(${rot*0.55}deg) scale(${1.05})`, opacity:1, offset:0.6 },
          { transform:`translate3d(${dx}px, ${dy}px,0) rotate(${rot}deg) scale(${scaleEnd})`, opacity:0 }
        ];
        return el.animate(keyframes, { duration:dur, delay, easing:'cubic-bezier(.22,1,.36,1)', fill:'forwards' });
      });
      // cleanup
      const cleanup = ()=>{
        try{ container.remove(); }catch{}
      };
      Promise.all(anims.map(a=> a.finished.catch(()=>{}))).then(cleanup);
      setTimeout(cleanup, 2800);
      if(navigator.vibrate) navigator.vibrate(10);
    }catch(e){
      try{ if(navigator.vibrate) navigator.vibrate(10);}catch{}
    }
  }

  function ensureStyles(){
    if(document.getElementById('vh-delight-styles')) return;
    const style=document.createElement('style');
    style.id='vh-delight-styles';
    style.textContent=`
      .streak-flame{ display:inline-flex; gap:1px; align-items:center; }
      .streak-flame i{ font-style:normal; display:inline-block; animation:vh-flame-flicker .85s ease-in-out infinite; }
      .streak-flame i:nth-child(2){ animation-delay:.12s } .streak-flame i:nth-child(3){ animation-delay:.22s }
      @keyframes vh-flame-flicker{ 0%,100%{ transform:translateY(0) scale(1) rotate(0deg); filter:brightness(1)} 50%{ transform:translateY(-1.2px) scale(1.15) rotate(1.5deg); filter:brightness(1.12)} }
      @media(prefers-reduced-motion:reduce){ .streak-flame i{ animation:none !important } }
      .vh-card{ transition:transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s ease; will-change:transform; }
      .vh-card:hover{ transform:translateY(-2px) rotate(.2deg); }
      .vh-card:active{ transform:translateY(1px) scale(.985); }
      @media(prefers-reduced-motion:reduce){ .vh-card{ transition:none } }
      .tile{ transition:transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s ease; }
    `;
    document.head.appendChild(style);
  }

  function init(){
    ensureStyles();
    document.addEventListener('click', function(e){
      const lock = e.target.closest && e.target.closest('[data-confetti="team"]');
      if(lock){
        setTimeout(function(){
          try{
            let primary = null;
            try{
              const fav = localStorage.getItem('vectorHoops.favoriteTeam') || 'CHI';
              const pills = document.querySelectorAll('.city-pill');
              pills.forEach(function(el){ if(el.dataset.abbr===fav && el.dataset.color) primary=el.dataset.color; });
            }catch{}
            spawnConfetti(primary||'#F0E442');
          }catch{}
        }, 90);
      }
    });
    // custom events
    window.addEventListener('vh:win', function(ev){ try{ spawnConfetti(ev.detail && ev.detail.color || OKABE[0]); }catch{} });
    window.addEventListener('vh:equation-shuffle', function(){ try{ if(navigator.vibrate) navigator.vibrate(10);}catch{} });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.VHDelight = { spawnConfetti: spawnConfetti };
})();
