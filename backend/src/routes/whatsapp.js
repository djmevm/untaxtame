const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');

const VERIFY_TOKEN = 'untaxtame2026';
const PHONE_NUMBER_ID = '124238633228702';
const WABA_ID = '225661571844047';

// Obtener token de variable de entorno
function getToken() {
  return process.env.WHATSAPP_TOKEN || 'EAAOdCkPftXYBR9AT7yeUpR6norUOvsJ6KeBeLIL7mHddKFklMo86J3bGkGGXCFZBWl8S7vZBHRwRm9R2Ws1FIQQk6J5YqFO6kO1whjcRjaUnjX06IX4dRLDje1n7ZAipkBEHKjLZBxUuyWkVtinbHdAbiBnbnFWEHyBjykf0rJoIJL24YaNqXp3nV80hZBZCzVDQZDZD';
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
            for (const msg of messages) {
              if (msg.type === 'text') {
                await procesarMensaje(msg.from, msg.text.body);
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
    const response = await fetch(`https://graph.facebook.com/v25.0/${WABA_ID}/message_templates`, {
      headers: { 'Authorization': 'Bearer ' + getToken() },
    });
    const data = await response.json();
    res.json(data.data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
