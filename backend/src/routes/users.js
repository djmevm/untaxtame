const express = require('express');
const router = express.Router();
const { db, auth } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');
const verifyAdmin = require('../middleware/verifyAdmin');

// Listar conductores disponibles
router.get('/conductores/disponibles', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('usuarios')
      .where('rol', '==', 'conductor')
      .where('disponible', '==', true)
      .get();

    const conductores = snapshot.docs.map(d => d.data());
    res.json(conductores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar todos los usuarios (admin)
router.get('/todos', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('usuarios').orderBy('creadoEn', 'desc').get();
    const usuarios = snapshot.docs.map(d => d.data());
    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar disponibilidad conductor
router.put('/conductor/:uid/disponibilidad', verifyToken, async (req, res) => {
  const { disponible } = req.body;
  try {
    await db.collection('usuarios').doc(req.params.uid).update({ disponible });
    res.json({ message: 'Disponibilidad actualizada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aprobar o rechazar conductor (admin)
router.put('/conductor/:uid/verificacion', verifyToken, verifyAdmin, async (req, res) => {
  const { estado } = req.body; // 'aprobado' | 'rechazado'
  if (!['aprobado', 'rechazado'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  try {
    const update = { estadoVerificacion: estado };
    if (estado === 'aprobado') update.disponible = true;
    if (estado === 'rechazado') update.disponible = false;
    await db.collection('usuarios').doc(req.params.uid).update(update);
    res.json({ message: `Conductor ${estado}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar ubicación y estado del conductor
router.put('/conductor/:uid/ubicacion', verifyToken, async (req, res) => {
  const { lat, lng, enServicio } = req.body;
  try {
    const update = {
      ubicacionActual: { lat, lng, actualizadoEn: new Date().toISOString() },
    };
    if (enServicio !== undefined) {
      update.enServicio = enServicio;
      update.disponible = enServicio;
    }
    await db.collection('usuarios').doc(req.params.uid).update(update);
    res.json({ message: 'Ubicación actualizada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener conductores en servicio con ubicación (para cliente y admin)
router.get('/conductores/en-servicio', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('usuarios')
      .where('rol', '==', 'conductor')
      .where('enServicio', '==', true)
      .get();

    const conductores = snapshot.docs.map(d => {
      const data = d.data();
      return {
        uid: data.uid,
        nombre: data.nombre,
        placa: data.placa,
        telefono: data.telefono,
        ubicacionActual: data.ubicacionActual || null,
        fotoPerfil: data.fotoPerfil || null,
      };
    });
    res.json(conductores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bloquear o desbloquear usuario (admin)
router.put('/:uid/bloquear', verifyToken, verifyAdmin, async (req, res) => {
  const { bloqueado, motivo } = req.body;
  const uid = req.params.uid;

  try {
    const userDoc = await db.collection('usuarios').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Usuario no encontrado' });

    const update = {
      bloqueado: !!bloqueado,
      activo: !bloqueado,
      actualizadoEn: new Date().toISOString(),
    };

    if (bloqueado) {
      update.motivoBloqueo = motivo || 'Falta grave';
      update.bloqueadoEn = new Date().toISOString();
      update.bloqueadoPor = req.user.uid;
      // Si es conductor, desactivar disponibilidad
      if (userDoc.data().rol === 'conductor') {
        update.disponible = false;
      }
    } else {
      update.motivoBloqueo = null;
      update.bloqueadoEn = null;
      update.bloqueadoPor = null;
    }

    await db.collection('usuarios').doc(uid).update(update);
    res.json({ message: bloqueado ? 'Usuario bloqueado' : 'Usuario desbloqueado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener notificaciones no leídas
router.get('/notificaciones/:uid', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('notificaciones')
      .where('uid', '==', req.params.uid)
      .where('leida', '==', false)
      .orderBy('creadoEn', 'desc')
      .limit(10)
      .get();

    const notificaciones = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(notificaciones);
  } catch (err) {
    // Fallback sin índice
    try {
      const snapshot = await db.collection('notificaciones')
        .where('uid', '==', req.params.uid)
        .orderBy('creadoEn', 'desc')
        .limit(10)
        .get();
      const notificaciones = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(n => !n.leida);
      res.json(notificaciones);
    } catch (err2) {
      res.status(500).json({ error: err2.message });
    }
  }
});

// Marcar notificación como leída
router.put('/notificaciones/:notifId/leer', verifyToken, async (req, res) => {
  try {
    await db.collection('notificaciones').doc(req.params.notifId).update({ leida: true });
    res.json({ message: 'Notificación leída' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Conductor se re-postula después de ser rechazado
router.put('/conductor/:uid/repostularse', verifyToken, async (req, res) => {
  const uid = req.params.uid;

  // Solo el propio conductor puede re-postularse
  if (req.user.uid !== uid) {
    return res.status(403).json({ error: 'No puedes re-postular a otro usuario' });
  }

  try {
    const userDoc = await db.collection('usuarios').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Usuario no encontrado' });

    const data = userDoc.data();
    if (data.rol !== 'conductor') {
      return res.status(400).json({ error: 'Solo conductores pueden re-postularse' });
    }
    if (data.estadoVerificacion !== 'rechazado') {
      return res.status(400).json({ error: 'Solo puedes re-postularte si fuiste rechazado' });
    }

    await db.collection('usuarios').doc(uid).update({
      estadoVerificacion: 'pendiente',
      repostuladoEn: new Date().toISOString(),
    });

    const updated = await db.collection('usuarios').doc(uid).get();
    res.json({ message: 'Re-postulación enviada. Tus documentos serán revisados nuevamente.', perfil: updated.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar usuario (admin)
router.delete('/:uid', verifyToken, verifyAdmin, async (req, res) => {
  const uid = req.params.uid;

  try {
    const userDoc = await db.collection('usuarios').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Usuario no encontrado' });

    // No permitir eliminar admins
    if (userDoc.data().rol === 'admin') {
      return res.status(403).json({ error: 'No se puede eliminar un administrador' });
    }

    // Eliminar de Firebase Auth
    try {
      await auth.deleteUser(uid);
    } catch (authErr) {
      // Si no existe en Auth, continuar con Firestore
      if (authErr.code !== 'auth/user-not-found') {
        console.error('Error eliminando de Auth:', authErr.message);
      }
    }

    // Eliminar de Firestore
    await db.collection('usuarios').doc(uid).delete();

    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
