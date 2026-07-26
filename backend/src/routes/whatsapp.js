const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');

// ═══ ESTADOS DE CONVERSACIÓN PARA SOLICITUD DE TAXI VÍA WHATSAPP ═══
// Estados: idle | esperando_pago | esperando_ubicacion | servicio_activo
const estadosConversacion = new Map(); // telefono → { estado, datos, timestamp }

// Limpiar estados viejos cada 30 minutos
setInterval(() => {
  const ahora = Date.now();
  estadosConversacion.forEach((val, key) => {
    if (ahora - val.timestamp > 30 * 60 * 1000) {
      estadosConversacion.delete(key);
    }
  });
}, 30 * 60 * 1000);

function getEstado(telefono) {
  return estadosConversacion.get(telefono) || { estado: 'idle', datos: {}, timestamp: Date.now() };
}

function setEstado(telefono, estado, datos = {}) {
  const actual = estadosConversacion.get(telefono) || { datos: {} };
  estadosConversacion.set(telefono, {
    estado,
    datos: { ...actual.datos, ...datos },
    timestamp: Date.now(),
  });
}

function limpiarEstado(telefono) {
  estadosConversacion.delete(telefono);
}

const VERIFY_TOKEN = 'untaxtame2026';
const PHONE_NUMBER_ID = '1242386332287027';
const WABA_ID = '225661571844047';

// Token permanente de WhatsApp Business API (nunca expira)
function getToken() {
  return 'EAAOdCkPftXYBRwurCy3ZAX4vAtPuLK3X9zMmoWTga6zklGdmpELcXARG7vnaG9wnIBlIa6dIhgFXEaJZCujGYdes8axKUG8uPXDIyKOZBIhZAHuteXEj6FGKJ2xNusoJmsXvRbNBfo6bQ6mKXWpJZB0xw4voOkZCALUbzSg0tSgG159ZBELbZCNj7G3XAddKvkeIVgZDZD';
}

// Proxy para servir media de WhatsApp (audio, imagen, video, documentos)
// Meta solo mantiene las URLs temporales ~14 días, este endpoint re-descarga on-demand
router.get('/media/:mediaId', async (req, res) => {
  const { mediaId } = req.params;

  // CORS headers para permitir acceso desde el panel admin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  try {
    // Paso 1: Obtener URL temporal de Meta
    const mediaResponse = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
      headers: { 'Authorization': 'Bearer ' + getToken() },
    });
    const mediaData = await mediaResponse.json();

    if (mediaData.error || !mediaData.url) {
      return res.status(404).json({ error: 'Media no disponible o expirado' });
    }

    // Paso 2: Descargar de Meta
    const fileResponse = await fetch(mediaData.url, {
      headers: { 'Authorization': 'Bearer ' + getToken() },
    });

    if (!fileResponse.ok) {
      return res.status(502).json({ error: 'Error descargando media de Meta' });
    }

    // Paso 3: Servir al cliente con el content-type correcto
    const contentType = mediaData.mime_type || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h

    const buffer = await fileResponse.buffer();
    res.send(buffer);
  } catch (e) {
    console.error('[WA] Error proxy media:', e.message);
    res.status(500).json({ error: 'Error obteniendo media' });
  }
});

// Webhook verification (GET)
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WA] Webhook verificado');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Recibir mensajes (POST)
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field === 'messages') {
            const messages = change.value.messages || [];
            const contacts = change.value.contacts || [];
            for (const msg of messages) {
              const contacto = contacts.find(c => c.wa_id === msg.from) || {};
              const nombre = contacto.profile?.name || msg.from;

              // Obtener contenido según tipo de mensaje
              let texto = `[${msg.type}]`;
              let mediaUrl = null;

              if (msg.type === 'text') {
                texto = msg.text.body;
              } else if (['image', 'video', 'audio', 'document', 'sticker'].includes(msg.type)) {
                const mediaId = msg[msg.type]?.id;
                const caption = msg[msg.type]?.caption || '';
                texto = caption || `[${msg.type}]`;

                // Obtener URL del media y descargarlo
                if (mediaId) {
                  try {
                    // Obtener URL temporal de Meta y guardar el mediaId para re-descarga futura
                    const mediaResponse = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
                      headers: { 'Authorization': 'Bearer ' + getToken() },
                    });
                    const mediaData = await mediaResponse.json();

                    if (mediaData.url) {
                      // Guardar URL proxy sin /api para evitar CORS/Helmet
                      mediaUrl = `https://untaxtame-production.up.railway.app/whatsapp/media/${mediaId}`;
                    }
                  } catch (e) {
                    console.error('[WA] Error obteniendo media URL:', e.message);
                  }
                }
              } else if (msg.type === 'location') {
                texto = `📍 Ubicación: ${msg.location.latitude}, ${msg.location.longitude}`;
                
                // Procesar ubicación para solicitud de taxi
                const estadoConv = getEstado(msg.from);
                if (estadoConv.estado === 'esperando_ubicacion') {
                  const respuestaUbi = await procesarUbicacion(msg.from, msg.location.latitude, msg.location.longitude, nombre);
                  if (respuestaUbi) {
                    try {
                      await db.collection('whatsapp_mensajes').add({
                        telefono: msg.from, nombre: 'UntaXtame Bot', texto: respuestaUbi,
                        tipo: 'enviado', tipoMensaje: 'text', enviadoPor: 'bot', creadoEn: new Date().toISOString(),
                      });
                      await db.collection('whatsapp_conversaciones').doc(msg.from).set({
                        ultimoMensaje: respuestaUbi, ultimoTipo: 'enviado', actualizadoEn: new Date().toISOString(),
                      }, { merge: true });
                    } catch (e) {}
                  }
                } else {
                  // Ubicación recibida sin contexto, ofrecer servicio
                  const resp = await procesarUbicacionDirecta(msg.from, msg.location.latitude, msg.location.longitude, nombre);
                  if (resp) {
                    try {
                      await db.collection('whatsapp_mensajes').add({
                        telefono: msg.from, nombre: 'UntaXtame Bot', texto: resp,
                        tipo: 'enviado', tipoMensaje: 'text', enviadoPor: 'bot', creadoEn: new Date().toISOString(),
                      });
                      await db.collection('whatsapp_conversaciones').doc(msg.from).set({
                        ultimoMensaje: resp, ultimoTipo: 'enviado', actualizadoEn: new Date().toISOString(),
                      }, { merge: true });
                    } catch (e) {}
                  }
                }
              } else if (msg.type === 'contacts') {
                texto = `👤 Contacto compartido`;
              }

              // Guardar mensaje en Firestore
              try {
                await db.collection('whatsapp_mensajes').add({
                  telefono: msg.from,
                  nombre,
                  texto,
                  tipo: 'recibido',
                  tipoMensaje: msg.type,
                  mediaUrl,
                  timestamp: msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
                  creadoEn: new Date().toISOString(),
                });

                // Actualizar o crear conversación
                const convRef = db.collection('whatsapp_conversaciones').doc(msg.from);
                await convRef.set({
                  telefono: msg.from,
                  nombre,
                  ultimoMensaje: msg.type === 'text' ? msg.text.body : `[${msg.type}]`,
                  ultimoTipo: 'recibido',
                  actualizadoEn: new Date().toISOString(),
                  noLeidos: (await convRef.get()).exists
                    ? ((await convRef.get()).data().noLeidos || 0) + 1
                    : 1,
                }, { merge: true });
              } catch (e) {
                console.error('[WA] Error guardando mensaje:', e.message);
              }

              // Bot automático responde
              if (msg.type === 'text') {
                const respuesta = await procesarMensaje(msg.from, msg.text.body);

                // Guardar respuesta del bot
                if (respuesta) {
                  try {
                    await db.collection('whatsapp_mensajes').add({
                      telefono: msg.from,
                      nombre: 'UntaXtame Bot',
                      texto: respuesta,
                      tipo: 'enviado',
                      tipoMensaje: 'text',
                      enviadoPor: 'bot',
                      creadoEn: new Date().toISOString(),
                    });

                    await db.collection('whatsapp_conversaciones').doc(msg.from).set({
                      ultimoMensaje: respuesta,
                      ultimoTipo: 'enviado',
                      actualizadoEn: new Date().toISOString(),
                    }, { merge: true });
                  } catch (e) {}
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('[WA] Error:', e.message);
  }
  res.sendStatus(200);
});

