// Deterministic presentation poses. This is a sequence diagram with conserved
// mass, not a cloth, granular-flow, actuator or safety-circuit simulation.
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
const mix = (a, b, t) => a + (b - a) * t;
const vector = (a, b, t) => a.map((x, i) => mix(x, b[i], t));

const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const finiteVector=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);

function springHelix(motion){
  const {axis,radialBasisU:u,radialBasisV:v,helixOriginM:origin}=motion;
  if(motion.kind!=='pitch_change'||![axis,u,v,origin].every(finiteVector)||
     [axis,u,v].some(a=>Math.abs(Math.hypot(...a)-1)>1e-8)||
     Math.max(Math.abs(dot(axis,u)),Math.abs(dot(axis,v)),Math.abs(dot(u,v)))>1e-8||
     ![motion.centerlineAxialLengthMm,motion.meanDiameterMm,motion.wireMm,motion.totalTurns].every(x=>Number.isFinite(x)&&x>0)){
    throw new Error(`Metadatos helicoidales incompletos: ${motion.group||''}`);
  }
  if(!/^gate_(?:return|fine)_spring_[12]$/.test(motion.group))throw new Error(`Grupo de resorte desconocido: ${motion.group}`);
  return {axis,u,v,origin,radius:motion.meanDiameterMm/2000,
    length:motion.centerlineAxialLengthMm/1000,turns:motion.totalTurns,wire:motion.wireMm/1000};
}

// Project the vertices of the exported STEP wire onto its actual helix once.
// A change in pitch then moves each turn without scaling wire thickness.
// This is a presentation deformation, independent of the exact BRep sweep.
export function springVertexWeights(positions,motion){
  const h=springHelix(motion),weights=new Float32Array(positions.length/3);
  const pitch=h.length/(h.turns*2*Math.PI),thetaMax=h.turns*2*Math.PI;
  if(positions.length%3)throw new Error('La malla del resorte requiere coordenadasXYZ.');
  for(let i=0;i<weights.length;i++){
    const p=[0,1,2].map(j=>positions[3*i+j]-h.origin[j]);
    const a=dot(p,h.axis),x=dot(p,h.u),y=dot(p,h.v),r=Math.hypot(x,y);
    if(h.endEyesRigid||motion.endEyesRigid){
      if(r<h.radius-h.wire/2-1e-5){weights[i]=a<h.length/2?0:1;continue;}
    }
    let phase=Math.atan2(y,x);if(phase<0)phase+=2*Math.PI;
    const turn=Math.round(a/pitch/(2*Math.PI)-phase/(2*Math.PI));
    let theta=clamp(phase+turn*2*Math.PI,0,thetaMax);
    for(let iteration=0;iteration<7;iteration++){
      const cs=Math.cos(theta),sn=Math.sin(theta);
      const rx=h.radius*cs-x,ry=h.radius*sn-y,ra=pitch*theta-a;
      const derivative=rx*(-h.radius*sn)+ry*(h.radius*cs)+ra*pitch;
      const second=h.radius*h.radius+pitch*pitch-rx*h.radius*cs-ry*h.radius*sn;
      if(Math.abs(second)<1e-14)break;
      const next=clamp(theta-clamp(derivative/second,-Math.PI/2,Math.PI/2),0,thetaMax);
      if(Math.abs(next-theta)<1e-12){theta=next;break;}theta=next;
    }
    weights[i]=theta/thetaMax;
  }
  return weights;
}

export function deformSpringPositions(base,weights,motion,gateMm,camMm,target=new Float32Array(base.length)){
  const h=springHelix(motion),isReturn=motion.group.startsWith('gate_return_');
  const maximum=isReturn?motion.shorteningMm:motion.extensionMm;
  if(!Number.isFinite(maximum)||maximum<0||weights.length*3!==base.length||target.length!==base.length)throw new Error('Carrera o malla de resorte inválida.');
  const amount=clamp((isReturn?gateMm:camMm)||0,0,maximum)/1000;
  for(let i=0;i<weights.length;i++){
    const offset=amount*(isReturn?1-weights[i]:weights[i]);
    for(let j=0;j<3;j++)target[3*i+j]=base[3*i+j]+h.axis[j]*offset;
  }
  return target;
}

