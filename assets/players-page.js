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
      var btn = document.querySelector('.research-tabs [data-tab="' + t + '"]');
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
    return { tab: 'directory' };
  }

  function init() {
    var bar = document.querySelector('.research-tabs');
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
    showTab(route.tab, { slug: route.slug, season: route.season, skipHistory: true });
    window.addEventListener('hashchange', function () {
      var r = parseRoute();
      showTab(r.tab, { slug: r.slug, season: r.season, skipHistory: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.VHPlayersPage = { showTab: showTab };
})(window);