// Procesar mensaje de texto con flujo conversacional
async function procesarMensaje(telefono, texto) {
  const textoLower = texto.trim().toLowerCase();
  const estadoConv = getEstado(telefono);
  let respuesta = '';

  // ═══ ESTADO: ESPERANDO CALIFICACIÓN ═══
  if (estadoConv.estado === 'esperando_calificacion') {
    const calificacion = parseInt(textoLower);
    if (calificacion >= 1 && calificacion <= 5) {
      const servicioId = estadoConv.datos.servicioId;
      const conductorNombre = estadoConv.datos.conductorNombre;
      
      // Guardar calificación en el servicio
      try {
        await db.collection('servicios').doc(servicioId).update({
          calificacion: calificacion * 2, // Convertir escala 1-5 a 1-10 (como usa la app)
          calificacionWhatsApp: calificacion,
          calificadoEn: new Date().toISOString(),
        });
      } catch (e) {}

      limpiarEstado(telefono);
      const estrellas = '⭐'.repeat(calificacion);
      respuesta = `${estrellas}\n\n` +
        `¡Gracias por calificar! Le diste *${calificacion}/5* a *${conductorNombre}*.\n\n` +
        `🚕 ¡Gracias por usar UntaXtame! Escribe *1* cuando necesites otro taxi.`;
    } else {
      respuesta = '⭐ Por favor califica del *1* al *5*:\n\n' +
        '1️⃣ Muy malo | 2️⃣ Malo | 3️⃣ Regular | 4️⃣ Bueno | 5️⃣ Excelente\n\n' +
        '_O escribe *0* para omitir_';
      
      if (textoLower === '0' || textoLower.includes('omitir') || textoLower.includes('no')) {
        limpiarEstado(telefono);
        respuesta = '👍 Sin problema. ¡Gracias por usar UntaXtame!\n\nEscribe *1* cuando necesites otro taxi.';
      }
    }
    await enviarMensaje(telefono, respuesta);
    return respuesta;
  }

  // ═══ ESTADO: ESPERANDO MÉTODO DE PAGO ═══
  if (estadoConv.estado === 'esperando_pago') {
    if (textoLower === '1' || textoLower.includes('efectivo')) {
      // Si ya tiene ubicación guardada (envió ubicación primero), pedir destino
      if (estadoConv.datos.ubicacionDirecta) {
        const ubi = estadoConv.datos.ubicacionDirecta;
        let direccion = `${ubi.lat.toFixed(5)}, ${ubi.lng.toFixed(5)}`;
        try {
          const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${ubi.lat},${ubi.lng}&key=AIzaSyCz_s1BIBL0E9rJfQRXQ4lgnPb6GR9IiJE`);
          const geoData = await geoRes.json();
          if (geoData.results && geoData.results[0]) direccion = geoData.results[0].formatted_address;
        } catch (e) {}
        setEstado(telefono, 'esperando_destino', { origen: direccion, lat: ubi.lat, lng: ubi.lng, metodoPago: 'efectivo', nombre: estadoConv.datos.nombre || telefono });
        respuesta = '✅ Método de pago: *Efectivo*\n' +
          '📍 Recogida: *' + direccion + '*\n\n' +
          '🏁 ¿Hacia dónde vas?\n\n' +
          'Escribe la dirección de destino:\n' +
          '👉 Ej: _Barrio el Centro, frente al parque_\n\n' +
          '0️⃣ Cancelar';
      } else {
        setEstado(telefono, 'esperando_ubicacion', { metodoPago: 'efectivo' });
        respuesta = '✅ Método de pago: *Efectivo*\n\n' +
          '📍 ¿Dónde te recogemos?\n\n' +
          '*Opción 1:* Envía tu ubicación GPS\n' +
          '👉 Toca *📎* → *Ubicación* → *Enviar ubicación actual*\n\n' +
          '*Opción 2:* Escribe tu dirección\n' +
          '👉 Ej: _Calle 20 con Carrera 15, barrio Centro_\n\n' +
          '0️⃣ Cancelar';
      }
    } else if (textoLower === '2' || textoLower.includes('electr') || textoLower.includes('nequi') || textoLower.includes('daviplata')) {
      if (estadoConv.datos.ubicacionDirecta) {
        const ubi = estadoConv.datos.ubicacionDirecta;
        let direccion = `${ubi.lat.toFixed(5)}, ${ubi.lng.toFixed(5)}`;
        try {
          const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${ubi.lat},${ubi.lng}&key=AIzaSyCz_s1BIBL0E9rJfQRXQ4lgnPb6GR9IiJE`);
          const geoData = await geoRes.json();
          if (geoData.results && geoData.results[0]) direccion = geoData.results[0].formatted_address;
        } catch (e) {}
        setEstado(telefono, 'esperando_destino', { origen: direccion, lat: ubi.lat, lng: ubi.lng, metodoPago: 'daviplata', nombre: estadoConv.datos.nombre || telefono });
        respuesta = '✅ Método de pago: *Electrónico*\n' +
          '📍 Recogida: *' + direccion + '*\n\n' +
          '🏁 ¿Hacia dónde vas?\n\n' +
          'Escribe la dirección de destino:\n' +
          '👉 Ej: _Barrio el Centro, frente al parque_\n\n' +
          '0️⃣ Cancelar';
      } else {
        setEstado(telefono, 'esperando_ubicacion', { metodoPago: 'daviplata' });
        respuesta = '✅ Método de pago: *Electrónico (Nequi/Daviplata)*\n\n' +
          '📍 ¿Dónde te recogemos?\n\n' +
          '*Opción 1:* Envía tu ubicación GPS\n' +
          '👉 Toca *📎* → *Ubicación* → *Enviar ubicación actual*\n\n' +
          '*Opción 2:* Escribe tu dirección\n' +
          '👉 Ej: _Calle 20 con Carrera 15, barrio Centro_\n\n' +
          '0️⃣ Cancelar';
      }
    } else if (textoLower === '0' || textoLower.includes('cancelar')) {
      limpiarEstado(telefono);
      respuesta = '❌ Solicitud cancelada.\n\nEscribe *1* si deseas pedir un taxi nuevamente.';
    } else {
      respuesta = '⚠️ Por favor selecciona tu método de pago:\n\n' +
        '1️⃣ Efectivo 💵\n' +
        '2️⃣ Electrónico (Nequi/Daviplata) 💳\n\n' +
        '0️⃣ Cancelar';
    }
    await enviarMensaje(telefono, respuesta);
    return respuesta;
  }

  // ═══ ESTADO: ESPERANDO UBICACIÓN (si envían texto en vez de ubicación) ═══
  if (estadoConv.estado === 'esperando_ubicacion') {
    if (textoLower === '0' || textoLower.includes('cancelar')) {
      limpiarEstado(telefono);
      respuesta = '❌ Solicitud cancelada.\n\nEscribe *1* si deseas pedir un taxi nuevamente.';
    } else if (texto.trim().length >= 5) {
      // Guardar origen y pedir destino (preservar datos del flujo)
      const datos = estadoConv.datos;
      setEstado(telefono, 'esperando_destino', { origen: texto.trim(), lat: null, lng: null, metodoPago: datos.metodoPago, nombre: datos.nombre || telefono });
      respuesta = '✅ Recogida: *' + texto.trim() + '*\n\n' +
        '🏁 ¿Hacia dónde vas?\n\n' +
        'Escribe la dirección de destino:\n' +
        '👉 Ej: _Barrio el Centro, frente al parque_\n\n' +
        '0️⃣ Cancelar';
    } else {
      respuesta = '📍 ¿Dónde te recogemos?\n\n' +
        '*Opción 1:* Envía tu ubicación GPS 📎 → Ubicación\n' +
        '*Opción 2:* Escribe tu dirección completa\n\n' +
        '0️⃣ Cancelar';
    }
    await enviarMensaje(telefono, respuesta);
    return respuesta;
  }

  // ═══ ESTADO: ESPERANDO DESTINO ═══
  if (estadoConv.estado === 'esperando_destino') {
    if (textoLower === '0' || textoLower.includes('cancelar')) {
      limpiarEstado(telefono);
      respuesta = '❌ Solicitud cancelada.\n\nEscribe *1* si deseas pedir un taxi nuevamente.';
    } else if (texto.trim().length >= 3) {
      // Crear servicio con origen y destino
      const datos = estadoConv.datos;
      respuesta = await crearServicioWhatsApp(telefono, {
        nombre: datos.nombre || telefono,
        metodoPago: datos.metodoPago || 'efectivo',
        direccion: datos.origen,
        destino: texto.trim(),
        lat: datos.lat || null,
        lng: datos.lng || null,
      });
    } else {
      respuesta = '🏁 ¿Hacia dónde vas? Escribe la dirección de destino.\n\n0️⃣ Cancelar';
    }
    await enviarMensaje(telefono, respuesta);
    return respuesta;
  }

  // ═══ ESTADO: SERVICIO ACTIVO (cliente tiene un servicio en curso) ═══
  if (estadoConv.estado === 'servicio_activo') {
    // Verificar si hay ofertas disponibles para elegir
    const ofertasLista = estadoConv.datos.ofertasLista || [];
    
    if (ofertasLista.length > 0) {
      // Verificar si el cliente respondió con un número para elegir oferta
      const numero = parseInt(textoLower);
      if (numero >= 1 && numero <= ofertasLista.length) {
        const ofertaElegida = ofertasLista[numero - 1];
        await aceptarOfertaDesdeWhatsApp(telefono, ofertaElegida);
        return '';
      }
      
      // Compatibilidad: "si" acepta la primera oferta
      if (textoLower === 'si' || textoLower === 'sí' || textoLower === 'acepto' || textoLower === 'aceptar') {
        const ofertaElegida = ofertasLista[0];
        await aceptarOfertaDesdeWhatsApp(telefono, ofertaElegida);
        return '';
      }
    }

    // Compatibilidad con ofertaPendiente antigua
    if (estadoConv.datos.ofertaPendiente) {
      if (textoLower === 'si' || textoLower === 'sí' || textoLower === '1' || textoLower === 'aceptar' || textoLower === 'acepto') {
        await aceptarOfertaDesdeWhatsApp(telefono, estadoConv.datos.ofertaPendiente);
        return '';
      } else if (textoLower === 'no' || textoLower === 'rechazar') {
        setEstado(telefono, 'servicio_activo', { servicioId: estadoConv.datos.servicioId, ofertaPendiente: null, ofertasLista: [] });
        respuesta = '❌ Oferta rechazada. Seguimos buscando otro conductor para ti...\n\n0️⃣ Cancelar servicio';
        await enviarMensaje(telefono, respuesta);
        return respuesta;
      }
    }

    if (textoLower === '0' || textoLower.includes('cancelar')) {
      // Cancelar servicio activo
      const servicioId = estadoConv.datos.servicioId;
      if (servicioId) {
        try {
          const ref = db.collection('servicios').doc(servicioId);
          const doc = await ref.get();
          if (doc.exists && ['pendiente', 'aceptado'].includes(doc.data().estado)) {
            await ref.update({ estado: 'cancelado', canceladoPor: 'cliente_whatsapp', motivoCancelacion: 'Cancelado por WhatsApp', actualizadoEn: new Date().toISOString() });
            limpiarEstado(telefono);
            respuesta = '❌ Tu servicio ha sido cancelado.\n\nEscribe *1* para pedir un nuevo taxi.';
          } else if (!doc.exists) {
            limpiarEstado(telefono);
            respuesta = '❌ Servicio cancelado.\n\nEscribe *1* para pedir un nuevo taxi.';
          } else {
            limpiarEstado(telefono);
            respuesta = '❌ Servicio cancelado.\n\nEscribe *1* para pedir un nuevo taxi.';
          }
        } catch (e) {
          limpiarEstado(telefono);
          respuesta = '❌ Servicio cancelado.\n\nEscribe *1* para pedir un nuevo taxi.';
        }
      } else {
        limpiarEstado(telefono);
        respuesta = '❌ Solicitud cancelada.\n\nEscribe *1* para pedir un nuevo taxi.';
      }
    } else {
      respuesta = '🚕 Ya tienes un servicio activo.\n\n' +
        '⏳ Estamos buscando conductor para ti...\n\n' +
        '0️⃣ Cancelar servicio';
    }
    await enviarMensaje(telefono, respuesta);
    return respuesta;
  }

  // ═══ ESTADO IDLE: MENÚ PRINCIPAL ═══
  if (textoLower === '1' || textoLower.includes('taxi') || textoLower.includes('servicio') || textoLower.includes('necesito')) {
    setEstado(telefono, 'esperando_pago', { nombre: '' });
    respuesta = '🚕 *¡Solicitar Taxi UntaXtame!*\n\n' +
      'Selecciona tu método de pago:\n\n' +
      '1️⃣ Efectivo 💵\n' +
      '2️⃣ Electrónico (Nequi/Daviplata) 💳\n\n' +
      '0️⃣ Cancelar';
  } else if (textoLower === '2' || textoLower.includes('descarga') || textoLower.includes('app') || textoLower.includes('instalar')) {
    respuesta = '📲 Descarga UntaXtame y pide tu taxi facil!\n\n' +
      '🔗 Play Store: https://play.google.com/store/apps/details?id=com.untaxtame.taxi\n\n' +
      '🔗 Descarga directa: https://untaxtame.vercel.app/descargar.html\n\n' +
      '⚠️ _La app aún no está disponible para iPhone (iOS). Próximamente._\n\n' +
      '✅ GPS en tiempo real\n' +
      '✅ Chat con tu conductor\n' +
      '✅ Paga con Daviplata, Nequi o Efectivo\n' +
      '✅ Servicio 24/7';
  } else if (textoLower === '3' || textoLower.includes('soporte') || textoLower.includes('queja') || textoLower.includes('reclamo')) {
    respuesta = '📋 Soporte y quejas UntaXtame\n\n' +
      'Cuéntanos tu situación y te ayudaremos.\n\n' +
      '📧 untaxtameapp@gmail.com\n' +
      '📱 WhatsApp: +57 322 3221058\n\n' +
      'Servicio de atención 24/7.';
  } else {
    respuesta = '¡Hola! Bienvenido a *UntaXtame S.A.S* 🚕\n\n' +
      'Somos tu servicio de taxi seguro en Tame, Arauca. Servicio 24/7.\n' +
      '💰 Tarifa mínima: *$8.000 COP*\n\n' +
      '¿En qué podemos ayudarte?\n\n' +
      '1️⃣ *Necesito un taxi* 🚕\n' +
      '2️⃣ Descargar la app 📲\n' +
      '3️⃣ Soporte / Quejas 📋\n\n' +
      '_Escribe el número de tu opción o envía tu ubicación directamente para pedir un taxi._';
  }

  await enviarMensaje(telefono, respuesta);
  return respuesta;
}