// Same closed-wall bellows as the STEP project envelope. The upper cuff stays
// fixed, lower cuff follows the collar; each meridian generator keeps length.
// This drawing deformation is not a material/cloth constitutive simulation.
export function deformBellowsPositions(base,dropMm,contract,target=new Float32Array(base.length)){
  const d=clamp(dropMm||0,0,100)/1000;
  if(base.length%3||target.length!==base.length||contract?.fold_count!==10||
     contract.compressed_active_length_mm!==25||contract.extended_active_length_mm!==125)throw new Error('Contrato de manga flexible incompatible.');
  const wall=contract.wall_radial_mm/1000,half=contract.meridian_half_generator_length_mm/1000;
  const amplitude=Math.sqrt(Math.max(0,half*half-((.025+d)/20)**2));
  for(let i=0;i<base.length;i+=3){
    const x=base[i]-.85,y=base[i+1],z=base[i+2],r=Math.hypot(x,y);
    const u=clamp((z-.9365)/.025),fold=u*20,triangle=1-Math.abs((fold%2)-1);
    const active=z>.9365+1e-6&&z<.9615-1e-6;
    const layer=clamp((r-(.128+.009*triangle))/wall);
    const newRadius=active?.128+amplitude*triangle+wall*layer:r;
    target[i]=.85+(r?x/r*newRadius:0);target[i+1]=r?y/r*newRadius:0;
    target[i+2]=z-d*(1-u);
  }
  return target;
}

export function pointOnRoute(points, progress) {
  if (!Array.isArray(points) || points.length < 2 || points.some(p => !Array.isArray(p) || p.length !== 3 || p.some(x => !Number.isFinite(x)))) {
    throw new Error('La trayectoria del saco requiere al menos dos puntos XYZ finitos.');
  }
  const lengths = points.slice(1).map((p, i) => Math.hypot(...p.map((x, j) => x - points[i][j])));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total) return [...points[0]];
  let remaining = clamp(progress) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) return vector(points[i], points[i + 1], lengths[i] ? clamp(remaining / lengths[i]) : 0);
    remaining -= lengths[i];
  }
  return [...points.at(-1)];
}

export function selectedSackRoute(state, data) {
  const rejected = data.functional3D?.visualization?.reject_sack_indices || [];
  // Deliberate rejection is a presentation parameter. A partial tail is also
  // segregated; its actual weight is never relabelled as a nominal25/50kg sack.
  return state.sackTargetKg < state.bagSize - 1e-8 || rejected.includes(state.activeSackIndex) ? 'rejected' : 'accepted';
}

