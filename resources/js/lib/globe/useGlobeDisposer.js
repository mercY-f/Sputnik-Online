// ---------------------------------------------------------------------------
// Единый dispose-контракт для 3D-глобуса (Three.js / globe.gl) — Спринт 4
// ---------------------------------------------------------------------------
// Проблема, которую решает модуль: при переходе на другой роут Inertia
// компонент Globe/Index.vue размонтируется, но WebGL-рендерер, GPU-буферы
// (геометрии, материалы, текстуры, render target'ы EffectComposer), SGP4
// Web Worker и DOM-слушатели остаются живыми. Браузер держит контекст, пока
// на него есть ссылки, а лимит контекстов на страницу — 8..16, поэтому после
// нескольких переходов/перезагрузок страницы получаем «context lost» и утечку
// видеопамяти.
//
// Контракт: все ресурсы регистрируются по категориям в момент создания
// (registerGeometry / registerMaterial / ... / registerDisposer), а затем ОДИН
// вызов disposeAll({ scene, renderer, controls }) освобождает их в строго
// детерминированном порядке:
//
//   1. Web Workers (terminate — сначала, чтобы не прилетели новые колбэки)
//   2. произвольные disposer-функции слоёв (звёзды, атмосфера, орбиты, ...)
//   3. DOM-слушатели, requestAnimationFrame, таймеры
//   4. обход сцены (fallback): geometry / material / texture-slots / отвязка
//   5. EffectComposer: пассы (в т.ч. render target'ы UnrealBloomPass) и буферы
//   6. зарегистрированные render target'ы
//   7. controls.dispose()
//   8. renderer.dispose() + forceContextLoss()
//
// Все операции идемпотентны и переживают частично разрушенный граф: после
// gl.destroy()/innerHTML='' обход сцены не падает, а no-op'ит.
import { onBeforeUnmount } from 'vue';

// ---------------------------------------------------------------------------
// Текстурные слоты материала
// ---------------------------------------------------------------------------
// material.dispose() НЕ освобождает текстуры: они живут в WebGLProperties
// рендерера и остаются в видеопамяти до texture.dispose(). Поэтому все слоты
// перечислены явно — от базового MeshStandardMaterial до расширений
// (clearcoat / sheen / transmission / iridescence / anisotropy).
const TEXTURE_SLOTS = [
  'map',
  'lightMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'normalMap',
  'displacementMap',
  'roughnessMap',
  'metalnessMap',
  'alphaMap',
  'specularMap',
  'specularColorMap',
  'specularIntensityMap',
  'envMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'transmissionMap',
  'thicknessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
  'gradientMap',
  'matcap',
];

// Общие цели трансформации: один render target часто шарится несколькими
// пассами и материалами, поэтому dispose зовём ровно один раз на объект.
function makeSeen() {
  return new Set();
}

// Метка «уже освобождён» на самом объекте. Set'ы выше ловят повторы внутри
// одного менеджера, а метка — ещё и внешние вызовы (postProcessing.dispose()
// диспоузит те же render target'ы UnrealBloomPass, что и disposeComposer).
// Второй dispose() у Texture/Geometry/Material безопасен, но лишний раз дёргает
// события renderer'а и мешает отчёту быть точным.
const DISPOSED = Symbol.for('globe.disposed');

