/* landing-equation.js — v6 Guess main + Chimera HARD
 * Guess teaser = single ? mystery player, Chimera HARD = ?+?=? 
 * Uses players_lite.json 800 stars, real names
 */
(function(){
  var players = null;

  var SEEDED_CHIMERA = [
    {a:'Nikola Jokic', b:'Dennis Rodman', t:'Victor Wembanyama', pct:84.5},
    {a:'Stephen Curry', b:'Shaquille O\'Neal', t:'Nikola Jokic', pct:81.2},
    {a:'LeBron James', b:'Rudy Gobert', t:'Giannis Antetokounmpo', pct:79.8},
    {a:'Michael Jordan', b:'Draymond Green', t:'Kobe Bryant', pct:88.1}
  ];
  var SEEDED_GUESS = [
    {name:'Michael Jordan', season:'1990-91', hint:'Elite scorer + defender'},
    {name:'Nikola Jokic', season:'2022-23', hint:'Passing big'},
    {name:'Stephen Curry', season:'2015-16', hint:'Gravity shooter'},
    {name:'Victor Wembanyama', season:'2024-25', hint:'Rim + range'},
    {name:'LeBron James', season:'2012-13', hint:'Two-way engine'}
  ];

  function loadPlayers(){
    if(players) return Promise.resolve(players);
    return fetch('/assets/players_lite.json',{cache:'force-cache'}).then(function(r){return r.json();}).then(function(j){
      players=j.players||[]; return players;
    }).catch(function(){ return []; });
  }
  function pickChimera(){
    if(Math.random()<0.7) return SEEDED_CHIMERA[Math.floor(Math.random()*SEEDED_CHIMERA.length)];
    if(!players || players.length<3) return SEEDED_CHIMERA[0];
    function rn(){ return players[Math.floor(Math.random()*players.length)].name; }
    var a=rn(), b=rn(), t=rn(), tries=0;
    while((a===b||a===t||b===t)&&tries<10){ b=rn(); t=rn(); tries++; }
    return {a:a,b:b,t:t,pct:(70+Math.random()*18).toFixed(1)};
  }
  function pickGuess(){
    if(players && players.length>5 && Math.random()<0.6){
      var pl=players[Math.floor(Math.random()*players.length)];
      return {name:pl.name, season:pl.season||'', hint:(pl.team||'')+' '+(pl.pos||'')||'Tap to shuffle'};
    }
    return SEEDED_GUESS[Math.floor(Math.random()*SEEDED_GUESS.length)];
  }
  function applyEl(el, name, role){
    if(!el) return;
    el.textContent='';
    var inner=document.createElement('div');
    inner.style.cssText='display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; width:100%; height:100%; padding:4px; box-sizing:border-box;';
    var avatar=document.createElement('div');
    avatar.style.cssText='width:28px; height:28px; border-radius:50%; border:2px solid #111; display:grid; place-items:center; font-weight:900; font-size:11px; box-shadow:1.5px 1.5px 0 #111;';
    var hash=0; for(var i=0;i<name.length;i++) hash=(hash*31+name.charCodeAt(i))%8;
    var okabe=['#0072B2','#D55E00','#009E73','#CC79A7','#F0E442','#56B4E9','#E69F00','#000'];
    var icon=['⬢','■','▲','◆','★','●','◼','⬣'];
    avatar.style.background=okabe[hash]; avatar.style.color=hash===4?'#111':'#fff'; avatar.textContent=icon[hash];
    var txt=document.createElement('div'); txt.textContent=name.split(' ').slice(-1)[0];
    txt.style.cssText='font-family:var(--mono); font-size:10px; font-weight:900; text-align:center; line-height:1.1; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
    inner.appendChild(avatar); inner.appendChild(txt);
    el.appendChild(inner);
    el.style.background=role==='target'?'#F0E442':'#FFFEF7';
  }
  function renderChimera(container, demo, animate){
    if(!container) return;
    var aTile=container.querySelector('[data-role="a"]'), bTile=container.querySelector('[data-role="b"]'), tTile=container.querySelector('[data-role="target"]');
    var line=container.parentElement.querySelector('[data-role="line"]') || document.querySelector('#chimera-line');
    if(!aTile) return;
    function doSet(){
      applyEl(aTile,demo.a,'a'); applyEl(bTile,demo.b,'b'); applyEl(tTile,demo.t,'target');
      if(line) line.textContent=demo.a.split(' ').slice(-1)[0]+' + '+demo.b.split(' ').slice(-1)[0]+' → '+demo.t.split(' ').slice(-1)[0]+' '+demo.pct+'% • HARD';
    }
    if(animate){
      [aTile,bTile,tTile].forEach(function(el){ el.style.transition='transform .22s'; el.style.transform='rotateY(90deg) scale(.9)'; });
      setTimeout(function(){ doSet(); [aTile,bTile,tTile].forEach(function(el){ el.style.transform='rotateY(0deg) scale(1)'; }); },180);
    } else doSet();
  }
  function renderGuess(main, demo, animate){
    if(!main) return;
    var tile=main.querySelector('.landing-equation__tile--target') || main.querySelector('[data-role="target"]') || main;
    var line=main.parentElement.querySelector('[data-role="line"]');
    function doSet(){
      tile.innerHTML='<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%;"><div style="font-size:28px; font-weight:900;">?</div><div style="font-family:var(--mono); font-size:9px; margin-top:2px;">'+demo.name.split(' ').slice(-1)[0]+'</div><div style="font-family:var(--mono); font-size:8px; opacity:.6;">'+(demo.season||'')+'</div></div>';
      if(line) line.textContent=demo.name+' '+(demo.season||'')+' — '+(demo.hint||'Tap to shuffle guess');
    }
    if(animate){
      tile.style.transition='transform .22s'; tile.style.transform='rotateY(90deg) scale(.9)';
      setTimeout(function(){ doSet(); tile.style.transform='rotateY(0deg) scale(1)'; },180);
    } else doSet();
  }

  function init(){
    loadPlayers().then(function(){
      var chimeraContainer=document.getElementById('landing-equation-interactive');
      var guessMain=document.getElementById('landing-equation-main');
      var lastInteraction=Date.now();

      // enable click handlers
      if(guessMain){
        guessMain.style.cursor='pointer';
        guessMain.addEventListener('click', function(){
          lastInteraction=Date.now();
          renderGuess(guessMain, pickGuess(), true);
        });
        renderGuess(guessMain, pickGuess(), false);
      }
      if(chimeraContainer){
        chimeraContainer.style.cursor='pointer';
        ['a','b','target'].forEach(function(r){
          var el=chimeraContainer.querySelector('[data-role="'+r+'"]');
          if(el){ el.style.transition='transform .22s'; el.style.cursor='pointer'; el.addEventListener('click', function(){ lastInteraction=Date.now(); renderChimera(chimeraContainer, pickChimera(), true); }); }
        });
        renderChimera(chimeraContainer, pickChimera(), false);
        var chimeraLine=chimeraContainer.parentElement.querySelector('[data-role="line"]');
        if(chimeraLine) chimeraLine.addEventListener('click', function(){ renderChimera(chimeraContainer, pickChimera(), true); });
      }

      // auto rotate guess only
      setInterval(function(){
        if(Date.now()-lastInteraction>5600 && guessMain){
          renderGuess(guessMain, pickGuess(), true);
        }
      },5600);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
