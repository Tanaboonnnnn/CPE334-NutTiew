#!/usr/bin/env bash
# NutTiew local Compose PostgreSQL bootstrap (GH-02, Issue #61).
# Runs ONCE by the docker-entrypoint on the first creation of a fresh volume,
# as the POSTGRES_USER superuser. Creates the distinct migration/admin and
# runtime roles, hands the nuttiew database and public schema to the owner, and
# pre-installs the trusted extensions used by the NutTiew migrations.
#
# Secrets (passwords) come from container environment variables supplied by
# docker-compose.yml interpolation; nothing is hard-coded here.
set -euo pipefail

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}"
: "${DB_OWNER_PASSWORD:?DB_OWNER_PASSWORD must be set}"
: "${DB_RUNTIME_PASSWORD:?DB_RUNTIME_PASSWORD must be set}"

# --- Credential validation (fail closed; never echoes credential values) -----
# .env.example contains placeholders such as REPLACE_WITH_PRIVATE_OWNER_PASSWORD.
# Reject any documented placeholder so a copied example can never be accepted as
# a real secret. DB_OWNER_PASSWORD and DB_RUNTIME_PASSWORD are embedded in SQL
# and in postgresql:// connection strings, so they must be 16-64 URL-safe
# characters ([A-Za-z0-9_-]); generate e.g. `openssl rand -hex 32`.
contains_placeholder() { case "$1" in *REPLACE_WITH_*) return 0 ;; *) return 1 ;; esac; }

# Whole-string Bash regex (not grep): anchors against the ENTIRE value so a
# multiline password cannot sneak past with a valid first line + newline + junk.
valid_urlsafe() { [[ "$1" =~ ^[A-Za-z0-9_-]{16,64}$ ]]; }

credential_error() {
  echo "Invalid database password configuration." >&2
  echo "POSTGRES_PASSWORD, DB_OWNER_PASSWORD and DB_RUNTIME_PASSWORD must each" >&2
  echo "  - be set" >&2
  echo "  - NOT be a .env.example placeholder (REPLACE_WITH_...)" >&2
  echo "  - be pairwise distinct from the other two" >&2
  echo "DB_OWNER_PASSWORD and DB_RUNTIME_PASSWORD must additionally be 16-64" >&2
  echo "URL-safe characters ([A-Za-z0-9_-]). Generate strong hex, e.g.:" >&2
  echo "  openssl rand -hex 32" >&2
  exit 1
}

# Non-empty + not placeholders for all three.
for pw in "$POSTGRES_PASSWORD" "$DB_OWNER_PASSWORD" "$DB_RUNTIME_PASSWORD"; do
  [ -n "$pw" ] || credential_error
  if contains_placeholder "$pw"; then credential_error; fi
done

# Pairwise distinct between superuser, owner and runtime roles.
[ "$POSTGRES_PASSWORD" != "$DB_OWNER_PASSWORD" ] || credential_error
[ "$POSTGRES_PASSWORD" != "$DB_RUNTIME_PASSWORD" ] || credential_error
[ "$DB_OWNER_PASSWORD" != "$DB_RUNTIME_PASSWORD" ] || credential_error

# Strong URL-safe format for the two roles used in connection URLs/Role DDL.
valid_urlsafe "$DB_OWNER_PASSWORD" || credential_error
valid_urlsafe "$DB_RUNTIME_PASSWORD" || credential_error

# Validated URL-safe charset cannot contain quotes/semicolons; escaping single
# quotes is kept as defense-in-depth.
owner_pw="${DB_OWNER_PASSWORD//\'/\'\'}"
runtime_pw="${DB_RUNTIME_PASSWORD//\'/\'\'}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nuttiew_owner') THEN
    CREATE ROLE nuttiew_owner LOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
      PASSWORD '${owner_pw}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nuttiew_runtime') THEN
    CREATE ROLE nuttiew_runtime LOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
      PASSWORD '${runtime_pw}';
  END IF;
END
\$\$;
SQL

# Give the migration/admin role ownership so its migrations can create schema
# objects, exclusion constraints and extensions; pre-install trusted extensions
# so non-owner migrations pass idempotently (mirrors README Step A).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname nuttiew <<SQL
ALTER DATABASE nuttiew OWNER TO nuttiew_owner;
ALTER SCHEMA public OWNER TO nuttiew_owner;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
SQL

echo "NutTiew DB roles/bootstrap ready (nuttiew_owner + nuttiew_runtime)."