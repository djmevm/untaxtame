import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../config/api';
import { registrarTokenPush, configurarListeners, limpiarBadge } from '../services/notificaciones';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Al iniciar, verificar si hay sesión guardada
  useEffect(() => {
    const verificarSesion = async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        const uid = await AsyncStorage.getItem('userUid');
        if (token && uid) {
          const res = await api.get(`/auth/perfil/${uid}`);
          setUsuario({ uid });
          setPerfil(res.data);

          // Registrar push token al restaurar sesión
          registrarTokenPush(uid).catch(() => {});
        }
      } catch {
        // Token expirado o inválido, limpiar
        await AsyncStorage.multiRemove(['authToken', 'refreshToken', 'userUid']);
      } finally {
        setCargando(false);
      }
    };
    verificarSesion();
  }, []);

  // Configurar listeners de notificaciones cuando hay usuario
  useEffect(() => {
    if (!usuario?.uid) return;

    limpiarBadge();

    const cleanup = configurarListeners(
      // Cuando llega notificación en primer plano
      (data) => {
        console.log('[NOTIF] Recibida en primer plano:', data.tipo);
      },
      // Cuando el usuario toca la notificación
      (data) => {
        console.log('[NOTIF] Usuario tocó notificación:', data.tipo);
        // Aquí se puede navegar a la pantalla correspondiente
      }
    );

    return cleanup;
  }, [usuario?.uid]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    await AsyncStorage.setItem('authToken', res.data.token);
    await AsyncStorage.setItem('refreshToken', res.data.refreshToken);
    await AsyncStorage.setItem('userUid', res.data.uid);
    setUsuario({ uid: res.data.uid, email: res.data.email });
    setPerfil(res.data.perfil);

    // Registrar push token al hacer login
    registrarTokenPush(res.data.uid).catch(() => {});

    return res.data;
  };

  const registrar = async (email, password, datos) => {
    const res = await api.post('/auth/register-full', { email, password, ...datos });
    await AsyncStorage.setItem('authToken', res.data.token);
    await AsyncStorage.setItem('refreshToken', res.data.refreshToken);
    await AsyncStorage.setItem('userUid', res.data.uid);
    setUsuario({ uid: res.data.uid });
    setPerfil(res.data.perfil);
    return res.data;
  };

  const cerrarSesion = async () => {
    await AsyncStorage.multiRemove(['authToken', 'refreshToken', 'userUid']);
    setUsuario(null);
    setPerfil(null);
  };

  return (
    <AuthContext.Provider value={{ usuario, perfil, setPerfil, cargando, login, registrar, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
