#!/usr/bin/env bash
# Sincroniza dbo.RU_UsuarioCorreo. Sin argumentos usa RESERVA_CORREOS_CSV y solo SIMULA.
#   Prueba manual:  ./run-sync-correos.sh --csv ./correos.csv
#   Escritura real: ./run-sync-correos.sh --csv ./correos.csv --aplicar
#   Cron nocturno:  30 2 * * * /ruta/reserva-unilene-backend/run-sync-correos.sh --aplicar >> /var/log/sync_correos.log 2>&1
set -euo pipefail

backend_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
credentials_file="${RESERVA_CREDENTIALS_FILE:-${backend_dir}/credentials.sh}"
[[ -f "${credentials_file}" ]] || { printf 'Missing credentials script: %s\n' "${credentials_file}" >&2; exit 1; }

set -a
source "${credentials_file}"
set +a

cd "${backend_dir}"
# Mismo criterio que el contenedor (docker/entrypoint.sh): TLS antiguo solo para este proceso, nunca para el sistema.
if [[ "${RESERVA_ALLOW_LEGACY_TLS:-0}" == "1" ]]; then
  export OPENSSL_CONF="${backend_dir}/docker/openssl-legacy.cnf"
  echo 'WARNING: legacy TLS compatibility enabled for this process.' >&2
fi
args=("$@")
if [[ " $* " != *" --csv "* ]]; then args=(--csv "${RESERVA_CORREOS_CSV:?Defina RESERVA_CORREOS_CSV o pase --csv}" "$@"); fi
exec uv run python -m reserva_unilene_backend.sync_correos "${args[@]}"
