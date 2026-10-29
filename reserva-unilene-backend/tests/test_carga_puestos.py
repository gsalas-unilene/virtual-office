"""Comprueba el catálogo propuesto sin ejecutar SQL ni modificar datos."""

import re
import json
from pathlib import Path


RUTA = Path(__file__).resolve().parents[1] / 'migraciones' / '0002_carga_puestos.sql'
MAPA = Path(__file__).resolve().parents[1] / 'migraciones' / 'mapa_puestos_plano.json'
PUESTOS = (
    [f'C{numero:03d}' for numero in range(38, 43)]
    + [f'C{numero:03d}' for numero in range(45, 47)]
    + [f'C{numero:03d}' for numero in range(49, 52)]
    + [f'C{numero:03d}' for numero in range(53, 55)]
    + [f'C{numero:03d}' for numero in range(60, 65)]
    + [f'C{numero:03d}' for numero in range(66, 69)]
    + [f'C{numero:03d}' for numero in range(72, 79)]
    + [f'C{numero:03d}' for numero in range(81, 88)]
    + [f'C{numero:03d}' for numero in range(96, 108)]
    + [f'C{numero:03d}' for numero in range(111, 115)]
)


def test_catalogo_contiene_los_50_puestos_marcados_sin_repetir():
    sql = RUTA.read_text(encoding='utf-8')
    puestos = re.findall(r"\('([0-9]+)'\)", sql)
    mapa = json.loads(MAPA.read_text(encoding='utf-8'))
    assert puestos == [str(numero) for numero in range(1, 51)]
    assert [item['numero'] for item in mapa] == list(range(1, 51))
    assert [item['codigo_plano'] for item in mapa] == PUESTOS
    assert len(puestos) == len(set(puestos)) == len(set(PUESTOS)) == 50


def test_verificacion_ordena_los_codigos_numericamente():
    archivo = RUTA.parent / 'verificacion' / '0002_carga_puestos.sql'
    sql = archivo.read_text(encoding='utf-8').upper()
    assert 'TRY_CONVERT(INT, CODIGO_PUESTO)' in sql


def test_carga_limita_destino_y_no_sobrescribe_datos():
    sql = RUTA.read_text(encoding='utf-8').upper()
    assert "DB_NAME() <> N'DW_VORTICEDATA'" in sql
    assert 'IF EXISTS (SELECT 1 FROM DBO.RU_PUESTO WITH (TABLOCKX, HOLDLOCK))' in sql
    assert '@@TRANCOUNT <> 0' in sql
    assert 'SET XACT_ABORT ON' in sql
    assert 'BEGIN TRANSACTION' in sql and 'COMMIT TRANSACTION' in sql
    assert 'ROLLBACK TRANSACTION' in sql
    assert 'DELETE ' not in sql and 'UPDATE ' not in sql and 'DROP ' not in sql
