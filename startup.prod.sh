#!/usr/bin/env bash
set -e

# Wait for database to be ready
/opt/wait-for-it.sh "${DATABASE_HOST:-postgres}:5432" --timeout=60 --strict -- echo "Database is up"

# Run migrations
npm run migration:run

# Push schema updates (for cases where db push was used instead of migrations)
npm run schema:push

# Seed initial database records
npm run prisma:seed

# Start backend prod server
npm run start:prod
