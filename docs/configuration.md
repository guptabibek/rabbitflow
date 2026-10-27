# Configuration reference

[.env.example](../.env.example) is the complete native environment contract; [.env.docker.example](../.env.docker.example) covers local Docker. Keep values private and never commit populated files. Prisma CLI reads `.env`; Next.js can also read `.env.local`, whose precedence can otherwise create mismatched database targets.

| Variable | Purpose / operating rule |
| --- | --- |
| DATABASE_URL | PostgreSQL URL; URL-encode special password characters |
| JWT_SECRET | Independently generated signing key, at least 32 bytes; rotation ends sessions |
| CRON_SECRET | Independent scheduled-job key; required in production |
| APP_TRUSTED_PROXY_CIDR | Exact IPv4 proxy source/CIDR trusted by production nginx; defaults to loopback only. Never trust all clients. |
| APP_URL | Actual public origin used in email links; no assumed launch hostname |
| NEXT_PUBLIC_APP_URL | Browser-visible origin; never place secrets in NEXT_PUBLIC variables |
| REDIS_URL | Optional natively; if configured, readiness requires successful Redis ping |
| REDIS_PASSWORD | Required by production Compose; use URL-safe hex if interpolating into a URL |
| MFA_ENCRYPTION_KEY | Recommended 32-byte hex/base64 key for stored MFA secrets; back up securely |
| SMTP_HOST/PORT/SECURE/USER/PASS/FROM | Mail transport; password resets cannot deliver without it |
| SMTP_TLS_REJECT_UNAUTHORIZED | Keep true; never weaken TLS checks |
| RUN_BOOTSTRAP_SEED | Enable deliberately for first administrator, then disable |
| SEED_ADMIN_EMAIL/NAME/PASSWORD | Owner-supplied bootstrap identity; never a shared demo credential |
| ALLOW_SELF_REGISTRATION | False by default; enable only after access-policy review |
| ALLOW_HEADER_AUTH | Development bypass; must never be enabled in exposed environments |
| UPLOAD_DIR | Native default is outside public assets; production uses /app/var/uploads |
| DATABASE_CONNECTION_LIMIT | Pool tuning, not an unlimited concurrency guarantee |

Production Compose also requires APP_DOMAIN (hostname only), POSTGRES_DB, POSTGRES_USER and POSTGRES_PASSWORD. Keep DATABASE_URL consistent with those settings using service host `postgres`. See [deployment](deployment.md).

Older comments in the environment template and health handlers attribute MFA challenges to Redis; current `auth-otp.ts` persists them in AuthChallenge rows. Readiness still treats an explicitly configured Redis as required. Do not infer a supported outage guarantee from fallback behavior alone.

The final audit confirmed MFA_REQUIRE_ENROLLMENT=true in production Compose challenges even the bootstrap administrator. Complete the authenticator enrollment shown by the login page; a password response alone is not a session. Keep the policy enabled.
