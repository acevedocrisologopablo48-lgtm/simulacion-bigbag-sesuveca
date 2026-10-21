import * as THREE from '../assets/vendor/three.module.min.js';
import { OrbitControls } from '../assets/vendor/OrbitControls.js';
import {buildWorkshop} from './workshop.js?v=auto20261021-ce89291614b4';
import {buildEquipmentDetails} from './equipment-details.js?v=auto20261021-a567b17c9252';
import {buildProcessDetails} from './process-details.js?v=auto20261021-03c45b3d935a';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
const lerp = (a, b, t) => a + (b - a) * t;
const UP = new THREE.Vector3(0, 0, 1);
const groupNames = {
  Cimentacion: 'Cimentación y anclajes', Porticos: 'Pórticos y arriostres', Monorriel: 'Monorriel y carro', Tolva: 'Tolva de carbón',
  'Soporte bolsa': 'Apoyo del bigbag', Cruceta: 'Cruceta de cuatro puntos', Plataforma: 'Plataforma de acceso superior',
  Escalera: 'Escalera de acceso', Barandas: 'Barandas y guardas', Compuerta: 'Compuerta y ensacado',
  Complementos: 'Uniones y complementos', Accesorios: 'Accesorios', Bigbag: 'Bigbag de proceso · 1 t',
  Montacargas: 'Montacargas de abastecimiento', Operarios: 'Operación y amarre', Rodillos: 'Mesa elevadora y rodillos',Colector:'Colector de polvo'
};
const groupIds = {Cimentacion:'cimentacion',Porticos:'porticos',Monorriel:'monorriel',Tolva:'tolva','Soporte bolsa':'soporte-bolsa',Cruceta:'cruceta',Plataforma:'plataforma',Escalera:'escalera',Barandas:'barandas',Complementos:'complementos',Accesorios:'complementos',Compuerta:'complementos',Rodillos:'complementos',Bigbag:'soporte-bolsa',Montacargas:'porticos',Operarios:'complementos'};
const canonicalGroup = id => Object.keys(groupIds).find(k => groupIds[k] === id) || id;

export function receptionPose(state, config) {
  const q = state.phaseProgress, receiving = state.phaseIndex === 0, withdrawing = state.phaseIndex === 1;
  const approach = receiving ? 2.6 * (1 - smooth(q / .82)) : 0;
  const lift = receiving ? .06 * (1 - smooth((q - .82) / .18)) : 0;
  const retreat = withdrawing ? 2.6 * smooth((q - .25) / .75) : 0;
  const workerApproach = withdrawing ? smooth((q - .72) / .28) : state.phaseIndex >= 2 ? 1 : 0;
  const workerX = lerp(config.pickup_x + 1.25, config.pickup_x, Math.min(1, workerApproach * 2));
  const workerY = lerp(-1.45, -.95, Math.max(0, workerApproach * 2 - 1));
  const withdrawFromLoad = state.phaseIndex === 2 ? smooth(q / .2) : state.phaseIndex > 2 ? 1 : 0;
  return {
    forkliftVisible: state.phaseIndex < 2,
    forkliftPosition: [config.pickup_x + .64 + approach + retreat, 0, 0],
    forkliftRotation: Math.PI / 2,
    forkLift: lift - (withdrawing ? .015 * smooth(q / .2) : 0),
    palletPosition: [config.pickup_x + approach, 0, lift],
    bagPosition: receiving ? [config.pickup_x + approach, 0, config.pickup_bottom + lift] : [state.x, 0, state.z],
    receivingWorker: [workerX, lerp(workerY, -1.45, withdrawFromLoad), -.015]
  };
}

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
  const dose=q=>{const u=clamp(q);return u<.6?1.5*u:.9+.1*clamp((u-.6)/.4);};
  const gateAt=f=>f>=1?0:f<.9?1:52.5/280;
  const first = Math.min(payload, bagSize);
  if (index === 6) { sackKg = first * dose(q); hopperKg -= sackKg; gate = gateAt(sackKg/first); }
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
      if (u < .62) { cyclePhase = 'llenado'; cycleProgress = u / .62; sackKg = currentTarget * dose(cycleProgress); gate = gateAt(sackKg/currentTarget); }
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
    fullSacks:Math.floor((payload+1e-9)/bagSize),remainderKg:Math.max(0,payload-Math.floor((payload+1e-9)/bagSize)*bagSize),dosingStage:gate===0?'Cerrado':gate===1?'Grueso':'Fino', totalSacks: count, sackNumber: count ? Math.min(count, completedSacks + 1) : 0,
    hopperM3: hopperKg / (data.densityKgM3 || 550), bagBottomM: z, hookM: z + (C.bag_height || 1) + C.headpack,
    carriageM: Math.abs(x - C.pickup_x), x, z, transfer, gateOpening: clamp(gate),
    mode, bagSize, payload, runningFlow: (index === 5 && q > 0 && q < 1) || gate > .01,
    carriageLocked, lockingPin, hoistEnabled, interlockState,
    massBalanceKg: bigbagKg + hopperKg + sackKg + finishedKg };
}

