/* monoliths.js — Lemmino evidence room: 8 archetype monoliths in black void with sweeping spotlight */
export async function mountMonoliths(canvas, opts = {}) {
  if (!canvas) return;
  const THREE = await import('three');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isLowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || window.innerWidth < 520;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isLowEnd, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !isLowEnd;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0A0C10);
  scene.fog = new THREE.FogExp2(0x0A0C10, 0.028);

  const camera = new THREE.PerspectiveCamera(32, canvas.clientWidth / canvas.clientHeight, 0.1, 80);
  camera.position.set(0, 2.1, 10.2);

  // Lights — documentary evidence room
  const amb = new THREE.AmbientLight(0x1E2330, 0.55);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xFFE9C7, 1.15);
  key.position.set(6, 8, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1; key.shadow.camera.far = 24;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8AB4FF, 0.62);
  rim.position.set(-6, 3, -6);
  scene.add(rim);

  // moving sweep light like torch
  const sweep = new THREE.SpotLight(0xF0E442, 2.6, 22, Math.PI * 0.22, 0.26, 1.3);
  sweep.position.set(-6, 4.5, 4);
  sweep.castShadow = !isLowEnd;
  scene.add(sweep);
  scene.add(sweep.target);

  const groundGeo = new THREE.PlaneGeometry(80, 80);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x0C0E14, roughness: 0.94, metalness: 0.06, transparent: true, opacity: 0.92 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.4;
  ground.receiveShadow = true;
  scene.add(ground);

  // 8 archetypes — Okabe desaturated for Lemmino
  const ARCH = [
    { name: 'Glass+Rim', label: 'OFF GLASS • RIM PROT', color: '#2A5B84', count: 0.14 },
    { name: 'LowVol Glass', label: 'GLASS • LOW VOL', color: '#8A4A2A', count: 0.11 },
    { name: 'Low Impact', label: '3 VOL • LOW IMPACT', color: '#6B6B6B', count: 0.16 },
    { name: 'Def Glass+FT', label: 'DEF • FT • GRIT', color: '#2E6B52', count: 0.13 },
    { name: 'Vol+3P Vol', label: 'SHOT VOL • 3 VOL', color: '#6A7AB2', count: 0.18 },
    { name: '3P Acc+Vol', label: '3P ACC • VOLUME', color: '#8E6AA8', count: 0.12 },
    { name: 'Playmaking', label: 'PLAYMAKING • STEALS', color: '#B78A22', count: 0.09 },
    { name: 'Scoring Vol', label: 'PURE SCORING VOL', color: '#D9D9D9', count: 0.21 },
  ];

  const monolithGroup = new THREE.Group();
  scene.add(monolithGroup);

  const monoliths = [];
  // arrange in gentle arc like Stonehenge evidence
  for (let i = 0; i < ARCH.length; i++) {
    const a = ARCH[i];
    const angle = (i / ARCH.length) * Math.PI * 1.15 - Math.PI * 0.575; // ~207deg arc
    const rad = 5.8 + Math.sin(i * 0.9) * 0.6;
    const x = Math.sin(angle) * rad;
    const z = Math.cos(angle) * rad * 0.65 - 0.5;
    const h = 1.4 + a.count * 6.5; // height reflects prevalence

    const geo = new THREE.BoxGeometry(0.72, h, 0.42, 1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x151821,
      roughness: 0.86,
      metalness: 0.12,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, -1.4 + h / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.rotation.y = -angle * 0.5 + (Math.random() - 0.5) * 0.1;
    mesh.rotation.z = (Math.random() - 0.5) * 0.04;
    monolithGroup.add(mesh);

    // base glow — okabe color leaked
    const baseGeo = new THREE.PlaneGeometry(1.1, 1.1);
    const baseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(a.color), transparent: true, opacity: 0.14, side: THREE.DoubleSide });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.rotation.x = -Math.PI / 2;
    base.position.set(x, -1.395, z);
    monolithGroup.add(base);

    // small accent top light
    const accentMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(a.color),
      emissive: new THREE.Color(a.color),
      emissiveIntensity: 0.22,
      roughness: 0.6,
    });
    const capGeo = new THREE.BoxGeometry(0.76, 0.06, 0.46);
    const cap = new THREE.Mesh(capGeo, accentMat);
    cap.position.set(0, h/2 - 0.03, 0);
    mesh.add(cap);

    monoliths.push({ mesh, base, angle, x, z, h, data: a, idx: i });
  }

  // dust motes in beam
  const moteCount = isLowEnd ? 300 : 700;
  const motePos = new Float32Array(moteCount*3);
  for (let i=0;i<moteCount;i++){
    motePos[i*3] = (Math.random()-0.5)*18;
    motePos[i*3+1] = Math.random()*5;
    motePos[i*3+2] = (Math.random()-0.5)*8;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos,3));
  const moteMat = new THREE.PointsMaterial({ size:0.04, color:0xEAE6DE, transparent:true, opacity:0.22, depthWrite:false, sizeAttenuation:true });
  const motes = new THREE.Points(moteGeo, moteMat);
  scene.add(motes);

  // fake volumetric wedge from sweep
  const beamGeo = new THREE.PlaneGeometry(4, 14);
  const beamMat = new THREE.MeshBasicMaterial({ color:0xFFE8B0, transparent:true, opacity:0.055, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  scene.add(beam);

  function resize(){
    const w=canvas.clientWidth, h=canvas.clientHeight;
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let visible=true;
  const io = new IntersectionObserver(es=>{ visible = es[0]?.isIntersecting ?? true; }, {threshold:0.01});
  io.observe(canvas);

  let t0=performance.now();
  function animate(){
    requestAnimationFrame(animate);
    if(!visible) return;
    const now=performance.now();
    const t=(now-t0)*0.001;
    const s = prefersReduced?0.18:1;

    // sweep across monoliths like investigator flashlight — Lemmino slow reveal
    const sweepIdx = (t*0.18*s)%ARCH.length; // 0..8 continuous
    const current = monoliths[Math.floor(sweepIdx)] || monoliths[0];
    const next = monoliths[(Math.floor(sweepIdx)+1)%monoliths.length];
    const lerp = sweepIdx - Math.floor(sweepIdx);
    const sx = THREE.MathUtils.lerp(current.x, next.x, lerp);
    const sz = THREE.MathUtils.lerp(current.z, next.z, lerp);
    sweep.target.position.set(sx, -0.4, sz);
    sweep.position.set(sx*0.55, 4.5 + Math.sin(t*0.2)*0.4, sz+4.8);
    
    beam.position.copy(sweep.target.position);
    beam.position.y += 1.8;
    beam.lookAt(sweep.position);
    beam.rotation.z = t*0.02*s;

    // camera slow lateral dolly — documentary push
    camera.position.x = Math.sin(t*0.08*s)*1.1;
    camera.position.z = 10.2 + Math.cos(t*0.05*s)*0.6;
    camera.position.y = 2.1 + Math.sin(t*0.07*s)*0.18;
    camera.lookAt(sx*0.35, 0.1, sz*0.28);

    // monolith micro-breathing
    monoliths.forEach((m,i)=>{
      const dist = Math.abs(i - sweepIdx);
      const focus = Math.max(0, 1 - dist*0.65);
      m.mesh.material.emissive = new THREE.Color(m.data.color);
      m.mesh.material.emissiveIntensity = focus*0.18;
      m.base.material.opacity = 0.08 + focus*0.18;
      m.mesh.scale.setScalar(1 + focus*0.04);
      m.mesh.rotation.z = (Math.sin(t*0.3 + i)*0.02) + focus*0.04;
    });

    motes.rotation.y = t*0.02*s;

    renderer.render(scene,camera);
  }
  animate();

  // expose focus for UI sync
  function getFocused(){ 
    const t=(performance.now()-t0)*0.001;
    const idx=Math.floor((t*0.18)%ARCH.length);
    return monoliths[idx]?.data || ARCH[0];
  }

  return { renderer, scene, camera, getFocused, arch: ARCH, dispose:()=>{ro.disconnect(); io.disconnect(); renderer.dispose();}};
}
