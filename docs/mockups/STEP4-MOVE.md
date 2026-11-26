# Шаг 4: Разделение Index.vue (Инвентаризация и граница интерфейсов)

Данный документ фиксирует результаты механического разделения файла `resources/js/Pages/Globe/Index.vue` на UI-часть (`Index.vue`) и 3D-сцену (`resources/js/composables/useGlobeScene.js`) согласно плану миграции на 1-битный дизайн (`docs/mockups/PLAN-MIGRATE-1BIT.md` §5).

Документ служит справочником для независимой работы параллельных треков:
- **Трек U (UI-панели):** владеет `Index.vue` (шаблон, панельный скрипт, стили), компонентами шапки, ящика каталога, карточки аппарата, новостей и мобильных листов (стадии U1–U6).
- **Трек D (3D-сцена):** владеет `resources/js/composables/useGlobeScene.js` и библиотеками `resources/js/lib/globe/*`, реализует 1-битную графику, терминатор, глифы, ретикл и расчёт пролётов (стадии D0–D5).

---

## 1. Граница разделения и владение файлами

| Файл | Владелец (трек) | Назначение после Шага 4 |
|---|---|---|
| `resources/js/Pages/Globe/Index.vue` | **Трек U** | Шаблон (1–216, не изменён), панельное состояние (auth, favorites, categories), монтирование/размонтирование UI, scoped-стили |
| `resources/js/composables/useGlobeScene.js` | **Трек D** | Инициализация Globe, Three.js, камеры, материалов, шейдеров, SGP4-воркера, рендер-цикла, пикинга, LOD, фрустум/лимб-куллинга и teardown |
| `resources/js/lib/globe/*` | **Трек D** | Вспомогательные модули сцены (`useGlobeDisposer.js` и др.) |
| `resources/js/stores/*` | **Заморожены** (Шаг 1) | `useCatalogStore`, `useFiltersStore`, `useSatelliteStore`, `useViewStore`, `useLayersStore` |

Общих файлов между параллельными треками нет.

---

## 2. Инвентаризация блоков кода

В таблице ниже приведена раскладка всех блоков оригинального файла `Index.vue` (HEAD: 3301 строка) с указанием их текущего размещения и запланированных изменений в треке D.

