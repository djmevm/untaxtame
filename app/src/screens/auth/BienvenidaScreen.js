import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, Animated, Easing, StatusBar,
} from 'react-native';

const { width, height } = Dimensions.get('window');
const bienvenidaImg = require('../../../assets/bienvenida.jpg');

const DURACION_SPLASH = 10;

export default function BienvenidaScreen({ onTerminar }) {
  const [segundos, setSegundos] = useState(DURACION_SPLASH);
  const [listo, setListo] = useState(false);
  const terminadoRef = useRef(false);
  const fadeImg = useRef(new Animated.Value(0)).current;
  const scaleImg = useRef(new Animated.Value(1.05)).current;
  const fadeBtn = useRef(new Animated.Value(0)).current;
  const slideBtn = useRef(new Animated.Value(30)).current;
  const pulseBtn = useRef(new Animated.Value(1)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const salir = useCallback(() => {
    if (terminadoRef.current) return;
    terminadoRef.current = true;
    setListo(true);
  }, []);

  useEffect(() => {
    if (listo) onTerminar();
  }, [listo]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeImg, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(scaleImg, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(fadeBtn, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(slideBtn, { toValue: 0, friction: 6, tension: 50, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseBtn, { toValue: 1.06, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseBtn, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: DURACION_SPLASH * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // Auto-avanzar después de 10 segundos
    const timeout = setTimeout(() => salir(), DURACION_SPLASH * 1000);

    // Countdown visual
    const intervalo = setInterval(() => {
      setSegundos(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => {
      clearTimeout(timeout);
      clearInterval(intervalo);
    };
  }, [salir]);

  const onPressIn = () => Animated.spring(pressScale, { toValue: 0.9, friction: 4, useNativeDriver: true }).start();
  const onPressOut = () => Animated.spring(pressScale, { toValue: 1, friction: 3, useNativeDriver: true }).start();

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <Animated.Image
        source={bienvenidaImg}
        style={[styles.imagen, { opacity: fadeImg, transform: [{ scale: scaleImg }] }]}
        resizeMode="contain"
      />

      <View style={styles.degradado} />

      <View style={styles.progressContainer}>
        <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
      </View>

      <View style={styles.contadorContainer}>
        <Text style={styles.contadorTexto}>{segundos}s</Text>
      </View>

      <Animated.View style={[styles.botonContainer, { opacity: fadeBtn, transform: [{ translateY: slideBtn }] }]}>
        <Animated.View style={{ transform: [{ scale: Animated.multiply(pulseBtn, pressScale) }] }}>
          <TouchableOpacity
            style={styles.boton}
            activeOpacity={0.85}
            onPress={salir}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
          >
            <Text style={styles.botonTexto}>COMENZAR</Text>
            <Text style={styles.botonFlecha}> ✈</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a0a' },
  imagen: { position: 'absolute', width, height, top: 0, left: 0 },
  degradado: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.10, backgroundColor: 'rgba(26,26,10,0.95)' },
  progressContainer: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', zIndex: 10 },
  progressBar: { height: 4, backgroundColor: '#FFC107' },
  contadorContainer: { position: 'absolute', top: 45, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, zIndex: 10 },
  contadorTexto: { color: '#FFC107', fontSize: 13, fontWeight: 'bold' },
  botonContainer: { position: 'absolute', bottom: height * 0.02, left: 0, right: 0, alignItems: 'center' },
  boton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#2E7D32',
    paddingVertical: 16, paddingHorizontal: 50, borderRadius: 30,
    elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4, shadowRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
  },
  botonTexto: { color: '#fff', fontSize: 22, fontWeight: 'bold', letterSpacing: 3 },
  botonFlecha: { color: '#fff', fontSize: 20 },
});
