# Перенос 1-бита: статус выполнения

План: `docs/mockups/PLAN-MIGRATE-1BIT.md`. Один шаг = один локальный коммит, без push.
Журнал ведёт оркестратор. Проверка каждой стадии — `scripts/stage-gate.sh` (запускать ПЕРЕД `git commit`; логи в `$TMPDIR/stage-gate/`).

## Откатный якорь (Шаг 0)

- Ветка отката: `legacy/design-glass` (HEAD на момент старта переноса)
- Тег: `legacy-glass-v1`
- Снапшот сборки: `docs/backups/build-legacy-glass-v1.tar.gz` (на диске, в git не входит)

### Процедура экстренного отката

```
git checkout legacy/design-glass        # или: git reset --hard legacy-glass-v1
rm -rf public/build && tar -xzf docs/backups/build-legacy-glass-v1.tar.gz
php artisan view:clear && php artisan config:clear
```
+ жёсткая перезагрузка в браузере (PWA service worker может держать старый кэш — при откате это работает в пользу; при возврате «вперёд» бампать SW-версию).

БД/миграции перенос не трогает → откат чисто кодовый.

### Проверка отката (0.5)

- [x] Снапшот восстанавливается (tar 776K → `public/build` 2.7M), `/` и `/login` → HTTP 200, DOM рендерится, JS-ошибок нет
- [ ] Откат прогнан в Windows-браузере (скриншот) — за вами

### Базовая линия шума консоли (для stage-gate)

Единственное допустимое сообщение консоли (есть и в старом дизайне, pre-existing):
`Uncaught (in promise) non-precached-url: ... "url":"index.html"` из `/build/workbox-*.js` (VitePWA, SPA-fallback). Всё остальное в консоли = провал ворот.

## FPS-база (Шаг 0.4) — ✅ замер получен (Windows, 2026-11-24)

Текущая сцена, `?debug=1` HUD, ваша машина, Windows:
- FPS (стабильный, полный экран): **144** (стабильно даже при максимальной нагрузке)
- Дата/разрешение: 2026-11-24 (разрешение не фиксировалось)

### Замер D0 (стресс-тест глифов) — Windows
1. `cd docs\mockups\glyph-stress` → `python -m http.server 8188` (в WSL: `python3`)
2. Открыть `http://localhost:8188`: FPS в HUD на 12k/15k точек (порог **≥ 55**), LOD колесом мыши, пикинг глифов кликом.
3. Результат: FPS при максимальной нагрузке: **144, стабильно** — вердикт: **ок → D3 остаётся на THREE.Points** (InstancedMesh не нужен).

## Журнал шагов

