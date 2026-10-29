"""Read a single legacy account without logging credentials."""

from importlib.resources import files

from reserva_unilene_backend.database import connect_to_database


def lookup_user(username: str):
    query = files('reserva_unilene_backend').joinpath('sql/user_by_name.sql').read_text(encoding='utf-8')
    connection = connect_to_database()
    try:
        cursor = connection.cursor()
        try:
            cursor.execute(query, username)
            rows = cursor.fetchmany(2)
            return rows[0] if len(rows) == 1 else None
        finally:
            cursor.close()
    finally:
        connection.close()
