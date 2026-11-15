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
const verifyAdmin = require('../middleware/verifyAdmin');
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
const { generarPinEmbarque } = require('../services/contactosConfianza');

/** Quita el PIN de respuestas que ve el conductor (solo el pasajero debe conocerlo). */
function sinPin(viaje) {
  if (!viaje) return viaje;
  const { pinEmbarque, ...resto } = viaje;
  return { ...resto, requierePinEmbarque: Boolean(pinEmbarque) };
}

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

  // Confirmar al cliente por WhatsApp que su viaje quedó registrado
  // (aplica tanto si lo crea el chatbot como el admin desde el panel).
  if (viaje.clienteCelular) {
    try {
      const numero = String(viaje.clienteCelular).replace(/[^0-9]/g, '');
      const numeroWA = numero.length === 10 ? `57${numero}` : numero;
      const whatsapp = require('./whatsapp');
      if (whatsapp && typeof whatsapp.enviarMensaje === 'function') {
        await whatsapp.enviarMensaje(
          numeroWA,
          '✅ *¡Viaje programado registrado!* 🕐\n\n' +
          `📅 ${viaje.horaProgramadaTexto || ''}\n` +
          `📍 ${viaje.origen} → ${viaje.destino}\n\n` +
          '🔍 Estamos buscando un conductor. Te avisaremos por aquí apenas un taxista acepte, con los datos del vehículo y la placa. 🚖'
        );
      }
    } catch (e) {
      console.error('[programados] Error confirmando al cliente:', e.message);
    }
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
// GET /todos — Todos los viajes programados (panel admin)
// ═══════════════════════════════════════════════════════════════════
router.get('/todos', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const snap = await db
      .collection('servicios')
      .where('esProgramado', '==', true)
      .get();

    const viajes = snap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: d.id,
          codigoReserva: d.codigoReserva,
          estado: d.estado,
          origen: d.origen,
          destino: d.destino,
          horaProgramada: d.horaProgramada,
          horaProgramadaTexto: d.horaProgramadaTexto,
          tarifaMadrugada: d.tarifaMadrugada,
          pasajeroNombre: d.pasajeroNombre,
          clienteNombre: d.clienteNombre,
          clienteCelular: d.clienteCelular,
          contacto: d.contacto,
          cantidadPasajeros: d.cantidadPasajeros,
          equipaje: d.equipaje,
          conductorNombre: d.conductorNombre,
          conductorPlaca: d.conductorPlaca,
          conductorCelular: d.conductorCelular,
          puntoEncuentro: d.puntoEncuentro,
          creadoEn: d.creadoEn,
        };
      })
      .sort((a, b) =>
        String(b.horaProgramada || '').localeCompare(String(a.horaProgramada || ''))
      );

    res.json(viajes);
  } catch (err) {
    console.error('[programados] Error listando todos:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
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
    // Incluye asignados + en sitio / en curso (flujo PIN de abordaje)
    const snap = await db
      .collection('servicios')
      .where('esProgramado', '==', true)
      .where('conductorUid', '==', req.params.conductorUid)
      .get();

    const estadosActivos = new Set([
      'programado_asignado',
      'conductor_en_sitio',
      'en_curso',
    ]);

    const viajes = snap.docs
      .map((doc) => {
        const d = doc.data();
        if (!estadosActivos.has(d.estado)) return null;
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
          estado: d.estado,
          tarifaMadrugada: d.tarifaMadrugada,
          // Nunca exponer el PIN al conductor; solo indicar que lo necesita
          requierePinEmbarque: Boolean(d.pinEmbarque) && d.estado === 'conductor_en_sitio',
        };
      })
      .filter(Boolean)
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
      const pinEmbarque = generarPinEmbarque();
      tx.update(viajeRef, {
        estado: 'programado_asignado',
        conductorUid,
        conductorNombre,
        conductorPlaca,
        conductorCelular,
        conductorVehiculo,
        pinEmbarque,
        pinGeneradoEn: new Date().toISOString(),
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

    // Push con PIN solo al cliente
    if (viajeActualizado.clienteUid && viajeActualizado.pinEmbarque) {
      try {
        enviarPushAUsuario(viajeActualizado.clienteUid, {
          titulo: '🔐 PIN de abordaje',
          cuerpo: `Tu PIN es ${viajeActualizado.pinEmbarque}. Dáselo solo al conductor al subir.`,
          datos: { tipo: 'pin_embarque', viajeId: viajeActualizado.id || req.params.viajeId },
        });
      } catch (e) {}
    }

    res.json({ message: 'Viaje aceptado', viaje: sinPin(viajeActualizado) });
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
  const motivo = (req.body && req.body.motivo) || 'Cancelado por el cliente';

  try {
    const snap = await viajeRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Viaje no encontrado' });

    const viaje = snap.data();
    if (!viaje.esProgramado) {
      return res.status(400).json({ error: 'Este servicio no es un viaje programado' });
    }
    if (viaje.clienteUid && viaje.clienteUid !== req.user.uid) {
      return res.status(403).json({ error: 'Solo puedes cancelar tus propios viajes' });
    }
    if (['cancelado', 'completado', 'completado_auto'].includes(viaje.estado)) {
      return res.status(400).json({ error: 'El viaje ya está finalizado' });
    }

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
    if (viaje.conductorUid !== req.user.uid) {
      return res.status(403).json({ error: 'No eres el conductor de este viaje' });
    }
    if (!['programado_asignado', 'conductor_en_sitio'].includes(viaje.estado)) {
      return res.status(400).json({ error: 'El viaje no está listo para marcar llegada' });
    }

    // Transición a conductor_en_sitio: habilita iniciar con PIN
    await viajeRef.update({
      estado: 'conductor_en_sitio',
      conductorEnSitioEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    });

    const actualizado = (await viajeRef.get()).data();

    try {
      const whatsapp = require('./whatsapp');
      if (whatsapp && typeof whatsapp.notificarLlegadaCliente === 'function') {
        await whatsapp.notificarLlegadaCliente(viaje.clienteCelular, actualizado);
      }
    } catch (e) {
      console.error('[programados] Error notificando llegada al cliente:', e.message);
    }

    if (viaje.clienteUid) {
      try {
        enviarPushAUsuario(viaje.clienteUid, {
          titulo: '📍 ¡Tu taxi llegó!',
          cuerpo: viaje.pinEmbarque
            ? `Dicta tu PIN ${viaje.pinEmbarque} al conductor para abordar.`
            : 'El conductor está en el punto de encuentro.',
          datos: { tipo: 'conductor_en_sitio', viajeId: viaje.id || req.params.viajeId },
        });
      } catch (e) {}
    }

    res.json({ message: 'Llegada notificada', viaje: sinPin({ id: req.params.viajeId, ...actualizado }) });
  } catch (err) {
    console.error('[programados] Error en llegada:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /iniciar/:viajeId — Conductor inicia con PIN de abordaje
// ═══════════════════════════════════════════════════════════════════
router.put('/iniciar/:viajeId', verifyToken, async (req, res) => {
  const viajeRef = db.collection('servicios').doc(req.params.viajeId);
  const pinIngresado = req.body?.pinEmbarque != null ? String(req.body.pinEmbarque).trim() : '';

  try {
    const snap = await viajeRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Viaje no encontrado' });

    const viaje = snap.data();
    if (viaje.conductorUid !== req.user.uid) {
      return res.status(403).json({ error: 'No eres el conductor de este viaje' });
    }
    if (viaje.estado !== 'conductor_en_sitio') {
      return res.status(400).json({
        error: 'Primero marca llegada. Luego pide el PIN al pasajero para iniciar.',
        requierePin: true,
      });
    }

    if (!viaje.pinEmbarque) {
      return res.status(400).json({ error: 'Este viaje no tiene PIN de abordaje' });
    }
    if (!pinIngresado) {
      return res.status(400).json({ error: 'Ingresa el PIN de 4 dígitos del pasajero', requierePin: true });
    }
    if (pinIngresado !== String(viaje.pinEmbarque)) {
      return res.status(403).json({ error: 'PIN de abordaje incorrecto', requierePin: true });
    }

    await viajeRef.update({
      estado: 'en_curso',
      iniciadoEn: new Date().toISOString(),
      pinVerificadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    });

    const actualizado = (await viajeRef.get()).data();

    if (viaje.clienteUid) {
      try {
        enviarPushAUsuario(viaje.clienteUid, {
          titulo: '🛣️ Viaje iniciado',
          cuerpo: 'PIN verificado. Buen viaje. Tus contactos de confianza pueden seguirte.',
          datos: { tipo: 'viaje_iniciado', viajeId: viaje.id || req.params.viajeId },
        });
      } catch (e) {}

      // Aviso automático a contactos de confianza
      try {
        const { notificarContactosConfianza } = require('../services/contactosConfianza');
        const base = process.env.PUBLIC_BASE_URL || 'https://untaxtame-production.up.railway.app';
        let token = actualizado.shareToken;
        if (!token) {
          const { v4: uuidv4 } = require('uuid');
          token = uuidv4().replace(/-/g, '').slice(0, 16);
          await viajeRef.update({ shareToken: token, compartidoEn: new Date().toISOString() });
        }
        const link = `${base.replace(/\/$/, '')}/seguimiento/${token}`;
        await notificarContactosConfianza(
          viaje.clienteUid,
          `🛣️ *Viaje de madrugada iniciado*\n\n` +
            `Pasajero: *${viaje.clienteNombre || viaje.pasajeroNombre || 'Cliente'}*\n` +
            `🚕 ${viaje.conductorNombre || 'Conductor'} · Placa ${viaje.conductorPlaca || '—'}\n` +
            `📍 ${viaje.origen || ''} → ${viaje.destino || ''}\n\n` +
            `🔗 Seguir en vivo: ${link}`
        );
      } catch (e) {
        console.error('[programados] contactos al iniciar:', e.message);
      }
    }

    res.json({ message: 'Viaje iniciado con PIN verificado', viaje: sinPin({ id: req.params.viajeId, ...actualizado }) });
  } catch (err) {
    console.error('[programados] Error en iniciar:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /admin-cancelar/:viajeId — Cancelar desde panel admin (sin límite 30 min)
// ═══════════════════════════════════════════════════════════════════
router.put('/admin-cancelar/:viajeId', verifyToken, verifyAdmin, async (req, res) => {
  const viajeRef = db.collection('servicios').doc(req.params.viajeId);
  const motivo = (req.body && req.body.motivo) || 'Cancelado por la central';

  try {
    const snap = await viajeRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Viaje no encontrado' });

    const viaje = snap.data();
    if (!viaje.esProgramado) {
      return res.status(400).json({ error: 'Este servicio no es un viaje programado' });
    }
    if (['cancelado', 'completado', 'completado_auto'].includes(viaje.estado)) {
      return res.status(400).json({ error: 'El viaje ya está finalizado' });
    }

    await viajeRef.update({
      estado: 'cancelado',
      canceladoPor: 'admin',
      motivoCancelacion: motivo,
      canceladoPorUid: req.user.uid,
      actualizadoEn: new Date().toISOString(),
    });

    if (viaje.conductorUid) {
      try {
        enviarPushAUsuario(viaje.conductorUid, {
          titulo: 'Viaje programado cancelado',
          cuerpo: `La central canceló ${viaje.codigoReserva || 'el viaje'} (${viaje.origen} → ${viaje.destino}).`,
          datos: { tipo: 'programado_cancelado', viajeId: viaje.id },
        });
      } catch (e) {}
    }

    if (viaje.clienteUid) {
      try {
        enviarPushAUsuario(viaje.clienteUid, {
          titulo: 'Viaje programado cancelado',
          cuerpo: `Tu reserva ${viaje.codigoReserva || ''} fue cancelada por la central.`,
          datos: { tipo: 'programado_cancelado', viajeId: viaje.id },
        });
      } catch (e) {}
    }

    res.json({ message: 'Viaje cancelado por admin', viajeId: viaje.id });
  } catch (err) {
    console.error('[programados] Error admin-cancelar:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /reasignar/:viajeId — Liberar o asignar conductor (admin)
// Body: { conductorUid?: string|null, motivo? }
// Sin conductorUid → vuelve a "programado_buscando" y notifica flota
// Con conductorUid → asigna ese conductor (programado_asignado)
// ═══════════════════════════════════════════════════════════════════
router.put('/reasignar/:viajeId', verifyToken, verifyAdmin, async (req, res) => {
  const viajeRef = db.collection('servicios').doc(req.params.viajeId);
  const { conductorUid, motivo } = req.body || {};

  try {
    const snap = await viajeRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Viaje no encontrado' });

    const viaje = snap.data();
    if (!viaje.esProgramado) {
      return res.status(400).json({ error: 'Este servicio no es un viaje programado' });
    }
    if (['cancelado', 'completado', 'completado_auto'].includes(viaje.estado)) {
      return res.status(400).json({ error: 'No se puede reasignar un viaje finalizado' });
    }

    const conductorAnterior = viaje.conductorUid || null;

    // Liberar: volver a buscar
    if (!conductorUid) {
      await viajeRef.update({
        estado: 'programado_buscando',
        conductorUid: null,
        conductorNombre: null,
        conductorPlaca: null,
        conductorCelular: null,
        reasignadoEn: new Date().toISOString(),
        reasignadoPor: req.user.uid,
        motivoReasignacion: motivo || 'Liberado por central',
        actualizadoEn: new Date().toISOString(),
      });

      if (conductorAnterior) {
        try {
          enviarPushAUsuario(conductorAnterior, {
            titulo: 'Viaje reasignado',
            cuerpo: `La central liberó el viaje ${viaje.codigoReserva || ''}. Ya no está a tu cargo.`,
            datos: { tipo: 'programado_reasignado', viajeId: viaje.id },
          });
        } catch (e) {}
      }

      try {
        enviarPushAConductores({
          titulo: '⏰ Viaje programado disponible',
          cuerpo: `${viaje.origen} → ${viaje.destino} · ${viaje.horaProgramadaTexto || ''}`,
          datos: { tipo: 'programado_disponible', viajeId: viaje.id },
        });
      } catch (e) {}

      return res.json({ message: 'Viaje liberado — buscando conductor', viajeId: viaje.id });
    }

    // Asignar conductor específico
    const condDoc = await db.collection('usuarios').doc(conductorUid).get();
    if (!condDoc.exists || condDoc.data().rol !== 'conductor') {
      return res.status(404).json({ error: 'Conductor no encontrado' });
    }
    const cond = condDoc.data();

    await viajeRef.update({
      estado: 'programado_asignado',
      conductorUid,
      conductorNombre: cond.nombre || 'Conductor',
      conductorPlaca: cond.placa || null,
      conductorCelular: cond.telefono || null,
      reasignadoEn: new Date().toISOString(),
      reasignadoPor: req.user.uid,
      motivoReasignacion: motivo || 'Asignado manualmente por central',
      actualizadoEn: new Date().toISOString(),
    });

    if (conductorAnterior && conductorAnterior !== conductorUid) {
      try {
        enviarPushAUsuario(conductorAnterior, {
          titulo: 'Viaje reasignado',
          cuerpo: `La central reasignó el viaje ${viaje.codigoReserva || ''} a otro conductor.`,
          datos: { tipo: 'programado_reasignado', viajeId: viaje.id },
        });
      } catch (e) {}
    }

    try {
      enviarPushAUsuario(conductorUid, {
        titulo: '⏰ Viaje programado asignado',
        cuerpo: `${viaje.origen} → ${viaje.destino} · ${viaje.horaProgramadaTexto || ''}`,
        datos: { tipo: 'programado_asignado', viajeId: viaje.id },
      });
    } catch (e) {}

    res.json({
      message: 'Conductor asignado',
      viajeId: viaje.id,
      conductor: { uid: conductorUid, nombre: cond.nombre, placa: cond.placa },
    });
  } catch (err) {
    console.error('[programados] Error reasignar:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// DELETE /:viajeId — Eliminar definitivamente un viaje programado (admin)
// ═══════════════════════════════════════════════════════════════════
router.delete('/:viajeId', verifyToken, verifyAdmin, async (req, res) => {
  const viajeRef = db.collection('servicios').doc(req.params.viajeId);

  try {
    const snap = await viajeRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Viaje no encontrado' });

    const viaje = snap.data();
    if (!viaje.esProgramado) {
      return res.status(400).json({ error: 'Este servicio no es un viaje programado' });
    }

    // Si estaba asignado a un conductor, avisarle por push que se eliminó.
    if (viaje.estado === 'programado_asignado' && viaje.conductorUid) {
      try {
        enviarPushAUsuario(viaje.conductorUid, {
          titulo: 'Viaje programado eliminado',
          cuerpo: `La central eliminó el viaje ${viaje.codigoReserva || ''} (${viaje.origen} → ${viaje.destino}).`,
          datos: { tipo: 'programado_eliminado', viajeId: viaje.id },
        });
      } catch (e) {
        console.error('[programados] Error notificando eliminación al conductor:', e.message);
      }
    }

    await viajeRef.delete();

    res.json({ message: 'Viaje programado eliminado', viajeId: req.params.viajeId });
  } catch (err) {
    console.error('[programados] Error eliminando viaje:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
module.exports.crearViajeProgramado = crearViajeProgramado;
