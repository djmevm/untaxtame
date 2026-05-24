import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../config/api';

// ═══ SISTEMA DE CACHÉ CON TTL ═══
// Reduce lecturas repetitivas a Firestore almacenando datos en memoria

const cache = new Map(); // key → { data, timestamp, ttl }

/**
 * Obtener dato del caché
 * @returns {object|null} Dato cacheado o null si expiró
 */
function obtenerDelCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Guardar dato en caché
 */
function guardarEnCache(key, data, ttl) {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

/**
 * Invalidar una entrada del caché
 */
export function invalidarCache(key) {
  cache.delete(key);
}

/**
 * Invalidar todas las entradas que empiecen con un prefijo
 */
export function invalidarCachePrefijo(prefijo) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefijo)) cache.delete(key);
  }
}

/**
 * Limpiar todo el caché
 */
export function limpiarCache() {
  cache.clear();
}

// ═══ HOOK: Fetch con caché ═══
/**
 * Hook que hace fetch a un endpoint con caché automático
 * @param {string} endpoint - URL del API
 * @param {number} ttl - Tiempo de vida en ms (default: 30s)
 * @param {number} refetchInterval - Intervalo de refresco en ms (0 = sin polling)
 * @param {boolean} enabled - Si el fetch está habilitado
 */
export function useCachedFetch(endpoint, { ttl = 30000, refetchInterval = 0, enabled = true } = {}) {
  const [data, setData] = useState(() => obtenerDelCache(endpoint));
  const [cargando, setCargando] = useState(!obtenerDelCache(endpoint));
  const [error, setError] = useState(null);
  const intervaloRef = useRef(null);

  const fetchData = useCallback(async (forzar = false) => {
    if (!enabled || !endpoint) return;

    // Verificar caché primero (a menos que sea forzado)
    if (!forzar) {
      const cached = obtenerDelCache(endpoint);
      if (cached) {
        setData(cached);
        setCargando(false);
        return cached;
      }
    }

    try {
      setCargando(true);
      const res = await api.get(endpoint);
      guardarEnCache(endpoint, res.data, ttl);
      setData(res.data);
      setError(null);
      return res.data;
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      return null;
    } finally {
      setCargando(false);
    }
  }, [endpoint, ttl, enabled]);

  // Fetch inicial
  useEffect(() => {
    if (!enabled || !endpoint) return;
    fetchData();
  }, [endpoint, enabled]);

  // Polling con caché (solo si refetchInterval > 0)
  useEffect(() => {
    if (!enabled || !endpoint || refetchInterval <= 0) return;

    intervaloRef.current = setInterval(() => {
      // Solo refetch si el caché expiró
      const cached = obtenerDelCache(endpoint);
      if (!cached) {
        fetchData(true);
      } else {
        setData(cached);
      }
    }, refetchInterval);

    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
    };
  }, [endpoint, refetchInterval, enabled, fetchData]);

  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return { data, cargando, error, refetch };
}

// ═══ HOOK: Perfil con caché (60s TTL) ═══
export function usePerfil(uid) {
  return useCachedFetch(
    uid ? `/auth/perfil/${uid}` : null,
    { ttl: 60000, refetchInterval: 60000, enabled: !!uid }
  );
}

// ═══ HOOK: Saldo con caché (30s TTL) ═══
export function useSaldo(uid) {
  return useCachedFetch(
    uid ? `/billetera/saldo/${uid}` : null,
    { ttl: 30000, refetchInterval: 30000, enabled: !!uid }
  );
}

// ═══ HOOK: Servicios pendientes con caché (15s TTL) ═══
export function useServiciosPendientes(enabled = true) {
  return useCachedFetch(
    '/services/pendientes',
    { ttl: 15000, refetchInterval: 30000, enabled }
  );
}

// ═══ HOOK: Alertas conductores con caché (30s TTL) ═══
export function useAlertasConductores(enabled = true) {
  return useCachedFetch(
    '/emergencia/alertas-conductores',
    { ttl: 30000, refetchInterval: 60000, enabled }
  );
}
