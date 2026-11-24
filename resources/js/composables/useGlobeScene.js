import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import axios from 'axios';
import Globe from 'globe.gl';
import * as satellite from 'satellite.js';
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { sgp4WorkerClient } from '@/lib/sgp4WorkerClient';
import { useGlobeDisposer } from '@/lib/globe/useGlobeDisposer';
import { createSilhouetteHull } from '@/lib/globe/silhouette';
import { createCountryBorders } from '@/lib/globe/borders';
import { createTerminator } from '@/lib/globe/terminator';
import { createGlyphLayer } from '@/lib/globe/glyphLayer';
import { useLayersStore } from '@/stores/useLayersStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useViewStore } from '@/stores/useViewStore';

export function useGlobeScene(options = {}) {
  const globeContainer = options.globeContainer ?? ref(null);
  const loading = options.loading ?? ref(true);
  const activeFilter = options.activeFilter ?? ref('ALL');
  const satPositions = options.satPositions ?? ref([]);
  const focusTarget = options.focusTarget ?? ref(null);
  const selectedSatellite = options.selectedSatellite ?? ref(null);
  const layersStore = options.layersStore ?? useLayersStore();
  const selectionStore = options.selectionStore ?? useSelectionStore();
  const viewStore = options.viewStore ?? useViewStore();

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

  const GLOBE_RADIUS      = 100;   // радиус three-globe в мировых единицах
  const SAT_EARTH_LIMB_R2 = (GLOBE_RADIUS * 0.995) * (GLOBE_RADIUS * 0.995);

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
  // Глиф-слой спутников (D3: THREE.Points + атлас 8 категорий, 1 draw call)
  // -----------------------------------------------------------------------
  let glyphLayer       = null;
  let satMeshGroup     = null;  // вращающаяся группа three-globe (родитель земного шара)
  let hoveredSatId     = null;  // id аппарата под курсором

  // Счётчики кадра под debug-HUD (?debug=1)
  const satStats = { total: 0, near: 0, points: 0, culledFrustum: 0, culledLimb: 0 };

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

  function disposeSatelliteMesh() {
    if (glyphLayer) {
      glyphLayer.dispose();
      glyphLayer = null;
    }
  }

  function updateSatelliteMesh(sats) {
    satStats.total = sats ? sats.length : 0;
    if (!globeInstance) return;

    if (!glyphLayer) {
      if (satMeshGroup) {
        init1BitScene();
      }
      if (!glyphLayer) return;
    }

    const camera = globeInstance.camera();
    if (!camera) return;

    const selectedId = selectedSatellite.value
      ? (selectedSatellite.value.catalog_number ?? selectedSatellite.value.id)
      : (selectionStore && selectionStore.selectedId ? selectionStore.selectedId : null);

    const stats = glyphLayer.update(sats, {
      camera,
      activeFilter: activeFilter.value,
      selectedSatId: selectedId,
      hoveredSatId,
    });

    satStats.near = stats.visible;
    satStats.points = 0;
    satStats.culledFrustum = stats.culledFrustum;
    satStats.culledLimb = stats.culledLimb;
  }

  // -----------------------------------------------------------------------
  // Пикинг спутников (D3: Raycaster по THREE.Points с порогом 10px)
  // -----------------------------------------------------------------------
  const CLICK_MAX_MOVE_PX = 6;    // сдвиг больше — это вращение камеры, а не клик
  const CLICK_MAX_MS      = 500;  // долгий жест — тоже не клик
  const CLICK_DEBOUNCE_MS = 350;  // защита от двойного срабатывания

  const hoverSat = ref(null); // HUD-подпись под курсором: { name, x, y, flip }

  let pickPointer     = null;  // последняя позиция курсора (client-координаты)
  let pickHoverRaf    = 0;     // троттлинг наведения до одного пика за кадр
  let pickGesture     = null;  // pointerdown: база для отличения клика от драга
  let pickLastClickAt = 0;
  const pickBindings  = { bound: false };

  /**
   * Пикинг спутника по экранной точке (делегируется в glyphLayer.pick с порогом 10px).
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{ sat: object }|null}
   */
  function pickSatelliteAt(clientX, clientY) {
    if (!globeInstance || !glyphLayer) return null;
    const el = globeContainer.value;
    if (!el) return null;
    const camera = globeInstance.camera();
    if (!camera) return null;

    const hit = glyphLayer.pick(clientX, clientY, camera, el);
    return hit ? { sat: hit.sat, index: hit.index } : null;
  }

  function refreshHover() {
    if (!pickPointer || !globeInstance || !glyphLayer) return;

    const el = globeContainer.value;
    const hit = pickSatelliteAt(pickPointer.x, pickPointer.y);

    hoveredSatId = hit ? (hit.sat.id ?? null) : null;
    const selectedId = selectedSatellite.value
      ? (selectedSatellite.value.catalog_number ?? selectedSatellite.value.id)
      : (selectionStore && selectionStore.selectedId ? selectionStore.selectedId : null);

    glyphLayer.setHoveredIndex(hit ? hit.index : -1, selectedId);

    if (!hit || !el) {
      hoverSat.value = null;
      if (el) el.style.cursor = 'default';
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
    el.style.cursor = 'crosshair';
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
    if (glyphLayer) {
      const selectedId = selectedSatellite.value
        ? (selectedSatellite.value.catalog_number ?? selectedSatellite.value.id)
        : (selectionStore && selectionStore.selectedId ? selectionStore.selectedId : null);
      glyphLayer.setHoveredIndex(-1, selectedId);
    }
    if (globeContainer.value) globeContainer.value.style.cursor = 'default';
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
    if (selectionStore && typeof selectionStore.select === 'function') {
      selectionStore.select(hit.sat);
    }
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

      await refreshPositions();
    } catch (e) {
      console.error('Failed to fetch satellites:', e);
    } finally {
      loading.value = false;
      startAnimation();
    }
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
      if (!scene1BitInited) {
        init1BitScene();
      }
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
  // 1-битная сцена (Стадия D1/D2): бумага #F4F1EA, терминатор Bayer 4×4, силуэт, границы 110m
  // -----------------------------------------------------------------------
  let paperMaterial      = null;
  let terminatorInstance = null;
  let silhouetteHullMesh = null;
  let countryBordersMesh = null;
  let scene1BitInited    = false;

  // Меш земного шара three-globe (Group __globeObjType === 'globe' → дочерний Mesh).
  function findGlobeMesh() {
    if (!globeInstance) return null;
    let mesh = null;
    globeInstance.scene().traverse(obj => {
      if (!mesh && obj.isMesh && obj.parent && obj.parent.__globeObjType === 'globe') {
        mesh = obj;
      }
    });
    if (!mesh) {
      let globeGroup = null;
      globeInstance.scene().traverse(o => {
        if (!globeGroup && o.__globeObjType === 'globe') globeGroup = o;
      });
      if (globeGroup) mesh = globeGroup.children.find(c => c.isMesh) || null;
    }
    return mesh;
  }

  // Гашение встроенного освещения three-globe для плоской 1-битной сцены.
  function extinguishLights(root) {
    if (!root || typeof root.traverse !== 'function') return;
    root.traverse(obj => {
      if (obj.isLight) {
        obj.intensity = 0;
        obj.visible = false;
      }
    });
  }

  // Субсолнечная точка по UTC: сохраняем для Стадии D2 (Bayer 4×4 терминатор).
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

  function sunDirectionFromGeo(lat, lng) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    const phiSin = Math.sin(phi);
    return new THREE.Vector3(
      phiSin * Math.cos(theta),
      Math.cos(phi),
      phiSin * Math.sin(theta)
    );
  }

  function init1BitScene() {
    if (!globeInstance) return;

    // 1. Бумажная сфера с терминатором дня/ночи (Bayer 4×4 ordered dithering, D2)
    if (!terminatorInstance) {
      terminatorInstance = createTerminator(globeInstance, {
        enabled: layersStore.terminator,
      });
      disposer.registerMaterial(terminatorInstance.material);
      disposer.registerTimer(() => (terminatorInstance ? terminatorInstance.timer : null));
      disposer.registerDisposer(() => {
        if (terminatorInstance) {
          terminatorInstance.dispose();
          terminatorInstance = null;
        }
      });
    }

    const currentMaterial = terminatorInstance ? terminatorInstance.material : null;
    if (currentMaterial) {
      if (typeof globeInstance.globeMaterial === 'function') {
        globeInstance.globeMaterial(currentMaterial);
      }
      const globeMesh = findGlobeMesh();
      if (globeMesh) {
        globeMesh.material = currentMaterial;
      }
    }

    // Гашение источников света
    if (typeof globeInstance.lights === 'function') {
      globeInstance.lights([]);
    }
    extinguishLights(globeInstance.scene());
    if (globeInstance.scene().parent) {
      extinguishLights(globeInstance.scene().parent);
    }

    if (scene1BitInited) return;

    if (!satMeshGroup) {
      satMeshGroup = resolveSatMeshGroup();
    }
    const targetGroup = satMeshGroup;
    if (!targetGroup) return;

    // 2. Силуэт: инвертированный hull (BackSide, #0E0E0E, R = 100 * 1.008)
    const hull = createSilhouetteHull(GLOBE_RADIUS);
    silhouetteHullMesh = hull.hullMesh;
    targetGroup.add(silhouetteHullMesh);
    disposer.registerMesh(hull.hullMesh)
            .registerGeometry(hull.hullGeom)
            .registerMaterial(hull.hullMat);

    // 3. Границы стран Natural Earth 110m (LineSegments #0E0E0E, depthTest)
    const borders = createCountryBorders(globeInstance);
    if (borders) {
      countryBordersMesh = borders.borderMesh;
      targetGroup.add(countryBordersMesh);
      disposer.registerMesh(borders.borderMesh)
              .registerGeometry(borders.borderGeom)
              .registerMaterial(borders.borderMat);
    }

    // 4. Глиф-слой спутников (THREE.Points, 1 draw call, атлас 8 категорий)
    if (!glyphLayer) {
      glyphLayer = createGlyphLayer({
        globeInstance,
        targetGroup,
        disposer,
        globeRadius: GLOBE_RADIUS,
        viewStore,
      });
    } else {
      glyphLayer.setTargetGroup(targetGroup);
    }

    // Реактивное переключение слоя терминатора по флагу useLayersStore
    const unwatchTerminator = watch(
      () => layersStore.terminator,
      (enabled) => {
        if (terminatorInstance) {
          terminatorInstance.setEnabled(enabled);
        }
      },
    );
    disposer.registerDisposer(unwatchTerminator);

    disposer.registerDisposer(dispose1BitScene);
    scene1BitInited = true;
  }

  function dispose1BitScene() {
    if (glyphLayer) {
      glyphLayer.dispose();
      glyphLayer = null;
    }
    if (terminatorInstance) {
      terminatorInstance.dispose();
      terminatorInstance = null;
    }
    if (silhouetteHullMesh) {
      if (silhouetteHullMesh.parent) silhouetteHullMesh.parent.remove(silhouetteHullMesh);
      silhouetteHullMesh = null;
    }
    if (countryBordersMesh) {
      if (countryBordersMesh.parent) countryBordersMesh.parent.remove(countryBordersMesh);
      countryBordersMesh = null;
    }
    paperMaterial = null;
    scene1BitInited = false;
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
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(false)
      .showGraticules(false)
      .globeImageUrl(null)
      .bumpImageUrl(null)
      .backgroundImageUrl(null)
      .lights([])
      .onGlobeReady(() => {
        satMeshGroup = resolveSatMeshGroup();
        init1BitScene();
      });

    satMeshGroup = resolveSatMeshGroup();
    init1BitScene();

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

    try {
      initGlobe();
    } catch (err) {
      console.error('[globe] initGlobe error:', err);
    }

    clockInterval = setInterval(() => {
      utcTime.value = new Date().toISOString().split('T')[1].split('.')[0] + ' UTC';
    }, 1000);
    disposer.registerTimer(() => clockInterval);

    try {
      await fetchData();
    } catch (err) {
      console.error('[globe] fetchData error:', err);
    }
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
    layersStore,
    terminator: terminatorInstance,
    glyphLayer,
  };
}
