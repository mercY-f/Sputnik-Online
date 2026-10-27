<template>
  <MissionShell :object-count="satPositions.length" class="h-screen overflow-hidden">
    <div class="hero-main">
      <div class="globe-area">
        <!-- Focus indicator (glass overlay above the globe) -->
        <div v-if="focusTarget" class="focus-indicator">
          <span class="focus-dot"></span>
          <span class="focus-label">◎ FOCUS — {{ focusTarget }}</span>
          <button class="focus-close" title="Clear focus" @click="clearFocus">✕</button>
        </div>

        <!-- Floating open button (when sidebar is closed) -->
        <button
          v-if="!sidebarOpen"
          @click="sidebarOpen = true"
          class="floating-btn"
          title="Open Panel"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>

        <!-- Sidebar Panel -->
        <aside class="sidebar" :class="{ open: sidebarOpen }">
          <div class="sidebar-header">
            <h1>Earth Orbit Live</h1>
            <button @click="sidebarOpen = false" class="close-btn" title="Close Panel">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          </div>

          <!-- Auth Navigation Overlay for Sidebar -->
          <div class="auth-nav">
            <template v-if="user">
              <div class="user-greeting">Welcome, {{ user.name }}</div>
              <div class="auth-links">
                <Link :href="route('dashboard')" class="auth-btn">Dashboard</Link>
                <Link v-if="user.role?.name === 'admin'" :href="route('admin.dashboard')" class="auth-btn">Admin</Link>
                <Link :href="route('profile.edit')" class="auth-btn outline">Profile</Link>
              </div>
            </template>
            <template v-else>
              <div class="auth-links">
                <Link :href="route('login')" class="auth-btn">Log in</Link>
                <Link :href="route('register')" class="auth-btn outline">Register</Link>
              </div>
            </template>
          </div>

          <!-- Loading state -->
          <div v-if="loading" class="loading-state">
            <span class="spinner"></span>
            <p>Acquiring satellite telemetry...</p>
          </div>

          <template v-else>
            <!-- Stats -->
            <div class="stats-block">
              <div class="stat-row">
                <span class="stat-label">Tracked Objects</span>
                <span class="stat-value emerald">{{ satPositions.length.toLocaleString() }}</span>
              </div>
              <div class="stat-row mt-1">
                <span class="stat-label">System Time</span>
                <span class="stat-value mono">{{ utcTime }}</span>
              </div>
            </div>

            <!-- Category filters -->
            <div class="filter-block">
              <span class="block-label">Filter Constellation</span>
              <div class="category-tags">
                <button
                  v-for="cat in availableCategories"
                  :key="cat"
                  @click="setFilter(cat)"
                  class="cat-tag"
                  :class="{ active: activeFilter === cat }"
                >
                  {{ cat }}
                </button>
              </div>
            </div>

            <!-- Satellite List -->
            <div class="sat-list-block">
              <span class="block-label">Satellite List{{ satPositions.length > 100 ? ' (Top 100)' : '' }}</span>
              <div class="sat-list">
                <div
                  v-for="sat in satPositions.slice(0, 100)"
                  :key="sat.id || sat.name"
                  class="sat-row-container"
                >
                  <button
                    @click="focusSatellite(sat)"
                    class="sat-row"
                  >
                    <span class="sat-dot" :style="{ backgroundColor: getCategoryColor(sat.category) }"></span>
                    <span class="sat-name">{{ sat.name }}</span>
                  </button>
                  <button v-if="user" @click="toggleFavorite(sat)" class="fav-btn" :class="{ isFav: isFavorite(sat) }" title="Toggle Favorite">
                    ★
                  </button>
                </div>
              </div>
            </div>
          </template>
        </aside>

        <!-- Globe Container -->
        <div ref="globeContainer" class="globe-container"></div>
      </div>

      <section class="news-area">
        <NewsFeed
          :items="news"
          @focus="focusByCatalogNumber"
        />
      </section>
    </div>
  </MissionShell>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { Link, usePage } from '@inertiajs/vue3';
import axios from 'axios';
import Globe from 'globe.gl';
import * as satellite from 'satellite.js';
import * as THREE from 'three';
import { MissionShell, NewsFeed } from '@/components/mission';
import { news } from '@/data/news';

const page = usePage();
const user = computed(() => page.props.auth.user);

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

const CATEGORIES_ORDER = ['ALL', 'ISS', 'STARLINK', 'ONEWEB', 'IRIDIUM', 'NAVIGATION', 'WEATHER', 'TELESCOPE', 'OTHER'];

