const RADIO = 0.26;
const MARGEN = 0.8;
const MARGEN_PUESTOS = 1.2;
const ACERCAMIENTO_MAXIMO = 8;

const puntos = (contorno) => contorno.map(([u, v]) => `${u},${-v}`).join(' ');
const caja = (xs, ys, margen) => ({
  x: Math.min(...xs) - margen,
  y: Math.min(...ys) - margen,
  w: Math.max(...xs) - Math.min(...xs) + 2 * margen,
  h: Math.max(...ys) - Math.min(...ys) + 2 * margen,
});

/** Piso completo: es el máximo que se puede alejar o desplazar el plano. */
export function limitesPlano(walls) {
  return caja(walls.floor_m.map(([u]) => u), walls.floor_m.map(([, v]) => -v), MARGEN);
}

/** Vista inicial ajustada a la zona con puestos, para que los números salgan grandes. */
export function vistaPuestos(puestos) {
  return caja(puestos.map(({ u }) => u), puestos.map(({ v }) => -v), MARGEN_PUESTOS);
}

const entre = (valor, minimo, maximo) => Math.max(minimo, Math.min(maximo, valor));

function ajustar(vista, limites) {
  return { ...vista, x: entre(vista.x, limites.x, limites.x + limites.w - vista.w), y: entre(vista.y, limites.y, limites.y + limites.h - vista.h) };
}

/** Escala la vista por `factor` (>1 acerca) dejando fijo el punto (cx, cy) del plano. */
export function acercar(vista, factor, cx, cy, limites) {
  const w = entre(vista.w / factor, limites.w / ACERCAMIENTO_MAXIMO, limites.w);
  const h = w * (vista.h / vista.w);
  if (h > limites.h) return acercar(vista, factor * (h / limites.h), cx, cy, limites);
  return ajustar({ x: cx - ((cx - vista.x) * w) / vista.w, y: cy - ((cy - vista.y) * h) / vista.h, w, h }, limites);
}

export function desplazar(vista, dx, dy, limites) {
  return ajustar({ ...vista, x: vista.x + dx, y: vista.y + dy }, limites);
}

export const textoVista = ({ x, y, w, h }) => `${x} ${y} ${w} ${h}`;

/** Plano 2D (norte arriba) del piso con un marcador por puesto; el color lo pone el CSS según data-estado. */
export function construirMapa(walls, furniture, puestos) {
  const escritorios = furniture.items.filter((item) => item.kind === 'desk')
    .map(({ footprint_m }) => `<polygon class="mapa-mesa" points="${puntos(footprint_m)}"/>`).join('');
  const tabiques = walls.partitions
    .map(({ start_m: [u1, v1], end_m: [u2, v2] }) => `<line class="mapa-tabique" x1="${u1}" y1="${-v1}" x2="${u2}" y2="${-v2}"/>`).join('');
  const marcadores = puestos.map(({ numero, u, v }) =>
    `<g class="mapa-puesto" data-numero="${numero}" role="button" tabindex="0" aria-label="Puesto ${numero}">`
    + `<circle cx="${u}" cy="${-v}" r="${RADIO}"/><text x="${u}" y="${-v}">${numero}</text></g>`).join('');
  return `<svg viewBox="${textoVista(vistaPuestos(puestos))}" role="group" aria-label="Plano del piso 4 con los puestos numerados">`
    + `<polygon class="mapa-piso" points="${puntos(walls.floor_m)}"/>${escritorios}${tabiques}${marcadores}</svg>`;
}
