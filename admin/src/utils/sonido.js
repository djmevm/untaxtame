let audioContext = null;

function getContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

function beep(freq, duration, volume = 0.5) {
  try {
    const ctx = getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.value = volume;
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration / 1000);
  } catch {}
}

// Sonido de notificación: ding-dong
export function reproducirNotificacion() {
  beep(880, 150, 0.4);
  setTimeout(() => beep(1100, 200, 0.4), 200);
}

// Sonido de nuevo servicio de taxi
export function reproducirNuevoServicio() {
  beep(660, 100, 0.3);
  setTimeout(() => beep(880, 100, 0.3), 150);
  setTimeout(() => beep(1100, 150, 0.3), 300);
}

// Alarma SOS: sirena
export function reproducirAlarmaSOS() {
  for (let i = 0; i < 4; i++) {
    setTimeout(() => beep(600, 250, 0.6), i * 500);
    setTimeout(() => beep(900, 250, 0.6), i * 500 + 250);
  }
}
