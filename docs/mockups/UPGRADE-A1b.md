# Инструкция по апгрейду макета: настоящий 3D-глобус (шаг A1b)

Адресат: исполнитель-субагент. Читай целиком, прежде чем править. Если что-то неясно — не придумывай, а напиши это в отчёте.

## 0. Зачем
Сейчас в `docs/mockups/ui-redesign.html` глобус — плоский SVG-круг: «вращение» двигает картинку, спутники не уходят за горизонт, это не соответствует реальному проекту. Пользователь требует **полный интерактив просмотра**: свободное вращение во все стороны, плавный зум, клик по спутнику, перелёт камеры к выбранному. Достигается только реальной 3D-сценой. Реальный проект уже использует `globe.gl` (v2.45.0, внутри three 0.183) — макет должен вести себя так же.

**Цель шага:** заменить SVG-глобус макета на `globe.gl`. Остальной интерфейс (шапка, чипсы, правая карточка, фокус-плашка, избранное, часы UTC) НЕ менять визуально и функционально.

## 1. Жёсткие рамки (нарушение = откат)
1. Меняется только `docs/mockups/ui-redesign.html`. Новые файлы — только в `docs/mockups/vendor/` (п. 3). Никаких правок в `resources/`, `app/`, `package.json`, `public/`, `.env` (его вообще не читать).
2. Нельзя менять: вёрстку/CSS шапки `.topbar`, `.chips-bar`, `.sat-card`, `.focus-badge`, данные `SATELLITES`, `CATEGORY_COLORS`, тексты интерфейса (все на русском).
3. Нельзя добавлять: SGP4/satellite.js, запросы к API, npm-зависимости, сборку (Vite). Макет остаётся одним статичным HTML + vendor-файл.
4. Не переименовывать существующие id/функции: `selectSatellite`, `renderChips`, `renderSelectedCard`, `toggleFavorite`, `updateDotsVisibility`, `state.selectedSatId`, `el.*`.
5. Не делать «заодно» A2–A8 из PLAN.md. Не трогать PLAN.md.
6. Git: один коммит на подшаг (см. п. 6), только локально, **push запрещён**. Коммитить только файлы шага: `git add <конкретный путь>`, никогда `git add -A`/`.`. `docs/mockups/PLAN.md` остаётся untracked. Сообщения в стиле репо: `docs(mockup): ...` / `fix(mockup): ...`.
7. Экономь вывод: файл ~2600 строк. Не `cat` целиком — `grep -n` и `read_file(offset, limit)`. Тихие флаги у команд.

## 2. Что есть сейчас (карта файла)
- CSS: `.viewport-canvas` (~106, fixed на весь экран), `.globe-stage` (~129, фикс. размер 760px), `.globe-sphere`, `.globe-svg`, `.globe-clouds`, `.sat-dots-layer`, `.sat-dot*`, `.orbit-path-svg`.
- HTML: `<main id="viewportStage">` (~1122) содержит `#globeStage` > `#globeSphere` > SVG (`#globeMapGroup`, `#globeContinents`), `#cloudLayer`, `#orbitPathLayer`, `#satDotsLayer`.
- JS: `SATELLITES` (~1496, у каждого есть `lat`, `lng`, `alt` км, `category`, `x`,`y` в % — старые SVG-координаты), `BACKGROUND_DOTS` (~1890, только `x,y,cat,name`), `CATEGORY_COLORS` (~1919).
- Функции под замену/удаление: `renderSatDots`, `clampDotLabel`, `updateDotsVisibility` (адаптировать), `applyGlobeTransform`, `initGlobeInteraction` (удалить полностью вместе с pointer/wheel/dblclick-обработчиками и `state.globe`).
- Функции, которые ОСТАЮТСЯ и должны продолжать работать: `selectSatellite`, `renderChips`, `renderSelectedCard`, `toggleFavorite`, `handleTopbarSearch`, `startUtcClock`, `startTelemetryJitter`, `bindEvents`.

