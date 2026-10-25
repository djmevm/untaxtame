/**
 * geocoding.js
 * Utilidad de geocodificación inversa (coordenadas → dirección legible).
 * Centraliza la llamada a Google Maps para que el conductor vea una
 * dirección entendible en vez de coordenadas crudas.
 */

const fetch = require('node-fetch');

const GOOGLE_MAPS_KEY =
  process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyCz_s1BIBL0E9rJfQRXQ4lgnPb6GR9IiJE';

/**
 * Convierte lat/lng en una dirección legible.
 * Devuelve { direccion, barrio } o null si no se pudo resolver.
 */
async function direccionDesdeCoords(lat, lng) {
  if (lat == null || lng == null) return null;
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}` +
      `&key=${GOOGLE_MAPS_KEY}&language=es&region=co`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || data.results.length === 0) return null;

    const principal = data.results[0];
    const direccion = principal.formatted_address || null;

    // Intentar extraer el barrio/sector (sublocality / neighborhood)
    let barrio = null;
    for (const r of data.results) {
      for (const comp of r.address_components || []) {
        if (
          comp.types.includes('sublocality') ||
          comp.types.includes('neighborhood')
        ) {
          barrio = comp.long_name;
          break;
        }
      }
      if (barrio) break;
    }

    return { direccion, barrio };
  } catch (e) {
    console.error('[geocoding] Error:', e.message);
    return null;
  }
}

/**
 * Devuelve una dirección legible a partir de lat/lng, con fallback a
 * coordenadas si falla. Nunca lanza error.
 */
async function direccionLegible(lat, lng) {
  const fallback = (lat != null && lng != null)
    ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
    : null;
  const r = await direccionDesdeCoords(lat, lng);
  if (!r || !r.direccion) return fallback;
  // Si hay barrio y no está ya en la dirección, agregarlo como referencia
  if (r.barrio && !r.direccion.toLowerCase().includes(r.barrio.toLowerCase())) {
    return `${r.direccion} (${r.barrio})`;
  }
  return r.direccion;
}

/**
 * Distancia en km entre dos puntos (Haversine).
 */
function distanciaKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v == null)) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

module.exports = { direccionDesdeCoords, direccionLegible, distanciaKm };
