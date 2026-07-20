/* drift-void.js v5 — Mobile-first full-width story mode polished
   - Full bleed 100vw on mobile, 100% parent desktop, 56px safe-area controls, scrubber
   - League context: cloud 0.62 + ribbons 0.26 + year ticks every 3 seasons
   - Player story: tube 0.105, white ring on archetype change, pause 1.1s on change, white traveller
   - Scrubber: draggable season progress, shows league % vs first season delta
   - Labels offset to avoid overlap, head/tail pills
   - Auto-loop 20s, play/pause, next/prev change
*/
export async function mountDriftVoid(canvas){
  if(!canvas) return;
  const THREE = await import('three');
  const isLowEnd=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||window.innerWidth<560;

  const renderer=new THREE.WebGLRenderer({ canvas, antialias:!isLowEnd, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, isLowEnd?1.15:1.6));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(0x080A0F,1);

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x080A0F);
  scene.fog=new THREE.FogExp2(0x080A0F, 0.018);

  const camera=new THREE.PerspectiveCamera(34, 1, 0.1, 180);
  camera.position.set(0,2.4,15.5);

  scene.add(new THREE.AmbientLight(0xFFFFFF,0.7));
  const key=new THREE.DirectionalLight(0xFFE8C8,0.9); key.position.set(6,9,5); scene.add(key);
  const fill=new THREE.DirectionalLight(0xA8C4FF,0.32); fill.position.set(-5,3,-3); scene.add(fill);

  const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,180), new THREE.MeshStandardMaterial({ color:0x0C0E14, roughness:0.96 }));
  ground.rotation.x=-Math.PI/2; ground.position.y=-2.6; scene.add(ground);

  let timeData=null, liteData=null;
  try{
    const [tR,lR]=await Promise.all([
      fetch('assets/archetypes_time.json',{cache:'force-cache'}),
      fetch('assets/vectors_search_lite.json',{cache:'force-cache'})
    ]);
    timeData=await tR.json(); liteData=await lR.json();
  }catch(e){ console.warn('drift v5 fetch',e); return; }

  const seasons=timeData?.prevalence||[];
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  const shortNames=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];
  const SEASON_SPAN=32;
  const getZ=(idx)=>(idx/Math.max(1,seasons.length-1))*SEASON_SPAN - SEASON_SPAN/2;
  const seasonIdx=new Map(seasons.map((s,i)=>[s.season,i]));

  const leagueGroup=new THREE.Group(); scene.add(leagueGroup);
  const count=liteData?.players?.length||0;
  const positions=new Float32Array(count*3);
  const colors=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const p=liteData.players[i];
    const si=seasonIdx.get(p.s); if(si===undefined) continue;
    const share=seasons[si]?.shares[p.c]||0;
    const x=(p.c-3.5)*1.20 + (Math.random()-0.5)*0.44;
    const y=-2.1+share*5.6 + Math.random()*0.62;
    const z=getZ(si)+(Math.random()-0.5)*0.24;
    positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
    const col=new THREE.Color(OKABE[p.c%8]); col.lerp(new THREE.Color(0x151821),0.44);
    colors[i*3]=col.r; colors[i*3+1]=col.g; colors[i*3+2]=col.b;
  }
  const leagueGeo=new THREE.BufferGeometry();
  leagueGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  leagueGeo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const leagueMat=new THREE.PointsMaterial({ size:isLowEnd?0.062:0.092, vertexColors:true, transparent:true, opacity:0.62, sizeAttenuation:true, depthWrite:false });
  leagueGroup.add(new THREE.Points(leagueGeo, leagueMat));

  const ribbonGroup=new THREE.Group(); scene.add(ribbonGroup);
  for(let a=0;a<8;a++){
    const pts=[]; for(let s=0;s<seasons.length;s++) pts.push(new THREE.Vector3((a-3.5)*1.20, -2.1+(seasons[s].shares[a]||0)*5.6, getZ(s)));
    const curve=new THREE.CatmullRomCurve3(pts);
    const geo=new THREE.TubeGeometry(curve, seasons.length*2, isLowEnd?0.038:0.052, 6, false);
    const col=new THREE.Color(OKABE[a]); col.lerp(new THREE.Color(0x12141A),0.55);
    ribbonGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.26, depthWrite:false })));
  }
  function makeTickLabel(text,x,z){
    const c=document.createElement('canvas'); c.width=180; c.height=36;
    const ctx=c.getContext('2d'); ctx.fillStyle='rgba(255,254,247,0.92)'; ctx.beginPath(); ctx.roundRect(2,2,176,32,7); ctx.fill();
    ctx.fillStyle='#1A150F'; ctx.font='900 13px ui-monospace,monospace'; ctx.textAlign='center'; ctx.fillText(text,90,22);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:false });
    const s=new THREE.Sprite(mat); s.scale.set(0.9,0.18,1); s.position.set(x,-2.55,z); return s;
  }
  const tickGroup=new THREE.Group(); scene.add(tickGroup);
  seasons.forEach((s,i)=>{ if(i%3===0){ const t=makeTickLabel(s.season,-5.4,getZ(i)); tickGroup.add(t); const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4.9,-2.45,getZ(i)), new THREE.Vector3(5.4,-2.45,getZ(i))]), new THREE.LineBasicMaterial({ color:0xFFFFFF, transparent:true, opacity:0.06 })); tickGroup.add(line); } });

  const byName=new Map();
  for(const p of liteData.players){ if(!byName.has(p.n)) byName.set(p.n,[]); byName.get(p.n).push(p); }
  for(const arr of byName.values()) arr.sort((a,b)=> (a.s||'').localeCompare(b.s||''));
  const CURATED=["LeBron James","Stephen Curry","Kevin Durant","Giannis Antetokounmpo","Nikola Jokic","James Harden","Russell Westbrook","Chris Paul","Kawhi Leonard","Damian Lillard","Luka Doncic","Jayson Tatum","Joel Embiid","Kobe Bryant","Tim Duncan","Dirk Nowitzki","Shaquille O'Neal","Kevin Garnett","Steve Nash","Dwyane Wade","Vince Carter","Chris Bosh","Paul Pierce","Anthony Edwards","Victor Wembanyama"];
  let pool=CURATED.filter(n=>byName.has(n)&&byName.get(n).length>=4);
  while(pool.length<30){ for(const [nm,arr] of byName.entries()) if(arr.length>=10&&!pool.includes(nm)) pool.push(nm); if(pool.length>=40) break; }

  const playerGroup=new THREE.Group(); scene.add(playerGroup);

  function makePill(text,bg,fg,w=520,h=52,scale=2.2){
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const ctx=c.getContext('2d'); ctx.clearRect(0,0,w,h);
    ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(4,4,w-8,h-8,10); ctx.fill();
    ctx.fillStyle=fg; ctx.font='800 13px ui-monospace,monospace'; ctx.textAlign='left'; ctx.textBaseline='middle';
    let txt=text; if(txt.length>62) txt=txt.slice(0,60)+'…';
    ctx.fillText(txt,12,h/2+1);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false, depthTest:false });
    const s=new THREE.Sprite(mat); s.scale.set(scale, scale*0.12,1); return s;
  }

  function buildArc(name){
    const entries=byName.get(name)||[];
    const pts=[], meta=[];
    for(const e of entries){
      const si=seasonIdx.get(e.s); if(si===undefined) continue;
      const share=seasons[si]?.shares[e.c]||0;
      pts.push(new THREE.Vector3((e.c-3.5)*1.20, -2.1+share*5.6+0.95, getZ(si)));
      meta.push({ season:e.s, archeIdx:e.c, arche:shortNames[e.c], share, si });
    }
    if(pts.length<3) return null;
    const curve=new THREE.CatmullRomCurve3(pts);
    const tube=new THREE.TubeGeometry(curve, Math.max(pts.length*6,80), 0.105, 10, false);
    const baseColor=new THREE.Color(OKABE[meta[Math.floor(meta.length/2)].archeIdx%8]); baseColor.lerp(new THREE.Color(0xFFFFFF),0.10);
    const mesh=new THREE.Mesh(tube, new THREE.MeshStandardMaterial({ color:baseColor, emissive:baseColor, emissiveIntensity:0.28, roughness:0.38, transparent:true, opacity:0.96 }));

    const nodes=new THREE.Group();
    for(let i=0;i<pts.length;i++){
      const isChange=i>0&&meta[i].archeIdx!==meta[i-1].archeIdx;
      const g=new THREE.SphereGeometry(isChange?0.15:0.085,12,12);
      const m=new THREE.MeshStandardMaterial({ color:isChange?0xFFFFFF:baseColor, emissive:baseColor, emissiveIntensity:isChange?0.72:0.26, transparent:true, opacity:isChange?1:0.78 });
      const sph=new THREE.Mesh(g,m); sph.position.copy(pts[i]); nodes.add(sph);
      if(isChange){
        const ring=new THREE.Mesh(new THREE.RingGeometry(0.18,0.22,18), new THREE.MeshBasicMaterial({ color:0xFFFFFF, transparent:true, opacity:0.9, side:THREE.DoubleSide }));
        ring.position.copy(pts[i]); ring.position.y+=0.01; ring.rotation.x=Math.PI/2; nodes.add(ring);
      }
    }

    const labels=new THREE.Group();
    let changeIdx=0;
    for(let i=1;i<meta.length;i++) if(meta[i].archeIdx!==meta[i-1].archeIdx){
      const offY=(changeIdx%3)*0.24;
      const lab=makePill(`${meta[i].season}: → ${meta[i].arche} (league ${(meta[i].share*100).toFixed(1)}% vs ${(meta[0].share*100).toFixed(1)}% in ${meta[0].season})`, 'rgba(255,254,247,0.98)','#1A150F', 600,46,2.15);
      lab.position.set(pts[i].x+0.6, pts[i].y+0.42+offY, pts[i].z);
      labels.add(lab); changeIdx++;
    }
    const head=makePill(`${name} — ${entries[0]?.s} → ${entries[entries.length-1]?.s} — ${entries.length} seasons`, '#1A150F','#FFFEF7', 620,56,3.05);
    if(pts.length) head.position.set(pts[0].x-0.1, pts[0].y+0.86, pts[0].z);
    const tail=makePill(`${name} now: ${meta[meta.length-1].arche} — league ${(meta[meta.length-1].share*100).toFixed(1)}%`, baseColor.getStyle(), '#081018', 480,50,2.35);
    if(pts.length) tail.position.set(pts[pts.length-1].x+0.58, pts[pts.length-1].y+0.52, pts[pts.length-1].z);

    const traveller=new THREE.Mesh(new THREE.SphereGeometry(0.19,14,14), new THREE.MeshStandardMaterial({ color:0xFFFFFF, emissive:baseColor, emissiveIntensity:0.95 }));
    return { name, entries, pts, meta, curve, mesh, nodes, labels, head, tail, traveller, baseColor };
  }

  function clear(g){ while(g.children.length){ const c=g.children[0]; g.remove(c); if(c.geometry) c.geometry.dispose(); } }

  let current=null, tProg=0, paused=false, used=new Set(), lastSwitch=performance.now(), autoPauseUntil=0;
  function pickRandom(ex){ let cands=pool.filter(n=>n!==ex&&!used.has(n)); if(cands.length<4){ used.clear(); cands=pool.filter(n=>n!==ex); } return cands[Math.floor(Math.random()*cands.length)]; }

  const focusEl=document.getElementById('lemmino-drift-focus');
  const metaEl=document.getElementById('lemmino-drift-meta');
  const scrub=document.getElementById('drift-scrub');
  const scrubFill=document.getElementById('drift-scrub-fill');
  const btnPlay=document.getElementById('drift-play');
  const btnNext=document.getElementById('drift-next');
  const btnPrev=document.getElementById('drift-prev');

  function renderFocus(){
    if(!current||!focusEl) return;
    const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1);
    const m=current.meta[idx]; const first=current.meta[0];
    const delta=((m.share-first.share)*100).toFixed(1); const sign=parseFloat(delta)>=0?'+':'';
    focusEl.textContent=`● ${current.name} — ${m.season} — ${m.arche.toUpperCase()} — LEAGUE ${(m.share*100).toFixed(1)}% (${sign}${delta}pp vs ${first.season})`;
    if(metaEl){
      const changes=current.meta.filter((mm,i)=>i>0&&mm.archeIdx!==current.meta[i-1].archeIdx).length;
      metaEl.textContent=`${current.entries.length} seasons · ${changes} role shifts · cloud = all ${seasons[idx]?.total||''} players that year · white ring = archetype change`;
    }
    if(scrubFill) scrubFill.style.width=`${(tProg*100).toFixed(1)}%`;
  }

  function show(name){
    clear(playerGroup);
    const arc=buildArc(name);
    if(!arc){ const n=pickRandom(name); if(n) return show(n); return; }
    playerGroup.add(arc.mesh); playerGroup.add(arc.nodes); playerGroup.add(arc.labels); playerGroup.add(arc.head); playerGroup.add(arc.tail); playerGroup.add(arc.traveller);
    current=arc; tProg=0; lastSwitch=performance.now(); used.add(name); renderFocus();
  }

  show(pool[Math.floor(Math.random()*pool.length)]||'LeBron James');

  if(scrub){
    let dragging=false;
    function setFromX(clientX){
      const rect=scrub.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
      tProg=p; renderFocus(); if(current){ const pt=current.curve.getPointAt(Math.max(0.0001,Math.min(0.999,tProg))); if(pt){ current.traveller.position.copy(pt); current.traveller.position.y+=0.05; } }
    }
    scrub.addEventListener('pointerdown',e=>{ dragging=true; scrub.setPointerCapture(e.pointerId); setFromX(e.clientX); paused=true; if(btnPlay) btnPlay.textContent='▶'; });
    scrub.addEventListener('pointermove',e=>{ if(dragging) setFromX(e.clientX); });
    scrub.addEventListener('pointerup',()=>{ dragging=false; });
    scrub.addEventListener('click',e=> setFromX(e.clientX));
  }
  if(btnPlay) btnPlay.addEventListener('click',()=>{ paused=!paused; btnPlay.textContent=paused?'▶':'❚❚'; });
  if(btnNext) btnNext.addEventListener('click',()=>{ if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx+1;j<current.meta.length;j++) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; renderFocus(); return; } tProg=1; renderFocus(); });
  if(btnPrev) btnPrev.addEventListener('click',()=>{ if(!current) return; const idx=Math.floor(tProg*current.meta.length); for(let j=idx-1;j>=1;j--) if(current.meta[j].archeIdx!==current.meta[j-1].archeIdx){ tProg=j/current.meta.length; renderFocus(); return; } tProg=0; renderFocus(); });

  function onResize(){ const w=canvas.clientWidth,h=canvas.clientHeight; if(w<10||h<10) return; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
  const ro=new ResizeObserver(onResize); ro.observe(canvas); onResize();
  let visible=true; const io=new IntersectionObserver(es=>{ visible=es[0]?.isIntersecting??true; },{threshold:0.02}); io.observe(canvas);

  function tick(){
    requestAnimationFrame(tick);
    if(!visible) return;
    const now=performance.now();
    if(!paused && now>autoPauseUntil){
      tProg+=0.00034; if(tProg>1) tProg=0;
      if(current){
        const idx=Math.floor(tProg*current.meta.length);
        if(idx>0&&idx<current.meta.length&& current.meta[idx].archeIdx!==current.meta[idx-1].archeIdx){
          if(Math.abs(tProg - idx/current.meta.length) < 0.003) autoPauseUntil=now+1100;
        }
      }
    }
    if(current){
      const pt=current.curve.getPointAt(Math.max(0.0001,Math.min(0.999,tProg)));
      if(pt){ current.traveller.position.copy(pt); current.traveller.position.y+=0.05; }
    }
    camera.position.x=Math.sin(now*0.00012)*1.1;
    camera.position.y=2.6+Math.sin(now*0.00009)*0.18;
    const lookZ=current? current.curve.getPointAt(tProg)?.z||0 : 0;
    camera.lookAt(0,0, lookZ*0.45);
    renderFocus();
    if(now-lastSwitch>20000&&!paused){ const nxt=pickRandom(current?.name); if(nxt) show(nxt); lastSwitch=now; }
    renderer.render(scene,camera);
  }
  tick();

  return { getFocused(){ if(!current) return null; const idx=Math.min(Math.floor(tProg*current.meta.length), current.meta.length-1); return current.meta[idx]; }, show, dispose:()=>{ ro.disconnect(); io.disconnect(); renderer.dispose(); } };
}
