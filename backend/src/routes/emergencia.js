const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');

// Reportar emergencia SOS
router.post('/sos', verifyToken, async (req, res) => {
  const { servicioId, ubicacionLat, ubicacionLng, mensaje, tipoEmergencia } = req.body;
  const uid = req.user.uid;

  try {
    const userDoc = await db.collection('usuarios').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    let servicioData = null;
    if (servicioId) {
      const servicioDoc = await db.collection('servicios').doc(servicioId).get();
      if (servicioDoc.exists) servicioData = servicioDoc.data();
    }

    const emergencia = {
      uid,
      nombre: userData.nombre || 'Desconocido',
      rol: userData.rol || 'desconocido',
      telefono: userData.telefono || null,
      servicioId: servicioId || null,
      tipoEmergencia: tipoEmergencia || 'otro',
      ubicacion: ubicacionLat && ubicacionLng
        ? { lat: parseFloat(ubicacionLat), lng: parseFloat(ubicacionLng) }
        : null,
      mensaje: mensaje || 'Emergencia SOS',
      estado: 'activa',
      creadoEn: new Date().toISOString(),
      servicio: servicioData ? {
        clienteNombre: servicioData.clienteNombre,
        conductorNombre: servicioData.conductorNombre,
        origen: servicioData.origen,
        destino: servicioData.destino,
        conductorPlaca: servicioData.conductorPlaca,
      } : null,
    };

    const docRef = await db.collection('emergencias').add(emergencia);

    // Marcar servicio como en emergencia
    if (servicioId) {
      await db.collection('servicios').doc(servicioId).update({
        emergencia: true,
        tipoEmergencia: tipoEmergencia || 'otro',
        emergenciaId: docRef.id,
        actualizadoEn: new Date().toISOString(),
      });
    }

    // Crear alerta para conductores cercanos
    await db.collection('alertas_conductores').add({
      emergenciaId: docRef.id,
      tipoEmergencia: tipoEmergencia || 'otro',
      mensaje: mensaje || 'Emergencia SOS',
      nombre: userData.nombre,
      ubicacion: emergencia.ubicacion,
      servicio: emergencia.servicio,
      creadoEn: new Date().toISOString(),
      resuelta: false,
    });

    // Push SOS a todos los conductores
    try {
      const { enviarPushAConductores } = require('../services/pushNotifications');
      enviarPushAConductores({ titulo: 'EMERGENCIA SOS', cuerpo: (userData.nombre || 'Usuario') + ': ' + (mensaje || 'SOS'), datos: { tipo: 'emergencia', emergenciaId: docRef.id } });
    } catch (e) {}

    // Si es cliente: avisar contactos de confianza + link de seguimiento
    let contactosNotificados = 0;
    if ((userData.rol || '') === 'cliente') {
      try {
        const { notificarContactosConfianza } = require('../services/contactosConfianza');
        let link = '';
        if (servicioId && servicioData) {
          const base = process.env.PUBLIC_BASE_URL || 'https://untaxtame-production.up.railway.app';
          let token = servicioData.shareToken;
          if (!token) {
            const { v4: uuidv4 } = require('uuid');
            token = uuidv4().replace(/-/g, '').slice(0, 16);
            await db.collection('servicios').doc(servicioId).update({
              shareToken: token,
              compartidoEn: new Date().toISOString(),
            });
          }
          link = `${base.replace(/\/$/, '')}/seguimiento/${token}`;
        }
        const maps = emergencia.ubicacion
          ? `https://www.google.com/maps?q=${emergencia.ubicacion.lat},${emergencia.ubicacion.lng}`
          : '';
        const msg =
          `🚨 *SOS de ${(userData.nombre || 'un pasajero')}*\n\n` +
          `${mensaje || 'Emergencia'}\n` +
          (servicioData ? `🚕 Conductor: ${servicioData.conductorNombre || '—'}\n🚗 Placa: ${servicioData.conductorPlaca || '—'}\n📍 ${servicioData.origen || ''} → ${servicioData.destino || ''}\n` : '') +
          (maps ? `\n📌 Ubicación: ${maps}\n` : '') +
          (link ? `\n🔗 Seguir viaje: ${link}\n` : '') +
          `\nSi no puedes contactarle, llama al 123.`;
        contactosNotificados = await notificarContactosConfianza(uid, msg);
      } catch (e) {
        console.error('[sos] contactos:', e.message);
      }
    }

    res.status(201).json({
      message: 'Emergencia reportada. La plataforma y conductores han sido alertados.',
      emergenciaId: docRef.id,
      contactosNotificados,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener alertas activas para conductores
router.get('/alertas-conductores', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('alertas_conductores')
      .orderBy('creadoEn', 'desc')
      .limit(20)
      .get();

    const alertas = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => a.resuelta === false);

    res.json(alertas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar emergencias (admin)
router.get('/activas', verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection('usuarios').doc(req.user.uid).get();
    if (!userDoc.exists || userDoc.data().rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const snapshot = await db.collection('emergencias')
      .orderBy('creadoEn', 'desc')
      .limit(50)
      .get();

    const emergencias = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(emergencias);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Conductor retira su propia emergencia
router.put('/retirar/:emergenciaId', verifyToken, async (req, res) => {
  try {
    const emergenciaRef = db.collection('emergencias').doc(req.params.emergenciaId);
    const emergenciaDoc = await emergenciaRef.get();

    if (!emergenciaDoc.exists) return res.status(404).json({ error: 'Emergencia no encontrada' });

    // Solo el creador puede retirarla
    if (emergenciaDoc.data().uid !== req.user.uid) {
      return res.status(403).json({ error: 'Solo puedes retirar tus propias alertas' });
    }

    await emergenciaRef.update({
      estado: 'retirada',
      retiradaEn: new Date().toISOString(),
    });

    // Marcar alertas de conductores como resueltas
    const alertasSnapshot = await db.collection('alertas_conductores')
      .where('emergenciaId', '==', req.params.emergenciaId)
      .get();

    if (!alertasSnapshot.empty) {
      const batch = db.batch();
      alertasSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { resuelta: true, resueltaEn: new Date().toISOString() });
      });
      await batch.commit();
    }

    res.json({ message: 'Alerta retirada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener mis emergencias activas
router.get('/mis-alertas', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('emergencias')
      .where('uid', '==', req.user.uid)
      .where('estado', '==', 'activa')
      .get();

    const alertas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(alertas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resolver emergencia (admin)
router.put('/:emergenciaId/resolver', verifyToken, async (req, res) => {
  const { nota } = req.body;

  try {
    const userDoc = await db.collection('usuarios').doc(req.user.uid).get();
    if (!userDoc.exists || userDoc.data().rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    await db.collection('emergencias').doc(req.params.emergenciaId).update({
      estado: 'resuelta',
      nota: nota || '',
      resueltaPor: req.user.uid,
      resueltaEn: new Date().toISOString(),
    });

    // Marcar TODAS las alertas de conductores con este emergenciaId como resueltas
    const alertasSnapshot = await db.collection('alertas_conductores')
      .where('emergenciaId', '==', req.params.emergenciaId)
      .get();
    
    if (!alertasSnapshot.empty) {
      const batch = db.batch();
      alertasSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { resuelta: true, resueltaEn: new Date().toISOString() });
      });
      await batch.commit();
    }

    res.json({ message: 'Emergencia marcada como resuelta' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