function claim(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj[DISPOSED]) return false;
  try {
    Object.defineProperty(obj, DISPOSED, {
      value: true,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // Замороженный объект — работаем без метки, полагаемся на Set'ы.
  }
  return true;
}

function isTextureLike(value) {
  return !!value && typeof value === 'object' && value.isTexture === true
    && typeof value.dispose === 'function';
}

function disposeTexture(tex, seen) {
  if (!isTextureLike(tex) || seen.has(tex)) return 0;
  seen.add(tex);
  try {
    tex.dispose();
  } catch (e) {
    warn('texture', e);
  }
  return 1;
}

function disposeGeometry(geom, seen) {
  if (!geom || typeof geom.dispose !== 'function' || seen.has(geom)) return 0;
  seen.add(geom);
  try {
    geom.dispose();
  } catch (e) {
    warn('geometry', e);
  }
  return 1;
}

function disposeMaterial(mat, seenMaterials, seenTextures) {
  if (!mat || typeof mat !== 'object' || seenMaterials.has(mat)) return { materials: 0, textures: 0 };
  seenMaterials.add(mat);

  let textures = 0;

  // Текстурные слоты (map / normalMap / emissiveMap / ...).
  for (const slot of TEXTURE_SLOTS) {
    textures += disposeTexture(mat[slot], seenTextures);
  }

  // ShaderMaterial: текстуры живут в uniforms ({ value: Texture }).
  if (mat.uniforms && typeof mat.uniforms === 'object') {
    for (const uniform of Object.values(mat.uniforms)) {
      if (uniform && isTextureLike(uniform.value)) {
        textures += disposeTexture(uniform.value, seenTextures);
      }
    }
  }

  try {
    if (typeof mat.dispose === 'function') mat.dispose();
  } catch (e) {
    warn('material', e);
  }

  return { materials: 1, textures };
}

function disposeMaterialOrArray(material, seenMaterials, seenTextures) {
  let materials = 0;
  let textures = 0;

  // obj.material может быть одиночным материалом или массивом (мульти-группы).
  const list = Array.isArray(material) ? material : [material];
  for (const mat of list) {
    const r = disposeMaterial(mat, seenMaterials, seenTextures);
    materials += r.materials;
    textures += r.textures;
  }
  return { materials, textures };
}

function detach(obj) {
  try {
    if (typeof obj.removeFromParent === 'function') obj.removeFromParent();
    else if (obj.parent) obj.parent.remove(obj);
  } catch (e) {
    warn('detach', e);
  }
}

function warn(what, err) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`[globe-disposer] ${what} dispose failed:`, err);
  }
}

// Значение, зарегистрированное как «живой» handle (id таймера / rAF): может
// быть числом, функцией-геттером (handle переназначается каждый кадр) или
// null. Геттер решает проблему rafId = requestAnimationFrame(renderFrame),
// где id меняется на каждом кадре.
function resolveHandle(handle) {
  if (typeof handle === 'function') {
    try {
      return handle();
    } catch {
      return null;
    }
  }
  return handle;
}

// ---------------------------------------------------------------------------
// EffectComposer: пассы и их внутренние render target'ы
// ---------------------------------------------------------------------------
// EffectComposer.dispose() освобождает только renderTarget1/2 и copyPass.
// UnrealBloomPass держит собственные буферы: renderTargetBright (1 шт.) и
// две пирамиды renderTargetsHorizontal / renderTargetsVertical (nMips штук).
// Без явного dispose это 2·nMips+1 полноэкранных RGBA-таргетов на каждый
// заход на страницу.
function disposeComposer(composer, seenTargets) {
  if (!composer || typeof composer !== 'object') return { passes: 0, target: 0 };

  let passes = 0;
  let targets = 0;

  const passList = Array.isArray(composer.passes) ? [...composer.passes] : [];

  for (const pass of passList) {
    if (!pass) continue;

    const innerTargets = [
      pass.renderTargetBright,
      ...(Array.isArray(pass.renderTargetsHorizontal) ? pass.renderTargetsHorizontal : []),
      ...(Array.isArray(pass.renderTargetsVertical) ? pass.renderTargetsVertical : []),
    ];

    for (const rt of innerTargets) {
      if (rt && typeof rt.dispose === 'function' && !seenTargets.has(rt)) {
        seenTargets.add(rt);
        try { rt.dispose(); targets++; } catch (e) { warn('bloom target', e); }
      }
    }

    // Снимаем пасс из цепочки, чтобы render() по нему не ходил.
    if (typeof composer.removePass === 'function') {
      try { composer.removePass(pass); } catch (e) { warn('removePass', e); }
    }
    if (typeof pass.dispose === 'function') {
      try { pass.dispose(); passes++; } catch (e) { warn('pass', e); }
    }
  }

  for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
    if (rt && typeof rt.dispose === 'function' && !seenTargets.has(rt)) {
      seenTargets.add(rt);
      try { rt.dispose(); targets++; } catch (e) { warn('composer target', e); }
    }
  }

  if (typeof composer.dispose === 'function') {
    try { composer.dispose(); } catch (e) { warn('composer', e); }
  }

  return { passes, targets };
}

