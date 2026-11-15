import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ═══ HOOK DE WEBSOCKET — Conexión en tiempo real con JWT ═══

const WS_BASE_URL = 'wss://untaxtame-production.up.railway.app/ws';
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

  const conectar = useCallback(async () => {
    if (!uid) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        console.warn('[WS] Sin token — no se conecta');
        return;
      }

      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);

      ws.onopen = () => {
        console.log('[WS] Conectado');
        setConectado(true);
        intentosRef.current = 0;

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

          const listeners = listenersRef.current.get(data.tipo);
          if (listeners) {
            listeners.forEach(cb => cb(data));
          }

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

        if (event.code !== 4000 && appStateRef.current === 'active') {
          programarReconexion();
        }
      };

      ws.onerror = () => {};

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

  const enviar = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const onMensaje = useCallback((tipo, callback) => {
    if (!listenersRef.current.has(tipo)) {
      listenersRef.current.set(tipo, new Set());
    }
    listenersRef.current.get(tipo).add(callback);

    return () => {
      const set = listenersRef.current.get(tipo);
      if (set) set.delete(callback);
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          conectar();
        }
      } else if (nextState.match(/inactive|background/)) {
        desconectar();
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [conectar, desconectar]);

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

// ═══ Ubicaciones globales de conductores ═══
export function useUbicacionesConductores(uid, rol) {
  const { conectado, onMensaje } = useWebSocket(uid, rol);
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

// ═══ Enviar ubicación del conductor (global + por viaje) ═══
// Detecta pérdida de GPS y dispara alerta sonora si hay servicio activo.
const GPS_TIMEOUT_MS = 20000; // sin fix válido en 20s → alerta

export function useEnviarUbicacion(uid, nombre, placa, activo, servicioId = null) {
  const { conectado, enviar } = useWebSocket(uid, 'conductor');
  const intervaloRef = useRef(null);
  const watchdogRef = useRef(null);
  const ultimoFixRef = useRef(Date.now());
  const alertaGPSRef = useRef(false);
  const [gpsPerdido, setGpsPerdido] = useState(false);

  useEffect(() => {
    if (!conectado || !activo || !uid) {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      setGpsPerdido(false);
      alertaGPSRef.current = false;
      return;
    }

    ultimoFixRef.current = Date.now();

    const enviarUbicacion = async () => {
      try {
        const Location = require('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setGpsPerdido(true);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          maximumAge: 5000,
          timeout: 10000,
        });
        ultimoFixRef.current = Date.now();
        if (alertaGPSRef.current) {
          alertaGPSRef.current = false;
          setGpsPerdido(false);
        }
        const payload = {
          tipo: 'ubicacion',
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          nombre,
          placa,
        };
        if (servicioId) payload.servicioId = servicioId;
        enviar(payload);
      } catch {
        // El watchdog se encarga de la alerta
      }
    };

    enviarUbicacion();
    intervaloRef.current = setInterval(enviarUbicacion, 5000);

    // Watchdog: si no hay fix reciente y hay viaje activo, alertar
    watchdogRef.current = setInterval(() => {
      const edad = Date.now() - ultimoFixRef.current;
      if (edad > GPS_TIMEOUT_MS) {
        setGpsPerdido(true);
        if (servicioId && !alertaGPSRef.current) {
          alertaGPSRef.current = true;
          try {
            const { reproducirSonidoGPS } = require('../services/sonido');
            reproducirSonidoGPS();
          } catch {}
        }
      }
    }, 5000);

    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
      if (watchdogRef.current) clearInterval(watchdogRef.current);
    };
  }, [conectado, activo, uid, nombre, placa, enviar, servicioId]);

  return { conectado, gpsPerdido };
}

// ═══ Tracking bidireccional de un viaje activo ═══
export function useTrackingViaje(uid, rol, servicioId, activo) {
  const { conectado, enviar, onMensaje } = useWebSocket(uid, rol);
  const [ubicacionPeer, setUbicacionPeer] = useState(null);
  const intervaloRef = useRef(null);

  useEffect(() => {
    if (!conectado || !servicioId || !activo) return;

    enviar({ tipo: 'suscribir_servicio', servicioId });

    const cleanupViaje = onMensaje('ubicacion_viaje', (data) => {
      if (data.servicioId !== servicioId) return;
      // Solo guardar la ubicación de la otra parte
      if (data.rolEmisor === rol) return;
      setUbicacionPeer({ lat: data.lat, lng: data.lng, timestamp: data.timestamp });
    });

    const cleanupSnap = onMensaje('ubicacion_viaje_snapshot', (data) => {
      if (data.servicioId !== servicioId) return;
      const peer = rol === 'cliente' ? data.conductor : data.cliente;
      if (peer?.lat) setUbicacionPeer(peer);
    });

    return () => {
      cleanupViaje();
      cleanupSnap();
    };
  }, [conectado, servicioId, activo, enviar, onMensaje, rol]);

  // Cliente también envía su GPS durante el viaje (útil si se mueve del punto)
  useEffect(() => {
    if (!conectado || !servicioId || !activo || rol !== 'cliente') {
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
          tipo: 'ubicacion_viaje',
          servicioId,
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        });
      } catch {}
    };

    enviarUbicacion();
    intervaloRef.current = setInterval(enviarUbicacion, 8000);

    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
    };
  }, [conectado, servicioId, activo, rol, enviar]);

  return { ubicacionPeer, conectado };
}

// ═══ Chat en tiempo real ═══
export function useChatWebSocket(uid, servicioId) {
  const { conectado, onMensaje, enviar } = useWebSocket(uid, 'cliente');
  const [mensajesNuevos, setMensajesNuevos] = useState([]);

  useEffect(() => {
    if (!conectado || !servicioId) return;

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

// ═══ Alertas en tiempo real ═══
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
