#!/usr/bin/env bash
# Copy these variable names/values into your private credentials.sh manually.
# Do not commit credentials.sh or put database secrets in Angular.

export RESERVA_SQLSERVER_SERVER='sqlserver-host-or-ip,1433'
export RESERVA_SQLSERVER_DATABASE='database_name'
export RESERVA_SQLSERVER_USER='database_user'
export RESERVA_SQLSERVER_PASSWORD='database_password'

# Legacy login key: set the actual value only in private credentials.sh.
export SECRET_KEY_LOGIN='replace-with-login-key'

# Encrypt defaults to yes. TrustServerCertificate defaults to no.
# Set TrustServerCertificate=yes only if the server certificate is not trusted.
export RESERVA_SQLSERVER_ENCRYPT='no'
export RESERVA_SQLSERVER_TRUST_SERVER_CERTIFICATE='yes'

# Container-only compatibility for obsolete TLS 1.0. Prefer TLS 1.2+.
# Set to 1 explicitly only for the legacy database; see ../CONTAINERS.md.
export RESERVA_ALLOW_LEGACY_TLS='1'

# Comma-separated browser origins allowed to call the API.
export RESERVA_CORS_ORIGINS='http://localhost:4200'

export SECRET_KEY_LOGIN='your-secret-key-login'
