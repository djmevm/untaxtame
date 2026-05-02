import React, { useEffect, useState } from 'react';
import api from '../api';

export default function Servicios() {
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');

  const cargar = () => {
    api.get('/services/todos')
      .then(res => setServicios(res.data))
      .catch(() => {})
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(); }, []);

  const totales = {
    total: servicios.length,
    pendientes: servicios.filter(s => s.estado === 'pendiente').length,
    completados: servicios.filter(s => s.estado === 'completado').length,
    cancelados: servicios.filter(s => s.estado === 'cancelado').length,
    promedio: (() => {
      const cal = servicios.filter(s => s.calificacion?.estrellas);
      if (!cal.length) return '—';
      return (cal.reduce((a, s) => a + s.calificacion.estrellas, 0) / cal.length).toFixed(1);
    })(),
  };

  const cancelarServicio = async (servicio) => {
    const motivo = window.prompt(`Motivo para cancelar el servicio de ${servicio.clienteNombre}:`, 'Cancelado por administrador');
    if (motivo === null) return;
    try {
      await api.put(`/services/admin-cancelar/${servicio.id}`, { motivo });
      alert('✅ Servicio cancelado');
      cargar();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const filtrados = filtroEstado === 'todos'
    ? servicios
    : servicios.filter(s => s.estado === filtroEstado);

  const exportarCSV = () => {
    const headers = ['Cliente', 'Conductor', 'Origen', 'Destino', 'Pago', 'Estado', 'Calificación', 'Comentario', 'Tarifa Estimada', 'Fecha'];
    const filas = filtrados.map(s => [
      s.clienteNombre || '',
      s.conductorNombre || '',
      `"${(s.origen || '').replace(/"/g, '""')}"`,
      `"${(s.destino || '').replace(/"/g, '""')}"`,
      s.metodoPago?.toUpperCase() || '',
      s.estado || '',
      s.calificacion?.estrellas || '',
      `"${(s.calificacion?.comentario || '').replace(/"/g, '""')}"`,
      s.tarifaEstimada?.tarifaEstimada || '',
      new Date(s.creadoEn).toLocaleString('es-CO'),
    ]);

    const csv = [headers.join(','), ...filas.map(f => f.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `servicios_untaxtame_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (cargando) return <p className="loading">Cargando servicios...</p>;

  return (
    <div>
      <div style={estilos.headerRow}>
        <h2 className="titulo" style={{ marginBottom: 0 }}>Todos los Servicios</h2>
        <button onClick={exportarCSV} style={estilos.btnExportar}>
          📥 Exportar CSV
        </button>
      </div>

      <div className="stats">
        <div className="stat-card"><div className="num">{totales.total}</div><div className="label">Total</div></div>
        <div className="stat-card"><div className="num">{totales.pendientes}</div><div className="label">Pendientes</div></div>
        <div className="stat-card"><div className="num">{totales.completados}</div><div className="label">Completados</div></div>
        <div className="stat-card"><div className="num">{totales.cancelados}</div><div className="label">Cancelados</div></div>
        <div className="stat-card"><div className="num">⭐ {totales.promedio}</div><div className="label">Calificación</div></div>
      </div>

      {/* Filtros */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        {['todos', 'pendiente', 'aceptado', 'conductor_en_sitio', 'completado', 'cancelado'].map(f => (
          <button key={f} onClick={() => setFiltroEstado(f)} style={{
            padding: '8px 18px', borderRadius: 8, border: '2px solid #FFC107',
            background: filtroEstado === f ? '#FFC107' : '#fff',
            fontWeight: 'bold', cursor: 'pointer',
          }}>
            {f === 'conductor_en_sitio' ? 'En sitio' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Conductor</th>
            <th>Origen</th>
            <th>Destino</th>
            <th>Pago</th>
            <th>Tarifa</th>
            <th>Estado</th>
            <th>Calificación</th>
            <th>Fecha</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.length === 0 && (
            <tr><td colSpan="10" style={{ textAlign: 'center', color: '#999' }}>Sin servicios</td></tr>
          )}
          {filtrados.map(s => (
            <tr key={s.id}>
              <td>{s.clienteNombre}</td>
              <td>{s.conductorNombre || '—'}</td>
              <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.origen}
              </td>
              <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.destino}
              </td>
              <td>{s.metodoPago?.toUpperCase()}</td>
              <td>
                {s.tarifaEstimada?.tarifaEstimada
                  ? `$${s.tarifaEstimada.tarifaEstimada.toLocaleString('es-CO')}`
                  : '—'}
              </td>
              <td><span className={`badge ${s.estado}`}>{s.estado}</span></td>
              <td>
                {s.calificacion?.estrellas
                  ? <span title={s.calificacion.comentario || ''}>
                      {'★'.repeat(s.calificacion.estrellas)}{'☆'.repeat(5 - s.calificacion.estrellas)}
                    </span>
                  : '—'}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {new Date(s.creadoEn).toLocaleString('es-CO', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit', hour12: true,
                })}
              </td>
              <td>
                {!['completado', 'cancelado'].includes(s.estado) && (
                  <button onClick={() => cancelarServicio(s)} style={estilos.btnCancelar}>
                    ❌ Cancelar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const estilos = {
  headerRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
  },
  btnExportar: {
    background: '#2E7D32', color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
    fontWeight: 'bold', fontSize: 14,
  },
  btnCancelar: {
    background: '#E53935', color: '#fff', border: 'none',
    borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
    fontWeight: 'bold', fontSize: 12,
  },
};
