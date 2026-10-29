"""SQL Server connectivity via Microsoft's mssql-python driver."""

import os

import mssql_python


SERVER_VARIABLE = "RESERVA_SQLSERVER_SERVER"
DATABASE_VARIABLE = "RESERVA_SQLSERVER_DATABASE"
USER_VARIABLE = "RESERVA_SQLSERVER_USER"
PASSWORD_VARIABLE = "RESERVA_SQLSERVER_PASSWORD"
ENCRYPT_VARIABLE = "RESERVA_SQLSERVER_ENCRYPT"
TRUST_CERTIFICATE_VARIABLE = "RESERVA_SQLSERVER_TRUST_SERVER_CERTIFICATE"


def _required_value(name: str, *, preserve_whitespace: bool = False) -> str:
    value = os.getenv(name, "")
    if not value.strip():
        raise RuntimeError(f"{name} is not configured")
    return value if preserve_whitespace else value.strip()


def _connection_value(value: str) -> str:
    """Brace an ODBC connection-string value and escape embedded closing braces."""
    return "{" + value.replace("}", "}}") + "}"


def _security_option(name: str, default: str, allowed: set[str]) -> str:
    value = os.getenv(name, default).strip().lower()
    if value not in allowed:
        choices = ", ".join(sorted(allowed))
        raise RuntimeError(f"{name} must be one of: {choices}")
    return value


def connect_to_database():
    """Connect using individual backend-only SQL Server environment variables."""
    server = _required_value(SERVER_VARIABLE)
    database = _required_value(DATABASE_VARIABLE)
    user = _required_value(USER_VARIABLE)
    password = _required_value(PASSWORD_VARIABLE, preserve_whitespace=True)
    encrypt = _security_option(ENCRYPT_VARIABLE, "yes", {"yes", "no", "strict"})
    trust_certificate = _security_option(TRUST_CERTIFICATE_VARIABLE, "no", {"yes", "no"})

    connection_string = ";".join(
        (
            f"Server={_connection_value(server)}",
            f"Database={_connection_value(database)}",
            f"UID={_connection_value(user)}",
            f"PWD={_connection_value(password)}",
            f"Encrypt={encrypt}",
            f"TrustServerCertificate={trust_certificate}",
            "Authentication=SqlPassword",
        )
    ) + ";"

    return mssql_python.connect(connection_string)
