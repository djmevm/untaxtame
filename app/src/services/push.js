// Servicio de push notifications - solo registro de token
// No importa expo-notifications al top level para evitar crashes
import api from '../config/api';

export async function registrarPushToken(uid) {
  if (!uid) return null;
  try {
    var Notifications = require('expo-notifications');
    var Device = require('expo-device');
    if (!Device.isDevice) return null;

    var permisos = await Notifications.getPermissionsAsync();
    if (permisos.status !== 'granted') {
      permisos = await Notifications.requestPermissionsAsync();
    }
    if (permisos.status !== 'granted') return null;

    var tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '13c299eb-5a10-47ed-828e-d6d56329020d',
    });
    var pushToken = tokenData.data;

    // Enviar al backend
    await api.post('/auth/push-token', { pushToken: pushToken, uid: uid });
    return pushToken;
  } catch (e) {
    return null;
  }
}
