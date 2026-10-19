import * as THREE from '../assets/vendor/three.module.min.js';

// Commercial reference for the viewer; component detail is a visual model.
export const collectorSpec={
  model:'Depureco DF22 DEX 1/3D',code:'A1750',powerKW:2.2,binL:65,
  footprintM:[.66,.80],heightM:1.63,position:[-1.45,-.8,-.03],
  inletLocal:[0,-.36,1.03],inletDiameterM:.15,
  manufacturerURL:'https://www.depureco.com/es/aspiradores-industriales/df075-22-dex-13d-desempolvador-industrial-certificado-atex/'
};

export function buildCollector(engine){
  const S=collectorSpec,G=new THREE.Group();G.name='Colector DF22 DEX';
  G.position.set(...S.position);engine.group('Colector').add(G);
  const paint=new THREE.MeshStandardMaterial({color:'#344553',metalness:.45,roughness:.4});
  const stainless=new THREE.MeshStandardMaterial({color:'#b7c1c6',metalness:.85,roughness:.29});
  const black=new THREE.MeshStandardMaterial({color:'#20272b',metalness:.15,roughness:.7});
  const yellow=new THREE.MeshStandardMaterial({color:'#d4aa35',roughness:.48});
  const red=new THREE.MeshStandardMaterial({color:'#9f3029',roughness:.5});
  const add=(geo,mat,p,label)=>{
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(...p);
    mesh.castShadow=mesh.receiveShadow=true;
    mesh.userData={group:'Colector',part:label,equipmentDetail:true,
      label:`${label} · ${S.model} · 2,2 kW · depósito 65 L · referencia comercial`};
    G.add(mesh);engine.parts.push(mesh);return mesh;
  };
  const box=(size,p,mat,label)=>add(new THREE.BoxGeometry(...size),mat,p,label);
  const cyl=(r,h,p,axis,mat,label,r2=r)=>{
    const m=add(new THREE.CylinderGeometry(r2,r,h,40),mat,p,label);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...axis));return m;
  };
  const tube=(points,r,mat,label)=>add(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,8,false),mat,[0,0,0],label);
  const ring=(r,p,mat,label)=>add(new THREE.TorusGeometry(r,.006,8,48),mat,p,label);

  // Four braked castors support the chassis at the same floor elevation.
  for(const x of [-.27,.27])for(const y of [-.32,.32]){
    cyl(.06,.045,[x,y,.06],[1,0,0],black,'Rueda del colector');
    cyl(.023,.052,[x,y,.06],[1,0,0],stainless,'Eje de rueda');
    box([.052,.045,.055],[x,y,.1175],stainless,'Soporte de rueda');
    cyl(.027,.016,[x,y,.143],[0,0,1],stainless,'Pivote de rueda');
    if(y<0)box([.035,.055,.012],[x,y-.036,.09],red,'Freno de rueda');
  }
  for(const x of [-.27,.27])box([.045,.70,.04],[x,0,.166],paint,'Bastidor inferior');
  for(const y of [-.32,.32])box([.585,.045,.04],[0,y,.166],paint,'Bastidor inferior');
  for(const x of [-.29,.29])box([.035,.045,.78],[x,.23,.556],paint,'Soporte de cámara de filtro');
  box([.615,.045,.035],[0,.23,.94],paint,'Travesaño de cámara');

  cyl(.24,.46,[0,0,.43],[0,0,1],stainless,'Depósito extraíble de polvo, 65 L');
  ring(.24,[0,0,.205],stainless,'Borde inferior de depósito');
  ring(.245,[0,0,.66],stainless,'Cierre estanco del depósito');
  for(const x of [-.10,.10])box([.018,.035,.018],[x,-.242,.46],stainless,'Anclaje del asa de depósito');
  tube([[-.10,-.25,.46],[-.10,-.285,.46],[.10,-.285,.46],[.10,-.25,.46]],.009,black,'Asa del depósito');
  tube([[-.27,.20,.50],[-.285,.04,.56],[-.27,-.13,.59],[.27,-.13,.59],[.285,.04,.56],[.27,.20,.50]],.009,stainless,'Palanca de extracción del depósito');
  cyl(.25,.66,[0,0,.995],[0,0,1],paint,'Cámara de filtro antiestático clase M');
  ring(.252,[0,0,.675],stainless,'Aro de cierre de cámara');
  ring(.252,[0,0,1.31],stainless,'Cierre superior de cámara');
  for(const x of [-.18,.18])box([.018,.035,.07],[x,-.184,1.285],stainless,'Cierre de tapa');

  // Side inlet and its flange are continuous with the incoming duct.
  cyl(.075,.11,[0,-.305,1.03],[0,1,0],stainless,'Toma de extracción DN150');
  const flange=cyl(.10,.012,[0,-.254,1.03],[0,1,0],stainless,'Brida de conexión DN150');
  for(let i=0;i<4;i++){
    const a=Math.PI/4+i*Math.PI/2;
    cyl(.006,.018,[Math.cos(a)*.087,-.266,1.03+Math.sin(a)*.087],[0,1,0],black,'Perno de brida');
  }
  cyl(.029,.018,[.19,-.175,1.18],[0,-1,0],black,'Indicador de depresión');
  const gauge=cyl(.025,.002,[.19,-.185,1.18],[0,-1,0],stainless,'Carátula del indicador');
  box([.025,.003,.002],[.19,-.187,1.18],red,'Aguja del indicador');
  tube([[.23,.04,1.08],[.29,.04,1.08],[.29,-.10,1.08]],.008,stainless,'Palanca de limpieza manual del filtro');
  cyl(.014,.07,[.29,-.10,1.08],[0,1,0],black,'Empuñadura de limpieza');
  tube([[-.27,.23,.91],[-.27,.31,1.04],[.27,.31,1.04],[.27,.23,.91]],.012,stainless,'Asa de empuje');

  cyl(.19,.10,[0,0,1.37],[0,0,1],paint,'Carcasa del ventilador');
  cyl(.095,.19,[0,0,1.515],[0,0,1],black,'Motor del ventilador, 2,2 kW');
  for(let i=0;i<9;i++)cyl(.105,.006,[0,0,1.438+i*.018],[0,0,1],paint,'Aletas de refrigeración del motor');
  cyl(.11,.02,[0,0,1.62],[0,0,1],black,'Protección del motor');
  cyl(.064,.14,[.23,0,1.37],[1,0,0],paint,'Salida de aire filtrado');
  cyl(.065,.014,[.307,0,1.37],[1,0,0],black,'Protección de salida de aire');
  for(const d of [-.04,-.02,0,.02,.04])box([.004,.105,.004],[.316,0,1.37+d],stainless,'Rejilla de salida');
  box([.10,.065,.15],[.23,.14,1.11],stainless,'Caja de mando del colector');
  cyl(.018,.012,[.23,.10,1.13],[0,-1,0],red,'Seccionador del colector');

  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=432;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#e5e9e8';ctx.fillRect(0,0,768,432);
  ctx.textAlign='center';ctx.fillStyle='#18323d';ctx.font='bold 92px Arial';ctx.fillText('DEPURECO',384,113);
  ctx.font='bold 58px Arial';ctx.fillText('DF22 DEX',384,205);
  ctx.font='39px Arial';ctx.fillText('2,2 kW · 65 L',384,276);
  ctx.font='31px Arial';ctx.fillText('REFERENCIA COMERCIAL',384,355);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const label=add(new THREE.PlaneGeometry(.31,.174),new THREE.MeshStandardMaterial({map:texture,roughness:.7}),[0,-.253,.87],'Placa del colector');label.rotation.x=Math.PI/2;
  box([.062,.006,.054],[-.15,-.20,1.18],yellow,'Identificación del equipo');
  tube([[.29,.16,1.07],[.32,.20,.8],[.32,.20,.2],[.26,.2,.17]],.005,black,'Cable recogido del colector');

  const inlet=new THREE.Vector3(...S.inletLocal).add(new THREE.Vector3(...S.position));
  G.userData={commercialReference:true,model:S.model,footprintM:S.footprintM,heightM:S.heightM};
  return{root:G,inlet,position:S.position,spec:S};
}
