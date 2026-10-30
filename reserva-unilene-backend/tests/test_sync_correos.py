import pytest

from reserva_unilene_backend import sync_correos as sync
from reserva_unilene_backend.sync_correos import SincronizacionError, leer_csv, planificar


def _csv(tmp_path, texto):
    ruta = tmp_path / 'correos.csv'
    ruta.write_text(texto, encoding='utf-8-sig')
    return ruta


def test_csv_acepta_coma_o_punto_y_coma_y_correo_vacio(tmp_path):
    esperado = {'jperez': ('jperez@unilene.com', 1), 'mlopez': (None, 0)}
    assert leer_csv(_csv(tmp_path, 'usuario,correo,rotar\nJPerez,JPerez@Unilene.com,1\nmlopez,,0\n')) == esperado
    assert leer_csv(_csv(tmp_path, 'usuario;correo;rotar\njperez;jperez@unilene.com;1\nmlopez;;0\n')) == esperado


@pytest.mark.parametrize('cuerpo', [
    'a,a@gmail.com,0',            # dominio ajeno
    'a,,1',                       # rotar sin correo
    'a,a@unilene.com,2',          # rotar fuera de 0/1
    'a,a@unilene.com,1\na,b@unilene.com,0',   # usuario repetido
    'a,x@unilene.com,1\nb,x@unilene.com,1',   # correo repetido
])
def test_csv_invalido_aborta(tmp_path, cuerpo):
    with pytest.raises(SincronizacionError):
        leer_csv(_csv(tmp_path, f'usuario,correo,rotar\n{cuerpo}\n'))


def test_planificar_inserta_actualiza_desactiva_sin_truncar():
    usuarios = [(1, 'jperez', 'Juan Pérez'), (2, 'mlopez', 'Maria Lopez'), (4, 'nuevo', 'Nuevo Ingreso')]
    csv_datos = {'jperez': ('jperez@unilene.com', 1), 'mlopez': ('mlopez@unilene.com', 0), 'fantasma': ('f@unilene.com', 1)}
    actuales = {
        1: ('jperez', 'Juan Pérez', 'jperez@unilene.com', 1),   # sin cambios
        2: ('mlopez', 'Maria Lopez', None, 0),                  # recibe correo
        3: ('baja', 'Ex Empleado', 'baja@unilene.com', 1),      # ya no está en la consulta
    }
    plan = planificar(usuarios, csv_datos, actuales)
    assert plan['insertar'] == [(4, 'nuevo', 'Nuevo Ingreso', None, 0)]
    assert plan['actualizar'] == [(2, 'mlopez', 'Maria Lopez', 'mlopez@unilene.com', 0)]
    assert plan['desactivar'] == [3]
    assert plan['csv_sin_usuario'] == ['fantasma']


def test_consulta_vacia_aborta_para_no_desactivar_a_todos():
    with pytest.raises(SincronizacionError):
        planificar([], {}, {1: ('a', 'A', 'a@unilene.com', 1)})


def test_simulacion_no_escribe_ni_confirma(tmp_path, monkeypatch):
    ejecutadas, confirmaciones = [], []

    class Cursor:
        def execute(self, sql, *args): ejecutadas.append(sql)
        def fetchall(self): return [(1, 'jperez', 'Juan')] if 'TBMUsuario' in ejecutadas[-1] else []

    class Conexion:
        def cursor(self): return Cursor()
        def commit(self): confirmaciones.append(1)
        def rollback(self): pass
        def close(self): pass

    monkeypatch.setattr(sync, 'connect_to_database', lambda: Conexion())
    ruta = _csv(tmp_path, 'usuario,correo,rotar\njperez,jperez@unilene.com,1\n')
    plan = sync.sincronizar(ruta, 'SELECT * FROM TBMUsuario', escribir=False)
    assert len(plan['insertar']) == 1 and not confirmaciones
    assert not any(sql.startswith('INSERT') for sql in ejecutadas)
    sync.sincronizar(ruta, 'SELECT * FROM TBMUsuario', escribir=True)
    assert confirmaciones == [1] and any(sql.startswith('INSERT') for sql in ejecutadas)
