import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

/**
 * Хранилище индекса каталога спутников.
 * Хранит нормализованный Map по catalog_number для быстрого доступа O(1)
 * и массив идентификаторов для списков.
 */
export const useCatalogStore = defineStore('catalog', () => {
  /**
   * Карта записей спутников по их catalog_number.
   * @type {import('vue').Ref<Map<string|number, import('../types/contracts').SatelliteRecord>>}
   */
  const byCatNum = ref(new Map());

  /**
   * Массив catalog_number загруженных спутников в исходном порядке.
   * @type {import('vue').Ref<Array<string|number>>}
   */
  const ids = ref([]);

  /**
   * Общее количество спутников в каталоге.
   */
  const count = computed(() => ids.value.length);

  /**
   * Получить запись спутника по номеру в каталоге NORAD.
   *
   * @param {string|number|null|undefined} catNum
   * @returns {import('../types/contracts').SatelliteRecord|undefined}
   */
  function get(catNum) {
    if (catNum === null || catNum === undefined) {
      return undefined;
    }
    const map = byCatNum.value;
    return map.get(catNum) ?? map.get(String(catNum)) ?? map.get(Number(catNum));
  }

  /**
   * Заполняет каталог массивом записей спутников из API.
   *
   * @param {Array<import('../types/contracts').SatelliteRecord>} sats
   */
  function hydrate(sats) {
    const nextMap = new Map();
    const nextIds = [];

    if (Array.isArray(sats)) {
      for (let i = 0; i < sats.length; i++) {
        const sat = sats[i];
        if (sat && sat.catalog_number !== undefined && sat.catalog_number !== null) {
          nextMap.set(sat.catalog_number, sat);
          nextIds.push(sat.catalog_number);
        }
      }
    }

    byCatNum.value = nextMap;
    ids.value = nextIds;
  }

  return {
    byCatNum,
    ids,
    count,
    get,
    hydrate,
  };
});

export default useCatalogStore;
