# «Спутник-Онлайн» (Earth Orbit Live)

Веб-трекер спутников Земли: интерактивный 3D-глобус с ~15,9 тыс. аппаратов каталога
CelesTrak, поиск и слежение за спутником, фильтр по категориям, лента космических
событий и Telegram-уведомления, когда аппарат пролетает над заданной точкой.

## Возможности

- 3D-глобус в 1-битной графике (бумага/чернила): матовая сфера без текстур и освещения,
  силуэт инвертированной оболочки, границы Natural Earth 110m, сетка 30°, терминатор
  день/ночь на Bayer-дизеринге по UTC, спутники — `THREE.Points` с процедурным атласом
  8 глифов в одном draw call, ретикл/подписи/лидер-линии, пикинг, орбита и наземный след.
- Палитра и типографика вынесены в токены (`--paper #F4F1EA`, `--ink #0E0E0E`,
  `--ink-muted #5C5A54`, `--surface #E8E4DA`), моноширинный JetBrains Mono подключён
  локально (`public/fonts/*.woff2`), скругления нулевые, тень жёсткая 2×2.
- Каталог TLE из CelesTrak: `satellites:fetch` загружает группу `active`, раскладывает по
  категориям (ISS, STARLINK, ONEWEB, IRIDIUM, NAVIGATION, WEATHER, TELESCOPE, OTHER)
  и обновляет записи батчами через `upsert`.
- Позиции считаются по SGP4 в Node.js (`scripts/satellite_position.cjs`, `satellite.js`),
  батчем на один процесс; на фронте — Web Worker (`sgp4Core.js` + `workers/sgp4.worker.js`,
  отдельный канал для окон видимости).
- Mission-UI: `TopBar` (UTC-часы, поиск ⌘K, новости в выпадающей панели), чипы категорий,
  каталог-ящик с виртуальным списком, карточка спутника (ASCII-схема, профиль орбиты,
  блок «Когда увидеть» на `computePasses` + геолокация), переключатели слоёв.
- Регистрация, профиль, избранное, админка спутников.
- Правила алертов (точка + радиус в км) и Telegram-бот: привязка аккаунта по токену,
  поиск спутника, уведомления через очередь.

## Стек

| Слой | Технологии |
|---|---|
| Бэкенд | Laravel 11.48, PHP 8.2+ |
| Фронтенд | Inertia 2, Vue 3.4, Vite 5, Tailwind CSS 3, pinia; собственный 1-битный mission-UI, reka-ui — только для Breeze-страниц (`MissionShell`) |
| 3D | Three.js 0.183 (через globe.gl), satellite.js 6 (SGP4); без текстур и пост-обработки |
| БД | PostgreSQL + PostGIS; cache, queue и sessions — в `database` |
| Прочее | ziggy, laravel/breeze, irazasyed/telegram-bot-sdk |

## Требования

- **PHP 8.2+** (проект проверен на 8.5) с расширениями `pdo_pgsql`, `mbstring`, `openssl`,
  `tokenizer`, `xml`, `ctype`, `json`, `curl`, `fileinfo`, `zip`.
- **Composer 2**.
- **PostgreSQL 14+** (проверено на 18.6) и **PostGIS 3.x** (проверено на 3.6.2).
- **Node.js 20+** и npm. Нужен не только для сборки фронта: PHP вызывает
  `node scripts/satellite_position.cjs` для точного SGP4. Без Node приложение
  откатывается на упрощённый PHP-расчёт (в лог пишется warning, точность ниже).
- `pdo_sqlite` — только чтобы гонять тесты (см. раздел «Тесты»).

## Установка

```bash
git clone <repo-url> Sputnik-Online
cd Sputnik-Online

composer install
npm install

cp .env.example .env
php artisan key:generate
```

### 1. База данных

Создайте роль и БД (пример для peer-аутентификации через unix-сокет):

