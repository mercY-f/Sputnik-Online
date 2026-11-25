<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { Link, usePage } from '@inertiajs/vue3';
import { CATEGORY_META } from '@/lib/categoryMeta';
import newsData from '@/data/news';
import NewsFeed from './NewsFeed.vue';

const props = defineProps({
  utcTime: {
    type: String,
    default: '',
  },
  tleStatus: {
    type: Object,
    default: () => ({ epoch: null, updatedAt: null }),
  },
  satellites: {
    type: Array,
    default: () => [],
  },
  catalogOpen: {
    type: Boolean,
    default: false,
  },
  user: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['toggle-catalog', 'select', 'focus-catalog-number']);

const page = usePage();
const currentUser = computed(() => props.user || page.props?.auth?.user || null);

// --- Часы UTC ---
const internalClock = ref('');
let clockTimer = null;

function updateClock() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  internalClock.value = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;
}

const displayTime = computed(() => {
  if (props.utcTime) {
    return props.utcTime.endsWith('UTC') ? props.utcTime : `${props.utcTime} UTC`;
  }
  return internalClock.value;
});

// --- TLE статус ---
const formattedTleStatus = computed(() => {
  const status = props.tleStatus;
  if (!status) return 'TLE: —';
  const ts = status.epoch || status.updatedAt;
  if (!ts) return 'TLE: —';
  const date = new Date(ts);
  if (isNaN(date.getTime())) return 'TLE: —';
  const ageDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 0) return 'TLE: 0,0 сут';
  if (ageDays < 10) {
    return `TLE: ${ageDays.toFixed(1).replace('.', ',')} сут`;
  }
  return `TLE: ${Math.round(ageDays)} сут`;
});
// --- Поиск ---
const searchQuery = ref('');
const isDropdownOpen = ref(false);
const searchInputRef = ref(null);
const searchContainerRef = ref(null);

// --- Новости ---
const newsItems = ref(newsData);
const newsOpen = ref(false);
const newsMenuRef = ref(null);
const newsCount = computed(() => String(newsItems.value.length).padStart(2, '0'));

function toggleNews() {
  newsOpen.value = !newsOpen.value;
  if (newsOpen.value) {
    isDropdownOpen.value = false;
  }
}

function closeNews() {
  newsOpen.value = false;
}

function onNewsFocus(catalogNumber) {
  if (catalogNumber == null) return;
  emit('focus-catalog-number', catalogNumber);
  newsOpen.value = false;
}

function getSatelliteBadge(sat) {
  if (!sat) return '×';
  const cat = sat.category;
  if (cat && CATEGORY_META[cat] && CATEGORY_META[cat].letter) {
    return CATEGORY_META[cat].letter;
  }
  return '×';
}

const filteredSatellites = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return [];
  const list = props.satellites || [];
  const res = [];
  for (let i = 0; i < list.length && res.length < 20; i++) {
    const s = list[i];
    const name = (s.name || '').toLowerCase();
    const catNum = String(s.catalogNumber ?? s.catalog_number ?? s.id ?? '');
    if (name.includes(q) || catNum.includes(q)) {
      res.push(s);
    }
  }
  return res;
});

function blurSearchInput() {
  const el = searchInputRef.value;
  if (el) {
    el.blur();
  }
}

function onSearchInput() {
  isDropdownOpen.value = searchQuery.value.trim().length > 0;
  if (isDropdownOpen.value) {
    newsOpen.value = false;
  }
}

function onSearchFocus() {
  if (searchQuery.value.trim().length > 0) {
    isDropdownOpen.value = true;
    newsOpen.value = false;
  }
}

function selectSatellite(sat) {
  emit('select', sat);
  const catNum = sat.catalogNumber ?? sat.catalog_number ?? sat.id;
  if (catNum != null) {
    emit('focus-catalog-number', catNum);
  }
  isDropdownOpen.value = false;
  searchQuery.value = '';
  blurSearchInput();
}

