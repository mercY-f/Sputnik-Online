import { computePositionsFromSatrecs, computePassesFromSatrec } from '../lib/sgp4Core.js';

/**
 * Тонкий адаптер Web Worker'а для SGP4-расчёта (Vite module worker).
 *
 * Протокол:
 *   main → worker: { type: 'init', satellites: [{id, name, category, catalogNumber, satrec}] }
 *   main → worker: { type: 'compute', seq, timeMs }
 *   main → worker: { type: 'passes', seq, params }        // params → computePassesFromSatrec
 *   worker → main: { type: 'positions', seq, timeMs, positions }
 *   worker → main: { type: 'passes', seq, passes }        // [{aosMs, maxEl, losMs}]
 *   worker → main: { type: 'error', seq, timeMs, message }
 *
 * satrec — обычный объект из satellite.js (только примитивы), поэтому
 * спокойно клонируется structured clone при postMessage.
 */

let satellites = [];

self.onmessage = (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'init') {
    satellites = Array.isArray(msg.satellites) ? msg.satellites : [];
    return;
  }

  if (msg.type === 'passes') {
    const { seq, params } = msg;
    try {
      const passes = computePassesFromSatrec(params || {});
      self.postMessage({ type: 'passes', seq, passes });
    } catch (e) {
      self.postMessage({
        type: 'error',
        seq,
        timeMs: params && params.fromMs,
        message: String((e && e.message) || e),
      });
    }
    return;
  }

  if (msg.type === 'compute') {
    const { seq, timeMs } = msg;
    try {
      const positions = computePositionsFromSatrecs(satellites, new Date(timeMs));
      self.postMessage({ type: 'positions', seq, timeMs, positions });
    } catch (e) {
      // Ошибка расчёта не должна ронять воркер — сообщаем наверх
      self.postMessage({
        type: 'error',
        seq,
        timeMs,
        message: String((e && e.message) || e),
      });
    }
  }
};
