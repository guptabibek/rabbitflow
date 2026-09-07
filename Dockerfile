FROM node:20-bookworm-slim AS base

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && groupadd --system nextjs \
  && useradd --system --gid nextjs --create-home --home-dir /home/nextjs nextjs \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci --include=dev

FROM deps AS builder

COPY . .
RUN npm run db:generate
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
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY docker/entrypoint.sh /entrypoint.sh

RUN install -d -o nextjs -g nextjs \
    /app/var/uploads \
    /app/var/uploads/attachments \
    /app/var/uploads/avatars \
  && sed -i 's/\r$//' /entrypoint.sh \
  && chmod +x /entrypoint.sh

EXPOSE 3000

# Readiness, so a container that has lost Postgres or Redis is reported
# unhealthy rather than left serving traffic it cannot complete. Compose
# overrides this with its own check; this covers a plain `docker run`.
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

USER nextjs

ENTRYPOINT ["/entrypoint.sh"]