let active = null;
export const BigbagScene = {
  async init(container, onSelect) {
    if (active) active.dispose();
    const response = await fetch(new URL('../data/model.json?v=auto20261021-0e439254675d', import.meta.url));
    if (!response.ok) throw new Error('No se pudo cargar la geometría.');
    active = new SceneEngine(container, await response.json(), onSelect);
    return BigbagScene;
  },
  setProgress(v) { return active?.setProgress(v); },
  setView(name) { active?.setView(name); }, resetCamera() { active?.resetCamera(); },
  setEdges(v) { active?.setEdges(v); }, setSection(v) { active?.setSection(v); },
  setDimensions(v) { active?.setDimensions(v); }, setExploded(v) { active?.setExploded(v); },
  setStyle(v) { active?.setStyle(v); },
  setCameraMode(v) { active?.setCameraMode(v); },
  highlight(id) { active?.highlight(id); },
  setMode(v) { active?.setMode(v); }, setBagSize(v) { active?.setBagSize(v); },
  setPayload(v) {
    if(!active)return;
    const compact=Math.abs(Number(v)-595.65)<.01;
    if(Boolean(active.data.config.compact_format)!==compact){
      const old=active,data=structuredClone(active.data),container=active.container,select=active.onSelect,progress=active.progress,size=active.bagSize;
      const C=data.config,delta=compact?-.05:.05;
      C.compact_format=compact;C.bag_width=compact?.95:1.05;C.bag_height=compact?1.2:1.65;
      C.bag_attachment_spacing_m=compact?.95:1.05;C.cruceta_center_above_bag_m=compact?1.772074:2.222074;
      for(const m of data.cruceta)if(/GANCHO_L320AN|GRILLETE_G2130/.test(m.piece)){
        const x=m.v.reduce((n,p)=>n+p[0],0)/m.v.length,y=m.v.reduce((n,p)=>n+p[1],0)/m.v.length;
        for(const p of m.v){p[0]+=Math.sign(x)*delta;p[1]+=Math.sign(y)*delta;}
      }
      old.dispose();active=new SceneEngine(container,data,select);active.setBagSize(size);active.setPayload(v);active.setProgress(progress);
    }else active.setPayload(v);
  }, getState() { return active?.getState(); },
  setAccessOpen(v) { return active?.setAccessOpen(v); },
  resetAccess() { return active?.resetAccess(); },
  resize() { active?.resize(); }, toggleFullscreen() { return active?.toggleFullscreen(); },
  dispose() { active?.dispose(); active = null; }
};
window.BigbagScene = BigbagScene;

