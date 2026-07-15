/* city-intro.js v3 — Nebulae Archipelago Court — prebaked, no OSM fetch
 * Solo personal project, no connection to employer, built with public/free-tier only
 * Free data: vectors.json 12966 seasons, teams.json
 * Arch: chibi court ground #FFFEF7 ink lines + team color arena cylinder, embedding sky as 8 Okabe-Ito density nebulae + 12966 colored points + centroids + 2NN lines
 * Perf: starfield once, fans 60 max low-poly, no overpass, no sessionStorage OSM cache
 * AAA: paper #FFFEF7 ink #1A150F 17.9:1, 18px/1.65 mono labels, 44px touch, safe-area, reduced-motion
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
    ATL:{city:'Atlanta',arena:'State Farm Arena',lat:33.7573,lng:-84.3932},
    BOS:{city:'Boston',arena:'TD Garden',lat:42.3662,lng:-71.0621},
    BKN:{city:'Brooklyn',arena:'Barclays Center',lat:40.6826,lng:-73.9753},
    CHA:{city:'Charlotte',arena:'Spectrum Center',lat:35.2251,lng:-80.8392},
    CHI:{city:'Chicago',arena:'United Center',lat:41.8807,lng:-87.6742},
    CLE:{city:'Cleveland',arena:'Rocket Arena',lat:41.4965,lng:-81.6882},
    DAL:{city:'Dallas',arena:'American Airlines Center',lat:32.7903,lng:-96.8103},
    DEN:{city:'Denver',arena:'Ball Arena',lat:39.7487,lng:-105.0077},
    DET:{city:'Detroit',arena:'Little Caesars Arena',lat:42.3411,lng:-83.0553},
    GSW:{city:'Golden State',arena:'Chase Center',lat:37.7680,lng:-122.3874},
    HOU:{city:'Houston',arena:'Toyota Center',lat:29.7508,lng:-95.3621},
    IND:{city:'Indianapolis',arena:'Gainbridge Fieldhouse',lat:39.7639,lng:-86.1555},
    LAC:{city:'LA Clippers',arena:'Intuit Dome',lat:33.9452,lng:-118.3420},
    LAL:{city:'LA Lakers',arena:'Crypto.com Arena',lat:34.0430,lng:-118.2673},
    MEM:{city:'Memphis',arena:'FedExForum',lat:35.1386,lng:-90.0506},
    MIA:{city:'Miami',arena:'Kaseya Center',lat:25.7814,lng:-80.1870},
    MIL:{city:'Milwaukee',arena:'Fiserv Forum',lat:43.0451,lng:-87.9172},
    MIN:{city:'Minneapolis',arena:'Target Center',lat:44.9795,lng:-93.2777},
    NOP:{city:'New Orleans',arena:'Smoothie King Center',lat:29.9490,lng:-90.0821},
    NYK:{city:'New York',arena:'Madison Square Garden',lat:40.7505,lng:-73.9936},
    OKC:{city:'Oklahoma City',arena:'Paycom Center',lat:35.4634,lng:-97.5151},
    ORL:{city:'Orlando',arena:'Kia Center',lat:28.5392,lng:-81.3839},
    PHI:{city:'Philadelphia',arena:'Wells Fargo Center',lat:39.9017,lng:-75.1720},
    PHX:{city:'Phoenix',arena:'PHX Arena',lat:33.4457,lng:-112.0712},
    POR:{city:'Portland',arena:'Moda Center',lat:45.5316,lng:-122.6668},
    SAC:{city:'Sacramento',arena:'Golden 1 Center',lat:38.5802,lng:-121.4997},
    SAS:{city:'San Antonio',arena:'Frost Bank Center',lat:29.4269,lng:-98.4375},
    TOR:{city:'Toronto',arena:'Scotiabank Arena',lat:43.6435,lng:-79.3791},
    UTA:{city:'Salt Lake City',arena:'Delta Center',lat:40.7683,lng:-111.9011},
    WAS:{city:'Washington',arena:'Capital One Arena',lat:38.8981,lng:-77.0209},
  };

  var OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  var OKABE_RGB=[[0,114,178],[213,94,0],[0,158,115],[240,228,66],[86,180,233],[204,121,167],[230,159,0],[0,0,0]];
  var OKABE_LABEL=['Off Glass + Rim Prot','Off Glass Low Vol','3 Vol Low Impact','Def Glass + FTs','Shot Vol + 3 Vol','3 Acc + 3 Vol','Playmaking + Steals','Scoring Vol'];

  var teams=[];
  var currentIdx=0;
  var autoCycleTimer=null;
  var locked=false;
  var renderer,scene,camera,cityGroup,skyGroup,groundGroup;
  var clock={t:0};
  var animationId=null;
  var prefersReduced=false;
  var embeddingData=null;
  var starFieldReady=false;
  var nebulaSprites=[];
  var fanMarkers=null;

  function getTeamColor(ab){var t=teams.find(function(x){return x.abbr===ab;}); return t?t.primary||'#E03A3E':'#E03A3E';}

  function init(){
    var canvas=document.getElementById(CANVAS_ID); if(!canvas) return;
    try{prefersReduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){}
    // ensure three + nebula helper
    ensureDeps().then(setupThree).then(function(){
      wireUI();
      return loadTeamsData();
    }).then(function(){
      buildPills();
      try{var fav=localStorage.getItem('vectorHoops.favoriteTeam'); if(fav&&ARENAS[fav]){var idx=teams.findIndex(function(t){return t.abbr===fav;}); if(idx>=0){currentIdx=idx; locked=true;}}}catch(e){}
      ensureStarfield();
      renderCity();
      startCycle();
      buildSkyLegend();
      updateAttr();
    }).catch(function(e){console.warn('city-intro v3 init fail',e); fallbackGradient();});
  }

  function ensureDeps(){
    // load embedding-nebula.js if not present, plus ensure THREE global exists
    return new Promise(function(res){
      var haveThree=typeof THREE!=='undefined';
      var haveNeb=typeof window.VHEmbeddingNebula!=='undefined';
      if(haveThree&&haveNeb){res(); return;}
      // load nebula helper as <script>
      if(!haveNeb){
        var s=document.createElement('script'); s.src='assets/embedding-nebula.js'; s.defer=false; s.onload=function(){checkThree();}; s.onerror=function(){checkThree();}; document.head.appendChild(s);
      } else {checkThree();}
      function checkThree(){
        if(typeof THREE!=='undefined'){res(); return;}
        // try importmap-provided three via dynamic module
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
    animate();
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
  function selectCity(idx,lockIt){currentIdx=idx; if(lockIt) locked=true; renderCity(); resetCycle(); syncPills();}

  // --- Court ground + chibi arena ---
  function buildCityMesh(team){
    while(groundGroup.children.length>0){var o=groundGroup.children[0]; groundGroup.remove(o); if(o.geometry) o.geometry.dispose(); if(o.material){if(Array.isArray(o.material)) o.material.forEach(function(m){m.dispose();}); else o.material.dispose();}}

    // large court plane #FFFEF7 with ink lines #1A150F
    var groundGeo=new THREE.PlaneGeometry(160,160);
    var groundMat=new THREE.MeshStandardMaterial({color:0xFFFEF7, roughness:0.92, metalness:0.02});
    var ground=new THREE.Mesh(groundGeo,groundMat); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; groundGroup.add(ground);

    // ink court markings — simple NBA half-court stylized, centered
    var inkMat=new THREE.MeshBasicMaterial({color:0x1A150F});
    function line(w,h,x,z,rot){
      var g=new THREE.PlaneGeometry(w,h); var m=new THREE.Mesh(g,inkMat); m.position.set(x,0.02,z); m.rotation.x=-Math.PI/2; if(rot) m.rotation.z=rot; groundGroup.add(m); return m;
    }
    // outer bounds 38x20 stylized
    var W=44,H=28;
    line(W,0.18,0,-H/2); line(W,0.18,0,H/2); line(0.18,H, -W/2,0); line(0.18,H, W/2,0);
    line(0.14,H*0.96,0,0); // half
    // center circle radius 4
    var circGeo=new THREE.RingGeometry(3.8,4.0,48); var circMat=new THREE.MeshBasicMaterial({color:0x1A150F, side:THREE.DoubleSide}); var circ=new THREE.Mesh(circGeo,circMat); circ.rotation.x=-Math.PI/2; circ.position.set(0,0.03,0); groundGroup.add(circ);
    // center dot team color
    var dotGeo=new THREE.CircleGeometry(0.7,22); var dotMat=new THREE.MeshStandardMaterial({color:new THREE.Color(team.primary), roughness:0.6}); var dot=new THREE.Mesh(dotGeo,dotMat); dot.rotation.x=-Math.PI/2; dot.position.set(0,0.04,0); groundGroup.add(dot);

    // chibi arena — 4 parts: base cylinder primary emissive 0.13 + roof secondary + court mini + 4 bleacher wedges
    var primary=team.primary||'#E03A3E'; var secondary=team.secondary||'#fff';

    var arenaGroup=new THREE.Group(); groundGroup.add(arenaGroup);

    var baseGeo=new THREE.CylinderGeometry(6.2,6.8,2.4,24); var baseMat=new THREE.MeshStandardMaterial({color:new THREE.Color(primary), roughness:0.58, metalness:0.12, emissive:new THREE.Color(primary), emissiveIntensity:0.13});
    var base=new THREE.Mesh(baseGeo,baseMat); base.position.y=1.2; base.castShadow=true; base.receiveShadow=true; arenaGroup.add(base);

    // vertical ribs 12
    for(var rr=0;rr<12;rr++){var ang=(rr/12)*Math.PI*2; var ribGeo=new THREE.BoxGeometry(0.28,2.2,0.32); var ribMat=new THREE.MeshStandardMaterial({color:0xFFFEF7}); var rib=new THREE.Mesh(ribGeo,ribMat); rib.position.set(Math.cos(ang)*6.48,1.3,Math.sin(ang)*6.48); rib.lookAt(0,1.3,0); rib.castShadow=true; arenaGroup.add(rib);}

    var roofGeo=new THREE.TorusGeometry(5.4,0.56,12,28); var roofMat=new THREE.MeshStandardMaterial({color:new THREE.Color(secondary), roughness:0.5, emissive:new THREE.Color(secondary), emissiveIntensity:0.09});
    var roof=new THREE.Mesh(roofGeo,roofMat); roof.position.y=2.9; roof.rotation.x=Math.PI/2; roof.castShadow=true; arenaGroup.add(roof);

    var courtGeo=new THREE.BoxGeometry(4.2,0.12,2.2); var courtMat=new THREE.MeshStandardMaterial({color:0xE8D5B5, roughness:0.82}); var court=new THREE.Mesh(courtGeo,courtMat); court.position.y=2.46; arenaGroup.add(court);

    var logoGeo=new THREE.CircleGeometry(0.85,18); var logoMat=new THREE.MeshStandardMaterial({color:new THREE.Color(primary), emissive:new THREE.Color(primary), emissiveIntensity:0.35}); var logo=new THREE.Mesh(logoGeo,logoMat); logo.rotation.x=-Math.PI/2; logo.position.y=2.53; arenaGroup.add(logo);

    // bleachers 4 wedges low-poly
    var bleacherMat=new THREE.MeshStandardMaterial({color:0x111111, roughness:0.8});
    for(var b=0;b<4;b++){var ang=(b/4)*Math.PI*2+Math.PI/4; var bg=new THREE.BoxGeometry(2.2,0.7,1.1); var bm=new THREE.Mesh(bg,bleacherMat); bm.position.set(Math.cos(ang)*9.2,0.35,Math.sin(ang)*9.2); bm.rotation.y=-ang; bm.castShadow=true; arenaGroup.add(bm);}

    // tiny fans dots 60 max prebaked positions
    if(fanMarkers){groundGroup.remove(fanMarkers); fanMarkers.geometry.dispose(); fanMarkers.material.dispose();}
    var fanCount=60; var fanGeo=new THREE.SphereGeometry(0.18,6,6); var fanMat=new THREE.MeshStandardMaterial({color:0xffffff});
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
  }

  // --- Embedding sky v3 ---
  async function ensureEmbeddingData(){
    if(embeddingData) return embeddingData;
    try{var r=await fetch('assets/vectors.json',{cache:'force-cache'}); var j=await r.json(); embeddingData=j; return j;}catch(e){console.warn('vectors load fail',e); return null;}
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
    while(skyGroup.children.length){var o=skyGroup.children[0]; skyGroup.remove(o); if(o.geometry) o.geometry.dispose(); if(o.material){if(Array.isArray(o.material)) o.material.forEach(function(m){m.dispose();}); else o.material.dispose();}}
    nebulaSprites=[];

    // compute centroids
    var sums=[]; for(var k=0;k<8;k++) sums[k]={x:0,y:0,z:0,cnt:0};
    for(var i=0;i<players.length;i++){var p=players[i]; var c=p.c; if(c>=0&&c<8){sums[c].x+=p.x; sums[c].y+=p.y; sums[c].z+=p.z; sums[c].cnt++;}}
    var centroids=[]; for(var k=0;k<8;k++){if(sums[k].cnt){centroids[k]={x:sums[k].x/sums[k].cnt, y:sums[k].y/sums[k].cnt, z:sums[k].z/sums[k].cnt, cnt:sums[k].cnt};} else centroids[k]={x:0.5,y:0.5,z:0.5,cnt:0};}
    // nebula sprites — colored clouds
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
      skyGroup.add(spr); nebulaSprites.push(spr);
    }

    // points — 12966 colored by archetype, sizeAttenuation, opacity 0.68
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
      // keep readable not pure black for c=7
      if(k===7){ col[i*3]=0.18; col[i*3+1]=0.18; col[i*3+2]=0.20; } else { col[i*3]=rgb[0]/255*0.88+0.12; col[i*3+1]=rgb[1]/255*0.88+0.12; col[i*3+2]=rgb[2]/255*0.88+0.12; }
    }
    var geo=new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos,3)); geo.setAttribute('color', new THREE.BufferAttribute(col,3));
    var mat=new THREE.PointsMaterial({size:1.6, vertexColors:true, transparent:true, opacity:0.68, sizeAttenuation:true, depthWrite:false, fog:false, blending:THREE.NormalBlending});
    var points=new THREE.Points(geo,mat); skyGroup.add(points);

    // centroids spheres + halos + lights
    var centPos=[];
    for(var k=0;k<8;k++){
      var c=centroids[k]; var s=mapToSkyLocal(c.x,c.y,c.z); var w=worldFromSkyLocal({r:s.r*1.02, az:s.az, el:s.el}); centPos.push(new THREE.Vector3(w.x,w.y,w.z));
    }
    for(var k=0;k<8;k++){
      var vp=centPos[k];
      var sphereGeo=new THREE.SphereGeometry(0.72,16,16);
      var sphereMat=new THREE.MeshBasicMaterial({color:new THREE.Color(OKABE[k]), transparent:false, fog:false});
      if(k===7){sphereMat.color=new THREE.Color(0x222222);} // keep black visible vs dark sky? use outline via halo
      var mesh=new THREE.Mesh(sphereGeo,sphereMat); mesh.position.copy(vp); skyGroup.add(mesh);
      var haloGeo=new THREE.SphereGeometry(1.18,14,14);
      var haloMat=new THREE.MeshBasicMaterial({color:new THREE.Color(OKABE[k]), transparent:true, opacity:0.20, fog:false, depthWrite:false, blending:THREE.AdditiveBlending});
      if(k===7) haloMat.color=new THREE.Color(0x999999);
      var halo=new THREE.Mesh(haloGeo,haloMat); halo.position.copy(vp); skyGroup.add(halo);
      var pl=new THREE.PointLight(new THREE.Color(OKABE[k]), 0.8, 24); pl.position.copy(vp); skyGroup.add(pl);

      // label sprite paper bg ink text AAA
      var labelCanvas=document.createElement('canvas'); labelCanvas.width=256; labelCanvas.height=64;
      var lctx=labelCanvas.getContext('2d');
      if(lctx){
        lctx.fillStyle='#FFFEF7'; lctx.strokeStyle='#1A150F'; lctx.lineWidth=4;
        // rounded rect
        var rad=14; var x=2,y=2,w=252,h=60;
        lctx.beginPath(); lctx.moveTo(x+rad,y); lctx.arcTo(x+w,y,x+w,y+h,rad); lctx.arcTo(x+w,y+h,x,y+h,rad); lctx.arcTo(x,y+h,x,y,rad); lctx.arcTo(x,y,x+w,y,rad); lctx.closePath(); lctx.fill(); lctx.stroke();
        lctx.fillStyle='#1A150F'; lctx.font='bold 18px ui-monospace, SFMono-Regular, Menlo, monospace'; lctx.textBaseline='middle';
        lctx.fillText(OKABE_LABEL[k], 14, 32);
      }
      var ltex=new THREE.CanvasTexture(labelCanvas); ltex.colorSpace=THREE.SRGBColorSpace;
      var lsMat=new THREE.SpriteMaterial({map:ltex, transparent:false, fog:false, depthWrite:false});
      var ls=new THREE.Sprite(lsMat); ls.position.set(vp.x, vp.y+2.2, vp.z); ls.scale.set(6.2,1.55,1); skyGroup.add(ls);
    }
    // constellation lines 2NN
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
  }

  function buildSkyLegend(){
    var overlay=document.querySelector('.city-intro__overlay'); if(!overlay) return;
    var existing=document.getElementById('sky-legend'); if(existing) existing.remove();
    var legend=document.createElement('div'); legend.id='sky-legend'; legend.setAttribute('role','note'); legend.setAttribute('aria-label','Embedding sky legend');
    legend.style.cssText='position:absolute; right:14px; top:12px; z-index:3; background:rgba(255,254,247,0.94); border:2px solid #1A150F; border-radius:12px; padding:10px 12px; backdrop-filter:blur(10px); max-width:236px; pointer-events:auto; box-shadow:4px 4px 0 #1A150F;';
    var title=document.createElement('div'); title.textContent='Embedding sky — 8 archetypes'; title.style.cssText='font-family:ui-monospace,monospace; font-size:11px; font-weight:900; letter-spacing:.08em; color:#1A150F; text-transform:uppercase; margin-bottom:8px;';
    legend.appendChild(title);
    for(var k=0;k<8;k++){
      var row=document.createElement('div'); row.style.cssText='display:flex; align-items:center; gap:8px; margin:5px 0; font-family:ui-monospace,monospace; font-size:11px; color:#1A150F; line-height:1.3;';
      var dot=document.createElement('span'); dot.setAttribute('aria-hidden','true'); dot.style.cssText='width:10px; height:10px; border-radius:50%; background:'+OKABE[k]+'; border:2px solid #1A150F; box-shadow:0 0 0 2px '+OKABE[k]+'22; flex:0 0 10px; display:inline-block;';
      if(k===7) dot.style.background='#222';
      var txt=document.createElement('span'); txt.textContent=OKABE_LABEL[k];
      row.appendChild(dot); row.appendChild(txt); legend.appendChild(row);
    }
    var hint=document.createElement('div'); hint.textContent='Colored clouds = archetype density · Dots = 12,966 seasons colored by archetype · Bright = centroid';
    hint.style.cssText='margin-top:8px; font-family:ui-monospace,monospace; font-size:10px; color:#4a4a4a; line-height:1.35;';
    legend.appendChild(hint);
    overlay.appendChild(legend);
  }

  function updateAttr(){
    var attr=document.getElementById('osm-attr'); if(attr){attr.innerHTML='Stylized court · <b>12,966 seasons</b> colored by archetype · <a href="/methods" style="color:#1A150F; text-decoration:underline;">Methods</a> · CQS 66.29 · leakfree 0.977 · Solo project'; attr.style.background='rgba(255,254,247,0.88)'; attr.style.color='#1A150F'; attr.style.border='1.5px solid #1A150F'; attr.style.fontSize='10px';}
  }

  function animate(){
    animationId=requestAnimationFrame(animate);
    if(!renderer||!scene||!camera) return;
    var now=performance.now()*0.001;
    var t=now*0.12; var radius=locked?18+Math.sin(now*0.08)*1.2:22+Math.sin(now*0.06)*2; var height=locked?9+Math.sin(now*0.13)*0.8:13+Math.sin(now*0.07)*1.4; var angle=t+currentIdx*0.6; if(prefersReduced) angle=t*0.20;
    camera.position.set(Math.cos(angle)*radius, height, Math.sin(angle)*radius); camera.lookAt(0,1.6,0);
    if(skyGroup && !prefersReduced){skyGroup.rotation.y = now*0.008; skyGroup.rotation.x = Math.sin(now*0.03)*0.02;}
    renderer.render(scene,camera);
  }

  function startCycle(){stopCycle(); if(locked) return; autoCycleTimer=setInterval(function(){if(locked) return; currentIdx=(currentIdx+1)%teams.length; renderCity(); syncPills();}, 7600);}
  function stopCycle(){if(autoCycleTimer){clearInterval(autoCycleTimer); autoCycleTimer=null;}}
  function resetCycle(){stopCycle(); if(!locked) startCycle();}

  function renderCity(){
    if(!teams[currentIdx]||!scene) return;
    var team=teams[currentIdx]; var abbr=team.abbr; var arenaInfo=ARENAS[abbr]||{city:team.name.split(' ').slice(-1)[0], arena:'Arena'};
    var cityEl=document.getElementById(CITY_EL), arenaEl=document.getElementById(ARENA_EL), fansEl=document.getElementById(FANS_EL), badgeEl=document.getElementById(BADGE_EL);
    if(cityEl){cityEl.innerHTML=arenaInfo.city+' <span style="color:'+team.primary+'">'+abbr+'</span>'; cityEl.style.setProperty('--team-accent', team.primary);}
    if(arenaEl){arenaEl.textContent=arenaInfo.arena+' · '+abbr+' · stylized chibi court • 12,966 seasons sky';}
    if(badgeEl){badgeEl.textContent=locked?('LOCKED — '+arenaInfo.city.toUpperCase()+' COURT'):('LIVE COURT TOUR · '+teams.length+' ARENAS · '+(currentIdx+1)+' / '+teams.length); badgeEl.style.background=team.secondary||'#F0E442';}
    buildCityMesh(team);
    if(fansEl){var count=team.id? (60+ (team.id%24)*8): 96; fansEl.innerHTML='<i></i> '+count+' court fans · '+OKABE_LABEL[currentIdx%8]+' nebula'; fansEl.style.color=team.primary;}
    syncPills();
  }

  function wireUI(){
    var next=document.getElementById('city-intro-next'), prev=document.getElementById('city-intro-prev'), lock=document.getElementById('city-intro-lock');
    if(next) next.addEventListener('click', function(){currentIdx=(currentIdx+1)%(teams.length||30); renderCity(); syncPills(); resetCycle();});
    if(prev) prev.addEventListener('click', function(){currentIdx=(currentIdx-1+(teams.length||30))%(teams.length||30); renderCity(); syncPills(); resetCycle();});
    if(lock) lock.addEventListener('click', function(){locked=!locked; if(locked) stopCycle(); else startCycle(); syncPills(); renderCity();});
    window.addEventListener('vh:favorite-team', function(e){var abbr=e.detail&&e.detail.abbr; if(!abbr){locked=false; startCycle(); syncPills(); return;} var idx=teams.findIndex(function(t){return t.abbr===abbr;}); if(idx>=0){currentIdx=idx; locked=true; stopCycle(); renderCity(); syncPills();}});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
