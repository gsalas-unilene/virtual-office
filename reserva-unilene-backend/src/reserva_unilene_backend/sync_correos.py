"""Sincroniza dbo.RU_UsuarioCorreo con la consulta de usuarios y el CSV de correos corporativos.

Sin TRUNCATE: se compara contra lo que hay y solo se inserta/actualiza lo que cambió, en una
transacción. Una falla a mitad de camino no deja la tabla vacía (los usuarios no pierden el permiso
de reservar) y los cambios del día son los únicos que se escriben.

Uso (por defecto solo simula; `--aplicar` escribe):
    python -m reserva_unilene_backend.sync_correos --csv correos.csv [--aplicar] [--consulta usuarios.sql]
"""

import argparse
import csv
import sys
from importlib.resources import files
from pathlib import Path

from reserva_unilene_backend.database import connect_to_database
from reserva_unilene_backend.reservas import _ejecutar

DOMINIO = "@unilene.com"


class SincronizacionError(Exception):
    """Entrada inválida: se aborta sin tocar la base."""


def leer_csv(ruta) -> dict[str, tuple[str | None, int]]:
    """CSV con columnas usuario,correo,rotar (coma o punto y coma) → {usuario en minúsculas: (correo|None, rotar)}."""
    texto = Path(ruta).read_text(encoding="utf-8-sig")
    cabecera = texto.splitlines()[0] if texto.strip() else ""
    delimitador = ";" if cabecera.count(";") > cabecera.count(",") else ","
    lector = csv.DictReader(texto.splitlines(), delimiter=delimitador)
    columnas = {(c or "").strip().lower() for c in lector.fieldnames or []}
    if not {"usuario", "correo", "rotar"} <= columnas:
        raise SincronizacionError("El CSV debe tener las columnas: usuario, correo, rotar")
    datos, correos = {}, set()
    for numero, fila in enumerate(lector, start=2):
        fila = {(k or "").strip().lower(): (v or "").strip() for k, v in fila.items()}
        usuario, correo, rotar = fila["usuario"].lower(), fila["correo"].lower(), fila["rotar"]
        if not usuario:
            raise SincronizacionError(f"CSV línea {numero}: usuario vacío")
        if usuario in datos:
            raise SincronizacionError(f"CSV línea {numero}: usuario repetido «{usuario}»")
        if rotar not in ("0", "1"):
            raise SincronizacionError(f"CSV línea {numero}: rotar debe ser 0 o 1")
        if correo and not correo.endswith(DOMINIO):
            raise SincronizacionError(f"CSV línea {numero}: el correo debe terminar en {DOMINIO}")
        if rotar == "1" and not correo:
            raise SincronizacionError(f"CSV línea {numero}: rotar = 1 requiere correo corporativo")
        if correo and correo in correos:
            raise SincronizacionError(f"CSV línea {numero}: correo repetido «{correo}»")
        correos.add(correo)
        datos[usuario] = (correo or None, int(rotar))
    return datos


def planificar(usuarios, csv_datos, actuales) -> dict:
    """usuarios: [(cod, usuario, nombre)]; actuales: {cod: (usuario, nombre, correo, rotar)} → cambios a aplicar."""
    if not usuarios:
        raise SincronizacionError("La consulta no devolvió usuarios; se aborta para no desactivar a todos")
    plan = {"insertar": [], "actualizar": [], "desactivar": [], "csv_sin_usuario": []}
    vistos = set()
    for cod, usuario, nombre in usuarios:
        vistos.add(cod)
        correo, rotar = csv_datos.get(usuario.lower(), (None, 0))
        fila = (cod, usuario, nombre or usuario, correo, rotar)
        if cod not in actuales:
            plan["insertar"].append(fila)
        elif actuales[cod] != fila[1:]:
            plan["actualizar"].append(fila)
    # Quien ya no aparece en la consulta (baja) conserva su fila pero pierde el permiso.
    plan["desactivar"] = [cod for cod, fila in actuales.items() if cod not in vistos and fila[3] == 1]
    conocidos = {usuario.lower() for _, usuario, _ in usuarios}
    plan["csv_sin_usuario"] = sorted(set(csv_datos) - conocidos)
    return plan


def _leer_usuarios(cursor, consulta: str):
    cursor.execute(consulta)
    return [(int(f[0]), str(f[1]).strip(), (str(f[2]).strip() if f[2] is not None else "")) for f in cursor.fetchall()]


def _leer_actuales(cursor):
    _ejecutar(cursor, "SELECT cod_usuario, usuario, nombre_completo, correo, rotar FROM dbo.RU_UsuarioCorreo")
    return {int(c): (u, n, correo, int(r)) for c, u, n, correo, r in cursor.fetchall()}


def aplicar(cursor, plan: dict) -> None:
    for cod, usuario, nombre, correo, rotar in plan["insertar"]:
        _ejecutar(cursor, "INSERT INTO dbo.RU_UsuarioCorreo (cod_usuario, usuario, nombre_completo, correo, rotar) VALUES (?, ?, ?, ?, ?)",
                  cod, usuario, nombre, correo, rotar)
    for cod, usuario, nombre, correo, rotar in plan["actualizar"]:
        _ejecutar(cursor, "UPDATE dbo.RU_UsuarioCorreo SET usuario = ?, nombre_completo = ?, correo = ?, rotar = ? WHERE cod_usuario = ?",
                  usuario, nombre, correo, rotar, cod)
    for cod in plan["desactivar"]:
        _ejecutar(cursor, "UPDATE dbo.RU_UsuarioCorreo SET rotar = 0 WHERE cod_usuario = ?", cod)


def sincronizar(ruta_csv, consulta: str, escribir: bool) -> dict:
    csv_datos = leer_csv(ruta_csv)
    connection = connect_to_database()
    try:
        cursor = connection.cursor()
        plan = planificar(_leer_usuarios(cursor, consulta), csv_datos, _leer_actuales(cursor))
        if escribir:
            try:
                aplicar(cursor, plan)
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        return plan
    finally:
        connection.close()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--csv", required=True, help="CSV con columnas usuario,correo,rotar")
    parser.add_argument("--consulta", help="Archivo .sql de usuarios (por defecto sql/usuarios_sync.sql del paquete)")
    parser.add_argument("--aplicar", action="store_true", help="Escribe los cambios; sin esta opción solo se simula")
    args = parser.parse_args(argv)
    consulta = (Path(args.consulta).read_text(encoding="utf-8") if args.consulta
                else files("reserva_unilene_backend").joinpath("sql/usuarios_sync.sql").read_text(encoding="utf-8"))
    try:
        plan = sincronizar(args.csv, consulta, args.aplicar)
    except SincronizacionError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    modo = "APLICADO" if args.aplicar else "SIMULACIÓN (sin cambios; use --aplicar)"
    print(f"{modo}: insertar={len(plan['insertar'])} actualizar={len(plan['actualizar'])} "
          f"desactivar={len(plan['desactivar'])} csv_sin_usuario={len(plan['csv_sin_usuario'])}")
    for usuario in plan["csv_sin_usuario"]:
        print(f"AVISO: «{usuario}» está en el CSV pero no en la consulta de usuarios")
    return 0


if __name__ == "__main__":
    sys.exit(main())
