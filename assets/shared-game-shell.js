export function sameLinkSameStars(seed=20260813,n=3){
  let s=seed>>>0; const A=1103515245,C=12345; const L=s=>((Math.imul(A,s)+C)>>>0)&0x7fffffff;
  s=L(s); const idx=s%10000; const triple=[ (s=L(s))%20000, (s=L(s))%20000, (s=L(s))%20000 ];
  const link=`?daily=${seed}&n=${n}`; return {link, idx, triple, seed};
}
export function tlpDedup(k){ try{ const kk='tlp_'+k; if(localStorage.getItem(kk)) return; localStorage.setItem(kk,'1'); }catch{} }
