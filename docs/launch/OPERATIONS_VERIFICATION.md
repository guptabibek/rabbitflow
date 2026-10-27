# Operational verification and remaining live checks

The remediation used synthetic data and loopback-only containers. It did not deploy to or modify https://devops.rabbittech.com.np/. That URL was supplied by the owner for read-only verification, not as a public anonymous demo.

## Verified locally

- Nodemailer 10.2.1 delivered authenticated mail with implicit TLS and STARTTLS to a synthetic sink. Untrusted certificates, missing STARTTLS and production settings disabling TLS were rejected. No verification bypass was used.
- Password-reset route handlers delivered a real TLS email, consumed its OTP, changed the synthetic account's password, rejected OTP reuse and revoked previous sessions against a disposable PostgreSQL database.
- Redis-free direct mail and a configured BullMQ worker both delivered over verified TLS.
- A local TLS edge and the production nginx template returned readiness 200. The trusted edge caused Secure, HttpOnly, SameSite cookies; an untrusted HTTP caller spoofing X-Forwarded-Proto=https did not control Secure.
- A signed backup containing PostgreSQL, upload files and runtime keys/configuration was encrypted using OpenSSL CMS AES-256-GCM. Decryption and signature verification recovered byte-identical content. Modified ciphertext was rejected.
- Recovery used a **new** database and upload volume. The recovered app served the original attachment bytes to the original session, rejected anonymous reads, and completed TOTP login using the recovered MFA encryption key. The source data was not reset or overwritten.
- A fresh evaluation Compose project also completed mandatory admin MFA with an encrypted seed, work-item creation, authenticated cron and restart persistence. Both Compose stacks now reject a missing MFA encryption key. Preserve the existing key during upgrades; never regenerate it as a routine restart step.
- A 10,001-issue restored synthetic dataset completed a paced 60-second/four-worker baseline (1500ms think time): 142 HTTP 200 responses, no failures, p75 224ms and p95 667.2ms. An earlier unpaced run failed the error budget with 57 HTTP 429 responses out of 582 requests. Those were the report endpoint's 60/minute limit per client/user, not treated as successes. Neither run establishes production multi-user capacity.

These checks demonstrate the implementation path. They do not establish off-host durability, an operator's recovery time objective, external SMTP deliverability, or the actual live domain's proxy/secret configuration.

## Trusted TLS edge configuration

Set `APP_TRUSTED_PROXY_CIDR` to the exact IPv4 address/CIDR of the proxy connecting to Docker nginx. Its default `127.0.0.1/32` does not trust arbitrary network clients. Startup rejects `/0` (trust-all) CIDRs; do not use an unreviewed broad network. The edge must overwrite X-Forwarded-For and X-Forwarded-Proto using its actual connection information. Do not append untrusted client forwarding values.

The nginx realip module accepts client identity only from that CIDR. Protocol mapping then accepts https only from the actual trusted peer. Direct callers retain the actual scheme. Validate nginx with `docker compose -f docker-compose.production.yml --env-file .env.production config --quiet` and inspect startup's `nginx -t` result.

Verify both trusted HTTPS and an untrusted spoof before exposing an origin. Restrict the HTTP origin to the TLS edge at the host firewall. The owner must supply the real edge source address; this work does not guess the deployed CIDR.

## Signed encrypted backup procedure

Use a maintenance window or a consistent snapshot to stop application/cron writes while collecting the database and upload volume. Use restrictive temporary directories (`umask 077`). Follow [deployment.md](../deployment.md) for pg_dump and record the exact code/image and volume names.

The following cryptographic steps were exercised with dedicated synthetic certificates. Production must use approved signing/recovery keys, stored separately from the backup destination; never use the one-day test certificates. Variables below name private local files, never literal key material:

```bash
# bundle.tar contains database.dump, uploads.tar and protected runtime configuration.
openssl cms -sign -binary -nodetach -in bundle.tar \
  -signer "$BACKUP_SIGNING_CERT" -inkey "$BACKUP_SIGNING_KEY" \
  -outform DER -out signed.der
openssl cms -encrypt -binary -aes-256-gcm -in signed.der \
  -outform DER -out backup.cms "$BACKUP_RECIPIENT_CERT"

# In an isolated recovery environment, verify every exit status before extraction.
openssl cms -decrypt -binary -inform DER -in backup.cms \
  -recip "$BACKUP_RECIPIENT_CERT" -inkey "$BACKUP_RECIPIENT_KEY" -out recovered-signed.der
openssl cms -verify -binary -inform DER -in recovered-signed.der \
  -CAfile "$BACKUP_SIGNING_TRUST" -out recovered-bundle.tar
```

`BACKUP_SIGNING_TRUST` must explicitly trust the approved signer/chain. The audit used a dedicated self-signed signing certificate as its pinned trust anchor. Keep certificate lifetime, rotation and long-term verification in the operating policy. Never use `-noverify`, disable TLS, or consume partially decrypted output after a failure.

Only after signature verification should the bundle be extracted and PostgreSQL restored into a new empty database (`pg_restore --no-owner --exit-on-error`). Restore uploads into a new volume with their original ownership. Reuse the corresponding JWT/MFA keys, disable outbound integrations during the drill, and start the app using the production Compose environment (including `HOSTNAME=0.0.0.0`). Check session access, attachment bytes, anonymous denial and TOTP before accepting recovery.

An encrypted file in this same cloud machine is **not** an off-host backup. The remaining owner input is the storage provider/bucket/path, approved access binding, retention policy and separate key custody. No upload, production restore or live-data operation is authorized by this runbook.

## Live deployment observation

The `Read-only deployment observation` workflow checks only GET requests to `/`, `/login`, `/api/health/live` and `/api/health/ready` on the owner-provided hostname. It uses normal TLS validation, sends no credentials, does not dump response pages/cookies and does not infer the deployed commit from green CI. Its result must be read before claiming live health.

A private/edge-restricted deployment may reject the runner; that would leave observation blocked, not prove an application defect. Authenticated live workflows, SMTP inbox delivery, off-host upload and any production restore need a specific approved target and credentials in secure environment settings. Do not send passwords, tokens or private keys in chat.

On 2026-10-27, [run 40439026932](https://github.com/guptabibek/rabbitflow/actions/runs/40439026932) passed from GitHub's runner: `/` returned 307 to `/login`; `/login`, liveness and readiness returned 200; certificate validation and HSTS were present; readiness confirmed database/Redis. This does not identify the deployed commit or prove authenticated operations. The initial exact-match nosniff detector was inconclusive for potentially combined proxy/application header values; it now parses comma-separated values before any header conclusion is recorded.
