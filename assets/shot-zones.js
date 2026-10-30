/* shot-zones.js — 2026-27 predicted shot locations on the players page.
   Data: /assets/shot_zones_2026-27.json (Arm 1 v5, V5a season-ahead location
   head, ratified by Cam 2026-10-30). Precomputed offline: no model runs in the
   browser, this module only looks up and draws. Held-out location log-loss
   beats a smoothed last-season shot map by 1.60% pooled (final fold 2.05%).
   35 zones = 7 distance bands x 5 angle bands around the rim (ESPN coords). */
(function () {
  'use strict';
  var A62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var D = [0, 4, 8, 14, 20, 24, 28, 40];          // ft from rim; last band drawn to 40, clipped
  var A = [-180, -54, -18, 18, 54, 180];           // deg, atan2(x_ft, y_ft); 0 = straight out
  var DLBL = ['at the rim', '4-8 ft', '8-14 ft', '14-20 ft', '20-24 ft', '24-28 ft', '28+ ft'];
  var ALBL = ['left baseline', 'left wing', 'middle', 'right wing', 'right baseline'];
  var cache = null;

  function slugify(name) {
    return String(name || '').toLowerCase().replace(/\./g, '').replace(/'/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function load() {
    if (!cache) {
      cache = fetch('/assets/shot_zones_2026-27.json?v=827ced78').then(function (r) {
        if (!r.ok) throw new Error('shot zones ' + r.status);
        return r.json();
      }).catch(function () { return null; });
    }
    return cache;
  }

  function decode(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(A62.indexOf(s.charAt(i)) / 200);
    return out;
  }

  function getZones(data, displayName) {
    if (!data || !data.players) return null;
    var k = slugify(displayName);
    var row = data.players[k] || (data.alias && data.alias[k] && data.players[data.alias[k]]);
    if (!row || typeof row[0] !== 'string' || row[0].length !== 35) return null;
    return { p: decode(row[0]), n: row[1], league: decode(data.league || '') };
  }

  function pt(r, a) {
    var t = a * Math.PI / 180;
    return (25 + r * Math.sin(t)).toFixed(2) + ' ' + (5.25 + r * Math.cos(t)).toFixed(2);
  }

  function sector(r0, r1, a0, a1) {
    var big = (a1 - a0) > 180 ? 1 : 0;
    var d = 'M' + pt(r1, a0) + ' A' + r1 + ' ' + r1 + ' 0 ' + big + ' 0 ' + pt(r1, a1);
    if (r0 > 0) d += ' L' + pt(r0, a1) + ' A' + r0 + ' ' + r0 + ' 0 ' + big + ' 1 ' + pt(r0, a0) + ' Z';
    else d += ' L25 5.25 Z';
    return d;
  }

  function pct(x) { return Math.round(100 * x) + '%'; }

  function cardHTML(z) {
    var max = 0, i;
    for (i = 0; i < 35; i++) max = Math.max(max, z.p[i]);
    var cells = '';
    for (i = 0; i < 35; i++) {
      var db = Math.floor(i / 5), ab = i % 5, op = max > 0 ? (0.06 + 0.84 * z.p[i] / max) : 0.06;
      cells += '<path d="' + sector(D[db], D[db + 1], A[ab], A[ab + 1]) + '" fill-opacity="' + op.toFixed(2) +
        '"><title>' + DLBL[db] + ', ' + ALBL[ab] + ': ' + pct(z.p[i]) + ' of shots</title></path>';
    }
    var order = [];
    for (i = 0; i < 35; i++) order.push(i);
    order.sort(function (a, b) { return z.p[b] - z.p[a]; });
    var top = order.slice(0, 3).map(function (k) {
      var lg = z.league.length === 35 ? z.league[k] : null;
      return '<li><b>' + pct(z.p[k]) + '</b> ' + DLBL[Math.floor(k / 5)] + ', ' + ALBL[k % 5] +
        (lg != null ? ' <span class="shot-zones__lg">(league ' + pct(lg) + ')</span>' : '') + '</li>';
    }).join('');
    var thin = z.n < 100;
    return '<div class="pp-section shot-zones">' +
      '<div class="pp-section-head">2026\u201327 shot locations <span class="shot-zones__tag">v5a model</span></div>' +
      '<div class="shot-zones__body">' +
      '<svg class="shot-zones__court" viewBox="0 0 50 36" role="img" aria-label="Predicted 2026-27 shot location heat map">' +
      '<defs><clipPath id="shot-zones-clip"><rect x="0" y="0" width="50" height="36"/></clipPath></defs>' +
      '<g clip-path="url(#shot-zones-clip)" class="shot-zones__cells" stroke-width="0.15">' + cells + '</g>' +
      '<g class="shot-zones__lines" fill="none" stroke-width="0.25">' +
      '<rect x="0" y="0" width="50" height="36"/><rect x="17" y="0" width="16" height="19"/>' +
      '<circle cx="25" cy="5.25" r="0.75"/><path d="M3 0 V14 A23.75 23.75 0 0 0 47 14 V0"/></g></svg>' +
      '<div><ol class="shot-zones__top">' + top + '</ol>' +
      '<p class="shot-zones__sub">Share of field-goal attempts by zone, based on 2025\u201326 (' + z.n + ' charted shots)' +
      (thin ? '. Thin sample, so the map leans on league patterns.' : '.') + '</p></div></div>' +
      '<p class="shot-zones__fine">Season-ahead location model. On held-out seasons it beats a smoothed copy of the ' +
      'player\u2019s last season by 1.6% in log-loss. A projection, not a prediction. <a href="/methods">How it works</a></p>' +
      '</div>';
  }

  function cardCSS() {
    if (document.getElementById('shot-zones-css')) return;
    var s = document.createElement('style');
    s.id = 'shot-zones-css';
    s.textContent =
      '.shot-zones__tag{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;' +
      'color:var(--coin-text);border:1px solid var(--line-2);border-radius:999px;padding:2px 8px;margin-left:8px;' +
      'vertical-align:2px;white-space:nowrap}' +
      '.shot-zones__body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start;margin:10px 0 4px}' +
      '@media(max-width:640px){.shot-zones__body{grid-template-columns:1fr}}' +
      '.shot-zones__court{width:100%;height:auto;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-lg)}' +
      '.shot-zones__cells path{fill:var(--accent);stroke:var(--surface-2)}' +
      '.shot-zones__lines{stroke:var(--fg-3)}' +
      '.shot-zones__top{margin:0;padding-left:18px;font-size:13px;line-height:1.7}' +
      '.shot-zones__top b{font-variant-numeric:tabular-nums}' +
      '.shot-zones__lg{color:var(--fg-3);font-size:12px}' +
      '.shot-zones__sub{font-size:12px;color:var(--fg-2);margin:6px 0 0}' +
      '.shot-zones__fine{font-size:11px;color:var(--fg-3);margin:8px 0 0;line-height:1.5}' +
      '.shot-zones__fine a{color:inherit;text-decoration:underline}';
    document.head.appendChild(s);
  }

  function renderInto(slot, displayName) {
    if (!slot) return;
    cardCSS();
    load().then(function (data) {
      var z = getZones(data, displayName);
      slot.innerHTML = z ? cardHTML(z) : '';
    });
  }

  window.ShotZones = { load: load, getZones: getZones, cardHTML: cardHTML, renderInto: renderInto, slugify: slugify };
})();
