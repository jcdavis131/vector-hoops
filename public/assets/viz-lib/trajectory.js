/* viz-lib trajectory — career trajectory field. No dependencies.
 *
 * NEW primitive (Pillar 4). Graduates the Career Trails concept from
 * assets/career-trails.js into a standalone component: no atlas, no
 * window.VHAtlas dependency. A player's seasons draw as a path through the
 * atlas plane (rookie -> prime -> twilight) with a season scrubber and a
 * plain-words "what changed" strip.
 *
 *   VHL.traj.render({
 *     display: 'LeBron James',
 *     seasons: [{label:'2003-04', x:0.31, y:0.69}],
 *     deltas:  [[['FGA',1],['FT_PCT',-1]], ...],  // per season, first empty
 *     label: 'aria label', animate: true
 *   }) -> {html, bind(el)} — html holds the svg + scrubber; bind wires it.
 *
 * pts come from assets/trails_featured.json (atlas x,y,z; we plot x,y).
 * Deltas use the repo's plain-words stat names; unknown stats render raw —
 * never invented.
 */
(function (global) {
  'use strict';
  var VHL = (global.VHL = global.VHL || {});
  var traj = (VHL.traj = VHL.traj || {});

  var STAT_WORDS = {
    FGA: 'shot volume',
    FTA: 'free-throw attempts',
    FT_PCT: 'free-throw %',
    FG_PCT: 'field-goal %',
    FG3A: 'three-point volume',
    FG3_PCT: 'three-point %',
    PTS: 'scoring',
    REB: 'rebounding',
    DREB: 'defensive glass',
    OREB: 'offensive glass',
    AST: 'playmaking',
    STL: 'steals',
    BLK: 'blocks',
    TOV: 'turnovers',
    PF: 'fouls',
    MIN: 'minutes',
    PLUS_MINUS: 'plus-minus',
    USG: 'usage'
  };

  traj.words = function (stat, dir) {
    var w = STAT_WORDS[stat] || String(stat).replace(/_/g, ' ').toLowerCase();
    return w + ' ' + (dir > 0 ? 'up' : dir < 0 ? 'down' : 'flat');
  };

  traj.render = function (opts) {
    var c = VHL.colors();
    var seasons = opts.seasons || [];
    var deltas = opts.deltas || [];
    var W = 640,
      H = 360,
      pad = 46;
    var anim = opts.animate !== false && !VHL.reduced();

    var xs = seasons.map(function (s) { return s.x; });
    var ys = seasons.map(function (s) { return s.y; });
    var loX = Math.min.apply(null, xs.concat([0])),
      hiX = Math.max.apply(null, xs.concat([1]));
    var loY = Math.min.apply(null, ys.concat([0])),
      hiY = Math.max.apply(null, ys.concat([1]));
    if (hiX - loX < 1e-6) { hiX += 0.01; loX -= 0.01; }
    if (hiY - loY < 1e-6) { hiY += 0.01; loY -= 0.01; }
    function X(v) { return pad + ((v - loX) / (hiX - loX)) * (W - pad * 2); }
    function Y(v) { return pad + (1 - (v - loY) / (hiY - loY)) * (H - pad * 2); }

    var pts = seasons.map(function (s) { return [X(s.x), Y(s.y)]; });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    var totalLen = 0;
    for (var i = 1; i < pts.length; i++) {
      totalLen += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }

    var uid = 'tj' + Math.round(VHL.hash(opts.display || 'x') * 1e9).toString(36);
    var s = VHL.svgOpen(W, H, opts.label || ('career trajectory of ' + (opts.display || '')));
    if (anim) s = s.replace('class="vhl-svg"', 'class="vhl-svg vhl-anim"');
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + c.void + '" rx="8"/>';

    // faint field grid
    for (var g = 1; g < 4; g++) {
      s += '<line x1="' + (pad + (g / 4) * (W - pad * 2)) + '" y1="' + pad + '" x2="' +
        (pad + (g / 4) * (W - pad * 2)) + '" y2="' + (H - pad) + '" stroke="' + c.line + '" opacity="0.5"/>';
      s += '<line x1="' + pad + '" y1="' + (pad + (g / 4) * (H - pad * 2)) + '" x2="' + (W - pad) +
        '" y2="' + (pad + (g / 4) * (H - pad * 2)) + '" stroke="' + c.line + '" opacity="0.5"/>';
    }

    // the career path — draws itself rookie -> twilight (motion encodes time)
    s += '<path id="' + uid + '-path" d="' + d + '" fill="none" stroke="' + c.terra +
      '" stroke-width="3" stroke-linecap="round" opacity="0.9"' +
      (anim ? ' pathLength="100" style="stroke-dasharray:100;stroke-dashoffset:100;animation:vhl-draw 1.6s ease-out forwards"' : '') + '/>';

    // season nodes: rookie hollow, prime gold (peak = middle), twilight accent
    pts.forEach(function (p, si) {
      var fill = si === 0 ? 'none' : si === pts.length - 1 ? c.accent : c.board;
      var stroke = si === 0 ? c.fg2 : si === pts.length - 1 ? c.accent : c.gold;
      var r = si === 0 || si === pts.length - 1 ? 8 : 5.5;
      var lbl = seasons[si].label;
      var showLbl = si === 0 || si === pts.length - 1 || si === Math.floor(pts.length / 2);
      s += '<g data-vhl-node="' + si + '" data-' + uid + '="' + si + '" tabindex="0" role="button"' +
        ' aria-label="' + VHL.esc((opts.display || '') + ' ' + lbl) + '"' +
        (anim ? ' class="vhl-node" style="--vhl-d:' + Math.round((si / Math.max(1, pts.length - 1)) * 1400) + 'ms"' : '') + '>';
      s += '<circle class="vhl-hit" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="22" fill="transparent"/>';
      s += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + r + '" fill="' + fill +
        '" stroke="' + stroke + '" stroke-width="2.5"/>';
      if (showLbl) {
        s += '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] - 14).toFixed(1) + '" text-anchor="middle"' +
          ' font-size="12" font-weight="700" fill="' + c.fg + '">' + VHL.esc(VHL.shortSeason(lbl)) + '</text>';
      }
      s += '</g>';
    });

    s += '<text x="' + pad + '" y="' + (H - 12) + '" font-size="11" fill="' + c.fg3 + '">atlas plane \u00b7 rookie \u2192 twilight</text>';
    s += '</svg>';

    var html =
      '<div class="vhl-frame" style="aspect-ratio:640/360">' + s + '</div>' +
      '<div class="vhl-scrub"><input type="range" min="0" max="' + (seasons.length - 1) +
      '" value="' + (seasons.length - 1) + '" step="1" aria-label="scrub seasons" data-' + uid + '-scrub>' +
      '<output data-' + uid + '-out>' + VHL.esc(seasons.length ? seasons[seasons.length - 1].label : '') + '</output></div>' +
      '<p class="vhl-deltas" data-' + uid + '-deltas aria-live="polite"></p>';

    function deltaText(si) {
      var dd = deltas[si] || [];
      if (!dd.length) return si === 0 ? 'Rookie season \u2014 the starting point.' : 'No charted stat shifts this season.';
      var ups = dd.filter(function (x) { return x[1] > 0; }).map(function (x) { return traj.words(x[0], x[1]); });
      var dns = dd.filter(function (x) { return x[1] < 0; }).map(function (x) { return traj.words(x[0], x[1]); });
      var bits = [];
      if (ups.length) bits.push('<b>up:</b> ' + VHL.esc(ups.join(', ')));
      if (dns.length) bits.push('<b>down:</b> ' + VHL.esc(dns.join(', ')));
      return VHL.esc(seasons[si].label) + ' \u2014 ' + bits.join(' \u00b7 ');
    }

    function bind(el) {
      var scrub = el.querySelector('[data-' + uid + '-scrub]');
      var out = el.querySelector('[data-' + uid + '-out]');
      var dEl = el.querySelector('[data-' + uid + '-deltas]');
      var nodes = el.querySelectorAll('[data-' + uid + ']');
      function select(si) {
        si = Math.max(0, Math.min(seasons.length - 1, si));
        scrub.value = si;
        out.textContent = seasons[si].label;
        dEl.innerHTML = deltaText(si);
        nodes.forEach(function (nd, ni) {
          var on = ni === si;
          nd.querySelectorAll('circle')[1].setAttribute('stroke-width', on ? '4' : '2.5');
        });
      }
      scrub.addEventListener('input', function () { select(Number(scrub.value)); });
      VHL.bindNodes(el.querySelector('svg'), function (id) { select(Number(id)); });
      select(seasons.length - 1);
    }

    return { html: html, bind: bind };
  };
})(window);
