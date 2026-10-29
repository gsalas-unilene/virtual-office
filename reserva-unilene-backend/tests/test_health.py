from fastapi.testclient import TestClient

from reserva_unilene_backend import main
from reserva_unilene_backend.main import app


client = TestClient(app)


def test_health_check_does_not_require_database() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_database_readiness_is_unavailable_without_required_settings(
    monkeypatch,
) -> None:
    for name in (
        "RESERVA_SQLSERVER_SERVER",
        "RESERVA_SQLSERVER_DATABASE",
        "RESERVA_SQLSERVER_USER",
        "RESERVA_SQLSERVER_PASSWORD",
    ):
        monkeypatch.delenv(name, raising=False)

    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "dependency": "database"}


def test_database_readiness_closes_a_successful_connection(monkeypatch) -> None:
    class Connection:
        closed = False

        def close(self) -> None:
            self.closed = True

    connection = Connection()
    monkeypatch.setattr(main, "connect_to_database", lambda: connection)

    response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "dependency": "database"}
    assert connection.closed


def test_database_failure_does_not_leak_driver_details(monkeypatch) -> None:
    monkeypatch.setattr(
        main,
        "connect_to_database",
        lambda: (_ for _ in ()).throw(RuntimeError("PWD=private-value")),
    )

    response = client.get("/health/ready")

    assert response.status_code == 503
    assert "private-value" not in response.text


def test_database_connection_builds_string_from_environment_variables(monkeypatch) -> None:
    from reserva_unilene_backend import database

    values = {
        "RESERVA_SQLSERVER_SERVER": "db.example,1433",
        "RESERVA_SQLSERVER_DATABASE": "UNILENE",
        "RESERVA_SQLSERVER_USER": "seat-app",
        "RESERVA_SQLSERVER_PASSWORD": "pa;ss}word",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)

    captured: list[str] = []
    monkeypatch.setattr(database.mssql_python, "connect", lambda value: captured.append(value) or object())

    database.connect_to_database()

    assert captured == [
        "Server={db.example,1433};Database={UNILENE};UID={seat-app};"
        "PWD={pa;ss}}word};Encrypt=yes;TrustServerCertificate=no;Authentication=SqlPassword;"
    ]


def test_database_connection_rejects_invalid_encryption_options(monkeypatch) -> None:
    from reserva_unilene_backend import database

    for name, value in {
        "RESERVA_SQLSERVER_SERVER": "db.example",
        "RESERVA_SQLSERVER_DATABASE": "UNILENE",
        "RESERVA_SQLSERVER_USER": "seat-app",
        "RESERVA_SQLSERVER_PASSWORD": "synthetic-only",
    }.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setenv("RESERVA_SQLSERVER_ENCRYPT", "yes;PWD=attacker")

    try:
        database.connect_to_database()
    except RuntimeError as error:
        assert "RESERVA_SQLSERVER_ENCRYPT" in str(error)
    else:
        raise AssertionError("invalid encryption settings must be rejected")
