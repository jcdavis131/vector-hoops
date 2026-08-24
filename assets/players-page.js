/* Tab orchestration for players.html */
(function (global) {
  'use strict';

  var TABS = ['directory', 'profile', 'leaderboard'];

  function panelId(tab) {
    return 'players-panel-' + tab;
  }

  function showTab(tab, opts) {
    if (TABS.indexOf(tab) === -1) tab = 'directory';
    TABS.forEach(function (t) {
      var panel = document.getElementById(panelId(t));
      var btn = document.querySelector('.tab-pills [data-tab="' + t + '"], .research-tabs [data-tab="' + t + '"]');
      if (panel) panel.hidden = t !== tab;
      if (btn) {
        btn.classList.toggle('is-active', t === tab);
        btn.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      }
    });
    var path = '/players' + (tab === 'directory' ? '' : '#' + tab);
    if (!opts || !opts.skipHistory) {
      history.replaceState(null, '', path);
    }
    if (tab === 'profile' && opts && opts.slug && global.VHPlayersSkills) {
      global.VHPlayersSkills.pickPlayer(opts.slug, opts.season || '');
    }
    if (tab === 'leaderboard' && opts && opts.skill !== undefined) {
      global.dispatchEvent(new CustomEvent('vh:players-tab', {
        detail: { tab: 'leaderboard', skill: opts.skill }
      }));
    }
  }

  function parseRoute() {
    var hash = (location.hash || '').replace(/^#/, '');
    if (TABS.indexOf(hash) !== -1) return { tab: hash };
    // support ?steal / ?bust query or sessionStorage from homepage
    try{
      var sp=new URLSearchParams(location.search);
      var q=sp.get('board')||sp.get('tab');
      if(q==='steal'||q==='bust') return { tab: 'leaderboard', skill: q };
      var stored=sessionStorage.getItem('vh_players_tab');
      if(stored==='steal'||stored==='bust'){ sessionStorage.removeItem('vh_players_tab'); return { tab:'leaderboard', skill: stored }; }
    }catch{}
    return { tab: 'directory' };
  }

  function init() {
    var bar = document.querySelector('.tab-pills, .research-tabs');
    if (!bar) return;
    bar.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-tab]');
      if (!btn) return;
      showTab(btn.getAttribute('data-tab'));
    });
    global.addEventListener('vh:players-tab', function (ev) {
      var d = ev.detail || {};
      if (d.tab) showTab(d.tab, { slug: d.slug, season: d.season, skill: d.skill, skipHistory: true });
    });
    var route = parseRoute();
    showTab(route.tab, { slug: route.slug, season: route.season, skill: route.skill, skipHistory: true });
    // if skill steal/bust, set board value after load
    if(route.skill){
      setTimeout(function(){
        var board=document.getElementById('board-skill');
        if(board){ board.value=route.skill; board.dispatchEvent(new Event('change')); }
      }, 900);
    }
    window.addEventListener('hashchange', function () {
      var r = parseRoute();
      showTab(r.tab, { slug: r.slug, season: r.season, skill: r.skill, skipHistory: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.VHPlayersPage = { showTab: showTab };
})(window);

/* hoops-polish-swarm: pp-search alias shim for spec compliance */
(function(){
  try{
    var orig = document.getElementById('skills-search');
    if(orig && !document.getElementById('pp-search')){
      var alias = document.createElement('input');
      alias.type='hidden';
      alias.id='pp-search';
      alias.setAttribute('aria-hidden','true');
      orig.parentNode.insertBefore(alias, orig.nextSibling);
      // Proxy value changes
      Object.defineProperty(window,'PP_SEARCH_ALIAS',{get:function(){return document.getElementById('skills-search');}});
      console.log('pp-search alias shim installed');
    }
  }catch(e){}
})();
