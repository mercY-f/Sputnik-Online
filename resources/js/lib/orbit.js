/**
 * Чистые функции для расчёта орбитальных параметров из TLE.
 * Физические константы: WGS-84 / стандартная гравитационная модель Земли.
 */

export const MU = 398600.4418; // Гравитационный параметр Земли, км³/с²
export const EARTH_RADIUS_KM = 6378.137; // Экваториальный радиус Земли (WGS-84), км

/**
 * Преобразование 2-значного года TLE в 4-значный (правило NORAD: >=57 -> 19xx, <57 -> 20xx).
 * @param {number|string} yy
 * @returns {number}
 */
export function expandYear(yy) {
  const num = parseInt(yy, 10);
  if (Number.isNaN(num)) return null;
  return num >= 57 ? 1900 + num : 2000 + num;
}

/**
 * Парсинг международного обозначения COSPAR из TLE1 (символы 9..17, e.g. "98067A", "20035A").
 * @param {string} raw
 * @returns {{ id: string|null, year: number|null, piece: string|null }}
 */
export function parseIntlDesignator(raw) {
  if (!raw || typeof raw !== 'string') return { id: null, year: null, piece: null };
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{2})(\d{3})([A-Z0-9]{1,3})?$/i);
  if (!match) {
    return { id: trimmed || null, year: null, piece: null };
  }
  const fullYear = expandYear(match[1]);
  const launchNum = match[2];
  const piece = (match[3] || '').toUpperCase();
  const id = piece ? `${fullYear}-${launchNum}${piece}` : `${fullYear}-${launchNum}`;
  return { id, year: fullYear, piece };
}

/**
 * Парсинг эпохи TLE (символы 18..32 строки 1, e.g. "26299.20906838").
 * @param {string} raw
 * @returns {Date|null}
 */
export function parseEpoch(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 5) return null;

  const yy = trimmed.substring(0, 2);
  const dayFraction = parseFloat(trimmed.substring(2));
  const fullYear = expandYear(yy);
  if (fullYear === null || Number.isNaN(dayFraction)) return null;

  // Начало года UTC: 1 января 00:00:00.000
  const startOfYear = Date.UTC(fullYear, 0, 1, 0, 0, 0, 0);
  const epochMs = startOfYear + (dayFraction - 1) * 86400 * 1000;
  return new Date(epochMs);
}

/**
 * Классификация типа орбиты по высоте, эксцентриситету и наклонению.
 * @param {{ altAvg: number, ecc: number, inc: number }}
 * @returns {{ code: string, name: string, incType: string, description: string }}
 */
export function getOrbitType({ altAvg, ecc, inc }) {
  let code = 'LEO';
  let name = 'Низкая околоземная орбита (LEO)';

  if (ecc >= 0.25 || (altAvg > 36100 && ecc > 0.1)) {
    code = 'HEO';
    name = 'Высокоэллиптическая орбита (HEO)';
  } else if (altAvg >= 35500 && altAvg <= 36100) {
    if (inc < 5) {
      code = 'GEO';
      name = 'Геостационарная орбита (GEO)';
    } else {
      code = 'GSO';
      name = 'Геосинхронная орбита (GSO)';
    }
  } else if (altAvg > 2000) {
    code = 'MEO';
    name = 'Средняя околоземная орбита (MEO)';
  } else {
    // Проверка солнечно-синхронной орбиты (SSO): ретроградная LEO 96°..103°, высота до ~1400 км
    if (inc >= 96 && inc <= 103 && altAvg <= 1400) {
      code = 'SSO';
      name = 'Солнечно-синхронная орбита (SSO)';
    } else {
      code = 'LEO';
      name = 'Низкая околоземная орбита (LEO)';
    }
  }

  let incType = 'Наклонная';
  if (inc <= 10 || inc >= 170) {
    incType = 'Экваториальная';
  } else if ((inc >= 85 && inc <= 95) || (inc >= 80 && inc <= 100 && code !== 'SSO')) {
    incType = 'Полярная';
  }

  return {
    code,
    name,
    incType,
    description: `${name}, ${incType.toLowerCase()} (${inc.toFixed(1)}°)`,
  };
}

/**
 * Расчёт человекочитаемого возраста TLE (e.g. "2 ч. назад", "5 дн. назад").
 * @param {Date} epochDate
 * @param {Date} [now]
 * @returns {{ days: number, text: string }}
 */
