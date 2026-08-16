/**
 * Explainer — zero-deps JS — Kernel SHAP + LIME tabular + narrative
 * SSOT: bundles/coordination/active-tasks.md LCG 20260813→189831298 idx3820 triple[11205,19448,14209] same-link-same-stars
 * Works stdlib-only; no shap/lime pip; model-agnostic.
 * API: explainPrediction(x, featureNames, predictFn, opts) -> {prediction, baseline, shap, lime, additive_fidelity, narrative:{owner,player,brand,dfs,generic}}
 *
 * x: number[] feature vector
 * featureNames: string[]
 * predictFn: (vec:number[])=>number — must be pure sync; if omitted uses linear fallback
 *
 * zero-deps true — no imports
 */
(function (root) {
  const RAND_A = 1103515245, RAND_C = 12345, RAND_M = 0x80000000;
  function lcg(seed){ return (Math.imul(seed, RAND_A) + RAND_C) >>> 0 & 0x7fffffff; }
  // gaussian via box-muller using LCG uniform
  let _s = 20260813 ^ 189831298;
  function rnd(){ _s = lcg(_s); return (_s+1)/0x80000000; }
  function randn(){ let u=0,v=0; while(u===0) u=rnd(); while(v===0) v=rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }

  function comb(n,k){
    if(k<0||k>n) return 0;
    if(k>n-k) k=n-k;
    let c=1;
    for(let i=1;i<=k;i++){ c=c*(n-k+i)/i; if(!isFinite(c)) return 1e12; }
    return c;
  }
  function shapKernel(s,M){
    if(s===0||s===M) return 1000;
    const combv = comb(M,s);
    if(combv===0) return 1;
    return (M-1)/(combv * s * (M-s));
  }

  function weightedLeastSq(X,y,w,ridge){
    // X: N x D, y: N, w: N, ridge lambda
    const N=X.length, D=X[0].length;
    // compute XtWX and XtWy
    const A = Array.from({length:D},()=>Array(D).fill(0));
    const b = Array(D).fill(0);
    for(let i=0;i<N;i++){
      const wi=w[i]; const xi=X[i]; const yi=y[i];
      for(let a=0;a<D;a++){
        b[a]+=wi*xi[a]*yi;
        for(let bb=0;bb<D;bb++){
          A[a][bb]+=wi*xi[a]*xi[bb];
        }
      }
    }
    if(ridge){ for(let d=0;d<D;d++) A[d][d]+=ridge; }
    // solve A x = b via Gauss-Jordan
    // augment
    const M = A.map((row,i)=> row.concat([b[i]]));
    for(let col=0;col<D;col++){
      // pivot
      let prow=col;
      for(let r=col;r<D;r++) if(Math.abs(M[r][col])>Math.abs(M[prow][col])) prow=r;
      if(Math.abs(M[prow][col])<1e-12) continue;
      if(prow!==col){ const tmp=M[prow]; M[prow]=M[col]; M[col]=tmp; }
      const piv=M[col][col];
      for(let j=col;j<=D;j++) M[col][j]/=piv;
      for(let r=0;r<D;r++){
        if(r===col) continue;
        const factor=M[r][col];
        if(Math.abs(factor)<1e-12) continue;
        for(let j=col;j<=D;j++) M[r][j]-=factor*M[col][j];
      }
    }
    const beta = M.map(r=>r[D]);
    return beta;
  }

  function dot(a,b){ let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return s;}

  function explainPrediction(x, featureNames, predictFn, opts={}){
    opts = opts||{};
    const M = x.length;
    const names = featureNames && featureNames.length===M ? featureNames : x.map((_,i)=>`f${i}`);
    const baseline = opts.baseline && opts.baseline.length===M ? opts.baseline.slice() : Array(M).fill(0);
    const numShap = Math.min(opts.numShap||Math.max(64, 2*M+24), 160);
    const numLime = Math.min(opts.numLime||96, 256);
    const kernelWidth = opts.kernelWidth || Math.sqrt(M)*0.75;

    const pred = (typeof predictFn==='function') ? predictFn(x) : dot(x, Array(M).fill(1/M));

    // ---- Kernel SHAP ----
    let Xsh=[], ysh=[], wsh=[];
    // add baseline and full
    const fBaseline = (typeof predictFn==='function') ? predictFn(baseline) : 0;
    const fFull = pred;
    // enumerate coalitions
    for(let k=0;k<numShap;k++){
      let mask;
      if(k===0){ mask=Array(M).fill(0); }
      else if(k===1){ mask=Array(M).fill(1); }
      else{
        // random size
        const sz = (rnd()<0.22) ? (rnd()<0.5?1:M-1) : Math.floor(1+ rnd()*(M-1));
        mask=Array(M).fill(0);
        const idxs=[...Array(M).keys()];
        // shuffle partial fisher-yates for sz
        for(let i=0;i<sz;i++){
          const j=i+Math.floor(rnd()*(M-i));
          [idxs[i],idxs[j]]=[idxs[j],idxs[i]];
          mask[idxs[i]]=1;
        }
      }
      const sz = mask.reduce((a,b)=>a+b,0);
      const w = shapKernel(sz,M);
      const z = mask.map((m,i)=> m ? x[i] : baseline[i]);
      const y = (typeof predictFn==='function') ? predictFn(z) : dot(z, Array(M).fill(1/M));
      const row = [1].concat(mask); // intercept + mask
      Xsh.push(row);
      ysh.push(y);
      wsh.push(w);
    }
    const betaSh = weightedLeastSq(Xsh, ysh, wsh, 1e-6);
    const intercept = betaSh[0];
    const shapArr = betaSh.slice(1);
    // additive check
    const sumShap = shapArr.reduce((a,b)=>a+b,0);
    const expFull = intercept + sumShap;
    const fidelity = Math.abs(fFull - expFull) / (Math.abs(fFull)+1e-6);

    // ---- LIME ----
    let Xli=[], yli=[], wli=[];
    // precompute std for scaling if provided or estimate from x spread
    const sigma = opts.sigma || 1.0;
    for(let i=0;i<numLime;i++){
      const z = x.map(v=> v + randn()*sigma*0.35);
      const d2 = z.reduce((s,vi,j)=>{ const diff=vi - x[j]; return s+diff*diff; },0);
      const w = Math.sqrt(Math.exp(-d2/(kernelWidth*kernelWidth)));
      const y = (typeof predictFn==='function') ? predictFn(z) : dot(z, Array(M).fill(1/M));
      Xli.push([1].concat(z));
      yli.push(y);
      wli.push(w);
    }
    const betaLime = weightedLeastSq(Xli, yli, wli, 1.0);
    const limeIntercept = betaLime[0];
    const limeCoefs = betaLime.slice(1);

    const shap = {}; const lime = {};
    for(let i=0;i<M;i++){ shap[names[i]]=shapArr[i]; lime[names[i]]=limeCoefs[i]; }

    // ---- Narrative ----
    const narrative = makeNarrative(names, shapArr, limeCoefs, x, baseline, pred, fBaseline, opts.domain||'generic');

    return {
      prediction: pred,
      baseline: {value: fBaseline, vector: baseline},
      shap_values: shap,
      shap_array: shapArr,
      lime_values: lime,
      lime_array: limeCoefs,
      intercept_shap: intercept,
      intercept_lime: limeIntercept,
      fidelity: {shap_additive_error: Math.abs(fFull-expFull), shap_relative: fidelity, sum_shap: sumShap, expected: expFull},
      stability: {numShap, numLime, kernelWidth},
      feature_names: names,
      narrative,
      meta: {M, domain:opts.domain||'generic', timestamp: new Date().toISOString(), lcg: '20260813→189831298 idx3820 triple[11205,19448,14209]'}
    };
  }

  function topK(names, vals, k=3){
    const idx = vals.map((v,i)=>[Math.abs(v),i,v]).sort((a,b)=>b[0]-a[0]).slice(0,k);
    return idx.map(([abs,i,v])=>({name:names[i], val:v, abs, idx:i}));
  }

  function makeNarrative(names, shapArr, limeArr, x, baseline, pred, basePred, domain){
    const delta = pred-basePred;
    const tops = topK(names, shapArr, 3);
    const limeTops = topK(names, limeArr, 3);
    const fmt = (v)=> (v>=0?`+${v.toFixed(2)}`:`${v.toFixed(2)}`);
    const shapStr = tops.map(t=>`${t.name} (SHAP ${fmt(t.val)})`).join(', ');
    const limeCheck = limeTops[0] ? `LIME locally ${limeTops[0].name} ${limeTops[0].val>=0?'pushes up':'pulls down'} (${fmt(limeTops[0].val)})` : '';
    // domain-specific POV sentence
    const pov = {
      owner: domain.includes('hoops') ? `Ownership view: this projects ${fmt(delta)} wins above baseline because ${shapStr}.` : domain.includes('gridiron') ? `Cap view: ${fmt(delta)} points above replacement driven by ${shapStr}.` : domain.includes('pitch') ? `Run-value view: ${fmt(delta)} above park-neutral driven by ${shapStr}.` : domain.includes('equities') ? `Edge view: ${fmt(delta)} expected 6M fwd vs random because ${shapStr}.` : `Unified: ${fmt(delta)} lift from ${shapStr}.`,
      player: `Fit view: local shape ${limeCheck} — ${tops.length>1?`secondary ${tops[1].name} ${fmt(tops[1].val)} suggests situational upside`:'stable across neighborhood'}.`,
      brand: `Story view: headline driver is ${tops[0]?.name||'unknown'} (${fmt(tops[0]?.val||0)}) — marketability lifts when ${limeTops[0]?.name||'context'} aligns.`,
      dfs: `DFS view: exploitable if ${tops[0]?.name||'top'} ${tops[0]&&(tops[0].val>0)?'remains mispriced':'is faded'} — SHAP sum ${fmt(shapArr.reduce((a,b)=>a+b,0))} → pred ${pred.toFixed(2)} vs base ${basePred.toFixed(2)}.`
    };
    const generic = `This pick projects ${fmt(delta)} vs baseline (${basePred.toFixed(2)}→${pred.toFixed(2)}) because ${shapStr}. ${limeCheck}, ${pov.player} ${pov.owner}`;
    return {owner:pov.owner, player:pov.player, brand:pov.brand, dfs:pov.dfs, generic, tops, limeTops, delta};
  }

  // expose
  root.Explainer = {explainPrediction, shapKernel, weightedLeastSq, comb};
  if(typeof module!=='undefined' && module.exports) module.exports = root.Explainer;
})(typeof self!=='undefined'?self: (typeof window!=='undefined'?window:globalThis));
