/* Site-wide first-visit NUX — mount on non-play pages via <script src="assets/nux.js" defer> */
(function (global) {
  'use strict';

  var LS_KEY = 'vectorHoops.nux.site.v1';
  var SKIP_PREFIXES = ['/play'];
  var rootEl = null;

  var STEPS = [
    {
      title: 'Play the daily Chimera',
      copy: 'Two real NBA seasons fuse into one stat line. Name the donors, then guess the mashup — one puzzle a day, era-honest clues.',
      href: '/play',
      cta: 'Play today',
    },
    {
      title: 'Five modes on one board',
      copy: 'Chimera, Deadline, Fader, Chemistry, Archetype — same vector space, different daily riddles. Practice anytime.',
      href: '/#modes',
      cta: 'See modes',
    },
    {
      title: 'Explore the model',
      copy: 'Network maps craft neighbors; Players shows skill grades and next-season predicted vs actual (prediction-only on the latest year).',
      href: '/players',
      cta: 'Open Players',
    },
  ];

  function pathname() {
    var p = global.location.pathname || '/';
    return p.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
  }

  function shouldSkipPage() {
    var p = pathname();
    for (var i = 0; i < SKIP_PREFIXES.length; i++) {
      if (p === SKIP_PREFIXES[i] || p.indexOf(SKIP_PREFIXES[i] + '/') === 0) return true;
    }
    return false;
  }

  function hasSeen() {
    try { return global.localStorage.getItem(LS_KEY) === '1'; } catch (e) { return false; }
  }

  function markSeen() {
    try { global.localStorage.setItem(LS_KEY, '1'); } catch (e) { /* storage unavailable */ }
  }

  function forceShow() {
    try {
      var q = new URLSearchParams(global.location.search);
      return q.get('nux') === '1' || q.get('nux') === 'true';
    } catch (e) { return false; }
  }

  function getFocusable(container) {
    return Array.prototype.slice.call(
      container.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function (el) { return !el.hidden && el.offsetParent !== null; });
  }

  function trapFocus(container, ev) {
    if (ev.key !== 'Tab') return;
    var nodes = getFocusable(container);
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  function buildMarkup() {
    var stepsHtml = STEPS.map(function (step, idx) {
      return (
        '<li class="vh-nux__step">' +
          '<span class="vh-nux__step-num" aria-hidden="true">' + (idx + 1) + '</span>' +
          '<div>' +
            '<p class="vh-nux__step-title">' + step.title + '</p>' +
            '<p class="vh-nux__step-copy">' + step.copy + '</p>' +
          '</div>' +
        '</li>'
      );
    }).join('');

    var root = document.createElement('div');
    root.className = 'vh-nux';
    root.id = 'vh-nux';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'vh-nux-title');
    root.innerHTML =
      '<div class="vh-nux__backdrop" data-nux-close tabindex="-1" aria-hidden="true"></div>' +
      '<div class="vh-nux__dialog">' +
        '<p class="vh-nux__eyebrow">New here?</p>' +
        '<h2 class="vh-nux__title" id="vh-nux-title">Welcome to Vector Hoops</h2>' +
        '<p class="vh-nux__lede">A daily NBA vector puzzle plus open research tools — free, no account, every number recomputable.</p>' +
        '<ol class="vh-nux__steps">' + stepsHtml + '</ol>' +
        '<div class="vh-nux__actions">' +
          '<a class="vh-btn vh-btn--primary" id="vh-nux-play" href="/play">Play today&rsquo;s Chimera</a>' +
          '<button class="vh-btn vh-nux__skip" id="vh-nux-dismiss" type="button">Got it</button>' +
        '</div>' +
      '</div>';
    return root;
  }

  function openNux(root, dialog, dismissBtn) {
    root.hidden = false;
    document.body.classList.add('vh-modal-open');
    dismissBtn.focus();
    function onKey(ev) {
      if (ev.key === 'Escape') closeNux(root, onKey);
      else trapFocus(dialog, ev);
    }
    if (root._nuxKeyHandler) {
      document.removeEventListener('keydown', root._nuxKeyHandler);
    }
    root._nuxKeyHandler = onKey;
    document.addEventListener('keydown', onKey);
  }

  function closeNux(root, onKey) {
    root.hidden = true;
    document.body.classList.remove('vh-modal-open');
    markSeen();
    if (onKey) document.removeEventListener('keydown', onKey);
    root._nuxKeyHandler = null;
  }

  function ensureRoot() {
    if (rootEl && document.body.contains(rootEl)) return rootEl;
    rootEl = document.getElementById('vh-nux') || buildMarkup();
    if (!rootEl.parentNode) {
      document.body.appendChild(rootEl);
      var dialog = rootEl.querySelector('.vh-nux__dialog');
      var dismissBtn = rootEl.querySelector('#vh-nux-dismiss');
      var playBtn = rootEl.querySelector('#vh-nux-play');
      var backdrop = rootEl.querySelector('[data-nux-close]');
      dismissBtn.addEventListener('click', function () {
        closeNux(rootEl, rootEl._nuxKeyHandler);
      });
      backdrop.addEventListener('click', function () {
        closeNux(rootEl, rootEl._nuxKeyHandler);
      });
      playBtn.addEventListener('click', function () {
        markSeen();
      });
      rootEl._nuxDialog = dialog;
      rootEl._nuxDismiss = dismissBtn;
    }
    return rootEl;
  }

  function show(opts) {
    opts = opts || {};
    if (shouldSkipPage()) return false;
    var root = ensureRoot();
    openNux(root, root._nuxDialog, root._nuxDismiss);
    return true;
  }

  function mount() {
    if (shouldSkipPage()) return;
    if (!forceShow() && hasSeen()) return;
    show({ force: forceShow() });
  }

  function reset() {
    try { global.localStorage.removeItem(LS_KEY); } catch (e) { /* storage unavailable */ }
  }

  function wireTourLinks() {
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var btn = t.closest('[data-vh-nux-tour]');
      if (!btn) return;
      ev.preventDefault();
      show({ force: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      mount();
      wireTourLinks();
    });
  } else {
    mount();
    wireTourLinks();
  }

  global.VHNux = { mount: mount, show: show, reset: reset, hasSeen: hasSeen };
})(window);
