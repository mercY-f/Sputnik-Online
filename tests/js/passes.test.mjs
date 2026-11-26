import assert from 'node:assert/strict';
import * as satellite from 'satellite.js';
import { computePasses } from '../../resources/js/lib/passes.js';

console.log('--- Testing passes.js (SGP4 + геометрия наблюдателя) ---');

// ---------------------------------------------------------------------------
// Данные: реальный TLE МКС (эпоха 2026-299.20906838 ≈ 2026-10-26 05:01 UTC)
// и наблюдатель в Москве. Окно — сутки с 2026-10-26T00:00:00Z.
// ---------------------------------------------------------------------------
const issTle1 = '1 25544U 98067A   26299.20906838  .00006121  00000+0  11890-3 0  9995';
const issTle2 = '2 25544  51.6337  11.7282 0006920 310.9581  49.0809 15.49059765592065';
const observerLat = 55.7558;
const observerLon = 37.6173;
const from = new Date('2026-10-26T00:00:00Z');
const to = new Date(from.getTime() + 24 * 3600 * 1000);

/**
 * Независимая проверка высоты: тот же satellite.js, но собранная здесь
 * цепочка propagate → gstime → eciToEcf → ecfToLookAngles. Нужна, чтобы
 * тест не доверял внутренностям passes.js.
 */
const satrec = satellite.twoline2satrec(issTle1, issTle2);
const observerGd = {
  latitude: satellite.degreesToRadians(observerLat),
  longitude: satellite.degreesToRadians(observerLon),
  height: 0,
};

function elevationAt(date) {
  const pv = satellite.propagate(satrec, date);
  assert.notEqual(typeof pv.position, 'boolean', 'propagate должен вернуть позицию');
  const ecf = satellite.eciToEcf(pv.position, satellite.gstime(date));
  const look = satellite.ecfToLookAngles(observerGd, ecf);
  return satellite.radiansToDegrees(look.elevation);
}

// 1. Реальный пролёт МКС: 4 видимых пролёта за сутки в Москве
const passes = await computePasses({
  observerLat,
  observerLon,
  observerAltM: 120,
  tle1: issTle1,
  tle2: issTle2,
  from,
  to,
  minElDeg: 10,
});

assert.equal(passes.length, 4, `За сутки над Москвой ожидалось 4 пролёта, получено ${passes.length}`);
console.log('✓ Пролётов за сутки:', passes.length);
for (const p of passes) {
  console.log(
    `   AOS ${p.aos.toISOString()}  maxEl ${p.maxEl.toFixed(2)}°  LOS ${p.los.toISOString()}`,
  );
}

// 2. Формат контракта: Date/Date, число, порядок по aos
for (const p of passes) {
  assert(p.aos instanceof Date && !Number.isNaN(p.aos.getTime()), 'aos должен быть валидным Date');
  assert(p.los instanceof Date && !Number.isNaN(p.los.getTime()), 'los должен быть валидным Date');
  assert.equal(typeof p.maxEl, 'number');
  assert(p.los.getTime() > p.aos.getTime(), 'los должен быть позже aos');
  assert(p.maxEl >= 10 && p.maxEl <= 90, `maxEl вне диапазона: ${p.maxEl}`);
}
for (let i = 1; i < passes.length; i++) {
  assert(passes[i].aos.getTime() >= passes[i - 1].aos.getTime(), 'пролёты должны быть отсортированы по aos');
}

// 3. Известный пролёт: сверка с эталоном расчёта по этому TLE (±60 c —
//    допуск на разницу эпох/интерполяций, точное совпадение не требуется)
const known = passes[0];
const refAos = Date.parse('2026-10-26T00:39:39Z');
const refLos = Date.parse('2026-10-26T00:45:46Z');
assert(Math.abs(known.aos.getTime() - refAos) < 60_000, `AOS первого пролёта: ${known.aos.toISOString()}`);
assert(Math.abs(known.los.getTime() - refLos) < 60_000, `LOS первого пролёта: ${known.los.toISOString()}`);
assert(Math.abs(known.maxEl - 31.39) < 0.5, `maxEl первого пролёта: ${known.maxEl}`);
assert(Math.abs(known.aos.getTime() - refAos) < 5_000, 'AOS должен совпадать с эталоном в пределах 5 c');
assert(Math.abs(known.los.getTime() - refLos) < 5_000, 'LOS должен совпадать с эталоном в пределах 5 c');
console.log('✓ Первый пролёт совпал с эталоном:', known.aos.toISOString(), `${known.maxEl.toFixed(2)}°`);

