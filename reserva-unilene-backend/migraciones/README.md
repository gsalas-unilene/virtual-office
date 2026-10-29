# Migraciones de la base de datos de reservas

El responsable de la base de datos ejecuta estos scripts manualmente; la
aplicación no aplica migraciones. `0001_modelo_reservas.sql` está dirigido a
**DW_VORTICEDATA** y utiliza el esquema existente `dbo`. Rechaza una base
distinta o la existencia de objetos con los mismos nombres. No carga datos
iniciales ni modifica `SatelliteCore`.

## Ejecución

1. Revise el script y realice la copia de seguridad exigida por su política de base de datos.
2. En SQL Server Management Studio, seleccione `DW_VORTICEDATA` y confirme que
   la conexión corresponde al servidor esperado. Ejecute el script completo
   como un único lote, sin insertar `GO`.
3. Después, ejecute `verificacion/0001_modelo_reservas.sql`; comparta solamente
   los resultados estructurales, nunca credenciales ni filas de usuarios.
4. Mantenga inmutables las migraciones aplicadas. Agregue los cambios posteriores
   en scripts numerados (`0002_...sql`, etc.); no vuelva a ejecutar ni editar
   una migración aplicada.

La migración es transaccional y falla intencionalmente si ya existe cualquiera
de los objetos. No elimine objetos ni reintente una implementación parcial sin
investigarla. El script no revierte automáticamente datos posteriores.

## Modelo y límites

| Objeto | Propósito |
| --- | --- |
| `dbo.RU_Puesto` | Código único estable, estado de habilitación y usuario asignado opcional. Solo deben registrarse puestos aprobados. |
| `dbo.RU_Feriado` | Fechas excluidas de las reservas; no se cargan feriados inicialmente. |
| `dbo.RU_Reserva` | Relación de puesto y usuario por día completo, con historial de cancelaciones. |

El índice único filtrado impide dos reservas **activas** para el mismo puesto
y fecha, incluso ante inserciones simultáneas. Las canceladas permanecen en el
historial y dejan disponible el puesto para esa fecha. No se impone una regla
de una reserva por usuario y día porque aún no está confirmada.

`id_usuario` e `id_usuario_asignado` representan el campo existente
`SatelliteCore.dbo.TBMUsuario.CodUsuario` (`int`). SQL Server no permite claves
foráneas entre bases de datos. La aplicación deberá validar el usuario antes de
escribir y contemplar cambios o eliminaciones posteriores en SatelliteCore.
Estas tablas no duplican credenciales, nombres de usuario ni hashes.

La migración 0001 **no carga los 50 puestos**. La migración manual
`0002_carga_puestos.sql` numera los códigos del 1 al 50. La correspondencia
con los códigos originales del plano `seat-review/floor4-seats-to-mark.png`
está en `mapa_puestos_plano.json`, en orden ascendente del código del plano.
Revise esa correspondencia antes de ejecutarla. La numeración es el valor de
`codigo_puesto`, no una garantía sobre el orden de los valores `id_puesto`.
La carga exige que el catálogo esté vacío y no permite una
transacción abierta; si el catálogo contiene puestos, se detiene sin cambiarlos.
Después de aplicarla, ejecute `verificacion/0002_carga_puestos.sql`. Estos
códigos aún deben vincularse con el modelo 3D en la aplicación.

El modelo tampoco valida días hábiles, feriados,
puestos inhabilitados, elegibilidad por asignación ni permisos de cancelación.
La futura lógica de reservas deberá validar estas reglas y coordinar los
cambios concurrentes mediante transacciones. El horario de referencia
08:00–17:30 no libera automáticamente las reservas.

Los índices filtrados requieren `ANSI_NULLS`, `ANSI_PADDING`, `ANSI_WARNINGS`,
`ARITHABORT`, `CONCAT_NULL_YIELDS_NULL` y `QUOTED_IDENTIFIER` en ON, y
`NUMERIC_ROUNDABORT` en OFF, en las conexiones que modifican la tabla indexada.
La migración configura estas opciones para su conexión; las futuras conexiones
de escritura también deberán aplicarlas.
