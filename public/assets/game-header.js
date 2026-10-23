/* assets/game-header.js — ONE game header, identical markup on both surfaces.
 *
 * GameHeader.render(el, {a, h, venue, when, state}) — matchup, date/venue,
 * and the SCHEDULED / LIVE / FINAL state badge. Mounted in the live stickybar
 * and in replay's #gameHeader. The badge is what tells the fan which row
 * they're in — the page never makes them guess (courtside-replay/SPEC.md §2b).
 *
 * Stdlib only. Deferred classic script; also require()-able in node.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var BADGES = {
    pre: ['gh-pre', 'SCHEDULED'],
    in: ['gh-live', 'LIVE'],
    post: ['gh-final', 'FINAL']
  };

  /* Pure: the header HTML string. a/h: {abbr, name}; venue/when: strings. */
  function html(a, h, venue, when, state) {
    var b = BADGES[state] || BADGES.pre;
    return '<div class="gh">' +
      '<span class="gh-badge ' + b[0] + '">' + b[1] + '</span>' +
      '<span class="gh-match">' + esc(a && a.abbr) + ' @ ' + esc(h && h.abbr) + '</span>' +
      (when ? '<span class="gh-when">' + esc(when) + '</span>' : '') +
      (venue ? '<span class="gh-venue">' + esc(venue) + '</span>' : '') +
      '</div>';
  }

  /* Pure: badge-only HTML for tight spaces (live stickybar clock row). */
  function badge(state) {
    var b = BADGES[state] || BADGES.pre;
    return '<span class="gh-badge ' + b[0] + '">' + b[1] + '</span>';
  }

  function render(el, opts) {
    if (!el) return false;
    opts = opts || {};
    el.innerHTML = html(opts.a, opts.h, opts.venue, opts.when, opts.state);
    return true;
  }

  var api = { html: html, badge: badge, render: render, BADGES: BADGES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.GameHeader = api);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
