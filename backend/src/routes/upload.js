const express = require('express');
const router = express.Router();
const multer = require('multer');
const admin = require('firebase-admin');
const verifyToken = require('../middleware/verifyToken');
const { db } = require('../firebase');

// Usar memoria para multer (no disco) — subimos directo a Firebase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo imágenes JPEG, PNG, WEBP'));
  },
});

// Obtener bucket de Firebase Storage
function getBucket() {
  return admin.storage().bucket();
}

// Subir archivo a Firebase Storage y obtener URL pública
async function subirAFirebase(buffer, mimetype, carpeta, nombreArchivo) {
  const bucket = getBucket();
  const filePath = `${carpeta}/${nombreArchivo}`;
  const file = bucket.file(filePath);

  await file.save(buffer, {
    metadata: {
      contentType: mimetype,
      cacheControl: 'public, max-age=31536000',
    },
  });

  // Hacer el archivo público
  await file.makePublic();

  // Retornar URL pública
  const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
  return url;
}

// Subir foto de perfil
router.post('/imagen', verifyToken, upload.single('imagen'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió imagen' });

  const uid = req.user.uid;

  try {
    // Obtener datos del usuario
    const userDoc = await db.collection('usuarios').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const rol = userData.rol || 'general';

    // Generar nombre único
    const ext = req.file.mimetype.split('/')[1] || 'jpg';
    const nombreArchivo = `${uid}_${Date.now()}.${ext}`;
    const carpeta = `perfiles/${rol}s`;

    // Subir a Firebase Storage
    const url = await subirAFirebase(req.file.buffer, req.file.mimetype, carpeta, nombreArchivo);

    // Guardar URL en el perfil del usuario
    await db.collection('usuarios').doc(uid).update({
      fotoPerfil: url,
      fotoPerfilActualizada: new Date().toISOString(),
    });

    res.json({ message: 'Imagen subida', url });
  } catch (err) {
    console.error('[UPLOAD] Error:', err.message);
    res.status(500).json({ error: 'Error al subir imagen: ' + err.message });
  }
});

// Subir documentos del conductor
const camposDocumentos = [
  { name: 'cedulaFrente', maxCount: 1 },
  { name: 'cedulaReverso', maxCount: 1 },
  { name: 'licencia', maxCount: 1 },
  { name: 'tarjetaPropiedad', maxCount: 1 },
  { name: 'tarjetaOperacion', maxCount: 1 },
];

router.post('/documentos', verifyToken, upload.fields(camposDocumentos), async (req, res) => {
  const uid = req.user.uid;
  const archivosSubidos = {};

  try {
    const userDoc = await db.collection('usuarios').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const nombre = (userData.nombre || uid).replace(/[^a-zA-Z0-9]/g, '_');
    const placa = userData.placa || '';

    for (const campo of camposDocumentos) {
      const archivo = req.files?.[campo.name]?.[0];
      if (!archivo) continue;

      const ext = archivo.mimetype.split('/')[1] || 'jpg';
      const nombreArchivo = `${nombre}_${placa}_${campo.name}_${Date.now()}.${ext}`;
      const carpeta = `documentos/${uid}`;

      // Subir a Firebase Storage
      const url = await subirAFirebase(archivo.buffer, archivo.mimetype, carpeta, nombreArchivo);
      archivosSubidos[campo.name] = url;
    }

    if (Object.keys(archivosSubidos).length > 0) {
      const docRef = db.collection('usuarios').doc(uid);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const docsActuales = docSnap.data().documentos || {};
        await docRef.update({ documentos: { ...docsActuales, ...archivosSubidos } });
      }
    }

    res.json({ message: 'Documentos subidos', documentos: archivosSubidos, total: Object.keys(archivosSubidos).length });
  } catch (err) {
    console.error('[UPLOAD DOCS] Error:', err.message);
    res.status(500).json({ error: 'Error al subir documentos: ' + err.message });
  }
});

module.exports = router;


// Proxy para descargar archivos de Firebase Storage (evita CORS)
router.get('/proxy', verifyToken, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL requerida' });

  try {
    const fetch = require('node-fetch');
    const response = await fetch(url);
    if (!response.ok) return res.status(404).json({ error: 'Archivo no encontrado' });

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    response.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