// ---------------------------------------------------------------------------
// Фабрика менеджера (без зависимости от Vue — можно использовать в тестах)
// ---------------------------------------------------------------------------
export function createGlobeDisposer(options = {}) {
  const registry = {
    geometries:   new Set(),
    materials:    new Set(),
    textures:     new Set(),
    objects:      new Set(),
    renderTargets: new Set(),
    composers:    new Set(),
    workers:      new Set(),
    listeners:    [],   // { target, type, handler, options }
    rafs:         [],   // handle | getter
    timers:       [],   // handle | getter
    controls:     new Set(),
    renderers:    new Set(),
    disposers:    [],   // произвольные функции очистки
  };

  let disposed = false;
  let report = null;

  const seen = {
    geometries: makeSeen(),
    materials:  makeSeen(),
    textures:   makeSeen(),
    targets:    makeSeen(),
  };

  // ---------------------------- Регистрация -------------------------------
  // Поздняя регистрация: если disposeAll уже прошёл, а ресурс создан позже
  // (асинхронная загрузка текстуры, дозапрос каталога), освобождаем его сразу —
  // иначе он повиснет в видеопамяти до перезагрузки страницы.
  function lateRegister(disposeFn) {
    try {
      disposeFn();
    } catch (e) {
      warn('late-register', e);
    }
    return api;
  }

  function registerGeometry(geom) {
    if (!geom) return api;
    if (disposed) return lateRegister(() => disposeGeometry(geom, seen.geometries));
    registry.geometries.add(geom);
    return api;
  }

  function registerMaterial(mat) {
    if (!mat) return api;
    if (disposed) {
      return lateRegister(() => disposeMaterialOrArray(mat, seen.materials, seen.textures));
    }
    if (Array.isArray(mat)) mat.forEach(m => m && registry.materials.add(m));
    else registry.materials.add(mat);
    return api;
  }

  function registerTexture(tex) {
    if (!tex) return api;
    if (disposed) {
      return lateRegister(() => {
        const list = Array.isArray(tex) ? tex : [tex];
        list.forEach(t => disposeTexture(t, seen.textures));
      });
    }
    if (Array.isArray(tex)) tex.forEach(t => t && registry.textures.add(t));
    else registry.textures.add(tex);
    return api;
  }

  function registerObject(obj) {
    if (!obj) return api;
    if (disposed) {
      return lateRegister(() => {
        disposeGeometry(obj.geometry, seen.geometries);
        disposeMaterialOrArray(obj.material, seen.materials, seen.textures);
        detach(obj);
      });
    }
    registry.objects.add(obj);
    return api;
  }

  // Меш/Points/InstancedMesh/Group — общий случай registerObject.
  const registerMesh = registerObject;

  function registerRenderTarget(target) {
    if (Array.isArray(target)) target.forEach(t => t && registry.renderTargets.add(t));
    else if (target) registry.renderTargets.add(target);
    return api;
  }

  function registerComposer(composer) {
    if (composer) registry.composers.add(composer);
    return api;
  }

  function registerWorker(worker) {
    if (worker) registry.workers.add(worker);
    return api;
  }

  function registerEventListener(target, type, handler, listenerOptions) {
    if (!target || !type || !handler) return api;
    if (typeof target.addEventListener !== 'function') return api;
    target.addEventListener(type, handler, listenerOptions);
    registry.listeners.push({ target, type, handler, options: listenerOptions });
    return api;
  }

  // Число id либо геттер — см. resolveHandle: rafId/таймеры переназначаются.
  function registerRaf(handle) {
    if (handle !== null && handle !== undefined) registry.rafs.push(handle);
    return api;
  }

  function registerTimer(handle) {
    if (handle !== null && handle !== undefined) registry.timers.push(handle);
    return api;
  }

  function registerControls(controls) {
    if (controls) registry.controls.add(controls);
    return api;
  }

  function registerRenderer(renderer) {
    if (renderer) registry.renderers.add(renderer);
    return api;
  }

  function registerDisposer(fn) {
    if (typeof fn === 'function') registry.disposers.push(fn);
    return api;
  }

  // ---------------------------- Полная очистка -----------------------------
  /**
   * Освобождает всё, что было зарегистрировано, и добивает остатки по сцене.
   *
   * @param {object}   [targets]
   * @param {object}   [targets.scene]    THREE.Scene для fallback-обхода
   * @param {object}   [targets.renderer] WebGLRenderer (dispose + forceContextLoss)
   * @param {object}   [targets.controls] Orbit/TrackballControls (dispose)
   * @returns {object} отчёт о количестве освобождённых ресурсов
   */
  function disposeAll(targets = {}) {
    // Идемпотентность: второй вызов (двойной onBeforeUnmount, HMR) — no-op.
    if (disposed) return report;

    disposed = true;

    const counts = {
      workers: 0,
      disposers: 0,
      listeners: 0,
      rafs: 0,
      timers: 0,
      traversed: 0,
      geometries: 0,
      materials: 0,
      textures: 0,
      objects: 0,
      renderTargets: 0,
      composers: 0,
      passes: 0,
      controls: 0,
      renderers: 0,
      contextLost: false,
    };

    // 1. Воркеры: terminate первым, чтобы после освобождения сцены не прилетел
    //    ответ с позициями и не начал писать в уже удалённые буферы.
    for (const worker of registry.workers) {
      try {
        if (typeof worker.terminate === 'function') worker.terminate();
        counts.workers++;
      } catch (e) {
        warn('worker', e);
      }
    }
    registry.workers.clear();

    // 2. Произвольные disposer'ы слоёв (звёзды, атмосфера, орбиты, post-processing).
    //    Порядок регистрации сохраняется; падение одного не блокирует остальные.
    for (const fn of registry.disposers) {
      try {
        fn();
        counts.disposers++;
      } catch (e) {
        warn('disposer', e);
      }
    }
    registry.disposers.length = 0;

    // 3. DOM-слушатели.
    for (const { target, type, handler, options } of registry.listeners) {
      try {
        target.removeEventListener(type, handler, options);
        counts.listeners++;
      } catch (e) {
        warn('listener', e);
      }
    }
    registry.listeners.length = 0;

    // 4. Анимационные кадры и таймеры.
    for (const handle of registry.rafs) {
      const id = resolveHandle(handle);
      if (id === null || id === undefined) continue;
      try {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
        counts.rafs++;
      } catch (e) {
        warn('raf', e);
      }
    }
    registry.rafs.length = 0;

    for (const handle of registry.timers) {
      const id = resolveHandle(handle);
      if (id === null || id === undefined) continue;
      try {
        clearInterval(id);
        clearTimeout(id); // id таймаута и интервала — разные пространства в браузере, оба безопасны
        counts.timers++;
      } catch (e) {
        warn('timer', e);
      }
    }
    registry.timers.length = 0;

    // 5. Явно зарегистрированные объекты (меши вне сцены, ручные группы).
    for (const obj of registry.objects) {
      counts.geometries += disposeGeometry(obj.geometry, seen.geometries);
      const m = disposeMaterialOrArray(obj.material, seen.materials, seen.textures);
      counts.materials += m.materials;
      counts.textures  += m.textures;
      // InstancedMesh держит собственный instanceMatrix/instanceColor буфер.
      if (typeof obj.dispose === 'function' && obj.isInstancedMesh) {
        try { obj.dispose(); } catch (e) { warn('instancedMesh', e); }
      }
      detach(obj);
      counts.objects++;
    }
    registry.objects.clear();

    // 6. Fallback-обход сцены: всё, что не попало в реестр (внутренности
    //    globe.gl / three-globe / three-render-objects), всё равно освобождаем.
    const scene = targets.scene || options.scene || null;
    if (scene && typeof scene.traverse === 'function') {
      const found = [];
      try {
        scene.traverse((obj) => { if (obj) found.push(obj); });
      } catch (e) {
        warn('traverse', e);
      }

      // Сначала освобождаем ресурсы, потом отвязываем от графа: remove внутри
      // traverse сломало бы обход children.
      for (const obj of found) {
        counts.geometries += disposeGeometry(obj.geometry, seen.geometries);
        const m = disposeMaterialOrArray(obj.material, seen.materials, seen.textures);
        counts.materials += m.materials;
        counts.textures  += m.textures;
        if (obj.isInstancedMesh && typeof obj.dispose === 'function') {
          try { obj.dispose(); } catch (e) { warn('instancedMesh', e); }
        }
        counts.traversed++;
      }

      for (const obj of found) detach(obj);
    }

    // 7. Зарегистрированные текстуры / материалы / геометрии, которых не было
    //    в графе (загружаются асинхронно и могли не дойти до сцены).
    for (const tex of registry.textures) counts.textures += disposeTexture(tex, seen.textures);
    registry.textures.clear();

    for (const mat of registry.materials) {
      const m = disposeMaterial(mat, seen.materials, seen.textures);
      counts.materials += m.materials;
      counts.textures  += m.textures;
    }
    registry.materials.clear();

    for (const geom of registry.geometries) counts.geometries += disposeGeometry(geom, seen.geometries);
    registry.geometries.clear();

    // 8. EffectComposer: пассы + внутренние render target'ы (UnrealBloomPass).
    for (const composer of registry.composers) {
      const r = disposeComposer(composer, seen.targets);
      counts.composers++;
      counts.passes += r.passes;
      counts.renderTargets += r.targets;
    }
    registry.composers.clear();

    // 9. Отдельно зарегистрированные render target'ы.
    for (const rt of registry.renderTargets) {
      if (!rt || typeof rt.dispose !== 'function' || seen.targets.has(rt)) continue;
      seen.targets.add(rt);
      try { rt.dispose(); counts.renderTargets++; } catch (e) { warn('renderTarget', e); }
    }
    registry.renderTargets.clear();

    // 10. Контролы камеры (OrbitControls / TrackballControls из globe.gl).
    const controlsList = new Set(registry.controls);
    if (targets.controls) controlsList.add(targets.controls);

    for (const controls of controlsList) {
      if (!controls) continue;
      try {
        if (typeof controls.dispose === 'function') controls.dispose();
        else if (typeof controls.removeEventListener === 'function') {
          // TrackballControls: dispose() есть в three ≥ 0.150, но на всякий случай.
          controls.enabled = false;
        }
        counts.controls++;
      } catch (e) {
        warn('controls', e);
      }
    }
    registry.controls.clear();

    // 11. Рендерер: списки рендера → dispose() → потеря WebGL-контекста.
    //     forceContextLoss() — единственный способ гарантированно вернуть
    //     контекст браузеру, не дожидаясь сборки мусора.
    const renderers = new Set(registry.renderers);
    if (targets.renderer) renderers.add(targets.renderer);

    for (const renderer of renderers) {
      if (!renderer) continue;
      try {
        if (renderer.renderLists && typeof renderer.renderLists.dispose === 'function') {
          renderer.renderLists.dispose();
        }
        if (typeof renderer.dispose === 'function') renderer.dispose();
        if (typeof renderer.forceContextLoss === 'function') {
          renderer.forceContextLoss();
          counts.contextLost = true;
        }
        counts.renderers++;
      } catch (e) {
        warn('renderer', e);
      }
    }
    registry.renderers.clear();

    report = counts;
    return report;
  }

  const api = {
    // регистрация
    registerGeometry,
    registerMaterial,
    registerTexture,
    registerMesh,
    registerObject,
    registerRenderTarget,
    registerComposer,
    registerWorker,
    registerEventListener,
    registerRaf,
    registerTimer,
    registerControls,
    registerRenderer,
    registerDisposer,
    // очистка
    disposeAll,
    isDisposed: () => disposed,
    // для отладки в ?debug=1 / тестах
    getReport: () => report,
    getRegistry: () => registry,
  };

  return api;
}

