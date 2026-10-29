#!/usr/bin/env bash
# Never enable tracing here: the operator-owned script exports secrets.
set +x
set +v
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
legacy_override="${RESERVA_ALLOW_LEGACY_TLS-}"
if (( $# )); then
  echo 'Usage: ./run.sh (configure exports in credentials.sh)' >&2
  exit 2
fi
if [[ ! -f "$root/reserva-unilene-backend/credentials.sh" ]]; then
  echo 'Missing backend credentials.sh; configure it manually from credentials.example.sh.' >&2
  exit 1
fi
set -a
source "$root/reserva-unilene-backend/credentials.sh" >/dev/null 2>&1
set +a
set +x
set +v

for name in RESERVA_SQLSERVER_SERVER RESERVA_SQLSERVER_DATABASE RESERVA_SQLSERVER_USER RESERVA_SQLSERVER_PASSWORD SECRET_KEY_LOGIN; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required export: %s\n' "$name" >&2
    exit 1
  fi
done
export RESERVA_ALLOW_LEGACY_TLS="${legacy_override:-${RESERVA_ALLOW_LEGACY_TLS:-0}}"
case "$RESERVA_ALLOW_LEGACY_TLS" in
  0) ;;
  1) echo 'WARNING: legacy TLS compatibility lowers backend TLS security. Use only with the legacy database.' >&2 ;;
  *) echo 'RESERVA_ALLOW_LEGACY_TLS must be 0 or 1.' >&2; exit 2 ;;
esac

# Fixed scope protects unrelated Compose projects. Do not print rendered config.
compose=(docker compose --project-name unilene-reservations --env-file /dev/null --file "$root/compose.yaml")
docker info >/dev/null 2>&1
"${compose[@]}" config --quiet
"${compose[@]}" down
"${compose[@]}" build
"${compose[@]}" up -d --wait --wait-timeout 90
echo 'Frontend: http://localhost:4200 | API: http://localhost:8000'
echo 'Database readiness is separate: http://localhost:8000/health/ready'
