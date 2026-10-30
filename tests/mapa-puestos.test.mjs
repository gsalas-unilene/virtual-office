import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { construirMapa } from '../src/mapa-puestos.js';
import { construirPuestos, posicionBoton } from '../src/puestos-reservables.js';

const leer = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url)));
const walls = leer('../src/floor4-walls.json');
const furniture = leer('../src/floor4-furniture.json');
const mapa = leer('../reserva-unilene-backend/migraciones/mapa_puestos_plano.json');

test('dibuja los 50 puestos numerados con el norte hacia arriba', () => {
  const escritorios = furniture.items.filter((item) => item.kind === 'desk');
  const puestos = construirPuestos(mapa, furniture.items).map(({ numero, posicion }) => {
    const [u, v] = posicionBoton(posicion, escritorios);
    return { numero, u, v };
  });
  const svg = construirMapa(walls, furniture, puestos);
  assert.equal([...svg.matchAll(/class="mapa-puesto"/g)].length, 50);
  for (let numero = 1; numero <= 50; numero += 1) assert.ok(svg.includes(`data-numero="${numero}"`));
  assert.ok(svg.includes(`cx="${puestos[0].u}" cy="${-puestos[0].v}"`));
  assert.ok(svg.startsWith('<svg viewBox="'));
});

test('el zoom deja fijo el punto bajo el cursor y respeta los límites del piso', async () => {
  const { acercar, desplazar, limitesPlano } = await import('../src/mapa-puestos.js');
  const limites = limitesPlano(walls);
  const vista = { x: 0, y: -10, w: 10, h: 8 };
  const cerca = acercar(vista, 2, 5, -6, limites);
  assert.equal(cerca.w, 5);
  assert.equal(cerca.h, 4);
  assert.equal((5 - cerca.x) / cerca.w, (5 - vista.x) / vista.w);
  assert.equal((-6 - cerca.y) / cerca.h, (-6 - vista.y) / vista.h);
  assert.equal(acercar(vista, 1000, 5, -6, limites).w, limites.w / 8);
  const lejos = acercar(vista, 0.0001, 5, -6, limites);
  assert.ok(lejos.w <= limites.w && lejos.h <= limites.h);
  assert.equal(desplazar(vista, -999, 999, limites).x, limites.x);
});
