import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, FlatList, KeyboardAvoidingView, Platform,
  ActivityIndicator, Modal, Keyboard, TouchableWithoutFeedback
} from 'react-native';
import { Feather } from '@expo/vector-icons';
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
  const inputRef = useRef(null);

  // Cargar mensajes
  const cargarMensajes = useCallback(async () => {
    if (!servicioId) return;
    try {
      const res = await api.get(`/chat/${servicioId}/mensajes`);
      const nuevosMensajes = res.data;

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
  }, [servicioId, perfil?.uid]);

  // Iniciar/parar polling cuando el chat es visible
  useEffect(() => {
    if (visible && servicioId) {
      setCargandoInicial(true);
      cantidadAnterior.current = 0;
      cargarMensajes();
      intervaloRef.current = setInterval(cargarMensajes, 4000);
    } else {
      if (intervaloRef.current) {
        clearInterval(intervaloRef.current);
        intervaloRef.current = null;
      }
    }

    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
    };
  }, [servicioId, visible, cargarMensajes]);

  // Scroll al final cuando llegan mensajes nuevos
  useEffect(() => {
    if (mensajes.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [mensajes.length]);

  const enviarMensaje = async () => {
    const textoLimpio = texto.trim();
    if (!textoLimpio || enviando) return;

    setTexto('');
    setEnviando(true);

    try {
      await api.post(`/chat/${servicioId}/mensaje`, { texto: textoLimpio });
      await cargarMensajes();
    } catch {
      setTexto(textoLimpio);
    } finally {
      setEnviando(false);
    }
  };

  if (!visible) return null;

  const esMio = (msg) => msg.uid === perfil?.uid;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onCerrar}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCerrar} style={styles.btnCerrarArea}>
            <Feather name="x" size={22} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitulo}>Chat del servicio</Text>
          <View style={styles.headerRight}>
            <Feather name="message-circle" size={14} color="#64748B" />
            <Text style={styles.headerContador}>{mensajes.length}</Text>
          </View>
        </View>

        {/* Mensajes */}
        {cargandoInicial ? (
          <View style={styles.cargandoContainer}>
            <ActivityIndicator size="large" color="#F97316" />
            <Text style={styles.cargandoTexto}>Cargando mensajes...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={mensajes}
            keyExtractor={(item, index) => item.id || `msg-${index}`}
            style={styles.lista}
            contentContainerStyle={[
              styles.listaContent,
              mensajes.length === 0 && styles.listaVacia,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.vacioContainer}>
                <Feather name="message-circle" size={48} color="#CBD5E1" />
                <Text style={styles.vacioTexto}>Sin mensajes aún</Text>
                <Text style={styles.vacioSub}>Envía un mensaje para comunicarte</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.burbuja, esMio(item) ? styles.burbujaMia : styles.burbujaOtra]}>
                {!esMio(item) && (
                  <View style={styles.remitenteFila}>
                    <Feather name={item.rol === 'cliente' ? 'user' : item.rol === 'admin' ? 'shield' : 'truck'} size={11} color="#64748B" />
                    <Text style={styles.nombreRemitente}>{item.nombre}</Text>
                  </View>
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

        {/* Input - KeyboardAvoidingView solo envuelve el input */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Escribe un mensaje..."
              placeholderTextColor="#94A3B8"
              value={texto}
              onChangeText={setTexto}
              multiline
              maxLength={500}
              editable={!enviando}
              blurOnSubmit={false}
              onSubmitEditing={enviarMensaje}
            />
            <TouchableOpacity
              style={[styles.btnEnviar, (!texto.trim() || enviando) && styles.btnEnviarDisabled]}
              onPress={enviarMensaje}
              disabled={!texto.trim() || enviando}
            >
              {enviando ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 54 : 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  btnCerrarArea: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitulo: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerContador: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },

  cargandoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cargandoTexto: {
    color: '#94A3B8',
    marginTop: 10,
    fontSize: 12,
  },

  lista: { flex: 1 },
  listaContent: { padding: 16, paddingBottom: 8 },
  listaVacia: { flex: 1, justifyContent: 'center' },

  vacioContainer: { alignItems: 'center' },
  vacioTexto: { fontSize: 15, fontWeight: 'bold', color: '#94A3B8', marginTop: 12 },
  vacioSub: { fontSize: 12, color: '#CBD5E1', marginTop: 4 },

  burbuja: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  burbujaMia: {
    backgroundColor: '#F97316',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  burbujaOtra: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  remitenteFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  nombreRemitente: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  burbujaTexto: { fontSize: 15, lineHeight: 20 },
  textoMio: { color: '#FFFFFF' },
  textoOtro: { color: '#1E293B' },
  hora: { fontSize: 10, marginTop: 4 },
  horaMia: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  horaOtra: { color: '#94A3B8' },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    backgroundColor: '#F8FAFC',
    color: '#1E293B',
  },
  btnEnviar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnEnviarDisabled: {
    backgroundColor: '#E2E8F0',
  },
});
