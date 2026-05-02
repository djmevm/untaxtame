const express = require('express');
const router = express.Router();
const { db, auth } = require('../firebase');

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

module.exports = router;
