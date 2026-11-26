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

// ---------------------------------------------------------------------------
// Расчёт пролётов (видимости) для наблюдателя на поверхности Земли.
//
// Все функции ниже — чистые: ни DOM, ни Worker API. Их используют и воркер
// (resources/js/workers/sgp4.worker.js), и main-thread-fallback в
// sgp4WorkerClient.js, и публичная обёртка lib/passes.js.
// Внутри — миллисекунды UTC, объекты Date создаются только на границе API:
// так результат спокойно клонируется structured clone'ом.
// ---------------------------------------------------------------------------

/** Шаг грубого сканирования окна (мс). Пролёт МКС над 10° длится 4–10 мин. */
export const PASS_SCAN_STEP_MS = 20_000;

/** Допуск бисекции границ AOS/LOS (мс). */
export const PASS_BOUNDARY_TOL_MS = 500;

/** Допуск уточнения пика maxEl (мс) — «до ~1 секунды». */
export const PASS_PEAK_TOL_MS = 1_000;

/** Значение высоты, которым помечается точка, где propagate не дал результата. */
const INVALID_ELEVATION = -90;

/**
 * Объект наблюдателя в формате satellite.js (радианы, километры).
 *
 * @param {number} observerLat — широта, градусы
 * @param {number} observerLon — долгота, градусы
 * @param {number} [observerAltM=0] — высота над уровнем моря, метры
 * @returns {{latitude: number, longitude: number, height: number}|null}
 */
export function createObserverGeodetic(observerLat, observerLon, observerAltM = 0) {
  if (!Number.isFinite(observerLat) || !Number.isFinite(observerLon)) return null;
  if (Math.abs(observerLat) > 90) return null;

  return {
    latitude: satellite.degreesToRadians(observerLat),
    // Долгота приводится к [-180, 180], чтобы 370° не ломал atan2-геометрию
    longitude: satellite.degreesToRadians(((observerLon + 180) % 360 + 360) % 360 - 180),
    height: (Number.isFinite(observerAltM) ? observerAltM : 0) / 1000,
  };
}

/**
 * Высота спутника над горизонтом наблюдателя в градусах.
 *
 * @param {object} satrec — объект satellite.twoline2satrec
 * @param {{latitude, longitude, height}} observerGd
 * @param {number} timeMs — момент времени (UTC, мс)
 * @returns {number|null} градусы либо null, если propagate не удался
 */
export function elevationDegAt(satrec, observerGd, timeMs) {
  if (!satrec || !observerGd || !Number.isFinite(timeMs)) return null;

  const date = new Date(timeMs);
  try {
    const pv = satellite.propagate(satrec, date);
    // satellite.js при ошибке отдаёт position === false (в старых версиях — true)
    if (!pv || typeof pv.position === 'boolean' || !pv.position) return null;

    const gmst = satellite.gstime(date);
    const ecf  = satellite.eciToEcf(pv.position, gmst);
    const look = satellite.ecfToLookAngles(observerGd, ecf);

    if (!look || !Number.isFinite(look.elevation)) return null;

    return satellite.radiansToDegrees(look.elevation);
  } catch {
    return null;
  }
}

/**
 * Разбирает TLE в satrec, отсекая заведомо невалидные строки.
 *
 * @param {string} tle1
 * @param {string} tle2
 * @returns {object|null}
 */
export function satrecFromTle(tle1, tle2) {
  if (typeof tle1 !== 'string' || typeof tle2 !== 'string') return null;

  const l1 = tle1.trim();
  const l2 = tle2.trim();

  // Полноценная строка TLE — 69 символов, допускаем хвостовые пробелы
  if (l1.length < 60 || l2.length < 60) return null;
  if (l1.startsWith('1 ') === false || l2.startsWith('2 ') === false) return null;

  try {
    const satrec = satellite.twoline2satrec(l1, l2);
    if (!satrec || satrec.error) return null;
    if (!Number.isFinite(satrec.ecco) || !Number.isFinite(satrec.inclo)) return null;
    if (!Number.isFinite(satrec.no) || satrec.no <= 0) return null;
    return satrec;
  } catch {
    return null;
  }
}

/**
 * Точка пересечения порога высоты: бисекция на отрезке [loMs, hiMs],
 * где значения функции по краям лежат по разные стороны порога.
 *
 * @param {(t: number) => number} evaluate
 * @param {number} loMs — начало отрезка
 * @param {number} hiMs — конец отрезка
 * @param {number} threshold
 * @param {number} tolMs
 * @returns {number}
 */
function bisectThreshold(evaluate, loMs, hiMs, threshold, tolMs) {
  let lo = loMs;
  let hi = hiMs;
  // Направление движения через порог сохраняем, чтобы не перевернуть границу
  const rising = evaluate(hiMs) >= threshold;

  while (hi - lo > tolMs) {
    const mid = lo + Math.floor((hi - lo) / 2);
    const above = evaluate(mid) >= threshold;
    if (above === rising) hi = mid;
    else lo = mid;
  }

  return Math.round((lo + hi) / 2);
}

/**
 * Уточняет момент максимума высоты тернарным поиском (унимодально на ±шаг).
 *
 * @param {(t: number) => number} evaluate
 * @param {number} loMs
 * @param {number} hiMs
 * @param {number} tolMs
 * @returns {{t: number, elevation: number}}
 */
