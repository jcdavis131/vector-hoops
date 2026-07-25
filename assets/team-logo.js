/* Vector Hoops Team Logo — 8-bit pixel team logos
   30 NBA teams + defunct VAN/CHH/WAS etc from player_team_season.json
   - deterministic, AAA friendly, same style as pixel-avatar (16x16 base)
   - uses teams.json primary/secondary for truth
*/
(function(){
  const TEAM_COLORS = {
    'ATL':['#E03A3E','#C1D32F'],'BOS':['#007A33','#BA9653'],'BKN':['#000000','#FFFFFF'],'CHA':['#1D1160','#00788C'],
    'CHI':['#CE1141','#000000'],'CLE':['#860038','#FDBB30'],'DAL':['#00538C','#002B5E'],'DEN':['#0E2240','#FEC524'],
    'DET':['#C8102E','#1D42BA'],'GSW':['#1D428A','#FFC72C'],'HOU':['#CE1141','#C4CED4'],'IND':['#002D62','#FDBB30'],
    'LAC':['#C8102E','#1D428A'],'LAL':['#552583','#FDBB27'],'MEM':['#5D76A9','#12173F'],'MIA':['#98002E','#F9A01B'],
    'MIL':['#00471B','#EEE1C6'],'MIN':['#0C2340','#236192'],'NOP':['#0C2340','#C8102E'],'NYK':['#006BB6','#F58426'],
    'OKC':['#007AC1','#EF3B24'],'ORL':['#0077C0','#C4CED4'],'PHI':['#006BB6','#ED174C'],'PHX':['#1D1160','#E56020'],
    'POR':['#E03A3E','#000000'],'SAC':['#5A2D81','#63727A'],'SAS':['#C4CED4','#000000'],'TOR':['#CE1141','#000000'],
    'UTA':['#002B5C','#F9A01B'],'WAS':['#002B5C','#E31837'],
    // legacy / defunct mapped to current palette
    'VAN':['#5D76A9','#12173F'],'CHH':['#1D1160','#008CA8'],'SEA':['#00653A','#FFC62F'],'NJN':['#000000','#808080'],'CHO':['#1D1160','#00788C']
  };

  // 3x5 pixel font, only A-Z
  const FONT = {
    'A':[0b111,0b101,0b111,0b101,0b101],'B':[0b110,0b101,0b110,0b101,0b110],'C':[0b111,0b100,0b100,0b100,0b111],
    'D':[0b110,0b101,0b101,0b101,0b110],'E':[0b111,0b100,0b110,0b100,0b111],'F':[0b111,0b100,0b110,0b100,0b100],
    'G':[0b111,0b100,0b101,0b101,0b111],'H':[0b101,0b101,0b111,0b101,0b101],'I':[0b111,0b010,0b010,0b010,0b111],
    'J':[0b011,0b001,0b001,0b101,0b111],'K':[0b101,0b101,0b110,0b101,0b101],'L':[0b100,0b100,0b100,0b100,0b111],
    'M':[0b101,0b111,0b111,0b101,0b101],'N':[0b101,0b111,0b111,0b111,0b101],'O':[0b111,0b101,0b101,0b101,0b111],
    'P':[0b111,0b101,0b111,0b100,0b100],'Q':[0b111,0b101,0b101,0b111,0b011],'R':[0b111,0b101,0b111,0b101,0b101],
    'S':[0b111,0b100,0b111,0b001,0b111],'T':[0b111,0b010,0b010,0b010,0b010],'U':[0b101,0b101,0b101,0b101,0b111],
    'V':[0b101,0b101,0b101,0b101,0b010],'W':[0b101,0b101,0b111,0b111,0b101],'X':[0b101,0b101,0b010,0b101,0b101],
    'Y':[0b101,0b101,0b010,0b010,0b010],'Z':[0b111,0b001,0b010,0b100,0b111]
  };

  function hashStr(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31 + s.charCodeAt(i))>>>0; return h; }

  function getCfg(abbr){
    const cols = TEAM_COLORS[abbr] || ['#1A150F','#F0E442'];
    const h = hashStr(abbr||'XXX');
    const shape = h % 6; // 0..5 distinct
    return {abbr:abbr, primary:cols[0], secondary:cols[1], shape, h};
  }

  function drawLogo(ctx, S, cfg){
    const P = S/16;
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,S,S);
    const R=(x,y,w,h,c)=>{ ctx.fillStyle=c; ctx.fillRect(Math.round(x*P), Math.round(y*P), Math.round(w*P), Math.round(h*P)); };
    const outline='#0a0a0a';
    const bw=0.85;
    // outer black outline (2)
    R(-bw, -bw, 16+2*bw, 16+2*bw, outline);
    // inner base
    R(0,0,16,16, cfg.primary);
    // secondary shape
    const sec = cfg.secondary;
    switch(cfg.shape){
      case 0: // bottom bar
        R(0,10.5,16,5.5, sec); break;
      case 1: // left chunk
        R(0,0,6.2,16, sec); break;
      case 2: // center circle-ish (square)
        R(4.2,3.2,7.6,7.6, sec); R(5.2,4.2,5.6,5.6, cfg.primary); break;
      case 3: // diagonal stripe
        for(let i=0;i<16;i++){ R(i-1,i,3,1.6, sec); } break;
      case 4: // mid vertical
        R(6.2,0,3.6,16, sec); break;
      case 5: // border frame
        R(0,0,16,2.2, sec); R(0,13.8,16,2.2, sec); break;
    }
    // secondary shine dot for depth
    R(1.2,1.2,2,1.2,'rgba(255,255,255,0.22)');

    // letters: 1-3 char abbr, center
    const letters = (cfg.abbr||'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,3);
    const len = letters.length;
    // scale: if 2 => 3px gap 4, if 3 => tighter
    const totalW = len===1?3: len===2?7:10;
    const startX = (16 - totalW)/2 -0.2; // center pixel wise
    const startY = cfg.shape===2?8.6:9.2; // lower half to not hide
    // choose letter color high contrast vs primary average
    function luma(hex){
      const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
      return 0.2126*r+0.7152*g+0.0722*b;
    }
    const useWhite = luma(cfg.primary) < 140;
    const letterColor = '#FFFFFF';
    const letterShadow = 'rgba(0,0,0,0.85)';
    // background plate for letters
    R(startX-0.8, startY-0.8, totalW+1.6, 6.2, 'rgba(0,0,0,0.72)');
    // draw letters
    for(let li=0; li<len; li++){
      const ch = letters[li];
      const row = FONT[ch]; if(!row) continue;
      const ox = startX + li*(len===3?3.4:4);
      const oy = startY;
      for(let y=0;y<5;y++){
        let bits=row[y];
        for(let x=0;x<3;x++){
          if(bits & (1<<(2-x))){
            // shadow pixel
            R(ox+x+0.3, oy+y+0.3, 1,1, letterShadow);
            R(ox+x, oy+y, 1,1, letterColor);
          }
        }
      }
    }
  }

  function toDataURL(abbr,size=64){
    const c=document.createElement('canvas'); c.width=size; c.height=size;
    const ctx=c.getContext('2d');
    drawLogo(ctx,size,getCfg(abbr));
    return c.toDataURL();
  }

  function mountLogo(el, abbr, size=64){
    if(!el) return;
    const cfg=getCfg(abbr);
    if(el.tagName==='CANVAS'){
      el.width=size; el.height=size;
      const ctx=el.getContext('2d');
      drawLogo(ctx,size,cfg);
      el.setAttribute('aria-label', abbr+' logo');
      el.title = abbr;
    } else if(el.tagName==='IMG'){
      el.src=toDataURL(abbr,size);
      el.style.imageRendering='pixelated';
      el.alt=abbr+' logo';
    } else {
      const c=document.createElement('canvas'); c.width=size; c.height=size;
      c.style.width=size+'px'; c.style.height=size+'px'; c.style.imageRendering='pixelated';
      c.setAttribute('aria-label', abbr+' logo');
      const ctx=c.getContext('2d');
      drawLogo(ctx,size,cfg);
      el.innerHTML=''; el.appendChild(c);
      el.title = abbr;
    }
  }

  window.VHTeamLogo={getCfg, drawLogo, toDataURL, mountLogo, TEAM_COLORS};
})();
