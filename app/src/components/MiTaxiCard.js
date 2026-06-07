import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import api from '../config/api';

var SERVICIOS = [
  { key: 'maletas', label: 'Maletas extras' },
  { key: 'discapacitado', label: 'Pasajero discapacitado' },
  { key: 'bicicleta', label: 'Soporte bicicleta' },
  { key: 'aireAcondicionado', label: 'Aire acondicionado' },
  { key: 'mascotas', label: 'Mascotas permitidas' },
];

export default function MiTaxiCard() {
  var { perfil, setPerfil } = useAuth();
  var [mostrar, setMostrar] = useState(false);
  var [serviciosOfrecidos, setServiciosOfrecidos] = useState(perfil?.serviciosOfrecidos || []);
  var [subiendoFoto, setSubiendoFoto] = useState(false);

  var toggleServicio = async function(key) {
    var nuevos = serviciosOfrecidos.includes(key)
      ? serviciosOfrecidos.filter(function(s) { return s !== key; })
      : serviciosOfrecidos.concat([key]);
    setServiciosOfrecidos(nuevos);
    try {
      await api.put('/auth/perfil/' + perfil?.uid, { serviciosOfrecidos: nuevos });
      if (setPerfil) setPerfil(function(prev) { return Object.assign({}, prev, { serviciosOfrecidos: nuevos }); });
    } catch (e) {}
  };

  var cambiarFoto = async function() {
    try {
      var ImagePicker = require('expo-image-picker');
      var p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (p.status !== 'granted') return Alert.alert('Permiso requerido');
      var result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [16, 9], quality: 0.9 });
      if (result.canceled) return;
      setSubiendoFoto(true);
      var uri = result.assets[0].uri;
      var AsyncStorage = require('@react-native-async-storage/async-storage').default;
      var token = await AsyncStorage.getItem('authToken');
      var fd = new FormData();
      fd.append('imagen', { uri: uri, name: 'vehiculo.jpg', type: 'image/jpeg' });
      var response = await fetch(api.defaults.baseURL + '/upload/imagen', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd,
      });
      var data = await response.json();
      if (response.ok && data.url) {
        var url = data.url.startsWith('http') ? data.url : api.defaults.baseURL.replace('/api', '') + data.url;
        await api.put('/auth/perfil/' + perfil?.uid, { fotoVehiculo: url });
        if (setPerfil) setPerfil(function(prev) { return Object.assign({}, prev, { fotoVehiculo: url }); });
        Alert.alert('Listo', 'Foto actualizada');
      }
    } catch (e) { Alert.alert('Error', 'No se pudo subir'); }
    finally { setSubiendoFoto(false); }
  };

  if (!perfil) return null;

  return (
    <View>
      <TouchableOpacity style={styles.boton} onPress={function() { setMostrar(true); }}>
        <Text style={styles.botonTexto}>Mi Taxi - {perfil.placa || 'Config'}</Text>
        <Text style={styles.botonSub}>{serviciosOfrecidos.length} servicios activos</Text>
      </TouchableOpacity>

      <Modal visible={mostrar} animationType="slide" onRequestClose={function() { setMostrar(false); }}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>Mi Taxi</Text>
            <TouchableOpacity onPress={function() { setMostrar(false); }}>
              <Text style={styles.modalCerrar}>X</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.placa}>{perfil.placa || 'Sin placa'}</Text>

          <TouchableOpacity style={styles.fotoCard} onPress={cambiarFoto} disabled={subiendoFoto}>
            {subiendoFoto ? (
              <View style={styles.fotoEmpty}><ActivityIndicator color="#FFC107" /><Text style={{ color: '#888', marginTop: 8 }}>Subiendo...</Text></View>
            ) : perfil.fotoVehiculo ? (
              <Image source={{ uri: perfil.fotoVehiculo }} style={styles.fotoImg} />
            ) : (
              <View style={styles.fotoEmpty}><Text style={{ color: '#999' }}>Toca para agregar foto del taxi</Text></View>
            )}
          </TouchableOpacity>

          <Text style={styles.secTitulo}>Servicios que ofrezco</Text>
          <Text style={styles.secDesc}>Los clientes veran esto al solicitar.</Text>

          {SERVICIOS.map(function(item) {
            var activo = serviciosOfrecidos.includes(item.key);
            return (
              <TouchableOpacity key={item.key} style={[styles.servItem, activo && styles.servActivo]} onPress={function() { toggleServicio(item.key); }}>
                <Text style={{ flex: 1, fontSize: 15 }}>{item.label}</Text>
                <View style={[styles.check, activo && styles.checkOn]}>
                  {activo && <Text style={{ color: '#fff', fontWeight: 'bold' }}>V</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Modal>
    </View>
  );
}

var styles = StyleSheet.create({
  boton: { backgroundColor: '#FFC107', borderRadius: 12, padding: 14, marginBottom: 12, alignItems: 'center' },
  botonTexto: { fontSize: 16, fontWeight: 'bold', color: '#000' },
  botonSub: { fontSize: 12, color: '#555', marginTop: 2 },
  modalContent: { flexGrow: 1, padding: 20, backgroundColor: '#f5f5f5' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitulo: { fontSize: 22, fontWeight: 'bold' },
  modalCerrar: { fontSize: 22, color: '#999', padding: 8 },
  placa: { fontSize: 20, fontWeight: 'bold', color: '#FFC107', letterSpacing: 2, marginBottom: 16 },
  fotoCard: { borderRadius: 14, overflow: 'hidden', marginBottom: 20, backgroundColor: '#fff', elevation: 2 },
  fotoImg: { width: '100%', height: 180, resizeMode: 'cover' },
  fotoEmpty: { width: '100%', height: 140, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderWidth: 2, borderColor: '#ddd', borderStyle: 'dashed', borderRadius: 14 },
  secTitulo: { fontSize: 17, fontWeight: 'bold', marginBottom: 4 },
  secDesc: { fontSize: 13, color: '#888', marginBottom: 14 },
  servItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#E2E8F0' },
  servActivo: { backgroundColor: '#F0FDF4', borderColor: '#16A34A' },
  check: { width: 28, height: 28, borderRadius: 7, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
});
