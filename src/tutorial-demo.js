import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const tocar = (selector) => document.querySelector(selector).click();

/** Recorrido sobre el visor real en modo demostración; las acciones se hacen con clics sobre la interfaz verdadera. */
export function iniciarTutorial() {
  let guia;
  const siguiente = (antes) => async () => {
    await antes?.();
    guia.moveNext();
  };
  const paso = (element, title, description, antes) => ({
    element,
    popover: { title, description, onNextClick: siguiente(antes) },
  });
  guia = driver({
    showProgress: true,
    showButtons: ['next', 'close'],
    allowKeyboardControl: false,
    nextBtnText: 'Siguiente',
    doneBtnText: 'Listo',
    progressText: '{{current}} de {{total}}',
    // Deja la demo como estaba para poder repetir el recorrido.
    onDestroyed: async () => {
      if (document.querySelector('#mi-reserva').hidden) return;
      tocar('#cancelar-mia');
      await esperar(200);
      tocar('#dialogo-principal');
    },
    steps: [
      { popover: { title: 'Reserva tu puesto en 1 minuto', description: 'Esto es el visor real en modo demostración: lo que hagas aquí no reserva nada de verdad. Pulsa «Siguiente» para avanzar.', onNextClick: siguiente() } },
      paso('canvas', 'Camina por la oficina en 3D', 'Estás en primera persona: muévete con W A S D o las flechas y mira con el mouse (haz clic en el 3D para capturarlo; Esc lo libera). Los botones sobre las mesas son los puestos.'),
      paso('.crosshair', 'Apunta con la mira', 'Pon la mira sobre el botón de un puesto y pulsa E (o haz clic) para elegirlo.'),
      paso('#mode', 'Vista general', 'Con este botón pasas a la vista desde arriba para ver todo el piso, y vuelves al recorrido cuando quieras.'),
      paso('#panel-puestos', 'Panel de reserva', 'Aquí eliges el día, ves tu reserva y consultas el estado de cada puesto.'),
      paso('.pestanas', 'Elige el día', '«Hoy» solo sirve para consultar. Para reservar usa «Día hábil siguiente»: sábados, domingos y feriados se saltan solos.'),
      paso('#abrir-mapa', 'Mapa de puestos', 'Abre un plano 2D con todos los números para ubicar dónde queda cada puesto.', async () => { tocar('#abrir-mapa'); await esperar(450); }),
      paso('.mapa-tarjeta', 'Ubícate en el plano', 'Acerca con la rueda o con + y −, y arrastra para moverte. Al tocar un puesto se abre su reserva.', async () => { tocar('#cerrar-mapa'); await esperar(300); }),
      paso('#puesto', 'Elige un puesto', 'Puedes escoger el número en la lista, apuntarlo en el 3D o tocarlo en el mapa. Probemos con el puesto 12.', async () => {
        const lista = document.querySelector('#puesto');
        lista.value = '12';
        lista.dispatchEvent(new Event('change'));
        await esperar(450);
      }),
      paso('#dialogo .tarjeta', 'Confirma la reserva', 'Revisa el día y pulsa «Confirmar reserva» (o Enter). Esc cierra sin reservar. Tienes un solo puesto por día y, si dos personas eligen el mismo a la vez, solo la primera lo consigue.', async () => { tocar('#dialogo-principal'); await esperar(700); }),
      paso('#confirmacion .pantalla', '¡Reservado!', 'Al confirmar te llega un correo a tu cuenta corporativa con tu nombre, el puesto y la fecha. En esta demo no se envía ninguno.', async () => { tocar('#confirmacion'); await esperar(300); }),
      paso('#mi-reserva', 'Tu reserva', 'Tu puesto aparece aquí. Si ya no lo necesitas, pulsa «Cancelar» para dejarlo libre y poder elegir otro.'),
      paso('.leyenda', 'Colores', 'Verde: libre. Rojo: reservado por otra persona. Azul: tu puesto.'),
      { popover: { title: '¿No puedes reservar?', description: 'Si ves el aviso «Tu usuario no tiene habilitada la reserva de puestos», solo podrás consultar «Hoy». Pide que habiliten tu usuario. ¡Eso es todo!', onNextClick: () => guia.destroy() } },
    ],
  });
  guia.drive();
}
