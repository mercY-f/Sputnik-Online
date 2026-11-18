/**
 * Модуль расчёта видимых пролётов спутника над точкой наблюдателя.
 *
 * ВНИМАНИЕ: Текущая реализация является детерминированной заглушкой (Этап Step 1)
 * для обеспечения возможности параллельной вёрстки и тестирования UI (U4).
 * Полноценный расчёт через SGP4 и координаты наблюдателя будет реализован на этапе D5.
 */

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
}) {
  // Подавление предупреждений линтера о неиспользуемых параметрах в заглушке
  void observerLat;
  void observerLon;
  void observerAltM;
  void tle1;
  void tle2;
  void to;

  const startMs = from instanceof Date ? from.getTime() : new Date(from).getTime();

  // Детерминированные смещения пролётов от времени начала интервала (в миллисекундах)
  const minute = 60 * 1000;
  const passes = [
    {
      aos: new Date(startMs + 45 * minute),
      maxEl: Math.max(minElDeg, 42),
      los: new Date(startMs + 56 * minute),
    },
    {
      aos: new Date(startMs + 138 * minute),
      maxEl: Math.max(minElDeg, 76),
      los: new Date(startMs + 150 * minute),
    },
    {
      aos: new Date(startMs + 232 * minute),
      maxEl: Math.max(minElDeg, 28),
      los: new Date(startMs + 242 * minute),
    },
  ];

  // Гарантированная сортировка по времени появления (aos)
  passes.sort((a, b) => a.aos.getTime() - b.aos.getTime());

  return passes;
}

export default computePasses;
