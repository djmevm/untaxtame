import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';

// Bienvenida
import BienvenidaScreen from '../screens/auth/BienvenidaScreen';

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen';
import SeleccionRolScreen from '../screens/auth/SeleccionRolScreen';
import RegistroClienteScreen from '../screens/auth/RegistroClienteScreen';
import RegistroConductorScreen from '../screens/auth/RegistroConductorScreen';

// Cliente screens
import PedirTaxiScreen from '../screens/cliente/PedirTaxiScreen';
import HistorialClienteScreen from '../screens/cliente/HistorialClienteScreen';
import HistorialPagosScreen from '../screens/cliente/HistorialPagosScreen';
import PerfilClienteScreen from '../screens/cliente/PerfilClienteScreen';

// Conductor screens
import ServiciosPendientesScreen from '../screens/conductor/ServiciosPendientesScreen';
import MisServiciosScreen from '../screens/conductor/MisServiciosScreen';
import PerfilConductorScreen from '../screens/conductor/PerfilConductorScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function ClienteTabs() {
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: '#FFC107' }}>
      <Tab.Screen name="PedirTaxi" component={PedirTaxiScreen}
        options={{ title: 'Pide Taxi', tabBarIcon: () => <Text>🚕</Text> }} />
      <Tab.Screen name="HistorialCliente" component={HistorialClienteScreen}
        options={{ title: 'Mis Viajes', tabBarIcon: () => <Text>📋</Text> }} />
      <Tab.Screen name="HistorialPagos" component={HistorialPagosScreen}
        options={{ title: 'Pagos', tabBarIcon: () => <Text>💳</Text> }} />
      <Tab.Screen name="PerfilCliente" component={PerfilClienteScreen}
        options={{ title: 'Mi Perfil', tabBarIcon: () => <Text>👤</Text> }} />
    </Tab.Navigator>
  );
}

function ConductorTabs() {
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: '#FFC107' }}>
      <Tab.Screen name="Pendientes" component={ServiciosPendientesScreen}
        options={{ title: 'Disponibles', tabBarIcon: () => <Text>📡</Text> }} />
      <Tab.Screen name="MisServicios" component={MisServiciosScreen}
        options={{ title: 'Mis Servicios', tabBarIcon: () => <Text>📋</Text> }} />
      <Tab.Screen name="PerfilConductor" component={PerfilConductorScreen}
        options={{ title: 'Mi Perfil', tabBarIcon: () => <Text>👤</Text> }} />
    </Tab.Navigator>
  );
}

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