/**
 * Vue-композабл: создаёт менеджер и вешает полную очистку на onBeforeUnmount.
 *
 * @param {Function|object} [resolveTargets] геттер сцены/рендерера/контролов
 *        (`() => ({ scene, renderer, controls })`) либо статический объект.
 *        Геттер предпочтителен: к моменту размонтирования инстанс globe.gl
 *        может быть уже пересоздан (HMR) или ещё не создан.
 * @param {object}   [opts]
 * @param {boolean}  [opts.auto] вешать ли onBeforeUnmount автоматически (true).
 *        При false очистку вызывает компонент — тогда это делается в его
 *        собственном onBeforeUnmount через try/finally.
 * @returns {ReturnType<typeof createGlobeDisposer>}
 */
export function useGlobeDisposer(resolveTargets = null, opts = {}) {
  const { auto = true } = opts;
  const disposer = createGlobeDisposer();

  const targets = () => {
    if (typeof resolveTargets !== 'function') return resolveTargets || {};
    try {
      return resolveTargets() || {};
    } catch (e) {
      warn('resolveTargets', e);
      return {};
    }
  };

  if (auto && typeof onBeforeUnmount === 'function') {
    onBeforeUnmount(() => disposer.disposeAll(targets()));
  }

  return Object.assign(disposer, { resolveTargets: targets });
}

export default useGlobeDisposer;
