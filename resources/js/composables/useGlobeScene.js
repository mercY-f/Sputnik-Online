import { ref, onMounted, onBeforeUnmount } from 'vue';
import axios from 'axios';
import Globe from 'globe.gl';
import * as satellite from 'satellite.js';
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { sgp4WorkerClient } from '@/lib/sgp4WorkerClient';
import { createPostProcessing } from '@/lib/postProcessing';
import { useGlobeDisposer } from '@/lib/globe/useGlobeDisposer';

export function useGlobeScene(options = {}) {
  const globeContainer = options.globeContainer ?? ref(null);
  const loading = options.loading ?? ref(true);
  const activeFilter = options.activeFilter ?? ref('ALL');
  const satPositions = options.satPositions ?? ref([]);
  const focusTarget = options.focusTarget ?? ref(null);
  const selectedSatellite = options.selectedSatellite ?? ref(null);

  // -----------------------------------------------------------------------
  // Константы
  // -----------------------------------------------------------------------
  const CATEGORY_COLORS = {
    ISS:        '#ef4444',
    STARLINK:   '#3b82f6',
    ONEWEB:     '#8b5cf6',
    IRIDIUM:    '#f59e0b',
    NAVIGATION: '#eab308',
    WEATHER:    '#06b6d4',
    TELESCOPE:  '#ec4899',
    OTHER:      '#10b981',
  };


  function getCategoryColor(cat) {
    return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.OTHER;
  }

  const utcTime        = ref('');
  const webglSupported = ref(true);
  const prefersReducedMotion = ref(false);

  function checkWebGLSupport() {
    try {
      const canvas = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl') || canvas.getContext('webgl2'))
      );
    } catch {
      return false;
    }
  }

  function checkReducedMotion() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }

  // Внутренние переменные
  let allSatellites    = [];
  let activeSats       = [];
  let globeInstance    = null;
  let refreshInterval  = null;
  let rafId            = null;
  let prevPositions    = [];
  let currPositions    = [];
  let lastRefreshTime  = 0;
  let clockInterval    = null;
  let resizeObserver   = null;
  let postProcessing   = null; // Спринт 4: UnrealBloom + FXAA + ACES (EffectComposer)

  // -----------------------------------------------------------------------
  // Спринт 4: единый dispose-контракт (lib/globe/useGlobeDisposer)
  // -----------------------------------------------------------------------
  // Все GPU-ресурсы (геометрии, материалы, текстуры, render target'ы composer'а),
  // SGP4-воркер, слушатели, rAF и таймеры регистрируются здесь по мере создания,
  // а освобождаются одним вызовом disposeAll() в onBeforeUnmount. Без этого при
  // переходе на другой Inertia-роут WebGL-контекст и буферы остаются живыми:
  // лимит контекстов на страницу (8..16) исчерпывается за несколько переходов.
  //
  // auto: false — очистку запускаем сами, чтобы сначала остановить циклы глобуса
  // и камеры, а затем отдать управление детерминированному порядку disposeAll.
  // Цели (scene/renderer/controls) резолвятся лениво: к моменту размонтирования
  // инстанс globe.gl может быть уже пересоздан (HMR) или не создан вовсе.
  const disposer = useGlobeDisposer(
    () => ({
      scene:    globeInstance ? globeInstance.scene()    : null,
      renderer: globeInstance ? globeInstance.renderer() : null,
      controls: globeInstance ? globeInstance.controls() : null,
    }),
    { auto: false },
  );


  // -----------------------------------------------------------------------
  // InstancedMesh-слой спутников
  // -----------------------------------------------------------------------
  // three-globe строит Points как «пины» (CylinderGeometry) на поверхности и
  // масштабирует их по scale.z = pointAltitude * GLOBE_RADIUS. Т.е. pointAltitude —
  // высота пина, а НЕ радиальная высота. Поэтому спутники рисуем своим
  // THREE.InstancedMesh и позиционируем через globeInstance.getCoords(lat, lng, alt),
  // где alt — доля радиуса (km / 6371): r = 100 * (1 + alt).
  const SAT_SPHERE_RADIUS = 0.45; // мировые единицы (радиус глобуса = 100)
  const SAT_ISS_SCALE     = 1.35;
  const SAT_HOVER_SCALE   = 1.9;  // подсветка наведения: во сколько раз крупнее инстанс

  // --- LOD/отсечение (Спринт 4) -------------------------------------------
  // Слой спутников = два представления в одной вращающейся группе:
  //   • satMesh   — InstancedMesh полноценных сфер (близкие/крупные на экране);
  //   • satPoints — THREE.Points из одного вершинного фрагмента на аппарат
  //                 (далёкие/мелкие: ~2 px вместо 192 треугольников сферы).
  // Оба массива lastMeshSats/lastPointSats — «то, что реально отрисовано»,
  // поэтому instanceId = индекс в lastMeshSats, а пикинг физически не видит
  // отсечённые аппараты (они не попадают ни в один из слоёв).
  const SAT_LOD_MIN_PX    = 1.2;   // экранный радиус сферы (css px), ниже — Points
  const SAT_CULL_RADIUS   = SAT_SPHERE_RADIUS * SAT_HOVER_SCALE + 2.0; // запас пирамиды: подсветка + лаг матрицы группы
  const SAT_POINT_SIZE    = 2.6;   // размер точки в мировых единицах (sizeAttenuation)

  let satMesh          = null;
  let satMeshGroup     = null;  // вращающаяся группа three-globe (родитель земного шара)
  let satMeshCapacity  = -1;
  let satColorCache    = [];
  let satColorScratch  = null;
  let lastMeshSats     = [];    // сферы этого кадра: index === instanceId
  let lastPointSats    = [];    // Points-слой этого кадра: index === индекс в буфере
  // Переиспользуемые списки кадра (без аллокации 2×N ссылок на весь каталог каждый кадр)
  const satNearList    = [];
  const satPointList   = [];
  let hoveredSatId     = null;  // id аппарата под курсором (для подсветки инстанса)
  const satDummy       = new THREE.Object3D();

  // Points-слой (далёкие спутники)
  let satPoints         = null;
  let satPointsCapacity = -1;
  let satPointTexture   = null;
  const satPointPositions = { array: null };
  const satPointColors    = { array: null };

  // Счётчики кадра под debug-HUD (?debug=1)
  const satStats = { total: 0, near: 0, points: 0, culledFrustum: 0, culledLimb: 0 };

  // Скрэтчи отсечения: пирамида камеры и камера в локальных координатах группы
  const satFrustum    = new THREE.Frustum();
  const satClipMatrix = new THREE.Matrix4();
  const satInvGroup   = new THREE.Matrix4();
  const satCamLocal   = new THREE.Vector3();


  // Ищем группу, в которой живут маркеры three-globe: объект с __globeObjType === 'globe'
  // (это группа земного шара), берём его .parent. Именно эта система координат
  // совпадает с getCoords(); scene() — мировая сцена, там спутники не вращались бы с глобусом.
  function resolveSatMeshGroup() {
    if (!globeInstance) return null;
    let globeObj = null;
    globeInstance.scene().traverse(o => {
      if (!globeObj && o.__globeObjType === 'globe') globeObj = o;
    });
    return globeObj ? globeObj.parent : null;
  }

  // Спрайт точки: кружок с мягким краем (canvas → CanvasTexture, 32×32).
  // Создаётся вместе с Points-слоем и dispose'ится вместе с ним — новых зависимостей нет.
  function createSatPointTexture() {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const r = size / 2;
      const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    disposer.registerTexture(texture); // dispose-контракт: освобождается disposeAll()
    return texture;
  }

  function disposeSatPointCloud() {
    if (satPoints) {
      if (satPoints.parent) satPoints.parent.remove(satPoints);
      if (satPoints.geometry) satPoints.geometry.dispose();
      if (satPoints.material) {
        if (satPoints.material.map) satPoints.material.map.dispose();
        satPoints.material.dispose();
      }
      satPoints = null;
    }
    satPointsCapacity = -1;
    satPointTexture = null;
    satPointPositions.array = null;
    satPointColors.array = null;
    lastPointSats = [];
  }

  function disposeSatelliteMesh() {
    disposeSatPointCloud();
    if (!satMesh) { satMeshCapacity = -1; satColorCache = []; lastMeshSats = []; return; }
    if (satMesh.parent) satMesh.parent.remove(satMesh);
    if (typeof satMesh.dispose === 'function') satMesh.dispose(); // instance-буферы
    if (satMesh.geometry) satMesh.geometry.dispose();
    if (satMesh.material) satMesh.material.dispose();
    satMesh = null;
    satMeshCapacity = -1;
    satColorCache = [];
    lastMeshSats = [];
  }

  // Points-слой для далёких аппаратов: одна вершина на спутник, размер экрана
  // задаёт sizeAttenuation — стоить кадр это почти ничего.
  function ensureSatPointCloud(count) {
    if (satPoints && count === satPointsCapacity) return satPoints;

    disposeSatPointCloud();
    if (count <= 0) { satPointsCapacity = 0; return null; }

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const colAttr = new THREE.BufferAttribute(colors, 3);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('color', colAttr);
    geometry.setDrawRange(0, 0);

    satPointTexture = satPointTexture || createSatPointTexture();
    const material = new THREE.PointsMaterial({
      size: SAT_POINT_SIZE,
      sizeAttenuation: true,
      vertexColors: true,
      map: satPointTexture,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.05,
      toneMapped: false,
    });

    satPoints = new THREE.Points(geometry, material);
    satPoints.frustumCulled = false; // отсекаем сами, bbox пересчитывать каждый кадр дороже
    satPoints.renderOrder = -1;      // точки — до сфер, чтобы подсветка была сверху
    satMeshGroup.add(satPoints);

    // dispose-контракт: Points-слой может не пережить фильтр категорий
    disposer.registerMesh(satPoints)
            .registerGeometry(geometry)
            .registerMaterial(material);

    satPointsCapacity = count;
    satPointPositions.array = positions;
    satPointColors.array = colors;

    return satPoints;
  }

  // Пересоздаём меш только при изменении числа спутников (фильтры категорий).
  function ensureSatelliteMesh(count) {
    if (satMesh && count === satMeshCapacity) return satMesh;

    disposeSatelliteMesh();

    if (count <= 0) { satMeshCapacity = 0; return null; }

    if (!satMeshGroup) satMeshGroup = resolveSatMeshGroup();
    if (!satMeshGroup) return null; // глобус ещё не готов — повторим на следующем кадре

    const geometry = new THREE.SphereGeometry(SAT_SPHERE_RADIUS, 12, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

    satMesh = new THREE.InstancedMesh(geometry, material, count);
    satMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    satMesh.frustumCulled = false; // матрицы меняются каждый кадр, bbox не пересчитываем
    // Ручная ограничивающая сфера: instancы компактно переписываются каждый кадр,
    // авторасчёт по this.count кэшировался бы по первому (случайному) набору и
    // мог бы отсечь валидный луч в пикинге. Радиус с запасом перекрывает орбиты.
    satMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), GLOBE_RADIUS * 2.5);
    satMeshGroup.add(satMesh);

    // dispose-контракт: InstancedMesh пересоздаётся при смене фильтра, а на
    // размонтировании освобождается вместе со всей сценой (geometry/material).
    disposer.registerMesh(satMesh)
            .registerGeometry(geometry)
            .registerMaterial(material);

    satMeshCapacity = count;
    satColorCache = new Array(count).fill(null);
    satColorScratch = satColorScratch || new THREE.Color();

    ensureSatPointCloud(count);

    return satMesh;
  }

  // Пирамида видимости в локальных координатах группы спутников (6 плоскостей
  // на кадр). Возвращает false, если точка гарантированно вне экрана.
  function isInsideSatFrustum(x, y, z, radius) {
    const planes = satFrustum.planes;
    for (let k = 0; k < 6; k++) {
      const pl = planes[k];
      if (pl.normal.x * x + pl.normal.y * y + pl.normal.z * z + pl.constant < -radius) return false;
    }
    return true;
  }

  // Аппарат за лимбом Земли? Консервативный тест отрезка «камера → спутник» со
  // сферой Земли в локальных координатах группы: без Raycaster на весь каталог сфер.
  function isBehindEarthLimb(x, y, z, cam) {
    const vx = x - cam.x, vy = y - cam.y, vz = z - cam.z;
    const vv = vx * vx + vy * vy + vz * vz;
    if (vv < 1e-9) return false;

    // параметр ближайшей к центру Земли точки отрезка
    const t = -(cam.x * vx + cam.y * vy + cam.z * vz) / vv;
    if (t <= 0 || t >= 1) return false; // Земля ближе камеры или дальше аппарата

    const cx = cam.x + vx * t, cy = cam.y + vy * t, cz = cam.z + vz * t;
    return cx * cx + cy * cy + cz * cz < SAT_EARTH_LIMB_R2;
  }

  function updateSatelliteMesh(sats) {
    const mesh = ensureSatelliteMesh(sats.length);
    satStats.total = sats.length;

    if (!mesh) {
      lastMeshSats = [];
      lastPointSats = [];
      satStats.near = 0;
      satStats.points = 0;
      satStats.culledFrustum = 0;
      satStats.culledLimb = 0;
      return;
    }

    const camera = globeInstance.camera();
    const el = globeContainer.value;
    const viewH = (el && el.clientHeight) || 1;

    // Спутники живут во вращающейся группе глобуса: и пирамиду, и камеру
    // переводим в её локальные координаты — тест не зависит от поворота.
    satMesh.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();

    satInvGroup.copy(satMesh.matrixWorld).invert();
    satCamLocal.copy(camera.position).applyMatrix4(satInvGroup);

    satClipMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    satFrustum.setFromProjectionMatrix(satClipMatrix);
    for (let k = 0; k < 6; k++) {
      satFrustum.planes[k].applyMatrix4(satInvGroup); // нормализует нормаль + constant
    }

    // Экранный радиус сферы: r_px = SAT_SPHERE_RADIUS * (H/2)/tan(fov/2) / dist
    const pxFactor = camera.isPerspectiveCamera
      ? (viewH * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)
      : viewH * 0.5;

    const nearSats = satNearList;
    const pointSats = satPointList;
    nearSats.length = 0;
    pointSats.length = 0;
    const pointPositions = satPointPositions.array;
    const pointColors = satPointColors.array;

    satColorScratch = satColorScratch || new THREE.Color();
    let colorsDirty = false;
    let nearCount = 0;
    let pointCount = 0;
    let culledFrustum = 0;
    let culledLimb = 0;
    let hoveredSeen = false;

    for (let i = 0; i < sats.length; i++) {
      const sat = sats[i];

      // Истинная радиальная высота: alt — доля радиуса Земли (gd.height / 6371)
      const pos = globeInstance.getCoords(sat.lat, sat.lng, sat.alt);

      // 1) вне пирамиды камеры — не пишем ни матрицу, ни точку
      if (!isInsideSatFrustum(pos.x, pos.y, pos.z, SAT_CULL_RADIUS)) { culledFrustum++; continue; }
      // 2) за лимбом Земли — планету перекрывает сама Земля
      if (isBehindEarthLimb(pos.x, pos.y, pos.z, satCamLocal)) { culledLimb++; continue; }

      const hovered = hoveredSatId !== null && sat.id === hoveredSatId;
      if (hovered) hoveredSeen = true;

      const hex = getCategoryColor(sat.category);
      const dx = pos.x - satCamLocal.x;
      const dy = pos.y - satCamLocal.y;
      const dz = pos.z - satCamLocal.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const radiusPx = dist > 1e-6 ? (SAT_SPHERE_RADIUS * pxFactor) / dist : Infinity;

      if (hovered || !pointPositions || radiusPx >= SAT_LOD_MIN_PX) {
        // LOD 0: полноценная сфера; instanceId = индекс в lastMeshSats
        satDummy.position.set(pos.x, pos.y, pos.z);
        const baseScale = sat.category === 'ISS' ? SAT_ISS_SCALE : 1;
        satDummy.scale.setScalar(hovered ? baseScale * SAT_HOVER_SCALE : baseScale);
        satDummy.updateMatrix();
        mesh.setMatrixAt(nearCount, satDummy.matrix);

        if (satColorCache[nearCount] !== hex) {
          satColorScratch.set(hex);
          mesh.setColorAt(nearCount, satColorScratch);
          satColorCache[nearCount] = hex;
          colorsDirty = true;
        }
        nearSats.push(sat);
        nearCount++;
      } else {
        // LOD 1: точка ~2 px — дешевле сферы в сотни раз
        const o = pointCount * 3;
        pointPositions[o]     = pos.x;
        pointPositions[o + 1] = pos.y;
        pointPositions[o + 2] = pos.z;
        satColorScratch.set(hex);
        pointColors[o]     = satColorScratch.r;
        pointColors[o + 1] = satColorScratch.g;
        pointColors[o + 2] = satColorScratch.b;
        pointSats.push(sat);
        pointCount++;
      }
    }

    // instanceId ↔ lastMeshSats: сферы компактно с 0, отсечённых в массиве нет
    lastMeshSats = nearSats;
    lastPointSats = pointSats;

    mesh.count = nearCount;
    // Грузим в GPU только записанный префикс буфера (instancы компактно с 0),
    // а не все capacity×16 float каждый кадр.
    const matAttr = mesh.instanceMatrix;
    matAttr.clearUpdateRanges();
    if (nearCount > 0) matAttr.addUpdateRange(0, nearCount * 16);
    matAttr.needsUpdate = true;
    if (colorsDirty && mesh.instanceColor) {
      const colAttr = mesh.instanceColor;
      colAttr.clearUpdateRanges();
      colAttr.addUpdateRange(0, nearCount * 3);
      colAttr.needsUpdate = true;
    }

    if (satPoints) {
      satPoints.visible = pointCount > 0;
      satPoints.geometry.setDrawRange(0, pointCount);
      if (pointCount > 0) {
        for (const name of ['position', 'color']) {
          const attr = satPoints.geometry.getAttribute(name);
          if (!attr) continue;
          attr.clearUpdateRanges();
          attr.addUpdateRange(0, pointCount * 3);
          attr.needsUpdate = true;
        }
      }
    }

    // Подсветка живёт по id, а не по индексу: состав слоя меняется каждый кадр.
    // Если аппарат ушёл за лимб/за экран — снимаем подпись, пока курсор не двинется.
    if (hoveredSatId !== null && !hoveredSeen) {
      hoveredSatId = null;
      hoverSat.value = null;
    }

    satStats.near = nearCount;
    satStats.points = pointCount;
    satStats.culledFrustum = culledFrustum;
    satStats.culledLimb = culledLimb;
  }


  // -----------------------------------------------------------------------
  // Пикинг спутников (Спринт 4): Raycaster по InstancedMesh → instanceId → id
  // -----------------------------------------------------------------------
  // Сцену рендерит EffectComposer (см. lib/postProcessing.js), но камера у пассов
  // та же, что отдаёт globeInstance.camera(), поэтому Raycaster.setFromCamera()
  // строит корректный луч без знания о цепочке пассов.
  //
  // Спутники на экране крошечные (сфера R = 0.45 при дистанции камеры 100–600 ед.
  // — это единицы пикселей), точное попадание лучом в них практически недостижимо.
  // Поэтому два уровня:
  //   1) точный raycast по satMesh — берём первый видимый instanceId;
  //   2) порог: ближайшая к курсору проекция центра в радиусе PICK_RADIUS_PX
  //      по обоим LOD-слоям (сферы и точки).
  // Отсечение за лимбом/фрустумом уже сделано в updateSatelliteMesh: отсечённые
  // аппараты физически отсутствуют в lastMeshSats/lastPointSats, поэтому зацепить
  // их по ошибке нельзя.
  const PICK_RADIUS_PX    = 16;   // порог захвата вокруг проекции центра
  const CLICK_MAX_MOVE_PX = 6;    // сдвиг больше — это вращение камеры, а не клик
  const CLICK_MAX_MS      = 500;  // долгий жест — тоже не клик
  const CLICK_DEBOUNCE_MS = 350;  // защита от двойного срабатывания

  const hoverSat = ref(null); // HUD-подпись под курсором: { name, x, y, flip }

  const pickRaycaster  = new THREE.Raycaster();
  const pickNdc        = new THREE.Vector2();
  const pickMatrix     = new THREE.Matrix4();
  const pickVec        = new THREE.Vector3();
  const pickHitPoint   = new THREE.Vector3();
  const pickRay        = new THREE.Ray();
  let   pickGlobeSphere = null;

  let pickPointer     = null;  // последняя позиция курсора (client-координаты)
  let pickHoverRaf    = 0;     // троттлинг наведения до одного пика за кадр
  let pickGesture     = null;  // pointerdown: база для отличения клика от драга
  let pickLastClickAt = 0;
  const pickBindings  = { bound: false };

  // Сфера Земли для теста перекрытия: чуть меньше радиуса глобуса, чтобы
  // аппарат на нулевой высоте не считался «за планетой» из-за погрешности матриц.
  function ensureGlobePickSphere() {
    if (!pickGlobeSphere) {
      pickGlobeSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), GLOBE_RADIUS * 0.995);
    }
    return pickGlobeSphere;
  }

  // Точка скрыта глобусом? Сравниваем дистанцию входа луча в сферу Земли с
  // дистанцией до аппарата: если Земля ближе — аппарат на обратной стороне.
  function isBehindGlobe(cameraPos, point, distance) {
    pickRay.origin.copy(cameraPos);
    pickRay.direction.copy(point).sub(cameraPos);
    const len = pickRay.direction.length();
    if (len < 1e-6) return false;
    pickRay.direction.divideScalar(len);

    const enter = pickRay.intersectSphere(ensureGlobePickSphere(), pickHitPoint);
    return !!enter && enter.distanceTo(cameraPos) < distance - 1;
  }

  /**
   * Пикинг спутника по экранной точке.
   * Ищем только в том, что реально отрисовано: сферы (lastMeshSats, index =
   * instanceId) и точки дальнего слоя (lastPointSats). Отсечённые фрустумом/лимбом
   * аппараты в этих массивах отсутствуют — их нельзя зацепить по ошибке.
   * @returns {{sat: object}|null}
   */
  function pickSatelliteAt(clientX, clientY) {
    if (!globeInstance || !satMesh) return null;
    if (!lastMeshSats.length && !lastPointSats.length) return null;

    const el = globeContainer.value;
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    pickNdc.set(
      ((clientX - rect.left) / rect.width)  * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );

    const camera = globeInstance.camera();
    camera.updateMatrixWorld();              // + matrixWorldInverse для project()
    satMesh.updateWorldMatrix(true, false);  // satMeshGroup вращается вместе с глобусом

    const camPos = camera.position;

    // 1) точное попадание лучом в сферу инстанса (ближний LOD-слой)
    pickRaycaster.setFromCamera(pickNdc, camera);
    const hits = pickRaycaster.intersectObject(satMesh, false);
    for (const hit of hits) {
      if (hit.instanceId == null || hit.instanceId >= lastMeshSats.length) continue;
      if (isBehindGlobe(camPos, hit.point, hit.distance)) continue;
      const sat = lastMeshSats[hit.instanceId];
      if (sat) return { sat };
    }

    // 2) порог: ближайшая к курсору проекция центра в пределах PICK_RADIUS_PX.
    // Оба слоя уже отсечены фрустумом и лимбом в updateSatelliteMesh, поэтому
    // здесь только проекция — без Raycaster и без повторного теста Земли.
    let bestSat = null;
    let bestDistPx = PICK_RADIUS_PX;
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    for (let i = 0; i < lastMeshSats.length; i++) {
      satMesh.getMatrixAt(i, pickMatrix);
      pickVec.setFromMatrixPosition(pickMatrix).applyMatrix4(satMesh.matrixWorld);
      pickVec.project(camera);
      if (pickVec.z > 1 || pickVec.z < -1) continue; // вне near/far
      const sx = (pickVec.x * 0.5 + 0.5) * rect.width;
      const sy = (-pickVec.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - px, sy - py);
      if (d < bestDistPx) { bestDistPx = d; bestSat = lastMeshSats[i]; }
    }

    if (satPoints && lastPointSats.length) {
      const attr = satPoints.geometry.getAttribute('position');
      for (let i = 0; i < lastPointSats.length; i++) {
        pickVec.fromBufferAttribute(attr, i).applyMatrix4(satMesh.matrixWorld);
        pickVec.project(camera);
        if (pickVec.z > 1 || pickVec.z < -1) continue;
        const sx = (pickVec.x * 0.5 + 0.5) * rect.width;
        const sy = (-pickVec.y * 0.5 + 0.5) * rect.height;
        const d = Math.hypot(sx - px, sy - py);
        if (d < bestDistPx) { bestDistPx = d; bestSat = lastPointSats[i]; }
      }
    }

    return bestSat ? { sat: bestSat } : null;
  }

  function refreshHover() {
    if (!pickPointer) return;

    const el = globeContainer.value;
    const hit = pickSatelliteAt(pickPointer.x, pickPointer.y);

    hoveredSatId = hit ? (hit.sat.id ?? null) : null;

    if (!hit || !el) {
      hoverSat.value = null;
      if (el) el.style.cursor = '';
      return;
    }

    const rect = el.getBoundingClientRect();
    const x = pickPointer.x - rect.left;
    const y = pickPointer.y - rect.top;
    const flip = x > rect.width - 180; // у правого края подпись уходит влево
    hoverSat.value = {
      name: hit.sat.name || 'UNKNOWN',
      x: x + (flip ? -14 : 14),
      y,
      flip,
    };
    el.style.cursor = 'pointer';
  }

  function onGlobePointerMove(event) {
    pickPointer = { x: event.clientX, y: event.clientY };

    // Во время вращения камеры (жест со сдвигом) подпись только мешает и
    // заставляет пикать все инстансы на каждый кадр драга.
    if (pickGesture &&
        Math.hypot(event.clientX - pickGesture.x, event.clientY - pickGesture.y) > CLICK_MAX_MOVE_PX) {
      if (hoveredSatId !== null || hoverSat.value) clearHoverState();
      return;
    }

    if (pickHoverRaf) return; // не чаще одного пика за кадр
    pickHoverRaf = requestAnimationFrame(() => {
      pickHoverRaf = 0;
      refreshHover();
    });
  }

  function clearHoverState() {
    hoveredSatId = null;
    hoverSat.value = null;
    if (globeContainer.value) globeContainer.value.style.cursor = '';
  }

  function onGlobePointerLeave() {
    pickPointer = null;
    pickGesture  = null;
    if (pickHoverRaf) { cancelAnimationFrame(pickHoverRaf); pickHoverRaf = 0; }
    clearHoverState();
  }

  function onGlobePointerDown(event) {
    // правый/средний кнопкой камеру вращают — это не клик по аппарату
    pickGesture = event.button === 0 || event.pointerType !== 'mouse'
      ? { x: event.clientX, y: event.clientY, at: performance.now() }
      : null;
  }

  function onGlobePointerUp(event) {
    const gesture = pickGesture;
    pickGesture = null;
    if (!gesture) return;

    const moved = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    const held  = performance.now() - gesture.at;
    // поворот/зум камеры (или долгое удержание) — кликом не считаем
    if (moved > CLICK_MAX_MOVE_PX || held > CLICK_MAX_MS) return;
    if (performance.now() - pickLastClickAt < CLICK_DEBOUNCE_MS) return;

    const hit = pickSatelliteAt(event.clientX, event.clientY);
    if (!hit) return; // клик по пустому глобусу — не трогаем камеру

    pickLastClickAt = performance.now();
    clearHoverState();     // подпись убираем: камера сейчас уедет к аппарату
    focusSatellite(hit.sat); // существующий путь: орбита + follow-камера
  }

  function bindSatellitePicking() {
    const el = globeContainer.value;
    if (!el || pickBindings.bound) return;
    // dispose-контракт: регистрация идёт через disposer — снимать вручную не нужно.
    disposer.registerEventListener(el, 'pointermove',   onGlobePointerMove)
            .registerEventListener(el, 'pointerdown',   onGlobePointerDown)
            .registerEventListener(el, 'pointerup',     onGlobePointerUp)
            .registerEventListener(el, 'pointerleave',  onGlobePointerLeave)
            .registerEventListener(el, 'pointercancel', onGlobePointerLeave);
    // Троттлинг наведения: id живёт один кадр, поэтому регистрируем геттер.
    disposer.registerRaf(() => pickHoverRaf);
    pickBindings.bound = true;
  }

  function unbindSatellitePicking() {
    const el = globeContainer.value;
    if (el) {
      el.removeEventListener('pointermove',   onGlobePointerMove);
      el.removeEventListener('pointerdown',   onGlobePointerDown);
      el.removeEventListener('pointerup',     onGlobePointerUp);
      el.removeEventListener('pointerleave',  onGlobePointerLeave);
      el.removeEventListener('pointercancel', onGlobePointerLeave);
    }
    if (pickHoverRaf) { cancelAnimationFrame(pickHoverRaf); pickHoverRaf = 0; }
    pickBindings.bound = false;
    pickPointer  = null;
    pickGesture  = null;
    hoveredSatId = null;
    hoverSat.value = null;
    pickGlobeSphere = null;
  }


  // -----------------------------------------------------------------------
  // F4: орбита и наземный трек сфокусированного спутника (Line2)
  // -----------------------------------------------------------------------
  // Орбиту и подспутниковую траекторию рисуем только для аппарата в фокусе:
  // 120 выборок за один виток от текущего момента (последняя точка замыкает
  // петлю). Координаты считаются той же связкой propagate → gstime → eciToGeodetic,
  // что и в computePositions, поэтому линия совпадает с движением маркера.
  // Линии живут в той же вращающейся группе, что и InstancedMesh спутников,
  // иначе при вращении глобуса они разъедутся с аппаратами.
  const ORBIT_SAMPLES          = 120;
  const ORBIT_REBUILD_MS       = 30000; // виток «уплывает» относительно вращающейся Земли
  const ORBIT_COLOR            = 0x34d399; // emerald-акцент Mission Control
  const ORBIT_LINEWIDTH        = 2;
  const ORBIT_OPACITY          = 0.9;
  const GROUND_TRACK_LINEWIDTH = 1;
  const GROUND_TRACK_OPACITY   = 0.4;
  const GROUND_TRACK_ALT       = 0.02;  // 2 ед. над поверхностью (R=100): z-борьба с текстурой Земли

  let orbitLine         = null;
  let groundTrackLine   = null;
  let orbitRebuildTimer = null;
  let orbitFocusedId    = null;
  let orbitRegistered   = false; // таймер перестроения зарегистрирован в disposer

  // LineMaterial рисует толщину в экранных пикселях, поэтому ему нужен размер
  // рендера в uniform resolution; без этого линия будет толщиной в один пиксель.
  function applyLineResolution(material) {
    if (!material || !globeContainer.value) return;
    material.resolution.set(
      globeContainer.value.clientWidth  || 1,
      globeContainer.value.clientHeight || 1
    );
  }

  function createOrbitLine(points, linewidth, opacity) {
    const flat = [];
    for (const p of points) flat.push(p.x, p.y, p.z);

    const geometry = new LineGeometry();
    geometry.setPositions(flat);

    const material = new LineMaterial({
      color: ORBIT_COLOR,
      linewidth,
      transparent: true,
      opacity,
      worldUnits: false,
      depthWrite: false,
      depthTest: true, // дальняя дуга прячется за глобусом (без этого — дубль на текстуре)
    });
    applyLineResolution(material);

    const line = new Line2(geometry, material);
    line.computeLineDistances();
    line.frustumCulled = false; // bbox не считаем: геометрия пересобирается раз в 30 с

    // dispose-контракт: линии живут от фокуса до фокуса (пересоздаются).
    disposer.registerMesh(line)
            .registerGeometry(geometry)
            .registerMaterial(material);

    return line;
  }

  // Выборка витка: N шагов по периоду (satrec.no — среднее движение, рад/мин).
  function sampleOrbit(sat, count) {
    const satrec = sat.satrec;
    if (!satrec || !satrec.no) return { orbit: [], ground: [] };

    const periodMs = ((2 * Math.PI) / satrec.no) * 60 * 1000;
    const stepMs   = periodMs / count;
    const startMs  = Date.now();

    const orbit  = [];
    const ground = [];

    for (let i = 0; i <= count; i++) { // i === count замыкает петлю
      try {
        const t   = new Date(startMs + i * stepMs);
        const pv  = satellite.propagate(satrec, t);
        const pos = pv.position;
        if (!pos || typeof pos === 'boolean') continue;

        const gmst = satellite.gstime(t);
        const gd   = satellite.eciToGeodetic(pos, gmst);
        const lat  = satellite.degreesLat(gd.latitude);
        const lng  = satellite.degreesLong(gd.longitude);

        orbit.push(globeInstance.getCoords(lat, lng, gd.height / 6371));
        ground.push(globeInstance.getCoords(lat, lng, GROUND_TRACK_ALT));
      } catch {}
    }

    return { orbit, ground };
  }

  function disposeOrbitLines() {
    if (orbitRebuildTimer) { clearInterval(orbitRebuildTimer); orbitRebuildTimer = null; }

    for (const line of [orbitLine, groundTrackLine]) {
      if (!line) continue;
      if (line.parent) line.parent.remove(line);
      else if (satMeshGroup) satMeshGroup.remove(line);
      if (line.geometry) line.geometry.dispose();
      if (line.material) line.material.dispose();
    }

    orbitLine = null;
    groundTrackLine = null;
    orbitFocusedId = null;
  }

  // Перестроение линий для аппарата в фокусе (sat — позиция из currPositions
  // или запись из allSatellites).
  function buildOrbitLines(sat) {
    disposeOrbitLines();
    if (!globeInstance || !sat) return;

    const source = allSatellites.find(s => s.id === sat.id)
      || allSatellites.find(s => s.catalogNumber != null && String(s.catalogNumber) === String(sat.catalogNumber));
    if (!source || !source.satrec) return;

    if (!satMeshGroup) satMeshGroup = resolveSatMeshGroup();
    if (!satMeshGroup) return;

    const { orbit, ground } = sampleOrbit(source, ORBIT_SAMPLES);
    if (orbit.length < 2 || ground.length < 2) return;

    orbitLine       = createOrbitLine(orbit,  ORBIT_LINEWIDTH,        ORBIT_OPACITY);
    groundTrackLine = createOrbitLine(ground, GROUND_TRACK_LINEWIDTH, GROUND_TRACK_OPACITY);

    satMeshGroup.add(orbitLine);
    satMeshGroup.add(groundTrackLine);

    orbitFocusedId = sat.id;

    // Пока фокус не снят — раз в 30 с пересобираем выборку.
    orbitRebuildTimer = setInterval(() => {
      if (focusTarget.value == null) { disposeOrbitLines(); return; }
      const focused = allSatellites.find(s => s.id === orbitFocusedId);
      if (!focused) { disposeOrbitLines(); return; }
      buildOrbitLines(focused);
    }, ORBIT_REBUILD_MS);

    // dispose-контракт: таймер пересоздаётся вместе с линиями — регистрируем
    // геттер один раз (id меняется при каждом buildOrbitLines).
    if (!orbitRegistered) {
      orbitRegistered = true;
      disposer.registerTimer(() => orbitRebuildTimer)
              .registerDisposer(disposeOrbitLines);
    }
  }


  // -----------------------------------------------------------------------
  // Загрузка данных о спутниках
  // -----------------------------------------------------------------------
  async function fetchData() {
    loading.value = true;
    try {
      let url = '/api/satellites';
      let data = [];

      if (activeFilter.value === 'FAVORITES') {
        const res = await axios.get('/api/user/favorites');
        data = res.data.favorites;
      } else {
        if (activeFilter.value !== 'ALL') {
            url = `/api/satellites?category=${activeFilter.value}`;
        }
        const res = await axios.get(url);
        data = res.data;
      }

      // Парсинг TLE с помощью satellite.js
      allSatellites = data
        .map(sat => {
          try {
            const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
            return {
              id: sat.id,
              name: sat.name,
              category: sat.category,
              catalogNumber: sat.catalog_number ?? null,
              catalog_number: sat.catalog_number ?? null,
              tle1: sat.tle1,
              tle2: sat.tle2,
              country: sat.country ?? null,
              country_name: sat.country_name ?? null,
              launch_date: sat.launch_date ?? null,
              launch_site: sat.launch_site ?? null,
              purpose: sat.purpose ?? null,
              object_type: sat.object_type ?? null,
              decay_date: sat.decay_date ?? null,
              rcs_size: sat.rcs_size ?? null,
              satrec,
            };
          } catch { return null; }
        })
        .filter(Boolean);

      // SGP4-расчёт вынесен в Web Worker: передаём ему актуальный набор satrec
      sgp4WorkerClient.setSatellites(allSatellites);

      // F4: satrec пересозданы — линии орбиты для текущего фокуса строим заново
      if (orbitFocusedId != null) {
        const focused = allSatellites.find(s => s.id === orbitFocusedId);
        if (focused) buildOrbitLines(focused);
        else disposeOrbitLines();
      }

    } catch (e) {
      console.error('Failed to fetch satellites:', e);
    }
    loading.value = false;
    startAnimation();
  }

  // -----------------------------------------------------------------------
  // Анимация и расчет координат (satellite.js)
  // -----------------------------------------------------------------------
  // Расчет координат: батч SGP4 выполняется в Web Worker (sgp4WorkerClient),
  // синхронный fallback — computePositionsFromSatrecs из lib/sgp4Core.

  function lerpAngle(a, b, t) {
    let d = b - a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return a + d * t;
  }

  function interpolatePositions(prev, curr, t) {
    if (t <= 0 || !prev.length) return curr;

    const prevById = new Map(prev.map(p => [p.id, p]));

    return curr.map(p => {
      const pp = prevById.get(p.id);
      if (!pp) return p;
      return {
        ...p,
        lat: pp.lat + (p.lat - pp.lat) * t,
        lng: lerpAngle(pp.lng, p.lng, t),
        alt: pp.alt + (p.alt - pp.alt) * t,
      };
    });
  }

  // Защита от наложения тиков: пока воркер считает — следующий не запускаем
  let refreshInFlight = false;

  async function refreshPositions() {
    if (refreshInFlight) return;
    refreshInFlight = true;

    const now = new Date();
    const timeMs = now.getTime();

    try {
      const positions = await sgp4WorkerClient.computePositions(now);

      // null — расчёт отброшен/устарел (или список ещё не загружен): оставляем прежние
      if (!positions) return;

      if (currPositions.length) prevPositions = currPositions;
      currPositions = positions;
      if (!prevPositions.length) prevPositions = currPositions;

      // База интерполяции — момент запроса, а не прихода ответа из воркера
      lastRefreshTime = timeMs;
      satPositions.value = currPositions;

      // follow-режим: раз в секунду подтягиваем камеру к выбранному аппарату
      trackFocusedSatellite();
    } catch (e) {
      console.error('Failed to refresh positions:', e);
    } finally {
      refreshInFlight = false;
    }
  }


  // -----------------------------------------------------------------------
  // Debug-режим (?debug=1): сколько инстансов реально отрисовано за кадр
  // -----------------------------------------------------------------------
  // HUD обновляется 2 раза в секунду; в консоль — строка раз в ~2 c, чтобы
  // можно было записать цифры «до/после» на полном каталоге (~16k).
  const DEBUG_ENABLED = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');
  const debugStats = ref(null);
  let debugFrames       = 0;
  let debugSince        = 0;
  let debugConsoleTick  = 0;

  function flushDebugStats(nowMs) {
    debugFrames++;
    if (!debugSince) { debugSince = nowMs; return; }

    const elapsed = nowMs - debugSince;
    if (elapsed < 500) return;

    const fps    = (debugFrames * 1000) / elapsed;
    const drawn  = satStats.near + satStats.points;

    debugStats.value = {
      fps: Math.round(fps),
      total: satStats.total,
      drawn,
      near: satStats.near,
      points: satStats.points,
      frustum: satStats.culledFrustum,
      limb: satStats.culledLimb,
    };

    debugFrames = 0;
    debugSince = nowMs;
    debugConsoleTick++;
    if (debugConsoleTick % 4 === 0) {
      console.log(
        `[globe] fps=${Math.round(fps)} drawn=${drawn}/${satStats.total}` +
        ` spheres=${satStats.near} points=${satStats.points}` +
        ` culled: frustum=${satStats.culledFrustum} limb=${satStats.culledLimb}`,
      );
    }
  }

  function renderFrame() {
    const t = Math.min(1, (Date.now() - lastRefreshTime) / 1000);

    if (globeInstance) {
      // Подпись под курсором (hover) обновляется пикингом по pointermove — см.
      // раздел «Пикинг спутников»; здесь только интерполированные матрицы.
      updateSatelliteMesh(interpolatePositions(prevPositions, currPositions, t));
      if (DEBUG_ENABLED) flushDebugStats(performance.now());
    }

    rafId = requestAnimationFrame(renderFrame);
  }

  function startAnimation() {
    if (refreshInterval) clearInterval(refreshInterval);
    if (rafId) cancelAnimationFrame(rafId);

    refreshPositions();
    lastRefreshTime = Date.now();

    refreshInterval = setInterval(refreshPositions, 1000);
    rafId = requestAnimationFrame(renderFrame);

    // dispose-контракт: id анимационного цикла переназначается каждый кадр —
    // регистрируем геттеры, чтобы снять именно актуальный кадр. Флаг не даёт
    // плодить записи при повторных вызовах (fetchData → startAnimation).
    if (!animationRegistered) {
      animationRegistered = true;
      disposer.registerRaf(() => rafId).registerTimer(() => refreshInterval);
    }
  }

  // Регистрация анимационного цикла — один раз на жизнь компонента.
  let animationRegistered = false;


  // -----------------------------------------------------------------------
  // F2: астрономический терминатор + огни городов
  // -----------------------------------------------------------------------
  // Освещение глобуса привязано к реальному положению Солнца на текущий UTC-момент.
  // Считаем субсолнечную точку (широта = склонение Солнца, долгота = 15°·(UTC−12)),
  // переводим её в единичный вектор sunDirection в системе координат глобуса и
  // сравниваем его с нормалью в вершинном/фрагментном шейдере: день — Blue Marble,
  // ночь — Black Marble (огни городов) с мягкой полосой терминатора.
  const DAY_TEXTURE_URL   = '/textures/earth-blue-marble.webp';
  const NIGHT_TEXTURE_URL = '/textures/earth-night.webp';
  const BUMP_TEXTURE_URL  = '/textures/earth-topology.webp';

  const TERMINATOR_SHARPNESS = 0.08;  // полуширина полосы терминатора (в единицах dot(n, sun))
  const SUN_REFRESH_MS       = 60 * 1000; // пересчёт sunDirection раз в минуту

  let globeDayNightMaterial = null;
  let sunInterval           = null;
  const sunDirScratch       = new THREE.Vector3();
  const sunMatrixScratch    = new THREE.Matrix4();
  const sunTextures         = { day: null, night: null, bump: null };

  const TERMINATOR_VERT = `
  varying vec2 vUv;
  varying vec3 vNormalObj;

  void main() {
    vUv = uv;
    vNormalObj = normal; // нормаль сферы в локальных координатах глобуса
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
  `;

  const TERMINATOR_FRAG = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D bumpMap;
  uniform vec3  sunDirection;   // единичный вектор на Солнце в локальных координатах глобуса
  uniform float terminatorSharpness;
  uniform float bumpScale;
  uniform float nightIntensity;
  uniform vec2  bumpTexel;      // 1/размер текстуры рельефа

  varying vec2 vUv;
  varying vec3 vNormalObj;

  const vec3 UP = vec3(0.0, 1.0, 0.0);

  void main() {
    vec3 n = normalize(vNormalObj);

    // Касательный базис сферы: T — вдоль роста u (долгота), B — вдоль v (широта).
    vec3 T = cross(UP, n);
    float tLen = length(T);
    T = tLen > 1e-4 ? T / tLen : vec3(1.0, 0.0, 0.0);
    vec3 B = cross(n, T);

    // Рельеф из bump-карты (earth-topology.png): центральные разности по UV.
    float hL = texture2D(bumpMap, vUv - vec2(bumpTexel.x, 0.0)).r;
    float hR = texture2D(bumpMap, vUv + vec2(bumpTexel.x, 0.0)).r;
    float hD = texture2D(bumpMap, vUv - vec2(0.0, bumpTexel.y)).r;
    float hU = texture2D(bumpMap, vUv + vec2(0.0, bumpTexel.y)).r;
    vec3 nb = normalize(n + bumpScale * ((hL - hR) * T + (hD - hU) * B));

    float sunDot = dot(nb, normalize(sunDirection));

    // Мягкая полоса терминатора: 0 — глубокая ночь, 1 — полный день.
    float dayAmount = smoothstep(-terminatorSharpness, terminatorSharpness, sunDot);

    vec3 dayColor   = texture2D(dayMap,   vUv).rgb;
    vec3 nightColor = texture2D(nightMap, vUv).rgb;

    // Огни городов тёплые/нейтральные (r ≈ b), а базовый «синий» слой текстуры
    // (лёд Гренландии/Антарктиды, airglow над сушей) — сине-доминантный (r << b,
    // r/b ≈ 0.03). Гейт по отношению r/b отсекает синие пиксели: свечение
    // остаётся только настоящим огням (их r/b ≈ 0.8–1.7).
    float warm = smoothstep(0.3, 0.7, nightColor.r / (nightColor.b + 1e-4));

    // День: диффуз с затенением к лимбу. Ночь: едва различимая суша + огни городов.
    vec3 daySide   = dayColor * (0.22 + 0.88 * clamp(sunDot, 0.0, 1.0));
    vec3 nightSide = dayColor * 0.03 + nightColor * nightColor * nightIntensity * warm;

    gl_FragColor = vec4(mix(nightSide, daySide, dayAmount), 1.0);
    #include <colorspace_fragment>
  }
  `;

  // 1x1 заглушка: шейдер валиден сразу, реальные текстуры подставляются в onLoad.
  function solidTexture(r, g, b) {
    const tex = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
    tex.needsUpdate = true;
    return tex;
  }

  // Меш земного шара three-globe (Group __globeObjType === 'globe' → дочерний Mesh).
  function findGlobeMesh() {
    if (!globeInstance) return null;
    let globeGroup = null;
    globeInstance.scene().traverse(o => {
      if (!globeGroup && o.__globeObjType === 'globe') globeGroup = o;
    });
    return globeGroup ? globeGroup.children.find(c => c.isMesh) || null : null;
  }

  // Субсолнечная точка по UTC: широта = δ, долгота = 15°·(UTC−12) с поправкой
  // уравнения времени (~±16 мин). Точность порядка 0.5° — для терминатора достаточно.
  function subsolarPoint(date) {
    const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
    const dayOfYear = (Date.UTC(
      date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()
    ) - yearStart) / 86400000 + 1;

    const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

    const declination = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));

    const b = (2 * Math.PI / 364) * (dayOfYear - 81);
    const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

    let lng = 15 * (utcHours - 12) - equationOfTime / 4;
    lng = ((lng + 180) % 360 + 360) % 360 - 180;

    return { lat: declination, lng };
  }

  // (lat, lng) → единичный вектор в системе координат getCoords() three-globe.
  function sunDirectionFromGeo(lat, lng) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (90 - lng) * Math.PI / 180;
    const phiSin = Math.sin(phi);
    return new THREE.Vector3(
      phiSin * Math.cos(theta),
      Math.cos(phi),
      phiSin * Math.sin(theta)
    );
  }

  function updateSunDirection() {
    if (!globeInstance) return;

    const { lat, lng } = subsolarPoint(new Date());
    const dir = sunDirScratch.copy(sunDirectionFromGeo(lat, lng));

    // getCoords() работает в координатах группы глобуса, а шейдер — в локальных
    // координатах меша (globeObj повёрнут на -90° по Y). Переводим вектор туда.
    const mesh = findGlobeMesh();
    if (mesh) {
      mesh.updateWorldMatrix(true, false);
      if (mesh.parent) dir.transformDirection(mesh.parent.matrixWorld);
      // F3: атмосфера — отдельный меш в мировых координатах, ей нужен вектор на
      // Солнце в мировом пространстве (до перевода в локальные координаты меша).
      if (atmosphereMesh) atmosphereMesh.material.uniforms.sunDirection.value.copy(dir);
      sunMatrixScratch.copy(mesh.matrixWorld).invert();
      dir.transformDirection(sunMatrixScratch);
    }

    if (globeDayNightMaterial) {
      globeDayNightMaterial.uniforms.sunDirection.value.copy(dir);
    }
  }

  function initDayNightMaterial() {
    if (!globeInstance || globeDayNightMaterial) return;

    const uniforms = {
      dayMap:              { value: solidTexture(18, 26, 44) },
      nightMap:            { value: solidTexture(0, 0, 0) },
      bumpMap:             { value: solidTexture(128, 128, 128) },
      sunDirection:        { value: new THREE.Vector3(1, 0, 0) },
      terminatorSharpness: { value: TERMINATOR_SHARPNESS },
      bumpScale:           { value: 1.6 },
      // HDR-огни городов: текстура Black Marble тусклая (люминанс nightColor²
      // max ≈ 0.044), поэтому ×2.2 давал всего 0.096 линейных — ниже порога
      // bloom 0.82, свечения не было вовсе. ×45 поднимает ядра огней до ~2.0
      // линейных: яркие точки городов светят и попадают в bloom, при этом
      // дневная сторона (≤ 1.0) порог по-прежнему почти не превышает.
      nightIntensity:      { value: 45 },
      bumpTexel:           { value: new THREE.Vector2(1 / 2048, 1 / 1024) },
    };

    globeDayNightMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: TERMINATOR_VERT,
      fragmentShader: TERMINATOR_FRAG,
    });

    // dispose-контракт: шейдерный материал глобуса + его карты (day/night/bump).
    // Текстуры грузятся асинхронно, поэтому регистрируем слоты через disposer,
    // а не только на момент вызова: к размонтированию часть может не прийти.
    disposer.registerMaterial(globeDayNightMaterial)
            .registerDisposer(disposeDayNightMaterial);

    if (typeof globeInstance.globeMaterial === 'function') {
      globeInstance.globeMaterial(globeDayNightMaterial);
    } else {
      const mesh = findGlobeMesh();
      if (mesh) mesh.material = globeDayNightMaterial;
    }

    // Текстуры грузим асинхронно — initGlobe не блокируется.
    const loader = new THREE.TextureLoader();

    loader.load(DAY_TEXTURE_URL, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      disposer.registerTexture(tex); // пришла после disposeAll — освобождаем сразу
      sunTextures.day = tex;
      uniforms.dayMap.value = tex;
    });

    loader.load(NIGHT_TEXTURE_URL, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      disposer.registerTexture(tex);
      sunTextures.night = tex;
      uniforms.nightMap.value = tex;
    });

    loader.load(BUMP_TEXTURE_URL, tex => {
      tex.colorSpace = THREE.NoColorSpace;
      disposer.registerTexture(tex);
      sunTextures.bump = tex;
      uniforms.bumpMap.value = tex;
      const img = tex.image;
      if (img && img.width && img.height) {
        uniforms.bumpTexel.value.set(1 / img.width, 1 / img.height);
      }
    });
  }

  function disposeDayNightMaterial() {
    if (!globeDayNightMaterial) return;
    globeDayNightMaterial.dispose();
    Object.values(sunTextures).forEach(tex => { if (tex) tex.dispose(); });
    sunTextures.day = sunTextures.night = sunTextures.bump = null;
    globeDayNightMaterial = null;
  }


  // -----------------------------------------------------------------------
  // F3: Звёздное поле и fresnel-атмосфера
  // -----------------------------------------------------------------------
  // Звёзды и атмосфера живут в мировой сцене (globeInstance.scene()), а НЕ в группе
  // вращения глобуса: иначе они крутились бы вместе с Землёй.
  // camera.near = 0.05, camera.far = skyRadius * 2.5 = 50000 * 2.5 = 125000, а
  // controls.maxDistance = 10000 (всё это выставляет globe.gl в своём init),
  // поэтому звёздная сфера R = 20000 всегда вокруг камеры, внутри far и внутри
  // skysphere-фона (R = 50000). Плоскости камеры не трогаем — глубина не страдает.
  const STAR_COUNT         = 2400;   // всего звёзд (два слоя: мелкие + яркие)
  const STARFIELD_RADIUS   = 20000;  // глобус = 100, camera.far = 125000, skysphere = 50000
  const STAR_RADIUS_JITTER = 0.08;   // радиальный джиттер, доля радиуса

  const ATMOSPHERE_RADIUS  = 104;     // глобус = 100: оболочка чуть больше
  const ATMOSPHERE_COLOR   = '#6db3ff';
  const ATMOSPHERE_POWER   = 3.0;     // показатель fresnel (2.5–4)
  const ATMOSPHERE_GAIN    = 1.35;    // общая яркость свечения
  const ATMOSPHERE_NIGHT   = 0.32;    // доля яркости на ночной стороне

  const STAR_PALETTE = [
    { color: new THREE.Color('#ffffff'), weight: 0.55 },  // белые
    { color: new THREE.Color('#9fc4ff'), weight: 0.28 },  // голубоватые
    { color: new THREE.Color('#ffd2a0'), weight: 0.17 },  // тёплые
  ];

  let starfieldGroup = null;   // THREE.Group с двумя слоями THREE.Points
  let starTexture     = null;   // мягкая круглая текстура звезды (общая на слои)
  let atmosphereMesh = null;   // fresnel-оболочка вокруг глобуса (отдельный меш)

  // Мягкая круглая текстура звезды: яркое ядро + полупрозрачный ореол +
  // прозрачный край (2D-canvas). Без неё PointsMaterial рисует КВАДРАТНЫЕ
  // точки — «снег» вместо звёзд; с ней точки светятся и сцена не плоская.
  function makeStarTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0.0, 'rgba(255,255,255,1)');    // ядро
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.75)');// яркая часть
    gradient.addColorStop(0.7, 'rgba(255,255,255,0.18)'); // ореол
    gradient.addColorStop(1.0, 'rgba(255,255,255,0)');    // прозрачный край
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(canvas);
  }

  // Один слой звёзд: равномерно по сфере радиуса radius с радиальным джиттером.
  // Размер в экранных пикселях (sizeAttenuation: false), поэтому с расстоянием
  // звёзды не «раздуваются». Яркость зашита в цвет вершины — так получается
  // вариативная прозрачность без отдельного атрибута alpha.
  function makeStarLayer(count, sizePx, radius) {
    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Равномерное распределение по сфере (иначе точки липнут к полюсам).
      const theta = 2 * Math.PI * Math.random();
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = radius * (1 + (Math.random() * 2 - 1) * STAR_RADIUS_JITTER);
      const sinPhi = Math.sin(phi);

      positions[i * 3]     = r * sinPhi * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * sinPhi * Math.sin(theta);

      // Оттенок из палитры + случайная яркость 0.45…1.0.
      const pick = Math.random();
      const star = pick < STAR_PALETTE[0].weight
        ? STAR_PALETTE[0]
        : pick < STAR_PALETTE[0].weight + STAR_PALETTE[1].weight
          ? STAR_PALETTE[1]
          : STAR_PALETTE[2];
      const brightness = 0.45 + Math.random() * 0.55;

      colors[i * 3]     = star.color.r * brightness;
      colors[i * 3 + 1] = star.color.g * brightness;
      colors[i * 3 + 2] = star.color.b * brightness;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: sizePx,
      sizeAttenuation: false,   // размер в пикселях, не в мировых единицах
      map: starTexture,         // мягкий круглый спрайт — иначе квадратные точки
      vertexColors: true,       // цвет вершины задаёт оттенок И яркость звезды
      transparent: true,        // прозрачный проход — рисуется ПОСЛЕ непрозрачной
                                // skysphere three-globe, иначе фон перекрыл бы звёзды
      depthWrite: false,        // звёзды не пишут глубину и не заслоняют друг друга
      depthTest: true,          // но корректно прячутся за глобусом
      opacity: 1.0,             // яркость регулируется цветом вершины (0.45…1.0)
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.renderOrder = 1;
    points.frustumCulled = false; // сфера охватывает камеру — отсечение по bbox не нужно

    return points;
  }

  // Статичные звёзды (без мерцания — reduced-motion-friendly).
  function initStarfield() {
    if (starfieldGroup || !globeInstance) return;

    starTexture = makeStarTexture(); // общий спрайт на оба слоя
    disposer.registerTexture(starTexture);

    starfieldGroup = new THREE.Group();
    starfieldGroup.name = 'starfield';
    // Размеры с запасом под ореол спрайта: видимое ядро ≈ 40% бокса.
    starfieldGroup.add(makeStarLayer(Math.round(STAR_COUNT * 0.78), 2.4, STARFIELD_RADIUS));
    starfieldGroup.add(makeStarLayer(Math.round(STAR_COUNT * 0.22), 4.0, STARFIELD_RADIUS));

    globeInstance.scene().add(starfieldGroup);

    // dispose-контракт: группа живёт в мировой сцене и не принадлежит globe.gl —
    // снимаем её своим слоем (release), остальное добьёт обход сцены.
    disposer.registerObject(starfieldGroup).registerDisposer(disposeStarfield);
  }

  function disposeStarfield() {
    if (!starfieldGroup) return;

    if (typeof starfieldGroup.removeFromParent === 'function') {
      starfieldGroup.removeFromParent();
    } else if (starfieldGroup.parent) {
      starfieldGroup.parent.remove(starfieldGroup);
    }

    starfieldGroup.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });

    // material.dispose() НЕ освобождает текстуры — делаем это сами (dispose-контракт).
    if (starTexture) {
      starTexture.dispose();
      starTexture = null;
    }

    starfieldGroup = null;
  }

  // Fresnel-оболочка: сфера чуть больше глобуса, рисуется изнутри (BackSide),
  // аддитивно, без записи глубины — остаётся только свечение у лимба и оно не
  // перекрывает ночные огни городов (в центре диска fresnel ≈ 0).
  const ATMOSPHERE_VERT = `
  varying vec3 vNormalView;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormalView  = normalize(normalMatrix * normal);
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vViewDir     = normalize(-mvPosition.xyz);
    gl_Position  = projectionMatrix * mvPosition;
  }
  `;

  const ATMOSPHERE_FRAG = `
  uniform vec3  glowColor;
  uniform vec3  sunDirection;   // на Солнце, в МИРОВЫХ координатах
  uniform float fresnelPower;
  uniform float glowIntensity;
  uniform float nightGlow;      // доля яркости на ночной стороне

  varying vec3 vNormalView;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;

  void main() {
    // Классический fresnel по лимбу: в центре диска ~0, на краю ~1.
    float rim = 1.0 - abs(dot(normalize(vNormalView), normalize(vViewDir)));
    float f   = pow(clamp(rim, 0.0, 1.0), fresnelPower);

    // Модуляция день/ночь: со стороны подсолнечной точки свечение ярче.
    float dayAmount = smoothstep(-0.15, 0.35, dot(normalize(vNormalWorld), normalize(sunDirection)));
    float gain      = mix(nightGlow, 1.0, dayAmount);

    gl_FragColor = vec4(glowColor * f * glowIntensity * gain, f * gain);
    #include <colorspace_fragment>
  }
  `;

  function initAtmosphere() {
    if (atmosphereMesh || !globeInstance) return;

    const geometry = new THREE.SphereGeometry(ATMOSPHERE_RADIUS, 64, 64);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        glowColor:     { value: new THREE.Color(ATMOSPHERE_COLOR) },
        sunDirection:  { value: new THREE.Vector3(1, 0, 0) },
        fresnelPower:  { value: ATMOSPHERE_POWER },
        glowIntensity: { value: ATMOSPHERE_GAIN },
        nightGlow:     { value: ATMOSPHERE_NIGHT },
      },
      vertexShader:   ATMOSPHERE_VERT,
      fragmentShader: ATMOSPHERE_FRAG,
      transparent:    true,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,
      depthTest:      true,
      side:           THREE.BackSide,  // виден «изнутри» — свечение вокруг лимба
    });

    atmosphereMesh = new THREE.Mesh(geometry, material);
    atmosphereMesh.name = 'atmosphere';
    atmosphereMesh.renderOrder = 2;
    atmosphereMesh.frustumCulled = false;

    // Отдельный меш в мировой сцене: globeDayNightMaterial остаётся на меше глобуса.
    globeInstance.scene().add(atmosphereMesh);

    // dispose-контракт: оболочка не принадлежит globe.gl — освобождаем своим слоем.
    disposer.registerMesh(atmosphereMesh)
            .registerGeometry(geometry)
            .registerMaterial(material)
            .registerDisposer(disposeAtmosphere);
  }

  function disposeAtmosphere() {
    if (!atmosphereMesh) return;

    if (typeof atmosphereMesh.removeFromParent === 'function') {
      atmosphereMesh.removeFromParent();
    } else if (atmosphereMesh.parent) {
      atmosphereMesh.parent.remove(atmosphereMesh);
    }

    if (atmosphereMesh.geometry) atmosphereMesh.geometry.dispose();
    if (atmosphereMesh.material) atmosphereMesh.material.dispose();
    atmosphereMesh = null;
  }


  // -----------------------------------------------------------------------
  // Спринт 4: пост-обработка (UnrealBloom + FXAA + ACES tone mapping)
  // -----------------------------------------------------------------------
  // three-render-objects рендерит кадр через свой EffectComposer, поэтому
  // достаточно дополнить его пассами — renderer.render() не патчим.
  function initPostProcessing() {
    if (!globeInstance || postProcessing) return;
    postProcessing = createPostProcessing(globeInstance);

    // dispose-контракт: пассы и внутренние render target'ы UnrealBloomPass
    // (renderTargetBright + renderTargetsHorizontal/Vertical) освобождает
    // disposeComposer внутри disposeAll — composer регистрируем целиком.
    disposer.registerComposer(postProcessing.composer)
            .registerRenderer(globeInstance.renderer())
            .registerDisposer(() => {
              if (!postProcessing) return;
              postProcessing.dispose();
              postProcessing = null;
            });
  }


  // -----------------------------------------------------------------------
  // Инициализация глобуса
  // -----------------------------------------------------------------------
  function retryInitGlobe() {
    webglSupported.value = true;
    setTimeout(() => {
      initGlobe();
    }, 50);
  }

  function initGlobe() {
    if (!globeContainer.value) return;

    if (!checkWebGLSupport()) {
      console.warn('[globe] WebGL is not supported on this client/device');
      webglSupported.value = false;
      return;
    }

    try {
      globeInstance = Globe()(globeContainer.value);
    } catch (err) {
      console.error('[globe] WebGL context initialization error:', err);
      webglSupported.value = false;
      return;
    }
    webglSupported.value = true;

    // dispose-контракт: рендерер и контролы globe.gl регистрируем сразу после
    // создания (контролы нужны до вызова render(), если он вообще случится).
    disposer.registerRenderer(globeInstance.renderer())
            .registerControls(globeInstance.controls());

    // SGP4-воркер: terminate выполняется первым шагом disposeAll, до освобождения
    // сцены — иначе запоздалый ответ начал бы писать в удалённые буферы.
    if (sgp4WorkerClient.worker) disposer.registerWorker(sgp4WorkerClient.worker);
    disposer.registerDisposer(() => sgp4WorkerClient.dispose());

    // F4-fix: у three-globe camera.near = 0.05 / far = 125000 (ratio 2.5M:1) —
    // z-буфер на дистанции ~250 ед. неточен на единицы, дальняя дуга орбиты
    // просвечивала сквозь текстуру Земли, а ground track «слипался» с поверхностью.
    // Сжимаем диапазон: minDistance камеры 2 ед. (follow) ⇒ near = 1 безопасен,
    // far покрывает звёзды (R = 20000) и фон-скайсферу (R = 50000) с запасом.
    {
      const cam = globeInstance.camera();
      cam.near = 1;
      cam.far  = 65000;
      cam.updateProjectionMatrix();
    }

    globeInstance
      .globeImageUrl('/textures/earth-blue-marble.webp')
      .bumpImageUrl('/textures/earth-topology.webp')
      .backgroundImageUrl('/textures/night-sky.webp')
      // Слой Points three-globe больше не используется: спутники рисует
      // собственный THREE.InstancedMesh на истинной радиальной высоте (см. updateSatelliteMesh).
      .onGlobeReady(() => {
        // Глобус готов: фиксируем группу, в которой живут маркеры (родитель земного шара).
        satMeshGroup = resolveSatMeshGroup();
        updateSunDirection();
      });

    // F2: подменяем дефолтный MeshPhongMaterial three-globe на дневной/ночной шейдер
    // (dayMap = Blue Marble, nightMap = Black Marble) и сразу выставляем sunDirection.
    initDayNightMaterial();
    // F3: звёздное поле и fresnel-атмосфера (до updateSunDirection — атмосфере
    // нужен уже существующий меш, чтобы получить sunDirection на первом кадре)
    initStarfield();
    initAtmosphere();
    updateSunDirection();
    sunInterval = setInterval(updateSunDirection, SUN_REFRESH_MS);
    disposer.registerTimer(() => sunInterval);

    bindCameraModeControls();
    bindHeroExitHandler();
    bindFollowStartHandler();
    bindSatellitePicking(); // Спринт 4: hover/клик по аппаратам (Raycaster по InstancedMesh)

    // Отслеживаем изменение размера окна
    resizeObserver = new ResizeObserver(() => {
      if (globeContainer.value && globeInstance) {
        globeInstance.width(globeContainer.value.clientWidth)
                     .height(globeContainer.value.clientHeight);
        // F4: толщина Line2 задаётся в пикселях — обновляем resolution при ресайзе
        applyLineResolution(orbitLine && orbitLine.material);
        applyLineResolution(groundTrackLine && groundTrackLine.material);
        // F4-fix (Спринт 4): composer.setSize() уже сделал three-render-objects,
        // здесь обновляем только uniform resolution у FXAA (DPR-пиксели).
        if (postProcessing) {
          postProcessing.updateSize(
            globeContainer.value.clientWidth,
            globeContainer.value.clientHeight,
            globeInstance.renderer().getPixelRatio(),
          );
        }
      }
    });
    resizeObserver.observe(globeContainer.value);
    disposer.registerDisposer(() => {
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    });

    // Начальный размер
    globeInstance
      .width(globeContainer.value.clientWidth)
      .height(globeContainer.value.clientHeight);

    // Спринт 4: пассы пост-обработки — после первичного размера (до heroIntroTimer).
    initPostProcessing();

    // F1: камера живёт в двух режимах — hero (обзор) и follow (слежение).
    // Старт всегда hero: сначала дальний кадр, затем плавный заезд в «купол».
    heroIntroTimer = setTimeout(() => {
      if (!globeInstance || !heroIntroActive) return;
      const controls = globeInstance.controls();
      if (controls) controls.autoRotate = false;
      globeInstance.pointOfView({ lat: HERO_LAT, lng: HERO_LNG, altitude: 2.4 }, 0);
      heroIntroTimer = setTimeout(() => {
        if (heroIntroActive) enterHeroMode(prefersReducedMotion.value ? 0 : 2200);
      }, 300);
    }, 500);
    // Геттер: heroIntroTimer переприсваивается вложенным setTimeout.
    disposer.registerTimer(() => heroIntroTimer);
  }


  // -----------------------------------------------------------------------
  // F1: Hero-камера — режимы hero ⇄ follow
  // -----------------------------------------------------------------------
  // hero — «горизонт/купол»: камера висит над точкой (HERO_LAT, HERO_LNG) на
  // высоте HERO_ALTITUDE (доли радиуса Земли) и смотрит не в центр шара, как это
  // делает pointOfView, а вперёд-вниз. Тогда верхняя дуга (лимб) Земли ложится на
  // верхнюю часть кадра и занимает всю его ширину, а над ней остаётся полоса
  // космоса. pointOfView всегда целится в центр глобуса и наклона не умеет,
  // поэтому hero-переход делается твином camera.position + controls.target
  // (Cubic.InOut, камера идёт по дуге — без рывков и без пролёта сквозь Землю),
  // а follow — штатным pointOfView({lat,lng,altitude}, ms), в который камера
  // входит уже «прямо» (взгляд на центр), чтобы pointOfView не дёрнул ориентацию.
  const CAMERA_MODE_HERO   = 'hero';
  const CAMERA_MODE_FREE   = 'free';   // свободная орбита вокруг центра Земли
  const CAMERA_MODE_FOLLOW = 'follow';

  const GLOBE_RADIUS      = 100;   // радиус three-globe в мировых единицах
  // Сфера горизонта для отсечения за лимбом (чуть меньше радиуса глобуса, чтобы
  // аппарат на нулевой высоте не отсекался погрешностью интерполяции).
  const SAT_EARTH_LIMB_R2 = (GLOBE_RADIUS * 0.995) * (GLOBE_RADIUS * 0.995);
  const HERO_LAT          = 22;    // Средиземноморье/Сахара — дневная сторона
  const HERO_LNG          = 12;
  const HERO_ALTITUDE     = 0.42;  // камера в 42 ед. над поверхностью (R = 100)
  const HERO_HORIZON_DEG  = 14;    // насколько лимб поднят над центром кадра
  const HERO_LOOK_DIST    = 0.9;   // длина вектора lookAt (в радиусах глобуса)
  const HERO_ROTATE_SPEED = 0.35;  // в hero altitude мал → штатный rotateSpeed «залипает»
  const HERO_TWEEN_MS     = 1800;
  const HERO_CENTRE_MS    = 260;   // доворот взгляда на центр перед полётом к аппарату
  const FOLLOW_TWEEN_MS   = 1300;
  const TRACK_TWEEN_MS    = 0;     // перекадровка за аппаратом раз в секунду — мгновенная:
                                   // аппарат смещается на ~0.06°/с (глазом не видно), зато не
                                   // остаётся висящего твина, который дрался бы с мышью
  const FOLLOW_ALT_PAD    = 0.12;  // запас над аппаратом (в радиусах Земли) ⇒ камера в 12 ед. от него
  const FOLLOW_MAX_ALT    = 12;    // предел зума в follow (GEO ≈ 5.6 радиуса)
  // В follow высота камеры мала (≈ 0.12 радиуса) и globe.gl на каждый 'change'
  // выставляет rotateSpeed = altitude * 0.3 ≈ 0.04, zoomSpeed = sqrt(alt)*0.5 —
  // вращение и зум мышью «залипают». Держим комфортные значения.
  const FOLLOW_ROTATE_SPEED = 0.35;
  const FOLLOW_ZOOM_SPEED   = 0.5;
  // В follow цель орбиты — сам аппарат (в 12 ед. от камеры), поэтому кламп
  // minDistance глобуса (≈ радиус Земли) оттолкнул бы камеру на 100 ед. — снимаем.
  const FOLLOW_MIN_DISTANCE = 2;

  const cameraMode  = ref(CAMERA_MODE_HERO);
  const followSatId = ref(null);

  let cameraTweenId    = null;
  let heroIntroTimer   = null;
  let heroIntroActive  = true;      // стартовый заезд в «купол» ещё не отменён
  let cameraSettleUntil = 0;       // до этого момента авто-слежение не перебивает перелёт
  let followManual     = false;    // пользователь взял камеру мышью → авто-слежение уступает
  let followStartHandler = null;
  const followAnchor   = new THREE.Vector3(); // мировая позиция аппарата (цель орбиты в follow)

  const ZERO_POINT = { x: 0, y: 0, z: 0 };
  const cameraArcScratch = {
    fromPos:  new THREE.Vector3(),
    toPos:    new THREE.Vector3(),
    fromLook: new THREE.Vector3(),
    toLook:   new THREE.Vector3(),
    dir:      new THREE.Vector3(),
    arc:      new THREE.Quaternion(),
    eased:    new THREE.Quaternion(),
    identity: new THREE.Quaternion(),
  };

  function cubicInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function stopCameraTween() {
    if (cameraTweenId) cancelAnimationFrame(cameraTweenId);
    cameraTweenId = null;
  }

  // Пока идёт твин, |camera − target| может на время стать меньше
  // controls.minDistance (≈ радиус глобуса) — TrackballControls тогда оттолкнёт
  // камеру и кадр дёрнется. На время твина ограничение снимаем, в конце возвращаем.
  let heroBaseMinDistance = null;

  function releaseDistanceClamp() {
    const controls = globeInstance && globeInstance.controls();
    if (!controls) return;
    if (heroBaseMinDistance === null && Number.isFinite(controls.minDistance)) {
      heroBaseMinDistance = controls.minDistance;
    }
    controls.minDistance = 0.1;
  }

  function restoreDistanceClamp() {
    const controls = globeInstance && globeInstance.controls();
    if (controls && heroBaseMinDistance !== null) controls.minDistance = heroBaseMinDistance;
  }

  // В follow цель орбиты — аппарат, а не центр Земли: |камера − target| ≈ 12 ед.,
  // поэтому кламп minDistance глобуса (≈ 100) оттолкнул бы камеру на сотню единиц
  // в первый же кадр. На время follow ослабляем его, исходное значение помним.
  function enterFollowClamp() {
    const controls = globeInstance && globeInstance.controls();
    if (!controls) return;
    if (heroBaseMinDistance === null && Number.isFinite(controls.minDistance)) {
      heroBaseMinDistance = controls.minDistance;
    }
    controls.minDistance = FOLLOW_MIN_DISTANCE;
  }

  // globe.gl на каждое изменение камеры сбрасывает controls.target в центр Земли
  // (держит орбиту вокруг центра). В hero target смещён к горизонту, в follow —
  // стоит на аппарате, поэтому «обнуление» глушим в обоих режимах.
  function holdCameraTarget(target) {
    if (!target || target.__heroHeld) return target;
    const nativeSetScalar = target.setScalar;
    target.setScalar = function (...args) {
      if (cameraMode.value === CAMERA_MODE_HERO || cameraMode.value === CAMERA_MODE_FOLLOW) return this;
      return nativeSetScalar.apply(this, args);
    };
    target.__heroHeld = true;
    return target;
  }

  // Мировая позиция аппарата в фокусе: getCoords() даёт координаты группы глобуса,
  // а camera/controls.target живут в мировых — переводим через satMeshGroup.
  function followSatelliteWorldPos() {
    if (!globeInstance || followSatId.value == null) return null;

    const sat = currPositions.find(p => p.id === followSatId.value);
    if (!sat) return null;

    const c = globeInstance.getCoords(sat.lat, sat.lng, sat.alt);
    followAnchor.set(c.x, c.y, c.z);
    if (satMeshGroup) {
      satMeshGroup.updateWorldMatrix(true, false);
      satMeshGroup.localToWorld(followAnchor);
    }
    return followAnchor;
  }

  // Цель орбиты = аппарат. Тогда TrackballControls вращает камеру вокруг спутника:
  // он остаётся в центре кадра, а пользователь свободно вращает и зумит.
  // Двигаем только точку опоры — позицию камеры не трогаем, никакого перелёта.
  function applyFollowOrbitAnchor() {
    if (!globeInstance || cameraMode.value !== CAMERA_MODE_FOLLOW) return;

    const pos = followSatelliteWorldPos();
    if (!pos) return;

    const controls = globeInstance.controls();
    if (!controls || !controls.target) return;

    controls.target.set(pos.x, pos.y, pos.z);
    holdCameraTarget(controls.target);
  }

  // globe.gl пересчитывает скорости контролов от высоты камеры на каждый 'change'
  // (см. FOLLOW_ROTATE_SPEED) — в follow возвращаем комфортные.
  function applyFollowControlSpeeds(controls) {
    controls.rotateSpeed = FOLLOW_ROTATE_SPEED;
    controls.zoomSpeed   = FOLLOW_ZOOM_SPEED;
  }

  function cameraPoseNow() {
    const cam = globeInstance.camera();
    const controls = globeInstance.controls();
    const look = controls && controls.target ? controls.target : ZERO_POINT;
    return {
      pos:  { x: cam.position.x, y: cam.position.y, z: cam.position.z },
      look: { x: look.x, y: look.y, z: look.z },
    };
  }

  function applyCameraPose(pos, look) {
    if (!globeInstance) return;
    const cam = globeInstance.camera();
    const controls = globeInstance.controls();
    if (controls && controls.target) {
      controls.target.set(look.x, look.y, look.z);
      holdCameraTarget(controls.target);
    }
    cam.position.set(pos.x, pos.y, pos.z);
    cam.lookAt(look.x, look.y, look.z);
  }

  // Твин камеры по дуге: направление интерполируем кватернионом (great circle),
  // радиус — линейно, lookAt — линейно. Так перелёт на другую сторону Земли
  // не проходит сквозь шар, а камера нигде не «дёргается».
  function tweenCameraTo(pos, look, duration = HERO_TWEEN_MS, onDone = null) {
    if (!globeInstance) return;
    stopCameraTween();

    const s = cameraArcScratch;
    const from = cameraPoseNow();
    s.fromPos.set(from.pos.x, from.pos.y, from.pos.z);
    s.toPos.set(pos.x, pos.y, pos.z);
    s.fromLook.set(from.look.x, from.look.y, from.look.z);
    s.toLook.set(look.x, look.y, look.z);

    if (!duration || prefersReducedMotion.value) {
      applyCameraPose(s.toPos, s.toLook);
      if (onDone) onDone();
      return;
    }

    releaseDistanceClamp();

    const fromDir = s.fromPos.clone().normalize();
    const toDir   = s.toPos.clone().normalize();
    const fromR   = s.fromPos.length();
    const toR     = s.toPos.length();
    s.arc.setFromUnitVectors(fromDir, toDir);
    s.identity.identity();

    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = cubicInOut(t);

      s.eased.slerpQuaternions(s.identity, s.arc, e);
      s.dir.copy(fromDir).applyQuaternion(s.eased);
      const radius = fromR + (toR - fromR) * e;

      applyCameraPose(
        { x: s.dir.x * radius, y: s.dir.y * radius, z: s.dir.z * radius },
        s.fromLook.clone().lerp(s.toLook, e)
      );

      if (t < 1) {
        cameraTweenId = requestAnimationFrame(step);
        return;
      }
      cameraTweenId = null;
      restoreDistanceClamp();
      if (onDone) onDone();
    };

    cameraTweenId = requestAnimationFrame(step);
    if (!tweenRafRegistered) {
      tweenRafRegistered = true;
      disposer.registerRaf(() => cameraTweenId).registerDisposer(stopCameraTween);
    }
  }

  // Регистрация твина камеры в disposer — один раз (id меняется каждый кадр).
  let tweenRafRegistered = false;

  // Поза hero-кадра: точка стояния над (HERO_LAT, HERO_LNG), наклон вперёд-вниз
  // ровно настолько, чтобы лимб оказался на HERO_HORIZON_DEG выше центра кадра.
  function heroCameraPose() {
    const surface = globeInstance.getCoords(HERO_LAT, HERO_LNG, 0);
    const camPos  = globeInstance.getCoords(HERO_LAT, HERO_LNG, HERO_ALTITUDE);

    const up = new THREE.Vector3(surface.x, surface.y, surface.z).normalize();
    // тангенциальное направление «на север» в точке стояния
    const north = globeInstance.getCoords(HERO_LAT + 1, HERO_LNG, 0);
    const tangent = new THREE.Vector3(north.x - surface.x, north.y - surface.y, north.z - surface.z).normalize();

    // депрессия лимба для данной высоты + желаемый подъём дуги над центром кадра
    const dip   = THREE.MathUtils.radToDeg(Math.acos(1 / (1 + HERO_ALTITUDE)));
    const pitch = THREE.MathUtils.degToRad(dip + HERO_HORIZON_DEG); // ниже горизонта
    const theta = Math.PI / 2 - pitch;                              // и то же от надира

    const forward = up.clone().multiplyScalar(-Math.cos(theta))
      .add(tangent.multiplyScalar(Math.sin(theta)))
      .normalize();

    // controls.minDistance ≈ 100 (globeR + near): lookAt не должен оказаться ближе,
    // иначе TrackballControls оттолкнёт камеру и кадр поедет.
    const controls = globeInstance.controls();
    const minDist = heroBaseMinDistance !== null
      ? heroBaseMinDistance
      : (controls && Number.isFinite(controls.minDistance) ? controls.minDistance : 0);
    const lookDist = Math.max(GLOBE_RADIUS * HERO_LOOK_DIST, minDist + 2);

    const look = new THREE.Vector3(camPos.x, camPos.y, camPos.z)
      .add(forward.multiplyScalar(lookDist));

    return { pos: camPos, look };
  }

  // globe.gl считает rotateSpeed от высоты камеры (altitude * 0.3). В hero высота
  // мала (~0.4 радиуса), в follow ещё меньше (~0.12), и вращение «залипает» —
  // держим комфортную скорость в обоих режимах.
  let cameraChangeHandler = null;

  function bindCameraModeControls() {
    const controls = globeInstance && globeInstance.controls();
    if (!controls || cameraChangeHandler) return;
    cameraChangeHandler = () => {
      if (cameraMode.value === CAMERA_MODE_HERO) {
        controls.rotateSpeed = HERO_ROTATE_SPEED;
        return;
      }
      if (cameraMode.value === CAMERA_MODE_FOLLOW) {
        applyFollowControlSpeeds(controls);
        // globe.gl после своего обработчика делает target.setScalar(0) — в follow
        // это уводило бы точку опоры с аппарата; держим её на спутнике.
        if (followManual) applyFollowOrbitAnchor();
      }
    };
    // dispose-контракт: 'change' снимается вместе с остальными слушателями.
    disposer.registerEventListener(controls, 'change', cameraChangeHandler);
  }

  // -----------------------------------------------------------------------
  // Hero → свободная орбита на первом взаимодействии мышью
  // -----------------------------------------------------------------------
  // В hero controls.target смещён от центра Земли к точке горизонта (это нужно
  // только самому кадру «купола»), а глушение setScalar его там удерживает.
  // Вращение мышью вокруг такой смещённой точки и даёт «мотыляние» вместо
  // вращения вокруг оси. Поэтому купол — только стартовый кадр и возврат через
  // clearFocus: первое же взаимодействие (pointerdown / wheel / touchstart, все
  // они у TrackballControls эмитят событие 'start') снимает наклон и отдаёт
  // управление обычной орбите вокруг центра.
  let heroExitHandler = null;

  function cancelHeroIntro() {
    heroIntroActive = false;
    if (heroIntroTimer) { clearTimeout(heroIntroTimer); heroIntroTimer = null; }
  }

  // Выход из hero в свободную орбиту. Позиция камеры не меняется — только цель
  // орбиты переезжает в центр Земли и взгляд доворачивается на него. Ориентацию
  // доворачиваем одним кадром, без анимации: TrackballControls на каждом
  // изменении сам делает camera.lookAt(controls.target), так что любой наш твин
  // взгляда дрался бы с ним и давал бы дрожание — а так это единственная мелкая
  // доводка в момент начала жеста, дальше камера полностью у контролов.
  function enterFreeOrbit() {
    if (!globeInstance || cameraMode.value !== CAMERA_MODE_HERO) return;

    stopCameraTween();
    restoreDistanceClamp();

    // режим меняем ДО правки target: holdCameraTarget глушит setScalar только
    // в hero, после этого globe.gl снова сам держит target в центре
    cameraMode.value = CAMERA_MODE_FREE;

    const controls = globeInstance.controls();
    if (controls) {
      controls.zoomToCursor = true;           // штатное поведение globe.gl
      if (controls.target) controls.target.set(0, 0, 0);
    }
    globeInstance.camera().lookAt(0, 0, 0);
  }

  function bindHeroExitHandler() {
    const controls = globeInstance && globeInstance.controls();
    if (!controls || heroExitHandler) return;
    heroExitHandler = () => {
      if (cameraMode.value !== CAMERA_MODE_HERO) return;
      cancelHeroIntro();   // юзер перехватил камеру — стартовый заезд не нужен
      enterFreeOrbit();
    };
    // 'start' TrackballControls шлёт на pointerdown, wheel и touchstart —
    // этого достаточно, отдельные DOM-listener'ы не нужны.
    disposer.registerEventListener(controls, 'start', heroExitHandler);
  }

  // -----------------------------------------------------------------------
  // Follow → ручное управление на первом взаимодействии мышью
  // -----------------------------------------------------------------------
  // В follow камеру каждую секунду подтягивал trackFocusedSatellite() через
  // pointOfView — то есть камера всегда была в принудительном полёте, и любое
  // вращение мышью отменялось следующим тиком («намертво прикреплена»).
  // Первый же жест (первый 'start' контролов: pointerdown / wheel / touchstart)
  // отдаёт камеру пользователю: авто-слежение выключается до следующего фокуса,
  // а цель орбиты переезжает на аппарат, чтобы он остался в центре кадра.
  function bindFollowStartHandler() {
    const controls = globeInstance && globeInstance.controls();
    if (!controls || followStartHandler) return;

    followStartHandler = () => {
      if (cameraMode.value !== CAMERA_MODE_FOLLOW) return;

      if (!followManual) {
        followManual = true;
        stopCameraTween();
        // цель орбиты — аппарат в 12 ед. от камеры: кламп глобуса здесь только мешает
        enterFollowClamp();
        applyFollowControlSpeeds(controls);
      }
      applyFollowOrbitAnchor();
    };

    disposer.registerEventListener(controls, 'start', followStartHandler);
  }

  // pointOfView анимирует камеру своим tween-группом, который нам недоступен:
  // если запустить свой твин, пока предыдущий перелёт ещё идёт, две анимации
  // начнут драться за camera.position/target. Поэтому новые перелёты ставим в
  // очередь «после текущего».
  let settleTimer = null;

  function afterCameraSettle(fn) {
    const wait = Math.max(0, cameraSettleUntil - performance.now());
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
    if (wait <= 0) { fn(); return; }
    settleTimer = setTimeout(() => { settleTimer = null; fn(); }, wait + 20);
    if (!settleRegistered) {
      settleRegistered = true;
      disposer.registerTimer(() => settleTimer);
    }
  }

  // Регистрация отложенного перелёта в disposer — один раз.
  let settleRegistered = false;

  function enterHeroMode(duration = HERO_TWEEN_MS) {
    if (!globeInstance) return;

    const effDuration = prefersReducedMotion.value ? 0 : duration;

    // фокус снят: авто-слежение больше не перебивает камеру
    followSatId.value = null;
    followManual = false;
    focusTarget.value = null;
    selectedSatellite.value = null;

    afterCameraSettle(() => {
      if (!globeInstance) return;
      cameraMode.value = CAMERA_MODE_HERO;

      const controls = globeInstance.controls();
      if (controls) {
        controls.zoomToCursor = false; // иначе зум уводит target от горизонта
        controls.rotateSpeed  = HERO_ROTATE_SPEED;
      }

      const { pos, look } = heroCameraPose();
      tweenCameraTo(pos, look, effDuration);
    });
  }

  // follow: камера встаёт над подспутниковой точкой на реальной высоте аппарата
  // (sat.alt — доля радиуса Земли из computePositions, LEO ≈ 0.1 … GEO ≈ 5.6).
  function followAltitude(satAlt) {
    const a = Number.isFinite(satAlt) ? Math.max(satAlt, 0) : 0.1;
    return a + FOLLOW_ALT_PAD;
  }

  function enterFollowMode(sat, duration = FOLLOW_TWEEN_MS) {
    if (!globeInstance || !sat) return;

    cancelHeroIntro();   // фокус на аппарате отменяет стартовый заезд в «купол»
    const effDuration = prefersReducedMotion.value ? 0 : duration;

    afterCameraSettle(() => {
      if (!globeInstance) return;

      // штатный перелёт к аппарату; камера приходит уже «прямо» (см. ниже)
      const flyTo = () => {
        if (!globeInstance) return;
        cameraMode.value  = CAMERA_MODE_FOLLOW;
        followSatId.value = sat.id ?? null;
        // новый фокус = новый цикл авто-слежения: ручное управление сбрасывается
        followManual      = false;
        cameraSettleUntil = performance.now() + effDuration;

        const controls = globeInstance.controls();
        if (controls) controls.zoomToCursor = true;

        globeInstance.pointOfView(
          { lat: sat.lat, lng: sat.lng, altitude: followAltitude(sat.alt) },
          effDuration
        );
      };

      // Из hero взгляд наклонён к горизонту, а pointOfView целится в центр Земли:
      // сначала короткий доворот на центр (иначе в первом кадре будет рывок),
      // затем сам перелёт к аппарату.
      const { pos, look } = cameraPoseNow();
      const centred = look.x === 0 && look.y === 0 && look.z === 0;
      if (centred || prefersReducedMotion.value) {
        flyTo();
        return;
      }

      cameraSettleUntil = performance.now() + HERO_CENTRE_MS;
      tweenCameraTo(pos, ZERO_POINT, HERO_CENTRE_MS, flyTo);
    });
  }

  // Слежение: раз в секунду (вместе с пересчётом позиций) подтягиваем камеру к
  // аппарату — но ТОЛЬКО пока пользователь не взял управление. После первого жеста
  // камеру не трогаем совсем (никакого pointOfView): двигаем лишь цель орбиты,
  // чтобы спутник оставался в центре кадра при свободном вращении мышью.
  function trackFocusedSatellite() {
    if (!globeInstance || cameraMode.value !== CAMERA_MODE_FOLLOW) return;
    if (followSatId.value == null) return;

    if (followManual) {
      applyFollowOrbitAnchor();
      return;
    }

    if (performance.now() < cameraSettleUntil) return;

    const sat = currPositions.find(p => p.id === followSatId.value);
    if (!sat) return;

    if (selectedSatellite.value && selectedSatellite.value.id === sat.id) {
      selectedSatellite.value.lat = sat.lat;
      selectedSatellite.value.lng = sat.lng;
      selectedSatellite.value.alt = sat.alt;
      selectedSatellite.value.altKm = sat.alt != null ? sat.alt * 6371 : null;
    }

    const pov  = globeInstance.pointOfView();
    const base = followAltitude(sat.alt);
    const zoom = Number.isFinite(pov.altitude) ? Math.min(pov.altitude, FOLLOW_MAX_ALT) : base;

    const effTrackDuration = prefersReducedMotion.value ? 0 : TRACK_TWEEN_MS;
    globeInstance.pointOfView(
      { lat: sat.lat, lng: sat.lng, altitude: Math.max(base, zoom) },
      effTrackDuration
    );
  }


  // -----------------------------------------------------------------------
  // Фильтры и фокусировка
  // -----------------------------------------------------------------------
  function setFilter(cat) {
    activeFilter.value = cat;
    satPositions.value = [];
    allSatellites = [];
    fetchData();
  }

  function focusSatellite(sat) {
    if (!sat) return;
    focusTarget.value = sat.name || focusTarget.value;

    const full = allSatellites.find(s => s.id === sat.id)
      || allSatellites.find(s => s.catalogNumber != null && String(s.catalogNumber) === String(sat.catalogNumber || sat.catalog_number))
      || sat;

    selectedSatellite.value = {
      ...full,
      lat: sat.lat ?? full.lat,
      lng: sat.lng ?? full.lng,
      alt: sat.alt ?? full.alt,
      altKm: sat.alt != null ? sat.alt * 6371 : (full.alt != null ? full.alt * 6371 : null),
    };

    buildOrbitLines(sat); // F4: орбита + наземный трек в фокусе
    enterFollowMode(sat);
  }

  function focusByCatalogNumber(catalogNumber) {
    const sat = satPositions.value.find(
      p => p.catalogNumber != null && String(p.catalogNumber) === String(catalogNumber)
    ) || allSatellites.find(
      s => s.catalogNumber != null && String(s.catalogNumber) === String(catalogNumber)
    );
    if (!sat) return;
    focusTarget.value = sat.name;
    focusSatellite(sat);
  }

  // Снятие фокуса — возврат в hero-режим («обзор»), тоже плавным твином.
  function clearFocus() {
    selectedSatellite.value = null;
    focusTarget.value = null;
    disposeOrbitLines(); // F4: линии живут только пока есть фокус
    enterHeroMode();
  }


  onMounted(async () => {
    checkReducedMotion();
    const motionQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (motionQuery) {
      const onMotionChange = (e) => {
        prefersReducedMotion.value = e.matches;
      };
      if (typeof motionQuery.addEventListener === 'function') {
        motionQuery.addEventListener('change', onMotionChange);
        disposer.registerDisposer(() => motionQuery.removeEventListener('change', onMotionChange));
      } else if (typeof motionQuery.addListener === 'function') {
        motionQuery.addListener(onMotionChange);
        disposer.registerDisposer(() => motionQuery.removeListener(onMotionChange));
      }
    }

    initGlobe();

    clockInterval = setInterval(() => {
      utcTime.value = new Date().toISOString().split('T')[1].split('.')[0] + ' UTC';
    }, 1000);
    disposer.registerTimer(() => clockInterval);

    await fetchData();
  });

  // -----------------------------------------------------------------------
  // Размонтирование: единый детерминированный teardown (Спринт 4)
  // -----------------------------------------------------------------------
  // Порядок важен и намеренно НЕ отдан целиком disposer'у:
  //   1. останавливаем собственные циклы (глобус рендерит сам через свой rAF,
  //      поэтому его цикл тоже надо остановить до освобождения сцены);
  //   2. снимаем с globe.gl наши пассы/контролы и отвязываем камеру;
  //   3. отдаём управление disposeAll(): воркеры → слои → слушатели → rAF/таймеры
  //      → обход сцены → composer → controls → renderer.dispose + forceContextLoss.
  // Удаление DOM (innerHTML = '') делаем последним: обход сцены и release
  // контекста должны произойти, пока canvas ещё в документе.
  onBeforeUnmount(() => {
    // 1. Собственные циклы компонента.
    stopCameraTween();
    if (heroIntroTimer) { clearTimeout(heroIntroTimer); heroIntroTimer = null; }
    if (settleTimer)    { clearTimeout(settleTimer);    settleTimer = null; }
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
    if (rafId)          { cancelAnimationFrame(rafId); rafId = null; }
    if (clockInterval)  { clearInterval(clockInterval); clockInterval = null; }
    if (sunInterval)    { clearInterval(sunInterval);   sunInterval = null; }
    if (pickHoverRaf)   { cancelAnimationFrame(pickHoverRaf); pickHoverRaf = 0; }

    // 2. Останавливаем рендер-цикл globe.gl до освобождения ресурсов: иначе
    //    следующий кадр может обратиться к уже диспоузнутым буферам.
    if (globeInstance) {
      try {
        if (typeof globeInstance.pauseAnimation === 'function') globeInstance.pauseAnimation();
      } catch (e) {
        console.warn('[globe] pauseAnimation failed:', e);
      }
    }

    cameraChangeHandler = null;
    heroExitHandler = null;
    followStartHandler = null;
    unbindSatellitePicking(); // снимает hover-состояние; сами listener'ы — в disposer

    // 3. Единая очистка GPU-ресурсов, воркера, слушателей, таймеров и контекста.
    const targets = {
      scene:    globeInstance ? globeInstance.scene()    : null,
      renderer: globeInstance ? globeInstance.renderer() : null,
      controls: globeInstance ? globeInstance.controls() : null,
    };

    // _destructor() three-globe/three-render-objects обнуляет внутренние объекты
    // глобуса (globeObj, tileEngine, graticules). Вызываем ПОСЛЕ disposeAll:
    // он работает с ещё живым объектом, а не с обнулёнными ссылками.
    try {
      disposer.disposeAll(targets);
    } finally {
      // Ресурсы компонента, которые не являются частью графа сцены.
      satMeshGroup = null;
      if (globeInstance && typeof globeInstance._destructor === 'function') {
        try {
          globeInstance._destructor();
        } catch (e) {
          console.warn('[globe] _destructor failed:', e);
        }
      }
      if (globeContainer.value) globeContainer.value.innerHTML = '';
      globeInstance = null;
    }
  });

  return {
    globeContainer,
    loading,
    activeFilter,
    satPositions,
    focusTarget,
    selectedSatellite,
    utcTime,
    webglSupported,
    hoverSat,
    debugStats,
    getCategoryColor,
    retryInitGlobe,
    setFilter,
    focusSatellite,
    focusByCatalogNumber,
    clearFocus,
    fetchData,
  };
}
