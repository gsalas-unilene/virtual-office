import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import walls from './floor4-walls.json';
import { buildObstacles, isBlocked, SPAWN } from './floor4-collision.js';

const status = document.querySelector('#status');
const modeButton = document.querySelector('#mode');
const crosshair = document.querySelector('.crosshair');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
document.body.append(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x172225);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445055, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-10, 25, 15);
scene.add(sun);

// Ceiling at the clear height over the vector floor outline; shown only while walking so the overview stays open.
const ceilingShape = new THREE.Shape(walls.floor_m.map(([u, v]) => new THREE.Vector2(u, -v)));
const ceiling = new THREE.Mesh(
  new THREE.ShapeGeometry(ceilingShape),
  // Unlit so the underside reads as a white false ceiling; the hemisphere light would shade it with its ground colour.
  new THREE.MeshBasicMaterial({ color: 0xdcdcd6, side: THREE.DoubleSide }),
);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = walls.heights_m.clear;
scene.add(ceiling);

const overviewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
const orbit = new OrbitControls(overviewCamera, canvas);
orbit.enableDamping = true;
const walkCamera = new THREE.PerspectiveCamera(70, 1, 0.05, 100);
walkCamera.rotation.order = 'YXZ';

const obstacles = buildObstacles(walls);
const EYE = 1.62;
const RADIUS = 0.25;
const SPEED = 2.2;
const player = { u: SPAWN.u, v: SPAWN.v, yaw: SPAWN.yaw, pitch: 0 };
const keys = new Set();
let mode = window.location.hash ? 'overview' : 'walk';

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  for (const camera of [overviewCamera, walkCamera]) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
}

function setMode(next) {
  mode = next;
  keys.clear();
  if (mode === 'overview' && document.pointerLockElement === canvas) document.exitPointerLock();
  ceiling.visible = mode === 'walk';
  crosshair.hidden = mode !== 'walk';
  orbit.enabled = mode === 'overview';
  modeButton.textContent = mode === 'walk' ? 'Overview' : 'Walk';
  status.textContent = mode === 'walk'
    ? 'Walk · click to look with the mouse · WASD or arrow keys to move · Esc releases the mouse · north runs F→A'
    : 'Overview · drag to orbit · scroll to zoom · right-drag to pan · north runs F→A';
}

function move(dt) {
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const sideways = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const length = Math.hypot(forward, sideways);
  if (!length) return;
  // The camera looks along -z at yaw 0; plan v equals -z, so forward increases v.
  const amount = (SPEED * dt) / length;
  const du = (-Math.sin(player.yaw) * forward + Math.cos(player.yaw) * sideways) * amount;
  const dv = (Math.cos(player.yaw) * forward + Math.sin(player.yaw) * sideways) * amount;
  // Small sub-steps per axis keep the walker from tunnelling through 5 cm mamparas and let it slide along walls.
  const steps = Math.max(1, Math.ceil(Math.hypot(du, dv) / 0.04));
  for (let i = 0; i < steps; i += 1) {
    if (!isBlocked(obstacles, walls.floor_m, player.u + du / steps, player.v, RADIUS)) player.u += du / steps;
    if (!isBlocked(obstacles, walls.floor_m, player.u, player.v + dv / steps, RADIUS)) player.v += dv / steps;
  }
}

canvas.addEventListener('click', () => {
  if (mode === 'walk' && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
document.addEventListener('mousemove', (event) => {
  if (mode !== 'walk' || document.pointerLockElement !== canvas) return;
  player.yaw -= event.movementX * 0.0025;
  player.pitch = Math.max(-1.3, Math.min(1.3, player.pitch - event.movementY * 0.0025));
});
document.addEventListener('keydown', (event) => {
  if (mode !== 'walk' || !/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(event.code)) return;
  event.preventDefault();
  keys.add(event.code);
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', resize);
modeButton.addEventListener('click', () => setMode(mode === 'walk' ? 'overview' : 'walk'));
resize();
setMode(mode);

new GLTFLoader().load(
  '/models/floor4.glb',
  (gltf) => {
    scene.add(gltf.scene);
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const center = bounds.getCenter(new THREE.Vector3());
    orbit.target.copy(center);
    // #top matches the PDF sheet orientation (grid A left, row 7 top); building north (F→A) points left.
    // #focus=u,v zooms onto a plan point (metres, grid A/row 2 origin); three.js z is -v.
    const focus = window.location.hash.match(/^#focus=(-?[\d.]+),(-?[\d.]+)$/);
    if (window.location.hash === '#top') overviewCamera.position.set(center.x, 34, center.z + 0.001);
    else if (focus) {
      const [u, v] = focus.slice(1).map(Number);
      orbit.target.set(u, 1.2, -v);
      overviewCamera.position.set(u - 3, 4.5, -v + 3.5);
    } else overviewCamera.position.set(center.x - 14, 24, center.z + 22);
    orbit.update();
  },
  undefined,
  (error) => {
    console.error('Floor 4 GLB unavailable:', error);
    status.textContent = 'Floor 4 model unavailable: copy a checkpoint GLB to public/models/floor4.glb.';
  },
);

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (mode === 'walk') {
    if (document.pointerLockElement === canvas || keys.size) move(dt);
    walkCamera.position.set(player.u, EYE, -player.v);
    walkCamera.rotation.set(player.pitch, player.yaw, 0);
    renderer.render(scene, walkCamera);
  } else {
    orbit.update();
    renderer.render(scene, overviewCamera);
  }
});
