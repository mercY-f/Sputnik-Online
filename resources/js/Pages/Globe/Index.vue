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
        <!-- Focus indicator (1-bit overlay above the globe) -->
        <div v-if="focusTarget" class="focus-indicator">
          <span class="focus-dot"></span>
          <span class="focus-label">◎ FOCUS — {{ focusTarget }}</span>
          <button class="focus-close" title="Clear focus" aria-label="Сбросить фокус" @click="clearFocus">✕</button>
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
        <LayerToggles :inspector-open="!!selectedSatellite" />

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
                <span class="stat-num mono">{{ filteredSatellites.length.toLocaleString() }}</span>
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
                  <span class="t-name font-mono">{{ s.name }}</span>
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
// На мобильных (<= 640px) каталог стартует закрытым: он занимает нижние 70vh
const MOBILE_QUERY   = '(max-width: 640px)';
const initialMobile  = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia(MOBILE_QUERY).matches
  : false;
const isMobile       = ref(initialMobile);
const sidebarOpen    = ref(!initialMobile);
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

// Взаимоисключение двух bottom-sheet на мобильных: одновременно открыт только один,
// иначе каталог и карточка аппарата накрывают друг друга снизу экрана.
watch(sidebarOpen, (open) => {
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('catalog-open', !!open);
  }
  if (open && isMobile.value && selectedSatellite.value) {
    selectedSatellite.value = null;
  }
}, { immediate: true });

watch(selectedSatellite, (sat) => {
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('inspector-open', !!sat);
  }
  if (sat) {
    selectionStore.select(sat);
    if (isMobile.value && sidebarOpen.value) {
      sidebarOpen.value = false;
    }
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

let mobileMq = null;

function onViewportChange(event) {
  isMobile.value = event.matches;
}

onMounted(async () => {
  document.body.style.overflow = 'hidden';

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mobileMq = window.matchMedia(MOBILE_QUERY);
    isMobile.value = mobileMq.matches;
    if (mobileMq.addEventListener) {
      mobileMq.addEventListener('change', onViewportChange);
    } else if (mobileMq.addListener) {
      mobileMq.addListener(onViewportChange);
    }
    // Ни при возврате на десктоп, ни при уходе в мобильный режим не оставляем
    // одновременно открытые каталог и карточку.
    if (isMobile.value) {
      sidebarOpen.value = false;
    }
  }

  await fetchCategories();
  if (user.value) {
    await fetchFavorites();
  }
});

onBeforeUnmount(() => {
  document.body.style.overflow = '';
  if (mobileMq) {
    if (mobileMq.removeEventListener) {
      mobileMq.removeEventListener('change', onViewportChange);
    } else if (mobileMq.removeListener) {
      mobileMq.removeListener(onViewportChange);
    }
    mobileMq = null;
  }
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
  background: transparent;
  overflow: hidden;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.globe-area {
  position: relative;
  height: 100%;
  width: 100%;
  min-height: 0;
  background: transparent;
  overflow: hidden;
}

/* Канвас прозрачный (WebGL clearColor полностью прозрачен) и не создаёт слоя
   выше точечной сетки body::before, поэтому бумага --paper читается за глобусом. */
.globe-container {
  position: absolute;
  inset: 0;
  z-index: 0;
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

@media (max-width: 640px) {
  /* Карточка аппарата — bottom-sheet снизу; рамка задаётся в SatelliteCard */
  .satellite-card-container {
    right: 0;
    left: 0;
    top: auto;
    bottom: 0;
    width: 100%;
    max-height: 70vh;
    border-radius: 0;
    z-index: 46;
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

/* ---- Focus indicator (1-bit) ---- */
.focus-indicator {
  position: absolute;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  max-width: calc(100vw - 24px);
  padding: 5px 6px 5px 10px;
  background: var(--paper);
  border: 2px solid var(--ink);
  border-radius: 0;
  box-shadow: 2px 2px 0 var(--ink);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink);
  white-space: nowrap;
}
.focus-dot {
  width: 8px;
  height: 8px;
  border-radius: 0;
  background: var(--ink);
  animation: focus-pulse 1.6s steps(2, end) infinite;
  flex-shrink: 0;
}
.focus-label {
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.focus-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--ink);
  border-radius: 0;
  color: var(--ink);
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
}
.focus-close:hover {
  background: var(--ink);
  color: var(--paper);
}
@keyframes focus-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

/* ---- Hover HUD (пикинг спутников, 1-bit) ---- */
.hover-label {
  position: absolute;
  z-index: 45;
  pointer-events: none;
  padding: 4px 8px;
  background: var(--paper);
  border: 2px solid var(--ink);
  border-radius: 0;
  box-shadow: 2px 2px 0 var(--ink);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--ink);
  white-space: nowrap;
}

/* ---- Debug HUD (спутниковый слой, ?debug=1) ---- */
.debug-hud {
  position: absolute;
  top: 56px;
  left: 12px;
  z-index: 46;
  pointer-events: none;
  padding: 6px 10px;
  min-width: 168px;
  background: var(--surface);
  border: 2px solid var(--ink);
  border-radius: 0;
  box-shadow: 2px 2px 0 var(--ink);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
}
.debug-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  line-height: 1.6;
}
.debug-row b { color: var(--ink); font-weight: 700; }

/* ---- Legacy glass-блоки (sidebar / auth / list) удалены: эти классы больше
   не используются шаблоном, а их стили нарушали 1-бит правила. ---- */

/* ---- WebGL Fallback Overlay (1-bit) ---- */
.webgl-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: transparent;
  z-index: 40;
  overflow-y: auto;
  /* Оверлей прозрачный: не перехватываем клики по ленте чипов и HUD. */
  pointer-events: none;
}
.webgl-card {
  max-width: 640px;
  width: 100%;
  box-sizing: border-box;
  background: var(--paper);
  border: 2px solid var(--ink);
  border-radius: 0;
  padding: 24px;
  box-shadow: 4px 4px 0 var(--ink);
  display: flex;
  flex-direction: column;
  gap: 16px;
  pointer-events: auto;
}
.webgl-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 3px 8px;
  border-radius: 0;
  background: var(--surface);
  border: 2px solid var(--ink);
  color: var(--ink);
  text-transform: uppercase;
}
.warning-dot {
  width: 8px;
  height: 8px;
  border-radius: 0;
  background: var(--ink);
}
.webgl-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
  margin: 0;
}
.webgl-desc {
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-muted);
  margin: 0;
}
.webgl-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 4px;
}
.stat-card {
  background: var(--surface);
  border: 2px solid var(--ink);
  border-radius: 0;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.stat-name {
  font-size: 11px;
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.stat-num {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
}
.stat-num.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; }

.fallback-telemetry {
  background: var(--paper);
  border: 1px solid var(--ink);
  border-radius: 0;
  overflow: hidden;
}
.telemetry-header {
  padding: 7px 10px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ink);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 1px solid var(--ink);
}
.telemetry-table {
  display: flex;
  flex-direction: column;
  font-size: 11px;
  overflow-x: auto;
}
.t-row {
  display: grid;
  grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr;
  padding: 6px 10px;
  align-items: center;
  border-bottom: 1px solid var(--ink-muted);
  color: var(--ink);
}
.t-row:last-child {
  border-bottom: none;
}
.t-head {
  font-weight: 700;
  color: var(--ink-muted);
  text-transform: uppercase;
  background: var(--surface);
}
.t-name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.t-cat {
  color: var(--ink-muted);
}
.t-num {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
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
  background: var(--ink);
  border: 2px solid var(--ink);
  color: var(--paper);
  padding: 8px 16px;
  border-radius: 0;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--ink);
  transition: background 0.15s, color 0.15s;
}
.retry-btn:hover {
  background: var(--paper);
  color: var(--ink);
}

