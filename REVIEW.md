# Ревизия проекта «Спутник-Онлайн» — отчёт после исправлений

Ветка `refactor/modernization`, диапазон проверенных коммитов `c9078e1..505c1d1` (13 атомарных коммитов).
Метрики ниже относятся к этому диапазону; перенос на 1-битный дизайн и вычистка F1 — §12.
Верифицировано:
- `php artisan test`: **39 passed (126 assertions)** за 2.74 c (`sqlite :memory:`).
- `npm run build`: **OK** за 8.60 c (3994 модулей).
- `php artisan migrate:status`: миграция `2026_11_11_120000_add_postgis_geography_to_alerts` применена (`[2] Ran`).
- SQL-путь PostGIS (`jsonb_to_recordset` → `ST_SetSRID(ST_MakePoint(...), 4326)::geography`, `ST_Distance`, `ST_DWithin`) проверен в транзакции на живой БД PostgreSQL 18 + PostGIS 3.6.2.

---

## Закрытые пункты ревизии (P0 / P1 / P2)

### 1. [P0 · ЗАКРЫТО `fcf9777`] Полный каталог без `limit(3000)`
- `SatelliteController::api` отдаёт весь каталог с детерминированным `->orderBy('id')` и нормализацией категории через `SatelliteCache::normalizeCategory()` (защита от засорения кэша произвольными query-значениями).
- Ключ кэша версионирован (`satellites:api:{CATEGORY}:v2`).

### 2. [P0 · ЗАКРЫТО `8e2dcc3`, `fedf7df`, `0bc1373`] Реальное использование PostGIS
- В `alert_rules` добавлена хранимая генерируемая колонка `zone geography(Point, 4326)` + GIST-индекс `alert_rules_zone_gist`.
- Создана таблица `satellite_subpoints (satellite_id, position geography(Point, 4326), alt_km, computed_at)` + GIST-индекс `satellite_subpoints_position_gist`.
- `CheckSatelliteAlerts` батчем сохраняет подспутниковые точки через `jsonb_to_recordset` + `ON CONFLICT DO UPDATE` и одним запросом считает `ST_Distance` и `ST_DWithin`. Для `sqlite :memory:` в тестах сохранён fallback на Haversine.

### 3. [P0 · ЗАКРЫТО `2d35207`] Полноценный `README.md`
- Описаны стек, системные требования, настройка PostgreSQL + PostGIS, команды запуска и фоновые демоны (`schedule:work`, `queue:work`, `telegram:poll`), production-конфигурация.

### 4. [P1 · ЗАКРЫТО `d1a26be`, `b3c10bd`, `9a28255`] Тестовое покрытие ядра
- Добавлены `SatellitePositionCalculatorTest`, `SatelliteApiTest`, `SatelliteCacheTest`, `CheckSatelliteAlertsTest`.
- В `scripts/satellite_position.cjs` добавлена проверка `Number.isFinite(lat/lng/altKm)`, а в `SatellitePositionCalculator` — проверка `is_numeric` и отсутствие ключа `error`, чтобы битый TLE возвращал `null`, а не `[0.0, 0.0, 0.0]`.

### 5. [P1 · ЗАКРЫТО `b7a462f`] Упрощение SGP4 в PHP и устранение `shell_exec`
- Удалён неточный упрощённый PHP-fallback SGP4 и опасный одиночный вызов `shell_exec("node ...")`.
- `getPosition()` делегирует расчёт в `getPositionsBatch()` из одного элемента (через `proc_open` и `stdin` JSON).

### 6. [P1 · ЗАКРЫТО `505c1d1`] Унификация UI (`AuthenticatedLayout` → `MissionShell`)
- `AuthenticatedLayout.vue` переведён на `MissionShell` с единым топбаром, навигацией, UTC-часами и CSS-мостом для внутренних страниц (`Dashboard`, `Profile`, `AlertRules`, `Admin`). Спринт 3 полностью закрыт.

### 7. [P1 · ЗАКРЫТО `309f65c`, `0eb97f4`] Безопасность кэша и маршрутизация API
- Вместо `Cache::flush()` в `FetchSatellites` и `Satellite::clearCache()` используется `SatelliteCache::forgetCatalog()`.
- Публичные эндпоинты `/api/satellites` и `/api/satellite-categories` вынесены из `routes/web.php` в `routes/api.php` под `throttle:60,1`.

### 8. [P2 · ЗАКРЫТО `d827e64`] Гигиена репозитория и CI
- Удалён легаси-каталог `_old_react_app/`.
- Добавлен `.github/workflows/ci.yml` (сборка фронта + PHPUnit).
- Актуализированы `.env.example`, `ROADMAP.md` (PostgreSQL 18, опечатки) и дисклеймер демо-данных в `resources/js/data/news.js`.

---

