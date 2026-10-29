import * as THREE from 'three';

const LADO = 256;

// Generador determinista: las texturas son idénticas en cada carga.
function azar(semilla) {
  let x = semilla;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function textura(dibujar, semilla, metros) {
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = LADO;
  const c = lienzo.getContext('2d');
  dibujar(c, azar(semilla));
  const t = new THREE.CanvasTexture(lienzo);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.metros = metros; // lado en metros que cubre una repetición
  return t;
}

function ruido(c, azarNum, cantidad, alfa) {
  for (let i = 0; i < cantidad; i += 1) {
    c.fillStyle = `rgba(${azarNum() < 0.5 ? '0,0,0' : '255,255,255'},${alfa})`;
    c.fillRect(azarNum() * LADO, azarNum() * LADO, 1 + azarNum() * 2, 1 + azarNum() * 2);
  }
}

/** Texturas por acabado (nombre del material del GLB); el color del material las tiñe. */
export function crearTexturas() {
  return {
    // Gres cementicio gris de 0,6 m: nubes suaves de tono, grano fino y junta discreta; cuatro baldosas por repetición.
    floor: textura((c, r) => {
      c.fillStyle = '#fff'; c.fillRect(0, 0, LADO, LADO);
      for (let i = 0; i < 90; i += 1) {
        const x = r() * LADO, y = r() * LADO, radio = 30 + r() * 60;
        const g = c.createRadialGradient(x, y, 0, x, y, radio);
        const claro = r() < 0.5;
        g.addColorStop(0, `rgba(${claro ? '255,255,255' : '0,0,0'},${0.05 + r() * 0.05})`);
        g.addColorStop(1, 'rgba(128,128,128,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, LADO, LADO);
      }
      ruido(c, r, 2600, 0.06);
      c.fillStyle = 'rgba(40,40,40,0.5)';
      for (const k of [0, 127, 254]) { c.fillRect(0, k, LADO, 2); c.fillRect(k, 0, 2, LADO); }
    }, 11, 1.2),
    // Veta de madera: bandas finas en el sentido horizontal de la textura.
    wood: textura((c, r) => {
      c.fillStyle = '#fff'; c.fillRect(0, 0, LADO, LADO);
      for (let y = 0; y < LADO; y += 1) {
        const g = 0.5 + 0.5 * Math.sin(y * 0.35 + Math.sin(y * 0.05) * 3);
        c.fillStyle = `rgba(90,55,25,${0.04 + g * 0.16 + r() * 0.05})`;
        c.fillRect(0, y, LADO, 1);
      }
    }, 23, 0.8),
    // Melamina: grano muy fino casi imperceptible.
    melamine: textura((c, r) => { c.fillStyle = '#fff'; c.fillRect(0, 0, LADO, LADO); ruido(c, r, 2500, 0.04); }, 37, 0.5),
    // Muros y concreto: pañete con grano suave.
    wall: textura((c, r) => { c.fillStyle = '#fff'; c.fillRect(0, 0, LADO, LADO); ruido(c, r, 3500, 0.035); }, 41, 1),
  };
}

/** UV por proyección de caja usando la normal dominante de cada vértice (el modelo no trae UVs). */
export function asignarUv(geometria, metros) {
  if (geometria.attributes.uv) return;
  const p = geometria.attributes.position;
  const n = geometria.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
    uv[i * 2] = u / metros;
    uv[i * 2 + 1] = v / metros;
  }
  geometria.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
