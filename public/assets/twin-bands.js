/* twin-bands.js — uncertainty grammar for twin similarity (Part 2 panel: Hullman).
 *
 * Loads /assets/twin_bands.json (terciles of the twin sim distribution, built
 * 2026-10-18) once and exposes window.VHTwinBands. Rule from the interface:
 * chips show the BAND LABEL, never a bare 3-decimal number. The numeric value
 * may appear only on tap-through (the <details> element).
 *
 * Two renderers:
 *   chipHTML(bands, sim)   — band label + blurb visible; number behind <details>.
 *   inlineHTML(bands, sim)  — compact: band label only; number behind <details>.
 * Both degrade to a plain "twin" label if the bands fail to load.
 */
(function () {
  'use strict';

  var cacheP = null;

  function load() {
    if (!cacheP) {
      cacheP = fetch('/assets/twin_bands.json', { cache: 'force-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) { return (d && d.bands) || null; })
        .catch(function () { return null; });
    }
    return cacheP;
  }

  function bandFor(bands, sim) {
    if (!bands || !bands.length) return null;
    var s = Number(sim);
    if (!isFinite(s)) return null;
    for (var i = 0; i < bands.length; i++) {
      if (s >= bands[i].min) return bands[i];
    }
    return bands[bands.length - 1];
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function numSpan(sim) {
    return '<span class="twin-band__num">similarity ' + Number(sim).toFixed(3) + '</span>';
  }

  function chipHTML(bands, sim) {
    var b = bandFor(bands, sim);
    if (!b) return '<span class="twin-band__label">twin</span>';
    return '<details class="twin-band"><summary class="twin-band__summary"><b>' +
      esc(b.label) + '</b> &mdash; ' + esc(b.blurb) + '</summary>' + numSpan(sim) + '</details>';
  }

  function inlineHTML(bands, sim) {
    var b = bandFor(bands, sim);
    if (!b) return '<span class="twin-band__label">twin</span>';
    return '<details class="twin-band twin-band--inline"><summary class="twin-band__summary">' +
      esc(b.label) + '</summary>' + numSpan(sim) + '</details>';
  }

  window.VHTwinBands = {
    load: load,
    bandFor: bandFor,
    chipHTML: chipHTML,
    inlineHTML: inlineHTML
  };
})();
