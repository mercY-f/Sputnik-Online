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

## Журнал шагов

| Шаг | Статус | Коммит | Примечание |
|---|---|---|---|
| 0 — откатный якорь | ✅ | см. git log | откат проверен (tarball → `/` в headless) |
| 1 — контракт (сторы + пропсы) | ✅ | см. git log | 5 сторов + LOD + categoryMeta + computePasses-заглушка + CONTRACT-1BIT.md; пропсы categories/tleStatus; 5 passed / 194 assertions |
| 2 — stage-gate.sh | ✅ | см. git log | `scripts/stage-gate.sh` перед коммитом; проверен позитивно (чистое дерево) и негативно (ловит скругления/blur/градиенты/чужие hex) |
| 2.1 — ворота: диф-семантика | ✅ | см. git log | `gate_new_lines.py`: гейт проверяет только новые строки, вербатим-перенесённые из HEAD — «не новые» (нужно для pure move Шага 4 и U-трека; финальная чистота дерева — F2); тесты позитив/негатив |
| 3 — токены | ✅ | см. git log | tailwind+app.css: --paper/--ink/--ink-muted/--surface, --radius: 0, тень 2px 2px 0, сетка-точек, .num, focus-visible, reduced-motion; JetBrains Mono woff2 локально (400/700, public/fonts); #4B5563 → #0E0E0E; SW-константы в vite.config нет |
| 4 — разделение Index.vue | ⬜ | | |
| U1–U6 (UI-трек) | ⬜ | | параллельно с D0–D5 |
| D0–D5 (SCENE-трек) | ⬜ | | D0 — стресс-тест глифов |
| F1–F2 (финал) | ⬜ | | |
