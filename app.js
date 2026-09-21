(() => {
const SUPABASE_URL='https://gzkaeiqtocuwofolfpty.supabase.co';
const SUPABASE_KEY='sb_publishable_MOLr-P3BRpdkr710huL7MQ_wb6W4LMT';
const API=`${SUPABASE_URL}/functions/v1/doctor-recorder-api`;
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
const params=new URLSearchParams(location.search);
const isMobile=params.get('mode')==='record';
// Oturum kodu adres çubuğunda kalmaz: telefonda saklanır, adres "?mode=record" olarak temizlenir (sayfa yenilenince buradan okunur).
const SESSION_TOKEN_KEY='dr_session_token';
const readStoredToken=()=>{try{const v=JSON.parse(localStorage.getItem(SESSION_TOKEN_KEY)||'null');return v&&v.token&&Date.now()-v.at<24*3600*1000?v.token:''}catch{return ''}};
const saveStoredToken=t=>{try{localStorage.setItem(SESSION_TOKEN_KEY,JSON.stringify({token:t,at:Date.now()}))}catch{}};
const clearStoredToken=()=>{try{localStorage.removeItem(SESSION_TOKEN_KEY)}catch{}};
const urlToken=params.get('token')||'';
const token=isMobile?(urlToken||readStoredToken()):urlToken;
if(isMobile&&urlToken){saveStoredToken(urlToken);try{history.replaceState(null,'',location.pathname+'?mode=record')}catch{}}
let session=null, device=null, recorder=null, chunks=[], stream=null, timerInt=null, startedAt=0, elapsedBeforePause=0, pauseStartedAt=0, isPaused=false, isFinishing=false, waveCtx=null, analyser=null, waveRAF=null, dashboardInt=null;
let activePlaybackCount=0;
const mobileConnectionId=crypto.randomUUID();
function isRecordingPlaybackActive(){
 return activePlaybackCount>0 || [...document.querySelectorAll('#recordings audio, #mobileHistory audio')].some(a=>!a.paused&&!a.ended);
}

// Telefon kimliği bu tarayıcıda kalıcıdır: sayfa yenilense de aynı cihaz sayılır, "Kayıtlarım" kaybolmaz.
// (Ad/soyad ve telefon adı her bağlantıda yeniden girilir ve sunucuda güncellenir.)
function deviceId(){
 try{
  let id=localStorage.getItem('dr_device_id');
  if(!id){id=crypto.randomUUID();localStorage.setItem('dr_device_id',id)}
  return id;
 }catch{return mobileConnectionId}
}
// Gerçek cihaz adı: Android Chrome modeli User-Agent'ta gizler ("K"); userAgentData ile gerçek model istenir.
// iOS tarayıcıları tam model vermez; ekran ölçüsünden seri tahmin edilir.
let detectedModel=null;
function iosModelGuess(){
 const w=Math.min(screen.width,screen.height),h=Math.max(screen.width,screen.height);
 const map={'320x568':'iPhone SE (1. nesil)','375x667':'iPhone 8 / SE','414x736':'iPhone 8 Plus','375x812':'iPhone X / 11 Pro / 12-13 mini','414x896':'iPhone 11 / XR / 11 Pro Max','390x844':'iPhone 12-14','428x926':'iPhone 12-14 Pro Max / Plus','393x852':'iPhone 15 / 16 / Pro','430x932':'iPhone 15-16 Pro Max / Plus','402x874':'iPhone 16 Pro','440x956':'iPhone 16 Pro Max'};
 return map[w+'x'+h]||'iPhone';
}
function baseModel(){
 const ua=navigator.userAgent;
 if(/iPhone/i.test(ua)) return iosModelGuess();
 if(/iPad/i.test(ua)) return 'iPad';
 const m=ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|\))/i);
 const raw=m?.[1]?.trim();
 return raw&&raw.length>1?raw:(/Android/i.test(ua)?'Android Telefon':'Telefon');
}
function prettyModel(v){
 v=String(v||'').trim(); if(!v||v.length<2)return null;
 if(/^SM-/i.test(v))return 'Samsung '+v; if(/^Pixel/i.test(v))return 'Google '+v; return v;
}
let detectedOs='';
function baseOs(){
 const ua=navigator.userAgent;
 const ios=ua.match(/OS (\d+)[_.](\d+)/); if(/iPhone|iPad/i.test(ua)&&ios) return 'iOS '+ios[1]+'.'+ios[2];
  // Android User-Agent sürümü dondurulmuş (hep 10) olduğundan yalnızca userAgentData'dan gelen gerçek sürüm kullanılır.
 return '';
}
async function detectModel(){
 try{
  const uad=navigator.userAgentData;
  if(uad?.getHighEntropyValues){const h=await uad.getHighEntropyValues(['model']);const p=prettyModel(h.model);if(p)detectedModel=p;const pv=(await uad.getHighEntropyValues(['platformVersion'])).platformVersion;if(pv&&/android/i.test(navigator.userAgent))detectedOs='Android '+String(pv).split('.')[0]}
 }catch{}
}
function model(){
 const name=detectedModel||baseModel();
 const os=detectedOs||baseOs();
 return os&&!name.includes(os)?name+' · '+os:name;
}
// Telefon alanı pasif: değeri kullanıcı değil cihaz belirler (tarayıcının verdiği model + işletim sistemi).
function fillPhoneModel(){
 const el=document.querySelector('#phoneModel'); if(!el)return;
 el.value=model();
}
detectModel().then(fillPhoneModel);
window.addEventListener('load',fillPhoneModel);
function fmt(sec){sec=Math.max(0,Math.floor(sec||0));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}
// ---- Merkezi günlük: hatalar sunucudaki app_logs tablosuna gönderilir (oturumsuz, hız sınırlı) ----
const APP_VER='panel v11.x';
let __logCount=0; const __logSeen=new Set();
function logEvent(level,message,detail){
 try{
  if(__logCount>=15)return;
  const key=level+'|'+message; if(__logSeen.has(key))return; __logSeen.add(key); __logCount++;
  fetch(`${API}?action=log`,{method:'POST',keepalive:true,headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({source:isMobile?'phone':'web',level,message:String(message).slice(0,500),detail,app_version:APP_VER,session_token:token||null})}).catch(()=>{});
 }catch{}
}
window.addEventListener('error',e=>logEvent('error',e.message||'Betik hatası',{file:e.filename,line:e.lineno,col:e.colno}));
window.addEventListener('unhandledrejection',e=>logEvent('error','Yakalanmamış hata: '+(e.reason&&e.reason.message||e.reason),{status:e.reason&&e.reason.status}));
async function api(action,{method='GET',body=null,auth=false,query={}}={}){
 const q=new URLSearchParams({action,...query});
 const headers={apikey:SUPABASE_KEY};
 if(auth){const {data}=await sb.auth.getSession(); if(data.session)headers.Authorization=`Bearer ${data.session.access_token}`}
 if(body && !(body instanceof FormData))headers['Content-Type']='application/json';
 let r; try{r=await fetch(`${API}?${q}`,{method,headers,body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined,cache:'no-store'})}catch(err){logEvent('warn','Ağ hatası: '+action,{message:String(err&&err.message||err)});throw err}
 const j=await r.json().catch(()=>({}));
 if(!r.ok){ if(![401,403,404,410].includes(r.status))logEvent(r.status>=500?'error':'warn',`API ${action} -> ${r.status}`,{error:j.error}); throw Object.assign(new Error(j.error||'request_failed'),{status:r.status,data:j}); }
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

let selectedRecordingDate='';
function localDateKey(value){
 const d=new Date(value); if(Number.isNaN(d.getTime())) return '';
 const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
 return `${y}-${m}-${day}`;
}
function syncDateFilterUI(){
 const input=$('#recordingDateFilter'),wrap=input?.closest('.date-picker-wrap');
 if(!input||!wrap)return;
 wrap.classList.toggle('has-value',!!input.value);
}


function clinicLogin(){
 return new Promise(resolve=>{
  const box=document.createElement('div');
  box.style.cssText='position:fixed;inset:0;background:rgba(16,38,59,.55);display:grid;place-items:center;z-index:9999;font-family:inherit';
  box.innerHTML=`<form style="background:#fff;border-radius:14px;padding:24px;width:min(380px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.25)">
   <h2 style="margin:0 0 6px;font-size:19px;color:#10263B">Klinik Hesabı</h2>
   <p style="margin:0 0 14px;color:#60778B;font-size:13px">Dikte2 ile aynı kayıt listesini görmek için giriş yapın.</p>
   <input id="clEmail" type="email" placeholder="E-posta" autocomplete="username" style="width:100%;padding:11px;margin-bottom:10px;border:1px solid #DCE8EE;border-radius:9px;font:inherit">
   <input id="clPass" type="password" placeholder="Şifre" autocomplete="current-password" style="width:100%;padding:11px;border:1px solid #DCE8EE;border-radius:9px;font:inherit">
   <div id="clErr" style="color:#E53649;font-size:13px;min-height:20px;margin-top:8px"></div>
   <button type="submit" style="width:100%;margin-top:6px;padding:12px;border:0;border-radius:10px;background:#0D98A6;color:#fff;font:inherit;font-weight:600;cursor:pointer">Giriş Yap</button>
  </form>`;
  document.body.appendChild(box);
  const form=box.querySelector('form');
  form.onsubmit=async e=>{
   e.preventDefault();
   const btn=form.querySelector('button');btn.disabled=true;box.querySelector('#clErr').textContent='';
   const r=await sb.auth.signInWithPassword({email:box.querySelector('#clEmail').value.trim(),password:box.querySelector('#clPass').value});
   if(r.error){box.querySelector('#clErr').textContent='E-posta veya şifre hatalı.';btn.disabled=false;return}
   // Eski (anonim) oturuma ait kayıtlı QR başka kimliğe aitti; yenisi oluşturulsun.
   localStorage.removeItem('dr_pc_session');
   box.remove();resolve();
  };
  box.querySelector('#clEmail').focus();
 });
}
// Üst çubuk: canlı tarih-saat ve sistem durumu
function tickBrandClock(){
 const el=document.getElementById('brandClock'); if(!el)return;
 const d=new Date();
 const date=d.toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:'numeric'});
 const time=d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
 el.textContent=`${date} • ${time}`;
}
function updateSysPill(){
 const pill=document.getElementById('sysPill'),t=document.getElementById('sysPillText'); if(!pill||!t)return;
 const ok=navigator.onLine!==false;
 pill.classList.toggle('offline',!ok); t.textContent=ok?'Sistem Hazır':'Bağlantı Yok';
}
tickBrandClock(); setInterval(tickBrandClock,15000);
updateSysPill(); window.addEventListener('online',updateSysPill); window.addEventListener('offline',updateSysPill);
async function initDesktop(){
 $('#desktop').classList.remove('hidden'); startWaitingLoop();
 let {data}=await sb.auth.getSession();
 if(!data.session||data.session.user?.is_anonymous){await clinicLogin();}
 $('#newQr').onclick=()=>createSession(false);
 $('#deviceFilter').onchange=()=>{recPage=0;rerenderRecs()};
 const dateInput=$('#recordingDateFilter');
 if(dateInput){dateInput.onchange=()=>{selectedRecordingDate=dateInput.value||'';syncDateFilterUI();renderDashboard(window.__dash||{devices:[],recordings:[]})};dateInput.onclick=()=>{try{dateInput.showPicker?.()}catch{}};syncDateFilterUI();}
 $('.table-refresh') && ($('.table-refresh').onclick=loadDashboard);
 $('#topRefresh') && ($('#topRefresh').onclick=loadDashboard);
 let saved=JSON.parse(localStorage.getItem('dr_pc_session')||'null');
 // Kayıtlı QR başka yerden (ör. Dikte2) kapatılmış olabilir: geçerli değilse yenisini oluştur.
 if(saved?.token){
  try{const st=await api('status',{query:{token:saved.token}});if(st?.status==='expired')saved=null;else if(typeof st?.remaining_seconds==='number')qrLocalExpiry=Date.now()+st.remaining_seconds*1000}catch{saved=null}
  if(!saved)localStorage.removeItem('dr_pc_session');
 }
 if(saved?.id&&saved?.token){session=saved;showSessionQR();await loadDashboard();dashboardInt=setInterval(loadDashboard,2500)}
 else await createSession();
}

