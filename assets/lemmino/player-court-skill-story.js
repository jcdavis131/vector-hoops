/* player-court-skill-story.js v31 — big focal court for every player's skill profile • skills change over time */
export async function mountPlayerCourtStory(rootEl, playerName, opts = {}) {
  if (!rootEl || !playerName) return;
  const isMobile = window.innerWidth < 760;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.8);

  const OKABE = ['#0072B2', '#D55E00', '#009E73', '#F0E442', '#56B4E9', '#CC79A7', '#E69F00', '#111111'];
  const ARCH = [
    { i: 0, label: 'Glass+Rim', off: 32, def: 92, color: OKABE[0], role: 'Rim Anchor', emoji: '🛡️' },
    { i: 1, label: 'LowVol Glass', off: 22, def: 88, color: OKABE[1], role: 'Energy Big', emoji: '🔋' },
    { i: 2, label: 'Low Impact', off: 24, def: 28, color: OKABE[2], role: 'Deep Reserve', emoji: '🪑' },
    { i: 3, label: 'Def Glass FT', off: 46, def: 71, color: OKABE[3], role: 'Two-Way Big', emoji: '⚖️' },
    { i: 4, label: 'Vol+3P', off: 88, def: 34, color: OKABE[4], role: 'Volume Scorer', emoji: '🔥' },
    { i: 5, label: '3P Acc+Vol', off: 84, def: 38, color: OKABE[5], role: 'Floor Spacer', emoji: '🎯' },
    { i: 6, label: 'Playmaking', off: 76, def: 66, color: OKABE[6], role: 'Lead Playmaker', emoji: '🧠' },
    { i: 7, label: 'Scoring Vol', off: 91, def: 40, color: OKABE[7], role: 'Bucket Getter', emoji: '🪣' },
  ];
  const POS_LABELS = ['PG', 'SG', 'SF', 'PF', 'C'];
  const POS_OFF = { PG: { x: -7, y: 6 }, SG: { x: 7, y: 5 }, SF: { x: 10, y: 2 }, PF: { x: 2, y: -2 }, C: { x: 0, y: -4 } };

  const CACHE = 'vector-hoops-v31-player-court-20260721';
  async function cachedFetchJSON(url) {
    try { if ('caches' in window) { const c = await caches.open(CACHE); const hit = await c.match(url); if (hit) return await hit.json(); } } catch { }
    const r = await fetch(url, { cache: 'default' });
    try { if ('caches' in window) { const c = await caches.open(CACHE); c.put(url, r.clone()).catch(() => { }); } } catch { }
    return r.json();
  }

  // scaffold UI
  rootEl.innerHTML = `
    <div id="pp-court-wrap" style="border:3px solid #1A150F;border-radius:20px;overflow:hidden;background:#FFFEF7;box-shadow:8px 8px 0 #1A150F">
      <div style="padding:16px 18px;background:#1A150F;color:#FFFEF7;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <span style="background:#FFFEF7;color:#1A150F;border-radius:999px;padding:7px 12px;font-family:ui-monospace,monospace;font-weight:900;font-size:12px">Career Floor • 1 of 5 / 1 of 15</span>
          <span style="font-family:ui-monospace,monospace;font-size:11px;opacity:.7">tap court • drag slider • where paint meets arc + how skills shift</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="pp-court-play" style="min-height:44px;padding:0 14px;border:2.5px solid #FFFEF7;border-radius:999px;background:#F0E442;color:#1A150F;font-weight:900;font-family:ui-monospace,monospace;cursor:pointer">▶ Play</button>
          <button id="pp-court-prev" style="min-height:44px;min-width:44px;border:2px solid #FFFEF7;border-radius:999px;background:transparent;color:#FFFEF7;font-weight:900;cursor:pointer">⟵</button>
          <button id="pp-court-next" style="min-height:44px;min-width:44px;border:2px solid #FFFEF7;border-radius:999px;background:transparent;color:#FFFEF7;font-weight:900;cursor:pointer">⟶</button>
        </div>
      </div>
      <div style="position:relative">
        <canvas id="pp-court-canvas" style="width:100%;height:${isMobile ? '68vh' : '62vh'};min-height:${isMobile ? '520px' : '560px'};display:block;background:#FFF6D5"></canvas>
        <div id="pp-court-focus" style="position:absolute;left:12px;right:12px;top:12px;pointer-events:none;display:flex;flex-direction:column;gap:8px"></div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;padding:12px 16px;background:#FFFEF7;border-top:3px solid #1A150F">
        <div id="pp-court-scrub" style="flex:1;height:26px;background:#fff;border:3px solid #1A150F;border-radius:999px;position:relative;cursor:pointer;box-shadow:2px 2px 0 #1A150F"><div id="pp-court-fill" style="position:absolute;left:0;top:0;bottom:0;width:0%;background:#1A150F;border-radius:999px"></div><div id="pp-court-thumb" style="position:absolute;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:999px;background:#F0E442;border:2.5px solid #1A150F;left:0"></div></div>
      </div>
      <div id="pp-court-season-chips" style="display:flex;gap:8px;overflow-x:auto;padding:12px 16px;background:#FFFEF7;border-top:2px solid #1A150F"></div>
      <div id="pp-court-skills" style="padding:16px;background:#FFFEF7;border-top:3px solid #1A150F;display:grid;grid-template-columns:${isMobile ? '1fr' : '1fr 1fr'};gap:14px"></div>
      <div id="pp-court-roster" style="padding:14px 16px;background:#ECE7DB;border-top:3px solid #1A150F"></div>
    </div>
  `;

  const canvas = rootEl.querySelector('#pp-court-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const focusEl = rootEl.querySelector('#pp-court-focus');
  const scrub = rootEl.querySelector('#pp-court-scrub');
  const scrubFill = rootEl.querySelector('#pp-court-fill');
  const scrubThumb = rootEl.querySelector('#pp-court-thumb');
  const seasonChips = rootEl.querySelector('#pp-court-season-chips');
  const skillsEl = rootEl.querySelector('#pp-court-skills');
  const rosterEl = rootEl.querySelector('#pp-court-roster');
  const btnPlay = rootEl.querySelector('#pp-court-play');
  const btnPrev = rootEl.querySelector('#pp-court-prev');
  const btnNext = rootEl.querySelector('#pp-court-next');

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(420, Math.floor(rect.height));
    const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { cssW: w, cssH: h };
  }

  // fetch
  let timeData, liteData, vecData, teamData, skillsData, vectorsLite;
  try {
    const [tData, lPos, vData, tmData, sData, vLite] = await Promise.all([
      cachedFetchJSON('assets/archetypes_time.json?v=31'),
      cachedFetchJSON('assets/vectors_search_lite_pos.json?v=31').catch(() => cachedFetchJSON('assets/vectors_search_lite.json?v=31')),
      cachedFetchJSON('assets/vectors.json?v=31').catch(() => null),
      cachedFetchJSON('assets/player_team_season.json?v=31').catch(() => null),
      cachedFetchJSON('assets/skills.json?v=31').catch(() => null),
      cachedFetchJSON('assets/vectors.json?v=31').catch(() => null), // same as vecData, but for index mapping
    ]);
    timeData = tData; liteData = lPos; vecData = vData; teamData = tmData; skillsData = sData; vectorsLite = vLite;
  } catch (e) { console.warn('pp court fetch fail', e); return; }

  const seasons = timeData?.prevalence || [];
  const seasonIdx = new Map(seasons.map((s, i) => [s.season, i]));
  const tmpPlayers = liteData?.players || liteData || [];
  const byName = new Map(); const playerSeasonLookup = new Map();
  for (const p of tmpPlayers) {
    if (!byName.has(p.n)) byName.set(p.n, []);
    byName.get(p.n).push(p);
    playerSeasonLookup.set(`${p.n}|${p.s}`, p);
  }
  for (const arr of byName.values()) arr.sort((a, b) => (a.s || '').localeCompare(b.s || ''));

  const minutesMap = new Map();
  if (vecData?.players) { for (const p of vecData.players) minutesMap.set(`${p.name}|${p.season}`, { gp: p.gp || 0, mpg: p.mpg || 0 }); }

  // skills index: skillsData.skills is 12 array, grades is 12966 array aligned with vectors.json players order
  let skillsByKey = new Map();
  if (skillsData && vecData) {
    // vecData.players same order as skills grades
    for (let i = 0; i < vecData.players.length; i++) {
      const pl = vecData.players[i];
      skillsByKey.set(`${pl.name}|${pl.season}`, skillsData.grades[i]);
    }
  }
  const teamMap = teamData || {};
  const teamSeasonRoster = new Map();
  for (const key of Object.keys(teamMap)) {
    const sep = key.lastIndexOf('|'); if (sep < 0) continue;
    const name = key.slice(0, sep), season = key.slice(sep + 1), team = teamMap[key];
    if (!team) continue;
    const tsKey = `${team}|${season}`;
    if (!teamSeasonRoster.has(tsKey)) teamSeasonRoster.set(tsKey, []);
    const entry = playerSeasonLookup.get(key);
    const min = minutesMap.get(key);
    teamSeasonRoster.get(tsKey).push({ name, season, team, c: entry?.c ?? 2, p: entry?.p ?? 2, pl: entry?.pl || POS_LABELS[entry?.p] || 'SF', mpg: min?.mpg || 0, gp: min?.gp || 0 });
  }
  for (const arr of teamSeasonRoster.values()) arr.sort((a, b) => b.mpg - a.mpg || b.gp - a.gp);

  function getCourtPos(archeIdx, posLabel, seed = 0) {
    const base = ARCH[archeIdx % 8];
    const off = POS_OFF[posLabel] || POS_OFF['SF'];
    const jx = ((seed * 0.618033) % 1 - 0.5) * 1.2;
    const jy = ((seed * 0.314159) % 1 - 0.5) * 1.0;
    return { x: (base.x || 0) + off.x + jx, y: (base.y || 10) + off.y + jy, meta: base };
  }

  function buildArc(name) {
    const entries = byName.get(name) || [];
    if (!entries.length) return null;
    const meta = [];
    for (const e of entries) {
      const si = seasonIdx.get(e.s); if (si === undefined) continue;
      const key = `${e.n}|${e.s}`;
      const min = minutesMap.get(key);
      const team = teamMap[key] || '—';
      const posLabel = e.pl || POS_LABELS[e.p] || 'SF';
      const cp = getCourtPos(e.c, posLabel, si);
      const skillGrades = skillsByKey.get(key) || null;
      meta.push({ season: e.s, si, archeIdx: e.c, archLabel: ARCH[e.c]?.label || `A${e.c}`, team, pl: posLabel, mpg: min?.mpg || 0, gp: min?.gp || 0, x: cp.x, y: cp.y, off: ARCH[e.c]?.off || 50, def: ARCH[e.c]?.def || 50, role: ARCH[e.c]?.role || '', color: ARCH[e.c]?.color || '#1A150F', skillGrades });
    }
    meta.sort((a, b) => a.season.localeCompare(b.season));
    const changes = []; for (let i = 1; i < meta.length; i++) if (meta[i].archeIdx !== meta[i - 1].archeIdx) changes.push({ idx: i, from: meta[i - 1], to: meta[i] });
    return { name, meta, changes };
  }

  let current = buildArc(playerName);
  if (!current) { rootEl.innerHTML = `<div style="padding:14px;font-family:ui-monospace,monospace">No career data for ${playerName}</div>`; return; }
  let tProg = 0, paused = true, autoPauseUntil = 0, layoutCache = null;

  function ftToScreen(ftX, ftY, L) { return { x: L.cx + ftX * L.scale, y: L.baseY - ftY * L.scale }; }
  function makeLayout(cssW, cssH) {
    const pad = 18; const courtH = cssH * 0.82; const courtW = cssW - pad * 2;
    const scale = Math.min(courtH / 49, courtW / 52);
    const cx = cssW / 2, baseY = cssH * 0.90;
    return { cx, baseY, scale, cssW, cssH };
  }
  function drawBg(cssW, cssH, teamAbbr) {
    ctx.fillStyle = '#FFF6D5'; ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = 'rgba(26,21,15,0.05)'; ctx.lineWidth = 1;
    for (let y = 0; y < cssH; y += 20) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(cssW, y + 0.5); ctx.stroke(); }
    if (teamAbbr && teamAbbr !== '—') { ctx.save(); ctx.globalAlpha = 0.06; ctx.font = `900 ${Math.floor(cssW * 0.28)}px ui-sans-serif,system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#1A150F'; ctx.fillText(teamAbbr, cssW / 2, cssH * 0.32); ctx.restore(); }
  }
  function drawCourt(L) {
    const { cx, baseY, scale, cssW } = L;
    const bl = ftToScreen(-25, 0, L), br = ftToScreen(25, 0, L), tr = ftToScreen(25, 47, L), tl = ftToScreen(-25, 47, L);
    ctx.strokeStyle = '#1A150F'; ctx.lineWidth = 3; ctx.strokeRect(tl.x, tl.y, tr.x - tl.x, bl.y - tl.y);
    ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.stroke();
    const pL = ftToScreen(-8, 0, L), pR = ftToScreen(8, 0, L), pT = ftToScreen(8, 19, L);
    ctx.fillStyle = 'rgba(26,21,15,0.07)'; ctx.fillRect(pL.x, pT.y, pR.x - pL.x, pL.y - pT.y);
    ctx.strokeStyle = '#1A150F'; ctx.lineWidth = 2.2; ctx.strokeRect(pL.x, pT.y, pR.x - pL.x, pL.y - pT.y);
    const ftC = ftToScreen(0, 19, L); const r6 = 6 * scale;
    ctx.beginPath(); ctx.arc(ftC.x, ftC.y, r6, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(26,21,15,0.5)'; ctx.beginPath(); ctx.arc(ftC.x, ftC.y, r6, 0, Math.PI); ctx.stroke(); ctx.setLineDash([]);
    const basket = ftToScreen(0, 5.25, L); const back1 = ftToScreen(-3, 4, L), back2 = ftToScreen(3, 4, L);
    ctx.strokeStyle = '#1A150F'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(back1.x, back1.y); ctx.lineTo(back2.x, back2.y); ctx.stroke();
    ctx.strokeStyle = '#E03A3E'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(basket.x, basket.y, 0.9 * scale, 0, Math.PI * 2); ctx.stroke();
    const leftCorner = ftToScreen(-22, 0, L), leftElb = ftToScreen(-22, 14, L), rightElb = ftToScreen(22, 14, L), rightCorner = ftToScreen(22, 0, L); const r = 23.75 * scale;
    ctx.strokeStyle = '#1A150F'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(leftCorner.x, leftCorner.y); ctx.lineTo(leftElb.x, leftElb.y);
    const angL = Math.atan2(leftElb.y - basket.y, leftElb.x - basket.x), angR = Math.atan2(rightElb.y - basket.y, rightElb.x - basket.x);
    ctx.arc(basket.x, basket.y, r, angL, angR, false); ctx.lineTo(rightCorner.x, rightCorner.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(basket.x, basket.y, 4 * scale, 0, Math.PI); ctx.stroke();
    ctx.fillStyle = '#1A150F'; ctx.font = `800 11px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.globalAlpha = 0.7;
    ctx.fillText('1 OF 15 ROSTER → 1 OF 5 ON FLOOR', cx, baseY + 14); ctx.globalAlpha = 1;
  }

  function renderSeasonChips() {
    const idx = Math.min(Math.floor(tProg * current.meta.length), current.meta.length - 1);
    seasonChips.innerHTML = '';
    current.meta.forEach((m, i) => {
      const b = document.createElement('button');
      b.style.cssText = `border-radius:999px;padding:10px 14px;font-family:ui-monospace,monospace;font-size:12px;font-weight:800;border:3px solid #1A150F;flex:0 0 auto;cursor:pointer;${i===idx?'background:#1A150F;color:#FFFEF7;box-shadow:4px 4px 0 #1A150F;transform:translateY(-2px)': i<idx?'background:#fff;color:#1A150F;box-shadow:2px 2px 0 #1A150F':'background:#ECE7DB;color:#6B6760;border-style:dashed'}`;
      b.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${m.color};border:1.5px solid #1A150F;margin-right:6px"></span>${m.season} ${m.archLabel} • ${m.mpg.toFixed(0)} MPG`;
      b.onclick = () => { tProg = i / current.meta.length; paused = false; btnPlay.textContent = '❚❚ Pause'; draw(); };
      seasonChips.appendChild(b);
    });
    const cur = seasonChips.children[idx]; if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  function renderSkills() {
    const idx = Math.min(Math.floor(tProg * current.meta.length), current.meta.length - 1);
    const m = current.meta[idx];
    const grades = m.skillGrades;
    const skillDefs = (opts.skillDefs) || [{key:'scoring',label:'Scoring Vol'},{key:'shooting',label:'Perimeter'},{key:'finishing',label:'Finishing'},{key:'ft',label:'FT'},{key:'playmaking',label:'Playmaking'},{key:'security',label:'Security'},{key:'oreb',label:'O-Reb'},{key:'dreb',label:'D-Reb'},{key:'hands',label:'Hands'},{key:'rim',label:'Rim'},{key:'efficiency',label:'Efficiency'},{key:'impact',label:'Impact'}];
    // fetch defs if we have skillsData
    let defs = skillDefs;
    if (window._skillsDefs) defs = window._skillsDefs;

    // if grades available, show 12 bars + delta vs first season
    const first = current.meta[0];
    const firstGrades = first.skillGrades;

    function bar(key, label, g, g0) {
      const delta = g!=null && g0!=null ? g-g0 : null;
      const deltaTxt = delta==null? '' : (delta>=0? `+${delta}` : `${delta}`);
      const deltaColor = delta==null? '#999' : delta>=5? '#009E73' : delta<=-5? '#D55E00' : '#6B665E';
      const pct = Math.max(g||0,4);
      const fill = (g||0)>=90? '#0072B2' : (g||0)>=75? '#009E73' : '#1A150F';
      return `<div style="border:2px solid #1A150F;border-radius:12px;padding:10px;background:#fff;box-shadow:2px 2px 0 #1A150F"><div style="display:flex;justify-content:space-between;align-items:center;font-family:ui-monospace,monospace;font-size:11px;font-weight:800"><span>${label}</span><span style="display:flex;gap:6px;align-items:center"><b style="font-size:14px">${g??'—'}</b><span style="color:${deltaColor}">${deltaTxt}</span></span></div><div style="height:10px;background:#ECE7DB;border-radius:999px;margin-top:6px;overflow:hidden;border:1.5px solid #1A150F"><div style="width:${pct}%;height:100%;background:${fill}"></div></div></div>`;
    }

    if (!grades) {
      skillsEl.innerHTML = `<div style="grid-column:1/-1;font-family:ui-monospace,monospace;font-size:12px;opacity:.6">No skill grades for ${m.season} — tracking starts 2015-16 for some lenses, but core 12 should exist. ${m.archLabel} O${m.off} D${m.def}</div>`;
      return;
    }

    // if we have defs from fetched skills.json, map them
    let html = '';
    if (skillsData && skillsData.skills) {
      html = skillsData.skills.map((sk, j) => bar(sk.key, sk.label, grades[j], firstGrades ? firstGrades[j] : null)).join('');
    } else {
      html = defs.map((sk, j) => bar(sk.key, sk.label, grades[j], firstGrades ? firstGrades[j] : null)).join('');
    }
    // add O/D card on top
    const offVals = current.meta.map(x => x.off), defVals = current.meta.map(x => x.def);
    const offDelta = offVals[offVals.length-1]-offVals[0], defDelta = defVals[defVals.length-1]-defVals[0];
    skillsEl.innerHTML = `
      <div style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap">
        <span style="border-radius:999px;padding:8px 12px;border:2.5px solid #1A150F;background:#fff;font-family:ui-monospace,monospace;font-weight:800;font-size:12px">O ${m.off} → Δ ${offDelta>=0?'+':''}${offDelta}</span>
        <span style="border-radius:999px;padding:8px 12px;border:2.5px solid #1A150F;background:#fff;font-family:ui-monospace,monospace;font-weight:800;font-size:12px">D ${m.def} → Δ ${defDelta>=0?'+':''}${defDelta}</span>
        <span style="border-radius:999px;padding:8px 12px;border:2.5px solid #1A150F;background:${m.color};font-family:ui-monospace,monospace;font-weight:800;font-size:12px">${m.archLabel} ${m.role}</span>
      </div>
      ${html}
    `;
  }

  function renderRoster() {
    const idx = Math.min(Math.floor(tProg * current.meta.length), current.meta.length - 1);
    const m = current.meta[idx];
    const teamKey = `${m.team}|${m.season}`;
    const roster = teamSeasonRoster.get(teamKey) || [];
    const rankIdx = roster.findIndex(r=> r.name===current.name);
    const rank = rankIdx>=0? rankIdx+1 : null;
    const total = roster.length||15;
    const isStarter = rank!==null && rank<=5;
    rosterEl.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:900;letter-spacing:.06em">${m.team} ${m.season} • ${total} players • you #${rank||'?'} • ${isStarter?'STARTER 1 of 5':'BENCH 1 of 15 (1 of 5 when in)'} • ${m.gp} GP ${m.mpg.toFixed(1)} MPG</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
        ${roster.slice(0,15).map(r=> `<span style="border:2.5px solid #1A150F;border-radius:999px;padding:7px 11px;font-family:ui-monospace,monospace;font-size:11px;font-weight:800;background:${r.name===current.name?'#1A150F':'#fff'};color:${r.name===current.name?'#FFFEF7':'#1A150F'};box-shadow:2px 2px 0 #1A150F"><span style="width:8px;height:8px;border-radius:999px;background:${ARCH[r.c%8]?.color};display:inline-block;border:1px solid #1A150F"></span> ${r.name.split(' ').pop()} ${r.pl} ${r.mpg.toFixed(0)}</span>`).join('') || '<span style="opacity:.6">No roster data</span>'}
      </div>
    `;
  }

  function draw() {
    const { cssW, cssH } = resize();
    const idx = Math.min(Math.floor(tProg * current.meta.length), current.meta.length - 1);
    const cur = current.meta[idx];
    drawBg(cssW, cssH, cur.team);
    const L = makeLayout(cssW, cssH); layoutCache = L;
    drawCourt(L);
    const allScreen = current.meta.map(m => ftToScreen(m.x, m.y, L));

    ctx.strokeStyle = 'rgba(26,21,15,0.18)'; ctx.lineWidth = 2; ctx.setLineDash([8,8]);
    ctx.beginPath(); allScreen.forEach((p,i)=>{ if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }); ctx.stroke(); ctx.setLineDash([]);

    ctx.strokeStyle = '#1A150F'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); for(let i=0;i<=idx;i++){ const p=allScreen[i]; if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); } ctx.stroke();
    ctx.strokeStyle = '#F0E442'; ctx.lineWidth = 8; ctx.globalAlpha = 0.45; ctx.beginPath(); for(let i=0;i<=idx;i++){ const p=allScreen[i]; if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); } ctx.stroke(); ctx.globalAlpha=1;

    // teammates
    const teamKey = `${cur.team}|${cur.season}`;
    const roster = teamSeasonRoster.get(teamKey) || [];
    const top5 = roster.slice(0,5); let floorUnit = top5; if(!top5.some(r=> r.name===current.name) && roster.length){ const focalR=roster.find(r=> r.name===current.name); if(focalR) floorUnit=[...top5.slice(0,4), focalR]; }
    for(const tm of floorUnit){ if(tm.name===current.name) continue; const pos=getCourtPos(tm.c, tm.pl, cur.si+tm.name.length*0.13); const s=ftToScreen(pos.x,pos.y,L); ctx.fillStyle=ARCH[tm.c%8]?.color||'#fff'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.2; ctx.beginPath(); ctx.arc(s.x,s.y,16,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle='#1A150F'; ctx.font=`800 11px ui-monospace,monospace`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(tm.pl, s.x, s.y+1); }

    for(let i=0;i<current.meta.length;i++){ const p=allScreen[i]; const m=current.meta[i]; const isCur=i===idx; if(isCur) continue; const rad=m.archLabel?4.5:4; ctx.fillStyle=m.color; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(p.x,p.y,rad,0,Math.PI*2); ctx.fill(); ctx.stroke(); }

    const curP = allScreen[idx];
    ctx.globalAlpha=0.18; ctx.fillStyle=cur.color; ctx.beginPath(); ctx.arc(curP.x,curP.y,28,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle='#1A150F'; ctx.beginPath(); ctx.arc(curP.x,curP.y,20,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=cur.color; ctx.beginPath(); ctx.arc(curP.x,curP.y,16,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.5; ctx.stroke();
    ctx.fillStyle='#FFFEF7'; ctx.font=`900 12px ui-monospace,monospace`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(cur.pl, curP.x, curP.y);

    const change=current.changes.find(c=> c.idx===idx);
    if(change){
      const txt=`${change.from.archLabel} → ${change.to.archLabel}`;
      ctx.font=`900 13px ui-monospace,monospace`; const tw=ctx.measureText(txt).width; const bw=tw+28, bh=28; const bx=curP.x-bw/2, by=curP.y-56;
      ctx.fillStyle='#F0E442'; ctx.strokeStyle='#1A150F'; ctx.lineWidth=2.5; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(bx,by,bw,bh,12); else ctx.rect(bx,by,bw,bh); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#1A150F'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt, curP.x, by+bh/2);
    }

    // focus overlay
    const rankIdxF = (teamSeasonRoster.get(`${cur.team}|${cur.season}`)||[]).findIndex(r=> r.name===current.name);
    focusEl.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px"><span style="background:#1A150F;color:#FFFEF7;border:2px solid #1A150F;border-radius:999px;padding:8px 12px;font-family:ui-monospace,monospace;font-weight:900;font-size:13px;box-shadow:3px 3px 0 #1A150F">${current.name} ${cur.season} ${cur.team} • ${cur.archLabel} ${cur.pl} • ${cur.mpg.toFixed(1)} MPG</span><span style="background:${cur.color};border:2px solid #1A150F;border-radius:999px;padding:8px 12px;font-family:ui-monospace,monospace;font-weight:800;font-size:12px">O${cur.off} D${cur.def} ${cur.role}</span></div>`;

    if(scrubFill) scrubFill.style.width=`${(tProg*100).toFixed(1)}%`;
    if(scrubThumb) scrubThumb.style.left=`${(tProg*100).toFixed(1)}%`;
    renderSeasonChips(); renderSkills(); renderRoster();
  }

  // controls
  canvas.addEventListener('click', (e)=>{
    if(!layoutCache) return;
    const rect=canvas.getBoundingClientRect();
    const x=(e.clientX-rect.left), y=(e.clientY-rect.top);
    const pts=current.meta.map(m=> ftToScreen(m.x,m.y,layoutCache));
    let best=-1, bestD=Infinity;
    pts.forEach((p,i)=>{ const d=(p.x-x)**2+(p.y-y)**2; if(d<bestD){ bestD=d; best=i; } });
    if(best>=0 && bestD<1600){ tProg=best/current.meta.length; draw(); }
  });
  if(scrub){
    let dragging=false;
    const setFromX=xx=>{ const r=scrub.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(xx-r.left)/r.width)); tProg=p; draw(); };
    scrub.addEventListener('pointerdown',e=>{ dragging=true; try{scrub.setPointerCapture(e.pointerId);}catch{} setFromX(e.clientX); paused=true; btnPlay.textContent='▶ Play'; });
    scrub.addEventListener('pointermove',e=>{ if(dragging) setFromX(e.clientX); });
    scrub.addEventListener('pointerup',()=>{ dragging=false; });
    scrub.addEventListener('click',e=> setFromX(e.clientX));
  }
  if(btnPlay) btnPlay.addEventListener('click',()=>{ if(paused){ paused=false; btnPlay.textContent='❚❚ Pause'; } else { paused=true; btnPlay.textContent='▶ Play'; } });
  if(btnNext) btnNext.addEventListener('click',()=>{ paused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; const idx=Math.floor(tProg*current.meta.length); for(let j=idx+1;j<current.meta.length;j++) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; draw(); return; } tProg=1; draw(); });
  if(btnPrev) btnPrev.addEventListener('click',()=>{ paused=false; if(btnPlay) btnPlay.textContent='❚❚ Pause'; const idx=Math.floor(tProg*current.meta.length); for(let j=idx-1;j>=1;j--) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; draw(); return; } tProg=0; draw(); });

  function tick(){ requestAnimationFrame(tick); if(paused) return; const now=performance.now(); if(now<autoPauseUntil) return; tProg+=0.00032; if(tProg>1) tProg=0; draw(); }
  tick();

  // resize
  const ro=new ResizeObserver(()=> draw()); ro.observe(canvas);

  draw();
  return { show: (name)=>{ const arc=buildArc(name); if(arc){ current=arc; tProg=0; draw(); } } };
}
