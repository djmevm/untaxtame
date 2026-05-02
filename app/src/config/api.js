import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ═══ CONFIGURACIÓN DE API ═══
// Para desarrollo local: http://192.168.0.101:3000/api
// Para producción: https://tu-dominio.com/api
const API_URL = 'http://192.168.0.101:3000/api';
// Cuando tengas el servidor en producción, cambia la línea de arriba por:
// const API_URL = 'https://api.untaxtame.com/api';

const api = axios.create({ baseURL: API_URL });

// Interceptor: agrega token guardado en AsyncStorage
api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {}
  return config;
});

// Interceptor: si el token expira, intentar refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (refreshToken) {
          const res = await axios.post(`${API_URL}/auth/refresh-token`, { refreshToken });
          await AsyncStorage.setItem('authToken', res.data.token);
          await AsyncStorage.setItem('refreshToken', res.data.refreshToken);
          // Reintentar la petición original
          error.config.headers.Authorization = `Bearer ${res.data.token}`;
          return axios(error.config);
        }
      } catch {}
    }
    return Promise.reject(error);
  }
);

export default api;
