/*
   Migración 0001: modelo de reserva de puestos UNILENE (SQL Server 2012).
   Seleccione DW_VORTICEDATA antes de ejecutar este lote completo.
   No incluye USE, GO, datos iniciales, cambios de usuarios ni borrado de datos.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

IF DB_NAME() <> N'DW_VORTICEDATA'
BEGIN
    RAISERROR('Seleccione DW_VORTICEDATA antes de ejecutar la migracion 0001.', 16, 1);
    RETURN;
END;

IF OBJECT_ID(N'dbo.RU_Puesto') IS NOT NULL
    OR OBJECT_ID(N'dbo.RU_Reserva') IS NOT NULL
    OR OBJECT_ID(N'dbo.RU_Feriado') IS NOT NULL
BEGIN
    RAISERROR('Ya existe un objeto de la migracion 0001; revise antes de continuar.', 16, 1);
    RETURN;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    CREATE TABLE dbo.RU_Puesto (
        id_puesto int IDENTITY(1,1) NOT NULL,
        codigo_puesto varchar(40) NOT NULL,
        esta_habilitado bit NOT NULL CONSTRAINT DF_RU_Puesto_habilitado DEFAULT (1),
        id_usuario_asignado int NULL,
        fecha_creacion_utc datetime2(0) NOT NULL CONSTRAINT DF_RU_Puesto_creacion DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_RU_Puesto PRIMARY KEY (id_puesto),
        CONSTRAINT UQ_RU_Puesto_codigo UNIQUE (codigo_puesto),
        CONSTRAINT CK_RU_Puesto_codigo CHECK (LEN(LTRIM(RTRIM(codigo_puesto))) > 0),
        CONSTRAINT CK_RU_Puesto_usuario_asignado CHECK (id_usuario_asignado IS NULL OR id_usuario_asignado >= 1)
    );

    CREATE TABLE dbo.RU_Feriado (
        fecha_feriado date NOT NULL,
        descripcion nvarchar(150) NOT NULL,
        CONSTRAINT PK_RU_Feriado PRIMARY KEY (fecha_feriado),
        CONSTRAINT CK_RU_Feriado_descripcion CHECK (LEN(LTRIM(RTRIM(descripcion))) > 0)
    );

    CREATE TABLE dbo.RU_Reserva (
        id_reserva bigint IDENTITY(1,1) NOT NULL,
        id_puesto int NOT NULL,
        id_usuario int NOT NULL,
        fecha_reserva date NOT NULL,
        esta_activa bit NOT NULL CONSTRAINT DF_RU_Reserva_activa DEFAULT (1),
        fecha_creacion_utc datetime2(0) NOT NULL CONSTRAINT DF_RU_Reserva_creacion DEFAULT (SYSUTCDATETIME()),
        fecha_cancelacion_utc datetime2(0) NULL,
        CONSTRAINT PK_RU_Reserva PRIMARY KEY (id_reserva),
        CONSTRAINT FK_RU_Reserva_Puesto FOREIGN KEY (id_puesto) REFERENCES dbo.RU_Puesto (id_puesto),
        CONSTRAINT CK_RU_Reserva_usuario CHECK (id_usuario >= 1),
        CONSTRAINT CK_RU_Reserva_cancelacion CHECK (
            (esta_activa = 1 AND fecha_cancelacion_utc IS NULL)
            OR (esta_activa = 0 AND fecha_cancelacion_utc IS NOT NULL)
        )
    );

    CREATE UNIQUE INDEX UX_RU_Reserva_activa_puesto_fecha
        ON dbo.RU_Reserva (id_puesto, fecha_reserva)
        WHERE esta_activa = 1;

    CREATE INDEX IX_RU_Reserva_usuario_fecha
        ON dbo.RU_Reserva (id_usuario, fecha_reserva);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
