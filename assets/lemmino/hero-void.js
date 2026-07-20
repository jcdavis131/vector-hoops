/* hero-void.js — Lemmino-style documentary void: floating deconstructed court + basketball monolith */
export async function mountHeroVoid(canvas) {
  if (!canvas) return;
  const THREE = await import('three');
  
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isLowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (window.innerWidth < 500);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isLowEnd, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !isLowEnd;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0A0C10);
  scene.fog = new THREE.FogExp2(0x0A0C10, 0.022);

  const camera = new THREE.PerspectiveCamera(34, canvas.clientWidth / canvas.clientHeight, 0.1, 120);
  camera.position.set(0, 0.8, 8.8);

  // Lights — Lemmino: tungsten key + cold rim + faint top
  const amb = new THREE.AmbientLight(0x252836, 0.6);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xFFE4B2, 1.35);
  key.position.set(4.5, 6, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1; key.shadow.camera.far = 22;
  key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
  key.shadow.bias = -0.0006;
  scene.add(key);
  const coldRim = new THREE.DirectionalLight(0x86BBFF, 0.75);
  coldRim.position.set(-5, 2.5, -4);
  scene.add(coldRim);
  const fillSpot = new THREE.SpotLight(0xF0E442, 0.85, 18, Math.PI * 0.18, 0.32, 1.4);
  fillSpot.position.set(0, 7, 1);
  fillSpot.castShadow = !isLowEnd;
  scene.add(fillSpot);

  // Ground void plane — faint reflection catcher
  const groundGeo = new THREE.PlaneGeometry(60, 60);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x0E1117, roughness: 0.92, metalness: 0.04, transparent: true, opacity: 0.86 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2.2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Floating court fragments — deconstructed lines (Lemmino evidence)
  const courtGroup = new THREE.Group();
  courtGroup.position.set(0, -0.2, 0);
  scene.add(courtGroup);

  const inkMat = new THREE.LineBasicMaterial({ color: 0xEAE6DE, transparent: true, opacity: 0.16 });
  const inkMatBold = new THREE.LineBasicMaterial({ color: 0xFFFEF7, transparent: true, opacity: 0.22 });
  
  function wireBox(w, h, z = 0, mat = inkMat) {
    const pts = [
      new THREE.Vector3(-w/2, -h/2, z), new THREE.Vector3(w/2, -h/2, z),
      new THREE.Vector3(w/2, h/2, z), new THREE.Vector3(-w/2, h/2, z),
      new THREE.Vector3(-w/2, -h/2, z)
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, mat);
    return line;
  }
  // Main court outline floating
  courtGroup.add(wireBox(7.2, 5.0, 0, inkMatBold));
  courtGroup.add(wireBox(7.2, 0.06, 0, inkMat));
  courtGroup.add(wireBox(0.06, 5.0, 0, inkMat));
  // Hoop fragments circles low-poly
  for (let i = 0; i < 2; i++) {
    const hoopGeo = new THREE.RingGeometry(0.68, 0.70, 16);
    const hoopMat = new THREE.MeshBasicMaterial({ color: 0xEAE6DE, transparent: true, opacity: 0.14, side: THREE.DoubleSide });
    const hoop = new THREE.Mesh(hoopGeo, hoopMat);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(i === 0 ? -2.6 : 2.6, 0.02, i === 0 ? 0.2 : -0.15);
    courtGroup.add(hoop);
  }

  // Scattered line shards like evidence diagram
  for (let i = 0; i < 12; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4, 0),
      new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4, 0),
    ]);
    const l = new THREE.Line(geo, inkMat);
    l.position.set((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 3 + 0.6, (Math.random() - 0.5) * 2);
    l.rotation.z = Math.random() * Math.PI;
    courtGroup.add(l);
  }

  // Basketball — low-poly icosahedron, matte, faceless monolith
  const ballGeo = new THREE.IcosahedronGeometry(1.05, 2);
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xC57A3A,
    roughness: 0.88,
    metalness: 0.03,
    flatShading: true,
  });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.position.set(0, 0.55, 0);
  ball.castShadow = true;
  ball.receiveShadow = true;
  scene.add(ball);
  // Seams low-poly
  const seamGeo = new THREE.IcosahedronGeometry(1.058, 2);
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.18, wireframe: true });
  const seam = new THREE.Mesh(seamGeo, seamMat);
  ball.add(seam);

  // Dust — 12,966 as particles (sampled)
  const dustCount = isLowEnd ? 900 : 2500;
  const dustPos = new Float32Array(dustCount * 3);
  const dustCol = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const r = 3.2 + Math.random() * 8.5;
    const theta = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 4.5 + 0.6;
    dustPos[i*3] = Math.cos(theta) * r * (0.7 + Math.random()*0.6);
    dustPos[i*3+1] = y + Math.random()*0.4;
    dustPos[i*3+2] = Math.sin(theta) * r * (0.7 + Math.random()*0.6);
    const v = 0.74 + Math.random()*0.22;
    dustCol[i*3] = v + (Math.random()*0.08);
    dustCol[i*3+1] = v * 0.94;
    dustCol[i*3+2] = v * 0.86;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dustMat = new THREE.PointsMaterial({
    size: isLowEnd ? 0.03 : 0.042,
    vertexColors: true,
    transparent: true,
    opacity: 0.56,
    sizeAttenuation: true,
    depthWrite: false,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  // God ray planes — fake volumetrics
  const rayGeo = new THREE.PlaneGeometry(6, 18);
  const rayMat = new THREE.MeshBasicMaterial({
    color: 0xFFD8A8,
    transparent: true,
    opacity: 0.055,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ray1 = new THREE.Mesh(rayGeo, rayMat);
  ray1.position.set(-1.2, 3, -1.5);
  ray1.rotation.set(0, -0.4, 0.18);
  scene.add(ray1);
  const ray2 = ray1.clone();
  ray2.material = rayMat.clone(); ray2.material.opacity = 0.032;
  ray2.position.set(1.8, 3, -0.8);
  ray2.rotation.set(0, 0.6, -0.12);
  scene.add(ray2);

  // Resize
  function onResize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(onResize);
  ro.observe(canvas);
  onResize();

  // Visibility
  let visible = true;
  const io = new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; }, { threshold: 0.01 });
  io.observe(canvas);

  // Animation — Lemmino: ultra slow dolly, 24fps cadence feeling
  let t0 = performance.now();
  function animate() {
    requestAnimationFrame(animate);
    if (!visible) return;
    const now = performance.now();
    const t = (now - t0) * 0.001;
    const slow = prefersReduced ? 0.18 : 1;

    // slow orbital dolly
    const yaw = t * 0.06 * slow;
    camera.position.x = Math.sin(yaw) * 0.65;
    camera.position.z = 8.8 + Math.cos(yaw * 0.7) * 0.6;
    camera.position.y = 0.8 + Math.sin(t * 0.11 * slow) * 0.22;
    camera.lookAt(0, 0.35, 0);

    // ball slow rotate like artifact
    ball.rotation.y = t * 0.14 * slow;
    ball.rotation.x = Math.sin(t * 0.07 * slow) * 0.18;
    ball.position.y = 0.55 + Math.sin(t * 0.38 * slow) * 0.14;

    courtGroup.rotation.y = yaw * 0.12;
    courtGroup.position.y = -0.2 + Math.sin(t * 0.22 * slow) * 0.06;

    dust.rotation.y = t * 0.012 * slow;

    ray1.rotation.z = 0.18 + Math.sin(t * 0.08 * slow) * 0.06;
    ray2.rotation.z = -0.12 + Math.cos(t * 0.07 * slow) * 0.05;

    renderer.render(scene, camera);
  }
  animate();

  return { renderer, scene, camera, dispose: () => { ro.disconnect(); io.disconnect(); renderer.dispose(); } };
}
