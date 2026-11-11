/* Compare two player-seasons using compare_index.json (from player_index + skills). */
(function (root) {
  'use strict';

  function parsePair(raw) {
    var s = String(raw || '');
    var i = s.lastIndexOf(':');
    if (i <= 0) return { name: s.trim(), season: '' };
    return { name: s.slice(0, i).trim(), season: s.slice(i + 1).trim() };
  }

  function findRow(rows, name, season) {
    name = String(name || '').toLowerCase();
    var hits = (rows || []).filter(function (r) { return String(r[0]).toLowerCase() === name; });
    if (!hits.length) {
      hits = (rows || []).filter(function (r) { return String(r[0]).toLowerCase().indexOf(name) !== -1; });
    }
    if (!hits.length) return null;
    if (season) {
      var exact = hits.filter(function (r) { return r[1] === season; })[0];
      if (exact) return exact;
    }
    return hits[hits.length - 1];
  }

  function deltas(a, b) {
    if (!a || !b) return [];
    var ga = a[3]; var gb = b[3];
    return ga.map(function (v, i) { return v - gb[i]; });
  }

  function pairKey(row) {
    return row[0] + ':' + row[1];
  }

  function optionsFor(rows, q) {
    q = String(q || '').trim().toLowerCase();
    var out = [];
    var seen = {};
    (rows || []).forEach(function (r) {
      var label = r[0] + ' · ' + r[1];
      if (q && label.toLowerCase().indexOf(q) === -1) return;
      if (seen[label]) return;
      seen[label] = 1;
      out.push(r);
    });
    return out.slice(0, 12);
  }

  function barRow(label, va, vb) {
    return '<div class="ex-skill"><span>' + label + '</span>' +
      '<span class="num">' + va + '</span>' +
      '<span class="ex-bars" aria-hidden="true"><i style="width:' + va + '%"></i><i style="width:' + vb + '%"></i></span>' +
      '<span class="num">' + vb + '</span></div>';
  }

  function mount() {
    var aIn = document.getElementById('cmp-a');
    var bIn = document.getElementById('cmp-b');
    var aList = document.getElementById('cmp-a-list');
    var bList = document.getElementById('cmp-b-list');
    var board = document.getElementById('cmp-board');
    var insight = document.getElementById('cmp-insight');
    if (!aIn || !board) return;
    var params = new URLSearchParams(location.search);
    var aQ = params.get('a') || '';
    var bQ = params.get('b') || '';

    Promise.all([
      fetch('/assets/compare_index.json?v=d5704ab6').then(function (r) { return r.json(); }),
      fetch('/assets/arc_priors_2026-27.json?v=aeacbf84').then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (pair) {
      var idx = pair[0];
      var priors = pair[1];
      var rows = idx.rows || [];
      var labels = (idx.skills || []).map(function (s) { return s.label; });
      if (insight) {
        var mae = priors && priors.forecaster_metrics;
        var maeLine = mae
          ? ('Ridge prior macro MAE ' + Number(mae.challenger.macro_mae).toFixed(3) +
            ' vs last-season ' + Number(mae.naive_last.macro_mae).toFixed(3) +
            ' vs 3-year average ' + Number(mae.avg3.macro_mae).toFixed(3) +
            ' (arc_priors_2026-27.json). That is z-space error, not shooting percentage.')
          : '2026-27 prior MAE is in arc_priors_2026-27.json when that file is present.';
        insight.innerHTML = '<article class="insight-card"><p class="insight-card__kicker">skills.json · within-season percentile</p>' +
          '<p class="insight-card__metric">0–99 grades · badge ' + idx.badgeGrade + ' · gold ' + idx.goldGrade + '</p>' +
          '<p class="insight-card__note">' + (idx.note || 'Within-season percentiles, not forecasts.') + ' ' + maeLine + '</p>' +
          '<a href="/methods">Methods</a></article>';
      }

      function paintLists(input, box, which) {
        var hits = optionsFor(rows, input.value);
        box.innerHTML = hits.map(function (r) {
          return '<button type="button" class="site-jump__item" data-pair="' + pairKey(r).replace(/"/g, '') + '">' +
            r[0] + ' · ' + r[1] + '</button>';
        }).join('') || '<p class="sub">No rows match.</p>';
        box.querySelectorAll('[data-pair]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (which === 'a') aQ = btn.getAttribute('data-pair');
            else bQ = btn.getAttribute('data-pair');
            history.replaceState(null, '', '/compare?a=' + encodeURIComponent(aQ) + '&b=' + encodeURIComponent(bQ));
            draw();
          });
        });
      }

      function draw() {
        var pa = parsePair(aQ); var pb = parsePair(bQ);
        aIn.value = aQ; bIn.value = bQ;
        var ra = aQ ? findRow(rows, pa.name, pa.season) : null;
        var rb = bQ ? findRow(rows, pb.name, pb.season) : null;
        if (!ra || !rb) {
          board.innerHTML = '<div class="empty-state"><h2 class="empty-state__title">Pick two player-seasons</h2>' +
            '<p class="empty-state__body">Type a name. Grades come from compare_index.json, a compact projection of player_index.json and skills.json. Nothing here is a prediction.</p></div>';
          return;
        }
        var bars = labels.map(function (lab, i) { return barRow(lab, ra[3][i], rb[3][i]); }).join('');
        board.innerHTML = '<div class="card"><div class="ex-cmp-head"><h2>' + ra[0] + ' · ' + ra[1] + '</h2><h2>' + rb[0] + ' · ' + rb[1] + '</h2></div>' +
          '<p class="sub">' + (ra[2] || '') + ' vs ' + (rb[2] || '') + '</p>' + bars +
          '<p class="sub"><a href="/players?q=' + encodeURIComponent(ra[0]) + '">Open ' + ra[0] + ' in Players</a> · ' +
          '<a href="/players?q=' + encodeURIComponent(rb[0]) + '">Open ' + rb[0] + '</a></p></div>';
      }

      aIn.addEventListener('input', function () { aQ = aIn.value; paintLists(aIn, aList, 'a'); });
      bIn.addEventListener('input', function () { bQ = bIn.value; paintLists(bIn, bList, 'b'); });
      if (aQ) paintLists({ value: parsePair(aQ).name }, aList, 'a');
      else paintLists(aIn, aList, 'a');
      if (bQ) paintLists({ value: parsePair(bQ).name }, bList, 'b');
      else paintLists(bIn, bList, 'b');
      draw();
    }).catch(function () {
      board.innerHTML = '<div class="empty-state"><h2 class="empty-state__title">compare_index.json failed to load</h2>' +
        '<p class="empty-state__body">Generate it with scripts/build_compare_index.py from player_index.json and skills.json.</p></div>';
    });
  }

  var api = { parsePair: parsePair, findRow: findRow, deltas: deltas, optionsFor: optionsFor, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VHCompare = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
})(typeof window !== 'undefined' ? window : this);