class SceneEngine {
  constructor(container, data, onSelect) {
    this.container = container; this.data = data; this.onSelect = onSelect;
    this.progress = 0; this.payload = 1000; this.bagSize = 50; this.mode = 'closed';
    this.edgesOn = false; this.section = false; this.exploded = false; this.selected = null;this.renderStyle='realistic';this.currentView='iso';this.cameraMode='rotate';
    this.parts = []; this.groupRoots = new Map(); this.edgeLines = []; this.sectionMeshes = [];
    this.accessGateMeshes = []; this.accessOpen = false; this.accessResetRequired = false;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#edf2f4');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.setAttribute('aria-label', 'Estación de bigbags. Elige Girar o Desplazar y arrastra. Rueda para acercar; dos dedos para mover y acercar.');
    this.renderer.domElement.setAttribute('role', 'img'); this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline-offset:-4px;';
    container.appendChild(this.renderer.domElement);
    this.perspectiveCamera=new THREE.PerspectiveCamera(37,1,.025,150);
    this.technicalCamera=new THREE.OrthographicCamera(-5,5,4,-4,.025,150);
    this.camera = this.perspectiveCamera;
    this.camera.up.copy(UP); this.camera.position.set(9, -12, 8);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(1.15, -.05, 2.45); this.controls.enableDamping = false;
    this.controls.minZoom = .45; this.controls.maxZoom = 5;
    this.controls.maxPolarAngle = Math.PI * .49;
    this.controls.minDistance=.45;this.controls.maxDistance=38;
    this.controls.enablePan=true;this.controls.screenSpacePanning=true;
    this.setCameraMode('rotate');
    this.controls.addEventListener('change', () => this.render());
    this.workshop=buildWorkshop(this);
    this.model = new THREE.Group(); this.scene.add(this.model);
    this.cutterMeshes = []; this.spoutMeshes = [];
    data.static.forEach(m => {
      if (m.tag === 'pallet_referencia' || m.tag === 'balanza_envolvente' || /^BALANZA_|^MESA_/i.test(m.tag)) return;
      if (/^(?:BIGBAG_1t_REF|CADENA_REF|ASA_REF_\d+|SACO_50kg_REF)$/.test(m.tag)) return;
      const mesh = this.addDataMesh(m, this.group(m.group));
      if (m.motion?.group==='access_gate') this.accessGateMeshes.push(mesh);
      if (/^TOL_PANEL|^TOL_TAPA_POLVO|^LINER_|^TOL_GUARDA|^GUARDA_CORTE/.test(m.tag)) this.sectionMeshes.push(mesh);
      if (/^CORTE_/.test(m.tag)) this.cutterMeshes.push(mesh);
      if (/^LINER_|^TOL_GUARDA|^GUARDA_CORTE/.test(m.tag)) this.sectionMeshes.push(mesh);
    });
    this.buildHopper(); this.buildBag(); this.buildHoist(); this.buildScaleAndRollers();
    this.buildForklift(); this.buildOperators(); this.buildFlow(); this.buildDimensions();
    this.equipmentDetails=buildEquipmentDetails(this);this.processDetails=buildProcessDetails(this);
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.pointerDown = e => { this.clickOrigin = [e.clientX, e.clientY]; };
    this.pointerUp = e => {
      if (e.button!==0 || !this.clickOrigin || Math.hypot(e.clientX - this.clickOrigin[0], e.clientY - this.clickOrigin[1]) > 5) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.parts, false).find(h => h.object.visible && this.parentsVisible(h.object));
      if (hit) { const d = hit.object.userData; this.highlight(d.group); this.onSelect?.({ id: groupIds[d.group] || d.group, groupId: groupIds[d.group] || d.group, label: d.label||(d.equipmentDetail?d.part:(groupNames[d.group] || d.group)), name: groupNames[d.group] || d.group, part: d.part }); }
      else { this.highlight(null); this.onSelect?.(null); }
    };
    this.keydown = e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
      e.preventDefault(); if (e.key === 'Home') return this.resetCamera();
      if(this.cameraMode==='pan'||e.shiftKey){
        const distance=this.camera.position.distanceTo(this.controls.target);
        const step=(this.camera.isOrthographicCamera?(this.camera.top-this.camera.bottom)/this.camera.zoom:2*distance*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)))*.06;
        this.camera.updateMatrixWorld();
        const horizontal=e.key==='ArrowLeft'||e.key==='ArrowRight';
        const direction=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,horizontal?0:1);
        direction.multiplyScalar(step*(['ArrowLeft','ArrowDown'].includes(e.key)?-1:1));
        this.camera.position.add(direction);this.controls.target.add(direction);this.controls.update();this.render();return;
      }
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
    const positions = [],uv=[];
    for (const face of m.f) {
      let triangles;
      if (face.length === 3) triangles = [[0, 1, 2]];
      else {
        const a = new THREE.Vector3(...m.v[face[0]]), b = new THREE.Vector3(...m.v[face[1]]), c = new THREE.Vector3(...m.v[face[2]]);
        const n = b.sub(a).cross(c.sub(a)), ax = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
        const drop = ax.indexOf(Math.max(...ax)), axes = [0, 1, 2].filter(i => i !== drop);
        triangles = THREE.ShapeUtils.triangulateShape(face.map(i => new THREE.Vector2(m.v[i][axes[0]], m.v[i][axes[1]])), []);
      }
      for (const t of triangles) {
        const a=new THREE.Vector3(...m.v[face[t[0]]]),b=new THREE.Vector3(...m.v[face[t[1]]]),c=new THREE.Vector3(...m.v[face[t[2]]]);
        const n=b.sub(a).cross(c.sub(a));const axes=Math.abs(n.z)>Math.max(Math.abs(n.x),Math.abs(n.y))?[0,1]:Math.abs(n.x)>Math.abs(n.y)?[1,2]:[0,2];
        for (const j of t){const p=m.v[face[j]];positions.push(...p);uv.push(p[axes[0]]*4,p[axes[1]]*4);}
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.computeVertexNormals(); return g;
  }
  addDataMesh(m, parent) {
    const tag=m.tag||'';
    const code=m.piece||tag;
    const kind=/LINER/.test(tag)?'polymer':/AMORT|BUFFER|P100_MANGA_FLEXIBLE/.test(code)?'rubber':/P100_(?:MARCO|PLATAFORMA|POSTE|BRAZO|SOPORTE)|CORTE_.*(?:FILO|CUCHILLA)|MG.*(?:EJE|PIÑON|PINON)|RODILLO/.test(code)?'stainless':/PERNO|ARANDELA|TUERCA|ANCLA_HAS|TC11|PASADOR|P100_CELDA|PN_ACTUADOR|P100_(?:CIERRE|COMPENSADOR)_NEUMATICO/.test(code)?'zinc':'paint';
    const sourceColor=/P100_INDICADOR|PN_VALVULAS/.test(code)?'#283940':/^PN_|P100_MESA|CUNA_BOTONERA/.test(code)?[56,92,117]:(m.c??m.color??[56,92,117]);
    const color=Array.isArray(sourceColor)?new THREE.Color(...sourceColor.map(v=>v/255)).convertSRGBToLinear():sourceColor;
    const mesh = new THREE.Mesh(this.geometry(m), this.workshop.materialFor(color,kind)); parent.add(mesh);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { group: m.group || parent.name, part: m.tag || parent.name, label:m.label };
    this.parts.push(mesh);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), new THREE.LineBasicMaterial({ color: 0x203a4a, transparent: true, opacity: .27 }));
    edge.renderOrder = 1;edge.visible=this.edgesOn; mesh.add(edge); this.edgeLines.push(edge); return mesh;
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
    const portX=H.center_x-H.mouth_width/2+.085,dustZ=H.mouth_z+.10;
    const duct = this.cylinder(connection, .075, .20, portX, 0, dustZ, '#547b90', 'Tolva', { openEnded: true });
    duct.userData.part='Conexión superior DN150';
    this.cylinder(connection, .105, .02, portX, 0, H.mouth_z+.01, '#2d5266', 'Tolva', { openEnded: true });
    }
    this.spoutAssembly = new THREE.Group(); connection.add(this.spoutAssembly);
    this.spoutAssembly.name='Manguito de descarga';
    this.boot = this.cylinder(this.spoutAssembly, .128, H.bag_support_z - H.mouth_z, H.center_x, 0, (H.bag_support_z+H.mouth_z)/2, '#47555e', 'Tolva', { roughness: 1, metalness: 0, openEnded: true });
    const bootHeight = H.bag_support_z - H.mouth_z;
    for (let i = 0; i < 10; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.13,.006,6,32), this.material('#65757e'));
      ring.position.set(H.center_x,0,H.mouth_z+bootHeight*(i+.5)/10); this.spoutAssembly.add(ring);
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
    const C=this.data.config, width=C.bag_width || 1, height=C.bag_height || 1;
    this.bagRoot = new THREE.Group(); this.bagRoot.name = 'Bigbag'; this.model.add(this.bagRoot);
    this.bag = new THREE.Mesh(this.roundedBagGeometry(width,height),this.clothMaterial());this.bagRoot.add(this.bag);this.bag.castShadow=true;
    this.bag.userData={group:'Bigbag',part:`Bigbag ${Math.round(width*1000)} × ${Math.round(width*1000)} × ${Math.round(height*1000)} mm`};this.parts.push(this.bag);this.sectionMeshes.push(this.bag);
    const seamColor = '#acb8bb';
    const anchorHalf=(C.bag_attachment_spacing_m || width)/2;
    for(const x of [-anchorHalf,anchorHalf])for(const y of [-anchorHalf,anchorHalf]) {
      const loop=C.bag_loop_loaded_m || .25;
      this.tube(this.bagRoot,[[x,y,height*.95],[x+.01,y,height+.04],[x+.01,y,height+loop],[x+.035,y,height+loop-.01],[x+.035,y,height]],.016,'#d1d8d5','Bigbag');
      this.tube(this.bagRoot,[[x,y,height*.04],[x*1.02,y*.98,height*.45],[x,y,height*.96]],.005,seamColor);
    }
    const stripe=this.box(this.bagRoot,.35,.004,.13,0,-width*.502,height*.54,'#235d80','Bigbag');stripe.material.roughness=1;
    this.crucetaRoot=new THREE.Group();this.crucetaRoot.name='Cruceta';this.model.add(this.crucetaRoot);
    this.data.cruceta.forEach(m=>this.addDataMesh({...m,group:'Cruceta'},this.crucetaRoot));
    this.slingRoot=new THREE.Group();this.bagRoot.add(this.slingRoot);
    this.pallet = new THREE.Group(); this.pallet.name='pallet'; this.model.add(this.pallet);
    for(const x of [-.43,0,.43])for(const y of [-.43,0,.43])this.box(this.pallet,.14,.14,.076,x,y,.062,'#91764e');
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
    // The native P100 module supplies the only weighing platform and indicator.
    this.sack=new THREE.Group();this.sack.name='Compuerta';this.model.add(this.sack);
    this.sackBody=new THREE.Mesh(this.roundedBagGeometry(.40,.70),this.clothMaterial());this.sack.add(this.sackBody);this.sackBody.castShadow=true;
    this.sackBody.userData={group:'Compuerta',part:'Saco de producto'};this.parts.push(this.sackBody);this.sectionMeshes.push(this.sackBody);
    this.tie=new THREE.Mesh(new THREE.TorusGeometry(.042,.008,6,24),this.material('#b9a36d'));this.tie.position.z=.68;this.sack.add(this.tie);
    this.rollerStart={x,y:-.63,z:.35};
    for(const y of [-.5,-1.8]) {
      const crossbar=this.box(g,.60,.04,.04,x,y,.26,'#2d607c','Rodillos');
      crossbar.userData.part='Travesaño inferior del transportador';
    }
    for(let i=0;i<10;i++){const roll=this.cylinder(g,.035,.58,x,-.65-i*.15,.315,'#9dadb4','Rodillos');roll.rotation.x=0;roll.rotation.z=Math.PI/2;}
    for(const legX of [x-.23,x+.23])for(const y of [-.5,-1.8]){
      this.box(g,.04,.045,.28,legX,y,.14,'#365e71','Rodillos');
    }
    for(const legX of [x-.23,x+.23])this.tube(g,[[legX,-.50,.16],[legX,-1.77,.28]],.018,'#3e728b','Rodillos');
    this.output=new THREE.Group();this.model.add(this.output);
    this.box(this.output,1.1,1.05,.12,0,0,.06,'#a1845b');
    this.output.position.set(x-1.20,-1.8,0);
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
    this.box(f,.60,.48,.13,0,-.70,.98,'#253b45','Montacargas');
    this.box(f,.6,.12,.46,0,-.95,1.21,'#263b45','Montacargas');
    for(const x of [-.54,.54])for(const y of [-.34,-1.16]){
      const w=this.cylinder(f,.23,.16,x,y,.243,'#26333b','Montacargas');w.rotation.x=0;w.rotation.z=Math.PI/2;
      const hub=this.cylinder(f,.105,.17,x,y,.243,'#8f9da3','Montacargas');hub.rotation.x=0;hub.rotation.z=Math.PI/2;
    }
    for(const x of [-.43,.43]){
      this.box(f,.05,.06,1.35,x,-1.30,1.25,'#263d4a','Montacargas');
      this.box(f,.05,.06,1.1,x,-.20,1.48,'#263d4a','Montacargas');
      this.box(f,.075,.07,2.45,x,.04,1.36,'#294758','Montacargas');
    }
    this.forkCarriage=new THREE.Group();f.add(this.forkCarriage);
    for(const x of [-.255,.255]){
      this.box(this.forkCarriage,.10,1.03,.045,x,.52,.0775,'#687880','Montacargas');
      this.box(this.forkCarriage,.10,.055,.62,x,.025,.36,'#687880','Montacargas');
    }
    for(const z of [.15,.75])this.box(this.forkCarriage,.88,.055,.045,0,.012,z,'#294758','Montacargas');
    for(const x of [-.42,0,.42])this.box(this.forkCarriage,.035,.055,.60,x,.012,.45,'#294758','Montacargas');
    this.box(f,.94,1.25,.06,0,-.75,2.0,'#294453','Montacargas');
    this.box(f,.94,.07,.08,0,.04,1.40,'#294453','Montacargas');
    this.driver=this.person(f,0,-.74,0,'#df973b');this.driver.rotation.z=Math.PI;
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
    this.worker1=this.person(people,this.data.config.pickup_x+1.25,-1.45,-.015);this.worker1.rotation.z=Math.PI;
    this.worker2=this.person(people,this.data.hopper.center_x+.65,-1.17,-.015);this.worker2.rotation.z=-Math.PI/2;
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
    const floor=C.platform_floor_z_m;
    line([-.6,1.3,0],[-.6,1.3,floor],'2 782,59 mm',[-.6,1.3,floor/2]);
    line([C.pickup_x,-.30,C.travel_bottom+1.1],[C.discharge_x,-.30,C.travel_bottom+1.1],mm(Math.abs(C.discharge_x-C.pickup_x)),[1.7,-.3,C.travel_bottom+1.15]);
  }
  fillHeight(volume) {
    const H=this.data.hopper;let lo=0,hi=H.cone_height+H.body_height;
    for(let i=0;i<28;i++){const h=(lo+hi)/2,c=Math.min(h,H.cone_height),w=H.outlet_width+(H.mouth_width-H.outlet_width)*c/H.cone_height;
      const v=c/3*(H.outlet_width**2+w*w+H.outlet_width*w)+Math.max(0,h-H.cone_height)*H.mouth_width**2;if(v<volume)lo=h;else hi=h;}return(lo+hi)/2;
  }
  updateCoal(kg) {
    this.coal.visible=kg>.01;if(kg<=.01)return;
    if(this.coalKg!==undefined&&Math.abs(kg-this.coalKg)<.005)return;this.coalKg=kg;
    const H=this.data.hopper,h=this.fillHeight(kg/(this.data.densityKgM3 || 550)),w=H.outlet_width+(H.mouth_width-H.outlet_width)*Math.min(h,H.cone_height)/H.cone_height;
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
    if((this.accessOpen||this.accessResetRequired)&&this.state)return {...this.state};
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
    this.spoutAssembly.visible=this.mode==='spout';this.closedGuard.visible=this.mode==='closed';
    this.cutterMeshes.forEach(mesh=>mesh.visible=this.mode==='closed');
    this.lockPin.position.y=this.data.exactCAD?(s.lockingPin?0:.08):(s.lockingPin?.02:.24);
    this.updateCoal(s.hopperKg);
    const reception=this.reception=receptionPose(s,C);
    this.forklift.visible=reception.forkliftVisible;
    this.forklift.position.set(...reception.forkliftPosition);this.forklift.rotation.z=reception.forkliftRotation;
    this.forkCarriage.position.z=reception.forkLift;
    this.pallet.position.set(...reception.palletPosition);
    this.bagRoot.position.set(...reception.bagPosition);
    this.worker1.position.set(...reception.receivingWorker);
    this.sack.visible=s.phaseIndex>=6&&s.phaseIndex<=8&&s.sackKg>=0;
    const deckHeight=this.data.config.scale_deck_z_m||.35;
    this.sack.position.set(this.data.hopper.center_x,-s.transfer*1.82,deckHeight);
    const fill=this.bagSize?s.sackKg/this.bagSize:0;
    const sackHeight=.5465;
    this.sackBody.scale.set(lerp(.75,1,fill),lerp(.6,1,fill),1);
    const tieOn=s.cyclePhase==='amarre'||s.cyclePhase==='salida'||s.phaseIndex===7;
    this.tie.visible=tieOn;this.tie.position.z=sackHeight-.025;
    this.finishedBags.forEach((b,i)=>{b.visible=i<Math.min(12,s.completedSacks);});
    this.worker2.position.y=-1.17-((s.cyclePhase==='salida')?s.transfer*.2:0);
    const tying=s.cyclePhase==='amarre'||s.phaseIndex===7;
    this.worker2.userData.arms?.forEach((a,i)=>a.rotation.z=tying?Math.sin(s.cycleProgress*Math.PI*4)*(i?-.13:.13):0);
    this.flow.visible=s.runningFlow;
    if(this.flow.visible){
      const bulk=s.phaseIndex===5,z0=bulk?this.data.hopper.mouth_z+.025:deckHeight+.04+.445*clamp(s.sackKg/50),z1=bulk?C.support_z:.865,r=bulk?(this.mode==='closed'?.105:.075):.045;
      for(let i=0;i<160;i++){
        const angle=i*2.399963,rad=Math.sqrt((i*.618033)%1)*r,fall=(i*.071+this.progress*(bulk?70:260))%1;
        this.dummy.position.set(this.data.hopper.center_x+Math.cos(angle)*rad,Math.sin(angle)*rad,lerp(z1,z0,fall));
        this.dummy.scale.setScalar(.45+(i%5)*.11);this.dummy.rotation.set(i,i*.3,i*.7);this.dummy.updateMatrix();this.flow.setMatrixAt(i,this.dummy.matrix);
      }this.flow.instanceMatrix.needsUpdate=true;
    }
    this.equipmentDetails?.update(s);this.processDetails?.update(s);
    this.render();return {...s};
  }
  setMode(v) { if(this.accessOpen)return;this.mode=v==='closed'?'closed':'spout';this.setProgress(this.progress); }
  setBagSize(v) { if(this.accessOpen)return;this.bagSize=Number(v)===25?25:50;this.setProgress(this.progress); }
  setPayload(v) { if(this.accessOpen)return;this.payload=clamp(Number(v)||0,0,1000);this.setProgress(this.progress); }
  setAccessOpen(value) {
    const open=!!value,s=this.state;
    if(open&&(!s||s.phaseIndex<5||s.phaseIndex>=9||!s.lockingPin||Math.abs(s.z-this.data.config.support_z)>.001))return false;
    this.accessOpen=open;
    if(open)this.accessResetRequired=true;
    this.accessGateMeshes.forEach(mesh=>mesh.position.x=open?this.data.config.access_gate_travel_m:0);
    if(open){this.flow.visible=false;this.render();}
    else this.setProgress(this.progress);
    return this.accessOpen;
  }
  resetAccess() {
    if(this.accessOpen)return false;
    this.accessResetRequired=false;this.setProgress(this.progress);return true;
  }
  setEdges(v) { this.edgesOn=!!v;this.edgeLines.forEach(e=>e.visible=this.edgesOn);this.render(); }
  setSection(v) {
    this.section=!!v;
    this.sectionMeshes.forEach(mesh=>{mesh.material.clippingPlanes=this.section?[new THREE.Plane(new THREE.Vector3(0,1,0),0)]:[];
      mesh.material.transparent=this.section;mesh.material.opacity=this.section?.40:1;mesh.material.depthWrite=!this.section;mesh.material.needsUpdate=true;});
    this.applyDetailFocus(this.currentView);this.render();
  }
  applyDetailFocus(name) {
    const cutter=name==='cutter';
    this.sectionMeshes.forEach(mesh=>{
      if(mesh!==this.bag&&!/^TOL_GUARDA|^GUARDA_CORTE/.test(mesh.userData.part||''))return;
      mesh.material.transparent=this.section||cutter;mesh.material.opacity=this.section?.40:cutter?.16:1;
      mesh.material.depthWrite=!(this.section||cutter);mesh.material.needsUpdate=true;
    });
  }
  setDimensions(v) { this.dimensions.visible=!!v;this.render(); }
  setStyle(v) {
    this.renderStyle=v==='technical'?'technical':'realistic';this.workshop.applyStyle(this.renderStyle);
    this.camera=this.renderStyle==='technical'?this.technicalCamera:this.perspectiveCamera;
    this.controls.object=this.camera;this.setEdges(this.renderStyle==='technical');this.resize();this.setView(this.currentView);
  }
  setCameraMode(v) {
    this.cameraMode=v==='pan'?'pan':'rotate';
    this.controls.mouseButtons.LEFT=this.cameraMode==='pan'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;
    this.controls.touches.ONE=this.cameraMode==='pan'?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
    this.controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
    this.container.dataset.cameraMode=this.cameraMode;
  }
  setExploded(v) {
    this.exploded=!!v;
    const offsets={Porticos:[-.45,0,0],Tolva:[.35,0,.25],Plataforma:[0,.55,.08],Escalera:[-.5,.55,0],Barandas:[0,.55,.55],Monorriel:[0,0,.55],'Soporte bolsa':[0,0,.6],Complementos:[0,0,.05]};
    this.groupRoots.forEach((g,id)=>g.position.set(...(this.exploded?(offsets[id]||[0,0,0]):[0,0,0])));
    if(this.collectorDuct)this.collectorDuct.visible=!this.exploded;
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
    const C=this.data.config,H=this.data.hopper;this.currentView=name;
    const focus={discharge:{target:[H.center_x,0,C.support_z],offset:[2.8,-4,2.1],height:3.2},bagging:{target:[H.center_x,-.25,.55],offset:[0,-2.4,1.0],height:2.1},pickup:{target:[C.pickup_x,-.9,1.15],offset:[3.9,-5.1,2.8],height:4.2},
      hoist:{target:[this.state?.x??C.pickup_x,0,C.beam_bottom-.23],offset:[1.2,-1.65,.72],height:1.3},
      locks:{target:[C.discharge_x-.55,0,C.beam_bottom+.06],offset:[-1.2,-1.9,.85],height:1.5},
      cutter:{target:[H.center_x,0,C.support_z+.14],offset:[.65,2.25,.8],height:1.7},
      gate:{target:[H.center_x-.20,.18,H.outlet_z+.05],offset:[-.25,-1.6,.4],height:1.4},
      access:{target:[H.center_x,1.30,C.platform_floor_z_m+.45],offset:[-2.5,4,1.9],height:3.2},
      collector:{target:[this.collector.position[0],this.collector.position[1],.90],offset:[-1.8,-2.9,1.25],height:2.1},
      anchors:{target:[0,-1,.06],offset:[-1.25,-1.2,.8],height:1.05}};
    focus.discharge.target[2]=this.data.config.support_z;
    const overview=name==='iso'?[1.50,.25,this.data.config.beam_top/2-.25]:[1.6,.35,this.data.config.beam_top/2];
    const view=focus[name];this.controls.target.set(...(view?.target||overview));
    const t=this.controls.target,views={iso:[8.8,-12,8.4],front:[0,-16,.01],side:[16,0,.01],back:[0,16,.01],top:[0,-.001,17],left:[-16,0,.01]};
    const d=view?.offset||views[name]||views.iso;
    this.camera.up.copy(name==='top'?new THREE.Vector3(0,1,0):UP);
    this.camera.position.copy(t).add(new THREE.Vector3(...d));this.camera.zoom=this.camera.isOrthographicCamera&&view?2*this.camera.top/view.height:1;this.camera.updateProjectionMatrix();this.controls.update();this.applyDetailFocus(name);this.render();
  }
  resetCamera() { this.setView('iso'); }
  getState() { const info=this.renderer.info;return {...this.state,accessOpen:this.accessOpen,accessResetRequired:this.accessResetRequired,accessAvailable:this.state.phaseIndex>=5&&this.state.phaseIndex<9&&this.state.lockingPin,hoistEnabled:(this.accessOpen||this.accessResetRequired)?false:this.state.hoistEnabled,interlockState:this.accessOpen?'Acceso superior abierto · izaje y traslación bloqueados':this.accessResetRequired?'Puerta cerrada · rearme manual requerido':this.state.interlockState,selected:this.selected,section:this.section,edges:this.edgesOn,exploded:this.exploded,webgl:true,revision:this.data.revision,nativeParts:this.data.nativeParts,nativeComponents:this.data.nativeComponents,view:this.currentView,renderStyle:this.renderStyle,cameraMode:this.cameraMode,cameraPosition:this.camera.position.toArray(),cameraTarget:this.controls.target.toArray(),cameraZoom:this.camera.zoom,renderStats:{calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures}}; }
  resize() {
    const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight);
    this.renderer.setSize(w,h,false);const half=Math.max(4.05,(this.data.config.beam_top+.9)*.65),ratio=w/h;
    Object.assign(this.technicalCamera,{left:-half*ratio,right:half*ratio,top:half,bottom:-half});
    this.perspectiveCamera.aspect=ratio;this.perspectiveCamera.updateProjectionMatrix();this.technicalCamera.updateProjectionMatrix();this.render();
  }
  render() { if(this.renderer&&this.camera)this.renderer.render(this.scene,this.camera); }
  toggleFullscreen() { return document.fullscreenElement?document.exitFullscreen():this.container.requestFullscreen?.(); }
  dispose() {
    this.observer?.disconnect();this.controls?.dispose();
    this.workshop?.dispose();this.equipmentDetails?.dispose?.();this.processDetails?.dispose?.();
    this.renderer.domElement.removeEventListener('pointerdown',this.pointerDown);this.renderer.domElement.removeEventListener('pointerup',this.pointerUp);this.renderer.domElement.removeEventListener('keydown',this.keydown);
    this.scene.traverse(o=>{o.geometry?.dispose();if(o.material){const a=Array.isArray(o.material)?o.material:[o.material];a.forEach(m=>{m.map?.dispose();m.dispose();});}});
    this.renderer.dispose();this.renderer.domElement.remove();
  }
}
