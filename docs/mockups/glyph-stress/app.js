import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * SPUTNIK-ONLINE // STAGE D0: GLYPH ATLAS STRESS TEST
 * Architecture: THREE.Points + 8-cell category atlas canvas
 * Contract compliance: CONTRACT-1BIT.md & categoryMeta.js
 * Target: 10–15k objects, FPS >= 55, 1 draw call for points
 */

// DOM Elements
const container = document.getElementById('canvas-container');
const fpsVal = document.getElementById('fps-val');
const fpsBadge = document.getElementById('fps-badge');
const frameTimeVal = document.getElementById('frame-time-val');
const pointsVal = document.getElementById('points-val');
const drawcallsVal = document.getElementById('drawcalls-val');
const altVal = document.getElementById('alt-val');
const lodVal = document.getElementById('lod-val');

const targetGlyph = document.getElementById('target-glyph');
const targetName = document.getElementById('target-name');
const targetCat = document.getElementById('target-cat');
const targetNorad = document.getElementById('target-norad');
const targetAlt = document.getElementById('target-alt');
const targetIncl = document.getElementById('target-incl');
const atlasPreview = document.getElementById('atlas-preview');

// Config State
const config = {
  pointCount: 12000,
  lodEnabled: true,
  baseGlyphSize: 16.0,
  limbCulling: true,
  animateOrbits: true
};

// Categories definition according to CONTRACT-1BIT / categoryMeta.js
const CATEGORIES = [
  { id: 'STARLINK',   letter: 'S', name: 'STARLINK',     ratio: 0.58, minAlt: 530,   maxAlt: 570,   incl: 53.0 },
  { id: 'ONEWEB',     letter: 'O', name: 'ONEWEB',       ratio: 0.06, minAlt: 1180,  maxAlt: 1220,  incl: 87.9 },
  { id: 'NAVIGATION', letter: 'N', name: 'NAVIGATION',   ratio: 0.03, minAlt: 19100, maxAlt: 23200, incl: 55.0 },
  { id: 'TELESCOPE',  letter: 'T', name: 'TELESCOPES',   ratio: 0.015,minAlt: 500,   maxAlt: 1200,  incl: 28.5 },
  { id: 'ISS',        letter: 'I', name: 'STATIONS (ISS)',ratio: 0.005,minAlt: 415,  maxAlt: 425,   incl: 51.6 },
  { id: 'IRIDIUM',    letter: 'R', name: 'IRIDIUM',      ratio: 0.02, minAlt: 770,   maxAlt: 790,   incl: 86.4 },
  { id: 'WEATHER',    letter: 'W', name: 'WEATHER',      ratio: 0.02, minAlt: 800,   maxAlt: 35786, incl: 0.0 },
  { id: 'OTHER',      letter: '×', name: 'OTHER SATS',   ratio: 0.27, minAlt: 300,   maxAlt: 2000,  incl: 65.0 }
];

// Setup Scene, Camera, Renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xF4F1EA); // --paper

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 100);
// Initial camera distance = 3.6 R (altitude ~ 2.6R -> FAR LOD)
camera.position.set(0, 1.4, 3.3);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.15;
controls.maxDistance = 12.0;

// 1-Bit Earth Model (R = 1.0)
const earthGroup = new THREE.Group();
scene.add(earthGroup);

// Solid Paper Core
const earthMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1.0, 48, 36),
  new THREE.MeshBasicMaterial({
    color: 0xF4F1EA,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  })
);
earthGroup.add(earthMesh);

// Technical Wireframe Meridians & Parallels
const wireLines = new THREE.LineSegments(
  new THREE.WireframeGeometry(new THREE.SphereGeometry(1.001, 24, 16)),
  new THREE.LineBasicMaterial({ color: 0x0E0E0E, transparent: true, opacity: 0.20 })
);
earthGroup.add(wireLines);

// Distinct Equator line
const eqPoints = [];
for (let i = 0; i <= 64; i++) {
  const a = (i / 64) * Math.PI * 2;
  eqPoints.push(new THREE.Vector3(Math.cos(a) * 1.002, 0, Math.sin(a) * 1.002));
}
const eqLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(eqPoints),
  new THREE.LineBasicMaterial({ color: 0x0E0E0E, transparent: true, opacity: 0.55 })
);
earthGroup.add(eqLine);