export function transferPose(state, data) {
  const routes = data.functional3D?.routes;
  const routeName = state.sackRoute || selectedSackRoute(state, data);
  const fillDeck = routes?.reception_deck_z ?? data.config.scale_deck_z_m ?? .35;
  const transferDeck = routes?.transfer_deck_z ?? data.config.table_transfer_deck_z_m ?? .25;
  const t = state.cyclePhase === 'salida' ? clamp(state.transferProgress ?? state.cycleProgress) : 0;
  const sequential=Boolean(data.functional3D?.completionContracts?.retentions?.collar_sequential_completion||data.functional3D?.completionContracts?.retentions?.sequential_collar);
  const lowering = smooth((t - .05) / (sequential?.09:.17));
  const restored = smooth((t - (sequential?.94:.88)) / (sequential?.06:.12));
  const tableFactor = lowering * (1 - restored);
  const collarRelativeFactor=sequential?smooth((t-.14)/.08)*(1-smooth((t-.88)/.06)):tableFactor;
  const tableDz=(transferDeck-fillDeck)*tableFactor;
  const collarRelativeDz=(fillDeck-transferDeck)*collarRelativeFactor;
  const collarDz=tableDz+collarRelativeDz;
  let movement = clamp((t - .32) / .50);
  const fallback = [[data.hopper.center_x, 0, fillDeck], [data.hopper.center_x, 0, transferDeck],
                    [data.hopper.center_x, -1.82, transferDeck]];
  const points = routes?.[routeName] || fallback;
  const loweredRoute = points.slice(1);
  let sackPosition = vector(points[0], points[1], lowering);
  if (t >= .32) sackPosition = pointOnRoute(loweredRoute, movement);
  const reject = routeName === 'rejected';
  const orderedPopup=Boolean(data.functional3D?.completionContracts?.transfer);
  const diverterFactor = reject ? (orderedPopup ? smooth((t - .60) / .06) : smooth((t - .22) / .10)) * (1 - smooth((t - .82) / .06)) : 0;
  let longitudinalRunning=t>.32&&t<.82, rejectBeltsRunning=false;
  if(reject&&orderedPopup){
    const down=points[2],up=points[3],destination=points.at(-1);
    if(t>=.32&&t<.60){
      sackPosition=vector(points[1],down,clamp((t-.32)/.28));
    }else if(t>=.60&&t<.66){
      // The belts start20mm below the roller deck. The sack rises only
      // after they contact it; the final20mm aligns to the reject branch.
      const rise=Math.max(0,.04*diverterFactor-.02);
      sackPosition=[down[0],down[1],down[2]+rise];
    }else if(t>=.66){
      sackPosition=vector(up,destination,clamp((t-.66)/.16));
    }
    longitudinalRunning=t>.32&&t<.60;
    rejectBeltsRunning=t>.66&&t<.82;
    movement=t<.60?.62*clamp((t-.32)/.28):t<.66?.62:.62+.38*clamp((t-.66)/.16);
  }
  const clampOpenFactor = smooth(t / .05);
  return { tableFactor, tableDz,
    collarDz, collarRelativeDz, sequentialCollar:sequential,
    deckZ: fillDeck + (transferDeck - fillDeck) * tableFactor,
    diverterFactor, diverterDz: .04 * diverterFactor, sackPosition,
    routeName, routeMovement: movement, clampOpenFactor,
    clampReleased: clampOpenFactor >= 1 - 1e-10,
    sackClearOfCollar: t >= .22, rollersRunning: longitudinalRunning,
    rejectBeltsRunning, orderedPopup,
    sackAtExit: t >= .82, tableRestored: t === 0 || t >= 1,
    transferProgress: t, source: routes ? 'functional3D.routes' : 'legacy_fallback',
    limitations: 'Poses nominales; no acredita deformación de tela, flujo, colisiones ni tiempos físicos.' };
}

export function pinPose(state, data) {
  const q = state.phaseProgress;
  let withdrawn = state.lockingPin ? 0 : 1;
  if (state.phaseIndex === 4) withdrawn = 1 - smooth((q - .02) / .06);
  if (state.phaseIndex === 9) withdrawn = smooth((q - .24) / .06);
  return { withdrawnFraction: withdrawn, dy: (data.functional3D?.pin_withdrawal_m ?? data.config.pin_withdrawal_m ?? .1) * withdrawn };
}

export function releasedFineGateMm(camMm,contract){
  const k=contract?.fineReleaseKinematics;
  if(!k||![k.faceAngleDeg,k.rollerRadiusMm,k.rollerCenterZMm,k.camTopZAtFreeMm,
      k.rollerCenterYAtClosedMm,k.camTopYMm].every(Number.isFinite))throw new Error('Falta el recorrido geométrico de liberación del tope fino.');
  const raised=contract.fineCamStrokeMm,fine=contract.positionsMm.fine;
  const p=clamp(camMm,0,raised),alpha=k.faceAngleDeg*Math.PI/180,R=k.rollerRadiusMm;
  const height=k.rollerCenterZMm-k.camTopZAtFreeMm;
  const pFace=height-R*Math.sin(alpha),pFree=height-R,corner=k.camTopYMm-k.rollerCenterYAtClosedMm;
  let q;
  if(p>=pFace)q=fine+(p-raised)*Math.tan(alpha);
  else if(p>=pFree)q=corner+Math.sqrt(Math.max(0,R*R-(height-p)**2));
  else q=pFree>0?corner*p/pFree:0;
  return clamp(q,0,fine);
}

