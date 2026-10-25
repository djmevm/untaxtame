import React, { useEffect, useState } from 'react';
import api from '../api';

// Medallas para el top 3
const MEDALLA = ['🥇', '🥈', '🥉'];

export default function Ranking() {
  const [data, setData] = useState({ conductores: [], clientes: [] });
  const [cargando, setCargando] = useState(true);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [filtroCliente, setFiltroCliente] = useState('todos'); // todos | app | whatsapp

  const cargar = (y) => {
    setCargando(true);
    const desde = new Date(Date.UTC(y, 0, 1)).toISOString();
    const hasta = new Date(Date.UTC(y, 11, 31, 23, 59, 59)).toISOString();
    api.get(`/services/ranking?desde=${desde}&hasta=${hasta}`)
      .then((res) => setData(res.data || { conductores: [], clientes: [] }))
      .catch(() => {})
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(anio); }, [anio]);

  const exportarCSV = () => {
    const filas = [
      ['=== MEJORES TAXISTAS ' + anio + ' ==='],
      ['Puesto', 'Nombre', 'Placa', 'Promedio', 'Calificaciones', 'Servicios'],
      ...data.conductores.map((c, i) => [i + 1, c.nombre, c.placa, c.promedio, c.nCalif, c.nServicios]),
      [''],
      ['=== MEJORES CLIENTES ' + anio + ' ==='],
      ['Puesto', 'Nombre', 'Promedio', 'Calificaciones', 'Servicios'],
      ...data.clientes.map((c, i) => [i + 1, c.nombre, c.promedio, c.nCalif, c.nServicios]),
    ];
    const csv = filas.map((f) => f.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ranking_untaxtame_${anio}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (cargando) return <p className="loading">Calculando ranking...</p>;

  const mejorTaxista = data.conductores[0];
  const mejorCliente = data.clientes[0];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 className="titulo" style={{ marginBottom: 0 }}>🏆 Ranking — Premiación {anio}</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={anio} onChange={(e) => setAnio(parseInt(e.target.value))} style={styles.select}>
            {[0, 1, 2].map((d) => {
              const y = new Date().getFullYear() - d;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
          <button onClick={exportarCSV} style={styles.btnExportar}>📥 Exportar CSV</button>
        </div>
      </div>

      {/* Tarjetas de ganadores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 28 }}>
        <div style={{ ...styles.ganadorCard, borderTop: '5px solid #FFC107' }}>
          <div style={styles.ganadorTitulo}>🚕 Mejor Taxista del Año</div>
          {mejorTaxista ? (
            <>
              <div style={styles.ganadorNombre}>🥇 {mejorTaxista.nombre}</div>
              <div style={styles.ganadorPlaca}>{mejorTaxista.placa}</div>
              <div style={styles.ganadorStats}>
                ⭐ {mejorTaxista.promedio}/10 · {mejorTaxista.nServicios} servicios · {mejorTaxista.nCalif} calificaciones
              </div>
            </>
          ) : <p style={{ color: '#999' }}>Sin datos aún</p>}
        </div>

        <div style={{ ...styles.ganadorCard, borderTop: '5px solid #1565C0' }}>
          <div style={styles.ganadorTitulo}>👤 Mejor Cliente del Año</div>
          {mejorCliente ? (
            <>
              <div style={styles.ganadorNombre}>🥇 {mejorCliente.nombre}</div>
              <div style={styles.ganadorStats}>
                ⭐ {mejorCliente.promedio}/10 · {mejorCliente.nServicios} viajes · {mejorCliente.nCalif} calificaciones
              </div>
            </>
          ) : <p style={{ color: '#999' }}>Sin datos aún</p>}
        </div>
      </div>

      {/* Tabla taxistas */}
      <h3 style={{ marginBottom: 12 }}>🚕 Taxistas ({data.conductores.length})</h3>
      <table style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th>#</th><th>Taxista</th><th>Placa</th><th>Promedio ⭐</th><th>Calificaciones</th><th>Servicios</th>
          </tr>
        </thead>
        <tbody>
          {data.conductores.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', color: '#999' }}>Sin datos</td></tr>}
          {data.conductores.map((c, i) => (
            <tr key={c.uid} style={i < 3 ? { background: '#FFFDF5' } : {}}>
              <td style={{ fontWeight: 'bold', textAlign: 'center' }}>{MEDALLA[i] || i + 1}</td>
              <td>{c.nombre}</td>
              <td style={{ color: '#FFC107', fontWeight: 'bold' }}>{c.placa}</td>
              <td style={{ fontWeight: 'bold' }}>{c.promedio}/10</td>
              <td>{c.nCalif}</td>
              <td>{c.nServicios}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Tabla clientes con filtro de fuente */}
      {(() => {
        const clientesFiltrados = filtroCliente === 'todos'
          ? data.clientes
          : data.clientes.filter((c) => (c.fuente || 'app') === filtroCliente);
        const nApp = data.clientes.filter((c) => (c.fuente || 'app') === 'app').length;
        const nWA = data.clientes.filter((c) => c.fuente === 'whatsapp').length;
        const badge = (fuente) => fuente === 'whatsapp'
          ? <span style={{ background: '#E8F5E9', color: '#128C7E', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 'bold' }}>📱 WhatsApp</span>
          : <span style={{ background: '#E3F2FD', color: '#1565C0', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 'bold' }}>📲 App</span>;
        return (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>👤 Clientes ({clientesFiltrados.length})</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { k: 'todos', l: `Todos (${data.clientes.length})` },
                  { k: 'app', l: `📲 App (${nApp})` },
                  { k: 'whatsapp', l: `📱 WhatsApp (${nWA})` },
                ].map((f) => (
                  <button key={f.k} onClick={() => setFiltroCliente(f.k)} style={{
                    padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 12,
                    border: `2px solid ${filtroCliente === f.k ? '#1565C0' : '#ddd'}`,
                    background: filtroCliente === f.k ? '#E3F2FD' : '#fff',
                  }}>{f.l}</button>
                ))}
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Cliente</th><th>Origen</th><th>Promedio ⭐</th><th>Calificaciones</th><th>Viajes</th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', color: '#999' }}>Sin datos</td></tr>}
                {clientesFiltrados.map((c, i) => (
                  <tr key={c.uid} style={i < 3 ? { background: '#F5FAFF' } : {}}>
                    <td style={{ fontWeight: 'bold', textAlign: 'center' }}>{MEDALLA[i] || i + 1}</td>
                    <td>{c.nombre}{c.celular ? <><br /><span style={{ fontSize: 11, color: '#999' }}>{c.celular}</span></> : ''}</td>
                    <td>{badge(c.fuente)}</td>
                    <td style={{ fontWeight: 'bold' }}>{c.promedio}/10</td>
                    <td>{c.nCalif}</td>
                    <td>{c.nServicios}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        );
      })()}

      <p style={{ color: '#888', fontSize: 12, marginTop: 16 }}>
        El ranking considera servicios completados del año seleccionado. El promedio se calcula sobre las calificaciones recibidas; en caso de empate, se ordena por cantidad de servicios.
      </p>
    </div>
  );
}

const styles = {
  select: { padding: '8px 14px', borderRadius: 8, border: '2px solid #FFC107', fontWeight: 'bold', cursor: 'pointer' },
  btnExportar: { background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontWeight: 'bold', fontSize: 14 },
  ganadorCard: { background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  ganadorTitulo: { fontSize: 14, color: '#888', fontWeight: '600', marginBottom: 10 },
  ganadorNombre: { fontSize: 24, fontWeight: 'bold', color: '#222' },
  ganadorPlaca: { fontSize: 16, color: '#FFC107', fontWeight: 'bold', letterSpacing: 2, marginTop: 2 },
  ganadorStats: { fontSize: 13, color: '#666', marginTop: 10 },
};
