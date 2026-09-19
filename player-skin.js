(() => {
  const list = document.querySelector('#recordingsList');
  if (!list) return;

  function fmt(value) {
    if (!Number.isFinite(value) || value < 0) return '00:00';
    const total = Math.floor(value);
    return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
  }

  function enhance(row) {
    if (!row || row.dataset.playerEnhanced === '1') return;
    const audio = row.querySelector('audio');
    if (!audio) return;

    row.dataset.playerEnhanced = '1';
    audio.classList.add('native-audio-hidden');

    const ui = document.createElement('div');
    ui.className = 'custom-audio-player';
    ui.innerHTML = `
      <button class="audio-play-btn" type="button" aria-label="Kaydı oynat">▶</button>
      <div class="audio-player-center">
        <div class="audio-track" role="slider" aria-label="Kayıt ilerleme çubuğu" tabindex="0">
          <span class="audio-track-fill"></span>
          <span class="audio-track-knob"></span>
        </div>
        <div class="audio-time-row">
          <span class="audio-current">00:00</span>
          <span class="audio-duration">--:--</span>
        </div>
      </div>
      <button class="audio-open-btn" type="button" aria-label="Kaydı yeni sekmede aç">↗</button>
    `;

    audio.insertAdjacentElement('afterend', ui);

    const play = ui.querySelector('.audio-play-btn');
    const open = ui.querySelector('.audio-open-btn');
    const track = ui.querySelector('.audio-track');
    const fill = ui.querySelector('.audio-track-fill');
    const knob = ui.querySelector('.audio-track-knob');
    const current = ui.querySelector('.audio-current');
    const duration = ui.querySelector('.audio-duration');

    function sync() {
      const d = audio.duration || 0;
      const c = audio.currentTime || 0;
      const pct = d ? Math.min(100, Math.max(0, c / d * 100)) : 0;
      fill.style.width = pct + '%';
      knob.style.left = pct + '%';
      current.textContent = fmt(c);
      duration.textContent = d ? fmt(d) : '--:--';
      play.textContent = audio.paused ? '▶' : '❚❚';
      play.setAttribute('aria-label', audio.paused ? 'Kaydı oynat' : 'Kaydı duraklat');
    }

    play.addEventListener('click', () => {
      if (audio.paused) {
        document.querySelectorAll('#recordingsList audio').forEach(a => {
          if (a !== audio) a.pause();
        });
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    });

    open.addEventListener('click', () => {
      if (audio.src) window.open(audio.src, '_blank', 'noopener');
    });

    function seek(clientX) {
      if (!audio.duration) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
    }

    track.addEventListener('click', e => seek(e.clientX));
    track.addEventListener('keydown', e => {
      if (!audio.duration) return;
      if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
      if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
    });

    ['loadedmetadata','durationchange','timeupdate','play','pause','ended'].forEach(ev => {
      audio.addEventListener(ev, sync);
    });

    sync();
  }

  function scan() {
    list.querySelectorAll('.recording-row').forEach(enhance);
  }

  new MutationObserver(scan).observe(list, { childList:true, subtree:true });
  scan();
})();