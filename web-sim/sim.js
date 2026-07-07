import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.getElementById("canvas");
const status = document.getElementById("status");

const nSlider = document.getElementById("nSlider");
const lSlider = document.getElementById("lSlider");
const mSlider = document.getElementById("mSlider");
const sizeSlider = document.getElementById("sizeSlider");
const opacitySlider = document.getElementById("opacitySlider");
const countSlider = document.getElementById("countSlider");

const nValue = document.getElementById("nValue");
const lValue = document.getElementById("lValue");
const mValue = document.getElementById("mValue");
const sizeValue = document.getElementById("sizeValue");
const opacityValue = document.getElementById("opacityValue");
const countValue = document.getElementById("countValue");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070c, 0.035);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance"
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.72;
controls.panSpeed = 0.45;
controls.minDistance = 2.7;
controls.maxDistance = 15;

const PRESETS = {
  heatmap: {
    label: "Heat Map",
    background: 0x040406,
    fog: 0x040406,
    cube: 0x6b7280,
    size: 0.052,
    opacity: 0.78,
    count: 180000,
    gamma: 0.24,
    blending: THREE.AdditiveBlending
  },
  gold: {
    label: "Gold",
    background: 0x747672,
    fog: 0x747672,
    cube: 0xe5e7eb,
    size: 0.036,
    opacity: 0.54,
    count: 150000,
    gamma: 0.18,
    blending: THREE.NormalBlending
  },
  viridis: {
    label: "Viridis",
    background: 0x747672,
    fog: 0x747672,
    cube: 0xe5e7eb,
    size: 0.034,
    opacity: 0.56,
    count: 150000,
    gamma: 0.18,
    blending: THREE.NormalBlending
  },
  violet: {
    label: "Violet",
    background: 0x040406,
    fog: 0x040406,
    cube: 0x64748b,
    size: 0.038,
    opacity: 0.50,
    count: 150000,
    gamma: 0.20,
    blending: THREE.AdditiveBlending
  }
};

let activePresetName = "heatmap";
let orbitalPoints = null;
let cubeLines = null;
let isGenerating = false;

const particleTexture = createParticleTexture();

function createParticleTexture() {
  const particleCanvas = document.createElement("canvas");
  particleCanvas.width = 128;
  particleCanvas.height = 128;

  const ctx = particleCanvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0.00, "rgba(255,255,255,1.0)");
  gradient.addColorStop(0.36, "rgba(255,255,255,0.82)");
  gradient.addColorStop(0.70, "rgba(255,255,255,0.22)");
  gradient.addColorStop(1.00, "rgba(255,255,255,0.0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(particleCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function associatedLegendre(l, m, x) {
  m = Math.abs(m);

  let pmm = 1.0;

  if (m > 0) {
    const somx2 = Math.sqrt(Math.max(0, (1.0 - x) * (1.0 + x)));
    let fact = 1.0;

    for (let i = 1; i <= m; i++) {
      pmm *= -fact * somx2;
      fact += 2.0;
    }
  }

  if (l === m) return pmm;

  let pmmp1 = x * (2.0 * m + 1.0) * pmm;
  if (l === m + 1) return pmmp1;

  let pll = 0.0;

  for (let ll = m + 2; ll <= l; ll++) {
    pll =
      ((2.0 * ll - 1.0) * x * pmmp1 -
        (ll + m - 1.0) * pmm) /
      (ll - m);

    pmm = pmmp1;
    pmmp1 = pll;
  }

  return pll;
}

function associatedLaguerre(k, alpha, x) {
  if (k === 0) return 1.0;
  if (k === 1) return 1.0 + alpha - x;

  let lkm2 = 1.0;
  let lkm1 = 1.0 + alpha - x;
  let lk = 0.0;

  for (let i = 2; i <= k; i++) {
    lk =
      ((2.0 * i - 1.0 + alpha - x) * lkm1 -
        (i - 1.0 + alpha) * lkm2) /
      i;

    lkm2 = lkm1;
    lkm1 = lk;
  }

  return lk;
}

