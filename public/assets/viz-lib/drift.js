/* viz-lib drift — era drift map. No dependencies.
 *
 * Graduates the Era-Uniqueness launch feature (insights/era-uniqueness.html)
 * into a library primitive. Each decade is a lane; the lane shows the
 * distribution of Era-Uniqueness 0-100 scores for its player-seasons as a
 * binned strip, with the decade median marked and one season highlighted.
 *
 *   VHL.drift.render({
 *     lanes: [{label, scores:[{id,label,score,sub}], highlightId}],
 *     bins: 12, size: [640, 120 + lanes*64],
 *     label: 'aria label', animate: true
 *   }) -> svg string.
 *
 * Score definition (assets/era_uniqueness.json): 1 - cosine(player,
 * own-decade mean) in the L2-normalized MTNN v5 64-d space, minus the
 * player's own season median, min-max 0-100. The foot text on every page
 * using this primitive must say so — never a bare number.
 *
 * Motion encodes data: the median markers sweep in from 0; bins rise with
 * heights proportional to counts.
 */
(function (global) {
  'use strict';
  var VHL = (global.VHL = global.VHL || {});
  var drift = (VHL.drift = VHL.drift || {});

  drift.render = function (opts) {
    var c = VHL.colors();
    var lanes = opts.lanes || [];
    var NB = opts.bins || 12;
    var W = (opts.size && opts.size[0]) || 640;
    var laneH = 62;
    var topPad = 44,
      botPad = 34;
    var H = (opts.size && opts.size[1]) || topPad + lanes.length * laneH + botPad;
    var anim = opts.animate !== false && !VHL.reduced();
    var padL = 76,
      padR = 30;
    var x0 = padL,
      x1 = W - padR;

    function X(v) {
      return x0 + (Math.max(0, Math.min(100, v)) / 100) * (x1 - x0);
    }

    var s = VHL.svgOpen(W, H, opts.label || 'era drift map');
    if (anim) s = s.replace('class="vhl-svg"', 'class="vhl-svg vhl-anim"');
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + c.void + '" rx="8"/>';

    // x axis 0..100
    for (var t = 0; t <= 100; t += 25) {
      s +=
        '<text x="' + X(t) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="' +
        c.fg3 + '">' + t + '</text>';
      s +=
        '<line x1="' + X(t) + '" y1="' + topPad + '" x2="' + X(t) + '" y2="' + (H - botPad) +
        '" stroke="' + c.line + '" stroke-width="1" opacity="0.6"/>';
    }
    s +=
      '<text x="' + ((x0 + x1) / 2) + '" y="' + (H - 26) + '" text-anchor="middle" font-size="11" fill="' +
      c.fg2 + '">Era-Uniqueness 0\u2013100 \u2192 stranger for its time</text>';

    lanes.forEach(function (lane, li) {
      var yT = topPad + li * laneH;
      var yC = yT + laneH / 2;
      // lane label
      s +=
        '<text x="' + (padL - 10) + '" y="' + (yC + 4) + '" text-anchor="end" font-size="13" font-weight="700" fill="' +
        c.fg + '">' + VHL.esc(lane.label) + '</text>';

      var scores = (lane.scores || []).map(function (d) { return d.score; }).sort(function (a, b) { return a - b; });
      var n = scores.length;
      if (!n) {
        s += '<text x="' + x0 + '" y="' + (yC + 4) + '" font-size="12" fill="' + c.fg3 + '">no charted seasons</text>';
        return;
      }
      var median = scores[Math.floor(n / 2)];

      // binned strip: counts per bin -> bar heights
      var counts = [];
      for (var b = 0; b < NB; b++) counts.push(0);
      scores.forEach(function (v) {
        var bi = Math.min(NB - 1, Math.floor((Math.max(0, Math.min(100, v)) / 100) * NB));
        counts[bi]++;
      });
      var cmax = Math.max.apply(null, counts) || 1;
      var bw = (x1 - x0) / NB;
      var bh = laneH - 26;
      counts.forEach(function (ct, bi) {
        if (!ct) return;
        var h = Math.max(3, (ct / cmax) * bh);
        var bx = x0 + bi * bw + 1;
        var dur = Math.round(500 + (h / bh) * 400);
        s +=
          '<rect class="vhl-bar" x="' + bx.toFixed(1) + '" y="' + (yC + bh / 2 - h).toFixed(1) +
          '" width="' + (bw - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" fill="' + c.terra +
          '" opacity="0.85"' +
          (anim
            ? ' style="transform-origin:' + bx.toFixed(1) + 'px ' + (yC + bh / 2).toFixed(1) +
              'px;animation:vhl-rise ' + dur + 'ms ease-out ' + li * 120 + 'ms both"'
            : '') + '/>';
      });

      // median marker — sweeps in from 0 (motion encodes the value)
      var mx = X(median);
      s +=
        '<line x1="' + x0 + '" y1="' + (yC - bh / 2 - 4) + '" x2="' + mx + '" y2="' + (yC - bh / 2 - 4) +
        '" stroke="' + c.gold + '" stroke-width="2"' +
        (anim ? ' class="vhl-edge" pathLength="100" style="--vhl-dur:700ms;animation-delay:' + li * 120 + 'ms"' : '') + '/>';
      s +=
        '<text x="' + mx + '" y="' + (yC - bh / 2 - 10) + '" text-anchor="middle" font-size="11" font-weight="700" fill="' +
        c.gold + '">med ' + median.toFixed(0) + '</text>';

      // highlight the selected season
      (lane.scores || []).forEach(function (d) {
        if (String(d.id) !== String(lane.highlightId)) return;
        var hx = X(d.score);
        s +=
          '<g data-vhl-node="' + VHL.esc(d.id) + '" tabindex="0" role="button" aria-label="' +
          VHL.esc(d.label + ' uniqueness ' + d.score.toFixed(1)) + '">';
        s += '<circle class="vhl-hit" cx="' + hx.toFixed(1) + '" cy="' + yC.toFixed(1) + '" r="24" fill="transparent"/>';
        s += '<circle cx="' + hx.toFixed(1) + '" cy="' + yC.toFixed(1) + '" r="9" fill="' + c.accent +
          '" stroke="' + c.board + '" stroke-width="2"/>';
        s += '</g>';
        s +=
          '<text x="' + Math.min(x1 - 4, Math.max(x0 + 4, hx)) + '" y="' + (yC + bh / 2 + 14) +
          '" text-anchor="middle" font-size="11.5" fill="' + c.fg + '">' +
          VHL.esc(d.label) + ' \u00b7 ' + d.score.toFixed(1) + '</text>';
      });
    });

    return s + '</svg>';
  };
})(window);
