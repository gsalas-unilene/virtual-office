SELECT u.CodUsuario, u.USUARIO, p.NombreCompleto
FROM SatelliteCore..TBMUsuario u
INNER JOIN PROD_UNILENE2..PersonaMast p ON p.persona = u.CodUsuario
WHERE u.CodUsuario >= 1