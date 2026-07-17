/**
 * Posecode Parser — pure ESM, educational fallback
 *
 * Official production uses:
 *   - posecode-parser (pure TS, Zod IR, ROM-clamped)
 *   - posecode-render (Three.js 0.171, FK + ground-lock IK)
 *   - posecode-embed  <posecode-player> CDN -> 60fps on-device
 *   MIT: https://github.com/posecode-dev/posecode
 *   Playground: https://www.posecode.org/play
 *
 * This file is a lightweight, dependency-free parser that mirrors the official grammar
 * so Vector Hoops can author & lint .posecode offline without build step.
 * Rendering in production is via <posecode-player> (see README & player-animations.html).
 *
 * Grammar (from posecode.org):
 *   posecode <kind> "<Name>"   # kind = exercise | stretch | posture
 *     rig humanoid
 *     prop <type>              # chair | wall | bar | box | dip-bars (repeatable)
 *     pose start = <pose>      # neutral | standing | plank | supine | prone | seated
 *     step "<Phase>" <Ns> <easing>:
 *       <joint>: <action> <deg>
 *       reach: <effector> <target>
 *       ground-lock: <effectors>
 *       turn: <deg>
 *       travel: <x> <z>
 *       cue "<text>"
 *     repeat <count>
 *
 * Joints: neck head spine chest pelvis + plural shoulders elbows wrists hips knees ankles
 *         + singular _left/_right + fingers, thumb_*, index_*, etc.
 * Actions: flex/extend, abduct/adduct, rotate-in/rotate-out, supinate/pronate,
 *          dorsiflex/plantarflex, hinge (pelvis), hold neutral
 *
 * ROM clamp table (hard, anatomically safe, warns):
 */
const ROM_TABLE = {
  // joint base (without _left/_right) -> action -> max deg (absolute target)
  knees:      { flex: 144, extend: 10, abduct: 30, adduct: 25, 'rotate-in': 20, 'rotate-out': 30 },
  elbows:     { flex: 154, extend: 10, supinate: 90, pronate: 90 },
  shoulders:  { flex: 180, extend: 60, abduct: 180, adduct: 50, 'rotate-in': 90, 'rotate-out': 90 },
  hips:       { flex: 120, extend: 30, abduct: 45, adduct: 30, 'rotate-in': 45, 'rotate-out': 45 },
  ankles:     { dorsiflex: 35, plantarflex: 60, abduct: 25, adduct: 25 },
  pelvis:     { flex: 90, extend: 30, hinge: 120, 'rotate-in': 45, 'rotate-out': 45 },
  spine:      { flex: 60, extend: 25, abduct: 40, 'rotate-in': 45, 'rotate-out': 45 },
  chest:      { flex: 50, extend: 20, abduct: 40, 'rotate-in': 45, 'rotate-out': 45 },
  neck:       { flex: 60, extend: 70, abduct: 45, 'rotate-in': 80, 'rotate-out': 80 },
  wrists:     { flex: 80, extend: 70, supinate: 90, pronate: 90 },
  fingers:    { flex: 90, extend: 20 },
};

const PLURAL_MAP = {
  shoulders: ['shoulder_left','shoulder_right'],
  elbows: ['elbow_left','elbow_right'],
  wrists: ['wrist_left','wrist_right'],
  hips: ['hip_left','hip_right'],
  knees: ['knee_left','knee_right'],
  ankles: ['ankle_left','ankle_right'],
  hands: ['hand_left','hand_right'],
  feet: ['foot_left','foot_right'],
  fingers: ['fingers_left','fingers_right']
};

function normJoint(j){ return j.toLowerCase().trim(); }
function baseJoint(j){
  let b=j.toLowerCase().replace(/_left|_right$/,'');
  if(b.startsWith('thumb_')||b.startsWith('index_')||b.startsWith('middle_')||b.startsWith('ring_')||b.startsWith('pinky_')) b=b.split('_')[0];
  if(b.includes('fingers')) return 'fingers';
  // map singular to plural key for ROM lookup
  const singularToPlural={knee:'knees',elbow:'elbows',shoulder:'shoulders',hip:'hips',ankle:'ankles',wrist:'wrists',finger:'fingers',hand:'hands',foot:'feet'};
  return singularToPlural[b]||b;
}

