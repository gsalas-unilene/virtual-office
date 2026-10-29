#!/bin/sh
set -eu
case "${RESERVA_ALLOW_LEGACY_TLS:-0}" in
  0) ;;
  1)
    export OPENSSL_CONF=/etc/ssl/openssl-legacy.cnf
    echo 'WARNING: backend legacy TLS compatibility enabled.' >&2
    ;;
  *) echo 'RESERVA_ALLOW_LEGACY_TLS must be 0 or 1.' >&2; exit 2 ;;
esac
exec "$@"
