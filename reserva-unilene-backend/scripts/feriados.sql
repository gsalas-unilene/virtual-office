/*
    CARGA MANUAL DE FERIADOS
    Compatible con SQL Server 2012.

    INSTRUCCIONES
    1. Seleccione la base de datos DW_VORTICEDATA en SSMS.
    2. Complete la sección "FERIADOS A CARGAR" con la lista aprobada
       por Recursos Humanos: año, mes, día y descripción.
    3. Ejecute el script completo como un único lote.
    4. Revise el resultado final.

    IMPORTANTE
    - Los ejemplos están comentados: no se cargan automáticamente.
    - Si una fecha es inválida o está duplicada, se cancela la carga.
    - Si una fecha ya existe en la tabla, no se modifica ni se sobrescribe.
    - La carga se realiza en una transacción: se insertan todos los
      feriados indicados o ninguno.
    - Antes de habilitar las reservas, Recursos Humanos debe confirmar
      que la lista de feriados cubre todas las fechas necesarias.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Evita ejecutar la carga en una base de datos distinta.
IF DB_NAME() <> N'DW_VORTICEDATA'
BEGIN
    RAISERROR(
        'Seleccione DW_VORTICEDATA antes de cargar los feriados.',
        16,
        1
    );
    RETURN;
END;

-- Evita afectar una transacción abierta por otra operación.
IF @@TRANCOUNT <> 0
BEGIN
    RAISERROR(
        'Ejecute este script sin una transaccion abierta.',
        16,
        1
    );
    RETURN;
END;

-- Comprueba que exista la tabla creada por la migración inicial.
IF OBJECT_ID(N'dbo.RU_Feriado', N'U') IS NULL
BEGIN
    RAISERROR(
        'No existe dbo.RU_Feriado. Revise la migracion 0001.',
        16,
        1
    );
    RETURN;
END;

DECLARE @Feriados TABLE (
    anio        int           NOT NULL,
    mes         int           NOT NULL,
    dia         int           NOT NULL,
    descripcion nvarchar(150) NOT NULL
);

/*
    FERIADOS A CARGAR

    Descomente el INSERT y reemplace los ejemplos por las fechas
    aprobadas. Puede agregar tantas filas como necesite.

    INSERT INTO @Feriados (anio, mes, dia, descripcion)
    VALUES
        (2027, 1, 1, N'Año Nuevo'),
        (2027, 12, 25, N'Navidad');
*/

-- Impide ejecutar accidentalmente el script sin datos.
IF NOT EXISTS (SELECT 1 FROM @Feriados)
BEGIN
    RAISERROR(
        'No se ingresaron feriados. Complete la seccion FERIADOS A CARGAR.',
        16,
        1
    );
    RETURN;
END;

-- Valida los rangos y que la descripción no esté vacía.
IF EXISTS (
    SELECT 1
    FROM @Feriados
    WHERE anio NOT BETWEEN 1 AND 9999
       OR mes NOT BETWEEN 1 AND 12
       OR dia NOT BETWEEN 1 AND 31
       OR LEN(LTRIM(RTRIM(descripcion))) = 0
)
BEGIN
    RAISERROR(
        'Revise el anio, mes, dia y descripcion de los feriados.',
        16,
        1
    );
    RETURN;
END;

-- Construye las fechas en formato YYYYMMDD, independiente del idioma
-- y de la configuración regional de la sesión.
DECLARE @Fechas TABLE (
    fecha_feriado date          NULL,
    descripcion   nvarchar(150) NOT NULL
);

INSERT INTO @Fechas (fecha_feriado, descripcion)
SELECT
    TRY_CONVERT(
        date,
        RIGHT('0000' + CONVERT(varchar(4), anio), 4)
        + RIGHT('00' + CONVERT(varchar(2), mes), 2)
        + RIGHT('00' + CONVERT(varchar(2), dia), 2),
        112
    ),
    LTRIM(RTRIM(descripcion))
FROM @Feriados;

-- Detecta fechas imposibles, por ejemplo el 30 de febrero.
IF EXISTS (
    SELECT 1
    FROM @Fechas
    WHERE fecha_feriado IS NULL
)
BEGIN
    RAISERROR(
        'Hay una fecha invalida. Revise los dias de cada mes.',
        16,
        1
    );
    RETURN;
END;

-- Detecta fechas repetidas dentro de la lista proporcionada.
IF EXISTS (
    SELECT fecha_feriado
    FROM @Fechas
    GROUP BY fecha_feriado
    HAVING COUNT(*) > 1
)
BEGIN
    RAISERROR(
        'Hay fechas repetidas en la lista. Corrijalas antes de continuar.',
        16,
        1
    );
    RETURN;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    /*
        Bloquea las fechas consultadas durante la transacción.

        Si alguna fecha ya existe, se cancela toda la carga para evitar
        cambios parciales o sobrescribir información de Recursos Humanos.
    */
    IF EXISTS (
        SELECT 1
        FROM dbo.RU_Feriado AS existente WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN @Fechas AS nueva
            ON nueva.fecha_feriado = existente.fecha_feriado
    )
    BEGIN
        ;THROW 50001,
            'Al menos una fecha ya existe en RU_Feriado. No se cargo ningun registro.',
            1;
    END;

    INSERT INTO dbo.RU_Feriado (fecha_feriado, descripcion)
    SELECT fecha_feriado, descripcion
    FROM @Fechas;

    COMMIT TRANSACTION;

    -- Resultado de los feriados incluidos en esta ejecución.
    SELECT
        guardado.fecha_feriado,
        guardado.descripcion
    FROM dbo.RU_Feriado AS guardado
    INNER JOIN @Fechas AS cargado
        ON cargado.fecha_feriado = guardado.fecha_feriado
    ORDER BY guardado.fecha_feriado;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;