// Normalized presentation phases preserve the mechanical order. Their
// durations are illustrative and are never used as commissioned PLC timers.
export function dosingActuationPose(progress,contract){
  const t=clamp(progress),open=contract.positionsMm.open,fine=contract.positionsMm.fine;
  const raised=contract.fineCamStrokeMm;
  let gateMm=0,camMm=0,phase='Cerrado';
  if(t<.08){gateMm=open*smooth(t/.08);phase='Apertura';}
  else if(t<.12){gateMm=open;camMm=raised*smooth((t-.08)/.04);phase='Preparación de fino';}
  else if(t<.58){gateMm=open;camMm=raised;phase='Grueso';}
  else if(t<.64){gateMm=mix(open,fine,smooth((t-.58)/.06));camMm=raised;phase='Transición a fino';}
  else if(t<.90){gateMm=fine;camMm=raised;phase='Fino';}
  else if(t<1){camMm=raised*(1-smooth((t-.90)/.10));gateMm=releasedFineGateMm(camMm,contract);phase='Cierre por resorte';}
  return {gateMm,camMm,camFactor:raised?camMm/raised:0,phase,
    source:'completionContracts.gate; presentación geométrica',physicalTimingClaimed:false};
}

export function gatePose(state,data){
  const contract=data.functional3D?.completionContracts?.gate;
  if(!contract)return {gateMm:280*(state.gateOpening||0),camMm:0,camFactor:0,phase:state.dosingStage||'Cerrado',source:'legacy'};
  if(state.gateActuation)return state.gateActuation;
  const filling=state.phaseIndex===6||state.cyclePhase==='llenado';
  return filling?dosingActuationPose(state.phaseIndex===6?state.phaseProgress:state.cycleProgress,contract):
    {gateMm:0,camMm:0,camFactor:0,phase:'Cerrado',source:'completionContracts.gate'};
}

export function functionalPose(state, data) {
  return { ...transferPose(state, data), pin: pinPose(state, data),gate:gatePose(state,data) };
}

export function motionOffset(group, pose, travel) {
  const factor=group==='table'?pose.tableFactor:group==='diverter'?pose.diverterFactor:
    group==='pin'?pose.pin.withdrawnFraction:
    group==='gate_fine_cam'?pose.gate?.camFactor||0:
    group==='clamp_north'||group==='clamp_south'?pose.clampOpenFactor:0;
  const offset=(travel||[0,0,0]).map(value=>value*factor);
  if(pose.sequentialCollar&&['collar','clamp_north','clamp_south'].includes(group))offset[2]+=pose.collarDz;
  return offset;
}

export function validateMotionGroups(data) {
  const supported=new Set(['static','table','collar','collar_flexible_connector','diverter','pin','access_gate','clamp_north','clamp_south',
    'gate_fine_cam','gate_return_spring_1','gate_return_spring_2','gate_fine_spring_1','gate_fine_spring_2']);
  const counts={};
  for(const mesh of data.static||[]){
    const motion=mesh.motion;
    if(motion?.kind==='pitch_change')springHelix(motion);
    if(motion?.rotation){
      const r=motion.rotation;
      if(!Array.isArray(r.axis)||r.axis.length!==3||r.axis.some(v=>!Number.isFinite(v))||Math.abs(Math.hypot(...r.axis)-1)>1e-8||
         !Array.isArray(r.origin_m)||r.origin_m.length!==3||r.origin_m.some(v=>!Number.isFinite(v))||
         !Number.isFinite(r.speed_rad_s)||!['longitudinal','reject_belts'].includes(r.drive)){
        throw new Error(`Rotación de accionamiento inválida: ${mesh.tag}`);
      }
    }
    if(!motion?.group)continue;
    const group=motion.group;
    if(!supported.has(group))throw new Error(`Grupo de movimiento desconocido: ${group} (${mesh.tag}).`);
    const travel=motion.travel||data.functional3D?.motion_groups?.[group]?.displacement_m||[0,0,0];
    if(travel.length!==3||travel.some(v=>!Number.isFinite(v)))throw new Error(`Carrera XYZ inválida: ${group} (${mesh.tag}).`);
    counts[group]=(counts[group]||0)+1;
    const expected=/^MS0[34]_(?:SECTOR|LINER)_1$/.test(mesh.tag)?'clamp_north':
      /^MS0[34]_(?:SECTOR|LINER)_2$/.test(mesh.tag)?'clamp_south':null;
    if(expected&&group!==expected)throw new Error(`El sector/liner ${mesh.tag} debe seguir ${expected}; recibido ${group}.`);
  }
  return counts;
}

