<template>
  <aside
    class="layer-controls"
    :class="{ 'inspector-open': inspectorOpen }"
    aria-label="Управление слоями сцены"
  >
    <button
      type="button"
      role="checkbox"
      :aria-checked="layersStore.terminator ? 'true' : 'false'"
      class="layer-checkbox"
      :class="{ checked: layersStore.terminator }"
      data-layer="terminator"
      @click="onToggleTerminator"
    >
      <span class="check-box" aria-hidden="true">
        {{ layersStore.terminator ? '[■]' : '[ ]' }}
      </span>
      <span class="layer-label">ТЕРМИНАТОР</span>
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

function onToggleTerminator() {
  layersStore.toggle('terminator');
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
  background: var(--paper);
  border: 1px solid var(--ink);
  border-radius: 0;
  padding: 4px 8px;
  box-shadow: 2px 2px 0 var(--ink);
  transition: right 0.15s ease-out;
}

:global(body.inspector-open) .layer-controls,
.layer-controls.inspector-open {
  right: 332px;
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
    justify-content: space-around;
    padding: 6px 8px;
  }

  .layer-checkbox {
    min-height: 40px;
    font-size: 11px;
    padding: 6px 4px;
  }
}
</style>
