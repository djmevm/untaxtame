import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import api from '../config/api';
import { notificarLocal } from '../services/notificaciones';
import { reproducirSonido, reproducirSonidoSOS } from '../services/sonido';

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
    }, 15000);

    return () => clearInterval(intervalo);
  }, [conductorUid]);
}

// Detectar cuando el cliente acepta la oferta del conductor
export function useConductorOfertaAceptada(conductorUid, onOfertaAceptada) {
  const servicioAnterior = useRef(null);

  useEffect(() => {
    if (!conductorUid) return;

    const verificar = async () => {
      try {
        const res = await api.get(`/services/historial/${conductorUid}/conductor`);
        const activo = res.data.find(s => s.estado === 'aceptado');

        if (activo && activo.id !== servicioAnterior.current) {
          servicioAnterior.current = activo.id;
          reproducirSonidoSOS();
          Alert.alert(
            '🎉 ¡Oferta aceptada!',
            `${activo.clienteNombre} aceptó tu oferta.\n\n📍 Origen: ${activo.origen}\n🏁 Destino: ${activo.destino}\n💰 Tarifa: $${activo.tarifaAcordada?.toLocaleString('es-CO') || '---'}`,
            [{ text: 'Ir al servicio', onPress: () => onOfertaAceptada && onOfertaAceptada(activo) }]
          );
        }
      } catch {}
    };

    verificar();
    const intervalo = setInterval(verificar, 10000);
    return () => clearInterval(intervalo);
  }, [conductorUid]);
}
