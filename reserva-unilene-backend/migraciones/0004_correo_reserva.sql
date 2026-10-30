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

EXEC (N'CREATE OR ALTER PROCEDURE dbo.RU_EnviarCorreoReserva
    @cod_usuario INT,
    @puesto VARCHAR(40),
    @fecha DATE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE
        @correo NVARCHAR(254),
        @nombre NVARCHAR(200),
        @cuerpo NVARCHAR(MAX),
        @fecha_formateada NVARCHAR(50),
        @puesto_html NVARCHAR(200),
        @nombre_html NVARCHAR(1000);

    -- =====================================================
    -- 1. Obtener información del usuario
    -- =====================================================

    SELECT
        @correo = correo,
        @nombre = nombre_completo
    FROM dbo.RU_UsuarioCorreo
    WHERE cod_usuario = @cod_usuario;

    IF NULLIF(LTRIM(RTRIM(@correo)), N'') IS NULL
        RETURN;

    -- =====================================================
    -- 2. Formatear información
    -- =====================================================

    SET @fecha_formateada =
        FORMAT(@fecha, 'dddd, dd ''de'' MMMM ''de'' yyyy', 'es-ES');

    -- Escapar caracteres especiales para HTML
    SET @nombre_html = ISNULL(@nombre, N'Usuario');

    SET @nombre_html = REPLACE(@nombre_html, '&', '&amp;');
    SET @nombre_html = REPLACE(@nombre_html, '<', '&lt;');
    SET @nombre_html = REPLACE(@nombre_html, '>', '&gt;');
    SET @nombre_html = REPLACE(@nombre_html, '"', '&quot;');
    SET @nombre_html = REPLACE(@nombre_html, '''', '&#39;');

    SET @puesto_html = CONVERT(NVARCHAR(200), @puesto);

    SET @puesto_html = REPLACE(@puesto_html, '&', '&amp;');
    SET @puesto_html = REPLACE(@puesto_html, '<', '&lt;');
    SET @puesto_html = REPLACE(@puesto_html, '>', '&gt;');
    SET @puesto_html = REPLACE(@puesto_html, '"', '&quot;');
    SET @puesto_html = REPLACE(@puesto_html, '''', '&#39;');

    -- =====================================================
    -- 3. Construir correo HTML
    -- =====================================================

    SET @cuerpo = N'
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>

<body style="
    margin:0;
    padding:30px 15px;
    background-color:#f3f6fa;
    font-family:Arial,Helvetica,sans-serif;
    color:#334155;
">

<table role="presentation"
       width="100%"
       cellpadding="0"
       cellspacing="0"
       border="0">

<tr>
<td align="center">

    <!-- CONTENEDOR PRINCIPAL -->
    <table role="presentation"
           width="600"
           cellpadding="0"
           cellspacing="0"
           border="0"
           style="
                width:100%;
                max-width:600px;
                background-color:#ffffff;
                border-radius:12px;
                overflow:hidden;
                border:1px solid #e2e8f0;
           ">

        <!-- ENCABEZADO -->
        <tr>
            <td style="
                background-color:#17365d;
                padding:30px;
                text-align:center;
            ">

                <h1 style="
                    color:#ffffff;
                    font-size:24px;
                    margin:0;
                    font-weight:600;
                ">
                    Reserva de Asientos
                </h1>

                <p style="
                    color:#cbd5e1;
                    font-size:14px;
                    margin:10px 0 0 0;
                ">
                    Sistema de Gestión de Espacios de Trabajo
                </p>

            </td>
        </tr>

        <!-- CONTENIDO -->
        <tr>
            <td style="padding:35px 35px 20px 35px;">

                <!-- ESTADO -->
                <table role="presentation"
                       width="100%"
                       cellpadding="0"
                       cellspacing="0"
                       border="0"
                       style="
                           background-color:#ecfdf5;
                           border:1px solid #a7f3d0;
                           border-radius:8px;
                       ">

                    <tr>
                        <td style="
                            padding:16px;
                            text-align:center;
                            color:#047857;
                            font-size:17px;
                            font-weight:bold;
                        ">
                            &#10003; Reserva confirmada
                        </td>
                    </tr>

                </table>

                <p style="
                    font-size:16px;
                    margin-top:30px;
                    line-height:1.6;
                ">
                    Hola, <strong>' + @nombre_html + N'</strong>:
                </p>

                <p style="
                    font-size:15px;
                    line-height:1.7;
                    color:#475569;
                ">
                    Te informamos que tu reserva de puesto de trabajo
                    se ha registrado correctamente en nuestro sistema.
                </p>

                <p style="
                    font-size:15px;
                    line-height:1.7;
                    color:#475569;
                ">
                    A continuación, encontrarás los detalles
                    de tu reserva:
                </p>

                <!-- DETALLE DE RESERVA -->
                <table role="presentation"
                       width="100%"
                       cellpadding="0"
                       cellspacing="0"
                       border="0"
                       style="
                           margin-top:25px;
                           background-color:#f8fafc;
                           border:1px solid #e2e8f0;
                           border-radius:8px;
                       ">

                    <tr>
                        <td colspan="2"
                            style="
                                padding:18px 20px;
                                font-size:16px;
                                font-weight:bold;
                                color:#17365d;
                                border-bottom:1px solid #e2e8f0;
                            ">
                            Detalles de tu reserva
                        </td>
                    </tr>

                    <tr>
                        <td style="
                            padding:15px 20px;
                            font-size:14px;
                            color:#64748b;
                            width:40%;
                        ">
                            Puesto asignado
                        </td>

                        <td style="
                            padding:15px 20px;
                            font-size:15px;
                            font-weight:bold;
                            color:#0f172a;
                        ">
                            ' + @puesto_html + N'
                        </td>
                    </tr>

                    <tr>
                        <td style="
                            padding:15px 20px;
                            font-size:14px;
                            color:#64748b;
                            border-top:1px solid #e2e8f0;
                        ">
                            Fecha de reserva
                        </td>

                        <td style="
                            padding:15px 20px;
                            font-size:15px;
                            font-weight:bold;
                            color:#0f172a;
                            border-top:1px solid #e2e8f0;
                        ">
                            ' + @fecha_formateada + N'
                        </td>
                    </tr>

                    <tr>
                        <td style="
                            padding:15px 20px;
                            font-size:14px;
                            color:#64748b;
                            border-top:1px solid #e2e8f0;
                        ">
                            Estado
                        </td>

                        <td style="
                            padding:15px 20px;
                            font-size:14px;
                            font-weight:bold;
                            color:#059669;
                            border-top:1px solid #e2e8f0;
                        ">
                            CONFIRMADA
                        </td>
                    </tr>

                </table>

                <!-- RECOMENDACIONES -->
                <h3 style="
                    color:#17365d;
                    font-size:16px;
                    margin-top:30px;
                ">
                    Recomendaciones importantes
                </h3>

                <ul style="
                    padding-left:20px;
                    color:#475569;
                    font-size:14px;
                    line-height:1.9;
                ">
                    <li>
                        Verifica el puesto asignado antes
                        de acudir a las instalaciones.
                    </li>

                    <li>
                        Utiliza únicamente el espacio de
                        trabajo correspondiente a tu reserva.
                    </li>

                    <li>
                        Mantén el espacio limpio y ordenado
                        durante y después de su uso.
                    </li>
                    
                </ul>

                <!-- AVISO -->
                <table role="presentation"
                       width="100%"
                       cellpadding="0"
                       cellspacing="0"
                       border="0"
                       style="
                           margin-top:25px;
                           background-color:#eff6ff;
                           border-left:4px solid #2563eb;
                       ">

                    <tr>
                        <!-- <td style="
                            padding:16px;
                            font-size:13px;
                            color:#1e40af;
                            line-height:1.7;
                        ">
                            <strong>Importante:</strong><br>
                            Esta notificación confirma tu reserva
                            para la fecha indicada.
                            Si necesitas modificarla o cancelarla,
                            ingresa a la aplicación
                            Reserva de Asientos.
                        </td> -->
                    </tr>

                </table>

                <p style="
                    margin-top:10px;
                    font-size:14px;
                    line-height:1.7;
                ">
                    Gracias por contribuir al uso eficiente
                    y organizado de nuestros espacios de trabajo.
                </p>

                <p style="
                    font-size:14px;
                    line-height:1.7;
                ">
                    Saludos cordiales,<br>
                    <strong>Sistema Reserva de Asientos</strong><br>
                </p>

            </td>
        </tr>

        <!-- PIE DE PÁGINA -->
        <tr>
            <td style="
                background-color:#f8fafc;
                padding:25px;
                text-align:center;
                border-top:1px solid #e2e8f0;
            ">

                <p style="
                    font-size:12px;
                    color:#64748b;
                    margin:0;
                    line-height:1.7;
                ">
                    Este es un correo automático generado por
                    el Sistema de Reserva de Asientos.
                    <br>
                    Por favor, no respondas a este mensaje.
                </p>

                <p style="
                    font-size:11px;
                    color:#94a3b8;
                    margin-top:15px;
                ">
                    © ' + CONVERT(NVARCHAR(4), YEAR(GETDATE())) + N'
                    | Reserva de Asientos
                </p>

            </td>
        </tr>

    </table>

</td>
</tr>
</table>
</body>
</html>';

    -- =====================================================
    -- 4. Enviar correo
    -- =====================================================

    EXEC msdb.dbo.sp_send_dbmail
        @profile_name = N'PERFIL_CORREO',
        @recipients = @correo,
        @subject = N'Reserva de puesto confirmada | Reserva de Asientos',
        @body = @cuerpo,
        @body_format = 'HTML';

END');
