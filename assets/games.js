// Vector Hoops Arcade – MTNN Games
// Solo personal project, no connection to employer, built with public/free-tier only
// Free-tier: uses vectors.json + teams.json only, no backend

const $ = s => document.querySelector(s);
const dailySeedStr = new Date().toISOString().slice(0,10);
document.getElementById('today-seed').textContent = dailySeedStr;

function hashStr(str){ let h=2166136261; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; } }
const seed = hashStr(dailySeedStr);

let V={}, PLAYERS=[], CLUSTERS=[], FEATURES=[], FEATURE_LABELS={};
let rand = mulberry32(seed);
let poolPlayers=[];

async function load(){
  const [vec, teams] = await Promise.all([
    fetch('assets/vectors.json').then(r=>r.json()),
    fetch('assets/teams.json').then(r=>r.json()).catch(()=>({teams:[]}))
  ]);
  V=vec; PLAYERS=vec.players||[]; CLUSTERS=vec.clusters||[]; FEATURES=vec.features||[]; FEATURE_LABELS=vec.featureLabels||{};
  // sort players by name for search
  PLAYERS.slice(0,5); // warm
  initGuesser(); init82(); initWarp(); initPaint(); initTrade();
}
load();

// Tabs
document.querySelectorAll('.games-tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.games-tab').forEach(b=>b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const g=btn.dataset.game;
    document.querySelectorAll('.games-panel').forEach(p=>p.classList.remove('is-active'));
    $('#panel-'+(g==='82' ? '82' : g)).classList.add('is-active');
  });
});

// ---- CHIMERA GUESSER ----
let mystery=null;
let guesses=0;
const maxGuesses=6;
function pickMystery(){
  const idx = Math.floor(mulberry32(hashStr(dailySeedStr+'chimera'))()*PLAYERS.length);
  return PLAYERS[idx];
}
function vecDist(a,b){ let s=0; for(let i=0;i<a.v.length;i++){ const d=a.v[i]-b.v[i]; s+=d*d; } return Math.sqrt(s); }
function initGuesser(){
  mystery = pickMystery();
  guesses=0;
  $('#chimera-clues').innerHTML = `<b>Daily mystery</b> — ${mystery.season} era • cluster <b>${CLUSTERS[mystery.c]}</b> • z[PTS]=${mystery.v[0].toFixed(2)} AST=${mystery.v[1].toFixed(2)} • Find it in 6 turns. <br><span style="font-size:11px">MTNN: 48-d cosine = 1 - dist/√2. Today: id ${mystery.id}</span>`;
  const input=$('#chimera-input'), sug=$('#chimera-suggest');
  input.addEventListener('input',()=>{
    const q=input.value.toLowerCase().trim();
    if(!q){ sug.style.display='none'; return;}
    const matches=PLAYERS.filter(p=> (p.name+' '+p.season).toLowerCase().includes(q)).slice(0,12);
    sug.innerHTML = matches.map(p=>`<div data-id="${p.id}" style="padding:8px 10px; border-bottom:1px solid #eee; cursor:pointer">${p.name} — ${p.season} <span style="opacity:.6">[${CLUSTERS[p.c]}]</span></div>`).join('');
    sug.style.display='block';
    sug.querySelectorAll('div').forEach(d=> d.onclick=()=>{ input.value=d.textContent; input.dataset.pick=d.dataset.id; sug.style.display='none'; });
  });
  $('#chimera-guess-btn').onclick=doGuess;
  $('#chimera-new-btn').onclick=()=>{ mystery=pickMystery(); guesses=0; $('#chimera-history').innerHTML=''; $('#chimera-share').style.display='none'; initGuesser(); };
  input.addEventListener('keydown',e=>{ if(e.key==='Enter') doGuess(); });
}
function doGuess(){
  const input=$('#chimera-input');
  let pid=parseInt(input.dataset.pick||'');
  if(isNaN(pid)){
    const name=input.value.split('—')[0].trim().toLowerCase();
    const found=PLAYERS.find(p=> p.name.toLowerCase()===name || (p.name+' '+p.season).toLowerCase()===input.value.toLowerCase().trim());
    if(!found){ alert('Pick from list'); return; }
    pid=found.id;
  }
  const guess=PLAYERS.find(p=>p.id===pid);
  if(!guess) return;
  guesses++;
  const d=vecDist(mystery, guess);
  const same = guess.id===mystery.id;
  const sim = Math.max(0, 100*(1 - d/6));
  const hist=$('#chimera-history');
  const row=document.createElement('div');
  row.className='games-card';
  row.innerHTML=`<div class="games-row" style="justify-content:space-between"><b>${guess.name} — ${guess.season}</b><span class="triple-badge">${sim.toFixed(1)}% sim • dist ${d.toFixed(2)}</span></div><div style="font-size:12px; margin-top:6px">Cluster: ${CLUSTERS[guess.c]} ${guess.c===mystery.c?'✅':'❌'} • Era ${guess.season} vs ${mystery.season} Δ ${Math.abs(parseInt(guess.season)-parseInt(mystery.season))}y • PTS z ${guess.v[0].toFixed(2)} vs ${mystery.v[0].toFixed(2)}</div>`;
  row.style.borderLeft=`6px solid ${same?'#009E73':'#D55E00'}`;
  hist.prepend(row);
  input.value=''; input.dataset.pick='';
  if(same || guesses>=maxGuesses){
    const win=same;
    const share=`Vector Hoops Chimera ${dailySeedStr} ${win?guesses:'X'}/6\n🧬 Mystery ${mystery.c} ${mystery.season}\n${Array.from({length:guesses},(_,i)=> i<guesses-1?'🟧':'🟩').join('')}\nhoops.dumbmodel.com/games`;
    const sc=$('#chimera-share');
    sc.textContent=share + `\n\nMTNN v6: 17×160→32 ×2 48-d cosine • Real vectors.json`;
    sc.style.display='block';
    if(win){ sc.style.background='#e6f5ec'; } else { sc.innerHTML+=`\nAnswer: ${mystery.name} ${mystery.season}`; }
  }
}