function onSearchKeydown(e) {
  if (e.key === 'Enter') {
    if (filteredSatellites.value.length > 0) {
      selectSatellite(filteredSatellites.value[0]);
    } else if (searchQuery.value.trim()) {
      emit('focus-catalog-number', searchQuery.value.trim());
      isDropdownOpen.value = false;
      blurSearchInput();
    }
  } else if (e.key === 'Escape') {
    isDropdownOpen.value = false;
    blurSearchInput();
  }
}

function onClickOutside(e) {
  if (searchContainerRef.value && !searchContainerRef.value.contains(e.target)) {
    isDropdownOpen.value = false;
  }
  if (newsOpen.value && newsMenuRef.value && !newsMenuRef.value.contains(e.target)) {
    newsOpen.value = false;
  }
}

function onGlobalKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
    if (searchQuery.value.trim()) {
      isDropdownOpen.value = true;
    }
  } else if (e.key === 'Escape') {
    if (newsOpen.value) {
      newsOpen.value = false;
    }
  } else if (e.key.toLowerCase() === 'c') {
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (activeTag !== 'input' && activeTag !== 'textarea') {
      e.preventDefault();
      emit('toggle-catalog');
    }
  }
}

function getRoute(name, params) {
  try {
    if (typeof route === 'function') {
      return route(name, params);
    }
  } catch {}
  const fallbacks = {
    login: '/login',
    register: '/register',
    logout: '/logout',
    'profile.edit': '/profile',
    'admin.dashboard': '/admin/dashboard',
    dashboard: '/dashboard',
    home: '/',
  };
  return fallbacks[name] || '#';
}

onMounted(() => {
  updateClock();
  clockTimer = setInterval(updateClock, 1000);
  window.addEventListener('click', onClickOutside);
  window.addEventListener('keydown', onGlobalKeydown);
});

onBeforeUnmount(() => {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
  window.removeEventListener('click', onClickOutside);
  window.removeEventListener('keydown', onGlobalKeydown);
});
</script>
<template>
  <header class="top-bar">
    <div class="top-bar-left">
      <Link :href="getRoute('home')" class="brand-title">
        <span class="brand-full"><span>●</span> EARTH ORBIT LIVE</span>
        <span class="brand-short"><span>●</span> EOL</span>
      </Link>
      <div id="tle-status" class="tle-status">{{ formattedTleStatus }}</div>
    </div>

    <div ref="searchContainerRef" class="search-container">
      <input
        ref="searchInputRef"
        type="text"
        id="search-input"
        v-model="searchQuery"
        class="field search-field"
        placeholder="ПОИСК СПУТНИКА / NORAD ID"
        autocomplete="off"
        spellcheck="false"
        @input="onSearchInput"
        @focus="onSearchFocus"
        @keydown="onSearchKeydown"
      />
      <kbd class="kbd-hint">⌘K</kbd>
      <div
        v-if="isDropdownOpen"
        id="search-dropdown"
        class="search-dropdown open"
      >
        <div
          v-if="filteredSatellites.length === 0"
          class="search-empty"
        >
          НИЧЕГО НЕ НАЙДЕНО
        </div>
        <div
          v-for="s in filteredSatellites"
          :key="s.id || s.catalogNumber || s.catalog_number"
          class="search-result-item"
          @click="selectSatellite(s)"
        >
          <div class="search-result-left">
            <span class="badge-square">{{ getSatelliteBadge(s) }}</span>
            <strong>{{ s.name }}</strong>
          </div>
          <span class="num search-cat-num">#{{ s.catalogNumber || s.catalog_number || s.id }}</span>
        </div>
      </div>
    </div>

    <div class="top-bar-right">
      <span id="utc-clock" class="num">{{ displayTime }}</span>

      <div ref="newsMenuRef" class="news-menu">
        <button
          id="btn-news-toggle"
          class="btn"
          :class="{ active: newsOpen }"
          type="button"
          title="Новости (лента событий)"
          aria-label="НОВОСТИ"
          :aria-expanded="newsOpen"
          @click="toggleNews"
        >
          <span class="news-btn-text">[ НОВОСТИ <span class="news-btn-count">{{ newsCount }}</span> ]</span>
          <span class="news-btn-icon" aria-hidden="true">▤</span>
        </button>

        <div
          v-if="newsOpen"
          class="news-panel"
          role="dialog"
          aria-label="Лента новостей"
          @keydown.escape="closeNews"
        >
          <NewsFeed :items="newsItems" title="ЛЕНТА" max-height="52vh" @focus="onNewsFocus" />
        </div>
      </div>

      <button
        id="btn-catalog-toggle"
        class="btn"
        :class="{ active: catalogOpen }"
        type="button"
        title="Каталог (C)"
        aria-label="КАТАЛОГ"
        @click="$emit('toggle-catalog')"
      >
        <span class="catalog-btn-text">[ КАТАЛОГ <span class="kbd-hint">(C)</span> ]</span>
        <span class="catalog-btn-icon" aria-hidden="true">☰</span>
      </button>

      <template v-if="currentUser">
        <Link
          v-if="currentUser.role?.name === 'admin'"
          :href="getRoute('admin.dashboard')"
          class="btn-square btn-square-wide"
          title="Администратор"
        >
          АДМИН
        </Link>
        <Link
          :href="getRoute('profile.edit')"
          class="btn-square btn-square-wide"
          title="Профиль"
        >
          ПРОФИЛЬ
        </Link>
        <Link
          :href="getRoute('logout')"
          method="post"
          as="button"
          class="btn-square btn-square-wide"
          title="Выход"
        >
          ВЫХОД
        </Link>
      </template>
      <template v-else>
        <Link
          :href="getRoute('login')"
          class="btn-square btn-square-wide"
          title="Вход"
        >
          ВХОД
        </Link>
        <Link
          :href="getRoute('register')"
          class="btn-square btn-square-wide"
          title="Регистрация"
        >
          <span class="reg-full">РЕГИСТРАЦИЯ</span>
          <span class="reg-short">РЕГ</span>
        </Link>
      </template>
    </div>
  </header>
