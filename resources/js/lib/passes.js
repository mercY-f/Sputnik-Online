/**
 * Модуль расчёта видимых пролётов спутника над точкой наблюдателя.
 *
 * Реализация (этап D5): SGP4 (satellite.js) + геоцентрическая геометрия
 * наблюдателя. Тяжёлое сканирование окна выносится в SGP4 Web Worker
 * (`workers/sgp4.worker.js` через `lib/sgp4WorkerClient.js`), а в Node.js /
 * при недоступном Worker / при сбое воркера тот же расчёт выполняется
 * синхронно чистой функцией из `lib/sgp4Core.js` — результат идентичен,
 * потому что код вычислений общий.
 *
 * Контракт (см. docs/mockups/CONTRACT-1BIT.md, раздел «г»):
 *   computePasses({ observerLat, observerLon, observerAltM = 0,
 *                   tle1, tle2, from, to, minElDeg = 10 })
 *     → Promise<Array<{ aos: Date, maxEl: number, los: Date }>> // UTC, по aos
 */

import {
  computePassesFromSatrec,
  satrecFromTle,
  createObserverGeodetic,
  PASS_SCAN_STEP_MS,
} from './sgp4Core.js';
import sgp4WorkerClient from './sgp4WorkerClient.js';

export { PASS_SCAN_STEP_MS };

/** Приводит значение к миллисекундам UTC; NaN, если момент невалиден. */
function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return NaN;
}

/** Внутренний результат (мс) → публичный контракт (Date). */
function toPassObjects(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((p) => p && Number.isFinite(p.aosMs) && Number.isFinite(p.losMs))
    .map((p) => ({
      aos: new Date(p.aosMs),
      maxEl: p.maxEl,
      los: new Date(p.losMs),
    }))
    .sort((a, b) => a.aos.getTime() - b.aos.getTime());
}

/**
 * Вычисляет видимые пролёты спутника над заданной географической точкой.
 *
 * @param {import('../types/contracts').ComputePassesInput} params
 * @returns {Promise<Array<import('../types/contracts').Pass>>} Пролёты, отсортированные по времени начала (aos)
 */
export async function computePasses({
  observerLat,
  observerLon,
  observerAltM = 0,
  tle1,
  tle2,
  from,
  to,
  minElDeg = 10,
} = {}) {
  const fromMs = toMs(from);
  const toMsValue = toMs(to);

  // Невалидное окно расчёта — пролётов нет
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMsValue) || fromMs >= toMsValue) {
    return [];
  }

  // Невалидные координаты наблюдателя
  if (!createObserverGeodetic(observerLat, observerLon, observerAltM)) {
    return [];
  }

  // Невалидный TLE — пролётов нет
  const satrec = satrecFromTle(tle1, tle2);
  if (!satrec) return [];

  const params = {
    satrec,
    observerLat: Number(observerLat),
    observerLon: Number(observerLon),
    observerAltM: Number.isFinite(observerAltM) ? Number(observerAltM) : 0,
    fromMs,
    toMs: toMsValue,
    minElDeg: Number.isFinite(minElDeg) ? Number(minElDeg) : 10,
    stepMs: PASS_SCAN_STEP_MS,
  };

  // Основной путь — воркер; null означает «воркер недоступен/сорвался»
  let raw = null;
  try {
    raw = await sgp4WorkerClient.computePasses(params);
  } catch {
    raw = null;
  }

  // Fallback: та же чистая функция на главном потоке (Node.js, нет Worker, сбой)
  if (raw === null || raw === undefined) {
    try {
      raw = computePassesFromSatrec(params);
    } catch {
      raw = [];
    }
  }

  return toPassObjects(raw);
}

export default computePasses;
