const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middleware/verifyToken');
const verifyAdmin = require('../middleware/verifyAdmin');

// ═══ CONFIGURACIÓN ═══

// Obtener configuración de comisión
router.get('/config', verifyToken, async (req, res) => {
  try {
    const doc = await db.collection('configuracion').doc('billetera').get();
    const config = doc.exists ? doc.data() : { porcentajeComision: 8, saldoMinimo: 5000, activo: false };
    res.json(config);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Actualizar configuración (admin)
router.put('/config', verifyToken, verifyAdmin, async (req, res) => {
  const { porcentajeComision, saldoMinimo, activo } = req.body;
  try {
    const update = { actualizadoEn: new Date().toISOString() };
    if (porcentajeComision !== undefined) {
      const pct = parseFloat(porcentajeComision);
      if (isNaN(pct) || pct < 0 || pct > 50) return res.status(400).json({ error: 'Porcentaje debe ser entre 0 y 50' });
      update.porcentajeComision = Math.round(pct * 100) / 100;
    }
    if (saldoMinimo !== undefined) {
      const min = parseInt(saldoMinimo);
      if (isNaN(min) || min < 0) return res.status(400).json({ error: 'Saldo mínimo inválido' });
      update.saldoMinimo = min;
    }
    if (activo !== undefined) update.activo = !!activo;
    await db.collection('configuracion').doc('billetera').set(update, { merge: true });
    const doc = await db.collection('configuracion').doc('billetera').get();
    res.json({ message: 'Configuración actualizada', config: doc.data() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══ SALDO DEL CONDUCTOR ═══

// Obtener saldo de un conductor
router.get('/saldo/:uid', verifyToken, async (req, res) => {
  try {
    const doc = await db.collection('billeteras').doc(req.params.uid).get();
    if (!doc.exists) {
      return res.json({ saldo: 0, totalRecargas: 0, totalComisiones: 0 });
    }
    res.json(doc.data());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Recargar saldo (admin)
router.post('/recargar', verifyToken, verifyAdmin, async (req, res) => {
  const { conductorUid, monto, metodo, referencia } = req.body;
  if (!conductorUid || !monto) return res.status(400).json({ error: 'Se requiere conductorUid y monto' });
  const montoNum = Math.round(parseFloat(monto) * 100) / 100;
  if (isNaN(montoNum) || montoNum <= 0) return res.status(400).json({ error: 'Monto inválido' });

  try {
    const ref = db.collection('billeteras').doc(conductorUid);
    const doc = await ref.get();
    const actual = doc.exists ? doc.data() : { saldo: 0, totalRecargas: 0, totalComisiones: 0 };
    const nuevoSaldo = Math.round((actual.saldo + montoNum) * 100) / 100;

    await ref.set({
      saldo: nuevoSaldo,
      totalRecargas: Math.round(((actual.totalRecargas || 0) + montoNum) * 100) / 100,
      totalComisiones: actual.totalComisiones || 0,
      actualizadoEn: new Date().toISOString(),
    }, { merge: true });

    // Registrar movimiento
    await db.collection('billeteras').doc(conductorUid).collection('movimientos').add({
      tipo: 'recarga',
      monto: montoNum,
      saldoAnterior: actual.saldo || 0,
      saldoNuevo: nuevoSaldo,
      metodo: metodo || 'admin',
      referencia: referencia || '',
      creadoPor: req.user.uid,
      creadoEn: new Date().toISOString(),
    });

    // Verificar conductor
    const userDoc = await db.collection('usuarios').doc(conductorUid).get();
    const nombre = userDoc.exists ? userDoc.data().nombre : 'Conductor';

    res.json({ message: `Recarga de $${montoNum.toLocaleString('es-CO')} exitosa para ${nombre}`, saldo: nuevoSaldo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Descontar comisión (interno, llamado al completar servicio)
async function descontarComision(conductorUid, servicioId, tarifaViaje) {
  try {
    const configDoc = await db.collection('configuracion').doc('billetera').get();
    const config = configDoc.exists ? configDoc.data() : { porcentajeComision: 8, activo: false };
    if (!config.activo) return { descontado: false, motivo: 'Sistema de billetera desactivado' };

    const porcentaje = config.porcentajeComision || 8;
    const comision = Math.round((tarifaViaje * porcentaje / 100) * 100) / 100;

    const ref = db.collection('billeteras').doc(conductorUid);
    const doc = await ref.get();
    const actual = doc.exists ? doc.data() : { saldo: 0, totalRecargas: 0, totalComisiones: 0 };

    if (actual.saldo < comision) {
      return { descontado: false, motivo: 'Saldo insuficiente', saldo: actual.saldo, comision };
    }

    const nuevoSaldo = Math.round((actual.saldo - comision) * 100) / 100;

    await ref.set({
      saldo: Math.max(0, nuevoSaldo),
      totalComisiones: Math.round(((actual.totalComisiones || 0) + comision) * 100) / 100,
      totalRecargas: actual.totalRecargas || 0,
      actualizadoEn: new Date().toISOString(),
    }, { merge: true });

    // Registrar movimiento
    await ref.collection('movimientos').add({
      tipo: 'comision',
      monto: -comision,
      porcentaje,
      tarifaViaje,
      servicioId,
      saldoAnterior: actual.saldo,
      saldoNuevo: Math.max(0, nuevoSaldo),
      creadoEn: new Date().toISOString(),
    });

    // Notificar si saldo bajo
    const saldoMinimo = config.saldoMinimo || 5000;
    if (nuevoSaldo < saldoMinimo) {
      await db.collection('notificaciones').add({
        uid: conductorUid,
        tipo: 'saldo_bajo',
        titulo: '⚠️ Saldo bajo',
        mensaje: `Tu saldo es de $${nuevoSaldo.toLocaleString('es-CO')}. Recarga para seguir recibiendo servicios.`,
        leida: false,
        creadoEn: new Date().toISOString(),
      });
    }

    return { descontado: true, comision, saldoAnterior: actual.saldo, saldoNuevo: nuevoSaldo, porcentaje };
  } catch (err) {
    return { descontado: false, motivo: err.message };
  }
}

// Historial de movimientos de un conductor
router.get('/movimientos/:uid', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('billeteras').doc(req.params.uid)
      .collection('movimientos').orderBy('creadoEn', 'desc').limit(50).get();
    const movimientos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(movimientos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══ REPORTES (admin) ═══

// Reporte general de billeteras
router.get('/reporte', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('billeteras').get();
    const billeteras = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const userDoc = await db.collection('usuarios').doc(doc.id).get();
      const user = userDoc.exists ? userDoc.data() : {};
      billeteras.push({
        uid: doc.id,
        nombre: user.nombre || '—',
        placa: user.placa || '—',
        saldo: data.saldo || 0,
        totalRecargas: data.totalRecargas || 0,
        totalComisiones: data.totalComisiones || 0,
        actualizadoEn: data.actualizadoEn,
      });
    }
    // Totales
    const totalSaldos = billeteras.reduce((a, b) => a + b.saldo, 0);
    const totalRecargas = billeteras.reduce((a, b) => a + b.totalRecargas, 0);
    const totalComisiones = billeteras.reduce((a, b) => a + b.totalComisiones, 0);

    res.json({ billeteras, totales: { totalSaldos, totalRecargas, totalComisiones } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reporte de un conductor específico con filtro de fechas
router.get('/reporte/:uid', verifyToken, async (req, res) => {
  const { desde, hasta } = req.query;
  try {
    let query = db.collection('billeteras').doc(req.params.uid)
      .collection('movimientos').orderBy('creadoEn', 'desc');
    if (desde) query = query.where('creadoEn', '>=', desde);
    if (hasta) query = query.where('creadoEn', '<=', hasta);
    const snapshot = await query.limit(200).get();
    const movimientos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const recargas = movimientos.filter(m => m.tipo === 'recarga');
    const comisiones = movimientos.filter(m => m.tipo === 'comision');

    res.json({
      movimientos,
      resumen: {
        totalRecargas: recargas.reduce((a, m) => a + m.monto, 0),
        totalComisiones: comisiones.reduce((a, m) => a + Math.abs(m.monto), 0),
        cantidadRecargas: recargas.length,
        cantidadComisiones: comisiones.length,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.descontarComision = descontarComision;
