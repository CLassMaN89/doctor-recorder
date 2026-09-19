(() => {
const SUPABASE_URL='https://sqqqjsmblelxqwalxzfq.supabase.co';
const SUPABASE_KEY='sb_publishable_lyGKCZxtN4LtEdE3U63FUg_1J4jXqbA';
const API=`${SUPABASE_URL}/functions/v1/doctor-recorder-api`;
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
const params=new URLSearchParams(location.search);
const isMobile=params.get('mode')==='record';
const token=params.get('token')||'';
let session=null, device=null, recorder=null, chunks=[], stream=null, timerInt=null, startedAt=0, elapsedBeforePause=0, pauseStartedAt=0, isPaused=false, isFinishing=false, waveCtx=null, analyser=null, waveRAF=null, dashboardInt=null;

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
const waitingLoopText='TelefonBekleniyor...';

function stopWaitingLoop(){
 if(waitingLoopTimer){clearTimeout(waitingLoopTimer);waitingLoopTimer=null}
}
function waitingMarkup(){
 return '<div class="empty waiting-empty"><span class="waiting-icon-slot"><img class="waiting-live-icon" src="live-recording.svg" alt=""></span><div class="waiting-text-slot"><span class="waiting-rotating-wrap"><span id="waitingType" class="waiting-rotating">TelefonBekleniyor...</span><span class="waiting-gradient"></span></span><span class="type-cursor"></span></div></div>';
}
function startWaitingLoop(){
 stopWaitingLoop();
 const wrap=document.querySelector('.waiting-rotating-wrap');
 const textEl=document.getElementById('waitingType');
 if(!wrap||!textEl)return;
 textEl.textContent=waitingLoopText;
 // Measure the real text width so the animation behaves like Motion width: 0 -> auto.
 const probe=textEl.cloneNode(true);
 probe.style.cssText='position:absolute;visibility:hidden;width:auto;white-space:nowrap;pointer-events:none;';
 document.body.appendChild(probe);
 const width=Math.ceil(probe.getBoundingClientRect().width+3);
 probe.remove();
 wrap.style.setProperty('--loop-width',`${width}px`);

 const reveal=()=>{
  wrap.classList.remove('loop-out');
  void wrap.offsetWidth;
  wrap.classList.add('loop-in');
  waitingLoopTimer=setTimeout(()=>{
   wrap.classList.remove('loop-in');
   wrap.style.width=`${width}px`; wrap.style.opacity='1';
   waitingLoopTimer=setTimeout(()=>{
    wrap.style.width='';wrap.style.opacity='';
    wrap.classList.add('loop-out');
    waitingLoopTimer=setTimeout(()=>{
     wrap.classList.remove('loop-out');
     reveal();
    },820);
   },2200);
  },820);
 };
 reveal();
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
  devBox.innerHTML=waitingMarkup();
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
  row.innerHTML=`<img class="recording-rec-icon desktop-rec-icon" src="live-recording.svg" alt="Kayıt tamamlandı"><div class="rec-meta"><b>${esc(x.doctor_first_name||'Eski kayıt')} ${esc(x.doctor_last_name||'')}</b><small>${esc(x.device_model||'')} · ${new Date(r.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} · ${fmt(r.duration_seconds)}</small></div><div class="player"><button class="play">▶</button><div class="track"><div class="fill"></div></div><span class="ptime">00:00 / ${fmt(r.duration_seconds)}</span><audio preload="metadata" src="${r.signed_url||''}"></audio></div>`;
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
 $('#mic').onclick=toggleRecording;
 $('#pauseBtn').onclick=togglePause;
 $('#finishBtn').onclick=finishRecording;
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
  await state('connected'); await loadMobileHistory();
 }catch(e){if(e.status===410)expired();else{$('#identityError').textContent='Bağlantı kurulamadı.';$('#identityError').classList.remove('hidden')}}
}
async function state(status){if(!device)return;try{await api('device-state',{method:'POST',query:{token,device_token:device.device_token},body:{status}})}catch(e){if(e.status===410)expired()}}
async function startRecording(){
 let acquiredStream=null;
 try{
  if(!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('getUserMedia_not_supported'),{stage:'permission'});
  // iPhone/Safari: first request the simplest audio stream. Some Safari versions
  // reject otherwise valid sessions when optional constraints/codecs are forced.
  try{
   acquiredStream=await navigator.mediaDevices.getUserMedia({audio:true});
  }catch(err){
   err.stage='permission'; throw err;
  }
  stream=acquiredStream;

  // Safari/iOS MediaRecorder support differs by version. Try candidates one by one
  // and finally let the browser choose its own default MIME type.
  const candidates=[
   'audio/mp4',
   'audio/mp4;codecs=mp4a.40.2',
   'audio/webm;codecs=opus',
   'audio/webm'
  ];
  recorder=null;
  let lastRecorderError=null;
  for(const type of candidates){
   try{
    if(window.MediaRecorder?.isTypeSupported && !MediaRecorder.isTypeSupported(type)) continue;
    recorder=new MediaRecorder(stream,{mimeType:type});
    break;
   }catch(err){lastRecorderError=err}
  }
  if(!recorder){
   try{recorder=new MediaRecorder(stream)}
   catch(err){err.stage='recorder';err.cause=lastRecorderError;throw err}
  }

  chunks=[];isPaused=false;isFinishing=false;elapsedBeforePause=0;pauseStartedAt=0;
  recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
  recorder.onerror=e=>{
   console.error('MediaRecorder error',e);
   $('#uploadState').textContent='Kayıt sırasında tarayıcı hatası oluştu.';
   $('#uploadState').classList.remove('hidden');
  };
  recorder.onstop=uploadRecording;
  recorder.start(500);
  startedAt=Date.now();
  timerInt=setInterval(updateTimer,100);
  $('#timer').textContent='00:00';
  $('#mic').classList.add('recording');
  $('#statePill').className='pill recording';
  $('#statePill').textContent='Kaydediliyor';
  $('#tapHint').textContent='Mikrofon: kayıt / duraklat · Alttan kaydı bitirebilirsiniz';
  $('#recordHelp').textContent='Konuşmanız canlı olarak kaydediliyor.';
  $('#waveWrap').classList.remove('hidden');
  $('#recordControls').classList.remove('hidden');
  $('#pauseBtn').classList.remove('resume');
  $('#pauseBtn').innerHTML='Ⅱ <span>Duraklat</span>';
  startWave(stream);
  await state('recording');
 }catch(e){
  console.error('Recorder start failed:',e?.name,e?.message,e);
  acquiredStream?.getTracks().forEach(t=>t.stop());
  stream=null;recorder=null;
  let msg='Mikrofon başlatılamadı.';
  if(e?.name==='NotAllowedError'||e?.name==='SecurityError') msg='Mikrofon erişimine izin verilmedi. Safari adres çubuğundaki site ayarlarından Mikrofon → İzin Ver seçin.';
  else if(e?.name==='NotFoundError'||e?.name==='DevicesNotFoundError') msg='Bu cihazda kullanılabilir mikrofon bulunamadı.';
  else if(e?.name==='NotReadableError'||e?.name==='TrackStartError') msg='Mikrofon başka bir uygulama tarafından kullanılıyor olabilir.';
  else if(e?.name==='NotSupportedError'||e?.stage==='recorder') msg='Mikrofon izni var, ancak bu Safari sürümünde ses kayıt biçimi başlatılamadı.';
  $('#uploadState').textContent=msg;
  $('#uploadState').classList.remove('hidden');
 }
}
function updateTimer(){
 let ms=0;
 if(recorder){
  if(isPaused) ms=elapsedBeforePause;
  else ms=elapsedBeforePause+(Date.now()-startedAt);
 }
 $('#timer').textContent=fmt(ms/1000);
}
async function togglePause(){
 if(!recorder||isFinishing)return;
 if(recorder.state==='recording'){
  recorder.pause(); elapsedBeforePause+=Date.now()-startedAt; isPaused=true; pauseStartedAt=Date.now();
  $('#mic').classList.remove('recording');$('#statePill').className='pill';$('#statePill').textContent='Duraklatıldı';$('#recordHelp').textContent='Kayıt duraklatıldı. Devam etmek için mikrofona veya Devam Et butonuna dokunun.';$('#tapHint').textContent='Kayıt duraklatıldı';$('#pauseBtn').classList.add('resume');$('#pauseBtn').innerHTML='▶ <span>Devam Et</span>';stopWave();await state('idle');
 }else if(recorder.state==='paused'){
  recorder.resume(); startedAt=Date.now(); isPaused=false;
  $('#mic').classList.add('recording');$('#statePill').className='pill recording';$('#statePill').textContent='Kaydediliyor';$('#recordHelp').textContent='Konuşmanız canlı olarak kaydediliyor.';$('#tapHint').textContent='Mikrofon: kayıt / duraklat · Alttan kaydı bitirebilirsiniz';$('#pauseBtn').classList.remove('resume');$('#pauseBtn').innerHTML='Ⅱ <span>Duraklat</span>';$('#waveWrap').classList.remove('hidden');startWave(stream);await state('recording');
 }
}
async function finishRecording(){
 if(!recorder||isFinishing)return;
 isFinishing=true;
 if(recorder.state==='paused') recorder.resume();
 const totalMs=elapsedBeforePause+(isPaused?0:(Date.now()-startedAt));
 recorder.__finalDuration=Math.max(1,Math.round(totalMs/1000));
 clearInterval(timerInt); recorder.stop(); isPaused=false;
 $('#mic').classList.remove('recording');$('#recordControls').classList.add('hidden');$('#statePill').className='pill';$('#statePill').textContent='Gönderiliyor';$('#tapHint').textContent='Kayıt bilgisayara gönderiliyor…';$('#recordHelp').textContent='Ses kaydı tamamlandı.';stopWave();await state('uploading');
}
async function toggleRecording(){
 if(!device||$('#recorder').classList.contains('expired-mode')||isFinishing)return;
 if(!recorder) return startRecording();
 if(recorder.state==='recording'||recorder.state==='paused') return togglePause();
}

async function loadMobileHistory(){
 if(!device)return;
 try{
  const recs=await api('device-recordings',{query:{token,device_token:device.device_token}});
  $('#historyCount').textContent=`${recs.length} kayıt`;
  const box=$('#mobileRecordings');box.innerHTML=recs.length?'':'<div class="history-empty">Henüz kayıt yok.</div>';
  recs.forEach((r,i)=>{
   const el=document.createElement('div');el.className='mrec';
   el.innerHTML=`<div class="mrec-top"><b class="recording-title"><img class="recording-rec-icon" src="live-recording.svg" alt="Kayıt tamamlandı">Kayıt ${recs.length-i}</b><small>${new Date(r.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})} · ${fmt(r.duration_seconds)}</small></div><audio controls preload="metadata" src="${r.signed_url||''}"></audio>`;
   box.appendChild(el);
  });
 }catch(e){console.error('mobile history',e)}
}
function expired(){
 setConn('Oturum sona erdi','Bilgisayardaki yeni QR kodunu okutun.','expired');$('#identity').classList.add('hidden');$('#recorder').classList.remove('hidden');$('#recorder').classList.add('expired-mode');$('#mic').disabled=true;$('#tapHint').classList.add('hidden');$('#expiredAction').classList.remove('hidden');$('#waveWrap').classList.add('hidden');$('#statePill').textContent='Oturum Sona Erdi';if(recorder&&(recorder.state==='recording'||recorder.state==='paused')){try{recorder.stop()}catch{}}stopWave();
}
function startWave(s){
 stopWave();
 const c=$('#wave'),ctx=c.getContext('2d'),AC=window.AudioContext||window.webkitAudioContext,ac=new AC(),src=ac.createMediaStreamSource(s);
 analyser=ac.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.68;src.connect(analyser);waveCtx=ac;
 const data=new Uint8Array(analyser.fftSize);
 const draw=()=>{
  waveRAF=requestAnimationFrame(draw);
  const dpr=Math.min(devicePixelRatio||1,2),rect=c.getBoundingClientRect(),w=Math.max(1,rect.width*dpr|0),h=Math.max(1,rect.height*dpr|0);
  if(c.width!==w||c.height!==h){c.width=w;c.height=h}
  analyser.getByteTimeDomainData(data);
  let energy=0;for(let i=0;i<data.length;i++){const v=(data[i]-128)/128;energy+=v*v}energy=Math.sqrt(energy/data.length);
  const gain=Math.min(1,Math.max(.10,energy*5.8));
  ctx.clearRect(0,0,w,h);
  const grad=ctx.createRadialGradient(w*.5,h*.5,0,w*.5,h*.5,w*.58);grad.addColorStop(0,'rgba(40,25,75,.32)');grad.addColorStop(1,'rgba(2,5,12,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
  const layers=[
   {c:'#ff405e',a:1.00,f:1.00,p:0,l:3.1},
   {c:'#8a4dff',a:.88,f:1.18,p:47,l:3.0},
   {c:'#3d8bff',a:.78,f:.86,p:103,l:2.8},
   {c:'#39e5b2',a:.66,f:1.34,p:159,l:2.5},
   {c:'#ffffff',a:.38,f:1.06,p:211,l:1.4}
  ];
  layers.forEach((L,li)=>{
   ctx.beginPath();
   for(let i=0;i<420;i++){
    const p=i/419,x=p*w,env=Math.pow(Math.sin(Math.PI*p),.62);
    const di=Math.floor(p*(data.length-1)),raw=(data[(di+L.p)%data.length]-128)/128;
    const harmonic=Math.sin(p*Math.PI*2*(2.1+li*.35)+performance.now()*.0025*(li%2?1:-1))*.16;
    const y=h*.5+(raw*.78+harmonic)*h*.62*gain*L.a*env;
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
   }
   ctx.strokeStyle=L.c;ctx.lineWidth=L.l*dpr;ctx.globalAlpha=.82;ctx.shadowBlur=14*dpr;ctx.shadowColor=L.c;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
  });
  ctx.globalAlpha=1;ctx.shadowBlur=0;
 };
 draw();
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