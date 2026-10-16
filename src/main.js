import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import plan from './office-plan.json';
import { isBlocked } from './navigation.js';
import './style.css';

const app = document.querySelector('#app');
const status = document.querySelector('#asset-status');
const detail = document.querySelector('#asset-detail');
const fatal = document.querySelector('#fatal');
const resetButton = document.querySelector('#reset');
const overviewButton = document.querySelector('#overview');
const keys = new Set();
const player = { x: plan.spawn.x, z: plan.spawn.z, yaw: plan.spawn.yaw, pitch: 0 };
const radius = 0.28;
const speed = 3.2;
let mode = 'walk';
let fallbackFloor;

function setAssetStatus(label, message, isError = false) {
  status.textContent = label;
  detail.textContent = message;
  status.classList.toggle('error', isError);
}

function makeFloor() {
  const positions = plan.floorOutline.flatMap(([x, north]) => [x, 0, north]);
  const indices = [];
  for (let i = 1; i < plan.floorOutline.length - 1; i += 1) indices.push(0, i + 1, i);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xc5c8bd, roughness: 0.95, side: THREE.DoubleSide }),
  );
}

function start() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  } catch (error) {
    status.textContent = '3D rendering unavailable';
    status.classList.add('error');
    detail.textContent = error.message || 'This browser could not create a WebGL context.';
    fatal.hidden = false;
    fatal.textContent = 'Enable WebGL or use a desktop browser that supports it.';
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  app.prepend(renderer.domElement);
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd8e0df);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x586360, 1.7));
  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(-8, 18, 10);
  scene.add(light);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 80);
  const overviewCamera = new THREE.OrthographicCamera(-14, 14, 14, -14, 0.1, 100);
  overviewCamera.position.set(plan.width / 2, 32, plan.depth / 2);
  overviewCamera.up.set(0, 0, 1);
  overviewCamera.lookAt(plan.width / 2, 0, plan.depth / 2);
  fallbackFloor = makeFloor();
  scene.add(fallbackFloor);

  function reset() {
    player.x = plan.spawn.x;
    player.z = plan.spawn.z;
    player.yaw = plan.spawn.yaw;
    player.pitch = 0;
    camera.position.set(player.x, 1.62, player.z);
    camera.rotation.set(0, player.yaw, 0, 'YXZ');
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const aspect = width / height;
    const halfHeight = Math.max(plan.depth / 2 + 1.5, (plan.width / 2 + 1.5) / aspect);
    const halfWidth = halfHeight * aspect;
    overviewCamera.left = -halfWidth;
    overviewCamera.right = halfWidth;
    overviewCamera.top = halfHeight;
    overviewCamera.bottom = -halfHeight;
    overviewCamera.position.set(plan.width / 2, 32, plan.depth / 2);
    overviewCamera.updateProjectionMatrix();
    overviewCamera.lookAt(plan.width / 2, 0, plan.depth / 2);
  }

  function move(dt) {
    const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    const sideways = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const length = Math.hypot(forward, sideways);
    if (!length) return;
    const amount = speed * dt / length;
    const dx = (-Math.sin(player.yaw) * forward + Math.cos(player.yaw) * sideways) * amount;
    const dz = (-Math.cos(player.yaw) * forward - Math.sin(player.yaw) * sideways) * amount;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.16));
    const stepX = dx / steps;
    const stepZ = dz / steps;
    for (let i = 0; i < steps; i += 1) {
      if (!isBlocked(plan, player.x + stepX, player.z, radius)) player.x += stepX;
      if (!isBlocked(plan, player.x, player.z + stepZ, radius)) player.z += stepZ;
    }
    camera.position.set(player.x, 1.62, player.z);
  }

  function animate(now) {
    const dt = Math.min((now - (animate.last || now)) / 1000, 0.05);
    animate.last = now;
    if (mode === 'walk' && document.pointerLockElement === canvas) move(dt);
    renderer.render(scene, mode === 'overview' ? overviewCamera : camera);
    requestAnimationFrame(animate);
  }

  canvas.addEventListener('click', () => {
    if (mode === 'walk' && document.pointerLockElement !== canvas) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) keys.clear();
  });
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== canvas || mode !== 'walk') return;
    player.yaw -= event.movementX * 0.002;
    player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch - event.movementY * 0.002));
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  });
  document.addEventListener('keydown', (event) => {
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
  });
  document.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('resize', resize);
  resetButton.addEventListener('click', reset);
  overviewButton.addEventListener('click', () => {
    keys.clear();
    if (mode === 'walk') {
      mode = 'overview';
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      overviewButton.textContent = 'Walkthrough';
    } else {
      mode = 'walk';
      overviewButton.textContent = 'Overview';
      reset();
    }
  });

  reset();
  resize();
  requestAnimationFrame(animate);
  setAssetStatus('Loading office model…', 'Waiting for public/models/office.glb.');
  new GLTFLoader().load(
    '/models/office.glb',
    (gltf) => {
      if (fallbackFloor) scene.remove(fallbackFloor);
      fallbackFloor = null;
      gltf.scene.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = false;
          object.receiveShadow = false;
        }
      });
      scene.add(gltf.scene);
      setAssetStatus('Office model loaded', 'WASD move · Mouse look · Esc releases the mouse.');
    },
    undefined,
    (error) => {
      console.error('Office GLB unavailable:', error);
      setAssetStatus(
        'Office model unavailable',
        'Run scripts/build_office.py through Blender MCP, then reload this page.',
        true,
      );
    },
  );
}

start();
