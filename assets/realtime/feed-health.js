/* Feed-health dashboard renderer (internal page). Zero dependencies beyond
 * assets/realtime/realtime.js. Reads the deployed snapshots only — this page
 * reports on the pipeline; it is never a live ticker. */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* The staleness rule status.html states and scripts/build_status.py holds as
   * FEED_STALE_AFTER_MINUTES: a source whose last good tick is older than this
   * is stale, whatever status the ledger recorded. */
  var STALE_AFTER_MINUTES = 120;

  /* (recorded status, last_good_tick, now ms) -> the status to show.
   * 'down' stays down; an unreadable tick or one older than the limit is
   * 'stale'; anything else keeps the recorded status. */
  function shownStatus(recorded, lastGoodTick, nowMs) {
    if (recorded === 'down') return 'down';
    var t = Date.parse(lastGoodTick);
    if (isNaN(t)) return 'stale';
    if ((nowMs - t) / 60000 > STALE_AFTER_MINUTES) return 'stale';
    return recorded || 'unknown';
  }

  /* The dot colours come from feed-health.html: stale takes the degraded dot. */
  function dotClass(st) { return st === 'stale' ? 'degraded' : st; }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { shownStatus: shownStatus, STALE_AFTER_MINUTES: STALE_AFTER_MINUTES };
    return;
  }

  function relTime(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return 'unknown';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' hr ago';
    return Math.round(s / 86400) + ' d ago';
  }

  function latency(v) {
    return v == null ? 'unknown' : v + ' ms';
  }

  function failures(n) {
    if (n == null) return 'unknown';
    return n === 0 ? '0' : n + ' — needs attention';
  }

  function renderSources(sources, now) {
    var el = document.getElementById('sources');
    var names = Object.keys(sources).sort();
    el.innerHTML = names.map(function (name) {
      var s = sources[name] || {};
      var st = shownStatus(s.status || 'unknown', s.last_good_tick, now);
      return '<div class="fh-card"><header>' +
        '<span class="fh-dot ' + esc(dotClass(st)) + '"></span>' +
        '<h3>' + esc(name) + '</h3>' +
        window.Realtime.staleBadge(s.last_good_tick || 'unknown') +
        '</header><dl class="fh-grid">' +
        '<div><dt>Status</dt><dd>' + esc(st) + '</dd></div>' +
        '<div><dt>Last good tick</dt><dd>' + esc(s.last_good_tick || 'unknown') +
        ' (' + relTime(s.last_good_tick) + ')</dd></div>' +
        '<div><dt>Latency</dt><dd>' + esc(latency(s.latency_ms)) + '</dd></div>' +
        '<div><dt>Consecutive failures</dt><dd>' + esc(failures(s.consecutive_failures)) + '</dd></div>' +
        '</dl><p class="fh-detail">' + esc(s.detail || 'no detail recorded') + '</p></div>';
    }).join('');
    return names.map(function (n) {
      return shownStatus((sources[n] || {}).status || 'unknown', (sources[n] || {}).last_good_tick, now);
    });
  }

  function renderSnapshot(snap, now) {
    var el = document.getElementById('snapshot');
    if (!snap) {
      el.innerHTML = window.Realtime.degradedCard({
        source: 'The game-night snapshot file',
        lastGoodIso: 'unknown',
        retry: false
      });
      return ['down'];
    }
    var games = snap.games || [];
    var age = shownStatus('ok', snap.as_of, now);
    var shown = (age === 'stale' || snap.quiet) ? 'degraded' : 'ok';
    el.innerHTML = '<div class="fh-card"><header>' +
      '<span class="fh-dot ' + dotClass(shown) + '"></span>' +
      '<h3>scoreboard.json</h3>' +
      window.Realtime.staleBadge(snap.as_of || 'unknown') +
      '</header><dl class="fh-grid">' +
      '<div><dt>Season</dt><dd>' + esc(snap.season || 'unknown') + '</dd></div>' +
      '<div><dt>Live</dt><dd>' + esc(snap.games_live) + '</dd></div>' +
      '<div><dt>Scheduled</dt><dd>' + esc(snap.games_scheduled) + '</dd></div>' +
      '<div><dt>Final</dt><dd>' + esc(snap.games_final) + '</dd></div>' +
      '<div><dt>Quiet hours</dt><dd>' + (snap.quiet ? 'yes' : 'no') + '</dd></div>' +
      '<div><dt>Snapshot date</dt><dd>' + esc(snap.date || 'unknown') + ' ET</dd></div>' +
      '</dl><p class="fh-detail">Games: ' + esc(games.map(function (g) {
        var a = (g.away || {}).abbr || '?', h = (g.home || {}).abbr || '?';
        var sc = g.state === 'pre' ? '–' : ((g.away || {}).score + '–' + (g.home || {}).score);
        return a + ' @ ' + h + ' ' + sc + ' (' + g.state + ')';
      }).join(' · ') || 'none') + '</p></div>';
    return [age];
  }

  function overall(statuses) {
    var el = document.getElementById('overall');
    var st = statuses.indexOf('down') >= 0 ? 'down'
      : (statuses.indexOf('stale') >= 0 || statuses.indexOf('degraded') >= 0) ? 'degraded' : 'ok';
    var msg = st === 'ok' ? 'All sources healthy.'
      : st === 'degraded' ? 'Degraded: at least one source is stale (last good tick older than ' +
        STALE_AFTER_MINUTES + ' min) or degraded.'
      : 'Down: at least one source is failing — last-known snapshots in use.';
    el.innerHTML = '<span class="fh-dot ' + st + '"></span><strong>' + esc(msg) + '</strong>';
  }

  function boot() {
    if (!window.Realtime) {
      document.getElementById('overall').textContent = 'Component failed to load.';
      return;
    }
    Promise.all([
      window.Realtime.loadJson('assets/realtime/feed_health.json'),
      window.Realtime.loadJson('assets/realtime/scoreboard.json')
    ]).then(function (pair) {
      var health = pair[0], snap = pair[1];
      var statuses = [], now = Date.now();
      if (health && health.sources) statuses = statuses.concat(renderSources(health.sources, now));
      else {
        document.getElementById('sources').innerHTML =
          window.Realtime.degradedCard({ source: 'The feed-health ledger', lastGoodIso: 'unknown' });
        statuses.push('down');
      }
      statuses = statuses.concat(renderSnapshot(snap, now));
      overall(statuses);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
