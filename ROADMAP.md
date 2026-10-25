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
- [ ] fix: `atTime` пробрасывается в Node SGP4 (сейчас игнорируется)
- [ ] fix: логирование fallback (упрощённый SGP4) вместо молчаливой подмены
- [ ] fix: `firstOrCreate` для привилегий/ролей в сидере (идемпотентный `db:seed`)
- [ ] fix: нормализация категорий (убрать orphan «Communication»)
- [ ] миграция SQLite → PostgreSQL + PostGIS

### Спринт 1 — Бэкенд-производительность
- батч-расчёт позиций (один Node на массив TLE) или сервис-процесс · дедуп по `satellite_id` · кэш Redis
- `SendTelegramAlert` Job (ShouldQueue) + retry/backoff · `withoutOverlapping()` + `onOneServer()`
- `FetchSatellites` → `upsert()` чанками · `/api/satellites` → response-cache + gzip

### Спринт 2 — Дизайн-токены и компонентная база
- CSS-переменные + `tailwind.config` extend + `darkMode`; подключение shadcn-vue / lucide / pinia / vue-sonner / motion-v / @vueuse
- базовые примитивы: Button, Badge, Card/Panel, ScrollArea, Tooltip, Sheet, Command, Sonner

### Спринт 3 — Mission Control Shell + UI/HUD
- MissionShell + топбар (⋮ UTC-часы · счётчик · индикатор соединения · ⌘K) + HUD-панели
- **F1. Hero-режим + News Feed** (см. ниже)
- миграция `Globe/Index.vue` и `AuthenticatedLayout`/Breeze на единый shell

### Спринт 4 — 3D-модернизация
- InstancedMesh/Points вместо 3000 `Mesh`/сек · интерполяция (propagate t/t+1, lerp в rAF) · Web Worker
- **F2. Терминатор + огни городов (Day/Night cycle)** (см. ниже)
- локальные текстуры (Blue Marble 4K/8K, night-lights emissive, облака) + KTX2/AVIF · fresnel-атмосфера · звёзды Points · пост-обработка (bloom/FXAA/ACES)
- орбиты (Line2 + ground track) · пикинг (Raycaster/GPU) · LOD/отсечение · dispose-контракт

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