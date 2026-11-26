/**
 * @file JSDoc-контракты структур данных проекта Sputnik-Online (1-бит редизайн).
 * Файл содержит исключительно определения типов (без исполняемого кода).
 */

/**
 * Запись спутника из базы данных и REST API (/api/satellites).
 * Точно соответствует полям выборки в App\Http\Controllers\SatelliteController::api().
 *
 * @typedef {Object} SatelliteRecord
 * @property {number} id - Идентификатор записи в базе данных
 * @property {string} name - Название спутника (например, 'ISS (ZARYA)')
 * @property {string} catalog_number - Номер в каталоге NORAD (например, '25544')
 * @property {string} tle1 - Первая строка TLE
 * @property {string} tle2 - Вторая строка TLE
 * @property {string} category - Код категории (ISS, STARLINK, ONEWEB, NAVIGATION, TELESCOPE, IRIDIUM, WEATHER, OTHER)
 * @property {string|null} country - Двухбуквенный ISO-код страны
 * @property {string|null} country_name - Полное наименование страны
 * @property {string|null} launch_date - Дата запуска космического аппарата
 * @property {string|null} launch_site - Космодром / площадка запуска
 * @property {string|null} purpose - Назначение космического аппарата
 * @property {string|null} object_type - Тип объекта (PAYLOAD, ROCKET BODY, DEBRIS)
 * @property {string|null} decay_date - Дата схода с орбиты (если применимо)
 * @property {string|null} rcs_size - Размер ЭПР (LARGE, MEDIUM, SMALL)
 */

/**
 * Счётчики спутников по категориям.
 * Включает ключ 'ALL' с общим числом спутников и ключи по кодам категорий.
 *
 * @typedef {Record<string, number>} CategoryCounts
 */

/**
 * Статус актуальности TLE-данных каталога.
 *
 * @typedef {Object} TleStatus
 * @property {string|null} epoch - Эпоха TLE (ISO8601 строка или null)
 * @property {string|null} updatedAt - Время максимального updated_at спутников (ISO8601 строка или null)
 */

/**
 * Данные авторизованного пользователя в Inertia.
 *
 * @typedef {Object} AuthUser
 * @property {number} id - Идентификатор пользователя
 * @property {string} name - Имя пользователя
 * @property {string} [email] - Электронная почта
 * @property {{ id?: number, name: string }} [role] - Роль пользователя
 * @property {Record<string, any>} [profile] - Профиль пользователя
 */

/**
 * Входные Inertia-пропсы главной страницы глобуса (страница Globe/Index).
 *
 * @typedef {Object} GlobePageProps
 * @property {number} satelliteCount - Общее количество спутников в базе данных
 * @property {CategoryCounts} categories - Счётчики по категориям (включая 'ALL')
 * @property {TleStatus} tleStatus - Статус актуальности TLE
 * @property {{ user: AuthUser|null }} auth - Данные аутентификации пользователя
 */

/**
 * Данные видимого пролёта спутника над точкой наблюдателя.
 *
 * @typedef {Object} Pass
 * @property {Date} aos - Время появления спутника над горизонтом (Acquisition of Signal), UTC
 * @property {number} maxEl - Максимальная высота над горизонтом в градусах (0..90)
 * @property {Date} los - Время захода спутника за горизонт (Loss of Signal), UTC
 */

/**
 * Входные параметры для расчёта пролётов спутника над точкой наблюдателя.
 *
 * @typedef {Object} ComputePassesInput
 * @property {number} observerLat - Широта наблюдателя в градусах (-90..90)
 * @property {number} observerLon - Долгота наблюдателя в градусах (-180..180)
 * @property {number} [observerAltM=0] - Высота наблюдателя над уровнем моря в метрах
 * @property {string} tle1 - Первая строка двухстрочного набора элементов (TLE)
 * @property {string} tle2 - Вторая строка двухстрочного набора элементов (TLE)
 * @property {Date} from - Начало временного интервала расчёта
 * @property {Date} to - Окончание временного интервала расчёта
 * @property {number} [minElDeg=10] - Минимальная высота над горизонтом в градусах для фиксации пролёта
 */

export {};
