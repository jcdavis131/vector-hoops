/* viz-lib bars — distribution / leaderboard bars. No dependencies.
 *
 * Graduated from the barsSVG card pattern in assets/insights.js.
 * Generalized: ranked rows with value-proportional bars from a true zero
 * baseline (or a diverging zero axis when values go negative).
 *
 *   VHL.bars.render({
 *     rows:  [{label, tag, value, color, sub}],  // desc by value
 *     unit:  '$M', fmt: fn(v)->string,
 *     zero:  'left' | 'middle',   // baseline; 'middle' for diverging values
 *     size:  [620, 60 + rows*46],
 *     label: 'aria label', max: number, animate: true
 *   }) -> svg string.
 *
 * Motion encodes data: bars grow from the baseline on mount, longest first
 * (rank order). Under reduced-motion they render at full width instantly.
 */
(function (global) {
  'use strict';
  var VHL = (global.VHL = global.VHL || {});
  var bars = (VHL.bars = VHL.bars || {});

  bars.render = function (opts) {
    var c = VHL.colors();
    var rows = opts.rows || [];
    var W = (opts.size && opts.size[0]) || 620;
    var rowH = 46;
    var H = (opts.size && opts.size[1]) || 40 + rows.length * rowH;
    var anim = opts.animate !== false && !VHL.reduced();
    var diverging = opts.zero === 'middle' || rows.some(function (r) { return r.value < 0; });
    var max = opts.max;
    if (max == null) {
      max = 0;
      rows.forEach(function (r) {
        max = Math.max(max, Math.abs(r.value));
      });
      max = max || 1;
    }
    var padL = 24,
      padR = 90,
      plotL = padL,
      plotW = W - padL - padR;
    var zeroX = diverging ? plotL + plotW / 2 : plotL;
    var half = diverging ? plotW / 2 : plotW;

    function fmt(v) {
      if (opts.fmt) return opts.fmt(v);
      return (v > 0 && diverging ? '+' : '') + v.toFixed(1) + (opts.unit ? ' ' + opts.unit : '');
    }

    var s = VHL.svgOpen(W, H, opts.label || 'bar chart');
    if (anim) s = s.replace('class="vhl-svg"', 'class="vhl-svg vhl-anim"');
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + c.void + '" rx="8"/>';

    rows.forEach(function (r, i) {
      var y = 28 + i * rowH;
      var bw = Math.max(3, (Math.abs(r.value) / max) * half);
      var x = r.value < 0 ? zeroX - bw : zeroX;
      var fill = r.color || (i === 0 ? c.gold : c.terra);
      // label above the bar
      s +=
        '<text x="' + padL + '" y="' + (y - 6) + '" font-size="13" fill="' + c.fg2 + '">' +
        VHL.esc(r.label) +
        (r.tag ? ' <tspan fill="' + c.fg3 + '">' + VHL.esc(r.tag) + '</tspan>' : '') +
        '</text>';
      // value at bar end
      var vx = r.value < 0 ? x - 8 : x + bw + 8;
      var anchor = r.value < 0 ? 'end' : 'start';
      if (!diverging && x + bw + 8 + 60 > W) {
        vx = x + bw - 8;
        anchor = 'end';
      }
      s +=
        '<text x="' + vx.toFixed(1) + '" y="' + (y + 15) + '" text-anchor="' + anchor +
        '" font-size="12" font-weight="700" fill="' + c.fg + '">' + VHL.esc(fmt(r.value)) + '</text>';
      // the bar — grows from the baseline; longest (rank 1) first
      var dur = Math.round(700 - (i / Math.max(1, rows.length - 1)) * 400);
      var ox = r.value < 0 ? zeroX : x; // grow outward from the baseline
      s +=
        '<rect class="vhl-bar" x="' + x.toFixed(1) + '" y="' + y + '" width="' + bw.toFixed(1) +
        '" height="18" rx="4" fill="' + fill + '" opacity="0.9"' +
        (anim
          ? ' style="transform-origin:' + ox.toFixed(1) + 'px ' + (y + 9) + 'px;animation:vhl-grow ' + dur +
            'ms ease-out ' + i * 60 + 'ms both"'
          : '') +
        '/>';
      if (r.sub) {
        s +=
          '<text x="' + padL + '" y="' + (y + 34) + '" font-size="11.5" fill="' + c.fg3 + '">' +
          VHL.esc(r.sub) + '</text>';
      }
    });

    // baseline
    s +=
      '<line x1="' + zeroX + '" y1="20" x2="' + zeroX + '" y2="' + (H - 12) +
      '" stroke="' + c.fg3 + '" stroke-width="1" opacity="0.5"/>';
    return s + '</svg>';
  };
})(window);
