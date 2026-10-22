/* twin-explainer.js — plain-words "why they're twins" on every twin reveal.
 *
 * Reads the current Daily Court reveal from window.VHPastModern.state(),
 * looks up the precomputed explanation (twin_explainer.json, keyed by canonical
 * pair key), and injects three wrapping chips + biggest-difference line into
 * the reveal card. Pairs not in the static file (Daily Court computes its twin
 * live) are explained on the fly from twin_explainer_vectors.json with the
 * exact same algorithm the pipeline used — QA-verified to agree on all pairs
 * (presence-preference rule, 2026-10-19).
 *
 * v4 manners rule: chips lead with shared PRESENCES, never shared absences;
 * a "strong twin" evidenced only by absences shows the qualifier
 * "Strong twin, mostly in what they don't do."
 *
 * Honest note: the twin match itself comes from the full 64-d embedding;
 * this breakdown decomposes the 14 serving traits, not the full space.
 */
(function () {
  'use strict';

  var EXPLAIN_URL = '/assets/twin_explainer.json';
  var VECTORS_URL = '/assets/twin_explainer_vectors.json';

  var explainP = null, vectorsP = null, bandsP = null;

  function loadBands() {
    if (!bandsP) {
      bandsP = (window.VHTwinBands ? window.VHTwinBands.load() : Promise.resolve(null));
    }
    return bandsP;
  }

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
    PLUS_MINUS: ['both outscore opponents on court', 'both get outscored on court']
  };

  // Mirrors pipeline explain(): 3 closest dims, stable-partitioned so shared
  // PRESENCES lead, then average traits, then shared absences. differ = widest gap.
  // v4 presence-preference (2026-10-19) — keep in lockstep with the pipeline.
  function explainPair(va, vb, codes, labels) {
    var order = codes.map(function (c, k) { return k; }).sort(function (x, y) {
      return Math.abs(va[x] - vb[x]) - Math.abs(va[y] - vb[y]);
    });
    function kind(k) {
      var mean = (va[k] + vb[k]) / 2;
      return mean >= 0.25 ? 'presence' : (mean <= -0.25 ? 'absence' : 'average');
    }
    var pres = [], avg = [], absn = [];
    for (var i = 0; i < order.length; i++) {
      var k = order[i], kd = kind(k);
      if (kd === 'presence') pres.push(k); else if (kd === 'absence') absn.push(k); else avg.push(k);
    }
    var ranked = pres.concat(avg, absn);
    // absence-evidenced pairs keep their qualifier (computed pre-cap)
    var preKinds = ranked.slice(0, 3).map(kind);
    var absenceOnly = preKinds.length === 3 && preKinds.every(function (x) { return x === 'absence'; });
    // P1: never ≥2 absence traits in the 3 chips — the generator must lead
    // with what players DO. Cap absences at one; backfill from pres/avg.
    var shared = [], kinds = [], absUsed = 0;
    for (var j = 0; j < ranked.length && shared.length < 3; j++) {
      var q = ranked[j], qd = kind(q), mean = (va[q] + vb[q]) / 2;
      if (qd === 'absence') {
        if (absUsed >= 1) continue;
        absUsed++;
      }
      kinds.push(qd);
      if (mean >= 0.25) shared.push(CHIP[codes[q]][0]);
      else if (mean <= -0.25) shared.push(CHIP[codes[q]][1]);
      else shared.push('both average ' + labels[codes[q]]);
    }
    return { shared: shared, kinds: kinds, differ: labels[codes[order[order.length - 1]]], absenceOnly: absenceOnly };
  }

  function strongMin() {
    try {
      var bs = (window.VHServedConstants && window.VHServedConstants.twin_bands) || [];
      return bs.length ? bs[0].min : 0.727;
    } catch (e) { return 0.727; }
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

      Promise.all([loadExplain(), loadVectors(), loadBands()]).then(function (res) {
        var data = res[0], pool = res[1], bands = res[2];
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
          rec = { shared: live.shared, kinds: live.kinds, differ: live.differ, sim: sim,
                  absenceOnly: live.absenceOnly,
                  thin: !!(meta.threshold && sim < meta.threshold) };
        }
        render(rec, bands);
      });
    } catch (e) { /* the game must never break because of the explainer */ }
  }

  function render(rec, bands) {
    var card = document.querySelector('#result .card');
    if (!card || !rec) return;
    var old = card.querySelector('.twin-why');
    if (old) old.parentNode.removeChild(old);

    // Hook 6 double-down (ethical engagement): the honest confidence number is
    // VISIBLE in the chips block, not only behind tap-through. Same data the
    // band already headlines — surfaced, never inflated. The anti-Block-Blast
    // signature: show the receipts, plainly.
    var conf = '';
    try {
      var simN = Number(rec.sim);
      if (isFinite(simN)) {
        var b2 = window.VHTwinBands ? window.VHTwinBands.bandFor(bands, simN) : null;
        var pctN = (rec.pct != null) ? rec.pct : null;
        conf = '<div class="twin-why__conf">Twin score <span class="num">' + simN.toFixed(2) + '</span>' +
          (b2 && b2.label ? ' &middot; ' + esc(b2.label) : '') +
          (pctN != null ? ' &middot; more similar than ' + pctN + '% of all pairs' : '') + '</div>';
      }
    } catch (e2) {}

    // Uncertainty grammar (Part 2 panel: Hullman; v4: Silver): every twin
    // claim headlines the band label + percentile; the number lives behind
    // tap-through only, with its bootstrap interval.
    var meta = { se: rec.sim_se, pct: rec.pct };
    var band = window.VHTwinBands
      ? window.VHTwinBands.chipHTML(bands, rec.sim, meta)
      : '';
    // v4 manners rule: a "strong twin" evidenced only by shared absences is
    // downgraded with a shown qualifier — presence precedes absence.
    var qual = '';
    if (rec.absenceOnly && Number(rec.sim) >= strongMin()) {
      qual = '<div class="twin-why__qual">Strong twin, mostly in what they don&rsquo;t do.</div>';
    }
    var el = document.createElement('div');
    el.className = 'twin-why vh-truth';
    el.innerHTML =
      '<div class="twin-why__label">Why they&rsquo;re twins</div>' +
      conf +
      (band ? '<div class="twin-why__band">' + band + '</div>' : '') +
      qual +
      '<div class="twin-why__chips">' +
        rec.shared.map(function (c) { return '<span class="pill">' + esc(c) + '</span>'; }).join('') +
      '</div>' +
      '<div class="twin-why__differ">Biggest difference: <b>' + esc(rec.differ) + '</b></div>' +
      '<div class="twin-why__method">Twins are matched by embedding similarity; this breakdown uses the 14 style traits from the map.</div>';
    card.appendChild(el);
  }

  window.VHTwinExplainer = { onReveal: onReveal };

  // node QA hook (browser-ignored)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { explainPair: explainPair, pairKey: pairKey, CHIP: CHIP };
  }
})();
