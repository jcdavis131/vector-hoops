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

  function renderSources(sources) {
    var el = document.getElementById('sources');
    var names = Object.keys(sources).sort();
    el.innerHTML = names.map(function (name) {
      var s = sources[name] || {};
      var st = s.status || 'unknown';
      return '<div class="fh-card"><header>' +
        '<span class="fh-dot ' + esc(st) + '"></span>' +
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
    return names.map(function (n) { return sources[n].status; });
  }

  function renderSnapshot(snap) {
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
    el.innerHTML = '<div class="fh-card"><header>' +
      '<span class="fh-dot ' + (snap.quiet ? 'degraded' : 'ok') + '"></span>' +
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
    return ['ok'];
  }

  function overall(statuses) {
    var el = document.getElementById('overall');
    var st = statuses.indexOf('down') >= 0 ? 'down'
      : statuses.indexOf('degraded') >= 0 ? 'degraded' : 'ok';
    var msg = st === 'ok' ? 'All sources healthy.'
      : st === 'degraded' ? 'Degraded: at least one source is stale.'
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
      var statuses = [];
      if (health && health.sources) statuses = statuses.concat(renderSources(health.sources));
      else {
        document.getElementById('sources').innerHTML =
          window.Realtime.degradedCard({ source: 'The feed-health ledger', lastGoodIso: 'unknown' });
        statuses.push('down');
      }
      statuses = statuses.concat(renderSnapshot(snap));
      overall(statuses);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
