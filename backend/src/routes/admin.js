const express = require('express');
const router = express.Router();
const { db, auth } = require('../firebase');

// ═══ PRESENCIA DE ADMINS EN LÍNEA ═══
const adminsPresencia = new Map(); // uid → { nombre, timestamp }

// Registrar presencia (cada admin llama esto cada 30 seg)
router.post('/presencia', async (req, res) => {
  const { uid, nombre } = req.body;
  if (!uid) return res.status(400).json({ error: 'Se requiere uid' });
  adminsPresencia.set(uid, { uid, nombre: nombre || 'Admin', timestamp: Date.now() });
  res.json({ ok: true });
});

// Consultar quién está en línea (activo en los últimos 60 seg)
router.get('/en-linea', (req, res) => {
  const ahora = Date.now();
  const enLinea = [];
  adminsPresencia.forEach((val, key) => {
    if (ahora - val.timestamp < 60000) { // Activo en último minuto
      enLinea.push(val);
    } else {
      adminsPresencia.delete(key); // Limpiar inactivos
    }
  });
  res.json(enLinea);
});

// Crear usuario administrador (protegido por clave secreta)
// Usar una sola vez para crear el primer admin
// POST /api/admin/crear
// Body: { email, password, nombre, claveSecreta }
router.post('/crear', async (req, res) => {
  const { email, password, nombre, claveSecreta } = req.body;

  // Verificar clave secreta del .env
  const claveValida = process.env.ADMIN_SECRET_KEY || 'untaxtame-admin-2024';
  if (claveSecreta !== claveValida) {
    return res.status(403).json({ error: 'Clave secreta inválida' });
  }

  if (!email || !password || !nombre) {
    return res.status(400).json({ error: 'Se requiere email, password y nombre' });
  }

  try {
    // Crear usuario en Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: nombre,
    });

    // Crear documento en Firestore con rol admin
    const adminData = {
      uid: userRecord.uid,
      nombre,
      telefono: '',
      rol: 'admin',
      activo: true,
      creadoEn: new Date().toISOString(),
    };

    await db.collection('usuarios').doc(userRecord.uid).set(adminData);

    res.status(201).json({
      message: 'Administrador creado exitosamente',
      admin: { uid: userRecord.uid, email, nombre, rol: 'admin' },
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Ya existe un usuario con ese correo' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Test push notification (admin)
router.post('/test-push/:uid', async (req, res) => {
  const { uid } = req.params;
  try {
    const userDoc = await db.collection('usuarios').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Usuario no encontrado' });
    const pushToken = userDoc.data().pushToken;
    if (!pushToken) return res.status(400).json({ error: 'Sin push token', uid });

    const fetch = require('node-fetch');
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: pushToken,
        title: 'TEST UntaXtame',
        body: 'Esta es una prueba de notificacion push',
        sound: 'default',
        priority: 'high',
      }),
    });
    const result = await response.json();
    res.json({ message: 'Push enviado', token: pushToken, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar servicios ofrecidos de un conductor (admin)
router.put('/conductor/:uid/servicios', async (req, res) => {
  const { uid } = req.params;
  const { serviciosOfrecidos } = req.body;

  if (!Array.isArray(serviciosOfrecidos)) {
    return res.status(400).json({ error: 'serviciosOfrecidos debe ser un array' });
  }

  try {
    await db.collection('usuarios').doc(uid).update({
      serviciosOfrecidos,
      serviciosActualizadoEn: new Date().toISOString(),
    });
    res.json({ message: 'Servicios actualizados', serviciosOfrecidos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enviar alerta push a todos los conductores disponibles (admin)
router.post('/alerta-conductores', async (req, res) => {
  const { titulo, mensaje, servicioId } = req.body;
  if (!mensaje) return res.status(400).json({ error: 'Se requiere un mensaje' });

  try {
    const { enviarPushAConductores } = require('../services/pushNotifications');
    await enviarPushAConductores({
      titulo: titulo || '🚕 Nuevo servicio disponible',
      cuerpo: mensaje,
      datos: { tipo: 'alerta_admin', servicioId: servicioId || '' }
    });

    // Contar conductores disponibles con token
    const snap = await db.collection('usuarios')
      .where('rol', '==', 'conductor')
      .where('disponible', '==', true)
      .get();
    let conToken = 0;
    snap.forEach(doc => { if (doc.data().pushToken) conToken++; });

    res.json({ message: 'Alerta enviada', conductoresNotificados: conToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Forzar cancelación de servicios pendientes expirados (admin)
router.post('/cancelar-expirados', async (req, res) => {
  try {
    const { cancelarServiciosPendientesExpirados } = require('../services/autoCancelacion');
    await cancelarServiciosPendientesExpirados();
    res.json({ message: 'Cancelación de servicios expirados ejecutada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Push directo al cliente de un servicio
router.post('/push-cliente/:uid', async (req, res) => {
  const { titulo, mensaje, servicioId } = req.body;
  if (!mensaje) return res.status(400).json({ error: 'Se requiere mensaje' });
  try {
    const { enviarPushAUsuario } = require('../services/pushNotifications');
    await enviarPushAUsuario(req.params.uid, {
      titulo: titulo || '🚕 Tienes una oferta esperando',
      cuerpo: mensaje,
      datos: { tipo: 'recordatorio_oferta', servicioId: servicioId || '' }
    });
    res.json({ message: 'Push enviado al cliente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
