/* name-fix.js — put back the hyphens assets/vectors.json does not have.
 *
 * vectors.json carries 2,421 player names and not one hyphen, so every compound
 * surname derived from it renders glued: "KarlAnthony Towns",
 * "Shai GilgeousAlexander", "Kentavious CaldwellPope". Seventeen committed
 * assets inherit it, and it reaches four live pages.
 *
 * The lookup is assets/name_fixes.json, derived by scripts/build_name_fixes.py
 * from knowledge/players/*.md — the one committed copy of these names that kept
 * its hyphens. It is a lookup and not a pattern on purpose: "VanVleet", "McKie",
 * "DeRozan" and "LaVine" are correct exactly as written and are the same shape
 * as the broken ones, so any regex that re-inserted hyphens would corrupt more
 * names than it repaired.
 *
 * Why a text pass rather than a fix at each render site: these pages build names
 * from three different asset shapes across many render points, all in minified
 * inline script. One pass over text nodes is the same twelve lines on every page
 * and cannot half-apply. Verified safe before shipping — none of the thirty
 * glued spellings appears in any page's static markup, so this only ever
 * rewrites text that came from data.
 *
 * It terminates: the replacement removes the glued spelling, so a second pass
 * over the same node matches nothing and queues no further mutation. That is the
 * same trap keyboard-a11y.js documents, where an observer wrote attributes
 * unconditionally and re-queued itself forever.
 *
 * If the map fails to load, names render exactly as stored — wrong, but never
 * invented.
 */
(function () {
  'use strict';

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  var fixes = null, rx = null, queued = false;

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function build(map) {
    var keys = Object.keys(map || {});
    if (!keys.length) return false;
    // longest first, so a name that contains another is matched whole
    keys.sort(function (a, b) { return b.length - a.length; });
    fixes = map;
    // (^|\W) ... (\W|$) rather than \b: these end in letters, but the guard keeps
    // "DeAndre Jordan" from matching inside a longer run of word characters.
    rx = new RegExp('(^|[^\\w-])(' + keys.map(esc).join('|') + ')(?![\\w-])', 'g');
    return true;
  }

  function sweep(root) {
    if (!rx || !root) return 0;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || n.nodeValue.length < 4) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        if (p && p.nodeName && SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n, changed = 0, hits = [];
    while ((n = walker.nextNode())) hits.push(n);
    for (var i = 0; i < hits.length; i++) {
      var node = hits[i], before = node.nodeValue;
      rx.lastIndex = 0;
      var after = before.replace(rx, function (_m, pre, name) { return pre + (fixes[name] || name); });
      if (after !== before) { node.nodeValue = after; changed++; }
    }
    return changed;
  }

  function schedule() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || window.setTimeout)(function () {
      queued = false;
      sweep(document.body);
    }, 0);
  }

  function start(map) {
    if (!build(map)) return;
    sweep(document.body);
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function load() {
    fetch('assets/name_fixes.json?v=54393bac')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.fixes) start(j.fixes); })
      .catch(function () { /* names stay as stored; nothing is invented */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
