<template>
  <aside
    class="inspector-panel"
    role="region"
    :aria-label="`Панель телеметрии спутника ${satellite?.name || ''}`"
  >
    <!-- Шапка инспектора A4 -->
    <header class="inspector-header">
      <div class="inspector-header-left">
        <span class="badge-square" :title="`Категория: ${categoryLabel}`">{{ badgeLetter }}</span>
        <span class="inspector-title" :title="satellite?.name">
          {{ satellite?.name || 'ЗАГРУЗКА АППАРАТА...' }}
        </span>
      </div>
      <button
        type="button"
        class="btn-square"
        title="Закрыть"
        aria-label="Закрыть панель телеметрии"
        @click="$emit('close')"
      >✕</button>
    </header>

    <div class="inspector-body">
      <!-- ASCII-схема аппарата A5 -->
      <AsciiSchematic
        :category="satellite?.category"
        :letter="badgeLetter"
      />

      <!-- Кнопки действий: Орбита / След / Следить / Поделиться -->
      <div class="actions-row">
        <button
          type="button"
          class="btn"
          :class="{ active: showOrbit }"
          title="Показать орбиту"
          :aria-pressed="showOrbit ? 'true' : 'false'"
          @click="showOrbit = !showOrbit"
        >ОРБИТА</button>
        <button
          type="button"
          class="btn"
          :class="{ active: showTrack }"
          title="Показать след"
          :aria-pressed="showTrack ? 'true' : 'false'"
          @click="showTrack = !showTrack"
        >СЛЕД</button>
        <button
          type="button"
          class="btn"
          :class="{ active: selectionStore.followMode }"
          title="Следить за аппаратом"
          :aria-pressed="selectionStore.followMode ? 'true' : 'false'"
          @click="toggleFollow"
        >СЛЕДИТЬ</button>
        <button
          type="button"
          class="btn"
          :class="{ active: shareCopied }"
          title="Поделиться ссылкой на спутник"
          @click="shareSatellite"
        >{{ shareCopied ? 'СКОПИРОВАНО!' : 'ПОДЕЛИТЬСЯ' }}</button>
      </div>

      <!-- Таблица параметров с подсказками A4 -->
      <div class="params-table">
        <div
          v-for="param in paramFields"
          :key="param.key"
          class="param-row"
          :class="{ 'param-row-block': param.isBlock }"
        >
          <div class="param-main">
            <span class="param-label">
              {{ param.label }}
              <button
                type="button"
                class="btn-help"
                :title="`Справка: ${param.label}`"
                :aria-expanded="openTips[param.key] ? 'true' : 'false'"
                @click="toggleTip(param.key)"
              >?</button>
            </span>

            <template v-if="param.key === 'purpose'">
              <div class="param-val-text">{{ param.val || '—' }}</div>
            </template>

            <template v-else-if="param.key === 'country'">
              <div class="param-val country-badge-group">
                <span
                  v-if="countryInfo.code"
                  class="country-badge"
                  :title="countryInfo.name"
                >{{ countryInfo.code }}</span>
                <span class="country-name-label">{{ countryInfo.name }}</span>
              </div>
            </template>

            <template v-else>
              <span class="param-val num">{{ param.val }}</span>
            </template>
          </div>

          <div
            v-if="openTips[param.key]"
            class="param-tip open"
          >
            <strong>{{ param.label }}:</strong> {{ param.tip }}<br>
            <em v-if="param.readingTip">{{ param.readingTip }}</em>
          </div>
        </div>
      </div>

      <!-- Мини-график орбиты A6 -->
      <OrbitProfileChart
        :orbit="orbit"
        :satellite="satellite"
      />

      <!-- Блок «Когда увидеть» -->
      <div class="pass-box">
        <div class="pass-title">КОГДА УВИДЕТЬ: {{ cityInput.toUpperCase() || 'МОСКВА' }}</div>
        <div class="pass-city-row">
          <label class="pass-city-label" for="pass-city-input">ГОРОД:</label>
          <input
            id="pass-city-input"
            v-model="cityInput"
            type="text"
            class="field"
            placeholder="МОСКВА"
            autocomplete="off"
            @change="fetchPasses"
            @keydown.enter="fetchPasses"
          >
          <button
            type="button"
            class="btn btn-geo"
            title="Определить по геолокации"
            @click="useCurrentLocation"
          >ГЕО</button>
        </div>

        <div class="pass-table">
          <div class="pass-table-head">
            <span>ВРЕМЯ</span>
            <span class="num pass-head-num pass-head-el">МАКС</span>
            <span class="pass-head-dir">LOS UTC</span>
            <span class="num pass-head-num">ДЛИТ</span>
          </div>

          <div v-if="passesLoading" class="pass-loading">
            РАСЧЁТ ПРОЛЁТОВ...
          </div>

          <div v-else-if="passesError" class="pass-empty">
            {{ passesError }}
          </div>

          <div v-else-if="formattedPasses.length === 0" class="pass-empty">
            ПРОЛЁТОВ В БЛИЖАЙШИЕ 24Ч НЕ НАЙДЕНО
          </div>

          <div v-else class="pass-rows">
            <div
              v-for="(p, idx) in formattedPasses"
              :key="idx"
              class="pass-row"
            >
              <span>{{ p.dayLabel }} <span class="num">{{ p.timeAos }}</span></span>
              <span class="num pass-cell-el">{{ p.maxEl }}°</span>
              <span class="pass-cell-los num">{{ p.timeLos }}</span>
              <span class="num pass-cell-dur">{{ p.durMin }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Подвал инспектора -->
    <footer class="inspector-footer">
      <button
        type="button"
        class="btn btn-full"
        :class="{ active: isFavorite }"
        @click="$emit('toggle-favorite')"
      >
        {{ isFavorite ? '★ В ИЗБРАННОМ' : 'В ИЗБРАННОЕ' }}
      </button>
    </footer>
  </aside>
</template>

<script setup>
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { CATEGORY_META } from '@/lib/categoryMeta';
import { computeOrbitParameters } from '@/lib/orbit';
import { orbitGlossary } from '@/data/orbitGlossary';
import { computePasses } from '@/lib/passes';
import AsciiSchematic from './AsciiSchematic.vue';
import OrbitProfileChart from './OrbitProfileChart.vue';

const props = defineProps({
  satellite: {
    type: Object,
    default: null,
  },
  categoryColor: {
    type: String,
    default: '#0E0E0E',
  },
  isFavorite: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['close', 'toggle-favorite']);

const selectionStore = useSelectionStore();

// Состояние кнопок карточки
const showOrbit = ref(true);
const showTrack = ref(true);
const shareCopied = ref(false);

// Раскрывающиеся подсказки параметров
const openTips = reactive({});
function toggleTip(key) {
  openTips[key] = !openTips[key];
}

// Расчёт параметров из TLE
const orbit = computed(() => {
  if (!props.satellite?.tle1 || !props.satellite?.tle2) return null;
  return computeOrbitParameters(props.satellite.tle1, props.satellite.tle2);
});

// Буква категории для квадратного бейджа
const badgeLetter = computed(() => {
  const cat = props.satellite?.category;
  if (cat && CATEGORY_META[cat]?.letter) {
    return CATEGORY_META[cat].letter;
  }
  return '×';
});

const categoryLabel = computed(() => {
  const cat = props.satellite?.category;
  if (cat && CATEGORY_META[cat]?.labelRu) {
    return CATEGORY_META[cat].labelRu;
  }
  return 'ДРУГОЕ';
});

// Номер в каталоге
const catalogNumber = computed(() => {
  return props.satellite?.catalogNumber ?? props.satellite?.catalog_number ?? orbit.value?.catalogNumber ?? '—';
});

// Координаты и параметры
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
    const km = props.satellite.alt < 20 ? props.satellite.alt * 6371 : props.satellite.alt;
    return `${km.toFixed(1)} км`;
  }
  if (orbit.value?.altitudeAvgKm != null) {
    return `${orbit.value.altitudeAvgKm.toFixed(1)} км`;
  }
  return '—';
});

