#!/usr/bin/env bash
# Corre las pruebas SQL en orden contra un Postgres 16 (local o de CI). Uso: PGHOST=/tmp PGPORT=5499 PGUSER=postgres test/run-sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PGHOST:=/tmp}" "${PGPORT:=5499}" "${PGUSER:=postgres}"
export PGHOST PGPORT PGUSER
esperar() { local f=$1 n=$2; local got; got=$(psql -q -v ON_ERROR_STOP=0 -f "$f" 2>&1 | grep -c '^psql:.*ERROR' || true); if [ "$got" != "$n" ]; then echo "✗ $f: $got errores (se esperaban $n)"; psql -q -f "$f" 2>&1 | grep '^psql:.*ERROR' || true; exit 1; fi; echo "✓ $f ($n errores esperados)"; }
esperar test/schema2.test.sql 9
esperar test/schema3.test.sql 6
esperar test/schema6.test.sql 7
esperar test/schema11.test.sql 7
esperar test/schema12.test.sql 0
esperar test/schema13.test.sql 0
esperar test/schema14.test.sql 5
