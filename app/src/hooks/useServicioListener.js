import { useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import api from '../config/api';
import { notificarLocal } from '../services/notificaciones';
import { reproducirSonido, reproducirSonidoSOS } from '../services/sonido';
import useWebSocket from './useWebSocket';

export function useClienteServicioListener(clienteUid) {
  const estadoAnterior = useRef(null);

  useEffect(() => {
    if (!clienteUid) return;

    const intervalo = setInterval(async () => {
      try {
        const res = await api.get(`/services/historial/${clienteUid}/cliente`);
        if (!res.data.length) return;

        const ultimo = res.data[0];
        const anterior = estadoAnterior.current;

        if (anterior && anterior !== ultimo.estado) {
          if (ultimo.estado === 'aceptado') {
            reproducirSonido();
            notificarLocal({ titulo: '🚕 ¡Conductor en camino!', cuerpo: `${ultimo.conductorNombre} aceptó tu servicio.` });
          }
          if (ultimo.estado === 'completado') {
            reproducirSonido();
            notificarLocal({ titulo: '✅ Servicio completado', cuerpo: '¡Gracias por usar UntaXtame!' });
          }
          if (ultimo.estado === 'cancelado') {
            reproducirSonido();
            notificarLocal({ titulo: '❌ Servicio cancelado', cuerpo: 'Tu solicitud fue cancelada.' });
          }
        }
        estadoAnterior.current = ultimo.estado;
      } catch {}
    }, 10000);

    return () => clearInterval(intervalo);
  }, [clienteUid]);
}

export function useConductorServiciosListener(conductorUid, onNuevoServicio) {
  const cantidadAnterior = useRef(null);

  useEffect(() => {
    if (!conductorUid) return;

    const intervalo = setInterval(async () => {
      try {
        const res = await api.get('/services/pendientes');
        const cantidad = res.data.length;

        if (cantidadAnterior.current !== null && cantidad > cantidadAnterior.current) {
          const nuevo = res.data[0];
          notificarLocal({ titulo: '📡 Nuevo servicio', cuerpo: `De: ${nuevo.origen} → ${nuevo.destino}` });
          reproducirSonido();
          if (onNuevoServicio) onNuevoServicio(nuevo);
        }
        cantidadAnterior.current = cantidad;
      } catch {}
    }, 10000);

    return () => clearInterval(intervalo);
  }, [conductorUid]);
}

/**
 * Cuando el cliente acepta la oferta del conductor:
 * - Suena alerta
 * - Llama onOfertaAceptada (navegación a Mis Servicios)
 * No dispara al abrir la app si ya había un servicio activo.
 */
export function useConductorOfertaAceptada(conductorUid, onOfertaAceptada) {
  const servicioAnterior = useRef(null);
  const listo = useRef(false);
  const onOfertaRef = useRef(onOfertaAceptada);
  onOfertaRef.current = onOfertaAceptada;

  const { conectado, onMensaje } = useWebSocket(conductorUid, 'conductor');

  const manejarNuevo = useCallback((activo) => {
    if (!activo?.id || !listo.current) return;
    if (activo.conductorUid && activo.conductorUid !== conductorUid) return;
    if (activo.estado !== 'aceptado') return;
    if (activo.id === servicioAnterior.current) return;

    servicioAnterior.current = activo.id;

    reproducirSonidoSOS();
    notificarLocal({
      titulo: '🎉 ¡Oferta aceptada!',
      cuerpo: `${activo.clienteNombre || 'Cliente'} aceptó tu oferta`,
    });

    // Ir directo a Mis Servicios
    if (onOfertaRef.current) onOfertaRef.current(activo);

    Alert.alert(
      '🎉 ¡Oferta aceptada!',
      `${activo.clienteNombre || 'El cliente'} aceptó tu oferta.\n\n📍 ${activo.origen || ''}\n🏁 ${activo.destino || ''}` +
        (activo.tarifaAcordada ? `\n💰 $${Number(activo.tarifaAcordada).toLocaleString('es-CO')}` : ''),
      [{ text: 'Ver servicio', onPress: () => onOfertaRef.current && onOfertaRef.current(activo) }]
    );
  }, [conductorUid]);

  // Semilla inicial: recordar servicio activo sin alertar
  useEffect(() => {
    if (!conductorUid) return;
    listo.current = false;
    let cancelled = false;

    (async () => {
      try {
        const res = await api.get(`/services/activo/${conductorUid}`);
        if (!cancelled && res.data?.servicio?.id) {
          servicioAnterior.current = res.data.servicio.id;
        }
      } catch {}
      if (!cancelled) listo.current = true;
    })();

    return () => { cancelled = true; };
  }, [conductorUid]);

  // WebSocket (rápido)
  useEffect(() => {
    if (!conectado || !conductorUid) return;
    return onMensaje('servicio_actualizado', (data) => {
      const s = data.servicio;
      if (s) manejarNuevo(s);
    });
  }, [conectado, conductorUid, onMensaje, manejarNuevo]);

  // Polling de respaldo
  useEffect(() => {
    if (!conductorUid) return;

    const verificar = async () => {
      if (!listo.current) return;
      try {
        const res = await api.get(`/services/activo/${conductorUid}`);
        if (res.data?.tieneActivo && res.data.servicio) {
          manejarNuevo(res.data.servicio);
        }
      } catch {}
    };

    const intervalo = setInterval(verificar, 8000);
    return () => clearInterval(intervalo);
  }, [conductorUid, manejarNuevo]);
}
