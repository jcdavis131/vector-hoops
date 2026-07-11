/* Shared top navigation — mount on <nav class="site-nav" data-active="/path"> */
(function (global) {
  'use strict';

  var LINKS = [
    { href: '/play', label: 'Play' },
    { href: '/model', label: 'Network', title: 'MTNN Network Explorer' },
    { href: '/trends', label: 'Trends', title: 'Trend Research' },
    { href: '/players', label: 'Players', title: 'Player References' },
    { href: '/teams', label: 'Teams', title: 'Team Labs' },
    { href: '/methods', label: 'Methods' },
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/dashboard', label: 'Lab', title: 'Dumbmodel Lab — Data→Clean→Train→Eval' },
  ];

  function mount() {
    var nav = document.querySelector('.site-nav');
    if (!nav) return;
    var active = nav.getAttribute('data-active') || '';
    var linksHtml = LINKS.map(function (l) {
      var isActive = active === l.href ||
        (active === '/players' && (l.href === '/players')) ||
        (active === '/trends' && l.href === '/trends') ||
        (active === '/model' && l.href === '/model') ||
        (active === '/teams' && l.href === '/teams');
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
