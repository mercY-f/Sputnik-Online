# План: перенос макета «1-бит» в реальный проект

Статус: черновик на утверждение. Заменяет §5 «Этап C» из `PLAN-1BIT.md` (сам макет — стадии A0–A10 — готов, см. `STATUS-TERMINATOR.md` и git-лог).
Один шаг = один локальный коммит, без push. Каждый шаг закрывается **воротами стадии** (§4).

## 0. Принципы

1. **Откат в любой момент.** Старый («стеклянный») дизайн закреплён до первого изменения кода (Шаг 0) и проверен на реальность отката.
2. **Сначала контракт, потом код.** Схема Pinia-сторов и входные пропсы от Laravel фиксируются (Шаг 1) до нарезки UI — тогда UI-панели и 3D-сцена идут **параллельными треками** без пересечений.
3. **UI и сцена не смешиваются** ни в одном коммите (разные места риска).
4. **Каждая стадия** закрывается: `npm run build` → headless Chromium без ошибок в консоли → grep на чужие hex / скругления / блюр (§4). PHP-правки дополнительно — `php artisan test`.
5. **Визуал 3D подтверждаете вы в Windows** (в WSL WebGL — только smoke/консоль). Для сценарных стадий SCENE-трека — явное «ок» по скриншоту.
6. Роли: оркестратор (я) — декомпозиция, ревью дифов, прогоны ворот, коммиты; субагенты — код (новые компоненты/сторы — `agy`, точечные правки — `patch`). Пакеты S1 (UI) и S2 (сцена) — параллельным субагентам.

## 1. Шаг 0 — откатный якорь (фиксация старого дизайна)

Сейчас HEAD = `refactor/modernization` (`0831188`), ветки/теги для отката отсутствуют.

| Действие | Команда / результат |
|---|---|
| 0.1 Ветка-снимок | `git branch legacy/design-glass` (указывает на текущий HEAD) |
| 0.2 Тег | `git tag -a legacy-glass-v1 -m "Стеклянный дизайн до 1-бит редизайна — точка отката"` |
| 0.3 Снапшот сборки | `npm run build` → `tar -czf docs/backups/build-legacy-glass-v1.tar.gz public/build` (мгновенный откат без пересборки; каталог `docs/backups/` в git не коммитим, файл живёт на диске) |
| 0.4 База FPS | Замер `?debug=1` HUD текущей сцены на вашей машине в Windows → число вписать в `docs/mockups/MIGRATE-STATUS.md` (база сравнения для SCENE-трека) |
| 0.5 **Проверка отката** | `git checkout legacy/design-glass` → восстановить `public/build` из tarball → headless Chromium: `/` открывается, 0 ошибок консоли → вернуться на рабочую ветку. Откат доказан практикой, а не словами |

Процедура экстренного отката (записать в `MIGRATE-STATUS.md`):
```
git checkout legacy/design-glass        # или: git reset --hard legacy-glass-v1
rm -rf public/build && tar -xzf docs/backups/build-legacy-glass-v1.tar.gz
php artisan view:clear && php artisan config:clear
```
+ жёсткая перезагрузка в браузере (PWA service worker может держать старый кэш — это работает в пользу отката, но при возврате «вперёд» версию SW надо бампать).

БД/миграции в переносе не трогаем → откат чисто кодовый.

## 2. Шаг 1 — контракт: схема Pinia-сторов + входные пропсы Laravel

**Цель:** заморозить интерфейсы между слоями, чтобы нарезка UI (трек U) и пересборка сцены (трек D) шли параллельно и независимо. Pinia 4 уже подключена в `app.js`, сторов пока нет.

### 2.1 Схема сторов (`resources/js/stores/`)