// Procesar ubicación cuando el usuario está en flujo de solicitud
async function procesarUbicacion(telefono, lat, lng, nombre) {
  const estadoConv = getEstado(telefono);
  const datos = estadoConv.datos;

  // Reverse geocode para obtener dirección
  let direccion = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  try {
    const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyCz_s1BIBL0E9rJfQRXQ4lgnPb6GR9IiJE`);
    const geoData = await geoRes.json();
    if (geoData.results && geoData.results[0]) {
      direccion = geoData.results[0].formatted_address;
    }
  } catch (e) {}

  // Guardar origen GPS y pedir destino
  setEstado(telefono, 'esperando_destino', { origen: direccion, lat, lng, metodoPago: datos.metodoPago, nombre: nombre || telefono });

  const respuesta = '✅ Recogida: *' + direccion + '*\n' +
    `📍 Ver mapa: https://www.google.com/maps?q=${lat},${lng}\n\n` +
    '🏁 ¿Hacia dónde vas?\n\n' +
    'Escribe la dirección de destino:\n' +
    '👉 Ej: _Barrio el Centro, frente al parque_\n\n' +
    '0️⃣ Cancelar';

  await enviarMensaje(telefono, respuesta);
  return respuesta;
}

// Procesar ubicación directa (sin flujo previo - pide taxi directo)
async function procesarUbicacionDirecta(telefono, lat, lng, nombre) {
  // Si envía ubicación sin flujo, guardar y pedir método de pago
  setEstado(telefono, 'esperando_pago', { nombre, ubicacionDirecta: { lat, lng } });
  
  // Reverse geocode
  let direccion = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  try {
    const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyCz_s1BIBL0E9rJfQRXQ4lgnPb6GR9IiJE`);
    const geoData = await geoRes.json();
    if (geoData.results && geoData.results[0]) direccion = geoData.results[0].formatted_address;
  } catch (e) {}

  const respuesta = '📍 ¡Ubicación recibida!\n' +
    `📌 ${direccion}\n\n` +
    '¿Cómo deseas pagar tu servicio?\n\n' +
    '1️⃣ Efectivo 💵\n' +
    '2️⃣ Electrónico (Nequi/Daviplata) 💳\n\n' +
    '0️⃣ Cancelar';
  
  await enviarMensaje(telefono, respuesta);
  return respuesta;
}

// Crear servicio de taxi desde WhatsApp
async function crearServicioWhatsApp(telefono, datos) {
  const { nombre, metodoPago, direccion, destino, lat, lng } = datos;
  const { v4: uuidv4 } = require('uuid');

  try {
    const servicioId = uuidv4();
    const servicio = {
      id: servicioId,
      clienteUid: `whatsapp_${telefono}`,
      clienteNombre: nombre,
      clienteCelular: telefono,
      clienteDireccion: direccion,
      ubicacionGPS: lat && lng ? { lat, lng, texto: direccion } : null,
      destinoLat: null,
      destinoLng: null,
      origen: direccion,
      destino: destino || 'Por definir con el conductor',
      metodoPago: metodoPago,
      estado: 'pendiente',
      conductorUid: null,
      conductorNombre: null,
      conductorPlaca: null,
      conductorCelular: null,
      calificacion: null,
      tarifaMinima: 8000,
      tarifaAcordada: null,
      totalOfertas: 0,
      requisitos: [],
      fuenteSolicitud: 'whatsapp',
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    };

    await db.collection('servicios').doc(servicioId).set(servicio);

    // Marcar estado como servicio activo
    setEstado(telefono, 'servicio_activo', { servicioId, nombre });

    // Notificar a conductores via push
    try {
      const { enviarPushAConductores } = require('../services/pushNotifications');
      enviarPushAConductores({
        titulo: '🚕 Nuevo servicio (WhatsApp)',
        cuerpo: `${nombre}: ${direccion} | Pago: ${metodoPago}`,
        datos: { tipo: 'nuevo_servicio', servicioId },
      });
    } catch (e) {}

    const mapa = lat && lng ? `\n📍 Ver mapa: https://www.google.com/maps?q=${lat},${lng}` : '';
    
    const respuesta = '✅ *¡Servicio solicitado exitosamente!*\n\n' +
      `📍 Recogida: ${direccion}${mapa}\n` +
      `🏁 Destino: ${destino || 'Por definir'}\n` +
      `💰 Pago: ${metodoPago === 'efectivo' ? 'Efectivo 💵' : 'Electrónico 💳'}\n\n` +
      '🔍 Estamos buscando al conductor disponible más cercano...\n\n' +
      '⏳ Te notificaremos cuando un conductor acepte tu servicio.\n\n' +
      '_Para cancelar, responde *0*_';

    return respuesta;
  } catch (e) {
    console.error('[WA] Error creando servicio:', e.message);
    limpiarEstado(telefono);
    return '❌ Error al solicitar el servicio. Por favor intenta de nuevo escribiendo *1*.';
  }
}

// Notificar al cliente de WhatsApp cuando un conductor acepta su servicio
async function notificarClienteWhatsApp(telefono, conductorNombre, conductorPlaca, conductorCelular) {
  const mensaje = `🚕 *¡Conductor asignado!*\n\n` +
    `👤 Conductor: *${conductorNombre}*\n` +
    `🚗 Placa: *${conductorPlaca || 'N/A'}*\n` +
    `📱 WhatsApp: https://wa.me/${conductorCelular || ''}\n\n` +
    `Tu conductor va en camino. ¡Buen viaje! 🙌`;
  
  await enviarMensaje(telefono, mensaje);
  limpiarEstado(telefono);
}

// Notificar al cliente de WhatsApp cuando llega una oferta de un conductor
async function enviarOfertaWhatsApp(telefono, datos) {
  const { servicioId, ofertaId, conductorNombre, conductorPlaca, monto, mensaje } = datos;

  // Obtener estado actual y agregar oferta a la lista
  const estadoConv = getEstado(telefono);
  const ofertasLista = estadoConv.datos.ofertasLista || [];
  ofertasLista.push({ ofertaId, servicioId, conductorNombre, conductorPlaca, monto });

  // Actualizar estado con la lista de ofertas
  setEstado(telefono, 'servicio_activo', { 
    servicioId, 
    ofertasLista,
    ofertaPendiente: null,
  });

  // Construir mensaje con todas las ofertas disponibles
  let msg = `🚕 *¡Nueva oferta de taxi!*\n\n`;
  
  ofertasLista.forEach((oferta, i) => {
    msg += `*${i + 1}️⃣* ${oferta.conductorNombre} | 🚗 ${oferta.conductorPlaca} | 💰 $${oferta.monto.toLocaleString('es-CO')}\n`;
  });

  msg += `\n━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✅ Responde con el *número* de la oferta que prefieras\n`;
  msg += `   Ej: *1* para la primera, *2* para la segunda...\n\n`;
  msg += `0️⃣ Cancelar servicio`;

  await enviarMensaje(telefono, msg);
}

// Aceptar oferta desde WhatsApp
async function aceptarOfertaDesdeWhatsApp(telefono, ofertaData) {
  const { ofertaId, servicioId } = ofertaData;

  try {
    const servicioRef = db.collection('servicios').doc(servicioId);
    const servicioDoc = await servicioRef.get();

    if (!servicioDoc.exists || servicioDoc.data().estado !== 'pendiente') {
      await enviarMensaje(telefono, '⚠️ Este servicio ya no está disponible.');
      limpiarEstado(telefono);
      return;
    }

    const ofertaRef = db.collection('servicios').doc(servicioId).collection('ofertas').doc(ofertaId);
    const ofertaDoc = await ofertaRef.get();

    if (!ofertaDoc.exists) {
      await enviarMensaje(telefono, '⚠️ Esta oferta ya no está disponible.');
      return;
    }

    const oferta = ofertaDoc.data();

    // Marcar oferta como aceptada
    await ofertaRef.update({ estado: 'aceptada' });

    // Rechazar las demás ofertas
    const todasOfertas = await db.collection('servicios').doc(servicioId).collection('ofertas').get();
    const batch = db.batch();
    todasOfertas.docs.forEach(doc => {
      if (doc.id !== ofertaId) batch.update(doc.ref, { estado: 'rechazada' });
    });
    await batch.commit();

    // Actualizar servicio con el conductor
    await servicioRef.update({
      conductorUid: oferta.conductorUid,
      conductorNombre: oferta.conductorNombre,
      conductorPlaca: oferta.conductorPlaca,
      conductorCelular: oferta.conductorCelular,
      tarifaAcordada: oferta.monto,
      estado: 'aceptado',
      actualizadoEn: new Date().toISOString(),
    });

    // Marcar conductor como no disponible
    await db.collection('usuarios').doc(oferta.conductorUid).update({ disponible: false });

    // Push al conductor
    try {
      const { enviarPushAUsuario } = require('../services/pushNotifications');
      enviarPushAUsuario(oferta.conductorUid, { 
        titulo: '✅ Oferta aceptada', 
        cuerpo: 'Tu oferta fue aceptada. Ve al punto de recogida.', 
        datos: { tipo: 'oferta_aceptada', servicioId } 
      });
    } catch (e) {}

    // Notificar al cliente
    limpiarEstado(telefono);
    const msg = `✅ *¡Conductor aceptado!*\n\n` +
      `👤 Conductor: *${oferta.conductorNombre}*\n` +
      `🚗 Placa: *${oferta.conductorPlaca || 'N/A'}*\n` +
      `💰 Tarifa: *$${oferta.monto.toLocaleString('es-CO')} COP*\n` +
      `📱 WhatsApp: https://wa.me/${oferta.conductorCelular || ''}\n\n` +
      `🚕 Tu conductor va en camino. ¡Buen viaje! 🙌`;

    await enviarMensaje(telefono, msg);
  } catch (e) {
    console.error('[WA] Error aceptando oferta:', e.message);
    await enviarMensaje(telefono, '⚠️ Error al aceptar. Intenta de nuevo respondiendo *SI*.');
  }
}

// Enviar mensaje via WhatsApp Cloud API
async function enviarMensaje(telefono, texto) {
  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + getToken(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'text',
        text: { body: texto },
      }),
    });
    const data = await response.json();
    return data;
  } catch (e) {
    console.error('[WA] Error enviando:', e.message);
    return { error: e.message };
  }
}

