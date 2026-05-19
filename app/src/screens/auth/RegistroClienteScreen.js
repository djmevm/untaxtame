import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView, Image, ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import TerminosCondiciones from '../../components/TerminosCondiciones';

export default function RegistroClienteScreen({ navigation }) {
  const { registrar } = useAuth();
  const [form, setForm] = useState({
    nombre: '', cedula: '', telefono: '', direccion: '', email: '', password: ''
  });
  const [fotoPerfil, setFotoPerfil] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  const set = (campo, valor) => setForm(prev => ({ ...prev, [campo]: valor }));

  const seleccionarFoto = () => {
    Alert.alert('Foto de perfil', '¿Cómo quieres agregar tu foto?', [
      {
        text: 'Cámara', onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return Alert.alert('Permiso requerido', 'Necesitamos acceso a tu cámara');
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.95 });
          if (!result.canceled) setFotoPerfil(result.assets[0].uri);
        }
      },
      {
        text: 'Galería', onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') return Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería');
          const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.95 });
          if (!result.canceled) setFotoPerfil(result.assets[0].uri);
        }
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handleRegistro = async () => {
    const { nombre, cedula, telefono, direccion, email, password } = form;
    if (!nombre || !cedula || !telefono || !direccion || !email || !password) {
      return Alert.alert('Error', 'Completa todos los campos');
    }
    if (cedula.length < 6) return Alert.alert('Error', 'Número de cédula inválido');
    if (telefono.length < 7) return Alert.alert('Error', 'Número de celular inválido');
    if (!aceptaTerminos) return Alert.alert('Error', 'Debes aceptar los Términos y Condiciones');

    setCargando(true);
    try {
      await registrar(email, password, {
        nombre,
        cedula,
        telefono,
        direccion,
        rol: 'cliente',
        fotoPerfil: fotoPerfil || null,
      });
      Alert.alert('¡Bienvenido!', 'Cuenta creada exitosamente');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>Registro Cliente</Text>
      <Text style={styles.subtitulo}>UntaXtame S.A.S</Text>

      {/* Foto de perfil */}
      <TouchableOpacity style={styles.fotoContainer} onPress={seleccionarFoto}>
        {fotoPerfil ? (
          <Image source={{ uri: fotoPerfil }} style={styles.fotoImagen} />
        ) : (
          <View style={styles.fotoPlaceholder}>
            <Text style={styles.fotoIcono}>📷</Text>
            <Text style={styles.fotoTexto}>Agregar foto{'\n'}de perfil</Text>
          </View>
        )}
        <View style={styles.fotoBadge}><Text style={styles.fotoBadgeTexto}>+</Text></View>
      </TouchableOpacity>
      <Text style={styles.fotoHint}>Opcional — puedes agregarla después</Text>

      {/* Campos */}
      <TextInput
        style={styles.input}
        placeholder="Nombre completo"
        placeholderTextColor="#999"
        value={form.nombre}
        onChangeText={v => set('nombre', v)}
        autoCapitalize="words"
      />
      <TextInput
        style={styles.input}
        placeholder="Número de cédula"
        placeholderTextColor="#999"
        value={form.cedula}
        onChangeText={v => set('cedula', v)}
        keyboardType="numeric"
      />
      <TextInput
        style={styles.input}
        placeholder="Número de celular"
        placeholderTextColor="#999"
        value={form.telefono}
        onChangeText={v => set('telefono', v)}
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        placeholder="Dirección de residencia"
        placeholderTextColor="#999"
        value={form.direccion}
        onChangeText={v => set('direccion', v)}
        autoCapitalize="words"
      />
      <TextInput
        style={styles.input}
        placeholder="Correo electrónico"
        placeholderTextColor="#999"
        value={form.email}
        onChangeText={v => set('email', v)}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        placeholderTextColor="#999"
        value={form.password}
        onChangeText={v => set('password', v)}
        secureTextEntry
      />

      <TerminosCondiciones tipo="cliente" aceptado={aceptaTerminos} onAceptar={setAceptaTerminos} />

      <TouchableOpacity style={[styles.btn, !aceptaTerminos && { opacity: 0.5 }]} onPress={handleRegistro} disabled={cargando || !aceptaTerminos}>
        {cargando
          ? <ActivityIndicator color="#000" />
          : <Text style={styles.btnTexto}>Crear cuenta</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>← Volver</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', padding: 24 },
  titulo: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', color: '#000', marginTop: 16 },
  subtitulo: { textAlign: 'center', color: '#666', marginBottom: 20 },

  fotoContainer: {
    alignSelf: 'center', marginBottom: 6, position: 'relative',
  },
  fotoImagen: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 3, borderColor: '#1565C0',
  },
  fotoPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#E3F2FD', borderWidth: 2,
    borderColor: '#1565C0', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  fotoIcono: { fontSize: 28 },
  fotoTexto: { fontSize: 11, color: '#1565C0', textAlign: 'center', marginTop: 2 },
  fotoBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  fotoBadgeTexto: { color: '#fff', fontSize: 18, fontWeight: 'bold', lineHeight: 22 },
  fotoHint: { textAlign: 'center', color: '#aaa', fontSize: 12, marginBottom: 20 },

  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 12, marginBottom: 14, fontSize: 16,
  },
  btn: {
    backgroundColor: '#1565C0', borderRadius: 8,
    padding: 14, alignItems: 'center', marginBottom: 16, marginTop: 4,
  },
  btnTexto: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  link: { textAlign: 'center', color: '#E53935', marginBottom: 24 },
});
