const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');
const { enviarPushAConductores } = require('../services/pushNotifications');
const { notificarCodigoRadio } = require('../services/websocket');

// ═══ CÓDIGOS DE RADIO 20-X ═══
// Sistema de comunicación por voz para conductores
// Se refleja en tiempo real en el panel admin

const CODIGOS_VALIDOS = {
  '20-1': { label: '🚕 Tomé el servicio', prioridad: 'info', categoria: 'operativo' },
  '20-2': { label: '📍 Ya recogí el pasajero', prioridad: 'info', categoria: 'operativo' },
  '20-3': { label: '✅ Terminé el servicio', prioridad: 'info', categoria: 'operativo' },
  '20-4': { label: '❌ Servicio cancelado', prioridad: 'media', categoria: 'operativo' },
  '20-13': { label: '🔧 Estoy varado', prioridad: 'media', categoria: 'asistencia' },
  '20-15': { label: '⚠️ Carrera sospechosa', prioridad: 'alta', categoria: 'seguridad' },
  '20-20': { label: '💀 Muerto en la vía', prioridad: 'critica', categoria: 'emergencia' },
};

// Reportar código de radio
router.post('/codigo', verifyToken, async (req, res) => {
  const { codigo, accion, label, servicioId, ubicacionLat, ubicacionLng } = req.body;
  const uid = req.user.uid;

  if (!codigo) {
    return res.status(400).json({ error: 'Código requerido' });
  }

  const codigoInfo = CODIGOS_VALIDOS[codigo];
  if (!codigoInfo) {
    return res.status(400).json({ error: 'Código de radio no válido' });
  }

  try {
    // Obtener datos del usuario
    const userDoc = await db.collection('usuarios').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Obtener datos del servicio si existe
    let servicioData = null;
    if (servicioId) {
      const servicioDoc = await db.collection('servicios').doc(servicioId).get();
      if (servicioDoc.exists) servicioData = servicioDoc.data();
    }

    // Crear registro del código de radio
    const registro = {
      uid,
      nombre: userData.nombre || 'Desconocido',
      rol: userData.rol || 'conductor',
      telefono: userData.telefono || null,
      placa: userData.placa || null,
      codigo,
      codigoLabel: codigoInfo.label,
      accion: accion || codigo,
      prioridad: codigoInfo.prioridad,
      categoria: codigoInfo.categoria,
      servicioId: servicioId || null,
      ubicacion: ubicacionLat && ubicacionLng
        ? { lat: parseFloat(ubicacionLat), lng: parseFloat(ubicacionLng) }
        : null,
      servicio: servicioData ? {
        clienteNombre: servicioData.clienteNombre,
        origen: servicioData.origen,
        destino: servicioData.destino,
      } : null,
      estado: 'activo',
      creadoEn: new Date().toISOString(),
      atendido: false,
      atendidoPor: null,
      atendidoEn: null,
      nota: null,
    };

    const docRef = await db.collection('codigos_radio').add(registro);

    // Si es código de seguridad o emergencia, crear alerta adicional
    if (['seguridad', 'emergencia'].includes(codigoInfo.categoria)) {
      await db.collection('alertas_conductores').add({
        emergenciaId: docRef.id,
        tipoEmergencia: codigo,
        mensaje: `📻 ${codigo}: ${codigoInfo.label} — ${userData.nombre || 'Conductor'}`,
        nombre: userData.nombre,
        ubicacion: registro.ubicacion,
        servicio: registro.servicio,
        creadoEn: new Date().toISOString(),
        resuelta: false,
      });

      // ═══ PUSH: Alertar a TODOS los conductores (código de seguridad/emergencia) ═══
      enviarPushAConductores({
        titulo: `📻 ALERTA: ${codigo}`,
        cuerpo: `${codigoInfo.label} — ${userData.nombre || 'Conductor'} ${userData.placa ? '(' + userData.placa + ')' : ''}`,
        datos: { tipo: 'radio', codigo, codigoId: docRef.id, prioridad: 'max' },
        canal: 'radio',
      }).catch(err => console.warn('[PUSH] Error notificando radio:', err.message));

      // ═══ WEBSOCKET: Alertar en tiempo real ═══
      notificarCodigoRadio({
        codigoId: docRef.id,
        codigo,
        label: codigoInfo.label,
        nombre: userData.nombre,
        placa: userData.placa,
        ubicacion: registro.ubicacion,
        prioridad: codigoInfo.prioridad,
      });
    }

    // Si es 20-20 (muerto en vía), crear emergencia automática
    if (codigo === '20-20') {
      await db.collection('emergencias').add({
        uid,
        nombre: userData.nombre || 'Desconocido',
        rol: userData.rol,
        telefono: userData.telefono,
        servicioId: servicioId || null,
        tipoEmergencia: 'muerto_via',
        ubicacion: registro.ubicacion,
        mensaje: `💀 CÓDIGO 20-20: Muerto en la vía — Reportado por ${userData.nombre}`,
        estado: 'activa',
        creadoEn: new Date().toISOString(),
        codigoRadioId: docRef.id,
      });
    }

    // Si es 20-15 (carrera sospechosa), crear emergencia
    if (codigo === '20-15') {
      await db.collection('emergencias').add({
        uid,
        nombre: userData.nombre || 'Desconocido',
        rol: userData.rol,
        telefono: userData.telefono,
        servicioId: servicioId || null,
        tipoEmergencia: 'sospechosa',
        ubicacion: registro.ubicacion,
        mensaje: `⚠️ CÓDIGO 20-15: Carrera sospechosa — ${userData.nombre} (${userData.placa || 'Sin placa'})`,
        estado: 'activa',
        creadoEn: new Date().toISOString(),
        codigoRadioId: docRef.id,
      });
    }

    res.status(201).json({
      message: `Código ${codigo} reportado exitosamente`,
      id: docRef.id,
      codigo,
      label: codigoInfo.label,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener códigos de radio activos (panel admin)
router.get('/activos', verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection('usuarios').doc(req.user.uid).get();
    if (!userDoc.exists || userDoc.data().rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const snapshot = await db.collection('codigos_radio')
      .orderBy('creadoEn', 'desc')
      .limit(100)
      .get();

    const codigos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(codigos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Marcar código como atendido (admin)
router.put('/atender/:id', verifyToken, async (req, res) => {
  const { nota } = req.body;

  try {
    const userDoc = await db.collection('usuarios').doc(req.user.uid).get();
    if (!userDoc.exists || userDoc.data().rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    await db.collection('codigos_radio').doc(req.params.id).update({
      atendido: true,
      atendidoPor: req.user.uid,
      atendidoEn: new Date().toISOString(),
      nota: nota || '',
      estado: 'atendido',
    });

    // También marcar alertas de conductores asociadas como resueltas
    const alertasSnap = await db.collection('alertas_conductores')
      .where('emergenciaId', '==', req.params.id)
      .get();
    if (!alertasSnap.empty) {
      const batch = db.batch();
      alertasSnap.docs.forEach(doc => {
        batch.update(doc.ref, { resuelta: true, resueltaEn: new Date().toISOString() });
      });
      await batch.commit();
    }

    // También resolver emergencias asociadas
    const emergSnap = await db.collection('emergencias')
      .where('codigoRadioId', '==', req.params.id)
      .get();
    if (!emergSnap.empty) {
      const batch = db.batch();
      emergSnap.docs.forEach(doc => {
        batch.update(doc.ref, { estado: 'resuelta', resueltaEn: new Date().toISOString() });
      });
      await batch.commit();
    }

    res.json({ message: 'Código marcado como atendido' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Estadísticas de códigos (admin)
router.get('/estadisticas', verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection('usuarios').doc(req.user.uid).get();
    if (!userDoc.exists || userDoc.data().rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const snapshot = await db.collection('codigos_radio')
      .where('creadoEn', '>=', hoy.toISOString())
      .get();

    const stats = {};
    snapshot.docs.forEach(d => {
      const data = d.data();
      stats[data.codigo] = (stats[data.codigo] || 0) + 1;
    });

    const pendientes = snapshot.docs.filter(d => !d.data().atendido).length;

    res.json({
      total: snapshot.size,
      pendientes,
      porCodigo: stats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
