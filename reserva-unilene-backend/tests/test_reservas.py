from datetime import date

import pytest

from fastapi.testclient import TestClient

from reserva_unilene_backend import main, reservas


def test_siguiente_dia_habil_salta_fin_de_semana_y_feriados():
    assert reservas.siguiente_dia_habil(date(2026, 10, 29), set()) == date(2026, 10, 30)  # jueves → viernes
    assert reservas.siguiente_dia_habil(date(2026, 10, 30), set()) == date(2026, 11, 2)  # viernes → lunes
    assert reservas.siguiente_dia_habil(date(2026, 10, 29), {date(2026, 10, 30)}) == date(2026, 11, 2)
    assert reservas.siguiente_dia_habil(date(2026, 10, 30), {date(2026, 11, 2), date(2026, 11, 3)}) == date(2026, 11, 4)


def _cliente_autenticado(monkeypatch):
    main._sessions['t'] = (10**12, 'test-user', 7)
    client = TestClient(main.app)
    client.cookies.set('unilene_session', 't')
    return client


def test_reservas_exigen_sesion_y_usan_el_usuario_de_la_sesion(monkeypatch):
    with TestClient(main.app) as anonimo:
        assert anonimo.get('/reservas/estado').status_code == 401
        assert anonimo.post('/reservas', json={'numero': 1}).status_code == 401
        assert anonimo.delete('/reservas/mia').status_code == 401
    llamadas = []
    monkeypatch.setattr(reservas, 'estado', lambda uid, dia='siguiente': llamadas.append(('estado', uid, dia)) or {'fecha': '2026-10-30', 'feriados_cargados': True, 'ocupados': [2], 'mio': None})
    monkeypatch.setattr(reservas, 'reservar', lambda uid, n: llamadas.append(('reservar', uid, n)) or {'fecha': '2026-10-30', 'numero': n})
    monkeypatch.setattr(reservas, 'cancelar', lambda uid: llamadas.append(('cancelar', uid)))
    with _cliente_autenticado(monkeypatch) as client:
        assert client.get('/reservas/estado').json()['ocupados'] == [2]
        creada = client.post('/reservas', json={'numero': 12})
        assert creada.status_code == 201 and creada.json() == {'fecha': '2026-10-30', 'numero': 12}
        assert client.delete('/reservas/mia').status_code == 204
    assert llamadas == [('estado', 7, 'siguiente'), ('reservar', 7, 12), ('cancelar', 7)]


def test_reservas_rechaza_numeros_fuera_del_catalogo(monkeypatch):
    with _cliente_autenticado(monkeypatch) as client:
        assert client.post('/reservas', json={'numero': 0}).status_code == 422
        assert client.post('/reservas', json={'numero': 51}).status_code == 422


def test_reservas_traduce_reglas_y_oculta_fallas(monkeypatch):
    def ocupado(uid, n):
        raise reservas.ReservaError('ocupado', 409)
    def caido(uid, dia='siguiente'):
        raise RuntimeError('detalle-sensible-del-driver')
    monkeypatch.setattr(reservas, 'reservar', ocupado)
    monkeypatch.setattr(reservas, 'estado', caido)
    with _cliente_autenticado(monkeypatch) as client:
        assert client.post('/reservas', json={'numero': 3}).json() == {'detail': 'ocupado'}
        fallo = client.get('/reservas/estado')
        assert fallo.status_code == 503 and 'detalle-sensible' not in fallo.text


def test_las_tablas_se_califican_con_la_base_de_reservas(monkeypatch):
    enviados = []

    class Cursor:
        def execute(self, sql, *parametros):
            enviados.append(sql)

    monkeypatch.delenv('RESERVA_BASE_RESERVAS', raising=False)
    reservas._ejecutar(Cursor(), 'SELECT * FROM dbo.RU_Puesto p JOIN dbo.RU_Reserva r ON 1=1')
    assert enviados[-1] == 'SELECT * FROM DW_VORTICEDATA.dbo.RU_Puesto p JOIN DW_VORTICEDATA.dbo.RU_Reserva r ON 1=1'
    monkeypatch.setenv('RESERVA_BASE_RESERVAS', 'OTRA_BD')
    reservas._ejecutar(Cursor(), 'SELECT 1 FROM dbo.RU_Feriado')
    assert enviados[-1] == 'SELECT 1 FROM OTRA_BD.dbo.RU_Feriado'
    monkeypatch.setenv('RESERVA_BASE_RESERVAS', 'x; DROP TABLE y')
    with pytest.raises(RuntimeError):
        reservas._ejecutar(Cursor(), 'SELECT 1 FROM dbo.RU_Feriado')