function getCategoryColor(cat) {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.OTHER;
}

// -----------------------------------------------------------------------
// Реактивное состояние
// -----------------------------------------------------------------------
const globeContainer = ref(null);
const loading        = ref(true);
const sidebarOpen    = ref(true);
const activeFilter   = ref('ALL');
const satPositions   = ref([]);
const focusTarget    = ref(null);
const utcTime        = ref('');
const availableCategories = ref(['ALL']);
const userFavorites  = ref([]);

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
// InstancedMesh-слой спутников
// -----------------------------------------------------------------------
// three-globe строит Points как «пины» (CylinderGeometry) на поверхности и
// масштабирует их по scale.z = pointAltitude * GLOBE_RADIUS. Т.е. pointAltitude —
// высота пина, а НЕ радиальная высота. Поэтому спутники рисуем своим
// THREE.InstancedMesh и позиционируем через globeInstance.getCoords(lat, lng, alt),
// где alt — доля радиуса (km / 6371): r = 100 * (1 + alt).
const SAT_SPHERE_RADIUS = 0.45; // мировые единицы (радиус глобуса = 100)
const SAT_ISS_SCALE     = 1.35;

let satMesh          = null;
let satMeshGroup     = null;  // вращающаяся группа three-globe (родитель земного шара)
let satMeshCapacity  = -1;
let satColorCache    = [];
let satColorScratch  = null;
const satDummy       = new THREE.Object3D();

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
  if (!satMesh) { satMeshCapacity = -1; satColorCache = []; return; }
  if (satMesh.parent) satMesh.parent.remove(satMesh);
  if (typeof satMesh.dispose === 'function') satMesh.dispose(); // instance-буферы
  if (satMesh.geometry) satMesh.geometry.dispose();
  if (satMesh.material) satMesh.material.dispose();
  satMesh = null;
  satMeshCapacity = -1;
  satColorCache = [];
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
  satMeshGroup.add(satMesh);

  satMeshCapacity = count;
  satColorCache = new Array(count).fill(null);
  satColorScratch = satColorScratch || new THREE.Color();

  return satMesh;
}

function updateSatelliteMesh(sats) {
  const mesh = ensureSatelliteMesh(sats.length);
  if (!mesh) return;

  satColorScratch = satColorScratch || new THREE.Color();
  let colorsDirty = false;

  for (let i = 0; i < sats.length; i++) {
    const sat = sats[i];

    // Истинная радиальная высота: alt — доля радиуса Земли (gd.height / 6371)
    const pos = globeInstance.getCoords(sat.lat, sat.lng, sat.alt);
    satDummy.position.set(pos.x, pos.y, pos.z);
    satDummy.scale.setScalar(sat.category === 'ISS' ? SAT_ISS_SCALE : 1);
    satDummy.updateMatrix();
    mesh.setMatrixAt(i, satDummy.matrix);

    const hex = getCategoryColor(sat.category);
    if (satColorCache[i] !== hex) {
      satColorScratch.set(hex);
      mesh.setColorAt(i, satColorScratch);
      satColorCache[i] = hex;
      colorsDirty = true;
    }
  }

  mesh.count = sats.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (colorsDirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
          return { id: sat.id, name: sat.name, category: sat.category, catalogNumber: sat.catalog_number ?? null, satrec };
        } catch { return null; }
      })
      .filter(Boolean);

  } catch (e) {
    console.error('Failed to fetch satellites:', e);
  }
  loading.value = false;
  startAnimation();
}

async function fetchCategories() {
  try {
    const res  = await axios.get('/api/satellite-categories');
    const data = res.data;

    // Определяем доступные фильтры на основе полученных данных
    const found = CATEGORIES_ORDER.filter(c => c === 'ALL' || data[c] !== undefined);
    
    if (user.value) {
      found.push('FAVORITES');
    }
    
    availableCategories.value = found.length > 1 ? found : ['ALL'];

    // Если выбранного фильтра нет в списке, сбрасываем на ALL
    if (!availableCategories.value.includes(activeFilter.value)) {
        activeFilter.value = 'ALL';
    }
  } catch {}
}

async function fetchFavorites() {
  if (!user.value) return;
  try {
    const res = await axios.get('/api/user/favorites');
    userFavorites.value = res.data.favorites.map(f => f.id);
  } catch (e) {
    console.error('Failed to fetch favorites', e);
  }
}

