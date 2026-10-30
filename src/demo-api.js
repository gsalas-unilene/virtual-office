/** API de reservas simulada para /demo/: todo vive en la memoria de la pestaña y nada toca la base. */
const OCUPADOS = {
  hoy: [2, 5, 9, 14, 21, 22, 30, 36, 41, 47],
  siguiente: [3, 6, 10, 15, 24, 28, 33, 38, 44, 49],
};
let mio = null;

const iso = (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
const siguienteHabil = () => {
  const fecha = new Date();
  do fecha.setDate(fecha.getDate() + 1); while (fecha.getDay() === 0 || fecha.getDay() === 6);
  return fecha;
};
const respuesta = (cuerpo, estado = 200) => new Response(cuerpo === null ? null : JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

const fetchReal = window.fetch.bind(window);
window.fetch = async (entrada, opciones = {}) => {
  const url = new URL(typeof entrada === 'string' ? entrada : entrada.url, window.location.href);
  if (!url.pathname.startsWith('/api/reservas')) return fetchReal(entrada, opciones);
  const metodo = (opciones.method ?? 'GET').toUpperCase();
  if (metodo === 'GET') {
    const hoy = url.searchParams.get('dia') === 'hoy';
    return respuesta({
      fecha: iso(hoy ? new Date() : siguienteHabil()),
      feriados_cargados: true,
      ocupados: OCUPADOS[hoy ? 'hoy' : 'siguiente'],
      mio: hoy ? null : mio,
      puede_reservar: true,
    });
  }
  if (metodo === 'POST') {
    const { numero } = JSON.parse(opciones.body);
    if (OCUPADOS.siguiente.includes(numero)) return respuesta({ detail: 'ocupado' }, 409);
    if (mio !== null) return respuesta({ detail: 'ya_tienes' }, 409);
    mio = numero;
    return respuesta({ fecha: iso(siguienteHabil()), numero }, 201);
  }
  if (mio === null) return respuesta({ detail: 'sin_reserva' }, 404);
  mio = null;
  return respuesta(null, 204);
};
