import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import api from '../config/api';

export default function MensajesAdmin({ uid }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mostrar, setMostrar] = useState(false);
  const flatRef = useRef(null);

  useEffect(() => {
    if (!uid || !mostrar) return;
    cargar();
    const intervalo = setInterval(cargar, 60000);
    return () => clearInterval(intervalo);
  }, [uid, mostrar]);

  const cargar = async () => {
    try {
      const res = await api.get(`/chat/directo/${uid}/mensajes`);
      setMensajes(res.data);
    } catch {}
  };

  const enviar = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      await api.post(`/chat/directo/${uid}/mensaje`, { texto: texto.trim() });
      setTexto('');
      cargar();
    } catch {}
    finally { setEnviando(false); }
  };

  const totalMensajes = mensajes.length;

  useEffect(() => {
    if (totalMensajes > 0 && !mostrar) {
      setMostrar(true);
    }
  }, [totalMensajes]);

  return (
    <View style={styles.seccion}>
      <TouchableOpacity onPress={() => setMostrar(!mostrar)}>
        <View style={styles.headerRow}>
          <Text style={styles.titulo}>💬 Mensajes Admin</Text>
          {totalMensajes > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{totalMensajes}</Text>
            </View>
          )}
          <Text style={styles.flecha}>{mostrar ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {mostrar && (
        <View style={styles.chatContainer}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Escribe al admin..."
              placeholderTextColor="#999"
              value={texto}
              onChangeText={setTexto}
              maxLength={500}
              blurOnSubmit={false}
              returnKeyType="send"
              onSubmitEditing={enviar}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.btnEnviar, !texto.trim() && { backgroundColor: '#ddd' }]}
              onPress={enviar}
              disabled={!texto.trim() || enviando}
            >
              <Text style={styles.btnEnviarTexto}>➤</Text>
            </TouchableOpacity>
          </View>

          {mensajes.length === 0 ? (
            <Text style={styles.vacio}>Sin mensajes</Text>
          ) : (
            <FlatList
              ref={flatRef}
              data={mensajes}
              keyExtractor={(item, i) => item.id || `m-${i}`}
              style={styles.lista}
              onContentSizeChange={() => flatRef.current?.scrollToEnd()}
              renderItem={({ item }) => (
                <View style={[styles.burbuja, item.rol === 'admin' ? styles.burbujaAdmin : styles.burbujaMia]}>
                  <Text style={styles.remitente}>
                    {item.rol === 'admin' ? '🛡️ Admin' : '👤 Tú'}
                  </Text>
                  <Text style={styles.texto}>{item.texto}</Text>
                  <Text style={styles.hora}>
                    {item.creadoEn ? new Date(item.creadoEn).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 12, elevation: 2, width: '100%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { fontSize: 15, fontWeight: 'bold', color: '#333', flex: 1 },
  badge: { backgroundColor: '#F97316', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  flecha: { fontSize: 14, color: '#999' },
  chatContainer: { marginTop: 12 },
  vacio: { textAlign: 'center', color: '#999', padding: 20 },
  lista: { maxHeight: 150 },
  burbuja: { borderRadius: 12, padding: 10, marginBottom: 6, maxWidth: '85%' },
  burbujaAdmin: { backgroundColor: '#FFF3E0', alignSelf: 'flex-start', borderLeftWidth: 3, borderLeftColor: '#F97316' },
  burbujaMia: { backgroundColor: '#E3F2FD', alignSelf: 'flex-end', borderRightWidth: 3, borderRightColor: '#1565C0' },
  remitente: { fontSize: 10, color: '#888', fontWeight: '600', marginBottom: 2 },
  texto: { fontSize: 14, color: '#333' },
  hora: { fontSize: 9, color: '#bbb', marginTop: 3, textAlign: 'right' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: '#333',
  },
  btnEnviar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F97316',
    alignItems: 'center', justifyContent: 'center',
  },
  btnEnviarTexto: { fontSize: 16, color: '#fff' },
});
