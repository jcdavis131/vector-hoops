/* city-intro.js v4 — immersive embedding hero + fun arena background
 * Solo personal project, no connection to employer, built with public/free-tier only
 * Free data: vectors.json 12966 seasons, teams.json
 * v4 changes:
 *  - embedding map = default background hero, arena = fun foreground toy
 *  - team lock → team-specific embedding map: highlight archetype focus by hash(team) %8
 *  - shows Team Universe card (glass dark) with counts, bars, team tint
 *  - supports embed-hero new DOM #team-universe-* + #sky-legend-anchor
 *  - improved bobbing arena, confetti on lock, team color fog
 */
(function(){
  'use strict';
  var CANVAS_ID='city-intro-canvas';
  var CITY_EL='city-intro-city';
  var ARENA_EL='city-intro-arena';
  var FANS_EL='city-intro-fans';
  var PILLS_EL='city-intro-pills';
  var BADGE_EL='city-intro-badge';

  var ARENAS={
    ATL:{city:'Atlanta',arena:'State Farm Arena'}, BOS:{city:'Boston',arena:'TD Garden'},
    BKN:{city:'Brooklyn',arena:'Barclays Center'}, CHA:{city:'Charlotte',arena:'Spectrum Center'},
    CHI:{city:'Chicago',arena:'United Center'}, CLE:{city:'Cleveland',arena:'Rocket Arena'},
    DAL:{city:'Dallas',arena:'American Airlines Center'}, DEN:{city:'Denver',arena:'Ball Arena'},
    DET:{city:'Detroit',arena:'Little Caesars Arena'}, GSW:{city:'Golden State',arena:'Chase Center'},
    HOU:{city:'Houston',arena:'Toyota Center'}, IND:{city:'Indianapolis',arena:'Gainbridge Fieldhouse'},
    LAC:{city:'LA Clippers',arena:'Intuit Dome'}, LAL:{city:'LA Lakers',arena:'Crypto.com Arena'},
    MEM:{city:'Memphis',arena:'FedExForum'}, MIA:{city:'Miami',arena:'Kaseya Center'},
    MIL:{city:'Milwaukee',arena:'Fiserv Forum'}, MIN:{city:'Minneapolis',arena:'Target Center'},
    NOP:{city:'New Orleans',arena:'Smoothie King Center'}, NYK:{city:'New York',arena:'Madison Square Garden'},
    OKC:{city:'Oklahoma City',arena:'Paycom Center'}, ORL:{city:'Orlando',arena:'Kia Center'},
    PHI:{city:'Philadelphia',arena:'Wells Fargo Center'}, PHX:{city:'Phoenix',arena:'PHX Arena'},
    POR:{city:'Portland',arena:'Moda Center'}, SAC:{city:'Sacramento',arena:'Golden 1 Center'},
    SAS:{city:'San Antonio',arena:'Frost Bank Center'}, TOR:{city:'Toronto',arena:'Scotiabank Arena'},
    UTA:{city:'Salt Lake City',arena:'Delta Center'}, WAS:{city:'Washington',arena:'Capital One Arena'},
  };

  var OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  var OKABE_RGB=[[0,114,178],[213,94,0],[0,158,115],[240,228,66],[86,180,233],[204,121,167],[230,159,0],[0,0,0]];
  var OKABE_LABEL=['Off Glass + Rim Prot','Off Glass Low Vol','3 Vol Low Impact','Def Glass + FTs','Shot Vol + 3 Vol','3 Acc + 3 Vol','Playmaking + Steals','Scoring Vol'];

  var teams=[];
  var currentIdx=0;
  var autoCycleTimer=null;
  var locked=false;
  var renderer,scene,camera,cityGroup,skyGroup,groundGroup;
  var prefersReduced=false;
  var embeddingData=null;
  var starFieldReady=false;
  var nebulaSprites=[];
  var fanMarkers=null;

  // v4 state for filtering
  var pointsMesh=null;
  var pointsOriginalColors=null; // Float32Array copy
  var pointsPlayers=[]; // ref to players
  var centroidsCache=null;
  var teamFocus=0;

  function hashToArchetype(abbr){
    var sum=0; for(var i=0;i<abbr.length;i++) sum+=abbr.charCodeAt(i);
    return sum % 8;
  }
  function getTeamColor(ab){
    var t=teams.find(function(x){return x.abbr===ab;}); return t?t.primary||'#E03A3E':'#E03A3E';
  }

  function init(){
    var canvas=document.getElementById(CANVAS_ID); if(!canvas) return;
    try{prefersReduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){}
    ensureDeps().then(setupThree).then(function(){
      wireUI();
      return loadTeamsData();
    }).then(function(){
      buildPills();
      try{var fav=localStorage.getItem('vectorHoops.favoriteTeam'); if(fav&&ARENAS[fav]){var idx=teams.findIndex(function(t){return t.abbr===fav;}); if(idx>=0){currentIdx=idx; locked=true;}}}catch(e){}
      return ensureStarfield();
    }).then(function(){
      renderCity();
      startCycle();
      buildSkyLegend();
      updateAttr();
    }).catch(function(e){console.warn('city-intro v4 init fail',e); fallbackGradient();});
  }

  function ensureDeps(){
    return new Promise(function(res){
      var haveThree=typeof THREE!=='undefined';
      var haveNeb=typeof window.VHEmbeddingNebula!=='undefined';
      if(haveThree&&haveNeb){res(); return;}
      if(!haveNeb){
        var s=document.createElement('script'); s.src='assets/embedding-nebula.js'; s.defer=false;
        s.onload=function(){checkThree();}; s.onerror=function(){checkThree();}; document.head.appendChild(s);
      } else {checkThree();}
      function checkThree(){
        if(typeof THREE!=='undefined'){res(); return;}
        var mod=document.createElement('script'); mod.type='module';
        mod.textContent="import * as T from 'three'; window.THREE=T; window.dispatchEvent(new Event('three-ready'));";
        mod.onerror=function(){res();}; document.head.appendChild(mod);
        if(typeof THREE!=='undefined'){res(); return;}
        var iv=setInterval(function(){if(typeof THREE!=='undefined'){clearInterval(iv); res();}},50);
        setTimeout(function(){clearInterval(iv); res();},3000);
      }
    });
  }

  function fallbackGradient(){var el=document.getElementById('city-intro'); if(el) el.style.background='radial-gradient(120% 120% at 20% 20%, #1E3A8A 0%, #111 55%)';}

  function setupThree(){
    var canvas=document.getElementById(CANVAS_ID); if(!canvas) return;
    scene=new THREE.Scene();
    scene.fog=new THREE.Fog(0x0e0e10, 32, 92);
    scene.background=new THREE.Color(0x07090f);
    camera=new THREE.PerspectiveCamera(52, canvas.clientWidth/canvas.clientHeight, 0.1, 400);
    camera.position.set(22,16,22);
    renderer=new THREE.WebGLRenderer({canvas:canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace;
    cityGroup=new THREE.Group(); scene.add(cityGroup);
    skyGroup=new THREE.Group(); scene.add(skyGroup);
    groundGroup=new THREE.Group(); cityGroup.add(groundGroup);
    var amb=new THREE.AmbientLight(0xffffff,0.78); scene.add(amb);
    var dir=new THREE.DirectionalLight(0xffffff,1.2); dir.position.set(18,32,12); dir.castShadow=true; dir.shadow.mapSize.set(1024,1024); dir.shadow.camera.near=2; dir.shadow.camera.far=90; dir.shadow.camera.left=-40; dir.shadow.camera.right=40; dir.shadow.camera.top=40; dir.shadow.camera.bottom=-30; scene.add(dir);
    var rim=new THREE.DirectionalLight(0x8ab4ff,0.38); rim.position.set(-14,12,-14); scene.add(rim);
    var hemi=new THREE.HemisphereLight(0x8aa8ff, 0x0a0a0a, 0.26); scene.add(hemi);
    window.addEventListener('resize', onResize);
    // simple drag to orbit?
    addDragControls();
    animate();
  }

  function addDragControls(){
    var canvas=document.getElementById(CANVAS_ID);
    if(!canvas) return;
    var dragging=false, lastX=0, yawOffset=0, pitchOffset=0;
    canvas.style.cursor='grab';
    canvas.addEventListener('pointerdown', function(e){dragging=true; lastX=e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor='grabbing';});
    canvas.addEventListener('pointerup', function(e){dragging=false; canvas.style.cursor='grab';});
    canvas.addEventListener('pointermove', function(e){
      if(!dragging) return;
      var dx=e.clientX-lastX; lastX=e.clientX;
      yawOffset+=dx*0.008;
    });
    canvas.addEventListener('wheel', function(e){
      // zoom by adjusting camera fov slightly
      if(!camera) return;
      var delta = Math.sign(e.deltaY)*0.8;
      camera.fov = Math.max(32, Math.min(72, camera.fov + delta));
      camera.updateProjectionMatrix();
    }, {passive:true});
    // expose for animate loop
    canvas.__yawOffset=function(){return yawOffset;};
  }

  function onResize(){
    var canvas=document.getElementById(CANVAS_ID); if(!canvas||!renderer||!camera) return;
    var w=canvas.clientWidth,h=canvas.clientHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
  }

  function loadTeamsData(){
    return fetch('assets/teams.json',{cache:'no-cache'}).then(function(r){return r.json();}).then(function(j){
      teams=j.teams||[];
      if(!teams.length){
        var fallbackColors={ATL:['#E03A3E','#FDB927'],BOS:['#007A33','#BA9653'],BKN:['#000000','#FFFFFF'],CHA:['#1D1160','#00788C'],CHI:['#CE1141','#000000'],CLE:['#860038','#FDBB30'],DAL:['#00538C','#002B5E'],DEN:['#0E2240','#FEC524'],DET:['#C8102E','#006BB6'],GSW:['#1D428A','#FFC72C'],HOU:['#CE1141','#000000'],IND:['#002D62','#FDBB30'],LAC:['#C8102E','#1D42BA'],LAL:['#552583','#FDB927'],MEM:['#5D76A9','#12173F'],MIA:['#98002E','#F9A01B'],MIL:['#00471B','#EEE1C6'],MIN:['#0C2340','#236192'],NOP:['#0C2340','#C8102E'],NYK:['#006BB6','#F58426'],OKC:['#007AC1','#EF3B24'],ORL:['#0077C0','#C4CED4'],PHI:['#006BB6','#ED174C'],PHX:['#1D1160','#E56020'],POR:['#E03A3E','#000000'],SAC:['#5A2D81','#63727A'],SAS:['#C4CED4','#000000'],TOR:['#CE1141','#000000'],UTA:['#002B5C','#F9A01B'],WAS:['#002B5C','#E31837']};
        teams=Object.keys(ARENAS).map(function(abbr,i){var a=ARENAS[abbr]; var cols=fallbackColors[abbr]||['#E03A3E','#FFFFFF']; return {abbr:abbr, name:a.city, city:a.city, arena:a.arena, primary:cols[0], secondary:cols[1], id:i};});
      }
      teams.sort(function(a,b){var ca=ARENAS[a.abbr]?ARENAS[a.abbr].city:a.name; var cb=ARENAS[b.abbr]?ARENAS[b.abbr].city:b.name; return ca.localeCompare(cb);});
    }).catch(function(){teams=[];});
  }

  function buildPills(){
    var root=document.getElementById(PILLS_EL); if(!root) return; root.innerHTML='';
    teams.forEach(function(t,idx){
      var btn=document.createElement('button'); btn.className='city-pill'; btn.dataset.abbr=t.abbr; btn.dataset.idx=String(idx);
      btn.style.setProperty('--team-primary', t.primary); btn.textContent=t.abbr;
      btn.title=(ARENAS[t.abbr]?ARENAS[t.abbr].city+' — '+ARENAS[t.abbr].arena:t.name);
      btn.addEventListener('click',function(){selectCity(idx,true);});
      root.appendChild(btn);
    });
    syncPills();
  }
  function syncPills(){
    var root=document.getElementById(PILLS_EL); if(!root) return;
    var fav=null; try{fav=localStorage.getItem('vectorHoops.favoriteTeam');}catch(e){}
    Array.prototype.forEach.call(root.children,function(el){var abbr=el.dataset.abbr; el.classList.toggle('is-active', teams[currentIdx]&&teams[currentIdx].abbr===abbr); el.classList.toggle('is-favorite', fav&&fav===abbr);});
    var lockBtn=document.getElementById('city-intro-lock'); if(lockBtn){lockBtn.classList.toggle('is-locked', locked); lockBtn.textContent=locked?'Locked • '+(teams[currentIdx]?teams[currentIdx].abbr:'')+' — unlock':'Lock to my team';}
  }
  function selectCity(idx,lockIt){
    currentIdx=idx;
    if(lockIt) locked=true;
    // confetti pop
    if(lockIt) spawnConfetti();
    renderCity();
    resetCycle();
    syncPills();
  }

  function spawnConfetti(){
    // tiny emoji confetti via DOM
    var hero=document.getElementById('city-intro'); if(!hero) return;
    var c=document.createElement('div');
    c.style.cssText='position:absolute; left:50%; top:42%; transform:translate(-50%,-50%); pointer-events:none; z-index:5; font-size:28px; animation:pop 700ms ease-out forwards;';
    c.textContent='✨🏀✨';
    hero.appendChild(c);
    var style=document.createElement('style');
    style.textContent='@keyframes pop{0%{transform:translate(-50%,-50%) scale(.2); opacity:0} 20%{opacity:1} 100%{transform:translate(-50%,-110%) scale(1.6); opacity:0}}';
    document.head.appendChild(style);
    setTimeout(function(){c.remove(); style.remove();},800);
  }

  // --- Court ground + chibi arena (fun toys) ---
  function buildCityMesh(team){
    while(groundGroup.children.length>0){var o=groundGroup.children[0]; groundGroup.remove(o); if(o.geometry) o.geometry.dispose(); if(o.material){if(Array.isArray(o.material)) o.material.forEach(function(m){m.dispose();}); else o.material.dispose();}}

    // large court plane #FFFEF7 with ink lines
    var groundGeo=new THREE.PlaneGeometry(160,160);
    var groundMat=new THREE.MeshStandardMaterial({color:0xFFFEF7, roughness:0.92, metalness:0.02});
    var ground=new THREE.Mesh(groundGeo,groundMat); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; groundGroup.add(ground);

    var inkMat=new THREE.MeshBasicMaterial({color:0x1A150F});
    function line(w,h,x,z,rot){
      var g=new THREE.PlaneGeometry(w,h); var m=new THREE.Mesh(g,inkMat); m.position.set(x,0.02,z); m.rotation.x=-Math.PI/2; if(rot) m.rotation.z=rot; groundGroup.add(m); return m;
    }
    var W=44,H=28;
    line(W,0.18,0,-H/2); line(W,0.18,0,H/2); line(0.18,H, -W/2,0); line(0.18,H, W/2,0);
    line(0.14,H*0.96,0,0);
    var circGeo=new THREE.RingGeometry(3.8,4.0,48); var circMat=new THREE.MeshBasicMaterial({color:0x1A150F, side:THREE.DoubleSide}); var circ=new THREE.Mesh(circGeo,circMat); circ.rotation.x=-Math.PI/2; circ.position.set(0,0.03,0); groundGroup.add(circ);
    // center dot team color pulsing
    var dotGeo=new THREE.CircleGeometry(0.7,22); var dotMat=new THREE.MeshStandardMaterial({color:new THREE.Color(team.primary), roughness:0.6, emissive:new THREE.Color(team.primary), emissiveIntensity:0.25}); var dot=new THREE.Mesh(dotGeo,dotMat); dot.rotation.x=-Math.PI/2; dot.position.set(0,0.04,0); groundGroup.add(dot);
    dot.userData.isPulse=true;

    var primary=team.primary||'#E03A3E'; var secondary=team.secondary||'#fff';
    var arenaGroup=new THREE.Group(); groundGroup.add(arenaGroup);

    var baseGeo=new THREE.CylinderGeometry(6.2,6.8,2.4,24); var baseMat=new THREE.MeshStandardMaterial({color:new THREE.Color(primary), roughness:0.58, metalness:0.12, emissive:new THREE.Color(primary), emissiveIntensity:0.13});
    var base=new THREE.Mesh(baseGeo,baseMat); base.position.y=1.2; base.castShadow=true; base.receiveShadow=true; arenaGroup.add(base);
    base.userData.isArena=true;

    for(var rr=0;rr<12;rr++){var ang=(rr/12)*Math.PI*2; var ribGeo=new THREE.BoxGeometry(0.28,2.2,0.32); var ribMat=new THREE.MeshStandardMaterial({color:0xFFFEF7}); var rib=new THREE.Mesh(ribGeo,ribMat); rib.position.set(Math.cos(ang)*6.48,1.3,Math.sin(ang)*6.48); rib.lookAt(0,1.3,0); rib.castShadow=true; arenaGroup.add(rib);}

    var roofGeo=new THREE.TorusGeometry(5.4,0.56,12,28); var roofMat=new THREE.MeshStandardMaterial({color:new THREE.Color(secondary), roughness:0.5, emissive:new THREE.Color(secondary), emissiveIntensity:0.09});
    var roof=new THREE.Mesh(roofGeo,roofMat); roof.position.y=2.9; roof.rotation.x=Math.PI/2; roof.castShadow=true; arenaGroup.add(roof);

    var courtGeo=new THREE.BoxGeometry(4.2,0.12,2.2); var courtMat=new THREE.MeshStandardMaterial({color:0xE8D5B5, roughness:0.82}); var court=new THREE.Mesh(courtGeo,courtMat); court.position.y=2.46; arenaGroup.add(court);

    var logoGeo=new THREE.CircleGeometry(0.85,18); var logoMat=new THREE.MeshStandardMaterial({color:new THREE.Color(primary), emissive:new THREE.Color(primary), emissiveIntensity:0.45}); var logo=new THREE.Mesh(logoGeo,logoMat); logo.rotation.x=-Math.PI/2; logo.position.y=2.53; arenaGroup.add(logo);

    var bleacherMat=new THREE.MeshStandardMaterial({color:0x111111, roughness:0.8});
    for(var b=0;b<4;b++){var ang=(b/4)*Math.PI*2+Math.PI/4; var bg=new THREE.BoxGeometry(2.2,0.7,1.1); var bm=new THREE.Mesh(bg,bleacherMat); bm.position.set(Math.cos(ang)*9.2,0.35,Math.sin(ang)*9.2); bm.rotation.y=-ang; bm.castShadow=true; arenaGroup.add(bm);}

    // fans instanced
    if(fanMarkers){groundGroup.remove(fanMarkers); if(fanMarkers.geometry) fanMarkers.geometry.dispose(); if(fanMarkers.material) fanMarkers.material.dispose();}
    var fanCount=64; var fanGeo=new THREE.SphereGeometry(0.18,6,6); var fanMat=new THREE.MeshStandardMaterial({color:0xffffff});
    fanMarkers=new THREE.InstancedMesh(fanGeo,fanMat,fanCount); fanMarkers.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    var dummy=new THREE.Object3D(); var idx=0;
    for(var i=0;i<fanCount;i++){
      var a=(i/fanCount)*Math.PI*2 + (Math.random()-0.5)*0.2;
      var rad=8.6+Math.random()*3.2;
      var x=Math.cos(a)*rad, z=Math.sin(a)*rad;
      dummy.position.set(x,0.45+Math.random()*0.25,z); dummy.scale.setScalar(0.8+Math.random()*0.5); dummy.updateMatrix();
      fanMarkers.setMatrixAt(idx,dummy.matrix);
      var c = i%3===0? new THREE.Color(primary): i%3===1? new THREE.Color(secondary): new THREE.Color(0xFFFEF7);
      fanMarkers.setColorAt(idx,c);
      idx++;
    }
    if(fanMarkers.instanceColor) fanMarkers.instanceColor.needsUpdate=true;
    fanMarkers.instanceMatrix.needsUpdate=true;
    groundGroup.add(fanMarkers);

    arenaGroup.userData.baseY=0;
    arenaGroup.userData.bobSpeed=0.9 + Math.random()*0.6;
  }

  // --- Embedding sky v4 — lite first for 10M DAU perf ---
  async function fetchJson(url){
    try{var r=await fetch(url,{cache:'force-cache'}); if(!r.ok) throw new Error(r.status); return await r.json();}catch(e){return null;}
  }
  async function ensureEmbeddingData(){
    if(embeddingData) return embeddingData;
    // try lite 631KB (114KB gz) first — 7x faster than 3MB
    var j=await fetchJson('assets/vectors_lite.json');
    if(!j) j=await fetchJson('assets/vectors.json');
    if(j){ embeddingData=j; return j; }
    console.warn('vectors load fail'); return null;
  }
  async function ensureStarfield(){
    if(starFieldReady) return;
    var data=await ensureEmbeddingData(); if(!data) return;
    buildStarfield(data.players||[]);
    starFieldReady=true;
  }

  function mapToSkyLocal(x,y,z){
    if(window.VHEmbeddingNebula&&window.VHEmbeddingNebula.mapToSky) return window.VHEmbeddingNebula.mapToSky(x,y,z);
    var az=(x-0.5)*Math.PI*1.9; var el=0.11 + y*1.02; var r=88 + (z||0.5)*42; return {az:az, el:el, r:r};
  }
  function worldFromSkyLocal(m){
    if(window.VHEmbeddingNebula&&window.VHEmbeddingNebula.worldFromSky) return window.VHEmbeddingNebula.worldFromSky(m);
    var cx=m.r*Math.cos(m.el)*Math.sin(m.az); var cy=m.r*Math.sin(m.el); var cz=m.r*Math.cos(m.el)*Math.cos(m.az); return {x:cx, y:cy-2, z:cz};
  }

  function buildStarfield(players){
    if(!scene||!skyGroup) return;
    pointsPlayers=players;
    while(skyGroup.children.length){var o=skyGroup.children[0]; skyGroup.remove(o); if(o.geometry) o.geometry.dispose(); if(o.material){if(Array.isArray(o.material)) o.material.forEach(function(m){m.dispose();}); else o.material.dispose();}}
    nebulaSprites=[];

    var sums=[]; for(var k=0;k<8;k++) sums[k]={x:0,y:0,z:0,cnt:0};
    for(var i=0;i<players.length;i++){var p=players[i]; var c=p.c; if(c>=0&&c<8){sums[c].x+=p.x; sums[c].y+=p.y; sums[c].z+=p.z; sums[c].cnt++;}}
    var centroids=[]; for(var k=0;k<8;k++){if(sums[k].cnt){centroids[k]={x:sums[k].x/sums[k].cnt, y:sums[k].y/sums[k].cnt, z:sums[k].z/sums[k].cnt, cnt:sums[k].cnt};} else centroids[k]={x:0.5,y:0.5,z:0.5,cnt:0};}
    centroidsCache=centroids;

    for(var k=0;k<8;k++){
      var c=centroids[k];
      var sky=mapToSkyLocal(c.x,c.y,c.z);
      var world=worldFromSkyLocal({r:sky.r*0.98, az:sky.az, el:sky.el});
      var canvas;
      if(window.VHEmbeddingNebula&&window.VHEmbeddingNebula.createNebulaCanvas){
        canvas=window.VHEmbeddingNebula.createNebulaCanvas(OKABE[k], OKABE_RGB[k], 1.0);
      } else {
        canvas=document.createElement('canvas'); canvas.width=256; canvas.height=256;
        var ctx=canvas.getContext('2d'); var grad=ctx.createRadialGradient(128,128,0,128,128,128);
        var rgb=OKABE_RGB[k]; grad.addColorStop(0,'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0.34)'); grad.addColorStop(1,'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0)'); ctx.fillStyle=grad; ctx.fillRect(0,0,256,256);
      }
      var tex=new THREE.CanvasTexture(canvas); tex.colorSpace=THREE.SRGBColorSpace;
      var sprMat=new THREE.SpriteMaterial({map:tex, transparent:true, opacity:0.46, fog:false, depthWrite:false, blending:THREE.AdditiveBlending});
      var spr=new THREE.Sprite(sprMat); spr.position.set(world.x, world.y, world.z); spr.scale.set(28+centroids[k].cnt/250,28+centroids[k].cnt/250,1);
      skyGroup.add(spr); nebulaSprites.push({sprite:spr, baseScale:28+centroids[k].cnt/250, archetype:k});
    }

    var count=players.length;
    var pos=new Float32Array(count*3);
    var col=new Float32Array(count*3);
    for(var i=0;i<count;i++){
      var p=players[i];
      var s=mapToSkyLocal(p.x,p.y,p.z);
      var r=s.r + Math.random()*2.2;
      var w=worldFromSkyLocal({r:r, az:s.az, el:s.el});
      pos[i*3]=w.x; pos[i*3+1]=w.y; pos[i*3+2]=w.z;
      var k=p.c>=0&&p.c<8?p.c:0; var rgb=OKABE_RGB[k];
      if(k===7){ col[i*3]=0.18; col[i*3+1]=0.18; col[i*3+2]=0.20; } else { col[i*3]=rgb[0]/255*0.88+0.12; col[i*3+1]=rgb[1]/255*0.88+0.12; col[i*3+2]=rgb[2]/255*0.88+0.12; }
    }
    var geo=new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos,3)); geo.setAttribute('color', new THREE.BufferAttribute(col,3));
    var mat=new THREE.PointsMaterial({size:1.6, vertexColors:true, transparent:true, opacity:0.72, sizeAttenuation:true, depthWrite:false, fog:false});
    var points=new THREE.Points(geo,mat);
    skyGroup.add(points);
    pointsMesh=points;
    pointsOriginalColors=col.slice();

    var centPos=[];
    for(var k=0;k<8;k++){
      var c=centroids[k]; var s=mapToSkyLocal(c.x,c.y,c.z); var w=worldFromSkyLocal({r:s.r*1.02, az:s.az, el:s.el}); centPos.push(new THREE.Vector3(w.x,w.y,w.z));
    }
    for(var k=0;k<8;k++){
      var vp=centPos[k];
      var sphereGeo=new THREE.SphereGeometry(0.72,16,16);
      var sphereMat=new THREE.MeshBasicMaterial({color:new THREE.Color(OKABE[k]), transparent:false, fog:false});
      if(k===7){sphereMat.color=new THREE.Color(0x222222);}
      var mesh=new THREE.Mesh(sphereGeo,sphereMat); mesh.position.copy(vp); skyGroup.add(mesh);
      var haloGeo=new THREE.SphereGeometry(1.18,14,14);
      var haloMat=new THREE.MeshBasicMaterial({color:new THREE.Color(OKABE[k]), transparent:true, opacity:0.20, fog:false, depthWrite:false, blending:THREE.AdditiveBlending});
      if(k===7) haloMat.color=new THREE.Color(0x999999);
      var halo=new THREE.Mesh(haloGeo,haloMat); halo.position.copy(vp); skyGroup.add(halo);
      var pl=new THREE.PointLight(new THREE.Color(OKABE[k]), 0.8, 24); pl.position.copy(vp); skyGroup.add(pl);

      var labelCanvas=document.createElement('canvas'); labelCanvas.width=256; labelCanvas.height=64;
      var lctx=labelCanvas.getContext('2d');
      if(lctx){
        lctx.fillStyle='#FFFEF7'; lctx.strokeStyle='#1A150F'; lctx.lineWidth=4;
        var rad=14; var x=2,y=2,w=252,h=60;
        lctx.beginPath(); lctx.moveTo(x+rad,y); lctx.arcTo(x+w,y,x+w,y+h,rad); lctx.arcTo(x+w,y+h,x,y+h,rad); lctx.arcTo(x,y+h,x,y,rad); lctx.arcTo(x,y,x+w,y,rad); lctx.closePath(); lctx.fill(); lctx.stroke();
        lctx.fillStyle='#1A150F'; lctx.font='bold 18px ui-monospace, monospace'; lctx.textBaseline='middle';
        lctx.fillText(OKABE_LABEL[k], 14, 32);
      }
      var ltex=new THREE.CanvasTexture(labelCanvas); ltex.colorSpace=THREE.SRGBColorSpace;
      var lsMat=new THREE.SpriteMaterial({map:ltex, transparent:false, fog:false, depthWrite:false});
      var ls=new THREE.Sprite(lsMat); ls.position.set(vp.x, vp.y+2.2, vp.z); ls.scale.set(6.2,1.55,1); skyGroup.add(ls);
    }
    var linePositions=[]; var used={};
    for(var k=0;k<8;k++){
      var dists=[]; for(var j=0;j<8;j++){if(j===k) continue; var dx=centroids[k].x-centroids[j].x; var dy=centroids[k].y-centroids[j].y; var dz=centroids[k].z-centroids[j].z; var d=dx*dx+dy*dy+dz*dz; dists.push({j:j,d:d});}
      dists.sort(function(a,b){return a.d-b.d;});
      for(var n=0;n<2;n++){var nb=dists[n]; var key=k<nb.j?k+'-'+nb.j:nb.j+'-'+k; if(used[key]) continue; used[key]=true; linePositions.push(centPos[k].x, centPos[k].y, centPos[k].z, centPos[nb.j].x, centPos[nb.j].y, centPos[nb.j].z); }
    }
    if(linePositions.length){
      var lineGeo=new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions,3));
      var lineMat=new THREE.LineBasicMaterial({color:0x8aa0c8, transparent:true, opacity:0.28, fog:false, depthWrite:false});
      var lines=new THREE.LineSegments(lineGeo,lineMat); skyGroup.add(lines);
    }

    // initial filter if locked
    if(locked && teams[currentIdx]) applyTeamFilter(teams[currentIdx].abbr);
  }

  function applyTeamFilter(abbr){
    if(!pointsMesh || !pointsOriginalColors || !centroidsCache) return;
    var focus=hashToArchetype(abbr);
    teamFocus=focus;
    var team=teams.find(function(t){return t.abbr===abbr;});
    var teamColor = team? new THREE.Color(team.primary) : new THREE.Color('#F0E442');
    var colorAttr=pointsMesh.geometry.getAttribute('color');
    var arr=colorAttr.array;
    // restore original then tint focus
    for(var i=0;i<pointsPlayers.length;i++){
      var p=pointsPlayers[i];
      var k=p.c>=0&&p.c<8?p.c:0;
      if(k===focus){
        // blend original with team color 35%
        var r0=pointsOriginalColors[i*3], g0=pointsOriginalColors[i*3+1], b0=pointsOriginalColors[i*3+2];
        var tr=teamColor.r, tg=teamColor.g, tb=teamColor.b;
        arr[i*3]= r0*0.62 + tr*0.38 + 0.12;
        arr[i*3+1]= g0*0.62 + tg*0.38 + 0.12;
        arr[i*3+2]= b0*0.62 + tb*0.38 + 0.12;
      } else {
        // dim
        var r0=pointsOriginalColors[i*3], g0=pointsOriginalColors[i*3+1], b0=pointsOriginalColors[i*3+2];
        arr[i*3]= r0*0.32 + 0.04;
        arr[i*3+1]= g0*0.32 + 0.04;
        arr[i*3+2]= b0*0.32 + 0.06;
      }
    }
    colorAttr.needsUpdate=true;
    pointsMesh.material.opacity = 0.92;
    pointsMesh.material.size = 1.9;

    // nebula emphasize
    nebulaSprites.forEach(function(entry){
      var spr=entry.sprite;
      if(entry.archetype===focus){
        spr.material.opacity=0.72;
        spr.scale.set(entry.baseScale*1.45, entry.baseScale*1.45,1);
      } else {
        spr.material.opacity=0.18;
        spr.scale.set(entry.baseScale*0.72, entry.baseScale*0.72,1);
      }
    });

    // fog tint
    if(scene){
      scene.background=new THREE.Color(team.primary).lerp(new THREE.Color(0x07090f), 0.88);
      if(scene.fog){
        scene.fog.color=new THREE.Color(team.primary).lerp(new THREE.Color(0x0e0e10), 0.90);
      }
    }
    updateTeamUniverseCard(abbr, focus);
  }

  function clearTeamFilter(){
    if(!pointsMesh || !pointsOriginalColors) return;
    var colorAttr=pointsMesh.geometry.getAttribute('color');
    if(!colorAttr) return;
    colorAttr.array.set(pointsOriginalColors);
    colorAttr.needsUpdate=true;
    pointsMesh.material.opacity=0.72;
    pointsMesh.material.size=1.6;
    nebulaSprites.forEach(function(entry){
      entry.sprite.material.opacity=0.46;
      entry.sprite.scale.set(entry.baseScale, entry.baseScale,1);
    });
    if(scene){
      scene.background=new THREE.Color(0x07090f);
      if(scene.fog) scene.fog.color=new THREE.Color(0x0e0e10);
    }
    updateTeamUniverseCard(null, null);
  }

  function updateTeamUniverseCard(abbr, focus){
    var card=document.getElementById('team-universe-card');
    var titleEl=document.getElementById('team-universe-title');
    var metaEl=document.getElementById('team-universe-meta');
    var barsEl=document.getElementById('team-universe-bars');
    var toggleBtn=document.getElementById('team-universe-toggle');
    if(!card) return;
    if(!abbr || focus===null || !centroidsCache){
      card.style.display='none';
      if(toggleBtn) toggleBtn.style.display='none';
      return;
    }
    var team=teams.find(function(t){return t.abbr===abbr;});
    var arenaInfo=ARENAS[abbr]||{city:abbr, arena:'Arena'};
    var total=pointsPlayers.length||12966;
    var focusCount=centroidsCache[focus]?centroidsCache[focus].cnt:0;
    var pct=Math.round(focusCount/total*100);
    card.style.display='block';
    card.style.borderColor=team?team.primary:'#111';
    card.style.setProperty('--team-primary', team?team.primary:'#F0E442');
    if(titleEl) titleEl.textContent=arenaInfo.city+' '+abbr+' universe — '+OKABE_LABEL[focus];
    if(metaEl){
      // compact on mobile: 1 line
      var isMobile = window.innerWidth <= 860;
      if(isMobile){
        metaEl.innerHTML=
          '<span style="display:inline-flex; gap:6px; align-items:center;"><span style="width:8px; height:8px; border-radius:50%; background:'+(team?team.primary:'#F0E442')+'; border:1px solid #fff; display:inline-block;"></span> '+focusCount.toLocaleString()+'/'+total.toLocaleString()+' · '+pct+'% · '+OKABE_LABEL[focus].split(' ')[0]+'</span>';
      } else {
        metaEl.innerHTML=
          '<span style="display:inline-flex; gap:6px; align-items:center;"><span style="width:10px; height:10px; border-radius:50%; background:'+(team?team.primary:'#F0E442')+'; border:1.5px solid #111; display:inline-block;"></span> '+focusCount.toLocaleString()+' of '+total.toLocaleString()+' seasons in '+OKABE_LABEL[focus]+'</span><br>'+
          pct+'% of sky shares '+abbr+' focus · drag to explore';
      }
    }
    if(barsEl){
      barsEl.innerHTML='';
      var max=Math.max.apply(null, centroidsCache.map(function(c){return c.cnt;}));
      // order: focus first, then others sorted by cnt desc for mobile visibility
      var order = [];
      order.push(focus);
      for(var k=0;k<8;k++){ if(k!==focus) order.push(k); }
      // sort remaining by count after focus
      var tail = order.slice(1).sort(function(a,b){ return (centroidsCache[b]?centroidsCache[b].cnt:0) - (centroidsCache[a]?centroidsCache[a].cnt:0); });
      order = [focus].concat(tail);
      for(var oi=0; oi<order.length; oi++){
        var k=order[oi];
        var cnt=centroidsCache[k]?centroidsCache[k].cnt:0;
        var w=Math.max(6, Math.round(cnt/max*100));
        var row=document.createElement('div');
        row.style.cssText='display:flex; align-items:center; gap:6px; font-family:var(--mono); font-size:9px;';
        var label=document.createElement('span'); label.textContent=OKABE_LABEL[k].slice(0,16); label.style.cssText='width:84px; flex:0 0 84px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:'+(k===focus?1:0.72)+'; font-weight:'+(k===focus?900:700)+';';
        var track=document.createElement('div'); track.style.cssText='flex:1; height:6px; background:rgba(255,255,255,.16); border-radius:999px; overflow:hidden; border:1px solid rgba(255,255,255,.18);';
        var bar=document.createElement('div'); bar.style.cssText='height:100%; width:'+w+'%; background:'+(k===focus? (team?team.primary:OKABE[k]) : OKABE[k])+'; border-radius:999px; opacity:'+(k===focus?1:0.55)+';';
        if(k===focus){bar.style.boxShadow='0 0 0 2px '+(team?team.primary:'#F0E442')+'44';}
        track.appendChild(bar);
        var count=document.createElement('span'); count.textContent=cnt.toLocaleString(); count.style.cssText='width:32px; text-align:right; opacity:.8; font-size:9px;';
        row.appendChild(label); row.appendChild(track); row.appendChild(count);
        barsEl.appendChild(row);
      }
    }
    card.dataset.abbr=abbr;
    card.dataset.focus=String(focus);
    var shareBtn=document.getElementById('team-universe-share');
    if(toggleBtn){
      toggleBtn.style.display = window.innerWidth <= 860 ? 'inline-flex' : 'inline-flex';
      if(!card.classList.contains('is-expanded')){
        toggleBtn.textContent='Show breakdown';
      }
    }
    if(shareBtn){ shareBtn.style.display='inline-flex'; }
    }
  }

  function buildSkyLegend(){
    var anchor=document.getElementById('sky-legend-anchor') || document.querySelector('.city-intro__overlay');
    var overlay=document.querySelector('.embed-hero__arena-hud');
    // create legend element
    var existing=document.getElementById('sky-legend'); if(existing) existing.remove();
    var legend=document.createElement('div'); legend.id='sky-legend'; legend.setAttribute('role','note'); legend.setAttribute('aria-label','Embedding sky legend');
    legend.style.cssText='position:relative; background:rgba(255,254,247,0.92); border:2px solid #1A150F; border-radius:14px; padding:12px 14px; backdrop-filter:blur(12px); max-width:260px; box-shadow:5px 5px 0 #1A150F;';
    var title=document.createElement('div'); title.textContent='Embedding sky — 8 archetypes'; title.style.cssText='font-family:ui-monospace,monospace; font-size:11px; font-weight:900; letter-spacing:.08em; color:#1A150F; text-transform:uppercase; margin-bottom:8px;';
    legend.appendChild(title);
    for(var k=0;k<8;k++){
      var row=document.createElement('div'); row.style.cssText='display:flex; align-items:center; gap:8px; margin:5px 0; font-family:ui-monospace,monospace; font-size:11px; color:#1A150F; line-height:1.3;';
      var dot=document.createElement('span'); dot.setAttribute('aria-hidden','true'); dot.style.cssText='width:10px; height:10px; border-radius:50%; background:'+OKABE[k]+'; border:2px solid #1A150F; box-shadow:0 0 0 2px '+OKABE[k]+'22; flex:0 0 10px; display:inline-block;';
      if(k===7) dot.style.background='#222';
      var txt=document.createElement('span'); txt.textContent=OKABE_LABEL[k];
      row.appendChild(dot); row.appendChild(txt); legend.appendChild(row);
    }
    var hint=document.createElement('div'); hint.textContent='Colored clouds = archetype density · Dots = 12,966 seasons · Bright = centroid · Lock a team to tint universe';
    hint.style.cssText='margin-top:8px; font-family:ui-monospace,monospace; font-size:10px; color:#4a4a4a; line-height:1.35;';
    legend.appendChild(hint);
    if(anchor && anchor.id==='sky-legend-anchor'){
      anchor.appendChild(legend);
    } else if(overlay){
      overlay.appendChild(legend);
    } else {
      document.body.appendChild(legend);
    }
  }

  function updateAttr(){
    var attr=document.getElementById('osm-attr'); if(attr){attr.innerHTML='Embedding sky · <b>12,966 seasons</b> as dots · 8 archetypes · <a href="/methods">Methods</a> · CQS 66.29 · leakfree 0.977 · <span style="background:var(--okabe-yellow); border:1px solid #111; padding:1px 6px; border-radius:999px;">Drag to orbit • Scroll to zoom</span>';}
  }

  function animate(){
    requestAnimationFrame(animate);
    if(!renderer||!scene||!camera) return;
    var now=performance.now()*0.001;
    var t=now*0.12;
    var canvas=document.getElementById(CANVAS_ID);
    var extraYaw=canvas && canvas.__yawOffset ? canvas.__yawOffset() : 0;
    var radius=locked?16+Math.sin(now*0.08)*1.0:22+Math.sin(now*0.06)*2;
    var height=locked?8+Math.sin(now*0.13)*0.8:13+Math.sin(now*0.07)*1.4;
    var angle=t+currentIdx*0.6+extraYaw;
    if(prefersReduced) angle=t*0.20+extraYaw*0.2;
    camera.position.set(Math.cos(angle)*radius, height, Math.sin(angle)*radius);
    camera.lookAt(0,1.6,0);

    // bobbing arena
    if(groundGroup){
      groundGroup.children.forEach(function(g){
        if(g.userData && g.userData.bobSpeed!==undefined){
          var bob=Math.sin(now*g.userData.bobSpeed)*0.12;
          g.position.y=bob;
        }
        // pulse dot
        g.traverse&&g.traverse(function(child){
          if(child.userData && child.userData.isPulse){
            var s=1+Math.sin(now*2.2)*0.15;
            child.scale.set(s,s,s);
          }
        });
      });
    }

    if(skyGroup && !prefersReduced){
      skyGroup.rotation.y = now*0.008 + extraYaw*0.05;
      skyGroup.rotation.x = Math.sin(now*0.03)*0.02;
    }
    renderer.render(scene,camera);
  }

  function startCycle(){stopCycle(); if(locked) return; autoCycleTimer=setInterval(function(){if(locked) return; currentIdx=(currentIdx+1)%teams.length; renderCity(); syncPills();}, 6800);}
  function stopCycle(){if(autoCycleTimer){clearInterval(autoCycleTimer); autoCycleTimer=null;}}
  function resetCycle(){stopCycle(); if(!locked) startCycle();}

  function renderCity(){
    if(!teams[currentIdx]||!scene) return;
    var team=teams[currentIdx]; var abbr=team.abbr; var arenaInfo=ARENAS[abbr]||{city:team.name.split(' ').slice(-1)[0], arena:'Arena'};
    var cityEl=document.getElementById(CITY_EL), arenaEl=document.getElementById(ARENA_EL), fansEl=document.getElementById(FANS_EL), badgeEl=document.getElementById(BADGE_EL);
    if(cityEl){cityEl.innerHTML=arenaInfo.city+' <span style="color:'+team.primary+'">'+abbr+'</span>'; cityEl.style.setProperty('--team-accent', team.primary);}
    if(arenaEl){arenaEl.textContent=arenaInfo.arena+' · '+abbr+' · chibi court • '+ (pointsPlayers.length||12966).toLocaleString() +' seasons sky · '+OKABE_LABEL[hashToArchetype(abbr)];}
    if(badgeEl){badgeEl.textContent=locked?('LOCKED — '+arenaInfo.city.toUpperCase()+' COURT · '+OKABE_LABEL[hashToArchetype(abbr)].toUpperCase()):('LIVE UNIVERSE · '+teams.length+' ARENAS · '+(currentIdx+1)+' / '+teams.length+' · DRAG TO ORBIT'); badgeEl.style.background=locked? (team.primary):'#F0E442'; badgeEl.style.color=locked?'#fff':'#111';}
    buildCityMesh(team);
    if(fansEl){var count=team.id? (60+ (team.id%24)*8): 96; fansEl.innerHTML='<i></i> '+count+' court fans · '+OKABE_LABEL[hashToArchetype(abbr)]+' nebula · '+ (locked?'team universe':'full sky'); fansEl.style.color=team.primary;}
    syncPills();
    if(locked) applyTeamFilter(abbr); else clearTeamFilter();
  }

  function wireUI(){
    var next=document.getElementById('city-intro-next'), prev=document.getElementById('city-intro-prev'), lock=document.getElementById('city-intro-lock');
    if(next) next.addEventListener('click', function(){currentIdx=(currentIdx+1)%(teams.length||30); renderCity(); syncPills(); resetCycle();});
    if(prev) prev.addEventListener('click', function(){currentIdx=(currentIdx-1+(teams.length||30))%(teams.length||30); renderCity(); syncPills(); resetCycle();});
    if(lock) lock.addEventListener('click', function(){
      locked=!locked;
      if(locked){
        stopCycle();
        spawnConfetti();
        if(teams[currentIdx]) applyTeamFilter(teams[currentIdx].abbr);
      } else {
        startCycle();
        clearTeamFilter();
      }
      syncPills(); renderCity();
    });
    window.addEventListener('vh:favorite-team', function(e){
      var abbr=e.detail&&e.detail.abbr;
      if(!abbr){locked=false; clearTeamFilter(); startCycle(); syncPills(); return;}
      var idx=teams.findIndex(function(t){return t.abbr===abbr;});
      if(idx>=0){currentIdx=idx; locked=true; stopCycle(); renderCity(); syncPills(); applyTeamFilter(abbr);}
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
