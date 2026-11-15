const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const { v4: uuidv4 } = require('uuid');
const verifyToken = require('../middleware/verifyToken');
const verifyAdmin = require('../middleware/verifyAdmin');
const { TARIFA_MINIMA } = require('../utils/tarifa');
const { descontarComision } = require('./billetera');

async function esAdminUid(uid) {
  const userDoc = await db.collection('usuarios').doc(uid).get();
  return userDoc.exists && userDoc.data().rol === 'admin';
}

async function notificarCambioServicio(servicio) {
  if (!servicio) return;
  try {
    const { notificarServicioActualizado } = require('../services/websocket');
    if (servicio.clienteUid) notificarServicioActualizado(servicio.clienteUid, servicio);
    if (servicio.conductorUid) notificarServicioActualizado(servicio.conductorUid, servicio);
  } catch (e) {}
}

// Estados posibles: pendiente | aceptado | en_curso | conductor_en_sitio | completado | cancelado

// Obtener tarifa mínima
router.get('/tarifas', (req, res) => {
  res.json({ tarifaMinima: TARIFA_MINIMA });
});

// Cliente solicita un taxi
router.post('/solicitar', verifyToken, async (req, res) => {
  const { clienteNombre, clienteCelular, clienteDireccion, origen, destino, metodoPago, ubicacionGPS, destinoLat, destinoLng } = req.body;
  const clienteUid = req.user.uid;

  if (!clienteNombre || !origen || !destino || !metodoPago) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const metodosPagoValidos = ['daviplata', 'nequi', 'efectivo', 'pse'];
  if (!metodosPagoValidos.includes(metodoPago.toLowerCase())) {
    return res.status(400).json({ error: 'Método de pago inválido: ' + metodoPago });
  }

  try {
    const servicioId = uuidv4();

    // Si el origen es texto de coordenadas pero hay GPS, convertir a
    // dirección legible para que el conductor sepa a dónde ir.
    let origenLegible = origen;
    try {
      const pareceCoords = /^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(String(origen || '').trim());
      if ((pareceCoords || !origen) && ubicacionGPS?.lat) {
        const { direccionLegible } = require('../services/geocoding');
        const dir = await direccionLegible(ubicacionGPS.lat, ubicacionGPS.lng);
        if (dir) origenLegible = dir;
      }
    } catch (e) {}

    const servicio = {
      id: servicioId,
      clienteUid,
      clienteNombre,
      clienteCelular:   clienteCelular   || null,
      clienteDireccion: clienteDireccion || null,
      ubicacionGPS:     ubicacionGPS     || null,
      destinoLat:       destinoLat       || null,
      destinoLng:       destinoLng       || null,
      origen:           origenLegible,
      destino,
      metodoPago: metodoPago.toLowerCase(),
      estado: 'pendiente',
      conductorUid:     null,
      conductorNombre:  null,
      conductorPlaca:   null,
      conductorCelular: null,
      calificacion:     null,
      tarifaMinima:     TARIFA_MINIMA,
      tarifaAcordada:   null,
      totalOfertas:     0,
      requisitos:       req.body.requisitos || [],
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    };

    await db.collection('servicios').doc(servicioId).set(servicio);

    // Contar conductores disponibles (aprobados y marcados como disponibles)
    let conductoresDisponibles = 0;
    try {
      const snap = await db.collection('usuarios')
        .where('rol', '==', 'conductor')
        .where('disponible', '==', true)
        .get();
      conductoresDisponibles = snap.size;
    } catch (e) {}

    // Push a conductores disponibles
    try {
      const { enviarPushAConductores } = require('../services/pushNotifications');
      enviarPushAConductores({ titulo: 'Nuevo servicio', cuerpo: clienteNombre + ': ' + origen + ' -> ' + destino, datos: { tipo: 'nuevo_servicio', servicioId } });
    } catch (e) {}

    // Respuesta con info del estado de la búsqueda (para que la app avise
    // al cliente de inmediato y sepa qué esperar).
    res.status(201).json({
      message: 'Servicio solicitado',
      servicio,
      conductoresDisponibles,
      sinConductores: conductoresDisponibles === 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Conductor acepta un servicio
router.put('/aceptar/:servicioId', verifyToken, async (req, res) => {
  const conductorUid = req.user.uid;
  let { conductorNombre } = req.body;

  try {
    // Verificar si el conductor tiene un servicio activo
    const activoSnap = await db.collection('servicios')
      .where('conductorUid', '==', conductorUid)
      .where('estado', 'in', ['aceptado', 'conductor_en_sitio', 'en_curso'])
      .limit(1)
      .get();

    if (!activoSnap.empty) {
      const activo = activoSnap.docs[0].data();
      return res.status(403).json({
        error: 'Ya tienes un servicio en curso. Debes completarlo o cancelarlo antes de aceptar otro.',
        servicioActivoId: activo.id,
      });
    }

    // Verificar si el conductor está penalizado
    const conductorCheck = await db.collection('usuarios').doc(conductorUid).get();
    if (conductorCheck.exists) {
      const cData = conductorCheck.data();
      if (cData.penalizado && cData.penalizadoHasta) {
        if (new Date(cData.penalizadoHasta) > new Date()) {
          const horasRestantes = Math.ceil((new Date(cData.penalizadoHasta) - new Date()) / (1000 * 60 * 60));
          return res.status(403).json({
            error: `Estás penalizado por cancelaciones frecuentes. Podrás volver en ${horasRestantes} hora${horasRestantes > 1 ? 's' : ''}.`
          });
        } else {
          await db.collection('usuarios').doc(conductorUid).update({
            penalizado: false, penalizadoHasta: null, motivoPenalizacion: null,
          });
        }
      }
    }

    const ref = db.collection('servicios').doc(req.params.servicioId);
    const doc = await ref.get();

    if (!doc.exists) return res.status(404).json({ error: 'Servicio no encontrado' });
    if (doc.data().estado !== 'pendiente') {
      return res.status(400).json({ error: 'El servicio ya no está disponible' });
    }

    // Obtener datos completos del conductor
    const conductorDoc = await db.collection('usuarios').doc(conductorUid).get();
    const conductorData = conductorDoc.exists ? conductorDoc.data() : {};
    if (!conductorNombre) conductorNombre = conductorData.nombre || 'Conductor';

    await ref.update({
      conductorUid,
      conductorNombre,
      conductorPlaca:   conductorData.placa   || null,
      conductorCelular: conductorData.telefono || null,
      estado: 'aceptado',
      actualizadoEn: new Date().toISOString(),
    });

    // Marcar conductor como no disponible
    await db.collection('usuarios').doc(conductorUid).update({ disponible: false });

    const servicioActualizado = (await ref.get()).data();
    await notificarCambioServicio(servicioActualizado);

    res.json({ message: 'Servicio aceptado', servicioId: req.params.servicioId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Conductor inicia el viaje (pasajero subió al taxi)
router.put('/iniciar/:servicioId', verifyToken, async (req, res) => {
  const conductorUid = req.user.uid;
  const pinIngresado = req.body?.pinEmbarque != null ? String(req.body.pinEmbarque).trim() : '';
  try {
    const ref = db.collection('servicios').doc(req.params.servicioId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Servicio no encontrado' });

    const data = doc.data();
    if (data.conductorUid !== conductorUid) return res.status(403).json({ error: 'No eres el conductor de este servicio' });
    if (data.estado !== 'conductor_en_sitio') return res.status(400).json({ error: 'El servicio no está en estado "conductor_en_sitio"' });

    // Viajes con pin de abordaje (madrugada / programados): el pasajero debe dictarlo
    if (data.pinEmbarque) {
      if (!pinIngresado) {
        return res.status(400).json({
          error: 'Este viaje requiere el PIN de abordaje del pasajero',
          requierePin: true,
        });
      }
      if (pinIngresado !== String(data.pinEmbarque)) {
        return res.status(403).json({ error: 'PIN de abordaje incorrecto', requierePin: true });
      }
    }

    await ref.update({
      estado: 'en_curso',
      iniciadoEn: new Date().toISOString(),
      pinVerificadoEn: data.pinEmbarque ? new Date().toISOString() : null,
      actualizadoEn: new Date().toISOString(),
    });

    const actualizado = (await ref.get()).data();
    await notificarCambioServicio(actualizado);

    if (data.clienteUid) {
      try {
        const { enviarPushAUsuario } = require('../services/pushNotifications');
        enviarPushAUsuario(data.clienteUid, {
          titulo: '🛣️ Viaje iniciado',
          cuerpo: 'Ya van hacia el destino. Puedes seguir el taxi en vivo.',
          datos: { tipo: 'viaje_iniciado', servicioId: req.params.servicioId },
        });
      } catch (e) {}

      // Aviso a contactos de confianza (viaje seguro)
      try {
        const { notificarContactosConfianza } = require('../services/contactosConfianza');
        const base = process.env.PUBLIC_BASE_URL || 'https://untaxtame-production.up.railway.app';
        let token = data.shareToken;
        if (!token) {
          token = uuidv4().replace(/-/g, '').slice(0, 16);
          await ref.update({ shareToken: token, compartidoEn: new Date().toISOString() });
        }
        const link = `${base.replace(/\/$/, '')}/seguimiento/${token}`;
        await notificarContactosConfianza(
          data.clienteUid,
          `🛣️ *Viaje iniciado*\n\n` +
            `Pasajero: *${data.clienteNombre || 'Cliente'}*\n` +
            `🚕 ${data.conductorNombre || 'Conductor'} · Placa ${data.conductorPlaca || '—'}\n` +
            `📍 ${data.origen || ''} → ${data.destino || ''}\n\n` +
            `🔗 Seguir en vivo: ${link}`
        );
      } catch (e) {}
    }

    res.json({ message: 'Viaje iniciado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Conductor confirma llegada al punto de recogida
router.put('/llegada/:servicioId', verifyToken, async (req, res) => {
  const conductorUid = req.user.uid;
  const { ubicacionConductor } = req.body;
  try {
    const ref = db.collection('servicios').doc(req.params.servicioId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Servicio no encontrado' });

    const data = doc.data();
    if (data.conductorUid !== conductorUid) return res.status(403).json({ error: 'No eres el conductor de este servicio' });
    if (!['aceptado', 'en_curso'].includes(data.estado)) return res.status(400).json({ error: 'El servicio no está en un estado válido para confirmar llegada' });

    // Validar GPS: si el cliente tiene ubicación, verificar que el conductor esté cerca (500m)
    let gpsValidado = false;
    if (ubicacionConductor && data.ubicacionGPS) {
      const dist = calcularDistanciaMetros(
        ubicacionConductor.lat, ubicacionConductor.lng,
        data.ubicacionGPS.lat, data.ubicacionGPS.lng
      );
      gpsValidado = dist <= 500; // 500 metros de tolerancia
    }

    await ref.update({
      estado: 'conductor_en_sitio',
      conductorEnSitioEn: new Date().toISOString(),
      gpsValidadoLlegada: gpsValidado,
      ubicacionConductorLlegada: ubicacionConductor || null,
      actualizadoEn: new Date().toISOString(),
    });

    const actualizado = (await ref.get()).data();
    await notificarCambioServicio(actualizado);

    if (data.clienteUid) {
      try {
        const { enviarPushAUsuario } = require('../services/pushNotifications');
        enviarPushAUsuario(data.clienteUid, {
          titulo: '📍 ¡Tu conductor llegó!',
          cuerpo: `${data.conductorNombre || 'El conductor'} está en el punto de recogida. Sal al encuentro.`,
          datos: { tipo: 'conductor_en_sitio', servicioId: req.params.servicioId },
        });
      } catch (e) {}
    }

    res.json({ message: 'Llegada confirmada', gpsValidado });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Verificar si aplica penalización antes de cancelar (para el cliente)
router.get('/verificar-penalizacion/:servicioId', verifyToken, async (req, res) => {
  try {
    const doc = await db.collection('servicios').doc(req.params.servicioId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Servicio no encontrado' });

    const data = doc.data();
    const configDoc = await db.collection('configuracion').doc('penalizaciones').get();
    const config = configDoc.exists ? configDoc.data() : { tiempoGraciaMinutos: 3, porcentajePenalizacion: 30, activo: true };

    if (!config.activo || data.estado !== 'conductor_en_sitio') {
      return res.json({ aplicaPenalizacion: false, motivo: 'No aplica penalización' });
    }

    // Verificar tiempo de gracia
    const llegadaEn = new Date(data.conductorEnSitioEn);
    const ahora = new Date();
    const minutosTranscurridos = (ahora - llegadaEn) / (1000 * 60);

    if (minutosTranscurridos <= (config.tiempoGraciaMinutos || 3)) {
      return res.json({
        aplicaPenalizacion: false,
        motivo: `Estás dentro del tiempo de gracia (${config.tiempoGraciaMinutos} min)`,
        minutosRestantes: Math.ceil((config.tiempoGraciaMinutos || 3) - minutosTranscurridos),
      });
    }

    // Verificar GPS real del conductor
    if (!data.gpsValidadoLlegada) {
      return res.json({
        aplicaPenalizacion: false,
        motivo: 'No se pudo validar la ubicación del conductor',
      });
    }

    const tarifa = data.tarifaAcordada || data.tarifaMinima || 8000;
    const porcentaje = config.porcentajePenalizacion || 30;
    const montoPenalizacion = Math.round((tarifa * porcentaje / 100) * 100) / 100;

    res.json({
      aplicaPenalizacion: true,
      montoPenalizacion,
      porcentaje,
      tarifa,
      tiempoGracia: config.tiempoGraciaMinutos,
      minutosEnSitio: Math.round(minutosTranscurridos),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Utilidad: calcular distancia en metros entre dos coordenadas
function calcularDistanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Marcar servicio como completado
router.put('/completar/:servicioId', verifyToken, async (req, res) => {
  const { clientePago, metodoPagoConfirmado } = req.body || {};

  try {
    const ref = db.collection('servicios').doc(req.params.servicioId);
    const doc = await ref.get();

    if (!doc.exists) return res.status(404).json({ error: 'Servicio no encontrado' });

    const data = doc.data();
    if (data.conductorUid !== req.user.uid) {
      return res.status(403).json({ error: 'Solo el conductor del servicio puede completarlo' });
    }
    await ref.update({
      estado: 'completado',
      completadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
      clientePago: clientePago !== undefined ? clientePago : null,
      metodoPagoConfirmado: metodoPagoConfirmado || data.metodoPago,
    });

    // Descontar comisión de la billetera del conductor
    let comisionResult = null;
    if (data.conductorUid) {
      const tarifa = data.tarifaAcordada || data.tarifaMinima || 8000;
      comisionResult = await descontarComision(data.conductorUid, req.params.servicioId, tarifa);
      await ref.update({ comision: comisionResult });
    }

    // Liberar conductor
    if (data.conductorUid) {
      await db.collection('usuarios').doc(data.conductorUid).update({ disponible: true });
    }

    const tarifaFinal = data.tarifaAcordada || data.tarifaMinima || 8000;
    const metodoFinal = metodoPagoConfirmado || data.metodoPago || 'efectivo';
    const recibo = {
      servicioId: req.params.servicioId,
      origen: data.origen,
      destino: data.destino,
      tarifa: tarifaFinal,
      metodoPago: metodoFinal,
      clientePago: clientePago !== undefined ? clientePago : null,
      conductorNombre: data.conductorNombre || null,
      conductorPlaca: data.conductorPlaca || null,
      completadoEn: new Date().toISOString(),
    };
    await ref.update({ recibo });

    // Push + notificación interna al cliente (recibo)
    if (data.clienteUid) {
      try {
        await db.collection('notificaciones').add({
          uid: data.clienteUid,
          tipo: 'recibo',
          titulo: '✅ Viaje completado',
          mensaje: `Tarifa $${tarifaFinal.toLocaleString('es-CO')} · ${String(metodoFinal).toUpperCase()}. Califica a tu conductor.`,
          servicioId: req.params.servicioId,
          recibo,
          leida: false,
          creadoEn: new Date().toISOString(),
        });
        const { enviarPushAUsuario } = require('../services/pushNotifications');
        enviarPushAUsuario(data.clienteUid, {
          titulo: '✅ Viaje completado — recibo',
          cuerpo: `${data.origen} → ${data.destino} · $${tarifaFinal.toLocaleString('es-CO')} (${String(metodoFinal).toUpperCase()})`,
          datos: { tipo: 'recibo', servicioId: req.params.servicioId },
        });
      } catch (e) {
        console.error('[SERVICES] Error push recibo cliente:', e.message);
      }
    }

    // Notificar al cliente de WhatsApp que el servicio terminó y pedir calificación
    if (data.fuenteSolicitud === 'whatsapp' && data.clienteCelular) {
      try {
        const { notificarServicioCompletadoWhatsApp } = require('./whatsapp');
        await notificarServicioCompletadoWhatsApp(data.clienteCelular, {
          servicioId: req.params.servicioId,
          conductorNombre: data.conductorNombre,
          tarifa: tarifaFinal,
          metodoPago: metodoFinal,
        });
      } catch (e) {
        console.error('[SERVICES] Error notificando WhatsApp completado:', e.message);
      }
    }

    await notificarCambioServicio((await ref.get()).data());

    res.json({ message: 'Servicio completado', comision: comisionResult, clientePago, recibo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancelar servicio (requiere motivo)
router.put('/cancelar/:servicioId', verifyToken, async (req, res) => {
  const { motivo, canceladoPor } = req.body;

  if (!motivo || motivo.trim().length < 5) {
    return res.status(400).json({ error: 'Debes escribir el motivo de la cancelación (mínimo 5 caracteres)' });
  }

  try {
    const ref = db.collection('servicios').doc(req.params.servicioId);
    const doc = await ref.get();

    if (!doc.exists) return res.status(404).json({ error: 'Servicio no encontrado' });

    const data = doc.data();
    const uid = req.user.uid;
    const esConductor = uid === data.conductorUid;
    const esCliente = uid === data.clienteUid;

    // ═══ PENALIZACIÓN AL CLIENTE ═══
    let penalizacionCliente = null;
    if (esCliente && data.estado === 'conductor_en_sitio') {
      const configDoc = await db.collection('configuracion').doc('penalizaciones').get();
      const config = configDoc.exists ? configDoc.data() : { tiempoGraciaMinutos: 3, porcentajePenalizacion: 30, activo: true };

      if (config.activo && data.gpsValidadoLlegada) {
        const llegadaEn = new Date(data.conductorEnSitioEn);
        const ahora = new Date();
        const minutosTranscurridos = (ahora - llegadaEn) / (1000 * 60);

        if (minutosTranscurridos > (config.tiempoGraciaMinutos || 3)) {
          // Verificar que no haya doble penalización
          if (!data.penalizacionAplicada) {
            const tarifa = data.tarifaAcordada || data.tarifaMinima || 8000;
            const porcentaje = config.porcentajePenalizacion || 30;
            const montoPenalizacion = Math.round((tarifa * porcentaje / 100) * 100) / 100;

            penalizacionCliente = {
              monto: montoPenalizacion,
              porcentaje,
              tarifa,
              minutosEnSitio: Math.round(minutosTranscurridos),
              tiempoGracia: config.tiempoGraciaMinutos || 3,
              aplicadaEn: new Date().toISOString(),
            };

            // Registrar penalización en historial del cliente
            await db.collection('penalizaciones').add({
              clienteUid: data.clienteUid,
              clienteNombre: data.clienteNombre,
              conductorUid: data.conductorUid,
              conductorNombre: data.conductorNombre,
              servicioId: req.params.servicioId,
              monto: montoPenalizacion,
              porcentaje,
              tarifa,
              motivo: `Cancelación con conductor en sitio (${Math.round(minutosTranscurridos)} min esperando)`,
              estado: 'aplicada', // aplicada | disputada | revertida
              creadoEn: new Date().toISOString(),
            });

            // Transferir al conductor (agregar a su billetera)
            if (data.conductorUid) {
              const billRef = db.collection('billeteras').doc(data.conductorUid);
              const billDoc = await billRef.get();
              const saldoActual = billDoc.exists ? (billDoc.data().saldo || 0) : 0;
              const nuevoSaldo = Math.round((saldoActual + montoPenalizacion) * 100) / 100;

              await billRef.set({
                saldo: nuevoSaldo,
                actualizadoEn: new Date().toISOString(),
              }, { merge: true });

              await billRef.collection('movimientos').add({
                tipo: 'penalizacion_cliente',
                monto: montoPenalizacion,
                saldoAnterior: saldoActual,
                saldoNuevo: nuevoSaldo,
                servicioId: req.params.servicioId,
                clienteNombre: data.clienteNombre,
                descripcion: `Penalización por cancelación de ${data.clienteNombre}`,
                creadoEn: new Date().toISOString(),
              });

              // Notificar al conductor
              await db.collection('notificaciones').add({
                uid: data.conductorUid,
                tipo: 'penalizacion_recibida',
                titulo: '💰 Compensación recibida',
                mensaje: `${data.clienteNombre} canceló el servicio. Recibiste $${montoPenalizacion.toLocaleString('es-CO')} como compensación.`,
                leida: false,
                creadoEn: new Date().toISOString(),
              });
            }

            // Notificar al cliente
            await db.collection('notificaciones').add({
              uid: data.clienteUid,
              tipo: 'penalizacion_cobrada',
              titulo: '⚠️ Penalización aplicada',
              mensaje: `Se aplicó un cargo de $${montoPenalizacion.toLocaleString('es-CO')} por cancelar con el conductor en el punto de recogida.`,
              leida: false,
              creadoEn: new Date().toISOString(),
            });
          }
        }
      }
    }

    await ref.update({
      estado: 'cancelado',
      motivoCancelacion: motivo.trim(),
      canceladoPor: esConductor ? 'conductor' : 'cliente',
      canceladoUid: uid,
      penalizacionAplicada: penalizacionCliente || null,
      actualizadoEn: new Date().toISOString(),
    });

    // Liberar conductor
    if (data.conductorUid) {
      await db.collection('usuarios').doc(data.conductorUid).update({ disponible: true });
    }

    await notificarCambioServicio((await ref.get()).data());

    // Si el conductor canceló, verificar penalización al conductor
    if (esConductor && data.conductorUid) {
      const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const cancelacionesSnap = await db.collection('servicios')
        .where('conductorUid', '==', data.conductorUid)
        .where('estado', '==', 'cancelado')
        .where('canceladoPor', '==', 'conductor')
        .get();

      const cancelacionesRecientes = cancelacionesSnap.docs
        .filter(d => d.data().actualizadoEn > hace30dias).length;

      if (cancelacionesRecientes >= 5) {
        const penalizadoHasta = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
        await db.collection('usuarios').doc(data.conductorUid).update({
          penalizado: true, penalizadoHasta, disponible: false, enServicio: false,
          motivoPenalizacion: '5 cancelaciones en los últimos 30 días — bloqueado 12 horas',
        });
        return res.json({ message: 'Servicio cancelado', penalizado: true, penalizadoHasta, cancelaciones: cancelacionesRecientes, penalizacionCliente });
      }
      res.json({ message: 'Servicio cancelado', cancelaciones: cancelacionesRecientes, penalizacionCliente });
    } else {
      res.json({ message: 'Servicio cancelado', penalizacionCliente });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar servicios pendientes (para conductores)
router.get('/pendientes', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('servicios')
      .where('estado', '==', 'pendiente')
      .orderBy('creadoEn', 'desc')
      .get();

    // No exponer clienteCelular a conductores antes de aceptar oferta
    const servicios = snapshot.docs.map(d => {
      const data = d.data();
      const { clienteCelular, ...sinCelular } = data;
      return sinCelular;
    });
    res.json(servicios);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Historial de servicios de un usuario
router.get('/historial/:uid/:rol', verifyToken, async (req, res) => {
  const { uid, rol } = req.params;
  const campo = rol === 'conductor' ? 'conductorUid' : 'clienteUid';

  if (req.user.uid !== uid && !(await esAdminUid(req.user.uid))) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  try {
    const snapshot = await db.collection('servicios')
      .where(campo, '==', uid)
      .orderBy('creadoEn', 'desc')
      .get();

    const servicios = snapshot.docs.map((d) => {
      const data = d.data();
      // El PIN solo lo ve el cliente; al conductor solo flag
      if (rol === 'conductor' && data.pinEmbarque) {
        const { pinEmbarque, ...resto } = data;
        return {
          ...resto,
          requierePinEmbarque: true,
        };
      }
      return data;
    });
    res.json(servicios);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Calificar un servicio completado
router.put('/calificar/:servicioId', verifyToken, async (req, res) => {
  const { calificacion, comentario } = req.body;
  const puntuacion = parseInt(calificacion);
  if (!puntuacion || puntuacion < 1 || puntuacion > 10) {
    return res.status(400).json({ error: 'La calificación debe ser entre 1 y 10' });
  }
  try {
    const ref = db.collection('servicios').doc(req.params.servicioId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Servicio no encontrado' });
    const servicioPre = doc.data();
    if (servicioPre.clienteUid !== req.user.uid) {
      return res.status(403).json({ error: 'Solo el cliente puede calificar este servicio' });
    }
    if (servicioPre.estado !== 'completado') {
      return res.status(400).json({ error: 'Solo se pueden calificar servicios completados' });
    }
    await ref.update({
      calificacion: {
        puntuacion,
        comentario: comentario || '',
        fecha: new Date().toISOString(),
      },
      actualizadoEn: new Date().toISOString(),
    });

    // Crear notificación para el conductor que REALIZÓ el servicio
    const servicio = doc.data();
    if (servicio.conductorUid) {
      await db.collection('notificaciones').add({
        uid: servicio.conductorUid,
        tipo: 'calificacion',
        titulo: `⭐ Nueva calificación: ${puntuacion}/10`,
        mensaje: comentario
          ? `${servicio.clienteNombre} te calificó con ${puntuacion}/10: "${comentario}"`
          : `${servicio.clienteNombre} te calificó con ${puntuacion}/10`,
        puntuacion,
        servicioId: req.params.servicioId,
        leida: false,
        creadoEn: new Date().toISOString(),
      });

      // Push al teléfono del conductor (según su perfil) para que lo vea al instante
      try {
        const { enviarPushAUsuario } = require('../services/pushNotifications');
        enviarPushAUsuario(servicio.conductorUid, {
          titulo: `⭐ Te calificaron con ${puntuacion}/10`,
          cuerpo: comentario
            ? `${servicio.clienteNombre}: "${comentario}"`
            : `${servicio.clienteNombre} calificó tu servicio.`,
          datos: { tipo: 'calificacion', servicioId: req.params.servicioId },
        });
      } catch (e) {}

      // Actualizar reputación del conductor
      try {
        const serviciosSnap = await db.collection('servicios')
          .where('conductorUid', '==', servicio.conductorUid)
          .where('estado', '==', 'completado')
          .get();

        const calificaciones = serviciosSnap.docs
          .map(d => d.data().calificacion?.puntuacion)
          .filter(p => p && p > 0);

        if (calificaciones.length > 0) {
          const promedio = calificaciones.reduce((a, b) => a + b, 0) / calificaciones.length;
          const reputacion = Math.round(promedio * 10); // porcentaje sobre 100

          await db.collection('usuarios').doc(servicio.conductorUid).update({
            reputacion: {
              promedio: Math.round(promedio * 10) / 10,
              porcentaje: reputacion,
              totalCalificaciones: calificaciones.length,
              totalServicios: serviciosSnap.size,
              actualizadoEn: new Date().toISOString(),
            },
          });
        }
      } catch (repErr) {
        console.error('Error actualizando reputación:', repErr.message);
      }
    }

    res.json({ message: 'Calificación guardada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Calificar al CLIENTE (el conductor califica al pasajero tras completar)
router.put('/calificar-cliente/:servicioId', verifyToken, async (req, res) => {
  const { calificacion, comentario } = req.body;
  const puntuacion = parseInt(calificacion);
  if (!puntuacion || puntuacion < 1 || puntuacion > 10) {
    return res.status(400).json({ error: 'La calificación debe ser entre 1 y 10' });
  }
  try {
    const ref = db.collection('servicios').doc(req.params.servicioId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Servicio no encontrado' });
    const servicio = doc.data();
    if (servicio.conductorUid !== req.user.uid) {
      return res.status(403).json({ error: 'Solo el conductor puede calificar al cliente' });
    }
    if (servicio.estado !== 'completado') {
      return res.status(400).json({ error: 'Solo se pueden calificar servicios completados' });
    }

    await ref.update({
      calificacionCliente: {
        puntuacion,
        comentario: comentario || '',
        fecha: new Date().toISOString(),
      },
      actualizadoEn: new Date().toISOString(),
    });

    // Recalcular la reputación del cliente
    if (servicio.clienteUid) {
      try {
        const serviciosSnap = await db.collection('servicios')
          .where('clienteUid', '==', servicio.clienteUid)
          .where('estado', '==', 'completado')
          .get();

        const calificaciones = serviciosSnap.docs
          .map(d => d.data().calificacionCliente?.puntuacion)
          .filter(p => p && p > 0);

        if (calificaciones.length > 0) {
          const promedio = calificaciones.reduce((a, b) => a + b, 0) / calificaciones.length;
          await db.collection('usuarios').doc(servicio.clienteUid).update({
            reputacionCliente: {
              promedio: Math.round(promedio * 10) / 10,
              porcentaje: Math.round(promedio * 10),
              totalCalificaciones: calificaciones.length,
              totalServicios: serviciosSnap.size,
              actualizadoEn: new Date().toISOString(),
            },
          });
        }
      } catch (repErr) {
        console.error('Error actualizando reputación del cliente:', repErr.message);
      }

      // Notificar al cliente (interna + push)
      try {
        await db.collection('notificaciones').add({
          uid: servicio.clienteUid,
          tipo: 'calificacion_cliente',
          titulo: `⭐ El conductor te calificó: ${puntuacion}/10`,
          mensaje: comentario
            ? `${servicio.conductorNombre || 'Tu conductor'}: "${comentario}"`
            : `${servicio.conductorNombre || 'Tu conductor'} calificó tu comportamiento como pasajero.`,
          puntuacion,
          servicioId: req.params.servicioId,
          leida: false,
          creadoEn: new Date().toISOString(),
        });
        const { enviarPushAUsuario } = require('../services/pushNotifications');
        enviarPushAUsuario(servicio.clienteUid, {
          titulo: `⭐ Te calificaron con ${puntuacion}/10`,
          cuerpo: 'Tu conductor calificó tu viaje. ¡Gracias por usar UntaXtame!',
          datos: { tipo: 'calificacion_cliente', servicioId: req.params.servicioId },
        });
      } catch (e) {}
    }

    res.json({ message: 'Calificación del cliente guardada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ranking: mejor taxista y mejor cliente (admin) — para premiación
router.get('/ranking', verifyToken, verifyAdmin, async (req, res) => {
  try {
    // Rango de fechas opcional (?desde=ISO&hasta=ISO). Por defecto, año en curso.
    const ahora = new Date();
    const desde = req.query.desde
      ? new Date(req.query.desde)
      : new Date(Date.UTC(ahora.getUTCFullYear(), 0, 1));
    const hasta = req.query.hasta ? new Date(req.query.hasta) : ahora;

    const snap = await db.collection('servicios')
      .where('estado', '==', 'completado')
      .get();

    // Acumuladores por conductor y por cliente
    const conductores = {}; // uid → { nombre, placa, sumaCalif, nCalif, nServicios }
    const clientes = {};    // uid → { nombre, sumaCalif, nCalif, nServicios }

    snap.docs.forEach((d) => {
      const s = d.data();
      const fecha = s.creadoEn ? new Date(s.creadoEn) : null;
      if (fecha && (fecha < desde || fecha > hasta)) return;

      // Conductor
      if (s.conductorUid) {
        const c = conductores[s.conductorUid] || {
          uid: s.conductorUid, nombre: s.conductorNombre || '—', placa: s.conductorPlaca || '',
          sumaCalif: 0, nCalif: 0, nServicios: 0,
        };
        c.nServicios += 1;
        const p = s.calificacion?.puntuacion;
        if (p && p > 0) { c.sumaCalif += p; c.nCalif += 1; }
        conductores[s.conductorUid] = c;
      }

      // Cliente
      if (s.clienteUid) {
        // Clasificar fuente: WhatsApp (uid "whatsapp_..." o fuenteSolicitud) vs App
        const esWhatsApp = s.fuenteSolicitud === 'whatsapp' || String(s.clienteUid).startsWith('whatsapp_');
        const cl = clientes[s.clienteUid] || {
          uid: s.clienteUid,
          nombre: s.clienteNombre || '—',
          fuente: esWhatsApp ? 'whatsapp' : 'app',
          celular: s.clienteCelular || null,
          sumaCalif: 0, nCalif: 0, nServicios: 0,
        };
        cl.nServicios += 1;
        const pc = s.calificacionCliente?.puntuacion;
        if (pc && pc > 0) { cl.sumaCalif += pc; cl.nCalif += 1; }
        clientes[s.clienteUid] = cl;
      }
    });

    const armar = (obj) => Object.values(obj).map((x) => ({
      ...x,
      promedio: x.nCalif > 0 ? Math.round((x.sumaCalif / x.nCalif) * 10) / 10 : 0,
    }));

    // Orden: primero por promedio, luego por cantidad de servicios
    const rankConductores = armar(conductores).sort((a, b) =>
      b.promedio - a.promedio || b.nServicios - a.nServicios
    );
    const rankClientes = armar(clientes).sort((a, b) =>
      b.promedio - a.promedio || b.nServicios - a.nServicios
    );

    res.json({
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      conductores: rankConductores,
      clientes: rankClientes,
    });
  } catch (err) {
    console.error('[ranking] Error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Configuración de penalizaciones (admin)
router.get('/penalizaciones/config', verifyToken, async (req, res) => {
  try {
    const doc = await db.collection('configuracion').doc('penalizaciones').get();
    res.json(doc.exists ? doc.data() : { tiempoGraciaMinutos: 3, porcentajePenalizacion: 30, activo: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/penalizaciones/config', verifyToken, verifyAdmin, async (req, res) => {
  try {
    await db.collection('configuracion').doc('penalizaciones').set(req.body, { merge: true });
    const doc = await db.collection('configuracion').doc('penalizaciones').get();
    res.json({ message: 'Configuración actualizada', config: doc.data() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reporte de penalizaciones (admin)
router.get('/penalizaciones/reporte', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('penalizaciones').orderBy('creadoEn', 'desc').limit(100).get();
    const penalizaciones = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const totalIngresos = penalizaciones.filter(p => p.estado === 'aplicada').reduce((a, p) => a + (p.monto || 0), 0);
    const totalDisputadas = penalizaciones.filter(p => p.estado === 'disputada').length;
    res.json({ penalizaciones, totalIngresos, totalDisputadas, total: penalizaciones.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Disputar penalización (admin puede revertir)
router.put('/penalizaciones/:penId/revertir', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const ref = db.collection('penalizaciones').doc(req.params.penId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Penalización no encontrada' });
    await ref.update({ estado: 'revertida', revertidaEn: new Date().toISOString(), revertidaPor: req.user.uid });
    res.json({ message: 'Penalización revertida' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Verificar si el conductor tiene un servicio activo
router.get('/activo/:uid', verifyToken, async (req, res) => {
  if (req.user.uid !== req.params.uid) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  try {
    const snapshot = await db.collection('servicios')
      .where('conductorUid', '==', req.params.uid)
      .where('estado', 'in', ['aceptado', 'conductor_en_sitio', 'en_curso'])
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.json({ tieneActivo: false, servicio: null });
    }

    const servicio = snapshot.docs[0].data();
    res.json({ tieneActivo: true, servicio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Todos los servicios (admin)
router.get('/todos', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('servicios')
      .orderBy('creadoEn', 'desc')
      .get();

    const servicios = snapshot.docs.map(d => d.data());
    res.json(servicios);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancelar servicio desde el panel admin
router.put('/admin-cancelar/:servicioId', verifyToken, verifyAdmin, async (req, res) => {
  const { motivo } = req.body;
  try {
    const ref = db.collection('servicios').doc(req.params.servicioId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Servicio no encontrado' });

    const data = doc.data();
    if (['completado', 'cancelado'].includes(data.estado)) {
      return res.status(400).json({ error: 'Este servicio ya está finalizado' });
    }

    await ref.update({
      estado: 'cancelado',
      motivoCancelacion: motivo || 'Cancelado por administrador',
      canceladoPor: 'admin',
      canceladoUid: req.user.uid,
      actualizadoEn: new Date().toISOString(),
    });

    // Liberar conductor
    if (data.conductorUid) {
      await db.collection('usuarios').doc(data.conductorUid).update({ disponible: true });
    }

    res.json({ message: 'Servicio cancelado por administrador' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Marcar pago de servicio (admin)
router.put('/pago/:servicioId', verifyToken, verifyAdmin, async (req, res) => {
  const { clientePago } = req.body;
  try {
    const ref = db.collection('servicios').doc(req.params.servicioId);
    await ref.update({ clientePago: clientePago === true, actualizadoEn: new Date().toISOString() });
    res.json({ message: 'Estado de pago actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Completar servicio desde el panel admin
router.put('/admin-completar/:servicioId', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const ref = db.collection('servicios').doc(req.params.servicioId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Servicio no encontrado' });

    const data = doc.data();
    if (['completado', 'cancelado'].includes(data.estado)) {
      return res.status(400).json({ error: 'Este servicio ya está finalizado' });
    }

    await ref.update({
      estado: 'completado',
      completadoPor: 'admin',
      completadoUid: req.user.uid,
      actualizadoEn: new Date().toISOString(),
    });

    // Liberar conductor
    if (data.conductorUid) {
      await db.collection('usuarios').doc(data.conductorUid).update({ disponible: true });
    }

    res.json({ message: 'Servicio completado por administrador' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alerta de seguridad a contactos de confianza (GPS perdido / desvío / manual)
router.post('/:servicioId/alerta-seguridad', verifyToken, async (req, res) => {
  try {
    const ref = db.collection('servicios').doc(req.params.servicioId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Servicio no encontrado' });
    const data = doc.data();

    if (data.clienteUid !== req.user.uid && data.conductorUid !== req.user.uid) {
      const admin = await esAdminUid(req.user.uid);
      if (!admin) return res.status(403).json({ error: 'No autorizado' });
    }

    const tipo = req.body?.tipo || 'manual';
    const tiposOk = ['gps_perdido', 'desvio', 'manual', 'viaje_iniciado'];
    if (!tiposOk.includes(tipo)) return res.status(400).json({ error: 'Tipo de alerta inválido' });

    // Evitar spam: una alerta del mismo tipo cada 10 min
    const prev = data.ultimaAlertaSeguridad || {};
    if (prev.tipo === tipo && prev.en) {
      const ago = Date.now() - new Date(prev.en).getTime();
      if (ago < 10 * 60 * 1000) {
        return res.json({ message: 'Alerta reciente ya enviada', omitida: true, contactosNotificados: 0 });
      }
    }

    const base = process.env.PUBLIC_BASE_URL || 'https://untaxtame-production.up.railway.app';
    let token = data.shareToken;
    if (!token) {
      token = uuidv4().replace(/-/g, '').slice(0, 16);
      await ref.update({ shareToken: token, compartidoEn: new Date().toISOString() });
    }
    const link = `${base.replace(/\/$/, '')}/seguimiento/${token}`;

    const textos = {
      gps_perdido: '📡 Se perdió la señal GPS del conductor durante el viaje.',
      desvio: '⚠️ El recorrido se desvió de la ruta esperada.',
      viaje_iniciado: '🛣️ El viaje acaba de iniciar. Puedes seguirlo en vivo.',
      manual: '🔔 Alerta de seguridad del viaje.',
    };

    const msg =
      `🔐 *Viaje seguro UntaXtame*\n\n` +
      `Pasajero: *${data.clienteNombre || 'Cliente'}*\n` +
      `${textos[tipo]}\n\n` +
      `🚕 ${data.conductorNombre || 'Conductor'} · Placa ${data.conductorPlaca || '—'}\n` +
      `📍 ${data.origen || ''} → ${data.destino || ''}\n` +
      `\n🔗 Seguir: ${link}`;

    const { notificarContactosConfianza } = require('../services/contactosConfianza');
    const contactosNotificados = await notificarContactosConfianza(data.clienteUid, msg);

    await ref.update({
      ultimaAlertaSeguridad: { tipo, en: new Date().toISOString(), contactosNotificados },
      actualizadoEn: new Date().toISOString(),
    });

    res.json({ message: 'Contactos notificados', contactosNotificados, url: link });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generar link de seguimiento para compartir con un familiar
router.post('/:servicioId/compartir', verifyToken, async (req, res) => {
  try {
    const ref = db.collection('servicios').doc(req.params.servicioId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Servicio no encontrado' });

    const data = doc.data();
    if (data.clienteUid !== req.user.uid && data.conductorUid !== req.user.uid) {
      const admin = await esAdminUid(req.user.uid);
      if (!admin) return res.status(403).json({ error: 'No autorizado' });
    }
    if (!['aceptado', 'conductor_en_sitio', 'en_curso'].includes(data.estado)) {
      return res.status(400).json({ error: 'El viaje no está activo' });
    }

    let token = data.shareToken;
    if (!token) {
      token = uuidv4().replace(/-/g, '').slice(0, 16);
      await ref.update({
        shareToken: token,
        compartidoEn: new Date().toISOString(),
      });
    }

    const base = process.env.PUBLIC_BASE_URL || 'https://untaxtame-production.up.railway.app';
    res.json({
      token,
      url: `${base.replace(/\/$/, '')}/seguimiento/${token}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seguimiento público (sin auth) — datos sanitizados para familiares
router.get('/seguimiento/:token', async (req, res) => {
  try {
    const snap = await db.collection('servicios')
      .where('shareToken', '==', req.params.token)
      .limit(1)
      .get();

    if (snap.empty) return res.status(404).json({ error: 'Enlace no válido o expirado' });

    const data = snap.docs[0].data();
    if (['completado', 'cancelado'].includes(data.estado)) {
      return res.json({
        activo: false,
        estado: data.estado,
        mensaje: data.estado === 'completado' ? 'El viaje ya terminó' : 'El viaje fue cancelado',
        origen: data.origen,
        destino: data.destino,
      });
    }

    let ubicacionConductor = null;
    if (data.conductorUid) {
      const cond = await db.collection('usuarios').doc(data.conductorUid).get();
      if (cond.exists && cond.data().ubicacionActual) {
        ubicacionConductor = cond.data().ubicacionActual;
      }
    }

    res.json({
      activo: true,
      estado: data.estado,
      origen: data.origen,
      destino: data.destino,
      conductorNombre: data.conductorNombre || null,
      conductorPlaca: data.conductorPlaca || null,
      ubicacionConductor,
      ubicacionRecogida: data.ubicacionGPS || null,
      actualizadoEn: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar servicio permanentemente (admin)
router.delete('/:servicioId', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const ref = db.collection('servicios').doc(req.params.servicioId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Servicio no encontrado' });

    // Eliminar subcolecciones (ofertas, chat)
    const ofertasSnap = await ref.collection('ofertas').get();
    const chatSnap = await ref.collection('chat').get();
    const batch = db.batch();
    ofertasSnap.forEach(d => batch.delete(d.ref));
    chatSnap.forEach(d => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();

    res.json({ message: 'Servicio eliminado permanentemente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
