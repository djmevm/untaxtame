import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';

export default function RadarBuscando() {
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;
  const rotacion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animación de pulsos
    const animarPulso = (anim, delay) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ).start();
    };

    animarPulso(pulse1, 0);
    animarPulso(pulse2, 600);
    animarPulso(pulse3, 1200);

    // Rotación del radar
    Animated.loop(
      Animated.timing(rotacion, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  const escala = (anim) => anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.5] });
  const opacidad = (anim) => anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] });
  const giro = rotacion.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.container}>
      {/* Pulsos */}
      <Animated.View style={[styles.pulso, { transform: [{ scale: escala(pulse1) }], opacity: opacidad(pulse1) }]} />
      <Animated.View style={[styles.pulso, { transform: [{ scale: escala(pulse2) }], opacity: opacidad(pulse2) }]} />
      <Animated.View style={[styles.pulso, { transform: [{ scale: escala(pulse3) }], opacity: opacidad(pulse3) }]} />

      {/* Centro con icono giratorio */}
      <Animated.View style={[styles.centro, { transform: [{ rotate: giro }] }]}>
        <Text style={styles.centroIcono}>📡</Text>
      </Animated.View>

      <Text style={styles.texto}>Buscando conductores cercanos...</Text>
      <Text style={styles.subtexto}>Espera mientras llegan ofertas</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 30, marginBottom: 14,
  },
  pulso: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    borderWidth: 2, borderColor: '#F97316',
  },
  centro: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center',
    elevation: 4, borderWidth: 2, borderColor: '#F97316',
  },
  centroIcono: { fontSize: 28 },
  texto: { marginTop: 16, fontSize: 15, fontWeight: 'bold', color: '#333' },
  subtexto: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
});
