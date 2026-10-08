/**
 * programados.js
 * Endpoints HTTP para el flujo de Viajes Programados de Madrugada.
 *
 * Reutiliza la colección Firestore `servicios`, discriminando por el flag
 * `esProgramado: true` y los estados `programado_buscando` / `programado_asignado`.
 *
 * Las utilidades puras de parseo/validación/generación viven en
 * `../services/viajesProgramados.js`.
 */

const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const { v4: uuidv4 } = require('uuid');
const verifyToken = require('../middleware/verifyToken');
const {
  enviarPushAConductores,
  enviarPushAUsuario,
} = require('../services/pushNotifications');
const {
  generarCodigoReserva,
  fechaCalendarioBogota,
  minutosHasta,
  TARIFA_MADRUGADA,
  MAX_VIAJES_POR_NOCHE,
  CANCELACION_LIBRE_MIN,
} = require('../services/viajesProgramados');

// ═══════════════════════════════════════════════════════════════════
// Creador interno (no HTTP) — reutilizable desde el chatbot de WhatsApp
// ═══════════════════════════════════════════════════════════════════

/**
 * Crea un Viaje_Programado en la colección `servicios` y notifica a los
 * conductores disponibles por push.
 *
 * @param {object} datos
 * @param {Date}   datos.horaProgramada     Instante UTC de la hora programada
 * @param {string} datos.horaProgramadaTexto Texto legible (zona Bogotá)
 * @param {string} datos.clienteUid
 * @param {string} datos.clienteNombre
 * @param {string} datos.clienteCelular
 * @param {string} datos.origen
 * @param {string} datos.destino
 * @param {string} datos.pasajeroNombre
 * @param {string} datos.contacto
 * @param {number} datos.cantidadPasajeros
 * @param {string} datos.equipaje
 * @returns {Promise<object>} el documento creado
 */
async function crearViajeProgramado(datos) {
  const ahora = new Date();
  const ahoraISO = ahora.toISOString();

  const horaProgramada =
    datos.horaProgramada instanceof Date
      ? datos.horaProgramada
      : new Date(datos.horaProgramada);
  const horaProgramadaISO = horaProgramada.toISOString();

  const viajeId = uuidv4();
  const codigoReserva = generarCodigoReserva(horaProgramada);
  const origen = datos.origen || null;

  const viaje = {
    // --- Campos base reutilizados de 'servicios' ---
    id: viajeId,
    clienteUid: datos.clienteUid || null,
    clienteNombre: datos.clienteNombre || null,
    clienteCelular: datos.clienteCelular || null,
    origen,
    destino: datos.destino || null,
    metodoPago: 'efectivo',
    fuenteSolicitud: 'whatsapp',
    conductorUid: null,
    conductorNombre: null,
    conductorPlaca: null,
    conductorCelular: null,

    // --- Campos específicos de Viaje_Programado ---
    esProgramado: true,
    estado: 'programado_buscando',
    codigoReserva,
    horaProgramada: horaProgramadaISO,
    horaProgramadaTexto: datos.horaProgramadaTexto || null,
    tarifaMadrugada: TARIFA_MADRUGADA,

    // Datos del viaje capturados por el chatbot
    pasajeroNombre: datos.pasajeroNombre || null,
    contacto: datos.contacto || null,
    cantidadPasajeros: datos.cantidadPasajeros || null,
    equipaje: datos.equipaje || null,
    puntoEncuentro: origen,

    // Vehículo del conductor asignado
    conductorVehiculo: null,

    // Control de recordatorios y notificaciones (persistido para dedup)
    recordatorios: { '30': false, '15': false, '5': false },
    notificacionInicialEn: ahoraISO,
    reNotificadoEn: null,
    alertaAdminEnviada: false,

    // Cancelación
    canceladoPor: null,
    motivoCancelacion: null,

    creadoEn: ahoraISO,
    actualizadoEn: ahoraISO,
  };

  await db.collection('servicios').doc(viajeId).set(viaje);

  // Push inicial a conductores disponibles (nunca grupos de WhatsApp)
  try {
    enviarPushAConductores({
      titulo: '🕐 Nuevo viaje programado',
      cuerpo:
        `${viaje.origen} → ${viaje.destino} · ${viaje.horaProgramadaTexto || ''} · ` +
        `$${TARIFA_MADRUGADA.toLocaleString('es-CO')}`,
      datos: { tipo: 'nuevo_viaje_programado', viajeId },
    });
  } catch (e) {
    console.error('[programados] Error push inicial a conductores:', e.message);
  }

  return viaje;
}

