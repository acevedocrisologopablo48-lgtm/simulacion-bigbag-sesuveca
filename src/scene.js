import * as THREE from '../assets/vendor/three.module.min.js';
import { OrbitControls } from '../assets/vendor/OrbitControls.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
const lerp = (a, b, t) => a + (b - a) * t;
const UP = new THREE.Vector3(0, 0, 1);
const groupNames = {
  Cimentacion: 'Cimentación y anclajes', Porticos: 'Pórticos y arriostres', Monorriel: 'Monorriel y carro', Tolva: 'Tolva de 2,30 m³',
  'Soporte bolsa': 'Apoyo del bigbag', Cruceta: 'Cruceta de cuatro puntos', Plataforma: 'Plataforma lateral',
  Escalera: 'Escalera de acceso', Barandas: 'Barandas y guardas', Compuerta: 'Compuerta y ensacado',
  Complementos: 'Uniones y complementos', Accesorios: 'Accesorios', Bigbag: 'Bigbag de proceso · 1 t',
  Montacargas: 'Montacargas de abastecimiento', Operarios: 'Operación y amarre', Rodillos: 'Mesa elevadora y rodillos'
};
const groupIds = {Cimentacion:'cimentacion',Porticos:'porticos',Monorriel:'monorriel',Tolva:'tolva','Soporte bolsa':'soporte-bolsa',Cruceta:'cruceta',Plataforma:'plataforma',Escalera:'escalera',Barandas:'barandas',Complementos:'complementos',Accesorios:'complementos',Compuerta:'complementos',Rodillos:'complementos',Bigbag:'soporte-bolsa',Montacargas:'porticos',Operarios:'complementos'};
const canonicalGroup = id => Object.keys(groupIds).find(k => groupIds[k] === id) || id;

// The progress bar is a process diagram. Mass transfer is conservative; it is not a flow solver.
export function processState(progress, payload = 1000, bagSize = 50, mode = 'closed', data) {
  const p = clamp(Number(progress) || 0), C = data.config, stages = data.stages;
  const index = Math.min(stages.findIndex(s => p < s.b) < 0 ? stages.length - 1 : stages.findIndex(s => p < s.b), stages.length - 1);
  const stage = stages[index], q = clamp((p - stage.a) / (stage.b - stage.a));
  payload = clamp(Number(payload) || 0, 0, 1000);
  const count = payload > 0 ? Math.ceil(payload / bagSize) : 0;
  let x = C.pickup_x, z = C.pickup_bottom, bigbagKg = payload, hopperKg = 0;
  let sackKg = 0, finishedKg = 0, completedSacks = 0, transfer = 0, gate = 0, cyclePhase = stage.id;
  let cycleProgress = q;
  if (index === 2) z = lerp(C.pickup_bottom, C.travel_bottom, smooth(q));
  if (index === 3) { z = C.travel_bottom; x = lerp(C.pickup_x, C.discharge_x, smooth(q)); }
  if (index >= 4) { x = C.discharge_x; z = C.support_z; }
  if (index === 4) z = q < .08 ? C.travel_bottom : lerp(C.travel_bottom, C.support_z, smooth((q-.08)/.92));
  if (index === 5) { bigbagKg = payload * (1 - q); hopperKg = payload * q; }
  if (index >= 6) { bigbagKg = 0; hopperKg = payload; }
  const first = Math.min(payload, bagSize);
  if (index === 6) { sackKg = first * smooth(q); hopperKg -= sackKg; gate = q < .88 ? 1 : (1 - q) / .12; }
  if (index === 7) { sackKg = first; hopperKg -= sackKg; }
  if (index === 8 && count) {
    if (q < .055) {
      sackKg = first; hopperKg -= sackKg; transfer = smooth(q / .055);
      cyclePhase = 'salida'; cycleProgress = q / .055;
    } else if (count === 1) {
      finishedKg = payload; completedSacks = 1; hopperKg = 0; transfer = 1;
    } else {
      const cycles = count - 1, v = clamp((q - .055) / .945) * cycles;
      const j = Math.min(cycles - 1, Math.floor(v)), u = p >= .94 ? 1 : v - j;
      completedSacks = 1 + j; finishedKg = Math.min(payload, completedSacks * bagSize);
      const currentTarget = Math.min(bagSize, payload - finishedKg);
      if (u < .62) { cyclePhase = 'llenado'; cycleProgress = u / .62; sackKg = currentTarget * smooth(cycleProgress); gate = cycleProgress < .90 ? 1 : (1 - cycleProgress) / .1; }
      else if (u < .78) { cyclePhase = 'amarre'; cycleProgress = (u - .62) / .16; sackKg = currentTarget; }
      else { cyclePhase = 'salida'; cycleProgress = (u - .78) / .22; sackKg = currentTarget; transfer = smooth(cycleProgress); }
      hopperKg = Math.max(0, payload - finishedKg - sackKg);
    }
  }
  if (index === 9) {
    finishedKg = payload; completedSacks = count; hopperKg = 0;
    z = q < .24 ? lerp(C.support_z, C.travel_bottom, smooth(q / .24)) :
      q > .82 ? lerp(C.travel_bottom, C.pickup_bottom, smooth((q - .82) / .18)) : C.travel_bottom;
    x = q < .24 ? C.discharge_x : lerp(C.discharge_x, C.pickup_x, smooth((q - .24) / .58));
  }
  const carriageLocked = (index >= 4 && index < 9) || (index === 9 && q < .24);
  const lockingPin = carriageLocked && (index !== 4 || q >= .08);
  const hoistEnabled = index < 4 || (index === 4 && lockingPin) || index === 9;
  const interlockState = index === 9 && q < .24 ? 'Retorno vertical · carro bloqueado y pasador insertado' :
    index === 9 ? 'Cortador despejado · pasador retirado y traslado habilitado' :
    index >= 5 && index < 9 ? 'Descarga · carro bloqueado, pasador insertado e izaje inhibido' :
    index === 4 ? (lockingPin ? 'Apoyo · pasador insertado y descenso controlado' : 'Posición de descarga · traslación inhibida') :
    'Recepción y traslado · zona de descarga sin habilitar';
  return { progress: p, phaseIndex: index, phase: stage.name, phaseId: stage.id, phaseProgress: q,
    detail: index === 5 ? (mode === 'spout' ? 'Alternativa de manga: cortador retirado del módulo antes del ciclo.' : 'Corte por descenso sobre cuatro filos fijos AISI 304 dentro del recinto.') : stage.detail,
    cyclePhase, cycleProgress, bigbagKg, hopperKg, sackKg, finishedKg, completedSacks,
    totalSacks: count, sackNumber: count ? Math.min(count, completedSacks + 1) : 0,
    hopperM3: hopperKg / (data.densityKgM3 || 550), bagBottomM: z, hookM: z + (C.bag_height || 1) + C.headpack,
    carriageM: x - C.pickup_x, x, z, transfer, gateOpening: clamp(gate),
    mode, bagSize, payload, runningFlow: (index === 5 && q > 0 && q < 1) || gate > .01,
    carriageLocked, lockingPin, hoistEnabled, interlockState,
    massBalanceKg: bigbagKg + hopperKg + sackKg + finishedKg };
}

