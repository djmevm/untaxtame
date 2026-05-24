import { useEffect, useRef, useState, useCallback } from 'react';

// ═══ WEBSOCKET PARA PANEL ADMIN ═══
// Comunicación en tiempo real: chat directo, alertas, servicios

const WS_URL = 'wss://untaxtame-production.up.railway.app/ws';

export default function useAdminWebSocket(uid) {
  const wsRef = useRef(null);
  const reconexionRef = useRef(null);
  const intentosRef = useRef(0);
  const [conectado, setConectado] = useState(false);
  const listenersRef = useRef(new Map());

  const conectar = useCallback(() => {
    if (!uid) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(`${WS_URL}?uid=${uid}&rol=admin`);

      ws.onopen = () => {
        console.log('[WS Admin] Conectado');
        setConectado(true);
        intentosRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Notificar a listeners registrados
          const listeners = listenersRef.current.get(data.tipo);
          if (listeners) listeners.forEach(cb => cb(data));
          // Listener global
          const global = listenersRef.current.get('*');
          if (global) global.forEach(cb => cb(data));
        } catch {}
      };

      ws.onclose = () => {
        setConectado(false);
        // Reconectar automáticamente
        intentosRef.current++;
        const delay = Math.min(2000 * Math.pow(1.5, intentosRef.current), 30000);
        reconexionRef.current = setTimeout(conectar, delay);
      };

      ws.onerror = () => {};

      wsRef.current = ws;
    } catch {
      intentosRef.current++;
      reconexionRef.current = setTimeout(conectar, 5000);
    }
  }, [uid]);

  useEffect(() => {
    if (uid) conectar();
    return () => {
      if (reconexionRef.current) clearTimeout(reconexionRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [uid, conectar]);

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

  return { conectado, enviar, onMensaje };
}
