/* delight.js — confetti + haptics + spring for best-app-ever feel
 * Linear-level polish: team color confetti on lock, spring 300/20 for cards
 * Solo personal project
 */
(function(){
  function spawnConfetti(teamPrimary){
    try{
      var c = document.createElement('canvas');
      c.style.cssText='position:fixed; inset:0; pointer-events:none; z-index:100; width:100vw; height:100vh;';
      document.body.appendChild(c);
      var ctx = c.getContext('2d');
      var W = c.width = window.innerWidth;
      var H = c.height = window.innerHeight;
      var colors = [teamPrimary||'#F0E442', '#0072B2', '#D55E00', '#fff', '#111'];
      var pieces = [];
      for(var i=0;i<42;i++){
        pieces.push({
          x: W/2 + (Math.random()-0.5)*120,
          y: H*0.38 + (Math.random()-0.5)*40,
          vx: (Math.random()-0.5)*12,
          vy: -6 - Math.random()*8,
          rot: Math.random()*Math.PI*2,
          vr: (Math.random()-0.5)*0.28,
          size: 6 + Math.random()*7,
          color: colors[i%colors.length],
          shape: i%3===0 ? 'circle' : (i%3===1 ? 'rect' : 'tri')
        });
      }
      var start = performance.now();
      function frame(now){
        var t = (now-start)/1000;
        ctx.clearRect(0,0,W,H);
        var alive=false;
        pieces.forEach(function(p){
          p.x+=p.vx;
          p.y+=p.vy;
          p.vy+=0.22; // gravity
          p.rot+=p.vr;
          if(p.y < H+20) alive=true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle=p.color;
          if(p.shape==='circle'){
            ctx.beginPath(); ctx.arc(0,0,p.size/2,0,Math.PI*2); ctx.fill();
          } else if(p.shape==='rect'){
            ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
            ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.strokeRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
          } else {
            ctx.beginPath(); ctx.moveTo(0,-p.size/2); ctx.lineTo(p.size/2,p.size/2); ctx.lineTo(-p.size/2,p.size/2); ctx.closePath(); ctx.fill(); ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.stroke();
          }
          ctx.restore();
        });
        if(alive && t<3.2) requestAnimationFrame(frame);
        else c.remove();
      }
      requestAnimationFrame(frame);
    }catch(e){}
  }

  function init(){
    // lock confetti
    document.addEventListener('click', function(e){
      var lock = e.target.closest && e.target.closest('#city-intro-lock');
      if(lock){
        var isLocking = !lock.classList.contains('is-locked'); // will become locked after click handler runs? Check current state inverted
        // delay to get team color
        setTimeout(function(){
          try{
            var abbr = localStorage.getItem('vectorHoops.favoriteTeam') || 'CHI';
            var teamEls = document.querySelectorAll('.city-pill');
            var primary = null;
            teamEls.forEach(function(el){ if(el.dataset.abbr===abbr && el.dataset.color) primary=el.dataset.color; });
            spawnConfetti(primary||'#F0E442');
            if(navigator.vibrate) navigator.vibrate([16,24,16]);
          }catch(err){}
        }, 120);
      }
    });

    // equation shuffle confetti tickle small
    window.addEventListener('vh:equation-shuffle', function(){
      try{ if(navigator.vibrate) navigator.vibrate(10); }catch(e){}
    });

    // spring animation for cards on hover / tap (reduce CLS)
    var style=document.createElement('style');
    style.textContent='.vh-card{transition:transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s; will-change:transform;} .vh-card:hover{transform:translateY(-2px) rotate(0.3deg);} .vh-card:active{transform:translateY(1px) scale(.98);} @media(prefers-reduced-motion:reduce){.vh-card{transition:none}}';
    document.head.appendChild(style);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.VHDelight = {spawnConfetti:spawnConfetti};
})();
