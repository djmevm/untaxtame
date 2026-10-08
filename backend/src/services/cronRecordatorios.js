/**
 * cronRecordatorios.js
 * Cron del flujo de Viajes Programados de Madrugada.
 *
 * Responsabilidades (ejecutadas cada 60s):
 *  - Para 'programado_asignado': disparar recordatorios 30/15/5 min antes,
 *    exactamente una vez cada uno (dedup persistido en `recordatorios`).
 *  - Para 'programado_buscando': si pasaron >=15 min desde la notificación
 *    inicial sin asignar, re-notificar a conductores una vez (`reNotificadoEn`);
 *    si sigue sin asignar, alertar al Admin una vez (`alertaAdminEnviada`).
 *  - Expirar viajes vencidos (hora programada ya pasó con margen).
 *
 * Las notificaciones NUNCA usan grupos de WhatsApp (la API no lo permite):
 *  - A conductores: push (pushNotifications).
 *  - Al cliente: WhatsApp directo (funciones exportadas de whatsapp.js).
 */

const { db } = require('../firebase');
const {
  minutosHasta,
  RECORDATORIOS_MIN, // [30, 15, 5]
  RE_NOTIFICAR_MIN,  // 15
  TARIFA_MADRUGADA,
} = require('./viajesProgramados');

const INTERVALO_MS = 60 * 1000; // cada 60s
const TOLERANCIA_MIN = 2;       // margen para no perder un umbral entre corridas
const EXPIRA_PASADO_MIN = 15;   // minutos tras la hora programada para expirar

// Carga diferida para evitar dependencias circulares con whatsapp.js
function wa() {
  try {
    return require('../routes/whatsapp');
  } catch (e) {
    console.error('[cronRecordatorios] No se pudo cargar whatsapp.js:', e.message);
    return {};
  }
}

function push() {
  try {
    return require('./pushNotifications');
  } catch (e) {
    return {};
  }
}

/**
 * Revisa todos los viajes programados activos y dispara las acciones debidas.
 * @param {Date} [ahora] inyectable para pruebas
 */
async function revisarViajesProgramados(ahora = new Date()) {
  // ── Viajes asignados: recordatorios 30/15/5 ──
  await procesarAsignados(ahora);
  // ── Viajes buscando: re-notificación + alerta admin + expiración ──
  await procesarBuscando(ahora);
}

async function procesarAsignados(ahora) {
  let snap;
  try {
    snap = await db
      .collection('servicios')
      .where('esProgramado', '==', true)
      .where('estado', '==', 'programado_asignado')
      .get();
  } catch (e) {
    console.error('[cronRecordatorios] Error leyendo asignados:', e.message);
    return;
  }

  const { notificarRecordatorioCliente } = wa();
  const { enviarPushAUsuario } = push();

  for (const doc of snap.docs) {
    const viaje = doc.data();
    if (!viaje.horaProgramada) continue;

    const minutos = minutosHasta(ahora, new Date(viaje.horaProgramada));
    const recordatorios = viaje.recordatorios || { '30': false, '15': false, '5': false };

    for (const umbral of RECORDATORIOS_MIN) {
      const key = String(umbral);
      const yaEnviado = recordatorios[key];
      // Disparar cuando faltan <= umbral (con tolerancia) y aún quedan minutos
      const enRango = minutos <= umbral && minutos > umbral - INTERVALO_MS / 60000 - TOLERANCIA_MIN;
      if (!yaEnviado && minutos <= umbral && minutos > 0 && (enRango || minutos <= umbral)) {
        let okCliente = true;
        try {
          if (typeof notificarRecordatorioCliente === 'function') {
            await notificarRecordatorioCliente(viaje.clienteCelular, viaje, umbral);
          }
        } catch (e) {
          okCliente = false;
          console.error(`[cronRecordatorios] Error recordatorio cliente ${umbral}min:`, e.message);
        }

        // Avisar también al conductor por push
        try {
          if (typeof enviarPushAUsuario === 'function' && viaje.conductorUid) {
            enviarPushAUsuario(viaje.conductorUid, {
              titulo: `🕐 Viaje programado en ${umbral} min`,
              cuerpo: `Recoge a ${viaje.pasajeroNombre || 'tu pasajero'} en ${viaje.puntoEncuentro || viaje.origen || ''}`,
              datos: { tipo: 'recordatorio_programado', viajeId: viaje.id, minutos: umbral },
            });
          }
        } catch (e) {
          console.error(`[cronRecordatorios] Error push conductor ${umbral}min:`, e.message);
        }

        // Persistir marca solo si el envío al cliente fue exitoso (dedup)
        if (okCliente) {
          recordatorios[key] = true;
          try {
            await doc.ref.update({ recordatorios, actualizadoEn: ahora.toISOString() });
          } catch (e) {
            console.error('[cronRecordatorios] Error guardando marca recordatorio:', e.message);
          }
        }
      }
    }

    // Expirar un asignado cuya hora ya pasó por mucho (sin marcar llegada)
    if (minutos < -EXPIRA_PASADO_MIN) {
      try {
        await doc.ref.update({
          estado: 'completado_auto',
          actualizadoEn: ahora.toISOString(),
        });
      } catch (e) {
        console.error('[cronRecordatorios] Error expirando asignado:', e.message);
      }
    }
  }
}

