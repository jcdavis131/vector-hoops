/* VHPeers — precomputed 64-d cosine peers, no raw model weights in the browser.
 *
 * Replaces the old pattern of downloading assets/mtnn_embeddings.f32 (3.3 MB)
 * to compute nearest-neighbors live. The player set and the embedding are both
 * frozen, so every neighbor list is a build-time constant — this file reads
 * assets/peers_top8.json (built by pipeline/build_peers_topk.py) and answers
 * topK from it. Same {id, sim} shape the old VHMtnn.topK returned.
 *
 * Owner question: does anything on the served path still fetch a raw model
 * artifact (f32)? If yes, the serving budget's "nothing raw to the browser"
 * rule is broken — grep served JS for '.f32' and close it.
 */
(function (global) {
  'use strict';

  var PEERS_URL = 'assets/peers_top8.json';
  var K_STORED = 8;

  var CACHE = null;      // {peers: [...], k: 8}
  var PENDING = null;    // [{cb}]

  function fetchJson(url) {
    return fetch(url, { cache: 'force-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return r.json();
    });
  }

  function load(cb) {
    cb = cb || function () {};
    if (CACHE) { cb(CACHE); return; }
    if (PENDING) { PENDING.push({ cb: cb }); return; }
    PENDING = [{ cb: cb }];
    fetchJson(PEERS_URL).then(function (doc) {
      if (!doc || !doc.peers || !doc.peers.length) throw new Error('bad peers json');
      CACHE = { peers: doc.peers, k: doc.k || K_STORED, runId: doc.run_id || null };
      var q = PENDING; PENDING = null;
      q.forEach(function (w) { w.cb(CACHE); });
      try { global.dispatchEvent(new CustomEvent('vh:peers-ready')); } catch (e) {}
    }).catch(function (err) {
      var q = PENDING; PENDING = null;
      try { console.warn('[VHPeers] load failed:', err && err.message); } catch (e) {}
      q.forEach(function (w) { w.cb(null); });
      try { global.dispatchEvent(new CustomEvent('vh:peers-failed', { detail: { error: String(err) } })); } catch (e) {}
    });
  }

  function loadAsync() {
    return new Promise(function (res) { load(function (c) { res(c); }); });
  }

  function isReady() { return !!CACHE; }

  // topK(rowId, k, filterFn) — same contract as the old VHMtnn.topK.
  // The stored list already excludes same-name rows (matching the call-site
  // filters); filterFn is re-applied so any caller-side rule still holds.
  function topK(rowId, k, filterFn) {
    if (!CACHE) return [];
    var flat = CACHE.peers[rowId];
    if (!flat || !flat.length) return [];
    k = k || 5;
    var out = [];
    for (var p = 0; p + 1 < flat.length && out.length < k; p += 2) {
      var id = flat[p];
      if (filterFn && !filterFn(id)) continue;
      out.push({ id: id, sim: flat[p + 1] });
    }
    return out;
  }

  global.VHPeers = {
    load: load,
    loadAsync: loadAsync,
    isReady: isReady,
    topK: topK
  };
})(window);