// Create 8-cell Glyph Atlas
function createGlyphAtlas() {
  const canvas = document.createElement('canvas');
  const cellSize = 128;
  const cols = 8;
  const rows = 2; // Row 0: Normal, Row 1: Hovered/Selected
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  const ctx = canvas.getContext('2d');

  const paper = '#F4F1EA';
  const ink = '#0E0E0E';

  for (let c = 0; c < cols; c++) {
    const letter = CATEGORIES[c].letter;
    const x = c * cellSize;
    const pad = 12;
    const boxSize = cellSize - pad * 2;

    // Row 0: Normal
    ctx.fillStyle = paper;
    ctx.fillRect(x + pad, pad, boxSize, boxSize);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 8;
    ctx.strokeRect(x + pad, pad, boxSize, boxSize);
    ctx.fillStyle = ink;
    ctx.font = 'bold 64px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x + cellSize / 2, cellSize / 2);

    // Row 1: Hovered / Selected (Inverted)
    const y1 = cellSize;
    ctx.fillStyle = ink;
    ctx.fillRect(x + pad, y1 + pad, boxSize, boxSize);
    ctx.strokeStyle = paper;
    ctx.lineWidth = 4;
    ctx.strokeRect(x + pad + 2, y1 + pad + 2, boxSize - 4, boxSize - 4);
    ctx.fillStyle = paper;
    ctx.font = 'bold 64px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x + cellSize / 2, y1 + cellSize / 2);
  }

  // Draw Row 0 onto bottom HUD preview
  if (atlasPreview) {
    atlasPreview.width = cols * 32;
    atlasPreview.height = 32;
    const pctx = atlasPreview.getContext('2d');
    pctx.drawImage(canvas, 0, 0, canvas.width, cellSize, 0, 0, atlasPreview.width, 32);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = true;
  return texture;
}

const atlasTexture = createGlyphAtlas();

// Generate 15,000 synthetic satellites
const MAX_SATELLITES = 15000;
const satData = [];
let catPointer = 0;
let catCount = 0;

for (let i = 0; i < MAX_SATELLITES; i++) {
  // Determine category by ratio
  if (catCount >= Math.round(MAX_SATELLITES * CATEGORIES[catPointer].ratio) && catPointer < CATEGORIES.length - 1) {
    catPointer++;
    catCount = 0;
  }
  catCount++;
  const cat = CATEGORIES[catPointer];

  // Altitude in km & Earth radii (R = 6371km)
  const altKm = THREE.MathUtils.randFloat(cat.minAlt, cat.maxAlt);
  const altR = altKm / 6371.0;
  const r = 1.0 + altR;

  // Orbital elements
  const inclDeg = cat.incl + THREE.MathUtils.randFloatSpread(4.0);
  const inclRad = THREE.MathUtils.degToRad(inclDeg);
  const raanRad = THREE.MathUtils.randFloat(0, Math.PI * 2);
  const theta0 = THREE.MathUtils.randFloat(0, Math.PI * 2);
  // Orbital velocity (Kepler: w ~ 1 / r^1.5)
  const omega = Math.sqrt(1.0 / (r * r * r)) * 0.18;

  satData.push({
    index: i,
    name: `${cat.id}-${1000 + (i % 8999)}`,
    category: cat.id,
    letter: cat.letter,
    glyphIndex: catPointer,
    norad: 20000 + i,
    altKm: Math.round(altKm),
    inclDeg: inclDeg.toFixed(1),
    r,
    inclRad,
    raanRad,
    theta0,
    omega
  });
}

// Buffers for THREE.Points
const positions = new Float32Array(MAX_SATELLITES * 3);
const glyphIndices = new Float32Array(MAX_SATELLITES);
const isSelected = new Float32Array(MAX_SATELLITES);

// Initialize positions and attributes
function computePosition(sat, timeSec, outVec) {
  const theta = sat.theta0 + sat.omega * timeSec;
  const cosI = Math.cos(sat.inclRad);
  const sinI = Math.sin(sat.inclRad);
  const cosO = Math.cos(sat.raanRad);
  const sinO = Math.sin(sat.raanRad);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  outVec.x = sat.r * (cosO * cosT - sinO * sinT * cosI);
  outVec.y = sat.r * (sinT * sinI);
  outVec.z = sat.r * (sinO * cosT + cosO * sinT * cosI);
}

const tempVec = new THREE.Vector3();
for (let i = 0; i < MAX_SATELLITES; i++) {
  computePosition(satData[i], 0, tempVec);
  positions[i * 3]     = tempVec.x;
  positions[i * 3 + 1] = tempVec.y;
  positions[i * 3 + 2] = tempVec.z;
  glyphIndices[i] = satData[i].glyphIndex;
  isSelected[i] = 0.0;
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('glyphIndex', new THREE.BufferAttribute(glyphIndices, 1));
geometry.setAttribute('isSelected', new THREE.BufferAttribute(isSelected, 1));
geometry.setDrawRange(0, config.pointCount);

// Custom ShaderMaterial for THREE.Points
const pointsMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uAtlas: { value: atlasTexture },
    uBaseSize: { value: config.baseGlyphSize },
    uLodState: { value: 0.0 }, // 0 = FAR, 1 = MID, 2 = NEAR, -1 = OFF
    uLimbCulling: { value: 1.0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    uInkColor: { value: new THREE.Color(0x0E0E0E) }
  },
  vertexShader: `
    attribute float glyphIndex;
    attribute float isSelected;

    uniform float uBaseSize;
    uniform float uLodState;
    uniform float uLimbCulling;
    uniform float uPixelRatio;

    varying float vGlyphIndex;
    varying float vIsSelected;
    varying float vOccluded;

    void main() {
      vGlyphIndex = glyphIndex;
      vIsSelected = isSelected;
      vOccluded = 0.0;

      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vec4 mvPosition = viewMatrix * worldPos;
      gl_Position = projectionMatrix * mvPosition;

      // Limb culling against Earth sphere at origin (R = 1.0)
      if (uLimbCulling > 0.5) {
        vec3 camPos = cameraPosition;
        vec3 pt = worldPos.xyz;
        vec3 ray = pt - camPos;
        float dLenSq = dot(ray, ray);
        float t0 = -dot(camPos, ray) / dLenSq;
        if (t0 > 0.0 && t0 < 1.0) {
          vec3 closest = camPos + t0 * ray;
          if (dot(closest, closest) < 0.998) {
            vOccluded = 1.0;
          }
        }
      }

      // LOD sizing
      float ptSize = uBaseSize;
      if (uLodState == 0.0) {
        ptSize = 4.0; // FAR LOD dot
      } else if (uLodState == 1.0) {
        ptSize = uBaseSize * 0.75; // MID LOD
      } else {
        ptSize = uBaseSize; // NEAR or LOD OFF
      }

      if (isSelected > 0.5) {
        ptSize = max(ptSize, 22.0);
      }

      gl_PointSize = ptSize * uPixelRatio;
    }
  `,
  fragmentShader: `
    uniform sampler2D uAtlas;
    uniform float uLodState;
    uniform vec3 uInkColor;

    varying float vGlyphIndex;
    varying float vIsSelected;
    varying float vOccluded;

    void main() {
      if (vOccluded > 0.5) {
        discard;
      }

      // FAR LOD: 1-bit crisp dot unless selected
      if (uLodState == 0.0 && vIsSelected < 0.5) {
        vec2 pc = gl_PointCoord;
        if (pc.x < 0.15 || pc.x > 0.85 || pc.y < 0.15 || pc.y > 0.85) {
          discard;
        }
        gl_FragColor = vec4(uInkColor, 1.0);
        return;
      }

      // Sample 8-column x 2-row atlas
      float col = clamp(floor(vGlyphIndex + 0.5), 0.0, 7.0);
      float row = vIsSelected > 0.5 ? 1.0 : 0.0;

      vec2 uv = vec2((col + gl_PointCoord.x) / 8.0, (row + gl_PointCoord.y) / 2.0);
      vec4 texColor = texture2D(uAtlas, uv);

      if (texColor.a < 0.2) {
        discard;
      }

      gl_FragColor = texColor;
    }
  `,
  transparent: true,
  depthTest: true,
  depthWrite: false
});

