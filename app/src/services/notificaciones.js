// Notificaciones desactivadas temporalmente en Expo Go SDK 54+
// expo-notifications requiere development build desde SDK 53

export async function registrarTokenPush(uid) {
  // No-op en Expo Go
  return null;
}

export async function notificarLocal({ titulo, cuerpo, datos = {} }) {
  // No-op en Expo Go
  console.log('Notificación (local):', titulo, cuerpo);
}
