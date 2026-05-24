const { db } = require('../firebase');

// ═══ SERVICIO DE NOTIFICACIONES PUSH (Expo Push API) ═══
// Envía notificaciones a dispositivos usando Expo Push Notifications

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Enviar notificación push a un usuario específico
 * @param {string} uid - UID del usuario destino
 * @param {object} notificacion - { titulo, cuerpo, datos, canal }
 */
async function enviarPushAUsuario(uid, { titulo, cuerpo, datos = {}, canal = 'default' }) {
  try {
    const userDoc = await db.collection('usuarios').doc(uid).get();
    if (!userDoc.exists) return { exito: false, error: 'Usuario no encontrado' };

    const pushToken = userDoc.data().pushToken;
    if (!pushToken) return { exito: false, error: 'Sin push token' };

    return await enviarPush([pushToken], { titulo, cuerpo, datos, canal });
  } catch (error) {
    console.error('[PUSH] Error enviando a usuario:', uid, error.message);
    return { exito: false, error: error.message };
  }
}

/**
 * Enviar notificación push a múltiples usuarios
 * @param {string[]} uids - Array de UIDs
 * @param {object} notificacion - { titulo, cuerpo, datos, canal }
 */
async function enviarPushAMultiples(uids, { titulo, cuerpo, datos = {}, canal = 'default' }) {
  try {
    const tokens = [];
    for (const uid of uids) {
      const userDoc = await db.collection('usuarios').doc(uid).get();
      if (userDoc.exists && userDoc.data().pushToken) {
        tokens.push(userDoc.data().pushToken);
      }
    }

    if (tokens.length === 0) return { exito: false, error: 'Ningún usuario tiene push token' };
    return await enviarPush(tokens, { titulo, cuerpo, datos, canal });
  } catch (error) {
    console.error('[PUSH] Error enviando a múltiples:', error.message);
    return { exito: false, error: error.message };
  }
}

/**
 * Enviar notificación a todos los conductores activos
 * @param {object} notificacion - { titulo, cuerpo, datos, canal }
 * @param {object} filtros - { disponible, excluirUid }
 */
async function enviarPushAConductores({ titulo, cuerpo, datos = {}, canal = 'default' }, filtros = {}) {
  try {
    let query = db.collection('usuarios').where('rol', '==', 'conductor');

    if (filtros.disponible !== undefined) {
      query = query.where('disponible', '==', filtros.disponible);
    }

    const snapshot = await query.get();
    const tokens = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.pushToken && data.uid !== filtros.excluirUid) {
        tokens.push(data.pushToken);
      }
    });

    if (tokens.length === 0) return { exito: false, error: 'No hay conductores con push token' };
    return await enviarPush(tokens, { titulo, cuerpo, datos, canal });
  } catch (error) {
    console.error('[PUSH] Error enviando a conductores:', error.message);
    return { exito: false, error: error.message };
  }
}

/**
 * Función base para enviar push notifications via Expo Push API
 * @param {string[]} tokens - Array de Expo Push Tokens
 * @param {object} notificacion - { titulo, cuerpo, datos, canal }
 */
async function enviarPush(tokens, { titulo, cuerpo, datos = {}, canal = 'default' }) {
  try {
    // Filtrar tokens válidos de Expo
    const tokensValidos = tokens.filter(t => t && t.startsWith('ExponentPushToken['));

    if (tokensValidos.length === 0) {
      return { exito: false, error: 'No hay tokens válidos' };
    }

    // Crear mensajes (Expo acepta hasta 100 por request)
    const mensajes = tokensValidos.map(token => ({
      to: token,
      title: titulo,
      body: cuerpo,
      data: datos,
      sound: 'default',
      priority: datos.prioridad || 'high',
      channelId: canal,
      badge: 1,
    }));

    // Enviar en lotes de 100
    const resultados = [];
    for (let i = 0; i < mensajes.length; i += 100) {
      const lote = mensajes.slice(i, i + 100);
      const fetch = require('node-fetch');
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(lote),
      });

      const result = await response.json();
      resultados.push(result);

      // Limpiar tokens inválidos
      if (result.data) {
        for (let j = 0; j < result.data.length; j++) {
          if (result.data[j].status === 'error' &&
              result.data[j].details?.error === 'DeviceNotRegistered') {
            // Eliminar token inválido de la base de datos
            await limpiarTokenInvalido(tokensValidos[i + j]);
          }
        }
      }
    }

    return { exito: true, enviados: tokensValidos.length, resultados };
  } catch (error) {
    console.error('[PUSH] Error enviando notificaciones:', error.message);
    return { exito: false, error: error.message };
  }
}

/**
 * Limpiar token inválido de la base de datos
 */
async function limpiarTokenInvalido(token) {
  try {
    const snapshot = await db.collection('usuarios')
      .where('pushToken', '==', token)
      .get();

    snapshot.forEach(async (doc) => {
      await doc.ref.update({ pushToken: null });
      console.log('[PUSH] Token inválido limpiado para:', doc.id);
    });
  } catch (error) {
    console.error('[PUSH] Error limpiando token:', error.message);
  }
}

module.exports = {
  enviarPushAUsuario,
  enviarPushAMultiples,
  enviarPushAConductores,
  enviarPush,
};
