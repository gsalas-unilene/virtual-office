/*
   Migración 0002: catálogo inicial de los 50 puestos marcados en el plano.
   Fuente: seat-review/floor4-seats-to-mark.png y mapa_puestos_plano.json.
   Los códigos son números del 1 al 50; ejecución manual únicamente.
   Seleccione DW_VORTICEDATA y revise la correspondencia antes de ejecutar.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'DW_VORTICEDATA'
BEGIN
    RAISERROR('Seleccione DW_VORTICEDATA antes de ejecutar la migracion 0002.', 16, 1);
    RETURN;
END;

IF @@TRANCOUNT <> 0
BEGIN
    RAISERROR('Ejecute la migracion 0002 sin una transaccion abierta.', 16, 1);
    RETURN;
END;

IF OBJECT_ID(N'dbo.RU_Puesto', N'U') IS NULL
BEGIN
    RAISERROR('No existe dbo.RU_Puesto; revise la migracion 0001.', 16, 1);
    RETURN;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (SELECT 1 FROM dbo.RU_Puesto WITH (TABLOCKX, HOLDLOCK))
        RAISERROR('El catalogo de puestos no esta vacio; no se realizo ninguna carga.', 16, 1);

    INSERT INTO dbo.RU_Puesto (codigo_puesto)
    VALUES
        ('1'), ('2'), ('3'), ('4'), ('5'),
        ('6'), ('7'), ('8'), ('9'), ('10'),
        ('11'), ('12'), ('13'), ('14'), ('15'),
        ('16'), ('17'), ('18'), ('19'), ('20'),
        ('21'), ('22'), ('23'), ('24'), ('25'),
        ('26'), ('27'), ('28'), ('29'), ('30'),
        ('31'), ('32'), ('33'), ('34'), ('35'),
        ('36'), ('37'), ('38'), ('39'), ('40'),
        ('41'), ('42'), ('43'), ('44'), ('45'),
        ('46'), ('47'), ('48'), ('49'), ('50');

    IF @@ROWCOUNT <> 50
        RAISERROR('La carga no creo exactamente 50 puestos.', 16, 1);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
