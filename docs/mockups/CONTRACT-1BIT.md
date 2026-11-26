# Контракт интерфейсов: Перенос 1-битного макета (Шаг 1)

Данный документ фиксирует соглашения об интерфейсах между серверной частью (Laravel 11), хранилищем состояния (Pinia 4.1), UI-компонентами и 3D-сценой (globe.gl / three.js).

---

## (а) Входные Inertia-пропсы страницы Globe/Index

Страница трекера (`resources/js/Pages/Globe/Index.vue`) получает от контроллера `App\Http\Controllers\SatelliteController::index()` следующий набор данных:

```typescript
interface GlobePageProps {
  satelliteCount: number;
  categories: Record<string, number>;
  tleStatus: {
    epoch: string | null;
    updatedAt: string | null;
  };
  auth: {
    user: {
      id: number;
      name: string;
      email?: string;
      role?: { name: string };
      profile?: Record<string, any>;
    } | null;
  };
}
```

### Описание полей:
- `satelliteCount: number` — общее число спутников в базе данных (`Satellite::count()`);
- `categories: Record<string, number>` — ассоциативный массив счётчиков спутников по категориям. Обязательно включает ключ `'ALL'` с общим числом, а также счётчики по категориям (`ISS`, `STARLINK`, `ONEWEB`, `IRIDIUM`, `NAVIGATION`, `WEATHER`, `TELESCOPE`, `OTHER`). Кэшируется с использованием `SatelliteCache::categoriesKey()`;
- `tleStatus: { epoch: string|null, updatedAt: string|null }` — статус актуальности TLE-данных:
  - `epoch`: `null` (источник актуальной эпохи орбитальных параметров пока не подключён, зарезервировано);
  - `updatedAt`: ISO 8601 строка последнего обновления базы спутников (`Satellite::max('updated_at')`) либо `null`;
- `auth.user`: данные текущего авторизованного пользователя (включая загруженные связи `role` и `profile`) либо `null` для гостя.

---

## (б) Контракт REST API

### 1. `GET /api/satellites?category=ALL|ISS|...`
Возвращает массив записей спутников для отображения на глобусе и в каталоге. Кэшируется по ключу `satellites:api:{CATEGORY}:v2`.

- **Формат ответа**: HTTP 200 `Array<SatelliteRecord>`
- **Структура `SatelliteRecord`** (14 полей выборки):
```json
[
  {
    "id": 1,
    "name": "ISS (ZARYA)",
    "catalog_number": "25544",
    "tle1": "1 25544U 98067A   26299.20906838  .00006121  00000+0  11890-3 0  9995",
    "tle2": "2 25544  51.6337  11.7282 0006920 310.9581  49.0809 15.49059765592065",
    "category": "ISS",
    "country": "US",
    "country_name": "United States",
    "launch_date": "1998-11-20",
    "launch_site": "TYMSC",
    "purpose": "Space Station",
    "object_type": "PAYLOAD",
    "decay_date": null,
    "rcs_size": "LARGE"
  }
]
```

### 2. `GET /api/satellite-categories`
Возвращает счётчики по категориям для динамического обновления.

- **Формат ответа**: HTTP 200 `Record<string, number>`
```json
{
  "ALL": 10543,
  "STARLINK": 6200,
  "ONEWEB": 634,
  "NAVIGATION": 148,
  "IRIDIUM": 75,
  "WEATHER": 52,
  "TELESCOPE": 24,
  "ISS": 2,
  "OTHER": 3408
}
```

### 3. `GET /api/user/favorites`
Возвращает избранные спутники авторизованного пользователя. Требует middleware `auth`.

- **Успех**: HTTP 200
```json
{
  "favorites": [
    {
      "id": 1,
      "name": "ISS (ZARYA)",
      "catalog_number": "25544"
    }
  ]
}
```
- **Не авторизован**: HTTP 401 `{"error": "Unauthenticated"}`

### 4. `POST /api/user/favorites/{id}/toggle`
Переключает статус добавления спутника в избранное (таблица связи many-to-many). Требует middleware `auth`.

- **Параметр маршрута**: `{id}` — числовой ID спутника
- **Успех**: HTTP 200 `{"success": true}`
- **Не авторизован**: HTTP 401 `{"error": "Unauthenticated"}`

---

## (в) Контракт SGP4 Web Worker

Клиент главного потока: `resources/js/lib/sgp4WorkerClient.js`
Воркер (Vite module worker): `resources/js/workers/sgp4.worker.js`

### Сообщения Главный поток → Воркер (`postMessage`):
1. **Инициализация / Обновление спутников**:
```javascript
{
  type: 'init',
  satellites: Array<{
    id: number,
    name: string,
    category: string,
    catalogNumber: string,
    satrec: object // объект satellite.twoline2satrec
  }>
}
```
2. **Запрос расчёта позиций на момент времени**:
```javascript
{
  type: 'compute',
  seq: number,    // инкрементный идентификатор запроса
  timeMs: number  // временная метка Date.getTime()
}
```

