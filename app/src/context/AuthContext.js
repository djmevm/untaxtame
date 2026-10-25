import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../config/api';

const AuthContext = createContext();

// Clave donde cacheamos el perfil para poder mostrar la app sin señal
const PERFIL_CACHE_KEY = 'perfilCache';

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Al iniciar, restaurar la sesión guardada SIN depender de la red.
  // La sesión solo se cierra si el usuario toca "Cerrar sesión" o si el
  // servidor responde explícitamente que el token es inválido (401/403).
  useEffect(() => {
    const restaurarSesion = async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        const uid = await AsyncStorage.getItem('userUid');

        if (!token || !uid) {
          // No hay sesión guardada: el usuario debe iniciar sesión.
          setCargando(false);
          return;
        }

        // 1) Restaurar INMEDIATAMENTE desde caché local (funciona sin señal).
        setUsuario({ uid });
        try {
          const perfilCacheRaw = await AsyncStorage.getItem(PERFIL_CACHE_KEY);
          if (perfilCacheRaw) {
            setPerfil(JSON.parse(perfilCacheRaw));
          }
        } catch {}

        // Ya podemos mostrar la app aunque no haya internet.
        setCargando(false);

        // 2) En segundo plano, intentar refrescar el perfil desde el backend.
        //    Solo cerramos sesión si el token es rechazado (401/403).
        try {
          const res = await api.get(`/auth/perfil/${uid}`);
          setPerfil(res.data);
          await AsyncStorage.setItem(PERFIL_CACHE_KEY, JSON.stringify(res.data));
        } catch (err) {
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            // Token realmente inválido/expirado: cerrar sesión.
            await AsyncStorage.multiRemove([
              'authToken', 'refreshToken', 'userUid', PERFIL_CACHE_KEY,
            ]);
            setUsuario(null);
            setPerfil(null);
          }
          // Error de red / timeout / servidor caído: NO cerramos sesión,
          // seguimos con el perfil en caché. El usuario sigue dentro.
        }

        // Registrar push token en segundo plano (no crítico).
        try {
          const pushResult = await require('../services/push').registrarPushToken(uid);
          if (pushResult) console.log('PUSH TOKEN OK: ' + pushResult);
        } catch (e) { console.log('PUSH ERROR: ' + e.message); }
      } catch {
        // Error inesperado al leer AsyncStorage: no borramos nada,
        // simplemente dejamos de cargar para no bloquear la app.
        setCargando(false);
      }
    };
    restaurarSesion();
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    await AsyncStorage.setItem('authToken', res.data.token);
    await AsyncStorage.setItem('refreshToken', res.data.refreshToken);
    await AsyncStorage.setItem('userUid', res.data.uid);
    if (res.data.perfil) {
      await AsyncStorage.setItem(PERFIL_CACHE_KEY, JSON.stringify(res.data.perfil));
    }
    setUsuario({ uid: res.data.uid, email: res.data.email });
    setPerfil(res.data.perfil);
    // Registrar push token en segundo plano
    try { require('../services/push').registrarPushToken(res.data.uid); } catch (e) {}
    return res.data;
  };

  const registrar = async (email, password, datos) => {
    const res = await api.post('/auth/register-full', { email, password, ...datos });
    await AsyncStorage.setItem('authToken', res.data.token);
    await AsyncStorage.setItem('refreshToken', res.data.refreshToken);
    await AsyncStorage.setItem('userUid', res.data.uid);
    if (res.data.perfil) {
      await AsyncStorage.setItem(PERFIL_CACHE_KEY, JSON.stringify(res.data.perfil));
    }
    setUsuario({ uid: res.data.uid });
    setPerfil(res.data.perfil);
    return res.data;
  };

  // Mantener la caché del perfil sincronizada cuando se actualiza desde pantallas.
  // Soporta las dos formas de uso, igual que setState de React:
  //   actualizarPerfil(nuevoObjeto)         → valor directo
  //   actualizarPerfil(prev => ({...prev})) → función updater
  const actualizarPerfil = (valorOFuncion) => {
    setPerfil((prev) => {
      const nuevo = typeof valorOFuncion === 'function'
        ? valorOFuncion(prev)
        : valorOFuncion;
      // Persistir en caché local (sin bloquear la actualización de estado).
      try {
        if (nuevo) {
          AsyncStorage.setItem(PERFIL_CACHE_KEY, JSON.stringify(nuevo)).catch(() => {});
        }
      } catch {}
      return nuevo;
    });
  };

  // Cierre de sesión EXPLÍCITO (única forma de salir).
  const cerrarSesion = async () => {
    await AsyncStorage.multiRemove([
      'authToken', 'refreshToken', 'userUid', PERFIL_CACHE_KEY,
    ]);
    setUsuario(null);
    setPerfil(null);
  };

  return (
    <AuthContext.Provider
      value={{
        usuario,
        perfil,
        setPerfil: actualizarPerfil,
        cargando,
        login,
        registrar,
        cerrarSesion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
