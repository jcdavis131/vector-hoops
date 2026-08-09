(function(){
 const $=s=>document.querySelector(s);
 async function fetchJSON(u){try{let r=await fetch(u,{cache:'no-store'});if(!r.ok)throw 0;return await r.json()}catch(e){return null}}
 let cacheHist=null,cachePay=null,cacheCap=null,cacheBY=null;
 async function getHist(){if(cacheHist) return cacheHist;cacheHist=await fetchJSON('/assets/data/team_history.json');return cacheHist;}
 async function getPay(){if(cachePay) return cachePay;cachePay=await fetchJSON('/assets/data/payroll_by_season.json');return cachePay;}
 async function getCap(){if(cacheCap) return cacheCap;cacheCap=await fetchJSON('/assets/data/cap_rules.json');return cacheCap;}
 async function getBY(){if(cacheBY) return cacheBY;cacheBY=await fetchJSON('/assets/data/front_office_by_season.json')||await fetchJSON('/assets/front_office_by_season.json');return cacheBY;}
 function champTxt(map,s){if(!map||!map[s]) return '';let m=map[s];let parts=Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([a,v])=>`${a} ${v>=8?'Champion':v>=4?'Runner':'Conf'}+${v}`);return parts.join(' ')+` (${s})`}
 function boardHist(ts,season,FO,pay,capRules){
   let bd=document.getElementById('board-body'); if(!bd) return;
   bd.innerHTML=''; ts.forEach((t,i)=>{
     let tr=document.createElement('tr'); tr.className='lr'; tr.dataset.abbr=t.abbr;
     let payM=(pay&&pay[season]&&pay[season][t.abbr])||'—';
     let cap=capRules&&capRules[season]?capRules[season].cap:null;
     let capPct=cap&&payM!=='—'?(payM*1e6/cap*100|0)+'%':'—';
     let pw=(window.PO_WINS&&window.PO_WINS[season]&&window.PO_WINS[season][t.abbr])||0;
     let ww=pw? (t.W+pw*2.5).toFixed(1): t.W;
     let wpm=payM!=='—'?(ww/payM).toFixed(2):'—';
     let champ=''; if(FO.champion_map&&FO.champion_map[season]&&FO.champion_map[season][t.abbr]){champ=`<span class="pill pill-yellow" style=font-size:9px;background:#FFD700;color:#000>👑 ${season.slice(0,4)} +${FO.champion_map[season][t.abbr]}</span>`}
     tr.innerHTML=`<td>${i+1}</td><td><span class=tdot style="background:${t.primary||'#fff'}"></span><b>${t.abbr}</b> ${champ}</td><td>—<small style=opacity:.5> fun</small></td><td>—</td><td>${t.W}</td><td>${payM!=='—'?`$${payM}M`:'—'}</td><td>${payM!=='—'?`$${payM}M`:'—'}</td><td>${wpm}</td><td>—</td><td>—</td><td>—</td><td>${capPct}</td>`;
     tr.onclick=()=>{let fn=window.pick||window.__pick||null; if(fn){fn(t.abbr)} };
     bd.appendChild(tr);
   });
   let meta=document.getElementById('board-meta'); if(meta) meta.textContent=`${ts.length}T ${season} wins-ranked fun view · primary TODAY ${FO.season_focus} — no historic FOR yet`;
   let title=document.getElementById('board-title'); if(title){let c=champTxt(FO.champion_map,season)||`${season} — Final`; title.textContent=`FUN ${season} · ${c} · ring>seed (wins only)`.slice(0,88)}
 }
 function boardHistFull(ts,season,FO){
   // ts is already historic FO teams [{abbr,for_score,for_rank,draft_score,cap_score,foresight_score,w_per_m,vegas_delta,cap_pct,cap_pct_normalized,wins,...}]
   let bd=document.getElementById('board-body'); if(!bd) return;
   bd.innerHTML=''; ts.forEach((t,i)=>{
     let tr=document.createElement('tr'); tr.className='lr'; tr.dataset.abbr=t.abbr;
     let champ=''; if(t.champ_bonus){champ=`<span class="pill pill-yellow" style=font-size:9px;background:${t.champ_bonus>=8?'#FFD700':'#E8E8E8'};color:#000>${t.champ_bonus>=8?'👑 Champion':t.champ_bonus>=4?'🥈 Runner':'Conf'} +${t.champ_bonus}</span>`}
     let vchip=t.vegas_delta!=null?`<span style=font-size:9px;padding:2px 5px;border-radius:999px;background:${t.vegas_delta>0?'#E7F6EA':'#FFE9B5'};border:1px solid #1A150F>${t.vegas_delta>0?`+${t.vegas_delta}`:t.vegas_delta}</span>`:'';
     let capPctTxt = t.cap_pct_normalized!=null? `${(t.cap_pct_normalized*100).toFixed(0)}%<small style=opacity:.5 title="raw ${(t.cap_pct*100|0)}%">n</small>` : (t.cap_pct!=null? `${(t.cap_pct*100|0)}%`:'—');
     tr.innerHTML=`<td>${t.for_rank||i+1}</td><td><span class=tdot style="background:${t.primary||'#fff'}"></span><b>${t.abbr}</b> ${champ}</td><td><b>${t.for_score}</b>${t.champ_bonus?` <small style=opacity:.6>+${t.champ_bonus}</small>`:''}</td><td>${t.for_rank||i+1}</td><td title="W* ${t.weighted_wins||t.wins}">${t.wins||'—'}<small style=opacity:.5>/${t.weighted_wins||t.wins}</small> ${vchip}</td><td>${t.payroll_m!=null?`$${t.payroll_m}M`:t.pay_m!=null?`$${t.pay_m}M`:'—'}</td><td>${t.payroll_m!=null?`$${t.payroll_m}M`:'—'}</td><td>${t.w_per_m||'—'}</td><td>${t.draft_score!=null?t.draft_score:'—'}</td><td>${t.cap_score!=null?t.cap_score:'—'}</td><td>${t.foresight_score!=null?t.foresight_score:'—'}</td><td>${capPctTxt}</td>`;
     tr.onclick=()=>{let fn=window.pick||window.__pick||null; if(fn){fn(t.abbr)} };
     bd.appendChild(tr);
   });
   let meta=document.getElementById('board-meta'); if(meta) meta.textContent=`${ts.length}T ${season} HISTORIC FOR · cap% normalized ${season==='2016-17'?'spike 34%→n':''} · validity rOU/W ${FO._currCorr||'—'}`;
   let title=document.getElementById('board-title'); if(title){let c=champTxt(FO.champion_map,season)||`${season}`; title.textContent=`HISTORIC FOR ${season} · ${c} · true snapshot`.slice(0,90)}
 }
 window.wireTimeMachine=async function(FO){
   let hist=await getHist(), pay=await getPay(), capRules=await getCap(), bySeason=await getBY();
   let capMap={}; if(capRules){Object.keys(capRules).forEach(k=>{if(capRules[k]&&capRules[k].cap) capMap[k]=capRules[k]}); }
   window.PO_WINS=FO.playoff_wins||{}; window.PO_SERIES=FO.playoff_series_wins||{}; window.PO_WEIGHT=FO.playoff_win_weight||2.5;
   // expose validity corr for time-machine header if present
   if(bySeason&&bySeason.validity&&bySeason.validity.vegas_wins_corrs){
     let cur=bySeason.validity.vegas_wins_corrs.find(x=>x.season===FO.season_focus);
     if(cur) FO._currCorr = `r${cur.vegas_wins_corr} n${cur.n}`;
   }
   // also attach bySeason to FO for future pick detail
   window.FO_BY_SEASON = bySeason;
   document.querySelectorAll('#time-slider [data-season]').forEach(btn=>{
     btn.onclick=async ()=>{
       document.querySelectorAll('#time-slider [data-season]').forEach(b=>{b.classList.remove('pill-yellow'); b.classList.remove('is-active')}); btn.classList.add('pill-yellow'); btn.classList.add('is-active');
       let season=btn.dataset.season;
       let note=document.getElementById('time-note');
       if(season===FO.season_focus){
         if(note) note.textContent=`NYK 👑 53W 4-1 SAS ${FO.ethos||'ring > seed'} · today primary`;
         let ts=[...FO.teams].sort((a,b)=>b.for_score-a.for_score);
         let fn=window.board||window.__board||null; if(fn){fn(ts)} else { if(window.FO&&window.FO.teams){let bd=document.getElementById('board-body'); if(bd){bd.innerHTML='';}} }
         let want=FO.champion_map&&FO.champion_map[season]?Object.keys(FO.champion_map[season])[0]:null;
         let pickFn=window.pick||window.__pick||null; if(want&&pickFn) pickFn(want);
         let bt=document.getElementById('board-title'); if(bt) bt.textContent=`Today — End of ${FO.season_focus} · Champs First — ${FO.ethos||'Championship trumps'}`.slice(0,80);
         let meta=document.getElementById('board-meta'); if(meta) meta.textContent=`${ts.length}T sorted FOR · today primary`;
         return;
       }
       // historic season: try bySeason true historic first
       if(bySeason&&bySeason.by_season&&bySeason.by_season[season]){
         if(note) note.textContent=`HISTORIC FOR ${season} · true snapshot · cap% normalized ${season==='2016-17'?'spike':'ok'} · FOR = 0.35d+0.35c+0.30f+0.15vegas+0.08props`;
         let rec=bySeason.by_season[season];
         let teamsHist=rec.teams||[];
         // enrich primary colors
         let primMap={}; (FO.teams||[]).forEach(t=>{primMap[t.abbr]=t.primary});
         teamsHist=teamsHist.map(t=>({ ...t, primary: primMap[t.abbr]||'#fff'}));
         boardHistFull(teamsHist,season,FO);
         let fm=FO.champion_map&&FO.champion_map[season]?Object.keys(FO.champion_map[season])[0]: (teamsHist[0]&&teamsHist[0].abbr);
         let pickFn=window.pick||window.__pick||null; if(fm&&pickFn){let ft=FO.teams_by_abbr&&FO.teams_by_abbr[fm]; if(ft) pickFn(fm);}
         return;
       }
       if(bySeason&&bySeason.flat&&bySeason.flat[season]){
         if(note) note.textContent=`HISTORIC FOR ${season} · flat snapshot`;
         let teamsHist=bySeason.flat[season];
         let primMap={}; (FO.teams||[]).forEach(t=>{primMap[t.abbr]=t.primary});
         teamsHist=teamsHist.map(t=>({ ...t, primary: primMap[t.abbr]||'#fff'}));
         boardHistFull(teamsHist,season,FO);
         return;
       }
       // fallback wins-ranked fun
       if(note) note.textContent=champTxt(FO.champion_map,season)||`Showing ${season} — fun rank by wins only · today still primary · historic FOR not yet cached`;
       let seasonRec=hist?hist.find(x=>x.season===season):null;
       if(!seasonRec){
         let tb=await fetchJSON(`/assets/data/team_base_${season}.json`);
         if(tb && Array.isArray(tb)){
           // tb is raw TEAM_ID list, convert
           let abbrFromId={}; try{let td=await fetchJSON('/assets/teams.json'); if(td&&td.teams) td.teams.forEach(t=>{abbrFromId[t.id]=t.abbr})}catch(e){}
           let ts=tb.map(r=>({abbr: abbrFromId[r.TEAM_ID]||r.TEAM_ABBR||'UNK', W: r.W, L:r.L, W_PCT:r.W_PCT, primary:'#fff'})).filter(x=>x.abbr!=='UNK').sort((a,b)=>b.W-a.W);
           let primMap={}; (FO.teams||[]).forEach(t=>{primMap[t.abbr]=t.primary});
           ts=ts.map(t=>({...t,primary:primMap[t.abbr]||'#fff'}));
           boardHist(ts,season,FO,pay,capMap);
           return;
         }
         return;
       }
       let primMap={}; (FO.teams||[]).forEach(t=>{primMap[t.abbr]=t.primary});
       let ts=seasonRec.teams.map(r=>({abbr:r.abbr,W:r.W,L:r.L,W_PCT:r.W_PCT,primary:primMap[r.abbr]||'#fff'})).sort((a,b)=>b.W-a.W);
       boardHist(ts,season,FO,pay,capMap);
     };
   });
 }
})();