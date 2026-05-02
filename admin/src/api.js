import axios from 'axios';
import { auth } from './firebase';

// ═══ CONFIGURACIÓN DE API ═══
// Para desarrollo: http://localhost:3000/api
// Para producción: https://tu-dominio.com/api
const BACKEND_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const api = axios.create({ baseURL: BACKEND_URL });

// Interceptor: agrega el token de Firebase en cada petición
api.interceptors.request.use(async (config) => {
  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn('No se pudo obtener token:', err.message);
  }
  return config;
});

export default api;
