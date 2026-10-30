import test from 'node:test';
import assert from 'node:assert/strict';
import { cargarEstado, reservar, cancelarReserva, mensajeError, textoFecha, ErrorReserva } from '../src/reservas-api.js';

const respuesta = (estado, cuerpo) => async () => ({ status: estado, ok: estado < 400, json: async () => cuerpo });

test('reservar envía solo el número y la sesión viaja por cookie', async () => {
  let pedido;
  const fetchFalso = async (ruta, opciones) => { pedido = { ruta, opciones }; return { status: 201, ok: true, json: async () => ({ fecha: '2026-10-30', numero: 12 }) }; };
  assert.deepEqual(await reservar(12, fetchFalso), { fecha: '2026-10-30', numero: 12 });
  assert.equal(pedido.ruta, '/api/reservas');
  assert.equal(pedido.opciones.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(pedido.opciones.body), { numero: 12 });
});

test('traduce los códigos del servidor a mensajes claros', async () => {
  await assert.rejects(reservar(3, respuesta(409, { detail: 'ocupado' })), (e) => e instanceof ErrorReserva && e.codigo === 'ocupado');
  await assert.rejects(cargarEstado('siguiente', respuesta(401, {})), (e) => e.codigo === 'sesion');
  await assert.rejects(cargarEstado('hoy', async () => { throw new TypeError('red'); }), (e) => e.codigo === 'red');
  assert.match(mensajeError(new ErrorReserva('ocupado')), /otra persona/);
  assert.match(mensajeError(new ErrorReserva('ya_tienes')), /Cancélalo/);
  assert.match(mensajeError(new ErrorReserva('xyz')), /Inténtalo/);
});

test('cancelar acepta 204 y la fecha se muestra en español', async () => {
  assert.equal(await cancelarReserva(respuesta(204)), null);
  assert.match(textoFecha('2026-10-30'), /viernes.*30.*octubre/);
});
