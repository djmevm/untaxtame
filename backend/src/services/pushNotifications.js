const { db } = require('../firebase');
const fetch = require('node-fetch');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Enviar push a un usuario
async function enviarPushAUsuario(uid, { titulo, cuerpo, datos }) {
  try {
    var doc = await db.collection('usuarios').doc(uid).get();
    if (!doc.exists) return;
    var token = doc.data().pushToken;
    if (!token) return;
    await enviarPush([token], { titulo, cuerpo, datos });
  } catch (e) {}
}

// Enviar push a todos los conductores disponibles
async function enviarPushAConductores({ titulo, cuerpo, datos }) {
  try {
    var snap = await db.collection('usuarios').where('rol', '==', 'conductor').where('disponible', '==', true).get();
    var tokens = [];
    snap.forEach(function(doc) { if (doc.data().pushToken) tokens.push(doc.data().pushToken); });
    if (tokens.length > 0) await enviarPush(tokens, { titulo, cuerpo, datos });
  } catch (e) {}
}

// Enviar via Expo Push API
async function enviarPush(tokens, { titulo, cuerpo, datos }) {
  var esEmergencia = datos && (datos.tipo === 'emergencia' || datos.tipo === 'sos');
  var esServicio = datos && (datos.tipo === 'nuevo_servicio' || datos.tipo === 'oferta_aceptada');
  var mensajes = tokens.filter(function(t) { return t && t.indexOf('ExponentPushToken') === 0; }).map(function(t) {
    return {
      to: t,
      title: titulo,
      body: cuerpo,
      data: datos || {},
      sound: 'alerta.wav',
      priority: 'high',
      channelId: esEmergencia ? 'emergencias' : esServicio ? 'servicios' : 'default',
    };
  });
  if (mensajes.length === 0) return;
  try {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mensajes),
    });
  } catch (e) {}
}

module.exports = { enviarPushAUsuario, enviarPushAConductores };
