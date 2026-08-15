/* nba_dfs_mtnn optimizer — 5-man 50000 cap greedy + 2-opt hill-climb + LCG everyday chain same-link-same-stars
   Zero-deps stdlib only, torch auto cuda/cpu honest 503 CPU fallback, no dev instrumentation
   LCG verified 20260813→189831298 idx3820 triple[11205,19448,14209] same-link ?daily=YYYYMMDD&n=1/3/5
   Pro designer fonts single sans, no Mono hero, no free-forever wording
*/
const LCG_A=1103515245, LCG_C=12345, LCG_M=2147483648;
function glibcLcg(s){ return (Math.imul(s,LCG_A)+LCG_C & 0x7fffffff)>>>0; }
const DAILY_SEED=20260813;
const ENTITY_TOTAL=20719;
function dailyRoll(d){ return glibcLcg(d||DAILY_SEED); }
function dailySequence(d,n,mod){ mod=mod||ENTITY_TOTAL; let s=glibcLcg(d||DAILY_SEED); const out=[]; for(let i=0;i<n;i++){ s=glibcLcg(s); out.push(s%mod); } return out; }
function verifyDailyTriple(d){ d=d||DAILY_SEED; const daily=glibcLcg(d); const idx=daily%ENTITY_TOTAL; const triple=dailySequence(d,3,ENTITY_TOTAL); const ok=daily===189831298 && idx===3820 && triple[0]===11205 && triple[1]===19448 && triple[2]===14209; return {daily,idx,triple,ok}; }
function sameLink(daily,n){ return `?daily=${daily}&n=${n}`; }
function everydayTip(){ return "Today's lineup changes daily — same link same five as friends"; }

// salary abstraction matching py
function salaryFor(p){ // p meta with contract_avg_m, ppg, mpg, per
  let sal=4000 + (p.contract_avg_m||5)*600 + (p.ppg||8)*120 + (p.mpg||20)*45 + (p.per||12)*20;
  return Math.max(3000, Math.min(12500, Math.round(sal)));
}
// greedy + 2-opt hill-climb under 50000 cap 5-man
function optimizeLineup(players, cap=50000, size=5){
  try{ const key='nba_dfs_opt_cache'; }catch(e){}
  const pool=players.slice().sort((a,b)=> (b.value||b.dfs_mean/b.salary) - (a.value||a.dfs_mean/a.salary));
  let lineup=[];
  let capLeft=cap;
  for(let p of pool){
    if(lineup.length>=size) break;
    let sal=p.salary||salaryFor(p);
    if(sal<=capLeft - (size-lineup.length-1)*3000){
      lineup.push(p);
      capLeft-=sal;
    }
  }
  if(lineup.length<size){
    const remaining=players.filter(pl=>!lineup.includes(pl)).sort((a,b)=>a.salary-b.salary);
    for(let r of remaining){
      if(lineup.length>=size) break;
      let sal=r.salary;
      if(sal<=capLeft){ lineup.push(r); capLeft-=sal; }
    }
  }
  let improved=true;
  let iter=0;
  while(improved && iter<30){
    improved=false;
    iter++;
    let curMean=lineup.reduce((s,p)=>s+(p.dfs_mean||0),0);
    let curSal=lineup.reduce((s,p)=>s+(p.salary||0),0);
    for(let i=0;i<lineup.length;i++){
      for(let cand of players){
        if(lineup.includes(cand)) continue;
        let newSal=curSal - lineup[i].salary + cand.salary;
        if(newSal>cap) continue;
        let newMean=curMean - lineup[i].dfs_mean + cand.dfs_mean;
        if(newMean>curMean+0.02){
          lineup[i]=cand;
          improved=true;
          break;
        }
      }
      if(improved) break;
    }
  }
  return {lineup, total_salary: lineup.reduce((s,p)=>s+p.salary,0), total_mean: lineup.reduce((s,p)=>s+p.dfs_mean,0), iter};
}

const PROVENANCE={"total":20719,"subset":12966,"spec":[3,6,7,7,10,12,14],"hashes":59,"provenance_7_7_0":true,"daily_seed":20260813,"daily_lcg":189831298,"idx3820":3820,"triple":[11205,19448,14209],"five_pure":[11205,19448,14209,16853,15710],"five_spec":[11205,19448,14209,11701,18524],"same_link":"?daily=20260813&n=3","same_link_same_stars":true,"zero_deps":true,"torch":"auto cuda/cpu honest 503"};

// expose global for vanilla pages
if(typeof window!=="undefined"){ window.NBAdfsMtnn={glibcLcg,dailyRoll,dailySequence,verifyDailyTriple,sameLink,everydayTip,optimizeLineup,salaryFor,PROVENANCE}; }