const liveSpeed = computed(() => {
  if (orbit.value?.orbitalSpeedKmS != null) {
    return `${orbit.value.orbitalSpeedKmS.toFixed(2)} км/с`;
  }
  return '—';
});

// Маппинг стран
const COUNTRY_MAP = {
  RU: { code: 'RUS', name: 'РОССИЯ' },
  RUS: { code: 'RUS', name: 'РОССИЯ' },
  US: { code: 'USA', name: 'США' },
  USA: { code: 'USA', name: 'США' },
  CN: { code: 'CHN', name: 'КИТАЙ' },
  CHN: { code: 'CHN', name: 'КИТАЙ' },
  GB: { code: 'GBR', name: 'ВЕЛИКОБРИТАНИЯ' },
  UK: { code: 'GBR', name: 'ВЕЛИКОБРИТАНИЯ' },
  GBR: { code: 'GBR', name: 'ВЕЛИКОБРИТАНИЯ' },
  EU: { code: 'ESA', name: 'ESA' },
  ESA: { code: 'ESA', name: 'ESA' },
  JP: { code: 'JPN', name: 'ЯПОНИЯ' },
  JPN: { code: 'JPN', name: 'ЯПОНИЯ' },
  IN: { code: 'IND', name: 'ИНДИЯ' },
  IND: { code: 'IND', name: 'ИНДИЯ' },
  FR: { code: 'FRA', name: 'ФРАНЦИЯ' },
  FRA: { code: 'FRA', name: 'ФРАНЦИЯ' },
  DE: { code: 'DEU', name: 'ГЕРМАНИЯ' },
  DEU: { code: 'DEU', name: 'ГЕРМАНИЯ' },
  KZ: { code: 'KAZ', name: 'КАЗАХСТАН' },
  KAZ: { code: 'KAZ', name: 'КАЗАХСТАН' },
  CA: { code: 'CAN', name: 'КАНАДА' },
  CAN: { code: 'CAN', name: 'КАНАДА' },
  IT: { code: 'ITA', name: 'ИТАЛИЯ' },
  ITA: { code: 'ITA', name: 'ИТАЛИЯ' },
  AU: { code: 'AUS', name: 'АВСТРАЛИЯ' },
  AUS: { code: 'AUS', name: 'АВСТРАЛИЯ' },
  CIS: { code: 'RUS', name: 'РОССИЯ' },
  PRC: { code: 'CHN', name: 'КИТАЙ' },
};

