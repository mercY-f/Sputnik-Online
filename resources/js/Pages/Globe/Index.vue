<template>
  <div class="relative flex h-screen flex-col overflow-hidden bg-paper text-ink">
    <TopBar
      :utc-time="utcTime"
      :tle-status="page.props.tleStatus"
      :satellites="filteredSatellites"
      :catalog-open="sidebarOpen"
      @select="focusSatellite"
      @focus-catalog-number="focusByCatalogNumber"
      @toggle-catalog="sidebarOpen = !sidebarOpen"
    />
    <CategoryChips
      :catalog-open="sidebarOpen"
      :inspector-open="!!selectedSatellite"
      @select="applyFilter"
    />
    <main class="relative flex-1 min-h-0">
      <div class="hero-main">
      <div class="globe-area">
        <!-- Focus indicator (glass overlay above the globe) -->
        <div v-if="focusTarget" class="focus-indicator">
          <span class="focus-dot"></span>
          <span class="focus-label">◎ FOCUS — {{ focusTarget }}</span>
          <button class="focus-close" title="Clear focus" @click="clearFocus">✕</button>
        </div>

        <!-- Hover HUD: имя аппарата под курсором (пикинг, Спринт 4) -->
        <div
          v-if="hoverSat"
          class="hover-label"
          :style="{
            left: hoverSat.x + 'px',
            top: hoverSat.y + 'px',
            transform: hoverSat.flip ? 'translate(-100%, -50%)' : 'translate(0, -50%)',
          }"
        >◎ {{ hoverSat.name }}</div>

        <!-- Debug HUD спутникового слоя: ?debug=1 (FPS + реально отрисованные инстансы) -->
        <div v-if="debugStats" class="debug-hud">
          <div class="debug-row"><span>FPS</span><b>{{ debugStats.fps }}</b></div>
          <div class="debug-row"><span>DRAWN</span><b>{{ debugStats.drawn }} / {{ debugStats.total }}</b></div>
          <div class="debug-row"><span>SPHERES</span><b>{{ debugStats.near }}</b></div>
          <div class="debug-row"><span>POINTS</span><b>{{ debugStats.points }}</b></div>
          <div class="debug-row"><span>CULL FRUSTUM</span><b>{{ debugStats.frustum }}</b></div>
          <div class="debug-row"><span>CULL LIMB</span><b>{{ debugStats.limb }}</b></div>
        </div>
        <!-- Catalog Drawer (U3) -->
        <CatalogDrawer
          :open="sidebarOpen"
          :satellites="satPositions"
          :user="user"
          :user-favorites="userFavorites"
          @close="sidebarOpen = false"
          @select="focusSatellite"
          @focus-catalog-number="focusByCatalogNumber"
          @toggle-favorite="toggleFavorite"
          @set-filter="applyFilter"
        />

        <!-- Layer toggles (D2) -->
        <LayerToggles />

        <!-- Globe Container -->
        <div v-show="webglSupported" ref="globeContainer" class="globe-container"></div>

        <!-- WebGL Fallback (если WebGL недоступен или отключён) -->
        <div v-if="!webglSupported" class="webgl-fallback">
          <div class="webgl-card">
            <div class="webgl-badge">
              <span class="warning-dot"></span>
              HARDWARE ACCELERATION UNAVAILABLE
            </div>
            <h2 class="webgl-title">3D-режим отключён (WebGL недоступен)</h2>
            <p class="webgl-desc">
              Ваш браузер или видеокарта не поддерживает аппаратное ускорение WebGL либо оно отключено в настройках.
              Интерфейс переведён в 2D-режим телеметрии — каталог спутников и расчёт орбит продолжают работать в реальном времени.
            </p>

            <div class="webgl-stats-grid">
              <div class="stat-card">
                <span class="stat-name">Спутников в каталоге</span>
                <span class="stat-num emerald">{{ filteredSatellites.length.toLocaleString() }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-name">Системное время UTC</span>
                <span class="stat-num mono">{{ utcTime }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-name">Активная группировка</span>
                <span class="stat-num">{{ filtersStore.activeFilter }}</span>
              </div>
            </div>

            <div class="fallback-telemetry" v-if="filteredSatellites.length > 0">
              <div class="telemetry-header">Оперативная телеметрия (Top 5)</div>
              <div class="telemetry-table">
                <div class="t-row t-head">
                  <span>Имя</span>
                  <span>Категория</span>
                  <span>Широта</span>
                  <span>Долгота</span>
                  <span>Высота</span>
                </div>
                <div v-for="s in filteredSatellites.slice(0, 5)" :key="s.id || s.name" class="t-row">
                  <span class="t-name font-mono text-emerald-400">{{ s.name }}</span>
                  <span class="t-cat">{{ s.category }}</span>
                  <span class="t-num font-mono">{{ s.lat != null ? s.lat.toFixed(2) + '°' : '—' }}</span>
                  <span class="t-num font-mono">{{ s.lng != null ? s.lng.toFixed(2) + '°' : '—' }}</span>
                  <span class="t-num font-mono">{{ s.altKm != null ? Math.round(s.altKm) + ' км' : '—' }}</span>
                </div>
              </div>
            </div>

            <div class="webgl-actions">
              <button class="retry-btn" @click="retryInitGlobe">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                Повторить попытку инициализации WebGL
              </button>
            </div>
          </div>
        </div>

        <!-- Floating Glass Satellite Card -->
        <transition name="sat-card-transition">
          <div
            v-if="selectedSatellite"
            class="satellite-card-container"
          >
            <SatelliteCard
              :satellite="selectedSatellite"
              :category-color="getCategoryColor(selectedSatellite.category)"
              :is-favorite="isFavorite(selectedSatellite)"
              @close="clearFocus"
              @toggle-favorite="toggleFavorite(selectedSatellite)"
            />
          </div>
        </transition>
      </div>
    </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue';
import { Link, usePage } from '@inertiajs/vue3';
import axios from 'axios';
import { TopBar, CategoryChips, SatelliteCard, CatalogDrawer } from '@/components/mission';
import LayerToggles from '@/components/mission/LayerToggles.vue';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useGlobeScene } from '@/composables/useGlobeScene';
import { useFiltersStore } from '@/stores/useFiltersStore';
import { matchesFilter, CHIPS } from '@/lib/categoryMeta';

const page = usePage();
const user = computed(() => page.props.auth.user);

const filtersStore = useFiltersStore();
const catalogStore = useCatalogStore();
const selectionStore = useSelectionStore();

function hydrateCategoryCounts(counts) {
  const payload = { ...(counts || {}) };
  if (page.props.satelliteCount != null) {
    payload.ALL = page.props.satelliteCount;
  }
  filtersStore.hydrate(payload);
}

// Первичное заполнение счётчиков из Inertia-пропсов (Шаг 1)
hydrateCategoryCounts(page.props.categories);

const CATEGORIES_ORDER = ['ALL', 'ISS', 'STARLINK', 'ONEWEB', 'IRIDIUM', 'NAVIGATION', 'WEATHER', 'TELESCOPE', 'OTHER'];

// -----------------------------------------------------------------------
// Реактивное состояние
// -----------------------------------------------------------------------
const globeContainer = ref(null);
const loading        = ref(true);
const sidebarOpen    = ref(true);
const activeFilter   = ref(filtersStore.activeFilter);
const satPositions   = ref([]);
const focusTarget    = ref(null);
const selectedSatellite = ref(null);
const availableCategories = ref(['ALL']);
const userFavorites  = ref([]);

const {
  utcTime,
  webglSupported,
  hoverSat,
  debugStats,
  getCategoryColor,
  retryInitGlobe,
  setFilter: sceneSetFilter,
  focusSatellite,
  focusByCatalogNumber,
  clearFocus,
} = useGlobeScene({
  globeContainer,
  loading,
  activeFilter,
  satPositions,
  focusTarget,
  selectedSatellite,
});

function applyFilter(catId) {
  filtersStore.setFilter(catId);
  sceneSetFilter(catId);
}

watch(
  () => filtersStore.activeFilter,
  (newFilter) => {
    if (newFilter && newFilter !== activeFilter.value) {
      sceneSetFilter(newFilter);
    }
  }
);

watch(sidebarOpen, (open) => {
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('catalog-open', !!open);
  }
}, { immediate: true });