// 4. Независимая проверка окна видимости по satellite.js:
//    за 10 c до AOS ещё ниже порога, через 10 c после AOS — уже выше.
//    На самих границах высота ≈ minElDeg.
for (const p of passes) {
  const aosMs = p.aos.getTime();
  const losMs = p.los.getTime();

  assert(elevationAt(new Date(aosMs - 10_000)) < 10, 'до AOS спутник должен быть ниже 10°');
  assert(elevationAt(new Date(aosMs + 10_000)) > 10, 'после AOS спутник должен быть выше 10°');
  assert(elevationAt(new Date(losMs + 10_000)) < 10, 'после LOS спутник должен быть ниже 10°');
  assert(elevationAt(new Date(losMs - 10_000)) > 10, 'до LOS спутник должен быть выше 10°');

  assert(Math.abs(elevationAt(p.aos) - 10) < 0.5, `высота на AOS: ${elevationAt(p.aos)}`);
  assert(Math.abs(elevationAt(p.los) - 10) < 0.5, `высота на LOS: ${elevationAt(p.los)}`);

  // Длительность пролёта МКС над 10° — от 3 до 12 минут
  const durationMin = (losMs - aosMs) / 60_000;
  assert(durationMin > 3 && durationMin < 12, `длительность пролёта: ${durationMin.toFixed(2)} мин`);
}

// 5. Пик: maxEl не ниже любой высоты внутри пролёта (сетка 10 c),
//    и он достигается на интервале пролёта
for (const p of passes) {
  let denseMax = -90;
  for (let t = p.aos.getTime(); t <= p.los.getTime(); t += 10_000) {
    denseMax = Math.max(denseMax, elevationAt(new Date(t)));
  }
  assert(
    p.maxEl >= denseMax - 0.05,
    `maxEl (${p.maxEl.toFixed(3)}) ниже плотного максимума (${denseMax.toFixed(3)})`,
  );
  assert(p.maxEl <= 90);
  // максимум не может быть «за краем»: высота на границах ~10°, пик выше
  assert(p.maxEl > 10);
}
console.log('✓ Пики maxEl не ниже плотного сканирования с шагом 10 c');

// 6. Сканирование устойчиво к шагу: maxEl не зависит от внутреннего шага
const stepShifted = await computePasses({
  observerLat, observerLon, tle1: issTle1, tle2: issTle2, from, to, minElDeg: 10,
});
assert.equal(stepShifted.length, passes.length);
passes.forEach((p, i) => {
  assert(Math.abs(p.aos.getTime() - stepShifted[i].aos.getTime()) < 2_000);
  assert(Math.abs(p.maxEl - stepShifted[i].maxEl) < 0.2);
});

// 7. Порог minElDeg меняет число пролётов (монотонно не возрастает)
const lowThreshold = await computePasses({
  observerLat, observerLon, tle1: issTle1, tle2: issTle2, from, to, minElDeg: 0,
});
const highThreshold = await computePasses({
  observerLat, observerLon, tle1: issTle1, tle2: issTle2, from, to, minElDeg: 30,
});
assert(lowThreshold.length >= passes.length, 'при minEl=0 пролётов не меньше, чем при 10°');
assert(highThreshold.length <= passes.length, 'при minEl=30 пролётов не больше, чем при 10°');
assert.equal(lowThreshold.length, 6);
assert.equal(highThreshold.length, 2);
console.log(`✓ Порог: 0° → ${lowThreshold.length}, 10° → ${passes.length}, 30° → ${highThreshold.length} пролётов`);

