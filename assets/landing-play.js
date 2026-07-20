/* landing-play.js — instant-play hook for 10M DAU
 * - Typeahead inside mobile-equation + hero equation
 * - Uses players_lite.json (52KB) 800 names
 * - On guess, navigates to /play?guess=NAME & stores pending guess
 * - Shows streak flame from localStorage v5/v6
 * - Counts team locks locally for rivalry strip
 */
(function(){
  'use strict';
  var LS_KEY = 'vectorHoops.v5';
  var LS_KEY_MODERN = 'vectorHoops.v5.modern.daily';
  var LS_KEY_TEAM = 'vectorHoops.v6.team.daily';
  var LS_TEAM_LOCKS = 'vectorHoops.teamLocks';
  var LS_PENDING_GUESS = 'vectorHoops.pendingLandingGuess';
  var players = [];
  var playersLower = [];

  function fetchPlayers(){
    return fetch('assets/players_lite.json',{cache:'force-cache'}).then(function(r){return r.json();}).then(function(j){
      players = (j.players||[]).map(function(p){return p.name;});
      playersLower = players.map(function(n){return n.toLowerCase();});
      return players;
    }).catch(function(){ players=[]; return []; });
  }

  function getStreak(){
    try{
      var raw = localStorage.getItem(LS_KEY);
      if(raw){
        var s = JSON.parse(raw);
        // STATE shape: {streak, history...}
        if(s && typeof s.streak === 'number') return s.streak;
        if(s && s.stats && typeof s.stats.streak === 'number') return s.stats.streak;
      }
      var rawM = localStorage.getItem(LS_KEY_MODERN);
      if(rawM){
        var m = JSON.parse(rawM);
        if(m && typeof m.streak === 'number') return m.streak;
      }
    }catch(e){}
    return 0;
  }

  function updateStreakUI(){
    var streak = getStreak();
    var eyebrow = document.querySelector('.embed-hero__eyebrow');
    if(!eyebrow) return;
    if(streak>0){
      var flame = eyebrow.querySelector('.streak-flame');
      if(!flame){
        flame = document.createElement('span');
        flame.className='streak-flame';
        flame.style.cssText='display:inline-flex; align-items:center; gap:4px; background:#111; color:#fff; border:1.5px solid #111; border-radius:999px; padding:2px 8px; font-family:var(--mono); font-size:10px; font-weight:900; box-shadow:1.5px 1.5px 0 #F0E442; margin-left:4px;';
        eyebrow.appendChild(flame);
      }
      flame.textContent = '🔥 ' + streak + ' streak';
    }
  }

  function initLandingPlay(){
    var container = document.querySelector('.mobile-equation .glass-card');
    if(!container) return;
    // Build instant play dom
    // Keep existing equation left, but add input below or replace right side?
    var right = container.querySelector('div:nth-child(2)');
    if(!right) return;
    // Check if already enhanced
    if(right.querySelector('#landing-guess-input')) return;

    // Build input row
    var wrap = document.createElement('div');
    wrap.style.cssText='margin-top:8px; position:relative; width:100%;';
    wrap.innerHTML = '<div style="display:flex; gap:6px; align-items:center;"><input id="landing-guess-input" placeholder="Type a player — play now" autocomplete="off" style="flex:1; min-height:36px; border:1.8px solid #111; border-radius:10px; padding:0 10px; font-weight:800; font-size:13px; box-shadow:2px 2px 0 #111; outline:none;" /><button id="landing-guess-go" style="min-height:36px; border:2px solid #111; background:#111; color:#fff; border-radius:10px; padding:0 12px; font-weight:900; font-size:12px; box-shadow:2px 2px 0 #F0E442; cursor:pointer;">Go →</button></div><div id="landing-guess-suggest" style="position:absolute; left:0; right:48px; top:40px; z-index:10; background:#FFFEF7; border:2px solid #111; border-radius:12px; box-shadow:4px 4px 0 #111; display:none; max-height:220px; overflow:auto;"></div>';
    right.appendChild(wrap);

    var input = document.getElementById('landing-guess-input');
    var suggest = document.getElementById('landing-guess-suggest');
    var goBtn = document.getElementById('landing-guess-go');

    var debounceT=null;
    function showSuggest(q){
      if(!q || q.length<1 || players.length===0){ suggest.style.display='none'; return; }
      var ql = q.toLowerCase();
      var matches = [];
      // early exit fast path: loop but capped
      for(var i=0;i<playersLower.length && matches.length<6;i++){
        if(playersLower[i].indexOf(ql)!==-1){
          matches.push(players[i]);
        }
      }
      if(!matches.length){ suggest.style.display='none'; suggest.textContent=''; return; }
      // use fragment to reduce layout thrash
      suggest.textContent='';
      var frag=document.createDocumentFragment();
      matches.forEach(function(name){
        var row=document.createElement('button');
        row.type='button';
        row.textContent=name;
        row.style.cssText='display:block; width:100%; text-align:left; padding:8px 10px; border:0; border-bottom:1px solid #eee; background:#FFFEF7; font-weight:800; font-size:12px; cursor:pointer; min-height:44px;';
        row.addEventListener('click', function(){ input.value=name; suggest.style.display='none'; commit(name); });
        frag.appendChild(row);
      });
      suggest.appendChild(frag);
      suggest.style.display='block';
    }

    input.addEventListener('input', function(){
      var v=input.value.trim();
      clearTimeout(debounceT);
      debounceT=setTimeout(function(){ showSuggest(v); }, 70);
    });
    input.addEventListener('focus', function(){ showSuggest(input.value.trim()); });
    input.addEventListener('keydown', function(e){
      if(e.key==='Enter'){
        var v = input.value.trim();
        if(!v) return;
        // if exact match in suggest first, use it? just commit
        commit(v);
      }
      if(e.key==='Escape'){ suggest.style.display='none'; }
    });
    document.addEventListener('click', function(e){
      if(!wrap.contains(e.target)) suggest.style.display='none';
    });

    goBtn.addEventListener('click', function(){
      var v = input.value.trim();
      if(!v){ window.location.href='/play'; return; }
      commit(v);
    });

    function commit(name){
      try{ localStorage.setItem(LS_PENDING_GUESS, name); }catch(_){}
      // also set as query param for play page to pick up
      var url = '/play?utm_source=landing_instant&utm_medium=guess&guess=' + encodeURIComponent(name);
      // subtle haptic / confetti
      window.location.href = url;
    }
  }

  // Team locks counting (city-intro deprecated — no lock button)
  function bumpTeamLock(abbr){
    try{
      var raw = localStorage.getItem(LS_TEAM_LOCKS);
      var obj = raw ? JSON.parse(raw) : {};
      obj[abbr] = (obj[abbr]||0)+1;
      obj._total = (obj._total||0)+1;
      obj._last = abbr;
      localStorage.setItem(LS_TEAM_LOCKS, JSON.stringify(obj));
    }catch(e){}
  }

  // Wire to team lock removed — city-intro-lock no longer exists (fingerprint/arena deprecated)
  function wireLockCounter(){
    return;
  }

  function updateViralStripWithLocal(){
    try{
      var raw = localStorage.getItem(LS_TEAM_LOCKS);
      if(!raw) return;
      var obj = JSON.parse(raw);
      // find top team
      var top='', topN=0;
      Object.keys(obj).forEach(function(k){
        if(k[0]==='_') return;
        if(obj[k]>topN){ topN=obj[k]; top=k; }
      });
      if(top){
        var el = document.getElementById('viral-top-city');
        if(el){
          var pct = obj._total ? Math.round(topN/obj._total*100) : 23;
          el.textContent = top + ' ' + pct + '% (you)';
        }
      }
    }catch(e){}
  }

  // Hero equation also -> instant play small input on desktop?
  function initHeroInstant(){
    var copy = document.querySelector('.embed-hero__copy');
    if(!copy) return;
    if(document.getElementById('hero-instant-row')) return;
    var row = document.createElement('div');
    row.id='hero-instant-row';
    row.style.cssText='display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;';
    row.innerHTML='<input id="hero-guess" placeholder="Guess: e.g. Wemby" style="flex:1 1 140px; min-height:34px; border:1.6px solid #111; border-radius:10px; padding:0 10px; font-weight:800; font-size:12px; box-shadow:1.5px 1.5px 0 #111;" /><a href="/play" id="hero-instant-link" style="min-height:34px; display:inline-flex; align-items:center; padding:0 12px; background:#F0E442; border:2px solid #111; border-radius:10px; font-weight:900; font-size:12px; text-decoration:none; color:#111; box-shadow:2px 2px 0 #111;">Play Chimera →</a>';
    // insert before puzzleline?
    var puzzleLine = document.getElementById('puzzle-line');
    if(puzzleLine && puzzleLine.parentNode) puzzleLine.parentNode.insertBefore(row, puzzleLine.nextSibling);
    else copy.appendChild(row);
    var hInput = document.getElementById('hero-guess');
    if(hInput){
      hInput.addEventListener('keydown', function(e){
        if(e.key==='Enter'){
          var v = hInput.value.trim();
          if(!v) { window.location.href='/play'; return; }
          try{ localStorage.setItem(LS_PENDING_GUESS, v); }catch(_){}
          window.location.href='/play?utm_source=landing_instant&utm_medium=hero&guess='+encodeURIComponent(v);
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    fetchPlayers().then(function(){
      initLandingPlay();
      initHeroInstant();
    });
    updateStreakUI();
    wireLockCounter();
    updateViralStripWithLocal();
    // also update streak after slight delay (localStorage might be set late)
    setTimeout(updateStreakUI, 800);
  });
})();