| Блок / Секция | Строки HEAD | Статус Шага 4 | Судьба в D-треке | Назначение и контекст |
|---|---|---|---|---|
| `<template>` | 1–216 | [остаётся в Index.vue] | — (Track U) | Разметка страницы трекера (HUD, сайдбар, глобус, карточка, fallback, новости) |
| Импорты UI | 219–221, 228–229 | [остаётся в Index.vue] | — (Track U) | Vue, Inertia, Axios, Mission-компоненты, новости |
| Импорты 3D-сцены | 222–227, 230–232 | [перенесено в useGlobeScene.js] | [заменится в D-треке] (D1, D3, D4) | `globe.gl`, `satellite.js`, `three`, `Line2/LineMaterial/LineGeometry`, `sgp4WorkerClient`, `createPostProcessing`, `useGlobeDisposer` |
| Auth / User | 234–235 | [остаётся в Index.vue] | — (Track U) | `page = usePage()`, `user = computed(...)` |
| Константы цветов категорий (`CATEGORY_COLORS`, `getCategoryColor`) | 237–250, 253–255 | [перенесено в useGlobeScene.js] | [заменится в D-треке] (D3) | Цвета орбит/глифов; в D3 заменяется на 1-битный атлас глифов (S O N T I R W ×) |
| Порядок категорий (`CATEGORIES_ORDER`) | 251 | [остаётся в Index.vue] | — (Track U) | Фильтры каталога и сайдбара (в U2 перейдёт в `useFiltersStore` + `categoryMeta`) |
| UI реактивное состояние (`sidebarOpen`, `availableCategories`, `userFavorites`) | 262, 268–269 | [остаётся в Index.vue] | — (Track U) | Состояние панелей UI, список категорий, избранное пользователя |
| Разделяемое состояние (`globeContainer`, `loading`, `activeFilter`, `satPositions`, `focusTarget`, `selectedSatellite`) | 260–261, 263–266 | [остаётся в Index.vue] (передаётся в useGlobeScene) | [сохраняется] | Связующие ref-переменные между UI и 3D-сценой |
| Состояние сцены (`utcTime`, `webglSupported`, `prefersReducedMotion`) | 267, 270–271 | [перенесено в useGlobeScene.js] | [сохраняется] | Часы UTC, флаг доступности WebGL, медиа-запрос reduced-motion |
| Проверки среды (`checkWebGLSupport`, `checkReducedMotion`) | 273–289 | [перенесено в useGlobeScene.js] | [сохраняется] (D1 fallback) | Проверка контекста WebGL и слушатель медиа-запроса анимаций |
| Внутренние переменные сцены (`globeInstance`, `allSatellites`, `rafId`, таймеры) | 291–302 | [перенесено в useGlobeScene.js] | [сохраняется] | Ссылки на экземпляр глобуса, сырые данные, кадры анимации |
| Disposer GPU-ресурсов (`useGlobeDisposer`) | 304–325 | [перенесено в useGlobeScene.js] | [сохраняется] (D1 teardown) | Единая регистрация геометрий, материалов, текстур, слушателей и таймеров |
| InstancedMesh-слой спутников (`satMesh`, `satPoints`, LOD, culling) | 326–705 | [перенесено в useGlobeScene.js] | [заменится в D-треке] (D0, D3) | В D0/D3 заменяется на единый 1-битный `THREE.Points` глиф-слой с атласом 8 клеток |
| Пикинг спутников (`Raycaster`, `hoverSat`, threshold) | 706–953 | [перенесено в useGlobeScene.js] | [заменится в D-треке] (D3) | Пикинг по проекции с порогом 10px, курсор `crosshair`, подпись hover |
| Орбита и наземный трек (`Line2`, `sampleOrbit`, `buildOrbitLines`) | 954–1106 | [перенесено в useGlobeScene.js] | [заменится в D-треке] (D4) | В D4 заменяется на пунктирный трек `LineDashedMaterial` и ретикл `[ ● ]` |
| Загрузка данных (`fetchData`) | 1107–1169 | [перенесено в useGlobeScene.js] | [заменится в D-треке] (D3, D5) | Запрос `/api/satellites`, парсинг TLE, передача в SGP4-воркер, запуск анимации |
| UI-обработчики категорий и избранного (`fetchCategories`, `fetchFavorites`, `isFavorite`, `toggleFavorite`) | 1171–1225 | [остаётся в Index.vue] | — (Track U) | Запросы категорий и избранного, оптимистичный toggle |
| Анимация и интерполяция координат (`lerpAngle`, `interpolatePositions`, `refreshPositions`) | 1227–1289 | [перенесено в useGlobeScene.js] | [сохраняется] (D3) | Получение батча от SGP4-воркера, сферическая интерполяция между тиками |
| Debug HUD и FPS-счётчик (`?debug=1`, `renderFrame`, `startAnimation`) | 1290–1368 | [перенесено в useGlobeScene.js] | [сохраняется] | Диагностический HUD и цикл `requestAnimationFrame` |
| Астрономический терминатор и свет (`initDayNightMaterial`, `subsolarPoint`) | 1369–1605 | [перенесено в useGlobeScene.js] | [заменится в D-треке] (D2) | В D2 заменяется на Bayer 4×4 дизеринг-шейдер солнца по UTC без directional light |
| Звёздное поле и атмосфера (`initStarfield`, `initAtmosphere`) | 1606–1849 | [перенесено в useGlobeScene.js] | [удалится в D-треке] (D1) | В D1 отключаются звёзды и френель-атмосфера ради чистого 1-битного силуэта Земли |
| Пост-обработка (`initPostProcessing`, Bloom, FXAA, ACES) | 1850–1870 | [перенесено в useGlobeScene.js] | [удалится в D-треке] (D1) | В D1 bloom и ACES отключаются, вывод переводится в чистый монохром |
| Инициализация глобуса (`initGlobe`, `retryInitGlobe`) | 1871–1995 | [перенесено в useGlobeScene.js] | [заменится в D-треке] (D1) | В D1 глобус переводится на бумажную сферу `MeshBasicMaterial` + векторные границы 110m |
| Режимы камеры (`hero`, `follow`, `free orbit`, tween) | 1996–2511 | [перенесено в useGlobeScene.js] | [сохраняется / D4] | Плавный облёт, слежение за аппаратом, переключение на ручное управление |
| Управление фильтром и фокусом (`setFilter`, `focusSatellite`, `focusByCatalogNumber`, `clearFocus`) | 2512–2560 | [перенесено в useGlobeScene.js] | [сохраняется / D4] | Смена группировки, захват фокуса камеры и построение орбиты |
| Жизненный цикл сцены (`onMounted`, `onBeforeUnmount`) | 2564–2660 | [разделён: сцена в composable, UI в Index] | [сохраняется] | Инициализация глобуса, таймеров и воркеров; детерминированный teardown GPU-контекста |
| Scoped-стили UI (`<style scoped>`) | 2663–3301 | [остаётся в Index.vue] | — (Track U) | Стили макета страницы (в U1–U6 будут заменены на 1-битные CSS-токены) |

---

## 3. Граница интерфейсов UI ↔ useGlobeScene

Связь между `Index.vue` и `useGlobeScene` организована через стандартный контракт Vue 3 composable: входные параметры (options) и возвращаемый объект (refs и методы).

### Входные параметры (`useGlobeScene(options)`)

| Параметр | Тип | Назначение | Владелец источника |
|---|---|---|---|
| `globeContainer` | `Ref<HTMLElement|null>` | Template-ref DOM-контейнера `<div ref="globeContainer">` | `Index.vue` |
| `loading` | `Ref<boolean>` | Индикатор загрузки TLE / телеметрии спутников | `Index.vue` |
| `activeFilter` | `Ref<string>` | Текущий активный фильтр группировки (`'ALL'`, `'STARLINK'`, `'FAVORITES'` и др.) | `Index.vue` |
| `satPositions` | `Ref<Array>` | Реактивный массив вычисленных координат аппаратов (для сайдбара и счётчика) | `Index.vue` |
| `focusTarget` | `Ref<string|null>` | Имя сфокусированного аппарата для плашки `◎ FOCUS — ...` | `Index.vue` |
| `selectedSatellite` | `Ref<Object|null>` | Полный объект выбранного спутника для карточки `SatelliteCard` | `Index.vue` |