function renderDoctorPanel(){
 const d=window.__dash||{devices:[]}, box=$('#doctorListPanel');
 if(!box)return;
 box.innerHTML=(d.devices||[]).length?'':'<div class="empty">Bağlı doktor yok.</div>';
 (d.devices||[]).forEach(x=>{
  const el=document.createElement('div');el.className='doctor-panel-row';
  el.innerHTML=`<div><b>${esc(x.doctor_first_name)} ${esc(x.doctor_last_name)}</b><small>${osIcon(x.device_model)}${esc(x.device_model||'Telefon')} <span class="ip-badge">${esc(x.ip_address||'IP alınamadı')}</span></small></div><span>${esc(x.status||'connected')}</span>`;
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
async function createSession(auto){
 try{
  // auto=true: süre dolunca otomatik yenileme (bağlı doktorlar düşmez); aksi halde eski bağlantılar da kapanır.
  session=await api('create-session',{method:'POST',auth:true,body:{mode:'web',replace:!auto}});
  qrLocalExpiry=Date.now()+Math.max(0,Date.parse(session.expires_at)-Date.parse(session.created_at));
  document.body.classList.remove('qr-expired');
  localStorage.setItem('dr_pc_session',JSON.stringify(session)); showSessionQR();
  if(dashboardInt)clearInterval(dashboardInt);
  await loadDashboard(); dashboardInt=setInterval(loadDashboard,2500);
 }catch(e){console.error(e);alert('QR oluşturulamadı.')}
}
// QR ömrü: kullanılmazsa 5 dk, işlem oldukça 15 dk (sunucu kayan süre tutar). Süre dolunca yeni QR otomatik oluşur.
let sessionCheckTick=0,qrLocalExpiry=0,qrChecking=false;
function tickQrCountdown(){
 const el=document.getElementById('qrCountdown'); if(!el||!qrLocalExpiry)return;
 const left=Math.max(0,Math.round((qrLocalExpiry-Date.now())/1000));
 if(left>86400){el.textContent='';return}   // eski sunucu (30 günlük oturum): geri sayım gösterme
 const m=Math.floor(left/60),sec=left%60;
 el.textContent=left<=10?'Yenileniyor…':(m>0?`Yenilenmesine ${m} dk ${sec} sn`:`Yenilenmesine ${sec} sn`);
 if(left<=0&&!qrChecking)checkSessionStillValid();
}
setInterval(tickQrCountdown,1000);
async function checkSessionStillValid(){
 if(!session?.token||qrChecking)return;
 qrChecking=true;
 try{
  const st=await api('status',{query:{token:session.token}});
  if(typeof st?.remaining_seconds==='number')qrLocalExpiry=Date.now()+st.remaining_seconds*1000;
  const dead=st?.status==='expired';
  if(dead){qrChecking=false;await createSession(true);return}   // kapandı (süre/başka yerden yenilendi): otomatik yeni QR — diğer oturumları kapatmaz   // mutlak süre doldu: yeni QR
  if(!dead&&typeof st?.remaining_seconds==='number'&&st.remaining_seconds<=0){qrChecking=false;await createSession(true);return}   // katılım penceresi kapandı: yeni QR
  document.body.classList.toggle('qr-expired',dead);                                 // başka yerden kapatıldı: uyar
  const code=document.getElementById('sessionCode');
  if(dead&&code)code.textContent='YENİLENDİ';
 }catch{}
 qrChecking=false;
}
async function loadDashboard(){
 if(!session)return;
 if(++sessionCheckTick%8===1)checkSessionStillValid();
 // Do not rebuild the recordings DOM while a recording is playing.
 // The dashboard refreshes every 2.5 seconds; rebuilding the <audio> element
 // was stopping playback at each refresh.
 if(isRecordingPlaybackActive())return;
 try{
   const d=await api('history',{auth:true});
   // Playback may have started while the async request was in flight.
   // Never replace the audio element once playback has begun.
   if(isRecordingPlaybackActive())return;
   // Current QR session devices first, historical recordings remain persistent.
   const now=Date.now();
   // Aynı telefon başka doktor adıyla girdiyse eski satır (sinyali henüz bitmemiş olsa da) gösterilmez: telefon başına en güncel bağlantı.
   const freshDevices=(d.devices||[]).filter(x=>(x.mode?x.mode==='web':x.session_id===session.id) && x.last_seen_at && now-new Date(x.last_seen_at).getTime()<45000);
   const latestByPhone=new Map(),actOf=x=>new Date(x.last_activity_at||x.created_at||0).getTime();
   freshDevices.forEach(x=>{const k=x.device_id||x.id,cur=latestByPhone.get(k);if(!cur||actOf(x)>actOf(cur)||(actOf(x)===actOf(cur)&&new Date(x.created_at)>new Date(cur.created_at)))latestByPhone.set(k,x)});
   const currentDevices=freshDevices.filter(x=>latestByPhone.get(x.device_id||x.id)===x);
   window.__dash={devices:currentDevices,recordings:d.recordings||[],allDevices:d.devices||[]};
   renderDashboard(window.__dash);
 }catch(e){console.error(e)}
}

function waveSeed(v){
 let h=2166136261; const s=String(v||'recording');
 for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
 return h>>>0;
}
// Dikte2 uygulamasındaki dalga paleti (soldan sağa: pembe → mor → mavi → turkuaz).
const WAVE_PALETTE=[[232,58,154],[198,64,214],[129,82,240],[64,118,246],[24,168,236],[0,202,214]];
function waveColor(p){
 const sc=Math.min(Math.max(p,0),.9999)*(WAVE_PALETTE.length-1),i=Math.floor(sc),t=sc-i,a=WAVE_PALETTE[i],b=WAVE_PALETTE[i+1];
 return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)})`;
}
// Dikte2'deki "aktif dalga" animasyonu: çubuk boyları zamanla akan bir desenle salınır (WaveformControl ile aynı formül).
function flowHeights(bars,H,t){
 const n=bars.length; if(!n)return;
 bars.forEach((b,i)=>{
  const r=i/Math.max(1,n-1),env=.48+.52*Math.sin(Math.PI*r);
  const primary=Math.abs(Math.sin(i*.27+t)),detail=Math.abs(Math.sin(i*.071-t*.63));
  const pulse=.78+.22*Math.sin(t*1.7+r*8);
  b.style.height=Math.max(4,Math.min(H-2,(5+H*(.18+.52*primary*detail)*env)*pulse))+'px';
 });
}
// Dalga animasyonu: tüm dalgalar TEK ortak döngüde, en fazla ~30 kare/sn, yalnızca ekranda görünenler ve sayfa görünürken çizilir.
// (Liste ne kadar uzun olursa olsun maliyet ekrandaki satır sayısıyla sınırlı kalır.)
const flowSet=new Set();let flowRAF=0,flowLast=0;
const flowIO=('IntersectionObserver' in window)?new IntersectionObserver(es=>es.forEach(e=>{e.target.__vis=e.isIntersecting})):null;
window.addEventListener('resize',()=>flowSet.forEach(el=>{el.__h=0}));
function flowLoop(t){
 flowRAF=requestAnimationFrame(flowLoop);
 if(document.hidden||t-flowLast<33)return;
 flowLast=t;const now=t*.003;
 for(const el of flowSet){
  if(!el.isConnected){
   if(el.__seen||++el.__idle>240){flowSet.delete(el);flowIO?.unobserve(el)}
   continue;
  }
  el.__seen=true;
  if(!el.__vis)continue;
  if(!el.__h)el.__h=el.clientHeight||46;
  flowHeights(el.__bars,el.__h,now);
 }
 if(!flowSet.size){cancelAnimationFrame(flowRAF);flowRAF=0}
}
function setFlow(el,on){
 if(!el)return;
 if(!on){flowSet.delete(el);flowIO?.unobserve(el);[...el.querySelectorAll('i')].forEach(b=>b.style.height='');return}
 el.__bars=[...el.querySelectorAll('i')];el.__seen=false;el.__idle=0;el.__h=0;el.__vis=true;
 flowIO?.observe(el);flowSet.add(el);
 if(!flowRAF)flowRAF=requestAnimationFrame(flowLoop);
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
 vals=vals.map((v,i)=>v*(.55+.45*Math.sin(Math.PI*i/(count-1))));
 return vals.map((v,i)=>{
   const p=i/(count-1), h=Math.max(4,Math.round(5+31*v));
   const hue=326 + p*72; // canlı dalga (.live-apple-wave) hâlâ hue kullanır
   return `<i style="--h:${h}px;--p:${p};--hue:${hue};--i:${i};--c:${waveColor(p)}"></i>`;
 }).join('');
}
function waveMarkup(seed,extra=''){
 return `<div class="apple-wave ${extra}" data-wave="${esc(seed)}">${waveBars(seed,/mobile-wave/.test(extra)?42:72)}</div>`;
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
 audio.addEventListener('ended',()=>{activePlaybackCount=0;play.innerHTML=playIcon();paint()});
 audio.addEventListener('play',()=>{activePlaybackCount=1;play.innerHTML=pauseIcon()});
 audio.addEventListener('pause',()=>{activePlaybackCount=0;if(!audio.ended)play.innerHTML=playIcon()});
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
function pauseIcon(){return '<img class="pause-control-icon" src="duraklat.png" alt="Duraklat">'}

function animatePlaybackWave(root,audio){
 const wave=root.querySelector('.apple-wave'); if(!wave)return;
 // Liste dalgaları boşta durağan (sıfır maliyet); yalnızca ses oynarken akar, çalınan kısım koyulaşır.
 audio.addEventListener('play',()=>{wave.classList.add('is-playing');setFlow(wave,true)});
 const stop=()=>{wave.classList.remove('is-playing');setFlow(wave,false)};
 audio.addEventListener('pause',stop);audio.addEventListener('ended',stop);
}


let liveStartedAt=0,liveTimerRAF=0;
function renderLiveWave(recording){
 const box=$('#liveWave'); if(!box)return;
 if(!box.children.length) box.innerHTML=waveBars('live-doctor-wave',92);
 box.classList.toggle('active',!!recording);
 setFlow(box,true);   // "Canlı Ses Kaydı" kartındaki dalga (yalnızca sitede) her zaman akar; diğer dalgalar yalnızca ses oynarken
 if(recording && !liveStartedAt) liveStartedAt=Date.now();
 if(!recording) liveStartedAt=0;
 clearTimeout(liveTimerRAF);
 const tick=()=>{
  const sec=liveStartedAt?Math.floor((Date.now()-liveStartedAt)/1000):0;
  const val=fmt(sec);
  const a=$('#liveTimer'),b=$('#liveConnText'),c=$('#previewTimer'),e=$('#previewStateTime'); if(a)a.textContent=val;if(b)b.textContent=val;if(c)c.textContent=val;if(e)e.textContent=val;
  if(recording)liveTimerRAF=setTimeout(tick,250);   // saniyede 60 kez değil, dörtte bir saniyede güncelle
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
 if(wave) {wave.classList.toggle('active',!!active);setFlow(wave,!!active)}
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
function setDesktopConnectionState(connected){
 const title=$('#desktopConnTitle'),sub=$('#desktopConnSub'),dot=$('#desktopConnDot');
 if(!title||!sub)return;
 title.textContent=connected?'Masaüstüne Bağlandı':'Telefon Bekleniyor';
 sub.textContent=connected?'Doktor cihazı aktif olarak bağlandı.':'QR kodunu doktor telefonundan okutun.';
 if(dot)dot.classList.toggle('offline',!connected);
 const ico=$('#connIco'); if(ico)ico.classList.toggle('connected',!!connected);
}
// Masaüstü paneli ekrana sığdırılır: sayfa kaydırma çubuğu çıkmaz. Kısa ekranda en fazla %20 küçültülür (yazılar çok küçülmesin),
// uzun ekranda kartlar boşluk kalmayacak şekilde uzatılır.
let fitSig='',fitRAF=0;
function fitDesktop(force){
 const root=document.documentElement,sc=document.querySelector('.dashboard-showcase'),shell=document.querySelector('.desktop-shell');
 if(!sc||!shell||!document.body.classList.contains('desktop-mode')||window.innerWidth<1101||document.getElementById('desktop')?.classList.contains('hidden')){
  root.classList.remove('fit');root.style.removeProperty('zoom');root.style.removeProperty('--z');sc&&(sc.style.minHeight='');fitSig='';return;
 }
 const sig=window.innerWidth+'x'+window.innerHeight+'|'+(document.querySelectorAll('#devices .device-rich,#devices .device').length);
 if(!force&&sig===fitSig)return;
 fitSig=sig;
 root.classList.add('fit');root.style.zoom='1';sc.style.minHeight='0px';shell.style.setProperty('min-height','0px','important');   // doğal yüksekliği ölç
 const shellH=shell.getBoundingClientRect().height,scH=sc.getBoundingClientRect().height,extra=shellH-scH;
 shell.style.removeProperty('min-height');
 const z=Math.max(.8,Math.min(1,window.innerHeight/shellH));
 root.style.zoom=String(z);root.style.setProperty('--z',String(z));
 sc.style.minHeight=Math.max(scH,Math.floor(window.innerHeight/z-extra))+'px';
 recSizeOverride=null;recFitTries=0;
 if(lastDash)renderDashboard(lastDash);
}
window.addEventListener('resize',()=>{cancelAnimationFrame(fitRAF);fitRAF=requestAnimationFrame(()=>fitDesktop(true))});
let lastDash=null;const rerenderRecs=()=>{if(lastDash)renderDashboard(lastDash)};
function downloadFileName(r,x){
 const clean=v=>String(v||'').trim().replace(/[^\p{L}\p{N}._-]+/gu,'_').replace(/^_+|_+$/g,'');
 const doctor=clean(`${x.doctor_first_name||'Doktor'}_${x.doctor_last_name||''}`)||'Doktor';
 const created=new Date(r.created_at),date=Number.isNaN(created.getTime())?'kayit':created.toISOString().replace(/[:]/g,'-').replace(/\.\d{3}Z$/,'');
 const path=String(r.file_path||'').split('?')[0],pathExt=(path.match(/\.([a-z0-9]{2,5})$/i)||[])[1];
 const mimeExt={'audio/webm':'webm','audio/ogg':'ogg','audio/mpeg':'mp3','audio/mp4':'m4a','audio/wav':'wav','audio/x-wav':'wav'}[String(r.mime_type||'').split(';')[0].toLowerCase()];
 return `${doctor}_${date}.${pathExt||mimeExt||'webm'}`;
}
async function downloadRecording(r,x,button){
 if(!r.signed_url){showNotice('Kayıt indirilemedi','Ses dosyası bağlantısı bulunamadı.');return}
 button.disabled=true;button.classList.add('is-loading');button.setAttribute('aria-label','İndiriliyor');
 try{
  const response=await fetch(r.signed_url,{cache:'no-store'});if(!response.ok)throw new Error(`download_${response.status}`);
  const blob=await response.blob(),href=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=href;link.download=downloadFileName(r,x);link.style.display='none';document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(href),1500);
  toast({title:'İndirme tamamlandı',message:'Ses kaydı bilgisayarınıza indirildi.',variant:'success'});
 }catch(e){logEvent('warn','Ses kaydı indirilemedi',{recording_id:r.id,message:String(e&&e.message||e)});showNotice('Kayıt indirilemedi','Lütfen bağlantınızı kontrol edip tekrar deneyin.')}
 finally{button.disabled=false;button.classList.remove('is-loading');button.setAttribute('aria-label','Ses kaydını indir')}
}
function renderDashboard(d){
 lastDash=d;
 if(!renderDashboard.__fitting){renderDashboard.__fitting=true;try{fitDesktop(false)}finally{renderDashboard.__fitting=false}}
 const devices=d.devices||[], recs=d.recordings||[], allDevices=d.allDevices||devices;
 setDesktopConnectionState(devices.length>0);
 $('#deviceCount').textContent=`${devices.length} cihaz`;
 const devBox=$('#devices'); devBox.innerHTML='';
 if(!devices.length){devBox.innerHTML=waitingMarkup();startWaitingLoop()}else stopWaitingLoop();
 devices.forEach(x=>{
  const el=document.createElement('div');el.className='device device-card';
  const active=Date.now()-new Date(x.last_seen_at).getTime()<45000;
  const st=x.status==='recording'?'Kayıt yapıyor':x.status==='uploading'?'Gönderiliyor':active?'Bağlı':'Bağlantı bekleniyor';
  const latest=recs.find(r=>r.device_connection_id===x.id);
  el.innerHTML=`<div class="device-phone"><span class="phone-icon"><svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M11 19h2"/></svg></span><div><b>${osIcon(x.device_model)}${esc(x.device_model||'Telefon')}</b><small>${esc(x.doctor_first_name)} ${esc(x.doctor_last_name)} <span class="ip-badge">${esc(x.ip_address||'IP alınamadı')}</span></small></div></div><div class="device-presence"><b><span class="dot ${x.status==='recording'?'recording':''}"></span>${st}</b><small>Son görülme: ${active?'şimdi':Math.round((Date.now()-new Date(x.last_seen_at))/1000)+' sn önce'}</small></div><div class="device-sent ${latest?'':'muted'}"><span>✓</span><div><b>${latest?'Ses kaydı bilgisayara gönderildi':'Henüz kayıt gönderilmedi'}</b><small>${latest?'Son kayıt: '+new Date(latest.created_at).toLocaleString('tr-TR',{hour:'2-digit',minute:'2-digit'}):'Kayıt bekleniyor'}</small></div></div>`;
  devBox.appendChild(el);
 });
 const activeRec=devices.find(x=>x.status==='recording');
 renderLiveWave(activeRec);
 const live=$('.live-panel');
 if(live){
  live.classList.toggle('is-recording',!!activeRec);
  const lt=$('#liveLineText');if(lt)lt.textContent=activeRec?'Kayıt ediliyor...':'Kayıt bekleniyor...';
  startLiveTypeLoop(activeRec?'Şuanda kayıt işlemi yapılıyor...':'Telefon bekleniyor...');
 }
 const filter=$('#deviceFilter'),old=filter.value;filter.innerHTML='<option value="">Tüm doktorlar</option>';
 const deviceMap=Object.fromEntries(allDevices.map(x=>[x.id,x]));
 announceRecChanges(recs,deviceMap);
 // Doktor listesi: ad-soyada göre TEK satır (büyük/küçük harf ve oturum/telefon farkı yok sayılır), alfabetik, kayıt sayısıyla.
 const docKey=x=>`${(x.doctor_first_name||'').trim()} ${(x.doctor_last_name||'').trim()}`.replace(/\s+/g,' ').trim().toLocaleLowerCase('tr-TR')||'?';
 const titleCase=t=>t.split(' ').map(w=>w?w.charAt(0).toLocaleUpperCase('tr-TR')+w.slice(1).toLocaleLowerCase('tr-TR'):w).join(' ');
 const docs=new Map();
 allDevices.forEach(x=>{const k=docKey(x);if(!docs.has(k))docs.set(k,{label:titleCase(k==='?'?'Eski kayıt':k),count:0})});
 recs.forEach(r=>{const x=deviceMap[r.device_connection_id];if(x)docs.get(docKey(x)).count++});
 [...docs].sort((a,b)=>a[1].label.localeCompare(b[1].label,'tr')).forEach(([k,v])=>{const o=document.createElement('option');o.value='doc:'+k;o.textContent=`${v.label} (${v.count})`;filter.appendChild(o)});
 filter.value=docs.has(old.replace(/^doc:/,''))?old:'';
 // Filtreyi tek tıkla temizleyen ✕ düğmesi
 const wrap=filter.closest('.doctor-select-wrap');let clr=document.getElementById('docClear');
 if(wrap&&!clr){clr=document.createElement('button');clr.id='docClear';clr.type='button';clr.className='filter-clear';clr.setAttribute('aria-label','Doktor filtresini temizle');clr.title='Filtreyi temizle';clr.textContent='✕';clr.onclick=()=>{filter.value='';rerenderRecs()};wrap.appendChild(clr)}
 if(wrap){wrap.classList.toggle('has-clear',!!filter.value)}
 const shown=recs.filter(r=>(!filter.value||(deviceMap[r.device_connection_id]&&'doc:'+docKey(deviceMap[r.device_connection_id])===filter.value))&&(!selectedRecordingDate||localDateKey(r.created_at)===selectedRecordingDate)),box=$('#recordings'),boxH0=box.clientHeight,scrollY0=window.scrollY,prevTops=new Map([...box.querySelectorAll('.wave-rec-row[data-rid]')].map(e=>[e.dataset.rid,e.getBoundingClientRect().top]));box.innerHTML=shown.length?'':'<div class="empty">Henüz kayıt yok.</div>';
 // Sayfalama: sayfa başına kayıt sayısı, listenin görünür yüksekliğine göre belirlenir.
 const pageKey=`${filter.value}|${selectedRecordingDate||''}`;if(pageKey!==recPageKey){recPageKey=pageKey;recPage=0;recSizeOverride=null;recFitTries=0}
 const wideList=window.matchMedia('(min-width:1101px)').matches,pageSize=recSizeOverride||(wideList&&boxH0>150?Math.max(3,Math.floor(boxH0/40)):8),pageCount=Math.max(1,Math.ceil(shown.length/pageSize));
 recPage=Math.min(recPage,pageCount-1);
 // Sabitlenen kayıtlar listenin en üstünde (sabitleme sırasıyla); numara kayıt sırasına göre kalır.
 const numOf=new Map(shown.map((r,i)=>[r.id,shown.length-i])),pins=getPinnedRecs();
 prunePinnedRecs(recs);
 shown.sort((p,q)=>{const a=pins.indexOf(p.id),b=pins.indexOf(q.id);return (a<0?1e9:a)-(b<0?1e9:b)});
 const start=recPage*pageSize,pageItems=shown.slice(start,start+pageSize);
 renderRecPager(pageCount,shown.length,start,pageItems.length);
 pageItems.forEach((r,pi)=>{const ri=start+pi;const x=deviceMap[r.device_connection_id]||{},row=document.createElement('div');row.className='rec-row wave-rec-row'+(pins.includes(r.id)?' pinned':'');row.dataset.rid=r.id;const when=new Date(r.created_at),stamp=`${when.toLocaleDateString('tr-TR')} - ${when.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}`;
 row.innerHTML=`<div class="rec-id"><span class="rec-dot"></span><b class="rec-txt">REC</b><img class="rec-anim" src="live-recording.svg" alt="" draggable="false"><span>${numOf.get(r.id)}</span></div><div class="rec-doctor"><b>${esc(x.doctor_first_name||'Eski kayıt')} ${esc(x.doctor_last_name||'')}</b><button class="pin-rec" type="button" aria-pressed="${pins.includes(r.id)}" title="${pins.includes(r.id)?'Sabitlemeyi kaldır':'Üste sabitle'}" aria-label="${pins.includes(r.id)?'Sabitlemeyi kaldır':'Üste sabitle'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v5M9 3h6l-1 6 3.2 3.4V14H6.8v-1.6L10 9z"/></svg></button></div><div class="rec-device" title="${esc(x.device_model||'Telefon')}">${osIcon(x.device_model)}<span class="rd-model" title="${esc(x.device_model||'Telefon')}">${esc(x.device_model||'Telefon')}</span>${x.ip_address?`<span class="ip-badge">${esc(x.ip_address)}</span>`:''}</div><div class="rec-ip">${x.ip_address?`<span class="ip-badge">${esc(x.ip_address)}</span>`:'—'}</div><div class="rec-date">${stamp}</div><div class="rec-duration">${fmt(r.duration_seconds)}</div><div class="wave-player">${waveMarkup(r.id||r.file_path||stamp)}<button class="play" aria-label="Oynat"></button><button class="delete-rec" title="Kaydı sil" aria-label="Kaydı sil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button><audio preload="metadata" src="${r.signed_url||''}"></audio></div>`;
 const downloadBtn=document.createElement('button');downloadBtn.className='download-rec';downloadBtn.type='button';downloadBtn.title='Ses kaydını indir';downloadBtn.setAttribute('aria-label','Ses kaydını indir');downloadBtn.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"/></svg>';row.querySelector('.delete-rec').before(downloadBtn);downloadBtn.onclick=e=>{e.stopPropagation();downloadRecording(r,x,downloadBtn)};
 const audio=row.querySelector('audio'),play=row.querySelector('.play');wireWavePlayer(row,audio,play,null);animatePlaybackWave(row,audio);row.querySelector('.delete-rec').onclick=async()=>{if(!(await askConfirm({title:'Ses kaydı silinsin mi?',text:'Bu ses kaydı kalıcı olarak silinir. Bu işlem geri alınamaz.',okText:'Sil',cancelText:'Vazgeç',danger:true})))return;try{await api('delete-recording',{method:'POST',auth:true,body:{recording_id:r.id}});localGone.add(r.id);row.classList.add('row-out');await new Promise(z=>setTimeout(z,300));toast({title:'Ses kaydı silindi',message:`${(x.doctor_first_name||'')+' '+(x.doctor_last_name||'')} · ${fmt(r.duration_seconds||0)} kaydı kalıcı olarak silindi`.trim(),variant:'delete'});await loadDashboard()}catch(e){showNotice('Kayıt silinemedi','Lütfen bağlantınızı kontrol edip tekrar deneyin.')}};const pinBtn=row.querySelector('.pin-rec');pinBtn.onclick=e=>{e.stopPropagation();togglePinRec(r.id)};row.tabIndex=0;row.onkeydown=e=>{if((e.key==='p'||e.key==='P')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.target===row){e.preventDefault();togglePinRec(r.id)}};
 if(pinAnimId===r.id)row.classList.add('pin-pop');
 box.appendChild(row)});
 // Sabitle/kaldır: satırlar eski konumlarından yeni konumlarına yaylanarak kayar (FLIP)
 if(pinFlip&&!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)){
  const moving=[];box.querySelectorAll('.wave-rec-row[data-rid]').forEach(el=>{const p=prevTops.get(el.dataset.rid);if(p==null)return;const dy=p-el.getBoundingClientRect().top;if(Math.abs(dy)>1){el.style.transition='none';el.style.transform=`translateY(${dy}px)`;moving.push(el)}});
  if(moving.length){void box.offsetHeight;requestAnimationFrame(()=>moving.forEach((el,i)=>{el.style.transition=`transform .55s cubic-bezier(.34,1.42,.56,1) ${Math.min(i,6)*18}ms`;el.style.transform='';el.addEventListener('transitionend',()=>{el.style.transition=''},{once:true})}))}
 }
 pinFlip=false;pinAnimId=null;
 // Son satır kesiliyorsa sayfa başına kayıt sayısı, gerçek satır yüksekliğine göre azaltılır.
 if(wideList&&pageItems.length>1&&box.scrollHeight>box.clientHeight+2){recSizeOverride=pageItems.length-1;recFitTries=0;rerenderRecs()}
 else if(wideList&&recFitTries<4&&start+pageItems.length<shown.length){
  // Liste alanında boş yer kaldıysa (satırlar küçükse) sığabilecek kadar satır daha eklenir.
  const last=box.querySelector('.wave-rec-row:last-of-type'),rows=box.querySelectorAll('.wave-rec-row');
  if(last&&rows.length){
   const used=last.offsetTop+last.offsetHeight-box.offsetTop,avg=used/rows.length,free=box.clientHeight-used;
   if(free>=avg*.9){recFitTries++;recSizeOverride=pageItems.length+Math.max(1,Math.floor(free/avg));rerenderRecs()}
  }
 }
 if(Math.abs(window.scrollY-scrollY0)>1)window.scrollTo(0,scrollY0);   // liste yeniden çizilirken sayfa yukarı atmasın
}
let recPage=0,recPageKey='',recSizeOverride=null,recFitTries=0,pinFlip=false,pinAnimId=null;
// Sabitlenen kayıtlar bu tarayıcıda saklanır (en fazla 3).
const MAX_PINNED_RECS=3;
function getPinnedRecs(){try{const v=JSON.parse(localStorage.getItem('dr_pinned_recs')||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function setPinnedRecs(v){try{localStorage.setItem('dr_pinned_recs',JSON.stringify(v))}catch{}}
function prunePinnedRecs(all){const ids=new Set((all||[]).map(r=>r.id)),cur=getPinnedRecs();if(!ids.size)return;const keep=cur.filter(id=>ids.has(id));if(keep.length!==cur.length)setPinnedRecs(keep)}
async function togglePinRec(id){
 const cur=getPinnedRecs();
 if(cur.includes(id))setPinnedRecs(cur.filter(x=>x!==id));
 else{
  if(cur.length>=MAX_PINNED_RECS){await showNotice('Sabitleme sınırı',`En fazla ${MAX_PINNED_RECS} kayıt sabitlenebilir. Önce birinin sabitlemesini kaldırın.`);return}
  setPinnedRecs([...cur,id]);
 }
 pinFlip=true;pinAnimId=id;recPage=0;rerenderRecs();
}
window.addEventListener('resize',()=>{recSizeOverride=null;recFitTries=0;clearTimeout(window._recRz);window._recRz=setTimeout(rerenderRecs,250)});
function renderRecPager(pageCount,total,start,count){
 const p=document.getElementById('recPager');if(!p)return;
 p.classList.toggle('single',pageCount<=1);
 p.innerHTML=`<span class="rp-info">${total?`${start+1}–${start+count} / ${total} kayıt`:''}</span><span class="rp-nav"><button type="button" class="rp-prev" ${recPage<=0?'disabled':''} aria-label="Önceki sayfa">‹</button><b>${recPage+1} / ${pageCount}</b><button type="button" class="rp-next" ${recPage>=pageCount-1?'disabled':''} aria-label="Sonraki sayfa">›</button></span>`;
 p.querySelector('.rp-prev').onclick=()=>{recPage--;rerenderRecs()};
 p.querySelector('.rp-next').onclick=()=>{recPage++;rerenderRecs()};
}
// İşletim sistemi logosu: cihaz adının yanında, yazı boyutuyla orantılı (em) küçük simge.
function osKind(m){
 m=String(m||'');
 if(/iOS|iPhone|iPad|iPod|Apple/i.test(m))return 'apple';
 if(/Android|SM-|CPH|Pixel|Redmi|Xiaomi|Huawei|OnePlus|Samsung|Galaxy|Oppo|Vivo|Realme|Motorola|Nokia|Infinix|Tecno/i.test(m))return 'android';
 return 'other';
}
const OS_SVG={
 android:'<svg class="os-ico os-android" viewBox="0 0 24 24" aria-label="Android" role="img"><path d="M5.5 15.5a6.5 6.5 0 0 1 13 0z"/><path d="M8.6 9.2 7.2 6.8M15.4 9.2l1.4-2.4" stroke="#3ddc84" stroke-width="1.3" stroke-linecap="round" fill="none"/><circle cx="9.7" cy="12.6" r=".95" class="os-eye"/><circle cx="14.3" cy="12.6" r=".95" class="os-eye"/><rect x="5.5" y="16.6" width="13" height="5.2" rx="1.4"/></svg>',
 apple:'<svg class="os-ico os-apple" viewBox="0 0 24 24" aria-label="Apple" role="img"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>',
 other:'<svg class="os-ico os-other" viewBox="0 0 24 24" aria-label="Telefon" role="img"><rect x="7" y="2.5" width="10" height="19" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 18.5h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
};
function osIcon(m){return OS_SVG[osKind(m)]}
// Site temasına uygun onay / bilgi penceresi (tarayıcının kendi confirm/alert kutuları yerine).
function askConfirm({title='Emin misiniz?',text='',okText='Evet',cancelText='Vazgeç',danger=false}={}){
 return new Promise(resolve=>{
  const back=document.createElement('div'); back.className='dr-modal-back';
  const ico=danger
   ? '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.01"/></svg>'
   : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>';
  back.innerHTML=`<div class="dr-modal" role="dialog" aria-modal="true"><div class="dr-modal-ico ${danger?'danger':''}">${ico}</div><h3>${esc(title)}</h3><p>${esc(text).replace(/\n/g,'<br>')}</p><div class="dr-modal-actions">${cancelText?`<button type="button" class="dr-btn ghost" data-r="0">${esc(cancelText)}</button>`:''}<button type="button" class="dr-btn ${danger?'danger':'primary'}" data-r="1">${esc(okText)}</button></div></div>`;
  const onKey=e=>{if(e.key==='Escape')close(false);if(e.key==='Enter')close(true)};
  let closed=false;
  const close=v=>{if(closed)return;closed=true;document.removeEventListener('keydown',onKey);back.classList.add('leaving');resolve(v);setTimeout(()=>back.remove(),320)};
  back.addEventListener('click',e=>{if(e.target===back&&cancelText)close(false)});
  back.querySelectorAll('button').forEach(b=>b.onclick=()=>close(b.dataset.r==='1'));
  document.addEventListener('keydown',onKey);
  document.body.appendChild(back);
  back.querySelector('.dr-btn:last-child').focus();
 });
}
// Bildirim kartı (toast-notification bileşeninin sade JS karşılığı): sağ altta, alttan yumuşakça yükselerek gelir, kendiliğinden kapanır.
const TOAST_COLORS={success:'#22c55e',error:'#ef4444',info:'#0ea5e9',warning:'#f59e0b',delete:'#ef4444'};
const TOAST_ICONS={
 success:'<circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.8 2.8L16 9.8"/>',
 error:'<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
 warning:'<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.01"/>',
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 8v.01M12 12v5"/>',
 delete:'<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>'
};
function toast({title,message='',variant='success',ms=4800}){
 let host=document.getElementById('toastHost');
 if(!host){host=document.createElement('div');host.id='toastHost';host.className='toast-host';host.setAttribute('aria-live','polite');host.setAttribute('role','status');document.body.appendChild(host)}
 while(host.children.length>=4)host.firstElementChild.remove();
 const accent=TOAST_COLORS[variant]||TOAST_COLORS.success,el=document.createElement('div');
 el.className='toast-card t-'+(TOAST_COLORS[variant]?variant:'success');el.style.setProperty('--toast-accent',accent);
 el.innerHTML=`<div class="toast-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${TOAST_ICONS[variant]||TOAST_ICONS.success}</svg></div><div class="toast-text"><span class="toast-title">${esc(title)}</span>${message?`<span class="toast-msg">${esc(message)}</span>`:''}</div>`;
 host.appendChild(el);
 let done=false;
 const close=()=>{if(done)return;done=true;el.classList.add('leaving');setTimeout(()=>el.remove(),260)};
 el.addEventListener('click',close);
 setTimeout(close,ms);
}
// Kayıt listesindeki değişiklikleri izler: yeni kayıt gelince / kayıt silinince bildirim çıkar (ilk yükleme sessizdir).
let knownRecs=null;const localGone=new Set();
function announceRecChanges(recs,deviceMap){
 const nameOf=r=>{const x=deviceMap[r.device_connection_id]||{};return `${(x.doctor_first_name||'').trim()} ${(x.doctor_last_name||'').trim()}`.trim()||'Eski kayıt'};
 const cur=new Map(recs.map(r=>[r.id,{doc:nameOf(r),dur:r.duration_seconds||0}]));
 if(knownRecs){
  const added=[...cur].filter(([id])=>!knownRecs.has(id)),gone=recs.length<200?[...knownRecs].filter(([id])=>!cur.has(id)&&!localGone.has(id)):[];
  if(added.length===1)toast({title:'Yeni ses kaydı geldi',message:`${added[0][1].doc} · ${fmt(added[0][1].dur)} · listeye eklendi`,variant:'success'});
  else if(added.length>1)toast({title:`${added.length} yeni ses kaydı geldi`,message:'Listeye eklendi',variant:'success'});
  if(gone.length===1)toast({title:'Ses kaydı silindi',message:`${gone[0][1].doc} · ${fmt(gone[0][1].dur)} kaydı kaldırıldı`,variant:'delete'});
  else if(gone.length>1)toast({title:`${gone.length} ses kaydı silindi`,message:'Listeden kaldırıldı',variant:'delete'});
  gone.forEach(([id])=>localGone.delete(id));
 }
 knownRecs=cur;
}
const showNotice=(title,text)=>askConfirm({title,text,okText:'Tamam',cancelText:''});
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}


let heartbeatTimer=null;
let lastDeviceStatus='connected';
let mobilePageHidden=false;

function qrLabel(){
 const raw=(token||'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
 if(!raw)return '------';
 return raw.slice(0,9).match(/.{1,3}/g).join(' ');
}

function setSentBadge(){ /* cihaz bilgisinin yanındaki yeşil yazı kaldırıldı; gönderim bilgisi mikrofonun üstündeki metinde gösterilir */ }
let helpTypeTimer=null;
function setHelp(t){clearInterval(helpTypeTimer);helpTypeTimer=null;const h=$('#recordHelp');if(!h)return;h.classList.remove('sent');h.textContent=t}
// Gönderim tamamlanınca: yeşil metin harf harf yazılır, bitince onay işareti (tik) çizilerek belirir.
function showSentHelp(){
 const h=$('#recordHelp');if(!h)return;
 clearInterval(helpTypeTimer);
 const text='Ses kaydı bilgisayara gönderildi.';
 h.classList.add('sent');
 h.innerHTML='<span class="sent-typed"></span><svg class="sent-tick" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>';
 const out=h.querySelector('.sent-typed'),tick=h.querySelector('.sent-tick');
 if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches){out.textContent=text;tick.classList.add('on');return}
 let i=0;
 helpTypeTimer=setInterval(()=>{i++;out.textContent=text.slice(0,i);if(i>=text.length){clearInterval(helpTypeTimer);helpTypeTimer=null;tick.classList.add('on')}},32);
}

function startHeartbeat(){
 if(heartbeatTimer) clearInterval(heartbeatTimer);
 // Kayıt/gönderim sürerken sinyal şart; sayfa gizli ve boştaysa (ekran kilitli) pil için gönderilmez.
 const beat=()=>{
  if(!device)return;
  const busy=(recorder&&(recorder.state==='recording'||recorder.state==='paused'))||isFinishing;
  if(document.hidden&&!busy)return;
  state(lastDeviceStatus||'connected',{heartbeat:true}).catch(()=>{});
 };
 beat();
 heartbeatTimer=setInterval(beat,8000);
 if(!window.__beatVis){window.__beatVis=true;document.addEventListener('visibilitychange',()=>{if(!document.hidden)beat()})}
}
function stopHeartbeat(){
 if(heartbeatTimer){clearInterval(heartbeatTimer);heartbeatTimer=null}
}
async function initMobile(){
 $('#mobile').classList.remove('hidden');
 const qrEl=$('#mobileQrCode'); if(qrEl) qrEl.textContent=qrLabel();
 const mini=$('#mobileMiniQr'); if(mini){mini.innerHTML='';new QRCode(mini,{text:location.origin+location.pathname+'?mode=record&token='+encodeURIComponent(token),width:54,height:54,colorDark:'#17324a',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M})}
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
 $('#longWarnContinue').onclick=()=>{hideLongWarn();longWarnAt=elapsedMs()+LONG_REC_MS};
 $('#longWarnFinish').onclick=()=>{hideLongWarn();finishRecording()};
 $('#pauseBtn').innerHTML=pauseBtnHtml(false);
 $('#scanQrBtn').onclick=openScanner;
 $('#closeScanner').onclick=closeScanner;
 const ok=await checkToken();
 if(!ok)return expired();
 $('#firstName').value='';
 $('#lastName').value='';
 $('#logoutBtn').onclick=logout;
 $('#idleWarnBtn')&&($('#idleWarnBtn').onclick=()=>touchSession(false));
 // Aynı QR oturumunda sayfa yenilenirse giriş korunur; kayıt ekranı açık kalır. Çıkış için "Çıkış" düğmesi kullanılır.
 const savedLogin=readLogin();
 if(savedLogin&&savedLogin.token!==token){try{localStorage.removeItem('dr_login')}catch{}}
 if(savedLogin&&savedLogin.token===token){
  $('#firstName').value=savedLogin.first; $('#lastName').value=savedLogin.last;
  // Sayfa yenilenince giriş kendiliğinden yinelenir; geçici bir ağ sorunu yüzünden isim ekranına düşmemek için 3 kez denenir.
  for(let i=0;i<3&&!device&&$('#recorder').classList.contains('hidden');i++){await register();if(!device&&!readLogin())break;if(!device)await new Promise(r=>setTimeout(r,1200))}
  if(!device){$('#identity').classList.remove('hidden')}
 } else {
  $('#identity').classList.remove('hidden');
 }
 setInterval(async()=>{if(document.hidden)return;if(!(await checkToken()))expired()},10000);   // sayfa gizliyken sunucuyu yoklama
}
function readLogin(){try{return JSON.parse(localStorage.getItem('dr_login')||'null')}catch{return null}}
function saveLogin(first,last){try{localStorage.setItem('dr_login',JSON.stringify({token,first,last}))}catch{}}
// Çıkış: uyarı verir; onaylanırsa giriş silinir, "Kayıtlarım" listesi bu telefondan temizlenir ve ad-soyad ekranı gelir.
// Kayıtların kendisi sisteme gönderilmiştir, silinmez.
async function logout(){
 if(recorder&&(recorder.state==='recording'||recorder.state==='paused')){await showNotice('Kayıt sürüyor','Önce kaydı bitirin, sonra çıkış yapabilirsiniz.');return}
 if(isFinishing){await showNotice('Kayıt gönderiliyor','Lütfen gönderim bitene kadar bekleyin.');return}
 const ok=await askConfirm({title:'Çıkış yapılsın mı?',text:'Çıkış yaparsanız "Kayıtlarım" listesi bu telefondan silinir.'+'\n\n'+'Ses kayıtlarınız sisteme gönderilmiştir, kaybolmaz.',okText:'Çıkış Yap',cancelText:'Vazgeç',danger:true});
 if(!ok)return;
 try{localStorage.removeItem('dr_login');localStorage.setItem('dr_list_since',String(Date.now()))}catch{}
 revokeToken(token);
 // Adres çubuğundaki eski QR bilgisi (token) atılır; devam etmek için QR yeniden okutulmalı.
 clearStoredToken();
 location.replace(location.pathname+'?mode=record');
}
// Çıkış yapılan QR'lar bu telefonda iptal listesine girer; aynı bağlantı açılsa bile yeniden QR okutulmadan kullanılamaz.
function revokedTokens(){try{return JSON.parse(localStorage.getItem('dr_revoked')||'[]')}catch{return []}}
function revokeToken(t){if(!t)return;try{const l=revokedTokens().filter(x=>x!==t);l.push(t);localStorage.setItem('dr_revoked',JSON.stringify(l.slice(-30)))}catch{}}
function unrevokeToken(t){try{localStorage.setItem('dr_revoked',JSON.stringify(revokedTokens().filter(x=>x!==t)))}catch{}}
// Oturum süresi: sunucu kalan süreyi bildirir (kayan süre: işlem oldukça uzar). Bitmeden 60 sn önce uyarı çıkar.
let sessionRemaining=null,lastTouchAt=0;
function updateIdleWarning(){
 const bar=$('#idleWarn'); if(!bar)return;
 const recording=recorder&&(recorder.state==='recording'||recorder.state==='paused');
 const show=!!device&&sessionRemaining!=null&&sessionRemaining>0&&sessionRemaining<=60&&!recording&&!isFinishing;
 bar.classList.toggle('hidden',!show);
 if(show)$('#idleWarnText').textContent=`Oturum ${sessionRemaining} sn içinde sona erecek.`;
}
async function touchSession(silent){
 if(!device)return;
 try{await api('touch',{method:'POST',query:{token,device_token:device.device_token}});sessionRemaining=900;lastTouchAt=Date.now();updateIdleWarning()}
 catch(e){if(!silent&&e.status===410)expired()}
}
setInterval(()=>{if(sessionRemaining!=null&&sessionRemaining>0){sessionRemaining--;updateIdleWarning()}},1000);
// Sayfayla etkileşim işlem sayılır (en fazla dakikada bir sunucuya bildirilir).
document.addEventListener('pointerdown',()=>{if(device&&sessionRemaining!=null&&sessionRemaining<840&&Date.now()-lastTouchAt>60000)touchSession(true)},{passive:true});
async function checkToken(){
 if(!token)return false;
 if(revokedTokens().includes(token))return false;
 try{const st=await api('status',{query:{token,...(device?{device_token:device.device_token}:{})}});if(st&&st.status==='expired')return false;if(st&&typeof st.remaining_seconds==='number'){sessionRemaining=st.remaining_seconds;updateIdleWarning()}setConn('Masaüstüne Bağlandı','Aktif QR oturumu doğrulandı.','ok');return true}catch(e){return !(e&&(e.status===404||e.status===410||e.status===403))}   // ağ kesintisi oturumu bitirmez; yalnızca sunucu "yok/kapalı" derse
}
function setConn(a,b,state){$('#connTitle').textContent=a;$('#connSub').textContent=b;$('#connection').className=`connection ${state||''}`}
async function register(){
 const first=$('#firstName').value.trim(),last=$('#lastName').value.trim(); if(!first||!last){$('#identityError').textContent='Ad ve soyad alanlarını doldurun.';$('#identityError').classList.remove('hidden');return}
 try{
  device=await api('register-device',{method:'POST',query:{token},body:{device_id:deviceId(),first_name:first,last_name:last,device_model:model()}});
  $('#identity').classList.add('hidden');$('#recorder').classList.remove('hidden');$('#doctorName').textContent=`${first} ${last}`;const chosenModel=model(); $('#deviceInfo').textContent=`${chosenModel} · Cihaz ${deviceId().slice(0,6).toUpperCase()}`;
  saveLogin(first,last);
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
function pauseBtnHtml(resume){
 return resume
  ? '<i class="rc-circle"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" style="fill:currentColor;stroke:none"/></svg></i><span>Devam Et</span>'
  : '<i class="rc-circle"><svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg></i><span>Duraklat</span>';
}
function setRecStatus(text,paused){
 const b=$('#recStatus'); if(!b)return;
 b.classList.remove('hidden'); b.classList.toggle('paused',!!paused);
 $('#recStatusText').textContent=text;
 $('#recPanel')?.classList.toggle('paused',!!paused);
 const rl=$('#recLineText');if(rl)rl.textContent=paused?'Kayıt duraklatıldı':'Kayıt ediliyor...';
}
let recWake=null;
async function holdScreenAwake(){try{recWake=await navigator.wakeLock?.request('screen')}catch{}}
function releaseScreenAwake(){try{recWake?.release()}catch{}recWake=null}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&recorder&&(recorder.state==='recording'||recorder.state==='paused')&&!recWake)holdScreenAwake()});
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
    // Konuşma için 64 kb/sn yeterli: 1 saatlik kayıt ~29 MB (varsayılan ~128 kb/sn'de ~58 MB); bit hızı desteklenmezse varsayılana dönülür.
    try{recorder=new MediaRecorder(stream,{mimeType:type,audioBitsPerSecond:64000})}catch{recorder=new MediaRecorder(stream,{mimeType:type})}
    break;
   }catch(err){lastRecorderError=err}
  }
  if(!recorder){
   try{recorder=new MediaRecorder(stream)}
   catch(err){err.stage='recorder';err.cause=lastRecorderError;throw err}
  }

  chunks=[];isPaused=false;isFinishing=false;elapsedBeforePause=0;pauseStartedAt=0;resetLongWarn();
  recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
  recorder.onerror=e=>{
   console.error('MediaRecorder error',e);
   $('#uploadState').textContent='Kayıt sırasında tarayıcı hatası oluştu.';
   $('#uploadState').classList.remove('hidden');
  };
  recorder.onstop=uploadRecording;
  recorder.start(500);
  startedAt=Date.now();
  timerInt=setInterval(updateTimer,250);
  $('#timer').textContent='00:00';
  $('#mic').classList.add('recording');
  $('#statePill').className='pill recording';
  $('#statePill').textContent='Kaydediliyor';
  $('#tapHint').classList.remove('permission-needed');
  $('#tapHint').textContent='Mikrofon: kayıt / duraklat · Alttan kaydı bitirebilirsiniz';
  setHelp('Konuşmanız canlı olarak kaydediliyor.');
  $('#waveWrap').classList.remove('hidden');
  $('#recordControls').classList.remove('hidden');
  holdScreenAwake();
  setRecStatus('Kayıt yapılıyor...',false);
  $('#pauseBtn').classList.remove('resume');
  $('#pauseBtn').innerHTML=pauseBtnHtml(false);
  // Visualizer and server presence are auxiliary. Neither may cancel a valid mic recording.
  try{ startWave(stream); }catch(waveErr){ console.warn('Waveform unavailable:',waveErr); $('#waveWrap')?.classList.add('hidden'); }
  state('recording').catch(stateErr=>console.warn('Device state update failed:',stateErr));
 }catch(e){
  console.error('Recorder start failed:',e?.name,e?.message,e);
  acquiredStream?.getTracks().forEach(t=>t.stop());
  stream=null;recorder=null;
  if(e?.name==='NotAllowedError'||e?.name==='SecurityError'){
   $('#uploadState').textContent='';
   $('#uploadState').classList.add('hidden');
   $('#tapHint').textContent='Mikrofon izni gerekli';
   $('#tapHint').classList.add('permission-needed');
   $('#statePill').textContent='İzin Gerekli';
   $('#statePill').className='pill permission';
   return;
  }
  let msg=`Mikrofon başlatılamadı${e?.name?` (${e.name})`:''}${e?.message?`: ${e.message}`:''}.`;
  if(e?.name==='NotFoundError'||e?.name==='DevicesNotFoundError') msg='Bu cihazda kullanılabilir mikrofon bulunamadı.';
  else if(e?.name==='NotReadableError'||e?.name==='TrackStartError') msg='Mikrofon başka bir uygulama tarafından kullanılıyor olabilir.';
  else if(e?.name==='NotSupportedError'||e?.stage==='recorder') msg='Bu tarayıcıda ses kaydı başlatılamadı.';
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
  showSentHelp();
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
  if(e&&e.status===410){try{localStorage.removeItem('dr_login')}catch{} isFinishing=false; expired(); return;}
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

// Kayıt 10 dakikayı aşarsa uyarı çıkar ve 30 sn geri sayım başlar; işlem yapılmazsa kayıt durdurulup gönderilir.
// "Devam Et" bir sonraki uyarıyı 10 dk sonraya erteler (unutulan kayıt telefonu doldurmasın).
const LONG_REC_MS=10*60*1000,LONG_REC_GRACE_MS=30*1000;
let longWarnAt=LONG_REC_MS,longWarnTimer=0,longWarnDeadline=0;
function elapsedMs(){return recorder?(isPaused?elapsedBeforePause:elapsedBeforePause+(Date.now()-startedAt)):0}
function hideLongWarn(){clearInterval(longWarnTimer);longWarnTimer=0;longWarnDeadline=0;$('#longWarn')?.classList.add('hidden')}
function resetLongWarn(){hideLongWarn();longWarnAt=LONG_REC_MS}
function tickLongWarn(){
 const left=Math.max(0,Math.ceil((longWarnDeadline-Date.now())/1000));
 const t=$('#longWarnText');if(t)t.textContent=`Kayıt 10 dakikayı aştı. ${left} sn içinde işlem yapılmazsa kayıt durdurulup gönderilecek.`;
 const bar=$('#longWarnBar');if(bar)bar.style.width=Math.max(0,Math.min(100,(longWarnDeadline-Date.now())/LONG_REC_GRACE_MS*100))+'%';
 if(left<=0){hideLongWarn();finishRecording()}
}
function showLongWarn(){
 if(longWarnTimer||!recorder||isFinishing)return;
 longWarnDeadline=Date.now()+LONG_REC_GRACE_MS;
 $('#longWarn')?.classList.remove('hidden');navigator.vibrate?.([200,120,200]);
 tickLongWarn();longWarnTimer=setInterval(tickLongWarn,500);
}
document.addEventListener('visibilitychange',()=>{if(longWarnTimer)tickLongWarn()});
function updateTimer(){
 let ms=0;
 if(recorder){
  if(isPaused) ms=elapsedBeforePause;
  else ms=elapsedBeforePause+(Date.now()-startedAt);
 }
 if(recorder&&!isPaused&&!isFinishing&&ms>=longWarnAt)showLongWarn();
 $('#timer').textContent=fmt(ms/1000);
 const rs=$('#recStatusTime'); if(rs)rs.textContent=fmt(ms/1000);
 const tlEnd=$('#recTlEnd');if(tlEnd)tlEnd.textContent=fmt(longWarnAt/1000);
 const tlFill=$('#recTlFill');if(tlFill)tlFill.style.width=Math.min(100,ms/longWarnAt*100)+'%';
}
async function togglePause(){
 if(longWarnTimer){hideLongWarn();longWarnAt=elapsedMs()+LONG_REC_MS}   // duraklatmak da bir işlemdir
 if(!recorder||isFinishing)return;
 if(recorder.state==='recording'){
  recorder.pause(); elapsedBeforePause+=Date.now()-startedAt; isPaused=true; pauseStartedAt=Date.now();
  $('#mic').classList.remove('recording');$('#statePill').className='pill';$('#statePill').textContent='Duraklatıldı';setHelp('Kayıt duraklatıldı. Devam etmek için mikrofona veya Devam Et butonuna dokunun.');$('#tapHint').textContent='Kayıt duraklatıldı';$('#pauseBtn').classList.add('resume');setRecStatus('Kayıt duraklatıldı',true);$('#pauseBtn').innerHTML=pauseBtnHtml(true);stopWave();state('idle').catch(e=>console.warn('Device state update failed:',e));
 }else if(recorder.state==='paused'){
  recorder.resume(); startedAt=Date.now(); isPaused=false;
  $('#mic').classList.add('recording');$('#statePill').className='pill recording';$('#statePill').textContent='Kaydediliyor';setHelp('Konuşmanız canlı olarak kaydediliyor.');$('#tapHint').textContent='Mikrofon: kayıt / duraklat · Alttan kaydı bitirebilirsiniz';$('#pauseBtn').classList.remove('resume');setRecStatus('Kayıt yapılıyor...',false);$('#pauseBtn').innerHTML=pauseBtnHtml(false);$('#waveWrap').classList.remove('hidden');try{startWave(stream)}catch(e){console.warn('Waveform unavailable:',e);$('#waveWrap')?.classList.add('hidden')}state('recording').catch(e=>console.warn('Device state update failed:',e));
 }
}
async function finishRecording(){
 if(!recorder||isFinishing)return;
 isFinishing=true;hideLongWarn();
 if(recorder.state==='paused') recorder.resume();
 const totalMs=elapsedBeforePause+(isPaused?0:(Date.now()-startedAt));
 recorder.__finalDuration=Math.max(1,Math.round(totalMs/1000));
 clearInterval(timerInt); recorder.stop(); isPaused=false;
 $('#mic').classList.remove('recording');$('#recordControls').classList.add('hidden');$('#recStatus')?.classList.add('hidden');releaseScreenAwake();$('#statePill').className='pill';$('#statePill').textContent='Gönderiliyor';$('#tapHint').textContent='Kayıt bilgisayara gönderiliyor…';setHelp('Ses kaydı tamamlandı.');stopWave();state('uploading').catch(e=>console.warn('Device state update failed:',e));
}
async function toggleRecording(){
 if(!device||$('#recorder').classList.contains('expired-mode')||isFinishing)return;
 if(!recorder) return startRecording();
 if(recorder.state==='recording'||recorder.state==='paused') return togglePause();
}

// Kayıtlarım: sunucudan ve ekranda 10'ar kayıt gösterilir; "Daha fazla göster" ile sonraki 10 gelir.
// Liste ne kadar uzun olursa olsun telefondaki iş yükü sabit kalır (ses dosyaları da yalnızca oynatılırken indirilir).
const HIST_PAGE=10;
let histRecs=[],histPage=0,histDone=false,histLoading=false;
const listSince=()=>Number((()=>{try{return localStorage.getItem('dr_list_since')}catch{return 0}})()||0);
async function fetchHistory(limit,before){
 const q={token,device_token:device.device_token,limit:String(limit)};if(before)q.before=before;
 const raw=await api('device-recordings',{query:q}),since=listSince();
 // Eski sunucu limit'i tanımazsa hepsi gelir: istemci sayfalar.
 const legacy=raw.length>limit;
 let done=legacy||raw.length<limit,recs=raw;
 if(since){recs=raw.filter(r=>new Date(r.created_at).getTime()>since);if(recs.length<raw.length)done=true}
 return {recs,done};
}
// Sayfa değiştirmeli liste: DOM'da her zaman en fazla 10 satır bulunur; eski sayfalar bellekten atılır.
async function showHistPage(p){
 const box=$('#mobileRecordings');
 try{
  while((p+1)*HIST_PAGE>histRecs.length&&!histDone){
   const last=histRecs[histRecs.length-1];
   const {recs,done}=await fetchHistory(HIST_PAGE,last?.created_at);
   histRecs=histRecs.concat(recs.filter(r=>!histRecs.some(x=>x.id===r.id)));histDone=done;
   if(!recs.length)break;
  }
 }catch{ if(p>histPage)return }
 histPage=Math.max(0,Math.min(p,Math.max(0,Math.ceil(histRecs.length/HIST_PAGE)-1)));
 box.innerHTML='';
 renderHistoryRows(box,histPage*HIST_PAGE,(histPage+1)*HIST_PAGE);
 updateHistoryChrome();
}
async function loadMobileHistory(){
 if(!device||histLoading)return;
 histLoading=true;
 try{
  const keep=Math.min(50,Math.max(HIST_PAGE,(histPage+1)*HIST_PAGE));
  const {recs,done}=await fetchHistory(keep);
  histRecs=recs;histDone=done;
  if(histPage*HIST_PAGE>=histRecs.length&&!histDone)histPage=0;
  await showHistPage(histPage);
 }catch(e){console.error('mobile history',e)}
 finally{histLoading=false}
}
function updateHistoryChrome(){
 const box=$('#mobileRecordings');
 $('#historyCount').textContent=`${histRecs.length}${histDone?'':'+'} kayıt`;
 if(!histRecs.length&&!box.querySelector('.history-empty'))box.innerHTML='<div class="history-empty">Henüz kayıt yok.</div>';
 box.querySelector('.history-pager')?.remove();
 const pages=Math.max(1,Math.ceil(histRecs.length/HIST_PAGE)),hasNext=(histPage+1)*HIST_PAGE<histRecs.length||!histDone;
 if(pages<=1&&!hasNext)return;
 const nav=document.createElement('div');nav.className='history-pager';
 nav.innerHTML=`<button type="button" class="hp-prev" ${histPage<=0?'disabled':''} aria-label="Önceki sayfa">‹ Yeni</button><b>Sayfa ${histPage+1}${histDone?' / '+pages:''}</b><button type="button" class="hp-next" ${hasNext?'':'disabled'} aria-label="Sonraki sayfa">Eski ›</button>`;
 const go=async d=>{nav.querySelectorAll('button').forEach(b=>b.disabled=true);await showHistPage(histPage+d);box.closest('.mobile-history')?.scrollIntoView({block:'start',behavior:'smooth'})};
 nav.querySelector('.hp-prev').onclick=()=>go(-1);nav.querySelector('.hp-next').onclick=()=>go(1);
 box.appendChild(nav);
}
function renderHistoryRows(box,from,to){
 const frag=document.createDocumentFragment();
 histRecs.slice(from,to).forEach(r=>{
   const el=document.createElement('div');
   const when=new Date(r.created_at),stamp=`${when.toLocaleDateString('tr-TR')} - ${when.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}`;
   el.className='mrow';
   el.innerHTML=`<span class="mrow-rec"><i></i>REC</span><div class="mrow-mid"><small>${stamp} <em>${fmt(r.duration_seconds)}</em></small>${waveMarkup(r.id||r.file_path||stamp,'mobile-wave')}</div><button class="play mrow-play" aria-label="Oynat"></button><button class="mrow-del" type="button" aria-label="Kaydı sil" title="Kaydı sil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button><audio preload="none" src="${r.signed_url||''}"></audio>`;
   el.querySelector('.mrow-del').onclick=async()=>{
    if(!(await askConfirm({title:'Ses kaydı silinsin mi?',text:'Bu ses kaydı sistemden kalıcı olarak silinir. Bu işlem geri alınamaz.',okText:'Sil',cancelText:'Vazgeç',danger:true})))return;
    try{await api('delete-my-recording',{method:'POST',query:{token,device_token:device.device_token},body:{recording_id:r.id}});el.classList.add('removing');setTimeout(()=>loadMobileHistory(),260)}
    catch(e){if(e&&e.status===410)expired();else showNotice('Kayıt silinemedi','Lütfen bağlantınızı kontrol edip tekrar deneyin.')}
   };
   const audio=el.querySelector('audio'),play=el.querySelector('.play');
   wireWavePlayer(el,audio,play,null); animatePlaybackWave(el,audio);
   frag.appendChild(el);
 });
 box.appendChild(frag);
}
function expired(){stopHeartbeat();clearStoredToken();try{localStorage.removeItem('dr_login')}catch{}
 setConn('Oturum sona erdi','Bilgisayardaki yeni QR kodunu okutun.','expired');$('#identity').classList.add('hidden');$('#recorder').classList.remove('hidden');$('#recorder').classList.add('expired-mode');$('#mic').disabled=true;$('#tapHint').classList.add('hidden');$('#expiredAction').classList.remove('hidden');$('#waveWrap').classList.add('hidden');$('#statePill').textContent='Oturum Sona Erdi';if(recorder&&(recorder.state==='recording'||recorder.state==='paused')){try{recorder.stop()}catch{}}stopWave();
}
function startWave(s){
 stopWave();
 $('#waveWrap')?.classList.remove('hidden');
 const c=$('#wave'),ctx=c.getContext('2d'),AC=window.AudioContext||window.webkitAudioContext,ac=new AC(),src=ac.createMediaStreamSource(s);
 analyser=ac.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.76;src.connect(analyser);waveCtx=ac;
 const freq=new Uint8Array(analyser.frequencyBinCount);
 let lastDraw=0,dpr=Math.min(devicePixelRatio||1,2),w=1,h=1;
 const measure=()=>{dpr=Math.min(devicePixelRatio||1,2);const rect=c.getBoundingClientRect();w=Math.max(1,rect.width*dpr|0);h=Math.max(1,rect.height*dpr|0);if(c.width!==w||c.height!==h){c.width=w;c.height=h}};
 measure();
 if('ResizeObserver' in window){const ro=new ResizeObserver(measure);ro.observe(c);c.__ro=ro}
 const draw=(now)=>{
  waveRAF=requestAnimationFrame(draw);
  if(document.hidden||now-lastDraw<33)return;   // gizliyken çizme, en fazla ~30 kare/sn
  lastDraw=now;
  analyser.getByteFrequencyData(freq);
  ctx.clearRect(0,0,w,h);
  // transparent background; only the animated waveform is drawn
  const bars=64,gap=2.4*dpr,bw=Math.max(2*dpr,(w-gap*(bars-1))/bars),cy=h/2;
  for(let i=0;i<bars;i++){
   const p=i/(bars-1), fi=Math.min(freq.length-1,Math.floor(p*freq.length*.72));
   const energy=freq[fi]/255, env=.32+.68*Math.pow(Math.sin(Math.PI*p),.72);
   const bh=Math.max(4*dpr,(8+energy*h*.78)*env);
   ctx.fillStyle=waveColor(p); // Dikte2 paleti: pembe -> mor -> mavi -> turkuaz
   const x=i*(bw+gap),y=cy-bh/2,r=Math.min(bw/2,3*dpr);
   ctx.beginPath();
   if(ctx.roundRect)ctx.roundRect(x,y,bw,bh,r);else ctx.rect(x,y,bw,bh);
   ctx.fill();
  }
 };
 draw();
}
function stopWave(){try{$('#wave')?.__ro?.disconnect()}catch{}if(waveRAF)cancelAnimationFrame(waveRAF);waveRAF=null;if(waveCtx)waveCtx.close().catch(()=>{});waveCtx=null;analyser=null;const c=$('#wave');c?.getContext('2d')?.clearRect(0,0,c.width,c.height);$('#waveWrap')?.classList.add('hidden')}

let cam=null,scanRAF=null;
let jsQRLoading=null;
function loadJsQR(){
 if(window.jsQR)return Promise.resolve();
 return jsQRLoading||(jsQRLoading=new Promise((ok,fail)=>{const el=document.createElement('script');el.src='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';el.integrity='sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx';el.crossOrigin='anonymous';el.onload=ok;el.onerror=()=>{jsQRLoading=null;fail(new Error('jsqr'))};document.head.appendChild(el)}));
}
async function openScanner(){
 $('#scanner').classList.remove('hidden');$('#scanStatus').textContent='Kamera hazırlanıyor…';
 try{await loadJsQR();cam=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});const v=$('#scanVideo');v.srcObject=cam;await v.play();scan()}
 catch{$('#scanStatus').textContent='Kamera izni verilmedi.';$('#scanStatus').className='scan-status error'}
}
function closeScanner(){cam?.getTracks().forEach(t=>t.stop());cam=null;if(scanRAF)cancelAnimationFrame(scanRAF);$('#scanner').classList.add('hidden')}
function scan(){
 const v=$('#scanVideo'),c=$('#scanCanvas'),ctx=c.getContext('2d',{willReadFrequently:true});
 if(v.readyState>=2){c.width=v.videoWidth;c.height=v.videoHeight;ctx.drawImage(v,0,0);const im=ctx.getImageData(0,0,c.width,c.height),q=jsQR(im.data,im.width,im.height,{inversionAttempts:'dontInvert'});if(q?.data){try{const u=new URL(q.data);if(u.origin===location.origin&&u.pathname===location.pathname&&u.searchParams.get('mode')==='record'&&u.searchParams.get('token')){$('#scanStatus').textContent='QR bulundu. Yeni oturum açılıyor…';$('#scanStatus').className='scan-status ok';closeScanner();unrevokeToken(u.searchParams.get('token'));location.assign(u.toString());return}}catch{}}}
 scanRAF=requestAnimationFrame(scan);
}

