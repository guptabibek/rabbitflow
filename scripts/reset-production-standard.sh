#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="${ROOT_DIR:-/opt/rabbitflow}"
cd "$ROOT_DIR"

COMPOSE=(docker compose -f docker-compose.production.yml --env-file .env.production)
services_stopped=false
database_changed=false
reset_completed=false
backup_file=""

cleanup() {
  local rc=$?
  trap - EXIT

  unset SEED_ADMIN_EMAIL SEED_ADMIN_NAME SEED_ADMIN_PASSWORD
  unset SEED_CREATE_PROJECT SEED_PROJECT_KEY SEED_PROJECT_NAME
  unset SEED_PROJECT_DESCRIPTION SEED_PROJECT_COLOR SEED_PROJECT_ICON
  unset SEED_ORGANIZATION_NAME SEED_PRODUCT_NAME SEED_SUPPORT_EMAIL SEED_CUSTOM_DOMAIN
  unset confirm_password confirmation

  if [[ "$rc" -ne 0 && "$database_changed" == "true" && "$reset_completed" == "false" && -s "$backup_file" ]]; then
    echo "Reset failed after the database was changed. Restoring $backup_file..." >&2
    "${COMPOSE[@]}" stop nginx cron app || true

    if "${COMPOSE[@]}" exec -T postgres sh -lc \
      'pg_restore --clean --if-exists --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
      < "$backup_file"; then
      echo "Database rollback completed." >&2
      "${COMPOSE[@]}" exec -T redis sh -lc \
        'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" FLUSHDB' >/dev/null || true
    else
      echo "AUTOMATIC ROLLBACK FAILED. Preserve this backup: $backup_file" >&2
    fi

    services_stopped=true
  fi

  if [[ "$services_stopped" == "true" ]]; then
    echo "Reset did not finish. Restarting application services..." >&2
    "${COMPOSE[@]}" up -d app nginx cron || true
  fi

  exit "$rc"
}
trap cleanup EXIT

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

read_default() {
  local variable_name=$1
  local prompt=$2
  local default_value=$3
  local entered

  read -r -p "$prompt [$default_value]: " entered
  printf -v "$variable_name" '%s' "${entered:-$default_value}"
}

[[ -f .env.production ]] || fail "Missing $ROOT_DIR/.env.production"
[[ -f docker-compose.production.yml ]] || fail "Missing docker-compose.production.yml"
[[ -f scripts/seed-production-standard.cjs ]] || fail "Missing scripts/seed-production-standard.cjs"

command -v docker >/dev/null || fail "Docker is unavailable"
command -v curl >/dev/null || fail "curl is unavailable"
command -v sha256sum >/dev/null || fail "sha256sum is unavailable"

"${COMPOSE[@]}" config --quiet

database_line="$(grep -E '^DATABASE_URL=' .env.production | tail -n 1)"
[[ -n "$database_line" ]] || fail "DATABASE_URL is missing"
[[ "$database_line" == *"@postgres:5432/rabbitflow?schema=public"* ]] ||
  fail "DATABASE_URL does not target postgres:5432/rabbitflow"

if grep -Eiq '^RUN_BOOTSTRAP_SEED=(true|1|yes)([[:space:]]*)$' .env.production; then
  fail "Set RUN_BOOTSTRAP_SEED=false in .env.production before running this script"
fi

read_default SEED_ADMIN_EMAIL "Admin email" "rabbittech46@gmail.com"
read_default SEED_ADMIN_NAME "Admin name" "RabbitFlow Admin"
read_default SEED_ORGANIZATION_NAME "Organization name" "Rabbit Tech"
read_default SEED_PRODUCT_NAME "Product name" "RabbitFlow"
read_default SEED_PROJECT_NAME "Initial project name" "Product Development"
read_default SEED_PROJECT_KEY "Initial project key (2-10 uppercase letters)" "RABBIT"
read_default SEED_PROJECT_DESCRIPTION "Project description" "Product discovery, engineering, quality, and release delivery."
read_default SEED_PROJECT_COLOR "Project color" "#1d4ed8"
read_default SEED_SUPPORT_EMAIL "Support email" "$SEED_ADMIN_EMAIL"

configured_domain="$(
  sed -n 's/^APP_DOMAIN=//p' .env.production |
    tail -n 1 |
    tr -d "\"'"
)"
read_default SEED_CUSTOM_DOMAIN "Application domain" "$configured_domain"

SEED_PROJECT_KEY="${SEED_PROJECT_KEY^^}"
SEED_PROJECT_ICON="Layers3"
SEED_CREATE_PROJECT=true

