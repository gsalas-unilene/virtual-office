"""Reserva de puestos para el próximo día hábil (sábados, domingos y feriados de RU_Feriado excluidos)."""

import os
import re
from datetime import date, timedelta

from reserva_unilene_backend.database import connect_to_database

PUESTO_UNICO = "UX_RU_Reserva_activa_puesto_fecha"
BASE_VARIABLE = "RESERVA_BASE_RESERVAS"


class ReservaError(Exception):
    """Regla de negocio incumplida; `codigo` viaja al cliente, nunca el detalle del driver."""

    def __init__(self, codigo: str, estado: int):
        super().__init__(codigo)
        self.codigo = codigo
        self.estado = estado


def _ejecutar(cursor, sql: str, *parametros):
    """Las tablas RU_ viven en DW_VORTICEDATA y el backend se conecta a otra base: se califican por nombre."""
    base = os.getenv(BASE_VARIABLE, "DW_VORTICEDATA").strip()
    if not re.fullmatch(r"[A-Za-z0-9_]+", base):
        raise RuntimeError(f"{BASE_VARIABLE} must be a plain database name")
    cursor.execute(sql.replace("dbo.RU_", f"{base}.dbo.RU_"), *parametros)


def siguiente_dia_habil(hoy: date, feriados: set[date]) -> date:
    dia = hoy + timedelta(days=1)
    while dia.weekday() >= 5 or dia in feriados:
        dia += timedelta(days=1)
    return dia


def _fecha(valor) -> date:
    return valor if type(valor) is date else date.fromisoformat(str(valor)[:10])


def _fecha_objetivo(cursor) -> tuple[date, bool]:
    """Próximo día hábil según la fecha del servidor SQL y si hay feriados cargados."""
    _ejecutar(cursor, "SELECT CAST(GETDATE() AS date)")
    hoy = _fecha(cursor.fetchone()[0])
    _ejecutar(cursor, "SELECT fecha_feriado FROM dbo.RU_Feriado WHERE fecha_feriado > ? AND fecha_feriado <= DATEADD(day, 60, ?)", hoy, hoy)
    feriados = {_fecha(fila[0]) for fila in cursor.fetchall()}
    _ejecutar(cursor, "SELECT COUNT(*) FROM dbo.RU_Feriado")
    return siguiente_dia_habil(hoy, feriados), cursor.fetchone()[0] > 0


def estado(id_usuario: int) -> dict:
    connection = connect_to_database()
    try:
        cursor = connection.cursor()
        fecha, feriados_cargados = _fecha_objetivo(cursor)
        _ejecutar(cursor, 
            "SELECT p.codigo_puesto, r.id_usuario FROM dbo.RU_Reserva r "
            "JOIN dbo.RU_Puesto p ON p.id_puesto = r.id_puesto WHERE r.fecha_reserva = ? AND r.esta_activa = 1",
            fecha,
        )
        filas = cursor.fetchall()
        mio = next((int(codigo) for codigo, usuario in filas if usuario == id_usuario), None)
        ocupados = sorted(int(codigo) for codigo, usuario in filas if usuario != id_usuario)
        return {"fecha": fecha.isoformat(), "feriados_cargados": feriados_cargados, "ocupados": ocupados, "mio": mio}
    finally:
        connection.close()


def reservar(id_usuario: int, numero: int) -> dict:
    connection = connect_to_database()
    try:
        cursor = connection.cursor()
        fecha, _ = _fecha_objetivo(cursor)
        try:
            _ejecutar(cursor, 
                "INSERT INTO dbo.RU_Reserva (id_puesto, id_usuario, fecha_reserva) "
                "SELECT p.id_puesto, ?, ? FROM dbo.RU_Puesto p WHERE p.codigo_puesto = ? AND p.esta_habilitado = 1 "
                "AND NOT EXISTS (SELECT 1 FROM dbo.RU_Reserva u WITH (UPDLOCK, HOLDLOCK) "
                "WHERE u.id_usuario = ? AND u.fecha_reserva = ? AND u.esta_activa = 1)",
                id_usuario, fecha, str(numero), id_usuario, fecha,
            )
            insertadas = cursor.rowcount
        except Exception as error:
            connection.rollback()
            if PUESTO_UNICO in str(error):
                raise ReservaError("ocupado", 409) from None
            raise
        if insertadas != 1:
            connection.rollback()
            _ejecutar(cursor, "SELECT 1 FROM dbo.RU_Reserva WHERE id_usuario = ? AND fecha_reserva = ? AND esta_activa = 1", id_usuario, fecha)
            if cursor.fetchone():
                raise ReservaError("ya_tienes", 409)
            raise ReservaError("puesto_invalido", 404)
        connection.commit()
        return {"fecha": fecha.isoformat(), "numero": numero}
    finally:
        connection.close()


def cancelar(id_usuario: int) -> None:
    connection = connect_to_database()
    try:
        cursor = connection.cursor()
        fecha, _ = _fecha_objetivo(cursor)
        _ejecutar(cursor, 
            "UPDATE dbo.RU_Reserva SET esta_activa = 0, fecha_cancelacion_utc = SYSUTCDATETIME() "
            "WHERE id_usuario = ? AND fecha_reserva = ? AND esta_activa = 1",
            id_usuario, fecha,
        )
        if cursor.rowcount != 1:
            connection.rollback()
            raise ReservaError("sin_reserva", 404)
        connection.commit()
    finally:
        connection.close()
