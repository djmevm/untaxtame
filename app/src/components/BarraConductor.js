import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import api from '../config/api';

export default function BarraConductor({ uid }) {
  const [saldo, setSaldo] = useState(0);
  const [reputacion, setReputacion] = useState(0);
  const [estrellas, setEstrellas] = useState(0);
  const [totalViajes, setTotalViajes] = useState(0);

  useEffect(() => {
    if (!uid) return;
    cargarDatos();
    const intervalo = setInterval(cargarDatos, 30000);
    return () => clearInterval(intervalo);
  }, [uid]);

  const cargarDatos = async () => {
    try {
      const [saldoRes, perfilRes] = await Promise.all([
        api.get(`/billetera/saldo/${uid}`).catch(() => ({ data: { saldo: 0 } })),
        api.get(`/auth/perfil/${uid}`).catch(() => ({ data: {} })),
      ]);

      setSaldo(saldoRes.data.saldo || 0);
      const p = perfilRes.data;
      // reputacion puede ser un objeto {porcentaje, promedio, ...} o un número
      const rep = p.reputacion;
      if (typeof rep === 'object' && rep !== null) {
        setReputacion(rep.porcentaje || 0);
        setEstrellas(rep.promedio || 0);
        setTotalViajes(rep.totalServicios || 0);
      } else {
        setReputacion(rep || 0);
        setEstrellas(p.calificacionPromedio || 0);
        setTotalViajes(p.viajesCompletados || 0);
      }
    } catch {}
  };

  const saldoBajo = saldo <= 0;
  const saldoAlerta = saldo > 0 && saldo < 5000;

  return (
    <View style={styles.container}>
      {/* Saldo */}
      <View style={[styles.saldoCard, saldoBajo && styles.saldoCardRojo, saldoAlerta && styles.saldoCardNaranja]}>
        <Feather name="credit-card" size={18} color={saldoBajo ? '#DC2626' : saldoAlerta ? '#F97316' : '#16A34A'} />
        <View style={{ flex: 1 }}>
          <Text style={styles.saldoLabel}>Saldo</Text>
          <Text style={[styles.saldoMonto, saldoBajo && styles.saldoMontoRojo, saldoAlerta && styles.saldoMontoNaranja]}>
            ${saldo.toLocaleString('es-CO')}
          </Text>
        </View>
        {saldoBajo && (
          <View style={styles.alertaBadge}>
            <Feather name="alert-circle" size={12} color="#fff" />
            <Text style={styles.alertaTexto}>Recarga</Text>
          </View>
        )}
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Feather name="star" size={14} color="#F97316" />
          <Text style={styles.statValor}>{estrellas > 0 ? estrellas.toFixed(1) : '—'}</Text>
        </View>
        <View style={styles.statItem}>
          <Feather name="navigation" size={14} color="#64748B" />
          <Text style={styles.statValor}>{totalViajes}</Text>
        </View>
        <View style={styles.statItem}>
          <Feather name="trending-up" size={14} color={reputacion >= 70 ? '#16A34A' : reputacion >= 40 ? '#F97316' : '#DC2626'} />
          <Text style={[styles.statValor, { color: reputacion >= 70 ? '#16A34A' : reputacion >= 40 ? '#F97316' : '#DC2626' }]}>
            {reputacion > 0 ? `${reputacion}%` : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function useSaldoConductor(uid) {
  const [saldo, setSaldo] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const cargar = async () => {
      try {
        const res = await api.get(`/billetera/saldo/${uid}`);
        setSaldo(res.data.saldo || 0);
      } catch {
        setSaldo(0);
      } finally {
        setCargando(false);
      }
    };
    cargar();
    const intervalo = setInterval(cargar, 15000);
    return () => clearInterval(intervalo);
  }, [uid]);

  return { saldo, cargando, sinSaldo: saldo !== null && saldo <= 0 };
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  saldoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  saldoCardRojo: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  saldoCardNaranja: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  saldoLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  saldoMonto: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#16A34A',
  },
  saldoMontoRojo: { color: '#DC2626' },
  saldoMontoNaranja: { color: '#F97316' },
  alertaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  alertaTexto: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 8,
  },
  statValor: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E293B',
  },
});
