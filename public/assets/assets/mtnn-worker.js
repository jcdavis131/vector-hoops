/**
 * Vector Hoops — MTNN Worker for 100M DAU
 * Offloads 12,966 × 48-d dot products off main thread.
 * Loads mtnn_embeddings.f32 once, handles topK queries via postMessage.
 */
self._cache = null;

function loadF32(url) {
  return fetch(url).then(function(r){ if(!r.ok) throw new Error(url); return r.arrayBuffer(); }).then(function(b){ return new Float32Array(b); });
}

async function ensure() {
  if (self._cache) return self._cache;
  const [metaJson, E] = await Promise.all([
    fetch('assets/mtnn_meta.json').then(r=>r.json()).catch(()=>({dim:48, rows:12966})),
    loadF32('assets/mtnn_embeddings.f32')
  ]);
  var dim = metaJson.dim || 48;
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
