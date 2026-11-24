<template>
  <div class="chart-box" role="region" aria-label="График высоты орбиты по времени">
    <div class="chart-title">
      <span>ВЫСОТА ПО ВРЕМЕНИ</span>
      <span class="num chart-period">{{ periodText }}</span>
    </div>
    <svg
      class="chart-svg"
      viewBox="0 0 296 100"
      width="296"
      height="100"
      role="img"
      aria-label="Профиль высоты орбиты (step-line)"
    >
      <!-- Сетка (горизонтальные линии) -->
      <line
        x1="46"
        y1="14"
        x2="286"
        y2="14"
        stroke="#5C5A54"
        stroke-dasharray="2,2"
        opacity="0.35"
      />
      <line
        x1="46"
        y1="47"
        x2="286"
        y2="47"
        stroke="#5C5A54"
        stroke-dasharray="2,2"
        opacity="0.35"
      />
      <line
        x1="46"
        y1="80"
        x2="286"
        y2="80"
        stroke="#5C5A54"
        stroke-dasharray="2,2"
        opacity="0.35"
      />

      <!-- Сетка (вертикальные линии 1/3T, 2/3T) -->
      <line
        x1="125"
        y1="14"
        x2="125"
        y2="80"
        stroke="#5C5A54"
        stroke-dasharray="2,2"
        opacity="0.35"
      />
      <line
        x1="204"
        y1="14"
        x2="204"
        y2="80"
        stroke="#5C5A54"
        stroke-dasharray="2,2"
        opacity="0.35"
      />

      <!-- Оси координат -->
      <line x1="46" y1="14" x2="46" y2="80" stroke="#0E0E0E" stroke-width="1" />
      <line x1="46" y1="80" x2="286" y2="80" stroke="#0E0E0E" stroke-width="1" />

      <!-- Подписи оси Y (высота) -->
      <text
        x="42"
        y="18"
        font-family="var(--font-mono, monospace)"
        font-size="11"
        fill="#5C5A54"
        text-anchor="end"
        class="num"
      >{{ maxAlt }}</text>
      <text
        x="42"
        y="50"
        font-family="var(--font-mono, monospace)"
        font-size="11"
        fill="#5C5A54"
        text-anchor="end"
        class="num"
      >{{ midAlt }}</text>
      <text
        x="42"
        y="80"
        font-family="var(--font-mono, monospace)"
        font-size="11"
        fill="#5C5A54"
        text-anchor="end"
        class="num"
      >{{ minAlt }}</text>

      <!-- Подписи оси X (время витка) -->
      <text
        x="46"
        y="94"
        font-family="var(--font-mono, monospace)"
        font-size="11"
        fill="#5C5A54"
        text-anchor="start"
      >0</text>
      <text
        x="125"
        y="94"
        font-family="var(--font-mono, monospace)"
        font-size="11"
        fill="#5C5A54"
        text-anchor="middle"
      >1/3T</text>
      <text
        x="204"
        y="94"
        font-family="var(--font-mono, monospace)"
        font-size="11"
        fill="#5C5A54"
        text-anchor="middle"
      >2/3T</text>
      <text
        x="286"
        y="94"
        font-family="var(--font-mono, monospace)"
        font-size="11"
        fill="#5C5A54"
        text-anchor="end"
      >1T</text>

      <!-- Step-line траектория профиля -->
      <path
        :d="pathD"
        fill="none"
        stroke="#0E0E0E"
        stroke-width="1.5"
      />
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  orbit: {
    type: Object,
    default: null,
  },
  satellite: {
    type: Object,
    default: null,
  },
});

const altKm = computed(() => {
  if (typeof props.satellite?.altKm === 'number') return props.satellite.altKm;
  if (typeof props.satellite?.alt === 'number') {
    return props.satellite.alt < 20 ? props.satellite.alt * 6371 : props.satellite.alt;
  }
  if (props.orbit?.altitudeAvgKm != null) return props.orbit.altitudeAvgKm;
  return 500;
});

const maxAlt = computed(() => {
  if (props.orbit?.apogeeKm != null && !Number.isNaN(props.orbit.apogeeKm)) {
    return Math.round(props.orbit.apogeeKm);
  }
  return Math.round(altKm.value * 1.05 + 10);
});

const minAlt = computed(() => {
  if (props.orbit?.perigeeKm != null && !Number.isNaN(props.orbit.perigeeKm)) {
    return Math.round(props.orbit.perigeeKm);
  }
  return Math.max(0, Math.round(altKm.value * 0.95 - 10));
});

const midAlt = computed(() => {
  return Math.round((maxAlt.value + minAlt.value) / 2);
});

const periodText = computed(() => {
  if (props.orbit?.periodMinutes != null) {
    return `${props.orbit.periodMinutes.toFixed(1)} мин`;
  }
  if (props.satellite?.period) {
    const p = parseFloat(props.satellite.period);
    return !Number.isNaN(p) ? `${p.toFixed(1)} мин` : `${props.satellite.period}`;
  }
  return '90.0 мин';
});

const pathD = computed(() => {
  const padLeft = 46;
  const padTop = 14;
  const plotW = 240;
  const plotH = 66;
  const steps = 18;
  let d = '';

  for (let i = 0; i <= steps; i++) {
    const x = Math.round(padLeft + (i / steps) * plotW);
    const normY = (Math.sin((i / steps) * Math.PI * 2) + 1) / 2;
    const rawY = padTop + (1 - normY) * plotH;
    const y = Math.round(rawY / 2) * 2;
    if (i === 0) {
      d += `M ${x} ${y}`;
    } else {
      d += ` H ${x} V ${y}`;
    }
  }

  return d;
});
</script>

<style scoped>
.chart-box {
  border: 1px solid var(--ink);
  border-radius: 0;
  background: var(--surface);
  padding: 8px;
}

.chart-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: 6px;
}

.chart-period {
  font-size: 11px;
  color: var(--ink);
}

.chart-svg {
  display: block;
  width: 100%;
  height: auto;
  shape-rendering: crispEdges;
}
</style>
