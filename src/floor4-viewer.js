import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import fuenteNumeros from 'three/examples/fonts/helvetiker_bold.typeface.json';
import walls from './floor4-walls.json';
import furniture from './floor4-furniture.json';
import { buildObstacles, isBlocked, SPAWN } from './floor4-collision.js';
import mapaPuestos from '../reserva-unilene-backend/migraciones/mapa_puestos_plano.json';
import { crearTexturas, asignarUv } from './texturas.js';
import { construirPuestos, esClicCorto, posicionBoton } from './puestos-reservables.js';
import { acercar, construirMapa, desplazar, limitesPlano, textoVista, vistaPuestos } from './mapa-puestos.js';
import { cargarEstado, reservar, cancelarReserva, mensajeError, textoFecha } from './reservas-api.js';

const status = document.querySelector('#status');
const modeButton = document.querySelector('#mode');
const crosshair = document.querySelector('.crosshair');
// Escena estática: se dibuja solo cuando algo cambia (ver `sucio`), con la GPU de alto rendimiento y densidad de píxeles acotada.
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
// Neutral (colour-preserving) tone mapping and soft shadows; image-based lighting from a neutral room gives glass and boards real reflections.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Nada que proyecte sombras se mueve: el mapa se calcula una sola vez al cargar el modelo.
renderer.shadowMap.autoUpdate = false;
document.body.append(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10264d);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;
scene.add(new THREE.HemisphereLight(0xfffaf0, 0x5a5f60, 0.55));
// Near-vertical key light standing in for the ceiling fixtures: furniture casts its shadow on the floor below it.
const sun = new THREE.DirectionalLight(0xfff6e8, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
scene.add(sun, sun.target);

// Surface finishes by material name (the Blender builder names materials <checkpoint>_<finish>).
const FINISHES = {
  floor: { roughness: 0.55, color: 0x9a9d9f },  // gres cementicio gris
  melamine: { roughness: 0.55 },
  wood: { roughness: 0.48 },
  upholstery: { roughness: 0.9 },
  handle: { roughness: 0.3, metalness: 0.9 },
  aluminum: { roughness: 0.4, metalness: 0.6 },
  glass: { roughness: 0.04, envMapIntensity: 1.4 },
  frosted: { roughness: 0.75 },
  wall: { roughness: 0.9 },
  concrete: { roughness: 0.92 },
  partition: { roughness: 0.85 },
  fixture: { roughness: 0.15 },
};

const texturas = crearTexturas();
// Acabado del GLB → textura (concrete y partition comparten la del muro).
const TEXTURA_DE = { floor: 'floor', wood: 'wood', melamine: 'melamine', wall: 'wall', concrete: 'wall', partition: 'wall' };

function finish(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    const material = object.material;
    const key = Object.keys(FINISHES).find((name) => material.name.endsWith(`_${name}`));
    if (key) {
      const { color, ...props } = FINISHES[key];
      Object.assign(material, props);
      if (color !== undefined) material.color.setHex(color);
      const mapa = texturas[TEXTURA_DE[key]];
      if (mapa) {
        asignarUv(object.geometry, mapa.userData.metros);
        material.map = mapa;
        material.needsUpdate = true;
      }
    }
    // Glass lets light through, so it neither casts shadows nor darkens the offices behind it.
    object.castShadow = !material.transparent && key !== 'floor';
    object.receiveShadow = true;
  });
}

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

const obstacles = buildObstacles(walls, furniture);

