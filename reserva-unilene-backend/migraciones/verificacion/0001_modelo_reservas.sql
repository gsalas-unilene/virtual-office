/* Verificación estructural de solo lectura; ejecutar en DW_VORTICEDATA después de la migración. */
SELECT DB_NAME() AS base_de_datos_actual;

SELECT s.name AS nombre_esquema, t.name AS nombre_tabla
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
WHERE s.name = N'dbo'
  AND t.name IN (N'RU_Puesto', N'RU_Feriado', N'RU_Reserva')
ORDER BY t.name;

SELECT t.name AS nombre_tabla, i.name AS nombre_indice, i.is_unique AS es_unico,
       i.has_filter AS tiene_filtro, i.filter_definition AS definicion_filtro
FROM sys.indexes AS i
JOIN sys.tables AS t ON t.object_id = i.object_id
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
WHERE s.name = N'dbo'
  AND t.name IN (N'RU_Puesto', N'RU_Feriado', N'RU_Reserva')
  AND i.name IS NOT NULL
ORDER BY t.name, i.name;

SELECT fk.name AS nombre_clave_foranea, OBJECT_NAME(fk.parent_object_id) AS nombre_tabla,
       OBJECT_NAME(fk.referenced_object_id) AS tabla_referenciada
FROM sys.foreign_keys AS fk
JOIN sys.tables AS t ON t.object_id = fk.parent_object_id
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
WHERE s.name = N'dbo' AND t.name = N'RU_Reserva';
