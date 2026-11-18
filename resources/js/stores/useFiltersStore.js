import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { CHIPS, MAIN_CHIP_CATEGORY_IDS } from '../lib/categoryMeta';

const STORAGE_KEY = 'eol.filter.v1';

/**
 * Читает сохранённый фильтр из localStorage с валидацией по CHIPS.
 *
 * @returns {string}
 */
function getInitialFilter() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'ALL';
  }
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && CHIPS.some((chip) => chip.id === saved)) {
      return saved;
    }
  } catch {}
  return 'ALL';
}

/**
 * Хранилище фильтрации спутников по категориям.
 * Управляет активным чипом фильтра и агрегированными счётчиками категорий.
 */
export const useFiltersStore = defineStore('filters', () => {
  /**
   * Идентификатор активного чипа фильтра (по умолчанию 'ALL' или значение из localStorage).
   * @type {import('vue').Ref<string>}
   */
  const activeFilter = ref(getInitialFilter());

  /**
   * Счётчики спутников по категориям из БД / Inertia / API.
   * @type {import('vue').Ref<Record<string, number>>}
   */
  const categoryCounts = ref({});

  /**
   * Список чипов с подмешанными актуальными счётчиками.
   * Счётчик для 'OTHER' агрегирует все категории, не входящие в 5 основных чипов.
   */
  const chipList = computed(() => {
    const counts = categoryCounts.value || {};

    let otherCount = 0;
    for (const [cat, count] of Object.entries(counts)) {
      if (cat !== 'ALL' && !MAIN_CHIP_CATEGORY_IDS.has(cat)) {
        otherCount += Number(count) || 0;
      }
    }

    return CHIPS.map((chip) => {
      let count = 0;
      if (chip.id === 'ALL') {
        count = Number(counts['ALL']) || 0;
      } else if (chip.id === 'OTHER') {
        count = otherCount;
      } else {
        count = Number(counts[chip.id]) || 0;
      }

      return {
        ...chip,
        count,
      };
    });
  });

  /**
   * Устанавливает активный чип фильтра с валидацией по списку CHIPS
   * и персистом в localStorage['eol.filter.v1'].
   *
   * @param {string} id
   */
  function setFilter(id) {
    if (!CHIPS.some((chip) => chip.id === id)) {
      return;
    }
    activeFilter.value = id;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY, id);
      } catch {}
    }
  }

  /**
   * Заполняет счётчики категорий из внешних данных (Inertia props или API).
   *
   * @param {Record<string, number>} counts
   */
  function hydrate(counts) {
    if (counts && typeof counts === 'object') {
      categoryCounts.value = { ...counts };
    }
  }

  return {
    activeFilter,
    categoryCounts,
    chipList,
    setFilter,
    hydrate,
  };
});

export default useFiltersStore;
