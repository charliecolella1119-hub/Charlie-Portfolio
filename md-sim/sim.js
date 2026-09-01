import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const $ = (id) => document.getElementById(id);
const canvas = $("simCanvas"), graphCanvas = $("graphCanvas"), graphCtx = graphCanvas.getContext("2d");
const presetSelect = $("presetSelect"), speciesSelect = $("speciesSelect"), physicsSelect = $("physicsSelect"), ensembleSelect = $("ensembleSelect"), graphSelect = $("graphSelect"), targetSlider = $("targetSlider"), bondsToggle = $("bondsToggle"), trailsToggle = $("trailsToggle");
const BOX_SCALE = 8, MASS = 1, SIGMA = .075, EPSILON = .42, CUTOFF = SIGMA * 2.8, DT = .0012, SUBSTEPS = 2, KELVIN_SCALE = 500, THERMOSTAT_COUPLING = .055;
const WATER_OH_DISTANCE = .037, WATER_CHARGES = [-.834, .417, .417], WATER_COULOMB = .08, WATER_CUTOFF = .24, ROTATIONAL_INERTIA = .02;
const PRESETS = {
  gas:{label:"Gas",count:80,target:450,spread:.84,jitter:.018}, liquid:{label:"Liquid",count:96,target:298,spread:.62,jitter:.012},
  crystal:{label:"Crystal",count:100,target:120,spread:.68,jitter:.002}, hot:{label:"Hot gas",count:80,target:900,spread:.84,jitter:.020},
  dense:{label:"Dense fluid",count:125,target:325,spread:.69,jitter:.009}, melt:{label:"Melting crystal",count:100,target:273,spread:.66,jitter:.007}
};
let particles=[], paused=false, targetTemperature=450, temperatureHistory=[], phaseSamples=[], radialDistribution=[], velocityHistogram=[], frame=0, lastStats={potential:0,virial:0};

const scene=new THREE.Scene(); scene.background=new THREE.Color(0x04070c); scene.fog=new THREE.FogExp2(0x04070c,.025);
const camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.1,100); camera.position.set(8.8,6.4,10.5);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight); renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.15;
const controls=new OrbitControls(camera,canvas); controls.enableDamping=true; controls.dampingFactor=.065; controls.target.set(.7,0,0); controls.minDistance=6; controls.maxDistance=22;
scene.add(new THREE.HemisphereLight(0xbfefff,0x07111d,2.2)); const keyLight=new THREE.DirectionalLight(0xffffff,3.1); keyLight.position.set(5,8,6); scene.add(keyLight); const rimLight=new THREE.PointLight(0x22d3ee,38,24); rimLight.position.set(-5,-2,4); scene.add(rimLight);
scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(BOX_SCALE,BOX_SCALE,BOX_SCALE)),new THREE.LineBasicMaterial({color:0x22d3ee,transparent:true,opacity:.45})));
const floorGrid=new THREE.GridHelper(BOX_SCALE,10,0x22d3ee,0x164e63); floorGrid.position.y=-BOX_SCALE/2; scene.add(floorGrid);

const sphereGeometry=new THREE.SphereGeometry(.145,16,12), hydrogenGeometry=new THREE.SphereGeometry(.068,12,8);
const atomMesh=new THREE.InstancedMesh(sphereGeometry,new THREE.MeshStandardMaterial({color:0x38bdf8,roughness:.28,metalness:.08}),160);
const oxygenMesh=new THREE.InstancedMesh(sphereGeometry,new THREE.MeshStandardMaterial({color:0xff2449,roughness:.24}),160);
const hydrogenMesh=new THREE.InstancedMesh(hydrogenGeometry,new THREE.MeshStandardMaterial({color:0xf8fafc,roughness:.22}),320);
[atomMesh,oxygenMesh,hydrogenMesh].forEach(mesh=>{mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh)});
const bondGeometry=new THREE.BufferGeometry(), bondLines=new THREE.LineSegments(bondGeometry,new THREE.LineBasicMaterial({color:0x22d3ee,transparent:true,opacity:.34})); scene.add(bondLines);
const trailGeometry=new THREE.BufferGeometry(), trailLines=new THREE.LineSegments(trailGeometry,new THREE.LineBasicMaterial({color:0x38bdf8,transparent:true,opacity:.18})); scene.add(trailLines);
const dummy=new THREE.Object3D(), tempColor=new THREE.Color();

