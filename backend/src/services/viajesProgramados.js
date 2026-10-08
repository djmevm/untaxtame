/**
 * viajesProgramados.js
 * Funciones puras (sin efectos secundarios) para el flujo de Viajes Programados
 * de Madrugada. 100% testeables con fast-check.
 *
 * Zona horaria de referencia: America/Bogota (UTC-5, sin DST).
 */

// ═══ CONSTANTES ═══
const TARIFA_MADRUGADA = 10000;
const VENTANA_INICIO_HORA = 3;   // 3:00 AM
const VENTANA_FIN_HORA = 6;      // 6:00 AM inclusive
const ANTICIPACION_MIN_HORAS = 2;
const ANTICIPACION_MAX_HORAS = 24;
const MAX_VIAJES_POR_NOCHE = 3;
const CANCELACION_LIBRE_MIN = 30;
const RECORDATORIOS_MIN = [30, 15, 5];
const RE_NOTIFICAR_MIN = 15;
const TZ = 'America/Bogota';
const OFFSET_BOGOTA_MIN = -5 * 60; // Bogotá es UTC-5 fijo (sin horario de verano)

// Lista de zonas de cobertura autorizadas (Tame y veredas)
const ZONA_COBERTURA = [
  'tame', 'centro', 'santander', 'la holanda', 'la esperanza',
  'puerto gaitan', 'corocito', 'puerto nariño', 'betoyes',
  'puerto miranda', 'san salvador', 'macarena', 'brisas',
];

/**
 * Convierte un Date (instante UTC) a sus componentes de calendario en Bogotá.
 * @returns {{anio,mes,dia,horas,minutos}} componentes locales de Bogotá
 */
function componentesBogota(fecha) {
  // Desplazar el instante UTC al "reloj de pared" de Bogotá
  const bogota = new Date(fecha.getTime() + OFFSET_BOGOTA_MIN * 60 * 1000);
  return {
    anio: bogota.getUTCFullYear(),
    mes: bogota.getUTCMonth() + 1,   // 1-12
    dia: bogota.getUTCDate(),
    horas: bogota.getUTCHours(),
    minutos: bogota.getUTCMinutes(),
  };
}

/**
 * Construye un Date (instante UTC) a partir de componentes de reloj de Bogotá.
 */
function desdeComponentesBogota(anio, mes, dia, horas, minutos) {
  // El reloj de pared de Bogotá en UTC = hora local - offset
  const comoUTC = Date.UTC(anio, mes - 1, dia, horas, minutos, 0, 0);
  return new Date(comoUTC - OFFSET_BOGOTA_MIN * 60 * 1000);
}

/**
 * ¿La hora programada cae dentro de la ventana de madrugada (3:00–6:00 AM Bogotá)?
 * 6:00 AM inclusive, 6:01+ fuera.
 */
function estaEnVentanaMadrugada(horaProgramada) {
  const { horas, minutos } = componentesBogota(horaProgramada);
  if (horas < VENTANA_INICIO_HORA) return false;
  if (horas > VENTANA_FIN_HORA) return false;
  if (horas === VENTANA_FIN_HORA && minutos > 0) return false; // 6:01+ fuera
  return true;
}

/**
 * Anticipación en horas (decimal) entre ahora y la hora programada.
 */
function calcularAnticipacionHoras(ahora, horaProgramada) {
  return (horaProgramada.getTime() - ahora.getTime()) / (1000 * 60 * 60);
}

/**
 * Minutos restantes (decimal) entre ahora y la hora programada.
 */
function minutosHasta(ahora, horaProgramada) {
  return (horaProgramada.getTime() - ahora.getTime()) / (1000 * 60);
}

/**
 * Parsea "DD/MM HH:MM AM/PM" en zona Bogotá y valida ventana + anticipación.
 * Asume el año en curso; si la fecha ya pasó respecto a `ahora`, usa el año siguiente.
 * @returns {{ok:true,horaProgramada:Date}} | {{ok:false,motivo:string}}
 *          motivo ∈ 'formato' | 'ventana' | 'anticipacion_min' | 'anticipacion_max'
 */
