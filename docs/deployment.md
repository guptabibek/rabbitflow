# Deployment, upgrades and recovery

Status: runbook prepared from code inspection; a clean full-stack deployment remains a release gate. Use a staging machine and disposable data before production.

## Production Compose

1. Copy `.env.example` to `.env.production` (there is no `.env.production.example`). Fill in APP_DOMAIN, APP_URL, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, DATABASE_URL, REDIS_PASSWORD, JWT_SECRET and CRON_SECRET. DATABASE_URL must use the internal `postgres` host and matching credentials. Use independently generated secrets; hexadecimal passwords avoid URL escaping mistakes.
2. Configure MFA_ENCRYPTION_KEY and working SMTP; preserve the encryption key in encrypted backups. Set the real public origin in APP_URL. Do not assume `rabbitflow.rabbittech.com.np` exists.
3. For first bootstrap only, set RUN_BOOTSTRAP_SEED=true and your administrator fields. Validate without exposing interpolated values: `docker compose -f docker-compose.production.yml --env-file .env.production config --quiet`.
4. Run `docker compose -f docker-compose.production.yml --env-file .env.production up -d --build`. The entrypoint runs migrations before serving. Inspect app logs for migrations and seed failure; then verify login and creation of a work item, not only health.
5. Terminate HTTPS at an external edge proxy. The Compose nginx listens on HTTP (default host port 3999); firewall this origin so clients cannot bypass the TLS edge. Configure the edge's forwarding headers intentionally; inspect `docker/nginx.production.conf.template`.
6. Verify `/api/health/live` and `/api/health/ready` through the edge and locally. Disable bootstrap after successful administrator verification. Configure monitoring and verify cron execution without logging the secret.

Database and Redis are on an internal-only network without published host ports. App uploads persist in `app_uploads` at `/app/var/uploads`. The stack is a single-host deployment, not an HA guarantee. An internal-only Redis network also means application outbound SMTP/HTTPS must be validated through the app's edge network.

## Back up before every upgrade

Use a private backup directory with restricted permissions. From the repository root, with the existing production environment file:

```bash
umask 077
mkdir -p backups
docker compose -f docker-compose.production.yml --env-file .env.production exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/rabbitflow.dump
```

Store the dump **outside the checkout**, encrypted and off-host; `backups/` is a temporary example location, not a storage policy. Back up the named uploads volume using your platform's snapshot facility while writes are stopped, and securely back up configuration and MFA encryption keys separately. Redis cache is not a substitute for PostgreSQL backups. Check the dump with `pg_restore --list` in a PostgreSQL 16 tool environment, then perform an actual restore drill.

## Restore drill

Provision an isolated PostgreSQL 16 server and empty database. Restore with `pg_restore --no-owner --exit-on-error --dbname="$RESTORE_DATABASE_URL" rabbitflow.dump`, using securely injected credentials. Never point RESTORE_DATABASE_URL at production. Restore uploads to a separate volume and configure an isolated app with the matching encryption/signing keys. Disable outbound mail, webhooks and cron during the drill. Confirm account access, project/work-item counts, attachments and search. Record the elapsed recovery time and evidence.

## Upgrade and rollback

Record the deployed commit/image digest, database schema version, environment configuration and volume names. Take and verify a backup. Build the target commit and rehearse migrations on a restored copy before rollout. Schedule downtime if the migration requires it; `restart: unless-stopped` is not a zero-downtime release strategy.

After rollout verify readiness, sign-in/MFA, project permissions, work-item edit, attachments, search and cron. Keep the previous immutable image. Roll back the application only if its schema remains compatible; Prisma has no automatic down migrations. Otherwise restore database **and uploads** from a mutually consistent backup during a maintenance window. Never use `db reset`, `docker:reset` or `down -v` to repair an upgrade.
