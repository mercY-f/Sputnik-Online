import * as satellite from 'satellite.js';

/**
 * Чистый расчёт позиций спутников по их satrec-объектам (без DOM и Worker API).
 *
 * Используется и воркером (resources/js/workers/sgp4.worker.js), и
 * main-thread-fallback'ом в sgp4WorkerClient.js. Тело перенесено из
 * Index.vue::computePositions без изменения логики: на каждый спутник —
 * propagate → gstime → eciToGeodetic, ошибки отдельного аппарата не роняют батч.
 *
 * @param {Array<{id, name, category, catalogNumber, satrec}>} satellites
 * @param {Date|number} date — момент расчёта
 * @returns {Array<{id, name, category, catalogNumber, lat, lng, alt}>}
 */
export function computePositionsFromSatrecs(satellites, date) {
  const now = date instanceof Date ? date : new Date(date);
  const positions = [];

  if (!Array.isArray(satellites) || !satellites.length) return positions;

  for (const sat of satellites) {
    try {
      const pv   = satellite.propagate(sat.satrec, now);
      const pos  = pv.position;
      if (typeof pos === 'boolean') continue;

      const gmst = satellite.gstime(now);
      const gd   = satellite.eciToGeodetic(pos, gmst);

      positions.push({
        id:       sat.id,
        name:     sat.name,
        category: sat.category,
        catalogNumber: sat.catalogNumber,
        lat:  satellite.degreesLat(gd.latitude),
        lng:  satellite.degreesLong(gd.longitude),
        alt:  gd.height / 6371,
      });
    } catch {}
  }

  return positions;
}

export default computePositionsFromSatrecs;
