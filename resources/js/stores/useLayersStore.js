import { defineStore } from 'pinia';
import { ref } from 'vue';

const STORAGE_KEY = 'eol.layers.v1';

const DEFAULT_LAYERS = {
  grid: true,
  orbits: true,
  atmosphere: true,
  labels: false,
  terminator: true,
};

/**
 * Читает сохранённое состояние слоёв из localStorage.
 *
 * @returns {typeof DEFAULT_LAYERS}
 */
function getInitialLayers() {
  const layers = { ...DEFAULT_LAYERS };
  if (typeof window === 'undefined' || !window.localStorage) {
    return layers;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const key of Object.keys(DEFAULT_LAYERS)) {
          if (typeof parsed[key] === 'boolean') {
            layers[key] = parsed[key];
          }
        }
      }
    }
  } catch {}
  return layers;
}

/**
 * Хранилище видимости слоёв 3D-сцены глобуса.
 * Синхронизируется целиком с localStorage['eol.layers.v1'].
 */
export const useLayersStore = defineStore('layers', () => {
  const initial = getInitialLayers();

  /** @type {import('vue').Ref<boolean>} Сетка координат на поверхности */
  const grid = ref(initial.grid);

  /** @type {import('vue').Ref<boolean>} Орбитальные траектории */
  const orbits = ref(initial.orbits);

  /** @type {import('vue').Ref<boolean>} Слой атмосферного свечения / силуэт */
  const atmosphere = ref(initial.atmosphere);

  /** @type {import('vue').Ref<boolean>} Текстовые метки спутников */
  const labels = ref(initial.labels);

  /** @type {import('vue').Ref<boolean>} Линия терминатора день/ночь */
  const terminator = ref(initial.terminator);

  /**
   * Сохраняет текущее состояние всех слоёв в localStorage.
   */
  function persist() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const payload = {
          grid: grid.value,
          orbits: orbits.value,
          atmosphere: atmosphere.value,
          labels: labels.value,
          terminator: terminator.value,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {}
    }
  }

  /**
   * Переключает видимость указанного слоя (только известные ключи).
   *
   * @param {'grid'|'orbits'|'atmosphere'|'labels'|'terminator'} layer
   */
  function toggle(layer) {
    if (layer === 'grid') {
      grid.value = !grid.value;
    } else if (layer === 'orbits') {
      orbits.value = !orbits.value;
    } else if (layer === 'atmosphere') {
      atmosphere.value = !atmosphere.value;
    } else if (layer === 'labels') {
      labels.value = !labels.value;
    } else if (layer === 'terminator') {
      terminator.value = !terminator.value;
    } else {
      return;
    }

    persist();
  }

  return {
    grid,
    orbits,
    atmosphere,
    labels,
    terminator,
    toggle,
  };
});

export default useLayersStore;
