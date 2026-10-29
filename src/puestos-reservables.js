/** Relaciona los números del catálogo con las posiciones del mobiliario. */
export function construirPuestos(mapa, elementos) {
  if (!Array.isArray(mapa) || mapa.length !== 50 || !Array.isArray(elementos)) {
    throw new Error('El mapa debe contener exactamente 50 puestos.');
  }
  const numeros = new Set();
  const sillas = new Set();
  return mapa.map(({ numero, codigo_plano }) => {
    if (!Number.isInteger(numero) || numero < 1 || numero > 50 || numeros.has(numero)
        || typeof codigo_plano !== 'string' || !/^C\d{3}$/.test(codigo_plano)) {
      throw new Error('El mapa contiene un número o código de puesto inválido.');
    }
    const idSilla = `chair-${codigo_plano.slice(1)}`;
    if (sillas.has(idSilla)) throw new Error('El mapa contiene sillas repetidas.');
    const coincidencias = elementos.filter((item) => item.id === idSilla && item.kind === 'chair');
    const posicion = coincidencias[0]?.position_m;
    if (coincidencias.length !== 1 || !Array.isArray(posicion) || posicion.length !== 2
        || !posicion.every(Number.isFinite)) {
      throw new Error('No se encontró una posición única para un puesto.');
    }
    numeros.add(numero);
    sillas.add(idSilla);
    return { numero, idSilla, posicion: [...posicion] };
  });
}

/** Evita interpretar un arrastre de cámara como una selección. */
export function esClicCorto(inicio, fin) {
  return Math.hypot(fin.x - inicio.x, fin.y - inicio.y) <= 6;
}

function dentroDe(punto, contorno) {
  let dentro = false;
  for (let i = 0, j = contorno.length - 1; i < contorno.length; j = i++) {
    const [xi, yi] = contorno[i];
    const [xj, yj] = contorno[j];
    if ((yi > punto[1]) !== (yj > punto[1]) && punto[0] < ((xj - xi) * (punto[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Punto del escritorio más cercano a la silla, metido hasta 0,25 m perpendicular al borde para que el botón quede sobre el tablero. */
export function posicionBoton(silla, escritorios) {
  let mejor = null;
  for (const { footprint_m: contorno } of escritorios) {
    for (let i = 0; i < contorno.length; i += 1) {
      const [ax, ay] = contorno[i];
      const [bx, by] = contorno[(i + 1) % contorno.length];
      const largo = Math.hypot(bx - ax, by - ay);
      if (!largo) continue;
      const t = Math.max(0, Math.min(1, ((silla[0] - ax) * (bx - ax) + (silla[1] - ay) * (by - ay)) / largo ** 2));
      const punto = [ax + t * (bx - ax), ay + t * (by - ay)];
      const distancia = Math.hypot(silla[0] - punto[0], silla[1] - punto[1]);
      if (!mejor || distancia < mejor.distancia) mejor = { distancia, punto, contorno, normal: [-(by - ay) / largo, (bx - ax) / largo] };
    }
  }
  if (!mejor) throw new Error('No hay escritorios para ubicar el botón.');
  const { punto, normal, contorno } = mejor;
  for (const paso of [0.25, 0.2, 0.15, 0.1, 0.05]) {
    for (const signo of [1, -1]) {
      const candidato = [punto[0] + signo * normal[0] * paso, punto[1] + signo * normal[1] * paso];
      if (dentroDe(candidato, contorno)) return candidato;
    }
  }
  return punto;
}