// 0.60 m LED panels on a 2.4 m grid over free floor, shown with the ceiling.
const panelSpots = [];
for (let u = 1.2; u < 23; u += 2.4) {
  for (let v = 1.2; v < 23; v += 2.4) if (!isBlocked(obstacles, walls.floor_m, u, v, 0.35)) panelSpots.push([u, v]);
}
const panels = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(0.6, 0.6),
  new THREE.MeshBasicMaterial({ color: 0xfffdf6 }),
  panelSpots.length,
);
const placement = new THREE.Object3D();
panelSpots.forEach(([u, v], index) => {
  placement.position.set(u, walls.heights_m.clear - 0.005, -v);
  placement.rotation.set(Math.PI / 2, 0, 0);
  placement.updateMatrix();
  panels.setMatrixAt(index, placement.matrix);
});
scene.add(panels);
const EYE = 1.62;
const RADIUS = 0.25;
const SPEED = 3.2;
const player = { u: SPAWN.u, v: SPAWN.v, yaw: SPAWN.yaw, pitch: 0 };
const keys = new Set();
let mode = window.location.hash && window.location.hash !== '#puestos' ? 'overview' : 'walk';
const seleccionHabilitada = window.location.hash === '#puestos';
const panelPuestos = document.querySelector('#panel-puestos');
const listaPuestos = document.querySelector('#puesto');
const mensajePuesto = document.querySelector('#puesto-seleccionado');
const botones = [];
// Estado real por número de puesto ('libre' | 'reservado' | 'mio'); sin dato si la API no responde.
const estados = new Map();
let fechaReserva = null;
let miPuesto = null;
// Paleta del logo de Unilene: verde #80b927 y azul #1d3d77 (tonos algo más oscuros para que el número blanco contraste).
const COLORES = { libre: '#5d9a1c', reservado: '#c0392b', mio: '#2f5fb3', sinDato: '#6b7a99' };
const ETIQUETAS = { libre: 'libre', reservado: 'reservado', mio: 'tu puesto', sinDato: 'sin información de reserva' };
const porId = (id) => document.querySelector(`#${id}`);
const dialogo = porId('dialogo');
const confirmacion = porId('confirmacion');
const mapa = porId('mapa');
const lienzoMapa = porId('mapa-lienzo');
const sugerencia = porId('sugerencia');
const aviso = porId('aviso');
let accionPrincipal = null;
let diaActivo = 'siguiente';
let reservando = false;
let temporizadorAviso = 0;
const rayo = new THREE.Raycaster();
rayo.far = 4;
let inicioClic = null;
let sucio = true;
const pedirRender = () => { sucio = true; };
const centroPantalla = new THREE.Vector2();
let sobre = null;
let elegido = null;

function dibujarBoton(boton) {
  const { numero, tapa, letras } = boton.userData;
  const color = boton === elegido ? '#ffc857' : COLORES[estados.get(numero) ?? 'sinDato'];
  tapa.color.set(color);
  tapa.emissive.set(color);
  letras.color.set(boton === elegido ? '#10264d' : '#ffffff');
}

function seleccionarPuesto(numero) {
  const boton = botones.find((item) => item.userData.numero === numero);
  if (!boton) return;
  pedirRender();
  const anterior = elegido;
  elegido = boton;
  if (anterior) dibujarBoton(anterior);
  dibujarBoton(boton);
  listaPuestos.value = String(numero);
  mensajePuesto.textContent = `Puesto ${numero}: ${ETIQUETAS[estados.get(numero) ?? 'sinDato']}.`;
  abrirDialogo(numero);
}

// Los marcadores del plano 2D se dibujan una vez; luego solo cambia data-estado.
function pintarMapa() {
  for (const marcador of lienzoMapa.querySelectorAll('[data-numero]')) {
    const numero = Number(marcador.dataset.numero);
    const estado = estados.get(numero) ?? 'sinDato';
    marcador.dataset.estado = estado;
    marcador.setAttribute('aria-label', `Puesto ${numero}: ${ETIQUETAS[estado]}`);
  }
  porId('mapa-fecha').textContent = porId('fecha-reserva').textContent;
}

function abrirMapa() {
  pintarMapa();
  mapa.hidden = false;
  keys.clear();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  porId('cerrar-mapa').focus();
}

function cerrarMapa() {
  mapa.hidden = true;
  porId('abrir-mapa').focus();
  pedirRender();
}

function avisar(texto, esError = false) {
  aviso.textContent = texto;
  aviso.classList.toggle('error', esError);
  aviso.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { aviso.hidden = true; }, 5000);
}

function cerrarDialogo() {
  dialogo.hidden = true;
  accionPrincipal = null;
  pedirRender();
}

