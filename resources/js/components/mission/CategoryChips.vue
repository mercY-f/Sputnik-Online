<template>
  <div
    class="chip-ribbon-bar"
    :class="{
      'catalog-open': catalogOpen,
      'inspector-open': inspectorOpen,
    }"
  >
    <nav
      id="chip-ribbon"
      class="chip-ribbon"
      role="toolbar"
      aria-label="Фильтр категорий"
    >
      <button
        v-for="chip in chips"
        :key="chip.id"
        type="button"
        class="chip"
        :class="{ active: activeFilter === chip.id }"
        :data-filter="chip.id"
        :aria-pressed="activeFilter === chip.id ? 'true' : 'false'"
        @click="onSelectChip(chip.id)"
      >
        <span>{{ chip.label }}</span>
        <span class="chip-count num">{{ chip.count }}</span>
      </button>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useFiltersStore } from '@/stores/useFiltersStore';

const props = defineProps({
  catalogOpen: {
    type: Boolean,
    default: false,
  },
  inspectorOpen: {
    type: Boolean,
    default: false,
  },
  chips: {
    type: Array,
    default: null,
  },
  activeFilter: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['select']);

const filtersStore = useFiltersStore();

const chips = computed(() => props.chips || filtersStore.chipList);
const activeFilter = computed(() => props.activeFilter || filtersStore.activeFilter);

function onSelectChip(id) {
  filtersStore.setFilter(id);
  emit('select', id);
}
</script>

<style scoped>
.chip-ribbon-bar {
  position: fixed;
  top: 48px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 40;
  pointer-events: none;
  transition: left 0.15s ease-out, right 0.15s ease-out;
}

:global(body.inspector-open) .chip-ribbon-bar,
.chip-ribbon-bar.inspector-open {
  right: 332px;
}

:global(body.catalog-open) .chip-ribbon-bar,
.chip-ribbon-bar.catalog-open {
  left: 296px;
}

.chip-ribbon {
  pointer-events: auto;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  background: var(--paper);
  border: 1px solid var(--ink);
  padding: 4px 6px;
  box-shadow: 2px 2px 0 var(--ink);
  max-width: calc(100vw - 24px);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.chip-ribbon::-webkit-scrollbar {
  display: none;
}

:global(body.inspector-open) .chip-ribbon,
.chip-ribbon-bar.inspector-open .chip-ribbon,
:global(body.catalog-open) .chip-ribbon,
.chip-ribbon-bar.catalog-open .chip-ribbon {
  max-width: 100%;
}

.chip {
  background: var(--paper);
  color: var(--ink);
  flex-shrink: 0;
  border: 1px solid var(--ink);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 4px 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  user-select: none;
  outline: none;
  transition: background 0.1s ease, color 0.1s ease;
}

.chip:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}

.chip:hover {
  background: var(--surface);
}

.chip.active {
  background: var(--ink);
  color: var(--paper);
}

.chip-count {
  font-size: 11px;
  padding: 1px 4px;
  border: 1px solid currentColor;
  margin-left: 4px;
  line-height: 1.2;
}

@media (max-width: 640px) {
  .chip-ribbon-bar {
    top: 48px;
    padding: 0 6px;
    justify-content: flex-start;
    overflow: hidden;
    max-width: 100vw;
    box-sizing: border-box;
  }

  :global(body.inspector-open) .chip-ribbon-bar,
  .chip-ribbon-bar.inspector-open {
    right: 0;
  }

  :global(body.catalog-open) .chip-ribbon-bar,
  .chip-ribbon-bar.catalog-open {
    left: 0;
  }

  /* Единственный скролл-контейнер ленты — сам .chip-ribbon */
  .chip-ribbon {
    display: flex;
    flex-wrap: nowrap;
    flex: 1 1 auto;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    padding: 4px;
  }

  .chip {
    min-height: 40px;
    padding: 6px 10px;
    white-space: nowrap;
  }
}
</style>