// v9.0 Light/Dark theme. Theme code changes colors only; it never changes layout.
function applyTheme(theme){
 const value=theme==='dark'?'dark':'light';
 document.documentElement.dataset.theme=value;
 try{localStorage.setItem('dr_theme',value)}catch{}
 const light=document.getElementById('themeLight'),dark=document.getElementById('themeDark');
 light?.classList.toggle('active',value==='light'); dark?.classList.toggle('active',value==='dark');
 const mt=document.getElementById('mobileTheme');if(mt){mt.dataset.mode=value;mt.setAttribute('aria-label',value==='dark'?'Açık temaya geç':'Koyu temaya geç')}
 const meta=document.querySelector('meta[name="theme-color"]'); if(meta)meta.content=value==='dark'?'#07111d':'#f4f8fc';
}
applyTheme((()=>{try{return localStorage.getItem('dr_theme')||'light'}catch{return 'light'}})());
document.getElementById('themeLight')?.addEventListener('click',()=>applyTheme('light'));
document.getElementById('themeDark')?.addEventListener('click',()=>applyTheme('dark'));
document.getElementById('mobileTheme')?.addEventListener('click',()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
// Yapay zekâ küresi (467 KB, ~1500 animasyonlu öğe) yalnızca kullanıcı etkileşimdeyken canlı oynar;
// ~25 sn dokunulmazsa, sayfa gizlenince ya da "hareketi azalt" açıksa hafif sabit resme geçilir.
(function(){
 const orb=document.querySelector('.mic-orb');if(!orb)return;
 const LIVE='ai-orb.svg',STILL='ai-orb-poster.webp';
 const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 let timer=0,live=false;
 const setSrc=v=>{if(!orb.src.endsWith(v))orb.src=v};
 const rest=()=>{clearTimeout(timer);live=false;setSrc(STILL)};
 const wake=()=>{if(reduce||document.hidden)return;if(!live){live=true;setSrc(LIVE)}clearTimeout(timer);timer=setTimeout(rest,25000)};
 let lastWake=0;
 ['pointerdown','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{const t=Date.now();if(t-lastWake>1500){lastWake=t;wake()}},{passive:true}));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)rest();else wake()});
 if(reduce||document.hidden)setSrc(STILL);else wake();
})();
})();
