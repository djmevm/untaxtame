import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import api from './api';
import LoginAdmin from './components/LoginAdmin';
import Servicios from './components/Servicios';
import Usuarios from './components/Usuarios';
import Dashboard from './components/Dashboard';
import Emergencias from './components/Emergencias';
import MapaConductores from './components/MapaConductores';
import MapaUbicaciones from './components/MapaUbicaciones';
import Billetera from './components/Billetera';
import CodigosRadio from './components/CodigosRadio';
import WhatsApp from './components/WhatsApp';
import './App.css';

import { reproducirNotificacion, reproducirAlarmaSOS } from './utils/sonido';

// Componente de alerta SOS en tiempo real
function AlertaSOS({ onVerEmergencias }) {
  const [alertas, setAlertas] = useState([]);
  const cantidadAnterior = React.useRef(0);

  useEffect(() => {
    const verificar = async () => {
      try {
        const res = await api.get('/emergencia/activas');
        const activas = res.data.filter(e => e.estado === 'activa');
        if (activas.length > cantidadAnterior.current) {
          reproducirAlarmaSOS();
        }
        cantidadAnterior.current = activas.length;
        setAlertas(activas);
      } catch {}
    };

    verificar();
    const intervalo = setInterval(verificar, 5000); // Cada 5 seg
    return () => clearInterval(intervalo);
  }, []);

  if (alertas.length === 0) return null;

  const ICONOS = {
    accidente: '🚗💥', robo: '🔫', secuestro: '🚨',
    mecanico: '🔧', pinchado: '🛞', otro: '⚠️',
  };

  return (
    <div style={estilosSOS.banner}>
      <div style={estilosSOS.bannerContent}>
        <span style={estilosSOS.bannerIcon}>🚨</span>
        <div style={{ flex: 1 }}>
          {alertas.map((a, i) => (
            <div key={a.id || i} style={estilosSOS.alertaItem}>
              <strong>{ICONOS[a.tipoEmergencia] || '⚠️'} {a.mensaje}</strong>
              <span> — {a.nombre} ({a.rol})</span>
              {a.ubicacion && (
                <a href={`https://www.google.com/maps?q=${a.ubicacion.lat},${a.ubicacion.lng}`}
                  target="_blank" rel="noopener noreferrer" style={estilosSOS.linkMapa}>
                  📌 Ver ubicación
                </a>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => { setAlertas([]); onVerEmergencias(); }} style={estilosSOS.btnVer}>
          Ver emergencias
        </button>
        <button onClick={() => setAlertas([])} style={estilosSOS.btnCerrar}>✕</button>
      </div>
    </div>
  );
}

const estilosSOS = {
  banner: {
    background: 'linear-gradient(90deg, #B71C1C, #E53935)',
    padding: '12px 24px', animation: 'pulse 1.5s infinite',
  },
  bannerContent: { display: 'flex', alignItems: 'center', gap: 12 },
  bannerIcon: { fontSize: 28, animation: 'shake 0.5s infinite' },
  alertaItem: { color: '#fff', fontSize: 14, marginBottom: 2 },
  linkMapa: { color: '#FFE082', marginLeft: 8, fontWeight: 'bold', textDecoration: 'none' },
  btnVer: {
    background: '#fff', color: '#E53935', border: 'none', borderRadius: 8,
    padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  btnCerrar: {
    background: 'none', border: 'none', color: '#fff', fontSize: 20,
    cursor: 'pointer', fontWeight: 'bold',
  },
};

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorAcceso, setErrorAcceso] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [adminsEnLinea, setAdminsEnLinea] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUsuario(user);
        try {
          const res = await api.get(`/auth/perfil/${user.uid}`);
          if (res.data.rol === 'admin') {
            setPerfil(res.data);
            setErrorAcceso('');
          } else {
            setErrorAcceso('Tu cuenta no tiene permisos de administrador.');
            setPerfil(null);
            await signOut(auth);
          }
        } catch (err) {
          console.error('Error verificando perfil:', err);
          setErrorAcceso('Error al verificar permisos: ' + (err.response?.data?.error || err.message));
          setPerfil(null);
          await signOut(auth);
        }
      } else {
        setUsuario(null);
        setPerfil(null);
      }
      setCargando(false);
    });
    return unsub;
  }, []);

  const cerrarSesion = async () => {
    await signOut(auth);
    setTab('dashboard');
  };

  // Registrar presencia y consultar admins en línea
  useEffect(() => {
    if (!perfil?.uid) return;
    const registrar = async () => {
      try {
        await api.post('/admin/presencia', { uid: perfil.uid, nombre: perfil.nombre });
        const res = await api.get('/admin/en-linea');
        setAdminsEnLinea(res.data || []);
      } catch {}
    };
    registrar();
    const intervalo = setInterval(registrar, 30000); // Cada 30 seg
    return () => clearInterval(intervalo);
  }, [perfil?.uid]);

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <p style={{ fontSize: 18, color: '#999' }}>Cargando...</p>
      </div>
    );
  }

  if (!usuario || !perfil) {
    return <LoginAdmin errorExterno={errorAcceso} />;
  }

  return (
    <div className="app">
      {/* Alerta SOS en tiempo real */}
      <AlertaSOS onVerEmergencias={() => setTab('emergencias')} />

      <header className="header">
        <div style={{ flex: 1 }}>
          <h1>🚕 UntaXtame S.A.S</h1>
          <p>Panel Administrador — {perfil.nombre}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginRight: 16 }}>
          {adminsEnLinea.map(a => (
            <div key={a.uid} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4CAF50', display: 'inline-block' }}></span>
              <span style={{ fontSize: 11, color: '#fff', opacity: 0.9 }}>{a.nombre?.split(' ')[0]}</span>
            </div>
          ))}
          {adminsEnLinea.length === 0 && (
            <span style={{ fontSize: 11, color: '#fff', opacity: 0.6 }}>Solo tú en línea</span>
          )}
        </div>
        <button onClick={cerrarSesion} style={{
          background: 'rgba(0,0,0,0.15)', border: 'none', borderRadius: 8,
          padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold', fontSize: 14
        }}>
          Cerrar sesión
        </button>
      </header>
      <nav className="nav">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>📊 Dashboard</button>
        <button className={tab === 'servicios' ? 'active' : ''} onClick={() => setTab('servicios')}>📋 Servicios</button>
        <button className={tab === 'usuarios' ? 'active' : ''} onClick={() => setTab('usuarios')}>👥 Usuarios</button>
        <button className={tab === 'emergencias' ? 'active' : ''} onClick={() => setTab('emergencias')}>🚨 Emergencias</button>
        <button className={tab === 'radio' ? 'active' : ''} onClick={() => setTab('radio')}>📻 Radio</button>
        <button className={tab === 'billetera' ? 'active' : ''} onClick={() => setTab('billetera')}>💰 Billetera</button>
        <button className={tab === 'whatsapp' ? 'active' : ''} onClick={() => setTab('whatsapp')}>📱 WhatsApp</button>
        <button className={tab === 'rastreo' ? 'active' : ''} onClick={() => setTab('rastreo')}>⚡ Rastreo</button>
        <button className={tab === 'mapa' ? 'active' : ''} onClick={() => setTab('mapa')}>🗺️ Mapa</button>
      </nav>
      <main className="main">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'servicios' && <Servicios />}
        {tab === 'usuarios' && <Usuarios />}
        {tab === 'emergencias' && <Emergencias />}
        {tab === 'radio' && <CodigosRadio />}
        {tab === 'billetera' && <Billetera />}
        {tab === 'whatsapp' && <WhatsApp />}
        {tab === 'rastreo' && <MapaConductores />}
        {tab === 'mapa' && <MapaUbicaciones />}
      </main>
    </div>
  );
}
