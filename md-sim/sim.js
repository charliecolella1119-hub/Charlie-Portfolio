const simCanvas = document.getElementById("simCanvas");
const graphCanvas = document.getElementById("graphCanvas");
const simCtx = simCanvas.getContext("2d");
const graphCtx = graphCanvas.getContext("2d");

const presetSelect = document.getElementById("presetSelect");
const graphSelect = document.getElementById("graphSelect");
const pauseButton = document.getElementById("pauseButton");
const resetButton = document.getElementById("resetButton");
const heatButton = document.getElementById("heatButton");
const coolButton = document.getElementById("coolButton");
const trailsToggle = document.getElementById("trailsToggle");

const presetName = document.getElementById("presetName");
const temperatureReadout = document.getElementById("temperature");
const pressureReadout = document.getElementById("pressure");
const energyReadout = document.getElementById("energy");

const BOX = { x: 0, y: 0, width: 1, height: 1 };
const EPSILON = 0.55;
const SIGMA = 0.04;
const MASS = 1.0;
const DT = 0.0012;
const CUTOFF_RADIUS = 0.12;
const REPULSION_CAP = 520;
const ATTRACTION_CAP = 4;
const MAX_SPEED = 0.22;
const SUBSTEPS = 2;

let particles = [];
let paused = false;
let temperatureHistory = [];
let phaseSamples = [];
let radialDistribution = [];
let velocityHistogram = [];
let time = 0;
let frame = 0;

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

function resize() {
  resizeCanvas(simCanvas);
  resizeCanvas(graphCanvas);
}

window.addEventListener("resize", resize);
resize();

function lengthSquared(x, y) {
  return x * x + y * y;
}

function minimumImage(dx, dy) {
  if (dx > 0.5) dx -= 1;
  if (dx < -0.5) dx += 1;
  if (dy > 0.5) dy -= 1;
  if (dy < -0.5) dy += 1;
  return { dx, dy };
}

function presetConfig(name) {
  const configs = {
    gas: { label: "Gas", count: 100, speed: 0.035, layout: "grid" },
    liquid: { label: "Liquid", count: 121, speed: 0.025, layout: "cluster" },
    crystal: { label: "Crystal", count: 121, speed: 0.010, layout: "crystal" },
    hot: { label: "Hot Gas", count: 100, speed: 0.070, layout: "grid" },
    dense: { label: "Dense Fluid", count: 144, speed: 0.020, layout: "dense" },
    melt: { label: "Melting Crystal", count: 121, speed: 0.040, layout: "crystal" }
  };

  return configs[name] || configs.gas;
}

function createParticles() {
  const config = presetConfig(presetSelect.value);
  particles = [];
  const side = Math.ceil(Math.sqrt(config.count));

  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      if (particles.length >= config.count) break;

      let px = (x + 1) / (side + 1);
      let py = (y + 1) / (side + 1);

      if (config.layout === "cluster") {
        px = 0.28 + (x + 1) * (0.44 / (side + 1));
        py = 0.30 + (y + 1) * (0.40 / (side + 1));
      }

      if (config.layout === "dense") {
        px = 0.20 + (x + 1) * (0.60 / (side + 1));
        py = 0.20 + (y + 1) * (0.60 / (side + 1));
      }

      if (config.layout === "crystal") {
        const spacing = 0.056;
        px = 0.5 - side * spacing * 0.5 + x * spacing;
        py = 0.5 - side * spacing * 0.5 + y * spacing;
      }

      particles.push({
        x: px,
        y: py,
        vx: (Math.random() * 2 - 1) * config.speed,
        vy: (Math.random() * 2 - 1) * config.speed,
        fx: 0,
        fy: 0,
        trail: [{ x: px, y: py }]
      });
    }
  }

  removeDrift();
  computeForces();
  temperatureHistory = [];
  phaseSamples = [];
  radialDistribution = [];
  velocityHistogram = [];
  time = 0;
  frame = 0;
  presetName.textContent = config.label;
}

function removeDrift() {
  let vx = 0;
  let vy = 0;
  for (const p of particles) {
    vx += p.vx;
    vy += p.vy;
  }
  vx /= particles.length;
  vy /= particles.length;
  for (const p of particles) {
    p.vx -= vx;
    p.vy -= vy;
  }
}

