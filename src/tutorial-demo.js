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
      { popover: { title: 'Reservo mi puesto en 1 minuto', description: 'Esto es el visor real en modo demostración: lo que hago aquí no reserva nada de verdad. Pulso «Siguiente» para avanzar.', onNextClick: siguiente() } },
      paso('canvas', 'Miro el piso 4 en 3D', 'Arrastro para girar, uso la rueda para acercar y el clic derecho para desplazarme. Los botones sobre las mesas son los puestos.'),
      paso('#mode', 'Vista general y recorrido', 'Cambio a «Recorrido» para caminar por la oficina con W A S D o las flechas y miro con el mouse. Esc libera el mouse.'),
      paso('#panel-puestos', 'Mi panel de reserva', 'Aquí elijo el día, veo mi reserva y consulto el estado de cada puesto.'),
      paso('.pestanas', 'Elijo el día', '«Hoy» solo me sirve para consultar. Para reservar uso «Día hábil siguiente»: sábados, domingos y feriados se saltan solos.'),
      paso('#abrir-mapa', 'Abro el mapa de puestos', 'Abro un plano 2D con todos los números para ubicar dónde queda cada puesto.', async () => { tocar('#abrir-mapa'); await esperar(450); }),
      paso('.mapa-tarjeta', 'Me ubico en el plano', 'Acerco con la rueda o con + y −, y arrastro para moverme. Al tocar un puesto se abre su reserva.', async () => { tocar('#cerrar-mapa'); await esperar(300); }),
      paso('#puesto', 'Elijo un puesto', 'Escojo el número en la lista, hago clic en su botón en el 3D o lo toco en el mapa. Pruebo con el puesto 12.', async () => {
        const lista = document.querySelector('#puesto');
        lista.value = '12';
        lista.dispatchEvent(new Event('change'));
        await esperar(450);
      }),
      paso('#dialogo .tarjeta', 'Confirmo mi reserva', 'Reviso el día y pulso «Confirmar reserva» (o Enter). Esc cierra sin reservar. Tengo un solo puesto por día y, si dos personas eligen el mismo a la vez, solo la primera lo consigue.', async () => { tocar('#dialogo-principal'); await esperar(700); }),
      paso('#confirmacion .pantalla', '¡Reservé mi puesto!', 'Al confirmar me llega un correo a mi cuenta corporativa con mi nombre, el puesto y la fecha. En esta demo no se envía ninguno.', async () => { tocar('#confirmacion'); await esperar(300); }),
      paso('#mi-reserva', 'Mi reserva', 'Mi puesto aparece aquí. Si ya no lo necesito, pulso «Cancelar» para dejarlo libre y poder elegir otro.'),
      paso('.leyenda', 'Los colores', 'Verde: libre. Rojo: reservado por otra persona. Azul: mi puesto.'),
      { popover: { title: '¿No puedo reservar?', description: 'Si veo el aviso «Tu usuario no tiene habilitada la reserva de puestos», solo puedo consultar «Hoy». Pido que habiliten mi usuario. ¡Eso es todo!', onNextClick: () => guia.destroy() } },
    ],
  });
  guia.drive();
}