function abrirDialogo(numero) {
  const estado = estados.get(numero) ?? 'sinDato';
  const cuando = fechaReserva ? textoFecha(fechaReserva) : 'el próximo día hábil';
  const principal = porId('dialogo-principal');
  principal.hidden = false;
  accionPrincipal = null;
  porId('dialogo-titulo').textContent = `Puesto ${numero}`;
  if (diaActivo === 'hoy') {
    porId('dialogo-texto').textContent = { libre: 'Este puesto está libre hoy.', reservado: 'Este puesto está reservado hoy.', mio: 'Este es tu puesto de hoy.' }[estado] ?? 'No se pudo consultar la disponibilidad. Recarga la página.';
    principal.hidden = true;
  } else if (estado === 'libre' && miPuesto === null) {
    porId('dialogo-texto').textContent = `¿Reservar este puesto para el ${cuando}?`;
    principal.textContent = 'Confirmar reserva';
    accionPrincipal = () => confirmarReserva(numero);
  } else if (estado === 'libre') {
    porId('dialogo-texto').textContent = `Ya tienes el puesto ${miPuesto} reservado para el ${cuando}. Cancélalo si quieres elegir otro.`;
    principal.textContent = `Cancelar puesto ${miPuesto}`;
    accionPrincipal = anularReserva;
  } else if (estado === 'mio') {
    porId('dialogo-texto').textContent = `Este es tu puesto para el ${cuando}.`;
    principal.textContent = 'Cancelar mi reserva';
    accionPrincipal = anularReserva;
  } else {
    porId('dialogo-texto').textContent = estado === 'reservado'
      ? `Este puesto ya está reservado para el ${cuando}.`
      : 'No se pudo consultar la disponibilidad. Recarga la página.';
    principal.hidden = true;
  }
  dialogo.hidden = false;
  keys.clear();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  principal.hidden ? porId('dialogo-secundario').focus() : principal.focus();
}

async function refrescarEstado() {
  const dia = diaActivo;
  let datos;
  try {
    datos = await cargarEstado(dia);
  } catch (error) {
    // Sin permiso para reservar solo existe la pestaña «Hoy».
    if (error.codigo === 'no_habilitado' && dia === 'siguiente') { soloHoy(); return; }
    throw error;
  }
  if (dia !== diaActivo) return;
  if (!datos.puede_reservar) soloHoy();
  fechaReserva = datos.fecha;
  miPuesto = datos.mio;
  for (const boton of botones) {
    const { numero } = boton.userData;
    estados.set(numero, numero === datos.mio ? 'mio' : datos.ocupados.includes(numero) ? 'reservado' : 'libre');
    dibujarBoton(boton);
  }
  porId('fecha-reserva').textContent = dia === 'hoy' ? `Reservas de hoy, ${textoFecha(datos.fecha)}` : `Reserva para el ${textoFecha(datos.fecha)}`;
  porId('aviso-feriados').hidden = dia === 'hoy' || datos.feriados_cargados;
  porId('mi-reserva').hidden = dia === 'hoy' || datos.mio === null;
  porId('mi-reserva-texto').textContent = `Tu puesto: ${datos.mio}`;
  pintarMapa();
  pedirRender();
}

async function confirmarReserva(numero) {
  cerrarDialogo();
  if (reservando) return;
  reservando = true;
  try {
    const hecho = await reservar(numero);
    await refrescarEstado();
    porId('confirmacion-titulo').textContent = `¡Puesto ${hecho.numero} reservado!`;
    porId('confirmacion-fecha').textContent = textoFecha(hecho.fecha);
    confirmacion.hidden = false;
  } catch (error) {
    avisar(mensajeError(error), true);
    refrescarEstado().catch(() => {});
  } finally {
    reservando = false;
  }
}

async function anularReserva() {
  cerrarDialogo();
  try {
    await cancelarReserva();
    await refrescarEstado();
    avisar('Reserva cancelada. El puesto quedó libre.');
  } catch (error) {
    avisar(mensajeError(error), true);
  }
}

function soloHoy() {
  porId('tab-siguiente').hidden = true;
  porId('aviso-sin-reserva').hidden = false;
  cambiarDia('hoy');
}

