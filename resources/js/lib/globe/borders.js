import * as THREE from 'three';
import countriesGeoJson from './data/ne_110m_countries.json';

/**
 * Создаёт WebGL LineSegments границ государств Natural Earth 110m
 * в системе координат глобуса (getCoords).
 *
 * @param {object} globeInstance инстанс Globe() (globe.gl)
 * @returns {{ borderMesh: THREE.LineSegments, borderGeom: THREE.BufferGeometry, borderMat: THREE.LineBasicMaterial } | null}
 */
export function createCountryBorders(globeInstance) {
  if (!globeInstance || typeof globeInstance.getCoords !== 'function') {
    return null;
  }
  if (!countriesGeoJson || !Array.isArray(countriesGeoJson.features)) {
    return null;
  }

  const rawRings = [];
  for (const feature of countriesGeoJson.features) {
    const geometry = feature && feature.geometry;
    if (!geometry) continue;
    if (geometry.type === 'Polygon') {
      if (Array.isArray(geometry.coordinates)) {
        for (const ring of geometry.coordinates) {
          rawRings.push(ring);
        }
      }
    } else if (geometry.type === 'MultiPolygon') {
      if (Array.isArray(geometry.coordinates)) {
        for (const poly of geometry.coordinates) {
          if (Array.isArray(poly)) {
            for (const ring of poly) {
              rawRings.push(ring);
            }
          }
        }
      }
    }
  }

  const borderPositions = [];
  const BORDER_ALT = 0.004;
  for (const ring of rawRings) {
    if (!ring || ring.length < 2) continue;
    for (let i = 0; i < ring.length - 1; i++) {
      const p1 = ring[i];
      const p2 = ring[i + 1];
      // Координаты GeoJSON: [lng, lat]
      const c1 = globeInstance.getCoords(p1[1], p1[0], BORDER_ALT);
      const c2 = globeInstance.getCoords(p2[1], p2[0], BORDER_ALT);
      if (c1 && c2) {
        borderPositions.push(c1.x, c1.y, c1.z, c2.x, c2.y, c2.z);
      }
    }
  }

  if (borderPositions.length === 0) return null;

  const borderGeom = new THREE.BufferGeometry();
  borderGeom.setAttribute('position', new THREE.Float32BufferAttribute(borderPositions, 3));
  borderGeom.computeBoundingSphere();

  // 1-битная графика: hairline-контуры цвета чернил #0E0E0E
  const borderMat = new THREE.LineBasicMaterial({
    color: 0x0E0E0E,
    depthTest: true,
  });

  const borderMesh = new THREE.LineSegments(borderGeom, borderMat);
  borderMesh.name = 'countryBorders';
  borderMesh.renderOrder = 1;
  borderMesh.frustumCulled = false;

  return { borderMesh, borderGeom, borderMat };
}
