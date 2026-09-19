(() => {
  const SUPABASE_URL = 'https://sqqqjsmblelxqwalxzfq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_lyGKCZxtN4LtEdE3U63FUg_1J4jXqbA';
  const API_URL = `${SUPABASE_URL}/functions/v1/doctor-recorder-api`;

  const params = new URLSearchParams(location.search);
  if (params.get('mode') !== 'record') return;

  const token = params.get('token') || '';
  const startBtn = document.querySelector('#startBtn');
  const pauseBtn = document.querySelector('#pauseBtn');
  const stopBtn = document.querySelector('#stopBtn');
  const statusPill = document.querySelector('#statusPill');
  const connectionTitle = document.querySelector('#mobileConnectionTitle');
  const connectionSub = document.querySelector('#mobileConnectionSub');
  const errorBox = document.querySelector('#errorBox');
  const recorderCard = document.querySelector('.mobile-record-card');
  const expiredPrompt = document.querySelector('#expiredPrompt');
  const micTapHint = document.querySelector('#micTapHint');

  let guardTimer = null;
  let sessionUsable = false;

  function setConnection(title, sub, state = 'checking') {
    if (connectionTitle) connectionTitle.textContent = title;
    if (connectionSub) connectionSub.textContent = sub;

    const section = document.querySelector('.mobile-connection');
    if (section) {
      section.classList.remove('connection-checking', 'connection-ok', 'connection-expired');
      section.classList.add(
        state === 'ok'
          ? 'connection-ok'
          : state === 'expired'
            ? 'connection-expired'
            : 'connection-checking'
      );
    }
  }

  function showGuardError(message) {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  }

  function hideGuardError() {
    if (errorBox) errorBox.classList.add('hidden');
  }

  function stopActiveRecording() {
    // We cannot reach MediaRecorder directly because it lives inside app.js's closure.
    // Disable all user controls immediately; server-side upload/state validation is the final guard.
    if (startBtn) startBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
  }

  function enableRecorder() {
    sessionUsable = true;
    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) pauseBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = false;
    hideGuardError();
    if (expiredPrompt) expiredPrompt.classList.add('hidden');
    if (micTapHint) micTapHint.classList.remove('hidden');
    recorderCard?.classList.remove('session-expired');
    setConnection(
      'Masaüstüne Bağlandı',
      'Kayıtlar otomatik olarak bilgisayara aktarılır.',
      'ok'
    );
  }

  function expireRecorder() {
    if (!sessionUsable && recorderCard?.classList.contains('session-expired')) return;
    sessionUsable = false;
    stopActiveRecording();

    if (statusPill) {
      statusPill.textContent = 'Oturum Sona Erdi';
      statusPill.className = 'pill error-pill';
    }

    setConnection(
      'Oturum sona erdi',
      'Masaüstündeki yeni QR kodunu okutun.',
      'expired'
    );

    recorderCard?.classList.add('session-expired');
    if (micTapHint) micTapHint.classList.add('hidden');
    if (expiredPrompt) expiredPrompt.classList.remove('hidden');
    showGuardError('Bu QR artık geçerli değil. Lütfen bilgisayar ekranındaki yeni QR kodunu okutun.');

    if (guardTimer) {
      clearInterval(guardTimer);
      guardTimer = null;
    }
  }

  async function checkSession() {
    if (!token) {
      expireRecorder();
      return;
    }

    try {
      const res = await fetch(
        `${API_URL}?action=status&token=${encodeURIComponent(token)}`,
        {
          method: 'GET',
          headers: {
            apikey: SUPABASE_KEY
          },
          cache: 'no-store'
        }
      );

      const body = await res.json().catch(() => ({}));

      if (!res.ok || body?.status === 'expired') {
        expireRecorder();
        return;
      }

      // waiting / connected / recording / paused / uploading / completed:
      // valid token means this QR belongs to the current usable session.
      enableRecorder();
    } catch (err) {
      sessionUsable = false;
      if (startBtn) startBtn.disabled = true;
      setConnection(
        'Bağlantı kontrol ediliyor…',
        'Sunucuya yeniden bağlanılıyor.',
        'checking'
      );
    }
  }

  // Do not show a false "connected" state before the token is validated.
  setConnection(
    'Bağlantı kontrol ediliyor…',
    'QR oturumu doğrulanıyor.',
    'checking'
  );
  if (startBtn) startBtn.disabled = true;

  checkSession();
  guardTimer = setInterval(checkSession, 5000);

  window.addEventListener('pagehide', () => {
    if (guardTimer) clearInterval(guardTimer);
  });
})();