// Enviar plantilla via WhatsApp Cloud API
async function enviarPlantilla(telefono, templateName, languageCode, parameters, headerImageUrl) {
  try {
    const components = [];

    // Header con imagen (para plantillas de marketing con imagen)
    if (headerImageUrl) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: headerImageUrl } }],
      });
    }

    // Body con parámetros de texto
    if (parameters && parameters.length > 0) {
      components.push({
        type: 'body',
        parameters: parameters.map(p => ({ type: 'text', text: p })),
      });
    }

    const body = {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode || 'es_CO' },
      },
    };

    if (components.length > 0) {
      body.template.components = components;
    }

    console.log(`[WA] Enviando plantilla "${templateName}" (idioma: ${languageCode}) a ${telefono}`);
    const response = await fetch(`https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + getToken(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (data.error) {
      console.error(`[WA] Error Meta API para ${telefono}:`, data.error.message, `(code: ${data.error.code})`);
    }
    return data;
  } catch (e) {
    console.error('[WA] Error enviando plantilla:', e.message);
    return { error: e.message };
  }
}

// ═══ RUTAS DE BANDEJA DE ENTRADA (inbox) ═══

// Obtener todas las conversaciones
router.get('/conversaciones', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('whatsapp_conversaciones')
      .orderBy('actualizadoEn', 'desc')
      .limit(50)
      .get();

    const conversaciones = [];
    snapshot.forEach(doc => conversaciones.push({ id: doc.id, ...doc.data() }));
    res.json(conversaciones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener mensajes de una conversación
router.get('/conversaciones/:telefono/mensajes', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('whatsapp_mensajes')
      .where('telefono', '==', req.params.telefono)
      .orderBy('creadoEn', 'asc')
      .limit(100)
      .get();

    const mensajes = [];
    snapshot.forEach(doc => mensajes.push({ id: doc.id, ...doc.data() }));

    // Marcar como leídos
    await db.collection('whatsapp_conversaciones').doc(req.params.telefono).update({
      noLeidos: 0,
    }).catch(() => {});

    res.json(mensajes);
  } catch (err) {
    // Si falla por índice, intentar sin orderBy
    try {
      const snapshot = await db.collection('whatsapp_mensajes')
        .where('telefono', '==', req.params.telefono)
        .limit(100)
        .get();

      const mensajes = [];
      snapshot.forEach(doc => mensajes.push({ id: doc.id, ...doc.data() }));
      // Ordenar manualmente
      mensajes.sort((a, b) => (a.creadoEn || '').localeCompare(b.creadoEn || ''));

      await db.collection('whatsapp_conversaciones').doc(req.params.telefono).update({
        noLeidos: 0,
      }).catch(() => {});

      res.json(mensajes);
    } catch (err2) {
      res.status(500).json({ error: err2.message });
    }
  }
});

// Responder manualmente a una conversación (admin)
router.post('/conversaciones/:telefono/responder', verifyToken, async (req, res) => {
  const { mensaje } = req.body;
  if (!mensaje) return res.status(400).json({ error: 'Se requiere mensaje' });

  try {
    const telefono = req.params.telefono;
    const result = await enviarMensaje(telefono, mensaje);

    if (result.error) {
      return res.status(500).json({ error: typeof result.error === 'string' ? result.error : JSON.stringify(result.error) });
    }

    // Guardar mensaje enviado
    await db.collection('whatsapp_mensajes').add({
      telefono,
      nombre: 'Admin',
      texto: mensaje,
      tipo: 'enviado',
      tipoMensaje: 'text',
      enviadoPor: 'admin',
      creadoEn: new Date().toISOString(),
    });

    // Actualizar conversación
    await db.collection('whatsapp_conversaciones').doc(telefono).set({
      ultimoMensaje: mensaje,
      ultimoTipo: 'enviado',
      actualizadoEn: new Date().toISOString(),
    }, { merge: true });

    res.json({ message: 'Mensaje enviado', result });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error interno' });
  }
});

// ═══ RUTAS DE ADMINISTRACIÓN (envío masivo) ═══

// Enviar archivo/imagen a un número (admin)
const multer = require('multer');
const uploadWA = multer({ dest: path.join(__dirname, '../../uploads/whatsapp/') });

router.post('/enviar-archivo', verifyToken, uploadWA.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió archivo' });
  const { telefono } = req.body;
  if (!telefono) return res.status(400).json({ error: 'Se requiere telefono' });

  try {
    // Subir el archivo a Meta
    const FormData = require('form-data') || null;
    const formData = new (require('node-fetch').default ? Object : Object)();

    // Determinar tipo de media
    const mime = req.file.mimetype;
    let mediaType = 'document';
    if (mime.startsWith('image/')) mediaType = 'image';
    else if (mime.startsWith('video/')) mediaType = 'video';
    else if (mime.startsWith('audio/')) mediaType = 'audio';

    // Subir media a WhatsApp
    const fileStream = fs.createReadStream(req.file.path);
    const uploadResponse = await fetch(`https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + getToken(),
      },
      body: (() => {
        const form = new (require('stream').Readable)();
        // Use node-fetch compatible multipart
        return undefined; // Fallback below
      })(),
    });

    // Método alternativo: enviar URL del archivo hosteado
    const fileUrl = `https://untaxtame-production.up.railway.app/uploads/whatsapp/${req.file.filename}`;

    // Enviar media por URL
    const sendResponse = await fetch(`https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + getToken(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefono,
        type: mediaType,
        [mediaType]: {
          link: fileUrl,
          filename: req.file.originalname,
        },
      }),
    });
    const result = await sendResponse.json();

    if (result.error) {
      return res.status(500).json({ error: result.error.message || JSON.stringify(result.error) });
    }

    // Guardar en historial
    await db.collection('whatsapp_mensajes').add({
      telefono,
      nombre: 'Admin',
      texto: `📎 ${req.file.originalname}`,
      tipo: 'enviado',
      tipoMensaje: mediaType,
      enviadoPor: 'admin',
      archivoUrl: fileUrl,
      creadoEn: new Date().toISOString(),
    });

    await db.collection('whatsapp_conversaciones').doc(telefono).set({
      ultimoMensaje: `📎 ${req.file.originalname}`,
      ultimoTipo: 'enviado',
      actualizadoEn: new Date().toISOString(),
    }, { merge: true });

    res.json({ message: 'Archivo enviado', mediaType, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enviar mensaje de texto a un número específico (admin)
router.post('/enviar', verifyToken, async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono || !mensaje) {
    return res.status(400).json({ error: 'Se requiere telefono y mensaje' });
  }

  try {
    const numero = telefono.replace(/[^0-9]/g, '');
    const result = await enviarMensaje(numero, mensaje);

    if (result.error) {
      return res.status(500).json({ error: typeof result.error === 'string' ? result.error : JSON.stringify(result.error) });
    }
    res.json({ message: 'Mensaje enviado', result });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error interno' });
  }
});

// Enviar plantilla a un número específico (admin)
router.post('/enviar-plantilla', verifyToken, async (req, res) => {
  const { telefono, plantilla, idioma, parametros } = req.body;
  if (!telefono || !plantilla) {
    return res.status(400).json({ error: 'Se requiere telefono y plantilla' });
  }

  const numero = telefono.replace(/[^0-9]/g, '');
  const result = await enviarPlantilla(numero, plantilla, idioma || 'es_CO', parametros || []);

  if (result.error) {
    return res.status(500).json({ error: result.error });
  }
  res.json({ message: 'Plantilla enviada', result });
});

// Enviar plantilla masiva a todos los clientes (admin)
router.post('/enviar-masivo', verifyToken, async (req, res) => {
  const { plantilla, idioma, parametros, headerImageUrl } = req.body;
  if (!plantilla) {
    return res.status(400).json({ error: 'Se requiere nombre de plantilla' });
  }

  try {
    // Obtener todos los clientes con número de teléfono
    const snapshot = await db.collection('usuarios')
      .where('rol', '==', 'cliente')
      .get();

    const clientes = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.telefono && !data.bloqueado) {
        clientes.push({
          uid: doc.id,
          nombre: data.nombre || 'Cliente',
          telefono: data.telefono.replace(/[^0-9]/g, ''),
        });
      }
    });

    if (clientes.length === 0) {
      return res.json({ message: 'No hay clientes con número registrado', enviados: 0, errores: 0 });
    }

    let enviados = 0;
    let errores = 0;
    const detalles = [];

    for (const cliente of clientes) {
      // Solo enviar parámetros si la plantilla los requiere (si se pasan explícitamente)
      const params = parametros && parametros.length > 0
        ? parametros
        : [];

      const result = await enviarPlantilla(cliente.telefono, plantilla, idioma || 'es_CO', params, headerImageUrl || null);

      if (result.messages) {
        enviados++;
        detalles.push({ nombre: cliente.nombre, telefono: cliente.telefono, estado: 'enviado' });
      } else {
        errores++;
        detalles.push({ nombre: cliente.nombre, telefono: cliente.telefono, estado: 'error', error: result.error?.message || JSON.stringify(result) });
      }

      // Esperar 100ms entre mensajes para no saturar la API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Guardar registro del envío masivo
    await db.collection('enviosMasivos').add({
      plantilla,
      idioma: idioma || 'es_CO',
      totalClientes: clientes.length,
      enviados,
      errores,
      enviadoPor: req.user?.uid || 'admin',
      creadoEn: new Date().toISOString(),
    });

    res.json({
      message: `Envío masivo completado`,
      totalClientes: clientes.length,
      enviados,
      errores,
      detalles,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener historial de envíos masivos
router.get('/historial-masivos', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('enviosMasivos')
      .orderBy('creadoEn', 'desc')
      .limit(20)
      .get();

    const historial = [];
    snapshot.forEach(doc => historial.push({ id: doc.id, ...doc.data() }));
    res.json(historial);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener plantillas disponibles
router.get('/plantillas', verifyToken, async (req, res) => {
  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${WABA_ID}/message_templates?limit=50`, {
      headers: { 'Authorization': 'Bearer ' + getToken() },
    });
    const data = await response.json();

    if (data.error || !data.data) {
      // Si la API falla, devolver plantillas conocidas como fallback
      console.log('[WA] Error obteniendo plantillas de API, usando fallback:', data.error?.message || 'sin datos');
      return res.json([
        { id: '1', name: 'bienvenida_cliente', status: 'APPROVED', category: 'MARKETING', language: 'es_CO' },
        { id: '2', name: 'descarga_app', status: 'APPROVED', category: 'MARKETING', language: 'es_CO' },
        { id: '3', name: 'confirmacion_servicio', status: 'APPROVED', category: 'UTILITY', language: 'es_CO' },
        { id: '4', name: 'hello_world', status: 'APPROVED', category: 'UTILITY', language: 'en_US' },
      ]);
    }

    res.json(data.data);
  } catch (err) {
    // Fallback en caso de error
    res.json([
      { id: '1', name: 'bienvenida_cliente', status: 'APPROVED', category: 'MARKETING', language: 'es_CO' },
      { id: '2', name: 'descarga_app', status: 'APPROVED', category: 'MARKETING', language: 'es_CO' },
      { id: '3', name: 'confirmacion_servicio', status: 'APPROVED', category: 'UTILITY', language: 'es_CO' },
      { id: '4', name: 'hello_world', status: 'APPROVED', category: 'UTILITY', language: 'en_US' },
    ]);
  }
});

