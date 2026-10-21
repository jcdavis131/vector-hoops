/* viz-lib matchup — head-to-head twin-network comparison. No dependencies.
 *
 * NEW primitive (Pillar 4). Two player-seasons, each with their twin ring
 * (VHL.net), side by side; shared twins are painted gold in both rings and
 * listed as chips; the center strip shows the direct cosine similarity
 * between the two centers with a plain-words read.
 *
 *   VHL.matchup.render({
 *     a: {id, label, sub, nodes:[{id,label,sub}], edges:[{to,w}]},
 *     b: {id, label, sub, nodes:[{id,label,sub}], edges:[{to,w}]},
 *     simAB: 0.812,            // cosine similarity center-to-center
 *     size: [620, 300],        // per-network size
 *     label: 'aria label'
 *   }) -> html string (vs strip + two .vhl-duo network frames).
 *
 * Shared twins (same player name in both rings, any season) get gold nodes.
 * The page wires VHL.bindNodes on each svg and VHL.wireShare on the section.
 */
(function (global) {
  'use strict';
  var VHL = (global.VHL = global.VHL || {});
  var matchup = (VHL.matchup = VHL.matchup || {});

  function baseName(label) {
    // 'Kobe Bryant' from 'Kobe Bryant' (labels here are already names)
    return String(label).trim().toLowerCase();
  }

  matchup.shared = function (a, b) {
    var inA = {};
    (a.nodes || []).forEach(function (n) {
      inA[baseName(n.label)] = n;
    });
    var out = [];
    (b.nodes || []).forEach(function (n) {
      if (inA[baseName(n.label)]) out.push({ a: inA[baseName(n.label)], b: n });
    });
    return out;
  };

  matchup.render = function (opts) {
    var c = VHL.colors();
    var shared = matchup.shared(opts.a, opts.b);
    var sharedIds = {};
    shared.forEach(function (p) {
      sharedIds[p.a.id] = 1;
      sharedIds[p.b.id] = 1;
    });

    function paint(side) {
      var nodes = (side.nodes || []).map(function (n) {
        return {
          id: n.id,
          label: n.label,
          sub: n.sub,
          color: sharedIds[n.id] ? c.gold : undefined
        };
      });
      return VHL.net.render({
        center: { label: side.label, sub: side.sub },
        nodes: nodes,
        edges: side.edges,
        size: opts.size || [620, 300],
        label: (opts.label || 'matchup') + ' — ' + side.label + ' twin ring',
        animate: true
      });
    }

    var s = '';
    // vs strip: direct similarity + shared-twin chips
    var sim = opts.simAB;
    var read =
      sim == null
        ? 'Direct similarity unknown for this pair.'
        : sim >= 0.8
        ? 'Genuinely similar seasons \u2014 the embedding barely separates them.'
        : sim >= 0.65
        ? 'Same neighborhood, different corners \u2014 comparable archetypes.'
        : 'Different players, really \u2014 the overlap below is what they share.';
    s += '<div class="vhl-vs" role="group" aria-label="head-to-head summary">';
    s += '<div><div class="vhl-vs__sim">' + (sim == null ? 'n/a' : sim.toFixed(3)) + '</div>';
    s += '<div class="vhl-vs__lbl">cosine similarity, ' + VHL.esc(opts.a.label) + ' vs ' + VHL.esc(opts.b.label) +
      ' \u00b7 ' + VHL.esc(read) + '</div></div>';
    if (shared.length) {
      s += '<div class="vhl-vs__shared" aria-label="shared twins">';
      shared.forEach(function (p) {
        s += '<span class="vhl-chip">' + VHL.esc(p.a.label) + '</span>';
      });
      s += '</div>';
      s += '<div class="vhl-vs__lbl">' + shared.length + ' shared twin' + (shared.length === 1 ? '' : 's') +
        ' across both rings \u2014 gold nodes</div>';
    } else {
      s += '<div class="vhl-vs__lbl">No shared twins in the top 8 \u2014 these two live in different neighborhoods.</div>';
    }
    s += '</div>';

    s += '<div class="vhl-duo">';
    s += '<div class="vhl-frame" style="aspect-ratio:' + (opts.size ? opts.size[0] + '/' + opts.size[1] : '620/300') + '">' + paint(opts.a) + '</div>';
    s += '<div class="vhl-frame" style="aspect-ratio:' + (opts.size ? opts.size[0] + '/' + opts.size[1] : '620/300') + '">' + paint(opts.b) + '</div>';
    s += '</div>';
    return s;
  };
})(window);
