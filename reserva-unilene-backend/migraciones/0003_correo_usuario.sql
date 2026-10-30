/*
   Migración 0003: correo corporativo y permiso de reserva por usuario (SQL Server 2012).
   Seleccione DW_VORTICEDATA antes de ejecutar este lote completo.
   No toca SatelliteCore ni carga datos: el correo corporativo y `rotar` los
   carga manualmente el responsable (TBMUsuario guarda correos personales).
   Puede reservar solo quien tenga correo corporativo y rotar = 1.
   La tabla la mantiene el script sincronizar_correos (primera carga y cron nocturno).
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'DW_VORTICEDATA'
BEGIN
    RAISERROR('Seleccione DW_VORTICEDATA antes de ejecutar la migracion 0003.', 16, 1);
    RETURN;
END;

IF OBJECT_ID(N'dbo.RU_UsuarioCorreo') IS NOT NULL
BEGIN
    RAISERROR('Ya existe dbo.RU_UsuarioCorreo; revise antes de continuar.', 16, 1);
    RETURN;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    CREATE TABLE dbo.RU_UsuarioCorreo (
        cod_usuario int NOT NULL,            -- SatelliteCore.dbo.TBMUsuario.CodUsuario
        usuario varchar(100) NOT NULL,       -- SatelliteCore.dbo.TBMUsuario.USUARIO
        nombre_completo nvarchar(200) NOT NULL,
        correo nvarchar(254) NULL,           -- correo corporativo (@unilene.com), cargado desde el CSV; NULL = sin correo
        rotar bit NOT NULL CONSTRAINT DF_RU_UsuarioCorreo_rotar DEFAULT (0), -- 1 = puede reservar
        CONSTRAINT PK_RU_UsuarioCorreo PRIMARY KEY (cod_usuario),
        CONSTRAINT CK_RU_UsuarioCorreo_cod CHECK (cod_usuario >= 1),
        CONSTRAINT CK_RU_UsuarioCorreo_correo CHECK (correo IS NULL OR correo LIKE N'_%@unilene.com'),
        CONSTRAINT CK_RU_UsuarioCorreo_nombre CHECK (LEN(LTRIM(RTRIM(nombre_completo))) > 0)
    );

    -- Un correo corporativo pertenece a un solo usuario (las notificaciones no se mezclan).
    CREATE UNIQUE INDEX UX_RU_UsuarioCorreo_correo
        ON dbo.RU_UsuarioCorreo (correo)
        WHERE correo IS NOT NULL;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

/* Carga manual puntual (normalmente la hace el script de sincronización):
INSERT INTO dbo.RU_UsuarioCorreo (cod_usuario, usuario, nombre_completo, correo, rotar)
VALUES (123, 'jperez', N'Juan Pérez', N'jperez@unilene.com', 1);
*/
