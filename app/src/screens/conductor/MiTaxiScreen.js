import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';

var SERVICIOS = [
  { key: 'maletas', label: 'Maletas extras' },
  { key: 'discapacitado', label: 'Pasajero discapacitado' },
  { key: 'bicicleta', label: 'Soporte bicicleta' },
  { key: 'aireAcondicionado', label: 'Aire acondicionado' },
  { key: 'mascotas', label: 'Mascotas permitidas' },
];

export default function MiTaxiScreen() {
  var auth = useAuth();
  var perfil = auth.perfil;
  var setPerfil = auth.setPerfil;
  var [serviciosOfrecidos, setServiciosOfrecidos] = useState(perfil ? (perfil.serviciosOfrecidos || []) : []);
  var [subiendoFoto, setSubiendoFoto] = useState(false);

  var toggleServicio = function(key) {
    var nuevos = serviciosOfrecidos.indexOf(key) >= 0
      ? serviciosOfrecidos.filter(function(s) { return s !== key; })
      : serviciosOfrecidos.concat([key]);
    setServiciosOfrecidos(nuevos);
    if (perfil && perfil.uid) {
      api.put('/auth/perfil/' + perfil.uid, { serviciosOfrecidos: nuevos }).catch(function() {});
      if (setPerfil) setPerfil(function(prev) { return Object.assign({}, prev, { serviciosOfrecidos: nuevos }); });
    }
  };

  var cambiarFoto = function() {
    var ImagePicker = require('expo-image-picker');
    ImagePicker.requestMediaLibraryPermissionsAsync().then(function(p) {
      if (p.status !== 'granted') { Alert.alert('Permiso requerido'); return; }
      ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [16, 9], quality: 0.8 }).then(function(result) {
        if (result.canceled) return;
        setSubiendoFoto(true);
        var uri = result.assets[0].uri;
        var AsyncStorage = require('@react-native-async-storage/async-storage').default;
        AsyncStorage.getItem('authToken').then(function(token) {
          var fd = new FormData();
          fd.append('imagen', { uri: uri, name: 'vehiculo.jpg', type: 'image/jpeg' });
          fetch(api.defaults.baseURL + '/upload/imagen', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd,
          }).then(function(r) { return r.json(); }).then(function(data) {
            if (data.url) {
              var url = data.url.indexOf('http') === 0 ? data.url : api.defaults.baseURL.replace('/api', '') + data.url;
              api.put('/auth/perfil/' + perfil.uid, { fotoVehiculo: url }).then(function() {
                if (setPerfil) setPerfil(function(prev) { return Object.assign({}, prev, { fotoVehiculo: url }); });
                Alert.alert('Listo', 'Foto actualizada');
              });
            }
            setSubiendoFoto(false);
          }).catch(function() { setSubiendoFoto(false); });
        });
      });
    });
  };

  if (!perfil) return React.createElement(View, { style: styles.center }, React.createElement(ActivityIndicator, { size: 'large', color: '#FFC107' }));

  return React.createElement(ScrollView, { contentContainerStyle: styles.container },
    React.createElement(Text, { style: styles.titulo }, 'Mi Taxi'),
    React.createElement(Text, { style: styles.placa }, perfil.placa || 'Sin placa'),

    React.createElement(TouchableOpacity, { style: styles.fotoCard, onPress: cambiarFoto, disabled: subiendoFoto },
      subiendoFoto
        ? React.createElement(View, { style: styles.fotoEmpty }, React.createElement(ActivityIndicator, { color: '#FFC107' }))
        : perfil.fotoVehiculo
          ? React.createElement(Image, { source: { uri: perfil.fotoVehiculo }, style: styles.fotoImg })
          : React.createElement(View, { style: styles.fotoEmpty }, React.createElement(Text, { style: { color: '#999' } }, 'Toca para agregar foto del taxi'))
    ),

    React.createElement(View, { style: styles.seccion },
      React.createElement(Text, { style: styles.secTitulo }, 'Servicios que ofrezco'),
      React.createElement(Text, { style: styles.secDesc }, 'Los clientes veran esto al solicitar.'),
      SERVICIOS.map(function(item) {
        var activo = serviciosOfrecidos.indexOf(item.key) >= 0;
        return React.createElement(TouchableOpacity, { key: item.key, style: [styles.servItem, activo && styles.servActivo], onPress: function() { toggleServicio(item.key); } },
          React.createElement(Text, { style: { flex: 1, fontSize: 15 } }, item.label),
          React.createElement(View, { style: [styles.check, activo && styles.checkOn] },
            activo ? React.createElement(Text, { style: { color: '#fff', fontWeight: 'bold' } }, 'V') : null
          )
        );
      })
    )
  );
}

var styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flexGrow: 1, backgroundColor: '#f5f5f5', padding: 20, paddingBottom: 40 },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#1E293B', marginBottom: 4 },
  placa: { fontSize: 18, fontWeight: 'bold', color: '#FFC107', letterSpacing: 2, marginBottom: 20 },
  fotoCard: { borderRadius: 14, overflow: 'hidden', marginBottom: 20, backgroundColor: '#fff', elevation: 2 },
  fotoImg: { width: '100%', height: 180, resizeMode: 'cover' },
  fotoEmpty: { width: '100%', height: 140, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderWidth: 2, borderColor: '#ddd', borderStyle: 'dashed', borderRadius: 14 },
  seccion: { backgroundColor: '#fff', borderRadius: 14, padding: 18, elevation: 2 },
  secTitulo: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  secDesc: { fontSize: 12, color: '#888', marginBottom: 14 },
  servItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#E2E8F0' },
  servActivo: { backgroundColor: '#F0FDF4', borderColor: '#16A34A' },
  check: { width: 28, height: 28, borderRadius: 7, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
});
