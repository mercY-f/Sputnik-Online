import * as THREE from 'three';
import { LOD } from './lod';
import { CATEGORY_META } from '../categoryMeta';

/**
 * 1-битный экранный оверлей сцены глобуса (Стадия D4).
 *
 * Самодостаточный DOM+SVG-слой, который живёт ВНУТРИ контейнера глобуса
 * (globeContainer) и не требует правок разметки страницы:
 *
 * - ретикл «[ ● ]» выбранного спутника;
 * - SVG лидер-линия к плашке: подложка цвета бумаги 3px + пунктир 1px чернил;
 * - HTML-плашка «NAME [БУКВА]» выбранного спутника;
 * - компактные подписи .sat-label-tag для слоя LABELS (лимиты по LOD).
 *
 * Ключевая деталь геометрии: globeInstance.getCoords(lat, lng, alt) отдаёт
 * координаты в ЛОКАЛЬНОЙ системе вращающейся группы глобуса (satMeshGroup).
 * Перед проекцией в экран обязательно применяем targetGroup.matrixWorld —
 * иначе при вращении глобуса плашка и ретикл разъезжаются со спутником.
 *
 * Все элементы скрываются, когда спутник уходит за лимб, за камеру или за
 * дальнюю плоскость проекции.
 *
 * @param {object} options
 * @param {HTMLElement} options.container контейнер глобуса (globeContainer)
 * @param {object} [options.disposer] экземпляр useGlobeDisposer
 * @returns {{
 *   root: HTMLElement,
 *   svg: SVGElement,
 *   update: (state: object) => void,
 *   dispose: () => void
 * } | null}
 */
