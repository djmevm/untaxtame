const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');

const VERIFY_TOKEN = 'untaxtame2026';
const PHONE_NUMBER_ID = '1242386332287027';
const WABA_ID = '225661571844047';

// Token permanente de WhatsApp Business API (nunca expira)
function getToken() {
  return 'EAAOdCkPftXYBRwurCy3ZAX4vAtPuLK3X9zMmoWTga6zklGdmpELcXARG7vnaG9wnIBlIa6dIhgFXEaJZCujGYdes8axKUG8uPXDIyKOZBIhZAHuteXEj6FGKJ2xNusoJmsXvRbNBfo6bQ6mKXWpJZB0xw4voOkZCALUbzSg0tSgG159ZBELbZCNj7G3XAddKvkeIVgZDZD';
}

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

              // Guardar mensaje en Firestore
              try {
                await db.collection('whatsapp_mensajes').add({
                  telefono: msg.from,
                  nombre,
                  texto: msg.type === 'text' ? msg.text.body : `[${msg.type}]`,
                  tipo: 'recibido',
                  tipoMensaje: msg.type,
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

// Procesar mensaje y responder
async function procesarMensaje(telefono, texto) {
  const textoLower = texto.trim().toLowerCase();
  let respuesta = '';

  if (textoLower === '1' || textoLower.includes('taxi') || textoLower.includes('servicio')) {
    respuesta = 'Con mucho gusto! Para solicitar su servicio de taxi necesitamos:\n\n' +
      '📍 Direccion de recogida:\n' +
      '📞 Numero de celular:\n' +
      '👤 Nombre completo:\n\n' +
      'Tambien puede pedir su taxi desde nuestra app:\n' +
      '📲 https://untaxtame.vercel.app/descargar.html\n\n' +
      'Servicio disponible 24/7\n' +
      '⚠️ Recargo nocturno despues de las 8:00 PM en dias festivos.';
  } else if (textoLower === '2' || textoLower.includes('descarga') || textoLower.includes('app') || textoLower.includes('instalar')) {
    respuesta = '📲 Descarga UntaXtame y pide tu taxi facil!\n\n' +
      '🔗 Descarga directa: https://untaxtame.vercel.app/descargar.html\n\n' +
      'Tambien disponible en:\n' +
      '• APKPure: https://apkpure.com/p/com.untaxtame.app\n' +
      '• Aptoide: https://com-untaxtame-app.en.aptoide.com/app\n\n' +
      '✅ GPS en tiempo real\n' +
      '✅ Chat con tu conductor\n' +
      '✅ Paga con Daviplata, Nequi o Efectivo\n' +
      '✅ Servicio 24/7';
  } else if (textoLower === '3' || textoLower.includes('soporte') || textoLower.includes('queja') || textoLower.includes('reclamo')) {
    respuesta = '📋 Soporte y quejas UntaXtame\n\n' +
      'Cuentanos tu situacion y te ayudaremos.\n\n' +
      'Tambien puedes enviarnos un correo a:\n' +
      '📧 untaxtameapp@gmail.com\n\n' +
      'O escribenos desde el chat de la app (Mi Perfil → Mensajes Admin).\n\n' +
      'Servicio de atencion 24/7.';
  } else {
    respuesta = 'Hola! Bienvenido a UntaXtame S.A.S ZOMAC 🚕\n\n' +
      'Somos tu servicio de taxi seguro en Tame, Arauca. Servicio 24/7.\n\n' +
      'En que podemos ayudarte?\n\n' +
      '1️⃣ Necesito un taxi\n' +
      '2️⃣ Descargar la app\n' +
      '3️⃣ Soporte / Quejas\n\n' +
      'Escribe el numero de tu opcion o cuentanos directamente.\n\n' +
      '⚠️ Recargo nocturno despues de las 8:00 PM en dias festivos.';
  }

  await enviarMensaje(telefono, respuesta);
  return respuesta;
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
async function enviarPlantilla(telefono, templateName, languageCode, parameters) {
  try {
    const components = [];
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
        language: { code: languageCode || 'es' },
      },
    };

    if (components.length > 0) {
      body.template.components = components;
    }

    const response = await fetch(`https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + getToken(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
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
    res.status(500).json({ error: err.message });
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
  const result = await enviarPlantilla(numero, plantilla, idioma || 'es', parametros || []);

  if (result.error) {
    return res.status(500).json({ error: result.error });
  }
  res.json({ message: 'Plantilla enviada', result });
});

// Enviar plantilla masiva a todos los clientes (admin)
router.post('/enviar-masivo', verifyToken, async (req, res) => {
  const { plantilla, idioma, parametros } = req.body;
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
      // Agregar nombre como parámetro si la plantilla usa {{1}}
      const params = parametros && parametros.length > 0
        ? parametros
        : [cliente.nombre];

      const result = await enviarPlantilla(cliente.telefono, plantilla, idioma || 'es', params);

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
      idioma: idioma || 'es',
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
        { id: '1', name: 'bienvenida_cliente', status: 'APPROVED', category: 'MARKETING', language: 'es' },
        { id: '2', name: 'descarga_app', status: 'APPROVED', category: 'MARKETING', language: 'es' },
        { id: '3', name: 'confirmacion_servicio', status: 'APPROVED', category: 'UTILITY', language: 'es' },
        { id: '4', name: 'hello_world', status: 'APPROVED', category: 'UTILITY', language: 'en_US' },
      ]);
    }

    res.json(data.data);
  } catch (err) {
    // Fallback en caso de error
    res.json([
      { id: '1', name: 'bienvenida_cliente', status: 'APPROVED', category: 'MARKETING', language: 'es' },
      { id: '2', name: 'descarga_app', status: 'APPROVED', category: 'MARKETING', language: 'es' },
      { id: '3', name: 'confirmacion_servicio', status: 'APPROVED', category: 'UTILITY', language: 'es' },
      { id: '4', name: 'hello_world', status: 'APPROVED', category: 'UTILITY', language: 'en_US' },
    ]);
  }
});

module.exports = router;
