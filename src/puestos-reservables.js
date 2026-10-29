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