## 3. Подготовка библиотеки (подшаг 1)
Страница будет открываться через локальный сервер, **не** через `file://` — иначе WebGL не загрузит текстуры (CORS, «tainted canvas»). Это важно: не пытайся лечить это флагами.

1. `mkdir -p docs/mockups/vendor` и скопировать `node_modules/globe.gl/dist/globe.gl.min.js` → `docs/mockups/vendor/globe.gl.min.js` (UMD, глобальная переменная `Globe`, three внутри; отдельный three подключать НЕ нужно). `node_modules` в .gitignore, поэтому копия нужна — макет должен работать без сборки.
2. Текстуры не копировать — ссылаться на `../../public/textures/earth-blue-marble.webp`, `earth-topology.webp`, `night-sky.webp` (относительные пути от `docs/mockups/`).
3. Подключить `<script src="vendor/globe.gl.min.js"></script>` перед основным `<script>`.
4. Как открывать (записать комментарием в начале файла и в отчёте): из корня репо `python3 -m http.server 8080`, затем `http://localhost:8080/docs/mockups/ui-redesign.html`. Просмотр через `file://` не поддерживается.
5. Проверка подшага: `ls -la docs/mockups/vendor/` (размер ~1.7 МБ), `python3 -c` парсер HTML, `node --check` на вырезанный `<script>`. Коммит: `docs(mockup): vendor globe.gl для настоящего 3D-глобуса`.

## 4. Замена глобуса (подшаг 2)
Цель: `#viewportStage` содержит один контейнер-холст `globe.gl`, на весь экран.

### 4.1 HTML/CSS
- Внутри `<main id="viewportStage">` оставить единственный дочерний `<div id="globeCanvas"></div>`. Удалить `#globeStage`, `#globeSphere`, SVG, `#cloudLayer`, `#orbitPathLayer`, `#satDotsLayer`.
- Удалить CSS-правила, ставшие мёртвыми: `.globe-stage`, `.globe-atmosphere`, `.globe-sphere`, `.globe-svg`, `.globe-clouds`, `.orbit-*`, `.sat-dots-layer`, `.sat-dot*`, `.sat-label*`. Проверить grep-ом, что на них нигде нет ссылок.
- `.viewport-canvas` оставить: fixed, inset 0, фон тёмный. Добавить `#globeCanvas { position:absolute; inset:0; cursor:grab }` и `#globeCanvas:active { cursor:grabbing }`.
- Слои UI (`.topbar`, `.chips-bar`, `.sat-card`, `.focus-badge`) остаются **вне** `<main>`, поверх по z-index, и должны оставаться кликабельными.

### 4.2 JS — создание
```js
const globe = Globe()(document.getElementById('globeCanvas'))
  .width(window.innerWidth).height(window.innerHeight)
  .backgroundColor('rgba(0,0,0,0)')
  .globeImageUrl('../../public/textures/earth-blue-marble.webp')
  .bumpImageUrl('../../public/textures/earth-topology.webp')
  .backgroundImageUrl('../../public/textures/night-sky.webp')
  .atmosphereColor('#38bdf8').atmosphereAltitude(0.18);
globe.pointOfView({ lat: 25, lng: 60, altitude: 1.9 }); // стартовый вид: Земля крупно, но целиком
```
- Ресайз: `window.addEventListener('resize', () => globe.width(innerWidth).height(innerHeight))`.
- Управление (OrbitControls уже встроен — свой код вращения/зума НЕ писать):
  `const c = globe.controls(); c.enableDamping = true; c.dampingFactor = 0.08; c.enablePan = false; c.rotateSpeed = 0.6; c.zoomSpeed = 0.8; c.minDistance = 135; c.maxDistance = 700; c.autoRotate = true; c.autoRotateSpeed = 0.35;`
  (радиус Земли в globe.gl = 100 ед.; 135 — почти у поверхности, 700 — Земля маленькая. Значения dampingFactor 0.08, enablePan=false и minDistance ≈ 1.35 радиуса соответствуют референсу watchsat.live — это замеры поведения, чужой код не копируется.)
  Автовращение: выключить при первом взаимодействии — `c.addEventListener('start', () => { c.autoRotate = false; })` — и при выборе спутника. Уважать `prefers-reduced-motion: reduce` (тогда `autoRotate = false` сразу).
  Подсказка в интерфейсе (мелким текстом внизу по центру, не футер и не панель, исчезает через 6 с после первого действия): «Вращайте — перетаскивание · приближайте — колёсико или щипок».
