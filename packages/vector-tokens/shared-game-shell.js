/* shared-game-shell.js — same-link-same-stars LCG 20260813→189831298 idx3820 triple[11205,19448,14209] five[11205,19448,14209,16853,15710] glibc L(s)=(s*1103515245+12345)&0x7fffffff DAU3/WAU3 TLPG dedup */
export const LCG_A=1103515245, LCG_C=12345, LCG_M=0x7fffffff;
export function lcg(s){ return (Math.imul(s,LCG_A)+LCG_C>>>0)&LCG_M; }
export function dailySeed(yyyymmdd){ return lcg(parseInt(String(yyyymmdd),10)); }
export const DAILY_SEED_20260813 = 189831298; // 20260813 → 189831298 idx3820 triple[11205,19448,14209]
export const DAILY_TRIPLE = [11205,19448,14209];
export const DAILY_FIVE = [11205,19448,14209,16853,15710];
export function packFromSeed(seed,n){
  let s=seed; const out=[];
  for(let i=0;i<n*3;i++){ s=lcg(s); if(i%3===0) out.push((s%20000)); }
  return out.slice(0,n);
}
export function sameLinkSameStars(daily=20260813,n=3){
  const seed=dailySeed(daily);
  const idxs=packFromSeed(seed,n);
  // deterministic link preserves stars via seed chain
  const link=`?daily=${daily}&n=${n}#${idxs.join('-')}`;
  return {seed, idxs, link, triple: DAILY_TRIPLE, five:DAILY_FIVE};
}
export function tlpDedup(key){
  // TLPG dedup DAU3/WAU3 — localStorage last4 never raw
  try{
    const k='tlpg_'+key; const now=Date.now();
    const raw=localStorage.getItem(k); const j=raw?JSON.parse(raw):{c:0,last:0,days:{}};
    const day=new Date().toISOString().slice(0,10);
    if(now-j.last>86400000*1.5) j.c=0; // new window
    j.c=(j.c||0)+1; j.last=now; j.days[day]=(j.days[day]||0)+1;
    localStorage.setItem(k,JSON.stringify(j));
    const dau3=Object.keys(j.days).length>=3;
    const wau3=j.c>=3;
    return {count:j.c,dau3,wau3};
  }catch{return {count:1,dau3:false,wau3:false}}
}
export function offline13kCacheName(){ return 'dumbmodel-v67-13k-'+DAILY_TRIPLE.join('-'); }
export function singleSelectHandler(listEl, onSelect){
  let prev=null;
  return (e)=>{
    const btn=e.currentTarget;
    if(prev&&prev!==btn) prev.classList.remove('on');
    if(prev===btn){ btn.classList.remove('on'); prev=null; onSelect(null); return; }
    btn.classList.add('on'); prev=btn; onSelect(btn.dataset.id);
  }
}