| Стор | State | Getters | Actions | Персист |
|---|---|---|---|---|
| `useSelectionStore` — активный спутник | `selectedId` (catalog_number \| null), `hoveredId`, `focusTarget {lat,lng,alt}\|null`, `followMode: bool` | `isSelected(id)`, `activeSat` (ссылкой на каталог) | `select(sat)`, `clear()`, `hover(id)`, `setFollow(bool)` | нет |
| `useFiltersStore` — фильтры категорий | `activeFilter` (`'ALL'\|CATEGORIES`), `categoryCounts: Record<string,number>` | `chipList` (буквы/подписи из `categoryMeta`) | `setFilter(key)`, `hydrate(counts)` | `localStorage['eol.filter.v1']` |
| `useLayersStore` — слои сцены | `grid: true`, `orbits: true`, `atmosphere: true`, `labels: false`, `terminator: true` | — | `toggle(layer)` | `localStorage['eol.layers.v1']` |
| `useViewStore` — зум/LOD | `cameraAltR` (высота камеры в радиусах Земли) | `lodLevel: 'FAR'\|'MID'\|'NEAR'` по константам `LOD_FAR=2.2`, `LOD_MID=1.4` (как в макете §3.1.8) | `updateFromCamera(pov)` | нет |

Правила: сторы не импортируют three/globe.gl (только данные); сцена читает `lodLevel`/`layers`, UI пишет `selection`/`filters`. Константы LOD — в `resources/js/lib/globe/lod.js` (единые для стора и сцены).

### 2.2 Входные пропсы от Laravel (`SatelliteController@index` + API)

Фиксируем в `resources/js/types/contracts.js` (JSDoc-типы) + `docs/mockups/CONTRACT-1BIT.md`:

**Inertia-пропсы `Globe/Index`:**
- `satelliteCount: number` (есть),
- `categories: Record<string, number>` — **новое** (сейчас фронт тянет `/api/satellite-categories`; отдаём сразу, чтобы шапка/чипы не ждали fetch),
- `tleStatus: { epoch: string|null, updatedAt: string|null }` — **новое** (индикатор «статус TLE» в шапке макета),
- `auth.user { id, name, role.name, profile } | null` (есть).

**REST API (меняется только документацией, формат уже используется фронтом):** `/api/satellites?category=`, `/api/satellite-categories`, `/api/user/favorites` (+toggle). Поля записи спутника — как в `SatelliteController::api()` (`id, name, catalog_number, tle1, tle2, category, country, ...`).

**Контракт воркера SGP4** (`lib/sgp4WorkerClient.js`) — не меняем, только описываем в CONTRACT (общая граница для SCENE-трека).

**Категории → буквы** (`resources/js/lib/categoryMeta.js`, одна карта на весь UI): `ISS→I` (станции), `STARLINK→S`, `ONEWEB→O`, `NAVIGATION→N`, `TELESCOPE→T`, `IRIDIUM→R`, `WEATHER→W`, `OTHER→×` (согласовано в PLAN-1BIT §1.3). Порядок чипов: `ВСЕ, МКС, STARLINK, ONEWEB, НАВИГАЦИЯ, ТЕЛЕСКОПЫ, ДРУГОЕ` + счётчики.

Побочно в шаге: обновить `SatelliteApiTest` на новые пропсы.

**Сдача шага 1:** сторы + contracts + categoryMeta закоммичены; ворота стадии зелёные; UI- и SCENE-субагенты получают на вход только эти файлы как источник истины.

## 3. Шаг 2 — ворота стадии (автоматизация проверки)

Скрипт `scripts/stage-gate.sh` (одна команда на закрытие каждой стадии):

1. `npm run build` (через `tlog.py`, лог на диск).
2. Поднять `php artisan serve`, headless Chromium (agent-browser) открыть `/` и `/login`: собрать `console.error` + `pageerror` → **0**.
3. Grep-гейт по файлам стадии (`git diff --name-only <base>..HEAD`, только `resources/`, `tailwind.config.js`, `app/`):
   - `border-radius:\s*[1-9]`, `rounded-`, `blur(`, `backdrop-`, `text-shadow`, `gradient(` → пусто;
   - hex-цвета: допустимы только `#F4F1EA #0E0E0E #5C5A54 #E8E4DA` (в любом регистре) → чужих нет;
