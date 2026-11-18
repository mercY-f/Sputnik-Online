import * as THREE from 'three';

/**
 * Создаёт инвертированный hull (Inverted Hull) силуэта Земли:
 * сфера радиуса R * 1.008 с отрисовкой только задних граней (BackSide)
 * цвета чернил #0E0E0E. Даёт чёткий 2-3px контур лимба планеты.
 *
 * @param {number} globeRadius радиус сферы Земли (по умолчанию 100)
 * @returns {{ hullMesh: THREE.Mesh, hullGeom: THREE.SphereGeometry, hullMat: THREE.MeshBasicMaterial }}
 */
export function createSilhouetteHull(globeRadius = 100) {
  const hullGeom = new THREE.SphereGeometry(globeRadius * 1.008, 96, 64);
  const hullMat = new THREE.MeshBasicMaterial({
    color: 0x0E0E0E,
    side: THREE.BackSide,
  });
  const hullMesh = new THREE.Mesh(hullGeom, hullMat);
  hullMesh.name = 'silhouetteHull';
  hullMesh.frustumCulled = false;

  return { hullMesh, hullGeom, hullMat };
}