function cambiarDia(dia) {
  if (dia === diaActivo) return;
  diaActivo = dia;
  for (const tab of document.querySelectorAll('.pestanas button')) tab.setAttribute('aria-selected', String(tab.dataset.dia === dia));
  porId('fecha-reserva').textContent = 'Consultando disponibilidad…';
  refrescarEstado().catch((error) => avisar(mensajeError(error), true));
}
for (const tab of document.querySelectorAll('.pestanas button')) tab.addEventListener('click', () => cambiarDia(tab.dataset.dia));
porId('dialogo-principal').addEventListener('click', () => accionPrincipal?.());
porId('dialogo-secundario').addEventListener('click', cerrarDialogo);
porId('cancelar-mia').addEventListener('click', () => abrirDialogo(miPuesto));
confirmacion.addEventListener('click', () => { confirmacion.hidden = true; pedirRender(); });
document.addEventListener('keydown', (evento) => {
  if (!confirmacion.hidden) { confirmacion.hidden = true; pedirRender(); evento.preventDefault(); evento.stopImmediatePropagation(); return; }
  if (dialogo.hidden) {
    if (!mapa.hidden && evento.code === 'Escape') { cerrarMapa(); evento.stopImmediatePropagation(); }
    return;
  }
  if (evento.code === 'Escape') { cerrarDialogo(); evento.stopImmediatePropagation(); }
  else if (evento.code === 'Enter' && accionPrincipal && document.activeElement?.id !== 'dialogo-secundario') { evento.preventDefault(); accionPrincipal(); }
}, true);

function botonBajoMira(camara, x, y) {
  rayo.setFromCamera(centroPantalla.set(x, y), camara);
  const golpe = rayo.intersectObjects(botones, true)[0]?.object;
  return golpe?.userData.numero ? golpe : golpe?.parent ?? null;
}

function resaltar(boton) {
  if (boton === sobre) return;
  pedirRender();
  if (sobre) sobre.scale.setScalar(1);
  sobre = boton;
  if (sobre) sobre.scale.setScalar(1.3);
  const { numero } = sobre?.userData ?? {};
  sugerencia.hidden = !sobre || mode !== 'walk';
  if (sobre) sugerencia.textContent = `Puesto ${numero} · ${ETIQUETAS[estados.get(numero) ?? 'sinDato']} — pulsa E`;
  canvas.style.cursor = sobre && mode === 'overview' ? 'pointer' : '';
}

