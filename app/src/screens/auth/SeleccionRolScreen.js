import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';

const { width } = Dimensions.get('window');
const IMG_WIDTH = width * 0.78;

const clienteImg = require('../../../assets/cliente.png');
const conductorImg = require('../../../assets/conductor.jpeg');

// Título animado letra por letra
function TituloAnimado({ texto, style, delay = 0 }) {
  const letras = texto.split('');
  const anims = useRef(letras.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animaciones = letras.map((_, i) =>
      Animated.timing(anims[i], {
        toValue: 1,
        duration: 60,
        delay: delay + i * 45,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(2)),
      })
    );
    Animated.stagger(20, animaciones).start();
  }, []);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
      {letras.map((letra, i) => (
        <Animated.Text
          key={i}
          style={[
            style,
            {
              opacity: anims[i],
              transform: [
                {
                  translateY: anims[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
                {
                  scale: anims[i].interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.3, 1.15, 1],
                  }),
                },
              ],
            },
          ]}
        >
          {letra === ' ' ? '  ' : letra}
        </Animated.Text>
      ))}
    </View>
  );
}

// Brillo que pasa por encima de la imagen
function BrilloAnimado() {
  const translateX = useRef(new Animated.Value(-IMG_WIDTH)).current;

  useEffect(() => {
    const loop = () => {
      translateX.setValue(-IMG_WIDTH);
      Animated.timing(translateX, {
        toValue: IMG_WIDTH,
        duration: 2000,
        delay: 3000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(() => loop());
    };
    loop();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        ...StyleSheet.absoluteFillObject,
        transform: [{ translateX }],
      }}
    >
      <View
        style={{
          width: 60,
          height: '100%',
          backgroundColor: 'rgba(255,255,255,0.25)',
          transform: [{ skewX: '-20deg' }],
        }}
      />
    </Animated.View>
  );
}

// Botón con imagen animada
function BotonRol({ imagen, etiqueta, colorEtiqueta, onPress, delay }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const slideX = useRef(new Animated.Value(delay < 200 ? -80 : 80)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Entrada con slide + spring
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(slideX, {
          toValue: 0,
          friction: 6,
          tension: 50,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Flotación suave continua
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Pulso del glow
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.7,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.3,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const translateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.9,
      friction: 4,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      friction: 3,
      tension: 80,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={{
        transform: [{ scale: Animated.multiply(scale, pressScale) }, { translateX: slideX }, { translateY }],
        opacity,
      }}
    >
      {/* Glow detrás */}
      <Animated.View
        style={[
          styles.glow,
          { backgroundColor: colorEtiqueta, opacity: glowOpacity },
        ]}
      />
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.botonImagen}
      >
        <Image source={imagen} style={styles.imagen} resizeMode="contain" />
        <BrilloAnimado />
      </TouchableOpacity>
    </Animated.View>
  );
}

// Subtítulo con fade-in
function SubtituloAnimado({ texto }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 600,
        delay: 500,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 600,
        delay: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.Text style={[styles.subtitulo, { opacity, transform: [{ translateY }] }]}>
      {texto}
    </Animated.Text>
  );
}

// Link volver animado
function LinkVolver({ onPress }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 500,
      delay: 1200,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={{ opacity, marginTop: 28 }}>
      <TouchableOpacity onPress={onPress}>
        <Text style={styles.linkTexto}>← Volver al inicio</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function SeleccionRolScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <TituloAnimado texto="¿Cómo quieres registrarte?" style={styles.titulo} />
      <SubtituloAnimado texto="Toca tu rol para continuar" />

      <View style={styles.botonesContainer}>
        <BotonRol
          imagen={clienteImg}
          etiqueta="CLIENTE"
          colorEtiqueta="#1565C0"
          onPress={() => navigation.navigate('RegistroCliente')}
          delay={200}
        />

        <BotonRol
          imagen={conductorImg}
          etiqueta="CONDUCTOR"
          colorEtiqueta="#F9A825"
          onPress={() => navigation.navigate('RegistroConductor')}
          delay={500}
        />
      </View>

      <LinkVolver onPress={() => navigation.goBack()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  titulo: {
    fontSize: 25,
    fontWeight: 'bold',
    color: '#222',
  },
  subtitulo: {
    textAlign: 'center',
    color: '#888',
    fontSize: 15,
    marginBottom: 28,
    marginTop: 6,
  },
  botonesContainer: {
    alignItems: 'center',
    gap: 22,
  },
  glow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: -4,
    borderRadius: 24,
    transform: [{ scaleX: 0.95 }],
  },
  botonImagen: {
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    backgroundColor: '#fff',
  },
  imagen: {
    width: IMG_WIDTH,
    height: IMG_WIDTH * 0.55,
  },
  linkTexto: {
    textAlign: 'center',
    color: '#E53935',
    fontSize: 15,
    fontWeight: '600',
  },
});
