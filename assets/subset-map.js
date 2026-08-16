/* Vector Hoops Subset Map — local neighborhood lens for game
   Shows target archetype cluster as see-through-model view
   - No extra fetch beyond vectors_map_lite already in shared-map
   - Draws only players in same archetype OR nearest N by map distance if MTNN not ready
   - Lightweight, 30fps, DPR=1
*/
(function(){
  'use strict';
  const OKABE=['#0072B2','#D55E00','#009E73','#F0E442','#56B4E9','#CC79A7','#E69F00','#FF4F6B'];
  const ARCH=["Glass+Rim","LowVol Glass","Low Impact","Def Glass FT","Vol+3P","3P Acc+Vol","Playmaking","Scoring Vol"];

  async function loadLite(){
    const urls=['assets/vectors_map_lite.json','assets/vectors_lite.json'];
    for(const u of urls){
      try{
        const r=await fetch(u,{cache:'default'});
        if(!r.ok) continue;
        const j=await r.json();
        const arr=j.players||j;
        if(Array.isArray(arr)&&arr.length) return arr;
      }catch{}
    }
    return [];
  }

  function projectPoint(x,y,z, rotY, rotX){
    const cy=Math.cos(rotY), sy=Math.sin(rotY), cx=Math.cos(rotX), sx=Math.sin(rotX);
    const ox=((x||0.5)-0.5)*2, oy=((y||0.5)-0.5)*2, oz=((z||0.5)-0.5)*2;
    const xr=ox*cy+oz*sy;
    const z1=-ox*sy+oz*cy;
    const yr=oy*cx - z1*sx;
    const zr=oy*sx + z1*cx;
    const persp=2.8;
    const sc=persp/(persp - zr*0.55);
    return {xr, yr, zr, sc, depth:(zr+1)*0.5};
  }

  async function mountSubsetMap(canvas, opts={}){
    if(!canvas) return null;
    const W=canvas.width||320, H=canvas.height||200;
    const ctx=canvas.getContext('2d');
    if(!ctx) return null;

    let players=await loadLite();
    if(!players.length){ ctx.fillStyle='#FFFEF7'; ctx.fillRect(0,0,W,H); return null; }

    // Build id->player index for fast lookup
    const idToIdx=new Map();
    for(let i=0;i<players.length;i++){ const id=players[i].i; if(id!=null) idToIdx.set(id,i); }

    let targetId=opts.targetId!=null?opts.targetId:null;
    let targetC=opts.targetC!=null?opts.targetC:0;
    let neighbors=Array.isArray(opts.neighbors)?opts.neighbors:[]; // array of ids

    let rotY=opts.rotY||0.18*Math.PI, rotX=0.22;
    let auto=true, lastT=0, isDragging=false, lastX=0,lastY=0;
    let embedPaused=false;

    function filteredSubset(){
      // Prefer same archetype as target, else all
      if(targetC!=null){
        return players.filter(p=> (p.c|0)===targetC);
      }
      return players.slice(0, Math.min(players.length, 800));
    }

    function draw(){
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle='#FFFEF7';
      ctx.fillRect(0,0,W,H);
      // subtle grid
      ctx.fillStyle='rgba(26,21,15,0.04)';
      for(let gx=0;gx<W;gx+=22) ctx.fillRect(gx,0,1,H);
      for(let gy=0;gy<H;gy+=22) ctx.fillRect(0,gy,W,1);

      const subset = opts.neighborMode==='closest' && neighbors.length ? neighbors.map(id=>{
        const idx=idToIdx.get(id); if(idx==null) return null; return players[idx];
      }).filter(Boolean) : filteredSubset();

      // Project
      const W2=W*0.5,H2=H*0.5, W40=W*0.38, H40=H*0.38;
      let targetProj=null;
      for(let i=0;i<subset.length;i++){
        const p=subset[i];
        const pr=projectPoint(p.x,p.y,p.z, rotY, rotX);
        const sx=W2+pr.xr*pr.sc*W40;
        const sy=H2-pr.yr*pr.sc*H40;
        if(p.i===targetId) targetProj={x:sx,y:sy};
        const col=OKABE[(p.c||0)%8];
        const isTarget = p.i===targetId;
        const isGuess = opts.guessIds && opts.guessIds.includes(p.i);
        if(isTarget) continue; // draw last
        const dot= isGuess?3:1.6;
        ctx.fillStyle = isGuess?'#D55E00':col;
        if(isGuess){
          ctx.strokeStyle='#1A150F'; ctx.lineWidth=1;
          ctx.fillRect((sx|0)-dot, (sy|0)-dot, dot*2, dot*2);
          ctx.strokeRect((sx|0)-dot-0.5,(sy|0)-dot-0.5,dot*2+1,dot*2+1);
        } else {
          ctx.globalAlpha=0.72;
          ctx.fillRect((sx|0),(sy|0),2,2);
          ctx.globalAlpha=1;
        }
      }
      // target last – yellow halo
      if(targetProj){
        const x=targetProj.x|0, y=targetProj.y|0;
        ctx.fillStyle='rgba(240,228,66,0.28)';
        ctx.beginPath(); ctx.arc(x,y,12,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#F0E442';
        ctx.beginPath(); ctx.arc(x,y,5.5,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#1A150F'; ctx.lineWidth=1.3;
        ctx.beginPath(); ctx.arc(x,y,5.5,0,Math.PI*2); ctx.stroke();
        // star
        ctx.fillStyle='#1A150F'; ctx.font='900 9px ui-monospace'; ctx.fillText('★', x-4.5, y-9);
      }

      // label
      ctx.fillStyle='rgba(26,21,15,0.62)';
      ctx.font='800 9px ui-monospace,monospace';
      ctx.fillText((ARCH[targetC]||'cluster')+' subset • '+(subset.length)+' shown', 8, 14);
    }

    function loop(t){
      if(embedPaused){ requestAnimationFrame(loop); return; }
      const now=t||performance.now();
      if(!lastT) lastT=now;
      const dt=Math.min(50, now-lastT); lastT=now;
      if(auto){ rotY+=dt*0.00018; }
      draw();
      requestAnimationFrame(loop);
    }
    // drag
    function onDown(ev){ const pt=ev.touches?ev.touches[0]:ev; isDragging=true; auto=false; lastX=pt.clientX; lastY=pt.clientY; }
    function onMove(ev){ if(!isDragging) return; const pt=ev.touches?ev.touches[0]:ev; const dx=pt.clientX-lastX, dy=pt.clientY-lastY; rotY+=dx*0.006; rotX+=dy*0.004; rotX=Math.max(-0.9,Math.min(0.9,rotX)); lastX=pt.clientX; lastY=pt.clientY; }
    function onUp(){ isDragging=false; }
    canvas.addEventListener('mousedown', onDown); window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown,{passive:true}); window.addEventListener('touchmove', onMove,{passive:true}); window.addEventListener('touchend', onUp);

    draw(); requestAnimationFrame(loop);

    return {
      setTarget(id,c){ targetId=id; targetC=c; draw(); },
      setGuesses(ids){ opts.guessIds=Array.isArray(ids)?ids.slice():[]; draw(); },
      setNeighbors(ids, mode){ neighbors=Array.isArray(ids)?ids.slice():[]; opts.neighborMode=mode||'closest'; draw(); },
      _players:players
    };
  }

  window.VHSubsetMap={mountSubsetMap};
})();
