<script setup>
import { ref, computed } from 'vue';
import { useVirtualList } from '@vueuse/core';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useFiltersStore } from '@/stores/useFiltersStore';
import { CATEGORY_META, matchesFilter } from '@/lib/categoryMeta';

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  satellites: {
    type: Array,
    default: () => [],
  },
  user: {
    type: Object,
    default: null,
  },
  userFavorites: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits([
  'close',
  'select',
  'focus-catalog-number',
  'toggle-favorite',
  'set-filter',
]);

const selectionStore = useSelectionStore();
const filtersStore = useFiltersStore();

const currentTab = ref('sats'); // 'sats' | 'groups' | 'favs'
const searchQuery = ref('');

const GROUPS = [
  { id: 'ALL', name: 'ВСЕ ОБЪЕКТЫ', letter: '●', sub: 'Все космические аппараты' },
  { id: 'ISS', name: 'СТАНЦИИ', letter: 'I', sub: 'Орбитальные станции' },
  { id: 'STARLINK', name: 'STARLINK', letter: 'S', sub: 'Спутниковый интернет SpaceX' },
  { id: 'ONEWEB', name: 'ONEWEB', letter: 'O', sub: 'Низкоорбитальная связь' },
  { id: 'NAVIGATION', name: 'НАВИГАЦИЯ', letter: 'N', sub: 'GPS / ГЛОНАСС / Galileo / Beidou' },
  { id: 'TELESCOPE', name: 'ТЕЛЕСКОПЫ', letter: 'T', sub: 'Космические обсерватории' },
  { id: 'OTHER', name: 'ДРУГОЕ', letter: '×', sub: 'Прочие аппараты и полезная нагрузка' },
];

function getCatNum(sat) {
  if (!sat) return '';
  return sat.catalogNumber ?? sat.catalog_number ?? sat.id ?? '';
}

function getSatBadge(sat) {
  if (!sat) return '×';
  const cat = sat.category;
  if (cat && CATEGORY_META[cat] && CATEGORY_META[cat].letter) {
    return CATEGORY_META[cat].letter;
  }
  return '×';
}

function formatAlt(alt) {
  if (alt == null) return null;
  const num = Number(alt);
  if (isNaN(num)) return null;
  return num < 20 ? Math.round(num * 6371) : Math.round(num);
}

function isFavorite(sat) {
  if (!sat || !props.userFavorites) return false;
  const id = sat.id;
  const catNum = getCatNum(sat);
  return props.userFavorites.includes(id) || props.userFavorites.includes(catNum);
}

function isSelected(sat) {
  const catNum = getCatNum(sat);
  return selectionStore.isSelected(catNum) || selectionStore.isSelected(sat.id);
}

const filteredGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return GROUPS.map((g) => {
    let count = 0;
    if (g.id === 'ALL') {
      count = props.satellites.length;
    } else {
      const chip = filtersStore.chipList.find((c) => c.id === g.id);
      count = chip ? chip.count : props.satellites.filter((s) => matchesFilter(s, g.id)).length;
    }
    return {
      ...g,
      count,
    };
  }).filter((g) => {
    if (!q) return true;
    return g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q);
  });
});

const filteredSatellites = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const allSats = props.satellites || [];

  if (currentTab.value === 'favs') {
    return allSats.filter((sat) => {
      if (!isFavorite(sat)) return false;
      if (!q) return true;
      const name = (sat.name || '').toLowerCase();
      const catNum = String(getCatNum(sat)).toLowerCase();
      const country = String(sat.country || sat.country_name || '').toLowerCase();
      return name.includes(q) || catNum.includes(q) || country.includes(q);
    });
  }

  const activeFilter = filtersStore.activeFilter;
  return allSats.filter((sat) => {
    if (!matchesFilter(sat, activeFilter)) return false;
    if (!q) return true;
    const name = (sat.name || '').toLowerCase();
    const catNum = String(getCatNum(sat)).toLowerCase();
    const country = String(sat.country || sat.country_name || '').toLowerCase();
    return name.includes(q) || catNum.includes(q) || country.includes(q);
  });
});

const ROW_HEIGHT = 44;

const { list, containerProps, wrapperProps } = useVirtualList(filteredSatellites, {
  itemHeight: ROW_HEIGHT,
  overscan: 12,
});

function onSelectSat(sat) {
  selectionStore.select(sat);
  emit('select', sat);
  const catNum = getCatNum(sat);
  if (catNum) {
    emit('focus-catalog-number', catNum);
  }
}

