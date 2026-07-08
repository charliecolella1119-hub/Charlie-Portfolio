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
scene.fog = null;

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
renderer.outputColorSpace = THREE.SRGBColorSpace;

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
    cube: 0x6b7280,
    size: 0.058,
    opacity: 0.86,
    count: 200000,
    gamma: 0.28,
    floor: 0.12,
    blending: THREE.NormalBlending
  },
  gold: {
    label: "Gold",
    background: 0x747770,
    cube: 0xe5e7eb,
    size: 0.050,
    opacity: 0.82,
    count: 190000,
    gamma: 0.22,
    floor: 0.12,
    blending: THREE.NormalBlending
  },
  viridis: {
    label: "Viridis",
    background: 0x747770,
    cube: 0xe5e7eb,
    size: 0.048,
    opacity: 0.80,
    count: 190000,
    gamma: 0.22,
    floor: 0.12,
    blending: THREE.NormalBlending
  },
  violet: {
    label: "Violet",
    background: 0x040406,
    cube: 0x64748b,
    size: 0.052,
    opacity: 0.76,
    count: 190000,
    gamma: 0.22,
    floor: 0.11,
    blending: THREE.NormalBlending
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
  gradient.addColorStop(0.38, "rgba(255,255,255,1.0)");
  gradient.addColorStop(0.66, "rgba(255,255,255,0.55)");
  gradient.addColorStop(0.86, "rgba(255,255,255,0.12)");
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
      [0.00, new THREE.Color(0.96, 0.30, 0.00)],
      [0.34, new THREE.Color(1.00, 0.52, 0.00)],
      [0.66, new THREE.Color(1.00, 0.86, 0.00)],
      [1.00, new THREE.Color(1.00, 0.94, 0.48)]
    ]);
  }

  if (activePresetName === "viridis") {
    return multiStop(t, [
      [0.00, new THREE.Color(0.00, 0.34, 0.25)],
      [0.44, new THREE.Color(0.00, 0.76, 0.43)],
      [0.72, new THREE.Color(0.12, 1.00, 0.70)],
      [1.00, new THREE.Color(0.48, 1.00, 0.68)]
    ]);
  }

  if (activePresetName === "violet") {
    return multiStop(t, [
      [0.00, new THREE.Color(0.01, 0.02, 0.32)],
      [0.38, new THREE.Color(0.22, 0.06, 0.98)],
      [0.72, new THREE.Color(0.72, 0.10, 1.00)],
      [1.00, new THREE.Color(0.50, 0.68, 1.00)]
    ]);
  }

  return multiStop(t, [
    [0.00, new THREE.Color(0.03, 0.00, 0.22)],
    [0.50, new THREE.Color(0.95, 0.00, 0.95)],
    [0.78, new THREE.Color(1.00, 0.32, 0.03)],
    [1.00, new THREE.Color(1.00, 0.94, 0.22)]
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
      density = Math.max(density, preset.floor);

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
