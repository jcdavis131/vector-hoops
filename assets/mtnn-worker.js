/**
 * Vector Hoops — MTNN Worker for 100M DAU
 * Offloads 12,966 × 64-d dot products off main thread.
 * (Said 48-d until 2026-08-10; the shipped model is 64-d and always was here.)
 * Loads mtnn_embeddings.f32 once, handles topK queries via postMessage.
 */
self._cache = null;

function loadF32(url) {
  return fetch(url).then(function(r){ if(!r.ok) throw new Error(url); return r.arrayBuffer(); }).then(function(b){ return new Float32Array(b); });
}

async function ensure() {
  if (self._cache) return self._cache;
  /* Absolute paths, because this is a worker. A relative URL inside a worker
     resolves against the worker script's own URL, not the document's — so
     'assets/mtnn_meta.json' from /assets/mtnn-worker.js asked for
     /assets/assets/mtnn_meta.json. That path existed only because public/ had a
     duplicated assets/assets/ tree, so this quietly read the duplicate for as
     long as both were there. Deleting the duplicates turned a silent wrong path
     into a 404, which is how it was finally noticed.

     And the dimension is no longer guessed. It was 48 in two places while the
     shipped model is 64-d, and dim is not a cosmetic number here: rows is
     derived as E.length/dim, so a wrong dim misaligns every vector in the
     matrix and returns confident nonsense rather than failing. If the metadata
     cannot be read, that is worth an error. */
  const [metaJson, E] = await Promise.all([
    fetch('/assets/mtnn_meta.json?v=3f0ebfcb').then(r=>{
      if(!r.ok) throw new Error('mtnn_meta.json '+r.status);
      return r.json();
    }),
    loadF32('/assets/mtnn_embeddings.f32')
  ]);
  var dim = metaJson.dim;
  if(!dim) throw new Error('mtnn_meta.json carries no dim; refusing to guess it');
  var rows = metaJson.rows || Math.floor(E.length/dim);
  self._cache = { dim: dim, rows: rows, E: E, meta: metaJson };
  return self._cache;
}

function topKForVector(vec, k, exclude) {
  var cache = self._cache;
  var dim = cache.dim, rows = cache.rows, E = cache.E;
  var ex = exclude || {};
  var hits = new Array(rows);
  var hitCount = 0;
  var i,j,dot;
  for (i=0;i<rows;i++){
    if (ex[i]) continue;
    dot=0;
    for (j=0;j<dim;j++) dot+=vec[j]*E[i*dim+j];
    hits[hitCount++] = {id:i, sim:dot};
  }
  hits.length = hitCount;
  hits.sort(function(a,b){return b.sim-a.sim;});
  return hits.slice(0, k||6);
}

function topKForIndex(idx, k, filter){
  var cache = self._cache;
  var dim = cache.dim, rows = cache.rows, E = cache.E;
  var base = idx*dim;
  var hits=[];
  var i,j,dot;
  for (i=0;i<rows;i++){
    if (i===idx) continue;
    if (filter && filter.excludeYear && filter.seasons){
      // cross-era filter
      if (filter.excludeYear[i]) continue;
    }
    dot=0;
    for (j=0;j<dim;j++) dot+=E[base+j]*E[i*dim+j];
    hits.push({id:i, sim:dot});
  }
  hits.sort(function(a,b){return b.sim-a.sim;});
  return hits.slice(0,k||6);
}

self.onmessage = async function(e){
  var msg = e.data;
  try{
    await ensure();
    if (msg.type==='topKVector'){
      var res = topKForVector(msg.vec, msg.k, msg.exclude||{});
      self.postMessage({id:msg.id, ok:true, result:res});
    } else if (msg.type==='topKIndex'){
      var res2 = topKForIndex(msg.idx, msg.k, msg.filter||null);
      self.postMessage({id:msg.id, ok:true, result:res2});
    } else if (msg.type==='sim'){
      var cache= self._cache;
      var dim=cache.dim, E=cache.E, a=msg.a*dim, b=msg.b*dim, dot=0, d;
      for (d=0; d<dim; d++) dot+=E[a+d]*E[b+d];
      self.postMessage({id:msg.id, ok:true, result:dot});
    } else if (msg.type==='preload'){
      await ensure();
      self.postMessage({id:msg.id, ok:true, result:{rows:self._cache.rows, dim:self._cache.dim}});
    }
  } catch(err){
    self.postMessage({id:msg.id, ok:false, error:err && err.message || String(err)});
  }
};
self.postMessage({type:'ready', ready:true});
