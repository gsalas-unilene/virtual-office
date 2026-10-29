# UNILENE reservation API

FastAPI backend managed with `uv` and Python 3.14. The SQL Server connection uses Microsoft's `mssql-python` driver.

## Local setup

1. Use `credentials.example.sh` as the variable-name reference and manually configure `credentials.sh`. Git ignores the private file.
2. Start the API with `./run-dev.sh`.
3. Check API liveness at `http://127.0.0.1:8000/health` and database connectivity at `http://127.0.0.1:8000/health/ready`.
4. Run tests with `uv run pytest`.

The connection settings are `RESERVA_SQLSERVER_SERVER`, `RESERVA_SQLSERVER_DATABASE`, `RESERVA_SQLSERVER_USER`, `RESERVA_SQLSERVER_PASSWORD`, `RESERVA_SQLSERVER_ENCRYPT`, and `RESERVA_SQLSERVER_TRUST_SERVER_CERTIFICATE`. The Angular application contains only the public API URL, never database credentials or legacy decryption keys. No user-table queries or login behavior are implemented until its schema and encryption format are confirmed.
