import * as THREE from 'three';

/**
 * Атлас глифов категорий спутников (1-бит дизайн).
 * 8 категорий (буквы S O N T I R W ×):
 * - STARLINK   → 'S' (колонка 0)
 * - ONEWEB     → 'O' (колонка 1)
 * - NAVIGATION → 'N' (колонка 2)
 * - TELESCOPE  → 'T' (колонка 3)
 * - ISS        → 'I' (колонка 4)
 * - IRIDIUM    → 'R' (колонка 5)
 * - WEATHER    → 'W' (колонка 6)
 * - OTHER      → '×' (колонка 7)
 *
 * 2 ряда:
 * - Ряд 0: Обычный (бумага #F4F1EA, чернила #0E0E0E)
 * - Ряд 1: Выделенный / hovered (инверсия: чернила #0E0E0E, бумага #F4F1EA)
 */

export const GLYPH_CATEGORIES = [
  { id: 'STARLINK',   letter: 'S' },
  { id: 'ONEWEB',     letter: 'O' },
  { id: 'NAVIGATION', letter: 'N' },
  { id: 'TELESCOPE',  letter: 'T' },
  { id: 'ISS',        letter: 'I' },
  { id: 'IRIDIUM',    letter: 'R' },
  { id: 'WEATHER',    letter: 'W' },
  { id: 'OTHER',      letter: '×' },
];

export const CATEGORY_INDEX_MAP = {
  STARLINK: 0,
  ONEWEB: 1,
  NAVIGATION: 2,
  TELESCOPE: 3,
  ISS: 4,
  IRIDIUM: 5,
  WEATHER: 6,
  OTHER: 7,
};

/**
 * Возвращает индекс колонки глифа в атласе (0..7).
 *
 * @param {string|null|undefined} category
 * @returns {number}
 */
export function getCategoryGlyphIndex(category) {
  if (!category) return 7;
  const idx = CATEGORY_INDEX_MAP[category];
  return idx !== undefined ? idx : 7;
}

/**
 * Процедурная генерация 2D-атласа глифов на Canvas и создание CanvasTexture.
 *
 * @returns {THREE.CanvasTexture|null}
 */
