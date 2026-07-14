/* Vector Hoops — assets/network-viz.js
 * MTNN network explorer (/model): 3D embedding map + animated layer flow.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  // Cam's Lab authentic styling — ADA AAA, distinct from 3b1b dark
  var BG = '#FFFEF7';
  var PAPER_DOT = '#E8E0C8';
  var CARD = '#FFFFFF';
  var INK = '#111111';
  var SHADOW = '#111111';
  var SUBTLE_AAA = '#585858';
  var MUTED = '#666666';
  var HAIR = '#B8AFA0'; // axis / hairline ink
  var OKABE = { orange:'#E69F00', sky:'#56B4E9', green:'#009E73', yellow:'#F0E442', blue:'#0072B2', verm:'#D55E00', purple:'#CC79A7' };
  // 8 archetypes Okabe triple-encoded (color+shape+text) — AAA 7:1 min on white for blue, others with ink border
  var PALETTE = [OKABE.blue, OKABE.orange, OKABE.green, OKABE.verm, OKABE.purple, OKABE.sky, OKABE.yellow, OKABE.green];
  var PALETTE_OTHER = '#999999';
  var ORANGE = OKABE.orange;

  /* Fixed order, never cycled: a 9th archetype must not reuse hue 1. */
  function clusterColor(idx) {
    if (typeof idx !== 'number' || idx < 0) return PALETTE_OTHER;
    return idx < PALETTE.length ? PALETTE[idx] : PALETTE_OTHER;
  }
  // Axes chrome — light paper style, high contrast ink
  var AXIS_LINE = '#B8AFA0';
  var AXIS_TEXT = '#585858';
  var MAX_INPUT_NODES = 17; // truthful: 17 families, not top-10 truncated
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
      caption: '120 features in 17 families → each tower reads cat([x·m, m]), so missing stats have m=0 and zero gradient.'
    },
    {
      id: 'towers',
      caption: 'Each family goes through 2 residual blocks: B1 Linear(2d_in→160) LN GELU 160→32 LN + skip, B2 32→160→32 LN+res → 32-d output.'
    },
    {
      id: 'fusion',
      caption: '17×32=544 tower outputs concat with learned season embedding 12-d → 556-d → 128 GELU LN → 48-d → L2 norm.'
    },
    {
      id: 'embedding',
      caption: '48-d L2-normalized fingerprint — that is where similarity, recall@10, and purity are measured.'
    },
    {
      id: 'heads',
      caption: 'Decode: MLP 48→64→k for archetype(8)/position(5)/profile(14)/next(14), plus 18×(48→16→1) skill towers and scalar aux heads.'
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
    // Jacobian attribution (assets/mtnn_jacobian.*): causal sensitivity of each
    // target to each tower's output. Replaces input-magnitude proxies on edges.
    jac: null,
    jacData: null,
    jacTower: {},
    jacTarget: {},
    // Per-season league mean/SD (assets/season_norms.json) so predictions can
    // be shown as real per-100-possession numbers instead of z-scores.
    norms: null,
    // Feature attribution (assets/mtnn_attr_*): signed grad x input.
    attr: null,
    attrIdx: null,
    attrVal: null,
    attrTarget: 'archetype',
    attrScope: 'player',   // 'player' | 'population'
    attrTable: false,
    // When set, feature charts scope to this tower family's members.
    attrFocusFamily: null,
    // When a specific head row is selected (skill / class / next-stat),
    // remember it so the attr subject can name the click without lying
    // that bars explain that exact output (exports are group-level).
    attrProbeItem: null,
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
    selectedNode: null,
    hoverNode: null,
    _hoverKey: null,
    step: 0,
    playing: false,
    particles: [],
    flowLayout: null,
    // Zoomed-in default so the cloud and selected player read clearly;
    // auto-yaw is applied in mapLoop unless the user is dragging or
    // prefers-reduced-motion is on.
    cam: { yaw: 0.62, pitch: 0.32, zoom: 1.72, focal: 2.15 },
    drag: null,
    mapSize: { w: 0, h: 0, dpr: 1 },
    mapHoverIdx: null,
    reduceMotion: false,
    _mapLastTs: 0
  };

  function syncReduceMotion() {
    state.reduceMotion = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function $(id) { return document.getElementById(id); }

  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /* ---- z-score -> real units -------------------------------------------
     A z-score is meaningless without the league it was scored against. The
     next-season head predicts z within the TARGET season, so invert with that
     season's league mean/SD:  real = clip(z,-4,4) * sd + mu.

     Units are per 100 possessions, never per game. FG3_PCT / FG_PCT / FT_PCT
     are empirical-Bayes shrunk before z-scoring, so they are NOT invertible --
     we show a percentile for those rather than print a rate that never existed
     in the model. Returns null whenever we cannot be exact. */

  function nextSeasonLabel(season) {
    var y = seasonStart(season);
    if (!y) return null;
    var end = String(y + 2).slice(-2);
    return (y + 1) + '-' + end;
  }

  function seasonNorm(season, key) {
    if (!state.norms || !season) return null;
    var s = state.norms.seasons && state.norms.seasons[season];
    if (!s || !s.features) return null;
    return s.features[key] || null;
  }

  /* Real value for a predicted z in `season`. Falls back to the player's own
     season when next season has not been played, and says so. */
  function realFromZ(key, z, season) {
    if (!Number.isFinite(z)) return null;
    var target = nextSeasonLabel(season);
    var norm = seasonNorm(target, key);
    var baseline = target;
    if (!norm) { norm = seasonNorm(season, key); baseline = season; }
    if (!norm) return null;
    var clipped = Math.max(-4, Math.min(4, z));
    return {
      value: clipped * norm.sd + norm.mu,
      leagueAvg: norm.mu,
      baseline: baseline,
      projected: baseline === target
    };
  }

  /* Percentile of a z among that season's charted players — the honest answer
     for the shrunk percentage stats, and a friendly second reading elsewhere. */
  function percentileOfZ(z, key) {
    if (!Number.isFinite(z) || !state.featureIndex) return null;
    var j = state.featureIndex[key];
    if (j == null) return null;
    // z is standardized within season, so the corpus-wide z pool is the pool.
    var n = 0, below = 0;
    for (var i = 0; i < state.players.length; i += 7) {   // stride: cheap + stable
      var v = state.players[i].v;
      if (!v || v[j] == null) continue;
      n++;
      if (v[j] < z) below++;
    }
    if (n < 50) return null;
    return Math.round(100 * below / n);
  }

  function fmtReal(v) {
    var a = Math.abs(v);
    return (a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2));
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

  /* Diagram / inspector families stay in towerFamilies order so index i is
     always the family that feeds tower i. Score-sorted lists are for chips only. */
  function diagramFamily(i) {
    var fams = (state.arch && state.arch.towerFamilies) || [];
    var fam = fams[i];
    if (!fam) return null;
    var feats = (state.familyFeatures && state.familyFeatures[fam]) || [];
    var signals = inputSignalsForPlayer(state.playerIdx);
    return {
      key: fam,
      label: fam.replace(/_/g, ' '),
      features: feats,
      score: familyWeight(fam, signals)
    };
  }

  function familyWeight(fam, signals) {
    for (var i = 0; i < signals.length; i++) {
      if (signals[i].key === fam) return signals[i].score;
    }
    return 0.0;
  }

  function featureIsMasked(name, value) {
    var cov = state.attr && state.attr.coverage ? state.attr.coverage[name] : null;
    if (cov != null) return cov === 0;
    return value === 0;
  }

  // ---- Jacobian attribution -------------------------------------------------
  // |d(target)/d(tower_output)| for this row. This is causal sensitivity, not
  // input size: `bio` dominates the position head even though its inputs are
  // small. Index by family NAME — mtnn_arch.towerFamilies and the jacobian's
  // towerFamilies are in different orders.

  function jacHas() {
    return !!(state.jac && state.jacData && state.playerIdx >= 0);
  }

  function jacInfluence(playerIdx, fam, target) {
    if (!jacHas()) return null;
    var t = state.jacTower[fam];
    var g = state.jacTarget[target];
    if (t == null || g == null) return null;
    var nT = state.jac.towerFamilies.length;
    var nG = state.jac.targets.length;
    var v = state.jacData[(playerIdx * nT + t) * nG + g];
    return Number.isFinite(v) ? v : null;
  }

  /* Influence of every tower on `target`, keyed by family and scaled to 0..1
     within this row so edge widths stay comparable. */
  function towerInfluence(playerIdx, target) {
    if (!jacHas()) return null;
    var fams = (state.arch && state.arch.towerFamilies) || [];
    var out = {};
    var max = 0;
    for (var i = 0; i < fams.length; i++) {
      var v = jacInfluence(playerIdx, fams[i], target);
      if (v == null) continue;
      out[fams[i]] = v;
      if (v > max) max = v;
    }
    if (max <= 0) return null;
    for (var k in out) out[k] = out[k] / max;
    return out;
  }

  /* Total sensitivity of each head group, normalized across heads. */
  function headInfluence(playerIdx) {
    if (!jacHas()) return null;
    var fams = (state.arch && state.arch.towerFamilies) || [];
    var out = {};
    var max = 0;
    state.jac.targets.forEach(function (t) {
      if (t === 'embedding') return;
      var sum = 0;
      for (var i = 0; i < fams.length; i++) {
        var v = jacInfluence(playerIdx, fams[i], t);
        if (v != null) sum += v;
      }
      out[t] = sum;
      if (sum > max) max = sum;
    });
    if (max <= 0) return null;
    for (var k in out) out[k] = out[k] / max;
    return out;
  }

  /* ---- Feature attribution (assets/mtnn_attr_*) ----------------------------
     Signed grad x input over the raw inputs: which STATS pushed this head up or
     down. The Jacobian above is unsigned sensitivity (right for an edge width);
     this is directional (right for a bar). Four targets, not five — `embedding`
     has an arbitrary basis, so the sign of d(emb_i)/d(x_j) means nothing.

     Scales differ by target by construction: `skills` attributes the MEAN of 18
     skill heads, so its values run ~20x smaller than `archetype`'s. Every chart
     therefore normalizes within its own target; a shared scale would draw the
     skills bars flat. */

  function attrHas() {
    return !!(state.attr && state.attrIdx && state.attrVal);
  }

  function attrTargetIndex(target) {
    if (!attrHas()) return -1;
    return state.attr.targets.indexOf(target);
  }

  /* Top-k signed contributions for one row and target, biggest |value| first.
     A value of exactly 0 is not a weak feature — a tower reads cat([x*m, m]),
     so a never-measured feature has exactly zero gradient. Flag it, never plot
     it as a short bar. */
  function attrTopK(playerIdx, target) {
    var ti = attrTargetIndex(target);
    if (ti < 0 || playerIdx < 0) return null;
    var nT = state.attr.targets.length;
    var k = state.attr.topkLayout.k;
    var base = (playerIdx * nT + ti) * k;
    var out = [];
    for (var r = 0; r < k; r++) {
      var name = state.attr.features[state.attrIdx[base + r]];
      if (name == null) continue;
      var v = state.attrVal[base + r];
      out.push({
        key: name,
        label: (state.featureLabel && state.featureLabel[name]) || name,
        value: v,
        masked: featureIsMasked(name, v)
      });
    }
    return out;
  }

  /* Population signed means for one target, biggest |mean contribution| first. */
  function attrPopulation(target, limit) {
    if (!attrHas()) return null;
    var signed = state.attr.populationSigned[target];
    var abs = state.attr.populationAbs[target];
    if (!signed || !abs) return null;
    var rows = state.attr.features.map(function (f) {
      var cov = state.attr.coverage ? state.attr.coverage[f] : null;
      return {
        key: f,
        label: (state.featureLabel && state.featureLabel[f]) || f,
        value: signed[f],
        weight: abs[f],
        coverage: cov,
        masked: cov === 0
      };
    }).filter(function (r) { return Number.isFinite(r.weight); });
    rows.sort(function (a, b) { return b.weight - a.weight; });
    return limit ? rows.slice(0, limit) : rows;
  }

  /* Ranked tower influence on a target: top-N by magnitude, remainder summed
     into a neutral "Other" so a 9th slice never invents a hue. */
  function towerRanking(playerIdx, target, topN) {
    if (!jacHas()) return null;
    var fams = (state.arch && state.arch.towerFamilies) || [];
    var rows = [];
    for (var i = 0; i < fams.length; i++) {
      var v = jacInfluence(playerIdx, fams[i], target);
      if (v != null) rows.push({ key: fams[i], label: capWords(fams[i].replace(/_/g, ' ')), value: v });
    }
    if (!rows.length) return null;
    rows.sort(function (a, b) { return b.value - a.value; });
    var head = rows.slice(0, topN);
    var rest = rows.slice(topN);
    if (rest.length) {
      var sum = rest.reduce(function (a, r) { return a + r.value; }, 0);
      head.push({ key: '__other', label: 'Other (' + rest.length + ')', value: sum, other: true });
    }
    return head;
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

    // Tower selectivity must be measured on CAUSAL influence. Measured on raw
    // input magnitudes it reads ~0 for any superstar (every family maxes out),
    // which previously looked like a network pathology and was not.
    var embInf = towerInfluence(playerIdx, 'embedding');
    var towerVals = embInf
      ? (state.arch.towerFamilies || []).map(function (f) {
          return embInf[f] != null ? embInf[f] : 0;
        })
      : signalVals;
    var towerSpread = 1 - normalizedEntropy(towerVals);

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
    var cy = h * 0.5;
    // Tighter framing: larger base scale so the cloud fills the stage.
    var scale = Math.min(w, h) * 0.54 * cam.zoom;
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
      { key: 'X', hi: [0.98, 0.5, 0.5], lo: [0.02, 0.5, 0.5] },
      { key: 'Y', hi: [0.5, 0.98, 0.5], lo: [0.5, 0.02, 0.5] },
      { key: 'Z', hi: [0.5, 0.5, 0.98], lo: [0.5, 0.5, 0.02] }
    ];
    var axes = (state.map && state.map.axes) || [];

    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    defs.forEach(function (d) {
      var hi = project3D(d.hi[0], d.hi[1], d.hi[2], w, h, cam);
      var lo = project3D(d.lo[0], d.lo[1], d.lo[2], w, h, cam);
      ctx.strokeStyle = AXIS_LINE;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(lo.sx, lo.sy);
      ctx.lineTo(hi.sx, hi.sy);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = AXIS_LINE;
      ctx.beginPath();
      ctx.arc(hi.sx, hi.sy, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = AXIS_TEXT;
      ctx.fillText(d.key, hi.sx + 6, hi.sy + 3);
    });

    var panelX = 12;
    var panelY = 12;
    var panelW = Math.min(w - 24, 520);
    var lineH = 14;
    var panelH = 10 + Math.max(1, axes.length) * (lineH + 12);
    ctx.fillStyle = '#FFFEF7';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#111111';
    ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillText('PCA Axes (MTNN 48-d) — Cam\'s Lab light paper', panelX + 8, panelY + 13);
    axes.forEach(function (ax, i) {
      var y = panelY + 30 + i * (lineH + 12);
      ctx.fillStyle = '#111111';
      ctx.fillText((ax.axis || ['X', 'Y', 'Z'][i]) + ' / ' + (ax.pc || ('PC' + (i + 1))), panelX + 8, y);
      ctx.fillStyle = '#111111';
      ctx.fillText((ax.hi || '').slice(0, 72), panelX + 90, y);
      ctx.fillStyle = '#585858';
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

  /* Tower node size: causal influence on the embedding when the Jacobian is
     available, else the legacy input-magnitude proxy. */
  function towerHeights(playerIdx) {
    if (playerIdx < 0) return null;
    var fams = state.arch.towerFamilies || [];
    var inf = towerInfluence(playerIdx, 'embedding');
    if (inf) {
      return fams.map(function (fam) {
        return 0.25 + (inf[fam] != null ? inf[fam] : 0) * 0.75;
      });
    }
    var signals = inputSignalsForPlayer(playerIdx);
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
    // Causal influence on the embedding when available — same signal as tower radii.
    var embInf = towerInfluence(playerIdx, 'embedding');
    var towerScores = fams.map(function (fam) {
      return {
        fam: fam,
        score: embInf && embInf[fam] != null ? embInf[fam] : familyWeight(fam, signals)
      };
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
    var cls0 = step === 0 ? ' is-active' : (step > 0 ? ' is-done' : '');
    var cls1 = step === 1 ? ' is-active' : (step > 1 ? ' is-done' : '');
    var clsF = step === 2 || step === 3 ? ' is-active' : (step > 3 ? ' is-done' : '');
    var cls2 = step === 4 ? ' is-active' : '';

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
          '<div class="network-story-stage__head">What went in</div>' +
          '<div class="network-story-stage__chips">' + inputsHtml + '</div>' +
        '</div>' +
        '<div class="network-story-arrow" aria-hidden="true">→</div>' +
        '<div class="network-story-stage' + cls1 + '">' +
          '<div class="network-story-stage__head">What drove the fingerprint</div>' +
          '<div class="network-story-stage__chips">' + towersHtml + '</div>' +
        '</div>' +
        '<div class="network-story-arrow" aria-hidden="true">→</div>' +
        '<div class="network-story-stage' + clsF + '">' +
          '<div class="network-story-stage__head">Fuse &amp; embed</div>' +
          '<div class="network-story-stage__chips">' +
            '<span class="network-story-chip">544+12 → 48 L2</span>' +
          '</div>' +
        '</div>' +
        '<div class="network-story-arrow" aria-hidden="true">→</div>' +
        '<div class="network-story-stage' + cls2 + '">' +
          '<div class="network-story-stage__head">What came out</div>' +
          '<div class="network-story-stage__chips">' + predHtml + '</div>' +
        '</div>' +
      '</div>';
  }

  /* The map paints ~13k dots by archetype. Identity must never be carried by
     colour alone -- the eight hues sit at the reference theme's CVD floor
     (worst adjacent dE 10.3 protan / 7.9 tritan), which is legal only with a
     secondary encoding. The legend is that encoding. */
  function renderMapLegend() {
    var host = $('network-map-legend');
    if (!host || !state.arch) return;
    var names = state.arch.gameArchetypes || [];
    if (!names.length) return;
    var unknown = state.players.some(function (p) {
      return !(typeof p.c === 'number' && p.c >= 0 && p.c < names.length);
    });
    var items = names.map(function (nm, i) {
      return '<li class="network-map-legend__item">' +
        '<span class="network-map-legend__swatch" style="background:' +
        clusterColor(i) + '"></span>' +
        '<span class="network-map-legend__name">' + esc(nm) + '</span></li>';
    });
    if (unknown) {
      items.push('<li class="network-map-legend__item">' +
        '<span class="network-map-legend__swatch" style="background:' +
        PALETTE_OTHER + '"></span>' +
        '<span class="network-map-legend__name">unclustered</span></li>');
    }
    host.innerHTML = items.join('');
  }

  function renderMapInsights() {
    var host = $('network-map-insights');
    if (!host || state.playerIdx < 0) return;
    var nbs = embeddingNeighbors(state.playerIdx, 5);
    if (!nbs.length) {
      host.innerHTML = '<p class="drift-loading">No nearby players yet.</p>';
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
      '<div class="network-insights__head">Nearby players</div>' +
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
        return '<li><button type="button" class="network-neighbor-list__pick" data-neighbor-idx="' + n.idx + '">' +
          '<span class="network-neighbor-list__name">' + esc(p.name) + '</span>' +
          '<span class="network-neighbor-list__meta">' + esc(p.season) + ' · ' +
          fmtPredScore(n.sim * 100) + '% match</span></button></li>';
      }).join('') + '</ol>';
  }

  function renderFlowInsights() {
    var host = $('network-flow-insights');
    if (!host || state.playerIdx < 0) return;
    var d = flowDiagnostics(state.playerIdx);
    if (!d) {
      host.innerHTML = '<p class="drift-loading">No signal summary yet.</p>';
      return;
    }
    // Each hint states what the bar means, which direction is "more", and a
    // typical range — and, where a low reading is easily misread as "the model
    // is broken", says plainly what it usually means instead.
    var rows = [
      { key: 'Top inputs', val: d.inputFocus,
        hint: 'Share of this player’s signal coming from his 3 strongest stat groups. '
          + 'Higher = a specialist; lower = an all-around profile. Most players sit around 25–45%.' },
      { key: 'Tower spread', val: d.towerSpread,
        hint: 'Whether a few parts of the network drive this player or all of them equally. '
          + 'A superstar often reads LOW here — he lights up everything at once, which is a strength, not a fault.' },
      { key: 'Archetype gap', val: d.archMargin,
        hint: 'How far the model’s top play-style guess leads its second guess. '
          + 'High = a clear-cut type; low = a genuine hybrid between two styles.' },
      { key: 'Position gap', val: d.posMargin,
        hint: 'How far the top position guess leads the runner-up. A LOW gap usually means the player is '
          + 'genuinely positionless (a point-forward, a switchable big) — not that the model is unsure.' },
      { key: 'Skill spread', val: d.skillContrast,
        hint: 'How uneven the skill grades are. High = sharp peaks and valleys (a specialist); '
          + 'low = an even, well-rounded grade sheet.' },
      { key: 'Next-year signal', val: d.nextSignal,
        hint: 'How far the model expects next season’s stats to move from the league average. '
          + 'Higher = a more distinctive projected season; near zero = a roughly average line.' }
    ];
    host.innerHTML =
      '<div class="network-insights__head">Signal check</div>' +
      '<p class="network-insight-note">These bars describe how the model is <em>reading</em> this '
        + 'player — they are not a rating of how good he is. Hover any bar for what it means.</p>' +
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
      host.innerHTML = '<div class="network-insights__head">Side by side</div>' +
        '<p class="skills-hint">Turn on compare mode and pick another player-season to see the gap.</p>';
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
      '<div class="network-insights__head">Side by side</div>' +
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
    if (!state.selectedNode) {
      host.innerHTML = '<div class="network-node-inspector__head">Selected node</div>' +
        '<p class="network-node-inspector__hint">Hover a node to preview its path; click any input, tower, ' +
        'or output to lock the path and open attribution below.</p>';
      return;
    }
    var node = state.selectedNode;
    var row = headRow(state.playerIdx);
    var player = state.players[state.playerIdx];
    var signals = inputSignalsForPlayer(state.playerIdx);
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
      // Index is towerFamilies order — never the score-sorted chip list.
      var inp = diagramFamily(node.index);
      if (!inp) {
        host.innerHTML = '<p class="drift-loading">Pick an input node to see which stats fed it.</p>';
        return;
      }
      var featRows = featureRowsForFamily(inp.key);
      host.innerHTML =
        '<div class="network-node-inspector__head">Input family → matching tower</div>' +
        '<div class="network-insights__chips">' +
          '<span class="network-insight-chip">' + esc(inp.label) + '</span>' +
          '<span class="network-insight-chip">→ tower #' + (node.index + 1) + '</span>' +
          '<span class="network-insight-chip">coverage <b>' + fmtPredScore(inp.score * 100) + '%</b></span>' +
        '</div>' +
        '<ol class="network-node-inspector__list">' + featRows.slice(0, 16).map(function (f) {
          return '<li><span class="network-node-inspector__name">' + esc(f.label) + '</span>' +
            '<span class="network-node-inspector__num">' + esc(f.key) + '</span>' +
            '<span class="network-node-inspector__num">' + (Math.round(f.z * 100) / 100).toFixed(2) + 'z</span></li>';
        }).join('') + '</ol>' +
        '<p class="network-node-inspector__hint">Each value compares this player to the league that season: '
          + '<b>+</b> above average, <b>−</b> below. This family feeds tower #' + (node.index + 1)
          + ' one-to-one. Attribution below shows how it pushed each decode head.</p>';
      return;
    }

    if (node.type === 'tower') {
      var fam = fams[node.index] || '';
      var embInf = towerInfluence(state.playerIdx, 'embedding');
      var headInf = towerInfluence(state.playerIdx, state.attrTarget);
      var embScore = embInf && embInf[fam] != null ? embInf[fam] : null;
      var headScore = headInf && headInf[fam] != null ? headInf[fam] : null;
      var towerFeats = featureRowsForFamily(fam);
      var chips = '<span class="network-insight-chip">' + esc(fam.replace(/_/g, ' ')) + '</span>';
      if (embScore != null) {
        chips += '<span class="network-insight-chip">Fingerprint share <b>' +
          fmtPredScore(embScore * 100) + '%</b></span>';
      } else {
        chips += '<span class="network-insight-chip">coverage <b>' +
          fmtPredScore(familyWeight(fam, signals) * 100) + '%</b></span>';
      }
      if (headScore != null) {
        chips += '<span class="network-insight-chip">' +
          esc(ATTR_TARGET_LABELS[state.attrTarget] || state.attrTarget) +
          ' share <b>' + fmtPredScore(headScore * 100) + '%</b></span>';
      }
      host.innerHTML =
        '<div class="network-node-inspector__head">Tower influence</div>' +
        '<div class="network-insights__chips">' + chips + '</div>' +
        '<ol class="network-node-inspector__list">' + towerFeats.slice(0, 16).map(function (f) {
          return '<li><span class="network-node-inspector__name">' + esc(f.label) + '</span>' +
            '<span class="network-node-inspector__num">' + esc(f.key) + '</span>' +
            '<span class="network-node-inspector__num">' + (Math.round(f.z * 100) / 100).toFixed(2) + 'z</span></li>';
        }).join('') + '</ol>' +
        '<p class="network-node-inspector__hint">Node radius is causal influence on the embedding'
          + (jacHas() ? '' : ' (Jacobian not loaded — showing coverage)')
          + ', not how loud the inputs are. Signed contributions of this family to '
          + esc(ATTR_TARGET_ASKS[state.attrTarget] || state.attrTarget)
          + ' are in the panel below.</p>';
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
        '<div class="network-node-inspector__head">Auxiliary training heads</div>' +
        '<p class="network-node-inspector__hint">These scalar heads help train the fingerprint. '
          + 'They are not exported as individual predictions, so there is no attribution chart for them.</p>';
      return;
    }

    host.innerHTML =
      '<div class="network-node-inspector__head">Output · ' + esc(group.replace(/_/g, ' ')) + '</div>' +
      '<ol class="network-node-inspector__list">' + rows.map(function (r) {
        var selectedCls = (itemIndex >= 0 && itemIndex === r.idx) ? ' is-selected' : '';
        return '<li><button class="network-node-inspector__pick' + selectedCls + '" data-head-item-group="' + esc(group) +
          '" data-head-item-idx="' + r.idx + '">' + esc(r.label) + '</button>' +
          '<span class="network-node-inspector__num">' + (group === 'next_profile'
            ? nextProfileDisplay(r)
            : fmtPredScore(r.value) + (group === 'skills' ? '' : '%')) + '</span>' +
          '<span class="network-node-inspector__num">' + esc(r.aux || '') + '</span></li>';
      }).join('') + '</ol>' +
      '<p class="network-node-inspector__hint">' +
      (group === 'skills' || group === 'next_profile'
        ? 'The range shows where the middle 80% of the most similar players land — a sense of how sure the estimate is.'
        : 'Classification rows show the full class probability distribution. Click the head to see which inputs drove it.') +
      '</p>';
  }

  function nodeFromEl(t) {
    if (!t || !t.closest) return null;
    var inp = t.closest('[data-input]');
    if (inp) return { type: 'input', index: parseInt(inp.getAttribute('data-input'), 10) };
    var tw = t.closest('[data-tower]');
    if (tw) return { type: 'tower', index: parseInt(tw.getAttribute('data-tower'), 10) };
    var hd = t.closest('[data-head-key]');
    if (hd) return { type: 'head_group', key: hd.getAttribute('data-head-key') };
    return null;
  }

  function capWords(s) {
    return String(s).replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

function buildFlowSvg(host) {
    if (!host || !state.arch) return;
    host.innerHTML = '';
    // AAA readable: taller canvas, larger fonts, no clip. Truthful W1380 H880 v4 baseline.
    // Input mask m∈{0,1} • cat([x·m,m]) • 2 residual blocks per tower 160→32 LN GELU + skip • season 12-d concat • L2 embed 48-d • MLP heads 8/5/14/18
    // Truthful invariants: 12,392 seasons, 120 feats, 17 families cat([x·m,m]) 17×160→32×2 544+12=556→128→48 L2, MAX_INPUT_NODES 17 truthful
    var W = 1380;
    var H = 880;
    var TOP_LABEL_Y = 28;
    var BOT_Y = H - 48;
    var svg = document.createElementNS(SVG_NS, 'svg');
    // Fix clipping bug: old viewBox '28 0 1292 720' clipped "INPUT..." to "UT..." — now 0 0 full width
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'network-flow-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    host.appendChild(svg);

    // Readable column map — generous spacing, Cam's Lab ink on paper #FFFEF7, CARD #FFFFFF stroke #111 2.5px
    var COLS = {
      input: 110,
      cat: 250,
      b1h: 350,
      b1o: 470,
      b2h: 580,
      b2o: 700,
      gate: 780,
      s12: 840,
      fusion: 900,
      fusionHidden: 1010,
      fusionH: 1010,
      embed: 1120,
      heads: 1250
    };
    // legacy aliases
    COLS.fusionHid = COLS.fusionHidden;

    var colsArr = [COLS.input, COLS.b2o, COLS.fusion, COLS.embed, COLS.heads];

    // Top labels — 12px mono bold, AAA #111 on #FFFEF7 18.6:1
    var topLabels = [
      { x: COLS.input, label: 'Input 120 feats 17 families' },
      { x: COLS.b2o, label: 'Towers 17×2 ResBlocks 160→32' },
      { x: COLS.fusion, label: 'Concat 544+12=556 + season 12-d' },
      { x: COLS.embed, label: 'Embed 48-d L2' },
      { x: COLS.heads, label: 'Heads MLP 48→64→k' }
    ];
    topLabels.forEach(function(o){
      var t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', o.x);
      t.setAttribute('y', TOP_LABEL_Y);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('class', 'network-flow-col-label');
      t.setAttribute('style', 'font-size:12px;font-weight:800;fill:#111111;letter-spacing:0.04em;');
      t.textContent = o.label;
      svg.appendChild(t);
    });

    // Sub-labels — 10px bold #585858 AAA
    var subs = [
      { x: COLS.cat, y: TOP_LABEL_Y+16, txt: 'cat([x·m, m])  2·d_in' },
      { x: (COLS.b1h+COLS.b1o)/2, y: TOP_LABEL_Y+16, txt: 'B1 LN+GELU + skip' },
      { x: (COLS.b2h+COLS.b2o)/2, y: TOP_LABEL_Y+16, txt: 'B2 32→160→32 res' },
      { x: COLS.fusion, y: TOP_LABEL_Y+16, txt: '556→128 GELU LN →48' }
    ];
    subs.forEach(function(su){
      var t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', su.x);
      t.setAttribute('y', su.y);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('class', 'network-flow-col-label');
      t.setAttribute('style', 'font-size:10px;fill:#585858;font-weight:700;');
      t.textContent = su.txt;
      svg.appendChild(t);
    });

    var fams = state.arch.towerFamilies || [];
    var nTowers = fams.length || 17;
    var towerTop = TOP_LABEL_Y + 52;
    var towerBot = BOT_Y;
    var towerSpan = towerBot - towerTop; // 880-28-110=742 nominal
    var rowGap = Math.max(42, towerSpan / nTowers); // >=42px per tower guarantees no overlap
    var towerG = document.createElementNS(SVG_NS, 'g');
    towerG.setAttribute('id', 'flow-towers');
    var towerYs = [];
    for (var ti=0; ti<nTowers; ti++){
      // center each row in its slot
      var y = towerTop + (ti + 0.5) * (towerSpan / nTowers);
      towerYs.push(y);
    }

    var inputG = document.createElementNS(SVG_NS, 'g');
    inputG.setAttribute('id', 'flow-input');
    var edgeG = document.createElementNS(SVG_NS, 'g');
    edgeG.setAttribute('id', 'flow-edges');
    edgeG.setAttribute('class', 'network-flow-edges');

    // Build rows with generous spacing
    for (var i = 0; i < nTowers; i++) {
      var y = towerYs[i];
      var fam = fams[i] || ('fam'+i);
      var d_in = (state.arch.familyFeatures && state.arch.familyFeatures[fam]) ? state.arch.familyFeatures[fam].length : 0;
      var twoDin = d_in*2;

      // Input node — readable: w 92 h 24 rx 6 as per fix, white fill ink border 2.5px
      var inputW = 92;
      var inputH = 24;
      var ic = document.createElementNS(SVG_NS, 'rect');
      ic.setAttribute('x', String(COLS.input - inputW/2));
      ic.setAttribute('y', String(y - inputH/2));
      ic.setAttribute('width', String(inputW));
      ic.setAttribute('height', String(inputH));
      ic.setAttribute('rx', '6');
      ic.setAttribute('class', 'network-flow-node network-flow-node--input');
      ic.setAttribute('data-input', String(i));
      ic.setAttribute('data-family', fam);
      ic.setAttribute('data-tower-row', String(i));
      ic.setAttribute('style', 'fill:#FFFFFF;stroke:#111111;stroke-width:2.5px;');
      var tt = document.createElementNS(SVG_NS, 'title');
      tt.textContent = fam.replace(/_/g,' ') + ' ('+d_in+' feats) → cat([x·m,m]) 2·d_in='+twoDin+' — m∈{0,1} ∅→0 grad=0 never imputed';
      ic.appendChild(tt);
      inputG.appendChild(ic);

      // Input label — 12.5px bold #111 readable, offset 18 from rect edge
      var labelOffset = 18;
      var it = document.createElementNS(SVG_NS, 'text');
      it.setAttribute('x', String(COLS.input + inputW/2 + labelOffset));
      it.setAttribute('y', String(y + 4));
      it.setAttribute('class', 'network-flow-col-label');
      it.setAttribute('text-anchor', 'start');
      it.setAttribute('data-input-label', String(i));
      it.setAttribute('style', 'font-size:12.5px;font-weight:700;fill:#111111;letter-spacing:0.01em;');
      it.textContent = fam.replace(/_/g,' ');
      inputG.appendChild(it);

      // Input value / coverage — 10.5px #585858 at x+160
      var iv = document.createElementNS(SVG_NS, 'text');
      iv.setAttribute('x', String(COLS.input + 160));
      iv.setAttribute('y', String(y + 4));
      iv.setAttribute('class', 'network-flow-col-label');
      iv.setAttribute('text-anchor', 'end');
      iv.setAttribute('data-input-value', String(i));
      iv.setAttribute('style', 'font-size:10.5px;fill:#585858;font-weight:600;');
      iv.textContent = '0%';
      inputG.appendChild(iv);

      // cat node — slightly larger for readability 32×18
      var cat = document.createElementNS(SVG_NS, 'g');
      cat.setAttribute('transform', 'translate('+COLS.cat+','+y+')');
      var catR = document.createElementNS(SVG_NS, 'rect');
      catR.setAttribute('x','-16'); catR.setAttribute('y','-9'); catR.setAttribute('width','32'); catR.setAttribute('height','18'); catR.setAttribute('rx','4');
      catR.setAttribute('class','network-flow-node network-flow-node--cat');
      catR.setAttribute('data-tower-row', String(i));
      catR.setAttribute('style','fill:#FFFFFF;stroke:#111111;stroke-width:2px;');
      cat.appendChild(catR);
      var catT = document.createElementNS(SVG_NS, 'text');
      catT.setAttribute('x','0'); catT.setAttribute('y','4'); catT.setAttribute('text-anchor','middle');
      catT.setAttribute('style','font-size:9.5px;fill:#111111;font-family:ui-monospace;font-weight:800;');
      catT.textContent = 'cat';
      cat.appendChild(catT);
      inputG.appendChild(cat);

      // Edge in: input → cat
      var pIn = document.createElementNS(SVG_NS, 'path');
      var dIn = 'M'+(COLS.input+inputW/2)+','+y+' L'+(COLS.cat-16)+','+y;
      pIn.setAttribute('d', dIn);
      pIn.setAttribute('class','network-flow-edge');
      pIn.setAttribute('data-edge','in-'+i);
      pIn.setAttribute('style','stroke:#111111;stroke-width:1.4;');
      edgeG.appendChild(pIn);

      // B1 hidden 160 — circle r=5 readable (was 3.5)
      var b1h = document.createElementNS(SVG_NS, 'circle');
      b1h.setAttribute('cx', String(COLS.b1h)); b1h.setAttribute('cy', String(y)); b1h.setAttribute('r','5');
      b1h.setAttribute('class','network-flow-node network-flow-node--tower-sub network-flow-node--b1h');
      b1h.setAttribute('data-tower-sub', 'b1h-'+i);
      b1h.setAttribute('data-tower-row', String(i));
      b1h.setAttribute('style','fill:#FFFFFF;stroke:#111111;stroke-width:2px;');
      var b1hTitle = document.createElementNS(SVG_NS, 'title');
      b1hTitle.textContent = 'B1 hidden 160: Linear('+ twoDin +'→160) LN GELU';
      b1h.appendChild(b1hTitle);
      towerG.appendChild(b1h);

      var pC1 = document.createElementNS(SVG_NS, 'path');
      pC1.setAttribute('d','M'+(COLS.cat+16)+','+y+' L'+(COLS.b1h-5)+','+y);
      pC1.setAttribute('class','network-flow-edge network-flow-edge--tower-internal');
      pC1.setAttribute('style','stroke:#111111;opacity:0.7;');
      edgeG.appendChild(pC1);

      // B1 out 32 — r=6
      var b1o = document.createElementNS(SVG_NS, 'circle');
      b1o.setAttribute('cx', String(COLS.b1o)); b1o.setAttribute('cy', String(y)); b1o.setAttribute('r','6');
      b1o.setAttribute('class','network-flow-node network-flow-node--tower-sub network-flow-node--b1o');
      b1o.setAttribute('data-tower-row', String(i));
      b1o.setAttribute('style','fill:#FFFFFF;stroke:#111111;stroke-width:2px;');
      var b1oTitle = document.createElementNS(SVG_NS, 'title');
      b1oTitle.textContent = 'B1 out 32: Linear(160→32) LN + skip Linear('+twoDin+'→32)';
      b1o.appendChild(b1oTitle);
      towerG.appendChild(b1o);

      var skip1 = document.createElementNS(SVG_NS, 'path');
      skip1.setAttribute('d','M'+(COLS.cat+8)+','+(y-10)+' Q'+((COLS.cat+COLS.b1o)/2)+','+(y-18)+' '+COLS.b1o+','+(y-6));
      skip1.setAttribute('class','network-flow-edge network-flow-edge--skip');
      skip1.setAttribute('style','fill:none;stroke:#111111;stroke-width:1;stroke-dasharray:4 3;opacity:0.55;');
      edgeG.appendChild(skip1);

      var pB1 = document.createElementNS(SVG_NS, 'path');
      pB1.setAttribute('d','M'+COLS.b1h+','+y+' L'+(COLS.b1o-6)+','+y);
      pB1.setAttribute('class','network-flow-edge network-flow-edge--tower-internal');
      pB1.setAttribute('style','stroke:#111111;opacity:0.6;');
      edgeG.appendChild(pB1);

      // B2 hidden 160 — r=5
      var b2h = document.createElementNS(SVG_NS, 'circle');
      b2h.setAttribute('cx', String(COLS.b2h)); b2h.setAttribute('cy', String(y)); b2h.setAttribute('r','5');
      b2h.setAttribute('class','network-flow-node network-flow-node--tower-sub network-flow-node--b2h');
      b2h.setAttribute('data-tower-row', String(i));
      b2h.setAttribute('style','fill:#FFFFFF;stroke:#111111;stroke-width:2px;');
      var b2hTitle = document.createElementNS(SVG_NS, 'title');
      b2hTitle.textContent = 'B2 hidden 160: Linear(32→160) LN GELU';
      b2h.appendChild(b2hTitle);
      towerG.appendChild(b2h);

      var pB2a = document.createElementNS(SVG_NS, 'path');
      pB2a.setAttribute('d','M'+COLS.b1o+','+y+' L'+(COLS.b2h-5)+','+y);
      pB2a.setAttribute('class','network-flow-edge network-flow-edge--tower-internal');
      pB2a.setAttribute('style','stroke:#111111;opacity:0.6;');
      edgeG.appendChild(pB2a);

      // B2 final out 32 — r=8 bold, main tower node
      var b2o = document.createElementNS(SVG_NS, 'circle');
      b2o.setAttribute('cx', String(COLS.b2o));
      b2o.setAttribute('cy', String(y));
      b2o.setAttribute('r', '8');
      b2o.setAttribute('class', 'network-flow-node network-flow-node--tower');
      b2o.setAttribute('data-tower', String(i));
      b2o.setAttribute('data-family', fam);
      b2o.setAttribute('data-tower-row', String(i));
      b2o.setAttribute('style','fill:#FFFFFF;stroke:#111111;stroke-width:2.5px;');
      var b2oTitle = document.createElementNS(SVG_NS, 'title');
      b2oTitle.textContent = fam.replace(/_/g,' ')+' tower final 32-d (B2: 160→32 LN + residual). d_in='+d_in+' → 2·d_in='+twoDin+' →32';
      b2o.appendChild(b2oTitle);
      towerG.appendChild(b2o);

      var skip2 = document.createElementNS(SVG_NS, 'path');
      skip2.setAttribute('d','M'+COLS.b1o+','+(y+8)+' Q'+((COLS.b1o+COLS.b2o)/2)+','+(y+16)+' '+COLS.b2o+','+(y+6));
      skip2.setAttribute('class','network-flow-edge network-flow-edge--skip');
      skip2.setAttribute('style','fill:none;stroke:#111111;stroke-width:1;stroke-dasharray:4 3;opacity:0.55;');
      edgeG.appendChild(skip2);

      var pB2b = document.createElementNS(SVG_NS, 'path');
      pB2b.setAttribute('d','M'+COLS.b2h+','+y+' L'+(COLS.b2o-8)+','+y);
      pB2b.setAttribute('class','network-flow-edge network-flow-edge--tower-internal');
      pB2b.setAttribute('style','stroke:#111111;opacity:0.6;');
      edgeG.appendChild(pB2b);

      // Tower label — 11px AAA readable (was 6.5px)
      var tl = document.createElementNS(SVG_NS, 'text');
      tl.setAttribute('x', String(COLS.b2o + 16));
      tl.setAttribute('y', String(y + 4));
      tl.setAttribute('class', 'network-flow-tower-label');
      tl.setAttribute('text-anchor', 'start');
      tl.setAttribute('data-tower-label', String(i));
      tl.setAttribute('style','font-size:11px;font-weight:700;fill:#111111;font-family:ui-monospace;');
      tl.textContent = fam.replace(/_/g,' ');
      towerG.appendChild(tl);

      // Fuse edge: tower out → fusion concat
      var pFuse = document.createElementNS(SVG_NS, 'path');
      var midY = H / 2;
      var dFuse = 'M'+ (COLS.b2o + 8) +','+ y +
        ' C'+ (COLS.b2o + 60) +','+ y +' '+ (COLS.fusion - 80) +','+ midY +' '+ (COLS.fusion - 22) +','+ midY;
      pFuse.setAttribute('d', dFuse);
      pFuse.setAttribute('class', 'network-flow-edge');
      pFuse.setAttribute('data-edge', 'fuse-' + i);
      pFuse.setAttribute('style','stroke:#111111;stroke-width:1.2;opacity:0.55;');
      edgeG.appendChild(pFuse);
    }

    var midY = H/2;

    // Season embedding node
    var seasonG = document.createElementNS(SVG_NS, 'g');
    seasonG.setAttribute('transform','translate('+ (COLS.fusion-14) +','+ (towerTop-16) +')');
    var seasonC = document.createElementNS(SVG_NS, 'circle');
    seasonC.setAttribute('cx','0'); seasonC.setAttribute('cy','0'); seasonC.setAttribute('r','12');
    seasonC.setAttribute('class','network-flow-node network-flow-node--season');
    seasonC.setAttribute('id','flow-season');
    seasonC.setAttribute('style','fill:#FFFFFF;stroke:#111111;stroke-width:2.5px;');
    var seasonTitle = document.createElementNS(SVG_NS, 'title');
    seasonTitle.textContent = 'Season embedding 12-d learned (n_seasons lookup) — gives era context';
    seasonC.appendChild(seasonTitle);
    seasonG.appendChild(seasonC);
    var seasonL = document.createElementNS(SVG_NS, 'text');
    seasonL.setAttribute('x','18'); seasonL.setAttribute('y','4');
    seasonL.setAttribute('class','network-flow-col-label');
    seasonL.setAttribute('style','font-size:10px;font-weight:700;fill:#111111;');
    seasonL.textContent = 'season 12-d';
    seasonG.appendChild(seasonL);
    svg.appendChild(seasonG);

    var seasonEdge = document.createElementNS(SVG_NS, 'path');
    seasonEdge.setAttribute('d','M'+(COLS.fusion-14)+','+(towerTop-4)+' C'+(COLS.fusion-14)+','+(midY-80)+' '+(COLS.fusion-14)+','+(midY-40)+' '+(COLS.fusion)+','+(midY-18));
    seasonEdge.setAttribute('class','network-flow-edge network-flow-edge--season');
    seasonEdge.setAttribute('style','stroke-dasharray:4 3;opacity:0.65;stroke:#111111;');
    edgeG.appendChild(seasonEdge);

    // Fusion concat node
    var fusion = document.createElementNS(SVG_NS, 'circle');
    fusion.setAttribute('cx', String(COLS.fusion));
    fusion.setAttribute('cy', String(midY));
    fusion.setAttribute('r', '20');
    fusion.setAttribute('class', 'network-flow-node network-flow-node--fusion');
    fusion.setAttribute('id', 'flow-fusion');
    fusion.setAttribute('style','fill:#FFFFFF;stroke:#111111;stroke-width:2.5px;');
    var fusionTitle = document.createElementNS(SVG_NS, 'title');
    fusionTitle.textContent = 'Concat fusion: flatten 17×32=544 + season 12 =556 → Linear 556→128 GELU LayerNorm';
    fusion.appendChild(fusionTitle);
    svg.appendChild(fusion);

    var fusionLabel = document.createElementNS(SVG_NS, 'text');
    fusionLabel.setAttribute('x', String(COLS.fusion));
    fusionLabel.setAttribute('y', String(midY+36));
    fusionLabel.setAttribute('text-anchor','middle');
    fusionLabel.setAttribute('class','network-flow-col-label');
    fusionLabel.setAttribute('style','font-size:11px;fill:#585858;font-weight:700;');
    fusionLabel.textContent = '556→128';
    svg.appendChild(fusionLabel);

    // Fusion hidden 128
    var fusionH = document.createElementNS(SVG_NS, 'circle');
    fusionH.setAttribute('cx', String(COLS.fusionHidden));
    fusionH.setAttribute('cy', String(midY));
    fusionH.setAttribute('r', '12');
    fusionH.setAttribute('class','network-flow-node network-flow-node--fusion-hidden');
    fusionH.setAttribute('id','flow-fusion-hidden');
    fusionH.setAttribute('style','fill:#FFFFFF;stroke:#111111;stroke-width:2.5px;');
    var fhTitle = document.createElementNS(SVG_NS, 'title');
    fhTitle.textContent = 'Fusion hidden 128-d: GELU + LayerNorm, then Linear 128→48';
    fusionH.appendChild(fhTitle);
    svg.appendChild(fusionH);

    var eFH = document.createElementNS(SVG_NS, 'line');
    eFH.setAttribute('x1', String(COLS.fusion+20)); eFH.setAttribute('y1', String(midY));
    eFH.setAttribute('x2', String(COLS.fusionHidden-12)); eFH.setAttribute('y2', String(midY));
    eFH.setAttribute('class','network-flow-edge network-flow-edge--main');
    eFH.setAttribute('data-edge','fusion-hidden');
    eFH.setAttribute('style','stroke:#111111;stroke-width:2;');
    edgeG.appendChild(eFH);

    // Embed node 48-d
    var embed = document.createElementNS(SVG_NS, 'circle');
    embed.setAttribute('cx', String(COLS.embed));
    embed.setAttribute('cy', String(midY));
    embed.setAttribute('r', '18');
    embed.setAttribute('class', 'network-flow-node network-flow-node--embed');
    embed.setAttribute('id', 'flow-embed');
    embed.setAttribute('style','fill:#FFFFFF;stroke:#111111;stroke-width:2.5px;');
    var embedTitle = document.createElementNS(SVG_NS, 'title');
    embedTitle.textContent = 'Embedding 48-d L2-normalized: output of Linear 128→48 then F.normalize, cosine similarity';
    embed.appendChild(embedTitle);
    svg.appendChild(embed);

    var eF2E = document.createElementNS(SVG_NS, 'line');
    eF2E.setAttribute('x1', String(COLS.fusionHidden+12)); eF2E.setAttribute('y1', String(midY));
    eF2E.setAttribute('x2', String(COLS.embed-18)); eF2E.setAttribute('y2', String(midY));
    eF2E.setAttribute('class','network-flow-edge network-flow-edge--main');
    eF2E.setAttribute('data-edge','emb-main');
    eF2E.setAttribute('style','stroke:#111111;stroke-width:2;');
    edgeG.appendChild(eF2E);

    var l2badge = document.createElementNS(SVG_NS, 'text');
    l2badge.setAttribute('x', String((COLS.fusionHidden+COLS.embed)/2));
    l2badge.setAttribute('y', String(midY-12));
    l2badge.setAttribute('text-anchor','middle');
    l2badge.setAttribute('class','network-flow-col-label');
    l2badge.setAttribute('style','font-size:11px;fill:#111111;font-weight:800;');
    l2badge.textContent = 'L2 norm';
    svg.appendChild(l2badge);

    // Heads — readable 12px
    var headDefs = [
      { key: 'archetype', label: 'Archetype (8) 48→64→8', y: H * 0.20 },
      { key: 'position', label: 'Position (5) 48→64→5', y: H * 0.36 },
      { key: 'skills', label: 'Skills (18) 18×(48→16→1)', y: H * 0.52 },
      { key: 'next_profile', label: 'Next season (14) 48→64→14', y: H * 0.68 },
      { key: 'aux', label: 'Aux 8 scalar 48→1', y: H * 0.84 }
    ];
    var headG = document.createElementNS(SVG_NS, 'g');
    headG.setAttribute('id', 'flow-heads');
    var headYs = [];
    for (var h = 0; h < headDefs.length; h++) {
      var hy = headDefs[h].y;
      headYs.push(hy);
      if (headDefs[h].key !== 'aux') {
        var hidden64 = document.createElementNS(SVG_NS, 'circle');
        hidden64.setAttribute('cx', String(COLS.heads - 60));
        hidden64.setAttribute('cy', String(hy));
        hidden64.setAttribute('r', '5');
        hidden64.setAttribute('class','network-flow-node network-flow-node--head-hidden');
        hidden64.setAttribute('style','fill:#FFFFFF;stroke:#111111;stroke-width:2px;');
        var hgTitle = document.createElementNS(SVG_NS, 'title');
        hgTitle.textContent = headDefs[h].key+': MLP hidden '+(headDefs[h].key==='skills'?'16':'64')+' GELU';
        hidden64.appendChild(hgTitle);
        headG.appendChild(hidden64);

        var e64 = document.createElementNS(SVG_NS, 'path');
        var d64 = 'M'+ (COLS.embed + 18) +','+ midY +
          ' C'+ (COLS.embed + 55) +','+ midY +' '+ (COLS.heads - 90) +','+ hy +' '+ (COLS.heads - 65) +','+ hy;
        e64.setAttribute('d', d64);
        e64.setAttribute('class','network-flow-edge network-flow-edge--head network-flow-edge--head-hidden');
        e64.setAttribute('style','stroke:#111111;opacity:0.6;');
        edgeG.appendChild(e64);

        var hc = document.createElementNS(SVG_NS, 'circle');
        hc.setAttribute('cx', String(COLS.heads));
        hc.setAttribute('cy', String(hy));
        hc.setAttribute('r', '8');
        hc.setAttribute('class', 'network-flow-node network-flow-node--head');
        hc.setAttribute('data-head', String(h));
        hc.setAttribute('data-head-key', headDefs[h].key);
        hc.setAttribute('style','fill:#FFFFFF;stroke:#111111;stroke-width:2.5px;');
        var hTitle = document.createElementNS(SVG_NS, 'title');
        hTitle.textContent = headDefs[h].label + ' — final output layer';
        hc.appendChild(hTitle);
        headG.appendChild(hc);

        var eFinal = document.createElementNS(SVG_NS, 'line');
        eFinal.setAttribute('x1', String(COLS.heads-54)); eFinal.setAttribute('y1', String(hy));
        eFinal.setAttribute('x2', String(COLS.heads-8)); eFinal.setAttribute('y2', String(hy));
        eFinal.setAttribute('class','network-flow-edge network-flow-edge--head');
        eFinal.setAttribute('data-edge','head-'+h);
        eFinal.setAttribute('style','stroke:#111111;opacity:0.7;');
        edgeG.appendChild(eFinal);
      } else {
        var hc2 = document.createElementNS(SVG_NS, 'circle');
        hc2.setAttribute('cx', String(COLS.heads));
        hc2.setAttribute('cy', String(hy));
        hc2.setAttribute('r', '6');
        hc2.setAttribute('class', 'network-flow-node network-flow-node--head network-flow-node--aux');
        hc2.setAttribute('data-head', String(h));
        hc2.setAttribute('data-head-key', headDefs[h].key);
        hc2.setAttribute('style','fill:#FFFFFF;stroke:#111111;stroke-width:2px;');
        headG.appendChild(hc2);
        var eAux = document.createElementNS(SVG_NS, 'path');
        var dAux = 'M'+ (COLS.embed + 18) +','+ midY +
          ' C'+ (COLS.embed + 65) +','+ midY +' '+ (COLS.heads - 60) +','+ hy +' '+ (COLS.heads - 10) +','+ hy;
        eAux.setAttribute('d', dAux);
        eAux.setAttribute('class','network-flow-edge network-flow-edge--head');
        eAux.setAttribute('data-edge','head-'+h);
        eAux.setAttribute('style','stroke:#111111;opacity:0.6;');
        edgeG.appendChild(eAux);
      }

      var hl = document.createElementNS(SVG_NS, 'text');
      hl.setAttribute('x', String(COLS.heads + 18));
      hl.setAttribute('y', String(hy + 5));
      hl.setAttribute('class', 'network-flow-col-label');
      hl.setAttribute('text-anchor', 'start');
      hl.setAttribute('style','font-size:12px;font-weight:700;fill:#111111;letter-spacing:0.01em;');
      hl.textContent = headDefs[h].label;
      headG.appendChild(hl);
    }

    svg.appendChild(inputG);
    svg.appendChild(towerG);
    svg.appendChild(headG);
    svg.insertBefore(edgeG, inputG);

    svg.addEventListener('click', function (ev) {
      var node = nodeFromEl(ev.target);
      if (!node) return;
      state.selectedNode = node;
      state.hoverNode = null;
      state._hoverKey = null;
      syncAttributionFromNode(node, { scroll: true });
      updateFlowVisual();
      renderNodeInspector();
    });

    svg.addEventListener('mousemove', function (ev) {
      var node = nodeFromEl(ev.target);
      var key = node ? JSON.stringify(node) : null;
      if (key === state._hoverKey) return;
      state._hoverKey = key;
      state.hoverNode = node;
      applyTrace();
    });

    svg.addEventListener('mouseleave', function () {
      if (!state.hoverNode) return;
      state.hoverNode = null;
      state._hoverKey = null;
      applyTrace();
    });

    state.flowLayout = {
      cols: colsArr,
      COLS: COLS,
      inputTop: towerTop,
      inputSpan: towerSpan,
      nInputs: nTowers,
      towerYs: towerYs,
      headDefs: headDefs
    };
  }


  /* Point attribution at whatever was clicked so one gesture answers
     "what fed this / what did this drive". */
  function syncAttributionFromNode(node, opts) {
    if (!node || !attrHas()) return;
    opts = opts || {};
    var fams = (state.arch && state.arch.towerFamilies) || [];
    if (node.type === 'head_group' || node.type === 'head_item') {
      var key = node.group || node.key;
      if (attrTargetIndex(key) >= 0) state.attrTarget = key;
      state.attrFocusFamily = null;
      state.attrScope = 'player';
      if (node.type === 'head_item') {
        state.attrProbeItem = {
          group: key,
          index: node.index,
          label: headItemLabel(key, node.index)
        };
      } else {
        state.attrProbeItem = null;
      }
    } else if (node.type === 'tower') {
      state.attrFocusFamily = fams[node.index] || null;
      state.attrScope = 'player';
      state.attrProbeItem = null;
    } else if (node.type === 'input') {
      state.attrFocusFamily = fams[node.index] || null;
      state.attrScope = 'player';
      state.attrProbeItem = null;
    }
    renderAttribution();
    if (opts.scroll) {
      var card = $('network-attr-card');
      if (card && !card.hidden) {
        try { card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        catch (e) { /* older browsers */ }
      }
    }
  }

  function headItemLabel(group, index) {
    if (group === 'archetype') {
      var names = (state.arch && state.arch.gameArchetypes) || [];
      return names[index] || ('Cluster ' + index);
    }
    if (group === 'position') {
      return (['PG', 'SG', 'SF', 'PF', 'C'])[index] || ('Pos ' + index);
    }
    if (group === 'skills') {
      var sk = (state.arch && state.arch.skillKeys) || [];
      var k = sk[index];
      return (k && (SKILL_LABELS[k] || k)) || ('Skill ' + index);
    }
    if (group === 'next_profile') {
      var nk = (state.arch && state.arch.gameFeatureKeys) || [];
      var fk = nk[index];
      return (fk && state.featureLabel && state.featureLabel[fk]) || fk || ('Stat ' + index);
    }
    return group;
  }

  function attrProbeBannerHTML() {
    var probe = state.attrProbeItem;
    if (!probe) return '';
    var group = probe.group;
    var ask = ATTR_TARGET_ASKS[group] || group;
    var note;
    if (group === 'skills') {
      note = '<b>' + esc(probe.label) + '</b> is selected — bars explain the '
        + '<b>mean across all skill grades</b>, not this skill alone. '
        + 'Per-skill gradients are not shipped yet.';
    } else if (group === 'next_profile') {
      note = '<b>' + esc(probe.label) + '</b> is selected — bars explain the '
        + '<b>mean next-season forecast</b>, not this one stat. '
        + 'Per-stat gradients are not shipped yet.';
    } else if (group === 'archetype' || group === 'position') {
      var row = headRow(state.playerIdx);
      var predLabel = 'the predicted class';
      if (row && group === 'archetype') {
        var probs = softmax(Array.prototype.slice.call(row.subarray(0, state.nArch)));
        var best = 0;
        for (var i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
        var names = (state.arch && state.arch.gameArchetypes) || [];
        predLabel = names[best] || ('class #' + best);
        if (probe.index !== best) {
          note = '<b>' + esc(probe.label) + '</b> is selected, but bars explain the '
            + '<b>predicted</b> archetype (<b>' + esc(predLabel) + '</b>) — not this runner-up. '
            + 'Class-conditional gradients are not shipped yet.';
        } else {
          note = 'Bars explain <b>' + esc(ask) + '</b> '
            + '(predicted <b>' + esc(predLabel) + '</b>).';
        }
      } else if (row && group === 'position') {
        var off = state.nArch + state.nSkills;
        var pprobs = softmax(Array.prototype.slice.call(row.subarray(off, off + state.nPos)));
        var pbest = 0;
        for (var j = 1; j < pprobs.length; j++) if (pprobs[j] > pprobs[pbest]) pbest = j;
        var pnames = ['PG', 'SG', 'SF', 'PF', 'C'];
        predLabel = pnames[pbest] || ('pos #' + pbest);
        if (probe.index !== pbest) {
          note = '<b>' + esc(probe.label) + '</b> is selected, but bars explain the '
            + '<b>predicted</b> position (<b>' + esc(predLabel) + '</b>) — not this runner-up.';
        } else {
          note = 'Bars explain <b>' + esc(ask) + '</b> '
            + '(predicted <b>' + esc(predLabel) + '</b>).';
        }
      } else {
        note = 'Bars explain <b>' + esc(ask) + '</b>.';
      }
    } else {
      note = 'Bars explain <b>' + esc(ask) + '</b>.';
    }
    return '<p class="attr-probe-banner" role="note">' + note + '</p>';
  }



  // Which node currently drives the trace: transient hover wins, else the
  // locked click selection.
  function activeTraceNode() {
    return state.hoverNode || state.selectedNode || null;
  }

  // Full input <-> output chain for a node, as element selectors + a
  // plain-language summary. Every path runs through the fusion+embed spine.
  function traceForNode(node) {
    var fams = (state.arch && state.arch.towerFamilies) || [];
    var signals = inputSignalsForPlayer(state.playerIdx);
    var nShown = Math.min(MAX_INPUT_NODES, signals.length);
    var headDefs = (state.flowLayout && state.flowLayout.headDefs) || [];
    var nodeSel = [];
    var edgeSel = ['emb-main'];
    var origin = null;
    var summary = '';

    function addInput(i) {
      nodeSel.push('[data-input="' + i + '"]');
      nodeSel.push('[data-input-label="' + i + '"]');
      nodeSel.push('[data-input-value="' + i + '"]');
    }
    function addSpine() { nodeSel.push('#flow-fusion'); nodeSel.push('#flow-embed'); }
    function addAllHeads() {
      headDefs.forEach(function (_, hi) {
        nodeSel.push('[data-head="' + hi + '"]');
        edgeSel.push('head-' + hi);
      });
    }
    function inputForTower(t) {
      // Truthful 1:1 mapping — input t is that family's input
      if (t >=0 && t < fams.length) return t;
      for (var i = 0; i < nShown; i++) {
        if (signals[i] && signals[i].key === fams[t]) return i;
      }
      return -1;
    }

    if (node.type === 'input') {
      var i = node.index;
      // Truthful 1:1: input i is tower i (same family)
      var t = i;
      var famLabel = fams[i] || '';
      // If signals sorted still carries different fam at i, use actual family at i for label
      origin = '[data-input="' + i + '"]';
      addInput(i);
      if (t >= 0 && t < fams.length) { nodeSel.push('[data-tower="' + t + '"]'); edgeSel.push('in-' + i); edgeSel.push('fuse-' + t); }
      addSpine();
      addAllHeads();
      summary = capWords((famLabel||'input '+(i+1)).replace(/_/g,' ')) + ' → Tower ' + (t + 1) +
        ' → fusion (544+12=556→128→48 L2) → embedding → all ' + headDefs.length + ' heads';
    } else if (node.type === 'tower') {
      var t2 = node.index;
      origin = '[data-tower="' + t2 + '"]';
      nodeSel.push('[data-tower="' + t2 + '"]');
      edgeSel.push('fuse-' + t2);
      var iu = inputForTower(t2);
      if (iu >= 0) { addInput(iu); edgeSel.push('in-' + iu); }
      addSpine();
      addAllHeads();
      summary = capWords((fams[t2] || 'tower').replace(/_/g, ' ')) +
        ' tower → fusion → embedding → all ' + headDefs.length + ' heads';
    } else {
      var key = node.group || node.key;
      var hIdx = headKeyToIndex(key);
      origin = '[data-head-key="' + key + '"]';
      if (hIdx >= 0) { nodeSel.push('[data-head="' + hIdx + '"]'); edgeSel.push('head-' + hIdx); }
      addSpine();
      // Walk back along CAUSAL influence on this head, not input magnitude.
      // ('aux' has no exported Jacobian target; fall back to the embedding.)
      var inf = towerInfluence(state.playerIdx, key) ||
        towerInfluence(state.playerIdx, 'embedding');
      var top = fams.map(function (fam, ix) {
        return { ix: ix, s: inf ? (inf[fam] != null ? inf[fam] : 0)
                                : familyWeight(fam, signals) };
      }).sort(function (a, b) { return b.s - a.s; }).slice(0, 5);
      top.forEach(function (tp) {
        nodeSel.push('[data-tower="' + tp.ix + '"]');
        edgeSel.push('fuse-' + tp.ix);
        var iw = inputForTower(tp.ix);
        if (iw >= 0) { addInput(iw); edgeSel.push('in-' + iw); }
      });
      var label = key;
      for (var d = 0; d < headDefs.length; d++) {
        if (headDefs[d].key === key) { label = headDefs[d].label; break; }
      }
      summary = label + ' ← embedding ← fusion ← top ' + top.length + ' towers ← their inputs';
    }
    return { nodeSel: nodeSel, edgeSel: edgeSel, origin: origin, summary: summary };
  }

  // Paint the active trace: brighten its chain, dim everything else
  // (line-of-sight), surface tower labels along the path, mark the origin.
  function applyTrace() {
    var host = $('network-flow-svg');
    if (!host) return;
    var svg = host.querySelector('svg');
    if (!svg) return;
    var statusEl = $('network-trace-status');
    var clearBtn = $('network-trace-clear');

    svg.querySelectorAll('.on-path').forEach(function (el) { el.classList.remove('on-path'); });
    svg.querySelectorAll('.trace-origin').forEach(function (el) { el.classList.remove('trace-origin'); });
    svg.querySelectorAll('.network-flow-tower-label').forEach(function (el) {
      el.classList.remove('is-shown', 'on-path');
    });

    // During the step animation, stand down so the full layer-by-layer
    // lighting reads without the trace dimming everything off one path.
    var node = state.playing ? null : activeTraceNode();
    if (!node || state.playerIdx < 0) {
      svg.classList.remove('is-tracing');
      if (statusEl) {
        statusEl.textContent = 'Click a node to see what fed it and what it drove.';
        statusEl.classList.remove('is-tracing');
      }
      if (clearBtn) clearBtn.hidden = !state.selectedNode;
      return;
    }

    var tr = traceForNode(node);
    svg.classList.add('is-tracing');
    tr.nodeSel.forEach(function (sel) {
      svg.querySelectorAll(sel).forEach(function (el) { el.classList.add('on-path'); });
      var m = sel.match(/data-tower="(\d+)"/);
      if (m) {
        var lbl = svg.querySelector('.network-flow-tower-label[data-tower-label="' + m[1] + '"]');
        if (lbl) lbl.classList.add('is-shown', 'on-path');
      }
    });
    tr.edgeSel.forEach(function (id) {
      var e = svg.querySelector('[data-edge="' + id + '"]');
      if (e) e.classList.add('on-path');
    });
    // Light the full residual row (cat → B1 → B2) for every on-path tower.
    svg.querySelectorAll('[data-tower].on-path').forEach(function (tw) {
      var ri = tw.getAttribute('data-tower');
      if (ri == null) return;
      svg.querySelectorAll('[data-tower-row="' + ri + '"]').forEach(function (el) {
        el.classList.add('on-path');
      });
    });
    if (tr.origin) {
      var o = svg.querySelector(tr.origin);
      if (o) o.classList.add('trace-origin');
    }
    if (statusEl) {
      statusEl.textContent = tr.summary;
      statusEl.classList.add('is-tracing');
    }
    if (clearBtn) clearBtn.hidden = false;
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

    svg.setAttribute('data-step', String(step));
    svg.classList.toggle('is-playing', !!state.playing);

    svg.querySelectorAll('.network-flow-node').forEach(function (node) {
      node.classList.remove('is-active', 'is-lit', 'is-selected');
    });
    svg.querySelectorAll('.network-flow-edge').forEach(function (edge) {
      edge.classList.remove('is-active', 'is-lit');
    });

    if (step >= 0) {
      // Truthful: input nodes are fixed to towerFamilies order (1:1 input→tower), not top-N sorted.
      // Opacity and value come from actual coverage/score for that family.
      var fams = state.arch.towerFamilies || [];
      svg.querySelectorAll('.network-flow-node--input').forEach(function (n) {
        n.classList.add(step === 0 ? 'is-active' : 'is-lit');
      });
      svg.querySelectorAll('[data-input-value]').forEach(function (n, i) {
        var fam = fams[i] || '';
        var s = familyWeight(fam, signals);
        n.textContent = fmtPredScore(s * 100) + '%';
      });
      svg.querySelectorAll('[data-input-label]').forEach(function (n, i) {
        var fam = fams[i] || '';
        var label = fam ? fam.replace(/_/g,' ') : ('input ' + (i + 1));
        // Find features for tooltip from familyFeatures
        var feats = state.familyFeatures && state.familyFeatures[fam] ? state.familyFeatures[fam] : [];
        n.textContent = label;
        n.setAttribute('title', feats.length ? ('Features ('+feats.length+'): ' + feats.join(', ')) : '');
      });
      svg.querySelectorAll('.network-flow-node--input').forEach(function (n, i) {
        var fam = (state.arch.towerFamilies || [])[i] || '';
        var s = familyWeight(fam, signals);
        n.style.opacity = String(0.35 + s * 0.65);
      });
      // Also tint tower sub-nodes (B1 hidden etc) by same score + causal influence
      var embInf = towerInfluence(idx, 'embedding');
      svg.querySelectorAll('.network-flow-node--tower-sub').forEach(function (n) {
        var m = (n.getAttribute('data-tower-sub') || '').match(/(\d+)$/);
        // fallback: parse from id not reliable, use index from DOM order roughly
        // Instead opacity by tower influence
        var ti = -1;
        var attr = n.getAttribute('data-tower-sub');
        if (attr) {
          var mm = attr.match(/-(\d+)$/);
          if (mm) ti = parseInt(mm[1],10);
        }
        var fam2 = fams[ti] || '';
        var s2 = embInf ? (embInf[fam2] != null ? embInf[fam2] : 0) : familyWeight(fam2, signals);
        n.style.opacity = String(0.45 + s2*0.55);
      });
    }
    if (step >= 1) {
      svg.querySelectorAll('.network-flow-node--tower').forEach(function (n, i) {
        var h = heights ? heights[i] : 0.5;
        // Truthful final tower out is 32-d, radius scales with causal influence (embedding) not raw input size
        n.setAttribute('r', String(5 + h * 4));
        n.classList.add(step === 1 ? 'is-active' : 'is-lit');
      });
      // In-edges are now static 1:1 input_i → tower_i (truthful), just tint by coverage
      svg.querySelectorAll('[data-edge^="in-"]').forEach(function (e) {
        var ix = parseInt((e.getAttribute('data-edge') || 'in-0').split('-')[1], 10);
        var fams = state.arch.towerFamilies || [];
        var fam = fams[ix] || '';
        var s = familyWeight(fam, signals);
        e.style.strokeWidth = String(0.7 + s * 1.6);
        e.style.opacity = String(0.25 + s * 0.65);
        e.classList.add(step === 1 ? 'is-active' : 'is-lit');
      });
      // Internal tower edges light up too
      svg.querySelectorAll('.network-flow-edge--tower-internal').forEach(function (e) {
        e.classList.add(step === 1 ? 'is-active' : 'is-lit');
        e.style.opacity = '0.35';
      });
      svg.querySelectorAll('.network-flow-edge--skip').forEach(function (e) {
        e.classList.add(step === 1 ? 'is-active' : 'is-lit');
      });
    }
    if (step >= 2) {
      // Edge weight = |d(embedding)/d(tower)| (causal), not input magnitude.
      var embInf = towerInfluence(idx, 'embedding');
      svg.querySelectorAll('[data-edge^="fuse-"]').forEach(function (e) {
        var idxFuse = parseInt((e.getAttribute('data-edge') || 'fuse-0').split('-')[1], 10);
        var fams = state.arch.towerFamilies || [];
        var fam = fams[idxFuse] || '';
        var s = embInf ? (embInf[fam] != null ? embInf[fam] : 0) : familyWeight(fam, signals);
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
      // Prefer causal sensitivity of each head to the embedding; fall back to
      // prediction confidence (headStrength) when no Jacobian is loaded.
      var hInf = headInfluence(idx);
      var headDefs = (state.flowLayout && state.flowLayout.headDefs) || [];
      svg.querySelectorAll('[data-edge^="head-"]').forEach(function (e, i) {
        var s = headStrength[i] != null ? headStrength[i] : 0.5;
        if (hInf && headDefs[i] && hInf[headDefs[i].key] != null) {
          s = hInf[headDefs[i].key];
        }
        e.style.strokeWidth = String(0.8 + s * 2.8);
        e.style.opacity = String(0.25 + s * 0.75);
        e.classList.add('is-active');
      });
    }

    // Locked selection chrome (hover uses .trace-origin during applyTrace).
    if (state.selectedNode && !state.playing) {
      var sel = state.selectedNode;
      var selEl = null;
      if (sel.type === 'input') {
        selEl = svg.querySelector('.network-flow-node--input[data-input="' + sel.index + '"]');
      } else if (sel.type === 'tower') {
        selEl = svg.querySelector('.network-flow-node--tower[data-tower="' + sel.index + '"]');
      } else {
        var hk = sel.group || sel.key;
        if (hk) selEl = svg.querySelector('.network-flow-node--head[data-head-key="' + hk + '"]');
      }
      if (selEl) selEl.classList.add('is-selected');
    }

    // Line-of-sight trace overlay (hover-preview or locked selection):
    // brightens the full input <-> output chain and dims the rest.
    applyTrace();
  }

  function renderOutputs() {
    var archHost = $('network-arch-out');
    var posHost = $('network-pos-out');
    var skillHost = $('network-skill-out');
    var nextHost = $('network-next-out');
    var row = headRow(state.playerIdx);
    if (!archHost || !skillHost || !nextHost || !row || !state.arch) {
      if (archHost) archHost.innerHTML = '<p class="drift-loading">Pick a player.</p>';
      if (posHost) posHost.innerHTML = '';
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
        '<span class="network-arch-row__swatch" style="background:' + clusterColor(clsIdx) + '"></span>' +
        '<span class="network-arch-row__name">' + esc(nm) + '</span>' +
        '<span class="network-arch-row__track"><span class="network-arch-row__fill" style="width:' +
        Math.max(1, Math.min(99.9, p * 100)) + '%;background:' + clusterColor(clsIdx) + '"></span></span>' +
        '<span class="network-arch-row__pct">' + pct + '%</span></div>');
    }
    archHost.innerHTML =
      '<div class="network-out-subhead">All possible archetypes (' + state.nArch + ' classes)</div>' +
      archRows.join('');

    if (posHost) {
      var offSkill0 = state.nArch;
      var offPos0 = offSkill0 + state.nSkills;
      var posLog = Array.prototype.slice.call(row, offPos0, offPos0 + state.nPos);
      var posProbs = softmax(posLog);
      var posNames = ['PG', 'SG', 'SF', 'PF', 'C'];
      var posRanked = [];
      for (var pi = 0; pi < state.nPos; pi++) posRanked.push({ idx: pi, p: posProbs[pi] || 0 });
      posRanked.sort(function (a, b) { return b.p - a.p; });
      var bestPos = posRanked.length ? posRanked[0].idx : 0;
      posHost.innerHTML =
        '<div class="network-out-subhead">Softmax over five positions</div>' +
        posRanked.map(function (pr) {
          var selPos = state.selectedNode && state.selectedNode.type === 'head_item' &&
            (state.selectedNode.group || state.selectedNode.key) === 'position' &&
            state.selectedNode.index === pr.idx;
          var pn = posNames[pr.idx] || ('P' + pr.idx);
          return '<div class="network-arch-row' + (pr.idx === bestPos ? ' is-top' : '') +
            (selPos ? ' is-selected' : '') +
            '" data-head-select-group="position" data-head-select-idx="' + pr.idx + '">' +
            '<span class="network-arch-row__idx">' + esc(pn) + '</span>' +
            '<span class="network-arch-row__swatch" style="background:var(--ink-muted)"></span>' +
            '<span class="network-arch-row__name">' + esc(pn) + '</span>' +
            '<span class="network-arch-row__track"><span class="network-arch-row__fill" style="width:' +
            Math.max(1, Math.min(99.9, pr.p * 100)) + '%"></span></span>' +
            '<span class="network-arch-row__pct">' + fmtPredScore(pr.p * 100) + '%</span></div>';
        }).join('');
    }

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
    var season = state.players[state.playerIdx] && state.players[state.playerIdx].season;
    var nextLbl = nextSeasonLabel(season);
    var anyReal = nextPairs.some(function (n) { return !!realFromZ(n.key, n.z, season); });
    var futureUnknown = anyReal && !seasonNorm(nextLbl, 'PTS');

    var intro = anyReal
      ? 'Each number is what the model expects him to average <b>per 100 possessions</b> '
        + (futureUnknown
            ? 'next season (' + esc(nextLbl || '') + ' has not been played, so the league baseline is his own season). '
            : 'in ' + esc(nextLbl || 'the next season') + '. ')
        + 'The league average is shown beside it, so you can see how far above or below it he lands. '
        + 'Shooting percentages are shown as a league percentile instead — they are smoothed before the '
        + 'model sees them, so a raw rate would be made up.'
      : 'Numbers are vs the league average that season: <b>+</b> is above average, <b>−</b> is below, '
        + '<b>0</b> is dead average. “±1” ≈ better than about two-thirds of the league.';

    nextHost.innerHTML =
      '<div class="network-out-subhead">Projected next season (' + nextPairs.length + ' stats)</div>' +
      '<p class="network-insight-note">' + intro + '</p>' +
      '<div class="network-skill-grid">' + nextPairs.map(function (n) {
        var w = Math.max(1, Math.min(99.9, Math.abs(n.z) / 3 * 100));
        var sign = n.z > 0.005 ? '+' : '';
        var zText = sign + (Math.round(n.z * 100) / 100).toFixed(2);
        var real = realFromZ(n.key, n.z, season);
        var pct = real ? null : percentileOfZ(n.z, n.key);

        var valText, subText, tip;
        if (real) {
          valText = fmtReal(real.value);
          subText = 'league avg ' + fmtReal(real.leagueAvg) + ' per 100';
          tip = n.label + ': projected ' + valText + ' per 100 possessions'
            + (real.projected ? ' in ' + real.baseline : ' (baseline ' + real.baseline + ')')
            + '. League average ' + fmtReal(real.leagueAvg) + '. That is ' + zText
            + ' standard deviations from average.';
        } else if (pct != null) {
          valText = ordinal(pct);
          subText = 'league percentile';
          tip = n.label + ': projected around the ' + ordinal(pct) + ' percentile of the league. '
            + 'This stat is smoothed before the model sees it, so we do not print a raw rate.';
        } else {
          valText = zText;
          subText = 'vs league average';
          tip = n.label + ': projected ' + zText + ' vs league average next season.';
        }
        var ciText = n.band
          ? (Math.round(n.band.lo * 100) / 100).toFixed(2) + ' to ' + (Math.round(n.band.hi * 100) / 100).toFixed(2)
          : 'n/a';
        var selNext = state.selectedNode && state.selectedNode.type === 'head_item' &&
          (state.selectedNode.group || state.selectedNode.key) === 'next_profile' &&
          state.selectedNode.index === n.idx;
        return '<div class="network-skill-row' + (selNext ? ' is-selected' : '') + '"' +
          ' data-head-select-group="next_profile" data-head-select-idx="' + n.idx + '"' +
          ' title="' + esc(tip) + ' Similar players usually land between ' + esc(ciText) + ' (in std devs).">' +
          '<span class="network-skill-row__meta">' +
            '<span class="network-skill-row__name">' + esc(n.label) + '</span>' +
            '<span class="network-skill-row__key">' + esc(subText) + '</span>' +
          '</span>' +
          '<span class="network-skill-row__track"><span class="network-skill-row__fill" style="width:' + w + '%"></span></span>' +
          '<span class="network-skill-row__val">' + esc(valText) + '</span></div>';
      }).join('') + '</div>';
  }

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* Inspector cell for a next-profile row: real per-100 number when we can
     invert it exactly, else a percentile, else the raw z as a last resort. */
  function nextProfileDisplay(r) {
    var season = state.players[state.playerIdx] && state.players[state.playerIdx].season;
    var key = r.key || ((state.arch && state.arch.gameFeatureKeys) || [])[r.idx];
    var real = key ? realFromZ(key, r.value, season) : null;
    if (real) return esc(fmtReal(real.value)) + '<span class="unit"> /100</span>';
    var pct = key ? percentileOfZ(r.value, key) : null;
    if (pct != null) return esc(ordinal(pct));
    return (Math.round(r.value * 100) / 100).toFixed(2) + 'z';
  }

  function ensureMapCanvasSize(canvas, parent, force) {
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(280, (parent && parent.clientWidth) || 400);
    // Slightly taller stage so the zoomed cloud has room to breathe.
    var h = Math.min(Math.round(w * 0.74), 640);
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

    // Soft radial vignette — depth without competing with archetype hues.
    var vig = ctx.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.12,
      w * 0.5, h * 0.48, Math.max(w, h) * 0.72);
    vig.addColorStop(0, 'rgba(28,27,24,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vig;
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
      var alpha = 0.14 + 0.42 * (1 / (1 + pt.depth * 0.14));
      var p = state.players[pt.i];
      var col = clusterColor(p && p.c != null ? p.c : -1);
      var r = pt.i === state.playerIdx ? 0 : (1.15 + 0.55 * (1 / (1 + pt.depth * 0.2)));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, r, 0, Math.PI * 2);
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
      ctx.globalAlpha = 0.38;
      ctx.strokeStyle = '#f3a26f';
      ctx.lineWidth = 1.15;
      neighbors.forEach(function (n) {
        var nc = coords[n.idx];
        if (!nc) return;
        var np = project3D(nc[0], nc[1], nc[2], w, h, cam);
        ctx.beginPath();
        ctx.moveTo(ap.sx, ap.sy);
        ctx.lineTo(np.sx, np.sy);
        ctx.stroke();
      });
      var pulse = state.reduceMotion ? 0.35 : (0.5 + 0.5 * Math.sin(Date.now() / 900));
      ctx.globalAlpha = 0.22 + pulse * 0.18;
      ctx.fillStyle = ORANGE;
      ctx.beginPath();
      ctx.arc(ap.sx, ap.sy, 16 + pulse * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(ap.sx, ap.sy, 9 + pulse * 2.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ORANGE;
      ctx.beginPath();
      ctx.arc(ap.sx, ap.sy, 5.2, 0, Math.PI * 2);
      ctx.fill();

      // Selected player label — readability at the zoomed framing.
      var sel = state.players[state.playerIdx];
      if (sel) {
        var label = sel.name + ' · ' + sel.season;
        ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
        var tw = ctx.measureText(label).width;
        var lx = Math.max(10, Math.min(w - tw - 18, ap.sx + 14));
        var ly = Math.max(28, Math.min(h - 12, ap.sy - 14));
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(lx - 6, ly - 13, tw + 12, 20);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#f0eee6';
        ctx.fillText(label, lx, ly);
      }
    }

    // Hover readout — name + archetype (never color alone).
    if (state.mapHoverIdx != null && state.mapHoverIdx !== state.playerIdx &&
        coords[state.mapHoverIdx]) {
      var hp = state.players[state.mapHoverIdx];
      var hc = coords[state.mapHoverIdx];
      var hpr = project3D(hc[0], hc[1], hc[2], w, h, cam);
      var archNames = (state.arch && state.arch.gameArchetypes) || [];
      var archNm = hp && typeof hp.c === 'number' ? (archNames[hp.c] || ('Cluster ' + hp.c)) : '';
      var hLabel = hp ? (hp.name + ' · ' + hp.season + (archNm ? ' · ' + archNm : '')) : '';
      if (hLabel) {
        ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
        var htw = ctx.measureText(hLabel).width;
        var hlx = Math.max(10, Math.min(w - htw - 18, hpr.sx + 12));
        var hly = Math.max(28, Math.min(h - 12, hpr.sy - 12));
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(hlx - 6, hly - 12, htw + 12, 18);
        ctx.beginPath();
        ctx.arc(hpr.sx, hpr.sy, 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#111111';
        ctx.fillText(hLabel, hlx, hly);
      }
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
    var flowCard = document.querySelector('.network-flow-card');
    if (flowCard) {
      flowCard.classList.toggle('is-heads-step', state.step >= 4);
      flowCard.classList.toggle('is-flow-playing', !!state.playing);
    }
    var flowHost = $('network-flow-svg');
    if (flowHost) {
      flowHost.classList.toggle('is-animating', !state.reduceMotion);
    }
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
    renderAttribution();
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

  function bindTraceClear() {
    var btn = $('network-trace-clear');
    if (!btn) return;
    btn.addEventListener('click', function () {
      state.selectedNode = null;
      state.hoverNode = null;
      state._hoverKey = null;
      state.attrFocusFamily = null;
      state.attrProbeItem = null;
      updateFlowVisual();
      renderNodeInspector();
      renderAttribution();
      renderOutputs();
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
      syncAttributionFromNode(state.selectedNode, { scroll: true });
      renderNodeInspector();
      updateFlowVisual();
      renderOutputs();
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
      syncAttributionFromNode(state.selectedNode, { scroll: true });
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
      if (state.drag) {
        state.cam.yaw = state.drag.yaw + (e.clientX - state.drag.x) * 0.008;
        state.cam.pitch = Math.max(-0.6, Math.min(0.6,
          state.drag.pitch + (e.clientY - state.drag.y) * 0.008));
        drawMap(false);
        return;
      }
      // Hover readout: nearest projected point (secondary encoding for archetype).
      if (!state.map || !state.map.coords) return;
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var w = state.mapSize.w || rect.width;
      var h = state.mapSize.h || rect.height;
      var best = -1;
      var bestD = 14 * 14;
      var coords = state.map.coords;
      var stride = Math.max(1, Math.floor(coords.length / 2500));
      for (var i = 0; i < coords.length; i += stride) {
        var pr = project3D(coords[i][0], coords[i][1], coords[i][2], w, h, state.cam);
        var dx = pr.sx - mx;
        var dy = pr.sy - my;
        var d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = i; }
      }
      if (best !== state.mapHoverIdx) {
        state.mapHoverIdx = best;
        drawMap(false);
      }
    });
    canvas.addEventListener('pointerleave', function () {
      if (state.mapHoverIdx == null) return;
      state.mapHoverIdx = null;
      drawMap(false);
    });
    canvas.addEventListener('pointerup', function () { state.drag = null; });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      state.cam.zoom = Math.max(0.85, Math.min(2.8, state.cam.zoom - e.deltaY * 0.001));
      drawMap(false);
    }, { passive: false });
    window.addEventListener('resize', function () { drawMap(true); });

    var insights = $('network-map-insights');
    if (insights) {
      insights.addEventListener('click', function (ev) {
        var btn = ev.target.closest('[data-neighbor-idx]');
        if (!btn) return;
        var ni = parseInt(btn.getAttribute('data-neighbor-idx'), 10);
        if (Number.isFinite(ni)) setPlayer(ni, { keepCompare: true });
      });
    }
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

  /* ---- Attribution rendering ----------------------------------------------
     Forms are chosen by the question, per docs/NETWORK_PAGE_VIZ_PLAN.md:
       "how much does each tower drive this head"  -> ranked bars, one hue
       "which inputs pushed it up vs down"         -> diverging bars, zero-anchored
       "which towers drive which heads, overall"   -> heatmap, one sequential hue
       "how confident is this head"                -> stat tile, with its baseline

     Bars are labelled as a SHARE of the strongest contribution in the same
     target, never as a raw value. Two reasons: the site never shows a user more
     than two decimals, and raw `skills` contributions are ~20x smaller than
     `archetype`'s (the target is a mean over 18 heads), so raw numbers would
     read 0.00 down the column. Share is what the bar length already encodes. */

  var ATTR_TARGET_LABELS = {
    archetype: 'Archetype',
    position: 'Position',
    skills: 'Skill grades',
    next_profile: 'Next season'
  };

  var ATTR_TARGET_ASKS = {
    archetype: 'the archetype it picked',
    position: 'the position it picked',
    skills: 'its average skill grade',
    next_profile: 'its next-season forecast'
  };

  function attrShare(value, denom) {
    if (!denom) return 0;
    return Math.max(-100, Math.min(100, (value / denom) * 100));
  }

  function fmtShare(pct) {
    var r = Math.round(pct);
    return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r) + '%';
  }

  /* Stat tile — only where a confidence number actually exists. The regression
     heads have no class probability, and inventing one would be a lie. */
  function attrTileHTML(target) {
    var row = headRow(state.playerIdx);
    if (!row) return '';
    var probs = null;
    var baseline = 0;
    if (target === 'archetype') {
      probs = softmax(Array.prototype.slice.call(row.subarray(0, state.nArch)));
      baseline = 1 / state.nArch;
    } else if (target === 'position') {
      var off = state.nArch + state.nSkills;
      probs = softmax(Array.prototype.slice.call(row.subarray(off, off + state.nPos)));
      baseline = 1 / state.nPos;
    }
    if (!probs) {
      return '<div class="attr-tile attr-tile--none">' +
        '<div class="attr-tile__label">Confidence</div>' +
        '<p class="attr-tile__note">Not a classifier &mdash; this head predicts numbers, ' +
        'so it has no &ldquo;how sure&rdquo; score.</p></div>';
    }
    var top = Math.max.apply(null, probs);
    return '<div class="attr-tile">' +
      '<div class="attr-tile__label">Confidence in ' + esc(ATTR_TARGET_ASKS[target]) + '</div>' +
      '<div class="attr-tile__value">' + fmtPredScore(top * 100) + '%</div>' +
      '<div class="attr-tile__baseline">Guessing at random would score ' +
        fmtPredScore(baseline * 100) + '%</div></div>';
  }

  /* Ranked horizontal bars, single hue. Not 17 colors: length carries the
     value, and a value-ramp across nominal categories is an anti-pattern. */
  function attrTowersHTML(target) {
    var rows = state.attrScope === 'population'
      ? towerPopulationRanking(target, 6)
      : towerRanking(state.playerIdx, target, 6);
    if (!rows || !rows.length) {
      return '<p class="drift-loading">Tower influence unavailable.</p>';
    }
    // Denominator is the largest bar SHOWN, which may be "Other" when the tail
    // outweighs any single tower. Labelling it "% of the strongest tower" would
    // then be false, so the copy says what it measures.
    var denom = rows.reduce(function (m, r) { return Math.max(m, r.value); }, 0);
    var body = rows.map(function (r, i) {
      var pct = attrShare(r.value, denom);
      var cls = 'attr-bar__fill' + (r.other ? ' attr-bar__fill--other' : '');
      var num = (i === 0 || r.other)
        ? '<span class="attr-bar__num">' + Math.round(pct) + '%</span>' : '';
      return '<li class="attr-bar" title="' + esc(r.label) + ': ' + Math.round(pct) +
          '% of the largest bar shown">' +
        '<span class="attr-bar__label">' + esc(r.label) + '</span>' +
        '<span class="attr-bar__track"><span class="' + cls +
          '" style="width:' + Math.max(1, pct).toFixed(1) + '%"></span></span>' +
        num + '</li>';
    }).join('');
    return '<ol class="attr-bars">' + body + '</ol>';
  }

  function towerPopulationRanking(target, topN) {
    if (!state.jac || !state.jac.populationInfluence) return null;
    var pop = state.jac.populationInfluence[target];
    if (!pop) return null;
    var rows = Object.keys(pop).map(function (f) {
      return { key: f, label: capWords(f.replace(/_/g, ' ')), value: pop[f] };
    });
    rows.sort(function (a, b) { return b.value - a.value; });
    var head = rows.slice(0, topN);
    var rest = rows.slice(topN);
    if (rest.length) {
      head.push({
        key: '__other', other: true, label: 'Other (' + rest.length + ')',
        value: rest.reduce(function (a, r) { return a + r.value; }, 0)
      });
    }
    return head;
  }

  /* Diverging bars anchored at zero: sign is the whole question, so a
     sequential ramp would hide it. Neutral gray midpoint, never a hue. */
  function attrFeaturesHTML(target) {
    var rows = state.attrScope === 'population'
      ? attrPopulation(target, state.attrFocusFamily ? 64 : 8)
      : attrTopK(state.playerIdx, target);
    var usedPopulationFallback = false;
    if (rows && state.attrFocusFamily) {
      var feats = (state.familyFeatures && state.familyFeatures[state.attrFocusFamily]) || [];
      var set = {};
      feats.forEach(function (f) { set[f] = 1; });
      rows = rows.filter(function (r) { return set[r.key]; });
      if (state.attrScope === 'population') rows = rows.slice(0, 12);
    }
    // Family focus often misses the player top-8 — fall back to population
    // signed means for that family's members so the panel never looks empty.
    if ((!rows || !rows.length) && state.attrFocusFamily && state.attrScope === 'player') {
      var pop = attrPopulation(target, 64);
      var famFeats = (state.familyFeatures && state.familyFeatures[state.attrFocusFamily]) || [];
      var famSet = {};
      famFeats.forEach(function (f) { famSet[f] = 1; });
      if (pop) {
        rows = pop.filter(function (r) { return famSet[r.key]; }).slice(0, 12);
        usedPopulationFallback = !!(rows && rows.length);
      }
    }
    if (!rows || !rows.length) {
      if (state.attrFocusFamily) {
        var inf = towerInfluence(state.playerIdx, target);
        var share = inf && inf[state.attrFocusFamily] != null
          ? fmtPredScore(inf[state.attrFocusFamily] * 100) + '%'
          : 'n/a';
        return '<p class="attr-family-fallback" role="note">This family was not among the top feature '
          + 'drivers of ' + esc(ATTR_TARGET_ASKS[target]) + ' for this player-season, but its tower '
          + 'still carries <b>' + esc(share) + '</b> of causal influence on that head '
          + '(Jacobian tower share). Switch to <b>All players</b> to see the population pattern.</p>';
      }
      return '<p class="drift-loading">Feature attribution unavailable.</p>';
    }
    var denom = rows.reduce(function (m, r) { return Math.max(m, Math.abs(r.value)); }, 0);
    var strongest = 0;
    rows.forEach(function (r, i) { if (Math.abs(r.value) > Math.abs(rows[strongest].value)) strongest = i; });
    var mostNegative = -1;
    rows.forEach(function (r, i) {
      if (r.value < 0 && (mostNegative < 0 || r.value < rows[mostNegative].value)) mostNegative = i;
    });

    var body = rows.map(function (r, i) {
      if (r.masked) {
        return '<li class="attr-div attr-div--masked">' +
          '<span class="attr-div__label">' + esc(r.label) + '</span>' +
          '<span class="attr-div__masked" role="note">' +
            '<span class="attr-div__icon" aria-hidden="true">⊘</span> not tracked this era</span></li>';
      }
      var pct = attrShare(r.value, denom);
      var up = pct >= 0;
      var w = Math.min(100, Math.abs(pct));
      var num = (i === strongest || i === mostNegative)
        ? '<span class="attr-div__num">' + fmtShare(pct) + '</span>' : '';
      return '<li class="attr-div" title="' + esc(r.label) + ': pushed ' +
          (up ? 'up' : 'down') + ', ' + fmtShare(pct) + ' of the strongest push">' +
        '<span class="attr-div__label">' + esc(r.label) + '</span>' +
        '<span class="attr-div__track">' +
          '<span class="attr-div__half attr-div__half--neg">' +
            (up ? '' : '<span class="attr-div__fill attr-div__fill--neg" style="width:' + w.toFixed(1) + '%"></span>') +
          '</span>' +
          '<span class="attr-div__zero" aria-hidden="true"></span>' +
          '<span class="attr-div__half attr-div__half--pos">' +
            (up ? '<span class="attr-div__fill attr-div__fill--pos" style="width:' + w.toFixed(1) + '%"></span>' : '') +
          '</span>' +
        '</span>' + num + '</li>';
    }).join('');

    var note = usedPopulationFallback
      ? '<p class="attr-family-fallback" role="note">None of this family&rsquo;s stats were in this '
        + 'player&rsquo;s top drivers — showing the <b>population</b> signed pattern for the family instead.</p>'
      : '';

    return note + '<ul class="attr-divs">' + body + '</ul>' +
      '<p class="attr-axis"><span>← pushed ' + esc(ATTR_TARGET_ASKS[target]) + ' down</span>' +
      '<span>pushed it up →</span></p>';
  }

  /* When a tower/input is locked, show this family's causal share on every
     decode head — the forward multi-head view Phase 3 promised. */
  function attrHeadsMultiplesHTML(family) {
    if (!family || !jacHas() || state.playerIdx < 0) return '';
    var targets = (state.attr && state.attr.targets) ||
      ['archetype', 'position', 'skills', 'next_profile'];
    var cards = targets.map(function (t) {
      var inf = towerInfluence(state.playerIdx, t);
      var share = inf && inf[family] != null ? inf[family] : 0;
      var pct = Math.round(share * 100);
      var on = t === state.attrTarget;
      return '<button type="button" class="attr-multi__card' + (on ? ' is-active' : '') +
        '" data-attr-target="' + esc(t) + '" title="Switch attribution to ' +
        esc(ATTR_TARGET_LABELS[t] || t) + '">' +
        '<span class="attr-multi__label">' + esc(ATTR_TARGET_LABELS[t] || t) + '</span>' +
        '<span class="attr-multi__track"><span class="attr-multi__fill" style="width:' +
        Math.max(2, Math.min(100, pct)) + '%"></span></span>' +
        '<span class="attr-multi__pct">' + pct + '%</span></button>';
    }).join('');
    return '<div class="attr-multi" aria-label="This family across decode heads">' +
      '<p class="viz-panel__label">This family&rsquo;s share of each head</p>' +
      '<div class="attr-multi__grid">' + cards + '</div>' +
      '<p class="attr-multi__note">Jacobian tower share — how much this family moved each head '
      + 'for this player-season. Click a card to open that head&rsquo;s feature bars.</p></div>';
  }

  /* Population heatmap, 18 towers x 5 targets. A node-link here would be 90
     crossing edges; sequential one-hue cells answer it at a glance. */
  function attrHeatmapHTML() {
    if (!state.jac || !state.jac.populationInfluenceNorm) return '';
    var norm = state.jac.populationInfluenceNorm;
    var targets = state.jac.targets;
    var fams = state.jac.towerFamilies.slice();
    fams.sort(function (a, b) {
      return (norm[targets[0]][b] || 0) - (norm[targets[0]][a] || 0);
    });
    var head = '<tr><th scope="col">Tower</th>' + targets.map(function (t) {
      return '<th scope="col">' + esc(ATTR_TARGET_LABELS[t] || capWords(t.replace(/_/g, ' '))) + '</th>';
    }).join('') + '</tr>';
    var body = fams.map(function (f) {
      return '<tr><th scope="row">' + esc(capWords(f.replace(/_/g, ' '))) + '</th>' +
        targets.map(function (t) {
          var v = norm[t] && norm[t][f] != null ? norm[t][f] : 0;
          var pct = Math.round(v * 100);
          // Flip the ink once the fill is dark enough to swallow it. A blend
          // mode would leave the mid-ramp cells illegible in both directions.
          var dark = v > 0.55 ? ' attr-cell__num--onDark' : '';
          return '<td class="attr-cell" title="' + esc(capWords(f.replace(/_/g, ' '))) + ' → ' +
            esc(ATTR_TARGET_LABELS[t] || t) + ': ' + pct + '% of the strongest tower">' +
            '<span class="attr-cell__fill" style="--v:' + v.toFixed(3) + '"></span>' +
            '<span class="attr-cell__num' + dark + '">' + pct + '</span></td>';
        }).join('') + '</tr>';
    }).join('');
    return '<div class="attr-heatmap-wrap">' +
      '<table class="attr-heatmap"><caption>Tower influence on each output, averaged over all ' +
        state.players.length.toLocaleString() + ' player-seasons. ' +
        'Darker = more influence, scaled within each column.</caption>' +
      '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  /* The table view is the accessible answer to "which inputs drove this", and
     it is also the contrast-relief route. Always available, never a fallback. */
  function attrTableHTML(target) {
    var rows = state.attrScope === 'population'
      ? attrPopulation(target, 12)
      : attrTopK(state.playerIdx, target);
    if (!rows || !rows.length) return '';
    var denom = rows.reduce(function (m, r) { return Math.max(m, Math.abs(r.value)); }, 0);
    var body = rows.map(function (r) {
      if (r.masked) {
        return '<tr><td>' + esc(r.label) + '</td><td>not tracked this era</td><td>&mdash;</td></tr>';
      }
      var pct = attrShare(r.value, denom);
      return '<tr><td>' + esc(r.label) + '</td>' +
        '<td>' + (pct >= 0 ? 'pushed up' : 'pushed down') + '</td>' +
        '<td class="attr-table__num">' + fmtShare(pct) + '</td></tr>';
    }).join('');
    return '<table class="attr-table"><caption>Contributions to ' +
      esc(ATTR_TARGET_ASKS[target]) + ', as a share of the strongest one.</caption>' +
      '<thead><tr><th scope="col">Input</th><th scope="col">Direction</th>' +
      '<th scope="col">Share</th></tr></thead><tbody>' + body + '</tbody></table>';
  }

  function renderAttribution() {
    var card = $('network-attr-card');
    if (!card || !attrHas() || state.playerIdx < 0) return;
    card.hidden = false;
    var target = state.attrTarget;
    var player = state.players[state.playerIdx];

    var tabs = $('attr-target-tabs');
    if (tabs) {
      tabs.innerHTML = state.attr.targets.map(function (t) {
        var on = t === target;
        return '<button type="button" role="tab" class="attr-tab' + (on ? ' is-active' : '') +
          '" aria-selected="' + on + '" data-attr-target="' + esc(t) + '">' +
          esc(ATTR_TARGET_LABELS[t] || t) + '</button>';
      }).join('');
    }
    var scope = $('attr-scope');
    if (scope) {
      scope.innerHTML = [['player', 'This player'], ['population', 'All players']].map(function (s) {
        var on = state.attrScope === s[0];
        return '<button type="button" class="attr-scope-btn' + (on ? ' is-active' : '') +
          '" aria-pressed="' + on + '" data-attr-scope="' + s[0] + '">' + s[1] + '</button>';
      }).join('');
    }
    var toggle = $('attr-table-toggle');
    if (toggle) {
      toggle.textContent = state.attrTable ? 'Chart view' : 'Table view';
      toggle.setAttribute('aria-pressed', String(state.attrTable));
    }

    var who = state.attrScope === 'population'
      ? 'All ' + state.players.length.toLocaleString() + ' player-seasons'
      : esc(player.name) + ' · ' + esc(player.season);
    if (state.attrFocusFamily) {
      who += ' · ' + capWords(state.attrFocusFamily.replace(/_/g, ' ')) + ' family';
      if (state.selectedNode && (state.selectedNode.type === 'tower' || state.selectedNode.type === 'input')) {
        who += ' → ' + (ATTR_TARGET_LABELS[target] || target);
      }
    }
    var subject = $('attr-subject');
    if (subject) {
      subject.innerHTML = who +
        (state.attrFocusFamily
          ? ' <button type="button" class="attr-clear-focus" id="attr-clear-focus">Show all families</button>'
          : '') +
        attrProbeBannerHTML();
    }

    var tile = $('attr-tile');
    if (tile) {
      var multi = (state.attrFocusFamily && state.attrScope === 'player')
        ? attrHeadsMultiplesHTML(state.attrFocusFamily)
        : '';
      tile.innerHTML = state.attrScope === 'population'
        ? ''
        : (multi + attrTileHTML(target));
      tile.hidden = state.attrScope === 'population';
    }

    var towers = $('attr-towers');
    if (towers) {
      towers.innerHTML = '<p class="viz-panel__label">Towers driving ' +
        esc(ATTR_TARGET_ASKS[target]) + '</p>' + attrTowersHTML(target);
    }

    var feats = $('attr-features');
    if (feats) {
      var featLabel = state.attrFocusFamily
        ? ('Stats in ' + capWords(state.attrFocusFamily.replace(/_/g, ' ')) +
          ' that pushed ' + (ATTR_TARGET_ASKS[target] || target))
        : 'Stats that pushed it up or down';
      feats.innerHTML = '<p class="viz-panel__label">' + esc(featLabel) + '</p>' +
        (state.attrTable ? attrTableHTML(target) : attrFeaturesHTML(target));
    }

    var pop = $('attr-population');
    if (pop) {
      pop.innerHTML = state.attrScope === 'population' ? attrHeatmapHTML() : '';
      pop.hidden = state.attrScope !== 'population';
    }
  }

  function bindAttribution() {
    var card = $('network-attr-card');
    if (!card) return;
    card.addEventListener('click', function (ev) {
      if (ev.target.closest && ev.target.closest('#attr-clear-focus')) {
        state.attrFocusFamily = null;
        renderAttribution();
        updateFlowVisual();
        return;
      }
      var t = ev.target.closest && ev.target.closest('[data-attr-target]');
      if (t) {
        state.attrTarget = t.getAttribute('data-attr-target');
        // Multi-head cards switch the explained head; keep family focus.
        renderAttribution();
        return;
      }
      var s = ev.target.closest && ev.target.closest('[data-attr-scope]');
      if (s) {
        state.attrScope = s.getAttribute('data-attr-scope');
        if (state.attrScope === 'population') {
          state.attrFocusFamily = null;
          state.attrProbeItem = null;
        }
        renderAttribution();
        return;
      }
      if (ev.target.closest && ev.target.closest('#attr-table-toggle')) {
        state.attrTable = !state.attrTable;
        renderAttribution();
      }
    });
  }

  function mapLoop(ts) {
    ts = ts || 0;
    var dt = state._mapLastTs ? Math.min(48, ts - state._mapLastTs) : 16;
    state._mapLastTs = ts;
    // Slow yaw when idle — presence without fighting a drag or reduced-motion.
    if (!state.drag && !state.reduceMotion && state.map && state.playerIdx >= 0) {
      state.cam.yaw += 0.000085 * dt;
    }
    if (state.map && state.playerIdx >= 0) drawMap(false);
    requestAnimationFrame(mapLoop);
  }

  /* Optional: Jacobian attribution. If absent (e.g. export not run yet) the
     diagram silently keeps its legacy input-magnitude weights. */
  function loadJacobian() {
    return Promise.all([
      fetch('assets/mtnn_jacobian.json').then(function (r) {
        if (!r.ok) throw new Error('no jacobian meta');
        return r.json();
      }),
      fetch('assets/mtnn_jacobian.f32').then(function (r) {
        if (!r.ok) throw new Error('no jacobian data');
        return r.arrayBuffer();
      })
    ]).then(function (parts) {
      var meta = parts[0];
      var data = new Float32Array(parts[1]);
      var shape = (meta.perRowLayout && meta.perRowLayout.shape) || [];
      if (data.length !== shape[0] * shape[1] * shape[2]) {
        throw new Error('jacobian shape mismatch');
      }
      if (shape[0] !== state.players.length) {
        throw new Error('jacobian row mismatch');
      }
      // Fail closed if this attribution is stale vs the shipped architecture.
      // Row count and byte length are invariant across a retrain, so they
      // cannot catch it; family set, embedding dim and checkpoint stamp can.
      var af = state.arch && state.arch.towerFamilies;
      if (af) {
        var jset = {};
        meta.towerFamilies.forEach(function (f) { jset[f] = 1; });
        var sameFams = af.length === meta.towerFamilies.length &&
          af.every(function (f) { return jset[f]; });
        if (!sameFams) {
          throw new Error('jacobian tower families differ from shipped arch (stale export)');
        }
      }
      if (meta.dEmb != null && state.arch && state.arch.dEmb != null &&
          meta.dEmb !== state.arch.dEmb) {
        throw new Error('jacobian dEmb mismatch');
      }
      var jc = meta.checkpoint;
      var ac = state.arch && state.arch.checkpoint;
      if (jc && ac && (jc.mtime !== ac.mtime || jc.bytes !== ac.bytes)) {
        throw new Error('jacobian checkpoint stale vs shipped arch');
      }
      state.jac = meta;
      state.jacData = data;
      state.jacTower = {};
      meta.towerFamilies.forEach(function (f, i) { state.jacTower[f] = i; });
      state.jacTarget = {};
      meta.targets.forEach(function (t, i) { state.jacTarget[t] = i; });
      setStep(state.step);   // repaint edges with causal weights
    }).catch(function (err) {
      state.jac = null;
      state.jacData = null;
      if (window.console) console.warn('[network-viz] jacobian unavailable:', err.message);
    });
  }

  /* Optional: feature attribution. Absent (export not run) => the section stays
     hidden rather than rendering an empty chart. Fails closed on a stale export
     for the same reason the Jacobian does: a bar reading "AST pushed this
     archetype up" is a claim about the SHIPPED net. */
  function loadAttribution() {
    return Promise.all([
      fetch('assets/mtnn_attr_pop.json').then(function (r) {
        if (!r.ok) throw new Error('no attribution meta');
        return r.json();
      }),
      fetch('assets/mtnn_attr_topk.bin').then(function (r) {
        if (!r.ok) throw new Error('no attribution data');
        return r.arrayBuffer();
      })
    ]).then(function (parts) {
      var meta = parts[0];
      var buf = parts[1];
      var layout = meta.topkLayout || {};
      var shape = layout.shape || [];
      var count = shape[0] * shape[1] * shape[2];
      if (shape[0] !== state.players.length) throw new Error('attribution row mismatch');
      if (buf.byteLength !== count * 2 + count * 4) throw new Error('attribution size mismatch');
      var ac = state.arch && state.arch.checkpoint;
      if (meta.checkpoint && ac &&
          (meta.checkpoint.mtime !== ac.mtime || meta.checkpoint.bytes !== ac.bytes)) {
        throw new Error('attribution checkpoint stale vs shipped arch');
      }
      // Two contiguous blocks, not interleaved records: a uint16 beside a
      // float32 would leave the value block 2-byte aligned and unviewable.
      state.attrIdx = new Uint16Array(buf, 0, count);
      state.attrVal = new Float32Array(buf, count * 2, count);
      state.attr = meta;
      if (meta.targets.indexOf(state.attrTarget) < 0) state.attrTarget = meta.targets[0];
      var card = $('network-attr-card');
      if (card) card.hidden = false;
      renderAttribution();
    }).catch(function (err) {
      state.attr = null;
      state.attrIdx = null;
      state.attrVal = null;
      if (window.console) console.warn('[network-viz] attribution unavailable:', err.message);
    });
  }

  /* Optional: per-season league mean/SD. Absent -> the panel keeps its
     "vs league average" phrasing rather than inventing real numbers. */
  function loadSeasonNorms() {
    return fetch('assets/season_norms.json').then(function (r) {
      if (!r.ok) throw new Error('no season norms');
      return r.json();
    }).then(function (doc) {
      state.norms = doc;
      renderOutputs();
      renderNodeInspector();
    }).catch(function (err) {
      state.norms = null;
      if (window.console) console.warn('[network-viz] season norms unavailable:', err.message);
    });
  }

  function fillArchSpec() {
    var a = state.arch;
    if (!a) return;
    var idEl = $('arch-model-id');
    if (idEl) idEl.textContent = a.model || a.fusion || 'mtnn';
    var ck = $('arch-checkpoint');
    if (ck) {
      if (a.checkpoint) {
        ck.textContent = 'stamp ' + a.checkpoint.bytes + ' B · built ' + (a.built || '?');
      } else {
        ck.textContent = 'built ' + (a.built || '?');
      }
    }
    var fus = $('arch-fusion-detail');
    if (fus && a.layers && a.layers[2]) {
      fus.textContent = a.layers[2].detail || fus.textContent;
    }
    var pre = $('arch-layers-pre');
    if (pre) {
      pre.textContent = JSON.stringify(a.layers || a, null, 2);
    }
  }

  function init() {
    syncReduceMotion();
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      var onMotion = function () { syncReduceMotion(); };
      if (mq.addEventListener) mq.addEventListener('change', onMotion);
      else if (mq.addListener) mq.addListener(onMotion);
    }
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
      fillArchSpec();
      buildFlowSvg($('network-flow-svg'));
      bindSearch();
      bindCompare();
      bindTimebar();
      bindNodeInspector();
      bindTraceClear();
      bindOutputSelectors();
      bindMapDrag();
      bindSteps();
      pickDefaultPlayer();
      bindAttribution();
      // Attribution needs the Jacobian's population matrix for the heatmap and
      // the tower bars, so chain rather than race.
      loadJacobian().then(loadAttribution);
      loadSeasonNorms();
      renderMapLegend();
      renderMapInsights();
      renderFlowInsights();
      requestAnimationFrame(mapLoop);
    }).catch(function (err) {
      if (window.console) {
        console.error('[network-viz] init failed:', err && err.message ? err.message : err, err);
      }
      var cap = $('network-step-caption');
      if (cap) {
        cap.textContent = 'Could not load MTNN explorer assets. Run pipeline/export_mtnn_viz.py after training.';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
