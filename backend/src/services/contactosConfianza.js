/**
 * Contactos de confianza del cliente — notificaciones de seguridad.
 */
const { db } = require('../firebase');

const MAX_CONTACTOS = 3;

function normalizarTelefono(tel) {
  if (!tel) return null;
  const digitos = String(tel).replace(/\D/g, '');
  if (digitos.length < 10) return null;
  return digitos;
}

function validarContactos(lista) {
  if (!Array.isArray(lista)) return { error: 'Lista inválida' };
  if (lista.length > MAX_CONTACTOS) {
    return { error: `Máximo ${MAX_CONTACTOS} contactos de confianza` };
  }
  const limpios = [];
  for (const c of lista) {
    const nombre = (c?.nombre || '').trim().slice(0, 60);
    const telefono = normalizarTelefono(c?.telefono);
    if (!nombre || !telefono) {
      return { error: 'Cada contacto necesita nombre y teléfono válido' };
    }
    limpios.push({ nombre, telefono });
  }
  return { contactos: limpios };
}

async function obtenerContactos(uid) {
  const doc = await db.collection('usuarios').doc(uid).get();
  if (!doc.exists) return [];
  return Array.isArray(doc.data().contactosConfianza) ? doc.data().contactosConfianza : [];
}

/**
 * Envía mensaje WhatsApp a cada contacto de confianza del cliente.
 * @returns {Promise<number>} cantidad notificada
 */
async function notificarContactosConfianza(clienteUid, mensaje) {
  if (!clienteUid || !mensaje) return 0;
  const contactos = await obtenerContactos(clienteUid);
  if (!contactos.length) return 0;

  let enviados = 0;
  try {
    const { enviarMensaje } = require('../routes/whatsapp');
    for (const c of contactos) {
      if (!c.telefono) continue;
      try {
        const intro = `👤 *${c.nombre}*, alerta de UntaXtame:\n\n`;
        await enviarMensaje(c.telefono, intro + mensaje);
        enviados += 1;
      } catch (e) {
        console.error('[contactos] WA falló', c.telefono, e.message);
      }
    }
  } catch (e) {
    console.error('[contactos] WhatsApp no disponible:', e.message);
  }
  return enviados;
}

function generarPinEmbarque() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

module.exports = {
  MAX_CONTACTOS,
  validarContactos,
  obtenerContactos,
  notificarContactosConfianza,
  generarPinEmbarque,
  normalizarTelefono,
};
