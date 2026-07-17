/* arena-page.js v3 — Nebulae Archipelago Court — production, no OSM
 * Full controls: sky toggles nebulae/points/centroids/labels/lines, city toggles arena/court/fans, search highlight gold ring, share ?team=xxx, random, reduced-motion
 */
(function(){
  'use strict';
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

  var teams=[], currentIdx=0, locked=false;
  var renderer,scene,camera,cityGroup,skyGroup,groundGroup,arenaMeshGroup,fansInst,courtMarkGroup;
  var pointsMesh, centroidsGroup, labelsGroup, nebulaGroup, linesMesh, highlightRing=null;
  var playersData=[], centroids=[], searchIndex=[];
  var prefersReduced=false;
  var skyToggles={nebulae:true, points:true, centroids:true, labels:true, lines:true};
  var cityToggles={arena:true, court:true, fans:true};

  function qs(id){return document.getElementById(id);}

  function init(){
    try{prefersReduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){}
    var canvas=qs('arena-canvas'); if(!canvas) return;
    ensureDeps().then(setupThree).then(function(){
      return Promise.all([loadTeams(), loadVectors()]);
    }).then(function(){
      // ?team= param
      var m=location.search.match(/[?&]team=([A-Z]{3})/); if(m&&ARENAS[m[1]]){var idx=teams.findIndex(function(t){return t.abbr===m[1];}); if(idx>=0) currentIdx=idx;}
      buildSky();
      buildCity();
      buildPills();
      wireUI();
      updateHUD();
      hideLoading();
      buildSkyLegend();
      updateAttr();
      animate();
    }).catch(function(e){console.warn('arena v3 fail',e); hideLoading();});
  }

  function ensureDeps(){
    return new Promise(function(res){
      var haveThree=typeof THREE!=='undefined';
      var haveNeb=typeof window.VHEmbeddingNebula!=='undefined';
      if(haveThree&&haveNeb){res(); return;}
      if(!haveNeb){
        var s=document.createElement('script'); s.src='assets/embedding-nebula.js'; s.onload=function(){checkThree();}; s.onerror=function(){checkThree();}; document.head.appendChild(s);
      } else checkThree();
      function checkThree(){
        if(typeof THREE!=='undefined'){res(); return;}
        var mod=document.createElement('script'); mod.type='module';
        mod.textContent="import * as T from 'three'; window.THREE=T; window.dispatchEvent(new Event('three-ready'));";
        document.head.appendChild(mod);
        var iv=setInterval(function(){if(typeof THREE!=='undefined'){clearInterval(iv); res();}},50);
        setTimeout(function(){clearInterval(iv); res();},3000);
      }
    });
  }

  function setupThree(){
    var canvas=qs('arena-canvas');
    scene=new THREE.Scene(); scene.background=new THREE.Color(0x07090f); scene.fog=new THREE.Fog(0x07090f, 40, 140);
    camera=new THREE.PerspectiveCamera(58, canvas.clientWidth/canvas.clientHeight, 0.1, 500); camera.position.set(26,18,26);
    renderer=new THREE.WebGLRenderer({canvas:canvas, antialias:true, powerPreference:'high-performance'}); renderer.setPixelRatio(Math.min(devicePixelRatio||1,2)); renderer.setSize(canvas.clientWidth, canvas.clientHeight,false); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace;
    cityGroup=new THREE.Group(); scene.add(cityGroup);
    groundGroup=new THREE.Group(); cityGroup.add(groundGroup);
    arenaMeshGroup=new THREE.Group(); cityGroup.add(arenaMeshGroup);
    skyGroup=new THREE.Group(); scene.add(skyGroup);
    nebulaGroup=new THREE.Group(); skyGroup.add(nebulaGroup);
    centroidsGroup=new THREE.Group(); skyGroup.add(centroidsGroup);
    labelsGroup=new THREE.Group(); skyGroup.add(labelsGroup);
    var amb=new THREE.AmbientLight(0xffffff,0.8); scene.add(amb);
    var dir=new THREE.DirectionalLight(0xffffff,1.1); dir.position.set(20,36,14); dir.castShadow=true; dir.shadow.mapSize.set(1024,1024); scene.add(dir);
    var hemi=new THREE.HemisphereLight(0x8aa8ff,0x0a0a0a,0.28); scene.add(hemi);
    window.addEventListener('resize', onResize);
  }
  function onResize(){
    var canvas=qs('arena-canvas'); if(!canvas||!renderer||!camera) return;
    renderer.setSize(canvas.clientWidth, canvas.clientHeight,false); camera.aspect=canvas.clientWidth/canvas.clientHeight; camera.updateProjectionMatrix();
  }

  function loadTeams(){
    return fetch('assets/teams.json',{cache:'no-cache'}).then(function(r){return r.json();}).then(function(j){
      teams=j.teams||[]; if(!teams.length){teams=Object.keys(ARENAS).map(function(ab,i){return {abbr:ab, name:ARENAS[ab].city, primary:'#E03A3E', secondary:'#fff', id:i};});}
      teams.sort(function(a,b){return ARENAS[a.abbr].city.localeCompare(ARENAS[b.abbr].city);});
    });
  }
  function loadVectors(){
    return fetch('assets/vectors.json',{cache:'force-cache'}).then(function(r){return r.json();}).then(function(j){
      playersData=j.players||[];
      searchIndex=playersData.map(function(p){return {id:p.id, name:(p.name+' '+p.season).toLowerCase(), p:p};});
    });
  }

  function mapToSky(x,y,z){
    if(window.VHEmbeddingNebula&&window.VHEmbeddingNebula.mapToSky) return window.VHEmbeddingNebula.mapToSky(x,y,z);
    return {az:(x-0.5)*Math.PI*1.9, el:0.11+y*1.02, r:88+(z||0.5)*42};
  }
  function worldFromSky(m){
    if(window.VHEmbeddingNebula&&window.VHEmbeddingNebula.worldFromSky) return window.VHEmbeddingNebula.worldFromSky(m);
    return {x:m.r*Math.cos(m.el)*Math.sin(m.az), y:m.r*Math.sin(m.el)-2, z:m.r*Math.cos(m.el)*Math.cos(m.az)};
  }

  function buildSky(){
    // clear
    while(nebulaGroup.children.length){var o=nebulaGroup.children[0]; nebulaGroup.remove(o); if(o.material){if(o.material.map) o.material.map.dispose(); o.material.dispose();}}
    while(centroidsGroup.children.length){var o=centroidsGroup.children[0]; centroidsGroup.remove(o); if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose();}
    while(labelsGroup.children.length){var o=labelsGroup.children[0]; labelsGroup.remove(o); if(o.material&&o.material.map) o.material.map.dispose(); if(o.material) o.material.dispose();}
    if(pointsMesh){skyGroup.remove(pointsMesh); pointsMesh.geometry.dispose(); pointsMesh.material.dispose();}
    if(linesMesh){skyGroup.remove(linesMesh); linesMesh.geometry.dispose(); linesMesh.material.dispose();}
    // centroids compute
    var sums=[]; for(var k=0;k<8;k++) sums[k]={x:0,y:0,z:0,cnt:0};
    for(var i=0;i<playersData.length;i++){var p=playersData[i]; var c=p.c; if(c>=0&&c<8){sums[c].x+=p.x; sums[c].y+=p.y; sums[c].z+=p.z; sums[c].cnt++;}}
    centroids=[]; for(var k=0;k<8;k++){centroids[k]={x:sums[k].cnt?sums[k].x/sums[k].cnt:0.5, y:sums[k].cnt?sums[k].y/sums[k].cnt:0.5, z:sums[k].cnt?sums[k].z/sums[k].cnt:0.5, cnt:sums[k].cnt};}
    // nebula sprites
    for(var k=0;k<8;k++){
      var c=centroids[k]; var s=mapToSky(c.x,c.y,c.z); var w=worldFromSky({r:s.r*0.98, az:s.az, el:s.el});
      var canvas;
      if(window.VHEmbeddingNebula&&window.VHEmbeddingNebula.createNebulaCanvas) canvas=window.VHEmbeddingNebula.createNebulaCanvas(OKABE[k], OKABE_RGB[k], 1.0);
      else {canvas=document.createElement('canvas'); canvas.width=256; canvas.height=256; var ctx=canvas.getContext('2d'); var grad=ctx.createRadialGradient(128,128,0,128,128,128); var rgb=OKABE_RGB[k]; grad.addColorStop(0,'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0.34)'); grad.addColorStop(1,'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0)'); ctx.fillStyle=grad; ctx.fillRect(0,0,256,256);}
      var tex=new THREE.CanvasTexture(canvas); var sprMat=new THREE.SpriteMaterial({map:tex, transparent:true, opacity:0.48, fog:false, depthWrite:false, blending:THREE.AdditiveBlending});
      var spr=new THREE.Sprite(sprMat); spr.position.set(w.x,w.y,w.z); spr.scale.set(30+centroids[k].cnt/220,30+centroids[k].cnt/220,1); spr.userData.k=k; nebulaGroup.add(spr);
    }
    // points
    var count=playersData.length;
    var pos=new Float32Array(count*3); var col=new Float32Array(count*3);
    for(var i=0;i<count;i++){var p=playersData[i]; var s=mapToSky(p.x,p.y,p.z); var r=s.r+Math.random()*2.2; var w=worldFromSky({r:r, az:s.az, el:s.el}); pos[i*3]=w.x; pos[i*3+1]=w.y; pos[i*3+2]=w.z; var k=p.c>=0&&p.c<8?p.c:0; var rgb=OKABE_RGB[k]; if(k===7){col[i*3]=0.18; col[i*3+1]=0.18; col[i*3+2]=0.20;} else {col[i*3]=rgb[0]/255*0.9+0.1; col[i*3+1]=rgb[1]/255*0.9+0.1; col[i*3+2]=rgb[2]/255*0.9+0.1;}}
    var geo=new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos,3)); geo.setAttribute('color', new THREE.BufferAttribute(col,3));
    var mat=new THREE.PointsMaterial({size:1.7, vertexColors:true, transparent:true, opacity:0.72, sizeAttenuation:true, depthWrite:false, fog:false});
    pointsMesh=new THREE.Points(geo,mat); skyGroup.add(pointsMesh);

    // centroids + labels + lights
    var centPos=[];
    for(var k=0;k<8;k++){var c=centroids[k]; var s=mapToSky(c.x,c.y,c.z); var w=worldFromSky({r:s.r*1.03, az:s.az, el:s.el}); centPos[k]=new THREE.Vector3(w.x,w.y,w.z);}
    for(var k=0;k<8;k++){
      var vp=centPos[k];
      var sg=new THREE.SphereGeometry(0.72,16,16); var sm=new THREE.MeshBasicMaterial({color:new THREE.Color(OKABE[k]), fog:false}); if(k===7) sm.color=new THREE.Color(0x2a2a2a);
      var mesh=new THREE.Mesh(sg,sm); mesh.position.copy(vp); mesh.userData.k=k; centroidsGroup.add(mesh);
      var hg=new THREE.SphereGeometry(1.18,12,12); var hm=new THREE.MeshBasicMaterial({color:new THREE.Color(OKABE[k]), transparent:true, opacity:0.22, fog:false, depthWrite:false, blending:THREE.AdditiveBlending}); if(k===7) hm.color=new THREE.Color(0x888888);
      var halo=new THREE.Mesh(hg,hm); halo.position.copy(vp); centroidsGroup.add(halo);
      var pl=new THREE.PointLight(new THREE.Color(OKABE[k]),0.85,26); pl.position.copy(vp); centroidsGroup.add(pl);
      // label
      var lc=document.createElement('canvas'); lc.width=288; lc.height=68; var lctx=lc.getContext('2d');
      if(lctx){lctx.fillStyle='#FFFEF7'; lctx.strokeStyle='#1A150F'; lctx.lineWidth=4; var rad=14, x=2,y=2,w=284,h=64; lctx.beginPath(); lctx.moveTo(x+rad,y); lctx.arcTo(x+w,y,x+w,y+h,rad); lctx.arcTo(x+w,y+h,x,y+h,rad); lctx.arcTo(x,y+h,x,y,rad); lctx.arcTo(x,y,x+w,y,rad); lctx.closePath(); lctx.fill(); lctx.stroke(); lctx.fillStyle='#1A150F'; lctx.font='bold 18px ui-monospace, monospace'; lctx.textBaseline='middle'; lctx.fillText(OKABE_LABEL[k]+' · '+centroids[k].cnt, 14,34);}
      var lt=new THREE.CanvasTexture(lc); var lm=new THREE.SpriteMaterial({map:lt, fog:false, depthWrite:false}); var ls=new THREE.Sprite(lm); ls.position.set(vp.x, vp.y+2.6, vp.z); ls.scale.set(7.0,1.66,1); labelsGroup.add(ls);
    }
    // lines 2NN
    var linePos=[]; var used={};
    for(var k=0;k<8;k++){var dists=[]; for(var j=0;j<8;j++){if(j===k) continue; var dx=centroids[k].x-centroids[j].x, dy=centroids[k].y-centroids[j].y, dz=centroids[k].z-centroids[j].z; dists.push({j:j,d:dx*dx+dy*dy+dz*dz});} dists.sort(function(a,b){return a.d-b.d;}); for(var n=0;n<2;n++){var nb=dists[n]; var key=k<nb.j?k+'-'+nb.j:nb.j+'-'+k; if(used[key]) continue; used[key]=true; linePos.push(centPos[k].x,centPos[k].y,centPos[k].z, centPos[nb.j].x,centPos[nb.j].y,centPos[nb.j].z);}}
    var lg=new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos,3)); var lm=new THREE.LineBasicMaterial({color:0x8aa0c8, transparent:true, opacity:0.30, fog:false, depthWrite:false}); linesMesh=new THREE.LineSegments(lg,lm); skyGroup.add(linesMesh);

    // apply toggles
    applySkyToggles();
    var sc=qs('arena-star-count'); if(sc) sc.textContent=count.toLocaleString()+' seasons colored';
    var sb=qs('arena-sky-legend'); if(sb){sb.innerHTML=''; for(var k=0;k<8;k++){var row=document.createElement('div'); row.style.display='flex'; row.style.gap='8px'; row.style.alignItems='center'; row.style.fontFamily='ui-monospace,monospace'; row.style.fontSize='11px'; row.style.color='#e6e8ef'; row.style.margin='4px 0'; var dot=document.createElement('span'); dot.style.width='10px'; dot.style.height='10px'; dot.style.borderRadius='50%'; dot.style.background=OKABE[k]; dot.style.border='1.5px solid #fff'; dot.style.display='inline-block'; var txt=document.createElement('span'); txt.textContent=OKABE_LABEL[k]+' · '+centroids[k].cnt; row.appendChild(dot); row.appendChild(txt); sb.appendChild(row);}}
  }

  function buildCity(){
    while(groundGroup.children.length){var o=groundGroup.children[0]; groundGroup.remove(o); if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose();}
    while(arenaMeshGroup.children.length){var o=arenaMeshGroup.children[0]; arenaMeshGroup.remove(o); if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose();}
    if(fansInst){groundGroup.remove(fansInst); fansInst.geometry.dispose(); fansInst.material.dispose(); fansInst=null;}

    var team=teams[currentIdx]||{primary:'#E03A3E', secondary:'#fff', abbr:'CHI'};
    var primary=team.primary||'#E03A3E', secondary=team.secondary||'#fff';

    // court ground #FFFEF7
    var gGeo=new THREE.PlaneGeometry(180,180); var gMat=new THREE.MeshStandardMaterial({color:0xFFFEF7, roughness:0.92}); var g=new THREE.Mesh(gGeo,gMat); g.rotation.x=-Math.PI/2; g.receiveShadow=true; groundGroup.add(g);
    // ink lines
    var inkMat=new THREE.MeshBasicMaterial({color:0x1A150F});
    function line(w,h,x,z){var gg=new THREE.PlaneGeometry(w,h); var mm=new THREE.Mesh(gg,inkMat); mm.position.set(x,0.02,z); mm.rotation.x=-Math.PI/2; groundGroup.add(mm);}
    var W=48,H=32; line(W,0.18,0,-H/2); line(W,0.18,0,H/2); line(0.18,H,-W/2,0); line(0.18,H,W/2,0); line(0.14,H,0,0);
    var circGeo=new THREE.RingGeometry(4.0,4.22,48); var circMat=new THREE.MeshBasicMaterial({color:0x1A150F, side:THREE.DoubleSide}); var circ=new THREE.Mesh(circGeo,circMat); circ.rotation.x=-Math.PI/2; circ.position.set(0,0.03,0); groundGroup.add(circ);
    var dotGeo=new THREE.CircleGeometry(0.75,18); var dotMat=new THREE.MeshStandardMaterial({color:new THREE.Color(primary)}); var dot=new THREE.Mesh(dotGeo,dotMat); dot.rotation.x=-Math.PI/2; dot.position.set(0,0.04,0); groundGroup.add(dot);

    // chibi arena
    var baseGeo=new THREE.CylinderGeometry(6.4,7.0,2.6,24); var baseMat=new THREE.MeshStandardMaterial({color:new THREE.Color(primary), roughness:0.56, emissive:new THREE.Color(primary), emissiveIntensity:0.14}); var base=new THREE.Mesh(baseGeo,baseMat); base.position.y=1.3; base.castShadow=true; arenaMeshGroup.add(base);
    for(var rr=0;rr<12;rr++){var ang=(rr/12)*Math.PI*2; var ribGeo=new THREE.BoxGeometry(0.3,2.3,0.34); var ribMat=new THREE.MeshStandardMaterial({color:0xFFFEF7}); var rib=new THREE.Mesh(ribGeo,ribMat); rib.position.set(Math.cos(ang)*6.6,1.4,Math.sin(ang)*6.6); rib.lookAt(0,1.4,0); arenaMeshGroup.add(rib);}
    var roofGeo=new THREE.TorusGeometry(5.6,0.58,12,30); var roofMat=new THREE.MeshStandardMaterial({color:new THREE.Color(secondary), roughness:0.48, emissive:new THREE.Color(secondary), emissiveIntensity:0.1}); var roof=new THREE.Mesh(roofGeo,roofMat); roof.position.y=3.0; roof.rotation.x=Math.PI/2; arenaMeshGroup.add(roof);
    var courtGeo=new THREE.BoxGeometry(4.4,0.14,2.4); var courtMat=new THREE.MeshStandardMaterial({color:0xE8D5B5}); var court=new THREE.Mesh(courtGeo,courtMat); court.position.y=2.6; arenaMeshGroup.add(court);

    // fans 72
    var fanCount=72; var sGeo=new THREE.SphereGeometry(0.19,6,6); var sMat=new THREE.MeshStandardMaterial({color:0xffffff}); fansInst=new THREE.InstancedMesh(sGeo,sMat,fanCount); var dummy=new THREE.Object3D();
    for(var i=0;i<fanCount;i++){var a=(i/fanCount)*Math.PI*2 + Math.random()*0.15; var rad=8.8+Math.random()*3.4; var x=Math.cos(a)*rad, z=Math.sin(a)*rad; dummy.position.set(x,0.48+Math.random()*0.3,z); dummy.scale.setScalar(0.8+Math.random()*0.5); dummy.updateMatrix(); fansInst.setMatrixAt(i,dummy.matrix); var col=i%3===0?new THREE.Color(primary): i%3===1?new THREE.Color(secondary): new THREE.Color(0xFFFEF7); fansInst.setColorAt(i,col);}
    fansInst.instanceMatrix.needsUpdate=true; if(fansInst.instanceColor) fansInst.instanceColor.needsUpdate=true; groundGroup.add(fansInst);

    applyCityToggles();
  }

  function buildPills(){
    var pills=qs('arena-pills'); if(!pills) return; pills.innerHTML='';
    teams.forEach(function(t,idx){
      var b=document.createElement('button'); b.className='arena-pill'; b.textContent=t.abbr; b.dataset.idx=idx; b.dataset.abbr=t.abbr;
      b.addEventListener('click', function(){currentIdx=idx; buildCity(); updateHUD(); syncPills(); pushTeamURL();});
      pills.appendChild(b);
    });
    syncPills();
  }
  function syncPills(){
    var pills=qs('arena-pills'); if(!pills) return; Array.prototype.forEach.call(pills.children, function(el){var idx=parseInt(el.dataset.idx,10); el.classList.toggle('is-active', idx===currentIdx);});
  }
  function updateHUD(){
    var team=teams[currentIdx]||{}; var arena=ARENAS[team.abbr]||{city:'Chicago', arena:'United Center'};
    var cityEl=qs('arena-city'); if(cityEl) cityEl.innerHTML=arena.city+' <span>'+team.abbr+'</span>';
    var arenaEl=qs('arena-arena'); if(arenaEl) arenaEl.textContent=arena.arena+' · stylized chibi court • 12,966 seasons • CQS 66.29';
    var badge=qs('arena-badge'); if(badge) badge.textContent='COURT · '+team.abbr+' · '+(currentIdx+1)+' / '+teams.length;
    var bc=qs('arena-building-count'); if(bc) bc.textContent='stylized court • prebaked';
  }
  function pushTeamURL(){var team=teams[currentIdx]; if(!team) return; var url=new URL(location.href); url.searchParams.set('team', team.abbr); history.replaceState(null,'', url.toString());}

  function applySkyToggles(){
    if(nebulaGroup) nebulaGroup.visible=skyToggles.nebulae;
    if(pointsMesh) pointsMesh.visible=skyToggles.points;
    if(centroidsGroup) centroidsGroup.visible=skyToggles.centroids;
    if(labelsGroup) labelsGroup.visible=skyToggles.labels;
    if(linesMesh) linesMesh.visible=skyToggles.lines;
  }
  function applyCityToggles(){
    if(arenaMeshGroup) arenaMeshGroup.visible=cityToggles.arena;
    if(groundGroup){
      // groundGroup includes court markings + fans; arenaMeshGroup separate
      // we keep ground always but hide fans if toggled
      groundGroup.visible=cityToggles.court || cityToggles.fans;
    }
    if(fansInst) fansInst.visible=cityToggles.fans;
  }

  function wireUI(){
    // sky toggles
    var skyBtns=document.querySelectorAll('[data-sky]'); skyBtns.forEach(function(btn){
      btn.addEventListener('click', function(){
        var key=btn.dataset.sky;
        if(key==='faint'){key='points';}
        skyToggles[key]=!skyToggles[key];
        btn.classList.toggle('is-active', skyToggles[key]);
        applySkyToggles();
      });
      // init state
      var k=btn.dataset.sky==='faint'?'points':btn.dataset.sky;
      if(skyToggles[k]!==undefined) btn.classList.toggle('is-active', skyToggles[k]);
    });
    // add nebulae button if not present (fallback to existing lines button area)
    var skyGroupCtrl=document.querySelector('.arena-control-group'); // first
    // ensure nebulae button exists
    var hasNeb=document.querySelector('[data-sky="nebulae"]');
    if(!hasNeb){
      var row=document.querySelector('.arena-btn-row');
      if(row){
        var b=document.createElement('button'); b.className='arena-btn is-active'; b.dataset.sky='nebulae'; b.textContent='Nebulae density';
        b.addEventListener('click', function(){skyToggles.nebulae=!skyToggles.nebulae; b.classList.toggle('is-active', skyToggles.nebulae); applySkyToggles();});
        row.prepend(b);
      }
    }
    // city toggles
    var cityBtns=document.querySelectorAll('[data-city]'); cityBtns.forEach(function(btn){
      var map={buildings:'court', arena:'arena', fans:'fans'};
      var key=map[btn.dataset.city]||btn.dataset.city;
      btn.addEventListener('click', function(){
        cityToggles[key]=!cityToggles[key];
        btn.classList.toggle('is-active', cityToggles[key]);
        applyCityToggles();
      });
      if(cityToggles[key]!==undefined) btn.classList.toggle('is-active', cityToggles[key]);
    });

    var prev=qs('arena-prev'), next=qs('arena-next'), lock=qs('arena-lock'), rnd=qs('arena-random'), share=qs('arena-share');
    if(prev) prev.addEventListener('click', function(){currentIdx=(currentIdx-1+teams.length)%teams.length; buildCity(); updateHUD(); syncPills(); pushTeamURL();});
    if(next) next.addEventListener('click', function(){currentIdx=(currentIdx+1)%teams.length; buildCity(); updateHUD(); syncPills(); pushTeamURL();});
    if(rnd) rnd.addEventListener('click', function(){currentIdx=Math.floor(Math.random()*teams.length); buildCity(); updateHUD(); syncPills(); pushTeamURL();});
    if(lock) lock.addEventListener('click', function(){locked=!locked; lock.textContent=locked?'Unlocked · '+teams[currentIdx].abbr:'Lock to my team'; try{localStorage.setItem('vectorHoops.favoriteTeam', locked?teams[currentIdx].abbr:'');}catch(e){} });
    if(share) share.addEventListener('click', function(){
      var url=location.href;
      if(navigator.share){navigator.share({title:document.title, url:url}).catch(function(){});}
      else if(navigator.clipboard){navigator.clipboard.writeText(url).then(function(){share.textContent='Copied!'; setTimeout(function(){share.textContent='Share this view →';},1500);});}
    });

    // search
    var search=qs('arena-search'); var results=qs('arena-search-results');
    if(search){
      var debounce=null;
      search.addEventListener('input', function(){
        clearTimeout(debounce); debounce=setTimeout(function(){
          var q=search.value.trim().toLowerCase(); if(!q){results.innerHTML=''; return;}
          var hits=searchIndex.filter(function(x){return x.name.indexOf(q)>=0;}).slice(0,10);
          results.innerHTML='';
          if(!hits.length){var d=document.createElement('div'); d.textContent='No seasons'; d.style.fontFamily='ui-monospace,monospace'; d.style.fontSize='11px'; d.style.color='#9aa0b2'; results.appendChild(d); return;}
          hits.forEach(function(h){
            var row=document.createElement('button'); row.className='arena-btn'; row.style.justifyContent='flex-start'; row.style.width='100%';
            row.textContent=h.p.name+' '+h.p.season+' · '+OKABE_LABEL[h.p.c];
            row.addEventListener('click', function(){highlightPlayer(h.p); results.innerHTML='';});
            results.appendChild(row);
          });
        },180);
      });
    }

    window.addEventListener('vh:favorite-team', function(e){var abbr=e.detail&&e.detail.abbr; if(!abbr) return; var idx=teams.findIndex(function(t){return t.abbr===abbr;}); if(idx>=0){currentIdx=idx; buildCity(); updateHUD(); syncPills(); pushTeamURL();}});
  }

  function highlightPlayer(p){
    // find world pos
    var s=mapToSky(p.x,p.y,p.z); var w=worldFromSky({r:s.r+0.5, az:s.az, el:s.el});
    // gold ring
    if(highlightRing){skyGroup.remove(highlightRing); highlightRing.geometry.dispose(); highlightRing.material.dispose();}
    var ringGeo=new THREE.TorusGeometry(1.0,0.12,10,28); var ringMat=new THREE.MeshBasicMaterial({color:0xF0E442, transparent:true, opacity:0.95, fog:false});
    highlightRing=new THREE.Mesh(ringGeo,ringMat); highlightRing.position.set(w.x,w.y,w.z); highlightRing.lookAt(0,0,0); skyGroup.add(highlightRing);
    // tooltip-ish HUD update
    var cityEl=qs('arena-city'); if(cityEl){cityEl.textContent=p.name;}
    var arenaEl=qs('arena-arena'); if(arenaEl){arenaEl.textContent=p.season+' · '+OKABE_LABEL[p.c]+' · archetype '+p.c+' · gp '+p.gp+' mpg '+p.mpg.toFixed(1)+' total_min '+p.total_min+' · x '+p.x.toFixed(2)+' y '+p.y.toFixed(2)+' z '+p.z.toFixed(2);}
    // pulse animation
    var start=performance.now();
    (function pulse(){
      if(!highlightRing) return;
      var elapsed=(performance.now()-start)/1000;
      if(elapsed>6){highlightRing.material.opacity=0.9; return;}
      highlightRing.scale.setScalar(1+Math.sin(elapsed*6)*0.15);
      requestAnimationFrame(pulse);
    })();
  }

  function buildSkyLegend(){
    var l=qs('arena-sky-legend'); if(!l) return; // already built in buildSky
  }

  function updateAttr(){
    var attr=qs('osm-attr'); if(attr){attr.innerHTML='Stylized court · <b>12,966 seasons</b> colored by archetype · Nebulae = density · <a href="/methods">Methods</a> · CQS 66.29 · Solo project'; attr.style.background='rgba(255,254,247,0.9)'; attr.style.color='#1A150F'; attr.style.border='1.5px solid #1A150F';}
  }
  function hideLoading(){var el=qs('arena-loading'); if(el){el.classList.add('is-hidden'); setTimeout(function(){el.style.display='none';},500);}}

  function animate(){
    requestAnimationFrame(animate);
    if(!renderer||!scene||!camera) return;
    var now=performance.now()*0.001;
    var t=now*0.08; var radius=26+Math.sin(now*0.05)*2; var height=18+Math.sin(now*0.07)*1.2; var angle=t+currentIdx*0.12;
    if(prefersReduced) angle=t*0.4;
    camera.position.set(Math.cos(angle)*radius, height, Math.sin(angle)*radius); camera.lookAt(0,1.8,0);
    if(skyGroup&&!prefersReduced){skyGroup.rotation.y = now*0.006; skyGroup.rotation.x = Math.sin(now*0.02)*0.015;}
    if(highlightRing){highlightRing.rotation.z+=0.04;}
    renderer.render(scene,camera);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
