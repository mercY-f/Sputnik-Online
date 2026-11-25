<template>
  <aside
    class="layer-controls"
    :class="{ 'inspector-open': inspectorOpen }"
    aria-label="Управление слоями сцены"
  >
    <button
      v-for="layer in layerItems"
      :key="layer.key"
      type="button"
      role="checkbox"
      :aria-checked="layersStore[layer.key] ? 'true' : 'false'"
      class="layer-checkbox"
      :class="{ checked: layersStore[layer.key] }"
      :data-layer="layer.key"
      @click="onToggle(layer.key)"
    >
      <span class="check-box" aria-hidden="true">
        {{ layersStore[layer.key] ? '[■]' : '[ ]' }}
      </span>
      <span class="layer-label">{{ layer.label }}</span>
    </button>
  </aside>
</template>

<script setup>
import { useLayersStore } from '@/stores/useLayersStore';

defineProps({
  inspectorOpen: {
    type: Boolean,
    default: false,
  },
});

const layersStore = useLayersStore();

// Порядок как в макете ui-1bit: сетка → орбиты → подписи → терминатор
const layerItems = [
  { key: 'grid', label: 'СЕТКА' },
  { key: 'orbits', label: 'ОРБИТЫ' },
  { key: 'labels', label: 'ПОДПИСИ' },
  { key: 'terminator', label: 'ТЕРМИНАТОР' },
];

function onToggle(key) {
  layersStore.toggle(key);
}
</script>

<style scoped>
.layer-controls {
  position: fixed;
  bottom: 12px;
  right: 12px;
  z-index: 40;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  background: var(--paper);
  border: 1px solid var(--ink);
  border-radius: 0;
  padding: 4px 8px;
  box-shadow: 2px 2px 0 var(--ink);
  transition: right 0.15s ease-out;
}

:global(body.inspector-open) .layer-controls,
.layer-controls.inspector-open {
  right: 368px;
}

.layer-checkbox {
  background: transparent;
  border: none;
  border-radius: 0;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  user-select: none;
  outline: none;
}

.layer-checkbox:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}

.layer-checkbox:hover {
  color: var(--ink);
  background: var(--surface);
}

.layer-checkbox.checked {
  color: var(--ink);
}

.layer-checkbox .check-box {
  font-size: 11px;
  line-height: 1;
}

.layer-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

@media (max-width: 640px) {
  .layer-controls {
    bottom: 8px;
    left: 8px;
    right: 8px;
    flex-wrap: wrap;
    gap: 2px 6px;
    justify-content: space-around;
    padding: 6px 8px;
    min-height: 40px;
  }

  .layer-checkbox {
    min-height: 40px;
    font-size: 11px;
    padding: 6px 4px;
  }
}
</style>