```bash
sudo -u postgres createuser --createdb "$USER"   # если роли ещё нет
createdb sputnik
psql -d sputnik -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

По умолчанию `.env.example` уже настроен на сокет:

```dotenv
DB_CONNECTION=pgsql
DB_HOST=/var/run/postgresql
DB_PORT=5432
DB_DATABASE=sputnik
DB_USERNAME=mercy
DB_PASSWORD=
```

Для подключения по TCP укажите `DB_HOST=127.0.0.1`, `DB_USERNAME`, `DB_PASSWORD`.
PostGIS используется в алертах: миграция `add_postgis_geography_to_alerts` создаёт
`CREATE EXTENSION IF NOT EXISTS postgis`, генерируемую колонку `alert_rules.zone`
(`geography(Point,4326)` из `longitude`/`latitude`, GIST-индекс) и таблицу
`satellite_subpoints` с последней подспутниковой точкой каждого аппарата (тоже
`geography(Point,4326)` + GIST). `satellites:check-alerts` пишет туда точки через
`ST_MakePoint(lng, lat)` и одним запросом считает `ST_DWithin` (попадание в радиус) и
`ST_Distance` (расстояние для текста уведомления). На не-pgsql драйверах (тесты на
sqlite) миграция ничего не делает, а команда считает расстояние haversine'ом в PHP.

### 2. Переменные окружения

Минимум, что стоит поправить в `.env`:

| Переменная | Значение |
|---|---|
| `APP_NAME` | `"Спутник-Онлайн"` (в шаблоне `Laravel`) |
| `APP_URL` | адрес приложения, например `http://127.0.0.1:8000` |
| `APP_ENV` / `APP_DEBUG` | `local` / `true` для разработки; см. «Production» |
| `DB_*` | параметры PostgreSQL |
| `TELEGRAM_BOT_TOKEN` | токен от [@BotFather](https://t.me/BotFather), если нужен бот |

`CACHE_STORE`, `QUEUE_CONNECTION`, `SESSION_DRIVER` уже указывают на `database` —
отдельные Redis/демоны не требуются, но нужны миграции (таблицы `cache`, `jobs`, `sessions`).

### 3. Миграции и сиды

```bash
php artisan migrate --seed
```

Сидер идемпотентен: создаёт привилегии и роли (`admin`, `user`, `guest`), три тестовых
аккаунта и категории спутников.

| Аккаунт | Пароль | Роль |
|---|---|---|
| `admin@example.com` | `password` | admin |
| `user@example.com` | `password` | user |
| `guest@example.com` | `password` | guest |

Пароли тестовые — смените их или не запускайте `--seed` в production.

### 4. Каталог спутников

```bash
php artisan satellites:fetch
```

Команда скачивает TLE с `celestrak.org` (таймаут 60 с), пишет ~15,9 тыс. записей чанками
по 1000 и сбрасывает кэш каталога. Нужен доступ в интернет; занимает несколько секунд.
Без этой команды глобус пуст, а `/api/satellites` возвращает `[]`.

Команда стоит в расписании дважды в сутки (01:00 и 13:00 UTC), но первый запуск нужно
сделать вручную.

### 5. Сборка фронта и запуск

```bash
npm run build          # production-сборка в public/build
# или на время разработки:
npm run dev            # Vite dev-сервер с HMR

php artisan serve      # http://127.0.0.1:8000
```

Главная страница — `/`, вход — `/login`, кабинет — `/profile`, админка — `/admin/dashboard`.

## Команды и фоновые процессы

В проекте четыре вещи, которые должны работать постоянно или по расписанию.

| Команда | Назначение | Режим |
|---|---|---|
| `php artisan satellites:fetch` | загрузка TLE из CelesTrak + сброс кэша каталога | по расписанию |
| `php artisan satellites:check-alerts` | проверка правил алертов и постановка задач в очередь; `--test` — отправить принудительно | по расписанию, каждую минуту |
| `php artisan schedule:work` | планировщик Laravel (альтернатива cron) | постоянный процесс |
| `php artisan queue:work` | обработка очереди `database` (джоба `SendTelegramAlert`) | постоянный процесс |
| `php artisan telegram:poll` | long-poll Telegram (снимает webhook, обрабатывает `/start`, `/link`, `/search`) | постоянный процесс |

Важно: без `queue:work` алерты ставятся в очередь, но не отправляются. Без
`schedule:work` (или cron) не обновляются TLE и не проверяются правила.

### Разработка: пять терминалов

```bash
php artisan serve
npm run dev
php artisan queue:work
php artisan schedule:work
php artisan telegram:poll     # только если настроен TELEGRAM_BOT_TOKEN
```

Вместо `schedule:work` можно повесить cron:

```cron
* * * * * cd /path/to/Sputnik-Online && php artisan schedule:run >> /dev/null 2>&1
```

### Telegram

1. Получите токен у [@BotFather](https://t.me/BotFather) и пропишите `TELEGRAM_BOT_TOKEN` в `.env`.
2. Запустите `php artisan telegram:poll` (после правки `.env` при закешированном конфиге
   нужен `php artisan config:clear`).
3. На сайте: `/profile` → «Подключить Telegram» → в боте отправить `/link <токен>`
   (страница показывает готовую команду).
4. Создайте правило в `/alert-rules`: спутник, широта/долгота, радиус. Проверка идёт
   раз в минуту, повторное уведомление по правилу — не чаще раза в 4 часа.

`telegram:poll` снимает webhook, поэтому не запускайте его одновременно с webhook-режимом
(`php artisan telegram:webhook`). Для production допустимы оба варианта, но webhook
требует публичный HTTPS-адрес.

## Production

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://example.com
LOG_LEVEL=warning
```

Порядок выкладки:

```bash
composer install --no-dev --optimize-autoloader
php artisan migrate --force
npm ci && npm run build

php artisan optimize          # config + route + view cache
php artisan queue:restart     # после деплоя, чтобы воркеры подхватили код
```

После изменения `.env` или конфигов — `php artisan optimize:clear` (или `config:clear`),
иначе значения останутся закешированными. Web-сервер должен смотреть в `public/`,
запись — в `storage/` и `bootstrap/cache/`.

`/api/satellites` отдаёт весь каталог одним JSON (~2,5 МБ, ~0,8 МБ gzip) и кэшируется на час.
Первый запрос после `satellites:fetch` может быть заметно дольше.

### Supervisor

```ini
[program:sputnik-queue]
command=php /var/www/sputnik/artisan queue:work database --sleep=3 --tries=3 --max-time=3600
directory=/var/www/sputnik
autostart=true
autorestart=true
user=www-data
numprocs=1
redirect_stderr=true
stdout_logfile=/var/www/sputnik/storage/logs/queue.log
stopwaitsecs=3600

[program:sputnik-schedule]
command=php /var/www/sputnik/artisan schedule:work
directory=/var/www/sputnik
autostart=true
autorestart=true
user=www-data
redirect_stderr=true
stdout_logfile=/var/www/sputnik/storage/logs/schedule.log

[program:sputnik-telegram]
command=php /var/www/sputnik/artisan telegram:poll
directory=/var/www/sputnik
autostart=true
autorestart=true
user=www-data
redirect_stderr=true
stdout_logfile=/var/www/sputnik/storage/logs/telegram.log
```

Затем `sudo supervisorctl reread && sudo supervisorctl update`.

Альтернатива — systemd (шаблон для одного воркера, юниты для планировщика и бота
делаются копированием с другой `ExecStart`):

```ini
[Unit]
Description=Sputnik-Online queue worker
After=network.target postgresql.service

[Service]
User=www-data
WorkingDirectory=/var/www/sputnik
ExecStart=/usr/bin/php /var/www/sputnik/artisan queue:work database --sleep=3 --tries=3 --max-time=3600
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Тесты

```bash
php artisan test
```

`phpunit.xml` изолирует тесты: `DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:`,
`CACHE_STORE=array`, `QUEUE_CONNECTION=sync`, поэтому dev-БД не затрагивается.
Для запуска нужен `pdo_sqlite`.

Наборы: `tests/Unit` (`SatellitePositionCalculatorTest`, `SatelliteMetadataTest`),
`tests/Feature` (`SatelliteApiTest`, `SatelliteCacheTest`, `CheckSatelliteAlertsTest`,
`EnrichSatellitesTest`, `GlobePagePropsTest`, Breeze-тесты `Auth`/`ProfileTest`).
JS-логика проверяется Node-тестами:

```bash
node --test tests/js/*.test.mjs
```

`orbit.test.mjs` — геометрия орбит/следа, `passes.test.mjs` — окна видимости
(реальный пролёт МКС над Москвой, граничные случаи). Тесты алертов идут на sqlite и
проверяют haversine-ветку; SQL-путь PostGIS проверен вручную на PostgreSQL.
Метрики последнего прогона — в `REVIEW.md`; финальные цифры фиксируются по итогам F2.

## Отладка глобуса

Добавьте к URL `?debug=1` — в углу появится HUD: `FPS`, `DRAWN / всего`,
`SPHERES` (ближний LOD глифов), `POINTS` (дальний LOD), `CULL FRUSTUM`, `CULL LIMB`.
Удобно для замера производительности на полном каталоге (стресс-тест схемы глифов дал
144 FPS стабильно на Windows — `docs/mockups/MIGRATE-STATUS.md`).

## Структура

```
app/Console/Commands/          satellites:fetch, enrich, check-alerts, telegram:poll
app/Services/SatellitePositionCalculator.php   расчёт позиций через Node/satellite.js (--batch)
app/Jobs/SendTelegramAlert.php очередь Telegram-уведомлений
scripts/satellite_position.cjs SGP4 через satellite.js (одиночный и --batch режимы)
resources/js/Pages/Globe/Index.vue             разметка 1-битного экрана, оверлеи, HUD ?debug=1
resources/js/composables/useGlobeScene.js      сцена: камера, LOD, слои, синхронизация сторов
resources/js/lib/globe/                        silhouette, borders, terminator, gridLayer,
                                               glyphAtlas + glyphLayer, sceneOverlay, lod,
                                               useGlobeDisposer (детерминированный teardown)
resources/js/lib/{orbit,passes,sgp4Core,sgp4WorkerClient}.js  геометрия, витки, SGP4
resources/js/workers/sgp4.worker.js            SGP4 вне главного потока (позиции + витки)
resources/js/components/mission/               TopBar, CategoryChips, CatalogDrawer,
                                               SatelliteCard (+AsciiSchematic, OrbitProfileChart),
                                               LayerToggles, NewsFeed/NewsCard, MissionShell (Breeze)
resources/js/stores/                           pinia: каталог, выбор, фильтры, слои, вид
tests/js/*.test.mjs            node --test: orbit, passes
routes/console.php             расписание (fetch 2 раза в сутки, алерты каждую минуту)
```

## Известные ограничения

- Без Node.js позиции не рассчитываются (возвращается null, ошибка пишется в
  `storage/logs/laravel.log`); для алертов наличие Node.js обязательно.
- Лента новостей использует демонстрационные данные (`resources/js/data/news.js`).
- SQL-путь PostGIS (`ST_DWithin`/`ST_Distance`) не покрыт тестами: `CheckSatelliteAlertsTest`
  идёт на sqlite и проверяет haversine-ветку; запрос проверен вручную на PostgreSQL 18.
