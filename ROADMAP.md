# «Спутник-Онлайн» — Roadmap модернизации

> Оркестратор: DeepSeek v4 Pro · План утверждён пользователем 2026-10-25
> Ветка работ: `refactor/modernization` · Стек: Laravel 11 + Inertia 2 + Vue 3.4 + Three.js (globe.gl)

## Принятые решения (стек)

| Слой | Решение |
|---|---|
| СУБД | **PostgreSQL 16 + PostGIS** (альтернатива MariaDB 11; MS SQL исключён) |
| UI-примитивы | **shadcn-vue** (reka-ui) + **lucide-vue-next** + tailwind-variants |
| State | **pinia** · тосты: vue-sonner · анимации: **motion-v** · утилиты: @vueuse/core |
| Таблицы / графика | @tanstack/vue-table · vue-echarts (телеметрия) |
| Дизайн | **Mission Control UI** — единый тёмный shell (стекло, моно-цифры, HUD-панели) |

## Спринты

### Спринт 0 — Фундамент и гигиена
- [x] git: артефакты, executable-бит, имя пакета (`chore: normalize package name and executable bit`)
- [x] fix: `atTime` пробрасывается в Node SGP4 (сейчас игнорируется)
- [x] fix: логирование fallback (упрощённый SGP4) вместо молчаливой подмены
- [x] fix: `firstOrCreate` для привилегий/ролей в сидере (идемпотентный `db:seed`)
- [x] fix: нормализация категорий (убрать orphan «Communication»)
- [x] миграция SQLite → PostgreSQL + PostGIS (нет пароля — подключение через unix-socket `/var/run/postgresql`, peer-auth; PostGIS 3.6.2)

### Спринт 1 — Бэкенд-производительность ✅
- [x] батч SGP4: один Node-процесс на массив TLE (`.cjs --batch` через stdin, `getPositionsBatch()`) + дедуп по `satellite_id`
- [x] `SendTelegramAlert` Job (ShouldQueue, tries/backoff) + `withoutOverlapping()`/`onOneServer()`
- [x] `FetchSatellites` → `upsert()` чанками по 1000 (≈37.6 c → **5.3 c**) + кэш каталога (`Cache::remember`, database store) с `Cache::flush()` на fetch
- [x] бонус-баг: изолировал тест-БД в sqlite `:memory:` (была закомментирована — `php artisan test` грохал dev-БД)
- отложено: Redis (не установлен; database-кэша хватает — кэш позиций избыточен при дедупе). Вернуться при WebSocket/SSE в Спринте 5.

### Спринт 2 — Дизайн-токены и компонентная база ✅
- [x] `@`-алиас в Vite + Tailwind `darkMode`/color-токены/`fontFamily.mono`/`tailwindcss-animate` + CSS-переменные Mission Control (тёмное стекло, emerald-акцент)
- [x] стек подключён: shadcn-vue (JS-режим) + reka-ui + lucide-vue-next + pinia + motion-v + @vueuse/core (+ cva/clsx/tailwind-merge)
- [x] базовые компоненты (канон new-york, вручную через patch — CLI упал с «Invalid Version: main»): button, badge, card, sheet, scroll-area, tooltip
- отложено: vue-sonner (тосты), Command (⌘K-палитра) — по надобности

### Спринт 3 — Mission Control Shell + Hero ✅ (основа)
- [x] MissionShell (топбар: UTC-часы · OBJ-счётчик · LIVE · ⌘K-поиск · аватар; слоты + footer) + NewsFeed/NewsCard (мок, «Найти на орбите» → emit `focus`)
- [x] Hero-расклад: глобус сверху (flex-1) + лента 38vh снизу; фокус-индикатор «◎ FOCUS — имя»
- [x] Focus: `catalog_number` в `/api/satellites` + `focusByCatalogNumber` → существующий `focusSatellite` (fly-to `pointOfView`)
- [x] F1 камера «купол/дуга сверху во всю ширину» (framing) — режимы hero/free/follow (F1 + F1.1 + F1.2) реализованы, проверено в браузере 2026-10-27
- [ ] миграция AuthenticatedLayout/Breeze + остальных страниц (Admin/Dashboard/Profile/AlertRules) на единый shell

