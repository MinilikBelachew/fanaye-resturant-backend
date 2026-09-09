#!/bin/sh
set -eu

psql \
  --set=ON_ERROR_STOP=1 \
  --set=app_user="$POSTGRES_USER" \
  --set=app_database="$POSTGRES_DB" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<-'SQL'
	ALTER SCHEMA public OWNER TO :"app_user";
	GRANT ALL ON SCHEMA public TO :"app_user";
	GRANT ALL ON DATABASE :"app_database" TO :"app_user";
SQL