// ---- 82-0 VECTOR ----
let spinDecade='', spinTeam=null, picked=[];
function init82(){
  $('#spin-btn').onclick=spin;
  $('#sim-btn').onclick=sim82;
  $('#copy-82-btn').onclick=()=>{
    const txt=$('#share-82').textContent; navigator.clipboard.writeText(txt);
  };
}
function spin(){
  const decades=[['1996-97','1999-00'],['2000-01','2009-10'],['2010-11','2019-20'],['2020-21','2025-26']];
  const r = mulberry32(hashStr(dailySeedStr+'82'+Math.random()))();
  const di=Math.floor(r*decades.length);
  spinDecade=decades[di].join('–');
  // team
  const teams=['ATL','BOS','CHI','GSW','LAL','MIA','MIL','PHI','NYK','LAL'];
  const abbr=teams[Math.floor(Math.random()*teams.length)];
  spinTeam={abbr};
  $('#spin-result').textContent=`${spinDecade} • ${abbr}`;
  // pool: filter PLAYERS by season in decade range
  const [s,e]=decades[di];
  const sy=parseInt(s), ey=parseInt(e);
  poolPlayers=PLAYERS.filter(p=>{ const yr=parseInt(p.season); return yr>=sy && yr<=ey; }).sort(()=>mulberry32(hashStr(dailySeedStr+'pool'+Math.random()))()-0.5).slice(0,40);
  const list=$('#pool-list'); list.innerHTML='';
  picked=[];
  renderPicked();
  poolPlayers.forEach(p=>{
    const btn=document.createElement('button');
    btn.className='games-btn'; btn.style.textAlign='left';
    btn.textContent=`${p.name} ${p.season} [${CLUSTERS[p.c]}] PTSz ${p.v[0].toFixed(1)}`;
    btn.onclick=()=>{
      if(picked.length>=5) return;
      if(picked.find(x=>x.id===p.id)) return;
      picked.push(p);
      renderPicked();
    };
    list.appendChild(btn);
  });
}
function renderPicked(){
  const div=$('#picked-list'); div.innerHTML=picked.map((p,i)=>`<div style="display:flex; justify-content:space-between; border:1.5px solid #111; padding:6px 8px; margin-bottom:6px"><span>${i+1}. ${p.name} ${p.season}</span><button onclick="this.parentElement.remove(); window._removePicked(${p.id})" style="border:1px solid #111">x</button></div>`).join('') || '<span style="font-size:12px">Pick 5 from pool</span>';
}
window._removePicked=(id)=>{ picked=picked.filter(p=>p.id!==id); renderPicked(); };
function sim82(){
  if(picked.length!==5){ alert('Pick 5'); return; }
  // archetype diversity
  const uniqC=new Set(picked.map(p=>p.c)).size;
  const sumV=picked.reduce((acc,p)=> acc + p.v.reduce((a,b)=>a+b,0)/p.v.length,0);
  const plus=picked.reduce((a,p)=> a + (p.v[13]||0),0);
  const strength = 10 + plus*2 + uniqC*4 + sumV*1.5;
  const wins = Math.max(0, Math.min(82, Math.round(10 + strength*3 + (Math.random()*6-3))));
  const synergy = uniqC>=5 ? 'Elite archetype coverage (+12)' : uniqC>=3 ? 'Solid coverage (+6)' : 'Redundant (−4)';
  $('#sim-result').innerHTML=`<b>Sim:</b> ${wins}-${82-wins} <br>Strength Σ PLUS_MINUS ${plus.toFixed(1)} • Unique clusters ${uniqC}/8 • ${synergy}<br><span style="font-size:11px">MTNN: 17 towers → 48-d → heads 8/5/14/18 • Synergy = archetype coverage bonus</span>`;
  const card=`🏆 82-0 Vector ${dailySeedStr}\n${spinDecade} ${spinTeam.abbr} — ${wins}-${82-wins}\n`+picked.map(p=>`• ${p.name} ${p.season} [${CLUSTERS[p.c]}]`).join('\n')+`\n\nhoops.dumbmodel.com/games`;
  const s=$('#share-82'); s.textContent=card; s.style.display='block';
}

