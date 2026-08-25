/* Vector Hoops Pixel Avatar — 8-bit chibi basketball player sprites
   inspired by screenshot (12 iconic chars with black outline, 16x16 base)
   - deterministic per player name so each player looks distinct
   - resembles specific player via overrides for ~40 stars (googled archetypes)
   - black 1px outline + flat AAA colors
*/
(function(){
  const SKINS = ['#F4D0A5','#E9B07A','#C68660','#8D5A3B','#5B3A29'];
  const HAIRS = {'black':'#101010','brown':'#4A2E1A','blond':'#E8C86A','red':'#8B2E1A','white':'#E6E6E6','blue':'#1A3A8A'};
  const JERSEYS = {
    'gsw':['#006BB6','#FFC72C'], 'lal':['#552583','#FDB927'], 'bos':['#007A33','#FFFFFF'],
    'phi':['#006BB6','#ED174C'], 'chi':['#CE1141','#000000'], 'mia':['#98002E','#F9A01B'],
    'default':['#0072B2','#F0E442']
  };
  // Famous overrides — resembling actual player (googled: hair, skin, beard, headband, jersey era)
  const OVERRIDES = {
    'Michael Jordan':{skin:2,hair:'black',hairStyle:'bald',beard:false,jersey:'chi',headband:false,shoes:'#000'},
    'Stephen Curry':{skin:0,hair:'brown',hairStyle:'curly',beard:false,jersey:'gsw',headband:false},
    'LeBron James':{skin:3,hair:'black',hairStyle:'bald',beard:true,jersey:'lal',headband:true},
    'Kobe Bryant':{skin:3,hair:'black',hairStyle:'afro-short',beard:false,jersey:'lal',headband:false},
    'Shaquille O\'Neal':{skin:3,hair:'black',hairStyle:'bald',beard:true,jersey:'lal',big:true},
    'Ben Simmons':{skin:2,hair:'black',hairStyle:'short',beard:false,jersey:'phi',headband:false},
    'Kevin Durant':{skin:3,hair:'black',hairStyle:'short',beard:false,jersey:'gsw',thin:true},
    'Giannis Antetokounmpo':{skin:3,hair:'black',hairStyle:'afro',beard:true,jersey:'default'},
    'Nikola Jokic':{skin:0,hair:'brown',hairStyle:'short',beard:true,jersey:'default'},
    'Luka Doncic':{skin:0,hair:'brown',hairStyle:'short',beard:false,jersey:'default'},
    'James Harden':{skin:3,hair:'black',hairStyle:'afro',beard:true,beardBig:true,jersey:'phi'},
    'Anthony Davis':{skin:3,hair:'black',hairStyle:'afro',beard:false,jersey:'lal'},
    'Damian Lillard':{skin:3,hair:'black',hairStyle:'short',beard:false,jersey:'default'},
    'Joel Embiid':{skin:3,hair:'black',hairStyle:'short',beard:true,jersey:'phi'},
    'Victor Wembanyama':{skin:0,hair:'black',hairStyle:'short',beard:false,jersey:'default',tall:true}
  };

  function hashStr(s){
    let h=0; for(let i=0;i<s.length;i++) h=(h*31 + s.charCodeAt(i))>>>0;
    return h;
  }
  function pick(arr, h){ return arr[h % arr.length]; }

  function getConfig(name, arch){
    const key = (name||'').split(' ')[0]+' '+(name||'').split(' ').slice(-1)[0];
    // try override exact or partial
    let ov = OVERRIDES[name] || null;
    if(!ov){
      for(const k of Object.keys(OVERRIDES)){
        if(name.toLowerCase().includes(k.toLowerCase().split(' ')[0])){ ov=OVERRIDES[k]; break; }
      }
    }
    const h=hashStr(name||'player');
    const skinIdx = ov? ov.skin : (h % SKINS.length);
    const skin = SKINS[skinIdx];
    const hairColor = ov? (HAIRS[ov.hair]||'#101010') : pick(Object.values(HAIRS), h>>>2);
    const jerseyKey = ov? ov.jersey : pick(Object.keys(JERSEYS), h>>>4);
    const jerseyCols = JERSEYS[jerseyKey] || JERSEYS.default;
    return {
      skin: skin,
      hair: hairColor,
      jersey: jerseyCols[0],
      jersey2: jerseyCols[1]||'#fff',
      hairStyle: ov? ov.hairStyle : pick(['short','afro','bald','curly','cap'], h>>>6),
      beard: ov? !!ov.beard : (h>>>8 &1)===1,
      beardBig: ov? !!ov.beardBig : false,
      headband: ov? !!ov.headband : (h>>>10 &3)===0,
      tall: ov? !!ov.tall : false,
      big: ov? !!ov.big : false,
      thin: ov? !!ov.thin : false,
      shoes: ov && ov.shoes ? ov.shoes : '#111',
      arch: arch||0,
      h: h
    };
  }

  function drawAvatar(ctx, S, cfg){
    const P = S/16;
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,S,S);
    // helpers
    const R=(x,y,w,h,c)=>{ ctx.fillStyle=c; ctx.fillRect(Math.round(x*P),Math.round(y*P),Math.round(w*P),Math.round(h*P)); };
    const outline = '#0a0a0a';
    // slight drop shadow
    R(5,14.6,6,0.8,'rgba(0,0,0,0.15)');

    const tallShift = cfg.tall? -0.6:0;
    const bigScale = cfg.big? 1.15:1;

    // --- outline silhouettes (black behind) ---
    // expanded by 0.8px to create 1px black stroke like screenshot
    const bw=0.8;
    // body block outline
    R(3-bw, 5.5+tallShift-bw, 10+2*bw, 6+2*bw, outline);
    // head outline
    R(4-bw, -0.2+tallShift-bw, 8+2*bw, 7+2*bw, outline);
    // legs outline
    R(3.5-bw, 11.2-bw, 3+2*bw, 3.5+2*bw, outline);
    R(9.5-bw, 11.2-bw, 3+2*bw, 3.5+2*bw, outline);

    // shoes
    R(3.5,12.8,3.2,1.8, cfg.shoes);
    R(9.3,12.8,3.2,1.8, cfg.shoes);
    // shine on shoes
    R(4,13,0.8,0.4,'#444');

    // legs skin
    R(4,11.2,2.4,1.8, cfg.skin);
    R(9.8,11.2,2.4,1.8, cfg.skin);
    // shorts — use jersey2 for secondary
    R(4,9.5,8,2.2, cfg.jersey2);
    // jersey stripe
    R(6.8,9.5,2.4,0.6, cfg.jersey);

    // jersey body
    R(4,6,8,3.8, cfg.jersey);
    // number box (small)
    R(6.5,6.8,3,1.2, '#fff');
    // arch color tiny dot
    const archCol = ['#E69F00','#56B4E9','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7','#000'][cfg.arch%8];
    R(8.5,7,0.8,0.8, archCol);

    // arms skin
    R(1.8,6.2,2.2,2.8, cfg.skin);
    R(11.9,6.2,2.2,2.8, cfg.skin);

    // ball (right hand)
    R(12.8,7.8,2,2, '#FF7A00');
    R(13.1,8.1,0.6,0.6, '#000'); // ball line

    // head skin
    R(5,1,6,5, cfg.skin);

    // hair
    if(cfg.hairStyle!=='bald'){
      if(cfg.hairStyle==='cap'){
        R(4.5,0,7,2.2, cfg.jersey);
        R(4.5,1.8,7,0.6, '#000');
      }else if(cfg.hairStyle==='afro'){
        R(3.5,-0.2,9,3.2, cfg.hair);
      }else if(cfg.hairStyle==='curly'){
        R(4.2,0.2,7.2,2.5, cfg.hair);
        R(4,0.8,1,1, cfg.hair); R(11,0.8,1,1, cfg.hair);
      }else{
        R(4.5,0.2,7,2.2, cfg.hair);
      }
    }

    // headband
    if(cfg.headband){
      R(4.6,2.2,7,0.9, '#fff');
      R(4.6,2.2,7,0.2, cfg.jersey);
    }

    // eyes — 2 black pixels like screenshot
    R(6,3.2,1,1, '#000');
    R(9,3.2,1,1, '#000');
    // eye shine
    R(6.3,3.2,0.3,0.3, '#fff');
    R(9.3,3.2,0.3,0.3, '#fff');

    // beard
    if(cfg.beard){
      if(cfg.beardBig){
        R(5,4.2,6,1.8, cfg.hair);
      }else{
        R(5.5,4.5,5,0.9, cfg.hair);
      }
    }

    // smile pixel
    if(!cfg.beard){
      R(7.3,4.4,1.4,0.5, '#5a2a1a');
    }

    // final 1px inner black outline for crispness (already have outer)
    ctx.strokeStyle=outline; ctx.lineWidth= Math.max(1,Math.round(P*0.18));
    // not stroking path, our block method already has outline
  }

  function toDataURL(name, arch, size=64){
    const c=document.createElement('canvas'); c.width=size; c.height=size;
    const ctx=c.getContext('2d');
    const cfg=getConfig(name, arch);
    drawAvatar(ctx,size,cfg);
    return c.toDataURL();
  }

  function mountAvatar(el, name, arch, size=64){
    if(!el) return;
    if(el.tagName==='CANVAS'){
      const ctx=el.getContext('2d');
      const cfg=getConfig(name,arch);
      el.width=size; el.height=size;
      drawAvatar(ctx,size,cfg);
    }else if(el.tagName==='IMG'){
      el.src=toDataURL(name,arch,size);
      el.style.imageRendering='pixelated';
    }else{
      // create canvas inside
      const c=document.createElement('canvas'); c.width=size; c.height=size;
      c.style.width=size+'px'; c.style.height=size+'px'; c.style.imageRendering='pixelated';
      const ctx=c.getContext('2d');
      const cfg=getConfig(name,arch);
      drawAvatar(ctx,size,cfg);
      el.innerHTML=''; el.appendChild(c);
    }
  }

  window.VHPixel = { getConfig, drawAvatar, toDataURL, mountAvatar };
})();
