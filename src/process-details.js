import * as THREE from '../assets/vendor/three.module.min.js';

const clamp = v => Math.max(0, Math.min(1, v));
const mix = (a, b, t) => a + (b - a) * t;

// Visual details share the existing process coordinates and conserved masses.
export function buildProcessDetails(engine) {
  const E = engine, dummy = new THREE.Object3D();
  const steel = new THREE.MeshStandardMaterial({ color: '#8e999d', metalness: .83, roughness: .29 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: '#303b41', metalness: .74, roughness: .43 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#24282b', metalness: .03, roughness: .93 });
  const skin = new THREE.MeshStandardMaterial({ color: '#bc906f', roughness: .86 });
  const orange = new THREE.MeshStandardMaterial({ color: '#e59134', roughness: .8 });
  const navy = new THREE.MeshStandardMaterial({ color: '#182b3a', roughness: .97 });
  const glove = new THREE.MeshStandardMaterial({ color: '#808d81', roughness: .96 });
  const helmetMaterial = new THREE.MeshStandardMaterial({ color: '#efbf32', roughness: .42 });
  const reflector = new THREE.MeshStandardMaterial({ color: '#e5e4bd', roughness: .4, metalness: .18 });
  const sphere = new THREE.SphereGeometry(1, 16, 10);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const draw = (parent, geometry, material, pos = [0, 0, 0], scale) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...pos);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const box = (p, s, at, m) => draw(p, unitBox, m, at, s);
  const ball = (p, s, at, m) => draw(p, sphere, m, at, s);
  const segment = (parent, a, b, radius, material) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va);
    const mesh = draw(parent, unitCylinder, material, va.add(vb).multiplyScalar(.5).toArray(), [radius, d.length(), radius]);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return mesh;
  };
  const curve = (p, points, radius, material, segments = 40) => draw(p,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v => new THREE.Vector3(...v))), segments, radius, 5, false), material);

  const fabricCanvas = document.createElement('canvas'); fabricCanvas.width = fabricCanvas.height = 256;
  const fc = fabricCanvas.getContext('2d'); fc.fillStyle = '#e5e3d7'; fc.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 4) {
    fc.fillStyle = i % 8 ? '#d5d3c7' : '#f4f1e5'; fc.fillRect(i, 0, 1, 256);
    fc.fillStyle = i % 8 ? '#eeecdf' : '#c9c9bd'; fc.fillRect(0, i, 256, 1);
    for (let j = 0; j < 256; j += 8) { fc.fillStyle = '#f6f3e8'; fc.fillRect(i, j + (i % 8 ? 4 : 0), 2, 1); }
  }
  const fabric = new THREE.CanvasTexture(fabricCanvas); fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
  fabric.repeat.set(9, 5); fabric.colorSpace = THREE.SRGBColorSpace; fabric.anisotropy = Math.min(8, E.renderer.capabilities.getMaxAnisotropy());
  const cloth = new THREE.MeshStandardMaterial({ color: '#f3f0df', map: fabric, bumpMap: fabric, bumpScale: .0015, roughness: .97, metalness: 0, side: THREE.DoubleSide });
  const webbing = cloth.clone(); webbing.color.set('#d7dbbf');
  const stitching = new THREE.MeshStandardMaterial({ color: '#b0b09c', roughness: 1 });
  const oldBagChildren = E.bagRoot.children.filter(child => child !== E.bag && child !== E.slingRoot);
  oldBagChildren.forEach(child => { child.visible = false; });
  E.slingRoot.children.forEach(child => { child.visible = false; });

  const N = 64, R = 25;
  const clothPoint = (angle, h, empty, width = .98, height = 1) => {
    const c = Math.cos(angle), s = Math.sin(angle), profile = .9 + .10 * Math.sin(Math.PI * h);
    const pleats = (Math.sin(angle * 12 + h * 4) * .013 + Math.sin(angle * 23 - h * 8) * .005) * (.3 + empty);
    const crumple = empty * .035 * Math.sin(h * 23 + angle * 4) * Math.sin(Math.PI * h);
    return [width / 2 * Math.sign(c) * Math.abs(c) ** .25 * (profile + pleats + crumple),
      width / 2 * Math.sign(s) * Math.abs(s) ** .25 * (profile + pleats - crumple),
      h * height - Math.sin(Math.PI * h) * empty * .018 * (.5 + .5 * Math.sin(angle * 3))];
  };
  const clothGeometry = (width, height, capTop = true) => {
    const a = [], uv = [], ids = [];
    for (let j = 0; j < R; j++) for (let i = 0; i <= N; i++) { a.push(...clothPoint(i / N * Math.PI * 2, j / (R - 1), 0, width, height)); uv.push(i / N, j / (R - 1)); }
    for (let j = 0; j < R - 1; j++) for (let i = 0; i < N; i++) { const k = j * (N + 1) + i; ids.push(k, k + 1, k + N + 1, k + 1, k + N + 2, k + N + 1); }
    for (let i = 1; i < N - 1; i++) { ids.push(0, i + 1, i); const k = (R - 1) * (N + 1); if (capTop) ids.push(k, k + i, k + i + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ids); g.computeVertexNormals(); return g;
  };
  E.bag.geometry.dispose(); E.bag.geometry = clothGeometry(.98, 1); E.bag.material = cloth;
  const seamGeometries = [];
  for (const angle of [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4]) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(R * 3), 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#a6a995' })); E.bag.add(line); seamGeometries.push({ g, angle });
  }
  for (const h of [.035, .96]) {
    const pts = []; for (let i = 0; i <= N; i++) pts.push(clothPoint(i / N * Math.PI * 2, h, 0).map((v, k) => k < 2 ? v * 1.004 : v));
    curve(E.bag, pts, .0024, stitching, 64);
  }
  const labelCanvas = document.createElement('canvas'); labelCanvas.width = 512; labelCanvas.height = 320;
  const lc = labelCanvas.getContext('2d'); lc.fillStyle = '#ecebdc'; lc.fillRect(0, 0, 512, 320);
  lc.strokeStyle = '#818c86'; lc.lineWidth = 3; lc.strokeRect(10, 10, 492, 300); lc.fillStyle = '#234c70';
  lc.font = 'bold 45px Arial'; lc.fillText('SESUVECA', 35, 74); lc.fillRect(35, 91, 442, 4);
  lc.font = '25px Arial'; lc.fillText('CARBÓN', 35, 141); lc.fillText('CARGA MÁXIMA', 35, 188);
  lc.font = 'bold 44px Arial'; lc.fillText('1 000 kg', 35, 244); lc.font = '18px Arial'; lc.fillText('Mantener seco · Izar por las cuatro asas', 35, 282);
  const labelTexture = new THREE.CanvasTexture(labelCanvas); labelTexture.colorSpace = THREE.SRGBColorSpace;
  const labelMat = new THREE.MeshStandardMaterial({ map: labelTexture, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const label = draw(E.bag, new THREE.PlaneGeometry(.31, .194), labelMat, [0, -.494, .56]); label.rotation.x = Math.PI / 2;
  const straps = [];
  for (const x of [-.425, .425]) for (const y of [-.47, .47]) {
    const pts = [[x, y, .80], [x, y, 1.04], [x * .99, y * .96, 1.11], [x * .95, y * .92, 1.07], [x * .97, y * .91, .81]];
    const path = new THREE.CatmullRomCurve3(pts.map(v => new THREE.Vector3(...v)));
    const positions = [], uv = [], ids = [], count = 28;
    for (let i = 0; i <= count; i++) { const p = path.getPoint(i / count); for (const edge of [-1, 1]) { positions.push(p.x + edge * .024, p.y, p.z); uv.push((edge + 1) / 2, i / count); } }
    for (let i = 0; i < count; i++) { const k = i * 2; ids.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ids); g.computeVertexNormals();
    straps.push(draw(E.bagRoot, g, webbing));
  }

  E.chainLine.visible = false; E.chainLine2.visible = false; E.hook.visible = false;
  const linkGeometry = new THREE.TorusGeometry(.012, .0036, 6, 12); linkGeometry.scale(.72, 1.25, 1);
  const chainLinks = new THREE.InstancedMesh(linkGeometry, darkSteel, 480); chainLinks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); chainLinks.castShadow = true; chainLinks.frustumCulled = false; E.chain.add(chainLinks);
  const hook = new THREE.Group(); E.chain.add(hook);
  segment(hook, [0, 0, .016], [0, 0, .087], .018, steel);
  const hookPoints = [[0, 0, .025], [-.032, 0, -.005], [-.044, 0, -.058], [-.008, 0, -.088], [.041, 0, -.062], [.049, 0, -.025]];
  curve(hook, hookPoints, .016, steel, 32);
  segment(hook, [.047, -.001, -.025], [.006, -.001, .004], .0032, steel);
  ball(hook, [.007, .013, .007], [.008, 0, .003], darkSteel);
  const hookCollar = draw(hook, new THREE.TorusGeometry(.022, .005, 6, 18), steel, [0, 0, .08]); hookCollar.rotation.x = Math.PI / 2;

  E.sackBody.geometry.dispose(); E.sackBody.geometry = clothGeometry(.40, .70, false); E.sackBody.material = cloth;
  E.tie.visible = false;
  const sackClosure = new THREE.Group(); E.sack.add(sackClosure);
  const gathered = draw(sackClosure, new THREE.ConeGeometry(.036, .07, 14, 1, true), cloth, [0, 0, -.012]); gathered.rotation.x = Math.PI / 2;
  const cord = draw(sackClosure, new THREE.TorusGeometry(.024, .0032, 5, 20), stitching);
  curve(sackClosure, [[-.025, 0, 0], [-.055, -.016, .018], [-.071, -.025, -.02]], .0024, stitching, 12);
  curve(sackClosure, [[.02, 0, 0], [.05, -.025, .013], [.069, -.033, -.026]], .0024, stitching, 12);
  const sackLabelCanvas = document.createElement('canvas'); sackLabelCanvas.width = 384; sackLabelCanvas.height = 240;
  const sackLabelTexture = new THREE.CanvasTexture(sackLabelCanvas); sackLabelTexture.colorSpace = THREE.SRGBColorSpace;
  const sackLabelMaterial = new THREE.MeshStandardMaterial({ map: sackLabelTexture, roughness: 1, side: THREE.DoubleSide });
  const sackLabel = draw(E.sackBody, new THREE.PlaneGeometry(.17, .106), sackLabelMaterial, [0, -.202, .36]); sackLabel.rotation.x = Math.PI / 2;
  const sackCoal = ball(E.sackBody, [.155, .15, .025], [0, 0, .53], new THREE.MeshStandardMaterial({ color: '#202528', roughness: .98, metalness: .04 }));
  const sackGrains = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.014, 0), sackCoal.material, 22); E.sackBody.add(sackGrains); sackGrains.castShadow = true;
  E.finishedBags.forEach(b => { b.material = cloth; draw(b, new THREE.TorusGeometry(.023, .003, 5, 16), stitching, [0, 0, .477]); });

  const woodCanvas = document.createElement('canvas'); woodCanvas.width = 512; woodCanvas.height = 128;
  const wc = woodCanvas.getContext('2d'); wc.fillStyle = '#ac8959'; wc.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 96; i++) { const y = (i * 29.73) % 128; wc.strokeStyle = `rgba(${i % 3 ? '63,39,19' : '233,204,151'},${.08 + i % 5 * .025})`; wc.lineWidth = .3 + i % 3 * .45; wc.beginPath(); wc.moveTo(0, y); for (let x = 0; x <= 512; x += 32) wc.lineTo(x, y + Math.sin(x / 70 + i * 2) * (1 + i % 4)); wc.stroke(); }
  const woodTexture = new THREE.CanvasTexture(woodCanvas); woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping; woodTexture.colorSpace = THREE.SRGBColorSpace;
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture, bumpMap: woodTexture, bumpScale: .0018, color: '#d1b486', roughness: .93 });
  const nailGeometry = new THREE.CylinderGeometry(.0034, .0034, .0016, 7); nailGeometry.rotateX(Math.PI / 2);
  const addNails = (parent, positions) => { const n = new THREE.InstancedMesh(nailGeometry, darkSteel, positions.length); positions.forEach((p, i) => { dummy.position.set(...p); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); n.setMatrixAt(i, dummy.matrix); }); parent.add(n); };
  E.pallet.children.forEach(o => { if (o.isMesh) o.material = wood; });
  for (const x of [-.43, 0, .43]) box(E.pallet, [.14, 1.1, .024], [x, 0, .012], wood);
  const nails = []; for (let i = 0; i < 7; i++) for (const y of [-.43, 0, .43]) for (const dx of [-.035, .035]) nails.push([-.48 + i * .16 + dx, y, .151]); addNails(E.pallet, nails);
  E.output.children.filter(o => !E.finishedBags.includes(o)).forEach(o => { o.visible = false; });
  for (const y of [-.43, 0, .43]) box(E.output, [1.1, .14, .024], [0, y, .012], wood);
  for (const x of [-.44, 0, .44]) for (const y of [-.43, 0, .43]) box(E.output, [.14, .14, .07], [x, y, .059], wood);
  for (let i = 0; i < 7; i++) box(E.output, [.13, 1.05, .026], [-.48 + i * .16, 0, .107], wood);
  addNails(E.output, nails.map(p => [p[0], p[1], .121]));

  const addPerson = (person, seated = false) => {
    person.children.forEach(child => { child.visible = false; });
    const torso = ball(person, [.175, .115, .265], [0, 0, 1.155], orange);
    ball(person, [.145, .10, .115], [0, 0, .88], navy);
    ball(person, [.087, .084, .112], [0, -.006, 1.495], skin);
    segment(person, [0, 0, 1.36], [0, 0, 1.43], .045, skin);
    const hat = draw(person, new THREE.SphereGeometry(.122, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), helmetMaterial, [0, 0, 1.558]); hat.rotation.x = Math.PI / 2;
    const brim = draw(person, new THREE.CylinderGeometry(.132, .132, .012, 20), helmetMaterial, [0, -.006, 1.557]); brim.rotation.x = Math.PI / 2;
    ball(person, [.025, .022, .027], [0, -.09, 1.49], skin);
    for (const side of [-1, 1]) ball(person, [.013, .022, .024], [side * .086, -.005, 1.49], skin);
    for (const dx of [-.09, .09]) {
      const knee = seated ? [dx, -.21, .57] : [dx, .005, .46], ankle = seated ? [dx, -.27, .20] : [dx, -.012, .11];
      segment(person, [dx, 0, .90], knee, .064, navy); segment(person, knee, ankle, .054, navy);
      ball(person, [.066, .067, .06], knee, navy); box(person, [.125, .22, .08], [ankle[0], ankle[1] - .04, ankle[2] - .055], rubber);
      box(person, [.034, .012, .40], [dx, -.105, 1.17], reflector);
    }
    box(person, [.30, .012, .034], [0, -.113, 1.09], reflector);
    const arms = [];
    for (const side of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(side * .16, 0, 1.33); person.add(a);
      const elbow = [side * .085, -.025, -.18], hand = seated ? [side * .08, -.27, -.15] : [side * .065, -.17, -.31];
      segment(a, [0, 0, 0], elbow, .052, orange); ball(a, [.050, .050, .050], elbow, orange); segment(a, elbow, hand, .042, orange); ball(a, [.047, .032, .065], hand, glove); arms.push(a);
    }
    return { arms, torso };
  };
  const people = [addPerson(E.worker1), addPerson(E.worker2), addPerson(E.driver, true)];
  const f = E.forklift;
  for (const x of [-.38, .38]) {
    box(f, [.16, .045, .10], [x, -.16, 1.83], new THREE.MeshStandardMaterial({ color: '#e5e7df', roughness: .22, metalness: .2 }));
    box(f, [.11, .02, .05], [x, -1.451, .84], new THREE.MeshStandardMaterial({ color: '#a83425', roughness: .24 }));
  }
  const grill = new THREE.Group(); f.add(grill);
  for (let i = 0; i < 8; i++) box(grill, [.68, .012, .012], [0, -1.447, .45 + i * .03], darkSteel);
  for (const x of [-.27, .27]) segment(f, [x, .006, .52], [x, .006, 1.92], .018, steel);
  box(f, [.055, .055, .10], [0, -.60, .95], darkSteel);
  const steering = draw(f, new THREE.TorusGeometry(.14, .012, 6, 20), darkSteel, [0, -.34, 1.02]); steering.rotation.x = .5;
  const treadGeometry = new THREE.BoxGeometry(.035, .032, .165), treads = new THREE.InstancedMesh(treadGeometry, rubber, 88); f.add(treads);
  const wheelLocations = []; for (const x of [-.54, .54]) for (const y of [-.34, -1.16]) wheelLocations.push([x, y, .25]);
  const wheelRims = new THREE.InstancedMesh(new THREE.CylinderGeometry(.032, .032, .008, 10), steel, 20); f.add(wheelRims);
  let rim = 0;
  for (const [x, y, z] of wheelLocations) for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5; dummy.position.set(x + Math.sign(x) * .089, y + Math.cos(a) * .066, z + Math.sin(a) * .066); dummy.rotation.set(0, 0, Math.PI / 2); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); wheelRims.setMatrixAt(rim++, dummy.matrix);
  }
  let lastEmpty = -1, lastWheelRotation = null, lastSackSize = null, lastSackShape = null;

  return {
    update(state) {
      const empty = 1 - (state.payload ? state.bigbagKg / state.payload : 0);
      if (Math.abs(empty - lastEmpty) > .001) {
        const pos = E.bag.geometry.attributes.position;
        for (let j = 0; j < R; j++) for (let i = 0; i <= N; i++) pos.setXYZ(j * (N + 1) + i, ...clothPoint(i / N * Math.PI * 2, j / (R - 1), empty));
        pos.needsUpdate = true; E.bag.geometry.computeVertexNormals();
        seamGeometries.forEach(({ g, angle }) => { for (let j = 0; j < R; j++) { const p = clothPoint(angle, j / (R - 1), empty); g.attributes.position.setXYZ(j, p[0] * 1.003, p[1] * 1.003, p[2]); } g.attributes.position.needsUpdate = true; });
        lastEmpty = empty;
      }
      label.position.y = -.494 + empty * .014;
      const pulse = state.phaseId === 'traslado' ? Math.sin(state.phaseProgress * Math.PI * 2) * .006 : 0;
      straps.forEach((strap, i) => { strap.rotation.x = pulse * (i % 2 ? 1 : -1); strap.scale.x = mix(.70, 1, 1 - empty); strap.scale.y = mix(.56, 1, 1 - empty); });
      const top = E.data.config.beam_bottom - .15, bottom = state.hookM + .09, count = Math.min(240, Math.max(1, Math.floor((top - bottom) / .024)));
      chainLinks.count = count * 2;
      for (let side = 0; side < 2; side++) for (let i = 0; i < count; i++) {
        dummy.position.set(side * .035, 0, bottom + (top - bottom) * (i + .5) / count);
        dummy.rotation.set(Math.PI / 2, 0, i % 2 ? Math.PI / 2 : 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); chainLinks.setMatrixAt(side * count + i, dummy.matrix);
      }
      chainLinks.instanceMatrix.needsUpdate = true; hook.position.set(.0175, 0, state.hookM);
      E.chainLine.visible = E.chainLine2.visible = E.hook.visible = false;
      const tied = state.cyclePhase === 'amarre' || state.cyclePhase === 'salida' || state.phaseIndex === 7;
      sackClosure.visible = tied; E.tie.visible = false;
      const h = E.bagSize === 25 ? .49 : .70; sackClosure.position.z = h - .025;
      if (lastSackSize !== E.bagSize) {
        const c = sackLabelCanvas.getContext('2d'); c.fillStyle = '#eeeddd'; c.fillRect(0, 0, 384, 240); c.fillStyle = '#244e69'; c.font = 'bold 32px Arial'; c.fillText('SESUVECA', 24, 53); c.font = '27px Arial'; c.fillText('CARBÓN', 24, 111); c.font = 'bold 51px Arial'; c.fillText(`${E.bagSize} kg`, 24, 187); sackLabelTexture.needsUpdate = true; lastSackSize = E.bagSize;
      }
      const fill = clamp(E.bagSize ? state.sackKg / E.bagSize : 0);
      E.sackBody.scale.z = h / .70 * mix(.79, 1, fill);
      const sackShape = `${tied}:${fill.toFixed(3)}`;
      if (lastSackShape !== sackShape) {
        const a = E.sackBody.geometry.attributes.position;
        for (let j = 0; j < R; j++) for (let i = 0; i <= N; i++) {
          const h = j / (R - 1), angle = i / N * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
          const fullness = Math.sin(Math.PI * h) ** .65;
          const body = (.78 + fullness * .22) * (1 + .028 * Math.sin(angle * 11 + h * 3) + .017 * Math.sin(angle * 19 - h * 13));
          const folds = (1 - fill * .65) * .010 * Math.sin(angle * 14 + h * 8) * Math.sin(Math.PI * h);
          const pinch = mix(1, tied ? .17 : .69, clamp((h - .72) / .28));
          const x = .20 * Math.sign(cos) * Math.abs(cos) ** .69 * body + folds * cos;
          const y = .20 * Math.sign(sin) * Math.abs(sin) ** .69 * body + folds * sin;
          a.setXYZ(j * (N + 1) + i, x * pinch, y * pinch, h * .70 - .011 * Math.sin(h * Math.PI) * (1 - fill));
        }
        a.needsUpdate = true; E.sackBody.geometry.computeVertexNormals(); lastSackShape = sackShape;
      }
      sackCoal.visible = sackGrains.visible = fill > .025 && !tied;
      sackCoal.position.z = .065 + fill * .49;
      for (let i = 0; i < 22; i++) {
        const theta = i * 2.399963, rad = .13 * Math.sqrt((i + .5) / 22);
        dummy.position.set(Math.cos(theta) * rad, Math.sin(theta) * rad, sackCoal.position.z + .016 + .004 * Math.sin(i * 2));
        dummy.scale.set(1, .7 + i % 3 * .2, .7); dummy.rotation.set(i, i * .4, i * 1.1); dummy.updateMatrix(); sackGrains.setMatrixAt(i, dummy.matrix);
      }
      sackGrains.instanceMatrix.needsUpdate = true;
      people[1].arms.forEach((a, i) => { const move = tied && state.cyclePhase === 'amarre' ? Math.sin(state.cycleProgress * Math.PI * 4) : 0; a.rotation.x = tied ? -.18 + move * .07 : -.035; a.rotation.z = (i ? -1 : 1) * (tied ? .21 : .04); });
      people[0].arms.forEach((a, i) => { a.rotation.x = state.phaseIndex === 1 ? -.27 : -.035; a.rotation.z = (i ? -1 : 1) * .035; });
      const wheelRotation = state.phaseIndex === 0 ? mix(-1.8, 0, state.phaseProgress) / .23 : state.phaseIndex === 1 ? -state.phaseProgress * 3 / .23 : 0;
      if (wheelRotation !== lastWheelRotation) {
        let k = 0; for (const [x, y, z] of wheelLocations) for (let i = 0; i < 22; i++) { const a = i * Math.PI * 2 / 22 + wheelRotation; dummy.position.set(x, y + Math.sin(a) * .229, z + Math.cos(a) * .229); dummy.rotation.set(a, 0, Math.PI / 2); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); treads.setMatrixAt(k++, dummy.matrix); }
        treads.instanceMatrix.needsUpdate = true; lastWheelRotation = wheelRotation;
      }
    }
  };
}