export function processState(progress, payload = 1000, bagSize = 50, mode = 'closed', data) {
  const p = clamp(Number(progress) || 0), C = data.config, stages = data.stages;
  const found = stages.findIndex(s => p < s.b);
  const index = found < 0 ? stages.length - 1 : found;
  const stage = stages[index], q = clamp((p - stage.a) / (stage.b - stage.a));
  payload = clamp(Number(payload) || 0, 0, 1000);
  bagSize = Number(bagSize) === 25 ? 25 : 50;
  const count = payload > 0 ? Math.ceil(payload / bagSize) : 0;
  let x = C.pickup_x, z = C.pickup_bottom, bigbagKg = payload, hopperKg = 0;
  let sackKg = 0, finishedKg = 0, completedSacks = 0, gate = 0, cyclePhase = stage.id;
  let cycleProgress = q, transferProgress = 0, activeSackIndex = 0, sackTargetKg = Math.min(payload, bagSize), sackVisible = false;
  if (index === 2) z = mix(C.pickup_bottom, C.travel_bottom, smooth(q));
  if (index === 3) { z = C.travel_bottom; x = mix(C.pickup_x, C.discharge_x, smooth(q)); }
  if (index >= 4) { x = C.discharge_x; z = C.support_z; }
  if (index === 4) z = q < .08 ? C.travel_bottom : mix(C.travel_bottom, C.support_z, smooth((q - .08) / .92));
  if (index === 5) { bigbagKg = payload * (1 - q); hopperKg = payload * q; }
  if (index >= 6) { bigbagKg = 0; hopperKg = payload; }
  const dose = v => { const u = clamp(v); return u < .6 ? 1.5 * u : .9 + .1 * clamp((u - .6) / .4); };
  const gateAt = f => f >= 1 ? 0 : f < .9 ? 1 : 52.5 / 280;
  if (index === 6 && count) { sackKg = sackTargetKg * dose(q); hopperKg -= sackKg; gate = gateAt(sackKg / sackTargetKg); sackVisible = true; }
  if (index === 7 && count) { sackKg = sackTargetKg; hopperKg -= sackKg; sackVisible = true; }
  if (index === 8 && count) {
    const slot = Math.min(count - 1, Math.floor(q * count));
    const u = q >= 1 ? 1 : q * count - slot;
    activeSackIndex = slot; completedSacks = slot; finishedKg = Math.min(payload, slot * bagSize);
    sackTargetKg = Math.min(bagSize, payload - finishedKg);
    if (slot === 0) { cyclePhase = 'salida'; transferProgress = u; sackKg = sackTargetKg; }
    else if (u < .52) { cyclePhase = 'llenado'; cycleProgress = u / .52; sackKg = sackTargetKg * dose(cycleProgress); gate = gateAt(sackKg / sackTargetKg); }
    else if (u < .63) { cyclePhase = 'amarre'; cycleProgress = (u - .52) / .11; sackKg = sackTargetKg; }
    else { cyclePhase = 'salida'; transferProgress = (u - .63) / .37; sackKg = sackTargetKg; }
    if (cyclePhase === 'salida') cycleProgress = transferProgress;
    sackVisible = !(cyclePhase === 'salida' && transferProgress >= .82);
    if (!sackVisible) { completedSacks = slot + 1; finishedKg += sackTargetKg; sackKg = 0; }
    hopperKg = Math.max(0, payload - finishedKg - sackKg);
  }
  if (index === 9) {
    finishedKg = payload; completedSacks = count; hopperKg = 0;
    z = q < .24 ? mix(C.support_z, C.travel_bottom, smooth(q / .24)) :
      q > .82 ? mix(C.travel_bottom, C.pickup_bottom, smooth((q - .82) / .18)) : C.travel_bottom;
    // Withdrawal takes place while carriage stays at the station. Translation
    // starts only after the100mm withdrawal pose has reached its endpoint.
    x = q < .30 ? C.discharge_x : mix(C.discharge_x, C.pickup_x, smooth((q - .30) / .52));
  }
  const gateContract=data.functional3D?.completionContracts?.gate;
  const gateActuation=gateContract?
    ((index===6&&count)||(index===8&&cyclePhase==='llenado')?
      dosingActuationPose(index===6?q:cycleProgress,gateContract):
      {gateMm:0,camMm:0,camFactor:0,phase:'Cerrado',source:'completionContracts.gate'}):null;
  if(gateActuation)gate=gateActuation.gateMm/gateContract.positionsMm.open;
  const carriageLocked = (index >= 4 && index < 9) || (index === 9 && q < .30);
  const lockingPin = carriageLocked && (index !== 4 || q >= .08) && (index !== 9 || q <= .24);
  const hoistEnabled = index < 4 || (index === 4 && lockingPin) || (index === 9 && (q < .24 - 1e-10 || q > .82 + 1e-10));
  const interlockState = index === 9 && q < .24 - 1e-10 ? 'Retorno vertical · carro bloqueado y pasador insertado' :
    index === 9 && q < .30 ? 'Izaje detenido · retirada neumática de traba100mm' :
    index === 9 ? 'Cortador despejado · pasador retirado y traslado habilitado' :
    index >= 5 && index < 9 ? 'Descarga · carro bloqueado, pasador insertado e izaje inhibido' :
    index === 4 ? (lockingPin ? 'Apoyo · pasador insertado y descenso controlado' : 'Posición de descarga · inserción neumática de traba') :
    'Recepción y traslado · zona de descarga sin habilitar';
  const state = { progress: p, phaseIndex: index, phase: stage.name, phaseId: stage.id, phaseProgress: q,
    detail: index === 5 ? (mode === 'spout' ? 'Alternativa de manga: cortador retirado del módulo antes del ciclo.' : 'Corte por descenso sobre cuatro filos fijos AISI304 dentro del recinto; poses nominales sin física del tejido.') : stage.detail,
    cyclePhase, cycleProgress, transferProgress, bigbagKg, hopperKg, sackKg, finishedKg, completedSacks,
    fullSacks: Math.floor((payload + 1e-9) / bagSize), remainderKg: Math.max(0, payload - Math.floor((payload + 1e-9) / bagSize) * bagSize),
    dosingStage: gateActuation?.phase||(gate === 0 ? 'Cerrado' : gate === 1 ? 'Grueso' : 'Fino'),gateActuation,totalSacks: count,
    sackNumber: count ? index === 9 ? count : Math.min(count, activeSackIndex + 1) : 0, activeSackIndex, sackTargetKg, sackVisible,
    hopperM3: hopperKg / (data.densityKgM3 || 550), bagBottomM: z, hookM: z + (C.bag_height || 1) + C.headpack,
    carriageM: Math.abs(x - C.pickup_x), x, z, transfer: clamp(transferProgress), gateOpening: clamp(gate),
    mode, bagSize, payload, runningFlow: (index === 5 && q > 0 && q < 1) || gate > .01,
    carriageLocked, lockingPin, hoistEnabled, interlockState,
    massBalanceKg: bigbagKg + hopperKg + sackKg + finishedKg };
  state.sackRoute = selectedSackRoute(state, data);
  state.acceptedSacks=0;state.rejectedSacks=0;state.acceptedKg=0;state.rejectedKg=0;
  for(let i=0;i<completedSacks;i++){
    const weight=Math.min(bagSize,payload-i*bagSize);
    const route=selectedSackRoute({...state,activeSackIndex:i,sackTargetKg:weight},data);
    if(route==='accepted'){state.acceptedSacks++;state.acceptedKg+=weight;}
    else {state.rejectedSacks++;state.rejectedKg+=weight;}
  }
  state.functionalPose = functionalPose(state, data);
  return state;
}