### Сообщения Воркер → Главный поток (`postMessage`):
1. **Результат вычисления позиций**:
```javascript
{
  type: 'positions',
  seq: number,
  timeMs: number,
  positions: Array<{
    id: number,
    name: string,
    category: string,
    catalogNumber: string,
    lat: number, // широта в градусах [-90, 90]
    lng: number, // долгота в градусах [-180, 180]
    alt: number  // высота над поверхностью Земли в радиусах Земли (km / 6371)
  }>
}
```
2. **Сообщение об ошибке**:
```javascript
{
  type: 'error',
  seq: number,
  timeMs: number,
  message: string
}
```

Клиент `sgp4WorkerClient` обеспечивает автоматический сброс устаревших промисов при получении нового `seq`, а также fallback на расчёт в главном потоке (`lib/sgp4Core.js`) в случае недоступности Web Worker.

---
## (г) Сигнатура функции расчёта пролётов `computePasses`

Файл: `resources/js/lib/passes.js`
На этапе Шаг 1 реализована детерминированная демо-заглушка. На этапе D5 заглушка будет заменена на полноценный расчёт через SGP4 и геоцентрическую геометрию наблюдателя.

```typescript
interface ComputePassesInput {
  observerLat: number;    // Широта наблюдателя (-90..90)
  observerLon: number;    // Долгота наблюдателя (-180..180)
  observerAltM?: number;  // Высота над уровнем моря в метрах (по умолчанию 0)
  tle1: string;           // Строка 1 TLE
  tle2: string;           // Строка 2 TLE
  from: Date;             // Начало окна расчёта
  to: Date;               // Конец окна расчёта
  minElDeg?: number;      // Минимальная высота над горизонтом (по умолчанию 10°)
}

interface Pass {
  aos: Date;              // Время восхода над горизонтом (UTC)
  maxEl: number;          // Максимальная высота в градусах (0..90)
  los: Date;              // Время захода за горизонт (UTC)
}

function computePasses(params: ComputePassesInput): Promise<Pass[]>;
```

---

## (д) Таблица категорий и семантика фильтра

Файл метаданных: `resources/js/lib/categoryMeta.js`

| Идентификатор | Глиф | labelRu | Чип в UI | Семантика и охват |
|---|:---:|---|:---:|---|
| `ALL` | — | ВСЕ | Да | Все объекты каталога без фильтрации |
| `ISS` | `I` | СТАНЦИИ | Да | Пилотируемые космические станции (МКС, Тяньгун и др.) |
| `STARLINK` | `S` | STARLINK | Да | Низкоорбитальное созвездие связи SpaceX |
| `ONEWEB` | `O` | ONEWEB | Да | Низкоорбитальная группировка связи OneWeb |
| `NAVIGATION` | `N` | НАВИГАЦИЯ | Да | Навигационные созвездия (GPS, ГЛОНАСС, Galileo, BeiDou) |
| `TELESCOPE` | `T` | ТЕЛЕСКОПЫ | Да | Орбитальные телескопы и астрофизические обсерватории |
| `IRIDIUM` | `R` | IRIDIUM | **Нет** | Входит в агрегированный чип «ДРУГОЕ» |
| `WEATHER` | `W` | ПОГОДА | **Нет** | Входит в агрегированный чип «ДРУГОЕ» |
| `OTHER` | `×` | ДРУГОЕ | Да | **Матчит всё, что НЕ входит** в 5 основных чип-категорий (`ISS`, `STARLINK`, `ONEWEB`, `NAVIGATION`, `TELESCOPE`). Включает `IRIDIUM`, `WEATHER` и любые неклассифицированные аппараты |

Хелпер `matchesFilter(sat, filterId)` строго реализует данную логику:
```javascript
if (!sat) return false;
if (!filterId || filterId === 'ALL') return true;
if (filterId === 'OTHER') {
  return !['ISS', 'STARLINK', 'ONEWEB', 'NAVIGATION', 'TELESCOPE'].includes(sat.category);
}
return sat.category === filterId;
```

---

## (е) Константы уровней детализации (LOD)

Файл: `resources/js/lib/globe/lod.js`

```javascript
export const LOD = {
  FAR: 2.2,
  MID: 1.4,
  MAX_MID_GLYPHS: 8,
};
```

### Поведение LOD в 3D-сцене (высота камеры в радиусах Земли):
1. **`alt > 2.2R` (LOD FAR)**: спутники рендерятся простыми квадратными точками размером 2px без глифов;
2. **`1.4R <= alt <= 2.2R` (LOD MID)**: глифы букв категорий отображаются только для спутников, наиболее близких к центру экрана (не более `MAX_MID_GLYPHS = 8` штук одновременно);
3. **`alt < 1.4R` (LOD NEAR)**: полноценное отображение глифов для всех спутников выбранной категории/группы.
