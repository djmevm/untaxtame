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
import Billetera from './components/Billetera';
import CodigosRadio from './components/CodigosRadio';
import './App.css';

import { reproducirNotificacion, reproducirAlarmaSOS } from './utils/sonido';

// ═══ CONTROL DE SESIÓN ÚNICA ═══
const SESSION_ID = Date.now().toString(36) + Math.random().toString(36).substr(2);

function useSesionUnica() {
  const [bloqueado, setBloqueado] = useState(false);

  useEffect(() => {
    // Al abrir, registrar esta sesión
    const registrar = () => {
      localStorage.setItem('untaxtame_session', SESSION_ID);
      localStorage.setItem('untaxtame_session_time', Date.now().toString());
    };

    // Verificar si hay otra sesión activa
    const verificar = () => {
      const sesionActual = localStorage.getItem('untaxtame_session');
      if (sesionActual && sesionActual !== SESSION_ID) {
        const tiempo = parseInt(localStorage.getItem('untaxtame_session_time') || '0');
        // Si la otra sesión fue hace menos de 30 seg, está activa
        if (Date.now() - tiempo < 30000) {
          setBloqueado(true);
          return;
        }
      }
      setBloqueado(false);
      registrar();
    };

    verificar();
    const intervalo = setInterval(verificar, 10000);

    // Escuchar cambios en localStorage (otra pestaña)
    const onStorage = (e) => {
      if (e.key === 'untaxtame_session' && e.newValue !== SESSION_ID) {
        setBloqueado(true);
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      clearInterval(intervalo);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return bloqueado;
}

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
    const intervalo = setInterval(verificar, 60000); // Cada 60 seg
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

// Componente de notificación de mensajes directos
function NotificacionMensajes({ onVerUsuarios }) {
  const [mensajesNuevos, setMensajesNuevos] = React.useState([]);
  const cantidadAnterior = React.useRef(0);

  React.useEffect(() => {
    const verificar = async () => {
      try {
        const res = await api.get('/users/todos');
        const usuarios = res.data || [];
        const nuevos = [];

        for (const u of usuarios) {
          try {
            const chatRes = await api.get(`/chat/directo/${u.uid}/mensajes`);
            const msgs = chatRes.data || [];
            // Buscar mensajes no del admin en los últimos 5 minutos
            const recientes = msgs.filter(m => m.rol !== 'admin' && (Date.now() - new Date(m.creadoEn).getTime()) < 300000);
            if (recientes.length > 0) {
              nuevos.push({ nombre: u.nombre, uid: u.uid, mensaje: recientes[recientes.length - 1].texto, rol: u.rol });
            }
          } catch {}
        }

        if (nuevos.length > cantidadAnterior.current && cantidadAnterior.current >= 0) {
          // Sonido de notificación
          try { new Audio('https://actions.google.com/sounds/v1/cartoon/pop.ogg').play(); } catch {}
        }
        cantidadAnterior.current = nuevos.length;
        setMensajesNuevos(nuevos);
      } catch {}
    };

    verificar();
    const intervalo = setInterval(verificar, 60000); // Cada 60 seg
    return () => clearInterval(intervalo);
  }, []);

  if (mensajesNuevos.length === 0) return null;

  return (
    <div style={{ background: 'linear-gradient(90deg, #1565C0, #1976D2)', padding: '10px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 22 }}>💬</span>
        <div style={{ flex: 1, color: '#fff' }}>
          <strong>{mensajesNuevos.length} mensaje{mensajesNuevos.length > 1 ? 's' : ''} nuevo{mensajesNuevos.length > 1 ? 's' : ''}</strong>
          {mensajesNuevos.slice(0, 2).map((m, i) => (
            <div key={i} style={{ fontSize: 12, opacity: 0.9 }}>
              {m.rol === 'cliente' ? '👤' : '🚕'} {m.nombre}: "{m.mensaje?.substring(0, 40)}{m.mensaje?.length > 40 ? '...' : ''}"
            </div>
          ))}
        </div>
        <button onClick={onVerUsuarios} style={{ background: '#fff', color: '#1565C0', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer' }}>
          Ver mensajes
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorAcceso, setErrorAcceso] = useState('');
  const [tab, setTab] = useState('dashboard');

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

      {/* Notificación de mensajes directos nuevos */}
      <NotificacionMensajes onVerUsuarios={() => setTab('usuarios')} />

      <header className="header">
        <div style={{ flex: 1 }}>
          <h1>🚕 UntaXtame S.A.S</h1>
          <p>Panel Administrador — {perfil.nombre}</p>
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
        <button className={tab === 'mapa' ? 'active' : ''} onClick={() => setTab('mapa')}>📍 Mapa</button>
      </nav>
      <main className="main">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'servicios' && <Servicios />}
        {tab === 'usuarios' && <Usuarios />}
        {tab === 'emergencias' && <Emergencias />}
        {tab === 'radio' && <CodigosRadio />}
        {tab === 'billetera' && <Billetera />}
        {tab === 'mapa' && <MapaConductores />}
      </main>
    </div>
  );
}
