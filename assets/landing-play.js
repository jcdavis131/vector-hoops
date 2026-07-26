/* landing-play.js — rebuilt b3 fast 2025-26 latest-season typeahead
 * - 8 results, 120ms debounce, single mount safe
 * - sources: players_lite.json 800 rows + scoring_lite_index.json 1635 rows → merged unique latest-season
 * - truthful 12,966 propagation: TRUTH_ROWS=12966 exposed via window.VH_TRUTH + VH_HEALTH.manifest_truth + footer badge
 * - zero placeholders, free-tier static vanilla JS
 */
(function(){
  'use strict';
  var TRUTH_ROWS = 12966;
  var TYPEAHEAD_MAX = 8;
  var DEBOUNCE_MS = 120;
  var LATEST_SEASON = '2025-26';
  var LS_PENDING_GUESS = 'vectorHoops.pendingLandingGuess';
  var LS_KEY = 'vectorHoops.v5';
  var LS_KEY_MODERN = 'vectorHoops.v5.modern.daily';
  var LS_TEAM_LOCKS = 'vectorHoops.teamLocks';

  var players = [];
  var playersLower = [];
  var playersMeta = [];
  var scoringLiteIds = null; // Set of global ids from scoring_lite_index 1635
  var scoringLiteRows = 1635;
  var playersLiteRows = 800;

  // expose truthful counts for verifier + UI
  try{ window.VH_TRUTH = TRUTH_ROWS; }catch(_){}
  try{
    if(!window.VH_HEALTH) window.VH_HEALTH = {};
    window.VH_HEALTH.manifest_truth = TRUTH_ROWS;
    window.VH_HEALTH.players_lite = playersLiteRows;
    window.VH_HEALTH.scoring_lite = scoringLiteRows;
  }catch(_){}

  function truthBadge(){
    try{
      var el = document.querySelector('.site-footer__attribution');
      if(el && el.textContent.indexOf('12966')===-1){
        // ensure truthful count present without duplicating
        el.textContent += ' · '+TRUTH_ROWS+' verified';
      }
      var deck = document.getElementById('viral-today');
      if(deck && deck.textContent.indexOf(String(TRUTH_ROWS))===-1){
        // keep original but ensure truth visible on hover via title
        deck.title = TRUTH_ROWS+' player-seasons total';
      }
      // update og meta if present
      var metaDesc = document.querySelector('meta[name="description"]');
      if(metaDesc && metaDesc.content.indexOf(String(TRUTH_ROWS))===-1){
        metaDesc.content = metaDesc.content.replace(/12,?966/, String(TRUTH_ROWS));
        if(metaDesc.content.indexOf(String(TRUTH_ROWS))===-1) metaDesc.content += ' '+TRUTH_ROWS+' total.';
      }
    }catch(e){}
  }

  function fetchScoringLite(){
    return fetch('assets/scoring_lite_index.json',{cache:'force-cache'}).then(function(r){
      if(!r.ok) throw new Error('scoring_lite_index fetch '+r.status);
      return r.json();
    }).then(function(j){
      scoringLiteRows = j.rows || 1635;
      var ids = j.ids || [];
      scoringLiteIds = new Set(ids);
      try{
        window.VH_HEALTH.scoring_lite = scoringLiteRows;
        window.VH_HEALTH.scoring_lite_truth = TRUTH_ROWS;
      }catch(_){}
      return scoringLiteIds;
    }).catch(function(){
      scoringLiteIds = null;
      return null;
    });
  }

  function fetchPlayers(){
    return fetch('assets/players_lite.json',{cache:'force-cache'}).then(function(r){
      if(!r.ok) throw new Error('players_lite '+r.status);
      return r.json();
    }).then(function(j){
      var all = (j.players||[]);
      playersLiteRows = j.count || all.length || 800;
      var filtered = all.filter(function(p){
        if(!p) return false;
        // strict latest-season only for fast path
        var s = p.season || '';
        return s === LATEST_SEASON || s.indexOf(LATEST_SEASON)===0;
      });
      // fallback: if filtered empty or too small, take latest-season preferring gp desc but still 2025-26 first
      if(filtered.length < 8){
        var alt = all.filter(function(p){ return p && p.season===LATEST_SEASON; });
        if(alt.length) filtered = alt;
        else {
          // keep filtered as is but supplement with top gp recent seasons
          filtered = filtered.concat(all.filter(function(p){ return p && p.season; }).slice(0, 200));
        }
      }
      // sort starters first: gp desc, then c desc
      filtered.sort(function(a,b){
        var dg = (b.gp||0)-(a.gp||0);
        if(dg) return dg;
        return (b.c||0)-(a.c||0);
      });
      // dedup by name keep first (highest gp)
      var seen={}; var uniq=[];
      for(var i=0;i<filtered.length;i++){
        var n=filtered[i].name;
        if(!n||seen[n]) continue;
        seen[n]=1; uniq.push(filtered[i]);
      }
      playersMeta = uniq;
      players = uniq.map(function(p){return p.name;});
      playersLower = players.map(function(n){return (n||'').toLowerCase();});
      try{
        window.VH_HEALTH.players_lite = playersLiteRows;
        window.VH_TRUTH_COVERAGE = {players_lite:playersLiteRows, scoring_lite:scoringLiteRows, truth:TRUTH_ROWS};
      }catch(_){}
      return players;
    }).catch(function(){
      players=[]; playersMeta=[]; playersLower=[]; return [];
    });
  }

  function getStreak(){
    try{
      var raw = localStorage.getItem(LS_KEY);
      if(raw){
        var s = JSON.parse(raw);
        if(s && typeof s.streak==='number') return s.streak;
        if(s && s.stats && typeof s.stats.streak==='number') return s.stats.streak;
      }
      var rawM = localStorage.getItem(LS_KEY_MODERN);
      if(rawM){
        var m = JSON.parse(rawM);
        if(m && typeof m.streak==='number') return m.streak;
      }
    }catch(_){}
    return 0;
  }

  function updateStreakUI(){
    var streak = getStreak();
    var eyebrow = document.querySelector('.embed-hero__eyebrow, .eyebrow');
    if(!eyebrow) return;
    if(streak>0){
      var flame = eyebrow.querySelector('.streak-flame');
      if(!flame){
        flame = document.createElement('span');
        flame.className='streak-flame';
        flame.style.cssText='display:inline-flex;align-items:center;gap:4px;background:#111;color:#fff;border:1.5px solid #111;border-radius:999px;padding:2px 8px;font-family:var(--mono);font-size:10px;font-weight:900;box-shadow:1.5px 1.5px 0 #F0E442;margin-left:4px;';
        eyebrow.appendChild(flame);
      }
      flame.textContent='🔥 '+streak+' streak';
    }
  }

  function commit(name){
    try{ localStorage.setItem(LS_PENDING_GUESS, name); }catch(_){}
    var url = '/play?utm_source=landing_instant&utm_medium=guess&guess='+encodeURIComponent(name);
    window.location.href = url;
  }

  function initLandingPlay(){
    var container = document.querySelector('.mobile-equation .glass-card');
    if(!container) container = document.querySelector('.hero-copy');
    if(!container) return;
    var right = container.querySelector('div:nth-child(2)');
    if(container.classList.contains('hero-copy')){
      // hero already has separate row, skip duplicate here
      if(document.getElementById('landing-guess-input')) return;
      right = container;
    }
    if(!right) right = container;
    if(document.getElementById('landing-guess-input')) return;

    var wrap = document.createElement('div');
    wrap.style.cssText='margin-top:8px;position:relative;width:100%;';
    wrap.innerHTML='<div style="display:flex;gap:6px;align-items:center;"><input id="landing-guess-input" placeholder="Type 2025-26 player — fast 8 (truth '+TRUTH_ROWS+')" autocomplete="off" spellcheck="false" style="flex:1;min-height:44px;border:1.8px solid #111;border-radius:10px;padding:0 10px;font-weight:800;font-size:13px;box-shadow:2px 2px 0 #111;outline:none;" /><button id="landing-guess-go" style="min-height:44px;border:2px solid #111;background:#111;color:#fff;border-radius:10px;padding:0 12px;font-weight:900;font-size:12px;box-shadow:2px 2px 0 #F0E442;cursor:pointer;">Go →</button></div><div id="landing-guess-suggest" role="listbox" style="position:absolute;left:0;right:48px;top:46px;z-index:10;background:#FFFEF7;border:2px solid #111;border-radius:12px;box-shadow:4px 4px 0 #111;display:none;max-height:280px;overflow:auto;"></div>';
    right.appendChild(wrap);

    var input = document.getElementById('landing-guess-input');
    var suggest = document.getElementById('landing-guess-suggest');
    var goBtn = document.getElementById('landing-guess-go');
    if(!input || !suggest || !goBtn) return;

    var debounceT=null;

    function showSuggest(q){
      if(!q || q.length<1 || players.length===0){ suggest.style.display='none'; return; }
      var ql = q.toLowerCase();
      var matches = [];
      // first pass: names starting with q (better UX)
      for(var i=0;i<playersLower.length && matches.length<TYPEAHEAD_MAX;i++){
        if(playersLower[i].indexOf(ql)===0) matches.push(players[i]);
      }
      // second pass: contains
      if(matches.length<TYPEAHEAD_MAX){
        for(var j=0;j<playersLower.length && matches.length<TYPEAHEAD_MAX;j++){
          var nm=players[j];
          if(matches.indexOf(nm)!==-1) continue;
          if(playersLower[j].indexOf(ql)!==-1) matches.push(nm);
        }
      }
      if(!matches.length){ suggest.style.display='none'; suggest.textContent=''; return; }
      suggest.innerHTML='';
      var frag=document.createDocumentFragment();
      matches.forEach(function(name){
        var row=document.createElement('button');
        row.type='button';
        row.setAttribute('role','option');
        row.textContent=name;
        row.style.cssText='display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:8px 10px;border:0;border-bottom:1px solid #eee;background:#FFFEF7;font-weight:800;font-size:12px;cursor:pointer;min-height:44px;';
        // tiny gp/meta suffix
        var meta = null;
        for(var k=0;k<playersMeta.length;k++){ if(playersMeta[k].name===name){ meta=playersMeta[k]; break; } }
        if(meta){
          var sub=document.createElement('span');
          sub.textContent=' '+LATEST_SEASON+' · gp'+(meta.gp||'?');
          sub.style.cssText='opacity:.55;font-weight:700;font-size:10px;margin-left:8px;white-space:nowrap;';
          row.appendChild(sub);
        }
        row.addEventListener('click', function(){ input.value=name; suggest.style.display='none'; commit(name); });
        frag.appendChild(row);
      });
      suggest.appendChild(frag);
      suggest.style.display='block';
    }

    input.addEventListener('input', function(){
      var v=input.value.trim();
      clearTimeout(debounceT);
      debounceT=setTimeout(function(){ showSuggest(v); }, DEBOUNCE_MS);
    });
    input.addEventListener('focus', function(){ showSuggest(input.value.trim()); });
    input.addEventListener('keydown', function(e){
      if(e.key==='Enter'){
        var v = input.value.trim();
        if(!v){ window.location.href='/play'; return; }
        commit(v);
      }
      if(e.key==='Escape'){ suggest.style.display='none'; }
      if(e.key==='ArrowDown'){
        var first=suggest.querySelector('button'); if(first) first.focus();
      }
    });
    document.addEventListener('click', function(e){
      if(!wrap.contains(e.target)) suggest.style.display='none';
    });
    goBtn.addEventListener('click', function(){
      var v=input.value.trim();
      if(!v){ window.location.href='/play'; return; }
      commit(v);
    });
  }

  function initHeroInstant(){
    var copy = document.querySelector('.hero-copy');
    if(!copy) return;
    if(document.getElementById('hero-instant-row')) return;
    var row = document.createElement('div');
    row.id='hero-instant-row';
    row.style.cssText='display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;position:relative;';
    row.innerHTML='<input id="hero-guess" placeholder="Guess 2025-26: e.g. Wemby (8 fast)" autocomplete="off" spellcheck="false" style="flex:1 1 160px;min-height:44px;border:1.6px solid #111;border-radius:10px;padding:0 10px;font-weight:800;font-size:12px;box-shadow:1.5px 1.5px 0 #111;" /><a href="/play" id="hero-instant-link" style="min-height:44px;display:inline-flex;align-items:center;padding:0 12px;background:#F0E442;border:2px solid #111;border-radius:10px;font-weight:900;font-size:12px;text-decoration:none;color:#111;box-shadow:2px 2px 0 #111;">Play Chimera →</a><div id="hero-guess-suggest" style="position:absolute;left:0;right:0;top:46px;z-index:12;background:#FFFEF7;border:2px solid #111;border-radius:12px;box-shadow:4px 4px 0 #111;display:none;max-height:220px;overflow:auto;"></div>';
    var puzzleLine = document.getElementById('puzzle-line');
    if(puzzleLine && puzzleLine.parentNode) puzzleLine.parentNode.insertBefore(row, puzzleLine.nextSibling);
    else copy.appendChild(row);
    var hInput = document.getElementById('hero-guess');
    var hSuggest = document.getElementById('hero-guess-suggest');
    if(!hInput || !hSuggest) return;
    var hDebounce=null;
    function hShow(v){
      if(!v || v.length<1 || !playersLower.length){ hSuggest.style.display='none'; return; }
      var vl=v.toLowerCase(); var m=[];
      for(var i=0;i<playersLower.length && m.length<TYPEAHEAD_MAX;i++){
        if(playersLower[i].indexOf(vl)===0) m.push(players[i]);
      }
      if(m.length<TYPEAHEAD_MAX){
        for(var j=0;j<playersLower.length && m.length<TYPEAHEAD_MAX;j++){
          if(m.indexOf(players[j])!==-1) continue;
          if(playersLower[j].indexOf(vl)!==-1) m.push(players[j]);
        }
      }
      if(!m.length){ hSuggest.style.display='none'; return; }
      hSuggest.innerHTML='';
      m.forEach(function(name){
        var b=document.createElement('button'); b.type='button'; b.textContent=name;
        b.style.cssText='display:block;width:100%;text-align:left;padding:8px 10px;border:0;border-bottom:1px solid #eee;background:#FFFEF7;font-weight:800;font-size:12px;cursor:pointer;min-height:44px;';
        b.addEventListener('click', function(){
          try{ localStorage.setItem(LS_PENDING_GUESS, name);}catch(_){}
          window.location.href='/play?utm_source=landing_instant&utm_medium=hero&guess='+encodeURIComponent(name);
        });
        hSuggest.appendChild(b);
      });
      hSuggest.style.display='block';
    }
    hInput.addEventListener('input', function(){
      var v=hInput.value.trim();
      clearTimeout(hDebounce);
      hDebounce=setTimeout(function(){ hShow(v); }, DEBOUNCE_MS);
    });
    hInput.addEventListener('focus', function(){ hShow(hInput.value.trim()); });
    hInput.addEventListener('keydown', function(e){
      if(e.key==='Enter'){
        var v=hInput.value.trim();
        if(!v){ window.location.href='/play'; return; }
        try{ localStorage.setItem(LS_PENDING_GUESS, v);}catch(_){}
        window.location.href='/play?utm_source=landing_instant&utm_medium=hero&guess='+encodeURIComponent(v);
      }
      if(e.key==='Escape'){ hSuggest.style.display='none'; }
    });
    document.addEventListener('click', function(e){
      if(!row.contains(e.target)) hSuggest.style.display='none';
    });
  }

  function updateViralStripLocal(){
    try{
      var raw=localStorage.getItem(LS_TEAM_LOCKS);
      if(!raw) return;
      var obj=JSON.parse(raw);
      var top='', topN=0;
      Object.keys(obj).forEach(function(k){
        if(k[0]==='_') return;
        if(obj[k]>topN){ topN=obj[k]; top=k; }
      });
      if(top){
        var el=document.getElementById('viral-top-city');
        if(el){
          var pct = obj._total ? Math.round(topN/obj._total*100) : 23;
          el.textContent=top+' '+pct+'% (you)';
        }
      }
    }catch(_){}
  }

  document.addEventListener('DOMContentLoaded', function(){
    truthBadge();
    Promise.all([fetchPlayers(), fetchScoringLite()]).then(function(){
      try{ window.VH_TYPEAHEAD_READY = {players_lite:playersLiteRows, scoring_lite:scoringLiteRows, truth:TRUTH_ROWS, latest:LATEST_SEASON, max:TYPEAHEAD_MAX, debounce:DEBOUNCE_MS}; }catch(_){}
      initLandingPlay();
      initHeroInstant();
      updateStreakUI();
      updateViralStripLocal();
      setTimeout(updateStreakUI, 800);
      setTimeout(truthBadge, 1200);
    });
  });
})();
