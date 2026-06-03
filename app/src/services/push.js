import api from '../config/api';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export async function registrarPushToken(uid) {
  if (!uid) return null;
  try {
    // Obtener el projectId
    var projectId = '13c299eb-5a10-47ed-828e-d6d56329020d';

    // Obtener el Expo Push Token via fetch directo (sin depender de expo-notifications)
    var deviceId = Constants.installationId || Constants.deviceId || uid;
    
    // Usar expo-notifications para el token si está disponible
    var pushToken = null;
    try {
      var Notifications = require('expo-notifications');
      
      // Pedir permisos
      var permisos = await Notifications.getPermissionsAsync();
      if (permisos.status !== 'granted') {
        permisos = await Notifications.requestPermissionsAsync();
      }
      if (permisos.status !== 'granted') return null;

      // Crear canales
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('servicios', {
          name: 'Servicios de Taxi',
          importance: 4,
          sound: 'alerta.wav',
          vibrationPattern: [0, 500, 200, 500, 200, 500],
          enableVibrate: true,
        });
        await Notifications.setNotificationChannelAsync('emergencias', {
          name: 'Emergencias SOS',
          importance: 4,
          sound: 'alerta.wav',
          vibrationPattern: [0, 1000, 500, 1000, 500, 1000],
          enableVibrate: true,
        });
        await Notifications.setNotificationChannelAsync('default', {
          name: 'General',
          importance: 3,
          sound: 'alerta.wav',
        });
      }

      // Obtener token
      var tokenData = await Notifications.getExpoPushTokenAsync({ projectId: projectId });
      pushToken = tokenData.data;
    } catch (e) {
      // Si falla expo-notifications, no registrar
      return null;
    }

    if (!pushToken) return null;

    // Enviar al backend
    await api.post('/auth/push-token', { pushToken: pushToken, uid: uid });
    return pushToken;
  } catch (e) {
    return null;
  }
}
