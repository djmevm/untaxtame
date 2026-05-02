const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const verifyToken = require('../middleware/verifyToken');
const { db } = require('../firebase');

// Carpeta base en el escritorio
const DESKTOP_BASE = path.join(require('os').homedir(), 'OneDrive', 'Desktop', 'UntaXtame_Archivos');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// Asegurar que existan las carpetas
function asegurarCarpeta(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    asegurarCarpeta(UPLOADS_DIR);
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = file.mimetype.split('/')[1] || 'jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo imágenes JPEG, PNG, WEBP'));
  },
});

// Copiar archivo al escritorio organizado
function copiarAlEscritorio(archivoOrigen, subcarpeta, nombreFinal) {
  try {
    const destDir = path.join(DESKTOP_BASE, subcarpeta);
    asegurarCarpeta(destDir);
    const destPath = path.join(destDir, nombreFinal);
    fs.copyFileSync(archivoOrigen, destPath);
  } catch (err) {
    console.warn('No se pudo copiar al escritorio:', err.message);
  }
}

// Subir foto de perfil
router.post('/imagen', verifyToken, upload.single('imagen'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se envió imagen' });

  const uid = req.user.uid;
  const url = `/uploads/${req.file.filename}`;

  // Obtener rol del usuario para organizar
  try {
    const userDoc = await db.collection('usuarios').doc(uid).get();
    const rol = userDoc.exists ? userDoc.data().rol : 'general';
    const nombre = userDoc.exists ? userDoc.data().nombre?.replace(/[^a-zA-Z0-9]/g, '_') : uid;
    const subcarpeta = rol === 'conductor' ? `perfiles/conductores` : rol === 'cliente' ? `perfiles/clientes` : 'perfiles';
    copiarAlEscritorio(req.file.path, subcarpeta, `${nombre}_${req.file.filename}`);
  } catch {}

  res.json({ message: 'Imagen subida', url });
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
    // Obtener nombre del conductor
    const userDoc = await db.collection('usuarios').doc(uid).get();
    const nombre = userDoc.exists ? userDoc.data().nombre?.replace(/[^a-zA-Z0-9]/g, '_') : uid;
    const placa = userDoc.exists ? userDoc.data().placa || '' : '';

    for (const campo of camposDocumentos) {
      const archivo = req.files?.[campo.name]?.[0];
      if (!archivo) continue;
      archivosSubidos[campo.name] = `/uploads/${archivo.filename}`;

      // Copiar al escritorio organizado por conductor
      const carpetaConductor = `documentos/${nombre}_${placa}`;
      copiarAlEscritorio(archivo.path, carpetaConductor, `${campo.name}_${archivo.filename}`);
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
