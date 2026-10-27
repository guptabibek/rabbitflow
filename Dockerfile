# Node 22, not 20: `scripts/seed-bootstrap.mjs` imports TypeScript directly and
# runs under `--experimental-strip-types`, which does not exist before 22.6. The
# repo's own `npm test` needs it too, so 20 could not run the code it shipped.
FROM node:26-bookworm-slim AS base

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && groupadd --system nextjs \
  && useradd --system --gid nextjs --create-home --home-dir /home/nextjs nextjs \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY package.json package-lock.json ./
# Optional corporate/network CA is a BuildKit secret, never retained in an image layer.
RUN --mount=type=secret,id=network_ca \
    if [ -f /run/secrets/network_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/network_ca; fi; \
    npm ci --include=dev

FROM deps AS builder

COPY . .
RUN --mount=type=secret,id=network_ca \
    if [ -f /run/secrets/network_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/network_ca; fi; \
    npm run db:generate
RUN npm run build

FROM base AS runner

WORKDIR /app

COPY package.json package-lock.json ./

# `output: "standalone"` already emits the exact runtime node_modules the server
# needs. Copying the full dependency tree and then pruning it duplicated that
# work and inflated the image; only the Prisma engine and CLI are added on top,
# because migrations run from the entrypoint.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# The migration CLI, installed into its own prefix.
#
# Copying node_modules/prisma across from the builder looked like it was enough
# and was not: the CLI has its own runtime dependencies — `effect` among them —
# which the standalone trace never emits, so it failed with
# "Cannot find module 'effect'". `npx prisma` failed even earlier, with
# "sh: 1: prisma: not found", because node_modules/.bin was not copied either.
#
# Installing it under /opt keeps it away from the app's traced node_modules,
# where a stray copy of @prisma/client could shadow the generated one. The
# version is read from package-lock.json so it matches what the build used,
# rather than drifting to whatever the range resolves to today.
RUN --mount=type=secret,id=network_ca \
    if [ -f /run/secrets/network_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/network_ca; fi; \
    node -e 'const fs=require("fs");const root=require("./package.json");const version=require("./package-lock.json").packages["node_modules/prisma"].version;fs.mkdirSync("/opt/prisma-cli",{recursive:true});fs.writeFileSync("/opt/prisma-cli/package.json",JSON.stringify({private:true,dependencies:{prisma:version},overrides:root.overrides}));' \
  && npm install --omit=dev --no-fund --prefix /opt/prisma-cli \
  && npm audit --omit=dev --audit-level=low --prefix /opt/prisma-cli \
  && npm cache clean --force

# Needed only by the optional bootstrap seed, which runs as a plain script
# rather than through the built server:
#   - it imports `../src/lib/domain/*.ts` (a closed set of six files, ~50 KB)
#   - it imports bcryptjs, which the standalone trace inlines into the server
#     bundle and so does not emit as a package
# Without these the seed fails with MODULE_NOT_FOUND the moment anyone sets
# RUN_BOOTSTRAP_SEED=true, which the development compose file does by default.
COPY --from=builder /app/src/lib/domain ./src/lib/domain
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

COPY docker/entrypoint.sh /entrypoint.sh

RUN install -d -o nextjs -g nextjs \
    /app/var/uploads \
    /app/var/uploads/attachments \
    /app/var/uploads/avatars \
  && sed -i 's/\r$//' /entrypoint.sh \
  && chmod 0755 /entrypoint.sh \
  && chmod 0644 /app/package.json /app/package-lock.json /app/next.config.ts \
  && find /app/public /app/prisma /app/scripts /app/src/lib/domain -type d -exec chmod 0755 {} + \
  && find /app/public /app/prisma /app/scripts /app/src/lib/domain -type f -exec chmod 0644 {} +

EXPOSE 3000

# Readiness, so a container that has lost Postgres or Redis is reported
# unhealthy rather than left serving traffic it cannot complete. Compose
# overrides this with its own check; this covers a plain `docker run`.
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

USER nextjs

ENTRYPOINT ["/entrypoint.sh"]
