const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const hpp = require('hpp');

// ═══ HELMET — Headers de seguridad HTTP ═══
const helmetMiddleware = helmet({
  contentSecurityPolicy: false, // Desactivar CSP para API REST
  crossOriginEmbedderPolicy: false,
});

// ═══ RATE LIMITING — Protección contra fuerza bruta y DDoS ═══

// Límite general: 100 requests por minuto por IP
const limiteGeneral = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Límite estricto para login: 5 intentos por 15 minutos
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Límite para registro: 3 por hora por IP
const limiteRegistro = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Demasiados registros desde esta IP. Intenta en 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Límite para uploads: 20 por hora
const limiteUpload = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiadas subidas de archivos. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Límite para crear admin: 2 por día por IP
const limiteAdmin = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 2,
  message: { error: 'Límite de creación de administradores alcanzado.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ═══ HPP — Protección contra HTTP Parameter Pollution ═══
const hppMiddleware = hpp();

// ═══ SANITIZACIÓN — Limpiar inputs maliciosos ═══
function sanitizeInput(req, res, next) {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const clean = {};
    for (const [key, value] of Object.entries(obj)) {
      // Bloquear keys que empiecen con $ (inyección NoSQL)
      if (key.startsWith('$')) continue;
      // Bloquear keys con puntos (traversal de objetos)
      if (key.includes('.') && key !== 'FIREBASE_PRIVATE_KEY') continue;
      if (typeof value === 'string') {
        // Remover tags HTML/script
        clean[key] = value.replace(/<script[^>]*>.*?<\/script>/gi, '')
                         .replace(/<[^>]*>/g, '')
                         .trim();
      } else if (typeof value === 'object' && value !== null) {
        clean[key] = sanitize(value);
      } else {
        clean[key] = value;
      }
    }
    return clean;
  };

  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);
  next();
}

// ═══ LOGGING DE SEGURIDAD ═══
function securityLogger(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const method = req.method;
  const url = req.originalUrl;

  // Log de intentos sospechosos
  if (url.includes('..') || url.includes('<script') || url.includes('SELECT') || url.includes('DROP')) {
    console.warn('[SEGURIDAD] Intento sospechoso:', { ip, method, url, timestamp: new Date().toISOString() });
    return res.status(403).json({ error: 'Solicitud bloqueada por seguridad' });
  }

  // Log de rutas admin
  if (url.includes('/admin') || url.includes('/config')) {
    console.log('[ADMIN]', method, url, 'IP:', ip);
  }

  next();
}

// ═══ CORS CONFIGURADO ═══
function corsConfig() {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3001', 'http://192.168.0.101:3001'];

  return {
    origin: function(origin, callback) {
      // Permitir requests sin origin (apps móviles, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        console.warn('[CORS] Origen bloqueado:', origin);
        callback(new Error('No permitido por CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  };
}

module.exports = {
  helmetMiddleware,
  limiteGeneral,
  limiteLogin,
  limiteRegistro,
  limiteUpload,
  limiteAdmin,
  hppMiddleware,
  sanitizeInput,
  securityLogger,
  corsConfig,
};
