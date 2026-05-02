const { db } = require('../firebase');

// Middleware que verifica que el usuario autenticado sea administrador
// Se usa DESPUÉS de verifyToken (req.user ya existe)
const verifyAdmin = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const doc = await db.collection('usuarios').doc(uid).get();

    if (!doc.exists || doc.data().rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado: se requiere rol de administrador' });
    }

    next();
  } catch (err) {
    res.status(500).json({ error: 'Error al verificar permisos de administrador' });
  }
};

module.exports = verifyAdmin;
