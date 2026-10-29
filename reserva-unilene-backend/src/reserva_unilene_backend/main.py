"""FastAPI application entry point."""

import logging
import os
import hmac
import secrets
import threading
import time

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from reserva_unilene_backend.database import connect_to_database
from reserva_unilene_backend import reservas
from reserva_unilene_backend.encript import encrypt_password
from reserva_unilene_backend.users import lookup_user


def _cors_origins() -> list[str]:
    configured = os.getenv("RESERVA_CORS_ORIGINS", "http://localhost:4200")
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


app = FastAPI(title="UNILENE Seat Reservations API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    if request.url.path == '/auth/login':
        return JSONResponse(status_code=422, content={'detail': 'Invalid login request'})
    return await request_validation_exception_handler(request, error)

_sessions: dict[str, tuple[float, str, int]] = {}
_session_lock = threading.Lock()
_SESSION_SECONDS = 8 * 60 * 60


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=1, max_length=1024)


def _session_user(request: Request):
    token = request.cookies.get('unilene_session', '')
    now = time.monotonic()
    with _session_lock:
        session = _sessions.get(token)
        if session and session[0] > now:
            return session[1], session[2]
        _sessions.pop(token, None)
    return None


@app.post('/auth/login')
def login(payload: LoginRequest):
    try:
        calculated = encrypt_password(payload.password)
        user = lookup_user(payload.username)
        stored = user[2].strip() if user and isinstance(user[2], str) else ''
        if not hmac.compare_digest(calculated, stored):
            return JSONResponse(status_code=401, content={'detail': 'Invalid credentials'})
        token = secrets.token_urlsafe(32)
        now = time.monotonic()
        with _session_lock:
            for old in [key for key, value in _sessions.items() if value[0] <= now]:
                del _sessions[old]
            _sessions[token] = (now + _SESSION_SECONDS, str(user[1]), int(user[0]))
        response = JSONResponse({'username': str(user[1])})
        response.set_cookie('unilene_session', token, httponly=True, samesite='strict',
                            secure=os.getenv('RESERVA_SECURE_COOKIE', '0') == '1',
                            max_age=_SESSION_SECONDS, path='/')
        response.headers['Cache-Control'] = 'no-store'
        return response
    except Exception:
        return JSONResponse(status_code=503, content={'detail': 'Authentication unavailable'})


@app.get('/auth/session')
def session(request: Request):
    identity = _session_user(request)
    if identity is None:
        return JSONResponse(status_code=401, content={'detail': 'Authentication required'})
    return JSONResponse({'username': identity[0]}, headers={'Cache-Control': 'no-store'})


class ReservaRequest(BaseModel):
    numero: int = Field(ge=1, le=50)


def _con_reservas(request: Request, action, status_code: int = 200):
    """Ejecuta una acción de reservas para el usuario de la sesión; las fallas del driver no se exponen."""
    identity = _session_user(request)
    if identity is None:
        return JSONResponse(status_code=401, content={'detail': 'Authentication required'})
    try:
        result = action(identity[1])
    except reservas.ReservaError as error:
        return JSONResponse(status_code=error.estado, content={'detail': error.codigo})
    except Exception as error:
        logging.getLogger('uvicorn.error').error('reservas: %s: %.300s', type(error).__name__, error)
        return JSONResponse(status_code=503, content={'detail': 'Reservations unavailable'})
    if result is None:
        return Response(status_code=204)
    return JSONResponse(result, status_code=status_code, headers={'Cache-Control': 'no-store'})


@app.get('/reservas/estado')
def reservas_estado(request: Request):
    return _con_reservas(request, reservas.estado)


@app.post('/reservas')
def reservas_crear(payload: ReservaRequest, request: Request):
    return _con_reservas(request, lambda user_id: reservas.reservar(user_id, payload.numero), 201)


@app.delete('/reservas/mia')
def reservas_cancelar(request: Request):
    return _con_reservas(request, reservas.cancelar)


@app.post('/auth/logout', status_code=204)
def logout(request: Request):
    with _session_lock:
        _sessions.pop(request.cookies.get('unilene_session', ''), None)
    response = Response(status_code=204)
    response.delete_cookie('unilene_session', path='/')
    return response


@app.get("/health")
def health() -> dict[str, str]:
    """Report API liveness without depending on SQL Server."""
    return {"status": "ok"}


@app.get("/health/ready")
def readiness():
    """Check SQL Server connectivity without returning driver diagnostics."""
    try:
        connection = connect_to_database()
        connection.close()
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "dependency": "database"},
        )

    return {"status": "ready", "dependency": "database"}
