/* landing-equation.js — interactive ? + ? = ? demo with real players for conversion
 * Uses players_lite.json 800 stars, picks random chimera examples that feel real
 * Adds spring, flip, triple encoding Okabe shapes, 18px/1.65 readability hook
 * Solo personal project, free-tier only
 */
(function(){
  var CACHE_KEY = 'vectorHoops.equationDemo.v1';
  var players = null;
  var container = null;

  // classic chimeras that test well for virality (seeded)
  var SEEDED = [
    {a: 'Nikola Jokic', b: 'Dennis Rodman', t: 'Victor Wembanyama', pct: 84.5},
    {a: 'Stephen Curry', b: 'Shaquille O\'Neal', t: 'Nikola Jokic', pct: 81.2},
    {a: 'LeBron James', b: 'Rudy Gobert', t: 'Giannis Antetokounmpo', pct: 79.8},
    {a: 'Michael Jordan', b: 'Draymond Green', t: 'Kobe Bryant', pct: 88.1},
    {a: 'Kevin Durant', b: 'Scottie Pippen', t: 'Jayson Tatum', pct: 76.3},
    {a: 'Allen Iverson', b: 'Wembanyama', t: 'Ja Morant', pct: 73.9}
  ];

  function loadPlayers(){
    if(players) return Promise.resolve(players);
    return fetch('/assets/players_lite.json', {cache:'force-cache'}).then(function(r){ return r.json(); }).then(function(j){
      players = j.players||[];
      return players;
    }).catch(function(){ return SEEDED.map(function(s){return {name:s.a}}).concat(SEEDED.map(function(s){return {name:s.b}})); });
  }

  function pickDemo(){
    // 70% seeded for recognition, 30% random from pool
    if(Math.random()<0.7){
      return SEEDED[Math.floor(Math.random()*SEEDED.length)];
    }
    if(!players || players.length<3) return SEEDED[0];
    function rName(){ return players[Math.floor(Math.random()*players.length)].name; }
    var a = rName(), b = rName(), t = rName();
    var pct = (70 + Math.random()*18).toFixed(1);
    // avoid same
    var tries=0;
    while((a===b||a===t||b===t) && tries<10){ b=rName(); t=rName(); tries++; }
    return {a:a, b:b, t:t, pct: pct};
  }

  function render(demo, animate){
    if(!container) return;
    var aTile = container.querySelector('[data-role="a"]');
    var bTile = container.querySelector('[data-role="b"]');
    var tTile = container.querySelector('[data-role="target"]');
    var line = container.querySelector('[data-role="line"]');
    if(!aTile) return;
    if(animate){
      aTile.style.transform='rotateY(90deg) scale(.9)';
      bTile.style.transform='rotateY(90deg) scale(.9)';
      tTile.style.transform='rotateY(90deg) scale(.9)';
      setTimeout(function(){
        apply(aTile, demo.a, 'a');
        apply(bTile, demo.b, 'b');
        apply(tTile, demo.t, 'target');
        if(line) line.textContent = demo.a.split(' ').slice(-1)[0] + ' + ' + demo.b.split(' ').slice(-1)[0] + ' → ' + demo.t.split(' ').slice(-1)[0] + '? ' + demo.pct + '%';
        aTile.style.transform='rotateY(0deg) scale(1)';
        bTile.style.transform='rotateY(0deg) scale(1)';
        tTile.style.transform='rotateY(0deg) scale(1)';
      }, 180);
    } else {
      apply(aTile, demo.a, 'a');
      apply(bTile, demo.b, 'b');
      apply(tTile, demo.t, 'target');
      if(line) line.textContent = demo.a.split(' ').slice(-1)[0] + ' + ' + demo.b.split(' ').slice(-1)[0] + ' → ' + demo.t.split(' ').slice(-1)[0] + '? ' + demo.pct + '%';
    }
  }

  function apply(el, name, role){
    el.textContent='';
    el.setAttribute('aria-label', name + ' ('+role+')');
    el.title = name;
    // triple encoding: shape + icon + text + pattern per Sunni SCAD
    var inner = document.createElement('div');
    inner.style.cssText='display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; width:100%; height:100%; padding:4px; box-sizing:border-box;';
    var avatar = document.createElement('div');
    avatar.style.cssText='width:32px; height:32px; border-radius:50%; border:2px solid #111; background:#fff; display:grid; place-items:center; font-weight:900; font-size:12px; box-shadow:1.5px 1.5px 0 #111;';
    // color by Okabe mapping from c? fallback by hash
    var hash = 0; for(var i=0;i<name.length;i++) hash = (hash*31 + name.charCodeAt(i)) % 8;
    var okabe = ['#0072B2','#D55E00','#009E73','#CC79A7','#F0E442','#56B4E9','#E69F00','#000000'];
    var okabeIcon = ['⬢','■','▲','◆','★','●','◼','⬣'];
    avatar.style.background = okabe[hash];
    avatar.style.color = (hash===4 ? '#111' : '#fff');
    avatar.textContent = okabeIcon[hash];
    var txt = document.createElement('div');
    txt.textContent = name.split(' ').slice(-1)[0]; // last name for fit
    txt.style.cssText='font-family:var(--mono); font-size:10px; font-weight:900; text-align:center; line-height:1.1; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
    var sub = document.createElement('div');
    sub.textContent = name.split(' ')[0].slice(0,3).toUpperCase();
    sub.style.cssText='font-family:var(--mono); font-size:8px; opacity:.7; letter-spacing:.04em;';
    inner.appendChild(avatar);
    inner.appendChild(txt);
    inner.appendChild(sub);
    el.appendChild(inner);
    // pattern for triple encoding
    el.style.background = role==='target' ? '#F0E442' : '#FFFEF7';
    el.style.borderColor = '#111';
    if(role==='a') el.style.backgroundImage='radial-gradient(#111 0.8px, transparent 0.9px)';
    if(role==='b') el.style.backgroundImage='linear-gradient(45deg, rgba(0,0,0,.06) 25%, transparent 25%, transparent 50%, rgba(0,0,0,.06) 50%, rgba(0,0,0,.06) 75%, transparent 75%)';
    el.style.backgroundSize = role==='a' ? '8px 8px' : '10px 10px';
  }

  function init(){
    container = document.getElementById('landing-equation-interactive');
    if(!container){
      // upgrade existing .landing-equation to interactive if present
      var legacy = document.querySelector('.landing-equation');
      if(legacy){
        legacy.id='landing-equation-interactive';
        // inject data-role
        var tiles = legacy.querySelectorAll('.landing-equation__tile');
        if(tiles[0]) tiles[0].dataset.role='a';
        if(tiles[1]) tiles[1].dataset.role='b';
        if(tiles[2]) tiles[2].dataset.role='target';
        // find line below
        var line = legacy.nextElementSibling;
        if(line && line.tagName==='P'){
          line.dataset.role='line';
          line.style.cursor='pointer';
          line.style.userSelect='none';
        }
        container = legacy;
      } else return;
    }
    var lineEl = container.parentElement.querySelector('[data-role="line"]') || document.querySelector('[data-role="line"]');
    if(!lineEl){
      lineEl = document.createElement('p');
      lineEl.dataset.role='line';
      lineEl.style.cssText='font-family:var(--mono); font-size:11px; color:#111; margin:8px 0 0; text-align:center; background:#FFFEF7; border:1.5px solid #111; border-radius:999px; padding:4px 8px; display:inline-block; cursor:pointer; box-shadow:2px 2px 0 #111;';
      lineEl.textContent='Tap tiles to randomize — real players';
      container.parentElement.appendChild(lineEl);
    }
    // enhance tiles styles for 3D flip
    var allTiles = container.querySelectorAll('[data-role]');
    allTiles.forEach(function(el){
      if(el.dataset.role==='line') return;
      el.style.transition='transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s';
      el.style.transformStyle='preserve-3d';
      el.style.cursor='pointer';
      el.setAttribute('role','button');
      el.setAttribute('tabindex','0');
      el.addEventListener('click', function(){ randomize(true); try{ navigator.vibrate && navigator.vibrate(12);}catch(e){} });
      el.addEventListener('keydown', function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); randomize(true);} });
    });
    lineEl && lineEl.addEventListener('click', function(){ randomize(true); });

    loadPlayers().then(function(){
      var demo = pickDemo();
      render(demo, false);
      // auto rotate every 5.6s if not interacted recently
      var lastInteraction = Date.now();
      function schedule(){
        setInterval(function(){
          if(Date.now() - lastInteraction > 5600){
            var d = pickDemo();
            render(d, true);
          }
        }, 5600);
      }
      schedule();
      window._vhEquationRandomize = function(){ lastInteraction=Date.now(); randomize(true); };
    });

    function randomize(animate){
      var d = pickDemo();
      render(d, animate);
      // confetti tickle
      try{
        var ev = new CustomEvent('vh:equation-shuffle', {detail:d});
        window.dispatchEvent(ev);
      }catch(e){}
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
