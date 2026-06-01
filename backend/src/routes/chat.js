const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');

// Enviar mensaje en un servicio
router.post('/:servicioId/mensaje', verifyToken, async (req, res) => {
  const { servicioId } = req.params;
  const { texto } = req.body;
  const uid = req.user.uid;

  if (!texto || !texto.trim()) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  }

  if (texto.length > 500) {
    return res.status(400).json({ error: 'El mensaje no puede superar 500 caracteres' });
  }

  try {
    // Verificar que el servicio existe
    const servicioRef = db.collection('servicios').doc(servicioId);
    const servicioDoc = await servicioRef.get();

    if (!servicioDoc.exists) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    const servicio = servicioDoc.data();

    // Verificar acceso: cliente, conductor o admin
    const userDoc = await db.collection('usuarios').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const esAdmin = userData.rol === 'admin';

    if (!esAdmin && servicio.clienteUid !== uid && servicio.conductorUid !== uid) {
      return res.status(403).json({ error: 'No tienes acceso a este chat' });
    }

    // Determinar rol y nombre del remitente
    let rol = 'desconocido';
    let nombre = 'Usuario';

    if (esAdmin) {
      rol = 'admin';
      nombre = 'Administrador';
    } else if (servicio.clienteUid === uid) {
      rol = 'cliente';
      nombre = servicio.clienteNombre;
    } else {
      rol = 'conductor';
      nombre = servicio.conductorNombre;
    }

    const mensaje = {
      uid,
      nombre,
      rol,
      texto: texto.trim(),
      creadoEn: new Date().toISOString(),
    };

    await db.collection('servicios').doc(servicioId)
      .collection('mensajes').add(mensaje);

    // Actualizar timestamp del último mensaje en el servicio
    await servicioRef.update({
      ultimoMensaje: texto.trim().substring(0, 50),
      ultimoMensajeEn: new Date().toISOString(),
    });

    res.status(201).json({ message: 'Mensaje enviado', mensaje });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener mensajes de un servicio
router.get('/:servicioId/mensajes', verifyToken, async (req, res) => {
  const { servicioId } = req.params;
  const uid = req.user.uid;

  try {
    const servicioDoc = await db.collection('servicios').doc(servicioId).get();
    if (!servicioDoc.exists) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    const servicio = servicioDoc.data();

    // Permitir acceso al cliente, conductor o admin
    const userDoc = await db.collection('usuarios').doc(uid).get();
    const esAdmin = userDoc.exists && userDoc.data().rol === 'admin';

    if (!esAdmin && servicio.clienteUid !== uid && servicio.conductorUid !== uid) {
      return res.status(403).json({ error: 'No tienes acceso a este chat' });
    }

    const snapshot = await db.collection('servicios').doc(servicioId)
      .collection('mensajes')
      .orderBy('creadoEn', 'asc')
      .get();

    const mensajes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(mensajes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


// ═══ CHAT DIRECTO ADMIN → USUARIO ═══

// Enviar mensaje directo a un usuario
router.post('/directo/:uid/mensaje', verifyToken, async (req, res) => {
  const { uid } = req.params;
  const { texto } = req.body;
  const senderUid = req.user.uid;

  if (!texto || !texto.trim()) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  }

  try {
    const senderDoc = await db.collection('usuarios').doc(senderUid).get();
    const senderData = senderDoc.exists ? senderDoc.data() : {};

    const mensaje = {
      uid: senderUid,
      nombre: senderData.rol === 'admin' ? 'Administrador' : (senderData.nombre || 'Usuario'),
      rol: senderData.rol || 'usuario',
      texto: texto.trim(),
      creadoEn: new Date().toISOString(),
    };

    // Si es admin, guarda en el chat del usuario destino
    // Si es usuario, guarda en su propio chat (para que admin lo vea)
    const chatUid = senderData.rol === 'admin' ? uid : senderUid;
    await db.collection('chats_directos').doc(chatUid).collection('mensajes').add(mensaje);

    res.status(201).json({ message: 'Mensaje enviado', mensaje });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener mensajes directos con un usuario
router.get('/directo/:uid/mensajes', verifyToken, async (req, res) => {
  const { uid } = req.params;

  try {
    const snapshot = await db.collection('chats_directos').doc(uid)
      .collection('mensajes')
      .orderBy('creadoEn', 'asc')
      .limit(100)
      .get();

    const mensajes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(mensajes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
