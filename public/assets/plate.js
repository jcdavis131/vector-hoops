/* assets/plate.js — one plate chrome for JS-rendered cards.
 *
 * Plate.html(no, title, meta) returns the Drafting Board plate header string
 * (PLATE 0X + title + meta rule) so JS-rendered cards (pre-game module,
 * morning-after) wear exactly the same chrome as the static plates.
 * Static HTML plates are untouched — this is for JS cards only (D5 default).
 *
 * Stdlib only. Deferred classic script; also require()-able in node.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* Pure: plate chrome string. no: "PRE-GAME" / "02" etc. */
  function html(no, title, meta) {
    return '<div class="plate"><span class="pno">' + esc(no) + '</span>' +
      '<h2>' + esc(title) + '</h2><span class="prule"></span>' +
      (meta ? '<span class="pmeta">' + esc(meta) + '</span>' : '') + '</div>';
  }

  var api = { html: html };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.Plate = api);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
