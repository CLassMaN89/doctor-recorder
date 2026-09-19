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
const waitingLoopText='Bekleniyor...';

function stopWaitingLoop(){
 if(waitingLoopTimer){clearTimeout(waitingLoopTimer);waitingLoopTimer=null}
}
function waitingMarkup(){
 return '<div class="empty waiting-empty"><span class="waiting-icon-slot"><img class="waiting-live-icon" src="live-recording.svg" alt=""></span><div class="waiting-loop"><span class="waiting-static">Telefon</span><div class="waiting-animated-slot"><span class="waiting-rotating-wrap"><span id="waitingType" class="waiting-rotating">Bekleniyor...</span><span class="waiting-gradient"></span></span><span class="type-cursor"></span></div></div></div>';
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

document.body.classList.add(isMobile?'mobile-mode':'desktop-mode');
if(isMobile) initMobile(); else initDesktop();

async function initDesktop(){
 $('#desktop').classList.remove('hidden'); startWaitingLoop();
 let {data}=await sb.auth.getSession();
 if(!data.session){const r=await sb.auth.signInAnonymously(); if(r.error){alert('Oturum açılamadı');return}}
 $('#newQr').onclick=createSession;
 $('#deviceFilter').onchange=()=>renderDashboard(window.__dash||{devices:[],recordings:[]});
 $('#topRefresh') && ($('#topRefresh').onclick=loadDashboard);
 const saved=JSON.parse(localStorage.getItem('dr_pc_session')||'null');
 if(saved?.id&&saved?.token){session=saved;showSessionQR();await loadDashboard();dashboardInt=setInterval(loadDashboard,2500)}
 else await createSession();
}

function renderDoctorPanel(){
 const d=window.__dash||{devices:[]}, box=$('#doctorListPanel');
 if(!box)return;
 box.innerHTML=(d.devices||[]).length?'':'<div class="empty">Bağlı doktor yok.</div>';
 (d.devices||[]).forEach(x=>{
  const el=document.createElement('div');el.className='doctor-panel-row';
  el.innerHTML=`<div><b>${esc(x.doctor_first_name)} ${esc(x.doctor_last_name)}</b><small>${esc(x.device_model||'Telefon')} · ${esc(x.ip_address||'IP alınamadı')}</small></div><span>${esc(x.status||'connected')}</span>`;
  box.appendChild(el);
 });
}
function showSessionQR(){
 if(!session)return;
 const code=(session.token||'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
 $('#sessionCode').textContent=code.match(/.{1,3}/g)?.slice(0,3).join(' ')||'--------';
 const url=`${location.origin}${location.pathname}?mode=record&token=${encodeURIComponent(session.token)}`;
 $('#qrcode').innerHTML=''; new QRCode($('#qrcode'),{text:url,width:150,height:150,colorDark:'#17324a',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
}
async function createSession(){
 try{
  session=await api('create-session',{method:'POST',auth:true,body:{}});
  localStorage.setItem('dr_pc_session',JSON.stringify(session)); showSessionQR();
  if(dashboardInt)clearInterval(dashboardInt);
  await loadDashboard(); dashboardInt=setInterval(loadDashboard,2500);
 }catch(e){console.error(e);alert('QR oluşturulamadı.')}
}
async function loadDashboard(){
 if(!session)return;
 // Do not rebuild the recordings DOM while a recording is playing.
 // The dashboard refreshes every 2.5 seconds; rebuilding the <audio> element
 // was stopping playback at each refresh.
 const playingAudio=[...document.querySelectorAll('#recordings audio')].some(a=>!a.paused&&!a.ended);
 if(playingAudio)return;
 try{
   const d=await api('history',{auth:true});
   // Current QR session devices first, historical recordings remain persistent.
   const currentDevices=(d.devices||[]).filter(x=>x.session_id===session.id);
   window.__dash={devices:currentDevices,recordings:d.recordings||[],allDevices:d.devices||[]};
   renderDashboard(window.__dash);
 }catch(e){console.error(e)}
}

function waveSeed(v){
 let h=2166136261; const s=String(v||'recording');
 for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
 return h>>>0;
}
function waveBars(seed,count=72){
 let x=waveSeed(seed), vals=[];
 const centers=[.22,.38,.52,.69,.84];
 const amps=[];
 for(let k=0;k<centers.length;k++){x=(Math.imul(x,1664525)+1013904223)>>>0;amps.push(.35+(x/4294967295)*.65)}
 for(let i=0;i<count;i++){
  const p=i/(count-1);
  let shape=.10;
  centers.forEach((c,k)=>{const width=.035+(k%3)*.014;shape+=amps[k]*Math.exp(-Math.pow(p-c,2)/(2*width*width))});
  x=(Math.imul(x,1664525)+1013904223)>>>0;
  const micro=.82+(x/4294967295)*.28;
  vals.push(Math.min(1,shape*micro));
 }
 // smooth neighboring bars
 vals=vals.map((v,i,a)=>(v+(a[i-1]??v)+(a[i+1]??v))/3);
 return vals.map((v,i)=>{
   const p=i/(count-1), h=Math.max(4,Math.round(5+31*v));
   const hue=326 + p*72; // magenta -> violet -> blue/cyan via explicit CSS interpolation class
   return `<i style="--h:${h}px;--p:${p};--hue:${hue};--i:${i}"></i>`;
 }).join('');
}
function waveMarkup(seed,extra=''){
 return `<div class="apple-wave ${extra}" data-wave="${esc(seed)}">${waveBars(seed)}</div>`;
}
function wireWavePlayer(root,audio,play,timeEl){
 const bars=[...root.querySelectorAll('.apple-wave i')];
 const paint=()=>{
  const ratio=(Number.isFinite(audio.duration)&&audio.duration>0)?audio.currentTime/audio.duration:0;
  bars.forEach((b,i)=>b.classList.toggle('played',i/bars.length<=ratio));
  if(timeEl)timeEl.textContent=`${fmt(audio.currentTime)} / ${fmt(Number.isFinite(audio.duration)?audio.duration:0)}`;
 };
 audio.addEventListener('loadedmetadata',paint);
 audio.addEventListener('durationchange',paint);
 audio.addEventListener('timeupdate',paint);
 audio.addEventListener('ended',()=>{play.innerHTML=playIcon();paint()});
 audio.addEventListener('play',()=>play.innerHTML=pauseIcon());
 audio.addEventListener('pause',()=>{if(!audio.ended)play.innerHTML=playIcon()});
 audio.addEventListener('error',()=>{play.classList.add('audio-error');play.title='Ses dosyası açılamadı. Listeyi yenileyin.'});
 play.innerHTML=playIcon();
 play.onclick=async()=>{
  try{
   document.querySelectorAll('audio').forEach(a=>{if(a!==audio)a.pause()});
   if(audio.paused){if(audio.readyState===0)audio.load();await audio.play()}else audio.pause();
  }catch(err){console.error('Audio play failed',err);play.classList.add('audio-error');play.title='Ses oynatılamadı. Kayıt bağlantısını yenileyin.'}
 };
 const wave=root.querySelector('.apple-wave');
 if(wave)wave.onclick=e=>{
  if(!Number.isFinite(audio.duration)||audio.duration<=0)return;
  const b=e.currentTarget.getBoundingClientRect();
  audio.currentTime=Math.max(0,Math.min(audio.duration,((e.clientX-b.left)/b.width)*audio.duration));
 };
}
function playIcon(){return '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>'}
function pauseIcon(){return '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none"/></svg>'}

function animatePlaybackWave(root,audio){
 const wave=root.querySelector('.apple-wave'); if(!wave)return;
 const bars=[...wave.querySelectorAll('i')]; let raf=0;
 const tick=()=>{const t=performance.now()/180;bars.forEach((b,i)=>{const base=parseFloat(getComputedStyle(b).getPropertyValue('--h'))||10;const pulse=.72+.34*Math.abs(Math.sin(t+i*.43));b.style.height=`${Math.max(4,base*pulse)}px`});raf=requestAnimationFrame(tick)};
 audio.addEventListener('play',()=>{wave.classList.add('is-playing');cancelAnimationFrame(raf);tick()});
 const stop=()=>{wave.classList.remove('is-playing');cancelAnimationFrame(raf);bars.forEach(b=>b.style.height='var(--h)')}; audio.addEventListener('pause',stop);audio.addEventListener('ended',stop);
}


let liveStartedAt=0,liveTimerRAF=0;
function renderLiveWave(recording){
 const box=$('#liveWave'); if(!box)return;
 if(!box.children.length) box.innerHTML=waveBars('live-doctor-wave',78);
 box.classList.toggle('active',!!recording);
 if(recording && !liveStartedAt) liveStartedAt=Date.now();
 if(!recording) liveStartedAt=0;
 cancelAnimationFrame(liveTimerRAF);
 const tick=()=>{
  const sec=liveStartedAt?Math.floor((Date.now()-liveStartedAt)/1000):0;
  const val=fmt(sec);
  const a=$('#liveTimer'),b=$('#liveConnText'),c=$('#previewTimer'),e=$('#previewStateTime'); if(a)a.textContent=val;if(b)b.textContent=val;if(c)c.textContent=val;if(e)e.textContent=val;
  if(recording)liveTimerRAF=requestAnimationFrame(tick);
 };
 tick();
}

let liveTypingTimer=0,liveTypingKey="";
function startLiveTypeLoop(text){
 const el=$('#liveStatusText'), cursor=$('.status-cursor'); if(!el)return;
 if(liveTypingKey===text && liveTypingTimer)return;
 clearTimeout(liveTypingTimer); liveTypingTimer=0; liveTypingKey=text;
 let pos=0, deleting=false;
 el.textContent="";
 const step=()=>{
   if(!deleting){
     pos=Math.min(text.length,pos+1); el.textContent=text.slice(0,pos);
     if(pos===text.length){deleting=true;liveTypingTimer=setTimeout(step,1500);return}
     liveTypingTimer=setTimeout(step,58);
   }else{
     pos=Math.max(0,pos-1); el.textContent=text.slice(0,pos);
     if(pos===0){deleting=false;liveTypingTimer=setTimeout(step,420);return}
     liveTypingTimer=setTimeout(step,30);
   }
 };
 step();
}

function renderPhonePreview(d){
 const devices=d.devices||[], recs=d.recordings||[];
 const active=devices.find(x=>x.status==='recording');
 const code=($('#sessionCode')?.textContent||'---').trim();
 const q=$('#previewQrCode'); if(q)q.textContent=code;
 const ct=$('#previewConnTitle'); if(ct)ct.textContent=devices.length?'Bağlandı':'Bekleniyor';
 const st=$('#previewState'); if(st)st.textContent=active?'Kayıt yapılıyor...':'Kayıt bekleniyor...';
 const wave=$('#previewWave');
 if(wave && !wave.children.length) wave.innerHTML=waveBars('phone-preview-live',62);
 if(wave) wave.classList.toggle('active',!!active);
 const rows=$('#previewRecordings'); if(rows){
   rows.innerHTML=recs.slice(0,5).map((r,i)=>{
     const dev=devices.find(x=>x.id===r.device_connection_id);
     const dt=new Date(r.created_at);
     const date=dt.toLocaleDateString('tr-TR')+' · '+dt.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
     return `<div class="preview-rec-row"><span class="preview-rec-dot">● REC</span><div><small>${date} · ${fmt(r.duration_seconds||0)}</small><div class="preview-mini-wave">${waveBars(r.id+'-pv',34)}</div></div><button class="preview-play" data-url="${esc(r.signed_url||'')}">▶</button><b>⋮</b></div>`
   }).join('')||'<div class="preview-empty">Henüz kayıt yok.</div>';
   rows.querySelectorAll('.preview-play').forEach(btn=>btn.onclick=()=>{
      const url=btn.dataset.url;if(!url)return;
      if(window.__previewAudio){window.__previewAudio.pause();window.__previewAudio=null}
      const a=new Audio(url);window.__previewAudio=a;
      const row=btn.closest('.preview-rec-row');row?.classList.add('playing');btn.textContent='Ⅱ';
      a.onended=()=>{row?.classList.remove('playing');btn.textContent='▶';window.__previewAudio=null};
      a.play().catch(()=>{row?.classList.remove('playing');btn.textContent='▶'});
   });
 }
}
function renderDashboard(d){
 const devices=d.devices||[], recs=d.recordings||[], allDevices=d.allDevices||devices;
 $('#deviceCount').textContent=`${devices.length} cihaz`;
 const devBox=$('#devices'); devBox.innerHTML='';
 if(!devices.length){devBox.innerHTML=waitingMarkup();startWaitingLoop()}else stopWaitingLoop();
 devices.forEach(x=>{
  const el=document.createElement('div');el.className='device device-card';
  const active=Date.now()-new Date(x.last_seen_at).getTime()<45000;
  const st=x.status==='recording'?'Kayıt yapıyor':x.status==='uploading'?'Gönderiliyor':active?'Bağlı':'Bağlantı bekleniyor';
  const latest=recs.find(r=>r.device_connection_id===x.id);
  el.innerHTML=`<div class="device-phone"><span class="phone-icon"><svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M11 19h2"/></svg></span><div><b>${esc(x.device_model||'Telefon')}</b><small>${esc(x.doctor_first_name)} ${esc(x.doctor_last_name)} · ${esc(x.ip_address||'IP alınamadı')}</small></div></div><div class="device-presence"><b><span class="dot ${x.status==='recording'?'recording':''}"></span>${st}</b><small>Son görülme: ${active?'şimdi':Math.round((Date.now()-new Date(x.last_seen_at))/1000)+' sn önce'}</small></div><div class="device-sent ${latest?'':'muted'}"><span>✓</span><div><b>${latest?'Ses kaydı bilgisayara gönderildi':'Henüz kayıt gönderilmedi'}</b><small>${latest?'Son kayıt: '+new Date(latest.created_at).toLocaleString('tr-TR',{hour:'2-digit',minute:'2-digit'}):'Kayıt bekleniyor'}</small></div></div>`;
  devBox.appendChild(el);
 });
 const activeRec=devices.find(x=>x.status==='recording');
 renderLiveWave(activeRec);
 const live=$('.live-panel');
 if(live){
  live.classList.toggle('is-recording',!!activeRec);
  startLiveTypeLoop(activeRec?'Şuanda kayıt işlemi yapılıyor...':'Telefon bekleniyor...');
 }
 const filter=$('#deviceFilter'),old=filter.value;filter.innerHTML='<option value="">Tüm doktorlar</option>';
 const deviceMap=Object.fromEntries(allDevices.map(x=>[x.id,x]));
 const seen=new Set();allDevices.forEach(x=>{const key=x.id;if(seen.has(key))return;seen.add(key);const o=document.createElement('option');o.value=x.id;o.textContent=`${x.doctor_first_name} ${x.doctor_last_name} · ${x.device_model||'Telefon'}`;filter.appendChild(o)});filter.value=[...seen].includes(old)?old:'';
 const shown=recs.filter(r=>!filter.value||r.device_connection_id===filter.value),box=$('#recordings');box.innerHTML=shown.length?'':'<div class="empty">Henüz kayıt yok.</div>';
 shown.forEach((r,ri)=>{const x=deviceMap[r.device_connection_id]||{},row=document.createElement('div');row.className='rec-row wave-rec-row';const when=new Date(r.created_at),stamp=`${when.toLocaleDateString('tr-TR')} - ${when.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}`;
 row.innerHTML=`<div class="rec-id"><span class="rec-dot"></span><b>REC</b><span>${shown.length-ri}</span></div><div class="rec-doctor"><b>${esc(x.doctor_first_name||'Eski kayıt')} ${esc(x.doctor_last_name||'')}</b></div><div class="rec-device">${esc(x.device_model||'Telefon')}</div><div class="rec-date">${stamp}</div><div class="rec-duration">${fmt(r.duration_seconds)}</div><div class="wave-player">${waveMarkup(r.id||r.file_path||stamp)}<button class="play" aria-label="Oynat"></button><button class="delete-rec" title="Kaydı sil" aria-label="Kaydı sil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button><audio preload="metadata" src="${r.signed_url||''}"></audio></div>`;
 const audio=row.querySelector('audio'),play=row.querySelector('.play');wireWavePlayer(row,audio,play,null);animatePlaybackWave(row,audio);row.querySelector('.delete-rec').onclick=async()=>{if(!confirm('Bu ses kaydı kalıcı olarak silinsin mi?'))return;try{await api('delete-recording',{method:'POST',auth:true,body:{recording_id:r.id}});await loadDashboard()}catch(e){alert('Kayıt silinemedi.')}};box.appendChild(row)});
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}


let heartbeatTimer=null;
let lastDeviceStatus='connected';
let mobilePageHidden=false;

function qrLabel(){
 const raw=(token||'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
 if(!raw)return '------';
 return raw.slice(0,9).match(/.{1,3}/g).join(' ');
}

function setSentBadge(show){
 const el=$('#sentBadge'); if(!el)return;
 el.classList.toggle('hidden',!show);
}
function startHeartbeat(){
 if(heartbeatTimer) clearInterval(heartbeatTimer);
 const beat=()=>{ if(device) state(lastDeviceStatus||'connected',{heartbeat:true}).catch(()=>{}); };
 beat();
 heartbeatTimer=setInterval(beat,5000);
}
function stopHeartbeat(){
 if(heartbeatTimer){clearInterval(heartbeatTimer);heartbeatTimer=null}
}
async function initMobile(){
 $('#mobile').classList.remove('hidden');
 const qrEl=$('#mobileQrCode'); if(qrEl) qrEl.textContent=qrLabel();
 const mini=$('#mobileMiniQr'); if(mini){mini.innerHTML='';new QRCode(mini,{text:location.href,width:54,height:54,colorDark:'#17324a',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M})}
 document.addEventListener('visibilitychange',()=>{
  mobilePageHidden=document.hidden;
  if(!document.hidden && device){
   state(lastDeviceStatus||'connected',{heartbeat:true}).catch(()=>{});
   loadMobileHistory().catch(()=>{});
  }
 });
 window.addEventListener('pageshow',()=>{if(device) state(lastDeviceStatus||'connected',{heartbeat:true}).catch(()=>{})});
 window.addEventListener('online',()=>{if(device) state(lastDeviceStatus||'connected',{heartbeat:true}).catch(()=>{})});
 $('#identityContinue').onclick=register;
 $('#mic').onclick=toggleRecording;
 $('#pauseBtn').onclick=togglePause;
 $('#finishBtn').onclick=finishRecording;
 $('#scanQrBtn').onclick=openScanner;
 $('#closeScanner').onclick=closeScanner;
 const ok=await checkToken();
 if(!ok)return expired();
 const saved=JSON.parse(localStorage.getItem('dr_doctor')||'null');
 if(saved?.first)$('#firstName').value=saved.first;
 if(saved?.last)$('#lastName').value=saved.last;
 $('#identity').classList.remove('hidden');
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
  $('#identity').classList.add('hidden');$('#recorder').classList.remove('hidden');$('#doctorName').textContent=`${first} ${last}`;const chosenModel=model(); $('#deviceInfo').textContent=`${chosenModel} · Cihaz ${deviceId().slice(0,6).toUpperCase()}`;
  lastDeviceStatus='connected'; await state('connected'); startHeartbeat(); await loadMobileHistory();
 }catch(e){if(e.status===410)expired();else{$('#identityError').textContent='Bağlantı kurulamadı.';$('#identityError').classList.remove('hidden')}}
}
async function state(status,opts={}){
 if(!device)return;
 if(!opts.heartbeat) lastDeviceStatus=status;
 try{
  await api('device-state',{method:'POST',query:{token,device_token:device.device_token},body:{status}});
 }catch(e){
  if(e.status===410) expired();
  else if(!opts.heartbeat) throw e;
 }
}
async function startRecording(){
 setSentBadge(false);
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
  if(typeof window.MediaRecorder==='undefined'){
   const err=new Error('MediaRecorder_not_supported'); err.name='NotSupportedError'; err.stage='recorder'; throw err;
  }

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
  // Visualizer and server presence are auxiliary. Neither may cancel a valid mic recording.
  try{ startWave(stream); }catch(waveErr){ console.warn('Waveform unavailable:',waveErr); $('#waveWrap')?.classList.add('hidden'); }
  state('recording').catch(stateErr=>console.warn('Device state update failed:',stateErr));
 }catch(e){
  console.error('Recorder start failed:',e?.name,e?.message,e);
  acquiredStream?.getTracks().forEach(t=>t.stop());
  stream=null;recorder=null;
  let msg=`Mikrofon başlatılamadı${e?.name?` (${e.name})`:''}${e?.message?`: ${e.message}`:''}.`;
  if(e?.name==='NotAllowedError'||e?.name==='SecurityError') msg='Mikrofon erişimine izin verilmedi. Safari adres çubuğundaki site ayarlarından Mikrofon → İzin Ver seçin.';
  else if(e?.name==='NotFoundError'||e?.name==='DevicesNotFoundError') msg='Bu cihazda kullanılabilir mikrofon bulunamadı.';
  else if(e?.name==='NotReadableError'||e?.name==='TrackStartError') msg='Mikrofon başka bir uygulama tarafından kullanılıyor olabilir.';
  else if(e?.name==='NotSupportedError'||e?.stage==='recorder') msg='Mikrofon izni var, ancak bu Safari sürümünde ses kayıt biçimi başlatılamadı.';
  $('#uploadState').textContent=msg;
  $('#uploadState').classList.remove('hidden');
 }
}

async function uploadRecording(){
 const finishedRecorder=recorder;
 try{
  $('#uploadState').textContent='Ses kaydı gönderiliyor…';
  $('#uploadState').classList.remove('hidden');

  const duration=finishedRecorder?.__finalDuration ||
    Math.max(1,Math.round(elapsedBeforePause/1000));

  const actualType=(finishedRecorder?.mimeType || chunks[0]?.type || 'audio/mp4').split(';')[0];
  const blob=new Blob(chunks,{type:actualType});
  stream?.getTracks().forEach(t=>t.stop());

  if(!blob.size) throw new Error('empty_recording');

  const ext=actualType.includes('mp4')?'m4a':
            actualType.includes('mpeg')?'mp3':
            actualType.includes('wav')?'wav':
            actualType.includes('aac')?'aac':'webm';

  const form=new FormData();
  form.append('file',blob,`recording.${ext}`);
  form.append('duration_seconds',String(duration));

  await api('upload',{
   method:'POST',
   query:{token,device_token:device.device_token},
   body:form
  });

  $('#uploadState').textContent='';
  $('#uploadState').classList.add('hidden');
  setSentBadge(true);
  $('#statePill').className='pill';
  $('#statePill').textContent='Hazır';
  $('#tapHint').textContent='Yeni kayıt için mikrofona dokunun';
  $('#recordHelp').textContent='Ses kaydı bilgisayara gönderildi.';
  $('#timer').textContent='00:00';

  recorder=null;
  chunks=[];
  stream=null;
  elapsedBeforePause=0;
  pauseStartedAt=0;
  startedAt=0;
  isPaused=false;
  isFinishing=false;

  state('idle').catch(e=>console.warn('Device state update failed:',e));
  await loadMobileHistory();
 }catch(e){
  console.error('Upload failed:',e);
  stream?.getTracks().forEach(t=>t.stop());
  recorder=null;
  chunks=[];
  stream=null;
  elapsedBeforePause=0;
  pauseStartedAt=0;
  startedAt=0;
  isPaused=false;
  isFinishing=false;
  $('#timer').textContent='00:00';
  $('#statePill').className='pill';
  $('#statePill').textContent='Gönderilemedi';
  $('#uploadState').textContent='Ses kaydı gönderilemedi. Tekrar kayıt alabilirsiniz.';
  $('#uploadState').classList.remove('hidden');
  state('idle').catch(()=>{});
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
  $('#mic').classList.remove('recording');$('#statePill').className='pill';$('#statePill').textContent='Duraklatıldı';$('#recordHelp').textContent='Kayıt duraklatıldı. Devam etmek için mikrofona veya Devam Et butonuna dokunun.';$('#tapHint').textContent='Kayıt duraklatıldı';$('#pauseBtn').classList.add('resume');$('#pauseBtn').innerHTML='▶ <span>Devam Et</span>';stopWave();state('idle').catch(e=>console.warn('Device state update failed:',e));
 }else if(recorder.state==='paused'){
  recorder.resume(); startedAt=Date.now(); isPaused=false;
  $('#mic').classList.add('recording');$('#statePill').className='pill recording';$('#statePill').textContent='Kaydediliyor';$('#recordHelp').textContent='Konuşmanız canlı olarak kaydediliyor.';$('#tapHint').textContent='Mikrofon: kayıt / duraklat · Alttan kaydı bitirebilirsiniz';$('#pauseBtn').classList.remove('resume');$('#pauseBtn').innerHTML='Ⅱ <span>Duraklat</span>';$('#waveWrap').classList.remove('hidden');try{startWave(stream)}catch(e){console.warn('Waveform unavailable:',e);$('#waveWrap')?.classList.add('hidden')}state('recording').catch(e=>console.warn('Device state update failed:',e));
 }
}
async function finishRecording(){
 if(!recorder||isFinishing)return;
 isFinishing=true;
 if(recorder.state==='paused') recorder.resume();
 const totalMs=elapsedBeforePause+(isPaused?0:(Date.now()-startedAt));
 recorder.__finalDuration=Math.max(1,Math.round(totalMs/1000));
 clearInterval(timerInt); recorder.stop(); isPaused=false;
 $('#mic').classList.remove('recording');$('#recordControls').classList.add('hidden');$('#statePill').className='pill';$('#statePill').textContent='Gönderiliyor';$('#tapHint').textContent='Kayıt bilgisayara gönderiliyor…';$('#recordHelp').textContent='Ses kaydı tamamlandı.';stopWave();state('uploading').catch(e=>console.warn('Device state update failed:',e));
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
   const el=document.createElement('div');el.className='mrec wave-mrec';
   const stamp=new Date(r.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
   el.innerHTML=`<div class="mrec-wave-line"><div class="mrec-label"><img class="recording-rec-icon" src="live-recording.svg" alt="Kayıt tamamlandı"><b>Kayıt ${recs.length-i}</b><small>${stamp} · ${fmt(r.duration_seconds)}</small></div>${waveMarkup(r.id||r.file_path||stamp,'mobile-wave')}<button class="play mobile-play" aria-label="Oynat">▶</button><audio preload="metadata" src="${r.signed_url||''}"></audio></div>`;
   const audio=el.querySelector('audio'),play=el.querySelector('.play');
   wireWavePlayer(el,audio,play,null); animatePlaybackWave(el,audio);
   box.appendChild(el);
  });
 }catch(e){console.error('mobile history',e)}
}
function expired(){stopHeartbeat();
 setConn('Oturum sona erdi','Bilgisayardaki yeni QR kodunu okutun.','expired');$('#identity').classList.add('hidden');$('#recorder').classList.remove('hidden');$('#recorder').classList.add('expired-mode');$('#mic').disabled=true;$('#tapHint').classList.add('hidden');$('#expiredAction').classList.remove('hidden');$('#waveWrap').classList.add('hidden');$('#statePill').textContent='Oturum Sona Erdi';if(recorder&&(recorder.state==='recording'||recorder.state==='paused')){try{recorder.stop()}catch{}}stopWave();
}
function startWave(s){
 stopWave();
 $('#waveWrap')?.classList.remove('hidden');
 const c=$('#wave'),ctx=c.getContext('2d'),AC=window.AudioContext||window.webkitAudioContext,ac=new AC(),src=ac.createMediaStreamSource(s);
 analyser=ac.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.76;src.connect(analyser);waveCtx=ac;
 const freq=new Uint8Array(analyser.frequencyBinCount);
 const draw=()=>{
  waveRAF=requestAnimationFrame(draw);
  const dpr=Math.min(devicePixelRatio||1,2),rect=c.getBoundingClientRect(),w=Math.max(1,rect.width*dpr|0),h=Math.max(1,rect.height*dpr|0);
  if(c.width!==w||c.height!==h){c.width=w;c.height=h}
  analyser.getByteFrequencyData(freq);
  ctx.clearRect(0,0,w,h);
  // transparent background; only the animated waveform is drawn
  const bars=64,gap=2.4*dpr,bw=Math.max(2*dpr,(w-gap*(bars-1))/bars),cy=h/2;
  for(let i=0;i<bars;i++){
   const p=i/(bars-1), fi=Math.min(freq.length-1,Math.floor(p*freq.length*.72));
   const energy=freq[fi]/255, env=.32+.68*Math.pow(Math.sin(Math.PI*p),.72);
   const bh=Math.max(4*dpr,(8+energy*h*.78)*env);
   const hue=330+p*210; // pink -> violet -> blue -> cyan
   ctx.fillStyle=`hsl(${hue%360} 92% 56%)`;
   const x=i*(bw+gap),y=cy-bh/2,r=Math.min(bw/2,3*dpr);
   ctx.beginPath();
   if(ctx.roundRect)ctx.roundRect(x,y,bw,bh,r);else ctx.rect(x,y,bw,bh);
   ctx.fill();
  }
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