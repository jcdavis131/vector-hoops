/* Shared top navigation — mount on <nav class="site-nav" data-active="/path">
 * Three columns on one axis: brand · sections · call to action.
 */
(function (global) {
  'use strict';

  var LINKS = [
    { href: '/', label: 'Atlas', title: 'The map of 12,966 player-seasons' },
    { href: '/play', label: 'Play', title: 'Daily Court: five past All-Stars, find each modern twin' },
    { href: '/players', label: 'Players', title: 'Directory, skill profiles and leaderboards' },
    { href: '/taxonomy', label: 'Taxonomy', title: '22 play-style archetypes across 5 families, from 2,426 careers' },
    { href: '/model', label: 'Lab', title: 'How the embedding model is trained and evaluated' },
    { href: '/trends', label: 'Trends', title: 'Thirty seasons of league drift' },
    { href: '/insights', label: 'Insights', title: 'What the model learned: shareable findings from 12,966 player-seasons' },
    { href: '/playoff-runs', label: 'Playoff Runs', title: 'The 42 greatest postseason runs ever: players, duos, trios, teams' },
    { href: '/methods', label: 'Methods', title: 'Sources, features and the maths behind every number' },
    { href: '/research', label: 'Research', title: 'The lab: rankings, taxonomy and the frontier ML program' }
  ];

  // Centre circle of a court, seen from above: the site's mark.
  var MARK = '<svg class="site-nav__mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<circle cx="12" cy="12" r="10.25" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    '<line x1="1.75" y1="12" x2="22.25" y2="12" stroke="currentColor" stroke-width="1.5"/>' +
    '<circle cx="12" cy="12" r="3.25" fill="currentColor"/></svg>';

  function isActive(active, href) {
    if (active === href) return true;
    if (active === '/leaderboard' && href === '/play') return true;
    if (active === '/everyday' && href === '/play') return true;
    if (active === '/teams' && href === '/players') return true;
    return false;
  }

  function mount() {
    var nav = document.querySelector('.site-nav');
    if (!nav || nav.getAttribute('data-mounted') === '1') return;
    var active = nav.getAttribute('data-active') || '';
    var linksHtml = LINKS.map(function (l) {
      var on = isActive(active, l.href);
      return '<a class="site-nav__link' + (on ? ' is-active' : '') + '" href="' + l.href + '" title="' + l.title + '"' +
        (on ? ' aria-current="page"' : '') + '>' + l.label + '</a>';
    }).join('');
    var end = active === '/play'
      ? '<span class="site-nav__meta">1996–97 → 2025–26</span>'
      : '<span class="site-nav__meta">12,966 seasons</span><a class="site-nav__cta" href="/play">Play today</a>';
    if (!nav.getAttribute('aria-label')) nav.setAttribute('aria-label', 'Primary');
    nav.innerHTML =
      '<a class="site-nav__brand" href="/" aria-label="Vector Hoops, home">' + MARK + '<span>Vector<span class="site-nav__accent"> Hoops</span></span></a>' +
      '<div class="site-nav__links">' + linksHtml + '</div>' +
      '<div class="site-nav__end">' + end + '</div>';
    nav.setAttribute('data-mounted', '1');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  global.VHSiteNav = { mount: mount, links: LINKS };
})(window);
