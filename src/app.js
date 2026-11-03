import {BigbagScene,STAGES} from './scene.js?v=p05cierre20261103';
const $=id=>document.getElementById(id);
let progress=.44,playing=false,last=0,frame,ready=false;
const duration=95000;
function paint(state){
 $('timeline').value=Math.round(progress*1000);$('progress').textContent=`${Math.round(progress*100)} %`;
 $('phaseNumber').textContent=String(state.phaseIndex+1).padStart(2,'0');$('phaseTitle').textContent=state.stage.title;$('phaseDetail').textContent=state.stage.detail;
 document.querySelectorAll('[data-stage]').forEach(b=>{const active=Number(b.dataset.stage)===state.phaseIndex;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'step':'false');});
}
function seek(value){progress=Math.max(0,Math.min(1,Number(value)||0));if(ready)paint(BigbagScene.setProgress(progress));}
function pause(){playing=false;$('play').textContent='▶ Reproducir recorrido';$('runStatus').textContent='EN PAUSA';$('runStatus').classList.remove('playing');cancelAnimationFrame(frame);last=0;}
function tick(now){if(!playing)return;if(last)seek(progress+(now-last)/duration);last=now;if(progress>=1){pause();return;}frame=requestAnimationFrame(tick);}
function play(){if(!ready)return;if(playing){pause();return;}if(progress>=1||progress===.44)seek(0);playing=true;$('play').textContent='Ⅱ Pausar recorrido';$('runStatus').textContent='REPRODUCIENDO';$('runStatus').classList.add('playing');last=0;frame=requestAnimationFrame(tick);}
for(const [i,stage]of STAGES.entries()){const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.dataset.stage=i;b.innerHTML=`<span>${String(i+1).padStart(2,'0')}</span>${stage.short}`;b.addEventListener('click',()=>{pause();seek(stage.start+.001);});li.append(b);$('stages').append(li);}
$('play').addEventListener('click',play);$('reset').addEventListener('click',()=>{pause();seek(0);});$('timeline').addEventListener('input',e=>{pause();seek(e.target.value/1000);});
$('sackSize').addEventListener('change',e=>{if(ready)paint(BigbagScene.setBagSize(e.target.value));});
const viewLabels={iso:'CONJUNTO GENERAL',front:'VISTA FRONTAL',back:'ACCESO A PLATAFORMA',bagging:'ENSACADO MANUAL'};
function setView(name){if(!ready)return;BigbagScene.setView(name);$('viewName').textContent=viewLabels[name];document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===name;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));$('fit').addEventListener('click',()=>setView('iso'));
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('viewer').requestFullscreen();}catch{}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
try{
 await BigbagScene.init($('scene'));ready=true;seek(progress);$('loading').hidden=true;$('play').disabled=false;
 window.P05SimpleQA={ready:true,getState:()=>BigbagScene.getState(),seek,stages:STAGES.length};
}catch(error){document.body.classList.add('error');$('loading').querySelector('strong').textContent='No se pudo abrir el modelo';$('loading').querySelector('span').textContent='Recarga la página para volver a intentarlo.';console.error(error);window.P05SimpleQA={ready:false,error:String(error)};}
