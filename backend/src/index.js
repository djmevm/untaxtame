require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Crear carpeta uploads si no existe (necesario en Railway)
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Middleware de seguridad
const {
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
} = require('./middleware/security');

// Rutas
const authRoutes = require('./routes/auth');
const serviceRoutes = require('./routes/services');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');
const emergenciaRoutes = require('./routes/emergencia');
const ofertasRoutes = require('./routes/ofertas');
const billeteraRoutes = require('./routes/billetera');

const app = express();

// ═══ SEGURIDAD — Capa 1: Headers HTTP ═══
app.use(helmetMiddleware);

// ═══ SEGURIDAD — Capa 2: CORS configurado ═══
app.use(cors(corsConfig()));

// ═══ SEGURIDAD — Capa 3: Parseo seguro ═══
app.use(express.json({ limit: '2mb' })); // Limitar tamaño de body
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// ═══ SEGURIDAD — Capa 4: HPP (HTTP Parameter Pollution) ═══
app.use(hppMiddleware);

// ═══ SEGURIDAD — Capa 5: Sanitización de inputs ═══
app.use(sanitizeInput);

// ═══ SEGURIDAD — Capa 6: Logging de seguridad ═══
app.use(securityLogger);

// ═══ SEGURIDAD — Capa 7: Rate limiting general ═══
app.use('/api/', limiteGeneral);

// Servir imágenes subidas (con cache headers)
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '7d',
  etag: true,
}));

// ═══ RUTAS con rate limiting específico ═══
app.use('/api/auth/login', limiteLogin);
app.use('/api/auth/register-full', limiteRegistro);
app.use('/api/auth/register', limiteRegistro);
app.use('/api/admin/crear', limiteAdmin);
app.use('/api/upload', limiteUpload);

app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/emergencia', emergenciaRoutes);
app.use('/api/ofertas', ofertasRoutes);
app.use('/api/billetera', billeteraRoutes);

// Ruta raíz (no exponer info sensible)
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// ═══ SEGURIDAD — Capa 8: Manejo de errores global ═══
app.use((err, req, res, next) => {
  // No exponer detalles del error en producción
  const ip = req.ip || req.connection.remoteAddress;
  console.error('[ERROR]', err.message, 'IP:', ip, 'URL:', req.originalUrl);

  if (err.message === 'No permitido por CORS') {
    return res.status(403).json({ error: 'Origen no permitido' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Archivo demasiado grande' });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message,
  });
});

// ═══ SEGURIDAD — Capa 9: Rutas no encontradas ═══
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[UntaXtame] Servidor corriendo en puerto ${PORT} — ${process.env.NODE_ENV || 'development'}`);
  console.log('[SEGURIDAD] Helmet, Rate Limiting, HPP, Sanitización, CORS — ACTIVOS');
});
