import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

// ═══ CONFIGURACIÓN DE API ═══
// Desarrollo local (WiFi misma red): http://192.168.0.101:3000/api
// Producción (datos móviles + WiFi): https://tu-dominio.com/api
// Android emulador: http://10.0.2.2:3000/api

// Detectar automáticamente la URL según el entorno
const API_URLS = {
  local: 'http://192.168.0.101:3000/api',
  emulador: 'http://10.0.2.2:3000/api',
  produccion: 'https://untaxtame-production.up.railway.app/api',
};

// URL de producción (Railway) — funciona con WiFi y datos móviles
let API_URL = API_URLS.produccion;

// ═══ CONFIGURACIÓN OPTIMIZADA PARA REDES MÓVILES ═══
const api = axios.create({
  baseURL: API_URL,
  timeout: 15000, // 15 segundos timeout (datos móviles pueden ser lentos)
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// ═══ SISTEMA DE REINTENTOS AUTOMÁTICOS ═══
const MAX_REINTENTOS = 3;
const DELAY_BASE = 1000; // 1 segundo base entre reintentos

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const esErrorDeRed = (error) => {
  return (
    !error.response && // No hay respuesta del servidor
    (error.code === 'ECONNABORTED' ||
     error.code === 'ERR_NETWORK' ||
     error.message?.includes('Network Error') ||
     error.message?.includes('timeout'))
  );
};

// ═══ INTERCEPTOR DE REQUEST ═══
api.interceptors.request.use(async (config) => {
  try {
    // Agregar token de autenticación
    const token = await AsyncStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Verificar conectividad antes de enviar
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      return Promise.reject({
        message: 'Sin conexión a internet. Verifica tu WiFi o datos móviles.',
        code: 'NO_CONNECTION',
      });
    }
  } catch {}
  return config;
});

// ═══ INTERCEPTOR DE RESPONSE CON REINTENTOS ═══
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // Inicializar contador de reintentos
    if (!config) return Promise.reject(error);
    config.__retryCount = config.__retryCount || 0;

    // Reintentar en errores de red (no en errores 4xx/5xx del servidor)
    if (esErrorDeRed(error) && config.__retryCount < MAX_REINTENTOS) {
      config.__retryCount += 1;
      const delay = DELAY_BASE * config.__retryCount; // Backoff exponencial simple
      console.log(`[API] Reintento ${config.__retryCount}/${MAX_REINTENTOS} en ${delay}ms...`);
      await esperar(delay);
      return api(config);
    }

    // Token expirado: intentar refresh
    if (error.response?.status === 401 && !config.__isRetryAuth) {
      config.__isRetryAuth = true;
      try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (refreshToken) {
          const res = await axios.post(`${API_URL}/auth/refresh-token`, { refreshToken });
          await AsyncStorage.setItem('authToken', res.data.token);
          await AsyncStorage.setItem('refreshToken', res.data.refreshToken);
          config.headers.Authorization = `Bearer ${res.data.token}`;
          return api(config);
        }
      } catch {
        // Refresh falló, limpiar tokens
        await AsyncStorage.multiRemove(['authToken', 'refreshToken']);
      }
    }

    return Promise.reject(error);
  }
);

// ═══ HELPER: Cambiar URL de API dinámicamente ═══
export const setApiUrl = (url) => {
  api.defaults.baseURL = url;
  API_URL = url;
};

// ═══ HELPER: Verificar conexión al servidor ═══
export const verificarConexion = async () => {
  try {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      return { conectado: false, tipo: 'sin_internet', mensaje: 'Sin conexión a internet' };
    }

    const res = await axios.get(API_URL.replace('/api', '/'), { timeout: 5000 });
    return {
      conectado: true,
      tipo: netState.type, // 'wifi', 'cellular', etc.
      mensaje: `Conectado por ${netState.type}`,
    };
  } catch {
    return {
      conectado: false,
      tipo: 'sin_servidor',
      mensaje: 'No se puede conectar al servidor',
    };
  }
};

export default api;
