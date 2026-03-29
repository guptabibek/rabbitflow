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
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev

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

RUN mkdir -p /app/public/uploads/attachments /app/public/uploads/avatars \
  && chmod +x /entrypoint.sh \
  && chown -R nextjs:nextjs /app /entrypoint.sh /home/nextjs

EXPOSE 3000

USER nextjs

ENTRYPOINT ["/entrypoint.sh"]
