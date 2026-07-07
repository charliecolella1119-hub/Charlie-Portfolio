import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.getElementById("canvas");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b10);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.set(0, 0, 9);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

let orbitalPoints = null;

const nSlider = document.getElementById("nSlider");
const lSlider = document.getElementById("lSlider");
const mSlider = document.getElementById("mSlider");

const nValue = document.getElementById("nValue");
const lValue = document.getElementById("lValue");
const mValue = document.getElementById("mValue");

function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function associatedLegendre(l, m, x) {
  m = Math.abs(m);

  let pmm = 1.0;

  if (m > 0) {
    const somx2 = Math.sqrt((1.0 - x) * (1.0 + x));
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

  let Lkm2 = 1.0;
  let Lkm1 = 1.0 + alpha - x;
  let Lk = 0.0;

  for (let i = 2; i <= k; i++) {
    Lk =
      ((2.0 * i - 1.0 + alpha - x) * Lkm1 -
        (i - 1.0 + alpha) * Lkm2) /
      i;

    Lkm2 = Lkm1;
    Lkm1 = Lk;
  }

  return Lk;
}

function hydrogenPsi(n, l, m, r, theta, phi) {
  if (n < 1 || l < 0 || l >= n || Math.abs(m) > l) {
    return 0.0;
  }

  const rho = (2.0 * r) / n;
  const laguerreK = n - l - 1;
  const laguerreAlpha = 2 * l + 1;

  const radial =
    Math.exp(-rho / 2.0) *
    Math.pow(rho, l) *
    associatedLaguerre(laguerreK, laguerreAlpha, rho);

  const x = Math.cos(theta);
  const P = associatedLegendre(l, m, x);

  let angular = 0.0;

  if (m > 0) {
    angular = P * Math.cos(m * phi);
  } else if (m < 0) {
    angular = P * Math.sin(Math.abs(m) * phi);
  } else {
    angular = P;
  }

  return radial * angular;
}

function getMaxRadius(n) {
  if (n === 1) return 8;
  if (n === 2) return 14;
  if (n === 3) return 22;
  if (n === 4) return 32;
  if (n === 5) return 45;
  return 20;
}

function getVisualScale(n) {
  if (n === 1) return 1.4;
  if (n === 2) return 0.65;
  if (n === 3) return 0.32;
  if (n === 4) return 0.18;
  if (n === 5) return 0.11;
  return 0.25;
}

function mixColor(a, b, t) {
  return a.clone().lerp(b, t);
}

function colorMap(t) {
  const mode = colorMapSelect.value;

  let low, mid, high;

  if (mode === "gold") {
    low = new THREE.Color(0.86, 0.16, 0.01);
    mid = new THREE.Color(1.00, 0.78, 0.04);
    high = new THREE.Color(1.00, 0.99, 0.92);
    scene.background = new THREE.Color(0x747672);
  }
  else if (mode === "violet") {
    low = new THREE.Color(0.04, 0.02, 0.26);
    mid = new THREE.Color(0.42, 0.08, 0.92);
    high = new THREE.Color(0.70, 0.88, 1.00);
    scene.background = new THREE.Color(0x080b10);
  }
  else if (mode === "viridis") {
    low = new THREE.Color(0.02, 0.22, 0.16);
    mid = new THREE.Color(0.00, 0.62, 0.36);
    high = new THREE.Color(0.78, 1.00, 0.76);
    scene.background = new THREE.Color(0x747672);
  }
  else {
    low = new THREE.Color(0.02, 0.00, 0.18);
    mid = new THREE.Color(1.00, 0.00, 0.95);
    high = new THREE.Color(1.00, 0.96, 0.52);
    scene.background = new THREE.Color(0x080b10);
  }

  if (t < 0.6) {
    return mixColor(low, mid, t / 0.6);
  }

  return mixColor(mid, high, (t - 0.6) / 0.4);
}

function generateOrbital(n, l, m) {
  if (orbitalPoints) {
    scene.remove(orbitalPoints);
    orbitalPoints.geometry.dispose();
    orbitalPoints.material.dispose();
  }

  const count = 140000;
  const maxRadius = getMaxRadius(n);
  const visualScale = getVisualScale(n);
  const maxProbability = 100.0;

  const positions = [];
  const colors = [];

  let attempts = 0;
  const maxAttempts = count * 800;

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
      density = Math.pow(density, 0.22);
      density = Math.max(density, 0.12);

      const c = colorMap(density);

      positions.push(x * visualScale, y * visualScale, z * visualScale);
      colors.push(c.r, c.g, c.b);
    }
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );

  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3)
  );

  const material = new THREE.PointsMaterial({
    size: parseFloat(sizeSlider.value),
    vertexColors: true,
    transparent: true,
    opacity: parseFloat(opacitySlider.value),
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.NormalBlending
  });

  orbitalPoints = new THREE.Points(geometry, material);
  scene.add(orbitalPoints);
}

function updateSliderLimits() {
  let n = parseInt(nSlider.value);
  let l = parseInt(lSlider.value);

  lSlider.max = n - 1;

  if (l > n - 1) {
    l = n - 1;
    lSlider.value = l;
  }

  mSlider.min = -l;
  mSlider.max = l;

  let m = parseInt(mSlider.value);

  if (m < -l) m = -l;
  if (m > l) m = l;

  if (l === 0) m = 0;

  mSlider.value = m;

  nValue.textContent = n;
  lValue.textContent = l;
  mValue.textContent = m;
}

function regenerateFromUI() {
  updateSliderLimits();

  const n = parseInt(nSlider.value);
  const l = parseInt(lSlider.value);
  const m = parseInt(mSlider.value);
  const sizeSlider = document.getElementById("sizeSlider");
  const opacitySlider = document.getElementById("opacitySlider");
  const sizeValue = document.getElementById("sizeValue");
  const opacityValue = document.getElementById("opacityValue");
  const colorMapSelect = document.getElementById("colorMapSelect");

  generateOrbital(n, l, m);
  sizeSlider.addEventListener("input", () => {
    if (orbitalPoints) {
      orbitalPoints.material.size = parseFloat(sizeSlider.value);
      sizeValue.textContent = sizeSlider.value;
      }
    });

  opacitySlider.addEventListener("input", () => {
    if (orbitalPoints) {
      orbitalPoints.material.opacity = parseFloat(opacitySlider.value);
      opacityValue.textContent = opacitySlider.value;
      }
    });
  colorMapSelect.addEventListener("change", regenerateFromUI);
}

nSlider.addEventListener("input", updateSliderLimits);
lSlider.addEventListener("input", updateSliderLimits);
mSlider.addEventListener("input", updateSliderLimits);

document.getElementById("regenerate").addEventListener("click", regenerateFromUI);

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