const pointsMesh = new THREE.Points(geometry, pointsMaterial);
scene.add(pointsMesh);

// Raycasting / Picking Setup
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-999, -999);
let hoveredIndex = -1;
let selectedIndex = -1;
const isSelectedAttr = geometry.getAttribute('isSelected');
const posAttr = geometry.getAttribute('position');

window.addEventListener('pointermove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('click', () => {
  if (hoveredIndex !== -1) {
    selectedIndex = hoveredIndex;
    updateTargetCard(selectedIndex);
  } else {
    selectedIndex = -1;
    clearTargetCard();
  }
});

function updateTargetCard(idx) {
  if (idx < 0 || idx >= satData.length) return;
  const s = satData[idx];
  targetGlyph.textContent = s.letter;
  targetGlyph.style.background = '#0E0E0E';
  targetGlyph.style.color = '#F4F1EA';
  targetName.textContent = s.name;
  targetCat.textContent = s.category;
  targetNorad.textContent = s.norad;
  targetAlt.textContent = `${s.altKm} km`;
  targetIncl.textContent = `${s.inclDeg}°`;
}

function clearTargetCard() {
  targetGlyph.textContent = '-';
  targetGlyph.style.background = '#F4F1EA';
  targetGlyph.style.color = '#0E0E0E';
  targetName.textContent = 'HOVER OVER GLYPH TO PICK';
  targetCat.textContent = '--';
  targetNorad.textContent = '--';
  targetAlt.textContent = '-- km';
  targetIncl.textContent = '--°';
}

