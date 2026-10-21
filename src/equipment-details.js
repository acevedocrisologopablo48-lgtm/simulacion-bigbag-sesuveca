import * as THREE from '../assets/vendor/three.module.min.js';
import {buildCollector} from './collector.js?v=auto20261021-1fadb5c4d4e2';

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
  for (const reference of engine.data.static.filter(m => /^(REJILLA_PLATAFORMA_REF|REJILLA_APROXIMACION_.*|AC_REJILLA_PISO|AC_PELDANO_\d+|PELDANO_\d+_REF)$/.test(m.tag))) {
    const bbox = new THREE.Box3().setFromPoints(reference.v.map(v => new THREE.Vector3(...v)));
    const { min, max } = bbox, w = max.x - min.x, d = max.y - min.y, h = max.z - min.z;
    const parent = engine.group(reference.group), label = reference.group === 'Escalera' ? 'Peldaño de rejilla metálica antideslizante' : 'Piso de rejilla metálica galvanizada';
    for (const mesh of engine.parts) if (mesh.userData.part === reference.tag) mesh.visible = false;
    const topTriangles=reference.f.filter(f=>f.length===3&&f.every(i=>Math.abs(reference.v[i][2]-max.z)<.00002));
    const spansAt=(axis,value)=>{
      const other=1-axis,intervals=[];
      for(const f of topTriangles){
        const points=f.map(i=>reference.v[i]),crossings=[];
        for(let k=0;k<3;k++){
          const a=points[k],b=points[(k+1)%3],delta=b[axis]-a[axis];
          if(Math.abs(delta)<1e-10)continue;
          const t=(value-a[axis])/delta;if(t>=-1e-8&&t<=1+1e-8)crossings.push(a[other]+t*(b[other]-a[other]));
        }
        if(crossings.length>=2)intervals.push([Math.min(...crossings),Math.max(...crossings)]);
      }
      intervals.sort((a,b)=>a[0]-b[0]);const merged=[];
      for(const interval of intervals){const last=merged.at(-1);if(last&&interval[0]<=last[1]+.00002)last[1]=Math.max(last[1],interval[1]);else merged.push(interval);}
      return merged.filter(([a,b])=>b-a>.008).map(([a,b])=>[a+.003,b-.003]);
    };
    const positions = [], count = Math.max(2, Math.floor(w / .03) + 1);
    for (let i = 0; i < count; i++) {
      const xx=min.x+.003+(w-.006)*i/(count-1);
      for(const [a,b]of spansAt(0,xx))positions.push({p:[xx,(a+b)/2,(min.z+max.z)/2],s:[.004,b-a,h]});
    }
    const crossCount = Math.max(2, Math.floor(d / .10) + 1);
    for (let i = 0; i < crossCount; i++) {
      const yy=min.y+.004+(d-.008)*i/(crossCount-1);
      for(const [a,b]of spansAt(1,yy))positions.push({p:[(a+b)/2,yy,max.z-.004],s:[b-a,.005,.008]});
    }
    const bars = new THREE.InstancedMesh(boxGeo, galvanized, positions.length), transform = new THREE.Object3D();
    positions.forEach(({ p, s }, i) => { transform.position.set(...p); transform.scale.set(...s); transform.updateMatrix(); bars.setMatrixAt(i, transform.matrix); });
    bars.castShadow = bars.receiveShadow = true;
    bars.userData = { group: reference.group, part: label, equipmentDetail: true };
    parent.add(bars); engine.parts.push(bars);
    const border = reference.group === 'Escalera' ? blue : galvanized;
    for (const yy of [min.y + .003, max.y - .003]) for(const [a,b]of spansAt(1,yy))
      box(parent,[b-a,.003,h],[(a+b)/2,yy,(min.z+max.z)/2],border,reference.group,label);
    for (const xx of [min.x + .003, max.x - .003]) for(const [a,b]of spansAt(0,xx))
      box(parent,[.003,b-a,h],[xx,(a+b)/2,(min.z+max.z)/2],border,reference.group,label);
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

  engine.collector=buildCollector(engine);
  const capture=new THREE.Group();capture.name='Conexión tolva-colector';
  engine.group('Colector').add(capture);engine.collectorDuct=capture;
  const port = engine.data.static.find(m => m.tag === 'PUERTO_CAPTACION_REF');
  if (port) {
    const bb = new THREE.Box3().setFromPoints(port.v.map(v => new THREE.Vector3(...v)));
    const source = new THREE.Vector3((bb.min.x+bb.max.x)/2,(bb.min.y+bb.max.y)/2,bb.max.z);
    const zc=source.z+.25,end=[-.65,source.y-.15,zc];
    const arc3=(center,u,v)=>{
      const arc=new THREE.Curve();arc.getPoint=(t,target=new THREE.Vector3())=>target.copy(center)
        .addScaledVector(u,Math.cos(t*Math.PI/2)).addScaledVector(v,Math.sin(t*Math.PI/2));return arc;
    };
    const path=new THREE.CurvePath();
    path.add(new THREE.LineCurve3(source,source.clone().add(new THREE.Vector3(0,0,.10))));
    path.add(arc3(new THREE.Vector3(source.x-.15,source.y,source.z+.10),new THREE.Vector3(.15,0,0),new THREE.Vector3(0,0,.15)));
    path.add(new THREE.LineCurve3(new THREE.Vector3(source.x-.15,source.y,zc),new THREE.Vector3(-.50,source.y,zc)));
    path.add(arc3(new THREE.Vector3(-.50,source.y-.15,zc),new THREE.Vector3(0,.15,0),new THREE.Vector3(-.15,0,0)));
    add(capture, new THREE.TubeGeometry(path, 56, .073, 16, false), pipeMat, [0, 0, 0], 'Colector', 'Conexión flexible DN150 de la tolva');
    const n = Math.ceil(path.getLength() / .025), ribs = new THREE.InstancedMesh(new THREE.TorusGeometry(.075, .0028, 5, 20), ribMat, n);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1); dummy.position.copy(path.getPointAt(t)); dummy.quaternion.setFromUnitVectors(Z, path.getTangentAt(t)); dummy.updateMatrix(); ribs.setMatrixAt(i, dummy.matrix);
    }
    ribs.castShadow = true; ribs.userData = { group: 'Colector', part: 'Espiral de refuerzo del ducto DN150', equipmentDetail: true }; capture.add(ribs); engine.parts.push(ribs);
    for (const shift of [.010, .035]) {
      const point=source.clone().add(new THREE.Vector3(0,0,-shift));
      torus(capture, .076, .004, point.toArray(), [0,0,1], bright, 'Colector', 'Abrazadera de conexión del ducto DN150');
      box(capture, [.026, .020, .010], [point.x,point.y-.077,point.z], steel, 'Colector', 'Tensor de la abrazadera del ducto');
    }
    const inlet=engine.collector.inlet;
    const corners=[new THREE.Vector3(...end),new THREE.Vector3(-.65,-1.68,zc),new THREE.Vector3(inlet.x,-1.68,zc),new THREE.Vector3(inlet.x,-1.68,inlet.z),inlet];
    const rigidPath=new THREE.CurvePath();let previous=corners[0];
    for(let i=1;i<corners.length-1;i++){
      const p=corners[i],before=corners[i-1],after=corners[i+1];
      const cut=Math.min(.20,p.distanceTo(before)*.4,p.distanceTo(after)*.4);
      const enter=p.clone().add(before.clone().sub(p).normalize().multiplyScalar(cut));
      const leave=p.clone().add(after.clone().sub(p).normalize().multiplyScalar(cut));
      rigidPath.add(new THREE.LineCurve3(previous,enter));
      rigidPath.add(new THREE.QuadraticBezierCurve3(enter,p,leave));previous=leave;
    }
    rigidPath.add(new THREE.LineCurve3(previous,inlet));
    const duct=add(capture,new THREE.TubeGeometry(rigidPath,128,.075,20,false),galvanized,[0,0,0],'Colector','Ducto rígido DN150 al colector');
    duct.userData.endpoints=[end,inlet.toArray()];
    engine.collector.connection={source:source.toArray(),sourceAxis:[0,0,1],flexibleEnd:end,inlet:inlet.toArray(),flexibleLengthM:path.getLength(),rigidLengthM:rigidPath.getLength()};
    for(const [point,axis]of[[end,[0,1,0]],[inlet.toArray(),[0,1,0]]])
      torus(capture,.079,.005,point,axis,bright,'Colector','Abrazadera de unión DN150');
    const xx=-.90,yy=-1.05,armZ=zc-.105,postTop=zc-.075;
    box(capture,[.20,.20,.02],[xx,yy,-.02],blue,'Colector','Placa de soporte de ducto 200 × 200 × 20 mm');
    for(const dx of [-.065,.065])for(const dy of [-.065,.065])
      cylinder(capture,.008,.025,[xx+dx,yy+dy,0],[0,0,1],bright,'Colector','Fijación M16 del soporte del ducto');
    box(capture,[.08,.08,postTop+.01],[xx,yy,(postTop-.01)/2],blue,'Colector','Poste tubular 80 × 80 × 4 mm');
    box(capture,[.06,.63,.06],[xx,-1.365,armZ],blue,'Colector','Brazo tubular 60 × 60 × 4 mm');
    for(const dx of [-.028,.028]){
      const triangle=new THREE.Shape();triangle.moveTo(0,0);triangle.lineTo(-.15,0);triangle.lineTo(0,-.15);triangle.closePath();
      const geo=new THREE.ExtrudeGeometry(triangle,{depth:.006,bevelEnabled:false});
      // Local plane becomes Y/Z; two root plates brace the cantilever.
      geo.applyMatrix4(new THREE.Matrix4().set(0,0,1,0,1,0,0,0,0,1,0,0,0,0,0,1));
      add(capture,geo,blue,[xx+dx,yy,armZ-.03],'Colector','Cartela triangular 150 × 150 × 6 mm');
    }
    torus(capture,.079,.005,[xx,-1.68,zc],[1,0,0],bright,'Colector','Abrazadera de soporte del ducto');

  }

  const rollers = engine.group('Rodillos');
  for (let i = 0; i < 10; i++) for (const sign of [-1, 1]) {
    const xx = H.center_x + sign * .301, yy = -.65 - i * .15;
    cylinder(rollers, .018, .018, [xx, yy, .315], [1, 0, 0], dark, 'Rodillos', 'Cojinete sellado de rodillo');
    cylinder(rollers, .008, .023, [xx + sign * .01, yy, .315], [1, 0, 0], bright, 'Rodillos', 'Eje de rodillo', true);
  }
  for (const sign of [-1, 1]) box(rollers, [.018, 1.705, .075], [H.center_x + sign * .308, -1.1875, .284], blue, 'Rodillos', 'Larguero de transportador de rodillos');
  const screen = plate(rollers, .174, .081, [H.center_x-.32, .160, .80], () => {}, 'Compuerta', 'Indicador digital de la balanza · kg');
  for (const [i, mat] of [[-1, black], [0, green], [1, black]]) cylinder(rollers, .008, .004, [H.center_x-.32 + i * .041, .160, .748], [0, 1, 0], mat, 'Compuerta', ['Tara', 'Cero', 'Unidad'][i + 1]);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const xx = H.center_x + sx * .51, yy = sy * .51;
    cylinder(rollers, .028, .022, [xx, yy, .021], [0, 0, 1], black, 'Compuerta', 'Apoyo regulable de balanza');
    cylinder(rollers, .009, .024, [xx, yy, .042], [0, 0, 1], bright, 'Compuerta', 'Nivelación de la plataforma de pesaje', true);
  }
  cable(rollers, [[H.center_x-.32, .20, .72], [H.center_x-.32, .21, .23], [H.center_x-.27, .37, .10], [H.center_x-.49, .46, .06]], .006, black, 'Compuerta', 'Cable de celdas de carga de la balanza');

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
      bellows.scale.z = 1 + Math.max(0, engine.liftDeck.position.z - .14) / .11;
    }
  };
}