4. Если тронут `app/` или `routes/` → `php artisan test`.

Исключения гейта фиксируются в самом скрипте списком (сейчас известно одно: `radial-gradient(#0E0E0E 0.5px, transparent 0.5px)` — сетка-точки, разрешена PLAN-1BIT §2; `app.js` progress `#4B5563` → заменить на токен в Шаге 3, чтобы исключение не понадобилось). `docs/mockups/vendor/**` гейт не проверяет.

## 4. Шаг 3 — токены (общий фундамент для обоих треков)

- `tailwind.config.js` + `resources/css/app.css`: токены `--paper/--ink/--ink-muted/--surface`, `--radius: 0`, жёсткая тень `2px 2px 0`, сетка-точки на `body::before`, класс `.num` (`tabular-nums`), фокус `outline:2px solid var(--ink)`, `prefers-reduced-motion`.
- Шрифт JetBrains Mono локально (`public/fonts/`, woff2, кириллица+латиница, не CDN).
- Заменить `#4B5563` в `app.js` на `--ink`.
- Стеклянные утилиты `MissionShell` пока **не** трогаем (это U1) — чтобы шаг остался безвредным для Breeze-страниц.

**Сдача:** ворота зелёные; страницы Breeze (логин/профиль) живы; визуально — база стала «бумажной», но раскладка старая.

## 5. Параллельные треки (после Шага 3)

Запуск: два субагента параллельно (S1 = UI-трек, S2 = SCENE-трек). Каждая стадия = отдельный коммит, закрытый воротами. Для SCENE-стадий с визуальными изменениями — дополнительно скриншот в Windows и ваше «ок».

### Трек U — UI-панели (по макету A1–A6, A9, A11)

| Стадия | Содержание | Не должно сломаться |
|---|---|---|
| U1 | Шапка 1-бит: `MissionShell` → TopBar (бренд `● EARTH ORBIT LIVE`, статус TLE из пропсов, часы `HH:MM:SS UTC`, поиск `⌘K`, квадратные кнопки auth) | `focusByCatalogNumber`, слоты, страницы Breeze |
| U2 | Чипы категорий + счётчики (`useFiltersStore` + `categoryMeta`); реальная фильтрация глобуса и каталога | API `/api/satellite-categories`, данные `SatelliteCategory` |
| U3 | Каталог-ящик `CatalogDrawer.vue` (вкладки Спутники/Группировки/Избранное, виртуальный список под 10k+, `border-l-4` активной строки, ★) | избранное, поиск, `⌘K` |
| U4 | Правая карточка: `SatelliteCard` + `AsciiSchematic.vue` (SCHEMATICS из макета) + `OrbitProfileChart.vue` (SVG step-line) + таблица параметров с подсказками (glossary) + кнопки «Орбита / След / Следить / Поделиться» + «Когда увидеть» | расчёт из TLE (`lib/orbit.js`) |
| U5 | Новости (`NewsFeed`) → пункт меню шапки в новом стиле | данные NewsFeed |
| U6 | Мобильные bottom-sheet (390px): каталог и карточка, чипы в горизонтальном скролле, цели ≥ 40px | нет горизонтального переполнения |

### Трек D — 1-битная 3D-сцена (по макету A7–A8, §3.1)

