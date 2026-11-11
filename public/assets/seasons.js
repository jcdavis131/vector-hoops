/* Season explorer — reads assets/season_norms.json and eval_scoreboard.json only. */
(function (root) {
  'use strict';

  var FEATURE_LABELS = {
    PTS: 'Points per 100',
    AST: 'Assists per 100',
    OREB: 'Offensive glass per 100',
    DREB: 'Defensive glass per 100',
    STL: 'Steals per 100',
    BLK: 'Blocks per 100',
    TOV: 'Turnovers per 100',
    FG3A: 'Threes attempted per 100',
    FGA: 'Shots attempted per 100',
    FTA: 'Free throws attempted per 100',
    PLUS_MINUS: 'Plus-minus',
    FG3_PCT: 'Three-point rate (not invertible)',
    FG_PCT: 'Field-goal rate (not invertible)',
    FT_PCT: 'Free-throw rate (not invertible)'
  };

  function seasonKeys(fromYear, toYear) {
    var out = [];
    var y;
    for (y = fromYear; y <= toYear; y++) {
      var nxt = (y + 1) % 100;
      out.push(y + '-' + (nxt < 10 ? '0' : '') + nxt);
    }
    return out;
  }

  function missingSeasons(have, fromYear, toYear) {
    var haveSet = {};
    (have || []).forEach(function (s) { haveSet[s] = 1; });
    return seasonKeys(fromYear, toYear).filter(function (s) { return !haveSet[s]; });
  }

  function featureSeries(seasons, key) {
    var out = [];
    Object.keys(seasons || {}).sort().forEach(function (id) {
      var feat = seasons[id].features && seasons[id].features[key];
      if (!feat || typeof feat.mu !== 'number') return;
      out.push({ season: id, n: seasons[id].n, mu: feat.mu, sd: feat.sd });
    });
    return out;
  }

  function pct(x) {
    return (Math.round(Number(x) * 1000) / 10).toFixed(1) + '%';
  }

  function retrievalCard(doc) {
    var test = doc && doc.results && doc.results.mtnn && doc.results.mtnn.by_split && doc.results.mtnn.by_split.test;
    var base = doc && doc.results && doc.results.baseline_transparent_14d && doc.results.baseline_transparent_14d.by_split && doc.results.baseline_transparent_14d.by_split.test;
    if (!test || !base) return null;
    return {
      n: test.n,
      top1: test.top1,
      top5: test.top5,
      base1: base.top1,
      base5: base.top5,
      kicker: 'eval_scoreboard.json · held-out test split',
      metric: pct(test.top1) + ' top-1  ·  ' + pct(test.top5) + ' top-5  (n=' + test.n + ')',
      note: 'Query a player’s season N; a hit is that same player’s season N+1 in the top-k of 12,966 seasons (self excluded). The 14-stat baseline on this split is ' +
        pct(base.top1) + ' / ' + pct(base.top5) + '. This is retrieval, not “accuracy.” Protocol: Methods.'
    };
  }

  function sparkSvg(series) {
    if (!series.length) return '';
    var w = 640, h = 120, p = 8;
    var mus = series.map(function (r) { return r.mu; });
    var lo = Math.min.apply(null, mus);
    var hi = Math.max.apply(null, mus);
    var span = hi - lo || 1;
    var pts = series.map(function (r, i) {
      var x = p + (i / Math.max(series.length - 1, 1)) * (w - p * 2);
      var y = h - p - ((r.mu - lo) / span) * (h - p * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg class="ex-spark" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="League three-attempt volume by season">' +
      '<polyline fill="none" stroke="currentColor" stroke-width="2" points="' + pts + '"/></svg>';
  }

  function mount() {
    var rail = document.getElementById('season-rail');
    var panel = document.getElementById('season-panel');
    var chart = document.getElementById('season-chart');
    var insight = document.getElementById('season-insight');
    if (!rail || !panel) return;
    var params = new URLSearchParams(location.search);
    var pick = params.get('season') || '';

    Promise.all([
      fetch('/assets/season_norms.json?v=bcd38ecb').then(function (r) { return r.json(); }),
      fetch('/assets/eval_scoreboard.json?v=ab6c8762').then(function (r) { return r.json(); })
    ]).then(function (pair) {
      var norms = pair[0];
      var evalDoc = pair[1];
      var have = Object.keys(norms.seasons || {}).sort();
      var calendar = seasonKeys(1996, 2026);
      var gaps = missingSeasons(have, 1996, 2025);
      rail.innerHTML = calendar.map(function (id) {
        var known = !!norms.seasons[id];
        var on = id === pick || (!pick && known && id === have[have.length - 1]);
        if (!pick && on) pick = id;
        var cls = 'pill' + (known ? '' : ' pill--warn');
        return '<a class="' + cls + '" href="/seasons?season=' + encodeURIComponent(id) + '"' +
          (on ? ' aria-current="page"' : '') + '>' + id + '</a>';
      }).join(' ');

      var row = norms.seasons[pick];
      if (!row) {
        panel.innerHTML = '<div class="empty-state"><h2 class="empty-state__title">' + pick + ' is not in the ledger</h2>' +
          '<p class="empty-state__body">season_norms.json has no μ/σ for this year. Charted gaps: ' +
          gaps.join(', ') + '. 2026-27 is in progress — league norms are not in the file yet.</p></div>';
      } else {
        var feats = Object.keys(row.features).sort();
        var cells = feats.map(function (k) {
          var f = row.features[k];
          return '<tr><th scope="row">' + (FEATURE_LABELS[k] || k) + '</th><td>' + f.mu.toFixed(2) + '</td><td>' + f.sd.toFixed(2) + '</td></tr>';
        }).join('');
        panel.innerHTML = '<div class="card"><h2>' + pick + '</h2>' +
          '<p class="sub">' + row.n + ' player-seasons in the norms file. Per 100 possessions, clipped z at 4. Built ' + norms.built + '.</p>' +
          '<table class="ex-table"><thead><tr><th scope="col">Feature</th><th scope="col">League μ</th><th scope="col">League σ</th></tr></thead><tbody>' +
          cells + '</tbody></table></div>';
      }

      var threes = featureSeries(norms.seasons, 'FG3A');
      if (chart) {
        chart.innerHTML = '<div class="card"><h2>Threes attempted per 100</h2>' +
          '<p class="sub">μ from season_norms.json, only seasons that record FG3A. Not a forecast.</p>' +
          sparkSvg(threes) +
          '<p class="sub">Gaps with no norms at all: ' + gaps.join(', ') + '.</p></div>';
      }

      var card = retrievalCard(evalDoc);
      if (insight && card) {
        insight.innerHTML = '<article class="insight-card"><p class="insight-card__kicker">' + card.kicker + '</p>' +
          '<p class="insight-card__metric">' + card.metric + '</p>' +
          '<p class="insight-card__note">' + card.note + '</p>' +
          '<a href="/methods">Methods</a></article>';
      }
    }).catch(function () {
      panel.innerHTML = '<div class="empty-state"><h2 class="empty-state__title">Season ledger failed to load</h2>' +
        '<p class="empty-state__body">Need assets/season_norms.json on this host.</p></div>';
    });
  }

  var api = {
    FEATURE_LABELS: FEATURE_LABELS,
    seasonKeys: seasonKeys,
    missingSeasons: missingSeasons,
    featureSeries: featureSeries,
    retrievalCard: retrievalCard,
    mount: mount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VHSeasons = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
})(typeof window !== 'undefined' ? window : this);