let active = null;
export const BigbagScene = {
  async init(container, onSelect) {
    if (active) active.dispose();
    const response = await fetch(new URL('../data/model.json?v=eb-solid-755af84f39e0', import.meta.url));
    if (!response.ok) throw new Error('No se pudo cargar la geometría P05.');
    active = new SceneEngine(container, await response.json(), onSelect);
    return BigbagScene;
  },
  setProgress(v) { return active?.setProgress(v); },
  setView(name) { active?.setView(name); }, resetCamera() { active?.resetCamera(); },
  setEdges(v) { active?.setEdges(v); }, setSection(v) { active?.setSection(v); },
  setDimensions(v) { active?.setDimensions(v); }, setExploded(v) { active?.setExploded(v); },
  highlight(id) { active?.highlight(id); },
  setMode(v) { active?.setMode(v); }, setBagSize(v) { active?.setBagSize(v); },
  setPayload(v) { active?.setPayload(v); }, getState() { return active?.getState(); },
  resize() { active?.resize(); }, toggleFullscreen() { return active?.toggleFullscreen(); },
  dispose() { active?.dispose(); active = null; }
};
window.BigbagScene = BigbagScene;

class SceneEngine {
  constructor(container, data, onSelect) {
    this.container = container; this.data = data; this.onSelect = onSelect;
    this.progress = 0; this.payload = 1000; this.bagSize = 50; this.mode = 'closed';
    this.edgesOn = true; this.section = false; this.exploded = false; this.selected = null;
    this.parts = []; this.groupRoots = new Map(); this.edgeLines = []; this.sectionMeshes = [];
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#edf2f4');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.setAttribute('aria-label', 'Modelo 3D P05. Arrastrar para girar, rueda para acercar y clic para identificar.');
    this.renderer.domElement.setAttribute('role', 'img'); this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline-offset:-4px;';
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera(-5, 5, 4, -4, .02, 100);
    this.camera.up.copy(UP); this.camera.position.set(9, -12, 8);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(1.15, -.05, 2.45); this.controls.enableDamping = false;
    this.controls.minZoom = .45; this.controls.maxZoom = 5;
    this.controls.maxPolarAngle = Math.PI * .49;
    this.controls.addEventListener('change', () => this.render());
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x738697, 2.3));
    const light = new THREE.DirectionalLight(0xffffff, 3.0);
    light.position.set(-3, -5, 11); light.castShadow = true;
    Object.assign(light.shadow.camera, { left: -6, right: 7, top: 7, bottom: -7, near: .5, far: 24 });
    light.shadow.mapSize.set(2048, 2048); light.shadow.bias = -.0003; light.shadow.normalBias = .02;
    light.target.position.set(1, 0, 2); this.scene.add(light, light.target);
    const fill = new THREE.DirectionalLight(0xd6e9ff, 1.5); fill.position.set(6, 6, 7); this.scene.add(fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: '#edf2f3', roughness: 1 }));
    ground.position.z = -.027; ground.receiveShadow = true; this.scene.add(ground);
    const grid = new THREE.GridHelper(22, 44, 0xcbd7dc, 0xdce5e8); grid.rotation.x = Math.PI / 2; grid.position.z = -.023;
    grid.material.transparent = true; grid.material.opacity = .65; this.scene.add(grid);
    this.model = new THREE.Group(); this.scene.add(this.model);
    this.cutterMeshes = []; this.spoutMeshes = [];
    data.static.forEach(m => {
      if (m.tag === 'pallet_referencia' || m.tag === 'balanza_envolvente' || /^BALANZA_|^MESA_/i.test(m.tag)) return;
      const mesh = this.addDataMesh(m, this.group(m.group));
      if (/^TOL_PANEL|^TOL_TAPA_POLVO|^LINER_|^TOL_GUARDA|^GUARDA_CORTE/.test(m.tag)) this.sectionMeshes.push(mesh);
      if (/^CORTE_/.test(m.tag)) this.cutterMeshes.push(mesh);
      if (/^LINER_|^TOL_GUARDA|^GUARDA_CORTE/.test(m.tag)) this.sectionMeshes.push(mesh);
    });
    this.buildHopper(); this.buildBag(); this.buildHoist(); this.buildScaleAndRollers();
    this.buildForklift(); this.buildOperators(); this.buildFlow(); this.buildDimensions();
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.pointerDown = e => { this.clickOrigin = [e.clientX, e.clientY]; };
    this.pointerUp = e => {
      if (!this.clickOrigin || Math.hypot(e.clientX - this.clickOrigin[0], e.clientY - this.clickOrigin[1]) > 5) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.parts, false).find(h => h.object.visible && this.parentsVisible(h.object));
      if (hit) { const d = hit.object.userData; this.highlight(d.group); this.onSelect?.({ id: groupIds[d.group] || d.group, groupId: groupIds[d.group] || d.group, label: groupNames[d.group] || d.group, name: groupNames[d.group] || d.group, part: d.part }); }
      else { this.highlight(null); this.onSelect?.(null); }
    };
    this.keydown = e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
      e.preventDefault(); if (e.key === 'Home') return this.resetCamera();
      const v = this.camera.position.clone().sub(this.controls.target);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') v.applyAxisAngle(UP, e.key === 'ArrowLeft' ? -.1 : .1);
      else v.z = clamp(v.z + (e.key === 'ArrowUp' ? .5 : -.5), .1, 18);
      this.camera.position.copy(this.controls.target).add(v); this.controls.update(); this.render();
    };
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
    this.renderer.domElement.addEventListener('keydown', this.keydown);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container);
    this.resize(); this.setProgress(0); this.resetCamera();
  }
  parentsVisible(obj) { for (let p = obj; p; p = p.parent) if (!p.visible) return false; return true; }
  group(id) {
    if (!this.groupRoots.has(id)) {
      const group = new THREE.Group(); group.name = id; this.model.add(group); this.groupRoots.set(id, group);
    }
    return this.groupRoots.get(id);
  }
  material(color, options = {}) {
    return new THREE.MeshStandardMaterial({ color: Array.isArray(color) ? new THREE.Color(...color.map(v => v / 255)).convertSRGBToLinear() : color,
      roughness: .58, metalness: .3, side: THREE.DoubleSide, ...options });
  }
  geometry(m) {
    const positions = [];
    for (const face of m.f) {
      let triangles;
      if (face.length === 3) triangles = [[0, 1, 2]];
      else {
        const a = new THREE.Vector3(...m.v[face[0]]), b = new THREE.Vector3(...m.v[face[1]]), c = new THREE.Vector3(...m.v[face[2]]);
        const n = b.sub(a).cross(c.sub(a)), ax = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
        const drop = ax.indexOf(Math.max(...ax)), axes = [0, 1, 2].filter(i => i !== drop);
        triangles = THREE.ShapeUtils.triangulateShape(face.map(i => new THREE.Vector2(m.v[i][axes[0]], m.v[i][axes[1]])), []);
      }
      for (const t of triangles) for (const j of t) positions.push(...m.v[face[j]]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.computeVertexNormals(); return g;
  }
  addDataMesh(m, parent) {
    const mesh = new THREE.Mesh(this.geometry(m), this.material(m.c)); parent.add(mesh);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { group: m.group || parent.name, part: m.tag || parent.name };
    this.parts.push(mesh);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), new THREE.LineBasicMaterial({ color: 0x203a4a, transparent: true, opacity: .27 }));
    edge.renderOrder = 1; mesh.add(edge); this.edgeLines.push(edge); return mesh;
  }
  box(parent, w, d, h, x, y, z, color, group, options) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), this.material(color, options));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    if (group) { mesh.userData = { group, part: groupNames[group] || group }; this.parts.push(mesh); }
    return mesh;
  }
  cylinder(parent, radius, length, x, y, z, color, group, options = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 20, 1, options.openEnded || false), this.material(color, options));
    mesh.rotation.x = Math.PI / 2; mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh);
    if (group) { mesh.userData = { group, part: groupNames[group] || group }; this.parts.push(mesh); } return mesh;
  }
  tube(parent, points, radius, color, group) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 6, false), this.material(color)); parent.add(mesh);
    mesh.castShadow = true; if (group) { mesh.userData = { group, part: groupNames[group] || group }; this.parts.push(mesh); } return mesh;
  }
  buildHopper() {
    const H = this.data.hopper, square = (z, w) => [[H.center_x-w/2,-w/2,z],[H.center_x+w/2,-w/2,z],[H.center_x+w/2,w/2,z],[H.center_x-w/2,w/2,z]];
    const faces = [0, 4].flatMap(j => [0, 1, 2, 3].map(i => [j+i,j+(i+1)%4,j+(i+1)%4+4,j+i+4]));
    const liner = H.liner_thickness_m || .01, shell = H.shell_thickness_m || .006;
    const outside = 2 * (liner + shell);
    if (!this.data.exactCAD) {
    this.hopper = this.addDataMesh({ v: [...square(H.outlet_z,H.outlet_width+outside),...square(H.outlet_z+H.cone_height,H.mouth_width+outside),...square(H.mouth_z,H.mouth_width+outside)], f: faces, c: [59,98,120], tag: 'TOL-01', group: 'Tolva' }, this.group('Tolva'));
    this.sectionMeshes.push(this.hopper);
    if (!this.data.static.some(m => /^LINER_/.test(m.tag))) {
      const lining = this.addDataMesh({v:[...square(H.outlet_z,H.outlet_width),...square(H.outlet_z+H.cone_height,H.mouth_width),...square(H.mouth_z,H.mouth_width)],f:faces,c:[75,94,86],tag:'UHMWPE disipativo 10 mm',group:'Tolva'},this.group('Tolva'));
      this.sectionMeshes.push(lining);
    }
    }
    this.coal = new THREE.Mesh(new THREE.BufferGeometry(), this.material('#242a2d', { roughness: 1, metalness: 0 })); this.group('Tolva').add(this.coal);
    const connection = this.group('Tolva');
    if (!this.data.exactCAD) {
    const dustZ = H.mouth_z - .15;
    const duct = this.cylinder(connection, .075, .24, H.center_x, -.925, dustZ, '#547b90', 'Tolva', { openEnded: true }); duct.rotation.x = 0;
    const flange = this.cylinder(connection, .105, .02, H.center_x, -1.05, dustZ, '#2d5266', 'Tolva', { openEnded: true }); flange.rotation.x = 0;
    const dustTube = this.tube(connection,[[H.center_x,-1.06,dustZ],[H.center_x,-1.38,dustZ],[H.center_x+.7,-1.52,1.65],[H.center_x+1.25,-1.52,1.65]],.075,'#76888d','Tolva');
    dustTube.userData.part='Conexión DN150 · 800 m³/h @ 1 500 Pa';
    }
    this.boot = this.cylinder(connection, .128, H.bag_support_z - H.mouth_z, H.center_x, 0, (H.bag_support_z+H.mouth_z)/2, '#47555e', 'Tolva', { roughness: 1, metalness: 0, openEnded: true });
    for (let i = 0; i < 10; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.13,.006,6,32), this.material('#65757e'));
      ring.position.set(H.center_x,0,H.mouth_z+.025+i*.03); connection.add(ring);
    }
    this.closedGuard = new THREE.Group(); connection.add(this.closedGuard);
    const guardTop = this.data.config.guard_top_m || 3.43, guardBase=H.bag_support_z;
    if (!this.data.exactCAD) {
    for(const y of [-.64,.64]) {
      const panel=this.box(this.closedGuard,1.32,.012,guardTop-guardBase,H.center_x,y,(guardTop+guardBase)/2,'#6c9aaa','Tolva',{transparent:true,opacity:.18,depthWrite:false});
      this.sectionMeshes.push(panel);
    }
    for(const x of [H.center_x-.66,H.center_x+.66]) {
      const panel=this.box(this.closedGuard,.012,1.28,guardTop-guardBase,x,0,(guardTop+guardBase)/2,'#6c9aaa','Tolva',{transparent:true,opacity:.18,depthWrite:false});
      this.sectionMeshes.push(panel);
    }
    }
    this.interlockLamp=this.box(connection,.10,.06,.07,H.center_x-.72,-.69,guardTop-.08,'#dfad33','Tolva');
    this.interlockLamp.userData.part='Indicador ilustrativo de enclavamiento';
    this.gate = new THREE.Group(); this.gate.name = 'Compuerta'; this.model.add(this.gate);
    (this.data.gate_blade || []).forEach(m => this.addDataMesh({ ...m, group: 'Compuerta' }, this.gate));
    if (!this.data.exactCAD) {
    this.box(this.group('Compuerta'),.38,.31,.07,H.center_x,0,1.07,'#557e93','Compuerta');
    this.cylinder(this.group('Compuerta'),.13,.18,H.center_x,0,.955,'#a5b1b7','Compuerta',{openEnded:true});
    }
  }
  clothMaterial() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const c = canvas.getContext('2d'); c.fillStyle = '#e8e9e1'; c.fillRect(0,0,128,128);
    for (let i=0;i<128;i+=4) { c.fillStyle = i%8 ? '#e2e4db' : '#f4f5ed'; c.fillRect(i,0,1,128); c.fillRect(0,i,128,1); }
    const tex = new THREE.CanvasTexture(canvas); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3,3); tex.colorSpace = THREE.SRGBColorSpace;
    return this.material('#f5f4ea',{map:tex,roughness:.95,metalness:0});
  }
  roundedBagGeometry(width=.98,height=1) {
    const vs=[], ids=[], n=40, rings=9;
    for(let j=0;j<rings;j++){const h=j/(rings-1),bulge=.92+.08*Math.sin(Math.PI*h);
      for(let i=0;i<n;i++){const a=i/n*Math.PI*2,co=Math.cos(a),si=Math.sin(a),fold=1+.012*Math.sin(i*2.4+j*.7);
        vs.push(width/2*Math.sign(co)*Math.abs(co)**.25*bulge*fold,width/2*Math.sign(si)*Math.abs(si)**.25*bulge*fold,h*height);}}
    for(let j=0;j<rings-1;j++)for(let i=0;i<n;i++){const a=j*n+i,b=j*n+(i+1)%n,c=(j+1)*n+(i+1)%n,d=(j+1)*n+i;ids.push(a,b,d,b,c,d);}
    for(let i=1;i<n-1;i++)ids.push(0,i+1,i,(rings-1)*n,(rings-1)*n+i,(rings-1)*n+i+1);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vs,3));geo.setIndex(ids);geo.computeVertexNormals();
    const uv=[];for(let j=0;j<rings;j++)for(let i=0;i<n;i++)uv.push(i/n,j/(rings-1));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return geo;
  }
  buildBag() {
    this.bagRoot = new THREE.Group(); this.bagRoot.name = 'Bigbag'; this.model.add(this.bagRoot);
    this.bag = new THREE.Mesh(this.roundedBagGeometry(),this.clothMaterial());this.bagRoot.add(this.bag);this.bag.castShadow=true;
    this.bag.userData={group:'Bigbag',part:'Bigbag 1 × 1 × 1 m'};this.parts.push(this.bag);this.sectionMeshes.push(this.bag);
    const seamColor = '#acb8bb';
    for(const x of [-.425,.425])for(const y of [-.50,.50]) {
      this.tube(this.bagRoot,[[x,y,.95],[x*1.02,y,.99],[x,y*.99,1.063],[x,y*.86,1.07],[x,y*.84,1.0]],.016,'#d1d8d5','Bigbag');
      this.tube(this.bagRoot,[[x,y,.04],[x*1.02,y*.98,.45],[x,y,.96]],.005,seamColor);
    }
    const stripe=this.box(this.bagRoot,.35,.004,.13,0,-.492,.54,'#235d80','Bigbag');stripe.material.roughness=1;
    this.crucetaRoot=new THREE.Group();this.crucetaRoot.name='Cruceta';this.model.add(this.crucetaRoot);
    this.data.cruceta.forEach(m=>this.addDataMesh({...m,group:'Cruceta'},this.crucetaRoot));
    this.slingRoot=new THREE.Group();this.bagRoot.add(this.slingRoot);
    for(const x of [-.425,.425])for(const y of [-.5,.5]) this.tube(this.slingRoot,[[x,y,1.04],[x,y,1.075],[x,y,1.11]],.011,'#e9b834','Cruceta');
    this.pallet = new THREE.Group(); this.pallet.name='pallet'; this.model.add(this.pallet);
    for(const y of [-.43,0,.43])this.box(this.pallet,1.1,.13,.10,0,y,.05,'#91764e');
    for(let i=0;i<7;i++)this.box(this.pallet,.13,1.1,.05,-.48+i*.16,0,.125,'#b09165');
    this.pallet.position.x=this.data.config.pickup_x;
  }
  buildHoist() {
    this.hoist=new THREE.Group();this.hoist.name='Monorriel';this.model.add(this.hoist);
    const z=this.data.config.beam_bottom;
    const headroom=this.data.config.hoist_headroom || .475;
    if (this.data.exactCAD) {
      this.data.hoistMeshes.forEach(m=>this.addDataMesh({...m,group:'Monorriel'},this.hoist));
      this.lockPin=new THREE.Group();this.group('Monorriel').add(this.lockPin);
      this.data.lockPinMeshes.forEach(m=>this.addDataMesh({...m,group:'Monorriel'},this.lockPin));
    } else {
    this.box(this.hoist,.46,.30,.25,0,.22,z-.15,'#156087','Monorriel');
    this.cylinder(this.hoist,.11,.48,0,.23,z-.15,'#1f7297','Monorriel').rotation.x=0;
    this.box(this.hoist,.30,.10,.24,0,-.19,z-.15,'#223e50','Monorriel');
    for(const x of [-.12,.12])for(const y of [-.10,.10]){
      const wheel=this.cylinder(this.hoist,.052,.045,x,y,z+.042,'#677c88','Monorriel');wheel.rotation.x=0;
      this.box(this.hoist,.06,.025,.17,x,y*1.42,z-.028,'#2b5268','Monorriel');
    }
    this.lockPin=this.cylinder(this.group('Monorriel'),.016,.22,this.data.config.discharge_x,.14,z+.075,'#e3b72d','Monorriel');this.lockPin.rotation.x=0;
    this.lockPin.userData.part='Pasador cautivo de inmovilización del carro';
    for(const x of [.12,3.08]) {
      this.box(this.group('Monorriel'),.05,.20,.17,x,0,z+.04,'#5d7480','Monorriel');
      const bumper=this.box(this.group('Monorriel'),.065,.16,.12,x+(x<1?.06:-.06),0,z+.04,'#26383f','Monorriel');
      bumper.userData.part='Amortiguador de goma en fin de carrera';
    }
    }
    this.chain=new THREE.Group();this.model.add(this.chain);
    this.chainLine=this.cylinder(this.chain,.009,1,0,0,0,'#293940','Monorriel');
    this.chainLine2=this.cylinder(this.chain,.009,1,.035,0,0,'#43545c','Monorriel');
    this.hook=new THREE.Mesh(new THREE.TorusGeometry(.055,.014,8,20,Math.PI*1.6),this.material('#b4a663'));
    this.hook.rotation.x=Math.PI/2;this.chain.add(this.hook);
    this.controlCable=this.tube(this.hoist,[[.16,-.06,z-headroom+.08],[.19,-.06,1.7],[.19,-.06,1.15]],.005,'#293f49');
    this.box(this.hoist,.07,.05,.22,.19,-.06,1.10,'#e0b42f','Monorriel');
  }
  buildScaleAndRollers() {
    const g=this.group('Rodillos'), x=this.data.hopper.center_x;
    this.box(g,1.20,1.20,.12,x,0,.075,'#2d657f','Compuerta');
    this.scaleDeck=this.box(g,1.20,1.20,.025,x,0,.15,'#a0afb5','Compuerta');
    this.scaleDeck.userData.part='Balanza 1 200 × 1 200 mm · capacidad 2 t';
    this.liftRoot=new THREE.Group();g.add(this.liftRoot);this.liftRoot.position.set(x,0,.01);
    this.liftBellows=this.box(this.liftRoot,.40,.44,.07,0,0,.07,'#3d5a6a','Rodillos');
    this.liftDeck=this.box(this.liftRoot,.62,.62,.025,0,0,.14,'#738b97','Rodillos');
    this.scissorArms=[];
    for(const y of [-.22,.22])for(const sign of [-1,1]) {
      const arm=this.box(this.liftRoot,.49,.035,.025,0,y,.10,'#dda921','Rodillos');
      arm.rotation.y=sign*.35;this.scissorArms.push([arm,sign]);
    }
    this.box(g,.035,.04,.72,2.67,.20,.40,'#315b72','Compuerta');
    this.box(g,.23,.065,.15,2.67,.20,.79,'#173e55','Compuerta');
    this.box(g,.16,.005,.075,2.67,.163,.80,'#7ca6ad');
    this.sack=new THREE.Group();this.sack.name='Compuerta';this.model.add(this.sack);
    this.sackBody=new THREE.Mesh(this.roundedBagGeometry(.40,.70),this.clothMaterial());this.sack.add(this.sackBody);this.sackBody.castShadow=true;
    this.sackBody.userData={group:'Compuerta',part:'Saco de producto'};this.parts.push(this.sackBody);this.sectionMeshes.push(this.sackBody);
    this.tie=new THREE.Mesh(new THREE.TorusGeometry(.042,.008,6,24),this.material('#b9a36d'));this.tie.position.z=.68;this.sack.add(this.tie);
    this.rollerStart={x,y:-.63,z:.35};
    this.box(g,.64,1.65,.06,x,-1.15,.285,'#2d607c','Rodillos');
    for(let i=0;i<10;i++){const roll=this.cylinder(g,.035,.58,x,-.65-i*.15,.315,'#9dadb4','Rodillos');roll.rotation.x=0;roll.rotation.z=Math.PI/2;}
    for(const x of [2.12,2.58])for(const y of [-.5,-1.8]){
      this.box(g,.04,.045,.28,x,y,.14,'#365e71','Rodillos');
      this.tube(g,[[x,-.50,.16],[x,-1.77,.28]],.018,'#3e728b','Rodillos');
    }
    this.output=new THREE.Group();this.model.add(this.output);
    this.box(this.output,1.1,1.05,.12,0,0,.06,'#a1845b');
    this.output.position.set(3.55,-1.8,0);
    this.finishedBags=[];
    for(let i=0;i<12;i++){
      const sack=new THREE.Mesh(this.roundedBagGeometry(.38,.48),this.clothMaterial());
      sack.position.set((i%3-1)*.34,(Math.floor(i/3)%2-.5)*.4,.13+Math.floor(i/6)*.43);
      sack.castShadow=true;this.output.add(sack);this.finishedBags.push(sack);
    }
  }
  buildForklift() {
    this.forklift=new THREE.Group();this.model.add(this.forklift);const f=this.forklift;
    this.box(f,1.04,1.40,.53,0,-.8,.46,'#dba829','Montacargas');
    this.box(f,.90,.44,.65,0,-1.22,.66,'#dba829','Montacargas');
    this.box(f,.60,.65,.13,0,-.55,.78,'#253b45','Montacargas');
    this.box(f,.6,.12,.46,0,-.85,1.03,'#263b45','Montacargas');
    for(const x of [-.54,.54])for(const y of [-.34,-1.16]){
      const w=this.cylinder(f,.23,.16,x,y,.25,'#26333b','Montacargas');w.rotation.z=Math.PI/2;w.rotation.x=0;w.rotation.z=Math.PI/2;
      const hub=this.cylinder(f,.105,.17,x,y,.25,'#8f9da3','Montacargas');hub.rotation.x=0;hub.rotation.z=Math.PI/2;
    }
    for(const x of [-.43,.43]){
      this.box(f,.05,.06,1.35,x,-1.30,1.25,'#263d4a','Montacargas');
      this.box(f,.05,.06,1.1,x,-.20,1.48,'#263d4a','Montacargas');
      this.box(f,.075,.07,2.45,x,.04,1.36,'#294758','Montacargas');
      this.box(f,.10,1.03,.055,x,.52,.125,'#687880','Montacargas');
    }
    this.box(f,.94,1.25,.06,0,-.75,2.0,'#294453','Montacargas');
    this.box(f,.94,.07,.08,0,.04,1.40,'#294453','Montacargas');
    this.driver=this.person(f,0,-.8,.55,'#df973b');this.driver.scale.setScalar(.72);
  }
  person(parent,x,y,z,color='#dc873e') {
    const p=new THREE.Group();p.position.set(x,y,z);parent.add(p);
    const skin=this.material('#c19d79',{metalness:0,roughness:.9}), vest=this.material(color,{metalness:0,roughness:.9});
    const sphere=new THREE.Mesh(new THREE.SphereGeometry(.105,14,10),skin);sphere.position.z=1.49;p.add(sphere);
    const helmet=this.cylinder(p,.125,.08,0,0,1.58,'#e1b52c','Operarios');
    this.box(p,.33,.20,.50,0,0,1.15,color,'Operarios');
    for(const dx of [-.09,.09]){
      this.cylinder(p,.065,.90,dx,0,.45,'#243e50','Operarios');
      this.box(p,.12,.22,.09,dx,-.035,.05,'#263842','Operarios');
    }
    const arm1=this.tube(p,[[-.19,0,1.36],[-.26,-.04,1.12],[-.24,-.22,1.0]],.047,color,'Operarios');
    const arm2=this.tube(p,[[.19,0,1.36],[.26,-.04,1.12],[.24,-.22,1.0]],.047,color,'Operarios');
    this.box(p,.34,.005,.036,0,-.104,1.20,'#dbe4be');
    this.box(p,.34,.005,.036,0,-.104,1.04,'#dbe4be');p.userData.arms=[arm1,arm2];return p;
  }
  buildOperators() {
    const people=this.group('Operarios');
    this.worker1=this.person(people,1.48,-.92,0);this.worker1.rotation.z=Math.PI/2;
    this.worker2=this.person(people,3.30,-1.17,0);this.worker2.rotation.z=-Math.PI/2;
  }
  buildFlow() {
    this.flow=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.018,0),this.material('#252d31',{roughness:1,metalness:0}),160);
    this.flow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.model.add(this.flow);
    this.dummy=new THREE.Object3D();
  }
  label(text) {
    const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');
    ctx.fillStyle='rgba(255,255,255,.94)';ctx.fillRect(0,0,512,96);ctx.font='600 44px Segoe UI,Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#285a70';ctx.fillText(text,256,48);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false}));sprite.scale.set(1.1,.206,1);sprite.renderOrder=20;return sprite;
  }
  buildDimensions() {
    this.dimensions=new THREE.Group();this.dimensions.visible=false;this.scene.add(this.dimensions);
    const line=(a,b,label,pos)=>{
      this.dimensions.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]),new THREE.LineBasicMaterial({color:0x2b718b,depthTest:false})));
      const d=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
      for(const p of [a,b]){const v=d.clone().cross(new THREE.Vector3(1,1,.3)).normalize().multiplyScalar(.08);this.dimensions.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...p).add(v),new THREE.Vector3(...p).sub(v)]),new THREE.LineBasicMaterial({color:0x2b718b,depthTest:false})));}
      const s=this.label(label);s.position.set(...pos);this.dimensions.add(s);
    };
    const C=this.data.config, top=C.beam_top;
    const mm=v=>`${Math.round(v*1000).toLocaleString('fr-FR')} mm`;
    line([-.85,-1.2,0],[-.85,-1.2,top],mm(top),[-.85,-1.2,top/2]);
    line([0,-1.30,top+.35],[3.2,-1.30,top+.35],'3 200 mm',[1.6,-1.30,top+.35]);
    line([3.8,1.3,0],[3.8,1.3,2.1],'2 100 mm',[3.8,1.3,1.1]);
    line([C.pickup_x,-.30,C.travel_bottom+1.1],[C.discharge_x,-.30,C.travel_bottom+1.1],mm(C.discharge_x-C.pickup_x),[1.5,-.3,C.travel_bottom+1.15]);
  }
  fillHeight(volume) {
    const H=this.data.hopper;let lo=0,hi=H.cone_height+H.body_height;
    for(let i=0;i<28;i++){const h=(lo+hi)/2,c=Math.min(h,H.cone_height),w=H.outlet_width+(H.mouth_width-H.outlet_width)*c/H.cone_height;
      const v=c/3*(H.outlet_width**2+w*w+H.outlet_width*w)+Math.max(0,h-H.cone_height)*H.mouth_width**2;if(v<volume)lo=h;else hi=h;}return(lo+hi)/2;
  }
  updateCoal(kg) {
    this.coal.visible=kg>.01;if(kg<=.01)return;
    if(this.coalKg!==undefined&&Math.abs(kg-this.coalKg)<.005)return;this.coalKg=kg;
    const H=this.data.hopper,h=this.fillHeight(kg/550),w=H.outlet_width+(H.mouth_width-H.outlet_width)*Math.min(h,H.cone_height)/H.cone_height;
    const square=(z,a)=>[[H.center_x-a/2,-a/2,z],[H.center_x+a/2,-a/2,z],[H.center_x+a/2,a/2,z],[H.center_x-a/2,a/2,z]];
    const verts=[...square(H.outlet_z+.005,H.outlet_width-.015)];
    if(h>H.cone_height)verts.push(...square(H.outlet_z+H.cone_height,H.mouth_width-.015));
    verts.push(...square(H.outlet_z+h,w-.015));
    const n=verts.length,faces=[[n-4,n-3,n-2,n-1]];
    for(let j=0;j<n-4;j+=4)for(let i=0;i<4;i++)faces.push([j+i,j+(i+1)%4,j+(i+1)%4+4,j+i+4]);
    const geo=this.geometry({v:verts,f:faces});
    this.coal.geometry.dispose();this.coal.geometry=geo;
  }
  setProgress(v) {
    this.progress=clamp(Number(v)||0);const s=processState(this.progress,this.payload,this.bagSize,this.mode,this.data);this.state=s;
    const C=this.data.config;this.bagRoot.position.set(s.x,0,s.z);this.crucetaRoot.position.set(s.x,0,s.z+C.cruceta_center_above_bag_m);
    this.slingRoot.visible=s.phaseIndex>=1;
    const remaining=this.payload ? s.bigbagKg/this.payload : 0;
    this.bag.scale.set(lerp(.70,1,remaining),lerp(.56,1,remaining),1);
    this.hoist.position.x=s.x;
    const top=C.beam_bottom-.15,bottom=s.hookM+.045,drop=Math.max(.03,top-bottom);
    this.chain.position.x=s.x;
    for(const l of [this.chainLine,this.chainLine2]){l.position.z=(top+bottom)/2;l.scale.y=drop;}
    this.hook.position.z=s.hookM;
    this.gate.position.y=.28*s.gateOpening;
    this.boot.visible=this.mode==='spout';this.closedGuard.visible=this.mode==='closed';
    this.cutterMeshes.forEach(mesh=>mesh.visible=this.mode==='closed');
    this.lockPin.position.y=this.data.exactCAD?(s.lockingPin?0:.08):(s.lockingPin?.02:.24);
    this.interlockLamp.material.color.set(s.lockingPin?'#52a67d':s.carriageLocked?'#dfad33':'#597482');
    this.interlockLamp.userData.part=s.interlockState;
    this.updateCoal(s.hopperKg);
    const receiptY=lerp(-1.8,0,smooth(s.phaseProgress));
    this.forklift.visible=s.phaseIndex<2;
    this.forklift.position.set(C.pickup_x,s.phaseIndex===0?receiptY:-smooth(s.phaseProgress)*3,0);
    this.pallet.position.y=s.phaseIndex===0?receiptY:0;
    this.bagRoot.position.y=s.phaseIndex===0?receiptY:0;
    this.sack.visible=s.phaseIndex>=6&&s.phaseIndex<=8&&s.sackKg>=0;
    const workingHeight=this.bagSize===25?.36:.15;
    const deckHeight=lerp(workingHeight,.35,smooth(s.transfer/.22)),liftHeight=deckHeight-.15;
    this.sack.position.set(this.data.hopper.center_x,-s.transfer*1.82,deckHeight);
    this.liftDeck.position.z=.14+liftHeight;
    this.liftBellows.scale.z=1+liftHeight/.07;this.liftBellows.position.z=.07+liftHeight/2;
    this.scissorArms.forEach(([arm,sign])=>{arm.position.z=.08+liftHeight/2;arm.rotation.y=sign*Math.asin(clamp((.13+liftHeight)/.49,0,.95));});
    const fill=this.bagSize?s.sackKg/this.bagSize:0;
    const sackHeight=this.bagSize===25?.49:.70;
    this.sackBody.scale.set(lerp(.75,1,fill),lerp(.6,1,fill),sackHeight/.70);
    const tieOn=s.cyclePhase==='amarre'||s.cyclePhase==='salida'||s.phaseIndex===7;
    this.tie.visible=tieOn;this.tie.position.z=sackHeight-.025;
    this.finishedBags.forEach((b,i)=>{b.visible=i<Math.min(12,s.completedSacks);});
    this.worker2.position.y=-1.17-((s.cyclePhase==='salida')?s.transfer*.2:0);
    const tying=s.cyclePhase==='amarre'||s.phaseIndex===7;
    this.worker2.userData.arms?.forEach((a,i)=>a.rotation.z=tying?Math.sin(s.cycleProgress*Math.PI*4)*(i?-.13:.13):0);
    this.flow.visible=s.runningFlow;
    if(this.flow.visible){
      const bulk=s.phaseIndex===5,z0=bulk?this.data.hopper.mouth_z+.025:deckHeight+(this.bagSize===25?.49:.70),z1=bulk?C.support_z:.865,r=bulk?(this.mode==='closed'?.105:.075):.045;
      for(let i=0;i<160;i++){
        const angle=i*2.399963,rad=Math.sqrt((i*.618033)%1)*r,fall=(i*.071+this.progress*(bulk?70:260))%1;
        this.dummy.position.set(2.35+Math.cos(angle)*rad,Math.sin(angle)*rad,lerp(z1,z0,fall));
        this.dummy.scale.setScalar(.45+(i%5)*.11);this.dummy.rotation.set(i,i*.3,i*.7);this.dummy.updateMatrix();this.flow.setMatrixAt(i,this.dummy.matrix);
      }this.flow.instanceMatrix.needsUpdate=true;
    }
    this.render();return {...s};
  }
  setMode(v) { this.mode=v==='closed'?'closed':'spout';this.setProgress(this.progress); }
  setBagSize(v) { this.bagSize=Number(v)===25?25:50;this.setProgress(this.progress); }
  setPayload(v) { this.payload=clamp(Number(v)||0,0,1000);this.setProgress(this.progress); }
  setEdges(v) { this.edgesOn=!!v;this.edgeLines.forEach(e=>e.visible=this.edgesOn);this.render(); }
  setSection(v) {
    this.section=!!v;
    this.sectionMeshes.forEach(mesh=>{mesh.material.clippingPlanes=this.section?[new THREE.Plane(new THREE.Vector3(0,1,0),0)]:[];
      mesh.material.transparent=this.section;mesh.material.opacity=this.section?.40:1;mesh.material.depthWrite=!this.section;mesh.material.needsUpdate=true;});
    this.render();
  }
  setDimensions(v) { this.dimensions.visible=!!v;this.render(); }
  setExploded(v) {
    this.exploded=!!v;
    const offsets={Porticos:[-.45,0,0],Tolva:[.35,0,.25],Plataforma:[0,.55,.08],Escalera:[-.5,.55,0],Barandas:[0,.55,.55],Monorriel:[0,0,.55],'Soporte bolsa':[0,0,.6],Complementos:[0,0,.05]};
    this.groupRoots.forEach((g,id)=>g.position.set(...(this.exploded?(offsets[id]||[0,0,0]):[0,0,0])));
    this.render();
  }
  highlight(id) {
    id=canonicalGroup(id);this.selected=id?(groupIds[id]||id):null;
    for(const m of this.parts){if(!m.material.emissive)continue;const selected=!!id&&((groupIds[m.userData.group]||m.userData.group)===(groupIds[id]||id));m.material.emissive.set(selected?0x1c7198:0x000000);m.material.emissiveIntensity=selected?.36:0;}
    this.render();
  }
  setView(name) {
    const aliases={isometrica:'iso','isométrica':'iso',frontal:'front',lateral:'side',posterior:'back',planta:'top',isometric:'iso'};
    name=aliases[String(name).toLowerCase()]||name;
    const focus={discharge:{target:[2.35,0,2.8],offset:[6,-8,4],zoom:1.6},bagging:{target:[2.35,-.55,1.0],offset:[5,-7,3],zoom:2.7},pickup:{target:[.65,-.45,1.6],offset:[6,-8,3],zoom:1.65}};
    focus.discharge.target[2]=this.data.config.support_z;
    const view=focus[name];this.controls.target.set(...(view?.target||[1.15,-.02,this.data.config.beam_top/2]));
    const t=this.controls.target,views={iso:[8,-12,7.3],front:[0,-14,.01],side:[14,0,.01],back:[0,14,.01],top:[0,-.001,15],left:[-14,0,.01]};
    const d=view?.offset||views[name]||views.iso;
    this.camera.up.copy(name==='top'?new THREE.Vector3(0,1,0):UP);
    this.camera.position.copy(t).add(new THREE.Vector3(...d));this.camera.zoom=view?.zoom||1;this.controls.update();this.render();
  }
  resetCamera() { this.setView('iso'); }
  getState() { return {...this.state,selected:this.selected,section:this.section,edges:this.edgesOn,exploded:this.exploded,webgl:true,revision:this.data.revision,nativeParts:this.data.nativeParts,nativeComponents:this.data.nativeComponents}; }
  resize() {
    const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight);
    this.renderer.setSize(w,h,false);const half=Math.max(4.05,(this.data.config.beam_top+.9)*.65),ratio=w/h;
    this.camera.left=-half*ratio;this.camera.right=half*ratio;this.camera.top=half;this.camera.bottom=-half;
    this.camera.updateProjectionMatrix();this.render();
  }
  render() { if(this.renderer&&this.camera)this.renderer.render(this.scene,this.camera); }
  toggleFullscreen() { return document.fullscreenElement?document.exitFullscreen():this.container.requestFullscreen?.(); }
  dispose() {
    this.observer?.disconnect();this.controls?.dispose();
    this.renderer.domElement.removeEventListener('pointerdown',this.pointerDown);this.renderer.domElement.removeEventListener('pointerup',this.pointerUp);this.renderer.domElement.removeEventListener('keydown',this.keydown);
    this.scene.traverse(o=>{o.geometry?.dispose();if(o.material){const a=Array.isArray(o.material)?o.material:[o.material];a.forEach(m=>{m.map?.dispose();m.dispose();});}});
    this.renderer.dispose();this.renderer.domElement.remove();
  }
}
