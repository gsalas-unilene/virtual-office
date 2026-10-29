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
    monkeypatch.setattr(reservas, 'estado', lambda uid: llamadas.append(('estado', uid)) or {'fecha': '2026-10-30', 'feriados_cargados': True, 'ocupados': [2], 'mio': None})
    monkeypatch.setattr(reservas, 'reservar', lambda uid, n: llamadas.append(('reservar', uid, n)) or {'fecha': '2026-10-30', 'numero': n})
    monkeypatch.setattr(reservas, 'cancelar', lambda uid: llamadas.append(('cancelar', uid)))
    with _cliente_autenticado(monkeypatch) as client:
        assert client.get('/reservas/estado').json()['ocupados'] == [2]
        creada = client.post('/reservas', json={'numero': 12})
        assert creada.status_code == 201 and creada.json() == {'fecha': '2026-10-30', 'numero': 12}
        assert client.delete('/reservas/mia').status_code == 204
    assert llamadas == [('estado', 7), ('reservar', 7, 12), ('cancelar', 7)]


def test_reservas_rechaza_numeros_fuera_del_catalogo(monkeypatch):
    with _cliente_autenticado(monkeypatch) as client:
        assert client.post('/reservas', json={'numero': 0}).status_code == 422
        assert client.post('/reservas', json={'numero': 51}).status_code == 422


def test_reservas_traduce_reglas_y_oculta_fallas(monkeypatch):
    def ocupado(uid, n):
        raise reservas.ReservaError('ocupado', 409)
    def caido(uid):
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