function hydrogenPsi(n, l, m, r, theta, phi) {
  if (n < 1 || l < 0 || l >= n || Math.abs(m) > l) return 0.0;

  const rho = (2.0 * r) / n;
  const laguerreK = n - l - 1;
  const laguerreAlpha = 2 * l + 1;

  const radial =
    Math.exp(-rho / 2.0) *
    Math.pow(rho, l) *
    associatedLaguerre(laguerreK, laguerreAlpha, rho);

  const x = Math.cos(theta);
  const p = associatedLegendre(l, m, x);

  if (m > 0) return radial * p * Math.cos(m * phi);
  if (m < 0) return radial * p * Math.sin(Math.abs(m) * phi);
  return radial * p;
}

function getMaxRadius(n) {
  return [0, 8, 14, 22, 32, 45][n] ?? 24;
}

function getVisualScale(n) {
  return [0, 1.4, 0.65, 0.32, 0.18, 0.11][n] ?? 0.25;
}

function mixColor(a, b, t) {
  return a.clone().lerp(b, Math.min(Math.max(t, 0), 1));
}

function multiStop(t, stops) {
  const clamped = Math.min(Math.max(t, 0), 1);

  for (let i = 0; i < stops.length - 1; i++) {
    const [ta, ca] = stops[i];
    const [tb, cb] = stops[i + 1];

    if (clamped <= tb) {
      return mixColor(ca, cb, (clamped - ta) / (tb - ta));
    }
  }

  return stops[stops.length - 1][1].clone();
}

function colorMap(t) {
  if (activePresetName === "gold") {
    return multiStop(t, [
      [0.00, new THREE.Color(0.95, 0.32, 0.03)],
      [0.36, new THREE.Color(1.00, 0.58, 0.02)],
      [0.70, new THREE.Color(1.00, 0.90, 0.04)],
      [1.00, new THREE.Color(1.00, 0.99, 0.88)]
    ]);
  }

  if (activePresetName === "viridis") {
    return multiStop(t, [
      [0.00, new THREE.Color(0.01, 0.28, 0.20)],
      [0.48, new THREE.Color(0.00, 0.78, 0.45)],
      [0.76, new THREE.Color(0.25, 1.00, 0.72)],
      [1.00, new THREE.Color(0.92, 1.00, 0.82)]
    ]);
  }

  if (activePresetName === "violet") {
    return multiStop(t, [
      [0.00, new THREE.Color(0.02, 0.02, 0.24)],
      [0.40, new THREE.Color(0.26, 0.05, 0.88)],
      [0.76, new THREE.Color(0.73, 0.16, 1.00)],
      [1.00, new THREE.Color(0.78, 0.94, 1.00)]
    ]);
  }

  return multiStop(t, [
    [0.00, new THREE.Color(0.02, 0.00, 0.16)],
    [0.46, new THREE.Color(0.88, 0.00, 0.92)],
    [0.74, new THREE.Color(1.00, 0.44, 0.05)],
    [1.00, new THREE.Color(1.00, 0.98, 0.52)]
  ]);
}

function updateSliderLimits() {
  let n = parseInt(nSlider.value, 10);
  let l = parseInt(lSlider.value, 10);

  lSlider.max = n - 1;
  if (l > n - 1) l = n - 1;
  lSlider.value = l;

  mSlider.min = -l;
  mSlider.max = l;

  let m = parseInt(mSlider.value, 10);
  if (m < -l) m = -l;
  if (m > l) m = l;
  if (l === 0) m = 0;
  mSlider.value = m;

  nValue.textContent = n;
  lValue.textContent = l;
  mValue.textContent = m;
  sizeValue.textContent = Number(sizeSlider.value).toFixed(3);
  opacityValue.textContent = Number(opacitySlider.value).toFixed(2);
  countValue.textContent = `${Math.round(Number(countSlider.value) / 1000)}k`;
  status.textContent = `n=${n} · l=${l} · m=${m} · ${countValue.textContent} particles`;
}

function applyPreset(name, regenerate = true) {
  const preset = PRESETS[name];
  activePresetName = name;

  scene.background = new THREE.Color(preset.background);
  scene.fog.color = new THREE.Color(preset.fog);

  sizeSlider.value = preset.size;
  opacitySlider.value = preset.opacity;
  countSlider.value = preset.count;

  document.querySelectorAll(".preset").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === name);
  });

  updateCube();
  updateSliderLimits();

  if (orbitalPoints) {
    orbitalPoints.material.size = preset.size;
    orbitalPoints.material.opacity = preset.opacity;
    orbitalPoints.material.blending = preset.blending;
    orbitalPoints.material.needsUpdate = true;
  }

  if (regenerate) regenerateFromUI();
}

