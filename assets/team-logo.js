/* Vector Hoops — Team Logo Pixel Sprite
   - Mounts from player_team_season.json (436KB) for truthful 2025-26 latest-season resolution
   - 30 NBA teams + legacy VAN/CHH/SEA/NJN/CHO
   - 8-bit pixel sprite 16x16 base, deterministic AAA contrast, same language as pixel-avatar.js
   - Free-tier static vanilla JS, no paid APIs
   - Exposes window.VHTeamLogo for index/play/teams
*/
(function(){
  'use strict';
  const TEAM_COLORS = {
    'ATL':['#E03A3E','#C1D32F'],'BOS':['#007A33','#BA9653'],'BKN':['#000000','#FFFFFF'],
    'CHA':['#1D1160','#00788C'],'CHI':['#CE1141','#000000'],'CLE':['#860038','#FDBB30'],
    'DAL':['#00538C','#002B5E'],'DEN':['#0E2240','#FEC524'],'DET':['#C8102E','#1D42BA'],
    'GSW':['#1D428A','#FFC72C'],'HOU':['#CE1141','#C4CED4'],'IND':['#002D62','#FDBB30'],
    'LAC':['#C8102E','#1D428A'],'LAL':['#552583','#FDBB27'],'MEM':['#5D76A9','#12173F'],
    'MIA':['#98002E','#F9A01B'],'MIL':['#00471B','#EEE1C6'],'MIN':['#0C2340','#236192'],
    'NOP':['#0C2340','#C8102E'],'NYK':['#006BB6','#F58426'],'OKC':['#007AC1','#EF3B24'],
    'ORL':['#0077C0','#C4CED4'],'PHI':['#006BB6','#ED174C'],'PHX':['#1D1160','#E56020'],
    'POR':['#E03A3E','#000000'],'SAC':['#5A2D81','#63727A'],'SAS':['#C4CED4','#000000'],
    'TOR':['#CE1141','#000000'],'UTA':['#002B5C','#F9A01B'],'WAS':['#002B5C','#E31837'],
    // legacy / rebrand carry
    'VAN':['#5D76A9','#12173F'],'CHH':['#1D1160','#008CA8'],'SEA':['#00653A','#FFC62F'],
    'NJN':['#002732','#808080'],'CHO':['#1D1160','#00788C']
  };

  const FONT = {
    'A':[0b111,0b101,0b111,0b101,0b101],'B':[0b110,0b101,0b110,0b101,0b110],
    'C':[0b111,0b100,0b100,0b100,0b111],'D':[0b110,0b101,0b101,0b101,0b110],
    'E':[0b111,0b100,0b110,0b100,0b111],'F':[0b111,0b100,0b110,0b100,0b100],
    'G':[0b111,0b100,0b101,0b101,0b111],'H':[0b101,0b101,0b111,0b101,0b101],
    'I':[0b111,0b010,0b010,0b010,0b111],'J':[0b011,0b001,0b001,0b101,0b111],
    'K':[0b101,0b101,0b110,0b101,0b101],'L':[0b100,0b100,0b100,0b100,0b111],
    'M':[0b101,0b111,0b111,0b101,0b101],'N':[0b101,0b111,0b111,0b111,0b101],
    'O':[0b111,0b101,0b101,0b101,0b111],'P':[0b111,0b101,0b111,0b100,0b100],
    'Q':[0b111,0b101,0b101,0b111,0b011],'R':[0b111,0b101,0b111,0b101,0b101],
    'S':[0b111,0b100,0b111,0b001,0b111],'T':[0b111,0b010,0b010,0b010,0b010],
    'U':[0b101,0b101,0b101,0b101,0b111],'V':[0b101,0b101,0b101,0b101,0b010],
    'W':[0b101,0b101,0b111,0b111,0b101],'X':[0b101,0b101,0b010,0b101,0b101],
    'Y':[0b101,0b101,0b010,0b010,0b010],'Z':[0b111,0b001,0b010,0b100,0b111]
  };

  function hashStr(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31 + s.charCodeAt(i))>>>0; return h; }

  function getCfg(abbr){
    const safe = (abbr||'NBA').toUpperCase();
    const cols = TEAM_COLORS[safe] || ['#1A150F','#F0E442'];
    const h = hashStr(safe);
    const shape = h % 6;
    return {abbr:safe, primary:cols[0], secondary:cols[1], shape, h};
  }

  function drawLogo(ctx, S, cfg){
    const P = S/16;
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,S,S);
    const R=(x,y,w,h,c)=>{ ctx.fillStyle=c; ctx.fillRect(Math.round(x*P),Math.round(y*P),Math.round(w*P),Math.round(h*P)); };
    const outline='#0a0a0a';
    const bw=0.85;
    R(-bw,-bw,16+2*bw,16+2*bw,outline);
    R(0,0,16,16,cfg.primary);
    const sec=cfg.secondary;
    switch(cfg.shape){
      case 0: R(0,10.5,16,5.5,sec); break;
      case 1: R(0,0,6.2,16,sec); break;
      case 2: R(4.2,3.2,7.6,7.6,sec); R(5.2,4.2,5.6,5.6,cfg.primary); break;
      case 3: for(let i=0;i<16;i++) R(i-1,i,3,1.6,sec); break;
      case 4: R(6.2,0,3.6,16,sec); break;
      case 5: R(0,0,16,2.2,sec); R(0,13.8,16,2.2,sec); break;
    }
    R(1.2,1.2,2,1.2,'rgba(255,255,255,0.22)');
    const letters=(cfg.abbr||'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,3);
    const len=letters.length;
    const totalW=len===1?3:len===2?7:10;
    const startX=(16-totalW)/2-0.2;
    const startY=cfg.shape===2?8.6:9.2;
    R(startX-0.8,startY-0.8,totalW+1.6,6.2,'rgba(0,0,0,0.72)');
    for(let li=0;li<len;li++){
      const ch=letters[li]; const row=FONT[ch]; if(!row) continue;
      const ox=startX+li*(len===3?3.4:4); const oy=startY;
      for(let y=0;y<5;y++){
        let bits=row[y];
        for(let x=0;x<3;x++){
          if(bits & (1<<(2-x))){
            R(ox+x+0.3,oy+y+0.3,1,1,'rgba(0,0,0,0.85)');
            R(ox+x,oy+y,1,1,'#FFFFFF');
          }
        }
      }
    }
  }

  function toDataURL(abbr,size){
    size=size||64;
    const c=document.createElement('canvas'); c.width=size; c.height=size;
    const ctx=c.getContext('2d'); drawLogo(ctx,size,getCfg(abbr)); return c.toDataURL();
  }

  function mountLogo(el,abbr,size){
    if(!el) return; size=size||64;
    const cfg=getCfg(abbr||'NBA');
    if(el.tagName==='CANVAS'){
      el.width=size; el.height=size; const ctx=el.getContext('2d'); drawLogo(ctx,size,cfg);
      el.setAttribute('aria-label',cfg.abbr+' logo'); el.title=cfg.abbr;
      el.style.imageRendering='pixelated';
    } else if(el.tagName==='IMG'){
      el.src=toDataURL(cfg.abbr,size); el.style.imageRendering='pixelated'; el.alt=cfg.abbr+' logo'; el.title=cfg.abbr;
    } else {
      const c=document.createElement('canvas'); c.width=size; c.height=size;
      c.style.width=size+'px'; c.style.height=size+'px'; c.style.imageRendering='pixelated';
      c.setAttribute('aria-label',cfg.abbr+' logo'); const ctx=c.getContext('2d'); drawLogo(ctx,size,cfg);
      el.innerHTML=''; el.appendChild(c); el.title=cfg.abbr;
    }
  }

  // ---- player_team_season.json 436KB latest 2025-26 ----
  let _teamMap=null;
  let _teamMapLoading=null;
  const _latestByPlayer=new Map();

  function buildLatestIndex(){
    _latestByPlayer.clear();
    if(!_teamMap) return;
    for(const key in _teamMap){
      const sep=key.lastIndexOf('|'); if(sep<=0) continue;
      const name=key.slice(0,sep); const season=key.slice(sep+1); const team=_teamMap[key]; if(!team) continue;
      const cur=_latestByPlayer.get(name);
      if(!cur || season>cur.season) _latestByPlayer.set(name,{team,season});
    }
  }

  function loadTeamMap(){
    if(_teamMap) return Promise.resolve(_teamMap);
    if(_teamMapLoading) return _teamMapLoading;
    _teamMapLoading=fetch('assets/player_team_season.json',{cache:'default'})
      .then(function(r){ if(!r.ok) throw new Error('team map '+r.status); return r.json(); })
      .then(function(j){
        if(j && typeof j==='object'){
          const n=Object.keys(j).length;
          if(n<12000) console.warn('[team-logo] player_team_season small',n,'want ~12966+');
        }
        _teamMap=j||{}; buildLatestIndex(); return _teamMap;
      })
      .catch(function(e){
        console.warn('[team-logo] load fail',e);
        _teamMap=_teamMap||{}; return _teamMap;
      })
      .finally(function(){ _teamMapLoading=null; });
    return _teamMapLoading;
  }

  function getLatestTeam(name){
    if(!name) return null;
    if(_latestByPlayer.has(name)) return _latestByPlayer.get(name).team;
    if(!_teamMap) return null;
    let best=null,bestSeason=''; const prefix=name+'|';
    for(const k in _teamMap){
      if(k.indexOf(prefix)===0){
        const season=k.slice(prefix.length);
        if(season>bestSeason){ bestSeason=season; best=_teamMap[k]; }
      }
    }
    if(best) _latestByPlayer.set(name,{team:best,season:bestSeason});
    return best;
  }

  function getTeamAbbr(name,seasonHint){
    if(!name) return null;
    const want=seasonHint||'2025-26';
    if(_teamMap){
      const direct=_teamMap[name+'|'+want]; if(direct) return direct;
      const latest2025=_teamMap[name+'|2025-26']; if(latest2025) return latest2025;
      const latest=getLatestTeam(name); if(latest) return latest;
      if(seasonHint){ const alt=_teamMap[name+'|'+seasonHint]; if(alt) return alt; }
    }
    const lc=_latestByPlayer.get(name); return lc?lc.team:null;
  }

  function mountLogoForPlayer(el,playerName,seasonHint,size){
    const abbr=getTeamAbbr(playerName,seasonHint)||getLatestTeam(playerName)||'NBA';
    mountLogo(el,abbr,size||64); return abbr;
  }

  function resolveEl(elOrSelector){
    if(!elOrSelector) return null;
    if(typeof elOrSelector==='string') return document.querySelector(elOrSelector);
    return elOrSelector;
  }

  // eager non-blocking prefetch — does not block first paint
  try{ setTimeout(function(){ loadTeamMap(); }, 16); }catch(_e){}

  window.VHTeamLogo={
    getCfg:getCfg, drawLogo:drawLogo, toDataURL:toDataURL,
    mountLogo:mountLogo, mountLogoForPlayer:mountLogoForPlayer,
    getTeamAbbr:getTeamAbbr, getLatestTeam:getLatestTeam,
    loadTeamMap:loadTeamMap, TEAM_COLORS:TEAM_COLORS,
    TRUTH_ROWS:12966, ASSET_KB:436
  };
})();