function computeForces() {
  for (const p of particles) {
    p.fx = 0;
    p.fy = 0;
  }

  let potential = 0;
  let virial = 0;

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i];
      const b = particles[j];
      const image = minimumImage(b.x - a.x, b.y - a.y);
      let r2 = lengthSquared(image.dx, image.dy);

      if (r2 > CUTOFF_RADIUS * CUTOFF_RADIUS) {
        continue;
      }

      r2 = Math.max(r2, 0.00055);

      const invR2 = 1 / r2;
      const sigma2OverR2 = SIGMA * SIGMA * invR2;
      const sr6 = sigma2OverR2 * sigma2OverR2 * sigma2OverR2;
      const sr12 = sr6 * sr6;
      let fOverR = 24 * EPSILON * (2 * sr12 - sr6) * invR2;
      fOverR = Math.max(-ATTRACTION_CAP, Math.min(REPULSION_CAP, fOverR));

      const fx = fOverR * image.dx;
      const fy = fOverR * image.dy;

      a.fx -= fx;
      a.fy -= fy;
      b.fx += fx;
      b.fy += fy;

      potential += 4 * EPSILON * (sr12 - sr6);
      virial += image.dx * fx + image.dy * fy;
    }
  }

  return { potential, virial };
}

function wrapParticle(p) {
  if (p.x < 0) p.x += 1;
  if (p.x >= 1) p.x -= 1;
  if (p.y < 0) p.y += 1;
  if (p.y >= 1) p.y -= 1;
}

function limitParticleSpeed(p) {
  const v = Math.sqrt(p.vx * p.vx + p.vy * p.vy);

  if (v > MAX_SPEED) {
    const scale = MAX_SPEED / v;
    p.vx *= scale;
    p.vy *= scale;
  }
}

function step() {
  for (let s = 0; s < SUBSTEPS; s++) {
    for (const p of particles) {
      p.vx += 0.5 * DT * p.fx / MASS;
      p.vy += 0.5 * DT * p.fy / MASS;
      limitParticleSpeed(p);
      p.x += DT * p.vx;
      p.y += DT * p.vy;
      wrapParticle(p);
    }

    computeForces();

    for (const p of particles) {
      p.vx += 0.5 * DT * p.fx / MASS;
      p.vy += 0.5 * DT * p.fy / MASS;
      limitParticleSpeed(p);
    }

    time += DT;
  }

  if (trailsToggle.checked && frame % 2 === 0) updateTrails();
}

function updateTrails() {
  for (const p of particles) {
    const last = p.trail[p.trail.length - 1];
    if (last && lengthSquared(p.x - last.x, p.y - last.y) > 0.06) {
      p.trail = [];
    }
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 12) p.trail.shift();
  }
}

function scaleVelocities(factor) {
  for (const p of particles) {
    p.vx *= factor;
    p.vy *= factor;
  }
}

function kineticEnergy() {
  let total = 0;
  for (const p of particles) {
    total += 0.5 * MASS * (p.vx * p.vx + p.vy * p.vy);
  }
  return total;
}

function speed(p) {
  return Math.sqrt(p.vx * p.vx + p.vy * p.vy);
}

function speedColor(v) {
  if (v < 0.045) return "#16b7f5";
  if (v < 0.090) return "#12f29a";
  if (v < 0.150) return "#ffb020";
  return "#ff5f6d";
}

function updateAnalysis(temperature, pressure, totalEnergy) {
  temperatureHistory.push(temperature);
  if (temperatureHistory.length > 220) temperatureHistory.shift();

  if (frame % 8 === 0) {
    phaseSamples.push({ temperature, pressure });
    if (phaseSamples.length > 220) phaseSamples.shift();
  }

  if (frame % 12 === 0) {
    radialDistribution = computeRadialDistribution();
  }

  velocityHistogram = computeVelocityHistogram();

  temperatureReadout.textContent = temperature.toFixed(3);
  pressureReadout.textContent = pressure.toFixed(4);
  energyReadout.textContent = (totalEnergy / particles.length).toFixed(3);
}

function computeVelocityHistogram() {
  const bins = Array(28).fill(0);
  const maxVelocity = 1.0;

  for (const p of particles) {
    const index = Math.floor((speed(p) / maxVelocity) * bins.length);
    if (index >= 0 && index < bins.length) bins[index]++;
  }

  return bins;
}

