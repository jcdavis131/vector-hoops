/* modern-search.worker.js v42 — offload filteredModern to worker to unblock typing — guard <2 chars to prevent t-flood */
let names=[]; // lowercased
let pool=[]; // {n,s,i,c}
self.onmessage = function(e){
  const {type, payload} = e.data||{};
  if(type==='init'){
    pool = payload.pool||[];
    names = pool.map(p=> (p.n||'').toLowerCase());
    self.postMessage({type:'ready', count: pool.length});
  } else if(type==='search'){
    const q=(payload.q||'').toLowerCase().trim();
    if(!q || q.length<2){ self.postMessage({type:'result', q, results: [], id: payload.id}); return; }
    const out=[];
    // fast includes scan, early exit 8
    for(let i=0;i<pool.length && out.length<8;i++){
      const nm=names[i]||'';
      if(!nm) continue;
      if(nm.indexOf(q)!==-1) out.push(pool[i]);
    }
    self.postMessage({type:'result', q, results: out, id: payload.id});
  }
};
