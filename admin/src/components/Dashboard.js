import React, { useEffect, useState, useRef } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import api from '../api';
import { reproducirNotificacion, reproducirNuevoServicio } from '../utils/sonido';

const COLORES_ESTADO = {
  pendiente: '#FFC107',
  aceptado: '#1565C0',
  completado: '#2E7D32',
  cancelado: '#E53935',
};

const COLORES_PAGO = {
  daviplata: '#E53935',
  nequi: '#6A1B9A',
  pse: '#1565C0',
  efectivo: '#2E7D32',
};

export default function Dashboard() {
  const [servicios, setServicios] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [emergencias, setEmergencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const pendientesAnterior = useRef(0);

  const cargarDatos = () => {
    Promise.all([
      api.get('/services/todos'),
      api.get('/users/todos'),
      api.get('/emergencia/activas').catch(() => ({ data: [] })),
    ])
      .then(([sRes, uRes, eRes]) => {
        const nuevosPendientes = sRes.data.filter(s => s.estado === 'pendiente').length;
        if (nuevosPendientes > pendientesAnterior.current && pendientesAnterior.current > 0) {
          reproducirNuevoServicio();
        }
        pendientesAnterior.current = nuevosPendientes;
        setServicios(sRes.data);
        setUsuarios(uRes.data);
        setEmergencias(eRes.data);
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargarDatos();
    // Actualizar cada 10 segundos
    const intervalo = setInterval(cargarDatos, 60000);
    return () => clearInterval(intervalo);
  }, []);

  if (cargando) return <p className="loading">Cargando dashboard...</p>;

  // Alertas pendientes
  const emergenciasActivas = emergencias.filter(e => e.estado === 'activa');
  const serviciosPendientes = servicios.filter(s => s.estado === 'pendiente');

  // ── MÉTRICAS AVANZADAS ──

  // GMV (Gross Merchandise Value) - valor total de servicios completados
  const serviciosCompletados = servicios.filter(s => s.estado === 'completado');
  const gmv = serviciosCompletados.reduce((total, s) => total + (s.tarifaAcordada || 8000), 0);

  // Ganancias por conductor
  const gananciasPorConductor = {};
  serviciosCompletados.forEach(s => {
    if (s.conductorNombre) {
      if (!gananciasPorConductor[s.conductorNombre]) {
        gananciasPorConductor[s.conductorNombre] = { nombre: s.conductorNombre, placa: s.conductorPlaca, total: 0, viajes: 0 };
      }
      gananciasPorConductor[s.conductorNombre].total += (s.tarifaAcordada || 8000);
      gananciasPorConductor[s.conductorNombre].viajes++;
    }
  });
  const topGanancias = Object.values(gananciasPorConductor).sort((a, b) => b.total - a.total);

  // Asignados vs Perdidos
  const asignados = servicios.filter(s => ['aceptado', 'completado'].includes(s.estado)).length;
  const perdidos = servicios.filter(s => s.estado === 'cancelado').length;
  const tasaAsignacion = servicios.length > 0 ? ((asignados / servicios.length) * 100).toFixed(1) : 0;

  // Tiempo promedio de respuesta (desde creación hasta aceptación)
  const tiemposRespuesta = servicios
    .filter(s => s.estado !== 'pendiente' && s.creadoEn && s.actualizadoEn)
    .map(s => (new Date(s.actualizadoEn) - new Date(s.creadoEn)) / 1000 / 60);
  const tiempoPromedio = tiemposRespuesta.length > 0
    ? (tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length).toFixed(1)
    : '—';

  // Cancelaciones por motivo
  const cancelaciones = servicios.filter(s => s.estado === 'cancelado');
  const cancelacionesConductor = cancelaciones.filter(s => s.canceladoPor === 'conductor').length;
  const cancelacionesCliente = cancelaciones.filter(s => s.canceladoPor === 'cliente').length;

  // ── Estadísticas generales ──
  const totalServicios = servicios.length;
  const completados = servicios.filter(s => s.estado === 'completado').length;
  const cancelados = servicios.filter(s => s.estado === 'cancelado').length;
  const pendientes = servicios.filter(s => s.estado === 'pendiente').length;
  const aceptados = servicios.filter(s => s.estado === 'aceptado').length;
  const tasaCompletado = totalServicios > 0 ? ((completados / totalServicios) * 100).toFixed(1) : 0;
  const calificados = servicios.filter(s => s.calificacion?.puntuacion || s.calificacion?.estrellas);
  const promedioCalificacion = calificados.length > 0
    ? (calificados.reduce((a, s) => a + (s.calificacion.puntuacion || s.calificacion.estrellas || 0), 0) / calificados.length).toFixed(1)
    : '—';

  const totalClientes = usuarios.filter(u => u.rol === 'cliente').length;
  const totalConductores = usuarios.filter(u => u.rol === 'conductor').length;
  const conductoresAprobados = usuarios.filter(u => u.rol === 'conductor' && u.estadoVerificacion === 'aprobado').length;
  const conductoresPendientes = usuarios.filter(u => u.rol === 'conductor' && u.estadoVerificacion === 'pendiente').length;

  // ── Datos para gráficas ──

  // Servicios por estado (Pie)
  const datosPorEstado = [
    { name: 'Pendientes', value: pendientes, color: COLORES_ESTADO.pendiente },
    { name: 'Aceptados', value: servicios.filter(s => s.estado === 'aceptado').length, color: COLORES_ESTADO.aceptado },
    { name: 'Completados', value: completados, color: COLORES_ESTADO.completado },
    { name: 'Cancelados', value: cancelados, color: COLORES_ESTADO.cancelado },
  ].filter(d => d.value > 0);

  // Servicios por método de pago (Pie)
  const datosPorPago = Object.entries(COLORES_PAGO).map(([key, color]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value: servicios.filter(s => s.metodoPago === key).length,
    color,
  })).filter(d => d.value > 0);

  // Servicios por día (últimos 14 días) (Line)
  const hoy = new Date();
  const serviciosPorDia = [];
  for (let i = 13; i >= 0; i--) {
    const fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() - i);
    const fechaStr = fecha.toISOString().split('T')[0];
    const diaLabel = `${fecha.getDate()}/${fecha.getMonth() + 1}`;

    const delDia = servicios.filter(s => s.creadoEn?.startsWith(fechaStr));
    serviciosPorDia.push({
      dia: diaLabel,
      total: delDia.length,
      completados: delDia.filter(s => s.estado === 'completado').length,
      cancelados: delDia.filter(s => s.estado === 'cancelado').length,
    });
  }

  // Distribución de calificaciones (Bar)
  const distCalificaciones = [1, 2, 3, 4, 5].map(n => ({
    estrellas: `${n} ★`,
    cantidad: calificados.filter(s => s.calificacion.estrellas === n).length,
  }));

  // Top conductores
  const conductoresMap = {};
  servicios.filter(s => s.conductorNombre && s.estado === 'completado').forEach(s => {
    if (!conductoresMap[s.conductorNombre]) {
      conductoresMap[s.conductorNombre] = { nombre: s.conductorNombre, viajes: 0, estrellas: [], placa: s.conductorPlaca };
    }
    conductoresMap[s.conductorNombre].viajes++;
    if (s.calificacion?.estrellas) conductoresMap[s.conductorNombre].estrellas.push(s.calificacion.estrellas);
  });
  const topConductores = Object.values(conductoresMap)
    .map(c => ({
      ...c,
      promedio: c.estrellas.length > 0
        ? (c.estrellas.reduce((a, b) => a + b, 0) / c.estrellas.length).toFixed(1)
        : '—',
    }))
    .sort((a, b) => b.viajes - a.viajes)
    .slice(0, 5);

  return (
    <div>
      <h2 className="titulo">📊 Dashboard</h2>

      {/* Alertas en tiempo real */}
      {(emergenciasActivas.length > 0 || serviciosPendientes.length > 0) && (
        <div style={estilos.alertasContainer}>
          {emergenciasActivas.length > 0 && (
            <div style={estilos.alertaSOS}>
              <div style={estilos.alertaIcono}>🚨</div>
              <div style={{ flex: 1 }}>
                <p style={estilos.alertaTitulo}>{emergenciasActivas.length} Emergencia{emergenciasActivas.length > 1 ? 's' : ''} SOS activa{emergenciasActivas.length > 1 ? 's' : ''}</p>
                {emergenciasActivas.slice(0, 3).map((e, i) => (
                  <p key={i} style={estilos.alertaDetalle}>
                    {e.tipoEmergencia === 'accidente' ? '🚗💥' : e.tipoEmergencia === 'robo' ? '🔫' : e.tipoEmergencia === 'secuestro' ? '🚨' : e.tipoEmergencia === 'mecanico' ? '🔧' : e.tipoEmergencia === 'pinchado' ? '🛞' : '⚠️'}
                    {' '}{e.nombre} — {e.mensaje}
                    {e.ubicacion && (
                      <a href={`https://www.google.com/maps?q=${e.ubicacion.lat},${e.ubicacion.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: '#FFE082', marginLeft: 8 }}>📌 Ubicación</a>
                    )}
                  </p>
                ))}
              </div>
              <span style={estilos.alertaContador}>{emergenciasActivas.length}</span>
            </div>
          )}

          {serviciosPendientes.length > 0 && (
            <div style={estilos.alertaServicios}>
              <div style={estilos.alertaIcono}>🚕</div>
              <div style={{ flex: 1 }}>
                <p style={estilos.alertaTitulo}>{serviciosPendientes.length} Servicio{serviciosPendientes.length > 1 ? 's' : ''} pendiente{serviciosPendientes.length > 1 ? 's' : ''}</p>
                {serviciosPendientes.slice(0, 3).map((s, i) => (
                  <p key={i} style={estilos.alertaDetalle}>
                    👤 {s.clienteNombre} — {s.origen} → {s.destino}
                    {s.totalOfertas > 0 ? ` (${s.totalOfertas} oferta${s.totalOfertas > 1 ? 's' : ''})` : ' (sin ofertas)'}
                  </p>
                ))}
                {serviciosPendientes.length > 3 && (
                  <p style={estilos.alertaDetalle}>... y {serviciosPendientes.length - 3} más</p>
                )}
              </div>
              <span style={estilos.alertaContadorAmarillo}>{serviciosPendientes.length}</span>
            </div>
          )}
        </div>
      )}

      {/* Métricas avanzadas */}
      <div className="stats">
        <div className="stat-card">
          <div className="num" style={{ color: '#2E7D32' }}>${gmv.toLocaleString('es-CO')}</div>
          <div className="label">💰 GMV Total</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: '#1565C0' }}>{tasaAsignacion}%</div>
          <div className="label">📊 Tasa asignación</div>
        </div>
        <div className="stat-card">
          <div className="num">{asignados}</div>
          <div className="label">✅ Asignados</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: '#E53935' }}>{perdidos}</div>
          <div className="label">❌ Perdidos/Cancelados</div>
        </div>
        <div className="stat-card">
          <div className="num">{tiempoPromedio} min</div>
          <div className="label">⏱️ Respuesta promedio</div>
        </div>
      </div>

      {/* Cancelaciones */}
      {cancelaciones.length > 0 && (
        <div className="stats">
          <div className="stat-card">
            <div className="num" style={{ color: '#E53935' }}>{cancelaciones.length}</div>
            <div className="label">Total cancelaciones</div>
          </div>
          <div className="stat-card">
            <div className="num">{cancelacionesConductor}</div>
            <div className="label">Por conductor</div>
          </div>
          <div className="stat-card">
            <div className="num">{cancelacionesCliente}</div>
            <div className="label">Por cliente</div>
          </div>
        </div>
      )}

      {/* KPIs principales */}
      <div className="stats">
        <div className="stat-card">
          <div className="num">{totalServicios}</div>
          <div className="label">Total servicios</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: '#2E7D32' }}>{completados}</div>
          <div className="label">Completados</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: '#E53935' }}>{cancelados}</div>
          <div className="label">Cancelados</div>
        </div>
        <div className="stat-card">
          <div className="num">{tasaCompletado}%</div>
          <div className="label">Tasa completado</div>
        </div>
        <div className="stat-card">
          <div className="num">⭐ {promedioCalificacion}</div>
          <div className="label">Calificación prom.</div>
        </div>
      </div>

      <div className="stats">
        <div className="stat-card">
          <div className="num" style={{ color: '#1565C0' }}>{totalClientes}</div>
          <div className="label">Clientes</div>
        </div>
        <div className="stat-card">
          <div className="num">{totalConductores}</div>
          <div className="label">Conductores</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: '#2E7D32' }}>{conductoresAprobados}</div>
          <div className="label">Aprobados</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: '#FFC107' }}>{conductoresPendientes}</div>
          <div className="label">Por verificar</div>
        </div>
      </div>

      {/* Gráficas originales */}
      <div style={estilos.graficasGrid}>

        {/* Servicios por día */}
        <div style={estilos.graficaCard}>
          <h3 style={estilos.graficaTitulo}>📈 Servicios últimos 14 días</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={serviciosPorDia}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="dia" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" stroke="#FFC107" strokeWidth={2} name="Total" />
              <Line type="monotone" dataKey="completados" stroke="#2E7D32" strokeWidth={2} name="Completados" />
              <Line type="monotone" dataKey="cancelados" stroke="#E53935" strokeWidth={2} name="Cancelados" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Servicios por estado */}
        <div style={estilos.graficaCard}>
          <h3 style={estilos.graficaTitulo}>🔄 Servicios por estado</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={datosPorEstado}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {datosPorEstado.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Métodos de pago */}
        <div style={estilos.graficaCard}>
          <h3 style={estilos.graficaTitulo}>💳 Métodos de pago</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={datosPorPago}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {datosPorPago.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Distribución de calificaciones */}
        <div style={estilos.graficaCard}>
          <h3 style={estilos.graficaTitulo}>⭐ Distribución de calificaciones</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={distCalificaciones}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="estrellas" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="cantidad" fill="#FFC107" radius={[6, 6, 0, 0]} name="Calificaciones" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top conductores */}
      {topConductores.length > 0 && (
        <div style={estilos.graficaCard}>
          <h3 style={estilos.graficaTitulo}>🏆 Top conductores</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Conductor</th>
                <th>Placa</th>
                <th>Viajes completados</th>
                <th>Calificación promedio</th>
              </tr>
            </thead>
            <tbody>
              {topConductores.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 'bold', color: i === 0 ? '#FFC107' : '#666' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </td>
                  <td>{c.nombre}</td>
                  <td style={{ fontWeight: 'bold', color: '#FFC107', letterSpacing: 1 }}>{c.placa || '—'}</td>
                  <td>{c.viajes}</td>
                  <td>⭐ {c.promedio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ganancias por conductor */}
      {topGanancias.length > 0 && (
        <div style={estilos.graficaCard}>
          <h3 style={estilos.graficaTitulo}>💰 Ganancias por conductor</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Conductor</th>
                <th>Placa</th>
                <th>Viajes</th>
                <th>Total ganado</th>
                <th>Promedio/viaje</th>
              </tr>
            </thead>
            <tbody>
              {topGanancias.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 'bold' }}>{i + 1}</td>
                  <td>{c.nombre}</td>
                  <td style={{ color: '#FFC107', fontWeight: 'bold' }}>{c.placa || '—'}</td>
                  <td>{c.viajes}</td>
                  <td style={{ fontWeight: 'bold', color: '#2E7D32' }}>${c.total.toLocaleString('es-CO')}</td>
                  <td>${Math.round(c.total / c.viajes).toLocaleString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const estilos = {
  alertasContainer: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 },
  alertaSOS: {
    background: 'linear-gradient(135deg, #B71C1C, #E53935)', borderRadius: 14, padding: 18,
    display: 'flex', alignItems: 'center', gap: 14, color: '#fff', animation: 'pulse 2s infinite',
  },
  alertaServicios: {
    background: 'linear-gradient(135deg, #E65100, #FFC107)', borderRadius: 14, padding: 18,
    display: 'flex', alignItems: 'center', gap: 14, color: '#000',
  },
  alertaIcono: { fontSize: 36 },
  alertaTitulo: { fontWeight: 'bold', fontSize: 16, margin: 0 },
  alertaDetalle: { fontSize: 13, margin: '2px 0', opacity: 0.9 },
  alertaContador: {
    background: '#fff', color: '#E53935', width: 40, height: 40, borderRadius: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 'bold', fontSize: 18,
  },
  alertaContadorAmarillo: {
    background: '#fff', color: '#E65100', width: 40, height: 40, borderRadius: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 'bold', fontSize: 18,
  },
  graficasGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
    gap: 20,
    marginBottom: 24,
  },
  graficaCard: {
    background: '#fff',
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    marginBottom: 20,
  },
  graficaTitulo: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
};
