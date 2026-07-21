/**
 * Sistema de Sectorización de Tame, Arauca
 * 
 * Zona 3: Carrera 1 a Carrera 11 (Occidente)
 * Zona 1: Carrera 12 a Carrera 21 (Centro)
 * Zona 2: Carrera 22 a Transversal 85 (Oriente/Nororiente)
 */

/**
 * Detecta la zona basándose en la dirección de texto.
 * Busca el número de carrera/transversal en la dirección.
 * @param {string} direccion - Dirección de texto (ej: "Carrera 15 con Calle 20")
 * @returns {string|null} - "Zona 1", "Zona 2", "Zona 3", o null si no se detecta
 */
function detectarZona(direccion) {
  if (!direccion || typeof direccion !== 'string') return null;

  const texto = direccion.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Buscar número de carrera o transversal
  // Patrones: "carrera 15", "cra 15", "cr 15", "kra 15", "kr 15", "transversal 85", "tv 30"
  const patronCarrera = /(?:carrera|cra|cr|kra|kr|calle|cl)\s*#?\s*(\d+)/i;
  const patronTransversal = /(?:transversal|tv|trans)\s*#?\s*(\d+)/i;

  let numero = null;
  let esCalle = false;

  // Primero buscar transversal
  const matchTv = texto.match(patronTransversal);
  if (matchTv) {
    numero = parseInt(matchTv[1]);
    // Las transversales en Tame están en la Zona 2
    return 'Zona 2';
  }

  // Buscar carrera
  const matchCarrera = texto.match(/(?:carrera|cra|cr|kra|kr)\s*#?\s*(\d+)/i);
  if (matchCarrera) {
    numero = parseInt(matchCarrera[1]);
  }

  // Si no encontramos carrera, buscar en formatos tipo "Cra15", "Kr22"
  if (!numero) {
    const matchCompacto = texto.match(/(?:cra|cr|kra|kr)(\d+)/i);
    if (matchCompacto) {
      numero = parseInt(matchCompacto[1]);
    }
  }

  // Si aún no tenemos número, intentar detectar con el formato de dirección completa
  // Ej: "Calle 20 # 15-22" → la carrera es 15
  if (!numero) {
    const matchDireccion = texto.match(/(?:calle|cl)\s*\d+\s*#?\s*(\d+)/i);
    if (matchDireccion) {
      numero = parseInt(matchDireccion[1]);
    }
  }

  if (!numero) return null;

  // Clasificar por zona
  if (numero >= 1 && numero <= 11) {
    return 'Zona 3'; // Occidente
  } else if (numero >= 12 && numero <= 21) {
    return 'Zona 1'; // Centro
  } else if (numero >= 22) {
    return 'Zona 2'; // Oriente/Nororiente
  }

  return null;
}

/**
 * Obtiene la descripción de una zona
 */
function descripcionZona(zona) {
  const zonas = {
    'Zona 1': 'Centro (Cra 12 - Cra 21)',
    'Zona 2': 'Oriente (Cra 22 - Tv 85)',
    'Zona 3': 'Occidente (Cra 1 - Cra 11)',
  };
  return zonas[zona] || zona;
}

module.exports = { detectarZona, descripcionZona };