// Notificar al cliente de WhatsApp que el servicio terminó y pedir calificación
async function notificarServicioCompletadoWhatsApp(telefono, datos) {
  const { servicioId, conductorNombre, tarifa, metodoPago } = datos;

  // Cambiar estado a esperando calificación
  setEstado(telefono, 'esperando_calificacion', { servicioId, conductorNombre });

  const msg = `✅ *¡Servicio completado!*\n\n` +
    `👤 Conductor: *${conductorNombre}*\n` +
    `💰 Tarifa: *$${tarifa.toLocaleString('es-CO')} COP*\n` +
    `💳 Pago: ${metodoPago === 'efectivo' ? 'Efectivo' : 'Electrónico'}\n\n` +
    `⭐ *¿Cómo calificas el servicio?*\n\n` +
    `Responde con un número del *1* al *5*:\n\n` +
    `1️⃣ Muy malo\n` +
    `2️⃣ Malo\n` +
    `3️⃣ Regular\n` +
    `4️⃣ Bueno\n` +
    `5️⃣ Excelente ⭐\n\n` +
    `_Gracias por usar UntaXtame 🚕_`;

  await enviarMensaje(telefono, msg);
}

module.exports = router;
module.exports.notificarClienteWhatsApp = notificarClienteWhatsApp;
module.exports.enviarOfertaWhatsApp = enviarOfertaWhatsApp;
module.exports.notificarServicioCompletadoWhatsApp = notificarServicioCompletadoWhatsApp;