function computeRadialDistribution() {
  const bins = Array(36).fill(0);
  const maxRadius = 0.45;
  const binWidth = maxRadius / bins.length;

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const image = minimumImage(particles[j].x - particles[i].x, particles[j].y - particles[i].y);
      const r = Math.sqrt(lengthSquared(image.dx, image.dy));
      const index = Math.floor(r / binWidth);
      if (index >= 0 && index < bins.length) bins[index] += 2;
    }
  }

  const density = particles.length;
  for (let i = 0; i < bins.length; i++) {
    const r1 = i * binWidth;
    const r2 = r1 + binWidth;
    const shellArea = Math.PI * (r2 * r2 - r1 * r1);
    const ideal = density * shellArea * particles.length;
    if (ideal > 0) bins[i] /= ideal;
  }

  return bins;
}

function drawSimulation() {
  const width = simCanvas.clientWidth;
  const height = simCanvas.clientHeight;
  const margin = Math.max(22, Math.min(width, height) * 0.06);
  const boxSize = Math.min(width - margin * 2, height - margin * 2);
  const boxX = (width - boxSize) * 0.5;
  const boxY = (height - boxSize) * 0.5;

  simCtx.clearRect(0, 0, width, height);
  simCtx.fillStyle = "#080b10";
  simCtx.fillRect(0, 0, width, height);

  simCtx.strokeStyle = "#cbd5e1";
  simCtx.lineWidth = 2;
  simCtx.strokeRect(boxX, boxY, boxSize, boxSize);

  if (trailsToggle.checked) {
    for (const p of particles) {
      if (p.trail.length < 2) continue;
      simCtx.beginPath();
      for (let i = 0; i < p.trail.length; i++) {
        const point = p.trail[i];
        const x = boxX + point.x * boxSize;
        const y = boxY + point.y * boxSize;
        if (i === 0) simCtx.moveTo(x, y);
        else simCtx.lineTo(x, y);
      }
      simCtx.strokeStyle = "rgba(56, 189, 248, 0.16)";
      simCtx.lineWidth = 1;
      simCtx.stroke();
    }
  }

  for (const p of particles) {
    const x = boxX + p.x * boxSize;
    const y = boxY + p.y * boxSize;
    simCtx.beginPath();
    simCtx.arc(x, y, Math.max(3, boxSize * 0.006), 0, Math.PI * 2);
    simCtx.fillStyle = speedColor(speed(p));
    simCtx.fill();
  }
}

function graphBounds(values, fallbackMax = 1) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: fallbackMax };
  if (Math.abs(max - min) < 0.0001) max = min + fallbackMax;
  return { min, max };
}

function drawGraphBox(title) {
  const width = graphCanvas.clientWidth;
  const height = graphCanvas.clientHeight;
  graphCtx.clearRect(0, 0, width, height);
  graphCtx.fillStyle = "#0b1018";
  graphCtx.fillRect(0, 0, width, height);
  graphCtx.strokeStyle = "#334155";
  graphCtx.strokeRect(0.5, 0.5, width - 1, height - 1);
  graphCtx.fillStyle = "#cbd5e1";
  graphCtx.font = "12px Arial";
  graphCtx.fillText(title, 10, 18);
}

function drawLineGraph(values, color, title) {
  drawGraphBox(title);
  if (values.length < 2) return;
  const width = graphCanvas.clientWidth;
  const height = graphCanvas.clientHeight;
  const pad = 26;
  const bounds = graphBounds(values);

  graphCtx.beginPath();
  values.forEach((value, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 1.5);
    const y = height - pad - ((value - bounds.min) / (bounds.max - bounds.min)) * (height - pad * 1.6);
    if (i === 0) graphCtx.moveTo(x, y);
    else graphCtx.lineTo(x, y);
  });
  graphCtx.strokeStyle = color;
  graphCtx.lineWidth = 2;
  graphCtx.stroke();
}

