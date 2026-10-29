"""Comprobaciones estáticas; no ejecutan migraciones en SQL Server."""

from pathlib import Path


MIGRACION = Path(__file__).resolve().parents[1] / 'migraciones' / '0001_modelo_reservas.sql'


def texto():
    return MIGRACION.read_text(encoding='utf-8').upper()


def test_migracion_dirigida_a_base_explicita_sin_datos_iniciales():
    sql = texto()
    assert "DB_NAME() <> N'DW_VORTICEDATA'" in sql
    assert 'CREATE TABLE DBO.RU_PUESTO' in sql
    assert 'CREATE TABLE DBO.RU_RESERVA' in sql
    assert 'CREATE TABLE DBO.RU_FERIADO' in sql
    assert 'INSERT INTO' not in sql and 'DROP TABLE' not in sql


def test_reservas_activas_unicas_por_puesto_y_fecha():
    sql = texto()
    assert 'CREATE UNIQUE INDEX UX_RU_RESERVA_ACTIVA_PUESTO_FECHA' in sql
    assert 'ON DBO.RU_RESERVA (ID_PUESTO, FECHA_RESERVA)' in sql
    assert 'WHERE ESTA_ACTIVA = 1' in sql


def test_migracion_transaccional_rechaza_objetos_existentes():
    sql = texto()
    assert 'SET XACT_ABORT ON' in sql
    assert 'BEGIN TRANSACTION' in sql and 'COMMIT TRANSACTION' in sql
    assert 'ROLLBACK TRANSACTION' in sql
    assert "OBJECT_ID(N'DBO.RU_PUESTO'" in sql
    assert "OBJECT_ID(N'DBO.RU_RESERVA'" in sql
    assert "OBJECT_ID(N'DBO.RU_FERIADO'" in sql


def test_opciones_de_indice_filtrado_estan_declaradas():
    sql = texto()
    for option in ('ANSI_NULLS', 'ANSI_PADDING', 'ANSI_WARNINGS', 'ARITHABORT',
                   'CONCAT_NULL_YIELDS_NULL', 'QUOTED_IDENTIFIER'):
        assert f'SET {option} ON' in sql
    assert 'SET NUMERIC_ROUNDABORT OFF' in sql


def test_restricciones_del_modelo_traducido():
    sql = ' '.join(texto().split())
    for fragmento in (
        'ID_PUESTO INT IDENTITY(1,1) NOT NULL',
        'CODIGO_PUESTO VARCHAR(40) NOT NULL',
        'ID_USUARIO_ASIGNADO INT NULL',
        'FECHA_FERIADO DATE NOT NULL',
        'DESCRIPCION NVARCHAR(150) NOT NULL',
        'ID_RESERVA BIGINT IDENTITY(1,1) NOT NULL',
        'FOREIGN KEY (ID_PUESTO) REFERENCES DBO.RU_PUESTO (ID_PUESTO)',
        'ID_USUARIO >= 1',
        'ESTA_ACTIVA = 1 AND FECHA_CANCELACION_UTC IS NULL',
        'ESTA_ACTIVA = 0 AND FECHA_CANCELACION_UTC IS NOT NULL',
        'CREATE UNIQUE INDEX UX_RU_RESERVA_ACTIVA_PUESTO_FECHA '
        'ON DBO.RU_RESERVA (ID_PUESTO, FECHA_RESERVA) WHERE ESTA_ACTIVA = 1',
        'ON DBO.RU_RESERVA (ID_USUARIO, FECHA_RESERVA)',
    ):
        assert fragmento in sql
