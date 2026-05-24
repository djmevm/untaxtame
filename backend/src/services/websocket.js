const { WebSocketServer } = require('ws');
const url = require('url');

// ═══ SERVIDOR WEBSOCKET — Tiempo Real ═══
// Canales: ubicacion, chat, alertas, servicios

const clientes = new Map(); // uid → Set<ws>
const conductoresActivos = new Map(); // uid → { lat, lng, nombre, placa, timestamp }

function inicializarWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const params = url.parse(req.url, true).query;
    const uid = params.uid;
    const rol = params.rol || 'cliente';

    if (!uid) {
      ws.close(4001, 'UID requerido');
      return;
    }

    // Registrar cliente
    if (!clientes.has(uid)) clientes.set(uid, new Set());
    clientes.get(uid).add(ws);

    console.log(`[WS] Conectado: ${uid} (${rol}) — Total: ${clientes.size}`);

    ws.isAlive = true;
    ws.uid = uid;
    ws.rol = rol;

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

    // Enviar estado inicial
    ws.send(JSON.stringify({ tipo: 'conectado', uid, timestamp: Date.now() }));
  });

  // Ping/pong para detectar conexiones muertas
  const intervalo = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(intervalo));

  // Broadcast ubicaciones de conductores cada 3 segundos
  setInterval(() => {
    if (conductoresActivos.size === 0) return;
    const ubicaciones = Array.from(conductoresActivos.entries()).map(([uid, data]) => ({
      uid, ...data,
    }));
    broadcastARol('cliente', { tipo: 'ubicaciones_conductores', conductores: ubicaciones });
  }, 3000);

  console.log('[WS] WebSocket server inicializado en /ws');
  return wss;
}

function manejarMensaje(ws, uid, rol, msg) {
  switch (msg.tipo) {
    case 'ubicacion':
      // Conductor envía su ubicación
      if (rol === 'conductor' && msg.lat && msg.lng) {
        conductoresActivos.set(uid, {
          lat: msg.lat,
          lng: msg.lng,
          nombre: msg.nombre || '',
          placa: msg.placa || '',
          timestamp: Date.now(),
        });
      }
      break;

    case 'chat_mensaje':
      // Reenviar mensaje al destinatario
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
      // Chat directo admin ↔ usuario (instantáneo)
      if (msg.destinoUid && msg.texto) {
        enviarAUsuario(msg.destinoUid, {
          tipo: 'chat_directo',
          texto: msg.texto,
          senderUid: uid,
          senderNombre: msg.nombre || (rol === 'admin' ? 'Administrador' : 'Usuario'),
          senderRol: rol,
          timestamp: Date.now(),
        });
        // Confirmar al remitente que se envió
        enviarAUsuario(uid, {
          tipo: 'chat_directo_confirmado',
          destinoUid: msg.destinoUid,
          texto: msg.texto,
          timestamp: Date.now(),
        });
      }
      break;

    case 'suscribir_servicio':
      // Cliente se suscribe a actualizaciones de un servicio
      ws.servicioId = msg.servicioId;
      break;

    case 'ping':
      ws.send(JSON.stringify({ tipo: 'pong', timestamp: Date.now() }));
      break;

    default:
      break;
  }
}

// ═══ FUNCIONES DE BROADCAST ═══

/**
 * Enviar mensaje a un usuario específico (todas sus conexiones)
 */
function enviarAUsuario(uid, data) {
  const conexiones = clientes.get(uid);
  if (!conexiones) return false;
  const mensaje = JSON.stringify(data);
  conexiones.forEach(ws => {
    if (ws.readyState === 1) ws.send(mensaje);
  });
  return true;
}

/**
 * Broadcast a todos los usuarios de un rol
 */
function broadcastARol(rol, data) {
  const mensaje = JSON.stringify(data);
  clientes.forEach((conexiones, uid) => {
    conexiones.forEach(ws => {
      if (ws.readyState === 1 && ws.rol === rol) {
        ws.send(mensaje);
      }
    });
  });
}

/**
 * Broadcast a todos los conectados
 */
function broadcastATodos(data) {
  const mensaje = JSON.stringify(data);
  clientes.forEach((conexiones) => {
    conexiones.forEach(ws => {
      if (ws.readyState === 1) ws.send(mensaje);
    });
  });
}

/**
 * Notificar nuevo servicio a conductores conectados
 */
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

/**
 * Notificar alerta de emergencia a todos los conductores
 */
function notificarEmergencia(alerta) {
  broadcastARol('conductor', {
    tipo: 'emergencia',
    alerta,
  });
}

/**
 * Notificar código de radio a todos los conductores
 */
function notificarCodigoRadio(codigo) {
  broadcastARol('conductor', {
    tipo: 'codigo_radio',
    codigo,
  });
}

/**
 * Notificar actualización de servicio a un usuario
 */
function notificarServicioActualizado(uid, servicio) {
  enviarAUsuario(uid, {
    tipo: 'servicio_actualizado',
    servicio,
  });
}

/**
 * Obtener ubicaciones de conductores activos
 */
function obtenerUbicacionesConductores() {
  return Array.from(conductoresActivos.entries()).map(([uid, data]) => ({
    uid, ...data,
  }));
}

/**
 * Estadísticas de conexiones
 */
function obtenerEstadisticas() {
  return {
    totalConexiones: clientes.size,
    conductoresActivos: conductoresActivos.size,
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
  obtenerUbicacionesConductores,
  obtenerEstadisticas,
};