export function createGlyphAtlasTexture() {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  const cellSize = 128;
  const cols = 8;
  const rows = 2; // Ряд 0: нормальный, Ряд 1: инвертированный (hover/selection)
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  const paper = '#F4F1EA';
  const ink = '#0E0E0E';

  for (let c = 0; c < cols; c++) {
    const letter = GLYPH_CATEGORIES[c].letter;
    const x = c * cellSize;
    const pad = 12;
    const boxSize = cellSize - pad * 2;

    // Ряд 0: Обычный глиф (рамка и буква чернилами на бумаге)
    ctx.fillStyle = paper;
    ctx.fillRect(x + pad, pad, boxSize, boxSize);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 8;
    ctx.strokeRect(x + pad, pad, boxSize, boxSize);
    ctx.fillStyle = ink;
    ctx.font = 'bold 64px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x + cellSize / 2, cellSize / 2);

    // Ряд 1: Инвертированный глиф (выделение контрастом: заливка чернилами, рамка и буква бумагой)
    const y1 = cellSize;
    ctx.fillStyle = ink;
    ctx.fillRect(x + pad, y1 + pad, boxSize, boxSize);
    ctx.strokeStyle = paper;
    ctx.lineWidth = 4;
    ctx.strokeRect(x + pad + 2, y1 + pad + 2, boxSize - 4, boxSize - 4);
    ctx.fillStyle = paper;
    ctx.font = 'bold 64px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x + cellSize / 2, y1 + cellSize / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = true;

  return texture;
}

/**
 * Создаёт шейдерный материал для слоя спутников THREE.Points.
 *
 * @param {THREE.Texture} atlasTexture текстура атласа глифов
 * @param {object} [options] параметры шейдера
 * @param {number} [options.globeRadius=100] радиус сферы глобуса
 * @param {number} [options.baseSize=16.0] базовый размер глифа в пикселях
 * @param {number} [options.pixelRatio=1] pixel ratio рендерера
 * @returns {THREE.ShaderMaterial}
 */
export function createGlyphMaterial(atlasTexture, options = {}) {
  const globeRadius = options.globeRadius ?? 100.0;
  const baseSize = options.baseSize ?? 16.0;
  const pixelRatio = options.pixelRatio ?? (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1);

  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlasTexture },
      uBaseSize: { value: baseSize },
      uLodState: { value: 0.0 }, // 0 = FAR, 1 = MID, 2 = NEAR, -1 = OFF
      uLimbCulling: { value: 1.0 },
      uGlobeRadius: { value: globeRadius },
      uPixelRatio: { value: pixelRatio },
      uInkColor: { value: new THREE.Color(0x0E0E0E) },
    },
    vertexShader: `
      attribute float glyphIndex;
      attribute float isSelected;

      uniform float uBaseSize;
      uniform float uLodState;
      uniform float uLimbCulling;
      uniform float uGlobeRadius;
      uniform float uPixelRatio;

      varying float vGlyphIndex;
      varying float vIsSelected;
      varying float vOccluded;

      void main() {
        vGlyphIndex = glyphIndex;
        vIsSelected = isSelected;
        vOccluded = 0.0;

        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vec4 mvPosition = viewMatrix * worldPos;
        gl_Position = projectionMatrix * mvPosition;

        // Лимб-куллинг относительно сферы Земли в начале координат
        if (uLimbCulling > 0.5) {
          vec3 camPos = cameraPosition;
          vec3 pt = worldPos.xyz;
          vec3 ray = pt - camPos;
          float dLenSq = dot(ray, ray);
          float t0 = -dot(camPos, ray) / dLenSq;
          if (t0 > 0.0 && t0 < 1.0) {
            vec3 closest = camPos + t0 * ray;
            float rLimb = uGlobeRadius * 0.995;
            if (dot(closest, closest) < rLimb * rLimb) {
              vOccluded = 1.0;
            }
          }
        }

        // Вычисление размера точки в зависимости от LOD
        float ptSize = uBaseSize;
        if (uLodState == 0.0) {
          ptSize = 4.0; // FAR LOD: квадратная точка
        } else if (uLodState == 1.0) {
          ptSize = uBaseSize * 0.75; // MID LOD: компактный глиф
        } else {
          ptSize = uBaseSize; // NEAR LOD: полный глиф
        }

        if (isSelected > 0.5) {
          ptSize = max(ptSize, 22.0);
        }

        gl_PointSize = ptSize * uPixelRatio;
      }
    `,
    fragmentShader: `
      uniform sampler2D uAtlas;
      uniform float uLodState;
      uniform vec3 uInkColor;

      varying float vGlyphIndex;
      varying float vIsSelected;
      varying float vOccluded;

      void main() {
        if (vOccluded > 0.5) {
          discard;
        }

        // FAR LOD: 1-битная чёткая точка (если не выбран/hovered)
        if (uLodState == 0.0 && vIsSelected < 0.5) {
          vec2 pc = gl_PointCoord;
          if (pc.x < 0.15 || pc.x > 0.85 || pc.y < 0.15 || pc.y > 0.85) {
            discard;
          }
          gl_FragColor = vec4(uInkColor, 1.0);
          return;
        }

        // Выборка из 8-колоночного × 2-строчного атласа
        float col = clamp(floor(vGlyphIndex + 0.5), 0.0, 7.0);
        float row = vIsSelected > 0.5 ? 1.0 : 0.0;

        vec2 uv = vec2((col + gl_PointCoord.x) / 8.0, (row + gl_PointCoord.y) / 2.0);
        vec4 texColor = texture2D(uAtlas, uv);

        if (texColor.a < 0.2) {
          discard;
        }

        gl_FragColor = texColor;
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
}