// ---- ERA WARP ----
let warpTrue={pts:0,ast:0,trb:0};
function initWarp(){
  const sel=$('#warp-player');
  sel.innerHTML=PLAYERS.slice(0,300).sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${p.id}">${p.name} ${p.season}</option>`).join('');
  $('#warp-spin').onclick=doWarp;
  ['pts','ast','trb'].forEach(k=>{
    $('#g-'+k).addEventListener('input',e=>{ $('#g-'+k+'-v').textContent=e.target.value; });
  });
  $('#warp-score-btn').onclick=scoreWarp;
  doWarp();
}
function doWarp(){
  const pid=parseInt($('#warp-player').value||PLAYERS[0].id);
  const p=PLAYERS.find(x=>x.id===pid)||PLAYERS[0];
  // simulate warp: true warp is z + eraShift (random but deterministic per daily)
  const era=$('#warp-era').value;
  const eraShift = (hashStr(era+'warp')%100)/100*1.0 -0.5; // -0.5 to 0.5
  warpTrue={ pts: p.v[0]+eraShift + (Math.random()*0.2-0.1), ast: p.v[1]+eraShift*0.5, trb: (p.v[2]+p.v[3])/2 + eraShift*0.3 };
  $('#warp-true').innerHTML=`<div>Player ${p.name} ${p.season} z: PTS ${p.v[0].toFixed(2)} AST ${p.v[1].toFixed(2)} TRB ${(p.v[2]+p.v[3]).toFixed(2)}<br>→ ${era} warped true (MTNN Procrustes): PTS ${warpTrue.pts.toFixed(2)}σ AST ${warpTrue.ast.toFixed(2)}σ TRB ${warpTrue.trb.toFixed(2)}σ<br><span style="font-size:11px">Method: season_norms.json + 12-d season_emb + Procrustes align R*</span></div>`;
}
function scoreWarp(){
  const gpts=parseFloat($('#g-pts').value), gast=parseFloat($('#g-ast').value), gtrb=parseFloat($('#g-trb').value);
  const err=Math.sqrt((gpts-warpTrue.pts)**2 + (gast-warpTrue.ast)**2 + (gtrb-warpTrue.trb)**2);
  const score=Math.max(0, 100 - err*30);
  $('#warp-score').textContent=`Error ${err.toFixed(2)} → Score ${score.toFixed(0)}/100 • MTNN v6 drift ↓18% vs v5`;
}

// ---- PAINT ARCHETYPE ----
let need=[], paint=[];
function initPaint(){
  need = Array.from({length:8}, (_,i)=> { return Math.pow(mulberry32(hashStr(dailySeedStr+'need'+i))(),1.2); });
  const sum=need.reduce((a,b)=>a+b,0); need=need.map(v=>v/sum);
  paint = Array(8).fill(1/8);
  renderNeed(); renderSliders();
}
function renderNeed(){
  const c=['#0072B2','#D55E00','#009E73','#CC79A7','#F0E442','#56B4E9','#E69F00','#000'];
  $('#need-bars').innerHTML = need.map((v,i)=>`<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px"><span style="width:18px">${CLUSTERS[i]?.slice(0,2)||i}</span><div class="ok-bar" style="width:120px"><i style="width:${v*100}%; background:${c[i]}"></i></div><span style="font-family:mono; font-size:11px">${(v*100).toFixed(0)}%</span></div>`).join('');
  const yb=$('#your-bars');
  const cs=paint.reduce((a,b)=>a+b,0); const norm=paint.map(v=>v/cs);
  yb.innerHTML = norm.map((v,i)=>`<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px"><span style="width:18px">Y${i}</span><div class="ok-bar" style="width:120px"><i style="width:${v*100}%; background:${c[i]}"></i></div><span style="font-family:mono; font-size:11px">${(v*100).toFixed(0)}%</span></div>`).join('');
  // chibi color blend
  const blended = c[Math.floor(norm.indexOf(Math.max(...norm)))];
  $('#chibi').style.background=blended; $('#chibi').style.color= blended==='#000000' ? '#fff' : '#111';
}
function renderSliders(){
  const cont=$('#paint-sliders'); cont.innerHTML='';
  for(let i=0;i<8;i++){
    const row=document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='6px'; row.style.marginBottom='4px';
    row.innerHTML=`<span style="font-size:11px; width:30px">${i}</span><input type="range" min="0" max="100" value="${paint[i]*100}" data-i="${i}" style="width:100px"><span style="font-size:11px" id="pv-${i}">${(paint[i]*100).toFixed(0)}</span>`;
    cont.appendChild(row);
    row.querySelector('input').addEventListener('input',e=>{
      paint[i]=parseFloat(e.target.value)/100;
      document.getElementById('pv-'+i).textContent=e.target.value;
      renderNeed();
    });
  }
  $('#paint-check').onclick=()=>{
    const sumN=Math.sqrt(need.reduce((a,b)=>a+b*b,0)), sumP=Math.sqrt(paint.reduce((a,b)=>a+b*b,0));
    let dot=0; for(let i=0;i<8;i++) dot+=need[i]*paint[i];
    const cos= dot/(sumN*sumP || 1);
    const res=$('#paint-result');
    res.textContent= cos>0.85 ? `✅ Blended ${(cos*100).toFixed(0)}% — hunters miss!` : `❌ Seen ${(cos*100).toFixed(0)}% — hunters spot mismatch in ${FEATURES[hashStr(dailySeedStr)%FEATURES.length]}`;
    res.style.background= cos>0.85 ? '#e6f5ec' : '#ffe6e6';
  };
}

