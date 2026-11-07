#!/bin/sh
# Runs once, when the postgres container initializes an empty data volume.
# Creates a separate database for automated API tests: "<POSTGRES_DB>_test".
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE DATABASE \"${POSTGRES_DB}_test\" OWNER \"$POSTGRES_USER\";"