</template>
<style scoped>
.top-bar {
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  height: 40px;
  border-bottom: 2px solid var(--ink);
  background: var(--paper);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  z-index: 50;
  box-sizing: border-box;
  font-family: 'JetBrains Mono', monospace;
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  color: var(--ink);
  text-decoration: none;
}

.brand-title:hover {
  background: var(--surface);
}

.brand-short {
  display: none;
}

.tle-status {
  font-size: 11px;
  color: var(--ink-muted);
  border: 1px solid var(--ink-muted);
  padding: 2px 6px;
  white-space: nowrap;
  user-select: none;
}

.search-container {
  position: relative;
  width: 360px;
  max-width: 100%;
}

.search-field {
  width: 100%;
  padding-right: 38px;
  text-transform: uppercase;
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--ink);
  font-family: inherit;
  font-size: 11px;
  padding: 6px 10px;
  outline: none;
  box-sizing: border-box;
}

.search-field:focus {
  border: 2px solid var(--ink);
  padding: 5px 9px;
  padding-right: 37px;
}

.kbd-hint {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  border: 1px solid var(--ink);
  padding: 1px 4px;
  color: var(--ink);
  background: var(--surface);
  pointer-events: none;
}

#btn-catalog-toggle .kbd-hint {
  position: static;
  transform: none;
  border: none;
  padding: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  pointer-events: auto;
}

.catalog-btn-icon {
  display: none;
}

.search-dropdown {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  background: var(--paper);
  border: 2px solid var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
  max-height: 280px;
  overflow-y: auto;
  z-index: 60;
}

.search-empty {
  padding: 8px 10px;
  color: var(--ink-muted);
  font-size: 11px;
}

.search-result-item {
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  border-bottom: 1px solid var(--surface);
  font-size: 11px;
}

.search-result-item:last-child {
  border-bottom: none;
}

.search-result-item:hover {
  background: var(--surface);
}

