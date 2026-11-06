import * as THREE from '../assets/vendor/three.module.min.js';
import { OrbitControls } from '../assets/vendor/OrbitControls.js';
import { loadModel } from './model-data.js?v=p06mejoras20261106';
import { createVisualMaterials } from './visual-materials.js?v=p06mejoras20261106';

const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export const STAGES=[
 {start:0,end:.10,title:'Recepción del BigBag',short:'Recibir',detail:'El montacargas presenta el BigBag de 1 t sobre su pallet en la zona de enganche.'},
 {start:.10,end:.18,title:'Enganche de las cuatro asas',short:'Enganchar',detail:'El operario coloca cada asa en su gancho, cierra los seguros y retira el montacargas.'},
 {start:.18,end:.32,title:'Izaje vertical',short:'Izar',detail:'Desde la botonera fija, el operario eleva la bolsa hasta la altura de traslado.'},
 {start:.32,end:.42,title:'Traslado sobre la tolva',short:'Trasladar',detail:'El carro centra la bolsa sobre la tolva, con 80 cm libres entre la recepción superior y el fondo del BigBag elevado.'},
 {start:.42,end:.52,title:'Apoyo y conexión de descarga',short:'Apoyar y conectar',detail:'Con la bolsa apoyada y el tecle detenido, la manga se introduce en el sello flexible. Se abre por la cinta lateral y se despeja la plataforma.'},
 {start:.52,end:.84,title:'Descarga y ensacado',short:'Vaciar y ensacar',detail:'El BigBag descarga por la conexión cerrada. El operario gira la paleta central hasta 90°, pesa y retira sacos de 25 o 50 kg.'},
 {start:.84,end:.98,title:'Retorno del BigBag vacío',short:'Retornar',detail:'Con la descarga terminada y la compuerta cerrada, se libera la manga al elevar. La bolsa vuelve a recepción para recoger la manga y bajar al pallet.'},
 {start:.98,end:1,title:'Lote terminado',short:'Repetir el ciclo',detail:'La bolsa vacía está retirada, la compuerta cerrada y la balanza libre para recibir el siguiente BigBag.'}
];

export function processState(progress,config,sackSize=50){
 const p=clamp(progress),found=STAGES.findIndex(s=>p<s.end),index=found<0?7:found;
 const stage=STAGES[index],q=clamp((p-stage.start)/(stage.end-stage.start));
 const C=config,x0=C.pickup_x,x1=C.discharge_x,z0=C.pickup_bottom,zt=C.travel_bottom,zs=C.support_z;
 const target=sackSize===25?25:50,payload=C.process_payload_kg||1000,totalSacks=payload/target;
 let x=x0,z=z0,bagFill=1,hopperFill=0,gate=0,sackFill=0,sackMouthFold=0,removal=0,finished=0;
 let incomingKg=0,completedKg=0,activeSackKg=0;
 if(index===0)x=x0+2.4*(1-smooth(q));
 if(index===2)z=lerp(z0,zt,smooth(q));
 if(index===3){x=lerp(x0,x1,smooth(q));z=zt;}
 if(index===4||index===5){x=x1;z=index===4?lerp(zt,zs,smooth(q/.45)):zs;}
 if(index===5){
  // Inventory is conserved across the FIBC, hopper, active sack and finished sacks.
  incomingKg=payload*clamp(q/.55);
  const cycles=Math.min(totalSacks-1e-8,q*totalSacks),n=Math.floor(cycles),t=cycles-n;
  sackFill=clamp((t-.12)/.48);gate=t>=.12&&t<.60?(t>.48?.2:1):0;
  sackMouthFold=smooth((t-.64)/.12);removal=smooth((t-.76)/.24);finished=n;
  completedKg=n*target;activeSackKg=sackFill*target;
  bagFill=1-incomingKg/payload;hopperFill=(incomingKg-completedKg-activeSackKg)/payload;
 }
 if(index>=6){bagFill=0;incomingKg=payload;finished=totalSacks;completedKg=payload;}
 if(index===6){
  if(q<.10){x=x1;z=zs;}
  else if(q<.30){x=x1;z=lerp(zs,zt,smooth((q-.10)/.20));}
  else if(q<.55){x=lerp(x1,x0,smooth((q-.30)/.25));z=zt;}
  else if(q<.75){x=x0;z=lerp(zt,C.empty_bag_gathering_bottom_z_m??1,smooth((q-.55)/.20));}
  else if(q<.88){x=x0;z=C.empty_bag_gathering_bottom_z_m??1;}
  else{x=x0;z=lerp(C.empty_bag_gathering_bottom_z_m??1,z0,smooth((q-.88)/.12));}
 }
 const gatheringSpout=index===6&&q>=.75&&q<.88;
 const displayedStage=gatheringSpout?{...stage,title:'Recogida de la manga en recepción',detail:'Con la bolsa vacía detenida, el operario recoge y amarra la manga desde un lateral a nivel de suelo. Después se retira para continuar el descenso.'}:stage;
 const spoutDeployed=index===6?1-smooth((q-.77)/.08):index===5?1:index===4?smooth((q-.45)/.25):0;
 const spoutSealed=(index===4&&q>=.70)||index===5||(index===6&&q<=.10);
 const spoutOpen=(index===4&&q>=.88)||index===5||(index===6&&q<.84);
 const electricMotion=index===2||index===3||(index===4&&q<.45)||(index===6&&q>=.10&&q<.75)||(index===6&&q>=.88);
 return {progress:p,phaseIndex:index,phaseProgress:q,stage:displayedStage,x,z,bagFill,hopperFill,gate,sackFill,sackMouthFold,removal,finished,gatheringSpout,
  sackSize:target,hookM:(index===0?z0:z)+C.bag_height+C.headpack,spoutOpen,spoutDeployed,spoutSealed,electricMotion,
  bigbagKg:payload*bagFill,hopperKg:payload*hopperFill,activeSackKg,completedKg,
  incomingFlow:index===5&&q<.55,upperWorkerAtConnection:index===4&&q>=.45&&q<.96};
}