/* ---- Мобильная раскладка оверлеев (<= 640px) ---- */
@media (max-width: 640px) {
  /* Плашка фокуса — на всю доступную ширину, с отступом от ленты чипов */
  .focus-indicator {
    top: 60px;
    left: 8px;
    right: 8px;
    transform: none;
    max-width: none;
    gap: 6px;
    padding: 2px 4px 2px 8px;
    font-size: 10px;
    letter-spacing: 0.04em;
  }
  .focus-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Тач-цель закрытия >= 40px */
  .focus-close {
    width: 40px;
    height: 40px;
    border: 2px solid var(--ink);
    font-size: 14px;
  }
  .hover-label {
    font-size: 10px;
    padding: 3px 6px;
  }
  .debug-hud {
    top: 112px;
    left: 8px;
    right: 8px;
    min-width: 0;
    font-size: 9px;
  }
  .webgl-fallback {
    padding: 12px;
    align-items: flex-start;
    padding-top: 60px;
  }
  .webgl-card {
    padding: 16px;
    gap: 12px;
    box-shadow: 3px 3px 0 var(--ink);
  }
  .webgl-stats-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .t-row {
    grid-template-columns: 1.8fr 1.2fr 0.9fr 0.9fr 0.9fr;
    padding: 5px 8px;
    font-size: 10px;
  }
  .retry-btn {
    width: 100%;
    min-height: 40px;
    justify-content: center;
    text-align: center;
  }
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
}
</style>