function randomUnit(){const v=new THREE.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1);return v.lengthSq()?v.normalize():new THREE.Vector3(1,0,0)}
function minimumImage(v){return v>.5?v-1:v<-.5?v+1:v}
function wrap(p){for(const axis of ["x","y","z"]){if(p.pos[axis]<-.5)p.pos[axis]+=1;if(p.pos[axis]>=.5)p.pos[axis]-=1}}
function kineticEnergy(){return particles.reduce((sum,p)=>sum+.5*MASS*p.vel.lengthSq(),0)}
function rotationalEnergy(){return speciesSelect.value==="water"?particles.reduce((sum,p)=>sum+.5*ROTATIONAL_INERTIA*p.angularVelocity.lengthSq(),0):0}
function temperatureKelvin(){return particles.length?(2*kineticEnergy()/(3*particles.length))*KELVIN_SCALE:0}
function rescaleTemperature(target){const current=temperatureKelvin();if(current<=0)return;const scale=Math.sqrt(target/current);particles.forEach(p=>p.vel.multiplyScalar(scale))}
function removeDrift(){const drift=new THREE.Vector3();particles.forEach(p=>drift.add(p.vel));drift.multiplyScalar(1/particles.length);particles.forEach(p=>p.vel.sub(drift))}

function createParticles(){
  const config=PRESETS[presetSelect.value], side=Math.ceil(Math.cbrt(config.count)); particles=[];
  for(let z=0;z<side&&particles.length<config.count;z++)for(let y=0;y<side&&particles.length<config.count;y++)for(let x=0;x<side&&particles.length<config.count;x++){
    const d=Math.max(1,side-1),pos=new THREE.Vector3((x/d-.5)*config.spread,(y/d-.5)*config.spread,(z/d-.5)*config.spread);
    pos.add(new THREE.Vector3((Math.random()-.5)*config.jitter,(Math.random()-.5)*config.jitter,(Math.random()-.5)*config.jitter));
    particles.push({pos,vel:randomUnit().multiplyScalar(.4+Math.random()*.6),force:new THREE.Vector3(),torque:new THREE.Vector3(),orientation:randomUnit(),angularVelocity:randomUnit().multiplyScalar(.08),trail:[pos.clone()]});
  }
  removeDrift();setTargetTemperature(config.target);rescaleTemperature(config.target);temperatureHistory=[];phaseSamples=[];frame=0;lastStats=computeForces();updateStatus();
}

function computeForces(){
  particles.forEach(p=>{p.force.set(0,0,0);p.torque.set(0,0,0)});let potential=0,virial=0;if(physicsSelect.value==="hard")return{potential,virial};const delta=new THREE.Vector3();
  if(speciesSelect.value==="water"){
    const sites=particles.map(waterSiteData);
    for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++){
      const centerDelta=particles[j].pos.clone().sub(particles[i].pos);centerDelta.set(minimumImage(centerDelta.x),minimumImage(centerDelta.y),minimumImage(centerDelta.z));
      for(let a=0;a<3;a++)for(let b=0;b<3;b++){
        delta.subVectors(sites[j][b].position,sites[i][a].position);delta.set(minimumImage(delta.x),minimumImage(delta.y),minimumImage(delta.z));const r2=Math.max(delta.lengthSq(),.0010);if(r2>WATER_CUTOFF*WATER_CUTOFF)continue;
        const distance=Math.sqrt(r2),direction=delta.clone().multiplyScalar(1/distance);let outward=WATER_COULOMB*sites[i][a].charge*sites[j][b].charge/r2;
        potential+=WATER_COULOMB*sites[i][a].charge*sites[j][b].charge/distance;
        if(a===0&&b===0){const sr=SIGMA/distance,sr6=sr**6,sr12=sr6*sr6;outward+=24*EPSILON*(2*sr12-sr6)/distance;potential+=4*EPSILON*(sr12-sr6)}
        const forceOnA=direction.multiplyScalar(-THREE.MathUtils.clamp(outward,-120,120));particles[i].force.add(forceOnA);particles[j].force.sub(forceOnA);
        particles[i].torque.add(new THREE.Vector3().crossVectors(sites[i][a].offset,forceOnA));particles[j].torque.add(new THREE.Vector3().crossVectors(sites[j][b].offset,forceOnA.clone().negate()));virial-=centerDelta.dot(forceOnA);
      }
    }
  }else{
    for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++){
      delta.subVectors(particles[j].pos,particles[i].pos);delta.set(minimumImage(delta.x),minimumImage(delta.y),minimumImage(delta.z));const r2=Math.max(delta.lengthSq(),.0028);if(r2>CUTOFF*CUTOFF)continue;
      const invR2=1/r2,sr2=SIGMA*SIGMA*invR2,sr6=sr2*sr2*sr2,sr12=sr6*sr6,fOverR=THREE.MathUtils.clamp(24*EPSILON*(2*sr12-sr6)*invR2,-18,95),force=delta.clone().multiplyScalar(fOverR);
      particles[i].force.sub(force);particles[j].force.add(force);potential+=4*EPSILON*(sr12-sr6);virial+=delta.dot(force);
    }
  }return{potential,virial};
}

