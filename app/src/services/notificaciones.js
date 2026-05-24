import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../config/api';

// ═══ IMPORTAR EXPO-NOTIFICATIONS DE FORMA SEGURA ═══
let Notifications = null;
let Device = null;
try {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
} catch (e) {
  console.warn('[NOTIF] expo-notifications no disponible');
}

// Configurar handler (solo si Notifications está disponible)
try {
  if (Notifications?.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
} catch {}

// ═══ CANALES DE NOTIFICACIÓN (Android) ═══
async function configurarCanales() {
  if (Platform.OS !== 'android' || !Notifications) return;
  try {
    await Notifications.setNotificationChannelAsync('servicios', {
      name: 'Servicios de Taxi',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500],
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('emergencias', {
      name: 'Emergencias SOS',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 1000, 500, 1000, 500, 1000],
      sound: 'default',
      bypassDnd: true,
    });
    await Notifications.setNotificationChannelAsync('chat', {
      name: 'Mensajes y Chat',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 100, 250],
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('radio', {
      name: 'Códigos de Radio',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 800, 300, 800],
      sound: 'default',
      bypassDnd: true,
    });
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  } catch {}
}

// ═══ REGISTRO DE TOKEN PUSH ═══
export async function registrarTokenPush(uid) {
  if (!Notifications || !Device) return null;
  try {
    if (!Device.isDevice) return null;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    await configurarCanales();

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '13c299eb-5a10-47ed-828e-d6d56329020d',
    });
    const pushToken = tokenData.data;

    await AsyncStorage.setItem('pushToken', pushToken);

    if (uid) {
      try {
        await api.post('/auth/push-token', { pushToken, uid });
      } catch {}
    }
    return pushToken;
  } catch (error) {
    console.warn('[NOTIF] Error registrando push token:', error.message);
    return null;
  }
}

// ═══ NOTIFICACIÓN LOCAL ═══
export async function notificarLocal({ titulo, cuerpo, datos = {}, canal = 'default' }) {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: titulo,
        body: cuerpo,
        data: datos,
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: canal }),
      },
      trigger: null,
    });
  } catch {}
}

// ═══ LISTENERS DE NOTIFICACIONES ═══
let notificationListener = null;
let responseListener = null;

export function configurarListeners(onNotificacion, onRespuesta) {
  if (!Notifications) return () => {};

  try {
    notificationListener = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data || {};
      if (onNotificacion) onNotificacion(data);
    });

    responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      if (onRespuesta) onRespuesta(data);
    });
  } catch {}

  return () => {
    try {
      if (notificationListener) Notifications.removeNotificationSubscription(notificationListener);
      if (responseListener) Notifications.removeNotificationSubscription(responseListener);
    } catch {}
  };
}

// ═══ LIMPIAR BADGE ═══
export async function limpiarBadge() {
  if (!Notifications) return;
  try { await Notifications.setBadgeCountAsync(0); } catch {}
}

// ═══ OBTENER TOKEN GUARDADO ═══
export async function obtenerTokenGuardado() {
  return await AsyncStorage.getItem('pushToken');
}
