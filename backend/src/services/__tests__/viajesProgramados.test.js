const fc = require('fast-check');
const vp = require('../viajesProgramados');

// Instante base fijo para pruebas deterministas: 15/01/2025 20:00 Bogotá (01:00 UTC del 16)
const AHORA_BASE = vp.desdeComponentesBogota(2025, 1, 15, 20, 0);

describe('viajesProgramados — funciones puras', () => {

  // Feature: viajes-programados-madrugada, Property 1: Clasificación correcta de fecha/hora
  test('Property 1: parsearFechaHora clasifica de forma determinista', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),      // hora del día (24h)
        fc.constantFrom(0, 15, 30, 45),       // minutos
        fc.integer({ min: 1, max: 15 }),      // día del mes (seguro, sin desbordes)
        (horaDia, minutos, diaOffset) => {
          const ahora = AHORA_BASE;
          const compAhora = vp.componentesBogota(ahora);
          // Día objetivo dentro del mismo mes (16..30 aprox, siempre > hoy=15)
          const diaObjetivo = compAhora.dia + diaOffset; // 16..30
          const objetivo = vp.desdeComponentesBogota(compAhora.anio, compAhora.mes, diaObjetivo, horaDia, minutos);

          const c = vp.componentesBogota(objetivo);
          let h12 = c.horas % 12; if (h12 === 0) h12 = 12;
          const periodo = c.horas < 12 ? 'AM' : 'PM';
          const texto = `${c.dia}/${c.mes} ${h12}:${String(c.minutos).padStart(2, '0')} ${periodo}`;

          const res = vp.parsearFechaHora(texto, ahora);

          // Se permite CUALQUIER fecha y hora futura: sin ventana ni anticipación.
          // Todos los objetivos aquí son futuros (día 16..30 vs hoy=15).
          expect(res.ok).toBe(true);
          const rc = vp.componentesBogota(res.horaProgramada);
          expect(rc.horas).toBe(c.horas);
          expect(rc.minutos).toBe(c.minutos);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: viajes-programados-madrugada, Property 1 (formato): entrada no reconocida → 'formato'
  test('Property 1b: formato inválido retorna motivo formato', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (texto) => {
          // Textos que claramente no cumplen el patrón
          const esValido = /^\s*\d{1,2}\s*\/\s*\d{1,2}\s+\d{1,2}:\d{2}\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)\s*$/i.test(texto);
          if (!esValido) {
            const res = vp.parsearFechaHora(texto, AHORA_BASE);
            expect(res.ok).toBe(false);
            expect(res.motivo).toBe('formato');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: viajes-programados-madrugada, Property 2: Codigo_Reserva consistente con hora Bogotá
  test('Property 2: generarCodigoReserva formato #UNT-YYYYMMDD-HHMM', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2025-01-01T00:00:00Z'), max: new Date('2030-12-31T23:59:00Z') }),
        (fecha) => {
          const codigo = vp.generarCodigoReserva(fecha);
          expect(codigo).toMatch(/^#UNT-\d{8}-\d{4}$/);
          const c = vp.componentesBogota(fecha);
          const p2 = (n) => String(n).padStart(2, '0');
          const esperado = `#UNT-${c.anio}${p2(c.mes)}${p2(c.dia)}-${p2(c.horas)}${p2(c.minutos)}`;
          expect(codigo).toBe(esperado);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: viajes-programados-madrugada, Property 3: Validación de cantidad de pasajeros
  test('Property 3: validarCantidadPasajeros acepta solo enteros 1..4', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -10, max: 20 }),
          fc.float({ min: 0, max: 10, noNaN: true }),
          fc.string()
        ),
        (valor) => {
          const res = vp.validarCantidadPasajeros(valor);
          const texto = String(valor).trim();
          const esEnteroEnRango = /^\d+$/.test(texto) && parseInt(texto, 10) >= 1 && parseInt(texto, 10) <= 4;
          if (esEnteroEnRango) {
            expect(res).toEqual({ ok: true, cantidad: parseInt(texto, 10) });
          } else {
            expect(res.ok).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: viajes-programados-madrugada, Property 4: Validación de zona de cobertura
  test('Property 4: estaEnZonaCobertura detecta zonas autorizadas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...vp.ZONA_COBERTURA),
        fc.string(),
        (zona, extra) => {
          // Un texto que contiene una zona autorizada → true
          expect(vp.estaEnZonaCobertura(`${extra} ${zona} ${extra}`)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
    // Textos sin ninguna zona → false
    expect(vp.estaEnZonaCobertura('xyzqwerty 123')).toBe(false);
    expect(vp.estaEnZonaCobertura('')).toBe(false);
  });
});