function parsearFechaHora(texto, ahora) {
  if (typeof texto !== 'string') return { ok: false, motivo: 'formato' };

  // DD/MM  HH:MM  AM|PM  (el AM/PM es obligatorio para evitar ambigüedad)
  const m = texto.trim().match(
    /^(\d{1,2})\s*\/\s*(\d{1,2})\s+(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)$/i
  );
  if (!m) return { ok: false, motivo: 'formato' };

  const dia = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  let horas = parseInt(m[3], 10);
  const minutos = parseInt(m[4], 10);
  const periodo = m[5].toLowerCase().replace(/[.\s]/g, '');

  // Validación básica de rangos de calendario
  if (mes < 1 || mes > 12) return { ok: false, motivo: 'formato' };
  if (dia < 1 || dia > 31) return { ok: false, motivo: 'formato' };
  if (horas < 1 || horas > 12) return { ok: false, motivo: 'formato' };
  if (minutos < 0 || minutos > 59) return { ok: false, motivo: 'formato' };

  // Convertir 12h a 24h
  if (periodo.startsWith('p') && horas < 12) horas += 12;
  if (periodo.startsWith('a') && horas === 12) horas = 0;

  const compAhora = componentesBogota(ahora);
  let anio = compAhora.anio;

  let horaProgramada = desdeComponentesBogota(anio, mes, dia, horas, minutos);
  // Si ya pasó, asumir el año siguiente
  if (horaProgramada.getTime() <= ahora.getTime()) {
    anio += 1;
    horaProgramada = desdeComponentesBogota(anio, mes, dia, horas, minutos);
  }

  // Validar fecha real (ej: 31/02 no existe → el Date se "corre")
  const comp = componentesBogota(horaProgramada);
  if (comp.dia !== dia || comp.mes !== mes) {
    return { ok: false, motivo: 'formato' };
  }

  // 1) Ventana de madrugada
  if (!estaEnVentanaMadrugada(horaProgramada)) {
    return { ok: false, motivo: 'ventana' };
  }

  // 2) Anticipación
  const anticip = calcularAnticipacionHoras(ahora, horaProgramada);
  if (anticip < ANTICIPACION_MIN_HORAS) return { ok: false, motivo: 'anticipacion_min' };
  if (anticip > ANTICIPACION_MAX_HORAS) return { ok: false, motivo: 'anticipacion_max' };

  return { ok: true, horaProgramada };
}

/**
 * Genera el código de reserva #UNT-YYYYMMDD-HHMM con la hora en Bogotá.
 */
function generarCodigoReserva(horaProgramada) {
  const { anio, mes, dia, horas, minutos } = componentesBogota(horaProgramada);
  const p2 = (n) => String(n).padStart(2, '0');
  return `#UNT-${anio}${p2(mes)}${p2(dia)}-${p2(horas)}${p2(minutos)}`;
}

/**
 * Valida cantidad de pasajeros: entero 1..4.
 * @returns {{ok:true,cantidad:number}} | {{ok:false}}
 */
function validarCantidadPasajeros(valor) {
  const texto = String(valor).trim();
  if (!/^\d+$/.test(texto)) return { ok: false }; // rechaza decimales/no numéricos
  const cantidad = parseInt(texto, 10);
  if (cantidad >= 1 && cantidad <= 4) return { ok: true, cantidad };
  return { ok: false };
}

/**
 * ¿El texto de dirección está dentro de la zona de cobertura autorizada?
 */
function estaEnZonaCobertura(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return false;
  const t = texto.toLowerCase();
  return ZONA_COBERTURA.some((zona) => t.includes(zona));
}

/**
 * Devuelve la fecha calendario de Bogotá (YYYY-MM-DD) de la hora programada.
 * Usada para la regla de máximo 3 viajes por noche.
 */
function fechaCalendarioBogota(horaProgramada) {
  const { anio, mes, dia } = componentesBogota(horaProgramada);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${anio}-${p2(mes)}-${p2(dia)}`;
}

module.exports = {
  // constantes
  TARIFA_MADRUGADA,
  VENTANA_INICIO_HORA,
  VENTANA_FIN_HORA,
  ANTICIPACION_MIN_HORAS,
  ANTICIPACION_MAX_HORAS,
  MAX_VIAJES_POR_NOCHE,
  CANCELACION_LIBRE_MIN,
  RECORDATORIOS_MIN,
  RE_NOTIFICAR_MIN,
  TZ,
  ZONA_COBERTURA,
  // funciones
  componentesBogota,
  desdeComponentesBogota,
  estaEnVentanaMadrugada,
  calcularAnticipacionHoras,
  minutosHasta,
  parsearFechaHora,
  generarCodigoReserva,
  validarCantidadPasajeros,
  estaEnZonaCobertura,
  fechaCalendarioBogota,
};
