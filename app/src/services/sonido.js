import { Audio } from 'expo-av';
import { Vibration, Platform } from 'react-native';

let soundObject = null;

async function inicializarAudio() {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {}
}

// Sonido de notificación normal
export async function reproducirSonido() {
  try {
    await inicializarAudio();
    Vibration.vibrate([0, 300, 100, 300]);

    if (soundObject) {
      try { await soundObject.unloadAsync(); } catch {}
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
      { shouldPlay: true, volume: 1.0 }
    );
    soundObject = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch {
    // Fallback: solo vibrar
    Vibration.vibrate([0, 300, 100, 300]);
  }
}

// Sonido de alerta SOS (más fuerte y largo)
export async function reproducirSonidoSOS() {
  try {
    await inicializarAudio();
    Vibration.vibrate([0, 500, 200, 500, 200, 500]);

    const { sound } = await Audio.Sound.createAsync(
      { uri: 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg' },
      { shouldPlay: true, volume: 1.0 }
    );

    // Parar después de 3 segundos
    setTimeout(async () => {
      try { await sound.stopAsync(); await sound.unloadAsync(); } catch {}
    }, 3000);
  } catch {
    Vibration.vibrate([0, 500, 200, 500, 200, 500]);
  }
}


// Sonido de mensaje de chat (corto y tipo notificación)
export async function reproducirSonidoChat() {
  try {
    await inicializarAudio();
    Vibration.vibrate([0, 150, 80, 150]);

    const { sound } = await Audio.Sound.createAsync(
      { uri: 'https://actions.google.com/sounds/v1/cartoon/pop.ogg' },
      { shouldPlay: true, volume: 0.8 }
    );

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch {
    Vibration.vibrate([0, 150, 80, 150]);
  }
}