export function createSceneOverlay(options = {}) {
  const container = options.container;
  const disposer = options.disposer || null;

  if (!container || typeof document === 'undefined') return null;

  const STYLE_ID = 'eol-scene-overlay-styles';

  // Пределы подписей по уровням детализации: FAR — не рисуем вовсе,
  // чтобы не заваливать DOM тысячами узлов.
  const MAX_NEAR_LABELS = 40;
  const MAX_MID_LABELS = LOD.MAX_MID_GLYPHS;
  const LIMB_FACTOR = 0.995;
  const BADGE_GAP = 32;     // вынос плашки вправо от ретикла
  const BADGE_RISE = 28;    // подъём плашки над ретиклом
  const BADGE_STUB = 30;    // горизонтальный «хвост» лидер-линии
  const BADGE_CHAR_W = 6.6; // оценка ширины символа моно-шрифта 11px
  const BADGE_PAD = 12;     // паддинги плашки
  const FALLBACK_LETTER = '×';

  const CSS = `
.eol-scene-overlay {
  position: absolute;
  inset: 0;
  z-index: 15;
  pointer-events: none;
  overflow: hidden;
  contain: layout paint;
}

.eol-scene-overlay-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  shape-rendering: crispEdges;
}

.eol-scene-leader-bg {
  fill: none;
  stroke: var(--paper, #F4F1EA);
  stroke-width: 3px;
  stroke-linecap: square;
  stroke-linejoin: miter;
}

.eol-scene-leader-fg {
  fill: none;
  stroke: var(--ink, #0E0E0E);
  stroke-width: 1px;
  stroke-dasharray: 2,2;
  stroke-linecap: square;
  stroke-linejoin: miter;
}

.eol-scene-overlay .sat-reticle {
  position: absolute;
  transform: translate(-50%, -50%);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--ink, #0E0E0E);
  background: var(--paper, #F4F1EA);
  border: 1px solid var(--ink, #0E0E0E);
  padding: 1px 3px;
  box-sizing: border-box;
  white-space: nowrap;
  pointer-events: none;
}

.eol-scene-overlay .sat-selected-badge {
  position: absolute;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  color: var(--ink, #0E0E0E);
  background: var(--paper, #F4F1EA);
  border: 1px solid var(--ink, #0E0E0E);
  padding: 3px 6px;
  box-sizing: border-box;
  box-shadow: 2px 2px 0 var(--ink, #0E0E0E);
  white-space: nowrap;
  pointer-events: none;
}

.eol-scene-overlay .sat-label-tag {
  position: absolute;
  transform: translateY(-50%);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--ink, #0E0E0E);
  background: var(--paper, #F4F1EA);
  border: 1px solid var(--ink, #0E0E0E);
  padding: 1px 4px;
  box-sizing: border-box;
  white-space: nowrap;
  pointer-events: none;
}

.eol-scene-overlay .sat-labels-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
`;

  // -----------------------------------------------------------------------
  // Стили и корень оверлея
  // -----------------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-eol-scene-overlay', '');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  injectStyles();

  const root = document.createElement('div');
  root.className = 'eol-scene-overlay';
  root.setAttribute('aria-hidden', 'true');

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'eol-scene-overlay-svg');
  svg.setAttribute('aria-hidden', 'true');

  const leaderBg = document.createElementNS(SVG_NS, 'polyline');
  leaderBg.setAttribute('class', 'eol-scene-leader-bg');
  leaderBg.setAttribute('points', '');
  leaderBg.style.display = 'none';

  const leaderFg = document.createElementNS(SVG_NS, 'polyline');
  leaderFg.setAttribute('class', 'eol-scene-leader-fg');
  leaderFg.setAttribute('points', '');
  leaderFg.style.display = 'none';

  svg.appendChild(leaderBg);
  svg.appendChild(leaderFg);

  const reticle = document.createElement('div');
  reticle.className = 'sat-reticle';
  reticle.textContent = '[ ● ]';
  reticle.style.display = 'none';

  const badge = document.createElement('div');
  badge.className = 'sat-selected-badge';
  badge.style.display = 'none';

  const labelsLayer = document.createElement('div');
  labelsLayer.className = 'sat-labels-layer';

  root.appendChild(svg);
  root.appendChild(labelsLayer);
  root.appendChild(reticle);
  root.appendChild(badge);

  // Контейнер глобуса (.globe-container) — position: absolute; inset: 0,
  // поэтому оверлей с inset: 0 ложится ровно на сцену.
  container.appendChild(root);

  // -----------------------------------------------------------------------
  // Размер вьюпорта
  // -----------------------------------------------------------------------
  const viewport = { width: 1, height: 1 };

  function measure() {
    viewport.width = container.clientWidth || 1;
    viewport.height = container.clientHeight || 1;
  }

  measure();

  let resizeObserver = null;
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
  }

  // -----------------------------------------------------------------------
  // Скрэтчи проекции
  // -----------------------------------------------------------------------
  const vWorld = new THREE.Vector3();
  const vDir = new THREE.Vector3();
  const vForward = new THREE.Vector3();
  const vNdc = new THREE.Vector3();
  const vClosest = new THREE.Vector3();

  /**
   * Проекция lat/lng/alt в экранные координаты контейнера.
   * Возвращает null, если точка за лимбом, за камерой или за дальней плоскостью.
   */
  function projectPoint(lat, lng, alt, ctx) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const coords = ctx.getCoords(lat, lng, Number.isFinite(alt) ? alt : 0);
    if (!coords) return null;

    // Локальная система вращающейся группы глобуса → мир
    vWorld.set(coords.x, coords.y, coords.z);
    if (ctx.targetGroup) vWorld.applyMatrix4(ctx.targetGroup.matrixWorld);

    const camPos = ctx.camera.position;

    // Перед камерой?
    vDir.subVectors(vWorld, camPos);
    if (vDir.dot(ctx.forward) <= 0) return null;

    // Лимб: отрезок камера→точка протыкает тело Земли (радиус R * 0.995)
    const lenSq = vDir.lengthSq();
    if (lenSq > 1e-6) {
      const t = -(camPos.x * vDir.x + camPos.y * vDir.y + camPos.z * vDir.z) / lenSq;
      if (t > 0 && t < 1) {
        vClosest.copy(camPos).addScaledVector(vDir, t);
        if (vClosest.lengthSq() < ctx.limbRadiusSq) return null;
      }
    }

    vNdc.copy(vWorld).project(ctx.camera);
    if (vNdc.z > 1) return null;

    return {
      x: (vNdc.x * 0.5 + 0.5) * viewport.width,
      y: (-vNdc.y * 0.5 + 0.5) * viewport.height,
    };
  }

  function letterFor(category) {
    if (!category) return FALLBACK_LETTER;
    const meta = CATEGORY_META[category];
    return (meta && meta.letter) || FALLBACK_LETTER;
  }

  function hideSelection() {
    reticle.style.display = 'none';
    badge.style.display = 'none';
    leaderBg.style.display = 'none';
    leaderFg.style.display = 'none';
  }

  // -----------------------------------------------------------------------
  // Подписи слоя LABELS (пул DOM-узлов)
  // -----------------------------------------------------------------------
  const labelPool = [];

  function ensureLabel(index) {
    while (labelPool.length <= index) {
      const el = document.createElement('span');
      el.className = 'sat-label-tag';
      el.style.display = 'none';
      labelsLayer.appendChild(el);
      labelPool.push(el);
    }
    return labelPool[index];
  }

  function renderLabels(items) {
    for (let i = 0; i < items.length; i++) {
      const el = ensureLabel(i);
      const item = items[i];
      const text = item.name || 'UNKNOWN';
      if (el.textContent !== text) el.textContent = text;
      el.style.left = `${Math.round(item.x) + 10}px`;
      el.style.top = `${Math.round(item.y)}px`;
      el.style.display = '';
    }
    for (let i = items.length; i < labelPool.length; i++) {
      if (labelPool[i].style.display !== 'none') {
        labelPool[i].style.display = 'none';
        labelPool[i].textContent = '';
      }
    }
  }

  // -----------------------------------------------------------------------
  // Кадр
  // -----------------------------------------------------------------------
  /**
   * @param {object} state
   * @param {THREE.Camera} state.camera
   * @param {THREE.Object3D} [state.targetGroup] вращающаяся группа глобуса (satMeshGroup)
   * @param {(lat:number,lng:number,alt:number)=>{x:number,y:number,z:number}} state.getCoords
   * @param {number} [state.globeRadius=100]
   * @param {{name:string,letter?:string,lat:number,lng:number,alt:number}|null} [state.selected]
   * @param {Array<{id:*,name:string,category?:string,lat:number,lng:number,alt:number}>} [state.labels]
   * @param {boolean} [state.labelsEnabled]
   * @param {string} [state.lodLevel] 'FAR' | 'MID' | 'NEAR'
   */
  function update(state = {}) {
    const camera = state.camera;
    if (!camera) {
      hideSelection();
      renderLabels([]);
      return;
    }

    if (!viewport.width || viewport.width < 2) measure();

    if (typeof state.getCoords !== 'function') return;

    const globeRadius = Number.isFinite(state.globeRadius) ? state.globeRadius : 100;

    if (state.targetGroup) state.targetGroup.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();

    const ctx = {
      camera,
      targetGroup: state.targetGroup || null,
      getCoords: state.getCoords,
      forward: camera.getWorldDirection(vForward),
      limbRadiusSq: (globeRadius * LIMB_FACTOR) * (globeRadius * LIMB_FACTOR),
    };

    // --- Выбранный спутник: ретикл + лидер-линия + плашка ---
    const selected = state.selected;
    let selectedPos = selected ? projectPoint(selected.lat, selected.lng, selected.alt, ctx) : null;

    if (selectedPos) {
      const sx = Math.round(selectedPos.x);
      const sy = Math.round(selectedPos.y);

      reticle.style.left = `${sx}px`;
      reticle.style.top = `${sy}px`;
      reticle.style.display = '';

      const label = `${selected.name || 'UNKNOWN'} [${selected.letter || letterFor(selected.category)}]`;
      if (badge.textContent !== label) badge.textContent = label;

      const estWidth = label.length * BADGE_CHAR_W + BADGE_PAD;
      const flip = sx + BADGE_GAP + estWidth > viewport.width - 8;

      const bx = flip ? sx - BADGE_GAP - estWidth : sx + BADGE_GAP;
      const by = sy - BADGE_RISE;
      const attachX = flip ? bx + estWidth : bx;
      const stubX = flip ? attachX - BADGE_STUB : attachX + BADGE_STUB;
      const attachY = by + 10;

      const points = `${sx},${sy} ${Math.round(attachX)},${Math.round(attachY)} ${Math.round(stubX)},${Math.round(attachY)}`;

      leaderBg.setAttribute('points', points);
      leaderFg.setAttribute('points', points);
      leaderBg.style.display = '';
      leaderFg.style.display = '';

      badge.style.left = `${Math.round(bx)}px`;
      badge.style.top = `${Math.round(by)}px`;
      badge.style.display = '';
    } else {
      hideSelection();
    }

    // --- Подписи слоя LABELS ---
    const labels = Array.isArray(state.labels) ? state.labels : [];
    const lodLevel = state.lodLevel || 'FAR';
    const limit = !state.labelsEnabled
      ? 0
      : (lodLevel === 'NEAR' ? MAX_NEAR_LABELS : (lodLevel === 'MID' ? MAX_MID_LABELS : 0));

    if (limit === 0 || labels.length === 0) {
      renderLabels([]);
      return;
    }

    const selectedId = selected && selected.id != null ? String(selected.id) : null;
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;

    const projected = [];
    for (let i = 0; i < labels.length; i++) {
      const item = labels[i];
      if (selectedId !== null && item.id != null && String(item.id) === selectedId) {
        continue; // подпись выбранного уже есть в плашке — не дублируем
      }
      const pos = projectPoint(item.lat, item.lng, item.alt, ctx);
      if (!pos) continue;
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      projected.push({ x: pos.x, y: pos.y, dist: dx * dx + dy * dy, name: item.name });
    }

    projected.sort((a, b) => a.dist - b.dist);
    renderLabels(projected.slice(0, limit));
  }

  function dispose() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (root.parentNode) root.parentNode.removeChild(root);
    const style = document.getElementById(STYLE_ID);
    if (style && style.parentNode) style.parentNode.removeChild(style);
    labelPool.length = 0;
  }

  if (disposer) disposer.registerDisposer(dispose);

  return { root, svg, update, dispose };
}

export default createSceneOverlay;
