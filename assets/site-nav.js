/* Shared top navigation — mount on <nav class="site-nav" data-active="/path"> */
(function (global) {
  'use strict';

  var LINKS = [
    { href: '/play', label: 'Play', title: '8 era-honest games — Chimera daily + 7 more' },
    { href: '/model', label: 'Lab', title: 'MTNN Training Cockpit + Architecture + Glass-box Explorer' },
    { href: '/trends', label: 'Trends', title: 'Trend Research — 30 seasons measured geometry' },
    { href: '/players', label: 'Players', title: 'Player References — directory + dossiers + skill grades' },
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
