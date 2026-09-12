#!/bin/sh
set -eu

# The CLI lives under its own prefix, installed by the Dockerfile with its
# dependencies intact. `npx prisma` used to be used here and failed on every
# start with "sh: 1: prisma: not found", because the runtime image has no
# node_modules/.bin; invoking the entry point directly needs no shim and never
# reaches for the network at boot.
#
# --schema is explicit so the command does not depend on the working directory.
PRISMA_CLI="/opt/prisma-cli/node_modules/prisma/build/index.js"

echo "Running Prisma migrations..."
node "$PRISMA_CLI" migrate deploy --schema=/app/prisma/schema.prisma

if [ "${RUN_BOOTSTRAP_SEED:-false}" = "true" ]; then
	echo "Running bootstrap seed..."

	# Optional, and idempotent when it succeeds. A failure here must not become
	# a restart loop that takes nginx and cron down with it, so report it and
	# carry on serving.
	if ! npm run db:seed:bootstrap; then
		echo "WARNING: bootstrap seed failed; starting without it." >&2
		echo "         Create the first administrator manually." >&2
	fi
fi

echo "Starting RabbitFlow..."
exec node server.js
