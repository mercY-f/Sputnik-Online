<template>
  <div class="globe-wrapper">
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
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { Link, usePage } from '@inertiajs/vue3';
import axios from 'axios';
import Globe from 'globe.gl';
import * as satellite from 'satellite.js';
import * as THREE from 'three';

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
  OTHER:      '#10b981',
};

const CATEGORIES_ORDER = ['ALL', 'ISS', 'STARLINK', 'ONEWEB', 'IRIDIUM', 'NAVIGATION', 'WEATHER', 'OTHER'];

const SAT_GEOMETRY  = new THREE.SphereGeometry(0.08, 8, 8);
const ISS_GEOMETRY  = new THREE.SphereGeometry(0.20, 16, 16);

const makeMaterial = (color) => new THREE.MeshBasicMaterial({ color });
const MATERIALS = Object.fromEntries(
  Object.entries(CATEGORY_COLORS).map(([k, v]) => [k, makeMaterial(v)])
);

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
const utcTime        = ref('');
const availableCategories = ref(['ALL']);
const userFavorites  = ref([]);

// Внутренние переменные
let allSatellites    = [];
let activeSats       = [];
let globeInstance    = null;
let animationFrame   = null;
let clockInterval    = null;
let resizeObserver   = null;

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
          return { id: sat.id, name: sat.name, category: sat.category, satrec };
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
function startAnimation() {
  if (animationFrame) clearInterval(animationFrame);

  const tick = () => {
    const now = new Date();
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
          lat:  satellite.degreesLat(gd.latitude),
          lng:  satellite.degreesLong(gd.longitude),
          alt:  gd.height / 6371,
        });
      } catch {}
    }

    satPositions.value = positions;

    if (globeInstance) {
      globeInstance.objectsData(positions);
    }
  };

  animationFrame = setInterval(tick, 1000);
  tick();
}

// -----------------------------------------------------------------------
// Инициализация глобуса
// -----------------------------------------------------------------------
function initGlobe() {
  if (!globeContainer.value) return;

  globeInstance = Globe()(globeContainer.value);

  globeInstance
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
    .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
    .objectLat('lat')
    .objectLng('lng')
    .objectAltitude('alt')
    .objectThreeObject(d => {
      const isISS = d.category === 'ISS';
      return new THREE.Mesh(
        isISS ? ISS_GEOMETRY : SAT_GEOMETRY,
        MATERIALS[d.category] ?? MATERIALS.OTHER
      );
    })
    .objectLabel(d => `
      <div style="background:rgba(0,0,0,0.85);color:#fff;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);font-family:monospace;font-size:12px;backdrop-filter:blur(8px)">
        <div style="font-weight:700;font-size:13px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.1);color:${getCategoryColor(d.category)}">${d.name}</div>
        <div style="display:grid;grid-template-columns:auto auto;gap:2px 16px">
          <span style="color:#9ca3af">ALT:</span><span>${(d.alt * 6371).toFixed(1)} km</span>
          <span style="color:#9ca3af">LAT:</span><span>${d.lat.toFixed(4)}°</span>
          <span style="color:#9ca3af">LNG:</span><span>${d.lng.toFixed(4)}°</span>
        </div>
      </div>
    `);

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

  // Отключаем авто-вращение, устанавливаем камеру
  setTimeout(() => {
    const controls = globeInstance.controls();
    if (controls) controls.autoRotate = false;
    globeInstance.pointOfView({ altitude: 2.5 });
  }, 500);
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
  if (globeInstance) {
    globeInstance.pointOfView(
      { lat: sat.lat, lng: sat.lng, altitude: sat.alt + 0.8 },
      1000
    );
  }
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
  if (animationFrame) clearInterval(animationFrame);
  if (clockInterval)  clearInterval(clockInterval);
  if (resizeObserver) resizeObserver.disconnect();
  if (globeInstance) {
    if (typeof globeInstance._destructor === 'function') globeInstance._destructor();
    if (globeContainer.value) globeContainer.value.innerHTML = '';
  }
});
</script>

<style scoped>
/* ---- Layout ---- */
.globe-wrapper {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #050505;
  overflow: hidden;
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
}

.globe-container {
  position: absolute;
  inset: 0;
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