[[ "$SEED_ADMIN_EMAIL" == *@* ]] || fail "Invalid admin email"
[[ "$SEED_SUPPORT_EMAIL" == *@* ]] || fail "Invalid support email"
[[ -n "$SEED_ADMIN_NAME" ]] || fail "Admin name cannot be empty"
[[ -n "$SEED_ORGANIZATION_NAME" ]] || fail "Organization name cannot be empty"
[[ "$SEED_PROJECT_KEY" =~ ^[A-Z]{2,10}$ ]] || fail "Project key must contain 2-10 uppercase letters"
[[ "$SEED_PROJECT_COLOR" =~ ^#[0-9A-Fa-f]{6}$ ]] || fail "Project color must be a six-digit hex color"
[[ "$SEED_CUSTOM_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || fail "Application domain is invalid"

read -r -s -p "Admin password (minimum 12 characters): " SEED_ADMIN_PASSWORD
echo
read -r -s -p "Confirm admin password: " confirm_password
echo

[[ ${#SEED_ADMIN_PASSWORD} -ge 12 ]] || fail "Admin password must contain at least 12 characters"
[[ "$SEED_ADMIN_PASSWORD" == "$confirm_password" ]] || fail "Passwords do not match"
unset confirm_password

echo
echo "This will permanently reset the VPS database and seed:"
echo "  Organization: $SEED_ORGANIZATION_NAME"
echo "  Project:      $SEED_PROJECT_KEY — $SEED_PROJECT_NAME"
echo "  Admin:        $SEED_ADMIN_EMAIL"
echo "  Teams:        none"
echo "  Work items:   none"
echo
read -r -p "Type 'RESET rabbitflow' to continue: " confirmation
[[ "$confirmation" == "RESET rabbitflow" ]] || fail "Confirmation did not match"
unset confirmation

export SEED_ADMIN_EMAIL SEED_ADMIN_NAME SEED_ADMIN_PASSWORD
export SEED_CREATE_PROJECT SEED_PROJECT_KEY SEED_PROJECT_NAME
export SEED_PROJECT_DESCRIPTION SEED_PROJECT_COLOR SEED_PROJECT_ICON
export SEED_ORGANIZATION_NAME SEED_PRODUCT_NAME SEED_SUPPORT_EMAIL SEED_CUSTOM_DOMAIN

echo "Checking production services..."
"${COMPOSE[@]}" ps

echo "Stopping application-facing services..."
"${COMPOSE[@]}" stop nginx cron app
services_stopped=true

backup_dir="$ROOT_DIR/var/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_dir/rabbitflow-before-standard-seed-$timestamp.dump"
install -d -m 700 "$backup_dir"

echo "Creating rollback backup..."
"${COMPOSE[@]}" exec -T postgres sh -lc \
  'pg_dump -Fc --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$backup_file"
[[ -s "$backup_file" ]] || fail "Database backup is empty"
chmod 600 "$backup_file"
sha256sum "$backup_file"

echo "Resetting schema and applying migrations..."
database_changed=true
"${COMPOSE[@]}" run --rm -T --no-deps --entrypoint node app \
  /opt/prisma-cli/node_modules/prisma/build/index.js \
  migrate reset --force --skip-seed --skip-generate --schema=/app/prisma/schema.prisma

echo "Creating administrator, project, core types, fields, and onboarding configuration..."
"${COMPOSE[@]}" run --rm -T --no-deps \
  -e SEED_ADMIN_EMAIL -e SEED_ADMIN_NAME -e SEED_ADMIN_PASSWORD \
  -e SEED_CREATE_PROJECT -e SEED_PROJECT_KEY -e SEED_PROJECT_NAME \
  -e SEED_PROJECT_DESCRIPTION -e SEED_PROJECT_COLOR -e SEED_PROJECT_ICON \
  --entrypoint node app \
  --experimental-strip-types scripts/seed-bootstrap.mjs

echo "Installing production software-delivery workflows and organization masters..."
"${COMPOSE[@]}" run --rm -T --no-deps \
  -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD -e SEED_PROJECT_KEY \
  -e SEED_ORGANIZATION_NAME -e SEED_PRODUCT_NAME \
  -e SEED_SUPPORT_EMAIL -e SEED_CUSTOM_DOMAIN \
  --volume "$ROOT_DIR/scripts/seed-production-standard.cjs:/app/scripts/seed-production-standard.cjs:ro" \
  --entrypoint node app scripts/seed-production-standard.cjs

echo "Clearing obsolete sessions, queues, challenges, and caches..."
"${COMPOSE[@]}" exec -T redis sh -lc \
  'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" FLUSHDB'

echo "Current non-empty application tables:"
"${COMPOSE[@]}" exec -T postgres sh -lc \
  'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
CREATE TEMP TABLE seed_counts (table_name text PRIMARY KEY, row_count bigint NOT NULL);
DO $$
DECLARE
  table_record record;
  table_count bigint;
BEGIN
  FOR table_record IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', table_record.tablename) INTO table_count;
    INSERT INTO seed_counts(table_name, row_count) VALUES (table_record.tablename, table_count);
  END LOOP;
END
$$;
SELECT table_name, row_count FROM seed_counts WHERE row_count <> 0 ORDER BY table_name;
SELECT count(*) AS applied_migrations
FROM "_prisma_migrations"
WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
SQL

echo "Starting production services..."
"${COMPOSE[@]}" up -d app nginx cron

nginx_port="$(
  sed -n 's/^NGINX_PORT=//p' .env.production |
    tail -n 1 |
    tr -d "\"'"
)"
nginx_port="${nginx_port:-3999}"
[[ "$nginx_port" =~ ^[0-9]+$ ]] || fail "NGINX_PORT is invalid"

echo "Waiting for readiness..."
ready=false
for _ in $(seq 1 30); do
  if curl -fsS \
    -H "Host: $SEED_CUSTOM_DOMAIN" \
    "http://127.0.0.1:$nginx_port/api/health/ready" \
    >/dev/null; then
    ready=true
    break
  fi
  sleep 2
done
[[ "$ready" == "true" ]] || fail "Application did not become ready"

reset_completed=true
services_stopped=false

"${COMPOSE[@]}" ps

echo
echo "Production reset and standard seed completed."
echo "Backup: $backup_file"
echo "Admin: $SEED_ADMIN_EMAIL"
echo "Project: $SEED_PROJECT_KEY — $SEED_PROJECT_NAME"
echo "Teams, iterations, and work items remain empty."