let active;
export const BigbagScene={
 async init(container){active?.dispose();active=new SceneEngine(container,await loadModel());return this;},
 setProgress(p){return active?.setProgress(p);},setView(name){active?.setView(name);},
 resetCamera(){active?.setView('iso');},setBagSize(v){active.sackSize=Number(v)===25?25:50;return active.setProgress(active.progress);},
 getState(){return active?.getState();},dispose(){active?.dispose();active=null;}
};
window.BigbagScene=BigbagScene;

class SceneEngine{
 constructor(container,data){
  this.container=container;this.data=data;this.progress=.42;this.sackSize=50;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#dce2e5');
  this.scene.fog=new THREE.Fog('#dce2e5',28,65);
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.8));
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.renderer.domElement.setAttribute('aria-label','Modelo CAD sombreado de la estación de bigbags');container.appendChild(this.renderer.domElement);
  this.finishes=createVisualMaterials(THREE,this.renderer);
  this.scene.environment=this.finishes.environment;
  this.contextMaterials=new Map();
  this.camera=new THREE.PerspectiveCamera(35,1,.025,100);this.camera.up.set(0,0,1);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.minDistance=.6;this.controls.maxDistance=35;this.controls.maxPolarAngle=Math.PI*.495;
  this.controls.addEventListener('change',()=>this.render());
  const hemi=new THREE.HemisphereLight('#f5f7fa','#687780',1.35);hemi.up.set(0,0,1);hemi.position.set(0,0,15);this.scene.add(hemi);
  const light=new THREE.DirectionalLight('#fff5e6',3.2);light.position.set(-4,-6,12);light.target.position.set(1.2,.7,2.5);light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-7;light.shadow.camera.right=7;light.shadow.camera.top=8;light.shadow.camera.bottom=-7;light.shadow.camera.near=.5;light.shadow.camera.far=30;light.shadow.normalBias=.018;light.shadow.bias=-.00003;light.shadow.radius=3;this.scene.add(light,light.target);
  const fill=new THREE.DirectionalLight('#dceaff',1.2);fill.position.set(7,5,8);this.scene.add(fill);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(50,50),this.finishes.concrete);ground.position.z=-.001;ground.receiveShadow=true;this.scene.add(ground);
  this.channels={};this.nativeCount=0;this.nativeVisible=0;
  const refs=/^(?:BIGBAG_1t_REF|CADENA_REF|ASA_REF_\d+|SACO_50kg_REF|FIBC_MANGA_DESCARGA_D350|FIBC_CINTA_APERTURA_LATERAL|pallet_referencia|balanza_envolvente)$/;
  const origins=data.nativeSTEPSource?.animationFramesGlobalM||{};
  for(const channel of ['static','cruceta','gate_blade','hoistMeshes','lockPinMeshes']){
   const group=new THREE.Group();this.channels[channel]=group;this.scene.add(group);group.position.fromArray(origins[channel]||[0,0,0]);
   for(const part of data[channel]||[]){
    this.nativeCount++;if(refs.test(part.tag)||part.visualContextOnly)continue;
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(part.v.flat(),3));
    const idx=[];for(const face of part.f){for(let i=1;i<face.length-1;i++)idx.push(face[0],face[i],face[i+1]);}geo.setIndex(idx);geo.computeVertexNormals();
    const color=Array.isArray(part.c)?new THREE.Color(...part.c.map(c=>c/255)).convertSRGBToLinear():part.c||'#42667b';
    const mesh=new THREE.Mesh(geo,this.cadMaterial(part,color));mesh.name=part.tag;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);this.nativeVisible++;
   }
  }
  this.buildContext();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();this.setView('iso');this.setProgress(.42);
 }
 material(color,options={}){
  if(color==='#b99a6b')return this.finishes.wood;
  if(color==='#303c43'||color==='#334149')return this.finishes.rubber;
  const key=String(color)+JSON.stringify(options);
  if(!this.contextMaterials.has(key))this.contextMaterials.set(key,new THREE.MeshStandardMaterial({color,roughness:.58,metalness:.12,envMap:this.finishes.environment,envMapIntensity:.65,side:THREE.DoubleSide,...options}));
  return this.contextMaterials.get(key);
 }
 cadMaterial(part,color){
  const tag=part.tag;
  if(/LINER_|GOMA|SELLO|CABLE|TOPE_TS75/.test(tag)||tag.startsWith('TOL_JUNTA'))return this.finishes.rubber;
  if(tag.startsWith('GANCHO_ASA_'))return this.finishes.paint('#b83a32');
  if(/ARANDELA|TUERCA|PERNO|TORNILLO|ANCLA|BOLT|NUT|WASHER|M8X|GRILLETE|GANCHO|CELDA|CASQUILLO/.test(tag)||tag.startsWith('AC_PELDANO')||tag.startsWith('AC_REJILLA_'))return this.finishes.galvanized;
  if(/^(TOL_CONO_|TOL_CUERPO_|TOL_TAPA_|TOL_RECEPTOR_|TOL_VENTEO_|MS0[12]|MG0[23456]|BALANZA_PLATO|MAN_ABRAZADERA)/.test(tag))return this.finishes.steel;
  if(tag==='TOL_FILTRO_VENTEO_REF')return this.finishes.cloth;
  if(part.group==='Barandas'||part.group==='Cruceta'||tag==='MON-01')return this.finishes.paint('#deb12a');
  if(['Porticos','Cimentacion','Plataforma','Escalera'].includes(part.group))return this.finishes.paint('#385c75');
  return this.finishes.paint(color);
 }
 box(parent,w,d,h,x,y,z,color){const m=new THREE.Mesh(new THREE.BoxGeometry(w,d,h),this.material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 cylinder(parent,r,h,x,y,z,color,open=false){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24,1,open),this.material(color));m.rotation.x=Math.PI/2;m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
 tube(parent,points,r,color){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const m=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(8,points.length*5),r,8,false),this.material(color,{metalness:0}));parent.add(m);return m;}
 cloth(){return this.finishes.cloth;}
 bagGeometry(w,d,h,neck=1){
  const v=[],uv=[],idx=[],n=64,rings=19;for(let j=0;j<rings;j++){const t=j/(rings-1),bulge=(.92+.08*Math.sin(t*Math.PI))*lerp(1,neck,clamp((t-.65)/.35));
   for(let i=0;i<n;i++){const a=i/n*Math.PI*2,c=Math.cos(a),s=Math.sin(a),fold=1-.016*Math.sin(a*11+t*3)**2*Math.sin(t*Math.PI);v.push(w/2*Math.sign(c)*Math.abs(c)**.28*bulge*fold,d/2*Math.sign(s)*Math.abs(s)**.28*bulge*fold,t*h);uv.push(i/(n-1)*2,t);}}
  for(let j=0;j<rings-1;j++)for(let i=0;i<n;i++){const a=j*n+i,b=j*n+(i+1)%n,c=(j+1)*n+(i+1)%n,d=(j+1)*n+i;idx.push(a,b,d,b,c,d);}
  for(let i=1;i<n-1;i++)idx.push(0,i+1,i,(rings-1)*n,(rings-1)*n+i,(rings-1)*n+i+1);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
 }
 roundedBox(parent,w,d,h,x,y,z,color,r=.04){
  const radius=Math.min(r,w/2,d/2),shape=new THREE.Shape();
  shape.moveTo(-w/2+radius,-d/2);shape.lineTo(w/2-radius,-d/2);shape.quadraticCurveTo(w/2,-d/2,w/2,-d/2+radius);
  shape.lineTo(w/2,d/2-radius);shape.quadraticCurveTo(w/2,d/2,w/2-radius,d/2);shape.lineTo(-w/2+radius,d/2);
  shape.quadraticCurveTo(-w/2,d/2,-w/2,d/2-radius);shape.lineTo(-w/2,-d/2+radius);shape.quadraticCurveTo(-w/2,-d/2,-w/2+radius,-d/2);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,curveSegments:5});geometry.translate(0,0,-h/2);
  const mesh=new THREE.Mesh(geometry,this.material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
 }
 palletGeometry(parent,w,d,h){
  const top=.028,blockHeight=h-top-.018;
  for(const x of [-w*.36,0,w*.36]){
   this.box(parent,.13,d,.018,x,0,.009,'#b99a6b');
   for(const y of [-d*.36,0,d*.36])this.box(parent,.13,.14,blockHeight,x,y,.018+blockHeight/2,'#b99a6b');
  }
  for(let i=0;i<7;i++)this.box(parent,w/7*.87,d,top,-w/2+w/14+i*w/7,0,h-top/2,'#b99a6b');
 }
 buildContext(){
  const C=this.data.config;this.bag=new THREE.Group();this.scene.add(this.bag);
  this.bagBody=new THREE.Mesh(this.bagGeometry(C.bag_width,C.bag_width,C.bag_height),this.cloth());this.bagBody.castShadow=true;this.bag.add(this.bagBody);
  for(const x of [-C.bag_width/2,C.bag_width/2])for(const y of [-C.bag_width/2,C.bag_width/2]){
   this.tube(this.bag,[[x,y,C.bag_height*.95],[x,y,C.bag_height+.04],[x,y,C.bag_height+.25],[x+.035,y,C.bag_height+.24],[x+.035,y,C.bag_height]],.014,'#d3d7d1');
   this.tube(this.bag,[[x*.92,y*.92,.03],[x,y,C.bag_height*.5],[x*.93,y*.93,C.bag_height*.95]],.004,'#c1c7c3');
  }
  this.spout=this.cylinder(this.bag,.175,.35,0,0,-.175,'#e5e6dc',true);
  this.tie=new THREE.Mesh(new THREE.TorusGeometry(.177,.006,6,28),this.material('#98855a'));this.bag.add(this.tie);
  this.chain=new THREE.Group();this.scene.add(this.chain);
  this.chain1=this.cylinder(this.chain,.008,1,0,0,0,'#3d4a50');this.chain2=this.cylinder(this.chain,.008,1,.035,0,0,'#526068');
  this.hook=new THREE.Mesh(new THREE.TorusGeometry(.055,.014,8,22,Math.PI*1.6),this.material('#ab9a66'));this.hook.rotation.x=Math.PI/2;this.chain.add(this.hook);
  this.pallet=new THREE.Group();this.scene.add(this.pallet);this.palletGeometry(this.pallet,1.1,1.1,.15);
  this.sack=new THREE.Group();this.scene.add(this.sack);
  this.sackBody=new THREE.Mesh(this.bagGeometry(.46,.46,.5465,.59),this.cloth());this.sackBody.castShadow=true;this.sack.add(this.sackBody);this.sackBase=new Float32Array(this.sackBody.geometry.getAttribute('position').array);
  this.output=new THREE.Group();this.scene.add(this.output);this.output.position.set(-1.25,-1.7,0);this.palletGeometry(this.output,1.15,1,.13);this.outputSacks=[];
  for(let i=0;i<8;i++){const sack=new THREE.Mesh(this.bagGeometry(.46,.38,.32,.88),this.cloth());sack.position.set((i%2-.5)*.49,(Math.floor(i/2)%2-.5)*.42,.13+Math.floor(i/4)*.32);sack.castShadow=true;sack.receiveShadow=true;this.output.add(sack);this.outputSacks.push(sack);}
  this.buildForklift();
  this.flow=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.016,0),this.material('#303538',{roughness:1,metalness:0}),64);this.scene.add(this.flow);this.dummy=new THREE.Object3D();
  this.coal=this.box(this.scene,1.50,1.50,.015,C.discharge_x,0,2.62,'#303538');
 }
 buildForklift(){
  const f=new THREE.Group();this.forklift=f;this.scene.add(f);
  this.roundedBox(f,1.03,1.4,.53,0,-.8,.46,'#d9a333',.10);this.roundedBox(f,.9,.44,.65,0,-1.22,.66,'#d9a333',.09);this.roundedBox(f,.6,.48,.13,0,-.7,.98,'#33474e',.05);this.roundedBox(f,.6,.10,.38,0,-.90,1.17,'#33474e',.04);
  for(const x of [-.54,.54])for(const y of [-.34,-1.16]){
   const wheel=this.cylinder(f,.23,.16,x,y,.24,'#303c43');wheel.rotation.set(0,0,Math.PI/2);
   const hub=this.cylinder(f,.105,.166,x,y,.24,'#889399');hub.rotation.set(0,0,Math.PI/2);hub.material=this.finishes.steel;
   for(const offset of [-.055,.055]){const tread=new THREE.Mesh(new THREE.TorusGeometry(.218,.010,6,28),this.finishes.rubber);tread.rotation.y=Math.PI/2;tread.position.set(x+offset,y,.24);f.add(tread);}
  }
  for(const x of [-.43,.43]){this.box(f,.075,.07,2.45,x,.04,1.36,'#3b5666');this.box(f,.05,.06,1.35,x,-1.3,1.25,'#3b5666');this.box(f,.05,.06,1.1,x,-.20,1.48,'#3b5666');}
  this.box(f,.94,1.25,.06,0,-.75,2,'#3b5666');for(const x of [-.255,.255]){this.box(f,.10,1.03,.045,x,.52,.0775,'#6b7a82');this.box(f,.1,.055,.62,x,.025,.36,'#6b7a82');}
  this.box(f,.9,.05,.06,0,.012,.75,'#3b5666');
  const steering=new THREE.Mesh(new THREE.TorusGeometry(.105,.012,7,22),this.finishes.rubber);steering.rotation.x=.45;steering.position.set(0,-.28,1.14);f.add(steering);
 }
 setProgress(p){
  this.progress=clamp(Number(p)||0);const C=this.data.config,s=processState(this.progress,C,this.sackSize);this.state=s;
  this.bag.visible=s.phaseIndex!==7;this.bag.position.set(s.x,0,s.z); // Generic FIBC envelope is held constant; no cloth analysis is implied.
  this.spout.scale.y=Math.max(.06,s.spoutDeployed);this.spout.position.z=-.175*Math.max(.06,s.spoutDeployed);this.tie.position.z=-.27*s.spoutDeployed;this.tie.visible=!s.spoutOpen;
  this.channels.cruceta.position.set(s.phaseIndex===0?C.pickup_x:s.x,0,(s.phaseIndex===0?C.pickup_bottom:s.z)+C.cruceta_center_above_bag_m);
  this.channels.hoistMeshes.position.x=s.phaseIndex===0?C.pickup_x:s.x;
  const rotary=C.manual_gate_motion;
  if(rotary?.kind==='rotation'){
   this.channels.gate_blade.position.fromArray(rotary.pivot_m);
   this.channels.gate_blade.quaternion.setFromAxisAngle(new THREE.Vector3(...rotary.axis),rotary.open_angle_rad*s.gate);
  }else{
   const travel=C.manual_gate_travel||C.manual_gate_travel_m||[0,-.28,0];this.channels.gate_blade.position.set(...travel.map(v=>v*s.gate));
  }
  this.chain.position.x=s.phaseIndex===0?C.pickup_x:s.x;const chainTop=C.beam_bottom-.15,chainBottom=s.hookM+.045,length=Math.max(.025,chainTop-chainBottom);
  for(const line of [this.chain1,this.chain2]){line.position.z=(chainTop+chainBottom)/2;line.scale.y=length;}this.hook.position.z=s.hookM;
  const receptionX=s.phaseIndex===0?s.x:C.pickup_x;this.pallet.position.set(receptionX,0,0);this.pallet.visible=s.phaseIndex<2||s.phaseIndex>=6;
  this.forklift.visible=s.phaseIndex<2;this.forklift.rotation.z=Math.PI/2;this.forklift.position.set(receptionX+.64+(s.phaseIndex===1?2.5*smooth(s.phaseProgress):0),0,0);
  this.sack.visible=s.phaseIndex===4||s.phaseIndex===5;this.sack.position.set(lerp(C.discharge_x,-1.25,clamp((s.removal-.55)/.45)),lerp(0,-1.7,clamp(s.removal/.55)),C.scale_deck_z_m??.35);
  const sackPositions=this.sackBody.geometry.getAttribute('position');for(let i=0;i<this.sackBase.length;i+=3){const top=this.sackBase[i+2]/.5465,neckWeight=smooth((top-.75)/.25),factor=lerp(lerp(.65,1,s.sackFill),1,smooth((top-.55)/.45))*(1-.75*s.sackMouthFold*neckWeight);sackPositions.array[i]=this.sackBase[i]*factor;sackPositions.array[i+1]=this.sackBase[i+1]*factor;sackPositions.array[i+2]=this.sackBase[i+2]-.07*s.sackMouthFold*neckWeight;}sackPositions.needsUpdate=true;this.sackBody.geometry.computeVertexNormals();
  this.output.visible=s.finished>0;this.outputSacks.forEach((m,i)=>m.visible=i<Math.min(8,s.finished));
  this.coal.visible=s.hopperFill>.025;this.coal.position.z=lerp(1.25,2.62,s.hopperFill);const coalW=lerp(.25,1.50,clamp((this.coal.position.z-1.1)/1.2124));this.coal.scale.set(coalW/1.5,coalW/1.5,1);
  this.flow.visible=s.incomingFlow;
  for(let i=0;i<64;i++){const t=(i/64+s.progress*17)%1;this.dummy.position.set(C.discharge_x+.12*Math.sin(i*2.399),.12*Math.cos(i*2.399),lerp(C.support_z-.35,Math.max(1.4,this.coal.position.z),t));this.dummy.updateMatrix();this.flow.setMatrixAt(i,this.dummy.matrix);}this.flow.instanceMatrix.needsUpdate=true;
  this.render();return s;
 }
 setView(name){
  const C=this.data.config;const views={iso:[[10,-13,9],[1.3,.6,3.1]],front:[[1.6,-17,4.6],[1.6,.5,3.25]],back:[[8,13,8],[1.5,.8,2.9]],bagging:[[-1.4,-4.5,2.45],[C.discharge_x,-.10,1.0]]};
  const [eye,target]=views[name]||views.iso;this.camera.position.set(...eye);this.controls.target.set(...target);this.controls.update();this.render();
 }
 resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);this.render();}
 render(){this.renderer.render(this.scene,this.camera);}
 getState(){return {...this.state,gateRotationRad:this.channels.gate_blade.rotation.x,gateMotionType:this.data.config.manual_gate_motion?.kind,nativeComponents:this.nativeCount,visibleNativeComponents:this.nativeVisible,sourceStepSha256:this.data.nativeSTEPSource?.stepSha256,webgl:true};}
 dispose(){this.observer.disconnect();this.controls.dispose();const geometries=new Set(),materials=new Set();this.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.finishes.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