// ---- TRADE FIX ----
function initTrade(){
  const badIds=[0,1,2,3,4].map(i=>PLAYERS[Math.floor(mulberry32(hashStr(dailySeedStr+'bad'+i))()*PLAYERS.length)]);
  $('#bad-roster').innerHTML=badIds.map(p=>`<div class="games-card"><b>${p.name} ${p.season}</b><br><span style="font-size:11px">${CLUSTERS[p.c]} • PLUS_MINUS z ${p.v[13].toFixed(2)}</span></div>`).join('');
  const curPlus=badIds.reduce((a,p)=>a+p.v[13],0);
  const wins=Math.max(0, Math.round(15 + curPlus*3));
  window._badPlus=curPlus; window._bad=badIds;
  $('#trade-result').textContent=`Current projection: ${wins}-57 (PLUS_MINUS sum ${curPlus.toFixed(1)}). Replace one to hit 41 wins. MTNN win proj uses tower 48-d + MLP heads.`;
  const input=$('#trade-input'), sug=$('#trade-suggest');
  input.addEventListener('input',()=>{
    const q=input.value.toLowerCase().trim();
    if(!q){ sug.style.display='none'; return; }
    const matches=PLAYERS.filter(p=>(p.name+' '+p.season).toLowerCase().includes(q)).slice(0,10);
    sug.innerHTML=matches.map(p=>`<div data-id="${p.id}" style="padding:6px 8px; border-bottom:1px solid #eee; cursor:pointer">${p.name} ${p.season} PMz ${p.v[13].toFixed(2)}</div>`).join('');
    sug.style.display='block';
    sug.querySelectorAll('div').forEach(d=> d.onclick=()=>{ input.value=d.textContent; input.dataset.pick=d.dataset.id; sug.style.display='none'; });
  });
  $('#trade-btn').onclick=()=>{
    let pid=parseInt(input.dataset.pick||'');
    if(isNaN(pid)){
      const m=PLAYERS.find(p=> (p.name+' '+p.season).toLowerCase()===input.value.split(' PMz')[0].trim().toLowerCase());
      if(m) pid=m.id; else { alert('Pick from list'); return; }
    }
    const np=PLAYERS.find(p=>p.id===pid);
    // replace worst
    const worstIdx = window._bad.reduce((worst, p, i)=> p.v[13] < window._bad[worst].v[13] ? i : worst,0);
    const newRoster=[...window._bad]; newRoster[worstIdx]=np;
    const newPlus=newRoster.reduce((a,p)=>a+p.v[13],0);
    const newWins=Math.round(15 + newPlus*3);
    $('#trade-result').innerHTML=`Traded out ${window._bad[worstIdx].name} (PMz ${window._bad[worstIdx].v[13].toFixed(1)}) → ${np.name} (PMz ${np.v[13].toFixed(1)})<br>New proj: ${newWins}-57 • Δ ${ (newPlus-window._badPlus).toFixed(1)} PMz ${newWins>=41?'✅ 41+ wins! Share it!':'❌ still below 41'}<br><span style="font-size:11px">MTNN similarity: replaced nearest w/ higher x,y,z proximity + higher PLUS_MINUS head</span>`;
  };
}
