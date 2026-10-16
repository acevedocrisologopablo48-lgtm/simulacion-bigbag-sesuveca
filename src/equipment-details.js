import * as THREE from '../assets/vendor/three.module.min.js';

// Presentation detail follows the existing equipment envelopes. Fabricated CAD remains intact.
const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export function buildEquipmentDetails(engine) {
  const C = engine.data.config, H = engine.data.hopper;
  const materials = {};
  const material = (name, color, metalness = .4, roughness = .45) =>
    materials[name] ||= new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const yellow = material('hoist', '#ad7419', .46, .4);
  const yellowDark = material('cast', '#66451c', .52, .49);
  const black = material('rubber', '#171e22', .03, .79);
  const dark = material('paint', '#283940', .5, .42);
  const steel = material('steel', '#aeb9bb', .82, .28);
  const bright = material('bright', '#dce2df', .85, .24);
  const blue = material('blue', '#274c60', .6, .4);
  const red = material('red', '#bc342c', .08, .4);
  const green = material('green', '#36816d', .06, .38);
  const amber = material('urethane', '#a07035', .05, .67);
  const pipeMat = material('hose', '#525c60', .12, .78);
  const ribMat = material('hoseRibs', '#89938e', .5, .42);
  const galvanized = material('galvanized', '#81908f', .72, .63);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 24);
  const boltGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
  const add = (parent, geometry, mat, position, group, label) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(...position); mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData = { group, part: label, equipmentDetail: true };
    parent.add(mesh); engine.parts.push(mesh); return mesh;
  };
  const box = (parent, size, position, mat, group, label) => {
    const mesh = add(parent, boxGeo, mat, position, group, label);
    mesh.scale.set(...size); return mesh;
  };
  const cylinder = (parent, radius, length, position, axis, mat, group, label, hex = false) => {
    const mesh = add(parent, hex ? boltGeo : cylGeo, mat, position, group, label);
    mesh.scale.set(radius, length, radius);
    mesh.quaternion.setFromUnitVectors(Y, new THREE.Vector3(...axis)); return mesh;
  };
  const torus = (parent, radius, tube, position, normal, mat, group, label, segments = 32) => {
    const mesh = add(parent, new THREE.TorusGeometry(radius, tube, 6, segments), mat, position, group, label);
    mesh.quaternion.setFromUnitVectors(Z, new THREE.Vector3(...normal)); return mesh;
  };
  const cable = (parent, points, radius, mat, group, label, count = 64) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return add(parent, new THREE.TubeGeometry(curve, count, radius, 6, false), mat, [0, 0, 0], group, label);
  };
  const plate = (parent, w, h, position, draw, group, label) => {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = Math.round(768 * h / w);
    const context = canvas.getContext('2d'); draw(context, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, engine.renderer.capabilities.getMaxAnisotropy());
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: .61, metalness: .08 });
    const mesh = add(parent, new THREE.PlaneGeometry(w, h), mat, position, group, label);
    mesh.rotation.x = Math.PI / 2; return { mesh, context, texture, canvas };
  };
  const roundedHousing = (parent, width, depth, height, position, mat, group, label, radius = .025) => {
    const shape = new THREE.Shape(), x = -width / 2, z = -height / 2, r = radius;
    shape.moveTo(x + r, z); shape.lineTo(x + width - r, z);
    shape.quadraticCurveTo(x + width, z, x + width, z + r);
    shape.lineTo(x + width, z + height - r); shape.quadraticCurveTo(x + width, z + height, x + width - r, z + height);
    shape.lineTo(x + r, z + height); shape.quadraticCurveTo(x, z + height, x, z + height - r);
    shape.lineTo(x, z + r); shape.quadraticCurveTo(x, z, x + r, z);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .004, bevelThickness: .004, curveSegments: 4 });
    geometry.translate(0, 0, -depth / 2); geometry.rotateX(Math.PI / 2);
    return add(parent, geometry, mat, position, group, label);
  };

  // Commercial grating references become open bar grating within their original bounds.
  for (const reference of engine.data.static.filter(m => /^(REJILLA_PLATAFORMA_REF|PELDANO_\d+_REF)$/.test(m.tag))) {
    const bbox = new THREE.Box3().setFromPoints(reference.v.map(v => new THREE.Vector3(...v)));
    const { min, max } = bbox, w = max.x - min.x, d = max.y - min.y, h = max.z - min.z;
    const parent = engine.group(reference.group), label = reference.group === 'Escalera' ? 'Peldaño de rejilla metálica antideslizante' : 'Piso de rejilla metálica galvanizada';
    for (const mesh of engine.parts) if (mesh.userData.part === reference.tag) mesh.visible = false;
    const positions = [], count = Math.max(2, Math.floor(w / .03) + 1);
    for (let i = 0; i < count; i++) positions.push({
      p: [min.x + .003 + (w - .006) * i / (count - 1), (min.y + max.y) / 2, (min.z + max.z) / 2],
      s: [.004, d - .006, h]
    });
    const crossCount = Math.max(2, Math.floor(d / .10) + 1);
    for (let i = 0; i < crossCount; i++) positions.push({
      p: [(min.x + max.x) / 2, min.y + .004 + (d - .008) * i / (crossCount - 1), max.z - .004],
      s: [w - .006, .005, .008]
    });
    const bars = new THREE.InstancedMesh(boxGeo, galvanized, positions.length), transform = new THREE.Object3D();
    positions.forEach(({ p, s }, i) => { transform.position.set(...p); transform.scale.set(...s); transform.updateMatrix(); bars.setMatrixAt(i, transform.matrix); });
    bars.castShadow = bars.receiveShadow = true;
    bars.userData = { group: reference.group, part: label, equipmentDetail: true };
    parent.add(bars); engine.parts.push(bars);
    const border = reference.group === 'Escalera' ? blue : galvanized;
    for (const yy of [min.y + .0015, max.y - .0015]) box(parent, [w, .003, h], [(min.x + max.x) / 2, yy, (min.z + max.z) / 2], border, reference.group, label);
    for (const xx of [min.x + .0015, max.x - .0015]) box(parent, [.003, d - .006, h], [xx, (min.y + max.y) / 2, (min.z + max.z) / 2], border, reference.group, label);
    if (reference.group === 'Escalera') {
      box(parent, [.023, d - .006, .006], [min.x + .013, (min.y + max.y) / 2, max.z - .003], dark, 'Escalera', 'Borde antideslizante del peldaño');
    }
  }

  // Replace only the two commercial envelope solids, never the suspension or station steelwork.
  for (const mesh of engine.parts) if (/^(TECLE_ELECTRICO_2t_REF|CARRO_2t_REF)$/.test(mesh.userData.part)) mesh.visible = false;
  const hoist = engine.hoist, z = C.beam_bottom;
  const hoistLabel = 'Tecle eléctrico KITO SHER2M · 2 t';
  roundedHousing(hoist, .29, .285, .275, [-.055, 0, z - .235], yellow, 'Monorriel', hoistLabel);
  cylinder(hoist, .103, .16, [.143, 0, z - .231], [1, 0, 0], yellowDark, 'Monorriel', 'Motor y freno del tecle');
  for (let i = 0; i < 10; i++) cylinder(hoist, .108, .005, [.075 + i * .014, 0, z - .231], [1, 0, 0], yellow, 'Monorriel', 'Aletas de refrigeración del motor');
  cylinder(hoist, .103, .012, [.228, 0, z - .231], [1, 0, 0], dark, 'Monorriel', 'Tapa ventilada del motor');
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    cylinder(hoist, .012, .004, [.235, Math.sin(a) * .066, z - .231 + Math.cos(a) * .066], [1, 0, 0], black, 'Monorriel', 'Ventilación del motor');
  }
  cylinder(hoist, .108, .028, [-.071, -.155, z - .235], [0, 1, 0], yellowDark, 'Monorriel', 'Tapa de engranajes');
  cylinder(hoist, .093, .012, [-.071, -.175, z - .235], [0, 1, 0], yellow, 'Monorriel', 'Tapa de engranajes');
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * i / 3;
    cylinder(hoist, .008, .008, [-.071 + Math.cos(a) * .082, -.185, z - .235 + Math.sin(a) * .082], [0, 1, 0], steel, 'Monorriel', 'Tornillería de tapa del tecle', true);
  }
  box(hoist, [.15, .095, .058], [-.058, -.025, z - .071], dark, 'Monorriel', 'Caja de conexión del tecle');
  const chainBag = roundedHousing(hoist, .142, .155, .115, [-.115, .025, z - .389], black, 'Monorriel', 'Bolsa recogecadena', .018);
  chainBag.material.roughness = .9;
  const nameplate = plate(hoist, .131, .07, [-.066, -.186, z - .224], (ctx, w, h) => {
    ctx.fillStyle = '#d9ded9'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#101718';
    ctx.textAlign = 'center'; ctx.font = `bold ${h * .42}px Arial`; ctx.fillText('KITO', w / 2, h * .46);
    ctx.font = `bold ${h * .27}px Arial`; ctx.fillText('2 t  ·  SHER2M', w / 2, h * .83);
  }, 'Monorriel', hoistLabel);
  nameplate.mesh.material.metalness = .36;
  nameplate.mesh.material.emissive.set('#bfc8bb');
  nameplate.mesh.material.emissiveMap = nameplate.texture;
  nameplate.mesh.material.emissiveIntensity = .12;

  // Running wheels stay at the CAD tangent contact coordinates; add hubs and cast side plates.
  for (const sign of [-1, 1]) {
    roundedHousing(hoist, .285, .02, .153, [0, sign * .095, z - .012], yellowDark, 'Monorriel', 'Placas laterales de la carretilla', .017);
    for (const x of [-C.wheel_pitch_m / 2, C.wheel_pitch_m / 2]) {
      const axisZ = C.running_surface_z_m + C.wheel_diameter_m / 2;
      cylinder(hoist, .028, .01, [x, sign * .068, axisZ], [0, 1, 0], steel, 'Monorriel', 'Cubo de rueda de la carretilla');
      cylinder(hoist, .012, .012, [x, sign * .078, axisZ], [0, 1, 0], bright, 'Monorriel', 'Tuerca de eje de rueda', true);
    }
  }

  // Pendant carries a real coiled cable, direction buttons and a mushroom stop.
  if (engine.controlCable) engine.controlCable.visible = false;
  for (const mesh of hoist.children) {
    if (mesh.geometry?.type === 'BoxGeometry' && Math.abs(mesh.position.x - .19) < .001 && Math.abs(mesh.position.z - 1.10) < .001) mesh.visible = false;
  }
  const pendant = new THREE.Group(); pendant.position.set(.19, -.06, 1.10); hoist.add(pendant);
  roundedHousing(pendant, .073, .045, .224, [0, 0, 0], yellow, 'Monorriel', 'Botonera colgante del tecle', .014);
  cylinder(pendant, .018, .016, [0, -.031, .070], [0, 1, 0], red, 'Monorriel', 'Parada de emergencia de la botonera');
  cylinder(pendant, .012, .009, [0, -.027, .014], [0, 1, 0], green, 'Monorriel', 'Mando de elevación');
  cylinder(pendant, .012, .009, [0, -.027, -.027], [0, 1, 0], black, 'Monorriel', 'Mando de descenso');
  cylinder(pendant, .010, .009, [0, -.027, -.070], [0, 1, 0], black, 'Monorriel', 'Mando de traslación');
  const coil = [];
  for (let i = 0; i <= 420; i++) {
    const t = i / 420, a = t * Math.PI * 2 * 42;
    coil.push([.19 + Math.cos(a) * .012, -.06 + Math.sin(a) * .012, 1.228 + (z - .45 - 1.228) * t]);
  }
  cable(hoist, coil, .0037, black, 'Monorriel', 'Cable espiral de la botonera', 420);
  cable(hoist, [[.19, -.06, z - .45], [.19, -.05, z - .38], [.13, -.02, z - .11]], .005, black, 'Monorriel', 'Entrada de cable y prensaestopa');

  // Commercial bumpers retain their model locations and nominal stroke envelopes.
  const rail = engine.group('Monorriel');
  for (const mesh of engine.parts) if (/^TOPE_TS75/.test(mesh.userData.part)) mesh.material = amber;
  for (const end of [-.2, 3.4]) for (const sy of [-1, 1]) {
    const dir = end < 0 ? 1 : -1, y = sy * .25, zz = 5.78;
    for (const shift of [.013, .024, .043, .059]) torus(rail, .0355 - shift * .08, .0016, [end + dir * shift, y, zz], [1, 0, 0], yellowDark, 'Monorriel', 'Amortiguador elastomérico TS75-39');
    cylinder(rail, .019, .004, [end - dir * .037, y, zz], [1, 0, 0], steel, 'Monorriel', 'Arandela de fijación del amortiguador');
    cylinder(rail, .012, .014, [end - dir * .046, y, zz], [1, 0, 0], bright, 'Monorriel', 'Tuerca de fijación del amortiguador', true);
  }

  // The corrugated DN150 hose starts at the actual CAD dust-capture port.
  const capture = engine.group('Tolva'), port = engine.data.static.find(m => m.tag === 'PUERTO_CAPTACION_REF');
  if (port) {
    const bb = new THREE.Box3().setFromPoints(port.v.map(v => new THREE.Vector3(...v)));
    const x = (bb.min.x + bb.max.x) / 2, zc = (bb.min.z + bb.max.z) / 2, y = bb.min.y;
    // Continue to the rear utility route; no open hose end in the operating aisle.
    const points = [[x, y, zc], [x, y - .19, zc], [x + .34, y - .29, zc],
      [3.86, y - .29, zc], [4.08, -1.15, zc], [4.08, .8, zc],
      [4.08, 1.8, zc], [3.90, 2.55, zc + .25], [3.90, 2.70, 3.45], [3.90, 2.70, 8.50]];
    const path = new THREE.CatmullRomCurve3(points.map(v => new THREE.Vector3(...v)));
    add(capture, new THREE.TubeGeometry(path, 160, .073, 16, false), pipeMat, [0, 0, 0], 'Tolva', 'Ducto flexible de captación DN150');
    const n = Math.ceil(path.getLength() / .025), ribs = new THREE.InstancedMesh(new THREE.TorusGeometry(.075, .0028, 5, 20), ribMat, n);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1); dummy.position.copy(path.getPointAt(t)); dummy.quaternion.setFromUnitVectors(Z, path.getTangentAt(t)); dummy.updateMatrix(); ribs.setMatrixAt(i, dummy.matrix);
    }
    ribs.castShadow = true; ribs.userData = { group: 'Tolva', part: 'Espiral de refuerzo del ducto DN150', equipmentDetail: true }; capture.add(ribs); engine.parts.push(ribs);
    for (const shift of [.015, .045]) {
      torus(capture, .076, .004, [x, y - shift, zc], [0, 1, 0], bright, 'Tolva', 'Abrazadera de conexión del ducto DN150');
      box(capture, [.026, .020, .010], [x, y - shift, zc + .077], steel, 'Tolva', 'Tensor de la abrazadera del ducto');
    }
    for (const height of [3.6, 5.8]) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (path.getPoint(mid).z < height) lo = mid; else hi = mid; }
      const t = (lo + hi) / 2;
      torus(capture, .076, .004, path.getPoint(t).toArray(), path.getTangent(t).toArray(), bright, 'Tolva', 'Unión del ducto de captación');
    }
  }

  // Existing engineering drive axis: X=2.65, Y=.4, Z=1.155 m, handwheel Ø250 mm.
  const mechanism = engine.group('Complementos'), wheel = new THREE.Group();
  mechanism.add(wheel); wheel.position.set(2.65, .4, 1.155);
  roundedHousing(mechanism, .09, .12, .12, [2.595, .4, 1.155], blue, 'Compuerta', 'Reductor manual de la compuerta');
  cylinder(mechanism, .0125, .12, [2.61, .4, 1.155], [1, 0, 0], steel, 'Compuerta', 'Eje del accionamiento de compuerta');
  torus(wheel, .119, .009, [.025, 0, 0], [1, 0, 0], dark, 'Compuerta', 'Volante de compuerta Ø250 mm');
  cylinder(wheel, .025, .04, [.025, 0, 0], [1, 0, 0], steel, 'Compuerta', 'Cubo del volante de compuerta');
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    cable(wheel, [[.025, 0, 0], [.025, Math.cos(a) * .065, Math.sin(a) * .065], [.025, Math.cos(a) * .115, Math.sin(a) * .115]], .006, dark, 'Compuerta', 'Radios del volante de compuerta', 8);
  }
  cylinder(wheel, .012, .056, [.058, .112, 0], [1, 0, 0], black, 'Compuerta', 'Empuñadura giratoria del volante');

  const rollers = engine.group('Rodillos');
  for (let i = 0; i < 10; i++) for (const sign of [-1, 1]) {
    const xx = H.center_x + sign * .301, yy = -.65 - i * .15;
    cylinder(rollers, .018, .018, [xx, yy, .315], [1, 0, 0], dark, 'Rodillos', 'Cojinete sellado de rodillo');
    cylinder(rollers, .008, .023, [xx + sign * .01, yy, .315], [1, 0, 0], bright, 'Rodillos', 'Eje de rodillo', true);
  }
  for (const sign of [-1, 1]) box(rollers, [.018, 1.63, .075], [H.center_x + sign * .308, -1.15, .284], blue, 'Rodillos', 'Larguero de transportador de rodillos');
  const screen = plate(rollers, .174, .081, [2.67, .160, .80], () => {}, 'Compuerta', 'Indicador digital de la balanza · kg');
  for (const [i, mat] of [[-1, black], [0, green], [1, black]]) cylinder(rollers, .008, .004, [2.67 + i * .041, .160, .748], [0, 1, 0], mat, 'Compuerta', ['Tara', 'Cero', 'Unidad'][i + 1]);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const xx = H.center_x + sx * .51, yy = sy * .51;
    cylinder(rollers, .028, .022, [xx, yy, .021], [0, 0, 1], black, 'Compuerta', 'Apoyo regulable de balanza');
    cylinder(rollers, .009, .024, [xx, yy, .042], [0, 0, 1], bright, 'Compuerta', 'Nivelación de la plataforma de pesaje', true);
  }
  cable(rollers, [[2.67, .20, .72], [2.67, .21, .23], [2.62, .37, .10], [2.84, .46, .06]], .006, black, 'Compuerta', 'Cable de celdas de carga de la balanza');

  if (engine.liftBellows) engine.liftBellows.visible = false;
  const bellows = new THREE.Group(); engine.liftRoot.add(bellows);
  for (let i = 0; i < 5; i++) {
    const ring = torus(bellows, .194, .015, [0, 0, .039 + i * .019], [0, 0, 1], black, 'Rodillos', 'Fuelle neumático de la mesa elevadora');
    ring.scale.x = .9;
  }
  cylinder(bellows, .18, .065, [0, 0, .076], [0, 0, 1], black, 'Rodillos', 'Fuelle neumático de la mesa elevadora');
  cable(engine.liftRoot, [[.18, .04, .075], [.28, .04, .06], [.36, .16, .055], [.38, .27, .08]], .008, black, 'Rodillos', 'Manguera de aire de la mesa elevadora');
  cylinder(engine.liftRoot, .015, .036, [.20, .04, .075], [1, 0, 0], bright, 'Rodillos', 'Racor de alimentación neumática');
  box(engine.liftRoot, [.085, .055, .065], [.36, .25, .087], dark, 'Rodillos', 'Válvula de mando de la mesa neumática');

  let lastWeight = NaN;
  return {
    update(state) {
      const kg = Math.round(Math.max(0, state.sackKg || 0) * 10) / 10;
      if (kg !== lastWeight) {
        lastWeight = kg; const { context: ctx, canvas, texture } = screen, w = canvas.width, h = canvas.height;
        ctx.fillStyle = '#10262b'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#9ce9ba';
        ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.font = `500 ${h * .65}px Consolas,monospace`;
        ctx.fillText(kg.toFixed(1), w * .76, h * .54); ctx.font = `${h * .26}px Arial`; ctx.fillText('kg', w * .96, h * .66);
        texture.needsUpdate = true;
      }
      wheel.rotation.x = -clamp(state.gateOpening || 0) * Math.PI * 2 * 8.913;
      bellows.scale.z = 1 + Math.max(0, engine.liftDeck.position.z - .14) / .11;
    }
  };
}
