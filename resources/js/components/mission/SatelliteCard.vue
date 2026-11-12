<script setup>
import { computed } from 'vue';
import {
  X,
  Info,
  Rocket,
  Activity,
  Compass,
  Calendar,
  Clock,
  Globe,
} from 'lucide-vue-next';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { computeOrbitParameters } from '@/lib/orbit';
import { orbitGlossary } from '@/data/orbitGlossary';

const props = defineProps({
  satellite: {
    type: Object,
    default: null,
  },
  categoryColor: {
    type: String,
    default: '#10b981',
  },
  isFavorite: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['close', 'toggle-favorite']);

// Орбитальные параметры из TLE
const orbit = computed(() => {
  if (!props.satellite?.tle1 || !props.satellite?.tle2) return null;
  return computeOrbitParameters(props.satellite.tle1, props.satellite.tle2);
});

// Каталожный номер
const catalogNumber = computed(() => {
  return props.satellite?.catalogNumber ?? props.satellite?.catalog_number ?? orbit.value?.catalogNumber ?? '—';
});

// Живые координаты и высота
const liveLat = computed(() => {
  const v = props.satellite?.lat;
  return typeof v === 'number' && !Number.isNaN(v) ? `${v.toFixed(2)}°` : '—';
});

const liveLng = computed(() => {
  const v = props.satellite?.lng;
  return typeof v === 'number' && !Number.isNaN(v) ? `${v.toFixed(2)}°` : '—';
});

const liveAltKm = computed(() => {
  if (typeof props.satellite?.altKm === 'number') {
    return `${props.satellite.altKm.toFixed(1)} км`;
  }
  if (typeof props.satellite?.alt === 'number') {
    return `${(props.satellite.alt * 6371).toFixed(1)} км`;
  }
  if (orbit.value?.altitudeAvgKm != null) {
    return `~${orbit.value.altitudeAvgKm.toFixed(1)} км`;
  }
  return '—';
});

const liveSpeed = computed(() => {
  if (orbit.value?.orbitalSpeedKmS != null) {
    return `${orbit.value.orbitalSpeedKmS.toFixed(2)} км/с`;
  }
  return '—';
});

// Маппинг флагов стран
function getCountryFlag(code) {
  if (!code) return '🛰️';
  const upper = String(code).toUpperCase().trim();
  const special = {
    CIS: '🇷🇺',
    PRC: '🇨🇳',
    UK: '🇬🇧',
    GER: '🇩🇪',
    JPN: '🇯🇵',
    IND: '🇮🇳',
    ESA: '🇪🇺',
    EU: '🇪🇺',
    UN: '🇺🇳',
    ISS: '🌐',
    SKOR: '🇰🇷',
    NKOR: '🇰🇵',
    SPN: '🇪🇸',
    TURK: '🇹🇷',
    ARGN: '🇦🇷',
    BRAZ: '🇧🇷',
    BELA: '🇧🇾',
    KAZ: '🇰🇿',
    UKR: '🇺🇦',
    AZER: '🇦🇿',
    SWED: '🇸🇪',
    SWTZ: '🇨🇭',
    NETH: '🇳🇱',
    ORB: '🇺🇸',
    GLOB: '🇺🇸',
    SES: '🇱🇺',
    EUTE: '🇫🇷',
    IM: '🇬🇧',
    CA: '🇨🇦',
    US: '🇺🇸',
    FR: '🇫🇷',
    IT: '🇮🇹',
    AU: '🇦🇺',
  };
  if (special[upper]) return special[upper];
  if (upper.length === 2 && /^[A-Z]{2}$/.test(upper)) {
    return String.fromCodePoint(...[...upper].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
  }
  return '🌐';
}

const countryDisplay = computed(() => {
  const countryCode = props.satellite?.country;
  const countryName = props.satellite?.country_name;
  const flag = getCountryFlag(countryCode);

  if (countryName) {
    return { flag, name: countryName, code: countryCode };
  }
  if (countryCode) {
    return { flag, name: countryCode, code: countryCode };
  }
  return { flag: '🛰️', name: 'Не определена', code: null };
});

// Склонение числительных
function plural(n, forms) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

// Дата запуска и время в космосе
const launchInfo = computed(() => {
  const dateStr = props.satellite?.launch_date;
  let formattedDate = '—';
  let inSpaceText = null;

  if (dateStr) {
    try {
      const d = new Date(dateStr);
      if (!Number.isNaN(d.getTime())) {
        formattedDate = d.toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

        const now = new Date();
        let years = now.getFullYear() - d.getFullYear();
        let months = now.getMonth() - d.getMonth();
        if (now.getDate() < d.getDate()) months--;
        if (months < 0) {
          years--;
          months += 12;
        }

        if (years > 0 && months > 0) {
          inSpaceText = `${years} ${plural(years, ['год', 'года', 'лет'])} ${months} ${plural(months, ['месяц', 'месяца', 'месяцев'])}`;
        } else if (years > 0) {
          inSpaceText = `${years} ${plural(years, ['год', 'года', 'лет'])}`;
        } else if (months > 0) {
          inSpaceText = `${months} ${plural(months, ['месяц', 'месяца', 'месяцев'])}`;
        } else {
          const days = Math.max(0, Math.floor((now - d) / 86400000));
          inSpaceText = `${days} ${plural(days, ['день', 'дня', 'дней'])}`;
        }
      }
    } catch {
      formattedDate = dateStr;
    }
  } else if (orbit.value?.launchYear) {
    formattedDate = `${orbit.value.launchYear} г. (из TLE)`;
    const nowYear = new Date().getFullYear();
    const yDiff = nowYear - orbit.value.launchYear;
    if (yDiff >= 0) {
      inSpaceText = `~${yDiff} ${plural(yDiff, ['год', 'года', 'лет'])}`;
    }
  }

  const launchSite = props.satellite?.launch_site || '—';

  return {
    date: formattedDate,
    inSpace: inSpaceText ? `${inSpaceText} в космосе` : null,
    site: launchSite,
  };
});

// Читаемый тип объекта
const objectTypeDisplay = computed(() => {
  const t = props.satellite?.object_type;
  if (!t) return null;
  const upper = String(t).toUpperCase().trim();
  if (upper === 'PAY') return 'Полезная нагрузка (PAY)';
  if (upper === 'R/B') return 'Корпус ракеты (R/B)';
  if (upper === 'DEB') return 'Космический мусор (DEB)';
  return upper;
});

// Сетка параметров полёта
const flightParameters = computed(() => {
  const o = orbit.value;
  return [
    {
      key: 'altitude',
      label: orbitGlossary.altitude.label,
      value: liveAltKm.value,
      tip: orbitGlossary.altitude.description,
      reading: orbitGlossary.altitude.readingTip,
      live: true,
    },
    {
      key: 'speed',
      label: orbitGlossary.speed.label,
      value: liveSpeed.value,
      tip: orbitGlossary.speed.description,
      reading: orbitGlossary.speed.readingTip,
      live: true,
    },
    {
      key: 'period',
      label: orbitGlossary.period.label,
      value: o?.periodMinutes ? `${o.periodMinutes} мин` : '—',
      tip: orbitGlossary.period.description,
      reading: orbitGlossary.period.readingTip,
    },
    {
      key: 'inclination',
      label: orbitGlossary.inclination.label,
      value: o?.inclination != null ? `${o.inclination}°` : '—',
      tip: orbitGlossary.inclination.description,
      reading: orbitGlossary.inclination.readingTip,
    },
    {
      key: 'apogee',
      label: 'Апогей / Перигей',
      value: o?.apogeeKm != null && o?.perigeeKm != null ? `${o.apogeeKm} / ${o.perigeeKm} км` : '—',
      tip: `${orbitGlossary.apogee.description} / ${orbitGlossary.perigee.description}`,
      reading: `${orbitGlossary.apogee.readingTip} ${orbitGlossary.perigee.readingTip}`,
    },
    {
      key: 'eccentricity',
      label: orbitGlossary.eccentricity.label,
      value: o?.eccentricity != null ? o.eccentricity.toFixed(5) : '—',
      tip: orbitGlossary.eccentricity.description,
      reading: orbitGlossary.eccentricity.readingTip,
    },
    {
      key: 'orbitType',
      label: orbitGlossary.orbitType.label,
      value: o?.orbitType?.code ?? '—',
      subValue: o?.orbitType?.name,
      tip: orbitGlossary.orbitType.description,
      reading: o?.orbitType?.description || orbitGlossary.orbitType.readingTip,
    },
    {
      key: 'coords',
      label: 'Координаты',
      value: `${liveLat.value}, ${liveLng.value}`,
      tip: 'Текущие географические подспутниковые координаты (широта и долгота точки над поверхностью Земли).',
      reading: 'Широта: положительная — северная, отрицательная — южная. Долгота: положительная — восточная, отрицательная — западная.',
      live: true,
    },
    {
      key: 'meanMotion',
      label: orbitGlossary.meanMotion.label,
      value: o?.meanMotion ? `${o.meanMotion.toFixed(2)} об/сут` : '—',
      tip: orbitGlossary.meanMotion.description,
      reading: orbitGlossary.meanMotion.readingTip,
    },
    {
      key: 'epochAge',
      label: orbitGlossary.epochAge.label,
      value: o?.epochAgeText ?? '—',
      tip: orbitGlossary.epochAge.description,
      reading: orbitGlossary.epochAge.readingTip,
    },
  ];
});
</script>
<template>
  <TooltipProvider :delay-duration="150">
    <article
      class="satellite-card"
      role="region"
      :aria-label="`Карточка спутника ${satellite?.name || ''}`"
    >
      <!-- (1) ШАПКА КАРТОЧКИ -->
      <header class="card-section header-section">
        <div class="header-main">
          <div class="title-row">
            <h3 class="sat-title" :title="satellite?.name">
              {{ satellite?.name || 'Загрузка аппарата...' }}
            </h3>
            <button
              type="button"
              class="close-btn"
              aria-label="Закрыть карточку спутника"
              title="Закрыть карточку"
              @click="$emit('close')"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div class="meta-row">
            <!-- NORAD номер -->
            <span class="catalog-badge" title="Номер в каталоге NORAD / SATCAT">
              #{{ catalogNumber }}
            </span>

            <!-- Категория -->
            <span
              v-if="satellite?.category"
              class="category-badge"
              :style="{
                borderColor: `${categoryColor}40`,
                backgroundColor: `${categoryColor}15`,
                color: categoryColor,
              }"
            >
              <span class="dot" :style="{ backgroundColor: categoryColor }"></span>
              {{ satellite.category }}
            </span>

            <!-- Страна / Владелец -->
            <div class="country-pill" :title="`Принадлежность: ${countryDisplay.name}`">
              <span class="flag-icon">{{ countryDisplay.flag }}</span>
              <span class="country-text">{{ countryDisplay.name }}</span>
            </div>
          </div>
        </div>
      </header>

      <!-- ТЕЛО КАРТОЧКИ -->
      <div class="card-body">
        <!-- (2) СЕКЦИЯ: НАЗНАЧЕНИЕ -->
        <section class="card-section purpose-section">
          <div class="section-label">
            <Compass class="section-icon text-emerald-400" />
            <span>Назначение</span>
            <span v-if="objectTypeDisplay" class="object-type-tag">
              {{ objectTypeDisplay }}
            </span>
          </div>
          <div class="purpose-content">
            <p class="purpose-text">
              {{ satellite?.purpose || 'Назначение не определено' }}
            </p>
          </div>
        </section>

        <!-- (3) СЕКЦИЯ: ЗАПУСК -->
        <section class="card-section launch-section">
          <div class="section-label">
            <Rocket class="section-icon text-cyan-400" />
            <span>Запуск и миссия</span>
          </div>
          <div class="launch-grid">
            <div class="launch-item">
              <span class="sub-label">Дата запуска</span>
              <span class="item-value">{{ launchInfo.date }}</span>
            </div>
            <div class="launch-item">
              <span class="sub-label">Космодром</span>
              <span class="item-value truncate" :title="launchInfo.site">{{ launchInfo.site }}</span>
            </div>
            <div v-if="launchInfo.inSpace" class="launch-duration col-span-2">
              <Clock class="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>{{ launchInfo.inSpace }}</span>
            </div>
          </div>
        </section>

        <!-- (4) СЕКЦИЯ: ПАРАМЕТРЫ ПОЛЁТА -->
        <section class="card-section flight-section">
          <div class="section-label">
            <Activity class="section-icon text-amber-400" />
            <span>Параметры полёта</span>
            <span class="live-indicator">
              <span class="live-dot"></span>
              ONLINE
            </span>
          </div>

          <div class="params-grid">
            <Tooltip
              v-for="param in flightParameters"
              :key="param.key"
            >
              <TooltipTrigger as-child>
                <div
                  tabindex="0"
                  role="button"
                  :aria-label="`Параметр: ${param.label}. Нажмите для описания.`"
                  class="param-tile focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400"
                >
                  <div class="param-header">
                    <span class="param-label">{{ param.label }}</span>
                    <Info class="param-info-icon" />
                  </div>
                  <div class="param-value-container">
                    <span class="param-value">{{ param.value }}</span>
                    <span v-if="param.subValue" class="param-subvalue">{{ param.subValue }}</span>
                  </div>
                </div>
              </TooltipTrigger>

              <TooltipContent
                side="top"
                class="glossary-tooltip-content"
              >
                <div class="tooltip-inner">
                  <div class="tooltip-title">{{ param.label }}</div>
                  <p class="tooltip-desc">{{ param.tip }}</p>
                  <div class="tooltip-reading">
                    <span class="tooltip-tag">Как читать:</span>
                    {{ param.reading }}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </section>
      </div>
    </article>
  </TooltipProvider>
</template>

<style scoped>
.satellite-card {
  width: 100%;
  background: rgba(10, 10, 12, 0.65);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.15);
  color: #f1f5f9;
  font-family: inherit;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.card-section {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.card-section:last-child {
  border-bottom: none;
}

/* Шапка */
.header-section {
  background: rgba(255, 255, 255, 0.02);
  padding: 14px;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.sat-title {
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #ffffff;
  line-height: 1.25;
  word-break: break-word;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
  color: #ef4444;
}

.close-btn:focus-visible {
  outline: 2px solid #10b981;
  outline-offset: 1px;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.catalog-badge {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.72rem;
  color: #34d399;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 6px;
  padding: 2px 6px;
}

.category-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid;
  padding: 2px 7px;
}

.category-badge .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.country-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 0.75rem;
  color: #cbd5e1;
  max-width: 180px;
}

.country-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Заголовки секций */
.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  margin-bottom: 8px;
}

.section-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.object-type-tag {
  margin-left: auto;
  font-size: 0.65rem;
  color: #64748b;
  background: rgba(255, 255, 255, 0.03);
  padding: 1px 5px;
  border-radius: 4px;
}

.live-indicator {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.65rem;
  font-weight: 600;
  color: #10b981;
}

.live-dot {
  width: 6px;
  height: 6px;
  background: #10b981;
  border-radius: 50%;
  animation: pulse-dot 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.2); }
}

