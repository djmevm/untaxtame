import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView, Image, ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';
import TerminosCondiciones from '../../components/TerminosCondiciones';

const DOCUMENTOS = [
  { key: 'cedulaFrente',     label: 'Cédula de ciudadanía (frente)',  icon: '🪪' },
  { key: 'cedulaReverso',    label: 'Cédula de ciudadanía (reverso)', icon: '🪪' },
  { key: 'licencia',         label: 'Licencia de conducción vigente', icon: '📄' },
  { key: 'tarjetaPropiedad', label: 'Tarjeta de propiedad del vehículo', icon: '📋' },
  { key: 'tarjetaOperacion', label: 'Tarjeta de operación del taxi',  icon: '🚕' },
];

export default function RegistroConductorScreen({ navigation }) {
  const { registrar } = useAuth();
  const [form, setForm] = useState({
    nombre: '', cedula: '', telefono: '', email: '', password: '', placa: '',
  });
  const [docs, setDocs] = useState({});
  const [cargando, setCargando] = useState(false);
  const [paso, setPaso] = useState(1);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  const set = (campo, valor) => setForm(prev => ({ ...prev, [campo]: valor }));

  const seleccionarImagen = async (key) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería');
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (!result.canceled) {
      setDocs(prev => ({ ...prev, [key]: result.assets[0].uri }));
    }
  };

  const tomarFoto = async (key) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      return Alert.alert('Permiso requerido', 'Necesitamos acceso a tu cámara');
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.9,
    });
    if (!result.canceled) {
      setDocs(prev => ({ ...prev, [key]: result.assets[0].uri }));
    }
  };

  const mostrarOpcionesImagen = (key, label) => {
    Alert.alert(label, '¿Cómo quieres agregar la imagen?', [
      { text: 'Cámara', onPress: () => tomarFoto(key) },
      { text: 'Galería', onPress: () => seleccionarImagen(key) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const validarPaso1 = () => {
    const { nombre, cedula, telefono, email, password, placa } = form;
    if (!nombre || !cedula || !telefono || !email || !password || !placa) {
      Alert.alert('Error', 'Completa todos los campos');
      return false;
    }
    if (cedula.length < 6) {
      Alert.alert('Error', 'Número de cédula inválido');
      return false;
    }
    return true;
  };

  const validarPaso2 = () => {
    const faltantes = DOCUMENTOS.filter(d => !docs[d.key]).map(d => d.label);
    if (faltantes.length > 0) {
      Alert.alert('Documentos incompletos', `Falta:\n• ${faltantes.join('\n• ')}`);
      return false;
    }
    return true;
  };

  const handleRegistro = async () => {
    if (!validarPaso2()) return;
    if (!aceptaTerminos) return Alert.alert('Error', 'Debes aceptar los Términos y Condiciones');
    setCargando(true);
    try {
      // Registrar cuenta via API REST
      const result = await registrar(form.email, form.password, {
        nombre: form.nombre,
        cedula: form.cedula,
        telefono: form.telefono,
        rol: 'conductor',
        placa: form.placa.toUpperCase(),
        documentos: {},
        estadoVerificacion: 'pendiente',
      });

      // Subir documentos
      try {
        const formData = new FormData();
        for (const campo of DOCUMENTOS) {
          if (docs[campo.key]) {
            const uri = docs[campo.key];
            const extension = uri.split('.').pop()?.toLowerCase() || 'jpg';
            formData.append(campo.key, {
              uri,
              name: `${campo.key}.${extension}`,
              type: `image/${extension === 'png' ? 'png' : 'jpeg'}`,
            });
          }
        }

        await fetch(`${api.defaults.baseURL}/upload/documentos`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${result.token}` },
          body: formData,
        });
      } catch (uploadErr) {
        console.warn('Error subiendo documentos:', uploadErr.message);
      }

      Alert.alert(
        '¡Registro enviado!',
        'Tu cuenta está en revisión. Te notificaremos cuando sea aprobada.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || err.message);
    } finally {
      setCargando(false);
    }
  };

  // ── PASO 1: Datos personales ──
  if (paso === 1) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.titulo}>Registro Conductor</Text>
        <Text style={styles.subtitulo}>UntaXtame S.A.S</Text>

        <View style={styles.pasoIndicador}>
          <View style={[styles.pasoBurbuja, styles.pasoActivo]}><Text style={styles.pasoNum}>1</Text></View>
          <View style={styles.pasoLinea} />
          <View style={styles.pasoBurbuja}><Text style={styles.pasoNum}>2</Text></View>
        </View>
        <Text style={styles.pasoLabel}>Paso 1 de 2 — Datos personales</Text>

        <TextInput style={styles.input} placeholder="Nombre completo" placeholderTextColor="#999" value={form.nombre}
          onChangeText={v => set('nombre', v)} autoCapitalize="words" />

        <TextInput style={styles.input} placeholder="Número de cédula" placeholderTextColor="#999" value={form.cedula}
          onChangeText={v => set('cedula', v)} keyboardType="numeric" />

        <TextInput style={styles.input} placeholder="Número de celular" placeholderTextColor="#999" value={form.telefono}
          onChangeText={v => set('telefono', v)} keyboardType="phone-pad" />

        <TextInput style={styles.input} placeholder="Placa del taxi" placeholderTextColor="#999" value={form.placa}
          onChangeText={v => set('placa', v.toUpperCase())} autoCapitalize="characters" />

        <TextInput style={styles.input} placeholder="Correo electrónico" placeholderTextColor="#999" value={form.email}
          onChangeText={v => set('email', v)} keyboardType="email-address" autoCapitalize="none" />

        <TextInput style={styles.input} placeholder="Contraseña" placeholderTextColor="#999" value={form.password}
          onChangeText={v => set('password', v)} secureTextEntry />

        <TouchableOpacity style={styles.btn} onPress={() => validarPaso1() && setPaso(2)}>
          <Text style={styles.btnTexto}>Siguiente → Documentos</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>← Volver</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── PASO 2: Documentos ──
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>Documentos</Text>
      <Text style={styles.subtitulo}>UntaXtame S.A.S</Text>

      <View style={styles.pasoIndicador}>
        <View style={[styles.pasoBurbuja, styles.pasoCompletado]}><Text style={styles.pasoNum}>✓</Text></View>
        <View style={[styles.pasoLinea, styles.pasoLineaActiva]} />
        <View style={[styles.pasoBurbuja, styles.pasoActivo]}><Text style={styles.pasoNum}>2</Text></View>
      </View>
      <Text style={styles.pasoLabel}>Paso 2 de 2 — Sube tus documentos</Text>

      {DOCUMENTOS.map(({ key, label, icon }) => (
        <View key={key} style={styles.docCard}>
          <View style={styles.docInfo}>
            <Text style={styles.docIcon}>{icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.docLabel}>{label}</Text>
              <Text style={[styles.docEstado, docs[key] ? styles.docOk : styles.docPendiente]}>
                {docs[key] ? '✅ Cargado' : '⏳ Pendiente'}
              </Text>
            </View>
          </View>
          {docs[key] && (
            <Image source={{ uri: docs[key] }} style={styles.docPreview} />
          )}
          <TouchableOpacity
            style={[styles.btnDoc, docs[key] && styles.btnDocOk]}
            onPress={() => mostrarOpcionesImagen(key, label)}
          >
            <Text style={styles.btnDocTexto}>{docs[key] ? 'Cambiar' : 'Agregar foto'}</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TerminosCondiciones tipo="conductor" aceptado={aceptaTerminos} onAceptar={setAceptaTerminos} />

      <TouchableOpacity style={[styles.btn, !aceptaTerminos && { opacity: 0.5 }]} onPress={handleRegistro} disabled={cargando || !aceptaTerminos}>
        {cargando
          ? <ActivityIndicator color="#000" />
          : <Text style={styles.btnTexto}>Enviar registro</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setPaso(1)}>
        <Text style={styles.link}>← Volver a datos personales</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', padding: 24 },
  titulo: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', color: '#000', marginTop: 16 },
  subtitulo: { textAlign: 'center', color: '#666', marginBottom: 16 },

  pasoIndicador: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  pasoBurbuja: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#ddd', alignItems: 'center', justifyContent: 'center'
  },
  pasoActivo: { backgroundColor: '#FFC107' },
  pasoCompletado: { backgroundColor: '#2E7D32' },
  pasoNum: { fontWeight: 'bold', color: '#fff' },
  pasoLinea: { flex: 0.3, height: 3, backgroundColor: '#ddd', marginHorizontal: 8 },
  pasoLineaActiva: { backgroundColor: '#2E7D32' },
  pasoLabel: { textAlign: 'center', color: '#666', marginBottom: 20, fontSize: 13 },

  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 12, marginBottom: 14, fontSize: 16
  },
  btn: {
    backgroundColor: '#FFC107', borderRadius: 8,
    padding: 14, alignItems: 'center', marginBottom: 16, marginTop: 8
  },
  btnTexto: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  link: { textAlign: 'center', color: '#E53935', marginBottom: 24 },

  docCard: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 12,
    padding: 14, marginBottom: 14, backgroundColor: '#fafafa'
  },
  docInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  docIcon: { fontSize: 28, marginRight: 12 },
  docLabel: { fontSize: 14, fontWeight: '600', color: '#333', flexWrap: 'wrap' },
  docEstado: { fontSize: 12, marginTop: 2 },
  docOk: { color: '#2E7D32' },
  docPendiente: { color: '#999' },
  docPreview: { width: '100%', height: 200, borderRadius: 8, marginBottom: 10, resizeMode: 'contain' },
  btnDoc: {
    borderWidth: 2, borderColor: '#FFC107', borderRadius: 8,
    padding: 10, alignItems: 'center'
  },
  btnDocOk: { borderColor: '#2E7D32' },
  btnDocTexto: { fontWeight: 'bold', color: '#333' },
});
