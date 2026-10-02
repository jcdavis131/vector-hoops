/* arc-projections.js — 2026-27 model projections on the players page.
   Data: /assets/arc_priors_2026-27.json (arc-ridge-v1, career-arc ridge on
   person_id trajectories; held-out test macro-MAE 0.4382, props-weighted
   0.4269 — beats naive_last / avg3 / lite baselines). Per-game priors
   calibrated empirically on 2025-26 real data. Projection, not a prediction.
   Methodology: /research (frontier program) + /methods. */
(function () {
  'use strict';
  var URL = '/assets/arc_priors_2026-27.json';
  var cache = null;

  function slugify(name) {
    return String(name || '').toLowerCase().replace(/\./g, '').replace(/'/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function load() {
    if (!cache) {
      cache = fetch(URL).then(function (r) {
        if (!r.ok) throw new Error('priors ' + r.status);
        return r.json();
      }).catch(function () { return null; });
    }
    return cache;
  }

  function getProjection(data, displayName) {
    if (!data || !data.priors) return null;
    var p = data.priors[slugify(displayName)];
    if (p && p.per_game) return p;
    return null;
  }

  function num(x, digits) {
    if (x == null || isNaN(x)) return '—';
    return Number(x).toFixed(digits == null ? 1 : digits);
  }

  function statCell(label, value) {
    return '<div class="arc-proj__stat"><span class="arc-proj__val">' +
      value + '</span><span class="arc-proj__lbl">' + label + '</span></div>';
  }

  function cardHTML(displayName, p) {
    var g = p.per_game;
    var cells = statCell('PTS', num(g.pts)) + statCell('REB', num(g.trb)) +
      statCell('AST', num(g.ast)) + statCell('STL', num(g.stl)) +
      statCell('BLK', num(g.blk)) + statCell('3P', num(g.tp));
    var sub = [];
    if (p.mpg_prior != null) sub.push(num(p.mpg_prior) + ' mpg');
    if (p.gp_est != null) sub.push('~' + Math.round(p.gp_est) + ' games');
    if (p.last_season) sub.push('based on thru ' + p.last_season);
    return '<div class="pp-section arc-proj">' +
      '<div class="pp-section-head">2026–27 model projection <span class="arc-proj__tag">arc-ridge v1</span></div>' +
      '<div class="arc-proj__grid">' + cells + '</div>' +
      (sub.length ? '<p class="arc-proj__sub">' + sub.join(' · ') + '</p>' : '') +
      '<p class="arc-proj__fine">Career-arc model on this player\u2019s own trajectory (held-out test MAE 0.44, beats all baselines). ' +
      'A projection, not a prediction. <a href="/research">How it works</a></p>' +
      '</div>';
  }

  function cardCSS() {
    if (document.getElementById('arc-proj-css')) return;
    var s = document.createElement('style');
    s.id = 'arc-proj-css';
    s.textContent =
      '.arc-proj__tag{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;' +
      'color:var(--gold,#c9a227);border:1px solid color-mix(in srgb,var(--gold,#c9a227) 45%,transparent);' +
      'border-radius:999px;padding:2px 8px;margin-left:8px;vertical-align:2px;white-space:nowrap}' +
      '.arc-proj__grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:10px 0 4px}' +
      '@media(max-width:640px){.arc-proj__grid{grid-template-columns:repeat(3,1fr)}}' +
      '.arc-proj__stat{background:var(--card-2,rgba(255,255,255,.04));border:1px solid var(--line,rgba(255,255,255,.09));' +
      'border-radius:10px;padding:8px 4px;text-align:center}' +
      '.arc-proj__val{display:block;font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}' +
      '.arc-proj__lbl{display:block;font-size:10px;letter-spacing:.08em;color:var(--fg-3,#8a8f98);margin-top:2px}' +
      '.arc-proj__sub{font-size:12px;color:var(--fg-2,#a7adb6);margin:6px 0 0}' +
      '.arc-proj__fine{font-size:11px;color:var(--fg-3,#8a8f98);margin:8px 0 0;line-height:1.5}' +
      '.arc-proj__fine a{color:inherit;text-decoration:underline}';
    document.head.appendChild(s);
  }

  function renderInto(slot, displayName) {
    if (!slot) return;
    cardCSS();
    load().then(function (data) {
      var p = getProjection(data, displayName);
      slot.innerHTML = p ? cardHTML(displayName, p) : '';
    });
  }

  window.ArcProjections = {
    load: load,
    getProjection: getProjection,
    cardHTML: cardHTML,
    renderInto: renderInto,
    slugify: slugify
  };
})();
