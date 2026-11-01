/* landing-stories.js — landing-map-viz C3 (guided entry chips) + C10 (guided stories).
 *
 * Vanilla JS, no dependencies, one small file. Enhancement only:
 *  - chips are real anchor links carrying the view state (?proj=<pca|tsne|umap>&id=<n>),
 *    so with JS disabled they still load the same view (the deep link applies on load);
 *  - the full story text lives in the HTML, so stories read with JS disabled;
 *    the story step links are real anchors (same deep-link schema as the
 *    chips), so they work as plain links without JS.
 * With JS, a click applies the view in place through window.VHAtlas.applyView
 * (the existing Embed3D handle API: setProjection/setSelected/setHighlight) —
 * the engine file is never touched — and the URL is kept canonical so every
 * chip and story step stays shareable as a link.
 *
 * Reduced motion: the engine applies projection and selection as instant
 * state changes (no camera tweens), and auto-rotate is already off under
 * prefers-reduced-motion, so story steps never fight the map's rotation.
 */
(function () {
  'use strict';

  function onReady(fn) {
    if (window.VHAtlas && window.VHAtlas.onReady) { window.VHAtlas.onReady(fn); return; }
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* Apply a chip/step view in place. Returns true when the landing wiring
     took the click; false lets the anchor navigate (deep link on load). */
  function applyView(el) {
    var proj = el.getAttribute('data-proj');
    var raw = el.getAttribute('data-id');
    var id = (raw == null || raw === '') ? -1 : +raw;
    if (window.VHAtlas && window.VHAtlas.applyView) {
      window.VHAtlas.applyView(proj, id);
      return true;
    }
    return false;
  }

  onReady(function () {
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-view]') : null;
      if (!t) return;
      if (applyView(t)) e.preventDefault();
    });
  });
})();
