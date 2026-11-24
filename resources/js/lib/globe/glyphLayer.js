import * as THREE from 'three';
import { LOD } from './lod';
import { matchesFilter } from '../categoryMeta';
import { createGlyphAtlasTexture, createGlyphMaterial, getCategoryGlyphIndex } from './glyphAtlas';

/**
 * Слой спутников на THREE.Points с атласом глифов 8 категорий (1 draw call).
 * Обеспечивает:
 * - 1 draw call для всех отображаемых аппаратов;
 * - LOD (FAR > 2.2R, MID 1.4–2.2R, NEAR < 1.4R) в соответствии с lod.js;
 * - Рейкаст-пикинг с порогом 10px;
 * - Инверсную 1-бит подсветку выбранного/hovered спутника;
 * - Интеграцию с SGP4-позициями, лимб-куллингом, фрустум-куллингом и useGlobeDisposer.
 *
 * @param {object} options
 * @param {object} options.globeInstance инстанс Globe() (globe.gl)
 * @param {THREE.Group} [options.targetGroup] сцена/группа глобуса для добавления Points
 * @param {object} [options.disposer] экземпляр useGlobeDisposer
 * @param {number} [options.globeRadius=100] радиус глобуса
 * @param {number} [options.baseGlyphSize=16.0] размер глифа
 * @param {object} [options.viewStore] стор useViewStore (если доступен)
 */