.search-result-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge-square {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid var(--ink);
  font-size: 11px;
  font-weight: 700;
  background: var(--paper);
  color: var(--ink);
}

.search-cat-num {
  color: var(--ink-muted);
  font-size: 11px;
}

.news-menu {
  position: relative;
  display: inline-flex;
}

.news-btn-count {
  font-variant-numeric: tabular-nums;
}

.news-btn-icon {
  display: none;
}

.news-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: min(380px, calc(100vw - 24px));
  max-height: 70vh;
  overflow: hidden;
  background: var(--paper);
  border: 2px solid var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
  padding: 10px;
  z-index: 60;
  box-sizing: border-box;
  color: var(--ink);
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
#utc-clock {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  min-width: 95px;
  white-space: nowrap;
}

.btn {
  background: var(--paper);
  color: var(--ink);
  border: 2px solid var(--ink);
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 6px 12px;
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--ink);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-decoration: none;
  white-space: nowrap;
  box-sizing: border-box;
  user-select: none;
}

.btn:hover {
  background: var(--surface);
}

.btn:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 var(--ink);
}

.btn.active {
  background: var(--ink);
  color: var(--paper);
}

.btn-square {
  width: 28px;
  height: 28px;
  border: 1px solid var(--ink);
  background: var(--paper);
  color: var(--ink);
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  box-sizing: border-box;
  user-select: none;
}

.btn-square-wide {
  width: auto;
  padding: 0 8px;
}

.btn-square:hover {
  background: var(--surface);
}

.btn-square:active {
  background: var(--ink);
  color: var(--paper);
}

.reg-short {
  display: none;
}

.reg-full {
  display: inline;
}

@media (max-width: 640px) {
  .top-bar {
    height: 48px;
    padding: 0 6px;
    gap: 4px;
  }

  .top-bar-left {
    gap: 6px;
    flex-shrink: 0;
  }

  .tle-status {
    display: none;
  }

  .brand-title {
    font-size: 11px;
  }

  .brand-full {
    display: none;
  }

  .brand-short {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .search-container {
    flex: 1;
    width: auto;
    min-width: 0;
  }

  .search-field,
  #search-input {
    font-size: 11px;
    padding: 6px 8px;
    min-height: 40px;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }

  .kbd-hint {
    display: none;
  }

  /* Выпадающий список поиска: ниже полосы шапки, элементы — тач-цели */
  .search-dropdown {
    top: calc(100% + 5px);
    max-height: 50vh;
  }

  .search-result-item {
    min-height: 40px;
    padding: 8px 10px;
  }

  .top-bar-right {
    gap: 4px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  #utc-clock {
    display: none;
  }

  .btn-square {
    width: 40px;
    height: 40px;
    min-width: 40px;
    min-height: 40px;
    font-size: 11px;
    flex-shrink: 0;
  }

  .btn-square-wide {
    width: auto;
    min-width: 40px;
    min-height: 40px;
    padding: 0 6px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  #btn-catalog-toggle {
    padding: 6px 8px;
    font-size: 11px;
    min-height: 40px;
    min-width: 40px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  #btn-news-toggle {
    width: 40px;
    height: 40px;
    min-width: 40px;
    min-height: 40px;
    padding: 0;
    justify-content: center;
    flex-shrink: 0;
  }

  #btn-news-toggle .news-btn-text {
    display: none;
  }

  #btn-news-toggle .news-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    line-height: 1;
  }

  .news-panel {
    position: fixed;
    top: 56px;
    left: 8px;
    right: 8px;
    width: auto;
    max-height: calc(100vh - 80px);
  }

  .reg-full {
    display: none;
  }

  .reg-short {
    display: inline;
  }
}

@media (max-width: 420px) {
  #btn-catalog-toggle {
    width: 40px;
    height: 40px;
    min-width: 40px;
    min-height: 40px;
    padding: 0;
    justify-content: center;
  }

  #btn-catalog-toggle .catalog-btn-text {
    display: none;
  }

  #btn-catalog-toggle .catalog-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    line-height: 1;
  }
}
</style>
