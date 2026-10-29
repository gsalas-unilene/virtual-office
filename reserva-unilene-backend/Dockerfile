# syntax=docker/dockerfile:1
FROM ghcr.io/astral-sh/uv:0.12.17 AS uv
FROM python:3.14-slim-bookworm AS builder
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_PYTHON_DOWNLOADS=0 UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-editable

FROM python:3.14-slim-bookworm AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 libltdl7 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home app
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY --from=builder /app/.venv /app/.venv
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/backend-entrypoint
COPY docker/openssl-legacy.cnf /etc/ssl/openssl-legacy.cnf
USER 10001
EXPOSE 8000
ENTRYPOINT ["backend-entrypoint"]
CMD ["uvicorn", "reserva_unilene_backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
