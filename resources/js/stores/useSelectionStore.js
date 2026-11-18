import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useCatalogStore } from './useCatalogStore';

/**
 * Хранилище состояния выбора и фокуса спутника.
 * Является единым источником правды для UI-карточки, 3D-ретикла и режима слежения.
 */
export const useSelectionStore = defineStore('selection', () => {
  /**
   * Идентификатор (catalog_number) текущего выбранного спутника или null.
   * @type {import('vue').Ref<string|number|null>}
   */
  const selectedId = ref(null);

  /**
   * Идентификатор (catalog_number) спутника под курсором или null.
   * @type {import('vue').Ref<string|number|null>}
   */
  const hoveredId = ref(null);

  /**
   * Координаты цели фокуса камеры {lat, lng, alt} или null.
   * @type {import('vue').Ref<{lat: number, lng: number, alt: number}|null>}
   */
  const focusTarget = ref(null);

  /**
   * Флаг режима непрерывного слежения камеры за спутником.
   * @type {import('vue').Ref<boolean>}
   */
  const followMode = ref(false);

  /**
   * Активный выбранный объект спутника из каталога (без дублирования данных).
   */
  const selectedSat = computed(() => {
    if (selectedId.value === null || selectedId.value === undefined) {
      return null;
    }
    const catalogStore = useCatalogStore();
    return catalogStore.get(selectedId.value) ?? null;
  });

  /**
   * Проверяет, совпадает ли указанный идентификатор с выбранным спутником.
   *
   * @param {string|number|null|undefined} id
   * @returns {boolean}
   */
  function isSelected(id) {
    if (selectedId.value === null || id === null || id === undefined) {
      return false;
    }
    return selectedId.value === id || String(selectedId.value) === String(id);
  }

  /**
   * Выбирает спутник по его записи (принимает sat, сохраняет sat.catalog_number).
   * Если передан null/undefined — сбрасывает выбор.
   *
   * @param {import('../types/contracts').SatelliteRecord|{catalog_number: string|number}|string|number|null|undefined} sat
   */
  function select(sat) {
    if (!sat) {
      clear();
      return;
    }
    if (typeof sat === 'object' && 'catalog_number' in sat) {
      selectedId.value = sat.catalog_number;
    } else {
      selectedId.value = sat;
    }
  }

  /**
   * Сбрасывает выбор и параметры фокуса.
   */
  function clear() {
    selectedId.value = null;
    focusTarget.value = null;
    followMode.value = false;
  }

  /**
   * Устанавливает id спутника под курсором (наведение мыши).
   *
   * @param {string|number|null} id
   */
  function hover(id) {
    hoveredId.value = id ?? null;
  }

  /**
   * Устанавливает статус режима слежения камеры.
   *
   * @param {boolean} bool
   */
  function setFollow(bool) {
    followMode.value = Boolean(bool);
  }

  return {
    selectedId,
    hoveredId,
    focusTarget,
    followMode,
    selectedSat,
    isSelected,
    select,
    clear,
    hover,
    setFollow,
  };
});

export default useSelectionStore;