function resolveCollisions(){
  if(physicsSelect.value==="lj")return;const diameter=speciesSelect.value==="water"?.082:.068,delta=new THREE.Vector3();
  for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++){
    delta.subVectors(particles[j].pos,particles[i].pos);delta.set(minimumImage(delta.x),minimumImage(delta.y),minimumImage(delta.z));const distance=delta.length();if(!distance||distance>=diameter)continue;
    const normal=delta.multiplyScalar(1/distance),overlap=diameter-distance;particles[i].pos.addScaledVector(normal,-overlap*.5);particles[j].pos.addScaledVector(normal,overlap*.5);
    const approach=particles[j].vel.clone().sub(particles[i].vel).dot(normal);if(approach<0){const impulse=normal.clone().multiplyScalar(-approach);particles[i].vel.sub(impulse);particles[j].vel.add(impulse)}
  }
}
function thermostat(){if(ensembleSelect.value!=="nvt")return;const current=temperatureKelvin();if(current<=0)return;const scale2=Math.max(.02,1+THERMOSTAT_COUPLING*(targetTemperature/current-1));particles.forEach(p=>p.vel.multiplyScalar(Math.sqrt(scale2)))}
function step(){
  for(let s=0;s<SUBSTEPS;s++){
    particles.forEach(p=>{if(physicsSelect.value!=="hard"){p.vel.addScaledVector(p.force,.5*DT/MASS);if(speciesSelect.value==="water")p.angularVelocity.addScaledVector(p.torque,.5*DT/ROTATIONAL_INERTIA)}p.pos.addScaledVector(p.vel,DT);if(speciesSelect.value==="water"){p.orientation.addScaledVector(new THREE.Vector3().crossVectors(p.angularVelocity,p.orientation),DT).normalize()}wrap(p)});lastStats=computeForces();
    particles.forEach(p=>{if(physicsSelect.value!=="hard"){p.vel.addScaledVector(p.force,.5*DT/MASS);if(speciesSelect.value==="water")p.angularVelocity.addScaledVector(p.torque,.5*DT/ROTATIONAL_INERTIA).multiplyScalar(.999)}else if(p.vel.lengthSq())p.orientation.lerp(p.vel.clone().normalize(),.0015).normalize()});resolveCollisions();
  }thermostat();if(trailsToggle.checked&&frame%3===0)particles.forEach(p=>{p.trail.push(p.pos.clone());if(p.trail.length>9)p.trail.shift()});
}

function speedColor(speed){return tempColor.setHSL(.55-.55*THREE.MathUtils.clamp(speed/2.3,0,1),.88,.58)}
function waterSites(p){const forward=p.orientation.clone().normalize();let side=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0));if(side.lengthSq()<.01)side.crossVectors(forward,new THREE.Vector3(1,0,0));side.normalize();const a=THREE.MathUtils.degToRad(52.25);return[forward.clone().multiplyScalar(Math.cos(a)).addScaledVector(side,Math.sin(a)),forward.clone().multiplyScalar(Math.cos(a)).addScaledVector(side,-Math.sin(a))]}
function waterSiteData(p){const[h1,h2]=waterSites(p),offsets=[new THREE.Vector3(),h1.multiplyScalar(WATER_OH_DISTANCE),h2.multiplyScalar(WATER_OH_DISTANCE)];return offsets.map((offset,i)=>({position:p.pos.clone().add(offset),offset,charge:WATER_CHARGES[i]}))}
function setInstance(mesh,index,position,color=null){dummy.position.copy(position).multiplyScalar(BOX_SCALE);dummy.scale.setScalar(1);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);if(color)mesh.setColorAt(index,color)}

