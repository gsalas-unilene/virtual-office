/*
   Migración 0004: store de notificación de reserva por Database Mail (SQL Server 2012).
   Seleccione DW_VORTICEDATA antes de ejecutar este lote completo.

   ANTES DE EJECUTAR: reemplace PERFIL_CORREO (2 apariciones) por el nombre del perfil de
   Database Mail que envía las notificaciones (msdb.dbo.sysmail_profile).

   El store recibe solo el usuario, el puesto y la fecha: el destinatario y el nombre se leen de
   dbo.RU_UsuarioCorreo, así el cliente nunca elige a quién se escribe. sp_send_dbmail encola el
   mensaje (no espera al servidor SMTP), por lo que la reserva no se retrasa.

   Permisos (los concede el DBA, no este script): el login del backend necesita EXECUTE sobre el
   store y un usuario en msdb miembro de DatabaseMailUserRole, y el store debe poder invocar
   msdb.dbo.sp_send_dbmail (por ejemplo con EXECUTE AS de un usuario con ese rol).
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'DW_VORTICEDATA'
BEGIN
    RAISERROR('Seleccione DW_VORTICEDATA antes de ejecutar la migracion 0004.', 16, 1);
    RETURN;
END;

IF OBJECT_ID(N'dbo.RU_UsuarioCorreo') IS NULL
BEGIN
    RAISERROR('Falta dbo.RU_UsuarioCorreo; ejecute antes la migracion 0003.', 16, 1);
    RETURN;
END;

IF OBJECT_ID(N'dbo.RU_EnviarCorreoReserva') IS NOT NULL
BEGIN
    RAISERROR('Ya existe dbo.RU_EnviarCorreoReserva; revise antes de continuar.', 16, 1);
    RETURN;
END;

IF NOT EXISTS (SELECT 1 FROM msdb.dbo.sysmail_profile WHERE name = N'PERFIL_CORREO')
BEGIN
    RAISERROR('El perfil de Database Mail PERFIL_CORREO no existe; corrija el nombre.', 16, 1);
    RETURN;
END;

EXEC (N'
CREATE PROCEDURE dbo.RU_EnviarCorreoReserva
    @cod_usuario int,
    @puesto varchar(40),
    @fecha date
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @correo nvarchar(254), @nombre nvarchar(200), @cuerpo nvarchar(max);

    SELECT @correo = correo, @nombre = nombre_completo
    FROM dbo.RU_UsuarioCorreo
    WHERE cod_usuario = @cod_usuario;

    IF @correo IS NULL RETURN;  -- sin correo corporativo no hay a quién notificar

    SET @cuerpo = N''Hola '' + @nombre + N'','' + CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10)
        + N''Tu reserva de puesto fue confirmada.'' + CHAR(13) + CHAR(10)
        + N''Puesto: '' + @puesto + CHAR(13) + CHAR(10)
        + N''Fecha: '' + CONVERT(nvarchar(10), @fecha, 103);

    EXEC msdb.dbo.sp_send_dbmail
        @profile_name = N''PERFIL_CORREO'',
        @recipients = @correo,
        @subject = N''Reserva de puesto confirmada'',
        @body = @cuerpo;
END');
