import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { construirPuestos, esClicCorto, posicionBoton } from '../src/puestos-reservables.js';

const mapa = JSON.parse(readFileSync(new URL('../reserva-unilene-backend/migraciones/mapa_puestos_plano.json', import.meta.url)));
const mobiliario = JSON.parse(readFileSync(new URL('../src/floor4-furniture.json', import.meta.url)));

test('vincula los 50 números con sillas únicas y sus coordenadas', () => {
  const puestos = construirPuestos(mapa, mobiliario.items);
  assert.equal(puestos.length, 50);
  assert.deepEqual(puestos.map((puesto) => puesto.numero), Array.from({ length: 50 }, (_, i) => i + 1));
  assert.equal(puestos[0].idSilla, 'chair-038');
  assert.deepEqual(puestos[0].posicion, [16.9, 0.942]);
  assert.equal(new Set(puestos.map((puesto) => puesto.idSilla)).size, 50);
});

test('rechaza puestos repetidos, inexistentes o sin coordenadas', () => {
  assert.throws(() => construirPuestos([...mapa.slice(0, 49), mapa[0]], mobiliario.items));
  assert.throws(() => construirPuestos(mapa, mobiliario.items.filter((item) => item.id !== 'chair-038')));
  assert.throws(() => construirPuestos(mapa, mobiliario.items.map((item) => item.id === 'chair-038' ? { ...item, position_m: null } : item)));
});

test('rechaza límites y códigos inválidos sin alterar el mapa', () => {
  const original = JSON.stringify(mapa);
  const variantes = [
    [],
    mapa.slice(1),
    mapa.map((puesto, indice) => indice ? puesto : { ...puesto, numero: 0 }),
    mapa.map((puesto, indice) => indice ? puesto : { ...puesto, numero: 51 }),
    mapa.map((puesto, indice) => indice ? puesto : { ...puesto, codigo_plano: 'Cxyz' }),
    mapa.map((puesto, indice) => indice === 1 ? { ...puesto, codigo_plano: mapa[0].codigo_plano } : puesto),
  ];
  for (const variante of variantes) assert.throws(() => construirPuestos(variante, mobiliario.items));
  assert.equal(JSON.stringify(mapa), original);
});

test('los nodos exportados conservan los identificadores y posiciones', () => {
  const datos = readFileSync(new URL('../public/models/floor4.glb', import.meta.url));
  const longitud = datos.readUInt32LE(12);
  const modelo = JSON.parse(datos.subarray(20, 20 + longitud).toString('utf8').trim());
  for (const puesto of construirPuestos(mapa, mobiliario.items)) {
    const nodos = modelo.nodes.filter((nodo) => nodo.name?.endsWith(`_${puesto.idSilla}`));
    assert.equal(nodos.length, 1, puesto.idSilla);
    assert.ok(Math.abs(nodos[0].translation[0] - puesto.posicion[0]) < 0.001, puesto.idSilla);
    assert.ok(Math.abs(nodos[0].translation[2] + puesto.posicion[1]) < 0.001, puesto.idSilla);
  }
});

test('distingue un clic de un arrastre para conservar el giro de cámara', () => {
  assert.equal(esClicCorto({ x: 10, y: 10 }, { x: 13, y: 12 }), true);
  assert.equal(esClicCorto({ x: 10, y: 10 }, { x: 30, y: 10 }), false);
});

test('ubica cada botón sobre el tablero de un escritorio cercano a su silla', () => {
  const escritorios = mobiliario.items.filter((item) => item.kind === 'desk');
  const dentro = (p, c) => {
    let d = false;
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      if ((c[i][1] > p[1]) !== (c[j][1] > p[1]) && p[0] < ((c[j][0] - c[i][0]) * (p[1] - c[i][1])) / (c[j][1] - c[i][1]) + c[i][0]) d = !d;
    }
    return d;
  };
  for (const puesto of construirPuestos(mapa, mobiliario.items)) {
    const [x, y] = posicionBoton(puesto.posicion, escritorios);
    assert.ok(Math.hypot(x - puesto.posicion[0], y - puesto.posicion[1]) < 1.5, `puesto ${puesto.numero} lejos de su mesa`);
    // El disco de 0,12 m debe caber en el tablero: sus cuatro extremos también quedan dentro.
    const cabe = escritorios.some((e) => [[x, y], [x + 0.1, y], [x - 0.1, y], [x, y + 0.1], [x, y - 0.1]].every((q) => dentro(q, e.footprint_m)));
    assert.ok(cabe, `puesto ${puesto.numero} sobresale del tablero`);
  }
  assert.throws(() => posicionBoton([0, 0], []));
});
