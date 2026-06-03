import api from '../config/api';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

export async function registrarPushToken(uid) {
  if (!uid) return null;
  try {
    if (!Device.isDevice) return null;

    var permisos = await Notifications.getPermissionsAsync();
    if (permisos.status !== 'granted') {
      permisos = await Notifications.requestPermissionsAsync();
    }
    if (permisos.status !== 'granted') return null;

    // Crear canales con sonido personalizado
    await Notifications.setNotificationChannelAsync('servicios', {
      name: 'Servicios de Taxi',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'alerta.wav',
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      enableVibrate: true,
    });
    await Notifications.setNotificationChannelAsync('emergencias', {
      name: 'Emergencias SOS',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'alerta.wav',
      vibrationPattern: [0, 1000, 500, 1000, 500, 1000],
      enableVibrate: true,
      bypassDnd: true,
    });
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'alerta.wav',
    });

    var tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '13c299eb-5a10-47ed-828e-d6d56329020d',
    });
    var pushToken = tokenData.data;

    await api.post('/auth/push-token', { pushToken: pushToken, uid: uid });
    return pushToken;
  } catch (e) {
    return null;
  }
}
