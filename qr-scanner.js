(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('mode') !== 'record') return;

  const trigger = document.querySelector('#expiredPrompt');
  const modal = document.querySelector('#qrScannerModal');
  const closeBtn = document.querySelector('#qrScannerClose');
  const retryBtn = document.querySelector('#qrScannerRetry');
  const video = document.querySelector('#qrScannerVideo');
  const canvas = document.querySelector('#qrScannerCanvas');
  const status = document.querySelector('#qrScannerStatus');

  if (!trigger || !modal || !video || !canvas || !status) return;

  let stream = null;
  let raf = null;
  let detector = null;
  let running = false;

  function setStatus(text, type = '') {
    status.textContent = text;
    status.className = `qr-scanner-status ${type}`.trim();
  }

  function stopCamera() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    video.srcObject = null;
  }

  function closeScanner() {
    stopCamera();
    modal.classList.add('hidden');
    document.body.classList.remove('qr-scanner-open');
  }

  function validateQr(raw) {
    try {
      const u = new URL(raw, location.href);

      // Only accept QR links belonging to this Doctor Recorder page.
      if (u.origin !== location.origin) return null;
      if (u.pathname !== location.pathname) return null;
      if (u.searchParams.get('mode') !== 'record') return null;

      const token = u.searchParams.get('token') || '';
      if (token.length < 16) return null;

      return u;
    } catch {
      return null;
    }
  }

  async function acceptQr(raw) {
    const target = validateQr(raw);
    if (!target) {
      setStatus('Bu QR kodu Doktor Kayıt oturumuna ait değil.', 'error');
      return false;
    }

    setStatus('QR bulundu. Yeni oturum açılıyor…', 'success');
    stopCamera();

    setTimeout(() => {
      location.assign(target.toString());
    }, 400);

    return true;
  }

  async function prepareNativeDetector() {
    if (!('BarcodeDetector' in window)) return false;

    try {
      const formats = await BarcodeDetector.getSupportedFormats?.() || [];
      if (formats.length && !formats.includes('qr_code')) return false;

      detector = new BarcodeDetector({ formats: ['qr_code'] });
      return true;
    } catch {
      detector = null;
      return false;
    }
  }

  async function scanFrame() {
    if (!running) return;

    try {
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        if (detector) {
          const codes = await detector.detect(video);
          const raw = codes?.[0]?.rawValue || '';
          if (raw && await acceptQr(raw)) return;
        } else if (window.jsQR) {
          const width = video.videoWidth;
          const height = video.videoHeight;

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, width, height);

          const frame = ctx.getImageData(0, 0, width, height);
          const code = window.jsQR(frame.data, frame.width, frame.height, {
            inversionAttempts: 'dontInvert'
          });

          if (code?.data && await acceptQr(code.data)) return;
        }
      }
    } catch {
      // Ignore a single bad frame and continue scanning.
    }

    raf = requestAnimationFrame(scanFrame);
  }

  async function openScanner() {
    modal.classList.remove('hidden');
    document.body.classList.add('qr-scanner-open');
    retryBtn?.classList.add('hidden');

    if (!window.isSecureContext) {
      setStatus('Kamera için HTTPS bağlantısı gerekli.', 'error');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Bu tarayıcı kamera erişimini desteklemiyor.', 'error');
      return;
    }

    setStatus('Kamera hazırlanıyor…');

    try {
      stopCamera();

      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      video.srcObject = stream;
      await video.play();
      await prepareNativeDetector();

      running = true;
      setStatus('QR kodunu çerçevenin içine getirin.');
      scanFrame();
    } catch (err) {
      stopCamera();

      const permissionDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError';

      setStatus(
        permissionDenied
          ? 'Kamera izni verilmedi. Tarayıcı kamera iznini açıp tekrar deneyin.'
          : 'Kamera açılamadı. Tekrar deneyin.',
        'error'
      );

      retryBtn?.classList.remove('hidden');
    }
  }

  trigger.addEventListener('click', openScanner);
  retryBtn?.addEventListener('click', openScanner);
  closeBtn?.addEventListener('click', closeScanner);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeScanner();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeScanner();
    }
  });

  window.addEventListener('pagehide', stopCamera);
})();