- Двойной клик/тап — сброс вида: `globe.pointOfView({lat:25,lng:60,altitude:1.9}, 800)`. Вешать на `#globeCanvas`, игнорировать, если клик был по спутнику.

### 4.3 JS — спутники
- Основные (`SATELLITES`): `globe.pointsData(...)` с полями `lat`, `lng`, `alt` (в долях радиуса: `altKm / 6371`, но для читаемости умножить на 1 и ограничить минимумом 0.02), `color` из `CATEGORY_COLORS`, `radius` ≈ 0.35 (МКС 0.55), `id`.
  `.pointLat('lat').pointLng('lng').pointAltitude('alt').pointColor('color').pointRadius('radius').pointResolution(8)`
- Подпись при наведении: `.pointLabel(d => d.name)` — стандартный tooltip globe.gl, без самописных DOM-лейблов.
- Клик: `.onPointClick(d => selectSatellite(d.id))`. Для фоновых точек — как раньше: найти первый спутник той же категории и выбрать его.
- Фоновые точки (`BACKGROUND_DOTS` имеет только `x,y`): **сгенерировать детерминированно** (seeded PRNG, например mulberry32 с фиксированным seed — без `Math.random`, чтобы вид не менялся при перезагрузке) ~700 штук, распределённых по категориям пропорционально числам из чипсов, но с потолком 250 на категорию. Для Starlink — широта в пределах ±53°, для остальных — равномерно по сфере. Уберите зависимость от старых `x,y`. Высота `alt` 0.03–0.10, радиус 0.15.
- Активный спутник: радиус ×1.6 и белая обводка нельзя (нет в pointsData) — вместо этого добавить `globe.ringsData([выбранный])` (пульсирующее кольцо цветом категории: `.ringColor(() => t => ...)`, `.ringMaxRadius(3)`, `.ringPropagationSpeed(2)`, `.ringRepeatPeriod(1200)`).
- Орбита выбранного: `globe.pathsData([...])` — массив из ~120 точек `[lat,lng,alt]`, строится **приближённо** по `sat.inclination` (если поля нет — взять из `SATELLITES`/карточки; иначе 51.64° для МКС) синусоидой: `lat = inc * sin(θ)`, `lng = lng0 + θ*(180/π)` с поправкой на период. Это иллюстрация, **не** SGP4; в комментарии кода так и написать. `.pathColor(() => 'rgba(16,185,129,0.8)').pathStroke(0.6).pathDashLength(0.02).pathDashGap(0.008).pathDashAnimateTime(60000)`.
- Фильтр чипсов: `updateDotsVisibility()` теперь пересобирает `pointsData` (все точки, у не подходящих категорий — убрать из массива; для «Избранное» — только избранные). Ничего не скрывать CSS-ом.
- Выбор спутника: `selectSatellite(id)` остаётся прежним по смыслу и в конце вызывает `globe.pointOfView({ lat: sat.lat, lng: sat.lng, altitude: 1.4 }, 1000)` — плавный перелёт, обновляет `ringsData` и `pathsData`.
- Закрытие карточки/фокус-плашки: убрать rings и paths, камеру не двигать.
- `startTelemetryJitter` (если он двигает `sat.lat/lng`) — после обновления вызывать пересборку `pointsData` не чаще раза в секунду. Если он этого не делает — не добавлять движения.