export function formatEpochAge(epochDate, now = new Date()) {
  if (!epochDate || !(epochDate instanceof Date) || Number.isNaN(epochDate.getTime())) {
    return { days: 0, text: '—' };
  }
  const diffMs = now.getTime() - epochDate.getTime();
  const days = Math.max(0, diffMs / (86400 * 1000));
  const hours = Math.max(0, diffMs / (3600 * 1000));

  let text = '';
  if (hours < 1) {
    text = '< 1 ч. назад';
  } else if (hours < 24) {
    text = `${Math.round(hours)} ч. назад`;
  } else if (days < 30) {
    text = `${Math.round(days)} дн. назад`;
  } else {
    text = `${Math.round(days / 30)} мес. назад`;
  }

  return { days: parseFloat(days.toFixed(2)), text };
}

/**
 * Полный расчёт орбитальных параметров из двух строк TLE.
 * @param {string} tle1
 * @param {string} tle2
 * @param {Date} [now]
 * @returns {object|null}
 */
export function computeOrbitParameters(tle1, tle2, now = new Date()) {
  if (!tle1 || !tle2 || typeof tle1 !== 'string' || typeof tle2 !== 'string') {
    return null;
  }

  const line1 = tle1.trim();
  const line2 = tle2.trim();

  if (!line1.startsWith('1') || !line2.startsWith('2') || line2.length < 60) {
    return null;
  }

  try {
    // --- Строка 1 ---
    const catalogNumber1 = line1.substring(2, 7).trim();
    const intlRaw = line1.substring(9, 17).trim();
    const intlInfo = parseIntlDesignator(intlRaw);
    const epochRaw = line1.substring(18, 32).trim();
    const epochDate = parseEpoch(epochRaw);
    const epochAge = formatEpochAge(epochDate, now);

    // --- Строка 2 ---
    const catalogNumber2 = line2.substring(2, 7).trim();
    const inc = parseFloat(line2.substring(8, 16).trim());
    const raan = parseFloat(line2.substring(17, 25).trim());

    const eccRaw = line2.substring(26, 33).trim();
    const ecc = parseFloat('0.' + eccRaw);

    const argPe = parseFloat(line2.substring(34, 42).trim());
    const meanAnomaly = parseFloat(line2.substring(43, 51).trim());
    const meanMotion = parseFloat(line2.substring(52, 63).trim());

    if (Number.isNaN(inc) || Number.isNaN(meanMotion) || meanMotion <= 0) {
      return null;
    }

    // Орбитальный период
    const periodMin = 1440 / meanMotion;
    const periodSeconds = periodMin * 60;

    // Большая полуось a (через Kepler's 3rd law: n = sqrt(mu / a^3))
    const nRadPerSec = (meanMotion * 2 * Math.PI) / 86400;
    const a = Math.cbrt(MU / (nRadPerSec * nRadPerSec));

    // Апогей, перигей, средняя высота над поверхностью Земли
    const perigeeKm = a * (1 - ecc) - EARTH_RADIUS_KM;
    const apogeeKm = a * (1 + ecc) - EARTH_RADIUS_KM;
    const altAvgKm = a - EARTH_RADIUS_KM;

    // Круговая / средняя орбитальная скорость (км/с)
    const speedKmS = Math.sqrt(MU / a);

    // Тип орбиты
    const orbitType = getOrbitType({
      altAvg: altAvgKm,
      ecc,
      inc,
    });

    return {
      catalogNumber: catalogNumber2 || catalogNumber1,
      intlDesignator: intlInfo.id,
      launchYear: intlInfo.year,
      epochDate,
      epochAgeDays: epochAge.days,
      epochAgeText: epochAge.text,
      inclination: parseFloat(inc.toFixed(4)),
      raan: parseFloat(raan.toFixed(4)),
      eccentricity: parseFloat(ecc.toFixed(7)),
      argPerigee: parseFloat(argPe.toFixed(4)),
      meanAnomaly: parseFloat(meanAnomaly.toFixed(4)),
      meanMotion: parseFloat(meanMotion.toFixed(8)),
      periodMinutes: parseFloat(periodMin.toFixed(2)),
      semiMajorAxisKm: parseFloat(a.toFixed(2)),
      perigeeKm: parseFloat(perigeeKm.toFixed(1)),
      apogeeKm: parseFloat(apogeeKm.toFixed(1)),
      altitudeAvgKm: parseFloat(altAvgKm.toFixed(1)),
      orbitalSpeedKmS: parseFloat(speedKmS.toFixed(2)),
      orbitType,
    };
  } catch (err) {
    return null;
  }
}

export default computeOrbitParameters;
