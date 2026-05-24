const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const { v4: uuidv4 } = require('uuid');
const verifyToken = require('../middleware/verifyToken');
const verifyAdmin = require('../middleware/verifyAdmin');
const { TARIFA_MINIMA } = require('../utils/tarifa');
const { descontarComision } = require('./billetera');
const { enviarPushAConductores, enviarPushAUsuario } = require('../services/pushNotifications');
const { notificarNuevoServicio, notificarServicioActualizado } = require('../services/websocket');

// Estados posibles: pendiente | aceptado | en_curso | conductor_en_sitio | completado | cancelado

// Obtener tarifa mínima
router.get('/tarifas', (req, res) => {
  res.json({ tarifaMinima: TARIFA_MINIMA });
});

// Cliente solicita un taxi
router.post('/solicitar', verifyToken, async (req, res) => {
  const { clienteUid, clienteNombre, clienteCelular, clienteDireccion, origen, destino, metodoPago, ubicacionGPS, destinoLat, destinoLng } = req.body;

  if (!clienteUid || !clienteNombre || !origen || !destino || !metodoPago) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const metodosPagoValidos = ['daviplata', 'nequi', 'efectivo'];
  if (!metodosPagoValidos.includes(metodoPago.toLowerCase())) {
    return res.status(400).json({ error: 'Método de pago inválido: ' + metodoPago });
  }

  try {
    const servicioId = uuidv4();

    const servicio = {
      id: servicioId,
      clienteUid,
      clienteNombre,
      clienteCelular:   clienteCelular   || null,
      clienteDireccion: clienteDireccion || null,
      ubicacionGPS:     ubicacionGPS     || null,
      destinoLat:       destinoLat       || null,
      destinoLng:       destinoLng       || null,
      origen,
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

    // ═══ PUSH: Notificar a conductores disponibles ═══
    enviarPushAConductores({
      titulo: '🚕 Nuevo servicio disponible',
      cuerpo: `${clienteNombre} necesita taxi: ${origen} → ${destino}`,
      datos: { tipo: 'nuevo_servicio', servicioId, origen, destino },
      canal: 'servicios',
    }, { disponible: true }).catch(err => console.warn('[PUSH] Error notificando conductores:', err.message));

    // ═══ WEBSOCKET: Notificar en tiempo real a conductores conectados ═══
    notificarNuevoServicio(servicio);

    res.status(201).json({ message: 'Servicio solicitado', servicio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Conductor acepta un servicio
router.put('/aceptar/:servicioId', verifyToken, async (req, res) => {
  const { conductorUid, conductorNombre } = req.body;

  if (!conductorUid || !conductorNombre) {
    return res.status(400).json({ error: 'Faltan datos del conductor' });
  }

  try {
    // Verificar si el conductor tiene un servicio activo
    const activoSnap = await db.collection('servicios')
      .where('conductorUid', '==', conductorUid)
      .where('estado', 'in', ['aceptado', 'en_curso'])
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

    // ═══ PUSH: Notificar al cliente que su taxi fue aceptado ═══
    const servicioData2 = (await ref.get()).data();
    if (servicioData2.clienteUid) {
      enviarPushAUsuario(servicioData2.clienteUid, {
        titulo: '✅ ¡Conductor en camino!',
        cuerpo: `${conductorNombre} aceptó tu servicio. Placa: ${conductorData.placa || 'N/A'}`,
        datos: { tipo: 'servicio_aceptado', servicioId: req.params.servicioId },
        canal: 'servicios',
      }).catch(err => console.warn('[PUSH] Error notificando cliente:', err.message));

      // ═══ WEBSOCKET: Notificar al cliente en tiempo real ═══
      notificarServicioActualizado(servicioData2.clienteUid, {
        id: req.params.servicioId,
        estado: 'aceptado',
        conductorNombre,
        conductorPlaca: conductorData.placa,
        conductorCelular: conductorData.telefono,
      });
    }

    res.json({ message: 'Servicio aceptado', servicioId: req.params.servicioId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Conductor confirma llegada al punto de recogida
router.put('/llegada/:servicioId', verifyToken, async (req, res) => {
  const { conductorUid, ubicacionConductor } = req.body;
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

    res.json({ message: 'Servicio completado', comision: comisionResult, clientePago });
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

    const servicios = snapshot.docs.map(d => d.data());
    res.json(servicios);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Historial de servicios de un usuario
router.get('/historial/:uid/:rol', verifyToken, async (req, res) => {
  const { uid, rol } = req.params;
  const campo = rol === 'conductor' ? 'conductorUid' : 'clienteUid';

  try {
    const snapshot = await db.collection('servicios')
      .where(campo, '==', uid)
      .orderBy('creadoEn', 'desc')
      .get();

    const servicios = snapshot.docs.map(d => d.data());
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
    if (doc.data().estado !== 'completado') {
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

    // Crear notificación para el conductor
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
  try {
    const snapshot = await db.collection('servicios')
      .where('conductorUid', '==', req.params.uid)
      .where('estado', 'in', ['aceptado', 'en_curso'])
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

module.exports = router;
