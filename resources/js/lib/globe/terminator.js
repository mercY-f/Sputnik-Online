import * as THREE from 'three';

/**
 * Низкоточная формула NOAA для расчёта субсолнечной точки (lat, lng) по текущему UTC.
 * Источник: NOAA Solar Calculation Details (перенесено из docs/mockups/ui-1bit.html).
 *
 * @param {Date} [date] время UTC (по умолчанию текущее)
 * @returns {{ lat: number, lng: number }} географические координаты подсолнечной точки (градусы)
 */
export function getSubsolarCoords(date) {
  const now = date || new Date();
  const timeMs = now.getTime();
  const jd = 2440587.5 + timeMs / 86400000.0;
  const t = (jd - 2451545.0) / 36525.0;

  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360.0;
  const m = (357.52911 + t * (35999.05029 - 0.0001537 * t)) % 360.0;
  const mRad = m * Math.PI / 180.0;
  const l0Rad = l0 * Math.PI / 180.0;
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const c = Math.sin(mRad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
            Math.sin(2 * mRad) * (0.019993 - 0.000101 * t) +
            Math.sin(3 * mRad) * 0.000289;
  const sunTrueLon = l0 + c;
  const obliq = 23.439291 - 0.0130042 * t;
  const obliqRad = obliq * Math.PI / 180.0;

  const sinDec = Math.sin(obliqRad) * Math.sin(sunTrueLon * Math.PI / 180.0);
  const decDeg = Math.asin(sinDec) * 180.0 / Math.PI;

  const y = Math.pow(Math.tan(obliqRad / 2.0), 2);
  const eqTime = 4.0 * (180.0 / Math.PI) * (
    y * Math.sin(2 * l0Rad) -
    2 * e * Math.sin(mRad) +
    4 * e * y * Math.sin(mRad) * Math.cos(2 * l0Rad) -
    0.5 * Math.pow(y, 2) * Math.sin(4 * l0Rad) -
    1.25 * Math.pow(e, 2) * Math.sin(2 * mRad)
  );

  const utHours = now.getUTCHours() + now.getUTCMinutes() / 60.0 + now.getUTCSeconds() / 3600.0;
  const solarNoon = 12.0 - eqTime / 60.0;
  let lngDeg = -(utHours - solarNoon) * 15.0;
  lngDeg = ((lngDeg + 180.0) % 360.0 + 360.0) % 360.0 - 180.0;

  return { lat: decDeg, lng: lngDeg };
}

/**
 * Шейдеры терминатора: Bayer 4×4 ordered dithering для 1-битного затенения ночной стороны.
 * Источник: docs/mockups/terminator-test.html.
 */
export const TERMINATOR_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldNormal;
  void main() {
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const TERMINATOR_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform vec3 uSunDir;
  uniform vec3 uDayColor;
  uniform vec3 uNightColor;
  uniform float uNightMaxDensity;
  uniform float uEnabled;
  varying vec3 vWorldNormal;

  float getBayer4x4(vec2 pos) {
    int x = int(mod(pos.x, 4.0));
    int y = int(mod(pos.y, 4.0));
    if (y == 0) {
      if (x == 0) return 0.5 / 16.0;
      if (x == 1) return 8.5 / 16.0;
      if (x == 2) return 2.5 / 16.0;
      return 10.5 / 16.0;
    }
    if (y == 1) {
      if (x == 0) return 12.5 / 16.0;
      if (x == 1) return 4.5 / 16.0;
      if (x == 2) return 14.5 / 16.0;
      return 6.5 / 16.0;
    }
    if (y == 2) {
      if (x == 0) return 3.5 / 16.0;
      if (x == 1) return 11.5 / 16.0;
      if (x == 2) return 1.5 / 16.0;
      return 9.5 / 16.0;
    }
    if (x == 0) return 15.5 / 16.0;
    if (x == 1) return 7.5 / 16.0;
    if (x == 2) return 13.5 / 16.0;
    return 5.5 / 16.0;
  }

  void main() {
    if (uEnabled < 0.5) {
      gl_FragColor = vec4(uDayColor, 1.0);
      return;
    }
    vec3 norm = normalize(vWorldNormal);
    float b = dot(norm, normalize(uSunDir));
    float shade = 1.0 - smoothstep(-0.15, 0.15, b);
    shade = min(shade, uNightMaxDensity);

    float bayer = getBayer4x4(gl_FragCoord.xy);
    vec3 col = (shade > bayer) ? uNightColor : uDayColor;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Создаёт шейдерный материал терминатора с периодическим обновлением направления на солнце.
 *
 * @param {object} globeInstance инстанс Globe() (globe.gl)
 * @param {object} [options]
 * @param {boolean} [options.enabled=true] начальное состояние слоя
 * @param {number} [options.updateIntervalMs=60000] интервал обновления солнца (мс, по умолчанию 60с)
 * @param {number} [options.nightMaxDensity=0.75] максимальная плотность дизеринга ночи
 * @returns {{
 *   material: THREE.ShaderMaterial,
 *   uniforms: object,
 *   updateSunPosition: (date?: Date) => { lat: number, lng: number },
 *   setEnabled: (enabled: boolean) => void,
 *   timer: any,
 *   dispose: () => void
 * }}
 */
export function createTerminator(globeInstance, options = {}) {
  const {
    enabled = true,
    updateIntervalMs = 60000,
    nightMaxDensity = 0.75,
  } = options;

  const uniforms = {
    uSunDir: { value: new THREE.Vector3(1.0, 0.0, 0.0) },
    uDayColor: { value: new THREE.Vector3(244 / 255, 241 / 255, 234 / 255) },
    uNightColor: { value: new THREE.Vector3(14 / 255, 14 / 255, 14 / 255) },
    uNightMaxDensity: { value: nightMaxDensity },
    uEnabled: { value: enabled ? 1.0 : 0.0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: TERMINATOR_VERTEX_SHADER,
    fragmentShader: TERMINATOR_FRAGMENT_SHADER,
  });
  material.name = 'terminatorMaterial';

  function updateSunPosition(date) {
    const d = date || new Date();
    const subsolar = getSubsolarCoords(d);

    if (globeInstance && typeof globeInstance.getCoords === 'function') {
      const sc = globeInstance.getCoords(subsolar.lat, subsolar.lng, 1);
      if (sc && uniforms.uSunDir) {
        uniforms.uSunDir.value.set(sc.x, sc.y, sc.z).normalize();
        return subsolar;
      }
    }

    // Резервный расчёт в системе координат three-globe
    const phi = (90 - subsolar.lat) * (Math.PI / 180.0);
    const theta = (subsolar.lng + 180.0) * (Math.PI / 180.0);
    if (uniforms.uSunDir) {
      uniforms.uSunDir.value.set(
        -Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();
    }
    return subsolar;
  }

  function setEnabled(flag) {
    if (uniforms.uEnabled) {
      uniforms.uEnabled.value = flag ? 1.0 : 0.0;
    }
  }

  // Первичное вычисление положения солнца
  updateSunPosition();

  // Периодическое дешёвое обновление (по умолчанию раз в минуту, без покадровых вычислений)
  let timer = null;
  if (updateIntervalMs > 0 && typeof setInterval === 'function') {
    timer = setInterval(() => {
      updateSunPosition();
    }, updateIntervalMs);
  }

  function dispose() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (material && typeof material.dispose === 'function') {
      material.dispose();
    }
  }

  return {
    material,
    uniforms,
    updateSunPosition,
    setEnabled,
    timer,
    dispose,
  };
}