function refinePeak(evaluate, loMs, hiMs, tolMs) {
  let lo = loMs;
  let hi = hiMs;

  while (hi - lo > tolMs) {
    const third = Math.floor((hi - lo) / 3);
    const m1 = lo + third;
    const m2 = hi - third;
    if (evaluate(m1) < evaluate(m2)) lo = m1;
    else hi = m2;
  }

  const t = Math.round((lo + hi) / 2);
  return { t, elevation: evaluate(t) };
}

/**
 * Чистый расчёт видимых пролётов по готовому satrec.
 *
 * Пролёт — непрерывный интервал, на котором высота спутника над горизонтом
 * не ниже minElDeg. Границы уточняются бисекцией, пик — тернарным поиском.
 * Если спутник уже выше порога на старте окна, aos обрезается началом окна;
 * если он выше и в конце окна — пролёт закрывается временем toMs.
 *
 * @param {Object} params
 * @param {object} params.satrec
 * @param {number} params.observerLat
 * @param {number} params.observerLon
 * @param {number} [params.observerAltM=0]
 * @param {number} params.fromMs — начало окна (UTC, мс)
 * @param {number} params.toMs — конец окна (UTC, мс)
 * @param {number} [params.minElDeg=10]
 * @param {number} [params.stepMs=PASS_SCAN_STEP_MS]
 * @returns {Array<{aosMs: number, maxEl: number, losMs: number}>}
 */
export function computePassesFromSatrec({
  satrec,
  observerLat,
  observerLon,
  observerAltM = 0,
  fromMs,
  toMs,
  minElDeg = 10,
  stepMs = PASS_SCAN_STEP_MS,
} = {}) {
  const passes = [];

  if (!satrec || typeof satrec !== 'object') return passes;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return passes;

  const observerGd = createObserverGeodetic(observerLat, observerLon, observerAltM);
  if (!observerGd) return passes;

  const threshold = Number.isFinite(minElDeg) ? minElDeg : 10;

  const evaluate = (t) => {
    const el = elevationDegAt(satrec, observerGd, t);
    return el === null ? INVALID_ELEVATION : el;
  };

  // Шаг не крупнее четверти окна и не мельче секунды
  const windowMs = toMs - fromMs;
  const step = Math.max(
    1_000,
    Math.min(Number.isFinite(stepMs) && stepMs > 0 ? stepMs : PASS_SCAN_STEP_MS, Math.max(1_000, windowMs / 4)),
  );

  // Стартовое состояние: спутник может быть уже виден на fromMs
  let elapsed = evaluate(fromMs);
  let current = elapsed >= threshold
    ? { aosMs: fromMs, peakMs: fromMs, peakEl: elapsed, clippedStart: true }
    : null;

  let t = fromMs;

  while (t < toMs) {
    const tNext = Math.min(t + step, toMs);
    const elNext = evaluate(tNext);

    if (!current) {
      if (elNext >= threshold) {
        // Восход внутри (t, tNext]
        const aosMs = elapsed < threshold && elNext >= threshold
          ? bisectThreshold(evaluate, t, tNext, threshold, PASS_BOUNDARY_TOL_MS)
          : tNext;

        current = { aosMs, peakMs: tNext, peakEl: elNext, clippedStart: false };
      }
    } else if (elNext >= current.peakEl) {
      current.peakMs = tNext;
      current.peakEl = elNext;
    }

    if (current && elNext < threshold) {
      // Заход внутри (t, tNext]
      const losMs = bisectThreshold(evaluate, t, tNext, threshold, PASS_BOUNDARY_TOL_MS);

      // Пик ищем в пределах ±шага от лучшей выборки, не выходя за границы пролёта
      const winLo = Math.max(current.aosMs, current.peakMs - step);
      const winHi = Math.min(losMs, current.peakMs + step);

      let peakMs = current.peakMs;
      let peakEl = current.peakEl;
      if (winHi - winLo > 1_000) {
        const refined = refinePeak(evaluate, winLo, winHi, PASS_PEAK_TOL_MS);
        if (refined.elevation > peakEl) {
          peakMs = refined.t;
          peakEl = refined.elevation;
        }
      }

      if (losMs > current.aosMs) {
        passes.push({ aosMs: current.aosMs, maxEl: peakEl, losMs });
      }
      current = null;
    }

    t = tNext;
    elapsed = elNext;
  }

  // Спутник остался выше порога до конца окна — пролёт обрезан справа
  if (current && toMs > current.aosMs) {
    const winLo = Math.max(current.aosMs, current.peakMs - step);
    const winHi = Math.min(toMs, current.peakMs + step);

    let peakMs = current.peakMs;
    let peakEl = current.peakEl;
    if (winHi - winLo > 1_000) {
      const refined = refinePeak(evaluate, winLo, winHi, PASS_PEAK_TOL_MS);
      if (refined.elevation > peakEl) {
        peakMs = refined.t;
        peakEl = refined.elevation;
      }
    }

    passes.push({ aosMs: current.aosMs, maxEl: peakEl, losMs: toMs });
  }

  passes.sort((a, b) => a.aosMs - b.aosMs);
  return passes;
}

/**
 * Чистый расчёт пролётов по строкам TLE (см. computePassesFromSatrec).
 *
 * @param {Object} params
 * @param {string} params.tle1
 * @param {string} params.tle2
 * @returns {Array<{aosMs: number, maxEl: number, losMs: number}>} [] при невалидном TLE
 */
export function computePassesFromTle({ tle1, tle2, ...rest } = {}) {
  const satrec = satrecFromTle(tle1, tle2);
  if (!satrec) return [];
  return computePassesFromSatrec({ satrec, ...rest });
}
