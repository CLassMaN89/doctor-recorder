(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('mode') !== 'record') return;

  const mic = document.querySelector('#micOrb');
  const startBtn = document.querySelector('#startBtn');
  const pauseBtn = document.querySelector('#pauseBtn');
  const stopBtn = document.querySelector('#stopBtn');
  const hint = document.querySelector('#micTapHint');
  const canvas = document.querySelector('#siriWave');

  if (!mic || !startBtn || !canvas) return;

  let audioContext = null;
  let analyser = null;
  let frame = null;
  let streamRef = null;

  const ctx = canvas.getContext('2d');

  function recorderIsBusy() {
    const recording = !pauseBtn?.classList.contains('hidden') || !stopBtn?.classList.contains('hidden');
    return recording;
  }

  function triggerRecord() {
    if (startBtn.disabled || recorderIsBusy()) return;
    startBtn.click();
  }

  mic.addEventListener('click', triggerRecord);
  mic.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerRecord();
    }
  });

  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width * ratio));
    const h = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function clearWave() {
    cancelAnimationFrame(frame);
    frame = null;
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.classList.remove('wave-live');
    if (hint) {
      hint.textContent = 'Mikrofona dokunun';
      hint.classList.remove('recording-hint');
    }
  }

  function stopVisualizer() {
    cancelAnimationFrame(frame);
    frame = null;

    if (audioContext) {
      audioContext.close().catch(() => {});
    }
    audioContext = null;
    analyser = null;
    streamRef = null;

    clearWave();
  }

  function drawLayer(samples, opts) {
    const { amp, offset, alpha, width, phase, glow } = opts;
    const w = canvas.width;
    const h = canvas.height;
    const center = h / 2 + offset;

    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0.00, `rgba(73, 215, 121, ${alpha * .65})`);
    gradient.addColorStop(0.18, `rgba(255, 92, 84, ${alpha * .80})`);
    gradient.addColorStop(0.42, `rgba(181, 78, 255, ${alpha})`);
    gradient.addColorStop(0.67, `rgba(62, 111, 255, ${alpha})`);
    gradient.addColorStop(0.86, `rgba(58, 228, 206, ${alpha * .80})`);
    gradient.addColorStop(1.00, `rgba(255, 226, 91, ${alpha * .55})`);

    ctx.save();
    ctx.beginPath();

    const count = samples.length;
    for (let i = 0; i < count; i++) {
      const x = (i / (count - 1)) * w;
      const normalized = (samples[(i + phase) % count] - 128) / 128;

      // Center weighted envelope: Siri-like wave is stronger around the middle.
      const p = i / (count - 1);
      const envelope = Math.pow(Math.sin(Math.PI * p), 0.62);
      const y = center + normalized * amp * envelope;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.lineWidth = width;
    ctx.strokeStyle = gradient;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = glow;
    ctx.shadowColor = 'rgba(103, 83, 255, .34)';
    ctx.stroke();
    ctx.restore();
  }

  function startVisualizer(stream) {
    stopVisualizer();
    streamRef = stream;
    fitCanvas();

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    audioContext = new AudioCtx();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = .78;
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    canvas.classList.add('wave-live');

    if (hint) {
      hint.textContent = 'Kayıt devam ediyor';
      hint.classList.add('recording-hint');
    }

    stream.getAudioTracks().forEach(track => {
      track.addEventListener('ended', stopVisualizer, { once: true });
    });

    function draw() {
      frame = requestAnimationFrame(draw);
      fitCanvas();
      analyser.getByteTimeDomainData(data);

      let energy = 0;
      for (let i = 0; i < data.length; i++) {
        const n = (data[i] - 128) / 128;
        energy += n * n;
      }
      const rms = Math.sqrt(energy / data.length);
      const reactive = Math.max(.18, Math.min(1, rms * 4.8));

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Very soft center glow.
      const glow = ctx.createRadialGradient(
        canvas.width * .5, canvas.height * .5, 0,
        canvas.width * .5, canvas.height * .5, canvas.width * .38
      );
      glow.addColorStop(0, `rgba(255,255,255,${.055 + reactive * .06})`);
      glow.addColorStop(.35, `rgba(121,77,255,${.04 + reactive * .04})`);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const baseAmp = canvas.height * (.19 + reactive * .16);

      drawLayer(data, {
        amp: baseAmp * 1.08, offset: -canvas.height * .055,
        alpha: .78, width: Math.max(2, canvas.height * .024), phase: 0, glow: 16
      });
      drawLayer(data, {
        amp: baseAmp * .86, offset: canvas.height * .025,
        alpha: .68, width: Math.max(2, canvas.height * .020), phase: 18, glow: 12
      });
      drawLayer(data, {
        amp: baseAmp * .62, offset: canvas.height * .075,
        alpha: .55, width: Math.max(1.5, canvas.height * .016), phase: 41, glow: 10
      });

      // Bright white/cyan core, like the reference wave.
      drawLayer(data, {
        amp: baseAmp * .38, offset: canvas.height * .015,
        alpha: .86, width: Math.max(1.5, canvas.height * .013), phase: 7, glow: 8
      });
    }

    draw();
  }

  window.addEventListener('doctor-recorder-stream', (e) => {
    const stream = e.detail?.stream;
    if (stream) startVisualizer(stream);
  });

  // In case getUserMedia resolved before this script initialized.
  if (window.__doctorRecorderAudioStream) {
    const s = window.__doctorRecorderAudioStream;
    if (s.getAudioTracks().some(t => t.readyState === 'live')) startVisualizer(s);
  }

  // Keep the original app's canvas for its internal meter code, but hide it visually.
  const originalMeter = document.querySelector('#meter');
  if (originalMeter) originalMeter.setAttribute('aria-hidden', 'true');

  window.addEventListener('resize', fitCanvas);
  window.addEventListener('pagehide', stopVisualizer);
})();