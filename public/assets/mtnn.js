/**
 * Promoted MTNN embedding client — lazy-loaded, index-aligned with vectors.json.
 * Daily puzzles (Chimera, Era Twin warmth, What-If complementarity) score here.
 */
(function (global) {
  'use strict';

  var cache = null; // null | false | { dim, rows, E, meta }

  function loadMtnn(cb) {
    if (cache) {
      cb(cache === false ? null : cache);
      return;
    }
    fetch('assets/mtnn_meta.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (meta) {
        return fetch('assets/mtnn_embeddings.f32').then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.arrayBuffer().then(function (buf) {
            return { meta: meta, buf: buf };
          });
        });
      })
      .then(function (payload) {
        var meta = payload.meta;
        var dim = meta.dim;
        var rows = meta.rows;
        var E = new Float32Array(payload.buf);
        if (E.length !== rows * dim) {
          throw new Error('mtnn f32 length mismatch');
        }
        cache = { dim: dim, rows: rows, E: E, meta: meta };
        cb(cache);
      })
      .catch(function () {
        cache = false;
        cb(null);
      });
  }

  /** Top-k cosine neighbors for player index (embeddings pre-normalized). */
  function mtnnTopK(playerIndex, k, filterFn) {
    if (!cache || cache === false) return [];
    var dim = cache.dim;
    var rows = cache.rows;
    var E = cache.E;
    var base = playerIndex * dim;
    var hits = [];
    var i, j, dot;
    for (i = 0; i < rows; i++) {
      if (i === playerIndex) continue;
      if (filterFn && !filterFn(i)) continue;
      dot = 0;
      for (j = 0; j < dim; j++) {
        dot += E[base + j] * E[i * dim + j];
      }
      hits.push({ id: i, sim: dot });
    }
    hits.sort(function (a, b) { return b.sim - a.sim; });
    return hits.slice(0, k || 5);
  }

  /** Cosine sim between two normalized row indices. */
  function mtnnSim(i, j) {
    if (!cache || cache === false) return 0;
    var dim = cache.dim;
    var E = cache.E;
    var dot = 0;
    var a = i * dim;
    var b = j * dim;
    var d;
    for (d = 0; d < dim; d++) dot += E[a + d] * E[b + d];
    return dot;
  }

  /** Blend two donor embeddings (same linear mix as chimera 14-d). */
  function mtnnBlend(vecA, vecB, weightA) {
    if (!cache || cache === false) return null;
    var dim = cache.dim;
    var out = new Float32Array(dim);
    var w = weightA;
    var d;
    for (d = 0; d < dim; d++) {
      out[d] = w * vecA[d] + (1 - w) * vecB[d];
    }
    var norm = 0;
    for (d = 0; d < dim; d++) norm += out[d] * out[d];
    norm = Math.sqrt(norm) || 1;
    for (d = 0; d < dim; d++) out[d] /= norm;
    return out;
  }

  function rowVector(playerIndex) {
    if (!cache || cache === false) return null;
    var dim = cache.dim;
    return cache.E.subarray(playerIndex * dim, playerIndex * dim + dim);
  }

  /** Top-k vs an arbitrary normalized dim-vector (e.g. chimera blend). */
  function mtnnTopKForVector(vec, k, excludeIds) {
    if (!cache || cache === false || !vec) return [];
    var dim = cache.dim;
    var rows = cache.rows;
    var E = cache.E;
    var ex = excludeIds || {};
    var hits = [];
    var i, j, dot;
    for (i = 0; i < rows; i++) {
      if (ex[i]) continue;
      dot = 0;
      for (j = 0; j < dim; j++) dot += vec[j] * E[i * dim + j];
      hits.push({ id: i, sim: dot });
    }
    hits.sort(function (a, b) { return b.sim - a.sim; });
    return hits.slice(0, k || 5);
  }

  global.VHMtnn = {
    load: loadMtnn,
    topK: mtnnTopK,
    topKForVector: mtnnTopKForVector,
    sim: mtnnSim,
    rowVector: rowVector,
    blend: mtnnBlend
  };
}(typeof window !== 'undefined' ? window : globalThis));
