const { WebSocketServer } = require('ws');
const url = require('url');
const { db, auth } = require('../firebase');

// ═══ SERVIDOR WEBSOCKET — Tiempo Real ═══
// Canales: ubicacion, tracking por viaje, chat, alertas, servicios

const clientes = new Map(); // uid → Set<ws>
const conductoresActivos = new Map(); // uid → { lat, lng, nombre, placa, timestamp }
const trackingViajes = new Map(); // servicioId → { conductor, cliente, actualizadoEn }
const ultimaPersistencia = new Map(); // uid → timestamp
const INTERVALO_PERSISTIR_MS = 15000;
const ESTADOS_TRACKING = new Set(['aceptado', 'conductor_en_sitio', 'en_curso']);

function inicializarWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    const params = url.parse(req.url, true).query;
    const token = params.token || '';

    if (!token) {
      ws.close(4001, 'Token requerido');
      return;
    }

    let decoded;
    try {
      decoded = await auth.verifyIdToken(token);
    } catch (err) {
      ws.close(4003, 'Token inválido');
      return;
    }

    const uid = decoded.uid;
    let rol = 'cliente';
    try {
      const userDoc = await db.collection('usuarios').doc(uid).get();
      if (!userDoc.exists) {
        ws.close(4004, 'Usuario no encontrado');
        return;
      }
      const userData = userDoc.data();
      if (userData.bloqueado) {
        ws.close(4005, 'Cuenta bloqueada');
        return;
      }
      rol = userData.rol || params.rol || 'cliente';
    } catch (err) {
      ws.close(4002, 'Error de autenticación');
      return;
    }

    if (!clientes.has(uid)) clientes.set(uid, new Set());
    clientes.get(uid).add(ws);

    console.log(`[WS] Conectado: ${uid} (${rol}) — Total: ${clientes.size}`);

    ws.isAlive = true;
    ws.uid = uid;
    ws.rol = rol;
    ws.autenticado = true;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        manejarMensaje(ws, uid, rol, msg);
      } catch (err) {
        console.warn('[WS] Mensaje inválido:', err.message);
      }
    });

    ws.on('close', () => {
      const set = clientes.get(uid);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          clientes.delete(uid);
          conductoresActivos.delete(uid);
        }
      }
      console.log(`[WS] Desconectado: ${uid} — Total: ${clientes.size}`);
    });

    ws.on('error', () => {
      ws.terminate();
    });

    ws.send(JSON.stringify({ tipo: 'conectado', uid, rol, timestamp: Date.now() }));
  });

  const intervalo = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(intervalo));

  // Broadcast ubicaciones globales a clientes/admins (mapa general)
  setInterval(() => {
    if (conductoresActivos.size === 0) return;
    const ubicaciones = Array.from(conductoresActivos.entries()).map(([uid, data]) => ({
      uid, ...data,
    }));
    broadcastARol('cliente', { tipo: 'ubicaciones_conductores', conductores: ubicaciones });
    broadcastARol('admin', { tipo: 'ubicaciones_conductores', conductores: ubicaciones });
  }, 3000);

  console.log('[WS] WebSocket server inicializado en /ws (JWT requerido)');
  return wss;
}

async function validarParticipanteServicio(uid, servicioId) {
  if (!servicioId) return null;
  try {
    const doc = await db.collection('servicios').doc(servicioId).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (data.clienteUid !== uid && data.conductorUid !== uid) return null;
    if (!ESTADOS_TRACKING.has(data.estado)) return null;
    return data;
  } catch {
    return null;
  }
}

function actualizarTracking(servicioId, rol, lat, lng) {
  const actual = trackingViajes.get(servicioId) || {};
  if (rol === 'conductor') {
    actual.conductor = { lat, lng, timestamp: Date.now() };
  } else {
    actual.cliente = { lat, lng, timestamp: Date.now() };
  }
  actual.actualizadoEn = Date.now();
  trackingViajes.set(servicioId, actual);
  return actual;
}

function manejarMensaje(ws, uid, rol, msg) {
  switch (msg.tipo) {
    case 'ubicacion':
      if (rol === 'conductor' && msg.lat && msg.lng) {
        conductoresActivos.set(uid, {
          lat: msg.lat,
          lng: msg.lng,
          nombre: msg.nombre || '',
          placa: msg.placa || '',
          timestamp: Date.now(),
        });

        const ahora = Date.now();
        const ultima = ultimaPersistencia.get(uid) || 0;
        if (ahora - ultima >= INTERVALO_PERSISTIR_MS) {
          ultimaPersistencia.set(uid, ahora);
          const iso = new Date(ahora).toISOString();
          db.collection('usuarios').doc(uid).update({
            ubicacionActual: { lat: msg.lat, lng: msg.lng, actualizadoEn: iso },
            ultimaActividadEn: iso,
          }).catch(() => {});
        }

        // Si va en un viaje, reenviar al cliente del servicio
        if (msg.servicioId) {
          reenviarUbicacionViaje(ws, uid, rol, {
            tipo: 'ubicacion_viaje',
            rolEmisor: 'conductor',
            servicioId: msg.servicioId,
            lat: msg.lat,
            lng: msg.lng,
          });
        }
      }
      break;

    case 'ubicacion_viaje':
      reenviarUbicacionViaje(ws, uid, rol, msg);
      break;

    case 'chat_mensaje':
      if (msg.destinoUid && msg.texto) {
        enviarAUsuario(msg.destinoUid, {
          tipo: 'chat_mensaje',
          servicioId: msg.servicioId,
          texto: msg.texto,
          senderUid: uid,
          senderNombre: msg.nombre || 'Usuario',
          senderRol: rol,
          timestamp: Date.now(),
        });
      }
      break;

    case 'chat_directo':
      if (msg.destinoUid && msg.texto) {
        enviarAUsuario(msg.destinoUid, {
          tipo: 'chat_directo',
          texto: msg.texto,
          senderUid: uid,
          senderNombre: msg.nombre || (rol === 'admin' ? 'Administrador' : 'Usuario'),
          senderRol: rol,
          timestamp: Date.now(),
        });
        enviarAUsuario(uid, {
          tipo: 'chat_directo_confirmado',
          destinoUid: msg.destinoUid,
          texto: msg.texto,
          timestamp: Date.now(),
        });
      }
      break;

    case 'suscribir_servicio':
      ws.servicioId = msg.servicioId || null;
      if (msg.servicioId && trackingViajes.has(msg.servicioId)) {
        ws.send(JSON.stringify({
          tipo: 'ubicacion_viaje_snapshot',
          servicioId: msg.servicioId,
          ...trackingViajes.get(msg.servicioId),
        }));
      }
      break;

    case 'ping':
      ws.send(JSON.stringify({ tipo: 'pong', timestamp: Date.now() }));
      break;

    default:
      break;
  }
}

