(() => {
const SUPABASE_URL='https://sqqqjsmblelxqwalxzfq.supabase.co';
const SUPABASE_KEY='sb_publishable_lyGKCZxtN4LtEdE3U63FUg_1J4jXqbA';
const API=`${SUPABASE_URL}/functions/v1/doctor-recorder-api`;
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
const params=new URLSearchParams(location.search);
const isMobile=params.get('mode')==='record';
const token=params.get('token')||'';
let session=null, device=null, recorder=null, chunks=[], stream=null, timerInt=null, startedAt=0, elapsedBeforePause=0, waveCtx=null, analyser=null, waveRAF=null, dashboardInt=null, recorderMode='idle';

function deviceId(){
 let id=localStorage.getItem('dr_device_id');
 if(!id){id=crypto.randomUUID();localStorage.setItem('dr_device_id',id)} return id;
}
function model(){
 const ua=navigator.userAgent;
 if(/iPhone/i.test(ua)) return 'iPhone';
 if(/iPad/i.test(ua)) return 'iPad';
 const m=ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|\))/i);
 return m?.[1]?.trim()||(/Android/i.test(ua)?'Android Telefon':'Telefon');
}
function fmt(sec){sec=Math.max(0,Math.floor(sec||0));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}
async function api(action,{method='GET',body=null,auth=false,query={}}={}){
 const q=new URLSearchParams({action,...query});
 const headers={apikey:SUPABASE_KEY};
 if(auth){const {data}=await sb.auth.getSession(); if(data.session)headers.Authorization=`Bearer ${data.session.access_token}`}
 if(body && !(body instanceof FormData))headers['Content-Type']='application/json';
 const r=await fetch(`${API}?${q}`,{method,headers,body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined,cache:'no-store'});
 const j=await r.json().catch(()=>({}));
 if(!r.ok) throw Object.assign(new Error(j.error||'request_failed'),{status:r.status,data:j});
 return j;
}


let waitingLoopTimer=null;
let waitingLoopIndex=0;
let waitingLoopDeleting=false;
const waitingLoopText='Telefon Bekleniyor...';

function stopWaitingLoop(){
 if(waitingLoopTimer){clearTimeout(waitingLoopTimer);waitingLoopTimer=null}
 waitingLoopIndex=0;waitingLoopDeleting=false;
}
function startWaitingLoop(){
 stopWaitingLoop();
 const tick=()=>{
  const el=document.getElementById('waitingType');
  if(!el){waitingLoopTimer=setTimeout(tick,250);return}
  if(!waitingLoopDeleting){
   waitingLoopIndex=Math.min(waitingLoopText.length,waitingLoopIndex+1);
   el.textContent=waitingLoopText.slice(0,waitingLoopIndex);
   if(waitingLoopIndex===waitingLoopText.length){
    waitingLoopDeleting=true;
    waitingLoopTimer=setTimeout(tick,1500);
    return;
   }
   waitingLoopTimer=setTimeout(tick,72);
  }else{
   waitingLoopIndex=Math.max(0,waitingLoopIndex-1);
   el.textContent=waitingLoopText.slice(0,waitingLoopIndex);
   if(waitingLoopIndex===0){
    waitingLoopDeleting=false;
    waitingLoopTimer=setTimeout(tick,420);
    return;
   }
   waitingLoopTimer=setTimeout(tick,34);
  }
 };
 tick();
}

if(isMobile) initMobile(); else initDesktop();

