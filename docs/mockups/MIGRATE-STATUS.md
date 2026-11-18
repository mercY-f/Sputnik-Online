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

## FPS-база (Шаг 0.4) — нужен ваш замер

Текущая сцена, `?debug=1` HUD, ваша машина, Windows:
- FPS (стабильный, полный экран): **_** (вписать)
- Дата/разрешение: **_**

### Замер D0 (стресс-тест глифов) — Windows
1. `cd docs\mockups\glyph-stress` → `python -m http.server 8188` (в WSL: `python3`)
2. Открыть `http://localhost:8188`: FPS в HUD на 12k/15k точек (порог **≥ 55**), LOD колесом мыши, пикинг глифов кликом.
3. Результат: FPS на 15k: **_** — вердикт: ок / пересмотр схемы глифов до D3 (InstancedMesh).

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
| U3–U6 (UI-трек) | ⬜ | | U3 — каталог-ящик; параллельно с D-треком |
| D0 — стресс-тест глифов | ✅ (харнес) | см. git log | `docs/mockups/glyph-stress/`: 12k THREE.Points (1 draw call), атлас 8 глифов, LOD 2.2/1.4, пикинг 10px, лимб-куллинг, HUD FPS/draw calls; headless (swiftshader) 0 ошибок; **замер FPS ≥ 55 в Windows — за вами** (см. ниже) |
| D1–D5 (SCENE-трек) | ⬜ | | параллельно с U2–U6; перед D3 — вердикт по FPS (провал = InstancedMesh вместо Points) |
| F1–F2 (финал) | ⬜ | | |
