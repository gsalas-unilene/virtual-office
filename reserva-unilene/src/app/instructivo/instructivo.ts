import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { DriveStep } from 'driver.js';

export const PASOS: DriveStep[] = [
  { popover: { title: 'Reserva tu puesto en 1 minuto', description: 'Este recorrido usa una maqueta con datos de ejemplo: aquí nada se reserva de verdad. Usa «Siguiente» para avanzar.' } },
  { element: '#paso-visor', popover: { title: 'El piso 4 en 3D', description: 'En «Vista general» arrastra para girar, usa la rueda para acercar y el clic derecho para desplazar. En «Recorrido» te mueves con W A S D o las flechas y miras con el mouse.' } },
  { element: '#paso-pestanas', popover: { title: 'Elige el día', description: '«Hoy» solo sirve para consultar. Para reservar usa «Día hábil siguiente»: sábados, domingos y feriados se saltan solos.' } },
  { element: '#paso-mapa', popover: { title: 'Mapa de puestos', description: 'Abre un plano 2D con todos los números para ubicar dónde queda cada puesto. Puedes acercarlo, alejarlo y arrastrarlo; al tocar un puesto se abre la reserva.' } },
  { element: '#paso-lista', popover: { title: 'Elige un puesto', description: 'Escoge el número en la lista, haz clic en el botón sobre la mesa en el 3D o, en el recorrido, apunta y pulsa E.' } },
  { element: '#paso-leyenda', popover: { title: 'Colores', description: 'Verde: libre. Rojo: reservado por otra persona. Azul: tu puesto.' } },
  { element: '#paso-dialogo', popover: { title: 'Confirma la reserva', description: 'Revisa el día y pulsa «Confirmar reserva» (o Enter). Esc cierra sin reservar. Tienes un solo puesto por día; si dos personas eligen el mismo a la vez, solo la primera lo consigue.' } },
  { element: '#paso-correo', popover: { title: 'Correo de confirmación', description: 'Al confirmar te llega un correo a tu cuenta corporativa con tu nombre, el puesto y la fecha.' } },
  { element: '#paso-mia', popover: { title: 'Tu reserva y cancelación', description: 'Tu puesto aparece aquí. Si ya no lo necesitas, pulsa «Cancelar» para dejarlo libre y poder elegir otro.' } },
  { element: '#paso-aviso', popover: { title: '¿No puedes reservar?', description: 'Si ves este aviso, tu usuario aún no tiene habilitada la reserva: solo podrás consultar «Hoy». Pide que habiliten tu usuario.' } },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-instructivo',
  styleUrl: './instructivo.css',
  templateUrl: './instructivo.html',
})
export class Instructivo {
  protected async iniciar(): Promise<void> {
    const { driver } = await import('driver.js');
    driver({
      steps: PASOS,
      showProgress: true,
      nextBtnText: 'Siguiente',
      prevBtnText: 'Anterior',
      doneBtnText: 'Listo',
      progressText: '{{current}} de {{total}}',
    }).drive();
  }
}
