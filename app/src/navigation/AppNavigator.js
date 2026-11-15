import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import CustomTabBar from '../components/CustomTabBar';
import { useEnviarUbicacion } from '../hooks/useWebSocket';
import api from '../config/api';

// Bienvenida
import BienvenidaScreen from '../screens/auth/BienvenidaScreen';

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen';
import SeleccionRolScreen from '../screens/auth/SeleccionRolScreen';
import RegistroClienteScreen from '../screens/auth/RegistroClienteScreen';
import RegistroConductorScreen from '../screens/auth/RegistroConductorScreen';

// Cliente screens
import PedirTaxiScreen from '../screens/cliente/PedirTaxiScreen';
import ProgramarViajeScreen from '../screens/cliente/ProgramarViajeScreen';
import HistorialClienteScreen from '../screens/cliente/HistorialClienteScreen';
import HistorialPagosScreen from '../screens/cliente/HistorialPagosScreen';
import ServiciosAliadosScreen from '../screens/cliente/ServiciosAliadosScreen';
import PerfilClienteScreen from '../screens/cliente/PerfilClienteScreen';

// Conductor screens
import ServiciosPendientesScreen from '../screens/conductor/ServiciosPendientesScreen';
import MisServiciosScreen from '../screens/conductor/MisServiciosScreen';
import ViajesProgramadosScreen from '../screens/conductor/ViajesProgramadosScreen';
import PerfilConductorScreen from '../screens/conductor/PerfilConductorScreen';
import MiTaxiScreen from '../screens/conductor/MiTaxiScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function ClienteTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="PedirTaxi" component={PedirTaxiScreen} />
      <Tab.Screen name="ProgramarViaje" component={ProgramarViajeScreen} />
      <Tab.Screen name="ServiciosAliados" component={ServiciosAliadosScreen} />
      <Tab.Screen name="HistorialCliente" component={HistorialClienteScreen} />
      <Tab.Screen name="HistorialPagos" component={HistorialPagosScreen} />
      <Tab.Screen name="PerfilCliente" component={PerfilClienteScreen} />
    </Tab.Navigator>
  );
}

function ConductorTabs() {
  const { perfil } = useAuth();
  const [servicioActivoId, setServicioActivoId] = useState(null);

  // Detectar servicio activo para tracking por viaje
  useEffect(() => {
    if (!perfil?.uid) return;
    let cancelled = false;

    const cargar = async () => {
      try {
        const res = await api.get(`/services/activo/${perfil.uid}`);
        if (!cancelled) {
          setServicioActivoId(res.data?.tieneActivo ? res.data.servicio?.id : null);
        }
      } catch {
        if (!cancelled) setServicioActivoId(null);
      }
    };

    cargar();
    const intervalo = setInterval(cargar, 20000);
    return () => {
      cancelled = true;
      clearInterval(intervalo);
    };
  }, [perfil?.uid]);

  // Transmitir GPS: panel admin + cliente del viaje activo
  const activo = !!(perfil && (perfil.disponible || perfil.enServicio || servicioActivoId));
  const { gpsPerdido } = useEnviarUbicacion(perfil?.uid, perfil?.nombre, perfil?.placa, activo, servicioActivoId);

  return (
    <View style={{ flex: 1 }}>
      {gpsPerdido && servicioActivoId ? (
        <View style={gpsBannerStyles.banner}>
          <Text style={gpsBannerStyles.texto}>📡 Sin señal GPS — activa ubicación para el rastreo en vivo</Text>
        </View>
      ) : null}
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Pendientes" component={ServiciosPendientesScreen} />
        <Tab.Screen name="MisServicios" component={MisServiciosScreen} />
        <Tab.Screen name="Programados" component={ViajesProgramadosScreen} />
        <Tab.Screen name="MiTaxi" component={MiTaxiScreen} />
        <Tab.Screen name="PerfilConductor" component={PerfilConductorScreen} />
      </Tab.Navigator>
    </View>
  );
}

const gpsBannerStyles = StyleSheet.create({
  banner: {
    backgroundColor: '#B71C1C',
    paddingVertical: 8,
    paddingHorizontal: 12,
    paddingTop: 40,
  },
  texto: { color: '#fff', fontWeight: 'bold', fontSize: 13, textAlign: 'center' },
});

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SeleccionRol" component={SeleccionRolScreen} />
      <Stack.Screen name="RegistroCliente" component={RegistroClienteScreen} />
      <Stack.Screen name="RegistroConductor" component={RegistroConductorScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { usuario, perfil, cargando } = useAuth();
  const [bienvenidaVista, setBienvenidaVista] = useState(false);

  // Siempre mostrar bienvenida primero al abrir la app
  if (!bienvenidaVista) {
    return <BienvenidaScreen onTerminar={() => setBienvenidaVista(true)} />;
  }

  // Después de la bienvenida, mostrar loading si aún carga auth
  if (cargando) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' }}>
        <ActivityIndicator size="large" color="#FFC107" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!usuario ? (
        <AuthStack />
      ) : perfil?.rol === 'conductor' ? (
        <ConductorTabs />
      ) : (
        <ClienteTabs />
      )}
    </NavigationContainer>
  );
}