function drawBarGraph(values, color, title, referenceOne = false) {
  drawGraphBox(title);
  if (!values.length) return;
  const width = graphCanvas.clientWidth;
  const height = graphCanvas.clientHeight;
  const pad = 26;
  const max = Math.max(referenceOne ? 2 : 1, ...values);
  const barWidth = (width - pad * 1.5) / values.length;

  if (referenceOne) {
    const y = height - pad - (1 / max) * (height - pad * 1.6);
    graphCtx.strokeStyle = "#64748b";
    graphCtx.beginPath();
    graphCtx.moveTo(pad, y);
    graphCtx.lineTo(width - 10, y);
    graphCtx.stroke();
  }

  values.forEach((value, i) => {
    const h = (value / max) * (height - pad * 1.6);
    graphCtx.fillStyle = color;
    graphCtx.fillRect(pad + i * barWidth, height - pad - h, Math.max(1, barWidth - 1), h);
  });
}

function drawVelocityGraph(temperature) {
  drawBarGraph(velocityHistogram, "#22d3ee", "Velocity + Maxwell-Boltzmann Fit");
  if (!velocityHistogram.length || temperature <= 0) return;

  const width = graphCanvas.clientWidth;
  const height = graphCanvas.clientHeight;
  const pad = 26;
  const maxVelocity = 1.0;
  const binWidth = maxVelocity / velocityHistogram.length;
  const total = velocityHistogram.reduce((a, b) => a + b, 0);
  const fit = velocityHistogram.map((_, i) => {
    const v = (i + 0.5) * binWidth;
    const density = (MASS / temperature) * v * Math.exp(-(MASS * v * v) / (2 * temperature));
    return total * density * binWidth;
  });
  const max = Math.max(1, ...velocityHistogram, ...fit);

  graphCtx.beginPath();
  fit.forEach((value, i) => {
    const x = pad + (i + 0.5) * ((width - pad * 1.5) / fit.length);
    const y = height - pad - (value / max) * (height - pad * 1.6);
    if (i === 0) graphCtx.moveTo(x, y);
    else graphCtx.lineTo(x, y);
  });
  graphCtx.strokeStyle = "#f472b6";
  graphCtx.lineWidth = 2;
  graphCtx.stroke();
}

function drawPhaseGraph() {
  drawGraphBox("Pressure vs Temperature");
  if (phaseSamples.length < 2) return;
  const width = graphCanvas.clientWidth;
  const height = graphCanvas.clientHeight;
  const pad = 26;
  const tempBounds = graphBounds(phaseSamples.map(p => p.temperature));
  const pressureBounds = graphBounds(phaseSamples.map(p => p.pressure), 0.01);

  phaseSamples.forEach((sample, i) => {
    const x = pad + ((sample.temperature - tempBounds.min) / (tempBounds.max - tempBounds.min)) * (width - pad * 1.5);
    const y = height - pad - ((sample.pressure - pressureBounds.min) / (pressureBounds.max - pressureBounds.min)) * (height - pad * 1.6);
    graphCtx.beginPath();
    graphCtx.arc(x, y, i === phaseSamples.length - 1 ? 3.5 : 2, 0, Math.PI * 2);
    graphCtx.fillStyle = i === phaseSamples.length - 1 ? "#fde047" : "rgba(74, 222, 128, 0.65)";
    graphCtx.fill();
  });
}

function drawCurrentGraph(temperature) {
  if (graphSelect.value === "temperature") {
    drawLineGraph(temperatureHistory, "#22d3ee", "Temperature History");
  } else if (graphSelect.value === "velocity") {
    drawVelocityGraph(temperature);
  } else if (graphSelect.value === "radial") {
    drawBarGraph(radialDistribution, "#fbbf24", "Radial Distribution g(r)", true);
  } else {
    drawPhaseGraph();
  }
}

function animate() {
  if (!paused) {
    step();
    frame++;
  }

  const forceStats = computeForces();
  const kinetic = kineticEnergy();
  const temperature = kinetic / particles.length;
  const pressure = (particles.length * temperature + 0.5 * forceStats.virial) / particles.length;
  const totalEnergy = kinetic + forceStats.potential;

  updateAnalysis(temperature, pressure, totalEnergy);
  drawSimulation();
  drawCurrentGraph(temperature);
  requestAnimationFrame(animate);
}

presetSelect.addEventListener("change", createParticles);
resetButton.addEventListener("click", createParticles);
pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
});
heatButton.addEventListener("click", () => scaleVelocities(1.06));
coolButton.addEventListener("click", () => scaleVelocities(0.90));
trailsToggle.addEventListener("change", () => {
  if (!trailsToggle.checked) {
    for (const p of particles) p.trail = [{ x: p.x, y: p.y }];
  }
});

createParticles();
animate();
