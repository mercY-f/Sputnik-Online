import * as THREE from 'three';

/**
 * Слой GRID: координатная сетка параллелей и меридианов шагом 30°.
 *
 * 1-битная графика: пунктир цвета чернил 0x0E0E0E, opacity 0.25, высота 0.005
 * над поверхностью шара (как в макете ui-1bit.html: параллели −60…60, меридианы
 * −180…150, шаг 30°). Линии живут в той же вращающейся группе, что и спутники
 * (getCoords), поэтому сетка «приклеена» к земле и не разъезжается с ней.
 *
 * @param {object} globeInstance инстанс Globe() (globe.gl)
 * @param {object} [options]
 * @param {boolean} [options.enabled=true] стартовая видимость слоя (useLayersStore.grid)
 * @returns {{
 *   gridMesh: THREE.LineSegments,
 *   gridGeom: THREE.BufferGeometry,
 *   gridMat: THREE.LineDashedMaterial,
 *   setEnabled: (enabled: boolean) => void,
 *   dispose: () => void
 * } | null}
 */
export function createGridLayer(globeInstance, options = {}) {
  if (!globeInstance || typeof globeInstance.getCoords !== 'function') {
    return null;
  }

  const GRID_ALT = 0.005;      // 0.5 ед. над поверхностью (R = 100) — против z-борьбы с текстурой
  const GRID_STEP_DEG = 30;    // шаг параллелей и меридианов
  const GRID_SUBSTEP_DEG = 2.5; // дробим линии на короткие сегменты — пунктир читается ровно
  const GRID_SAMPLE_DEG = 5;   // шаг сэмплирования вдоль линии

  const positions = [];

  /**
   * Добавляет пару точек (сегмент) в общий буфер.
   */
  function pushSegment(lat1, lng1, lat2, lng2) {
    const p1 = globeInstance.getCoords(lat1, lng1, GRID_ALT);
    const p2 = globeInstance.getCoords(lat2, lng2, GRID_ALT);
    if (p1 && p2) {
      positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }

  // Параллели: −60°…+60° с шагом 30° (полюса не рисуем — там сетка вырождается)
  for (let lat = -60; lat <= 60; lat += GRID_STEP_DEG) {
    for (let lng = -180; lng < 180; lng += GRID_SAMPLE_DEG) {
      pushSegment(lat, lng, lat, lng + GRID_SUBSTEP_DEG);
    }
  }

  // Меридианы: −180°…+150° с шагом 30°, по широте до ±85°
  for (let lng = -180; lng < 180; lng += GRID_STEP_DEG) {
    for (let lat = -85; lat < 85; lat += GRID_SAMPLE_DEG) {
      pushSegment(lat, lng, lat + GRID_SUBSTEP_DEG, lng);
    }
  }

  if (positions.length === 0) return null;

  const gridGeom = new THREE.BufferGeometry();
  gridGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  gridGeom.computeBoundingSphere();

  // LineDashedMaterial требует рассчитанных line distances (см. computeLineDistances ниже).
  const gridMat = new THREE.LineDashedMaterial({
    color: 0x0E0E0E,
    dashSize: 2,
    gapSize: 2,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    depthTest: true,
  });

  const gridMesh = new THREE.LineSegments(gridGeom, gridMat);
  gridMesh.name = 'coordinateGrid';
  gridMesh.renderOrder = 2;      // поверх границ стран, под глифами
  gridMesh.frustumCulled = false; // вся сфера целиком: bbox пересчитывать незачем
  gridMesh.computeLineDistances();

  const setEnabled = (enabled) => {
    gridMesh.visible = !!enabled;
  };
  setEnabled(options.enabled !== false);

  const dispose = () => {
    if (gridMesh.parent) gridMesh.parent.remove(gridMesh);
    gridGeom.dispose();
    gridMat.dispose();
  };

  return { gridMesh, gridGeom, gridMat, setEnabled, dispose };
}

export default createGridLayer;
