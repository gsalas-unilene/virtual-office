/* Verificación de solo lectura: ejecutar en DW_VORTICEDATA después de la carga. */
SELECT DB_NAME() AS base_de_datos_actual;

SELECT COUNT_BIG(*) AS total_puestos,
       SUM(CASE WHEN esta_habilitado = 1 THEN CONVERT(bigint, 1) ELSE CONVERT(bigint, 0) END) AS puestos_habilitados,
       SUM(CASE WHEN id_usuario_asignado IS NOT NULL THEN CONVERT(bigint, 1) ELSE CONVERT(bigint, 0) END) AS puestos_asignados
FROM dbo.RU_Puesto;

SELECT codigo_puesto, esta_habilitado,
       CASE WHEN id_usuario_asignado IS NULL THEN 0 ELSE 1 END AS tiene_usuario_asignado
FROM dbo.RU_Puesto
ORDER BY CASE WHEN TRY_CONVERT(int, codigo_puesto) IS NULL THEN 1 ELSE 0 END,
         TRY_CONVERT(int, codigo_puesto), codigo_puesto;
