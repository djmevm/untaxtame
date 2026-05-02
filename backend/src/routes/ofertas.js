const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');

// Conductor hace una oferta para un servicio
router.post('/:servicioId', verifyToken, async (req, res) => {
  const { servicioId } = req.params;
  const { conductorUid, conductorNombre, monto, mensaje } = req.body;

  if (!conductorUid || !conductorNombre || !monto) {
    return res.status(400).json({ error: 'Se requiere conductorUid, conductorNombre y monto' });
  }

  if (monto < 8000) {
    return res.status(400).json({ error: 'La tarifa mínima es $8,000 COP' });
  }

  try {
    // Verificar que el conductor no tenga un servicio activo
    const activoSnap = await db.collection('servicios')
      .where('conductorUid', '==', conductorUid)
      .where('estado', 'in', ['aceptado', 'en_curso'])
      .limit(1)
      .get();

    if (!activoSnap.empty) {
      const activo = activoSnap.docs[0].data();
      return res.status(403).json({
        error: 'Ya tienes un servicio en curso. Debes completarlo o cancelarlo antes de ofertar otro.',
        servicioActivoId: activo.id,
      });
    }

    // Verificar si el conductor está penalizado
    const conductorPenDoc = await db.collection('usuarios').doc(conductorUid).get();
    if (conductorPenDoc.exists) {
      const cData = conductorPenDoc.data();
      if (cData.penalizado && cData.penalizadoHasta) {
        if (new Date(cData.penalizadoHasta) > new Date()) {
          const horasRestantes = Math.ceil((new Date(cData.penalizadoHasta) - new Date()) / (1000 * 60 * 60));
          return res.status(403).json({
            error: 'Estás penalizado por cancelaciones frecuentes. Podrás volver a ofertar en ' + horasRestantes + ' hora' + (horasRestantes > 1 ? 's' : '') + '.',
            penalizado: true,
            penalizadoHasta: cData.penalizadoHasta,
          });
        } else {
          // Penalización expirada, limpiar
          await db.collection('usuarios').doc(conductorUid).update({
            penalizado: false, penalizadoHasta: null, motivoPenalizacion: null,
          });
        }
      }
    }

    // Verificar saldo de billetera
    const configDoc = await db.collection('configuracion').doc('billetera').get();
    const billeteraConfig = configDoc.exists ? configDoc.data() : { activo: false };
    if (billeteraConfig.activo) {
      const saldoDoc = await db.collection('billeteras').doc(conductorUid).get();
      const saldo = saldoDoc.exists ? saldoDoc.data().saldo : 0;
      if (saldo <= 0) {
        return res.status(403).json({
          error: 'Tu saldo es $0. Recarga tu billetera para poder ofertar servicios.',
          saldo: 0,
        });
      }
    }

    // Verificar que el servicio existe y está pendiente
    const servicioRef = db.collection('servicios').doc(servicioId);
    const servicioDoc = await servicioRef.get();

    if (!servicioDoc.exists) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    if (servicioDoc.data().estado !== 'pendiente') {
      return res.status(400).json({ error: 'El servicio ya no está disponible' });
    }

    // Verificar que el conductor no haya ofertado ya
    const ofertaExistente = await db.collection('servicios').doc(servicioId)
      .collection('ofertas')
      .where('conductorUid', '==', conductorUid)
      .get();

    if (!ofertaExistente.empty) {
      return res.status(400).json({ error: 'Ya hiciste una oferta para este servicio' });
    }

    // Obtener datos del conductor
    const conductorDoc = await db.collection('usuarios').doc(conductorUid).get();
    const conductorData = conductorDoc.exists ? conductorDoc.data() : {};

    const oferta = {
      conductorUid,
      conductorNombre,
      conductorPlaca: conductorData.placa || null,
      conductorCelular: conductorData.telefono || null,
      monto: parseInt(monto),
      mensaje: mensaje || '',
      estado: 'pendiente', // pendiente | aceptada | rechazada
      creadoEn: new Date().toISOString(),
    };

    const docRef = await db.collection('servicios').doc(servicioId)
      .collection('ofertas').add(oferta);

    // Actualizar contador de ofertas en el servicio
    const ofertasSnapshot = await db.collection('servicios').doc(servicioId)
      .collection('ofertas').get();

    await servicioRef.update({
      totalOfertas: ofertasSnapshot.size,
      actualizadoEn: new Date().toISOString(),
    });

    res.status(201).json({ message: 'Oferta enviada', ofertaId: docRef.id, oferta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener ofertas de un servicio (para el cliente)
router.get('/:servicioId', verifyToken, async (req, res) => {
  const { servicioId } = req.params;

  try {
    const snapshot = await db.collection('servicios').doc(servicioId)
      .collection('ofertas')
      .orderBy('monto', 'asc')
      .get();

    const ofertas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(ofertas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cliente acepta una oferta
router.put('/:servicioId/aceptar/:ofertaId', verifyToken, async (req, res) => {
  const { servicioId, ofertaId } = req.params;

  try {
    const servicioRef = db.collection('servicios').doc(servicioId);
    const servicioDoc = await servicioRef.get();

    if (!servicioDoc.exists) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    if (servicioDoc.data().estado !== 'pendiente') {
      return res.status(400).json({ error: 'El servicio ya no está disponible' });
    }

    const ofertaRef = db.collection('servicios').doc(servicioId)
      .collection('ofertas').doc(ofertaId);
    const ofertaDoc = await ofertaRef.get();

    if (!ofertaDoc.exists) {
      return res.status(404).json({ error: 'Oferta no encontrada' });
    }

    const oferta = ofertaDoc.data();

    // Marcar oferta como aceptada
    await ofertaRef.update({ estado: 'aceptada' });

    // Rechazar las demás ofertas
    const todasOfertas = await db.collection('servicios').doc(servicioId)
      .collection('ofertas').get();
    
    const batch = db.batch();
    todasOfertas.docs.forEach(doc => {
      if (doc.id !== ofertaId) {
        batch.update(doc.ref, { estado: 'rechazada' });
      }
    });
    await batch.commit();

    // Actualizar servicio con el conductor y la tarifa acordada
    await servicioRef.update({
      conductorUid: oferta.conductorUid,
      conductorNombre: oferta.conductorNombre,
      conductorPlaca: oferta.conductorPlaca,
      conductorCelular: oferta.conductorCelular,
      tarifaAcordada: oferta.monto,
      estado: 'aceptado',
      actualizadoEn: new Date().toISOString(),
    });

    // Marcar conductor como no disponible
    await db.collection('usuarios').doc(oferta.conductorUid).update({ disponible: false });

    res.json({
      message: 'Oferta aceptada',
      conductor: oferta.conductorNombre,
      tarifa: oferta.monto,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