### Спринт 4 — 3D-модернизация
- [x] InstancedMesh/Points вместо 3000 `Mesh`/сек · интерполяция (propagate t/t+1, lerp в rAF) ✅ (`d32f531`, `4c03f75`, `63bad9a`)
- [x] Web Worker для SGP4 (расчёт позиций вне главного потока) ✅ (`80dc9b8` — sgp4Core + module worker + seq-клиент с main-thread fallback; сборка зелёная 2026-11-09)
- **F2. Терминатор + огни городов (Day/Night cycle)** (см. ниже) ✅ проверено в браузере 2026-10-27
- **F3. Звёзды Points + fresnel-атмосфера** ✅ (`0f3bd4a`, спрайты `94dc8cd`; проверено в браузере 2026-10-27 — консоль чистая, свечение атмосферы на месте, звёзды аккуратные)
- локальные текстуры (Blue Marble 4K/8K, night-lights emissive, облака) + KTX2/AVIF · пост-обработка (bloom/FXAA/ACES)
- **F4. Орбиты (Line2 + ground track)** ✅ (`171f3f3`, z-фикс `83b200c`; принято пользователем 2026-10-27 — траектория + наземный трек без дубля на текстуре)
- пикинг (Raycaster/GPU) · LOD/отсечение · dispose-контракт

> **Следующий шаг (свежая сессия)**: пост-обработка (bloom/FXAA/ACES). Затем пикинг (Raycaster), LOD/отсечение. Визуальные фиксы глобуса закрывают F1–F4; работаем в `refactor/modernization`, визуальную проверку WebGL пользователь делает в Windows-браузере.

### Спринт 5 — Полировка и дипломная упаковка
- тесты · reduced-motion · WebGL-fallback · PWA-офлайн (Workbox cache текстур)
- README + пояснительная записка (СУБД, архитектура расчётов, обоснование оптимизаций)

---

## Визуальные требования (зафиксированы 2026-10-25)

### F1. Hero-экран и News Feed — Sprint 3

- **Hero-режим при первом входе**: глобус масштабируется и центрируется так, чтобы **верхняя дуга Земли занимала всю ширину экрана сверху** (режим «горизонт»), интерфейс в состоянии «обзор», а не «слежение».
- **Нижняя половина экрана** — новостная лента космических событий: запуски, научные миссии, открытия. Научные миссии и открытия — только связанные со спутниками/космическими обсерваториями (телескопы на орбите и т.п.).
- **Привязка к спутникам**: на карточке новости кнопка **«Найти на орбите»** — клик плавно анимирует камеру Three.js из Hero-режима в интерактивный режим слежения за этим аппаратом (fly-to/focus + track).
- Технически: режим камеры `hero` ⇄ `follow(satelliteId)`; переход через tween на `pointOfView`/`controls.target`; скролл новостей не блокирует сцену.

### F2. Астрономический терминатор и огни городов — Sprint 4

- **Освещение глобуса строго привязано к реальному положению Солнца на текущий UTC-момент**: расчёт подсолнечной точки (солнечное склонение + уравнение времени → долгота/широта субсолнечной точки).
- **Ночная сторона**: динамически проявляются **огни городов** (текстура Black Marble как emissive-карта/шейдер), плавно переходящие в дневную текстуру **через линию терминатора**.
- Технически: терминатор как мягкая полоса (smoothstep на угловом расстоянии от субсолнечной точки к центру Земли), emissive-слой с additive-блендингом, однородные uniform'ы (subsolar direction, терминатор!!sharpness) обновляются по UTC-таймеру; дневная/ночная текстуры стыкуются в одном шейдере.