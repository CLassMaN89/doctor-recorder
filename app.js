(() => {
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

  const makeSession = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    crypto.getRandomValues(new Uint32Array(8)).forEach(n => s += alphabet[n % alphabet.length]);
    return s;
  };

  const preferredMime = () => {
    const candidates = [
      'audio/mp4',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus'
    ];
    return candidates.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
  };

  function recorderUrl(session) {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('mode', 'record');
    u.searchParams.set('session', session);
    return u.toString();
  }

  function renderDesktop() {
    desktopView.classList.remove('hidden');
    $('#pageTitle').textContent = 'QR ile Doktor Dikta';

    const buildQr = () => {
      const session = makeSession();
      $('#sessionCode').textContent = session;
      const target = recorderUrl(session);
      const box = $('#qrcode');
      box.innerHTML = '';
      if (window.QRCode) {
        new QRCode(box, { text: target, width: 256, height: 256, correctLevel: QRCode.CorrectLevel.M });
      } else {
        box.innerHTML = '<div style="color:#07111f;padding:30px;text-align:center">QR kütüphanesi yüklenemedi.<br>Sayfayı yenileyin.</div>';
      }
    };

    $('#newSessionBtn').addEventListener('click', buildQr);
    buildQr();

    if (['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:') {
      $('#hostNotice').textContent = 'Bu QR telefonda çalışmaz. Önce projeyi GitHub Pages gibi bir HTTPS adresinde yayınlayın; sonra QR otomatik olarak doğru internet adresini kullanır.';
    }
  }

  function renderRecorder() {
    recorderView.classList.remove('hidden');
    $('#pageTitle').textContent = 'Doktor Ses Kaydı';
    const session = params.get('session') || 'DEMO';
    $('#mobileSession').textContent = session;

    const startBtn = $('#startBtn');
    const pauseBtn = $('#pauseBtn');
    const stopBtn = $('#stopBtn');
    const againBtn = $('#againBtn');
    const playback = $('#playback');
    const downloadBtn = $('#downloadBtn');

    startBtn.addEventListener('click', startRecording);
    pauseBtn.addEventListener('click', togglePause);
    stopBtn.addEventListener('click', stopRecording);
    againBtn.addEventListener('click', resetRecorder);

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
      } catch (err) {
        showError(err?.name === 'NotAllowedError' ? 'Mikrofon izni verilmedi. Safari/Chrome mikrofon iznini açıp tekrar deneyin.' : 'Mikrofon açılamadı: ' + (err?.message || err));
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
      $('#statusPill').textContent = 'Tamamlandı';
      $('#statusPill').className = 'pill idle';
      $('#micOrb').classList.remove('live');
      pauseBtn.classList.add('hidden');
      stopBtn.classList.add('hidden');
      startBtn.classList.add('hidden');
    }

    function finalizeRecording() {
      const type = mediaRecorder?.mimeType || preferredMime() || 'audio/webm';
      const blob = new Blob(chunks, { type });
      const url = URL.createObjectURL(blob);
      playback.src = url;
      downloadBtn.href = url;
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      downloadBtn.download = `dictation-${session}-${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`;
      $('#result').classList.remove('hidden');
    }

    function resetRecorder() {
      if (playback.src?.startsWith('blob:')) URL.revokeObjectURL(playback.src);
      playback.removeAttribute('src');
      chunks = [];
      mediaRecorder = null;
      $('#timer').textContent = '00:00';
      $('#result').classList.add('hidden');
      startBtn.classList.remove('hidden');
      pauseBtn.classList.add('hidden');
      stopBtn.classList.add('hidden');
      pauseBtn.textContent = 'Duraklat';
      $('#statusPill').textContent = 'Hazır';
      $('#statusPill').className = 'pill idle';
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
