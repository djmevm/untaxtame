import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../config/api';

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

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    await AsyncStorage.setItem('authToken', res.data.token);
    await AsyncStorage.setItem('refreshToken', res.data.refreshToken);
    await AsyncStorage.setItem('userUid', res.data.uid);
    setUsuario({ uid: res.data.uid, email: res.data.email });
    setPerfil(res.data.perfil);
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