watch(selectedSatellite, (sat) => {
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('inspector-open', !!sat);
  }
  if (sat) {
    selectionStore.select(sat);
  } else {
    selectionStore.clear();
  }
}, { immediate: true });

watch(satPositions, (newSats) => {
  if (Array.isArray(newSats) && newSats.length > 0) {
    catalogStore.hydrate(newSats);
  }
}, { immediate: true });

const filteredSatellites = computed(() => {
  const current = filtersStore.activeFilter;
  if (!current || current === 'ALL') {
    return satPositions.value;
  }
  return satPositions.value.filter((sat) => matchesFilter(sat, current));
});

async function fetchCategories() {
  try {
    const res  = await axios.get('/api/satellite-categories');
    const data = res.data;
    if (data && typeof data === 'object') {
      hydrateCategoryCounts(data);
    }

    // Определяем доступные фильтры на основе полученных данных
    const found = CATEGORIES_ORDER.filter(c => c === 'ALL' || data[c] !== undefined);
    
    if (user.value) {
      found.push('FAVORITES');
    }
    
    availableCategories.value = found.length > 1 ? found : ['ALL'];

    // Если выбранного фильтра нет в списке, сбрасываем на ALL только если он не валидный чип
    if (!availableCategories.value.includes(activeFilter.value) && !CHIPS.some(c => c.id === activeFilter.value)) {
      applyFilter('ALL');
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

onMounted(async () => {
  document.body.style.overflow = 'hidden';

  await fetchCategories();
  if (user.value) {
    await fetchFavorites();
  }
});

onBeforeUnmount(() => {
  document.body.style.overflow = '';
  if (typeof document !== 'undefined') {
    document.body.classList.remove('catalog-open', 'inspector-open');
  }
});
</script>

<style scoped>
/* ---- Layout ---- */
.hero-main {
  position: relative;
  height: 100%;
  width: 100%;
  min-height: 0;
  background: #050505;
  overflow: hidden;
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
}

.globe-area {
  position: relative;
  height: 100%;
  width: 100%;
  min-height: 0;
  background: #050505;
  overflow: hidden;
}

.globe-container {
  position: absolute;
  inset: 0;
}

/* ---- 1-bit satellite card container ---- */
.satellite-card-container {
  position: absolute;
  right: 16px;
  top: 16px;
  width: min(340px, calc(100vw - 32px));
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  z-index: 45;
  pointer-events: auto;
  border-radius: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--ink-muted) transparent;
}

.satellite-card-container::-webkit-scrollbar {
  width: 4px;
}

.satellite-card-container::-webkit-scrollbar-thumb {
  background: var(--ink-muted);
  border-radius: 0;
}

.sat-card-transition-enter-active,
.sat-card-transition-leave-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}

.sat-card-transition-enter-from,
.sat-card-transition-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

@media (max-width: 639px) {
  .satellite-card-container {
    right: 0;
    left: 0;
    top: auto;
    bottom: 0;
    width: 100%;
    max-height: 60vh;
    border-radius: 0;
  }
  .sat-card-transition-enter-from,
  .sat-card-transition-leave-to {
    opacity: 0;
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sat-card-transition-enter-active,
  .sat-card-transition-leave-active {
    transition: opacity 0.05s ease !important;
    transform: none !important;
  }
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

/* ---- Hover HUD (пикинг спутников) ---- */
.hover-label {
  position: absolute;
  z-index: 45;
  pointer-events: none;
  padding: 5px 9px;
  background: rgba(0, 0, 0, 0.72);
  border: 1px solid rgba(52, 211, 153, 0.35);
  border-radius: 8px;
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: #e5e7eb;
  white-space: nowrap;
}

/* ---- Debug HUD (спутниковый слой, ?debug=1) ---- */
.debug-hud {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 46;
  pointer-events: none;
  padding: 8px 10px;
  min-width: 168px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(52, 211, 153, 0.28);
  border-radius: 8px;
  backdrop-filter: blur(10px);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: #9ca3af;
}
.debug-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  line-height: 1.6;
}
.debug-row b { color: #34d399; font-weight: 600; }

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

/* ---- WebGL Fallback Overlay ---- */
.webgl-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: radial-gradient(circle at center, rgba(15, 23, 42, 0.85) 0%, rgba(5, 5, 5, 0.98) 100%);
  z-index: 40;
  backdrop-filter: blur(8px);
}
.webgl-card {
  max-width: 640px;
  width: 100%;
  background: rgba(18, 24, 38, 0.85);
  border: 1px solid rgba(248, 113, 113, 0.25);
  border-radius: 16px;
  padding: 28px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.webgl-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  text-transform: uppercase;
}
.warning-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}
.webgl-title {
  font-size: 18px;
  font-weight: 600;
  color: #f3f4f6;
  margin: 0;
}
.webgl-desc {
  font-size: 13px;
  line-height: 1.5;
  color: #9ca3af;
  margin: 0;
}
.webgl-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 4px;
}
.stat-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-name {
  font-size: 11px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.stat-num {
  font-size: 14px;
  font-weight: 600;
  color: #e5e7eb;
}
.stat-num.emerald { color: #34d399; font-family: monospace; }
.stat-num.mono { font-family: monospace; font-size: 12px; }

.fallback-telemetry {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  overflow: hidden;
}
.telemetry-header {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.telemetry-table {
  display: flex;
  flex-direction: column;
  font-size: 11px;
}
.t-row {
  display: grid;
  grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr;
  padding: 6px 12px;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  color: #d1d5db;
}
.t-row:last-child {
  border-bottom: none;
}
.t-head {
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.02);
}
.t-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.t-cat {
  color: #9ca3af;
}
.t-num {
  font-size: 10px;
}

.webgl-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}
.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(52, 211, 153, 0.15);
  border: 1px solid rgba(52, 211, 153, 0.4);
  color: #34d399;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.retry-btn:hover {
  background: rgba(52, 211, 153, 0.25);
  border-color: #34d399;
}

/* ---- Prefers-reduced-motion ---- */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
  .focus-dot {
    animation: none !important;
  }
  .spinner {
    animation: none !important;
    border-top-color: #34d399 !important;
  }
}
</style>