if (seleccionHabilitada) {
  try {
    const escritorios = furniture.items.filter((item) => item.kind === 'desk');
    const geometria = new THREE.CylinderGeometry(0.13, 0.14, 0.04, 40);
    const base = new THREE.MeshStandardMaterial({ color: 0x10264d, roughness: 0.4 });
    const fuente = new FontLoader().parse(fuenteNumeros);
    for (const puesto of construirPuestos(mapaPuestos, furniture.items)) {
      const opcion = document.createElement('option');
      opcion.value = String(puesto.numero);
      opcion.textContent = `Puesto ${puesto.numero}`;
      listaPuestos.append(opcion);
      const tapa = new THREE.MeshStandardMaterial({ roughness: 0.35, emissiveIntensity: 0.3 });
      const letras = new THREE.MeshStandardMaterial({ roughness: 0.4 });
      const boton = new THREE.Mesh(geometria, [base, tapa, base]);
      // Número en relieve sobre la base: queda a ras de la mesa y se lee desde la vista general y desde el recorrido.
      const geometriaNumero = new TextGeometry(String(puesto.numero), { font: fuente, size: 0.11, depth: 0.03, curveSegments: 3, bevelEnabled: false });
      geometriaNumero.center();
      const numero3d = new THREE.Mesh(geometriaNumero, letras);
      numero3d.rotation.x = -Math.PI / 2;
      numero3d.position.y = 0.02 + 0.015;
      boton.add(numero3d);
      const [u, v] = posicionBoton(puesto.posicion, escritorios);
      boton.position.set(u, furniture.heights_m.desk + 0.03, -v);
      boton.userData = { numero: puesto.numero, tapa, letras };
      dibujarBoton(boton);
      botones.push(boton);
      scene.add(boton);
    }
    lienzoMapa.innerHTML = construirMapa(walls, furniture, botones.map((boton) => ({ numero: boton.userData.numero, u: boton.position.x, v: -boton.position.z })));
    porId('abrir-mapa').addEventListener('click', abrirMapa);
    porId('cerrar-mapa').addEventListener('click', cerrarMapa);
    // Zoom y desplazamiento del plano: solo cambia el viewBox del SVG.
    const limites = limitesPlano(walls);
    const inicial = vistaPuestos(botones.map((boton) => ({ u: boton.position.x, v: -boton.position.z })));
    const svgMapa = lienzoMapa.querySelector('svg');
    let vista = inicial;
    let arrastre = null;
    const mostrar = (nueva) => { vista = nueva; svgMapa.setAttribute('viewBox', textoVista(vista)); };
    const aPlano = (clientX, clientY) => {
      const r = svgMapa.getBoundingClientRect();
      const escala = Math.max(vista.w / r.width, vista.h / r.height);
      return [vista.x + vista.w / 2 + (clientX - r.left - r.width / 2) * escala, vista.y + vista.h / 2 + (clientY - r.top - r.height / 2) * escala, escala];
    };
    const centro = () => [vista.x + vista.w / 2, vista.y + vista.h / 2];
    porId('mapa-mas').addEventListener('click', () => mostrar(acercar(vista, 1.5, ...centro(), limites)));
    porId('mapa-menos').addEventListener('click', () => mostrar(acercar(vista, 1 / 1.5, ...centro(), limites)));
    porId('mapa-ajustar').addEventListener('click', () => mostrar(inicial));
    lienzoMapa.addEventListener('wheel', (evento) => {
      evento.preventDefault();
      const [x, y] = aPlano(evento.clientX, evento.clientY);
      mostrar(acercar(vista, evento.deltaY < 0 ? 1.25 : 0.8, x, y, limites));
    }, { passive: false });
    lienzoMapa.addEventListener('pointerdown', (evento) => { arrastre = { x: evento.clientX, y: evento.clientY, movido: false }; });
    lienzoMapa.addEventListener('pointermove', (evento) => {
      if (!arrastre) return;
      const dx = evento.clientX - arrastre.x;
      const dy = evento.clientY - arrastre.y;
      if (!arrastre.movido && Math.hypot(dx, dy) <= 6) return;
      if (!arrastre.movido) { arrastre.movido = true; lienzoMapa.classList.add('arrastrando'); lienzoMapa.setPointerCapture(evento.pointerId); }
      const escala = aPlano(0, 0)[2];
      mostrar(desplazar(vista, -dx * escala, -dy * escala, limites));
      arrastre.x = evento.clientX;
      arrastre.y = evento.clientY;
    });
    const soltar = () => { lienzoMapa.classList.remove('arrastrando'); setTimeout(() => { arrastre = null; }, 0); };
    lienzoMapa.addEventListener('pointerup', soltar);
    lienzoMapa.addEventListener('pointercancel', soltar);
    mapa.addEventListener('click', (evento) => {
      if (evento.target === mapa) cerrarMapa();
      if (arrastre?.movido) return;
      const marcador = evento.target.closest('[data-numero]');
      if (marcador) seleccionarPuesto(Number(marcador.dataset.numero));
    });
    lienzoMapa.addEventListener('keydown', (evento) => {
      const marcador = evento.target.closest('[data-numero]');
      if ((evento.code === 'Enter' || evento.code === 'Space') && marcador) {
        evento.preventDefault();
        evento.stopPropagation();
        seleccionarPuesto(Number(marcador.dataset.numero));
      }
    });
    panelPuestos.hidden = false;
    refrescarEstado().catch((error) => {
      porId('fecha-reserva').textContent = 'No se pudo consultar la disponibilidad.';
      avisar(mensajeError(error), true);
    });
    listaPuestos.addEventListener('change', () => seleccionarPuesto(Number(listaPuestos.value)));
    canvas.addEventListener('pointerdown', (evento) => {
      inicioClic = { x: evento.clientX, y: evento.clientY };
    });
    canvas.addEventListener('pointermove', (evento) => {
      if (mode !== 'overview') return;
      const r = canvas.getBoundingClientRect();
      rayo.far = 200;
      resaltar(botonBajoMira(overviewCamera, ((evento.clientX - r.left) / r.width) * 2 - 1, -((evento.clientY - r.top) / r.height) * 2 + 1));
    });
    canvas.addEventListener('pointerup', (evento) => {
      if (mode !== 'overview' || !inicioClic || !esClicCorto(inicioClic, { x: evento.clientX, y: evento.clientY })) return;
      if (sobre) seleccionarPuesto(sobre.userData.numero);
      inicioClic = null;
    });
    document.addEventListener('keydown', (evento) => {
      if (mode === 'walk' && evento.code === 'KeyE' && sobre && dialogo.hidden) seleccionarPuesto(sobre.userData.numero);
    });
  } catch {
    panelPuestos.hidden = false;
    listaPuestos.disabled = true;
    mensajePuesto.textContent = 'No se pudieron identificar los puestos en el modelo.';
  }
}

