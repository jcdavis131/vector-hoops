/* twin-bands.js — uncertainty grammar for twin similarity (Part 2 panel: Hullman).
 *
 * Band cutoffs come from the served-constants registry
 * (window.VHServedConstants.twin_bands — built 2026-10-19, pipeline/
 * build_served_constants.py), never from a second copy. Twin bands are
 * norm-referenced: strong = top third of all twin similarities on record.
 *
 * Display rule (v4 panel: Silver/Hullman):
 *   - headline the PERCENTILE: "Strong twin — more similar than 88% of pairs"
 *   - never the raw cosine in the headline, and never as a bare % ("78%")
 *   - the number may appear only on tap-through (<details>), and only with
 *     its build-time bootstrap interval: "similarity 0.78 ± 0.06"
 *   - the tercile definition is always stated on tap-through
 *
 * Two renderers:
 *   chipHTML(bands, sim, meta)   — band label + percentile visible; number behind <details>.
 *   inlineHTML(bands, sim, meta) — compact: band label only; number behind <details>.
 * meta is optional: {se: <bootstrap se>, pct: <percentile int>}. When absent,
 * the percentile is derived from the registry's percentile table and the
 * number is shown without an interval (never fabricated).
 * Both degrade to a plain "twin" label if the registry is missing.
 */
(function () {
  'use strict';

  function registry() {
    try { return window.VHServedConstants || null; } catch (e) { return null; }
  }

  function bands() {
    var C = registry();
    return (C && C.twin_bands) || null;
  }

  function definition() {
    var C = registry();
    return (C && C.twin_band_definition) || 'top third of all twin similarities on record';
  }

  function pctFromTable(sim) {
    var C = registry();
    var t = C && C.twin_sim_percentiles;
    if (!t || !t.length) return null;
    var s = Number(sim);
    if (!isFinite(s)) return null;
    var n = 0;
    for (var i = 0; i < t.length; i++) { if (t[i] < s) n++; }
    return n; // integer 0..100: "% of twin pairs strictly less similar"
  }

  function bandFor(bs, sim) {
    if (!bs || !bs.length) return null;
    var s = Number(sim);
    if (!isFinite(s)) return null;
    for (var i = 0; i < bs.length; i++) {
      if (s >= bs[i].min) return bs[i];
    }
    return bs[bs.length - 1];
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function headline(b, sim, meta) {
    var pct = (meta && meta.pct != null) ? meta.pct : pctFromTable(sim);
    var h = esc(b.label);
    if (pct != null) h += ' &mdash; more similar than ' + pct + '% of pairs';
    return h;
  }

  function detailLine(b, sim, meta) {
    var parts = [];
    var num = Number(sim);
    if (isFinite(num)) {
      var shown = num.toFixed(2);
      if (meta && isFinite(Number(meta.se))) {
        var se = Number(meta.se);
        shown += ' &plusmn; ' + (se < 0.005 ? '&lt;0.01' : se.toFixed(2));
      }
      parts.push('similarity ' + shown);
    }
    var pct = (meta && meta.pct != null) ? meta.pct : pctFromTable(sim);
    if (pct != null) parts.push('more similar than ' + pct + '% of pairs');
    if (b.blurb) parts.push(esc(b.blurb));
    parts.push(esc(b.label) + ' = ' + esc(definition()));
    return parts.join(' &middot; ');
  }

  function chipHTML(bs, sim, meta) {
    bs = bs || bands();
    var b = bandFor(bs, sim);
    if (!b) return '<span class="twin-band__label">twin</span>';
    return '<details class="twin-band"><summary class="twin-band__summary">' +
      headline(b, sim, meta) + '</summary>' +
      '<div class="twin-band__detail">' + detailLine(b, sim, meta) + '</div></details>';
  }

  function inlineHTML(bs, sim, meta) {
    bs = bs || bands();
    var b = bandFor(bs, sim);
    if (!b) return '<span class="twin-band__label">twin</span>';
    return '<details class="twin-band twin-band--inline"><summary class="twin-band__summary">' +
      esc(b.label) + '</summary>' +
      '<div class="twin-band__detail">' + detailLine(b, sim, meta) + '</div></details>';
  }

  window.VHTwinBands = {
    load: function () { return Promise.resolve(bands()); },
    bandFor: function (bs, sim) { return bandFor(bs || bands(), sim); },
    chipHTML: chipHTML,
    inlineHTML: inlineHTML,
    pctFromTable: pctFromTable,
    definition: definition
  };
})();