function updateMeshes(){
  const water=speciesSelect.value==="water";atomMesh.visible=!water;oxygenMesh.visible=water;hydrogenMesh.visible=water;atomMesh.count=water?0:particles.length;oxygenMesh.count=water?particles.length:0;hydrogenMesh.count=water?particles.length*2:0;const bondPositions=[];
  particles.forEach((p,i)=>{const color=speedColor(p.vel.length()).clone();if(water){setInstance(oxygenMesh,i,p.pos,color.lerp(new THREE.Color(0xff2449),.72));const[h1,h2]=waterSites(p),hp1=p.pos.clone().addScaledVector(h1,WATER_OH_DISTANCE),hp2=p.pos.clone().addScaledVector(h2,WATER_OH_DISTANCE);setInstance(hydrogenMesh,i*2,hp1);setInstance(hydrogenMesh,i*2+1,hp2);bondPositions.push(...p.pos.clone().multiplyScalar(BOX_SCALE).toArray(),...hp1.clone().multiplyScalar(BOX_SCALE).toArray(),...p.pos.clone().multiplyScalar(BOX_SCALE).toArray(),...hp2.clone().multiplyScalar(BOX_SCALE).toArray())}else setInstance(atomMesh,i,p.pos,color)});
  if(water&&bondsToggle.checked){let links=0;for(let i=0;i<particles.length&&links<70;i++)for(let j=i+1;j<particles.length&&links<70;j++){const d=particles[j].pos.clone().sub(particles[i].pos);d.set(minimumImage(d.x),minimumImage(d.y),minimumImage(d.z));const distance=d.length(),direction=d.clone().normalize();if(distance>.09&&distance<.155&&particles[i].orientation.dot(direction)>.45){const end=particles[i].pos.clone().add(d);bondPositions.push(...particles[i].pos.clone().multiplyScalar(BOX_SCALE).toArray(),...end.multiplyScalar(BOX_SCALE).toArray());links++}}}
  bondGeometry.setAttribute("position",new THREE.Float32BufferAttribute(bondPositions,3));bondLines.visible=water;const trailPositions=[];
  if(trailsToggle.checked)particles.forEach(p=>{for(let i=1;i<p.trail.length;i++)if(p.trail[i].distanceTo(p.trail[i-1])<.2)trailPositions.push(...p.trail[i-1].clone().multiplyScalar(BOX_SCALE).toArray(),...p.trail[i].clone().multiplyScalar(BOX_SCALE).toArray())});
  trailGeometry.setAttribute("position",new THREE.Float32BufferAttribute(trailPositions,3));[atomMesh,oxygenMesh,hydrogenMesh].forEach(mesh=>{mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true});
}

