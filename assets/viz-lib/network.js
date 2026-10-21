/* viz-lib network — radial node-link graph. No dependencies.
 *
 * Graduated from assets/twin-network.js (graphsketball Twin Networks).
 * Generalized: any center + neighbors with weighted edges.
 *
 *   VHL.net.render({
 *     center:  {id, label, sub},          // gold node
 *     nodes:   [{id, label, sub, color}], // ring nodes (color optional)
 *     edges:   [{to, w, color}],          // w = weight 0..1 (edge width ~ w)
 *     simRange: [min, max],               // maps w -> px (default [0.5,1])
 *     size:    [620, 320], onNode: fn,    // onNode bound via VHL.bindNodes
 *     label:   'aria label', animate: true
 *   }) -> svg string. Node ids land in data-vhl-node for VHL.bindNodes.
 *
 * Motion encodes data: edges draw from the center outward; higher weight =
 * faster draw (shorter --vhl-dur). Under reduced-motion everything renders
 * in its final state.
 */
(function (global) {
  'use strict';
  var VHL = (global.VHL = global.VHL || {});
  var net = (VHL.net = VHL.net || {});

  net.radial = function (n, cx, cy, r, phase) {
    var pts = [],
      i;
    for (i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + (phase == null ? -Math.PI / 2 : phase);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  };

  function edgeWidth(w, range) {
    var lo = range[0],
      hi = range[1];
    var k = hi > lo ? (w - lo) / (hi - lo) : 1;
    k = Math.max(0, Math.min(1, k));
    return 1.5 + k * 9;
  }

  net.render = function (opts) {
    var c = VHL.colors();
    var W = (opts.size && opts.size[0]) || 620;
    var H = (opts.size && opts.size[1]) || 320;
    var cx = W / 2,
      cy = H / 2 - 8;
    var R = Math.min(W, H) / 2 - 58;
    var nodes = opts.nodes || [];
    var edges = opts.edges || [];
    var range = opts.simRange || [0.5, 1];
    var anim = opts.animate !== false && !VHL.reduced();
    var edgeByTo = {};
    edges.forEach(function (e) {
      edgeByTo[e.to] = e;
    });

    var s = VHL.svgOpen(W, H, opts.label || 'network graph');
    if (anim) s = s.replace('class="vhl-svg"', 'class="vhl-svg vhl-anim"');
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + c.void + '" rx="8"/>';

    var pts = net.radial(nodes.length, cx, cy, R);
    var pos = {};
    nodes.forEach(function (nd, i) {
      pos[nd.id] = pts[i];
    });

    // edges first (under nodes)
    nodes.forEach(function (nd) {
      var e = edgeByTo[nd.id];
      if (!e) return;
      var p = pos[nd.id];
      var wpx = edgeWidth(e.w, range);
      // higher weight -> faster draw: motion encodes similarity
      var dur = Math.round(900 - Math.min(1, Math.max(0, (e.w - range[0]) / (range[1] - range[0] || 1))) * 600);
      s +=
        '<line class="vhl-edge" pathLength="100" x1="' + cx.toFixed(1) + '" y1="' + cy.toFixed(1) +
        '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) +
        '" stroke="' + (e.color || c.terra) + '" stroke-width="' + wpx.toFixed(1) +
        '" opacity="0.75"' + (anim ? ' style="--vhl-dur:' + dur + 'ms"' : '') + '/>';
    });

    // nodes
    nodes.forEach(function (nd, i) {
      var p = pos[nd.id];
      var fill = nd.color || c.terra;
      var delay = Math.round(i * 45);
      s +=
        '<g data-vhl-node="' + VHL.esc(nd.id) + '" class="vhl-node" tabindex="0" role="button"' +
        ' aria-label="' + VHL.esc(nd.label + (nd.sub ? ', ' + nd.sub : '')) + '"' +
        (anim ? ' style="--vhl-d:' + delay + 'ms"' : '') + '>';
      s += '<circle class="vhl-hit" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="24" fill="transparent"/>';
      s += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="15" fill="' + fill + '" opacity="0.92"/>';
      s +=
        '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 32).toFixed(1) + '" text-anchor="middle"' +
        ' font-size="13" fill="' + c.fg2 + '">' + VHL.esc(nd.label) + '</text>';
      if (nd.sub) {
        s +=
          '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 48).toFixed(1) + '" text-anchor="middle"' +
          ' font-size="12" font-weight="700" fill="' + c.fg + '">' + VHL.esc(nd.sub) + '</text>';
      }
      s += '</g>';
    });

    // center node
    var ctr = opts.center || { label: '' };
    s += '<g class="vhl-node"' + (anim ? ' style="--vhl-d:0ms"' : '') + '>';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="24" fill="' + c.gold + '"/>';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="30" fill="none" stroke="' + c.gold + '" opacity="0.35"/>';
    s +=
      '<text x="' + cx + '" y="' + (cy + 44) + '" text-anchor="middle" font-size="13" font-weight="700" fill="' +
      c.fg + '">' + VHL.esc(ctr.label) + '</text>';
    if (ctr.sub) {
      s +=
        '<text x="' + cx + '" y="' + (cy + 60) + '" text-anchor="middle" font-size="12" fill="' +
        c.fg2 + '">' + VHL.esc(ctr.sub) + '</text>';
    }
    s += '</g>';

    return s + '</svg>';
  };
})(window);