export function createGlyphLayer(options = {}) {
  const globeInstance = options.globeInstance;
  let targetGroup = options.targetGroup || null;
  const disposer = options.disposer || null;
  const globeRadius = options.globeRadius ?? 100.0;
  const baseGlyphSize = options.baseGlyphSize ?? 16.0;
  const viewStore = options.viewStore || null;

  const atlasTexture = createGlyphAtlasTexture();
  const material = createGlyphMaterial(atlasTexture, {
    globeRadius,
    baseSize: baseGlyphSize,
  });

  let capacity = 0;
  let positions = new Float32Array(0);
  let glyphIndices = new Float32Array(0);
  let isSelected = new Float32Array(0);

  const geometry = new THREE.BufferGeometry();
  let posAttr = null;
  let glyphAttr = null;
  let selAttr = null;

  const pointsMesh = new THREE.Points(geometry, material);
  pointsMesh.name = 'satelliteGlyphs';
  pointsMesh.frustumCulled = false; // Отсекаем на CPU, пересчитывать bbox каждый кадр дороже
  pointsMesh.renderOrder = 10;      // Поверх силуэта и бумаги глобуса

  if (targetGroup) {
    targetGroup.add(pointsMesh);
  }

  // Регистрация в disposer
  if (disposer) {
    disposer.registerMesh(pointsMesh)
            .registerGeometry(geometry)
            .registerMaterial(material);
    if (atlasTexture) {
      disposer.registerDisposer(() => {
        atlasTexture.dispose();
      });
    }
  }

  // Скрэтчи для куллинга и пикинга
  const satFrustum = new THREE.Frustum();
  const satClipMatrix = new THREE.Matrix4();
  const satInvGroup = new THREE.Matrix4();
  const satCamLocal = new THREE.Vector3();
  const satFrustumPoint = new THREE.Vector3();
  const scratchRayVec = new THREE.Vector3();
  const scratchClosestVec = new THREE.Vector3();

  const raycaster = new THREE.Raycaster();
  const mouseNdc = new THREE.Vector2();

  let visibleCount = 0;
  let visibleSats = [];

  const limbRadiusSq = (globeRadius * 0.995) * (globeRadius * 0.995);

  function isInsideFrustum(x, y, z, radius = 5.0) {
    satFrustumPoint.set(x, y, z);
    for (let k = 0; k < 6; k++) {
      if (satFrustum.planes[k].distanceToPoint(satFrustumPoint) < -radius) {
        return false;
      }
    }
    return true;
  }

  function isBehindEarthLimb(x, y, z, camLocal) {
    const vx = x - camLocal.x;
    const vy = y - camLocal.y;
    const vz = z - camLocal.z;
    const lenSq = vx * vx + vy * vy + vz * vz;
    if (lenSq < 1e-6) return false;

    const t = -(camLocal.x * vx + camLocal.y * vy + camLocal.z * vz) / lenSq;
    if (t <= 0 || t >= 1) return false;

    const cx = camLocal.x + vx * t;
    const cy = camLocal.y + vy * t;
    const cz = camLocal.z + vz * t;
    return (cx * cx + cy * cy + cz * cz) < limbRadiusSq;
  }

  function ensureCapacity(count) {
    if (count <= capacity && posAttr) return;

    // Выделяем буферы с запасом +20%
    const newCap = Math.max(count + Math.ceil(count * 0.2), 512);

    positions = new Float32Array(newCap * 3);
    glyphIndices = new Float32Array(newCap);
    isSelected = new Float32Array(newCap);

    posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    glyphAttr = new THREE.BufferAttribute(glyphIndices, 1);
    glyphAttr.setUsage(THREE.DynamicDrawUsage);
    selAttr = new THREE.BufferAttribute(isSelected, 1);
    selAttr.setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('glyphIndex', glyphAttr);
    geometry.setAttribute('isSelected', selAttr);

    capacity = newCap;
  }

  function setTargetGroup(group) {
    if (targetGroup === group) return;
    if (targetGroup && pointsMesh.parent === targetGroup) {
      targetGroup.remove(pointsMesh);
    }
    targetGroup = group;
    if (targetGroup) {
      targetGroup.add(pointsMesh);
    }
  }

  /**
   * Обновляет слой спутников на текущем кадре.
   *
   * @param {Array<object>} sats массив аппаратов с актуальными lat/lng/alt
   * @param {object} context параметры кадра (camera, activeFilter, selectedSatId, hoveredSatId)
   * @returns {{ total: number, visible: number, culledFrustum: number, culledLimb: number, lodLevel: string }}
   */
  function update(sats, context = {}) {
    if (!targetGroup || !sats || !sats.length || !globeInstance) {
      visibleCount = 0;
      visibleSats = [];
      geometry.setDrawRange(0, 0);
      pointsMesh.visible = false;
      return { total: sats ? sats.length : 0, visible: 0, culledFrustum: 0, culledLimb: 0, lodLevel: 'FAR' };
    }

    const camera = context.camera || globeInstance.camera();
    const activeFilter = context.activeFilter || 'ALL';
    const selectedSatId = context.selectedSatId ?? null;
    const hoveredSatId = context.hoveredSatId ?? null;

    // Расчёт LOD по высоте камеры (в радиусах Земли)
    const camDist = camera.position.length();
    const altR = (camDist / globeRadius) - 1.0;
    let lodState = 0.0;
    let lodLevel = 'FAR';

    if (altR > LOD.FAR) {
      lodState = 0.0;
      lodLevel = 'FAR';
    } else if (altR >= LOD.MID) {
      lodState = 1.0;
      lodLevel = 'MID';
    } else {
      lodState = 2.0;
      lodLevel = 'NEAR';
    }

    material.uniforms.uLodState.value = lodState;
    if (viewStore) {
      if (typeof viewStore.updateFromCamera === 'function') {
        viewStore.updateFromCamera({ altitude: altR });
      } else if ('lodLevel' in viewStore) {
        viewStore.lodLevel = lodLevel;
      }
    }

    // Подготовка матриц фрустума и камеры в локальном пространстве группы спутников
    targetGroup.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();

    satInvGroup.copy(targetGroup.matrixWorld).invert();
    satCamLocal.copy(camera.position).applyMatrix4(satInvGroup);

    satClipMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    satFrustum.setFromProjectionMatrix(satClipMatrix);
    for (let k = 0; k < 6; k++) {
      satFrustum.planes[k].applyMatrix4(satInvGroup);
    }

    ensureCapacity(sats.length);

    let count = 0;
    let culledFrustum = 0;
    let culledLimb = 0;
    visibleSats = [];

    for (let i = 0; i < sats.length; i++) {
      const sat = sats[i];

      // Фильтрация по категории чипа
      if (activeFilter && activeFilter !== 'ALL' && !matchesFilter(sat, activeFilter)) {
        continue;
      }

      const pos = globeInstance.getCoords(sat.lat, sat.lng, sat.alt);

      // Фрустум-куллинг
      if (!isInsideFrustum(pos.x, pos.y, pos.z, 5.0)) {
        culledFrustum++;
        continue;
      }

      // Лимб-куллинг (обратная сторона Земли)
      if (isBehindEarthLimb(pos.x, pos.y, pos.z, satCamLocal)) {
        culledLimb++;
        continue;
      }

      const o = count * 3;
      positions[o]     = pos.x;
      positions[o + 1] = pos.y;
      positions[o + 2] = pos.z;

      glyphIndices[count] = getCategoryGlyphIndex(sat.category);

      const isSelectedSat = selectedSatId !== null && (
        sat.id === selectedSatId ||
        sat.catalog_number === selectedSatId ||
        sat.catalogNumber === selectedSatId
      );
      const isHoveredSat = hoveredSatId !== null && (
        sat.id === hoveredSatId ||
        sat.catalog_number === hoveredSatId ||
        sat.catalogNumber === hoveredSatId
      );

      isSelected[count] = (isSelectedSat || isHoveredSat) ? 1.0 : 0.0;
      visibleSats[count] = sat;
      count++;
    }

    visibleCount = count;
    geometry.setDrawRange(0, visibleCount);

    if (visibleCount > 0) {
      posAttr.clearUpdateRanges();
      posAttr.addUpdateRange(0, visibleCount * 3);
      posAttr.needsUpdate = true;

      glyphAttr.clearUpdateRanges();
      glyphAttr.addUpdateRange(0, visibleCount);
      glyphAttr.needsUpdate = true;

      selAttr.clearUpdateRanges();
      selAttr.addUpdateRange(0, visibleCount);
      selAttr.needsUpdate = true;
    }

    pointsMesh.visible = visibleCount > 0;

    return {
      total: sats.length,
      visible: visibleCount,
      culledFrustum,
      culledLimb,
      lodLevel,
    };
  }

  /**
   * Пикинг спутника по экранным координатам курсора (10px порог рейкаста).
   *
   * @param {number} clientX
   * @param {number} clientY
   * @param {THREE.Camera} camera
   * @param {HTMLElement} container
   * @returns {{ sat: object, index: number }|null}
   */
  function pick(clientX, clientY, camera, container) {
    if (!pointsMesh || visibleCount === 0 || !container || !camera) {
      return null;
    }

    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    mouseNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    raycaster.setFromCamera(mouseNdc, camera);

    // Динамический порог в мировых координатах, соответствующий 10px на экране (как в харнесе)
    const camDist = camera.position.length();
    const vFovRad = THREE.MathUtils.degToRad(camera.fov || 45);
    const pixelWorld = (2 * Math.tan(vFovRad / 2) * camDist) / rect.height;
    raycaster.params.Points.threshold = pixelWorld * 10.0;

    const hits = raycaster.intersectObject(pointsMesh, false);
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      if (hit.index >= visibleCount) continue;

      // Проверка окклюзии Землёй луча от камеры к точке попадания
      const pt = hit.point;
      const cam = camera.position;
      scratchRayVec.subVectors(pt, cam);
      const dLenSq = scratchRayVec.lengthSq();
      if (dLenSq > 1e-6) {
        const t0 = -cam.dot(scratchRayVec) / dLenSq;
        if (t0 > 0 && t0 < 1) {
          scratchClosestVec.copy(cam).addScaledVector(scratchRayVec, t0);
          if (scratchClosestVec.lengthSq() < limbRadiusSq) {
            continue; // Точка заслонена телом планеты
          }
        }
      }

      if (hit.distanceToRay < bestDist) {
        bestDist = hit.distanceToRay;
        bestIdx = hit.index;
      }
    }

    if (bestIdx !== -1 && bestIdx < visibleSats.length) {
      return { sat: visibleSats[bestIdx], index: bestIdx };
    }

    return null;
  }

  function setHoveredIndex(idx, selectedSatId = null) {
    if (!selAttr || visibleCount === 0) return;
    let changed = false;
    for (let i = 0; i < visibleCount; i++) {
      const sat = visibleSats[i];
      const isSel = selectedSatId !== null && sat && (
        sat.id === selectedSatId ||
        sat.catalog_number === selectedSatId ||
        sat.catalogNumber === selectedSatId
      );
      const targetVal = (i === idx || isSel) ? 1.0 : 0.0;
      if (isSelected[i] !== targetVal) {
        isSelected[i] = targetVal;
        changed = true;
      }
    }
    if (changed) {
      selAttr.clearUpdateRanges();
      selAttr.addUpdateRange(0, visibleCount);
      selAttr.needsUpdate = true;
    }
  }

  function dispose() {
    if (targetGroup && pointsMesh.parent === targetGroup) {
      targetGroup.remove(pointsMesh);
    }
    geometry.dispose();
    material.dispose();
    if (atlasTexture) {
      atlasTexture.dispose();
    }
    visibleSats = [];
    visibleCount = 0;
  }

  return {
    pointsMesh,
    geometry,
    material,
    atlasTexture,
    setTargetGroup,
    update,
    pick,
    setHoveredIndex,
    dispose,
    get visibleSats() {
      return visibleSats;
    },
    get visibleCount() {
      return visibleCount;
    },
  };
}
