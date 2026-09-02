/* Shared top navigation — mount on <nav class="site-nav" data-active="/path"> */
(function (global) {
  'use strict';

  var LINKS = [
    { href: '/', label: 'Map', title: 'Human map — 12,966 player-seasons, where you stood' },
    { href: '/play', label: 'Play', title: 'Daily Court 5× Past→Modern + Pack Battle' },
    { href: '/players', label: 'Players', title: 'Player dossiers — where you stood, how you grew' },
    { href: '/model', label: 'Lab', title: 'MTNN Training Cockpit + Architecture + where you\'re headed forecast' },
    { href: '/trends', label: 'Trends', title: 'Trend Research — 30 seasons drift + forecast' },
    { href: '/methods', label: 'Methods', title: 'Every number recomputable — sources + math' },
  ];

  function mount() {
    var nav = document.querySelector('.site-nav');
    if (!nav) return;
    var active = nav.getAttribute('data-active') || '';
    var linksHtml = LINKS.map(function (l) {
      var isActive = active === l.href ||
        (active === '/players' && l.href === '/players') ||
        (active === '/trends' && l.href === '/trends') ||
        (active === '/model' && l.href === '/model') ||
        (active === '/methods' && l.href === '/methods') ||
        (active === '/leaderboard' && l.href === '/play') ||
        (active === '/teams' && l.href === '/players');
      return '<a class="site-nav__link' + (isActive ? ' is-active' : '') + '"' +
        ' href="' + l.href + '"' +
        (l.title ? ' title="' + l.title + '"' : '') +
        (isActive ? ' aria-current="page"' : '') +
        '>' + l.label + '</a>';
    }).join('');
    nav.innerHTML =
      '<a class="site-nav__brand" href="/">VECTOR<span class="site-nav__accent">HOOPS</span></a>' +
      '<div class="site-nav__links">' + linksHtml + '</div>';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  global.VHSiteNav = { mount: mount, links: LINKS };
})(window);
