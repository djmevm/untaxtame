const { db } = require('../firebase');

// ═══ AUTO-CANCELACIÓN DE SERVICIOS PENDIENTES ═══
// Cancela automáticamente servicios que llevan más de 10 minutos
// en estado "pendiente" sin que el cliente acepte una oferta.

const TIEMPO_LIMITE_MINUTOS = 10;

async function cancelarServiciosPendientesExpirados() {
  try {
    const ahora = new Date();
    const limite = new Date(ahora.getTime() - TIEMPO_LIMITE_MINUTOS * 60 * 1000);

    // Buscar servicios pendientes creados hace más de 10 minutos
    const snapshot = await db.collection('servicios')
      .where('estado', '==', 'pendiente')
      .where('creadoEn', '<=', limite.toISOString())
      .get();

    if (snapshot.empty) return;

    console.log(`[AUTO-CANCEL] Encontrados ${snapshot.size} servicios pendientes expirados`);

    for (const doc of snapshot.docs) {
      const servicio = doc.data();

      await db.collection('servicios').doc(doc.id).update({
        estado: 'cancelado',
        motivoCancelacion: 'Cancelado automáticamente: no se aceptó ninguna oferta en 10 minutos',
        canceladoPor: 'sistema',
        canceladoEn: ahora.toISOString(),
        actualizadoEn: ahora.toISOString(),
      });

      // Rechazar todas las ofertas pendientes de este servicio
      try {
        const ofertasSnap = await db.collection('servicios').doc(doc.id)
          .collection('ofertas')
          .where('estado', '==', 'pendiente')
          .get();

        if (!ofertasSnap.empty) {
          const batch = db.batch();
          ofertasSnap.docs.forEach(ofertaDoc => {
            batch.update(ofertaDoc.ref, { estado: 'rechazada' });
          });
          await batch.commit();
        }
      } catch (e) {
        console.warn(`[AUTO-CANCEL] Error rechazando ofertas de ${doc.id}:`, e.message);
      }

      // Notificar al cliente
      try {
        const { enviarPushAUsuario } = require('./pushNotifications');
        if (servicio.clienteUid) {
          enviarPushAUsuario(servicio.clienteUid, {
            titulo: '⏰ Servicio cancelado',
            cuerpo: 'Tu solicitud de taxi fue cancelada porque no se aceptó ninguna oferta en 10 minutos. Puedes solicitar otro.',
            datos: { tipo: 'servicio_cancelado', servicioId: doc.id },
          });
        }
      } catch (e) {}

      console.log(`[AUTO-CANCEL] Servicio ${doc.id} de ${servicio.clienteNombre} cancelado (creado: ${servicio.creadoEn})`);
    }
  } catch (err) {
    console.error('[AUTO-CANCEL] Error:', err.message);
  }
}

// Iniciar el cron que revisa cada minuto
function iniciarAutoCancelacion() {
  console.log(`[AUTO-CANCEL] Iniciado — Cancelará servicios pendientes después de ${TIEMPO_LIMITE_MINUTOS} minutos`);

  // Ejecutar inmediatamente al iniciar
  cancelarServiciosPendientesExpirados();

  // Revisar cada minuto
  setInterval(cancelarServiciosPendientesExpirados, 60 * 1000);
}

module.exports = { iniciarAutoCancelacion, cancelarServiciosPendientesExpirados };