function performPicking() {
  raycaster.setFromCamera(mouse, camera);

  // Dynamic 10px world threshold adjusted for distance
  const camDist = camera.position.length();
  const vFovRad = THREE.MathUtils.degToRad(camera.fov);
  const pixelWorld = (2 * Math.tan(vFovRad / 2) * camDist) / window.innerHeight;
  raycaster.params.Points.threshold = pixelWorld * 10.0;

  const intersects = raycaster.intersectObject(pointsMesh);
  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = 0; i < intersects.length; i++) {
    const hit = intersects[i];
    if (hit.index >= config.pointCount) continue;

    // Check limb occlusion
    if (config.limbCulling) {
      const pt = hit.point;
      const cam = camera.position;
      const ray = new THREE.Vector3().subVectors(pt, cam);
      const dLenSq = ray.lengthSq();
      const t0 = -cam.dot(ray) / dLenSq;
      if (t0 > 0 && t0 < 1) {
        const closest = new THREE.Vector3().copy(cam).addScaledVector(ray, t0);
        if (closest.lengthSq() < 0.998) continue; // Behind Earth
      }
    }

    if (hit.distanceToRay < bestDist) {
      bestDist = hit.distanceToRay;
      bestIdx = hit.index;
    }
  }

  if (bestIdx !== hoveredIndex) {
    if (hoveredIndex !== -1 && hoveredIndex !== selectedIndex) {
      isSelectedAttr.setX(hoveredIndex, 0.0);
    }
    hoveredIndex = bestIdx;
    if (hoveredIndex !== -1) {
      isSelectedAttr.setX(hoveredIndex, 1.0);
      document.body.style.cursor = 'crosshair';
      updateTargetCard(hoveredIndex);
    } else {
      if (selectedIndex === -1) {
        document.body.style.cursor = 'default';
        clearTargetCard();
      } else {
        updateTargetCard(selectedIndex);
      }
    }
    isSelectedAttr.needsUpdate = true;
  }
}

// FPS & Telemetry tracking
const FPS_WINDOW = 60;
const fpsHistory = [];
let lastFrameTime = performance.now();
let simTime = 0;

function updateLODAndTelemetry() {
  const camDist = camera.position.length();
  const altR = camDist - 1.0;
  altVal.textContent = `${altR.toFixed(2)} R`;

  let lodState = 0.0;
  let lodText = 'FAR (> 2.2R)';

  if (!config.lodEnabled) {
    lodState = -1.0;
    lodText = 'OFF (FORCED GLYPHS)';
  } else if (altR > 2.2) {
    lodState = 0.0;
    lodText = 'FAR (> 2.2R · DOTS)';
  } else if (altR >= 1.4) {
    lodState = 1.0;
    lodText = 'MID (1.4–2.2R · HYBRID)';
  } else {
    lodState = 2.0;
    lodText = 'NEAR (< 1.4R · GLYPHS)';
  }

  pointsMaterial.uniforms.uLodState.value = lodState;
  lodVal.textContent = lodText;
  pointsVal.textContent = config.pointCount.toLocaleString();
  drawcallsVal.textContent = renderer.info.render.calls;
}