### 4.4 Удаление мёртвого кода
Удалить: `applyGlobeTransform`, `initGlobeInteraction` и вызов в `init()`, `state.globe`, `clampDotLabel`, `renderSatDots` (заменить на `renderGlobePoints()`), ссылки `el.satDotsLayer/orbitPathLayer/cloudLayer/globeStage/globeSphere/globeMapGroup`. После удаления: `grep -n` по каждому имени = 0 совпадений.

Коммит: `docs(mockup): настоящий 3D-глобус на globe.gl вместо SVG, свободное вращение и зум`.

## 5. Критерии приёмки (проверь сам, приведи реальный вывод)
Статические (обязательно, команды выполнить):
1. `python3 -c "import html.parser; ..."` — парсится без ошибок.
2. Вырезать `<script>` (без `src`) в `$TMPDIR/x.js` и `node --check` — OK. (Регулярка должна брать именно inline-скрипт, а не `<script src>`.)
3. `grep -c` на удалённые имена (`globeSphere`, `satDotsLayer`, `orbitPathLayer`, `cloudLayer`, `applyGlobeTransform`, `initGlobeInteraction`, `state.globe`, `.sat-dot`) = 0.
4. `grep -n "Globe()"` — ровно один вызов; `grep -n "setPointerCapture\|addEventListener('wheel'"` = 0 (управление только через `globe.controls()`).
5. Все ссылки на ресурсы существуют: для каждого пути из `globeImageUrl/bumpImageUrl/backgroundImageUrl` и `vendor/globe.gl.min.js` проверить `ls` относительно `docs/mockups/`.
6. Диапазон правок: `git diff --stat` — только `ui-redesign.html` и `vendor/globe.gl.min.js`.
7. Smoke-тест в Node без браузера (по возможности): через `jsdom`, если уже есть в `node_modules`; если нет — **не устанавливать**, просто указать «не проверено».

Визуальные (делает пользователь, НЕ утверждай, что они проверены): вращение во все стороны, зум колёсиком и щипком, клик по точке открывает карточку и камера летит к спутнику, чипсы фильтруют, шапка/карточка кликабельны поверх глобуса, нет белого экрана.

## 6. Порядок коммитов
1. `docs(mockup): vendor globe.gl для настоящего 3D-глобуса` (п. 3)
2. `docs(mockup): настоящий 3D-глобус на globe.gl вместо SVG, свободное вращение и зум` (п. 4)
Если после 2 найдёшь собственную ошибку — отдельный `fix(mockup): ...`, не `--amend`.

## 6a. Референс и лицензия
Ориентир по UX — watchsat.live/live. Его код минифицирован и не лицензирован для переиспользования: **не копировать код, шейдеры, тексты и ресурсы с этого сайта**, не скачивать его текстуры. Можно опираться только на наблюдаемое поведение (параметры управления выше). Любые такие заимствования пометить в отчёте.

## 7. Типичные ошибки (не повторяй)
- Подключить three отдельно или через CDN: не нужно, globe.gl.min.js самодостаточен.
- Писать свои pointer/wheel-обработчики поверх OrbitControls: сломает вращение. Только `globe.controls()`.
- Открывать через `file://` и «чинить» чёрный глобус: нужен http-сервер (п. 3.4).
- Пересоздавать `Globe()` при смене фильтра: создаётся один раз, меняются только `*Data`.
- Высота точек в километрах: в globe.gl это доля радиуса Земли (км / 6371).
- Подменять данные: `SATELLITES` не менять, новых полей не добавлять, кроме вычисляемых на лету.
- Рапортовать «проверено визуально»: в WSL браузер не запускается; пиши честно, что проверено только статически.
- `git add -A`, амендить чужие коммиты, пушить.

## 8. Формат отчёта
- Хеши и `git show --stat` обоих коммитов.
- По каждому пункту раздела 4: сделано / не сделано / отклонения, с диапазонами строк.
- Реальный вывод всех команд из раздела 5.
- Отдельным списком: что НЕ проверено и что должен посмотреть пользователь.
- Любые отклонения от инструкции — с причиной. Не замалчивай.
