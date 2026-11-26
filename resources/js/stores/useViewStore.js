import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { LOD } from '@/lib/globe/lod';

/**
 * Стор зума / уровня детализации (LOD) камеры глобуса.
 * Контракт: PLAN-MIGRATE-1BIT §2.1 (добавлен ретроактивно — в Шаге 1
 * фактически было создано 4 стора из 5 запланированных).
 *
 * State:
 * - cameraAltR — высота камеры в радиусах Земли (globe.gl altitude).
 * Getters:
 * - lodLevel — 'FAR' | 'MID' | 'NEAR' по константам LOD (lod.js).
 * Actions:
 * - updateFromCamera(pov) — синхронизация от сцены (pov.altitude, радиусы Земли).
 *
 * Персиста нет.
 */
export const useViewStore = defineStore('view', () => {
  /** Высота камеры в радиусах Земли. */
  const cameraAltR = ref(LOD.FAR + 0.5);

  /** Уровень детализации по порогам lod.js (FAR > 2.2R, MID 1.4–2.2R, NEAR < 1.4R). */
  const lodLevel = computed(() => {
    if (cameraAltR.value > LOD.FAR) return 'FAR';
    if (cameraAltR.value >= LOD.MID) return 'MID';
    return 'NEAR';
  });

  /**
   * Синхронизация с камерой сцены.
   * @param {{ altitude?: number, alt?: number, cameraAltR?: number }} [pov]
   *        высота камеры в радиусах Земли (принимается в любом из полей)
   */
  function updateFromCamera(pov = {}) {
    const alt = pov.altitude ?? pov.alt ?? pov.cameraAltR;
    if (typeof alt === 'number' && Number.isFinite(alt)) {
      cameraAltR.value = alt;
    }
  }

  return {
    cameraAltR,
    lodLevel,
    updateFromCamera,
  };
});

export default useViewStore;