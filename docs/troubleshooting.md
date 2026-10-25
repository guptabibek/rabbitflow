# Troubleshooting

| Symptom | Diagnosis and next step |
| --- | --- |
| Prisma download 403 | Permit binaries.prisma.sh in environment network settings and retry generate; keep checksum/TLS verification enabled |
| Project table missing during db:push | Prepare hook assumes an initialized database; use migrations on a fresh empty database |
| Search returns nothing after db push | SQL migrations supply tsvector triggers; recreate only a disposable database and initialize via migrate deploy |
| App healthy but no admin | Entrypoint continues after failed seed; inspect logs, fix administrator variables and rerun seed deliberately |
| Integration suite contaminates dev data | Both DATABASE_URL and TEST_DATABASE_URL must select the same separate disposable test database |
| Redis readiness failure | Check URL/password and network reachability; if intentionally omitted natively, remove all Redis bindings |
| Password reset mail missing | Check SMTP reachability/authentication, from address and TLS; do not disable certificate verification |
| Uploads disappear after local container rebuild | Evaluation Compose lacks an app uploads volume; production Compose has one |
| npm run start fails | Build first; current command is next start, while Docker uses the standalone server.js entrypoint; Bun is not required |
| Production nginx rejects hostname | APP_DOMAIN is a hostname without scheme/path/port; APP_URL is the full HTTPS origin |

Report sanitized logs and exact command/version information. Never attach cookies, populated environment files, tokens, dumps or real user data. See [support](../SUPPORT.md).