function reenviarUbicacionViaje(ws, uid, rol, msg) {
  const { servicioId, lat, lng } = msg;
  if (!servicioId || lat == null || lng == null) return;

  // Validación async; no bloquear el event loop del WS
  validarParticipanteServicio(uid, servicioId).then((servicio) => {
    if (!servicio) return;

    const rolEmisor = servicio.conductorUid === uid ? 'conductor' : 'cliente';
    const destinoUid = rolEmisor === 'conductor' ? servicio.clienteUid : servicio.conductorUid;
    if (!destinoUid) return;

    actualizarTracking(servicioId, rolEmisor, lat, lng);

    // Persistencia ligera para respaldo HTTP
    if (rolEmisor === 'conductor') {
      const ahora = Date.now();
      const ultima = ultimaPersistencia.get(uid) || 0;
      if (ahora - ultima >= INTERVALO_PERSISTIR_MS) {
        ultimaPersistencia.set(uid, ahora);
        const iso = new Date(ahora).toISOString();
        db.collection('usuarios').doc(uid).update({
          ubicacionActual: { lat, lng, actualizadoEn: iso },
          ultimaActividadEn: iso,
        }).catch(() => {});
      }
      conductoresActivos.set(uid, {
        lat,
        lng,
        nombre: servicio.conductorNombre || '',
        placa: servicio.conductorPlaca || '',
        timestamp: Date.now(),
        servicioId,
      });
    }

    enviarAUsuario(destinoUid, {
      tipo: 'ubicacion_viaje',
      servicioId,
      rolEmisor,
      lat,
      lng,
      timestamp: Date.now(),
    });
  }).catch(() => {});
}

function enviarAUsuario(uid, data) {
  const conexiones = clientes.get(uid);
  if (!conexiones) return false;
  const mensaje = JSON.stringify(data);
  conexiones.forEach(ws => {
    if (ws.readyState === 1) ws.send(mensaje);
  });
  return true;
}

function broadcastARol(rol, data) {
  const mensaje = JSON.stringify(data);
  clientes.forEach((conexiones) => {
    conexiones.forEach(ws => {
      if (ws.readyState === 1 && ws.rol === rol) {
        ws.send(mensaje);
      }
    });
  });
}

function broadcastATodos(data) {
  const mensaje = JSON.stringify(data);
  clientes.forEach((conexiones) => {
    conexiones.forEach(ws => {
      if (ws.readyState === 1) ws.send(mensaje);
    });
  });
}

function notificarNuevoServicio(servicio) {
  broadcastARol('conductor', {
    tipo: 'nuevo_servicio',
    servicio: {
      id: servicio.id,
      clienteNombre: servicio.clienteNombre,
      origen: servicio.origen,
      destino: servicio.destino,
      metodoPago: servicio.metodoPago,
      ubicacionGPS: servicio.ubicacionGPS,
      tarifaMinima: servicio.tarifaMinima,
      requisitos: servicio.requisitos,
    },
  });
}

function notificarEmergencia(alerta) {
  broadcastARol('conductor', {
    tipo: 'emergencia',
    alerta,
  });
}

function notificarCodigoRadio(codigo) {
  broadcastARol('conductor', {
    tipo: 'codigo_radio',
    codigo,
  });
}

function notificarServicioActualizado(uid, servicio) {
  enviarAUsuario(uid, {
    tipo: 'servicio_actualizado',
    servicio,
  });

  // Limpiar tracking al finalizar
  if (servicio?.id && (servicio.estado === 'completado' || servicio.estado === 'cancelado')) {
    trackingViajes.delete(servicio.id);
  }
}

function notificarParticipantesServicio(servicio) {
  if (!servicio) return;
  if (servicio.clienteUid) notificarServicioActualizado(servicio.clienteUid, servicio);
  if (servicio.conductorUid) notificarServicioActualizado(servicio.conductorUid, servicio);
}

function obtenerUbicacionesConductores() {
  return Array.from(conductoresActivos.entries()).map(([uid, data]) => ({
    uid, ...data,
  }));
}

function obtenerEstadisticas() {
  return {
    totalConexiones: clientes.size,
    conductoresActivos: conductoresActivos.size,
    trackingViajes: trackingViajes.size,
    timestamp: Date.now(),
  };
}

module.exports = {
  inicializarWebSocket,
  enviarAUsuario,
  broadcastARol,
  broadcastATodos,
  notificarNuevoServicio,
  notificarEmergencia,
  notificarCodigoRadio,
  notificarServicioActualizado,
  notificarParticipantesServicio,
  obtenerUbicacionesConductores,
  obtenerEstadisticas,
};
