(() => {
  if (!navigator.mediaDevices?.getUserMedia) return;
  if (navigator.mediaDevices.__doctorRecorderWrapped) return;

  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getUserMedia = async function(constraints) {
    const stream = await original(constraints);

    if (constraints?.audio) {
      window.__doctorRecorderAudioStream = stream;
      window.dispatchEvent(new CustomEvent('doctor-recorder-stream', {
        detail: { stream }
      }));
    }

    return stream;
  };

  navigator.mediaDevices.__doctorRecorderWrapped = true;
})();