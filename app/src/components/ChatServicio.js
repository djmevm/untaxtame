import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Modal
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import api from '../config/api';
import { reproducirSonidoChat } from '../services/sonido';

export default function ChatServicio({ servicioId, visible, onCerrar }) {
  const { perfil } = useAuth();
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const flatListRef = useRef(null);
  const cantidadAnterior = useRef(0);
  const intervaloRef = useRef(null);

  // Cargar mensajes
  const cargarMensajes = async () => {
    if (!servicioId) return;
    try {
      const res = await api.get(`/chat/${servicioId}/mensajes`);
      const nuevosMensajes = res.data;

      // Sonido y vibración si hay mensajes nuevos de otra persona
      if (nuevosMensajes.length > cantidadAnterior.current && cantidadAnterior.current > 0) {
        const nuevos = nuevosMensajes.slice(cantidadAnterior.current);
        const tieneNuevoDeOtro = nuevos.some(m => m.uid !== perfil?.uid);
        if (tieneNuevoDeOtro) {
          reproducirSonidoChat();
        }
      }
      cantidadAnterior.current = nuevosMensajes.length;
      setMensajes(nuevosMensajes);
    } catch {}
    finally { setCargandoInicial(false); }
  };

  // Iniciar/parar polling cuando el chat es visible
  useEffect(() => {
    if (visible && servicioId) {
      setCargandoInicial(true);
      cantidadAnterior.current = 0;
      cargarMensajes();
      intervaloRef.current = setInterval(cargarMensajes, 5000);
    } else {
      if (intervaloRef.current) {
        clearInterval(intervaloRef.current);
        intervaloRef.current = null;
      }
      setMensajes([]);
      cantidadAnterior.current = 0;
    }

    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
    };
  }, [servicioId, visible]);

  // Scroll al final cuando llegan mensajes nuevos
  useEffect(() => {
    if (mensajes.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 200);
    }
  }, [mensajes.length]);

  const enviarMensaje = async () => {
    if (!texto.trim() || enviando) return;
    const textoEnviar = texto.trim();
    setTexto('');
    setEnviando(true);

    try {
      await api.post(`/chat/${servicioId}/mensaje`, { texto: textoEnviar });
      // Recargar inmediatamente después de enviar
      await cargarMensajes();
    } catch {
      setTexto(textoEnviar);
    } finally {
      setEnviando(false);
    }
  };

  if (!visible) return null;

  const esMio = (msg) => msg.uid === perfil?.uid;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onCerrar} style={styles.btnCerrarArea}>
          <Text style={styles.btnCerrar}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitulo}>💬 Chat del servicio</Text>
        <Text style={styles.headerContador}>{mensajes.length} msg</Text>
      </View>

      {/* Mensajes */}
      {cargandoInicial ? (
        <View style={styles.cargandoContainer}>
          <ActivityIndicator size="large" color="#FFC107" />
          <Text style={styles.cargandoTexto}>Cargando mensajes...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={mensajes}
          keyExtractor={(item, index) => item.id || `msg-${index}`}
          style={styles.lista}
          contentContainerStyle={styles.listaContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.vacioContainer}>
              <Text style={styles.vacioIcon}>💬</Text>
              <Text style={styles.vacioTexto}>No hay mensajes aún</Text>
              <Text style={styles.vacioSub}>Envía un mensaje para comunicarte</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.burbuja, esMio(item) ? styles.burbujaMia : styles.burbujaOtra]}>
              {!esMio(item) && (
                <Text style={styles.nombreRemitente}>
                  {item.rol === 'cliente' ? '👤' : '🚕'} {item.nombre}
                </Text>
              )}
              <Text style={[styles.burbujaTexto, esMio(item) ? styles.textoMio : styles.textoOtro]}>
                {item.texto}
              </Text>
              <Text style={[styles.hora, esMio(item) ? styles.horaMia : styles.horaOtra]}>
                {item.creadoEn ? new Date(item.creadoEn).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : ''}
              </Text>
            </View>
          )}
        />
      )}

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Escribe un mensaje..."
          value={texto}
          onChangeText={setTexto}
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={enviarMensaje}
          editable={!enviando}
        />
        <TouchableOpacity
          style={[styles.btnEnviar, (!texto.trim() || enviando) && styles.btnEnviarDisabled]}
          onPress={enviarMensaje}
          disabled={!texto.trim() || enviando}
        >
          {enviando ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.btnEnviarTexto}>➤</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFC107', paddingHorizontal: 16, paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 50 : 14, elevation: 4,
  },
  btnCerrarArea: { padding: 4 },
  btnCerrar: { fontSize: 22, fontWeight: 'bold', color: '#000' },
  headerTitulo: { fontSize: 17, fontWeight: 'bold', color: '#000' },
  headerContador: { fontSize: 12, color: 'rgba(0,0,0,0.5)' },

  cargandoContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cargandoTexto: { color: '#999', marginTop: 10 },

  lista: { flex: 1 },
  listaContent: { padding: 12, paddingBottom: 8 },

  vacioContainer: { alignItems: 'center', marginTop: 80 },
  vacioIcon: { fontSize: 48, marginBottom: 12 },
  vacioTexto: { fontSize: 16, fontWeight: 'bold', color: '#999' },
  vacioSub: { fontSize: 13, color: '#bbb', marginTop: 4 },

  burbuja: { maxWidth: '78%', borderRadius: 16, padding: 12, marginBottom: 8, elevation: 1 },
  burbujaMia: { backgroundColor: '#FFC107', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  burbujaOtra: { backgroundColor: '#fff', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  nombreRemitente: { fontSize: 11, fontWeight: 'bold', color: '#888', marginBottom: 4 },
  burbujaTexto: { fontSize: 15, lineHeight: 20 },
  textoMio: { color: '#000' },
  textoOtro: { color: '#333' },
  hora: { fontSize: 10, marginTop: 4 },
  horaMia: { color: 'rgba(0,0,0,0.4)', textAlign: 'right' },
  horaOtra: { color: '#bbb' },

  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee',
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    maxHeight: 100, backgroundColor: '#fafafa',
  },
  btnEnviar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFC107',
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  btnEnviarDisabled: { backgroundColor: '#ddd' },
  btnEnviarTexto: { fontSize: 20, color: '#000' },
});
