# Public demo decision and isolation plan

Current decision: **do not expose an anonymous app workspace**. The proxy requires sessions and route/domain authorization checks derive identity. A Viewer project role does not prove all global/user/self-service endpoints are read-only. No authentication change is included in this branch.

A safe first evaluation is a local isolated install plus captioned video. For a public demo, choose a dedicated deployment and database with synthetic-only data, separate signing/encryption keys and upload volume, no production network access, no SMTP credentials and no outbound webhooks/integrations. Use a non-admin demo principal and validate every read/write endpoint reachable by that identity, including profile, uploads, token creation and project membership.

Preferred design: a separately reviewed server-side demo policy that rejects mutations outside an explicit safe allowlist; never trust disabled UI buttons. Keep administrator endpoints and seed routes inaccessible. Do not enable ALLOW_HEADER_AUTH or anonymous administrative sessions. Use a dedicated origin, HTTPS, resource quotas, rate limiting, input limits and logs without token/data capture.

Seed at least one example project, nested work items, backlog, board, sprint, workflow transitions and analytics from the real model. Put a prominent “Synthetic demo; do not enter personal data” notice on entry. Consider a read-only principal after the global-write audit; a disposable per-visitor sandbox is more expensive and needs separate abuse controls.

For resettable demos, define an owner-approved reset window, freeze writes during reset, restore a versioned synthetic snapshot and recreate sessions. Test concurrent users, cross-project access, expired/replayed sessions, forbidden writes, resource exhaustion and reset recovery. Monitor readiness and rate-limit events; keep customer traffic entirely separate.

Required owner decisions: hosting/budget, domain/TLS, reset policy, retention/privacy notice, on-call ownership and any auth-policy implementation. Acceptance evidence: anonymous boundary test, mutation-denial matrix, no real secrets/data in snapshot, reset drill and network egress audit. Do not advertise a live demo until those pass.
