# API de reservas UNILENE

Backend FastAPI administrado con `uv` y Python 3.14. La conexión con SQL Server
utiliza el controlador `mssql-python` de Microsoft.

## Configuración local

1. Use `credentials.example.sh` como referencia para configurar manualmente
   `credentials.sh`. Git ignora el archivo privado.
2. Inicie la API con `./run-dev.sh`.
3. Compruebe el servicio en `http://127.0.0.1:8000/health` y la conexión con
   la base en `http://127.0.0.1:8000/health/ready`.
4. Ejecute las pruebas con `uv run pytest`.

La conexión utiliza las variables `RESERVA_SQLSERVER_SERVER`,
`RESERVA_SQLSERVER_DATABASE`, `RESERVA_SQLSERVER_USER`,
`RESERVA_SQLSERVER_PASSWORD`, `RESERVA_SQLSERVER_ENCRYPT` y
`RESERVA_SQLSERVER_TRUST_SERVER_CERTIFICATE`. El inicio de sesión consulta un
usuario de SatelliteCore y valida la clave con `SECRET_KEY_LOGIN` en el backend.
Las credenciales y la clave no deben incorporarse a Angular.

Las migraciones se ejecutan manualmente: consulte `migraciones/README.md`.
Para la configuración de contenedores y sus límites, consulte `../CONTAINERS.md`.
