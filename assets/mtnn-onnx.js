/**
 * Vector Hoops — Optional ONNX Live Inference (progressive enhancement)
 * Full model 2.35MB (mtnn.onnx + .data) via onnxruntime-web CDN.
 * For 100M DAU, default is precomputed embeddings (edge-cached). ONNX only loads after user interaction in Lab.
 */
(function(global){
  'use strict';
  var ortReady = false;
  var session = null;
  var loading = null;

  function loadOrtSdk() {
    if (ortReady) return Promise.resolve();
    return new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js';
      s.async = true;
      s.onload = function(){ ortReady = true; resolve(); };
      s.onerror = function(){ reject(new Error('ort load fail')); };
      document.head.appendChild(s);
    });
  }

  function loadModel() {
    if (session) return Promise.resolve(session);
    if (loading) return loading;
    loading = loadOrtSdk().then(function(){
      // onnxruntime-web needs both .onnx and .data in same folder - fetch via ort InferenceSession
      return ort.InferenceSession.create('assets/mtnn.onnx', { executionProviders: ['wasm'] });
    }).then(function(sess){
      session = sess;
      void 0 /*log removed*/; //('[MTNN-ONNX] session ready, inputs', sess.inputNames, 'outputs', sess.outputNames);
      return sess;
    }).catch(function(err){
      console.warn('[MTNN-ONNX] not loaded, falling back to precomputed', err);
      loading = null;
      return null;
    });
    return loading;
  }

  // Public: lazy load after first Lab interaction
  function ensureOnnx() { return loadModel(); }

  // Optional live fuse: takes raw feature vectors if available — otherwise skip, use embedding blend
  // Input spec from mtnn_arch.json: 79 feats (masked). We don't have raw 79 per synthetic, so we use precomputed path.
  global.VHOnnx = {
    ensure: ensureOnnx,
    isReady: function(){ return !!session; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
