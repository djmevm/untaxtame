const { db } = require('../firebase');

// ═══ SEGUIMIENTO DE SERVICIOS PENDIENTES ═══
// Flujo escalonado para que el cliente nunca quede "a ciegas":
//   • A los 4 min sin ofertas aceptadas → re-notifica a conductores y
//     avisa al cliente "seguimos buscando" (push + WhatsApp si aplica).
//   • A los 10 min → cancela automáticamente y avisa.

const TIEMPO_LIMITE_MINUTOS = 10;   // cancelación
const TIEMPO_RENOTIFICAR_MIN = 4;   // aviso intermedio + re-notificación

async function revisarServiciosPendientes() {
  try {
    const ahora = new Date();
    const limiteCancelar = new Date(ahora.getTime() - TIEMPO_LIMITE_MINUTOS * 60 * 1000);

    const snapshot = await db.collection('servicios')
      .where('estado', '==', 'pendiente')
      .get();

    if (snapshot.empty) return;

    for (const doc of snapshot.docs) {
      const servicio = doc.data();
      const creado = servicio.creadoEn ? new Date(servicio.creadoEn) : null;
      if (!creado) continue;
      const minutos = (ahora.getTime() - creado.getTime()) / 60000;

      // ── CANCELAR a los 10 min ──
      if (minutos >= TIEMPO_LIMITE_MINUTOS) {
        await cancelarServicio(doc.id, servicio, ahora);
        continue;
      }

      // ── AVISO INTERMEDIO + RE-NOTIFICACIÓN a los 4 min (una sola vez) ──
      if (minutos >= TIEMPO_RENOTIFICAR_MIN && !servicio.reNotificadoEn) {
        await reNotificar(doc.id, servicio, ahora);
      }
    }
  } catch (err) {
    console.error('[SEGUIMIENTO] Error:', err.message);
  }
}

// Re-notifica a conductores y tranquiliza al cliente (Mejora 1 y 5)
async function reNotificar(servicioId, servicio, ahora) {
  try {
    await db.collection('servicios').doc(servicioId).update({
      reNotificadoEn: ahora.toISOString(),
    });

    // Re-notificar a conductores disponibles (segunda oportunidad)
    try {
      const { enviarPushAConductores } = require('./pushNotifications');
      enviarPushAConductores({
        titulo: '🚕 Servicio esperando conductor',
        cuerpo: `${servicio.clienteNombre || 'Un cliente'}: ${servicio.origen} → ${servicio.destino}`,
        datos: { tipo: 'nuevo_servicio', servicioId },
      });
    } catch (e) {}

    // Aviso intermedio al cliente de la APP (push)
    try {
      const { enviarPushAUsuario } = require('./pushNotifications');
      if (servicio.clienteUid) {
        enviarPushAUsuario(servicio.clienteUid, {
          titulo: '🔎 Seguimos buscando tu taxi',
          cuerpo: 'Estamos avisando a más taxistas. Gracias por tu paciencia. 💛',
          datos: { tipo: 'servicio_buscando', servicioId },
        });
      }
    } catch (e) {}

    // Aviso intermedio al cliente de WHATSAPP
    try {
      if (servicio.fuenteSolicitud === 'whatsapp' && servicio.clienteCelular) {
        const whatsapp = require('../routes/whatsapp');
        if (whatsapp && typeof whatsapp.enviarMensaje === 'function') {
          await whatsapp.enviarMensaje(
            servicio.clienteCelular,
            '🔎 *Seguimos buscando tu taxi*\n\n' +
            'Estamos avisando a más taxistas de la zona. Gracias por tu paciencia. 💛🖤\n\n' +
            '_(Si deseas cancelar, escribe 0.)_'
          );
        }
      }
    } catch (e) {}

    console.log(`[SEGUIMIENTO] Re-notificado servicio ${servicioId} (${servicio.clienteNombre})`);
  } catch (e) {
    console.error('[SEGUIMIENTO] Error re-notificando:', e.message);
  }
}

// Cancela el servicio por expiración (10 min sin aceptar oferta)
async function cancelarServicio(servicioId, servicio, ahora) {
  await db.collection('servicios').doc(servicioId).update({
    estado: 'cancelado',
    motivoCancelacion: 'Cancelado automáticamente: no se aceptó ninguna oferta en 10 minutos',
    canceladoPor: 'sistema',
    canceladoEn: ahora.toISOString(),
    actualizadoEn: ahora.toISOString(),
  });

  // Rechazar todas las ofertas pendientes de este servicio
  try {
    const ofertasSnap = await db.collection('servicios').doc(servicioId)
      .collection('ofertas')
      .where('estado', '==', 'pendiente')
      .get();
    if (!ofertasSnap.empty) {
      const batch = db.batch();
      ofertasSnap.docs.forEach(ofertaDoc => batch.update(ofertaDoc.ref, { estado: 'rechazada' }));
      await batch.commit();
    }
  } catch (e) {
    console.warn(`[SEGUIMIENTO] Error rechazando ofertas de ${servicioId}:`, e.message);
  }

  // Notificar al cliente de la APP (push)
  try {
    const { enviarPushAUsuario } = require('./pushNotifications');
    if (servicio.clienteUid) {
      enviarPushAUsuario(servicio.clienteUid, {
        titulo: '⏰ No encontramos taxi disponible',
        cuerpo: 'No se encontró un conductor esta vez. Puedes solicitar de nuevo o llamarnos. 💛',
        datos: { tipo: 'servicio_cancelado', servicioId },
      });
    }
  } catch (e) {}

  // Notificar al cliente de WHATSAPP
  try {
    if (servicio.fuenteSolicitud === 'whatsapp' && servicio.clienteCelular) {
      const whatsapp = require('../routes/whatsapp');
      if (whatsapp && typeof whatsapp.enviarMensaje === 'function') {
        await whatsapp.enviarMensaje(
          servicio.clienteCelular,
          '⏰ *No encontramos taxi disponible*\n\n' +
          'Lo sentimos, ningún taxista pudo tomar tu solicitud esta vez.\n\n' +
          '🚕 Escribe *1* para intentar de nuevo.\n' +
          '📞 O llámanos: +57 322 7487094'
        );
      }
    }
  } catch (e) {}

  console.log(`[SEGUIMIENTO] Servicio ${servicioId} de ${servicio.clienteNombre} cancelado (creado: ${servicio.creadoEn})`);
}

// Iniciar el cron que revisa cada minuto
function iniciarAutoCancelacion() {
  console.log(`[SEGUIMIENTO] Iniciado — re-notifica a los ${TIEMPO_RENOTIFICAR_MIN} min y cancela a los ${TIEMPO_LIMITE_MINUTOS} min`);
  revisarServiciosPendientes();
  setInterval(revisarServiciosPendientes, 60 * 1000);
}

module.exports = {
  iniciarAutoCancelacion,
  revisarServiciosPendientes,
  // alias de compatibilidad
  cancelarServiciosPendientesExpirados: revisarServiciosPendientes,
};
