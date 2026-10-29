# Puestos reservables en el visor 3D
Rama: feat/puestos-reservables-3d; entrega: feature-branch-chain; pruebas: Node.js, compilación Vite y Playwright.

## Specs
S1. “OK Listo ejecutado y verificado , continuar con lo faltante”.
S2. “Puedes mejor enumerarlos de 1 al 50 para ser ordenados.”
S3. “Cuando haga login debe mostrar el 3D Optimizado y con wraper empersarial.”
S4. “Yo ejectura los scripts, crealos en un carpeta separando las migraciones si existen luego cambios. Tu solo haces select y verificaciones.”
S5. “Cualquier cambio ahora validado con el MCP de Playwright y dejame tiempo para logear de esa manera no expongo usuarios.”
S6. “No me gusta eso, debe ser recorrido 3D mostrando con una buena UI y bordes redondeados que se mueves con las feclas direccionales o con AWSD. Asignar su puesto debe ser un boton 3D en la mesa de cada puesto y Mostrar asiento reservado en el boton. Investiga en internet que puedes replicar manteniendo lo empresarial y eficienete. Agrega un poco de velocidad al deplazarte.”
S7. “Mejorar ese visor que no esta acorde a la UI=” y “Debes reservar para una fecha elegida”.
S8. “una fecha al dia siguiente o al siguiente si existe feriado en la semana”.
S9. “Solo se puede reservar para el proximo dia habil aunque mejor dejar libre otros dias por si recursos humanos lo solicita. Inicialmente sera solo el proximo dia habil.”

## Tasks
- T1 [S1–S4,S6–S7] inline: sustituir la selección anterior por recorrido, interfaz empresarial y botones 3D; pendiente.
- T2 [S1,S4,S6–S9] inline: conectar reserva para el próximo día hábil y estado real sin escrituras SQL del asistente; pendiente.
- T3 [S1–S9] inline: verificar compilación y vista con Playwright después del inicio de sesión manual; pendiente.

## Log
L1. “OK Listo ejecutado y verificado , continuar con lo faltante”.
L2. SELECT en DW_VORTICEDATA confirmó 50 códigos distintos del 1 al 50 y cero feriados. Los 50 códigos del mapa coinciden una vez cada uno con un nodo del GLB; la selección todavía no existe. El usuario ejecuta escrituras SQL. La reserva y disponibilidad son trabajo posterior, no se deben simular.
L3. Implementada selección visual opcional por número y lista accesible en el visor integrado; no se crean reservas ni se afirma disponibilidad. Los 50 vínculos y posiciones del GLB pasaron pruebas Node 5/5; comprobaciones de navegación, compilaciones Vite y Angular y pruebas Angular 3/3 pasaron. Docker reconstruido y saludable. Verificador independiente comprobó el mapa y reportó prueba visual pendiente; señaló un posible arrastre que retorna al punto inicial, aún sin confirmar. Se abrió Playwright en el login sin capturas automáticas y se espera que el usuario ingrese manualmente. Riesgo: ítems 2, 3 y 5. Sin commit; T1 y T2 pendientes hasta completar la prueba visual y la revisión del posible arrastre. Advertencia Vite: fragmento mayor de 500 kB.
L4. “No me gusta eso, debe ser recorrido 3D mostrando con una buena UI y bordes redondeados que se mueves con las feclas direccionales o con AWSD. Asignar su puesto debe ser un boton 3D en la mesa de cada puesto y Mostrar asiento reservado en el boton. Investiga en internet que puedes replicar manteniendo lo empresarial y eficienete. Agrega un poco de velocidad al deplazarte.” La propuesta anterior queda reemplazada. Las tablas distinguen asignación fija de reserva por día; el alcance de la acción «Asignar» requiere confirmación. Se consultaron referencias de mapas de oficinas y Three.js; no se autenticó ni se ejecutaron escrituras SQL.
L5. “Mejorar ese visor que no esta acorde a la UI=”.
L6. “Debes reservar para una fecha elegida”. La acción corresponde a una reserva de día completo, no a una asignación fija. Los estados deben derivar de datos reales. La tabla de feriados estaba vacía en la última comprobación; no se debe afirmar que una fecha es hábil sin un calendario confiable.
L7. “una fecha al dia siguiente o al siguiente si existe feriado en la semana”. Pendiente aclarar si solo se permite el próximo día hábil o también fechas posteriores elegibles.
L8. “Correcto, asi es.” Confirma el ejemplo del siguiente día hábil; permanece sin precisar si también pueden elegirse días hábiles posteriores.
L9. “Solo se puede reservar para el proximo dia habil aunque mejor dejar libre otros dias por si recursos humanos lo solicita. Inicialmente sera solo el proximo dia habil.” La regla inicial limita al siguiente día hábil; se mantiene extensible sin habilitar fechas futuras adicionales.
L10. “Correcto, mostrar solo el script bien detallado y documentado para poder subir los dias feriados por año mes dia”. Recursos Humanos proporcionará y mantendrá los feriados; se entregó el script manual y el usuario lo guardó en `reserva-unilene-backend/scripts/feriados.sql`. No está confirmada su ejecución ni la cobertura del calendario.
L11. “OK guardo todo en engram, realiza los commits y deja preparado para continuar en otra session.” La interfaz previa fue rechazada y la implementación de recorrido, botones con estado real y reserva para el próximo día hábil sigue pendiente. Las pruebas de Playwright requieren que el usuario ingrese manualmente; no se deben registrar sus credenciales.
L12. El usuario eligió preparar una cadena de entregas sobre la rama de funcionalidad. Esta elección no autoriza crear ni publicar PR.
L13. Se guardó el backend de autenticación en `9154fc7` y las migraciones, el catálogo de puestos y el script manual de feriados en `aba4e77`. Las pruebas de backend 18/18, Node 5/5 y ejecutor de contenedores 5/5 pasaron antes de estos commits. La carga de feriados no está confirmada.
L14. El siguiente commit conserva la interfaz y la selección 3D anterior como avance pendiente, no como cumplimiento del rediseño solicitado. Falta implementar recorrido empresarial, botones 3D con estado real y reserva para el próximo día hábil; después, la comprobación visual debe esperar el inicio de sesión manual del usuario.