| Стадия | Содержание | Не должно сломаться |
|---|---|---|
| D0 | Стресс-тест глиф-атласа на 10–15k объектов (в макете/полигоне): FPS ≥ 55 в Windows, LOD читается. **При провале — меняем схему глифов до D3** (риск №1 PLAN-1BIT) | — |
| D1 | Выключить bloom/ACES/FXAA/атмосферу/звёзды/текстуры; бумажная сфера `MeshBasicMaterial`, силуэт (inverted hull), границы Natural Earth 110m (`polygonsData`/`LineSegments`) | teardown `useGlobeDisposer`, reduced-motion, WebGL-fallback |
| D2 | Терминатор: Bayer 4×4 шейдер (прототип `terminator-test.html`), солнце по UTC (NOAA), чекбокс `TERMINATOR` | не завязан на свет/`extinguishLights` |
| D3 | Глиф-слой: `THREE.Points` + атлас 8 клеток (S O N T I R W ×), LOD по `useViewStore.lodLevel`, пикинг (рейкаст, порог 10px, `crosshair`) | воркер SGP4, интерполяция, frustum/limb-culling (переиспользовать) |
| D4 | Выбранный объект: ретикл `[ ● ]`, пунктирный трек (`LineDashedMaterial`), плашка с лидер-линией (`camera.project()`, скрытие за лимбом); слои GRID/ORBITS/LABELS по `useLayersStore` | follow-режим, fly-to |
| D5 | «Когда увидеть» над городом на SGP4 из воркера | тест на известный пролёт МКС |

### Финал

| Стадия | Содержание |
|---|---|
| F1 | Чистка: мёртвые компоненты/стили/текстуры (`public/textures`), Workbox-кэш; `ROADMAP.md`, `README.md`, `REVIEW.md` |
| F2 | Финальные вороты **по всему дереву** (не по дифу): `npm run build`, `php artisan test`, headless 0 ошибок, grep чистый; Lighthouse a11y ≥ 95; ваши скриншоты Windows «до/после»; числа FPS/draw calls до/после → в записку диплома |

## 6. Матрица зависимостей и порядок коммитов

```
Шаг 0 (откатный якорь) ──► Шаг 1 (контракт: сторы+пропсы) ──► Шаг 2 (ворота) ──► Шаг 3 (токены)
                                                                 │
                                            ┌────────────────────┴────────────────────┐
                                            ▼ (S1, параллельно)                       ▼ (S2, параллельно)
                                     U1 → U2 → U3 → U4 → U5 → U6              D0 → D1 → D2 → D3 → D4 → D5
                                            └────────────────────┬────────────────────┘
                                                                 ▼
                                                          F1 (чистка) → F2 (финал)
```
Внутри треков порядок жёсткий (каждая стадия опирается на предыдущую); между треками — свободный параллелизм. Ориентир: 4 + 6 + 6 + 2 ≈ **18 коммитов**.

## 7. Риски (контроль)

1. **Плотность глифов** → D0 до кода D3; провал = пересмотр схемы (InstancedMesh-атлас вместо Points).
2. **3301 строка в `Index.vue`** → сцену не переписываем «в лоб»: D1–D5 выносят слои в `resources/js/lib/globe/*`, `Index.vue` усыхает; инвентаризация «что остаётся/заменяется/удаляется» — первый коммит D1.
3. **Параллельные треки конфликтуют в `Index.vue`** → правило: UI-трек владеет `<template>` и стилями панелей, SCENE-трек — `lib/globe/*` и `<script setup>` сцены; общие правки (импорты сторов) — только по согласованию через меня, разные коммиты.
4. **Ворота не ловят визуал** → для D-стадий обязательный скриншот Windows.
5. **PWA-кэш** → бамп SW-версии при заметных изменениях ассетов (иначе старый бандл из кэша).

## 8. Решения по умолчанию (если вопросов не будет)

- Снапшот сборки — tar.zst/gz на диске в `docs/backups/`, не в git.
- `categories` и `tleStatus` отдаём Inertia-пропсами (Шаг 1), API-эндпоинты не удаляем (на них держатся axios-вызовы до U2/D-стадий).
- Сторов 4 (как в §2.1); `catalog` (список/поиск/избранное) живёт в `useFiltersStore`/компоненте каталога до тех пор, пока U3 не докажет обратное.
- Работаем на ветке `refactor/modernization`; откат = `legacy/design-glass`.
