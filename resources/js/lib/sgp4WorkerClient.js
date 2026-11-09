import { computePositionsFromSatrecs } from './sgp4Core.js';

/**
 * Обёртка главного потока над SGP4-воркером.
 *
 * Создаёт module worker через Vite (`new Worker(new URL(...), { type: 'module' })`),
 * шлёт батч-запросы раз в секунду и возвращает Promise с готовыми позициями.
 * Если Worker недоступен (SSR/старый браузер) или конструктор бросил —
 * считаем синхронно через sgp4Core на главном потоке (поведение как раньше).
 *
 * Ответы коррелируются по seq: если уже запрошен более новый расчёт,
 * устаревший ответ просто игнорируется (ожидающий его промис резолвится null).
 */
class Sgp4WorkerClient {
  constructor() {
    this.worker       = null;
    this.satellites   = [];
    this.seq          = 0;      // последний выданный номер запроса
    this.pending      = null;   // { seq, resolve, reject } — ждём только самый свежий
    this.useFallback  = typeof Worker === 'undefined';

    if (!this.useFallback) {
      try {
        this.worker = new Worker(
          new URL('../workers/sgp4.worker.js', import.meta.url),
          { type: 'module' },
        );
        this.worker.onmessage = (event) => this.handleMessage(event.data);
        this.worker.onerror = (event) => {
          console.error('SGP4 worker error:', event && event.message);
          this.fallbackToMainThread();
        };
      } catch (e) {
        console.error('SGP4 worker init failed, falling back to main thread:', e);
        this.worker = null;
        this.useFallback = true;
      }
    }
  }

  /** Передаёт воркеру актуальный список спутников (с satrec). */
  setSatellites(list) {
    this.satellites = Array.isArray(list) ? list : [];

    // Отменяем ожидающий расчёт: набор данных изменился
    this.resolvePending(null);

    if (this.worker) {
      this.worker.postMessage({ type: 'init', satellites: this.satellites });
    }
  }

  /**
   * Считает позиции на момент date.
   * @param {Date} date
   * @returns {Promise<Array|null>} позиции либо null (устаревший/отброшенный расчёт)
   */
  computePositions(date) {
    const timeMs = date instanceof Date ? date.getTime() : Number(date) || Date.now();

    // Список ещё не инициализирован — позиции не считаем, рендер не трогаем
    if (!this.satellites.length) return Promise.resolve(null);

    if (this.useFallback || !this.worker) {
      return Promise.resolve(computePositionsFromSatrecs(this.satellites, new Date(timeMs)));
    }

    // Новый запрос вытесняет предыдущий: старый ждущий промис получает null
    this.resolvePending(null);

    const seq = ++this.seq;

    return new Promise((resolve, reject) => {
      this.pending = { seq, resolve, reject };
      try {
        this.worker.postMessage({ type: 'compute', seq, timeMs });
      } catch (e) {
        this.pending = null;
        // postMessage упал (например, satrec не клонируется) — считаем локально
        resolve(computePositionsFromSatrecs(this.satellites, new Date(timeMs)));
      }
    });
  }

  /** Останавливает воркер и снимает ожидание. */
  dispose() {
    this.resolvePending(null);
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.satellites = [];
  }

  handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'error') {
      console.error('SGP4 worker compute error:', msg.message);
      if (this.pending && this.pending.seq === msg.seq) {
        this.resolvePending(null);
      }
      return;
    }

    if (msg.type !== 'positions') return;

    // Устаревший ответ (уже запрошен более новый seq) — просто игнорируем
    if (!this.pending || this.pending.seq !== msg.seq) return;

    this.resolvePending(msg.positions || []);
  }

  resolvePending(value) {
    const pending = this.pending;
    this.pending = null;
    if (pending) pending.resolve(value);
  }

  fallbackToMainThread() {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.useFallback = true;
    this.resolvePending(null);
  }
}

export const sgp4WorkerClient = new Sgp4WorkerClient();

export default sgp4WorkerClient;