/* Назначение */
.purpose-text {
  font-size: 0.85rem;
  line-height: 1.35;
  color: #e2e8f0;
  font-weight: 500;
}

/* Запуск */
.launch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.launch-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sub-label {
  font-size: 0.68rem;
  color: #64748b;
}

.item-value {
  font-size: 0.8rem;
  color: #cbd5e1;
  font-weight: 500;
}

.launch-duration {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  font-size: 0.75rem;
  color: #10b981;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.15);
  padding: 4px 8px;
  border-radius: 6px;
}

/* Сетка параметров */
.params-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.param-tile {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  cursor: help;
  transition: all 0.15s ease;
}

.param-tile:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(16, 185, 129, 0.3);
  transform: translateY(-1px);
}

.param-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.param-label {
  font-size: 0.68rem;
  color: #94a3b8;
  border-bottom: 1px dashed rgba(148, 163, 184, 0.4);
}

.param-info-icon {
  width: 11px;
  height: 11px;
  color: #64748b;
  flex-shrink: 0;
}

.param-tile:hover .param-info-icon {
  color: #34d399;
}

.param-value-container {
  display: flex;
  flex-direction: column;
}

.param-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem;
  font-weight: 600;
  color: #f8fafc;
}

.param-subvalue {
  font-size: 0.65rem;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Тултип глоссария */
.glossary-tooltip-content {
  max-width: 280px;
  padding: 10px 12px;
  background: rgba(15, 23, 42, 0.95);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  border-radius: 10px;
  color: #f1f5f9;
  z-index: 60;
}

.tooltip-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: #34d399;
  margin-bottom: 4px;
}

.tooltip-desc {
  font-size: 0.72rem;
  line-height: 1.35;
  color: #cbd5e1;
  margin-bottom: 6px;
}

.tooltip-reading {
  font-size: 0.68rem;
  line-height: 1.3;
  color: #94a3b8;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 5px;
}

.tooltip-tag {
  color: #38bdf8;
  font-weight: 600;
  margin-right: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .satellite-card,
  .param-tile,
  .close-btn {
    transition: none !important;
    transform: none !important;
  }
  .live-dot {
    animation: none !important;
  }
}
</style>

