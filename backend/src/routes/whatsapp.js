const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const VERIFY_TOKEN = 'untaxtame2026';
const PHONE_NUMBER_ID = '113139477672806';

// Obtener token de variable de entorno
function getToken() {
  return process.env.WHATSAPP_TOKEN || '';
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
    await fetch(`https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`, {
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
  } catch (e) {
    console.error('[WA] Error enviando:', e.message);
  }
}

module.exports = router;
