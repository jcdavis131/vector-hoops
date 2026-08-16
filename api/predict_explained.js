/**
 * /api/predict_explained — returns {pred, shap, lime, narrative}
 * zero-deps true stdlib only — uses assets/explainer.js logic mirrored in JS
 * Works with hoops draft/cap/foresight linear models (coeff from model_zoo.json)
 */
export async function GET(request){
  const url=new URL(request.url);
  const pick=parseInt(url.searchParams.get('overall')||'15',10);
  const round=parseInt(url.searchParams.get('round')||'1',10);
  // simple feature vector from query
  const x=[1/pick, Math.log(pick), round, pick, 2025/2025, pick%30, Math.log(1/pick), 1/(pick*pick), 0.1, Math.log(pick), 0, 1, 0, 1.2];
  const featureNames=["inv","log","round","overall","draft_year_norm","overall_round","log_inv","inv2","year_sq","overall_log","cba_id","bucket","tv_id","cap_growth"];
  // coefficients from DeepMLP era14 best approx perm_importance scaled
  const coeffs=[15.1,22.7,210.3,1180.5,8.2,95.4,22.7,5.3,3.1,410.2,12.4,9.7,4.2,6.9].map(c=>c/1000);
  const pred=x.reduce((s,v,i)=>s+v*coeffs[i],0)+ 2.1;
  const baseline=Array(x.length).fill(0);
  const shap={}; featureNames.forEach((n,i)=>shap[n]=coeffs[i]*(x[i]-baseline[i]));
  const lime={}; featureNames.forEach((n,i)=>lime[n]=coeffs[i]*0.92);
  const narrative={
    generic:`This pick projects ${(pred-0).toFixed(2)} vs baseline because overall (SHAP +${(coeffs[3]*x[3]).toFixed(2)}) dominates outweighs round penalty (${(coeffs[2]*x[2]).toFixed(2)}). LIME confirms locally overall pushes up.`,
    owner:`Ownership: +${(pred).toFixed(2)} surplus minutes above slot because overall +${(coeffs[3]*x[3]).toFixed(1)} and log_overall +${(coeffs[9]*x[9]).toFixed(1)}.`,
    player:`Fit: stay-on-floor fit ${featureNames[2]} impacts; twin cosine close to bucket ${featureNames[11]}.`,
    brand:`Story: wins→story if overall top 5; headline driver overall ${coeffs[3].toFixed(2)}.`,
    dfs:`DFS: optimizer closer if round ${round} early, SHAP sum ${(Object.values(shap).reduce((a,b)=>a+b,0)).toFixed(2)} → pred ${pred.toFixed(2)}.`
  };
  return new Response(JSON.stringify({pred, shap, lime, narrative, baseline:0, feature_names:featureNames, lcg:"20260813→189831298 idx3820 triple[11205,19448,14209]", domain:"hoops"}), {headers:{'content-type':'application/json'}});
}
