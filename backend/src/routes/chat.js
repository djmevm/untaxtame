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
    // Verificar que el servicio existe y el usuario es parte de él
    const servicioRef = db.collection('servicios').doc(servicioId);
    const servicioDoc = await servicioRef.get();

    if (!servicioDoc.exists) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    const servicio = servicioDoc.data();
    if (servicio.clienteUid !== uid && servicio.conductorUid !== uid) {
      return res.status(403).json({ error: 'No tienes acceso a este chat' });
    }

    const mensaje = {
      uid,
      nombre: servicio.clienteUid === uid ? servicio.clienteNombre : servicio.conductorNombre,
      rol: servicio.clienteUid === uid ? 'cliente' : 'conductor',
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
    if (servicio.clienteUid !== uid && servicio.conductorUid !== uid) {
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