function onToggleFavorite(sat) {
  emit('toggle-favorite', sat);
}

function onSelectGroup(groupId) {
  filtersStore.setFilter(groupId);
  emit('set-filter', groupId);
  currentTab.value = 'sats';
}
</script>

<template>
  <aside
    id="catalog-drawer"
    class="catalog-drawer"
    :class="{ open: open }"
    aria-label="Каталог космических аппаратов"
  >
    <div class="catalog-header">
      <span class="catalog-title">КАТАЛОГ ОБЪЕКТОВ</span>
      <button
        type="button"
        class="btn-square"
        title="Закрыть (C)"
        aria-label="Закрыть"
        @click="$emit('close')"
      >
        ✕
      </button>
    </div>

    <div class="catalog-search-box">
      <input
        v-model="searchQuery"
        type="text"
        class="field catalog-search-field"
        placeholder="ФИЛЬТР ПО СПИСКУ..."
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <div class="catalog-tabs" role="tablist">
      <button
        type="button"
        class="catalog-tab"
        :class="{ active: currentTab === 'sats' }"
        role="tab"
        :aria-selected="currentTab === 'sats'"
        @click="currentTab = 'sats'"
      >
        Спутники
      </button>
      <button
        type="button"
        class="catalog-tab"
        :class="{ active: currentTab === 'groups' }"
        role="tab"
        :aria-selected="currentTab === 'groups'"
        @click="currentTab = 'groups'"
      >
        Группировки
      </button>
      <button
        type="button"
        class="catalog-tab"
        :class="{ active: currentTab === 'favs' }"
        role="tab"
        :aria-selected="currentTab === 'favs'"
        @click="currentTab = 'favs'"
      >
        Избранное
      </button>
    </div>

    <!-- Вкладка: Группировки -->
    <div
      v-if="currentTab === 'groups'"
      class="catalog-list"
    >
      <div
        v-if="filteredGroups.length === 0"
        class="catalog-empty"
      >
        ГРУППИРОВКИ НЕ НАЙДЕНЫ
      </div>
      <div
        v-for="group in filteredGroups"
        v-else
        :key="group.id"
        class="catalog-row"
        :class="{ active: filtersStore.activeFilter === group.id }"
        @click="onSelectGroup(group.id)"
      >
        <div class="catalog-row-main">
          <span class="catalog-bullet">▪</span>
          <div class="catalog-row-info">
            <div class="catalog-row-name">{{ group.name }}</div>
            <div class="catalog-row-sub">{{ group.sub }}</div>
          </div>
        </div>
        <div class="catalog-row-actions">
          <span class="badge-square">{{ group.letter }}</span>
          <span class="num group-count-badge">{{ group.count }}</span>
        </div>
      </div>
    </div>

    <!-- Вкладки: Спутники и Избранное (виртуализированный список) -->
    <template v-else>
      <div
        v-if="filteredSatellites.length === 0"
        class="catalog-empty"
      >
        <template v-if="currentTab === 'favs'">
          <span v-if="!user">ДЛЯ ИЗБРАННОГО ТРЕБУЕТСЯ ВХОД В СИСТЕМУ</span>
          <span v-else>НЕТ ИЗБРАННЫХ ОБЪЕКТОВ</span>
        </template>
        <template v-else>
          ОБЪЕКТЫ НЕ НАЙДЕНЫ
        </template>
      </div>

      <div
        v-else
        v-bind="containerProps"
        class="catalog-list"
      >
        <div v-bind="wrapperProps">
          <div
            v-for="{ data: sat, index } in list"
            :key="sat.catalog_number ?? sat.catalogNumber ?? sat.id ?? index"
            class="catalog-row"
            :class="{ active: isSelected(sat) }"
            @click="onSelectSat(sat)"
          >
            <div class="catalog-row-main">
              <span class="catalog-bullet">▪</span>
              <div class="catalog-row-info">
                <div class="catalog-row-name">{{ sat.name }}</div>
                <div class="catalog-row-sub">
                  <span class="num">#{{ getCatNum(sat) }}</span>
                  <span v-if="formatAlt(sat.alt) != null"> · <span class="num">{{ formatAlt(sat.alt) }}</span> км</span>
                  <span v-if="sat.category"> · {{ sat.category }}</span>
                </div>
              </div>
            </div>
            <div class="catalog-row-actions">
              <span class="badge-square">{{ getSatBadge(sat) }}</span>
              <button
                v-if="user"
                type="button"
                class="btn-fav"
                :class="{ isFav: isFavorite(sat) }"
                :title="isFavorite(sat) ? 'Убрать из избранного' : 'В избранное'"
                :aria-label="isFavorite(sat) ? 'Убрать из избранного' : 'В избранное'"
                @click.stop="onToggleFavorite(sat)"
              >
                {{ isFavorite(sat) ? '★' : '☆' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.catalog-drawer {
  position: fixed;
  top: 48px;
  bottom: 0;
  left: 0;
  width: 288px;
  max-width: 100vw;
  background: var(--paper);
  border-right: 2px solid var(--ink);
  z-index: 45;
  display: flex;
  flex-direction: column;
  transform: translateX(-100%);
  transition: transform 0.15s ease-out;
  box-shadow: 2px 0 0 var(--ink);
  box-sizing: border-box;
}

.catalog-drawer.open {
  transform: translateX(0);
}

.catalog-header {
  padding: 8px 10px;
  border-bottom: 2px solid var(--ink);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface);
  flex-shrink: 0;
}

.catalog-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink);
}