| Шаг | Статус | Коммит | Примечание |
|---|---|---|---|
| 0 — откатный якорь | ✅ | см. git log | откат проверен (tarball → `/` в headless) |
| 1 — контракт (сторы + пропсы) | ✅ | см. git log | 5 сторов + LOD + categoryMeta + computePasses-заглушка + CONTRACT-1BIT.md; пропсы categories/tleStatus; 5 passed / 194 assertions |
| 2 — stage-gate.sh | ✅ | см. git log | `scripts/stage-gate.sh` перед коммитом; проверен позитивно (чистое дерево) и негативно (ловит скругления/blur/градиенты/чужие hex) |
| 2.1 — ворота: диф-семантика | ✅ | см. git log | `gate_new_lines.py`: гейт проверяет только новые строки, вербатим-перенесённые из HEAD — «не новые» (нужно для pure move Шага 4 и U-трека; финальная чистота дерева — F2); тесты позитив/негатив |
| 3 — токены | ✅ | см. git log | tailwind+app.css: --paper/--ink/--ink-muted/--surface, --radius: 0, тень 2px 2px 0, сетка-точек, .num, focus-visible, reduced-motion; JetBrains Mono woff2 локально (400/700, public/fonts); #4B5563 → #0E0E0E; SW-константы в vite.config нет |
| 4 — разделение Index.vue | ✅ | см. git log | сцена → composables/useGlobeScene.js (99.7% строк verbatim, template байт-в-байт, sha совпал); инвентаризация STEP4-MOVE.md; нюанс: fetchData() стартует параллельно с fetchCategories/favorites (был последовательным, данные независимы) |
| U1 — TopBar (шапка) | ✅ | см. git log | `TopBar.vue` (бренд ● EOL, статус TLE из пропсов, часы UTC, поиск ⌘К + дропдаун, квадратные кнопки auth, адаптив 640/420px); MissionShell остаётся для Breeze; focusByCatalogNumber/auth/Breeze проверены; правка гейта 2.1.1 (blur-паттерн) |
| U2 — чипы + фильтрация | ✅ | см. git log | `CategoryChips.vue` (счётчики из props.categories, скролл на мобильном) + useFiltersStore ↔ setFilter(сцена) ↔ каталог/поиск; **фикс**: async-импорты SatelliteCard/NewsFeed откачены — они сливали чанк Index.vue без facade (ключ пропадал из Vite-манифеста → 500 на `/`); precache-лимит workbox 4MiB (чанк сцены >2MiB) |
| U3 — каталог-ящик | ✅ | см. git log | `CatalogDrawer.vue` (вкладки Спутники/Группировки/Избранное, виртуальный список `useVirtualList` @vueuse под 10k+, border-l-4 активной строки, ★ через существующий toggleFavorite); Index.vue: старый сайдбар заменён (auth/статусы уже в TopBar), синхронизация useSelectionStore/useCatalogStore; отклонение: agy таймаут → код писал субагент; **визуальный «ок» в Windows ✅ (2026-11-25)** |
| U4 — карточка спутника | ✅ | см. git log | `SatelliteCard` 1-бит + `AsciiSchematic.vue` (ASCII-схемы по категориям) + `OrbitProfileChart.vue` (step-line SVG) + таблица параметров с glossary (`data/orbitGlossary` — существовал с эпохи glass) + кнопки Орбита/След/Следить/Поделиться + блок «Когда увидеть» (computePasses + геолокация, запасной ручной ввод); отклонение: субагент умер ПОСЛЕ финального отчёта (agy acp SIGTERM при переинициализации) — код цел и отревьюен; **визуальный «ок» в Windows ✅ (2026-11-25)** |
| U5 — новости в шапке | ✅ | `73b1f13` | `TopBar.vue` (кнопка `[ НОВОСТИ NN ]` + выпадающая панель 1-бит, закрытие по клику вне/Escape/фокусу спутника, компактная иконка ▤ на <=640px) + `NewsFeed.vue`/`NewsCard.vue` переведены в 1-бит токены (убраны glass/scroll-area/badge/lucide); `.news-area` и мёртвые импорты удалены из `Index.vue`; **визуальный «ок» в Windows ✅ (2026-11-25)** |
| U6 — мобильный bottom-sheet | ✅ | `c89f263` | `Index.vue`, `CatalogDrawer.vue`, `SatelliteCard.vue` (bottom-sheet `max-height: 70vh` на `<=640px`, взаимоисключение открытых панелей, старт каталога закрытым), `CategoryChips.vue` (горизонтальный скролл), `LayerToggles.vue` (`bottom: 8px`, без сдвига `368px` при инспекторе), `TopBar.vue` (поиск под шапкой), тач-цели `>= 40px`; headless `390x844`: `scrollWidth=390` (0 переполнения), тач-цели 40px; **визуальный просмотр в Windows (390px) — за вами** |
| D0 — стресс-тест глифов | ✅ | см. git log | `docs/mockups/glyph-stress/`: 12k THREE.Points (1 draw call), атлас 8 глифов, LOD 2.2/1.4, пикинг 10px, лимб-куллинг, HUD FPS/draw calls; headless (swiftshader) 0 ошибок; **замер в Windows: 144 FPS стабильно при макс. нагрузке → схема Points подтверждена** |
| D1 — 1-битная сцена | ✅ | см. git log | бумажная сфера + силуэт + границы NE 110m, выключены bloom/ACES/FXAA/атмосфера/звёзды/текстуры/свет; ревью нашло 3 дефекта (TDZ GLOBE_RADIUS ронял init → зависание телеметрии; onGlobeReady не зовётся при globeImageUrl(null) → границы не создавались; недобитые Directional/AmbientLight → градиент) — все починены, рантайм-доказательства есть; **визуальный «ок» в Windows ✅ (2026-11-24)** |
| D2 — терминатор | ✅ | см. git log | `lib/globe/terminator.js`: NOAA-субсолярная точка (UTC), Bayer 4×4 шейдер (бумага/чернила, плотность 0.75, gl_FragCoord-дизеринг), обновление солнца раз в 60с, независим от lights; `LayerToggles.vue` (чекбокс ТЕРМИНАТОР ↔ useLayersStore, смонтирован оркестратором в Index.vue); teardown через useGlobeDisposer (таймер/материал/unwatch); отклонение: agy таймаут → код писал субагент; **визуальный «ок» в Windows ✅ (2026-11-25)** |
| D3 — глиф-слой | ✅ | см. git log | `glyphAtlas.js` (процедурный canvas-атлас 8 глифов S O N T I R W ×, 2 ряда: обычный/инвертированный) + `glyphLayer.js` (THREE.Points 1 draw call, LOD FAR/MID/NEAR по lod.js, пикинг рейкастом 10px + crosshair, лимб/frustum-куллинг) + сцена: InstancedMesh сфер удалён, клик → useSelectionStore.select, teardown через useGlobeDisposer; **поправка**: в Шаге 1 фактически было 4 стора из 5 — useViewStore добавлен ретроактивно (3873a7e), LOD синхронизируется сценой; **визуальный «ок» в Windows ✅ (2026-11-25)** |
| D4 — выбранный объект и слои | ✅ | `0637cd3` | `gridLayer.js` (сетка 30° `LineDashedMaterial`), `sceneOverlay.js` (ретикл `[ ● ]`, плашка `NAME [X]` с SVG лидер-линией через `targetGroup.matrixWorld` + `camera.project()`, лимб-куллинг, подписи `LABELS` по LOD), `useGlobeScene.js` (орбита/след переведены с `Line2` на `THREE.Line` + `LineDashedMaterial` `#0E0E0E`, синхронизация `layersStore.grid`/`orbits` и `selectionStore.followMode`), `LayerToggles.vue` (СЕТКА/ОРБИТЫ/ПОДПИСИ/ТЕРМИНАТОР, `right: 368px` при открытом инспекторе); headless SwiftShader: ретикл/плашка/лидер-линия и 40 подписей на HERO подтверждены; **визуальный «ок» в Windows ✅ (2026-11-25)** |
| D5 — computePasses (SGP4) | ✅ | `c6a0e59` | `sgp4Core.js` (геоцентрическая геометрия `propagate → gstime → eciToEcf → ecfToLookAngles`, шаг 20с, бисекция AOS/LOS до 500мс, тернарный пик `maxEl` до 1с, обрезка границ окна, нормализация долготы), `sgp4.worker.js` + `sgp4WorkerClient.js` (отдельный канал `pendingPasses` без вытеснения позиций, таймаут 15с + fallback), `passes.js` (контракт Шага 1); `tests/js/passes.test.mjs` (реальный пролёт МКС над Москвой: 4 пролёта за сутки, первый `maxEl 31.38°`, граничные случаи) + `orbit.test.mjs` — всё зелёное |
| F1 — чистка и доки | ✅ | `3def159` | удалены `public/textures/*` (8 файлов), `components/ui/*` (shadcn), `lib/postProcessing.js`, `Pages/Welcome.vue`, мёртвый `CATEGORY_COLORS`/`getCategoryColor`/`categoryColor`; `vite.config.js` (убран `runtimeCaching` текстур, PWA `#F4F1EA`) и `app.blade.php` (`#F4F1EA`); обновлены `README.md`, `ROADMAP.md`, `REVIEW.md`; `stage-gate.sh` зелёный, `tests/js/*.test.mjs` (2/2), `php artisan test` (45 тестов, 0 падений) |
| F2 — финальные вороты | ⏳ | `572ce7e` | **WSL-ворота закрыты:** 31 файл Breeze/layouts/компонентов/страниц переведён на 1-бит токены; сквозной grep по всему дереву (`resources/`, `app/`, `tailwind.config.js`, `vite.config.js`) → **0 нарушений**; `stage-gate.sh` зелёный, `tests/js/*.test.mjs` (2/2), `php artisan test` (5 passed, 40 deprecated / 194 assertions), `public/build` 2.8M (29 записей в манифесте); DOM/a11y smoke `/` и `/login` ок (`#F4F1EA`/`#0E0E0E`, 0 горизонтального скролла, 0 безымянных кнопок). **Осталось за вами в Windows:** Lighthouse a11y ≥ 95 (CLI `lighthouse` в WSL не установлен), визуал U6 (390px), скриншоты «до/после» и замер FPS/draw calls (`?debug=1`) |
