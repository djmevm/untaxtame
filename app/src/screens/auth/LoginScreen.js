import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert('Error', 'Completa todos los campos');

    // Validar formato de email
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return Alert.alert('Error', 'Formato de correo inválido');
    }

    if (password.length < 6) {
      return Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
    }

    setCargando(true);
    try {
      await login(email, password);
    } catch (err) {
      Alert.alert('Error', 'Correo o contraseña incorrectos');
    } finally {
      setCargando(false);
    }
  };

  const handleRecuperarPassword = () => {
    if (!email) {
      return Alert.alert('Recuperar contraseña', 'Escribe tu correo electrónico primero');
    }
    Alert.alert('Recuperar contraseña', `Se enviará un enlace a ${email}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Enviar', onPress: async () => {
          try {
            await api.post('/auth/recuperar-password', { email });
            Alert.alert('¡Enviado!', 'Revisa tu correo electrónico');
          } catch {
            Alert.alert('Error', 'No se pudo enviar el correo');
          }
        }
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.titulo}>UntaXtame</Text>
        <Text style={styles.subtitulo}>S.A.S - Servicio con Calidad</Text>
      </View>
      <View style={styles.form}>
        <TextInput style={styles.input} placeholder="Correo electrónico" value={email}
          onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Contraseña" value={password}
          onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity onPress={handleRecuperarPassword}>
          <Text style={styles.olvidoTexto}>¿Olvidaste tu contraseña?</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimario} onPress={handleLogin} disabled={cargando}>
          <Text style={styles.btnTexto}>{cargando ? 'Ingresando...' : 'Ingresar'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('SeleccionRol')}>
          <Text style={styles.linkTexto}>¿No tienes cuenta? Regístrate aquí</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFC107', justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 40 },
  titulo: { fontSize: 36, fontWeight: 'bold', color: '#000' },
  subtitulo: { fontSize: 14, color: '#333', marginTop: 4 },
  form: { backgroundColor: '#fff', borderRadius: 16, padding: 24, elevation: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 16 },
  btnPrimario: { backgroundColor: '#FFC107', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 16 },
  btnTexto: { fontWeight: 'bold', fontSize: 16, color: '#000' },
  olvidoTexto: { textAlign: 'right', color: '#1565C0', fontSize: 13, marginBottom: 16, marginTop: -8 },
  linkTexto: { textAlign: 'center', color: '#E53935', fontSize: 14 },
});