function updateCube() {
  if (cubeLines) {
    scene.remove(cubeLines);
    cubeLines.geometry.dispose();
    cubeLines.material.dispose();
  }

  const preset = PRESETS[activePresetName];
  const box = new THREE.BoxGeometry(6.2, 6.2, 6.2);
  const edges = new THREE.EdgesGeometry(box);
  const material = new THREE.LineBasicMaterial({
    color: preset.cube,
    transparent: true,
    opacity: activePresetName === "heatmap" || activePresetName === "violet" ? 0.18 : 0.26
  });

  cubeLines = new THREE.LineSegments(edges, material);
  scene.add(cubeLines);
}

function disposeOrbital() {
  if (!orbitalPoints) return;
  scene.remove(orbitalPoints);
  orbitalPoints.geometry.dispose();
  orbitalPoints.material.dispose();
  orbitalPoints = null;
}

function generateOrbital(n, l, m) {
  const preset = PRESETS[activePresetName];
  const count = parseInt(countSlider.value, 10);
  const maxRadius = getMaxRadius(n);
  const visualScale = getVisualScale(n);
  const maxProbability = 100.0;
  const positions = [];
  const colors = [];

  let attempts = 0;
  const maxAttempts = count * 820;

  while (positions.length / 3 < count && attempts < maxAttempts) {
    attempts++;

    const r = Math.random() * maxRadius;
    const theta = Math.acos(Math.random() * 2.0 - 1.0);
    const phi = Math.random() * Math.PI * 2.0;

    const x = r * Math.sin(theta) * Math.cos(phi);
    const y = r * Math.sin(theta) * Math.sin(phi);
    const z = r * Math.cos(theta);

    const psi = hydrogenPsi(n, l, m, r, theta, phi);
    const probability = psi * psi;

    if (Math.random() * maxProbability < probability) {
      let density = probability / maxProbability;
      density = Math.min(Math.max(density, 0), 1);
      density = Math.pow(density, preset.gamma);
      density = Math.max(density, 0.10);

      const c = colorMap(density);

      positions.push(x * visualScale, y * visualScale, z * visualScale);
      colors.push(c.r, c.g, c.b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: parseFloat(sizeSlider.value),
    map: particleTexture,
    vertexColors: true,
    transparent: true,
    opacity: parseFloat(opacitySlider.value),
    alphaTest: 0.025,
    depthWrite: false,
    sizeAttenuation: true,
    blending: preset.blending
  });

  orbitalPoints = new THREE.Points(geometry, material);
  scene.add(orbitalPoints);
}

function regenerateFromUI() {
  if (isGenerating) return;
  isGenerating = true;
  updateSliderLimits();
  disposeOrbital();

  const n = parseInt(nSlider.value, 10);
  const l = parseInt(lSlider.value, 10);
  const m = parseInt(mSlider.value, 10);

  requestAnimationFrame(() => {
    generateOrbital(n, l, m);
    isGenerating = false;
  });
}

function resetView() {
  camera.position.set(4.8, 2.05, 8.0);
  controls.target.set(-0.75, 0, 0);
  controls.update();
}

function updateMaterialOnly() {
  updateSliderLimits();
  if (!orbitalPoints) return;
  orbitalPoints.material.size = parseFloat(sizeSlider.value);
  orbitalPoints.material.opacity = parseFloat(opacitySlider.value);
}

document.querySelectorAll(".preset").forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.preset));
});

nSlider.addEventListener("input", updateSliderLimits);
lSlider.addEventListener("input", updateSliderLimits);
mSlider.addEventListener("input", updateSliderLimits);

sizeSlider.addEventListener("input", updateMaterialOnly);
opacitySlider.addEventListener("input", updateMaterialOnly);
countSlider.addEventListener("input", updateSliderLimits);

document.getElementById("regenerate").addEventListener("click", regenerateFromUI);
document.getElementById("resetView").addEventListener("click", resetView);

resetView();
applyPreset("heatmap", false);
regenerateFromUI();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
