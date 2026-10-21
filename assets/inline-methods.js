/* --- extracted from methods.html (inline block) (pure move; no behavior change) --- */
(() => {
  async function loadArch(){
    try{
      const r = await fetch('assets/mtnn_arch.json?v='+Date.now());
      const j = await r.json();
      const el = document.getElementById('arch-current-meta');
      const pre = document.getElementById('arch-layers-pre');
      if(el){
        el.innerHTML = `
          <div><b>model</b> ${j.model||'mtnn_v4'} • <b>dTower</b> ${j.dTower||32} • <b>dEmb</b> ${j.dEmb||48} • <b>blocks</b> ${j.towerBlocks||2} • <b>fusion</b> ${j.fusion||'concat'}</div>
          <div style="margin-top:6px;"><b>families</b> ${(j.towerFamilies||[]).join(', ')} (${(j.towerFamilies||[]).length})</div>
          <div style="margin-top:6px;"><b>checkpoint</b> mtime ${j.checkpoint?.mtime||'—'} • ${(j.checkpoint?.bytes/1e6||0).toFixed(2)}MB • ${j.nArchetypes||8} archetypes • ${j.skillKeys?.length||18} skills</div>
        `;
      }
      if(pre) pre.textContent = JSON.stringify(j, null, 2).slice(0, 12000);
    }catch(e){
      const el=document.getElementById('arch-current-meta');
      if(el) el.textContent='Failed to load assets/mtnn_arch.json — ' + e;
    }
  }
  function loadWeights(){
    const WEIGHTS = {recall:0.18,purity:0.16,margin_14d:0.08,archetype:0.08,position:0.05,skills_r2:0.14,skill_nn:0.05,next_r2:0.12,next_mae:0.06,aux_r2:0.08};
    const grid=document.getElementById('weights-grid');
    if(!grid) return;
    grid.innerHTML = Object.entries(WEIGHTS).map(([k,v])=>`<div class="weight-chip"><b>${k}</b><span>${v}</span></div>`).join('');
  }
  async function loadScoreboard(){
    const cap = document.getElementById('evsb-caption');
    try{
      const r = await fetch('assets/eval_scoreboard.json?v='+Date.now());
      const j = await r.json();
      const pct = x => (x*100).toFixed(1) + '%';
      const test = j.results.mtnn.by_split.test;
      const base = j.results.baseline_transparent_14d.by_split.test;
      const rnd = j.results.baseline_random;
      document.getElementById('evsb-top5').textContent = pct(test.top5);
      document.getElementById('evsb-top1').textContent = pct(test.top1);
      document.getElementById('evsb-base5').textContent = pct(base.top5);
      document.getElementById('evsb-pairs').textContent = j.eligible_pairs.toLocaleString('en-US');
      if(cap) cap.textContent =
        'Held-out retrieval: query the shipped 64-d space with a player’s season N — does that same player’s season N+1 rank in the top-5 nearest neighbors among all ' +
        j.embedding_asset.rows.toLocaleString('en-US') + ' player-seasons? Scored on ' + test.n.toLocaleString('en-US') +
        ' pairs whose target season (2024+) was never a training positive; ' + j.eligible_pairs.toLocaleString('en-US') +
        ' adjacent-season pairs total, keyed by stable PLAYER_ID. Baselines: transparent 14-d era-z profile (' + pct(base.top5) +
        ') and random rank (' + (rnd.top5*100).toFixed(2) + '%). Recomputed + gated every rebuild — pipeline/build_eval_scoreboard.py.';
    }catch(e){
      if(cap) cap.textContent = 'Failed to load assets/eval_scoreboard.json — ' + e;
    }
  }
  window.addEventListener('DOMContentLoaded', ()=>{ loadArch(); loadWeights(); loadScoreboard(); });
})();