async function procesarBuscando(ahora) {
  let snap;
  try {
    snap = await db
      .collection('servicios')
      .where('esProgramado', '==', true)
      .where('estado', '==', 'programado_buscando')
      .get();
  } catch (e) {
    console.error('[cronRecordatorios] Error leyendo buscando:', e.message);
    return;
  }

  const { notificarCancelacionCliente } = wa();
  const { enviarPushAConductores, enviarPushAAdmins } = push();

  for (const doc of snap.docs) {
    const viaje = doc.data();
    if (!viaje.horaProgramada) continue;

    const minutos = minutosHasta(ahora, new Date(viaje.horaProgramada));

    // 1) Expirar si la hora ya pasó sin que nadie lo tomara
    if (minutos < -EXPIRA_PASADO_MIN) {
      try {
        await doc.ref.update({
          estado: 'cancelado',
          canceladoPor: 'sistema',
          motivoCancelacion: 'Viaje programado expirado - ningún conductor lo aceptó',
          actualizadoEn: ahora.toISOString(),
        });
        if (typeof notificarCancelacionCliente === 'function') {
          await notificarCancelacionCliente(viaje.clienteCelular, viaje);
        }
      } catch (e) {
        console.error('[cronRecordatorios] Error expirando buscando:', e.message);
      }
      continue;
    }

    // 2) Re-notificación a conductores a los >=15 min sin asignar (una vez)
    const inicio = viaje.notificacionInicialEn ? new Date(viaje.notificacionInicialEn) : null;
    if (inicio) {
      const minsDesdeInicio = (ahora.getTime() - inicio.getTime()) / 60000;

      if (minsDesdeInicio >= RE_NOTIFICAR_MIN && !viaje.reNotificadoEn) {
        try {
          if (typeof enviarPushAConductores === 'function') {
            enviarPushAConductores({
              titulo: '🕐 Viaje programado SIN asignar',
              cuerpo: `${viaje.origen} → ${viaje.destino} · ${viaje.horaProgramadaTexto || ''} · $${TARIFA_MADRUGADA.toLocaleString('es-CO')}`,
              datos: { tipo: 'nuevo_viaje_programado', viajeId: viaje.id },
            });
          }
          await doc.ref.update({ reNotificadoEn: ahora.toISOString(), actualizadoEn: ahora.toISOString() });
        } catch (e) {
          console.error('[cronRecordatorios] Error re-notificando conductores:', e.message);
        }
      }

      // 3) Alerta al Admin si tras re-notificar sigue sin asignar (una vez)
      if (viaje.reNotificadoEn && !viaje.alertaAdminEnviada) {
        const minsDesdeReNotif = (ahora.getTime() - new Date(viaje.reNotificadoEn).getTime()) / 60000;
        if (minsDesdeReNotif >= RE_NOTIFICAR_MIN) {
          try {
            if (typeof enviarPushAAdmins === 'function') {
              enviarPushAAdmins({
                titulo: '⚠️ Viaje programado sin conductor',
                cuerpo: `${viaje.codigoReserva || ''}: ${viaje.origen} → ${viaje.destino} (${viaje.horaProgramadaTexto || ''})`,
                datos: { tipo: 'alerta_programado_sin_asignar', viajeId: viaje.id },
              });
            }
            await doc.ref.update({ alertaAdminEnviada: true, actualizadoEn: ahora.toISOString() });
          } catch (e) {
            console.error('[cronRecordatorios] Error alertando admin:', e.message);
          }
        }
      }
    }
  }
}

/**
 * Inicia el cron con un setInterval de 60s. Captura errores y continúa.
 */
function iniciarCronRecordatorios() {
  console.log('[cronRecordatorios] Iniciado — revisión de viajes programados cada 60s');
  setInterval(async () => {
    try {
      await revisarViajesProgramados(new Date());
    } catch (e) {
      console.error('[cronRecordatorios] Error en ciclo:', e.message);
    }
  }, INTERVALO_MS);
}

module.exports = {
  revisarViajesProgramados,
  iniciarCronRecordatorios,
};
