import hashlib
import hmac

from fastapi.testclient import TestClient

from reserva_unilene_backend import main


def test_login_validates_password_and_creates_session(monkeypatch):
    monkeypatch.setenv('SECRET_KEY_LOGIN', 'synthetic-key')
    digest = hmac.new(b'synthetic-key', b'example', hashlib.sha512).hexdigest()
    stored = hashlib.sha256(digest.encode()).hexdigest()
    monkeypatch.setattr(main, 'lookup_user', lambda username: (7, 'test-user', stored))
    with TestClient(main.app) as client:
        result = client.post('/auth/login', json={'username': 'test-user', 'password': 'example'})
        assert result.status_code == 200
        assert stored not in result.text and 'example' not in result.text
        assert client.get('/auth/session').status_code == 200
        assert client.post('/auth/logout').status_code == 204
        assert client.get('/auth/session').status_code == 401


def test_login_rejects_bad_password_and_unknown_user(monkeypatch):
    monkeypatch.setenv('SECRET_KEY_LOGIN', 'synthetic-key')
    monkeypatch.setattr(main, 'lookup_user', lambda username: None)
    with TestClient(main.app) as client:
        assert client.post('/auth/login', json={'username': 'nobody', 'password': 'bad'}).status_code == 401
        assert client.get('/auth/session').status_code == 401


def test_login_does_not_expose_backend_failures(monkeypatch):
    monkeypatch.setenv('SECRET_KEY_LOGIN', 'synthetic-key')
    def fail(username):
        raise RuntimeError('sensitive-driver-detail')
    monkeypatch.setattr(main, 'lookup_user', fail)
    with TestClient(main.app) as client:
        result = client.post('/auth/login', json={'username': 'test-user', 'password': 'example'})
        assert result.status_code == 503
        assert 'sensitive-driver-detail' not in result.text


def test_login_validation_never_echoes_password():
    password = 'synthetic-password-' * 100
    with TestClient(main.app) as client:
        result = client.post('/auth/login', json={'username': 'alice', 'password': password})
        assert result.status_code == 422
        assert password not in result.text
