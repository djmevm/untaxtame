import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_ICONS = {
  PedirTaxi: '🚕',
  HistorialCliente: '📋',
  HistorialPagos: '💳',
  PerfilCliente: '👤',
  Pendientes: '📡',
  MisServicios: '📋',
  PerfilConductor: '👤',
};

const TAB_LABELS = {
  PedirTaxi: 'Pide Taxi',
  HistorialCliente: 'Mis Viajes',
  HistorialPagos: 'Pagos',
  PerfilCliente: 'Mi Perfil',
  Pendientes: 'Disponibles',
  MisServicios: 'Mis Servicios',
  PerfilConductor: 'Mi Perfil',
};

function TabItem({ label, icon, isFocused, onPress, onLongPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(isFocused ? 1 : 0.6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: isFocused ? 1.1 : 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: isFocused ? 1 : 0.6,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isFocused]);

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tabItem}
      activeOpacity={0.7}
    >
      <Animated.View style={[
        styles.tabContent,
        { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
      ]}>
        <Text style={styles.tabIcon}>{icon}</Text>
        <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
          {label}
        </Text>
        {isFocused && <View style={styles.indicator} />}
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const icon = TAB_ICONS[route.name] || '📌';
        const label = TAB_LABELS[route.name] || route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <TabItem
            key={route.key}
            label={label}
            icon={icon}
            isFocused={isFocused}
            onPress={onPress}
            onLongPress={onLongPress}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 8,
    paddingBottom: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 24,
    marginBottom: 3,
  },
  tabLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#F97316',
    fontWeight: '700',
  },
  indicator: {
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#F97316',
    marginTop: 4,
  },
});
