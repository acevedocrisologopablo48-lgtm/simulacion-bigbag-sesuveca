import {BigbagScene} from './scene.js?v=actual20261021-cde6b1ae76fb';

const $=id=>document.getElementById(id);
const all=selector=>[...document.querySelectorAll(selector)];
const number=(v,d=0)=>Number(v).toLocaleString('es-PE',{minimumFractionDigits:d,maximumFractionDigits:d});
const displayText=value=>String(value??'').replace(/\s+/g,' ').trim();
const escape=value=>displayText(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let progress=0,playing=false,lastTime=0,speed=1,ready=false,lastPhase=-1,project,model;
const CYCLE_SECONDS=120;
const viewNames={iso:'ISOMÉTRICA',front:'FRONTAL',side:'LATERAL',back:'POSTERIOR',top:'PLANTA',hoist:'TECLE Y CARRO',locks:'TRABA Y TOPES',cutter:'CORTE DE BOLSA',gate:'COMPUERTA',bagging:'BALANZA Y MESA',anchors:'BASES Y ANCLAJES',discharge:'DESCARGA',pickup:'RECEPCIÓN',collector:'COLECTOR DE POLVO',access:'ACCESO SUPERIOR'};
const phaseNames={recepcion:'Recepción',enganche:'Enganche',izaje:'Izaje',traslado:'Traslado',apoyo:'Apoyo',descarga:'Descarga',llenado:'Llenado',amarre:'Amarre',salida:'Salida',retorno:'Retorno'};

function setPlaying(value){
  playing=ready&&Boolean(value)&&!BigbagScene.getState()?.accessOpen&&!BigbagScene.getState()?.accessResetRequired;lastTime=0;
  if(playing&&BigbagScene.getState().exploded){BigbagScene.setExploded(false);$('explodedBtn').setAttribute('aria-pressed','false');$('explodedBtn').textContent='Ver conjunto separado';}
  $('playText').textContent=playing?'Pausar ciclo':'Reproducir ciclo';
  $('playIcon').textContent=playing?'Ⅱ':'▶';
  $('playBtn').setAttribute('aria-pressed',String(playing));
  $('runStatus').innerHTML=`<i></i> ${playing?'EN MARCHA':progress>=1?'CICLO COMPLETO':'EN REPOSO'}`;
}
function renderReadings(){
  if(!ready)return;
  const s=BigbagScene.getState();
  $('accessBtn').disabled=!s.accessAvailable&&!s.accessOpen;
  $('accessBtn').textContent=s.accessOpen?'Cerrar acceso superior':s.accessResetRequired?'Rearmar controles':'Abrir acceso superior';
  $('accessBtn').setAttribute('aria-pressed',String(s.accessOpen));
  $('accessHint').textContent=s.accessOpen?'Puerta abierta: ciclo detenido.':s.accessResetRequired?'Puerta cerrada: rearma para continuar.':'Habilitado con bolsa apoyada y carro trabado.';
  for(const id of ['playBtn','resetBtn','timeline','bagMode','sackSize','payload'])$(id).disabled=s.accessOpen||s.accessResetRequired;
  $('timeline').value=String(Math.round(progress*1000));
  $('progressValue').innerHTML=`${number(progress*100)}<small>%</small>`;
  $('hookValue').innerHTML=`${number(s.hookM,2)}<small>m</small>`;
  $('bigbagValue').innerHTML=`${number(s.bigbagKg)}<small>kg</small>`;
  $('hopperValue').innerHTML=`${number(s.hopperKg)}<small>kg</small>`;
  $('sackValue').innerHTML=`${number(s.sackKg)}<small>kg</small>`;
  $('finishedValue').innerHTML=`${number(s.finishedKg)}<small>kg</small>`;
  $('sackCount').textContent=`${s.completedSacks} / ${s.totalSacks} sacos`;
  $('phasePill').textContent=phaseNames[s.cyclePhase]||phaseNames[s.phaseId]||s.phase;
  if(s.phaseIndex!==lastPhase){
    lastPhase=s.phaseIndex;
    $('phaseNumber').textContent=String(s.phaseIndex+1).padStart(2,'0');
    $('phaseTitle').textContent=displayText(s.phase);
    all('.stage-item').forEach((button,i)=>{button.classList.toggle('active',i===s.phaseIndex);button.setAttribute('aria-pressed',String(i===s.phaseIndex));});
  }
  $('interlockReadout').textContent=s.interlockState||'Enclavamientos del ciclo';
  $('interlockReadout').classList.toggle('locked',Boolean(s.lockingPin));
  $('phaseDetail').textContent=s.phaseIndex===8?`${phaseNames[s.cyclePhase]||'Ensacado'} · saco ${s.sackNumber} de ${s.totalSacks}. Transferencia por rodillos y cierre por amarre.`:displayText(s.detail);
  const mini=s.phaseIndex<2?0:s.phaseIndex<5?1:s.phaseIndex===5?2:3;
  all('.sequence-mini span').forEach((span,i)=>span.classList.toggle('active',i===mini));
  all('.jump-buttons button').forEach((button,i)=>button.classList.toggle('active',i===0?s.phaseIndex<5:i===1?s.phaseIndex===5:s.phaseIndex>=6&&s.phaseIndex<9));
}
function setProgress(value,{pause=true}={}){
  if(!ready)return;
  if(pause)setPlaying(false);
  progress=Math.max(0,Math.min(1,Number(value)||0));
  const accepted=BigbagScene.setProgress(progress);progress=accepted?.progress??progress;renderReadings();
  if(progress>=1)setPlaying(false);
}
function selectPart(part){
  if(!part){$('selection').hidden=true;return;}
  $('selectionName').textContent=displayText(part.label||part.name||part.part||'Componente');
  $('selection').hidden=false;
}
function setView(name){
  if(!ready)return;
  BigbagScene.setView(name);$('viewName').textContent=`CONJUNTO / ${viewNames[name]||'LIBRE'}`;
  all('.view-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  $('extraView').value=[...$('extraView').options].some(option=>option.value===name)?name:'';
}
function setStyle(value){
  if(!ready)return;
  const style=value==='technical'?'technical':'realistic';
  BigbagScene.setStyle(style);$('renderStyle').value=style;
  const edges=style==='technical';
  $('edgesBtn').setAttribute('aria-pressed',String(edges));$('edgesBtn').classList.toggle('active',edges);
}
function setCameraMode(value){
  if(!ready)return;
  const mode=value==='pan'?'pan':'rotate';BigbagScene.setCameraMode(mode);
  all('button[data-camera-mode]').forEach(button=>{const selected=button.dataset.cameraMode===mode;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
  $('cameraHelp').textContent=mode==='pan'?'Arrastrar: desplazar · Rueda: acercar · Dos dedos: mover y zoom':'Arrastrar: girar · Botón derecho: desplazar · Rueda: acercar';
}
function showTab(id){
  all('.tab-panel').forEach(panel=>panel.hidden=panel.id!==id);
  all('.nav-tab').forEach(button=>{const active=button.dataset.tab===id;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  $('pageTitle').textContent=id==='simulacion'?'Izaje, descarga y ensacado':id==='calculos'?'Cálculos':'Piezas y materiales';
  if(id==='simulacion')requestAnimationFrame(()=>BigbagScene.resize());
  else setPlaying(false);
  history.replaceState(null,'',`#${id}`);
}
function toggle(button,method){
  const value=button.getAttribute('aria-pressed')!=='true';
  button.setAttribute('aria-pressed',String(value));button.classList.toggle('active',value);
  BigbagScene[method](value);
}
function populateProject(){
  $('calcCards').innerHTML=project.calculations.map(c=>{const failed=Number(c.failedCount??(c.maxUtilization>1?4:0));return `<article class="calc-card${failed?' has-findings':''}"><div class="calc-heading"><h3>${escape(c.title)}</h3><span class="check-status${failed?' has-findings':''}">${failed?`${failed} observación${failed===1?'':'es'}`:'Conforme'}</span></div><strong class="calc-number">${c.count}</strong><small>COMPROBACIONES</small><p>${escape(c.description)}</p><div class="utilization">Utilización máxima ${number(c.maxUtilization*100,1)} %<div class="util-bar"><i style="width:${Math.max(0,Math.min(100,c.maxUtilization*100))}%"></i></div></div><details><summary>Datos del cálculo</summary><p>${escape(c.scope)}</p></details></article>`;}).join('');
  const dl=rows=>rows.map(row=>`<div><dt>${escape(row.label)}</dt><dd>${escape(row.value)}</dd></div>`).join('');
  $('dimensionList').innerHTML=dl(project.dimensions);$('operatingList').innerHTML=dl(project.operating);
  $('engineeringNotice').innerHTML=`<span class="note-mark">i</span><p>${escape(project.notice)}</p>`;
  $('groupCards').innerHTML=project.groups.map((group,i)=>`<button class="group-card" data-group="${escape(group.id)}"><span class="group-index">${String(i+1).padStart(2,'0')}</span><div><strong>${escape(group.label)}</strong><p>${escape(group.material)}</p><small>${group.quantity} elementos CAD · ${number(group.massKg,1)} kg de materiales modelados</small></div></button>`).join('');
  project.groups.forEach(group=>{const option=document.createElement('option');option.value=group.id;option.textContent=displayText(group.label);$('groupFilter').appendChild(option);});
  all('.group-card').forEach(button=>button.addEventListener('click',()=>{
    setPlaying(false);showTab('simulacion');BigbagScene.highlight(button.dataset.group);
    selectPart({label:project.groups.find(g=>g.id===button.dataset.group)?.label});
    $('viewer').scrollIntoView({behavior:'smooth',block:'center'});
  }));
  populateParts();
}
function populateParts(){
  if(!project)return;
  const query=$('partSearch').value.trim().toLocaleLowerCase('es'),group=$('groupFilter').value;
  const parts=project.parts.filter(p=>(!group||p.group===group)&&[p.position,p.code,p.name,p.material,p.dimensions].join(' ').toLocaleLowerCase('es').includes(query));
  $('partsBody').innerHTML=parts.map(p=>`<tr><td>${escape(p.position??p.code)}</td><td>${escape(p.name)}</td><td>${escape(p.material)}</td><td>${escape(p.quantity)}</td><td>${escape(p.dimensions)}</td></tr>`).join('');
  $('noParts').hidden=parts.length>0;
}
function populateStages(){
  $('stageList').innerHTML=model.stages.map((stage,i)=>`<button class="stage-item${i===0?' active':''}" data-stage="${i}" aria-pressed="${i===0}"><span class="stage-no">${String(i+1).padStart(2,'0')}</span><span><strong>${escape(stage.name)}</strong><small>${escape(stage.detail)}</small></span></button>`).join('');
  all('.stage-item').forEach(button=>button.addEventListener('click',()=>setProgress(model.stages[Number(button.dataset.stage)].a+.000001)));
  const jumps=all('.jump-buttons button');
  jumps[1].dataset.progress=String(model.stages[5].a+.000001);
  jumps[2].dataset.progress=String(model.stages[6].a+.000001);
}
function tick(now){
  if(playing){if(lastTime)setProgress(progress+Math.min(now-lastTime,150)/1000/CYCLE_SECONDS*speed,{pause:false});lastTime=now;}
  requestAnimationFrame(tick);
}

all('.nav-tab').forEach(button=>button.addEventListener('click',()=>showTab(button.dataset.tab)));
all('.view-btn').forEach(button=>button.addEventListener('click',()=>{$('extraView').value='';setView(button.dataset.view);}));
$('extraView').addEventListener('change',e=>{if(e.target.value)setView(e.target.value);});
$('playBtn').addEventListener('click',()=>{if(progress>=1)setProgress(0);setPlaying(!playing);});
$('pauseBtn').addEventListener('click',()=>setPlaying(false));
$('accessBtn').addEventListener('click',()=>{setPlaying(false);const s=BigbagScene.getState();if(s.accessResetRequired&&!s.accessOpen)BigbagScene.resetAccess();else BigbagScene.setAccessOpen(!s.accessOpen);setView('access');renderReadings();});
$('resetBtn').addEventListener('click',()=>setProgress(0));
$('timeline').addEventListener('input',e=>setProgress(Number(e.target.value)/1000));
$('speed').addEventListener('change',e=>speed=Number(e.target.value));
all('.jump-buttons button').forEach(button=>button.addEventListener('click',()=>setProgress(button.dataset.progress)));
$('fitBtn').addEventListener('click',()=>setView('iso'));
$('fullscreenBtn').addEventListener('click',async()=>{try{await BigbagScene.toggleFullscreen();}catch{$('viewer').scrollIntoView({block:'center'});}});
$('edgesBtn').addEventListener('click',()=>toggle($('edgesBtn'),'setEdges'));
$('renderStyle').addEventListener('change',e=>setStyle(e.target.value));
all('button[data-camera-mode]').forEach(button=>button.addEventListener('click',()=>setCameraMode(button.dataset.cameraMode)));
$('sectionBtn').addEventListener('click',()=>toggle($('sectionBtn'),'setSection'));
$('dimensionsBtn').addEventListener('click',()=>toggle($('dimensionsBtn'),'setDimensions'));
$('clearSelection').addEventListener('click',()=>{BigbagScene.highlight(null);selectPart(null);});
$('bagMode').addEventListener('change',e=>{setPlaying(false);BigbagScene.setMode(e.target.value);lastPhase=-1;renderReadings();});
$('sackSize').addEventListener('change',e=>{setPlaying(false);BigbagScene.setBagSize(Number(e.target.value));renderReadings();});
$('payload').addEventListener('change',e=>{setPlaying(false);BigbagScene.setPayload(Number(e.target.value));renderReadings();});
$('partSearch').addEventListener('input',populateParts);$('groupFilter').addEventListener('change',populateParts);
$('explodedBtn').addEventListener('click',()=>{const value=$('explodedBtn').getAttribute('aria-pressed')!=='true';$('explodedBtn').setAttribute('aria-pressed',String(value));$('explodedBtn').textContent=value?'Volver al conjunto unido':'Ver conjunto separado';BigbagScene.setExploded(value);showTab('simulacion');$('viewer').scrollIntoView({block:'center'});});
document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false);});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','SELECT','BUTTON','TEXTAREA'].includes(e.target.tagName)&&!$('simulacion').hidden){e.preventDefault();if(progress>=1)setProgress(0);setPlaying(!playing);}});
window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if(['simulacion','calculos','piezas'].includes(id))showTab(id);});

try{
  const responses=await Promise.all([fetch('data/project.json?v=actual20261021-6a80c9fd6f80'),fetch('data/model.json?v=actual20261021-3a6e509f97bc')]);
  if(responses.some(r=>!r.ok))throw new Error('No se pudieron cargar los datos del proyecto.');
  [project,model]=await Promise.all(responses.map(r=>r.json()));
  populateProject();populateStages();
  await BigbagScene.init($('scene'),selectPart);ready=true;
  $('loading').hidden=true;$('playBtn').disabled=false;
  setStyle('realistic');setCameraMode('rotate');setProgress(0);showTab(['simulacion','calculos','piezas'].includes(location.hash.slice(1))?location.hash.slice(1):'simulacion');
  requestAnimationFrame(tick);
  window.bigbagApp={getState:()=>({...BigbagScene.getState(),playing,speed,ready}),setProgress,setPlaying,setView,setStyle,setCameraMode,showTab};
}catch(error){
  console.error(error);$('loading').innerHTML='<strong>No se pudo abrir el modelo 3D.</strong><small>Recarga la página en un navegador con WebGL habilitado.</small><button type="button" id="retryLoad">Volver a cargar</button>';
  $('retryLoad').addEventListener('click',()=>location.reload());
}
