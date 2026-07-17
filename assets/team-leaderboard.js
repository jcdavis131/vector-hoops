/* team-leaderboard.js — local + api counting locks per day, rivalry
 * Reads LS_TEAM_LOCKS + LS_TEAM_LOCKS_DAILY, shows sorted leaderboard
 * Prepares API hook for R2/Workers free tier
 */
(function(){
  var LS_LOCKS = 'vectorHoops.teamLocks';
  var LS_DAILY = 'vectorHoops.teamLocks.daily';
  var API_URL = '/api/team-locks'; // future Worker endpoint

  function todayKey(){
    var d = new Date();
    return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
  }

  function loadLocal(){
    try{
      var raw = localStorage.getItem(LS_LOCKS);
      if(!raw) return {total:0, teams:{}};
      var obj = JSON.parse(raw);
      var total = obj._total||0;
      var teams = {};
      Object.keys(obj).forEach(function(k){ if(k[0]!=='_') teams[k]=obj[k]; });
      return {total:total, teams:teams};
    }catch(e){ return {total:0, teams:{}}; }
  }

  function loadDaily(){
    try{
      var raw = localStorage.getItem(LS_DAILY);
      if(!raw) return {};
      var obj = JSON.parse(raw);
      return obj[todayKey()]||{};
    }catch(e){ return {}; }
  }

  function bumpDaily(abbr){
    try{
      var raw = localStorage.getItem(LS_DAILY);
      var all = raw ? JSON.parse(raw) : {};
      var tk = todayKey();
      if(!all[tk]) all[tk]={};
      all[tk][abbr]=(all[tk][abbr]||0)+1;
      all[tk]._total=(all[tk]._total||0)+1;
      // prune old >14 days
      var keys = Object.keys(all).sort();
      if(keys.length>14){
        keys.slice(0, keys.length-14).forEach(function(k){ delete all[k]; });
      }
      localStorage.setItem(LS_DAILY, JSON.stringify(all));
      // fire to global API free tier
      try{
        fetch(API_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({abbr:abbr})}).catch(function(){});
      }catch(e){}
    }catch(e){}
  }

  // Hook existing lock counter to also bump daily
  var origBump = window._vhBumpTeamDaily;
  window._vhBumpTeamDaily = bumpDaily;

  function fetchGlobal(){
    // try API, fallback to fake seeded data for growthy feel
    return fetch(API_URL, {cache:'no-store'}).then(function(r){ if(!r.ok) throw 0; return r.json(); }).catch(function(){
      // fake global for demo: distribution similar to big markets
      var fake = {
        LAL: 234, GSW: 198, NYK: 176, CHI: 165, BOS: 154, MIA: 132, LAC: 98, PHI: 87, DAL: 76, MIL: 65, DEN: 54, PHX: 43
      };
      // blend with local daily to make you count
      var daily = loadDaily();
      Object.keys(daily).forEach(function(k){
        if(k[0]==='_') return;
        fake[k]=(fake[k]||0)+daily[k]*3;
      });
      return fake;
    });
  }

  function renderBoard(globalCounts, local){
    var container = document.getElementById('team-leaderboard');
    if(!container) return;
    // sort
    var sorted = Object.keys(globalCounts).map(function(abbr){ return {abbr:abbr, count:globalCounts[abbr]}; }).sort(function(a,b){ return b.count - a.count; }).slice(0,10);
    var fav = null;
    try{ fav = localStorage.getItem('vectorHoops.favoriteTeam'); }catch(e){}
    var localDaily = loadDaily();
    var personalTop = Object.keys(localDaily).filter(function(k){return k[0]!=='_';}).sort(function(a,b){ return (localDaily[b]||0)-(localDaily[a]||0); })[0];

    // build HTML
    var html = '<div style="background:#FFFEF7; border:2px solid #111; border-radius:14px; box-shadow:4px 4px 0 #111; padding:12px; margin-top:10px;">';
    html += '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">';
    html += '<div style="font-family:var(--mono); font-size:10px; font-weight:900; letter-spacing:.08em; text-transform:uppercase;">Team locks today — rivalry board</div>';
    html += '<div style="font-family:var(--mono); font-size:9px; opacity:.7;">'+todayKey()+' UTC · local + global</div></div>';
    html += '<div style="display:flex; gap:6px; overflow:auto; padding-bottom:4px; scrollbar-width:none;">';
    sorted.forEach(function(entry, idx){
      var isFav = fav && fav===entry.abbr;
      var isYou = personalTop && personalTop===entry.abbr;
      html += '<a href="/?team='+entry.abbr+'&utm_source=leaderboard&utm_medium=rivalry" style="flex:0 0 auto; display:flex; flex-direction:column; gap:4px; align-items:center; background:'+(isFav?'#111':'#fff')+'; color:'+(isFav?'#fff':'#111')+'; border:1.8px solid #111; border-radius:10px; padding:6px 8px; min-width:54px; text-decoration:none; box-shadow:1.5px 1.5px 0 #111; position:relative;">';
      html += '<span style="font-weight:950; font-size:12px;">'+entry.abbr+'</span>';
      html += '<span style="font-family:var(--mono); font-size:10px; font-weight:800;">'+entry.count+'</span>';
      if(idx===0) html += '<span style="position:absolute; top:-6px; right:-6px; background:#F0E442; color:#111; border:1.5px solid #111; border-radius:999px; padding:1px 4px; font-size:8px; font-weight:900;">👑</span>';
      if(isYou) html += '<span style="font-size:8px; background:#F0E442; color:#111; border:1px solid #111; border-radius:999px; padding:1px 4px; font-weight:900;">YOU</span>';
      html += '</a>';
    });
    html += '</div>';
    // rivalry line
    if(fav && globalCounts[fav]){
      var favCount = globalCounts[fav];
      var topCount = sorted[0] ? sorted[0].count : favCount;
      var rival = sorted[0] && sorted[0].abbr!==fav ? sorted[0].abbr : (sorted[1]?sorted[1].abbr:'LAL');
      var faster = Math.max(5, Math.round((topCount / Math.max(1,favCount) -1)*100));
      // personalized
      if(favCount >= topCount) {
        html += '<div style="margin-top:8px; font-family:var(--mono); font-size:10px; background:#111; color:#fff; border-radius:999px; padding:4px 8px; display:inline-flex; gap:6px; align-items:center;"><span style="background:#F0E442; color:#111; padding:1px 6px; border-radius:999px; font-weight:900;">'+fav+' LEADS</span> You + '+fav+' fans solved '+faster+'% faster than '+rival+' today</div>';
      } else {
        html += '<div style="margin-top:8px; font-family:var(--mono); font-size:10px; background:#fff; color:#111; border:1.5px solid #111; border-radius:999px; padding:4px 8px; display:inline-flex; gap:6px; align-items:center;"><span style="background:#0072B2; color:#fff; padding:1px 6px; border-radius:999px; font-weight:900;">'+rival+' '+faster+'%</span> '+rival+' fans ahead — lock '+fav+' to catch up →</div>';
      }
    } else {
      html += '<div style="margin-top:8px; font-family:var(--mono); font-size:10px; opacity:.7;">Lock your team to join its rivalry race. '+ (personalTop ? 'You locked '+personalTop+' '+ (localDaily[personalTop]||0) +'× today.' : '') +'</div>';
    }
    html += '</div>';
    container.innerHTML = html;
  }

  function init(){
    var anchor = document.getElementById('viral-strip');
    if(!anchor) return;
    var board = document.getElementById('team-leaderboard');
    if(!board){
      board = document.createElement('div');
      board.id='team-leaderboard';
      board.style.cssText='max-width:1120px; margin:0 auto; padding:0 var(--page-gutter); box-sizing:border-box;';
      anchor.parentNode.insertBefore(board, anchor.nextSibling);
    }
    // patch landing-play's bump to also call daily
    var lockBtn = document.getElementById('city-intro-lock');
    if(lockBtn){
      lockBtn.addEventListener('click', function(){
        setTimeout(function(){
          try{
            var sel = document.querySelector('.city-pill.is-active');
            var abbr = sel ? sel.dataset.abbr : null;
            if(!abbr) abbr = localStorage.getItem('vectorHoops.favoriteTeam') || 'CHI';
            if(lockBtn.classList.contains('is-locked')) bumpDaily(abbr);
          }catch(e){}
          refresh();
        }, 100);
      });
    }

    function refresh(){
      var local = loadLocal();
      fetchGlobal().then(function(g){
        renderBoard(g, local);
      });
    }
    refresh();
    setInterval(refresh, 15000);
    // listen fav change
    window.addEventListener('vh:favorite-team', function(){ setTimeout(refresh, 300); });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
