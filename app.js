(() => {
  const SUPABASE_URL = 'https://sqqqjsmblelxqwalxzfq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_lyGKCZxtN4LtEdE3U63FUg_1J4jXqbA';
  const API_URL = `${SUPABASE_URL}/functions/v1/doctor-recorder-api`;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const isRecorder = params.get('mode') === 'record';
  const desktopView = $('#desktopView');
  const recorderView = $('#recorderView');

  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let audioContext = null;
  let analyser = null;
  let animationFrame = null;
  let startedAt = 0;
  let pausedTotal = 0;
  let pauseStarted = 0;
  let timerHandle = null;
  let pollHandle = null;
  let currentSession = null;
  let authSession = null;

  const preferredMime = () => {
    const candidates = [
      'audio/mp4',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus'
    ];
    return candidates.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
  };

  function recorderUrl(token) {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('mode', 'record');
    u.searchParams.set('token', token);
    return u.toString();
  }

  async function ensureAnonymousAuth() {
    const { data: sessionData } = await sb.auth.getSession();
    if (sessionData?.session) {
      authSession = sessionData.session;
      return authSession;
    }

    const { data, error } = await sb.auth.signInAnonymously();
    if (error) {
      throw new Error('Supabase Anonymous Sign-Ins kapalı. Authentication > Providers bölümünden Anonymous Sign-Ins seçeneğini açın.');
    }
    authSession = data.session;
    return authSession;
  }

  async function apiFetch(url, options = {}, needsAuth = false) {
    const headers = new Headers(options.headers || {});
    headers.set('apikey', SUPABASE_KEY);

    if (needsAuth) {
      const session = await ensureAnonymousAuth();
      headers.set('Authorization', `Bearer ${session.access_token}`);
    }

    const res = await fetch(url, { ...options, headers, cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
    return body;
  }

  function setPcStatus(text, type = 'waiting') {
    $('#pcStatus').textContent = text;
    $('#pcStatusDot').className = `status-dot ${type}`;
  }

  async function renderDesktop() {
    desktopView.classList.remove('hidden');
    $('#pageTitle').textContent = 'QR ile Doktor Dikta';

    $('#newSessionBtn').addEventListener('click', createNewSession);

    if (['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:') {
      $('#hostNotice').textContent = 'Bu sürüm GitHub Pages gibi HTTPS bir adreste çalışacak şekilde hazırlanmıştır.';
    }

    await createNewSession();
  }

  async function createNewSession() {
    const btn = $('#newSessionBtn');
    btn.disabled = true;
    btn.textContent = 'QR hazırlanıyor…';
    setPcStatus('Oturum oluşturuluyor…', 'waiting');
    $('#recordingsPanel').classList.add('hidden');
    $('#recordingsList').innerHTML = '';

    clearInterval(pollHandle);
    pollHandle = null;

    try {
      await ensureAnonymousAuth();
      const data = await apiFetch(`${API_URL}?action=create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }, true);

      currentSession = data;
      $('#sessionCode').textContent = String(data.token || '').slice(0, 8).toUpperCase();

      const box = $('#qrcode');
      box.innerHTML = '';
      new QRCode(box, {
        text: recorderUrl(data.token),
        width: 256,
        height: 256,
        correctLevel: QRCode.CorrectLevel.M
      });

      setPcStatus('Telefon bekleniyor', 'waiting');
      await pollSession();
      pollHandle = setInterval(pollSession, 3000);
    } catch (err) {
      setPcStatus(err?.message || String(err), 'error');
      $('#hostNotice').textContent = err?.message || String(err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Yeni QR Oluştur';
    }
  }

  async function pollSession() {
    if (!currentSession?.token) return;
    try {
      const status = await apiFetch(`${API_URL}?action=status&token=${encodeURIComponent(currentSession.token)}`);
      if (status.status === 'completed') {
        setPcStatus('Kayıt tamamlandı', 'completed');
        await loadRecordings();
      } else if (status.status === 'recording') {
        setPcStatus('Telefon kayıt yapıyor', 'live');
      } else {
        setPcStatus('Telefon bekleniyor', 'waiting');
      }
    } catch (err) {
      setPcStatus('Bağlantı kontrol ediliyor…', 'error');
    }
  }

  async function loadRecordings() {
    if (!currentSession?.id) return;
    const list = await apiFetch(`${API_URL}?action=list&session_id=${encodeURIComponent(currentSession.id)}`, {}, true);
    const panel = $('#recordingsPanel');
    const target = $('#recordingsList');
    target.innerHTML = '';

    if (!Array.isArray(list) || list.length === 0) {
      panel.classList.add('hidden');
      return;
    }

    list.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'recording-row';
      const duration = Number(r.duration_seconds || 0);
      const mm = String(Math.floor(duration / 60)).padStart(2, '0');
      const ss = String(duration % 60).padStart(2, '0');
      const time = new Date(r.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      row.innerHTML = `
        <div class="recording-meta">
          <b>Kayıt ${list.length - i}</b>
          <small>${time} · ${mm}:${ss}</small>
        </div>
        <audio controls playsinline src="${r.signed_url || ''}"></audio>
      `;
      target.appendChild(row);
    });
    panel.classList.remove('hidden');
  }

  function renderRecorder() {
    recorderView.classList.remove('hidden');
    $('#pageTitle').textContent = 'Doktor Ses Kaydı';

    const token = params.get('token') || '';
    $('#mobileSession').textContent = token ? token.slice(0, 8).toUpperCase() : 'GEÇERSİZ';

    const startBtn = $('#startBtn');
    const pauseBtn = $('#pauseBtn');
    const stopBtn = $('#stopBtn');
    const againBtn = $('#againBtn');
    const playback = $('#playback');

    startBtn.addEventListener('click', startRecording);
    pauseBtn.addEventListener('click', togglePause);
    stopBtn.addEventListener('click', stopRecording);
    againBtn.addEventListener('click', resetRecorder);

    if (!token) {
      showError('Geçerli bir QR oturumu bulunamadı. Lütfen PC ekranındaki QR kodu tekrar okutun.');
      startBtn.disabled = true;
      return;
    }

    async function startRecording() {
      hideError();
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        showError('Bu tarayıcı ses kaydını desteklemiyor. iPhone için Safari, Android için Chrome kullanın.');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false
        });

        chunks = [];
        const mimeType = preferredMime();
        mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        mediaRecorder.addEventListener('dataavailable', e => { if (e.data?.size) chunks.push(e.data); });
        mediaRecorder.addEventListener('stop', finalizeRecording);
        mediaRecorder.start(1000);

        startedAt = Date.now();
        pausedTotal = 0;
        pauseStarted = 0;
        startTimer();
        startMeter(stream);

        $('#statusPill').textContent = 'Kayıtta';
        $('#statusPill').className = 'pill live';
        $('#micOrb').classList.add('live');
        startBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
        $('#result').classList.add('hidden');
        $('#uploadState').classList.add('hidden');
      } catch (err) {
        showError(err?.name === 'NotAllowedError'
          ? 'Mikrofon izni verilmedi. Safari/Chrome mikrofon iznini açıp tekrar deneyin.'
          : 'Mikrofon açılamadı: ' + (err?.message || err));
      }
    }

    function togglePause() {
      if (!mediaRecorder) return;
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        pauseStarted = Date.now();
        pauseBtn.textContent = 'Devam Et';
        $('#statusPill').textContent = 'Duraklatıldı';
        $('#statusPill').className = 'pill paused';
        $('#micOrb').classList.remove('live');
      } else if (mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
        pausedTotal += Date.now() - pauseStarted;
        pauseStarted = 0;
        pauseBtn.textContent = 'Duraklat';
        $('#statusPill').textContent = 'Kayıtta';
        $('#statusPill').className = 'pill live';
        $('#micOrb').classList.add('live');
      }
    }

    function stopRecording() {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
      if (mediaRecorder.state === 'paused' && pauseStarted) pausedTotal += Date.now() - pauseStarted;
      mediaRecorder.stop();
      stream?.getTracks().forEach(t => t.stop());
      stopTimer();
      stopMeter();

      $('#statusPill').textContent = 'Hazırlanıyor';
      $('#statusPill').className = 'pill paused';
      $('#micOrb').classList.remove('live');
      pauseBtn.classList.add('hidden');
      stopBtn.classList.add('hidden');
      startBtn.classList.add('hidden');
    }

    async function finalizeRecording() {
      const type = mediaRecorder?.mimeType || preferredMime() || 'audio/webm';
      const blob = new Blob(chunks, { type });
      const localUrl = URL.createObjectURL(blob);
      playback.src = localUrl;

      const elapsedMs = Math.max(0, Date.now() - startedAt - pausedTotal);
      const durationSeconds = Math.max(1, Math.floor(elapsedMs / 1000));

      const uploadState = $('#uploadState');
      uploadState.textContent = 'Kayıt PC’ye gönderiliyor…';
      uploadState.className = 'upload-state';
      $('#statusPill').textContent = 'Gönderiliyor';
      $('#statusPill').className = 'pill paused';

      try {
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm';
        const file = new File([blob], `dictation-${Date.now()}.${ext}`, { type });
        const form = new FormData();
        form.append('file', file);
        form.append('duration_seconds', String(durationSeconds));

        await apiFetch(`${API_URL}?action=upload&token=${encodeURIComponent(token)}`, {
          method: 'POST',
          body: form
        });

        uploadState.textContent = '✓ Kayıt başarıyla PC’ye gönderildi';
        uploadState.className = 'upload-state success';
        $('#statusPill').textContent = 'Gönderildi';
        $('#statusPill').className = 'pill live';
        $('#result').classList.remove('hidden');
      } catch (err) {
        uploadState.textContent = 'Kayıt gönderilemedi.';
        uploadState.className = 'upload-state error-state';
        $('#statusPill').textContent = 'Hata';
        $('#statusPill').className = 'pill error-pill';
        showError('Sunucuya yükleme başarısız: ' + (err?.message || err));
        $('#result').classList.remove('hidden');
        $('#result h3').textContent = 'Kayıt telefonda hazır, ancak PC’ye gönderilemedi';
      }
    }

    function resetRecorder() {
      if (playback.src?.startsWith('blob:')) URL.revokeObjectURL(playback.src);
      playback.removeAttribute('src');
      chunks = [];
      mediaRecorder = null;
      $('#timer').textContent = '00:00';
      $('#result').classList.add('hidden');
      $('#result h3').textContent = "Kayıt PC'ye gönderildi";
      $('#uploadState').classList.add('hidden');
      startBtn.classList.remove('hidden');
      pauseBtn.classList.add('hidden');
      stopBtn.classList.add('hidden');
      pauseBtn.textContent = 'Duraklat';
      $('#statusPill').textContent = 'Hazır';
      $('#statusPill').className = 'pill idle';
      hideError();
    }

    function startTimer() {
      stopTimer();
      timerHandle = setInterval(() => {
        const now = Date.now();
        const pausedNow = pauseStarted ? now - pauseStarted : 0;
        const elapsed = Math.max(0, now - startedAt - pausedTotal - pausedNow);
        const total = Math.floor(elapsed / 1000);
        const mm = String(Math.floor(total / 60)).padStart(2, '0');
        const ss = String(total % 60).padStart(2, '0');
        $('#timer').textContent = `${mm}:${ss}`;
      }, 250);
    }

    function stopTimer() {
      clearInterval(timerHandle);
      timerHandle = null;
    }

    function startMeter(inputStream) {
      const canvas = $('#meter');
      const ctx = canvas.getContext('2d');
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(inputStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const draw = () => {
        animationFrame = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(data);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const bars = 42;
        const gap = 5;
        const barW = (canvas.width - gap * (bars - 1)) / bars;
        for (let i = 0; i < bars; i++) {
          const idx = Math.floor(i * data.length / bars);
          const value = data[idx] / 255;
          const h = Math.max(4, value * canvas.height * .92);
          const x = i * (barW + gap);
          const y = (canvas.height - h) / 2;
          const grad = ctx.createLinearGradient(0, y, 0, y + h);
          grad.addColorStop(0, '#2dd4bf');
          grad.addColorStop(1, '#3b82f6');
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, barW, h);
        }
      };
      draw();
    }

    function stopMeter() {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
      if (audioContext) audioContext.close();
      audioContext = null;
      analyser = null;
      const canvas = $('#meter');
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }

    function showError(msg) {
      const box = $('#errorBox');
      box.textContent = msg;
      box.classList.remove('hidden');
    }
    function hideError() { $('#errorBox').classList.add('hidden'); }
  }

  isRecorder ? renderRecorder() : renderDesktop();
})();