function resize() {
  pedirRender();
  renderer.setSize(window.innerWidth, window.innerHeight);
  for (const camera of [overviewCamera, walkCamera]) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
}

function setMode(next) {
  mode = next;
  pedirRender();
  keys.clear();
  if (mode === 'overview' && document.pointerLockElement === canvas) document.exitPointerLock();
  ceiling.visible = mode === 'walk';
  panels.visible = mode === 'walk';
  crosshair.hidden = mode !== 'walk';
  orbit.enabled = mode === 'overview';
  rayo.far = mode === 'walk' ? 4 : 200;
  resaltar(null);
  modeButton.textContent = mode === 'walk' ? 'Vista general' : 'Recorrido';
  status.innerHTML = mode === 'walk'
    ? '<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> o <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> moverte</span><span>Clic y mouse: mirar</span><span><kbd>E</kbd> o clic en un botón: elegir puesto</span><span><kbd>Esc</kbd> libera el mouse</span>'
    : '<span>Arrastrar: girar</span><span>Rueda: acercar</span><span>Clic derecho: desplazar</span><span>Clic en un botón: elegir puesto</span>';
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
  if (mode !== 'walk') return;
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
  else if (sobre) seleccionarPuesto(sobre.userData.numero);
});
document.addEventListener('mousemove', (event) => {
  if (mode !== 'walk' || document.pointerLockElement !== canvas) return;
  pedirRender();
  player.yaw -= event.movementX * 0.0025;
  player.pitch = Math.max(-1.3, Math.min(1.3, player.pitch - event.movementY * 0.0025));
});
document.addEventListener('keydown', (event) => {
  if (mode !== 'walk' || !dialogo.hidden || !/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(event.code)) return;
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
    finish(gltf.scene);
    scene.add(gltf.scene);
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const center = bounds.getCenter(new THREE.Vector3());
    // Estático: sin recalcular matrices por cuadro y con el mapa de sombras generado una vez.
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((object) => { object.matrixAutoUpdate = false; });
    renderer.shadowMap.needsUpdate = true;
    pedirRender();
    sun.target.position.copy(center);
    sun.position.set(center.x - 4, 30, center.z + 6);
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
    status.textContent = 'No se pudo cargar el modelo del piso 4.';
  },
);

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (mode === 'walk') {
    const moviendo = keys.size > 0;
    if (moviendo) move(dt);
    if (!moviendo && !sucio) return;
    sucio = false;
    walkCamera.position.set(player.u, EYE, -player.v);
    walkCamera.rotation.set(player.pitch, player.yaw, 0);
    if (botones.length) resaltar(botonBajoMira(walkCamera, 0, 0));
    renderer.render(scene, walkCamera);
  } else {
    if (!orbit.update() && !sucio) return;
    sucio = false;
    renderer.render(scene, overviewCamera);
  }
});
