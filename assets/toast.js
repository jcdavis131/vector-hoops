/* VHToast: the one toast for the game pages (DESIGN-DIRECTION section 2, primitive 13).
 * Styling is the kit's .toast / .toast.is-visible in atlas.css; this file only moves the text.
 * The element is created eagerly with id="vh-toast", the id viral-share.js's
 * VHShare.showToast already looks up, so every toast on a page lands in the same
 * kit-styled live region instead of an unstyled copy.
 * Load it as a plain <script src> before the game script that calls it. */
(function () {
  'use strict';
  var HIDE_MS = 2600;
  var timer = 0;

  function el() {
    var t = document.getElementById('vh-toast');
    if (!t && document.body) {
      t = document.createElement('div');
      t.id = 'vh-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    if (t) t.className = 'toast' + (t.classList.contains('is-visible') ? ' is-visible' : '');
    return t;
  }

  function show(msg, ms) {
    try {
      var t = el();
      if (!t) return;
      t.textContent = String(msg);
      t.classList.add('is-visible');
      clearTimeout(timer);
      timer = setTimeout(function () { t.classList.remove('is-visible'); }, ms || HIDE_MS);
    } catch (e) { /* a toast is never worth an exception */ }
  }

  if (document.body) el();
  else document.addEventListener('DOMContentLoaded', el);

  window.VHToast = { show: show };
})();