function computeRadial(){const bins=Array(28).fill(0),maxR=.45,dr=maxR/bins.length;for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++){const d=particles[j].pos.clone().sub(particles[i].pos);d.set(minimumImage(d.x),minimumImage(d.y),minimumImage(d.z));const bin=Math.floor(d.length()/dr);if(bin>=0&&bin<bins.length)bins[bin]+=2}bins.forEach((_,i)=>{const r1=i*dr,r2=r1+dr,ideal=particles.length*particles.length*(4*Math.PI/3)*(r2**3-r1**3);if(ideal)bins[i]/=ideal});return bins}
function updateAnalysis(temp,pressure){temperatureHistory.push(temp);if(temperatureHistory.length>180)temperatureHistory.shift();if(frame%8===0){phaseSamples.push({x:temp,y:pressure});if(phaseSamples.length>150)phaseSamples.shift()}if(frame%12===0)radialDistribution=computeRadial();velocityHistogram=Array(24).fill(0);particles.forEach(p=>{const i=Math.floor(p.vel.length()/3*velocityHistogram.length);if(i>=0&&i<velocityHistogram.length)velocityHistogram[i]++})}
function resizeGraph(){const rect=graphCanvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio,2);graphCanvas.width=Math.max(1,Math.floor(rect.width*ratio));graphCanvas.height=Math.max(1,Math.floor(rect.height*ratio));graphCtx.setTransform(ratio,0,0,ratio,0,0)}
function graphFrame(title){const w=graphCanvas.clientWidth,h=graphCanvas.clientHeight;graphCtx.clearRect(0,0,w,h);graphCtx.fillStyle="#050a12";graphCtx.fillRect(0,0,w,h);graphCtx.fillStyle="#cbd5e1";graphCtx.font="11px system-ui";graphCtx.fillText(title,9,16);return{w,h,pad:22}}
function drawSeries(values,title,color="#22d3ee"){const{w,h,pad}=graphFrame(title);if(values.length<2)return;let min=Math.min(...values),max=Math.max(...values);if(max-min<1e-7)max=min+1;graphCtx.beginPath();values.forEach((v,i)=>{const x=pad+i/(values.length-1)*(w-pad-8),y=h-10-(v-min)/(max-min)*(h-34);i?graphCtx.lineTo(x,y):graphCtx.moveTo(x,y)});graphCtx.strokeStyle=color;graphCtx.lineWidth=2;graphCtx.stroke()}
function drawBars(values,title){const{w,h,pad}=graphFrame(title),max=Math.max(1,...values),bw=(w-pad-7)/Math.max(1,values.length);values.forEach((v,i)=>{const bh=v/max*(h-34);graphCtx.fillStyle="#22d3ee";graphCtx.fillRect(pad+i*bw,h-9-bh,Math.max(1,bw-1),bh)})}
function drawGraph(){if(graphSelect.value==="temperature")drawSeries(temperatureHistory,"Temperature history (K)");else if(graphSelect.value==="velocity")drawBars(velocityHistogram,"Speed distribution + MB reference");else if(graphSelect.value==="radial")drawBars(radialDistribution,"Radial distribution g(r)");else drawSeries(phaseSamples.map(p=>p.y),"Reduced pressure vs temperature","#4ade80")}
function setTargetTemperature(value){targetTemperature=Math.round(THREE.MathUtils.clamp(value,50,1000));targetSlider.value=targetTemperature;$("targetOutput").textContent=`${targetTemperature} K`;$("targetReadout").textContent=`${targetTemperature} K`}
function updateStatus(){const species=speciesSelect.value==="water"?"TIP3P-style H₂O":"LJ atoms";$("status").textContent=`Drag to orbit · scroll to zoom · ${ensembleSelect.value.toUpperCase()} · ${species}`}
function animate(){if(!paused){step();frame++}const temp=temperatureKelvin(),pressure=particles.length?(particles.length*temp/KELVIN_SCALE+lastStats.virial/3)/particles.length:0;updateAnalysis(temp,pressure);$("temperature").textContent=`${temp.toFixed(0)} K`;$("pressure").textContent=pressure.toFixed(4);$("energy").textContent=((kineticEnergy()+rotationalEnergy()+lastStats.potential)/Math.max(1,particles.length)).toFixed(3);updateMeshes();drawGraph();controls.update();renderer.render(scene,camera);requestAnimationFrame(animate)}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);resizeGraph()}

presetSelect.addEventListener("change",createParticles);speciesSelect.addEventListener("change",()=>{createParticles();updateStatus()});physicsSelect.addEventListener("change",()=>{lastStats=computeForces();updateStatus()});ensembleSelect.addEventListener("change",updateStatus);targetSlider.addEventListener("input",()=>setTargetTemperature(Number(targetSlider.value)));$("pauseButton").addEventListener("click",()=>{paused=!paused;$("pauseButton").textContent=paused?"Resume":"Pause"});$("resetButton").addEventListener("click",createParticles);$("heatButton").addEventListener("click",()=>setTargetTemperature(targetTemperature+25));$("coolButton").addEventListener("click",()=>setTargetTemperature(targetTemperature-25));trailsToggle.addEventListener("change",()=>particles.forEach(p=>p.trail=[p.pos.clone()]));addEventListener("resize",resize);
resize();createParticles();animate();
