const { auth, db } = require('../firebase');

// Registro de intentos fallidos por IP
const intentosFallidos = new Map();
const BLOQUEO_MINUTOS = 30;
const MAX_INTENTOS = 20;

const verifyToken = async (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;

  // Verificar si la IP está bloqueada por intentos fallidos
  const registro = intentosFallidos.get(ip);
  if (registro && registro.bloqueadoHasta && new Date() < registro.bloqueadoHasta) {
    const minRestantes = Math.ceil((registro.bloqueadoHasta - new Date()) / 60000);
    return res.status(429).json({ error: 'IP bloqueada temporalmente. Intenta en ' + minRestantes + ' minutos.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    registrarFallo(ip);
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.split('Bearer ')[1];
  if (!token || token.length < 100) {
    registrarFallo(ip);
    return res.status(401).json({ error: 'Token inválido' });
  }

  try {
    const decoded = await auth.verifyIdToken(token);

    // Verificar que el usuario no esté bloqueado
    const userDoc = await db.collection('usuarios').doc(decoded.uid).get();
    if (userDoc.exists && userDoc.data().bloqueado) {
      return res.status(403).json({
        error: 'Tu cuenta ha sido bloqueada. Motivo: ' + (userDoc.data().motivoBloqueo || 'Contacta a soporte.'),
      });
    }

    req.user = decoded;
    // Limpiar intentos fallidos al autenticarse correctamente
    intentosFallidos.delete(ip);
    next();
  } catch (err) {
    registrarFallo(ip);
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expirado. Inicia sesión de nuevo.' });
    }
    res.status(401).json({ error: 'Token inválido' });
  }
};

function registrarFallo(ip) {
  const registro = intentosFallidos.get(ip) || { intentos: 0, bloqueadoHasta: null };
  registro.intentos++;
  if (registro.intentos >= MAX_INTENTOS) {
    registro.bloqueadoHasta = new Date(Date.now() + BLOQUEO_MINUTOS * 60 * 1000);
    console.warn('[SEGURIDAD] IP bloqueada por intentos fallidos:', ip, '— Intentos:', registro.intentos);
  }
  intentosFallidos.set(ip, registro);
}

// Limpiar registros viejos cada hora
setInterval(() => {
  const ahora = new Date();
  for (const [ip, reg] of intentosFallidos.entries()) {
    if (reg.bloqueadoHasta && ahora > reg.bloqueadoHasta) {
      intentosFallidos.delete(ip);
    }
  }
}, 60 * 60 * 1000);

module.exports = verifyToken;