### 9. [P1 · ЗАКРЫТО `824cc6d`] Единый dispose-контракт для 3D-сцены и Globe/Index.vue
- Создан модуль `resources/js/lib/globe/useGlobeDisposer.js` с реестром по категориям (геометрии, материалы со всеми 26 текстурными слотами, текстуры, renderTarget'ы EffectComposer/UnrealBloomPass, SGP4 Web Worker, слушатели, rAF/таймеры, controls, renderer).
- Реализован fallback-обход сцены через `scene.traverse()` с вызовом `dispose()`, очисткой текстур и `removeFromParent()`.
- Реализована принудительная очистка renderer'а через `renderer.dispose()` и `renderer.forceContextLoss()`.
- `Globe/Index.vue` переведён на `useGlobeDisposer` с детерминированным порядком teardown в `onBeforeUnmount`. Сборка `npm run build` зелёная (0 ошибок).

### 10. [P1 · ЗАКРЫТО] Оптимизация текстур глобуса и PWA Workbox cache
- Все 4 текстуры `public/textures/*` сконвертированы в WebP (Blue Marble 4K, Night Lights 4K, Topology lossless 2K, Night Sky 4K).
- Суммарный вес сократился с 3.46 MB до 2.15 MB (чистый выигрыш **-38.0% / 1.31 MB**, текстура Земли Blue Marble -46.8%, Night -49.9%).
- Настроен Workbox runtimeCaching `CacheFirst` (30 дней) для `/textures/*` в `vite.config.js`.

### 11. [P1 · ЗАКРЫТО] prefers-reduced-motion и WebGL-fallback
- Добавлена проверка `checkWebGLSupport()` и перехват ошибок инициализации `Globe()`.
- При отсутствии/сбое WebGL интерфейс не падает, а показывает полноценный Mission Control Fallback с оперативной таблицей телеметрии, активной группировкой, системным временем и кнопкой повтора инициализации.
- Реализована поддержка `prefers-reduced-motion`: реактивное отслеживание системных настроек, моментальные перелёты камеры (`duration = 0`), пропуск вводного зум-интро и безопасные CSS-стили (`animation-duration: 0.001ms`).

### 12. [F1 · 1-битная миграция] Сцена, UI и вычистка стеклянного наследия

- Сцена вынесена из `resources/js/Pages/Globe/Index.vue` в `resources/js/composables/useGlobeScene.js`
  (перенос verbatim, sha совпал) и `resources/js/lib/globe/*`:
  `silhouette.js` (инвертированная оболочка), `borders.js` (Natural Earth 110m),
  `terminator.js` (субсолярная точка NOAA по UTC + Bayer 4×4, обновление раз в 60 с),
  `glyphAtlas.js` + `glyphLayer.js` (8 глифов, `THREE.Points`, 1 draw call, LOD FAR/MID/NEAR,
  пикинг рейкастом 10 px, лимб/frustum-куллинг), `gridLayer.js` (сетка 30°),
  `sceneOverlay.js` (ретикл, плашка с лидер-линией, подписи по LOD), `lod.js`,
  `useGlobeDisposer.js` (детерминированный teardown).
- Bloom/ACES/FXAA, текстуры, атмосфера и звёзды в 1-битной сцене не используются;
  орбита и наземный след переведены с `Line2` на `THREE.Line` + `LineDashedMaterial`.
- UI собран в `resources/js/components/mission/*` (TopBar, CategoryChips, CatalogDrawer,
  SatelliteCard + AsciiSchematic/OrbitProfileChart, LayerToggles, NewsFeed/NewsCard)
  поверх 5 pinia-сторов (`useCatalogStore`, `useSelectionStore`, `useFiltersStore`,
  `useLayersStore`, `useViewStore`).
- Вычистка F1 — `public/textures/*`, `resources/js/lib/postProcessing.js`, неиспользуемые
  `resources/js/components/ui/*`; `MissionShell.vue` сохраняется для Breeze-страниц.
  Статус шага ведётся в `docs/mockups/MIGRATE-STATUS.md`; метрики прогона после миграции
  зафиксирует F2 (в шапке отчёта — цифры диапазона `c9078e1..505c1d1`).

---

## Что осталось (актуальный бэклог по ROADMAP)

1. **[P2 · Небольшое замечание в `CheckSatelliteAlertsTest`]**
   - Тесты `CheckSatelliteAlertsTest` гоняются на `sqlite :memory:`, поэтому проверяют Haversine-ветку, а не SQL-запрос PostGIS (`storeSubpoints` / `fetchZoneInfo`). Сам SQL-запрос валиден (проверен вручную на Postgres 18).

2. **[Спринт 5 — дипломная упаковка]**
   - Финальный замер FPS и `DRAWN` в браузере с `?debug=1` на 1-битной сцене для таблиц
     в пояснительной записке (стресс-тест схемы глифов D0 дал 144 FPS стабильно на Windows,
     см. `docs/mockups/MIGRATE-STATUS.md`; это замер стресс-сцены, а не полного каталога).
   - Пояснительная записка.