### Возвращаемые значения (`useGlobeScene(...)`)

| Имя | Тип | Назначение для UI / Template |
|---|---|---|
| `utcTime` | `Ref<string>` | Строка системного времени (`HH:MM:SS UTC`) для сайдбара и fallback-карточки |
| `webglSupported` | `Ref<boolean>` | Флаг доступности WebGL для переключения 3D / 2D-fallback разметки |
| `hoverSat` | `Ref<Object|null>` | Данные всплывающей подсказки пикинга аппарата (`{ x, y, name, flip }`) |
| `debugStats` | `Ref<Object|null>` | Метрики отладочного HUD (`fps`, `drawn`, `total`, `near`, `points`, `frustum`, `limb`) |
| `getCategoryColor` | `(cat: string) => string` | Функция расчёта цвета категории (для точек в списке и плашки карточки) |
| `retryInitGlobe` | `() => void` | Повторная попытка инициализации сцены по клику в fallback-экране |
| `setFilter` | `(cat: string) => void` | Обработчик переключения категории по клику на чип в сайдбаре |
| `focusSatellite` | `(sat: Object) => void` | Фокусировка камеры на аппарате по клику из списка сайдбара или пикинга |
| `focusByCatalogNumber` | `(num: number|string) => void` | Фокусировка по клику на спутник из ленты новостей `NewsFeed` |
| `clearFocus` | `() => void` | Сброс фокуса камеры и закрытие карточки по кнопке `✕` |
| `fetchData` | `() => Promise<void>` | Загрузка и инициализация TLE-телеметрии спутников |

---

## 4. Карта идентификаторов шаблона (<template>)

Все 25 идентификаторов, на которые ссылается разметка `Index.vue` (строки 1–216), проверены и доступны в setup:

1. `MissionShell` — импорт UI-компонента в `Index.vue`
2. `satPositions` — разделяемый ref, объявлен в `Index.vue`, наполняется сценой
3. `focusTarget` — разделяемый ref, объявлен в `Index.vue`, меняется сценой
4. `clearFocus` — метод сброса фокуса, возвращается из `useGlobeScene`
5. `hoverSat` — ref всплывающей подсказки, возвращается из `useGlobeScene`
6. `debugStats` — ref отладочного HUD, возвращается из `useGlobeScene`
7. `sidebarOpen` — ref сайдбара, объявлен в `Index.vue`
8. `user` — `computed` авторизации пользователя в `Index.vue`
9. `Link` — компонент Inertia в `Index.vue`
10. `route` — глобальный Ziggy-хелпер маршрутизации
11. `loading` — разделяемый ref загрузки данных
12. `utcTime` — ref времени UTC, возвращается из `useGlobeScene`
13. `availableCategories` — ref списка категорий в `Index.vue`
14. `setFilter` — метод фильтрации, возвращается из `useGlobeScene`
15. `activeFilter` — разделяемый ref активной категории
16. `focusSatellite` — метод фокусировки, возвращается из `useGlobeScene`
17. `getCategoryColor` — функция цвета категории, возвращается из `useGlobeScene`
18. `toggleFavorite` — метод добавления в избранное в `Index.vue`
19. `isFavorite` — метод проверки избранного в `Index.vue`
20. `webglSupported` — ref поддержки WebGL, возвращается из `useGlobeScene`
21. `globeContainer` — template-ref контейнера сцены в `Index.vue`
22. `retryInitGlobe` — метод повторной инициализации, возвращается из `useGlobeScene`
23. `selectedSatellite` — разделяемый ref карточки спутника
24. `news` — статические данные новостей в `Index.vue`
25. `focusByCatalogNumber` — метод перехода к спутнику из `NewsFeed`
26. `NewsFeed` — импорт компонента в `Index.vue`
27. `SatelliteCard` — импорт компонента в `Index.vue`

---

## 5. Статистика переноса и верификация

- **Байт-в-байт совпадение шаблона (строки 1–216):** SHA256 `476a7d09d991208c3daa99378ebb1298851b08bb21299d3a6b67174e6365e187` совпадает с HEAD.
- **Строк перенесено verbatim (без правок текста):** 2012 строк в `useGlobeScene.js` (плюс 893 строки сохранены verbatim в `Index.vue`).
- **Строк адаптировано:** 37 строк суммарно (21 строка сигнатуры/опций/return в `useGlobeScene.js`, 16 строк импорта и вызова composable в `Index.vue`).
- **Grep-гейт новых строк (`gate_new_lines.py`):** 0 нарушений (стили и чужие hex в адаптированных строках отсутствуют).
- **Сборка (`npm run build`):** exit code 0.
