/* Realtime data-plane client components — Pillar 2.
 *
 * Staleness badges ("every number carries its as-of") and the honest-degraded
 * 503 card (feed down -> last-known, never invented numbers). Consumes the
 * server-side snapshots at assets/realtime/*.json produced by
 * scripts/realtime/*.py. Zero dependencies.
 *
 * Usage:
 *   Realtime.staleBadge(asOfIso) -> HTML string for a freshness badge
 *   Realtime.badgeClass(asOfIso) -> 'rt-fresh' | 'rt-aging' | 'rt-stale'
 *   Realtime.degradedCard({source, lastGoodIso, retry}) -> HTML string
 *   Realtime.loadJson(url) -> Promise<json|null>  (null on failure, no throw)
 */
(function (global) {
  'use strict';

  var SNAPSHOT = 'assets/realtime/scoreboard.json';

  /* Freshness policy: <2min live, <15min aging, beyond that "last known".
   * The snapshot only ever shows its own as_of — staleness is never hidden. */
  var FRESH_S = 120, AGING_S = 900;

  function ageSeconds(asOfIso) {
    var t = Date.parse(asOfIso);
    if (isNaN(t)) return Infinity;
    return Math.max(0, (Date.now() - t) / 1000);
  }

  function badgeClass(asOfIso) {
    var a = ageSeconds(asOfIso);
    if (a <= FRESH_S) return 'rt-fresh';
    if (a <= AGING_S) return 'rt-aging';
    return 'rt-stale';
  }

  function fmtTime(asOfIso) {
    var t = Date.parse(asOfIso);
    if (isNaN(t)) return 'unknown';
    return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function fmtAgo(asOfIso) {
    var a = ageSeconds(asOfIso);
    if (!isFinite(a)) return 'time unknown';
    if (a < 60) return 'just now';
    if (a < 3600) return Math.round(a / 60) + ' min ago';
    return Math.round(a / 3600) + ' hr ago';
  }

  /* Staleness badge: every number carries its as-of. Unknown fields stay
   * unknown — the badge says so rather than guessing. */
  function staleBadge(asOfIso) {
    if (!asOfIso || asOfIso === 'unknown') {
      return '<span class="rt-badge rt-stale" role="status">as of unknown — last known</span>';
    }
    var cls = badgeClass(asOfIso);
    var label = cls === 'rt-fresh' ? 'live'
      : cls === 'rt-aging' ? 'as of ' + fmtTime(asOfIso) + ' — aging'
      : 'as of ' + fmtTime(asOfIso) + ' — last known';
    return '<span class="rt-badge ' + cls + '" role="status" title="Data timestamp: ' +
      asOfIso + '">' + label + ' · ' + fmtAgo(asOfIso) + '</span>';
  }

  /* Honest degradation: HTTP 503 in spirit. The card names the failed source,
   * shows the last-known timestamp, and links nothing fresher — because there
   * is nothing fresher. Never renders invented numbers. */
  function degradedCard(opts) {
    opts = opts || {};
    var source = opts.source || 'the live feed';
    var lastGood = opts.lastGoodIso || 'unknown';
    var retry = opts.retry ? '<button class="rt-retry" type="button">Retry</button>' : '';
    return '<div class="rt-degraded" role="alert">' +
      '<div class="rt-degraded__code">503</div>' +
      '<div class="rt-degraded__body">' +
      '<p class="rt-degraded__title">Live feed unavailable</p>' +
      '<p>' + source + ' did not answer. Showing the last-known snapshot ' +
      'from ' + (lastGood === 'unknown' ? 'an unknown time' : fmtTime(lastGood) + ' (' + fmtAgo(lastGood) + ')') +
      ' — nothing below this point is fresh.</p>' +
      retry +
      '</div></div>';
  }

  /* Fetch JSON, never throwing: returns null on any failure so callers can
   * degrade. Uses no-store so the long-lived asset cache never masks a
   * newer deployed snapshot. */
  function loadJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function () { return null; });
  }

  function loadSnapshot() { return loadJson(SNAPSHOT); }

  global.Realtime = {
    staleBadge: staleBadge,
    badgeClass: badgeClass,
    degradedCard: degradedCard,
    loadJson: loadJson,
    loadSnapshot: loadSnapshot,
    SNAPSHOT: SNAPSHOT,
    fmtTime: fmtTime
  };
})(typeof window !== 'undefined' ? window : this);