.btn-square {
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--ink);
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  padding: 0;
  line-height: 1;
  outline: none;
}

.btn-square:hover {
  background: var(--surface);
}

.btn-square:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}

.catalog-search-box {
  padding: 8px 10px;
  border-bottom: 1px solid var(--ink);
  background: var(--paper);
  flex-shrink: 0;
}

.catalog-search-field {
  width: 100%;
  box-sizing: border-box;
  background: var(--paper);
  border: 1px solid var(--ink);
  color: var(--ink);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 4px 8px;
  outline: none;
}

.catalog-search-field:focus {
  outline: 2px solid var(--ink);
  outline-offset: -1px;
}

.catalog-tabs {
  display: flex;
  border-bottom: 2px solid var(--ink);
  background: var(--paper);
  flex-shrink: 0;
}

.catalog-tab {
  flex: 1;
  padding: 6px 4px;
  background: var(--paper);
  color: var(--ink-muted);
  border: none;
  border-right: 1px solid var(--ink);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  text-align: center;
  outline: none;
  transition: background 0.1s ease, color 0.1s ease;
}

.catalog-tab:last-child {
  border-right: none;
}

.catalog-tab:hover {
  background: var(--surface);
  color: var(--ink);
}

.catalog-tab:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: -2px;
}

.catalog-tab.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: inset 0 -2px 0 var(--ink);
}

.catalog-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--paper);
  scrollbar-width: thin;
  scrollbar-color: var(--ink) var(--paper);
}

.catalog-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  height: 44px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--surface);
  cursor: pointer;
  border-left: 4px solid transparent;
  user-select: none;
  background: var(--paper);
  font-family: 'JetBrains Mono', monospace;
  transition: background 0.1s ease;
}

.catalog-row:hover {
  background: var(--surface);
}

.catalog-row.active {
  border-left: 4px solid var(--ink);
  background: var(--surface);
}

.catalog-row-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.catalog-bullet {
  font-size: 11px;
  color: var(--ink);
  line-height: 1;
  flex-shrink: 0;
}

.catalog-row-info {
  min-width: 0;
  flex: 1;
}

.catalog-row-name {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ink);
}

.catalog-row-sub {
  font-size: 10px;
  color: var(--ink-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.catalog-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 6px;
  flex-shrink: 0;
}

.badge-square {
  width: 18px;
  height: 18px;
  border: 1px solid var(--ink);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  background: var(--paper);
  color: var(--ink);
  line-height: 1;
}

.group-count-badge {
  font-size: 10px;
  font-weight: 700;
  color: var(--ink-muted);
  border: 1px solid var(--ink);
  padding: 1px 4px;
  background: var(--paper);
  line-height: 1.2;
}

.btn-fav {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: var(--ink);
  padding: 2px 4px;
  font-family: inherit;
  outline: none;
}

.btn-fav:hover {
  color: var(--ink);
  background: var(--surface);
}

.btn-fav:focus-visible {
  outline: 2px solid var(--ink);
}

.catalog-empty {
  padding: 24px 12px;
  color: var(--ink-muted);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  text-align: center;
  font-weight: 700;
}

@media (max-width: 640px) {
  .catalog-drawer {
    width: 100vw;
    max-width: 100vw;
    border-right: none;
  }
}
</style>