def test_estado_acepta_hoy_o_siguiente_y_rechaza_otro_valor(monkeypatch):
    dias = []
    monkeypatch.setattr(reservas, 'estado', lambda uid, dia='siguiente': dias.append(dia) or {'fecha': '2026-10-30', 'feriados_cargados': True, 'ocupados': [], 'mio': None})
    with _cliente_autenticado(monkeypatch) as client:
        assert client.get('/reservas/estado').status_code == 200
        assert client.get('/reservas/estado?dia=hoy').status_code == 200
        assert client.get('/reservas/estado?dia=ayer').status_code == 422
    assert dias == ['siguiente', 'hoy']


def test_fecha_objetivo_hoy_no_salta_al_siguiente_dia_habil():
    class Cursor:
        def __init__(self): self.consulta = ''
        def execute(self, sql, *args): self.consulta = sql
        def fetchone(self): return (date(2026, 10, 30),) if 'GETDATE' in self.consulta else (1,)
        def fetchall(self): return []
    assert reservas._fecha_objetivo(Cursor(), 'hoy')[0] == date(2026, 10, 30)
    assert reservas._fecha_objetivo(Cursor())[0] == date(2026, 11, 2)


def _conexion(monkeypatch, habilitado):
    """Conexión falsa: responde 1 fila a la consulta de permiso solo si `habilitado`."""
    consultas = []

    class Cursor:
        rowcount = 0
        def execute(self, sql, *args): consultas.append(sql)
        def fetchone(self): return (1,) if habilitado else None
        def fetchall(self): return []

    class Conexion:
        def cursor(self): return Cursor()
        def close(self): pass
        def rollback(self): pass

    monkeypatch.setattr(reservas, 'connect_to_database', lambda: Conexion())
    return consultas


def test_sin_correo_corporativo_y_rotar_no_puede_ver_siguiente_ni_reservar(monkeypatch):
    consultas = _conexion(monkeypatch, habilitado=False)
    for accion in (lambda: reservas.estado(7, 'siguiente'), lambda: reservas.reservar(7, 3)):
        with pytest.raises(reservas.ReservaError) as error:
            accion()
        assert (error.value.codigo, error.value.estado) == ('no_habilitado', 403)
    assert all('RU_UsuarioCorreo' in sql for sql in consultas)  # no tocó fechas ni reservas
    assert 'rotar = 1' in consultas[0] and 'LEN(LTRIM(RTRIM(correo))) > 0' in consultas[0]


def test_sin_permiso_puede_consultar_hoy_con_puede_reservar_falso(monkeypatch):
    _conexion(monkeypatch, habilitado=False)
    monkeypatch.setattr(reservas, '_fecha_objetivo', lambda cursor, dia='siguiente': (date(2026, 10, 30), True))
    resultado = reservas.estado(7, 'hoy')
    assert resultado['puede_reservar'] is False and resultado['fecha'] == '2026-10-30'


def _reservar_con_store(monkeypatch, falla_store):
    """Reserva exitosa con conexión falsa; el store de correo puede fallar."""
    enviados, confirmaciones = [], []

    class Cursor:
        rowcount = 1
        def execute(self, sql, *args):
            enviados.append((sql, args))
            if falla_store and 'RU_EnviarCorreoReserva' in sql:
                raise RuntimeError('smtp caido')

    class Conexion:
        def cursor(self): return Cursor()
        def commit(self): confirmaciones.append(len(enviados))
        def rollback(self): pass
        def close(self): pass

    monkeypatch.setattr(reservas, 'connect_to_database', lambda: Conexion())
    monkeypatch.setattr(reservas, '_puede_reservar', lambda cursor, uid: True)
    monkeypatch.setattr(reservas, '_fecha_objetivo', lambda cursor, dia='siguiente': (date(2026, 11, 2), True))
    return reservas.reservar(7, 12), enviados, confirmaciones


def test_reserva_confirmada_notifica_con_usuario_puesto_y_fecha(monkeypatch):
    resultado, enviados, confirmaciones = _reservar_con_store(monkeypatch, falla_store=False)
    assert resultado == {'fecha': '2026-11-02', 'numero': 12}
    sql, args = enviados[-1]
    assert 'EXEC DW_VORTICEDATA.dbo.RU_EnviarCorreoReserva' in sql and args == (7, '12', date(2026, 11, 2))
    assert len(confirmaciones) == 2  # primero la reserva, después el envío


def test_falla_del_correo_no_deshace_ni_rompe_la_reserva(monkeypatch):
    resultado, _, confirmaciones = _reservar_con_store(monkeypatch, falla_store=True)
    assert resultado == {'fecha': '2026-11-02', 'numero': 12}
    assert len(confirmaciones) == 1  # la reserva se confirmó antes del intento de envío
