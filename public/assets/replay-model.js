/* Pixel Replay coordinate model, in the browser (rung b of the projection brief).
 *
 * A small set transformer trained by scripts/tracking/train_coords.py on 2015-16 SportVU
 * tracking (linouk23/NBA-Player-Movements, events from sealneaward/nba-movement-data; Cam's
 * decision D9: model only, the raw tracking is never served). Given what a play-by-play feed
 * says about one event, it places all ten players as one joint scene. This file is the forward
 * pass and the feature builder; the weights are assets/replay-model.json (float16, base64).
 *
 *   ReplayModel.load(url) -> Promise           ReplayModel.ready
 *   ReplayModel.place(ctx) -> {pid: [x, y]} in full-court feet, or null
 *     ctx: { type, period, clock, margin, right, offense: [5 pids], defense: [5 pids],
 *            actor, anchor: [x, y] | null, lastShot: [x, y] | null, roles: {pid: [16]} }
 * No dependencies. Same math as torch.nn.TransformerEncoderLayer(norm_first=True, gelu).
 */
(function (root) {
  'use strict';
  var M = null, W = {};

  function f16(b64) { // base64 float16 -> Float32Array
    var bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    var n = bin.length >> 1, out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var h = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8), s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023;
      out[i] = e === 0 ? s * Math.pow(2, -14) * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + f / 1024);
    }
    return out;
  }
  function q8(b64, sc, cols) { // base64 int8, one scale per row -> Float32Array
    var bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    var out = new Float32Array(bin.length);
    for (var i = 0; i < bin.length; i++) { var c = bin.charCodeAt(i); out[i] = (c > 127 ? c - 256 : c) * sc[(i / cols) | 0]; }
    return out;
  }
  function init(doc) {
    M = doc.meta; W = {};
    Object.keys(doc.w).forEach(function (k) { var t = doc.w[k]; W[k] = { s: t.shape, v: t.q8 ? q8(t.q8, t.s, t.shape[1]) : f16(t.b64) }; });
    api.ready = true; api.meta = M;
  }
  /* y[n,o] = x[n,i] W[o,i]^T + b */
  function lin(x, n, i, w, b) {
    var o = w.s[0], y = new Float32Array(n * o), wv = w.v, bv = b.v;
    for (var r = 0; r < n; r++) for (var c = 0; c < o; c++) {
      var s = bv[c], xo = r * i, wo = c * i;
      for (var k = 0; k < i; k++) s += x[xo + k] * wv[wo + k];
      y[r * o + c] = s;
    }
    return y;
  }
  function ln(x, n, d, g, b) {
    var y = new Float32Array(n * d);
    for (var r = 0; r < n; r++) {
      var m = 0, v = 0, o = r * d;
      for (var k = 0; k < d; k++) m += x[o + k]; m /= d;
      for (k = 0; k < d; k++) { var t = x[o + k] - m; v += t * t; } v = 1 / Math.sqrt(v / d + 1e-5);
      for (k = 0; k < d; k++) y[o + k] = (x[o + k] - m) * v * g.v[k] + b.v[k];
    }
    return y;
  }
  function erf(x) { // Abramowitz-Stegun 7.1.26, |err| < 1.5e-7
    var s = x < 0 ? -1 : 1; x = Math.abs(x); var t = 1 / (1 + 0.3275911 * x);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  }
  function block(h, n, d, p) {
    var H = M.heads, hd = d / H, x = ln(h, n, d, W[p + 'norm1.weight'], W[p + 'norm1.bias']);
    var qkv = lin(x, n, d, W[p + 'self_attn.in_proj_weight'], W[p + 'self_attn.in_proj_bias']), att = new Float32Array(n * d), sc = 1 / Math.sqrt(hd);
    for (var hh = 0; hh < H; hh++) for (var i = 0; i < n; i++) {
      var w = new Float32Array(n), mx = -1e30;
      for (var j = 0; j < n; j++) { var s = 0; for (var k = 0; k < hd; k++) s += qkv[i * 3 * d + hh * hd + k] * qkv[j * 3 * d + d + hh * hd + k]; w[j] = s * sc; if (w[j] > mx) mx = w[j]; }
      var z = 0; for (j = 0; j < n; j++) { w[j] = Math.exp(w[j] - mx); z += w[j]; }
      for (k = 0; k < hd; k++) { var a = 0; for (j = 0; j < n; j++) a += w[j] * qkv[j * 3 * d + 2 * d + hh * hd + k]; att[i * d + hh * hd + k] = a / z; }
    }
    var o = lin(att, n, d, W[p + 'self_attn.out_proj.weight'], W[p + 'self_attn.out_proj.bias']);
    for (var q = 0; q < n * d; q++) h[q] += o[q];
    x = ln(h, n, d, W[p + 'norm2.weight'], W[p + 'norm2.bias']);
    var f = lin(x, n, d, W[p + 'linear1.weight'], W[p + 'linear1.bias']), ff = W[p + 'linear1.weight'].s[0];
    for (q = 0; q < f.length; q++) f[q] = 0.5 * f[q] * (1 + erf(f[q] / Math.SQRT2));
    var g = lin(f, n, ff, W[p + 'linear2.weight'], W[p + 'linear2.bias']);
    for (q = 0; q < n * d; q++) h[q] += g[q];
  }
  /* P: Float32Array(10*pf), G: Float32Array(gf) -> Float32Array(20), offense frame, model units */
  function forward(P, G) {
    var d = M.d, gt = lin(G, 1, M.gf, W['g_in.weight'], W['g_in.bias']), pt = lin(P, 10, M.pf, W['p_in.weight'], W['p_in.bias']);
    var h = new Float32Array(11 * d); h.set(gt, 0); h.set(pt, d);
    for (var l = 0; l < M.layers; l++) block(h, 11, d, 'blocks.' + l + '.');
    var y = ln(h, 11, d, W['norm.weight'], W['norm.bias']);
    return lin(y.subarray(d), 10, d, W['out.weight'], W['out.bias']);
  }

  var L = 94, CW = 50;
  function toModel(p, right) { var x = right ? p[0] : L - p[0], y = right ? p[1] : CW - p[1]; return [(x - 47) / 47, (y - 25) / 25]; }
  function fromModel(x, y, right) { var fx = 47 + 47 * x, fy = 25 + 25 * y; return right ? [fx, fy] : [L - fx, CW - fy]; }
  /* Each player's code: the model was trained with fresh noise here every batch, so it learned
     to spread out players it cannot otherwise tell apart. On the page the code is a fixed
     function of the player id, so a player keeps his spot from one render to the next. */
  function code(id, n) {
    var h = 2166136261, s = String(id), out = [];
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    function rnd() { h = (h + 0x6d2b79f5) >>> 0; var t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296; }
    while (out.length < n) { var u = rnd(), v = rnd(), r = Math.sqrt(-2 * Math.log(u)); out.push(r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)); }
    return out.slice(0, n);
  }
  /* the same features train_coords.py featurize() builds */
  function place(c) {
    if (!api.ready) return null;
    var ui = M.used.indexOf(c.type); if (ui < 0) return null;
    var ids = c.offense.concat(c.defense); if (ids.length !== 10) return null;
    var pf = M.pf, nr = M.nrole, P = new Float32Array(10 * pf), G = new Float32Array(M.gf);
    ids.forEach(function (id, k) {
      var o = k * pf; P[o] = k < 5 ? 1 : 0;
      if (String(id) === String(c.actor)) {
        P[o + 1] = 1;
        if (c.anchor) { var a = toModel(c.anchor, c.right); P[o + 2] = a[0]; P[o + 3] = a[1]; P[o + 4] = 1; }
      }
      var r = c.roles && c.roles[id];
      if (r) { for (var q = 0; q < nr; q++) P[o + 5 + q] = r[q]; P[o + 5 + nr] = 1; }
      var nc = M.codes || 0; if (nc) { var cz = code(id, nc); for (var j = 0; j < nc; j++) P[o + pf - nc + j] = cz[j]; }
    });
    var U = M.used.length; G[ui] = 1; G[U + Math.min(5, Math.max(1, c.period)) - 1] = 1;
    G[U + 5] = c.clock / 720; G[U + 6] = Math.max(-30, Math.min(30, c.margin || 0)) / 20;
    if (c.lastShot) { var s = toModel(c.lastShot, c.right); G[U + 7] = s[0]; G[U + 8] = s[1]; G[U + 9] = 1; }
    var y = forward(P, G), out = {};
    ids.forEach(function (id, k) { out[id] = fromModel(y[2 * k], y[2 * k + 1], c.right); });
    return out;
  }
  function load(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (doc) { init(doc); return api; });
  }

  var api = { ready: false, meta: null, load: load, place: place, forward: forward, _init: init, _code: code };

  /* Role descriptors (assets/replay_roles.json, scripts/tracking/build_roles.py): NBA person id
     -> [pc1, pc2, pc3, cluster, position] from the player's latest atlas season. NBA-built games
     key players by NBA id; ESPN games match by full name (accents, punctuation and Jr/Sr/II
     dropped, the same rule as build_roles.py). Two players with one name are left out there. */
  function normName(s) {
    return String(s || '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z]/g, '');
  }
  function expand(r) { // -> the 16 role features train_coords.py uses
    var v = new Array(16).fill(0); v[0] = r[0]; v[1] = r[1]; v[2] = r[2];
    if (r[3] >= 0 && r[3] < 8) v[3 + r[3]] = 1; if (r[4] >= 0 && r[4] < 5) v[11 + r[4]] = 1; return v;
  }
  var RD = null, lastG = null, lastOut = null;
  var roles = {
    ready: false,
    _init: function (doc) { RD = doc; roles.ready = true; lastG = null; },
    load: function (url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (doc) { roles._init(doc); return roles; }); },
    forGame: function (G) {
      if (!RD || !G || !G.players) return null;
      if (G === lastG) return lastOut;
      var out = {};
      Object.keys(G.players).forEach(function (id) {
        var r = RD.roles[id], p = G.players[id];
        if (!r && p && p.f) { var nba = RD.names[normName(p.f)]; if (nba != null) r = RD.roles[String(nba)]; }
        if (r) out[id] = expand(r);
      });
      lastG = G; lastOut = out; return out;
    },
    _norm: normName
  };
  api.roles = roles;
  if (typeof module === 'object' && module.exports) module.exports = api; else { root.ReplayModel = api; root.ReplayRoles = roles; }
})(typeof window !== 'undefined' ? window : this);
