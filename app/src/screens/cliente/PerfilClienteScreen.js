import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Image, ActivityIndicator,
  TextInput, Modal
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import apiInstance from '../../config/api';

export default function PerfilClienteScreen() {
  const { perfil, setPerfil, cerrarSesion } = useAuth();
  const navigation = useNavigation();
  const [actualizando, setActualizando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({
    nombre: perfil?.nombre || '',
    telefono: perfil?.telefono || '',
    direccion: perfil?.direccion || '',
    cedula: perfil?.cedula || '',
  });

  const handleCerrarSesion = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: cerrarSesion },
    ]);
  };

  const cambiarFoto = () => {
    Alert.alert('Foto de perfil', '¿Cómo quieres actualizar tu foto?', [
      {
        text: 'Cámara', onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return Alert.alert('Permiso requerido', 'Necesitamos acceso a tu cámara');
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.95 });
          if (!result.canceled) guardarFoto(result.assets[0].uri);
        }
      },
      {
        text: 'Galería', onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') return Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería');
          const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.95 });
          if (!result.canceled) guardarFoto(result.assets[0].uri);
        }
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const guardarFoto = async (uri) => {
    setActualizando(true);
    try {
      const uid = perfil?.uid || (await require('@react-native-async-storage/async-storage').default.getItem('userUid'));
      const token = await require('@react-native-async-storage/async-storage').default.getItem('authToken');

      // Subir imagen al servidor
      const formData = new FormData();
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      formData.append('imagen', { uri, name: `perfil.${ext}`, type: `image/${ext === 'png' ? 'png' : 'jpeg'}` });
      formData.append('carpeta', 'perfiles');

      const response = await fetch(`${apiInstance.defaults.baseURL}/upload/imagen`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();

      // Guardar URL del servidor (no URI local)
      const fotoUrl = response.ok && data.url
        ? `http://192.168.0.101:3000${data.url}`
        : uri;

      await apiInstance.put(`/auth/perfil/${uid}`, { fotoPerfil: fotoUrl });
      if (setPerfil) setPerfil(prev => ({ ...prev, fotoPerfil: fotoUrl }));
      Alert.alert('¡Listo!', 'Foto de perfil actualizada');
    } catch (err) {
      if (setPerfil) setPerfil(prev => ({ ...prev, fotoPerfil: uri }));
      Alert.alert('Foto guardada', 'La foto se guardó localmente');
    } finally {
      setActualizando(false);
    }
  };

  const guardarPerfil = async () => {
    if (!form.nombre || !form.telefono || !form.direccion) {
      return Alert.alert('Error', 'Nombre, teléfono y dirección son obligatorios');
    }
    setActualizando(true);
    try {
      const res = await apiInstance.put(`/auth/perfil/${perfil.uid}`, form);
      if (setPerfil) setPerfil(res.data.usuario);
      setEditando(false);
      Alert.alert('¡Listo!', 'Perfil actualizado');
    } catch (err) {
      Alert.alert('Error', 'No se pudo actualizar el perfil');
    } finally {
      setActualizando(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>

      {/* Foto de perfil */}
      <TouchableOpacity style={styles.fotoWrapper} onPress={cambiarFoto} disabled={actualizando}>
        {perfil?.fotoPerfil ? (
          <Image source={{ uri: perfil.fotoPerfil }} style={styles.fotoImagen} />
        ) : (
          <View style={styles.fotoPlaceholder}>
            <Text style={styles.fotoLetra}>
              {perfil?.nombre?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
        )}
        {actualizando
          ? <View style={styles.fotoBadge}><ActivityIndicator size="small" color="#fff" /></View>
          : <View style={styles.fotoBadge}><Text style={styles.fotoBadgeTexto}>✏️</Text></View>
        }
      </TouchableOpacity>
      <Text style={styles.fotoHint}>Toca para cambiar foto</Text>

      <Text style={styles.nombre}>{perfil?.nombre}</Text>
      <Text style={styles.rolTag}>👤 Cliente</Text>

      {/* Datos — modo lectura */}
      {!editando ? (
        <View style={styles.seccion}>
          <View style={styles.seccionHeader}>
            <Text style={styles.seccionTitulo}>Mis datos</Text>
            <TouchableOpacity onPress={() => setEditando(true)}>
              <Text style={styles.btnEditar}>✏️ Editar</Text>
            </TouchableOpacity>
          </View>

          {[
            { label: 'Nombre completo',       valor: perfil?.nombre },
            { label: 'Cédula de ciudadanía',  valor: perfil?.cedula },
            { label: 'Número de celular',     valor: perfil?.telefono },
            { label: 'Dirección',             valor: perfil?.direccion },
          ].map(({ label, valor }, i, arr) => (
            <View key={label}>
              <View style={styles.datoFila}>
                <Text style={styles.datoLabel}>{label}</Text>
                <Text style={styles.datoValor}>{valor || '—'}</Text>
              </View>
              {i < arr.length - 1 && <View style={styles.separador} />}
            </View>
          ))}
        </View>
      ) : (
        /* Datos — modo edición */
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Editar datos</Text>

          <Text style={styles.inputLabel}>Nombre completo</Text>
          <TextInput style={styles.input} value={form.nombre}
            onChangeText={v => setForm(p => ({ ...p, nombre: v }))} />

          <Text style={styles.inputLabel}>Cédula de ciudadanía</Text>
          <TextInput style={styles.input} value={form.cedula}
            onChangeText={v => setForm(p => ({ ...p, cedula: v }))} keyboardType="numeric" />

          <Text style={styles.inputLabel}>Número de celular</Text>
          <TextInput style={styles.input} value={form.telefono}
            onChangeText={v => setForm(p => ({ ...p, telefono: v }))} keyboardType="phone-pad" />

          <Text style={styles.inputLabel}>Dirección</Text>
          <TextInput style={styles.input} value={form.direccion}
            onChangeText={v => setForm(p => ({ ...p, direccion: v }))} />

          <View style={styles.editarAcciones}>
            <TouchableOpacity style={styles.btnGuardar} onPress={guardarPerfil} disabled={actualizando}>
              {actualizando
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnGuardarTexto}>Guardar cambios</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnCancelarEdit} onPress={() => {
              setEditando(false);
              setForm({
                nombre: perfil?.nombre || '',
                telefono: perfil?.telefono || '',
                direccion: perfil?.direccion || '',
                cedula: perfil?.cedula || '',
              });
            }}>
              <Text style={styles.btnCancelarEditTexto}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.btnPedirTaxi} onPress={() => navigation.navigate('PedirTaxi')}>
        <Text style={styles.btnPedirTaxiTexto}>🚕 Pedir Taxi</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnSalir} onPress={handleCerrarSesion}>
        <Text style={styles.btnSalirTexto}>Cerrar sesión</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f5f5f5', padding: 24, alignItems: 'center' },

  fotoWrapper: { position: 'relative', marginTop: 16, marginBottom: 4 },
  fotoImagen: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 3, borderColor: '#1565C0',
  },
  fotoPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center',
    elevation: 4,
  },
  fotoLetra: { fontSize: 40, fontWeight: 'bold', color: '#fff' },
  fotoBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  fotoBadgeTexto: { fontSize: 13 },
  fotoHint: { fontSize: 12, color: '#aaa', marginBottom: 10 },

  nombre: { fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 4 },
  rolTag: { fontSize: 14, color: '#666', marginBottom: 20 },

  seccion: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16,
    padding: 20, marginBottom: 16, elevation: 2,
  },
  seccionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
  },
  seccionTitulo: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  btnEditar: { fontSize: 14, color: '#1565C0', fontWeight: '600' },
  datoFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, flexWrap: 'wrap', gap: 4 },
  datoLabel: { fontSize: 13, color: '#888' },
  datoValor: { fontSize: 14, fontWeight: '600', color: '#222', textAlign: 'right', flexShrink: 1 },
  separador: { height: 1, backgroundColor: '#f0f0f0' },

  inputLabel: { fontSize: 12, color: '#888', marginBottom: 4, marginTop: 10, textTransform: 'uppercase' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 12, fontSize: 15, backgroundColor: '#fafafa',
  },
  editarAcciones: { marginTop: 20, gap: 10 },
  btnGuardar: {
    backgroundColor: '#1565C0', borderRadius: 10,
    padding: 14, alignItems: 'center',
  },
  btnGuardarTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnCancelarEdit: {
    borderWidth: 2, borderColor: '#999', borderRadius: 10,
    padding: 12, alignItems: 'center',
  },
  btnCancelarEditTexto: { color: '#666', fontWeight: 'bold', fontSize: 14 },

  btnPedirTaxi: {
    width: '100%', backgroundColor: '#FFC107',
    borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8, elevation: 3,
  },
  btnPedirTaxiTexto: { fontWeight: 'bold', fontSize: 18, color: '#000' },

  btnSalir: {
    width: '100%', borderWidth: 2, borderColor: '#E53935',
    borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8, marginBottom: 24,
  },
  btnSalirTexto: { color: '#E53935', fontWeight: 'bold', fontSize: 16 },
});
