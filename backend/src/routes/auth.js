const express = require('express');
const router = express.Router();
const { db, auth } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');

// Login - verificar credenciales y devolver custom token
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Se requiere email y password' });
  }

  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Formato de email inválido' });
  }

  // Validar longitud de password
  if (password.length < 6 || password.length > 128) {
    return res.status(400).json({ error: 'Contraseña inválida' });
  }

  const ip = req.ip || req.connection.remoteAddress;

  try {
    // Usar Firebase Auth REST API para verificar credenciales
    const fetch = require('node-fetch');
    const apiKey = process.env.FIREBASE_API_KEY || 'AIzaSyCRZz6X7bWXTOsOYDyehKXGcqGRuWbzl9E';
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );

    const data = await response.json();

    if (data.error) {
      console.warn('[AUTH] Login fallido:', email, 'IP:', ip);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    // Obtener perfil del usuario
    const userDoc = await db.collection('usuarios').doc(data.localId).get();
    const perfil = userDoc.exists ? userDoc.data() : null;

    // Verificar si está bloqueado
    if (perfil?.bloqueado) {
      console.warn('[AUTH] Login bloqueado:', email, 'IP:', ip);
      return res.status(403).json({
        error: `Tu cuenta ha sido bloqueada. Motivo: ${perfil.motivoBloqueo || 'Falta grave'}. Contacta a soporte.`
      });
    }

    res.json({
      token: data.idToken,
      refreshToken: data.refreshToken,
      uid: data.localId,
      email: data.email,
      perfil,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar sesión: ' + err.message });
  }
});

// Registrar usuario completo (crear en Auth + Firestore)
router.post('/register-full', async (req, res) => {
  const { email, password, nombre, cedula, telefono, direccion, rol, placa, documentos, estadoVerificacion, fotoPerfil } = req.body;

  if (!email || !password || !nombre || !telefono || !rol) {
    return res.status(400).json({ error: 'Campos requeridos: email, password, nombre, telefono, rol' });
  }

  try {
    // Crear usuario en Firebase Auth
    const userRecord = await auth.createUser({ email, password, displayName: nombre });
    const uid = userRecord.uid;

    const userData = { uid, nombre, telefono, rol, activo: true, creadoEn: new Date().toISOString() };

    if (rol === 'cliente') {
      userData.cedula = cedula || '';
      userData.direccion = direccion || '';
      userData.fotoPerfil = fotoPerfil || null;
    }

    if (rol === 'conductor') {
      userData.cedula = cedula || '';
      userData.placa = placa || '';
      userData.disponible = false;
      userData.estadoVerificacion = estadoVerificacion || 'pendiente';
      userData.documentos = documentos || {};
    }

    await db.collection('usuarios').doc(uid).set(userData);

    // Hacer login automático para obtener token
    const fetch = require('node-fetch');
    const apiKey = process.env.FIREBASE_API_KEY || 'AIzaSyCRZz6X7bWXTOsOYDyehKXGcqGRuWbzl9E';
    const loginRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );
    const loginData = await loginRes.json();

    res.status(201).json({
      message: 'Usuario registrado',
      token: loginData.idToken,
      refreshToken: loginData.refreshToken,
      uid,
      perfil: userData,
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Ya existe un usuario con ese correo' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Refresh token
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Se requiere refreshToken' });

  try {
    const fetch = require('node-fetch');
    const apiKey = process.env.FIREBASE_API_KEY || 'AIzaSyCRZz6X7bWXTOsOYDyehKXGcqGRuWbzl9E';
    const response = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      }
    );
    const data = await response.json();

    if (data.error) {
      return res.status(401).json({ error: 'Token expirado, inicia sesión de nuevo' });
    }

    res.json({ token: data.id_token, refreshToken: data.refresh_token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar usuario (cliente o conductor) - legacy endpoint
router.post('/register', async (req, res) => {
  const { uid, nombre, cedula, telefono, direccion, rol, placa, documentos, estadoVerificacion, fotoPerfil } = req.body;

  if (!uid || !nombre || !telefono || !rol) {
    return res.status(400).json({ error: 'Campos requeridos: uid, nombre, telefono, rol' });
  }

  try {
    const userData = {
      uid,
      nombre,
      telefono,
      rol,
      activo: true,
      creadoEn: new Date().toISOString(),
    };

    if (rol === 'cliente') {
      if (!cedula || !direccion) {
        return res.status(400).json({ error: 'Clientes requieren cédula y dirección' });
      }
      userData.cedula = cedula;
      userData.direccion = direccion;
      userData.fotoPerfil = fotoPerfil || null;
    }

    if (rol === 'conductor') {
      if (!placa || !cedula) {
        return res.status(400).json({ error: 'Conductores requieren placa y cédula' });
      }
      userData.cedula = cedula;
      userData.placa = placa;
      userData.disponible = false;
      userData.estadoVerificacion = estadoVerificacion || 'pendiente';
      userData.documentos = documentos || {};
    }

    await db.collection('usuarios').doc(uid).set(userData);
    res.status(201).json({ message: 'Usuario registrado', usuario: userData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener perfil (protegido)
router.get('/perfil/:uid', verifyToken, async (req, res) => {
  try {
    const doc = await db.collection('usuarios').doc(req.params.uid).get();
    if (!doc.exists) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(doc.data());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar perfil
router.put('/perfil/:uid', verifyToken, async (req, res) => {
  const uid = req.params.uid;

  // Solo el propio usuario puede editar su perfil
  if (req.user.uid !== uid) {
    return res.status(403).json({ error: 'No puedes editar el perfil de otro usuario' });
  }

  const camposPermitidos = ['nombre', 'telefono', 'direccion', 'cedula', 'placa', 'fotoPerfil', 'vencimientoDocumentos'];
  const actualizacion = {};

  for (const campo of camposPermitidos) {
    if (req.body[campo] !== undefined && req.body[campo] !== null) {
      actualizacion[campo] = req.body[campo];
    }
  }

  if (Object.keys(actualizacion).length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }

  actualizacion.actualizadoEn = new Date().toISOString();

  try {
    await db.collection('usuarios').doc(uid).update(actualizacion);
    const docActualizado = await db.collection('usuarios').doc(uid).get();
    res.json({ message: 'Perfil actualizado', usuario: docActualizado.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recuperar contraseña
router.post('/recuperar-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Se requiere el correo electrónico' });
  }

  try {
    // Generar link de restablecimiento usando Firebase Admin
    const link = await auth.generatePasswordResetLink(email);
    // En producción aquí enviarías el email con un servicio como SendGrid
    // Por ahora retornamos éxito (Firebase envía el email automáticamente desde el cliente)
    res.json({ message: 'Se ha enviado un enlace de recuperación a tu correo' });
  } catch (err) {
    // No revelar si el email existe o no por seguridad
    res.json({ message: 'Si el correo está registrado, recibirás un enlace de recuperación' });
  }
});

module.exports = router;