function isFavorite(sat) {
  return userFavorites.value.includes(sat.id);
}

async function toggleFavorite(sat) {
  if (!user.value) return;
  
  const isFav = isFavorite(sat);
  // Оптимистичное обновление UI
  if (isFav) {
    userFavorites.value = userFavorites.value.filter(id => id !== sat.id);
  } else {
    userFavorites.value.push(sat.id);
  }

  try {
    await axios.post(`/api/user/favorites/${sat.id}/toggle`);
  } catch (e) {
    console.error('Failed to toggle favorite', e);
    // Откат в случае ошибки
    if (isFav) userFavorites.value.push(sat.id);
    else userFavorites.value = userFavorites.value.filter(id => id !== sat.id);
  }
}

// -----------------------------------------------------------------------
// Анимация и расчет координат (satellite.js)
// -----------------------------------------------------------------------
function computePositions(now) {
  const positions = [];

  for (const sat of allSatellites) {
    try {
      const pv   = satellite.propagate(sat.satrec, now);
      const pos  = pv.position;
      if (typeof pos === 'boolean') continue;

      const gmst = satellite.gstime(now);
      const gd   = satellite.eciToGeodetic(pos, gmst);

      positions.push({
        id:       sat.id,
        name:     sat.name,
        category: sat.category,
        catalogNumber: sat.catalogNumber,
        lat:  satellite.degreesLat(gd.latitude),
        lng:  satellite.degreesLong(gd.longitude),
        alt:  gd.height / 6371,
      });
    } catch {}
  }

  return positions;
}

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

function refreshPositions() {
  const now = new Date();

  if (currPositions.length) prevPositions = currPositions;
  currPositions = computePositions(now);
  if (!prevPositions.length) prevPositions = currPositions;

  lastRefreshTime = now.getTime();
  satPositions.value = currPositions;

  // follow-режим: раз в секунду подтягиваем камеру к выбранному аппарату
  trackFocusedSatellite();
}

function renderFrame() {
  const t = Math.min(1, (Date.now() - lastRefreshTime) / 1000);

  if (globeInstance) {
    // TODO: hover tooltip (раньше — .pointLabel с ALT/LAT/LNG); отложено, чтобы не
    // тащить в PR raycasting/HTML-overlay. Данные (name/alt/lat/lng) уже есть в sats.
    updateSatelliteMesh(interpolatePositions(prevPositions, currPositions, t));
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
}

// -----------------------------------------------------------------------
// F2: астрономический терминатор + огни городов
// -----------------------------------------------------------------------
// Освещение глобуса привязано к реальному положению Солнца на текущий UTC-момент.
// Считаем субсолнечную точку (широта = склонение Солнца, долгота = 15°·(UTC−12)),
// переводим её в единичный вектор sunDirection в системе координат глобуса и
// сравниваем его с нормалью в вершинном/фрагментном шейдере: день — Blue Marble,
// ночь — Black Marble (огни городов) с мягкой полосой терминатора.
const DAY_TEXTURE_URL   = '/textures/earth-blue-marble.jpg';
const NIGHT_TEXTURE_URL = '/textures/earth-night.jpg';
const BUMP_TEXTURE_URL  = '/textures/earth-topology.png';

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

  // День: диффуз с затенением к лимбу. Ночь: едва различимая суша + огни городов.
  vec3 daySide   = dayColor * (0.22 + 0.88 * clamp(sunDot, 0.0, 1.0));
  vec3 nightSide = dayColor * 0.03 + nightColor * nightColor * nightIntensity;

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
    nightIntensity:      { value: 2.2 },
    bumpTexel:           { value: new THREE.Vector2(1 / 2048, 1 / 1024) },
  };

  globeDayNightMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: TERMINATOR_VERT,
    fragmentShader: TERMINATOR_FRAG,
  });

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
    sunTextures.day = tex;
    uniforms.dayMap.value = tex;
  });

  loader.load(NIGHT_TEXTURE_URL, tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    sunTextures.night = tex;
    uniforms.nightMap.value = tex;
  });

  loader.load(BUMP_TEXTURE_URL, tex => {
    tex.colorSpace = THREE.NoColorSpace;
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
// Инициализация глобуса
// -----------------------------------------------------------------------
function initGlobe() {
  if (!globeContainer.value) return;

  globeInstance = Globe()(globeContainer.value);

  globeInstance
    .globeImageUrl('/textures/earth-blue-marble.jpg')
    .bumpImageUrl('/textures/earth-topology.png')
    .backgroundImageUrl('/textures/night-sky.png')
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
  updateSunDirection();
  sunInterval = setInterval(updateSunDirection, SUN_REFRESH_MS);

  bindCameraModeControls();
  bindHeroExitHandler();

  // Отслеживаем изменение размера окна
  resizeObserver = new ResizeObserver(() => {
    if (globeContainer.value && globeInstance) {
      globeInstance.width(globeContainer.value.clientWidth)
                   .height(globeContainer.value.clientHeight);
    }
  });
  resizeObserver.observe(globeContainer.value);

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
      if (heroIntroActive) enterHeroMode(2200);
    }, 300);
  }, 500);
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
const HERO_LAT          = 22;    // Средиземноморье/Сахара — дневная сторона
const HERO_LNG          = 12;
const HERO_ALTITUDE     = 0.42;  // камера в 42 ед. над поверхностью (R = 100)
const HERO_HORIZON_DEG  = 14;    // насколько лимб поднят над центром кадра
const HERO_LOOK_DIST    = 0.9;   // длина вектора lookAt (в радиусах глобуса)
const HERO_ROTATE_SPEED = 0.35;  // в hero altitude мал → штатный rotateSpeed «залипает»
const HERO_TWEEN_MS     = 1800;
const HERO_CENTRE_MS    = 260;   // доворот взгляда на центр перед полётом к аппарату
const FOLLOW_TWEEN_MS   = 1300;
const TRACK_TWEEN_MS    = 1000;  // перекадровка за аппаратом раз в секунду
const FOLLOW_ALT_PAD    = 0.12;  // запас над аппаратом (в радиусах Земли) ⇒ камера в 12 ед. от него
const FOLLOW_MAX_ALT    = 12;    // предел зума в follow (GEO ≈ 5.6 радиуса)

