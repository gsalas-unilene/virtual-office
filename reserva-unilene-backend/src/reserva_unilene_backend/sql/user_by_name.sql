SELECT CodUsuario, USUARIO, Clave
FROM SatelliteCore..TBMUsuario
WHERE CodUsuario >= 1 AND USUARIO = ?