// Animation loop
function animate(now) {
  requestAnimationFrame(animate);

  const dt = (now - lastFrameTime) * 0.001;
  lastFrameTime = now;

  // FPS Calculation (moving 60-frame average)
  const currentFps = dt > 0 ? 1.0 / dt : 60;
  fpsHistory.push(currentFps);
  if (fpsHistory.length > FPS_WINDOW) fpsHistory.shift();
  const avgFps = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;

  fpsVal.textContent = avgFps.toFixed(1);
  frameTimeVal.textContent = `${(dt * 1000).toFixed(1)} ms`;
  if (avgFps >= 55) {
    fpsBadge.textContent = 'PASS (>=55)';
    fpsBadge.style.background = '#0E0E0E';
  } else {
    fpsBadge.textContent = 'SUB-55';
    fpsBadge.style.background = '#888';
  }

  // Orbital positions animation
  if (config.animateOrbits) {
    simTime += dt * 0.4;
    const posArray = posAttr.array;
    for (let i = 0; i < config.pointCount; i++) {
      computePosition(satData[i], simTime, tempVec);
      posArray[i * 3]     = tempVec.x;
      posArray[i * 3 + 1] = tempVec.y;
      posArray[i * 3 + 2] = tempVec.z;
    }
    posAttr.needsUpdate = true;
  }

  controls.update();
  performPicking();
  renderer.render(scene, camera);
  updateLODAndTelemetry();
}

// UI Controls Binding
document.querySelectorAll('button[data-count]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('button[data-count]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    config.pointCount = parseInt(btn.dataset.count, 10);
    geometry.setDrawRange(0, config.pointCount);
    if (hoveredIndex >= config.pointCount) hoveredIndex = -1;
    if (selectedIndex >= config.pointCount) selectedIndex = -1;
  });
});

const btnLodOn = document.getElementById('btn-lod-on');
const btnLodOff = document.getElementById('btn-lod-off');
btnLodOn.addEventListener('click', () => {
  config.lodEnabled = true;
  btnLodOn.classList.add('active');
  btnLodOff.classList.remove('active');
});
btnLodOff.addEventListener('click', () => {
  config.lodEnabled = false;
  btnLodOff.classList.add('active');
  btnLodOn.classList.remove('active');
});

document.querySelectorAll('button[data-size]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('button[data-size]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    config.baseGlyphSize = parseFloat(btn.dataset.size);
    pointsMaterial.uniforms.uBaseSize.value = config.baseGlyphSize;
  });
});

const btnLimbOn = document.getElementById('btn-limb-on');
const btnLimbOff = document.getElementById('btn-limb-off');
btnLimbOn.addEventListener('click', () => {
  config.limbCulling = true;
  pointsMaterial.uniforms.uLimbCulling.value = 1.0;
  btnLimbOn.classList.add('active');
  btnLimbOff.classList.remove('active');
});
btnLimbOff.addEventListener('click', () => {
  config.limbCulling = false;
  pointsMaterial.uniforms.uLimbCulling.value = 0.0;
  btnLimbOff.classList.add('active');
  btnLimbOn.classList.remove('active');
});

const btnAnim = document.getElementById('btn-anim');
btnAnim.addEventListener('click', () => {
  config.animateOrbits = !config.animateOrbits;
  btnAnim.textContent = config.animateOrbits ? 'ORBITS: PLAY' : 'ORBITS: PAUSED';
  btnAnim.classList.toggle('active', config.animateOrbits);
});

document.getElementById('btn-reset-cam').addEventListener('click', () => {
  camera.position.set(0, 1.4, 3.3);
  controls.target.set(0, 0, 0);
  controls.update();
});

document.getElementById('cam-near').addEventListener('click', () => {
  const dir = camera.position.clone().normalize();
  camera.position.copy(dir.multiplyScalar(1.0 + 0.8));
  controls.update();
});

document.getElementById('cam-mid').addEventListener('click', () => {
  const dir = camera.position.clone().normalize();
  camera.position.copy(dir.multiplyScalar(1.0 + 1.8));
  controls.update();
});

document.getElementById('cam-far').addEventListener('click', () => {
  const dir = camera.position.clone().normalize();
  camera.position.copy(dir.multiplyScalar(1.0 + 3.5));
  controls.update();
});

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  pointsMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
});

// Start animation loop
requestAnimationFrame(animate);