const countryInfo = computed(() => {
  const code = (props.satellite?.country || '').toUpperCase().trim();
  const name = props.satellite?.country_name;

  if (COUNTRY_MAP[code]) {
    return {
      code: COUNTRY_MAP[code].code,
      name: name || COUNTRY_MAP[code].name,
    };
  }
  if (code) {
    return {
      code: code.slice(0, 3),
      name: name || code,
    };
  }
  return {
    code: null,
    name: name || 'Не определена',
  };
});

// Дата запуска
const launchDateFormatted = computed(() => {
  const dateStr = props.satellite?.launch_date;
  if (dateStr) {
    try {
      const d = new Date(dateStr);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      }
    } catch {
      // fallback
    }
    return dateStr;
  }
  if (orbit.value?.launchYear) {
    return `${orbit.value.launchYear} г.`;
  }
  return '—';
});

// Список полей параметров для таблицы
const paramFields = computed(() => {
  const o = orbit.value;
  return [
    {
      key: 'altitude',
      label: orbitGlossary.altitude.label.toUpperCase(),
      val: liveAltKm.value,
      tip: orbitGlossary.altitude.description,
      readingTip: orbitGlossary.altitude.readingTip,
    },
    {
      key: 'speed',
      label: orbitGlossary.speed.label.toUpperCase(),
      val: liveSpeed.value,
      tip: orbitGlossary.speed.description,
      readingTip: orbitGlossary.speed.readingTip,
    },
    {
      key: 'inclination',
      label: orbitGlossary.inclination.label.toUpperCase(),
      val: o?.inclination != null ? `${o.inclination.toFixed(2)}°` : '—',
      tip: orbitGlossary.inclination.description,
      readingTip: orbitGlossary.inclination.readingTip,
    },
    {
      key: 'period',
      label: orbitGlossary.period.label.toUpperCase(),
      val: o?.periodMinutes != null ? `${o.periodMinutes.toFixed(2)} мин` : '—',
      tip: orbitGlossary.period.description,
      readingTip: orbitGlossary.period.readingTip,
    },
    {
      key: 'apogee',
      label: 'АПОГЕЙ / ПЕРИГЕЙ',
      val: o?.apogeeKm != null && o?.perigeeKm != null
        ? `${Math.round(o.apogeeKm)} / ${Math.round(o.perigeeKm)} км`
        : '—',
      tip: `${orbitGlossary.apogee.description} / ${orbitGlossary.perigee.description}`,
      readingTip: `${orbitGlossary.apogee.readingTip} ${orbitGlossary.perigee.readingTip}`,
    },
    {
      key: 'eccentricity',
      label: orbitGlossary.eccentricity.label.toUpperCase(),
      val: o?.eccentricity != null ? o.eccentricity.toFixed(5) : '—',
      tip: orbitGlossary.eccentricity.description,
      readingTip: orbitGlossary.eccentricity.readingTip,
    },
    {
      key: 'coordinates',
      label: 'КООРДИНАТЫ',
      val: `${liveLat.value} / ${liveLng.value}`,
      tip: 'Текущие географические подспутниковые координаты (широта и долгота точки над поверхностью Земли).',
      readingTip: 'Широта: положительная — северная, отрицательная — южная. Долгота: положительная — восточная, отрицательная — западная.',
    },
    {
      key: 'epoch',
      label: orbitGlossary.epochAge.label.toUpperCase(),
      val: o?.epochAgeText ?? '—',
      tip: orbitGlossary.epochAge.description,
      readingTip: orbitGlossary.epochAge.readingTip,
    },
    {
      key: 'country',
      label: 'СТРАНА',
      val: countryInfo.value.name,
      tip: 'Принадлежность космического аппарата и юрисдикция запускающего государства.',
      readingTip: 'Государство регистрации спутника в реестре ООН.',
    },
    {
      key: 'launch',
      label: 'ЗАПУСК',
      val: launchDateFormatted.value,
      tip: 'Календарная дата вывода аппарата на околоземную орбиту.',
      readingTip: 'Дата старта ракеты-носителя.',
    },
    {
      key: 'purpose',
      label: 'НАЗНАЧЕНИЕ',
      val: props.satellite?.purpose || 'Назначение не определено',
      tip: 'Функциональная задача и класс полезной нагрузки космического аппарата.',
      readingTip: 'Связь, навигация, научные исследования, дистанционное зондирование Земли.',
      isBlock: true,
    },
  ];
});

