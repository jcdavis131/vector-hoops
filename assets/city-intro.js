/* city-intro.js v2 — Real stadiums + embedding sky
 * Solo personal project, no connection to employer, built with public/free-tier only
 * Free data: OpenStreetMap Overpass API (buildings), vectors.json embedding (12966 seasons)
 * Three.js via importmap, no keys. OSM cache sessionStorage + memory.
 * Stadium = real OSM building footprint extruded (if found) else detailed procedural.
 * Neighborhood = OSM buildings (~700m radius) extruded to real heights.
 * Sky = embedding map as starry night — 12966 faint stars + 8 archetype centroids + constellation lines, clear not busy.
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
  var OKABE_LABEL=['Rim D + O-Glass','O-Glass Low Vol','3 Vol Low Impact','Def Glass + FTs','Shot Vol + 3 Vol','3 Acc + 3 Vol','Playmaking + Steals','Scoring Vol'];

  var teams=[];
  var currentIdx=0;
  var autoCycleTimer=null;
  var locked=false;
  var renderer,scene,camera,cityGroup,skyGroup;
  var fanBodies,fanHeads;
  var fanData=[];
  var clock={t:0};
  var animationId=null;
  var prefersReduced=false;
  var osmMemCache={};
  var embeddingData=null;
  var starFieldReady=false;
  var cityBuildToken=0;

  function getTeamColor(abbr){var t=teams.find(function(x){return x.abbr===abbr;}); return t?t.primary||'#E03A3E':'#E03A3E';}
  function getTeamColors(abbr){var t=teams.find(function(x){return x.abbr===abbr;}); if(!t) return ['#E03A3E','#fff']; return [t.primary||'#E03A3E',t.secondary||'#fff'];}

  function init(){
    var canvas=document.getElementById(CANVAS_ID); if(!canvas) return;
    try{prefersReduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){}
    if(typeof THREE==='undefined'){ loadThree().then(setupThree).catch(function(e){console.warn('three fail',e); fallbackGradient();}); } else { setupThree(); }
    wireUI();
    loadTeamsData().then(function(){
      buildPills();
      try{var fav=localStorage.getItem('vectorHoops.favoriteTeam'); if(fav&&ARENAS[fav]){var idx=teams.findIndex(function(t){return t.abbr===fav;}); if(idx>=0){currentIdx=idx; locked=true;}}}catch(e){}
      ensureStarfield();
      renderCity();
      startCycle();
      buildSkyLegend();
    });
  }

  function loadThree(){
    return new Promise(function(res,rej){
      var m=document.createElement('script'); m.type='module';
      m.textContent="import * as T from 'three'; window.THREE=T; window.__threeReady=true;";
      m.onload=function(){var c=setInterval(function(){if(window.__threeReady){clearInterval(c);res();}},30); setTimeout(function(){clearInterval(c);rej('timeout');},4000);};
      m.onerror=function(){rej('load fail');}; document.head.appendChild(m);
    });
  }
  function fallbackGradient(){var el=document.getElementById('city-intro'); if(el) el.style.background='radial-gradient(120% 120% at 20% 20%, #1E3A8A 0%, #111 55%)';}

  function setupThree(){
    var canvas=document.getElementById(CANVAS_ID); if(!canvas) return;
    scene=new THREE.Scene();
    scene.fog=new THREE.Fog(0x0e0e0e, 28, 88);
    scene.background=new THREE.Color(0x07090f);
    camera=new THREE.PerspectiveCamera(52, canvas.clientWidth/canvas.clientHeight, 0.1, 400);
    camera.position.set(22,16,22);
    renderer=new THREE.WebGLRenderer({canvas:canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace;
    cityGroup=new THREE.Group(); scene.add(cityGroup);
    skyGroup=new THREE.Group(); scene.add(skyGroup);
    var amb=new THREE.AmbientLight(0xffffff,0.72); scene.add(amb);
    var dir=new THREE.DirectionalLight(0xffffff,1.4); dir.position.set(18,32,12); dir.castShadow=true; dir.shadow.mapSize.set(1024,1024); dir.shadow.camera.near=2; dir.shadow.camera.far=90; dir.shadow.camera.left=-40; dir.shadow.camera.right=40; dir.shadow.camera.top=40; dir.shadow.camera.bottom=-30; scene.add(dir);
    var rim=new THREE.DirectionalLight(0x8ab4ff,0.45); rim.position.set(-14,12,-14); scene.add(rim);
    var hemi=new THREE.HemisphereLight(0x8aa8ff, 0x0a0a0a, 0.28); scene.add(hemi);
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
        // fallback from ARENAS — real buildings still work without rosters
        var fallbackColors={ATL:['#E03A3E','#FDB927'],BOS:['#007A33','#BA9653'],BKN:['#000000','#FFFFFF'],CHA:['#1D1160','#00788C'],CHI:['#CE1141','#000000'],CLE:['#860038','#FDBB30'],DAL:['#00538C','#002B5E'],DEN:['#0E2240','#FEC524'],DET:['#C8102E','#006BB6'],GSW:['#1D428A','#FFC72C'],HOU:['#CE1141','#000000'],IND:['#002D62','#FDBB30'],LAC:['#C8102E','#1D42BA'],LAL:['#552583','#FDB927'],MEM:['#5D76A9','#12173F'],MIA:['#98002E','#F9A01B'],MIL:['#00471B','#EEE1C6'],MIN:['#0C2340','#236192'],NOP:['#0C2340','#C8102E'],NYK:['#006BB6','#F58426'],OKC:['#007AC1','#EF3B24'],ORL:['#0077C0','#C4CED4'],PHI:['#006BB6','#ED174C'],PHX:['#1D1160','#E56020'],POR:['#E03A3E','#000000'],SAC:['#5A2D81','#63727A'],SAS:['#C4CED4','#000000'],TOR:['#CE1141','#000000'],UTA:['#002B5C','#F9A01B'],WAS:['#002B5C','#E31837']};
        teams=Object.keys(ARENAS).map(function(abbr,i){var a=ARENAS[abbr]; var cols=fallbackColors[abbr]||['#E03A3E','#FFFFFF']; return {abbr:abbr, name:a.city+' '+a.arena.split(' ')[0], city:a.city, arena:a.arena, primary:cols[0], secondary:cols[1], id:i};});
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

  // --- Embedding sky ---
  async function ensureEmbeddingData(){
    if(embeddingData) return embeddingData;
    try{var r=await fetch('assets/vectors.json',{cache:'force-cache'}); var j=await r.json(); embeddingData=j; return j;}catch(e){console.warn('vectors load fail',e); return null;}
  }
  async function ensureStarfield(){
    if(starFieldReady) return;
    var data=await ensureEmbeddingData(); if(!data) return;
    buildStarfield(data); starFieldReady=true;
  }

  function buildStarfield(data){
    if(!scene||!skyGroup) return;
    // clear old sky
    while(skyGroup.children.length){var o=skyGroup.children[0]; skyGroup.remove(o); if(o.geometry) o.geometry.dispose(); if(o.material){if(Array.isArray(o.material)) o.material.forEach(function(m){m.dispose();}); else o.material.dispose();}}
    var players=data.players; var count=players.length;
    // cluster averages for centroids
    var sums=[]; for(var k=0;k<8;k++) sums[k]={x:0,y:0,z:0,cnt:0};
    for(var i=0;i<count;i++){var p=players[i]; var c=p.c; if(c>=0&&c<8){sums[c].x+=p.x; sums[c].y+=p.y; sums[c].z+=p.z; sums[c].cnt++;}}
    var centroids=[]; for(var k=0;k<8;k++){if(sums[k].cnt){centroids[k]={x:sums[k].x/sums[k].cnt, y:sums[k].y/sums[k].cnt, z:sums[k].z/sums[k].cnt, cnt:sums[k].cnt};} else centroids[k]={x:0.5,y:0.5,z:0.5,cnt:0};}

    // faint stars — all 12966 as Points, white low opacity for Milky Way, not busy
    var pos=new Float32Array(count*3);
    var col=new Float32Array(count*3);
    var siz=new Float32Array(count);
    function mapToSky(x,y,z){
      // x 0-0.915 => azimuth -110..110 deg, y 0-1 => elev 6..72 deg, z 0-0.81 => radius 88..124
      var az=(x-0.5)*Math.PI*1.9; // -171 to 171
      var el=0.11 + y*1.02; // ~6deg to 64deg in rad (0.11 to 1.13)
      var r=88 + z*42 + Math.random()*4;
      return {az:az, el:el, r:r};
    }
    for(var i=0;i<count;i++){
      var p=players[i];
      var s=mapToSky(p.x,p.y,p.z);
      var cx=s.r*Math.cos(s.el)*Math.sin(s.az);
      var cy=s.r*Math.sin(s.el);
      var cz=s.r*Math.cos(s.el)*Math.cos(s.az);
      // shift slightly up so horizon sits low
      pos[i*3]=cx; pos[i*3+1]=cy-2; pos[i*3+2]=cz;
      // color: dim white/blue, not archetype for faint to avoid busy
      col[i*3]=0.86; col[i*3+1]=0.90; col[i*3+2]=0.96;
      siz[i]=0.9 + p.z*0.8 + Math.random()*0.6;
    }
    var geo=new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos,3)); geo.setAttribute('color', new THREE.BufferAttribute(col,3));
    var mat=new THREE.PointsMaterial({size:1.35, vertexColors:true, transparent:true, opacity:0.32, sizeAttenuation:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false});
    var points=new THREE.Points(geo,mat); skyGroup.add(points);

    // bright centroids — distinct, clear
    var centPos=[]; var centCols=[];
    for(var k=0;k<8;k++){
      var c=centroids[k]; var s=mapToSky(c.x,c.y,c.z);
      var cx=s.r*Math.cos(s.el)*Math.sin(s.az)*1.02;
      var cy=s.r*Math.sin(s.el)*1.02;
      var cz=s.r*Math.cos(s.el)*Math.cos(s.az)*1.02;
      centPos.push(new THREE.Vector3(cx,cy-2,cz));
      centCols.push(k);
    }
    // spheres for centroids
    for(var k=0;k<8;k++){
      var vp=centPos[k];
      var sphereGeo=new THREE.SphereGeometry(0.62,16,16);
      var colHex=OKABE[k%OKABE.length]; var sphereMat=new THREE.MeshBasicMaterial({color:new THREE.Color(colHex), transparent:true, opacity:0.92, fog:false});
      var mesh=new THREE.Mesh(sphereGeo,sphereMat); mesh.position.copy(vp); skyGroup.add(mesh);
      // glow halo
      var haloGeo=new THREE.SphereGeometry(1.05,12,12);
      var haloMat=new THREE.MeshBasicMaterial({color:new THREE.Color(colHex), transparent:true, opacity:0.18, fog:false, depthWrite:false, blending:THREE.AdditiveBlending});
      var halo=new THREE.Mesh(haloGeo,haloMat); halo.position.copy(vp); skyGroup.add(halo);
      // point light subtle
      var pl=new THREE.PointLight(new THREE.Color(colHex), 0.7, 22); pl.position.copy(vp); skyGroup.add(pl);
    }
    // constellation lines — MST-ish for readability: connect each centroid to 2 nearest in PCA space
    var linePositions=[]; var used={};
    for(var k=0;k<8;k++){
      var dists=[]; for(var j=0;j<8;j++){if(j===k) continue; var dx=centroids[k].x-centroids[j].x; var dy=centroids[k].y-centroids[j].y; var dz=centroids[k].z-centroids[j].z; var d=dx*dx+dy*dy+dz*dz; dists.push({j:j,d:d});}
      dists.sort(function(a,b){return a.d-b.d;});
      for(var n=0;n<2;n++){var nb=dists[n]; var key=k<nb.j?k+'-'+nb.j:nb.j+'-'+k; if(used[key]) continue; used[key]=true; linePositions.push(centPos[k].x, centPos[k].y, centPos[k].z, centPos[nb.j].x, centPos[nb.j].y, centPos[nb.j].z); }
    }
    if(linePositions.length){
      var lineGeo=new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions,3));
      var lineMat=new THREE.LineBasicMaterial({color:0x8aa0c8, transparent:true, opacity:0.22, fog:false, depthWrite:false});
      var lines=new THREE.LineSegments(lineGeo,lineMat); skyGroup.add(lines);
    }
  }

  function buildSkyLegend(){
    var overlay=document.querySelector('.city-intro__overlay'); if(!overlay) return;
    var existing=document.getElementById('sky-legend'); if(existing) existing.remove();
    var legend=document.createElement('div'); legend.id='sky-legend'; legend.style.cssText='position:absolute; right:14px; top:12px; z-index:3; background:rgba(12,14,20,0.78); border:1.5px solid rgba(255,255,255,0.14); border-radius:12px; padding:10px 12px; backdrop-filter:blur(10px); max-width:220px; pointer-events:auto;';
    var title=document.createElement('div'); title.textContent='Embedding sky — 8 archetypes'; title.style.cssText='font-family:var(--mono); font-size:10px; font-weight:900; letter-spacing:.08em; color:#F0E442; text-transform:uppercase; margin-bottom:8px;';
    legend.appendChild(title);
    for(var k=0;k<8;k++){
      var row=document.createElement('div'); row.style.cssText='display:flex; align-items:center; gap:8px; margin:5px 0; font-family:var(--mono); font-size:10.5px; color:#e6e8ef; line-height:1.2;';
      var dot=document.createElement('span'); dot.style.cssText='width:9px; height:9px; border-radius:50%; background:'+OKABE[k]+'; box-shadow:0 0 0 2px '+OKABE[k]+'33, 0 0 8px '+OKABE[k]+'88; flex:0 0 9px; display:inline-block;';
      var txt=document.createElement('span'); txt.textContent=OKABE_LABEL[k];
      row.appendChild(dot); row.appendChild(txt); legend.appendChild(row);
    }
    var hint=document.createElement('div'); hint.textContent='12966 seasons as faint stars. Bright dots = cluster centroids. Lines = nearest archetype neighbors. Clear, not busy.';
    hint.style.cssText='margin-top:8px; font-family:var(--mono); font-size:9.5px; color:#9aa0b2; line-height:1.3;';
    legend.appendChild(hint);
    overlay.appendChild(legend);
  }

  // --- OSM ---
  function latLonToLocal(lat,lng,centerLat,centerLng){
    var R=6378137; var dLat=(lat-centerLat)*Math.PI/180; var dLon=(lng-centerLng)*Math.PI/180;
    var x=dLon*R*Math.cos(centerLat*Math.PI/180); var z=-dLat*R; // north = -Z? we use - for intuitive
    var scale=22; // meters per unit
    return {x:x/scale, z:z/scale};
  }
  function polygonArea(pts){var a=0; for(var i=0,j=pts.length-1;i<pts.length;j=i++){a+=(pts[j].x+pts[i].x)*(pts[j].z-pts[i].z);} return a*0.5;}
  function getSessionCache(key){try{var v=sessionStorage.getItem(key); if(v) return JSON.parse(v);}catch(e){} return null;}
  function setSessionCache(key,val){try{sessionStorage.setItem(key, JSON.stringify(val.slice(0,220)));}catch(e){}}

  async function fetchOsmBuildings(abbr,lat,lng,radius){
    radius=radius||700;
    var cacheKey='vh-osm-bld-'+abbr+'-'+radius;
    if(osmMemCache[cacheKey]) return osmMemCache[cacheKey];
    var sess=getSessionCache(cacheKey); if(sess){osmMemCache[cacheKey]=sess; return sess;}
    var query='[out:json][timeout:25];(way["building"](around:'+radius+','+lat+','+lng+');relation["building"](around:'+radius+','+lat+','+lng+'););out body geom;';
    var url='https://overpass-api.de/api/interpreter?data='+encodeURIComponent(query);
    try{
      var res=await fetch(url);
      if(!res.ok) throw new Error('overpass '+res.status);
      var data=await res.json();
      var buildings=[];
      for(var i=0;i<data.elements.length;i++){
        var el=data.elements[i]; if(!el.geometry) continue;
        var poly=el.geometry.map(function(p){return {lat:p.lat, lon:p.lon};}); if(poly.length<3) continue;
        var tags=el.tags||{};
        var h=0; if(tags.height){var mh=tags.height.match(/([\d.]+)/); if(mh) h=parseFloat(mh[1]);}
        var lv=tags['building:levels']?parseFloat(tags['building:levels']):0;
        if(!h && lv) h=lv*3.4+1.2;
        buildings.push({id:el.id, polygon:poly, tags:tags, height:h||0, levels:lv||0});
      }
      osmMemCache[cacheKey]=buildings; setSessionCache(cacheKey, buildings); return buildings;
    }catch(e){console.warn('OSM buildings fail', abbr, e.message); return null;}
  }

  // --- City building ---
  async function buildCityMesh(team, arenaInfo, token){
    if(!cityGroup) return;
    // dispose old
    while(cityGroup.children.length>0){var o=cityGroup.children[0]; cityGroup.remove(o); if(o.geometry) o.geometry.dispose(); if(o.material){if(Array.isArray(o.material)) o.material.forEach(function(m){m.dispose();}); else o.material.dispose();}}
    fanData=[];
    var primary=team.primary||'#E03A3E'; var secondary=team.secondary||'#ffffff';
    var groundGeo=new THREE.PlaneGeometry(160,160);
    var groundMat=new THREE.MeshStandardMaterial({color:0x181a1f, roughness:0.93, metalness:0.04});
    var ground=new THREE.Mesh(groundGeo,groundMat); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; cityGroup.add(ground);

    // subtle street grid as fallback (will be under OSM buildings)
    var roadMat=new THREE.MeshStandardMaterial({color:0x22252d, roughness:0.85});
    for(var r=-5;r<=5;r++){
      if(r===0) continue;
      var rh=new THREE.BoxGeometry(160,0.04,1.6); var mh=new THREE.Mesh(rh,roadMat); mh.position.set(0,0.02,r*14); mh.receiveShadow=false; mh.receiveShadow=true; cityGroup.add(mh);
      var rv=new THREE.BoxGeometry(1.6,0.04,160); var mv=new THREE.Mesh(rv,roadMat); mv.position.set(r*14,0.02,0); cityGroup.add(mv);
    }

    var tokenNow=token||0;
    var osmBuildings=null;
    try{osmBuildings=await fetchOsmBuildings(team.abbr, arenaInfo.lat, arenaInfo.lng, 720);}catch(e){osmBuildings=null;}
    if(tokenNow!==cityBuildToken) return; // stale

    var arenaMesh=null;
    var buildingsGroup=new THREE.Group();

    if(osmBuildings && osmBuildings.length){
      // convert to local
      var converted=osmBuildings.map(function(b){
        var local=b.polygon.map(function(p){return latLonToLocal(p.lat,p.lon,arenaInfo.lat,arenaInfo.lng);});
        return {id:b.id, local:local, tags:b.tags, height:b.height, levels:b.levels, polygon:b.polygon};
      }).filter(function(b){return b.local.length>=3;});

      // find arena candidate: closest to origin, large area, stadium-ish
      var arenaCand=null; var best=-1e9;
      for(var i=0;i<converted.length;i++){
        var b=converted[i];
        var cx=0,cz=0; for(var j=0;j<b.local.length;j++){cx+=b.local[j].x; cz+=b.local[j].z;} cx/=b.local.length; cz/=b.local.length;
        var dist=Math.hypot(cx,cz);
        var area=Math.abs(polygonArea(b.local));
        var isStadium=(b.tags.building==='stadium'||b.tags.leisure==='stadium'||b.tags.building==='sports_centre'||(b.tags.name&&/arena|center|garden|forum|stadium/i.test(b.tags.name)));
        var score=(isStadium?8000:0)+area*1.8 - dist*18;
        if(dist<22 && score>best){best=score; arenaCand=b; arenaCand.center={x:cx,z:cz};}
      }

      // render neighborhoods — limit 180 biggest valid that are not arena
      var others=converted.filter(function(b){return b!==arenaCand;}).sort(function(a,b){return Math.abs(polygonArea(b.local))-Math.abs(polygonArea(a.local));}).slice(0,180);
      for(var k=0;k<others.length;k++){
        var b=others[k];
        var area=Math.abs(polygonArea(b.local)); if(area<0.6) continue; if(area>140) continue;
        var h=b.height|| (b.levels?b.levels*3.2+2.2: (3+Math.random()*14));
        var hU=Math.max(0.9, Math.min(13, h*0.24));
        try{
          var shape=new THREE.Shape();
          shape.moveTo(b.local[0].x, b.local[0].z);
          for(var j=1;j<b.local.length;j++) shape.lineTo(b.local[j].x, b.local[j].z);
          shape.closePath();
          var geo=new THREE.ExtrudeGeometry(shape,{depth:hU, bevelEnabled:false});
          geo.rotateX(-Math.PI/2);
          var mat=new THREE.MeshStandardMaterial({color:0xf1f0eb, roughness:0.86, metalness:0.03});
          // slight variation
          var dist0=Math.hypot(b.local[0].x,b.local[0].z);
          if(dist0<28 && Math.random()<0.28){mat.color=new THREE.Color(0xffffff).lerp(new THREE.Color(primary),0.10+Math.random()*0.10);}
          var mesh=new THREE.Mesh(geo,mat); mesh.position.y=0; mesh.castShadow=true; mesh.receiveShadow=true;
          buildingsGroup.add(mesh);
        }catch(e){}
      }

      if(arenaCand){
        try{
          var shape=new THREE.Shape();
          shape.moveTo(arenaCand.local[0].x, arenaCand.local[0].z);
          for(var j=1;j<arenaCand.local.length;j++) shape.lineTo(arenaCand.local[j].x, arenaCand.local[j].z);
          shape.closePath();
          var hU=8.4;
          var geo=new THREE.ExtrudeGeometry(shape,{depth:hU, bevelEnabled:true, bevelThickness:0.22, bevelSize:0.22, bevelSegments:2});
          geo.rotateX(-Math.PI/2);
          var mat=new THREE.MeshStandardMaterial({color:new THREE.Color(primary), roughness:0.52, metalness:0.18, emissive:new THREE.Color(primary), emissiveIntensity:0.13});
          arenaMesh=new THREE.Mesh(geo,mat); arenaMesh.position.y=0.02; arenaMesh.castShadow=true; arenaMesh.receiveShadow=true;
          buildingsGroup.add(arenaMesh);
          // roof cap secondary
          var roofShape=new THREE.Shape(); roofShape.moveTo(arenaCand.local[0].x, arenaCand.local[0].z); for(var j=1;j<arenaCand.local.length;j++) roofShape.lineTo(arenaCand.local[j].x, arenaCand.local[j].z); roofShape.closePath();
          var roofGeo=new THREE.ExtrudeGeometry(roofShape,{depth:0.55, bevelEnabled:false}); roofGeo.rotateX(-Math.PI/2);
          var roofMat=new THREE.MeshStandardMaterial({color:new THREE.Color(secondary), roughness:0.48, metalness:0.18, emissive:new THREE.Color(secondary), emissiveIntensity:0.08});
          var roof=new THREE.Mesh(roofGeo,roofMat); roof.position.y=hU+0.18; buildingsGroup.add(roof);
          // light rigs
          for(var l=0;l<4;l++){var ang=(l/4)*Math.PI*2; var lx=Math.cos(ang)* (Math.abs(polygonArea(arenaCand.local))*0.06+6); var lz=Math.sin(ang)* (Math.abs(polygonArea(arenaCand.local))*0.06+6); var light=new THREE.PointLight(new THREE.Color(secondary), 0.6, 28); light.position.set(arenaCand.center.x+lx*0.18, hU+3.2, arenaCand.center.z+lz*0.18); buildingsGroup.add(light);}
        }catch(e){arenaCand=null; arenaMesh=null;}
      }
    }

    if(!arenaMesh){
      // fallback detailed stadium
      var arenaGroup=new THREE.Group();
      var baseGeo=new THREE.CylinderGeometry(6.2,6.8,2.4,36); var baseMat=new THREE.MeshStandardMaterial({color:new THREE.Color(primary), roughness:0.58, metalness:0.14}); var base=new THREE.Mesh(baseGeo,baseMat); base.position.y=1.2; base.castShadow=true; base.receiveShadow=true; arenaGroup.add(base);
      // ribs
      for(var rr=0;rr<16;rr++){var ang=(rr/16)*Math.PI*2; var ribGeo=new THREE.BoxGeometry(0.28,2.6,0.32); var ribMat=new THREE.MeshStandardMaterial({color:0xe8e6e0}); var rib=new THREE.Mesh(ribGeo,ribMat); rib.position.set(Math.cos(ang)*6.5,1.4,Math.sin(ang)*6.5); rib.lookAt(0,1.4,0); arenaGroup.add(rib);}
      var roofGeo2=new THREE.TorusGeometry(5.4,0.56,14,40); var roofMat2=new THREE.MeshStandardMaterial({color:new THREE.Color(secondary), roughness:0.5, emissive:new THREE.Color(primary), emissiveIntensity:0.18}); var roof2=new THREE.Mesh(roofGeo2,roofMat2); roof2.position.y=2.9; roof2.rotation.x=Math.PI/2; arenaGroup.add(roof2);
      var courtGeo=new THREE.BoxGeometry(4.2,0.12,2.2); var courtMat=new THREE.MeshStandardMaterial({color:0xE8D5B5, roughness:0.82}); var court=new THREE.Mesh(courtGeo,courtMat); court.position.y=2.46; arenaGroup.add(court);
      var logoGeo=new THREE.CircleGeometry(0.85,18); var logoMat=new THREE.MeshStandardMaterial({color:new THREE.Color(primary), emissive:new THREE.Color(primary), emissiveIntensity:0.35}); var logo=new THREE.Mesh(logoGeo,logoMat); logo.rotation.x=-Math.PI/2; logo.position.y=2.53; arenaGroup.add(logo);
      buildingsGroup.add(arenaGroup);
    }

    cityGroup.add(buildingsGroup);
    createFans(primary, secondary);
  }

  function createFans(primary, secondary){
    if(fanBodies){cityGroup.remove(fanBodies); fanBodies.geometry.dispose(); fanBodies.material.dispose(); fanBodies=null;}
    if(fanHeads){cityGroup.remove(fanHeads); fanHeads.geometry.dispose(); fanHeads.material.dispose(); fanHeads=null;}
    var TEAM_COLORS=[new THREE.Color(primary), new THREE.Color(secondary), new THREE.Color(0xffffff), new THREE.Color(0x111111)];
    var totalArena=140, totalCity=220, total=totalArena+totalCity;
    var bodyGeo=new THREE.BoxGeometry(0.34,0.5,0.24); var bodyMat=new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.8});
    fanBodies=new THREE.InstancedMesh(bodyGeo,bodyMat,total); fanBodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fanBodies.castShadow=true;
    var headGeo=new THREE.SphereGeometry(0.15,8,8); var headMat=new THREE.MeshStandardMaterial({color:0xE8C4A8, roughness:0.7});
    fanHeads=new THREE.InstancedMesh(headGeo,headMat,total); fanHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fanHeads.castShadow=true;
    var dummy=new THREE.Object3D(), dummyH=new THREE.Object3D(); var idx=0;
    for(var i=0;i<totalArena;i++){var angle=(i/totalArena)*Math.PI*2 + Math.random()*0.12; var rad=7.8+Math.random()*2.8+(i%2?0.6:0); var x=Math.cos(angle)*rad, z=Math.sin(angle)*rad, baseY=0.35; dummy.position.set(x,baseY,z); dummy.rotation.y=-angle+Math.PI; dummy.scale.set(1,0.9+Math.random()*0.3,1); dummy.updateMatrix(); fanBodies.setMatrixAt(idx,dummy.matrix); dummyH.position.set(x,baseY+0.48,z); dummyH.updateMatrix(); fanHeads.setMatrixAt(idx,dummyH.matrix); var c=TEAM_COLORS[Math.floor(Math.random()*2.2)]; fanBodies.setColorAt(idx,c); fanData[idx]={x:x,z:z,baseY:baseY,phase:Math.random()*Math.PI*2,speed:2.4+Math.random()*1.8,isArena:true,cheer:1.0+Math.random()*0.6}; idx++;}
    for(var j=0;j<totalCity;j++){var cx=(Math.random()-0.5)*110, cz=(Math.random()-0.5)*110; if(Math.sqrt(cx*cx+cz*cz)<12){j--; continue;} var snapX=Math.round(cx/14)*14+(Math.random()-0.5)*2.2, snapZ=Math.round(cz/14)*14+(Math.random()-0.5)*2.2; var fx=Math.random()<0.58?snapX:cx, fz=Math.random()<0.58?snapZ:cz, fy=0.26; dummy.position.set(fx,fy,fz); dummy.rotation.y=Math.random()*Math.PI*2; dummy.scale.set(0.86+Math.random()*0.28,0.86+Math.random()*0.28,0.86+Math.random()*0.28); dummy.updateMatrix(); fanBodies.setMatrixAt(idx,dummy.matrix); dummyH.position.set(fx,fy+0.42,fz); dummyH.updateMatrix(); fanHeads.setMatrixAt(idx,dummyH.matrix); var c2=TEAM_COLORS[Math.floor(Math.random()*TEAM_COLORS.length)]; fanBodies.setColorAt(idx,c2); fanData[idx]={x:fx,z:fz,baseY:fy,phase:Math.random()*Math.PI*2,speed:1.2+Math.random()*1.2,isArena:false,cheer:0.35+Math.random()*0.5}; idx++;}
    if(fanBodies.instanceColor) fanBodies.instanceColor.needsUpdate=true;
    cityGroup.add(fanBodies); cityGroup.add(fanHeads);
  }

  function animate(){
    animationId=requestAnimationFrame(animate);
    if(!renderer||!scene||!camera) return;
    var now=performance.now()*0.001; clock.t=now;
    var t=now*0.12; var radius=locked?18+Math.sin(now*0.08)*2:22+Math.sin(now*0.06)*4; var height=locked?9+Math.sin(now*0.13)*1.2:13+Math.sin(now*0.07)*2.5; var angle=t+currentIdx*0.6; if(prefersReduced) angle=t*0.25;
    camera.position.set(Math.cos(angle)*radius, height, Math.sin(angle)*radius); camera.lookAt(0,2.2,0);
    if(skyGroup && !prefersReduced){skyGroup.rotation.y = now*0.012; skyGroup.rotation.x = Math.sin(now*0.04)*0.03;}
    if(fanBodies&&fanHeads&&!prefersReduced){
      var dummy=new THREE.Object3D(), dummyH=new THREE.Object3D();
      for(var i=0;i<fanData.length;i++){var fd=fanData[i]; var bounce=Math.max(0,Math.sin(now*fd.speed+fd.phase)); var yAdd=bounce*0.42*fd.cheer; dummy.position.set(fd.x, fd.baseY+yAdd, fd.z); var s=1+bounce*0.1, sy=1+bounce*0.16; dummy.scale.set(s,sy,s); dummy.rotation.y=-Math.atan2(fd.z,fd.x)+(fd.isArena?Math.PI:0); if(!fd.isArena) dummy.rotation.y=fd.phase; dummy.updateMatrix(); fanBodies.setMatrixAt(i,dummy.matrix); dummyH.position.set(fd.x, fd.baseY+0.42+yAdd+bounce*0.08, fd.z); dummyH.updateMatrix(); fanHeads.setMatrixAt(i,dummyH.matrix);}
      fanBodies.instanceMatrix.needsUpdate=true; fanHeads.instanceMatrix.needsUpdate=true;
    }
    renderer.render(scene,camera);
  }

  function startCycle(){stopCycle(); if(locked) return; autoCycleTimer=setInterval(function(){if(locked) return; currentIdx=(currentIdx+1)%teams.length; renderCity(); syncPills();}, 7400);}
  function stopCycle(){if(autoCycleTimer){clearInterval(autoCycleTimer); autoCycleTimer=null;}}
  function resetCycle(){stopCycle(); if(!locked) startCycle();}

  async function renderCity(){
    if(!teams[currentIdx]||!scene) return;
    var team=teams[currentIdx]; var abbr=team.abbr; var arenaInfo=ARENAS[abbr]||{city:team.name.split(' ').slice(-1)[0], arena:'Arena', lat:0,lng:0};
    var cityEl=document.getElementById(CITY_EL), arenaEl=document.getElementById(ARENA_EL), fansEl=document.getElementById(FANS_EL), badgeEl=document.getElementById(BADGE_EL);
    if(cityEl){cityEl.innerHTML=arenaInfo.city+' <span style="color:'+team.primary+'">'+abbr+'</span>'; cityEl.style.setProperty('--team-accent', team.primary);}
    if(arenaEl){arenaEl.innerHTML=arenaInfo.arena+' · '+abbr+' <span style="opacity:.8">real OSM footprint + '+teams.length+' arenas</span>'; }
    if(badgeEl){badgeEl.textContent=locked?'LOCKED — '+arenaInfo.city.toUpperCase()+' REAL BUILDINGS':'LIVE CITY TOUR · REAL BUILDINGS · '+(currentIdx+1)+' / 30'; badgeEl.style.background=team.secondary||'#F0E442';}
    cityBuildToken++; var myToken=cityBuildToken;
    await buildCityMesh(team, arenaInfo, myToken);
    if(myToken!==cityBuildToken) return;
    if(fansEl){var count=240+Math.floor(Math.random()*1200); fansEl.innerHTML='<i></i> '+count.toLocaleString()+' fans cheering for '+team.name+' · '+OKABE_LABEL[team.id?team.id%8:0]+' sky';}
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