// ═══════════════════════════════════════════════════════════════════
// POST / — Crear un viaje programado
// ═══════════════════════════════════════════════════════════════════
router.post('/', verifyToken, async (req, res) => {
  try {
    const viaje = await crearViajeProgramado(req.body || {});
    res.status(201).json({ message: 'Viaje programado creado', viaje });
  } catch (err) {
    console.error('[programados] Error creando viaje:', err.message);
    res.status(500).json({ error: 'No se pudo crear el viaje programado' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /disponibles — Viajes en 'programado_buscando' (sin exponer celular)
// ═══════════════════════════════════════════════════════════════════
router.get('/disponibles', verifyToken, async (req, res) => {
  try {
    const snap = await db
      .collection('servicios')
      .where('esProgramado', '==', true)
      .where('estado', '==', 'programado_buscando')
      .get();

    const viajes = snap.docs
      .map((doc) => {
        const d = doc.data();
        // NUNCA exponer clienteCelular en viajes disponibles
        return {
          id: d.id,
          codigoReserva: d.codigoReserva,
          origen: d.origen,
          destino: d.destino,
          horaProgramada: d.horaProgramada,
          horaProgramadaTexto: d.horaProgramadaTexto,
          tarifaMadrugada: d.tarifaMadrugada,
          cantidadPasajeros: d.cantidadPasajeros,
          equipaje: d.equipaje,
        };
      })
      .sort((a, b) =>
        String(a.horaProgramada || '').localeCompare(String(b.horaProgramada || ''))
      );

    res.json(viajes);
  } catch (err) {
    console.error('[programados] Error listando disponibles:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /asignados/:conductorUid — Viajes 'programado_asignado' del conductor
// ═══════════════════════════════════════════════════════════════════
router.get('/asignados/:conductorUid', verifyToken, async (req, res) => {
  try {
    const snap = await db
      .collection('servicios')
      .where('esProgramado', '==', true)
      .where('estado', '==', 'programado_asignado')
      .where('conductorUid', '==', req.params.conductorUid)
      .get();

    const viajes = snap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: d.id,
          codigoReserva: d.codigoReserva,
          origen: d.origen,
          destino: d.destino,
          horaProgramada: d.horaProgramada,
          horaProgramadaTexto: d.horaProgramadaTexto,
          pasajeroNombre: d.pasajeroNombre,
          puntoEncuentro: d.puntoEncuentro,
          contacto: d.contacto,
          cantidadPasajeros: d.cantidadPasajeros,
        };
      })
      .sort((a, b) =>
        String(a.horaProgramada || '').localeCompare(String(b.horaProgramada || ''))
      );

    res.json(viajes);
  } catch (err) {
    console.error('[programados] Error listando asignados:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /aceptar/:viajeId — Conductor acepta (transacción, control de carrera)
// ═══════════════════════════════════════════════════════════════════
router.put('/aceptar/:viajeId', verifyToken, async (req, res) => {
  const { conductorUid, conductorNombre } = req.body || {};
  if (!conductorUid || !conductorNombre) {
    return res.status(400).json({ error: 'Faltan datos del conductor' });
  }

  const viajeRef = db.collection('servicios').doc(req.params.viajeId);

  try {
    // Pre-lectura del viaje para conocer la fecha calendario objetivo.
    const viajeSnap = await viajeRef.get();
    if (!viajeSnap.exists) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    const viajeData = viajeSnap.data();
    if (viajeData.estado !== 'programado_buscando') {
      return res.status(409).json({
        error: 'Este viaje ya fue tomado por otro conductor',
      });
    }

    // Cargar datos del conductor (placa, teléfono, vehículo).
    const conductorDoc = await db.collection('usuarios').doc(conductorUid).get();
    const conductorData = conductorDoc.exists ? conductorDoc.data() : {};
    const conductorPlaca = conductorData.placa || null;
    const conductorCelular = conductorData.telefono || null;
    const conductorVehiculo =
      conductorData.vehiculo || conductorData.fotoVehiculo || null;

    // Regla máx 3 por noche: contar asignados del conductor cuya fecha
    // calendario (Bogotá) coincida con la del viaje objetivo.
    // La cuenta se hace fuera de la transacción (baja concurrencia); el
    // cambio de estado se realiza dentro de la transacción.
    const fechaObjetivo = fechaCalendarioBogota(new Date(viajeData.horaProgramada));
    const asignadosSnap = await db
      .collection('servicios')
      .where('esProgramado', '==', true)
      .where('estado', '==', 'programado_asignado')
      .where('conductorUid', '==', conductorUid)
      .get();

    const enEsaNoche = asignadosSnap.docs.filter((doc) => {
      const d = doc.data();
      if (!d.horaProgramada) return false;
      return fechaCalendarioBogota(new Date(d.horaProgramada)) === fechaObjetivo;
    }).length;

    if (enEsaNoche >= MAX_VIAJES_POR_NOCHE) {
      return res.status(409).json({
        error: `Alcanzaste el máximo de ${MAX_VIAJES_POR_NOCHE} viajes programados por noche`,
      });
    }

    // El cambio de estado ocurre dentro de la transacción para garantizar
    // que solo un conductor gane el viaje (control de carrera, R7.3).
    await db.runTransaction(async (tx) => {
      const docTx = await tx.get(viajeRef);
      if (!docTx.exists) {
        const e = new Error('Viaje no encontrado');
        e.codigo = 404;
        throw e;
      }
      if (docTx.data().estado !== 'programado_buscando') {
        const e = new Error('Este viaje ya fue tomado por otro conductor');
        e.codigo = 409;
        throw e;
      }
      tx.update(viajeRef, {
        estado: 'programado_asignado',
        conductorUid,
        conductorNombre,
        conductorPlaca,
        conductorCelular,
        conductorVehiculo,
        actualizadoEn: new Date().toISOString(),
      });
    });

    // Releer el viaje actualizado para notificar al cliente.
    const actualizadoSnap = await viajeRef.get();
    const viajeActualizado = actualizadoSnap.exists ? actualizadoSnap.data() : viajeData;

    // Notificar al cliente por WhatsApp (require diferido para evitar
    // dependencias circulares con whatsapp.js).
    try {
      const { notificarAsignacionCliente } = require('./whatsapp');
      if (typeof notificarAsignacionCliente === 'function') {
        await notificarAsignacionCliente(viajeActualizado.clienteCelular, viajeActualizado);
      }
    } catch (e) {
      console.error('[programados] Error notificando asignación al cliente:', e.message);
    }

    res.json({ message: 'Viaje aceptado', viaje: viajeActualizado });
  } catch (err) {
    if (err && err.codigo === 404) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    if (err && err.codigo === 409) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[programados] Error aceptando viaje:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /cancelar/:viajeId — Cancelación del cliente (gratis si faltan >30 min)
// ═══════════════════════════════════════════════════════════════════
router.put('/cancelar/:viajeId', verifyToken, async (req, res) => {
  const viajeRef = db.collection('servicios').doc(req.params.viajeId);
  const motivo = (req.body && req.body.motivo) || null;

  try {
    const snap = await viajeRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Viaje no encontrado' });

    const viaje = snap.data();
    const minutos = minutosHasta(new Date(), new Date(viaje.horaProgramada));

    if (minutos > CANCELACION_LIBRE_MIN) {
      await viajeRef.update({
        estado: 'cancelado',
        canceladoPor: 'cliente',
        motivoCancelacion: motivo,
        actualizadoEn: new Date().toISOString(),
      });

      // Si estaba asignado, avisar al conductor por push.
      if (viaje.estado === 'programado_asignado' && viaje.conductorUid) {
        try {
          enviarPushAUsuario(viaje.conductorUid, {
            titulo: 'Viaje programado cancelado',
            cuerpo: `El cliente canceló el viaje ${viaje.codigoReserva || ''} (${viaje.origen} → ${viaje.destino}).`,
            datos: { tipo: 'programado_cancelado', viajeId: viaje.id },
          });
        } catch (e) {
          console.error('[programados] Error notificando cancelación al conductor:', e.message);
        }
      }

      return res.json({ message: 'Viaje cancelado', viajeId: viaje.id });
    }

    return res.status(400).json({
      error: `La cancelación gratuita solo está disponible hasta ${CANCELACION_LIBRE_MIN} minutos antes de la hora programada.`,
    });
  } catch (err) {
    console.error('[programados] Error cancelando viaje:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /llegada/:viajeId — Conductor marca llegada → avisa al cliente
// ═══════════════════════════════════════════════════════════════════
router.put('/llegada/:viajeId', verifyToken, async (req, res) => {
  const viajeRef = db.collection('servicios').doc(req.params.viajeId);

  try {
    const snap = await viajeRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Viaje no encontrado' });

    const viaje = snap.data();

    // Avisar al cliente "Tu taxi ha llegado" (require diferido + guarda:
    // whatsapp.js expone esta función en una tarea posterior).
    try {
      const whatsapp = require('./whatsapp');
      if (whatsapp && typeof whatsapp.notificarLlegadaCliente === 'function') {
        await whatsapp.notificarLlegadaCliente(viaje.clienteCelular, viaje);
      }
    } catch (e) {
      console.error('[programados] Error notificando llegada al cliente:', e.message);
    }

    res.json({ message: 'Llegada notificada', viajeId: viaje.id });
  } catch (err) {
    console.error('[programados] Error en llegada:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
module.exports.crearViajeProgramado = crearViajeProgramado;