async function initDesktop(){
 $('#desktop').classList.remove('hidden'); startWaitingLoop();
 let {data}=await sb.auth.getSession();
 if(!data.session){const r=await sb.auth.signInAnonymously(); if(r.error){alert('Oturum açılamadı');return}}
 $('#newQr').onclick=createSession;
 $('#deviceFilter').onchange=()=>renderDashboard(window.__dash||{devices:[],recordings:[]});
 await createSession();
}
async function createSession(){
 try{
  session=await api('create-session',{method:'POST',auth:true,body:{}});
  $('#sessionCode').textContent=session.token.slice(0,8).toUpperCase();
  const url=`${location.origin}${location.pathname}?mode=record&token=${encodeURIComponent(session.token)}`;
  $('#qrcode').innerHTML=''; new QRCode($('#qrcode'),{text:url,width:220,height:220,colorDark:'#17324a',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  if(dashboardInt)clearInterval(dashboardInt);
  await loadDashboard(); dashboardInt=setInterval(loadDashboard,2500);
 }catch(e){console.error(e);alert('QR oluşturulamadı.')}
}
async function loadDashboard(){
 if(!session)return;
 try{const d=await api('dashboard',{auth:true,query:{session_id:session.id}});window.__dash=d;renderDashboard(d)}catch(e){console.error(e)}
}
function renderDashboard(d){
 const devices=d.devices||[], recs=d.recordings||[];
 $('#deviceCount').textContent=`${devices.length} cihaz`;
 const devBox=$('#devices');
 if(devices.length){
  stopWaitingLoop();
  devBox.innerHTML='';
 }else{
  devBox.innerHTML='<div class="empty waiting-empty"><span id="waitingType"></span><span class="type-cursor"></span></div>';
  startWaitingLoop();
 }
 devices.forEach(x=>{
  const el=document.createElement('div'); el.className='device';
  const active=Date.now()-new Date(x.last_seen_at).getTime()<20000;
  const st=x.status==='recording'?'Kayıt yapıyor':x.status==='uploading'?'Gönderiliyor':active?'Bağlı':'Bağlantı bekleniyor';
  el.innerHTML=`<div class="device-top"><div><b><span class="dot ${x.status==='recording'?'recording':''}"></span>${esc(x.doctor_first_name)} ${esc(x.doctor_last_name)}</b><small>${esc(x.device_model||'Telefon')} · ${esc(x.ip_address||'IP alınamadı')}</small></div><span class="device-status">${st}</span></div>`;
  el.onclick=()=>{$('#deviceFilter').value=x.id;renderDashboard(d)};
  devBox.appendChild(el);
 });
 const filter=$('#deviceFilter'), old=filter.value; filter.innerHTML='<option value="">Tüm doktorlar</option>';
 devices.forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=`${x.doctor_first_name} ${x.doctor_last_name} · ${x.device_model||'Telefon'}`;filter.appendChild(o)});filter.value=devices.some(x=>x.id===old)?old:'';
 const map=Object.fromEntries(devices.map(x=>[x.id,x]));
 const shown=recs.filter(r=>!filter.value||r.device_connection_id===filter.value);
 const box=$('#recordings');box.innerHTML=shown.length?'':'<div class="empty">Henüz kayıt yok.</div>';
 shown.forEach(r=>{
  const x=map[r.device_connection_id]||{}; const row=document.createElement('div');row.className='rec-row';
  row.innerHTML=`<div class="rec-meta"><b>${esc(x.doctor_first_name||'Eski kayıt')} ${esc(x.doctor_last_name||'')}</b><small>${esc(x.device_model||'')} · ${new Date(r.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} · ${fmt(r.duration_seconds)}</small></div><div class="player"><button class="play">▶</button><div class="track"><div class="fill"></div></div><span class="ptime">00:00 / ${fmt(r.duration_seconds)}</span><audio preload="metadata" src="${r.signed_url||''}"></audio></div>`;
  const audio=row.querySelector('audio'), play=row.querySelector('.play'), fill=row.querySelector('.fill'), pt=row.querySelector('.ptime'), track=row.querySelector('.track');
  play.onclick=()=>{document.querySelectorAll('audio').forEach(a=>{if(a!==audio)a.pause()});audio.paused?audio.play():audio.pause()};
  audio.onplay=()=>play.textContent='❚❚';audio.onpause=()=>play.textContent='▶';audio.ontimeupdate=()=>{fill.style.width=`${audio.duration?audio.currentTime/audio.duration*100:0}%`;pt.textContent=`${fmt(audio.currentTime)} / ${fmt(audio.duration||r.duration_seconds)}`};
  track.onclick=e=>{if(audio.duration){const b=track.getBoundingClientRect();audio.currentTime=((e.clientX-b.left)/b.width)*audio.duration}};
  box.appendChild(row);
 });
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

async function initMobile(){
 $('#mobile').classList.remove('hidden');
 $('#identityContinue').onclick=register;
 $('#mic').onclick=toggleRecording; $('#pauseBtn').onclick=pauseRecording; $('#resumeBtn').onclick=resumeRecording; $('#finishBtn').onclick=finishRecording;
 $('#scanQrBtn').onclick=openScanner;
 $('#closeScanner').onclick=closeScanner;
 const ok=await checkToken();
 if(!ok)return expired();
 const saved=JSON.parse(localStorage.getItem('dr_doctor')||'null');
 if(saved?.first&&saved?.last){$('#firstName').value=saved.first;$('#lastName').value=saved.last;await register()}else $('#identity').classList.remove('hidden');
 setInterval(async()=>{if(!(await checkToken()))expired()},5000);
}
async function checkToken(){
 if(!token)return false;
 try{await api('status',{query:{token}});setConn('Masaüstüne Bağlandı','Aktif QR oturumu doğrulandı.','ok');return true}catch{return false}
}
function setConn(a,b,state){$('#connTitle').textContent=a;$('#connSub').textContent=b;$('#connection').className=`connection ${state||''}`}
async function register(){
 const first=$('#firstName').value.trim(),last=$('#lastName').value.trim(); if(!first||!last){$('#identityError').textContent='Ad ve soyad alanlarını doldurun.';$('#identityError').classList.remove('hidden');return}
 try{
  device=await api('register-device',{method:'POST',query:{token},body:{device_id:deviceId(),first_name:first,last_name:last,device_model:model()}});
  localStorage.setItem('dr_doctor',JSON.stringify({first,last}));
  $('#identity').classList.add('hidden');$('#recorder').classList.remove('hidden');$('#doctorName').textContent=`${first} ${last}`;$('#deviceInfo').textContent=`${model()} · Cihaz ${deviceId().slice(0,6).toUpperCase()}`;
  await state('connected'); await loadMyRecordings();
 }catch(e){if(e.status===410)expired();else{$('#identityError').textContent='Bağlantı kurulamadı.';$('#identityError').classList.remove('hidden')}}
}
async function state(status){if(!device)return;try{await api('device-state',{method:'POST',query:{token,device_token:device.device_token},body:{status}})}catch(e){if(e.status===410)expired()}}
async function toggleRecording(){
 if(!device||$('#recorder').classList.contains('expired-mode'))return;
 if(recorderMode==='idle') await startRecording();
 else if(recorderMode==='recording') pauseRecording();
 else if(recorderMode==='paused') resumeRecording();
}
function setRecorderUI(mode){
 recorderMode=mode;
 const mic=$('#mic'),pill=$('#statePill'),controls=$('#recordControls'),pause=$('#pauseBtn'),resume=$('#resumeBtn'),finish=$('#finishBtn');
 mic.classList.remove('recording','paused');pill.className='pill';controls.classList.add('hidden');pause.classList.add('hidden');resume.classList.add('hidden');finish.classList.add('hidden');
 if(mode==='idle'){pill.textContent='Hazır';$('#recordHelp').textContent='Kayda başlamak için mikrofona dokunun.';$('#tapHint').textContent='Mikrofona dokunun';$('#timer').textContent='00:00'}
 if(mode==='recording'){mic.classList.add('recording');pill.classList.add('recording');pill.textContent='Kaydediliyor';$('#recordHelp').textContent='Konuşmanız canlı olarak kaydediliyor.';$('#tapHint').textContent='Durdurmak için turuncu Durdur butonuna dokunun';controls.classList.remove('hidden');pause.classList.remove('hidden');finish.classList.remove('hidden')}
 if(mode==='paused'){mic.classList.add('paused');pill.classList.add('paused');pill.textContent='Durduruldu';$('#recordHelp').textContent='Kayıt beklemede. Devam edebilir veya bitirebilirsiniz.';$('#tapHint').textContent='Kayıt durduruldu';controls.classList.remove('hidden');resume.classList.remove('hidden');finish.classList.remove('hidden')}
 if(mode==='uploading'){pill.textContent='Gönderiliyor';$('#recordHelp').textContent='Ses kaydı bilgisayara gönderiliyor.';$('#tapHint').textContent='Lütfen bekleyin…'}
}
function currentElapsed(){return elapsedBeforePause+(recorderMode==='recording'?(Date.now()-startedAt)/1000:0)}
function startTimer(){clearInterval(timerInt);timerInt=setInterval(()=>$('#timer').textContent=fmt(currentElapsed()),200)}
async function startRecording(){
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  const mime=['audio/mp4;codecs=mp4a.40.2','audio/webm;codecs=opus','audio/webm'].find(x=>MediaRecorder.isTypeSupported(x))||'';
  recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);chunks=[];elapsedBeforePause=0;
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=uploadRecording;
  recorder.start(350);startedAt=Date.now();setRecorderUI('recording');startTimer();$('#waveWrap').classList.remove('hidden');startWave(stream);await state('recording');
 }catch(e){$('#uploadState').textContent='Mikrofon izni gerekli.';$('#uploadState').classList.remove('hidden')}
}
async function pauseRecording(){
 if(recorder?.state!=='recording')return;
 elapsedBeforePause+=(Date.now()-startedAt)/1000;recorder.pause();clearInterval(timerInt);setRecorderUI('paused');stopWave(false);await state('idle');
}
async function resumeRecording(){
 if(recorder?.state!=='paused')return;
 recorder.resume();startedAt=Date.now();setRecorderUI('recording');startTimer();$('#waveWrap').classList.remove('hidden');startWave(stream);await state('recording');
}
async function finishRecording(){
 if(!recorder||!['recording','paused'].includes(recorder.state))return;
 if(recorder.state==='recording')elapsedBeforePause+=(Date.now()-startedAt)/1000;
 clearInterval(timerInt);setRecorderUI('uploading');stopWave();await state('uploading');recorder.stop();
}
async function uploadRecording(){
 const duration=Math.max(1,Math.round(elapsedBeforePause)), blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});stream?.getTracks().forEach(t=>t.stop());
 const form=new FormData();form.append('file',blob,`recording.${blob.type.includes('mp4')?'m4a':'webm'}`);form.append('duration_seconds',String(duration));
 try{
  await api('upload',{method:'POST',query:{token,device_token:device.device_token},body:form});
  $('#uploadState').textContent='✓ Ses kaydı bilgisayara gönderildi';$('#uploadState').classList.remove('hidden');setRecorderUI('idle');await loadMyRecordings();setTimeout(()=>$('#uploadState').classList.add('hidden'),3500);
 }catch(e){$('#uploadState').textContent=e.status===410?'Oturum sona erdi.':'Kayıt gönderilemedi.';$('#uploadState').classList.remove('hidden');if(e.status===410)expired();else setRecorderUI('idle')}
 recorder=null;chunks=[];elapsedBeforePause=0;
}
async function loadMyRecordings(){
 if(!device)return;
 try{
  const list=await api('device-recordings',{query:{token,device_token:device.device_token}});
  $('#myRecCount').textContent=`${list.length} kayıt`;const box=$('#myRecList');box.innerHTML=list.length?'':'<div class="empty small">Henüz kayıt yok.</div>';
  list.forEach((r,i)=>{
   const row=document.createElement('div');row.className='myrec-row';
   const bars=Array.from({length:34},(_,j)=>`<i style="height:${8+Math.abs(Math.sin((j+1)*(i+2)*.37))*25}px"></i>`).join('');
   row.innerHTML=`<div class="myrec-meta"><b>Kayıt ${list.length-i}</b><small>${new Date(r.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} · ${fmt(r.duration_seconds)}</small></div><div class="mini-wave">${bars}</div><button class="myplay">▶</button><audio preload="metadata" src="${r.signed_url||''}"></audio>`;
   const a=row.querySelector('audio'),b=row.querySelector('.myplay');b.onclick=()=>{document.querySelectorAll('#myRecList audio').forEach(x=>{if(x!==a)x.pause()});a.paused?a.play():a.pause()};a.onplay=()=>b.textContent='Ⅱ';a.onpause=()=>b.textContent='▶';box.appendChild(row);
  });
 }catch(e){console.error('recording history',e)}
}
function startWave(s){
 stopWave(false);
 const c=$('#wave'),ctx=c.getContext('2d'),AC=window.AudioContext||window.webkitAudioContext,ac=new AC(),src=ac.createMediaStreamSource(s);analyser=ac.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.68;src.connect(analyser);waveCtx=ac;
 const freq=new Uint8Array(analyser.frequencyBinCount), time=new Uint8Array(analyser.fftSize);let smooth=.08,t=0;
 const draw=()=>{
  waveRAF=requestAnimationFrame(draw);const dpr=Math.min(devicePixelRatio||1,2),r=c.getBoundingClientRect(),w=Math.max(1,r.width*dpr|0),h=Math.max(1,r.height*dpr|0);if(c.width!==w||c.height!==h){c.width=w;c.height=h}
  analyser.getByteFrequencyData(freq);analyser.getByteTimeDomainData(time);
  let energy=0;for(let i=2;i<Math.min(120,freq.length);i++)energy+=freq[i];energy/=118*255;smooth=smooth*.76+energy*.24;t+=.045;
  ctx.clearRect(0,0,w,h);const g=ctx.createRadialGradient(w*.5,h*.5,0,w*.5,h*.5,w*.55);g.addColorStop(0,'#0b1024');g.addColorStop(1,'#020409');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  const layers=[['#58e3a5',.72,0,.86],['#ff4e68',.92,1.3,1.12],['#a64cff',.88,2.6,.96],['#3979ff',.82,4.1,1.25],['#ffffff',.5,5.4,.72]];
  layers.forEach(([col,alpha,phase,mult],li)=>{
   ctx.beginPath();
   for(let x=0;x<=w;x+=3*dpr){
    const p=x/w, env=Math.pow(Math.sin(Math.PI*p),.72), idx=Math.min(time.length-1,Math.floor(p*(time.length-1))), raw=(time[idx]-128)/128;
    const carrier=Math.sin(p*Math.PI*(2.1+li*.34)+t*(1.3+li*.11)+phase)+.42*Math.sin(p*Math.PI*(5.4+li*.31)-t*.8+phase);
    const amp=h*(.035+smooth*.78)*env*mult;
    const y=h*.5+(carrier*.48+raw*.9)*amp;
    if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
   }
   ctx.strokeStyle=col;ctx.globalAlpha=alpha;ctx.lineWidth=(li===4?1.4:2.7)*dpr;ctx.shadowBlur=(li===4?7:15)*dpr;ctx.shadowColor=col;ctx.stroke();
  });ctx.globalAlpha=1;
 };draw();
}
function stopWave(hide=true){if(waveRAF)cancelAnimationFrame(waveRAF);waveRAF=null;if(waveCtx)waveCtx.close().catch(()=>{});waveCtx=null;analyser=null;if(hide)$('#waveWrap')?.classList.add('hidden')}
function expired(){
 setConn('Oturum sona erdi','Bilgisayardaki yeni QR kodunu okutun.','expired');$('#identity').classList.add('hidden');$('#recorder').classList.remove('hidden');$('#recorder').classList.add('expired-mode');$('#mic').disabled=true;$('#tapHint').classList.add('hidden');$('#expiredAction').classList.remove('hidden');$('#waveWrap').classList.add('hidden');$('#statePill').textContent='Oturum Sona Erdi';if(recorder&&['recording','paused'].includes(recorder.state)){recorder.onstop=null;try{recorder.stop()}catch{};stream?.getTracks().forEach(t=>t.stop())}clearInterval(timerInt);recorder=null;recorderMode='idle';stopWave();
}
function startWave(s){
 const c=$('#wave'),ctx=c.getContext('2d'),AC=window.AudioContext||window.webkitAudioContext,ac=new AC(),src=ac.createMediaStreamSource(s);analyser=ac.createAnalyser();analyser.fftSize=512;analyser.smoothingTimeConstant=.76;src.connect(analyser);waveCtx=ac;const data=new Uint8Array(analyser.fftSize);
 const draw=()=>{waveRAF=requestAnimationFrame(draw);const dpr=Math.min(devicePixelRatio||1,2),rect=c.getBoundingClientRect(),w=Math.max(1,rect.width*dpr|0),h=Math.max(1,rect.height*dpr|0);if(c.width!==w||c.height!==h){c.width=w;c.height=h}analyser.getByteTimeDomainData(data);ctx.clearRect(0,0,w,h);
  const layers=[['#5de0a3',1.0,-.08,0],['#ff625f',.85,-.03,23],['#c65cff',.78,.03,41],['#4c7cff',.7,.08,61],['#ffffff',.42,.01,7]];
  layers.forEach(([color,a,off,phase],li)=>{ctx.beginPath();for(let i=0;i<data.length;i++){const x=i/(data.length-1)*w,p=i/(data.length-1),env=Math.pow(Math.sin(Math.PI*p),.55),n=(data[(i+phase)%data.length]-128)/128,y=h/2+off*h+n*h*.42*a*env;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.strokeStyle=color;ctx.globalAlpha=li===4?.9:.72;ctx.lineWidth=(li===4?1.6:3.2)*dpr;ctx.shadowBlur=10*dpr;ctx.shadowColor=color;ctx.stroke()});ctx.globalAlpha=1;
 };draw();
}
function stopWave(){if(waveRAF)cancelAnimationFrame(waveRAF);waveRAF=null;if(waveCtx)waveCtx.close().catch(()=>{});waveCtx=null;analyser=null;const c=$('#wave');c?.getContext('2d')?.clearRect(0,0,c.width,c.height);$('#waveWrap')?.classList.add('hidden')}

let cam=null,scanRAF=null;
async function openScanner(){
 $('#scanner').classList.remove('hidden');$('#scanStatus').textContent='Kamera hazırlanıyor…';
 try{cam=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});const v=$('#scanVideo');v.srcObject=cam;await v.play();scan()}
 catch{$('#scanStatus').textContent='Kamera izni verilmedi.';$('#scanStatus').className='scan-status error'}
}
function closeScanner(){cam?.getTracks().forEach(t=>t.stop());cam=null;if(scanRAF)cancelAnimationFrame(scanRAF);$('#scanner').classList.add('hidden')}
function scan(){
 const v=$('#scanVideo'),c=$('#scanCanvas'),ctx=c.getContext('2d',{willReadFrequently:true});
 if(v.readyState>=2){c.width=v.videoWidth;c.height=v.videoHeight;ctx.drawImage(v,0,0);const im=ctx.getImageData(0,0,c.width,c.height),q=jsQR(im.data,im.width,im.height,{inversionAttempts:'dontInvert'});if(q?.data){try{const u=new URL(q.data);if(u.origin===location.origin&&u.pathname===location.pathname&&u.searchParams.get('mode')==='record'&&u.searchParams.get('token')){$('#scanStatus').textContent='QR bulundu. Yeni oturum açılıyor…';$('#scanStatus').className='scan-status ok';closeScanner();location.assign(u.toString());return}}catch{}}}
 scanRAF=requestAnimationFrame(scan);
}
})();