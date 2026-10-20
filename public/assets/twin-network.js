/* Vector Hoops Twin Networks — graphsketball-style node-link explorer over the
   MTNN v5 64-d embedding, plus a 4-stage Stat Flow Sankey. No dependencies.
   k-NN runs client-side (12,966 x 64 cosine sims per query); Twin Centrality
   comes from the precomputed assets/twin_centrality.json. */
(function (global) {
  'use strict';

  var VOID = '#1E2022', PAPER = '#F9F6F0', TERRA = '#C17C60',
      GOLD = '#D4AF69', MUTED = '#8b8578', LINE = '#3a3d40';

  var NAME_FIXES = {
    'Shai GilgeousAlexander': 'Shai Gilgeous-Alexander',
    'KarlAnthony Towns': 'Karl-Anthony Towns',
    'Michael CarterWilliams': 'Michael Carter-Williams',
    "Shaquille ONeal": "Shaquille O'Neal",
    "Jermaine ONeal": "Jermaine O'Neal",
    'Royce ONeale': "Royce O'Neale"
  };

  var K_SHOW = 8;

  function pretty(name) { return NAME_FIXES[name] || name; }
  function shortSeason(s) { var p = s.split('-'); return "'" + p[0].slice(2) + '-' + p[1]; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function get(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r;
    });
  }

  var state = {
    players: null, byId: null, names: null,
    counts: null, rankOf: null,
    emb: null, norms: null, n: 0,
    twins: null, // "name|season" -> twin entry
    current: null
  };

  /* ---------- data ---------- */

  function loadAll() {
    return Promise.all([
      get('assets/player_index.json').then(function (r) { return r.json(); }),
      get('assets/twin_centrality.json').then(function (r) { return r.json(); }),
      get('assets/mtnn_embeddings.f32').then(function (r) { return r.arrayBuffer(); }),
      get('assets/eratwins.json').then(function (r) { return r.json(); }).catch(function () { return { players: [] }; })
    ]).then(function (res) {
      var idx = res[0], cen = res[1], buf = res[2], tw = res[3];
      state.players = idx.players;
      state.byId = {};
      state.players.forEach(function (p) { state.byId[p.id] = p; });
      var seen = {}, names = [];
      state.players.forEach(function (p) {
        if (!seen[p.name]) { seen[p.name] = []; names.push(p.name); }
        seen[p.name].push(p);
      });
      names.sort();
      Object.keys(seen).forEach(function (nm) {
        seen[nm].sort(function (a, b) { return a.season < b.season ? -1 : 1; });
      });
      state.names = { list: names, byName: seen };
      state.counts = cen.counts;
      var order = cen.counts.map(function (c, i) { return i; })
        .sort(function (a, b) { return cen.counts[b] - cen.counts[a]; });
      state.rankOf = {};
      order.forEach(function (id, r) { state.rankOf[id] = r + 1; });
      var f32 = new Float32Array(buf);
      state.n = cen.n;
      state.emb = f32;
      var norms = new Float32Array(state.n);
      for (var i = 0; i < state.n; i++) {
        var s = 0, off = i * 64;
        for (var d = 0; d < 64; d++) s += f32[off + d] * f32[off + d];
        norms[i] = Math.sqrt(s) || 1;
      }
      state.norms = norms;
      state.twins = {};
      (tw.players || []).forEach(function (t) {
        state.twins[t.name.toLowerCase() + '|' + t.season] = t;
      });
    });
  }

  function topNeighbors(id, k) {
    var emb = state.emb, norms = state.norms, n = state.n;
    var off = id * 64, na = norms[id];
    var scored = [];
    for (var j = 0; j < n; j++) {
      if (j === id) continue;
      var dot = 0, offj = j * 64;
      for (var d = 0; d < 64; d++) dot += emb[off + d] * emb[offj + d];
      scored.push([dot / (na * norms[j]), j]);
    }
    scored.sort(function (a, b) { return b[0] - a[0]; });
    return scored.slice(0, k).map(function (s) { return { id: s[1], sim: s[0] }; });
  }

  /* ---------- network SVG ---------- */

  function networkSVG(p, neighbors) {
    var W = 620, H = 320, cx = W / 2, cy = H / 2 - 10, R = 118;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vh-ins__viz" role="img" aria-label="twin network of ' + esc(pretty(p.name)) + '">';
    neighbors.forEach(function (nb, i) {
      var a = (i / neighbors.length) * Math.PI * 2 - Math.PI / 2;
      var x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      nb._x = x; nb._y = y;
      var w = Math.max(1.5, (nb.sim - 0.5) * 14);
      s += '<line x1="' + cx.toFixed(1) + '" y1="' + cy.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) +
        '" stroke="' + TERRA + '" stroke-width="' + w.toFixed(1) + '" opacity="0.75"/>';
    });
    neighbors.forEach(function (nb) {
      var q = state.byId[nb.id];
      var lx = nb._x, ly = nb._y + 30;
      s += '<circle cx="' + nb._x.toFixed(1) + '" cy="' + nb._y.toFixed(1) + '" r="15" fill="' + TERRA + '" opacity="0.9"/>';
      s += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle" class="vh-ins__svglabel">' +
        esc(pretty(q.name)) + '</text>';
      s += '<text x="' + lx.toFixed(1) + '" y="' + (ly + 15).toFixed(1) + '" text-anchor="middle" class="vh-ins__svgval">' +
        esc(shortSeason(q.season)) + ' · ' + nb.sim.toFixed(3) + '</text>';
    });
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="24" fill="' + GOLD + '"/>';
    s += '<text x="' + cx + '" y="' + (cy + 42) + '" text-anchor="middle" class="vh-ins__svgval">' +
      esc(pretty(p.name)) + '</text>';
    s += '<text x="' + cx + '" y="' + (cy + 58) + '" text-anchor="middle" class="vh-ins__svglabel">' +
      esc(shortSeason(p.season)) + ' · ' + esc(p.decade) + '</text>';
    return s + '</svg>';
  }

  /* ---------- stat flow (Sankey-style) SVG ---------- */

  function wrap2(name) {
    // split long archetype names into two balanced lines
    var parts = name.split(' + ');
    if (parts.length === 2) return parts;
    var words = name.split(' '), mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }

  function flowSVG(p) {
    var W = 620, H = 330;
    var X = [36, 196, 356, 516], CW = 104;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vh-ins__viz" role="img" aria-label="stat flow of ' + esc(pretty(p.name)) + '">';
    var heads = ['Era', 'Archetype', 'Stat signature', 'Era twin'];
    heads.forEach(function (h, i) {
      s += '<text x="' + (X[i] + CW / 2) + '" y="22" text-anchor="middle" class="vh-ins__svglabel" style="text-transform:uppercase;letter-spacing:.12em;font-size:11px">' + h + '</text>';
    });
    function link(x1, y1, x2, y2, w, color) {
      var mx = (x1 + x2) / 2;
      s += '<path d="M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2 +
        '" fill="none" stroke="' + (color || TERRA) + '" stroke-width="' + w.toFixed(1) + '" opacity="0.7"/>';
    }
    function node(x, y, w, h, fill, lines, dashed) {
      s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8" fill="' + fill + '"' +
        (dashed ? ' stroke-dasharray="6 4" stroke="' + MUTED + '" stroke-width="1.5"' : '') + '/>';
      lines.forEach(function (ln, i) {
        s += '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 - (lines.length - 1) * 8 + i * 16) +
          '" text-anchor="middle" class="vh-ins__svgval">' + esc(ln) + '</text>';
      });
    }
    // Era node
    node(X[0], 150, CW, 46, VOID === '#1E2022' ? '#2a2d30' : '#eee', [p.decade]);
    // Archetype node
    var archLines = wrap2(p.archetype || 'Unknown');
    node(X[1], 138, CW, 70, '#2a2d30', archLines);
    link(X[0] + CW, 173, X[1], 173, 12);
    // Stat nodes: heights proportional to |z| share
    var tot = p.top3.reduce(function (a, t) { return a + Math.abs(t.z); }, 0) || 1;
    var y = 56, Htot = 218;
    p.top3.forEach(function (t) {
      var h = Math.max(30, (Math.abs(t.z) / tot) * Htot);
      var lbl = t.label.length > 16 ? t.label.slice(0, 15) + '…' : t.label;
      node(X[2], y, CW, h, '#2a2d30', [lbl, (t.z > 0 ? '+' : '') + t.z.toFixed(2) + 'σ']);
      var share = Math.abs(t.z) / tot;
      link(X[1] + CW, 173, X[2], y + h / 2, Math.max(2, share * 30));
      t._cy = y + h / 2;
      y += h + 8;
    });
    // Twin node (or honest empty state)
    var tw = state.twins[p.name.toLowerCase() + '|' + p.season];
    if (tw && tw.twin) {
      node(X[3], 138, CW, 70, GOLD, [pretty(tw.twin.name).split(' ').slice(-1)[0], shortSeason(tw.twin.season)]);
      s += '<text x="' + (X[3] + CW / 2) + '" y="' + (138 + 88) + '" text-anchor="middle" class="vh-ins__svglabel">sim ' +
        Number(tw.twin.similarity).toFixed(3) + '</text>';
      p.top3.forEach(function (t) {
        var share = Math.abs(t.z) / tot;
        link(X[2] + CW, t._cy, X[3], 173, Math.max(2, share * 30), GOLD);
      });
    } else {
      node(X[3], 138, CW, 70, 'none', ['No era twin', 'charted'], true);
      s += '<text x="' + (X[3] + CW / 2) + '" y="' + (138 + 88) + '" text-anchor="middle" class="vh-ins__svglabel">pool: 4+ seasons</text>';
    }
    return s + '</svg>';
  }

  /* ---------- render ---------- */

  function setStatus(msg) {
    var el = document.getElementById('tn-status');
    if (el) el.textContent = msg;
  }

  function render(id) {
    var p = state.byId[id];
    if (!p) return;
    state.current = id;
    var t0 = performance.now();
    var neighbors = topNeighbors(id, K_SHOW);
    var ms = Math.round(performance.now() - t0);

    document.getElementById('tn-title').textContent =
      pretty(p.name) + ' ' + shortSeason(p.season) + ' — twin network';
    document.getElementById('tn-vizwrap').innerHTML = networkSVG(p, neighbors);

    var eraBridge = neighbors.filter(function (nb) {
      return state.byId[nb.id].decade !== p.decade;
    }).length / neighbors.length;
    var metrics = document.getElementById('tn-metrics');
    metrics.innerHTML =
      metricHTML(String(state.counts[id]), 'Twin Centrality — in ' + state.counts[id] + ' of 12,966 top-10 neighbor sets (#' + state.rankOf[id] + ' overall)') +
      metricHTML((eraBridge * 100).toFixed(0) + '%', 'Era-Bridge Score — ' + (eraBridge * K_SHOW).toFixed(0) + ' of ' + K_SHOW + ' shown twins from another decade') +
      metricHTML(neighbors[0].sim.toFixed(3), 'Closest twin — ' + pretty(state.byId[neighbors[0].id].name) + ' ' + shortSeason(state.byId[neighbors[0].id].season));

    document.getElementById('tn-flowwrap').innerHTML = flowSVG(p);

    var url = new URL(location.href);
    url.searchParams.set('p', id);
    history.replaceState(null, '', url.toString());
  }

  function metricHTML(big, small) {
    return '<div class="vh-tn__metric"><b>' + esc(big) + '</b><span>' + esc(small) + '</span></div>';
  }

  /* ---------- picker ---------- */

  function bindPicker() {
    var search = document.getElementById('tn-search');
    var season = document.getElementById('tn-season');
    var dl = document.getElementById('tn-names');
    dl.innerHTML = state.names.list.map(function (n) {
      return '<option value="' + esc(pretty(n)) + '">';
    }).join('');

    function unpretty(display) {
      // map display name back to raw (NAME_FIXES are few; invert them)
      for (var raw in NAME_FIXES) {
        if (NAME_FIXES[raw] === display) return raw;
      }
      return display;
    }

    function seasonsFor(displayName) {
      var raw = unpretty(displayName);
      return state.names.byName[raw] || state.names.byName[displayName] || [];
    }

    function fillSeasons(displayName) {
      var ss = seasonsFor(displayName);
      season.innerHTML = ss.map(function (p) {
        return '<option value="' + p.id + '">' + esc(p.season) + '</option>';
      }).join('');
      return ss;
    }

    function pick(displayName, id) {
      var ss = fillSeasons(displayName);
      var target = null;
      if (id != null) {
        target = ss.filter(function (p) { return p.id === Number(id); })[0] || null;
      }
      if (!target) target = ss[ss.length - 1]; // latest season
      if (target) {
        season.value = target.id;
        render(target.id);
      }
    }

    search.addEventListener('change', function () { pick(search.value, null); });
    search.addEventListener('input', function () {
      var v = search.value.toLowerCase();
      var hit = state.names.list.filter(function (n) {
        return pretty(n).toLowerCase().indexOf(v) === 0;
      })[0];
      if (hit && pretty(hit).toLowerCase() === v) pick(pretty(hit), null);
    });
    season.addEventListener('change', function () { render(Number(season.value)); });

    document.querySelector('.vh-tn__copy').addEventListener('click', function () {
      var btn = this, url = location.href;
      function done() {
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = 'Copy link'; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, done);
      } else done();
    });

    // deep link ?p=<id>, else default to Curry's unanimous MVP season
    var qp = new URLSearchParams(location.search).get('p');
    var defId = 8197; // Stephen Curry 2015-16
    var start = state.byId[qp] ? Number(qp) : defId;
    var sp = state.byId[start];
    search.value = pretty(sp.name);
    pick(pretty(sp.name), start);
  }

  /* ---------- boot ---------- */

  function fail(msg) {
    setStatus(msg);
    var fw = document.getElementById('tn-flowwrap');
    if (fw) fw.innerHTML = '<p class="vh-ins__error">' + esc(msg) + '</p>';
  }

  loadAll().then(function () {
    bindPicker();
  }).catch(function (e) {
    fail('Could not load the twin data right now — check your connection and reload.');
  });

})(window);