// Действие «Следить»
function toggleFollow() {
  selectionStore.setFollow(!selectionStore.followMode);
}

// Действие «Поделиться»
async function shareSatellite() {
  const catNum = catalogNumber.value;
  const url = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?sat=${catNum}#${catNum}`
    : `?sat=${catNum}`;

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else if (typeof document !== 'undefined') {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    shareCopied.value = true;
    setTimeout(() => {
      shareCopied.value = false;
    }, 2000);
  } catch {
    // fallback
  }
}

// Блок «Когда увидеть»
const cityInput = ref('МОСКВА');
const observerCoords = ref({ lat: 55.75, lng: 37.62 });
const passes = ref([]);
const passesLoading = ref(false);
const passesError = ref(null);

const CITY_COORDS = {
  'МОСКВА': { lat: 55.75, lng: 37.62 },
  'MOSCOW': { lat: 55.75, lng: 37.62 },
  'САНКТ-ПЕТЕРБУРГ': { lat: 59.93, lng: 30.33 },
  'СПБ': { lat: 59.93, lng: 30.33 },
  'НОВОСИБИРСК': { lat: 55.03, lng: 82.92 },
  'ЕКАТЕРИНБУРГ': { lat: 56.84, lng: 60.61 },
  'КАЗАНЬ': { lat: 55.79, lng: 49.12 },
  'ВЛАДИВОСТОК': { lat: 43.12, lng: 131.89 },
  'СОЧИ': { lat: 43.58, lng: 39.72 },
  'БАЙКОНУР': { lat: 45.96, lng: 63.31 },
  'ТОКИО': { lat: 35.68, lng: 139.69 },
  'ЛОНДОН': { lat: 51.51, lng: -0.13 },
  'ПАРИЖ': { lat: 48.85, lng: 2.35 },
  'БЕРЛИН': { lat: 52.52, lng: 13.40 },
  'НЬЮ-ЙОРК': { lat: 40.71, lng: -74.01 },
};

