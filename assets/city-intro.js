/* city-intro.js — NBA Cities flyover intro: Arnis (OSM city) + scroll-world (scrub flight) mashup
 * Free-tier, Home-only, solo — no Higgsfield credits, no Rust binary.
 * Renders procedural cityscape per team from teams.json + arena mapping, with fans cheering.
 * Three.js via importmap, InstancedMesh for fans (cheer bounce), orbital camera circling arena.
 * Cycles cities unless favorite team locked.
 */
(function(){
  'use strict';
  var CANVAS_ID = 'city-intro-canvas';
  var CITY_EL = 'city-intro-city';
  var ARENA_EL = 'city-intro-arena';
  var FANS_EL = 'city-intro-fans';
  var PILLS_EL = 'city-intro-pills';
  var BADGE_EL = 'city-intro-badge';

  // NBA Cities + Arena mapping — real arena names, approximated downtown
  var ARENAS = {
    ATL: {city:'Atlanta', arena:'State Farm Arena', lat:33.7573, lng:-84.3932},
    BOS: {city:'Boston', arena:'TD Garden', lat:42.3662, lng:-71.0621},
    BKN: {city:'Brooklyn', arena:'Barclays Center', lat:40.6826, lng:-73.9753},
    CHA: {city:'Charlotte', arena:'Spectrum Center', lat:35.2251, lng:-80.8392},
    CHI: {city:'Chicago', arena:'United Center', lat:41.8807, lng:-87.6742},
    CLE: {city:'Cleveland', arena:'Rocket Arena', lat:41.4965, lng:-81.6882},
    DAL: {city:'Dallas', arena:'American Airlines Center', lat:32.7903, lng:-96.8103},
    DEN: {city:'Denver', arena:'Ball Arena', lat:39.7487, lng:-105.0077},
    DET: {city:'Detroit', arena:'Little Caesars Arena', lat:42.3411, lng:-83.0553},
    GSW: {city:'Golden State', arena:'Chase Center', lat:37.7680, lng:-122.3874},
    HOU: {city:'Houston', arena:'Toyota Center', lat:29.7508, lng:-95.3621},
    IND: {city:'Indianapolis', arena:'Gainbridge Fieldhouse', lat:39.7639, lng:-86.1555},
    LAC: {city:'LA Clippers', arena:'Intuit Dome', lat:33.9452, lng:-118.3420},
    LAL: {city:'LA Lakers', arena:'Crypto.com Arena', lat:34.0430, lng:-118.2673},
    MEM: {city:'Memphis', arena:'FedExForum', lat:35.1386, lng:-90.0506},
    MIA: {city:'Miami', arena:'Kaseya Center', lat:25.7814, lng:-80.1870},
    MIL: {city:'Milwaukee', arena:'Fiserv Forum', lat:43.0451, lng:-87.9172},
    MIN: {city:'Minneapolis', arena:'Target Center', lat:44.9795, lng:-93.2777},
    NOP: {city:'New Orleans', arena:'Smoothie King Center', lat:29.9490, lng:-90.0821},
    NYK: {city:'New York', arena:'Madison Square Garden', lat:40.7505, lng:-73.9936},
    OKC: {city:'Oklahoma City', arena:'Paycom Center', lat:35.4634, lng:-97.5151},
    ORL: {city:'Orlando', arena:'Kia Center', lat:28.5392, lng:-81.3839},
    PHI: {city:'Philadelphia', arena:'Wells Fargo Center', lat:39.9017, lng:-75.1720},
    PHX: {city:'Phoenix', arena:'PHX Arena', lat:33.4457, lng:-112.0712},
    POR: {city:'Portland', arena:'Moda Center', lat:45.5316, lng:-122.6668},
    SAC: {city:'Sacramento', arena:'Golden 1 Center', lat:38.5802, lng:-121.4997},
    SAS: {city:'San Antonio', arena:'Frost Bank Center', lat:29.4269, lng:-75.3127},
    TOR: {city:'Toronto', arena:'Scotiabank Arena', lat:43.6435, lng:-79.3791},
    UTA: {city:'Salt Lake City', arena:'Delta Center', lat:40.7683, lng:-111.9011},
    WAS: {city:'Washington', arena:'Capital One Arena', lat:38.8981, lng:-77.0209},
  };

  var teams = [];
  var currentIdx = 0;
  var autoCycleTimer = null;
  var locked = false;
  var renderer, scene, camera, cityGroup;
  var fanBodies, fanHeads; // InstancedMesh
  var fanData = []; // {base: Vector3, phase, speed, isArena, colorIndex}
  var clock = {t:0};
  var animationId = null;
  var prefersReduced = false;

  function getTeamColor(abbr){
    var t = teams.find(function(x){return x.abbr===abbr;});
    if(!t) return '#E03A3E';
    return t.primary || '#E03A3E';
  }
  function getTeamColors(abbr){
    var t = teams.find(function(x){return x.abbr===abbr;});
    if(!t) return ['#E03A3E','#fff'];
    return [t.primary||'#E03A3E', t.secondary||'#fff'];
  }

  function init(){
    var canvas = document.getElementById(CANVAS_ID);
    if(!canvas) return;
    try{
      prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }catch(e){}

    // load three via importmap dynamic
    if(typeof THREE === 'undefined'){
      loadThree().then(setupThree).catch(function(e){
        console.warn('city-intro three failed', e);
        fallbackGradient();
      });
    } else {
      setupThree();
    }
    wireUI();
    loadTeamsData().then(function(){
      buildPills();
      // start with random city or favorite
      try{
        var fav = localStorage.getItem('vectorHoops.favoriteTeam');
        if(fav && ARENAS[fav]){
          var idx = teams.findIndex(function(t){return t.abbr===fav;});
          if(idx>=0) currentIdx = idx;
          locked = true;
        }
      }catch(e){}
      renderCity();
      startCycle();
    });
  }

  function loadThree(){
    return new Promise(function(res,rej){
      // three via static importmap in index.html
      var m = document.createElement('script');
      m.type='module';
      m.textContent = "import * as T from 'three'; window.THREE=T; window.__threeReady=true;";
      m.onload = function(){
        var check = setInterval(function(){
          if(window.__threeReady){ clearInterval(check); res(); }
        }, 30);
        setTimeout(function(){ clearInterval(check); rej('timeout'); }, 4000);
      };
      m.onerror = function(){ rej('module load fail'); };
      document.head.appendChild(m);
    });
  }

  function fallbackGradient(){
    var el = document.getElementById('city-intro');
    if(el) el.style.background = 'radial-gradient(120% 120% at 20% 20%, #1E3A8A 0%, #111 55%)';
  }

  function setupThree(){
    var canvas = document.getElementById(CANVAS_ID);
    if(!canvas) return;
    // scene
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0e0e0e, 28, 88);
    scene.background = new THREE.Color(0x0e0e0e);

    camera = new THREE.PerspectiveCamera(52, canvas.clientWidth / canvas.clientHeight, 0.1, 200);
    camera.position.set(22, 16, 22);

    renderer = new THREE.WebGLRenderer({canvas:canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    cityGroup = new THREE.Group();
    scene.add(cityGroup);

    // lights
    var amb = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(amb);
    var dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(18, 32, 12);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024,1024);
    dir.shadow.camera.near = 2;
    dir.shadow.camera.far = 90;
    dir.shadow.camera.left = -40;
    dir.shadow.camera.right = 40;
    dir.shadow.camera.top = 40;
    dir.shadow.camera.bottom = -30;
    scene.add(dir);
    var rim = new THREE.DirectionalLight(0x8ab4ff, 0.5);
    rim.position.set(-14, 12, -14);
    scene.add(rim);

    window.addEventListener('resize', onResize);
    animate();
  }

  function onResize(){
    var canvas = document.getElementById(CANVAS_ID);
    if(!canvas || !renderer || !camera) return;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w,h,false);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
  }

  function loadTeamsData(){
    return fetch('assets/teams.json', {cache:'no-cache'}).then(function(r){return r.json();}).then(function(j){
      teams = j.teams || [];
      // order by city name for tour? keep conference-ish but shuffle slightly for visual
      teams.sort(function(a,b){
        var ca = ARENAS[a.abbr] ? ARENAS[a.abbr].city : a.name;
        var cb = ARENAS[b.abbr] ? ARENAS[b.abbr].city : b.name;
        return ca.localeCompare(cb);
      });
    }).catch(function(){ teams=[]; });
  }

  function buildPills(){
    var root = document.getElementById(PILLS_EL);
    if(!root) return;
    root.innerHTML='';
    teams.forEach(function(t, idx){
      var btn = document.createElement('button');
      btn.className='city-pill';
      btn.dataset.abbr = t.abbr;
      btn.dataset.idx = String(idx);
      btn.style.setProperty('--team-primary', t.primary);
      btn.textContent = t.abbr;
      btn.title = (ARENAS[t.abbr]? ARENAS[t.abbr].city+' — '+ARENAS[t.abbr].arena : t.name);
      btn.addEventListener('click', function(){
        selectCity(idx, true);
      });
      root.appendChild(btn);
    });
    syncPills();
  }

  function syncPills(){
    var root = document.getElementById(PILLS_EL);
    if(!root) return;
    var fav = null;
    try{ fav = localStorage.getItem('vectorHoops.favoriteTeam'); }catch(e){}
    Array.prototype.forEach.call(root.children, function(el){
      var abbr = el.dataset.abbr;
      el.classList.toggle('is-active', teams[currentIdx] && teams[currentIdx].abbr===abbr);
      el.classList.toggle('is-favorite', fav && fav===abbr);
    });
    var lockBtn = document.getElementById('city-intro-lock');
    if(lockBtn){
      lockBtn.classList.toggle('is-locked', locked);
      lockBtn.textContent = locked ? 'Locked • '+(teams[currentIdx]?teams[currentIdx].abbr:'')+' — unlock' : 'Lock to my team';
    }
  }

  function selectCity(idx, lockIt){
    currentIdx = idx;
    if(lockIt) locked = true;
    renderCity();
    resetCycle();
    syncPills();
  }

  function renderCity(){
    if(!teams[currentIdx] || !scene) return;
    var team = teams[currentIdx];
    var abbr = team.abbr;
    var arenaInfo = ARENAS[abbr] || {city:team.name.split(' ').slice(-1)[0], arena:'Arena', lat:0,lng:0};
    // update UI
    var cityEl = document.getElementById(CITY_EL);
    var arenaEl = document.getElementById(ARENA_EL);
    var fansEl = document.getElementById(FANS_EL);
    var badgeEl = document.getElementById(BADGE_EL);
    if(cityEl){
      cityEl.innerHTML = arenaInfo.city+' <span style="color:'+team.primary+'">'+abbr+'</span>';
      cityEl.style.setProperty('--team-accent', team.primary);
    }
    if(arenaEl){
      arenaEl.innerHTML = arenaInfo.arena+' · '+abbr+' <span style="opacity:.8">#'+team.id+'</span>';
    }
    if(badgeEl){
      badgeEl.textContent = locked ? 'LOCKED — '+arenaInfo.city.toUpperCase()+' FLYOVER' : 'LIVE CITY TOUR · '+(currentIdx+1)+' / 30';
      badgeEl.style.background = team.secondary || '#F0E442';
    }

    // build 3D
    buildCityMesh(team, arenaInfo);

    if(fansEl){
      var count = 240 + Math.floor(Math.random()*1200);
      fansEl.innerHTML = '<i></i> '+count.toLocaleString()+' fans cheering for '+team.name;
    }
  }

  function buildCityMesh(team, arenaInfo){
    if(!cityGroup) return;
    // dispose old
    while(cityGroup.children.length>0){
      var o = cityGroup.children[0];
      cityGroup.remove(o);
      if(o.geometry) o.geometry.dispose();
      if(o.material){
        if(Array.isArray(o.material)) o.material.forEach(function(m){m.dispose();});
        else o.material.dispose();
      }
    }
    fanData = [];

    var primary = team.primary || '#E03A3E';
    var secondary = team.secondary || '#ffffff';

    // ground
    var groundGeo = new THREE.PlaneGeometry(120,120);
    var groundMat = new THREE.MeshStandardMaterial({color:0x1a1a1a, roughness:0.92, metalness:0.05});
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI/2;
    ground.receiveShadow = true;
    cityGroup.add(ground);

    // roads grid
    var roadMat = new THREE.MeshStandardMaterial({color:0x242424, roughness:0.8});
    for(var r=-2;r<=2;r++){
      var roadH = new THREE.BoxGeometry(120,0.06,2.2);
      var mh = new THREE.Mesh(roadH, roadMat);
      mh.position.set(0,0.02, r*12);
      mh.receiveShadow=true;
      cityGroup.add(mh);
      var roadV = new THREE.BoxGeometry(2.2,0.06,120);
      var mv = new THREE.Mesh(roadV, roadMat);
      mv.position.set(r*12,0.02,0);
      mv.receiveShadow=true;
      cityGroup.add(mv);
    }

    // arena — central stadium
    var arenaGroup = new THREE.Group();
    arenaGroup.position.set(0,0,0);
    var baseGeo = new THREE.CylinderGeometry(6.2,6.8,2.2,32);
    var baseMat = new THREE.MeshStandardMaterial({color:new THREE.Color(primary), roughness:0.6, metalness:0.12});
    var base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 1.1;
    base.castShadow=true; base.receiveShadow=true;
    arenaGroup.add(base);
    var roofGeo = new THREE.TorusGeometry(5.4,0.55,12,36);
    var roofMat = new THREE.MeshStandardMaterial({color:new THREE.Color(secondary), roughness:0.5, emissive:new THREE.Color(primary), emissiveIntensity:0.18});
    var roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 2.7;
    roof.rotation.x = Math.PI/2;
    arenaGroup.add(roof);
    // court
    var courtGeo = new THREE.BoxGeometry(4.2,0.12,2.2);
    var courtMat = new THREE.MeshStandardMaterial({color:0xE8D5B5, roughness:0.8});
    var court = new THREE.Mesh(courtGeo, courtMat);
    court.position.y = 2.26;
    arenaGroup.add(court);
    // logo
    var logoGeo = new THREE.CircleGeometry(0.8,16);
    var logoMat = new THREE.MeshStandardMaterial({color:new THREE.Color(primary), emissive:new THREE.Color(primary), emissiveIntensity:0.35});
    var logo = new THREE.Mesh(logoGeo, logoMat);
    logo.rotation.x = -Math.PI/2;
    logo.position.y = 2.33;
    arenaGroup.add(logo);

    cityGroup.add(arenaGroup);

    // buildings — procedural Arnis-like extrusion
    var buildingMat = new THREE.MeshStandardMaterial({color:0xf5f5f0, roughness:0.85});
    var buildingMat2 = new THREE.MeshStandardMaterial({color:0xe9e9e6, roughness:0.85});
    var windowMat = new THREE.MeshStandardMaterial({color:0x111111, emissive:0xffe0a0, emissiveIntensity:0.12, roughness:0.7});
    var countB = 0;
    for(var x=-4;x<=4;x++){
      for(var z=-4;z<=4;z++){
        if(Math.abs(x)<=1 && Math.abs(z)<=1) continue; // arena exclusion
        if(Math.random()<0.18) continue;
        var h = 2.5 + Math.random()*9.5 + (Math.random()<0.15?6:0);
        var w = 2.2 + Math.random()*2.2;
        var d = 2.2 + Math.random()*2.2;
        var bx = x*12 + (Math.random()-0.5)*3;
        var bz = z*12 + (Math.random()-0.5)*3;
        var geo = new THREE.BoxGeometry(w,h,d);
        var mat = Math.random()<0.5? buildingMat: buildingMat2;
        var mesh = new THREE.Mesh(geo, mat.clone());
        mesh.position.set(bx, h/2, bz);
        mesh.castShadow=true; mesh.receiveShadow=true;
        // tint windows with team color occasionally
        if(Math.random()<0.26){
          mesh.material = new THREE.MeshStandardMaterial({color:new THREE.Color(primary).lerp(new THREE.Color(0xffffff), 0.72+Math.random()*0.2), roughness:0.8});
        }
        cityGroup.add(mesh);
        countB++;

        // add small window strips (instanced hack — just place tiny boxes)
        if(h>6 && Math.random()<0.6){
          var winCount = Math.floor(h/1.2);
          for(var wi=0; wi<winCount; wi++){
            var wg = new THREE.BoxGeometry(0.7,0.22,0.05);
            var wm = new THREE.Mesh(wg, windowMat);
            wm.position.set(bx + w/2+0.06, 0.6+wi*1.15, bz);
            cityGroup.add(wm);
          }
        }
      }
    }

    // fans — InstancedMesh
    createFans(primary, secondary);
  }

  function createFans(primary, secondary){
    // remove old instanced
    if(fanBodies){
      cityGroup.remove(fanBodies);
      fanBodies.geometry.dispose(); fanBodies.material.dispose(); fanBodies=null;
    }
    if(fanHeads){
      cityGroup.remove(fanHeads);
      fanHeads.geometry.dispose(); fanHeads.material.dispose(); fanHeads=null;
    }

    var TEAM_COLORS = [new THREE.Color(primary), new THREE.Color(secondary), new THREE.Color(0xffffff), new THREE.Color(0x111111)];

    var totalArena = 140;
    var totalCity = 220;
    var total = totalArena + totalCity;

    var bodyGeo = new THREE.BoxGeometry(0.34,0.5,0.24);
    var bodyMat = new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.8});
    fanBodies = new THREE.InstancedMesh(bodyGeo, bodyMat, total);
    fanBodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fanBodies.castShadow=true;

    var headGeo = new THREE.SphereGeometry(0.15,8,8);
    var headMat = new THREE.MeshStandardMaterial({color:0xE8C4A8, roughness:0.7});
    fanHeads = new THREE.InstancedMesh(headGeo, headMat, total);
    fanHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fanHeads.castShadow=true;

    var colorArr = [];
    var dummy = new THREE.Object3D();
    var dummyH = new THREE.Object3D();
    var idx=0;

    // arena ring fans — cheering hard
    for(var i=0;i<totalArena;i++){
      var angle = (i/totalArena)*Math.PI*2 + Math.random()*0.12;
      var rad = 7.5 + Math.random()*2.8 + (i%2?0.6:0);
      var x = Math.cos(angle)*rad;
      var z = Math.sin(angle)*rad;
      var baseY = 0.35;
      dummy.position.set(x, baseY, z);
      dummy.rotation.y = -angle + Math.PI;
      dummy.scale.set(1, 0.9+Math.random()*0.3,1);
      dummy.updateMatrix();
      fanBodies.setMatrixAt(idx, dummy.matrix);

      dummyH.position.set(x, baseY+0.48, z);
      dummyH.updateMatrix();
      fanHeads.setMatrixAt(idx, dummyH.matrix);

      var c = TEAM_COLORS[Math.floor(Math.random()*2.2)]; // bias to team colors near arena
      fanBodies.setColorAt(idx, c);
      fanData[idx] = {x:x, z:z, baseY:baseY, phase:Math.random()*Math.PI*2, speed:2.4+Math.random()*1.8, isArena:true, cheer:1.0+Math.random()*0.6};

      idx++;
    }
    // city spread fans — streets
    for(var j=0;j<totalCity;j++){
      var cx = (Math.random()-0.5)*92;
      var cz = (Math.random()-0.5)*92;
      // avoid arena core
      if(Math.sqrt(cx*cx+cz*cz) < 11) { j--; continue; }
      // snap near roads somewhat
      var snapX = Math.round(cx/12)*12 + (Math.random()-0.5)*2.2;
      var snapZ = Math.round(cz/12)*12 + (Math.random()-0.5)*2.2;
      // 50% use snapped
      var fx = Math.random()<0.55 ? snapX : cx;
      var fz = Math.random()<0.55 ? snapZ : cz;
      var fy = 0.26;
      dummy.position.set(fx,fy,fz);
      dummy.rotation.y = Math.random()*Math.PI*2;
      dummy.scale.set(0.86+Math.random()*0.28, 0.86+Math.random()*0.28, 0.86+Math.random()*0.28);
      dummy.updateMatrix();
      fanBodies.setMatrixAt(idx, dummy.matrix);
      dummyH.position.set(fx,fy+0.42,fz);
      dummyH.updateMatrix();
      fanHeads.setMatrixAt(idx, dummyH.matrix);
      var c2 = TEAM_COLORS[Math.floor(Math.random()*TEAM_COLORS.length)];
      fanBodies.setColorAt(idx, c2);
      fanData[idx] = {x:fx, z:fz, baseY:fy, phase:Math.random()*Math.PI*2, speed:1.2+Math.random()*1.2, isArena:false, cheer:0.35+Math.random()*0.5};
      idx++;
    }

    if(fanBodies.instanceColor) fanBodies.instanceColor.needsUpdate = true;
    cityGroup.add(fanBodies);
    cityGroup.add(fanHeads);
  }

  function animate(){
    animationId = requestAnimationFrame(animate);
    if(!renderer || !scene || !camera) return;
    var now = performance.now()*0.001;
    clock.t = now;

    // orbit camera around arena — flyover circling
    var t = now*0.12;
    var radius = locked ? 18 + Math.sin(now*0.08)*2 : 22 + Math.sin(now*0.06)*4;
    var height = locked ? 9 + Math.sin(now*0.13)*1.2 : 13 + Math.sin(now*0.07)*2.5;
    var angle = t + currentIdx*0.6; // slight offset per city
    if(prefersReduced) angle = t*0.25;
    var cx = Math.cos(angle)*radius;
    var cz = Math.sin(angle)*radius;
    camera.position.set(cx, height, cz);
    camera.lookAt(0,2.2,0);

    // fans cheer bounce
    if(fanBodies && fanHeads && !prefersReduced){
      var dummy = new THREE.Object3D();
      var dummyH = new THREE.Object3D();
      for(var i=0;i<fanData.length;i++){
        var fd = fanData[i];
        var bounce = Math.max(0, Math.sin(now*fd.speed + fd.phase));
        var yAdd = bounce * 0.42 * fd.cheer;
        // body
        fanBodies.getMatrixAt(i, dummy.matrix);
        // decompose not cheap — we store base and reconstruct
        dummy.position.set(fd.x, fd.baseY + yAdd, fd.z);
        // slight scale squash on cheer
        var s = 1 + bounce*0.1;
        var sy = 1 + bounce*0.16;
        dummy.scale.set(s, sy, s);
        dummy.rotation.y = -Math.atan2(fd.z, fd.x) + (fd.isArena? Math.PI : 0);
        if(!fd.isArena) dummy.rotation.y = fd.phase;
        dummy.updateMatrix();
        fanBodies.setMatrixAt(i, dummy.matrix);

        dummyH.position.set(fd.x, fd.baseY + 0.42 + yAdd + bounce*0.08, fd.z);
        dummyH.updateMatrix();
        fanHeads.setMatrixAt(i, dummyH.matrix);
      }
      fanBodies.instanceMatrix.needsUpdate = true;
      fanHeads.instanceMatrix.needsUpdate = true;
    }

    renderer.render(scene,camera);
  }

  function startCycle(){
    stopCycle();
    if(locked) return;
    autoCycleTimer = setInterval(function(){
      if(locked) return;
      currentIdx = (currentIdx+1) % teams.length;
      renderCity();
      syncPills();
    }, 6200);
  }
  function stopCycle(){ if(autoCycleTimer){ clearInterval(autoCycleTimer); autoCycleTimer=null; } }
  function resetCycle(){ stopCycle(); if(!locked) startCycle(); }

  function wireUI(){
    var next = document.getElementById('city-intro-next');
    var prev = document.getElementById('city-intro-prev');
    var lock = document.getElementById('city-intro-lock');
    if(next) next.addEventListener('click', function(){
      currentIdx = (currentIdx+1) % (teams.length||30);
      renderCity(); syncPills(); resetCycle();
    });
    if(prev) prev.addEventListener('click', function(){
      currentIdx = (currentIdx-1 + (teams.length||30)) % (teams.length||30);
      renderCity(); syncPills(); resetCycle();
    });
    if(lock) lock.addEventListener('click', function(){
      locked = !locked;
      if(locked){
        stopCycle();
      } else {
        startCycle();
      }
      syncPills();
      renderCity();
    });
    window.addEventListener('vh:favorite-team', function(e){
      var abbr = e.detail && e.detail.abbr;
      if(!abbr){
        locked=false; startCycle(); syncPills(); return;
      }
      var idx = teams.findIndex(function(t){return t.abbr===abbr;});
      if(idx>=0){
        currentIdx = idx; locked=true; stopCycle(); renderCity(); syncPills();
      }
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
