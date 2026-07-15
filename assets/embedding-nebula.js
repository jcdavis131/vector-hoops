/* embedding-nebula.js — colored density clouds + archetype-colored sky
 * Solo personal project, no connection to employer, built with public/free-tier only
 * No external fetch besides vectors.json (prebaked). Free-tier only.
 * Provides: computeCentroids, mapToSky, createNebulaCanvas, buildSkyData
 */
(function(){
  'use strict';
  var OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#000000'];
  var OKABE_RGB=[
    [0,114,178],[213,94,0],[0,158,115],[240,228,66],[86,180,233],[204,121,167],[230,159,0],[0,0,0]
  ];
  var LABELS=[
    'Off Glass + Rim Prot','Off Glass Low Vol','3 Vol Low Impact','Def Glass + FTs',
    'Shot Vol + 3 Vol','3 Acc + 3 Vol','Playmaking + Steals','Scoring Vol'
  ];

  function mapToSky(x,y,z){
    // x~0-1 => azimuth, y~0-1 => elevation 6-72deg, z~0-1 => radius 88-124 + jitter
    var az=(x-0.5)*Math.PI*1.9;
    var el=0.11 + y*1.02;
    var r=88 + (z||0.5)*42;
    return {az:az, el:el, r:r};
  }
  function worldFromSky(m){
    var cx=m.r*Math.cos(m.el)*Math.sin(m.az);
    var cy=m.r*Math.sin(m.el);
    var cz=m.r*Math.cos(m.el)*Math.cos(m.az);
    return {x:cx, y:cy-2, z:cz};
  }
  function computeCentroids(players){
    var sums=[]; for(var k=0;k<8;k++) sums[k]={x:0,y:0,z:0,cnt:0, xs:[], ys:[], zs:[]};
    for(var i=0;i<players.length;i++){
      var p=players[i]; var c=p.c; if(c<0||c>=8) continue;
      sums[c].x+=p.x; sums[c].y+=p.y; sums[c].z+=p.z; sums[c].cnt++;
      sums[c].xs.push(p.x); sums[c].ys.push(p.y); sums[c].zs.push(p.z);
    }
    var cents=[];
    for(var k=0;k<8;k++){
      var s=sums[k];
      if(s.cnt){
        // median-ish for stability? use mean
        cents[k]={
          x:s.x/s.cnt, y:s.y/s.cnt, z:s.z/s.cnt, cnt:s.cnt,
          xs:s.xs, ys:s.ys, zs:s.zs,
          // spread for nebula radius
          spread: Math.sqrt(s.xs.reduce(function(acc,val){var d=val-s.x/s.cnt; return acc+d*d;},0)/s.cnt)*1.8 + 0.12
        };
      } else {
        cents[k]={x:0.5,y:0.5,z:0.5,cnt:0, spread:0.2, xs:[],ys:[],zs:[]};
      }
    }
    return cents;
  }

  function createNebulaCanvas(colorHex, rgb, intensity){
    // 256 canvas with radial gradient + soft noise blobs for density
    var size=256;
    var c=document.createElement('canvas'); c.width=size; c.height=size;
    var ctx=c.getContext('2d');
    if(!ctx) return c;
    ctx.clearRect(0,0,size,size);
    var grad=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
    // triple-stop: center opaque 0.36, mid 0.18, edge 0
    grad.addColorStop(0, 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+(0.34*intensity)+')');
    grad.addColorStop(0.22, 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+(0.20*intensity)+')');
    grad.addColorStop(0.48, 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+(0.08*intensity)+')');
    grad.addColorStop(1, 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0)');
    ctx.fillStyle=grad;
    ctx.fillRect(0,0,size,size);
    // add 3-5 soft blobs for nebula irregularity
    for(var b=0;b<4;b++){
      var bx=(0.32+Math.random()*0.36)*size;
      var by=(0.32+Math.random()*0.36)*size;
      var br=(0.12+Math.random()*0.18)*size;
      var g2=ctx.createRadialGradient(bx,by,0,bx,by,br);
      g2.addColorStop(0, 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+(0.16*intensity)+')');
      g2.addColorStop(1, 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0)');
      ctx.fillStyle=g2;
      ctx.beginPath(); ctx.arc(bx,by,br,0,Math.PI*2); ctx.fill();
    }
    return c;
  }

  function buildSkyData(players){
    var centroids=computeCentroids(players);
    var count=players.length;
    var pos=new Float32Array(count*3);
    var col=new Float32Array(count*3);
    var siz=new Float32Array(count);
    for(var i=0;i<count;i++){
      var p=players[i];
      var s=mapToSky(p.x,p.y,p.z);
      var w=worldFromSky({r:s.r+Math.random()*3, az:s.az, el:s.el});
      pos[i*3]=w.x; pos[i*3+1]=w.y; pos[i*3+2]=w.z;
      var k=p.c>=0&&p.c<8?p.c:0;
      var rgb=OKABE_RGB[k];
      // slightly brighter than nebula, not white, AAA friendly
      // blend rgb -> paper slightly
      col[i*3]=rgb[0]/255*0.92+0.08;
      col[i*3+1]=rgb[1]/255*0.92+0.08;
      col[i*3+2]=rgb[2]/255*0.92+0.08;
      siz[i]=1.2 + (p.z||0.4)*1.4 + Math.random()*0.7;
    }
    return {centroids:centroids, positions:pos, colors:col, sizes:siz, count:count};
  }

  // expose
  var api={OKABE:OKABE, OKABE_RGB:OKABE_RGB, LABELS:LABELS, mapToSky:mapToSky, worldFromSky:worldFromSky, computeCentroids:computeCentroids, createNebulaCanvas:createNebulaCanvas, buildSkyData:buildSkyData};
  if(typeof window!=='undefined'){window.VHEmbeddingNebula=api;}
  if(typeof module!=='undefined'&&module.exports){module.exports=api;}
})();