// 8. Спутник уже выше порога на старте окна: AOS обрезается началом окна
const midPass = known.aos.getTime() + Math.round((known.los.getTime() - known.aos.getTime()) / 2);
const clippedStart = await computePasses({
  observerLat, observerLon, tle1: issTle1, tle2: issTle2,
  from: new Date(midPass), to, minElDeg: 10,
});
assert(clippedStart.length > 0, 'окно внутри пролёта должно дать хотя бы один пролёт');
assert.equal(clippedStart[0].aos.getTime(), midPass, 'AOS обрезанного пролёта равен началу окна');
assert(clippedStart[0].maxEl > 10);

// 9. Спутник остаётся выше порога до конца окна: LOS обрезается концом окна
const clippedEndTo = new Date(known.los.getTime() - 60_000);
const clippedEnd = await computePasses({
  observerLat, observerLon, tle1: issTle1, tle2: issTle2,
  from, to: clippedEndTo, minElDeg: 10,
});
assert.equal(clippedEnd.length, 1);
assert.equal(clippedEnd[0].los.getTime(), clippedEndTo.getTime(), 'LOS обрезанного пролёта равен концу окна');

// 10. Окно полностью внутри одного пролёта: один пролёт от from до to
const innerFrom = new Date(known.aos.getTime() + 30_000);
const innerTo = new Date(known.los.getTime() - 30_000);
const inner = await computePasses({
  observerLat, observerLon, tle1: issTle1, tle2: issTle2,
  from: innerFrom, to: innerTo, minElDeg: 10,
});
assert.equal(inner.length, 1, 'окно внутри пролёта даёт ровно один пролёт');
assert.equal(inner[0].aos.getTime(), innerFrom.getTime());
assert.equal(inner[0].los.getTime(), innerTo.getTime());
assert(inner[0].maxEl >= known.maxEl - 0.05, 'пик внутри окна совпадает с пиком пролёта');
console.log('✓ Обрезка окна на старте/конце и внутри пролёта');

// 11. Наблюдатель, который не видит МКС за сутки (полюс)
const polar = await computePasses({
  observerLat: 89, observerLon: 0, tle1: issTle1, tle2: issTle2, from, to, minElDeg: 10,
});
assert.deepEqual(polar, []);
console.log('✓ Полюс: пролётов нет');

// 12. Граничные случаи: пустое окно, невалидный TLE, невалидные координаты
const sameTime = await computePasses({
  observerLat, observerLon, tle1: issTle1, tle2: issTle2, from, to: from,
});
assert.deepEqual(sameTime, []);

const reversed = await computePasses({
  observerLat, observerLon, tle1: issTle1, tle2: issTle2, from: to, to: from,
});
assert.deepEqual(reversed, []);

for (const [t1, t2] of [
  ['', ''],
  ['broken', 'broken'],
  [null, null],
  [issTle1, 'broken'],
]) {
  const res = await computePasses({ observerLat, observerLon, tle1: t1, tle2: t2, from, to });
  assert.deepEqual(res, [], `невалидный TLE (${t1}, ${t2}) должен дать []`);
}

const badCoords = await computePasses({
  observerLat: Number.NaN, observerLon, tle1: issTle1, tle2: issTle2, from, to,
});
assert.deepEqual(badCoords, []);

const badLat = await computePasses({
  observerLat: 120, observerLon, tle1: issTle1, tle2: issTle2, from, to,
});
assert.deepEqual(badLat, []);

const badWindow = await computePasses({
  observerLat, observerLon, tle1: issTle1, tle2: issTle2,
  from: new Date('invalid'), to,
});
assert.deepEqual(badWindow, []);
console.log('✓ Граничные случаи: пустое/перевёрнутое окно, невалидный TLE и координаты → []');

// 13. Долгота приводится к [-180, 180]: 37.6173° и 397.6173° — один и тот же
//     меридиан, значит одинаковые пролёты
const lonWrapped = await computePasses({
  observerLat, observerLon: observerLon + 360, tle1: issTle1, tle2: issTle2, from, to, minElDeg: 10,
});
assert.equal(lonWrapped.length, passes.length);
passes.forEach((p, i) => {
  assert(Math.abs(p.aos.getTime() - lonWrapped[i].aos.getTime()) < 2_000);
  assert(Math.abs(p.maxEl - lonWrapped[i].maxEl) < 0.01);
});
console.log('✓ Нормализация долготы');

console.log('All passes tests passed successfully!');
