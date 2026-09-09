#!/usr/bin/env bash
set -e

# Wait for database to be ready
/opt/wait-for-it.sh "${DATABASE_HOST:-postgres}:5432" --timeout=60 --strict -- echo "Database is up"

# Run migrations
echo "Deploying Prisma database migrations..."
npx prisma migrate deploy || npx prisma db push --accept-data-loss

# Seed initial database records (enabled by default)
if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "Running database seeder..."
  npm run prisma:seed || echo "Notice: Seeder finished with notices or already seeded."
else
  echo "RUN_SEED is set to false, skipping seeder."
fi

# Start backend prod server
echo "Starting production NestJS server..."
npm run start:prod