const cameraMode  = ref(CAMERA_MODE_HERO);
const followSatId = ref(null);

let cameraTweenId    = null;
let heroIntroTimer   = null;
let heroIntroActive  = true;      // стартовый заезд в «купол» ещё не отменён
let cameraSettleUntil = 0;       // до этого момента авто-слежение не перебивает перелёт

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

// globe.gl на каждое изменение камеры сбрасывает controls.target в центр Земли
// (держит орбиту вокруг центра). В hero target смещён к горизонту, поэтому
// «обнуление» глушим — но только пока активен hero-режим.
function holdCameraTarget(target) {
  if (!target || target.__heroHeld) return target;
  const nativeSetScalar = target.setScalar;
  target.setScalar = function (...args) {
    if (cameraMode.value === CAMERA_MODE_HERO) return this;
    return nativeSetScalar.apply(this, args);
  };
  target.__heroHeld = true;
  return target;
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

  if (!duration) {
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
}

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
// мала (~0.4 радиуса), и вращение «залипает» — держим комфортную скорость.
let cameraChangeHandler = null;

function bindCameraModeControls() {
  const controls = globeInstance && globeInstance.controls();
  if (!controls || cameraChangeHandler) return;
  cameraChangeHandler = () => {
    if (cameraMode.value !== CAMERA_MODE_HERO) return;
    controls.rotateSpeed = HERO_ROTATE_SPEED;
  };
  controls.addEventListener('change', cameraChangeHandler);
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
  controls.addEventListener('start', heroExitHandler);
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
}

function enterHeroMode(duration = HERO_TWEEN_MS) {
  if (!globeInstance) return;

  // фокус снят: авто-слежение больше не перебивает камеру
  followSatId.value = null;
  focusTarget.value = null;

  afterCameraSettle(() => {
    if (!globeInstance) return;
    cameraMode.value = CAMERA_MODE_HERO;

    const controls = globeInstance.controls();
    if (controls) {
      controls.zoomToCursor = false; // иначе зум уводит target от горизонта
      controls.rotateSpeed  = HERO_ROTATE_SPEED;
    }

    const { pos, look } = heroCameraPose();
    tweenCameraTo(pos, look, duration);
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

  afterCameraSettle(() => {
    if (!globeInstance) return;

    // штатный перелёт к аппарату; камера приходит уже «прямо» (см. ниже)
    const flyTo = () => {
      if (!globeInstance) return;
      cameraMode.value  = CAMERA_MODE_FOLLOW;
      followSatId.value = sat.id ?? null;
      cameraSettleUntil = performance.now() + duration;

      const controls = globeInstance.controls();
      if (controls) controls.zoomToCursor = true;

      globeInstance.pointOfView(
        { lat: sat.lat, lng: sat.lng, altitude: followAltitude(sat.alt) },
        duration
      );
    };

    // Из hero взгляд наклонён к горизонту, а pointOfView целится в центр Земли:
    // сначала короткий доворот на центр (иначе в первом кадре будет рывок),
    // затем сам перелёт к аппарату.
    const { pos, look } = cameraPoseNow();
    const centred = look.x === 0 && look.y === 0 && look.z === 0;
    if (centred) {
      flyTo();
      return;
    }

    cameraSettleUntil = performance.now() + HERO_CENTRE_MS;
    tweenCameraTo(pos, ZERO_POINT, HERO_CENTRE_MS, flyTo);
  });
}

// Слежение: раз в секунду (вместе с пересчётом позиций) подтягиваем камеру к
// аппарату. Текущий зум пользователя сохраняем, но не приближаемся к спутнику.
function trackFocusedSatellite() {
  if (!globeInstance || cameraMode.value !== CAMERA_MODE_FOLLOW) return;
  if (followSatId.value == null || performance.now() < cameraSettleUntil) return;

  const sat = currPositions.find(p => p.id === followSatId.value);
  if (!sat) return;

  const pov  = globeInstance.pointOfView();
  const base = followAltitude(sat.alt);
  const zoom = Number.isFinite(pov.altitude) ? Math.min(pov.altitude, FOLLOW_MAX_ALT) : base;

  globeInstance.pointOfView(
    { lat: sat.lat, lng: sat.lng, altitude: Math.max(base, zoom) },
    TRACK_TWEEN_MS
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
  enterFollowMode(sat);
}

function focusByCatalogNumber(catalogNumber) {
  const sat = satPositions.value.find(
    p => p.catalogNumber != null && String(p.catalogNumber) === String(catalogNumber)
  );
  if (!sat) return;
  focusTarget.value = sat.name;
  focusSatellite(sat);
}

// Снятие фокуса — возврат в hero-режим («обзор»), тоже плавным твином.
function clearFocus() {
  enterHeroMode();
}

// -----------------------------------------------------------------------
// Жизненный цикл компонента
// -----------------------------------------------------------------------
onMounted(async () => {
  document.body.style.overflow = 'hidden';
  initGlobe();

  clockInterval = setInterval(() => {
    utcTime.value = new Date().toISOString().split('T')[1].split('.')[0] + ' UTC';
  }, 1000);

  await fetchCategories();
  if (user.value) {
    await fetchFavorites();
  }
  await fetchData();
});

onBeforeUnmount(() => {
  document.body.style.overflow = '';
  stopCameraTween();
  if (heroIntroTimer) clearTimeout(heroIntroTimer);
  if (settleTimer) clearTimeout(settleTimer);
  if (cameraChangeHandler && globeInstance) {
    const controls = globeInstance.controls();
    if (controls) controls.removeEventListener('change', cameraChangeHandler);
  }
  cameraChangeHandler = null;
  if (heroExitHandler && globeInstance) {
    const controls = globeInstance.controls();
    if (controls) controls.removeEventListener('start', heroExitHandler);
  }
  heroExitHandler = null;
  if (refreshInterval) clearInterval(refreshInterval);
  if (rafId)          cancelAnimationFrame(rafId);
  if (clockInterval)  clearInterval(clockInterval);
  if (sunInterval)    clearInterval(sunInterval);
  if (resizeObserver) resizeObserver.disconnect();
  disposeSatelliteMesh(); // геометрия/материал/instance-буферы + отцепление от группы
  disposeDayNightMaterial();
  satMeshGroup = null;
  if (globeInstance) {
    if (typeof globeInstance._destructor === 'function') globeInstance._destructor();
    if (globeContainer.value) globeContainer.value.innerHTML = '';
  }
});
</script>

<style scoped>
/* ---- Layout ---- */
.hero-main {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #050505;
  overflow: hidden;
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
}

.globe-area {
  flex: 1 1 auto;
  position: relative;
  min-height: 0;
  width: 100%;
  background: #050505;
  overflow: hidden;
}

.globe-container {
  position: absolute;
  inset: 0;
}

/* ---- News feed area ---- */
.news-area {
  flex-shrink: 0;
  overflow: hidden;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.35);
  padding: 14px 20px 18px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.news-area :deep(section) {
  height: 100%;
  min-height: 0;
}

/* ---- Focus indicator ---- */
.focus-indicator {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px 7px 12px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(52, 211, 153, 0.35);
  border-radius: 999px;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #d1d5db;
  white-space: nowrap;
}
.focus-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.8);
  animation: focus-pulse 1.6s ease-in-out infinite;
  flex-shrink: 0;
}
.focus-label { color: #d1d5db; }
.focus-close {
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 999px;
  transition: color 0.15s, background 0.15s;
}
.focus-close:hover { color: #f87171; background: rgba(255, 255, 255, 0.08); }
@keyframes focus-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

/* ---- Floating button ---- */
.floating-btn {
  position: absolute;
  top: 24px;
  left: 24px;
  z-index: 20;
  padding: 12px;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  color: white;
  cursor: pointer;
  backdrop-filter: blur(10px);
  transition: background 0.2s;
}
.floating-btn:hover { background: rgba(255,255,255,0.1); }

/* ---- Sidebar ---- */
.sidebar {
  position: absolute;
  top: 24px;
  left: 24px;
  bottom: 24px;
  z-index: 30;
  width: 320px;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px;
  backdrop-filter: blur(12px);
  padding: 24px;
  display: flex;
  flex-direction: column;
  color: white;
  box-shadow: 0 25px 50px rgba(0,0,0,0.5);
  transform: translateX(-150%);
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}
.sidebar.open {
  transform: translateX(0);
  pointer-events: all;
}

/* ---- Header ---- */
.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.sidebar-header h1 {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.5px;
}
.close-btn {
  background: transparent;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
}
.close-btn:hover { background: rgba(255,255,255,0.1); color: white; }

/* ---- Auth Nav ---- */
.auth-nav {
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  margin-bottom: 4px;
  flex-shrink: 0;
}
.user-greeting {
  font-size: 13px;
  color: #d1d5db;
  margin-bottom: 10px;
}
.auth-links {
  display: flex;
  gap: 8px;
}
.auth-btn {
  flex: 1;
  text-align: center;
  padding: 8px 12px;
  background: #34d399;
  color: #050505;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}
.auth-btn:hover {
  background: #10b981;
}
.auth-btn.outline {
  background: transparent;
  color: #34d399;
  border: 1px solid #34d399;
}
.auth-btn.outline:hover {
  background: rgba(52,211,153,0.1);
}

/* ---- Loading ---- */
.loading-state {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #34d399;
  margin-top: 20px;
}
.loading-state p { font-size: 13px; font-weight: 500; }
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #34d399;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ---- Stats ---- */
.stats-block {
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  flex-shrink: 0;
  margin-top: 8px;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.mt-1 { margin-top: 6px; }
.stat-label { font-size: 13px; color: #9ca3af; }
.stat-value { font-weight: 700; }
.stat-value.emerald { color: #34d399; font-family: monospace; }
.stat-value.mono { font-size: 12px; color: #d1d5db; font-family: monospace; }

/* ---- Category tags ---- */
.filter-block { padding-top: 16px; flex-shrink: 0; }
.block-label {
  font-size: 11px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  display: block;
  margin-bottom: 8px;
}
.category-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.cat-tag {
  padding: 6px 12px;
  font-size: 11px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05);
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.15s;
}
.cat-tag:hover { background: rgba(255,255,255,0.1); }
.cat-tag.active {
  background: rgba(52,211,153,0.15);
  border-color: #34d399;
  color: #34d399;
}

/* ---- Satellite list ---- */
.sat-list-block {
  padding-top: 16px;
  margin-top: 16px;
  border-top: 1px solid rgba(255,255,255,0.1);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sat-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-right: 4px;
  padding-bottom: 8px;
}
.sat-list::-webkit-scrollbar { width: 4px; }
.sat-list::-webkit-scrollbar-track { background: transparent; }
.sat-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

.sat-row-container {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sat-row {
  flex: 1;
  display: flex;
  align-items: center;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border-radius: 8px;
  border: none;
  background: rgba(255,255,255,0.04);
  color: #d1d5db;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s;
  overflow: hidden;
}
.sat-row:hover { background: rgba(255,255,255,0.09); }
.fav-btn {
  background: transparent;
  border: none;
  color: #4b5563;
  cursor: pointer;
  padding: 6px;
  font-size: 16px;
  transition: color 0.2s;
}
.fav-btn:hover { color: #9ca3af; }
.fav-btn.isFav { color: #f59e0b; }
.sat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 10px;
  flex-shrink: 0;
}
.sat-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
