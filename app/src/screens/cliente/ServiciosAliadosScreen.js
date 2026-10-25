import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking,
} from 'react-native';

// Directorio de servicios aliados de UntaXtame.
// Para agregar más aliados, solo añade un objeto a esta lista.
const ALIADOS = [
  {
    id: 'baterias',
    icon: '🔋',
    titulo: 'Encendidos / carga eléctrica',
    descripcion: 'Servicio de encendidos o carga eléctrica para vehículos y motos (baterías).',
    contacto: 'Jhon Jairo',
    telefono: '573183023984',
    telefonoVisible: '+57 318 3023984',
    color: '#F59E0B',
  },
  {
    id: 'productos',
    icon: '🛒',
    titulo: 'Productos para carro y moto',
    descripcion: 'Venta de productos y accesorios para carro y moto.',
    contacto: 'Gisella',
    telefono: '573133234242',
    telefonoVisible: '+57 313 3234242',
    color: '#1565C0',
  },
];

export default function ServiciosAliadosScreen() {
  const abrirWhatsApp = (telefono) => {
    Linking.openURL(`https://wa.me/${telefono}`).catch(() =>
      Linking.openURL(`https://api.whatsapp.com/send?phone=${telefono}`)
    );
  };

  const llamar = (telefono) => {
    Linking.openURL(`tel:+${telefono}`);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>🛠️ Servicios aliados</Text>
      <Text style={styles.sub}>
        Contacta directamente a nuestros aliados para servicios adicionales de tu carro o moto.
      </Text>

      {ALIADOS.map((a) => (
        <View key={a.id} style={[styles.card, { borderTopColor: a.color }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.icon}>{a.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitulo}>{a.titulo}</Text>
              <Text style={styles.cardContacto}>👤 {a.contacto}</Text>
            </View>
          </View>

          <Text style={styles.cardDescripcion}>{a.descripcion}</Text>
          <Text style={styles.cardTelefono}>📱 {a.telefonoVisible}</Text>

          <View style={styles.acciones}>
            <TouchableOpacity style={styles.btnWhatsApp} onPress={() => abrirWhatsApp(a.telefono)} activeOpacity={0.85}>
              <Text style={styles.btnWhatsAppTexto}>💬 WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnLlamar} onPress={() => llamar(a.telefono)} activeOpacity={0.85}>
              <Text style={styles.btnLlamarTexto}>📞 Llamar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <Text style={styles.nota}>
        Estos servicios son prestados por aliados externos. UntaXtame facilita el contacto. 💛🖤
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#f5f5f5', flexGrow: 1 },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 2 },
  sub: { fontSize: 13, color: '#777', marginBottom: 18 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 16, elevation: 2, borderTopWidth: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  icon: { fontSize: 34 },
  cardTitulo: { fontSize: 16, fontWeight: 'bold', color: '#222' },
  cardContacto: { fontSize: 13, color: '#666', marginTop: 2 },
  cardDescripcion: { fontSize: 13, color: '#555', lineHeight: 19, marginBottom: 8 },
  cardTelefono: { fontSize: 14, color: '#333', fontWeight: '600', marginBottom: 14 },
  acciones: { flexDirection: 'row', gap: 10 },
  btnWhatsApp: { flex: 1, backgroundColor: '#25D366', borderRadius: 10, padding: 13, alignItems: 'center' },
  btnWhatsAppTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnLlamar: { flex: 1, backgroundColor: '#1565C0', borderRadius: 10, padding: 13, alignItems: 'center' },
  btnLlamarTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  nota: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 8, lineHeight: 17 },
});
