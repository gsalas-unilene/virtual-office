#!/usr/bin/env bash
set -euo pipefail

backend_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
credentials_file="${RESERVA_CREDENTIALS_FILE:-${backend_dir}/credentials.sh}"

if [[ ! -f "${credentials_file}" ]]; then
  printf 'Missing credentials script: %s\n' "${credentials_file}" >&2
  exit 1
fi

set -a
# The operator-owned local script is intentionally not checked into Git.
source "${credentials_file}"
set +a

cd "${backend_dir}"
exec uv run uvicorn reserva_unilene_backend.main:app --reload --host 127.0.0.1 --port 8000
