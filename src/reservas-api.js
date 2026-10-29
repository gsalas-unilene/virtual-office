/** Cliente de la API de reservas; el usuario sale de la sesión, nunca del navegador. */
export class ErrorReserva extends Error {
  constructor(codigo) {
    super(codigo);
    this.codigo = codigo;
  }
}

const MENSAJES = {
  ocupado: 'Ese puesto acaba de ser reservado por otra persona.',
  ya_tienes: 'Ya tienes un puesto reservado para ese día. Cancélalo para elegir otro.',
  puesto_invalido: 'Ese puesto no está disponible para reservar.',
  sin_reserva: 'No tienes una reserva activa para cancelar.',
  sesion: 'Tu sesión terminó. Vuelve a iniciar sesión.',
};

export const mensajeError = (error) => MENSAJES[error?.codigo] ?? 'No se pudo completar la acción. Inténtalo nuevamente.';

async function llamar(ruta, opciones = {}, fetchImpl = fetch) {
  let respuesta;
  try {
    respuesta = await fetchImpl(`/api${ruta}`, { credentials: 'same-origin', ...opciones });
  } catch {
    throw new ErrorReserva('red');
  }
  if (respuesta.status === 401) throw new ErrorReserva('sesion');
  if (respuesta.status === 204) return null;
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new ErrorReserva(cuerpo.detail ?? 'error');
  return cuerpo;
}

export const cargarEstado = (fetchImpl) => llamar('/reservas/estado', {}, fetchImpl);
export const reservar = (numero, fetchImpl) => llamar('/reservas', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero }),
}, fetchImpl);
export const cancelarReserva = (fetchImpl) => llamar('/reservas/mia', { method: 'DELETE' }, fetchImpl);

/** «viernes 30 de octubre» a partir de una fecha ISO (mediodía local para evitar saltos de zona). */
export const textoFecha = (iso) => new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })
  .format(new Date(`${iso}T12:00:00`));
