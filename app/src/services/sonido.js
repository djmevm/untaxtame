import { Audio } from 'expo-av';
import { Vibration } from 'react-native';

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

async function reproducir(uri, volumen = 1.0, duracion = null) {
  try {
    await inicializarAudio();
    if (soundObject) { try { await soundObject.unloadAsync(); } catch {} }
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true, volume: volumen });
    soundObject = sound;
    if (duracion) {
      setTimeout(async () => { try { await sound.stopAsync(); await sound.unloadAsync(); } catch {} }, duracion);
    } else {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) sound.unloadAsync().catch(() => {});
      });
    }
  } catch {}
}

// 🔔 Nuevo servicio disponible (conductor)
export async function reproducirNuevoServicio() {
  Vibration.vibrate([0, 300, 100, 300]);
  await reproducir('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
}

// ✅ Servicio completado
export async function reproducirSonido() {
  Vibration.vibrate([0, 200, 100, 200]);
  await reproducir('https://actions.google.com/sounds/v1/cartoon/pop.ogg');
}

// 🚨 Alerta SOS (fuerte y largo)
export async function reproducirSonidoSOS() {
  Vibration.vibrate([0, 500, 200, 500, 200, 800]);
  await reproducir('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg', 1.0, 3000);
}

// 💬 Mensaje de chat recibido
export async function reproducirSonidoChat() {
  Vibration.vibrate([0, 100]);
  await reproducir('https://actions.google.com/sounds/v1/cartoon/pop.ogg', 0.7);
}

// 💰 Oferta recibida (cliente)
export async function reproducirOfertaRecibida() {
  Vibration.vibrate([0, 200, 100, 200, 100, 200]);
  await reproducir('https://actions.google.com/sounds/v1/alarms/beep_short.ogg', 0.9);
}

// 🚕 Conductor aceptado / en camino
export async function reproducirConductorEnCamino() {
  Vibration.vibrate([0, 300, 150, 300]);
  await reproducir('https://actions.google.com/sounds/v1/transportation/car_horn_quick.ogg', 0.8);
}

// 📍 Conductor llegó al punto
export async function reproducirConductorLlego() {
  Vibration.vibrate([0, 500, 200, 500]);
  await reproducir('https://actions.google.com/sounds/v1/transportation/car_horn_quick.ogg', 1.0);
}

// ⭐ Calificación recibida
export async function reproducirCalificacion() {
  Vibration.vibrate([0, 150]);
  await reproducir('https://actions.google.com/sounds/v1/cartoon/pop.ogg', 0.6);
}