function resolveCoords(name) {
  const norm = (name || '').trim().toUpperCase();
  if (CITY_COORDS[norm]) {
    return CITY_COORDS[norm];
  }
  // Хэш-фоллбек для произвольного города
  let h = 0;
  for (let i = 0; i < norm.length; i++) {
    h = ((h << 5) - h) + norm.charCodeAt(i);
    h |= 0;
  }
  const lat = ((Math.abs(h) % 1100) / 10) - 45;
  const lng = ((Math.abs(h >> 3) % 3600) / 10) - 180;
  return { lat, lng };
}

async function fetchPasses() {
  if (!props.satellite?.tle1 || !props.satellite?.tle2) {
    passes.value = [];
    passesError.value = 'ДАННЫЕ TLE НЕДОСТУПНЫ ДЛЯ РАСЧЁТА';
    return;
  }

  passesLoading.value = true;
  passesError.value = null;

  try {
    const coords = resolveCoords(cityInput.value);
    observerCoords.value = coords;

    const from = new Date();
    const to = new Date(from.getTime() + 24 * 3600 * 1000);

    const result = await computePasses({
      observerLat: coords.lat,
      observerLon: coords.lng,
      observerAltM: 0,
      tle1: props.satellite.tle1,
      tle2: props.satellite.tle2,
      from,
      to,
      minElDeg: 10,
    });

    passes.value = Array.isArray(result) ? result : [];
  } catch (err) {
    passes.value = [];
    passesError.value = 'ОШИБКА ВЫЧИСЛЕНИЯ ПРОЛЁТОВ';
  } finally {
    passesLoading.value = false;
  }
}

function useCurrentLocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    passesError.value = 'ГЕОЛОКАЦИЯ НЕДОСТУПНА';
    return;
  }

  passesLoading.value = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      observerCoords.value = { lat, lng };
      cityInput.value = `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
      fetchPasses();
    },
    () => {
      passesLoading.value = false;
      passesError.value = 'ДОСТУП К ГЕОЛОКАЦИИ ОТКЛОНЁН';
    },
    { timeout: 8000 }
  );
}

const formattedPasses = computed(() => {
  const now = new Date();
  const todayDay = now.getUTCDate();

  return passes.value.map((p) => {
    const aos = new Date(p.aos);
    const los = new Date(p.los);

    const isToday = aos.getUTCDate() === todayDay;
    const dayLabel = isToday ? 'СЕГОДНЯ' : 'ЗАВТРА';

    const hA = String(aos.getUTCHours()).padStart(2, '0');
    const mA = String(aos.getUTCMinutes()).padStart(2, '0');
    const timeAos = `${hA}:${mA}`;

    const hL = String(los.getUTCHours()).padStart(2, '0');
    const mL = String(los.getUTCMinutes()).padStart(2, '0');
    const timeLos = `${hL}:${mL}`;

    const durMs = Math.max(0, los.getTime() - aos.getTime());
    const durMin = `${Math.max(1, Math.round(durMs / 60000))} МИН`;

    return {
      dayLabel,
      timeAos,
      timeLos,
      maxEl: Math.round(p.maxEl),
      durMin,
    };
  });
});

watch(
  () => props.satellite,
  () => {
    fetchPasses();
  },
  { immediate: true }
);

onMounted(() => {
  fetchPasses();
});
</script>

<style scoped>
.inspector-panel {
  width: 100%;
  background: var(--paper);
  border: 1px solid var(--ink);
  border-radius: 0;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 2px 0 var(--ink);
  color: var(--ink);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}

.inspector-header {
  padding: 8px 10px;
  border-bottom: 2px solid var(--ink);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface);
}

.inspector-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.badge-square {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid var(--ink);
  border-radius: 0;
  font-size: 11px;
  font-weight: 700;
  background: var(--paper);
  color: var(--ink);
  flex-shrink: 0;
}

.inspector-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-square {
  width: 28px;
  height: 28px;
  border: 1px solid var(--ink);
  border-radius: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.btn-square:hover {
  background: var(--surface);
}

.btn-square:active {
  background: var(--ink);
  color: var(--paper);
}

.btn-square:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}

.inspector-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.actions-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
}

.btn {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 6px 8px;
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--ink);
  border-radius: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.btn:hover {
  background: var(--surface);
}

.btn:active,
.btn.active {
  background: var(--ink);
  color: var(--paper);
}

.btn:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}

/* Таблица параметров A4 */
.params-table {
  border-top: 1px solid rgba(14, 14, 14, 0.2);
  width: 100%;
}

.param-row {
  border-bottom: 1px solid rgba(14, 14, 14, 0.2);
}

.param-row-block .param-main {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 6px 0;
}

.param-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 5px 0;
  gap: 8px;
}

.param-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-muted);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.btn-help {
  background: transparent;
  border: 1px solid var(--ink-muted);
  border-radius: 0;
  color: var(--ink-muted);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  width: 14px;
  height: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.btn-help:hover {
  background: var(--surface);
  color: var(--ink);
  border-color: var(--ink);
}

.btn-help:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}

.param-val {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
  text-align: right;
  word-break: break-all;
}

.param-val-text {
  font-size: 11px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--ink);
  text-align: left;
  word-break: break-word;
}

.param-tip {
  padding: 6px 8px;
  background: var(--surface);
  font-size: 11px;
  line-height: 1.35;
  color: var(--ink);
  border-left: 2px solid var(--ink);
  margin-bottom: 4px;
}

.country-badge-group {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  justify-content: flex-end;
  text-align: right;
}

.country-badge {
  border: 1px solid var(--ink);
  border-radius: 0;
  background: var(--surface);
  padding: 1px 4px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
}

.country-name-label {
  font-size: 11px;
  font-weight: 700;
}

/* Блок «Когда увидеть» */
.pass-box {
  border: 1px solid var(--ink);
  border-radius: 0;
  padding: 8px;
  background: var(--surface);
}

.pass-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 6px;
}

.pass-city-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}

.pass-city-label {
  font-size: 11px;
  color: var(--ink-muted);
  text-transform: uppercase;
  font-weight: 700;
}

.field {
  border: 1px solid var(--ink);
  border-radius: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  padding: 2px 6px;
  text-transform: uppercase;
  flex: 1;
  min-width: 0;
}

.field:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}

.btn-geo {
  font-size: 10px;
  padding: 2px 6px;
  height: 23px;
}

.pass-table {
  width: 100%;
  border-top: 1px solid var(--ink);
  margin-top: 6px;
}

.pass-table-head {
  display: grid;
  grid-template-columns: 2fr 0.8fr 1.6fr 0.8fr;
  gap: 4px;
  padding: 4px 0;
  border-bottom: 1px solid var(--ink);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
  white-space: nowrap;
}

.pass-row {
  display: grid;
  grid-template-columns: 2fr 0.8fr 1.6fr 0.8fr;
  gap: 4px;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px solid rgba(14, 14, 14, 0.2);
  font-size: 11px;
  white-space: nowrap;
}

.pass-row:last-child {
  border-bottom: none;
}

.pass-head-num,
.pass-cell-el,
.pass-cell-dur {
  text-align: right;
}

.pass-empty,
.pass-loading {
  padding: 8px 0;
  font-size: 11px;
  color: var(--ink-muted);
  text-transform: uppercase;
  text-align: center;
}

.inspector-footer {
  padding: 8px 10px;
  border-top: 2px solid var(--ink);
  background: var(--paper);
}

.btn-full {
  width: 100%;
  padding: 8px 12px;
}

@media (max-width: 639px) {
  .actions-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
