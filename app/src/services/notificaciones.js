import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../config/api';

// ═══ CONFIGURACIÓN DE NOTIFICACIONES ═══

// Configurar cómo se muestran las notificaciones cuando la app está en primer plano
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data || {};
    // Siempre mostrar la notificación, incluso en primer plano
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      // Para emergencias y SOS, prioridad máxima
      priority: data.tipo === 'emergencia' || data.tipo === 'sos'
        ? Notifications.AndroidNotificationPriority.MAX
        : Notifications.AndroidNotificationPriority.HIGH,
    };
  },
});

// ═══ CANALES DE NOTIFICACIÓN (Android) ═══
async function configurarCanales() {
  if (Platform.OS !== 'android') return;

  // Canal para servicios de taxi
  await Notifications.setNotificationChannelAsync('servicios', {
    name: 'Servicios de Taxi',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500],
    sound: 'default',
    enableVibrate: true,
    enableLights: true,
    lightColor: '#FFC107',
  });

  // Canal para emergencias/SOS
  await Notifications.setNotificationChannelAsync('emergencias', {
    name: 'Emergencias SOS',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 1000, 500, 1000, 500, 1000],
    sound: 'default',
    enableVibrate: true,
    enableLights: true,
    lightColor: '#E53935',
    bypassDnd: true,
  });

  // Canal para chat/mensajes
  await Notifications.setNotificationChannelAsync('chat', {
    name: 'Mensajes y Chat',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 100, 250],
    sound: 'default',
    enableVibrate: true,
  });

  // Canal para códigos de radio (H1, H2, 20-X)
  await Notifications.setNotificationChannelAsync('radio', {
    name: 'Códigos de Radio',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 800, 300, 800],
    sound: 'default',
    enableVibrate: true,
    enableLights: true,
    lightColor: '#FF5722',
    bypassDnd: true,
  });

  // Canal por defecto
  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

// ═══ REGISTRO DE TOKEN PUSH ═══
export async function registrarTokenPush(uid) {
  try {
    // Solo funciona en dispositivos físicos
    if (!Device.isDevice) {
      console.log('Push notifications requieren dispositivo físico');
      return null;
    }

    // Solicitar permisos
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Permisos de notificación denegados');
      return null;
    }

    // Configurar canales de Android
    await configurarCanales();

    // Obtener token de Expo Push
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '13c299eb-5a10-47ed-828e-d6d56329020d',
    });
    const pushToken = tokenData.data;

    // Guardar localmente
    await AsyncStorage.setItem('pushToken', pushToken);

    // Enviar al backend
    if (uid) {
      try {
        await api.post('/auth/push-token', { pushToken, uid });
      } catch (err) {
        console.warn('Error enviando push token al servidor:', err.message);
      }
    }

    console.log('Push token registrado:', pushToken);
    return pushToken;
  } catch (error) {
    console.error('Error registrando push token:', error);
    return null;
  }
}

// ═══ NOTIFICACIÓN LOCAL (para cuando la app está activa) ═══
export async function notificarLocal({ titulo, cuerpo, datos = {}, canal = 'default' }) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: titulo,
        body: cuerpo,
        data: datos,
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: canal }),
      },
      trigger: null, // Inmediata
    });
  } catch (error) {
    console.warn('Error notificación local:', error.message);
  }
}

// ═══ LISTENERS DE NOTIFICACIONES ═══
let notificationListener = null;
let responseListener = null;

export function configurarListeners(onNotificacion, onRespuesta) {
  // Cuando llega una notificación (app en primer plano)
  notificationListener = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data || {};
    if (onNotificacion) onNotificacion(data);
  });

  // Cuando el usuario toca la notificación
  responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data || {};
    if (onRespuesta) onRespuesta(data);
  });

  return () => {
    if (notificationListener) Notifications.removeNotificationSubscription(notificationListener);
    if (responseListener) Notifications.removeNotificationSubscription(responseListener);
  };
}

// ═══ BACKGROUND NOTIFICATION HANDLER ═══
// Este handler se ejecuta cuando la app está cerrada/en segundo plano
// y llega una notificación push. Se registra en App.js
export const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';

// ═══ LIMPIAR BADGE ═══
export async function limpiarBadge() {
  await Notifications.setBadgeCountAsync(0);
}

// ═══ OBTENER TOKEN GUARDADO ═══
export async function obtenerTokenGuardado() {
  return await AsyncStorage.getItem('pushToken');
}