function romLimit(joint, action){
  const b=baseJoint(joint);
  const tbl=ROM_TABLE[b]||ROM_TABLE[joint.replace(/_left|_right/,'')] ;
  if(!tbl) return null;
  const lim=tbl[action];
  if(lim!==undefined) return lim;
  // generic fallback for unknown action on known joint -> 180
  if(['flex','extend','abduct','adduct','rotate-in','rotate-out','supinate','pronate','dorsiflex','plantarflex','hinge'].includes(action)) return 180;
  return null;
}

export function clampJoint(joint, action, deg){
  if(action==='hold') return { value:0, clamped:false };
  const limit=romLimit(joint, action);
  if(limit===null) return { value:deg, clamped:false };
  const abs=Math.abs(deg);
  if(abs>limit){
    console.warn(`[posecode ROM] clamp ${joint} ${action} ${deg}° → ${limit}°`);
    return { value: Math.sign(deg||1)*limit, clamped:true, limit };
  }
  return { value:deg, clamped:false };
}

export function expandJoint(joint){
  const low=joint.toLowerCase();
  if(PLURAL_MAP[low]) return PLURAL_MAP[low];
  return [low];
}

// --- Main Parser ---
export function parsePosecode(text){
  const lines=text.split(/\r?\n/);
  const docs=[];
  let cur=null; let step=null;

  const headerRe=/^\s*posecode\s+(exercise|stretch|posture)\s+"([^"]+)"\s*$/i;
  const rigRe=/^\s*rig\s+(\w+)\s*$/i;
  const propRe=/^\s*prop\s+([a-z-]+)\s*$/i;
  const poseRe=/^\s*pose\s+start\s*=\s*(\w+)\s*$/i;
  // tolerant easing: official is linear|ease-in|ease-out|ease-in-out, but author may write drive|settle etc -> accept any token, normalize to easing map
  const stepRe=/^\s*step\s+"([^"]+)"\s+([\d.]+)s?\s+([a-z-]+)\s*:\s*$/i;
  const repeatRe=/^\s*repeat\s+(\d+)\s*$/i;
  const reachRe=/^\s*reach:\s*([a-z_]+)\s+(?:->\s*)?([a-z_]+)\s*$/i;
  const groundRe=/^\s*ground-lock:\s*(.+?)\s*$/i;
  const turnRe=/^\s*turn:\s*([-\d.]+)\s*$/i;
  const travelRe=/^\s*travel:\s*([-\d.]+)\s+([-\d.]+)\s*$/i;
  const cueRe=/^\s*cue\s+"([^"]+)"\s*$/i;
  const pinRe=/^\s*pin:\s*([a-z_]+)\s+([a-z_]+)\s*$/i;
  const commentRe=/^\s*#|^\s*\/\//;

  function pushStep(){
    if(cur && step){ cur.steps.push(step); step=null; }
  }
  function pushDoc(){
    if(cur){
      pushStep();
      docs.push(cur);
      cur=null;
    }
  }

  const easingMap={ 'drive':'ease-out', 'settle':'ease-in-out', 'bounce':'ease-out', 'hold':'linear' };

  for(const raw of lines){
    const line=raw.trimEnd();
    if(line.trim()==='' || commentRe.test(line)) continue;
    let m;
    if((m=line.match(headerRe))){ pushDoc(); cur={ kind:m[1].toLowerCase(), name:m[2], rig:'humanoid', props:[], startPose:'standing', steps:[], repeat:1 }; continue; }
    if(!cur) continue;
    if((m=line.match(rigRe))){ cur.rig=m[1].toLowerCase(); continue; }
    if((m=line.match(propRe))){ cur.props.push(m[1].toLowerCase()); continue; }
    if((m=line.match(poseRe))){ cur.startPose=m[1].toLowerCase(); continue; }
    if((m=line.match(stepRe))){
      pushStep();
      let easing=m[3].toLowerCase();
      if(easingMap[easing]) easing=easingMap[easing];
      if(!['linear','ease-in','ease-out','ease-in-out'].includes(easing)){
        // keep custom but warn -> fallback
        console.warn(`[posecode] unknown easing "${m[3]}" -> using ${easing} as ${easingMap[m[3]]||'ease-in-out'}`);
        easing=easingMap[m[3]]||'ease-in-out';
      }
      step={ name:m[1], durationSec:parseFloat(m[2]), easing, joints:{}, reach:[], groundLock:[], turnDeg:null, travel:null, cue:'', pins:[] };
      continue;
    }
    if((m=line.match(repeatRe))){ pushStep(); cur.repeat=parseInt(m[1],10); continue; }
    if(!step) continue;

    if((m=line.match(reachRe))){ step.reach.push({ effector:m[1].toLowerCase(), target:m[2].toLowerCase() }); continue; }
    if((m=line.match(pinRe))){ step.pins.push({ effector:m[1].toLowerCase(), anchor:m[2].toLowerCase() }); continue; }
    if((m=line.match(groundRe))){ const parts=m[1].split(/[,\s]+/).map(s=>s.trim().toLowerCase()).filter(Boolean); step.groundLock.push(...parts); continue; }
    if((m=line.match(turnRe))){ step.turnDeg=parseFloat(m[1]); continue; }
    if((m=line.match(travelRe))){ step.travel={ x:parseFloat(m[1]), z:parseFloat(m[2]) }; continue; }
    if((m=line.match(cueRe))){ step.cue=m[1]; continue; }

    // joint lines — may be comma separated
    const chunks=line.split(',').map(s=>s.trim()).filter(Boolean);
    let matched=false;
    for(const chunk of chunks){
      // joint: action deg   e.g. knees: flex 42
      const jRe=/^\s*([a-z_]+)\s*:\s*([a-z-]+)(?:\s+([-\d.]+))?(?:\s+([a-z]+))?\s*$/i;
      const jm=chunk.match(jRe);
      if(!jm) continue;
      let jName=normJoint(jm[1]);
      let action=jm[2].toLowerCase();
      let degStr=jm[3];
      const extra=jm[4];
      if(action==='hold' && extra?.toLowerCase()==='neutral'){ action='hold'; degStr='0'; }
      if(action==='hold' && !degStr) degStr='0';
      let deg=degStr!==undefined? parseFloat(degStr):0;
      if(isNaN(deg)) deg=0;
      const { value }=clampJoint(jName, action, deg);
      if(!step.joints[jName]) step.joints[jName]=[];
      step.joints[jName].push({ action, deg:value });
      matched=true;
    }
    if(matched) continue;
  }
  pushDoc();
  return docs;
}

export function parseSingle(text){ return parsePosecode(text)[0]||null; }

// Quick lint helper for UI
export function lint(text){
  const docs=parsePosecode(text);
  const issues=[];
  for(const d of docs){
    if(d.steps.length<2) issues.push({ level:'warn', msg:`"${d.name}" has ${d.steps.length} phase(s) — recommend 2–5` });
    for(const s of d.steps){
      if(s.durationSec>3) issues.push({ level:'warn', msg:`step "${s.name}" ${s.durationSec}s long — consider 0.3–1.8s for sports` });
      for(const [j, acts] of Object.entries(s.joints)){
        for(const {action,deg} of acts){
          const lim=romLimit(j,action);
          if(lim!==null && Math.abs(deg)>lim) issues.push({ level:'error', msg:`ROM ${j} ${action} ${deg}° > ${lim}°` });
        }
      }
    }
  }
  return { docs, issues };
}

export const ROM = ROM_TABLE;
