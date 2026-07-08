/* Vector Hoops — assets/network-viz.js
 * MTNN network explorer (/model): 3D embedding map + animated layer flow.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var PALETTE = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9',
    '#e66767', '#d55181', '#d95926'];
  var ORANGE = '#eb6834';
  var INK = '#e8e6df';
  var MUTED = '#8a8983';
  var HAIR = '#3a3935';
  var BG = '#121210';
  var AXIS_COLORS = ['#f07070', '#5cc99a', '#6eb5ff'];
  var MAX_INPUT_NODES = 10;
  var SKILL_LABELS = {
    ft: 'Free Throw Shooting',
    efficiency: 'Scoring Efficiency',
    rim: 'Rim Pressure (FTs)',
    three: 'Three-Point Volume',
    three_acc: 'Three-Point Accuracy',
    dreb: 'Defensive Rebounding',
    oreb: 'Offensive Rebounding',
    rim_def: 'Rim Protection',
    steal: 'Ball Pressure',
    playmaking: 'Playmaking',
    foul_avoid: 'Foul Discipline',
    security: 'Ball Security',
    gravity_off: 'Off-Ball Gravity',
    gravity_on: 'On-Ball Gravity',
    gravity_rim: 'Rim Gravity',
    hand_activity: 'Hand Activity',
    recovery: 'Defensive Recovery',
    screen_nav: 'Screen Navigation'
  };

  var STEPS = [
    {
      id: 'input',
      caption: '129 masked features arrive in 18 families — volume, playmaking, tracking, roster context, and more.'
    },
    {
      id: 'towers',
      caption: 'Each ResidualTower encodes one family (96 hidden → 24-d). Missing tracking eras are masked out.'
    },
    {
      id: 'fusion',
      caption: 'Concat fusion stacks 18×24 tower outputs, adds a season token, and projects to a 48-d vector (L2-normalized).'
    },
    {
      id: 'embedding',
      caption: 'The embedding is where daily puzzles score cosine similarity — your player lights up on the PCA map.'
    },
    {
      id: 'heads',
      caption: 'Decode heads read the embedding: archetype logits, position logits, skill towers, and next-season profile stats.'
    }
  ];

  var state = {
    players: [],
    bySlug: {},
    byNameRows: {},
    arch: null,
    map: null,
    heads: null,
    inputs: null,
    features: [],
    featureIndex: {},
    featureLabel: {},
    familyOrder: [],
    familyFeatures: {},
    nArch: 8,
    nSkills: 18,
    nPos: 5,
    nNext: 14,
    playerIdx: -1,
    compareIdx: -1,
    compareOn: false,
    careerRows: [],
    selectedNode: { type: 'head_group', key: 'archetype' },
    step: 0,
    playing: false,
    particles: [],
    flowLayout: null,
    cam: { yaw: 0.55, pitch: 0.25, zoom: 1.1, focal: 2.4 },
    drag: null,
    mapSize: { w: 0, h: 0, dpr: 1 }
  };

  function $(id) { return document.getElementById(id); }

  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function seasonStart(season) {
    var m = String(season || '').match(/^(\d{4})-/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function softmax(arr) {
    var max = Math.max.apply(null, arr);
    var ex = arr.map(function (v) { return Math.exp(v - max); });
    var sum = ex.reduce(function (a, b) { return a + b; }, 0);
    return ex.map(function (v) { return v / sum; });
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function capPredPct(v) {
    return Math.max(0, Math.min(99.9, v));
  }

  function fmtPredScore(v) {
    var capped = capPredPct(v);
    var one = Math.round(capped * 10) / 10;
    if (Math.abs(one - capped) < 0.01) return one.toFixed(1);
    return (Math.round(capped * 100) / 100).toFixed(2);
  }

  function inputSignalsForPlayer(playerIdx) {
    if (!state.inputs || !state.familyOrder.length || playerIdx < 0) return [];
    var famVals = {};
    var rowOff = playerIdx * state.familyOrder.length;
    state.familyOrder.forEach(function (fam, i) {
      famVals[fam] = clamp01(Number(state.inputs[rowOff + i] || 0));
    });
    var ranked = state.familyOrder.map(function (fam) {
      var feats = state.familyFeatures && state.familyFeatures[fam] ? state.familyFeatures[fam] : [];
      return {
        key: fam,
        label: fam.replace(/_/g, ' '),
        features: feats,
        score: famVals[fam]
      };
    });
    ranked.sort(function (a, b) { return b.score - a.score; });
    return ranked;
  }

  function familyWeight(fam, signals) {
    for (var i = 0; i < signals.length; i++) {
      if (signals[i].key === fam) return signals[i].score;
    }
    return 0.0;
  }

  function distance3(a, b) {
    var dx = a[0] - b[0];
    var dy = a[1] - b[1];
    var dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function normalizedEntropy(values) {
    if (!values || !values.length) return 0;
    var sum = values.reduce(function (a, b) { return a + Math.max(0, b); }, 0);
    if (sum <= 1e-9) return 0;
    var h = 0;
    var n = values.length;
    for (var i = 0; i < n; i++) {
      var p = Math.max(0, values[i]) / sum;
      if (p > 1e-9) h -= p * Math.log(p);
    }
    return h / Math.log(n);
  }

  function embeddingNeighbors(playerIdx, k) {
    if (!state.map || !state.map.coords || playerIdx < 0) return [];
    var coords = state.map.coords;
    var self = coords[playerIdx];
    if (!self) return [];
    var selfName = state.players[playerIdx] && state.players[playerIdx].name;
    var out = [];
    for (var i = 0; i < coords.length; i++) {
      if (i === playerIdx) continue;
      if (selfName && state.players[i] && state.players[i].name === selfName) continue;
      var d = distance3(self, coords[i]);
      var sim = 1 / (1 + d * 12);
      out.push({ idx: i, dist: d, sim: sim });
    }
    out.sort(function (a, b) { return a.dist - b.dist; });
    return out.slice(0, Math.max(1, k || 5));
  }

  function flowDiagnostics(playerIdx) {
    var signals = inputSignalsForPlayer(playerIdx);
    var row = headRow(playerIdx);
    if (!signals.length || !row) return null;

    var signalVals = signals.map(function (s) { return s.score; });
    var signalMass = signalVals.reduce(function (a, b) { return a + b; }, 0);
    var top3Mass = topN(signals, 3, 'score').reduce(function (a, b) { return a + b.score; }, 0);
    var inputFocus = signalMass > 1e-9 ? top3Mass / signalMass : 0;
    var towerSpread = 1 - normalizedEntropy(signalVals);

    var arch = softmax(Array.prototype.slice.call(row, 0, state.nArch));
    var archSorted = arch.slice().sort(function (a, b) { return b - a; });
    var archMargin = (archSorted[0] || 0) - (archSorted[1] || 0);

    var offSkill = state.nArch;
    var offPos = offSkill + state.nSkills;
    var offNext = offPos + state.nPos;
    var pos = softmax(Array.prototype.slice.call(row, offPos, offNext));
    var posSorted = pos.slice().sort(function (a, b) { return b - a; });
    var posMargin = (posSorted[0] || 0) - (posSorted[1] || 0);

    var skillVals = Array.prototype.slice.call(row, offSkill, offPos).map(function (v) { return clamp01(v); });
    var skillMean = skillVals.length ? skillVals.reduce(function (a, b) { return a + b; }, 0) / skillVals.length : 0;
    var skillVar = 0;
    if (skillVals.length) {
      for (var i = 0; i < skillVals.length; i++) {
        var dv = skillVals[i] - skillMean;
        skillVar += dv * dv;
      }
      skillVar /= skillVals.length;
    }
    var skillContrast = Math.min(1, Math.sqrt(skillVar) * 3.2);

    var nextVals = Array.prototype.slice.call(row, offNext, offNext + state.nNext);
    var nextMag = nextVals.length
      ? nextVals.reduce(function (a, b) { return a + Math.abs(b); }, 0) / nextVals.length
      : 0;
    var nextSignal = clamp01(nextMag / 1.5);

    return {
      inputFocus: inputFocus,
      towerSpread: towerSpread,
      archMargin: archMargin,
      posMargin: posMargin,
      skillContrast: skillContrast,
      nextSignal: nextSignal
    };
  }

  function buildNameIndex() {
    state.byNameRows = {};
    state.players.forEach(function (p, idx) {
      if (!p || !p.name) return;
      if (!state.byNameRows[p.name]) state.byNameRows[p.name] = [];
      state.byNameRows[p.name].push(idx);
    });
    Object.keys(state.byNameRows).forEach(function (name) {
      state.byNameRows[name].sort(function (a, b) {
        return seasonStart(state.players[a].season) - seasonStart(state.players[b].season);
      });
    });
  }

  function bestArchForRow(row) {
    if (!row) return null;
    var probs = softmax(Array.prototype.slice.call(row, 0, state.nArch));
    var best = 0;
    for (var i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
    return { idx: best, p: probs[best] || 0 };
  }

  function headKeyToIndex(key) {
    if (!state.flowLayout || !state.flowLayout.headDefs) return -1;
    for (var i = 0; i < state.flowLayout.headDefs.length; i++) {
      if (state.flowLayout.headDefs[i].key === key) return i;
    }
    return -1;
  }

  function project3D(x, y, z, w, h, cam) {
    var cx = w * 0.5;
    var cy = h * 0.52;
    var scale = Math.min(w, h) * 0.42 * cam.zoom;
    var cosY = Math.cos(cam.yaw);
    var sinY = Math.sin(cam.yaw);
    var cosP = Math.cos(cam.pitch);
    var sinP = Math.sin(cam.pitch);
    var x1 = x - 0.5;
    var y1 = y - 0.5;
    var z1 = z - 0.5;
    var xr = x1 * cosY - z1 * sinY;
    var zr = x1 * sinY + z1 * cosY;
    var yr = y1 * cosP - zr * sinP;
    var zf = y1 * sinP + zr * cosP + cam.focal;
    var depth = zf;
    return {
      sx: cx + (xr / zf) * scale,
      sy: cy + (yr / zf) * scale,
      depth: depth
    };
  }

  function drawEmbeddingAxes(ctx, w, h, cam) {
    var center = project3D(0.5, 0.5, 0.5, w, h, cam);
    var defs = [
      { key: 'X', hi: [0.98, 0.5, 0.5], lo: [0.02, 0.5, 0.5], color: AXIS_COLORS[0] },
      { key: 'Y', hi: [0.5, 0.98, 0.5], lo: [0.5, 0.02, 0.5], color: AXIS_COLORS[1] },
      { key: 'Z', hi: [0.5, 0.5, 0.98], lo: [0.5, 0.5, 0.02], color: AXIS_COLORS[2] }
    ];
    var axes = (state.map && state.map.axes) || [];

    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    defs.forEach(function (d, i) {
      var hi = project3D(d.hi[0], d.hi[1], d.hi[2], w, h, cam);
      var lo = project3D(d.lo[0], d.lo[1], d.lo[2], w, h, cam);
      ctx.strokeStyle = d.color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(lo.sx, lo.sy);
      ctx.lineTo(hi.sx, hi.sy);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(hi.sx, hi.sy, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(d.key, hi.sx + 6, hi.sy + 3);
    });

    var panelX = 12;
    var panelY = 12;
    var panelW = Math.min(w - 24, 520);
    var lineH = 14;
    var panelH = 10 + Math.max(1, axes.length) * (lineH + 12);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.fillStyle = '#c7c5bd';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillText('PCA Axes (MTNN 48-d)', panelX + 8, panelY + 13);
    axes.forEach(function (ax, i) {
      var y = panelY + 30 + i * (lineH + 12);
      ctx.fillStyle = AXIS_COLORS[i % AXIS_COLORS.length];
      ctx.fillText((ax.axis || ['X', 'Y', 'Z'][i]) + ' / ' + (ax.pc || ('PC' + (i + 1))), panelX + 8, y);
      ctx.fillStyle = '#d7d5ce';
      ctx.fillText((ax.hi || '').slice(0, 72), panelX + 90, y);
      ctx.fillStyle = '#9d9b94';
      ctx.fillText((ax.lo || '').slice(0, 72), panelX + 90, y + lineH);
    });
    ctx.restore();
  }

  function headRow(playerIdx) {
    if (!state.heads || playerIdx < 0) return null;
    var total = state.nArch + state.nSkills + state.nPos + state.nNext;
    var off = playerIdx * total;
    return state.heads.subarray(off, off + total);
  }

  function towerHeights(playerIdx) {
    if (playerIdx < 0) return null;
    var signals = inputSignalsForPlayer(playerIdx);
    var fams = state.arch.towerFamilies || [];
    return fams.map(function (_, i) {
      var s = familyWeight(fams[i], signals);
      return 0.25 + s * 0.75;
    });
  }

  function topN(items, n, valueKey) {
    return items.slice().sort(function (a, b) { return (b[valueKey] || 0) - (a[valueKey] || 0); }).slice(0, n);
  }

  function summarizeStory(playerIdx) {
    var signals = inputSignalsForPlayer(playerIdx);
    var topInputs = topN(signals, 3, 'score');

    var fams = state.arch && state.arch.towerFamilies ? state.arch.towerFamilies : [];
    var towerScores = fams.map(function (fam) {
      return { fam: fam, score: familyWeight(fam, signals) };
    });
    var topTowers = topN(towerScores, 3, 'score');

    var row = headRow(playerIdx);
    var topArch = null;
    var topSkills = [];
    var topNext = [];
    if (row) {
      var probs = softmax(Array.prototype.slice.call(row, 0, state.nArch));
      var best = 0;
      for (var i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
      var archNames = state.arch && state.arch.gameArchetypes ? state.arch.gameArchetypes : [];
      topArch = {
        idx: best,
        name: archNames[best] || ('Cluster ' + best),
        p: probs[best] || 0
      };

      var skillKeys = state.arch && state.arch.skillKeys ? state.arch.skillKeys : [];
      var offSkill = state.nArch;
      var offPos = offSkill + state.nSkills;
      var offNext = offPos + state.nPos;
      var skillVals = Array.prototype.slice.call(row, offSkill, offPos);
      topSkills = topN(skillKeys.map(function (k, j) {
        var v01 = clamp01(Number(skillVals[j] || 0));
        return {
          key: k,
          label: SKILL_LABELS[k] || k,
          val01: v01,
          valPts: capPredPct(v01 * 100)
        };
      }), 3, 'val01');

      var nextKeys = (state.arch && state.arch.gameFeatureKeys) || [];
      var nextVals = Array.prototype.slice.call(row, offNext, offNext + state.nNext);
      topNext = topN(nextKeys.map(function (k, j) {
        return {
          key: k,
          label: (state.featureLabel && state.featureLabel[k]) || k,
          z: Number(nextVals[j] || 0)
        };
      }).filter(function (x) {
        return Number.isFinite(x.z);
      }), 2, 'z');
    }
    return {
      topInputs: topInputs,
      topTowers: topTowers,
      topArch: topArch,
      topSkills: topSkills,
      topNext: topNext
    };
  }

  function renderStory() {
    var host = $('network-story');
    if (!host || state.playerIdx < 0) return;
    var s = summarizeStory(state.playerIdx);
    var step = state.step;
    var cls0 = step >= 0 ? ' is-active' : '';
    var cls1 = step >= 1 ? ' is-active' : '';
    var cls2 = step >= 4 ? ' is-active' : '';

    var inputsHtml = s.topInputs.map(function (x) {
      return '<span class="network-story-chip">' + esc(x.label) + ' <b>' + Math.round(x.score * 100) + '%</b></span>';
    }).join('');
    var towersHtml = s.topTowers.map(function (x) {
      return '<span class="network-story-chip">' + esc(x.fam.replace(/_/g, ' ')) + ' <b>' +
        Math.round(x.score * 100) + '%</b></span>';
    }).join('');
    var predHtml = '';
    if (s.topArch) {
      predHtml += '<span class="network-story-chip network-story-chip--arch">' +
        esc(s.topArch.name) + ' <b>' + fmtPredScore(s.topArch.p * 100) + '%</b></span>';
    }
    predHtml += s.topSkills.map(function (k) {
      return '<span class="network-story-chip">' + esc(k.label) + ' <b>' +
        fmtPredScore(k.valPts) + '</b></span>';
    }).join('');
    predHtml += s.topNext.map(function (n) {
      return '<span class="network-story-chip">' + esc(n.label) + ' <b>' +
        (Math.round(n.z * 100) / 100).toFixed(2) + 'z</b></span>';
    }).join('');

    host.innerHTML =
      '<div class="network-story-lane">' +
        '<div class="network-story-stage' + cls0 + '">' +
          '<div class="network-story-stage__head">1) Strong Inputs</div>' +
          '<div class="network-story-stage__chips">' + inputsHtml + '</div>' +
        '</div>' +
        '<div class="network-story-arrow" aria-hidden="true">→</div>' +
        '<div class="network-story-stage' + cls1 + '">' +
          '<div class="network-story-stage__head">2) Most Active Towers</div>' +
          '<div class="network-story-stage__chips">' + towersHtml + '</div>' +
        '</div>' +
        '<div class="network-story-arrow" aria-hidden="true">→</div>' +
        '<div class="network-story-stage' + cls2 + '">' +
          '<div class="network-story-stage__head">3) Predicted Outcomes</div>' +
          '<div class="network-story-stage__chips">' + predHtml + '</div>' +
        '</div>' +
      '</div>';
  }

  function renderMapInsights() {
    var host = $('network-map-insights');
    if (!host || state.playerIdx < 0) return;
    var nbs = embeddingNeighbors(state.playerIdx, 5);
    if (!nbs.length) {
      host.innerHTML = '<p class="drift-loading">No local embedding neighbors yet.</p>';
      return;
    }
    var archNames = (state.arch && state.arch.gameArchetypes) || [];
    var counts = {};
    nbs.forEach(function (n) {
      var p = state.players[n.idx];
      if (!p) return;
      var nm = archNames[p.c] || ('Cluster ' + p.c);
      counts[nm] = (counts[nm] || 0) + 1;
    });
    var mix = Object.keys(counts).map(function (k) {
      return { name: k, share: counts[k] / nbs.length };
    }).sort(function (a, b) { return b.share - a.share; }).slice(0, 3);
    host.innerHTML =
      '<div class="network-insights__head">Embedding context</div>' +
      '<div class="network-insights__chips">' +
        mix.map(function (m) {
          return '<span class="network-insight-chip">' + esc(m.name) + ' <b>' +
            Math.round(m.share * 100) + '%</b></span>';
        }).join('') +
        (state.compareOn && state.compareIdx >= 0 && state.map && state.map.coords
          ? '<span class="network-insight-chip">Compare dist <b>' +
            (Math.round(distance3(state.map.coords[state.playerIdx], state.map.coords[state.compareIdx]) * 1000) / 1000) +
            '</b></span>'
          : '') +
      '</div>' +
      '<ol class="network-neighbor-list">' + nbs.map(function (n) {
        var p = state.players[n.idx];
        if (!p) return '';
        return '<li><span class="network-neighbor-list__name">' + esc(p.name) + '</span>' +
          '<span class="network-neighbor-list__meta">' + esc(p.season) + ' · ' +
          fmtPredScore(n.sim * 100) + '% local sim</span></li>';
      }).join('') + '</ol>';
  }

  function renderFlowInsights() {
    var host = $('network-flow-insights');
    if (!host || state.playerIdx < 0) return;
    var d = flowDiagnostics(state.playerIdx);
    if (!d) {
      host.innerHTML = '<p class="drift-loading">No flow diagnostics yet.</p>';
      return;
    }
    var rows = [
      { key: 'Input focus', val: d.inputFocus, hint: 'Share of total input mass carried by top 3 families.' },
      { key: 'Tower selectivity', val: d.towerSpread, hint: '1 - normalized entropy across tower activations.' },
      { key: 'Archetype certainty', val: d.archMargin, hint: 'Gap between top-1 and top-2 archetype probabilities.' },
      { key: 'Position certainty', val: d.posMargin, hint: 'Gap between top-1 and top-2 position probabilities.' },
      { key: 'Skill contrast', val: d.skillContrast, hint: 'Standard deviation across skill-head outputs.' },
      { key: 'Next-profile signal', val: d.nextSignal, hint: 'Mean absolute z-shift across next-season stats.' }
    ];
    host.innerHTML =
      '<div class="network-insights__head">Flow diagnostics</div>' +
      '<div class="network-insight-meters">' +
      rows.map(function (r) {
        return '<div class="network-insight-meter" title="' + esc(r.hint) + '">' +
          '<span class="network-insight-meter__label">' + esc(r.key) + '</span>' +
          '<span class="network-insight-meter__bar"><span class="network-insight-meter__fill" style="width:' +
            Math.max(2, Math.min(100, r.val * 100)) + '%"></span></span>' +
          '<span class="network-insight-meter__val">' + fmtPredScore(r.val * 100) + '%</span></div>';
      }).join('') + '</div>';
  }

  function renderCompareSummary() {
    var host = $('network-compare-summary');
    var tag = $('network-compare-tag');
    if (!host || state.playerIdx < 0) return;
    if (!state.compareOn || state.compareIdx < 0 || state.compareIdx === state.playerIdx) {
      if (tag) tag.textContent = 'No compare player';
      host.innerHTML = '<div class="network-insights__head">Compare snapshot</div>' +
        '<p class="skills-hint">Enable compare mode and pick another player-season to see deltas.</p>';
      return;
    }
    var a = state.players[state.playerIdx];
    var b = state.players[state.compareIdx];
    if (!a || !b) return;
    if (tag) tag.textContent = b.name + ' · ' + b.season;
    var rowA = headRow(state.playerIdx);
    var rowB = headRow(state.compareIdx);
    if (!rowA || !rowB) return;
    var archA = bestArchForRow(rowA);
    var archB = bestArchForRow(rowB);
    var archNames = (state.arch && state.arch.gameArchetypes) || [];
    var archNameA = archNames[archA.idx] || ('Cluster ' + archA.idx);
    var archNameB = archNames[archB.idx] || ('Cluster ' + archB.idx);
    var dist = distance3(state.map.coords[state.playerIdx], state.map.coords[state.compareIdx]);
    var localSim = 1 / (1 + dist * 12);

    var offSkill = state.nArch;
    var offPos = offSkill + state.nSkills;
    var skillKeys = (state.arch && state.arch.skillKeys) || [];
    var skillDelta = [];
    for (var i = 0; i < skillKeys.length; i++) {
      var av = capPredPct(clamp01(Number(rowA[offSkill + i] || 0)) * 100);
      var bv = capPredPct(clamp01(Number(rowB[offSkill + i] || 0)) * 100);
      skillDelta.push({
        key: skillKeys[i],
        label: SKILL_LABELS[skillKeys[i]] || skillKeys[i],
        delta: av - bv
      });
    }
    skillDelta.sort(function (x, y) { return Math.abs(y.delta) - Math.abs(x.delta); });
    host.innerHTML =
      '<div class="network-insights__head">Compare snapshot</div>' +
      '<div class="network-insights__chips">' +
        '<span class="network-insight-chip">Local sim <b>' + fmtPredScore(localSim * 100) + '%</b></span>' +
        '<span class="network-insight-chip">' + esc(archNameA) + ' <b>' + fmtPredScore(archA.p * 100) + '%</b></span>' +
        '<span class="network-insight-chip">' + esc(archNameB) + ' <b>' + fmtPredScore(archB.p * 100) + '%</b></span>' +
      '</div>' +
      '<ol class="network-neighbor-list">' + skillDelta.slice(0, 4).map(function (d) {
        var sign = d.delta >= 0 ? '+' : '';
        return '<li><span class="network-neighbor-list__name">' + esc(d.label) + '</span>' +
          '<span class="network-neighbor-list__meta">' + sign + fmtPredScore(d.delta) + ' pts vs compare</span></li>';
      }).join('') + '</ol>';
  }

  function updateTimebar() {
    var host = $('network-timebar');
    var range = $('network-time-scrubber');
    var current = $('network-timebar-current');
    var span = $('network-timebar-range');
    if (!host || !range || state.playerIdx < 0) return;
    var p = state.players[state.playerIdx];
    var rows = (state.byNameRows && state.byNameRows[p.name]) ? state.byNameRows[p.name].slice() : [];
    state.careerRows = rows;
    if (!rows.length || rows.length === 1) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    var pos = rows.indexOf(state.playerIdx);
    if (pos < 0) pos = rows.length - 1;
    range.min = '0';
    range.max = String(rows.length - 1);
    range.value = String(pos);
    current.textContent = p.season + ' (' + (pos + 1) + '/' + rows.length + ')';
    span.textContent = state.players[rows[0]].season + ' → ' + state.players[rows[rows.length - 1]].season;
  }

  function quantile(vals, q) {
    if (!vals.length) return 0;
    var v = vals.slice().sort(function (a, b) { return a - b; });
    var pos = (v.length - 1) * q;
    var lo = Math.floor(pos);
    var hi = Math.ceil(pos);
    if (lo === hi) return v[lo];
    var t = pos - lo;
    return v[lo] * (1 - t) + v[hi] * t;
  }

  function localIntervalForOutput(group, idx) {
    var nbs = embeddingNeighbors(state.playerIdx, 24);
    if (!nbs.length) return null;
    var vals = [];
    nbs.forEach(function (n) {
      var row = headRow(n.idx);
      if (!row) return;
      var offSkill = state.nArch;
      var offPos = offSkill + state.nSkills;
      var offNext = offPos + state.nPos;
      var v = null;
      if (group === 'skills') v = capPredPct(clamp01(Number(row[offSkill + idx] || 0)) * 100);
      if (group === 'next_profile') v = Number(row[offNext + idx] || 0);
      if (Number.isFinite(v)) vals.push(v);
    });
    if (vals.length < 6) return null;
    return { lo: quantile(vals, 0.1), hi: quantile(vals, 0.9) };
  }

  function renderNodeInspector() {
    var host = $('network-node-inspector');
    if (!host || state.playerIdx < 0) return;
    var node = state.selectedNode || { type: 'head_group', key: 'archetype' };
    var row = headRow(state.playerIdx);
    var player = state.players[state.playerIdx];
    var signals = inputSignalsForPlayer(state.playerIdx);
    var shownInputs = signals.slice(0, MAX_INPUT_NODES);
    var fams = (state.arch && state.arch.towerFamilies) || [];
    var offSkill = state.nArch;
    var offPos = offSkill + state.nSkills;
    var offNext = offPos + state.nPos;
    if (!row || !player) {
      host.innerHTML = '<p class="drift-loading">No node inspection available.</p>';
      return;
    }

    function featureRowsForFamily(fam) {
      var feats = (state.familyFeatures && state.familyFeatures[fam]) || [];
      return feats.map(function (f) {
        var fi = state.featureIndex[f];
        var v = (fi != null && player.v && player.v[fi] != null) ? Number(player.v[fi]) : NaN;
        return { key: f, label: (state.featureLabel && state.featureLabel[f]) || f, z: v };
      }).filter(function (x) { return Number.isFinite(x.z); })
        .sort(function (a, b) { return Math.abs(b.z) - Math.abs(a.z); });
    }

    if (node.type === 'input') {
      var inp = shownInputs[node.index];
      if (!inp) {
        host.innerHTML = '<p class="drift-loading">Select an input node to inspect routing.</p>';
        return;
      }
      var towerIdx = fams.indexOf(inp.key);
      var featRows = featureRowsForFamily(inp.key);
      host.innerHTML =
        '<div class="network-node-inspector__head">Input family → routed tower</div>' +
        '<div class="network-insights__chips">' +
          '<span class="network-insight-chip">' + esc(inp.label) + ' <b>' + fmtPredScore(inp.score * 100) + '%</b></span>' +
          '<span class="network-insight-chip">Tower #' + (towerIdx >= 0 ? towerIdx + 1 : '?') + '</span>' +
        '</div>' +
        '<ol class="network-node-inspector__list">' + featRows.slice(0, 16).map(function (f) {
          return '<li><span class="network-node-inspector__name">' + esc(f.label) + '</span>' +
            '<span class="network-node-inspector__num">' + esc(f.key) + '</span>' +
            '<span class="network-node-inspector__num">' + (Math.round(f.z * 100) / 100).toFixed(2) + 'z</span></li>';
        }).join('') + '</ol>' +
        '<p class="network-node-inspector__hint">Exact player-season feature z-scores are shown for this family; edge routes to its matching tower.</p>';
      return;
    }

    if (node.type === 'tower') {
      var fam = fams[node.index] || '';
      var score = familyWeight(fam, signals);
      var towerFeats = featureRowsForFamily(fam);
      host.innerHTML =
        '<div class="network-node-inspector__head">Tower activation</div>' +
        '<div class="network-insights__chips">' +
          '<span class="network-insight-chip">' + esc(fam.replace(/_/g, ' ')) + ' <b>' + fmtPredScore(score * 100) + '%</b></span>' +
        '</div>' +
        '<ol class="network-node-inspector__list">' + towerFeats.slice(0, 16).map(function (f) {
          return '<li><span class="network-node-inspector__name">' + esc(f.label) + '</span>' +
            '<span class="network-node-inspector__num">' + esc(f.key) + '</span>' +
            '<span class="network-node-inspector__num">' + (Math.round(f.z * 100) / 100).toFixed(2) + 'z</span></li>';
        }).join('') + '</ol>' +
        '<p class="network-node-inspector__hint">Tower width/radius in the flow graph is driven by this activation score.</p>';
      return;
    }

    var group = node.group || node.key || 'archetype';
    var itemIndex = node.type === 'head_item' ? node.index : -1;
    var rows = [];
    if (group === 'archetype') {
      var probs = softmax(Array.prototype.slice.call(row, 0, state.nArch));
      var names = (state.arch && state.arch.gameArchetypes) || [];
      for (var ai = 0; ai < probs.length; ai++) rows.push({
        label: names[ai] || ('Cluster ' + ai),
        value: probs[ai] * 100,
        aux: null,
        idx: ai
      });
      rows.sort(function (a, b) { return b.value - a.value; });
    } else if (group === 'position') {
      var posNames = ['PG', 'SG', 'SF', 'PF', 'C'];
      var posProb = softmax(Array.prototype.slice.call(row, offPos, offNext));
      for (var pi = 0; pi < posProb.length; pi++) rows.push({
        label: posNames[pi] || ('Pos ' + pi),
        value: posProb[pi] * 100,
        aux: null,
        idx: pi
      });
      rows.sort(function (a, b) { return b.value - a.value; });
    } else if (group === 'skills') {
      var skillKeys = (state.arch && state.arch.skillKeys) || [];
      for (var si = 0; si < skillKeys.length; si++) {
        var sv = capPredPct(clamp01(Number(row[offSkill + si] || 0)) * 100);
        var sInt = localIntervalForOutput('skills', si);
        rows.push({
          label: SKILL_LABELS[skillKeys[si]] || skillKeys[si],
          value: sv,
          aux: sInt ? (fmtPredScore(sInt.lo) + '–' + fmtPredScore(sInt.hi)) : 'n/a',
          idx: si
        });
      }
      rows.sort(function (a, b) { return b.value - a.value; });
    } else if (group === 'next_profile') {
      var nextKeys = (state.arch && state.arch.gameFeatureKeys) || [];
      for (var ni = 0; ni < nextKeys.length; ni++) {
        var nv = Number(row[offNext + ni] || 0);
        var nInt = localIntervalForOutput('next_profile', ni);
        rows.push({
          label: (state.featureLabel && state.featureLabel[nextKeys[ni]]) || nextKeys[ni],
          value: nv,
          aux: nInt ? ((Math.round(nInt.lo * 100) / 100).toFixed(2) + 'z–' + (Math.round(nInt.hi * 100) / 100).toFixed(2) + 'z') : 'n/a',
          idx: ni
        });
      }
      rows.sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); });
    } else {
      host.innerHTML =
        '<div class="network-node-inspector__head">Output node inspection · aux heads</div>' +
        '<p class="network-node-inspector__hint">Auxiliary scalar heads are internal training objectives and are not exported individually in this client bundle.</p>';
      return;
    }

    host.innerHTML =
      '<div class="network-node-inspector__head">Output node inspection · ' + esc(group.replace(/_/g, ' ')) + '</div>' +
      '<ol class="network-node-inspector__list">' + rows.map(function (r) {
        var selectedCls = (itemIndex >= 0 && itemIndex === r.idx) ? ' is-selected' : '';
        return '<li><button class="network-node-inspector__pick' + selectedCls + '" data-head-item-group="' + esc(group) +
          '" data-head-item-idx="' + r.idx + '">' + esc(r.label) + '</button>' +
          '<span class="network-node-inspector__num">' + (group === 'next_profile'
            ? (Math.round(r.value * 100) / 100).toFixed(2) + 'z'
            : fmtPredScore(r.value) + (group === 'skills' ? '' : '%')) + '</span>' +
          '<span class="network-node-inspector__num">' + esc(r.aux || '') + '</span></li>';
      }).join('') + '</ol>' +
      '<p class="network-node-inspector__hint">' +
      (group === 'skills' || group === 'next_profile'
        ? 'Interval column shows local 10-90% prediction band from nearest embedding neighbors.'
        : 'Classification rows show full class probability distribution.') +
      '</p>';
  }

  function buildFlowSvg(host) {
    if (!host || !state.arch) return;
    host.innerHTML = '';
    var W = 760;
    var H = 560;
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'network-flow-svg');
    host.appendChild(svg);

    var cols = [64, 224, 396, 532, 676];
    var labels = ['Input', 'Towers', 'Fusion', 'Embed', 'Heads'];
    labels.forEach(function (lab, i) {
      var t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', cols[i]);
      t.setAttribute('y', 20);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('class', 'network-flow-col-label');
      t.textContent = lab;
      svg.appendChild(t);
    });

    var fams = state.arch.towerFamilies || [];
    var nTowers = fams.length || 18;
    var towerTop = 40;
    var towerBot = H - 50;
    var towerSpan = towerBot - towerTop;
    var towerG = document.createElementNS(SVG_NS, 'g');
    towerG.setAttribute('id', 'flow-towers');
    var towerYs = [];
    fams.forEach(function (fam, i) {
      var y = nTowers <= 1 ? H / 2 : towerTop + (i / (nTowers - 1)) * towerSpan;
      towerYs.push(y);
      var c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', cols[1]);
      c.setAttribute('cy', y);
      c.setAttribute('r', 5);
      c.setAttribute('class', 'network-flow-node network-flow-node--tower');
      c.setAttribute('data-tower', String(i));
      c.setAttribute('data-family', fam);
      var title = document.createElementNS(SVG_NS, 'title');
      title.textContent = fam;
      c.appendChild(title);
      towerG.appendChild(c);
    });
    svg.appendChild(towerG);

    var inputG = document.createElementNS(SVG_NS, 'g');
    inputG.setAttribute('id', 'flow-input');
    var nInputs = MAX_INPUT_NODES;
    var inputTop = 50;
    var inputSpan = H - 100;
    for (var b = 0; b < nInputs; b++) {
      var iy = inputTop + (b / (nInputs - 1)) * inputSpan;
      var ic = document.createElementNS(SVG_NS, 'rect');
      ic.setAttribute('x', cols[0] - 14);
      ic.setAttribute('y', iy - 18);
      ic.setAttribute('width', 28);
      ic.setAttribute('height', 36);
      ic.setAttribute('rx', 4);
      ic.setAttribute('class', 'network-flow-node network-flow-node--input');
      ic.setAttribute('data-input', String(b));
      inputG.appendChild(ic);

      var it = document.createElementNS(SVG_NS, 'text');
      it.setAttribute('x', cols[0] + 20);
      it.setAttribute('y', iy + 3);
      it.setAttribute('class', 'network-flow-col-label');
      it.setAttribute('text-anchor', 'start');
      it.setAttribute('data-input-label', String(b));
      it.textContent = 'input ' + (b + 1);
      inputG.appendChild(it);

      var iv = document.createElementNS(SVG_NS, 'text');
      iv.setAttribute('x', cols[0] + 98);
      iv.setAttribute('y', iy + 3);
      iv.setAttribute('class', 'network-flow-col-label');
      iv.setAttribute('text-anchor', 'start');
      iv.setAttribute('data-input-value', String(b));
      iv.textContent = '0%';
      inputG.appendChild(iv);

      var ip = document.createElementNS(SVG_NS, 'path');
      ip.setAttribute('class', 'network-flow-edge');
      ip.setAttribute('data-edge', 'in-' + b);
      inputG.appendChild(ip);
    }
    svg.appendChild(inputG);

    var midY = H / 2;

    var fusion = document.createElementNS(SVG_NS, 'circle');
    fusion.setAttribute('cx', cols[2]);
    fusion.setAttribute('cy', midY);
    fusion.setAttribute('r', 20);
    fusion.setAttribute('class', 'network-flow-node network-flow-node--fusion');
    fusion.setAttribute('id', 'flow-fusion');
    svg.appendChild(fusion);

    var embed = document.createElementNS(SVG_NS, 'circle');
    embed.setAttribute('cx', cols[3]);
    embed.setAttribute('cy', midY);
    embed.setAttribute('r', 14);
    embed.setAttribute('class', 'network-flow-node network-flow-node--embed');
    embed.setAttribute('id', 'flow-embed');
    svg.appendChild(embed);

    var headDefs = [
      { key: 'archetype', label: 'Archetype logits (' + state.nArch + ')', y: H * 0.24 },
      { key: 'position', label: 'Position logits (' + state.nPos + ')', y: H * 0.40 },
      { key: 'skills', label: 'Skill towers (' + state.nSkills + ')', y: H * 0.56 },
      { key: 'next_profile', label: 'Next-season profile (' + state.nNext + ')', y: H * 0.72 },
      { key: 'aux', label: 'Aux scalar heads', y: H * 0.86 }
    ];
    var headG = document.createElementNS(SVG_NS, 'g');
    headG.setAttribute('id', 'flow-heads');
    var headYs = [];
    for (var h = 0; h < headDefs.length; h++) {
      var hy = headDefs[h].y;
      headYs.push(hy);
      var hc = document.createElementNS(SVG_NS, 'circle');
      hc.setAttribute('cx', cols[4]);
      hc.setAttribute('cy', hy);
      hc.setAttribute('r', 6);
      hc.setAttribute('class', 'network-flow-node network-flow-node--head');
      hc.setAttribute('data-head', String(h));
      hc.setAttribute('data-head-key', headDefs[h].key);
      headG.appendChild(hc);

      var hl = document.createElementNS(SVG_NS, 'text');
      hl.setAttribute('x', cols[4] + 12);
      hl.setAttribute('y', hy + 3);
      hl.setAttribute('class', 'network-flow-col-label');
      hl.setAttribute('text-anchor', 'start');
      hl.textContent = headDefs[h].label;
      headG.appendChild(hl);
    }
    svg.appendChild(headG);

    var edgeG = document.createElementNS(SVG_NS, 'g');
    edgeG.setAttribute('id', 'flow-edges');
    edgeG.setAttribute('class', 'network-flow-edges');

    fams.forEach(function (_, i) {
      var towerY = towerYs[i];
      var p2 = document.createElementNS(SVG_NS, 'path');
      var d2 = 'M' + (cols[1] + 6) + ',' + towerY +
        ' L' + (cols[2] - 20) + ',' + midY;
      p2.setAttribute('d', d2);
      p2.setAttribute('class', 'network-flow-edge');
      p2.setAttribute('data-edge', 'fuse-' + i);
      edgeG.appendChild(p2);
    });

    var e3 = document.createElementNS(SVG_NS, 'line');
    e3.setAttribute('x1', cols[2] + 20);
    e3.setAttribute('y1', midY);
    e3.setAttribute('x2', cols[3] - 14);
    e3.setAttribute('y2', midY);
    e3.setAttribute('class', 'network-flow-edge network-flow-edge--main');
    e3.setAttribute('data-edge', 'emb-main');
    edgeG.appendChild(e3);

    for (var he = 0; he < headDefs.length; he++) {
      var e4 = document.createElementNS(SVG_NS, 'path');
      var hy2 = headYs[he];
      var d4 = 'M' + (cols[3] + 14) + ',' + midY +
        ' C' + (cols[3] + 50) + ',' + midY + ' ' + (cols[4] - 40) + ',' + hy2 + ' ' + (cols[4] - 8) + ',' + hy2;
      e4.setAttribute('d', d4);
      e4.setAttribute('class', 'network-flow-edge network-flow-edge--head');
      e4.setAttribute('data-edge', 'head-' + he);
      edgeG.appendChild(e4);
    }
    svg.insertBefore(edgeG, towerG);

    svg.addEventListener('click', function (ev) {
      var inputNode = ev.target.closest('[data-input]');
      if (inputNode) {
        state.selectedNode = { type: 'input', index: parseInt(inputNode.getAttribute('data-input'), 10) };
        updateFlowVisual();
        renderNodeInspector();
        return;
      }
      var towerNode = ev.target.closest('[data-tower]');
      if (towerNode) {
        state.selectedNode = { type: 'tower', index: parseInt(towerNode.getAttribute('data-tower'), 10) };
        updateFlowVisual();
        renderNodeInspector();
        return;
      }
      var headNode = ev.target.closest('[data-head-key]');
      if (headNode) {
        state.selectedNode = { type: 'head_group', key: headNode.getAttribute('data-head-key') };
        updateFlowVisual();
        renderNodeInspector();
      }
    });

    state.flowLayout = {
      cols: cols,
      inputTop: inputTop,
      inputSpan: inputSpan,
      nInputs: nInputs,
      towerYs: towerYs,
      headDefs: headDefs
    };
  }

  function updateFlowVisual() {
    var host = $('network-flow-svg');
    if (!host) return;
    var svg = host.querySelector('svg');
    if (!svg) return;
    var step = state.step;
    var idx = state.playerIdx;
    var heights = towerHeights(idx);
    var signals = inputSignalsForPlayer(idx);
    var layout = state.flowLayout;

    svg.querySelectorAll('.network-flow-node').forEach(function (node) {
      node.classList.remove('is-active', 'is-lit', 'is-selected');
    });
    svg.querySelectorAll('.network-flow-edge').forEach(function (edge) {
      edge.classList.remove('is-active', 'is-lit');
    });

    if (step >= 0) {
      var shownInputs = signals.slice(0, MAX_INPUT_NODES);
      svg.querySelectorAll('.network-flow-node--input').forEach(function (n) {
        n.classList.add(step === 0 ? 'is-active' : 'is-lit');
      });
      svg.querySelectorAll('[data-input-value]').forEach(function (n, i) {
        var s = shownInputs[i] ? shownInputs[i].score : 0;
        n.textContent = fmtPredScore(s * 100) + '%';
      });
      svg.querySelectorAll('[data-input-label]').forEach(function (n, i) {
        var label = shownInputs[i] ? shownInputs[i].label : ('input ' + (i + 1));
        n.textContent = label;
        n.setAttribute('title', shownInputs[i] && shownInputs[i].features && shownInputs[i].features.length
          ? ('Features: ' + shownInputs[i].features.join(', '))
          : '');
      });
      svg.querySelectorAll('.network-flow-node--input').forEach(function (n, i) {
        var s = shownInputs[i] ? shownInputs[i].score : 0.0;
        n.style.opacity = String(0.35 + s * 0.65);
      });
    }
    if (step >= 1) {
      svg.querySelectorAll('.network-flow-node--tower').forEach(function (n, i) {
        var h = heights ? heights[i] : 0.5;
        n.setAttribute('r', String(4 + h * 4));
        n.classList.add(step === 1 ? 'is-active' : 'is-lit');
      });
      svg.querySelectorAll('[data-edge^="in-"]').forEach(function (e) {
        var ix = parseInt((e.getAttribute('data-edge') || 'in-0').split('-')[1], 10);
        var shown = signals[ix] || null;
        var s = shown ? shown.score : 0.0;
        if (layout && shown) {
          var fams = state.arch.towerFamilies || [];
          var ti = fams.indexOf(shown.key);
          if (ti >= 0 && ti < layout.towerYs.length) {
            var inputY = layout.inputTop + ((ix / (layout.nInputs - 1)) * layout.inputSpan);
            var towerY = layout.towerYs[ti];
            var d = 'M' + (layout.cols[0] + 14) + ',' + inputY +
              ' C' + (layout.cols[0] + 55) + ',' + towerY + ' ' +
              (layout.cols[1] - 45) + ',' + towerY + ' ' + layout.cols[1] + ',' + towerY;
            e.setAttribute('d', d);
          }
        }
        e.style.strokeWidth = String(0.6 + s * 2.2);
        e.style.opacity = String(0.2 + s * 0.7);
        e.classList.add(step === 1 ? 'is-active' : 'is-lit');
      });
    }
    if (step >= 2) {
      svg.querySelectorAll('[data-edge^="fuse-"]').forEach(function (e) {
        var idxFuse = parseInt((e.getAttribute('data-edge') || 'fuse-0').split('-')[1], 10);
        var fams = state.arch.towerFamilies || [];
        var fam = fams[idxFuse] || '';
        var s = familyWeight(fam, signals);
        e.style.strokeWidth = String(0.6 + s * 2.6);
        e.style.opacity = String(0.2 + s * 0.75);
        e.classList.add(step === 2 ? 'is-active' : 'is-lit');
      });
      var fus = svg.querySelector('#flow-fusion');
      if (fus) fus.classList.add(step === 2 ? 'is-active' : 'is-lit');
    }
    if (step >= 3) {
      var emb = svg.querySelector('#flow-embed');
      if (emb) emb.classList.add(step === 3 ? 'is-active' : 'is-lit');
      var embEdge = svg.querySelector('[data-edge="emb-main"]');
      if (embEdge) embEdge.classList.add(step === 3 ? 'is-active' : 'is-lit');
    }
    if (step >= 4) {
      svg.querySelectorAll('.network-flow-node--head').forEach(function (n) {
        n.classList.add('is-active');
      });
      var row = headRow(idx);
      var headStrength = [0.5, 0.5, 0.5, 0.5, 0.5];
      if (row) {
        var probs = softmax(Array.prototype.slice.call(row, 0, state.nArch));
        var topP = 0;
        for (var pi = 0; pi < probs.length; pi++) topP = Math.max(topP, probs[pi]);
        var offSkill = state.nArch;
        var offPos = offSkill + state.nSkills;
        var offNext = offPos + state.nPos;
        var posVals = Array.prototype.slice.call(row, offPos, offNext);
        var posProbs = softmax(posVals);
        var topPos = 0;
        for (var pp = 0; pp < posProbs.length; pp++) topPos = Math.max(topPos, posProbs[pp]);
        var skillVals = Array.prototype.slice.call(row, offSkill, offPos);
        var skillAvg = skillVals.length
          ? skillVals.reduce(function (a, b) { return a + clamp01(b); }, 0) / skillVals.length
          : 0.5;
        var nextVals = Array.prototype.slice.call(row, offNext, offNext + state.nNext);
        var nextMag = nextVals.length
          ? nextVals.reduce(function (a, b) { return a + Math.abs(b); }, 0) / nextVals.length
          : 0.5;
        nextMag = clamp01(nextMag / 1.5);
        headStrength = [
          topP,
          topPos,
          clamp01(skillAvg),
          nextMag,
          0.5 * topP + 0.5 * nextMag
        ];
      }
      svg.querySelectorAll('[data-edge^="head-"]').forEach(function (e, i) {
        var s = headStrength[i] != null ? headStrength[i] : 0.5;
        e.style.strokeWidth = String(0.8 + s * 2.8);
        e.style.opacity = String(0.25 + s * 0.75);
        e.classList.add('is-active');
      });
    }

    var selected = state.selectedNode || null;
    if (selected && selected.type === 'input') {
      var inNode = svg.querySelector('[data-input="' + selected.index + '"]');
      if (inNode) inNode.classList.add('is-selected');
      var src = signals[selected.index];
      if (src) {
        var famsIn = state.arch.towerFamilies || [];
        var tIdx = famsIn.indexOf(src.key);
        var tNode = svg.querySelector('[data-tower="' + tIdx + '"]');
        var inEdge = svg.querySelector('[data-edge="in-' + selected.index + '"]');
        var fuseEdge = svg.querySelector('[data-edge="fuse-' + tIdx + '"]');
        if (tNode) tNode.classList.add('is-active');
        if (inEdge) inEdge.classList.add('is-active');
        if (fuseEdge) fuseEdge.classList.add('is-active');
      }
    } else if (selected && selected.type === 'tower') {
      var twNode = svg.querySelector('[data-tower="' + selected.index + '"]');
      if (twNode) twNode.classList.add('is-selected');
      var famsTw = state.arch.towerFamilies || [];
      var targetFam = famsTw[selected.index];
      var inIdx = -1;
      for (var si = 0; si < signals.length; si++) {
        if (signals[si].key === targetFam) { inIdx = si; break; }
      }
      var inNodeTw = inIdx >= 0 ? svg.querySelector('[data-input="' + inIdx + '"]') : null;
      var inEdgeTw = inIdx >= 0 ? svg.querySelector('[data-edge="in-' + inIdx + '"]') : null;
      var fuseTw = svg.querySelector('[data-edge="fuse-' + selected.index + '"]');
      if (inNodeTw) inNodeTw.classList.add('is-active');
      if (inEdgeTw) inEdgeTw.classList.add('is-active');
      if (fuseTw) fuseTw.classList.add('is-active');
    } else if (selected && (selected.type === 'head_group' || selected.type === 'head_item')) {
      var key = selected.group || selected.key;
      var hdNode = svg.querySelector('[data-head-key="' + key + '"]');
      if (hdNode) hdNode.classList.add('is-selected');
      var hIdx = headKeyToIndex(key);
      if (hIdx >= 0) {
        var hEdge = svg.querySelector('[data-edge="head-' + hIdx + '"]');
        if (hEdge) hEdge.classList.add('is-active');
      }
      var famsHd = state.arch.towerFamilies || [];
      var topTower = famsHd.map(function (fam, i) {
        return { i: i, s: familyWeight(fam, signals) };
      }).sort(function (a, b) { return b.s - a.s; }).slice(0, 4);
      topTower.forEach(function (t) {
        var tn = svg.querySelector('[data-tower="' + t.i + '"]');
        var fe = svg.querySelector('[data-edge="fuse-' + t.i + '"]');
        if (tn) tn.classList.add('is-active');
        if (fe) fe.classList.add('is-active');
      });
      topTower.forEach(function (t) {
        var fam = famsHd[t.i];
        for (var si2 = 0; si2 < signals.length; si2++) {
          if (signals[si2].key === fam) {
            var inN = svg.querySelector('[data-input="' + si2 + '"]');
            var inE = svg.querySelector('[data-edge="in-' + si2 + '"]');
            if (inN) inN.classList.add('is-active');
            if (inE) inE.classList.add('is-active');
            break;
          }
        }
      });
    }
  }

  function renderOutputs() {
    var archHost = $('network-arch-out');
    var skillHost = $('network-skill-out');
    var nextHost = $('network-next-out');
    var row = headRow(state.playerIdx);
    if (!archHost || !skillHost || !nextHost || !row || !state.arch) {
      if (archHost) archHost.innerHTML = '<p class="drift-loading">Pick a player.</p>';
      if (skillHost) skillHost.innerHTML = '';
      if (nextHost) nextHost.innerHTML = '';
      return;
    }

    var archLog = Array.prototype.slice.call(row, 0, state.nArch);
    var probs = softmax(archLog);
    var names = state.arch.gameArchetypes || [];
    var ranked = [];
    for (var ri = 0; ri < state.nArch; ri++) ranked.push({ idx: ri, p: probs[ri] || 0 });
    ranked.sort(function (a, b) { return b.p - a.p; });
    var bestIdx = ranked.length ? ranked[0].idx : 0;
    var archRows = [];
    for (var i = 0; i < ranked.length; i++) {
      var clsIdx = ranked[i].idx;
      var p = ranked[i].p;
      var pct = fmtPredScore(p * 100);
      var nm = names[clsIdx] || ('Cluster ' + clsIdx);
      var selArch = state.selectedNode && state.selectedNode.type === 'head_item' &&
        (state.selectedNode.group || state.selectedNode.key) === 'archetype' &&
        state.selectedNode.index === clsIdx;
      archRows.push('<div class="network-arch-row' + (clsIdx === bestIdx ? ' is-top' : '') + (selArch ? ' is-selected' : '') +
        '" data-head-select-group="archetype" data-head-select-idx="' + clsIdx + '" title="' + esc(nm) + '">' +
        '<span class="network-arch-row__idx">#' + (clsIdx + 1) + '</span>' +
        '<span class="network-arch-row__swatch" style="background:' + PALETTE[clsIdx % PALETTE.length] + '"></span>' +
        '<span class="network-arch-row__name">' + esc(nm) + '</span>' +
        '<span class="network-arch-row__track"><span class="network-arch-row__fill" style="width:' +
        Math.max(1, Math.min(99.9, p * 100)) + '%;background:' + PALETTE[clsIdx % PALETTE.length] + '"></span></span>' +
        '<span class="network-arch-row__pct">' + pct + '%</span></div>');
    }
    archHost.innerHTML =
      '<div class="network-out-subhead">All possible archetypes (' + state.nArch + ' classes)</div>' +
      archRows.join('');

    var skillKeys = state.arch.skillKeys || [];
    var offSkill = state.nArch;
    var offPos = offSkill + state.nSkills;
    var skillVals = Array.prototype.slice.call(row, offSkill, offPos);
    var pairs = skillKeys.map(function (k, i) {
      var v01 = clamp01(Number(skillVals[i] || 0));
      return { idx: i, key: k, val01: v01, valPts: capPredPct(v01 * 100) };
    }).sort(function (a, b) { return b.val01 - a.val01; });
    skillHost.innerHTML =
      '<div class="network-out-subhead">All skill towers (' + pairs.length + ' outputs)</div>' +
      '<div class="network-skill-grid">' + pairs.map(function (s) {
      var v = fmtPredScore(s.valPts);
      var selSkill = state.selectedNode && state.selectedNode.type === 'head_item' &&
        (state.selectedNode.group || state.selectedNode.key) === 'skills' &&
        state.selectedNode.index === s.idx;
      return '<div class="network-skill-row' + (selSkill ? ' is-selected' : '') + '"' +
        ' data-head-select-group="skills" data-head-select-idx="' + s.idx + '">' +
        '<span class="network-skill-row__meta">' +
          '<span class="network-skill-row__name">' + esc(SKILL_LABELS[s.key] || s.key) + '</span>' +
          '<span class="network-skill-row__key">' + esc(s.key) + '</span>' +
        '</span>' +
        '<span class="network-skill-row__track"><span class="network-skill-row__fill" style="width:' +
        Math.max(1, Math.min(99.9, s.valPts)) + '%"></span></span>' +
        '<span class="network-skill-row__val">' + v + '</span></div>';
    }).join('') + '</div>';

    var nextKeys = (state.arch && state.arch.gameFeatureKeys) || [];
    var nextVals = Array.prototype.slice.call(row, offPos + state.nPos, offPos + state.nPos + state.nNext);
    var nextPairs = nextKeys.map(function (k, i) {
      var z = Number(nextVals[i] || 0);
      return {
        idx: i,
        key: k,
        label: (state.featureLabel && state.featureLabel[k]) || k,
        z: Number.isFinite(z) ? z : 0,
        band: localIntervalForOutput('next_profile', i)
      };
    }).sort(function (a, b) { return Math.abs(b.z) - Math.abs(a.z); });
    nextHost.innerHTML =
      '<div class="network-out-subhead">All next-profile outputs (' + nextPairs.length + ' stats)</div>' +
      '<div class="network-skill-grid">' + nextPairs.map(function (n) {
        var w = Math.max(1, Math.min(99.9, Math.abs(n.z) / 3 * 100));
        var zText = (Math.round(n.z * 100) / 100).toFixed(2) + 'z';
        var ciText = n.band
          ? (Math.round(n.band.lo * 100) / 100).toFixed(2) + '–' + (Math.round(n.band.hi * 100) / 100).toFixed(2) + 'z'
          : 'n/a';
        var selNext = state.selectedNode && state.selectedNode.type === 'head_item' &&
          (state.selectedNode.group || state.selectedNode.key) === 'next_profile' &&
          state.selectedNode.index === n.idx;
        return '<div class="network-skill-row' + (selNext ? ' is-selected' : '') + '"' +
          ' data-head-select-group="next_profile" data-head-select-idx="' + n.idx + '">' +
          '<span class="network-skill-row__meta">' +
            '<span class="network-skill-row__name">' + esc(n.label) + '</span>' +
            '<span class="network-skill-row__key">' + esc(n.key) + ' · 10-90% ' + esc(ciText) + '</span>' +
          '</span>' +
          '<span class="network-skill-row__track"><span class="network-skill-row__fill" style="width:' + w + '%"></span></span>' +
          '<span class="network-skill-row__val">' + zText + '</span></div>';
      }).join('') + '</div>';
  }

  function ensureMapCanvasSize(canvas, parent, force) {
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(280, (parent && parent.clientWidth) || 400);
    var h = Math.round(w * 0.9);
    var sizeChanged =
      force ||
      state.mapSize.w !== w ||
      state.mapSize.h !== h ||
      state.mapSize.dpr !== dpr;

    if (sizeChanged) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      state.mapSize.w = w;
      state.mapSize.h = h;
      state.mapSize.dpr = dpr;
    }
    return { w: w, h: h, dpr: dpr };
  }

  function drawMap(forceResize) {
    var canvas = $('network-map-canvas');
    if (!canvas || !state.map || state.playerIdx < 0) return;
    var parent = canvas.parentElement;
    var size = ensureMapCanvasSize(canvas, parent, !!forceResize);
    var dpr = size.dpr;
    var w = size.w;
    var h = size.h;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    var cam = state.cam;
    drawEmbeddingAxes(ctx, w, h, cam);
    var coords = state.map.coords;
    var points = [];
    var stride = Math.max(1, Math.floor(coords.length / 4000));
    var i;
    for (i = 0; i < coords.length; i += stride) {
      var c = coords[i];
      var pr = project3D(c[0], c[1], c[2], w, h, cam);
      points.push({ i: i, sx: pr.sx, sy: pr.sy, depth: pr.depth });
    }
    points.sort(function (a, b) { return a.depth - b.depth; });

    points.forEach(function (pt) {
      var alpha = 0.12 + 0.35 * (1 / (1 + pt.depth * 0.15));
      var p = state.players[pt.i];
      var col = PALETTE[(p && p.c != null ? p.c : pt.i) % PALETTE.length];
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, pt.i === state.playerIdx ? 0 : 1.2, 0, Math.PI * 2);
      ctx.fill();
    });

    if (state.playerIdx >= 0 && coords[state.playerIdx]) {
      var ac = coords[state.playerIdx];
      var ap = project3D(ac[0], ac[1], ac[2], w, h, cam);
      if (state.compareOn && state.compareIdx >= 0 && coords[state.compareIdx]) {
        var cc = coords[state.compareIdx];
        var cp = project3D(cc[0], cc[1], cc[2], w, h, cam);
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#67b5ff';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(ap.sx, ap.sy);
        ctx.lineTo(cp.sx, cp.sy);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#67b5ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cp.sx, cp.sy, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#67b5ff';
        ctx.beginPath();
        ctx.arc(cp.sx, cp.sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      var neighbors = embeddingNeighbors(state.playerIdx, 3);
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = '#f3a26f';
      ctx.lineWidth = 1.1;
      neighbors.forEach(function (n) {
        var nc = coords[n.idx];
        if (!nc) return;
        var np = project3D(nc[0], nc[1], nc[2], w, h, cam);
        ctx.beginPath();
        ctx.moveTo(ap.sx, ap.sy);
        ctx.lineTo(np.sx, np.sy);
        ctx.stroke();
      });
      var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 280);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ap.sx, ap.sy, 8 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ORANGE;
      ctx.beginPath();
      ctx.arc(ap.sx, ap.sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function setStep(step) {
    state.step = Math.max(0, Math.min(STEPS.length - 1, step));
    var cap = $('network-step-caption');
    if (cap) cap.textContent = STEPS[state.step].caption;
    document.querySelectorAll('.network-step-btn').forEach(function (btn) {
      var s = parseInt(btn.getAttribute('data-step'), 10);
      btn.classList.toggle('is-active', s === state.step);
    });
    updateFlowVisual();
    renderStory();
    renderOutputs();
    renderFlowInsights();
    renderMapInsights();
    renderCompareSummary();
    renderNodeInspector();
    drawMap();
  }

  function setPlayer(idx, opts) {
    if (idx < 0 || idx >= state.players.length) return;
    state.playerIdx = idx;
    var p = state.players[idx];
    var tag = $('network-player-tag');
    if (tag) tag.textContent = p.name + ' · ' + p.season;
    if (state.compareOn && (!opts || !opts.keepCompare)) {
      if (state.compareIdx < 0 || state.compareIdx === idx || state.players[state.compareIdx].name === p.name) {
        var nbs = embeddingNeighbors(idx, 1);
        state.compareIdx = nbs.length ? nbs[0].idx : -1;
      }
    }
    updateTimebar();
    setStep(state.step);
    renderStory();
    renderMapInsights();
    renderFlowInsights();
    renderCompareSummary();
    renderNodeInspector();
  }

  function pickDefaultPlayer() {
    var prefer = ['Stephen Curry', 'Nikola Jokic', 'LeBron James', 'Victor Wembanyama'];
    var latest = state.players[state.players.length - 1].season;
    for (var pi = 0; pi < prefer.length; pi++) {
      for (var i = state.players.length - 1; i >= 0; i--) {
        if (state.players[i].name === prefer[pi] && state.players[i].season === latest) {
          setPlayer(i);
          return;
        }
      }
    }
    setPlayer(state.players.length - 1);
  }

  function bindSearch() {
    var input = $('network-search');
    var list = $('network-suggest');
    if (!input || !list) return;

    function showMatches(q) {
      q = (q || '').trim().toLowerCase();
      if (!q) { list.hidden = true; return; }
      var hits = [];
      var exactName = '';
      for (var e = 0; e < state.players.length; e++) {
        if (state.players[e].name.toLowerCase() === q) {
          exactName = state.players[e].name;
          break;
        }
      }
      for (var i = state.players.length - 1; i >= 0; i--) {
        if (exactName && state.players[i].name === exactName) hits.push(i);
      }
      for (var j = state.players.length - 1; j >= 0 && hits.length < 40; j--) {
        var nameLower = state.players[j].name.toLowerCase();
        if (hits.indexOf(j) !== -1) continue;
        if (nameLower.indexOf(q) >= 0) hits.push(j);
      }
      if (!hits.length) { list.hidden = true; return; }
      list.innerHTML = hits.map(function (idx) {
        var p = state.players[idx];
        return '<li><button type="button" data-idx="' + idx + '">' +
          esc(p.name) + ' <span>' + esc(p.season) + '</span></button></li>';
      }).join('');
      list.hidden = false;
    }

    input.addEventListener('input', function () { showMatches(input.value); });
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-idx]');
      if (!btn) return;
      setPlayer(parseInt(btn.getAttribute('data-idx'), 10));
      list.hidden = true;
      input.value = '';
    });
    document.addEventListener('click', function (e) {
      if (!list.contains(e.target) && e.target !== input) list.hidden = true;
    });
  }

  function bindCompare() {
    var toggle = $('network-compare-toggle');
    var input = $('network-compare-search');
    var list = $('network-compare-suggest');
    if (!toggle || !input || !list) return;

    function showMatches(q) {
      q = (q || '').trim().toLowerCase();
      if (!q) { list.hidden = true; return; }
      var hits = [];
      for (var i = state.players.length - 1; i >= 0 && hits.length < 40; i--) {
        if (i === state.playerIdx) continue;
        var p = state.players[i];
        if (p.name.toLowerCase().indexOf(q) >= 0) hits.push(i);
      }
      if (!hits.length) { list.hidden = true; return; }
      list.innerHTML = hits.map(function (idx) {
        var p = state.players[idx];
        return '<li><button type="button" data-idx="' + idx + '">' +
          esc(p.name) + ' <span>' + esc(p.season) + '</span></button></li>';
      }).join('');
      list.hidden = false;
    }

    toggle.addEventListener('change', function () {
      state.compareOn = !!toggle.checked;
      input.disabled = !state.compareOn;
      if (!state.compareOn) {
        state.compareIdx = -1;
        input.value = '';
      } else if (state.playerIdx >= 0) {
        var nbs = embeddingNeighbors(state.playerIdx, 1);
        state.compareIdx = nbs.length ? nbs[0].idx : -1;
      }
      renderCompareSummary();
      renderMapInsights();
      renderNodeInspector();
      drawMap();
    });

    input.addEventListener('input', function () { showMatches(input.value); });
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-idx]');
      if (!btn) return;
      state.compareIdx = parseInt(btn.getAttribute('data-idx'), 10);
      list.hidden = true;
      input.value = '';
      renderCompareSummary();
      renderMapInsights();
      renderNodeInspector();
      drawMap();
    });
    document.addEventListener('click', function (e) {
      if (!list.contains(e.target) && e.target !== input) list.hidden = true;
    });
  }

  function bindTimebar() {
    var scrub = $('network-time-scrubber');
    if (!scrub) return;
    scrub.addEventListener('input', function () {
      if (!state.careerRows || !state.careerRows.length) return;
      var pos = parseInt(scrub.value, 10);
      if (!Number.isFinite(pos) || pos < 0 || pos >= state.careerRows.length) return;
      setPlayer(state.careerRows[pos], { keepCompare: true });
    });
  }

  function bindNodeInspector() {
    var host = $('network-node-inspector');
    if (!host) return;
    host.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-head-item-group][data-head-item-idx]');
      if (!btn) return;
      state.selectedNode = {
        type: 'head_item',
        group: btn.getAttribute('data-head-item-group'),
        index: parseInt(btn.getAttribute('data-head-item-idx'), 10)
      };
      renderNodeInspector();
      updateFlowVisual();
    });
  }

  function bindOutputSelectors() {
    var root = $('network-output-card') || document;
    root.addEventListener('click', function (ev) {
      var row = ev.target.closest('[data-head-select-group][data-head-select-idx]');
      if (!row) return;
      state.selectedNode = {
        type: 'head_item',
        group: row.getAttribute('data-head-select-group'),
        index: parseInt(row.getAttribute('data-head-select-idx'), 10)
      };
      updateFlowVisual();
      renderNodeInspector();
      renderOutputs();
    });
  }

  function bindMapDrag() {
    var canvas = $('network-map-canvas');
    if (!canvas) return;
    canvas.addEventListener('pointerdown', function (e) {
      state.drag = { x: e.clientX, y: e.clientY, yaw: state.cam.yaw, pitch: state.cam.pitch };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!state.drag) return;
      state.cam.yaw = state.drag.yaw + (e.clientX - state.drag.x) * 0.008;
      state.cam.pitch = Math.max(-0.6, Math.min(0.6,
        state.drag.pitch + (e.clientY - state.drag.y) * 0.008));
      drawMap(false);
    });
    canvas.addEventListener('pointerup', function () { state.drag = null; });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      state.cam.zoom = Math.max(0.6, Math.min(2.2, state.cam.zoom - e.deltaY * 0.001));
      drawMap(false);
    }, { passive: false });
    window.addEventListener('resize', function () { drawMap(true); });
  }

  function bindSteps() {
    document.querySelectorAll('.network-step-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setStep(parseInt(btn.getAttribute('data-step'), 10));
      });
    });
    var play = $('network-play');
    if (!play) return;
    play.addEventListener('click', function () {
      if (state.playing) return;
      state.playing = true;
      play.disabled = true;
      var s = 0;
      setStep(0);
      var timer = setInterval(function () {
        s += 1;
        if (s >= STEPS.length) {
          clearInterval(timer);
          state.playing = false;
          play.disabled = false;
          return;
        }
        setStep(s);
      }, 1400);
    });
  }

  function mapLoop() {
    if (state.step >= 3) drawMap(false);
    requestAnimationFrame(mapLoop);
  }

  function init() {
    Promise.all([
      fetch('assets/vectors.json').then(function (r) { return r.json(); }),
      fetch('assets/mtnn_arch.json').then(function (r) { return r.json(); }),
      fetch('assets/mtnn_map.json').then(function (r) { return r.json(); }),
      fetch('assets/mtnn_heads.f32').then(function (r) {
        if (!r.ok) throw new Error('heads');
        return r.arrayBuffer();
      }),
      fetch('assets/mtnn_inputs.f32').then(function (r) {
        if (!r.ok) throw new Error('inputs');
        return r.arrayBuffer();
      })
    ]).then(function (parts) {
      var vec = parts[0];
      state.arch = parts[1];
      state.map = parts[2];
      var buf = parts[3];
      var ibuf = parts[4];
      state.nArch = state.arch.nArchetypes || 8;
      state.nSkills = (state.arch.skillKeys || []).length || 18;
      state.nPos = state.arch.nPositions || 5;
      state.nNext = state.arch.nNextProfile || ((state.arch.gameFeatureKeys || []).length || 14);
      state.familyOrder = state.arch.familyOrder || state.arch.towerFamilies || [];
      state.familyFeatures = state.arch.familyFeatures || {};
      var n = state.map.rows;
      state.heads = new Float32Array(buf);
      state.inputs = new Float32Array(ibuf);
      var totalHeads = state.nArch + state.nSkills + state.nPos + state.nNext;
      if (state.heads.length !== n * totalHeads) {
        throw new Error('heads length mismatch');
      }
      if (state.familyOrder.length && state.inputs.length !== n * state.familyOrder.length) {
        throw new Error('inputs length mismatch');
      }
      state.players = vec.players;
      buildNameIndex();
      state.features = vec.features || [];
      state.featureIndex = {};
      state.features.forEach(function (f, i) { state.featureIndex[f] = i; });
      state.featureLabel = vec.featureLabels || {};
      buildFlowSvg($('network-flow-svg'));
      bindSearch();
      bindCompare();
      bindTimebar();
      bindNodeInspector();
      bindOutputSelectors();
      bindMapDrag();
      bindSteps();
      pickDefaultPlayer();
      renderMapInsights();
      renderFlowInsights();
      requestAnimationFrame(mapLoop);
    }).catch(function () {
      var cap = $('network-step-caption');
      if (cap) {
        cap.textContent = 'Could not load MTNN explorer assets. Run pipeline/export_mtnn_viz.py after training.';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
