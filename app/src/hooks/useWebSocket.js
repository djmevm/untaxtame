import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ═══ HOOK DE WEBSOCKET — Conexión en tiempo real ═══
// Reemplaza polling de 3-4 segundos para ubicación y chat

const WS_BASE_URL = 'wss://untaxtame-production.up.railway.app/ws';
const WS_LOCAL_URL = 'ws://192.168.0.101:3000/ws';

// Usar producción por defecto
const WS_URL = WS_BASE_URL;

const RECONEXION_DELAY_BASE = 2000;
const RECONEXION_MAX_DELAY = 30000;
const PING_INTERVAL = 25000;

export default function useWebSocket(uid, rol = 'cliente') {
  const wsRef = useRef(null);
  const reconexionRef = useRef(null);
  const pingRef = useRef(null);
  const intentosRef = useRef(0);
  const [conectado, setConectado] = useState(false);
  const [ultimoMensaje, setUltimoMensaje] = useState(null);
  const listenersRef = useRef(new Map());
  const appStateRef = useRef(AppState.currentState);

  const conectar = useCallback(() => {
    if (!uid) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(`${WS_URL}?uid=${uid}&rol=${rol}`);

      ws.onopen = () => {
        console.log('[WS] Conectado');
        setConectado(true);
        intentosRef.current = 0;

        // Ping periódico para mantener conexión viva
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ tipo: 'ping' }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setUltimoMensaje(data);

          // Notificar a listeners registrados para este tipo
          const listeners = listenersRef.current.get(data.tipo);
          if (listeners) {
            listeners.forEach(cb => cb(data));
          }

          // Listener global (todos los mensajes)
          const globalListeners = listenersRef.current.get('*');
          if (globalListeners) {
            globalListeners.forEach(cb => cb(data));
          }
        } catch {}
      };

      ws.onclose = (event) => {
        console.log('[WS] Desconectado:', event.code);
        setConectado(false);
        limpiarPing();

        // Reconectar automáticamente si no fue cierre intencional
        if (event.code !== 4000 && appStateRef.current === 'active') {
          programarReconexion();
        }
      };

      ws.onerror = () => {
        // onclose se llamará después
      };

      wsRef.current = ws;
    } catch (err) {
      console.warn('[WS] Error conectando:', err.message);
      programarReconexion();
    }
  }, [uid, rol]);

  const programarReconexion = useCallback(() => {
    if (reconexionRef.current) return;
    intentosRef.current++;
    const delay = Math.min(
      RECONEXION_DELAY_BASE * Math.pow(1.5, intentosRef.current),
      RECONEXION_MAX_DELAY
    );
    console.log(`[WS] Reconectando en ${Math.round(delay / 1000)}s (intento ${intentosRef.current})`);
    reconexionRef.current = setTimeout(() => {
      reconexionRef.current = null;
      conectar();
    }, delay);
  }, [conectar]);

  const limpiarPing = () => {
    if (pingRef.current) {
      clearInterval(pingRef.current);
      pingRef.current = null;
    }
  };

  const desconectar = useCallback(() => {
    limpiarPing();
    if (reconexionRef.current) {
      clearTimeout(reconexionRef.current);
      reconexionRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(4000, 'Cierre intencional');
      wsRef.current = null;
    }
    setConectado(false);
  }, []);

  // Enviar mensaje por WebSocket
  const enviar = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  // Registrar listener para un tipo de mensaje
  const onMensaje = useCallback((tipo, callback) => {
    if (!listenersRef.current.has(tipo)) {
      listenersRef.current.set(tipo, new Set());
    }
    listenersRef.current.get(tipo).add(callback);

    // Retornar función de limpieza
    return () => {
      const set = listenersRef.current.get(tipo);
      if (set) set.delete(callback);
    };
  }, []);

  // Manejar AppState (pausar/reanudar en background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        // App volvió al primer plano — reconectar
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          conectar();
        }
      } else if (nextState.match(/inactive|background/)) {
        // App fue al background — desconectar para ahorrar batería
        // (las push notifications se encargan en background)
        desconectar();
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [conectar, desconectar]);

  // Conectar al montar
  useEffect(() => {
    if (uid) conectar();
    return () => desconectar();
  }, [uid, conectar, desconectar]);

  return {
    conectado,
    enviar,
    onMensaje,
    ultimoMensaje,
    reconectar: conectar,
    desconectar,
  };
}

// ═══ HOOK ESPECÍFICO: Ubicaciones de conductores en tiempo real ═══
export function useUbicacionesConductores(uid, rol) {
  const { conectado, onMensaje, enviar } = useWebSocket(uid, rol);
  const [conductores, setConductores] = useState([]);

  useEffect(() => {
    if (!conectado) return;
    const cleanup = onMensaje('ubicaciones_conductores', (data) => {
      setConductores(data.conductores || []);
    });
    return cleanup;
  }, [conectado, onMensaje]);

  return { conductores, conectado };
}

// ═══ HOOK ESPECÍFICO: Enviar ubicación del conductor ═══
export function useEnviarUbicacion(uid, nombre, placa, activo) {
  const { conectado, enviar } = useWebSocket(uid, 'conductor');
  const intervaloRef = useRef(null);

  useEffect(() => {
    if (!conectado || !activo || !uid) {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
      return;
    }

    const enviarUbicacion = async () => {
      try {
        const Location = require('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        enviar({
          tipo: 'ubicacion',
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          nombre,
          placa,
        });
      } catch {}
    };

    enviarUbicacion();
    intervaloRef.current = setInterval(enviarUbicacion, 10000); // Cada 10s via WS (antes era 60s via HTTP)

    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
    };
  }, [conectado, activo, uid, nombre, placa, enviar]);

  return { conectado };
}

// ═══ HOOK ESPECÍFICO: Chat en tiempo real ═══
export function useChatWebSocket(uid, servicioId) {
  const { conectado, onMensaje, enviar } = useWebSocket(uid, 'cliente');
  const [mensajesNuevos, setMensajesNuevos] = useState([]);

  useEffect(() => {
    if (!conectado || !servicioId) return;

    // Suscribirse al servicio
    enviar({ tipo: 'suscribir_servicio', servicioId });

    const cleanup = onMensaje('chat_mensaje', (data) => {
      if (data.servicioId === servicioId) {
        setMensajesNuevos(prev => [...prev, data]);
      }
    });

    return cleanup;
  }, [conectado, servicioId, onMensaje, enviar]);

  const enviarMensaje = useCallback((texto, destinoUid, nombre) => {
    return enviar({
      tipo: 'chat_mensaje',
      servicioId,
      texto,
      destinoUid,
      nombre,
    });
  }, [enviar, servicioId]);

  const limpiarNuevos = useCallback(() => setMensajesNuevos([]), []);

  return { mensajesNuevos, enviarMensaje, limpiarNuevos, conectado };
}

// ═══ HOOK ESPECÍFICO: Alertas en tiempo real ═══
export function useAlertasWebSocket(uid) {
  const { conectado, onMensaje } = useWebSocket(uid, 'conductor');
  const [alertas, setAlertas] = useState([]);

  useEffect(() => {
    if (!conectado) return;

    const cleanupEmergencia = onMensaje('emergencia', (data) => {
      setAlertas(prev => [data.alerta, ...prev]);
    });

    const cleanupRadio = onMensaje('codigo_radio', (data) => {
      setAlertas(prev => [{ ...data.codigo, tipo: 'radio' }, ...prev]);
    });

    return () => {
      cleanupEmergencia();
      cleanupRadio();
    };
  }, [conectado, onMensaje]);

  return { alertas, conectado };
}
