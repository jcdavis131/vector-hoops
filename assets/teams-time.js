(function(){
 const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
 async function fetchJSON(u){try{let r=await fetch(u);if(!r.ok)throw 0;return await r.json()}catch(e){return null}}
 let cacheHist=null, cachePay=null, cacheCap=null;
 async function getHist(){if(cacheHist) return cacheHist;cacheHist=await fetchJSON('/assets/data/team_history.json');return cacheHist;}
 async function getPay(){if(cachePay) return cachePay;cachePay=await fetchJSON('/assets/data/payroll_by_season.json');return cachePay;}
 async function getCap(){if(cacheCap) return cacheCap;cacheCap=await fetchJSON('/assets/data/cap_rules.json');return cacheCap;}
 function champTxt(map,s){if(!map||!map[s]) return '';let m=map[s];let parts=Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([a,v])=>`${a} ${v>=8?'Champion':v>=4?'Runner':'Conf'}+${v}`);return parts.join(' ')+` (${s})`}
 function boardHist(ts,season,FO,pay,capRules){
   let bd=document.getElementById('board-body'); if(!bd) return;
   bd.innerHTML=''; ts.forEach((t,i)=>{
     let tr=document.createElement('tr'); tr.className='leader-row'; tr.dataset.abbr=t.abbr;
     let payM=(pay&&pay[season]&&pay[season][t.abbr])||'—';
     let cap=capRules&&capRules[season]?capRules[season].cap:null;
     let capPct=cap&&payM!=='—'?(payM*1e6/cap*100|0)+'%':'—';
     let wpm=payM!=='—'?(t.W/payM).toFixed(2):'—';
     let champ=''; if(season===FO.season_focus && t.abbr===Object.keys(FO.champion_map[season]||{})[0]) champ=`<span class="pill pill-yellow" style="font-size:9px;background:#FFD700;color:#000">👑 Champion ${season.slice(0,4)}</span>`;
     tr.innerHTML=`<td>${i+1}</td><td><span class="team-dot" style="background:${t.primary||'#fff'}"></span> <b>${t.abbr}</b> ${champ}</td><td>—</td><td>—</td><td>${t.W}</td><td>${payM!=='—'?`$${payM}M`:'—'}</td><td>${payM!=='—'?`$${payM}M`:'—'}</td><td>${wpm}</td><td>—</td><td>—</td><td>—</td><td>${capPct}</td>`;
     tr.onclick=()=>{if(typeof pick==='function'){let want=t.abbr; let foTeam=FO.teams_by_abbr[want]; if(foTeam) pick(want);}};
     bd.appendChild(tr);
   });
   let meta=document.getElementById('board-meta'); if(meta) meta.textContent=`${ts.length}T ${season} wins-ranked fun view · primary TODAY ${FO.season_focus}`;
   let title=document.getElementById('board-title'); if(title){let c=champTxt(FO.champion_map,season)||`${season} — Final`; title.textContent=`TIME MACHINE ${season} · ${c} · ring>seed`.slice(0,88)}
 }
 window.wireTimeMachine=async function(FO){
   let hist=await getHist(), pay=await getPay(), capRules=await getCap();
   // enhance capRules to map season->cap quickly
   let capMap={}; if(capRules){Object.keys(capRules).forEach(k=>{if(capRules[k]&&capRules[k].cap) capMap[k]=capRules[k]}); }
   document.querySelectorAll('#time-slider [data-season]').forEach(btn=>{
     btn.onclick=async ()=>{
       document.querySelectorAll('#time-slider [data-season]').forEach(b=>b.classList.remove('pill-yellow')); btn.classList.add('pill-yellow');
       let season=btn.dataset.season;
       let note=document.getElementById('time-note');
       if(season===FO.season_focus){
         if(note) note.textContent=`NYK 👑 53W 4-1 SAS ${FO.ethos||'ring > seed'}`;
         // restore FOR sort
         let ts=[...FO.teams].sort((a,b)=>b.for_score-a.for_score);
         if(typeof board==='function') board(ts);
         // trigger pick for champ
         let want=FO.champion_map&&FO.champion_map[season]?Object.keys(FO.champion_map[season])[0]:null;
         if(want&&typeof pick==='function') pick(want);
         let bt=document.getElementById('board-title'); if(bt) bt.textContent=`Today — End of ${FO.season_focus} · Champs First — ${FO.ethos||'Championship trumps'}`.slice(0,80);
         return;
       }
       // historic season
       if(note) note.textContent=champTxt(FO.champion_map,season)||`Showing ${season} — fun rank by wins · today still primary`;
       let seasonRec=hist?hist.find(x=>x.season===season):null;
       if(!seasonRec){ // fallback fetch direct team_base
         let tb=await fetchJSON(`/assets/data/team_base_${season}.json`);
         if(tb){
           // tb is list of TEAM_NAME? In assets it's list, else hist fallback
           // if assets/data/team_base_*.json is raw list, map via teams
           let teamsList=FO.teams||[];
           // crude map: try hist shape
         }
         return;
       }
       // enrich recs with colors
       let primMap={}; (FO.teams||[]).forEach(t=>{primMap[t.abbr]=t.primary});
       let ts=seasonRec.teams.map(r=>({abbr:r.abbr,W:r.W,L:r.L,W_PCT:r.W_PCT,primary:primMap[r.abbr]||'#fff'})).sort((a,b)=>b.W-a.W);
       boardHist(ts,season,FO,pay,capMap);
       // highlight top
       if(ts[0]&&typeof pick==='function'){let want=ts[0].abbr; let fm=FO.champion_map&&FO.champion_map[season]?Object.keys(FO.champion_map[season])[0]:want; if(fm) { let ft=FO.teams_by_abbr[fm]; if(ft) pick(fm); else { /* just keep first */ } } }
     };
   });
 }
})();
