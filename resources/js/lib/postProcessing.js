// ---------------------------------------------------------------------------
// Пост-обработка рендера глобуса (Спринт 4)
// ---------------------------------------------------------------------------
// Цепочка пассов: RenderPass → UnrealBloomPass → OutputPass → ShaderPass(FXAA).
//
// Ключевые моменты (сверено по исходникам three 0.183 / three-render-objects):
//  * globe.gl уже держит собственный EffectComposer (создаётся в init() и
//    рендерится в тике кадра: `state.postProcessingComposer.render()`), поэтому
//    renderer.render() НЕ патчим — просто дополняем существующий composer.
//  * Аксессор globe.postProcessingComposer() — read-only (globe.gl.d.ts:131),
//    сетить туда новый composer нельзя; поэтому берём готовый инстанс и
//    добавляем пассы в него.
//  * three-render-objects сам вызывает composer.setSize(w, h) при ресайзе,
//    но uniform resolution у FXAA не обновляет — это делает updateSize().
//  * tonemapping: при рендере в render target материалы его НЕ применяют
//    (WebGLPrograms.js), поэтому ACES ставим на renderer, а применяет его
//    OutputPass (после bloom). В шейдерах/материалах тонмаппинга нет,
//    иначе получился бы двойной тонмаппинг.
//  * FXAA — строго после OutputPass: его пороги яркости настроены на
//    восприятическое (sRGB) изображение, а не на линейный HDR.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// --------------------------- Константы для тюнинга ---------------------------
// Bloom намеренно слабый: светятся только яркие пиксели — огни городов на
// ночной стороне, звёзды и кромка атмосферы. Дневную текстуру не выжигаем.
export const BLOOM_STRENGTH  = 0.45; // сила свечения (0 — выключить)
export const BLOOM_RADIUS    = 0.55; // радиус размытия
export const BLOOM_THRESHOLD = 0.82; // порог яркости: ниже — не светится

export const TONE_MAPPING_EXPOSURE = 1.05; // экспозиция ACES

/**
 * Создаёт/дополняет цепочку пост-обработки для инстанса globe.gl.
 *
 * @param {object} globe инстанс Globe() (globe.gl)
 * @returns {{composer: EffectComposer, updateSize: Function, dispose: Function}}
 */
export function createPostProcessing(globe) {
  const renderer = globe.renderer();
  const scene    = globe.scene();
  const camera   = globe.camera();

  // ACES tone mapping ставим на renderer: OutputPass прочитает настройку
  // и применит её в конце цепочки (пассы пишут в render target без тонмаппинга).
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;

  // Готовый composer three-render-objects (с RenderPass внутри).
  let composer = typeof globe.postProcessingComposer === 'function'
    ? globe.postProcessingComposer()
    : null;
  let ownsComposer = false;

  if (!composer) {
    // Фолбэк: старые версии без хука — создаём свой (и рендерим через него).
    composer = new EffectComposer(renderer);
    ownsComposer = true;
  }

  const passes = composer.passes || [];
  if (!passes.some((p) => p instanceof RenderPass)) {
    composer.addPass(new RenderPass(scene, camera));
  }

  // Явно инициализируем размеры, не полагаясь на порядок хуков width/height.
  const size = renderer.getSize(new THREE.Vector2());
  let width  = size.x || 1;
  let height = size.y || 1;
  let pixelRatio = renderer.getPixelRatio() || 1;
  composer.setSize(width, height);

  // --- UnrealBloom ---------------------------------------------------------
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  composer.addPass(bloomPass);

  // --- OutputPass (ACES + sRGB) — после bloom ------------------------------
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // --- FXAA — последним: фильтрует готовое sRGB-изображение ----------------
  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.uniforms.resolution.value.set(
    1 / (width * pixelRatio),
    1 / (height * pixelRatio),
  );
  composer.addPass(fxaaPass);

  /**
   * Обновление размера. composer.setSize() вызывать не нужно — его делает
   * three-render-objects; здесь только DPR и uniform resolution для FXAA.
   */
  function updateSize(w, h, pr) {
    if (!w || !h) return;
    width  = w;
    height = h;
    const ratio = pr || renderer.getPixelRatio() || 1;

    // DPR может измениться (перенос окна между мониторами) — composer хранит
    // свой _pixelRatio с момента создания; пересинхронизируем при отличии.
    if (Math.abs(ratio - pixelRatio) > 1e-3) {
      pixelRatio = ratio;
      if (typeof composer.setPixelRatio === 'function') composer.setPixelRatio(ratio);
    }

    // FXAA работает в пикселях drawing buffer'а, а не CSS-пикселях.
    fxaaPass.uniforms.resolution.value.set(
      1 / (width * pixelRatio),
      1 / (height * pixelRatio),
    );
  }

  function dispose() {
    // Снимаем добавленные пассы, чтобы по ним не ходил composer.render().
    for (const pass of [outputPass, fxaaPass, bloomPass]) {
      if (!pass) continue;
      if (typeof composer.removePass === 'function') composer.removePass(pass);
      if (typeof pass.dispose === 'function') pass.dispose();
    }
    if (composer.renderTarget1) composer.renderTarget1.dispose();
    if (composer.renderTarget2) composer.renderTarget2.dispose();
    if (ownsComposer && typeof composer.dispose === 'function') composer.dispose();
  }

  return { composer, bloomPass, fxaaPass, outputPass, updateSize, dispose };
}
