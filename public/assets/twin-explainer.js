/* twin-explainer.js — plain-words "why they're twins" on every twin reveal.
 *
 * Reads the current Daily Court reveal from window.VHPastModern.state(),
 * looks up the precomputed explanation (twin_explainer.json, keyed by canonical
 * pair key), and injects three wrapping chips + biggest-difference line into
 * the reveal card. Pairs not in the static file (Daily Court computes its twin
 * live) are explained on the fly from twin_explainer_vectors.json with the
 * exact same algorithm the pipeline used — QA-verified to agree 1308/1308.
 *
 * Honest note: the twin match itself comes from the full 64-d embedding;
 * this breakdown decomposes the 14 serving traits, not the full space.
 */
(function () {
  'use strict';

  var EXPLAIN_URL = '/assets/twin_explainer.json';
  var VECTORS_URL = '/assets/twin_explainer_vectors.json';

  var explainP = null, vectorsP = null;

  // dim code -> [high chip, low chip]. Mirrors pipeline/build_twin_explainer.py exactly.
  var CHIP = {
    PTS:   ['both fill it up scoring', 'both score sparingly'],
    AST:   ['both run the offense', 'both rarely create for others'],
    OREB:  ['both crash the offensive glass', 'both stay off the offensive glass'],
    DREB:  ['both clean the defensive glass', 'both cede the defensive glass'],
    STL:   ['both pick pockets', 'both rarely gamble for steals'],
    BLK:   ['both protect the rim', 'both rarely block shots'],
    TOV:   ['both turn it over a lot', 'both take care of the ball'],
    FG3A:  ['both let it fly from three', 'both rarely shoot threes'],
    FGA:   ['both take a ton of shots', 'both shoot sparingly'],
    FTA:   ['both live at the line', 'both rarely get to the line'],
    FG3_PCT: ['both snipe from deep', 'both struggle from deep'],
    FG_PCT:  ['both finish everything inside', 'both struggle to finish'],
    FT_PCT:  ['both automatic at the stripe', 'both shaky at the stripe'],
    PLUS_MINUS: ['both tilt the floor', 'both get outscored on court']
  };

  // Mirrors pipeline explain(): shared = 3 closest dims, differ = widest gap.
  function explainPair(va, vb, codes, labels) {
    var order = codes.map(function (c, k) { return k; }).sort(function (x, y) {
      return Math.abs(va[x] - vb[x]) - Math.abs(va[y] - vb[y]);
    });
    var shared = order.slice(0, 3).map(function (k) {
      var mean = (va[k] + vb[k]) / 2;
      if (mean >= 0.25) return CHIP[codes[k]][0];
      if (mean <= -0.25) return CHIP[codes[k]][1];
      return 'both average ' + labels[codes[k]];
    });
    return { shared: shared, differ: labels[codes[order[order.length - 1]]] };
  }

  function pairKey(a, b) { return [a, b].sort().join(' ~ '); }

  function loadExplain() {
    if (!explainP) {
      explainP = fetch(EXPLAIN_URL, { cache: 'force-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(function () { return null; });
    }
    return explainP;
  }
  function loadVectors() {
    if (!vectorsP) {
      vectorsP = fetch(VECTORS_URL, { cache: 'force-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(function () { return null; });
    }
    return vectorsP;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function onReveal() {
    try {
      if (!window.VHPastModern || !VHPastModern.state) return;
      var st = VHPastModern.state();
      var target = st && st.target, twin = st && st.closestModern;
      if (!target || !twin || !twin.entry) return;
      var aKey = target.n + '|' + target.s;
      var bKey = twin.entry.n + '|' + twin.entry.s;
      var key = pairKey(aKey, bKey);

      Promise.all([loadExplain(), loadVectors()]).then(function (res) {
        var data = res[0], pool = res[1];
        if (!data) return;
        var rec = data[key] || null;
        var sim = twin.sim;
        if (!rec) {
          // dynamic Daily Court pair: explain live from the pool vectors.
          // pool maps "<vectors.json row index>" -> 14-d serving vector.
          if (!pool) return;
          var va = pool[target.i], vb = pool[twin.entry.i];
          if (!va || !vb) return;
          var meta = data._meta || {};
          var labels = meta.labels || {};
          var codes = Object.keys(labels);
          var live = explainPair(va, vb, codes, labels);
          rec = { shared: live.shared, differ: live.differ, sim: sim,
                  thin: !!(meta.thin_threshold && sim < meta.thin_threshold) };
        }
        render(rec);
      });
    } catch (e) { /* the game must never break because of the explainer */ }
  }

  function render(rec) {
    var card = document.querySelector('#result .card');
    if (!card || !rec) return;
    var old = card.querySelector('.twin-why');
    if (old) old.parentNode.removeChild(old);

    var thin = rec.thin
      ? '<div class="twin-why__thin">Looser match &mdash; similarity ' + Number(rec.sim).toFixed(2) + '</div>'
      : '';
    var el = document.createElement('div');
    el.className = 'twin-why';
    el.innerHTML =
      '<div class="twin-why__label">Why they&rsquo;re twins</div>' +
      '<div class="twin-why__chips">' +
        rec.shared.map(function (c) { return '<span class="pill">' + esc(c) + '</span>'; }).join('') +
      '</div>' +
      '<div class="twin-why__differ">Biggest difference: <b>' + esc(rec.differ) + '</b></div>' +
      thin +
      '<div class="twin-why__method">The twin was found with the full embedding; this breakdown uses the 14 style traits from the map.</div>';
    card.appendChild(el);
  }

  window.VHTwinExplainer = { onReveal: onReveal };

  // node QA hook (browser-ignored)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { explainPair: explainPair, pairKey: pairKey, CHIP: CHIP };
  }
})();
