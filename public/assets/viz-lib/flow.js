/* viz-lib flow — staged flow / Sankey diagram. No dependencies.
 *
 * Graduated from the Stat Flow in assets/twin-network.js.
 * Generalized: N stages, each with nodes; links connect node ids across
 * stages with value-proportional widths.
 *
 *   VHL.flow.render({
 *     stages: ['Era', 'Archetype', 'Stat signature', 'Era twin'],
 *     nodes:  [{id, stage, lines:[], value, color, dashed}],
 *     links:  [{from, to, value, color}],
 *     size:   [620, 330], label: 'aria label', animate: true
 *   }) -> svg string.
 *
 * Node heights are proportional to value within their stage column.
 * Links animate a dash drift (data in motion); paused under reduced-motion.
 */
(function (global) {
  'use strict';
  var VHL = (global.VHL = global.VHL || {});
  var flow = (VHL.flow = VHL.flow || {});

  function wrap2(name) {
    var parts = String(name).split(' + ');
    if (parts.length === 2) return parts;
    var words = String(name).split(' '),
      mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }

  flow.render = function (opts) {
    var c = VHL.colors();
    var stages = opts.stages || [];
    var nodes = opts.nodes || [];
    var links = opts.links || [];
    var W = (opts.size && opts.size[0]) || 620;
    var H = (opts.size && opts.size[1]) || 330;
    var anim = opts.animate !== false && !VHL.reduced();
    var n = Math.max(1, stages.length);
    var CW = Math.min(120, (W - 48) / n - 56);
    var gap = (W - 48 - n * CW) / Math.max(1, n - 1);
    var X = [];
    var i, j;
    for (i = 0; i < n; i++) X.push(24 + i * (CW + gap));
    var nodeFill = c.dark ? '#2a2d30' : '#FFFFFF';

    var s = VHL.svgOpen(W, H, opts.label || 'flow diagram');
    if (anim) s = s.replace('class="vhl-svg"', 'class="vhl-svg vhl-anim"');
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + c.void + '" rx="8"/>';

    stages.forEach(function (t, si) {
      s +=
        '<text x="' + (X[si] + CW / 2) + '" y="22" text-anchor="middle" font-size="11" letter-spacing="1.5"' +
        ' fill="' + c.fg2 + '" style="text-transform:uppercase">' + VHL.esc(t) + '</text>';
    });

    // layout: stack nodes per stage, heights proportional to value
    var byStage = {};
    nodes.forEach(function (nd) {
      (byStage[nd.stage] = byStage[nd.stage] || []).push(nd);
    });
    var geom = {};
    Object.keys(byStage).forEach(function (sk) {
      var si = Number(sk);
      var list = byStage[sk];
      var tot = 0;
      list.forEach(function (nd) {
        tot += Math.abs(nd.value || 0);
      });
      tot = tot || 1;
      var y = 56,
        Htot = H - 56 - 28;
      list.forEach(function (nd) {
        var h = Math.max(30, (Math.abs(nd.value || 0) / tot) * Htot);
        geom[nd.id] = { x: X[si], y: y, w: CW, h: h, cy: y + h / 2, si: si };
        y += h + 8;
      });
    });

    function link(x1, y1, x2, y2, w, color) {
      var mx = (x1 + x2) / 2;
      return (
        '<path class="vhl-flowlink" d="M' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' C' + mx.toFixed(1) + ',' +
        y1.toFixed(1) + ' ' + mx.toFixed(1) + ',' + y2.toFixed(1) + ' ' + x2.toFixed(1) + ',' + y2.toFixed(1) +
        '" fill="none" stroke="' + color + '" stroke-width="' + w.toFixed(1) + '" opacity="0.7"/>'
      );
    }

    links.forEach(function (L) {
      var a = geom[L.from],
        b = geom[L.to];
      if (!a || !b) return;
      var w = Math.max(2, Math.min(30, (L.value || 0) * 30));
      // curved links between adjacent stages; straight-ish otherwise
      if (b.si === a.si + 1) s += link(a.x + a.w, a.cy, b.x, b.cy, w, L.color || c.terra);
      else {
        var mx = (a.x + a.w + b.x) / 2;
        s += link(a.x + a.w, a.cy, b.x, b.cy, w, L.color || c.terra);
        void mx;
      }
    });

    nodes.forEach(function (nd) {
      var g = geom[nd.id];
      if (!g) return;
      var lines = nd.lines || (nd.label ? wrap2(nd.label) : []);
      var fill = nd.color || nodeFill;
      s +=
        '<rect x="' + g.x.toFixed(1) + '" y="' + g.y.toFixed(1) + '" width="' + g.w.toFixed(1) + '" height="' +
        g.h.toFixed(1) + '" rx="8" fill="' + (fill === 'none' ? 'none' : fill) + '"' +
        (nd.dashed ? ' stroke-dasharray="6 4" stroke="' + c.fg3 + '" stroke-width="1.5"' : '') + '/>';
      lines.forEach(function (ln, li) {
        s +=
          '<text x="' + (g.x + g.w / 2).toFixed(1) + '" y="' +
          (g.y + g.h / 2 - (lines.length - 1) * 8 + li * 16).toFixed(1) +
          '" text-anchor="middle" font-size="13" font-weight="700" fill="' + c.fg + '">' +
          VHL.esc(ln) + '</text>';
      });
      if (nd.sub) {
        s +=
          '<text x="' + (g.x + g.w / 2).toFixed(1) + '" y="' + (g.y + g.h + 18).toFixed(1) +
          '" text-anchor="middle" font-size="12" fill="' + c.fg2 + '">' + VHL.esc(nd.sub) + '</text>';
      }
    });

    return s + '</svg>';
  };
})(window);
