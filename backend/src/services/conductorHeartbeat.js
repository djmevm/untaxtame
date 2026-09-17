/**
 * conductorHeartbeat.js
 * Job que corre cada 2 minutos y marca como no disponibles
 * a los conductores que no han actualizado ubicación en más de 3 minutos.
 * Esto soluciona el bug donde un conductor cierra la app sin cancelar
 * y queda bloqueado indefinidamente como "disponible".
 */

const { db } = require('../firebase');

const TIMEOUT_MINUTOS = 3;
const INTERVALO_MS = 2 * 60 * 1000; // cada 2 minutos

async function limpiarConductoresInactivos() {
  try {
    const limiteInactividad = new Date(Date.now() - TIMEOUT_MINUTOS * 60 * 1000).toISOString();

    const snapshot = await db.collection('usuarios')
      .where('rol', '==', 'conductor')
      .where('disponible', '==', true)
      .get();

    if (snapshot.empty) return;

    const batch = db.batch();
    let conteo = 0;

    snapshot.docs.forEach(doc => {
      const data = doc.data();

      // Solo resetear si no está en un servicio activo
      if (data.enServicio) return;

      // Si no tiene ultimaActividadEn o es muy antiguo, resetear disponibilidad
      const ultimaActividad = data.ultimaActividadEn || data.ubicacionActual?.actualizadoEn;
      if (!ultimaActividad || ultimaActividad < limiteInactividad) {
        batch.update(doc.ref, {
          disponible: false,
          enServicio: false,
          inactivoDesdeEn: new Date().toISOString(),
        });
        conteo++;
      }
    });

    if (conteo > 0) {
      await batch.commit();
      console.log(`[HEARTBEAT] ${conteo} conductor(es) marcados como no disponibles por inactividad`);
    }
  } catch (err) {
    console.error('[HEARTBEAT] Error en limpieza:', err.message);
  }
}

function iniciarHeartbeat() {
  console.log('[HEARTBEAT] Iniciado — conductores inactivos serán desconectados tras', TIMEOUT_MINUTOS, 'min');
  // Ejecutar al inicio y luego cada 2 minutos
  limpiarConductoresInactivos();
  setInterval(limpiarConductoresInactivos, INTERVALO_MS);
}

module.exports = { iniciarHeartbeat };
