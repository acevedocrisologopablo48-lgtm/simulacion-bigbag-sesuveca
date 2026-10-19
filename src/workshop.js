import * as THREE from '../assets/vendor/three.module.min.js';

function noiseTexture(kind) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'), image=ctx.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++) {
    const hash=Math.sin(x*127.1+y*311.7)*43758.5453, n=hash-Math.floor(hash);
    const v=kind==='concrete'?180+n*32+Math.sin(x*.07)*3:125+n*8;
    const i=(y*256+x)*4;image.data[i]=v;image.data[i+1]=v;image.data[i+2]=kind==='concrete'?v-4:v;image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  const map=new THREE.CanvasTexture(canvas);map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;
}

export function buildWorkshop(engine) {
  const {scene,renderer}=engine;
  const concrete=noiseTexture('concrete'),paint=noiseTexture('paint');
  concrete.repeat.set(14,14);
  scene.background=new THREE.Color('#d6dce0');scene.fog=new THREE.Fog('#d6dce0',29,70);
  renderer.toneMappingExposure=.95;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const hemi=new THREE.HemisphereLight(0xe7efff,0x807766,.65);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff1dd,2.6);
  sun.position.set(-4,-6,11);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-5,right:7,top:7,bottom:-6,near:.5,far:23});
  sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00015;sun.shadow.normalBias=.009;
  sun.shadow.radius=3;sun.target.position.set(1,0,2);scene.add(sun,sun.target);
  const fill=new THREE.DirectionalLight(0xc6deff,.45);fill.position.set(5,5,7);scene.add(fill);
  const rim=new THREE.DirectionalLight(0xffffff,.7);rim.position.set(1,4,9);scene.add(rim);

  // A studio environment gives curved metal real reflections without an external HDR image.
  const env=new THREE.Scene();env.background=new THREE.Color('#aebbc5');
  const room=new THREE.Mesh(new THREE.BoxGeometry(22,22,18),new THREE.MeshBasicMaterial({color:0x929da7,side:THREE.BackSide}));env.add(room);
  const panel=(w,h,pos,rotation,intensity)=>{
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(intensity),side:THREE.DoubleSide}));
    mesh.position.set(...pos);mesh.rotation.set(...rotation);env.add(mesh);
  };
  panel(7,12,[-5,-8,3],[Math.PI/2,0,-.3],5);panel(4,12,[8,4,5],[Math.PI/2,0,.6],3);
  panel(7,7,[0,0,8],[0,0,0],4);
  const generator=new THREE.PMREMGenerator(renderer);const environment=generator.fromScene(env,.05);
  scene.environment=environment.texture;generator.dispose();
  env.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});

  const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({
    color:'#a6aaa8',map:concrete,bumpMap:concrete,bumpScale:.007,roughness:.91,metalness:.02
  }));floor.position.z=-.032;floor.receiveShadow=true;scene.add(floor);
  const floorDetails=new THREE.Group();scene.add(floorDetails);
  const lineMat=new THREE.MeshStandardMaterial({color:'#d2ad45',roughness:.82,metalness:0});
  function floorStrip(w,h,x,y,material=lineMat){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);m.position.set(x,y,-.030);m.receiveShadow=true;floorDetails.add(m);}
  const joints=new THREE.MeshBasicMaterial({color:'#737d7f',transparent:true,opacity:.23});
  for(let i=-6;i<=6;i++){floorStrip(.008,32,i*3,0,joints);floorStrip(32,.008,0,i*3,joints);}
  for(const y of [-2.72,1.45])floorStrip(5.4,.045,1.25,y);
  floorStrip(.045,4.2,-1.45,-.64);floorStrip(.045,4.2,3.95,-.64);
  // Painted safety marks are a visual setting; the mechanical model is left intact.
  const markingCanvas=document.createElement('canvas');markingCanvas.width=1024;markingCanvas.height=128;
  const mc=markingCanvas.getContext('2d');mc.font='600 64px Arial';mc.textAlign='center';mc.textBaseline='middle';mc.fillStyle='#d4bc72';mc.fillText('ZONA DE IZAJE',512,64);
  const markingMap=new THREE.CanvasTexture(markingCanvas);markingMap.colorSpace=THREE.SRGBColorSpace;
  const marking=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.225),new THREE.MeshBasicMaterial({map:markingMap,transparent:true,depthWrite:false,opacity:.72}));
  marking.position.set(engine.data.config.pickup_x,-2.38,-.027);floorDetails.add(marking);
  const grid=new THREE.GridHelper(22,44,0x8da3ae,0xc0cbd0);grid.rotation.x=Math.PI/2;grid.position.z=-.024;grid.visible=false;grid.material.transparent=true;grid.material.opacity=.3;scene.add(grid);

  const materialFor=(color,kind)=> {
    const base={color,side:THREE.DoubleSide,envMapIntensity:.42};
    if(kind==='stainless')return new THREE.MeshStandardMaterial({...base,color:'#a9b5bc',metalness:.88,roughness:.27});
    if(kind==='zinc')return new THREE.MeshStandardMaterial({...base,color:'#a1aab2',metalness:.8,roughness:.36});
    if(kind==='rubber')return new THREE.MeshStandardMaterial({...base,color:'#252d31',metalness:0,roughness:.92});
    if(kind==='polymer')return new THREE.MeshStandardMaterial({...base,color:'#494d4a',metalness:0,roughness:.78});
    return new THREE.MeshPhysicalMaterial({...base,roughness:.4,metalness:.2,clearcoat:.28,clearcoatRoughness:.3,bumpMap:paint,bumpScale:.0008});
  };
  return {
    materialFor,grid,floorDetails,environment,
    applyStyle(style){const technical=style==='technical';grid.visible=technical;floorDetails.visible=!technical;
      floor.material.color.set(technical?'#d4dcdf':'#a6aaa8');scene.background.set(technical?'#edf2f4':'#d6dce0');
      scene.fog=technical?null:new THREE.Fog('#d6dce0',29,70);renderer.toneMappingExposure=technical?1.1:.95;
    },
    dispose(){environment.dispose();paint.dispose();concrete.dispose();markingMap.dispose();}
  };
}
