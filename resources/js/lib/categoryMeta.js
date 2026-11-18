/**
 * Единая карта метаданных категорий спутников.
 *
 * Буквы глифов атласа (S O N T I R W ×):
 * - STARLINK   → 'S'
 * - ONEWEB     → 'O'
 * - NAVIGATION → 'N'
 * - TELESCOPE  → 'T'
 * - ISS        → 'I'
 * - IRIDIUM    → 'R'
 * - WEATHER    → 'W'
 * - OTHER      → '×'
 * - ALL        → null
 */
export const CATEGORY_META = {
  ALL: {
    letter: null,
    labelRu: 'ВСЕ',
  },
  ISS: {
    letter: 'I',
    labelRu: 'СТАНЦИИ',
  },
  STARLINK: {
    letter: 'S',
    labelRu: 'STARLINK',
  },
  ONEWEB: {
    letter: 'O',
    labelRu: 'ONEWEB',
  },
  IRIDIUM: {
    letter: 'R',
    labelRu: 'IRIDIUM',
  },
  NAVIGATION: {
    letter: 'N',
    labelRu: 'НАВИГАЦИЯ',
  },
  WEATHER: {
    letter: 'W',
    labelRu: 'ПОГОДА',
  },
  TELESCOPE: {
    letter: 'T',
    labelRu: 'ТЕЛЕСКОПЫ',
  },
  OTHER: {
    letter: '×',
    labelRu: 'ДРУГОЕ',
  },
};

/**
 * Список чипов фильтрации в порядке макета.
 */
export const CHIPS = [
  { id: 'ALL', label: 'ВСЕ' },
  { id: 'ISS', label: 'СТАНЦИИ' },
  { id: 'STARLINK', label: 'STARLINK' },
  { id: 'ONEWEB', label: 'ONEWEB' },
  { id: 'NAVIGATION', label: 'НАВИГАЦИЯ' },
  { id: 'TELESCOPE', label: 'ТЕЛЕСКОПЫ' },
  { id: 'OTHER', label: 'ДРУГОЕ' },
];

/**
 * Набор основных категорий, имеющих собственные чипы фильтра.
 */
export const MAIN_CHIP_CATEGORY_IDS = new Set([
  'ISS',
  'STARLINK',
  'ONEWEB',
  'NAVIGATION',
  'TELESCOPE',
]);

/**
 * Проверяет, удовлетворяет ли спутник выбранному фильтру чипа.
 *
 * Семантика чипа OTHER: матчит всё, что НЕ входит в пять чип-категорий
 * (ISS, STARLINK, ONEWEB, NAVIGATION, TELESCOPE). В категорию «ДРУГОЕ»
 * также входят IRIDIUM, WEATHER и любые нестандартные категории.
 *
 * @param {{ category?: string }|null|undefined} sat - Запись спутника
 * @param {string} filterId - Идентификатор активного чипа фильтра
 * @returns {boolean}
 */
export function matchesFilter(sat, filterId) {
  if (!sat) return false;
  if (!filterId || filterId === 'ALL') return true;

  if (filterId === 'OTHER') {
    return !MAIN_CHIP_CATEGORY_IDS.has(sat.category);
  }

  return sat.category === filterId;
}

export default {
  CATEGORY_META,
  CHIPS,
  MAIN_CHIP_CATEGORY_IDS,
  matchesFilter,
};
