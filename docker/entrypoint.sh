#!/bin/sh
set -eu

echo "Running Prisma migrations..."
npx prisma migrate deploy

if [ "${RUN_BOOTSTRAP_SEED:-true}" = "true" ]; then
	echo "Running bootstrap seed..."
	npm run db:seed:bootstrap
fi

echo "Starting RabbitFlow..."
exec node server.js
